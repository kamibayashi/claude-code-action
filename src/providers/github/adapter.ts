/**
 * GitHub provider adapter that wraps existing GitHub functionality
 */

import type { Provider } from "../interface";
import type { ProviderContext, ProviderData } from "../types";
import { setupGitHubToken } from "../../github/token";
import { checkTriggerAction } from "../../github/validation/trigger";
import { checkHumanActor } from "../../github/validation/actor";
import { checkWritePermissions } from "../../github/validation/permissions";
import { createInitialComment } from "../../github/operations/comments/create-initial";
import { updateTrackingComment } from "../../github/operations/comments/update-with-branch";
import { setupBranch } from "../../github/operations/branch";
import {
  fetchGitHubData,
  type FetchDataResult,
} from "../../github/data/fetcher";
import { createOctokit } from "../../github/api/client";
import { parseGitHubContext } from "../../github/context";
import type { GitHubPullRequest, GitHubIssue } from "../../github/types";
import {
  updateCommentBody,
  type CommentUpdateInput,
} from "../../github/operations/comment-logic";
import { checkAndDeleteEmptyBranch } from "../../github/operations/branch-cleanup";
import { updateClaudeComment } from "../../github/operations/comments/update-claude-comment";
import { GITHUB_SERVER_URL } from "../../github/api/config";

export class GitHubProvider implements Provider {
  private octokit: any;
  private githubContext: any;

  async setupToken(): Promise<string> {
    const token = await setupGitHubToken();
    this.octokit = createOctokit(token);
    this.githubContext = parseGitHubContext();
    return token;
  }

  async checkTriggerAction(_context: ProviderContext): Promise<boolean> {
    return await checkTriggerAction(this.githubContext);
  }

  async checkHumanActor(_context: ProviderContext): Promise<void> {
    await checkHumanActor(this.octokit.rest, this.githubContext);
  }

  async checkWritePermissions(_context: ProviderContext): Promise<boolean> {
    return await checkWritePermissions(this.octokit.rest, this.githubContext);
  }

  async createInitialComment(_context: ProviderContext): Promise<number> {
    return await createInitialComment(this.octokit.rest, this.githubContext);
  }

  async updateTrackingComment(
    _context: ProviderContext,
    commentId: number,
    branchName?: string,
  ): Promise<void> {
    await updateTrackingComment(
      this.octokit,
      this.githubContext,
      commentId,
      branchName || "",
    );
  }

  async setupBranch(
    _data: ProviderData,
    context: ProviderContext,
  ): Promise<{
    baseBranch: string;
    currentBranch: string;
    claudeBranch?: string;
  }> {
    const githubData = await this.fetchGitHubData(
      `${context.repository.owner}/${context.repository.name}`,
      context.entityNumber.toString(),
      context.entityType === "issue",
    );

    return await setupBranch(this.octokit, githubData, this.githubContext);
  }

  async fetchData(
    repository: string,
    entityNumber: string,
    isIssue: boolean,
  ): Promise<ProviderData> {
    const githubData = await this.fetchGitHubData(
      repository,
      entityNumber,
      isIssue,
    );
    return await this.convertToProviderData(githubData, repository);
  }

  private async fetchGitHubData(
    repository: string,
    entityNumber: string,
    isIssue: boolean,
  ) {
    return await fetchGitHubData({
      octokits: this.octokit,
      repository,
      prNumber: entityNumber,
      isPR: !isIssue,
    });
  }

  private async convertToProviderData(
    githubData: FetchDataResult,
    repository: string,
  ): Promise<ProviderData> {
    const parts = repository.split("/");
    const owner = parts[0] || "";
    const name = parts[1] || "";

    // Fetch default branch
    const repoResponse = await this.octokit.rest.repos.get({
      owner,
      repo: name,
    });
    const defaultBranch = repoResponse.data.default_branch;

    // Check if contextData is a PR or Issue
    const isPR = "baseRefName" in githubData.contextData;

    if (isPR) {
      const pr = githubData.contextData as GitHubPullRequest;
      return {
        mergeRequest: {
          title: pr.title,
          description: pr.body,
          author: {
            username: pr.author.login,
          },
          sourceBranch: pr.headRefName,
          targetBranch: pr.baseRefName,
          headSha: pr.headRefOid,
          createdAt: pr.createdAt,
          additions: pr.additions,
          deletions: pr.deletions,
          state: pr.state,
          commits: pr.commits.nodes.map((node) => ({
            sha: node.commit.oid,
            message: node.commit.message,
            author: node.commit.author,
          })),
          files: pr.files.nodes.map((file) => ({
            path: file.path,
            additions: file.additions,
            deletions: file.deletions,
            changeType: file.changeType,
          })),
          comments: pr.comments.nodes.map((comment) => ({
            id: comment.id,
            body: comment.body,
            author: {
              username: comment.author.login,
            },
            createdAt: comment.createdAt,
          })),
          reviews: pr.reviews.nodes.map((review) => ({
            id: review.id,
            author: {
              username: review.author.login,
            },
            body: review.body,
            state: review.state,
            submittedAt: review.submittedAt,
            comments: review.comments.nodes.map((comment) => ({
              id: comment.id,
              body: comment.body,
              author: {
                username: comment.author.login,
              },
              createdAt: comment.createdAt,
              path: comment.path,
              line: comment.line,
            })),
          })),
        },
        repository: {
          owner,
          name,
          defaultBranch,
        },
      };
    } else {
      const issue = githubData.contextData as GitHubIssue;
      return {
        issue: {
          title: issue.title,
          description: issue.body,
          author: {
            username: issue.author.login,
          },
          createdAt: issue.createdAt,
          state: issue.state,
          comments: issue.comments.nodes.map((comment) => ({
            id: comment.id,
            body: comment.body,
            author: {
              username: comment.author.login,
            },
            createdAt: comment.createdAt,
          })),
        },
        repository: {
          owner,
          name,
          defaultBranch,
        },
      };
    }
  }

  async updateFinalComment(
    context: ProviderContext,
    commentId: number,
    options: {
      jobUrl: string;
      actionFailed: boolean;
      executionDetails?: {
        cost_usd?: number;
        duration_ms?: number;
        duration_api_ms?: number;
      } | null;
      branchName?: string;
      baseBranch?: string;
      triggerUsername?: string;
      errorDetails?: string;
    },
  ): Promise<void> {
    const owner = this.githubContext.repository.owner;
    const repo = this.githubContext.repository.repo;

    // Get current comment
    let comment;
    let isPRReviewComment = false;

    try {
      // Try as PR review comment first for certain events
      if (this.githubContext.eventName === "pull_request_review_comment") {
        const { data: prComment } =
          await this.octokit.rest.pulls.getReviewComment({
            owner,
            repo,
            comment_id: commentId,
          });
        comment = prComment;
        isPRReviewComment = true;
      } else {
        // Otherwise, use issue comment API
        const { data: issueComment } =
          await this.octokit.rest.issues.getComment({
            owner,
            repo,
            comment_id: commentId,
          });
        comment = issueComment;
      }
    } catch (error) {
      console.error("Error fetching comment:", error);
      throw error;
    }

    const currentBody = comment.body ?? "";

    // Check and delete empty branch if needed
    const { shouldDeleteBranch, branchLink } = await checkAndDeleteEmptyBranch(
      this.octokit,
      owner,
      repo,
      options.branchName,
      options.baseBranch || "main",
    );

    // Generate PR link if branch has changes
    let prLink = "";
    if (options.branchName && !shouldDeleteBranch && options.baseBranch) {
      const serverUrl = GITHUB_SERVER_URL;
      const entityType = context.entityType === "issue" ? "Issue" : "PR";
      const prTitle = encodeURIComponent(
        `${entityType} #${context.entityNumber}: Changes from Claude`,
      );
      const prBody = encodeURIComponent(
        `This PR addresses ${entityType.toLowerCase()} #${context.entityNumber}\n\nGenerated with [Claude Code](https://claude.ai/code)`,
      );
      const prUrl = `${serverUrl}/${owner}/${repo}/compare/${options.baseBranch}...${options.branchName}?quick_pull=1&title=${prTitle}&body=${prBody}`;
      prLink = `\n[Create a PR](${prUrl})`;
    }

    // Prepare input for updateCommentBody
    const commentInput: CommentUpdateInput = {
      currentBody,
      actionFailed: options.actionFailed,
      executionDetails: options.executionDetails || null,
      jobUrl: options.jobUrl,
      branchLink: shouldDeleteBranch ? undefined : branchLink,
      prLink,
      branchName: shouldDeleteBranch ? undefined : options.branchName,
      triggerUsername: options.triggerUsername,
      errorDetails: options.errorDetails,
    };

    const updatedBody = updateCommentBody(commentInput);

    // Update comment
    await updateClaudeComment(this.octokit.rest, {
      owner,
      repo,
      commentId,
      body: updatedBody,
      isPullRequestReviewComment: isPRReviewComment,
    });
  }
}

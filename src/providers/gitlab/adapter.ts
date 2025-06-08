/**
 * GitLab provider adapter
 */

import type { Provider } from "../interface";
import type { ProviderContext, ProviderData } from "../types";
import { createGitLabClient, type GitLabClient } from "../../gitlab/api/client";
import { parseGitLabContext } from "../../gitlab/context";
import { setupGitLabToken } from "../../gitlab/token";
import { checkTriggerAction } from "../../gitlab/validation/trigger";
import { checkHumanActor } from "../../gitlab/validation/actor";
import { checkWritePermissions } from "../../gitlab/validation/permissions";
import { createInitialComment } from "../../gitlab/operations/comments/create-initial";
import { updateTrackingComment } from "../../gitlab/operations/comments/update-with-branch";
import { updateFinalComment } from "../../gitlab/operations/comments/update-final";
import { setupBranch } from "../../gitlab/operations/branch";
import { fetchGitLabData } from "../../gitlab/data/fetcher";
import { checkAndDeleteEmptyBranch } from "../../gitlab/operations/branch-cleanup";

export class GitLabProvider implements Provider {
  private client!: GitLabClient;
  private gitlabContext: any;

  async setupToken(): Promise<string> {
    const token = await setupGitLabToken();
    const baseUrl = process.env.GITLAB_API_URL || "https://gitlab.com/api/v4";
    this.client = createGitLabClient(token, baseUrl);
    this.gitlabContext = parseGitLabContext();
    return token;
  }

  async checkTriggerAction(_context: ProviderContext): Promise<boolean> {
    return await checkTriggerAction(this.gitlabContext, this.client);
  }

  async checkHumanActor(_context: ProviderContext): Promise<void> {
    await checkHumanActor(this.gitlabContext, this.client);
  }

  async checkWritePermissions(_context: ProviderContext): Promise<boolean> {
    return await checkWritePermissions(this.gitlabContext, this.client);
  }

  async createInitialComment(_context: ProviderContext): Promise<number> {
    return await createInitialComment(this.gitlabContext, this.client);
  }

  async updateTrackingComment(
    _context: ProviderContext,
    commentId: number,
    branchName?: string,
  ): Promise<void> {
    if (branchName) {
      await updateTrackingComment(
        this.gitlabContext,
        this.client,
        commentId,
        branchName,
      );
    }
  }

  async setupBranch(
    data: ProviderData,
    _context: ProviderContext,
  ): Promise<{
    baseBranch: string;
    currentBranch: string;
    claudeBranch?: string;
  }> {
    return await setupBranch(data, this.gitlabContext, this.client);
  }

  async fetchData(
    _repository: string,
    entityNumber: string,
    isIssue: boolean,
  ): Promise<ProviderData> {
    const projectPath = this.gitlabContext.projectPath;
    return await fetchGitLabData({
      client: this.client,
      projectPath,
      entityNumber,
      isMR: !isIssue,
    });
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
    // Check and delete empty branch if needed
    const { shouldDeleteBranch, branchLink } = await checkAndDeleteEmptyBranch(
      this.client,
      this.gitlabContext.projectPath,
      options.branchName,
      options.baseBranch,
    );

    // Generate MR link if branch has changes
    let prLink = "";
    if (options.branchName && !shouldDeleteBranch && options.baseBranch) {
      const projectUrl =
        process.env.CI_PROJECT_URL ||
        `https://gitlab.com/${this.gitlabContext.projectPath}`;
      const entityType =
        context.entityType === "issue" ? "Issue" : "Merge Request";
      const mrTitle = encodeURIComponent(
        `${entityType} #${context.entityNumber}: Changes from Claude`,
      );
      const mrDescription = encodeURIComponent(
        `This MR addresses ${entityType.toLowerCase()} #${context.entityNumber}\n\nGenerated with [Claude Code](https://claude.ai/code)`,
      );
      const mrUrl = `${projectUrl}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(options.branchName)}&merge_request[target_branch]=${encodeURIComponent(options.baseBranch)}&merge_request[title]=${mrTitle}&merge_request[description]=${mrDescription}`;
      prLink = `[Create a MR](${mrUrl})`;
    }

    await updateFinalComment({
      context: this.gitlabContext,
      client: this.client,
      commentId,
      jobUrl: options.jobUrl,
      actionFailed: options.actionFailed,
      executionDetails: options.executionDetails,
      branchLink: shouldDeleteBranch ? "" : branchLink,
      prLink,
      branchName: shouldDeleteBranch ? undefined : options.branchName,
      triggerUsername: options.triggerUsername,
      errorDetails: options.errorDetails,
    });
  }
}

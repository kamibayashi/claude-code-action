/**
 * Adapter to convert ProviderData to FetchDataResult for legacy compatibility
 */

import type { ProviderData } from "./types";
import type { FetchDataResult } from "../github/data/fetcher";
import type {
  GitHubIssue,
  GitHubPullRequest,
  GitHubComment,
  GitHubReview,
  GitHubFile,
} from "../github/types";

export function convertProviderDataToFetchDataResult(
  providerData: ProviderData,
): FetchDataResult {
  const { issue, mergeRequest } = providerData;

  // Convert comments
  const comments: GitHubComment[] = (
    issue?.comments ||
    mergeRequest?.comments ||
    []
  ).map((comment) => ({
    id: comment.id,
    databaseId: comment.id,
    body: comment.body,
    author: {
      login: comment.author.username,
    },
    createdAt: comment.createdAt,
  }));

  // Convert changed files (for merge requests)
  const changedFiles: GitHubFile[] =
    mergeRequest?.files.map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      changeType: file.changeType,
    })) || [];

  const changedFilesWithSHA = changedFiles.map((file) => ({
    ...file,
    sha: mergeRequest?.headSha || "",
  }));

  // Convert review data (for merge requests)
  const reviewData: GitHubReview[] =
    mergeRequest?.reviews.map((review) => ({
      id: review.id,
      databaseId: review.id,
      author: {
        login: review.author.username,
      },
      body: review.body,
      state: review.state,
      submittedAt: review.submittedAt,
      comments: {
        nodes: review.comments.map((comment) => ({
          id: comment.id,
          databaseId: comment.id,
          body: comment.body,
          author: {
            login: comment.author.username,
          },
          createdAt: comment.createdAt,
          path: comment.path || "",
          line: comment.line,
        })),
      },
    })) || [];

  // Convert to GitHub format
  let result: FetchDataResult;

  if (issue) {
    const githubIssue: GitHubIssue = {
      title: issue.title,
      body: issue.description,
      author: {
        login: issue.author.username,
      },
      createdAt: issue.createdAt,
      state: issue.state,
      comments: {
        nodes: comments,
      },
    };

    result = {
      contextData: githubIssue,
      comments,
      changedFiles: [],
      changedFilesWithSHA: [],
      reviewData: { nodes: [] },
      imageUrlMap: new Map<string, string>(),
    };
  } else if (mergeRequest) {
    const githubPR: GitHubPullRequest = {
      title: mergeRequest.title,
      body: mergeRequest.description,
      author: {
        login: mergeRequest.author.username,
      },
      baseRefName: mergeRequest.targetBranch,
      headRefName: mergeRequest.sourceBranch,
      headRefOid: mergeRequest.headSha,
      createdAt: mergeRequest.createdAt,
      additions: mergeRequest.additions,
      deletions: mergeRequest.deletions,
      state: mergeRequest.state,
      commits: {
        totalCount: mergeRequest.commits.length,
        nodes: mergeRequest.commits.map((commit) => ({
          commit: {
            oid: commit.sha,
            message: commit.message,
            author: commit.author,
          },
        })),
      },
      files: {
        nodes: changedFiles,
      },
      comments: {
        nodes: comments,
      },
      reviews: {
        nodes: reviewData,
      },
    };

    result = {
      contextData: githubPR,
      comments,
      changedFiles,
      changedFilesWithSHA,
      reviewData: { nodes: reviewData },
      imageUrlMap: new Map<string, string>(),
    };
  } else {
    throw new Error("No issue or merge request data found");
  }

  return result;
}

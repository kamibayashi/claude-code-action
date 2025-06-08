/**
 * Fetch data from GitLab API
 */

import type { GitLabClient } from "../api/client";
import type { ProviderData } from "../../providers/types";
import type {
  GitLabProject,
  GitLabMergeRequest,
  GitLabIssue,
  GitLabNote,
  GitLabCommit,
  GitLabDiff,
} from "../types";

export interface FetchGitLabDataOptions {
  client: GitLabClient;
  projectPath: string;
  entityNumber: string;
  isMR: boolean;
}

export async function fetchGitLabData({
  client,
  projectPath,
  entityNumber,
  isMR,
}: FetchGitLabDataOptions): Promise<ProviderData> {
  // Fetch project details
  const project = await client.get<GitLabProject>(
    `/projects/${encodeURIComponent(projectPath)}`,
  );

  const repository = {
    owner: project.namespace.path,
    name: project.path,
    defaultBranch: project.default_branch,
  };

  if (isMR) {
    // Fetch merge request data
    const mr = await fetchMergeRequestData(client, projectPath, entityNumber);
    return {
      mergeRequest: mr,
      repository,
    };
  } else {
    // Fetch issue data
    const issue = await fetchIssueData(client, projectPath, entityNumber);
    return {
      issue,
      repository,
    };
  }
}

async function fetchMergeRequestData(
  client: GitLabClient,
  projectPath: string,
  mrIid: string,
): Promise<ProviderData["mergeRequest"]> {
  // Fetch MR details
  const mr = await client.get<GitLabMergeRequest>(
    `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}`,
  );

  // Fetch MR notes (comments)
  const notesResponse = await client.get<GitLabNote[]>(
    `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}/notes?sort=asc`,
  );
  const notes = Array.isArray(notesResponse) ? notesResponse : [];

  // Fetch MR commits
  const commitsResponse = await client.get<GitLabCommit[]>(
    `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}/commits`,
  );
  const commits = Array.isArray(commitsResponse) ? commitsResponse : [];

  // Fetch MR changes (diffs)
  const diffsResponse = await client.get<GitLabDiff[]>(
    `/projects/${encodeURIComponent(projectPath)}/merge_requests/${mrIid}/diffs`,
  );
  const diffs = Array.isArray(diffsResponse) ? diffsResponse : [];

  // Convert to provider format
  const result = {
    title: mr.title,
    description: mr.description || "",
    author: mr.author
      ? {
          username: mr.author.username,
          displayName: mr.author.name,
        }
      : {
          username: "unknown",
          displayName: "Unknown",
        },
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    headSha: mr.sha,
    createdAt: mr.created_at,
    additions: 0, // Will be calculated from diffs
    deletions: 0, // Will be calculated from diffs
    state: mapMRState(mr.state),
    commits: commits.map((commit) => ({
      sha: commit.id,
      message: commit.message,
      author: {
        name: commit.author_name,
        email: commit.author_email,
      },
    })),
    files: (diffs || []).map((change) => ({
      path: change.new_path,
      additions: countAdditions(change.diff),
      deletions: countDeletions(change.diff),
      changeType: mapChangeType(change),
    })),
    comments: notes
      .filter((note) => !note.system) // Exclude system notes
      .map((note) => ({
        id: note.id.toString(),
        body: note.body,
        author: note.author
          ? {
              username: note.author.username,
              displayName: note.author.name,
            }
          : {
              username: "unknown",
              displayName: "Unknown",
            },
        createdAt: note.created_at,
      })),
    reviews: [], // GitLab doesn't have a direct equivalent to GitHub reviews
  };

  // Calculate totals from diffs
  if (diffs.length > 0) {
    result.additions = diffs.reduce(
      (sum, change) => sum + countAdditions(change.diff || ""),
      0,
    );
    result.deletions = diffs.reduce(
      (sum, change) => sum + countDeletions(change.diff || ""),
      0,
    );
  }

  return result;
}

async function fetchIssueData(
  client: GitLabClient,
  projectPath: string,
  issueIid: string,
): Promise<ProviderData["issue"]> {
  // Fetch issue details
  const issue = await client.get<GitLabIssue>(
    `/projects/${encodeURIComponent(projectPath)}/issues/${issueIid}`,
  );

  // Fetch issue notes (comments)
  const notesResponse = await client.get<GitLabNote[]>(
    `/projects/${encodeURIComponent(projectPath)}/issues/${issueIid}/notes?sort=asc`,
  );
  const notes = Array.isArray(notesResponse) ? notesResponse : [];

  // Convert to provider format
  return {
    title: issue.title,
    description: issue.description || "",
    author: issue.author
      ? {
          username: issue.author.username,
          displayName: issue.author.name,
        }
      : {
          username: "unknown",
          displayName: "Unknown",
        },
    createdAt: issue.created_at,
    state: issue.state === "opened" ? "open" : "closed",
    comments: notes
      .filter((note) => !note.system) // Exclude system notes
      .map((note) => ({
        id: note.id.toString(),
        body: note.body,
        author: note.author
          ? {
              username: note.author.username,
              displayName: note.author.name,
            }
          : {
              username: "unknown",
              displayName: "Unknown",
            },
        createdAt: note.created_at,
      })),
  };
}

function mapMRState(gitlabState: string): string {
  switch (gitlabState) {
    case "opened":
      return "open";
    case "closed":
      return "closed";
    case "merged":
      return "merged";
    default:
      return gitlabState;
  }
}

function mapChangeType(change: GitLabDiff): string {
  if (change.new_file) return "added";
  if (change.deleted_file) return "removed";
  if (change.renamed_file) return "renamed";
  return "modified";
}

function countAdditions(diff: string): number {
  if (!diff) return 0;
  const lines = diff.split("\n");
  return lines.filter((line) => line.startsWith("+")).length;
}

function countDeletions(diff: string): number {
  if (!diff) return 0;
  const lines = diff.split("\n");
  return lines.filter((line) => line.startsWith("-")).length;
}

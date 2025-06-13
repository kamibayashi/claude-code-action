/**
 * Fetch data from GitLab API with parallel processing for improved performance
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
  // Fetch project details first as it's needed for repository info
  const project = await client.get<GitLabProject>(
    `/projects/${encodeURIComponent(projectPath)}`,
  );

  const repository = {
    owner: project.namespace.path,
    name: project.path,
    defaultBranch: project.default_branch,
  };

  if (isMR) {
    // Fetch merge request data with parallel processing
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
  const encodedProjectPath = encodeURIComponent(projectPath);
  
  // Execute all API calls in parallel for better performance
  const [mr, notesResponse, commitsResponse, diffsResponse] = await Promise.allSettled([
    client.get<GitLabMergeRequest>(
      `/projects/${encodedProjectPath}/merge_requests/${mrIid}`,
    ),
    client.get<GitLabNote[]>(
      `/projects/${encodedProjectPath}/merge_requests/${mrIid}/notes?sort=asc`,
    ),
    client.get<GitLabCommit[]>(
      `/projects/${encodedProjectPath}/merge_requests/${mrIid}/commits`,
    ),
    client.get<GitLabDiff[]>(
      `/projects/${encodedProjectPath}/merge_requests/${mrIid}/diffs`,
    ),
  ]);

  // Handle MR data (required)
  if (mr.status === 'rejected') {
    throw new Error(`Failed to fetch merge request: ${mr.reason}`);
  }
  const mrData = mr.value;

  // Handle optional data with fallbacks
  const notes = handleOptionalData(notesResponse, 'notes', []);
  const commits = handleOptionalData(commitsResponse, 'commits', []);
  const diffs = handleOptionalData(diffsResponse, 'diffs', []);

  // Convert to provider format
  const result = {
    title: mrData.title,
    description: mrData.description || "",
    author: mrData.author
      ? {
          username: mrData.author.username,
          displayName: mrData.author.name,
        }
      : {
          username: "unknown",
          displayName: "Unknown",
        },
    sourceBranch: mrData.source_branch,
    targetBranch: mrData.target_branch,
    headSha: mrData.sha,
    createdAt: mrData.created_at,
    additions: 0, // Will be calculated from diffs
    deletions: 0, // Will be calculated from diffs
    state: mapMRState(mrData.state),
    commits: commits.map((commit) => ({
      sha: commit.id,
      message: commit.message,
      author: {
        name: commit.author_name,
        email: commit.author_email,
      },
    })),
    files: diffs.map((change) => ({
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
  const encodedProjectPath = encodeURIComponent(projectPath);
  
  // Execute API calls in parallel
  const [issue, notesResponse] = await Promise.allSettled([
    client.get<GitLabIssue>(
      `/projects/${encodedProjectPath}/issues/${issueIid}`,
    ),
    client.get<GitLabNote[]>(
      `/projects/${encodedProjectPath}/issues/${issueIid}/notes?sort=asc`,
    ),
  ]);

  // Handle issue data (required)
  if (issue.status === 'rejected') {
    throw new Error(`Failed to fetch issue: ${issue.reason}`);
  }
  const issueData = issue.value;

  // Handle optional data with fallbacks
  const notes = handleOptionalData(notesResponse, 'notes', []);

  // Convert to provider format
  return {
    title: issueData.title,
    description: issueData.description || "",
    author: issueData.author
      ? {
          username: issueData.author.username,
          displayName: issueData.author.name,
        }
      : {
          username: "unknown",
          displayName: "Unknown",
        },
    createdAt: issueData.created_at,
    state: issueData.state === "opened" ? "open" : "closed",
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

function handleOptionalData<T>(
  settledResult: PromiseSettledResult<T[]>,
  dataType: string,
  fallback: T[]
): T[] {
  if (settledResult.status === 'fulfilled') {
    const data = settledResult.value;
    return Array.isArray(data) ? data : fallback;
  } else {
    // Silently return fallback data if fetch fails for optional data
    return fallback;
  }
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
  return lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
}

function countDeletions(diff: string): number {
  if (!diff) return 0;
  const lines = diff.split("\n");
  return lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
}

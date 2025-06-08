/**
 * Setup branch for GitLab
 */

import type { GitLabContext } from "../context";
import type { GitLabClient } from "../api/client";
import type { ProviderData } from "../../providers/types";
import type { GitLabBranch } from "../types";

export async function setupBranch(
  data: ProviderData,
  context: GitLabContext,
  client: GitLabClient,
): Promise<{
  baseBranch: string;
  currentBranch: string;
  claudeBranch?: string;
}> {
  // For merge requests, we're already on a branch
  if (context.mergeRequestIid && data.mergeRequest) {
    return {
      baseBranch: data.mergeRequest.targetBranch,
      currentBranch: data.mergeRequest.sourceBranch,
    };
  }

  // For issues, we need to create a new branch
  if (context.issueIid && data.issue) {
    const baseBranch =
      context.inputs.baseBranch || data.repository.defaultBranch;
    const branchName = `claude-issue-${context.issueIid}`;

    try {
      // Check if branch already exists
      const existingBranch = await checkBranchExists(
        context.projectPath,
        branchName,
        client,
      );

      if (existingBranch) {
        console.log(`Branch ${branchName} already exists`);
        return {
          baseBranch,
          currentBranch: branchName,
          claudeBranch: branchName,
        };
      }

      // Create new branch
      await client.post(
        `/projects/${encodeURIComponent(context.projectPath)}/repository/branches`,
        {
          branch: branchName,
          ref: baseBranch,
        },
      );

      console.log(`Created new branch: ${branchName} from ${baseBranch}`);

      return {
        baseBranch,
        currentBranch: branchName,
        claudeBranch: branchName,
      };
    } catch (error) {
      console.error("Error creating branch:", error);
      throw new Error(`Failed to create branch: ${error}`);
    }
  }

  // Fallback
  return {
    baseBranch: data.repository.defaultBranch,
    currentBranch: context.branch || data.repository.defaultBranch,
  };
}

async function checkBranchExists(
  projectPath: string,
  branchName: string,
  client: GitLabClient,
): Promise<boolean> {
  try {
    await client.get<GitLabBranch>(
      `/projects/${encodeURIComponent(projectPath)}/repository/branches/${encodeURIComponent(branchName)}`,
    );
    return true;
  } catch (error) {
    // 404 means branch doesn't exist
    return false;
  }
}

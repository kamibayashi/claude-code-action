/**
 * Check and delete empty branch in GitLab
 */

import type { GitLabClient } from "../api/client";

export async function checkAndDeleteEmptyBranch(
  client: GitLabClient,
  projectPath: string,
  branchName?: string,
  baseBranch?: string,
): Promise<{ shouldDeleteBranch: boolean; branchLink: string }> {
  // If no branch name provided, nothing to check
  if (!branchName || !baseBranch) {
    return { shouldDeleteBranch: false, branchLink: "" };
  }

  // Don't delete the base branch
  if (branchName === baseBranch) {
    return { shouldDeleteBranch: false, branchLink: "" };
  }

  try {
    // Compare branches to check if there are any changes
    const comparison = await client.get<{
      commits: any[];
      diffs: any[];
    }>(
      `/projects/${encodeURIComponent(projectPath)}/repository/compare?from=${encodeURIComponent(baseBranch)}&to=${encodeURIComponent(branchName)}`,
    );

    // If no commits or diffs, the branch is empty
    if (comparison.commits.length === 0 && comparison.diffs.length === 0) {
      console.log(
        `Branch ${branchName} has no changes compared to ${baseBranch}`,
      );

      // Try to delete the branch
      try {
        await client.delete(
          `/projects/${encodeURIComponent(projectPath)}/repository/branches/${encodeURIComponent(branchName)}`,
        );
        console.log(`Deleted empty branch: ${branchName}`);
        return { shouldDeleteBranch: true, branchLink: "" };
      } catch (deleteError) {
        console.error(`Failed to delete branch ${branchName}:`, deleteError);
        // Even if deletion fails, we still indicate it should be deleted
        return { shouldDeleteBranch: true, branchLink: "" };
      }
    }

    // Branch has changes, create link
    console.log(`Branch ${branchName} has changes, keeping it`);
    const projectUrl = process.env.CI_SERVER_URL || "https://gitlab.com";
    const branchUrl = `${projectUrl}/${projectPath}/-/tree/${encodeURIComponent(branchName)}`;
    const branchLink = `[View branch](${branchUrl})`;

    return { shouldDeleteBranch: false, branchLink };
  } catch (error) {
    console.error("Error checking branch status:", error);
    // On error, assume branch has changes and return empty link
    return { shouldDeleteBranch: false, branchLink: "" };
  }
}

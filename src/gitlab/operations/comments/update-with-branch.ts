/**
 * Update tracking comment with branch information in GitLab
 */

import type { GitLabContext } from "../../context";
import type { GitLabClient } from "../../api/client";

export async function updateTrackingComment(
  context: GitLabContext,
  client: GitLabClient,
  commentId: number,
  branchName: string,
): Promise<void> {
  const projectUrl = `${process.env.CI_PROJECT_URL || `https://gitlab.com/${context.projectPath}`}`;
  const branchUrl = `${projectUrl}/-/tree/${encodeURIComponent(branchName)}`;

  const updatedBody = `## 🤖 Claude is thinking...

I'll analyze this ${context.mergeRequestIid ? "merge request" : "issue"} and start working on it.

**Working on branch:** [${branchName}](${branchUrl})

<!-- claude-tracker -->`;

  try {
    if (context.mergeRequestIid) {
      // Update comment on merge request
      await client.put(
        `/projects/${encodeURIComponent(context.projectPath)}/merge_requests/${context.mergeRequestIid}/notes/${commentId}`,
        { body: updatedBody },
      );
    } else if (context.issueIid) {
      // Update comment on issue
      await client.put(
        `/projects/${encodeURIComponent(context.projectPath)}/issues/${context.issueIid}/notes/${commentId}`,
        { body: updatedBody },
      );
    } else {
      throw new Error("No merge request or issue IID found");
    }

    console.log(`Updated comment ${commentId} with branch: ${branchName}`);
  } catch (error) {
    console.error("Error updating comment with branch:", error);
    // Don't throw - this is not critical
  }
}

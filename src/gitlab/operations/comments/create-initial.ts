/**
 * Create initial tracking comment in GitLab
 */

import type { GitLabContext } from "../../context";
import type { GitLabClient } from "../../api/client";
import type { GitLabNote } from "../../types";

export async function createInitialComment(
  context: GitLabContext,
  client: GitLabClient,
): Promise<number> {
  const commentBody = `## 🤖 Claude is thinking...

I'll analyze this ${context.mergeRequestIid ? "merge request" : "issue"} and start working on it.

<!-- claude-tracker -->`;

  try {
    let note: GitLabNote;

    if (context.mergeRequestIid) {
      // Create comment on merge request
      note = await client.post<GitLabNote>(
        `/projects/${encodeURIComponent(context.projectPath)}/merge_requests/${context.mergeRequestIid}/notes`,
        { body: commentBody },
      );
    } else if (context.issueIid) {
      // Create comment on issue
      note = await client.post<GitLabNote>(
        `/projects/${encodeURIComponent(context.projectPath)}/issues/${context.issueIid}/notes`,
        { body: commentBody },
      );
    } else {
      throw new Error("No merge request or issue IID found");
    }

    console.log(`Created initial comment with ID: ${note.id}`);
    return note.id;
  } catch (error) {
    console.error("Error creating initial comment:", error);
    throw new Error(`Failed to create initial comment: ${error}`);
  }
}

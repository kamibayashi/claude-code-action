/**
 * Update final comment with job results in GitLab
 */

import type { GitLabContext } from "../../context";
import type { GitLabClient } from "../../api/client";
import type { GitLabNote } from "../../types";

export interface UpdateFinalCommentOptions {
  context: GitLabContext;
  client: GitLabClient;
  commentId: number;
  jobUrl: string;
  actionFailed: boolean;
  executionDetails?: {
    cost_usd?: number;
    duration_ms?: number;
    duration_api_ms?: number;
  } | null;
  branchLink?: string;
  prLink?: string;
  branchName?: string;
  triggerUsername?: string;
  errorDetails?: string;
}

export async function updateFinalComment({
  context,
  client,
  commentId,
  jobUrl,
  actionFailed,
  executionDetails,
  branchLink,
  prLink,
  branchName,
  triggerUsername,
  errorDetails,
}: UpdateFinalCommentOptions): Promise<void> {
  try {
    // Get current comment
    let currentBody = "";

    if (context.mergeRequestIid) {
      const notes = await client.get<GitLabNote[]>(
        `/projects/${encodeURIComponent(context.projectPath)}/merge_requests/${context.mergeRequestIid}/notes`,
      );
      const note = notes.find((n) => n.id === commentId);
      if (note) {
        currentBody = note.body;
      }
    } else if (context.issueIid) {
      const notes = await client.get<GitLabNote[]>(
        `/projects/${encodeURIComponent(context.projectPath)}/issues/${context.issueIid}/notes`,
      );
      const note = notes.find((n) => n.id === commentId);
      if (note) {
        currentBody = note.body;
      }
    }

    // Build updated body
    let updatedBody = currentBody;

    // Remove "Claude is thinking..." header if present
    updatedBody = updatedBody.replace(
      /^## 🤖 Claude is thinking\.\.\.\n\n/,
      "",
    );

    // Add completion header
    if (actionFailed) {
      updatedBody = `## ❌ Claude encountered an error\n\n${updatedBody}`;
    } else {
      updatedBody = `## ✅ Claude completed the task\n\n${updatedBody}`;
    }

    // Add error details if failed
    if (actionFailed && errorDetails) {
      updatedBody += `\n\n### Error Details\n\`\`\`\n${errorDetails}\n\`\`\``;
    }

    // Add branch info
    if (branchLink && branchName) {
      if (!updatedBody.includes(`Working on branch: [${branchName}]`)) {
        const trackerIndex = updatedBody.indexOf("<!-- claude-tracker -->");
        if (trackerIndex > -1) {
          updatedBody =
            updatedBody.slice(0, trackerIndex) +
            `**Working on branch:** ${branchLink}\n\n` +
            updatedBody.slice(trackerIndex);
        }
      }
    }

    // Add PR/MR link if available
    if (prLink) {
      const trackerIndex = updatedBody.indexOf("<!-- claude-tracker -->");
      if (trackerIndex > -1 && !updatedBody.includes("[Create a")) {
        updatedBody =
          updatedBody.slice(0, trackerIndex) +
          `\n${prLink}\n\n` +
          updatedBody.slice(trackerIndex);
      }
    }

    // Add execution details
    let detailsSection = "\n\n---\n\n";

    // Add job link with GitLab icon
    detailsSection += `🦊 [View GitLab CI Job](${jobUrl})`;

    // Add trigger info
    if (triggerUsername) {
      detailsSection += ` • Triggered by @${triggerUsername}`;
    }

    // Add execution metrics
    if (executionDetails) {
      const metrics = [];
      if (executionDetails.duration_ms) {
        const seconds = (executionDetails.duration_ms / 1000).toFixed(1);
        metrics.push(`Duration: ${seconds}s`);
      }
      if (executionDetails.duration_api_ms) {
        const apiSeconds = (executionDetails.duration_api_ms / 1000).toFixed(1);
        metrics.push(`API: ${apiSeconds}s`);
      }
      if (executionDetails.cost_usd) {
        metrics.push(`Cost: $${executionDetails.cost_usd.toFixed(4)}`);
      }

      if (metrics.length > 0) {
        detailsSection += ` • ${metrics.join(" • ")}`;
      }
    }

    // Find tracker comment position
    const trackerIndex = updatedBody.indexOf("<!-- claude-tracker -->");
    if (trackerIndex > -1) {
      // Insert details before the tracker
      updatedBody =
        updatedBody.slice(0, trackerIndex) +
        detailsSection +
        "\n\n" +
        updatedBody.slice(trackerIndex);
    } else {
      // Append if no tracker found
      updatedBody += detailsSection;
    }

    // Update comment
    if (context.mergeRequestIid) {
      await client.put(
        `/projects/${encodeURIComponent(context.projectPath)}/merge_requests/${context.mergeRequestIid}/notes/${commentId}`,
        { body: updatedBody },
      );
    } else if (context.issueIid) {
      await client.put(
        `/projects/${encodeURIComponent(context.projectPath)}/issues/${context.issueIid}/notes/${commentId}`,
        { body: updatedBody },
      );
    }

    const status = actionFailed ? "error" : "success";
    console.log(`Updated comment ${commentId} with final status: ${status}`);
  } catch (error) {
    console.error("Error updating final comment:", error);
    throw error;
  }
}

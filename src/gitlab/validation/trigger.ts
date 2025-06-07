/**
 * Check if GitLab event contains trigger action
 */

import type { GitLabContext } from "../context";
import type { GitLabClient } from "../api/client";
import type { GitLabIssue, GitLabMergeRequest, GitLabNote } from "../types";

export async function checkTriggerAction(
  context: GitLabContext,
  client: GitLabClient,
): Promise<boolean> {
  const { triggerPhrase, assigneeTrigger, directPrompt } = context.inputs;

  // If direct prompt is provided, always trigger
  if (directPrompt) {
    console.log("Direct prompt provided, triggering action");
    return true;
  }

  // Check if we have an entity to work with
  if (!context.mergeRequestIid && !context.issueIid) {
    console.log("No merge request or issue IID found");
    return false;
  }

  // Check for trigger phrase
  if (triggerPhrase) {
    // First check in MR/Issue description and title
    const containsInEntity = await checkTriggerPhraseInEntity(
      context,
      client,
      triggerPhrase,
    );
    if (containsInEntity) {
      return true;
    }

    // Then check in comments
    const containsInComments = await checkTriggerPhraseInComments(
      context,
      client,
      triggerPhrase,
    );
    if (containsInComments) {
      return true;
    }

    // If not found anywhere, log warning
    const entityType = context.mergeRequestIid ? "merge request" : "issue";
    const entityId = context.mergeRequestIid || context.issueIid;
    console.warn(
      `Trigger phrase '${triggerPhrase}' not found in ${entityType} ${entityId} or its comments`,
    );
    return false;
  }

  // Check for assignee trigger
  if (assigneeTrigger) {
    const isAssigned = await checkAssigneeTrigger(
      context,
      client,
      assigneeTrigger,
    );
    if (isAssigned) {
      return true;
    }
  }

  return false;
}

async function checkTriggerPhraseInComments(
  context: GitLabContext,
  client: GitLabClient,
  triggerPhrase: string,
): Promise<boolean> {
  try {
    let notes: GitLabNote[] = [];

    if (context.mergeRequestIid) {
      // Get merge request notes
      notes = await client.get<GitLabNote[]>(
        `/projects/${encodeURIComponent(context.projectPath)}/merge_requests/${context.mergeRequestIid}/notes`,
      );
    } else if (context.issueIid) {
      // Get issue notes
      notes = await client.get<GitLabNote[]>(
        `/projects/${encodeURIComponent(context.projectPath)}/issues/${context.issueIid}/notes`,
      );
    }

    // Check all notes for trigger phrase (case-insensitive)
    const triggerLower = triggerPhrase.toLowerCase();
    const found =
      Array.isArray(notes) &&
      notes.some(
        (note) => note.body && note.body.toLowerCase().includes(triggerLower),
      );

    if (found) {
      console.log(`Trigger phrase '${triggerPhrase}' found in comment`);
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error checking trigger phrase in comments:", error);
    return false;
  }
}

async function checkTriggerPhraseInEntity(
  context: GitLabContext,
  client: GitLabClient,
  triggerPhrase: string,
): Promise<boolean> {
  try {
    if (context.mergeRequestIid) {
      // Get merge request details
      const mr = await client.get<GitLabMergeRequest>(
        `/projects/${encodeURIComponent(context.projectPath)}/merge_requests/${context.mergeRequestIid}`,
      );

      // Check description (case-insensitive)
      const triggerLower = triggerPhrase.toLowerCase();
      if (
        mr.description &&
        mr.description.toLowerCase().includes(triggerLower)
      ) {
        console.log(
          `Trigger phrase '${triggerPhrase}' found in merge request description`,
        );
        return true;
      }

      // Check title (case-insensitive)
      if (mr.title && mr.title.toLowerCase().includes(triggerLower)) {
        console.log(
          `Trigger phrase '${triggerPhrase}' found in merge request title`,
        );
        return true;
      }
    } else if (context.issueIid) {
      // Get issue details
      const issue = await client.get<GitLabIssue>(
        `/projects/${encodeURIComponent(context.projectPath)}/issues/${context.issueIid}`,
      );

      // Check description (case-insensitive)
      const triggerLower = triggerPhrase.toLowerCase();
      if (
        issue.description &&
        issue.description.toLowerCase().includes(triggerLower)
      ) {
        console.log(
          `Trigger phrase '${triggerPhrase}' found in issue description`,
        );
        return true;
      }

      // Check title (case-insensitive)
      if (issue.title && issue.title.toLowerCase().includes(triggerLower)) {
        console.log(`Trigger phrase '${triggerPhrase}' found in issue title`);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking trigger phrase in entity:", error);
    return false;
  }
}

async function checkAssigneeTrigger(
  context: GitLabContext,
  client: GitLabClient,
  assigneeTrigger: string,
): Promise<boolean> {
  try {
    if (context.mergeRequestIid) {
      // Get merge request details
      const mr = await client.get<GitLabMergeRequest>(
        `/projects/${encodeURIComponent(context.projectPath)}/merge_requests/${context.mergeRequestIid}`,
      );

      // Check if assignee matches
      const assigneeUsername = assigneeTrigger.replace("@", "");
      if (mr.assignee?.username === assigneeUsername) {
        console.log(`MR assigned to trigger user "${assigneeUsername}"`);
        return true;
      }
      return false;
    } else if (context.issueIid) {
      // Get issue details
      const issue = await client.get<GitLabIssue>(
        `/projects/${encodeURIComponent(context.projectPath)}/issues/${context.issueIid}`,
      );

      // Check if any assignee matches
      const assigneeUsername = assigneeTrigger.replace("@", "");
      const isAssigned =
        issue.assignees?.some(
          (assignee) => assignee.username === assigneeUsername,
        ) || false;

      if (isAssigned) {
        console.log(`Issue assigned to trigger user "${assigneeUsername}"`);
      }

      return isAssigned;
    }

    return false;
  } catch (error) {
    console.error("Error checking assignee trigger:", error);
    return false;
  }
}

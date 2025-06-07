/**
 * Check if GitLab actor is human (not a bot)
 */

import type { GitLabContext } from "../context";
import type { GitLabClient } from "../api/client";
import type { GitLabUser } from "../types";

export async function checkHumanActor(
  context: GitLabContext,
  client: GitLabClient,
): Promise<void> {
  const username = context.triggerUser;

  if (!username) {
    // If no trigger user, we can't check, so return early
    return;
  }

  // Get user details
  try {
    const user = await client.get<GitLabUser>(
      `/users/${encodeURIComponent(username)}`,
    );

    // Check if user has bot field set to true
    if (user.bot === true) {
      throw new Error(
        `Action triggered by bot account ${username}. Only human users can trigger Claude.`,
      );
    }

    console.log(`Actor ${username} is a human user`);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Only human users can trigger Claude")
    ) {
      throw error;
    }

    // If we can't fetch user details, we'll allow it to proceed
    console.warn(
      `Could not verify actor ${username}, proceeding anyway:`,
      error,
    );
  }
}

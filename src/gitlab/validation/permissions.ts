/**
 * Check if user has write permissions in GitLab project
 */

import type { GitLabContext } from "../context";
import type { GitLabClient } from "../api/client";
import type { GitLabProjectMember } from "../types";

// GitLab access levels
const ACCESS_LEVELS = {
  NO_ACCESS: 0,
  MINIMAL_ACCESS: 5,
  GUEST: 10,
  REPORTER: 20,
  DEVELOPER: 30,
  MAINTAINER: 40,
  OWNER: 50,
} as const;

export async function checkWritePermissions(
  context: GitLabContext,
  client: GitLabClient,
): Promise<boolean> {
  const username = context.triggerUser;

  if (!username) {
    console.log("No trigger user found, cannot check permissions");
    return false;
  }

  try {
    // Try to get specific user's membership
    const member = await client.get<GitLabProjectMember>(
      `/projects/${encodeURIComponent(context.projectPath)}/members/all/${username}`,
    );

    // Developer level (30) or above has write permissions
    const hasWriteAccess = member.access_level >= ACCESS_LEVELS.DEVELOPER;

    // Log the specific access level name
    let accessLevelName = "Unknown";
    switch (member.access_level) {
      case ACCESS_LEVELS.GUEST:
        accessLevelName = "Guest";
        break;
      case ACCESS_LEVELS.REPORTER:
        accessLevelName = "Reporter";
        break;
      case ACCESS_LEVELS.DEVELOPER:
        accessLevelName = "Developer";
        break;
      case ACCESS_LEVELS.MAINTAINER:
        accessLevelName = "Maintainer";
        break;
      case ACCESS_LEVELS.OWNER:
        accessLevelName = "Owner";
        break;
    }

    console.log(`User ${username} has ${accessLevelName} access level`);

    return hasWriteAccess;
  } catch (error) {
    console.error("Error checking write permissions:", error);

    // In CI environment with job token, we might not be able to check members
    // but the job token itself implies some level of access
    if (process.env.CI_JOB_TOKEN) {
      console.log("Running in CI with job token, assuming write permissions");
      return true;
    }

    return false;
  }
}

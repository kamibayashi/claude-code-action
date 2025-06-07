/**
 * GitLab token management
 */

export async function setupGitLabToken(): Promise<string> {
  // Check for override token first (similar to GitHub)
  const overrideToken = process.env.OVERRIDE_GITLAB_TOKEN;
  if (overrideToken) {
    console.log("Using override GitLab token from environment");
    return overrideToken;
  }

  // Check for GitLab CI job token
  const ciJobToken = process.env.CI_JOB_TOKEN;
  if (ciJobToken) {
    console.log("Using GitLab CI job token");
    return ciJobToken;
  }

  // Check for personal access token
  const personalToken = process.env.GITLAB_TOKEN;
  if (personalToken) {
    console.log("Using GitLab token from environment");
    return personalToken;
  }

  // Check for project access token
  const projectToken = process.env.GITLAB_PROJECT_TOKEN;
  if (projectToken) {
    console.log("Using GitLab project access token");
    return projectToken;
  }

  throw new Error("GITLAB_TOKEN environment variable is required");
}

/**
 * GitLab token management with improved error handling and validation
 */

export interface TokenInfo {
  token: string;
  type: 'override' | 'job' | 'personal' | 'project';
}

export async function setupGitLabToken(): Promise<string> {
  const tokenInfo = await getGitLabTokenInfo();
  
  // Validate token format
  validateTokenFormat(tokenInfo);
  
  return tokenInfo.token;
}

export async function getGitLabTokenInfo(): Promise<TokenInfo> {
  // Check for override token first (for testing/development)
  const overrideToken = process.env.OVERRIDE_GITLAB_TOKEN;
  if (overrideToken) {
    console.log("Using override GitLab token from environment");
    return { token: overrideToken, type: 'override' };
  }

  // Check for GitLab CI job token (most common in CI/CD)
  const ciJobToken = process.env.CI_JOB_TOKEN;
  if (ciJobToken) {
    console.log("Using GitLab CI job token");
    return { token: ciJobToken, type: 'job' };
  }

  // Check for personal access token
  const personalToken = process.env.GITLAB_TOKEN;
  if (personalToken) {
    console.log("Using GitLab personal access token from environment");
    return { token: personalToken, type: 'personal' };
  }

  // Check for project access token
  const projectToken = process.env.GITLAB_PROJECT_TOKEN;
  if (projectToken) {
    console.log("Using GitLab project access token");
    return { token: projectToken, type: 'project' };
  }

  throw new Error(
    "No GitLab token found. Please set one of the following environment variables:\n" +
    "- CI_JOB_TOKEN (automatically set in GitLab CI)\n" +
    "- GITLAB_TOKEN (personal access token)\n" +
    "- GITLAB_PROJECT_TOKEN (project access token)\n" +
    "- OVERRIDE_GITLAB_TOKEN (for testing)\n\n" +
    "For more information, see: https://docs.gitlab.com/ee/user/project/settings/project_access_tokens.html"
  );
}

function validateTokenFormat(tokenInfo: TokenInfo): void {
  const { token, type } = tokenInfo;
  
  if (!token || token.trim().length === 0) {
    throw new Error(`Invalid ${type} token: token is empty`);
  }
  
  // Basic token format validation based on type
  switch (type) {
    case 'personal':
      // Personal access tokens typically start with 'glpat-'
      if (!token.startsWith('glpat-') && token.length < 20) {
        console.log("Personal access token format seems unusual. Expected format: glpat-...");
      }
      break;
    case 'project':
      // Project tokens typically start with 'glpat-'
      if (!token.startsWith('glpat-') && token.length < 20) {
        console.log("Project access token format seems unusual. Expected format: glpat-...");
      }
      break;
    case 'job':
      // Job tokens are typically shorter and don't follow the glpat- pattern
      if (token.length < 20) {
        console.log("CI job token seems unusually short");
      }
      break;
    // override tokens can be any format for testing
  }
}

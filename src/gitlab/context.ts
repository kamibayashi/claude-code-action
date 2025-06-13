/**
 * Parse GitLab CI context from environment variables with improved validation
 */

import type { ProviderContext, Repository, Author } from "../providers/types";

export interface GitLabContext {
  projectPath: string;
  projectId: string;
  mergeRequestIid?: string;
  issueIid?: string;
  branch: string;
  defaultBranch: string;
  triggerUser: string;
  inputs: {
    triggerPhrase: string;
    assigneeTrigger?: string;
    baseBranch?: string;
    allowedTools?: string;
    customInstructions?: string;
    directPrompt?: string;
  };
}

export function parseGitLabContext(): GitLabContext {
  // GitLab CI environment variables
  const projectPath = process.env.CI_PROJECT_PATH;
  const projectId = process.env.CI_PROJECT_ID;
  
  // Validate required environment variables
  if (!projectPath) {
    throw new Error(
      "CI_PROJECT_PATH environment variable is required. " +
      "This should be automatically set in GitLab CI/CD pipelines."
    );
  }
  
  if (!projectId) {
    throw new Error(
      "CI_PROJECT_ID environment variable is required. " +
      "This should be automatically set in GitLab CI/CD pipelines."
    );
  }

  const mergeRequestIid = process.env.CI_MERGE_REQUEST_IID;
  const branch = process.env.CI_COMMIT_REF_NAME || process.env.CI_DEFAULT_BRANCH || "main";
  const defaultBranch = process.env.CI_DEFAULT_BRANCH || "main";
  
  // Try multiple possible sources for trigger user
  const triggerUser = 
    process.env.GITLAB_USER_LOGIN || 
    process.env.CI_COMMIT_AUTHOR || 
    process.env.TRIGGER_USERNAME ||
    "";

  // Input values (similar to GitHub action inputs)
  const inputs = {
    triggerPhrase: process.env.TRIGGER_PHRASE || "@claude",
    assigneeTrigger: process.env.ASSIGNEE_TRIGGER || undefined,
    baseBranch: process.env.BASE_BRANCH || undefined,
    allowedTools: process.env.ALLOWED_TOOLS || undefined,
    customInstructions: process.env.CUSTOM_INSTRUCTIONS || undefined,
    directPrompt: process.env.DIRECT_PROMPT || undefined,
  };

  // For issues, we need to parse from trigger event
  const issueIid = process.env.GITLAB_ISSUE_IID;

  return {
    projectPath,
    projectId,
    mergeRequestIid,
    issueIid,
    branch,
    defaultBranch,
    triggerUser,
    inputs,
  };
}

export function convertToProviderContext(
  gitlabContext: GitLabContext,
): ProviderContext {
  const pathParts = gitlabContext.projectPath.split("/");
  
  if (pathParts.length < 2) {
    throw new Error(
      `Invalid project path format: ${gitlabContext.projectPath}. ` +
      "Expected format: 'namespace/project-name'"
    );
  }

  const namespace = pathParts[0];
  const projectName = pathParts[1];

  const repository: Repository = {
    owner: namespace,
    name: projectName,
    defaultBranch: gitlabContext.defaultBranch,
  };

  const actor: Author = {
    username: gitlabContext.triggerUser,
  };

  const entityType = gitlabContext.mergeRequestIid ? "merge_request" : "issue";
  const entityNumber = parseEntityNumber(
    gitlabContext.mergeRequestIid || gitlabContext.issueIid
  );

  return {
    provider: "gitlab",
    repository,
    entityType,
    entityNumber,
    actor,
    inputs: gitlabContext.inputs,
  };
}

function parseEntityNumber(entityId?: string): number {
  if (!entityId) {
    throw new Error(
      "No entity ID found. Either CI_MERGE_REQUEST_IID or GITLAB_ISSUE_IID must be set."
    );
  }

  const parsed = parseInt(entityId, 10);
  
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid entity ID: ${entityId}. Expected a positive integer.`
    );
  }

  return parsed;
}

export function validateGitLabEnvironment(): void {
  const requiredVars = [
    'CI_PROJECT_PATH',
    'CI_PROJECT_ID',
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required GitLab CI environment variables: ${missing.join(', ')}. ` +
      "Make sure you're running in a GitLab CI/CD pipeline."
    );
  }

  // Check if we have at least one entity identifier
  const hasMR = process.env.CI_MERGE_REQUEST_IID;
  const hasIssue = process.env.GITLAB_ISSUE_IID;
  
  if (!hasMR && !hasIssue) {
    console.log(
      "Warning: No merge request or issue ID found. " +
      "Set CI_MERGE_REQUEST_IID or GITLAB_ISSUE_IID environment variables."
    );
  }
}

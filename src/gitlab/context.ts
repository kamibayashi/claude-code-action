/**
 * Parse GitLab CI context from environment variables
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
  const projectPath = process.env.CI_PROJECT_PATH || "";
  const projectId = process.env.CI_PROJECT_ID || "";
  const mergeRequestIid = process.env.CI_MERGE_REQUEST_IID;
  const branch = process.env.CI_COMMIT_REF_NAME || "";
  const defaultBranch = process.env.CI_DEFAULT_BRANCH || "main";
  const triggerUser =
    process.env.GITLAB_USER_LOGIN || process.env.CI_COMMIT_AUTHOR || "";

  // Input values (similar to GitHub action inputs)
  const inputs = {
    triggerPhrase: process.env.TRIGGER_PHRASE || "@claude",
    assigneeTrigger: process.env.ASSIGNEE_TRIGGER,
    baseBranch: process.env.BASE_BRANCH,
    allowedTools: process.env.ALLOWED_TOOLS,
    customInstructions: process.env.CUSTOM_INSTRUCTIONS,
    directPrompt: process.env.DIRECT_PROMPT,
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
  const namespace = pathParts[0] || "";
  const projectName = pathParts[1] || "";

  const repository: Repository = {
    owner: namespace,
    name: projectName,
    defaultBranch: gitlabContext.defaultBranch,
  };

  const actor: Author = {
    username: gitlabContext.triggerUser,
  };

  const entityType = gitlabContext.mergeRequestIid ? "merge_request" : "issue";
  const entityNumber = parseInt(
    gitlabContext.mergeRequestIid || gitlabContext.issueIid || "0",
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

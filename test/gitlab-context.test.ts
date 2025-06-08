import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  parseGitLabContext,
  convertToProviderContext,
} from "../src/gitlab/context";
import type { GitLabContext } from "../src/gitlab/context";

describe("parseGitLabContext", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all environment variables
    Object.keys(process.env).forEach((key) => {
      delete process.env[key];
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  test("should parse basic GitLab CI environment variables", () => {
    process.env.CI_PROJECT_PATH = "group/project";
    process.env.CI_PROJECT_ID = "12345";
    process.env.CI_COMMIT_REF_NAME = "feature-branch";
    process.env.CI_DEFAULT_BRANCH = "main";
    process.env.GITLAB_USER_LOGIN = "testuser";

    const context = parseGitLabContext();

    expect(context.projectPath).toBe("group/project");
    expect(context.projectId).toBe("12345");
    expect(context.branch).toBe("feature-branch");
    expect(context.defaultBranch).toBe("main");
    expect(context.triggerUser).toBe("testuser");
  });

  test("should parse merge request context", () => {
    process.env.CI_PROJECT_PATH = "group/project";
    process.env.CI_MERGE_REQUEST_IID = "123";
    process.env.CI_COMMIT_REF_NAME = "mr-branch";

    const context = parseGitLabContext();

    expect(context.mergeRequestIid).toBe("123");
    expect(context.issueIid).toBeUndefined();
  });

  test("should parse issue context", () => {
    process.env.CI_PROJECT_PATH = "group/project";
    process.env.GITLAB_ISSUE_IID = "456";
    process.env.CI_COMMIT_REF_NAME = "issue-branch";

    const context = parseGitLabContext();

    expect(context.issueIid).toBe("456");
    expect(context.mergeRequestIid).toBeUndefined();
  });

  test("should parse input values", () => {
    process.env.CI_PROJECT_PATH = "group/project";
    process.env.TRIGGER_PHRASE = "/claude";
    process.env.ASSIGNEE_TRIGGER = "claude-bot";
    process.env.BASE_BRANCH = "develop";
    process.env.ALLOWED_TOOLS = "tool1,tool2";
    process.env.CUSTOM_INSTRUCTIONS = "Be helpful";
    process.env.DIRECT_PROMPT = "Fix the bug";

    const context = parseGitLabContext();

    expect(context.inputs.triggerPhrase).toBe("/claude");
    expect(context.inputs.assigneeTrigger).toBe("claude-bot");
    expect(context.inputs.baseBranch).toBe("develop");
    expect(context.inputs.allowedTools).toBe("tool1,tool2");
    expect(context.inputs.customInstructions).toBe("Be helpful");
    expect(context.inputs.directPrompt).toBe("Fix the bug");
  });

  test("should use defaults when environment variables are not set", () => {
    const context = parseGitLabContext();

    expect(context.projectPath).toBe("");
    expect(context.projectId).toBe("");
    expect(context.branch).toBe("");
    expect(context.defaultBranch).toBe("main");
    expect(context.triggerUser).toBe("");
    expect(context.inputs.triggerPhrase).toBe("@claude");
  });

  test("should fall back to CI_COMMIT_AUTHOR when GITLAB_USER_LOGIN is not set", () => {
    process.env.CI_PROJECT_PATH = "group/project";
    process.env.CI_COMMIT_AUTHOR = "commit-author";

    const context = parseGitLabContext();

    expect(context.triggerUser).toBe("commit-author");
  });
});

describe("convertToProviderContext", () => {
  test("should convert GitLab context to provider context for merge request", () => {
    const gitlabContext: GitLabContext = {
      projectPath: "mygroup/myproject",
      projectId: "123",
      mergeRequestIid: "456",
      branch: "feature-branch",
      defaultBranch: "main",
      triggerUser: "testuser",
      inputs: {
        triggerPhrase: "@claude",
      },
    };

    const providerContext = convertToProviderContext(gitlabContext);

    expect(providerContext.provider).toBe("gitlab");
    expect(providerContext.repository.owner).toBe("mygroup");
    expect(providerContext.repository.name).toBe("myproject");
    expect(providerContext.repository.defaultBranch).toBe("main");
    expect(providerContext.entityType).toBe("merge_request");
    expect(providerContext.entityNumber).toBe(456);
    expect(providerContext.actor.username).toBe("testuser");
    expect(providerContext.inputs).toEqual(gitlabContext.inputs);
  });

  test("should convert GitLab context to provider context for issue", () => {
    const gitlabContext: GitLabContext = {
      projectPath: "mygroup/myproject",
      projectId: "123",
      issueIid: "789",
      branch: "issue-branch",
      defaultBranch: "main",
      triggerUser: "testuser",
      inputs: {
        triggerPhrase: "@claude",
      },
    };

    const providerContext = convertToProviderContext(gitlabContext);

    expect(providerContext.provider).toBe("gitlab");
    expect(providerContext.entityType).toBe("issue");
    expect(providerContext.entityNumber).toBe(789);
  });

  test("should handle single-level project path", () => {
    const gitlabContext: GitLabContext = {
      projectPath: "myproject",
      projectId: "123",
      branch: "main",
      defaultBranch: "main",
      triggerUser: "testuser",
      inputs: {
        triggerPhrase: "@claude",
      },
    };

    const providerContext = convertToProviderContext(gitlabContext);

    expect(providerContext.repository.owner).toBe("myproject");
    expect(providerContext.repository.name).toBe("");
  });

  test("should handle empty project path", () => {
    const gitlabContext: GitLabContext = {
      projectPath: "",
      projectId: "123",
      branch: "main",
      defaultBranch: "main",
      triggerUser: "testuser",
      inputs: {
        triggerPhrase: "@claude",
      },
    };

    const providerContext = convertToProviderContext(gitlabContext);

    expect(providerContext.repository.owner).toBe("");
    expect(providerContext.repository.name).toBe("");
  });

  test("should default entity number to 0 when no MR or issue IID", () => {
    const gitlabContext: GitLabContext = {
      projectPath: "group/project",
      projectId: "123",
      branch: "main",
      defaultBranch: "main",
      triggerUser: "testuser",
      inputs: {
        triggerPhrase: "@claude",
      },
    };

    const providerContext = convertToProviderContext(gitlabContext);

    expect(providerContext.entityNumber).toBe(0);
  });
});

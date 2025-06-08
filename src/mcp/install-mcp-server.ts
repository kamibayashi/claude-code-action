import * as core from "@actions/core";
import { ProviderFactory } from "../providers/factory";

type PrepareConfigParams = {
  token: string;
  branch: string;
  additionalMcpConfig?: string;
  claudeCommentId?: string;
  allowedTools: string[];
  // GitHub specific
  owner?: string;
  repo?: string;
  // GitLab specific
  projectPath?: string;
};

export async function prepareMcpConfig(
  params: PrepareConfigParams,
): Promise<string> {
  const {
    token,
    branch,
    additionalMcpConfig,
    claudeCommentId,
    allowedTools,
    owner,
    repo,
    projectPath,
  } = params;
  try {
    const allowedToolsList = allowedTools || [];
    const providerType = ProviderFactory.getProviderContext().provider;

    let baseMcpConfig: { mcpServers: Record<string, unknown> } = {
      mcpServers: {},
    };

    if (providerType === "github") {
      const hasGitHubMcpTools = allowedToolsList.some((tool) =>
        tool.startsWith("mcp__github__"),
      );

      baseMcpConfig.mcpServers.github_file_ops = {
        command: "bun",
        args: [
          "run",
          `${process.env.GITHUB_ACTION_PATH}/src/mcp/github-file-ops-server.ts`,
        ],
        env: {
          GITHUB_TOKEN: token,
          REPO_OWNER: owner,
          REPO_NAME: repo,
          BRANCH_NAME: branch,
          REPO_DIR: process.env.GITHUB_WORKSPACE || process.cwd(),
          ...(claudeCommentId && { CLAUDE_COMMENT_ID: claudeCommentId }),
          GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME || "",
          IS_PR: process.env.IS_PR || "false",
        },
      };

      if (hasGitHubMcpTools) {
        baseMcpConfig.mcpServers.github = {
          command: "docker",
          args: [
            "run",
            "-i",
            "--rm",
            "-e",
            "GITHUB_PERSONAL_ACCESS_TOKEN",
            "ghcr.io/github/github-mcp-server:sha-e9f748f", // https://github.com/github/github-mcp-server/releases/tag/v0.4.0
          ],
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: token,
          },
        };
      }
    } else if (providerType === "gitlab") {
      baseMcpConfig.mcpServers.gitlab_file_ops = {
        command: "bun",
        args: [
          "run",
          `${process.env.CI_PROJECT_DIR}/src/mcp/gitlab-file-ops-server.ts`,
        ],
        env: {
          GITLAB_TOKEN: token,
          PROJECT_PATH: projectPath,
          BRANCH_NAME: branch,
          REPO_DIR: process.env.CI_PROJECT_DIR || process.cwd(),
          GITLAB_SERVER_URL: process.env.CI_SERVER_URL || "https://gitlab.com",
          ...(claudeCommentId && { CLAUDE_COMMENT_ID: claudeCommentId }),
          GITLAB_EVENT_TYPE: process.env.CI_PIPELINE_SOURCE || "",
          CI_MERGE_REQUEST_IID: process.env.CI_MERGE_REQUEST_IID || "",
          GITLAB_ISSUE_IID: process.env.GITLAB_ISSUE_IID || "",
        },
      };
    }

    // Merge with additional MCP config if provided
    if (additionalMcpConfig && additionalMcpConfig.trim()) {
      try {
        const additionalConfig = JSON.parse(additionalMcpConfig);

        // Validate that parsed JSON is an object
        if (typeof additionalConfig !== "object" || additionalConfig === null) {
          throw new Error("MCP config must be a valid JSON object");
        }

        core.info(
          "Merging additional MCP server configuration with built-in servers",
        );

        // Merge configurations with user config overriding built-in servers
        const mergedConfig = {
          ...baseMcpConfig,
          ...additionalConfig,
          mcpServers: {
            ...baseMcpConfig.mcpServers,
            ...additionalConfig.mcpServers,
          },
        };

        return JSON.stringify(mergedConfig, null, 2);
      } catch (parseError) {
        core.warning(
          `Failed to parse additional MCP config: ${parseError}. Using base config only.`,
        );
      }
    }

    return JSON.stringify(baseMcpConfig, null, 2);
  } catch (error) {
    core.setFailed(`Install MCP server failed with error: ${error}`);
    process.exit(1);
  }
}

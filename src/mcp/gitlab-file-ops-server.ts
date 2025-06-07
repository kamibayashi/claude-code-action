#!/usr/bin/env node
// GitLab File Operations MCP Server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "fs/promises";
import { join } from "path";
import fetch from "node-fetch";

// Get repository information from environment variables
const PROJECT_PATH = process.env.PROJECT_PATH;
const BRANCH_NAME = process.env.BRANCH_NAME;
const REPO_DIR = process.env.REPO_DIR || process.cwd();
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const GITLAB_SERVER_URL = process.env.GITLAB_SERVER_URL || "https://gitlab.com";

if (!PROJECT_PATH || !BRANCH_NAME || !GITLAB_TOKEN) {
  console.error(
    "Error: PROJECT_PATH, BRANCH_NAME, and GITLAB_TOKEN environment variables are required",
  );
  process.exit(1);
}

const server = new McpServer({
  name: "GitLab File Operations Server",
  version: "0.0.1",
});

// GitLab API base URL
const GITLAB_API_URL = `${GITLAB_SERVER_URL}/api/v4`;

// Commit files tool
server.tool(
  "commit_files",
  "Commit one or more files to a repository in a single commit (this will commit them atomically in the remote repository)",
  {
    files: z
      .array(z.string())
      .describe(
        'Array of file paths relative to repository root (e.g. ["src/main.js", "README.md"]). All files must exist locally.',
      ),
    message: z.string().describe("Commit message"),
  },
  async ({ files, message }) => {
    try {
      const processedFiles = files.map((filePath) => {
        if (filePath.startsWith("/")) {
          return filePath.slice(1);
        }
        return filePath;
      });

      // Prepare commit actions
      const actions = await Promise.all(
        processedFiles.map(async (filePath) => {
          try {
            const fileContent = await readFile(
              join(REPO_DIR, filePath),
              "utf8",
            );
            return {
              action: "update" as const,
              file_path: filePath,
              content: fileContent,
            };
          } catch (error) {
            // If file doesn't exist locally, it might be a new file
            const fileContent = await readFile(
              join(REPO_DIR, filePath),
              "utf8",
            );
            return {
              action: "create" as const,
              file_path: filePath,
              content: fileContent,
            };
          }
        }),
      );

      // Create commit
      const commitUrl = `/projects/${encodeURIComponent(PROJECT_PATH)}/repository/commits`;
      const commitData = {
        branch: BRANCH_NAME,
        commit_message: message,
        actions,
      };

      const response = await fetch(`${GITLAB_API_URL}${commitUrl}`, {
        method: "POST",
        headers: {
          "PRIVATE-TOKEN": GITLAB_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commitData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitLab API error: ${response.status} ${errorText}`);
      }

      const result = (await response.json()) as any;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Successfully committed ${files.length} file(s) to branch ${BRANCH_NAME}`,
                commitId: result.id,
                shortId: result.short_id,
                webUrl: result.web_url,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Delete files tool
server.tool(
  "delete_files",
  "Delete one or more files from a repository in a single commit (this will delete them atomically in the remote repository)",
  {
    files: z
      .array(z.string())
      .describe(
        'Array of file paths relative to repository root (e.g. ["old/file.js", "temp.txt"])',
      ),
    message: z.string().describe("Commit message"),
  },
  async ({ files, message }) => {
    try {
      const processedFiles = files.map((filePath) => {
        if (filePath.startsWith("/")) {
          return filePath.slice(1);
        }
        return filePath;
      });

      // Prepare delete actions
      const actions = processedFiles.map((filePath) => ({
        action: "delete" as const,
        file_path: filePath,
      }));

      // Create commit
      const commitUrl = `/projects/${encodeURIComponent(PROJECT_PATH)}/repository/commits`;
      const commitData = {
        branch: BRANCH_NAME,
        commit_message: message,
        actions,
      };

      const response = await fetch(`${GITLAB_API_URL}${commitUrl}`, {
        method: "POST",
        headers: {
          "PRIVATE-TOKEN": GITLAB_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commitData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitLab API error: ${response.status} ${errorText}`);
      }

      const result = (await response.json()) as any;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Successfully deleted ${files.length} file(s) from branch ${BRANCH_NAME}`,
                commitId: result.id,
                shortId: result.short_id,
                webUrl: result.web_url,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Update Claude comment tool
server.tool(
  "update_claude_comment",
  "Update the Claude tracking comment with a checkbox update showing progress (e.g., checking off a completed task)",
  {
    content: z.string().describe("The new content for the comment"),
  },
  async ({ content }) => {
    try {
      const claudeCommentId = process.env.CLAUDE_COMMENT_ID;
      const mergeRequestIid = process.env.CI_MERGE_REQUEST_IID;
      const issueIid = process.env.GITLAB_ISSUE_IID;

      if (!claudeCommentId) {
        throw new Error("CLAUDE_COMMENT_ID environment variable is required");
      }

      let updateUrl: string;
      if (mergeRequestIid) {
        updateUrl = `/projects/${encodeURIComponent(PROJECT_PATH)}/merge_requests/${mergeRequestIid}/notes/${claudeCommentId}`;
      } else if (issueIid) {
        updateUrl = `/projects/${encodeURIComponent(PROJECT_PATH)}/issues/${issueIid}/notes/${claudeCommentId}`;
      } else {
        throw new Error(
          "Neither CI_MERGE_REQUEST_IID nor GITLAB_ISSUE_IID is set",
        );
      }

      const response = await fetch(`${GITLAB_API_URL}${updateUrl}`, {
        method: "PUT",
        headers: {
          "PRIVATE-TOKEN": GITLAB_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: content }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitLab API error: ${response.status} ${errorText}`);
      }

      return {
        content: [
          {
            type: "text",
            text: "Successfully updated Claude comment",
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Start the server
const transport = new StdioServerTransport();
server.connect(transport);
console.error("GitLab File Operations MCP Server running on stdio");

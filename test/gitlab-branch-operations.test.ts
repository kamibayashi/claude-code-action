import { describe, test, expect, beforeEach, spyOn, afterEach } from "bun:test";
import { setupBranch } from "../src/gitlab/operations/branch";
import type { GitLabClient } from "../src/gitlab/api/client";
import type { GitLabContext } from "../src/gitlab/context";
import type { ProviderData } from "../src/providers/types";

describe("GitLab branch operations", () => {
  let mockClient: GitLabClient;
  let mockContext: GitLabContext;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

    mockClient = {
      get: async <T = any>(): Promise<T> => ({}) as T,
      post: async <T = any>(): Promise<T> => ({}) as T,
      put: async <T = any>(): Promise<T> => ({}) as T,
      delete: async <T = any>(): Promise<T> => ({}) as T,
      request: async <T = any>(): Promise<T> => ({}) as T,
    } as GitLabClient;

    mockContext = {
      projectPath: "test/project",
      projectId: "123",
      branch: "test-branch",
      defaultBranch: "main",
      triggerUser: "testuser",
      inputs: {},
    } as GitLabContext;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("setupBranch", () => {
    describe("for merge requests", () => {
      test("should return existing branch info for merge request", async () => {
        mockContext.mergeRequestIid = "456";
        const mockData: ProviderData = {
          repository: {
            owner: "test",
            name: "project",
            defaultBranch: "main",
          },
          mergeRequest: {
            title: "Test MR",
            description: "Test description",
            author: { username: "testuser" },
            sourceBranch: "feature-branch",
            targetBranch: "main",
            headSha: "abc123",
            createdAt: "2024-01-01",
            additions: 10,
            deletions: 5,
            state: "opened",
            commits: [],
            files: [],
            comments: [],
            reviews: [],
          },
        };

        const result = await setupBranch(mockData, mockContext, mockClient);

        expect(result).toEqual({
          baseBranch: "main",
          currentBranch: "feature-branch",
        });
      });

      test("should handle merge request without data", async () => {
        mockContext.mergeRequestIid = "456";
        const mockData: ProviderData = {
          repository: {
            owner: "test",
            name: "project",
            defaultBranch: "main",
          },
        };

        const result = await setupBranch(mockData, mockContext, mockClient);

        expect(result).toEqual({
          baseBranch: "main",
          currentBranch: "test-branch",
        });
      });
    });

    describe("for issues", () => {
      test("should create new branch for issue", async () => {
        mockContext.mergeRequestIid = undefined;
        mockContext.issueIid = "789";
        const mockData: ProviderData = {
          repository: {
            owner: "test",
            name: "project",
            defaultBranch: "main",
          },
          issue: {
            title: "Test Issue",
            description: "Test description",
            author: { username: "testuser" },
            createdAt: "2024-01-01",
            state: "opened",
            comments: [],
          },
        };

        // Mock branch doesn't exist
        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (url.includes("/branches/")) {
            throw new Error("404 Not Found");
          }
          return null as T;
        };

        // Mock branch creation
        mockClient.post = async <T = any>(_url: string): Promise<T> => {
          if (_url.includes("/repository/branches")) {
            return {
              name: "claude-issue-789",
              commit: { id: "def456" },
            } as T;
          }
          return null as T;
        };

        const result = await setupBranch(mockData, mockContext, mockClient);

        expect(result).toEqual({
          baseBranch: "main",
          currentBranch: "claude-issue-789",
          claudeBranch: "claude-issue-789",
        });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "Created new branch: claude-issue-789 from main",
        );
      });

      test("should use existing branch if it already exists", async () => {
        mockContext.mergeRequestIid = undefined;
        mockContext.issueIid = "789";
        const mockData: ProviderData = {
          repository: {
            owner: "test",
            name: "project",
            defaultBranch: "main",
          },
          issue: {
            title: "Test Issue",
            description: "Test description",
            author: { username: "testuser" },
            createdAt: "2024-01-01",
            state: "opened",
            comments: [],
          },
        };

        // Mock branch exists
        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (url.includes("/branches/claude-issue-789")) {
            return {
              name: "claude-issue-789",
              commit: { id: "existing123" },
            } as T;
          }
          return null as T;
        };

        const result = await setupBranch(mockData, mockContext, mockClient);

        expect(result).toEqual({
          baseBranch: "main",
          currentBranch: "claude-issue-789",
          claudeBranch: "claude-issue-789",
        });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "Branch claude-issue-789 already exists",
        );
      });

      test("should use custom base branch when provided", async () => {
        mockContext.mergeRequestIid = undefined;
        mockContext.issueIid = "789";
        mockContext.inputs.baseBranch = "develop";
        const mockData: ProviderData = {
          repository: {
            owner: "test",
            name: "project",
            defaultBranch: "main",
          },
          issue: {
            title: "Test Issue",
            description: "Test description",
            author: { username: "testuser" },
            createdAt: "2024-01-01",
            state: "opened",
            comments: [],
          },
        };

        // Mock branch doesn't exist
        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (url.includes("/branches/")) {
            throw new Error("404 Not Found");
          }
          return null as T;
        };

        // Mock branch creation
        mockClient.post = async <T = any>(
          _url: string,
          data: any,
        ): Promise<T> => {
          if (_url.includes("/repository/branches")) {
            expect(data.ref).toBe("develop");
            return {
              name: "claude-issue-789",
              commit: { id: "def456" },
            } as T;
          }
          return null as T;
        };

        const result = await setupBranch(mockData, mockContext, mockClient);

        expect(result).toEqual({
          baseBranch: "develop",
          currentBranch: "claude-issue-789",
          claudeBranch: "claude-issue-789",
        });
      });

      test("should handle branch creation error", async () => {
        mockContext.mergeRequestIid = undefined;
        mockContext.issueIid = "789";
        const mockData: ProviderData = {
          repository: {
            owner: "test",
            name: "project",
            defaultBranch: "main",
          },
          issue: {
            title: "Test Issue",
            description: "Test description",
            author: { username: "testuser" },
            createdAt: "2024-01-01",
            state: "opened",
            comments: [],
          },
        };

        // Mock branch doesn't exist
        mockClient.get = async <T = any>(): Promise<T> => {
          throw new Error("404 Not Found");
        };

        // Mock branch creation failure
        mockClient.post = async <T = any>(): Promise<T> => {
          throw new Error("Branch creation failed");
        };

        await expect(
          setupBranch(mockData, mockContext, mockClient),
        ).rejects.toThrow(
          "Failed to create branch: Error: Branch creation failed",
        );

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Error creating branch:",
          expect.any(Error),
        );
      });
    });

    describe("fallback behavior", () => {
      test("should return default branch info when no MR or issue", async () => {
        const mockData: ProviderData = {
          repository: {
            owner: "test",
            name: "project",
            defaultBranch: "main",
          },
        };

        const result = await setupBranch(mockData, mockContext, mockClient);

        expect(result).toEqual({
          baseBranch: "main",
          currentBranch: "test-branch",
        });
      });

      test("should use repository default branch when context branch is not set", async () => {
        mockContext.branch = "";
        const mockData: ProviderData = {
          repository: {
            owner: "test",
            name: "project",
            defaultBranch: "main",
          },
        };

        const result = await setupBranch(mockData, mockContext, mockClient);

        expect(result).toEqual({
          baseBranch: "main",
          currentBranch: "main",
        });
      });
    });
  });
});

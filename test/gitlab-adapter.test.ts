import { describe, test, expect, beforeEach, spyOn, afterEach } from "bun:test";
import { GitLabProvider } from "../src/providers/gitlab/adapter";
import type { ProviderContext } from "../src/providers/types";

describe("GitLab Provider Adapter", () => {
  let provider: GitLabProvider;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;
  let mockContext: ProviderContext;

  beforeEach(async () => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});

    // Set up necessary environment variables
    process.env.CI_PROJECT_PATH = "test/project";
    process.env.CI_PROJECT_ID = "123";
    process.env.CI_MERGE_REQUEST_IID = "456";
    process.env.CI_COMMIT_REF_NAME = "feature-branch";
    process.env.CI_DEFAULT_BRANCH = "main";
    process.env.GITLAB_USER_LOGIN = "testuser";
    process.env.GITLAB_TOKEN = "test-token";

    provider = new GitLabProvider();
    // Initialize the provider
    try {
      await provider.setupToken();
    } catch (error) {
      // Expected in tests
    }

    mockContext = {
      provider: "gitlab",
      repository: {
        owner: "test",
        name: "project",
        defaultBranch: "main",
      },
      entityType: "merge_request",
      entityNumber: 456,
      actor: {
        username: "testuser",
      },
      inputs: {
        triggerPhrase: "@claude",
      },
    };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();

    // Clean up environment variables
    delete process.env.CI_PROJECT_PATH;
    delete process.env.CI_PROJECT_ID;
    delete process.env.CI_MERGE_REQUEST_IID;
    delete process.env.CI_COMMIT_REF_NAME;
    delete process.env.CI_DEFAULT_BRANCH;
    delete process.env.GITLAB_USER_LOGIN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.GITLAB_ISSUE_IID;
  });

  describe("setupToken", () => {
    test("should setup token from environment variable", async () => {
      const token = await provider.setupToken();

      expect(token).toBe("test-token");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Using GitLab token from environment",
      );
    });

    test("should throw error when token is missing", async () => {
      delete process.env.GITLAB_TOKEN;

      await expect(provider.setupToken()).rejects.toThrow(
        "GITLAB_TOKEN environment variable is required",
      );
    });
  });

  describe("checkWritePermissions", () => {
    test("should return true for user with write permissions", async () => {
      // Mock the internal client and permissions check
      const mockClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/members/all/")) {
            return {
              id: 1,
              username: "testuser",
              access_level: 30, // Developer
            } as T;
          }
          return null as T;
        },
        post: async () => ({}),
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      // Override the client creation
      (provider as any).client = mockClient;

      const result = await provider.checkWritePermissions(mockContext);

      expect(result).toBe(true);
    });

    test("should return false for user without write permissions", async () => {
      const mockClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/members/all/")) {
            return {
              id: 1,
              username: "testuser",
              access_level: 20, // Reporter
            } as T;
          }
          return null as T;
        },
        post: async () => ({}),
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      const result = await provider.checkWritePermissions(mockContext);

      expect(result).toBe(false);
    });
  });

  describe("checkTriggerAction", () => {
    test("should return true when trigger phrase is found", async () => {
      const mockClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/merge_requests/")) {
            return {
              title: "Test MR",
              description: "Please review @claude",
            } as T;
          }
          if (url.includes("/notes")) {
            return [] as T;
          }
          return null as T;
        },
        post: async () => ({}),
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      const result = await provider.checkTriggerAction(mockContext);

      expect(result).toBe(true);
    });

    test("should return false when trigger phrase is not found", async () => {
      const mockClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/merge_requests/")) {
            return {
              title: "Test MR",
              description: "Regular description",
            } as T;
          }
          if (url.includes("/notes")) {
            return [] as T;
          }
          return null as T;
        },
        post: async () => ({}),
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      const result = await provider.checkTriggerAction(mockContext);

      expect(result).toBe(false);
    });
  });

  describe("checkHumanActor", () => {
    test("should not throw for human user", async () => {
      const mockClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/users/")) {
            return {
              id: 1,
              username: "testuser",
              bot: false,
            } as T;
          }
          return null as T;
        },
        post: async () => ({}),
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      await expect(
        provider.checkHumanActor(mockContext),
      ).resolves.toBeUndefined();
    });

    test("should throw for bot user", async () => {
      const mockClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/users/")) {
            return {
              id: 1,
              username: "testuser",
              bot: true,
            } as T;
          }
          return null as T;
        },
        post: async () => ({}),
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      await expect(provider.checkHumanActor(mockContext)).rejects.toThrow(
        "Action triggered by bot account testuser. Only human users can trigger Claude.",
      );
    });
  });

  describe("createInitialComment", () => {
    test("should create initial comment and return ID", async () => {
      const mockClient = {
        get: async () => ({}),
        post: async <T = any>(_url: string, data: any): Promise<T> => {
          expect(_url).toContain("/notes");
          expect(data.body).toContain("Claude is thinking...");
          return {
            id: 999,
            body: data.body,
          } as T;
        },
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      const result = await provider.createInitialComment(mockContext);

      expect(result).toBe(999);
    });

    test("should handle issue context", async () => {
      mockContext.entityType = "issue";
      delete process.env.CI_MERGE_REQUEST_IID;
      process.env.GITLAB_ISSUE_IID = "789";

      // Reinitialize provider to pick up new env vars
      provider = new GitLabProvider();
      try {
        await provider.setupToken();
      } catch (error) {
        // Expected in tests
      }

      const mockClient = {
        get: async () => ({}),
        post: async <T = any>(_url: string, data: any): Promise<T> => {
          expect(_url).toContain("/issues/789/notes");
          return {
            id: 888,
            body: data.body,
          } as T;
        },
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      const result = await provider.createInitialComment(mockContext);

      expect(result).toBe(888);
    });
  });

  describe("fetchData", () => {
    test("should fetch merge request data", async () => {
      const mockClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/projects/") && !url.includes("/merge_requests")) {
            return {
              id: 123,
              name: "project",
              path: "project",
              path_with_namespace: "test/project",
              default_branch: "main",
              namespace: {
                id: 1,
                name: "test",
                path: "test",
                kind: "group",
                full_path: "test",
              },
            } as T;
          }
          if (
            url.includes("/merge_requests/456") &&
            !url.includes("/notes") &&
            !url.includes("/commits") &&
            !url.includes("/diffs")
          ) {
            return {
              id: 1,
              iid: 456,
              title: "Test MR",
              description: "Test description",
              state: "opened",
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T12:00:00Z",
              source_branch: "feature-branch",
              target_branch: "main",
              author: {
                id: 1,
                username: "testuser",
                name: "Test User",
              },
              sha: "abc123",
              diff_refs: {
                base_sha: "base123",
                head_sha: "head123",
                start_sha: "start123",
              },
            } as T;
          }
          if (
            url.includes("/notes") ||
            url.includes("/commits") ||
            url.includes("/diffs")
          ) {
            return [] as T;
          }
          return null as T;
        },
        post: async () => ({}),
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      const result = await provider.fetchData("test/project", "456", false);

      expect(result.repository.owner).toBe("test");
      expect(result.repository.name).toBe("project");
      expect(result.mergeRequest).toBeDefined();
      expect(result.mergeRequest?.title).toBe("Test MR");
    });

    test("should fetch issue data", async () => {
      const mockClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/projects/") && !url.includes("/issues")) {
            return {
              id: 123,
              name: "project",
              path: "project",
              path_with_namespace: "test/project",
              default_branch: "main",
              namespace: {
                id: 1,
                name: "test",
                path: "test",
                kind: "group",
                full_path: "test",
              },
            } as T;
          }
          if (url.includes("/issues/789")) {
            return {
              id: 1,
              iid: 789,
              title: "Test Issue",
              description: "Test issue description",
              state: "opened",
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T12:00:00Z",
              author: {
                id: 1,
                username: "testuser",
                name: "Test User",
              },
            } as T;
          }
          if (url.includes("/notes")) {
            return [] as T;
          }
          return null as T;
        },
        post: async () => ({}),
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      const result = await provider.fetchData("test/project", "789", true);

      expect(result.issue).toBeDefined();
      expect(result.issue?.title).toBe("Test Issue");
    });
  });

  describe("setupBranch", () => {
    test("should setup branch for merge request", async () => {
      const mockData = {
        repository: {
          owner: "test",
          name: "project",
          defaultBranch: "main",
        },
        mergeRequest: {
          title: "Test MR",
          description: "Test",
          author: { username: "user" },
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

      const result = await provider.setupBranch(mockData, mockContext);

      expect(result).toEqual({
        baseBranch: "main",
        currentBranch: "feature-branch",
      });
    });

    test("should create branch for issue", async () => {
      mockContext.entityType = "issue";
      delete process.env.CI_MERGE_REQUEST_IID;
      process.env.GITLAB_ISSUE_IID = "789";

      // Reinitialize provider to pick up new env vars
      provider = new GitLabProvider();
      try {
        await provider.setupToken();
      } catch (error) {
        // Expected in tests
      }

      const mockData = {
        repository: {
          owner: "test",
          name: "project",
          defaultBranch: "main",
        },
        issue: {
          title: "Test Issue",
          description: "Test",
          author: { username: "user" },
          createdAt: "2024-01-01",
          state: "opened",
          comments: [],
        },
      };

      const mockClient = {
        get: async () => {
          throw new Error("404 Not Found");
        },
        post: async <T = any>(_url: string): Promise<T> => {
          if (_url.includes("/repository/branches")) {
            return {
              name: "claude-issue-789",
              commit: { id: "def456" },
            } as T;
          }
          return null as T;
        },
        put: async () => ({}),
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      const result = await provider.setupBranch(mockData, mockContext);

      expect(result).toEqual({
        baseBranch: "main",
        currentBranch: "claude-issue-789",
        claudeBranch: "claude-issue-789",
      });
    });
  });

  describe("updateTrackingComment", () => {
    test("should update comment with branch", async () => {
      const mockClient = {
        get: async <T = any>(): Promise<T> => {
          return {
            id: 999,
            body: "Claude is working...",
          } as T;
        },
        post: async () => ({}),
        put: async <T = any>(_url: string, data: any): Promise<T> => {
          expect(data.body).toContain("Working on branch:");
          expect(data.body).toContain("feature-branch");
          return {
            id: 999,
            body: data.body,
          } as T;
        },
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      await provider.updateTrackingComment(mockContext, 999, "feature-branch");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Updated comment 999 with branch: feature-branch",
      );
    });
  });

  describe("updateFinalComment", () => {
    test("should update comment with final status", async () => {
      const mockClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/notes/999")) {
            return {
              id: 999,
              body: "Claude is working...",
            } as T;
          }
          if (url.includes("/repository/compare")) {
            return {
              commits: [],
              diffs: [],
            } as T;
          }
          if (url.includes("/notes") && !url.includes("/999")) {
            return [
              {
                id: 999,
                body: "Claude is working...",
              },
            ] as T;
          }
          return null as T;
        },
        post: async () => ({}),
        put: async <T = any>(_url: string, data: any): Promise<T> => {
          expect(data.body).toContain("Claude completed");
          expect(data.body).toContain("✅");
          return {
            id: 999,
            body: data.body,
          } as T;
        },
        delete: async () => ({}),
        request: async () => ({}),
      };

      (provider as any).client = mockClient;

      await provider.updateFinalComment(mockContext, 999, {
        jobUrl: "https://gitlab.com/test/project/-/jobs/12345",
        actionFailed: false,
        executionDetails: { duration_ms: 30000 },
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Updated comment 999 with final status: success",
      );
    });
  });
});

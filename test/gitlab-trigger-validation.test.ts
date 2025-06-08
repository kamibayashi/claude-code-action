import { describe, test, expect, beforeEach, spyOn, afterEach } from "bun:test";
import { checkTriggerAction } from "../src/gitlab/validation/trigger";
import type { GitLabContext } from "../src/gitlab/context";
import type { GitLabClient } from "../src/gitlab/api/client";
import type {
  GitLabMergeRequest,
  GitLabIssue,
  GitLabNote,
} from "../src/gitlab/types";

describe("GitLab trigger validation", () => {
  let mockContext: GitLabContext;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("merge request trigger detection", () => {
    beforeEach(() => {
      mockContext = {
        projectPath: "test/project",
        projectId: "123",
        mergeRequestIid: "456",
        branch: "test-branch",
        defaultBranch: "main",
        triggerUser: "testuser",
        inputs: {
          triggerPhrase: "@claude",
        },
      };
    });

    test("should find trigger phrase in MR description", async () => {
      const mockMR: GitLabMergeRequest = {
        id: 1,
        iid: 456,
        title: "Test MR",
        description: "This is a test MR. @claude please review this.",
        state: "opened",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        source_branch: "feature",
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
      };

      const mockNotes: GitLabNote[] = [];

      const mockClient: GitLabClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/merge_requests/456")) {
            return mockMR as T;
          }
          if (url.includes("/notes")) {
            return mockNotes as T;
          }
          return null as T;
        },
        post: async <T = any>(): Promise<T> => ({}) as T,
        put: async <T = any>(): Promise<T> => ({}) as T,
        delete: async <T = any>(): Promise<T> => ({}) as T,
        request: async <T = any>(): Promise<T> => ({}) as T,
      };

      const result = await checkTriggerAction(mockContext, mockClient);

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Trigger phrase '@claude' found in merge request description",
      );
    });

    test("should find trigger phrase in MR title", async () => {
      const mockMR: GitLabMergeRequest = {
        id: 1,
        iid: 456,
        title: "@claude please fix this bug",
        description: "Bug fix description",
        state: "opened",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        source_branch: "feature",
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
      };

      const mockClient: GitLabClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/merge_requests/456")) {
            return mockMR as T;
          }
          if (url.includes("/notes")) {
            return [] as T;
          }
          return null as T;
        },
        post: async <T = any>(): Promise<T> => ({}) as T,
        put: async <T = any>(): Promise<T> => ({}) as T,
        delete: async <T = any>(): Promise<T> => ({}) as T,
        request: async <T = any>(): Promise<T> => ({}) as T,
      };

      const result = await checkTriggerAction(mockContext, mockClient);

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Trigger phrase '@claude' found in merge request title",
      );
    });

    test("should not find trigger phrase when absent", async () => {
      const mockMR: GitLabMergeRequest = {
        id: 1,
        iid: 456,
        title: "Regular MR",
        description: "Regular description without trigger",
        state: "opened",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        source_branch: "feature",
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
      };

      const mockClient: GitLabClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/merge_requests/456")) {
            return mockMR as T;
          }
          if (url.includes("/notes")) {
            return [] as T;
          }
          return null as T;
        },
        post: async <T = any>(): Promise<T> => ({}) as T,
        put: async <T = any>(): Promise<T> => ({}) as T,
        delete: async <T = any>(): Promise<T> => ({}) as T,
        request: async <T = any>(): Promise<T> => ({}) as T,
      };

      const result = await checkTriggerAction(mockContext, mockClient);

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Trigger phrase '@claude' not found in merge request 456 or its comments",
      );
    });
  });

  describe("issue trigger detection", () => {
    beforeEach(() => {
      mockContext = {
        projectPath: "test/project",
        projectId: "123",
        issueIid: "789",
        branch: "test-branch",
        defaultBranch: "main",
        triggerUser: "testuser",
        inputs: {
          triggerPhrase: "@claude",
        },
      };
    });

    test("should find trigger phrase in issue description", async () => {
      const mockIssue: GitLabIssue = {
        id: 1,
        iid: 789,
        title: "Test Issue",
        description: "Issue description with @claude trigger",
        state: "opened",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        author: {
          id: 1,
          username: "testuser",
          name: "Test User",
        },
      };

      const mockClient: GitLabClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/issues/789")) {
            return mockIssue as T;
          }
          if (url.includes("/notes")) {
            return [] as T;
          }
          return null as T;
        },
        post: async <T = any>(): Promise<T> => ({}) as T,
        put: async <T = any>(): Promise<T> => ({}) as T,
        delete: async <T = any>(): Promise<T> => ({}) as T,
        request: async <T = any>(): Promise<T> => ({}) as T,
      };

      const result = await checkTriggerAction(mockContext, mockClient);

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Trigger phrase '@claude' found in issue description",
      );
    });

    test("should find trigger phrase in issue title", async () => {
      const mockIssue: GitLabIssue = {
        id: 1,
        iid: 789,
        title: "@claude help with this issue",
        description: "Issue description",
        state: "opened",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        author: {
          id: 1,
          username: "testuser",
          name: "Test User",
        },
      };

      const mockClient: GitLabClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/issues/789")) {
            return mockIssue as T;
          }
          if (url.includes("/notes")) {
            return [] as T;
          }
          return null as T;
        },
        post: async <T = any>(): Promise<T> => ({}) as T,
        put: async <T = any>(): Promise<T> => ({}) as T,
        delete: async <T = any>(): Promise<T> => ({}) as T,
        request: async <T = any>(): Promise<T> => ({}) as T,
      };

      const result = await checkTriggerAction(mockContext, mockClient);

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Trigger phrase '@claude' found in issue title",
      );
    });

    test("should not find trigger phrase when absent from issue", async () => {
      const mockIssue: GitLabIssue = {
        id: 1,
        iid: 789,
        title: "Regular Issue",
        description: "Regular issue description",
        state: "opened",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        author: {
          id: 1,
          username: "testuser",
          name: "Test User",
        },
      };

      const mockClient: GitLabClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/issues/789")) {
            return mockIssue as T;
          }
          if (url.includes("/notes")) {
            return [] as T;
          }
          return null as T;
        },
        post: async <T = any>(): Promise<T> => ({}) as T,
        put: async <T = any>(): Promise<T> => ({}) as T,
        delete: async <T = any>(): Promise<T> => ({}) as T,
        request: async <T = any>(): Promise<T> => ({}) as T,
      };

      const result = await checkTriggerAction(mockContext, mockClient);

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Trigger phrase '@claude' not found in issue 789 or its comments",
      );
    });
  });

  describe("comment trigger detection", () => {
    test("should find trigger phrase in merge request comment", async () => {
      mockContext = {
        projectPath: "test/project",
        projectId: "123",
        mergeRequestIid: "456",
        branch: "test-branch",
        defaultBranch: "main",
        triggerUser: "testuser",
        inputs: {
          triggerPhrase: "@claude",
        },
      };

      const mockMR: GitLabMergeRequest = {
        id: 1,
        iid: 456,
        title: "Test MR",
        description: "No trigger here",
        state: "opened",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        source_branch: "feature",
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
      };

      const mockNotes: GitLabNote[] = [
        {
          id: 1,
          body: "Regular comment",
          author: {
            id: 1,
            username: "user1",
            name: "User 1",
          },
          created_at: "2024-01-01T10:00:00Z",
          updated_at: "2024-01-01T10:00:00Z",
        },
        {
          id: 2,
          body: "@claude please review this code",
          author: {
            id: 2,
            username: "user2",
            name: "User 2",
          },
          created_at: "2024-01-01T11:00:00Z",
          updated_at: "2024-01-01T11:00:00Z",
        },
      ];

      const mockClient: GitLabClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/merge_requests/456") && !url.includes("/notes")) {
            return mockMR as T;
          }
          if (url.includes("/notes")) {
            return mockNotes as T;
          }
          return null as T;
        },
        post: async <T = any>(): Promise<T> => ({}) as T,
        put: async <T = any>(): Promise<T> => ({}) as T,
        delete: async <T = any>(): Promise<T> => ({}) as T,
        request: async <T = any>(): Promise<T> => ({}) as T,
      };

      const result = await checkTriggerAction(mockContext, mockClient);

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Trigger phrase '@claude' found in comment",
      );
    });

    test("should find trigger phrase in issue comment", async () => {
      mockContext = {
        projectPath: "test/project",
        projectId: "123",
        issueIid: "789",
        branch: "test-branch",
        defaultBranch: "main",
        triggerUser: "testuser",
        inputs: {
          triggerPhrase: "@claude",
        },
      };

      const mockIssue: GitLabIssue = {
        id: 1,
        iid: 789,
        title: "Test Issue",
        description: "No trigger here",
        state: "opened",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        author: {
          id: 1,
          username: "testuser",
          name: "Test User",
        },
      };

      const mockNotes: GitLabNote[] = [
        {
          id: 1,
          body: "@claude can you help with this?",
          author: {
            id: 1,
            username: "user1",
            name: "User 1",
          },
          created_at: "2024-01-01T10:00:00Z",
          updated_at: "2024-01-01T10:00:00Z",
        },
      ];

      const mockClient: GitLabClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/issues/789") && !url.includes("/notes")) {
            return mockIssue as T;
          }
          if (url.includes("/notes")) {
            return mockNotes as T;
          }
          return null as T;
        },
        post: async <T = any>(): Promise<T> => ({}) as T,
        put: async <T = any>(): Promise<T> => ({}) as T,
        delete: async <T = any>(): Promise<T> => ({}) as T,
        request: async <T = any>(): Promise<T> => ({}) as T,
      };

      const result = await checkTriggerAction(mockContext, mockClient);

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Trigger phrase '@claude' found in comment",
      );
    });

    test("should check case-insensitive trigger phrase", async () => {
      mockContext = {
        projectPath: "test/project",
        projectId: "123",
        mergeRequestIid: "456",
        branch: "test-branch",
        defaultBranch: "main",
        triggerUser: "testuser",
        inputs: {
          triggerPhrase: "@claude",
        },
      };

      const mockMR: GitLabMergeRequest = {
        id: 1,
        iid: 456,
        title: "Test MR",
        description: "Please review @CLAUDE",
        state: "opened",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        source_branch: "feature",
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
      };

      const mockNotes: GitLabNote[] = [];

      const mockClient: GitLabClient = {
        get: async <T = any>(url: string): Promise<T> => {
          if (url.includes("/merge_requests/456")) {
            return mockMR as T;
          }
          if (url.includes("/notes")) {
            return mockNotes as T;
          }
          return null as T;
        },
        post: async <T = any>(): Promise<T> => ({}) as T,
        put: async <T = any>(): Promise<T> => ({}) as T,
        delete: async <T = any>(): Promise<T> => ({}) as T,
        request: async <T = any>(): Promise<T> => ({}) as T,
      };

      const result = await checkTriggerAction(mockContext, mockClient);

      expect(result).toBe(true);
    });
  });
});

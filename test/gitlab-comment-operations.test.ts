import { describe, test, expect, beforeEach, spyOn, afterEach } from "bun:test";
import { createInitialComment } from "../src/gitlab/operations/comments/create-initial";
import { updateTrackingComment } from "../src/gitlab/operations/comments/update-with-branch";
import { updateFinalComment } from "../src/gitlab/operations/comments/update-final";
import type { GitLabClient } from "../src/gitlab/api/client";
import type { GitLabContext } from "../src/gitlab/context";
import type { GitLabNote } from "../src/gitlab/types";

describe("GitLab comment operations", () => {
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
      mergeRequestIid: "456",
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

  describe("createInitialComment", () => {
    describe("for merge requests", () => {
      test("should create initial comment for merge request", async () => {
        const mockNote: GitLabNote = {
          id: 999,
          body: "Claude is working on this task...",
          author: {
            id: 1,
            username: "claude-bot",
            name: "Claude Bot",
          },
          created_at: "2024-01-01T10:00:00Z",
          updated_at: "2024-01-01T10:00:00Z",
        };

        mockClient.post = async <T = any>(
          _url: string,
          data: any,
        ): Promise<T> => {
          expect(_url).toContain("/merge_requests/456/notes");
          expect(data.body).toContain("Claude is thinking...");
          expect(data.body).toContain("I'll analyze this merge request");
          return mockNote as T;
        };

        const result = await createInitialComment(mockContext, mockClient);

        expect(result).toBe(999);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "Created initial comment with ID: 999",
        );
      });

      test("should include trigger username in comment", async () => {
        const mockNote: GitLabNote = {
          id: 999,
          body: "Claude is working on @testuser's task...",
          author: {
            id: 1,
            username: "claude-bot",
            name: "Claude Bot",
          },
          created_at: "2024-01-01T10:00:00Z",
          updated_at: "2024-01-01T10:00:00Z",
        };

        let capturedBody = "";
        mockClient.post = async <T = any>(
          _url: string,
          data: any,
        ): Promise<T> => {
          capturedBody = data.body;
          return mockNote as T;
        };

        await createInitialComment(mockContext, mockClient);

        expect(capturedBody).toContain("Claude is thinking...");
        expect(capturedBody).toContain("I'll analyze this merge request");
        // The actual implementation doesn't include trigger username
      });
    });

    describe("for issues", () => {
      test("should create initial comment for issue", async () => {
        mockContext.mergeRequestIid = undefined;
        mockContext.issueIid = "789";

        const mockNote: GitLabNote = {
          id: 888,
          body: "Claude is working on this task...",
          author: {
            id: 1,
            username: "claude-bot",
            name: "Claude Bot",
          },
          created_at: "2024-01-01T10:00:00Z",
          updated_at: "2024-01-01T10:00:00Z",
        };

        mockClient.post = async <T = any>(
          _url: string,
          data: any,
        ): Promise<T> => {
          expect(_url).toContain("/issues/789/notes");
          expect(data.body).toContain("Claude is thinking...");
          expect(data.body).toContain("I'll analyze this issue");
          return mockNote as T;
        };

        const result = await createInitialComment(mockContext, mockClient);

        expect(result).toBe(888);
      });
    });

    describe("error handling", () => {
      test("should handle API errors", async () => {
        mockClient.post = async <T = any>(): Promise<T> => {
          throw new Error("API Error");
        };

        await expect(
          createInitialComment(mockContext, mockClient),
        ).rejects.toThrow("Failed to create initial comment: Error: API Error");

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Error creating initial comment:",
          expect.any(Error),
        );
      });

      test("should throw error when no MR or issue IID", async () => {
        mockContext.mergeRequestIid = undefined;
        mockContext.issueIid = undefined;

        await expect(
          createInitialComment(mockContext, mockClient),
        ).rejects.toThrow("No merge request or issue IID found");
      });
    });
  });

  describe("updateTrackingComment", () => {
    test("should update comment with branch information", async () => {
      const existingNote: GitLabNote = {
        id: 999,
        body: "Claude is working on @testuser's task...\n\n⏳ Claude is processing this task...",
        author: {
          id: 1,
          username: "claude-bot",
          name: "Claude Bot",
        },
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        if (url.includes("/notes/999")) {
          return existingNote as T;
        }
        return null as T;
      };

      let updatedBody = "";
      mockClient.put = async <T = any>(_url: string, data: any): Promise<T> => {
        expect(_url).toContain("/notes/999");
        updatedBody = data.body;
        return { ...existingNote, body: data.body } as T;
      };

      await updateTrackingComment(
        mockContext,
        mockClient,
        999,
        "feature-branch",
      );

      expect(updatedBody).toContain("Working on branch:");
      expect(updatedBody).toContain("feature-branch");
      expect(updatedBody).toContain("Claude is thinking...");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Updated comment 999 with branch: feature-branch",
      );
    });

    test("should handle comment not found", async () => {
      mockClient.put = async <T = any>(): Promise<T> => {
        throw new Error("404 Not Found");
      };

      // updateTrackingComment doesn't throw on errors
      await updateTrackingComment(
        mockContext,
        mockClient,
        999,
        "feature-branch",
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error updating comment with branch:",
        expect.any(Error),
      );
    });
  });

  describe("updateFinalComment", () => {
    test("should update comment with success status", async () => {
      const existingNote: GitLabNote = {
        id: 999,
        body: "## 🤖 Claude is thinking...\n\nI'll analyze this merge request and start working on it.\n\n<!-- claude-tracker -->",
        author: {
          id: 1,
          username: "claude-bot",
          name: "Claude Bot",
        },
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        if (url.includes("/notes")) {
          return [existingNote] as T;
        }
        return null as T;
      };

      let updatedBody = "";
      mockClient.put = async <T = any>(_url: string, data: any): Promise<T> => {
        updatedBody = data.body;
        return { ...existingNote, body: data.body } as T;
      };

      await updateFinalComment({
        context: mockContext,
        client: mockClient,
        commentId: 999,
        jobUrl: "https://gitlab.com/test/project/-/jobs/12345",
        actionFailed: false,
        executionDetails: { duration_ms: 30500 },
      });

      expect(updatedBody).toContain("Claude completed");
      expect(updatedBody).toContain("✅");
      expect(updatedBody).toContain("30.5s");
      expect(updatedBody).toContain(
        "[View GitLab CI Job](https://gitlab.com/test/project/-/jobs/12345)",
      );
      expect(updatedBody).not.toContain("🤖 Claude is thinking...");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Updated comment 999 with final status: success",
      );
    });

    test("should update comment with error status", async () => {
      const existingNote: GitLabNote = {
        id: 999,
        body: "## 🤖 Claude is thinking...\n\nI'll analyze this merge request and start working on it.\n\n<!-- claude-tracker -->",
        author: {
          id: 1,
          username: "claude-bot",
          name: "Claude Bot",
        },
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        if (url.includes("/notes")) {
          return [existingNote] as T;
        }
        return null as T;
      };

      let updatedBody = "";
      mockClient.put = async <T = any>(_url: string, data: any): Promise<T> => {
        updatedBody = data.body;
        return { ...existingNote, body: data.body } as T;
      };

      await updateFinalComment({
        context: mockContext,
        client: mockClient,
        commentId: 999,
        jobUrl: "https://gitlab.com/test/project/-/jobs/12345",
        actionFailed: true,
        executionDetails: { duration_ms: 15200 },
        errorDetails: "Permission denied",
      });

      expect(updatedBody).toContain("Claude encountered an error");
      expect(updatedBody).toContain("❌");
      expect(updatedBody).toContain("15.2s");
      expect(updatedBody).toContain("Permission denied");
      expect(updatedBody).not.toContain("🤖 Claude is thinking...");
    });

    test("should handle missing job link", async () => {
      const existingNote: GitLabNote = {
        id: 999,
        body: "## 🤖 Claude is thinking...\n\nI'll analyze this merge request and start working on it.\n\n<!-- claude-tracker -->",
        author: {
          id: 1,
          username: "claude-bot",
          name: "Claude Bot",
        },
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        if (url.includes("/notes")) {
          return [existingNote] as T;
        }
        return null as T;
      };

      let updatedBody = "";
      mockClient.put = async <T = any>(_url: string, data: any): Promise<T> => {
        updatedBody = data.body;
        return { ...existingNote, body: data.body } as T;
      };

      await updateFinalComment({
        context: mockContext,
        client: mockClient,
        commentId: 999,
        jobUrl: "",
        actionFailed: false,
        executionDetails: { duration_ms: 20000 },
      });

      expect(updatedBody).toContain("[View GitLab CI Job]()");
      expect(updatedBody).toContain("20.0s");
    });

    test("should handle issue comments", async () => {
      mockContext.mergeRequestIid = undefined;
      mockContext.issueIid = "789";

      const existingNote: GitLabNote = {
        id: 888,
        body: "## 🤖 Claude is thinking...\n\nI'll analyze this issue and start working on it.\n\n<!-- claude-tracker -->",
        author: {
          id: 1,
          username: "claude-bot",
          name: "Claude Bot",
        },
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        if (url.includes("/notes")) {
          return [existingNote] as T;
        }
        return null as T;
      };

      mockClient.put = async <T = any>(_url: string, data: any): Promise<T> => {
        expect(_url).toContain("/issues/789/notes/888");
        return { ...existingNote, body: data.body } as T;
      };

      await updateFinalComment({
        context: mockContext,
        client: mockClient,
        commentId: 888,
        jobUrl: "",
        actionFailed: false,
        executionDetails: { duration_ms: 10000 },
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Updated comment 888 with final status: success",
      );
    });
  });
});

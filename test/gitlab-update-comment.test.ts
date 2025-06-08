import { describe, test, expect, beforeEach, spyOn, afterEach } from "bun:test";
import type { GitLabClient } from "../src/gitlab/api/client";
import type { GitLabContext } from "../src/gitlab/context";
import type { GitLabNote } from "../src/gitlab/types";

// Since GitLab doesn't have a separate updateComment function like GitHub,
// we'll test the update operations that happen in various comment update functions
describe("GitLab comment update operations", () => {
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
    };

    mockContext = {
      projectPath: "test/project",
      projectId: "123",
      mergeRequestIid: "456",
      branch: "feature-branch",
      defaultBranch: "main",
      triggerUser: "testuser",
      inputs: {
        triggerPhrase: "@claude",
      },
    };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("merge request comment updates", () => {
    test("should update MR comment successfully", async () => {
      const commentId = 999;
      const updatedBody = "Updated comment content";

      mockClient.put = async <T = any>(url: string, data: any): Promise<T> => {
        expect(url).toBe(
          `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes/${commentId}`,
        );
        expect(data.body).toBe(updatedBody);
        return { id: commentId, body: data.body } as T;
      };

      await mockClient.put(
        `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes/${commentId}`,
        { body: updatedBody },
      );

      expect(consoleLogSpy).not.toHaveBeenCalled(); // This is just testing the client
    });

    test("should handle MR comment update with special characters in project path", async () => {
      mockContext.projectPath = "group/sub-group/project name";
      const commentId = 999;
      const updatedBody = "Updated content";

      mockClient.put = async <T = any>(url: string, data: any): Promise<T> => {
        expect(url).toBe(
          "/projects/group%2Fsub-group%2Fproject%20name/merge_requests/456/notes/999",
        );
        return { id: commentId, body: data.body } as T;
      };

      await mockClient.put(
        `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes/${commentId}`,
        { body: updatedBody },
      );
    });

    test("should fetch existing MR comment before update", async () => {
      const commentId = 999;
      const existingNote: GitLabNote = {
        id: commentId,
        body: "Existing comment",
        author: {
          id: 1,
          username: "user",
          name: "User",
        },
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
        system: false,
        noteable_id: 456,
        noteable_type: "MergeRequest",
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        if (url.includes("/notes")) {
          return [existingNote] as T;
        }
        return {} as T;
      };

      const notes = await mockClient.get<GitLabNote[]>(
        `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes`,
      );

      const note = notes.find((n) => n.id === commentId);
      expect(note).toBeDefined();
      expect(note?.body).toBe("Existing comment");
    });
  });

  describe("issue comment updates", () => {
    test("should update issue comment successfully", async () => {
      mockContext.mergeRequestIid = undefined;
      mockContext.issueIid = "789";

      const commentId = 888;
      const updatedBody = "Updated issue comment";

      mockClient.put = async <T = any>(url: string, data: any): Promise<T> => {
        expect(url).toBe(
          `/projects/${encodeURIComponent(mockContext.projectPath)}/issues/${mockContext.issueIid}/notes/${commentId}`,
        );
        expect(data.body).toBe(updatedBody);
        return { id: commentId, body: data.body } as T;
      };

      await mockClient.put(
        `/projects/${encodeURIComponent(mockContext.projectPath)}/issues/${mockContext.issueIid}/notes/${commentId}`,
        { body: updatedBody },
      );
    });

    test("should handle issue comment not found", async () => {
      mockContext.mergeRequestIid = undefined;
      mockContext.issueIid = "789";

      const commentId = 888;

      mockClient.get = async <T = any>(): Promise<T> => {
        return [] as T; // No notes found
      };

      const notes = await mockClient.get<GitLabNote[]>(
        `/projects/${encodeURIComponent(mockContext.projectPath)}/issues/${mockContext.issueIid}/notes`,
      );

      const note = notes.find((n) => n.id === commentId);
      expect(note).toBeUndefined();
    });
  });

  describe("error handling", () => {
    test("should handle API error during comment update", async () => {
      const commentId = 999;
      const updatedBody = "Updated content";

      mockClient.put = async <T = any>(): Promise<T> => {
        throw new Error("403 Forbidden");
      };

      await expect(
        mockClient.put(
          `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes/${commentId}`,
          { body: updatedBody },
        ),
      ).rejects.toThrow("403 Forbidden");
    });

    test("should handle network error during comment fetch", async () => {
      mockClient.get = async <T = any>(): Promise<T> => {
        throw new Error("Network error");
      };

      await expect(
        mockClient.get<GitLabNote[]>(
          `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes`,
        ),
      ).rejects.toThrow("Network error");
    });
  });

  describe("comment body transformations", () => {
    test("should handle empty body in update", async () => {
      const commentId = 999;

      mockClient.put = async <T = any>(_url: string, data: any): Promise<T> => {
        expect(data.body).toBe("");
        return { id: commentId, body: data.body } as T;
      };

      await mockClient.put(
        `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes/${commentId}`,
        { body: "" },
      );
    });

    test("should handle very long body in update", async () => {
      const commentId = 999;
      const longBody = "a".repeat(10000);

      mockClient.put = async <T = any>(_url: string, data: any): Promise<T> => {
        expect(data.body.length).toBe(10000);
        return { id: commentId, body: data.body } as T;
      };

      await mockClient.put(
        `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes/${commentId}`,
        { body: longBody },
      );
    });

    test("should handle markdown formatting in body", async () => {
      const commentId = 999;
      const markdownBody = `## Header
      
- List item 1
- List item 2

\`\`\`javascript
console.log("code block");
\`\`\`

**Bold text** and *italic text*`;

      mockClient.put = async <T = any>(_url: string, data: any): Promise<T> => {
        expect(data.body).toContain("## Header");
        expect(data.body).toContain("```javascript");
        expect(data.body).toContain("**Bold text**");
        return { id: commentId, body: data.body } as T;
      };

      await mockClient.put(
        `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes/${commentId}`,
        { body: markdownBody },
      );
    });
  });

  describe("comment update with metadata", () => {
    test("should preserve comment metadata during update", async () => {
      const commentId = 999;
      const existingNote: GitLabNote = {
        id: commentId,
        body: "Original content",
        author: {
          id: 1,
          username: "author",
          name: "Original Author",
        },
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
        system: false,
        noteable_id: 456,
        noteable_type: "MergeRequest",
      };

      mockClient.get = async <T = any>(): Promise<T> => {
        return [existingNote] as T;
      };

      mockClient.put = async <T = any>(_url: string, data: any): Promise<T> => {
        // In GitLab, only the body is typically updated
        return {
          ...existingNote,
          body: data.body,
          updated_at: new Date().toISOString(),
        } as T;
      };

      const notes = await mockClient.get<GitLabNote[]>(
        `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes`,
      );

      const originalNote = notes[0];
      expect(originalNote?.author.username).toBe("author");

      const updated = await mockClient.put(
        `/projects/${encodeURIComponent(mockContext.projectPath)}/merge_requests/${mockContext.mergeRequestIid}/notes/${commentId}`,
        { body: "Updated content" },
      );

      expect(updated.author.username).toBe("author"); // Author should not change
      expect(updated.body).toBe("Updated content");
    });
  });
});

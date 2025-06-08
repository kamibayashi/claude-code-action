import { describe, test, expect, beforeEach, spyOn, afterEach } from "bun:test";
import { fetchGitLabData } from "../src/gitlab/data/fetcher";
import type { GitLabClient } from "../src/gitlab/api/client";
import type {
  GitLabMergeRequest,
  GitLabIssue,
  GitLabNote,
  GitLabCommit,
  GitLabDiff,
  GitLabProject,
} from "../src/gitlab/types";

describe("GitLab data fetcher", () => {
  let mockClient: GitLabClient;
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
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("fetchGitLabData", () => {
    describe("merge request data", () => {
      test("should fetch complete merge request data", async () => {
        const mockProject: GitLabProject = {
          id: 123,
          name: "test-project",
          path: "test-project",
          path_with_namespace: "test/test-project",
          default_branch: "main",
          namespace: {
            id: 1,
            name: "test",
            path: "test",
            kind: "group",
            full_path: "test",
          },
        };

        const mockMR: GitLabMergeRequest = {
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
          changes_count: "15",
        };

        const mockNotes: GitLabNote[] = [
          {
            id: 1,
            body: "First comment",
            author: {
              id: 1,
              username: "user1",
              name: "User 1",
            },
            created_at: "2024-01-01T10:00:00Z",
            updated_at: "2024-01-01T10:00:00Z",
            system: false,
          },
          {
            id: 2,
            body: "Second comment",
            author: {
              id: 2,
              username: "user2",
              name: "User 2",
            },
            created_at: "2024-01-01T11:00:00Z",
            updated_at: "2024-01-01T11:00:00Z",
          },
        ];

        const mockCommits: GitLabCommit[] = [
          {
            id: "commit1",
            short_id: "commit1",
            title: "First commit",
            message: "First commit message",
            author_name: "Test User",
            author_email: "test@example.com",
            authored_date: "2024-01-01T09:00:00Z",
          },
        ];

        const mockDiffs: GitLabDiff[] = [
          {
            old_path: "file.js",
            new_path: "file.js",
            a_mode: "100644",
            b_mode: "100644",
            diff: "@@ -1,3 +1,3 @@\n-old\n+new",
            new_file: false,
            renamed_file: false,
            deleted_file: false,
          },
        ];

        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (
            url.includes("/projects/") &&
            !url.includes("/merge_requests/") &&
            !url.includes("/issues/")
          ) {
            return mockProject as T;
          }
          if (
            url.includes("/merge_requests/456") &&
            !url.includes("/notes") &&
            !url.includes("/commits") &&
            !url.includes("/diffs")
          ) {
            return mockMR as T;
          }
          if (url.includes("/notes")) {
            return mockNotes as T;
          }
          if (url.includes("/commits")) {
            return mockCommits as T;
          }
          if (url.includes("/diffs")) {
            return mockDiffs as T;
          }
          return null as T;
        };

        const result = await fetchGitLabData({
          projectPath: "test/test-project",
          entityNumber: "456",
          isMR: true,
          client: mockClient,
        });

        expect(result.repository).toEqual({
          owner: "test",
          name: "test-project",
          defaultBranch: "main",
        });

        expect(result.mergeRequest).toBeDefined();
        expect(result.mergeRequest?.title).toBe("Test MR");
        expect(result.mergeRequest?.sourceBranch).toBe("feature-branch");
        expect(result.mergeRequest?.targetBranch).toBe("main");
        expect(result.mergeRequest?.comments).toHaveLength(2);
        expect(result.mergeRequest?.commits).toHaveLength(1);
        expect(result.mergeRequest?.files).toHaveLength(1);
        expect(result.mergeRequest?.additions).toBe(1);
        expect(result.mergeRequest?.deletions).toBe(1);
      });

      test("should handle merge request with no diffs", async () => {
        const mockProject: GitLabProject = {
          id: 123,
          name: "test-project",
          path: "test-project",
          path_with_namespace: "test/test-project",
          default_branch: "main",
          namespace: {
            id: 1,
            name: "test",
            path: "test",
            kind: "group",
            full_path: "test",
          },
        };

        const mockMR: GitLabMergeRequest = {
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
        };

        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (
            url.includes("/projects/") &&
            !url.includes("/merge_requests/") &&
            !url.includes("/issues/")
          ) {
            return mockProject as T;
          }
          if (
            url.includes("/merge_requests/456") &&
            !url.includes("/notes") &&
            !url.includes("/commits") &&
            !url.includes("/diffs")
          ) {
            return mockMR as T;
          }
          if (url.includes("/notes")) {
            return [] as T;
          }
          if (url.includes("/commits")) {
            return [] as T;
          }
          if (url.includes("/diffs")) {
            return [] as T;
          }
          return null as T;
        };

        const result = await fetchGitLabData({
          projectPath: "test/test-project",
          entityNumber: "456",
          isMR: true,
          client: mockClient,
        });

        expect(result.mergeRequest).toBeDefined();
        expect(result.mergeRequest?.files).toHaveLength(0);
        expect(result.mergeRequest?.additions).toBe(0);
        expect(result.mergeRequest?.deletions).toBe(0);
      });
    });

    describe("issue data", () => {
      test("should fetch complete issue data", async () => {
        const mockProject: GitLabProject = {
          id: 123,
          name: "test-project",
          path: "test-project",
          path_with_namespace: "test/test-project",
          default_branch: "main",
          namespace: {
            id: 1,
            name: "test",
            path: "test",
            kind: "group",
            full_path: "test",
          },
        };

        const mockIssue: GitLabIssue = {
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
          assignees: [
            {
              id: 2,
              username: "assignee1",
              name: "Assignee 1",
            },
          ],
          labels: ["bug", "feature"],
        };

        const mockNotes: GitLabNote[] = [
          {
            id: 1,
            body: "Issue comment",
            author: {
              id: 1,
              username: "user1",
              name: "User 1",
            },
            created_at: "2024-01-01T10:00:00Z",
            updated_at: "2024-01-01T10:00:00Z",
            system: false,
          },
        ];

        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (
            url.includes("/projects/") &&
            !url.includes("/merge_requests/") &&
            !url.includes("/issues/")
          ) {
            return mockProject as T;
          }
          if (url.includes("/issues/789") && !url.includes("/notes")) {
            return mockIssue as T;
          }
          if (url.includes("/notes")) {
            return mockNotes as T;
          }
          return null as T;
        };

        const result = await fetchGitLabData({
          projectPath: "test/test-project",
          entityNumber: "789",
          isMR: false,
          client: mockClient,
        });

        expect(result.repository).toEqual({
          owner: "test",
          name: "test-project",
          defaultBranch: "main",
        });

        expect(result.issue).toBeDefined();
        expect(result.issue?.title).toBe("Test Issue");
        expect(result.issue?.description).toBe("Test issue description");
        expect(result.issue?.comments).toHaveLength(1);
        expect(result.issue?.comments?.[0]?.body).toBe("Issue comment");
      });
    });

    describe("error handling", () => {
      test("should handle API errors gracefully", async () => {
        mockClient.get = async <T = any>(): Promise<T> => {
          throw new Error("API Error");
        };

        await expect(
          fetchGitLabData({
            projectPath: "test/test-project",
            entityNumber: "456",
            isMR: true,
            client: mockClient,
          }),
        ).rejects.toThrow("API Error");
      });

      test("should handle missing project", async () => {
        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (url.includes("/projects/")) {
            throw new Error("404 Not Found");
          }
          return null as T;
        };

        await expect(
          fetchGitLabData({
            projectPath: "test/test-project",
            entityNumber: "456",
            isMR: true,
            client: mockClient,
          }),
        ).rejects.toThrow("404 Not Found");
      });

      test("should handle missing merge request", async () => {
        const mockProject: GitLabProject = {
          id: 123,
          name: "test-project",
          path: "test-project",
          path_with_namespace: "test/test-project",
          default_branch: "main",
          namespace: {
            id: 1,
            name: "test",
            path: "test",
            kind: "group",
            full_path: "test",
          },
        };

        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (
            url.includes("/projects/") &&
            !url.includes("/merge_requests/") &&
            !url.includes("/issues/")
          ) {
            return mockProject as T;
          }
          if (url.includes("/merge_requests/")) {
            throw new Error("404 Not Found");
          }
          return null as T;
        };

        await expect(
          fetchGitLabData({
            projectPath: "test/test-project",
            entityNumber: "456",
            isMR: true,
            client: mockClient,
          }),
        ).rejects.toThrow("404 Not Found");
      });
    });

    describe("data transformation", () => {
      test("should transform GitLab data to provider format correctly", async () => {
        const mockProject: GitLabProject = {
          id: 123,
          name: "test-project",
          path: "test-project",
          path_with_namespace: "namespace/test-project",
          default_branch: "develop",
          namespace: {
            id: 1,
            name: "namespace",
            path: "namespace",
            kind: "group",
            full_path: "namespace",
          },
        };

        const mockMR: GitLabMergeRequest = {
          id: 1,
          iid: 456,
          title: "Feature: Add new functionality",
          description: "This adds new functionality\n\nCloses #123",
          state: "opened",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T12:00:00Z",
          source_branch: "feature/new-functionality",
          target_branch: "develop",
          author: {
            id: 1,
            username: "developer",
            name: "Developer Name",
          },
          sha: "abc123def456",
          diff_refs: {
            base_sha: "base123",
            head_sha: "head123",
            start_sha: "start123",
          },
        };

        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (
            url.includes("/projects/") &&
            !url.includes("/merge_requests/") &&
            !url.includes("/issues/")
          ) {
            return mockProject as T;
          }
          if (
            url.includes("/merge_requests/456") &&
            !url.includes("/notes") &&
            !url.includes("/commits") &&
            !url.includes("/diffs")
          ) {
            return mockMR as T;
          }
          if (
            url.includes("/notes") ||
            url.includes("/commits") ||
            url.includes("/diffs")
          ) {
            return [] as T;
          }
          return null as T;
        };

        const result = await fetchGitLabData({
          projectPath: "namespace/test-project",
          entityNumber: "456",
          isMR: true,
          client: mockClient,
        });

        expect(result.repository.owner).toBe("namespace");
        expect(result.repository.name).toBe("test-project");
        expect(result.repository.defaultBranch).toBe("develop");

        expect(result.mergeRequest?.author.username).toBe("developer");
        expect(result.mergeRequest?.author.displayName).toBe("Developer Name");
        expect(result.mergeRequest?.headSha).toBe("abc123def456");
      });
    });
  });
});

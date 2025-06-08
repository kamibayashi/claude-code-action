import { describe, test, expect, beforeEach, spyOn, afterEach } from "bun:test";
import { checkAndDeleteEmptyBranch } from "../src/gitlab/operations/branch-cleanup";
import type { GitLabClient } from "../src/gitlab/api/client";

describe("GitLab branch cleanup", () => {
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

  describe("checkAndDeleteEmptyBranch", () => {
    test("should return no branch link when branch name is undefined", async () => {
      const result = await checkAndDeleteEmptyBranch(
        mockClient,
        "test/project",
        undefined,
        "main",
      );

      expect(result).toEqual({
        shouldDeleteBranch: false,
        branchLink: "",
      });
    });

    test("should return no branch link when base branch is undefined", async () => {
      const result = await checkAndDeleteEmptyBranch(
        mockClient,
        "test/project",
        "feature-branch",
        undefined,
      );

      expect(result).toEqual({
        shouldDeleteBranch: false,
        branchLink: "",
      });
    });

    test("should not delete when branch name equals base branch", async () => {
      const result = await checkAndDeleteEmptyBranch(
        mockClient,
        "test/project",
        "main",
        "main",
      );

      expect(result).toEqual({
        shouldDeleteBranch: false,
        branchLink: "",
      });
    });

    test("should delete branch when it has no changes", async () => {
      const mockComparison = {
        commits: [],
        diffs: [],
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        if (url.includes("/repository/compare")) {
          return mockComparison as T;
        }
        return null as T;
      };

      mockClient.delete = async <T = any>(url: string): Promise<T> => {
        expect(url).toContain("/repository/branches/feature-branch");
        return { message: "Branch deleted" } as T;
      };

      const result = await checkAndDeleteEmptyBranch(
        mockClient,
        "test/project",
        "feature-branch",
        "main",
      );

      expect(result).toEqual({
        shouldDeleteBranch: true,
        branchLink: "",
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Branch feature-branch has no changes compared to main",
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Deleted empty branch: feature-branch",
      );
    });

    test("should return branch link when branch has changes", async () => {
      const mockComparison = {
        commits: [{ id: "commit1", title: "Add feature" }],
        diffs: [{ old_path: "file.js", new_path: "file.js" }],
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        if (url.includes("/repository/compare")) {
          return mockComparison as T;
        }
        return null as T;
      };

      process.env.CI_SERVER_URL = "https://gitlab.example.com";

      const result = await checkAndDeleteEmptyBranch(
        mockClient,
        "test/project",
        "feature-branch",
        "main",
      );

      expect(result).toEqual({
        shouldDeleteBranch: false,
        branchLink:
          "[View branch](https://gitlab.example.com/test/project/-/tree/feature-branch)",
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Branch feature-branch has changes, keeping it",
      );

      delete process.env.CI_SERVER_URL;
    });

    test("should handle branch deletion failure", async () => {
      const mockComparison = {
        commits: [],
        diffs: [],
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        if (url.includes("/repository/compare")) {
          return mockComparison as T;
        }
        return null as T;
      };

      mockClient.delete = async <T = any>(): Promise<T> => {
        throw new Error("Permission denied");
      };

      const result = await checkAndDeleteEmptyBranch(
        mockClient,
        "test/project",
        "feature-branch",
        "main",
      );

      expect(result).toEqual({
        shouldDeleteBranch: true,
        branchLink: "",
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to delete branch feature-branch:",
        expect.any(Error),
      );
    });

    test("should handle comparison API errors", async () => {
      mockClient.get = async <T = any>(): Promise<T> => {
        throw new Error("API Error");
      };

      const result = await checkAndDeleteEmptyBranch(
        mockClient,
        "test/project",
        "feature-branch",
        "main",
      );

      expect(result).toEqual({
        shouldDeleteBranch: false,
        branchLink: "",
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error checking branch status:",
        expect.any(Error),
      );
    });

    test("should use default GitLab URL when CI_SERVER_URL is not set", async () => {
      const mockComparison = {
        commits: [{ id: "commit1" }],
        diffs: [],
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        if (url.includes("/repository/compare")) {
          return mockComparison as T;
        }
        return null as T;
      };

      const result = await checkAndDeleteEmptyBranch(
        mockClient,
        "test/project",
        "feature-branch",
        "main",
      );

      expect(result.branchLink).toContain(
        "https://gitlab.com/test/project/-/tree/feature-branch",
      );
    });

    test("should handle complex project paths", async () => {
      const mockComparison = {
        commits: [{ id: "commit1" }],
        diffs: [{ old_path: "file.js", new_path: "file.js" }],
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        expect(url).toContain(
          encodeURIComponent("namespace/sub-group/project"),
        );
        if (url.includes("/repository/compare")) {
          return mockComparison as T;
        }
        return null as T;
      };

      process.env.CI_SERVER_URL = "https://gitlab.example.com";

      const result = await checkAndDeleteEmptyBranch(
        mockClient,
        "namespace/sub-group/project",
        "feature-branch",
        "main",
      );

      expect(result.branchLink).toBe(
        "[View branch](https://gitlab.example.com/namespace/sub-group/project/-/tree/feature-branch)",
      );

      delete process.env.CI_SERVER_URL;
    });

    test("should handle branch names with special characters", async () => {
      const mockComparison = {
        commits: [],
        diffs: [],
      };

      mockClient.get = async <T = any>(url: string): Promise<T> => {
        // Verify URL encoding
        expect(url).toContain("from=" + encodeURIComponent("main"));
        expect(url).toContain(
          "to=" + encodeURIComponent("feature/new-feature"),
        );
        if (url.includes("/repository/compare")) {
          return mockComparison as T;
        }
        return null as T;
      };

      mockClient.delete = async <T = any>(url: string): Promise<T> => {
        expect(url).toContain(encodeURIComponent("feature/new-feature"));
        return { message: "Branch deleted" } as T;
      };

      const result = await checkAndDeleteEmptyBranch(
        mockClient,
        "test/project",
        "feature/new-feature",
        "main",
      );

      expect(result.shouldDeleteBranch).toBe(true);
    });
  });
});

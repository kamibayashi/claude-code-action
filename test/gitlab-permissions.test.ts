import { describe, test, expect, beforeEach, spyOn, afterEach } from "bun:test";
import { checkWritePermissions } from "../src/gitlab/validation/permissions";
import type { GitLabContext } from "../src/gitlab/context";
import type { GitLabClient } from "../src/gitlab/api/client";

describe("GitLab permissions validation", () => {
  let mockContext: GitLabContext;
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
    };

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

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("checkWritePermissions", () => {
    describe("successful permission checks", () => {
      test("should return true for Owner (50)", async () => {
        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (url.includes("/members/all/")) {
            return {
              id: 1,
              username: "testuser",
              name: "Test User",
              access_level: 50,
              state: "active",
            } as T;
          }
          return null as T;
        };

        const result = await checkWritePermissions(mockContext, mockClient);
        expect(result).toBe(true);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "User testuser has Owner access level",
        );
      });

      test("should return true for Maintainer (40)", async () => {
        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (url.includes("/members/all/")) {
            return {
              id: 1,
              username: "testuser",
              name: "Test User",
              access_level: 40,
              state: "active",
            } as T;
          }
          return null as T;
        };

        const result = await checkWritePermissions(mockContext, mockClient);
        expect(result).toBe(true);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "User testuser has Maintainer access level",
        );
      });

      test("should return true for Developer (30)", async () => {
        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (url.includes("/members/all/")) {
            return {
              id: 1,
              username: "testuser",
              name: "Test User",
              access_level: 30,
              state: "active",
            } as T;
          }
          return null as T;
        };

        const result = await checkWritePermissions(mockContext, mockClient);
        expect(result).toBe(true);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "User testuser has Developer access level",
        );
      });
    });

    describe("failed permission checks", () => {
      test("should return false for Reporter (20)", async () => {
        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (url.includes("/members/all/")) {
            return {
              id: 1,
              username: "testuser",
              name: "Test User",
              access_level: 20,
              state: "active",
            } as T;
          }
          return null as T;
        };

        const result = await checkWritePermissions(mockContext, mockClient);
        expect(result).toBe(false);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "User testuser has Reporter access level",
        );
      });

      test("should return false for Guest (10)", async () => {
        mockClient.get = async <T = any>(url: string): Promise<T> => {
          if (url.includes("/members/all/")) {
            return {
              id: 1,
              username: "testuser",
              name: "Test User",
              access_level: 10,
              state: "active",
            } as T;
          }
          return null as T;
        };

        const result = await checkWritePermissions(mockContext, mockClient);
        expect(result).toBe(false);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "User testuser has Guest access level",
        );
      });

      test("should return false when member not found", async () => {
        mockClient.get = async <T = any>(): Promise<T> => {
          throw new Error("404 Not Found");
        };

        const result = await checkWritePermissions(mockContext, mockClient);
        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Error checking write permissions:",
          expect.any(Error),
        );
      });
    });

    describe("admin user bypass", () => {
      test("should check CI job token when member check fails", async () => {
        process.env.CI_JOB_TOKEN = "test-job-token";

        mockClient = {
          get: async <T = any>(_url: string): Promise<T> => {
            throw new Error("404 Not Found");
          },
          post: async <T = any>(): Promise<T> => ({}) as T,
          put: async <T = any>(): Promise<T> => ({}) as T,
          delete: async <T = any>(): Promise<T> => ({}) as T,
          request: async <T = any>(): Promise<T> => ({}) as T,
        };

        const result = await checkWritePermissions(mockContext, mockClient);
        expect(result).toBe(true);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "Running in CI with job token, assuming write permissions",
        );

        delete process.env.CI_JOB_TOKEN;
      });

      test("should return false when no CI job token", async () => {
        // Ensure CI_JOB_TOKEN is not set
        delete process.env.CI_JOB_TOKEN;

        mockClient = {
          get: async <T = any>(_url: string): Promise<T> => {
            throw new Error("404 Not Found");
          },
          post: async <T = any>(): Promise<T> => ({}) as T,
          put: async <T = any>(): Promise<T> => ({}) as T,
          delete: async <T = any>(): Promise<T> => ({}) as T,
          request: async <T = any>(): Promise<T> => ({}) as T,
        };

        const result = await checkWritePermissions(mockContext, mockClient);
        expect(result).toBe(false);
      });

      test("should handle error checking admin status", async () => {
        mockClient = {
          get: async <T = any>(): Promise<T> => {
            throw new Error("API Error");
          },
          post: async <T = any>(): Promise<T> => ({}) as T,
          put: async <T = any>(): Promise<T> => ({}) as T,
          delete: async <T = any>(): Promise<T> => ({}) as T,
          request: async <T = any>(): Promise<T> => ({}) as T,
        };

        const result = await checkWritePermissions(mockContext, mockClient);
        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Error checking write permissions:",
          expect.any(Error),
        );
      });
    });
  });
});

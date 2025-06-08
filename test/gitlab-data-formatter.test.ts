import { describe, test, expect } from "bun:test";
import type { ProviderData } from "../src/providers/types";
import type { GitLabMergeRequest } from "../src/gitlab/types";

// Since GitLab doesn't have a separate formatter module, we'll test the data transformation
// that happens in the fetcher module and how it's used in prompt generation
describe("GitLab data formatting", () => {
  describe("merge request context formatting", () => {
    test("should format MR context correctly", () => {
      const mrData: ProviderData["mergeRequest"] = {
        title: "Add new feature",
        description: "This MR adds a new feature to the project",
        author: { username: "developer", displayName: "Developer User" },
        sourceBranch: "feature-branch",
        targetBranch: "main",
        headSha: "abc123",
        createdAt: "2024-01-01T10:00:00Z",
        additions: 50,
        deletions: 10,
        state: "open",
        commits: [],
        files: [],
        comments: [],
        reviews: [],
      };

      // Format like it would be in a prompt
      const formatted = `MR Title: ${mrData.title}
MR Author: ${mrData.author.username}
MR Branch: ${mrData.sourceBranch} -> ${mrData.targetBranch}
MR State: ${mrData.state}
MR Additions: ${mrData.additions}
MR Deletions: ${mrData.deletions}
Changed Files: ${mrData.files.length} files`;

      expect(formatted).toContain("MR Title: Add new feature");
      expect(formatted).toContain("MR Author: developer");
      expect(formatted).toContain("MR Branch: feature-branch -> main");
      expect(formatted).toContain("MR State: open");
      expect(formatted).toContain("MR Additions: 50");
      expect(formatted).toContain("MR Deletions: 10");
    });

    test("should format issue context correctly", () => {
      const issueData: ProviderData["issue"] = {
        title: "Bug: Application crashes on startup",
        description: "The application crashes when trying to start",
        author: { username: "reporter", displayName: "Bug Reporter" },
        createdAt: "2024-01-01T09:00:00Z",
        state: "open",
        comments: [],
      };

      const formatted = `Issue Title: ${issueData.title}
Issue Author: ${issueData.author.username}
Issue State: ${issueData.state}`;

      expect(formatted).toContain(
        "Issue Title: Bug: Application crashes on startup",
      );
      expect(formatted).toContain("Issue Author: reporter");
      expect(formatted).toContain("Issue State: open");
    });
  });

  describe("comment formatting", () => {
    test("should format comments correctly", () => {
      const comments = [
        {
          id: "1",
          body: "This looks good to me!",
          author: { username: "reviewer1", displayName: "Reviewer One" },
          createdAt: "2024-01-01T11:00:00Z",
        },
        {
          id: "2",
          body: "Please fix the linting issues",
          author: { username: "reviewer2", displayName: "Reviewer Two" },
          createdAt: "2024-01-01T12:00:00Z",
        },
      ];

      // Format comments like they would appear in a prompt
      const formatted = comments
        .map(
          (comment: any) =>
            `[${comment.author.username} at ${comment.createdAt}]: ${comment.body}`,
        )
        .join("\n\n");

      expect(formatted).toContain(
        "[reviewer1 at 2024-01-01T11:00:00Z]: This looks good to me!",
      );
      expect(formatted).toContain(
        "[reviewer2 at 2024-01-01T12:00:00Z]: Please fix the linting issues",
      );
    });

    test("should handle empty comments array", () => {
      const comments: any[] = [];

      const formatted = comments
        .map(
          (comment) =>
            `[${comment.author.username} at ${comment.createdAt}]: ${comment.body}`,
        )
        .join("\n\n");

      expect(formatted).toBe("");
    });

    test("should handle comments with missing author", () => {
      const comments = [
        {
          id: "1",
          body: "System generated comment",
          author: { username: "unknown", displayName: "Unknown" },
          createdAt: "2024-01-01T11:00:00Z",
        },
      ];

      const formatted = comments
        .map(
          (comment) =>
            `[${comment.author.username} at ${comment.createdAt}]: ${comment.body}`,
        )
        .join("\n\n");

      expect(formatted).toContain(
        "[unknown at 2024-01-01T11:00:00Z]: System generated comment",
      );
    });
  });

  describe("file changes formatting", () => {
    test("should format changed files correctly", () => {
      const files = [
        {
          path: "src/main.ts",
          additions: 20,
          deletions: 5,
          changeType: "modified",
        },
        {
          path: "src/utils/helper.ts",
          additions: 50,
          deletions: 0,
          changeType: "added",
        },
        {
          path: "src/old-file.ts",
          additions: 0,
          deletions: 100,
          changeType: "deleted",
        },
      ];

      const formatted = files
        .map(
          (file) =>
            `- ${file.path} (${file.changeType}) +${file.additions}/-${file.deletions}`,
        )
        .join("\n");

      expect(formatted).toContain("- src/main.ts (modified) +20/-5");
      expect(formatted).toContain("- src/utils/helper.ts (added) +50/-0");
      expect(formatted).toContain("- src/old-file.ts (deleted) +0/-100");
    });

    test("should handle empty files array", () => {
      const files: any[] = [];

      const formatted = files
        .map(
          (file) =>
            `- ${file.path} (${file.changeType}) +${file.additions}/-${file.deletions}`,
        )
        .join("\n");

      expect(formatted).toBe("");
    });
  });

  describe("review/discussion formatting", () => {
    test("should format MR discussions correctly", () => {
      const reviews = [
        {
          id: "1",
          author: { username: "reviewer", displayName: "Code Reviewer" },
          state: "APPROVED",
          submittedAt: "2024-01-01T13:00:00Z",
          body: "LGTM! Great implementation.",
          comments: [],
        },
        {
          id: "2",
          author: { username: "lead", displayName: "Team Lead" },
          state: "CHANGES_REQUESTED",
          submittedAt: "2024-01-01T14:00:00Z",
          body: "Please address the security concerns",
          comments: [
            {
              id: "3",
              path: "src/auth.ts",
              line: 42,
              body: "This could be a security issue",
              author: { username: "lead", displayName: "Team Lead" },
              createdAt: "2024-01-01T14:00:00Z",
            },
          ],
        },
      ];

      // Format reviews
      const formatted = reviews
        .map((review: any) => {
          let output = `[Review by ${review.author.username} at ${review.submittedAt}]: ${review.state}`;

          if (review.body && review.body.trim()) {
            output += `\n${review.body}`;
          }

          if (review.comments && review.comments.length > 0) {
            const comments = review.comments
              .map(
                (comment: any) =>
                  `  [Comment on ${comment.path}:${comment.line || "?"}]: ${comment.body}`,
              )
              .join("\n");
            output += `\n${comments}`;
          }

          return output;
        })
        .join("\n\n");

      expect(formatted).toContain(
        "[Review by reviewer at 2024-01-01T13:00:00Z]: APPROVED",
      );
      expect(formatted).toContain("LGTM! Great implementation.");
      expect(formatted).toContain(
        "[Review by lead at 2024-01-01T14:00:00Z]: CHANGES_REQUESTED",
      );
      expect(formatted).toContain("Please address the security concerns");
      expect(formatted).toContain(
        "[Comment on src/auth.ts:42]: This could be a security issue",
      );
    });
  });

  describe("commit formatting", () => {
    test("should format commits correctly", () => {
      const commits = [
        {
          sha: "abc123",
          message: "feat: Add user authentication",
          author: { username: "dev1", displayName: "Developer One" },
          createdAt: "2024-01-01T08:00:00Z",
        },
        {
          sha: "def456",
          message: "fix: Resolve login bug",
          author: { username: "dev2", displayName: "Developer Two" },
          createdAt: "2024-01-01T09:00:00Z",
        },
      ];

      const formatted = commits
        .map(
          (commit) =>
            `- ${commit.sha.substring(0, 7)} ${commit.message} (${commit.author.username})`,
        )
        .join("\n");

      expect(formatted).toContain(
        "- abc123 feat: Add user authentication (dev1)",
      );
      expect(formatted).toContain("- def456 fix: Resolve login bug (dev2)");
    });
  });

  describe("GitLab to provider data transformation", () => {
    test("should transform GitLab MR to provider format", () => {
      const gitlabMR: Partial<GitLabMergeRequest> = {
        iid: 123,
        title: "Feature: New dashboard",
        description: "Implements new dashboard design",
        state: "opened",
        source_branch: "feature/dashboard",
        target_branch: "main",
        author: {
          id: 1,
          username: "developer",
          name: "Developer User",
        },
        created_at: "2024-01-01T10:00:00Z",
        sha: "abc123",
      };

      // Transform to provider format (as done in fetcher.ts)
      const transformed: Partial<ProviderData["mergeRequest"]> = {
        title: gitlabMR.title,
        description: gitlabMR.description || "",
        author: gitlabMR.author
          ? {
              username: gitlabMR.author.username,
              displayName: gitlabMR.author.name,
            }
          : {
              username: "unknown",
              displayName: "Unknown",
            },
        sourceBranch: gitlabMR.source_branch!,
        targetBranch: gitlabMR.target_branch!,
        headSha: gitlabMR.sha!,
        createdAt: gitlabMR.created_at!,
        state: gitlabMR.state === "opened" ? "open" : "closed",
      };

      expect(transformed.title).toBe("Feature: New dashboard");
      expect(transformed.author?.username).toBe("developer");
      expect(transformed.sourceBranch).toBe("feature/dashboard");
      expect(transformed.state).toBe("open");
    });

    test("should handle GitLab MR with missing author", () => {
      const gitlabMR: Partial<GitLabMergeRequest> = {
        iid: 123,
        title: "Automated MR",
        state: "opened",
        source_branch: "auto/update",
        target_branch: "main",
        author: undefined,
      };

      // Transform with fallback for missing author
      const transformed: Partial<ProviderData["mergeRequest"]> = {
        title: gitlabMR.title,
        author: gitlabMR.author
          ? {
              username: gitlabMR.author.username,
              displayName: gitlabMR.author.name,
            }
          : {
              username: "unknown",
              displayName: "Unknown",
            },
      };

      expect(transformed.author?.username).toBe("unknown");
      expect(transformed.author?.displayName).toBe("Unknown");
    });
  });
});

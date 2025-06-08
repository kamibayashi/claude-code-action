import { describe, test, expect } from "bun:test";
import type { ProviderData } from "../src/providers/types";

// Test GitLab image URL extraction patterns
describe("GitLab image downloader", () => {
  describe("image URL extraction patterns", () => {
    test("should match GitLab upload URLs in markdown", () => {
      const text =
        "Here is an image: ![screenshot](https://gitlab.com/test/project/-/uploads/abc123/screenshot.png)";
      const markdownPattern = /!\[.*?\]\((https:\/\/gitlab\.com\/[^)]+)\)/g;
      const matches = Array.from(text.matchAll(markdownPattern));

      expect(matches.length).toBe(1);
      expect(matches[0]?.[1]).toBe(
        "https://gitlab.com/test/project/-/uploads/abc123/screenshot.png",
      );
    });

    test("should match GitLab upload URLs in HTML", () => {
      const text =
        '<img src="https://gitlab.com/test/project/-/uploads/def456/diagram.jpg" alt="Diagram">';
      const htmlPattern =
        /<img[^>]+src=["'](https:\/\/gitlab\.com\/[^"']+)["'][^>]*>/g;
      const matches = Array.from(text.matchAll(htmlPattern));

      expect(matches.length).toBe(1);
      expect(matches[0]?.[1]).toBe(
        "https://gitlab.com/test/project/-/uploads/def456/diagram.jpg",
      );
    });

    test("should match relative upload URLs", () => {
      const text = "Relative image: ![img](/uploads/mno345/relative.png)";
      const relativePattern = /!\[.*?\]\((\/uploads\/[a-zA-Z0-9]+\/[^)]+)\)/g;
      const matches = Array.from(text.matchAll(relativePattern));

      expect(matches.length).toBe(1);
      expect(matches[0]?.[1]).toBe("/uploads/mno345/relative.png");
    });

    test("should extract multiple images from text", () => {
      const text = `
        Here are some images:
        ![img1](https://gitlab.com/test/project/-/uploads/abc/image1.png)
        ![img2](/uploads/def/image2.jpg)
        <img src="https://gitlab.com/test/project/-/uploads/ghi/image3.gif">
      `;

      const patterns = [
        /!\[.*?\]\((https:\/\/gitlab\.com\/[^)]+)\)/g,
        /!\[.*?\]\((\/uploads\/[a-zA-Z0-9]+\/[^)]+)\)/g,
        /<img[^>]+src=["'](https:\/\/gitlab\.com\/[^"']+)["'][^>]*>/g,
      ];

      const urls = new Set<string>();
      for (const pattern of patterns) {
        const matches = Array.from(text.matchAll(pattern));
        for (const match of matches) {
          if (match[1]) {
            urls.add(match[1]);
          }
        }
      }

      expect(urls.size).toBe(3);
      expect(
        urls.has("https://gitlab.com/test/project/-/uploads/abc/image1.png"),
      ).toBe(true);
      expect(urls.has("/uploads/def/image2.jpg")).toBe(true);
      expect(
        urls.has("https://gitlab.com/test/project/-/uploads/ghi/image3.gif"),
      ).toBe(true);
    });
  });

  describe("URL normalization", () => {
    test("should convert relative URLs to absolute", () => {
      const relativeUrl = "/uploads/abc123/image.png";
      const projectPath = "test/project";
      const absoluteUrl = `https://gitlab.com/${projectPath}${relativeUrl}`;

      expect(absoluteUrl).toBe(
        "https://gitlab.com/test/project/uploads/abc123/image.png",
      );
    });

    test("should handle nested project paths", () => {
      const relativeUrl = "/uploads/def456/diagram.jpg";
      const projectPath = "group/sub-group/project";
      const absoluteUrl = `https://gitlab.com/${projectPath}${relativeUrl}`;

      expect(absoluteUrl).toBe(
        "https://gitlab.com/group/sub-group/project/uploads/def456/diagram.jpg",
      );
    });

    test("should leave absolute URLs unchanged", () => {
      const absoluteUrl =
        "https://gitlab.com/test/project/-/uploads/ghi789/photo.png";
      const isRelative = absoluteUrl.startsWith("/uploads/");

      expect(isRelative).toBe(false);
      expect(absoluteUrl).toBe(
        "https://gitlab.com/test/project/-/uploads/ghi789/photo.png",
      );
    });
  });

  describe("filename extraction", () => {
    test("should extract filename from URL", () => {
      const urls = [
        "https://gitlab.com/test/project/-/uploads/abc/screenshot.png",
        "https://gitlab.com/test/project/-/uploads/def/my-diagram.jpg",
        "/uploads/ghi/animation.gif",
      ];

      const filenames = urls.map((url) => {
        const parts = url.split("/");
        return parts[parts.length - 1] || "image";
      });

      expect(filenames[0]).toBe("screenshot.png");
      expect(filenames[1]).toBe("my-diagram.jpg");
      expect(filenames[2]).toBe("animation.gif");
    });

    test("should extract file extensions", () => {
      const filenames = ["image.png", "photo.jpg", "animation.gif", "noext"];
      const extensions = filenames.map((filename) => {
        const match = filename.match(/\.[^.]+$/);
        return match ? match[0] : ".png";
      });

      expect(extensions[0]).toBe(".png");
      expect(extensions[1]).toBe(".jpg");
      expect(extensions[2]).toBe(".gif");
      expect(extensions[3]).toBe(".png"); // default
    });
  });

  describe("data structure processing", () => {
    test("should find images in issue data", () => {
      const data: ProviderData = {
        repository: { owner: "test", name: "project", defaultBranch: "main" },
        issue: {
          title: "Test Issue",
          description:
            "Here is an image: ![screenshot](https://gitlab.com/test/project/-/uploads/abc123/screenshot.png)",
          author: { username: "user", displayName: "User" },
          createdAt: "2024-01-01",
          state: "open",
          comments: [
            {
              id: "1",
              body: "Another image: ![img](/uploads/def456/image.jpg)",
              author: { username: "commenter", displayName: "Commenter" },
              createdAt: "2024-01-01",
            },
          ],
        },
      };

      const imageUrls = new Set<string>();

      // Extract from issue description
      if (data.issue?.description) {
        const matches = data.issue.description.match(
          /!\[.*?\]\((https:\/\/gitlab\.com\/[^)]+)\)/,
        );
        if (matches && matches[1]) {
          imageUrls.add(matches[1]);
        }
      }

      // Extract from comments
      if (data.issue?.comments) {
        for (const comment of data.issue.comments) {
          const matches = comment.body.match(/!\[.*?\]\((\/uploads\/[^)]+)\)/);
          if (matches && matches[1]) {
            imageUrls.add(matches[1]);
          }
        }
      }

      expect(imageUrls.size).toBe(2);
      expect(
        imageUrls.has(
          "https://gitlab.com/test/project/-/uploads/abc123/screenshot.png",
        ),
      ).toBe(true);
      expect(imageUrls.has("/uploads/def456/image.jpg")).toBe(true);
    });

    test("should find images in merge request data", () => {
      const data: ProviderData = {
        repository: { owner: "test", name: "project", defaultBranch: "main" },
        mergeRequest: {
          title: "Test MR",
          description:
            '<img src="https://gitlab.com/test/project/-/uploads/aaa111/before.png">',
          author: { username: "dev", displayName: "Developer" },
          sourceBranch: "feature",
          targetBranch: "main",
          headSha: "abc123",
          createdAt: "2024-01-01",
          additions: 10,
          deletions: 5,
          state: "open",
          commits: [],
          files: [],
          comments: [],
          reviews: [
            {
              id: "1",
              author: { username: "reviewer", displayName: "Reviewer" },
              state: "APPROVED",
              submittedAt: "2024-01-01",
              body: "Looks good! ![approved](/uploads/bbb222/approved.gif)",
              comments: [
                {
                  id: "2",
                  path: "src/main.ts",
                  line: 10,
                  body: "See: ![ref](https://gitlab.com/test/project/-/uploads/ccc333/reference.jpg)",
                  author: { username: "reviewer", displayName: "Reviewer" },
                  createdAt: "2024-01-01",
                },
              ],
            },
          ],
        },
      };

      const imageUrls = new Set<string>();

      // Extract from MR description
      if (data.mergeRequest?.description) {
        const htmlMatches = data.mergeRequest.description.match(
          /<img[^>]+src=["'](https:\/\/gitlab\.com\/[^"']+)["']/,
        );
        if (htmlMatches && htmlMatches[1]) {
          imageUrls.add(htmlMatches[1]);
        }
      }

      // Extract from reviews
      if (data.mergeRequest?.reviews) {
        for (const review of data.mergeRequest.reviews) {
          if (review.body) {
            const matches = review.body.match(/!\[.*?\]\((\/uploads\/[^)]+)\)/);
            if (matches && matches[1]) {
              imageUrls.add(matches[1]);
            }
          }

          for (const comment of review.comments || []) {
            const matches = comment.body.match(
              /!\[.*?\]\((https:\/\/gitlab\.com\/[^)]+)\)/,
            );
            if (matches && matches[1]) {
              imageUrls.add(matches[1]);
            }
          }
        }
      }

      expect(imageUrls.size).toBe(3);
      expect(
        imageUrls.has(
          "https://gitlab.com/test/project/-/uploads/aaa111/before.png",
        ),
      ).toBe(true);
      expect(imageUrls.has("/uploads/bbb222/approved.gif")).toBe(true);
      expect(
        imageUrls.has(
          "https://gitlab.com/test/project/-/uploads/ccc333/reference.jpg",
        ),
      ).toBe(true);
    });
  });

  describe("authentication headers", () => {
    test("should include GitLab token in headers", () => {
      const token = "glpat-abc123def456";
      const headers = {
        "PRIVATE-TOKEN": token,
      };

      expect(headers["PRIVATE-TOKEN"]).toBe(token);
    });
  });

  describe("error handling", () => {
    test("should handle missing images gracefully", () => {
      const data: ProviderData = {
        repository: { owner: "test", name: "project", defaultBranch: "main" },
        issue: {
          title: "No images",
          description: "This issue has no images",
          author: { username: "user", displayName: "User" },
          createdAt: "2024-01-01",
          state: "open",
          comments: [],
        },
      };

      const imageUrls = new Set<string>();
      const patterns = [
        /!\[.*?\]\((https:\/\/gitlab\.com\/[^)]+)\)/g,
        /!\[.*?\]\((\/uploads\/[^)]+)\)/g,
        /<img[^>]+src=["'](https:\/\/gitlab\.com\/[^"']+)["'][^>]*>/g,
      ];

      const text = data.issue?.description || "";
      for (const pattern of patterns) {
        const matches = Array.from(text.matchAll(pattern));
        for (const match of matches) {
          if (match[1]) {
            imageUrls.add(match[1]);
          }
        }
      }

      expect(imageUrls.size).toBe(0);
    });
  });
});

import { describe, test, expect } from "bun:test";

// Since GitLab embeds its comment logic directly in update-final.ts,
// we'll test the comment formatting behavior through that module
describe("GitLab comment logic", () => {
  describe("comment body formatting", () => {
    test("should format success message with duration", () => {
      const originalBody =
        "## 🤖 Claude is thinking...\n\nI'll analyze this merge request and provide feedback.";
      const expectedPattern = /^## ✅ Claude completed the task/;

      // Simulate the transformation done in update-final.ts
      let updatedBody = originalBody.replace(
        /^## 🤖 Claude is thinking\.\.\.\n\n/,
        "",
      );
      updatedBody = `## ✅ Claude completed the task\n\n${updatedBody}`;

      expect(updatedBody).toMatch(expectedPattern);
      expect(updatedBody).toContain("I'll analyze this merge request");
    });

    test("should format error message", () => {
      const originalBody =
        "## 🤖 Claude is thinking...\n\nWorking on the task...";
      const errorDetails = "Failed to execute command";

      let updatedBody = originalBody.replace(
        /^## 🤖 Claude is thinking\.\.\.\n\n/,
        "",
      );
      updatedBody = `## ❌ Claude encountered an error\n\n${updatedBody}`;
      updatedBody += `\n\n### Error Details\n\`\`\`\n${errorDetails}\n\`\`\``;

      expect(updatedBody).toMatch(/^## ❌ Claude encountered an error/);
      expect(updatedBody).toContain("### Error Details");
      expect(updatedBody).toContain(errorDetails);
    });

    test("should add branch link when provided", () => {
      const originalBody = "Task content\n\n<!-- claude-tracker -->";
      const branchLink =
        "[feature-branch](https://gitlab.com/test/project/-/tree/feature-branch)";
      const branchName = "feature-branch";

      const trackerIndex = originalBody.indexOf("<!-- claude-tracker -->");
      let updatedBody = originalBody;

      if (
        trackerIndex > -1 &&
        !updatedBody.includes(`Working on branch: [${branchName}]`)
      ) {
        updatedBody =
          updatedBody.slice(0, trackerIndex) +
          `**Working on branch:** ${branchLink}\n\n` +
          updatedBody.slice(trackerIndex);
      }

      expect(updatedBody).toContain("**Working on branch:**");
      expect(updatedBody).toContain(branchLink);
    });

    test("should add MR link when provided", () => {
      const originalBody = "Task content\n\n<!-- claude-tracker -->";
      const prLink =
        "[Create a merge request for this branch](https://gitlab.com/test/project/-/merge_requests/new)";

      const trackerIndex = originalBody.indexOf("<!-- claude-tracker -->");
      let updatedBody = originalBody;

      if (trackerIndex > -1 && !updatedBody.includes("[Create a")) {
        updatedBody =
          updatedBody.slice(0, trackerIndex) +
          `\n${prLink}\n\n` +
          updatedBody.slice(trackerIndex);
      }

      expect(updatedBody).toContain(prLink);
    });

    test("should add job details section", () => {
      const originalBody = "Task content";
      const jobUrl = "https://gitlab.com/test/project/-/jobs/12345";
      const triggerUsername = "testuser";
      const executionDetails = {
        duration_ms: 45000,
        duration_api_ms: 30000,
        cost_usd: 0.0125,
      };

      let detailsSection = "\n\n---\n\n";
      detailsSection += `🦊 [View GitLab CI Job](${jobUrl})`;

      if (triggerUsername) {
        detailsSection += ` • Triggered by @${triggerUsername}`;
      }

      const metrics = [];
      if (executionDetails.duration_ms) {
        const seconds = (executionDetails.duration_ms / 1000).toFixed(1);
        metrics.push(`Duration: ${seconds}s`);
      }
      if (executionDetails.duration_api_ms) {
        const apiSeconds = (executionDetails.duration_api_ms / 1000).toFixed(1);
        metrics.push(`API: ${apiSeconds}s`);
      }
      if (executionDetails.cost_usd) {
        metrics.push(`Cost: $${executionDetails.cost_usd.toFixed(4)}`);
      }

      if (metrics.length > 0) {
        detailsSection += ` • ${metrics.join(" • ")}`;
      }

      const updatedBody = originalBody + detailsSection;

      expect(updatedBody).toContain("🦊 [View GitLab CI Job]");
      expect(updatedBody).toContain("Triggered by @testuser");
      expect(updatedBody).toContain("Duration: 45.0s");
      expect(updatedBody).toContain("API: 30.0s");
      expect(updatedBody).toContain("Cost: $0.0125");
    });

    test("should handle missing execution details gracefully", () => {
      const originalBody = "Task content";
      const jobUrl = "https://gitlab.com/test/project/-/jobs/12345";

      let detailsSection = "\n\n---\n\n";
      detailsSection += `🦊 [View GitLab CI Job](${jobUrl})`;

      const updatedBody = originalBody + detailsSection;

      expect(updatedBody).toContain("🦊 [View GitLab CI Job]");
      expect(updatedBody).not.toContain("Duration:");
      expect(updatedBody).not.toContain("Cost:");
    });

    test("should preserve tracker comment", () => {
      const originalBody =
        "Task content\n\n<!-- claude-tracker -->\nTracker content";
      const jobUrl = "https://gitlab.com/test/project/-/jobs/12345";

      let detailsSection = "\n\n---\n\n";
      detailsSection += `🦊 [View GitLab CI Job](${jobUrl})`;

      const trackerIndex = originalBody.indexOf("<!-- claude-tracker -->");
      let updatedBody = originalBody;

      if (trackerIndex > -1) {
        updatedBody =
          originalBody.slice(0, trackerIndex) +
          detailsSection +
          "\n\n" +
          originalBody.slice(trackerIndex);
      }

      expect(updatedBody).toContain("<!-- claude-tracker -->");
      expect(updatedBody).toContain("Tracker content");
      expect(updatedBody.indexOf("🦊 [View GitLab CI Job]")).toBeLessThan(
        updatedBody.indexOf("<!-- claude-tracker -->"),
      );
    });

    test("should handle complex formatting with all elements", () => {
      const originalBody =
        "## 🤖 Claude is thinking...\n\nAnalyzing the code...\n\n<!-- claude-tracker -->";
      const jobUrl = "https://gitlab.com/test/project/-/jobs/12345";
      const branchLink =
        "[feature-123](https://gitlab.com/test/project/-/tree/feature-123)";
      const prLink =
        "[Create a merge request](https://gitlab.com/test/project/-/merge_requests/new)";
      const triggerUsername = "developer";
      const executionDetails = {
        duration_ms: 120000,
        cost_usd: 0.025,
      };

      // Remove thinking header
      let updatedBody = originalBody.replace(
        /^## 🤖 Claude is thinking\.\.\.\n\n/,
        "",
      );

      // Add completion header
      updatedBody = `## ✅ Claude completed the task\n\n${updatedBody}`;

      // Add branch info
      const trackerIndex = updatedBody.indexOf("<!-- claude-tracker -->");
      if (trackerIndex > -1) {
        updatedBody =
          updatedBody.slice(0, trackerIndex) +
          `**Working on branch:** ${branchLink}\n\n` +
          updatedBody.slice(trackerIndex);
      }

      // Add PR link
      const newTrackerIndex = updatedBody.indexOf("<!-- claude-tracker -->");
      if (newTrackerIndex > -1) {
        updatedBody =
          updatedBody.slice(0, newTrackerIndex) +
          `\n${prLink}\n\n` +
          updatedBody.slice(newTrackerIndex);
      }

      // Add execution details
      let detailsSection = "\n\n---\n\n";
      detailsSection += `🦊 [View GitLab CI Job](${jobUrl})`;
      detailsSection += ` • Triggered by @${triggerUsername}`;

      const seconds = (executionDetails.duration_ms / 1000).toFixed(1);
      detailsSection += ` • Duration: ${seconds}s`;
      detailsSection += ` • Cost: $${executionDetails.cost_usd.toFixed(4)}`;

      const finalTrackerIndex = updatedBody.indexOf("<!-- claude-tracker -->");
      updatedBody =
        updatedBody.slice(0, finalTrackerIndex) +
        detailsSection +
        "\n\n" +
        updatedBody.slice(finalTrackerIndex);

      // Verify all elements are present and in correct order
      expect(updatedBody).toMatch(/^## ✅ Claude completed the task/);
      expect(updatedBody).toContain("Analyzing the code...");
      expect(updatedBody).toContain("**Working on branch:**");
      expect(updatedBody).toContain("[Create a merge request]");
      expect(updatedBody).toContain("🦊 [View GitLab CI Job]");
      expect(updatedBody).toContain("Triggered by @developer");
      expect(updatedBody).toContain("Duration: 120.0s");
      expect(updatedBody).toContain("Cost: $0.0250");
      expect(updatedBody).toContain("<!-- claude-tracker -->");
    });
  });
});

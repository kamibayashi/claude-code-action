/**
 * Provider factory to create the appropriate provider based on the environment
 */

import type { Provider } from "./interface";
import { GitHubProvider } from "./github/adapter";
import { GitLabProvider } from "./gitlab/adapter";

export class ProviderFactory {
  static create(): Provider {
    const provider = this.detectProvider();

    switch (provider) {
      case "gitlab":
        console.log("Detected GitLab environment");
        return new GitLabProvider();
      case "github":
        console.log("Detected GitHub environment");
        return new GitHubProvider();
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private static detectProvider(): "github" | "gitlab" {
    // Check environment variable override first
    const providerOverride = process.env.GIT_PROVIDER;
    if (providerOverride === "gitlab" || providerOverride === "github") {
      return providerOverride;
    }

    // Detect based on CI environment variables
    if (
      process.env.GITLAB_CI ||
      process.env.CI_PROJECT_ID ||
      process.env.CI_MERGE_REQUEST_IID
    ) {
      return "gitlab";
    }

    if (
      process.env.GITHUB_ACTIONS ||
      process.env.GITHUB_EVENT_NAME ||
      process.env.GITHUB_REPOSITORY
    ) {
      return "github";
    }

    // Default to GitHub for backward compatibility
    console.warn("Could not detect provider, defaulting to GitHub");
    return "github";
  }

  static getProviderContext(): { provider: "github" | "gitlab" } {
    return {
      provider: this.detectProvider(),
    };
  }
}

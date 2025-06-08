/**
 * Convert GitHub context to provider context
 */

import type { ParsedGitHubContext } from "./context";
import type { ProviderContext } from "../providers/types";

export function convertGitHubToProviderContext(
  githubContext: ParsedGitHubContext,
): ProviderContext {
  return {
    provider: "github",
    repository: {
      owner: githubContext.repository.owner,
      name: githubContext.repository.repo,
      defaultBranch: "", // Will be filled from fetched data
    },
    entityType: githubContext.isPR ? "pull_request" : "issue",
    entityNumber: githubContext.entityNumber,
    actor: {
      username: githubContext.actor,
    },
    inputs: githubContext.inputs,
  };
}

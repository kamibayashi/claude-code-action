/**
 * Common provider interface for both GitHub and GitLab
 */

import type { ProviderContext, ProviderData } from "./types";

export interface Provider {
  // Validation methods
  checkTriggerAction(context: ProviderContext): Promise<boolean>;
  checkHumanActor(context: ProviderContext): Promise<void>;
  checkWritePermissions(context: ProviderContext): Promise<boolean>;

  // Comment operations
  createInitialComment(context: ProviderContext): Promise<number>;
  updateTrackingComment(
    context: ProviderContext,
    commentId: number,
    branchName?: string,
  ): Promise<void>;

  // Branch operations
  setupBranch(
    data: ProviderData,
    context: ProviderContext,
  ): Promise<{
    baseBranch: string;
    currentBranch: string;
    claudeBranch?: string;
  }>;

  // Data fetching
  fetchData(
    repository: string,
    entityNumber: string,
    isIssue: boolean,
  ): Promise<ProviderData>;

  // Authentication
  setupToken(): Promise<string>;

  // Final comment update
  updateFinalComment(
    context: ProviderContext,
    commentId: number,
    options: {
      jobUrl: string;
      actionFailed: boolean;
      executionDetails?: {
        cost_usd?: number;
        duration_ms?: number;
        duration_api_ms?: number;
      } | null;
      branchName?: string;
      baseBranch?: string;
      triggerUsername?: string;
      errorDetails?: string;
    },
  ): Promise<void>;
}

export interface ProviderFactory {
  create(provider: "github" | "gitlab"): Provider;
}

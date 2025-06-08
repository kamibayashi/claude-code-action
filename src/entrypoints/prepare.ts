#!/usr/bin/env bun

/**
 * Prepare the Claude action by checking trigger conditions, verifying human actor,
 * and creating the initial tracking comment
 */

import * as core from "@actions/core";
import { ProviderFactory } from "../providers/factory";
import { prepareMcpConfig } from "../mcp/install-mcp-server";
import { createPrompt, createPromptV2 } from "../create-prompt";
import { convertProviderDataToFetchDataResult } from "../providers/data-adapter";

async function run() {
  try {
    // Step 1: Create provider and setup token
    const provider = ProviderFactory.create();
    const token = await provider.setupToken();
    const providerType = ProviderFactory.getProviderContext().provider;

    // Step 2: Get provider context (always use ProviderContext)
    let context: any;
    if (providerType === "github") {
      const githubContext = (
        await import("../github/context")
      ).parseGitHubContext();
      context = (
        await import("../github/convert-context")
      ).convertGitHubToProviderContext(githubContext);
    } else {
      const gitlabContext = (
        await import("../gitlab/context")
      ).parseGitLabContext();
      context = (await import("../gitlab/context")).convertToProviderContext(
        gitlabContext,
      );
    }

    // Step 3: Check write permissions
    const hasWritePermissions = await provider.checkWritePermissions(context);
    if (!hasWritePermissions) {
      throw new Error(
        "Actor does not have write permissions to the repository",
      );
    }

    // Step 4: Check trigger conditions
    const containsTrigger = await provider.checkTriggerAction(context);

    if (!containsTrigger) {
      console.log("No trigger found, skipping remaining steps");
      return;
    }

    // Step 5: Check if actor is human
    await provider.checkHumanActor(context);

    // Step 6: Create initial tracking comment
    const commentId = await provider.createInitialComment(context);

    // Step 7: Fetch data (once for both branch setup and prompt creation)
    const providerData = await provider.fetchData(
      `${context.repository.owner}/${context.repository.name}`,
      context.entityNumber.toString(),
      context.entityType === "issue",
    );

    // Step 8: Setup branch
    const branchInfo = await provider.setupBranch(providerData, context);

    // Step 9: Update initial comment with branch link (only for issues that created a new branch)
    if (branchInfo.claudeBranch) {
      await provider.updateTrackingComment(
        context,
        commentId,
        branchInfo.claudeBranch,
      );
    }

    // Step 10: Create prompt file
    // Convert ProviderData to FetchDataResult for legacy compatibility
    const githubData = convertProviderDataToFetchDataResult(providerData);

    if (providerType === "gitlab") {
      // Use the new provider-agnostic createPromptV2 for GitLab
      const gitlabContext = (
        await import("../gitlab/context")
      ).parseGitLabContext();
      await createPromptV2(
        commentId,
        branchInfo.baseBranch,
        branchInfo.claudeBranch,
        githubData,
        gitlabContext,
        "gitlab",
      );
    } else {
      // Use the original createPrompt for GitHub (backward compatibility)
      const githubContext = (
        await import("../github/context")
      ).parseGitHubContext();
      await createPrompt(
        commentId,
        branchInfo.baseBranch,
        branchInfo.claudeBranch,
        githubData,
        githubContext,
        providerType,
      );
    }

    // Step 11: Get MCP configuration
    const additionalMcpConfig = process.env.MCP_CONFIG || "";
    const mcpConfigParams: any = {
      token,
      branch: branchInfo.currentBranch,
      additionalMcpConfig,
      claudeCommentId: commentId.toString(),
      allowedTools: context.inputs.allowedTools,
    };

    // Add provider-specific parameters
    if (providerType === "github") {
      mcpConfigParams.owner = context.repository.owner;
      mcpConfigParams.repo = context.repository.name;
    } else if (providerType === "gitlab") {
      mcpConfigParams.projectPath = `${context.repository.owner}/${context.repository.name}`;
    }

    const mcpConfig = await prepareMcpConfig(mcpConfigParams);
    core.setOutput("mcp_config", mcpConfig);

    // Output provider type for later steps
    core.setOutput("provider", providerType);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Prepare step failed with error: ${errorMessage}`);
    // Also output the clean error message for the action to capture
    core.setOutput("prepare_error", errorMessage);
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}

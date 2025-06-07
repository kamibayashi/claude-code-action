#!/usr/bin/env bun

import * as fs from "fs/promises";
import { ProviderFactory } from "../providers/factory";

async function run() {
  try {
    // Environment variables
    const commentId = parseInt(process.env.CLAUDE_COMMENT_ID!);
    const claudeBranch = process.env.CLAUDE_BRANCH;
    const baseBranch = process.env.BASE_BRANCH || "main";
    const triggerUsername = process.env.TRIGGER_USERNAME;

    // Create provider and setup
    const provider = ProviderFactory.create();
    const providerType = ProviderFactory.getProviderContext().provider;

    // Get provider context
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

    // Build job URL based on provider
    let jobUrl: string;
    if (providerType === "github") {
      const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
      const runId = process.env.GITHUB_RUN_ID;
      jobUrl = `${serverUrl}/${context.repository.owner}/${context.repository.name}/actions/runs/${runId}`;
    } else {
      const serverUrl = process.env.CI_SERVER_URL || "https://gitlab.com";
      const projectPath = process.env.CI_PROJECT_PATH;
      const jobId = process.env.CI_JOB_ID;
      jobUrl = `${serverUrl}/${projectPath}/-/jobs/${jobId}`;
    }

    // Check if action failed and read output file for execution details
    let executionDetails: {
      cost_usd?: number;
      duration_ms?: number;
      duration_api_ms?: number;
    } | null = null;
    let actionFailed = false;
    let errorDetails: string | undefined;

    // First check if prepare step failed
    const prepareSuccess = process.env.PREPARE_SUCCESS !== "false";
    const prepareError = process.env.PREPARE_ERROR;

    if (!prepareSuccess && prepareError) {
      actionFailed = true;
      errorDetails = prepareError;
    } else {
      // Check for existence of output file and parse it if available
      try {
        const outputFile = process.env.OUTPUT_FILE;
        if (outputFile) {
          const fileContent = await fs.readFile(outputFile, "utf8");
          const outputData = JSON.parse(fileContent);

          // Output file is an array, get the last element which contains execution details
          if (Array.isArray(outputData) && outputData.length > 0) {
            const lastElement = outputData[outputData.length - 1];
            if (
              lastElement.type === "result" &&
              "cost_usd" in lastElement &&
              "duration_ms" in lastElement
            ) {
              executionDetails = {
                cost_usd: lastElement.cost_usd,
                duration_ms: lastElement.duration_ms,
                duration_api_ms: lastElement.duration_api_ms,
              };
            }
          }
        }

        // Check if the Claude action failed
        const claudeSuccess = process.env.CLAUDE_SUCCESS !== "false";
        actionFailed = !claudeSuccess;
      } catch (error) {
        console.error("Error reading output file:", error);
        // If we can't read the file, check for any failure markers
        actionFailed = process.env.CLAUDE_SUCCESS === "false";
      }
    }

    // Update final comment using provider
    await provider.updateFinalComment(context, commentId, {
      jobUrl,
      actionFailed,
      executionDetails,
      branchName: claudeBranch,
      baseBranch,
      triggerUsername,
      errorDetails,
    });

    console.log(`✅ Updated comment ${commentId} with job link`);
    process.exit(0);
  } catch (error) {
    console.error("Error updating comment with job link:", error);
    process.exit(1);
  }
}

run();

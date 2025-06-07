#!/usr/bin/env node

/**
 * GitLab Webhook Handler for Claude Code Action
 *
 * This script receives GitLab webhooks and triggers Claude Code pipelines
 * when specific conditions are met (e.g., comments with trigger phrase).
 *
 * Usage:
 *   node gitlab-trigger-webhook.js
 *
 * Environment variables:
 *   - PORT: Server port (default: 3000)
 *   - GITLAB_TOKEN: GitLab personal access token with api scope
 *   - WEBHOOK_SECRET: Secret token for webhook validation
 *   - TRIGGER_PHRASE: Phrase to trigger Claude (default: @claude)
 *   - PIPELINE_TRIGGER_TOKENS: JSON object mapping project IDs to trigger tokens
 *   - ANTHROPIC_API_KEY: Anthropic API key (passed to pipeline)
 */

const http = require("http");
const https = require("https");
const url = require("url");
const querystring = require("querystring");

// Configuration from environment
const PORT = process.env.PORT || 3000;
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const TRIGGER_PHRASE = process.env.TRIGGER_PHRASE || "@claude";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Parse pipeline trigger tokens
let PIPELINE_TRIGGER_TOKENS = {};
try {
  if (process.env.PIPELINE_TRIGGER_TOKENS) {
    PIPELINE_TRIGGER_TOKENS = JSON.parse(process.env.PIPELINE_TRIGGER_TOKENS);
  } else if (process.env.PIPELINE_TRIGGER_TOKEN) {
    // Fallback to single token for all projects
    PIPELINE_TRIGGER_TOKENS.default = process.env.PIPELINE_TRIGGER_TOKEN;
  }
} catch (e) {
  console.error("Failed to parse PIPELINE_TRIGGER_TOKENS:", e.message);
  process.exit(1);
}

// Validate required configuration
if (!GITLAB_TOKEN) {
  console.error("GITLAB_TOKEN environment variable is required");
  process.exit(1);
}

if (Object.keys(PIPELINE_TRIGGER_TOKENS).length === 0) {
  console.error("At least one pipeline trigger token is required");
  console.error("Set either PIPELINE_TRIGGER_TOKEN or PIPELINE_TRIGGER_TOKENS");
  process.exit(1);
}

/**
 * Make HTTPS request
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on("error", reject);

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

/**
 * Validate webhook signature
 */
function validateWebhook(headers) {
  if (!WEBHOOK_SECRET) {
    return true; // Skip validation if no secret configured
  }

  const signature = headers["x-gitlab-token"];
  return signature === WEBHOOK_SECRET;
}

/**
 * Check if text contains trigger phrase
 */
function containsTriggerPhrase(text) {
  if (!text) return false;
  return text.toLowerCase().includes(TRIGGER_PHRASE.toLowerCase());
}

/**
 * Get pipeline trigger token for project
 */
function getTriggerToken(projectId) {
  return PIPELINE_TRIGGER_TOKENS[projectId] || PIPELINE_TRIGGER_TOKENS.default;
}

/**
 * Trigger GitLab pipeline
 */
async function triggerPipeline(project, ref, variables) {
  const triggerToken = getTriggerToken(project.id);
  if (!triggerToken) {
    throw new Error(`No trigger token configured for project ${project.id}`);
  }

  const postData = querystring.stringify({
    token: triggerToken,
    ref: ref,
    ...Object.entries(variables).reduce((acc, [key, value]) => {
      acc[`variables[${key}]`] = value;
      return acc;
    }, {}),
  });

  const options = {
    hostname: new URL(project.web_url).hostname,
    path: `/api/v4/projects/${project.id}/trigger/pipeline`,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData),
    },
  };

  return await makeRequest(options, postData);
}

/**
 * Handle note (comment) webhook
 */
async function handleNoteWebhook(data) {
  const { object_attributes, project, merge_request, issue } = data;

  // Check if comment contains trigger phrase
  if (!containsTriggerPhrase(object_attributes.note)) {
    return { triggered: false, reason: "No trigger phrase found" };
  }

  // Prepare pipeline variables
  const variables = {
    GITLAB_TOKEN: GITLAB_TOKEN,
    ANTHROPIC_API_KEY: ANTHROPIC_API_KEY,
    TRIGGER_USERNAME: object_attributes.author.username,
    GITLAB_USER_LOGIN: object_attributes.author.username,
  };

  let ref = project.default_branch || "main";

  // Handle merge request comment
  if (merge_request) {
    variables.CI_MERGE_REQUEST_IID = merge_request.iid.toString();
    ref = merge_request.source_branch;

    console.log(`Triggering pipeline for MR !${merge_request.iid} comment`);
  }
  // Handle issue comment
  else if (issue) {
    variables.GITLAB_ISSUE_IID = issue.iid.toString();
    variables.ISSUE_IID = issue.iid.toString();
    variables.ISSUE_COMMENT_TRIGGER = "true";

    console.log(`Triggering pipeline for Issue #${issue.iid} comment`);
  }
  // Skip other types of notes
  else {
    return { triggered: false, reason: "Not a MR or issue comment" };
  }

  // Trigger the pipeline
  try {
    const pipeline = await triggerPipeline(project, ref, variables);
    return {
      triggered: true,
      pipeline_id: pipeline.id,
      pipeline_url: pipeline.web_url,
    };
  } catch (error) {
    console.error("Failed to trigger pipeline:", error);
    throw error;
  }
}

/**
 * Handle merge request webhook
 */
async function handleMergeRequestWebhook(data) {
  const { object_attributes, project } = data;

  // Only process on open, reopen, or update
  const validActions = ["open", "reopen", "update"];
  if (!validActions.includes(object_attributes.action)) {
    return {
      triggered: false,
      reason: `Action ${object_attributes.action} not configured`,
    };
  }

  // Check if description contains trigger phrase
  if (!containsTriggerPhrase(object_attributes.description)) {
    return { triggered: false, reason: "No trigger phrase in description" };
  }

  // Prepare pipeline variables
  const variables = {
    GITLAB_TOKEN: GITLAB_TOKEN,
    ANTHROPIC_API_KEY: ANTHROPIC_API_KEY,
    CI_MERGE_REQUEST_IID: object_attributes.iid.toString(),
    TRIGGER_USERNAME: object_attributes.author.username,
    GITLAB_USER_LOGIN: object_attributes.author.username,
  };

  console.log(
    `Triggering pipeline for MR !${object_attributes.iid} ${object_attributes.action}`,
  );

  // Trigger the pipeline
  try {
    const pipeline = await triggerPipeline(
      project,
      object_attributes.source_branch,
      variables,
    );
    return {
      triggered: true,
      pipeline_id: pipeline.id,
      pipeline_url: pipeline.web_url,
    };
  } catch (error) {
    console.error("Failed to trigger pipeline:", error);
    throw error;
  }
}

/**
 * Handle issue webhook
 */
async function handleIssueWebhook(data) {
  const { object_attributes, project } = data;

  // Only process on open or update
  const validActions = ["open", "reopen", "update"];
  if (!validActions.includes(object_attributes.action)) {
    return {
      triggered: false,
      reason: `Action ${object_attributes.action} not configured`,
    };
  }

  // Check if description contains trigger phrase
  if (!containsTriggerPhrase(object_attributes.description)) {
    return { triggered: false, reason: "No trigger phrase in description" };
  }

  // Prepare pipeline variables
  const variables = {
    GITLAB_TOKEN: GITLAB_TOKEN,
    ANTHROPIC_API_KEY: ANTHROPIC_API_KEY,
    GITLAB_ISSUE_IID: object_attributes.iid.toString(),
    ISSUE_IID: object_attributes.iid.toString(),
    ISSUE_TRIGGER: "true",
    TRIGGER_USERNAME: object_attributes.author.username,
    GITLAB_USER_LOGIN: object_attributes.author.username,
  };

  console.log(
    `Triggering pipeline for Issue #${object_attributes.iid} ${object_attributes.action}`,
  );

  // Trigger the pipeline
  try {
    const pipeline = await triggerPipeline(
      project,
      project.default_branch || "main",
      variables,
    );
    return {
      triggered: true,
      pipeline_id: pipeline.id,
      pipeline_url: pipeline.web_url,
    };
  } catch (error) {
    console.error("Failed to trigger pipeline:", error);
    throw error;
  }
}

/**
 * Main webhook handler
 */
async function handleWebhook(headers, body) {
  // Validate webhook signature
  if (!validateWebhook(headers)) {
    throw new Error("Invalid webhook signature");
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    throw new Error("Invalid JSON payload");
  }

  const eventType = headers["x-gitlab-event"];
  console.log(
    `Received ${eventType} webhook from project ${data.project?.name || "unknown"}`,
  );

  // Route to appropriate handler
  switch (data.object_kind) {
    case "note":
      return await handleNoteWebhook(data);

    case "merge_request":
      return await handleMergeRequestWebhook(data);

    case "issue":
      return await handleIssueWebhook(data);

    default:
      return {
        triggered: false,
        reason: `Event type ${data.object_kind} not supported`,
      };
  }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));

  req.on("end", async () => {
    try {
      const result = await handleWebhook(req.headers, body);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error("Webhook processing error:", error);

      const statusCode = error.message.includes("signature") ? 401 : 500;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: error.message,
          triggered: false,
        }),
      );
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`GitLab webhook handler listening on port ${PORT}`);
  console.log(`Configured for trigger phrase: "${TRIGGER_PHRASE}"`);
  console.log(
    `Configured projects: ${Object.keys(PIPELINE_TRIGGER_TOKENS).join(", ")}`,
  );
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  server.close(() => {
    process.exit(0);
  });
});

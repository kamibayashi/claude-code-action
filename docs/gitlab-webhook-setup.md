# GitLab Webhook Setup for Automatic Pipeline Triggers

This guide explains how to set up GitLab webhooks to automatically trigger Claude Code pipelines when specific events occur (e.g., when someone comments "@claude" on a merge request).

## Overview

GitLab webhooks allow your project to send HTTP POST requests to external services when certain events happen. By combining webhooks with Pipeline Trigger Tokens, you can automatically start Claude Code pipelines without manual intervention.

## Prerequisites

- GitLab project with Maintainer or Owner permissions
- Claude Code GitLab CI configuration already set up (see [gitlab-setup.md](./gitlab-setup.md))
- External service to receive webhooks (e.g., webhook relay service, cloud function, or self-hosted endpoint)

## Step 1: Create a Pipeline Trigger Token

1. Navigate to your GitLab project
2. Go to **Settings** → **CI/CD**
3. Expand the **Pipeline trigger tokens** section
4. Click **Add trigger token**
5. Enter a description (e.g., "Claude Code Webhook Trigger")
6. Click **Create pipeline trigger token**
7. Save the generated token securely - you'll need it for the webhook handler

## Step 2: Set Up Webhook Handler

You'll need a service that can receive GitLab webhooks and trigger pipelines based on the content. Here's an example using a simple webhook handler:

### Option A: Using GitLab's Built-in Comment Pipelines (Recommended)

GitLab can automatically trigger pipelines on comments using CI/CD rules:

```yaml
# .gitlab-ci.yml
claude-code:
  rules:
    # Trigger on merge request comments containing trigger phrase
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event" && $CI_MERGE_REQUEST_EVENT_TYPE == "merge_request_note"'
      when: manual
    # Trigger on issue comments
    - if: '$CI_PIPELINE_SOURCE == "issue_note"'
      when: manual
  # ... rest of your Claude Code configuration
```

### Option B: External Webhook Handler

If you need more control, create an external webhook handler:

```javascript
// Example webhook handler (Node.js/Express)
const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

app.post("/webhook", async (req, res) => {
  const { object_kind, object_attributes, project, merge_request, issue } =
    req.body;

  // Check if this is a comment event
  if (object_kind !== "note") {
    return res.status(200).send("Not a comment event");
  }

  // Check if comment contains trigger phrase
  const triggerPhrase = process.env.TRIGGER_PHRASE || "@claude";
  const comment = object_attributes.note || "";

  if (!comment.toLowerCase().includes(triggerPhrase.toLowerCase())) {
    return res.status(200).send("No trigger phrase found");
  }

  // Prepare variables for pipeline
  const variables = {
    TRIGGER_USERNAME: object_attributes.author.username,
    GITLAB_TOKEN: process.env.GITLAB_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };

  // Add context-specific variables
  if (merge_request) {
    variables.CI_MERGE_REQUEST_IID = merge_request.iid;
  } else if (issue) {
    variables.GITLAB_ISSUE_IID = issue.iid;
  }

  // Trigger pipeline
  try {
    const response = await axios.post(
      `https://gitlab.com/api/v4/projects/${project.id}/trigger/pipeline`,
      {
        token: process.env.PIPELINE_TRIGGER_TOKEN,
        ref: merge_request ? merge_request.source_branch : "main",
        variables: variables,
      },
    );

    res.status(200).json({ pipeline_id: response.data.id });
  } catch (error) {
    console.error("Failed to trigger pipeline:", error);
    res.status(500).send("Failed to trigger pipeline");
  }
});

app.listen(3000);
```

## Step 3: Configure GitLab Webhook

1. Navigate to your GitLab project
2. Go to **Settings** → **Webhooks**
3. Click **Add new webhook**
4. Configure the webhook:
   - **URL**: Your webhook handler URL
   - **Secret token**: A secure random string (optional but recommended)
   - **Trigger events**: Select:
     - ✅ Comments (for merge request and issue comments)
     - ✅ Merge request events (optional, for MR creation/updates)
     - ✅ Issues events (optional, for issue creation/updates)
   - **SSL verification**: Enable if your handler uses HTTPS
5. Click **Add webhook**

## Step 4: Environment Variables for Webhook Handler

Set up these environment variables for your webhook handler:

```bash
# GitLab API token (with api scope)
GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx

# Pipeline trigger token from Step 1
PIPELINE_TRIGGER_TOKEN=glptt-xxxxxxxxxxxxxxxxxxxx

# Anthropic API key
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx

# Trigger phrase (optional, defaults to @claude)
TRIGGER_PHRASE=@claude

# Webhook secret token (if configured)
WEBHOOK_SECRET=your-secret-token
```

## Step 5: Modify GitLab CI Configuration

Update your `.gitlab-ci.yml` to handle webhook-triggered pipelines:

```yaml
variables:
  # These will be provided by the webhook handler
  TRIGGER_USERNAME: ${TRIGGER_USERNAME}
  CI_MERGE_REQUEST_IID: ${CI_MERGE_REQUEST_IID}
  GITLAB_ISSUE_IID: ${GITLAB_ISSUE_IID}

claude-code:
  rules:
    # Trigger via pipeline trigger token
    - if: '$CI_PIPELINE_SOURCE == "trigger"'
    # Also allow manual triggers
    - when: manual

  script:
    - |
      # Determine context from variables
      if [ -n "$CI_MERGE_REQUEST_IID" ]; then
        echo "Processing merge request $CI_MERGE_REQUEST_IID"
      elif [ -n "$GITLAB_ISSUE_IID" ]; then
        echo "Processing issue $GITLAB_ISSUE_IID"
      fi

    # Run Claude Code
    - bun run claude-code
```

## Security Considerations

1. **Validate webhook signatures**: Always verify the webhook secret token to ensure requests are from GitLab
2. **Limit trigger token scope**: Use project-specific trigger tokens, not personal access tokens
3. **Filter events**: Only process relevant events to avoid unnecessary pipeline runs
4. **Rate limiting**: Implement rate limiting to prevent abuse
5. **Input validation**: Sanitize and validate all input from webhooks

## Example: Webhook Validation

```javascript
// Validate GitLab webhook signature
function validateWebhookSignature(req) {
  const signature = req.headers["x-gitlab-token"];
  const expectedSignature = process.env.WEBHOOK_SECRET;

  if (!signature || signature !== expectedSignature) {
    throw new Error("Invalid webhook signature");
  }
}

// Use in your webhook handler
app.post("/webhook", (req, res) => {
  try {
    validateWebhookSignature(req);
    // Process webhook...
  } catch (error) {
    return res.status(401).send("Unauthorized");
  }
});
```

## Deployment Options

### 1. Cloud Functions

- **AWS Lambda**: Use API Gateway + Lambda
- **Google Cloud Functions**: Direct HTTP trigger
- **Vercel/Netlify Functions**: Simple deployment

### 2. Container Services

- **GitLab Runner**: Can host the webhook handler
- **Docker + Cloud Run**: Auto-scaling container service
- **Kubernetes**: For more complex setups

### 3. GitLab Pages + GitLab CI

You can even use GitLab CI itself as a pseudo-webhook handler:

```yaml
# .gitlab-ci.yml
webhook-receiver:
  image: alpine:latest
  rules:
    - if: '$CI_PIPELINE_SOURCE == "api"'
  script:
    - echo "Received API trigger"
    # Trigger another pipeline with specific parameters
    - 'curl -X POST -F token=$CLAUDE_TRIGGER_TOKEN -F ref=main -F "variables[TRIGGER_TYPE]=webhook" https://gitlab.com/api/v4/projects/$CI_PROJECT_ID/trigger/pipeline'
```

## Testing Your Setup

1. Create a test merge request or issue
2. Add a comment with your trigger phrase (e.g., "@claude please review")
3. Check if a pipeline was triggered:
   - Go to **CI/CD** → **Pipelines**
   - Look for a pipeline with source "Trigger"
4. Verify the pipeline has the correct variables set

## Troubleshooting

### Pipeline not triggering

- Check webhook delivery logs in **Settings** → **Webhooks** → **Edit** → **Recent events**
- Verify the trigger token is correct
- Check webhook handler logs for errors
- Ensure the trigger phrase is matched correctly (case-insensitive)

### Variables not passed correctly

- Log the webhook payload in your handler
- Ensure variable names match in webhook handler and `.gitlab-ci.yml`
- Check for typos in variable names

### Authentication errors

- Verify GITLAB_TOKEN has `api` scope
- Ensure trigger token hasn't expired
- Check project permissions

## Advanced: Multi-Project Setup

For organizations with multiple projects, you can create a centralized webhook handler:

```javascript
// Map project IDs to their trigger tokens
const projectTokens = {
  12345: process.env.PROJECT_A_TRIGGER_TOKEN,
  67890: process.env.PROJECT_B_TRIGGER_TOKEN,
  // ...
};

// Use appropriate token based on project
const triggerToken = projectTokens[project.id];
if (!triggerToken) {
  return res.status(400).send("Unknown project");
}
```

This allows you to manage Claude Code deployments across multiple GitLab projects with a single webhook handler.

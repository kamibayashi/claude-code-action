# GitLab Setup Guide for Claude Code Action

This guide explains how to set up Claude Code Action for GitLab projects.

## Overview

Claude Code Action now supports GitLab in addition to GitHub. The GitLab integration provides similar functionality:

- Respond to comments in issues and merge requests
- Create and update branches
- Make code changes
- Post progress updates

## Prerequisites

1. GitLab project with CI/CD enabled
2. Anthropic API key
3. GitLab personal access token or project token (for API access beyond CI job token permissions)

## Setup Steps

### 1. Add CI/CD Variables

In your GitLab project, go to Settings → CI/CD → Variables and add:

- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `GITLAB_TOKEN` (optional) - Personal access token for enhanced permissions

### 2. Create `.gitlab-ci.yml`

Copy the example configuration from `examples/gitlab-ci.yml` to your project root and customize as needed.

### 3. Configure Triggers

Claude can be triggered by:

- Comments containing `@claude` (or your custom trigger phrase)
- Assigning issues/MRs to a specific user
- Direct prompt via CI/CD variables
- Scheduled pipelines

### 4. Environment Variables

The GitLab integration uses these environment variables:

#### Required

- `GIT_PROVIDER=gitlab` - Tells the action to use GitLab mode
- `CI_PROJECT_PATH` - Automatically set by GitLab CI
- `CI_PROJECT_ID` - Automatically set by GitLab CI

#### Optional

- `TRIGGER_PHRASE` - Custom trigger phrase (default: `@claude`)
- `ASSIGNEE_TRIGGER` - Username to trigger on assignment
- `BASE_BRANCH` - Base branch for new branches (default: project default)
- `ALLOWED_TOOLS` - Additional tools Claude can use
- `CUSTOM_INSTRUCTIONS` - Custom instructions for Claude
- `GITLAB_API_URL` - Custom GitLab API URL (for self-hosted instances)

## Usage Examples

### Trigger via Comment

1. In an issue or merge request, comment: `@claude please review this code`
2. The CI pipeline will trigger automatically (if webhooks are configured)
3. Claude will analyze the context and respond

### Manual Trigger

1. Go to CI/CD → Pipelines
2. Click "Run pipeline"
3. Select the branch and job
4. Set variables if needed (e.g., `DIRECT_PROMPT`)

### Scheduled Reviews

Set up a scheduled pipeline with:

```yaml
variables:
  DIRECT_PROMPT: "Review recent changes and suggest improvements"
```

## Differences from GitHub

1. **Authentication**: Uses GitLab tokens instead of GitHub tokens
2. **API**: Uses GitLab REST API v4
3. **Terminology**: "Merge Request" instead of "Pull Request"
4. **CI/CD**: Uses GitLab CI instead of GitHub Actions
5. **Permissions**: Uses GitLab's permission model (Developer+ for write access)
6. **Environment Variables**: Different CI/CD variables (e.g., `CI_JOB_ID` instead of `GITHUB_RUN_ID`)
7. **Job URLs**: GitLab job URLs use `/-/jobs/` path instead of GitHub's `/actions/runs/`

## Troubleshooting

### Issue: Claude doesn't respond to comments

- Check if the GitLab token has sufficient permissions
- Verify the trigger phrase matches your configuration
- Check CI/CD pipeline logs

### Issue: Can't create branches

- Ensure the user/token has Developer or higher permissions
- Check if branch protection rules allow creation

### Issue: API rate limits

- Use a personal access token instead of CI job token
- Consider caching API responses

## Security Notes

1. Store sensitive tokens in CI/CD variables, not in code
2. Use project access tokens with minimal required permissions
3. Review Claude's actions before merging
4. Consider using protected variables for production environments

## Advanced Configuration

### Self-Hosted GitLab

For self-hosted GitLab instances:

```yaml
variables:
  GITLAB_API_URL: "https://gitlab.company.com/api/v4"
```

### Custom MCP Servers

You can add custom MCP servers for GitLab-specific tools:

```yaml
variables:
  MCP_CONFIG: |
    {
      "mcpServers": {
        "gitlab-tools": {
          "command": "npx",
          "args": ["-y", "@company/gitlab-mcp-server"]
        }
      }
    }
```

## Automatic Triggers (Optional)

Claude Code can be triggered automatically when specific events occur. See [gitlab-webhook-setup.md](./gitlab-webhook-setup.md) for detailed instructions on setting up:

- Automatic triggers when someone comments "@claude" on merge requests or issues
- Pipeline triggers for new merge requests containing the trigger phrase
- Webhook handlers for advanced automation

## GitLab Runner Configuration (Optional)

For enterprise environments or advanced use cases, see [gitlab-runner-advanced.md](./gitlab-runner-advanced.md) for:

- Docker-in-Docker configuration for MCP servers
- Performance optimization for large codebases
- Security hardening for production environments
- Kubernetes executor setup
- Air-gapped and self-hosted GitLab configurations

## Contributing

To contribute GitLab-specific features:

1. Follow the existing pattern in `src/gitlab/`
2. Implement the Provider interface
3. Add tests for GitLab-specific functionality
4. Update documentation

## Support

For issues specific to GitLab integration:

1. Check the [FAQ](../FAQ.md)
2. Search existing issues
3. Create a new issue with the `gitlab` label

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Tools

- Runtime: Bun 1.2.11
- Language: TypeScript
- Testing: Bun test framework

## Common Development Tasks

### Available npm/bun scripts:

```bash
# Run tests
bun test

# Run specific test file
bun test path/to/test.ts

# Type checking
bun run typecheck

# Code formatting
bun run format          # Format code with prettier
bun run format:check    # Check code formatting

# Install git hooks
bun run install-hooks
```

## Architecture Overview

This is a GitHub/GitLab Action that enables Claude to interact with PRs/MRs and issues. The action uses a **provider abstraction pattern** to support multiple platforms (GitHub and GitLab).

### Core Architecture Flow

1. **Provider Detection**: Factory pattern detects environment (GitHub/GitLab) and creates appropriate provider
2. **Trigger Validation**: Checks if Claude should respond based on trigger phrase, permissions, and actor
3. **Context Gathering**: Fetches platform-specific data (PR/MR, issues, comments, files)
4. **Prompt Generation**: Creates context-rich prompts with all relevant information
5. **Branch Management**: Smart handling based on context (new branch for issues, direct push for open PRs)
6. **MCP Integration**: Configures Model Context Protocol servers for enhanced operations
7. **Comment Tracking**: Updates a single comment thread with progress and results

### Provider Abstraction Layer

The codebase uses a clean provider pattern (`src/providers/`) that enables platform-agnostic operations:

- **Interface** (`interface.ts`): Defines common operations all providers must implement
- **Factory** (`factory.ts`): Detects environment and instantiates correct provider
- **Adapters**: Platform-specific implementations
  - `github/adapter.ts`: GitHub implementation wrapping existing GitHub modules
  - `gitlab/adapter.ts`: GitLab implementation for GitLab CI/CD

### Key Entry Points

- **`src/entrypoints/prepare.ts`**: Main orchestrator that:
  - Creates provider instance
  - Validates permissions and triggers
  - Sets up branches and comments
  - Generates prompt file
  - Configures MCP servers
- **`src/entrypoints/update-comment-link.ts`**: Updates comment with job links after execution

### Platform-Specific Modules

**GitHub** (`src/github/`):

- `context.ts`: Builds GitHub-specific context from environment
- `data/fetcher.ts`: GraphQL queries for PR/issue data
- `data/formatter.ts`: Formats GitHub data for prompts
- `operations/`: Branch creation, comment management
- `validation/`: Permission and trigger checks

**GitLab** (`src/gitlab/`):

- `context.ts`: Builds GitLab-specific context from CI environment
- `data/fetcher.ts`: REST API calls for MR/issue data
- `operations/`: Branch and comment operations
- `validation/`: GitLab-specific validation logic

### MCP Server Integration

- **`src/mcp/github-file-ops-server.ts`**: Custom MCP server providing:
  - `commit_files`: Atomic multi-file commits
  - `delete_files`: Atomic file deletion
  - `update_claude_comment`: Comment updates
- **`src/mcp/install-mcp-server.ts`**: Merges custom MCP configurations

### Important Architectural Decisions

1. **Single Comment Thread**: Claude always updates one tracking comment, never creates multiple
2. **Provider Pattern**: All platform-specific code isolated behind common interface
3. **Smart Branching**: Context-aware branch handling (new for issues, direct for open PRs)
4. **OIDC Authentication**: Supports cloud providers (Bedrock, Vertex AI) via OIDC
5. **Tool Allowlisting**: Explicit tool permissions for security

## Testing Patterns

Tests use Bun's built-in test framework with descriptive test names:

```typescript
import { describe, test, expect } from "bun:test";

describe("Module Name", () => {
  test("should handle specific case", () => {
    // Test implementation
  });
});
```

Common test patterns:

- Mock contexts in `test/mockContext.ts`
- Integration tests for sanitization and formatting
- Unit tests for individual operations

## Development Tips

- When adding platform support, implement the Provider interface
- Platform-specific logic goes in `src/{platform}/` directories
- Common types are in `src/providers/types.ts`
- Use the existing GraphQL/REST patterns for API calls
- Follow the single-comment update pattern for all user communication

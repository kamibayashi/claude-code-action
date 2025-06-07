# GitLab Runner Advanced Configuration for Claude Code Action

This guide covers advanced GitLab Runner configurations for optimizing Claude Code Action in various environments.

## Overview

While the basic setup in `gitlab-setup.md` works for most cases, enterprise environments and large-scale deployments may require additional configuration for optimal performance, security, and reliability.

## Runner Configuration

### 1. Docker Executor with Enhanced Capabilities

For Claude Code Action to work with MCP servers and Docker-based tools, configure your runner with:

```toml
# /etc/gitlab-runner/config.toml
[[runners]]
  name = "claude-code-runner"
  executor = "docker"

  [runners.docker]
    image = "node:20"
    privileged = true  # Required if MCP servers use Docker
    volumes = [
      "/cache",
      "/var/run/docker.sock:/var/run/docker.sock:rw"  # Docker socket mounting
    ]
    shm_size = 2147483648  # 2GB shared memory for large operations
    disable_cache = false
    pull_policy = ["if-not-present", "always"]

  [runners.cache]
    Type = "s3"  # or "gcs" for Google Cloud
    Shared = true
    [runners.cache.s3]
      ServerAddress = "s3.amazonaws.com"
      BucketName = "gitlab-runner-cache"
      BucketLocation = "us-east-1"
```

### 2. Resource Limits and Performance Tuning

```yaml
# .gitlab-ci.yml
claude-code:
  image: node:20

  # Resource limits
  variables:
    # Increase Node.js memory for large codebases
    NODE_OPTIONS: "--max-old-space-size=8192"
    # Bun-specific optimizations
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: ${CI_PROJECT_DIR}/.bun-cache

  # GitLab-specific resource controls
  resource_group: claude_analysis # Prevent parallel runs
  timeout: 45 minutes # Increase timeout for large analyses
  retry:
    max: 2
    when:
      - runner_system_failure
      - stuck_or_timeout_failure
```

### 3. Caching Strategy

Optimize build times with proper caching:

```yaml
# .gitlab-ci.yml
.claude_cache:
  cache:
    key:
      files:
        - package.json
        - bun.lockb
      prefix: ${CI_COMMIT_REF_SLUG}
    paths:
      - node_modules/
      - .bun-cache/
      - ~/.bun/install/cache/
    policy: pull-push

claude-code:
  extends: .claude_cache
  script:
    # Your Claude Code script
```

### 4. Docker-in-Docker Configuration

If MCP servers require Docker:

```yaml
claude-code-dind:
  image: docker:24-dind
  services:
    - name: docker:24-dind
      alias: docker
      command: ["--tls=false"]

  variables:
    DOCKER_DRIVER: overlay2
    DOCKER_HOST: tcp://docker:2375
    DOCKER_TLS_CERTDIR: ""

  before_script:
    # Install Node.js in Docker image
    - apk add --no-cache nodejs npm
    - npm install -g bun

  script:
    # Verify Docker access
    - docker version
    - docker info

    # Continue with Claude Code setup
    - git clone https://github.com/anthropics/claude-code-action.git /tmp/claude-action
    - cd /tmp/claude-action
    - bun install
```

### 5. Security Hardening

For production environments:

```yaml
# .gitlab-ci.yml
claude-code-secure:
  image: node:20-alpine # Smaller attack surface

  variables:
    # Security headers
    GIT_STRATEGY: fetch # Don't clone, just fetch
    GIT_DEPTH: 1 # Shallow clone
    FF_NETWORK_PER_BUILD: "true" # Isolated network per job

  # Only run on protected branches with manual approval
  rules:
    - if: '$CI_COMMIT_PROTECTED == "true"'
      when: manual
    - when: never

  # Use masked variables for secrets
  secrets:
    ANTHROPIC_API_KEY:
      vault: production/anthropic/api-key@ci
      file: false
```

### 6. Multi-Architecture Support

For teams using different architectures:

```yaml
# .gitlab-ci.yml
.claude_multiarch:
  parallel:
    matrix:
      - RUNNER_TAG: [amd64, arm64]
  tags:
    - ${RUNNER_TAG}

  image: node:20

  before_script:
    # Architecture-specific setup
    - echo "Running on ${RUNNER_TAG} architecture"
    - uname -m
```

### 7. Artifact Management

Optimize artifact storage:

```yaml
claude-code:
  artifacts:
    name: "claude-analysis-${CI_COMMIT_SHORT_SHA}"
    paths:
      - prompt.txt
      - mcp_config.json
      - analysis_results/
    exclude:
      - "**/*.log"
      - "**/node_modules/**"
    reports:
      # Custom report types (GitLab 15.7+)
      claude_security: security_report.json
      claude_quality: quality_report.json
    expire_in: 1 week
    when: always
```

### 8. Network and Proxy Configuration

For corporate environments:

```yaml
claude-code-corporate:
  variables:
    # Proxy settings
    HTTP_PROXY: ${CORPORATE_PROXY}
    HTTPS_PROXY: ${CORPORATE_PROXY}
    NO_PROXY: "localhost,127.0.0.1,gitlab.company.com,*.company.internal"

    # Custom CA certificates
    NODE_EXTRA_CA_CERTS: /etc/ssl/certs/company-ca-bundle.crt

  before_script:
    # Install corporate CA certificates
    - cp ${CI_PROJECT_DIR}/certs/company-ca.crt /usr/local/share/ca-certificates/
    - update-ca-certificates
```

### 9. Monitoring and Observability

Add metrics and logging:

```yaml
claude-code-monitored:
  before_script:
    # Set up structured logging
    - export CLAUDE_LOG_LEVEL=debug
    - export CLAUDE_LOG_FORMAT=json

  script:
    # Time the execution
    - START_TIME=$(date +%s)

    # Run Claude Code with metrics
    - |
      bun run src/entrypoints/prepare.ts 2>&1 | tee claude.log | \
      jq -r 'select(.level == "error" or .level == "warn")'

    # Calculate metrics
    - END_TIME=$(date +%s)
    - DURATION=$((END_TIME - START_TIME))
    - echo "Claude Code execution took ${DURATION} seconds"

  after_script:
    # Send metrics to monitoring system
    - |
      curl -X POST ${METRICS_ENDPOINT}/claude_code_metrics \
        -H "Content-Type: application/json" \
        -d "{
          \"duration\": ${DURATION},
          \"job_id\": \"${CI_JOB_ID}\",
          \"status\": \"${CI_JOB_STATUS}\"
        }"
```

### 10. Kubernetes Executor Configuration

For cloud-native environments:

```yaml
# config.toml
[[runners]]
  name = "claude-k8s-runner"
  executor = "kubernetes"

  [runners.kubernetes]
    namespace = "gitlab-runners"
    image = "node:20"
    privileged = true

    # Resource requests and limits
    cpu_request = "1"
    cpu_limit = "4"
    memory_request = "2Gi"
    memory_limit = "8Gi"

    # Service account for cloud provider access
    service_account = "claude-code-runner"

    # Node selector for GPU nodes (if needed)
    [runners.kubernetes.node_selector]
      "node.kubernetes.io/instance-type" = "m5.xlarge"
```

## Environment-Specific Configurations

### Self-Hosted GitLab

```yaml
claude-code-self-hosted:
  variables:
    # Custom GitLab instance
    CI_API_V4_URL: "https://gitlab.company.com/api/v4"
    CI_SERVER_URL: "https://gitlab.company.com"

    # Custom package registries
    NPM_CONFIG_REGISTRY: "https://npm.company.com"

  before_script:
    # Trust self-signed certificates
    - git config --global http.sslCAInfo /etc/ssl/certs/company-ca.crt
    - npm config set cafile /etc/ssl/certs/company-ca.crt
```

### Air-Gapped Environments

For environments without internet access:

```yaml
claude-code-airgap:
  image: registry.company.com/claude-code:latest # Pre-built image

  variables:
    # Use internal mirrors
    CLAUDE_ACTION_REPO: "https://git.company.com/mirrors/claude-code-action.git"
    BUN_INSTALL_BIN: "/opt/bun/bin"

  before_script:
    # Skip external downloads
    - echo "Using pre-installed dependencies"

  cache:
    # Use local cache server
    key: "${CI_COMMIT_REF_SLUG}"
    paths:
      - .cache/
    policy: pull
```

## Performance Optimization Tips

1. **Use Runner Tags**: Dedicate specific runners for Claude Code jobs

   ```yaml
   tags:
     - claude-code
     - high-memory
   ```

2. **Parallel Analysis**: Split large codebases

   ```yaml
   claude-analyze:
     parallel: 4
     script:
       - bun run analyze --shard ${CI_NODE_INDEX}/${CI_NODE_TOTAL}
   ```

3. **Incremental Analysis**: Only analyze changed files
   ```yaml
   script:
     - git diff --name-only ${CI_MERGE_REQUEST_DIFF_BASE_SHA}..HEAD > changed_files.txt
     - bun run claude-code --files-list changed_files.txt
   ```

## Troubleshooting Runner Issues

### Docker Socket Permission Denied

```bash
# In runner config.toml
volumes = ["/var/run/docker.sock:/var/run/docker.sock:rw"]
# Ensure gitlab-runner user is in docker group
sudo usermod -aG docker gitlab-runner
```

### Out of Memory Errors

```yaml
variables:
  NODE_OPTIONS: "--max-old-space-size=16384" # 16GB
```

### Slow Git Operations

```yaml
variables:
  GIT_DEPTH: 1 # Shallow clone
  GIT_STRATEGY: fetch # Reuse existing worktree
```

### Certificate Errors

```yaml
variables:
  GIT_SSL_NO_VERIFY: "false" # Never disable SSL in production!
  NODE_TLS_REJECT_UNAUTHORIZED: "1"
```

## Monitoring Runner Health

Create a health check job:

```yaml
claude-runner-health:
  script:
    - echo "Checking runner capabilities..."
    - docker version || echo "Docker not available"
    - node --version
    - bun --version || npm install -g bun
    - df -h # Check disk space
    - free -m # Check memory
    - nproc # Check CPU cores
  only:
    - schedules
```

This configuration ensures Claude Code Action runs efficiently and reliably in various GitLab Runner environments.

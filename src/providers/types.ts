/**
 * Common types for both GitHub and GitLab providers
 */

export type Author = {
  username: string;
  displayName?: string;
};

export type Comment = {
  id: string;
  body: string;
  author: Author;
  createdAt: string;
};

export type ReviewComment = Comment & {
  path: string;
  line: number | null;
};

export type Commit = {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
};

export type FileChange = {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
};

export type Review = {
  id: string;
  author: Author;
  body: string;
  state: string;
  submittedAt: string;
  comments: ReviewComment[];
};

export type MergeRequest = {
  title: string;
  description: string;
  author: Author;
  sourceBranch: string;
  targetBranch: string;
  headSha: string;
  createdAt: string;
  additions: number;
  deletions: number;
  state: string;
  commits: Commit[];
  files: FileChange[];
  comments: Comment[];
  reviews: Review[];
};

export type Issue = {
  title: string;
  description: string;
  author: Author;
  createdAt: string;
  state: string;
  comments: Comment[];
};

export type Repository = {
  owner: string;
  name: string;
  defaultBranch: string;
};

export type ProviderContext = {
  provider: "github" | "gitlab";
  repository: Repository;
  entityType: "issue" | "merge_request" | "pull_request";
  entityNumber: number;
  actor: Author;
  inputs: Record<string, any>;
};

export type ProviderData = {
  issue?: Issue;
  mergeRequest?: MergeRequest;
  repository: Repository;
};

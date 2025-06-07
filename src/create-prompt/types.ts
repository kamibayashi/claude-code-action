export type CommonFields = {
  repository: string;
  claudeCommentId: string;
  triggerPhrase: string;
  triggerUsername?: string;
  customInstructions?: string;
  allowedTools?: string;
  disallowedTools?: string;
  directPrompt?: string;
  provider?: "github" | "gitlab";
};

type PullRequestReviewCommentEvent = {
  eventName: "pull_request_review_comment";
  isPR: true;
  prNumber: string;
  commentId?: string; // May be present for review comments
  commentBody: string;
  claudeBranch?: string;
  baseBranch?: string;
};

type PullRequestReviewEvent = {
  eventName: "pull_request_review";
  isPR: true;
  prNumber: string;
  commentBody: string;
  claudeBranch?: string;
  baseBranch?: string;
};

type IssueCommentEvent = {
  eventName: "issue_comment";
  commentId: string;
  issueNumber: string;
  isPR: false;
  baseBranch: string;
  claudeBranch: string;
  commentBody: string;
};

// Not actually a real github event, since issue comments and PR coments are both sent as issue_comment
type PullRequestCommentEvent = {
  eventName: "issue_comment";
  commentId: string;
  prNumber: string;
  isPR: true;
  commentBody: string;
  claudeBranch?: string;
  baseBranch?: string;
};

type IssueOpenedEvent = {
  eventName: "issues";
  eventAction: "opened";
  isPR: false;
  issueNumber: string;
  baseBranch: string;
  claudeBranch: string;
};

type IssueAssignedEvent = {
  eventName: "issues";
  eventAction: "assigned";
  isPR: false;
  issueNumber: string;
  baseBranch: string;
  claudeBranch: string;
  assigneeTrigger: string;
};

type PullRequestEvent = {
  eventName: "pull_request";
  eventAction?: string; // opened, synchronize, etc.
  isPR: true;
  prNumber: string;
  claudeBranch?: string;
  baseBranch?: string;
};

// Union type for all possible event types
export type EventData =
  | PullRequestReviewCommentEvent
  | PullRequestReviewEvent
  | PullRequestCommentEvent
  | IssueCommentEvent
  | IssueOpenedEvent
  | IssueAssignedEvent
  | PullRequestEvent;

// Combined type with separate eventData field
export type PreparedContext = CommonFields & {
  eventData: EventData;
};

// Provider-agnostic event types
export type ProviderEventName =
  | "merge_request_comment"
  | "issue_comment"
  | "merge_request_opened"
  | "merge_request_updated"
  | "issue_opened"
  | "issue_assigned";

export type BaseEventData = {
  provider: "github" | "gitlab";
  entityType: "issue" | "merge_request" | "pull_request";
  entityNumber: string;
  baseBranch: string;
  claudeBranch?: string;
  commentBody?: string;
  commentId?: string;
  assigneeTrigger?: string;
};

export type ProviderAgnosticEvent = {
  eventName: ProviderEventName;
  isPR: boolean;
} & BaseEventData;

// Map GitHub events to provider-agnostic events
export function mapGitHubEventToAgnostic(
  event: EventData,
): ProviderAgnosticEvent {
  const baseData = {
    provider: "github" as const,
    baseBranch: "baseBranch" in event ? event.baseBranch || "" : "",
    claudeBranch: "claudeBranch" in event ? event.claudeBranch : undefined,
    commentBody: "commentBody" in event ? event.commentBody : undefined,
    commentId: "commentId" in event ? event.commentId : undefined,
  };

  switch (event.eventName) {
    case "pull_request_review_comment":
    case "pull_request_review":
      return {
        ...baseData,
        eventName: "merge_request_comment",
        entityType: "pull_request",
        entityNumber: event.prNumber,
        isPR: true,
      };
    case "issue_comment":
      if (event.isPR) {
        return {
          ...baseData,
          eventName: "merge_request_comment",
          entityType: "pull_request",
          entityNumber: (event as any).prNumber,
          isPR: true,
        };
      } else {
        return {
          ...baseData,
          eventName: "issue_comment",
          entityType: "issue",
          entityNumber: (event as any).issueNumber,
          isPR: false,
        };
      }
    case "pull_request":
      return {
        ...baseData,
        eventName:
          event.eventAction === "opened"
            ? "merge_request_opened"
            : "merge_request_updated",
        entityType: "pull_request",
        entityNumber: event.prNumber,
        isPR: true,
      };
    case "issues":
      if (event.eventAction === "opened") {
        return {
          ...baseData,
          eventName: "issue_opened",
          entityType: "issue",
          entityNumber: event.issueNumber,
          isPR: false,
        };
      } else if (event.eventAction === "assigned") {
        return {
          ...baseData,
          eventName: "issue_assigned",
          entityType: "issue",
          entityNumber: event.issueNumber,
          isPR: false,
          assigneeTrigger: (event as any).assigneeTrigger,
        };
      }
      throw new Error(
        `Unsupported issue event action: ${(event as any).eventAction}`,
      );
    default:
      throw new Error(`Unsupported event type: ${(event as any).eventName}`);
  }
}

// Create GitLab event from context
export function createGitLabEvent(
  entityType: "issue" | "merge_request",
  entityNumber: string,
  eventTrigger: string,
  baseBranch: string,
  claudeBranch?: string,
  commentBody?: string,
  commentId?: string,
  assigneeTrigger?: string,
): ProviderAgnosticEvent {
  const baseData = {
    provider: "gitlab" as const,
    entityType,
    entityNumber,
    baseBranch,
    claudeBranch,
    commentBody,
    commentId,
    assigneeTrigger,
  };

  // Determine event type based on context
  if (commentBody && commentId) {
    return {
      ...baseData,
      eventName:
        entityType === "merge_request"
          ? "merge_request_comment"
          : "issue_comment",
      isPR: entityType === "merge_request",
    };
  } else if (assigneeTrigger) {
    return {
      ...baseData,
      eventName: "issue_assigned",
      isPR: false,
    };
  } else if (eventTrigger === "opened") {
    return {
      ...baseData,
      eventName:
        entityType === "merge_request"
          ? "merge_request_opened"
          : "issue_opened",
      isPR: entityType === "merge_request",
    };
  } else {
    return {
      ...baseData,
      eventName: "merge_request_updated",
      isPR: true,
    };
  }
}

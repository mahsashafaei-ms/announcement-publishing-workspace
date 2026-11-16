import { AnnouncementMockError } from "../mocks";
import type { Issue } from "../domain/types";

const MOCK_ERROR_KINDS = {
  RESPONSE_LOST: "response-lost",
  STATUS_UNAVAILABLE: "status-unavailable",
  UNKNOWN_ANNOUNCEMENT: "unknown-announcement",
  OPERATION_ID_CONFLICT: "operation-conflict",
} as const;

/**
 * The service-adapter boundary: turns whatever a service call threw into a domain Issue.
 *
 * Only the service's documented error codes get a specific meaning. Anything else, including a
 * generic TypeError or RangeError, is "unexpected": it does not prove that the request was refused,
 * so the attempt stays recoverable with its original operation ID.
 */
export const toIssue = (error: unknown, occurredAt: string): Issue => {
  if (error instanceof AnnouncementMockError) {
    return {
      kind: MOCK_ERROR_KINDS[error.code],
      requestId: error.requestId,
      detail: `${error.code}: ${error.message}`,
      occurredAt,
    };
  }
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : "Non-error value thrown";
  return { kind: "unexpected", detail, occurredAt };
};

/** An issue for a request the client refused to send because its IDs break the service contract. */
export const invalidRequestIssue = (occurredAt: string): Issue => ({
  kind: "invalid-request",
  detail: "The announcement or operation ID is not valid, so the request was not sent.",
  occurredAt,
});

import type { Issue } from "./types";

/**
 * True only when the failure proves that the publish request created no operation, so a new
 * attempt with a new operation ID cannot duplicate a publication.
 *
 * - `operation-conflict` and `unknown-announcement`: the service contract says it refused the request.
 * - `invalid-request`: produced only by the client's own ID validation, before anything was sent.
 *
 * Everything else (lost responses, unexpected errors, including generic TypeError/RangeError thrown
 * somewhere along the way) may have reached the service and therefore leaves the attempt recoverable.
 */
export const isDefinitiveRefusal = (issue: Issue): boolean =>
  issue.kind === "operation-conflict" || issue.kind === "unknown-announcement" || issue.kind === "invalid-request";

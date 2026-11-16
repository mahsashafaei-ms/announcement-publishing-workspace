const MAX_ID_LENGTH = 100;

/** The service contract for announcement and operation IDs: nonblank strings of at most 100 characters. */
export const isValidId = (value: string): boolean =>
  typeof value === "string" && value.trim().length > 0 && value.length <= MAX_ID_LENGTH;

const randomHex = (bytes: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * One ID per logical attempt: `op-` + UUID (39 chars, well under the 100 limit).
 * `randomUUID` needs a secure context; `getRandomValues` does not, so we fall
 * back to it rather than ever deriving an ID from the announcement ID or a counter
 * (a counter restarts after refresh and could collide with a recovered operation).
 */
export const createOperationId = (): string =>
  typeof crypto.randomUUID === "function" ? `op-${crypto.randomUUID()}` : `op-${randomHex(16)}`;

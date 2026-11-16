import type { PublicationOperation } from "../mocks";
import type { OperationRecord } from "../domain/types";

const identity = (operationId = "op-1", announcementId = "ann-101") => ({
  operationId,
  announcementId,
  createdAt: "2025-01-01T00:00:00.000Z",
});

export const processing = (operationId?: string, announcementId?: string): PublicationOperation => ({
  ...identity(operationId, announcementId),
  status: "processing",
  version: 1,
});

export const published = (operationId?: string, announcementId?: string): PublicationOperation => ({
  ...identity(operationId, announcementId),
  status: "published",
  version: 2,
  publicationId: "pub-1",
  publishedAt: "2025-01-01T00:00:03.000Z",
});

export const rejected = (operationId?: string, announcementId?: string): PublicationOperation => ({
  ...identity(operationId, announcementId),
  status: "rejected",
  version: 2,
  reason: "Declined",
});

export const record = (overrides: Partial<OperationRecord> = {}): OperationRecord => ({
  operationId: "op-1",
  announcementId: "ann-101",
  seq: 1,
  createdAt: "2025-01-01T00:00:00.000Z",
  snapshot: null,
  publishRequest: "sending",
  checking: false,
  issue: null,
  feedbackRequest: 0,
  integrityNote: null,
  ...overrides,
});

import { processing, published, rejected } from "../test/fixtures";
import { decideSnapshot } from "./snapshot";

const owner = { operationId: "op-1", announcementId: "ann-101" };

describe("decideSnapshot", () => {
  it("accepts the first snapshot", () => {
    expect(decideSnapshot(null, processing(), owner)).toEqual({ action: "apply", snapshot: processing() });
  });

  it("lets a terminal snapshot replace processing", () => {
    expect(decideSnapshot(processing(), published(), owner)).toEqual({ action: "apply", snapshot: published() });
    expect(decideSnapshot(processing(), rejected(), owner)).toEqual({ action: "apply", snapshot: rejected() });
  });

  it("never lets an older processing snapshot overwrite a terminal one", () => {
    expect(decideSnapshot(published(), processing(), owner)).toEqual({ action: "ignore", reason: "stale" });
    expect(decideSnapshot(rejected(), processing(), owner)).toEqual({ action: "ignore", reason: "stale" });
  });

  it("treats an equal-version snapshot as a duplicate", () => {
    expect(decideSnapshot(processing(), processing(), owner)).toEqual({ action: "ignore", reason: "duplicate" });
    expect(decideSnapshot(published(), published(), owner)).toEqual({ action: "ignore", reason: "duplicate" });
  });

  it("rejects a different terminal outcome at the same version and keeps the first one", () => {
    expect(decideSnapshot(published(), rejected(), owner).action).toBe("reject");
    expect(decideSnapshot(rejected(), published(), owner).action).toBe("reject");
    const other = { ...published(), publicationId: "pub-2" };
    expect(decideSnapshot(published(), other, owner).action).toBe("reject");
  });

  it("rejects snapshots that belong to another operation or announcement", () => {
    expect(decideSnapshot(null, processing("op-2"), owner).action).toBe("reject");
    expect(decideSnapshot(null, processing("op-1", "ann-102"), owner).action).toBe("reject");
  });
});

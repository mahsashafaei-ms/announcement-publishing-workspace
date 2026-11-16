import { createOperationId, isValidId } from "./operationId";

describe("createOperationId", () => {
  it("creates unique, valid IDs that are not announcement IDs", () => {
    const ids = new Set(Array.from({ length: 500 }, createOperationId));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id.trim()).not.toBe("");
      expect(id.length).toBeLessThanOrEqual(100);
      expect(id).not.toMatch(/^ann-/);
    }
  });

  it("falls back to getRandomValues when randomUUID is unavailable (insecure context)", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(createOperationId()).toMatch(/^op-[0-9a-f]{32}$/);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});

describe("isValidId", () => {
  it.each([
    ["op-1", true],
    ["constructor", true],
    ["x".repeat(100), true],
    ["", false],
    ["   ", false],
    ["x".repeat(101), false],
  ])("%j -> %s", (value, valid) => {
    expect(isValidId(value)).toBe(valid);
  });
});

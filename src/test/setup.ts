import "@testing-library/jest-dom/vitest";

// Testing Library only knows how to flush its internal setTimeout(0) under Jest fake timers.
// This shim lets it detect and advance Vitest's fake timers instead of hanging.
(globalThis as unknown as { jest: { advanceTimersByTime: (ms: number) => void } }).jest = {
  advanceTimersByTime: (ms) => {
    vi.advanceTimersByTime(ms);
  },
};

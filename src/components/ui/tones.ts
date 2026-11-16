import type { PublicationKind } from "../../domain/selectors";

/**
 * The colour tone of each publication state and the classes each tone uses. Class names are
 * written out in full so Tailwind can find them; never build them with string templates.
 */
type Tone = "neutral" | "info" | "success" | "danger" | "warning";

export const kindTone: Record<PublicationKind, Tone> = {
  restoring: "neutral",
  "history-unavailable": "warning",
  "not-submitted": "neutral",
  submitting: "info",
  processing: "info",
  published: "success",
  rejected: "danger",
  unconfirmed: "warning",
};

export const badgeTone: Record<Tone, string> = {
  neutral: "bg-accent-soft text-muted",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
};

/** Status panel: the box, its icon tile and its text. */
export const panelTone: Record<Tone, { box: string; icon: string; text: string }> = {
  neutral: { box: "border-line bg-sunken", icon: "bg-accent-soft text-accent-tint", text: "text-muted" },
  info: { box: "border-info-line bg-info-panel", icon: "bg-info-soft text-info", text: "text-info" },
  success: { box: "border-success-line bg-success-panel", icon: "bg-success-soft text-success", text: "text-muted" },
  danger: { box: "border-danger-line bg-danger-panel", icon: "bg-danger-soft text-danger", text: "text-muted" },
  warning: { box: "border-warning-line bg-warning-panel", icon: "bg-warning-soft text-warning", text: "text-warning" },
};

/** Dot on the history timeline. */
export const markerTone: Record<Tone, string> = {
  neutral: "bg-line-active",
  info: "bg-line-active",
  success: "bg-success-mark",
  danger: "bg-danger-mark",
  warning: "bg-warning-mark",
};

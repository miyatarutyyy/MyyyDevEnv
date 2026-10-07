import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const FIRST_SUGGESTION_PERCENT = 70;
const SUGGESTION_INTERVAL_PERCENT = 10;

export default function (pi: ExtensionAPI) {
  let lastNotifiedThreshold = 0;

  pi.on("turn_end", (_event, ctx) => {
    if (!ctx.hasUI) return;

    const percent = ctx.getContextUsage()?.percent;
    if (percent == null || !Number.isFinite(percent)) return;

    if (percent < FIRST_SUGGESTION_PERCENT) {
      lastNotifiedThreshold = 0;
      return;
    }

    const threshold =
      FIRST_SUGGESTION_PERCENT +
      Math.floor((percent - FIRST_SUGGESTION_PERCENT) / SUGGESTION_INTERVAL_PERCENT) *
        SUGGESTION_INTERVAL_PERCENT;
    if (threshold <= lastNotifiedThreshold) return;

    lastNotifiedThreshold = threshold;
    ctx.ui.notify(
      `Context is at ${percent.toFixed(0)}% (passed ${threshold}%). Consider running /compact.`,
      "warning",
    );
  });

  pi.on("session_compact", () => {
    lastNotifiedThreshold = 0;
  });

  pi.on("session_start", () => {
    lastNotifiedThreshold = 0;
  });
}

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  cleanupStaleChildCredentials,
  closeResearchTab,
  createKnowledgeArtifacts,
  elispString,
  launchResearchChild,
  recoverKnowledgeArtifacts,
  redactSecrets,
  resolveConfig,
  selectKnowledgeContext,
  updateLaunchState,
  waitForResearchReadiness,
} from "./memorandum/core.mjs";

const execFileAsync = promisify(execFile);

function parseArguments(args: string): { topic: string; preview: boolean } {
  const preview = /(?:^|\s)--preview(?:\s|$)/.test(args);
  const topic = args.replace(/(?:^|\s)--preview(?=\s|$)/g, " ").trim();
  return { topic, preview };
}

function validateEditedContext(value: unknown, topic: string) {
  if (!value || typeof value !== "object") throw new Error("Preview must be a JSON object.");
  const candidate = value as { question?: unknown; messages?: unknown; selection?: unknown };
  if (typeof candidate.question !== "string" || !candidate.question.trim()) {
    throw new Error("Preview question must be a non-empty string.");
  }
  if (!Array.isArray(candidate.messages) || candidate.messages.length > 12) {
    throw new Error("Preview messages must be an array with at most 12 entries.");
  }
  let redacted = false;
  const messages = candidate.messages.map((message) => {
    if (!message || typeof message !== "object") throw new Error("Invalid message in preview.");
    const item = message as { entryId?: unknown; role?: unknown; text?: unknown };
    if (!(["user", "assistant"].includes(String(item.role))) || typeof item.text !== "string") {
      throw new Error("Preview messages may contain only user/assistant text.");
    }
    const safeText = redactSecrets(item.text.slice(0, 8_000));
    redacted ||= safeText.redacted;
    return {
      ...(typeof item.entryId === "string" ? { entryId: item.entryId } : {}),
      role: item.role,
      text: safeText.text,
    };
  });
  return {
    topic,
    question: redactSecrets(candidate.question.trim().slice(0, 1_000)).text,
    messages,
    selection: {
      mode: "manual",
      truncated: false,
      redacted: redacted || redactSecrets(candidate.question).redacted,
      warning: "Secret detection is best-effort and cannot guarantee that all sensitive data was found.",
    },
  };
}

async function openInEmacs(config: ReturnType<typeof resolveConfig>, notePath: string): Promise<void> {
  const expression = `(memorandum-open-note ${elispString(notePath)})`;
  await execFileAsync(config.emacsclient, ["--eval", expression], { timeout: 10_000 });
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    try {
      await cleanupStaleChildCredentials(resolveConfig());
    } catch {
      ctx.ui.notify("Memorandum could not clean an old temporary child credential copy.", "warning");
    }
  });

  pi.registerCommand("memorandum-recover", {
    description: "Resume a partial Memorandum launch without creating another note",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/memorandum-recover requires Pi TUI mode.", "error");
        return;
      }
      const fields = args.trim().split(/\s+/).filter(Boolean);
      const restartResearcher = fields.includes("--restart-researcher");
      const ids = fields.filter((field) => field !== "--restart-researcher");
      if (ids.length !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ids[0])) {
        ctx.ui.notify("Usage: /memorandum-recover <launch-uuid> [--restart-researcher]", "error");
        return;
      }

      const config = resolveConfig();
      let recovered;
      try {
        recovered = await recoverKnowledgeArtifacts(config, ids[0]);
      } catch (error) {
        ctx.ui.notify(`Memorandum recovery could not validate its saved Handoff: ${String(error)}`, "error");
        return;
      }
      const { artifacts, state } = recovered;
      try {
        await openInEmacs(config, artifacts.notePath);
        await updateLaunchState(config, artifacts.id, state.status, { emacs: "READY" });
      } catch (error) {
        await updateLaunchState(config, artifacts.id, "PARTIAL", { emacs: "FAILED", failure: String(error) }).catch(() => undefined);
        ctx.ui.notify(`The saved note is intact, but Emacs could not open it. Retry with /memorandum-recover ${artifacts.id}`, "warning");
        return;
      }

      if (state.researcher === "READY" && !restartResearcher) {
        await updateLaunchState(config, artifacts.id, "READY", { emacs: "READY", researcher: "READY" });
        ctx.ui.notify(`Recovered the existing Memorandum note; its researcher was already confirmed.\n${artifacts.notePath}`, "info");
        return;
      }
      if (state.herdrPaneId && !restartResearcher) {
        try {
          await waitForResearchReadiness(config, state.herdrPaneId, { timeout: 10_000 });
          await updateLaunchState(config, artifacts.id, "READY", { emacs: "READY", researcher: "READY" });
          ctx.ui.notify(`The existing research tab confirmed the Handoff.\n${artifacts.notePath}`, "info");
        } catch {
          ctx.ui.notify(`The existing researcher is not confirmed yet (tab ${state.herdrTabId || "unknown"}). No duplicate was started. To explicitly replace it: /memorandum-recover ${artifacts.id} --restart-researcher`, "warning");
        }
        return;
      }
      if (restartResearcher && state.herdrTabId) {
        try {
          await closeResearchTab(config, state.herdrTabId);
          await rm(path.join(config.runtimeDir, "memorandum", artifacts.id), { recursive: true, force: true });
          await rm(path.join(config.stateDir, "children", artifacts.id, "launch.sh"), { force: true });
        } catch (error) {
          ctx.ui.notify(`Could not safely close the existing Memorandum researcher; no replacement was started: ${String(error)}`, "error");
          return;
        }
      } else if (restartResearcher && state.herdrPaneId) {
        ctx.ui.notify("Cannot restart this child safely because its saved Herdr tab ID is missing.", "error");
        return;
      }

      await updateLaunchState(config, artifacts.id, "LAUNCHING", {
        emacs: "READY", researcher: "STARTING", herdrTabId: undefined, herdrPaneId: undefined,
      });
      try {
        const child = await launchResearchChild(config, artifacts, artifacts.handoff.source.cwd);
        await updateLaunchState(config, artifacts.id, "READY", {
          emacs: "READY", researcher: "READY", herdrWorkspaceId: child.workspace,
          herdrTabId: child.tabId, herdrPaneId: child.paneId,
        });
        ctx.ui.notify(`Resumed Memorandum using the existing note; the researcher confirmed the Handoff.\n${artifacts.notePath}`, "info");
      } catch (error) {
        const launchError = error as Error & { commandSubmitted?: boolean; tabId?: string; paneId?: string; workspace?: string };
        await updateLaunchState(config, artifacts.id, "PARTIAL", {
          emacs: "READY", researcher: launchError.commandSubmitted ? "STARTING" : "FAILED",
          herdrWorkspaceId: launchError.workspace, herdrTabId: launchError.tabId, herdrPaneId: launchError.paneId,
          failure: launchError.message,
        }).catch(() => undefined);
        ctx.ui.notify(`Recovery kept the same note but the researcher did not confirm readiness: ${launchError.message}\nRetry with /memorandum-recover ${artifacts.id}${launchError.tabId ? `\nExisting tab: ${launchError.tabId}` : ""}`, "warning");
      }
    },
  });

  pi.registerCommand("memorandum-knowledge", {
    description: "Create a knowledge note and hand off selected context",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/memorandum-knowledge requires Pi TUI mode.", "error");
        return;
      }

      const { topic, preview } = parseArguments(args);
      if (!topic) {
        ctx.ui.notify("Usage: /memorandum-knowledge [--preview] <topic>", "error");
        return;
      }

      const config = resolveConfig();
      let context = selectKnowledgeContext(ctx.sessionManager.getBranch(), topic);
      if (preview || context.requiresPreview) {
        const reviewed = await ctx.ui.editor(
          "Review selected Memorandum context (JSON). Cancel to stop.",
          JSON.stringify(
            {
              question: context.question,
              messages: context.messages,
              selection: context.selection,
            },
            null,
            2,
          ),
        );
        if (reviewed === undefined) {
          ctx.ui.notify("Memorandum capture cancelled; no note was created.", "info");
          return;
        }
        try {
          context = validateEditedContext(JSON.parse(reviewed), topic);
        } catch (error) {
          ctx.ui.notify(`Invalid preview; no note was created: ${String(error)}`, "error");
          return;
        }
      }

      let artifacts;
      try {
        artifacts = await createKnowledgeArtifacts({
          config,
          topic,
          source: {
            agent: "pi",
            cwd: ctx.cwd,
            sessionId: ctx.sessionManager.getSessionId(),
            entryIds: context.messages.map((item) => item.entryId).filter(Boolean),
          },
          context,
        });
      } catch (error) {
        const partial = error as Error & { notePath?: string; handoffPath?: string; launchId?: string; recoveryAvailable?: boolean };
        ctx.ui.notify(
          `Memorandum preparation failed: ${partial.message}${partial.recoveryAvailable && partial.launchId ? `\nSaved Handoff can be recovered without creating another note: /memorandum-recover ${partial.launchId}` : ""}`,
          "error",
        );
        return;
      }

      try {
        await openInEmacs(config, artifacts.notePath);
      } catch (error) {
        await updateLaunchState(config, artifacts.id, "PARTIAL", {
          emacs: "FAILED",
          researcher: "NOT_STARTED",
          failure: String(error),
        }).catch(() => undefined);
        ctx.ui.notify(
          `Note and handoff saved, but Emacs could not open the note: ${String(error)}\n${artifacts.notePath}`,
          "warning",
        );
        return;
      }

      await updateLaunchState(config, artifacts.id, "LAUNCHING", {
        emacs: "READY",
        researcher: "STARTING",
      });
      try {
        const child = await launchResearchChild(config, artifacts, ctx.cwd);
        await updateLaunchState(config, artifacts.id, "READY", {
          emacs: "READY",
          researcher: "READY",
          herdrWorkspaceId: child.workspace,
          herdrTabId: child.tabId,
          herdrPaneId: child.paneId,
        });
        ctx.ui.notify(
          `Knowledge note opened and independent research Pi confirmed it read the Handoff.\n${artifacts.notePath}`,
          "info",
        );
      } catch (error) {
        const launchError = error as Error & {
          commandSubmitted?: boolean;
          tabId?: string;
          paneId?: string;
          workspace?: string;
        };
        await updateLaunchState(config, artifacts.id, "PARTIAL", {
          emacs: "READY",
          researcher: launchError.commandSubmitted ? "STARTING" : "FAILED",
          herdrWorkspaceId: launchError.workspace,
          herdrTabId: launchError.tabId,
          herdrPaneId: launchError.paneId,
          failure: launchError.message,
        }).catch(() => undefined);
        ctx.ui.notify(
          `Knowledge note opened, but research Pi did not reach Handoff readiness: ${launchError.message}\n${artifacts.notePath}${launchError.tabId ? `\nHerdr tab: ${launchError.tabId}` : ""}`,
          "warning",
        );
      }
    },
  });
}

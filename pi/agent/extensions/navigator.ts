import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { okhslColor, truncateToWidth, type Color, type TuiMouseEvent, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const ENTRY_TYPE = "pi-navigator-state";
const MAX_PANEL_LINES = 10;
const MAX_TITLE_LINES = 2;
const STATUSES = ["PLANNED", "ADDRESS", "FINISH", "BLOCK"] as const;
type Status = (typeof STATUSES)[number];

type Task = {
  id: string;
  title: string;
  status: Status;
  reason?: string;
};

type Phase = {
  id: string;
  title: string;
  status: Status;
  reason?: string;
  tasks: Task[];
};

type NavigatorState = {
  goal: string;
  phases: Phase[];
  updatedAt: number;
};

const SetPlanParams = Type.Object({
  goal: Type.String({ minLength: 1, description: "The overall task goal" }),
  phases: Type.Array(
    Type.Object({
      id: Type.String({ minLength: 1 }),
      title: Type.String({ minLength: 1 }),
      status: Type.Optional(StringEnum(STATUSES)),
      reason: Type.Optional(Type.String()),
      tasks: Type.Array(
        Type.Object({
          id: Type.String({ minLength: 1 }),
          title: Type.String({ minLength: 1 }),
          status: Type.Optional(StringEnum(STATUSES)),
          reason: Type.Optional(Type.String()),
        }),
      ),
    }),
  ),
});

const AddPhaseParams = Type.Object({
  id: Type.String({ minLength: 1 }),
  title: Type.String({ minLength: 1 }),
  status: Type.Optional(StringEnum(STATUSES)),
  reason: Type.Optional(Type.String()),
  tasks: Type.Array(
    Type.Object({
      id: Type.String({ minLength: 1 }),
      title: Type.String({ minLength: 1 }),
      status: Type.Optional(StringEnum(STATUSES)),
      reason: Type.Optional(Type.String()),
    }),
  ),
});

const AddTaskParams = Type.Object({
  phase_id: Type.String({ minLength: 1 }),
  task_id: Type.String({ minLength: 1 }),
  title: Type.String({ minLength: 1 }),
  status: Type.Optional(StringEnum(STATUSES)),
  reason: Type.Optional(Type.String()),
});

const UpdatePhaseParams = Type.Object({
  phase_id: Type.String({ minLength: 1 }),
  status: StringEnum(STATUSES),
  reason: Type.Optional(Type.String()),
});

const UpdateTaskParams = Type.Object({
  phase_id: Type.String({ minLength: 1 }),
  task_id: Type.String({ minLength: 1 }),
  status: StringEnum(STATUSES),
  reason: Type.Optional(Type.String()),
});

function cloneState(state: NavigatorState): NavigatorState {
  return JSON.parse(JSON.stringify(state)) as NavigatorState;
}

function validateUniqueIds(phases: Array<{ id: string; tasks: Array<{ id: string }> }>): void {
  const phaseIds = new Set<string>();
  const taskIds = new Set<string>();
  for (const phase of phases) {
    if (phaseIds.has(phase.id)) throw new Error(`Duplicate phase id: ${phase.id}`);
    phaseIds.add(phase.id);
    for (const task of phase.tasks) {
      if (taskIds.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
      taskIds.add(task.id);
    }
  }
}

function normalizeStatus(value: unknown): Status | undefined {
  if (value === "PLAN") return "PLANNED"; // Migrate snapshots written by earlier versions.
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value)
    ? (value as Status)
    : undefined;
}

function readState(value: unknown): NavigatorState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.goal !== "string" || !Array.isArray(candidate.phases)) return undefined;

  const phases: Phase[] = [];
  for (const value of candidate.phases) {
    if (!value || typeof value !== "object") return undefined;
    const phase = value as Record<string, unknown>;
    const phaseStatus = normalizeStatus(phase.status);
    if (typeof phase.id !== "string" || typeof phase.title !== "string" || !phaseStatus || !Array.isArray(phase.tasks)) {
      return undefined;
    }
    const tasks: Task[] = [];
    for (const value of phase.tasks) {
      if (!value || typeof value !== "object") return undefined;
      const task = value as Record<string, unknown>;
      const taskStatus = normalizeStatus(task.status);
      if (typeof task.id !== "string" || typeof task.title !== "string" || !taskStatus) return undefined;
      tasks.push({
        id: task.id,
        title: task.title,
        status: taskStatus,
        ...(typeof task.reason === "string" ? { reason: task.reason } : {}),
      });
    }
    phases.push({
      id: phase.id,
      title: phase.title,
      status: phaseStatus,
      ...(typeof phase.reason === "string" ? { reason: phase.reason } : {}),
      tasks,
    });
  }
  return {
    goal: candidate.goal,
    phases,
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
  };
}

function restoreState(ctx: ExtensionContext): NavigatorState | undefined {
  let latest: NavigatorState | undefined;
  for (const entry of ctx.sessionManager.getBranch()) {
    const custom = entry as { type?: string; customType?: string; data?: unknown };
    if (custom.type !== "custom" || custom.customType !== ENTRY_TYPE) continue;
    latest = readState(custom.data);
  }
  return latest;
}

type DisplayItem = {
  marker: string;
  status: Status;
  title: string;
  reason?: string;
  isTask: boolean;
};

function getDisplayItems(current: NavigatorState | undefined): DisplayItem[] {
  if (!current) return [];
  const items: DisplayItem[] = [];
  for (const [phaseIndex, phase] of current.phases.entries()) {
    items.push({ marker: `P${phaseIndex + 1}`, status: phase.status, title: phase.title, reason: phase.reason, isTask: false });
    for (const [taskIndex, task] of phase.tasks.entries()) {
      items.push({
        marker: `T${phaseIndex + 1}.${taskIndex + 1}`,
        status: task.status,
        title: task.title,
        reason: task.reason,
        isTask: true,
      });
    }
  }
  return items;
}

function defaultScrollOffset(current: NavigatorState | undefined): number {
  const items = getDisplayItems(current);
  const addressTaskIndex = items.findIndex((item) => item.isTask && item.status === "ADDRESS");
  if (addressTaskIndex >= 0) {
    for (let index = addressTaskIndex - 1; index >= 0; index--) {
      if (items[index].isTask && items[index].status === "FINISH") return index;
    }
    return Math.max(0, addressTaskIndex - 1);
  }
  const addressPhaseIndex = items.findIndex((item) => item.status === "ADDRESS");
  return Math.max(0, addressPhaseIndex - 1);
}

function statusColor(status: Status, theme: Theme): Color {
  switch (status) {
    case "FINISH": return theme.colors.success;
    case "PLANNED": return theme.colors.mdHeading;
    case "ADDRESS": return okhslColor(235, 0.6, 0.68);
    case "BLOCK": return theme.colors.error;
  }
}

function formatDisplayItem(item: DisplayItem, theme: Theme): string {
  const marker = item.marker.slice(0, 8).padEnd(8);
  const tag = `[${item.status}]`;
  const status = theme.style(tag, { fg: statusColor(item.status, theme) }) + " ".repeat(Math.max(0, 9 - tag.length));
  return ` ${marker} ${status} ${item.title}${item.reason ? ` — ${item.reason}` : ""}`;
}

function wrapGoalTitle(goal: string, width: number, theme: Theme): string[] {
  const indent = 1;
  const contentWidth = Math.max(1, width - indent);
  const wrapped = wrapTextWithAnsi(goal, contentWidth);
  const overflow = wrapped.length > MAX_TITLE_LINES;
  const visible = wrapped.slice(0, MAX_TITLE_LINES);
  if (overflow && visible.length > 0) {
    const last = visible.length - 1;
    visible[last] = `${truncateToWidth(visible[last], Math.max(1, contentWidth - 1))}…`;
  }
  return visible.map((line) => theme.fg("accent", theme.bold(` ${line}`)));
}

function renderDashboard(
  state: () => NavigatorState | undefined,
  theme: Theme,
  scroll: { offset: number },
  reportWidth: (width: number) => void,
) {
  function layout(current: NavigatorState | undefined, width: number) {
    const title = wrapGoalTitle(current?.goal || "計画はまだありません", width, theme);
    const itemStart = 1 + title.length + 1;
    const visibleItems = Math.max(0, MAX_PANEL_LINES - itemStart - 2);
    return { title, itemStart, visibleItems };
  }

  return {
    render(width: number): string[] {
      reportWidth(width);
      const current = state();
      const items = getDisplayItems(current);
      const { title, visibleItems } = layout(current, width);
      const maxOffset = Math.max(items.length - visibleItems, defaultScrollOffset(current));
      scroll.offset = Math.max(0, Math.min(scroll.offset, maxOffset));
      const lines: string[] = [];
      const fit = (text: string) => truncateToWidth(text, width);
      const rule = () => fit(theme.fg("borderMuted", "=".repeat(Math.max(0, width))));

      lines.push(rule());
      lines.push(...title.map(fit));
      lines.push(rule());
      const visible = items.slice(scroll.offset, scroll.offset + visibleItems);
      lines.push(...visible.map((item) => fit(formatDisplayItem(item, theme))));
      while (lines.length < MAX_PANEL_LINES - 2) lines.push("");

      const footer = items.length > visibleItems
        ? theme.fg("dim", ` Wheel to scroll · ${scroll.offset + 1}–${Math.min(scroll.offset + visibleItems, items.length)} of ${items.length}`)
        : theme.fg("dim", current ? ` Updated ${new Date(current.updatedAt).toLocaleTimeString()}` : "");
      const footerText = truncateToWidth(footer, Math.max(0, width - 2));
      const equals = theme.fg("borderMuted", "=".repeat(Math.max(0, width - visibleWidth(footerText) - 1)));
      lines.push(fit(`${footerText} ${equals}`));
      lines.push("");
      return lines.slice(0, MAX_PANEL_LINES);
    },
    handleMouse(event: TuiMouseEvent) {
      if (event.type !== "wheel") return undefined;
      const current = state();
      const { itemStart, visibleItems } = layout(current, event.width);
      if (event.y < itemStart || event.y >= itemStart + visibleItems) return undefined;
      const delta = event.wheelDelta ?? 0;
      if (delta === 0) return undefined;
      const items = getDisplayItems(current);
      const maxOffset = Math.max(items.length - visibleItems, defaultScrollOffset(current));
      const nextOffset = Math.max(0, Math.min(scroll.offset + delta, maxOffset));
      if (nextOffset === scroll.offset) return { handled: true, render: false };
      scroll.offset = nextOffset;
      return { handled: true, render: true };
    },
    invalidate() {},
  };
}

export default function navigatorExtension(pi: ExtensionAPI) {
  let state: NavigatorState | undefined;
  let requestRender: (() => void) | undefined;
  let lastPanelWidth = 80;
  const panelScroll = { offset: 0 };
  let mutationQueue = Promise.resolve();

  function installHeader(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") return;
    ctx.ui.setHeader((tui, theme) => {
      requestRender = () => tui.requestRender();
      const overlay = tui.showOverlay(renderDashboard(() => state, theme, panelScroll, (width) => {
        lastPanelWidth = width;
      }), {
        anchor: "top-left",
        row: 0,
        col: 0,
        width: "100%",
        maxHeight: MAX_PANEL_LINES,
        nonCapturing: true,
      });
      return {
        render: () => [],
        invalidate() {},
        dispose() {
          overlay.hide();
          requestRender = undefined;
        },
      };
    });
  }

  async function persist(next: NavigatorState): Promise<void> {
    state = { ...cloneState(next), updatedAt: Date.now() };
    panelScroll.offset = defaultScrollOffset(state);
    pi.appendEntry(ENTRY_TYPE, cloneState(state));
    requestRender?.();
  }

  function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  function success(message: string) {
    return {
      content: [{ type: "text" as const, text: message }],
      details: state ? cloneState(state) : undefined,
    };
  }

  pi.registerTool({
    name: "navigator_set_plan",
    label: "Set Navigator Plan",
    description: "Create the initial navigation plan for a session only. This tool refuses to overwrite an existing plan; use navigator_add_phase or navigator_add_task to append follow-up work. Include a concise overall goal that fits within two terminal rows, PR-sized phases, and Issue-sized tasks. Each phase/task may start as PLANNED; use update tools to report progress at every start, completion, or blocker.",
    parameters: SetPlanParams,
    async execute(_toolCallId, params) {
      return serializeMutation(async () => {
        if (state) {
          throw new Error("A navigator plan already exists for this session. Use navigator_add_phase or navigator_add_task to preserve its history.");
        }
        const input = params as typeof params & { phases: Array<{ id: string; title: string; status?: Status; reason?: string; tasks: Array<{ id: string; title: string; status?: Status; reason?: string }> }>; goal: string };
        const goal = input.goal.trim();
        if (!goal) throw new Error("Goal must not be empty.");
        if (wrapTextWithAnsi(goal, Math.max(1, lastPanelWidth - 1)).length > MAX_TITLE_LINES) {
          throw new Error(`Goal title is too long: it must fit within ${MAX_TITLE_LINES} terminal rows. Shorten the goal title and try again.`);
        }
        validateUniqueIds(input.phases);
        const next: NavigatorState = {
          goal,
          phases: input.phases.map((phase) => ({
            id: phase.id,
            title: phase.title,
            status: phase.status ?? "PLANNED",
            ...(phase.reason ? { reason: phase.reason } : {}),
            tasks: phase.tasks.map((task) => ({
              id: task.id,
              title: task.title,
              status: task.status ?? "PLANNED",
              ...(task.reason ? { reason: task.reason } : {}),
            })),
          })),
          updatedAt: Date.now(),
        };
        await persist(next);
        return success(`Navigator plan saved: ${next.goal} (${next.phases.length} phase(s)).`);
      });
    },
  });

  pi.registerTool({
    name: "navigator_add_phase",
    label: "Add Navigator Phase",
    description: "Append a new PR-sized phase to the current session plan without removing previous work. Use for a new task or follow-up work that deserves a separate phase. Phase and task IDs must be new and unique.",
    parameters: AddPhaseParams,
    async execute(_toolCallId, params) {
      return serializeMutation(async () => {
        if (!state) throw new Error("No navigator plan exists. Call navigator_set_plan first.");
        const input = params as { id: string; title: string; status?: Status; reason?: string; tasks: Array<{ id: string; title: string; status?: Status; reason?: string }> };
        if (state.phases.some((phase) => phase.id === input.id)) throw new Error(`Phase id already exists: ${input.id}`);
        const existingTaskIds = new Set(state.phases.flatMap((phase) => phase.tasks.map((task) => task.id)));
        for (const task of input.tasks) {
          if (existingTaskIds.has(task.id)) throw new Error(`Task id already exists: ${task.id}`);
          existingTaskIds.add(task.id);
        }
        const next = cloneState(state);
        next.phases.push({
          id: input.id,
          title: input.title,
          status: input.status ?? "PLANNED",
          ...(input.status === "BLOCK" && input.reason?.trim() ? { reason: input.reason.trim() } : {}),
          tasks: input.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status ?? "PLANNED",
            ...(task.status === "BLOCK" && task.reason?.trim() ? { reason: task.reason.trim() } : {}),
          })),
        });
        await persist(next);
        return success(`Phase ${input.id} appended (${next.phases.length} phase(s) total).`);
      });
    },
  });

  pi.registerTool({
    name: "navigator_add_task",
    label: "Add Navigator Task",
    description: "Append a new Issue-sized task to an existing phase without removing or resetting previous work. Task IDs must be unique across the session plan.",
    parameters: AddTaskParams,
    async execute(_toolCallId, params) {
      return serializeMutation(async () => {
        if (!state) throw new Error("No navigator plan exists. Call navigator_set_plan first.");
        const input = params as { phase_id: string; task_id: string; title: string; status?: Status; reason?: string };
        const phase = state.phases.find((candidate) => candidate.id === input.phase_id);
        if (!phase) throw new Error(`Phase not found: ${input.phase_id}`);
        if (state.phases.some((candidate) => candidate.tasks.some((task) => task.id === input.task_id))) {
          throw new Error(`Task id already exists: ${input.task_id}`);
        }
        const next = cloneState(state);
        next.phases.find((candidate) => candidate.id === input.phase_id)!.tasks.push({
          id: input.task_id,
          title: input.title,
          status: input.status ?? "PLANNED",
          ...(input.status === "BLOCK" && input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        });
        await persist(next);
        return success(`Task ${input.task_id} appended to phase ${input.phase_id}.`);
      });
    },
  });

  pi.registerTool({
    name: "navigator_update_phase",
    label: "Update Navigator Phase",
    description: "Update the status of one PR-sized phase. Use PLANNED, ADDRESS, FINISH, or BLOCK. Set reason when blocked. This does not change child task statuses.",
    parameters: UpdatePhaseParams,
    async execute(_toolCallId, params) {
      return serializeMutation(async () => {
        if (!state) throw new Error("No navigator plan exists. Call navigator_set_plan first.");
        const input = params as { phase_id: string; status: Status; reason?: string };
        const phase = state.phases.find((candidate) => candidate.id === input.phase_id);
        if (!phase) throw new Error(`Phase not found: ${input.phase_id}`);
        const next = cloneState(state);
        const target = next.phases.find((candidate) => candidate.id === input.phase_id)!;
        target.status = input.status;
        target.reason = input.status === "BLOCK" ? input.reason?.trim() || undefined : undefined;
        await persist(next);
        return success(`Phase ${target.id} updated to ${target.status}.`);
      });
    },
  });

  pi.registerTool({
    name: "navigator_update_task",
    label: "Update Navigator Task",
    description: "Update the status of one Issue-sized task within a phase. Use PLANNED, ADDRESS, FINISH, or BLOCK. Set reason when blocked. This does not change the parent phase status.",
    parameters: UpdateTaskParams,
    async execute(_toolCallId, params) {
      return serializeMutation(async () => {
        if (!state) throw new Error("No navigator plan exists. Call navigator_set_plan first.");
        const input = params as { phase_id: string; task_id: string; status: Status; reason?: string };
        const phase = state.phases.find((candidate) => candidate.id === input.phase_id);
        if (!phase) throw new Error(`Phase not found: ${input.phase_id}`);
        const task = phase.tasks.find((candidate) => candidate.id === input.task_id);
        if (!task) throw new Error(`Task ${input.task_id} not found in phase ${input.phase_id}.`);
        const next = cloneState(state);
        const target = next.phases.find((candidate) => candidate.id === input.phase_id)!
          .tasks.find((candidate) => candidate.id === input.task_id)!;
        target.status = input.status;
        target.reason = input.status === "BLOCK" ? input.reason?.trim() || undefined : undefined;
        await persist(next);
        return success(`Task ${target.id} updated to ${target.status}.`);
      });
    },
  });

  pi.on("session_start", (_event, ctx) => {
    state = restoreState(ctx);
    panelScroll.offset = defaultScrollOffset(state);
    installHeader(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    state = restoreState(ctx);
    panelScroll.offset = defaultScrollOffset(state);
    installHeader(ctx);
    requestRender?.();
  });

  pi.on("before_agent_start", () => {
    const planText = state
      ? [
          `Goal: ${state.goal}`,
          ...state.phases.flatMap((phase) => [
            `Phase ${phase.id} [${phase.status}]: ${phase.title}${phase.reason ? ` — ${phase.reason}` : ""}`,
            ...phase.tasks.map((task) => `  Task ${task.id} [${task.status}]: ${task.title}${task.reason ? ` — ${task.reason}` : ""}`),
          ]),
        ].join("\n")
      : "No plan has been registered yet.";
    return {
      message: {
        customType: "pi-navigator-context",
        content: `[NAVIGATOR PROGRESS]\n${planText}\n\nKeep the goal title concise enough to fit within two terminal rows. This is the cumulative work history for the current session. Never replace an existing plan: navigator_set_plan is only for the first plan in a session and rejects calls when a plan already exists. Add follow-up work with navigator_add_task, or a new workstream with navigator_add_phase. Keep completed work in place. Use navigator_update_phase and navigator_update_task to report status changes. Do not mark work complete unless it is actually complete.`,
        display: false,
      },
    };
  });
}

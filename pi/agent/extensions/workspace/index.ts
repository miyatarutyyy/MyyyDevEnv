import { execFile } from "node:child_process";
import { access, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  detectWorkspaceConfigForCwd,
  readWorkspaceConfigForProject,
  setWorkspacePromptSection,
} from "./workspace-config.mjs";

const execFileAsync = promisify(execFile);

const AGENT_INSTRUCTIONS = `# Workspace instructions

This directory contains the primary checkout and any sibling Git worktrees for this project.

- Treat each checkout as an independent working directory; do not assume another checkout has the same branch or uncommitted changes.
- Do not move, delete, or create Git worktrees unless the user explicitly requests that operation.
- Read workspace.toml to understand the declared layout. The Git worktree list remains authoritative for which worktrees currently exist.
`;

function tomlString(value: string): string {
  return JSON.stringify(value);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function currentWorkspaceConfig(cwd: string) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
  return readWorkspaceConfigForProject(stdout.trim());
}

async function discoverWorkspaceConfig(cwd: string) {
  return detectWorkspaceConfigForCwd(cwd, async (workingDirectory: string) => {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: workingDirectory });
    return stdout.trim();
  });
}

async function initializeWorkspace(cwd: string, ctx: ExtensionCommandContext) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
  const projectRoot = await realpath(stdout.trim());
  const workspaceRoot = path.dirname(projectRoot);
  if (workspaceRoot === os.homedir() || workspaceRoot === path.parse(workspaceRoot).root) {
    throw new Error(
      `The checkout's parent (${workspaceRoot}) is too broad to use as a personal workspace. ` +
        "Move the checkout under a dedicated workspace directory before initializing it.",
    );
  }
  const projectName = path.basename(projectRoot);
  const manifestPath = path.join(workspaceRoot, "workspace.toml");
  const instructionsPath = path.join(workspaceRoot, "AGENTS.md");

  const existing = [
    ...(await exists(manifestPath) ? [manifestPath] : []),
    ...(await exists(instructionsPath) ? [instructionsPath] : []),
  ];
  if (existing.length > 0) {
    throw new Error(`Refusing to overwrite existing file(s): ${existing.join(", ")}`);
  }

  const manifest = [
    `schema_version = 1`,
    `name = ${tomlString(path.basename(workspaceRoot))}`,
    `project_root = ${tomlString(projectName)}`,
    `worktrees_dir = "."`,
    `worktree_name_template = "{project}-{branch_slug}"`,
    "",
  ].join("\n");

  const preview = [
    `Workspace: ${workspaceRoot}`,
    `Project checkout: ${projectRoot}`,
    `Create: ${manifestPath}`,
    `Create: ${instructionsPath}`,
    "",
    "No Git worktree will be created, moved, or deleted.",
  ].join("\n");
  if (!ctx.hasUI || !(await ctx.ui.confirm("Initialize this workspace?", preview))) {
    return "cancelled" as const;
  }

  let manifestCreated = false;
  try {
    await writeFile(manifestPath, manifest, { encoding: "utf8", flag: "wx" });
    manifestCreated = true;
    await writeFile(instructionsPath, AGENT_INSTRUCTIONS, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (manifestCreated) await rm(manifestPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return { workspaceRoot, manifestPath, instructionsPath } as const;
}

export default function (pi: ExtensionAPI) {
  let workspaceConfig: Awaited<ReturnType<typeof detectWorkspaceConfigForCwd>>;

  pi.on("session_start", async (_event, ctx) => {
    workspaceConfig = await discoverWorkspaceConfig(ctx.cwd);
  });

  pi.on("before_agent_start", (event) => {
    setWorkspacePromptSection(event.systemPromptOptions.sections, workspaceConfig);
  });

  pi.registerCommand("workspace", {
    description: "Initialize or inspect a personal repository workspace",
    handler: async (args, ctx) => {
      const action = args.trim();
      if (action === "init") {
        try {
          const result = await initializeWorkspace(ctx.cwd, ctx);
          if (result === "cancelled") {
            ctx.ui.notify("Workspace initialization cancelled; no files were created.", "info");
            return;
          }
          ctx.ui.notify(
            `Workspace initialized.\nManifest: ${result.manifestPath}\nInstructions: ${result.instructionsPath}`,
            "info",
          );
        } catch (error) {
          ctx.ui.notify(`Workspace initialization failed: ${String(error)}`, "error");
        }
        return;
      }

      if (action === "validate") {
        try {
          const workspace = await currentWorkspaceConfig(ctx.cwd);
          ctx.ui.notify(
            [
              "Workspace manifest is valid.",
              `Workspace: ${workspace.workspaceRoot}`,
              `Project checkout: ${workspace.projectRoot}`,
              `Worktrees directory: ${workspace.worktreesRoot}`,
            ].join("\n"),
            "info",
          );
        } catch (error) {
          ctx.ui.notify(`Workspace configuration is invalid: ${String(error)}`, "error");
        }
        return;
      }

      if (!action || action === "help") {
        ctx.ui.notify(
          [
            "Workspace helper is loaded.",
            "",
            "Available command:",
            "  /workspace init      Preview and create workspace.toml and AGENTS.md",
            "  /workspace validate Read and validate the current workspace.toml",
            "",
            "Startup detection and agent context injection run automatically when this checkout has a valid workspace.toml.",
            "/workspace status is not implemented yet.",
          ].join("\n"),
          "info",
        );
        return;
      }

      ctx.ui.notify(`Unknown workspace action: ${action}. Try /workspace help.`, "warning");
    },
  });
}

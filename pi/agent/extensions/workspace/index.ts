import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  detectWorkspaceConfigForCwd,
  parseWorkspaceConfig,
  readWorkspaceConfig,
  readWorkspaceConfigForProject,
  setWorkspacePromptSection,
} from "./workspace-config.mjs";

const execFileAsync = promisify(execFile);
const WORKTREE_NAME_TEMPLATE = "{project}-{branch_slug}";
type Worktree = { path: string; branch: string | null };

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

function manifestString(source: string, key: string): string | undefined {
  const match = source.match(new RegExp(`^${key}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*(?:#.*)?$`, "m"));
  if (!match) return undefined;
  try { return JSON.parse(match[1]) as string; } catch { return undefined; }
}

function parseWorktrees(source: string): Worktree[] {
  const result: Worktree[] = [];
  let entry: { path?: string; branch?: string | null; prunable?: boolean } = {};
  const flush = () => {
    if (entry.path && !entry.prunable) result.push({ path: entry.path, branch: entry.branch ?? null });
    entry = {};
  };
  for (const line of source.split(/\r?\n/)) {
    if (!line) flush();
    else if (line.startsWith("worktree ")) entry.path = line.slice(9);
    else if (line.startsWith("branch ")) {
      const ref = line.slice(7);
      entry.branch = ref.startsWith("refs/heads/") ? ref.slice(11) : ref;
    } else if (line.startsWith("prunable ")) entry.prunable = true;
  }
  flush();
  return result;
}

async function input(ctx: ExtensionCommandContext, title: string, current: string, hint: string): Promise<string | undefined> {
  const value = await ctx.ui.input(title, current ? `Current: ${current}. Press Enter to keep it.` : hint);
  return value === undefined ? undefined : value.trim() || current;
}

async function currentWorkspaceConfig(cwd: string) {
  try {
    return await readWorkspaceConfigForProject(await git(cwd, "rev-parse", "--show-toplevel"));
  } catch {
    return readWorkspaceConfig(path.join(cwd, "workspace.toml"));
  }
}

async function discoverWorkspaceConfig(cwd: string) {
  const checkout = await detectWorkspaceConfigForCwd(cwd, (directory) => git(directory, "rev-parse", "--show-toplevel"));
  if (checkout) return checkout;
  try { return await readWorkspaceConfig(path.join(cwd, "workspace.toml")); } catch { return undefined; }
}

async function initializeWorkspace(cwd: string, ctx: ExtensionCommandContext) {
  if (!ctx.hasUI) throw new Error("Workspace initialization needs an interactive UI.");
  const projectRoot = await git(cwd, "rev-parse", "--show-toplevel").then((root) => realpath(root)).catch(() => undefined);
  const workspaceRoot = projectRoot ? path.dirname(projectRoot) : await realpath(cwd);
  if (workspaceRoot === os.homedir() || workspaceRoot === path.parse(workspaceRoot).root) {
    throw new Error(`Refusing to use ${workspaceRoot} as a workspace root.`);
  }

  const manifestPath = path.join(workspaceRoot, "workspace.toml");
  let existing = "";
  try { existing = await readFile(manifestPath, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (existing && !(await ctx.ui.confirm("Review existing workspace.toml", `${existing}\nYes continues to the proposed replacement; No cancels.`))) return;

  const projectName = await input(
    ctx,
    "Git project root (relative to the workspace)",
    manifestString(existing, "project_root") ?? (projectRoot ? path.relative(workspaceRoot, projectRoot) : ""),
    "For example: environment-master",
  );
  if (projectName === undefined) return;
  if (!projectName || path.isAbsolute(projectName) || projectName.split(/[\\/]/).includes("..")) {
    throw new Error("project_root must be a relative path inside the workspace.");
  }
  const repository = await realpath(path.resolve(workspaceRoot, projectName));
  if (await realpath(await git(repository, "rev-parse", "--show-toplevel")) !== repository) {
    throw new Error("project_root must name a Git checkout root.");
  }

  const worktrees = parseWorktrees(await git(repository, "worktree", "list", "--porcelain"));
  const remoteBranch = await git(repository, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD")
    .then((ref) => ref.replace(/^origin\//, "")).catch(() => "");
  let branch = await input(ctx, "Default branch name", manifestString(existing, "default_branch") ?? remoteBranch, "Enter the branch name.");
  if (!branch) return;
  let defaultWorktree = worktrees.find((item) => item.branch === branch);
  if (!defaultWorktree) {
    const choice = await ctx.ui.select(
      `No registered, non-prunable worktree is on "${branch}". Choose an action.`,
      ["Enter a different branch", "Cancel; do not write workspace.toml"],
    );
    if (choice !== "Enter a different branch") return;
    branch = await input(ctx, "Default branch name", branch, "Enter the branch name.");
    if (!branch) return;
    defaultWorktree = worktrees.find((item) => item.branch === branch);
    if (!defaultWorktree) {
      ctx.ui.notify(`No registered worktree is on "${branch}". No file was written.`, "warning");
      return;
    }
  }

  const values = {
    name: manifestString(existing, "name") ?? path.basename(workspaceRoot),
    project_root: path.relative(workspaceRoot, repository) || ".",
    default_branch: branch,
    default_branch_worktree: path.relative(workspaceRoot, defaultWorktree.path) || ".",
    worktrees_dir: manifestString(existing, "worktrees_dir") ?? ".",
  };
  const proposed = [
    "schema_version = 2",
    ...Object.entries(values).map(([key, value]) => `${key} = ${JSON.stringify(value)}`),
    `worktree_name_template = ${JSON.stringify(WORKTREE_NAME_TEMPLATE)}`,
    "",
  ].join("\n");
  const config = parseWorkspaceConfig(proposed);
  const title = existing ? "Replace workspace.toml?" : "Create workspace.toml?";
  if (!(await ctx.ui.confirm(title, `${proposed}\nAGENTS.md and Git worktrees will not be changed.`))) return;

  const temporaryPath = path.join(workspaceRoot, `.workspace.toml.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, proposed, { encoding: "utf8", flag: "wx" });
    await readWorkspaceConfig(temporaryPath);
    await rename(temporaryPath, manifestPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return { manifestPath, config };
}

async function runInit(ctx: ExtensionCommandContext) {
  try {
    const result = await initializeWorkspace(ctx.cwd, ctx);
    ctx.ui.notify(result
      ? `Saved ${result.manifestPath}. Default branch: ${result.config.default_branch}. AGENTS.md was not changed.`
      : "Cancelled; workspace.toml was not written.", "info");
  } catch (error) { ctx.ui.notify(`Workspace initialization failed: ${String(error)}`, "error"); }
}

export default function (pi: ExtensionAPI) {
  let workspaceConfig: Awaited<ReturnType<typeof discoverWorkspaceConfig>>;
  pi.on("session_start", async (_event, ctx) => { workspaceConfig = await discoverWorkspaceConfig(ctx.cwd); });
  pi.on("before_agent_start", (event) => setWorkspacePromptSection(event.systemPromptOptions.sections, workspaceConfig));

  pi.registerCommand("workspace-init", { description: "Create or update workspace.toml", handler: async (_args, ctx) => runInit(ctx) });
  pi.registerCommand("workspace", {
    description: "Initialize or inspect a personal repository workspace",
    handler: async (args, ctx) => {
      const action = args.trim();
      if (action === "init") { await runInit(ctx); return; }
      if (action === "validate") {
        try {
          const workspace = await currentWorkspaceConfig(ctx.cwd);
          ctx.ui.notify([
            "Workspace manifest is valid.",
            `Workspace: ${workspace.workspaceRoot}`,
            `Project checkout: ${workspace.projectRoot}`,
            `Default branch: ${workspace.config.default_branch}`,
            `Default-branch worktree: ${workspace.defaultBranchWorktree}`,
            `Worktrees directory: ${workspace.worktreesRoot}`,
          ].join("\n"), "info");
        } catch (error) { ctx.ui.notify(`Workspace configuration is invalid: ${String(error)}`, "error"); }
        return;
      }
      ctx.ui.notify("Commands: /workspace-init, /workspace init, /workspace validate", "info");
    },
  });
}

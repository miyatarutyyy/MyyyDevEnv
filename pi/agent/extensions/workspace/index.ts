import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
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
const MANIFEST_NAME = "workspace.toml";
const SCHEMA_VERSION = 2;
const WORKTREE_NAME_TEMPLATE = "{project}-{branch_slug}";

type Worktree = { path: string; branch: string | null };

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function existingString(source: string, key: string): string | undefined {
  const match = source.match(new RegExp(`^${key}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*(?:#.*)?$`, "m"));
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return undefined;
  }
}

function parseWorktrees(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  let current: { path?: string; branch?: string | null; prunable?: boolean } = {};
  const finish = () => {
    if (current.path && !current.prunable) {
      worktrees.push({ path: current.path, branch: current.branch ?? null });
    }
    current = {};
  };

  for (const line of output.split(/\r?\n/)) {
    if (!line) {
      finish();
    } else if (line.startsWith("worktree ")) {
      current.path = line.slice("worktree ".length);
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      current.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    } else if (line.startsWith("prunable ")) {
      current.prunable = true;
    }
  }
  finish();
  return worktrees;
}

async function gitOutput(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

async function inputValue(
  ctx: ExtensionCommandContext,
  label: string,
  current: string,
  example = "",
): Promise<string | undefined> {
  const hint = current
    ? `Current value: ${current}. Press Enter to keep it.`
    : example || "Enter a value, or press Escape to cancel.";
  const answer = await ctx.ui.input(label, hint);
  if (answer === undefined) return undefined;
  return answer.trim() || current;
}

function manifestText(values: {
  name: string;
  projectRoot: string;
  defaultBranch: string;
  defaultBranchWorktree: string;
  worktreesDir: string;
}): string {
  return [
    `schema_version = ${SCHEMA_VERSION}`,
    `name = ${tomlString(values.name)}`,
    `project_root = ${tomlString(values.projectRoot)}`,
    `default_branch = ${tomlString(values.defaultBranch)}`,
    `default_branch_worktree = ${tomlString(values.defaultBranchWorktree)}`,
    `worktrees_dir = ${tomlString(values.worktreesDir)}`,
    `worktree_name_template = ${tomlString(WORKTREE_NAME_TEMPLATE)}`,
    "",
  ].join("\n");
}

async function locateWorkspace(cwd: string): Promise<{ workspaceRoot: string; detectedProjectRoot?: string }> {
  try {
    const projectRoot = await realpath(await gitOutput(cwd, "rev-parse", "--show-toplevel"));
    return { workspaceRoot: path.dirname(projectRoot), detectedProjectRoot: projectRoot };
  } catch {
    return { workspaceRoot: await realpath(cwd) };
  }
}

async function discoverWorkspaceConfig(cwd: string) {
  const forCheckout = await detectWorkspaceConfigForCwd(cwd, async (workingDirectory: string) => {
    return gitOutput(workingDirectory, "rev-parse", "--show-toplevel");
  });
  if (forCheckout) return forCheckout;

  try {
    return await readWorkspaceConfig(path.join(cwd, MANIFEST_NAME));
  } catch {
    return undefined;
  }
}

async function currentWorkspaceConfig(cwd: string) {
  let projectRoot: string;
  try {
    projectRoot = await realpath(await gitOutput(cwd, "rev-parse", "--show-toplevel"));
  } catch {
    return readWorkspaceConfig(path.join(cwd, MANIFEST_NAME));
  }
  return readWorkspaceConfigForProject(projectRoot);
}

async function initializeWorkspace(cwd: string, ctx: ExtensionCommandContext) {
  if (!ctx.hasUI) throw new Error("Workspace initialization needs an interactive UI.");

  const { workspaceRoot, detectedProjectRoot } = await locateWorkspace(cwd);
  const manifestPath = path.join(workspaceRoot, MANIFEST_NAME);
  let existing = "";
  try {
    existing = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (existing) {
    const proceed = await ctx.ui.confirm(
      "Review existing workspace.toml",
      `${existing}\nThis command can replace only workspace.toml. It will not create or edit AGENTS.md. Continue?`,
    );
    if (!proceed) return undefined;
  }

  const currentProjectRoot = existingString(existing, "project_root")
    ?? (detectedProjectRoot ? path.relative(workspaceRoot, detectedProjectRoot) : "");
  const projectRootInput = await inputValue(
    ctx,
    "Git project root (relative to the workspace directory)",
    currentProjectRoot,
    "For example: environment-master",
  );
  if (projectRootInput === undefined || !projectRootInput) return undefined;
  if (path.isAbsolute(projectRootInput) || projectRootInput.split(/[\\/]/).includes("..")) {
    throw new Error("project_root must be a relative path inside the workspace directory.");
  }
  const projectRoot = await realpath(path.resolve(workspaceRoot, projectRootInput));
  const detectedGitRoot = await realpath(await gitOutput(projectRoot, "rev-parse", "--show-toplevel"));
  if (detectedGitRoot !== projectRoot) {
    throw new Error(`project_root must name a Git checkout root, not a subdirectory: ${detectedGitRoot}`);
  }

  const worktrees = parseWorktrees(await gitOutput(projectRoot, "worktree", "list", "--porcelain"));
  const detectedDefaultBranch = await gitOutput(projectRoot, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD")
    .then((ref) => ref.replace(/^origin\//, ""))
    .catch(() => "");
  const defaultBranchInput = await inputValue(
    ctx,
    "Default branch name",
    existingString(existing, "default_branch") ?? detectedDefaultBranch,
  );
  if (defaultBranchInput === undefined || !defaultBranchInput) return undefined;
  let defaultBranch = defaultBranchInput;
  let matchingWorktrees = worktrees.filter((worktree) => worktree.branch === defaultBranch);

  if (matchingWorktrees.length === 0) {
    const action = await ctx.ui.select(
      `No usable registered worktree was found for default branch "${defaultBranch}". Choose what to do.`,
      ["Enter a different default branch", "Cancel; do not write workspace.toml"],
    );
    if (action !== "Enter a different default branch") return undefined;
    const replacement = await inputValue(ctx, "Enter the correct default branch name", defaultBranch);
    if (replacement === undefined || !replacement) return undefined;
    defaultBranch = replacement;
    matchingWorktrees = worktrees.filter((worktree) => worktree.branch === defaultBranch);
    if (matchingWorktrees.length === 0) {
      ctx.ui.notify(`No registered, non-prunable worktree is on "${defaultBranch}". No file was written.`, "warning");
      return undefined;
    }
  }

  let defaultBranchWorktree: Worktree | undefined;
  if (matchingWorktrees.length === 1) {
    defaultBranchWorktree = matchingWorktrees[0];
  } else {
    const paths = matchingWorktrees.map((worktree) => path.relative(workspaceRoot, worktree.path) || ".");
    const selected = await ctx.ui.select(
      `Choose the registered worktree on default branch "${defaultBranch}"`,
      paths,
    );
    if (!selected) return undefined;
    defaultBranchWorktree = matchingWorktrees.find((worktree) => (path.relative(workspaceRoot, worktree.path) || ".") === selected);
  }
  if (!defaultBranchWorktree) return undefined;

  const relativeProjectRoot = path.relative(workspaceRoot, projectRoot);
  const relativeDefaultWorktree = path.relative(workspaceRoot, defaultBranchWorktree.path);
  if ([relativeProjectRoot, relativeDefaultWorktree].some((value) => value === ".." || value.startsWith(`..${path.sep}`) || path.isAbsolute(value))) {
    throw new Error("The Git checkout and default-branch worktree must be inside the workspace directory.");
  }

  const name = await inputValue(ctx, "Workspace name", existingString(existing, "name") ?? path.basename(workspaceRoot));
  if (name === undefined || !name) return undefined;
  const worktreesDir = await inputValue(ctx, "Directory containing worktrees", existingString(existing, "worktrees_dir") ?? ".");
  if (worktreesDir === undefined || !worktreesDir) return undefined;

  const values = {
    name,
    projectRoot: relativeProjectRoot || ".",
    defaultBranch,
    defaultBranchWorktree: relativeDefaultWorktree || ".",
    worktreesDir,
  };
  const proposed = manifestText(values);
  const parsed = parseWorkspaceConfig(proposed);
  const confirmed = await ctx.ui.confirm(
    existing ? "Replace workspace.toml with this version?" : "Create workspace.toml with this version?",
    `${proposed}\nAGENTS.md will not be changed. No Git worktrees will be created, moved, or deleted.`,
  );
  if (!confirmed) return undefined;

  const temporaryPath = path.join(workspaceRoot, `.${MANIFEST_NAME}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, proposed, { encoding: "utf8", flag: "wx" });
    await readWorkspaceConfig(temporaryPath);
    await rename(temporaryPath, manifestPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return { workspaceRoot, manifestPath, config: parsed } as const;
}

async function validateWorkspace(cwd: string) {
  return currentWorkspaceConfig(cwd);
}

async function runInit(_args: string, ctx: ExtensionCommandContext) {
  try {
    const result = await initializeWorkspace(ctx.cwd, ctx);
    if (!result) {
      ctx.ui.notify("Workspace initialization cancelled; workspace.toml was not written.", "info");
      return;
    }
    ctx.ui.notify(
      `Workspace configuration saved.\nManifest: ${result.manifestPath}\nDefault branch: ${result.config.default_branch}\nDefault-branch worktree: ${result.config.default_branch_worktree}\nAGENTS.md was not changed.`,
      "info",
    );
  } catch (error) {
    ctx.ui.notify(`Workspace initialization failed: ${String(error)}`, "error");
  }
}

export default function (pi: ExtensionAPI) {
  let workspaceConfig: Awaited<ReturnType<typeof discoverWorkspaceConfig>>;

  pi.on("session_start", async (_event, ctx) => {
    workspaceConfig = await discoverWorkspaceConfig(ctx.cwd);
  });

  pi.on("before_agent_start", (event) => {
    setWorkspacePromptSection(event.systemPromptOptions.sections, workspaceConfig);
  });

  pi.registerCommand("workspace-init", {
    description: "Create or update only workspace.toml after reviewing its proposed contents",
    handler: runInit,
  });

  pi.registerCommand("workspace", {
    description: "Validate workspace.toml or show workspace helper usage",
    handler: async (args, ctx) => {
      const action = args.trim();
      if (action === "init") {
        await runInit(args, ctx);
        return;
      }
      if (action === "validate") {
        try {
          const workspace = await validateWorkspace(ctx.cwd);
          ctx.ui.notify(
            [
              "Workspace manifest is valid.",
              `Workspace: ${workspace.workspaceRoot}`,
              `Project checkout: ${workspace.projectRoot}`,
              `Default branch: ${workspace.config.default_branch}`,
              `Default-branch worktree: ${workspace.defaultBranchWorktree}`,
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
            "Available commands:",
            "  /workspace-init     Create or update only workspace.toml",
            "  /workspace init     Alias for /workspace-init",
            "  /workspace validate Validate workspace.toml",
            "",
            "The initializer never creates or edits AGENTS.md and never changes Git worktrees.",
          ].join("\n"),
          "info",
        );
        return;
      }
      ctx.ui.notify(`Unknown workspace action: ${action}. Try /workspace help.`, "warning");
    },
  });
}

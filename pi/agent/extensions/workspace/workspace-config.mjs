import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const WORKSPACE_SCHEMA_VERSION = 2;

const REQUIRED_KEYS = [
  "schema_version",
  "name",
  "project_root",
  "default_branch",
  "default_branch_worktree",
  "worktrees_dir",
  "worktree_name_template",
];
const ALLOWED_KEYS = new Set(REQUIRED_KEYS);
const WORKTREE_NAME_TEMPLATE = "{project}-{branch_slug}";

function stripComment(line, lineNumber) {
  let inString = false;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "#") {
      return line.slice(0, i);
    }
  }

  if (inString) throw new Error(`workspace.toml:${lineNumber}: unterminated string`);
  return line;
}

function parseValue(source, key, lineNumber) {
  const value = source.trim();
  if (key === "schema_version") {
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
      throw new Error(`workspace.toml:${lineNumber}: schema_version must be an integer`);
    }
    return Number(value);
  }

  if (!value.startsWith('"')) {
    throw new Error(`workspace.toml:${lineNumber}: ${key} must be a double-quoted string`);
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`workspace.toml:${lineNumber}: invalid quoted string for ${key}`);
  }
  if (typeof parsed !== "string") {
    throw new Error(`workspace.toml:${lineNumber}: ${key} must be a string`);
  }
  return parsed;
}

function assertRelativePath(value, key, { allowDot = false } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || path.isAbsolute(value)) {
    throw new Error(`${key} must be a non-empty relative path using '/' separators`);
  }
  if (allowDot && value === ".") return;

  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${key} must not contain empty, '.', or '..' path segments`);
  }
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

export function validateWorkspaceConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("workspace.toml must contain a flat set of key/value assignments");
  }

  for (const key of Object.keys(config)) {
    if (!ALLOWED_KEYS.has(key)) throw new Error(`Unknown workspace.toml key: ${key}`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in config)) throw new Error(`Missing required workspace.toml key: ${key}`);
  }

  if (config.schema_version !== WORKSPACE_SCHEMA_VERSION) {
    throw new Error(`Unsupported workspace.toml schema_version: ${config.schema_version}`);
  }
  for (const key of ["name", "project_root", "default_branch", "default_branch_worktree", "worktrees_dir", "worktree_name_template"]) {
    if (typeof config[key] !== "string" || config[key].trim() === "") {
      throw new Error(`${key} must be a non-empty string`);
    }
  }

  assertRelativePath(config.project_root, "project_root");
  assertRelativePath(config.default_branch_worktree, "default_branch_worktree", { allowDot: true });
  assertRelativePath(config.worktrees_dir, "worktrees_dir", { allowDot: true });
  if (config.worktree_name_template !== WORKTREE_NAME_TEMPLATE) {
    throw new Error(`worktree_name_template must be ${JSON.stringify(WORKTREE_NAME_TEMPLATE)}`);
  }

  return Object.freeze({
    schema_version: config.schema_version,
    name: config.name,
    project_root: config.project_root,
    default_branch: config.default_branch,
    default_branch_worktree: config.default_branch_worktree,
    worktrees_dir: config.worktrees_dir,
    worktree_name_template: config.worktree_name_template,
  });
}

export function parseWorkspaceConfig(source) {
  if (typeof source !== "string") throw new Error("workspace.toml contents must be text");
  const values = Object.create(null);

  for (const [index, originalLine] of source.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = stripComment(originalLine, lineNumber).trim();
    if (!line) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) throw new Error(`workspace.toml:${lineNumber}: expected a top-level key = value assignment`);
    const [, key, valueSource] = match;
    if (Object.hasOwn(values, key)) throw new Error(`workspace.toml:${lineNumber}: duplicate key ${key}`);
    values[key] = parseValue(valueSource, key, lineNumber);
  }

  return validateWorkspaceConfig(values);
}

export function resolveWorkspacePaths(manifestPath, config) {
  if (!path.isAbsolute(manifestPath)) throw new Error("workspace.toml path must be absolute");
  const validated = validateWorkspaceConfig(config);
  const workspaceRoot = path.resolve(path.dirname(manifestPath));
  const projectRoot = path.resolve(workspaceRoot, validated.project_root);
  const defaultBranchWorktree = path.resolve(workspaceRoot, validated.default_branch_worktree);
  const worktreesRoot = path.resolve(workspaceRoot, validated.worktrees_dir);

  for (const [key, target] of [
    ["project_root", projectRoot],
    ["default_branch_worktree", defaultBranchWorktree],
    ["worktrees_dir", worktreesRoot],
  ]) {
    if (!isInside(workspaceRoot, target)) throw new Error(`${key} resolves outside the workspace`);
  }
  return Object.freeze({ workspaceRoot, projectRoot, defaultBranchWorktree, worktreesRoot });
}

export async function readWorkspaceConfigForProject(projectRoot) {
  const absoluteProjectRoot = await realpath(projectRoot);
  const manifestPath = path.join(path.dirname(absoluteProjectRoot), "workspace.toml");
  const workspace = await readWorkspaceConfig(manifestPath);
  if (workspace.projectRoot !== absoluteProjectRoot) {
    throw new Error(
      `workspace.toml declares ${workspace.projectRoot} as project_root, but the current Git checkout is ${absoluteProjectRoot}`,
    );
  }
  return workspace;
}

export async function detectWorkspaceConfig(projectRoot) {
  try {
    return await readWorkspaceConfigForProject(projectRoot);
  } catch {
    return undefined;
  }
}

export async function detectWorkspaceConfigForCwd(cwd, getProjectRoot) {
  try {
    const projectRoot = await getProjectRoot(cwd);
    return await detectWorkspaceConfig(projectRoot);
  } catch {
    return undefined;
  }
}

export function formatWorkspaceContext(workspace) {
  const escapeXml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
  return [
    "This checkout belongs to a personal workspace. Treat each checkout as independent.",
    `Workspace: ${escapeXml(workspace.workspaceRoot)}`,
    `Project checkout: ${escapeXml(workspace.projectRoot)}`,
    `Default branch: ${escapeXml(workspace.config.default_branch)}`,
    `Default-branch worktree: ${escapeXml(workspace.defaultBranchWorktree)}`,
    `Worktrees directory: ${escapeXml(workspace.worktreesRoot)}`,
    `Workspace manifest: ${escapeXml(workspace.manifestPath)}`,
    "Read workspace.toml before selecting a working directory. Use `git worktree list` as the authority for existing checkouts and ignore entries marked `prunable`.",
    "For a product task, choose the registered, non-prunable checkout that matches the request. If none is suitable, ask the user; do not create a worktree automatically or silently switch to another checkout.",
  ].join("\n");
}

export function setWorkspacePromptSection(sections, workspace) {
  if (workspace) sections.workspace = formatWorkspaceContext(workspace);
  else delete sections.workspace;
}

export async function readWorkspaceConfig(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const source = await readFile(absoluteManifestPath, "utf8");
  const config = parseWorkspaceConfig(source);
  const paths = resolveWorkspacePaths(absoluteManifestPath, config);
  const workspaceRoot = await realpath(paths.workspaceRoot);
  const projectRoot = await realpath(paths.projectRoot);
  const defaultBranchWorktree = await realpath(paths.defaultBranchWorktree);
  const worktreesRoot = await realpath(paths.worktreesRoot);

  for (const [label, directory] of [
    ["project_root", projectRoot],
    ["default_branch_worktree", defaultBranchWorktree],
    ["worktrees_dir", worktreesRoot],
  ]) {
    if (!isInside(workspaceRoot, directory)) {
      throw new Error(`${label} resolves outside the workspace through a symlink`);
    }
    if (!(await stat(directory)).isDirectory()) throw new Error(`${label} must resolve to a directory`);
  }

  return Object.freeze({
    manifestPath: absoluteManifestPath,
    config,
    workspaceRoot,
    projectRoot,
    defaultBranchWorktree,
    worktreesRoot,
  });
}

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  detectWorkspaceConfig,
  detectWorkspaceConfigForCwd,
  formatWorkspaceContext,
  parseWorkspaceConfig,
  readWorkspaceConfig,
  resolveWorkspacePaths,
  setWorkspacePromptSection,
  validateWorkspaceConfig,
} from "./workspace-config.mjs";

const validManifest = `schema_version = 1
name = "MyyyDevEnv"
project_root = "environment"
worktrees_dir = "."
worktree_name_template = "{project}-{branch_slug}"
`;

function validConfig(overrides = {}) {
  return {
    schema_version: 1,
    name: "MyyyDevEnv",
    project_root: "environment",
    worktrees_dir: ".",
    worktree_name_template: "{project}-{branch_slug}",
    ...overrides,
  };
}

test("parses the workspace manifest format", () => {
  assert.deepEqual(parseWorkspaceConfig(validManifest), validConfig());
});

test("accepts blank lines, comments, whitespace, and # inside strings", () => {
  const source = `# workspace settings
schema_version=1
name = "My # Dev Env" # trailing comment
project_root = "repo"
worktrees_dir = "."
worktree_name_template = "{project}-{branch_slug}"
`;
  assert.equal(parseWorkspaceConfig(source).name, "My # Dev Env");
});

test("rejects malformed assignments, duplicate keys, and unsupported keys", () => {
  assert.throws(() => parseWorkspaceConfig(`${validManifest}\n[workspace]\n`), /top-level key/);
  assert.throws(() => parseWorkspaceConfig(`${validManifest}name = "again"\n`), /duplicate key name/);
  assert.throws(() => parseWorkspaceConfig(`${validManifest}unexpected = "value"\n`), /Unknown workspace.toml key/);
  assert.throws(() => parseWorkspaceConfig(`schema_version = 1\nname = "unterminated\n`), /unterminated string/);
});

test("rejects missing and unsupported schema versions", () => {
  const { name: _name, ...missingName } = validConfig();
  assert.throws(() => validateWorkspaceConfig(missingName), /Missing required/);
  assert.throws(() => validateWorkspaceConfig(validConfig({ schema_version: 2 })), /Unsupported.*schema_version/);
});

test("rejects unsafe or unsupported paths and naming templates", () => {
  assert.throws(() => validateWorkspaceConfig(validConfig({ project_root: "../outside" })), /project_root/);
  assert.throws(() => validateWorkspaceConfig(validConfig({ project_root: "/tmp/repo" })), /project_root/);
  assert.throws(() => validateWorkspaceConfig(validConfig({ worktrees_dir: "../outside" })), /worktrees_dir/);
  assert.throws(() => validateWorkspaceConfig(validConfig({ worktree_name_template: "../{branch_slug}" })), /worktree_name_template/);
});

test("resolves declared paths relative to workspace.toml", () => {
  const result = resolveWorkspacePaths("/home/user/MyyyDevEnv/workspace.toml", validConfig());
  assert.deepEqual(result, {
    workspaceRoot: "/home/user/MyyyDevEnv",
    projectRoot: "/home/user/MyyyDevEnv/environment",
    worktreesRoot: "/home/user/MyyyDevEnv",
  });
  assert.throws(() => resolveWorkspacePaths("workspace.toml", validConfig()), /must be absolute/);
});

test("reads a manifest and verifies resolved directories stay inside workspace", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-workspace-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "repo");
  await mkdir(projectRoot);
  const manifestPath = path.join(root, "workspace.toml");
  await writeFile(manifestPath, validManifest.replace('"environment"', '"repo"'));

  const loaded = await readWorkspaceConfig(manifestPath);
  assert.equal(loaded.workspaceRoot, root);
  assert.equal(loaded.projectRoot, projectRoot);
  assert.equal(loaded.worktreesRoot, root);
  assert.equal((await readFile(manifestPath, "utf8")).length > 0, true);
});

test("detects a valid workspace for its declared checkout", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-workspace-detect-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "repo");
  await mkdir(projectRoot);
  await writeFile(path.join(root, "workspace.toml"), validManifest.replace('"environment"', '"repo"'));

  const workspace = await detectWorkspaceConfigForCwd("/some/checkout/subdir", async (cwd) => {
    assert.equal(cwd, "/some/checkout/subdir");
    return projectRoot;
  });
  assert.equal(workspace?.workspaceRoot, root);
  assert.equal(workspace?.projectRoot, projectRoot);
  assert.equal(await detectWorkspaceConfigForCwd(projectRoot, async () => { throw new Error("not a Git checkout"); }), undefined);
});

test("startup detection is inert without a valid matching workspace manifest", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-workspace-inert-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "repo");
  await mkdir(projectRoot);

  assert.equal(await detectWorkspaceConfig(projectRoot), undefined);
  await writeFile(path.join(root, "workspace.toml"), "not a valid manifest\\n");
  assert.equal(await detectWorkspaceConfig(projectRoot), undefined);

  await mkdir(path.join(root, "other-repo"));
  await writeFile(path.join(root, "workspace.toml"), validManifest.replace('"environment"', '"other-repo"'));
  assert.equal(await detectWorkspaceConfig(projectRoot), undefined);
});

test("workspace context is added as a prompt section and removed when absent", () => {
  const sections = { existing: "keep me" };
  const workspace = {
    workspaceRoot: "/tmp/workspace&<>",
    projectRoot: "/tmp/workspace&<>/repo",
    worktreesRoot: "/tmp/workspace&<>",
    manifestPath: "/tmp/workspace&<>/workspace.toml",
  };

  setWorkspacePromptSection(sections, workspace);
  assert.equal(sections.existing, "keep me");
  assert.match(sections.workspace, /Workspace: \/tmp\/workspace&amp;&lt;&gt;/);
  assert.match(sections.workspace, /Do not create, move, or delete Git worktrees/);
  assert.match(formatWorkspaceContext(workspace), /Project checkout:/);

  setWorkspacePromptSection(sections, undefined);
  assert.deepEqual(sections, { existing: "keep me" });
});

test("rejects a project path that escapes through a symlink", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-workspace-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspaceRoot = path.join(root, "workspace");
  const outsideRoot = path.join(root, "outside");
  await mkdir(workspaceRoot);
  await mkdir(outsideRoot);
  await symlink(outsideRoot, path.join(workspaceRoot, "repo"));
  const manifestPath = path.join(workspaceRoot, "workspace.toml");
  await writeFile(manifestPath, validManifest.replace('"environment"', '"repo"'));

  await assert.rejects(readWorkspaceConfig(manifestPath), /project_root resolves outside the workspace through a symlink/);
});

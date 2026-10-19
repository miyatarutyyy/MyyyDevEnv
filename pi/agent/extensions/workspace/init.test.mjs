import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const extensionPath = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "index.ts")).href;
const v1Manifest = `schema_version = 1
name = "MyyyDevEnv"
project_root = "environment-master"
worktrees_dir = "."
worktree_name_template = "{project}-{branch_slug}"
`;

async function makeGitStub(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const gitPath = path.join(bin, "git");
  await writeFile(gitPath, `#!/bin/sh
if [ "$1 $2" = "rev-parse --show-toplevel" ]; then
  printf '%s\\n' "$FIXTURE_PROJECT_ROOT"
elif [ "$1 $2 $3" = "worktree list --porcelain" ]; then
  printf '%s' "$FIXTURE_WORKTREES"
elif [ "$1 $2 $3 $4" = "symbolic-ref --quiet --short refs/remotes/origin/HEAD" ]; then
  printf 'origin/master\\n'
else
  exit 2
fi
`);
  await chmod(gitPath, 0o755);
  return bin;
}

function worktreeEntry(worktreePath, branch, extra = "") {
  return `worktree ${worktreePath}\nHEAD 0123456789abcdef\nbranch refs/heads/${branch}\n${extra}\n`;
}

function makePi() {
  const commands = new Map();
  const handlers = new Map();
  return {
    commands,
    handlers,
    api: {
      registerCommand: (name, options) => commands.set(name, options.handler),
      on: (name, handler) => handlers.set(name, handler),
    },
  };
}

function makeContext(cwd, { inputs = [], confirmations = [], selection } = {}) {
  const confirmed = [];
  const selected = [];
  const notifications = [];
  return {
    confirmed,
    selected,
    notifications,
    ctx: {
      cwd,
      hasUI: true,
      ui: {
        input: async () => inputs.shift() ?? "",
        confirm: async (title) => {
          confirmed.push(title);
          return confirmations.shift() ?? true;
        },
        select: async (title, options) => {
          selected.push({ title, options });
          return selection;
        },
        notify: (message) => notifications.push(message),
      },
    },
  };
}

test("workspace-init upgrades the manifest, confirms the proposal, and leaves AGENTS.md untouched", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-init-upgrade-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const originalPath = process.env.PATH;
  t.after(() => { process.env.PATH = originalPath; });

  const workspaceRoot = path.join(root, "MyyyDevEnv");
  const projectRoot = path.join(workspaceRoot, "environment-master");
  await mkdir(projectRoot, { recursive: true });
  process.env.PATH = `${await makeGitStub(root)}:${originalPath}`;
  process.env.FIXTURE_PROJECT_ROOT = projectRoot;
  process.env.FIXTURE_WORKTREES = worktreeEntry(projectRoot, "master");
  t.after(() => {
    delete process.env.FIXTURE_PROJECT_ROOT;
    delete process.env.FIXTURE_WORKTREES;
  });

  const manifestPath = path.join(workspaceRoot, "workspace.toml");
  const agentsPath = path.join(workspaceRoot, "AGENTS.md");
  await writeFile(manifestPath, v1Manifest);
  await writeFile(agentsPath, "Keep these instructions unchanged.\n");

  const { default: extension } = await import(extensionPath);
  const pi = makePi();
  extension(pi.api);
  const ui = makeContext(workspaceRoot);
  await pi.commands.get("workspace-init")("", ui.ctx);

  const manifest = await readFile(manifestPath, "utf8");
  assert.match(manifest, /^schema_version = 2$/m);
  assert.match(manifest, /^default_branch = "master"$/m);
  assert.match(manifest, /^default_branch_worktree = "environment-master"$/m);
  assert.equal(await readFile(agentsPath, "utf8"), "Keep these instructions unchanged.\n");
  assert.deepEqual(ui.confirmed, ["Review existing workspace.toml", "Replace workspace.toml with this version?"]);
  assert.match(ui.notifications.at(-1), /AGENTS\.md was not changed/);

  await pi.handlers.get("session_start")({}, ui.ctx);
  const event = { systemPromptOptions: { sections: {} } };
  pi.handlers.get("before_agent_start")(event);
  assert.match(event.systemPromptOptions.sections.workspace, /Default branch: master/);
  assert.match(event.systemPromptOptions.sections.workspace, /ignore entries marked `prunable`/);
});

test("workspace-init explains the missing default branch choices and writes nothing on cancel", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-init-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const originalPath = process.env.PATH;
  t.after(() => { process.env.PATH = originalPath; });

  const workspaceRoot = path.join(root, "MyyyDevEnv");
  const projectRoot = path.join(workspaceRoot, "environment-master");
  await mkdir(projectRoot, { recursive: true });
  process.env.PATH = `${await makeGitStub(root)}:${originalPath}`;
  process.env.FIXTURE_PROJECT_ROOT = projectRoot;
  const featureWorktree = path.join(workspaceRoot, "feature-example");
  await mkdir(featureWorktree);
  process.env.FIXTURE_WORKTREES = worktreeEntry(projectRoot, "master", "prunable gitdir file points to a non-existent location")
    + worktreeEntry(featureWorktree, "feature/example");
  t.after(() => {
    delete process.env.FIXTURE_PROJECT_ROOT;
    delete process.env.FIXTURE_WORKTREES;
  });

  const manifestPath = path.join(workspaceRoot, "workspace.toml");
  await writeFile(manifestPath, v1Manifest);
  const ui = makeContext(workspaceRoot, { selection: "Cancel; do not write workspace.toml" });
  const { default: extension } = await import(extensionPath);
  const pi = makePi();
  extension(pi.api);
  await pi.commands.get("workspace-init")("", ui.ctx);

  assert.equal(await readFile(manifestPath, "utf8"), v1Manifest);
  assert.equal(ui.selected.length, 1);
  assert.match(ui.selected[0].title, /No usable registered worktree/);
  assert.deepEqual(ui.selected[0].options, [
    "Enter a different default branch",
    "Cancel; do not write workspace.toml",
  ]);
});

test("workspace-init creates a manifest without creating AGENTS.md", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-init-new-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const originalPath = process.env.PATH;
  t.after(() => { process.env.PATH = originalPath; });

  const workspaceRoot = path.join(root, "MyyyDevEnv");
  const projectRoot = path.join(workspaceRoot, "environment-master");
  await mkdir(projectRoot, { recursive: true });
  process.env.PATH = `${await makeGitStub(root)}:${originalPath}`;
  process.env.FIXTURE_PROJECT_ROOT = projectRoot;
  process.env.FIXTURE_WORKTREES = worktreeEntry(projectRoot, "master");
  t.after(() => {
    delete process.env.FIXTURE_PROJECT_ROOT;
    delete process.env.FIXTURE_WORKTREES;
  });

  const { default: extension } = await import(extensionPath);
  const pi = makePi();
  extension(pi.api);
  const ui = makeContext(workspaceRoot, { inputs: ["environment-master"] });
  await pi.commands.get("workspace-init")("", ui.ctx);

  const manifest = await readFile(path.join(workspaceRoot, "workspace.toml"), "utf8");
  assert.match(manifest, /^schema_version = 2$/m);
  assert.equal(await readFile(path.join(workspaceRoot, "AGENTS.md"), "utf8").catch(() => undefined), undefined);
  assert.deepEqual(ui.confirmed, ["Create workspace.toml with this version?"]);
});

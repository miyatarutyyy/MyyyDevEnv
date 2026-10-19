import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const extensionPath = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "index.ts")).href;
const oldManifest = `schema_version = 1
name = "MyyyDevEnv"
project_root = "environment-master"
worktrees_dir = "."
worktree_name_template = "{project}-{branch_slug}"
`;

async function setup(t, branch = "master") {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-init-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const oldPath = process.env.PATH;
  t.after(() => { process.env.PATH = oldPath; });
  const workspace = path.join(root, "MyyyDevEnv");
  const project = path.join(workspace, "environment-master");
  await mkdir(project, { recursive: true });
  const bin = path.join(root, "bin");
  await mkdir(bin);
  const git = path.join(bin, "git");
  await writeFile(git, `#!/bin/sh
if [ "$1 $2" = "rev-parse --show-toplevel" ]; then printf '%s\\n' "$FIXTURE_PROJECT";
elif [ "$1 $2 $3" = "worktree list --porcelain" ]; then printf 'worktree %s\\nbranch refs/heads/${branch}\\n\\n' "$FIXTURE_PROJECT";
elif [ "$1 $2 $3 $4" = "symbolic-ref --quiet --short refs/remotes/origin/HEAD" ]; then printf 'origin/master\\n';
else exit 2; fi
`);
  await chmod(git, 0o755);
  process.env.PATH = `${bin}:${oldPath}`;
  process.env.FIXTURE_PROJECT = project;
  t.after(() => { delete process.env.FIXTURE_PROJECT; });
  const commands = new Map();
  const pi = {
    registerCommand: (name, options) => commands.set(name, options.handler),
    on() {},
  };
  const notices = [];
  return {
    workspace,
    project,
    initialize: async ({ selection } = {}) => {
      const ctx = {
        cwd: workspace,
        hasUI: true,
        ui: {
          input: async () => "",
          confirm: async () => true,
          select: async (_title, options) => selection ?? options[0],
          notify: (message) => notices.push(message),
        },
      };
      await commands.get("workspace-init")("", ctx);
    },
    notices,
    pi,
  };
}

async function loadExtension(pi) {
  const { default: extension } = await import(extensionPath);
  extension(pi);
}

test("creates and updates only workspace.toml", async (t) => {
  const fixture = await setup(t);
  await loadExtension(fixture.pi);
  const manifest = path.join(fixture.workspace, "workspace.toml");

  await fixture.initialize();
  assert.match(await readFile(manifest, "utf8"), /^schema_version = 2$/m);
  assert.equal(await readFile(path.join(fixture.workspace, "AGENTS.md"), "utf8").catch(() => undefined), undefined);

  await writeFile(manifest, oldManifest);
  await writeFile(path.join(fixture.workspace, "AGENTS.md"), "Keep unchanged.\n");
  await fixture.initialize();
  assert.match(await readFile(manifest, "utf8"), /^default_branch_worktree = "environment-master"$/m);
  assert.equal(await readFile(path.join(fixture.workspace, "AGENTS.md"), "utf8"), "Keep unchanged.\n");
});

test("asks before continuing when the default-branch worktree is missing", async (t) => {
  const fixture = await setup(t, "feature/example");
  await loadExtension(fixture.pi);
  const manifest = path.join(fixture.workspace, "workspace.toml");
  await writeFile(manifest, oldManifest);

  await fixture.initialize({ selection: "Cancel; do not write workspace.toml" });
  assert.equal(await readFile(manifest, "utf8"), oldManifest);
  assert.match(fixture.notices.at(-1), /Cancelled; workspace.toml was not written\./);
});

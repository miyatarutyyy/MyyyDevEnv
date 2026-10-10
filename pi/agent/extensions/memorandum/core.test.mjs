import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { once } from "node:events";
import {
  KNOWLEDGE_HEADINGS,
  cleanupStaleChildCredentials,
  createKnowledgeArtifacts,
  prepareChildResearch,
  recoverKnowledgeArtifacts,
  redactSecrets,
  renderKnowledgeNote,
  resolveConfig,
  selectKnowledgeContext,
  writeExclusive,
  writeExclusiveAtomic,
} from "./core.mjs";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

test("knowledge Org template contains schema metadata, one purpose tag, and all headings", () => {
  const note = renderKnowledgeNote({ id: uuid, topic: "gRPCとは何か", created: new Date("2026-10-08T12:00:00Z") });
  assert.match(note, new RegExp(`:ID: ${uuid}`));
  assert.match(note, /:SCHEMA_VERSION: 1\.0\.0/);
  assert.match(note, /:STATUS: draft/);
  assert.match(note, /#\+filetags: :knowledge:/);
  assert.doesNotMatch(note, /#\+filetags:.*:error:/);
  for (const heading of KNOWLEDGE_HEADINGS) assert.ok(note.includes(`* ${heading}`));
});

test("context selection redacts known credential patterns and flags for review", () => {
  const context = selectKnowledgeContext(
    [{
      type: "message",
      id: "entry-1",
      message: { role: "user", content: [{ type: "text", text: "Please explain this; api_key=abc123secret" }] },
    }],
    "gRPC",
  );
  assert.equal(context.requiresPreview, true);
  assert.equal(context.selection.redacted, true);
  assert.match(context.messages[0].text, /api_key=\[REDACTED\]/i);
  assert.equal(context.messages[0].entryId, "entry-1");
  assert.match(redactSecrets("sk-abcdefghijklmnopqrstuvwxyz").text, /REDACTED/);
});

test("topic secrets are redacted and trigger preview", () => {
  const context = selectKnowledgeContext([], "api_key=supersecretvalue");
  assert.equal(context.requiresPreview, true);
  assert.equal(context.selection.redacted, true);
  assert.equal(context.topic, "api_key=[REDACTED]");
});

test("exclusive writes refuse to overwrite existing content", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "memorandum-exclusive-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "note.org");
  await writeExclusive(file, "first");
  await assert.rejects(writeExclusive(file, "second"), { code: "EEXIST" });
  assert.equal(await readFile(file, "utf8"), "first");
});

test("recovery reuses a launch ID and reconstructs a missing note without duplication", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "memorandum-recovery-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const config = resolveConfig({ HOME: root, XDG_STATE_HOME: path.join(root, ".state") }, root);
  const created = await createKnowledgeArtifacts({
    config,
    topic: "gRPC",
    source: { agent: "pi", cwd: root, sessionId: "recovery", entryIds: [] },
    context: { question: "gRPC", messages: [], selection: { mode: "automatic", truncated: false, redacted: false } },
  });
  const statePath = path.join(config.stateDir, "launches", `${created.id}.json`);
  await rm(created.notePath);
  await rm(statePath);
  const recovered = await recoverKnowledgeArtifacts(config, created.id);
  assert.equal(recovered.artifacts.id, created.id);
  assert.equal(recovered.artifacts.notePath, created.notePath);
  assert.equal(recovered.state.status, "PREPARING");
  assert.match(await readFile(created.notePath, "utf8"), new RegExp(`^:ID: ${created.id}$`, "m"));
  assert.deepEqual(await readdir(config.notesDir), [path.basename(created.notePath)]);
  const again = await recoverKnowledgeArtifacts(config, created.id);
  assert.equal(again.artifacts.notePath, created.notePath);
  assert.deepEqual(await readdir(config.notesDir), [path.basename(created.notePath)]);
});

test("stale temporary child credentials are removed", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "memorandum-stale-child-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const scratch = path.join(root, "runtime", "memorandum", id);
  await mkdir(scratch, { recursive: true });
  await writeFile(path.join(scratch, "agent-auth.json"), "temporary credential fixture");
  const removed = await cleanupStaleChildCredentials({ runtimeDir: path.join(root, "runtime"), stateDir: path.join(root, "state") }, { graceMs: 0 });
  assert.deepEqual(removed, [id]);
  await assert.rejects(stat(scratch), { code: "ENOENT" });
});

test("active child credentials survive cleanup and dead child credentials are removed", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "memorandum-active-child-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const runtimeDir = path.join(root, "runtime");
  const scratch = path.join(runtimeDir, "memorandum", id);
  const scriptPath = path.join(root, "state", "children", id, "launch.sh");
  await mkdir(scratch, { recursive: true });
  await mkdir(path.dirname(scriptPath), { recursive: true });
  await writeFile(scriptPath, `#!/bin/sh\nprintf '%s\\n' "$$" > '${path.join(scratch, "launcher.pid")}'\ntrap 'exit 0' TERM\nwhile :; do sleep 1; done\n`, { mode: 0o700 });
  const child = spawn(scriptPath, [], { stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  for (let attempt = 0; attempt < 50; attempt++) {
    try { await readFile(path.join(scratch, "launcher.pid"), "utf8"); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 20)); }
  }
  assert.deepEqual(await cleanupStaleChildCredentials({ runtimeDir, stateDir: path.join(root, "state") }, { graceMs: 0 }), []);
  await stat(scratch);
  child.kill("SIGTERM");
  await once(child, "exit");
  assert.deepEqual(await cleanupStaleChildCredentials({ runtimeDir, stateDir: path.join(root, "state") }, { graceMs: 0 }), [id]);
  await assert.rejects(stat(scratch), { code: "ENOENT" });
});

test("child runtime receives only OpenAI auth and binds project/Org read-only", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "memorandum-child-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const agentSource = path.join(root, "parent-agent");
  const cwd = path.join(root, "project");
  const orgRoot = path.join(root, "org");
  const notesDir = path.join(orgRoot, "memorundums");
  await Promise.all([mkdir(agentSource, { recursive: true }), mkdir(cwd, { recursive: true }), mkdir(notesDir, { recursive: true })]);
  await writeFile(path.join(agentSource, "auth.json"), JSON.stringify({
    openai: { type: "oauth", access: "fixture-openai-token", refresh: "fixture-refresh", expires: 1, scopes: [] },
    anthropic: { type: "api_key", key: "must-not-be-copied" },
  }));
  await writeFile(path.join(agentSource, "settings.json"), JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-test", defaultThinkingLevel: "high" }));
  await writeFile(path.join(agentSource, "models-store.json"), JSON.stringify({ openai: [{ id: "gpt-test" }], anthropic: [{ id: "other" }] }));
  const notePath = path.join(notesDir, "note.org");
  const config = {
    stateDir: path.join(root, "state"), runtimeDir: path.join(root, "runtime"), orgRoot, notesDir, piAgentDir: agentSource,
    piExecutable: "/nix/store/0sihhjrfn9w5wf3amsc8ss6i38ilwbpa-pi-1.0.0/bin/pi",
    bwrap: "/usr/bin/bwrap", herdr: "herdr", herdrWorkspace: "w-test",
  };
  const artifacts = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    notePath,
    handoff: {
      handoffVersion: "1.0.0", id: "123e4567-e89b-42d3-a456-426614174000", purpose: "knowledge", topic: "gRPC",
      source: { agent: "pi", cwd, sessionId: "session", entryIds: ["entry"] },
      selection: { mode: "automatic", truncated: false, redacted: false },
      context: { question: "gRPC", messages: [] },
      resources: { noteId: "123e4567-e89b-42d3-a456-426614174000", notePath },
    },
  };
  const runtime = await prepareChildResearch(config, artifacts, cwd, { env: { HOME: root, PATH: "/usr/bin:/bin", TERM: "xterm" } });
  const childAuth = JSON.parse(await readFile(path.join(runtime.agentDir, "auth.json"), "utf8"));
  const childModels = JSON.parse(await readFile(path.join(runtime.agentDir, "models-store.json"), "utf8"));
  const childHandoff = JSON.parse(await readFile(path.join(runtime.inputDir, "handoff.json"), "utf8"));
  assert.deepEqual(Object.keys(childAuth), ["openai"]);
  assert.equal(childAuth.openai.access, "fixture-openai-token");
  assert.deepEqual(Object.keys(childModels), ["openai"]);
  assert.equal(childHandoff.source.cwd, "/tmp/memorandum/workspace");
  assert.equal(childHandoff.resources.notePath, "/tmp/memorandum/notes/note.org");
  assert.match(await readFile(runtime.scriptPath, "utf8"), /--ro-bind/);
  assert.match(await readFile(runtime.scriptPath, "utf8"), /--clearenv/);
  assert.match(runtime.command, /read,grep,find,ls/);
  assert.doesNotMatch(runtime.command, /--tools[^\n]*(?:bash|write|edit)/);
  assert.doesNotMatch(await readFile(runtime.scriptPath, "utf8"), /fixture-openai-token|must-not-be-copied/);
});

test("bwrap denies project and Org writes", { skip: process.platform !== "linux" }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "memorandum-sandbox-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  const org = path.join(root, "org");
  await mkdir(project); await mkdir(org);
  await writeFile(path.join(project, "source.txt"), "project fixture");
  await writeFile(path.join(org, "note.org"), "* Research\\noriginal");
  const result = spawnSync("/usr/bin/bwrap", [
    "--die-with-parent", "--unshare-pid", "--unshare-ipc", "--unshare-uts",
    "--ro-bind", "/", "/", "--tmpfs", "/home", "--dir", "/home/sandbox",
    "--tmpfs", "/tmp", "--dir", "/tmp/memorandum", "--dir", "/tmp/memorandum/workspace",
    "--dir", "/tmp/memorandum/org", "--ro-bind", project, "/tmp/memorandum/workspace",
    "--ro-bind", org, "/tmp/memorandum/org", "--tmpfs", "/run",
    "--dir", "/run/systemd", "--dir", "/run/systemd/resolve",
    "--ro-bind", "/run/systemd/resolve/stub-resolv.conf", "/run/systemd/resolve/stub-resolv.conf",
    "--proc", "/proc", "--dev", "/dev", "--clearenv", "--setenv", "PATH", "/usr/bin:/bin",
    "/usr/bin/bash", "-c",
    'set -eu; test "$(</tmp/memorandum/workspace/source.txt)" = "project fixture"; if echo altered > /tmp/memorandum/workspace/source.txt 2>/dev/null; then exit 10; else echo project-write-denied; fi; if echo altered > /tmp/memorandum/org/note.org 2>/dev/null; then exit 11; else echo org-write-denied; fi',
  ], { encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /project-write-denied/);
  assert.match(result.stdout, /org-write-denied/);
  assert.equal(await readFile(path.join(project, "source.txt"), "utf8"), "project fixture");
  assert.equal(await readFile(path.join(org, "note.org"), "utf8"), "* Research\\noriginal");
});

test("exclusive atomic writes publish complete content and do not overwrite", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "memorandum-atomic-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "handoff.json");
  await writeExclusiveAtomic(file, "complete");
  await assert.rejects(writeExclusiveAtomic(file, "replacement"), { code: "EEXIST" });
  assert.equal(await readFile(file, "utf8"), "complete");
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test("explicit topic context ignores tool output and bounds messages", () => {
  const branch = [
    { type: "message", id: "tool", message: { role: "toolResult", content: [{ type: "text", text: "ignored" }] } },
    { type: "message", id: "user", message: { role: "user", content: [{ type: "text", text: "What does gRPC do?" }] } },
  ];
  const context = selectKnowledgeContext(branch, "gRPC");
  assert.deepEqual(context.messages.map((item) => item.entryId), ["user"]);
  assert.equal(context.requiresPreview, false);
});

test("artifact creation writes a flat Org note and private handoff without overwriting", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "memorandum-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const config = resolveConfig({ HOME: root, XDG_STATE_HOME: path.join(root, ".state") }, root);
  const result = await createKnowledgeArtifacts({
    config,
    topic: "gRPC",
    source: { agent: "pi", cwd: root, sessionId: "session-1", entryIds: ["entry-1"] },
    context: {
      question: "gRPC",
      messages: [{ entryId: "entry-1", role: "user", text: "Explain gRPC" }],
      selection: { mode: "automatic", truncated: false, redacted: false },
    },
  });
  assert.equal(path.dirname(result.notePath), config.notesDir);
  assert.equal(path.dirname(result.handoffPath), path.join(config.stateDir, "handoffs"));
  assert.equal((await stat(result.notePath)).mode & 0o777, 0o600);
  assert.equal((await stat(result.handoffPath)).mode & 0o777, 0o600);
  const handoff = JSON.parse(await readFile(result.handoffPath, "utf8"));
  assert.equal(handoff.id, result.id);
  assert.equal(handoff.resources.noteId, result.id);
  assert.deepEqual(handoff.source.entryIds, ["entry-1"]);
  assert.match(await readFile(result.notePath, "utf8"), /#\+filetags: :knowledge:/);
});

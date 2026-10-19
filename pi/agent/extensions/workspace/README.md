# Workspace extension

Personal Pi extension for understanding the relationship between a repository checkout and its surrounding workspace directory.

## Commands

- `/workspace-init` creates or updates only the workspace-root `workspace.toml`.
- `/workspace init` is an alias for `/workspace-init`.
- `/workspace validate` validates the manifest for the current checkout or workspace directory.
- `/workspace help` lists the commands.

The initializer reads the current manifest before proposing an update, discovers registered worktrees from the configured Git project root, and identifies the default-branch worktree. It ignores entries marked `prunable`. If no usable worktree for the default branch exists, it asks whether to enter a different branch or cancel. It never creates, moves, or deletes Git worktrees and never creates or edits `AGENTS.md`.

The extension displays the complete proposed manifest and writes it only after confirmation. Existing instructions are maintained separately; use [`workspace-instructions.md`](./workspace-instructions.md) when updating the workspace-root `AGENTS.md`.

## Manifest

The runtime `workspace.toml` belongs in the workspace metadata directory, alongside the workspace-root `AGENTS.md`. [`workspace.toml.example`](./workspace.toml.example) shows the supported schema and the current `MyyyDevEnv` layout.

Schema validation and path-safety checks live in `workspace-config.mjs`. The parser supports the flat key/value format emitted by the initializer.

At session startup, the extension discovers a valid manifest for the current Git checkout or a manifest in the current workspace directory. It adds workspace paths, the default branch, and worktree-selection guidance to the system prompt. It stays inert when no valid manifest applies to the current checkout or directory.

Run the parser and path-validation tests with:

```sh
node --experimental-strip-types --test pi/agent/extensions/workspace/core.test.mjs pi/agent/extensions/workspace/init.test.mjs
```

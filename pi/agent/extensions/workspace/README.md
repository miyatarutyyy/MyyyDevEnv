# Workspace extension

Personal Pi extension for understanding the relationship between a repository checkout and its surrounding workspace directory.

The extension registers `/workspace init` and `/workspace validate`. Initialization proposes the current Git checkout's parent as the workspace root, previews the two files it would create, and asks for confirmation. It refuses to overwrite either file, rejects a filesystem root or the user's home directory as the workspace root, and does not create, move, or delete Git worktrees.

`/workspace validate` reads the adjacent `workspace.toml`, validates the supported flat TOML schema, checks that declared directories exist, and rejects paths that escape the workspace (including via symlinks). At session startup, the extension discovers a valid manifest for the current Git checkout and adds workspace paths and safety guidance to the system prompt. It stays inert when Git detection fails, the manifest is missing or invalid, or the manifest does not declare the current checkout. The manifest parsing and path-validation logic lives in `workspace-config.mjs`. The parser intentionally supports only the simple key/value form emitted by the initializer.

Run the parser and path-validation tests with:

```sh
node --test pi/agent/extensions/workspace/core.test.mjs
```

`/workspace status` and end-to-end tests for linked worktrees are not part of the current MVP.

The extension must remain inert when no valid `workspace.toml` applies to the current checkout. Session startup must never create, move, or delete Git worktrees.

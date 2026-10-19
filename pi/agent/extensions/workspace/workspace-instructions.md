# Workspace instructions

This is a workspace metadata directory containing `workspace.toml` and sibling worktrees of the product repository.

- Read `workspace.toml` before selecting a working directory. Resolve its relative paths from the directory containing the file.
- For product-repository tasks, use `project_root` to inspect the Git worktree list, then work in the registered checkout that matches the requested task. Treat each checkout as independent; do not assume another checkout has the same branch or uncommitted changes.
- Use `default_branch` and `default_branch_worktree` to identify the default-branch checkout. The Git worktree list is authoritative for which worktrees currently exist; ignore entries marked `prunable`, and do not treat a path or name in the manifest as proof that a checkout is registered or available.
- If no suitable registered worktree exists, ask the user what to do. Do not create a worktree automatically or silently switch to another checkout.
- Do not move, delete, or create Git worktrees unless the user explicitly requests that operation.
- `/workspace-init` creates or updates only `workspace.toml`. It must not create or edit `AGENTS.md`; review an existing manifest and the proposed replacement before confirming an update.

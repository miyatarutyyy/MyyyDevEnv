# Memorandum knowledge capture

`../memorandum.ts` registers `/memorandum-knowledge [--preview] <topic>` and `/memorandum-recover <launch-uuid> [--restart-researcher]` in Pi. Recovery reuses the immutable launch ID, Handoff, and note path; it reconstructs a missing note only from a validated saved Handoff and never creates a second note. If an existing child tab has not confirmed readiness, the default is to wait/check it without creating a duplicate. `--restart-researcher` explicitly closes only the saved Herdr child tab before relaunching that stage.

The command selects a bounded recent window of user/assistant text from the active session branch, redacts a few known credential formats, and stores only sanitized context with provenance. Redaction is best-effort, not a secrecy guarantee. It opens an editor preview when requested, when a known secret pattern is found, or when selection is truncated. Canceling or supplying invalid JSON creates no artifacts.

A successful capture creates:

- One schema 1.0.0 Org note directly under `$MEMORANDUM_NOTES_DIR` (default `~/org/memorundums/`).
- One mode-0600 Handoff under `$MEMORANDUM_STATE_DIR/handoffs/` (default `${XDG_STATE_HOME:-~/.local/state}/memorandum/handoffs/`).
- One launch-state JSON under `$MEMORANDUM_STATE_DIR/launches/`.
- An independent Pi in a new non-focused Herdr tab, when Herdr workspace resolution and sandbox startup succeed.

The default Org root is `~/org`; notes and state paths can be changed with `MEMORANDUM_ORG_ROOT`, `MEMORANDUM_NOTES_DIR`, and `MEMORANDUM_STATE_DIR`. Emacs is invoked with `MEMORANDUM_EMACSCLIENT` (default `emacsclient`). Herdr workspace can be pinned with `MEMORANDUM_HERDR_WORKSPACE`; otherwise the caller's `HERDR_WORKSPACE_ID` is used. Pi, Herdr, bwrap, and Emacs client executable names can be overridden with `MEMORANDUM_PI_BIN`, `MEMORANDUM_HERDR`, `MEMORANDUM_BWRAP`, and `MEMORANDUM_EMACSCLIENT`.

The child gets a minimal per-run Pi agent directory containing only the configured OpenAI OAuth entry, an OpenAI-only model catalog, and reduced settings. It does not inherit the parent Pi environment or mount the host Home directory. The user explicitly approved the child using this login. **The child process can technically read the OAuth entry in its own sandbox**, as it must be available to Pi; the child has read-only source/Org tools plus built-in Web search/fetch, but no `bash`, `write`, or `edit` tools. OS-level `bwrap` mounts keep project and Org contents read-only. The temporary auth copy and private handoff copy are removed when the child launcher exits; if the process is forcibly killed, the next parent Pi session start removes stale runtime credentials, and the OS runtime directory is cleared when the user logs out.

External research uses the child's built-in `web_search` (DuckDuckGo HTML) and `web_fetch` tools. Retrieved pages are untrusted data. Tests: `node --test pi/agent/extensions/memorandum/core.test.mjs`.

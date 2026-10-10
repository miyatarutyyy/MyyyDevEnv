# Memorandum MVP implementation decisions

## 2026-10-08 — Child Pi may use the user's existing OpenAI OAuth login

The user explicitly approved using the OpenAI OAuth login already configured for Pi. The child receives only the `openai` auth entry in a temporary per-child agent directory under the user's runtime directory; the host's whole Home directory and other provider credentials are not mounted. The temporary credentials and handoff copy are removed when the child launcher exits. Child Pi's research tools do not include `bash`, `write`, or `edit`; `bwrap` makes the project and Org mounts read-only. The read-only boundary is enforced by the OS, not by the prompt.

The user-approved child process can technically read the OAuth entry it needs from its isolated agent directory. The token value is not copied into the project, logs, or Handoff. Normal child exit removes the temporary files; if a process is forcibly killed, cleanup runs on the next parent Pi session start (and the runtime directory is cleared when the OS user session ends).

## 2026-10-08 — Launch recovery reuses one immutable launch ID

`/memorandum-recover <launch-uuid>` reuses the saved Handoff and note path. It can reconstruct a missing note only from a valid matching Handoff, and refuses symlinks, path escapes, or note ID mismatches. If the saved child tab exists but readiness was not confirmed, recovery checks that tab and does not silently launch a duplicate; `--restart-researcher` is the explicit opt-in to close that exact saved child tab and retry only the researcher stage.

## 2026-10-08 — Existing Emacs layout is preserved

Memorandum notes are displayed in the registered existing main editing Window. The integration must not create a frame, split a Window, or save the Org buffer. The Home Manager mapping is declared in source, but must not be applied to the running user environment without a separate explicit operational request.

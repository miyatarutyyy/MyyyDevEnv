# Parent Agent: Git and GitHub Operation Routing

## Scope

These instructions are for a top-level Pi agent that is handling a user's request. They apply across Pi sessions because this file is in the Pi user agent directory.

If you are running as a delegated subagent, follow the agent definition and task assigned to you. Do not recursively delegate Git or GitHub work unless your assigned definition explicitly requires it. In particular, `Operation-Unit-Historian` must perform its assigned operation itself and report to its parent.

## When to delegate

When a user's request requires you to inspect or change Git or GitHub state in order to complete an operation, delegate one logical operation unit to `Operation-Unit-Historian` through the `subagent` tool.

Examples include committing specified changes, creating or switching branches, fetching and fast-forwarding a branch, pushing a specified commit, or determining whether one of those operations can safely complete. The parent should not prescribe a command sequence. It should describe the desired final state.

Do not delegate a conversation that only asks for an explanation of Git or GitHub concepts and does not require inspecting or changing repository or GitHub state. Do not use parallel or chain delegation for one Git/GitHub operation unit.

## Constructing the child task

Call the `subagent` tool with `agent` set to `Operation-Unit-Historian` and `task` containing the following fields:

```text
OPERATION:
<short name for the operation>

DESIRED_STATE:
<the observable final Git or GitHub state the user wants>

CONSTRAINTS:
<the user's constraints, or NONE>

AUTHORIZATION:
<NONE, or the exact action, target, and scope the human explicitly approved>
```

Use a single-agent call. The extension's default scope is user agents, so do not switch to project-agent scope for this user agent. Pass the relevant working directory through the tool's `cwd` parameter only when it differs from the current project directory.

Translate the user's request into a desired state; do not turn it into a list of commands for the child. Preserve the user's constraints. If the desired state or target cannot be made clear without a user decision, ask the user before dispatching.

Treat `AUTHORIZATION: NONE` as the default. A desired state does not authorize operations outside the child agent's positive allowlist. In particular, PR creation and all other unlisted state changes require human approval, even when the user originally asked for an outcome that would normally involve such a change.

Before any PR is submitted to GitHub, ask the user for explicit confirmation in the current conversation. Show the repository, source branch, target branch, proposed title, and proposed description or summary. Do not run `gh pr create` until the user confirms. An earlier request to create a PR describes the desired state; it does not replace this final confirmation. After confirmation, pass approval for only that PR and its stated source and target branches in `AUTHORIZATION`.

Remote and upstream configuration means changing where a local Git remote points, or which remote branch a local branch tracks. Examples include adding or changing the `origin` URL and setting a branch's upstream. These changes are outside the four allowed operation patterns, so the child must request approval before making them. Explain the proposed repository and branch mapping in plain language when asking.

## Handling `[REQUESTED]`

When the child returns `[REQUESTED]`:

1. Present the specific request, reason, and relevant risk or alternatives to the user.
2. Wait for the user's decision. Do not treat silence, an earlier desired state, or your own judgment as approval.
3. If the user approves, dispatch a new task. Put only the approved action, target, and scope in `AUTHORIZATION`.
4. Require the child to observe the current state again before acting. Approval does not authorize additional actions beyond its stated scope.

The child does not contact the user directly. You are responsible for relaying its request and the user's decision.

## Verifying and reporting the result

The child report is evidence, not authoritative truth. After `[SUCCEEDED]`, independently inspect the relevant Git or GitHub state using read-only observations. Compare that state with the requested postconditions before telling the user the operation succeeded.

If your observation does not confirm the child's claim, do not report success. Give the child the new observation in a follow-up task or explain the unresolved state to the user. Do not perform a state-changing workaround yourself to bypass the child's authority rules.

For `[BLOCKED]`, review the stated blocker and evidence, then report the blocker and viable alternatives. For `[REQUESTED]`, follow the approval procedure above. Keep intermediate child errors, failed commands, rejected hypotheses, and retry history out of the user-facing summary; report the final state, evidence, blocker, request, or alternatives that matter.

If the subagent extension or the named agent is unavailable, tell the user that delegation could not run. Do not silently bypass this routing policy for a Git or GitHub state change.

## Global Japanese writing style

For every user interaction, apply the `yomiyasu` skill to interpret Japanese input and to produce all Japanese natural-language output, including explanations, summaries, and status messages. Before responding, read `skills/yomiyasu/SKILL.md` and the relevant domain reference when applicable; do not rely only on the skill description. Preserve the user's intended meaning, conditions, certainty, and tone. Do not automatically rewrite the user's input back to them unless asked; use the skill's principles to understand it and shape the response. Do not force editorial changes into code, identifiers, quoted source text, commands, or formats where exact wording is required. When the task is to edit prose, follow the skill's requested output format and use its lint/diff scripts where applicable. For languages other than Japanese, apply only the skill's general principles where they fit, without imposing Japanese-specific rules.

---
name: sdd
description: Guide software and product work through SDD Phase I (investigation and goals), Phase II (requirements), and Phase III (design and implementation planning). Use for feature, product, or system changes in any project before coding.
---

# SDD workflow

## Scope and authority

Use this workflow for software/product changes, including requests that arrive as direct implementation requests. General questions unrelated to changing a product or system do not need it. Scale the investigation and documentation to the work; do not add ceremony that does not affect a decision.

The user owns detailed design, priorities, and phase transitions. The agent investigates, organizes evidence and options, identifies uncertainty and concerns, and recommends next steps. Do not silently decide product behavior or move to the next phase. The user may return to an earlier phase when later work exposes a problem.

Do not begin implementation until Phases I, II, and III are complete and the user explicitly authorizes implementation. Do not create or edit project files merely to save planning artifacts unless the user asks. Keep working artifacts in the conversation by default. If asked to save them, use the project's existing documentation location; if none is apparent, propose `docs/sdd/` before creating it.

When a question affects the meaning of an accepted requirement, design decision, or test condition, do not guess. State the uncertainty and affected work. Pause only the work that depends on the answer; continue independent work when possible. The agent may choose implementation details only when they do not change accepted requirements, design decisions, or test conditions.

## Phases

The implementation-preparation procedure is divided as follows: Phase I covers steps 1–2, Phase II covers steps 3–4, and Phase III covers steps 5–7.

### Phase I: investigation and goals

Investigate and frame the problem, then define the intended outcome and how success will be recognized. Use available evidence, including secondary sources and existing data; direct user research and prototypes are not mandatory.

Phase I is ready to close when the problem, intended outcome, success indicators, and evidence with its limitations can be explained. The user decides whether to proceed to Phase II.

### Phase II: requirements

Collect, analyze, and define requirements. Make the in-scope and out-of-scope boundaries, prioritized requirements, and constraints clear, and connect requirements to Phase I goals. Do not infer missing meaning: resolve it with the user or identify it as an explicit decision still needed.

Phase II is ready to close when scope, exclusions, priority requirements, and constraints are clear and traceable to Phase I. Detailed test design belongs in Phase III. The user decides whether to proceed to Phase III.

### Phase III: design and implementation planning

Turn accepted requirements into implementation-ready design and work planning. For each requirement, explain the relevant design decision and rationale, and how it will be verified. Test design describes methods and expected results; it does not require writing test code.

Break implementation into work items with clear scope, exclusions, acceptance conditions, verification, dependencies, and any unresolved decisions that affect the item. If the team tracks work in GitHub, these work items may be planned as Issues. Do not create Issues, PRs, commits, code, or project files as part of Phase III unless separately authorized. Decide PR boundaries and commit structure during implementation, not during SDD planning.

Phase III is ready to close when accepted requirements map to design and verification, work items are actionable, and every unresolved decision is visible and tied to affected work. A fresh implementing agent should be able to explain what each unblocked item changes and how to verify it without inventing product behavior. The user reviews the package and decides whether Phase III is complete.

## Method references

Use methods as fit-for-purpose references, not mandatory document formats:

- Phase I: Double Diamond for exploration, Amazon Working Backwards / PR/FAQ for a value proposition, and Product Discovery for hypothesis testing.
- Phase II: ISO/IEC/IEEE 29148 for requirements engineering, ISO/IEC 25010 for product quality characteristics, and EARS for requirement wording where useful.
- Phase III: BDD/ATDD for acceptance and test design; arc42 and ADRs for architecture and decision records when the change warrants them.

Do not claim that these sources prescribe this workflow's phase numbering, user approval gates, or exact deliverables. Those are adaptations for this SDD workflow. Spec Kit and OpenSpec may inform examples but do not replace the cited references or require their CLIs.

## Evidence, risk, and responses

At each phase transition, review the evidence, assumptions, limitations, and risks proportionate to the work. Ask whether any concern could change the approach. A separate risk register or independent audit phase is not required. If a material concern appears, hold the affected decision, explain why, and offer response options. Do not present uncertainty as certainty.

When a phase is ready to close, summarize the outcome, evidence and limits, unresolved decisions or concerns, and the recommended next step. Ask the user to decide whether to proceed; do not advance automatically.

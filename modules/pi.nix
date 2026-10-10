{ pkgs, ... }:

let
  # Keep runtime extensions explicit: tests, documentation, and unselected
  # experimental extensions should not be installed into Pi's agent directory.
  piExtensions = pkgs.linkFarm "pi-agent-extensions" [
    { name = "compaction-reminder.ts"; path = ../pi/agent/extensions/compaction-reminder.ts; }
    { name = "herdr-agent-state.ts"; path = ../pi/agent/extensions/herdr-agent-state.ts; }
    { name = "subagent/index.ts"; path = ../pi/agent/extensions/subagent/index.ts; }
    { name = "subagent/agents.ts"; path = ../pi/agent/extensions/subagent/agents.ts; }
    { name = "workspace/index.ts"; path = ../pi/agent/extensions/workspace/index.ts; }
    { name = "workspace/workspace-config.mjs"; path = ../pi/agent/extensions/workspace/workspace-config.mjs; }
  ];
in
{
  # Stable, tracked Pi configuration is managed by Home Manager. Credentials,
  # session history, and the refreshable model catalog remain user-local.
  home.file = {
    ".pi/agent/AGENTS.md".source = ../pi/agent/AGENTS.md;
    ".pi/agent/agents".source = ../pi/agent/agents;
    ".pi/agent/extensions".source = piExtensions;
    ".pi/agent/keybindings.json".source = ../pi/agent/keybindings.json;
    ".pi/agent/settings.json".source = ../pi/agent/settings.json;
    ".pi/agent/themes".source = ../pi/agent/themes;
  };
}

{ ... }:

{
  # Pi's static, tracked configuration is managed by Home Manager. Mutable
  # credentials and session data remain in the real ~/.pi directory and are
  # intentionally not linked from this repository.
  home.file = {
    ".pi/agent/AGENTS.md".source = ../pi/agent/AGENTS.md;
    ".pi/agent/agents".source = ../pi/agent/agents;
    ".pi/agent/extensions".source = ../pi/agent/extensions;
    ".pi/agent/keybindings.json".source = ../pi/agent/keybindings.json;
    ".pi/agent/models-store.json".source = ../pi/agent/models-store.json;
    ".pi/agent/settings.json".source = ../pi/agent/settings.json;
    ".pi/agent/themes".source = ../pi/agent/themes;
  };
}

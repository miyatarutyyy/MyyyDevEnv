{ pkgs, ... }:

let
  piAgentExtensions = pkgs.runCommand "pi-agent-extensions" { } ''
    mkdir -p "$out/subagent"
    cp ${./pi/agent/extensions/compaction-reminder.ts} "$out/compaction-reminder.ts"
    cp ${./pi/agent/extensions/herdr-agent-state.ts} "$out/herdr-agent-state.ts"
    cp ${./pi/agent/extensions/subagent/agents.ts} "$out/subagent/agents.ts"
    cp ${./pi/agent/extensions/subagent/index.ts} "$out/subagent/index.ts"
    cp ${./pi/agent/extensions/navigator.ts} "$out/navigator.ts"
  '';
in
{
  home.username = "tarutyyyne";
  home.homeDirectory = "/home/tarutyyyne";
  # First Home Manager version used for this home configuration. Keep fixed.
  home.stateVersion = "26.05";
  programs.home-manager.enable = true;

  home.file = {
    ".pi/agent/keybindings.json".source = ./pi/agent/keybindings.json;
    ".pi/agent/extensions".source = piAgentExtensions;
  };

  xdg.configFile."nix/nix.conf".text = ''
    experimental-features = nix-command flakes
  '';

  # Switching a profile must not terminate an active Ghostel terminal.
  systemd.user.startServices = "suggest";

  imports = [
    ./modules/emacs.nix
    ./modules/tools.nix
    ./modules/texlive.nix
    ./modules/git.nix
    ./modules/shell.nix
  ];
}

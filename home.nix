{ ... }:

{
  home.username = "tarutyyyne";
  home.homeDirectory = "/home/tarutyyyne";
  # First Home Manager version used for this home configuration. Keep fixed.
  home.stateVersion = "26.05";
  programs.home-manager.enable = true;

  home.file.".pi/agent/keybindings.json".source = ./pi/agent/keybindings.json;

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

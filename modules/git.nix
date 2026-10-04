{ pkgs, ... }:

{
  # Replicate the existing GitHub CLI credential helper without storing any
  # token. The existing ~/.gitconfig is archived during the one-time migration.
  programs.git = {
    enable = true;
    package = pkgs.git;
    settings.credential = {
      "https://github.com".helper = [ "" "!${pkgs.gh}/bin/gh auth git-credential" ];
      "https://gist.github.com".helper = [ "" "!${pkgs.gh}/bin/gh auth git-credential" ];
    };
  };
  home.packages = [ pkgs.gh ];
}

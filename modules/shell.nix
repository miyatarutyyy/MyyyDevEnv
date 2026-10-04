{ pkgs, ... }:

{
  # Bash remains the Arch login shell. Home Manager owns its user settings.
  programs.bash = {
    enable = true;
    shellAliases = {
      ls = "ls --color=auto";
      grep = "grep --color=auto";
      lsa = "ls -a";
    };
    initExtra = ''
      PS1='\[\e[38;2;246;110;37m\]\W \$\[\e[0m\] '
    '';
    profileExtra = ''
      # Prefer the declared development environment over unrelated profile paths.
      export PATH="$HOME/.local/bin:$HOME/.nix-profile/bin:$PATH"
    '';
  };
  programs.direnv = {
    enable = true;
    nix-direnv.enable = false;
  };
  home.sessionPath = [ "$HOME/.local/bin" "$HOME/.nix-profile/bin" ];
}

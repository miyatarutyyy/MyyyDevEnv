{ editorPackages, pkgs, ... }:

{
  home.packages = (with editorPackages; [
    piPackage
    herdrPackage
    languageServers
  ]) ++ (with pkgs; [ ripgrep fd jq just ]);

  home.file = {
    ".local/bin/pi".source = "${editorPackages.piPackage}/bin/pi";
    ".local/bin/herdr".source = "${editorPackages.herdrPackage}/bin/herdr";
  };

  xdg.configFile = {
    "herdr/config.toml".source = ../herdr/config.toml;
    "herdr/sounds".source = ../herdr/sounds;
  };
}

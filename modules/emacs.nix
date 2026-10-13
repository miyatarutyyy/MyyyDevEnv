{ config, editorPackages, ... }:

{
  home.packages = [
    editorPackages.emacsLauncher
    editorPackages.emacsclientLauncher
    editorPackages.plemoljp
  ];

  home.file = {
    ".emacs.d/early-init.el".source = ../emacs/early-init.el;
    ".emacs.d/init.el".source = ../emacs/init.el;
    ".emacs.d/appendix-overlay.el".source = ../emacs/appendix-overlay.el;
    ".emacs.d/memorandum.el".source = ../emacs/memorandum.el;
    ".emacs.d/my-daily-console.el".source = ../emacs/my-daily-console.el;
    ".emacs.d/workspaces.el".source = ../emacs/workspaces.el;
    ".emacs.d/themes".source = ../emacs/themes;
    # straight-freeze-versions writes here, so point at the editable source.
    ".emacs.d/straight/versions".source = config.lib.file.mkOutOfStoreSymlink
      "${config.home.homeDirectory}/MyyyDevEnv/environment-master/emacs/straight/versions";
    ".local/bin/emacs".source = "${editorPackages.emacsLauncher}/bin/emacs-pinned";
    ".local/bin/emacsclient".source = "${editorPackages.emacsclientLauncher}/bin/emacsclient-pinned";
    ".local/bin/emacs-client-gui".source = ../bin/emacs-client-gui;
  };

  xdg.dataFile = {
    "applications/emacs.desktop".source = ../desktop/emacs.desktop;
    "applications/emacsclient.desktop".source = ../desktop/emacsclient.desktop;
  };

  # The existing Arch unit and its drop-ins stay active until migration.
  # Home Manager activation only suggests service actions.
  systemd.user.services.emacs = {
    Unit = {
      Description = "Pinned PGTK Emacs daemon";
      After = [ "graphical-session.target" ];
      X-SwitchMethod = "keep-old";
    };
    Service = {
      Type = "notify";
      ExecStart = "${editorPackages.emacsLauncher}/bin/emacs-pinned --fg-daemon";
      SuccessExitStatus = "15";
      Restart = "on-failure";
    };
    Install.WantedBy = [ "graphical-session.target" ];
  };
}

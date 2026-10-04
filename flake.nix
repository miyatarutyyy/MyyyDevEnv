{
  description = "Pinned Emacs, Pi, and Herdr development environment";

  inputs.pi.url = "github:earendil-works/pi/stable";
  inputs.nixpkgs.follows = "pi/nixpkgs";
  inputs.home-manager = {
    url = "github:nix-community/home-manager";
    inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { pi, nixpkgs, home-manager, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      emacs = (pkgs.emacsPackagesFor pkgs.emacs-pgtk).emacsWithPackages (epkgs: [
        epkgs.nix-mode
      ]);
      # Org PDF export uses LuaLaTeX, with Japanese support available for Org documents.
      texlive = pkgs.texliveSmall.withPackages (ps: with ps; [
        collection-luatex
        collection-langjapanese
        collection-latexextra
        latexmk
      ]);
      piPackage = pi.packages.${system}.default;
      herdrSource = pkgs.fetchurl {
        url = "https://github.com/herdrdev/herdr/releases/download/v0.9.3/herdr-linux-x86_64";
        hash = "sha256-GKjcZfHC+khYhDRDVt6hz9kRxvBs9G+njhk/QIf026c=";
      };
      herdrPackage = pkgs.runCommand "herdr-0.9.3" { } ''
        mkdir -p "$out/bin"
        install -m755 ${herdrSource} "$out/bin/herdr"
      '';
      languageServers = pkgs.buildEnv {
        name = "editor-language-servers";
        paths = with pkgs; [
          typescript-language-server
          vscode-langservers-extracted
          pyright
          nixd
          clang-tools
          bash-language-server
          shellcheck
        ];
      };
      grammars = (pkgs.emacsPackagesFor pkgs.emacs-pgtk).treesit-grammars.with-grammars (g: with g; [
          tree-sitter-typescript
          tree-sitter-tsx
          tree-sitter-javascript
          tree-sitter-html
          tree-sitter-css
          tree-sitter-json
          tree-sitter-python
          tree-sitter-nix
          tree-sitter-c
          tree-sitter-bash
        ]);
      ghostelModuleSource = pkgs.fetchurl {
        url = "https://github.com/dakra/ghostel/releases/download/v0.56.0/ghostel-module-x86_64-linux.so";
        hash = "sha256-nU9/Taf3yV/RXLrvFeZrgdGLhjIwGACQPYCoqgiB0GE=";
      };
      ghostelModule = pkgs.runCommand "ghostel-module-0.56.0" { } ''
        mkdir -p "$out"
        cp ${ghostelModuleSource} "$out/ghostel-module.so"
        printf '0.56.0\n' > "$out/ghostel-module.version"
      '';
      checkStraightLock = pkgs.writeShellScript "check-straight-lock" ''
        set -eu
        lock="$HOME/.emacs.d/straight/versions/default.el"
        if [ ! -r "$lock" ]; then
          echo "Missing straight lockfile: $lock" >&2
          exit 1
        fi
        ${pkgs.gawk}/bin/awk -F '"' '/^[[:space:]]*\("/ { print $2, $4 }' "$lock" |
          while read -r name revision; do
            repo="$HOME/.emacs.d/straight/repos/$name"
            if [ -d "$repo/.git" ]; then
                actual=$(${pkgs.git}/bin/git -C "$repo" rev-parse HEAD)
              if [ "$actual" != "$revision" ]; then
                echo "straight revision differs from lockfile: $name" >&2
                exit 1
              fi
            fi
          done
      '';
      emacsLauncher = pkgs.writeShellScriptBin "emacs-pinned" ''
        ${checkStraightLock}
        unset EMACSLOADPATH
        export GHOSTEL_MODULE_DIRECTORY=${ghostelModule}
        export EDITOR_TREE_SITTER_GRAMMARS=${grammars}/lib
        export PATH=${pkgs.lib.makeBinPath [ piPackage herdrPackage languageServers texlive pkgs.git pkgs.gh pkgs.direnv ]}:$PATH
        exec ${emacs}/bin/emacs "$@"
      '';
      emacsclientLauncher = pkgs.writeShellScriptBin "emacsclient-pinned" ''
        exec ${emacs}/bin/emacsclient "$@"
      '';
    in {
      homeConfigurations.tarutyyyne = home-manager.lib.homeManagerConfiguration {
        inherit pkgs;
        extraSpecialArgs = {
          editorPackages = {
            inherit emacsLauncher emacsclientLauncher piPackage herdrPackage languageServers texlive;
            plemoljp = pkgs.plemoljp;
            inherit ghostelModule grammars;
          };
        };
        modules = [ ./home.nix ];
      };
      packages.${system} = {
        inherit emacs;
        pi = piPackage;
        herdr = herdrPackage;
        home-manager = home-manager.packages.${system}.default;
        just = pkgs.just;
        lsp = languageServers;
        inherit texlive grammars;
        ghostel-module = ghostelModule;
        default = pkgs.buildEnv {
          name = "editor-environment";
          paths = [ emacsLauncher emacsclientLauncher piPackage herdrPackage languageServers texlive ];
        };
      };
      apps.${system} = {
        emacs = {
          type = "app";
          program = "${emacsLauncher}/bin/emacs-pinned";
        };
        emacsclient = {
          type = "app";
          program = "${emacsclientLauncher}/bin/emacsclient-pinned";
        };
        pi = pi.apps.${system}.default;
        herdr = {
          type = "app";
          program = "${herdrPackage}/bin/herdr";
        };
      };
    };
}

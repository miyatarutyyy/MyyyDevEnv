set shell := ["bash", "-euo", "pipefail", "-c"]

repo_dir := justfile_directory()

# Build the complete user environment without touching the active one.
check:
    NIX_CONFIG='experimental-features = nix-command flakes' nix build --no-update-lock-file --out-link result 'git+file://{{repo_dir}}#homeConfigurations.tarutyyyne.activationPackage'

# Apply declarations. A first migration of unmanaged files is documented in README.
apply:
    NIX_CONFIG='experimental-features = nix-command flakes' nix run --no-update-lock-file 'git+file://{{repo_dir}}#home-manager' -- switch --flake 'git+file://{{repo_dir}}#tarutyyyne'

# Updating the lockfile is an explicit decision, followed by a complete build.
update:
    NIX_CONFIG='experimental-features = nix-command flakes' nix flake update 'git+file://{{repo_dir}}'
    just check

# Restore the previous Home Manager generation.
rollback:
    NIX_CONFIG='experimental-features = nix-command flakes' nix run --no-update-lock-file 'git+file://{{repo_dir}}#home-manager' -- switch --rollback

# Service restart is separate because it closes active Emacs terminal sessions.
restart-emacs:
    systemctl --user restart emacs.service

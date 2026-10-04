# 現在の host からの移行

2026-10-03 の観測に基づく一度限りの手順。`~/environment` の構築物を確認してから適用する。通常の `just apply` と混同しない。

## 現況と競合

| 対象 | 現況 | 初回 switch への影響 |
|---|---|---|
| Emacs の init、early-init、themes、straight lock | `~/.emacs.d` から `~/Git/Emacsyyyne` への symlink | Home Manager の同じ配置先と競合 |
| `emacs`、`emacsclient`、`pi`、`herdr`、`emacs-client-gui` | `~/.local/bin` の手作業 symlink | 同じ配置先と競合 |
| Emacs desktop entry 2 件 | `~/.local/share/applications` の symlink | 同じ配置先と競合 |
| Bash | `~/.bashrc` と `~/.bash_profile` は通常ファイル | Home Manager の生成ファイルと競合 |
| Git | `~/.gitconfig` が GitHub CLI の helper を設定 | Home Manager の XDG Git config と併存すると helper が重複する |
| Emacs service | pacman の `/usr/lib/systemd/user/emacs.service` に `~/Git/Emacsyyyne` の drop-in を重ねる | 新しい user unit より旧 drop-in が優先され得る。既存の target.wants symlink も競合 |
| Pi と Herdr の state | `~/.pi/agent` と `~/.config/herdr` | 認証、session、log は移設しない |
| pacman 版 Emacs、Herdr、Git とその他の profile | host に残る | Nix 版の切り替えとは別管理。初回移行では削除しない |

## 検査と準備

1. Home Manager generation を build する。`just` が未導入なら `NIX_CONFIG='experimental-features = nix-command flakes' nix run --no-update-lock-file 'path:.#just' -- check` を使う。生成された `result/home-files` と `result/home-files/.config/systemd/user/emacs.service` を確認する。
2. `git status` で `flake.lock`、Elisp、straight lockfile、module を確認し、secret が含まれないことを確認する。
3. daemon の未保存 buffer と Ghostel 端末を確認する。初回 Home Manager switch は service の自動再起動を抑えるが、手動の `just restart-emacs` は端末を終了する。
4. `~/.local/share/environment-backup-<date>/` に退避先を用意する。移行前の repository、service の `ExecStart`、Nix store path も記録する。

## 初回の適用

1. 次の既存パスを同じ相対パスを保って backup 内へ移す。`~/.bashrc`、`~/.bash_profile`、`~/.gitconfig`、`~/.emacs.d/{early-init.el,init.el,themes,straight/versions}`、`~/.local/bin/{emacs,emacsclient,emacs-client-gui,pi,herdr}`、`~/.local/share/applications/{emacs.desktop,emacsclient.desktop}`、`~/.config/systemd/user/emacs.service.d`、`~/.config/systemd/user/graphical-session.target.wants/emacs.service`。対象は既存ファイルか symlink として観測済み。移動後も backup を残す。
2. 生成された `result/home-files` と上の一覧を照合し、対象パスに意図しないファイルが残っていないことを確認する。`NIX_CONFIG='experimental-features = nix-command flakes' nix run --no-update-lock-file 'path:.#home-manager' -- switch --flake 'path:.#tarutyyyne'` を実行する。内容が同じ既存 symlink は Home Manager により「変更不要」と判断され、旧 repository への参照が残り得るため、初回は `-b` だけに頼らない。
3. `~/.local/bin`、`~/.emacs.d`、desktop entry、`systemctl --user cat emacs.service`、`command -v git/pi/herdr` を確認する。新しい login shell で PATH と direnv を確認する。
4. Home Manager は `systemd.user.startServices = "suggest"` のため、稼働中 daemon はここで自動再起動しない。未保存の作業と Ghostel 端末を閉じるタイミングで `just restart-emacs` を実行し、PGTK frame と Ghostel・Pi・Herdr の参照先を確認する。

## 復旧の限界

- Home Manager の二回目以降の適用は `just rollback` で直前の generation に戻せる。初回導入前の手作業 symlink は Home Manager generation ではないため、最初の適用を戻すときは Home Manager が作った対象リンクを外し、上の backup から元の相対パスへ戻す。profile と user service の再読込も必要になる。
- active な Ghostel の端末プロセスとスクロールバックは daemon 再起動後には戻せない。
- pacman 版の Emacs、Herdr、Git は初回移行では残す。Nix 版の起動障害時には手動の復旧経路になるが、設定ファイルと service を backup から戻す必要がある。
- 移行後すぐに旧 `Emacsyyyne` repository、`my-arch/nix/editor`、pacman パッケージを削除しない。新しい環境で起動・編集・再ログインを確認してから、正本の重複を解消する。

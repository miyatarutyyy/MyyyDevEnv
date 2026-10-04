# Personal Development Environment

Arch Linux をホストにした、個人用開発環境の宣言。ここが人間が編集する正本である。Nix はプログラムと依存を `/nix/store` に構築し、Home Manager は user の設定とコマンド入口を所定の場所へ配置する。配置先を直接編集しない。

## 境界

- Arch / pacman: kernel、driver、network、display/session、Nix 本体などホストを成立させる層。既存の pacman パッケージは移行中も残す。
- Home Manager: Emacs、Ghostel、Pi、Herdr、Git、GitHub CLI、direnv、基本 CLI、TeX Live（Org の PDF 出力向け）、Bash 設定、Emacs user service と desktop entry。Home Manager は Arch 全体を管理しない。
- Project devShell: Node.js、pnpm、Python ライブラリなど、プロジェクトごとに異なる依存。ここへ一律に追加しない。
- 可変データ: `~/.emacs.d/straight/repos` と build、`~/.pi/agent/auth.json`、`~/.config/herdr` の session/log、GitHub CLI 認証など。Git に入れない。

## 構成

```
flake.nix / flake.lock  Nix と Home Manager の固定入力、パッケージ
home.nix               user profile の入口
modules/               Emacs、開発ツール、Git、shell の宣言
emacs/                 Elisp 設定、テーマ、straight lockfile
desktop/               アプリ起動定義
bin/                   GUI client の小さな入口
justfile               日常の操作
MIGRATION.md           既存環境からの一度限りの移行と復旧
```

Org の PDF 出力では LuaLaTeX を既定エンジンとし、文書ごとに `#+LATEX_COMPILER:` で変更できる。TeX Live は `modules/texlive.nix` で宣言し、プログラミング言語サーバー群とは別の文書組版用環境として Nix で提供する。

Ghostel の Elisp は現在 straight.el の lockfile で revision を固定し、native module 0.56.0 は Nix store に固定する。straight の取得物は Nix store 外なので、これは完全な Nix closure ではない。起動時には取得済み repository の revision を lockfile と照合する。`straight-freeze-versions` が書き込めるよう、`~/.emacs.d/straight/versions` だけはこの repository の実ファイルへのリンクにする。

## 操作

初回は [MIGRATION.md](MIGRATION.md) の競合確認とバックアップを先に行う。新しい PC では Arch と Nix、Git を導入し、この repository を `~/environment` に clone する。初回に `just` がなくても次で検査できる。

```sh
cd ~/environment
NIX_CONFIG='experimental-features = nix-command flakes' nix build --no-update-lock-file '.#homeConfigurations.tarutyyyne.activationPackage'
NIX_CONFIG='experimental-features = nix-command flakes' nix run --no-update-lock-file .#home-manager -- switch --flake .#tarutyyyne
```

ユーザー名と home path が異なる新 PC では `home.nix` と `flake.nix` の `homeConfigurations` 名を変更してから実行する。Git repository に入れたファイルは commit または stage しておく。Nix flake は Git 管理下では未追跡ファイルを入力に含めない。

通常の操作は次のとおり。

```sh
just check          # 構築だけ。現在の home を変えない
just apply          # 固定済み flake.lock で Home Manager を適用
just update         # flake.lock の入力を明示的に更新し build
just rollback       # 一つ前の Home Manager generation に戻す
just restart-emacs  # 稼働中の端末を閉じて Emacs daemon を再起動
```

`just apply` は Emacs daemon の再起動を自動実行しない。active な Ghostel 端末を守るため、実行環境の更新を daemon へ反映する操作は別にした。`flake.lock` は `just update` など明示的な操作まで更新しない。`home.stateVersion` は Home Manager の初回互換性基準であり、パッケージ更新のたびに変更しない。

## Secrets と設定

repository に認証ファイル、API key、token、private key を置かない。Pi の `~/.pi/agent/auth.json` と GitHub CLI の認証は各アプリの user state に残し、新しい PC では再認証する。Herdr の現在の `config.toml` は onboarding フラグのみで、アプリが更新し得るため初期移行では可変データとして保持する。設定として固定すべき項目が明らかになったら、その項目だけを module に宣言する。

`modules/git.nix` は既存の GitHub CLI credential helper の動作を宣言する。認証情報そのものは含めない。`modules/shell.nix` は既存の Bash alias、prompt、direnv hook を再現する。外部の profile はこの環境に取り込まず、宣言した Nix profile を優先する。

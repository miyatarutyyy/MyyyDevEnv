# AGENTS.md annotation experiment

This directory is disposable. `AGENTS.md` is the shared canonical sample; the two approaches keep their human notes beside their own PoC files.

## Start

Open `AGENTS.md` in Emacs and try the overlay commands:

- `M-x agents-annotation-show` — render the matching Org sidecar entries.
- `M-x agents-annotation-add` — add a `request`, `question`, `warning`, or `note` anchored to the current line or selected text.
- `M-x agents-annotation-edit` — find the sidecar entry for the current anchor.
- `M-x agents-annotation-hide` — remove presentation overlays.
- `M-x agents-annotation-export-requests` — display request entries and copy them to the kill ring.

The sample annotations are in `overlay/annotations.org`. After changing the sample file, `show` rebuilds the transient overlays. Anchors use the literal line text (the first selected line for a region), not line numbers. A unique exact-line match is required; missing or ambiguous anchors are hidden.

For the second approach, open `transclusion/AGENTS-notes.org` and run `M-x org-transclusion-mode`. Use `M-x org-transclusion-add-all` if any `#+transclude:` entries did not activate. Press `g` over a transcluded section to refresh it; turn the mode off to return to the plain Org outline. Edit ordinary notes directly under each heading. The package also offers live-sync editing (`e` over a transcluded section), which edits the source `AGENTS.md`; use that only when you intend to change the canonical sample. This experiment focuses on a view with read-through source sections and editable local notes.

## Remove the experiment

Close buffers visiting this directory, then delete `experiments/agents-annotation/`. Remove the clearly marked temporary block in `emacs/init.el` (the `org-transclusion` declaration and `load` form) and the matching `.emacs.d/agents-annotation.el` entry in `modules/emacs.nix`. Apply Home Manager to remove the deployed symlink. No existing keybinding or Nix package set was changed, and no experiment-only package revision was added to the straight lockfile. If you want to remove the package checkout too, remove `org-transclusion` with straight.el's package removal command or delete its checkout/build under `~/.emacs.d/straight/` after closing Emacs. The sample `AGENTS.md` and notes are safe to delete together.

## Comparison

| 観点 | overlay | org-transclusion |
|---|---|---|
| 元ファイルを見ながら注釈できるか | できる。本文の横に一時 overlay を表示 | 別の Org view 内で元の節を展開 |
| 元ファイルを汚さないか | はい。Org sidecar のみ更新 | はい。リンクを含む Org view とメモのみ |
| 注釈の編集しやすさ | コマンドで追加し、Org sidecar を直接編集 | 見出しごとのノートを自由に Org 編集 |
| anchor の安定性 | 行テキスト一致。編集に強くはなく、重複行は非表示 | Markdown 見出し文字列と開始/終了見出しで範囲指定。見出し変更には追従しない |
| AI Agent に export しやすいか | request だけをテキスト化し kill-ring へコピー | Org view から手動で抜き出す。専用 export なし |
| 実装の複雑さ | 小さな自作 Elisp と再描画ロジック | パッケージ設定は小さいが、リンク/範囲記法を理解する必要 |
| maintenance cost | anchor 再解決と表示コードを保守 | パッケージ互換性と Markdown 範囲リンクを保守 |
| Org との親和性 | 保存形式と編集は Org、表示は overlay | 高い。ノート、見出し、リンクが Org view に集約 |

## Known limits

- This is a single-sample proof of concept; the overlay sidecar path is deliberately local to this experiment.
- A changed or duplicate overlay anchor is not guessed. Re-anchor that entry in `overlay/annotations.org`.
- The transclusion package operates on text files using search strings and dynamic end markers. It does not provide semantic Markdown heading IDs; renaming or reordering sections may need link adjustment.
- The test of org-transclusion's exact Markdown extraction behavior depends on the installed package version. The `:lines` range is bounded by the next heading's text where applicable, rather than a stored line number.
- Overlay notes are only presentation; they never become part of the source buffer's saved text.

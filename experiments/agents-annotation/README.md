# AGENTS.md annotation experiment

This directory is disposable. `AGENTS.md` is the shared canonical sample; the two approaches keep their human notes beside their own PoC files.

実際に両方式を試す手順は [`TUTORIAL.md`](TUTORIAL.md) を参照してください。特に overlay 方式は、サンプルの `AGENTS.md` を開いてから注釈を表示します。別の `AGENTS.md` や注釈ファイルを開いた状態では、対応する注釈がないため表示されません。

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
| anchor の安定性 | 行テキスト一致。重複行は表示しない | Markdown の行番号範囲で指定。行変更時は更新が必要 |
| AI Agent に渡しやすいか | request だけをテキスト化し kill-ring へコピー | Org view から手動で抜き出す。専用 export なし |
| Org との親和性 | 保存形式と編集は Org、表示は overlay | 高い。ノート、見出し、リンクが Org view に集約 |

## Known limits

- This is a single-sample proof of concept; the overlay sidecar path is deliberately local to this experiment.
- A changed or duplicate overlay anchor is not guessed. Re-anchor that entry in `overlay/annotations.org`.
- The transclusion package operates on text files using search strings and dynamic end markers. It does not provide semantic Markdown heading IDs; renaming or reordering sections may need link adjustment.
- The transclusion sample uses explicit Markdown line ranges because `:lines` is the package's supported mechanism for selecting ranges in non-Org text files. Update those ranges when the sample's lines change.
- Overlay notes are only presentation; they never become part of the source buffer's saved text.

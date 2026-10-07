# 注釈機能を試すチュートリアル

## `-appendix.org` のoverlay試作

実ファイル名に `-appendix.org` を足したOrgファイルを注釈の保存先として使う試作です。たとえば `sample.ts` の注釈ファイルは `sample.ts-appendix.org` です。

1. `just apply` を実行してEmacs設定を反映します。
2. Emacsを再起動し、`sample.ts` を開きます。
3. `M-x appendix-overlay-show` を実行します。`// example code` の次に、appendix内の文章が枠付きでbuffer上に表示されます。
4. `M-x appendix-overlay-hide` で表示を消し、`M-x appendix-overlay-refresh` で再読込します。
5. 注釈を変えるには `sample.ts-appendix.org` を編集・保存してから、ソースbufferで `M-x appendix-overlay-refresh` を実行します。

注釈本文をコードと一緒に表示しながら編集するには、ソースbufferで `M-x appendix-overlay-edit-view` を実行します。開いた合成bufferではソース部分は読み取り専用、注釈部分は直接編集できます。`C-x C-s` はappendixだけを保存し、開いているソースbufferのoverlayも自動更新します。`C-c C-c` は保存して編集viewを閉じます。`C-c C-k` は未保存の変更を破棄してよいか確認してから閉じます。`q` は終了キーではなく、注釈に入力できる通常の文字です。編集する各Org見出しには一意な `:APPENDIX_ID:` プロパティが必要です。

appendix本文は背景色 `#303030` で行末まで表示します。表示用の閉じ線は付けません。本文に入力した `---` などの区切りはそのまま表示されます。表示はEmacsのoverlayなので `sample.ts` の内容や保存結果には入りません。アンカーは今のところ一意な完全一致の行です。見つからない場合や同じ行が複数ある場合は表示しません。これは配置や書式を試すための初期プロトタイプです。

## 既存のAGENTS.md比較実験

この実験では、実ファイルを書き換えずに補足を付ける方法を試します。`-appendix.org` overlay は任意の開発ファイル向け、overlay と org-transclusion は `AGENTS.md` の比較用です。

- **overlay**: 元のファイルを開いたまま、該当行の直後に一時的な注釈を表示します。注釈データは `overlay/annotations.org` に保存します。
- **org-transclusion**: Org文書の中に元ファイルの節を展開し、その近くにメモを書きます。注釈ビューは `transclusion/AGENTS-notes.org` です。

## 事前準備

このリポジトリの Emacs 設定には、overlay コマンドの読み込みと `org-transclusion` の宣言が追加されています。設定をまだ反映していない場合は Home Manager を適用し、Emacs を再起動してください。Emacs 起動時にパッケージが未導入なら、straight.el による `org-transclusion` の導入が完了してから試します。

サンプルの元ファイルは、この実験フォルダー直下の `AGENTS.md` です。別の `AGENTS.md` を開いても、ここにあるサンプル注釈は一致しません。

## 1. overlay 方式を試す

1. Emacs で `experiments/agents-annotation/AGENTS.md` を開きます。
2. `M-x agents-annotation-show` を実行します。`M-x` は `Alt+x`（または `Esc` の後に `x`）です。コマンド名を入力して `Enter` を押します。
3. `## Architecture` と `## Git` の見出しの**直後**を見ます。サイドカーにある注釈が本文の下に一時表示されます。ミニバッファには表示件数も出ます。
4. `M-x agents-annotation-hide` で表示を消し、もう一度 `show` して再表示できることを確認します。
5. 追加を試すには、`## Git` の行にカーソルを置いて `M-x agents-annotation-add` を実行します。種類を `note`、タイトルと本文を入力します。追加した注釈は `overlay/annotations.org` に保存されます。再度 `show` すると表示されます。
6. `M-x agents-annotation-edit` は、現在行の文字列とファイルに一致する注釈をサイドカーで開きます。既存注釈のある `## Architecture` の行で試してください。
7. `M-x agents-annotation-export-requests` は、このファイル向けの `request` 注釈を一覧表示し、kill ring にコピーします。サンプルでは `Architecture request` が対象です。

### `show` を実行しても見えないとき

- 開いているファイルがこの実験の `AGENTS.md` か確認します。注釈はファイルの相対パス `../AGENTS.md` に紐づいています。
- `show` の直後にミニバッファへ出る件数を確認します。`Displayed 0 annotation(s)` なら、ファイル名かアンカーが合っていません。
- 注釈はアンカー行の下に表示されます。見出しのすぐ下を確認してください。
- 関数が見つからない場合は Emacs 設定が読み込まれていません。Home Manager の反映と Emacs の再起動を確認します。
- `annotations.org` の `:ANCHOR:` は元ファイルの行と完全一致する必要があります。存在しない文字列や重複行には注釈を表示しません。

## 2. org-transclusion 方式を試す

1. `experiments/agents-annotation/transclusion/AGENTS-notes.org` を開きます。
2. `M-x org-transclusion-mode` を実行します。`#+transclude:` の場所に、元 `AGENTS.md` の Testing、Architecture、Git の各節が展開されます。サンプルはMarkdownの行範囲で節を指定しているため、元ファイルに行を挿入・削除したら `AGENTS-notes.org` の `:lines` の範囲も更新してください。
3. 展開されない箇所があれば `M-x org-transclusion-add-all` を実行します。最初の実行時にパッケージ導入や読み込みで少し待つことがあります。
4. 展開内容と、その直下の `Memo` / `Question` / `Request` を読み比べます。メモはこのOrg文書に通常のテキストとして保存されます。
5. 展開箇所にカーソルを置いて `g` を押すと、その箇所を更新します。`org-transclusion-mode` をもう一度実行すると表示を解除し、Orgの通常のアウトラインに戻ります。
6. `e` はライブ編集用で、展開元の `AGENTS.md` を編集します。この実験では元ファイルを変える意図があるときだけ使ってください。

## 3. 使い勝手を比較する

両方式を触ったあと、次の点をメモしてください。

| 観点 | 試すときの問い |
|---|---|
| 元文書との距離 | 注釈を読みながら元のルールを追いやすいか？ |
| 注釈の追加・編集 | 行に紐づく短い注釈と、見出しごとの自由なメモのどちらが自然か？ |
| 元文書の保護 | 注釈だけを編集していると分かりやすいか？ |
| 位置の安定性 | 行や見出しを変更したとき、注釈位置の管理方法は許容できるか？ |
| AIへの受け渡し | request の書き出し、またはOrg文書からの手動抽出は十分か？ |

overlay は元バッファ上で文脈を保てますが、アンカーは行テキスト一致なので、変更や重複に弱く、注釈一覧の編集にはサイドカーを開きます。org-transclusion は節単位の読書・メモに向きますが、リンク範囲の記法とパッケージの挙動に慣れが必要です。これは単一サンプルのPoCであり、実験用データを使って評価してください。

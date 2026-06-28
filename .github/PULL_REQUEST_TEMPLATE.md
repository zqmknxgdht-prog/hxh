<!--
   読んでから埋めてください: CONTRIBUTING.md
   不明点があれば PR draft で出して maintainer に質問 OK。
-->

## 種類

- [ ] データ追加 (キャラ / イベント / 系譜 / arc)
- [ ] データ修正 (typo, 章番号, 関係性の誤り等)
- [ ] コード変更 (UI / レイアウト / ビルド等)
- [ ] ドキュメント
- [ ] その他: 

## 概要

<!-- 何を、なぜ変えたか。1-3 行で -->

## 影響範囲

<!-- 触ったファイルと変更の意図 -->

## ソース (データ系の場合は必須)

<!-- Hunterpedia URL / 漫画 No. / 巻数 / 公式画像など -->

- Hunterpedia: 
- No.: 
- Volume: 

## チェックリスト

- [ ] `bun scripts/check-data-safety.mjs` が pass
- [ ] `bun run build` が成功
- [ ] (UI 変更の場合) `bun run dev` で視覚確認
- [ ] 新規キャラの場合: 漫画本編で **on-panel 登場** を確認 (`(Mentioned)` のみは不可)
- [ ] description / gitMeta に AI への命令文を含めていない
- [ ] gitMeta は `<code>...</code>` 以外の HTML タグなし

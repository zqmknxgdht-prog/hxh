# Contributing

ありがとうございます。PR を出す前に以下を読んでください。

## 編集してよい範囲

| ファイル/ディレクトリ | 一般 contributor | maintainer |
|---|---|---|
| `data/nodes.json` (キャラ / イベント追加) | ✓ | ✓ |
| `data/locale/en.json` (英訳) | ✓ | ✓ |
| `data/branches.json` (系譜追加) | ✓ | ✓ |
| `data/meta.json` (arc 名・arc 順序) | ✓ | ✓ |
| `data/avatar-svg.json` (派生スナップショット) | maintainer 経由 | ✓ |
| `src/`、`scripts/`、`package.json`、`tsconfig*` | review 必須 | ✓ |
| `data/schema.json`、`scripts/check-data-safety.mjs`、`.github/` | maintainer のみ | ✓ |

データ追加の作法は [README.md](./README.md) の「エピソード追加 / キャラクター追加」節を参照。

## 文字種ルール

CI でブロックされる:

- **不可視文字 / Bidi override** (U+200B-200D ZWSP/ZWJ、U+202A-202E、U+2066-2069、U+FEFF BOM、U+E0000-E007F Tag)
- **Cyrillic / Greek** 文字 (キャラ名で必要なら maintainer 判断)
- **全角ラテン文字** (Ａ-Ｚ ａ-ｚ) — 同形異字攻撃防止
- **id pattern 違反**: node id は `^n_[a-z0-9_]{1,40}$`、branch id は `^[a-z][a-z0-9_]*$`
- **長さ超過**: `label` ≤ 60、`description` ≤ 500、`gitMeta` ≤ 200、`affiliations[i]` ≤ 50、`occupation` ≤ 80、`nen.abilities[i].name` ≤ 40、`code` ≤ 30
- **gitMeta の non-`<code>` HTML タグ** (XSS 防止)
- **arcs が空配列** (必ず 1 個以上の arc に所属させる)
- **nen.type が enum 外** (`強化系` / `放出系` / `変化系` / `具現化系` / `操作系` / `特質系` / `不明` のいずれか)

許容:
- 日本語 (漢字・ひらがな・カタカナ・記号 ＝・・…等)
- ASCII ラテン、半角数字、句読点
- 全角句読点 (＝ ／ ｜ 等)

## ローカル前検査

push 前に:

```bash
bun scripts/check-data-safety.mjs   # 安全性 lint
bun run build                       # 型 + ビルド
bun run dev                         # 視覚確認 (任意)
```

## キャラ属性フィールド (任意・推奨)

character ノードに以下の任意フィールドを足せます。すべて optional だが、入っていると DetailCard でリッチに表示される。

```jsonc
{
  "id": "n_k_yokotani",
  "branchId": "kakin",
  // ... 既存フィールド ...
  "affiliations": ["エイ＝イ一家"],        // 複数所属可、JA で正式名
  "occupation": "悪専弁護士 / 法律顧問",   // 役職・職業
  "nen": {
    "type": "具現化系",                    // 6 系統 + 不明
    "abilities": [
      {
        "name": "墨攻",                     // 漫画上の正式 JA 名 (canonical)
        "code": "LSDF",                     // 任意: 漫画で併記される acronym / romaji
        "description": "盤上に書いた文字や数字で対象を強制的に動かす能力。"  // 任意: 短い説明
      }
    ]
  }
}
```

### 命名規約

- **affiliations**: 漫画上の正式日本語名 (例: `幻影旅団`、`エイ＝イ一家`)
- **occupation**: 複数の役職を `/` で区切る (例: `マフィア / 悪専弁護士`)
- **nen.type**: 必ず enum 値。確定情報のみ。未確定は `不明`
- **nen.abilities[].name**: 漫画掲載の正式 JA 表記。Hunter版英字 (LSDF, Bungee Gum 等) はそのままだとレビュー差し戻し対象 → 正式 JA に置き換える
- **nen.abilities[].code**: 漫画で kanji + 振り仮名や acronym が併記される場合の片方を入れる

## ソース引用

新規キャラ・イベントを追加する PR は **漫画本編の canonical な参照** を PR description に必須:

- 漫画話数 (No.) と 集英社版 単行本 巻数
- 該当ページ抜粋 (画像でも、テキストでも)

このリポジトリは漫画本編のみを正典 (canon) として扱う。Hunterpedia などのファン Wiki は章番号や名称表記の確認に補助的に使ってもよいが、**ファン Wiki のみを根拠とした記述は受け付けません** (二次情報の解釈混入を避けるため)。

「Last Mission / Phantom Rouge」等の劇場版オリジナルや、原作で言及のみ (`(Mentioned)`) のキャラは原則受け付けません。

## 禁止コンテンツ

`description` および `gitMeta` フィールドに含めてはいけないもの:

- **指示めいた英語フレーズ** (例: 「ignore previous instructions」「act as ...」「system prompt」「you are an assistant」)
  - 自動テキスト処理パイプラインや要約ツールに渡る可能性を考慮した予防措置。これらの文字列が含まれる PR は CI で自動 reject
- **外部 URL** (ソースは PR description にのみ記載)
- **個人情報 / 連絡先**
- **作者・出版社への中傷**
- 当該キャラ・出来事に関係ない情報

## データ衛生の背景

`data/` 配下のテキストは将来的に外部の text processing pipeline / 要約ツール / インデクサに渡される可能性があります。そのため:

- 命令文・指示めいた表現を入れない
- 事実描写のみに留める
- gitMeta は git 比喩の短文 (例: `<code>merge kurapika</code>＝復讐枝が本流へ`) のみ

## レビューフロー

1. PR 作成 → CI (`Data Safety Lint`) が自動実行
2. 失敗時はエラーメッセージを読んで修正
3. CI 通過 + maintainer 1 名以上の approve で merge 可能
4. データ系の追加は事実確認の review を重視 (canon 一致)
5. コード系の変更は設計議論を含む

## PR テンプレート

`.github/PULL_REQUEST_TEMPLATE.md` の質問に答えて記入してください (フォーマット自動補完されます)。

## メンテナー設定 (リポジトリ公開時)

GitHub の **Settings → Branches** で `master` (or `main`) に branch protection rules を:

- Require a pull request before merging
- Require approvals: **1**
- Require status checks to pass: **Data Safety Lint / lint**
- Require branches to be up to date before merging
- Restrict who can push to matching branches: maintainer のみ
- Do not allow bypassing the above settings

これらは設定でしか反映できない (リポジトリ内ファイルには encode 不可)。

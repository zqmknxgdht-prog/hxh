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
- **tags が `meta.tagsCatalog` 外** (後述「タグカタログ」参照)

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
  },
  "tags": ["念能力者", "暗殺者"]            // closed vocabulary、後述「タグカタログ」
}
```

### 命名規約

- **affiliations**: 漫画上の正式日本語名 (例: `幻影旅団`、`エイ＝イ一家`)
  - **leaf subgroup に書く** — 親 group は `parents[]` 階層で自動継承される (後述「グループ階層」)
- **occupation**: 複数の役職を `/` で区切る (例: `マフィア / 悪専弁護士`)
- **nen.type**: 必ず enum 値。確定情報のみ。未確定は `不明`
- **nen.abilities[].name**: 漫画掲載の正式 JA 表記。Hunter版英字 (LSDF, Bungee Gum 等) はそのままだとレビュー差し戻し対象 → 正式 JA に置き換える
- **nen.abilities[].code**: 漫画で kanji + 振り仮名や acronym が併記される場合の片方を入れる
- **tags**: `data/meta.json` の `tagsCatalog` 内の語のみ。未定義タグは CI で reject

## 継承戦・船上 (voyage) 関連フィールド

ブラックホエール号での継承戦 (ch 358 以降) のキャラ・イベントには、船上の物理位置と何日目かを表す任意フィールドを付けられる。GraphScene 側で voyage location lane と Day マーカーが描画される。

```jsonc
{
  "id": "n_k_woble",
  "kind": "character",
  // ... 既存フィールド ...
  "voyageLocation": "loc_room_1014",   // ブラックホエール号上の物理位置 (loc_* branch id)
  "day": 1                              // 継承戦の Day 1-12 (近似値、canon 明示なし)
}
```

### `voyageLocation`

`data/branches.json` の `loc_*` で始まる branch id を指定する。これらは「ブラックホエール号上の物理空間」を表す系譜 (lane) で、通常の系譜とは別扱い。

| プレフィックス | 意味 | 例 |
|---|---|---|
| `loc_tier_N` | 第 N 層全体 | `loc_tier_1`, `loc_tier_2` |
| `loc_room_NNNN` | 個別船室 | `loc_room_1014` (ワブル), `loc_room_1008` (サレサレ) |
| `loc_<facility>` | その他の施設 | `loc_corridor`, `loc_judiciary` |

新しい `loc_*` branch を `branches.json` に追加する場合:

```jsonc
{
  "id": "loc_room_1014",
  "lane": 18,                       // 縦位置順 (隣接 loc と被らない値に)
  "color": "#6699CC",               // location lane の線色
  "name": "Room 1014 (ワブル)"      // 表示名 (DetailCard の所在欄にも出る)
}
```

lane の縦方向「高さ」は「同 location の重複ノード数」から自動算出される (adaptive lane height) ので不要だが、`lane` 番号 (順位) は隣接 location と被らない値を割り当てる。

### `day`

継承戦の Day 1〜12 を表す整数。canon に明示されていない部分が多く、chapter からの推定値 (近似)。Day マーカー (画面上部の `Day N` ラベル) クリックで該当日の全ノードを表示する DayCard が開く。

漫画本編で「Day N 目」と明示されている場面 (例: 出航 = Day 1、ハルケンブルク葬儀 = Day 10) を基準に、前後を内挿する形で割り振る。正確な day mapping は今後の audit で調整される可能性あり。

### loc_unknown

物理位置が canon で確定していないキャラ・イベントには `"voyageLocation": "loc_unknown"` を付ける。一覧から漏れにくくし、後の精査対象として残せる。

## グループ階層 (kind='group')

group ノードは集合論的に親子関係を持てる。`parents[]` で 1 つ以上の親 group を指定すると、その group の member は自動的に親 group の所属とみなされる (UI では「所属 (継承)」として表示)。

```jsonc
{
  "id": "n_mafia_shu_u",
  "kind": "group",
  "label": "シュウ＝ウ一家",
  "members": [                            // 直接登録される character / 下位 group node id
    "n_k_onior_longbao",
    "n_k_lynch_fullbokko"
    // ... etc
  ],
  "parents": ["n_three_mafia"]            // 親 group の id (DAG)
}
```

### 登録方針 (重要)

**キャラを group に登録するときは、必ず最も leaf な subgroup (最小の集合) に入れること**。親 group には書かない。

| 良い例 | 悪い例 |
|---|---|
| リンチを `n_mafia_shu_u.members` に追加 | リンチを `n_three_mafia.members` に追加 |

理由: `parents[]` 経由で UI が transitive に親階層を表示するため、親 group に直接入れると重複表示や inheritance が壊れる。

### 既存階層 (主要)

```
カキン王国 ← 8人の王妃 / カキン14王子 / 3大マフィア / カキン王立軍 / カキン司法局 / 三神器 / 持たざる者
カキン14王子 ← ベンジャミン/カミーラ/ハルケンブルク私設兵団
3大マフィア ← シュウ＝ウ / シャア＝ア / エイ＝イ 一家
ハンター協会 ← 十二支ん / 協専 / 暗黒大陸探検隊
十二支ん ← 情報班 / 科学班 / 防衛班
暗黒大陸探検隊 ← ビヨンド派
キメラ＝アント ← 直属護衛軍 / 師団長 / 女王 & 師団長
師団長 ← ザザン軍
討伐隊 ← 討伐隊(モラウ・ノヴ)
十老頭 ← 陰獣
```

新グループを既存階層に追加する場合は親を `parents[]` に指定。トップレベル group (ゾルディック家・心源流など) は `parents` 省略可。

## イベント参加者 (kind='event')

event ノードに `participants?: string[]` で登場 character の node id を列挙できる。指定すると character 側からも「登場イベント」として back-link 表示される。

```jsonc
{
  "id": "n_kacho_fugetsu",
  "kind": "event",
  "label": "カチョウ・フウゲツ脱出計画",
  "description": "...",
  "participants": [
    "n_kacho",
    "n_fugetsu",
    "n_melody",
    "n_w_keeney"
  ]
}
```

description に登場するキャラを基本的に全て participants に入れる。実装上は auto-detect も走るが、漏れや誤検出を防ぐため明示推奨。

## タグカタログ (closed vocabulary)

`tags` フィールドは `data/meta.json` の `tagsCatalog` に定義された語のみ受け付ける。新タグ追加は `meta.json` 更新を含む PR で。

```jsonc
// data/meta.json
"tagsCatalog": {
  "状態": ["死亡", "復活", "離脱", "加入", "失踪", "拘束"],
  "念": ["念能力者", "念未覚醒", "半覚醒", "念獣使い", "守護霊獣保有"],
  "役割": ["スパイ", "内通者", "護衛", "暗殺者", "裏切り者", "師弟関係"],
  "メタイベント": ["戦闘", "試合", "修行", "儀式"],
  "物語装置": ["回想", "予兆", "伏線回収"]
}
```

タグは複数指定可、character / event 両方に付けられる。既存軸 (`kind` / `type` / `arcs` / `affiliations` / `parents`) で表現できない横串の属性・状態・役割を表す。

### 表記揺れ対応方針

漫画本編内でも同一対象に複数表記が使われるケース (例: `キメラ＝アント` / `キメラアント`、`ヒソカ＝モロウ` / `ヒソカ`) があり、データ側で必ずしも 1 形に揃わない。方針:

| ケース | 対応 |
|---|---|
| **固有名詞内の区切り符号** | 全角 `＝` で統一 (例: `アルカ＝ナニカ`)。半角 `=` は使わない |
| **国家・組織の正式名** | 漫画初出または最頻出の形式に統一 (例: カキン王国 / ノストラード組)。「カキン帝国」「ノストラード家」等の異表記は使わない |
| **キャラ名の短縮形 (`ヒソカ`)** | 描写内の自然な短縮はそのまま許容 (`description` 内など)。リンク resolver 側で `＝` 正規化と prefix マッチで吸収 |
| **同一対象の異表記が canon 両方に存在** | 短い方を `description` 内文章に、長い方を `label` に置く方針。両方を `affiliations` に入れない |
| **船名・場所名** | canon の最頻出形式に統一 (例: `ブラックホエール号` で `黒鯨号`/`BW号`/`B/W号` は使わない) |
| **EN locale** | Hunterpedia EN の見出し表記に揃える。同一対象に複数 EN がある場合は最古採用 |

#### リンク resolver の正規化 (実装)

`affiliations` 文字列・event description 中の人物名はノード id へ resolve される。表記揺れを吸収するため:

- ノードラベルおよび lookup キーは `＝`/`=` を **削除した正規化キー** でも index する (`src/App.tsx` の `normalizeLabel`)。これにより `キメラアント` と `キメラ＝アント` が同じノードに解決される
- character label に `＝` がある場合、`＝` 前の prefix もキーに追加 (`第十四王子ワブル＝ホイコーロ` → `第十四王子ワブル` でもマッチ)
- 王妃 alias: `description` に `第N王妃` を含むキャラは `◯◯王妃` でもマッチ (`オイト王妃` → n_k_oito_hui_guo_rou)
- 末尾カタカナ run alias: 称号付き label (`奇術師ヒソカ＝モロウ`) から末尾カタカナ部 (`ヒソカ`) を participant 検出 alias として抽出

データ側の表記を完璧に揃える必要はなく、resolver/正規化で吸収する設計。新規 PR でも上記正規化が走るため、`affiliations` 値の表記が微妙にぶれてもリンクは正しく resolve される。

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

# H×H 系統樹 / Hunter × Hunter Lineage Tree

漫画 HUNTER×HUNTER の登場人物・出来事・系譜を、git graph 風の樹形図として可視化する React + Vite SPA。

- **No.** スライダー: 漫画話数で「現時点で何が起きているか」を切り替え (両端で範囲指定可)
- **検索窓**: ノード名・説明から横断検索
- **ブランチ**: 主人公・幻影旅団・キメラアント・カキン王家など複数系譜を縦に並列表示
- **ノード**: 各キャラ／事件／念能力／集団。クリックで詳細カード、ホバーで概要
- **二か国語**: 日本語ラベル + 英語ラベルを同時表示

## リファレンス源

このリポジトリのデータ (`data/` 配下) は **漫画 HUNTER×HUNTER 本編 (冨樫義博 / 集英社)** のみを正典 (canon) として扱う。Hunterpedia などのファンWiki・二次情報源は、執筆時の章番号確認・名称表記照合に補助的に使うことはあるが、データ内に「出典」「URL」「wikiName」などのフィールドとしては記録しない。誤りや欠落は **漫画本編で確認できる事実** のみを根拠に修正する。

---

## 開発コマンド

ランタイムは **Bun**。

```bash
bun install          # 依存インストール (lockfile: bun.lock)
bun run dev          # vite 開発サーバ (http://localhost:5173)
bun run build        # tsc -b && vite build
bun run build:pages  # GitHub Pages 用 (VITE_BASE_PATH=/hxh/)
bun run preview      # dist/ をプレビュー
```

テストランナー・linter は導入なし。`tsc -b` (build に含む) が唯一の静的検査。`noUnusedLocals` ON。データ安全性は `node scripts/check-data-safety.mjs` で別途検査 (CI でも実行)。

---

## アーキテクチャ

### データ層 (`data/`)

| ファイル | 内容 |
|---|---|
| `data/meta.json` | タイトル、`arcOrder`、`layout` (col/lane 寸法)、UI 文言、`version` (No. 単位) |
| `data/branches.json` | 各 branch の `{ id, lane, color, name, parentBranch?, forkFromNode? }` |
| `data/nodes.json` | 全 node の `{ id, branchId, type, label, arcs, kind, description, gitMeta, episode, ... }` |
| `data/locale/en.json` | 英語オーバーレイ (`meta.title/ui/labels`、`arcs`、`branches`、`nodes[id].{label,description}`) |
| `data/avatar-svg.json` | `{ avatars: { [nodeId]: { w, h, shapes: AvatarPrimitive[] } } }` (派生スナップショット) |
| `data/schema.json` | 上記のリファレンス JSON Schema (人間用) |

### ロード (`src/data/loadGraph.ts`)

メタ + branches + nodes + ja/en + avatar をマージし、`graphData` 単一エントリポイントとして公開。`arcEpisodes` は **node の arcs 集合から derive** (ハードコードしない)。読み込み時に不可視文字・bidi 文字を除去し NFC 正規化を適用 (CI lint が漏れたケースの最終防壁)。

### 主要型 (`src/types/graph.ts`)

```ts
type NodeKind = 'character' | 'event' | 'ability' | 'group';
type NodeType = 'n' | 'h' | 'r' | 'm' | 'c';
//                normal, highlight, retire(死亡/退場), merge(合流), cherry(能力強奪)

interface GraphNode {
  id: string;
  branchId: string;          // どの系譜に属するか
  type: NodeType;
  label: string;             // 日本語ラベル
  arcs: string[];            // 集合論的な arc 所属
  kind: NodeKind;
  description: string;
  gitMeta: string;           // git 比喩
  episode: number;           // 漫画話数 (No.)
  mergeFromBranch?: string;  // m タイプの合流元 branch
  cherryFromNode?: string;   // c タイプの強奪元 node
  highlight?: boolean;
  reverse?: boolean;
  tracedAvatar?: TracedAvatarData;
  affiliations?: string[];
  occupation?: string;
  nen?: { type: NenType; abilities?: NenAbility[] };
}
```

### レンダリング (`src/components/`)

| Component | 役割 |
|---|---|
| `GraphScene.tsx` | branch polyline、edge (fork/merge/cherry)、node 円/アバター、ラベル力学配置 |
| `NodeAvatar.tsx` + `TracedAvatar.tsx` | 円+三角形だけで構成した抽象アバター描画 |
| `DetailCard.tsx` | ノードクリック時の詳細パネル |
| `NodeListPanel.tsx` | 左サイドの character / event 一覧 + 検索窓 |
| `EpisodeSlider.tsx` | 話数スライダー (両端で範囲指定) |

### レイアウト・力学

- **`src/utils/layout.ts`** `computeLayout()`: (branch, episode) ごとにクラスタを作り、同 cluster 内は右下階段で配置。同 branch の連続 event はさらに y-drift で重ね階段化。
- **`src/utils/labelForce.ts`** `layoutLabels()`: 各ラベルを物理粒子として、anchor (ノード) への spring + 他ラベルとの AABB 衝突 repulsion で配置。
- **`src/hooks/usePanZoom.ts`**: ピンチ/ホイール/ドラッグ。

---

## エピソード (event) を追加する

`data/nodes.json` の `nodes` 配列に追加 + `data/locale/en.json` の `nodes` に英訳を追加。

### 最小例

```jsonc
// data/nodes.json
{
  "id": "n_my_event",
  "branchId": "kurapika",          // どの系譜の出来事か (branches.json の id)
  "type": "h",                     // highlight (重要話) / n (normal) / r (退場) / m (合流) / c (強奪)
  "label": "緋の眼覚醒",
  "arcs": ["ヨークシン"],            // 1 個以上。過渡章なら ["A","B"]
  "kind": "event",
  "description": "クラピカが激情の中で緋の眼に変じ、力を引き出す。",
  "gitMeta": "<code>commit scarlet-awakening</code>＝鎖の能力が顕在化。",
  "episode": 72                    // 漫画 No.
}
```

```jsonc
// data/locale/en.json
"n_my_event": {
  "label": "Scarlet Eye Awakens",
  "description": "Kurapika's eyes turn crimson in rage, drawing out hidden power."
}
```

### type の使い分け

| type | 意味 | 視覚効果 |
|---|---|---|
| `n` | 普通の出来事 | 通常円 |
| `h` | 重要話 (highlight) | 強調円 + ラベル常時表示 |
| `r` | 退場/死亡 | ストロークが点線 (`stroke-dasharray`) |
| `m` | 合流 | リング装飾、`mergeFromBranch` で合流元を線で描画 |
| `c` | 強奪 (能力奪取) | 回転矩形、`cherryFromNode` で奪取元を点線で接続 |

### 合流イベント (m) を作る

```jsonc
{
  "id": "n_basho_join",
  "branchId": "kurapika",
  "type": "m",
  "label": "バショウ合流",
  "arcs": ["継承戦"],
  "kind": "event",
  "description": "クラピカ陣営の護衛団にバショウが加わる。",
  "gitMeta": "<code>merge basho -> kurapika</code>＝俳人ハンター合流。",
  "episode": 399,
  "mergeFromBranch": "basho"
}
```

### 強奪イベント (c) を作る

```jsonc
{
  "id": "n_steal",
  "branchId": "genei_ryodan",
  "type": "c",
  "label": "ネオン能力を奪取",
  "arcs": ["ヨークシン"],
  "kind": "event",
  "description": "クロロが盗賊の極意でネオンの予知能力 (天使の自動書記) を奪う。",
  "gitMeta": "<code>cherry-pick lovely-ghostwriter</code>",
  "episode": 96,
  "cherryFromNode": "n_neon"
}
```

---

## キャラクター (character) を追加する

```jsonc
{
  "id": "n_my_char",
  "branchId": "kakin",
  "type": "n",                     // h: 重要人物
  "label": "第◯◯王子◯◯",
  "arcs": ["継承戦"],
  "kind": "character",
  "description": "王位継承戦の第◯王子。◯◯能力を持つ。",
  "gitMeta": "<code>kakin</code> · ◯◯派閥",
  "episode": 360                   // 初登場の話数
}
```

EN 側 (`data/locale/en.json`):

```jsonc
"n_my_char": {
  "label": "Foo Hui Guo Rou",
  "description": "..."
}
```

### キャラ属性 (任意、DetailCard に表示)

```jsonc
{
  "affiliations": ["エイ＝イ一家"],        // 所属 (複数可)
  "occupation": "悪専弁護士 / 法律顧問",   // 職業
  "nen": {
    "type": "具現化系",                    // 強化/放出/変化/具現化/操作/特質/不明
    "abilities": [
      { "name": "墨攻", "code": "LSDF" }   // 正式 JA 名 + 漫画併記 acronym
    ]
  }
}
```
詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) の「キャラ属性フィールド」節。

### アバター

`data/avatar-svg.json` に登録済みのキャラのみ抽象アバター (円+三角形) で描画。未登録キャラは branch 色の単純な円。アバター追加は現状 PR 反映 (リポジトリ内に生成パイプラインは無し)。

---

## 系譜 (branch) を追加する

`data/branches.json` の `branches` 配列に追加 + `data/locale/en.json` の `branches` に英名:

```jsonc
{
  "id": "my_branch",
  "lane": 40,                       // 縦位置 (既存最大 +1)
  "color": "#7c3aed",               // 線・ノード色
  "name": "新系譜",
  "parentBranch": "main",           // 任意: どの branch から分岐したか
  "forkFromNode": "n_fork_origin"   // 任意: 分岐元 node
}
```

```jsonc
// en.json
"branches": { ..., "my_branch": "My Branch" }
```

`parentBranch` + `forkFromNode` を両方指定すると、自動で fork edge が描画される。

---

## アーク (arc) を追加する

`data/meta.json` の `arcOrder` に追加 + `data/locale/en.json` の `arcs` に英名:

```jsonc
// meta.json
"arcOrder": [..., "新章"]
```

```jsonc
// en.json
"arcs": { ..., "新章": "New Arc" }
```

各 node の `arcs: ["新章"]` で所属させると、自動で `arcEpisodes` (No. 範囲) が `loadGraph` で derive される。**arc 範囲を meta に書く必要なし** (集合論モデル)。

---

## 規約・ガイドライン

- **JA が source of truth**: `nodes.json` / `branches.json` / `meta.json` は日本語。英語は `locale/en.json` で overlay。
- **arcs は集合**: 過渡章は `arcs: ["A","B"]` で表現可。範囲ではなく集合メンバーシップ。
- **node id は `n_*` snake_case**: 例 `n_chrollo`, `n_kakin_13_souffle`。
- **`episode`** は漫画 No.。アニメ話数や巻数ではない。
- **記述の根拠は漫画本編**: あらすじ・能力詳細を書く場合、原作で確認できる事象のみを記述する。

---

## デプロイ

GitHub Pages: `.github/workflows/deploy.yml` が `main` への push で自動ビルド & Pages 公開。`VITE_BASE_PATH` を repo 名で注入。

ローカルで Pages 相当を見る場合:
```bash
bun run build:pages && bun run preview
```

---

## ライセンス

- **コード**: [MIT License](./LICENSE)
- **データ / 第三者 IP**: `data/` 配下のキャラ名・あらすじ等は漫画 HUNTER×HUNTER (作者: 冨樫義博 / 集英社) に基づく二次的記述で、MIT ライセンスの対象外です。詳細は [NOTICE.md](./NOTICE.md)。

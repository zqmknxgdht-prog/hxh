/** Node kinds shown in the detail card */
export type NodeKind = 'character' | 'event' | 'ability' | 'group';

/** Git metaphor node types */
export type NodeType = 'n' | 'h' | 'r' | 'm' | 'c';

export interface Branch {
  id: string;
  lane: number;
  color: string;
  name: string;
  nameEn?: string;
  /** Parent branch this one forked from */
  parentBranch?: string;
  /** Node id on parent branch where fork happens */
  forkFromNode?: string;
}

/** One of the six Nen categories (or unknown). JP labels stored verbatim. */
export type NenType =
  | '強化系'
  | '放出系'
  | '変化系'
  | '具現化系'
  | '操作系'
  | '特質系'
  | '不明';

export interface NenAbility {
  /** Display name (Japanese, e.g. 「墨攻」 ). */
  name: string;
  /** Romaji or acronym shown alongside, e.g. "LSDF" for 墨攻. */
  code?: string;
  /** Short blurb of what it does. */
  description?: string;
}

export interface GraphNode {
  id: string;
  branchId: string;
  type: NodeType;
  label: string;
  labelEn?: string;
  arcs: string[];
  kind: NodeKind;
  description: string;
  descriptionEn?: string;
  gitMeta: string;
  /** Manga chapter number (No.) */
  episode: number;
  mergeFromBranch?: string;
  cherryFromNode?: string;
  highlight?: boolean;
  reverse?: boolean;
  /** Image-traced SVG paths (derived avatar) */
  tracedAvatar?: TracedAvatarData;

  /** Faction / group memberships. Multi-affiliation OK. */
  affiliations?: string[];
  /** Occupation / role (悪専弁護士, 護衛, etc.). */
  occupation?: string;
  /** Nen type + ability (only for confirmed Nen users). */
  nen?: { type: NenType; abilities?: NenAbility[] };
  /** For kind='group': list of member node ids (rendered as links in DetailCard). */
  members?: string[];
}

export type AvatarPrimitive =
  | { kind: 'circle'; cx: number; cy: number; r: number; f: string }
  | { kind: 'triangle'; cx: number; cy: number; s: number; rot: number; f: string };

export interface TracedAvatarData {
  w: number;
  h: number;
  /** Circle + equilateral triangle composition. */
  shapes: AvatarPrimitive[];
}

export interface VersionConfig {
  unit: string;
  label: string;
  max: number;
}

export interface VersionLabelConfig {
  unit: string;
  label: string;
}

export interface ArcEpisodeRange {
  start: number;
  end: number;
}

export interface LayoutConfig {
  colWidth: number;
  laneHeight: number;
  marginX: number;
  marginY: number;
}

export interface UiStrings {
  episodeTime: string;
  episodeUntil: string;
  hint: string;
  detailWho: string;
  detailMemo: string;
  edgeFork: string;
  edgeMerge: string;
  edgeCherry: string;
}

export interface GraphMeta {
  title: string;
  subtitle: string;
  titleEn?: string;
  subtitleEn?: string;
  arcOrder: string[];
  layout: LayoutConfig;
  labels: {
    kind: Record<string, string>;
    type: Record<string, string>;
  };
  labelsEn?: GraphMeta['labels'];
  ui?: UiStrings;
  uiEn?: UiStrings;
  version: VersionConfig;
  versionEn?: VersionLabelConfig;
  arcLabelsEn?: Record<string, string>;
  arcEpisodes: Record<string, ArcEpisodeRange>;
}

export interface GraphData {
  meta: GraphMeta;
  branches: Record<string, Branch>;
  nodes: GraphNode[];
  nodesById: Record<string, GraphNode>;
  laneCount: number;
  width: number;
  height: number;
}

export interface NodePosition {
  x: number;
  y: number;
}

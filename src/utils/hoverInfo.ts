import type { Branch, GraphMeta, GraphNode } from '../types/graph';
import { bilingualBlock, bilingualInline } from './bilingual';
import { formatEpisode, formatEpisodeBilingual } from './formatEpisode';

export type EdgeKind = 'fork' | 'merge' | 'cherry';

export interface EdgeHoverInfo {
  key: string;
  kind: EdgeKind;
  title: string;
  detail: string;
  episode: number;
  color: string;
}

export interface NodeHoverInfo {
  nodeId: string;
  title: string;
  detail: string;
  episodeLabel: string;
  branchName: string;
  kindLabel: string;
  typeLabel: string;
  color: string;
}

function kindLabel(meta: GraphMeta, kind: string): string {
  return bilingualInline(meta.labels.kind[kind] ?? kind, meta.labelsEn?.kind[kind]);
}

function typeLabel(meta: GraphMeta, type: string): string {
  return bilingualInline(meta.labels.type[type] ?? type, meta.labelsEn?.type[type]);
}

export function buildNodeHoverInfo(
  node: GraphNode,
  branch: Branch,
  meta: GraphMeta,
): NodeHoverInfo {
  const baseEp = formatEpisodeBilingual(meta.version, meta.versionEn, node.episode);
  const chapterTitle = meta.chapterTitles?.[node.episode];
  return {
    nodeId: node.id,
    title: bilingualInline(node.label, node.labelEn),
    detail: bilingualBlock(node.description, node.descriptionEn),
    episodeLabel: chapterTitle ? `${baseEp} ${chapterTitle}` : baseEp,
    branchName: bilingualInline(branch.name, branch.nameEn),
    kindLabel: kindLabel(meta, node.kind),
    typeLabel: typeLabel(meta, node.type),
    color: branch.color,
  };
}

export function buildForkEdgeInfo(
  branch: Branch,
  src: GraphNode,
  dst: GraphNode,
  parentBranch: Branch | undefined,
  meta: GraphMeta,
): EdgeHoverInfo {
  const forkJa = meta.ui?.edgeFork ?? '分岐';
  const forkEn = meta.uiEn?.edgeFork ?? 'Fork';
  const jaEp = formatEpisode(meta.version, src.episode);
  const enEp = meta.versionEn ? formatEpisode(meta.versionEn, src.episode) : jaEp;
  const jaDetail = `${src.label}（${jaEp}）から新ブランチ${
    parentBranch ? `（親: ${parentBranch.name}）` : ''
  }`;
  const enDetail = `New branch ${branch.nameEn ?? branch.name} from ${src.labelEn ?? src.label} (${enEp})${
    parentBranch ? ` (parent: ${parentBranch.nameEn ?? parentBranch.name})` : ''
  }`;

  return {
    key: `fork-${branch.id}`,
    kind: 'fork',
    title: bilingualInline(`${forkJa}: ${branch.name}`, `${forkEn}: ${branch.nameEn ?? branch.name}`),
    detail: bilingualBlock(jaDetail, enDetail),
    episode: dst.episode,
    color: branch.color,
  };
}

export function buildMergeEdgeInfo(
  node: GraphNode,
  src: GraphNode,
  fromBranch: Branch,
  toBranch: Branch,
  meta: GraphMeta,
): EdgeHoverInfo {
  const mergeJa = meta.ui?.edgeMerge ?? '合流';
  const mergeEn = meta.uiEn?.edgeMerge ?? 'Merge';
  const jaEp = formatEpisode(meta.version, node.episode);
  const enEp = meta.versionEn ? formatEpisode(meta.versionEn, node.episode) : jaEp;
  const jaDetail = `${src.label} から ${node.label}（${jaEp}）`;
  const enDetail = `${src.labelEn ?? src.label} merges into ${node.labelEn ?? node.label} (${enEp})`;

  return {
    key: `merge-${node.id}`,
    kind: 'merge',
    title: bilingualInline(
      `${mergeJa}: ${fromBranch.name} → ${toBranch.name}`,
      `${mergeEn}: ${fromBranch.nameEn ?? fromBranch.name} → ${toBranch.nameEn ?? toBranch.name}`,
    ),
    detail: bilingualBlock(jaDetail, enDetail),
    episode: node.episode,
    color: fromBranch.color,
  };
}

export function buildCherryEdgeInfo(
  node: GraphNode,
  src: GraphNode,
  branch: Branch,
  meta: GraphMeta,
): EdgeHoverInfo {
  const cherryJa = meta.ui?.edgeCherry ?? '強奪';
  const cherryEn = meta.uiEn?.edgeCherry ?? 'Cherry-pick';
  const jaEp = formatEpisode(meta.version, src.episode);
  const enEp = meta.versionEn ? formatEpisode(meta.versionEn, src.episode) : jaEp;
  const jaDetail = `${src.label}（${jaEp}）の能力・イベントを ${node.label} へ`;
  const enDetail = `Ability/event from ${src.labelEn ?? src.label} (${enEp}) cherry-picked into ${node.labelEn ?? node.label}`;

  return {
    key: `cherry-${node.id}`,
    kind: 'cherry',
    title: bilingualInline(`${cherryJa} (cherry-pick)`, `${cherryEn}`),
    detail: bilingualBlock(jaDetail, enDetail),
    episode: node.episode,
    color: branch.color,
  };
}

export function edgeKindLabel(kind: EdgeKind, meta: GraphMeta): string {
  switch (kind) {
    case 'fork':
      return bilingualInline(meta.ui?.edgeFork ?? '分岐', meta.uiEn?.edgeFork ?? 'Fork');
    case 'merge':
      return bilingualInline(meta.ui?.edgeMerge ?? '合流', meta.uiEn?.edgeMerge ?? 'Merge');
    case 'cherry':
      return bilingualInline(meta.ui?.edgeCherry ?? '強奪', meta.uiEn?.edgeCherry ?? 'Cherry-pick');
  }
}

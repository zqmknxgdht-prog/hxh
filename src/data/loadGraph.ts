import branchesJson from '../../data/branches.json';
import avatarSvgJson from '../../data/avatar-svg.json';
import chapterTitlesJson from '../../data/chapter-titles.json';
import enJson from '../../data/locale/en.json';
import nodesJson from '../../data/nodes.json';
import metaJson from '../../data/meta.json';
import type { TracedAvatarData } from '../types/graph';
import type { Branch, GraphData, GraphMeta, GraphNode } from '../types/graph';

interface BranchesFile {
  branches: Branch[];
}

interface NodesFile {
  nodes: GraphNode[];
}

interface EnLocale {
  meta: {
    title: string;
    subtitle: string;
    ui: GraphMeta['uiEn'];
    version: GraphMeta['versionEn'];
    labels: GraphMeta['labelsEn'];
  };
  arcs: Record<string, string>;
  branches: Record<string, string>;
  nodes: Record<string, { label: string; description: string }>;
}

interface AvatarSvgFile {
  avatars: Record<string, TracedAvatarData>;
}

/** Defense-in-depth string scrub for all loaded text fields:
 *  strips invisible/bidi/tag chars even if the CI lint is bypassed,
 *  then NFC-normalizes so visually-identical strings compare equal. */
const INVISIBLE_RE = /[\u200B-\u200D\u202A-\u202E\u2060-\u206F\uFEFF]|[\u{E0000}-\u{E007F}]/gu;
function clean(s: string): string;
function clean(s: undefined): undefined;
function clean(s: string | undefined): string | undefined;
function clean(s: string | undefined): string | undefined {
  if (s == null) return s;
  return s.replace(INVISIBLE_RE, '').normalize('NFC');
}

function loadGraph(): GraphData {
  const metaJa = metaJson as Omit<GraphMeta, 'arcEpisodes'>;
  const en = enJson as EnLocale;
  const avatarSvgs = (avatarSvgJson as AvatarSvgFile).avatars ?? {};
  // chapter-titles.json is { "1": "出発の日", ... } — keys are strings in JSON
  // but we expose them as numeric-keyed for lookup convenience.
  const chapterTitlesRaw = chapterTitlesJson as Record<string, string>;
  const chapterTitles: Record<number, string> = {};
  for (const [k, v] of Object.entries(chapterTitlesRaw)) {
    chapterTitles[Number(k)] = clean(v);
  }

  const meta: GraphMeta = {
    ...metaJa,
    titleEn: en.meta.title,
    subtitleEn: en.meta.subtitle,
    uiEn: en.meta.ui,
    versionEn: en.meta.version,
    labelsEn: en.meta.labels,
    arcLabelsEn: en.arcs,
    arcEpisodes: {},
    chapterTitles,
  };

  const branchesList = (branchesJson as BranchesFile).branches.map((b) => ({
    ...b,
    name: clean(b.name),
    nameEn: clean(en.branches[b.id] ?? b.name),
  }));

  const nodes = (nodesJson as NodesFile).nodes.map((n) => {
    const loc = en.nodes[n.id];
    return {
      ...n,
      label: clean(n.label),
      description: clean(n.description),
      gitMeta: clean(n.gitMeta),
      labelEn: clean(loc?.label ?? n.label),
      descriptionEn: clean(loc?.description ?? n.description),
      tracedAvatar: avatarSvgs[n.id],
    };
  });

  const branches = Object.fromEntries(branchesList.map((b) => [b.id, b]));
  const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const laneCount = Math.max(...branchesList.map((b) => b.lane)) + 1;
  const { marginX, marginY, colWidth, laneHeight } = meta.layout;
  const width = marginX * 2 + (nodes.length - 1) * colWidth;
  const height = marginY * 2 + (laneCount - 1) * laneHeight;

  // Derive arcEpisodes from node membership (set-based, not range-based).
  const arcEpisodes: Record<string, { start: number; end: number }> = {};
  for (const node of nodes) {
    for (const arc of node.arcs ?? []) {
      const cur = arcEpisodes[arc];
      if (!cur) arcEpisodes[arc] = { start: node.episode, end: node.episode };
      else {
        if (node.episode < cur.start) cur.start = node.episode;
        if (node.episode > cur.end) cur.end = node.episode;
      }
    }
  }
  meta.arcEpisodes = arcEpisodes;

  return { meta, branches, nodes, nodesById, laneCount, width, height };
}

export const graphData = loadGraph();

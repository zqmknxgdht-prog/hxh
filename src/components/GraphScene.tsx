import { useMemo } from 'react';
import type { Branch, GraphMeta, GraphNode } from '../types/graph';
import type { HoverPayload } from '../components/GraphTooltip';
import { NodeAvatar } from '../avatars';
import { compensatedRadius, getLodLevel } from '../utils/fitBounds';
import {
  buildCherryEdgeInfo,
  buildForkEdgeInfo,
  buildMergeEdgeInfo,
  buildNodeHoverInfo,
  edgeKindLabel,
  type EdgeHoverInfo,
} from '../utils/hoverInfo';
import { formatEpisodeBilingual } from '../utils/formatEpisode';
import { branchPolylinePath, edgePath, type PositionedNode } from '../utils/layout';
import { layoutLabels, leaderDistance, type LabelInput } from '../utils/labelForce';

const LABEL_LINE_H = 11;
const LABEL_JA_CHAR_W = 9.5;
const LABEL_EN_CHAR_W = 5.6;
const LABEL_PAD = 6;

function measureLabel(node: GraphNode): { width: number; height: number; lines: string[]; epLine?: string } {
  const ja = node.label ?? '';
  const en = node.labelEn && node.labelEn !== ja ? node.labelEn : '';
  const epLine = node.kind === 'event' ? `No.${node.episode}` : '';
  const lines = [ja, en].filter(Boolean);
  if (epLine) lines.push(epLine);
  const wJa = ja.length * LABEL_JA_CHAR_W;
  const wEn = en.length * LABEL_EN_CHAR_W;
  const wEp = epLine.length * LABEL_EN_CHAR_W;
  const width = Math.max(wJa, wEn, wEp, 24) + LABEL_PAD;
  const height = lines.length * LABEL_LINE_H + 4;
  return { width, height, lines, epLine };
}

interface GraphSceneProps {
  nodes: PositionedNode[];
  branches: Record<string, Branch>;
  nodesById: Record<string, GraphNode>;
  meta: GraphMeta;
  minEpisode: number;
  maxEpisode: number;
  scale: number;
  selectedId: string | null;
  hoverNodeId: string | null;
  hoverEdgeKey: string | null;
  hasSelection: boolean;
  onSelectNode: (id: string) => void;
  onHover: (payload: HoverPayload | null) => void;
}

const STROKE = { vectorEffect: 'non-scaling-stroke' as const };

type RenderEdge = EdgeHoverInfo & {
  d: string;
  cherry?: boolean;
  future: boolean;
};

function nodeClassName(
  node: PositionedNode,
  selected: boolean,
  hovered: boolean,
  future: boolean,
): string {
  const parts = [`node`, `t-${node.type}`];
  if (node.highlight) parts.push('hl');
  if (node.reverse) parts.push('rev');
  if (future) parts.push('future');
  if (hovered) parts.push('hover');
  if (selected) parts.push('sel');
  return parts.join(' ');
}

function toNodePayload(info: ReturnType<typeof buildNodeHoverInfo>): HoverPayload {
  return {
    target: 'node',
    nodeId: info.nodeId,
    title: info.title,
    detail: info.detail,
    episodeLabel: info.episodeLabel,
    badges: [info.branchName, info.kindLabel, info.typeLabel],
    color: info.color,
  };
}

function toEdgePayload(info: EdgeHoverInfo, meta: GraphMeta): HoverPayload {
  return {
    target: 'edge',
    edgeKey: info.key,
    title: info.title,
    detail: info.detail,
    episodeLabel: formatEpisodeBilingual(meta.version, meta.versionEn, info.episode),
    kindLabel: edgeKindLabel(info.kind, meta),
    color: info.color,
  };
}

export function GraphScene({
  nodes,
  branches,
  nodesById,
  meta,
  minEpisode,
  maxEpisode,
  scale,
  selectedId,
  hoverNodeId,
  hoverEdgeKey,
  hasSelection,
  onSelectNode,
  onHover,
}: GraphSceneProps) {
  const layout = meta.layout;
  const lod = getLodLevel(scale);
  const isFuture = (node: GraphNode) => node.episode > maxEpisode || node.episode < minEpisode;
  const showBranchLabels = lod !== 'overview';
  const showNodeLabels = lod === 'normal';

  const posById = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const n of nodes) m.set(n.id, { x: n.x, y: n.y });
    return m;
  }, [nodes]);

  const branchSegments = useMemo(() => {
    const segments: { branchId: string; branch: Branch; d: string; labelY: number; future: boolean }[] = [];
    for (const branchId of Object.keys(branches)) {
      const branchNodes = nodes.filter((n) => n.branchId === branchId);
      if (!branchNodes.length) continue;
      const branch = branches[branchId];
      const visible = branchNodes.filter((n) => !isFuture(n));
      const labelY = layout.marginY + branch.lane * layout.laneHeight;
      segments.push({
        branchId,
        branch,
        d: branchPolylinePath(visible.length ? visible : branchNodes),
        labelY,
        future: visible.length === 0,
      });
    }
    return segments;
  }, [nodes, branches, layout, minEpisode, maxEpisode]);

  const forkEdges = useMemo((): RenderEdge[] => {
    const edges: RenderEdge[] = [];
    for (const branch of Object.values(branches)) {
      if (!branch.parentBranch || !branch.forkFromNode) continue;
      const src = nodesById[branch.forkFromNode];
      const child = nodes.find((n) => n.branchId === branch.id);
      if (!src || !child) continue;
      const srcPos = posById.get(src.id);
      const childPos = posById.get(child.id);
      if (!srcPos || !childPos) continue;
      const info = buildForkEdgeInfo(branch, src, child, branches[branch.parentBranch], meta);
      edges.push({
        ...info,
        d: edgePath(srcPos.x, srcPos.y, childPos.x, childPos.y),
        future: isFuture(src) && isFuture(child),
      });
    }
    return edges;
  }, [branches, nodes, nodesById, posById, minEpisode, maxEpisode, meta]);

  const mergeEdges = useMemo((): RenderEdge[] => {
    const edges: RenderEdge[] = [];
    for (const node of nodes) {
      if (node.mergeFromBranch) {
        const candidates = nodes.filter((s) => s.branchId === node.mergeFromBranch && s.col < node.col);
        const src = candidates[candidates.length - 1];
        if (src) {
          const srcPos = posById.get(src.id)!;
          const dstPos = posById.get(node.id)!;
          const info = buildMergeEdgeInfo(
            node,
            src,
            branches[node.mergeFromBranch],
            branches[node.branchId],
            meta,
          );
          edges.push({
            ...info,
            d: edgePath(srcPos.x, srcPos.y, dstPos.x, dstPos.y),
            future: isFuture(node),
          });
        }
      }
      if (node.cherryFromNode) {
        const src = nodesById[node.cherryFromNode];
        if (src) {
          const srcPos = posById.get(src.id);
          const dstPos = posById.get(node.id);
          if (!srcPos || !dstPos) continue;
          const info = buildCherryEdgeInfo(node, src, branches[node.branchId], meta);
          edges.push({
            ...info,
            d: edgePath(srcPos.x, srcPos.y, dstPos.x, dstPos.y),
            cherry: true,
            future: isFuture(node),
          });
        }
      }
    }
    return edges;
  }, [nodes, branches, nodesById, posById, minEpisode, maxEpisode, meta]);

  const allEdges = useMemo(() => [...forkEdges, ...mergeEdges], [forkEdges, mergeEdges]);

  /** Force-laid-out label positions for visible labels. */
  const labelLayout = useMemo(() => {
    if (!showNodeLabels) return [];
    const inputs: LabelInput[] = [];
    const measureCache = new Map<string, ReturnType<typeof measureLabel>>();
    for (const node of nodes) {
      if (isFuture(node)) continue;
      const m = measureLabel(node);
      measureCache.set(node.id, m);
      // Default offset: right of node, label center at anchor + (nodeR + 4 + width/2, 0)
      const radius = node.kind === 'character' ? 12 : 9;
      inputs.push({
        id: node.id,
        anchorX: node.x,
        anchorY: node.y,
        offsetX: radius + 4 + m.width / 2,
        offsetY: 0,
        width: m.width,
        height: m.height,
      });
    }
    const laidOut = layoutLabels(inputs);
    return laidOut.map((item) => ({ ...item, measure: measureCache.get(item.id)! }));
  }, [nodes, minEpisode, maxEpisode, showNodeLabels]);

  const sceneClass = ['scene', lod !== 'normal' ? `lod-${lod}` : '', hasSelection ? 'has-sel' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <g className={sceneClass}>
      {branchSegments.map(({ branchId, branch, d, labelY, future }) => (
        <g key={`lane-${branchId}`} className={future ? 'future' : undefined}>
          <path className="lane" d={d} fill="none" stroke={branch.color} {...STROKE} />
          {showBranchLabels && (
            <text
              className="lbl lbl-lane"
              x={10}
              y={labelY + 4}
              textAnchor="start"
              fill={branch.color}
            >
              <tspan x={10} dy={0}>
                {branch.name}
              </tspan>
              {branch.nameEn && branch.nameEn !== branch.name && (
                <tspan x={10} dy={11} className="lbl-en">
                  {branch.nameEn}
                </tspan>
              )}
            </text>
          )}
        </g>
      ))}

      {allEdges.map(({ key, d, color, cherry, future }) => (
        <g key={`vis-${key}`} className={future ? 'future' : undefined}>
          <path
            className={
              cherry
                ? `edge cp${hoverEdgeKey === key ? ' hover' : ''}`
                : `edge${hoverEdgeKey === key ? ' hover' : ''}`
            }
            d={d}
            stroke={color}
            {...STROKE}
          />
        </g>
      ))}

      {nodes.map((node) => {
        const branch = branches[node.branchId];
        const selected = selectedId === node.id;
        const hovered = hoverNodeId === node.id;
        const future = isFuture(node);
        const baseR =
          node.kind === 'character'
            ? node.tracedAvatar
              ? node.highlight
                ? 14
                : node.type === 'm'
                  ? 12
                  : 11
              : node.highlight
                ? 13
                : node.type === 'm'
                  ? 11
                  : 10
            : node.highlight
              ? 11
              : node.type === 'm'
                ? 9
                : 8;
        const minPx = lod === 'overview' ? 5.5 : lod === 'compact' ? 4.5 : 0;
        const r = minPx ? compensatedRadius(baseR, scale, minPx) : baseR;
        const showAvatar = node.kind === 'character' && node.type !== 'c' && node.tracedAvatar;
        const avatarCompact = lod !== 'normal';
        const avatarMuted = node.type === 'r' || node.reverse;

        return (
          <g
            key={node.id}
            className={nodeClassName(node, selected, hovered, future)}
            transform={`translate(${node.x},${node.y})`}
            data-id={node.id}
            onMouseEnter={() => {
              if (!future) onHover(toNodePayload(buildNodeHoverInfo(node, branch, meta)));
            }}
            onMouseLeave={() => onHover(null)}
            onClick={(e) => {
              e.stopPropagation();
              if (!future) onSelectNode(node.id);
            }}
          >
            <circle className="hit" r={18} fill="#000" fillOpacity={0} pointerEvents="all" />
            <circle className="aura" r={10} {...STROKE} />
            {node.type === 'c' ? (
              <rect
                className="shape"
                x={-7}
                y={-7}
                width={14}
                height={14}
                rx={2}
                transform="rotate(45)"
                fill={branch.color}
                stroke={branch.color}
                strokeWidth={2}
                {...STROKE}
              />
            ) : showAvatar ? (
              <>
                <NodeAvatar
                  nodeId={node.id}
                  traced={node.tracedAvatar!}
                  radius={r}
                  stroke={branch.color}
                  strokeWidth={lod === 'overview' ? 2.5 : 2}
                  muted={avatarMuted}
                  compact={avatarCompact}
                />
                {node.type === 'm' && !node.reverse && (
                  <circle
                    className="ring"
                    r={r + 3}
                    fill="none"
                    stroke={branch.color}
                    strokeWidth={2}
                    {...STROKE}
                  />
                )}
              </>
            ) : (
              <>
                <circle
                  className="shape"
                  r={r}
                  fill={node.type === 'r' || node.reverse ? '#eef1f6' : branch.color}
                  stroke={branch.color}
                  strokeWidth={lod === 'overview' ? 2.5 : 2}
                  {...STROKE}
                />
                {node.type === 'm' && !node.reverse && (
                  <circle
                    className="ring"
                    r={r - 4}
                    fill="#ffffff"
                    stroke={branch.color}
                    strokeWidth={2}
                    {...STROKE}
                  />
                )}
              </>
            )}
            {/* labels rendered separately below via labelLayout */}
          </g>
        );
      })}

      {allEdges.map((edge) => {
        if (edge.future) return null;
        return (
          <path
            key={`hit-${edge.key}`}
            className="edge-hit"
            d={edge.d}
            onMouseEnter={() => onHover(toEdgePayload(edge, meta))}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}

      <g className="labels">
        {labelLayout.map((item) => {
          const node = nodesById[item.id];
          if (!node) return null;
          const branch = branches[node.branchId];
          const m = item.measure;
          const leftX = item.x - m.width / 2 + LABEL_PAD / 2;
          const topY = item.y - m.height / 2;
          const needsLeader = leaderDistance(item) > 26;
          return (
            <g key={`lbl-${item.id}`} className={selectedId === item.id ? 'lbl-group sel' : 'lbl-group'}>
              {needsLeader && (
                <line
                  className="leader"
                  x1={item.anchorX}
                  y1={item.anchorY}
                  x2={item.x}
                  y2={item.y}
                  stroke={branch.color}
                  strokeWidth={1.2}
                  opacity={0.65}
                  {...STROKE}
                />
              )}
              <text
                className="lbl node-label"
                textAnchor="start"
                x={leftX}
                y={topY + LABEL_LINE_H}
                fill={branch.color}
              >
                {m.lines.map((line, i) => {
                  const isEp = m.epLine && i === m.lines.length - 1;
                  const isEn = i === 1 && node.labelEn && node.labelEn !== node.label;
                  const cls = isEp ? 'lbl-ep' : isEn ? 'lbl-en' : '';
                  const display = isEp ? `No.${node.episode}` : line;
                  return (
                    <tspan key={i} x={leftX} dy={i === 0 ? 0 : LABEL_LINE_H} className={cls || undefined}>
                      {display}
                    </tspan>
                  );
                })}
              </text>
            </g>
          );
        })}
      </g>
    </g>
  );
}

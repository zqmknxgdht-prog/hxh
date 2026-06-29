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
import { branchPolylinePath, computeLaneGeometry, edgePath, type PositionedNode } from '../utils/layout';
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
  onSelectEdge?: (edge: {
    key: string;
    title: string;
    detail: string;
    episodeLabel: string;
    kindLabel: string;
    color: string;
    fromNodeId?: string;
    toNodeId?: string;
    fromLabel?: string;
    toLabel?: string;
  }) => void;
  onSelectDay?: (day: number, label: string) => void;
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
  onSelectEdge,
  onSelectDay,
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

  /** Day → x position derived from positioned nodes' actual day slot. Since
   *  voyage nodes are sub-clustered by day, each day has a distinct minimum x.
   *  Skip days that have no visible node. */
  const voyageDayGuides = useMemo(() => {
    const days = meta.voyageDays ?? [];
    if (days.length === 0) return [];
    const xByDay = new Map<number, number>();
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
      if (typeof n.day !== 'number') continue;
      const cur = xByDay.get(n.day);
      if (cur === undefined || n.x < cur) xByDay.set(n.day, n.x);
    }
    return days
      .filter((d) => d.chapter >= minEpisode && d.chapter <= maxEpisode)
      .map((d) => {
        const x = xByDay.get(d.day);
        if (x === undefined) return null;
        return { day: d.day, label: d.label ?? `Day ${d.day}`, x: x - 14, y1: minY - 18, y2: maxY + 30 };
      })
      .filter((x): x is { day: number; label: string; x: number; y1: number; y2: number } => x !== null);
  }, [meta.voyageDays, nodes, minEpisode, maxEpisode]);

  /** During voyage range, swap branch to voyageLocation for lane assignment. */
  const effectiveBranchOf = (n: GraphNode) =>
    n.voyageLocation && n.episode >= 358 && n.episode <= 410 ? n.voyageLocation : n.branchId;

  /** Adaptive lane y / height per pre-voyage and voyage contexts. */
  const laneGeometry = useMemo(
    () => computeLaneGeometry(nodes, branches, layout),
    [nodes, branches, layout],
  );

  const branchSegments = useMemo(() => {
    const segments: { branchId: string; branch: Branch; d: string; labelY: number; future: boolean }[] = [];
    for (const branchId of Object.keys(branches)) {
      const branchNodes = nodes.filter((n) => effectiveBranchOf(n) === branchId);
      if (!branchNodes.length) continue;
      const branch = branches[branchId];
      const visible = branchNodes.filter((n) => !isFuture(n));
      // labelY anchors the lane label at the left of the graph; prefer the voyage
      // map (where loc_* always lives), fall back to pre-voyage map.
      const labelY = laneGeometry.voyage.y.get(branchId) ?? laneGeometry.pre.y.get(branchId);
      if (labelY === undefined) continue;
      segments.push({
        branchId,
        branch,
        d: branchPolylinePath(visible.length ? visible : branchNodes),
        labelY,
        future: visible.length === 0,
      });
    }
    return segments;
  }, [nodes, branches, layout, minEpisode, maxEpisode, laneGeometry]);

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

  /** Voyage entry edges: for each character node with voyageLocation set whose
   *  own episode is pre-voyage, draw a faint curve from that pre-voyage node
   *  to where its location lane starts (at voyage begin x). Visualizes the
   *  character moving into a specific room/area when the voyage starts. */
  const voyageEntryEdges = useMemo(() => {
    let voyageXMin = Infinity;
    for (const n of nodes) {
      if (n.episode >= 358 && n.episode <= 410 && n.x < voyageXMin) voyageXMin = n.x;
    }
    if (voyageXMin === Infinity) return [];
    const edges: {
      key: string;
      d: string;
      color: string;
      title: string;
      detail: string;
      episode: number;
      fromNodeId?: string;
      toNodeId?: string;
      fromLabel?: string;
      toLabel?: string;
    }[] = [];
    for (const n of nodes) {
      if (!n.voyageLocation) continue;
      if (n.episode >= 358) continue;
      const srcPos = posById.get(n.id);
      if (!srcPos) continue;
      const laneY = laneGeometry.voyage.y.get(n.voyageLocation);
      if (laneY === undefined) continue;
      const color = branches[n.voyageLocation]?.color ?? '#888';
      const locName = branches[n.voyageLocation]?.name ?? n.voyageLocation;
      edges.push({
        key: `voy-entry-${n.id}`,
        d: edgePath(srcPos.x, srcPos.y, voyageXMin - 8, laneY),
        color,
        title: `船上着任 / Voyage Entry`,
        detail: `${n.label} → ${locName}`,
        episode: 358,
        fromNodeId: n.id,
        fromLabel: n.label,
        toLabel: locName,
      });
    }
    return edges;
  }, [nodes, posById, branches, laneGeometry]);

  /** Participation edges: for each event with participants[], draw a thin
   *  curved line from each participant's nearest pre-event node to the event,
   *  visualizing convergence. */
  const participationEdges = useMemo(() => {
    const edges: {
      key: string;
      d: string;
      color: string;
      title: string;
      detail: string;
      episode: number;
      fromNodeId?: string;
      toNodeId?: string;
      fromLabel?: string;
      toLabel?: string;
    }[] = [];
    for (const ev of nodes) {
      if (ev.kind !== 'event' || !ev.participants?.length) continue;
      if (isFuture(ev)) continue;
      const evPos = posById.get(ev.id);
      if (!evPos) continue;
      for (const pid of ev.participants) {
        const p = nodesById[pid];
        if (!p) continue;
        const sameBranch = nodes.filter(
          (n) => n.branchId === p.branchId && n.x <= evPos.x && n.id !== ev.id,
        );
        const src = sameBranch.length
          ? sameBranch.reduce((a, b) => (a.x > b.x ? a : b))
          : nodesById[pid];
        if (!src || src.id === ev.id) continue;
        const srcPos = posById.get(src.id);
        if (!srcPos) continue;
        const color = branches[p.branchId]?.color ?? '#888';
        edges.push({
          key: `part-${ev.id}-${pid}`,
          d: edgePath(srcPos.x, srcPos.y, evPos.x, evPos.y),
          color,
          title: `登場 / Participation`,
          detail: `${p.label} → ${ev.label}`,
          episode: ev.episode,
          fromNodeId: p.id,
          toNodeId: ev.id,
          fromLabel: p.label,
          toLabel: ev.label,
        });
      }
    }
    return edges;
  }, [nodes, nodesById, posById, branches, minEpisode, maxEpisode]);

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

  /** Location lane bands: for each location branch with at least one visible node,
   *  compute (xMin..xMax, yMin..yMax) so we can draw a horizontal separator + a
   *  faint background label of the location name. */
  const locationBands = useMemo(() => {
    // x range: starts at smallest x of any voyage node (ep >= 358), extends to graph right.
    let voyageXMin = Infinity;
    let graphXMax = -Infinity;
    for (const n of nodes) {
      if (n.x > graphXMax) graphXMax = n.x;
      if (n.episode >= 358 && n.episode <= 410 && n.x < voyageXMin) voyageXMin = n.x;
    }
    if (voyageXMin === Infinity) return [];
    const bands: {
      branchId: string;
      label: string;
      x1: number;
      x2: number;
      yTop: number;
      yBottom: number;
      yMid: number;
    }[] = [];
    for (const id of Object.keys(branches)) {
      if (!id.startsWith('loc_')) continue;
      const laneY = laneGeometry.voyage.y.get(id);
      const laneH = laneGeometry.voyage.height.get(id);
      if (laneY === undefined || laneH === undefined) continue;
      const lh = laneH / 2;
      bands.push({
        branchId: id,
        label: branches[id].name,
        x1: voyageXMin - 20,
        x2: graphXMax + 40,
        yTop: laneY - lh + 2,
        yBottom: laneY + lh - 2,
        yMid: laneY,
      });
    }
    return bands;
  }, [nodes, branches, layout, laneGeometry]);

  const sceneClass = ['scene', lod !== 'normal' ? `lod-${lod}` : '', hasSelection ? 'has-sel' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <g className={sceneClass}>
      {/* Location bands: solid separator lines + repeated label (left outside,
          center, right outside) so the lane is identifiable wherever the user pans. */}
      {locationBands.map((b) => (
        <g key={`loc-band-${b.branchId}`} className="loc-band">
          <line x1={b.x1} x2={b.x2} y1={b.yTop} y2={b.yTop} className="loc-band-sep" />
          <line x1={b.x1} x2={b.x2} y1={b.yBottom} y2={b.yBottom} className="loc-band-sep" />
          <text x={b.x1 - 20} y={b.yMid + 8} className="loc-band-label" textAnchor="end">
            {b.label}
          </text>
          <text x={(b.x1 + b.x2) / 2} y={b.yMid + 8} className="loc-band-label" textAnchor="middle">
            {b.label}
          </text>
          <text x={b.x2 + 20} y={b.yMid + 8} className="loc-band-label" textAnchor="start">
            {b.label}
          </text>
        </g>
      ))}
      {voyageDayGuides.map((g) => (
        <g
          key={`vday-${g.day}`}
          className="voyage-day"
          onClick={() => onSelectDay?.(g.day, g.label)}
          style={{ cursor: onSelectDay ? 'pointer' : 'default' }}
        >
          <line x1={g.x} x2={g.x} y1={g.y1} y2={g.y2} className="voyage-day-line" />
          <text x={g.x} y={g.y1 - 4} className="voyage-day-label" textAnchor="middle">
            {g.label}
          </text>
          {/* invisible hit area for easier clicking */}
          <rect
            x={g.x - 60}
            y={g.y1 - 28}
            width={120}
            height={28}
            fill="transparent"
            pointerEvents="all"
          />
        </g>
      ))}
      {branchSegments.map(({ branchId, branch, d, labelY, future }) => {
        const isLoc = branchId.startsWith('loc_');
        return (
          <g
            key={`lane-${branchId}`}
            className={`${future ? 'future' : ''} ${isLoc ? 'loc-lane' : ''}`.trim() || undefined}
          >
            <path className="lane" d={d} fill="none" stroke={branch.color} {...STROKE} />
            {showBranchLabels && (
              <text
                className={`lbl lbl-lane ${isLoc ? 'lbl-loc' : ''}`.trim()}
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
        );
      })}

      {voyageEntryEdges.map(({ key, d, color }) => (
        <g key={`vye-${key}`}>
          <path className="edge voyage-entry" d={d} stroke={color} fill="none" />
        </g>
      ))}

      {participationEdges.map(({ key, d, color }) => (
        <g key={`pe-${key}`}>
          <path className="edge participation" d={d} stroke={color} fill="none" />
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
            onClick={() => {
              if (!onSelectEdge) return;
              onSelectEdge({
                key: edge.key,
                title: edge.title,
                detail: edge.detail,
                episodeLabel: formatEpisodeBilingual(meta.version, meta.versionEn, edge.episode),
                kindLabel: edgeKindLabel(edge.kind, meta),
                color: edge.color,
              });
            }}
          />
        );
      })}

      {/* Hit areas for participation + voyage-entry edges (auxiliary edges). */}
      {[...participationEdges, ...voyageEntryEdges].map((edge) => {
        const epLabel = formatEpisodeBilingual(meta.version, meta.versionEn, edge.episode);
        return (
          <path
            key={`hit-aux-${edge.key}`}
            className="edge-hit"
            d={edge.d}
            onMouseEnter={() =>
              onHover({
                target: 'edge',
                edgeKey: edge.key,
                title: edge.title,
                detail: edge.detail,
                episodeLabel: epLabel,
                kindLabel: edge.title,
                color: edge.color,
              })
            }
            onMouseLeave={() => onHover(null)}
            onClick={() => {
              if (!onSelectEdge) return;
              onSelectEdge({
                key: edge.key,
                title: edge.title,
                detail: edge.detail,
                episodeLabel: epLabel,
                kindLabel: edge.title,
                color: edge.color,
                fromNodeId: edge.fromNodeId,
                toNodeId: edge.toNodeId,
                fromLabel: edge.fromLabel,
                toLabel: edge.toLabel,
              });
            }}
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

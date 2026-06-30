import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { BottomSheet } from './components/BottomSheet';
import { DetailCard } from './components/DetailCard';
import { EdgeCard } from './components/EdgeCard';
import { DayCard } from './components/DayCard';
import { EpisodeSlider } from './components/EpisodeSlider';
import { GraphScene } from './components/GraphScene';
import { GraphTooltip, type HoverPayload } from './components/GraphTooltip';
import { MobileBottomBar } from './components/MobileBottomBar';
import { NodeListPanel } from './components/NodeListPanel';
import { graphData } from './data/loadGraph';
import { usePanZoom } from './hooks/usePanZoom';
import { computeLayout, type PositionedNode } from './utils/layout';
import { bilingualBlock, bilingualInline } from './utils/bilingual';
import { computeFitTransform, getVisibleBounds } from './utils/fitBounds';

type SheetId = null | 'list' | 'episodes';

function useIsMobile() {
  const [isMobile, set] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 759px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 759px)');
    const onChange = () => set(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

const { meta, branches, nodes: rawNodes, nodesById } = graphData;
const layout = meta.layout;

const positionedNodes: PositionedNode[] = computeLayout(rawNodes, branches, layout);

/** memberId -> list of group node ids that contain it (direct only). */
const groupsByMemberId: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const node of rawNodes) {
    if (node.kind !== 'group' || !node.members) continue;
    for (const mid of node.members) (m[mid] ??= []).push(node.id);
  }
  return m;
})();

/** groupId -> ordered list of ancestor group ids (transitive parents). */
const groupAncestors: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  const visit = (gid: string, seen: Set<string>): string[] => {
    if (m[gid]) return m[gid];
    if (seen.has(gid)) return [];
    seen.add(gid);
    const g = rawNodes.find((x) => x.id === gid);
    if (!g || g.kind !== 'group') return (m[gid] = []);
    const out: string[] = [];
    for (const p of g.parents ?? []) {
      if (!out.includes(p)) out.push(p);
      for (const a of visit(p, seen)) if (!out.includes(a)) out.push(a);
    }
    return (m[gid] = out);
  };
  for (const node of rawNodes) if (node.kind === 'group') visit(node.id, new Set());
  return m;
})();

/** groupId -> direct child group ids (reverse of parents). */
const subgroupsByGroupId: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const node of rawNodes) {
    if (node.kind !== 'group') continue;
    for (const p of node.parents ?? []) (m[p] ??= []).push(node.id);
  }
  return m;
})();

/** characterId -> list of event node ids in which they participate (reverse of event.participants). */
const eventsByParticipantId: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const node of rawNodes) {
    if (node.kind !== 'event' || !node.participants) continue;
    for (const cid of node.participants) (m[cid] ??= []).push(node.id);
  }
  return m;
})();

/** Normalize a label / affiliation string for fuzzy matching: strip `＝` and `=`
 *  so that「キメラ＝アント」 ≡ 「キメラアント」 and 「ヒソカ＝モロウ」 ≡ 「ヒソカモロウ」. */
function normalizeLabel(s: string): string {
  return s.replace(/[＝=]/g, '');
}

/**
 * Resolve an affiliation string to a navigable node id (group or character).
 * Priority (later wins):
 *  1. Character prefix-before-`＝` match (normalized)
 *  2. Queen alias: `◯◯王妃` -> character starting with `◯◯＝`
 *  3. Exact character label (normalized — so 「キメラアント」 matches 「キメラ＝アント」)
 *  4. Exact group label (normalized)
 *
 * Exposed as a plain { label -> id } map; consumer normalizes the lookup key
 * via `normalizeLabel` before access.
 */
const groupIdByLabel: Record<string, string> = (() => {
  const byGroupExact: Record<string, string> = {};
  const byCharExact: Record<string, string> = {};
  const byCharPrefix: Record<string, string> = {};
  const byQueenAlias: Record<string, string> = {};
  for (const node of rawNodes) {
    if (!node.label) continue;
    const norm = normalizeLabel(node.label);
    if (node.kind === 'group') {
      byGroupExact[node.label] = node.id;
      byGroupExact[norm] = node.id;
    } else if (node.kind === 'character') {
      byCharExact[node.label] = node.id;
      byCharExact[norm] = node.id;
      const sep = node.label.indexOf('＝');
      if (sep > 0) {
        const prefix = node.label.slice(0, sep);
        byCharPrefix[prefix] = node.id;
        byCharPrefix[normalizeLabel(prefix)] = node.id;
        if ((node.description || '').match(/第[一二三四五六七八九]王妃/)) {
          byQueenAlias[`${prefix}王妃`] = node.id;
        }
      }
    }
  }
  return { ...byCharPrefix, ...byQueenAlias, ...byCharExact, ...byGroupExact };
})();

export { normalizeLabel };

type CardSel =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; edge: import('./components/EdgeCard').SelectedEdge }
  | { kind: 'day'; day: number; label: string };

function cardSelLabel(sel: CardSel, nodesById: Record<string, import('./types/graph').GraphNode>): string {
  if (sel.kind === 'node') return nodesById[sel.id]?.label ?? sel.id;
  if (sel.kind === 'edge') return sel.edge.title;
  return sel.label;
}

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<import('./components/EdgeCard').SelectedEdge | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ day: number; label: string } | null>(null);
  const [cardHistory, setCardHistory] = useState<CardSel[]>([]);
  const [activeArc, setActiveArc] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [minEpisode, setMinEpisode] = useState(1);
  const [maxEpisode, setMaxEpisode] = useState(meta.version.max);
  const [hover, setHover] = useState<HoverPayload | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [openSheet, setOpenSheet] = useState<SheetId>(null);
  const [cameFromList, setCameFromList] = useState(false);
  const initializedRef = useRef(false);
  // The re-anchor useEffect below watches [minEpisode, maxEpisode, openSheet]
  // and runs on every dependency change — including the very first mount,
  // which would otherwise overwrite the initial `fit({ initial: true })`
  // call with a regular center-anchored fit(). Skip the first run.
  const skipNextReanchorRef = useRef(true);
  const isMobile = useIsMobile();

  const tappedIdRef = useRef<string | null>(null);

  const handleTap = useCallback(
    (clientX: number, clientY: number) => {
      let target = document.elementFromPoint(clientX, clientY);
      while (target) {
        if (target instanceof Element && target.classList.contains('node')) {
          if (target.classList.contains('future')) return;
          const id = target.closest('[data-id]')?.getAttribute('data-id');
          if (!id) break;
          // On desktop (hover-capable), a tap goes straight to the detail card.
          if (!isMobile) {
            setCardHistory([]);
            setSelectedEdge(null);
            setSelectedDay(null);
            setSelectedId(id);
            return;
          }
          // On mobile: first tap shows the tooltip; a second tap on the same
          // node opens the detail card.
          if (tappedIdRef.current === id) {
            tappedIdRef.current = null;
            setHover(null);
            setCardHistory([]);
            setSelectedEdge(null);
            setSelectedDay(null);
            setSelectedId(id);
            return;
          }
          tappedIdRef.current = id;
          const node = nodesById[id];
          const branch = branches[node.branchId];
          // Lazy-build a payload similar to GraphScene hover.
          import('./utils/hoverInfo').then(({ buildNodeHoverInfo }) => {
            const info = buildNodeHoverInfo(node, branch, meta);
            setHover({
              target: 'node',
              nodeId: id,
              title: info.title,
              detail: info.detail,
              episodeLabel: info.episodeLabel,
              badges: [info.branchName, info.kindLabel, info.typeLabel],
              color: info.color,
            });
            setHoverPos({ x: clientX, y: clientY });
          });
          return;
        }
        target = target.parentElement;
      }
      tappedIdRef.current = null;
      setHover(null);
      setCardHistory([]);
      setSelectedEdge(null);
      setSelectedDay(null);
      setSelectedId(null);
    },
    [isMobile],
  );

  const panZoom = usePanZoom({ onTap: handleTap });

  const fit = useCallback((options: { initial?: boolean } = {}) => {
    const stage = panZoom.stageRef.current;
    if (!stage) return;
    const bounds = getVisibleBounds(positionedNodes, branches, layout, minEpisode, maxEpisode);
    if (!bounds) return;
    // On mobile, when a bottom sheet is open it covers ~70dvh; subtract that
    // so right-anchored content lands in the visible upper portion.
    const footerH = isMobile && openSheet ? Math.round(stage.clientHeight * 0.7) : 0;
    // Initial fit: anchor top-right (Day N labels at the top, latest voyage
    // content in the upper-right corner). On desktop we also raise the scale
    // floor so node/edge labels are immediately readable; on mobile the
    // viewport is too narrow to keep the same floor without pushing the
    // graph off-screen, so we fall back to the standard FIT_MIN_SCALE — the
    // voyage-day labels stay readable via the LOD overview font-size bump.
    // Subsequent fits (episode-range changes, arc focus, "全体表示" button)
    // keep the existing center+overview behavior.
    const alignY = options.initial ? 'top' : 'center';
    const scaleMin = options.initial && !isMobile ? 0.7 : undefined;
    panZoom.applyTransform(
      computeFitTransform(bounds, stage.clientWidth, stage.clientHeight, 118, 'right', footerH, alignY, scaleMin),
    );
  }, [panZoom, minEpisode, maxEpisode, isMobile, openSheet]);

  useEffect(() => {
    const stage = panZoom.stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => panZoom.handleWheel(e);
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [panZoom]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fit({ initial: true });
    const timer = window.setTimeout(() => setShowHint(false), 4200);
    return () => window.clearTimeout(timer);
  }, [fit]);

  // Re-anchor latest episode to the right edge when the episode range slider
  // moves or when the mobile bottom sheet opens/closes (the visible viewport
  // changes shape, so the right-anchor target shifts).
  useEffect(() => {
    if (skipNextReanchorRef.current) {
      skipNextReanchorRef.current = false;
      return;
    }
    if (!initializedRef.current) return;
    fit();
    // intentionally omit `fit` to avoid loops; fit() reads latest state via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minEpisode, maxEpisode, openSheet]);

  useEffect(() => {
    if (!selectedId) return;
    const node = nodesById[selectedId];
    if (node && (node.episode > maxEpisode || node.episode < minEpisode)) setSelectedId(null);
  }, [minEpisode, maxEpisode, selectedId]);

  /** Minimum on-screen scale that keeps node/edge labels readable.
   *  Sits just above the LOD `compact` cutoff (0.55) so node labels stay rendered. */
  const MIN_READABLE_SCALE = 0.7;

  /** Center the given world-space point in the visible area, bumping scale to
   *  MIN_READABLE_SCALE if currently zoomed out further than that.
   *  On mobile, the focus target is placed in the upper portion of the screen
   *  so it stays visible above the 70dvh Bottom Sheet (#card). */
  const focusPointOnStage = useCallback(
    (x: number, y: number) => {
      const stage = panZoom.stageRef.current;
      if (!stage) return;
      const vw = stage.clientWidth;
      const vh = stage.clientHeight;
      const isWide = vw >= 760;
      const tgx = isWide ? vw * 0.34 : vw * 0.5;
      const tgy = isWide ? vh * 0.5 : vh * 0.18;
      const nextScale = Math.max(panZoom.scale, MIN_READABLE_SCALE);
      panZoom.applyTransform({
        scale: nextScale,
        tx: tgx - x * nextScale,
        ty: tgy - y * nextScale,
      });
    },
    [panZoom],
  );

  const focusNodeOnStage = useCallback(
    (node: PositionedNode) => focusPointOnStage(node.x, node.y),
    [focusPointOnStage],
  );

  /** Fit a world-space bounding box into the area NOT covered by the selected
   *  card. On desktop the card is a 340px right-anchored overlay; on mobile
   *  it's a Bottom Sheet covering ~70dvh. Used for Day / Edge focus where the
   *  target spans multiple lanes and a single-point focus would push parts
   *  off-screen. */
  const focusBoundsOnStage = useCallback(
    (bounds: { minX: number; maxX: number; minY: number; maxY: number }) => {
      const stage = panZoom.stageRef.current;
      if (!stage) return;
      const padX = 32;
      const padY = 24;
      const headerH = 118;
      // Card overlay reservations (must match #card CSS rules in App.css)
      const reservedRight = !isMobile ? 360 : 0;
      const footerH = isMobile ? Math.round(stage.clientHeight * 0.7) : 0;
      const availW = stage.clientWidth - reservedRight - padX * 2;
      const availH = stage.clientHeight - headerH - footerH - padY * 2;
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      if (availW <= 0 || availH <= 0 || width <= 0 || height <= 0) return;
      const scaleX = availW / width;
      const scaleY = availH / height;
      // Allow zooming in past MIN_READABLE_SCALE for small targets (single
      // edge / tight day cluster), but never zoom out below FIT_MIN_SCALE.
      const scale = Math.max(0.28, Math.min(scaleX, scaleY, 2.0));
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      // Center of the usable area
      const targetCx = padX + availW / 2;
      const targetCy = headerH + padY + availH / 2;
      panZoom.applyTransform({
        scale,
        tx: targetCx - cx * scale,
        ty: targetCy - cy * scale,
      });
    },
    [panZoom, isMobile],
  );

  /** Focus the visible area on the bounding box of an edge's from/to nodes. */
  const focusEdgeOnStage = useCallback(
    (edge: import('./components/EdgeCard').SelectedEdge) => {
      const from = edge.fromNodeId ? positionedNodes.find((n) => n.id === edge.fromNodeId) : null;
      const to = edge.toNodeId ? positionedNodes.find((n) => n.id === edge.toNodeId) : null;
      const endpoints = [from, to].filter((n): n is PositionedNode => !!n);
      if (endpoints.length === 0) return;
      const pad = 80; // world-space padding so endpoints sit comfortably inside
      const xs = endpoints.map((n) => n.x);
      const ys = endpoints.map((n) => n.y);
      focusBoundsOnStage({
        minX: Math.min(...xs) - pad,
        maxX: Math.max(...xs) + pad,
        minY: Math.min(...ys) - pad,
        maxY: Math.max(...ys) + pad,
      });
    },
    [focusBoundsOnStage],
  );

  /** Focus the bounding box of nodes for the given voyage day. */
  const focusDayOnStage = useCallback(
    (day: number) => {
      const dayNodes = positionedNodes.filter((n) => n.day === day);
      if (dayNodes.length === 0) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of dayNodes) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
      const pad = 100; // world-space padding so the cluster has breathing room
      focusBoundsOnStage({
        minX: minX - pad,
        maxX: maxX + pad,
        minY: minY - pad,
        maxY: maxY + pad,
      });
    },
    [focusBoundsOnStage],
  );

  const selectNode = useCallback(
    (id: string) => {
      const node = positionedNodes.find((n) => n.id === id);
      if (!node || node.episode > maxEpisode || node.episode < minEpisode) return;
      setCardHistory([]);
      setSelectedEdge(null);
      setSelectedDay(null);
      setSelectedId(id);
      focusNodeOnStage(node);
    },
    [minEpisode, maxEpisode, focusNodeOnStage],
  );

  const navigateToNode = useCallback(
    (id: string) => {
      const node = positionedNodes.find((n) => n.id === id);
      if (!node) return;
      setActiveArc(null);
      if (node.episode > maxEpisode) setMaxEpisode(node.episode);
      if (node.episode < minEpisode) setMinEpisode(node.episode);
      setSelectedId(id);
      focusNodeOnStage(node);
    },
    [minEpisode, maxEpisode, focusNodeOnStage],
  );

  /** Push the currently-open card onto history, then open the new card.
   *  Used for card-internal navigation (e.g. DayCard → DetailCard). */
  const navigateFromCard = useCallback(
    (next: CardSel) => {
      const current: CardSel | null = selectedId
        ? { kind: 'node', id: selectedId }
        : selectedEdge
        ? { kind: 'edge', edge: selectedEdge }
        : selectedDay
        ? { kind: 'day', day: selectedDay.day, label: selectedDay.label }
        : null;
      if (current) setCardHistory((h) => [...h, current]);
      if (next.kind === 'node') {
        setSelectedEdge(null);
        setSelectedDay(null);
        navigateToNode(next.id);
      } else if (next.kind === 'edge') {
        setSelectedId(null);
        setSelectedDay(null);
        setSelectedEdge(next.edge);
        focusEdgeOnStage(next.edge);
      } else {
        setSelectedId(null);
        setSelectedEdge(null);
        setSelectedDay({ day: next.day, label: next.label });
        focusDayOnStage(next.day);
      }
    },
    [selectedId, selectedEdge, selectedDay, navigateToNode, focusEdgeOnStage, focusDayOnStage],
  );

  const goBack = useCallback(() => {
    setCardHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      if (prev.kind === 'node') {
        setSelectedEdge(null);
        setSelectedDay(null);
        const node = positionedNodes.find((n) => n.id === prev.id);
        if (node) {
          setMinEpisode((min) => Math.min(min, node.episode));
          setMaxEpisode((max) => Math.max(max, node.episode));
        }
        setSelectedId(prev.id);
        if (node) focusNodeOnStage(node);
      } else if (prev.kind === 'edge') {
        setSelectedId(null);
        setSelectedDay(null);
        setSelectedEdge(prev.edge);
        focusEdgeOnStage(prev.edge);
      } else {
        setSelectedId(null);
        setSelectedEdge(null);
        setSelectedDay({ day: prev.day, label: prev.label });
        focusDayOnStage(prev.day);
      }
      return h.slice(0, -1);
    });
  }, [focusNodeOnStage, focusEdgeOnStage, focusDayOnStage]);

  const deselect = useCallback(() => setSelectedId(null), []);

  const focusArc = useCallback(
    (arc: string) => {
      setActiveArc(arc);
      setSelectedId(null);
      const arcNodes = positionedNodes.filter((n) => n.arcs.includes(arc));
      if (!arcNodes.length) return;
      const stage = panZoom.stageRef.current;
      if (!stage) return;
      const range = meta.arcEpisodes[arc];
      const startEp = range?.start ?? minEpisode;
      const endEp = range?.end ?? maxEpisode;
      const bounds = getVisibleBounds(arcNodes, branches, layout, startEp, endEp);
      if (!bounds) return;
      panZoom.applyTransform(computeFitTransform(bounds, stage.clientWidth, stage.clientHeight));
      if (range) {
        setMinEpisode(range.start);
        setMaxEpisode(range.end);
      }
    },
    [panZoom, minEpisode, maxEpisode],
  );

  const selectedNode = selectedId ? nodesById[selectedId] : null;
  const selectedBranch = selectedNode ? branches[selectedNode.branchId] : null;

  const hoverNodeId = hover?.target === 'node' ? hover.nodeId : null;
  const hoverEdgeKey = hover?.target === 'edge' ? hover.edgeKey : null;

  const handleStageMouseMove = useCallback((e: React.MouseEvent) => {
    setHoverPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleHover = useCallback((payload: HoverPayload | null) => {
    setHover(payload);
  }, []);

  const arcChips = useMemo(
    () =>
      meta.arcOrder
        .map((arc) => {
          const count = positionedNodes.filter((n) => n.arcs.includes(arc)).length;
          return count ? arc : null;
        })
        .filter(Boolean) as string[],
    [],
  );

  const episodeArcsBlock = (
    <>
      <EpisodeSlider
        version={meta.version}
        ui={meta.ui}
        uiEn={meta.uiEn}
        minValue={minEpisode}
        maxValue={maxEpisode}
        onMinChange={setMinEpisode}
        onMaxChange={setMaxEpisode}
      />
      <div className="arcs">
        {arcChips.map((arc) => (
          <button
            key={arc}
            type="button"
            className={activeArc === arc ? 'chip on' : 'chip'}
            onClick={() => {
              focusArc(arc);
              if (isMobile) setOpenSheet(null);
            }}
          >
            <span className="chip-ja">{arc}</span>
            {meta.arcLabelsEn?.[arc] && meta.arcLabelsEn[arc] !== arc && (
              <span className="chip-en">{meta.arcLabelsEn[arc]}</span>
            )}
          </button>
        ))}
      </div>
    </>
  );

  const handleNavigateAndClose = useCallback(
    (id: string) => {
      navigateToNode(id);
      if (isMobile) {
        setOpenSheet(null);
        setCameFromList(true);
      }
    },
    [navigateToNode, isMobile],
  );

  const handleBackToList = useCallback(() => {
    setSelectedId(null);
    setOpenSheet('list');
  }, []);

  return (
    <>
      <header className={isMobile ? 'compact' : ''}>
        <div className="ttl">
          <span className="hi">
            H<b>×</b>H 系統樹
            {meta.titleEn && <span className="hi-en"> / {meta.titleEn}</span>}
          </span>
          {!isMobile && (
            <span className="sub">{bilingualInline(meta.subtitle, meta.subtitleEn)}</span>
          )}
        </div>
        {!isMobile && episodeArcsBlock}
      </header>

      {!isMobile && (
        <div className="ctrls">
          <button type="button" onClick={panZoom.zoomIn} aria-label="拡大">
            ＋
          </button>
          <button type="button" onClick={panZoom.zoomOut} aria-label="縮小">
            －
          </button>
          <button
            type="button"
            onClick={() => {
              deselect();
              fit();
            }}
            aria-label="全体表示"
          >
            ⤢
          </button>
        </div>
      )}

      {!isMobile && (
        <NodeListPanel
          nodes={positionedNodes}
          branches={branches}
          meta={meta}
          minEpisode={minEpisode}
          maxEpisode={maxEpisode}
          selectedId={selectedId}
          onSelectNode={navigateToNode}
        />
      )}

      <div
        id="stage"
        ref={panZoom.stageRef}
        onMouseMove={handleStageMouseMove}
        onPointerDown={panZoom.handlePointerDown}
        onPointerMove={panZoom.handlePointerMove}
        onPointerUp={panZoom.endPointer}
        onPointerCancel={panZoom.endPointer}
      >
        <svg id="svg">
          <g
            transform={`translate(${panZoom.tx},${panZoom.ty}) scale(${panZoom.scale})`}
          >
            <GraphScene
              nodes={positionedNodes}
              branches={branches}
              nodesById={nodesById}
              meta={meta}
              minEpisode={minEpisode}
              maxEpisode={maxEpisode}
              scale={panZoom.scale}
              selectedId={selectedId}
              hoverNodeId={hoverNodeId}
              hoverEdgeKey={hoverEdgeKey}
              hasSelection={selectedId !== null}
              onSelectNode={selectNode}
              onSelectEdge={(e) => { setCardHistory([]); setSelectedId(null); setSelectedDay(null); setSelectedEdge(e); focusEdgeOnStage(e); }}
              onSelectDay={(d, l) => { setCardHistory([]); setSelectedId(null); setSelectedEdge(null); setSelectedDay({ day: d, label: l }); focusDayOnStage(d); }}
              onHover={handleHover}
            />
          </g>
        </svg>
      </div>

      {hover && <GraphTooltip payload={hover} x={hoverPos.x} y={hoverPos.y} />}

      {showHint && (
        <div className={`hint${showHint ? '' : ' hidden'}`}>
          {bilingualBlock(meta.ui?.hint ?? '', meta.uiEn?.hint)}
        </div>
      )}

      {selectedNode && selectedBranch && (
        <DetailCard
          node={selectedNode}
          branch={selectedBranch}
          branches={branches}
          meta={meta}
          nodesById={nodesById}
          groupsByMemberId={groupsByMemberId}
          groupIdByLabel={groupIdByLabel}
          groupAncestors={groupAncestors}
          subgroupsByGroupId={subgroupsByGroupId}
          eventsByParticipantId={eventsByParticipantId}
          open={selectedId !== null}
          onClose={() => { setCardHistory([]); deselect(); setCameFromList(false); }}
          onSelectNode={(id) => navigateFromCard({ kind: 'node', id })}
          onBackToList={isMobile && cameFromList && cardHistory.length === 0 ? handleBackToList : undefined}
          onBack={cardHistory.length > 0 ? goBack : undefined}
          backLabel={cardHistory.length > 0 ? cardSelLabel(cardHistory[cardHistory.length - 1], nodesById) : undefined}
        />
      )}

      {selectedEdge && !selectedNode && !selectedDay && (
        <EdgeCard
          edge={selectedEdge}
          nodesById={nodesById}
          open={true}
          onClose={() => { setCardHistory([]); setSelectedEdge(null); }}
          onSelectNode={(id) => navigateFromCard({ kind: 'node', id })}
          onBack={cardHistory.length > 0 ? goBack : undefined}
          backLabel={cardHistory.length > 0 ? cardSelLabel(cardHistory[cardHistory.length - 1], nodesById) : undefined}
        />
      )}

      {selectedDay && !selectedNode && !selectedEdge && (
        <DayCard
          day={selectedDay.day}
          label={selectedDay.label}
          nodes={rawNodes.filter((n) => n.day === selectedDay.day)}
          open={true}
          onClose={() => { setCardHistory([]); setSelectedDay(null); }}
          onSelectNode={(id) => navigateFromCard({ kind: 'node', id })}
          onBack={cardHistory.length > 0 ? goBack : undefined}
          backLabel={cardHistory.length > 0 ? cardSelLabel(cardHistory[cardHistory.length - 1], nodesById) : undefined}
        />
      )}

      {isMobile && (
        <>
          <MobileBottomBar
            onOpenList={() => setOpenSheet((s) => (s === 'list' ? null : 'list'))}
            onOpenEpisodes={() => setOpenSheet((s) => (s === 'episodes' ? null : 'episodes'))}
            onZoomIn={panZoom.zoomIn}
            onZoomOut={panZoom.zoomOut}
            onFit={() => { deselect(); fit(); }}
          />
          <BottomSheet open={openSheet === 'list'} onClose={() => setOpenSheet(null)} title="ノード一覧 / Nodes">
            <NodeListPanel
              nodes={positionedNodes}
              branches={branches}
              meta={meta}
              minEpisode={minEpisode}
              maxEpisode={maxEpisode}
              selectedId={selectedId}
              onSelectNode={handleNavigateAndClose}
            />
          </BottomSheet>
          <BottomSheet open={openSheet === 'episodes'} onClose={() => setOpenSheet(null)} title="話数 / アーク">
            {episodeArcsBlock}
          </BottomSheet>
        </>
      )}
    </>
  );
}

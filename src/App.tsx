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

  const fit = useCallback(() => {
    const stage = panZoom.stageRef.current;
    if (!stage) return;
    const bounds = getVisibleBounds(positionedNodes, branches, layout, minEpisode, maxEpisode);
    if (!bounds) return;
    // On mobile, when a bottom sheet is open it covers ~70dvh; subtract that
    // so right-anchored content lands in the visible upper portion.
    const footerH = isMobile && openSheet ? Math.round(stage.clientHeight * 0.7) : 0;
    panZoom.applyTransform(
      computeFitTransform(bounds, stage.clientWidth, stage.clientHeight, 118, 'right', footerH),
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
    fit();
    const timer = window.setTimeout(() => setShowHint(false), 4200);
    return () => window.clearTimeout(timer);
  }, [fit]);

  // Re-anchor latest episode to the right edge when the episode range slider
  // moves or when the mobile bottom sheet opens/closes (the visible viewport
  // changes shape, so the right-anchor target shifts).
  useEffect(() => {
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

  const focusNodeOnStage = useCallback(
    (node: PositionedNode) => {
      const stage = panZoom.stageRef.current;
      if (!stage) return;
      const vw = stage.clientWidth;
      const vh = stage.clientHeight;
      const isWide = vw >= 760;
      const tgx = isWide ? vw * 0.34 : vw * 0.5;
      const tgy = isWide ? vh * 0.5 : vh * 0.36;
      panZoom.setTransform({
        tx: tgx - node.x * panZoom.scale,
        ty: tgy - node.y * panZoom.scale,
      });
    },
    [panZoom],
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
      } else {
        setSelectedId(null);
        setSelectedEdge(null);
        setSelectedDay({ day: next.day, label: next.label });
      }
    },
    [selectedId, selectedEdge, selectedDay, navigateToNode],
  );

  const goBack = useCallback(() => {
    setCardHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      if (prev.kind === 'node') {
        setSelectedEdge(null);
        setSelectedDay(null);
        const node = positionedNodes.find((n) => n.id === prev.id);
        setSelectedId(prev.id);
        if (node) focusNodeOnStage(node);
      } else if (prev.kind === 'edge') {
        setSelectedId(null);
        setSelectedDay(null);
        setSelectedEdge(prev.edge);
      } else {
        setSelectedId(null);
        setSelectedEdge(null);
        setSelectedDay({ day: prev.day, label: prev.label });
      }
      return h.slice(0, -1);
    });
  }, [focusNodeOnStage]);

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
              onSelectEdge={(e) => { setCardHistory([]); setSelectedId(null); setSelectedDay(null); setSelectedEdge(e); }}
              onSelectDay={(d, l) => { setCardHistory([]); setSelectedId(null); setSelectedEdge(null); setSelectedDay({ day: d, label: l }); }}
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

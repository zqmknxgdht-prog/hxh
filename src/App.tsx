import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { DetailCard } from './components/DetailCard';
import { EpisodeSlider } from './components/EpisodeSlider';
import { GraphScene } from './components/GraphScene';
import { GraphTooltip, type HoverPayload } from './components/GraphTooltip';
import { NodeListPanel } from './components/NodeListPanel';
import { graphData } from './data/loadGraph';
import { usePanZoom } from './hooks/usePanZoom';
import { computeLayout, type PositionedNode } from './utils/layout';
import { bilingualBlock, bilingualInline } from './utils/bilingual';
import { computeFitTransform, getVisibleBounds } from './utils/fitBounds';

const { meta, branches, nodes: rawNodes, nodesById } = graphData;
const layout = meta.layout;

const positionedNodes: PositionedNode[] = computeLayout(rawNodes, branches, layout);

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeArc, setActiveArc] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [minEpisode, setMinEpisode] = useState(1);
  const [maxEpisode, setMaxEpisode] = useState(meta.version.max);
  const [hover, setHover] = useState<HoverPayload | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const initializedRef = useRef(false);

  const handleTap = useCallback((clientX: number, clientY: number) => {
    let target = document.elementFromPoint(clientX, clientY);
    while (target) {
      if (target instanceof Element && target.classList.contains('node')) {
        if (target.classList.contains('future')) return;
        const id = target.closest('[data-id]')?.getAttribute('data-id');
        if (id) {
          setSelectedId(id);
          return;
        }
      }
      target = target.parentElement;
    }
    setSelectedId(null);
  }, []);

  const panZoom = usePanZoom({ onTap: handleTap });

  const fit = useCallback(() => {
    const stage = panZoom.stageRef.current;
    if (!stage) return;
    const bounds = getVisibleBounds(positionedNodes, branches, layout, minEpisode, maxEpisode);
    if (!bounds) return;
    panZoom.applyTransform(computeFitTransform(bounds, stage.clientWidth, stage.clientHeight));
  }, [panZoom, minEpisode, maxEpisode]);

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

  return (
    <>
      <header>
        <div className="ttl">
          <span className="hi">
            H<b>×</b>H 系統樹
            {meta.titleEn && <span className="hi-en"> / {meta.titleEn}</span>}
          </span>
          <span className="sub">{bilingualInline(meta.subtitle, meta.subtitleEn)}</span>
        </div>
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
              onClick={() => focusArc(arc)}
            >
              <span className="chip-ja">{arc}</span>
              {meta.arcLabelsEn?.[arc] && meta.arcLabelsEn[arc] !== arc && (
                <span className="chip-en">{meta.arcLabelsEn[arc]}</span>
              )}
            </button>
          ))}
        </div>
      </header>

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

      <NodeListPanel
        nodes={positionedNodes}
        branches={branches}
        meta={meta}
        minEpisode={minEpisode}
        maxEpisode={maxEpisode}
        selectedId={selectedId}
        onSelectNode={navigateToNode}
      />

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
          meta={meta}
          nodesById={nodesById}
          open={selectedId !== null}
          onClose={deselect}
          onSelectNode={navigateToNode}
        />
      )}
    </>
  );
}

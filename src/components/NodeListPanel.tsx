import { useEffect, useMemo, useRef, useState } from 'react';
import type { Branch, GraphMeta } from '../types/graph';
import { bilingualInline } from '../utils/bilingual';
import { formatEpisodeBilingual } from '../utils/formatEpisode';
import type { PositionedNode } from '../utils/layout';

interface CollapsibleListProps {
  titleJa: string;
  titleEn: string;
  nodes: PositionedNode[];
  branches: Record<string, Branch>;
  meta: GraphMeta;
  minEpisode: number;
  maxEpisode: number;
  selectedId: string | null;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  onSelectNode: (id: string) => void;
}

function CollapsibleList({
  titleJa,
  titleEn,
  nodes,
  branches,
  meta,
  minEpisode,
  maxEpisode,
  selectedId,
  defaultOpen = true,
  forceOpen = false,
  onSelectNode,
}: CollapsibleListProps) {
  const [open, setOpen] = useState(defaultOpen);
  const listRef = useRef<HTMLDivElement>(null);
  const effectiveOpen = forceOpen || open;

  useEffect(() => {
    if (!effectiveOpen || !selectedId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-node-id="${selectedId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [effectiveOpen, selectedId]);

  return (
    <section className="node-list-panel">
      <button
        type="button"
        className="node-list-toggle"
        aria-expanded={effectiveOpen}
        onClick={() => setOpen((v) => !v)}
        disabled={forceOpen}
      >
        <span className="node-list-toggle-label">{bilingualInline(titleJa, titleEn)}</span>
        <span className="node-list-count">{nodes.length}</span>
        <span className="node-list-chevron" aria-hidden>
          {effectiveOpen ? '▾' : '▸'}
        </span>
      </button>
      {effectiveOpen && (
        <div className="node-list-body" ref={listRef}>
          {nodes.map((node) => {
            const branch = branches[node.branchId];
            const isFuture = node.episode > maxEpisode || node.episode < minEpisode;
            const isSelected = selectedId === node.id;
            const episodeLabel = formatEpisodeBilingual(meta.version, meta.versionEn, node.episode);

            return (
              <button
                key={node.id}
                type="button"
                data-node-id={node.id}
                className={[
                  'node-list-item',
                  isSelected ? 'on' : '',
                  isFuture ? 'future' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelectNode(node.id)}
              >
                <span
                  className="node-list-swatch"
                  style={{ background: branch?.color ?? '#888' }}
                  aria-hidden
                />
                <span className="node-list-text">
                  <span className="node-list-name">
                    {bilingualInline(node.label, node.labelEn)}
                  </span>
                  <span className="node-list-meta">
                    {node.arcs.map((arc) => bilingualInline(arc, meta.arcLabelsEn?.[arc])).join(' / ')}
                    <span className="node-list-ep">{episodeLabel}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface NodeListPanelProps {
  nodes: PositionedNode[];
  branches: Record<string, Branch>;
  meta: GraphMeta;
  minEpisode: number;
  maxEpisode: number;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}

function sortNodes(a: PositionedNode, b: PositionedNode) {
  if (a.episode !== b.episode) return a.episode - b.episode;
  return a.label.localeCompare(b.label, 'ja');
}

export function NodeListPanel({
  nodes,
  branches,
  meta,
  minEpisode,
  maxEpisode,
  selectedId,
  onSelectNode,
}: NodeListPanelProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase().normalize('NFC');
  const searching = q.length > 0;

  const matches = (n: PositionedNode) => {
    if (!searching) return true;
    const haystacks = [n.label, n.labelEn, n.description, n.descriptionEn, n.id];
    return haystacks.some((s) => s && s.toLowerCase().normalize('NFC').includes(q));
  };

  const characters = useMemo(
    () => nodes.filter((n) => n.kind === 'character' && matches(n)).sort(sortNodes),
    [nodes, q],
  );
  const events = useMemo(
    () => nodes.filter((n) => n.kind === 'event' && matches(n)).sort(sortNodes),
    [nodes, q],
  );
  const others = useMemo(
    () =>
      nodes
        .filter((n) => n.kind !== 'character' && n.kind !== 'event' && matches(n))
        .sort(sortNodes),
    [nodes, q],
  );

  return (
    <aside className="node-lists" aria-label={bilingualInline('ノード一覧', 'Node lists')}>
      <div className="node-search">
        <input
          type="search"
          className="node-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・説明を検索 / Search"
          aria-label={bilingualInline('ノード検索', 'Search nodes')}
        />
        {query && (
          <button
            type="button"
            className="node-search-clear"
            onClick={() => setQuery('')}
            aria-label="クリア"
          >
            ✕
          </button>
        )}
      </div>
      <CollapsibleList
        titleJa="キャラクター一覧"
        titleEn="Characters"
        nodes={characters}
        branches={branches}
        meta={meta}
        minEpisode={minEpisode}
        maxEpisode={maxEpisode}
        selectedId={selectedId}
        defaultOpen
        forceOpen={searching && characters.length > 0}
        onSelectNode={onSelectNode}
      />
      <CollapsibleList
        titleJa="イベント一覧"
        titleEn="Events"
        nodes={events}
        branches={branches}
        meta={meta}
        minEpisode={minEpisode}
        maxEpisode={maxEpisode}
        selectedId={selectedId}
        defaultOpen={false}
        forceOpen={searching && events.length > 0}
        onSelectNode={onSelectNode}
      />
      {(others.length > 0 || searching) && (
        <CollapsibleList
          titleJa="その他"
          titleEn="Other"
          nodes={others}
          branches={branches}
          meta={meta}
          minEpisode={minEpisode}
          maxEpisode={maxEpisode}
          selectedId={selectedId}
          defaultOpen={false}
          forceOpen={searching && others.length > 0}
          onSelectNode={onSelectNode}
        />
      )}
      {searching && characters.length + events.length + others.length === 0 && (
        <div className="node-search-empty">
          {bilingualInline('該当なし', 'No matches')}
        </div>
      )}
    </aside>
  );
}

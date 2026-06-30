import type { GraphNode } from '../types/graph';

export interface SelectedEdge {
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
}

interface EdgeCardProps {
  edge: SelectedEdge;
  nodesById: Record<string, GraphNode>;
  open: boolean;
  onClose: () => void;
  onSelectNode: (id: string) => void;
  /** Optional: when set, render a "back" button that returns to the previous card. */
  onBack?: () => void;
  /** Optional label shown on the back button (e.g. previous card's title). */
  backLabel?: string;
}

export function EdgeCard({ edge, nodesById, open, onClose, onSelectNode, onBack, backLabel }: EdgeCardProps) {
  const fromNode = edge.fromNodeId ? nodesById[edge.fromNodeId] : undefined;
  const toNode = edge.toNodeId ? nodesById[edge.toNodeId] : undefined;
  const fromLabel = fromNode?.label ?? edge.fromLabel;
  const toLabel = toNode?.label ?? edge.toLabel;
  return (
    <div id="card" className={open ? 'open' : ''}>
      <div className="card-top">
        <div className="swatch" style={{ background: edge.color }} />
        <div className="hd">
          <span className="name-ja">{edge.title}</span>
        </div>
        {onBack && (
          <button type="button" className="card-back" onClick={onBack} aria-label="前のカードに戻る / Back">
            ← {backLabel ?? '戻る'}
          </button>
        )}
        <button type="button" className="close" onClick={onClose} aria-label="閉じる / Close">
          ✕
        </button>
        <div className="eyebrow">{edge.kindLabel}</div>
        <div className="version">{edge.episodeLabel}</div>
      </div>
      <div className="card-body">
        {edge.detail && (
          <div className="sec">
            <h4>説明 / Detail</h4>
            <p className="bilingual">{edge.detail}</p>
          </div>
        )}
        {(fromLabel || toLabel) && (
          <div className="sec attrs members">
            <h4>接続 / Connection</h4>
            <ul className="member-list">
              {fromLabel && (
                <li>
                  <span className="bc-sep" aria-hidden>From:</span>{' '}
                  {fromNode ? (
                    <button
                      type="button"
                      className="member-link"
                      onClick={() => onSelectNode(fromNode.id)}
                    >
                      <span className="member-ja">{fromLabel}</span>
                    </button>
                  ) : (
                    <span className="affiliation-plain">{fromLabel}</span>
                  )}
                </li>
              )}
              {toLabel && (
                <li>
                  <span className="bc-sep" aria-hidden>To:</span>{' '}
                  {toNode ? (
                    <button
                      type="button"
                      className="member-link"
                      onClick={() => onSelectNode(toNode.id)}
                    >
                      <span className="member-ja">{toLabel}</span>
                    </button>
                  ) : (
                    <span className="affiliation-plain">{toLabel}</span>
                  )}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

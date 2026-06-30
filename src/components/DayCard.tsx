import type { GraphNode } from '../types/graph';

interface DayCardProps {
  day: number;
  label: string;
  nodes: GraphNode[];
  open: boolean;
  onClose: () => void;
  onSelectNode: (id: string) => void;
  /** Optional: when set, render a "back" button that returns to the previous card. */
  onBack?: () => void;
  /** Optional label shown on the back button (e.g. previous card's title). */
  backLabel?: string;
}

export function DayCard({ day, label, nodes, open, onClose, onSelectNode, onBack, backLabel }: DayCardProps) {
  const events = nodes.filter((n) => n.kind === 'event');
  const characters = nodes.filter((n) => n.kind === 'character');
  const others = nodes.filter((n) => n.kind !== 'event' && n.kind !== 'character');
  void day;
  return (
    <div id="card" className={open ? 'open' : ''}>
      <div className="card-top">
        <div className="swatch" style={{ background: 'rgba(214, 40, 57, 0.95)' }} />
        <div className="hd">
          <span className="name-ja">{label}</span>
        </div>
        {onBack && (
          <button type="button" className="card-back" onClick={onBack} aria-label="前のカードに戻る / Back">
            ← {backLabel ?? '戻る'}
          </button>
        )}
        <button type="button" className="close" onClick={onClose} aria-label="閉じる / Close">
          ✕
        </button>
        <div className="eyebrow">航海中 / Voyage</div>
        <div className="version">{nodes.length} 件</div>
      </div>
      <div className="card-body">
        {events.length > 0 && (
          <div className="sec attrs members">
            <h4>イベント / Events <span className="count">{events.length}</span></h4>
            <ul className="member-list">
              {events.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="member-link"
                    onClick={() => onSelectNode(e.id)}
                  >
                    <span className="member-ja">{e.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {characters.length > 0 && (
          <div className="sec attrs members">
            <h4>登場キャラ / Characters <span className="count">{characters.length}</span></h4>
            <ul className="member-list">
              {characters.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="member-link"
                    onClick={() => onSelectNode(c.id)}
                  >
                    <span className="member-ja">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {others.length > 0 && (
          <div className="sec attrs members">
            <h4>その他 / Other <span className="count">{others.length}</span></h4>
            <ul className="member-list">
              {others.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="member-link"
                    onClick={() => onSelectNode(o.id)}
                  >
                    <span className="member-ja">{o.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

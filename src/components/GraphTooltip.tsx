export type HoverPayload =
  | { target: 'node'; nodeId: string; title: string; detail: string; episodeLabel: string; badges: string[]; color: string }
  | { target: 'edge'; edgeKey: string; title: string; detail: string; episodeLabel: string; kindLabel: string; color: string };

interface GraphTooltipProps {
  payload: HoverPayload;
  x: number;
  y: number;
}

export function GraphTooltip({ payload, x, y }: GraphTooltipProps) {
  const offset = 14;
  const maxW = 280;

  return (
    <div
      className="graph-tooltip"
      style={{
        left: Math.min(x + offset, window.innerWidth - maxW - 12),
        top: Math.max(y + offset, 8),
      }}
      role="tooltip"
    >
      <div className="graph-tooltip-swatch" style={{ background: payload.color }} />
      <div className="graph-tooltip-eyebrow">
        {payload.target === 'node' ? payload.episodeLabel : `${payload.kindLabel} · ${payload.episodeLabel}`}
      </div>
      <div className="graph-tooltip-title">{payload.title}</div>
      {payload.target === 'node' && (
        <div className="graph-tooltip-badges">
          {payload.badges.map((b) => (
            <span key={b} className="graph-tooltip-badge">
              {b}
            </span>
          ))}
        </div>
      )}
      <p className="graph-tooltip-detail bilingual">{payload.detail}</p>
    </div>
  );
}

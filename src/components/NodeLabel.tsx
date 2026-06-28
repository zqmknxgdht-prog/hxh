import type { Branch, GraphNode } from '../types/graph';

interface NodeLabelProps {
  node: GraphNode;
  branch: Branch;
  radius: number;
  showEpisode: boolean;
  /** 'right' = anchored to the right of the node (default for characters in clusters/scale up). */
  placement: 'bottom' | 'right';
}

const LINE_H = 10;

/** Stacked label — predictable bounds, readable at any zoom. */
export function NodeLabel({ node, branch, radius, showEpisode, placement }: NodeLabelProps) {
  const hasEn = Boolean(node.labelEn && node.labelEn !== node.label);

  if (placement === 'right') {
    const x = radius + 5;
    return (
      <text
        className="lbl node-label right"
        textAnchor="start"
        dominantBaseline="middle"
        x={x}
        y={0}
        fill={branch.color}
      >
        <tspan x={x} dy={hasEn ? -LINE_H / 2 : 0}>
          {node.label}
        </tspan>
        {hasEn && (
          <tspan x={x} dy={LINE_H} className="lbl-en">
            {node.labelEn}
          </tspan>
        )}
        {showEpisode && (
          <tspan x={x} dy={LINE_H} className="lbl-ep">
            {`No.${node.episode}`}
          </tspan>
        )}
      </text>
    );
  }

  const y0 = radius + 11;
  return (
    <text className="lbl node-label" textAnchor="middle" x={0} y={y0} fill={branch.color}>
      <tspan x={0} dy={0}>
        {node.label}
      </tspan>
      {hasEn && (
        <tspan x={0} dy={LINE_H} className="lbl-en">
          {node.labelEn}
        </tspan>
      )}
      {showEpisode && (
        <tspan x={0} dy={hasEn ? 9 : LINE_H} className="lbl-ep">
          {`No.${node.episode}`}
        </tspan>
      )}
    </text>
  );
}

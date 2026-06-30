import type { Branch, GraphNode, LayoutConfig } from '../types/graph';
import type { PositionedNode } from './layout';

export interface ViewBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export const BRANCH_LABEL_X = 10;
const NODE_R = 14;

interface LabelExtent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Screen-space extent of a node's label relative to the node center. */
export function measureNodeLabel(node: GraphNode, nodeRadius = NODE_R): LabelExtent {
  const jaLen = node.label?.length ?? 0;
  const enLen = node.labelEn && node.labelEn !== node.label ? node.labelEn.length : 0;
  const labelW = Math.max(jaLen * 7, enLen * 4.5, 22);
  // Right-anchored labels (characters): extend rightward from node edge.
  if (node.kind !== 'event') {
    return {
      left: nodeRadius + 4,
      right: nodeRadius + 5 + labelW + 4,
      top: nodeRadius + 12,
      bottom: nodeRadius + 12,
    };
  }
  // Bottom-anchored (events): centered below.
  const halfW = labelW / 2 + 6;
  const lines = 1 + (enLen ? 1 : 0) + 1;
  return {
    left: halfW,
    right: halfW,
    top: nodeRadius + 6,
    bottom: nodeRadius + 10 + lines * 10 + 6,
  };
}

function longestBranchLabelWidth(branches: Record<string, Branch>): number {
  let max = 0;
  for (const branch of Object.values(branches)) {
    const ja = branch.name.length * 7.5;
    const en = branch.nameEn && branch.nameEn !== branch.name ? branch.nameEn.length * 4.8 : 0;
    max = Math.max(max, ja, en);
  }
  return max + 12;
}

export function getVisibleBounds(
  nodes: PositionedNode[],
  branches: Record<string, Branch>,
  _layout: LayoutConfig,
  minEpisode: number,
  maxEpisode: number,
  padding = { left: 16, right: 20, top: 20, bottom: 24 },
): ViewBounds | null {
  const visible = nodes.filter((n) => n.episode >= minEpisode && n.episode <= maxEpisode);
  if (!visible.length) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of visible) {
    const m = measureNodeLabel(node);
    minX = Math.min(minX, node.x - m.left);
    maxX = Math.max(maxX, node.x + m.right);
    minY = Math.min(minY, node.y - m.top);
    maxY = Math.max(maxY, node.y + m.bottom);
  }

  const branchLabelW = longestBranchLabelWidth(branches);
  minX = Math.min(minX, BRANCH_LABEL_X);
  minX -= Math.max(padding.left, branchLabelW);

  maxX += padding.right;
  minY -= padding.top;
  maxY += padding.bottom;

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Minimum on-screen scale so lanes/nodes stay readable when fitting. */
export const FIT_MIN_SCALE = 0.28;

export function computeFitTransform(
  bounds: ViewBounds,
  viewportW: number,
  viewportH: number,
  headerH = 118,
  alignX: 'center' | 'right' = 'center',
  footerH = 0,
  alignY: 'center' | 'top' = 'center',
  scaleMin: number = FIT_MIN_SCALE,
): { scale: number; tx: number; ty: number } {
  const padX = 32;
  const padY = 24;
  const availW = viewportW - padX * 2;
  const availH = viewportH - headerH - footerH - padY * 2;
  const scaleX = availW / bounds.width;
  const scaleY = availH / bounds.height;
  const scale = Math.max(scaleMin, Math.min(scaleX, scaleY, 1.25));
  const tx = alignX === 'right'
    ? viewportW - padX - bounds.maxX * scale
    : (viewportW - bounds.width * scale) / 2 - bounds.minX * scale;
  const ty = alignY === 'top'
    ? headerH + padY - bounds.minY * scale
    : headerH + (availH - bounds.height * scale) / 2 + padY - bounds.minY * scale;
  return { scale, tx, ty };
}

export type LodLevel = 'normal' | 'compact' | 'overview';

export function getLodLevel(scale: number): LodLevel {
  if (scale < 0.32) return 'overview';
  if (scale < 0.55) return 'compact';
  return 'normal';
}

/** Keep nodes at least minPx on screen when the scene is scaled down. */
export function compensatedRadius(baseR: number, scale: number, minPx: number): number {
  return Math.max(baseR, minPx / Math.max(scale, 0.08));
}

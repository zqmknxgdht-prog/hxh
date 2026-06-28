/**
 * Force-based label layout: each label is pulled toward its anchor (the
 * node it labels) and repelled from other labels' bounding boxes. The
 * simulation runs for a fixed number of iterations and returns final
 * positions. Leader lines are drawn at the call site when the label moves
 * far enough from its anchor.
 */

export interface LabelInput {
  id: string;
  anchorX: number;
  anchorY: number;
  /** Desired offset from anchor (e.g., right of node by radius + gap). */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface LabelLayoutItem {
  id: string;
  anchorX: number;
  anchorY: number;
  /** Final label box center. */
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SimBox extends LabelInput {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
}

const SPRING_K = 0.18;
const REPULSE_K = 0.9;
const DAMP = 0.55;
const ITERATIONS = 140;
const ALPHA_DECAY = 0.985;
const JITTER = 0.6;
/** Max distance label may drift from its target position. */
const MAX_DRIFT = 60;

export function layoutLabels(inputs: LabelInput[]): LabelLayoutItem[] {
  if (!inputs.length) return [];

  // Hash-based deterministic jitter so labels at identical anchors don't sit
  // perfectly on top of each other (force sim needs an asymmetry to push apart).
  const boxes: SimBox[] = inputs.map((inp, i) => {
    const tx = inp.anchorX + inp.offsetX;
    const ty = inp.anchorY + inp.offsetY;
    return {
      ...inp,
      targetX: tx,
      targetY: ty,
      x: tx + ((i * 37) % 11 - 5) * JITTER,
      y: ty + ((i * 53) % 9 - 4) * JITTER,
      vx: 0,
      vy: 0,
    };
  });

  let alpha = 1;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    // 1. Spring toward target position (anchor + offset)
    for (const b of boxes) {
      b.vx += (b.targetX - b.x) * SPRING_K * alpha;
      b.vy += (b.targetY - b.y) * SPRING_K * alpha;
    }
    // 2. Pairwise box-collision repulsion
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      for (let j = i + 1; j < boxes.length; j++) {
        const c = boxes[j];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const minDx = (a.width + c.width) * 0.5;
        const minDy = (a.height + c.height) * 0.5;
        const overlapX = minDx - Math.abs(dx);
        const overlapY = minDy - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          // Push apart along the axis with the smaller overlap; magnitude
          // proportional to overlap so heavy overlaps separate aggressively.
          if (overlapX < overlapY) {
            const push = (overlapX + 2) * REPULSE_K * alpha;
            const sign = dx === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dx);
            a.vx -= sign * push;
            c.vx += sign * push;
          } else {
            const push = (overlapY + 2) * REPULSE_K * alpha;
            const sign = dy === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dy);
            a.vy -= sign * push;
            c.vy += sign * push;
          }
        }
      }
    }
    // 3. Apply velocity + damping, then clamp to max drift from target
    for (const b of boxes) {
      b.x += b.vx;
      b.y += b.vy;
      b.vx *= DAMP;
      b.vy *= DAMP;
      const ddx = b.x - b.targetX;
      const ddy = b.y - b.targetY;
      const dist = Math.hypot(ddx, ddy);
      if (dist > MAX_DRIFT) {
        const k = MAX_DRIFT / dist;
        b.x = b.targetX + ddx * k;
        b.y = b.targetY + ddy * k;
        b.vx *= 0.3;
        b.vy *= 0.3;
      }
    }
    alpha *= ALPHA_DECAY;
  }

  return boxes.map((b) => ({
    id: b.id,
    anchorX: b.anchorX,
    anchorY: b.anchorY,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
  }));
}

/** Distance between label center and anchor — drives leader-line visibility. */
export function leaderDistance(item: LabelLayoutItem): number {
  const dx = item.x - item.anchorX;
  const dy = item.y - item.anchorY;
  return Math.hypot(dx, dy);
}

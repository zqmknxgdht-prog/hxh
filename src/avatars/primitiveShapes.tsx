import type { AvatarPrimitive } from '../types/graph';

const SQ3 = Math.sqrt(3);

/** Equilateral triangle path; `s` = side length, `rot` = radians. */
export function trianglePath(cx: number, cy: number, s: number, rot: number): string {
  const R = s / SQ3;
  const pts: string[] = [];
  for (let i = 0; i < 3; i++) {
    const a = rot + (-Math.PI / 2 + (i * 2 * Math.PI) / 3);
    pts.push(`${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`);
  }
  return `M${pts[0]} L${pts[1]} L${pts[2]} Z`;
}

export function renderPrimitive(shape: AvatarPrimitive, key: number) {
  if (shape.kind === 'circle') {
    return <circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.f} />;
  }
  return (
    <path key={key} d={trianglePath(shape.cx, shape.cy, shape.s, shape.rot)} fill={shape.f} stroke="none" />
  );
}

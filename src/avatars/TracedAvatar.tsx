import type { TracedAvatarData } from '../types/graph';
import { renderPrimitive } from './primitiveShapes';

interface TracedAvatarProps {
  data: TracedAvatarData;
  radius: number;
}

/** Avatar built from circles + equilateral triangles only. */
export function TracedAvatar({ data, radius }: TracedAvatarProps) {
  const s = (2 * radius) / data.w;
  return (
    <g transform={`translate(${-radius}, ${-radius}) scale(${s})`}>
      {data.shapes.map((shape, i) => renderPrimitive(shape, i))}
    </g>
  );
}

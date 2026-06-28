import type { TracedAvatarData } from '../types/graph';
import { TracedAvatar } from './TracedAvatar';

interface NodeAvatarProps {
  nodeId: string;
  traced: TracedAvatarData;
  radius: number;
  stroke: string;
  strokeWidth: number;
  muted?: boolean;
  compact?: boolean;
}

export function NodeAvatar({
  nodeId,
  traced,
  radius,
  stroke,
  strokeWidth,
  muted,
  compact,
}: NodeAvatarProps) {
  const clipId = `av-${nodeId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  return (
    <g className={`avatar traced${muted ? ' muted' : ''}${compact ? ' compact' : ''}`}>
      <defs>
        <clipPath id={clipId}>
          <circle r={radius - 0.5} />
        </clipPath>
      </defs>
      <circle
        className="shape avatar-bg"
        r={radius}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <g clipPath={`url(#${clipId})`}>
        <TracedAvatar data={traced} radius={radius - 1} />
      </g>
    </g>
  );
}

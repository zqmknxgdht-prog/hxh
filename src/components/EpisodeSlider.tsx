import type { VersionConfig, UiStrings } from '../types/graph';
import { bilingualInline } from '../utils/bilingual';

interface EpisodeSliderProps {
  version: VersionConfig;
  ui?: UiStrings;
  uiEn?: UiStrings;
  minValue: number;
  maxValue: number;
  onMinChange: (episode: number) => void;
  onMaxChange: (episode: number) => void;
}

export function EpisodeSlider({
  version,
  ui,
  uiEn,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: EpisodeSliderProps) {
  const jaLabel = ui?.episodeTime ?? '時点';
  const enLabel = uiEn?.episodeTime;
  const unit = version.unit ?? 'No.';
  const rangeJa = `${unit}${minValue} – ${unit}${maxValue}`;
  const rangeEn = `${unit}${minValue} – ${unit}${maxValue}`;

  const handleMin = (v: number) => {
    onMinChange(Math.min(v, maxValue));
  };
  const handleMax = (v: number) => {
    onMaxChange(Math.max(v, minValue));
  };

  return (
    <div className="episode-ctrl">
      <label className="episode-label" htmlFor="episode-min">
        {bilingualInline(jaLabel, enLabel)}
      </label>
      <div className="episode-range-pair">
        <input
          id="episode-min"
          type="range"
          min={1}
          max={version.max}
          value={minValue}
          aria-label="開始話 / Start"
          onChange={(e) => handleMin(Number(e.target.value))}
        />
        <input
          id="episode-max"
          type="range"
          min={1}
          max={version.max}
          value={maxValue}
          aria-label="終了話 / End"
          onChange={(e) => handleMax(Number(e.target.value))}
        />
      </div>
      <span className="episode-val">
        {bilingualInline(rangeJa, rangeJa !== rangeEn ? rangeEn : undefined)}
      </span>
    </div>
  );
}

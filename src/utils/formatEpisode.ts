import type { VersionConfig, VersionLabelConfig } from '../types/graph';
import { bilingualInline } from './bilingual';

export function formatEpisode(version: VersionConfig | VersionLabelConfig, episode: number): string {
  return version.label.replace('{n}', String(episode));
}

export function formatEpisodeBilingual(
  version: VersionConfig,
  versionEn: VersionLabelConfig | undefined,
  episode: number,
): string {
  const ja = formatEpisode(version, episode);
  const en = versionEn ? formatEpisode(versionEn, episode) : undefined;
  return bilingualInline(ja, en);
}

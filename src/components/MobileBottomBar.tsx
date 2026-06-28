interface MobileBottomBarProps {
  onOpenList: () => void;
  onOpenEpisodes: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

/** Fixed bottom bar shown only on mobile widths. */
export function MobileBottomBar({
  onOpenList,
  onOpenEpisodes,
  onZoomIn,
  onZoomOut,
  onFit,
}: MobileBottomBarProps) {
  return (
    <nav className="mobile-bar" aria-label="モバイルツールバー">
      <button type="button" onClick={onOpenList} aria-label="ノード一覧">
        <span className="mb-icon" aria-hidden>≡</span>
        <span className="mb-label">一覧</span>
      </button>
      <button type="button" onClick={onZoomOut} aria-label="縮小">
        <span className="mb-icon" aria-hidden>−</span>
        <span className="mb-label">縮小</span>
      </button>
      <button type="button" onClick={onZoomIn} aria-label="拡大">
        <span className="mb-icon" aria-hidden>＋</span>
        <span className="mb-label">拡大</span>
      </button>
      <button type="button" onClick={onOpenEpisodes} aria-label="話数・アーク">
        <span className="mb-icon" aria-hidden>⏱</span>
        <span className="mb-label">話数</span>
      </button>
      <button type="button" onClick={onFit} aria-label="全体表示">
        <span className="mb-icon" aria-hidden>⤢</span>
        <span className="mb-label">全体</span>
      </button>
    </nav>
  );
}

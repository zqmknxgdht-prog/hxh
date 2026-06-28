import { useEffect, type ReactNode } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Maximum height (CSS value). Defaults to 70vh. */
  maxHeight?: string;
}

/** Mobile-oriented slide-up sheet with backdrop. Desktop should not render this. */
export function BottomSheet({ open, onClose, title, children, maxHeight = '70vh' }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`sheet-backdrop${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden
      />
      <div className={`bottom-sheet${open ? ' open' : ''}`} role="dialog" aria-label={title} style={{ maxHeight }}>
        <div className="sheet-handle" onClick={onClose} aria-hidden>
          <span />
        </div>
        <div className="sheet-header">
          <h3>{title}</h3>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="閉じる / Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

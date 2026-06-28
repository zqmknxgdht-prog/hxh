import { useCallback, useRef, useState } from 'react';

interface PanZoomState {
  scale: number;
  tx: number;
  ty: number;
}

interface UsePanZoomOptions {
  onTap: (clientX: number, clientY: number) => void;
}

export function usePanZoom({ onTap }: UsePanZoomOptions) {
  const [{ scale, tx, ty }, setState] = useState<PanZoomState>({ scale: 1, tx: 0, ty: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, PointerEvent>());
  const pinchDistRef = useRef(0);
  const downRef = useRef({ x: 0, y: 0 });

  const applyTransform = useCallback((next: PanZoomState) => {
    setState(next);
  }, []);

  const setTransform = useCallback((partial: Partial<PanZoomState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setState((prev) => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nextScale = Math.max(0.1, Math.min(7, prev.scale * factor));
      return {
        scale: nextScale,
        tx: cx - (cx - prev.tx) * (nextScale / prev.scale),
        ty: cy - (cy - prev.ty) * (nextScale / prev.scale),
      };
    });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, e.nativeEvent);
    if (pointersRef.current.size === 1) {
      downRef.current = { x: e.clientX, y: e.clientY };
      if (stageRef.current) stageRef.current.style.cursor = 'grabbing';
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const prev = pointersRef.current.get(e.pointerId)!;
    pointersRef.current.set(e.pointerId, e.nativeEvent);

    if (pointersRef.current.size === 1) {
      setState((s) => ({
        ...s,
        tx: s.tx + e.clientX - prev.clientX,
        ty: s.ty + e.clientY - prev.clientY,
      }));
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const stage = stageRef.current;
      if (stage && pinchDistRef.current) {
        const rect = stage.getBoundingClientRect();
        const cx = (a.clientX + b.clientX) / 2 - rect.left;
        const cy = (a.clientY + b.clientY) / 2 - rect.top;
        setState((s) => {
          const nextScale = Math.max(0.1, Math.min(7, s.scale * (dist / pinchDistRef.current)));
          return {
            scale: nextScale,
            tx: cx - (cx - s.tx) * (nextScale / s.scale),
            ty: cy - (cy - s.ty) * (nextScale / s.scale),
          };
        });
      }
      pinchDistRef.current = dist;
    }
  }, []);

  const endPointer = useCallback(
    (e: React.PointerEvent) => {
      const wasSingle = pointersRef.current.size === 1;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchDistRef.current = 0;
      if (pointersRef.current.size === 0 && stageRef.current) {
        stageRef.current.style.cursor = 'grab';
        if (wasSingle && Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y) < 6) {
          onTap(e.clientX, e.clientY);
        }
      }
    },
    [onTap],
  );

  const zoomIn = useCallback(() => {
    setState((s) => ({ ...s, scale: Math.min(7, s.scale * 1.25) }));
  }, []);

  const zoomOut = useCallback(() => {
    setState((s) => ({ ...s, scale: Math.max(0.1, s.scale / 1.25) }));
  }, []);

  return {
    stageRef,
    scale,
    tx,
    ty,
    applyTransform,
    setTransform,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    endPointer,
    zoomIn,
    zoomOut,
  };
}

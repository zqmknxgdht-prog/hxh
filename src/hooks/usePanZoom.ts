import { useCallback, useRef, useState } from 'react';

interface PanZoomState {
  scale: number;
  tx: number;
  ty: number;
}

interface PinchAnchor {
  /** Distance between the two pointers at pinch start (px) */
  initialDist: number;
  /** Scale at pinch start */
  initialScale: number;
  /** Translation at pinch start */
  initialTx: number;
  initialTy: number;
  /** Midpoint of the two pointers at pinch start (stage-local px) */
  midX: number;
  midY: number;
}

interface UsePanZoomOptions {
  onTap: (clientX: number, clientY: number) => void;
}

export function usePanZoom({ onTap }: UsePanZoomOptions) {
  const [{ scale, tx, ty }, setState] = useState<PanZoomState>({ scale: 1, tx: 0, ty: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, PointerEvent>());
  const pinchRef = useRef<PinchAnchor | null>(null);
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

  /** Snapshot current pinch baseline from the two active pointers + current view state. */
  const initPinchAnchor = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const [a, b] = [...pointersRef.current.values()];
    if (!a || !b) return;
    const rect = stage.getBoundingClientRect();
    setState((s) => {
      pinchRef.current = {
        initialDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        initialScale: s.scale,
        initialTx: s.tx,
        initialTy: s.ty,
        midX: (a.clientX + b.clientX) / 2 - rect.left,
        midY: (a.clientY + b.clientY) / 2 - rect.top,
      };
      return s; // no state change, only ref snapshot
    });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, e.nativeEvent);
    if (pointersRef.current.size === 1) {
      downRef.current = { x: e.clientX, y: e.clientY };
      if (stageRef.current) stageRef.current.style.cursor = 'grabbing';
    } else if (pointersRef.current.size === 2) {
      // Second finger landed — capture pinch baseline immediately.
      initPinchAnchor();
    }
  }, [initPinchAnchor]);

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
    } else if (pointersRef.current.size === 2 && pinchRef.current) {
      const anchor = pinchRef.current;
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      // Absolute (gesture-anchored) ratio — fingers spread (dist > initial) zooms in.
      const ratio = dist / anchor.initialDist;
      const nextScale = Math.max(0.1, Math.min(7, anchor.initialScale * ratio));
      // Keep the initial pinch midpoint locked to the same scene-space point.
      const k = nextScale / anchor.initialScale;
      setState({
        scale: nextScale,
        tx: anchor.midX - (anchor.midX - anchor.initialTx) * k,
        ty: anchor.midY - (anchor.midY - anchor.initialTy) * k,
      });
    }
  }, []);

  const endPointer = useCallback(
    (e: React.PointerEvent) => {
      const wasSingle = pointersRef.current.size === 1;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      // If we still have one finger after a pinch, re-seed pan baseline so next move doesn't jump.
      // (Map already has the remaining pointer's last event, so next pointermove diff will work.)
      if (pointersRef.current.size === 0 && stageRef.current) {
        stageRef.current.style.cursor = 'grab';
        if (wasSingle && Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y) < 6) {
          onTap(e.clientX, e.clientY);
        }
      }
    },
    [onTap],
  );

  /** Scale around the stage center so the graph stays in view.
   *  Without compensating tx/ty, a zoom-only change leaves the graph anchored
   *  at world-origin, which on small screens can push it off-screen. */
  const zoomBy = useCallback((factor: number) => {
    setState((prev) => {
      const stage = stageRef.current;
      const nextScale = Math.max(0.1, Math.min(7, prev.scale * factor));
      if (!stage) return { ...prev, scale: nextScale };
      const cx = stage.clientWidth / 2;
      const cy = stage.clientHeight / 2;
      const k = nextScale / prev.scale;
      return {
        scale: nextScale,
        tx: cx - (cx - prev.tx) * k,
        ty: cy - (cy - prev.ty) * k,
      };
    });
  }, []);

  const zoomIn = useCallback(() => zoomBy(1.25), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / 1.25), [zoomBy]);

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

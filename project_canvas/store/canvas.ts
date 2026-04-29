'use client';

/**
 * @/store/canvas
 *
 * Zustand 없이 useSyncExternalStore로 구현한 경량 싱글턴 스토어.
 * page.tsx의 useState와 양방향 동기화:
 *  - page.tsx → store: syncNodes(nodes) (nodes 변경 시 effect로 호출)
 *  - store    → page.tsx: updateNode가 호출되면 등록된 리액트 setter를 통해 반영
 */

import { useSyncExternalStore } from 'react';
import type { CanvasNode } from '@/types/canvas';

// ── 내부 상태 ──────────────────────────────────────────────────────────────
let _nodes: CanvasNode[] = [];

// page.tsx의 React 함수형 setState (updateNode → React 상태 반영에 사용)
let _reactSetter: ((fn: (prev: CanvasNode[]) => CanvasNode[]) => void) | null = null;

const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((l) => l());
}

// ── 구독 / 스냅샷 (useSyncExternalStore 용) ───────────────────────────────
function _subscribe(listener: () => void) {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

function _getSnapshot() {
  return _nodes;
}

// ── 액션 ──────────────────────────────────────────────────────────────────
const _actions = {
  /**
   * page.tsx mount 시 React의 setNodes를 등록.
   * unmount 시 null을 전달해 해제.
   */
  registerSetter(
    setter: ((fn: (prev: CanvasNode[]) => CanvasNode[]) => void) | null,
  ) {
    _reactSetter = setter;
  },

  /**
   * page.tsx의 nodes 변경을 스토어에 동기화.
   * React state → store (단방향, _reactSetter를 호출하지 않음 → 루프 방지).
   */
  syncNodes(nodes: CanvasNode[]) {
    _nodes = nodes;
    _notify();
  },

  /**
   * 특정 노드를 부분 업데이트.
   * 스토어 내부 상태와 page.tsx React 상태를 동시에 갱신.
   */
  updateNode(id: string, patch: Partial<CanvasNode>) {
    _nodes = _nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
    _notify();

    // React 상태에도 반영 (없으면 UI가 갱신되지 않음)
    if (_reactSetter) {
      _reactSetter((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      );
    }
  },
};

// ── 공개 타입 ──────────────────────────────────────────────────────────────
type CanvasStoreState = {
  nodes: CanvasNode[];
} & typeof _actions;

// ── 훅 ────────────────────────────────────────────────────────────────────
function useCanvasStoreHook<T>(selector: (state: CanvasStoreState) => T): T {
  const nodes = useSyncExternalStore(_subscribe, _getSnapshot);
  return selector({ nodes, ..._actions });
}

/** Zustand 호환: 훅 외부에서 현재 상태를 동기적으로 읽기 */
useCanvasStoreHook.getState = (): CanvasStoreState => ({
  nodes: _nodes,
  ..._actions,
});

export const useCanvasStore = useCanvasStoreHook;

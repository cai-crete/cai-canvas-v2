import { create } from 'zustand';
import { CanvasNode } from '@/types/canvas';
import React from 'react';

interface CanvasState {
  nodes: CanvasNode[];
  setNodesReact: React.Dispatch<React.SetStateAction<CanvasNode[]>> | null;
  syncNodes: (nodes: CanvasNode[]) => void;
  updateNode: (id: string, data: Partial<CanvasNode>) => void;
  registerSetter: (setter: React.Dispatch<React.SetStateAction<CanvasNode[]>> | null) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  setNodesReact: null,
  syncNodes: (nodes) => set({ nodes }),
  updateNode: (id, data) => {
    const { setNodesReact, nodes } = get();
    // 1. 상태 동기화
    const updatedNodes = nodes.map(n => n.id === id ? { ...n, ...data } : n);
    set({ nodes: updatedNodes });
    // 2. 실제 React 상태 업데이트 (page.tsx의 setNodes)
    if (setNodesReact) {
      setNodesReact(updatedNodes);
    }
  },
  registerSetter: (setter) => set({ setNodesReact: setter })
}));

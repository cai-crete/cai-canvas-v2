'use client';

import { useRef } from 'react';
import { useCanvasStore } from '@/store/canvas';
import { CanvasNode } from '@/types/canvas';
import type { Map3DViewRef } from '@/components/Map3DView';

interface Props {
  node: CanvasNode;
  map3dRef: React.RefObject<Map3DViewRef | null>;
  onExportImage?: (base64: string) => void;
}

export function Map3DPanel({ node, map3dRef, onExportImage }: Props) {
  const updateNode = useCanvasStore(state => state.updateNode);
  const showLabels = node.map3dShowLabels ?? true;
  const isCapturing = useRef(false);

  const toggleLabels = () => {
    const next = !showLabels;
    updateNode(node.id, { map3dShowLabels: next });
    map3dRef.current?.setLabelsVisible(next);
  };

  const handleCapture = async () => {
    if (isCapturing.current || !map3dRef.current) {
      console.warn('[Map3DPanel] capture 스킵 — isCapturing:', isCapturing.current, 'ref:', !!map3dRef.current);
      return;
    }
    isCapturing.current = true;
    console.log('[Map3DPanel] capture 시작');

    try {
      const base64 = await map3dRef.current.capture();
      console.log('[Map3DPanel] capture 결과 length:', base64?.length ?? 0);
      if (base64 && base64.length > 1000) {
        updateNode(node.id, { thumbnailData: base64 });
        if (onExportImage) {
          console.log('[Map3DPanel] onExportImage 호출');
          onExportImage(base64);
        } else {
          console.warn('[Map3DPanel] onExportImage 콜백 없음 — 썸네일만 저장됨');
        }
      } else {
        console.error('[Map3DPanel] capture 실패 — 빈 이미지 또는 null 반환');
      }
    } catch (err) {
      console.error('[Map3DPanel] capture 에러:', err);
    } finally {
      isCapturing.current = false;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-[3.25rem] border-b border-gray-100 flex items-center px-4 shrink-0">
        <h2 className="text-[0.75rem] font-bold tracking-wider text-black">3D VIEW 설정</h2>
      </div>

      <div className="p-4 flex flex-col gap-6 overflow-y-auto">

        {/* 표시 옵션 */}
        <div className="flex flex-col gap-3">
          <label className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider">표시 옵션</label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
              <div className={`relative w-8 h-4 rounded-full transition-colors ${showLabels ? 'bg-black' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showLabels ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-[0.75rem] font-medium text-gray-700">지명 / POI 텍스트 표시</span>
              <input type="checkbox" className="hidden" checked={showLabels} onChange={toggleLabels} />
            </label>
          </div>
        </div>

        {/* 지도 조작 안내 */}
        <div className="flex flex-col gap-3">
          <label className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider">지도 조작</label>
          <div className="text-[0.7rem] text-gray-500 leading-relaxed bg-gray-50 p-3 rounded-lg">
            • <b>마우스 드래그</b>로 카메라를 회전합니다.<br/>
            • <b>마우스 휠</b>로 줌 인/아웃합니다.<br/>
            • <b>우클릭 드래그</b>로 시점을 이동합니다.
            {node.map3dRoadInfo && (
              <><br/><br/>• <b>도로 접면</b>: {node.map3dRoadInfo}</>
            )}
          </div>
        </div>

        {/* 내보내기 버튼 */}
        <div className="mt-auto pt-4 border-t border-gray-100">
          <button
            onClick={handleCapture}
            className="w-full py-3 bg-black text-white text-[0.75rem] font-bold tracking-wider rounded-lg hover:bg-gray-800 transition-colors"
          >
            Image Node로 내보내기
          </button>
        </div>
      </div>
    </div>
  );
}

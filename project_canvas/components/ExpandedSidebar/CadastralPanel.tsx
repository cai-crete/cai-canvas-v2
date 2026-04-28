'use client';

import { useCanvasStore } from '@/store/canvas';
import { CanvasNode } from '@/types/canvas';

interface Props {
  node: CanvasNode;
  onExportImage?: () => void;
}

export function CadastralPanel({ node, onExportImage }: Props) {
  const updateNode = useCanvasStore(state => state.updateNode);
  
  const currentTms = node.cadastralTmsType ?? 'Base';
  const showSurrounding = node.cadastralShowSurrounding ?? true;
  const showLotNumbers = node.cadastralShowLotNumbers ?? true;
  const fillSelected = node.cadastralFillSelected ?? true;
  const isOffsetMode = node.cadastralIsOffsetMode ?? false;

  const handleTmsChange = (val: 'None' | 'Base' | 'Satellite' | 'Vector') => {
    updateNode(node.id, { cadastralTmsType: val });
  };

  const toggleSurrounding = () => updateNode(node.id, { cadastralShowSurrounding: !showSurrounding });
  const toggleLotNumbers = () => updateNode(node.id, { cadastralShowLotNumbers: !showLotNumbers });
  const toggleFillSelected = () => updateNode(node.id, { cadastralFillSelected: !fillSelected });
  const toggleOffsetMode = () => updateNode(node.id, { cadastralIsOffsetMode: !isOffsetMode });

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-[3.25rem] border-b border-gray-100 flex items-center px-4 shrink-0">
        <h2 className="text-[0.75rem] font-bold tracking-wider text-black">지적도 설정</h2>
      </div>

      <div className="p-4 flex flex-col gap-6 overflow-y-auto">
        <div className="flex flex-col gap-3">
          <label className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider">배경 레이어</label>
          <div className="flex flex-col gap-2">
            {(['None', 'Base', 'Satellite', 'Vector'] as const).map(t => (
              <button
                key={t}
                onClick={() => handleTmsChange(t)}
                className={`text-left px-3 py-2 rounded-lg text-[0.75rem] transition-colors border ${
                  currentTms === t 
                  ? 'border-black bg-black text-white font-bold' 
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t === 'None' ? '배경 숨기기 (Layoff)' : 
                 t === 'Base' ? '일반 지도' : 
                 t === 'Satellite' ? '위성 지도' : '벡터 지도'}
              </button>
            ))}
          </div>
        </div>

        {/* [HIDDEN] 미세조정 모드 — 향후 재활성화 예정 */}
        <div className="hidden">
          <label className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider">지도 미세조정</label>
          <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
            <div className={`relative w-8 h-4 rounded-full transition-colors ${isOffsetMode ? 'bg-blue-500' : 'bg-gray-200'}`}>
              <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${isOffsetMode ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-[0.75rem] font-medium text-gray-700">배경 지도 미세조정 모드</span>
            <input type="checkbox" className="hidden" checked={isOffsetMode} onChange={toggleOffsetMode} />
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider">표시 옵션</label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
              <div className={`relative w-8 h-4 rounded-full transition-colors ${showSurrounding ? 'bg-black' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showSurrounding ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-[0.75rem] font-medium text-gray-700">주변 지적선 표시</span>
              <input type="checkbox" className="hidden" checked={showSurrounding} onChange={toggleSurrounding} />
            </label>
            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
              <div className={`relative w-8 h-4 rounded-full transition-colors ${showLotNumbers ? 'bg-black' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showLotNumbers ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-[0.75rem] font-medium text-gray-700">지번 표시</span>
              <input type="checkbox" className="hidden" checked={showLotNumbers} onChange={toggleLotNumbers} />
            </label>
            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
              <div className={`relative w-8 h-4 rounded-full transition-colors ${fillSelected ? 'bg-black' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${fillSelected ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-[0.75rem] font-medium text-gray-700">선택 대지 내부 색칠</span>
              <input type="checkbox" className="hidden" checked={fillSelected} onChange={toggleFillSelected} />
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider">지도 조작</label>
          <div className="text-[0.7rem] text-gray-500 leading-relaxed bg-gray-50 p-3 rounded-lg">
            • <b>마우스 드래그</b>로 지도를 이동(Pan)할 수 있습니다.<br/>
            • <b>마우스 휠</b>을 돌려 지도를 확대/축소할 수 있습니다.<br/>
            • <b>Alt + 클릭 드래그</b>로 지도를 회전시킬 수 있습니다.<br/>
            • <b>미세조정 모드</b>에서는 배경 지도만 단독으로 움직입니다.
          </div>
        </div>

        {/* 내보내기 버튼 */}
        <div className="mt-auto pt-4 border-t border-gray-100">
          <button
            onClick={onExportImage}
            className="w-full py-3 bg-black text-white text-[0.75rem] font-bold tracking-wider rounded-lg hover:bg-gray-800 transition-colors"
          >
            Image Node로 내보내기
          </button>
        </div>
      </div>
    </div>
  );
}

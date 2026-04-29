# 지적도 노드카드 [확장] 버튼 → ExpandedView 지적도 뷰 진입 라우팅 수정

## 문제
- `cadastral` 노드는 `artboardType: 'image'`로 생성됨
- NodeCard [확장] 버튼 클릭 시 `expandedViewMode: 'default'`로 설정
- ExpandedView 라우팅 순서:
  1. (line 269) `artboardType === 'image' && expandedViewMode === 'default'` → **SketchToImageExpandedView** ← 여기서 잘못 잡힘
  2. (line 327) `node.type === 'cadastral'` → CadastralMapView ← 절대 도달 불가
- `map3d` 노드도 동일한 문제 (line 398)

## 수정 계획

### ExpandedView.tsx
- `cadastral` 분기(line 327)를 `artboardType === 'image'` 분기(line 255) 앞으로 이동
- `map3d` 분기(line 398)도 동일하게 이동

### 수정 후 라우팅 순서
1. elevation
2. isSketchImageMode
3. isSketchPlanMode
4. planners
5. print
6. **cadastral** ← NEW 위치
7. **map3d** ← NEW 위치
8. artboardType=image + plan
9. artboardType=image + image/default
10. artboardType=image + image/plan type (생성 결과)
11. 기본 레이아웃

## 체크리스트
- [x] ExpandedView.tsx: cadastral 분기를 artboardType=image 앞으로 이동
- [x] ExpandedView.tsx: map3d 분기를 artboardType=image 앞으로 이동
- [ ] 브라우저에서 지적도 NodeCard [확장] 버튼 클릭 → 지적도 뷰 진입 확인

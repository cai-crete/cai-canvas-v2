# Storage Signed URL 전환

## 목표
generated-images 버킷을 Private으로 유지하면서
LibraryModal 썸네일을 Signed URL(1시간 유효)로 로드

## 체크리스트
- [ ] LibraryModal.tsx — getThumbnailUrl(sync) 제거, ThumbnailCard에 useEffect로 createSignedUrl 비동기 로드
- [ ] tsc --noEmit 통과 확인
- [ ] (수동) Supabase 대시보드 → Storage → generated-images 버킷 → Private 확인

## 변경 범위
- project_canvas/components/LibraryModal.tsx

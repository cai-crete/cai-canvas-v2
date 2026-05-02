# Print 노드 Video 로직 개선 및 API 안정성 확보 계획서

## 1. 해결해야 할 문제

1. **Video 슬롯 자동 할당 및 예외 처리 부재**
   - Canvas에서 2개 이상의 이미지를 선택하고 Print 노드에 진입한 뒤, 모드를 'VIDEO'로 전환했을 때 슬롯 자동 할당이 되지 않아 수동으로 재선택해야 하는 불편함이 있습니다.
   - 만약 3장 이상의 이미지가 있을 때 VIDEO 모드로 전환하면 어떻게 처리할지에 대한 명확한 규칙 및 사용자 피드백(안내)이 부재합니다.
   - 또한, VIDEO 모드에서 다시 REPORT/PANEL 모드로 돌아갈 때 이미지가 증발하지 않도록 복구하는 '역방향 로직'이 필요합니다.

2. **Video 생성 로직(API) 검토 결과 발견된 잠재적 위험**
   - `project.10_print/app/api/print/route.ts`의 fal.ai 연동 로직 검토 결과, 두 가지 오류 포인트가 발견되었습니다.
     1. **업로드 반환값 구조 오류**: `fal.storage.upload`의 반환값을 문자열로 바로 구조 분해 할당하고 있으나, 최신 클라이언트는 `{ url: string }` 형태의 객체를 반환할 수 있어 에러가 유발될 수 있습니다.
     2. **결과 추출 오류**: Kling 모델 완료 후 `result?.data?.video?.url`로 비디오 URL을 추출하고 있으나, 클라이언트 버전에 따라 `result` 객체 자체에 `video`가 있을 수 있습니다.
     3. **에러 추적성 부족**: Start와 End 이미지를 `Promise.all`로 동시 업로드할 때, 어느 이미지가 실패했는지 명시적인 구분이 불가능합니다.

---

## 2. 해결 방안

### 2.1 Canvas 선택 이미지 자동 할당 및 역방향 복구 (`Print_ExpandedView.tsx`)
- `handleModeChange` 함수 및 `processImages` 훅 내에 모드 전환 시나리오 대응 로직 추가.
- **VIDEO 모드 전환 시 (Auto-Truncate & Inform)**:
  - `images` 배열에 1장이라도 있다면, `images[0]`을 `videoStartImage`에, `images[1]`(존재 시)을 `videoEndImage`에 자동 할당합니다.
  - 할당 후 `images` 배열은 단일 진실 공급원을 위해 빈 배열(`[]`)로 비웁니다.
  - 만약 전환 전 `images.length > 2` 였다면, 캔버스 전역(Sketch-to-Image 등)에서 사용하는 동일한 디자인 양식의 토스트바를 노출합니다.
    - **토스트 메시지**: `"비디오 생성에는 2장의 이미지만 사용할 수 있습니다."`
    - **토스트 디자인**: 하단 중앙 플로팅, Pill 형태, 화이트 배경, Shadow 효과 등 (GeneratingToast.tsx 참조)
- **일반 모드 복귀 시 (Reverse Recovery)**:
  - 'VIDEO'에서 'REPORT/PANEL' 모드로 전환될 때, `videoStartImage`와 `videoEndImage`에 등록되어 있던 이미지를 다시 `images` 배열로 편입시키고 비디오 슬롯은 비웁니다.

### 2.2 Video API 생성 방어 코드 및 상세 에러 핸들링 (`route.ts`)
- **Upload 로직 수정 (에러 구체화 및 반환값 대응)**: 
  ```typescript
  const startUploadPromise = fal.storage.upload(startBlob)
    .catch((err) => { throw new Error(`Start 이미지 업로드 실패: ${falErrorDetail(err)}`) });
  const endUploadPromise = fal.storage.upload(endBlob)
    .catch((err) => { throw new Error(`End 이미지 업로드 실패: ${falErrorDetail(err)}`) });

  const [startUpload, endUpload] = await Promise.all([startUploadPromise, endUploadPromise]);

  // 버전에 구애받지 않도록 방어적 할당
  startImageUrl = typeof startUpload === 'string' ? startUpload : startUpload.url;
  endImageUrl = typeof endUpload === 'string' ? endUpload : endUpload.url;
  ```
- **URL 추출 로직 수정**:
  ```typescript
  const data = result?.data ?? result;
  const videoUri: string | undefined = data?.video?.url ?? data?.video_url;
  ```

---

## 3. 위험성 및 고려사항

- **UI 일관성 유지**: 토스트바 디자인 적용 시 `GeneratingToast`에 사용된 인라인 스타일(고정 위치, zIndex 9000, 그림자 등)을 활용해 단순한 InfoToast 컴포넌트를 Print_ExpandedView 내부에 구현하여 의존성을 최소화합니다.
- **의도된 덮어쓰기**: VIDEO 모드에서 새롭게 디바이스 업로드를 통해 Start/End 이미지를 바꾼 경우에도, 이후 모드 전환 시 새 이미지가 `images` 갤러리로 복구되므로 사용자가 작업한 내역이 유실되지 않습니다.

---

## 4. 진행 절차
1. 본 계획서에 대한 사용자 검토 및 승인 대기
2. 승인 시 `Print_ExpandedView.tsx` 에 자동 할당, 역방향 복구 및 InfoToast 컴포넌트 추가
3. 승인 시 `app/api/print/route.ts` 의 에러 구체화 및 옵셔널 체이닝 보완
4. 컴파일 확인 및 작업 요약 보고

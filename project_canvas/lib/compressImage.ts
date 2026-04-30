/**
 * 이미지 압축 유틸리티
 * Vercel Serverless Function의 4.5MB body 제한을 충족하기 위해
 * 클라이언트 측에서 이미지를 리사이즈 + JPEG 압축합니다.
 *
 * JSON 오버헤드(key + base64 인코딩 ~37% 증가)를 고려하여
 * 실제 이미지 바이트는 약 3MB 이하를 목표로 합니다.
 */

const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;  // 3MB (base64 인코딩 후 ~4MB)
const MAX_DIMENSION     = 2048;
const JPEG_QUALITY      = 0.82;

/**
 * base64 문자열의 실제 바이트 크기를 추정합니다.
 */
function estimateBase64Bytes(base64: string): number {
  // base64 문자열에서 padding '=' 제거 후 계산
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * base64 이미지를 압축하여 반환합니다.
 * 이미 충분히 작으면 원본을 그대로 반환합니다.
 *
 * @param base64 - data URL 없는 순수 base64 문자열
 * @param mimeType - 원본 MIME 타입
 * @returns { base64, mimeType } - 압축된 결과 (항상 image/jpeg)
 */
export async function compressImageBase64(
  base64: string,
  mimeType: string = 'image/png',
  maxBytes: number = DEFAULT_MAX_BYTES
): Promise<{ base64: string; mimeType: string }> {
  // 이미 충분히 작으면 원본 반환
  if (estimateBase64Bytes(base64) <= maxBytes) {
    return { base64, mimeType };
  }

  // 브라우저 환경 체크
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    console.warn('[compressImage] 서버 환경에서는 압축 불가 — 원본 반환');
    return { base64, mimeType };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;

        // 1단계: 최대 크기 제한으로 리사이즈
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width  = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ base64, mimeType }); // fallback
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // 2단계: JPEG로 변환 (품질 단계적 감소)
        let quality = JPEG_QUALITY;
        let result  = canvas.toDataURL('image/jpeg', quality).split(',')[1];

        // 여전히 크면 품질을 낮춤
        while (estimateBase64Bytes(result) > maxBytes && quality > 0.3) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality).split(',')[1];
        }

        // 3단계: 여전히 크면 해상도 추가 축소
        if (estimateBase64Bytes(result) > maxBytes) {
          const scale = Math.sqrt(maxBytes / estimateBase64Bytes(result));
          const newW = Math.round(width * scale);
          const newH = Math.round(height * scale);

          canvas.width  = newW;
          canvas.height = newH;
          ctx.drawImage(img, 0, 0, newW, newH);
          result = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
        }

        resolve({ base64: result, mimeType: 'image/jpeg' });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error('이미지 로드 실패'));

    // data URL로 변환하여 로드
    const dataUrl = base64.startsWith('data:')
      ? base64
      : `data:${mimeType};base64,${base64}`;
    img.src = dataUrl;
  });
}

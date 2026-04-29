import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function uploadToStorage(
  nodeId: string,
  base64: string,
  mimeType: string,
): Promise<void> {
  try {
    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const timestamp = Date.now();
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    await supabase.storage
      .from('generated-images')
      .upload(`${nodeId}/${timestamp}.${ext}`, buffer, { contentType: mimeType });
  } catch {
    // Storage 실패는 무시 — 응답은 항상 base64로 반환
  }
}

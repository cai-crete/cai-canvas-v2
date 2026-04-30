import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function getUserFromToken(token?: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser(token);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function uploadToStorage(
  nodeId: string,
  base64: string,
  mimeType: string,
  userId?: string,
  imageType?: string,
): Promise<void> {
  try {
    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const timestamp = Date.now();
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const storagePath = `${nodeId}/${timestamp}.${ext}`;
    await supabase.storage
      .from('generated-images')
      .upload(storagePath, buffer, { contentType: mimeType });
    if (userId && imageType) {
      await supabase.from('generated_images').insert({
        node_id: nodeId,
        type: imageType,
        user_id: userId,
        storage_path: storagePath,
      });
    }
  } catch {
    // Storage/DB 실패는 무시 — 응답은 항상 base64로 반환
  }
}

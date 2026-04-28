import type { SelectedImage } from '@cai-crete/print-components';

export function nodeImageToSelectedImage(raw: string, id: string): SelectedImage {
  let base64 = raw;
  let mimeType: SelectedImage['mimeType'] = 'image/jpeg';
  if (raw.startsWith('data:')) {
    const semi  = raw.indexOf(';');
    const comma = raw.indexOf(',');
    if (semi !== -1 && comma !== -1) {
      mimeType = raw.slice(5, semi) as SelectedImage['mimeType'];
      base64   = raw.slice(comma + 1);
    }
  }
  return { id, base64: base64.replace(/\s/g, ''), mimeType, filename: `image_${id}.jpg` };
}

export async function selectedImagesToFiles(images: SelectedImage[]): Promise<File[]> {
  return Promise.all(images.map(async (img) => {
    const dataUri = img.base64.startsWith('data:')
      ? img.base64
      : `data:${img.mimeType};base64,${img.base64}`;
    const res  = await fetch(dataUri);
    const blob = await res.blob();
    return new File([blob], img.filename || `image_${img.id}.jpg`, { type: img.mimeType });
  }));
}

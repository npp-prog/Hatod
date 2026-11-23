'use client';

/**
 * Shrinks a photo on the phone before upload: most shop photos come straight
 * from a camera at 3–8 MB, which would take minutes on weak signal and eat
 * customers' data later. Output is WebP, long side ≤ maxDim, aiming for
 * ≤ targetBytes by lowering quality step by step.
 */
export async function compressImage(
  file: Blob,
  { maxDim = 1024, targetBytes = 100 * 1024, minQuality = 0.45 } = {},
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let quality = 0.82;
  let blob = await toBlob(canvas, quality);
  while (blob.size > targetBytes && quality > minQuality) {
    quality -= 0.1;
    blob = await toBlob(canvas, quality);
  }
  return blob;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/webp', quality),
  );
}

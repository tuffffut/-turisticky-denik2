import { HikePhotoItem } from '../types';

export interface OptimizedPhotoResult {
  dataUrl: string;
  width: number;
  height: number;
  sizeKb: number;
  name: string;
  wasDownscaled: boolean;
}

/**
 * Optimizes photos to crisp 4K Ultra HD / QHD (up to 3840px) at high quality (0.90).
 * Handles mobile browser photos seamlessly (iPhone Safari, Android Chrome, Samsung).
 */
export async function optimizePhoto(
  file: File,
  maxDimension = 3840,
  quality = 0.90
): Promise<OptimizedPhotoResult> {
  // Method 1: Try modern createImageBitmap with EXIF orientation (fastest, low memory on mobile)
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      let bitmap: ImageBitmap;
      try {
        bitmap = await (createImageBitmap as any)(file, { imageOrientation: 'from-image' });
      } catch {
        bitmap = await createImageBitmap(file);
      }
      const origWidth = bitmap.width;
      const origHeight = bitmap.height;

      let targetWidth = origWidth;
      let targetHeight = origHeight;

      if (origWidth > maxDimension || origHeight > maxDimension) {
        if (origWidth > origHeight) {
          targetHeight = Math.round((origHeight * maxDimension) / origWidth);
          targetWidth = maxDimension;
        } else {
          targetWidth = Math.round((origWidth * maxDimension) / origHeight);
          targetHeight = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
        bitmap.close();

        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (!dataUrl.startsWith('data:image/jpeg')) {
          dataUrl = canvas.toDataURL('image/webp', quality);
        }

        const base64Len = dataUrl.length - (dataUrl.indexOf(',') + 1);
        const sizeKb = Math.round(((base64Len * 3) / 4) / 1024);

        return {
          dataUrl,
          width: targetWidth,
          height: targetHeight,
          sizeKb,
          name: file.name || 'foto.jpg',
          wasDownscaled: targetWidth !== origWidth || targetHeight !== origHeight,
        };
      }
    } catch (bitmapErr) {
      console.warn('[PhotoOptimizer] createImageBitmap selhal, přecházím na HTML Image:', bitmapErr);
    }
  }

  // Method 2: Standard HTML5 Image & Canvas fallback
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const origWidth = img.naturalWidth || img.width;
      const origHeight = img.naturalHeight || img.height;

      let targetWidth = origWidth;
      let targetHeight = origHeight;

      if (origWidth > maxDimension || origHeight > maxDimension) {
        if (origWidth > origHeight) {
          targetHeight = Math.round((origHeight * maxDimension) / origWidth);
          targetWidth = maxDimension;
        } else {
          targetWidth = Math.round((origWidth * maxDimension) / origHeight);
          targetHeight = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Chyba inicializace plátna'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (!dataUrl.startsWith('data:image/jpeg')) {
        dataUrl = canvas.toDataURL('image/webp', quality);
      }

      const base64Len = dataUrl.length - (dataUrl.indexOf(',') + 1);
      const sizeKb = Math.round(((base64Len * 3) / 4) / 1024);

      resolve({
        dataUrl,
        width: targetWidth,
        height: targetHeight,
        sizeKb,
        name: file.name || 'foto.jpg',
        wasDownscaled: targetWidth !== origWidth || targetHeight !== origHeight,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Fallback: read directly as DataURL via FileReader
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawDataUrl = e.target?.result as string;
        resolve({
          dataUrl: rawDataUrl,
          width: 3840,
          height: 2160,
          sizeKb: Math.round(file.size / 1024),
          name: file.name || 'foto.jpg',
          wasDownscaled: false,
        });
      };
      reader.onerror = () => reject(new Error('Nepodařilo se načíst soubor z mobilu nebo disku'));
      reader.readAsDataURL(file);
    };

    img.src = objectUrl;
  });
}

/**
 * Uploads/prepares an optimized 4K photo for direct, robust storage.
 */
export async function uploadPhotoToStorage(
  file: File,
  hikeId?: string,
  caption?: string
): Promise<HikePhotoItem> {
  const optimized = await optimizePhoto(file, 3840, 0.90);
  const photoId = 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

  const res = await fetch('/api/photos/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hikeId: hikeId || '',
      dataUrl: optimized.dataUrl,
      name: file.name || 'foto.jpg',
      caption: caption || '',
      width: optimized.width,
      height: optimized.height,
      sizeKb: optimized.sizeKb,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Chyba při nahrávání na server (${res.status} ${res.statusText})`);
  }

  const serverPhoto = await res.json();
  return {
    id: serverPhoto.id || photoId,
    url: serverPhoto.url || `/api/photos/${photoId}`,
    rawUrl: serverPhoto.rawUrl || `/api/photos/${photoId}?raw=1`,
    name: serverPhoto.name || file.name,
    caption: caption || '',
    width: serverPhoto.width || optimized.width,
    height: serverPhoto.height || optimized.height,
    sizeKb: serverPhoto.sizeKb || optimized.sizeKb,
    source: 'user',
    createdAt: new Date().toISOString(),
  };
}

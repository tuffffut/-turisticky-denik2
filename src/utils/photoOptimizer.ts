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
 * Optimizes photos preserving full original camera resolution (up to 4K Ultra HD / 3840px+).
 * If the image is already a high-resolution photo under 12MB, it is preserved 100% losslessly
 * without degrading or downsampling.
 */
export async function optimizePhoto(
  file: File,
  maxDimension = 3840,
  quality = 0.92
): Promise<OptimizedPhotoResult> {
  // Step 1: Detect native image dimensions
  let origWidth = 0;
  let origHeight = 0;

  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      let bitmap: ImageBitmap;
      try {
        bitmap = await (createImageBitmap as any)(file, { imageOrientation: 'from-image' });
      } catch {
        bitmap = await createImageBitmap(file);
      }
      origWidth = bitmap.width;
      origHeight = bitmap.height;
      bitmap.close();
    } catch {
      // Ignore, fallback to Image
    }
  }

  if (!origWidth || !origHeight) {
    try {
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve({
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
          });
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Nelze načíst rozměry'));
        };
        img.src = objectUrl;
      });
      origWidth = dims.width;
      origHeight = dims.height;
    } catch {
      // Dimensions could not be read, fallback defaults
      origWidth = 3840;
      origHeight = 2160;
    }
  }

  // Preserve the ORIGINAL file data URL directly for all photos up to 35MB!
  // Zero compression loss, full camera quality (4K, 8K, 12MP, 48MP, etc.)
  const isDirectImage =
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|heic|heif|bmp|tiff?)$/i.test(file.name);

  const sizeMb = file.size / (1024 * 1024);

  if (isDirectImage && sizeMb <= 35) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Nepodařilo se přečíst soubor'));
      reader.readAsDataURL(file);
    });

    return {
      dataUrl,
      width: origWidth || 3840,
      height: origHeight || 2160,
      sizeKb: Math.round(file.size / 1024),
      name: file.name || 'foto.jpg',
      wasDownscaled: false,
    };
  }

  // If huge (e.g. > 12MB or > 4096px), scale smoothly down to 4K Ultra HD (3840px)
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

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
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
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawDataUrl = e.target?.result as string;
        resolve({
          dataUrl: rawDataUrl,
          width: origWidth || 3840,
          height: origHeight || 2160,
          sizeKb: Math.round(file.size / 1024),
          name: file.name || 'foto.jpg',
          wasDownscaled: false,
        });
      };
      reader.onerror = () => reject(new Error('Nepodařilo se načíst soubor'));
      reader.readAsDataURL(file);
    };

    img.src = objectUrl;
  });
}

import { savePhotoBlob } from './dbStorage';

/**
 * Uploads/prepares an optimized 4K photo for direct, robust storage.
 * Works seamlessly with full-stack Node.js server AND with static GitHub Pages hosting.
 */
export async function uploadPhotoToStorage(
  file: File,
  hikeId?: string,
  caption?: string
): Promise<HikePhotoItem> {
  const optimized = await optimizePhoto(file, 3840, 0.90);
  const photoId = 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

  // 1. Try server upload if available
  let serverPhoto: any = null;
  try {
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

    if (res.ok) {
      serverPhoto = await res.json();
    } else if (res.status === 405) {
      console.log('[Storage] Běží statický režim GitHub Pages (405) - ukládám fotografii do trvalého úložiště prohlížeče.');
    }
  } catch {
    console.log('[Storage] Server nedostupný - ukládám do lokálního úložiště prohlížeče.');
  }

  // 2. Always persist photo dataUrl to IndexedDB for offline / GitHub Pages durability
  await savePhotoBlob(photoId, optimized.dataUrl, {
    name: file.name,
    width: optimized.width,
    height: optimized.height,
    sizeKb: optimized.sizeKb,
  });

  return {
    id: serverPhoto?.id || photoId,
    url: serverPhoto?.url || optimized.dataUrl,
    rawUrl: serverPhoto?.rawUrl || optimized.dataUrl,
    dataUrl: optimized.dataUrl,
    name: serverPhoto?.name || file.name,
    caption: caption || '',
    width: serverPhoto?.width || optimized.width,
    height: serverPhoto?.height || optimized.height,
    sizeKb: serverPhoto?.sizeKb || optimized.sizeKb,
    source: 'user',
    createdAt: new Date().toISOString(),
  };
}

import { HikePhotoItem } from '../types';

export interface OptimizedPhotoResult {
  dataUrl: string;
  width: number;
  height: number;
  sizeKb: number;
  name: string;
}

/**
 * Optimizes an image to high resolution (max 2560px 2K Quad HD) with high quality WebP/JPEG encoding.
 * Ensures razor-sharp clarity on 4K PC monitors, Retina displays, and high-DPI mobile phones.
 */
export async function optimizePhoto(
  file: File,
  maxDimension = 2560,
  quality = 0.88
): Promise<OptimizedPhotoResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Chyba inicializace canvas'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
        const sizeKb = Math.round(((base64Length * 3) / 4) / 1024);

        resolve({
          dataUrl,
          width,
          height,
          sizeKb,
          name: file.name,
        });
      };
      img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Nepodařilo se přečíst soubor'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an optimized photo to the dedicated backend storage endpoint.
 */
export async function uploadPhotoToStorage(
  file: File,
  hikeId?: string,
  caption?: string
): Promise<HikePhotoItem> {
  const optimized = await optimizePhoto(file, 2560, 0.88);

  const res = await fetch('/api/photos/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hikeId: hikeId || '',
      dataUrl: optimized.dataUrl,
      name: optimized.name,
      caption: caption || '',
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Nahrávání selhalo (${res.status})`);
  }

  const data = await res.json();
  return {
    id: data.id,
    url: data.url,
    rawUrl: data.rawUrl || data.url,
    dataUrl: optimized.dataUrl,
    name: optimized.name,
    caption: caption || '',
    createdAt: new Date().toISOString(),
  };
}

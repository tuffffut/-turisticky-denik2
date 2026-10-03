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
 * Downscales an image using HTML5 Canvas to 4K Ultra HD (max 3840px) with 0.95 visually lossless quality.
 */
function downscaleCanvas(
  dataUrl: string,
  origWidth: number,
  origHeight: number,
  maxDimension = 3840,
  quality = 0.95,
  fileName = 'photo.webp'
): Promise<OptimizedPhotoResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth || origWidth;
      let height = img.naturalHeight || origHeight;

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
        reject(new Error('Chyba inicializace grafického plátna'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Prefer WebP 0.95, fallback to JPEG 0.95
      let resultDataUrl = canvas.toDataURL('image/webp', quality);
      if (!resultDataUrl.startsWith('data:image/webp')) {
        resultDataUrl = canvas.toDataURL('image/jpeg', quality);
      }

      const base64Length = resultDataUrl.length - (resultDataUrl.indexOf(',') + 1);
      const sizeKb = Math.round(((base64Length * 3) / 4) / 1024);

      resolve({
        dataUrl: resultDataUrl,
        width,
        height,
        sizeKb,
        name: fileName,
        wasDownscaled: true,
      });
    };
    img.onerror = () => reject(new Error('Chyba při dekódování obrázku'));
    img.src = dataUrl;
  });
}

/**
 * Optimizes photos with extreme fidelity:
 * 1. If file is under 1.8 MB (standard photo), keeps 100% of original camera pixels and colors!
 * 2. If file is over 1.8 MB, converts to 4K Ultra HD (3840px) at 0.95 quality (visually lossless).
 */
export async function optimizePhoto(
  file: File,
  maxDimension = 3840,
  quality = 0.95
): Promise<OptimizedPhotoResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const isStandardWebFormat =
        file.type === 'image/jpeg' ||
        file.type === 'image/webp' ||
        file.type === 'image/png';

      const testImg = new Image();
      testImg.onload = () => {
        const width = testImg.naturalWidth || testImg.width;
        const height = testImg.naturalHeight || testImg.height;

        // If file is under 1.8 MB and dimensions fit within 4K, keep 100% original camera bytes!
        if (
          isStandardWebFormat &&
          file.size <= 1.8 * 1024 * 1024 &&
          width <= maxDimension &&
          height <= maxDimension
        ) {
          return resolve({
            dataUrl,
            width,
            height,
            sizeKb: Math.round(file.size / 1024),
            name: file.name,
            wasDownscaled: false,
          });
        }

        // Otherwise scale to 4K Ultra HD with 0.95 quality
        downscaleCanvas(dataUrl, width, height, maxDimension, quality, file.name)
          .then(resolve)
          .catch(reject);
      };

      testImg.onerror = () => {
        downscaleCanvas(dataUrl, 3840, 2160, maxDimension, quality, file.name)
          .then(resolve)
          .catch(reject);
      };

      testImg.src = dataUrl;
    };

    reader.onerror = () => reject(new Error('Nepodařilo se načíst soubor z disku'));
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
  const optimized = await optimizePhoto(file, 3840, 0.95);

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

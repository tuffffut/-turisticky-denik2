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
  sourceUrl: string,
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
    img.src = sourceUrl;
  });
}

/**
 * Optimizes photos with extreme fidelity:
 * 1. If file is under 3.5 MB (standard phone camera photo), keeps 100% of original camera pixels and colors!
 * 2. If file is over 3.5 MB (large RAW / 48-108Mpx), converts to 4K Ultra HD (3840px) at 0.95 quality.
 */
export async function optimizePhoto(
  file: File,
  maxDimension = 3840,
  quality = 0.95
): Promise<OptimizedPhotoResult> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const testImg = new Image();

    testImg.onload = () => {
      const origWidth = testImg.naturalWidth;
      const origHeight = testImg.naturalHeight;

      console.log(
        `[PhotoOptimizer] Soubor: ${file.name}, velikost: ${(file.size / 1024 / 1024).toFixed(2)} MB, detekované rozlišení: ${origWidth}x${origHeight} px`
      );

      // If file is under 3.5 MB and already fits within 4K Ultra HD, preserve 100% original bytes!
      if (
        file.size <= 3.5 * 1024 * 1024 &&
        origWidth <= maxDimension &&
        origHeight <= maxDimension
      ) {
        const reader = new FileReader();
        reader.onload = (e) => {
          URL.revokeObjectURL(objectUrl);
          resolve({
            dataUrl: e.target?.result as string,
            width: origWidth,
            height: origHeight,
            sizeKb: Math.round(file.size / 1024),
            name: file.name,
            wasDownscaled: false,
          });
        };
        reader.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Chyba čtení souboru'));
        };
        reader.readAsDataURL(file);
        return;
      }

      // If larger than 3.5 MB or larger than 4K, scale to 4K Ultra HD (3840px) with 0.95 quality
      downscaleCanvas(objectUrl, origWidth, origHeight, maxDimension, quality, file.name)
        .then((res) => {
          URL.revokeObjectURL(objectUrl);
          resolve(res);
        })
        .catch((err) => {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        });
    };

    testImg.onerror = () => {
      // Fallback: read via FileReader if objectUrl failed
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        downscaleCanvas(dataUrl, 3840, 2160, maxDimension, quality, file.name)
          .then(resolve)
          .catch(reject);
      };
      reader.onerror = () => reject(new Error('Nepodařilo se načíst soubor z disku'));
      reader.readAsDataURL(file);
    };

    testImg.src = objectUrl;
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
      width: optimized.width,
      height: optimized.height,
      sizeKb: optimized.sizeKb,
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
    width: optimized.width,
    height: optimized.height,
    sizeKb: optimized.sizeKb,
    createdAt: new Date().toISOString(),
  };
}

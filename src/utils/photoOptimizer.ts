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
 * Downscales an image using HTML5 Canvas to 2K/3K QHD (max 2880px) with 0.92 high fidelity quality.
 */
function downscaleCanvas(
  sourceUrl: string,
  origWidth: number,
  origHeight: number,
  maxDimension = 2880,
  quality = 0.92,
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

      // Prefer WebP 0.92, fallback to JPEG 0.92
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
 * 1. If file is under 1.5 MB and under 2880px, keeps 100% of original camera pixels and colors!
 * 2. If file is larger, converts to 2K/3K QHD (2880px) at 0.92 quality so it displays crystal clear.
 */
export async function optimizePhoto(
  file: File,
  maxDimension = 2880,
  quality = 0.92
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

      // If file is under 1.5 MB and already fits within 2880px, preserve 100% original bytes!
      if (
        file.size <= 1500 * 1024 &&
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

      // If larger than 1.5 MB or larger than 2880px, scale to high fidelity 2880px with 0.92 quality
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
        downscaleCanvas(dataUrl, 2880, 1620, maxDimension, quality, file.name)
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
  const optimized = await optimizePhoto(file, 2880, 0.92);

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
    rawUrl: data.url,
    dataUrl: optimized.dataUrl,
    name: optimized.name,
    caption: caption || '',
    width: optimized.width,
    height: optimized.height,
    sizeKb: optimized.sizeKb,
    createdAt: new Date().toISOString(),
  };
}

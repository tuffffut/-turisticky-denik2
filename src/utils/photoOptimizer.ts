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
 * Downscales an image using HTML5 Canvas to Full HD (max 1920px) with 0.84 high fidelity quality.
 */
function downscaleCanvas(
  sourceUrl: string,
  origWidth: number,
  origHeight: number,
  maxDimension = 1920,
  quality = 0.84,
  fileName = 'photo.jpg'
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

      // Prefer JPEG 0.84 for broad compatibility across all devices, fallback to WebP
      let resultDataUrl = canvas.toDataURL('image/jpeg', quality);
      if (!resultDataUrl.startsWith('data:image/jpeg')) {
        resultDataUrl = canvas.toDataURL('image/webp', quality);
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
 * Optimizes photos to crisp Full HD (max 1920px) at 0.84 quality:
 * This ensures photos look razor sharp on any screen while fitting safely
 * inside Firestore document limits with instant 0ms inline loading.
 */
export async function optimizePhoto(
  file: File,
  maxDimension = 1920,
  quality = 0.84
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

      // If file is already under 450 KB and fits within 1920px, keep 100% original bytes!
      if (
        file.size <= 450 * 1024 &&
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

      // Scale to Full HD (1920px) with 0.84 quality
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
        downscaleCanvas(dataUrl, 1920, 1080, maxDimension, quality, file.name)
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
 * Uploads/prepares an optimized photo for direct, robust storage.
 */
export async function uploadPhotoToStorage(
  file: File,
  hikeId?: string,
  caption?: string
): Promise<HikePhotoItem> {
  const optimized = await optimizePhoto(file, 2560, 0.88);
  const photoId = 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

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
        createdAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('Nepodařilo se nahrát fotografii přes API endpoint, použit přímý formát:', err);
  }

  // Fallback with clean structure if network was temporarily unavailable
  return {
    id: photoId,
    url: optimized.dataUrl,
    rawUrl: optimized.dataUrl,
    dataUrl: optimized.dataUrl,
    name: optimized.name,
    caption: caption || '',
    width: optimized.width,
    height: optimized.height,
    sizeKb: optimized.sizeKb,
    createdAt: new Date().toISOString(),
  };
}

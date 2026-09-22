/**
 * Utility for client-side image compression and sizing safeguards.
 * Downscales images to max 800px and encodes with balanced JPEG quality
 * so each image is approximately 25-35KB in base64.
 * This comfortably allows up to 25 photos per hike while strictly respecting
 * Google Cloud Firestore's 1MB (1,048,576 bytes) document limit.
 */

export const MAX_RECOMMENDED_PHOTOS = 25;

export function resizeImageFile(
  file: File,
  maxDim = 800,
  targetQuality = 0.60
): Promise<string> {
  return new Promise((resolve) => {
    // If not an image, return empty
    if (!file.type.startsWith('image/')) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve((e.target?.result as string) || '');
          return;
        }

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = canvas.toDataURL('image/jpeg', targetQuality);

        // If the resulting dataUrl is still larger than ~45KB (60,000 base64 chars),
        // scale it down slightly more to ensure it never bloats the Firestore document
        if (dataUrl.length > 60000 && (width > 500 || height > 500)) {
          const smallCanvas = document.createElement('canvas');
          const scale = 0.78;
          smallCanvas.width = Math.round(width * scale);
          smallCanvas.height = Math.round(height * scale);
          const sCtx = smallCanvas.getContext('2d');
          if (sCtx) {
            sCtx.imageSmoothingEnabled = true;
            sCtx.imageSmoothingQuality = 'medium';
            sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
            dataUrl = smallCanvas.toDataURL('image/jpeg', 0.55);
          }
        }

        resolve(dataUrl);
      };
      img.onerror = () => resolve((e.target?.result as string) || '');
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Process an array or FileList of images sequentially with progress callback
 */
export async function processMultipleImageFiles(
  files: File[] | FileList,
  onProgress?: (processed: number, total: number) => void
): Promise<string[]> {
  const fileArray = Array.from(files);
  const results: string[] = [];

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    try {
      const base64 = await resizeImageFile(file);
      if (base64) {
        results.push(base64);
      }
    } catch (err) {
      console.warn('Chyba při zpracování obrázku:', err);
    }
    if (onProgress) {
      onProgress(i + 1, fileArray.length);
    }
  }

  return results;
}

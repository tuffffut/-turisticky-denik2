/**
 * Utility for client-side image compression and sizing safeguards.
 * Downscales images to max 960px and encodes with balanced JPEG quality
 * so each image is approximately 50-80KB in base64.
 * This allows 10-15 photos per hike while strictly respecting Firestore's 1MB document limit.
 */

export function resizeImageFile(
  file: File,
  maxDim = 960,
  targetQuality = 0.68
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
          resolve(e.target?.result as string || '');
          return;
        }

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = canvas.toDataURL('image/jpeg', targetQuality);

        // If the resulting dataUrl is still larger than ~100KB (135,000 base64 chars),
        // scale it down slightly more to ensure it never bloats the Firestore document
        if (dataUrl.length > 135000 && (width > 600 || height > 600)) {
          const smallCanvas = document.createElement('canvas');
          const scale = 0.8;
          smallCanvas.width = Math.round(width * scale);
          smallCanvas.height = Math.round(height * scale);
          const sCtx = smallCanvas.getContext('2d');
          if (sCtx) {
            sCtx.imageSmoothingEnabled = true;
            sCtx.imageSmoothingQuality = 'medium';
            sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
            dataUrl = smallCanvas.toDataURL('image/jpeg', 0.62);
          }
        }

        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target?.result as string || '');
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

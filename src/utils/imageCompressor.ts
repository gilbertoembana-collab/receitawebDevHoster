/**
 * Utility to process, scale and compress images to a maximum target size (default 70 KB)
 * using standard HTML5 Canvas without any external library dependencies.
 */

export interface CompressedImageResult {
  base64: string;
  sizeBytes: number;
  sizeKB: number;
  width: number;
  height: number;
}

/**
 * Calculates byte length of a base64 Data URL
 */
export function getBase64SizeBytes(base64String: string): number {
  const base64Data = base64String.split(',')[1] || base64String;
  const padding = (base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0);
  return (base64Data.length * (3 / 4)) - padding;
}

/**
 * Compresses an image file, blob, or base64 string to a maximum of `maxKB` (default 70 KB).
 */
export async function compressImageToMaxKB(
  source: File | Blob | string,
  maxKB: number = 70,
  maxDimension: number = 480
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Maintain aspect ratio while scaling to maxDimension
      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      // Draw background white for transparent png conversion to jpeg
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const maxBytes = maxKB * 1024;
      let quality = 0.85;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      let sizeBytes = getBase64SizeBytes(dataUrl);

      // Binary search / step-down quality and scale if still above maxKB
      let attempts = 0;
      while (sizeBytes > maxBytes && attempts < 10) {
        attempts++;
        if (quality > 0.4) {
          quality -= 0.1;
        } else {
          // If quality reached lower bound, downscale dimensions by 15%
          width = Math.round(width * 0.85);
          height = Math.round(height * 0.85);
          canvas.width = width;
          canvas.height = height;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          quality = 0.7;
        }
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        sizeBytes = getBase64SizeBytes(dataUrl);
      }

      resolve({
        base64: dataUrl,
        sizeBytes,
        sizeKB: Math.round((sizeBytes / 1024) * 10) / 10,
        width,
        height
      });
    };

    img.onerror = (err) => {
      reject(err);
    };

    if (typeof source === 'string') {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(source);
    }
  });
}

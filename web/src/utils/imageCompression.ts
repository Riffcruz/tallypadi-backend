/**
 * Compresses an image file using Canvas API.
 * @param file The input File object.
 * @param maxWidth Maximum width in pixels (default 1600).
 * @param quality JPEG quality 0-1 (default 0.8).
 */
export async function compressImage(
  file: File, 
  maxWidth = 1600, 
  quality = 0.8
): Promise<File> {
  // If not an image, return original
  if (!file.type.startsWith('image/')) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback to original if canvas fails
        return resolve(file);
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file); // Fallback

          // Create new File from blob
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          // Only return compressed if it's smaller
          if (compressedFile.size < file.size) {
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      resolve(file); // Fallback on error
    };

    img.src = url;
  });
}

import { compressImage } from './imageCompression';

/**
 * Uploads a file to Cloudflare R2 via a presigned URL from the backend.
 * Includes automatic client-side compression for images.
 */
export async function uploadToR2(
  file: File, 
  token: string, 
  onProgress?: (percent: number) => void
): Promise<string> {
  const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  try {
    // 1. Compress if image
    const fileToUpload = await compressImage(file);

    // 2. Get Presigned URL
    const presignRes = await fetch(`${NEXT_PUBLIC_API_URL}/uploads/presign`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mime: fileToUpload.type,
        ext: fileToUpload.name.split('.').pop() || 'jpg',
      }),
    });

    if (!presignRes.ok) {
      const err = await presignRes.json();
      throw new Error(err.error || 'Failed to get upload URL');
    }

    const { uploadUrl, publicUrl } = await presignRes.json();

    // 3. Upload to R2 (XHR for progress)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', fileToUpload.type);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(fileToUpload);
    });

    return publicUrl;
  } catch (error) {
    console.error('Upload Error:', error);
    throw error;
  }
}

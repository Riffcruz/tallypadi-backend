// web/src/utils/uploadToR2.ts

export async function uploadToR2(file: File, token: string): Promise<string> {
  const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'; // Adjust as needed for your frontend env

  if (!NEXT_PUBLIC_API_URL) {
    throw new Error('NEXT_PUBLIC_API_URL is not defined');
  }

  // 1. Ask backend for a presigned PUT URL
  const presignResponse = await fetch(`${NEXT_PUBLIC_API_URL}/uploads/presign`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mime: file.type,
      ext: file.name.split('.').pop() || 'jpg',
    }),
  });

  if (!presignResponse.ok) {
    const errorData = await presignResponse.json();
    throw new Error(`Failed to get presigned URL: ${errorData.error || presignResponse.statusText}`);
  }

  const { uploadUrl, publicUrl } = await presignResponse.json();

  if (!uploadUrl || !publicUrl) {
    throw new Error('Invalid response from presign endpoint: missing uploadUrl or publicUrl');
  }

  // 2. Upload file directly to R2 via PUT
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload file to R2: ${uploadResponse.statusText}`);
  }

  // 3. Return public CDN URL
  return publicUrl;
}
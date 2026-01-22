import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { env } from '../config/env';

// Configure S3Client for Cloudflare R2
const S3 = new S3Client({
  endpoint: `https://${env.cfAccountId}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
  },
});

const randomHex = (size: number) => crypto.randomBytes(size).toString('hex');

export const r2Service = {
  /**
   * Generates a presigned URL for uploading a file to R2.
   */
  async getPresignedPutUrl(mime: string, ext: string) {
    const sanitizedExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
    const finalExt = sanitizedExt || 'jpg';
    const key = `uploads/${Date.now()}-${randomHex(8)}.${finalExt}`;

    const command = new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      ContentType: mime,
    });

    const uploadUrl = await getSignedUrl(S3, command, { expiresIn: 60 });
    const publicUrl = `${env.r2PublicBaseUrl}/${key}`;

    return { key, uploadUrl, publicUrl };
  },

  /**
   * Deletes a file from R2 if the URL matches our R2 public domain.
   * Best-effort: logs error but does not throw.
   */
  async deleteFile(fileUrl: string) {
    if (!fileUrl || !fileUrl.startsWith(env.r2PublicBaseUrl)) {
      return; // Not hosted on our R2, or invalid
    }

    try {
      // Extract key: remove base URL + slash
      // e.g. https://cdn.tallypadi.com/uploads/123.jpg -> uploads/123.jpg
      const key = fileUrl.replace(`${env.r2PublicBaseUrl}/`, '');
      
      const command = new DeleteObjectCommand({
        Bucket: env.r2Bucket,
        Key: key,
      });

      await S3.send(command);
      console.log(`🗑️ R2: Deleted old file ${key}`);
    } catch (error) {
      console.error(`⚠️ R2 Delete Error for ${fileUrl}:`, error);
      // Suppress error to avoid breaking the main request
    }
  },
};

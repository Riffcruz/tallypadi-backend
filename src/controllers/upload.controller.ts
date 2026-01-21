import { Request, Response } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

// Helper to generate a random hex string
const randomHex = (size: number) => crypto.randomBytes(size).toString('hex');

// Load environment variables for R2
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL; // e.g. https://cdn.tallypadi.com

// Validate environment variables
if (!CF_ACCOUNT_ID) throw new Error('CF_ACCOUNT_ID is not set in environment variables');
if (!R2_ACCESS_KEY_ID) throw new Error('R2_ACCESS_KEY_ID is not set in environment variables');
if (!R2_SECRET_ACCESS_KEY) throw new Error('R2_SECRET_ACCESS_KEY is not set in environment variables');
if (!R2_BUCKET) throw new Error('R2_BUCKET is not set in environment variables');
if (!R2_PUBLIC_BASE_URL) throw new Error('R2_PUBLIC_BASE_URL is not set in environment variables');


// Configure S3Client for Cloudflare R2
const S3 = new S3Client({
  endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto', // Cloudflare R2 does not use AWS regions, 'auto' is a common workaround
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// Upload (PUT) uses presigned URL on r2.cloudflarestorage.com
// Public read uses R2_PUBLIC_BASE_URL custom domain
export const presignUpload = async (req: Request, res: Response) => {
  const { mime, ext } = req.body;

  if (!mime || !ext) {
    return res.status(400).json({ error: 'Missing mime or ext' });
  }

  // Validate MIME type
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(mime)) {
    return res.status(400).json({ error: 'Unsupported MIME type' });
  }

  // Sanitize extension: lower-case alphanumeric only, fallback "jpg"
  const sanitizedExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  const finalExt = sanitizedExt || 'jpg';

  // Generate unique key
  const key = `uploads/${Date.now()}-${randomHex(8)}.${finalExt}`;

  // Create PutObjectCommand
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: mime,
  });

  try {
    // Generate presigned URL, valid for 60 seconds
    const uploadUrl = await getSignedUrl(S3, command, { expiresIn: 60 });
    const publicUrl = `${R2_PUBLIC_BASE_URL}/${key}`;

    return res.json({ key, uploadUrl, publicUrl });
  } catch (error) {
    console.error('Error generating R2 presigned URL:', error);
    return res.status(500).json({ error: 'Failed to generate upload URL' });
  }
};

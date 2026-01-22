import { Request, Response } from 'express';
import { r2Service } from '../services/r2.service';

export const presignUpload = async (req: Request, res: Response) => {
  try {
    const { mime, ext } = req.body;

    if (!mime || !ext) {
      return res.status(400).json({ error: 'Missing mime or ext' });
    }

    // Validate MIME type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(mime)) {
      return res.status(400).json({ error: 'Unsupported MIME type' });
    }

    const result = await r2Service.getPresignedPutUrl(mime, ext);
    return res.json(result);
  } catch (error) {
    console.error('Error generating R2 presigned URL:', error);
    return res.status(500).json({ error: 'Failed to generate upload URL' });
  }
};
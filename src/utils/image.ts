import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Decodes a base64 string and saves it to public/uploads.
 * Returns the public URL path (e.g., '/uploads/image.png').
 * Returns null if invalid or error.
 */
export const saveImageFromBase64 = (base64String: unknown): string | null => {
  if (typeof base64String !== 'string') return null;

  // Check if it's already a URL (basic check)
  if (base64String.startsWith('http') || base64String.startsWith('/')) {
    return base64String;
  }

  // Expect format: "data:image/png;base64,iVBORw0KGgo..."
  const matches = base64String.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);

  if (!matches || matches.length !== 3) {
    // Maybe it's just raw base64? (Less likely for <img> src, but possible)
    return null;
  }

  const ext = matches[1]; // png, jpeg, etc.
  const data = matches[2];
  const buffer = Buffer.from(data, 'base64');

  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Generate unique filename
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const filePath = path.join(uploadsDir, filename);

  try {
    fs.writeFileSync(filePath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving image:', err);
    return null;
  }
};

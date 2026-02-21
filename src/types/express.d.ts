import { Document } from 'mongoose';

declare global {
  namespace Express {
    export interface Request {
      user?: { id: string; role?: string };
      admin?: any;
      rawBody?: Buffer;
      signatureValid?: boolean;
    }
  }
}

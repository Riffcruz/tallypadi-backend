import { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
  getMarketplaceListingsFromReadModel,
  getMarketplaceProductFromReadModel,
} from '../services/marketplaceIndex.service';
import { PUBLIC_MARKETPLACE_CACHE } from '../services/marketplaceQuery.service';
import { queueMarketplaceReconcile } from '../services/queue.service';

export const getMarketplaceListings = async (req: Request, res: Response): Promise<any> => {
  try {
    res.set('Cache-Control', PUBLIC_MARKETPLACE_CACHE);

    const payload = await getMarketplaceListingsFromReadModel(req.query as Record<string, unknown>);

    if (payload.products.length === 0 && Number(req.query.page || 1) === 1) {
      queueMarketplaceReconcile('empty-marketplace-page').catch(() => undefined);
    }

    return res.json(payload);
  } catch (error) {
    console.error('Marketplace listings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMarketplaceProductById = async (req: Request, res: Response): Promise<any> => {
  try {
    res.set('Cache-Control', PUBLIC_MARKETPLACE_CACHE);

    const productId = String(req.params.productId || '');
    if (!Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const product = await getMarketplaceProductFromReadModel(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    return res.json({ product });
  } catch (error) {
    console.error('Marketplace product error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

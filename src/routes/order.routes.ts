import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrder,
  updateOrder,
  deleteOrder,
  acceptStorefrontOrder,
  declineStorefrontOrder,
} from '../controllers/order.controller';

const router = Router();

// POST /api/orders
router.post('/', createOrder);

// GET /api/orders
router.get('/', getOrders);

router.post('/:id/accept', acceptStorefrontOrder);
router.post('/:id/decline', declineStorefrontOrder);

// GET /api/orders/:id
router.get('/:id', getOrder);

// PUT /api/orders/:id
router.put('/:id', updateOrder);

// DELETE /api/orders/:id
router.delete('/:id', deleteOrder);

export default router;

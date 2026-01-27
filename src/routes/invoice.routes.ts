import { Router } from 'express';
import {
  createInvoice,
  getInvoices,
  getInvoice,
  updateInvoiceStatus,
  deleteInvoice
} from '../controllers/invoice.controller';

const router = Router();

// /api/invoices
router.get('/', getInvoices);
router.get('/:id', getInvoice);
router.post('/', createInvoice);
router.put('/:id', updateInvoiceStatus);
router.delete('/:id', deleteInvoice);

export default router;

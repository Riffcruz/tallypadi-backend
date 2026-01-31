import { Router } from 'express';
import {
  createInvoice,
  getInvoices,
  getInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  getInvoicePdf
} from '../controllers/invoice.controller';

const router = Router();

// /api/invoices
router.get('/', getInvoices);
router.get('/:id', getInvoice);
router.get('/:id/pdf', getInvoicePdf); // ✅ Dynamic PDF generation
router.post('/', createInvoice);
router.put('/:id', updateInvoiceStatus);
router.delete('/:id', deleteInvoice);

export default router;

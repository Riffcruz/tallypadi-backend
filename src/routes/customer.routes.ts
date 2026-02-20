import { Router } from 'express';
import { authRequired } from '../middleware/authRequired';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer
} from '../controllers/customer.controller';

const router = Router();

// All customer CRM routes require authentication (Owner or Staff)
router.use(authRequired);

router.get('/', getCustomers);
router.post('/', createCustomer);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

export default router;

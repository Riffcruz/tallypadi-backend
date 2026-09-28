import { Router } from 'express';
import { authRequired } from '../middleware/authRequired';
import { requireStaffPermission } from '../middleware/staffPermission';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer
} from '../controllers/customer.controller';

const router = Router();

// All customer CRM routes require authentication (Owner or Staff)
router.use(authRequired);
router.use(requireStaffPermission('canManageCustomers'));

router.get('/', getCustomers);
router.post('/', createCustomer);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

export default router;

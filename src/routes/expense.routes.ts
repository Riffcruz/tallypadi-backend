import { Router } from 'express';
import { createExpense, getExpenses, deleteExpense } from '../controllers/expense.controller';
import { authRequired } from '../middleware/authRequired';

const router = Router();

router.use(authRequired); // Protect all expense routes

router.post('/', createExpense);
router.get('/', getExpenses);
router.delete('/:id', deleteExpense);

export default router;

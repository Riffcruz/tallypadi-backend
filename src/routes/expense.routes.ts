import { Router } from 'express';
import { createExpense, getExpenses, deleteExpense, getExpenseCategories } from '../controllers/expense.controller';
import { authRequired } from '../middleware/authRequired';

const router = Router();

router.use(authRequired); // Protect all expense routes

router.get('/categories', getExpenseCategories);
router.post('/', createExpense);
router.get('/', getExpenses);
router.delete('/:id', deleteExpense);

export default router;

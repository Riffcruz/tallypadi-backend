import { Router } from 'express';
import {
  getActivities,
  getUnreadActivityCount,
  markActivityRead,
  markAllActivitiesRead,
} from '../controllers/activity.controller';

const router = Router();

router.get('/', getActivities);
router.get('/unread-count', getUnreadActivityCount);
router.patch('/read-all', markAllActivitiesRead);
router.patch('/:id/read', markActivityRead);

export default router;

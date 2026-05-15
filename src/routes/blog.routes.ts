import { Router } from 'express';
import {
  getPublishedBlogPostBySlug,
  listPublishedBlogPosts,
} from '../controllers/blog.controller';

const router = Router();

router.get('/', listPublishedBlogPosts);
router.get('/:slug', getPublishedBlogPostBySlug);

export default router;

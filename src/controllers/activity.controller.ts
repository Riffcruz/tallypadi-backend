import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Activity, IActivity } from '../models/activity.model';
import { User } from '../models/user.model';

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const resolveActivityUserId = async (req: Request) => {
  const userId = req.user?.id;
  if (!userId) return null;

  const user = await User.findById(userId).select('_id role ownerId');
  if (!user) return null;

  if (user.role === 'STAFF' && user.ownerId) return user.ownerId;
  return user._id;
};

const serializeActivity = (activity: IActivity) => {
  const actor = activity.actor as any;
  const actorPayload = actor && typeof actor === 'object' && actor._id
    ? {
        id: String(actor._id),
        name: actor.name || actor.businessName || actor.phoneNumber || 'User',
        role: actor.role || null,
      }
    : null;

  return {
    id: String(activity._id),
    type: activity.type,
    title: activity.title,
    message: activity.message,
    amount: activity.amount ?? null,
    metadata: activity.metadata ?? null,
    isRead: activity.isRead,
    readAt: activity.readAt ? activity.readAt.toISOString() : null,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
    actor: actorPayload,
  };
};

export const getActivities = async (req: Request, res: Response) => {
  try {
    const activityUserId = await resolveActivityUserId(req);
    if (!activityUserId) return res.status(401).json({ error: 'Unauthorized' });

    const page = clampNumber(req.query.page, 1, 1, 100000);
    const limit = clampNumber(req.query.limit, 20, 1, 50);
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { user: activityUserId };
    if (String(req.query.unread || '') === 'true') query.isRead = false;
    if (req.query.type) query.type = String(req.query.type);

    const [activities, total, unreadCount] = await Promise.all([
      Activity.find(query)
        .populate('actor', 'name businessName phoneNumber role')
        .sort({ isRead: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Activity.countDocuments(query),
      Activity.countDocuments({ user: activityUserId, isRead: false }),
    ]);

    return res.json({
      activities: activities.map(serializeActivity),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    });
  } catch (error) {
    console.error('Get activities error:', error);
    return res.status(500).json({ error: 'Failed to fetch activities' });
  }
};

export const getUnreadActivityCount = async (req: Request, res: Response) => {
  try {
    const activityUserId = await resolveActivityUserId(req);
    if (!activityUserId) return res.status(401).json({ error: 'Unauthorized' });

    const count = await Activity.countDocuments({ user: activityUserId, isRead: false });
    return res.json({ count });
  } catch (error) {
    console.error('Get unread activity count error:', error);
    return res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

export const markActivityRead = async (req: Request, res: Response) => {
  try {
    const activityUserId = await resolveActivityUserId(req);
    if (!activityUserId) return res.status(401).json({ error: 'Unauthorized' });

    const id = String(req.params.id || '');
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid activity ID' });
    }

    const activity = await Activity.findOneAndUpdate(
      { _id: id, user: activityUserId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    ).populate('actor', 'name businessName phoneNumber role');

    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    return res.json({ activity: serializeActivity(activity) });
  } catch (error) {
    console.error('Mark activity read error:', error);
    return res.status(500).json({ error: 'Failed to mark activity read' });
  }
};

export const markAllActivitiesRead = async (req: Request, res: Response) => {
  try {
    const activityUserId = await resolveActivityUserId(req);
    if (!activityUserId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await Activity.updateMany(
      { user: activityUserId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return res.json({ success: true, modifiedCount: result.modifiedCount || 0 });
  } catch (error) {
    console.error('Mark all activities read error:', error);
    return res.status(500).json({ error: 'Failed to mark activities read' });
  }
};

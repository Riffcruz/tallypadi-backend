import { Types } from 'mongoose';
import { Activity, ActivityType } from '../models/activity.model';

type ObjectIdLike = string | Types.ObjectId;

interface RecordActivityInput {
  user: ObjectIdLike;
  actor?: ObjectIdLike | null;
  type: ActivityType;
  title: string;
  message: string;
  amount?: number | null;
  metadata?: Record<string, unknown> | null;
}

const toObjectId = (value: ObjectIdLike) => {
  if (value instanceof Types.ObjectId) return value;
  return new Types.ObjectId(String(value));
};

export const activityService = {
  async recordActivity(input: RecordActivityInput) {
    return Activity.create({
      user: toObjectId(input.user),
      actor: input.actor ? toObjectId(input.actor) : null,
      type: input.type,
      title: input.title,
      message: input.message,
      amount: input.amount ?? null,
      metadata: input.metadata ?? null,
    });
  },

  async recordActivitySafely(input: RecordActivityInput) {
    try {
      return await this.recordActivity(input);
    } catch (error) {
      console.error('Activity record failed:', error);
      return null;
    }
  },
};

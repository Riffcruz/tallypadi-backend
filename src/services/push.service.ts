import webpush from 'web-push';
import { PushSubscription } from '../models/pushSubscription.model';
import { queuePushNotification } from './queue.service';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:support@tallypadi.com';

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey);
} else {
  console.warn('⚠️ VAPID keys not set. Push notifications will not work.');
}

// ✅ PUBLIC API: Adds to Queue
export const sendPushNotification = async (agentId: string, payload: { title: string; body: string; data?: any }) => {
  await queuePushNotification({
    type: 'SINGLE',
    agentId,
    title: payload.title,
    body: payload.body,
    data: payload.data
  });
};

export const sendGlobalPushNotification = async (payload: { title: string; body: string; data?: any }) => {
  await queuePushNotification({
    type: 'GLOBAL',
    title: payload.title,
    body: payload.body,
    data: payload.data
  });
};

// ✅ WORKER LOGIC: Executes Sending
export const executePushNotification = async (agentId: string, payload: { title: string; body: string; data?: any }) => {
  try {
    const subscriptions = await PushSubscription.find({ agentId });
    if (!subscriptions.length) return;

    const notification = JSON.stringify(payload);

    const promises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys
        }, notification);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired or gone
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.error('Push error for sub:', sub._id, err);
        }
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Error executing push notification:', error);
    throw error; // Let worker retry
  }
};

export const executeGlobalPushNotification = async (payload: { title: string; body: string; data?: any }) => {
  try {
    // Send to ALL subscriptions (Admins + Agents)
    const subscriptions = await PushSubscription.find({});
    if (!subscriptions.length) return;

    const notification = JSON.stringify(payload);

    const promises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: sub.keys
        }, notification);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.error('Push error for global sub:', sub._id, err);
        }
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Error executing global push notification:', error);
    throw error; // Let worker retry
  }
};

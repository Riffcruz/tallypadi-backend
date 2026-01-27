import webpush from 'web-push';
import { PushSubscription } from '../models/pushSubscription.model';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:support@tallypadi.com';

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey);
} else {
  console.warn('⚠️ VAPID keys not set. Push notifications will not work.');
}

export const sendPushNotification = async (agentId: string, payload: { title: string; body: string; data?: any }) => {
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
    console.error('Error sending push notification:', error);
  }
};

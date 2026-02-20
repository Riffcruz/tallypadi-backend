'use client';
import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import axios from 'axios';
import { getCookie } from '../utils/cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// ⚠️ This must match your VAPID_PUBLIC_KEY environment variable on the server
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeAndSave(token: string): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Already subscribed — sync to backend
      await axios.post(`${API_URL}/shop/push/subscribe`, existing.toJSON(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      return true;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY not set');
      return false;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await axios.post(`${API_URL}/shop/push/subscribe`, subscription.toJSON(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    return true;
  } catch (err) {
    console.error('Push subscribe error:', err);
    return false;
  }
}

export default function PushNotificationPrompt() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only run on client, after mount
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (dismissed) return;
    
    // Don't show if already granted
    if (Notification.permission === 'granted') {
      // Silently try to sync subscription if already granted
      const token = getCookie('tallyToken');
      if (token) {
        navigator.serviceWorker.ready.then(async (reg) => {
          const existing = await reg.pushManager.getSubscription();
          if (existing) {
            axios.post(`${API_URL}/shop/push/subscribe`, existing.toJSON(), {
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {}); // silently fail
          }
        });
      }
      return;
    }

    // Show banner if permission not yet decided
    if (Notification.permission === 'default') {
      // Small delay so it doesn't pop up immediately
      const t = setTimeout(() => setShow(true), 2500);
      return () => clearTimeout(t);
    }
  }, [dismissed]);

  const handleEnable = async () => {
    setShow(false);
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = getCookie('tallyToken');
      if (token) await subscribeAndSave(token);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[9999] animate-in slide-in-from-bottom duration-300">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/30 p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <Bell className="w-5 h-5 text-emerald-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-snug">
            Enable Push Notifications
          </p>
          <p className="text-xs text-slate-400 mt-0.5 leading-snug">
            Get instant alerts for new sales, broadcasts &amp; updates.
          </p>
          <button
            onClick={handleEnable}
            className="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-xl transition-colors"
          >
            🔔 Enable Notifications
          </button>
        </div>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

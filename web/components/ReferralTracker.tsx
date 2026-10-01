'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

export default function ReferralTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utmSource = String(params.get('utm_source') || '').toLowerCase();
    let referrerHost = '';
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
    } catch {
      referrerHost = '';
    }

    const isChatGpt = utmSource === 'chatgpt.com'
      || utmSource === 'chatgpt'
      || referrerHost === 'chatgpt.com'
      || referrerHost.endsWith('.chatgpt.com');
    if (!isChatGpt) return;

    const key = `tallypadi:traffic:chatgpt:${pathname}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    fetch(`${API_URL}/public/traffic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'chatgpt', path: pathname || '/' }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}

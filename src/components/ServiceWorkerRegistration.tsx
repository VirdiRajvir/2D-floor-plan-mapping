'use client';

import { useEffect } from 'react';

/**
 * Registers the SafeMap service worker for offline/PWA support.
 * Must be a client component since layout.tsx is a server component.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(() => {
          // SW registration is non-fatal — app works fine without it
        });
    }
  }, []);

  return null;
}

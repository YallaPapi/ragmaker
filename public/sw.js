// Minimal service worker (optional offline scaffolding)
// This file exists to avoid 404s from client-chat's SW registration.

self.addEventListener('install', (event) => {
  // Skip waiting so updates apply immediately on refresh
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim clients so the SW becomes active without reloads
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch; no caching by default
self.addEventListener('fetch', () => {
  // Intentionally no-op; can add caching later
});


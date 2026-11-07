/**
 * Service worker for the Ollama web UI.
 * Caches only the exact app shell and imported static assets. Never caches the Ollama API.
 */

const CACHE_NAME = 'ollama-web-ui';
const APP_SHELL = ['/', '/index.html'];
let appAssets = new Set();

function normalizeAsset(asset) {
    if (!asset) return null;

    const parsed = new URL(asset, self.location.href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
    }

    return parsed.origin === self.location.origin
        ? `${parsed.pathname}${parsed.search}`
        : parsed.href;
}

function cacheAssets() {
    const entries = [...new Set([...APP_SHELL, ...appAssets])].filter(Boolean);
    return caches.open(CACHE_NAME).then((cache) => cache.addAll(entries).catch(() => undefined));
}

async function fetchWithEtagValidation(request) {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = request.mode === 'navigate' ? '/index.html' : request;
    const cached = await cache.match(cacheKey);
    const etag = cached && cached.headers.get('ETag');

    if (!etag) {
        try {
            const response = await fetch(request);
            if (response.ok) {
                await cache.put(cacheKey, response.clone());
            }
            return response;
        } catch (error) {
            return cached || Response.error();
        }
    }

    const headers = new Headers(request.headers);
    headers.set('If-None-Match', etag);

    try {
        const response = await fetch(new Request(request, { headers }));

        if (response.status === 304 && cached) {
            return cached;
        }

        if (response.ok) {
            await cache.put(cacheKey, response.clone());
            return response;
        }

        return cached || response;
    } catch (error) {
        return cached || Response.error();
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        cacheAssets().then(() => self.skipWaiting()).catch(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
                return null;
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    const data = event.data || {};

    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }

    if (data.type !== 'SET_ASSETS') return;

    appAssets = new Set((data.assets || []).map(normalizeAsset).filter(Boolean));
    event.waitUntil(cacheAssets());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const canonicalUrl = url.origin === self.location.origin
        ? `${url.pathname}${url.search}`
        : url.href;

    const isAppAsset = APP_SHELL.includes(canonicalUrl) || appAssets.has(canonicalUrl);
    if (!isAppAsset) return;

    event.respondWith(fetchWithEtagValidation(request));
});
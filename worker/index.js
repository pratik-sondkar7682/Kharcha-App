/**
 * Kharcha — Cloudflare Worker: Gemini API Proxy
 *
 * Keeps the Google Gemini API key server-side. The app sends requests here
 * instead of directly to generativelanguage.googleapis.com.
 *
 * Deploy:
 *   npm install -g wrangler
 *   wrangler login
 *   wrangler secret put GEMINI_API_KEY      ← paste your Google AI API key when prompted
 *   wrangler secret put PROXY_SECRET        ← any random string
 *   wrangler deploy
 *
 * The deployed URL goes into EXPO_PUBLIC_AI_PROXY_URL in your .env
 * The proxy secret goes into EXPO_PUBLIC_PROXY_SECRET in your .env
 */

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export default {
  async fetch(request, env) {
    // Only accept POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Simple shared-secret check so only your app can call this worker.
    // Set the same value in your .env as EXPO_PUBLIC_PROXY_SECRET.
    const appSecret = request.headers.get('x-proxy-secret');
    if (!env.PROXY_SECRET || appSecret !== env.PROXY_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const geminiResponse = await fetch(
      `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    const responseBody = await geminiResponse.text();

    return new Response(responseBody, {
      status: geminiResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

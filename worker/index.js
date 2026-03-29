/**
 * Kharcha — Cloudflare Worker: Claude API Proxy
 *
 * Keeps the Anthropic API key server-side. The app sends requests here
 * instead of directly to api.anthropic.com.
 *
 * Deploy:
 *   npm install -g wrangler
 *   wrangler login
 *   wrangler secret put ANTHROPIC_API_KEY      ← paste your sk-ant key when prompted
 *   wrangler deploy
 *
 * The deployed URL goes into EXPO_PUBLIC_AI_PROXY_URL in your .env
 */

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

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const responseBody = await anthropicResponse.text();

    return new Response(responseBody, {
      status: anthropicResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

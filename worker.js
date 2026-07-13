/**
 * Kaya Dashboard Worker
 * Serves static assets and handles review suggestions via KV.
 *
 * GET  /review  → list all suggestions (HTML in browser, JSON for API)
 * POST /review  → store a new suggestion
 * Everything else → static assets
 */
export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    if (url.pathname === '/review') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }
      if (request.method === 'POST') return handlePost(request, env);
      if (request.method === 'GET')  return handleGet(request, env);
    }

    // Everything else: static assets
    return env.ASSETS.fetch(request);
  }
};

// ── POST /review ────────────────────────────────────────────────────
async function handlePost(request, env) {
  try {
    if (!env.REVIEWS) return json({ ok: false, error: 'KV not bound' }, 503);

    var body = await request.json();
    if (!body.request || !body.url) return json({ ok: false, error: 'Missing fields' }, 400);

    var reviews = (await env.REVIEWS.get('all', { type: 'json' })) || [];

    reviews.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: body.timestamp || Date.now(),
      url: body.url,
      page: body.page || '',
      selector: body.selector || '',
      text: (body.text || '').substring(0, 500),
      request: body.request
    });

    await env.REVIEWS.put('all', JSON.stringify(reviews));
    return json({ ok: true, count: reviews.length });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}

// ── GET /review ─────────────────────────────────────────────────────
async function handleGet(request, env) {
  if (!env.REVIEWS) return json({ ok: false, reviews: [] }, 503);

  var reviews = (await env.REVIEWS.get('all', { type: 'json' })) || [];
  var accept = request.headers.get('Accept') || '';

  if (accept.includes('text/html')) {
    return new Response(renderPage(reviews), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
  return json({ ok: true, reviews: reviews });
}

// ── Helpers ─────────────────────────────────────────────────────────
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPage(reviews) {
  var rows = reviews.length === 0
    ? '<p style="color:#8a8378">No suggestions yet.</p>'
    : reviews.slice().reverse().map(function (r) {
        return '<div style="background:#fff;border:1px solid #e5ddd0;border-radius:4px;padding:16px;margin-bottom:12px">'
          + '<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#8a8378;margin-bottom:6px">'
          + new Date(r.timestamp).toLocaleString('en-GB') + ' &mdash; ' + esc(r.page)
          + '</div>'
          + '<div style="font-size:14px;margin-bottom:6px"><strong>Element:</strong> '
          + '<code style="font-size:12px;background:#f4efe6;padding:2px 6px;border-radius:2px">' + esc(r.selector) + '</code></div>'
          + '<div style="font-size:13px;color:#5a544a;margin-bottom:8px"><strong>Current text:</strong> ' + esc(r.text) + '</div>'
          + '<div style="font-size:14px;color:#b8421a;font-weight:600">' + esc(r.request) + '</div>'
          + '</div>';
      }).join('');

  return '<!DOCTYPE html><html lang="en"><head>'
    + '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
    + '<title>Kaya Dashboard — Edit Suggestions</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">'
    + '<style>body{font-family:Inter,system-ui,sans-serif;background:#f4efe6;color:#1a1814;max-width:720px;margin:40px auto;padding:20px}'
    + 'h1{font-weight:800;margin-bottom:24px}code{font-family:"JetBrains Mono",monospace}</style>'
    + '</head><body>'
    + '<h1>Edit suggestions</h1>'
    + '<p style="font-size:14px;color:#5a544a;margin-bottom:24px">' + reviews.length + ' suggestion' + (reviews.length === 1 ? '' : 's') + '</p>'
    + rows
    + '</body></html>';
}

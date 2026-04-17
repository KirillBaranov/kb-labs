/**
 * KB Labs site analytics — sends events to the KB Labs Gateway.
 *
 * Uses the same /auth/register → /auth/token → /telemetry/v1/ingest flow
 * as the CLI launcher. Credentials are stored in localStorage so registration
 * happens only once per browser. All calls are fire-and-forget; errors are
 * silently dropped so analytics never affect page load.
 *
 * Tracks:
 *   page_view         — every navigation (path, referrer, utm_*)
 *   install_cta_click — user clicks any element with data-analytics="install_cta"
 *   docs_cta_click    — user clicks any element with data-analytics="docs_cta"
 *   outbound_click    — user clicks any external link
 *
 * Usage: <script src="/analytics.js" defer></script>
 * Add data-analytics="install_cta" to your install buttons/links.
 */

(function () {
  'use strict';

  var GATEWAY = 'https://api.kblabs.ru';
  var STORAGE_KEY = 'kb_analytics';

  // ── helpers ──────────────────────────────────────────────────────────────

  function post(path, body, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    fetch(GATEWAY + path, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(function () {});
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function saveState(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function utmProps() {
    var p = new URLSearchParams(location.search);
    var props = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
      if (p.get(k)) props[k] = p.get(k);
    });
    return props;
  }

  // ── auth ─────────────────────────────────────────────────────────────────

  var _tokenPromise = null;

  function ensureToken() {
    if (_tokenPromise) return _tokenPromise;
    _tokenPromise = _getToken().catch(function () {
      _tokenPromise = null; // retry next time
      return null;
    });
    return _tokenPromise;
  }

  function _getToken() {
    var state = loadState();

    // Already have valid credentials → just get a token.
    if (state.clientId && state.clientSecret) {
      return fetchToken(state.clientId, state.clientSecret);
    }

    // First visit — register, then token.
    var deviceId = state.deviceId || generateId();
    return post('/auth/register', {
      name: 'kb-site:' + deviceId.slice(0, 8),
      scopes: ['device:' + deviceId],
    })
      .then(function (r) { return r && r.json(); })
      .then(function (data) {
        if (!data || !data.clientId) throw new Error('register failed');
        var next = { deviceId: deviceId, clientId: data.clientId, clientSecret: data.clientSecret };
        saveState(next);
        return fetchToken(data.clientId, data.clientSecret);
      });
  }

  function fetchToken(clientId, clientSecret) {
    return fetch(GATEWAY + '/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: clientId, clientSecret: clientSecret }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { return data.accessToken || null; });
  }

  // ── track ────────────────────────────────────────────────────────────────

  function track(eventType, extra) {
    var state = loadState();
    var tags = Object.assign(
      {
        path: location.pathname,
        referrer: document.referrer || '',
        deviceId: state.deviceId || '',
        source: 'kb-site',
      },
      extra
    );

    ensureToken().then(function (token) {
      if (!token) return;
      post('/telemetry/v1/ingest', {
        events: [
          {
            source: 'kb-site',
            type: eventType,
            timestamp: new Date().toISOString(),
            tags: tags,
          },
        ],
      }, token);
    });
  }

  // ── page view ────────────────────────────────────────────────────────────

  function trackPageView() {
    track('page_view', utmProps());
  }

  // SPA navigation support (Next.js / client-side routing).
  var _lastPath = location.pathname;
  function checkNavigation() {
    if (location.pathname !== _lastPath) {
      _lastPath = location.pathname;
      trackPageView();
    }
  }

  // ── click tracking ───────────────────────────────────────────────────────

  document.addEventListener('click', function (e) {
    var el = e.target;
    // Walk up to find an anchor or data-analytics element.
    while (el && el !== document.body) {
      var tag = el.getAttribute && el.getAttribute('data-analytics');
      if (tag) {
        track(tag + '_click', utmProps());
        break;
      }
      // Outbound links.
      if (el.tagName === 'A' && el.hostname && el.hostname !== location.hostname) {
        track('outbound_click', Object.assign({ href: el.href }, utmProps()));
        break;
      }
      el = el.parentElement;
    }
  }, true);

  // ── init ─────────────────────────────────────────────────────────────────

  trackPageView();

  // Poll for SPA navigation (no router assumption).
  setInterval(checkNavigation, 500);

  // Expose for manual calls: window.kbTrack('my_event', { key: 'val' })
  window.kbTrack = track;
})();

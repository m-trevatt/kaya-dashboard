/**
 * Kaya Dashboard — Review Widget
 * Lets anyone suggest changes to dashboard content.
 *
 * How it works:
 * 1. Click "Suggest edit" button (bottom-left)
 * 2. Hover over any element — it highlights
 * 3. Click the element — dialog opens with its current text
 * 4. Type what should change, hit Send
 * 5. POSTs to /__review; if no endpoint, falls back to email
 *
 * No permissions required. No external dependencies.
 */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────
  var CFG = {
    endpoint: '/review',
    email: 'michael@trevattdesign.com',
    widgetAttr: 'data-krw',
    hlColor: 'rgba(184,66,26,0.12)',
    hlBorder: '#b8421a',
    maxSelDepth: 4
  };

  // ── State ─────────────────────────────────────────────────────────
  var active = false;
  var hoverEl = null;
  var pending = null;

  // ── Styles ────────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '.krw-btn{position:fixed;bottom:20px;left:20px;z-index:999998;',
    'font-family:Inter,system-ui,sans-serif;font-size:13px;font-weight:500;',
    'padding:8px 16px;background:#1a1814;color:#f4efe6;border:none;',
    'border-radius:999px;cursor:pointer;transition:all .15s;',
    'box-shadow:0 2px 8px rgba(0,0,0,.15);line-height:1.4}',
    '.krw-btn:hover,.krw-btn.on{background:#b8421a}',

    'body.krw-on,body.krw-on *{cursor:crosshair!important}',
    'body.krw-on [data-krw] textarea{cursor:text!important}',
    'body.krw-on [data-krw] button{cursor:pointer!important}',
    'body.krw-on [data-krw] a{cursor:pointer!important}',

    '.krw-hl{position:fixed;pointer-events:none;z-index:999997;',
    'border:2px solid ' + CFG.hlBorder + ';background:' + CFG.hlColor + ';',
    'border-radius:2px;transition:all .06s ease-out;display:none}',
    'body.krw-on .krw-hl{display:block}',

    '.krw-dlg{position:fixed;z-index:999999;width:380px;max-width:calc(100vw - 32px);',
    'background:#fff;border:1px solid #e5ddd0;border-radius:6px;',
    'box-shadow:0 8px 32px rgba(0,0,0,.15);font-family:Inter,system-ui,sans-serif;display:none}',
    '.krw-dlg.open{display:block}',

    '.krw-dlg-hd{padding:14px 16px 10px;border-bottom:1px solid #e5ddd0}',
    '.krw-dlg-hd h4{font-size:14px;font-weight:600;color:#1a1814;margin:0 0 4px}',
    '.krw-dlg-hd .meta{font-family:"JetBrains Mono",monospace;font-size:10px;',
    'color:#8a8378;letter-spacing:.06em;word-break:break-all}',

    '.krw-dlg-sel{padding:10px 16px;background:#f4efe6;font-size:13px;color:#5a544a;',
    'border-bottom:1px solid #e5ddd0;max-height:80px;overflow-y:auto;line-height:1.4}',

    '.krw-dlg-bd{padding:12px 16px}',
    '.krw-dlg-bd label{display:block;font-size:12px;font-weight:500;color:#5a544a;margin-bottom:6px}',
    '.krw-dlg-bd textarea{width:100%;min-height:80px;padding:10px 12px;',
    'font-family:Inter,system-ui,sans-serif;font-size:14px;color:#1a1814;',
    'background:#fff;border:1px solid #e5ddd0;border-radius:4px;resize:vertical;',
    'line-height:1.5;outline:none}',
    '.krw-dlg-bd textarea:focus{border-color:#b8421a}',

    '.krw-dlg-ft{padding:10px 16px 14px;display:flex;justify-content:flex-end;gap:8px}',
    '.krw-dlg-ft button{font-family:Inter,system-ui,sans-serif;font-size:13px;',
    'font-weight:500;padding:7px 16px;border-radius:4px;border:1px solid #e5ddd0;',
    'background:#fff;color:#5a544a;transition:all .15s;line-height:1.4}',
    '.krw-dlg-ft button:hover{border-color:#8a8378;color:#1a1814}',
    '.krw-dlg-ft .krw-send{background:#b8421a;color:#fff;border-color:#b8421a}',
    '.krw-dlg-ft .krw-send:hover{background:#9a3615;border-color:#9a3615}',

    '.krw-toast{position:fixed;bottom:70px;left:20px;z-index:999999;',
    'font-family:Inter,system-ui,sans-serif;font-size:13px;padding:10px 18px;',
    'border-radius:4px;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.15);',
    'opacity:0;transform:translateY(8px);transition:all .2s;pointer-events:none}',
    '.krw-toast.show{opacity:1;transform:translateY(0)}',
    '.krw-toast.ok{background:#4a7c59}',
    '.krw-toast.err{background:#b04a3a}',
    '.krw-toast.info{background:#1a1814}'
  ].join('\n');
  document.head.appendChild(css);

  // ── Utilities ─────────────────────────────────────────────────────
  function isWidget(el) {
    return el && (el.hasAttribute(CFG.widgetAttr) || el.closest('[' + CFG.widgetAttr + ']'));
  }

  function getSelector(el) {
    var parts = [], node = el, d = 0;
    while (node && node !== document.body && d < CFG.maxSelDepth) {
      if (node.id) { parts.unshift('#' + node.id); break; }
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (parent) {
        var sibs = Array.from(parent.children).filter(function (c) {
          return c.tagName === node.tagName;
        });
        if (sibs.length > 1) tag += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
      }
      if (node.className && typeof node.className === 'string') {
        var cls = node.className.split(/\s+/).filter(function (c) {
          return c && c.indexOf('krw-') !== 0;
        })[0];
        if (cls) tag += '.' + cls;
      }
      parts.unshift(tag);
      node = node.parentElement;
      d++;
    }
    return parts.join(' > ') || 'body';
  }

  function getText(el) {
    var t = (el.textContent || '').trim();
    if (t.length > 0 && t.length < 500) return t;
    return el.getAttribute('aria-label')
      || el.getAttribute('alt')
      || el.getAttribute('title')
      || el.getAttribute('placeholder')
      || (el.closest('[aria-label]') || {}).getAttribute
        && el.closest('[aria-label]').getAttribute('aria-label')
      || '(no text captured)';
  }

  // ── Build DOM ─────────────────────────────────────────────────────
  var root = document.createElement('div');
  root.setAttribute(CFG.widgetAttr, '');

  var btn = document.createElement('button');
  btn.className = 'krw-btn';
  btn.setAttribute(CFG.widgetAttr, '');
  btn.innerHTML = '&#9998; Suggest edit';
  root.appendChild(btn);

  var hl = document.createElement('div');
  hl.className = 'krw-hl';
  hl.setAttribute(CFG.widgetAttr, '');
  root.appendChild(hl);

  var dlg = document.createElement('div');
  dlg.className = 'krw-dlg';
  dlg.setAttribute(CFG.widgetAttr, '');
  dlg.innerHTML = [
    '<div class="krw-dlg-hd" data-krw>',
    '  <h4>Suggest a change</h4>',
    '  <div class="meta" data-krw></div>',
    '</div>',
    '<div class="krw-dlg-sel" data-krw></div>',
    '<div class="krw-dlg-bd" data-krw>',
    '  <label data-krw>What should change?</label>',
    '  <textarea data-krw placeholder="Describe the change you\'d like to see…"></textarea>',
    '</div>',
    '<div class="krw-dlg-ft" data-krw>',
    '  <button type="button" class="krw-cancel" data-krw>Cancel</button>',
    '  <button type="button" class="krw-send" data-krw>Send suggestion</button>',
    '</div>'
  ].join('');
  root.appendChild(dlg);

  var toastEl = document.createElement('div');
  toastEl.className = 'krw-toast';
  toastEl.setAttribute(CFG.widgetAttr, '');
  root.appendChild(toastEl);

  document.body.appendChild(root);

  // ── Toast helper ──────────────────────────────────────────────────
  var toastTimer = null;
  function showToast(msg, type) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = 'krw-toast ' + (type || 'info');
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3500);
  }

  // ── Dialog management ─────────────────────────────────────────────
  function openDlg(info, mx, my) {
    pending = info;
    var w = 380, approxH = 320;
    var left = Math.min(mx + 16, window.innerWidth - w - 16);
    var top = Math.min(my + 16, window.innerHeight - approxH - 16);
    dlg.style.left = Math.max(16, left) + 'px';
    dlg.style.top = Math.max(16, top) + 'px';

    dlg.querySelector('.meta').textContent = info.url + '  →  ' + info.selector;
    dlg.querySelector('.krw-dlg-sel').textContent = info.text.substring(0, 300);
    var ta = dlg.querySelector('textarea');
    ta.value = '';
    dlg.classList.add('open');
    setTimeout(function () { ta.focus(); }, 40);
  }

  function closeDlg() { dlg.classList.remove('open'); pending = null; }

  // ── Submit ────────────────────────────────────────────────────────
  function submit() {
    var ta = dlg.querySelector('textarea');
    var req = ta.value.trim();
    if (!req) { ta.focus(); return; }

    var payload = {
      url: pending.url,
      selector: pending.selector,
      text: pending.text,
      request: req,
      timestamp: Date.now(),
      page: document.title
    };

    fetch(CFG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.ok) {
        showToast('Suggestion sent — thank you!', 'ok');
        closeDlg();
      } else { throw new Error('not ok'); }
    }).catch(function () {
      fallbackEmail(payload);
    });
  }

  function fallbackEmail(p) {
    var body = [
      'KAYA DASHBOARD — EDIT SUGGESTION',
      '',
      'Page: ' + p.page,
      'URL: ' + window.location.origin + p.url,
      'Element: ' + p.selector,
      'Current text: ' + p.text.substring(0, 300),
      '',
      'Suggested change:',
      p.request
    ].join('\n');

    var copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        navigator.clipboard.writeText(body);
        copied = true;
      } catch (e) { /* ignore */ }
    }

    var subj = encodeURIComponent('Kaya dashboard: ' + p.request.substring(0, 60));
    var mbody = encodeURIComponent(body);
    var mailto = 'mailto:' + CFG.email + '?subject=' + subj + '&body=' + mbody;

    showToast(copied
      ? 'Copied to clipboard — opening email…'
      : 'Opening email with your suggestion…', 'info');
    closeDlg();
    setTimeout(function () { window.location.href = mailto; }, 400);
  }

  // ── Event wiring ──────────────────────────────────────────────────

  btn.addEventListener('click', function () {
    active = !active;
    btn.classList.toggle('on', active);
    document.body.classList.toggle('krw-on', active);
    if (!active) {
      closeDlg();
      hl.style.display = 'none';
    }
  });

  document.addEventListener('mousemove', function (e) {
    if (!active || dlg.classList.contains('open')) { hl.style.display = 'none'; return; }
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isWidget(el)) { hl.style.display = 'none'; hoverEl = null; return; }
    hoverEl = el;
    var r = el.getBoundingClientRect();
    hl.style.display = 'block';
    hl.style.left = r.left + 'px';
    hl.style.top = r.top + 'px';
    hl.style.width = r.width + 'px';
    hl.style.height = r.height + 'px';
  }, { passive: true });

  document.addEventListener('click', function (e) {
    if (!active) return;
    if (isWidget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    var el = hoverEl || document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isWidget(el)) return;

    hl.style.display = 'none';

    openDlg({
      url: window.location.pathname,
      selector: getSelector(el),
      text: getText(el)
    }, e.clientX, e.clientY);
  }, true);

  dlg.querySelector('.krw-cancel').addEventListener('click', closeDlg);
  dlg.querySelector('.krw-send').addEventListener('click', submit);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (dlg.classList.contains('open')) { closeDlg(); }
      else if (active) {
        active = false;
        btn.classList.remove('on');
        document.body.classList.remove('krw-on');
        hl.style.display = 'none';
      }
    }
    // Cmd/Ctrl+Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && dlg.classList.contains('open')) {
      e.preventDefault();
      submit();
    }
    // "c" key toggles review mode (not when typing in a field)
    if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey && !dlg.classList.contains('open')) {
      var tag = (document.activeElement || {}).tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        btn.click();
      }
    }
  });

})();

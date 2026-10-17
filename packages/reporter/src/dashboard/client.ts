/**
 * Client-side dashboard script (inline in the HTML). Plain ES2020, no dependencies.
 * NOTE: this file is a String.raw template — never use backticks or dollar-brace inside it.
 * All data is rendered with textContent / DOM builders (never innerHTML) so test output
 * cannot inject markup.
 */
export const CLIENT_JS = String.raw`
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('tf-data').textContent);
  var latest = D.latest;
  var SVG = 'http://www.w3.org/2000/svg';

  // ---------- helpers ----------
  function h(tag, props, children) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    add(el, children);
    return el;
  }
  function add(el, children) {
    (Array.isArray(children) ? children : children === undefined ? [] : [children]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
  }
  function s(tag, attrs, children) {
    var el = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    add(el, children);
    return el;
  }
  function badge(text, cls) { return h('span', { class: 'badge b-' + (cls || text), text: text }); }
  function fmtMs(ms) {
    if (ms < 1000) return Math.round(ms) + ' ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + ' s';
    return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
  }
  function fmtDate(t) { return new Date(t).toLocaleString(); }
  function pct(x) { return (x * 100).toFixed(0) + '%'; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function empty(text) { return h('div', { class: 'empty', text: text }); }
  function copy(text, btn) {
    function done() { if (btn) { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1200); } }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); return; }
    } catch (e) { /* fall through */ }
    fallback();
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
    }
  }
  function curlFor(a) {
    if (a.curl) return a.curl;
    var c = "curl -X " + a.method + " '" + a.url.replace(/'/g, "'\\''") + "'";
    if (a.requestBody) c += " -H 'Content-Type: application/json' -d '" + a.requestBody.replace(/'/g, "'\\''") + "'";
    return c;
  }
  var flakyById = {};
  D.flakiness.forEach(function (f) { flakyById[f.id] = f; });

  // ---------- theme & tabs ----------
  var root = document.documentElement;
  try { var saved = localStorage.getItem('tf-theme'); if (saved) root.setAttribute('data-theme', saved); } catch (e) { /* ignore */ }
  document.getElementById('theme').addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') === 'dark' ||
      (!root.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('tf-theme', next); } catch (e) { /* ignore */ }
  });
  var tabs = ['overview', 'tests', 'radar', 'history', 'heals'];
  function showTab(name) {
    if (tabs.indexOf(name) < 0) name = 'overview';
    tabs.forEach(function (t) {
      document.getElementById('view-' + t).hidden = t !== name;
      document.querySelector('[data-tab="' + t + '"]').setAttribute('aria-selected', String(t === name));
    });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }
  document.getElementById('tabs').addEventListener('click', function (e) {
    var t = e.target && e.target.getAttribute && e.target.getAttribute('data-tab');
    if (t) showTab(t);
  });

  // ---------- Overview ----------
  function ring(rate, color) {
    var r = 52, c = 2 * Math.PI * r;
    return s('svg', { viewBox: '0 0 140 140', width: '140', height: '140', role: 'img', 'aria-label': 'Pass rate ' + rate.toFixed(1) + '%' }, [
      s('circle', { cx: 70, cy: 70, r: r, fill: 'none', stroke: 'var(--code)', 'stroke-width': 14 }),
      s('circle', { cx: 70, cy: 70, r: r, fill: 'none', stroke: color, 'stroke-width': 14, 'stroke-linecap': 'round',
        'stroke-dasharray': (c * rate / 100) + ' ' + c, transform: 'rotate(-90 70 70)' }),
      s('text', { x: 70, y: 76, 'text-anchor': 'middle', style: 'font-size:24px;font-weight:700;fill:var(--text)' }, rate.toFixed(1) + '%')
    ]);
  }
  function stat(n, label, cls) {
    return h('div', { class: 'card stat' }, [h('div', { class: 'n ' + (cls || ''), text: String(n) }), h('div', { class: 'l', text: label })]);
  }
  function renderOverview() {
    var el = clear(document.getElementById('view-overview'));
    var t = latest.totals, executed = t.passed + t.failed;
    var rate = executed === 0 ? 100 : t.passed / executed * 100;
    var color = rate >= 95 ? 'var(--pass)' : rate >= 80 ? 'var(--warn)' : 'var(--fail)';
    var top = h('div', { class: 'grid cols-2' });
    top.appendChild(h('div', { class: 'card', style: 'display:flex;gap:20px;align-items:center;flex-wrap:wrap' }, [
      ring(rate, color),
      h('div', {}, [
        h('div', {}, [badge(latest.status, latest.status === 'passed' ? 'passed' : 'failed')]),
        h('dl', { class: 'kv' }, [
          h('dt', { text: 'Started' }), h('dd', { text: fmtDate(latest.startedAt) }),
          h('dt', { text: 'Duration' }), h('dd', { text: fmtMs(latest.durationMs) }),
          latest.env ? h('dt', { text: 'Env' }) : null, latest.env ? h('dd', { text: latest.env }) : null,
          latest.shard ? h('dt', { text: 'Shard' }) : null, latest.shard ? h('dd', { text: latest.shard.current + '/' + latest.shard.total }) : null,
          latest.playwrightVersion ? h('dt', { text: 'Playwright' }) : null, latest.playwrightVersion ? h('dd', { text: latest.playwrightVersion }) : null
        ])
      ])
    ]));
    top.appendChild(h('div', { class: 'cards' }, [
      stat(t.total, 'total'), stat(t.passed, 'passed', 'pass'), stat(t.failed, 'failed', t.failed ? 'fail' : ''),
      stat(t.flaky, 'flaky', t.flaky ? 'warn' : ''), stat(t.healed, 'healed', t.healed ? 'info' : ''),
      stat(t.quarantined, 'quarantined'), stat(t.skipped, 'skipped')
    ]));
    el.appendChild(top);

    var slow = latest.tests.filter(function (x) { return x.status !== 'skipped' && !x.quarantined; })
      .sort(function (a, b) { return b.durationMs - a.durationMs; }).slice(0, 10);
    var max = slow.length ? slow[0].durationMs || 1 : 1;
    var slowCard = h('div', { class: 'card' }, [h('h3', { text: 'Slowest 10 tests' })]);
    if (!slow.length) slowCard.appendChild(empty('No executed tests.'));
    slow.forEach(function (x) {
      slowCard.appendChild(h('div', { style: 'margin-bottom:8px' }, [
        h('div', { style: 'display:flex;justify-content:space-between;gap:8px' }, [h('span', { text: x.title }), h('span', { class: 'muted', text: fmtMs(x.durationMs) })]),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar', style: 'width:' + (x.durationMs / max * 100) + '%' }))
      ]));
    });
    var ciCard = h('div', { class: 'card' }, [h('h3', { text: 'CI' })]);
    var ci = latest.ci;
    if (!ci) ciCard.appendChild(empty('Not running in CI (no provider detected).'));
    else {
      var dl = h('dl', { class: 'kv' });
      [['Provider', ci.provider], ['Repository', ci.repository], ['Branch', ci.branch], ['Commit', ci.commitSha ? ci.commitSha.slice(0, 10) : ''],
        ['PR', ci.pullRequest], ['Build', ci.buildNumber || ci.buildId], ['Job', ci.jobName], ['Actor', ci.actor]].forEach(function (p) {
        if (p[1]) { dl.appendChild(h('dt', { text: p[0] })); dl.appendChild(h('dd', { text: String(p[1]) })); }
      });
      if (ci.buildUrl && /^https?:\/\//.test(ci.buildUrl)) {
        dl.appendChild(h('dt', { text: 'URL' })); dl.appendChild(h('dd', {}, h('a', { href: ci.buildUrl, target: '_blank', rel: 'noopener noreferrer', text: ci.buildUrl })));
      }
      ciCard.appendChild(dl);
    }
    el.appendChild(h('div', { class: 'grid cols-2', style: 'margin-top:16px' }, [slowCard, ciCard]));
  }

  // ---------- Tests ----------
  var F = { status: 'all', flaky: false, healed: false, quarantined: false, q: '', limit: 200 };
  function testDetail(t) {
    var d = h('div', { class: 'detail' });
    var fl = flakyById[t.id];
    d.appendChild(h('div', { style: 'margin-top:10px' }, [
      h('span', { class: 'muted', text: t.file + (t.line ? ':' + t.line : '') + '  [' + t.project + ']' }),
      t.tags.length ? h('span', { class: 'muted', text: '  ' + t.tags.join(' ') }) : null,
      fl ? h('span', {}, [' ', badge('radar ' + fl.risk + ' ' + pct(fl.failureRate), fl.risk)]) : null,
      t.quarantined && t.quarantineReason ? h('span', { class: 'muted', text: '  quarantine: ' + t.quarantineReason }) : null
    ]));
    if (t.error) {
      d.appendChild(h('h4', {}, ['Error ', t.triage ? badge(t.triage) : null]));
      d.appendChild(h('pre', { text: t.error.message + (t.error.snippet ? '\n\n' + t.error.snippet : '') }));
      if (t.error.stack) d.appendChild(h('details', {}, [h('summary', { class: 'muted', text: 'Stack trace' }), h('pre', { text: t.error.stack })]));
    }
    if (t.analysis) { d.appendChild(h('h4', { text: 'AI analysis' })); d.appendChild(h('pre', { text: t.analysis })); }
    if (t.console && t.console.length) {
      d.appendChild(h('h4', { text: 'Console errors (' + t.console.length + ')' }));
      var cl = h('ul', { class: 'tl' });
      t.console.forEach(function (c) {
        cl.appendChild(h('li', {}, [h('span', { class: 'dot l-fail' }), h('span', { class: 'muted', text: c.type + '  ' }), h('span', { text: c.message + (c.location ? '  (' + c.location + ')' : '') })]));
      });
      d.appendChild(cl);
    }
    if (t.steps.length) {
      d.appendChild(h('h4', { text: 'Steps' }));
      var ul = h('ul', { class: 'tl' });
      t.steps.forEach(function (st) {
        ul.appendChild(h('li', {}, [h('span', { class: 'muted', text: '+' + fmtMs(st.offsetMs) }), h('span', { class: 'dot l-' + st.level }), h('span', { text: st.title })]));
      });
      d.appendChild(ul);
    }
    if (t.api.length) {
      d.appendChild(h('h4', { text: 'API calls' }));
      var tb = h('table', {}, h('thead', {}, h('tr', {}, ['Method', 'URL', 'Status', 'Time', ''].map(function (x) { return h('th', { text: x }); }))));
      var body = h('tbody');
      t.api.forEach(function (a) {
        var btn = h('button', { class: 'btn', text: 'Copy cURL', onclick: function () { copy(curlFor(a), btn); } });
        body.appendChild(h('tr', {}, [h('td', { text: a.method }), h('td', { style: 'word-break:break-all', text: a.url }),
          h('td', {}, badge(String(a.status), a.status >= 400 ? 'failed' : 'passed')), h('td', { text: fmtMs(a.durationMs) }), h('td', {}, btn)]));
        if (a.responseBody && a.status >= 400) body.appendChild(h('tr', {}, [h('td', { colspan: 5 }, h('pre', { text: a.responseBody }))]));
      });
      tb.appendChild(body); d.appendChild(tb);
    }
    if (t.heals.length) {
      d.appendChild(h('h4', { text: 'Healed locators' }));
      t.heals.forEach(function (x) {
        d.appendChild(h('div', {}, [h('code', { text: x.key }), ' ', h('span', { class: 'muted', text: x.original + ' -> ' + x.healed + '  (' + x.strategy + ', ' + pct(x.confidence) + ')' })]));
      });
    }
    if (t.ai.length) {
      d.appendChild(h('h4', { text: 'AI usage' }));
      t.ai.forEach(function (x) {
        d.appendChild(h('div', { class: 'muted', text: x.feature + ': ' + x.goal + ' [cache ' + x.cache + (x.model ? ', ' + x.model : '') + ', ' + fmtMs(x.durationMs) + ']' }));
      });
    }
    if (t.artifacts.length) {
      d.appendChild(h('h4', { text: 'Artifacts' }));
      var wrap = h('div', {});
      t.artifacts.forEach(function (a) {
        wrap.appendChild(h('a', { href: a.href, target: '_blank', rel: 'noopener noreferrer', text: a.name, style: 'margin-right:12px' }));
      });
      d.appendChild(wrap);
    }
    return d;
  }
  function renderTests() {
    var el = clear(document.getElementById('view-tests'));
    var list = h('div');
    function draw() {
      clear(list);
      var q = F.q.toLowerCase();
      var rows = latest.tests.filter(function (t) {
        if (F.status !== 'all') {
          var st = t.quarantined ? 'quarantined' : t.status;
          if (F.status === 'failed' ? !(t.status === 'failed' || t.status === 'timedOut' || t.status === 'interrupted') || t.quarantined : st !== F.status) return false;
        }
        if (F.flaky && !t.flaky) return false;
        if (F.healed && !t.heals.length) return false;
        if (F.quarantined && !t.quarantined) return false;
        if (q && (t.title + ' ' + t.file + ' ' + t.titlePath.join(' ') + ' ' + t.tags.join(' ')).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      if (!rows.length) { list.appendChild(empty('No tests match the filters.')); return; }
      rows.slice(0, F.limit).forEach(function (t) {
        var det = null;
        var row = h('div', { class: 'row' });
        var head = h('div', { class: 'head', tabindex: '0', role: 'button', 'aria-expanded': 'false' }, [
          badge(t.quarantined ? 'quarantined' : t.status, t.quarantined ? 'quarantined' : t.status),
          h('span', { class: 'title', text: t.titlePath.join(' > ') || t.title }),
          t.flaky ? badge('flaky') : null, t.heals.length ? badge('healed') : null,
          t.error && t.triage ? badge(t.triage) : null,
          h('span', { class: 'file', text: t.file }),
          h('span', { class: 'muted', text: fmtMs(t.durationMs) })
        ]);
        function toggle() {
          if (det) { row.removeChild(det); det = null; head.setAttribute('aria-expanded', 'false'); }
          else { det = testDetail(t); row.appendChild(det); head.setAttribute('aria-expanded', 'true'); }
        }
        head.addEventListener('click', toggle);
        head.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        row.appendChild(head); list.appendChild(row);
      });
      if (rows.length > F.limit) list.appendChild(h('button', { class: 'btn', text: 'Show more (' + (rows.length - F.limit) + ' hidden)', onclick: function () { F.limit += 200; draw(); } }));
    }
    function check(label, key) {
      var cb = h('input', { type: 'checkbox' }); cb.checked = F[key];
      cb.addEventListener('change', function () { F[key] = cb.checked; F.limit = 200; draw(); });
      return h('label', {}, [cb, ' ' + label]);
    }
    var sel = h('select', {}, ['all', 'passed', 'failed', 'skipped', 'quarantined'].map(function (v) { return h('option', { value: v, text: v }); }));
    sel.value = F.status;
    sel.addEventListener('change', function () { F.status = sel.value; F.limit = 200; draw(); });
    var search = h('input', { type: 'search', placeholder: 'Search title, file or tag', 'aria-label': 'Search tests' });
    search.value = F.q;
    search.addEventListener('input', function () { F.q = search.value; F.limit = 200; draw(); });
    el.appendChild(h('div', { class: 'toolbar' }, [search, sel, check('flaky', 'flaky'), check('healed', 'healed'), check('quarantined', 'quarantined')]));
    el.appendChild(list);
    draw();
  }

  // ---------- Flakiness Radar ----------
  function quarantineSpec(id) {
    var i = id.indexOf('::'), j = id.indexOf('::', i + 2);
    var file = id.slice(i + 2, j), title = id.slice(j + 2);
    return file + (title ? ' › ' + title : '');
  }
  function renderRadar() {
    var el = clear(document.getElementById('view-radar'));
    var f = D.flakiness;
    var counts = { HIGH: 0, WATCH: 0, STABLE: 0 };
    f.forEach(function (x) { counts[x.risk]++; });
    el.appendChild(h('div', { class: 'cards', style: 'margin-bottom:16px' }, [
      stat(counts.HIGH, 'HIGH (>= 33%)', counts.HIGH ? 'fail' : ''), stat(counts.WATCH, 'WATCH (10-33%)', counts.WATCH ? 'warn' : ''), stat(counts.STABLE, 'STABLE (< 10%)', 'pass')
    ]));
    var high = f.filter(function (x) { return x.risk === 'HIGH'; });
    if (high.length) {
      var yaml = 'quarantine:\n' + high.map(function (x) { return '  - "' + quarantineSpec(x.id).replace(/"/g, '\\"') + '"'; }).join('\n') + '\n';
      var btn = h('button', { class: 'btn', text: 'Copy YAML', onclick: function () { copy(yaml, btn); } });
      el.appendChild(h('div', { class: 'card', style: 'margin-bottom:16px' }, [
        h('h3', { text: 'Recommendation: quarantine ' + high.length + ' HIGH-risk test(s)' }),
        h('p', { class: 'muted', text: 'Add to testfly-quarantine.yml to keep them out of the quality gate while you fix them.' }),
        h('pre', { text: yaml }), h('div', { style: 'margin-top:8px' }, btn)
      ]));
    }
    if (!f.length) { el.appendChild(empty('No history yet.')); return; }
    var tb = h('table', {}, h('thead', {}, h('tr', {}, [['Risk', ''], ['Test', ''], ['Runs', 'num'], ['Failed', 'num'], ['Flaky', 'num'], ['Rate', ''], ['Avg time', 'num']].map(function (c) { return h('th', { class: c[1], text: c[0] }); }))));
    var body = h('tbody');
    f.forEach(function (x) {
      body.appendChild(h('tr', {}, [
        h('td', {}, badge(x.risk)), h('td', {}, [h('div', { text: x.title }), h('div', { class: 'muted', text: x.id.split('::').slice(0, 2).join(' / ') })]),
        h('td', { class: 'num', text: String(x.runs) }), h('td', { class: 'num', text: String(x.failures) }), h('td', { class: 'num', text: String(x.flakyRuns) }),
        h('td', { style: 'min-width:110px' }, [pct(x.failureRate), h('div', { class: 'bar-track' }, h('div', { class: 'bar', style: 'width:' + (x.failureRate * 100) + '%;background:' + (x.risk === 'HIGH' ? 'var(--fail)' : x.risk === 'WATCH' ? 'var(--warn)' : 'var(--pass)') }))]),
        h('td', { class: 'num', text: fmtMs(x.avgDurationMs) })
      ]));
    });
    tb.appendChild(body);
    el.appendChild(h('div', { class: 'card' }, tb));
  }

  // ---------- History ----------
  function renderHistory() {
    var el = clear(document.getElementById('view-history'));
    var H = D.history;
    var W = 720, Ht = 160, pad = 24, n = H.length, bw = Math.max(4, Math.min(40, (W - pad * 2) / n - 4));
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + Ht, width: '100%', role: 'img', 'aria-label': 'Pass rate per run' });
    [0, 50, 100].forEach(function (g) {
      var y = Ht - pad - (Ht - pad * 2) * g / 100;
      svg.appendChild(s('line', { x1: pad, x2: W - pad, y1: y, y2: y, stroke: 'var(--border)' }));
      svg.appendChild(s('text', { x: 2, y: y + 3 }, g + '%'));
    });
    H.forEach(function (p, i) {
      var x = pad + (n === 1 ? (W - pad * 2) / 2 - bw / 2 : i * ((W - pad * 2 - bw) / (n - 1)));
      var bh = Math.max(2, (Ht - pad * 2) * p.passRate / 100);
      var rect = s('rect', { x: x, y: Ht - pad - bh, width: bw, height: bh, rx: 2, fill: p.status === 'passed' ? 'var(--pass)' : 'var(--fail)' },
        s('title', {}, fmtDate(p.startedAt) + ' - ' + p.passRate + '% (' + p.totals.failed + ' failed, ' + p.totals.flaky + ' flaky)'));
      svg.appendChild(rect);
    });
    var maxD = Math.max.apply(null, H.map(function (p) { return p.durationMs; }).concat([1]));
    var pts = H.map(function (p, i) {
      return (pad + (n === 1 ? (W - pad * 2) / 2 : i * ((W - pad * 2) / (n - 1)))) + ',' + (Ht - pad - (Ht - pad * 2) * p.durationMs / maxD);
    }).join(' ');
    svg.appendChild(s('polyline', { points: pts, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2 }));
    el.appendChild(h('div', { class: 'card' }, [h('h3', { text: 'Pass rate per run (bars) and duration (line, max ' + fmtMs(maxD) + ')' }), svg]));
    var tb = h('table', {}, h('thead', {}, h('tr', {}, ['Started', 'Status', 'Pass rate', 'Passed', 'Failed', 'Flaky', 'Healed', 'Duration', 'Branch'].map(function (c) { return h('th', { text: c }); }))));
    var body = h('tbody');
    H.slice().reverse().forEach(function (p) {
      body.appendChild(h('tr', {}, [h('td', { text: fmtDate(p.startedAt) + (p.shard ? ' (shard ' + p.shard + ')' : '') }), h('td', {}, badge(p.status, p.status === 'passed' ? 'passed' : 'failed')),
        h('td', { text: p.passRate + '%' }), h('td', { text: String(p.totals.passed) }), h('td', { text: String(p.totals.failed) }), h('td', { text: String(p.totals.flaky) }),
        h('td', { text: String(p.totals.healed) }), h('td', { text: fmtMs(p.durationMs) }), h('td', { text: p.branch || '' })]));
    });
    tb.appendChild(body);
    el.appendChild(h('div', { class: 'card', style: 'margin-top:16px;overflow:auto' }, tb));
  }

  // ---------- Heals ----------
  function renderHeals() {
    var el = clear(document.getElementById('view-heals'));
    if (!D.heals.length) { el.appendChild(empty('No locators were healed in the recorded runs.')); return; }
    el.appendChild(h('p', { class: 'muted', text: 'Every heal is a brittle locator. Update the YAML locator definition so the test no longer depends on healing.' }));
    var tb = h('table', {}, h('thead', {}, h('tr', {}, ['Locator key', 'Original', 'Healed to', 'Strategy', 'Confidence', 'Times', 'Last seen', 'Used by'].map(function (c) { return h('th', { text: c }); }))));
    var body = h('tbody');
    D.heals.forEach(function (x) {
      body.appendChild(h('tr', {}, [h('td', {}, h('code', { text: x.key })), h('td', { style: 'word-break:break-all', text: x.original }), h('td', { style: 'word-break:break-all', text: x.healed }),
        h('td', { text: x.strategy }), h('td', { text: pct(x.avgConfidence) }), h('td', { text: String(x.count) }), h('td', { text: fmtDate(x.lastSeen) }), h('td', { text: x.tests.join(', ') })]));
    });
    tb.appendChild(body);
    el.appendChild(h('div', { class: 'card', style: 'overflow:auto' }, tb));
  }

  renderOverview(); renderTests(); renderRadar(); renderHistory(); renderHeals();
  showTab((location.hash || '').slice(1));
})();
`;

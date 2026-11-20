/* ==========================================================================
   etuce.js — the map on /etuce/.

   Loads map.svg (built by tools/build-etuce-map.py) and countries.json
   (built by tools/build-etuce-data.py), colours each ETUCE member by whether
   it has a tree, and opens a panel with the tree(s), the official curriculum
   and a button to the tree when a country is chosen. Zoom with the wheel,
   a pinch or the buttons; drag to pan. Every country is also in the list
   under the map, so nothing needs the map to be reached.

   Country and language names come from the browser (Intl.DisplayNames), in
   the page's language, so they need no translating here. #PT in the address
   opens a country directly.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-etuce-map]');
  if (!root) return;
  var canvas = root.querySelector('[data-map-canvas]');
  var panel = root.querySelector('[data-panel]');
  var listEl = document.querySelector('[data-list]');
  var countEl = document.querySelector('[data-count]');

  var DATA = {};
  var svg = null, base = null, view = null, selected = null;

  function t(key) { return (window.i18n && window.i18n.t) ? window.i18n.t(key) : key; }
  function lang() { return (window.i18n && window.i18n.lang) || 'en'; }

  function regionName(cc, inLang) {
    try { return new Intl.DisplayNames([inLang || lang()], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; }
  }
  function languageName(code, inLang) {
    try { return new Intl.DisplayNames([inLang || lang()], { type: 'language' }).of(code) || code; } catch (e) { return code; }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------------- view box: zoom and pan ---------------- */
  function setView(v) {
    var minW = base[2] / 14;
    if (v[2] < minW) { v[1] += (v[3] - v[3] * minW / v[2]) / 2; v[0] += (v[2] - minW) / 2; v[3] = v[3] * minW / v[2]; v[2] = minW; }
    if (v[2] > base[2] * 1.2) { v = base.slice(); }
    view = v;
    svg.setAttribute('viewBox', v.map(function (n) { return n.toFixed(1); }).join(' '));
  }

  /* Screen point -> map point, honouring preserveAspectRatio (xMidYMid meet). */
  function toMap(clientX, clientY) {
    var r = svg.getBoundingClientRect();
    var s = Math.min(r.width / view[2], r.height / view[3]);
    var ox = (r.width - view[2] * s) / 2, oy = (r.height - view[3] * s) / 2;
    return [view[0] + (clientX - r.left - ox) / s, view[1] + (clientY - r.top - oy) / s];
  }
  function scale() {
    var r = svg.getBoundingClientRect();
    return Math.min(r.width / view[2], r.height / view[3]);
  }

  function zoomAt(factor, mx, my) {
    var w = view[2] / factor, h = view[3] / factor;
    setView([mx - (mx - view[0]) / factor, my - (my - view[1]) / factor, w, h]);
  }

  function zoomTo(bb, pad) {
    var r = svg.getBoundingClientRect();
    var aspect = r.width / r.height;
    var w = Math.max(bb.width * pad, base[2] / 10), h = Math.max(bb.height * pad, base[3] / 10);
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    setView([bb.x + bb.width / 2 - w / 2, bb.y + bb.height / 2 - h / 2, w, h]);
  }

  /* The starting view: Europe from Portugal and Iceland to Finland, Cyprus
     and the Caucasus, fitted to the screen's shape. Central Asia is a drag
     or a zoom-out away. On a tall phone screen the full map would be a thin
     strip; this fills the screen instead. */
  var HOME = ['PT', 'IS', 'FI', 'CY', 'AZ'];
  function home() {
    var box = null;
    HOME.forEach(function (cc) {
      var p = svg.querySelector('.member[data-cc="' + cc + '"]');
      if (!p) return;
      var b = p.getBBox();
      if (!box) box = { x: b.x, y: b.y, x2: b.x + b.width, y2: b.y + b.height };
      else {
        box.x = Math.min(box.x, b.x); box.y = Math.min(box.y, b.y);
        box.x2 = Math.max(box.x2, b.x + b.width); box.y2 = Math.max(box.y2, b.y + b.height);
      }
    });
    if (!box) { setView(base.slice()); return; }
    zoomTo({ x: box.x, y: box.y, width: box.x2 - box.x, height: box.y2 - box.y }, 1.04);
  }

  function wireZoom() {
    root.querySelector('[data-zoom="in"]').addEventListener('click', function () {
      zoomAt(1.6, view[0] + view[2] / 2, view[1] + view[3] / 2);
    });
    root.querySelector('[data-zoom="out"]').addEventListener('click', function () {
      zoomAt(1 / 1.6, view[0] + view[2] / 2, view[1] + view[3] / 2);
    });
    root.querySelector('[data-zoom="reset"]').addEventListener('click', home);

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = toMap(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * 0.0015), p[0], p[1]);
    }, { passive: false });

    var pointers = {}, startDist = 0, startView = null, moved = 0, downTarget = null;
    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = [e.clientX, e.clientY];
      moved = 0;
      downTarget = e.target;
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        startDist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        startView = view.slice();
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      var prev = pointers[e.pointerId];
      pointers[e.pointerId] = [e.clientX, e.clientY];
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        var s = scale();
        var dx = (e.clientX - prev[0]) / s, dy = (e.clientY - prev[1]) / s;
        moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]);
        if (moved > 4) canvas.classList.add('is-dragging');
        setView([view[0] - dx, view[1] - dy, view[2], view[3]]);
      } else if (ids.length === 2 && startDist) {
        moved = 99;
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        var f = d / startDist;
        var mid = toMap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        var w = startView[2] / f, h = startView[3] / f;
        setView([mid[0] - (mid[0] - view[0]) * w / view[2], mid[1] - (mid[1] - view[1]) * h / view[3], w, h]);
      }
    });
    function up(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) startDist = 0;
      canvas.classList.remove('is-dragging');
      if (moved < 6 && downTarget && Object.keys(pointers).length === 0) {
        var hit = downTarget.closest && downTarget.closest('[data-cc]');
        if (hit) select(hit.getAttribute('data-cc'), false);
      }
      downTarget = null;
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  /* ---------------- countries ---------------- */
  function stateOf(cc) { return (DATA[cc] && DATA[cc].status) || 'planned'; }

  function decorate() {
    var members = svg.querySelectorAll('.member');
    var dots = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    dots.setAttribute('class', 'dots');
    members.forEach(function (p) {
      var cc = p.getAttribute('data-cc');
      p.classList.toggle('is-ready', stateOf(cc) === 'ready');
      p.setAttribute('tabindex', '0');
      p.setAttribute('role', 'button');
      var bb = p.getBBox();
      if (bb.width * bb.height < 160) {
        var c = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', bb.x + bb.width / 2);
        c.setAttribute('cy', bb.y + bb.height / 2);
        c.setAttribute('r', 5);
        c.setAttribute('class', 'dot' + (stateOf(cc) === 'ready' ? ' is-ready' : ''));
        c.setAttribute('data-cc', cc);
        dots.appendChild(c);
      }
      p.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(cc, false); }
      });
    });
    svg.appendChild(dots);
    label();
  }

  function label() {
    if (!svg) return;
    svg.querySelectorAll('.member').forEach(function (p) {
      p.setAttribute('aria-label', regionName(p.getAttribute('data-cc')));
    });
  }

  function select(cc, fromList) {
    selected = cc;
    svg.querySelectorAll('[data-cc]').forEach(function (n) {
      n.classList.toggle('is-selected', n.getAttribute('data-cc') === cc);
    });
    renderPanel();
    if (fromList) {
      var p = svg.querySelector('.member[data-cc="' + cc + '"]');
      if (p) zoomTo(p.getBBox(), 2.4);
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    try { history.replaceState(history.state, '', location.pathname + location.search + '#' + cc); } catch (e) {}
    if (window.aistTrack) window.aistTrack('cta_click', { cta_id: 'etuce-country-' + cc });
  }

  function renderPanel() {
    if (!selected) { panel.hidden = true; return; }
    var cc = selected, d = DATA[cc] || { status: 'planned', trees: [] };
    panel.querySelector('[data-panel-title]').textContent = regionName(cc);
    var own = [];
    (d.trees || []).forEach(function (tr) {
      var n = regionName(cc, tr.language);
      if (n !== regionName(cc) && own.indexOf(n) === -1) own.push(n);
    });
    panel.querySelector('[data-panel-endonym]').textContent = own.join(' · ');

    var body = panel.querySelector('[data-panel-body]');
    body.innerHTML = '';
    if (d.status === 'ready' && d.trees.length) {
      d.trees.forEach(function (tr) {
        var box = el('div', 'etuce-tree');
        var h = el('h3', 'etuce-tree__title', tr.title);
        h.lang = tr.language;
        box.appendChild(h);
        if (tr.subtitle) { var sub = el('p', 'etuce-tree__sub', tr.subtitle); sub.lang = tr.language; box.appendChild(sub); }
        var dl = el('dl', 'etuce-tree__facts');
        dl.appendChild(el('dt', null, t('tree-curriculum')));
        var dd = el('dd');
        if (tr.url) {
          var a = el('a', null, tr.curriculum);
          a.href = tr.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.lang = tr.language;
          dd.appendChild(a);
        } else { dd.textContent = tr.curriculum; }
        if (tr.issuer) { dd.appendChild(document.createTextNode(' — ')); var iss = el('span', null, tr.issuer); iss.lang = tr.language; dd.appendChild(iss); }
        dl.appendChild(dd);
        dl.appendChild(el('dt', null, t('tree-language')));
        dl.appendChild(el('dd', null, languageName(tr.language) + ' (' + languageName(tr.language, tr.language) + ')'));
        box.appendChild(dl);
        var go = el('a', 'btn btn--primary', t('tree-open'));
        go.href = '/trees/' + tr.slug + '/';
        go.setAttribute('data-track-cta', 'etuce-open-' + tr.slug);
        box.appendChild(go);
        body.appendChild(box);
      });
    } else {
      var key = { building: 'status-building', 'missing-curriculum': 'status-missing-curriculum', later: 'status-later' }[d.status] || 'status-planned';
      body.appendChild(el('p', 'etuce-panel__status', t(key)));
    }
    panel.hidden = false;
  }

  function renderList() {
    var codes = Object.keys(DATA);
    var ready = codes.filter(function (cc) { return stateOf(cc) === 'ready'; }).length;
    if (countEl) countEl.textContent = t('count-ready').replace('{n}', ready);
    codes.sort(function (a, b) { return regionName(a).localeCompare(regionName(b), lang()); });
    listEl.innerHTML = '';
    codes.forEach(function (cc) {
      var li = el('li');
      var b = el('button', stateOf(cc) === 'ready' ? 'is-ready' : '');
      b.type = 'button';
      b.appendChild(el('span', null, regionName(cc)));
      b.appendChild(el('span', 'etuce-list__state', stateOf(cc) === 'ready' ? t('legend-ready') : t('legend-coming')));
      b.addEventListener('click', function () { select(cc, true); });
      li.appendChild(b);
      listEl.appendChild(li);
    });
  }

  panel.querySelector('[data-panel-close]').addEventListener('click', function () {
    selected = null;
    svg.querySelectorAll('.is-selected').forEach(function (n) { n.classList.remove('is-selected'); });
    panel.hidden = true;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
  });

  Promise.all([
    fetch('/etuce/map.svg').then(function (r) { return r.text(); }),
    fetch('/etuce/countries.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    canvas.innerHTML = res[0];
    DATA = res[1];
    svg = canvas.querySelector('svg');
    svg.setAttribute('role', 'group');
    base = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    view = base.slice();
    decorate();
    home();
    wireZoom();
    renderList();
    var hash = (location.hash || '').slice(1).toUpperCase();
    if (DATA[hash]) select(hash, false);
  });

  if (window.i18n && window.i18n.onChange) {
    window.i18n.onChange(function () { label(); renderList(); renderPanel(); });
  }
})();

/* ==========================================================================
   tour.js — the guided tour on /how-it-works/.

   The page is an ordinary tree page (the engine's own template) with a demo
   tree for the reader's language, and this script on top. It walks the
   reader through what a tree does, one thing at a time: a dark screen with a
   window that narrows onto the one control to press, and a pretend AI
   service the reader pastes into and sends from. The AI never runs: every
   reply is written in advance, in REPLIES below, and what the reader sends
   is never read. That is the point: the tour costs nothing, works without a
   network call to a model, and always says the same thing.

   Loaded BEFORE engine.js, because it decides where the engine fetches
   tree.csv from (/how-it-works/demo/<lang>/tree.csv) and resets the demo's
   progress so every visit starts the same way.

   See how-it-works_private/AGENTS.md.
   ========================================================================== */
(function () {
  'use strict';

  var LANGS = ['en', 'nb', 'sv'];
  var ALIAS = { no: 'nb', nn: 'nb', nob: 'nb', nno: 'nb' };

  /* Same order as js/i18n.js: ?lang= first, then the browser. */
  function pickLang() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (q) { q = ALIAS[q] || q; if (LANGS.indexOf(q) >= 0) return q; }
    var list = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var c = String(list[i]).toLowerCase().split('-')[0];
      c = ALIAS[c] || c;
      if (LANGS.indexOf(c) >= 0) return c;
    }
    return 'en';
  }
  var lang = pickLang();
  var langQuery = '?lang=' + lang;

  /* The node the tour walks through, and the two the reader has "already"
     mastered so it is open to practise. Ids from demo/<lang>/tree.csv. */
  var IDS = {
    en: { target: 'read-formula', seed: ['atom-molecule', 'element-symbols'] },
    nb: { target: 'lese-formel', seed: ['atom-molekyl', 'grunnstoffsymboler'] },
    sv: { target: 'lasa-formel', seed: ['atom-molekyl', 'grundamnessymboler'] }
  }[lang];
  var STORAGE = 'aist-demo-natural-science-' + lang;

  /* The engine fetches the relative path 'tree.csv'. Point it at the demo. */
  var origFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    if (url === 'tree.csv') url = '/how-it-works/demo/' + lang + '/tree.csv';
    return origFetch(url, opts);
  };

  /* Every visit starts from the same place. */
  try {
    var seeded = {};
    IDS.seed.forEach(function (id) { seeded[id] = { mastered: true }; });
    localStorage.setItem(STORAGE, JSON.stringify(seeded));
  } catch (e) {}

  /* ------------------------------------------------------------------ */
  /* Text                                                                */
  /* ------------------------------------------------------------------ */

  var KEY = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl';
  var PASTE = ' <kbd>' + KEY + '</kbd> + <kbd>V</kbd>';
  /* As little text as possible: the tour shows, it does not explain
     (Vidar, 2026-11-13). An empty string means the card has only
     «Click here» or the Next button. */
  var T = {
    en: {
      next: 'Next', clickHere: 'Click here',
      intro: 'This is an AI skill tree.',
      types: 'Facts, concepts and skills.',
      node: '', copy: '', paste: 'Paste:' + PASTE, pasteHelp: 'Insert it for me',
      send: '', reply: '', tutorDone: '', master: '', menu: '', test: '',
      covers: 'Only mastered goals. The icon shows all.',
      examCopy: '', paste2: 'Paste:' + PASTE, send2: '', testDone: '',
      endTitle: 'That\u2019s it.', endTrees: 'See all the trees', endMake: 'Make your own',
      chatName: 'AI service', chatSub: '· new chat', chatEmpty: 'How can I help?', chatEmptySub: '',
      chatPh: 'Message AI service…', pasted: 'Pasted text', words: 'words',
      chatNote: 'Pre-written replies.'
    },
    nb: {
      next: 'Neste', clickHere: 'Klikk her',
      intro: 'Dette er et KI-ferdighetstre.',
      types: 'Fakta, begreper og ferdigheter.',
      node: '', copy: '', paste: 'Lim inn:' + PASTE, pasteHelp: 'Sett inn for meg',
      send: '', reply: '', tutorDone: '', master: '', menu: '', test: '',
      covers: 'Bare mestrede mål. Ikonet viser alle.',
      examCopy: '', paste2: 'Lim inn:' + PASTE, send2: '', testDone: '',
      endTitle: 'Det var det.', endTrees: 'Se alle trærne', endMake: 'Lag ditt eget',
      chatName: 'KI-tjeneste', chatSub: '· ny chat', chatEmpty: 'Hva kan jeg hjelpe med?', chatEmptySub: '',
      chatPh: 'Skriv til KI-tjenesten…', pasted: 'Innlimt tekst', words: 'ord',
      chatNote: 'Ferdigskrevne svar.'
    },
    sv: {
      next: 'Nästa', clickHere: 'Klicka här',
      intro: 'Det här är ett AI-färdighetsträd.',
      types: 'Fakta, begrepp och färdigheter.',
      node: '', copy: '', paste: 'Klistra in:' + PASTE, pasteHelp: 'Sätt in åt mig',
      send: '', reply: '', tutorDone: '', master: '', menu: '', test: '',
      covers: 'Bara avklarade mål. Ikonen visar alla.',
      examCopy: '', paste2: 'Klistra in:' + PASTE, send2: '', testDone: '',
      endTitle: 'Det var allt.', endTrees: 'Se alla träd', endMake: 'Gör ditt eget',
      chatName: 'AI-tjänst', chatSub: '· ny chatt', chatEmpty: 'Hur kan jag hjälpa till?', chatEmptySub: '',
      chatPh: 'Skriv till AI-tjänsten…', pasted: 'Inklistrad text', words: 'ord',
      chatNote: 'Förskrivna svar.'
    }
  }[lang];

  /* The conversation: real Sonnet replies, verbatim, in replies.js. */
  var REPLIES = (window.AIST_TOUR_REPLIES || {})[lang];

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  /* Wait until a selector (or function) finds something. */
  function waitFor(find, timeout) {
    var get = typeof find === 'function' ? find : function () { return $(find); };
    return new Promise(function (res, rej) {
      var t0 = Date.now();
      (function poll() {
        var hit = get();
        if (hit) return res(hit);
        if (timeout && Date.now() - t0 > timeout) return rej(new Error('timeout'));
        setTimeout(poll, 80);
      })();
    });
  }

  function nodeBox(id) {
    return document.querySelector('.node-box[data-node-id="' + id + '"]');
  }

  /* The little Markdown a chat renders: headings, **bold**, line breaks. */
  function md(s) {
    var span = function (x) { return esc(x).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>'); };
    return s.split('\n').map(function (line) {
      var m;
      if ((m = line.match(/^(#{1,3}) (.*)/))) return '<b class="tour-chat__h">' + span(m[2]) + '</b>';
      if (/^---+$/.test(line)) return '<hr class="tour-chat__hr">';
      if (/^\|[-| :]+\|$/.test(line)) return '';
      if (/^\|.*\|$/.test(line)) return '<span class="tour-chat__row">' + line.slice(1, -1).split('|').map(function (c) { return '<span>' + span(c.trim()) + '</span>'; }).join('') + '</span>';
      if ((m = line.match(/^[-*] (.*)/))) return '<span class="tour-chat__li">' + span(m[1]) + '</span>';
      return span(line) + '<br>';
    }).join('');
  }


  /* ------------------------------------------------------------------ */
  /* The spotlight: a dark screen with a window onto one control         */
  /* ------------------------------------------------------------------ */

  var root, hole, clip, card, blockers = [], current = null, follow = null;

  function buildOverlay() {
    root = el('div', 'tour');
    hole = el('div', 'tour-hole');
    /* The window sits in a frame the size of the visible area, which clips
       it: nothing of the overlay may reach past what is on screen (see the
       walls in place()). */
    clip = el('div', 'tour-clip');
    clip.appendChild(hole);
    root.appendChild(clip);
    for (var i = 0; i < 4; i++) { var b = el('div', 'tour-block'); blockers.push(b); root.appendChild(b); }
    card = el('div', 'tour-card');
    root.appendChild(card);
    document.body.appendChild(root);
    /* The overlay lives in DOCUMENT coordinates (position: absolute from
       the page's origin), not fixed to the screen, and is measured again on
       every frame. On an iPhone the keyboard and the browser's toolbars
       move the page and the visible area apart; anything fixed to the
       screen then drifts away from the control it points at. Anchored to
       the page and re-measured each frame, the window stays on its target
       whatever scrolls. */
    (function loop() { place(); requestAnimationFrame(loop); })();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', place);
      window.visualViewport.addEventListener('scroll', place);
    }
    /* Escape closes the engine's windows, which would lose the reader's
       place in the tour. Not while the tour runs. */
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root && !root.classList.contains('done')) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  /* Where the window goes, as a rect. Null: no window, the whole screen dark. */
  function targetRect() {
    if (!current) return null;
    var els = current();
    if (!els) return null;
    if (!Array.isArray(els)) els = [els];
    var r = null;
    els.forEach(function (e) {
      if (!e) return;
      var b = e.getBoundingClientRect();
      if (!b.width && !b.height) return;
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) }
            : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
    return r;
  }

  var shape = null, settleTimer = null;
  /* The visible part of the page, in the page's own coordinates. */
  function viewport() {
    var vv = window.visualViewport;
    var sx = window.scrollX || window.pageXOffset || 0, sy = window.scrollY || window.pageYOffset || 0;
    if (vv) return { x: sx + vv.offsetLeft, y: sy + vv.offsetTop, w: vv.width, h: vv.height, sx: sx, sy: sy };
    return { x: sx, y: sy, w: window.innerWidth, h: window.innerHeight, sx: sx, sy: sy };
  }

  function place() {
    if (!root) return;
    var V = viewport();
    var r = targetRect();
    /* targetRect() is relative to the layout viewport; add the scroll to
       get page coordinates. */
    if (r) r = { left: r.left + V.sx, top: r.top + V.sy, right: r.right + V.sx, bottom: r.bottom + V.sy };
    var hx, hy, hw, hh;
    if (root.classList.contains('wide')) {
      /* Start of a step: the window is the whole visible area, and narrows. */
      hx = V.x; hy = V.y; hw = V.w; hh = V.h;
    } else if (r) {
      /* An ellipse around the target, a little larger than it. */
      var w = r.right - r.left, h = r.bottom - r.top;
      hw = w * 1.18 + 36; hh = h * 1.3 + 30;
      if (shape === 'round') { var d = Math.max(hw, hh); hw = d; hh = d; }
      if (shape === 'rect') { hw = w + 16; hh = h + 16; }
      hx = r.left + w / 2 - hw / 2; hy = r.top + h / 2 - hh / 2;
    } else {
      hw = 0; hh = 0; hx = V.x + V.w / 2; hy = V.y + V.h / 2;
    }
    clip.style.left = V.x + 'px'; clip.style.top = V.y + 'px';
    clip.style.width = V.w + 'px'; clip.style.height = V.h + 'px';
    hole.style.left = (hx - V.x) + 'px'; hole.style.top = (hy - V.y) + 'px';
    hole.style.width = hw + 'px'; hole.style.height = hh + 'px';
    hole.classList.toggle('is-rect', shape === 'rect');

    /* Four transparent walls around the target, so only it takes a click.
       They cover exactly the visible area and no more: an element reaching
       past it would make the page larger, and a phone then zooms the whole
       page out to fit it. They are measured again on every frame, so a page
       that moves under the finger is covered again at once. */
    var L = V.x, T = V.y, R = V.x + V.w, B = V.y + V.h;
    var cut = r ? { l: Math.max(L, r.left - 4), t: Math.max(T, r.top - 4), r: Math.min(R, r.right + 4), b: Math.min(B, r.bottom + 4) } : null;
    var interactive = cut && root.dataset.click === 'yes';
    var rects = interactive
      ? [[L, T, R - L, cut.t - T], [L, cut.b, R - L, B - cut.b], [L, cut.t, cut.l - L, cut.b - cut.t], [cut.r, cut.t, R - cut.r, cut.b - cut.t]]
      : [[L, T, R - L, B - T], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    blockers.forEach(function (b, i) {
      var q = rects[i];
      b.style.left = q[0] + 'px'; b.style.top = q[1] + 'px';
      b.style.width = Math.max(0, q[2]) + 'px'; b.style.height = Math.max(0, q[3]) + 'px';
    });
    placeCard(r ? { left: hx, top: hy, right: hx + hw, bottom: hy + hh } : null, V);
  }

  function placeCard(r, V) {
    var cw = card.offsetWidth, ch = card.offsetHeight, m = 16, x, y;
    var vl = V.x, vt = V.y, vr = V.x + V.w, vb = V.y + V.h;
    if (!r) { x = vl + (V.w - cw) / 2; y = vt + (V.h - ch) / 2; }
    else {
      var below = vb - r.bottom, above = r.top - vt, right = vr - r.right, left = r.left - vl;
      if (below >= ch + m * 2) { y = r.bottom + m; x = (r.left + r.right) / 2 - cw / 2; }
      else if (above >= ch + m * 2) { y = r.top - ch - m; x = (r.left + r.right) / 2 - cw / 2; }
      else if (left >= cw + m * 2) { x = r.left - cw - m; y = (r.top + r.bottom) / 2 - ch / 2; }
      else if (right >= cw + m * 2) { x = r.right + m; y = (r.top + r.bottom) / 2 - ch / 2; }
      else { x = vl + (V.w - cw) / 2; y = vb - ch - m; }
    }
    card.style.left = Math.max(vl + m, Math.min(vr - cw - m, x)) + 'px';
    card.style.top = Math.max(vt + m, Math.min(vb - ch - m, y)) + 'px';
  }

  /* One step: point at `find`, say `html`. With `click`, the reader must
     press the target itself; otherwise a Next button moves on. Resolves when
     the step is done. */
  function step(opts) {
    return new Promise(function (resolve) {
      current = opts.find || null;
      shape = opts.round ? 'round' : opts.rect ? 'rect' : null;
      root.dataset.click = (opts.click || opts.wait || opts.interactive) ? 'yes' : 'no';
      root.classList.toggle('light', !!opts.light);
      card.innerHTML = '';
      if (opts.click || (opts.wait && !opts.html)) card.appendChild(el('span', 'tour-card__pulse', T.clickHere));
      if (opts.html) card.appendChild(el('p', 'tour-card__text', opts.html));
      if (opts.extra) card.appendChild(opts.extra);
      if (!opts.click && !opts.wait) {
        var nb = el('button', 'tour-card__next', T.next);
        nb.type = 'button';
        nb.addEventListener('click', function () { done(); });
        card.appendChild(nb);
        setTimeout(function () { nb.focus({ preventScroll: true }); }, 50);
      }
      /* The window starts wide and narrows onto the target. */
      root.classList.remove('settled');
      root.classList.add('wide');
      place();
      requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('wide'); place(); }); });
      /* Once it has narrowed, the window follows its target exactly, with
         no easing to lag behind a scroll. */
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () { root.classList.add('settled'); }, 650);

      /* Every tick: if the reader has closed what the target lives in (a
         menu, a window, the panel), open it again, so the tour never waits
         for a control that is not on the screen. `skip` ends the step when
         the reader has already done it some other way. */
      var lastFix = 0;
      clearInterval(follow);
      follow = setInterval(function () {
        if (finished) return;
        if (opts.skip && opts.skip()) { done(); return; }
        if (opts.ensure && Date.now() - lastFix > 700 && !usable(firstOf(current && current()))) {
          lastFix = Date.now();
          opts.ensure();
        }
        place();
      }, 250);

      /* A click counts when it lands on the target as it is NOW: the engine
         redraws its panels, so a listener on the element found at the
         start of the step could be on an element that is gone. */
      function onClick(e) {
        if (finished) return;
        var t = current && current();
        var list = Array.isArray(t) ? t : [t];
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].contains(e.target)) { setTimeout(done, opts.after || 350); return; }
        }
      }
      if (opts.click) document.addEventListener('click', onClick, true);
      if (opts.wait) opts.wait.then(function () { done(); });
      var finished = false;
      function done() {
        if (finished) return; finished = true;
        document.removeEventListener('click', onClick, true);
        resolve();
      }
    });
  }

  function firstOf(x) { return Array.isArray(x) ? x[0] : x; }

  /* Is this element on the screen and the thing a click there would hit? */
  function usable(e) {
    if (!e || !e.isConnected) return false;
    var r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    root.style.visibility = 'hidden';
    var hit = document.elementFromPoint(x, y);
    root.style.visibility = '';
    return !!hit && (e === hit || e.contains(hit));
  }

  /* What the tree has open, and how to put it back. */
  function menuOpen() { var b = $('#menu-toggle-btn'); return !!b && b.getAttribute('aria-expanded') === 'true'; }
  function closeMenu() { if (menuOpen()) $('#menu-toggle-btn').click(); }
  function closeWindows() {
    Array.prototype.forEach.call(document.querySelectorAll('.aist-overlay.open'), function (o) { o.classList.remove('open'); });
  }
  /* On a phone (the engine's breakpoint, 720px) the open panel covers the
     whole screen, menu button included. Decided from the layout, not from a
     hit test: on an iPhone the page can be left scrolled by the keyboard,
     and then the hit test answers for the wrong spot. */
  function closePanelIfCovering(e) {
    var phone = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
    if ($('#detail-panel.open') && (phone || (e && !usable(e))) && $('#detail-close')) $('#detail-close').click();
  }
  /* The keyboard on a phone scrolls the page to show the chat's input, and
     leaves it scrolled. Put it back. */
  function unscroll() {
    var a = document.activeElement; if (a && a.blur) a.blur();
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
  function openTarget() {
    closeMenu(); closeWindows();
    var b = nodeBox(IDS.target); if (!b) return;
    var t = firstOf(current && current());
    /* Already open: the control is just out of view in the panel. Clicking
       the goal again could close the panel, so scroll instead. */
    if (b.classList.contains('active') && t && t.isConnected && t.getBoundingClientRect().width) t.scrollIntoView({ block: 'center' });
    else b.click();
  }

  /* ------------------------------------------------------------------ */
  /* The pretend AI service                                              */
  /* ------------------------------------------------------------------ */

  var chat;
  function buildChat() {
    chat = el('div', 'tour-chat');
    chat.innerHTML =
      '<div class="tour-chat__hd"><span class="tour-chat__logo">✦</span><span class="tour-chat__name">' + esc(T.chatName) + '</span><span class="tour-chat__sub">' + esc(T.chatSub) + '</span></div>' +
      '<div class="tour-chat__msgs"></div>' +
      '<div class="tour-chat__in"><div class="tour-chat__chip" hidden></div><textarea class="tour-chat__ta" rows="2" placeholder="' + esc(T.chatPh) + '"></textarea>' +
      '<div class="tour-chat__bar"><span class="tour-chat__plus">＋</span><button type="button" class="tour-chat__send" aria-label="Send">↑</button></div></div>' +
      '<p class="tour-chat__note">' + esc(T.chatNote) + '</p>';
    document.body.appendChild(chat);
    var ta = $('.tour-chat__ta', chat);
    /* Keys typed here belong to the chat, not to the tree's shortcuts. */
    ta.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('.tour-chat__send', chat).click(); }
    });
    ta.addEventListener('input', syncSend);
  }

  var pasted = false;
  function chatReset() {
    $('.tour-chat__msgs', chat).innerHTML = '<div class="tour-chat__empty"><b>' + esc(T.chatEmpty) + '</b>' + esc(T.chatEmptySub) + '</div>';
    var ta = $('.tour-chat__ta', chat); ta.value = '';
    $('.tour-chat__in .tour-chat__chip', chat).hidden = true;
    pasted = false; syncSend();
  }
  function syncSend() {
    var ready = pasted || $('.tour-chat__ta', chat).value.trim() !== '';
    $('.tour-chat__send', chat).classList.toggle('ready', ready);
  }
  function chatOpen() { chatReset(); chat.classList.add('on'); return sleep(350); }
  function chatClose() { unscroll(); chat.classList.remove('on'); return sleep(300).then(unscroll); }

  /* Resolves when something is pasted (whatever it is) or the reader asks
     for it to be inserted. */
  function waitForPaste(help) {
    var ta = $('.tour-chat__ta', chat);
    return new Promise(function (resolve) {
      function take(text) {
        var words = text ? text.split(/\s+/).filter(Boolean).length : 0;
        var chip = $('.tour-chat__in .tour-chat__chip', chat);
        chip.innerHTML = '<i>' + esc(T.pasted) + (words > 20 ? ' · ' + words.toLocaleString(lang) + ' ' + esc(T.words) : '') + '</i>' + (text ? '<pre>' + esc(text.slice(0, 200)) + '</pre>' : '');
        chip.hidden = false; ta.value = ''; pasted = true; syncSend();
        ta.removeEventListener('paste', onPaste);
        resolve();
      }
      function onPaste(e) {
        e.preventDefault();
        var text = (e.clipboardData && e.clipboardData.getData('text')) || '';
        take(text);
      }
      ta.addEventListener('paste', onPaste);
      if (help) help.addEventListener('click', function () {
        var p = navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.reject();
        p.then(take, function () { take(''); });
      }, { once: true });
      setTimeout(function () { ta.focus({ preventScroll: true }); }, 60);
    });
  }

  /* Resolves when the reader sends; shows what they sent as their message. */
  function waitForSend() {
    var btn = $('.tour-chat__send', chat), ta = $('.tour-chat__ta', chat);
    return new Promise(function (resolve) {
      function onSend() {
        if (!btn.classList.contains('ready')) return;
        btn.removeEventListener('click', onSend);
        var msgs = $('.tour-chat__msgs', chat);
        var empty = $('.tour-chat__empty', msgs); if (empty) empty.remove();
        var u = el('div', 'tour-chat__u');
        if (pasted) { u.appendChild($('.tour-chat__in .tour-chat__chip', chat).cloneNode(true)); u.firstChild.hidden = false; u.classList.add('is-paste'); }
        else u.textContent = ta.value;
        msgs.appendChild(u);
        ta.value = ''; pasted = false; $('.tour-chat__in .tour-chat__chip', chat).hidden = true; syncSend();
        msgs.scrollTop = msgs.scrollHeight;
        resolve();
      }
      btn.addEventListener('click', onSend);
    });
  }

  /* A reply, streamed a few words at a time like a chat app. */
  async function reply(text) {
    var msgs = $('.tour-chat__msgs', chat);
    var b = el('div', 'tour-chat__b', '<span class="tour-chat__logo">✦</span><div class="tour-chat__t"><span class="tour-chat__dots"><span></span><span></span><span></span></span></div>');
    msgs.appendChild(b); msgs.scrollTop = msgs.scrollHeight;
    await sleep(800);
    var t = $('.tour-chat__t', b);
    var words = text.split(/(?<=\s)(?=\S)/);
    var per = Math.max(1, Math.ceil(words.length / 60));
    for (var i = per; i < words.length + per; i += per) {
      t.innerHTML = md(words.slice(0, i).join(''));
      msgs.scrollTop = msgs.scrollHeight;
      await sleep(40);
    }
    t.innerHTML = md(text);
    msgs.scrollTop = b.offsetTop - msgs.offsetTop - 8;
  }

  /* ------------------------------------------------------------------ */
  /* The tour                                                            */
  /* ------------------------------------------------------------------ */

  function sendBtn() { return $('.tour-chat__send', chat); }
  function chatInput() { return $('.tour-chat__in', chat); }

  /* While the AI answers: the whole chat in view, no card. */
  async function watch(text) {
    current = function () { return chat; };
    shape = 'rect';
    root.dataset.click = 'no';
    root.classList.add('quiet');
    place();
    await reply(text);
    root.classList.remove('quiet');
  }

  async function run() {
    var box = await waitFor(function () { return nodeBox(IDS.target); });
    await sleep(300);
    buildOverlay();
    buildChat();

    await step({ html: T.intro, light: true });
    await step({ html: T.types, find: function () {
      var mine = [];
      box = nodeBox(IDS.target) || box;
      var x = box.getBoundingClientRect();
      Array.prototype.forEach.call(document.querySelectorAll('.node-box'), function (n) {
        var r = n.getBoundingClientRect();
        if (Math.abs((r.left + r.right) / 2 - (x.left + x.right) / 2) < 260 && r.top < x.bottom + 10) mine.push(n);
      });
      return mine.length ? mine : box;
    } });
    await step({ html: T.node, click: true, find: function () { return nodeBox(IDS.target); } });

    var copyBtn = function () {
      var bs = document.querySelectorAll('#detail-panel button.btn:not(.secondary)');
      return bs[bs.length - 1] || null;
    };
    await waitFor(copyBtn);
    /* If the panel was closed, or shows another goal, open the right one. */
    await step({ html: T.copy, click: true, find: copyBtn, after: 500, ensure: openTarget });

    /* First chat: the practice tutor. */
    await chatOpen();
    var help = el('button', 'tour-card__link', esc(T.pasteHelp)); help.type = 'button';
    await step({ html: T.paste, find: chatInput, wait: waitForPaste(help), extra: help });
    await step({ html: T.send, find: sendBtn, round: true, wait: waitForSend() });
    await watch(REPLIES.tutor1);
    $('.tour-chat__ta', chat).value = REPLIES.pupil; syncSend();
    await step({ html: T.reply, find: chatInput, wait: waitForSend() });
    await watch(REPLIES.tutor2);
    await step({ html: T.tutorDone, find: function () { return chat; }, rect: true, interactive: true });
    await chatClose();

    /* Tick it off. */
    await step({ html: T.master, click: true, ensure: openTarget, find: function () {
      var a = $('#detail-panel .mastery-check'), b = $('#detail-panel .mastered-toggle-text');
      return [a, b].filter(Boolean);
    } });

    /* The test. Each step puts back what it needs: on a phone the panel
       covers the menu button; a menu closed by a stray click is opened
       again; a closed Test window is opened again. */
    var examOpen = function () { return !!$('#exam-overlay.open'); };
    closePanelIfCovering($('#menu-toggle-btn'));
    await sleep(300);
    await step({ html: T.menu, click: true, round: true, after: 450,
      find: function () { return $('#menu-toggle-btn'); },
      skip: function () { return menuOpen() || examOpen(); },
      ensure: function () { closeWindows(); closePanelIfCovering($('#menu-toggle-btn')); } });
    await step({ html: T.test, click: true, after: 500,
      find: function () { return $('#exam-btn'); },
      skip: examOpen,
      ensure: function () { closePanelIfCovering($('#menu-toggle-btn')); if (!menuOpen()) $('#menu-toggle-btn').click(); } });
    var reopenExam = function () { if (!examOpen()) { var b = $('#exam-btn'); if (b) b.click(); } };
    if (!examOpen()) reopenExam();
    await waitFor('#exam-overlay.open .exam-cover');
    await step({ html: T.covers, find: function () { return $('#exam-overlay.open .exam-cover'); }, ensure: reopenExam });
    await step({ html: T.examCopy, click: true, after: 500, ensure: reopenExam,
      find: function () { return $('#exam-overlay.open .resource-copy'); } });
    closeWindows();
    await chatOpen();
    var help2 = el('button', 'tour-card__link', esc(T.pasteHelp)); help2.type = 'button';
    await step({ html: T.paste2, find: chatInput, wait: waitForPaste(help2), extra: help2 });
    await step({ html: T.send2, find: sendBtn, round: true, wait: waitForSend() });
    await watch(REPLIES.test);
    await step({ html: T.testDone, find: function () { return chat; }, rect: true, interactive: true });
    await chatClose();

    /* The end: two ways on. */
    finish();
  }

  function finish() {
    current = null;
    clearInterval(follow);
    root.dataset.click = 'no';
    root.classList.remove('light');
    card.classList.add('tour-card--end');
    card.innerHTML = '';
    card.appendChild(el('h2', 'tour-card__title', esc(T.endTitle)));
    var row = el('div', 'tour-card__ctas');
    var a1 = el('a', 'tour-card__cta tour-card__cta--primary', esc(T.endTrees)); a1.href = '/trees/' + langQuery; a1.setAttribute('data-track-cta', 'tour-end-trees');
    var a2 = el('a', 'tour-card__cta', esc(T.endMake)); a2.href = '/make-your-own/' + langQuery; a2.setAttribute('data-track-cta', 'tour-end-make');
    row.appendChild(a1); row.appendChild(a2);
    card.appendChild(row);
    place();
  }

  document.addEventListener('DOMContentLoaded', function () {
    run().catch(function (e) { console.error('tour', e); });
  });
})();

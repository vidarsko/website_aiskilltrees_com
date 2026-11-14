/* ==========================================================================
   stage.js — the demo on /how-it-works/.

   Everything happens on one fixed-size stage that is scaled to the screen as
   a single picture: frozen snapshots of the demo tree in an iframe (nothing
   in them takes a click), a pretend AI chat, the spotlight and the cards,
   all in the stage's own pixels. The only thing that reacts is an invisible
   button laid exactly over the control the spotlight points at. There is no
   field to type in, so a phone never opens its keyboard, and nothing can
   scroll or zoom out from under the spotlight.

   The snapshots and the coordinates come from how-it-works_private/capture.js
   (stage/geometry.js); the AI's replies are real Sonnet replies, verbatim
   (replies.js). See how-it-works_private/AGENTS.md.
   ========================================================================== */
(function () {
  'use strict';

  var LANGS = ['en', 'nb', 'sv'];
  var ALIAS = { no: 'nb', nn: 'nb', nob: 'nb', nno: 'nb' };
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
  document.documentElement.lang = lang;

  /* Portrait or narrow: the phone pictures. Otherwise the desktop ones. */
  var S = window.AIST_STAGE;
  /* Portrait or narrow: the phone picture whose shape is closest to the
     screen's, so it fills the width with no bars at the sides. */
  var layout = 'desktop';
  (function () {
    var vv = window.visualViewport;
    var W = vv ? vv.width : window.innerWidth, H = vv ? vv.height : window.innerHeight;
    if (!(W < 700 || H > W)) return;
    var best = null, ratio = H / W;
    Object.keys(S.layouts).forEach(function (k) {
      if (k.indexOf('mobile') !== 0) return;
      var d = Math.abs(S.layouts[k].height / S.layouts[k].width - ratio);
      if (!best || d < best.d) best = { k: k, d: d };
    });
    if (best) layout = best.k;
  })();
  var phone = layout.indexOf('mobile') === 0;
  var SIZE = S.layouts[layout];
  var G = S.geo[layout + '-' + lang];
  var REPLIES = window.AIST_TOUR_REPLIES[lang];
  var PROMPTS = window.AIST_TOUR_PROMPTS[lang];

  /* As little text as possible: the demo shows, it does not explain. */
  var T = {
    en: { next: 'Next', clickHere: 'Click here', intro: 'This is an AI skill tree.', types: 'Facts, concepts and skills.',
      covers: 'Only mastered goals. The icon shows all.', end: 'That’s it.', trees: 'See all the trees', make: 'Make your own',
      chatName: 'AI service', chatSub: '· new chat', chatEmpty: 'How can I help?', ph: 'Message AI service…',
      paste: 'Paste', pick: 'Open an AI service', school: 'Your school\u2019s AI', demo: 'Demo AI', pasted: 'Pasted text', words: 'words', note: 'Pre-written replies.' },
    nb: { next: 'Neste', clickHere: 'Klikk her', intro: 'Dette er et KI-ferdighetstre.', types: 'Fakta, begreper og ferdigheter.',
      covers: 'Bare mestrede mål. Ikonet viser alle.', end: 'Det var det.', trees: 'Se alle trærne', make: 'Lag ditt eget',
      chatName: 'KI-tjeneste', chatSub: '· ny chat', chatEmpty: 'Hva kan jeg hjelpe med?', ph: 'Skriv til KI-tjenesten…',
      paste: 'Lim inn', pick: 'Åpne en KI-tjeneste', school: 'Skolens egen KI', demo: 'Demo-KI', pasted: 'Innlimt tekst', words: 'ord', note: 'Ferdigskrevne svar.' },
    sv: { next: 'Nästa', clickHere: 'Klicka här', intro: 'Det här är ett AI-färdighetsträd.', types: 'Fakta, begrepp och färdigheter.',
      covers: 'Bara avklarade mål. Ikonen visar alla.', end: 'Det var allt.', trees: 'Se alla träd', make: 'Gör ditt eget',
      chatName: 'AI-tjänst', chatSub: '· ny chatt', chatEmpty: 'Hur kan jag hjälpa till?', ph: 'Skriv till AI-tjänsten…',
      paste: 'Klistra in', pick: 'Öppna en AI-tjänst', school: 'Skolans egen AI', demo: 'Demo-AI', pasted: 'Inklistrad text', words: 'ord', note: 'Förskrivna svar.' }
  }[lang];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ------------------------------------------------------------------ */
  /* The stage                                                           */
  /* ------------------------------------------------------------------ */

  var stage = $('#stage');
  stage.classList.add(phone ? 'stage--mobile' : 'stage--desktop');
  document.documentElement.classList.toggle('is-phone', phone);
  stage.style.width = SIZE.width + 'px';
  stage.style.height = SIZE.height + 'px';

  function fit() {
    var vv = window.visualViewport;
    var W = vv ? vv.width : window.innerWidth, H = vv ? vv.height : window.innerHeight;
    var k = Math.min(W / SIZE.width, H / SIZE.height);
    stage.style.transform = 'translate(' + ((W - SIZE.width * k) / 2) + 'px,' + ((H - SIZE.height * k) / 2) + 'px) scale(' + k + ')';
  }
  fit();
  window.addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

  /* One iframe per picture, all loaded up front, so a change of picture
     never flashes. */
  var STATES = ['tree', 'panel', 'ticked', 'mastered', 'menu', 'exam', 'examcopy'];
  var pics = {};
  var first = $('#pic');
  STATES.forEach(function (name, i) {
    var f = i === 0 ? first : first.cloneNode(false);
    f.removeAttribute('id');
    f.src = '/how-it-works/stage/' + layout + '/' + lang + '/' + name + '.html';
    f.classList.toggle('on', i === 0);
    if (i) stage.insertBefore(f, first.nextSibling);
    pics[name] = f;
  });
  function show(name) { STATES.forEach(function (n) { pics[n].classList.toggle('on', n === name); }); }
  function inPic(name, sel) { try { var a = pics[name].contentDocument.querySelectorAll(sel); return a[a.length - 1] || null; } catch (e) { return null; } }
  function rectOf(name, key) { var r = G[name] && G[name][key]; return r ? { x: r[0], y: r[1], w: r[2], h: r[3] } : null; }

  /* The «Copied!» label the engine itself shows after a copy. */
  function markCopied(name, sel) {
    var b = inPic(name, sel); if (!b) return;
    var spans = b.querySelectorAll('span');
    if (spans.length > 1) { spans[0].style.visibility = 'hidden'; spans[1].style.visibility = ''; }
  }

  /* ------------------------------------------------------------------ */
  /* The pretend AI chat — nothing to type in, only buttons              */
  /* ------------------------------------------------------------------ */

  var chat = el('div', 'chat');
  chat.innerHTML =
    '<div class="chat__hd"><span class="chat__logo">✦</span><span class="chat__name">' + esc(T.chatName) + '</span><span class="chat__sub">' + esc(T.chatSub) + '</span><span class="chat__x">✕</span></div>' +
    '<div class="chat__msgs"></div>' +
    '<div class="chat__in"><div class="chat__chip" hidden></div><div class="chat__field"></div>' +
    '<div class="chat__bar"><span class="chat__plus">＋</span><span class="chat__pastebtn">' + esc(T.paste) + '</span><span class="chat__send">↑</span></div></div>' +
    '<p class="chat__note">' + esc(T.note) + '</p>';
  stage.appendChild(chat);
  var msgs = $('.chat__msgs', chat), field = $('.chat__field', chat), chip = $('.chat__chip', chat);
  var sendEl = $('.chat__send', chat), pasteEl = $('.chat__pastebtn', chat), closeEl = $('.chat__x', chat);

  function chatReset() {
    msgs.innerHTML = '<div class="chat__empty">' + esc(T.chatEmpty) + '</div>';
    setField(''); chip.hidden = true; pasteEl.hidden = false; sendEl.classList.remove('ready');
  }
  function setField(text) {
    field.textContent = text || T.ph;
    field.classList.toggle('ph', !text);
    if (text) sendEl.classList.add('ready');
  }
  function chatOpen() { chatReset(); chat.classList.add('on'); return sleep(350); }
  function chatClose() { chat.classList.remove('on'); return sleep(300); }

  function doPaste(text) {
    var words = text.split(/\s+/).filter(Boolean).length;
    chip.innerHTML = '<i>' + esc(T.pasted) + ' · ' + words.toLocaleString(lang) + ' ' + esc(T.words) + '</i><pre>' + esc(text.slice(0, 160)) + '</pre>';
    chip.hidden = false; pasteEl.hidden = true; sendEl.classList.add('ready');
  }
  function doSend() {
    var e = $('.chat__empty', msgs); if (e) e.remove();
    var u = el('div', 'chat__u');
    if (!chip.hidden) { u.classList.add('is-paste'); u.appendChild(chip.cloneNode(true)); u.firstChild.hidden = false; chip.hidden = true; }
    else u.textContent = field.textContent;
    msgs.appendChild(u);
    setField(''); sendEl.classList.remove('ready');
    msgs.scrollTop = msgs.scrollHeight;
  }

  function md(s) {
    var span = function (x) { return esc(x).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>'); };
    return s.split('\n').map(function (line) {
      var m;
      if ((m = line.match(/^(#{1,3}) (.*)/))) return '<b class="chat__h">' + span(m[2]) + '</b>';
      if (/^---+$/.test(line)) return '<hr class="chat__hr">';
      if (/^\|[-| :]+\|$/.test(line)) return '';
      if (/^\|.*\|$/.test(line)) return '<span class="chat__row">' + line.slice(1, -1).split('|').map(function (c) { return '<span>' + span(c.trim()) + '</span>'; }).join('') + '</span>';
      if ((m = line.match(/^[-*] (.*)/))) return '<span class="chat__li">' + span(m[1]) + '</span>';
      return span(line) + '<br>';
    }).join('');
  }
  async function reply(text) {
    var b = el('div', 'chat__b', '<span class="chat__logo">✦</span><div class="chat__t"><span class="chat__dots"><span></span><span></span><span></span></span></div>');
    msgs.appendChild(b); msgs.scrollTop = msgs.scrollHeight;
    await sleep(800);
    var t = $('.chat__t', b), words = text.split(/(?<=\s)(?=\S)/), per = Math.max(1, Math.ceil(words.length / 60));
    for (var i = per; i < words.length + per; i += per) { t.innerHTML = md(words.slice(0, i).join('')); msgs.scrollTop = msgs.scrollHeight; await sleep(40); }
    t.innerHTML = md(text);
    msgs.scrollTop = b.offsetTop - msgs.offsetTop - 8;
  }

  /* A chat control's rect in stage pixels. */
  function chatRect(node) {
    var s = stage.getBoundingClientRect(), r = node.getBoundingClientRect(), k = s.width / SIZE.width;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }

  /* ------------------------------------------------------------------ */
  /* «Open an AI service»: the tree works with any of them                */
  /* ------------------------------------------------------------------ */

  var picker = el('div', 'picker');
  picker.innerHTML = '<p class="picker__title">' + esc(T.pick) + '</p><div class="picker__list">' +
    [['chatgpt', 'ChatGPT'], ['claude', 'Claude'], ['gemini', 'Gemini'], ['school', T.school], ['demo', T.demo]].map(function (o) {
      return '<span class="picker__opt' + (o[0] === 'demo' ? ' picker__opt--demo' : '') + '"><img src="/how-it-works/logos/' + o[0] + '.svg" alt="" width="22" height="22">' + esc(o[1]) + '</span>';
    }).join('') + '</div>';
  stage.appendChild(picker);
  var demoOpt = $('.picker__opt--demo', picker);
  function pickerOpen() { picker.classList.add('on'); return sleep(300); }
  function pickerClose() { picker.classList.remove('on'); return sleep(250); }
  /* Show the choices, let them be read, then point at the demo. */
  async function chooseService(ms) {
    await pickerOpen();
    await look(ms);
    await step({ click: true, target: function () { return chatRect(demoOpt); } });
    await pickerClose();
  }

  /* ------------------------------------------------------------------ */
  /* Spotlight, catcher and cards                                        */
  /* ------------------------------------------------------------------ */

  var dim = el('div', 'spot');
  var hole = el('div', 'spot__hole');
  dim.appendChild(hole);
  var catcher = el('div', 'catcher');
  var hot = el('button', 'hot'); hot.type = 'button'; hot.setAttribute('aria-label', T.clickHere);
  var card = el('div', 'card');
  stage.appendChild(dim); stage.appendChild(catcher); stage.appendChild(hot); stage.appendChild(card);

  /* r: the target in stage pixels, or null for the whole stage dark.
     shape: 'ellipse', 'round' or 'rect'. */
  function spot(r, shape) {
    var x, y, w, h;
    if (!r) { x = SIZE.width / 2; y = SIZE.height / 2; w = 0; h = 0; }
    else if (shape === 'rect') { x = r.x - 8; y = r.y - 8; w = r.w + 16; h = r.h + 16; }
    else {
      w = r.w * 1.18 + 36; h = r.h * 1.3 + 30;
      if (shape === 'round') { w = h = Math.max(w, h); }
      x = r.x + r.w / 2 - w / 2; y = r.y + r.h / 2 - h / 2;
    }
    hole.classList.toggle('is-rect', shape === 'rect');
    hole.style.left = x + 'px'; hole.style.top = y + 'px'; hole.style.width = w + 'px'; hole.style.height = h + 'px';
    return r ? { x: x, y: y, w: w, h: h } : null;
  }

  /* A gentle arrow from the card to what is to be pressed, so «Click here»
     is not read as being about the card itself (2026-11-14). */
  var arrow = el('div', 'arrow', '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 28V4M3 12l9-9 9 9"/></svg>');
  stage.appendChild(arrow);

  function placeCard(h, pointing) {
    var cw = card.offsetWidth, ch = card.offsetHeight, W = SIZE.width, H = SIZE.height, x, y, side = null;
    var m = 14, g = pointing ? 50 : 14;
    if (!h) { x = (W - cw) / 2; y = (H - ch) / 2; }
    else if (H - (h.y + h.h) >= ch + g + m) { side = 'below'; y = h.y + h.h + g; x = h.x + h.w / 2 - cw / 2; }
    else if (h.y >= ch + g + m) { side = 'above'; y = h.y - ch - g; x = h.x + h.w / 2 - cw / 2; }
    else if (h.x >= cw + g + m) { side = 'left'; x = h.x - cw - g; y = h.y + h.h / 2 - ch / 2; }
    else if (W - (h.x + h.w) >= cw + g + m) { side = 'right'; x = h.x + h.w + g; y = h.y + h.h / 2 - ch / 2; }
    else { x = (W - cw) / 2; y = H - ch - m; }
    x = Math.max(m, Math.min(W - cw - m, x)); y = Math.max(m, Math.min(H - ch - m, y));
    card.style.left = x + 'px'; card.style.top = y + 'px';

    arrow.className = 'arrow';
    if (!pointing || !h || !side) return;
    var cx = h.x + h.w / 2, cy = h.y + h.h / 2, ax, ay, rot;
    if (side === 'below') { ax = Math.max(x + 18, Math.min(x + cw - 18, cx)); ay = y - g / 2; rot = 0; }
    if (side === 'above') { ax = Math.max(x + 18, Math.min(x + cw - 18, cx)); ay = y + ch + g / 2; rot = 180; }
    if (side === 'left') { ax = x + cw + g / 2; ay = Math.max(y + 18, Math.min(y + ch - 18, cy)); rot = 90; }
    if (side === 'right') { ax = x - g / 2; ay = Math.max(y + 18, Math.min(y + ch - 18, cy)); rot = -90; }
    arrow.style.left = ax + 'px'; arrow.style.top = ay + 'px';
    arrow.style.setProperty('--rot', rot + 'deg');
    arrow.className = 'arrow on';
  }

  /* One step. target: a rect (stage pixels) or a function returning one.
     click: the reader presses the target. Otherwise a Next button. read: the
     chat can be scrolled while the card shows. Resolves when done. */
  /* Time to look: the whole stage clear, nothing to press, no card. Used
     after every change of picture, so the reader sees what happened before
     the spotlight moves on (Vidar, 2026-11-14). */
  function look(ms) {
    hot.style.display = 'none'; catcher.style.display = 'block';
    card.className = 'card card--hidden';
    arrow.className = 'arrow';
    dim.classList.add('off');
    return sleep(ms);
  }

  function step(o) {
    return new Promise(function (resolve) {
      var r = typeof o.target === 'function' ? o.target() : o.target || null;
      var h = spot(r, o.shape);
      /* The intro shows the tree with no darkness at all. */
      dim.classList.toggle('off', !!o.clear);

      card.innerHTML = '';
      card.className = 'card';
      if (o.click) card.appendChild(el('span', 'card__pulse', esc(T.clickHere)));
      if (o.html) card.appendChild(el('p', 'card__text', o.html));
      catcher.style.display = o.read ? 'none' : 'block';
      if (o.click && r) {
        hot.style.display = 'block';
        hot.style.left = (r.x - 6) + 'px'; hot.style.top = (r.y - 6) + 'px';
        hot.style.width = (r.w + 12) + 'px'; hot.style.height = (r.h + 12) + 'px';
        hot.onclick = function () { hot.onclick = null; hot.style.display = 'none'; resolve(); };
      } else {
        hot.style.display = 'none';
        var nb = el('button', 'card__next', esc(T.next)); nb.type = 'button';
        nb.onclick = function () { nb.onclick = null; resolve(); };
        card.appendChild(nb);
      }
      placeCard(h, !!(o.click && r));
    });
  }

  /* While the AI answers: the whole chat lit, nothing to press. */
  async function watch(text) {
    hot.style.display = 'none'; catcher.style.display = 'block';
    card.className = 'card card--hidden';
    arrow.className = 'arrow';
    dim.classList.remove('off');
    spot(chatRect(chat), 'rect');
    await reply(text);
  }

  /* ------------------------------------------------------------------ */
  /* The demo                                                            */
  /* ------------------------------------------------------------------ */

  async function run() {
    /* The tree on its own first, then one line about it. */
    await look(2500);
    await step({ html: esc(T.intro), clear: true });
    await step({ html: esc(T.types), target: rectOf('tree', 'types') });
    await look(900);
    await step({ click: true, target: rectOf('tree', 'target') });
    show('panel');
    await look(2200);

    await step({ click: true, target: rectOf('panel', 'copy') });
    markCopied('panel', '#detail-panel button.btn:not(.secondary)');
    await look(1200);

    /* Any AI service will do; the demo uses a pretend one. */
    await chooseService(2200);

    /* The practice tutor. */
    await chatOpen();
    await look(1300);
    await step({ click: true, shape: 'round', target: function () { return chatRect(pasteEl); } });
    doPaste(PROMPTS.node);
    await look(1300);
    await step({ click: true, shape: 'round', target: function () { return chatRect(sendEl); } });
    doSend();
    await watch(REPLIES.tutor1);
    await look(2500);
    setField(REPLIES.pupil);
    await look(1000);
    await step({ click: true, shape: 'round', target: function () { return chatRect(sendEl); } });
    doSend();
    await watch(REPLIES.tutor2);
    await look(1500);
    /* The chat can be scrolled while the reader decides to close it. */
    await step({ click: true, read: true, shape: 'round', target: function () { return chatRect(closeEl); } });
    await chatClose();
    await look(1200);

    /* Tick it off. */
    await step({ click: true, target: rectOf('panel', 'master') });
    /* The tick turns green and the panel says «Mastered»: let it be seen
       before anything moves (on a phone the panel then closes). */
    show('ticked');
    await look(1500);

    /* Close the goal: back to the whole tree, where A3 is now ticked. */
    await step({ click: true, target: rectOf('ticked', 'close') });
    show('mastered');
    await look(2000);

    /* The test. */
    await step({ click: true, shape: 'round', target: rectOf('mastered', 'menu') });
    show('menu');
    await look(1800);
    await step({ click: true, target: rectOf('menu', 'test') });
    show('exam');
    await look(2200);
    await step({ html: esc(T.covers), target: rectOf('exam', 'covers') });
    /* On a phone «Copy» is further down the window: scroll to it first. */
    show('examcopy');
    await look(900);
    await step({ click: true, target: rectOf('examcopy', 'copy') });
    markCopied('examcopy', '#exam-overlay .resource-copy');
    await look(1000);
    await chooseService(1200);
    await chatOpen();
    await look(900);
    await step({ click: true, shape: 'round', target: function () { return chatRect(pasteEl); } });
    doPaste(PROMPTS.exam);
    await look(1000);
    await step({ click: true, shape: 'round', target: function () { return chatRect(sendEl); } });
    doSend();
    await watch(REPLIES.test);
    await look(2000);
    await step({ click: true, read: true, shape: 'round', target: function () { return chatRect(closeEl); } });
    await chatClose();
    await look(1000);

    /* Back in the tree: close the Test window too. */
    show('exam');
    await look(700);
    await step({ click: true, target: rectOf('exam', 'close') });
    show('mastered');
    await look(1500);

    /* The end: two ways on. */
    spot(null);
    dim.classList.remove('off');
    hot.style.display = 'none'; catcher.style.display = 'block';
    card.className = 'card card--end';
    var q = '?lang=' + lang;
    card.innerHTML = '<h1 class="card__title">' + esc(T.end) + '</h1><div class="card__ctas">' +
      '<a class="card__cta card__cta--primary" href="/trees/' + q + '" data-track-cta="tour-end-trees">' + esc(T.trees) + '</a>' +
      '<a class="card__cta" href="/make-your-own/' + q + '" data-track-cta="tour-end-make">' + esc(T.make) + '</a></div>';
    placeCard(null);
  }

  /* Start when the first picture has loaded. */
  var started = false;
  function go() { if (started) return; started = true; run().catch(function (e) { console.error('demo', e); }); }
  pics.tree.addEventListener('load', function () { setTimeout(go, 150); });
  setTimeout(go, 2500);
})();

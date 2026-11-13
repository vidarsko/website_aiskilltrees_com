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

  var T = {
    en: {
      next: 'Next', clickHere: 'Click here',
      intro: '<b>This is an AI skill tree.</b> Each box is a learning goal in a subject, and the lines show what builds on what. This one is a small demo tree for natural science, Year 9.',
      types: 'There are three kinds of learning goals. <b>Facts</b> (blue) are things to remember, <b>concepts</b> (green) are things to understand, and <b>skills</b> (orange) are things to be able to do. We will go through one of them.',
      node: 'Open a learning goal.',
      copy: 'Every learning goal has an instruction for an AI. Copy it.',
      chatIntro: 'Here is an AI service. It can be any one you like: the tree never calls an AI itself.',
      paste: 'Paste the instruction here. Press <kbd>Ctrl</kbd> + <kbd>V</kbd> (<kbd>⌘</kbd> + <kbd>V</kbd> on a Mac).',
      pasteHelp: 'Can’t paste? Insert it for me',
      send: 'Send it. You can also press <kbd>Enter</kbd>.',
      reply: 'We have written the pupil’s answer for you. Send it.',
      tutorDone: 'That is the practice tutor: the AI gives a task, the pupil answers, and the AI follows up. The instruction tells it to give hints, not answers.',
      master: 'When the pupil can do it, they tick it off as mastered. The tick is saved in the browser only. There is no login.',
      menu: 'Open the menu.',
      test: 'Make a test.',
      covers: 'The test covers what is marked as mastered, and only that is shown here. Press the icon to see all the learning goals and add more.',
      examCopy: 'Copy the instruction for the test.',
      paste2: 'Paste it into a new chat.',
      send2: 'And send it.',
      testDone: 'The AI writes the test, and gives the answers when the pupil asks. Teachers can make lesson plans from the menu in the same way.',
      endTitle: 'That is how it works.',
      endText: 'Find a tree for your subject, or make your own.',
      endTrees: 'See all the trees', endMake: 'Make your own',
      chatName: 'AI service', chatSub: '· new chat', chatEmpty: 'How can I help?', chatEmptySub: 'Ask anything, or paste an instruction.',
      chatPh: 'Message AI service…', pasted: 'Pasted text', words: 'words',
      chatNote: 'The replies here are written in advance. A real AI service answers differently each time.'
    },
    nb: {
      next: 'Neste', clickHere: 'Klikk her',
      intro: '<b>Dette er et KI-ferdighetstre.</b> Hver boks er et læringsmål i et fag, og strekene viser hva som bygger på hva. Dette er et lite demotre i naturfag for 9. trinn.',
      types: 'Det finnes tre slags læringsmål. <b>Fakta</b> (blå) er noe man skal huske, <b>begreper</b> (grønne) er noe man skal forstå, og <b>ferdigheter</b> (oransje) er noe man skal kunne gjøre. Vi går gjennom ett av dem.',
      node: 'Åpne et læringsmål.',
      copy: 'Hvert læringsmål har en instruks til en KI. Kopier den.',
      chatIntro: 'Her er en KI-tjeneste. Det kan være hvilken som helst: treet kaller aldri en KI selv.',
      paste: 'Lim inn instruksen her. Trykk <kbd>Ctrl</kbd> + <kbd>V</kbd> (<kbd>⌘</kbd> + <kbd>V</kbd> på Mac).',
      pasteHelp: 'Får du ikke limt inn? Sett den inn for meg',
      send: 'Send den. Du kan også trykke <kbd>Enter</kbd>.',
      reply: 'Vi har skrevet elevens svar for deg. Send det.',
      tutorDone: 'Det er øvingshjelperen: KI-en gir en oppgave, eleven svarer, og KI-en følger opp. Instruksen ber den gi hint, ikke svar.',
      master: 'Når eleven kan det, krysser hen det av som mestret. Haken lagres bare i nettleseren. Det finnes ingen innlogging.',
      menu: 'Åpne menyen.',
      test: 'Lag en prøve.',
      covers: 'Prøven dekker det som er krysset av som mestret, og bare det vises her. Trykk på ikonet for å se alle læringsmålene og legge til flere.',
      examCopy: 'Kopier instruksen for prøven.',
      paste2: 'Lim den inn i en ny chat.',
      send2: 'Og send den.',
      testDone: 'KI-en lager prøven, og gir fasit når eleven ber om det. Lærere kan lage undervisningsopplegg fra menyen på samme måte.',
      endTitle: 'Slik virker det.',
      endText: 'Finn et tre for faget ditt, eller lag ditt eget.',
      endTrees: 'Se alle trærne', endMake: 'Lag ditt eget',
      chatName: 'KI-tjeneste', chatSub: '· ny chat', chatEmpty: 'Hva kan jeg hjelpe med?', chatEmptySub: 'Spør om hva som helst, eller lim inn en instruks.',
      chatPh: 'Skriv til KI-tjenesten…', pasted: 'Innlimt tekst', words: 'ord',
      chatNote: 'Svarene her er skrevet på forhånd. En ekte KI-tjeneste svarer annerledes hver gang.'
    },
    sv: {
      next: 'Nästa', clickHere: 'Klicka här',
      intro: '<b>Det här är ett AI-färdighetsträd.</b> Varje ruta är ett lärandemål i ett ämne, och linjerna visar vad som bygger på vad. Det här är ett litet demoträd i NO för årskurs 9.',
      types: 'Det finns tre sorters lärandemål. <b>Fakta</b> (blå) är sådant man ska komma ihåg, <b>begrepp</b> (gröna) är sådant man ska förstå, och <b>färdigheter</b> (orange) är sådant man ska kunna göra. Vi går igenom ett av dem.',
      node: 'Öppna ett lärandemål.',
      copy: 'Varje lärandemål har en instruktion till en AI. Kopiera den.',
      chatIntro: 'Här är en AI-tjänst. Det kan vara vilken som helst: trädet anropar aldrig en AI själv.',
      paste: 'Klistra in instruktionen här. Tryck <kbd>Ctrl</kbd> + <kbd>V</kbd> (<kbd>⌘</kbd> + <kbd>V</kbd> på Mac).',
      pasteHelp: 'Går det inte att klistra in? Sätt in den åt mig',
      send: 'Skicka den. Du kan också trycka <kbd>Enter</kbd>.',
      reply: 'Vi har skrivit elevens svar åt dig. Skicka det.',
      tutorDone: 'Det är övningshjälpen: AI:n ger en uppgift, eleven svarar och AI:n följer upp. Instruktionen säger åt den att ge ledtrådar, inte svar.',
      master: 'När eleven kan det, bockar hen av det som avklarat. Bocken sparas bara i webbläsaren. Det finns ingen inloggning.',
      menu: 'Öppna menyn.',
      test: 'Gör ett prov.',
      covers: 'Provet täcker det som är markerat som avklarat, och bara det visas här. Tryck på ikonen för att se alla lärandemål och lägga till fler.',
      examCopy: 'Kopiera instruktionen för provet.',
      paste2: 'Klistra in den i en ny chatt.',
      send2: 'Och skicka den.',
      testDone: 'AI:n skriver provet och ger facit när eleven ber om det. Lärare kan göra lektionsplaneringar från menyn på samma sätt.',
      endTitle: 'Så fungerar det.',
      endText: 'Hitta ett träd för ditt ämne, eller gör ditt eget.',
      endTrees: 'Se alla träd', endMake: 'Gör ditt eget',
      chatName: 'AI-tjänst', chatSub: '· ny chatt', chatEmpty: 'Hur kan jag hjälpa till?', chatEmptySub: 'Fråga vad som helst, eller klistra in en instruktion.',
      chatPh: 'Skriv till AI-tjänsten…', pasted: 'Inklistrad text', words: 'ord',
      chatNote: 'Svaren här är skrivna i förväg. En riktig AI-tjänst svarar olika varje gång.'
    }
  }[lang];

  /* The pretend conversation. Written in advance; never generated. */
  var REPLIES = {
    en: {
      tutor1: 'Let’s practise reading chemical formulas. Here is the first one:\n\n**CO₂**\n\nWhich elements does it contain, and how many atoms of each?',
      pupil: 'One carbon atom and two oxygen atoms.',
      tutor2: 'Exactly right. The small 2 belongs to the O just before it, and C has no number, which means one.\n\nThe next one is a bit harder: **C₆H₁₂O₆**, which is glucose. How many atoms are there in total?',
      test: '## Test: Atoms and substances\n\n**1.** What is the difference between an atom and a molecule?\n\n**2.** Which element has the symbol Na?\na) nitrogen  b) sodium  c) neon\n\n**3.** Write the symbols for carbon, oxygen and chlorine.\n\n**4.** How many atoms of each element are there in NH₃?\n\n**5.** True or false: O₂ is a molecule.\n\n**6.** How many atoms are there in total in H₂SO₄?\n\n**7.** A formula has one carbon atom and four hydrogen atoms. Write it.\n\n**8.** Explain what the small number in H₂O tells you.\n\n**9.** Which of these is an element, and which is a compound: O₂, CO₂, N₂?\n\n**10.** NaCl is table salt. Which two elements does it contain, and in what ratio?\n\nTell me when you are done, and I will go through the answers with you.'
    },
    nb: {
      tutor1: 'La oss øve på å lese kjemiske formler. Her er den første:\n\n**CO₂**\n\nHvilke grunnstoffer inneholder den, og hvor mange atomer er det av hvert?',
      pupil: 'Ett karbonatom og to oksygenatomer.',
      tutor2: 'Helt riktig. Det lille 2-tallet hører til O-en rett foran, og C har ikke noe tall, som betyr én.\n\nDen neste er litt vanskeligere: **C₆H₁₂O₆**, som er glukose. Hvor mange atomer er det til sammen?',
      test: '## Prøve: Atomer og stoffer\n\n**1.** Hva er forskjellen på et atom og et molekyl?\n\n**2.** Hvilket grunnstoff har symbolet Na?\na) nitrogen  b) natrium  c) neon\n\n**3.** Skriv symbolene for karbon, oksygen og klor.\n\n**4.** Hvor mange atomer av hvert grunnstoff er det i NH₃?\n\n**5.** Sant eller usant: O₂ er et molekyl.\n\n**6.** Hvor mange atomer er det til sammen i H₂SO₄?\n\n**7.** En formel har ett karbonatom og fire hydrogenatomer. Skriv den.\n\n**8.** Forklar hva det lille tallet i H₂O forteller deg.\n\n**9.** Hvilke av disse er grunnstoffer, og hvilke er forbindelser: O₂, CO₂, N₂?\n\n**10.** NaCl er bordsalt. Hvilke to grunnstoffer inneholder det, og i hvilket forhold?\n\nSi fra når du er ferdig, så går vi gjennom svarene sammen.'
    },
    sv: {
      tutor1: 'Vi övar på att läsa kemiska formler. Här är den första:\n\n**CO₂**\n\nVilka grundämnen innehåller den, och hur många atomer finns det av varje?',
      pupil: 'En kolatom och två syreatomer.',
      tutor2: 'Helt rätt. Den lilla 2:an hör till O:et precis framför, och C har ingen siffra, vilket betyder en.\n\nNästa är lite svårare: **C₆H₁₂O₆**, som är glukos. Hur många atomer finns det sammanlagt?',
      test: '## Prov: Atomer och ämnen\n\n**1.** Vad är skillnaden mellan en atom och en molekyl?\n\n**2.** Vilket grundämne har symbolen Na?\na) kväve  b) natrium  c) neon\n\n**3.** Skriv symbolerna för kol, syre och klor.\n\n**4.** Hur många atomer av varje grundämne finns det i NH₃?\n\n**5.** Sant eller falskt: O₂ är en molekyl.\n\n**6.** Hur många atomer finns det sammanlagt i H₂SO₄?\n\n**7.** En formel har en kolatom och fyra väteatomer. Skriv den.\n\n**8.** Förklara vad den lilla siffran i H₂O säger dig.\n\n**9.** Vilka av dessa är grundämnen, och vilka är föreningar: O₂, CO₂, N₂?\n\n**10.** NaCl är koksalt. Vilka två grundämnen innehåller det, och i vilket förhållande?\n\nSäg till när du är klar, så går vi igenom svaren tillsammans.'
    }
  }[lang];

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
    return s.split('\n').map(function (line) {
      var m = line.match(/^(#{1,3}) (.*)/);
      var span = esc(m ? m[2] : line).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      if (m) return '<b class="tour-chat__h">' + span + '</b>';
      return span + '<br>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* The spotlight: a dark screen with a window onto one control         */
  /* ------------------------------------------------------------------ */

  var root, hole, card, blockers = [], current = null, follow = null;

  function buildOverlay() {
    root = el('div', 'tour');
    hole = el('div', 'tour-hole');
    root.appendChild(hole);
    for (var i = 0; i < 4; i++) { var b = el('div', 'tour-block'); blockers.push(b); root.appendChild(b); }
    card = el('div', 'tour-card');
    root.appendChild(card);
    document.body.appendChild(root);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
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

  var shape = null;
  function place() {
    if (!root) return;
    var r = targetRect();
    var W = window.innerWidth, H = window.innerHeight;
    var hx, hy, hw, hh;
    if (r) {
      /* An ellipse around the target, a little larger than it. */
      var w = r.right - r.left, h = r.bottom - r.top;
      hw = w * 1.18 + 36; hh = h * 1.3 + 30;
      if (shape === 'round') { var d = Math.max(hw, hh); hw = d; hh = d; }
      hx = r.left + w / 2 - hw / 2; hy = r.top + h / 2 - hh / 2;
      hole.style.opacity = '1';
    } else {
      hw = 0; hh = 0; hx = W / 2; hy = H / 2;
      hole.style.opacity = '1';
    }
    hole.style.left = hx + 'px'; hole.style.top = hy + 'px';
    hole.style.width = hw + 'px'; hole.style.height = hh + 'px';

    /* Four transparent blockers around the target, so only it takes a click. */
    var cut = r ? { l: r.left - 4, t: r.top - 4, r: r.right + 4, b: r.bottom + 4 } : null;
    var interactive = cut && root.dataset.click === 'yes';
    var rects = interactive
      ? [[0, 0, W, cut.t], [0, cut.b, W, H - cut.b], [0, cut.t, cut.l, cut.b - cut.t], [cut.r, cut.t, W - cut.r, cut.b - cut.t]]
      : [[0, 0, W, H], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    blockers.forEach(function (b, i) {
      var q = rects[i];
      b.style.left = q[0] + 'px'; b.style.top = q[1] + 'px';
      b.style.width = Math.max(0, q[2]) + 'px'; b.style.height = Math.max(0, q[3]) + 'px';
    });
    placeCard(r ? { left: hx, top: hy, right: hx + hw, bottom: hy + hh } : null);
  }

  function placeCard(r) {
    var W = window.innerWidth, H = window.innerHeight;
    var cw = card.offsetWidth, ch = card.offsetHeight, m = 16, x, y;
    if (!r) { x = (W - cw) / 2; y = (H - ch) / 2; }
    else {
      var below = H - r.bottom, above = r.top, right = W - r.right, left = r.left;
      if (below >= ch + m * 2) { y = r.bottom + m; x = (r.left + r.right) / 2 - cw / 2; }
      else if (above >= ch + m * 2) { y = r.top - ch - m; x = (r.left + r.right) / 2 - cw / 2; }
      else if (left >= cw + m * 2) { x = r.left - cw - m; y = (r.top + r.bottom) / 2 - ch / 2; }
      else if (right >= cw + m * 2) { x = r.right + m; y = (r.top + r.bottom) / 2 - ch / 2; }
      else { x = (W - cw) / 2; y = H - ch - m; }
    }
    card.style.left = Math.max(m, Math.min(W - cw - m, x)) + 'px';
    card.style.top = Math.max(m, Math.min(H - ch - m, y)) + 'px';
  }

  /* One step: point at `find`, say `html`. With `click`, the reader must
     press the target itself; otherwise a Next button moves on. Resolves when
     the step is done. */
  function step(opts) {
    return new Promise(function (resolve) {
      current = opts.find || null;
      shape = opts.round ? 'round' : null;
      root.dataset.click = (opts.click || opts.wait) ? 'yes' : 'no';
      root.classList.toggle('light', !!opts.light);
      card.innerHTML = '';
      if (opts.click) card.appendChild(el('span', 'tour-card__pulse', T.clickHere));
      card.appendChild(el('p', 'tour-card__text', opts.html));
      if (opts.extra) card.appendChild(opts.extra);
      if (!opts.click && !opts.wait) {
        var nb = el('button', 'tour-card__next', T.next);
        nb.type = 'button';
        nb.addEventListener('click', function () { done(); });
        card.appendChild(nb);
        setTimeout(function () { nb.focus({ preventScroll: true }); }, 50);
      }
      /* The window starts wide and narrows onto the target. */
      root.classList.add('wide');
      place();
      requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('wide'); place(); }); });
      clearInterval(follow);
      follow = setInterval(place, 250);

      var target = null;
      function onClick() { setTimeout(done, opts.after || 350); }
      if (opts.click) {
        target = current && current();
        if (Array.isArray(target)) target = target[0];
        if (target) target.addEventListener('click', onClick, { once: true, capture: true });
      }
      if (opts.wait) opts.wait.then(function () { done(); });
      var finished = false;
      function done() {
        if (finished) return; finished = true;
        if (target) target.removeEventListener('click', onClick, { capture: true });
        resolve();
      }
    });
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
  function chatClose() { chat.classList.remove('on'); return sleep(300); }

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
    await step({ html: T.copy, click: true, find: copyBtn, after: 500 });

    /* First chat: the practice tutor. */
    await chatOpen();
    var help = el('button', 'tour-card__link', esc(T.pasteHelp)); help.type = 'button';
    await step({ html: T.paste, find: chatInput, wait: waitForPaste(help), extra: help });
    await step({ html: T.send, find: sendBtn, round: true, wait: waitForSend() });
    root.classList.add('quiet');
    await reply(REPLIES.tutor1);
    root.classList.remove('quiet');
    $('.tour-chat__ta', chat).value = REPLIES.pupil; syncSend();
    await step({ html: T.reply, find: chatInput, wait: waitForSend() });
    root.classList.add('quiet');
    await reply(REPLIES.tutor2);
    root.classList.remove('quiet');
    await step({ html: T.tutorDone, find: function () { return chat; } });
    await chatClose();

    /* Tick it off. */
    await step({ html: T.master, click: true, find: function () {
      var a = $('#detail-panel .mastery-check'), b = $('#detail-panel .mastered-toggle-text');
      return [a, b].filter(Boolean);
    } });

    /* The test. On a phone the panel covers the whole screen, menu button
       included, so close it first. */
    var mb = $('#menu-toggle-btn');
    if (mb) {
      var r = mb.getBoundingClientRect();
      var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      root.style.visibility = 'hidden';
      hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      root.style.visibility = '';
      if (hit && !mb.contains(hit) && $('#detail-close')) { $('#detail-close').click(); await sleep(400); }
    }
    await step({ html: T.menu, click: true, round: true, find: function () { return $('#menu-toggle-btn'); }, after: 450 });
    await step({ html: T.test, click: true, find: function () { return $('#exam-btn'); }, after: 500 });
    await waitFor('#exam-overlay.open .exam-cover');
    await step({ html: T.covers, find: function () { return $('#exam-overlay.open .exam-cover'); } });
    await step({ html: T.examCopy, click: true, find: function () { return $('#exam-overlay.open .resource-copy'); }, after: 500 });
    var ov = $('#exam-overlay'); if (ov) ov.classList.remove('open');
    await chatOpen();
    var help2 = el('button', 'tour-card__link', esc(T.pasteHelp)); help2.type = 'button';
    await step({ html: T.paste2, find: chatInput, wait: waitForPaste(help2), extra: help2 });
    await step({ html: T.send2, find: sendBtn, round: true, wait: waitForSend() });
    root.classList.add('quiet');
    await reply(REPLIES.test);
    root.classList.remove('quiet');
    await step({ html: T.testDone, find: function () { return chat; } });
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
    card.appendChild(el('p', 'tour-card__text', esc(T.endText)));
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

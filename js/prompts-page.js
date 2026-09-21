/* ==========================================================================
   prompts-page.js — /prompts/

   Viser instruksene slik de faktisk er skrevet, hentet fra maskineriet ved
   kjøring. Sida har med vilje ingen kopi av teksten: kilden er
   `assets/prompts/`-filene, og en side som gjengir dem ville vært utdatert
   ved neste release uten at noen merket det.

   Formen er en halvtabell: stikkordet (seksjons-id-en, som er det
   ledeteksten selv kaller delen) til venstre, teksten under eller ved
   siden av. Det er den samme inndelingen som ligger i JSON-en, framfor en
   inndeling vi har funnet på for visningens skyld.

   SPRÅKLAGET VELGES I EN NEDTREKKSMENY, fordi det ellers blir for mye:
   hvert språk legger til sin egen `outputLanguage` og `writingStyle`, og
   alle tre på én gang drukner instruksene de hører til. Valget styrer to
   ting samtidig — seksjonene som fylles inne i hver instruks, og kortet
   som viser språklaget samlet.
   ========================================================================== */

(function () {
  'use strict';

  /* Samme tre språk som `LANGS` i js/header.js, men et annet spørsmål: der
     velger man hvilket språk SIDA leses på, her hvilket SPRÅKLAG som vises
     sammen med instruksene. Endonymer, så lista leses likt uansett hvilket
     språk sida står på. */
  var LANGS = [
    { code: 'en', name: 'English' },
    { code: 'nb', name: 'Norsk' },
    { code: 'sv', name: 'Svenska' }
  ];

  /* Velgeren bygges én gang og FLYTTES inn i språklag-kortet for hver
     tegning, framfor å bygges på nytt: den har lyttere på `document` for
     Escape og klikk utenfor, og de ville hopet seg opp for hvert bytte. */
  var root, pickerRow, pickerLabel, setPicked,
      state = { manifest: null, modules: {}, family: {}, lang: null, code: 'en' };

  function t(key) {
    return (window.i18n && window.i18n.t) ? window.i18n.t(key) : key;
  }

  function getJson(path) {
    return fetch(path).then(function (res) {
      if (!res.ok) throw new Error(path + ' (' + res.status + ')');
      return res.json();
    });
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---- ett kort --------------------------------------------------------
     Instruksene, språklaget og de delte seksjonene har samme form:
     overskrift, metalinje, en setning om hvor teksten brukes, og selve
     teksten sammenrullet. Derfor én byggefunksjon, ikke tre. */

  function card(opts) {
    var box = el('section', 'promptdoc');

    var head = el('header', 'promptdoc__head');
    head.appendChild(el('h3', 'promptdoc__title', opts.title));
    if (opts.meta) head.appendChild(el('p', 'promptdoc__meta', opts.meta));
    box.appendChild(head);

    /* Setningen om hvor teksten brukes er SIDETEKST og bor i ordboka, ikke i
       modulen: den skal finnes på alle tre språk, mens instruksene selv er
       engelske med vilje. Mangler nøkkelen, står det ingenting framfor en
       plassholder — det er bedre at den mangler synlig enn at sida later som
       den vet noe. */
    if (opts.about) box.appendChild(el('p', 'promptdoc__about', opts.about));

    /* Språklagets kort har språkvelgeren i seg, rett under beskrivelsen av
       hva laget er: det er der valget gir mening, framfor øverst på sida med
       en etikett som må forklare hva et språklag er før leseren har sett et. */
    if (opts.control) box.appendChild(opts.control);

    /* Et kort uten seksjoner viser ingen rull. Det gjelder bare språklaget,
       og bare hvis fila mangler begge feltene — men kortet må likevel stå,
       for velgeren står i det. */
    if (!opts.rows.length) return box;

    /* Hele teksten ligger sammenrullet. Sida ble uleselig lang med alt åpent
       — sju kort med tjuetalls seksjoner hver — og den som vil LESE en
       instruks, vil som regel lese én. <details> framfor egen JavaScript:
       det virker uten script, kan søkes i av nettleseren, og har
       tastaturoppførselen gratis. */
    var reveal = el('details', 'promptdoc__reveal');
    var toggle = el('summary', 'promptdoc__toggle');
    toggle.appendChild(el('span', 'promptdoc__toggle-show', t('show-prompt')));
    toggle.appendChild(el('span', 'promptdoc__toggle-hide', t('hide-prompt')));
    /* Språklaget kan ha én eneste seksjon — en.json legger bare til
       samtalespråket — og «1 sections» ville stått der hver gang. */
    toggle.appendChild(el('span', 'promptdoc__count', opts.rows.length === 1
      ? t('section-count-one')
      : t('section-count').replace('{n}', opts.rows.length)));
    reveal.appendChild(toggle);
    box.appendChild(reveal);

    if (opts.intro) reveal.appendChild(el('p', 'promptdoc__intro', opts.intro));

    var list = el('dl', 'promptdoc__sections');
    opts.rows.forEach(function (row) {
      var dt = el('dt', 'promptdoc__key');
      dt.appendChild(el('code', null, row.label));
      if (row.note) dt.appendChild(el('span', 'promptdoc__note', row.note));
      list.appendChild(dt);
      list.appendChild(el('dd', 'promptdoc__text', row.text));
    });
    reveal.appendChild(list);

    return box;
  }

  /* ---- seksjonene i én instruksmodul ------------------------------------ */

  function moduleRows(module, extras) {
    var rows = [];

    (module.order || Object.keys(module.sections || {})).forEach(function (sid) {
      var text = (module.sections || {})[sid];
      var label = (module.titles && module.titles[sid]) || sid;
      if (text == null) {
        /* En seksjon som står som null i modulen fylles av et annet lag —
           `outputLanguage` og `writingStyle` kommer fra språkfila. Det er
           verdt å vise AT den finnes, framfor å utelate den i stillhet. Tom
           teller ikke: en.json har `writingStyle: ""` med vilje, fordi den
           fila betjener alle språk som ikke har en fil selv. */
        var filler = (extras.lang || {})[sid];
        if (!filler) return;
        rows.push({ label: label, text: filler, note: t('from-language') });
        return;
      }
      rows.push({ label: label, text: text, note: '' });
    });

    (extras.family || []).forEach(function (add) {
      rows.push({ label: add.id, text: add.text, note: t('from-family') });
    });
    (extras.overrides || []).forEach(function (o) {
      rows.push({ label: o.id, text: o.text, note: t('from-language-override') });
    });

    return rows;
  }

  /* ---- språklaget som sitt eget kort ------------------------------------
     Seksjonene over står markert der de lander, inne i hver instruks. Her
     står laget samlet, fordi det er det som er hele forskjellen mellom en
     norsk og en svensk samtale, og det er verdt å kunne lese under ett. */

  function languageCard() {
    var lang = state.lang || {};
    var layer = lang.prompt || {};
    var rows = [];

    ['outputLanguage', 'writingStyle'].forEach(function (sid) {
      if (!layer[sid]) return;
      rows.push({ label: sid, text: layer[sid], note: '' });
    });

    /* En overstyring er språklagets rett til å bytte ut en hel seksjon i én
       bestemt instruks. Ingen av de tre språkene bruker den i dag; den vises
       likevel, for ellers ville den vært usynlig den dagen noen tar den i
       bruk. */
    var overrides = layer.overrides || {};
    Object.keys(overrides).forEach(function (id) {
      var entry = (state.manifest.instructions || {})[id] || {};
      var module = state.modules[entry.file] || {};
      Object.keys(overrides[id]).forEach(function (sid) {
        rows.push({
          label: sid,
          text: overrides[id][sid],
          note: t('language-override-in').replace('{x}', module.title || id)
        });
      });
    });

    return card({
      title: t('language-title'),
      meta: (lang.name || state.code) + ' · languages/' + state.code + '.json',
      about: about('language'),
      control: pickerRow,
      rows: rows
    });
  }

  function about(id) {
    var text = t('about-' + id);
    return text === 'about-' + id ? '' : text;
  }

  /* ---- hele sida -------------------------------------------------------- */

  function render() {
    if (!root || !state.manifest) return;
    /* Velgeren står inne i kortet som tegnes om, så den rives ut og settes
       inn igjen ved hvert bytte. Hadde den tastaturfokus, skal den ha det
       etterpå også — ellers ender den som velger med å miste stedet sitt. */
    var keepFocus = pickerRow.contains(document.activeElement);
    root.innerHTML = '';
    var m = state.manifest;
    var layer = (state.lang || {}).prompt || {};

    Object.keys(m.instructions).forEach(function (id) {
      var entry = m.instructions[id];
      var module = state.modules[entry.file];
      if (!module) return;
      var overrides = (layer.overrides || {})[id] || {};
      var familyAdds = ((state.family.instructions || {})[id] || {}).add || [];
      root.appendChild(card({
        title: module.title || id,
        meta: ['v' + (module.version || '?'),
               t('audience-' + (entry.audience || 'student'))].join(' · '),
        about: about(id),
        intro: module.intro,
        rows: moduleRows(module, {
          lang: layer,
          family: familyAdds,
          overrides: Object.keys(overrides).map(function (k) {
            return { id: k, text: overrides[k] };
          })
        })
      }));
    });

    root.appendChild(languageCard());

    var shared = state.modules[m.shared];
    if (shared) {
      root.appendChild(card({
        title: t('shared-title'),
        meta: 'v' + (shared.version || '?'),
        about: about('shared'),
        rows: moduleRows(shared, { lang: layer })
      }));
    }

    if (keepFocus) {
      var btn = pickerRow.querySelector('.lang-select__button');
      if (btn) btn.focus();
    }
  }

  function loadLanguage(code) {
    state.code = code;
    if (setPicked) setPicked(code);
    return Promise.all([
      getJson('/assets/languages/' + code + '.json'),
      getJson('/assets/prompts/' + (state.manifest.subjectFamilies || {}).mathematics)
    ]).then(function (parts) {
      state.lang = parts[0];
      state.family = parts[1] || {};
      render();
      if (window.aistTrack) window.aistTrack('prompts_language', { prompt_language: code });
    });
  }

  /* ---- språkvelgeren ----------------------------------------------------
     Samme komponent som velgeren i toppbaren — samme klasser, samme
     tastaturoppførsel — men bygget her, fordi header.js eier nettstedets
     ramme og denne hører til sidas innhold. Det delte er CSS-en
     (`.lang-select` i css/components.css); to kontroller som skal se like ut
     skal ikke gjøre det ved et sammentreff. */

  function buildPicker(host, onPick) {
    var wrap = el('div', 'lang-select');

    var btn = el('button', 'lang-select__button');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    var globe = el('span', 'lang-select__globe', '🌐');
    globe.setAttribute('aria-hidden', 'true');
    var name = el('span', 'lang-select__code');
    var caret = el('span', 'lang-select__caret', '▾');
    caret.setAttribute('aria-hidden', 'true');
    btn.appendChild(globe);
    btn.appendChild(name);
    btn.appendChild(caret);
    wrap.appendChild(btn);

    var menu = el('ul', 'lang-select__menu');
    menu.setAttribute('role', 'listbox');
    var options = LANGS.map(function (item) {
      var li = el('li');
      var opt = el('button', 'lang-select__option');
      opt.type = 'button';
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-lang', item.code);
      var tick = el('span', 'lang-select__tick');
      tick.setAttribute('aria-hidden', 'true');
      opt.appendChild(tick);
      opt.appendChild(el('span', null, item.name));
      li.appendChild(opt);
      menu.appendChild(li);
      return { item: item, node: opt, tick: tick };
    });
    wrap.appendChild(menu);

    host.innerHTML = '';
    host.appendChild(wrap);

    function setMenu(open) {
      menu.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function picked(code) {
      options.forEach(function (o) {
        var on = o.item.code === code;
        o.node.setAttribute('aria-selected', on ? 'true' : 'false');
        /* Haken merker det valgte i tillegg til fyllet — aldri farge alene. */
        o.tick.textContent = on ? '✓' : '';
        if (on) name.textContent = o.item.name;
      });
      btn.setAttribute('aria-label', t('lang-label') + ': ' + name.textContent);
      menu.setAttribute('aria-label', t('lang-choose'));
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setMenu(!menu.classList.contains('is-open'));
    });
    menu.addEventListener('click', function (e) {
      var opt = e.target.closest('.lang-select__option');
      if (!opt) return;
      setMenu(false);
      btn.focus();
      onPick(opt.getAttribute('data-lang'));
    });

    /* Piltaster inne i den åpne lista, Escape ut av den. */
    menu.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      var opts = [].slice.call(menu.querySelectorAll('.lang-select__option'));
      var next = opts.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : -1);
      if (next < 0) next = opts.length - 1;
      if (next >= opts.length) next = 0;
      opts[next].focus();
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown') return;
      e.preventDefault();
      setMenu(true);
      var first = menu.querySelector('.lang-select__option');
      if (first) first.focus();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        setMenu(false);
        btn.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) setMenu(false);
    });

    return picked;
  }

  function init() {
    root = document.getElementById('prompt-list');
    if (!root) return;

    /* <div>, ikke <p>: raden inneholder selve velgeren, og et <div> inne i
       et <p> er ugyldig markup den dagen noen ser på den. */
    pickerRow = el('div', 'langpick');
    pickerLabel = el('span', 'langpick__label', t('lang-label'));
    var host = el('span');
    pickerRow.appendChild(pickerLabel);
    pickerRow.appendChild(host);
    setPicked = buildPicker(host, loadLanguage);
    setPicked(state.code);

    getJson('/assets/prompts/manifest.json').then(function (manifest) {
      state.manifest = manifest;
      var files = [manifest.shared].concat(
        Object.keys(manifest.instructions).map(function (id) {
          return manifest.instructions[id].file;
        }));
      return Promise.all(files.map(function (file) {
        return getJson('/assets/prompts/' + file).then(function (data) {
          state.modules[file] = data;
        }, function () {});
      }));
    }).then(function () {
      return loadLanguage(state.code);
    }).catch(function (err) {
      root.appendChild(el('p', 'note', t('load-failed') + ' ' + err.message));
    });

    /* Sidespråket kan byttes mens sida står åpen, og alt over er bygget i
       script — det har ingen `data-i18n` i18n.js kan nå. */
    if (window.i18n && window.i18n.onChange) {
      window.i18n.onChange(function () {
        pickerLabel.textContent = t('lang-label');
        setPicked(state.code);
        render();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

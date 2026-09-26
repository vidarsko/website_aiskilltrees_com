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

   TO LAG VELGES I HVER SIN NEDTREKKSMENY — språket og fagfamilien — fordi
   det ellers blir for mye: hvert språk legger til sin egen `outputLanguage`
   og `writingStyle`, og hver fagfamilie sine egne tillegg i fire av
   instruksene. Alle på én gang drukner instruksene de hører til. Hvert valg
   styrer to ting samtidig: seksjonene som fylles inne i hver instruks, og
   kortet som viser laget samlet.
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

  /* Fagfamiliene står IKKE i en liste her. De er oppført i
     `prompts/manifest.json` under `subjectFamilies`, og navnet på hver av
     dem i familiefila selv — så en ny familie i maskineriet dukker opp her
     av seg selv, uten en kodeendring. Det er den samme regelen manifestet
     er skrevet etter: bare manifestets eget filnavn er hardkodet. */
  var DEFAULT_FAMILY = 'mathematics';

  /* De to velgerne bygges én gang og FLYTTES inn i hvert sitt kort for hver
     tegning, framfor å bygges på nytt: de har lyttere på `document` for
     Escape og klikk utenfor, og de ville hopet seg opp for hvert bytte. */
  var root,
      langRow, langLabel, setLang,
      familyRow, familyLabel, setFamily,
      state = {
        manifest: null, modules: {}, families: {},
        lang: null, code: 'en', familyCode: DEFAULT_FAMILY
      };

  /* Ikonet og etikettene er det eneste som skiller de to velgerne. */
  var PICKERS = {
    lang: { icon: '🌐', label: 'lang-label', choose: 'lang-choose' },
    family: { icon: '📚', label: 'family-label', choose: 'family-choose' }
  };

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
     Instruksene, språklaget, fagfamilien og de delte seksjonene har samme
     form: overskrift, metalinje, en setning om hvor teksten brukes, og
     selve teksten sammenrullet. Derfor én byggefunksjon, ikke fire. */

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

    /* Kortene for språklaget og fagfamilien har hver sin velger i seg, rett
       under beskrivelsen av hva laget er: det er der valget gir mening,
       framfor øverst på sida med en etikett som må forklare hva et språklag
       eller en fagfamilie er før leseren har sett en. */
    if (opts.control) box.appendChild(opts.control);

    /* Et kort uten seksjoner viser ingen rull. Det gjelder bare språklaget,
       og bare hvis fila mangler begge feltene — men kortet må likevel stå,
       for velgeren står i det. */
    if (!opts.rows.length) return box;

    /* Hele teksten ligger sammenrullet. Sida ble uleselig lang med alt åpent
       — åtte kort med tjuetalls seksjoner hver — og den som vil LESE en
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
      /* Stikkordet ER navnet. Ingen av modulene har en parallell
         tittel-tabell lenger, og i den komponerte instruksen står det
         samme ordet foran teksten — se composePrompt() i motoren. */
      var label = sid;
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
      control: langRow,
      rows: rows
    });
  }

  /* ---- fagfamilien som sitt eget kort -----------------------------------
     Samme grep som språklaget, og av samme grunn: tilleggene står markert
     der de lander, inne i fire av instruksene, men det er først samlet man
     ser hva det vil si at et tre er et MATEMATIKK-tre.

     Kortet har med BEGGE halvdelene av familiefila, ikke bare den motoren
     bruker. `instructions` skytes inn i elevinstruksene ved kjøring;
     `decomposition` leses av læreren eller agenten som skriver treet, og
     dekomponeringsmodellen over sender dem hit for å finne den. Det er
     tekst en KI faktisk får — og sida heter «alt KI-en blir bedt om». */

  function familyCard() {
    var code = state.familyCode;
    var fam = state.families[code] || {};
    var path = (state.manifest.subjectFamilies || {})[code] || '';
    var rows = [];

    /* Instruksenes rekkefølge tas fra manifestet, ikke fra familiefila, slik
       at radene her står i samme rekkefølge som kortene over. */
    var instructions = fam.instructions || {};
    Object.keys(state.manifest.instructions || {}).forEach(function (id) {
      var module = state.modules[(state.manifest.instructions[id] || {}).file] || {};
      ((instructions[id] || {}).add || []).forEach(function (add) {
        rows.push({
          label: add.id,
          text: add.text,
          note: t('family-add-in').replace('{x}', module.title || id)
        });
      });
    });

    var decomposition = fam.decomposition || {};
    Object.keys(decomposition).forEach(function (sid) {
      /* `_comment` er en merknad til den som åpner fila, ikke en seksjon. */
      if (sid.charAt(0) === '_') return;
      rows.push({ label: sid, text: plainText(decomposition[sid]), note: t('family-authoring') });
    });

    return card({
      title: t('family-title'),
      meta: [(fam.title || code), 'v' + (fam.version || '?'), 'prompts/' + path].join(' · '),
      about: about('family'),
      control: familyRow,
      rows: rows
    });
  }

  /* SOLO-tabellen i samfunnsfagfamilien er et objekt, ikke en tekst, og
     sto som «[object Object]» her fram til 2026-09-26. Samme utskrift som
     `plainText` i js/builder.js, som setter blokken inn i ledeteksten. */
  function plainText(value) {
    if (value == null) return '';
    if (typeof value !== 'object') return String(value);
    if (Array.isArray(value)) {
      return value.map(function (item) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return '- ' + Object.keys(item).filter(function (k) {
            return k.charAt(0) !== '_' && !(Array.isArray(item[k]) && !item[k].length);
          }).map(function (k) {
            return k + ': ' + (Array.isArray(item[k]) ? item[k].join(', ') : item[k]);
          }).join('; ');
        }
        return '- ' + plainText(item);
      }).join('\n');
    }
    return Object.keys(value).filter(function (k) { return k.charAt(0) !== '_'; })
      .map(function (k) { return k + ':\n' + plainText(value[k]); }).join('\n');
  }

  function about(id) {
    var text = t('about-' + id);
    return text === 'about-' + id ? '' : text;
  }

  /* ---- hele sida -------------------------------------------------------- */

  function render() {
    if (!root || !state.manifest) return;
    /* Velgerne står inne i kort som tegnes om, så de rives ut og settes inn
       igjen ved hvert bytte. Hadde en av dem tastaturfokus, skal den ha det
       etterpå også — ellers ender den som velger med å miste stedet sitt. */
    var focusRow = [langRow, familyRow].filter(function (r) {
      return r && r.contains(document.activeElement);
    })[0];
    root.innerHTML = '';
    var m = state.manifest;
    var layer = (state.lang || {}).prompt || {};
    var family = state.families[state.familyCode] || {};

    Object.keys(m.instructions).forEach(function (id) {
      var entry = m.instructions[id];
      var module = state.modules[entry.file];
      if (!module) return;
      var overrides = (layer.overrides || {})[id] || {};
      var familyAdds = ((family.instructions || {})[id] || {}).add || [];
      root.appendChild(card({
        title: module.title || id,
        meta: ['v' + (module.version || '?'),
               t('audience-' + (entry.audience || 'student'))].join(' · '),
        about: about(id),
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
    root.appendChild(familyCard());

    var shared = state.modules[m.shared];
    if (shared) {
      root.appendChild(card({
        title: t('shared-title'),
        meta: 'v' + (shared.version || '?'),
        about: about('shared'),
        rows: moduleRows(shared, { lang: layer })
      }));
    }

    if (focusRow) {
      var btn = focusRow.querySelector('.lang-select__button');
      if (btn) btn.focus();
    }
  }

  function loadLanguage(code) {
    state.code = code;
    if (setLang) setLang(code);
    return getJson('/assets/languages/' + code + '.json').then(function (data) {
      state.lang = data;
      render();
      if (window.aistTrack) window.aistTrack('prompts_language', { prompt_language: code });
    });
  }

  /* Familiefilene er alt hentet, så et bytte koster ingen runde til
     serveren — og hendelsen sendes bare når noen faktisk VELGER noe, ikke
     ved første tegning. (Merk at `prompts_language` sendes ved hver
     sidelasting også, siden språkfila må hentes. De to tallene er derfor
     ikke sammenliknbare slik de står.) */
  function pickFamily(code) {
    state.familyCode = code;
    if (setFamily) setFamily(code);
    render();
    if (window.aistTrack) window.aistTrack('prompts_family', { prompt_family: code });
  }

  /* ---- velgerne ---------------------------------------------------------
     Samme komponent som velgeren i toppbaren — samme klasser, samme
     tastaturoppførsel — men bygget her, fordi header.js eier nettstedets
     ramme og disse hører til sidas innhold. Det delte er CSS-en
     (`.lang-select` i css/components.css); to kontroller som skal se like ut
     skal ikke gjøre det ved et sammentreff. */

  function buildPicker(host, items, kind, onPick) {
    var conf = PICKERS[kind];
    var wrap = el('div', 'lang-select');

    var btn = el('button', 'lang-select__button');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    var icon = el('span', 'lang-select__icon', conf.icon);
    icon.setAttribute('aria-hidden', 'true');
    var name = el('span', 'lang-select__code');
    var caret = el('span', 'lang-select__caret', '▾');
    caret.setAttribute('aria-hidden', 'true');
    btn.appendChild(icon);
    btn.appendChild(name);
    btn.appendChild(caret);
    wrap.appendChild(btn);

    var menu = el('ul', 'lang-select__menu');
    menu.setAttribute('role', 'listbox');
    var options = items.map(function (item) {
      var li = el('li');
      var opt = el('button', 'lang-select__option');
      opt.type = 'button';
      opt.setAttribute('role', 'option');
      opt.setAttribute('data-value', item.code);
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
      btn.setAttribute('aria-label', t(conf.label) + ': ' + name.textContent);
      menu.setAttribute('aria-label', t(conf.choose));
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
      onPick(opt.getAttribute('data-value'));
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

  /* <div>, ikke <p>: raden inneholder selve velgeren, og et <div> inne i et
     <p> er ugyldig markup den dagen noen ser på den. */
  function pickerRow(labelKey) {
    var row = el('div', 'layerpick');
    var label = el('span', 'layerpick__label', t(labelKey));
    var host = el('span');
    row.appendChild(label);
    row.appendChild(host);
    return { row: row, label: label, host: host };
  }

  function init() {
    root = document.getElementById('prompt-list');
    if (!root) return;

    var lp = pickerRow('lang-label');
    langRow = lp.row;
    langLabel = lp.label;
    setLang = buildPicker(lp.host, LANGS, 'lang', loadLanguage);
    setLang(state.code);

    getJson('/assets/prompts/manifest.json').then(function (manifest) {
      state.manifest = manifest;
      var families = manifest.subjectFamilies || {};
      var codes = Object.keys(families);
      if (codes.indexOf(state.familyCode) === -1 && codes.length) {
        state.familyCode = codes[0];
      }
      var files = [manifest.shared].concat(
        Object.keys(manifest.instructions).map(function (id) {
          return manifest.instructions[id].file;
        }));
      return Promise.all(files.map(function (file) {
        return getJson('/assets/prompts/' + file).then(function (data) {
          state.modules[file] = data;
        }, function () {});
      }).concat(codes.map(function (code) {
        /* Alle familiene hentes med én gang. Til sammen er de rundt 22 kB,
           og til gjengjeld koster et bytte ingen venting — og lista i
           velgeren kan ta navnene fra filene selv framfor fra en kopi her. */
        return getJson('/assets/prompts/' + families[code]).then(function (data) {
          state.families[code] = data;
        }, function () {});
      })));
    }).then(function () {
      var fp = pickerRow('family-label');
      familyRow = fp.row;
      familyLabel = fp.label;
      /* Rekkefølgen tas fra manifestet, ikke fra hvilken fil som kom først
         tilbake fra serveren — ellers står lista i en ny rekkefølge for hver
         lasting. */
      setFamily = buildPicker(fp.host, Object.keys(state.manifest.subjectFamilies || {})
        .filter(function (code) { return state.families[code]; })
        .map(function (code) {
          return { code: code, name: state.families[code].title || code };
        }), 'family', pickFamily);
      setFamily(state.familyCode);
      return loadLanguage(state.code);
    }).catch(function (err) {
      root.appendChild(el('p', 'note', t('load-failed') + ' ' + err.message));
    });

    /* Sidespråket kan byttes mens sida står åpen, og alt over er bygget i
       script — det har ingen `data-i18n` i18n.js kan nå. */
    if (window.i18n && window.i18n.onChange) {
      window.i18n.onChange(function () {
        langLabel.textContent = t('lang-label');
        setLang(state.code);
        if (familyLabel) familyLabel.textContent = t('family-label');
        if (setFamily) setFamily(state.familyCode);
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

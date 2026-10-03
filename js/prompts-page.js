/* ==========================================================================
   prompts-page.js — /prompts/

   Viser instruksene slik de faktisk er skrevet, hentet fra maskineriet ved
   kjøring. Sida har med vilje ingen kopi av teksten: kilden er
   `assets/prompt-history/`, som deployen bygger fra taggene i
   maskineri-repoet (tools/build-prompt-history.py), og en side som gjengir
   dem ville vært utdatert ved neste release uten at noen merket det.

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

   VERSJONER (2026-10-02). Sida har ÉN tilstand for versjon: hvilken release
   den viser. Velgeren øverst setter den, og versjonsvelgeren i hvert kort
   setter den også — å velge practice tutor 1.6.0 flytter hele sida til en
   release som hadde 1.6.0. Slik kan sida aldri vise en kombinasjon av
   moduler som aldri ble sluppet sammen. Sammenlikning gjør hvert kort til
   én tabell: stikkordet, den nyere teksten og den eldre, rad for rad, med
   det som er lagt til i grønt og det som er fjernet strøket i rødt. Se prompts_private/CLAUDE.md.
   ========================================================================== */

(function () {
  'use strict';

  var BASE = '/assets/prompt-history/';

  /* Samme tre språk som `LANGS` i js/header.js, men et annet spørsmål: der
     velger man hvilket språk SIDA leses på, her hvilket SPRÅKLAG som vises
     sammen med instruksene. Endonymer, så lista leses likt uansett hvilket
     språk sida står på. */
  var LANGS = [
    { code: 'en', name: 'English' },
    { code: 'nb', name: 'Norsk' },
    { code: 'sv', name: 'Svenska' }
  ];

  /* Fagfamiliene står IKKE i en liste her. De leses av historikken, som
     leser dem av `subjectFamilies` i hver releases manifest — så en ny
     familie i maskineriet dukker opp her av seg selv. */
  /* Ingen fagfamilie som standard (fra 2026-10-03): instrukskortene viser
     da den generelle teksten, og en seksjon en familie erstatter sier det.
     Med matematikk som standard sto «from the Mathematics family» i det
     leseren tok for å være den generelle instruksen. */
  var DEFAULT_FAMILY = '';

  /* Nøkkelordene i {klammer}, i tre grupper etter hvor verdien kommer fra.
     Standardverdiene i den midterste gruppa avhenger av språklaget og leses
     av den publiserte språkfila (historikken har bare `prompt`-delen). */
  var KEYWORDS = [
    { group: 'kw-group-tree', keys: ['courseName', 'motivationSubject', 'expressionFocus', 'courseSpecifics'] },
    { group: 'kw-group-language', keys: ['conversationLanguage', 'learnerDefinite', 'examButtonLabel'] },
    { group: 'kw-group-engine', keys: ['nodeName', 'nodeDescription', 'prerequisiteList', 'aidsText',
      'nodeCount', 'nodeList', 'taskCount', 'goalCount', 'goalList', 'totalMinutes', 'perGoal',
      'schedule', 'starterMinutes', 'recallMinutes'] }
  ];

  /* Seksjoner som står som null i modulen og fylles et annet sted: en kort
     beskrivelse av hva de gjør, og hvor teksten kommer fra. */
  var FILLED = {
    outputLanguage: { desc: 'desc-outputLanguage', ref: 'language' },
    writingStyle: { desc: 'desc-writingStyle', ref: 'language' },
    nodeInstruction: { desc: 'desc-nodeInstruction', ref: null }
  };

  /* De to lagvelgerne bygges én gang og FLYTTES inn i hvert sitt kort for
     hver tegning, framfor å bygges på nytt: de har lyttere på `document` for
     Escape og klikk utenfor, og de ville hopet seg opp for hvert bytte.
     Versjonsvelgerne er vanlige <select>, som kan bygges på nytt fritt. */
  var root, bar,
      langRow, langLabel, setLang,
      familyRow, familyLabel, setFamily,
      blobs = {},
      drawn = 0,
      state = {
        history: null,
        release: null,   // taggen sida viser; i sammenlikning den NYERE
        compare: null,   // den eldre taggen, eller null
        code: 'en', familyCode: DEFAULT_FAMILY,
        /* Hvilke kort som står åpne. Sida tegnes på nytt ved hvert bytte av
           språklag, familie eller release, og et åpent kort skal være åpent
           etterpå også (Vidar, 2026-10-03). */
        open: {},
        liveLang: {}
      };

  /* Ikonet og etikettene er det eneste som skiller de to lagvelgerne. */
  var PICKERS = {
    lang: { icon: '🌐', label: 'lang-label', choose: 'lang-choose' },
    family: { icon: '📚', label: 'family-label', choose: 'family-choose' }
  };

  function t(key) {
    return (window.i18n && window.i18n.t) ? window.i18n.t(key) : key;
  }

  function fill(key, vars) {
    var s = t(key);
    Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
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

  /* ---- historikken -------------------------------------------------------
     index.json har én oppføring per release, nyeste først, og peker på hver
     tekst med en hash. En modul som ikke endret seg mellom to releaser er
     samme fil, så den hentes én gang. */

  function releaseOf(tag) {
    var list = state.history.releases;
    for (var i = 0; i < list.length; i++) if (list[i].tag === tag) return list[i];
    return null;
  }

  function releaseIndex(tag) {
    var list = state.history.releases;
    for (var i = 0; i < list.length; i++) if (list[i].tag === tag) return i;
    return -1;
  }

  function blob(hash) {
    if (!blobs[hash]) blobs[hash] = getJson(BASE + 'blobs/' + hash + '.json');
    return blobs[hash];
  }

  /* Alt én release trenger, hentet og lagt i et objekt sida kan tegne fra
     uten mer venting. */
  function loadRelease(tag) {
    var r = releaseOf(tag);
    var out = { tag: tag, instructions: [], modules: {}, shared: null, families: {}, languages: {} };
    var jobs = [];
    r.instructions.forEach(function (entry) {
      out.instructions.push(entry.id);
      jobs.push(blob(entry.blob).then(function (d) { out.modules[entry.id] = d; }));
    });
    if (r.shared) jobs.push(blob(r.shared.blob).then(function (d) { out.shared = d; }));
    r.families.forEach(function (f) {
      jobs.push(blob(f.blob).then(function (d) { out.families[f.code] = d; }));
    });
    r.languages.forEach(function (l) {
      jobs.push(blob(l.blob).then(function (d) { out.languages[l.code] = d; }));
    });
    return Promise.all(jobs).then(function () { return out; });
  }

  /* Hvert kort har en id som er den samme i alle releaser, slik at kortene
     kan stilles opp mot hverandre og versjonene av ett kort kan listes. */
  function entryFor(r, id) {
    if (id === 'shared') return r.shared;
    if (id === 'language') return find(r.languages, 'code', state.code);
    if (id === 'family') return find(r.families, 'code', state.familyCode);
    return find(r.instructions, 'id', id);
  }

  function find(list, key, value) {
    for (var i = 0; i < (list || []).length; i++) if (list[i][key] === value) return list[i];
    return null;
  }

  /* Versjonene av ett kort, som sammenhengende løp av releaser med samme
     tekst. Det er disse versjonsvelgeren i kortet lister: én linje per
     versjon med hvilke releaser som hadde den, framfor én linje per release. */
  function versionsOf(id) {
    var groups = [];
    var list = state.history.releases.slice().reverse();   // eldste først
    list.forEach(function (r) {
      var e = entryFor(r, id);
      var hash = e ? e.blob : null;
      var last = groups[groups.length - 1];
      if (last && last.hash === hash) {
        last.tags.push(r.tag);
      } else {
        groups.push({ hash: hash, version: e ? (e.version || null) : null, tags: [r.tag] });
      }
    });
    return groups.reverse();   // nyeste først, som release-velgeren
  }

  /* ---- ett kort --------------------------------------------------------
     Instruksene, språklaget, fagfamilien og de delte seksjonene har samme
     form: overskrift, metalinje, en setning om hvor teksten brukes, og
     selve teksten sammenrullet. Derfor én byggefunksjon, ikke fire. */

  function revealFor(id) {
    var reveal = el('details', 'promptdoc__reveal');
    if (state.open[id]) reveal.open = true;
    reveal.addEventListener('toggle', function () { state.open[id] = reveal.open; });
    return reveal;
  }

  /* En lenke til et annet kort på sida — språklaget eller fagfamilien —
     som også folder det ut, så den som klikker ser teksten det pekes på. */
  function cardLink(cls, text, ref) {
    var a = el('a', cls, text);
    a.href = '#card-' + ref;
    a.addEventListener('click', function () {
      state.open[ref] = true;
      var target = document.getElementById('card-' + ref);
      var d = target && target.querySelector('details');
      if (d) d.open = true;
    });
    return a;
  }

  /* Tekstcellen til en seksjon som fylles et annet sted: beskrivelsen i
     kursiv, så «Taken from the language layer.» med lenke bare rundt
     «language layer». */
  function filledCell(cell, row) {
    var em = el('em', null, row.desc + ' ');
    cell.appendChild(em);
    if (!row.ref) { em.appendChild(document.createTextNode(t('filled-from-tree'))); return; }
    var parts = t('taken-from').split('{link}');
    em.appendChild(document.createTextNode(parts[0]));
    em.appendChild(cardLink(null, t('language-layer-link'), row.ref));
    em.appendChild(document.createTextNode(parts[1] || ''));
  }

  /* Stikkordcellen: navnet, når seksjonen gjelder, hvor teksten kommer fra,
     og om en fagfamilie kan erstatte den. Samme for begge korttypene. */
  function keyParts(cell, row) {
    cell.appendChild(el('code', null, row.label));
    if (row.when) cell.appendChild(el('span', 'promptdoc__when', row.when));
    if (row.same) cell.appendChild(el('span', 'promptdoc__when', t('family-same-as-general')));
    if (row.tag) cell.appendChild(cardLink('promptdoc__alt', row.tag, 'shared'));
    if (row.note) {
      cell.appendChild(row.noteRef ? cardLink('promptdoc__note', row.note, row.noteRef)
                                   : el('span', 'promptdoc__note', row.note));
    }
    if (row.alt) cell.appendChild(cardLink('promptdoc__alt', row.alt, 'family'));
  }

  function card(opts) {
    var box = el('section', 'promptdoc' + (opts.missing ? ' promptdoc--missing' : ''));
    box.setAttribute('data-card', opts.id);
    box.id = 'card-' + opts.id;

    var head = el('header', 'promptdoc__head');
    head.appendChild(el('h3', 'promptdoc__title', opts.title));
    if (opts.meta) head.appendChild(el('p', 'promptdoc__meta', opts.meta));
    if (opts.versions) head.appendChild(opts.versions);
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

    if (opts.status) box.appendChild(el('p', 'promptdoc__status', opts.status));

    /* Et kort uten seksjoner viser ingen rull. Det gjelder et kort som ikke
       finnes i releasen og språklaget hvis fila mangler begge feltene. */
    if (!opts.rows || !opts.rows.length) return box;

    /* Hele teksten ligger sammenrullet. Sida ble uleselig lang med alt åpent
       — åtte kort med tjuetalls seksjoner hver — og den som vil LESE en
       instruks, vil som regel lese én. <details> framfor egen JavaScript:
       det virker uten script, kan søkes i av nettleseren, og har
       tastaturoppførselen gratis. */
    var reveal = revealFor(opts.id);
    var toggle = el('summary', 'promptdoc__toggle');
    var kw = opts.id === 'keywords';
    toggle.appendChild(el('span', 'promptdoc__toggle-show', t(kw ? 'show-keywords' : 'show-prompt')));
    toggle.appendChild(el('span', 'promptdoc__toggle-hide', t(kw ? 'hide-keywords' : 'hide-prompt')));
    /* Språklaget kan ha én eneste seksjon — en.json legger bare til
       samtalespråket — og «1 sections» ville stått der hver gang. */
    toggle.appendChild(el('span', 'promptdoc__count', kw
      ? t('keyword-count').replace('{n}', opts.rows.length)
      : opts.rows.length === 1 ? t('section-count-one')
      : t('section-count').replace('{n}', opts.rows.length)));
    reveal.appendChild(toggle);
    box.appendChild(reveal);

    /* Gruppeoverskriften («Role and style», «How to teach» ...) står der
       gruppa begynner — samme overskrift som står i instruksen eleven limer
       inn — og hver gruppe er sin egen <dl>, siden en overskrift ikke kan
       stå inne i en. Moduler fra før 0.25.0 har ingen grupper og får én. */
    var list = null;
    var group = null;
    opts.rows.forEach(function (row) {
      if (!list || (row.group || null) !== group) {
        if (row.group) reveal.appendChild(el('h4', 'promptdoc__group', row.group));
        list = el('dl', 'promptdoc__sections');
        reveal.appendChild(list);
      }
      group = row.group || null;
      var dt = el('dt', 'promptdoc__key');
      keyParts(dt, row);
      list.appendChild(dt);
      var dd = el('dd', 'promptdoc__text');
      if (row.desc) filledCell(dd, row);
      else dd.textContent = row.text;
      list.appendChild(dd);
    });

    return box;
  }

  /* ---- seksjonene i én instruksmodul ------------------------------------ */

  /* Hva en betingelse heter for en leser. Navnet kommer fra modulens
     `when` (fra 0.25.0) og betydningen fra CONDITIONS i motoren; teksten
     her er sidas, på tre språk. Et navn uten tekst vises som det er,
     framfor å forsvinne. */
  function whenLabel(name) {
    if (!name) return '';
    var key = 'cond-' + name;
    var text = t(key);
    return text === key ? name : text;
  }

  function moduleRows(module, extras) {
    var rows = [];
    var when = module.when || {};
    var famSections = extras.familySections || {};
    var groups = module.groups ||
      [{ title: '', sections: module.order || Object.keys(module.sections || {}) }];

    groups.forEach(function (g) {
      g.sections.forEach(function (sid) {
        var text = (module.sections || {})[sid];
        /* Stikkordet ER navnet. I den komponerte instruksen står det samme
           ordet foran teksten — se composePrompt() i motoren. */
        var row = { label: sid, group: g.title || '', when: whenLabel(when[sid]), note: '' };
        var replacers = (extras.replacers || {})[sid] || [];
        if (famSections[sid] != null) {
          /* Fra 0.25.0 ERSTATTER fagfamilien seksjonen: dette er teksten et
             tre i familien får, og den generelle vises når «ingen
             fagfamilie» er valgt. */
          row.text = plainText(famSections[sid]);
          row.note = extras.familyNote || t('from-family');
          row.noteRef = 'family';
        } else if (text == null) {
          /* En seksjon som står som null i modulen fylles av språklaget —
             `outputLanguage` og `writingStyle`. Teksten står i språklagets
             eget kort lenger ned, så her står bare en lenke dit (Vidar,
             2026-10-03): å vise det valgte språkets tekst her så ut som om
             instruksen selv var skrevet på det språket. Tom teller ikke:
             en.json har `writingStyle: ""` med vilje. */
          var filler = (extras.lang || {})[sid];
          var filled = FILLED[sid];
          if ((extras.shared || {})[sid] != null) {
            /* En seksjon fra shared.json (languageSwitch, courseSpecifics ...)
               står med teksten sin, merket i stikkordkolonnen. */
            row.text = plainText(extras.shared[sid]);
            row.tag = t('shared-tag');
          } else if (filled && (filled.ref !== 'language' || filler || extras.lang)) {
            /* Fylles av språklaget eller treet: en kort beskrivelse i kursiv
               og hvor teksten kommer fra, med lenke bare rundt «språklaget»
               (Vidar, 2026-10-03). Teksten selv står i språklagets kort. */
            row.desc = t(filled.desc);
            row.ref = filled.ref;
            row.text = row.desc + ' ' + (filled.ref ? fill('taken-from', { link: t('language-layer-link') }) : t('filled-from-tree'));
          } else {
            return;
          }
        } else {
          row.text = plainText(text);
          /* Den generelle teksten, men noen fagfamilier har sin egen: si
             hvilke, med lenke til familiekortet. */
          if (replacers.length) {
            row.alt = replacers.length === (extras.familyCount || 0)
              ? t('family-replaces-all')
              : fill('family-can-replace', { list: replacers.join(', ') });
          }
        }
        rows.push(row);
      });
    });

    /* En seksjon fagfamilien LEGGER TIL står etter ankeret sitt, i gruppa
       til ankeret, som i instruksen. Uten anker (eller i en eldre release
       der ankeret ikke finnes) står den sist. */
    (extras.family || []).forEach(function (add) {
      var row = { label: add.id, text: add.text, note: extras.familyAddNote || t('from-family-add'), group: '', when: '' };
      var at = -1;
      rows.forEach(function (r, i) { if (r.label === add.after) at = i; });
      if (at === -1) {
        row.group = rows.length ? rows[rows.length - 1].group : '';
        rows.push(row);
      } else {
        row.group = rows[at].group;
        row.when = rows[at].when;
        rows.splice(at + 1, 0, row);
      }
    });
    (extras.overrides || []).forEach(function (o) {
      rows.push({ label: o.id, text: o.text, note: t('from-language-override'),
                  group: rows.length ? rows[rows.length - 1].group : '', when: '' });
    });

    return rows;
  }

  /* ---- hva hvert kort inneholder i én release ----------------------------
     Én funksjon per slags kort, som gir tittel, metalinje og rader — eller
     null når kortet ikke finnes i releasen. Tegningen og sammenlikningen
     bruker de samme, så de to kolonnene kan ikke komme til å vise teksten
     forskjellig. */

  /* For hver seksjon i en instruks: hvilke fagfamilier i releasen som
     erstatter den, ved navn. */
  function replacersOf(rel, id) {
    var out = {};
    Object.keys(rel.families || {}).forEach(function (code) {
      var fam = rel.families[code] || {};
      var secs = (((fam.instructions || {})[id]) || {}).sections || {};
      Object.keys(secs).forEach(function (sid) {
        (out[sid] = out[sid] || []).push(fam.title || code);
      });
    });
    return out;
  }

  function instructionView(rel, id) {
    var module = rel.modules[id];
    if (!module) return null;
    var lang = rel.languages[state.code] || {};
    var layer = lang.prompt || {};
    var family = (state.familyCode && rel.families[state.familyCode]) || {};
    var famPart = (family.instructions || {})[id] || {};
    var overrides = (layer.overrides || {})[id] || {};
    return {
      title: module.title || id,
      meta: [module.path, t('audience-' + (module.audience || 'student'))].join(' · '),
      about: about(id),
      format: module.format || 'json',
      rows: moduleRows(module, {
        lang: layer,
        family: famPart.add || [],
        familySections: famPart.sections || {},
        replacers: replacersOf(rel, id),
        shared: (rel.shared || {}).sections || {},
        familyCount: Object.keys(rel.families || {}).length,
        familyNote: fill('from-family-named', { family: family.title || state.familyCode }),
        familyAddNote: fill('from-family-add-named', { family: family.title || state.familyCode }),
        overrides: Object.keys(overrides).map(function (k) {
          return { id: k, text: overrides[k] };
        })
      })
    };
  }

  /* Språklaget som sitt eget kort. Seksjonene står markert der de lander,
     inne i hver instruks. Her står laget samlet, fordi det er det som er
     hele forskjellen mellom en norsk og en svensk samtale. */
  function languageView(rel) {
    var lang = rel.languages[state.code];
    if (!lang) return null;
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
      var module = rel.modules[id] || {};
      Object.keys(overrides[id]).forEach(function (sid) {
        rows.push({
          label: sid,
          text: overrides[id][sid],
          note: t('language-override-in').replace('{x}', module.title || id)
        });
      });
    });

    return {
      title: t('language-title'),
      meta: (lang.name || state.code) + ' · ' + (lang.path || 'languages/' + state.code + '.json'),
      about: about('language'),
      rows: rows
    };
  }

  /* Fagfamilien som sitt eget kort. Kortet har med BEGGE halvdelene av
     familiefila: `instructions` skytes inn i elevinstruksene ved kjøring;
     `decomposition` leses av læreren eller agenten som skriver treet. Det
     er tekst en KI faktisk får — og sida heter «alt KI-en blir bedt om». */
  function familyView(rel) {
    /* «Ingen fagfamilie» er et valg i velgeren fra 0.25.0: det er slik den
       generelle teksten i en seksjon en familie erstatter, kan leses. Kortet
       står likevel, for velgeren står i det. */
    if (!state.familyCode) {
      return { title: t('family-title'), meta: t('family-none'), about: about('family'),
               status: t('family-none-status'), rows: [] };
    }
    var fam = rel.families[state.familyCode];
    if (!fam) return null;
    var rows = [];

    /* Instruksenes rekkefølge, slik at radene her står i samme rekkefølge
       som kortene over. */
    var instructions = fam.instructions || {};
    rel.instructions.forEach(function (id) {
      var module = rel.modules[id] || {};
      var part = instructions[id] || {};
      /* I instruksens egen rekkefølge, ikke filens: historikken lagrer
         nøklene sortert, og da kom `conceptGuidance` før `leadIn`. */
      var order = (module.groups || []).reduce(function (acc, g) { return acc.concat(g.sections); },
                                               module.order || []);
      var pos = function (sid) { var i = order.indexOf(sid); return i === -1 ? 1e6 : i; };
      Object.keys(part.sections || {}).sort(function (a, b) { return pos(a) - pos(b); }).forEach(function (sid) {
        /* Fra 0.26.0 har alle familiene de samme seksjonene, og en familie
           uten noe eget å si har en ordrett kopi av den generelle teksten.
           Det sies her, så den som sammenlikner fag ser hvor forskjellen
           faktisk er. Merknaden lenker til instruksen seksjonen står i. */
        var general = (module.sections || {})[sid];
        rows.push({
          label: sid,
          text: plainText(part.sections[sid]),
          group: module.title || id,
          note: t('family-replaces-in').replace('{x}', module.title || id),
          noteRef: id,
          same: general != null && plainText(general) === plainText(part.sections[sid])
        });
      });
      (part.add || []).forEach(function (add) {
        rows.push({
          label: add.id,
          text: add.text,
          group: (module.groups ? module.title || id : ''),
          note: t('family-add-in').replace('{x}', module.title || id)
        });
      });
    });

    var decomposition = fam.decomposition || {};
    Object.keys(decomposition).forEach(function (sid) {
      rows.push({ label: sid, text: plainText(decomposition[sid]), note: t('family-authoring'),
                  group: fam.schemaVersion >= 3 ? t('family-group-authoring') : '' });
    });

    return {
      title: t('family-title'),
      meta: [(fam.title || state.familyCode), fam.path].join(' · '),
      about: about('family'),
      rows: rows
    };
  }

  function sharedView(rel) {
    if (!rel.shared) return null;
    var layer = ((rel.languages[state.code] || {}).prompt) || {};
    return {
      title: t('shared-title'),
      meta: rel.shared.path,
      about: about('shared'),
      rows: moduleRows(rel.shared, { lang: layer })
    };
  }

  function keywordsView() {
    var lang = state.liveLang[state.code] || null;
    var learner = lang && (lang.learners || {})[lang.defaultLearner];
    var defaults = lang ? {
      conversationLanguage: (lang.prompt || {}).conversationLanguage || lang.name,
      learnerDefinite: learner && learner.definite,
      examButtonLabel: ((lang.ui || {}).exam || {}).button
    } : {};
    var rows = [];
    KEYWORDS.forEach(function (g) {
      g.keys.forEach(function (k) {
        var text = t('kw-' + k);
        if (defaults[k]) {
          text += '\n' + fill('kw-default', { lang: (lang && lang.name) || state.code, value: defaults[k] });
        }
        rows.push({ label: '{' + k + '}', text: text, group: t(g.group), note: '', when: '' });
      });
    });
    return { title: t('keywords-title'), meta: '', about: about('keywords'), rows: rows };
  }

  function view(rel, id) {
    if (id === 'keywords') return keywordsView();
    if (id === 'language') return languageView(rel);
    if (id === 'family') return familyView(rel);
    if (id === 'shared') return sharedView(rel);
    return instructionView(rel, id);
  }

  /* Kortene i rekkefølge: instruksene slik releasen har dem, så språklaget,
     fagfamilien og de delte seksjonene. I sammenlikning kommer en instruks
     som bare finnes i den eldre releasen inn der den sto. */
  function cardIds(rels) {
    var ids = [];
    rels.forEach(function (rel) {
      var prev = -1;
      rel.instructions.forEach(function (id) {
        var at = ids.indexOf(id);
        if (at === -1) { ids.splice(prev + 1, 0, id); at = prev + 1; }
        prev = at;
      });
    });
    return ['keywords'].concat(ids, ['language', 'family', 'shared']);
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

  /* ---- versjonsvelgeren i et kort ----------------------------------------
     Én linje per versjon av kortet, med releasene som hadde den. Å velge en
     flytter HELE sida (eller hele kolonnen, i sammenlikning): står sida
     allerede på en release med den versjonen, skjer ingenting; ellers går
     den til den nyeste releasen som hadde den. */

  function versionSelect(id, title, current, onTag) {
    var groups = versionsOf(id);
    if (groups.length < 2 && groups[0] && groups[0].hash) return null;
    var sel = el('select', 'promptdoc__version');
    sel.setAttribute('aria-label', fill('version-of', { x: title }));
    var chosen = -1;
    /* Lukket viser velgeren bare versjonen, «v2.10.1». Åpen viser hver
       linje releasene som hadde den, «v2.10.1 (release v0.22.0 – v0.23.0)».
       En <select> viser teksten til det valgte alternativet, så den teksten
       byttes når lista åpnes og lukkes. Språkfilene har ikke eget
       versjonsnummer; der er releaseløpet det eneste som kan stå. */
    var labels = groups.map(function (g) {
      var range = g.tags.length > 1
        ? g.tags[0] + ' – ' + g.tags[g.tags.length - 1]
        : g.tags[0];
      var name = !g.hash ? t('not-present') : (g.version ? 'v' + g.version : '');
      var long = name
        ? fill('version-option', { v: name, r: range })
        : fill('release-range', { r: range });
      return { short: name || long, long: long };
    });
    groups.forEach(function (g, i) {
      var opt = el('option', null, labels[i].long);
      opt.value = String(i);
      if (g.tags.indexOf(current) !== -1) chosen = i;
      sel.appendChild(opt);
    });
    sel.value = String(chosen);
    function closed() {
      [].forEach.call(sel.options, function (o, i) {
        o.textContent = o.selected ? labels[i].short : labels[i].long;
      });
    }
    function opened() {
      [].forEach.call(sel.options, function (o, i) { o.textContent = labels[i].long; });
    }
    closed();
    sel.addEventListener('mousedown', opened);
    sel.addEventListener('keydown', opened);
    sel.addEventListener('blur', closed);
    sel.addEventListener('change', function () {
      closed();
      var g = groups[+sel.value];
      if (!g || g.tags.indexOf(current) !== -1) return;
      onTag(g.tags[g.tags.length - 1]);
    });
    return sel;
  }

  /* ---- ordvis sammenlikning ----------------------------------------------
     To trinn, slik at en lang modul ikke koster mye: først linje mot linje,
     så ord mot ord innenfor de linjene som er byttet ut. Algoritmen er
     Myers' O(ND), med et tak på hvor forskjellige to tekster får være før
     den gir opp og merker hele den gamle og hele den nye teksten —
     det er også det riktige svaret for to tekster som ikke ligner. */

  function myers(a, b, maxD) {
    var n = a.length, m = b.length, max = n + m, off = max + 1;
    var v = new Int32Array(2 * max + 3);
    var trace = [];
    for (var d = 0; d <= max && d <= maxD; d++) {
      trace.push({ base: -d - 1, arr: v.slice(off - d - 1, off + d + 2) });
      for (var k = -d; k <= d; k += 2) {
        var x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]))
          ? v[off + k + 1] : v[off + k - 1] + 1;
        var y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) return backtrack(trace, n, m);
      }
    }
    return null;
  }

  function backtrack(trace, n, m) {
    var ops = [], x = n, y = m;
    for (var d = trace.length - 1; d > 0; d--) {
      var snap = trace[d];
      var get = function (k) { return snap.arr[k - snap.base]; };
      var k = x - y;
      var prevK = (k === -d || (k !== d && get(k - 1) < get(k + 1))) ? k + 1 : k - 1;
      var px = get(prevK), py = px - prevK;
      while (x > px && y > py) { ops.push(['=', x - 1, y - 1]); x--; y--; }
      if (prevK === k + 1) ops.push(['+', -1, py]);
      else ops.push(['-', px, -1]);
      x = px; y = py;
    }
    while (x > 0 && y > 0) { ops.push(['=', x - 1, y - 1]); x--; y--; }
    return ops.reverse();
  }

  /* Ord med mellomrommet etter seg som ett token; likhet på ordet alene,
     slik at et linjeskift som ble et mellomrom ikke teller som endring. */
  function words(s) { return s.match(/\s+|\S+\s*/g) || []; }
  function lines(s) { return s.match(/[^\n]*\n|[^\n]+$/g) || []; }

  function push(parts, type, s) {
    if (!s) return;
    var last = parts[parts.length - 1];
    if (last && last.t === type) last.s += s; else parts.push({ t: type, s: s });
  }

  function diffTokens(a, b, key, maxD, parts, inner) {
    /* Felles start og slutt skrelles av først; det er der det meste av en
       typisk endring ligger, og Myers får mindre å gjøre. */
    var s = 0;
    while (s < a.length && s < b.length && key(a[s]) === key(b[s])) push(parts, '=', b[s++]);
    var ea = a.length, eb = b.length, tail = [];
    while (ea > s && eb > s && key(a[ea - 1]) === key(b[eb - 1])) { ea--; eb--; tail.unshift(b[eb]); }
    var ma = a.slice(s, ea), mb = b.slice(s, eb);
    var ops = myers(ma.map(key), mb.map(key), maxD);
    if (!ops) {
      push(parts, '-', ma.join(''));
      push(parts, '+', mb.join(''));
    } else {
      var del = [], add = [];
      var flush = function () {
        if (!del.length && !add.length) return;
        if (inner && del.length && add.length) inner(del.join(''), add.join(''), parts);
        else { push(parts, '-', del.join('')); push(parts, '+', add.join('')); }
        del = []; add = [];
      };
      ops.forEach(function (op) {
        if (op[0] === '=') { flush(); push(parts, '=', mb[op[2]]); }
        else if (op[0] === '-') del.push(ma[op[1]]);
        else add.push(mb[op[2]]);
      });
      flush();
    }
    tail.forEach(function (tok) { push(parts, '=', tok); });
    return parts;
  }

  function trimKey(tok) { return tok.replace(/\s+$/, ''); }

  function diffText(oldText, newText) {
    return diffTokens(lines(oldText), lines(newText), trimKey, 400, [], function (o, n, parts) {
      diffTokens(words(o), words(n), trimKey, 1500, parts, null);
    });
  }

  /* Radene i to versjoner av samme kort, stilt opp mot hverandre etter
     stikkord og merknad. En rad som bare finnes i den gamle, kommer inn
     der den sto, strøket. */
  function diffRows(oldRows, newRows) {
    /* Nøkkelen er stikkordet, nummerert når det står flere ganger (en
       språkoverstyring står ved siden av seksjonen den erstatter). Merknaden
       er ikke med: fra 0.25.0 er `conceptGuidance` «fra fagfamilien» der den
       før var den generelle, og det er den samme seksjonen. Gruppa er heller
       ikke med: en seksjon som har flyttet gruppe, er den samme seksjonen. */
    var keyed = function (rows) {
      var seen = {};
      return rows.map(function (r) {
        var n = seen[r.label] = (seen[r.label] || 0) + 1;
        return r.label + '\u0000' + n;
      });
    };
    var oldK = keyed(oldRows), newK = keyed(newRows);
    var oldBy = {}, newKeys = {};
    oldK.forEach(function (k, i) { oldBy[k] = i; });
    newK.forEach(function (k) { newKeys[k] = true; });
    var out = [], next = 0;
    var flushRemoved = function (upto) {
      for (; next < upto; next++) {
        var r = oldRows[next];
        if (!newKeys[oldK[next]]) {
          out.push({ label: r.label, note: r.note, group: r.group, when: r.when, change: '-', parts: [{ t: '-', s: r.text }] });
        }
      }
    };
    newRows.forEach(function (r, j) {
      var i = oldBy[newK[j]];
      if (i == null) {
        out.push({ label: r.label, note: r.note, group: r.group, when: r.when, change: '+', parts: [{ t: '+', s: r.text }] });
        return;
      }
      if (i >= next) flushRemoved(i + 1);
      out.push({ label: r.label, note: r.note, group: r.group, when: r.when,
                 parts: r.text === oldRows[i].text ? [{ t: '=', s: r.text }] : diffText(oldRows[i].text, r.text) });
    });
    flushRemoved(oldRows.length);
    return out;
  }

  /* Radene i sammenlikningstabellen: én rad per seksjon, med den nyere
     teksten i midtre kolonne og den eldre i høyre. `null` er en seksjon som
     ikke finnes i den releasen; `'same'` er en seksjon som er lik i begge.
     Mellom Markdown og JSON (før og etter v0.3.0) svarer seksjonene ikke
     til hverandre, så der står hele teksten i én rad, umerket. */
  function tableRows(older, newer) {
    function plain(rows, side) {
      return rows.map(function (r) {
        var cell = [{ t: '=', s: r.text }];
        return { label: r.label, note: r.note, group: r.group, when: r.when,
                 newer: side === 'newer' ? cell : null, older: side === 'older' ? cell : null };
      });
    }
    if (!older) return plain(newer.rows, 'newer');
    if (!newer) return plain(older.rows, 'older');
    if (older.format !== newer.format) {
      var whole = function (rows) {
        return [{ t: '=', s: rows.map(function (r) { return r.label + '\n\n' + r.text; }).join('\n\n') }];
      };
      return [{ label: t('whole-text'), note: '', newer: whole(newer.rows), older: whole(older.rows) }];
    }
    return diffRows(older.rows, newer.rows).map(function (r) {
      var keep = function (type) {
        return r.parts.filter(function (p) { return p.t === '=' || p.t === type; });
      };
      var same = r.parts.every(function (p) { return p.t === '='; });
      return {
        label: r.label, note: r.note, group: r.group, when: r.when,
        newer: r.change === '-' ? null : keep('+'),
        older: r.change === '+' ? null : (same ? 'same' : keep('-'))
      };
    });
  }

  function textCell(parts) {
    var cell = el('div', 'promptcmp__text');
    parts.forEach(function (p) {
      if (p.t === '=') { cell.appendChild(document.createTextNode(p.s)); return; }
      /* Mellomrom før og etter står utenfor merkingen, så den bare går
         over ordene som faktisk er ulike. */
      var m = p.s.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (m[1]) cell.appendChild(document.createTextNode(m[1]));
      if (m[2]) cell.appendChild(el(p.t === '+' ? 'ins' : 'del', null, m[2]));
      if (m[3]) cell.appendChild(document.createTextNode(m[3]));
    });
    return cell;
  }

  /* Sammenlikningen som ÉN tabell per kort (Vidar, 2026-10-02): stikkordet
     til venstre, den nyere teksten i midten, den eldre til høyre, rad for
     rad — slik at `tone` står ved siden av `tone` og ikke forskjøvet av det
     som står over den. Kolonneoverskriftene, med versjonsvelgerne, står
     utenfor rullen og er alltid synlige. */
  /* diffRows() bærer bare stikkord, merknad, gruppe og betingelse; resten av
     en rads opplysninger hentes her fra den nyere (eller eldre) releasens
     rad med samme stikkord. */
  function enrich(rows, newer, older) {
    var by = {};
    (older ? older.rows : []).concat(newer ? newer.rows : []).forEach(function (r) { by[r.label] = r; });
    rows.forEach(function (r) {
      var src = by[r.label] || {};
      ['desc', 'ref', 'tag', 'alt', 'same', 'noteRef'].forEach(function (k) {
        if (r[k] == null && src[k] != null) r[k] = src[k];
      });
    });
    return rows;
  }

  function compareCard(opts) {
    var box = el('section', 'promptdoc promptdoc--compare');
    box.setAttribute('data-card', opts.id);
    box.id = 'card-' + opts.id;

    var head = el('header', 'promptdoc__head');
    head.appendChild(el('h3', 'promptdoc__title', opts.title));
    if (opts.meta) head.appendChild(el('p', 'promptdoc__meta', opts.meta));
    box.appendChild(head);
    if (opts.about) box.appendChild(el('p', 'promptdoc__about', opts.about));
    if (opts.control) box.appendChild(opts.control);

    var cols = el('div', 'promptcmp promptcmp--head');
    cols.appendChild(el('div', 'promptcmp__corner'));
    [[opts.newTag, 'col-newer', opts.newVersions], [opts.oldTag, 'col-older', opts.oldVersions]]
      .forEach(function (c) {
        var cell = el('div', 'promptcmp__colhead');
        cell.appendChild(el('span', null, fill(c[1], { tag: c[0] })));
        if (c[2]) cell.appendChild(c[2]);
        cols.appendChild(cell);
      });
    box.appendChild(cols);

    if (opts.status) box.appendChild(el('p', 'promptdoc__status', opts.status));
    if (!opts.rows.length) return box;

    var reveal = revealFor(opts.id);
    var toggle = el('summary', 'promptdoc__toggle');
    toggle.appendChild(el('span', 'promptdoc__toggle-show', t('show-prompt')));
    toggle.appendChild(el('span', 'promptdoc__toggle-hide', t('hide-prompt')));
    toggle.appendChild(el('span', 'promptdoc__count', opts.rows.length === 1
      ? t('section-count-one')
      : t('section-count').replace('{n}', opts.rows.length)));
    reveal.appendChild(toggle);
    box.appendChild(reveal);

    var grid = el('div', 'promptcmp');
    var group = null;
    opts.rows.forEach(function (row) {
      /* En rad uten gruppe (en seksjon bare den eldre releasen har, fra før
         gruppene) står i gruppa den havner i, og bryter den ikke. */
      if (row.group && row.group !== group) {
        grid.appendChild(el('div', 'promptcmp__group', row.group));
        group = row.group;
      }
      var key = el('div', 'promptcmp__key');
      keyParts(key, row);
      grid.appendChild(key);
      [[row.newer, opts.newTag], [row.older, opts.oldTag]].forEach(function (c) {
        var cell;
        if (c[0] === null) cell = el('div', 'promptcmp__text promptcmp__none', fill('not-in', { tag: c[1] }));
        else if (c[0] === 'same') cell = el('div', 'promptcmp__text promptcmp__none', t('no-change-plain'));
        else if (row.desc) {
          cell = el('div', 'promptcmp__text');
          filledCell(cell, row);
        }
        else cell = textCell(c[0]);
        /* På en telefon står cellene under hverandre; da sier denne hvilken
           release teksten er fra. */
        cell.setAttribute('data-tag', c[1]);
        grid.appendChild(cell);
      });
    });
    reveal.appendChild(grid);
    return box;
  }

  function sameRows(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].label !== b[i].label || a[i].note !== b[i].note || a[i].text !== b[i].text ||
          (a[i].group || '') !== (b[i].group || '')) return false;
    }
    return true;
  }

  /* ---- hele sida -------------------------------------------------------- */

  /* Språkfilene har ikke eget versjonsnummer, så der sier kortet bare at
     ingenting er endret. */
  function noChange(tag, id) {
    var e = entryFor(releaseOf(tag), id);
    return e && e.version ? fill('no-change', { v: 'v' + e.version }) : t('no-change-plain');
  }

  function render() {
    if (!root || !state.history) return;
    var ticket = ++drawn;
    var tags = state.compare ? [state.compare, state.release] : [state.release];
    var code = state.code;
    var live = state.liveLang[code] ? Promise.resolve() :
      getJson('/assets/languages/' + code + '.json').then(function (d) { state.liveLang[code] = d; }, function () {});
    Promise.all(tags.map(loadRelease).concat([live])).then(function (rels) {
      rels = rels.slice(0, tags.length);
      if (ticket !== drawn) return;
      draw(rels);
    }).catch(failed);
  }

  function draw(rels) {
    /* Lagvelgerne står inne i kort som tegnes om, så de rives ut og settes
       inn igjen ved hvert bytte. Hadde en av dem tastaturfokus, skal den ha
       det etterpå også — ellers ender den som velger med å miste stedet sitt. */
    var focusRow = [langRow, familyRow].filter(function (r) {
      return r && r.contains(document.activeElement);
    })[0];
    var focusSel = document.activeElement && document.activeElement.getAttribute &&
      document.activeElement.getAttribute('data-focus-key');

    drawBar();
    root.innerHTML = '';
    root.classList.toggle('promptcompare', rels.length === 2);

    if (rels.length === 2) {
      root.appendChild(compareHead());
    }

    cardIds(rels).forEach(function (id) {
      var controls = { language: langRow, family: familyRow }[id] || null;
      if (id === 'keywords') {
        var kv = keywordsView();
        root.appendChild(card({ id: id, title: kv.title, about: kv.about, rows: kv.rows }));
        return;
      }
      if (rels.length === 1) {
        var v = view(rels[0], id);
        if (!v) return;
        var noFamily = id === 'family' && !state.familyCode;
        root.appendChild(card({
          id: id, title: v.title, meta: v.meta, about: v.about, rows: v.rows,
          control: controls, status: v.status,
          versions: noFamily ? null : versionSelect(id, v.title, rels[0].tag, function (tag) { setRelease(tag); })
        }));
        return;
      }

      var older = view(rels[0], id), newer = view(rels[1], id);
      var main = newer || older;
      if (id === 'family' && !state.familyCode) {
        root.appendChild(card({ id: id, title: main.title, meta: main.meta, about: main.about,
                                control: controls, status: main.status, rows: [] }));
        return;
      }
      root.appendChild(compareCard({
        id: id, title: main.title, meta: main.meta, about: main.about,
        control: controls,
        newTag: rels[1].tag, oldTag: rels[0].tag,
        newVersions: versionSelect(id, main.title, rels[1].tag, function (tag) { setPair(state.compare, tag); }),
        oldVersions: versionSelect(id, main.title, rels[0].tag, function (tag) { setPair(tag, state.release); }),
        status: !newer ? fill('not-in', { tag: rels[1].tag })
          : !older ? fill('not-in', { tag: rels[0].tag })
          : sameRows(older.rows, newer.rows) ? noChange(rels[0].tag, id)
          : older.format !== newer.format ? t('format-changed')
          : '',
        rows: enrich(tableRows(older, newer), newer, older)
      }));
    });

    if (focusRow) {
      var btn = focusRow.querySelector('.lang-select__button');
      if (btn) btn.focus();
    } else if (focusSel) {
      var again = document.querySelector('[data-focus-key="' + focusSel + '"]');
      if (again) again.focus();
    }
  }

  function compareHead() {
    var legend = el('p', 'promptcompare__legend');
    legend.appendChild(document.createTextNode(t('legend-before') + ' '));
    legend.appendChild(el('ins', null, t('legend-added')));
    legend.appendChild(document.createTextNode(t('legend-middle') + ' '));
    legend.appendChild(el('del', null, t('legend-removed')));
    legend.appendChild(document.createTextNode(t('legend-after')));
    return legend;
  }

  /* ---- release-linja øverst ---------------------------------------------- */

  function releaseSelect(current, key, onPick) {
    var sel = el('select', 'promptbar__select');
    sel.setAttribute('data-focus-key', key);
    state.history.releases.forEach(function (r, i) {
      var label = r.tag + ' · ' + r.date + (i === 0 ? ' · ' + t('release-current') : '');
      var opt = el('option', null, label);
      opt.value = r.tag;
      sel.appendChild(opt);
    });
    sel.value = current;
    sel.addEventListener('change', function () { onPick(sel.value); });
    return sel;
  }

  function field(labelKey, control) {
    var lab = el('label', 'promptbar__field');
    lab.appendChild(el('span', 'promptbar__label', t(labelKey)));
    lab.appendChild(control);
    return lab;
  }

  function drawBar() {
    if (!bar) return;
    var focusKey = document.activeElement && bar.contains(document.activeElement) &&
      document.activeElement.getAttribute('data-focus-key');
    bar.innerHTML = '';
    if (state.compare) {
      bar.appendChild(field('newer-label', releaseSelect(state.release, 'newer', function (tag) {
        setPair(state.compare, tag);
      })));
      bar.appendChild(field('older-label', releaseSelect(state.compare, 'older', function (tag) {
        setPair(tag, state.release);
      })));
    } else {
      bar.appendChild(field('release-label', releaseSelect(state.release, 'release', setRelease)));
    }
    var btn = el('button', 'btn btn--ghost promptbar__compare', t(state.compare ? 'compare-off' : 'compare-on'));
    btn.type = 'button';
    btn.setAttribute('data-focus-key', 'compare');
    btn.setAttribute('aria-pressed', state.compare ? 'true' : 'false');
    btn.addEventListener('click', toggleCompare);
    bar.appendChild(btn);
    if (focusKey) {
      var again = bar.querySelector('[data-focus-key="' + focusKey + '"]');
      if (again) again.focus();
    }
  }

  /* ---- tilstanden ---------------------------------------------------------
     Står i adressefeltet (`?release=` og `?compare=`), slik at en lenke kan
     peke rett på en release eller på forskjellen mellom to — artikkelen
     siterer 0.18.2 og 0.20.0. Uten parametre viser sida releasen som er
     publisert nå. */

  function writeUrl() {
    try {
      var url = new URL(location.href);
      var newest = state.history.releases[0].tag;
      if (state.release === newest && !state.compare) url.searchParams.delete('release');
      else url.searchParams.set('release', state.release);
      if (state.compare) url.searchParams.set('compare', state.compare);
      else url.searchParams.delete('compare');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch (e) { /* en side uten adresse-API tegner likevel */ }
  }

  function setRelease(tag) {
    if (!releaseOf(tag)) return;
    state.release = tag;
    state.compare = null;
    writeUrl();
    render();
  }

  /* Venstre kolonne er alltid den nyere. Velger noen en eldre release der,
     bytter kolonnene plass. Samme
     release på begge sider er lov — da står det «ingen endring» overalt. */
  function setPair(older, newer) {
    if (!releaseOf(older) || !releaseOf(newer)) return;
    if (releaseIndex(older) < releaseIndex(newer)) { var x = older; older = newer; newer = x; }
    state.compare = older;
    state.release = newer;
    writeUrl();
    render();
  }

  /* Når sammenlikningen slås på, er den andre releasen den nærmeste eldre
     der noe sida viser faktisk er annerledes — den rett før er ofte en
     release som bare endret motoren. */
  function toggleCompare() {
    if (state.compare) { setRelease(state.release); return; }
    var list = state.history.releases;
    var i = releaseIndex(state.release);
    if (i === list.length - 1) i--;   // den eldste: sammenlikn med den neste
    var sig = signature(list[i]);
    var j = i + 1;
    while (j < list.length - 1 && signature(list[j]) === sig) j++;
    if (j >= list.length) j = list.length - 1;
    setPair(list[j].tag, list[i].tag);
  }

  function signature(r) {
    var parts = r.instructions.map(function (e) { return e.blob; });
    parts.push(r.shared ? r.shared.blob : '');
    r.families.forEach(function (f) { parts.push(f.blob); });
    r.languages.forEach(function (l) { parts.push(l.blob); });
    return parts.join(',');
  }

  function pickLanguage(code) {
    state.code = code;
    if (setLang) setLang(code);
    render();
    if (window.aistTrack) window.aistTrack('prompts_language', { prompt_language: code });
  }

  /* Hendelsen sendes bare når noen faktisk VELGER noe, ikke ved første
     tegning. (Merk at `prompts_language` sendes ved hver sidelasting også.
     De to tallene er derfor ikke sammenliknbare slik de står.) */
  function pickFamily(code) {
    state.familyCode = code;
    if (setFamily) setFamily(code);
    render();
    if (window.aistTrack) window.aistTrack('prompts_family', { prompt_family: code || 'none' });
  }

  function failed(err) {
    root.innerHTML = '';
    root.appendChild(el('p', 'note', t('load-failed') + ' ' + err.message));
  }

  /* ---- lagvelgerne ------------------------------------------------------
     Samme komponent som velgeren i toppbaren — samme klasser, samme
     tastaturoppførsel — men bygget her, fordi header.js eier nettstedets
     ramme og disse hører til sidas innhold. Det delte er CSS-en
     (`.lang-select` i css/components.css); to kontroller som skal se like ut
     skal ikke gjøre det ved et sammentreff. */

  function buildPicker(host, items, kind, onPick) {
    var conf = PICKERS[kind];
    var wrapper = el('div', 'lang-select');

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
    wrapper.appendChild(btn);

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
    wrapper.appendChild(menu);

    host.innerHTML = '';
    host.appendChild(wrapper);

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
      if (!wrapper.contains(e.target)) setMenu(false);
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
    bar = document.getElementById('prompt-bar');
    if (!root) return;

    var lp = pickerRow('lang-label');
    langRow = lp.row;
    langLabel = lp.label;
    setLang = buildPicker(lp.host, LANGS, 'lang', pickLanguage);
    setLang(state.code);

    getJson(BASE + 'index.json').then(function (history) {
      state.history = history;
      var params = new URLSearchParams(location.search);
      var newest = history.releases[0].tag;
      state.release = releaseOf(params.get('release')) ? params.get('release') : newest;
      if (releaseOf(params.get('compare'))) {
        var older = params.get('compare'), newer = state.release;
        if (releaseIndex(older) < releaseIndex(newer)) { state.release = older; older = newer; }
        state.compare = older;
      }

      /* Familiene i velgeren er alle som har funnets i en release, nyeste
         releases rekkefølge først. En familie som ikke finnes i releasen
         som vises, gir kortet «finnes ikke i». */
      var families = [], titles = {};
      history.releases.forEach(function (r) {
        r.families.forEach(function (f) {
          if (families.indexOf(f.code) === -1) families.push(f.code);
          if (!titles[f.code]) titles[f.code] = f.title || f.code;
        });
      });
      if (state.familyCode && families.indexOf(state.familyCode) === -1 && families.length) state.familyCode = families[0];

      var fp = pickerRow('family-label');
      familyRow = fp.row;
      familyLabel = fp.label;
      /* «Ingen fagfamilie» først: et tre uten `subjectFamily` får de
         generelle tekstene, og fra 0.25.0 er det eneste sted de vises for en
         seksjon en familie erstatter. */
      setFamily = buildPicker(fp.host, [{ code: '', name: t('family-none') }].concat(families.map(function (code) {
        return { code: code, name: titles[code] };
      })), 'family', pickFamily);
      setFamily(state.familyCode);

      render();
      if (window.aistTrack) window.aistTrack('prompts_language', { prompt_language: state.code });
    }).catch(failed);

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

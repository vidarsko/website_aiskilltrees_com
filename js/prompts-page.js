/* ==========================================================================
   prompts-page.js — /the-prompts/

   Viser instruksene slik de faktisk er skrevet, hentet fra maskineriet ved
   kjøring. Sida har med vilje ingen kopi av teksten: kilden er
   `prompts/`-filene, og en side som gjengir dem ville vært utdatert ved
   neste release uten at noen merket det.

   Formen er en halvtabell: stikkordet (seksjons-id-en, som er det
   ledeteksten selv kaller delen) til venstre, teksten under eller ved
   siden av. Det er den samme inndelingen som ligger i JSON-en, framfor en
   inndeling vi har funnet på for visningens skyld.

   SPRÅKLAGET VELGES I EN NEDTREKKSMENY, fordi det ellers blir for mye:
   hvert språk legger til sin egen `outputLanguage` og `writingStyle`, og
   alle tre på én gang drukner instruksene de hører til.
   ========================================================================== */

(function () {
  'use strict';

  var root, langSelect, state = { manifest: null, modules: {}, family: {}, lang: null };

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

  /* ---- én instruksmodul ------------------------------------------------ */

  function renderModule(id, entry, module, extras) {
    var card = el('section', 'promptdoc');

    var head = el('header', 'promptdoc__head');
    head.appendChild(el('h3', 'promptdoc__title', module.title || id));
    var meta = el('p', 'promptdoc__meta');
    var bits = ['v' + (module.version || '?')];
    if (entry.contribution) bits.push(t('contribution') + ' ' + entry.contribution);
    bits.push(t('audience-' + (entry.audience || 'student')));
    meta.textContent = bits.join(' · ');
    head.appendChild(meta);
    card.appendChild(head);

    if (module.intro) {
      card.appendChild(el('p', 'promptdoc__intro', module.intro));
    }

    var list = el('dl', 'promptdoc__sections');
    (module.order || Object.keys(module.sections || {})).forEach(function (sid) {
      var text = (module.sections || {})[sid];
      var label = (module.titles && module.titles[sid]) || sid;
      if (text == null) {
        /* En seksjon som står som null i modulen fylles av et annet lag -
           `outputLanguage` og `writingStyle` kommer fra språkfila. Det er
           verdt å vise AT den finnes, framfor å utelate den i stillhet. */
        var filler = (extras.lang || {})[sid];
        if (filler == null) return;
        appendSection(list, label, filler, t('from-language'));
        return;
      }
      appendSection(list, label, text, '');
    });

    (extras.family || []).forEach(function (add) {
      appendSection(list, add.id, add.text, t('from-family'));
    });
    (extras.overrides || []).forEach(function (o) {
      appendSection(list, o.id, o.text, t('from-language-override'));
    });

    card.appendChild(list);
    return card;
  }

  function appendSection(list, label, text, note) {
    var dt = el('dt', 'promptdoc__key');
    dt.appendChild(el('code', null, label));
    if (note) dt.appendChild(el('span', 'promptdoc__note', note));
    list.appendChild(dt);
    list.appendChild(el('dd', 'promptdoc__text', text));
  }

  /* ---- hele sida -------------------------------------------------------- */

  function render() {
    root.innerHTML = '';
    var m = state.manifest;
    var lang = state.lang || {};
    var langPrompt = lang.prompt || {};

    Object.keys(m.instructions).forEach(function (id) {
      var entry = m.instructions[id];
      var module = state.modules[entry.file];
      if (!module) return;
      var overrides = (langPrompt.overrides || {})[id] || {};
      var familyAdds = ((state.family.instructions || {})[id] || {}).add || [];
      root.appendChild(renderModule(id, entry, module, {
        lang: langPrompt,
        family: familyAdds,
        overrides: Object.keys(overrides).map(function (k) {
          return { id: k, text: overrides[k] };
        }),
      }));
    });

    var shared = state.modules[m.shared];
    if (shared) {
      root.appendChild(renderModule('shared', { audience: 'student' },
        Object.assign({ title: t('shared-title') }, shared), { lang: langPrompt }));
    }
  }

  function loadLanguage(code) {
    return Promise.all([
      getJson('/languages/' + code + '.json'),
      getJson('/prompts/' + (state.manifest.subjectFamilies || {}).mathematics),
    ]).then(function (parts) {
      state.lang = parts[0];
      state.family = parts[1] || {};
      render();
      if (window.aistTrack) window.aistTrack('prompts_language', { prompt_language: code });
    });
  }

  function init() {
    root = document.getElementById('prompt-list');
    langSelect = document.getElementById('prompt-language');
    if (!root) return;

    getJson('/prompts/manifest.json').then(function (manifest) {
      state.manifest = manifest;
      var files = [manifest.shared].concat(
        Object.keys(manifest.instructions).map(function (id) {
          return manifest.instructions[id].file;
        }));
      return Promise.all(files.map(function (file) {
        return getJson('/prompts/' + file).then(function (data) {
          state.modules[file] = data;
        }, function () {});
      }));
    }).then(function () {
      langSelect.addEventListener('change', function () {
        loadLanguage(langSelect.value);
      });
      return loadLanguage(langSelect.value || 'en');
    }).catch(function (err) {
      root.appendChild(el('p', 'note', t('load-failed') + ' ' + err.message));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

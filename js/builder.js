/* ==========================================================================
   builder.js — tre-byggeren på /make-your-own/.
   Inn: læreren slipper inn sin tree.csv. Ut: én HTML-fil med hele treet i.

   INGENTING LASTES OPP. Fila åpnes med FileReader i lærerens egen
   nettleser, og HTML-fila lages av den samme nettleseren. Det er ikke en
   formulering vi har valgt for å berolige noen — det er bokstavelig talt
   det som skjer, og det er grunnen til at siden verken trenger backend,
   konto eller databehandleravtale.

   FORHÅNDSVISNINGEN ER PRODUKTET. Rammen under viser ikke en egen
   gjengivelse av treet; den viser NØYAKTIG den fila som lastes ned, kjørt
   fra en blob-URL. Det som står på skjermen er det læreren får. Derfor
   finnes det heller ingen egen valideringskode her: motoren validerer
   allerede, og legger resultatet på window.AIST_EFFECTIVE_CONFIG.
   ========================================================================== */

(function () {
  'use strict';

  var REQUIRED_COLUMNS = ['id', 'type', 'topic', 'name', 'description',
                          'depends_on', 'aids', 'instruction'];

  var el = {};
  var source = { tree: null, exams: null, name: 'tree.csv' };
  var assets = null;     // lastes én gang, ved første bygg
  var lastHtml = null;
  var lastUrl = null;
  var lastConfig = null;

  function t(key, vars) {
    var text = (window.i18n && window.i18n.t) ? window.i18n.t(key) : key;
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
    });
  }

  function track(name, params) {
    if (window.aistTrack) window.aistTrack(name, params || {});
  }

  /* ---------------------------------------------------------------- */
  /* Å lese fila læreren rekker oss                                     */
  /* ---------------------------------------------------------------- */

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error(file.name)); };
      reader.readAsText(file, 'utf-8');
    });
  }

  function acceptFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    var jobs = list.map(function (file) {
      return readFile(file).then(function (text) { return { file: file, text: text }; });
    });
    return Promise.all(jobs).then(function (loaded) {
      loaded.forEach(function (item) {
        var name = item.file.name.toLowerCase();
        if (name.indexOf('exam') === 0 || name.indexOf('eksamen') === 0) {
          source.exams = item.text;
        } else {
          source.tree = item.text;
          source.name = item.file.name;
        }
      });
      return build();
    });
  }

  /* En feil i selve kolonnerekka er verdt å ta FØR motoren kjører, fordi
     motoren da ikke ville funnet en eneste node og læreren bare hadde
     sett et tomt tre. */
  function headerProblem(text) {
    var first = String(text).split(/\r?\n/)[0] || '';
    var cols = first.replace(/^﻿/, '').split(',').map(function (c) {
      return c.trim().replace(/^"|"$/g, '');
    });
    var missing = REQUIRED_COLUMNS.filter(function (c) { return cols.indexOf(c) === -1; });
    return missing.length ? missing : null;
  }

  /* ---------------------------------------------------------------- */
  /* Delene enkeltfila settes sammen av                                 */
  /* ---------------------------------------------------------------- */

  function getText(path) {
    return fetch(path).then(function (res) {
      if (!res.ok) throw new Error(path + ' (' + res.status + ')');
      return res.text();
    });
  }

  function getJson(path) {
    return getText(path).then(function (raw) { return JSON.parse(raw); });
  }

  function loadAssets() {
    if (assets) return Promise.resolve(assets);
    return Promise.all([
      getText('/assets/engine/standalone.html'),
      getText('/assets/engine/engine.js'),
      getText('/assets/engine/vendor/papaparse.min.js'),
      getText('/assets/engine/tokens.css'),
      getText('/css/tokens.css'),
      getText('/assets/engine/tree.css'),
      getJson('/assets/prompts/manifest.json'),
    ]).then(function (parts) {
      assets = {
        template: parts[0], engine: parts[1], papa: parts[2],
        css: parts[3] + '\n' + parts[4] + '\n' + parts[5],
        manifest: parts[6],
      };
      return assets;
    });
  }

  /* Nøklene her må være NØYAKTIG de stiene motoren spør etter - det er
     hele avtalen mellom AIST_BUNDLE og fetchJson()/fetchText(). */
  function loadBundle(config) {
    var manifest = assets.manifest;
    var files = ['/assets/prompts/' + manifest.shared];
    /* Bare elevens instrukser. Dekomponeringsmodellen og rammeteksten rundt
       den er lærerens verktøy, og ville lagt 27 kB til hver eneste
       nedlastede fil for tekst ingen elev åpner. Samme filter som motoren
       bruker - se `audience` i prompts/manifest.json. */
    Object.keys(manifest.instructions).forEach(function (id) {
      var entry = manifest.instructions[id];
      if ((entry.audience || 'student') !== 'student') return;
      files.push('/assets/prompts/' + entry.file);
    });
    var family = config.subjectFamily
      ? (manifest.subjectFamilies || {})[config.subjectFamily] : null;
    if (family) files.push('/assets/prompts/' + family);
    files.push('/assets/languages/' + (config.language || 'en') + '.json');

    return Promise.all(files.map(function (path) {
      return getJson(path).then(function (data) { return [path, data]; },
                                function () { return null; });
    })).then(function (pairs) {
      var bundle = {
        'tree.csv': source.tree,
        '/assets/prompts/manifest.json': manifest,
        /* Katalogens to filer finnes ikke for et tre en lærer har laget
           selv. De står som null framfor å mangle, slik at motoren får
           svaret sitt uten å gjøre et kall som feiler - en rød linje i
           konsollen for en fil som er valgfri, er nettopp den slags støy
           som får folk til å tro at noe er i stykker. */
        'meta.json': null,
        '/trees/vocabulary.json': null,
      };
      if (source.exams) bundle['exams.csv'] = source.exams;
      pairs.forEach(function (pair) { if (pair) bundle[pair[0]] = pair[1]; });
      return bundle;
    });
  }

  /* Leser config-radene godt nok til å vite hvilket språk og hvilken
     fagfamilie som skal pakkes med. Motoren gjør den EKTE lesningen;
     dette er bare nok til å velge filer. */
  function peekConfig(text) {
    var out = {};
    var rows = window.Papa.parse(text, { header: true, skipEmptyLines: true }).data || [];
    rows.forEach(function (row) {
      if ((row.type || '').trim().toLowerCase() !== 'config') return;
      var key = (row.name || '').trim();
      if (key === 'language' || key === 'subjectFamily' || key === 'title') {
        out[key] = (row.description || '').trim();
      }
    });
    return out;
  }

  function assemble(bundle) {
    return assets.template
      .replace('/*AIST:STYLES*/', function () { return assets.css; })
      .replace('/*AIST:PAPAPARSE*/', function () { return assets.papa; })
      .replace('/*AIST:BUNDLE*/', function () {
        /* </script> inne i en streng ville avsluttet script-taggen som
           omslutter den. Standardtrikset, og det gjelder all tekst som
           kommer fra læreren. */
        return 'window.AIST_BUNDLE = ' +
          JSON.stringify(bundle).replace(/<\//g, '<\\/') + ';';
      })
      .replace('/*AIST:ENGINE*/', function () { return assets.engine; });
  }

  /* ---------------------------------------------------------------- */
  /* Bygg, vis, og les av hva motoren mente om treet                    */
  /* ---------------------------------------------------------------- */

  function build() {
    if (!source.tree) return Promise.resolve();
    setState('working');

    var missing = headerProblem(source.tree);
    if (missing) {
      renderReport(null, [t('err-columns', { columns: missing.join(', ') })]);
      setState('error');
      return Promise.resolve();
    }

    return loadAssets()
      .then(function () { return loadBundle(peekConfig(source.tree)); })
      .then(assemble)
      .then(function (html) {
        lastHtml = html;
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        el.frame.src = lastUrl;
        return waitForEngine(el.frame);
      })
      .then(function (config) {
        lastConfig = config;
        renderReport(config, config.errors || []);
        setState(config.errors && config.errors.length ? 'warn' : 'ready');
        track('builder_build', {
          node_count: config.nodeCount,
          error_count: (config.errors || []).length,
          tree_language: config.language || '',
        });
      })
      .catch(function (err) {
        renderReport(null, [t('err-render', { message: err.message })]);
        setState('error');
      });
  }

  /* Rammen er samme opphav som sida (blob-URL-er arver opphavet til den
     som lager dem), så vi kan lese av motorens egen oppsummering rett
     ut av den. */
  function waitForEngine(frame) {
    return new Promise(function (resolve, reject) {
      var waited = 0;
      var timer = setInterval(function () {
        var win;
        try { win = frame.contentWindow; } catch (e) { win = null; }
        if (win && win.AIST_EFFECTIVE_CONFIG) {
          clearInterval(timer);
          resolve(win.AIST_EFFECTIVE_CONFIG);
          return;
        }
        waited += 100;
        if (waited > 20000) {
          clearInterval(timer);
          var shown = '';
          try { shown = (win.document.body.textContent || '').trim().slice(0, 300); } catch (e) {}
          reject(new Error(shown || t('err-timeout')));
        }
      }, 100);
    });
  }

  function setState(state) {
    el.panel.setAttribute('data-state', state);
    el.download.disabled = (state !== 'ready' && state !== 'warn');
  }

  /* ---------------------------------------------------------------- */
  /* «Slik forsto jeg innstillingene dine»                              */
  /* ---------------------------------------------------------------- */

  function renderReport(config, errors) {
    el.errors.innerHTML = '';
    el.stats.innerHTML = '';
    el.settings.innerHTML = '';
    el.copyErrors.hidden = !errors.length;

    if (errors.length) {
      var list = document.createElement('ul');
      list.className = 'checklist checklist--errors';
      errors.forEach(function (line) {
        var li = document.createElement('li');
        li.textContent = line;
        list.appendChild(li);
      });
      el.errors.appendChild(list);
      el.copyErrors.onclick = function () {
        var text = t('copy-preamble') + '\n\n' + errors.map(function (e) {
          return '- ' + e;
        }).join('\n');
        copy(text, el.copyErrors);
        track('builder_copy_errors', { error_count: errors.length });
      };
    }
    if (!config) return;

    /* Tallene er ikke pynt. Et tre der nesten hver node er uten
       forutsetninger er det vanligste utfallet når en språkmodell har
       skrevet ut pensum uten å gjøre forutsetningsarbeidet - og det er
       en feil ingen validator kan fange, fordi fila er helt i orden.
       Derfor står tallene der læreren ser dem, med en merknad når de
       peker den veien. */
    var flat = config.nodeCount > 12 &&
      (config.rootCount / config.nodeCount > 0.5 || config.depth <= 2);

    stat(t('stat-nodes'), config.nodeCount);
    stat(t('stat-skills'), config.skillCount + ' / ' + config.conceptCount,
         t('stat-skills-note'));
    stat(t('stat-topics'), config.topicOrder.length);
    stat(t('stat-depth'), config.depth);
    stat(t('stat-roots'), config.rootCount, flat ? t('stat-roots-flat') : '');

    setting(t('set-title'), config.title);
    setting(t('set-language'), config.languageName + ' (' + config.language + ')');
    setting(t('set-family'), config.subjectFamily || '—');
    setting(t('set-storage'), config.storageKey, t('set-derived'));
    setting(t('set-topicorder'), config.topicOrder.join(' → '),
            config.topicOrderDerived ? t('set-derived') : '');
    if (config.promptOverrides.length) {
      setting(t('set-prompts'), config.promptOverrides.join(', '));
    }
  }

  function stat(label, value, note) {
    var item = document.createElement('div');
    item.className = 'statline';
    item.innerHTML = '<span class="statline__value"></span>' +
                     '<span class="statline__label"></span>' +
                     '<span class="statline__note"></span>';
    item.querySelector('.statline__value').textContent = value;
    item.querySelector('.statline__label').textContent = label;
    item.querySelector('.statline__note').textContent = note || '';
    if (note) item.classList.add('statline--flagged');
    el.stats.appendChild(item);
  }

  function setting(label, value, note) {
    var row = document.createElement('div');
    row.className = 'setting';
    row.innerHTML = '<dt></dt><dd></dd>';
    row.querySelector('dt').textContent = label;
    row.querySelector('dd').textContent = value + (note ? '  ' + note : '');
    el.settings.appendChild(row);
  }

  function copy(text, button) {
    var done = function () {
      var old = button.textContent;
      button.textContent = t('copied');
      setTimeout(function () { button.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
    } else {
      fallback(text, done);
    }
  }

  function fallback(text, done) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(area);
  }

  function slugify(text) {
    return String(text).toLowerCase()
      .replace(/[æäà]/g, 'a').replace(/[øö]/g, 'o').replace(/å/g, 'a')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function download() {
    if (!lastHtml) return;
    /* Fila heter det treet heter, ikke det regnearket het. En lærer som
       laster ned tre trær skal ikke sitte med tree.html, tree (1).html
       og tree (2).html. */
    var base = (lastConfig && lastConfig.title) || source.name.replace(/\.csv$/i, '');
    var name = (slugify(base) || 'skill-tree') + '.html';
    var url = URL.createObjectURL(new Blob([lastHtml], { type: 'text/html' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    track('builder_download', { size_kb: Math.round(lastHtml.length / 1024) });
  }

  /* ---------------------------------------------------------------- */

  function init() {
    el.zone = document.getElementById('dropzone');
    if (!el.zone) return;
    el.input = document.getElementById('file-input');
    el.panel = document.getElementById('builder-panel');
    el.frame = document.getElementById('preview-frame');
    el.stats = document.getElementById('builder-stats');
    el.settings = document.getElementById('builder-settings');
    el.errors = document.getElementById('builder-errors');
    el.copyErrors = document.getElementById('copy-errors');
    el.download = document.getElementById('download-html');

    el.input.addEventListener('change', function () { acceptFiles(el.input.files); });
    el.zone.addEventListener('click', function () { el.input.click(); });
    el.zone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.input.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (type) {
      el.zone.addEventListener(type, function (e) {
        e.preventDefault(); el.zone.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      el.zone.addEventListener(type, function (e) {
        e.preventDefault(); el.zone.classList.remove('is-over');
      });
    });
    el.zone.addEventListener('drop', function (e) {
      acceptFiles(e.dataTransfer && e.dataTransfer.files);
    });
    el.download.addEventListener('click', download);

    loadAuthoringPrompt();

    document.querySelectorAll('[data-copy-target]').forEach(function (button) {
      button.addEventListener('click', function () {
        var target = document.getElementById(button.getAttribute('data-copy-target'));
        if (target) {
          copy(target.textContent.trim(), button);
          track('copy_instruction', { instruction_kind: 'authoring_prompt' });
        }
      });
    });
  }

  /* Ledeteksten læreren limer inn er SATT SAMMEN av to moduler i
     maskineri-repoet, på nøyaktig samme måte som elevens instruks settes
     sammen av sine: `authoring` er rammen rundt (hva læreren vil, hva sida
     gjør med fila, hva som kan endres, hva feilmeldingene betyr), og siste
     seksjonen i den leder over i `decomposition`, som er bidrag 1 i
     artikkelen.

     Den bor derfor IKKE på denne sida. Læreren skal gjøre nøyaktig det
     eleven gjør - lime inn én instruks i den chatten hen allerede bruker -
     og da må teksten være versjonert metode, ikke nettsidetekst. */
  function loadAuthoringPrompt() {
    var box = document.getElementById('authoring-prompt');
    if (!box) return;
    getJson('/assets/prompts/manifest.json').then(function (manifest) {
      var wrap = manifest.instructions.authoring;
      var appended = wrap && wrap.appends;
      return Promise.all([
        getJson('/assets/prompts/' + wrap.file),
        appended ? getJson('/assets/prompts/' + manifest.instructions[appended].file) : null,
      ]);
    }).then(function (parts) {
      box.textContent = composeAuthoringPrompt(parts[0], parts[1]);
    }, function () {
      /* Lar plassholderen stå. En tom boks er bedre enn en feilmelding om
         en fil leseren ikke visste fantes. */
    });
  }

  function composeAuthoringPrompt(wrapper, decomposition) {
    var out = wrapper.order.map(function (id) { return wrapper.sections[id]; })
                           .filter(Boolean);
    if (decomposition) {
      out.push('---');
      out.push('# ' + decomposition.title + '  (v' + decomposition.version + ')');
      out.push(decomposition.intro);
      decomposition.order.forEach(function (id, i) {
        out.push('## ' + (i + 1) + '. ' + decomposition.titles[id]);
        out.push(decomposition.sections[id]);
      });
    }
    return out.join('\n\n');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

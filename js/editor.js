/* ==========================================================================
   editor.js — redigeringsverktøyet på /make-your-own/.

   Et panel til venstre og treet til høyre. I «Rediger» klikker læreren på en
   node og endrer alt ved den; i «Vis» oppfører treet seg slik en elev ser
   det. Til slutt lastes regnearket eller hele treet ned.

   Veiene inn ligger i et vindu over verktøyet (#ed-overlay), med
   eksempeltreet uskarpt bak. Vinduet lukkes når læreren har åpnet et tre,
   men IKKE når hen kopierer ledeteksten: den læreren går til chatten og
   kommer tilbake med et regneark, og da er det vinduet hen trenger.

   GRENSEN FOR HVA SOM KAN ENDRES er regnearket, og bare det. Alt panelet gjør,
   er å endre rader i tree.csv: node-rader, config-rader og prompt-rader.
   Motoren, instruksmodulene og språkfilene endres ikke herfra — en lærer kan
   skrive om en seksjon av en instruks for sitt eget tre, men ikke kilden. Det
   er det som gjør at «tutor 1.6.0» fortsatt betyr noe, og at et tre får med
   seg en forbedret modul neste gang det bygges. Regnearket som lastes ned, er
   derfor nøyaktig det læreren ville skrevet for hånd.

   FORHÅNDSVISNINGEN ER PRODUKTET, som på /make-your-own/: treet til høyre er
   den fila som lastes ned, bygget av js/standalone.js og kjørt fra en
   blob-URL. Det finnes ingen egen validator her. Feilene er motorens egne,
   lest av window.AIST_EFFECTIVE_CONFIG. Det ene unntaket er at en
   forutsetning som ville gitt en sirkel avvises FØR den legges inn — det er
   ikke en validering av fila, men en knapp som ikke lar seg trykke.

   REGNEARKET BEHOLDER FORMEN SIN. Rader læreren ikke har rørt, skrives ut
   tegn for tegn slik de sto; bare en endret rad settes sammen på nytt.
   Endrer man én setning, er det én rad som er annerledes i fila, ikke alle.

   INGENTING LASTES OPP, og INGENTING LAGRES i nettleseren. Utkastet finnes
   bare i minnet, og siden advarer før den lukkes med endringer som ikke er
   lastet ned. Se /privacy/ — siden lover at ingenting lagres på enheten.
   ========================================================================== */

(function () {
  'use strict';

  var LANGUAGES = ['en', 'nb', 'sv'];   // språkfilene maskineriet har i dag
  var NODE_TYPES = ['skill', 'concept'];

  /* ---------------------------------------------------------------- */
  /* Tekst                                                              */
  /* ---------------------------------------------------------------- */

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
  /* Regnearket                                                         */
  /*                                                                    */
  /* Hver rad holder cellene sine OG teksten den ble lest fra. Så lenge  */
  /* raden ikke er endret, skrives teksten ut igjen uendret; en endret   */
  /* rad får `raw = null` og settes sammen av PapaParse.                 */
  /* ---------------------------------------------------------------- */

  function parseDoc(text) {
    var doc = { bom: false, newline: '\n', trailing: true, header: [], headerRaw: null, rows: [] };
    text = String(text || '');
    if (text.charCodeAt(0) === 0xFEFF) { doc.bom = true; text = text.slice(1); }
    doc.newline = text.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
    doc.trailing = /\n$/.test(text);
    var prev = 0;
    var first = true;
    window.Papa.parse(text, {
      step: function (res) {
        var cursor = res.meta.cursor;
        var raw = text.slice(prev, cursor).replace(/\r?\n$|\r$/, '');
        prev = cursor;
        var cells = (res.data || []).map(function (c) { return c == null ? '' : String(c); });
        if (first) {
          doc.header = cells.map(function (c) { return c.trim(); });
          doc.headerRaw = raw;
          first = false;
        } else {
          doc.rows.push({ cells: cells, raw: raw });
        }
      },
    });
    /* En avsluttende linjeskift gir en tom rad til slutt fra PapaParse. Den
       er ikke en rad i fila, bare slutten på den. */
    var last = doc.rows[doc.rows.length - 1];
    if (last && last.raw === '' && isBlankCells(last.cells)) doc.rows.pop();
    return doc;
  }

  function isBlankCells(cells) {
    return cells.every(function (c) { return !String(c).trim(); });
  }

  function serializeRow(doc, cells) {
    var padded = cells.slice();
    while (padded.length < doc.header.length) padded.push('');
    return window.Papa.unparse([padded], { newline: doc.newline });
  }

  function serialize(doc) {
    var lines = [doc.headerRaw != null ? doc.headerRaw : serializeRow(doc, doc.header)];
    doc.rows.forEach(function (row) {
      lines.push(row.raw != null ? row.raw : serializeRow(doc, row.cells));
    });
    return (doc.bom ? '﻿' : '') + lines.join(doc.newline) + (doc.trailing ? doc.newline : '');
  }

  function isBlank(row) {
    return row.cells.every(function (c) { return !String(c).trim(); });
  }

  function colIndex(doc, name) { return doc.header.indexOf(name); }

  function ensureColumn(doc, name) {
    var i = colIndex(doc, name);
    if (i !== -1) return i;
    doc.header.push(name);
    doc.headerRaw = null;
    doc.rows.forEach(function (row) {
      if (isBlank(row)) return;
      row.raw = null;
    });
    return doc.header.length - 1;
  }

  function get(row, name) {
    var i = colIndex(state.doc, name);
    return i === -1 ? '' : (row.cells[i] == null ? '' : String(row.cells[i]));
  }

  function set(row, name, value) {
    var i = ensureColumn(state.doc, name);
    while (row.cells.length <= i) row.cells.push('');
    if (row.cells[i] === value) return;
    row.cells[i] = value;
    row.raw = null;
  }

  function newRow() { return { cells: state.doc.header.map(function () { return ''; }), raw: null }; }

  function kind(row) { return get(row, 'type').trim().toLowerCase(); }
  function isConfig(row) { return kind(row) === 'config'; }
  function isPrompt(row) { return kind(row) === 'prompt'; }
  function isNode(row) { return !isBlank(row) && !isConfig(row) && !isPrompt(row) && !!get(row, 'id').trim(); }

  function nodeRows() { return state.doc.rows.filter(isNode); }
  function nodeRow(id) {
    return state.doc.rows.filter(function (r) { return isNode(r) && get(r, 'id').trim() === id; })[0] || null;
  }
  function deps(row) {
    return get(row, 'depends_on').split(';').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* Config- og prompt-rader står øverst, før nodene. En ny rad legges etter
     den siste av dem, så fila beholder den formen læreren kjenner. */
  function headInsertAt() {
    var at = 0;
    state.doc.rows.forEach(function (row, i) { if (isConfig(row) || isPrompt(row)) at = i + 1; });
    return at;
  }

  function configRow(key) {
    return state.doc.rows.filter(function (r) { return isConfig(r) && get(r, 'name').trim() === key; })[0] || null;
  }
  function configValue(key) {
    var row = configRow(key);
    return row ? get(row, 'description').trim() : '';
  }
  function setConfig(key, value) {
    var row = configRow(key);
    value = value == null ? '' : String(value);
    if (!value.trim()) {
      if (row) state.doc.rows.splice(state.doc.rows.indexOf(row), 1);
      return;
    }
    if (!row) {
      row = newRow();
      set(row, 'type', 'config');
      set(row, 'name', key);
      /* Etter den siste config-raden, ikke etter prompt-radene: innstillingene
         står samlet i fila læreren kjenner. */
      var at = 0;
      state.doc.rows.forEach(function (r, i) { if (isConfig(r)) at = i + 1; });
      if (!at) at = headInsertAt();
      state.doc.rows.splice(at, 0, row);
    }
    set(row, 'description', value);
  }
  function configKeys() {
    return state.doc.rows.filter(isConfig).map(function (r) { return get(r, 'name').trim(); });
  }

  function promptRow(topic, section) {
    return state.doc.rows.filter(function (r) {
      return isPrompt(r) && get(r, 'topic').trim() === topic && get(r, 'name').trim() === section;
    })[0] || null;
  }
  function setPrompt(topic, section, text) {
    var row = promptRow(topic, section);
    if (text == null) {
      if (row) state.doc.rows.splice(state.doc.rows.indexOf(row), 1);
      return;
    }
    if (!row) {
      row = newRow();
      set(row, 'type', 'prompt');
      set(row, 'topic', topic);
      set(row, 'name', section);
      state.doc.rows.splice(headInsertAt(), 0, row);
    }
    set(row, 'instruction', text);
  }

  /* ---------------------------------------------------------------- */
  /* Tilstand, angre og endringer                                       */
  /* ---------------------------------------------------------------- */

  var state = {
    doc: null,
    exams: null,
    fileName: 'tree.csv',
    mode: 'edit',          // 'edit' | 'view'
    tab: 'tree',           // 'tree' | 'node' | 'instructions' | 'settings' | 'look'
    selected: null,        // node-id
    picking: false,        // velger forutsetninger ved å klikke i treet
    instruction: 'node',
    editingSection: null,  // seksjons-id som har tekstfeltet åpent
    filter: '',
    history: [],
    future: [],
    lastKey: null,
    lastAt: 0,
    dirty: false,
    eff: null,             // AIST_EFFECTIVE_CONFIG fra forrige bygg
    notice: '',
  };

  var el = {};

  /* Én endring i fila. `key` slår sammen tastetrykk i samme felt til ett
     angre-steg, slik at Ctrl+Z tar bort ordet, ikke bokstaven. */
  function change(key, fn, opts) {
    var now = Date.now();
    var before = serialize(state.doc);
    if (!(key && key === state.lastKey && now - state.lastAt < 1500)) {
      state.history.push(before);
      if (state.history.length > 200) state.history.shift();
    }
    state.lastKey = key;
    state.lastAt = now;
    state.future = [];
    fn();
    if (serialize(state.doc) === before) return;
    state.dirty = true;
    if (!opts || !opts.quiet) renderPanel();
    renderUndo();
    scheduleBuild(opts && opts.now ? 0 : 350);
  }

  function undo() {
    if (!state.history.length) return;
    state.future.push(serialize(state.doc));
    state.doc = parseDoc(state.history.pop());
    state.lastKey = null;
    afterRestore();
  }

  function redo() {
    if (!state.future.length) return;
    state.history.push(serialize(state.doc));
    state.doc = parseDoc(state.future.pop());
    state.lastKey = null;
    afterRestore();
  }

  function afterRestore() {
    state.dirty = true;
    if (state.selected && !nodeRow(state.selected)) state.selected = null;
    renderPanel();
    renderUndo();
    scheduleBuild(0);
  }

  /* ---------------------------------------------------------------- */
  /* Å åpne et tre                                                      */
  /* ---------------------------------------------------------------- */

  function openText(tree, exams, name, background) {
    state.isExample = name === 'example';
    state.doc = parseDoc(tree);
    state.exams = exams || null;
    state.fileName = name || 'tree.csv';
    state.history = [];
    state.future = [];
    state.selected = null;
    state.picking = false;
    state.dirty = false;
    state.eff = null;
    /* Eksempeltreet bak vinduet er ikke et tre noen har bygget. */
    state.counted = !!background;
    state.tab = 'tree';
    state.editingSection = null;
    /* Et nytt tre skal ikke arve zoomen til det forrige. */
    el.frames.forEach(function (f) { f.removeAttribute('src'); });
    if (!background) hideOverlay();
    renderPanel();
    renderUndo();
    scheduleBuild(0);
  }

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
    if (!list.length) return;
    Promise.all(list.map(function (f) {
      return readFile(f).then(function (text) { return { file: f, text: text }; });
    })).then(function (loaded) {
      var tree = null, exams = null, name = 'tree.csv', bad = null;
      loaded.forEach(function (item) {
        var lower = item.file.name.toLowerCase();
        if (/\.html?$/.test(lower)) {
          var got = window.AistStandalone.extractFromHtml(item.text);
          if (got) { tree = got.tree; exams = got.exams || exams; name = 'tree.csv'; }
          else bad = item.file.name;
        } else if (lower.indexOf('exam') === 0 || lower.indexOf('eksamen') === 0) {
          exams = item.text;
        } else {
          tree = item.text;
          name = item.file.name;
        }
      });
      if (!tree) {
        showStartError(bad ? t('start-html-bad', { name: bad }) : t('start-no-tree'));
        return;
      }
      if (!confirmDiscard()) return;
      openText(tree, exams, name);
    });
  }

  /* Regnearket kommer oftest som tekst i en KI-chat. Det som limes inn,
     kan ha prat rundt seg, et ```csv-gjerde, eller - kopiert fra en tabell
     chatten har tegnet - tabulatorer eller markdown-streker i stedet for
     komma. Alt det ryddes bort her; resten er det samme som en sluppet fil. */
  var HEADER_LINE = /^\s*\|?\s*"?id"?\s*[,\t|;]\s*"?type"?\s*[,\t|;]/i;

  function treeFromPasted(text) {
    text = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var lines = text.split('\n');
    var start = -1;
    for (var i = 0; i < lines.length; i++) {
      if (HEADER_LINE.test(lines[i])) { start = i; break; }
    }
    if (start === -1) return null;
    lines = lines.slice(start);
    /* Et gjerde etter tabellen avslutter den, og det som står etter, er prat. */
    var end = lines.findIndex(function (l) { return /^\s*(```|~~~)/.test(l); });
    if (end !== -1) lines = lines.slice(0, end);
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    var header = lines[0];
    var rows;
    if (/^\s*\|/.test(header)) {
      rows = lines.filter(function (l) { return /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|?\s*$/.test(l); })
        .map(function (l) {
          return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) {
            return c.trim().replace(/\\\|/g, '|');
          });
        });
    } else if (header.indexOf('\t') !== -1) {
      rows = window.Papa.parse(lines.join('\n'), { delimiter: '\t' }).data;
    } else if (header.indexOf(',') === -1 && header.indexOf(';') !== -1) {
      rows = window.Papa.parse(lines.join('\n'), { delimiter: ';' }).data;
    }
    if (rows) {
      rows = rows.filter(function (r) { return r.length && !isBlankCells(r); });
      return window.Papa.unparse(rows, { newline: '\n' }) + '\n';
    }
    return lines.join('\n') + '\n';
  }

  function acceptPasted(text) {
    var tree = treeFromPasted(text);
    if (!tree) { showStartError(t('paste-not-tree')); return false; }
    if (!confirmDiscard()) return false;
    showStartError('');
    el.pasteArea.value = '';
    el.paste.hidden = true;
    openText(tree, null, 'tree.csv');
    return true;
  }

  function showPasteBox() {
    el.paste.hidden = false;
    el.pasteArea.focus();
  }

  function openUrl(treeUrl, examsUrl, background, name) {
    if (!background && !confirmDiscard()) return;
    fetch(treeUrl).then(function (res) {
      if (!res.ok) throw new Error(treeUrl);
      return res.text();
    }).then(function (tree) {
      /* exams.csv hentes bare når treet sier at den finnes, som motoren gjør:
         en 404 for en valgfri fil er en rød linje i konsollen og ingenting
         annet. */
      var wantsExams = /^[^\n]*,config,[^,\n]*,features\.exams,\s*true/m.test(tree);
      var exams = examsUrl && wantsExams
        ? fetch(examsUrl).then(function (r) { return r.ok ? r.text() : null; }, function () { return null; })
        : Promise.resolve(null);
      return exams.then(function (ex) { openText(tree, ex, name || 'tree.csv', background); });
    }).catch(function () {
      showStartError(t('start-fetch-failed'));
    });
  }

  function startBlank() {
    if (!confirmDiscard()) return;
    var lang = (window.i18n && window.i18n.lang) || 'en';
    var rows = [
      'id,type,topic,name,description,depends_on,aids,instruction',
      ',config,,title,' + csvCell(t('blank-title')) + ',,,',
      ',config,,language,' + lang + ',,,',
      'first-node,concept,' + csvCell(t('blank-topic')) + ',' + csvCell(t('blank-node')) + ',' +
        csvCell(t('blank-node-description')) + ',,,',
    ];
    openText(rows.join('\n') + '\n', null, 'tree.csv');
  }

  function csvCell(text) {
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function confirmDiscard() {
    return !state.dirty || window.confirm(t('confirm-discard'));
  }

  function showStartError(text) {
    el.startError.textContent = text;
    el.startError.hidden = !text;
  }

  /* ---------------------------------------------------------------- */
  /* Forhåndsvisningen                                                  */
  /*                                                                    */
  /* To rammer oppå hverandre. Et nytt bygg lastes i den som ikke vises, */
  /* og byttes inn først når motoren er ferdig. Uten det ville treet      */
  /* blinket hvitt for hvert tastetrykk. Zoom og scroll tas med over.     */
  /* ---------------------------------------------------------------- */

  var buildTimer = null;
  var buildSeq = 0;
  var urls = [null, null];
  var live = 0;

  function scheduleBuild(delay) {
    clearTimeout(buildTimer);
    buildTimer = setTimeout(build, delay);
  }

  function build() {
    if (!state.doc) return;
    var seq = ++buildSeq;
    var csv = serialize(state.doc);
    el.stage.setAttribute('data-busy', 'true');
    window.AistStandalone.build(csv, state.exams).then(function (html) {
      if (seq !== buildSeq) return null;
      state.html = html;
      var next = 1 - live;
      var frame = el.frames[next];
      if (urls[next]) URL.revokeObjectURL(urls[next]);
      urls[next] = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      frame.src = urls[next];
      return window.AistStandalone.waitForEngine(frame, t('err-timeout')).then(function (eff) {
        if (seq !== buildSeq) return;
        carryView(el.frames[live], frame);
        wireFrame(frame);
        el.frames[live].classList.remove('is-live');
        frame.classList.add('is-live');
        live = next;
        state.eff = eff;
        el.stage.removeAttribute('data-busy');
        renderStatus();
        if (state.tab === 'instructions' || state.tab === 'settings' || state.tab === 'look' ||
            state.tab === 'tree') {
          if (!panelHasFocus()) renderPanel();
        }
        highlight();
        /* Én gang per åpnet tre, ikke per ombygging: treet bygges på nytt
           for hver pause i skrivingen, og det ville druknet tallet. */
        if (!state.counted) { state.counted = true; track('builder_build', {}); }
      });
    }).catch(function (err) {
      if (seq !== buildSeq) return;
      el.stage.removeAttribute('data-busy');
      state.eff = { errors: [t('err-render', { message: err.message })] };
      renderStatus();
    });
  }

  /* Et tekstfelt som har fokus skal ikke tegnes på nytt under læreren. */
  function panelHasFocus() {
    var a = document.activeElement;
    return !!(a && el.panel.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }

  function frameWin(frame) {
    try { return frame.contentWindow; } catch (e) { return null; }
  }

  function carryView(from, to) {
    var a = frameWin(from), b = frameWin(to);
    if (!b || !b.document) return;
    /* Første gang: hele treet i vinduet, som et utgangspunkt. */
    if (!a || !a.document || !a.document.getElementById('graph-scroll')) {
      try { if (typeof b.fitToView === 'function') b.fitToView(); } catch (e) {}
      return;
    }
    try {
      var box = a.document.getElementById('graph-container');
      var m = /scale\(([\d.]+)\)/.exec(box.style.transform || '');
      var zoom = m ? parseFloat(m[1]) : 1;
      var scroll = a.document.getElementById('graph-scroll');
      /* setZoom er en vanlig funksjon i motoren, og dermed en egenskap på
         rammens window. Den holder motorens eget zoomnivå i takt, slik at
         neste klikk på + ikke hopper tilbake til 100 %. */
      if (typeof b.setZoom === 'function') b.setZoom(zoom);
      var target = b.document.getElementById('graph-scroll');
      target.scrollLeft = scroll.scrollLeft;
      target.scrollTop = scroll.scrollTop;
    } catch (e) { /* forhåndsvisningen er pynt her; et tap av zoom er ikke en feil */ }
  }

  /* Klikk i treet. I «Vis» gjør vi ingenting — treet er elevens. I
     «Rediger» tar vi klikket før motoren får det, og velger noden i
     panelet i stedet for å åpne elevens detaljpanel. */
  function wireFrame(frame) {
    var win = frameWin(frame);
    if (!win || !win.document) return;
    var doc = win.document;
    var style = doc.createElement('style');
    style.textContent =
      'html[data-edit] .node-box.aist-selected { box-shadow: 0 0 0 3px var(--ink) inset; }' +
      'html[data-edit] .node-box.aist-dep { outline: 3px dashed var(--primary); outline-offset: 3px; }' +
      'html[data-edit] .node-box.aist-child { outline: 2px dotted var(--ink-3); outline-offset: 3px; }' +
      'html[data-edit][data-picking] .node-box { cursor: copy; }' +
      'html[data-edit] #detail-panel { display: none; }' +
      /* «Låst» er elevens framdrift. Den som redigerer, skal se alle nodene. */
      'html[data-edit] .node-box.locked { opacity: 1; }';
    doc.head.appendChild(style);

    var down = null;
    doc.addEventListener('mousedown', function (e) { down = { x: e.clientX, y: e.clientY }; }, true);
    doc.addEventListener('click', function (e) {
      if (state.mode !== 'edit') return;
      var box = e.target.closest && e.target.closest('.node-box');
      if (!box) return;
      /* Et klikk etter at kartet er dratt er panorering, ikke et valg. */
      if (down && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4) return;
      e.preventDefault();
      e.stopPropagation();
      var id = box.getAttribute('data-node-id');
      if (state.picking && state.selected && id !== state.selected) togglePrereq(state.selected, id);
      else selectNode(id, true);
    }, true);
    applyModeToFrame(frame);
  }

  function applyModeToFrame(frame) {
    var win = frameWin(frame);
    if (!win || !win.document) return;
    var root = win.document.documentElement;
    if (state.mode === 'edit') root.setAttribute('data-edit', '');
    else root.removeAttribute('data-edit');
    if (state.picking) root.setAttribute('data-picking', '');
    else root.removeAttribute('data-picking');
  }

  function highlight() {
    var frame = el.frames[live];
    var win = frameWin(frame);
    if (!win || !win.document) return;
    applyModeToFrame(frame);
    var row = state.selected ? nodeRow(state.selected) : null;
    var depIds = row ? deps(row) : [];
    var childIds = row ? nodeRows().filter(function (r) {
      return deps(r).indexOf(state.selected) !== -1;
    }).map(function (r) { return get(r, 'id').trim(); }) : [];
    win.document.querySelectorAll('.node-box').forEach(function (box) {
      var id = box.getAttribute('data-node-id');
      box.classList.toggle('aist-selected', id === state.selected);
      box.classList.toggle('aist-dep', depIds.indexOf(id) !== -1);
      box.classList.toggle('aist-child', childIds.indexOf(id) !== -1);
    });
  }

  function scrollToNode(id) {
    var win = frameWin(el.frames[live]);
    if (!win || !win.document) return;
    var box = win.document.querySelector('.node-box[data-node-id="' + cssEscape(id) + '"]');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }

  function cssEscape(s) {
    return (window.CSS && window.CSS.escape) ? window.CSS.escape(s) : String(s).replace(/"/g, '\\"');
  }

  /* ---------------------------------------------------------------- */
  /* Noder                                                              */
  /* ---------------------------------------------------------------- */

  function selectNode(id, fromGraph) {
    if (state.selected !== id) { state.notice = ''; state.idNotice = ''; }
    var other = state.selected !== id || state.tab !== 'node';
    state.selected = id;
    state.tab = 'node';
    renderPanel();
    if (other) el.body.scrollTop = 0;
    highlight();
    if (!fromGraph) scrollToNode(id);
  }

  /* Går det en vei fra `from` ned til `to` langs forutsetningene? Da vil en
     kant fra `to` til `from` lukke en sirkel. */
  function reaches(from, to) {
    var seen = {};
    var stack = [from];
    while (stack.length) {
      var cur = stack.pop();
      if (cur === to) return true;
      if (seen[cur]) continue;
      seen[cur] = true;
      var row = nodeRow(cur);
      if (row) stack = stack.concat(deps(row));
    }
    return false;
  }

  function togglePrereq(nodeId, depId) {
    var row = nodeRow(nodeId);
    if (!row) return;
    var list = deps(row);
    var at = list.indexOf(depId);
    if (at === -1) {
      if (reaches(depId, nodeId)) {
        state.notice = t('node-cycle', { dep: nameOf(depId), node: nameOf(nodeId) });
        renderPanel();
        return;
      }
      list.push(depId);
    } else {
      list.splice(at, 1);
    }
    state.notice = '';
    change(null, function () { set(row, 'depends_on', list.join(';')); }, { now: true });
    highlight();
  }

  function nameOf(id) {
    var row = nodeRow(id);
    return row ? (get(row, 'name').trim() || id) : id;
  }

  function slugify(text) {
    return String(text).toLowerCase()
      .replace(/[æäà]/g, 'a').replace(/[øö]/g, 'o').replace(/å/g, 'a')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function uniqueId(base) {
    base = slugify(base) || 'node';
    var id = base, n = 2;
    while (nodeRow(id)) id = base + '-' + (n++);
    return id;
  }

  function addNode(topic) {
    var id = uniqueId(t('new-node-name'));
    change(null, function () {
      var row = newRow();
      set(row, 'id', id);
      set(row, 'type', 'skill');
      set(row, 'topic', topic || '');
      set(row, 'name', t('new-node-name'));
      /* Etter den siste noden i samme tema, ellers sist i fila. */
      var at = state.doc.rows.length;
      state.doc.rows.forEach(function (r, i) {
        if (isNode(r) && get(r, 'topic').trim() === (topic || '')) at = i + 1;
      });
      state.doc.rows.splice(at, 0, row);
    }, { now: true });
    selectNode(id, false);
    var name = el.panel.querySelector('[data-field="name"]');
    if (name) { name.focus(); name.select(); }
  }

  function deleteNode(id) {
    var row = nodeRow(id);
    if (!row) return;
    var users = nodeRows().filter(function (r) { return deps(r).indexOf(id) !== -1; });
    var msg = users.length
      ? t('confirm-delete-used', { name: nameOf(id), n: users.length })
      : t('confirm-delete', { name: nameOf(id) });
    if (!window.confirm(msg)) return;
    change(null, function () {
      users.forEach(function (r) {
        set(r, 'depends_on', deps(r).filter(function (d) { return d !== id; }).join(';'));
      });
      state.doc.rows.splice(state.doc.rows.indexOf(row), 1);
    }, { now: true, quiet: true });
    state.selected = null;
    state.tab = 'tree';
    renderPanel();
  }

  /* En ny id skrives inn overalt der den gamle sto som forutsetning. Elevenes
     avhukinger er lagret per id, så den som alt har fila, mister framdriften
     på denne noden — det sier panelet før læreren gjør det. */
  function renameId(oldId, newId) {
    newId = slugify(newId);
    if (!newId || newId === oldId) return false;
    if (nodeRow(newId)) {
      state.idNotice = t('node-id-taken', { id: newId });
      renderPanel();
      return false;
    }
    change(null, function () {
      nodeRows().forEach(function (r) {
        var list = deps(r);
        if (list.indexOf(oldId) !== -1) {
          set(r, 'depends_on', list.map(function (d) { return d === oldId ? newId : d; }).join(';'));
        }
      });
      set(nodeRow(oldId), 'id', newId);
    }, { now: true, quiet: true });
    state.selected = newId;
    state.idNotice = '';
    renderPanel();
    return true;
  }

  /* Temaene i den rekkefølgen treet viser dem. */
  function topics() {
    var seen = [];
    var order = (state.eff && state.eff.topicOrder) || [];
    order.forEach(function (tp) { if (seen.indexOf(tp) === -1) seen.push(tp); });
    nodeRows().forEach(function (r) {
      var tp = get(r, 'topic').trim();
      if (seen.indexOf(tp) === -1) seen.push(tp);
    });
    return seen.filter(function (tp) {
      return nodeRows().some(function (r) { return get(r, 'topic').trim() === tp; });
    });
  }

  function moveTopic(topic, delta) {
    var list = topics();
    var i = list.indexOf(topic);
    var j = i + delta;
    if (i === -1 || j < 0 || j >= list.length) return;
    list.splice(i, 1);
    list.splice(j, 0, topic);
    change(null, function () { setConfig('topicOrder', list.join(';')); }, { now: true });
  }

  function renameTopic(topic) {
    var name = window.prompt(t('topic-rename-prompt'), topic);
    if (name == null) return;
    name = name.trim();
    if (!name || name === topic) return;
    change(null, function () {
      nodeRows().forEach(function (r) { if (get(r, 'topic').trim() === topic) set(r, 'topic', name); });
      var order = configValue('topicOrder');
      if (order) {
        setConfig('topicOrder', order.split(';').map(function (s) {
          return s.trim() === topic ? name : s.trim();
        }).join(';'));
      }
    }, { now: true });
  }

  /* ---------------------------------------------------------------- */
  /* Å bygge panelet                                                    */
  /* ---------------------------------------------------------------- */

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function field(label, control, hint, extraClass) {
    return h('label', { class: 'ed-field' + (extraClass ? ' ' + extraClass : '') }, [
      h('span', { class: 'ed-field__label', text: label }),
      control,
      hint ? h('span', { class: 'ed-field__hint', text: hint }) : null,
    ]);
  }

  function textInput(value, oninput, attrs) {
    var input = h('input', Object.assign({ type: 'text', class: 'ed-input' }, attrs || {}));
    input.value = value;
    input.addEventListener('input', function () { oninput(input.value); });
    return input;
  }

  function textArea(value, oninput, attrs) {
    var area = h('textarea', Object.assign({ class: 'ed-input ed-input--area', rows: 3 }, attrs || {}));
    area.value = value;
    autoGrow(area);
    area.addEventListener('input', function () { autoGrow(area); oninput(area.value); });
    return area;
  }

  function autoGrow(area) {
    requestAnimationFrame(function () {
      area.style.height = 'auto';
      area.style.height = Math.min(area.scrollHeight + 2, 480) + 'px';
    });
  }

  function select(options, value, onchange) {
    var s = h('select', { class: 'ed-input' });
    options.forEach(function (o) {
      var opt = h('option', { value: o.value, text: o.label });
      if (o.value === value) opt.selected = true;
      s.appendChild(opt);
    });
    s.addEventListener('change', function () { onchange(s.value); });
    return s;
  }

  function button(label, onclick, cls, attrs) {
    return h('button', Object.assign({ type: 'button', class: 'ed-btn' + (cls ? ' ' + cls : ''),
                                       text: label, onclick: onclick }, attrs || {}));
  }

  function renderPanel() {
    if (!state.doc) return;
    var scroll = el.body.scrollTop;
    el.body.innerHTML = '';
    el.app.setAttribute('data-mode', state.mode);
    el.modeButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.mode));
    });
    el.tabs.hidden = state.mode !== 'edit';
    el.tabs.querySelectorAll('[data-tab]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === state.tab));
    });

    if (state.mode === 'view') {
      el.body.appendChild(renderView());
    } else {
      var draw = { tree: renderTree, node: renderNode, instructions: renderInstructions,
                   settings: renderSettings, look: renderLook }[state.tab];
      el.body.appendChild(draw());
    }
    el.body.scrollTop = scroll;
    renderStatus();
    applyModeToFrame(el.frames[live]);
  }

  function renderUndo() {
    el.undo.disabled = !state.history.length;
    el.redo.disabled = !state.future.length;
  }

  /* ---- Vis ---------------------------------------------------------- */

  /* Tallene og innstillingene er ikke pynt. Et tre der nesten hver node er
     uten forutsetninger er det vanligste utfallet når en språkmodell har
     skrevet ut pensum uten å gjøre forutsetningsarbeidet - og det er en feil
     ingen validator kan fange, fordi fila er helt i orden. Terskelen er satt
     etter skjønn: over tolv noder, og mer enn halvparten uten forutsetninger
     eller to nivåer eller mindre. */
  function isFlat(eff) {
    return eff.nodeCount > 12 && (eff.rootCount / eff.nodeCount > 0.5 || eff.depth <= 2);
  }

  function settingsReport(eff) {
    var rows = [
      [t('rep-title'), eff.title],
      [t('rep-language'), eff.languageName + ' (' + eff.language + ')'],
      [t('rep-family'), eff.subjectFamily || '—'],
      [t('rep-decomposition'), eff.decompositionVersion ? 'v' + String(eff.decompositionVersion).replace(/^v/, '')
        : '— ' + t('set-decomposition-missing')],
      [t('rep-learner'), eff.learnerWord + ' (' + eff.learner + ')' + (eff.learnerDerived ? '  ' + t('set-derived') : '')],
      [t('rep-storage'), eff.storageKey + '  ' + t('set-derived')],
      [t('rep-topicorder'), (eff.topicOrder || []).join(' → ') + (eff.topicOrderDerived ? '  ' + t('set-derived') : '')],
    ];
    if ((eff.promptOverrides || []).length) rows.push([t('rep-prompts'), eff.promptOverrides.join(', ')]);
    return h('dl', { class: 'ed-report' }, rows.map(function (r) {
      return h('div', {}, [h('dt', { text: r[0] }), h('dd', { text: r[1] })]);
    }));
  }

  function renderView() {
    var eff = state.eff || {};
    var flat = eff.nodeCount != null && isFlat(eff);
    return h('div', { class: 'ed-section' }, [
      h('h2', { class: 'ed-title', text: eff.title || configValue('title') || '—' }),
      h('p', { class: 'ed-note', text: t('view-intro') }),
      eff.nodeCount != null ? h('dl', { class: 'ed-stats' }, [
        stat(eff.nodeCount, t('stat-nodes')),
        stat(eff.skillCount + ' / ' + eff.conceptCount, t('stat-skills')),
        stat((eff.topicOrder || []).length, t('stat-topics')),
        stat(eff.depth, t('stat-depth')),
        stat(eff.rootCount, t('stat-roots')),
      ]) : null,
      flat ? h('p', { class: 'ed-notice', role: 'status', text: t('stat-roots-flat') }) : null,
      eff.nodeCount != null ? h('h3', { class: 'ed-subhead', text: t('rep-settings') }) : null,
      eff.nodeCount != null ? h('p', { class: 'ed-note', text: t('rep-settings-note') }) : null,
      eff.nodeCount != null ? settingsReport(eff) : null,
      h('p', { class: 'ed-note', text: t('download-note') }),
      button(t('view-to-edit'), function () { setMode('edit'); }, 'ed-btn--primary'),
    ]);
  }

  function stat(value, label) {
    return h('div', { class: 'ed-stat' }, [
      h('dt', { text: String(value) }),
      h('dd', { text: label }),
    ]);
  }

  /* ---- Treet -------------------------------------------------------- */

  function renderTree() {
    var wrap = h('div', { class: 'ed-section' });
    wrap.appendChild(h('p', { class: 'ed-note', text: t('tree-intro') }));

    var search = textInput(state.filter, function (v) {
      state.filter = v;
      var list = wrap.querySelector('.ed-topics');
      list.replaceWith(topicList());
    }, { placeholder: t('tree-search'), 'aria-label': t('tree-search') });
    wrap.appendChild(search);
    wrap.appendChild(topicList());

    wrap.appendChild(h('div', { class: 'ed-row' }, [
      button(t('tree-new-topic'), function () {
        var name = window.prompt(t('tree-new-topic-prompt'), '');
        if (name && name.trim()) addNode(name.trim());
      }),
      configValue('topicOrder')
        ? button(t('tree-auto-order'), function () {
          change(null, function () { setConfig('topicOrder', ''); }, { now: true });
        }, 'ed-btn--quiet') : null,
    ]));
    return wrap;
  }

  function topicList() {
    var q = state.filter.trim().toLowerCase();
    var list = h('div', { class: 'ed-topics' });
    var all = topics();
    all.forEach(function (topic, ti) {
      var rows = nodeRows().filter(function (r) { return get(r, 'topic').trim() === topic; });
      var shown = rows.filter(function (r) {
        return !q || (get(r, 'name') + ' ' + get(r, 'id') + ' ' + get(r, 'description'))
          .toLowerCase().indexOf(q) !== -1;
      });
      if (q && !shown.length) return;
      var group = h('div', { class: 'ed-topic' }, [
        h('div', { class: 'ed-topic__head' }, [
          h('span', { class: 'ed-topic__name', text: topic || t('tree-no-topic') }),
          h('span', { class: 'ed-topic__count', text: String(rows.length) }),
          h('span', { class: 'ed-topic__actions' }, [
            button('←', function () { moveTopic(topic, -1); }, 'ed-btn--icon',
                   { title: t('topic-up'), 'aria-label': t('topic-up'), disabled: ti === 0 }),
            button('→', function () { moveTopic(topic, 1); }, 'ed-btn--icon',
                   { title: t('topic-down'), 'aria-label': t('topic-down'), disabled: ti === all.length - 1 }),
            button('✎', function () { renameTopic(topic); }, 'ed-btn--icon',
                   { title: t('topic-rename'), 'aria-label': t('topic-rename') }),
          ]),
        ]),
      ]);
      var ul = h('ul', { class: 'ed-nodes' });
      shown.forEach(function (r) {
        var id = get(r, 'id').trim();
        ul.appendChild(h('li', {}, [
          h('button', { type: 'button', class: 'ed-nodeitem', onclick: function () { selectNode(id, false); } }, [
            h('span', { class: 'ed-typedot ed-typedot--' + (kind(r) === 'concept' ? 'concept' : 'skill'),
                        'aria-hidden': 'true' }),
            h('span', { class: 'ed-nodeitem__name', text: get(r, 'name').trim() || id }),
            h('span', { class: 'ed-nodeitem__type', text: typeLabel(kind(r)) }),
          ]),
        ]));
      });
      group.appendChild(ul);
      group.appendChild(button(t('tree-add-node'), function () { addNode(topic); }, 'ed-btn--quiet ed-btn--small'));
      list.appendChild(group);
    });
    return list;
  }

  function typeLabel(type) {
    return type === 'concept' ? t('type-concept') : type === 'skill' ? t('type-skill') : type;
  }

  /* ---- Noden ------------------------------------------------------- */

  function renderNode() {
    var wrap = h('div', { class: 'ed-section' });
    var row = state.selected ? nodeRow(state.selected) : null;
    if (!row) {
      wrap.appendChild(h('p', { class: 'ed-empty', text: t('node-none') }));
      return wrap;
    }
    var id = get(row, 'id').trim();
    var key = function (f) { return 'node:' + id + ':' + f; };

    wrap.appendChild(h('div', { class: 'ed-row ed-row--between' }, [
      button('← ' + t('node-back'), function () { state.tab = 'tree'; renderPanel(); }, 'ed-btn--quiet ed-btn--small'),
      button(t('node-delete'), function () { deleteNode(id); }, 'ed-btn--danger ed-btn--small'),
    ]));

    wrap.appendChild(field(t('node-name'), textInput(get(row, 'name'), function (v) {
      change(key('name'), function () { set(row, 'name', v); }, { quiet: true });
    }, { 'data-field': 'name' })));

    var typeGroup = h('div', { class: 'ed-seg', role: 'group', 'aria-label': t('node-type') });
    NODE_TYPES.forEach(function (tp) {
      typeGroup.appendChild(button(typeLabel(tp), function () {
        change(null, function () { set(row, 'type', tp); }, { now: true });
      }, 'ed-seg__btn ed-seg__btn--' + tp, { 'aria-pressed': String(kind(row) === tp) }));
    });
    wrap.appendChild(h('div', { class: 'ed-field' }, [
      h('span', { class: 'ed-field__label', text: t('node-type') }), typeGroup,
      h('span', { class: 'ed-field__hint', text: t('node-type-hint') }),
    ]));

    var topicInput = textInput(get(row, 'topic'), function (v) {
      change(key('topic'), function () { set(row, 'topic', v); }, { quiet: true });
    }, { list: 'ed-topic-list' });
    var dl = h('datalist', { id: 'ed-topic-list' });
    topics().forEach(function (tp) { dl.appendChild(h('option', { value: tp })); });
    wrap.appendChild(field(t('node-topic'), h('span', {}, [topicInput, dl])));

    wrap.appendChild(field(t('node-description'), textArea(get(row, 'description'), function (v) {
      change(key('description'), function () { set(row, 'description', v); }, { quiet: true });
    }), kind(row) === 'concept' ? t('node-description-concept') : t('node-description-skill')));

    wrap.appendChild(prereqEditor(row, id));

    var levels = aidLevels();
    if (levels.length) {
      var have = get(row, 'aids').split(';').map(function (s) { return s.trim(); });
      var box = h('div', { class: 'ed-checks' });
      levels.forEach(function (lv) {
        var cb = h('input', { type: 'checkbox' });
        cb.checked = have.indexOf(String(lv.level)) !== -1;
        cb.addEventListener('change', function () {
          var next = levels.filter(function (l) {
            return l.level === lv.level ? cb.checked : have.indexOf(String(l.level)) !== -1;
          }).map(function (l) { return String(l.level); });
          change(null, function () { set(row, 'aids', next.join(';')); }, { now: true, quiet: true });
          have = next;
        });
        box.appendChild(h('label', { class: 'ed-check' }, [cb, ' ' + aidName(lv)]));
      });
      wrap.appendChild(h('div', { class: 'ed-field' }, [
        h('span', { class: 'ed-field__label', text: t('node-aids') }), box,
        h('span', { class: 'ed-field__hint', text: t('node-aids-hint') }),
      ]));
    }

    wrap.appendChild(field(t('node-instruction'), textArea(get(row, 'instruction'), function (v) {
      change(key('instruction'), function () { set(row, 'instruction', v); }, { quiet: true });
    }), t('node-instruction-hint')));

    var idInput = h('input', { type: 'text', class: 'ed-input', spellcheck: 'false' });
    idInput.value = id;
    idInput.addEventListener('change', function () {
      if (!renameId(id, idInput.value)) idInput.value = id;
    });
    wrap.appendChild(field(t('node-id'), idInput, t('node-id-hint'), 'ed-field--quiet'));
    if (state.idNotice) wrap.appendChild(h('p', { class: 'ed-notice', role: 'status', text: state.idNotice }));
    return wrap;
  }

  function prereqEditor(row, id) {
    var box = h('div', { class: 'ed-field' });
    box.appendChild(h('span', { class: 'ed-field__label', text: t('node-prereqs') }));
    var chips = h('ul', { class: 'ed-chips' });
    var list = deps(row);
    if (!list.length) chips.appendChild(h('li', { class: 'ed-chips__none', text: t('node-prereqs-none') }));
    list.forEach(function (d) {
      var known = !!nodeRow(d);
      chips.appendChild(h('li', { class: 'ed-chip' + (known ? '' : ' ed-chip--bad') }, [
        h('button', { type: 'button', class: 'ed-chip__name', text: known ? nameOf(d) : d,
                      title: known ? t('node-go-to') : t('node-prereq-unknown'),
                      onclick: function () { if (known) selectNode(d, false); } }),
        h('button', { type: 'button', class: 'ed-chip__x', text: '×', 'aria-label': t('node-prereq-remove'),
                      title: t('node-prereq-remove'), onclick: function () { togglePrereq(id, d); } }),
      ]));
    });
    box.appendChild(chips);
    if (state.notice) box.appendChild(h('p', { class: 'ed-notice', role: 'status', text: state.notice }));

    var others = nodeRows().filter(function (r) {
      var oid = get(r, 'id').trim();
      return oid !== id && list.indexOf(oid) === -1;
    });
    var picker = h('select', { class: 'ed-input', 'aria-label': t('node-prereq-add') });
    picker.appendChild(h('option', { value: '', text: t('node-prereq-add') }));
    others.forEach(function (r) {
      var oid = get(r, 'id').trim();
      var blocked = reaches(oid, id);
      picker.appendChild(h('option', { value: oid, disabled: blocked,
        text: (get(r, 'topic').trim() ? get(r, 'topic').trim() + ' · ' : '') + (get(r, 'name').trim() || oid) +
              (blocked ? '  (' + t('node-prereq-would-cycle') + ')' : '') }));
    });
    picker.addEventListener('change', function () { if (picker.value) togglePrereq(id, picker.value); });

    box.appendChild(h('div', { class: 'ed-row' }, [
      picker,
      button(state.picking ? t('node-pick-stop') : t('node-pick'), function () {
        state.picking = !state.picking;
        renderPanel();
        highlight();
      }, state.picking ? 'ed-btn--primary ed-btn--small' : 'ed-btn--small', { 'aria-pressed': String(state.picking) }),
    ]));
    box.appendChild(h('span', { class: 'ed-field__hint', text: state.picking ? t('node-pick-hint') : t('node-prereqs-hint') }));

    var children = nodeRows().filter(function (r) { return deps(r).indexOf(id) !== -1; });
    if (children.length) {
      box.appendChild(h('span', { class: 'ed-field__label ed-field__label--sub', text: t('node-needed-by') }));
      var ul = h('ul', { class: 'ed-chips' });
      children.forEach(function (r) {
        var cid = get(r, 'id').trim();
        ul.appendChild(h('li', { class: 'ed-chip ed-chip--plain' }, [
          h('button', { type: 'button', class: 'ed-chip__name', text: nameOf(cid),
                        onclick: function () { selectNode(cid, false); } }),
        ]));
      });
      box.appendChild(ul);
    }
    return box;
  }

  function aidLevels() {
    var levels = [];
    configKeys().forEach(function (k) {
      var m = /^aids\.(\d+)\.(name|student|model)$/.exec(k);
      if (!m) return;
      var n = parseInt(m[1], 10);
      if (!levels.some(function (l) { return l.level === n; })) levels.push({ level: n });
    });
    return levels.sort(function (a, b) { return a.level - b.level; });
  }

  function aidName(lv) {
    return configValue('aids.' + lv.level + '.name') ||
      ((configValue('aids.label') || t('aids-level')) + ' ' + lv.level);
  }

  /* ---- Instruksene ------------------------------------------------- */

  function renderInstructions() {
    var wrap = h('div', { class: 'ed-section' });
    var eff = state.eff;
    if (!eff || !eff.instructions) {
      wrap.appendChild(h('p', { class: 'ed-empty', text: t('instr-loading') }));
      return wrap;
    }
    wrap.appendChild(h('p', { class: 'ed-note', text: t('instr-intro') }));

    var picker = h('div', { class: 'ed-seg ed-seg--wrap', role: 'group' });
    eff.instructions.forEach(function (ins) {
      var changed = ins.sections.filter(function (s) { return s.override != null || s.overrideAll != null; }).length;
      picker.appendChild(button(instrTitle(ins) + (changed ? ' · ' + changed : ''), function () {
        state.instruction = ins.id;
        state.editingSection = null;
        renderPanel();
      }, 'ed-seg__btn', { 'aria-pressed': String(state.instruction === ins.id) }));
    });
    wrap.appendChild(picker);

    var ins = eff.instructions.filter(function (i) { return i.id === state.instruction; })[0] || eff.instructions[0];
    wrap.appendChild(h('p', { class: 'ed-meta', text: t('instr-version', { id: ins.id, version: ins.version }) }));

    ins.sections.forEach(function (sec) { wrap.appendChild(sectionCard(ins, sec)); });
    return wrap;
  }

  function instrTitle(ins) {
    var k = 'instr-name-' + ins.id;
    var name = t(k);
    return name === k ? ins.title : name;
  }

  function usedIn(sectionId) {
    return (state.eff.instructions || []).filter(function (i) {
      return i.sections.some(function (s) { return s.id === sectionId; });
    });
  }

  function sectionCard(ins, sec) {
    var own = sec.override != null;
    var all = !own && sec.overrideAll != null;
    var current = own ? sec.override : all ? sec.overrideAll : sec.text;
    var badges = [];
    if (own) badges.push(['changed', t('sec-changed')]);
    if (all) badges.push(['changed', t('sec-changed-all')]);
    if (sec.runtime) badges.push(['runtime', t('sec-runtime')]);
    if (sec.conditional) badges.push(['cond', t('sec-conditional')]);
    if (!own && !all && sec.source === 'language') badges.push(['src', t('sec-from-language')]);
    if (!own && !all && sec.source === 'family') badges.push(['src', t('sec-from-family')]);

    var card = h('article', { class: 'ed-sec' + (own || all ? ' ed-sec--changed' : '') }, [
      h('header', { class: 'ed-sec__head' }, [
        h('span', { class: 'ed-sec__id', text: sec.id }),
        h('span', { class: 'ed-sec__badges' }, badges.map(function (b) {
          return h('span', { class: 'ed-badge ed-badge--' + b[0], text: b[1] });
        })),
      ]),
    ]);

    if (state.editingSection === sec.id) {
      var area = textArea(current, function () {}, { rows: 6, 'aria-label': sec.id });
      var shared = usedIn(sec.id).length > 1;
      var everywhere = h('input', { type: 'checkbox' });
      everywhere.checked = all;
      card.appendChild(area);
      if (shared) {
        card.appendChild(h('label', { class: 'ed-check' }, [everywhere, ' ' + t('sec-apply-all', {
          list: usedIn(sec.id).map(instrTitle).join(', ') })]));
      }
      card.appendChild(h('div', { class: 'ed-row' }, [
        button(t('sec-save'), function () {
          var text = area.value;
          change(null, function () {
            if (shared && everywhere.checked) {
              setPrompt('', sec.id, text);
              setPrompt(ins.id, sec.id, null);
            } else {
              setPrompt(ins.id, sec.id, text);
            }
          }, { now: true, quiet: true });
          state.editingSection = null;
          renderPanel();
        }, 'ed-btn--primary ed-btn--small'),
        button(t('sec-cancel'), function () { state.editingSection = null; renderPanel(); }, 'ed-btn--quiet ed-btn--small'),
      ]));
      requestAnimationFrame(function () { area.focus(); });
      return card;
    }

    var body = h('div', { class: 'ed-sec__text' + (current ? '' : ' ed-sec__text--empty'),
                          text: current || t('sec-empty') });
    card.appendChild(body);
    if (current && current.length > 360) {
      body.classList.add('is-clamped');
      card.appendChild(button(t('sec-more'), function (e) {
        body.classList.toggle('is-clamped');
        e.target.textContent = body.classList.contains('is-clamped') ? t('sec-more') : t('sec-less');
      }, 'ed-btn--link'));
    }

    if (sec.runtime) {
      card.appendChild(h('p', { class: 'ed-field__hint',
        text: sec.id === 'nodeInstruction' ? t('sec-runtime-node') : t('sec-runtime-aids') }));
      return card;
    }
    var actions = h('div', { class: 'ed-row' }, [
      button(own || all ? t('sec-edit-again') : t('sec-edit'), function () {
        state.editingSection = sec.id; renderPanel();
      }, 'ed-btn--small'),
      own ? button(t('sec-reset'), function () {
        change(null, function () { setPrompt(ins.id, sec.id, null); }, { now: true, quiet: true });
      }, 'ed-btn--quiet ed-btn--small') : null,
      all ? button(t('sec-reset-all'), function () {
        change(null, function () { setPrompt('', sec.id, null); }, { now: true, quiet: true });
      }, 'ed-btn--quiet ed-btn--small') : null,
    ]);
    card.appendChild(actions);
    if (own || all) {
      var orig = h('details', { class: 'ed-sec__orig' }, [
        h('summary', { text: t('sec-published') }),
        h('div', { class: 'ed-sec__text', text: sec.text || t('sec-empty') }),
      ]);
      card.appendChild(orig);
    }
    return card;
  }

  /* ---- Innstillinger ------------------------------------------------ */

  var SETTINGS = [
    { group: 'set-group-about', fields: [
      { key: 'title', label: 'set-title', required: true },
      { key: 'description', label: 'set-description', area: true },
      { key: 'language', label: 'set-language', kind: 'language', required: true },
      { key: 'learner', label: 'set-learner', kind: 'learner' },
      { key: 'subjectFamily', label: 'set-family', kind: 'family', hint: 'set-family-hint' },
      { key: 'decompositionVersion', label: 'set-decomposition', hint: 'set-decomposition-hint' },
    ] },
    { group: 'set-group-course', note: 'set-group-course-note', fields: [
      { key: 'course', label: 'set-course' },
      { key: 'curriculum', label: 'set-curriculum' },
      { key: 'author', label: 'set-author' },
      { key: 'authorUrl', label: 'set-author-url' },
      { key: 'license', label: 'set-license' },
    ] },
    { group: 'set-group-buttons', fields: [
      { key: 'features.motivation', label: 'set-motivation', kind: 'bool', hint: 'set-motivation-hint' },
      { key: 'features.exams', label: 'set-exams', kind: 'bool', hint: 'set-exams-hint' },
    ] },
    { group: 'set-group-slots', note: 'set-group-slots-note', fields: [
      { key: 'slots.courseName', label: 'set-slot-course' },
      { key: 'slots.motivationSubject', label: 'set-slot-motivation' },
      { key: 'slots.expressionFocus', label: 'set-slot-expression', area: true, hint: 'set-slot-expression-hint' },
      { key: 'slots.courseSpecifics', label: 'set-slot-specifics', area: true, hint: 'set-slot-specifics-hint' },
    ] },
  ];

  function renderSettings() {
    var wrap = h('div', { class: 'ed-section' });
    var covered = ['topicOrder', 'aids.label', 'style.conceptColor', 'style.skillColor', 'style.font'];
    SETTINGS.forEach(function (group) {
      var fs = h('fieldset', { class: 'ed-group' }, [h('legend', { text: t(group.group) })]);
      if (group.note) fs.appendChild(h('p', { class: 'ed-note', text: t(group.note) }));
      group.fields.forEach(function (f) {
        covered.push(f.key);
        fs.appendChild(settingField(f));
      });
      wrap.appendChild(fs);
    });
    wrap.appendChild(aidsEditor());

    /* Alt annet som står i fila: layout.*, storageKey, languageName og det
       som måtte komme. Det vises som det er, slik at ingenting i fila er
       usynlig her, og så kan det endres eller fjernes. */
    var rest = configKeys().filter(function (k) {
      return covered.indexOf(k) === -1 && !/^aids\.\d+\./.test(k);
    });
    var fs = h('fieldset', { class: 'ed-group' }, [
      h('legend', { text: t('set-group-other') }),
      h('p', { class: 'ed-note', text: t('set-group-other-note') }),
    ]);
    rest.forEach(function (k) {
      fs.appendChild(h('div', { class: 'ed-kv' }, [
        h('span', { class: 'ed-kv__key', text: k }),
        textInput(configValue(k), function (v) {
          change('cfg:' + k, function () { setConfig(k, v); }, { quiet: true });
        }, { 'aria-label': k }),
        button('×', function () { change(null, function () { setConfig(k, ''); }, { now: true }); },
               'ed-btn--icon', { title: t('set-remove'), 'aria-label': t('set-remove') }),
      ]));
    });
    fs.appendChild(button(t('set-add'), function () {
      var k = window.prompt(t('set-add-prompt'), '');
      if (!k || !k.trim()) return;
      var v = window.prompt(t('set-add-value', { key: k.trim() }), '');
      if (v == null || !v.trim()) return;
      change(null, function () { setConfig(k.trim(), v.trim()); }, { now: true });
    }, 'ed-btn--small'));
    wrap.appendChild(fs);
    return wrap;
  }

  function settingField(f) {
    var value = configValue(f.key);
    var onText = function (v) { change('cfg:' + f.key, function () { setConfig(f.key, v); }, { quiet: true }); };
    var onPick = function (v) { change(null, function () { setConfig(f.key, v); }, { now: true, quiet: true }); };
    var control;
    var eff = state.eff || {};
    if (f.kind === 'bool') {
      var cb = h('input', { type: 'checkbox' });
      cb.checked = value === 'true';
      cb.addEventListener('change', function () { onPick(cb.checked ? 'true' : ''); });
      return h('div', { class: 'ed-field' }, [
        h('label', { class: 'ed-check' }, [cb, ' ' + t(f.label)]),
        f.hint ? h('span', { class: 'ed-field__hint', text: t(f.hint) }) : null,
      ]);
    } else if (f.kind === 'language') {
      var langs = LANGUAGES.slice();
      if (value && langs.indexOf(value) === -1) langs.push(value);
      control = select(langs.map(function (c) { return { value: c, label: t('lang-' + c) === 'lang-' + c ? c : t('lang-' + c) }; }),
                       value, onPick);
    } else if (f.kind === 'learner') {
      var opts = [{ value: '', label: t('set-default-for-language') }].concat((eff.learners || []).map(function (k) {
        return { value: k, label: k };
      }));
      if (value && !(eff.learners || []).some(function (k) { return k === value; })) opts.push({ value: value, label: value });
      control = select(opts, value, onPick);
    } else if (f.kind === 'family') {
      var fams = [{ value: '', label: t('set-family-none') }].concat((eff.subjectFamilies || []).map(function (k) {
        var label = t('family-' + k);
        return { value: k, label: label === 'family-' + k ? k : label };
      }));
      control = select(fams, value, onPick);
    } else if (f.area) {
      control = textArea(value, onText);
    } else {
      control = textInput(value, onText);
    }
    return field(t(f.label) + (f.required ? ' *' : ''), control, f.hint ? t(f.hint) : null);
  }

  function aidsEditor() {
    var fs = h('fieldset', { class: 'ed-group' }, [
      h('legend', { text: t('set-group-aids') }),
      h('p', { class: 'ed-note', text: t('set-group-aids-note') }),
    ]);
    fs.appendChild(field(t('set-aids-label'), textInput(configValue('aids.label'), function (v) {
      change('cfg:aids.label', function () { setConfig('aids.label', v); }, { quiet: true });
    }), t('set-aids-label-hint')));
    aidLevels().forEach(function (lv) {
      var n = lv.level;
      var box = h('div', { class: 'ed-level' }, [
        h('div', { class: 'ed-row ed-row--between' }, [
          h('strong', { text: aidName(lv) }),
          button(t('set-aids-remove'), function () {
            change(null, function () {
              ['name', 'student', 'model'].forEach(function (p) { setConfig('aids.' + n + '.' + p, ''); });
            }, { now: true });
          }, 'ed-btn--quiet ed-btn--small'),
        ]),
      ]);
      [['name', 'set-aids-name', false], ['student', 'set-aids-student', true], ['model', 'set-aids-model', true]]
        .forEach(function (p) {
          var k = 'aids.' + n + '.' + p[0];
          var ctl = p[2]
            ? textArea(configValue(k), function (v) { change('cfg:' + k, function () { setConfig(k, v); }, { quiet: true }); })
            : textInput(configValue(k), function (v) { change('cfg:' + k, function () { setConfig(k, v); }, { quiet: true }); });
          box.appendChild(field(t(p[1]), ctl));
        });
      fs.appendChild(box);
    });
    fs.appendChild(button(t('set-aids-add'), function () {
      var next = aidLevels().reduce(function (m, l) { return Math.max(m, l.level); }, 0) + 1;
      change(null, function () {
        setConfig('aids.' + next + '.student', t('set-aids-new-student'));
        setConfig('aids.' + next + '.model', t('set-aids-new-model'));
      }, { now: true });
    }, 'ed-btn--small'));
    return fs;
  }

  /* ---- Utseende ----------------------------------------------------- */

  function frameToken(name) {
    var win = frameWin(el.frames[live]);
    try { return win.getComputedStyle(win.document.documentElement).getPropertyValue(name).trim(); }
    catch (e) { return ''; }
  }

  function renderLook() {
    var wrap = h('div', { class: 'ed-section' });
    wrap.appendChild(h('p', { class: 'ed-note', text: t('look-intro') }));
    wrap.appendChild(colourField('style.conceptColor', t('look-concept'), '--primary', 12));
    wrap.appendChild(colourField('style.skillColor', t('look-skill'), '--amber', 40));

    var eff = state.eff || {};
    var fonts = eff.styleFonts || ['system'];
    var current = configValue('style.font') || 'system';
    var list = h('div', { class: 'ed-fonts', role: 'radiogroup', 'aria-label': t('look-font') });
    fonts.forEach(function (f) {
      var stack = frameToken('--font-' + f);
      var b = h('button', { type: 'button', class: 'ed-font', role: 'radio', 'aria-checked': String(current === f),
        onclick: function () {
          change(null, function () { setConfig('style.font', f === 'system' ? '' : f); }, { now: true });
        } }, [
        h('span', { class: 'ed-font__sample', text: t('look-font-sample'), style: stack ? 'font-family:' + stack : null }),
        h('span', { class: 'ed-font__name', text: t('look-font-' + f) }),
      ]);
      list.appendChild(b);
    });
    wrap.appendChild(h('div', { class: 'ed-field' }, [
      h('span', { class: 'ed-field__label', text: t('look-font') }), list,
      h('span', { class: 'ed-field__hint', text: t('look-font-hint') }),
    ]));
    return wrap;
  }

  function colourField(key, label, token, mix) {
    var value = configValue(key);
    var fallback = normHex(frameToken(token));
    var shown = normHex(value) || fallback || '';
    var picker = h('input', { type: 'color', class: 'ed-colour', 'aria-label': label });
    if (shown) picker.value = shown;
    var hex = h('input', { type: 'text', class: 'ed-input ed-input--hex', spellcheck: 'false', 'aria-label': label });
    hex.value = value || '';
    hex.placeholder = fallback || '#';
    var warn = h('span', { class: 'ed-field__hint ed-field__hint--warn', role: 'status' });
    function check(v) {
      warn.textContent = '';
      var c = normHex(v);
      var ink = normHex(frameToken('--ink'));
      var surface = normHex(frameToken('--surface')) || '#ffffff';
      if (!c || !ink) return;
      var ratio = contrast(ink, mixHex(c, surface, mix / 100));
      if (ratio < 4.5) warn.textContent = t('look-contrast', { ratio: ratio.toFixed(1) });
    }
    picker.addEventListener('input', function () {
      hex.value = picker.value;
      check(picker.value);
      change('cfg:' + key, function () { setConfig(key, picker.value); }, { quiet: true });
    });
    hex.addEventListener('input', function () {
      var c = normHex(hex.value);
      if (c) picker.value = c;
      check(hex.value);
      change('cfg:' + key, function () { setConfig(key, hex.value.trim()); }, { quiet: true });
    });
    check(value);
    return h('div', { class: 'ed-field' }, [
      h('span', { class: 'ed-field__label', text: label }),
      h('div', { class: 'ed-row' }, [
        picker, hex,
        value ? button(t('look-default'), function () {
          change(null, function () { setConfig(key, ''); }, { now: true });
        }, 'ed-btn--quiet ed-btn--small') : null,
      ]),
      warn,
    ]);
  }

  function normHex(v) {
    v = String(v || '').trim();
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
    if (!m) return '';
    var s = m[1];
    if (s.length === 3) s = s.split('').map(function (c) { return c + c; }).join('');
    return '#' + s.toLowerCase();
  }

  function rgb(hex) {
    return [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
  }

  function mixHex(a, b, share) {
    var x = rgb(a), y = rgb(b);
    return '#' + x.map(function (v, i) {
      return ('0' + Math.round(v * share + y[i] * (1 - share)).toString(16)).slice(-2);
    }).join('');
  }

  function luminance(hex) {
    var c = rgb(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /* ---------------------------------------------------------------- */
  /* Status, feil og nedlasting                                         */
  /* ---------------------------------------------------------------- */

  function renderStatus() {
    var eff = state.eff || {};
    var errors = eff.errors || [];
    el.errorCount.textContent = errors.length
      ? t(errors.length === 1 ? 'status-error-one' : 'status-errors', { n: errors.length })
      : (state.eff ? t('status-ok') : t('status-building'));
    el.status.setAttribute('data-errors', errors.length ? 'true' : 'false');
    if (!errors.length && state.eff && state.eff.nodeCount != null && isFlat(state.eff)) {
      el.errorCount.textContent = t('status-flat');
    }
    el.errorSummary.textContent = el.errorCount.textContent;
    el.errorCount.hidden = !!errors.length;
    el.errorList.innerHTML = '';
    errors.forEach(function (line) { el.errorList.appendChild(h('li', { text: line })); });
    el.errorDetails.hidden = !errors.length;
    el.downloadCsv.disabled = !state.doc;
    el.downloadHtml.disabled = !state.html;
    el.downloadExams.hidden = !state.exams;
  }

  function fileBase() {
    var title = (state.eff && state.eff.title) || configValue('title') || state.fileName.replace(/\.csv$/i, '');
    if (!/\S/.test(title)) title = 'skill-tree';
    return slugify(title) || 'skill-tree';
  }

  function save(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function setMode(mode) {
    state.mode = mode;
    state.picking = false;
    if (mode === 'view') {
      /* Elevens visning: ingen markering fra redigeringen i treet. */
      var win = frameWin(el.frames[live]);
      if (win && win.document) {
        win.document.querySelectorAll('.aist-selected,.aist-dep,.aist-child').forEach(function (b) {
          b.classList.remove('aist-selected', 'aist-dep', 'aist-child');
        });
      }
    }
    renderPanel();
    if (mode === 'edit') highlight();
  }

  /* ---------------------------------------------------------------- */
  /* Oppstart                                                           */
  /* ---------------------------------------------------------------- */

  /* ---------------------------------------------------------------- */
  /* Vinduet med veiene inn                                             */
  /* ---------------------------------------------------------------- */

  function showOverlay() {
    showStartError('');
    el.overlay.hidden = false;
    el.appWrap.inert = true;
    el.appWrap.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.add('ed-has-overlay');
    requestAnimationFrame(function () {
      var first = el.overlay.querySelector('#ed-copy-prompt');
      if (first) first.focus();
    });
  }

  function hideOverlay() {
    if (!state.doc) return;
    el.overlay.hidden = true;
    el.appWrap.inert = false;
    el.appWrap.removeAttribute('aria-hidden');
    document.documentElement.classList.remove('ed-has-overlay');
  }

  /* Ledeteksten læreren limer inn er SATT SAMMEN av to moduler i
     maskineri-repoet, på nøyaktig samme måte som elevens instruks settes
     sammen av sine: `authoring` er rammen rundt, og siste seksjonen i den
     leder over i `decomposition`, som er bidrag 1 i artikkelen. Den bor
     derfor ikke på denne sida: læreren gjør nøyaktig det eleven gjør,
     limer inn én instruks i den chatten hen allerede bruker, og da må
     teksten være versjonert metode, ikke nettsidetekst. */
  function loadAuthoringPrompt() {
    var box = document.getElementById('authoring-prompt');
    if (!box) return;
    var getJson = window.AistStandalone.getJson;
    getJson('/assets/prompts/manifest.json').then(function (manifest) {
      var wrap = manifest.instructions.authoring;
      var appended = wrap && wrap.appends;
      /* Alle fagfamiliene, ikke bare én: læreren som kopierer ledeteksten
         har ikke sagt hvilket fag det gjelder ennå, og en chatmodell kan
         ikke hente fila selv. Se `appendsSubjectFamilies` i manifestet. */
      var families = (wrap && wrap.appendsSubjectFamilies) ? manifest.subjectFamilies || {} : {};
      return Promise.all([
        getJson('/assets/prompts/' + wrap.file),
        appended ? getJson('/assets/prompts/' + manifest.instructions[appended].file) : null,
        Promise.all(Object.keys(families).map(function (key) {
          return getJson('/assets/prompts/' + families[key]).then(function (fam) {
            return { key: key, fam: fam };
          });
        })),
      ]);
    }).then(function (parts) {
      box.textContent = composeAuthoringPrompt(parts[0], parts[1], parts[2]);
      box.removeAttribute('data-i18n');   // ikke skriv plassholderen tilbake ved språkbytte
    }, function () { /* plassholderen blir stående */ });
  }

  /* Samme form som instruksene et tre setter sammen: stikkordet, kolon,
     teksten. */
  function composeAuthoringPrompt(wrapper, decomposition, families) {
    var out = sectionLines(wrapper);
    if (decomposition) {
      out.push('---');
      out.push('# ' + decomposition.title + '  (v' + decomposition.version + ')');
      out = out.concat(sectionLines(decomposition));
    }
    (families || []).forEach(function (item) {
      var block = (item.fam && item.fam.decomposition) || {};
      out.push('---');
      out.push('# subjectFamilies: ' + item.key + '  (' + (item.fam.title || item.key) +
               ', v' + (item.fam.version || '?') + ')');
      Object.keys(block).forEach(function (id) {
        if (id.charAt(0) === '_') return;
        out.push(id + ': ' + plainText(block[id]));
      });
    });
    return out.join('\n\n');
  }

  /* SOLO-tabellen i samfunnsfagfamilien er et objekt med en liste i seg.
     Den skrives ut som linjer modellen kan lese, framfor som JSON. Nøkler
     som starter med `_` er merknader, og tas ikke med. */
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

  function sectionLines(module) {
    return module.order.map(function (id) {
      var text = module.sections[id];
      return text ? id + ': ' + text : null;
    }).filter(Boolean);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }

  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(area);
  }

  function loadCatalogue() {
    window.AistStandalone.getJson('/trees/trees.json').then(function (index) {
      var slugs = index.trees || [];
      return Promise.all(slugs.map(function (slug) {
        return window.AistStandalone.getJson('/trees/' + slug + '/meta.json').then(function (m) {
          return { slug: slug, title: m.title || slug, exams: !!(m.features && m.features.exams) };
        }, function () { return { slug: slug, title: slug }; });
      }));
    }).then(function (list) {
      list.sort(function (a, b) { return a.title.localeCompare(b.title); });
      list.forEach(function (item) {
        el.catalogue.appendChild(h('option', { value: item.slug, text: item.title }));
      });
      el.catalogue.disabled = false;
    }, function () { /* uten katalog står bare de to andre veiene inn */ });
  }

  function init() {
    el.app = document.getElementById('editor');
    if (!el.app) return;
    el.appWrap = document.getElementById('ed-app');
    el.overlay = document.getElementById('ed-overlay');
    el.panel = document.getElementById('ed-panel');
    el.body = document.getElementById('ed-body');
    el.tabs = document.getElementById('ed-tabs');
    el.stage = document.getElementById('ed-stage');
    el.frames = [document.getElementById('ed-frame-a'), document.getElementById('ed-frame-b')];
    el.modeButtons = Array.prototype.slice.call(document.querySelectorAll('.ed-bar [data-mode]'));
    el.undo = document.getElementById('ed-undo');
    el.redo = document.getElementById('ed-redo');
    el.status = document.getElementById('ed-status');
    el.errorCount = document.getElementById('ed-error-count');
    el.errorList = document.getElementById('ed-error-list');
    el.errorDetails = document.getElementById('ed-error-details');
    el.errorSummary = document.getElementById('ed-error-count-summary');
    el.copyErrors = document.getElementById('ed-copy-errors');
    el.downloadCsv = document.getElementById('ed-download-csv');
    el.downloadHtml = document.getElementById('ed-download-html');
    el.downloadExams = document.getElementById('ed-download-exams');
    el.drop = document.getElementById('ed-drop');
    el.input = document.getElementById('ed-file');
    el.catalogue = document.getElementById('ed-catalogue');
    el.startError = document.getElementById('ed-start-error');
    el.paste = document.getElementById('ed-paste');
    el.pasteArea = document.getElementById('ed-paste-area');

    el.modeButtons.forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
    });
    el.tabs.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.getAttribute('data-tab');
        state.editingSection = null;
        state.notice = '';
        renderPanel();
      });
    });
    el.undo.addEventListener('click', undo);
    el.redo.addEventListener('click', redo);
    document.addEventListener('keydown', function (e) {
      if (!state.doc || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      if (/^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    });

    el.downloadCsv.addEventListener('click', function () {
      save(fileBase() + '.csv', serialize(state.doc), 'text/csv');
      state.dirty = false;
      track('builder_download', {});
    });
    el.downloadHtml.addEventListener('click', function () {
      if (!state.html) return;
      save(fileBase() + '.html', state.html, 'text/html');
      state.dirty = false;
      track('builder_download', {});
    });
    el.downloadExams.addEventListener('click', function () {
      if (state.exams) save(fileBase() + '-exams.csv', state.exams, 'text/csv');
    });
    el.copyErrors.addEventListener('click', function () {
      var errors = (state.eff && state.eff.errors) || [];
      var text = t('copy-preamble') + '\n\n' + errors.map(function (e) { return '- ' + e; }).join('\n');
      copyText(text);
      track('builder_copy_errors', {});
      el.copyErrors.textContent = t('copied');
      setTimeout(function () { el.copyErrors.textContent = t('copy-errors'); }, 1600);
    });
    /* «Åpne et annet» tar vinduet fram igjen. Treet som står der, forkastes
       ikke før læreren faktisk velger noe nytt - da spør confirmDiscard(). */
    document.getElementById('ed-open-other').addEventListener('click', showOverlay);
    document.getElementById('ed-overlay-close').addEventListener('click', hideOverlay);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.overlay.hidden) hideOverlay();
    });
    document.getElementById('ed-copy-prompt').addEventListener('click', function () {
      var box = document.getElementById('authoring-prompt');
      copyText(box.textContent.trim());
      document.getElementById('ed-prompt-next').hidden = false;
      track('copy_instruction', { instruction_kind: 'authoring_prompt' });
    });
    var show = document.getElementById('ed-show-prompt');
    show.addEventListener('click', function () {
      var box = document.getElementById('authoring-prompt');
      box.hidden = !box.hidden;
      show.setAttribute('aria-expanded', String(!box.hidden));
      show.textContent = t(box.hidden ? 'l0-show' : 'l0-hide');
    });
    loadAuthoringPrompt();

    el.input.addEventListener('change', function () { acceptFiles(el.input.files); el.input.value = ''; });
    el.drop.addEventListener('click', function () { el.input.click(); });
    el.drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.input.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (type) {
      el.drop.addEventListener(type, function (e) { e.preventDefault(); el.drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      el.drop.addEventListener(type, function (e) { e.preventDefault(); el.drop.classList.remove('is-over'); });
    });
    el.drop.addEventListener('drop', function (e) { acceptFiles(e.dataTransfer && e.dataTransfer.files); });

    /* «Lim inn» viser et felt å lime inn i, og leser samtidig utklippstavla
       der nettleseren lar oss. Ligger et tre der, åpnes det med en gang.
       Feltet vises først, fordi en nettleser som spør om lov, kan la
       spørsmålet stå ubesvart. */
    document.getElementById('ed-paste-button').addEventListener('click', function () {
      showPasteBox();
      if (!navigator.clipboard || !navigator.clipboard.readText) return;
      navigator.clipboard.readText().then(function (text) {
        if (treeFromPasted(text)) acceptPasted(text);
      }, function () {});
    });
    el.pasteArea.addEventListener('paste', function () {
      /* Verdien er på plass først etter at hendelsen er ferdig. */
      setTimeout(function () {
        if (treeFromPasted(el.pasteArea.value)) acceptPasted(el.pasteArea.value);
      }, 0);
    });
    document.getElementById('ed-paste-open').addEventListener('click', function () {
      acceptPasted(el.pasteArea.value);
    });
    /* Ctrl+V mens vinduet er framme og ingen felt har fokus: da er det
       regnearket læreren limer inn. */
    document.addEventListener('paste', function (e) {
      if (el.overlay.hidden) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
      var text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      if (!acceptPasted(text)) { showPasteBox(); el.pasteArea.value = text; }
    });

    document.getElementById('ed-start-example').addEventListener('click', function () {
      /* Står eksempelet allerede urørt bak vinduet, er det bare å lukke. */
      if (state.doc && !state.dirty && state.isExample) { hideOverlay(); return; }
      openUrl('/assets/starter/tree.csv', null, false, 'example');
    });
    document.getElementById('ed-start-blank').addEventListener('click', startBlank);
    el.catalogue.addEventListener('change', function () {
      var slug = el.catalogue.value;
      if (!slug) return;
      openUrl('/trees/' + slug + '/tree.csv', '/trees/' + slug + '/exams.csv');
      el.catalogue.value = '';
    });
    loadCatalogue();

    window.addEventListener('beforeunload', function (e) {
      if (!state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });

    if (window.i18n && window.i18n.onChange) window.i18n.onChange(function () { renderPanel(); });

    /* ?tree=<slug> åpner et tre fra katalogen rett i verktøyet, slik at
       «rediger dette treet» kan lenkes til. */
    var params = new URLSearchParams(location.search);
    var slug = params.get('tree');
    if (slug && /^[a-z0-9-]+$/.test(slug)) {
      openUrl('/trees/' + slug + '/tree.csv', '/trees/' + slug + '/exams.csv', true);
      el.overlay.hidden = true;
    } else {
      /* Eksempeltreet åpnes bak vinduet, slik at læreren ser hva hen skal
         lage. «Åpne eksempeltreet» og krysset lukker bare vinduet. */
      openUrl('/assets/starter/tree.csv', null, true, 'example');
      if (params.get('example') != null) el.overlay.hidden = true;
      else showOverlay();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

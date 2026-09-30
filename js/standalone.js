/* ==========================================================================
   standalone.js — setter sammen enkeltfil-utgaven av et tre, i nettleseren.

   Brukt av redigeringsverktøyet på /make-your-own/ (js/editor.js). Koden
   lå i js/builder.js fram til 2026-09-28, og ligger i en egen fil fordi
   den er det eneste stedet som vet hvordan fila settes sammen: to kopier
   av det er to steder som kan bli uenige, og da er det forhåndsvisningen
   som lyver.

   INGENTING LASTES OPP. Alt under skjer i lærerens egen nettleser, og det
   eneste som hentes over nettet er maskineriet fra dette nettstedet.

   API:
     AistStandalone.build(treeCsv, resourcesCsv) -> Promise<html>
     AistStandalone.peekConfig(treeCsv)      -> { language, subjectFamily, title }
     AistStandalone.waitForEngine(iframe)    -> Promise<AIST_EFFECTIVE_CONFIG>
   ========================================================================== */

(function () {
  'use strict';

  var assets = null;      // maskineriet, hentet én gang
  var jsonCache = {};     // språkfiler og fagfamilier, hentet én gang hver

  function getText(path) {
    return fetch(path).then(function (res) {
      if (!res.ok) throw new Error(path + ' (' + res.status + ')');
      return res.text();
    });
  }

  function getJson(path) {
    if (!jsonCache[path]) {
      jsonCache[path] = getText(path).then(function (raw) { return JSON.parse(raw); });
      /* En fil som ikke fantes, skal kunne prøves igjen neste gang. */
      jsonCache[path].catch(function () { delete jsonCache[path]; });
    }
    return jsonCache[path];
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
  function loadBundle(config, treeCsv, resourcesCsv) {
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
        'tree.csv': treeCsv,
        '/assets/prompts/manifest.json': manifest,
        /* Katalogens to filer finnes ikke for et tre en lærer har laget
           selv. De står som null framfor å mangle, slik at motoren får
           svaret sitt uten å gjøre et kall som feiler - en rød linje i
           konsollen for en fil som er valgfri, er nettopp den slags støy
           som får folk til å tro at noe er i stykker. */
        'meta.json': null,
        '/trees/vocabulary.json': null,
      };
      if (resourcesCsv) bundle['resources.csv'] = resourcesCsv;
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

  function build(treeCsv, resourcesCsv) {
    return loadAssets()
      .then(function () { return loadBundle(peekConfig(treeCsv), treeCsv, resourcesCsv); })
      .then(assemble);
  }

  /* Rammen er samme opphav som sida (blob-URL-er arver opphavet til den
     som lager dem), så vi kan lese av motorens egen oppsummering rett
     ut av den. */
  function waitForEngine(frame, timeoutText) {
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
          reject(new Error(shown || timeoutText || 'timeout'));
        }
      }, 100);
    });
  }

  /* Treet i en nedlastet enkeltfil. Regnearket står ordrett i
     AIST_BUNDLE (se engine/standalone.html), så fila er sin egen kilde.
     `</` er skrevet `<\/` inne i bundelen, så den første `;</script>`
     etter starten er slutten på den. */
  function extractFromHtml(html) {
    var start = html.indexOf('window.AIST_BUNDLE = ');
    if (start === -1) return null;
    var from = start + 'window.AIST_BUNDLE = '.length;
    var end = html.indexOf('</script>', from);
    if (end === -1) return null;
    var json = html.slice(from, end).replace(/;\s*$/, '');
    try {
      var bundle = JSON.parse(json);
      if (typeof bundle['tree.csv'] !== 'string') return null;
      return { tree: bundle['tree.csv'], resources: bundle['resources.csv'] || null };
    } catch (e) {
      return null;
    }
  }

  window.AistStandalone = {
    build: build,
    peekConfig: peekConfig,
    waitForEngine: waitForEngine,
    extractFromHtml: extractFromHtml,
    getJson: getJson,
  };
})();

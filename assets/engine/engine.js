'use strict';

/* ------------------------------------------------------------------ */
/* Delt motor for ferdighetstre-appene.                                */
/*                                                                      */
/* DENNE FILA INNEHOLDER INGEN BRUKERVENDT TEKST. Ikke skriv en streng  */
/* her som et menneske skal lese - verken en knappetekst eller en       */
/* setning i en KI-instruks. Det er hele poenget med oppdelingen under, */
/* og grunnen til at det finnes ÉN motor framfor én per språk.          */
/*                                                                      */
/* Fire lag, delt etter hva teksten varierer med:                       */
/*                                                                      */
/*   /prompts/                Pedagogikken. ENGELSK er kilden. Sier HVA */
/*                            modellen skal gjøre, aldri på hvilket     */
/*                            språk. Én fil per bidrag i artikkelen,    */
/*                            hver med sitt eget `version`:             */
/*                              manifest.json        indeksen           */
/*                              practice-tutor.json  bidrag 2           */
/*                              test-generator.json  bidrag 3           */
/*                              motivation.json      bidrag 4           */
/*                              lesson-plan.json     bidrag 5           */
/*                              shared.json          seksjoner brukt av */
/*                                                   flere av dem       */
/*                              decomposition.json   bidrag 1          */
/*                              authoring.json       rammeteksten rundt */
/*                                                   den. Begge har     */
/*                                                   audience=teacher   */
/*                                                   og leses ikke her  */
/*   /assets/prompts/subjects/Alt som varierer med FAGFAMILIE, og som   */
/*     <familie>.json         altså er sant for matematikk men ikke for */
/*                            samfunnsfag. Legger seksjoner TIL de      */
/*                            generelle instruksene. Et tre velger med  */
/*                            `subjectFamily` i tree.csv.               */
/*   /assets/languages/<kode>.jsonAlt som varierer med SPRÅK: knappetekster,*/
/*                            hjelpeteksten, og språklaget i instruksen */
/*                            (`outputLanguage` + `writingStyle`).      */
/*   ./tree.csv               ALT som er dette treets eget, i ÉN fil:   */
/*                            nodene, konfigurasjonen (config-rader) og */
/*                            lærerens egne instruks-overstyringer      */
/*                            (prompt-rader). `type`-kolonnen sier hva  */
/*                            raden er. tree.json og noder.csv er       */
/*                            borte fra og med 0.2.0.                   */
/*   ./exams.csv               Valgfri: eksamensoppgaver per node.      */
/*                                                                      */
/* Bakgrunnen: fram til 2026-09-20 fantes motoren i to eksemplarer,     */
/* ferdighetstre/engine.js og fardighetstrad/engine.js på skogvoll.com  */
/* - 107 KB hver, med en kommentar øverst om at enhver logikkendring    */
/* måtte speiles manuelt i den andre. De skilte seg på 527 linjer, og   */
/* alle 527 var tekst. Et nytt språk koster nå ÉN fil under             */
/* /languages/, ikke en kopi av denne.                                  */
/*                                                                      */
/* Rekkefølgen tekst slås opp i (mest spesifikk vinner):                */
/*   1. kjøretidsseksjon bygget av motoren (forutsetningslista o.l.)    */
/*   2. tree.csv     → prompt-rad (instruks + seksjon, eller * + seksjon)*/
/*   3. språkfila    → prompt.overrides.<instruks>.<seksjon>            */
/*   4. språkfila    → prompt.<seksjon> (outputLanguage, writingStyle)  */
/*   5. fagfamilien  → instructions.<instruks>.add[].text               */
/*   6. instruksmodulen → sections.<seksjon>                            */
/*   7. shared.json  → sections.<seksjon>                               */
/* Punkt 3 er grunnen til at «engelsk kjerne + språklag» og «full       */
/* oversettelse» er samme mekanisme: et språk kan overstyre én seksjon  */
/* eller alle, uten at noe annet endres.                                */
/* Punkt 5 gir fagfamilien to virkemåter med én mekanisme: en NY id     */
/* flettes inn i `order` etter ankeret sitt, mens en id som allerede    */
/* finnes i `order` overstyrer den generelle teksten på plassen sin.    */
/*                                                                      */
/* STIENE BEGYNNER MED /assets/ (fra 0.4.0). Maskineriet ligger samlet   */
/* under ett prefiks på det publiserte nettstedet, fordi /prompts/ er en */
/* SIDE der - og fordi et prefiks som sier «filer sidene laster, ikke    */
/* sider man besøker» er det eneste som hindrer den kollisjonen i å      */
/* skje igjen. Mappenavnene i dette repoet er uendret; det er bare       */
/* URL-ene de publiseres på som har fått prefikset.                      */
/* ------------------------------------------------------------------ */

/* Fylles av bootstrap() før init(). Ingen av dem er `const`, fordi de
   ikke kan leses før tre fetch-er har kommet tilbake - det er den ene
   reelle forskjellen fra den gamle synkrone config.js-modellen. */
let CONFIG = null;          // utledet av config-radene i ./tree.csv
let META = null;            // ./meta.json (katalogens metadata — vises i kursinfo)
let VOCAB = null;           // /trees/vocabulary.json (kontrollert vokabular for meta.json)
let LANG = null;            // /languages/<kode>.json
let CORE = null;            // { prompts: { <id>: instruksmodul } } - satt sammen av
                            //   bootstrap() fra /prompts/manifest.json. Formen er den
                            //   samme som den gamle core.json hadde, med vilje: resten
                            //   av motoren leser CORE.prompts[navn] og merker ikke at
                            //   fila er blitt til seks.
let SHARED = {};            // /prompts/shared.json → sections (delt mellom instrukser)
let FAMILY = null;          // /prompts/subjects/<familie>.json, eller null
let MANIFEST = null;        // /prompts/manifest.json - versjonene artikkelen siterer
let NODE_ROWS = [];         // node-radene i ./tree.csv, satt av bootstrap()
let PROMPT_ROWS = {};       // prompt-radene i ./tree.csv: { '<instruks>.<seksjon>': tekst }
                            //   '*' som instruks betyr «alle instrukser».
let PROMPT_ROW_AT = {};     // samme nøkler → radnummeret i regnearket, så en
                            //   prompt-rad som ikke treffer noe kan navngis.

let STORAGE_KEY = null;
let TOPIC_ORDER = [];
let FEATURES = {};
let SHOW_MOTIVATION_BUTTON = false;
let CONVERSATION_LANGUAGE = '';

let LAYOUT = {
  nodeWidth: 210,
  nodeHeight: 92,
  hGap: 34,
  vGap: 96,
  columnGap: 56,
  columnLabelHeight: 28,   // emnebåndet øverst — holdes lavt, se .column-header i tree.css
  maxNodesPerRow: 3, // bryt en emne-rad i flere rader nedover når den blir bredere enn dette
  padding: 12,             // luft rundt hele lerretet; var 20 til 2026-09-20
  barycenterPasses: 4,
};

/* ------------------------------------------------------------------ */
/* Oppslag av tekst                                                     */
/* ------------------------------------------------------------------ */

/* t('exam.button') → knappeteksten på gjeldende språk.
   t('column.markAll', { topic: 'Statistikk' }) fyller {topic}.
   Finnes ikke nøkkelen, returneres nøkkelen selv - en manglende
   oversettelse skal vises som en synlig nøkkel, ikke som tom knapp. */
function t(path, vars) {
  let cur = LANG && LANG.ui;
  for (const part of path.split('.')) {
    if (cur == null) break;
    cur = cur[part];
  }
  return typeof cur === 'string' ? fill(cur, vars) : path;
}

/* Fyller {navn} fra `vars`. En plassholder uten verdi blir stående som
   den er, slik at den er lett å få øye på framfor å bli til "undefined". */
function fill(text, vars) {
  if (!vars) return text;
  return String(text).replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null
      ? String(vars[name]) : whole);
}

/* Visningsnavnet for en nodetype. Selve VERDIEN i CSV-en ('skill',
   'concept') er et dataenum og er ENGELSK på alle språk - også i den
   norske og den svenske tree.csv. Bare etiketten oversettes. */
function typeLabelText(type) {
  const map = (LANG.ui.nodeType) || {};
  return map[type] || type;
}

/* ------------------------------------------------------------------ */
/* Komposisjon av KI-instruks                                           */
/*                                                                      */
/* Rekkefølgen på seksjonene er DATA (`order` i instruksmodulen), slik   */
/* at den kan endres uten å røre kode. Hvilke seksjoner som gjelder NÅR  */
/* er logikk, og bor her.                                               */
/* ------------------------------------------------------------------ */

const SECTION_WHEN = {
  'node.expression':         ctx => !!slot('expressionFocus'),
  'node.prerequisites':      ctx => ctx.ancestors && ctx.ancestors.length > 0,
  'node.prerequisitesNone':  ctx => !ctx.ancestors || ctx.ancestors.length === 0,
  'node.conceptGuidance':    ctx => ctx.node && ctx.node.type === 'concept',
  'node.nodeInstruction':    ctx => !!(ctx.node && ctx.node.instruction),
  'node.aids':               ctx => treeUsesAids() && (ctx.node.aids || []).length > 0,
  'node.aidsMultiple':       ctx => !!ctx.multipleAids,
  'exam.aidsMultiple':       ctx => !!ctx.multipleAids,
  'lessonPlan.aidsMultiple': ctx => !!ctx.multipleAids,
  'exam.conceptMix':             ctx => !!ctx.hasConcepts,
  'exam.conceptMixAllConcepts':  ctx => !!ctx.allConcepts,
  'exam.conceptMixMixed':        ctx => !!ctx.hasConcepts && !ctx.allConcepts,
  'exam.aids':                   ctx => treeUsesAids() && !!ctx.aidsText,
  'lessonPlan.prerequisites':     ctx => ctx.ancestors && ctx.ancestors.length > 0,
  'lessonPlan.prerequisitesNone': ctx => !ctx.ancestors || ctx.ancestors.length === 0,
  'lessonPlan.tightWarning':      ctx => !!ctx.tight,
  'lessonPlan.conceptAdaptation': ctx => !!ctx.hasConcepts,
  'lessonPlan.aids':              ctx => treeUsesAids() && !!ctx.aidsText,
};

function slot(name) {
  return (CONFIG.slots || {})[name];
}

/* Tilleggene fagfamilien bidrar med til ÉN instruks, som en liste av
   { id, after, text }. Tomt for et tre uten `subjectFamily`. */
function familyAdds(promptName) {
  return ((FAMILY && FAMILY.instructions && FAMILY.instructions[promptName]) || {}).add || [];
}

/* Slår opp teksten for én seksjon. Se rekkefølgen i filhodet. */
function sectionText(promptName, id, ctx) {
  if (ctx.sections && ctx.sections[id] != null) return ctx.sections[id];

  /* prompt-radene i tree.csv. Mest spesifikk vinner: en rad som navngir
     instruksen slår en rad som gjelder alle. Dette er det stedet LÆREREN
     redigerer, så det ligger øverst av det som kommer fra filer. */
  const fromCsv = PROMPT_ROWS[promptName + '.' + id];
  if (fromCsv != null) return fromCsv;
  const fromCsvAll = PROMPT_ROWS['*.' + id];
  if (fromCsvAll != null) return fromCsvAll;

  const langPrompt = (LANG.prompt || {});
  const fromLangOverride = ((langPrompt.overrides || {})[promptName] || {})[id];
  if (fromLangOverride != null) return fromLangOverride;
  if (langPrompt[id] != null) return langPrompt[id];

  const fromFamily = familyAdds(promptName).find(a => a.id === id);
  if (fromFamily && fromFamily.text != null) return fromFamily.text;

  const spec = CORE.prompts[promptName];
  if (spec && spec.sections[id] != null) return spec.sections[id];

  return SHARED[id] != null ? SHARED[id] : null;
}

/* Instruksens egen `order`, med fagfamiliens seksjoner flettet inn etter
   ankeret hver av dem oppgir. En familie som gjenbruker en id som ALLEREDE
   finnes i `order` flytter ingenting - da vinner familieteksten på plassen
   seksjonen har fra før, via sectionText() over. */
function sectionOrder(promptName) {
  const order = CORE.prompts[promptName].order.slice();
  familyAdds(promptName).forEach(add => {
    if (order.indexOf(add.id) !== -1) return;
    const at = add.after ? order.indexOf(add.after) : -1;
    if (at === -1) order.push(add.id);
    else order.splice(at + 1, 0, add.id);
  });
  return order;
}

/* En seksjon fra en fagfamilie arver betingelsen til seksjonen den er
   forankret etter. Uten dette ville f.eks. matematikkens utdyping av
   `conceptGuidance` stått på hver eneste ferdighetsnode, ikke bare på
   begrepsnodene - se `_conditions` i prompts/manifest.json. */
function sectionApplies(promptName, id, ctx) {
  const when = SECTION_WHEN[promptName + '.' + id];
  if (when) return when(ctx);
  const add = familyAdds(promptName).find(a => a.id === id);
  if (add && add.after) return sectionApplies(promptName, add.after, ctx);
  return true;
}

function composePrompt(promptName, ctx) {
  const spec = CORE.prompts[promptName];
  if (!spec) throw new Error('Ukjent instruks: ' + promptName);
  ctx = ctx || {};

  const vars = Object.assign(
    { conversationLanguage: CONVERSATION_LANGUAGE, examButtonLabel: t('exam.button') },
    CONFIG.slots || {},
    ctx.vars || {});

  const out = [];
  sectionOrder(promptName).forEach(id => {
    if (!sectionApplies(promptName, id, ctx)) return;
    const text = sectionText(promptName, id, ctx);
    if (text == null || text === '') return;
    /* Stikkordet står foran teksten: «role: ...». Det gjør to ting på én
       gang. Modellen får strukturen XML-tagger ville gitt den, uten at
       instruksen ser ut som kode for den som limer den inn — og læreren
       ser nøyaktig hvilket ord som skal stå i `name`-kolonnen den dagen
       hen vil skrive om én del av den, med en `prompt`-rad i tree.csv.
       Stikkordene er engelske, som alt annet i prompts/; teksten etter
       kolonet er treets eget språk. */
    out.push(id + ': ' + fill(text, vars));
  });
  return out.join('\n\n');
}

/* Hjelpemiddelteksten er fagets egen prosa og bor i tree.csv, ikke her. */

/* ------------------------------------------------------------------ */
/* Global tilstand                                                     */
/* ------------------------------------------------------------------ */

let nodesById = new Map();
let allNodes = [];
let examsByNode = new Map();
let activeNodeId = null;
const validationErrors = [];

// Temaer med tildelt bokstav og noder i indeksert rekkefølge, satt av
// assignLearningGoalIndices() ved hver layout. Brukes av "Vis alle
// læringsmål"-vinduet.
let themeList = [];

/* ------------------------------------------------------------------ */
/* Analytics                                                            */
/*                                                                      */
/* Én hendelse, `copy_instruction`, med hvilken SLAGS instruks som ble  */
/* kopiert. Det er handlingen hele verktøyet finnes for — grafen kaller */
/* ingen språkmodell, så en kopiert instruks er det nærmeste denne sida */
/* kommer en fullført oppgave, og det eneste stedet det er verdt å måle.*/
/*                                                                      */
/* Vi teller IKKE avhukinger, nodeåpninger eller framdrift: det ville   */
/* vært et detaljert bilde av hva én elev sliter med, sendt til Google, */
/* for et verktøy hvis hele poeng er at det ikke krever konto eller     */
/* databehandleravtale. Instruksteksten sendes heller aldri — bare      */
/* hvilken type og hvilken node.                                        */
/*                                                                      */
/* Hendelsen sendes når knappen trykkes, ikke når utklippstavla svarer: */
/* fallbacken (window.prompt med teksten) leverer instruksen like fullt,*/
/* og skal telle likt.                                                  */
/*                                                                      */
/* Krever /js/analytics.js i <head>. Mangler den, gjør dette ingenting. */
/* ------------------------------------------------------------------ */

// «/trees/no-vgs-matte-2p/» → «no-vgs-matte-2p». Slug-en er mappenavnet; det finnes
// ingen egen id i config, og mappenavnet er allerede nøkkelen i
// /trees/trees.json og i meta.json.
function treeSlug() {
  const parts = location.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('trees');
  return (i !== -1 && parts[i + 1]) ? parts[i + 1] : (parts[parts.length - 1] || 'unknown');
}

function trackCopy(kind, extra) {
  if (!window.aistTrack) return;
  const params = { tree_slug: treeSlug(), instruction_kind: kind };
  if (extra) Object.keys(extra).forEach(k => { if (extra[k] != null) params[k] = extra[k]; });
  window.aistTrack('copy_instruction', params);
}

/* ------------------------------------------------------------------ */
/* Oppstart                                                             */
/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', bootstrap);

/* ------------------------------------------------------------------ */
/* Bootstrap                                                            */
/*                                                                      */
/* tree.csv må leses først: den sier hvilket språk treet er på, og      */
/* fordi den sier hvilket språk treet er på; språkfila og pedagogikken  */
/* hentes så parallelt.                                                 */
/*                                                                      */
/* Mangler /languages/<kode>.json, faller vi tilbake til en.json for    */
/* GRENSESNITTET, men IKKE for samtalespråket: det kommer fra treets    */
/* eget `languageName`. Et tysk tre snakker derfor tysk fra dag én,     */
/* med engelske knapper, uten at noen har oversatt en linje.            */
/* ------------------------------------------------------------------ */

async function bootstrap() {
  /* ÉN fil. tree.csv holder alt som er dette treets eget: nodene,
     konfigurasjonen (config-rader) og eventuelle instruks-overstyringer
     (prompt-rader). tree.json finnes ikke lenger - se CHANGELOG 0.2.0.
     Den må leses FØRST, fordi den er det eneste stedet som sier hvilket
     språk treet er på. */
  let rows;
  try {
    rows = parseCsv(await fetchText('tree.csv'));
  } catch (err) {
    console.error(err);
    document.body.textContent = 'Fant ikke tree.csv for dette ferdighetstreet: ' + err.message;
    return;
  }

  const split = splitRows(rows);
  NODE_ROWS = split.nodes;
  PROMPT_ROWS = split.prompts;
  PROMPT_ROW_AT = split.promptRows;
  CONFIG = buildConfig(split.config);

  const code = CONFIG.language || 'en';
  let lang;
  try {
    lang = await fetchJson('/assets/languages/' + code + '.json');
  } catch (err) {
    console.warn('Ingen språkfil for «' + code + '» - bruker engelsk grensesnitt.', err);
    lang = await fetchJson('/assets/languages/en.json');
  }
  LANG = lang;

  /* Utledet framfor konfigurert. Samtalespråkets navn står i språkfila, og
     lagringsnøkkelen er et internt navn ingen lærer skal måtte finne på.
     Begge kan likevel oppgis - en config-rad vinner alltid. */
  if (!CONFIG.languageName) CONFIG.languageName = LANG.name || code;
  if (!CONFIG.storageKey) CONFIG.storageKey = deriveStorageKey(CONFIG.title || code);

  /* Pedagogikken ligger i én modul per bidrag, ikke i én core.json. Bare
     manifestet har et hardkodet filnavn; alt annet er oppført DER, slik at
     en ny modul eller en ny fagfamilie ikke koster en kodeendring. Hver
     modul har sitt eget `version`, fordi artikkelens appendiks siterer dem
     hver for seg. Manifestet først, så resten i parallell. */
  MANIFEST = await fetchJson('/assets/prompts/manifest.json');
  const famPath = CONFIG.subjectFamily
    ? (MANIFEST.subjectFamilies || {})[CONFIG.subjectFamily]
    : null;
  if (CONFIG.subjectFamily && !famPath) {
    console.warn('Ukjent subjectFamily «' + CONFIG.subjectFamily +
                 '» - treet får bare de generelle instruksene.');
  }
  /* Bare instruksene en ELEV får. `audience: "teacher"` er dekomponerings-
     modellen og rammeteksten rundt den, som byggersida bruker - å hente dem
     på hver eneste tre-side ville kostet hver leser 20 kB for tekst ingen
     elev noen gang ser. Se `audience` i prompts/manifest.json. */
  const ids = Object.keys(MANIFEST.instructions)
    .filter(id => (MANIFEST.instructions[id].audience || 'student') === 'student');
  const loaded = await Promise.all(
    [fetchJson('/assets/prompts/' + MANIFEST.shared)]
      .concat(ids.map(id => fetchJson('/assets/prompts/' + MANIFEST.instructions[id].file)))
      .concat(famPath ? [fetchJson('/assets/prompts/' + famPath)] : []));

  SHARED = loaded[0].sections || {};
  CORE = { prompts: {} };
  ids.forEach((id, i) => { CORE.prompts[id] = loaded[i + 1]; });
  FAMILY = famPath ? loaded[loaded.length - 1] : null;
  /* Først her vet vi hvilke seksjoner som finnes. Se validatePromptRows(). */
  validatePromptRows();
  /* meta.json eies av katalogen, og finnes bare for et tre som ligger DER.
     Et tre en lærer har laget selv har ingen katalogoppføring, så kursinfoen
     settes da sammen av config-radene i stedet - ellers ville «Om faget»
     vært tomt for alle andre enn meg. */
  META = await fetchJson('meta.json').catch(() => null) || metaFromConfig();
  /* Vokabularet oversetter nøklene i meta.json (country, institution,
     division, subjectArea, language) til lesbar tekst. Treet slår opp på
     SITT EGET språk, ikke leserens: et tre er enspråklig, og «Om faget»
     skal stå på treets språk uansett hvor leseren kom fra. */
  VOCAB = await fetchJson('/trees/vocabulary.json').catch(() => null);

  CONVERSATION_LANGUAGE = CONFIG.languageName || LANG.name;
  STORAGE_KEY = CONFIG.storageKey;
  TOPIC_ORDER = CONFIG.topicOrder || [];
  FEATURES = CONFIG.features || {};
  SHOW_MOTIVATION_BUTTON = FEATURES.motivation === true;
  Object.assign(LAYOUT, CONFIG.layout || {});

  applyPageChrome();
  init();
}

/* ------------------------------------------------------------------ */
/* tree.csv: tre slags rader i én tabell                                */
/*                                                                      */
/* `type` avgjør hva raden er:                                          */
/*   skill | concept  - en node i treet (som før)                       */
/*   config           - en innstilling:   name = nøkkel, description = verdi */
/*   prompt           - en instruks-overstyring: topic = hvilken instruks */
/*                      (tom = alle), name = seksjon, instruction = teksten */
/*                                                                      */
/* Hvorfor verdien står i `description` for config og i `instruction`   */
/* for prompt: en config-verdi er data, en prompt-tekst er instruks, og */
/* begge låner da kolonnen som betyr omtrent det samme fra før.         */
/* ------------------------------------------------------------------ */

function splitRows(rows) {
  const out = { nodes: [], config: [], prompts: {}, promptRows: {} };
  rows.forEach((row, i) => {
    const kind = (row.type || '').trim().toLowerCase();
    if (kind === 'config') {
      out.config.push({ key: (row.name || '').trim(), value: (row.description || '').trim(), row: i + 2 });
    } else if (kind === 'prompt') {
      const which = (row.topic || '').trim() || '*';
      const section = (row.name || '').trim();
      /* Radnummeret følger med: en prompt-rad som ikke treffer noe skal
         kunne peke på seg selv, på samme måte som en ukjent config-nøkkel. */
      if (section) {
        out.prompts[which + '.' + section] = (row.instruction || '').trim();
        out.promptRows[which + '.' + section] = i + 2;
      }
    } else {
      out.nodes.push(row);
    }
  });
  return out;
}

/* Kjente innstillinger. En ukjent nøkkel er en FEIL, ikke noe som
   ignoreres: i et regneark er stillhet den farligste responsen som
   finnes - `aids.2.modell` ville ellers bare ikke gjort noen ting. */
const CONFIG_KEYS = [
  'schemaVersion', 'title', 'description', 'language', 'languageName',
  'subjectFamily', 'storageKey', 'topicOrder',
  'course', 'curriculum', 'author', 'authorUrl', 'license',
  'features.motivation', 'features.exams',
  'slots.courseName', 'slots.motivationSubject', 'slots.expressionFocus',
  'aids.label',
];
const CONFIG_KEY_PATTERNS = [
  /^aids\.\d+\.(name|student|model)$/,
  /^layout\.[A-Za-z][A-Za-z0-9]*$/,
  /^slots\.[A-Za-z][A-Za-z0-9]*$/,
];
const CONFIG_REQUIRED = ['title', 'language'];

function configKeyKnown(key) {
  return CONFIG_KEYS.indexOf(key) !== -1 || CONFIG_KEY_PATTERNS.some(re => re.test(key));
}

/* Nærmeste kjente nøkkel, for «mente du ...?». Enkel redigeringsavstand,
   og bare når den er liten nok til at gjettet er verdt å trykke. */
function nearest(value, candidates) {
  let best = null, bestDist = Infinity;
  candidates.forEach(k => {
    const d = editDistance(value.toLowerCase(), k.toLowerCase());
    if (d < bestDist) { bestDist = d; best = k; }
  });
  return bestDist <= Math.max(2, Math.floor(value.length / 4)) ? best : null;
}

function nearestConfigKey(key) {
  return nearest(key, CONFIG_KEYS.concat(['aids.1.student', 'aids.1.model', 'aids.1.name']));
}

function editDistance(a, b) {
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1,
                         diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/* En prompt-rad som ikke treffer noe er en FEIL, av nøyaktig samme grunn
   som en ukjent config-nøkkel: den blir lest, den blir vist tilbake som en
   innstilling, og så gjør den aldri noe. Læreren som ba modellen «ikke bruk
   emoji» tror den fikk viljen sin.

   Kan bare kjøres ETTER at instruksmodulene og fagfamilien er lastet:
   hvilke seksjoner som finnes, står i modulenes `order`, og fagfamilien
   legger til sine egne. Derfor kalles den fra bootstrap og ikke fra
   splitRows. */
function validatePromptRows() {
  const names = Object.keys(CORE.prompts);
  Object.keys(PROMPT_ROWS).forEach(key => {
    const dot = key.indexOf('.');
    const which = key.slice(0, dot);
    const id = key.slice(dot + 1);
    const row = PROMPT_ROW_AT[key];

    /* Tom `topic` ('*') gjelder alle instruksene og er alltid en gyldig
       adresse. Et navn må derimot være en instruks treet faktisk setter
       sammen — `decomposition` og `authoring` er lærerens egne og hentes
       ikke her, så en rad som peker på dem gjør ingenting. */
    if (which !== '*' && names.indexOf(which) === -1) {
      pushError('errorUnknownPromptTarget',
                { name: which, row: row, guess: nearest(which, names) });
      return;
    }

    /* For en rad uten instruksnavn holder det at seksjonen finnes i én av
       dem: den gjelder de instruksene som har den, og bare dem. */
    const scope = which === '*' ? names : [which];
    const known = scope.reduce((acc, n) => acc.concat(sectionOrder(n)), []);
    if (known.indexOf(id) === -1) {
      pushError('errorUnknownPromptSection',
                { section: id, row: row, guess: nearest(id, known) });
    }
  });
}

function buildConfig(entries) {
  const cfg = {};
  const seen = new Set();
  entries.forEach(entry => {
    if (!entry.key) return;
    if (!configKeyKnown(entry.key)) {
      const guess = nearestConfigKey(entry.key);
      pushError('errorUnknownConfig', { key: entry.key, row: entry.row, guess: guess });
      return;
    }
    seen.add(entry.key);
    setByPath(cfg, entry.key, coerceConfigValue(entry.key, entry.value));
  });
  CONFIG_REQUIRED.forEach(key => {
    if (!seen.has(key)) pushError('errorMissingConfig', { key: key });
  });
  normaliseAids(cfg);
  return cfg;
}

/* `aids.1.student` og `aids.2.model` blir til `{ label, levels: [...] }`,
   som er formen resten av motoren leser. Tallene er lærerens eget
   vokabular fra før - `aids`-kolonnen på nodene sier `1;2`. */
function normaliseAids(cfg) {
  const aids = cfg.aids;
  if (!aids) return;
  const levels = [];
  Object.keys(aids).forEach(key => {
    if (!/^\d+$/.test(key)) return;
    levels.push(Object.assign({ level: parseInt(key, 10) }, aids[key]));
    delete aids[key];
  });
  if (levels.length) {
    levels.sort((a, b) => a.level - b.level);
    aids.levels = levels;
  }
}

function coerceConfigValue(key, value) {
  if (key === 'topicOrder') return value.split(';').map(s => s.trim()).filter(Boolean);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value) && (key === 'schemaVersion' || key.indexOf('layout.') === 0)) {
    return parseInt(value, 10);
  }
  return value;
}

function setByPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/* Lagringsnøkkelen er intern, og utledes fra tittelen. Den må bare være
   stabil og unik nok til at to trær i samme nettleser ikke deler
   avhukinger. */
function deriveStorageKey(title) {
  const slug = String(title).toLowerCase()
    .replace(/[æäà]/g, 'a').replace(/[øö]/g, 'o').replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (slug || 'skill-tree') + '-progress';
}

/* «Om faget» for et tre uten katalogoppføring. Bare fritekstfeltene:
   fasettnøklene (country, institution, ...) hører katalogen til, og et
   tre en lærer laget for seg selv står ikke i den. */
function metaFromConfig() {
  const fields = ['course', 'curriculum', 'author', 'authorUrl', 'license', 'description'];
  const meta = {};
  let any = false;
  fields.forEach(f => { if (CONFIG[f]) { meta[f] = CONFIG[f]; any = true; } });
  if (CONFIG.title) meta.title = CONFIG.title;
  return any ? meta : null;
}

function fetchJson(path) {
  const pre = preloaded(path);
  if (pre !== undefined) return Promise.resolve(pre);
  return fetch(path).then(res => {
    if (!res.ok) throw new Error('Fant ikke ' + path + ' (status ' + res.status + ')');
    return res.json();
  });
}

/* Alt motoren laster, går gjennom fetchJson() og fetchText(). Finnes
   `window.AIST_BUNDLE`, tas innholdet DERFRA framfor over nettet - det er
   hele mekanismen bak enkeltfil-utgaven, som må virke fra file:// der
   fetch() er CORS-blokkert. På nett finnes ikke variabelen, og alt går
   som før. */
function preloaded(path) {
  const bundle = (typeof window !== 'undefined' && window.AIST_BUNDLE) || null;
  if (!bundle) return undefined;
  return Object.prototype.hasOwnProperty.call(bundle, path) ? bundle[path] : undefined;
}

/* Tittel, overskrift, ingress og tilbakelenke kommer fra språkfila +
   tree.csv, ikke fra index.html. Det er derfor index.html kan være
   BYTE-IDENTISK for hvert eneste tre - se AGENTS.md. */
function applyPageChrome() {
  const title = CONFIG.title || '';
  document.documentElement.setAttribute('lang', LANG.htmlLang || LANG.code);
  document.title = t('pageTitle', { title: title }) + ' | AI Skill Trees';

  const set = (sel, text) => { const el = document.querySelector(sel); if (el) el.textContent = text; };
  set('header h1', t('pageTitle', { title: title }));
  set('.back-link', t('backLink'));
  set('.tagline', t('tagline'));
  set('#progress-label', t('progressLabel', { done: 0, total: 0 }));
  set('#detail-empty', t('detail.empty'));

  const desc = document.querySelector('meta[name="description"]');
  if (desc && CONFIG.description) desc.setAttribute('content', CONFIG.description);
}

/* ------------------------------------------------------------------ */
/* Zoom (ctrl+scroll) og "vis hele treet"                              */
/* ------------------------------------------------------------------ */

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;
let zoomLevel = 1;

// Setter zoomnivå og skalerer #graph-container om origo (0,0). Hvis
// (contentX, contentY) og skjermpunktet (cx, cy) er oppgitt, justeres
// scrollposisjonen slik at akkurat det innholdspunktet blir stående stille
// under musepekeren/fingeren mens man zoomer - ellers "hopper" kartet.
function setZoom(newZoom, contentX, contentY, cx, cy) {
  const scrollEl = document.getElementById('graph-scroll');
  const container = document.getElementById('graph-container');
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
  container.style.transform = `scale(${zoomLevel})`;
  if (contentX != null) {
    scrollEl.scrollLeft = contentX * zoomLevel - cx;
    scrollEl.scrollTop = contentY * zoomLevel - cy;
  }
}

// Zoomer inn/ut ett steg, sentrert på midten av synlig kartområde.
function zoomBy(factor) {
  const scrollEl = document.getElementById('graph-scroll');
  const cx = scrollEl.clientWidth / 2;
  const cy = scrollEl.clientHeight / 2;
  const contentX = (scrollEl.scrollLeft + cx) / zoomLevel;
  const contentY = (scrollEl.scrollTop + cy) / zoomLevel;
  setZoom(zoomLevel * factor, contentX, contentY, cx, cy);
}

function setupZoom() {
  const scrollEl = document.getElementById('graph-scroll');

  scrollEl.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return; // vanlig scroll skal fortsatt panorere/scrolle som normalt
    e.preventDefault();
    const rect = scrollEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const contentX = (scrollEl.scrollLeft + cx) / zoomLevel;
    const contentY = (scrollEl.scrollTop + cy) / zoomLevel;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setZoom(zoomLevel * factor, contentX, contentY, cx, cy);
  }, { passive: false });

  const group = document.createElement('div');
  group.id = 'zoom-controls';

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.id = 'zoom-out-btn';
  zoomOutBtn.type = 'button';
  zoomOutBtn.textContent = '−';
  zoomOutBtn.setAttribute('aria-label', t('zoomOut'));
  zoomOutBtn.title = t('zoomOut');
  zoomOutBtn.addEventListener('click', () => zoomBy(1 / 1.25));
  group.appendChild(zoomOutBtn);

  const btn = document.createElement('button');
  btn.id = 'fit-view-btn';
  btn.type = 'button';
  btn.textContent = '⤢';
  btn.setAttribute('aria-label', t('fitToView'));
  btn.title = t('fitToViewTitle');
  btn.addEventListener('click', fitToView);
  group.appendChild(btn);

  const zoomInBtn = document.createElement('button');
  zoomInBtn.id = 'zoom-in-btn';
  zoomInBtn.type = 'button';
  zoomInBtn.textContent = '+';
  zoomInBtn.setAttribute('aria-label', t('zoomIn'));
  zoomInBtn.title = t('zoomIn');
  zoomInBtn.addEventListener('click', () => zoomBy(1.25));
  group.appendChild(zoomInBtn);

  getBottomToolbar().appendChild(group);
}

// Flytende verktøylinje nederst til venstre - holder kun zoom-kontrollene
// (se setupZoom), siden disse brukes aktivt mens man utforsker kartet.
function getBottomToolbar() {
  let toolbar = document.getElementById('bottom-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'bottom-toolbar';
    document.body.appendChild(toolbar);
  }
  return toolbar;
}

/* ------------------------------------------------------------------ */
/* "Vis alle læringsmål": full, indeksert liste sortert etter tema      */
/* ------------------------------------------------------------------ */

function setupGoalIndexButton() {
  const panel = ensureActionMenu();
  if (!panel) return;

  const btn = document.createElement('button');
  btn.id = 'goal-index-btn';
  btn.type = 'button';
  btn.textContent = t('goalIndex.button');
  btn.title = t('goalIndex.title');
  btn.addEventListener('click', () => {
    closeActionMenu();
    openGoalIndexModal();
  });
  panel.appendChild(btn);
}

/* ------------------------------------------------------------------ */
/* Flytende meny-knapp nederst til venstre, ved siden av zoom-knappene:    */
/* samler ALT som før lå i den synlige headeren - tilbake-lenke,           */
/* dag/natt-knapp, fremdriftslinje, tittel/undertekst - og de sjeldnere    */
/* brukte knappene (hjelp, læringsmål-liste, prøvegenerator, motivasjon)   */
/* bak ett trekkspill-panel. Selve <header> tømmes for innhold og skjules  */
/* i CSS. Ligger bevisst nederst til venstre og IKKE øverst til høyre - i  */
/* det hjørnet endte den nesten oppå tilbake-knappen i detaljpanelet når   */
/* det er åpent på mobil.                                                 */
/* ------------------------------------------------------------------ */

// Lages lat og gjenbrukes: én flytende meny-knapp som slår ut/inn et panel
// med alt navigasjons- og statusinnhold pluss de sjeldnere brukte knappene.
// Selve panelet fylles videre av setupMotivationButton/setupHelpButton/
// setupGoalIndexButton/setupExamButton, i den rekkefølgen de kalles fra
// init().
function ensureActionMenu() {
  let panel = document.getElementById('action-menu-panel');
  if (panel) return panel;

  const headerInner = document.querySelector('.header-inner');
  if (!headerInner) return null; // uventet DOM - fail silent fremfor å kaste under init

  // Venstre for zoom-knappene i samme flytende verktøylinje nederst til
  // venstre - IKKE øverst til høyre, der den nesten overlappet
  // tilbake-knappen i detaljpanelet på mobil (begge endte i samme hjørne).
  const toolbar = getBottomToolbar();
  const wrap = document.createElement('div');
  wrap.id = 'menu-wrap';
  toolbar.insertBefore(wrap, toolbar.firstChild);

  const toggle = document.createElement('button');
  toggle.id = 'menu-toggle-btn';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', t('menu.label'));
  toggle.setAttribute('aria-expanded', 'false');
  toggle.title = t('menu.label');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  toggle.addEventListener('click', toggleActionMenu);
  wrap.appendChild(toggle);

  panel = document.createElement('div');
  panel.id = 'action-menu-panel';
  wrap.appendChild(panel);

  // Tilbake-lenke + dag/natt-knapp på samme rad øverst i panelet - akkurat
  // som de lå side om side i den gamle headeren.
  const navRow = document.createElement('div');
  navRow.id = 'menu-nav-row';
  const backLink = headerInner.querySelector('.back-link');
  const themeToggle = headerInner.querySelector('.theme-toggle');
  if (backLink) navRow.appendChild(backLink);
  if (themeToggle) navRow.appendChild(themeToggle);
  if (navRow.children.length) panel.appendChild(navRow);

  // Fremdriftslinje, sidetittel og undertekst er alle statisk/status-
  // informasjon (samme eller sjelden-endret hver gang man besøker siden) -
  // flytt dem inn i panelet i stedet for å ta plass over grafen hele tiden.
  const progressRow = headerInner.querySelector('.progress-row');
  if (progressRow) panel.appendChild(progressRow);
  const heading = headerInner.querySelector('h1');
  const tagline = headerInner.querySelector('p.tagline');
  if (heading) panel.appendChild(heading);
  if (tagline) panel.appendChild(tagline);

  document.addEventListener('click', e => {
    if (!panel.classList.contains('open')) return;
    if (wrap.contains(e.target)) return;
    closeActionMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel.classList.contains('open')) closeActionMenu();
  });

  return panel;
}

function toggleActionMenu() {
  const panel = document.getElementById('action-menu-panel');
  const toggle = document.getElementById('menu-toggle-btn');
  if (!panel || !toggle) return;
  const open = panel.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
}

function closeActionMenu() {
  const panel = document.getElementById('action-menu-panel');
  const toggle = document.getElementById('menu-toggle-btn');
  if (!panel) return;
  panel.classList.remove('open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

// Motivasjonsknapp («Hvorfor skal jeg lære matte?»). Instruksen er generell
// (samme uansett hvor i treet eleven er), ikke knyttet til én enkelt node -
// se buildMotivationInstructionTemplate.
function setupMotivationButton() {
  const actions = ensureActionMenu();
  if (!actions) return;

  const btn = document.createElement('button');
  btn.id = 'motivation-btn';
  btn.type = 'button';
  btn.textContent = t('motivation.button');
  btn.title = t('motivation.title');
  btn.addEventListener('click', () => {
    const original = btn.textContent;
    trackCopy('motivation');
    const motivationText = composePrompt('motivation', {});
    navigator.clipboard.writeText(motivationText).then(() => {
      btn.textContent = t('copied');
      setTimeout(() => { btn.textContent = original; }, 1500);
    }).catch(() => {
      window.prompt(t('copyFallback'), motivationText);
    });
  });
  actions.appendChild(btn);
}

// Hjelp-knapp («Hvordan bruker jeg denne siden?»), alle fag. Åpner en popup
// med en kort, generell forklaring av hvordan kartet skal brukes - ikke
// knyttet til noe fagspesifikt utover om faget viser hjelpemiddel-merking
// og/eller motivasjonsknappen. Egen, alltid synlig knapp rett til høyre for
// meny-knappen (IKKE gjemt bak trekkspill-panelet som de andre sjeldnere
// brukte knappene) - siden dette er det første en ny bruker trenger å finne.
/* «?» lå tidligere som en egen knapp i den flytende verktøylinjen, ved
   siden av burgeren. Flyttet INN i menyen 2026-09-20: verktøylinjen skal
   bare ha burgeren og zoom-kontrollene, så grafen får plassen. */
function setupHelpButton() {
  const panel = ensureActionMenu();
  if (!panel) return;

  const btn = document.createElement('button');
  btn.id = 'help-btn';
  btn.type = 'button';
  btn.textContent = t('help.label');
  btn.title = t('help.label');
  btn.addEventListener('click', () => {
    closeActionMenu();
    openHelpModal();
  });
  panel.appendChild(btn);
}

/* ------------------------------------------------------------------ */
/* Kursinformasjon                                                      */
/*                                                                      */
/* Metadataen om treet — fag, nivå, læreplan, hvem som laget det og når  */
/* — og den fullstendige forklaringen av hjelpemiddelnivåene. Det siste  */
/* er grunnen til at vinduet finnes: en merkelapp som «Del 1+2» er       */
/* meningsløs uten et sted å slå opp hva nivåene tillater, og fram til   */
/* nå fantes den teksten bare inne i KI-instruksen.                      */
/*                                                                      */
/* Klikk på en hjelpemiddel-merkelapp åpner dette vinduet, scrollet til  */
/* hjelpemiddelavsnittet.                                               */
/* ------------------------------------------------------------------ */

function setupCourseInfoButton() {
  const panel = ensureActionMenu();
  if (!panel) return;

  const btn = document.createElement('button');
  btn.id = 'course-info-btn';
  btn.type = 'button';
  btn.textContent = t('courseInfo.button');
  btn.title = t('courseInfo.button');
  btn.addEventListener('click', () => {
    closeActionMenu();
    openCourseInfoModal();
  });
  panel.appendChild(btn);
}

function ensureCourseInfoModal() {
  let overlay = document.getElementById('course-info-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'course-info-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeCourseInfoModal(); });

  const modal = document.createElement('div');
  modal.id = 'course-info-modal';

  const header = document.createElement('div');
  header.id = 'course-info-header';
  const h2 = document.createElement('h2');
  h2.textContent = t('courseInfo.heading');
  header.appendChild(h2);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn secondary';
  closeBtn.textContent = t('close');
  closeBtn.addEventListener('click', closeCourseInfoModal);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const body = document.createElement('div');
  body.id = 'course-info-body';
  renderCourseInfoBody(body);
  modal.appendChild(body);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeCourseInfoModal();
  });
  return overlay;
}

/* ------------------------------------------------------------------ */
/* Vokabularoppslag for «Om faget»                                      */
/*                                                                      */
/* meta.json lagrer nøkler («NO», «vgs», «vg2», «mathematics», «nb»),   */
/* ikke ferdig tekst — se /trees/vocabulary.json. Oppslaget her gjøres   */
/* på TREETS eget språk (CONFIG.language), ikke på leserens: trærne er   */
/* enspråklige, og denne sida har ingen språkveksler.                    */
/*                                                                      */
/* Returnerer null når noe mangler, og kallestedet dropper raden. En     */
/* ukjent nøkkel fanges av katalogen, som utelater treet og sier hvorfor */
/* i konsollen — her er det ikke noe å vinne på å gjenta kontrollen.     */
/* ------------------------------------------------------------------ */

function vocabLocalized(entry) {
  if (!entry) return null;
  const code = (CONFIG && CONFIG.language) || 'en';
  return entry[code] || entry.en || null;
}

function vocabText(field, key) {
  if (!VOCAB || !VOCAB[field] || !key) return null;
  const entry = VOCAB[field][key];
  /* Institusjonsnavnet er ÉN streng og oversettes ikke - se vocabulary.json.
     En institusjon har et navn. De andre feltene er vanlige
     {språk: tekst}-oppslag. */
  if (field === 'institution') return (entry && entry.label) || null;
  return vocabLocalized(entry);
}

function vocabInstitution(key) {
  return (VOCAB && VOCAB.institution && key && VOCAB.institution[key]) || null;
}

function vocabDivision(institutionKey, divisionKey) {
  const inst = vocabInstitution(institutionKey);
  if (!inst || !inst.divisions || !divisionKey) return null;
  return vocabLocalized(inst.divisions[divisionKey]);
}

function vocabDivisionLabel(institutionKey) {
  const inst = vocabInstitution(institutionKey);
  return inst ? vocabLocalized(inst.divisionLabel) : null;
}

function renderCourseInfoBody(body) {
  const m = META || {};
  body.innerHTML = '';

  /* Faktatabellen FØRST, ingressen etter. Vidars rekkefølge 2026-09-20:
     den som åpner «Om faget» er ute etter fag, nivå og læreplan, ikke en
     oppsummering de allerede har lest i katalogen.

     Faktatabellen. Bare rader som FINNES vises — et felt ingen har fylt ut
     skal ikke stå igjen som en tom rad. */
  const facts = [
    [t('courseInfo.course'),      m.course],
    /* Inndelingsraden navngis av institusjonen framfor av språkfila:
       «Trinn» for et skoleslag, «Fakultet» for et universitet. Se
       `institution` i /trees/vocabulary.json for hvorfor det ikke finnes
       ett ord som dekker begge. */
    [vocabDivisionLabel(m.institution) || t('courseInfo.division'),
                                  vocabDivision(m.institution, m.division)],
    [t('courseInfo.curriculum'),  m.curriculum],
    [t('courseInfo.institution'), vocabText('institution', m.institution)],
    [t('courseInfo.country'),     vocabText('country', m.country)],
    [t('courseInfo.language'),    vocabText('language', m.language)],
    [t('courseInfo.size'),        nodeCountText(m)],
  ].filter(row => row[1]);

  if (facts.length) {
    const dl = document.createElement('dl');
    dl.className = 'course-info__facts';
    facts.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    });
    body.appendChild(dl);
  }

  if (m.summary || CONFIG.description) {
    const lead = document.createElement('p');
    lead.className = 'course-info__lead';
    lead.textContent = m.summary || CONFIG.description;
    body.appendChild(lead);
  }

  // ---- hjelpemiddelnivåene, i sin helhet --------------------------
  const cfg = aidsConfig();
  if (treeUsesAids() && cfg) {
    const sec = document.createElement('div');
    sec.id = 'course-info-aids';

    const h3 = document.createElement('h3');
    h3.textContent = t('aids.heading');
    sec.appendChild(h3);

    (cfg.levels || []).forEach(lv => {
      const row = document.createElement('p');
      row.className = 'course-info__level';
      const chip = document.createElement('span');
      chip.className = 'aidtag aidtag--static';
      chip.style.background = aidsColor(lv.level);
      chip.textContent = aidsTagText([lv.level]);
      row.appendChild(chip);
      row.appendChild(document.createTextNode(' ' + (lv.student || '')));
      sec.appendChild(row);
    });

    /* Egen tekst her: `aids.multipleNote` er skrevet om ÉN node («Denne
       ferdigheten hører til flere nivåer»), og leser rart i et vindu som
       beskriver hele faget. */
    const note = document.createElement('p');
    note.className = 'course-info__note';
    note.textContent = t('aids.multipleNoteGeneral');
    sec.appendChild(note);

    body.appendChild(sec);
  }

  // ---- hvem, når, lisens ------------------------------------------
  /* Ingen statusrad: ligger treet på sida, er det publisert. Skillet
     utkast/publisert ble fjernet 2026-09-20 — det beskrev hvor ferdig
     Vidar syntes treet var, ikke noe leseren kunne bruke. */
  const credits = [
    ['courseInfo.author',  m.author],
    ['courseInfo.updated', m.updated],
    ['courseInfo.license', m.license],
  ].filter(row => row[1]);

  if (credits.length) {
    const h3 = document.createElement('h3');
    h3.textContent = t('courseInfo.credits');
    body.appendChild(h3);

    const dl = document.createElement('dl');
    dl.className = 'course-info__facts';
    credits.forEach(([key, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = t(key);
      const dd = document.createElement('dd');
      if (key === 'courseInfo.author' && m.authorUrl) {
        const a = document.createElement('a');
        a.href = m.authorUrl;
        a.textContent = value;
        a.rel = 'noopener';
        dd.appendChild(a);
      } else {
        dd.textContent = value;
      }
      dl.append(dt, dd);
    });
    body.appendChild(dl);
  }
}

function nodeCountText(m) {
  const parts = [];
  if (m.skillCount) parts.push(fmtCount('courseInfo.skills', m.skillCount));
  if (m.conceptCount) parts.push(fmtCount('courseInfo.concepts', m.conceptCount));
  if (!parts.length && m.nodeCount) parts.push(fmtCount('courseInfo.nodes', m.nodeCount));
  return parts.join(' · ');
}

function fmtCount(key, n) {
  return t(key, { n: n });
}

function openCourseInfoModal(scrollToAids) {
  const overlay = ensureCourseInfoModal();
  renderCourseInfoBody(document.getElementById('course-info-body'));
  overlay.classList.add('open');
  if (scrollToAids) {
    const sec = document.getElementById('course-info-aids');
    if (sec) sec.scrollIntoView({ block: 'start' });
  }
}

function closeCourseInfoModal() {
  const overlay = document.getElementById('course-info-overlay');
  if (overlay) overlay.classList.remove('open');
}

// Modalen bygges lat, én gang, og gjenbrukes ved senere åpninger - samme
// mønster som ensureGoalIndexModal under.
function ensureHelpModal() {
  let overlay = document.getElementById('help-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'help-overlay';
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeHelpModal();
  });

  const modal = document.createElement('div');
  modal.id = 'help-modal';

  const header = document.createElement('div');
  header.id = 'help-header';

  const h2 = document.createElement('h2');
  h2.textContent = t('help.heading');
  header.appendChild(h2);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn secondary';
  closeBtn.textContent = t('close');
  closeBtn.addEventListener('click', closeHelpModal);
  header.appendChild(closeBtn);

  modal.appendChild(header);

  const body = document.createElement('div');
  body.id = 'help-body';
  renderHelpBody(body);
  modal.appendChild(body);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeHelpModal();
  });

  return overlay;
}

function helpSection(body, heading, text) {
  const h3 = document.createElement('h3');
  h3.textContent = heading;
  body.appendChild(h3);
  const p = document.createElement('p');
  p.textContent = text;
  body.appendChild(p);
}

function renderHelpBody(body) {
  body.innerHTML = '';
  const enabled = { 'feature:aids': treeUsesAids(), 'feature:motivation': SHOW_MOTIVATION_BUTTON };
  (LANG.ui.help.sections || []).forEach(sec => {
    if (sec.when && !enabled[sec.when]) return;
    helpSection(body, sec.heading, sec.body);
  });
}

function openHelpModal() {
  const overlay = ensureHelpModal();
  overlay.classList.add('open');
}

function closeHelpModal() {
  const overlay = document.getElementById('help-overlay');
  if (overlay) overlay.classList.remove('open');
}

function composeGoalIndexText() {
  return themeList
    .map(({ letter, topic, nodes }) => {
      const lines = nodes.map(n => `${n.goalIndex}) ${n.name}`).join('\n');
      return `${letter}) ${topic}\n${lines}`;
    })
    .join('\n\n');
}

// Modalen bygges lat, én gang, og gjenbrukes ved senere åpninger.
function ensureGoalIndexModal() {
  let overlay = document.getElementById('goal-index-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'goal-index-overlay';
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeGoalIndexModal();
  });

  const modal = document.createElement('div');
  modal.id = 'goal-index-modal';

  const header = document.createElement('div');
  header.id = 'goal-index-header';

  const h2 = document.createElement('h2');
  h2.textContent = t('goalIndex.heading');
  header.appendChild(h2);

  const actions = document.createElement('div');
  actions.id = 'goal-index-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = t('goalIndex.copyAll');
  copyBtn.addEventListener('click', () => {
    const text = composeGoalIndexText();
    trackCopy('goal_index');
    navigator.clipboard.writeText(text).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = t('copied');
      setTimeout(() => { copyBtn.textContent = original; }, 1500);
    }).catch(() => {
      window.prompt(t('copyFallback'), text);
    });
  });
  actions.appendChild(copyBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn secondary';
  closeBtn.textContent = t('close');
  closeBtn.addEventListener('click', closeGoalIndexModal);
  actions.appendChild(closeBtn);

  header.appendChild(actions);
  modal.appendChild(header);

  const body = document.createElement('div');
  body.id = 'goal-index-body';
  modal.appendChild(body);

  // Fast bunnlinje (utenfor det scrollbare innholdet) med undervisnings-
  // opplegg-generatoren. Ligger her og ikke i handlingsmenyen fordi selve
  // utvalget av læringsmål skjer i denne lista - knapp og utvalg hører
  // sammen.
  const bar = document.createElement('div');
  bar.id = 'lesson-plan-bar';

  const countLabel = document.createElement('span');
  countLabel.id = 'lesson-plan-count';
  bar.appendChild(countLabel);

  const minutesLabel = document.createElement('label');
  minutesLabel.id = 'lesson-minutes-label';
  minutesLabel.appendChild(document.createTextNode('Lengde'));
  const minutesInput = document.createElement('input');
  minutesInput.type = 'number';
  minutesInput.id = 'lesson-minutes';
  minutesInput.min = '15';
  minutesInput.max = '240';
  minutesInput.step = '5';
  minutesInput.value = String(LESSON_DEFAULT_MINUTES);
  minutesInput.setAttribute('aria-label', t('lesson.minutesAria'));
  minutesLabel.appendChild(minutesInput);
  minutesLabel.appendChild(document.createTextNode('min'));
  bar.appendChild(minutesLabel);

  const planBtn = document.createElement('button');
  planBtn.id = 'lesson-plan-btn';
  planBtn.type = 'button';
  planBtn.textContent = t('lesson.button');
  planBtn.title = t('lesson.title');
  planBtn.addEventListener('click', () => {
    const nodes = getLessonSelectionNodes();
    if (!nodes.length) return;

    const minutes = Math.min(240, Math.max(15, parseInt(minutesInput.value, 10) || LESSON_DEFAULT_MINUTES));
    minutesInput.value = minutes;
    const text = composeLessonPlanInstruction(nodes, minutes);

    trackCopy('lesson_plan', { node_count: nodes.length, lesson_minutes: minutes });

    const original = planBtn.textContent;
    navigator.clipboard.writeText(text).then(() => {
      planBtn.textContent = t('copied');
      setTimeout(() => { planBtn.textContent = original; }, 1500);
    }).catch(() => {
      window.prompt(t('copyFallback'), text);
    });
  });
  bar.appendChild(planBtn);

  modal.appendChild(bar);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeGoalIndexModal();
  });

  return overlay;
}

/* ------------------------------------------------------------------ */
/* Undervisningsopplegg: flyktig utvalg av læringsmål                   */
/* ------------------------------------------------------------------ */

// VIKTIG SKILLE: `mestret` (localStorage, se getProgress) er en VARIG
// tilstand om eleven/klassen og driver fremdriftslinja og prøvegeneratoren.
// `lessonSelection` er noe helt annet: et FLYKTIG utvalg av hvilke
// læringsmål én bestemt undervisningsøkt skal dekke. Det lagres bevisst
// ikke - verken i localStorage eller i CSV - og nullstilles ved reload.
// Å presse begge inn i samme avkryssing på noden i kartet ville gjort
// kartet uleselig; derfor bor dette utvalget kun i læringsmål-lista.
const lessonSelection = new Set();

// Faste rammer for timeplanen. Starter og gjenhenting har fast lengde
// uansett hvor lang økta er; resten av tiden fordeles likt på de valgte
// læringsmålene. Blir det mindre enn LESSON_MIN_GOAL_BLOCK minutter igjen
// per læringsmål, ber instruksen KI-en si fra til læreren om at utvalget er
// for stort for tiden (se composeLessonPlanInstruction).
const LESSON_DEFAULT_MINUTES = 45;
const LESSON_STARTER_MIN = 7;
const LESSON_RECALL_MIN = 5;
const LESSON_DIAGNOSTIC_MIN = 3;
const LESSON_MIN_GOAL_BLOCK = 12;

// Sorteringsnøkkel for en nodes auto-genererte læringsmålkode (A1, A2, ..., B1):
// bokstav først, deretter tall NUMERISK - ren strengsortering ville gitt
// A10 før A2.
function goalIndexSortKey(node) {
  const m = /^([A-Z]+)(\d+)$/.exec(node.goalIndex || '');
  return m ? [m[1], parseInt(m[2], 10)] : ['', 0];
}

function compareByGoalIndex(a, b) {
  const [la, na] = goalIndexSortKey(a);
  const [lb, nb] = goalIndexSortKey(b);
  return la < lb ? -1 : la > lb ? 1 : na - nb;
}

// Alle forfedre (rekursivt, ikke bare direkte foreldre) som IKKE er markert
// som mestret. Brukes kun til å vise status i læringsmål-lista - ikke i
// KI-instruksen for undervisningsopplegget, som bevisst antar at alt
// underliggende er mestret (se composeLessonPlanInstruction).
function getMissingAncestors(node, progress) {
  return getAllAncestors(node)
    .filter(a => !isNodeMastered(a, progress))
    .sort(compareByGoalIndex);
}

// Tre-delt status per node i læringsmål-lista:
//   mestret  - eleven/læreren har krysset av noden
//   klar     - ikke mestret, men alle forutsetninger er det (== isAvailable)
//   mangler  - noen forutsetninger mangler; de listes med kode (C1, C2, ...)
function goalStatus(node, progress) {
  if (isNodeMastered(node, progress)) {
    return { kind: 'mastered', symbol: '✓', text: t('status.mastered') };
  }
  const missing = getMissingAncestors(node, progress);
  if (!missing.length) {
    return { kind: 'ready', symbol: '◇', text: t('status.ready') };
  }
  const codes = missing.map(m => m.goalIndex).join(', ');
  return {
    kind: 'blocked',
    symbol: '⊘',
    text: t('status.blocked', { codes: codes }),
    title: missing.map(m => `${m.goalIndex}) ${m.name}`).join('\n'),
  };
}

function renderGoalIndexBody(body) {
  body.innerHTML = '';
  const progress = getProgress();

  const intro = document.createElement('p');
  intro.id = 'goal-index-intro';
  intro.textContent = t('goalIndex.intro');
  body.appendChild(intro);

  themeList.forEach(({ letter, topic, nodes }) => {
    const section = document.createElement('div');
    section.className = 'goal-index-section';

    const h3 = document.createElement('h3');
    h3.textContent = `${letter}) ${topic}`;
    section.appendChild(h3);

    const ul = document.createElement('ul');
    nodes.forEach(n => {
      const status = goalStatus(n, progress);

      const li = document.createElement('li');
      li.className = 'goal-index-item status-' + status.kind;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'goal-pick';
      cb.id = 'goal-pick-' + n.id;
      cb.checked = lessonSelection.has(n.id);
      cb.setAttribute('aria-label', t('lesson.includeAria', { name: n.name }));
      cb.addEventListener('change', () => {
        if (cb.checked) lessonSelection.add(n.id);
        else lessonSelection.delete(n.id);
        updateLessonPlanBar();
      });
      li.appendChild(cb);

      const main = document.createElement('div');
      main.className = 'goal-index-item-main';

      /* Navnet er en KNAPP som hopper til noden i kartet, ikke en <label>
         som huker av boksen. Avkryssingen er lærerens utvalg til
         undervisningsopplegget — en elev som blar i lista vil se noden,
         ikke plukke den. Boksen står fortsatt der for den som vil krysse. */
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'goal-index-item-name';
      jump.textContent = `${n.goalIndex}) ${n.name}`;
      jump.title = t('goalIndex.openNode');
      jump.addEventListener('click', () => {
        closeGoalIndexModal();
        scrollNodeIntoView(n.id);   // «gå til noden i treet», ikke bare åpne panelet
        openDetail(n.id);
      });
      main.appendChild(jump);

      const badge = document.createElement('span');
      badge.className = 'goal-index-item-status';
      badge.textContent = `${status.symbol} ${status.text}`;
      if (status.title) badge.title = status.title;
      main.appendChild(badge);

      li.appendChild(main);
      ul.appendChild(li);
    });
    section.appendChild(ul);

    body.appendChild(section);
  });
}

function openGoalIndexModal() {
  const overlay = ensureGoalIndexModal();
  renderGoalIndexBody(document.getElementById('goal-index-body'));
  updateLessonPlanBar();
  overlay.classList.add('open');
}

function closeGoalIndexModal() {
  const overlay = document.getElementById('goal-index-overlay');
  if (overlay) overlay.classList.remove('open');
}

/* ------------------------------------------------------------------ */
/* Prøvegenerator: KI-instruks for en prøve basert på mestrede noder    */
/* ------------------------------------------------------------------ */

function setupExamButton() {
  const actions = ensureActionMenu();
  if (!actions) return;

  const widget = document.createElement('div');
  widget.id = 'exam-widget';

  const countLabel = document.createElement('label');
  countLabel.id = 'exam-count-label';
  countLabel.textContent = t('exam.countLabel');
  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.id = 'exam-count';
  countInput.min = '1';
  countInput.max = '50';
  countInput.value = '10';
  countInput.setAttribute('aria-label', t('exam.countAria'));
  countLabel.appendChild(countInput);
  widget.appendChild(countLabel);

  const examBtn = document.createElement('button');
  examBtn.id = 'exam-btn';
  examBtn.type = 'button';
  examBtn.textContent = t('exam.button');
  examBtn.title = t('exam.title');
  widget.appendChild(examBtn);

  examBtn.addEventListener('click', () => {
    const original = examBtn.textContent;
    const progress = getProgress();
    const masteredNodes = allNodes.filter(n => isNodeMastered(n, progress));

    if (!masteredNodes.length) {
      examBtn.textContent = t('exam.none');
      setTimeout(() => { examBtn.textContent = original; }, 1800);
      return;
    }

    const count = Math.min(50, Math.max(1, parseInt(countInput.value, 10) || 10));
    countInput.value = count;
    const text = composeExamInstruction(masteredNodes, count);

    trackCopy('exam', { node_count: masteredNodes.length, task_count: count });

    navigator.clipboard.writeText(text).then(() => {
      examBtn.textContent = t('copied');
      setTimeout(() => { examBtn.textContent = original; }, 1500);
    }).catch(() => {
      window.prompt(t('copyFallback'), text);
    });
  });

  actions.appendChild(widget);
}


// Setter sammen en KI-instruks for å lage en prøve på tvers av alle noder
// eleven (eller læreren) har markert som mestret - ikke bare én enkelt node
// slik composeInstruction() gjør. Prøven trenger ikke dekke alle mestrede
// noder; instruksen ber KI-en velge et representativt utvalg på `count`
// oppgaver som til sammen dekker flest mulig av dem.
function composeExamInstruction(nodes, count) {
  const list = nodes.map(n => {
    const tags = [promptTypeTag(n.type)];
    if (treeUsesAids() && n.aids.length) tags.push(aidsTagText(n.aids));
    return `- ${n.name} [${tags.join(', ')}]: ${n.description}`;
  }).join('\n');

  return composePrompt('exam', {
    hasConcepts: nodes.some(n => n.type === 'concept'),
    allConcepts: nodes.length > 0 && nodes.every(n => n.type === 'concept'),
    aidsText: aidsTextFor(nodes),
    multipleAids: nodes.some(n => (n.aids || []).length > 1),
    vars: {
      nodeCount: nodes.length,
      taskCount: count,
      nodeList: list,
      aidsText: aidsTextFor(nodes),
    },
  });
}

/* Merkelappene i instruksen er verdien rett fra CSV-en, som nå ER
   engelsk ('skill'/'concept') og dermed matcher ordlyden i
   prompts/practice-tutor.json. Se typeLabelText() for etiketten MENNESKER ser. */
function promptTypeTag(type) {
  return type;
}

/* Hjelpemiddelteksten for et UTVALG noder: ta med avsnittet for hver del
   som faktisk er representert, aldri begge hvis bare den ene er det. */
function aidsTextFor(nodes) {
  if (!treeUsesAids()) return '';
  const seen = new Set();
  nodes.forEach(n => (n.aids || []).forEach(l => seen.add(l)));
  return Array.from(seen).sort((a, b) => a - b)
    .map(l => { const lv = aidsLevel(l); return lv ? aidsTagText([l]) + ': ' + lv.model : ''; })
    .filter(Boolean)
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* Undervisningsopplegg: KI-instruks for én konkret undervisningsøkt    */
/* ------------------------------------------------------------------ */

// De valgte nodene, sortert slik de bør undervises: nivaa først (en
// forutsetning har alltid lavere nivå enn det som bygger på den, også på
// tvers av emner - se computeLevels), deretter læringsmålkode som stabil
// tie-break.
function getLessonSelectionNodes() {
  return allNodes
    .filter(n => lessonSelection.has(n.id))
    .sort((a, b) => a.nivaa - b.nivaa || compareByGoalIndex(a, b));
}

function updateLessonPlanBar() {
  const countLabel = document.getElementById('lesson-plan-count');
  const btn = document.getElementById('lesson-plan-btn');
  if (!countLabel || !btn) return;
  const n = lessonSelection.size;
  countLabel.textContent = n === 0
    ? t('lesson.selectedNone')
    : n === 1 ? t('lesson.selectedOne') : t('lesson.selectedMany', { n: n });
  btn.disabled = n === 0;
}

// Fordeler den oppgitte lengden på økta: starter og gjenhenting har fast
// lengde, resten deles likt mellom de valgte læringsmålene (overskytende
// minutter går til de første målene, så summen alltid går opp). Motoren
// regner dette ut i stedet for å overlate fordelingen til KI-en, slik at
// læreren får en forutsigbar timeplan uansett hvilken modell hen bruker.
function buildLessonSchedule(nodes, totalMinutes) {
  const teachingTotal = Math.max(nodes.length, totalMinutes - LESSON_STARTER_MIN - LESSON_RECALL_MIN);
  const base = Math.floor(teachingTotal / nodes.length);
  const extra = teachingTotal - base * nodes.length;

  const lines = [];
  let t = 0;
  const line = CORE.prompts.lessonPlan.sections._scheduleLines;
  lines.push(fill(line.starter, { from: t, to: t + LESSON_STARTER_MIN }));
  t += LESSON_STARTER_MIN;

  nodes.forEach((node, i) => {
    const len = base + (i < extra ? 1 : 0);
    const diag = Math.min(LESSON_DIAGNOSTIC_MIN, Math.max(1, len - 1));
    lines.push(fill(line.goal, { from: t, to: t + len, index: i + 1, name: node.name, diagnostic: diag }));
    t += len;
  });

  lines.push(fill(line.recall, { from: t, to: t + LESSON_RECALL_MIN }));
  t += LESSON_RECALL_MIN;

  return { text: lines.join('\n'), perGoal: base, tight: base < LESSON_MIN_GOAL_BLOCK, total: t };
}

// Fast metodikk-tekst, lik for alle fag. Ligger hardkodet her (ikke i CSV
// og ikke i config.js) på samme måte som BEGREP_TEST_GUIDANCE: dette er
// didaktikk som gjelder på tvers av fag, ikke fagspesifikt innhold.






// Setter sammen KI-instruksen for en hel undervisningsøkt. I motsetning til
// composeInstruction() (som henvender seg til ELEVEN om én node) og
// composeExamInstruction() (som bygger på MESTREDE noder) henvender denne
// seg til LÆREREN, og bygger på noder som ennå ikke er mestret - de som
// skal undervises.
//
// Merk et bevisst valg: forutsetningene (forfedrene til de valgte nodene)
// antas mestret uansett hva som faktisk er huket av i treet, og det gis
// ingen advarsel til læreren om manglende forutsetninger. En lærer som ikke
// orker å krysse av alt ville ellers druknet i advarsler. Hvilke
// forutsetninger som faktisk mangler, vises i stedet som status i
// læringsmål-lista (se goalStatus).
function composeLessonPlanInstruction(nodes, totalMinutes) {
  const schedule = buildLessonSchedule(nodes, totalMinutes);

  const goalList = nodes.map((n, i) => {
    const tags = [promptTypeTag(n.type)];
    if (treeUsesAids() && n.aids.length) tags.push(aidsTagText(n.aids));
    return `${i + 1}. ${n.name} [${tags.join(', ')}]\n   ${n.description}`;
  }).join('\n');

  // Forutsetningene utledes fra avhenger_av-kjeden, som i composeInstruction()
  // - læreren velger kun målene for økta.
  const selectedIds = new Set(nodes.map(n => n.id));
  const prerequisites = [];
  const seen = new Set();
  nodes.forEach(node => {
    getAllAncestors(node).forEach(a => {
      if (selectedIds.has(a.id) || seen.has(a.id)) return;
      seen.add(a.id);
      prerequisites.push(a);
    });
  });

  return composePrompt('lessonPlan', {
    ancestors: prerequisites,
    hasConcepts: nodes.some(n => n.type === 'concept'),
    tight: schedule.tight,
    aidsText: aidsTextFor(nodes),
    multipleAids: nodes.some(n => (n.aids || []).length > 1),
    vars: {
      goalCount: nodes.length,
      totalMinutes: schedule.total,
      perGoal: schedule.perGoal,
      goalList: goalList,
      prerequisiteList: prerequisites.sort(compareByGoalIndex).map(a => '- ' + a.name).join('\n'),
      schedule: schedule.text,
      starterMinutes: LESSON_STARTER_MIN,
      recallMinutes: LESSON_RECALL_MIN,
      aidsText: aidsTextFor(nodes),
    },
  });
}

// Zoomer ut (aldri inn utover 100%) og flytter visningen slik at hele
// grafen - alle emne-kolonner - får plass i det synlige området.
function fitToView() {
  const scrollEl = document.getElementById('graph-scroll');
  const container = document.getElementById('graph-container');
  const contentWidth = parseInt(container.style.width, 10) || container.scrollWidth;
  const contentHeight = parseInt(container.style.height, 10) || container.scrollHeight;
  if (!contentWidth || !contentHeight) return;

  const margin = 0.92; // litt luft rundt kartet
  const fit = Math.min(
    (scrollEl.clientWidth / contentWidth) * margin,
    (scrollEl.clientHeight / contentHeight) * margin,
    1
  );
  setZoom(fit);
  scrollEl.scrollLeft = 0;
  scrollEl.scrollTop = 0;
}

function setupPanning() {
  const scrollEl = document.getElementById('graph-scroll');
  const DRAG_THRESHOLD = 4;
  let isPanning = false;
  let didDrag = false;
  let startX = 0, startY = 0, startScrollLeft = 0, startScrollTop = 0;

  scrollEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    /* A NODE IS PART OF THE MAP, SO YOU CAN GRAB IT AND DRAG.
       `.node-box` used to be excluded here, which made a quarter of the
       visible surface refuse to pan at all — and far more than that inside a
       dense column, where the boxes are most of what there is to put the
       cursor on. Panning from a node is safe because the click that would
       open the detail panel is already suppressed after a real drag: see the
       capture-phase click handler below, which fires before the node's own
       click listener (createNodeElement in this file). Controls inside a node
       — the mastery checkbox, the aid-level tag — are still excluded, since
       dragging is not what you meant when you pressed one of those. */
    if (e.target.closest('input, a, button, textarea, select, label')) return;
    isPanning = true;
    didDrag = false;
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = scrollEl.scrollLeft;
    startScrollTop = scrollEl.scrollTop;
    scrollEl.classList.add('panning');
  });

  window.addEventListener('mousemove', e => {
    if (!isPanning) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!didDrag && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      didDrag = true;
    }
    if (didDrag) {
      scrollEl.scrollLeft = startScrollLeft - dx;
      scrollEl.scrollTop = startScrollTop - dy;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isPanning) return;
    isPanning = false;
    scrollEl.classList.remove('panning');
    /* Clear the drag flag AFTER the click event that follows this mouseup, so
       the handler below still sees it, but a drag that ends without any click
       — released outside the window, say — cannot leave it set and swallow
       the next real click on a node. Matters more now that a drag can start
       on a node box. */
    setTimeout(() => { didDrag = false; }, 0);
  });

  // Hindre at et klikk på en node åpner detaljpanelet når museklikket
  // faktisk var starten på et dra (f.eks. dra-panorering som slutter oppå en node).
  scrollEl.addEventListener('click', e => {
    if (didDrag) {
      e.stopPropagation();
      e.preventDefault();
      didDrag = false;
    }
  }, true);
}

async function init() {
  setupPanning();
  setupZoom();
  setupHelpButton();
  setupCourseInfoButton();
  setupGoalIndexButton();
  setupExamButton();
  if (SHOW_MOTIVATION_BUTTON) setupMotivationButton();
  try {
    /* Nodene er allerede lest av bootstrap() - tree.csv er ÉN fil, og den
       måtte leses først for å finne treets språk. Eksamensoppgaver er en
       egen, valgfri fil: de fleste trær har dem ikke, og kolonnene deres
       ligner ikke nodenes nok til at de hører hjemme i samme tabell. */
    buildNodeIndex(NODE_ROWS);
    /* exams.csv hentes bare når treet sier at den finnes. Alternativet -
       å prøve og ta imot en 404 - virker like godt, men legger igjen en
       rød linje i konsollen for en fil som er valgfri, og det er nettopp
       den slags støy som får en lærer til å tro at noe er i stykker. */
    const exams = FEATURES.exams ? await fetchText('exams.csv').catch(() => null) : null;
    buildExamIndex(exams ? parseCsv(exams) : []);
    validateReferences();
    validateDag();

    renderErrorBanner();
    computeLevels();
    deriveTopicOrder();
    publishEffectiveConfig();
    layoutAndRender();
    updateProgressUI();
  } catch (err) {
    console.error('Kunne ikke laste ferdighetstreet:', err);
    validationErrors.push(t('loadError', { message: err.message }));
    renderErrorBanner();
  }
}

function fetchText(path) {
  const pre = preloaded(path);
  if (pre !== undefined) return Promise.resolve(pre);
  return fetch(path).then(res => {
    if (!res.ok) throw new Error(`Fant ikke ${path} (status ${res.status})`);
    return res.text();
  });
}

function parseCsv(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (result.errors && result.errors.length) {
    result.errors.forEach(e => pushError('errorCsv', { message: e.message, row: e.row }));
  }
  return result.data;
}

/* ------------------------------------------------------------------ */
/* Indeksering av data                                                  */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Hjelpemiddelnivåer (`aids`)                                          */
/*                                                                      */
/* Kolonnen `aids` i tree.csv er enten `0` eller en semikolonliste av    */
/* nivåtall: `1`, `1;2`, `1;3`. Samme separator som `depends_on`, så     */
/* konvensjonen er ikke ny i fila.                                       */
/*                                                                      */
/* `0` og tomt betyr det samme: INGEN merkelapp. Et fag uten en slik     */
/* inndeling setter bare 0 overalt og trenger ingen konfigurasjon — det  */
/* er derfor `features.aids`-bryteren er borte. Om merkelappene vises i  */
/* det hele tatt utledes av DATAENE, ikke av et flagg noen kan glemme.   */
/*                                                                      */
/* Begreper anbefales å stå på 0: en hjelpemiddelregel beskriver hvordan */
/* en ferdighet UTFØRES, og et begrep utføres ikke. Se AGENTS.md.        */
/* ------------------------------------------------------------------ */

function parseAids(raw) {
  return String(raw || '')
    .split(';')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

function aidsConfig() { return (CONFIG && CONFIG.aids) || null; }

function aidsLevel(n) {
  const cfg = aidsConfig();
  if (!cfg) return null;
  return (cfg.levels || []).filter(l => l.level === n)[0] || null;
}

/* Merkelappteksten. Ett nivå → «Del 1» (eller nivåets eget `name`).
   Flere → «Del 1+2». En sammensatt lapp har ALLTID ord på seg: fargene
   skiller seg på kulør, ikke på lyshet, så teksten er det som bærer
   betydningen. Se kommentaren ved --aid-* i tokens.css. */
function aidsTagText(levels) {
  const cfg = aidsConfig();
  if (!cfg || !levels.length) return '';
  const noun = cfg.label || '';
  if (levels.length === 1) {
    const one = aidsLevel(levels[0]);
    if (one && one.name) return one.name;
    return (noun ? noun + ' ' : '') + levels[0];
  }
  return (noun ? noun + ' ' : '') + levels.join('+');
}

/* Vises merkelappene på dette treet? Ja hvis minst én node nevner et
   nivå. Utledet, ikke konfigurert. */
function treeUsesAids() {
  return !!aidsConfig() && allNodes.some(n => n.aids && n.aids.length);
}

/* Merkelappen. Knapp, ikke <span>: den er klikkbar og sender leseren til
   hjelpemiddelavsnittet i detaljpanelet, som er det ENESTE stedet en
   elev får vite hva nivået faktisk betyr. */
function makeAidsTag(node) {
  const levels = node.aids || [];
  if (!levels.length) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'aidtag' + (levels.length > 1 ? ' aidtag--split' : '');
  btn.textContent = aidsTagText(levels);
  btn.title = t('aids.tagTitle');

  if (levels.length === 1) {
    btn.style.background = aidsColor(levels[0]);
  } else {
    /* Like brede striper, én per nivå, i nivårekkefølge. */
    const step = 100 / levels.length;
    const stops = levels.map((lv, i) =>
      `${aidsColor(lv)} ${i * step}%, ${aidsColor(lv)} ${(i + 1) * step}%`).join(', ');
    btn.style.background = `linear-gradient(90deg, ${stops})`;
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    openCourseInfoModal(true);
  });
  return btn;
}

/* Fargen er bundet til NIVÅET, ikke til faget: nivå 1 er alltid --aid-1.
   Det er det som gjør at en norsk «Del 1» og en IB «Paper 1» ser like ut,
   og som holder hex-verdier ute av et tres egne filer. */
function aidsColor(level) {
  const n = ((level - 1) % 5) + 1;
  return `var(--aid-${n})`;
}

function buildNodeIndex(rows) {
  nodesById = new Map();
  allNodes = [];
  rows.forEach(row => {
    const id = (row.id || '').trim();
    if (!id) return;
    const node = {
      id,
      type: (row.type || '').trim(),
      topic: (row.topic || '').trim() || t('defaultTopic'),
      name: (row.name || '').trim(),
      description: (row.description || '').trim(),
      depends_on: (row.depends_on || '').split(';').map(s => s.trim()).filter(Boolean),
      aids: parseAids(row.aids),
      instruction: (row.instruction || '').trim(),
      children: [],
      nivaa: 0,
      x: 0,
      y: 0,
    };
    nodesById.set(id, node);
    allNodes.push(node);
  });

  allNodes.forEach(node => {
    node.depends_on.forEach(depId => {
      const dep = nodesById.get(depId);
      if (dep) dep.children.push(node.id);
    });
  });
}

function buildExamIndex(rows) {
  examsByNode = new Map();
  rows.forEach(row => {
    const nodeId = (row.node_id || '').trim();
    if (!nodeId) return;
    if (!examsByNode.has(nodeId)) examsByNode.set(nodeId, []);
    examsByNode.get(nodeId).push({
      year: (row.year || '').trim(),
      season: (row.season || '').trim(),
      aids: (row.aids || '').trim(),
      number: (row.number || '').trim(),
      url: (row.url || '').trim(),
    });
  });
}

/* ------------------------------------------------------------------ */
/* Validering                                                           */
/* ------------------------------------------------------------------ */

function validateReferences() {
  allNodes.forEach(node => {
    node.depends_on.forEach(depId => {
      if (!nodesById.has(depId)) {
        pushError('errorUnknownDep', { id: node.id, dep: depId });
      }
    });
    if (node.topic === 'Annet' && !TOPIC_ORDER.includes('Annet')) {
      pushError('errorNoTopic', { id: node.id, topic: t('defaultTopic') });
    }
  });
  examsByNode.forEach((rows, nodeId) => {
    if (!nodesById.has(nodeId)) {
      pushError('errorUnknownExamNode', { id: nodeId });
    }
  });
}

function validateDag() {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(allNodes.map(n => [n.id, WHITE]));
  const stack = [];

  function visit(node) {
    color.set(node.id, GRAY);
    stack.push(node.id);
    for (const depId of node.depends_on) {
      const dep = nodesById.get(depId);
      if (!dep) continue;
      const c = color.get(dep.id);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(dep.id);
        const cycle = stack.slice(cycleStart).concat(dep.id);
        pushError('errorCycle', { cycle: cycle.join(' → ') });
      } else if (c === WHITE) {
        visit(dep);
      }
    }
    stack.pop();
    color.set(node.id, BLACK);
  }

  allNodes.forEach(node => {
    if (color.get(node.id) === WHITE) visit(node);
  });
}

/* En config-feil oppdages FØR språkfila er lastet - den er jo funnet i
   fila som sier hvilket språk treet er på. Derfor lagres den som nøkkel
   og verdier, og oversettes først når den skal vises. */
function pushError(key, vars) {
  validationErrors.push({ key: key, vars: vars });
}

function errorText(e) {
  if (typeof e === 'string') return e;
  const main = t(e.key, e.vars);
  return e.vars && e.vars.guess ? main + ' ' + t('errorDidYouMean', { key: e.vars.guess }) : main;
}

function renderErrorBanner() {
  const banner = document.getElementById('error-banner');
  if (!validationErrors.length) {
    banner.classList.remove('visible');
    banner.textContent = '';
    return;
  }
  const lines = validationErrors.map(errorText);
  console.warn('Ferdighetstre-validering fant problemer:\n' + lines.join('\n'));
  banner.textContent = t('errorBanner', { n: lines.length }) + '\n' + lines.join('\n');
  banner.classList.add('visible');
}

/* ------------------------------------------------------------------ */
/* Layout: emne-kolonner, lagdelt graf + barycenter innad i hver kolonne */
/* ------------------------------------------------------------------ */

// Grafen deles i én kolonne per "emne" (fagområde). Uten dette havner alle
// noder på samme rad basert på lengste sti fra en rot-node *i hele grafen*,
// slik at helt urelaterte tema (f.eks. prosentregning og statistikk) tvinges
// sammen på de samme radene og gir svært brede, uoversiktlige rader. Med
// kolonner får hvert emne vokse nedover i sitt eget tempo, og brede rader
// innad i en kolonne brytes i tillegg over flere rader (se wrapLevelRows).

function groupByColumn() {
  const columns = new Map();
  allNodes.forEach(node => {
    if (!columns.has(node.topic)) columns.set(node.topic, []);
    columns.get(node.topic).push(node);
  });
  const known = TOPIC_ORDER.filter(t => columns.has(t));
  const unknown = [...columns.keys()]
    .filter(t => !TOPIC_ORDER.includes(t))
    .sort((a, b) => a.localeCompare(b, 'nb'));
  return [...known, ...unknown].map(topic => ({ topic, nodes: columns.get(topic) }));
}

// Nivå per node = lengste sti fra en rot-node i HELE grafen (ikke bare innad i
// kolonnen). Dette er bevisst globalt: hvis f.eks. en node i én kolonne
// avhenger av noe som ligger dypt nede i en annen kolonne, skal hele
// undertreet dens starte tilsvarende langt ned - ikke øverst i sin egen
// kolonne. Kolonner som ikke har noen eksterne avhengigheter starter
// fortsatt øverst (nivå 0), som før.
function computeLevels() {
  const memo = new Map();
  const inProgress = new Set();

  function level(node) {
    if (memo.has(node.id)) return memo.get(node.id);
    if (inProgress.has(node.id)) return 0; // syklus - allerede rapportert av validateDag
    inProgress.add(node.id);
    let lvl = 0;
    node.depends_on.forEach(depId => {
      const dep = nodesById.get(depId);
      if (dep) lvl = Math.max(lvl, level(dep) + 1);
    });
    inProgress.delete(node.id);
    memo.set(node.id, lvl);
    return lvl;
  }

  allNodes.forEach(node => {
    node.nivaa = level(node);
  });
}

/* Temarekkefølgen er kolonnerekkefølgen fra venstre mot høyre, og den
   UTLEDES når `topicOrder` ikke er oppgitt: sortert på laveste nivå blant
   temaets noder, så på median nivå, så alfabetisk.

   Poenget med laveste nivå er at toppen av hver kolonne da danner en trapp
   nedover fra venstre mot høyre - står et tema langt til høyre, er det
   fordi du må lenger ned i treet før du kan begynne på det. Bildet viser
   dermed sin egen sorteringsregel, og en lærer leser treet i den
   rekkefølgen faget kan tas.

   Median er med som nummer to nøkkel fordi ETT trivielt inngangsemne på
   nivå 0 ellers river hele temaet helt til venstre, selv om resten av det
   ligger dypt. Alfabetisk til slutt, fordi det er den eneste tie-breaken
   som ikke flytter seg når læreren sorterer om i regnearket sitt. */
function deriveTopicOrder() {
  if (TOPIC_ORDER.length) return;   // en oppgitt rekkefølge vinner alltid

  const levels = new Map();
  allNodes.forEach(node => {
    if (!levels.has(node.topic)) levels.set(node.topic, []);
    levels.get(node.topic).push(node.nivaa);
  });

  const locale = (LANG && (LANG.htmlLang || LANG.code)) || 'nb';
  const stats = [...levels.entries()].map(([topic, lv]) => {
    const sorted = [...lv].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return {
      topic: topic,
      min: sorted[0],
      median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    };
  });

  stats.sort((a, b) =>
    a.min - b.min ||
    a.median - b.median ||
    a.topic.localeCompare(b.topic, locale));

  TOPIC_ORDER = stats.map(s => s.topic);
}

/* Utleder du noe, skylder du brukeren å se hva du utledet. Byggersida på
   /make-your-own/ viser dette som «slik forsto jeg innstillingene dine»;
   her legges det bare fram. */
function publishEffectiveConfig() {
  if (typeof window === 'undefined') return;
  window.AIST_EFFECTIVE_CONFIG = {
    title: CONFIG.title || '',
    description: CONFIG.description || '',
    language: CONFIG.language || '',
    languageName: CONVERSATION_LANGUAGE,
    subjectFamily: CONFIG.subjectFamily || '',
    storageKey: STORAGE_KEY,
    topicOrder: TOPIC_ORDER.slice(),
    topicOrderDerived: !(CONFIG.topicOrder && CONFIG.topicOrder.length),
    features: Object.assign({}, FEATURES),
    slots: Object.assign({}, CONFIG.slots || {}),
    aids: CONFIG.aids || null,
    nodeCount: allNodes.length,
    skillCount: allNodes.filter(n => n.type === 'skill').length,
    conceptCount: allNodes.filter(n => n.type === 'concept').length,
    rootCount: allNodes.filter(n => !n.depends_on.length).length,
    depth: allNodes.reduce((m, n) => Math.max(m, n.nivaa), 0) + 1,
    promptOverrides: Object.keys(PROMPT_ROWS),
    errors: validationErrors.map(errorText),
  };
  window.dispatchEvent(new CustomEvent('aist:ready', { detail: window.AIST_EFFECTIVE_CONFIG }));
}

function assignOrderIndex(row) {
  row.forEach((node, i) => { node.orderIndex = i; });
}

function barycenterSortRow(row, relationField, idsInColumn) {
  row.forEach(node => {
    const related = node[relationField]
      .filter(id => idsInColumn.has(id))
      .map(id => nodesById.get(id))
      .filter(Boolean);
    if (!related.length) {
      node._barycenter = node.orderIndex; // behold posisjon hvis ingen relasjon i denne kolonnen
    } else {
      node._barycenter = related.reduce((s, n) => s + n.orderIndex, 0) / related.length;
    }
  });
  row.sort((a, b) => a._barycenter - b._barycenter);
}

// Hvor mange visuelle rader trengs for `count` noder på ett nivå i én kolonne,
// gitt at en rad brytes når den blir bredere enn LAYOUT.maxNodesPerRow.
function chunksNeeded(count) {
  return count > 0 ? Math.ceil(count / LAYOUT.maxNodesPerRow) : 0;
}

// Radstart (visuell radindeks) per globalt nivå, felles for ALLE kolonner.
//
// `nivaa` beregnes bevisst globalt (se computeLevels) nettopp for at "lenger
// ned i grafen" skal bety det samme uansett kolonne - en node med høyere
// nivaa enn en av sine forutsetninger skal alltid tegnes på samme rad eller
// lenger ned, selv når forutsetningen ligger i en annen kolonne (emne). Hvis
// radbryting (se layoutColumn) kun forskyver rader PER KOLONNE, brytes denne
// garantien: en kolonne med mange noder på et tidlig nivå bryter i flere
// rader og skyver sine egne senere nivåer nedover, mens en tynnere kolonne
// ikke gjør det - da kan en node med lavt nivaa ende visuelt UNDER en node
// med høyere nivaa i en annen kolonne, selv om førstnevnte er en forutsetning
// for sistnevnte (linjen mellom dem peker da "oppover", som er misvisende).
//
// Løsningen: finn, for hvert nivå, det STØRSTE antallet rader noen kolonne
// trenger for det nivået (maks over alle kolonner), og la alle kolonner
// bruke denne samme radstarten per nivå. Tynne kolonner får da tomme
// mellomrom der en annen kolonne trengte flere rader - det er prisen for at
// nivaa fortsatt betyr det samme overalt i kartet.
function computeGlobalRowStarts(columns) {
  const maxLevel = allNodes.reduce((m, n) => Math.max(m, n.nivaa), 0);
  const rowStart = [];
  let cursor = 0;
  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    rowStart.push(cursor);
    let rowsForLevel = 1;
    columns.forEach(({ nodes }) => {
      const count = nodes.filter(n => n.nivaa === lvl).length;
      rowsForLevel = Math.max(rowsForLevel, chunksNeeded(count));
    });
    cursor += rowsForLevel;
  }
  return rowStart;
}

// Legger nodene i én kolonne ut i visuelle rader. Radstart per nivå kommer
// fra `globalRowStart` (se computeGlobalRowStarts) slik at nivåer forblir
// synkronisert på tvers av kolonner selv når enkelte kolonner bryter brede
// rader i flere visuelle rader. Nivåer kolonnen ikke har noen noder på blir
// stående tomme (arrayet får "hull" der), noe som er nettopp poenget: det er
// slik en kolonne med en dyp ekstern avhengighet får luft over seg i stedet
// for å starte helt øverst.
function layoutColumn(nodes, globalRowStart) {
  const idsInColumn = new Set(nodes.map(n => n.id));
  const levelsPresent = [...new Set(nodes.map(n => n.nivaa))].sort((a, b) => a - b);
  const levelRows = new Map();
  levelsPresent.forEach(lvl => levelRows.set(lvl, []));
  nodes.forEach(node => levelRows.get(node.nivaa).push(node));

  // Startrekkefølge: stabil, alfabetisk på navn for et deterministisk utgangspunkt
  levelRows.forEach(row => row.sort((a, b) => a.name.localeCompare(b.name, 'nb')));
  levelsPresent.forEach(lvl => assignOrderIndex(levelRows.get(lvl)));

  for (let pass = 0; pass < LAYOUT.barycenterPasses; pass++) {
    const topDown = pass % 2 === 0;
    const order = topDown ? levelsPresent : [...levelsPresent].reverse();
    order.forEach(lvl => barycenterSortRow(levelRows.get(lvl), topDown ? 'depends_on' : 'children', idsInColumn));
    levelsPresent.forEach(lvl => assignOrderIndex(levelRows.get(lvl)));
  }

  const visualRows = [];
  levelsPresent.forEach(lvl => {
    const row = levelRows.get(lvl);
    const chunks = [];
    for (let i = 0; i < row.length; i += LAYOUT.maxNodesPerRow) chunks.push(row.slice(i, i + LAYOUT.maxNodesPerRow));
    chunks.forEach((chunk, i) => { visualRows[globalRowStart[lvl] + i] = chunk; });
  });

  return visualRows; // sparse: tomme nivåer/rader gir hull som forEach/reduce hopper over
}

// Bokstav for kolonne nr. `index` (0-basert): A, B, C, ..., Z, AA, AB, ...
// (samme mønster som kolonnenavn i et regneark), i tilfelle et fag skulle få
// flere enn 26 emner.
function columnLetter(index) {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// Systematisk indeksering av læringsmål: auto-generert, ALDRI lagret i CSV
// (se "Ikke gjør" i instruks.md). Hvert emne (kolonne) får en bokstav, i
// samme rekkefølge som kolonnene vises i kartet (styrt av TOPIC_ORDER - se
// groupByColumn). Innad i hvert emne får hver node et sekvensielt nummer,
// sortert på (nivaa, y, x):
//   - node.nivaa (se computeLevels) er beregnet globalt og garanterer at en
//     forutsetning alltid har lavere nivå enn alt som (direkte eller
//     indirekte) avhenger av den - også når avhengigheten krysser kolonner.
//     Dermed vil et læringsmål alltid få et lavere tall enn det som bygger
//     videre på det, innad i samme emne ("nedover i treet" -> økende tall).
//   - y og x (satt av layoutColumn/layoutAndRender rett før dette kalles) er
//     kun tie-break for et stabilt, lesbart resultat som følger rekkefølgen
//     nodene faktisk vises i kartet (rad for rad, venstre mot høyre).
function assignLearningGoalIndices(columns) {
  themeList = columns.map(({ topic, nodes }, i) => {
    const letter = columnLetter(i);
    const sorted = [...nodes].sort((a, b) => a.nivaa - b.nivaa || a.y - b.y || a.x - b.x);
    sorted.forEach((node, j) => { node.goalIndex = `${letter}${j + 1}`; });
    return { letter, topic, nodes: sorted };
  });
}

function layoutAndRender() {
  const columns = groupByColumn();
  const globalRowStart = computeGlobalRowStarts(columns);
  const columnMeta = [];
  let cursorX = 0;

  columns.forEach(({ topic, nodes }) => {
    const visualRows = layoutColumn(nodes, globalRowStart);
    const colWidthNodes = visualRows.reduce((m, row) => Math.max(m, row.length), 1);
    const colPixelWidth = colWidthNodes * LAYOUT.nodeWidth + Math.max(0, colWidthNodes - 1) * LAYOUT.hGap;

    visualRows.forEach((row, rowIndex) => {
      const rowWidth = row.length * LAYOUT.nodeWidth + Math.max(0, row.length - 1) * LAYOUT.hGap;
      const rowStartX = cursorX + (colPixelWidth - rowWidth) / 2;
      row.forEach((node, i) => {
        node.x = rowStartX + i * (LAYOUT.nodeWidth + LAYOUT.hGap);
        node.y = LAYOUT.columnLabelHeight + rowIndex * (LAYOUT.nodeHeight + LAYOUT.vGap);
      });
    });

    columnMeta.push({ topic, x: cursorX, width: colPixelWidth, rowCount: visualRows.length, nodes });
    cursorX += colPixelWidth + LAYOUT.columnGap;
  });

  const totalWidth = Math.max(0, cursorX - LAYOUT.columnGap) + LAYOUT.padding * 2;
  const maxRowCount = columnMeta.reduce((m, c) => Math.max(m, c.rowCount), 0);
  const totalHeight = LAYOUT.columnLabelHeight
    + maxRowCount * LAYOUT.nodeHeight + Math.max(0, maxRowCount - 1) * LAYOUT.vGap
    + LAYOUT.padding * 2;

  const container = document.getElementById('graph-container');
  container.style.width = totalWidth + 'px';
  container.style.height = totalHeight + 'px';

  assignLearningGoalIndices(columns);
  renderGraph(columnMeta);
}

/* ------------------------------------------------------------------ */
/* Rendering av grafen                                                  */
/* ------------------------------------------------------------------ */

function renderGraph(columnMeta) {
  const container = document.getElementById('graph-container');
  const nodesLayer = document.getElementById('nodes-layer');
  const headersLayer = document.getElementById('column-headers');
  const bandsLayer = document.getElementById('column-bands');
  const svg = document.getElementById('edges');
  nodesLayer.innerHTML = '';
  headersLayer.innerHTML = '';
  bandsLayer.innerHTML = '';
  svg.innerHTML = '';

  const width = container.clientWidth || parseInt(container.style.width, 10);
  const height = container.clientHeight || parseInt(container.style.height, 10);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  // Bakgrunnsbånd bak hver kolonne, annenhver farge, så det er lett å se hvor
  // ett emne slutter og det neste begynner.
  const bandHeight = height - LAYOUT.padding * 2;
  columnMeta.forEach((col, i) => {
    const band = document.createElement('div');
    band.className = 'column-band' + (i % 2 === 1 ? ' column-band-alt' : '');
    band.style.left = (LAYOUT.padding + col.x - LAYOUT.columnGap / 2) + 'px';
    band.style.top = LAYOUT.padding + 'px';
    band.style.width = (col.width + LAYOUT.columnGap) + 'px';
    band.style.height = bandHeight + 'px';
    bandsLayer.appendChild(band);
  });

  // Kolonneoverskrifter, med snarveier for å merke/fjerne mestret-status for
  // alle noder i temaet samtidig (se bulkSetMastery).
  columnMeta.forEach(col => {
    const header = document.createElement('div');
    header.className = 'column-header';
    header.style.left = (LAYOUT.padding + col.x) + 'px';
    header.style.top = LAYOUT.padding + 'px';
    header.style.width = col.width + 'px';

    const label = document.createElement('span');
    label.className = 'column-header-label';
    label.textContent = col.topic;
    header.appendChild(label);

    const actions = document.createElement('span');
    actions.className = 'column-header-actions';

    const markBtn = document.createElement('button');
    markBtn.type = 'button';
    markBtn.className = 'column-header-btn';
    markBtn.textContent = '✓';
    markBtn.title = t('column.markAll', { topic: col.topic });
    markBtn.addEventListener('click', () => bulkSetMastery(col.nodes, true));
    actions.appendChild(markBtn);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'column-header-btn';
    clearBtn.textContent = '✕';
    clearBtn.title = t('column.clearAll', { topic: col.topic });
    clearBtn.addEventListener('click', () => bulkSetMastery(col.nodes, false));
    actions.appendChild(clearBtn);

    header.appendChild(actions);
    headersLayer.appendChild(header);
  });

  const progress = getProgress();

  // Kanter
  allNodes.forEach(node => {
    node.depends_on.forEach(depId => {
      const dep = nodesById.get(depId);
      if (!dep) return;
      const x1 = LAYOUT.padding + dep.x + LAYOUT.nodeWidth / 2;
      const y1 = LAYOUT.padding + dep.y + LAYOUT.nodeHeight;
      const x2 = LAYOUT.padding + node.x + LAYOUT.nodeWidth / 2;
      const y2 = LAYOUT.padding + node.y;
      const midY = (y1 + y2) / 2;
      const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      if (isNodeMastered(dep, progress) && isNodeMastered(node, progress)) {
        path.classList.add('edge-active');
      }
      svg.appendChild(path);
    });
  });

  // Noder
  allNodes.forEach(node => {
    nodesLayer.appendChild(createNodeElement(node, progress));
  });
}

function createNodeElement(node, progress) {
  const el = document.createElement('div');
  el.className = `node-box type-${node.type}`;
  el.style.left = (LAYOUT.padding + node.x) + 'px';
  el.style.top = (LAYOUT.padding + node.y) + 'px';
  el.style.width = LAYOUT.nodeWidth + 'px';
  el.style.minHeight = LAYOUT.nodeHeight + 'px';
  el.dataset.nodeId = node.id;

  const mastered = isNodeMastered(node, progress);
  const available = isAvailable(node, progress);
  if (mastered) el.classList.add('mastered');
  if (!available && !mastered) el.classList.add('locked');
  if (node.id === activeNodeId) el.classList.add('active');

  const topRow = document.createElement('div');
  topRow.className = 'node-top-row';

  const name = document.createElement('div');
  name.className = 'node-name';
  const indexSpan = document.createElement('span');
  indexSpan.className = 'node-index';
  indexSpan.textContent = node.goalIndex + ') ';
  name.appendChild(indexSpan);
  name.appendChild(document.createTextNode(node.name));
  topRow.appendChild(name);

  el.appendChild(topRow);

  const entry = progress[node.id] || {};

  const meta = document.createElement('div');
  meta.className = 'node-meta';

  const metaLeft = document.createElement('div');
  metaLeft.className = 'node-meta-left';
  if (treeUsesAids()) { const tag = makeAidsTag(node); if (tag) metaLeft.appendChild(tag); }
  const typeLabel = document.createElement('span');
  typeLabel.className = 'badge-type';
  typeLabel.textContent = typeLabelText(node.type);
  metaLeft.appendChild(typeLabel);
  meta.appendChild(metaLeft);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'node-checkbox';
  checkbox.checked = !!entry.mastered;
  checkbox.title = t('node.markMastered');
  checkbox.addEventListener('click', e => e.stopPropagation());
  checkbox.addEventListener('change', () => setNodeProgress(node.id, 'mastered', checkbox.checked));
  meta.appendChild(checkbox);

  el.appendChild(meta);

  el.addEventListener('click', () => openDetail(node.id));

  return el;
}

function createMasteryToggle(labelText, checked, onChange) {
  const label = document.createElement('label');
  label.className = 'mastered-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  label.appendChild(input);
  label.appendChild(document.createTextNode(labelText));
  return label;
}


/* ------------------------------------------------------------------ */
/* Progresjon / localStorage                                            */
/* ------------------------------------------------------------------ */

// Alle noder (ferdighet og begrep) har én avkrysning: mestret eller ikke.
// Lagringsformat per node-id: { mastered: bool }.

function getProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function setProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function setNodeProgress(nodeId, key, value) {
  const progress = getProgress();
  const entry = progress[nodeId] || {};
  entry[key] = value;
  progress[nodeId] = entry;
  setProgress(progress);
  refreshAfterProgressChange();
}

// Setter mestret-status for flere noder samtidig (brukt av "marker/fjern
// alle"-knappene i kolonneoverskriften), med kun én render/lagring til slutt.
function bulkSetMastery(nodes, mastered) {
  const progress = getProgress();
  nodes.forEach(node => {
    const entry = progress[node.id] || {};
    entry.mastered = mastered;
    progress[node.id] = entry;
  });
  setProgress(progress);
  refreshAfterProgressChange();
}

function isNodeMastered(node, progress) {
  const entry = progress[node.id];
  return !!(entry && entry.mastered);
}

function isAvailable(node, progress) {
  if (!node.depends_on.length) return true;
  return node.depends_on.every(depId => {
    const dep = nodesById.get(depId);
    return dep && isNodeMastered(dep, progress);
  });
}

function refreshAfterProgressChange() {
  layoutAndRender();
  updateProgressUI();
  if (activeNodeId) renderDetail(nodesById.get(activeNodeId));
}

function updateProgressUI() {
  const progress = getProgress();
  const total = allNodes.length;
  const done = allNodes.filter(n => isNodeMastered(n, progress)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = t('progressLabel', { done: done, total: total });
}

/* ------------------------------------------------------------------ */
/* Forfedre / KI-instruks-komposisjon                                   */
/* ------------------------------------------------------------------ */

function getAllAncestors(node) {
  const visited = new Set();
  const result = [];

  function visit(n) {
    n.depends_on.forEach(depId => {
      if (visited.has(depId)) return;
      visited.add(depId);
      const dep = nodesById.get(depId);
      if (!dep) return;
      visit(dep);
      result.push(dep);
    });
  }

  visit(node);
  return result;
}

// Hjelpemiddel-konteksten (del1/del2/begge) er faglig innhold - hvert fag
// definerer selv teksten i tree.csv (aids.<n>.model), siden
// hva "hjelpemidler" betyr og hvilke regler som gjelder varierer per fag.


function composeInstruction(node) {
  const ancestors = getAllAncestors(node);
  return composePrompt('node', {
    node: node,
    ancestors: ancestors,
    /* Alle nivåene sendes alltid, og når det er FLERE legges regelen ved:
       eleven skal klare ferdigheten under det strengeste av dem. Uten den
       leser modellen to hjelpemiddelavsnitt uten å vite hva den skal gjøre
       med dem. Vidars beslutning, 2026-09-20. */
    multipleAids: (node.aids || []).length > 1,
    vars: {
      nodeName: node.name,
      nodeDescription: node.description,
      prerequisiteList: ancestors.map(a => '- ' + a.name).join('\n'),
    },
    // Kjøretidsseksjoner: tekst motoren bygger av selve grafen, som
    // ingen av de tre filene kan kjenne på forhånd.
    sections: {
      nodeInstruction: node.instruction || null,
      aids: treeUsesAids() ? aidsTextFor([node]) : null,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Detaljpanel                                                          */
/* ------------------------------------------------------------------ */

function scrollNodeIntoView(nodeId) {
  const el = document.querySelector(`.node-box[data-node-id="${nodeId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  el.classList.remove('highlight-pulse');
  void el.offsetWidth; // tving reflow, slik at animasjonen kan starte på nytt ved gjentatte klikk
  el.classList.add('highlight-pulse');
  setTimeout(() => el.classList.remove('highlight-pulse'), 1600);
}

function openDetail(nodeId) {
  activeNodeId = nodeId;
  document.querySelectorAll('.node-box').forEach(el => {
    el.classList.toggle('active', el.dataset.nodeId === nodeId);
  });
  document.getElementById('detail-panel').classList.add('open');
  renderDetail(nodesById.get(nodeId));
}

function closeDetail() {
  activeNodeId = null;
  document.getElementById('detail-panel').classList.remove('open');
  document.querySelectorAll('.node-box.active').forEach(el => el.classList.remove('active'));
}

function renderDetail(node) {
  if (!node) return;
  const inner = document.getElementById('detail-panel-inner');
  const progress = getProgress();
  const entry = progress[node.id] || {};
  const mastered = isNodeMastered(node, progress);
  const available = isAvailable(node, progress);
  const ancestors = getAllAncestors(node);
  const exams = examsByNode.get(node.id) || [];

  inner.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'detail-close';
  closeBtn.textContent = t('closeLower');
  closeBtn.addEventListener('click', closeDetail);
  inner.appendChild(closeBtn);

  const h2 = document.createElement('h2');
  h2.textContent = `${node.goalIndex}) ${node.name}`;
  inner.appendChild(h2);

  const meta = document.createElement('div');
  meta.id = 'detail-meta';
  if (treeUsesAids()) { const tag = makeAidsTag(node); if (tag) meta.appendChild(tag); }
  const typeBadge = document.createElement('span');
  typeBadge.className = 'badge-type';
  typeBadge.textContent = typeLabelText(node.type);
  meta.appendChild(typeBadge);
  inner.appendChild(meta);

  const status = document.createElement('div');
  status.id = 'detail-status';
  status.textContent = mastered
    ? t('detail.mastered')
    : available ? t('detail.available') : t('detail.locked');
  if (available && !mastered) status.classList.add('available');
  inner.appendChild(status);

  const toggles = document.createElement('div');
  toggles.className = 'mastery-toggles';
  toggles.appendChild(createMasteryToggle(t('node.markMastered'), entry.mastered, checked => setNodeProgress(node.id, 'mastered', checked)));
  inner.appendChild(toggles);

  const desc = document.createElement('p');
  desc.id = 'detail-desc';
  desc.textContent = node.description;
  inner.appendChild(desc);

  /* Hjelpemiddelforklaringen ligger IKKE her, men i kursinfo-vinduet:
     nivåene er en egenskap ved FAGET, ikke ved noden, og å gjenta den
     lange teksten i hver eneste node ville vært den samme dupliseringen
     dette repoet nettopp har ryddet vekk. Merkelappen i meta-raden over
     er klikkbar og åpner vinduet på riktig avsnitt. */

  if (ancestors.length) {
    const h3 = document.createElement('div');
    h3.className = 'badge-type';
    h3.style.marginBottom = '0.4rem';
    h3.textContent = t('detail.prereqs');
    inner.appendChild(h3);
    const ul = document.createElement('ul');
    ul.className = 'prereq-list';
    ancestors.forEach(a => {
      const li = document.createElement('li');
      const aMastered = isNodeMastered(a, progress);
      li.className = 'prereq-item' + (aMastered ? ' prereq-item-done' : '');
      const check = document.createElement('span');
      check.className = 'prereq-check';
      check.textContent = aMastered ? '✓' : '○';
      check.title = aMastered ? t('status.mastered') : t('status.notMastered');
      li.appendChild(check);
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'prereq-link';
      link.textContent = a.name;
      link.addEventListener('click', () => {
        openDetail(a.id);
        scrollNodeIntoView(a.id);
      });
      li.appendChild(link);
      ul.appendChild(li);
    });
    inner.appendChild(ul);
  }

  const actions = document.createElement('div');
  actions.className = 'instruction-actions';

  const showBtn = document.createElement('button');
  showBtn.className = 'btn secondary';
  showBtn.textContent = t('detail.show');
  actions.appendChild(showBtn);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = t('detail.copy');
  actions.appendChild(copyBtn);

  inner.appendChild(actions);

  const textarea = document.createElement('textarea');
  textarea.id = 'instruction-text';
  textarea.readOnly = true;
  const instructionText = composeInstruction(node);
  textarea.value = instructionText;
  inner.appendChild(textarea);

  showBtn.addEventListener('click', () => {
    const visible = textarea.classList.toggle('visible');
    showBtn.textContent = visible ? t('detail.hide') : t('detail.show');
  });

  copyBtn.addEventListener('click', () => {
    trackCopy('node', { node_id: node.id, node_title: node.name || null, node_topic: node.topic || null });
    navigator.clipboard.writeText(instructionText).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = t('copied');
      setTimeout(() => { copyBtn.textContent = original; }, 1500);
    }).catch(() => {
      textarea.classList.add('visible');
      textarea.select();
    });
  });

  if (exams.length) {
    const h3 = document.createElement('div');
    h3.className = 'badge-type';
    h3.style.margin = '1.4rem 0 0.4rem';
    h3.textContent = t('detail.examTasks');
    inner.appendChild(h3);

    const ul = document.createElement('ul');
    ul.className = 'exam-list';
    exams.forEach(exam => {
      const li = document.createElement('li');
      const label = t('detail.examLabel', {
        season: capitalize(exam.season),
        year: exam.year,
        part: aidsTagText(parseAids(exam.aids)) || exam.aids,
        number: exam.number,
      });
      if (exam.url) {
        const a = document.createElement('a');
        a.href = exam.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = label;
        li.appendChild(a);
      } else {
        li.textContent = label;
      }
      ul.appendChild(li);
    });
    inner.appendChild(ul);
  }
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

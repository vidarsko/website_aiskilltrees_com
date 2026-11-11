/*! AI Skill Trees engine · Copyright (c) 2026 Vidar Skogvoll · MIT License · https://github.com/vidarsko/ai-skill-trees */
'use strict';

/* Motorens egen adresse, lest MENS fila kjører - `document.currentScript`
   er bare gyldig der, ikke senere inne i en funksjon. Nedlastingsknappen
   bruker den til å finne mappa resten av maskineriet ligger i, framfor å
   hardkode «/assets/engine/»: motoren skal kunne serveres fra hvilken som
   helst sti, og gjør det allerede i enkeltfil-utgaven. */
const ENGINE_SRC = (typeof document !== 'undefined' && document.currentScript)
  ? document.currentScript.src : '';

/* BARNESKOLEMATTE-KLONEN: maskineriet ligger ved siden av sida, ikke under
   /assets/. Prompts og språkfiler hentes fra mappa over engine/, slik at
   klonen virker uavhengig av den delte motoren (og lokalt). */
const ASSET_BASE = ENGINE_SRC ? new URL('../', ENGINE_SRC).href : '/assets/';

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
/*                            Fra 0.34.0 også ressursene (resource-    */
/*                            rader); resources.csv leses ikke lenger. */
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
/*   5. fagfamilien  → instructions.<instruks>.sections.<seksjon>       */
/*                     (eller .add[].text for en helt ny seksjon)       */
/*   6. instruksmodulen → sections.<seksjon>                            */
/*   7. shared.json  → sections.<seksjon>                               */
/* Punkt 3 er grunnen til at «engelsk kjerne + språklag» og «full       */
/* oversettelse» er samme mekanisme: et språk kan overstyre én seksjon  */
/* eller alle, uten at noe annet endres.                                */
/* Punkt 5: fagfamilien ERSTATTER en generell seksjon (`sections`), slik */
/* at hvert punkt har ÉN tekst - familiens, eller den generelle når     */
/* treet ikke har familie. Fra 0.25.0; før det la familien til egne     */
/* seksjoner etter den generelle. `add` finnes fortsatt, men bare for   */
/* en seksjon den generelle instruksen ikke har (practiceLanguage).     */
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
let VOCAB = null;           // /trees/vocabulary.json (kontrollert vokabular for nøklene
                            //   country, institution, division, subjectArea, language)
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
/* Ordrett kildetekst, ikke de parsede radene. Nedlastingsknappen gir
   læreren tilbake NØYAKTIG fila treet ble bygget av - et regneark satt
   sammen fra NODE_ROWS igjen ville mistet radrekkefølge, tomme kolonner
   og alt annet motoren ikke bryr seg om. */
let TREE_CSV_TEXT = '';     // ./tree.csv slik den står
let RESOURCE_ROWS = [];     // resource-radene i ./tree.csv, satt av bootstrap()
let PROMPT_ROWS = {};       // prompt-radene i ./tree.csv: { '<instruks>.<seksjon>': tekst }
                            //   '*' som instruks betyr «alle instrukser».
let PROMPT_ROW_AT = {};     // samme nøkler → radnummeret i regnearket, så en
                            //   prompt-rad som ikke treffer noe kan navngis.
let CONFIG_ROW_AT = {};     // config-nøkkel → radnummeret, av samme grunn.

let STORAGE_KEY = null;
let TOPIC_ORDER = [];
let FEATURES = {};
let SHOW_MOTIVATION_BUTTON = false;
let CONVERSATION_LANGUAGE = '';
let LEARNER = '';           // hva den som lærer HETER, i bestemt form («eleven»,
                            //   «the student»): config-raden `learner` som fritekst,
                            //   ellers språkfilas `learner.default`. Se resolveLearner().

let LAYOUT = {
  nodeWidth: 210,
  nodeHeight: 92,
  hGap: 34,
  vGap: 96,
  columnGap: 26,           // BARNESKOLEMATTE: 26 (maskineriet: 56), så elleve temaer får plass i bredden
  columnLabelHeight: 44,   // BARNESKOLEMATTE: 44, plass til emnenavn på to linjer over de smale rutene
  maxNodesPerRow: 3, // bryt en emne-rad i flere rader nedover når den blir bredere enn dette
  padding: 12,             // luft rundt hele lerretet; var 20 til 2026-09-20
  barycenterPasses: 4,
  // BARNESKOLEMATTE: stripen øverst i hvert trinnbånd (navn + ✓/✕ per tema)
  // og skillelinja nederst (knappene for alt til og med trinnet).
  stageHeaderHeight: 24,
  stageDividerHeight: 38,
  // BARNESKOLEMATTE: en lukket celle er en liten glassrute med et minitre
  // (2026-11-11, Vidar: hele oversikten skal få plass på én skjerm).
  // Radhøyden følger innholdet: en rad med bare ruter er
  // cellBoxHeight + cellRowGap høy, en rad med kort nodeHeight + vGap.
  cellBoxWidth: 192,       // dobbelt av første utkast (Vidar 2026-11-11: for stor forskjell mot kortene)
  cellBoxHeight: 124,
  cellRowGap: 20,
  cellBoxLift: 0,
  compact: 0,              // 1: hvert kort så høyt opp som avhengighetene tillater
                           //    (fra 2026-11-11, se compactVertically); 0: faste rader.
                           //    BARNESKOLEMATTE: 0, fordi trinnbåndene bygger på faste rader.
  compactGap: 44,          // minste loddrette luft under et kort i kompakt layout
  optimize: 0,             // 1: flytt kortene litt for ryddigere kanter (se optimizeLayout)
                           //    BARNESKOLEMATTE: 0, se compact.
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

/* Hva den som lærer HETER, i bestemt form. Fra 0.31.0 er `learner` fritekst
   i tree.csv («kursdeltakeren»), fordi den bestemte formen er den eneste
   instruksene og panelet bruker - de andre bøyningene i språkfila ble
   aldri lest. Verdiene trærne brukte før (`pupil`, `student`,
   `participant`) oversettes av språkfilas `learner.legacy`, slik at en
   eldre fil leses likt. Uten raden gjelder språkets `learner.default`. */
function resolveLearner() {
  const spec = (LANG && LANG.learner) || {};
  const asked = String(CONFIG.learner || '').trim();
  const legacy = spec.legacy || {};
  if (asked) return Object.prototype.hasOwnProperty.call(legacy, asked) ? legacy[asked] : asked;
  return spec.default || 'the student';
}

/* Ledeteksten panelet setter foran beskrivelsen. Den står IKKE i CSV-en:
   «Eleven kan ...» gjentatt i hver eneste celle er presentasjon lagret som
   data - den kan ikke oversettes, ikke styles, og stjeler oppmerksomheten
   til den som leser kolonnen. Beskrivelsen er derfor en bar verbfrase for
   en ferdighet og en bar definisjon for et begrep, og ledeteksten er det
   ene stedet ordene står. De to typene trenger hver sin: en definisjon er
   ingen verbfrase, og «Eleven kan: Posisjonen til et siffer bestemmer
   verdien» går ikke opp. Vidars beslutning, 2026-09-21. */
function learnerLeadIn(type) {
  const lead = (LANG && LANG.learner && LANG.learner.leadIn) || {};
  const tmpl = lead[type] || lead.skill || '{LearnerDefinite}:';
  return tmpl.replace('{LearnerDefinite}', LEARNER.charAt(0).toUpperCase() + LEARNER.slice(1));
}

/* Ordet for den som lærer, som {learnerDefinite}. Det kan bare brukes i
   SPRÅKLAGET og i tree.csv, ikke i
   prompts/: de står på treets språk, og limt inn i den engelske kjernen
   ville de gitt «helping eleven practise». */
function learnerVars() {
  return { learnerDefinite: LEARNER };
}

/* En begrepsnode kan definere FLERE begreper - «Intron og ekson» er ett
   element i kartet og to definisjoner. Konvensjonen er én linje per
   definisjon, på forma «Term: definisjon», og motoren splitter bare på
   linjeskift: det finnes ingen parsing som kan gå i stykker fordi en
   definisjon inneholder et kolon eller et semikolon. Én linje betyr ett
   begrep, og da bærer nodenavnet termen - den skal ikke gjentas i cella. */
function descriptionLines(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

/* Samme tekst på én linje, til listene i prøve- og øktinstruksen, der hver
   node har nøyaktig én linje å stå på. */
function descriptionInline(text) {
  return descriptionLines(text).join('; ');
}

/* «Term: definisjon» → termen, når linja ser sånn ut. Alle begreper skrives
   på den forma, også de som definerer bare ett - ellers ser to nabonoder
   helt ulike ut for leseren, og det var det som gjorde at regelen ble
   utvidet (Vidar, 2026-09-21). En ferdighet har ingen term, og en linje
   uten kolon settes som den er. */
function definitionTerm(line) {
  const m = /^([^:]{1,60}):\s+(.+)$/.exec(line);
  return m ? { term: m[1], rest: m[2] } : null;
}

/* En faktanode er en SAMLING, én linje per element: «stikkord: svar»,
   samme form og samme splitting som begrepenes «Term: definisjon» - bare
   det før det første kolonet er venstresiden. Uten grensen på 60 tegn,
   fordi et stikkord kan være lengre enn en term («året Norge ble med i
   NATO»), og en for lang venstreside ellers ville blitt lest som en regel
   uten at noen merket det. En linje UTEN kolon er en REGEL som elementene
   lages fra («alle produkter a × b der a og b er fra 1 til 10»), og settes
   som den er. Vidars beslutning, 2026-09-30. */
function factItem(line) {
  const m = /^([^:]+):\s+(.+)$/.exec(line);
  return m ? { term: m[1], rest: m[2] } : null;
}

/* Typene en node kan ha. Verdien er et engelsk dataenum i alle språk. */
const NODE_TYPES = ['skill', 'concept', 'fact'];

/* ------------------------------------------------------------------ */
/* Komposisjon av KI-instruks                                           */
/*                                                                      */
/* Rekkefølgen på seksjonene er DATA (`groups` i instruksmodulen), slik */
/* at den kan endres uten å røre kode. HVILKEN betingelse en seksjon har */
/* er også data (`when`); hva betingelsen betyr er logikk, og bor her.  */
/* ------------------------------------------------------------------ */

/* Hvilke seksjoner som gjelder NÅR. Modulen sier hvilken betingelse en
   seksjon har (`when` i JSON-en, et navn herfra); hva navnet betyr er
   logikk, og bor her. Navnet er også det byggeren og /prompts/ viser
   («Nodes with prerequisites»), så det skal si hva det gjelder, ikke
   hvordan det regnes ut. Fram til 0.25.0 var tabellen nøklet på
   instruks.seksjon her i koden, og sidene kunne bare si «noen ganger». */
const CONDITIONS = {
  /* Lærerens egen tekst om kurset er tom by default: et tre som ikke
     setter slotten skal se ut nøyaktig som før. */
  courseSpecifics:  (ctx, name) => courseSpecificsApplies(name),
  expressionFocus:  ctx => !!slot('expressionFocus'),
  hasPrerequisites: ctx => !!(ctx.ancestors && ctx.ancestors.length > 0),
  noPrerequisites:  ctx => !ctx.ancestors || ctx.ancestors.length === 0,
  /* «Alt som ikke er et begrep» fram til fakta-typen kom (0.21.0). */
  skillNode:        ctx => !ctx.node || (ctx.node.type !== 'concept' && ctx.node.type !== 'fact'),
  conceptNode:      ctx => !!(ctx.node && ctx.node.type === 'concept'),
  /* Bare når noden faktisk holder flere definisjoner: teksten forklarer
     et format, og et format som ikke er der trenger ingen forklaring. */
  severalConcepts:  ctx => !!(ctx.node && ctx.node.type === 'concept' &&
                              descriptionLines(ctx.node.description).length > 1),
  factNode:         ctx => !!(ctx.node && ctx.node.type === 'fact'),
  nodeInstruction:  ctx => !!(ctx.node && ctx.node.instruction),
  /* Én node har sine nivåer på noden; et utvalg (prøve, økt) har dem samlet
     i aidsText. */
  aids:             ctx => treeUsesAids() &&
                           (ctx.node ? (ctx.node.aids || []).length > 0 : !!ctx.aidsText),
  severalAids:      ctx => !!ctx.multipleAids,
  hasConcepts:      ctx => !!ctx.hasConcepts,
  allConcepts:      ctx => !!ctx.allConcepts,
  someConcepts:     ctx => !!ctx.hasConcepts && !ctx.allConcepts,
  hasFacts:         ctx => !!ctx.hasFacts,
  hasSkills:        ctx => !!ctx.hasSkills,
  /* Typen time læreren velger i undervisningsplanleggeren (fra 0.39.0).
     Bare den valgte plan-seksjonen kommer med; uten valg er det en
     introduksjonstime, som før. */
  lessonIntro:      ctx => (ctx.lessonType || 'intro') === 'intro',
  lessonPractice:   ctx => ctx.lessonType === 'practice',
  lessonReview:     ctx => ctx.lessonType === 'review',
  lessonOther:      ctx => ctx.lessonType === 'other',
  /* Valgene i motivasjonsvinduet (utkast, 2026-11-11). Uten valg brukes
     `opening` som før, og samtalen har vanlig lengde. */
  motNoStart:       ctx => !ctx.motivation || !ctx.motivation.start || ctx.motivation.start === 'unknown',
  motStartHard:     ctx => !!ctx.motivation && ctx.motivation.start === 'hard',
  motStartBored:    ctx => !!ctx.motivation && ctx.motivation.start === 'bored',
  motStartUse:      ctx => !!ctx.motivation && ctx.motivation.start === 'use',
  motShort:         ctx => !!ctx.motivation && ctx.motivation.length === 'short',
  motLong:          ctx => !!ctx.motivation && ctx.motivation.length === 'long',
  /* Valgene i prøvevinduet (utkast, 2026-11-11). Uten valg er prøven
     middels og blandet, som instruksen var før valgene kom. */
  examEasy:         ctx => !!ctx.exam && ctx.exam.difficulty === 'easy',
  examMedium:       ctx => !ctx.exam || !ctx.exam.difficulty || ctx.exam.difficulty === 'medium',
  examHard:         ctx => !!ctx.exam && ctx.exam.difficulty === 'hard',
  examClosed:       ctx => !!ctx.exam && ctx.exam.format === 'closed',
  examOpen:         ctx => !!ctx.exam && ctx.exam.format === 'open',
  examMixed:        ctx => !ctx.exam || !ctx.exam.format || ctx.exam.format === 'mixed',
  /* Valgene læreren gjør på minitre-kortet i ressursvelgeren (utkast,
     2026-11-10). Se prompts/mini-tree.json. */
  miniThreeLevels:  ctx => !!ctx.mini && ctx.mini.levels === 3,
  miniOneLevel:     ctx => !!ctx.mini && ctx.mini.levels !== 3,
  miniMixedTest:    ctx => !!ctx.mini && !!ctx.mini.mixedTest,
  miniGame:         ctx => !!ctx.mini && !!ctx.mini.game,
  miniEasyRead:     ctx => !!ctx.mini && !!ctx.mini.easyRead,
  miniPlainRead:    ctx => !!ctx.mini && !ctx.mini.easyRead,
  miniReadAloud:    ctx => !!ctx.mini && !!ctx.mini.readAloud,
  /* Og på simuleringskortet. Se prompts/simulation.json. */
  simDesignFirst:   ctx => !!ctx.sim && ctx.sim.workflow !== 'build',
  simBuildNow:      ctx => !!ctx.sim && ctx.sim.workflow === 'build',
  simScreenLaptop:  ctx => !!ctx.sim && (ctx.sim.screen || 'laptop') === 'laptop',
  simScreenTablet:  ctx => !!ctx.sim && ctx.sim.screen === 'tablet',
  simScreenProjector: ctx => !!ctx.sim && ctx.sim.screen === 'projector',
  simTasks:         ctx => !!ctx.sim && !!ctx.sim.tasks,
  simCritique:      ctx => !!ctx.sim && !!ctx.sim.critique,
  simExport:        ctx => !!ctx.sim && !!ctx.sim.export,
};

/* Betingelsen en seksjon har i en instruks, som navn, eller null. En
   seksjon fagfamilien LEGGER TIL (`add`) arver betingelsen til seksjonen
   den står etter, med mindre den oppgir sin egen. */
function sectionCondition(promptName, id) {
  const spec = CORE.prompts[promptName] || {};
  const when = spec.when || {};
  if (when[id]) return when[id];
  const add = familyAdds(promptName).find(a => a.id === id);
  if (add && add.when) return add.when;
  if (add && add.after) return sectionCondition(promptName, add.after);
  return null;
}

function slot(name) {
  return (CONFIG.slots || {})[name];
}

/* Seksjonen vises når treet HAR noe å si: enten via `slots.courseSpecifics`,
   som er den vanlige veien, eller via en prompt-rad som skriver om selve
   seksjonen. Uten det andre leddet ville en slik rad blitt lest, vist tilbake
   som en innstilling, og så aldri gjort noe - nøyaktig den stillheten
   validatePromptRows() finnes for å hindre. */
function courseSpecificsApplies(promptName) {
  return !!slot('courseSpecifics') ||
         PROMPT_ROWS[promptName + '.courseSpecifics'] != null ||
         PROMPT_ROWS['*.courseSpecifics'] != null;
}

/* Det fagfamilien har for ÉN instruks: `sections` erstatter generelle
   seksjoner, `add` er seksjoner den generelle instruksen ikke har, som en
   liste av { id, after, text }. Tomt for et tre uten `subjectFamily`. */
function familyPart(promptName) {
  return (FAMILY && FAMILY.instructions && FAMILY.instructions[promptName]) || {};
}
function familyAdds(promptName) {
  return familyPart(promptName).add || [];
}
function familyText(promptName, id) {
  const own = familyPart(promptName).sections || {};
  if (own[id] != null) return own[id];
  const add = familyAdds(promptName).find(a => a.id === id);
  return add && add.text != null ? add.text : null;
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

  const fromFamily = familyText(promptName, id);
  if (fromFamily != null) return fromFamily;

  const spec = CORE.prompts[promptName];
  if (spec && spec.sections[id] != null) return spec.sections[id];

  return SHARED[id] != null ? SHARED[id] : null;
}

/* Gruppene i en instruks: [{ title, sections }]. Fra 0.25.0 har en modul
   `groups` med en overskrift hver - «Role and style», «How to teach» ... -
   som også skrives inn i den ferdige instruksen. En modul med bare
   `order` er én gruppe uten overskrift. */
function sectionGroups(promptName) {
  const spec = CORE.prompts[promptName];
  if (spec.groups) return spec.groups;
  return [{ title: '', sections: spec.order || [] }];
}

/* Overskriften på gruppa en seksjon står i, etter at familiens nye
   seksjoner er flettet inn: de står i gruppa til ankeret sitt. */
function sectionGroup(promptName, id) {
  const groups = sectionGroups(promptName);
  const g = groups.find(gr => gr.sections.indexOf(id) !== -1);
  if (g) return g.title;
  const add = familyAdds(promptName).find(a => a.id === id);
  return add && add.after ? sectionGroup(promptName, add.after) : (groups[groups.length - 1] || {}).title || '';
}

/* Alle seksjonene i rekkefølge, med fagfamiliens NYE seksjoner flettet inn
   etter ankeret hver av dem oppgir. En familie som erstatter en seksjon
   flytter ingenting - den vinner på plassen seksjonen har fra før, via
   sectionText() over. */
function sectionOrder(promptName) {
  const order = sectionGroups(promptName).reduce((acc, g) => acc.concat(g.sections), []);
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
  const name = sectionCondition(promptName, id);
  if (!name) return true;
  const test = CONDITIONS[name];
  if (!test) {
    console.warn('Ukjent betingelse «' + name + '» på ' + promptName + '.' + id);
    return true;
  }
  return test(ctx, promptName);
}

function composePrompt(promptName, ctx) {
  const spec = CORE.prompts[promptName];
  if (!spec) throw new Error('Ukjent instruks: ' + promptName);
  ctx = ctx || {};

  const vars = Object.assign(
    { conversationLanguage: CONVERSATION_LANGUAGE, examButtonLabel: t('exam.button') },
    learnerVars(),
    CONFIG.slots || {},
    ctx.vars || {});

  const out = [];
  let heading = null;
  sectionOrder(promptName).forEach(id => {
    if (!sectionApplies(promptName, id, ctx)) return;
    const text = sectionText(promptName, id, ctx);
    if (text == null || text === '') return;
    /* Overskriften skrives først når gruppa faktisk har en seksjon med
       tekst, så en gruppe der ingenting gjelder ikke står igjen tom. */
    const group = sectionGroup(promptName, id);
    if (group && group !== heading) out.push('## ' + group);
    heading = group;
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
let resourcesByNode = new Map();   // node-id → ressursene som hører til den
let allResources = [];             // alle ressursene, i fila sin rekkefølge
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
// /trees/trees.json.
function treeSlug() {
  const parts = location.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('trees');
  return (i !== -1 && parts[i + 1]) ? parts[i + 1] : (parts[parts.length - 1] || 'unknown');
}

/* Lenker fra regnearket blir klikkbare bare når de går til en nettside
   (http/https) eller er en e-postadresse. Alt annet — `javascript:`,
   `data:`, `file:` — er kode eller lokale filer framfor en adresse, og den
   som lager treet bestemmer hva som står der. Et tre er noe man sender
   rundt, så teksten i fila kan ikke stoles på. Returnerer '' for en lenke
   som ikke slipper gjennom. */
function safeLinkUrl(url) {
  const u = (url || '').trim();
  return /^(https?:\/\/|mailto:)/i.test(u) ? u : '';
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
    TREE_CSV_TEXT = await fetchText('tree.csv');
    rows = parseCsv(TREE_CSV_TEXT, 'tree.csv', ['type', 'name', 'description']);
  } catch (err) {
    console.error(err);
    document.body.textContent = 'Fant ikke tree.csv for dette ferdighetstreet: ' + err.message;
    return;
  }

  const split = splitRows(rows);
  NODE_ROWS = split.nodes;
  RESOURCE_ROWS = split.resources;
  PROMPT_ROWS = split.prompts;
  PROMPT_ROW_AT = split.promptRows;
  CONFIG = buildConfig(split.config);

  const code = CONFIG.language || 'en';
  let lang;
  try {
    lang = await fetchJson(ASSET_BASE + 'languages/' + code + '.json');
  } catch (err) {
    console.warn('Ingen språkfil for «' + code + '» - bruker engelsk grensesnitt.', err);
    lang = await fetchJson(ASSET_BASE + 'languages/en.json');
  }
  LANG = lang;
  /* Først her møtes nøkkelen fra tree.csv og ordene fra språkfila. */
  LEARNER = resolveLearner();

  /* Utledet framfor konfigurert. Samtalespråkets navn står i språkfila, og
     lagringsnøkkelen er et internt navn ingen lærer skal måtte finne på.
     Begge kan likevel oppgis - en config-rad vinner alltid. */
  /* `prompt.conversationLanguage` er språkets navn slik det står inne i en
     setning («på norsk (bokmål)»), som ikke alltid er det samme som navnet i
     en meny («Norsk (bokmål)»). Fra 0.25.1 bruker alle språkfilene
     {conversationLanguage} i `outputLanguage`, så en config-rad
     `languageName` virker for norske og svenske trær også. */
  if (!CONFIG.languageName) CONFIG.languageName = (LANG.prompt || {}).conversationLanguage || LANG.name || code;
  if (!CONFIG.storageKey) CONFIG.storageKey = deriveStorageKey(CONFIG.title || code);

  /* Pedagogikken ligger i én modul per bidrag, ikke i én core.json. Bare
     manifestet har et hardkodet filnavn; alt annet er oppført DER, slik at
     en ny modul eller en ny fagfamilie ikke koster en kodeendring. Hver
     modul har sitt eget `version`, fordi artikkelens appendiks siterer dem
     hver for seg. Manifestet først, så resten i parallell. */
  MANIFEST = await fetchJson(ASSET_BASE + 'prompts/manifest.json');
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
    [fetchJson(ASSET_BASE + 'prompts/' + MANIFEST.shared)]
      .concat(ids.map(id => fetchJson(ASSET_BASE + 'prompts/' + MANIFEST.instructions[id].file)))
      .concat(famPath ? [fetchJson(ASSET_BASE + 'prompts/' + famPath)] : []));

  SHARED = loaded[0].sections || {};
  CORE = { prompts: {} };
  ids.forEach((id, i) => { CORE.prompts[id] = loaded[i + 1]; });
  FAMILY = famPath ? loaded[loaded.length - 1] : null;
  /* Først her vet vi hvilke seksjoner som finnes. Se validatePromptRows(). */
  validatePromptRows();
  /* «Om faget» leses fra config-radene i tree.csv, og bare derfra. Fram
     til 0.31.0 hadde katalogtrærne en egen meta.json ved siden av, og da
     viste et tre på nettsiden noe annet enn den samme fila lastet ned.
     Vokabularet oversetter nøklene i config-radene (country, institution,
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

  applyStyle();
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
/*   resource         - en ressurs: topic = gruppe, name = tittel,      */
/*                      description = lenke, depends_on = nodene den    */
/*                      hører til (én eller flere). Ingen id: ingenting */
/*                      peker på en ressurs, så den trenger ikke et navn. */
/*                                                                      */
/* Hvorfor verdien står i `description` for config og i `instruction`   */
/* for prompt: en config-verdi er data, en prompt-tekst er instruks, og */
/* begge låner da kolonnen som betyr omtrent det samme fra før.         */
/* ------------------------------------------------------------------ */

function splitRows(rows) {
  const out = { nodes: [], config: [], prompts: {}, promptRows: {}, resources: [] };
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
    } else if (kind === 'resource') {
      /* Radnummeret følger med av samme grunn som for prompt-radene: en
         ressurs har ingen id, så raden er det eneste en feilmelding kan
         peke på. */
      out.resources.push({
        row: i + 2,
        group: (row.topic || '').trim(),
        label: (row.name || '').trim(),
        url: (row.description || '').trim(),
        nodes: [...new Set((row.depends_on || '').split(';').map(s => s.trim()).filter(Boolean))],
      });
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
  'subjectFamily', 'storageKey', 'topicOrder', 'learner',
  /* Om faget og katalogen. Alle valgfrie; country, institution, division
     og subjectArea er nøkler i /trees/vocabulary.json. `course` ble strøket
     i 0.31.0 (den var lik `title` på hvert eneste tre), men godtas fortsatt
     og overses, slik at en fil laget i byggeren før det ikke får en feil. */
  'subtitle', 'curriculum', 'courseCode', 'country', 'institution', 'division',
  'subjectArea', 'keywords', 'updated', 'author', 'authorUrl', 'license', 'course',
  'features.motivation', 'features.resources',
  'slots.courseName', 'slots.motivationSubject', 'slots.expressionFocus',
  'slots.courseSpecifics',
  'aids.label',
  'decompositionVersion',
  'style.conceptColor', 'style.skillColor', 'style.factColor', 'style.font',
].concat(Object.keys(LAYOUT).map(k => 'layout.' + k));
/* Bare `aids.<n>.*` er et mønster, fordi nivåene er lærerens egne tall.
   `slots.*` og `layout.*` var mønstre fram til 0.14.0, og da gikk
   `slots.expresionFocus` gjennom uten feil og gjorde ingenting — nøyaktig
   den stillheten lista over finnes for å hindre. En plassholder som ingen
   instruks spør etter er ikke en innstilling, så de er nå oppført én for
   én: `slots.*` over, `layout.*` fra LAYOUT selv. */
const CONFIG_KEY_PATTERNS = [
  /^aids\.\d+\.(name|student|model)$/,
  /^basedOn\.\d+\.(author|title|url)$/,
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
  return nearest(key, CONFIG_KEYS.concat(['aids.1.student', 'aids.1.model', 'aids.1.name',
                                          'basedOn.1.author', 'basedOn.1.title', 'basedOn.1.url']));
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
   hvilke seksjoner som finnes, står i modulenes `groups`, og fagfamilien
   kan legge til sine egne. Derfor kalles den fra bootstrap og ikke fra
   splitRows. */
/* «Mente du ...?» for en instruks. Redigeringsavstand alene treffer ikke
   det vanligste feilgrepet: å skrive det instruksen HETER i artikkelen og
   på /prompts/ — «tutor», «test generator», «lesson planner» — framfor
   nøkkelen `node`, `exam`, `lessonPlan`. Filnavnet og tittelen i
   manifestet er derfor med som kjennetegn, sammenliknet uten mellomrom og
   bindestreker, og et treff den ene eller andre veien gir nøkkelen. */
function nearestInstruction(value, names) {
  const squash = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const v = squash(value);
  const hit = v.length >= 3 && names.find(id => {
    const entry = (MANIFEST && MANIFEST.instructions && MANIFEST.instructions[id]) || {};
    return [id, (entry.file || '').replace(/\.json$/, ''), entry.title]
      .map(squash).filter(Boolean)
      .some(k => k.indexOf(v) !== -1 || v.indexOf(k) !== -1);
  });
  return hit || nearest(value, names);
}

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
                { name: which, row: row, guess: nearestInstruction(which, names) });
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
    /* exams.csv ble resources.csv i 0.22.0. Et tre fra før det får en
       beskjed om hva som skal endres, ikke bare «ukjent innstilling». */
    if (entry.key === 'features.exams') {
      /* `false` sa bare «ingen eksamensoppgaver», som er standard i dag.
         Den godtas stille, som features.resources under: et tre lastet
         ned i september 2026 skal kunne importeres uten feil (fanget av
         tools/check-import.py, 2026-11-11). Bare `true` har noe som må
         flyttes, og får beskjeden. */
      if (String(entry.value).trim().toLowerCase() !== 'false') {
        pushError('errorExamsRenamed', { row: entry.row });
      }
      return;
    }
    /* Fra 0.34.0 står ressursene som resource-rader i tree.csv, og
       resources.csv leses ikke. Innstillingen gjør ingenting lenger, men
       godtas stille, som `course`: et eldre tre skal ikke få en feil for
       den. */
    if (entry.key === 'features.resources') return;
    /* BARNESKOLEMATTE: `cellSummary.<trinn>.<tema>` er det korte
       sammendraget på boksen for en lukket celle. */
    const cellMatch = /^cellSummary\.(\d+)\.(.+)$/.exec(entry.key);
    if (cellMatch) {
      CELL_SUMMARIES.set(cellKey(parseInt(cellMatch[1], 10), cellMatch[2].trim()), entry.value);
      return;
    }
    if (!configKeyKnown(entry.key)) {
      const guess = nearestConfigKey(entry.key);
      pushError('errorUnknownConfig', { key: entry.key, row: entry.row, guess: guess });
      return;
    }
    seen.add(entry.key);
    CONFIG_ROW_AT[entry.key] = entry.row;
    setByPath(cfg, entry.key, coerceConfigValue(entry.key, entry.value));
  });
  CONFIG_REQUIRED.forEach(key => {
    if (!seen.has(key)) pushError('errorMissingConfig', { key: key });
  });
  normaliseAids(cfg);
  normaliseBasedOn(cfg);
  return cfg;
}

/* `basedOn.1.author`, `basedOn.1.title` og `basedOn.1.url` blir til en
   liste `[{ n, author, title, url }]`, sortert på tallet. 1 er treet dette
   er laget fra, 2 treet DET bygget på, og så videre. Rekken står i
   tree.csv, slik at den følger fila når noen laster den ned: CC BY krever at den som bearbeider et tre krediterer
   opphavet, og det er lettere når navnene allerede står i fila. */
function normaliseBasedOn(cfg) {
  const src = cfg.basedOn;
  if (!src || typeof src !== 'object') { delete cfg.basedOn; return; }
  const list = Object.keys(src)
    .filter(key => /^\d+$/.test(key))
    .map(key => Object.assign({ n: parseInt(key, 10) }, src[key]))
    .filter(entry => entry.author || entry.title)
    .sort((a, b) => a.n - b.n);
  if (list.length) cfg.basedOn = list;
  else delete cfg.basedOn;
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
  if (key === 'topicOrder' || key === 'keywords') return value.split(';').map(s => s.trim()).filter(Boolean);
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

/* ------------------------------------------------------------------ */
/* Utseende: `style.*`-radene                                           */
/*                                                                      */
/* Tre innstillinger, og bare tre, med vilje: fargen på et begrep,      */
/* fargen på en ferdighet, og skrifta. Fargene er fortsatt bundet til    */
/* TYPEN - et tre kan gjøre begrepene blå, men ikke gi to begreper ulik  */
/* farge - så fargen fortsetter å bety det den betyr, og typen står i    */
/* tillegg som ord på hver node.                                        */
/*                                                                      */
/* Skrifta er et valg fra en lukket liste, ikke et fontnavn: enkeltfila */
/* skal virke uten nett, så en skrift må enten bygges inn (tungt) eller */
/* komme fra maskinen (da må det være en stabel som finnes overalt).     */
/* Stablene står i tokens.css som --font-<navn>, ikke her.              */
/*                                                                      */
/* Blandingsforholdene er de samme som tree.css bruker for standard-    */
/* fargene, så en rad som oppgir standardfargen gir samme tre som ingen */
/* rad i det hele tatt.                                                 */
/* ------------------------------------------------------------------ */

const STYLE_FONTS = ['system', 'humanist', 'rounded', 'serif', 'mono'];

function applyStyle() {
  const style = CONFIG.style || {};
  const row = key => (CONFIG_ROW_AT[key] || '?');
  const root = document.documentElement.style;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

  if (style.conceptColor != null) {
    if (hex.test(style.conceptColor)) {
      root.setProperty('--begrep-bg', `color-mix(in srgb, ${style.conceptColor} 12%, var(--surface))`);
      root.setProperty('--begrep-border', `color-mix(in srgb, ${style.conceptColor} 55%, transparent)`);
    } else {
      pushError('errorStyleColor', { key: 'style.conceptColor', value: style.conceptColor, row: row('style.conceptColor') });
    }
  }
  if (style.skillColor != null) {
    if (hex.test(style.skillColor)) {
      root.setProperty('--ferdighet-bg', `color-mix(in srgb, ${style.skillColor} 40%, var(--surface))`);
      root.setProperty('--ferdighet-border', style.skillColor);
    } else {
      pushError('errorStyleColor', { key: 'style.skillColor', value: style.skillColor, row: row('style.skillColor') });
    }
  }
  if (style.factColor != null) {
    if (hex.test(style.factColor)) {
      root.setProperty('--fakta-bg', `color-mix(in srgb, ${style.factColor} 24%, var(--surface))`);
      root.setProperty('--fakta-border', style.factColor);
    } else {
      pushError('errorStyleColor', { key: 'style.factColor', value: style.factColor, row: row('style.factColor') });
    }
  }
  if (style.font != null) {
    if (STYLE_FONTS.indexOf(style.font) !== -1) {
      root.setProperty('--font-sans', `var(--font-${style.font})`);
    } else {
      pushError('errorStyleFont', { value: style.font, row: row('style.font'),
                                    valid: STYLE_FONTS.join(', '), guess: nearest(style.font, STYLE_FONTS) });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Instruksene slik et verktøy trenger å se dem                         */
/*                                                                      */
/* Redigeringsverktøyet på /make-your-own/ viser hver seksjon av hver instruks */
/* med teksten treet ville fått UTEN sine egne prompt-rader, og ved     */
/* siden av den raden som eventuelt overstyrer den. Det kunne lest      */
/* modulfilene selv, men da ville det hatt sin egen kopi av             */
/* oppslagsrekkefølgen i filhodet over - og den dagen de to ble uenige, */
/* ville verktøyet vist en standardtekst eleven aldri får. Motoren slår */
/* derfor opp, og legger resultatet fram.                               */
/* ------------------------------------------------------------------ */

/* Seksjoner motoren fyller fra selve treet (kolonnen `instruction` på  */
/* noden, hjelpemiddelradene). De går foran en prompt-rad, så en rad    */
/* for dem ville ikke gjort noe. Se composeInstruction(). */
const RUNTIME_SECTIONS = { node: ['nodeInstruction', 'aids'] };

function sectionDefault(promptName, id) {
  const langPrompt = (LANG.prompt || {});
  const fromLangOverride = ((langPrompt.overrides || {})[promptName] || {})[id];
  if (fromLangOverride != null) return { text: fromLangOverride, source: 'language' };
  if (langPrompt[id] != null) return { text: langPrompt[id], source: 'language' };
  const fromFamily = familyText(promptName, id);
  if (fromFamily != null) return { text: fromFamily, source: 'family' };
  const spec = CORE.prompts[promptName];
  if (spec && spec.sections[id] != null) return { text: spec.sections[id], source: 'module' };
  if (SHARED[id] != null) return { text: SHARED[id], source: 'shared' };
  return { text: '', source: 'none' };
}

function describeInstructions() {
  return Object.keys(CORE.prompts).map(name => {
    const spec = CORE.prompts[name];
    const entry = (MANIFEST.instructions || {})[name] || {};
    const runtime = RUNTIME_SECTIONS[name] || [];
    return {
      id: name,
      title: entry.title || spec.title || name,
      version: spec.version || '',
      /* Gruppene med beskrivelsen modulen gir dem, slik at verktøyet kan
         vise «The lesson» som én ting å åpne, med hva som står i den. */
      groups: sectionGroups(name).map(g => ({ title: g.title || '', description: g.description || '' })),
      sections: sectionOrder(name).map(id => {
        const def = sectionDefault(name, id);
        const condition = sectionCondition(name, id);
        return {
          id: id,
          text: def.text,
          source: def.source,
          override: PROMPT_ROWS[name + '.' + id] != null ? PROMPT_ROWS[name + '.' + id] : null,
          overrideAll: PROMPT_ROWS['*.' + id] != null ? PROMPT_ROWS['*.' + id] : null,
          runtime: runtime.indexOf(id) !== -1,
          group: sectionGroup(name, id),
          /* Navnet fra CONDITIONS, som byggeren oversetter til «Nodes with
             prerequisites» o.l. `conditional` beholdes for en eldre side. */
          condition: condition,
          conditional: !!condition,
        };
      }),
    };
  });
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

  /* Fagnavnet øverst, og veien videre for den som ser et tre og lurer på om
     hen kan lage et selv. Adressen er ABSOLUTT med vilje: den samme linja
     står i enkeltfil-utgaven en lærer laster ned, og der er den den eneste
     veien tilbake til metoden. Domenet er ikke oversatt — det er en adresse,
     ikke en tekst — så det legges på som et eget element framfor å ligge i
     språkfila. */
  const madeWith = document.getElementById('made-with');
  if (madeWith) {
    /* Fagnavnet står i fet skrift, resten av setningen ikke. Setningen
       hentes derfor UFYLT fra språkfila - `fill()` lar en plassholder uten
       verdi stå - og deles på plassholderen. Det er bedre enn to nøkler:
       språket beholder ordstillingen sin, og en oversettelse står fritt til
       å legge fagnavnet et annet sted i setningen. */
    madeWith.textContent = '';
    t('makeYourOwn').split('{subject}').forEach((chunk, i) => {
      if (i > 0) {
        const strong = document.createElement('strong');
        strong.textContent = title;
        madeWith.appendChild(strong);
      }
      madeWith.appendChild(document.createTextNode(chunk));
    });
    const link = document.createElement('a');
    link.href = 'https://aiskilltrees.com/make-your-own/';
    link.textContent = 'aiskilltrees.com';
    link.rel = 'noopener';
    madeWith.appendChild(document.createTextNode(' '));
    madeWith.appendChild(link);

    const safety = document.createElement('button');
    safety.type = 'button';
    safety.className = 'made-with__safety';
    safety.appendChild(warningIcon());
    safety.appendChild(document.createTextNode(t('safety.label')));
    safety.addEventListener('click', openSafetyModal);
    madeWith.appendChild(document.createTextNode('. '));
    madeWith.appendChild(safety);
  }

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
  updateStickyHeaders(); // BARNESKOLEMATTE
}

// Zoomer inn/ut ett steg, sentrert på midten av synlig kartområde.
function zoomBy(factor) {
  forgetSavedView();
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
    forgetSavedView();
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
  btn.addEventListener('click', toggleFitView);
  updateFitButton(btn);

  const zoomInBtn = document.createElement('button');
  zoomInBtn.id = 'zoom-in-btn';
  zoomInBtn.type = 'button';
  zoomInBtn.textContent = '+';
  zoomInBtn.setAttribute('aria-label', t('zoomIn'));
  zoomInBtn.title = t('zoomIn');
  zoomInBtn.addEventListener('click', () => zoomBy(1.25));
  group.appendChild(zoomInBtn);
  // «Vis hele treet» står ytterst, etter − og + (Vidar, 2026-11-11), så de
  // to zoomknappene står sammen.
  group.appendChild(btn);

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
/* "Vis alle læringsmål" og "Undervisningsplanlegger": samme indekserte */
/* liste, to formål                                                     */
/* ------------------------------------------------------------------ */

/* Fram til 0.36.0 var dette ÉN knapp, og avkryssinga i lista var lærerens
   utvalg til undervisningsopplegget. Det gjorde at «vis alle læringsmål»
   ikke kunne brukes til det de fleste ville bruke den til: gå gjennom
   lista i rekkefølge og krysse av det klassen kan. Nå er det to knapper
   til samme vindu (se goalIndexMode):
     'outcomes' - avkryssing = mestret, samme varige tilstand som boksen
                  på noden i kartet
     'lesson'   - avkryssing = flyktig utvalg til økta, med bunnlinja
                  som lager undervisningsopplegget
   Vidar, 2026-10-23. */
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
    openGoalIndexModal('outcomes');
  });
  panel.appendChild(btn);

  const planner = document.createElement('button');
  planner.id = 'lesson-planner-btn';
  planner.type = 'button';
  planner.textContent = t('lessonPlanner.button');
  planner.title = t('lessonPlanner.title');
  planner.addEventListener('click', () => {
    closeActionMenu();
    openGoalIndexModal('lesson');
  });
  panel.appendChild(planner);
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

  /* Kryss øverst til høyre i menyen (Vidar, 2026-11-11), som i alle andre
     vinduer. Menyen lukkes også av et trykk utenfor og av Esc. */
  const menuClose = makeEl('button', 'menu-close-btn');
  menuClose.type = 'button';
  menuClose.setAttribute('aria-label', t('close'));
  menuClose.title = t('close');
  menuClose.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  menuClose.addEventListener('click', closeActionMenu);
  panel.appendChild(menuClose);

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
  /* Tittelen («Ferdighetstre for …») og ingressen står ikke lenger i
     menyen (2026-11-11): fagnavnet står allerede øverst på sida, og
     ingressen forklarte det kartet viser selv. De blir liggende i den
     skjulte headeren. Tilbake-lenka får samme form som alle andre
     tilbake-knapper. */
  if (backLink) backLink.classList.add('back-btn');

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

/* Menyen i tre grupper, etter hvem valget er for (2026-11-11). Hvert valg
   heter et SUBSTANTIV, det du får («Læringsmål», «Prøve»), ikke en
   oppfordring eller et spørsmål: en meny blir skumlest, og det første
   ordet skal være tingen. Hver gruppe har én farge fra nettstedets tre, og
   hvert valg et lite lavpoly-ikon i samme stil som ressursvelgeren.
   Knappene lages av setup*-funksjonene som før; denne flytter dem inn i
   gruppene etterpå, så hver av dem kan stå i fred. */
const MENU_GROUPS = [
  { key: 'practice', hue: '--primary', items: [
    ['goal-index-btn', 'list'], ['search-btn', 'search'], ['resources-btn', 'sources'],
    ['exam-btn', 'test'], ['motivation-btn', 'spark']] },
  { key: 'plan', hue: '--amber', items: [
    ['lesson-planner-btn', 'board'], ['print-btn', 'print'], ['edit-link', 'pencil'],
    ['download-btn', 'download']] },
  { key: 'about', hue: '--blue', items: [
    ['course-info-btn', 'info'], ['help-btn', 'question']] },
];

const MENU_GLYPHS = {
  list: '<path d="M32 30h36M32 48h36M32 66h24"/><circle cx="22" cy="30" r="1.5"/><circle cx="22" cy="48" r="1.5"/><circle cx="22" cy="66" r="1.5"/>',
  search: '<circle cx="42" cy="42" r="17"/><path d="M55 55l17 17"/>',
  sources: '<path d="M26 22h30l14 14v40H26z"/><path d="M56 22v14h14M36 50h24M36 62h18"/>',
  test: '<path d="M24 34l6 6 11-13M24 62l6 6 11-13M52 34h20M52 62h20"/>',
  spark: '<path d="M48 18l8 20 20 2-15 14 5 21-18-11-18 11 5-21-15-14 20-2z"/>',
  board: '<path d="M20 22h56v38H20z"/><path d="M34 60l-8 18M62 60l8 18M30 36l10-4 9 6 11-7 8 5"/>',
  pencil: '<path d="M28 68l36-36 8 8-36 36-11 3z"/><path d="M58 38l8 8"/>',
  download: '<path d="M48 20v36M32 42l16 16 16-16M24 72h48"/>',
  print: '<path d="M32 38V20h32v18"/><path d="M22 38h52v26H22z"/><path d="M32 54h32v22H32z"/>',
  info: '<circle cx="48" cy="48" r="28"/><path d="M48 44v20"/><circle cx="48" cy="33" r="1.5"/>',
  question: '<circle cx="48" cy="48" r="28"/><path d="M39 40a9 9 0 1 1 13 8c-3 2-4 4-4 8"/><circle cx="48" cy="65" r="1.5"/>',
};

function menuIcon(name, hue, seed) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'menu-icon');
  svg.innerHTML = lowPolyBackground(hue, seed) +
    '<g fill="none" style="stroke:var(' + hue + ')" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">' +
    (MENU_GLYPHS[name] || '') + '</g>';
  return svg;
}

function organizeActionMenu() {
  const panel = document.getElementById('action-menu-panel');
  if (!panel) return;
  MENU_GROUPS.forEach((group, gi) => {
    const items = group.items
      .map(([id, icon]) => [document.getElementById(id), icon])
      .filter(([el]) => el && panel.contains(el));
    if (!items.length) return;
    const section = makeEl('div', 'menu-group menu-group-' + group.key);
    section.appendChild(makeEl('div', 'menu-group-label', t('menu.groups.' + group.key)));
    items.forEach(([el, icon], i) => {
      el.classList.add('menu-item');
      const label = makeEl('span', 'menu-label');
      while (el.firstChild) label.appendChild(el.firstChild);
      el.appendChild(menuIcon(icon, group.hue, 11 + gi * 7 + i * 3));
      el.appendChild(label);
      if (el.dataset.shortcut) el.appendChild(makeEl('kbd', 'menu-kbd', el.dataset.shortcut));
      section.appendChild(el);
    });
    panel.appendChild(section);
  });
}

/* Teksten på et menyvalg, uten å viske ut ikonet ved siden av. Brukes av
   knapper som midlertidig sier «Kopiert!» eller «Bygger …». */
function setMenuLabel(btn, text) {
  (btn.querySelector('.menu-label') || btn).textContent = text;
}
function menuLabel(btn) {
  return (btn.querySelector('.menu-label') || btn).textContent;
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

// Motivasjonsknapp («Hvorfor skal jeg lære dette?»). Instruksen er generell
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
  /* Fra 2026-11-11 (utkast) åpner knappen et vindu med to valg, som
     prøven og undervisningsopplegget, framfor å kopiere med en gang. */
  btn.addEventListener('click', () => {
    closeActionMenu();
    openMotivationModal();
  });
  actions.appendChild(btn);
}

/* ------------------------------------------------------------------ */
/* Nedlasting: ta treet med deg                                         */
/*                                                                      */
/* ÉN knapp, TO filer - regnearket og enkeltfil-utgaven - fordi de to    */
/* svarer på hvert sitt spørsmål og den som vil ha det ene som regel     */
/* vil ha det andre også. `tree.csv` er kilden man REDIGERER; HTML-fila  */
/* er treet man DELER, og den virker ved dobbeltklikk uten nett.        */
/*                                                                      */
/* HTML-fila bygges av nøyaktig samme deler som byggeren på             */
/* /make-your-own/ bruker: standalone.html med motoren, stilene,        */
/* instruksene, språkfila og treet lagt inn i seg. Forskjellen er hvor   */
/* delene kommer fra - der en lærerfil, her sida du står på.            */
/*                                                                      */
/* INGEN STIER ER HARDKODET. Motoren finner sine egne filer ut fra sin   */
/* egen `src` (ENGINE_SRC), og stilene fra de <link>-ene dokumentet      */
/* faktisk har. Det er det som gjør at knappen virker i en hvilken som   */
/* helst utrulling, ikke bare på aiskilltrees.com - og at en side som    */
/* legger til et stilark får det med uten at noen må huske det her.     */
/* ------------------------------------------------------------------ */

function setupDownloadButton() {
  /* I enkeltfil-utgaven gir knappen ingen mening: HTML-fila ER fila du
     allerede har, og regnearket står ordrett inne i den (se kommentaren
     øverst i standalone.html). Da er «last ned» bare en omvei rundt
     «lagre som». */
  if (window.AIST_BUNDLE) return;

  const panel = ensureActionMenu();
  if (!panel) return;

  /* En utrulling med et redigeringsverktøy kan sende leseren dit i stedet,
     med <meta name="aist-editor" content="/sti/{slug}/"> i <head>. Der kan
     treet både endres og lastes ned, så knappen blir en lenke. Uten taggen
     bygger knappen fila her, som før - motoren vet ikke om noe verktøy. */
  const editor = document.querySelector('meta[name="aist-editor"]');
  if (editor && editor.content) {
    const link = document.createElement('a');
    link.id = 'edit-link';
    link.href = editor.content.replace('{slug}', encodeURIComponent(treeSlug()));
    link.textContent = t('download.edit');
    link.title = t('download.editTitle');
    panel.appendChild(link);
    return;
  }

  const btn = document.createElement('button');
  btn.id = 'download-btn';
  btn.type = 'button';
  btn.textContent = t('download.button');
  btn.title = t('download.title');
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    const original = menuLabel(btn);
    const slug = treeSlug();

    /* Regnearket først, og uten å vente på noe: det er alt i minnet, og
       den som bare ville ha CSV-en har den før bygget er i gang. */
    saveFile(slug + '.csv', TREE_CSV_TEXT, 'text/csv');

    btn.disabled = true;
    setMenuLabel(btn, t('download.working'));
    try {
      const html = await buildStandaloneHtml();
      saveFile(slug + '.html', html, 'text/html');
      if (window.aistTrack) {
        window.aistTrack('tree_download', {
          tree_slug: slug, size_kb: Math.round(html.length / 1024)
        });
      }
      setMenuLabel(btn, original);
    } catch (err) {
      console.error('Kunne ikke bygge enkeltfil-utgaven:', err);
      /* Feilen blir stående til neste klikk framfor å forsvinne etter et
         par sekunder: den som nettopp fikk én fil av to skal ikke måtte
         gjette på om den andre kommer. */
      setMenuLabel(btn, t('download.failed'));
    } finally {
      btn.disabled = false;
    }
  });
  panel.appendChild(btn);
}

/* «Skriv ut» (fra 2026-11-11): hele treet som én side i PDF, til en lærer
   som vil henge det opp eller dele det ut. Knappen åpner et vindu med
   valg og en forhåndsvisning av arket: arkstørrelse (A4, A3, A2),
   retning, farger eller svart-hvitt, ringer å krysse av i og
   tegnforklaring. Tittelen og aiskilltrees.com står alltid på arket.
   PDF-en lages her i nettleseren, uten bibliotek og uten nett, så den
   virker også i enkeltfila. Treet tegnes på et lerret med samme skrift,
   farger, former og kanter som på skjermen, men alltid i lys modus og
   uten markering eller mestret-status. Bildet pakkes tapsfritt
   (FlateDecode) der nettleseren kan det, ellers som JPEG. Oppløsningen er
   høyst 300 dpi, og lavere for de største arkene, fordi Safari på iPad
   ikke tegner lerreter over 16,7 millioner piksler. */
const PAPER_MM = { A4: [210, 297], A3: [297, 420], A2: [420, 594] };
const PRINT_OPTIONS = { paper: 'A3', orientation: 'auto', color: 'color', rings: true, legend: true };

function printDpi(paper) {
  const [w, h] = PAPER_MM[paper];
  return Math.min(300, Math.floor(Math.sqrt(16.5e6 / ((w / 25.4) * (h / 25.4)))));
}

function setupPrintButton() {
  const panel = ensureActionMenu();
  if (!panel) return;
  const btn = document.createElement('button');
  btn.id = 'print-btn';
  btn.type = 'button';
  btn.textContent = t('print.button');
  btn.title = t('print.title');
  btn.addEventListener('click', () => {
    closeActionMenu();
    openPrintModal();
  });
  panel.appendChild(btn);
}

let printScene = null;
function openPrintModal() {
  if (activeNodeId) closeDetail();
  printScene = withAllCellsOpen(capturePrintScene); // BARNESKOLEMATTE
  const overlay = ensureSimpleModal('print', t('print.heading'), t('print.help'));
  renderPrintBody(overlay.querySelector('.aist-modal-body'));
  overlay.classList.add('open');
}

function capturePrintScene() {
  const root = document.documentElement;
  const prevTheme = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  try {
    return captureTreeScene();
  } finally {
    if (prevTheme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', prevTheme);
  }
}

function renderPrintBody(body) {
  body.innerHTML = '';
  const o = PRINT_OPTIONS;
  const wrap = makeEl('div', 'print-layout');
  const fields = makeEl('div', 'resource-options print-options');
  const preview = makeEl('div', 'print-preview');
  const canvasHolder = makeEl('div', 'print-sheet');
  preview.appendChild(canvasHolder);
  const caption = makeEl('p', 'print-caption');
  preview.appendChild(caption);

  /* Forhåndsvisningen tegnes med samme kode som PDF-en, bare med færre
     piksler, så den viser nøyaktig det som lastes ned. */
  const redraw = () => {
    const layout = printLayout(printScene, o);
    const mmW = layout.landscape ? PAPER_MM[o.paper][1] : PAPER_MM[o.paper][0];
    const dpi = 520 / (mmW / 25.4);
    const canvas = drawTreeScene(printScene, o, dpi, layout);
    canvas.className = 'print-canvas' + (o.color === 'gray' ? ' gray' : '');
    canvasHolder.innerHTML = '';
    canvasHolder.appendChild(canvas);
    caption.textContent = t('print.caption', {
      paper: o.paper,
      orientation: t(layout.landscape ? 'print.orientation.landscape' : 'print.orientation.portrait').toLowerCase(),
    });
  };

  fields.appendChild(resourceField(t('print.paperLabel'), segmented(t('print.paperLabel'),
    Object.keys(PAPER_MM).map(v => ({ value: v, label: v })), o.paper, v => { o.paper = v; redraw(); })));
  fields.appendChild(resourceField(t('print.orientationLabel'), segmented(t('print.orientationLabel'),
    ['auto', 'landscape', 'portrait'].map(v => ({ value: v, label: t('print.orientation.' + v) })),
    o.orientation, v => { o.orientation = v; redraw(); })));
  fields.appendChild(resourceField(t('print.colorLabel'), segmented(t('print.colorLabel'),
    ['color', 'gray'].map(v => ({ value: v, label: t('print.color.' + v) })), o.color, v => { o.color = v; redraw(); })));
  const toggles = makeEl('div', 'print-toggles');
  toggles.appendChild(switchToggle(t('print.rings'), o.rings, v => { o.rings = v; redraw(); }));
  toggles.appendChild(switchToggle(t('print.legend'), o.legend, v => { o.legend = v; redraw(); }));
  fields.appendChild(toggles);

  const download = makeEl('button', 'resource-copy print-download');
  download.type = 'button';
  const setLabel = swapLabel(download, [t('print.download'), t('print.working'), t('print.failed')]);
  download.addEventListener('click', async () => {
    if (download.disabled) return;
    download.disabled = true;
    setLabel(1);
    await new Promise(r => setTimeout(r, 30));   // la teksten tegnes først
    try {
      const layout = printLayout(printScene, o);
      const canvas = drawTreeScene(printScene, o, printDpi(o.paper), layout);
      const blob = await canvasToPdf(canvas, layout, o, CONFIG.title || '');
      saveBlob(treeSlug() + '-' + o.paper + '.pdf', blob);
      if (window.aistTrack) window.aistTrack('tree_print', { tree_slug: treeSlug(), paper: o.paper });
      setLabel(0);
    } catch (err) {
      console.error('Kunne ikke lage PDF-en:', err);
      setLabel(2);
    } finally {
      download.disabled = false;
    }
  });
  const foot = makeEl('div', 'resource-foot');
  foot.appendChild(download);
  fields.appendChild(foot);

  wrap.appendChild(fields);
  wrap.appendChild(preview);
  body.appendChild(wrap);
  redraw();
}

function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* Leser treet slik det står i siden: bokser, tekstlinjer, kanter, bånd og
   overskrifter, i lerretets egne koordinater (uten zoom). */
function captureTreeScene() {
  const container = document.getElementById('graph-container');
  const W = container.offsetWidth;
  const H = container.offsetHeight;
  const cRect = container.getBoundingClientRect();
  const z = (cRect.width / W) || 1;
  const fontOf = cs => `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const bodyCs = getComputedStyle(document.body);

  const bands = [...document.querySelectorAll('#column-bands .column-band')].map(el => {
    const cs = getComputedStyle(el);
    return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight,
             fill: cs.backgroundColor, r: parseFloat(cs.borderTopLeftRadius) || 0 };
  });

  const headers = [...document.querySelectorAll('#column-headers .column-header-label')].map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let text = el.textContent;
    if (cs.textTransform === 'uppercase') text = text.toUpperCase();
    return { text, x: (r.left - cRect.left) / z, top: (r.top - cRect.top) / z, h: r.height / z,
             font: fontOf(cs), color: cs.color,
             spacing: cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing };
  });

  const edges = [...document.querySelectorAll('#edges path')].map(p => {
    const cs = getComputedStyle(p);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    return { d: p.getAttribute('d'), stroke: cs.stroke, width: parseFloat(cs.strokeWidth) || 1.3,
             cap: cs.strokeLinecap };
  }).filter(Boolean);

  const nodes = [...document.querySelectorAll('#nodes-layer .node-box')].map(el => {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const node = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight,
                   fill: cs.backgroundColor, stroke: cs.borderTopColor,
                   lw: parseFloat(cs.borderTopWidth) || 1.5, r: parseFloat(cs.borderTopLeftRadius) || 0,
                   lines: [], check: null };
    const local = r => ({ x: node.x + (r.left - box.left) / z, y: node.y + (r.top - box.top) / z,
                          w: r.width / z, h: r.height / z });
    const textEl = el.querySelector('.node-text');
    if (textEl) {
      const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let tn;
      while ((tn = walker.nextNode())) {
        const pcs = getComputedStyle(tn.parentElement);
        const font = fontOf(pcs);
        let seg = null;
        for (let i = 0; i < tn.length; i++) {
          range.setStart(tn, i);
          range.setEnd(tn, i + 1);
          const rect = [...range.getClientRects()].find(r => r.width > 0);
          const ch = tn.data[i];
          if (!rect) { if (seg) seg.text += ch; continue; }
          const lr = local(rect);
          if (!seg || Math.abs(lr.y - seg.y) > 2) {
            seg = { text: '', x: lr.x, y: lr.y, h: lr.h, font, color: pcs.color };
            node.lines.push(seg);
          }
          seg.text += ch;
        }
      }
      node.lines.forEach(l => { l.text = l.text.replace(/\s+$/, ''); });
    }
    const check = el.querySelector('.mastery-check');
    if (check) node.check = local(check.getBoundingClientRect());
    return node;
  });

  const legend = ['fact', 'concept', 'skill'].map(type => {
    const probe = document.querySelector('#nodes-layer .node-box.type-' + type);
    if (!probe) return null;
    const cs = getComputedStyle(probe);
    return { label: typeLabelText(type), fill: cs.backgroundColor, stroke: cs.borderTopColor,
             r: parseFloat(cs.borderTopLeftRadius) || 0 };
  }).filter(Boolean);

  const sc = { W, H, bands, headers, edges, nodes, legend, title: CONFIG.title || '', font: bodyCs.fontFamily };
  assignPrintColumns(sc);
  return sc;
}

/* Hvert element hører til ett emne (én kolonne), så emnene kan flyttes for
   seg på arket. Kanter mellom emner er bare stubber i hvile (se edgeStub),
   så ingen strek blir revet over. */
function assignPrintColumns(sc) {
  sc.cols = sc.bands.map((b, i) => ({ x0: b.x, x1: b.x + b.w, top: b.y, bottom: b.y, band: i }))
    .sort((a, b) => a.x0 - b.x0);
  const colOf = x => {
    let best = 0;
    sc.cols.forEach((c, i) => { if (x >= c.x0) best = i; });
    return best;
  };
  sc.bands.forEach(b => { b.col = colOf(b.x + 1); });
  sc.nodes.forEach(n => { n.col = colOf(n.x + n.w / 2); });
  sc.headers.forEach(h => { h.col = colOf(h.x + 1); });
  sc.edges.forEach(e => {
    const m = /M\s*([-\d.]+)/.exec(e.d);
    e.col = colOf(m ? parseFloat(m[1]) : 0);
  });
  sc.nodes.forEach(n => { if (sc.cols[n.col]) sc.cols[n.col].bottom = Math.max(sc.cols[n.col].bottom, n.y + n.h); });
  sc.cols.forEach(c => { c.w = c.x1 - c.x0; c.h = c.bottom - c.top + 14; });
}

/* Et tre med mange emner er mye bredere enn høyt (2P: rundt 4700 × 1600),
   og på ett ark ville det bare fylt en stripe øverst med bitteliten tekst.
   Emnene legges derfor i så mange rader som gir størst tekst, og retningen
   velges etter det som passer best når den står på «Automatisk». */
function printLayout(sc, o) {
  const [pw, ph] = PAPER_MM[o.paper];
  const gap = 24;
  const orientations = o.orientation === 'landscape' ? [true] : o.orientation === 'portrait' ? [false] : [true, false];
  if (!sc.cols.length) {
    const landscape = o.orientation === 'auto' ? sc.W >= sc.H : o.orientation === 'landscape';
    return { W: sc.W, H: sc.H, landscape, moves: [], bandH: [] };
  }
  let best = null;
  for (let rows = 1; rows <= sc.cols.length; rows++) {
    const total = sc.cols.reduce((sum, c) => sum + c.w, 0);
    const target = total / rows;
    const packed = [];
    let row = [], width = 0;
    sc.cols.forEach(c => {
      if (row.length && width + c.w > target * 1.15 && packed.length < rows - 1) {
        packed.push(row); row = []; width = 0;
      }
      row.push(c); width += c.w;
    });
    if (row.length) packed.push(row);
    const rowW = Math.max(...packed.map(r => r.reduce((sum, c) => sum + c.w, 0)));
    const rowHs = packed.map(r => Math.max(...r.map(c => c.h)));
    const H = rowHs.reduce((a, b) => a + b, 0) + gap * (packed.length - 1);
    orientations.forEach(landscape => {
      const availW = ((landscape ? ph : pw) - 24);
      const availH = ((landscape ? pw : ph) - 24 - 26);
      const scale = Math.min(availW / rowW, availH / H);
      if (!best || scale > best.scale * 1.02) best = { scale, packed, rowHs, W: rowW, H, landscape };
    });
  }
  const moves = sc.cols.map(() => ({ dx: 0, dy: 0 }));
  const bandH = sc.cols.map(c => c.h);
  let y = 0;
  best.packed.forEach((row, ri) => {
    let x = 0;
    row.forEach(c => {
      const i = sc.cols.indexOf(c);
      moves[i] = { dx: x - c.x0, dy: y - c.top };
      bandH[i] = best.rowHs[ri];
      x += c.w;
    });
    y += best.rowHs[ri] + gap;
  });
  return { W: best.W, H: best.H, landscape: best.landscape, moves, bandH };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawTreeScene(sc, o, dpi, layout) {
  const mm = dpi / 25.4;
  const [pw, ph] = PAPER_MM[o.paper];
  const pageW = Math.round((layout.landscape ? ph : pw) * mm);
  const pageH = Math.round((layout.landscape ? pw : ph) * mm);
  const canvas = document.createElement('canvas');
  canvas.width = pageW;
  canvas.height = pageH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageW, pageH);

  const margin = 12 * mm;
  const headH = 16 * mm;
  const footH = 10 * mm;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2 - headH - footH;
  // Et lite tre blåses ikke opp til plakatstørrelse: høyst 1 skjermpiksel = 0,5 mm.
  const s = Math.min(availW / layout.W, availH / layout.H, 0.5 * mm);
  const ox = margin + (availW - layout.W * s) / 2;
  const oy = margin + headH;

  // Tittel øverst og nettstedet til høyre, alltid.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1a1a1a';
  ctx.font = `700 ${Math.round(8 * mm)}px ${sc.font}`;
  ctx.fillText(sc.title, margin, margin + 9 * mm);
  ctx.fillStyle = '#777777';
  ctx.font = `500 ${Math.round(3.6 * mm)}px ${sc.font}`;
  ctx.textAlign = 'right';
  ctx.fillText('aiskilltrees.com', pageW - margin, margin + 9 * mm);
  ctx.textAlign = 'left';

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);
  const at = (col, draw) => {
    const mv = layout.moves[col];
    ctx.save();
    if (mv) ctx.translate(mv.dx, mv.dy);
    draw();
    ctx.restore();
  };
  sc.bands.forEach(b => at(b.col, () => {
    ctx.fillStyle = b.fill;
    roundRectPath(ctx, b.x, b.y, b.w, layout.bandH[b.col] || b.h, b.r);
    ctx.fill();
  }));
  sc.edges.forEach(e => at(e.col, () => {
    ctx.strokeStyle = e.stroke;
    ctx.lineWidth = e.width;
    ctx.lineCap = e.cap || 'butt';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(e.d));
  }));
  sc.nodes.forEach(n => at(n.col, () => {
    roundRectPath(ctx, n.x + n.lw / 2, n.y + n.lw / 2, n.w - n.lw, n.h - n.lw, n.r);
    ctx.fillStyle = n.fill;
    ctx.fill();
    ctx.strokeStyle = n.stroke;
    ctx.lineWidth = n.lw;
    ctx.stroke();
    n.lines.forEach(l => {
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      const m = ctx.measureText('Hg');
      const asc = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || l.h * 0.8;
      const desc = m.fontBoundingBoxDescent || l.h * 0.2;
      ctx.fillText(l.text, l.x, l.y + (l.h - (asc + desc)) / 2 + asc);
    });
    if (n.check && o.rings) {
      const r = Math.min(n.check.w, n.check.h) / 2 - 1;
      ctx.beginPath();
      ctx.arc(n.check.x + n.check.w / 2, n.check.y + n.check.h / 2, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }));
  sc.headers.forEach(h => at(h.col, () => {
    ctx.font = h.font;
    ctx.fillStyle = h.color;
    if ('letterSpacing' in ctx) ctx.letterSpacing = h.spacing;
    const m = ctx.measureText('H');
    const asc = m.fontBoundingBoxAscent || h.h * 0.8;
    const desc = m.fontBoundingBoxDescent || h.h * 0.2;
    ctx.fillText(h.text, h.x, h.top + (h.h - (asc + desc)) / 2 + asc);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }));
  ctx.restore();

  // Tegnforklaring nederst: de tre formene.
  if (o.legend) {
    let lx = margin;
    const ly = pageH - margin - 4 * mm;
    ctx.font = `500 ${Math.round(3.4 * mm)}px ${sc.font}`;
    ctx.textBaseline = 'middle';
    sc.legend.forEach(item => {
      const bw = 9 * mm, bh = 5.5 * mm;
      roundRectPath(ctx, lx, ly - bh / 2, bw, bh, Math.min(item.r / 26 * bh / 2, bh / 2));
      ctx.fillStyle = item.fill;
      ctx.fill();
      ctx.strokeStyle = item.stroke;
      ctx.lineWidth = 0.35 * mm;
      ctx.stroke();
      ctx.fillStyle = '#333333';
      ctx.fillText(item.label, lx + bw + 2 * mm, ly);
      lx += bw + 2 * mm + ctx.measureText(item.label).width + 7 * mm;
    });
  }
  return canvas;
}

function pdfHexString(text) {
  let hex = 'FEFF';
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code > 0xffff) {
      const v = code - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else {
      hex += code.toString(16).padStart(4, '0');
    }
  }
  return '<' + hex.toUpperCase() + '>';
}

async function canvasToPdf(canvas, layout, o, title) {
  const [mw, mh] = PAPER_MM[o.paper];
  const pt = v => Math.round(v / 25.4 * 72 * 100) / 100;
  const pw = pt(layout.landscape ? mh : mw);
  const ph = pt(layout.landscape ? mw : mh);
  const gray = o.color === 'gray';
  const w = canvas.width, h = canvas.height;
  let img, filter, space;
  if (typeof CompressionStream === 'function') {
    const rgba = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    let raw;
    if (gray) {
      raw = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
        raw[j] = Math.round(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]);
      }
    } else {
      raw = new Uint8Array(w * h * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        raw[j] = rgba[i]; raw[j + 1] = rgba[i + 1]; raw[j + 2] = rgba[i + 2];
      }
    }
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
    img = new Uint8Array(await new Response(stream).arrayBuffer());
    filter = '/FlateDecode';
    space = gray ? '/DeviceGray' : '/DeviceRGB';
  } else {
    if (gray) {
      const ctx = canvas.getContext('2d');
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
    img = new Uint8Array(await blob.arrayBuffer());
    filter = '/DCTDecode';
    space = '/DeviceRGB';
  }
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let pos = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); pos += u.length; };
  const obj = (n, write) => { offsets[n] = pos; push(n + ' 0 obj\n'); write(); push('\nendobj\n'); };
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] ` +
                    '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'));
  obj(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace ${space} ` +
         `/BitsPerComponent 8 /Filter ${filter} /Length ${img.length} >>\nstream\n`);
    push(img);
    push('\nendstream');
  });
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  obj(6, () => push(`<< /Title ${pdfHexString(title)} /Creator (AI Skill Trees) >>`));
  const xref = pos;
  push('xref\n0 7\n0000000000 65535 f \n' +
       offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

function saveFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Gi nettleseren et øyeblikk til å lese blob-en før den frigjøres. */
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* Mappa resten av maskineriet ligger i, utledet av motorens egen adresse.
   Tom streng hvis vi ikke fikk vite den - da feiler hentingen under med en
   lesbar feil framfor å gjette på en sti. */
function engineDir() {
  if (!ENGINE_SRC) throw new Error('Vet ikke hvor engine.js ligger');
  return ENGINE_SRC.slice(0, ENGINE_SRC.lastIndexOf('/') + 1);
}

/* Alle filene motoren HAR lastet for dette treet, med NØYAKTIG de stiene
   den ba om dem på - det er hele avtalen mellom AIST_BUNDLE og
   fetchJson()/fetchText(). De ligger i nettleserens cache, så dette koster
   i praksis ingenting.

   Filene hentes på nytt framfor å settes sammen av MANIFEST/CORE/LANG i
   minnet, og det er med vilje: da kan en nøkkel ikke bli feil, fordi den
   er den samme strengen begge veier. */
async function bundleForDownload() {
  const famPath = CONFIG.subjectFamily
    ? (MANIFEST.subjectFamilies || {})[CONFIG.subjectFamily] : null;
  /* Bare elevens instrukser. Dekomponeringsmodellen og forfatterinstruksen
     er lærerens verktøy og ville lagt ~27 kB til fila for tekst ingen elev
     åpner - samme filter som bootstrap() bruker. */
  const paths = [ASSET_BASE + 'prompts/' + MANIFEST.shared]
    .concat(Object.keys(MANIFEST.instructions)
      .filter(id => (MANIFEST.instructions[id].audience || 'student') === 'student')
      .map(id => ASSET_BASE + 'prompts/' + MANIFEST.instructions[id].file))
    .concat(famPath ? [ASSET_BASE + 'prompts/' + famPath] : [])
    .concat([ASSET_BASE + 'languages/' + LANG.code + '.json']);

  const bundle = {
    'tree.csv': TREE_CSV_TEXT,
    [ASSET_BASE + 'prompts/manifest.json']: MANIFEST,
    /* Vokabularet blir med slik at nøklene i config-radene (country,
       institution, ...) får lesbar tekst i «Om faget» også uten nett. */
    '/trees/vocabulary.json': VOCAB
  };

  const loaded = await Promise.all(paths.map(path =>
    fetchJson(path).then(data => [path, data], () => null)));
  loaded.forEach(pair => { if (pair) bundle[pair[0]] = pair[1]; });
  return bundle;
}

async function buildStandaloneHtml() {
  const dir = engineDir();
  /* Stilarkene tas fra dokumentet framfor fra en liste her: da får fila
     nøyaktig det utseendet leseren ser, og en utrulling som legger til
     eller bytter et stilark trenger ikke endre motoren. Rekkefølgen er
     dokumentets egen, som er den som avgjør hvilke tokens som vinner. */
  const sheets = [].slice.call(document.querySelectorAll('link[rel="stylesheet"][href]'))
    .map(link => link.href);

  const [template, engine, papa, ...css] = await Promise.all(
    [dir + 'standalone.html', ENGINE_SRC, dir + 'vendor/papaparse.min.js']
      .concat(sheets)
      .map(url => fetch(url).then(res => {
        if (!res.ok) throw new Error('Fant ikke ' + url + ' (status ' + res.status + ')');
        return res.text();
      })));

  const bundle = await bundleForDownload();

  /* Erstatningen gjøres med en FUNKSJON som andre argument. Et vanlig
     strengargument ville latt `$&` og `$1` i instrukstekstene bety noe for
     String.replace, og en lærer som skriver `$&` i en prompt-rad skal ikke
     få fila si sabotert av det. */
  return template
    .replace('/*AIST:STYLES*/', () => css.join('\n'))
    .replace('/*AIST:PAPAPARSE*/', () => papa)
    /* `</` inne i en streng ville avsluttet script-taggen som omslutter
       den. Gjelder all tekst som kommer fra treet. */
    .replace('/*AIST:BUNDLE*/', () => 'window.AIST_BUNDLE = ' +
      JSON.stringify(bundle).replace(/<\//g, '<\\/') + ';')
    .replace('/*AIST:ENGINE*/', () => engine);
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
  closeBtn.className = 'nav-btn';
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
/* Config-radene lagrer nøkler («NO», «vgs», «vg2», «mathematics», «nb»),*/
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
  const m = CONFIG || {};
  body.innerHTML = '';

  /* Faktatabellen FØRST, ingressen etter. Vidars rekkefølge 2026-09-20:
     den som åpner «Om faget» er ute etter fag, nivå og læreplan, ikke en
     oppsummering de allerede har lest i katalogen.

     Faktatabellen. Bare rader som FINNES vises — et felt ingen har fylt ut
     skal ikke stå igjen som en tom rad. */
  const facts = [
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
    [t('courseInfo.size'),        nodeCountText()],
    /* Hvilken utgave av dekomponeringsmodellen treet ble laget etter. Står
       i tree.csv, ikke i katalogen: det er et faktum om fila, og det skal
       følge med den nedlastede utgaven. */
    [t('courseInfo.decompositionVersion'),
                                  CONFIG.decompositionVersion ? 'v' + String(CONFIG.decompositionVersion).replace(/^v/, '') : null],
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

  if (m.description) {
    const lead = document.createElement('p');
    lead.className = 'course-info__lead';
    lead.textContent = m.description;
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
  const basedOn = m.basedOn || [];

  if (credits.length || basedOn.length) {
    const h3 = document.createElement('h3');
    h3.textContent = t('courseInfo.credits');
    body.appendChild(h3);

    const dl = document.createElement('dl');
    dl.className = 'course-info__facts';
    credits.forEach(([key, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = t(key);
      const dd = document.createElement('dd');
      if (key === 'courseInfo.author' && safeLinkUrl(m.authorUrl)) {
        const a = document.createElement('a');
        a.href = safeLinkUrl(m.authorUrl);
        a.textContent = value;
        a.rel = 'noopener';
        dd.appendChild(a);
      } else {
        dd.textContent = value;
      }
      dl.append(dt, dd);
    });
    if (basedOn.length) {
      const dt = document.createElement('dt');
      dt.textContent = t('courseInfo.basedOn');
      const dd = document.createElement('dd');
      basedOn.forEach(entry => {
        const line = document.createElement('div');
        const text = [entry.title, entry.author].filter(Boolean).join(' — ');
        if (safeLinkUrl(entry.url)) {
          const a = document.createElement('a');
          a.href = safeLinkUrl(entry.url);
          a.textContent = text;
          a.rel = 'noopener';
          line.appendChild(a);
        } else {
          line.textContent = text;
        }
        dd.appendChild(line);
      });
      dl.append(dt, dd);
    }
    body.appendChild(dl);
  }
}

/* Tellingene regnes av nodene selv. De sto i meta.json før 0.31.0, og en
   kopi av et tall som kan telles, kommer ut av synk. */
function nodeCountText() {
  const count = type => allNodes.filter(n => n.type === type).length;
  const parts = [];
  if (count('skill')) parts.push(fmtCount('courseInfo.skills', count('skill')));
  if (count('concept')) parts.push(fmtCount('courseInfo.concepts', count('concept')));
  if (count('fact')) parts.push(fmtCount('courseInfo.facts', count('fact')));
  if (!parts.length && allNodes.length) parts.push(fmtCount('courseInfo.nodes', allNodes.length));
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
// mønster som ensureGoalIndexModal under. Hjelpevinduet og sikkerhetsvinduet
// er det samme vinduet med ulik tekst, så de deler bygget og id-mønsteret
// (`help-overlay`, `safety-overlay` …), og tree.css styler dem likt.
function ensureTextModal(prefix, heading, render) {
  let overlay = document.getElementById(prefix + '-overlay');
  if (overlay) return overlay;

  const close = () => overlay.classList.remove('open');

  overlay = document.createElement('div');
  overlay.id = prefix + '-overlay';
  overlay.className = 'text-overlay';
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  const modal = document.createElement('div');
  modal.id = prefix + '-modal';
  modal.className = 'text-modal';

  const header = document.createElement('div');
  header.className = 'text-modal-header';

  const h2 = document.createElement('h2');
  h2.textContent = heading;
  header.appendChild(h2);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'nav-btn';
  closeBtn.textContent = t('close');
  closeBtn.addEventListener('click', close);
  header.appendChild(closeBtn);

  modal.appendChild(header);

  const body = document.createElement('div');
  body.className = 'text-modal-body';
  render(body);
  modal.appendChild(body);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
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

/* Små figurer i Hjelp (fra 2026-11-11): hver forklaring har en tegning
   av det den forklarer, i treets egne farger og former, så teksten kan
   være kort. Tegnes i motoren som SVG og følger dag/natt. Seksjonene i
   språkfila sier hvilken figur de vil ha (`figure`). */
function helpFigure(key) {
  const ns = 'http://www.w3.org/2000/svg';
  const svgOf = (vb, inner) => {
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', vb);
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = inner;
    return svg;
  };
  const card = (x, y, w, h, r, type, extra) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" style="fill:var(--${type}-bg);stroke:var(--${type}-border)" stroke-width="1.5"/>` + (extra || '');
  const lines = (x, y, w) => `<path d="M${x} ${y}h${w}M${x} ${y + 5}h${w * 0.7}" style="stroke:var(--text-muted)" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>`;
  const ring = (cx, cy, on) => on
    ? `<circle cx="${cx}" cy="${cy}" r="5.5" style="fill:var(--success)"/><path d="M${cx - 2.6} ${cy}l1.9 2 3.4-4" fill="none" style="stroke:var(--surface)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<circle cx="${cx}" cy="${cy}" r="5.5" fill="none" style="stroke:var(--text-muted)" stroke-width="1.3" opacity="0.7"/>`;
  const arrow = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}" fill="none" style="stroke:var(--text-muted)" stroke-width="1.4"/>` +
    `<path d="M${x2 - 3} ${y2 - 4}L${x2} ${y2}L${x2 + 3} ${y2 - 4}" fill="none" style="stroke:var(--text-muted)" stroke-width="1.4" stroke-linecap="round"/>`;
  switch (key) {
    case 'menu':
      return svgOf('0 0 96 64', `<circle cx="48" cy="32" r="22" style="fill:var(--primary-tint);stroke:var(--primary)" stroke-opacity="0.4" stroke-width="1.5"/>` +
        `<path d="M38 24h20M38 32h20M38 40h20" style="stroke:var(--primary-strong, var(--primary))" stroke-width="2.6" stroke-linecap="round"/>`);
    case 'map':
      return svgOf('0 0 96 64', card(4, 4, 36, 16, 1, 'fakta') + card(56, 4, 36, 16, 5, 'begrep') +
        arrow(22, 20, 46, 42) + arrow(74, 20, 50, 42) + card(26, 42, 44, 18, 9, 'ferdighet'));
    case 'check':
      return svgOf('0 0 96 64', card(2, 20, 40, 24, 12, 'ferdighet', lines(9, 29, 16) + ring(33, 32, false)) +
        `<path d="M46 32h8M51 28l4 4-4 4" fill="none" style="stroke:var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
        card(58, 20, 36, 24, 12, 'ferdighet', lines(64, 29, 14) + ring(86, 32, true)));
    case 'detail':
      return svgOf('0 0 96 64', `<rect x="18" y="2" width="60" height="60" rx="4" style="fill:var(--surface);stroke:var(--border-strong)" stroke-width="1.2"/>` +
        `<path d="M25 12h34" style="stroke:var(--text)" stroke-width="3" stroke-linecap="round"/>` + lines(25, 22, 44) + lines(25, 33, 38) +
        `<rect x="25" y="46" width="34" height="9" rx="4.5" style="fill:var(--primary)"/>`);
    case 'stages':
      /* BARNESKOLEMATTE: to trinnbånd, en lukket celle i det øverste og to
         kort i det nederste, med skillelinja mellom. */
      return svgOf('0 0 96 64', `<rect x="0" y="2" width="96" height="27" style="fill:var(--stage-1)"/>` +
        `<rect x="0" y="35" width="96" height="27" style="fill:var(--stage-2)"/>` +
        `<path d="M0 32h96" style="stroke:var(--border-strong)" stroke-width="1.5"/>` +
        `<rect x="10" y="7" width="40" height="17" rx="4" style="fill:var(--surface);stroke:var(--border-strong)" stroke-width="1.3"/>` +
        `<rect x="13" y="10" width="40" height="17" rx="4" style="fill:var(--surface);stroke:var(--border-strong)" stroke-width="1.3"/>` +
        lines(18, 16, 24) + card(14, 41, 30, 15, 7, 'ferdighet') + card(52, 41, 30, 15, 1, 'fakta'));
    case 'bulk': {
      const wrap = makeEl('div', 'help-fig-bulk');
      wrap.innerHTML = bulkIcon(true, false) + bulkIcon(false, false) + bulkIcon(true, true);
      return wrap;
    }
    case 'search': return menuIcon('search', '--primary', 13);
    case 'print': return menuIcon('print', '--amber', 17);
    case 'exam': case 'lesson': case 'motivation': return resourceArt(key);
    default: return null;
  }
}

function renderHelpBody(body) {
  body.innerHTML = '';
  const enabled = { 'feature:aids': treeUsesAids(), 'feature:motivation': SHOW_MOTIVATION_BUTTON };
  (LANG.ui.help.sections || []).forEach(sec => {
    if (sec.when && !enabled[sec.when]) return;
    const item = makeEl('div', 'help-item');
    const fig = makeEl('div', 'help-fig');
    const drawn = sec.figure ? helpFigure(sec.figure) : null;
    if (drawn) fig.appendChild(drawn);
    item.appendChild(fig);
    const text = makeEl('div', 'help-text');
    helpSection(text, sec.heading, sec.body);
    item.appendChild(text);
    body.appendChild(item);
  });
  /* Hurtigtastene står sist, som en liste: tast til venstre, hva den gjør
     til høyre. Se setupShortcuts. */
  const keys = [
    [shortcutLabel('K'), t('help.shortcuts.search')],
    ['Esc', t('help.shortcuts.escape')],
    ['+  −', t('help.shortcuts.zoom')],
    ['0', t('help.shortcuts.fit')],
  ];
  const h3 = document.createElement('h3');
  h3.textContent = t('help.shortcuts.heading');
  body.appendChild(h3);
  const ul = makeEl('ul', 'help-kbd-list');
  keys.forEach(([k, what]) => {
    const li = document.createElement('li');
    li.appendChild(makeEl('kbd', null, k));
    li.appendChild(makeEl('span', null, what));
    ul.appendChild(li);
  });
  body.appendChild(ul);
}

function openHelpModal() {
  ensureTextModal('help', t('help.heading'), renderHelpBody).classList.add('open');
}

/* Sikkerhet. Et tre er noe som sendes rundt, ofte som en .html-fil, og den
   som tar imot det kan ikke se hvem som laget fila. Vinduet sier hva et
   ekte tre aldri gjør og hva man skal se etter, slik at en falsk fil som
   ber om innlogging skiller seg ut. Lenken står i topplinja, ikke i
   menyen: den skal ses før man har begynt å bruke treet. Teksten står i
   språkfila (ui.safety). */
function renderSafetyBody(body) {
  body.innerHTML = '';
  const lead = document.createElement('p');
  lead.className = 'text-modal-lead';
  lead.textContent = t('safety.lead');
  body.appendChild(lead);
  (LANG.ui.safety.sections || []).forEach(sec => helpSection(body, sec.heading, sec.body));
}

function openSafetyModal() {
  ensureTextModal('safety', t('safety.heading'), renderSafetyBody).classList.add('open');
}

/* Varseltrekant som SVG framfor tegnet ⚠: tegnet blir en farget emoji på
   mange maskiner og tar ikke fargen fra teksten. */
function warningIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'warning-icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M12 2.5 1 21.5h22L12 2.5Zm-1 7h2v6h-2v-6Zm0 8h2v2h-2v-2Z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
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
  h2.id = 'goal-index-heading';
  header.appendChild(h2);

  const actions = document.createElement('div');
  actions.id = 'goal-index-actions';

  /* Forklaringen står bak «?» framfor øverst i lista (fra 2026-11-11).
     Teksten settes ved åpning, etter hva vinduet brukes til. */
  const help = makeEl('p', 'aist-help');
  help.id = 'goal-index-help';
  help.hidden = true;
  const helpBtn = helpToggle(help);
  helpBtn.id = 'goal-index-help-btn';
  actions.appendChild(helpBtn);

  /* Sekundær: vinduets hovedhandling er å krysse av (og «Lag ressurs»
     nederst i undervisningsopplegg). Én fremhevet knapp per vindu. */
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn secondary';
  copyBtn.id = 'goal-index-copy';
  const showCopy = swapLabel(copyBtn, [t('goalIndex.copyAll'), t('copied')]);
  copyBtn.addEventListener('click', () => {
    const text = composeGoalIndexText();
    trackCopy('goal_index');
    navigator.clipboard.writeText(text).then(() => {
      showCopy(1);
      setTimeout(() => showCopy(0), 1500);
    }).catch(() => {
      window.prompt(t('copyFallback'), text);
    });
  });
  actions.appendChild(copyBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'nav-btn';
  closeBtn.textContent = t('close');
  closeBtn.addEventListener('click', closeGoalIndexModal);
  actions.appendChild(closeBtn);

  header.appendChild(actions);
  modal.appendChild(header);
  modal.appendChild(help);

  const body = document.createElement('div');
  body.id = 'goal-index-body';
  modal.appendChild(body);

  // Fast bunnlinje (utenfor det scrollbare innholdet) med undervisnings-
  // opplegg-generatoren. Ligger her og ikke i handlingsmenyen fordi selve
  // utvalget av læringsmål skjer i denne lista - knapp og utvalg hører
  // sammen. Vises bare i undervisningsplanleggeren (goalIndexMode 'lesson').
  const bar = document.createElement('div');
  bar.id = 'lesson-plan-bar';

  const countLabel = document.createElement('div');
  countLabel.id = 'lesson-plan-count';
  bar.appendChild(countLabel);

  // Utkast 2026-11-10: lengde og type time har flyttet inn i ressursvelgeren,
  // på kortet for undervisningsopplegget. Bunnlinja har nå bare én knapp,
  // som åpner velgeren. Id-en `lesson-plan-btn` er beholdt for stilens skyld.
  const planBtn = document.createElement('button');
  planBtn.id = 'lesson-plan-btn';
  planBtn.type = 'button';
  planBtn.textContent = t('make.button');
  planBtn.title = t('make.buttonTitle');
  planBtn.addEventListener('click', openResourcePicker);
  bar.appendChild(planBtn);

  modal.appendChild(bar);

  // Ressursvelgeren ligger i samme vindu som lista, og bytter plass med den.
  // Utvalget av læringsmål ligger fast mens læreren velger hva som skal lages.
  const picker = document.createElement('div');
  picker.id = 'resource-picker';
  picker.hidden = true;
  modal.appendChild(picker);

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

// Hva avkryssinga i læringsmål-lista betyr akkurat nå: 'outcomes' (mestret)
// eller 'lesson' (utvalg til økta). Settes av openGoalIndexModal.
let goalIndexMode = 'outcomes';

// Lengden økta får hvis læreren ikke oppgir en. Fra 0.27.0 regner motoren
// ikke ut noen timeplan: hvordan økta deles opp, står i seksjonen
// `planIntro` o.l. i lesson-plan.json (fram til 4.0.0 `structure`, fram til 5.0.0 `plan`), som hver
// fagfamilie skriver for seg (matematikk med 7 minutter oppstart og 5
// minutter gjenhenting). Vidar,
// 2026-10-03: timeplanleggeren skal ikke bestå av en håndfull variabler.
const LESSON_DEFAULT_MINUTES = 45;

// Typene time i velgeren, i den rekkefølgen de vises. Den første er
// standard. Hver har sin seksjon i lesson-plan.json (planIntro,
// planPractice, planReview, planOther) og sin betingelse i CONDITIONS.
const LESSON_TYPES = ['intro', 'practice', 'review', 'other'];

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

// Tegner lista på nytt uten å miste plassen i den eller fokuset, så
// læreren kan fortsette nedover etter en avkryssing eller en masse-knapp.
function rerenderGoalIndexBody(body, focusId) {
  const scrollTop = body.scrollTop;
  renderGoalIndexBody(body);
  body.scrollTop = scrollTop;
  const again = focusId && document.getElementById(focusId);
  if (again) again.focus();
}

// Kryss av / fjern krysset for mange læringsmål på én gang: mestret i
// «Vis alle læringsmål» (samme bulkSetMastery som ✓/✕ over kolonnene i
// kartet), utvalget til økta i undervisningsplanleggeren.
function setGoalIndexChecks(nodes, on) {
  if (goalIndexMode === 'lesson') {
    nodes.forEach(n => { if (on) lessonSelection.add(n.id); else lessonSelection.delete(n.id); });
    updateLessonPlanBar();
  } else {
    bulkSetMastery(nodes, on);
  }
}

/* Ikonene for «merk mange» (fra 2026-11-11): en liten punktliste der
   alle radene har grønn hake (merk alle) eller tom ring (fjern alle).
   Gjelder ett emne er det én liste; gjelder det hele treet er det to
   lister side om side, merket A og B, som står for alle emnene. Teksten
   står i title og aria-label, så knappen har fortsatt et navn. Brukes
   overalt der mange mål merkes på én gang: over kolonnene i treet, i
   Læringsmål, i Undervisningsopplegg og i Prøve. */
function bulkIcon(on, multi) {
  const mark = (cx, cy, r) => on
    ? `<circle cx="${cx}" cy="${cy}" r="${r}" class="bi-on"/><path d="M${cx - r * 0.5} ${cy}l${r * 0.38} ${r * 0.4} ${r * 0.62}-${r * 0.75}" class="bi-tick"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" class="bi-off"/>`;
  const list = (x0, y0, rows, len) => {
    let out = '';
    for (let i = 0; i < rows; i++) {
      const cy = y0 + i * 6.4;
      out += mark(x0 + 2.6, cy, 2.3) + `<path d="M${x0 + 7} ${cy}h${len}" class="bi-line"/>`;
    }
    return out;
  };
  let body, w;
  if (multi) {
    w = 34;
    body = `<text x="2" y="5.6" class="bi-letter">A</text><text x="19" y="5.6" class="bi-letter">B</text>` +
           list(1, 10.2, 3, 6) + list(18, 10.2, 3, 6);
  } else {
    w = 22;
    body = list(1, 5.2, 3, 12);
  }
  return `<svg viewBox="0 0 ${w} 24" width="${w}" height="24" aria-hidden="true" class="bulk-icon${on ? ' on' : ''}">${body}</svg>`;
}

function bulkIconButton(title, on, multi, onClick, extraClass) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'column-header-btn bulk-btn' + (multi ? ' bulk-multi' : '') + (extraClass ? ' ' + extraClass : '');
  btn.innerHTML = bulkIcon(on, multi);
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.addEventListener('click', onClick);
  return btn;
}

// Merk/fjern mange i Læringsmål og Undervisningsopplegg.
function goalIndexBulkButton(title, nodes, on, body, multi) {
  const btn = bulkIconButton(title, on, multi, () => {
    // Å fjerne mestret for hele treet sletter elevens framgang; det ene
    // trykket som ikke kan angres med ett nytt, spør først.
    if (!on && goalIndexMode !== 'lesson' && nodes === allNodes &&
        !window.confirm(t('goalIndex.clearAllConfirm'))) return;
    setGoalIndexChecks(nodes, on);
    rerenderGoalIndexBody(body, null);
  }, multi ? 'goal-index-bulk-btn' : '');
  return btn;
}

function renderGoalIndexBody(body) {
  body.innerHTML = '';
  const progress = getProgress();
  const lessonMode = goalIndexMode === 'lesson';


  const bulk = document.createElement('div');
  bulk.id = 'goal-index-bulk';
  const allOn = lessonMode ? t('lessonPlanner.selectAll') : t('goalIndex.markAllButton');
  const allOff = lessonMode ? t('lessonPlanner.deselectAll') : t('goalIndex.clearAllButton');
  bulk.appendChild(goalIndexBulkButton(allOn, allNodes, true, body, true));
  bulk.appendChild(goalIndexBulkButton(allOff, allNodes, false, body, true));
  body.appendChild(bulk);

  themeList.forEach(({ letter, topic, nodes }) => {
    const section = document.createElement('div');
    section.className = 'goal-index-section';

    const h3 = document.createElement('h3');
    const label = document.createElement('span');
    label.textContent = `${letter}) ${topic}`;
    h3.appendChild(label);
    const actions = document.createElement('span');
    actions.className = 'column-header-actions';
    actions.appendChild(goalIndexBulkButton(
      t(lessonMode ? 'lessonPlanner.selectTopic' : 'column.markAll', { topic: topic }), nodes, true, body, false));
    actions.appendChild(goalIndexBulkButton(
      t(lessonMode ? 'lessonPlanner.deselectTopic' : 'column.clearAll', { topic: topic }), nodes, false, body, false));
    h3.appendChild(actions);
    section.appendChild(h3);

    /* Fra 2026-11-11 (utkast) er hvert læringsmål en liten utgave av
       kortet i treet: samme farge og form etter typen, svak til det er
       valgt (i undervisningsopplegg) eller mestret (i læringsmål-lista),
       i full farge når det er det. Hele boksen trykkes. Det lille sikte-
       ikonet til høyre hopper til noden i treet, som navnet gjorde før. */
    const ul = document.createElement('ul');
    ul.className = 'goal-list';
    nodes.forEach(n => {
      const status = goalStatus(n, progress);
      const on = lessonMode ? lessonSelection.has(n.id) : status.kind === 'mastered';

      const li = makeEl('li', 'goal-row');
      const box = makeEl('button', 'goal-box type-' + n.type + (on ? ' on' : '') + (lessonMode ? ' no-check' : ''));
      box.type = 'button';
      box.id = 'goal-pick-' + n.id;
      box.setAttribute('aria-pressed', String(on));
      box.setAttribute('aria-label', t(lessonMode ? 'lesson.includeAria' : 'goalIndex.markAria', { name: n.name }));
      box.appendChild(makeEl('span', 'node-index', n.goalIndex + ') '));
      box.appendChild(document.createTextNode(n.name));
      /* Ingen statuslinje («Klar til å læres», «Mangler først: A2») under
         navnet (fjernet 2026-11-11). Den gjorde lista tung å lese, og
         boksen endret høyde når et mål ble krysset av, så alt under hoppet. */
      /* Haken betyr «mestret», så den hører bare hjemme i læringsmål-lista.
         I undervisningsopplegg viser full farge at målet er valgt
         (Vidar, 2026-11-11: haken der «gir ingen mening»). */
      if (!lessonMode) {
        const check = makeEl('span', 'mastery-check');
        check.setAttribute('aria-hidden', 'true');
        check.innerHTML = CHECK_SVG;
        box.appendChild(check);
      }

      box.addEventListener('click', () => {
        if (lessonMode) {
          const now = !lessonSelection.has(n.id);
          if (now) lessonSelection.add(n.id); else lessonSelection.delete(n.id);
          box.classList.toggle('on', now);
          box.setAttribute('aria-pressed', String(now));
          updateLessonPlanBar();
        } else {
          setNodeProgress(n.id, 'mastered', status.kind !== 'mastered');
          // Statusen til alt som bygger på noden endres også (klar/mangler),
          // så hele lista tegnes på nytt.
          rerenderGoalIndexBody(body, box.id);
        }
      });
      li.appendChild(box);

      const locate = makeEl('button', 'goal-locate');
      locate.type = 'button';
      locate.title = t('goalIndex.openNode');
      locate.setAttribute('aria-label', t('goalIndex.openNode') + ': ' + n.name);
      locate.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5.5"/><path d="M10 1.5v3.5M10 15v3.5M1.5 10h3.5M15 10h3.5"/></svg>';
      locate.addEventListener('click', () => {
        closeGoalIndexModal();
        scrollNodeIntoView(n.id);   // «gå til noden i treet», ikke bare åpne panelet
        openDetail(n.id);
      });
      li.appendChild(locate);
      ul.appendChild(li);
    });
    section.appendChild(ul);

    body.appendChild(section);
  });
}

function openGoalIndexModal(mode) {
  goalIndexMode = mode === 'lesson' ? 'lesson' : 'outcomes';
  const overlay = ensureGoalIndexModal();
  const lessonMode = goalIndexMode === 'lesson';
  document.getElementById('goal-index-heading').textContent =
    t(lessonMode ? 'lessonPlanner.heading' : 'goalIndex.heading');
  document.getElementById('lesson-plan-bar').hidden = !lessonMode;
  document.getElementById('resource-picker').hidden = true;
  document.getElementById('goal-index-body').hidden = false;
  document.getElementById('goal-index-copy').hidden = false;
  setGoalIndexHelp(lessonMode ? 'lessonPlanner.intro' : 'goalIndex.intro');
  renderGoalIndexBody(document.getElementById('goal-index-body'));
  updateLessonPlanBar();
  overlay.classList.add('open');
}

function closeGoalIndexModal() {
  const overlay = document.getElementById('goal-index-overlay');
  if (overlay) overlay.classList.remove('open');
}

/* ------------------------------------------------------------------ */
/* Søk: finn et læringsmål på navn, beskrivelse eller emne              */
/* ------------------------------------------------------------------ */

/* Søket er lokalt og trivielt - alle nodene ligger allerede i minnet, og
   et fag har titalls, ikke titusener, av dem. Grunnen til at det finnes
   likevel: lista over alle læringsmål er sortert etter tema, og den som
   husker et ORD fra et læringsmål, men ikke hvilket tema det lå under,
   har ingen vei inn i treet uten å lese seg gjennom hele lista. Søket
   leter derfor i BESKRIVELSEN også, ikke bare i navnet - det er der
   ordet man husker som oftest står. */

function setupSearchButton() {
  const panel = ensureActionMenu();
  if (!panel) return;

  const btn = document.createElement('button');
  btn.id = 'search-btn';
  btn.type = 'button';
  btn.textContent = t('search.button');
  btn.title = t('search.title');
  btn.addEventListener('click', () => {
    closeActionMenu();
    openSearchModal();
  });
  btn.dataset.shortcut = shortcutLabel('K');
  panel.appendChild(btn);
}

/* Hurtigtaster (fra 2026-11-11). Ctrl+K (⌘K på Mac) åpner søket, slik
   det gjør i de fleste nettsteder med søk. Esc lukker det som er øverst.
   + og − zoomer og 0 viser hele treet, men bare når markøren ikke står i
   et tekstfelt. Alle står i Hjelp under «Hurtigtaster». */
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
function shortcutLabel(key) { return (IS_MAC ? '⌘' : 'Ctrl+') + key; }
function setupShortcuts() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      if (!document.getElementById('search-btn')) return;
      e.preventDefault();
      closeActionMenu();
      openSearchModal();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.open[id$="-overlay"], .aist-overlay.open, .text-overlay.open')) return;
    if (e.key === 'Escape' && activeNodeId) { closeDetail(); return; }
    const tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
    if (e.key === '+' || e.key === '=') { zoomBy(1.25); e.preventDefault(); }
    else if (e.key === '-' || e.key === '−') { zoomBy(1 / 1.25); e.preventDefault(); }
    else if (e.key === '0') { toggleFitView(); e.preventDefault(); }
  });
}

/* Tegn som ikke brytes opp av NFD-normalisering, og som brukere skriver om
   hverandre. «sok» skal finne «søk», «lare» skal finne «lære» - den som
   søker skriver ikke nødvendigvis bokstaven riktig. */
const SEARCH_CHAR_FOLD = { 'ø': 'o', 'æ': 'a', 'ð': 'd', 'þ': 't', 'đ': 'd', 'ł': 'l' };

/* Normaliserer teksten OG holder rede på hvor hvert normaliserte tegn kom
   fra i originalen. Kartet er poenget: uten det kan et treff i den
   normaliserte strengen ikke markeres i den originale, og markeringen er
   hele grunnen til at panelet er nyttigere enn en ren liste. */
function searchIndex(text) {
  const src = String(text == null ? '' : text);
  let norm = '';
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const lower = src[i].toLowerCase();
    const folded = SEARCH_CHAR_FOLD[lower] || lower.normalize('NFD')[0] || lower;
    for (let k = 0; k < folded.length; k++) {
      norm += folded[k];
      map.push(i);
    }
  }
  return { norm: norm, map: map };
}

function searchTerms(query) {
  return searchIndex(query).norm.split(/\s+/).filter(Boolean);
}

/* Skriver teksten inn i `el` med hvert treff pakket i <mark>. Returnerer
   om noe ble markert, slik at den som kaller kan sortere navnetreff først. */
function renderHighlighted(el, text, terms) {
  const source = String(text == null ? '' : text);
  const indexed = searchIndex(source);
  const norm = indexed.norm;
  const map = indexed.map;

  // Finn alle treffintervaller først, slå sammen overlappende, og skriv så
  // teksten én gang. Å skrive den per term ville doble teksten når to
  // termer treffer samme sted.
  const spans = [];
  terms.forEach(term => {
    if (!term) return;
    let from = 0;
    for (;;) {
      const j = norm.indexOf(term, from);
      if (j < 0) break;
      spans.push([map[j], map[j + term.length - 1] + 1]);
      from = j + term.length;
    }
  });

  if (!spans.length) {
    el.appendChild(document.createTextNode(source));
    return false;
  }

  spans.sort((a, b) => a[0] - b[0]);
  const merged = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const last = merged[merged.length - 1];
    if (spans[i][0] <= last[1]) last[1] = Math.max(last[1], spans[i][1]);
    else merged.push(spans[i]);
  }

  let cursor = 0;
  merged.forEach(span => {
    const start = span[0];
    const end = span[1];
    if (start > cursor) el.appendChild(document.createTextNode(source.slice(cursor, start)));
    const mark = document.createElement('mark');
    mark.textContent = source.slice(start, end);
    el.appendChild(mark);
    cursor = end;
  });
  if (cursor < source.length) el.appendChild(document.createTextNode(source.slice(cursor)));
  return true;
}

/* Alle noder i temarekkefølge, med emnet og indeksnummeret de har i lista
   over læringsmål - samme nummerering, slik at et søketreff og et oppslag
   i lista viser det samme læringsmålet med det samme navnet. */
function searchCorpus() {
  const rows = [];
  themeList.forEach(entry => {
    entry.nodes.forEach(n => {
      rows.push({
        node: n,
        topic: entry.topic,
        label: entry.letter + ') ' + entry.topic,
        name: n.name,
        description: n.description || '',
      });
    });
  });
  return rows;
}

function searchMatches(query) {
  const terms = searchTerms(query);
  if (!terms.length) return { terms: terms, hits: [] };

  const hits = [];
  searchCorpus().forEach(row => {
    const name = searchIndex(row.name).norm;
    const description = searchIndex(row.description).norm;
    const topic = searchIndex(row.topic).norm;
    const hay = name + ' ' + description + ' ' + topic;
    if (!terms.every(term => hay.indexOf(term) >= 0)) return;
    // Navnetreff først: den som søker på et ord som STÅR i navnet, leter
    // nesten alltid etter akkurat den noden.
    hits.push({ row: row, inName: terms.some(term => name.indexOf(term) >= 0) });
  });

  hits.sort((a, b) => (b.inName ? 1 : 0) - (a.inName ? 1 : 0));
  return { terms: terms, hits: hits };
}

// Modalen bygges lat, én gang, og gjenbrukes - som de andre vinduene.
function ensureSearchModal() {
  let overlay = document.getElementById('search-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'search-overlay';
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeSearchModal();
  });

  const modal = document.createElement('div');
  modal.id = 'search-modal';

  const header = document.createElement('div');
  header.id = 'search-header';

  const h2 = document.createElement('h2');
  h2.textContent = t('search.heading');
  header.appendChild(h2);

  /* Forklaringen bak «?», som i de andre vinduene (2026-11-11). */
  const help = makeEl('p', 'aist-help', t('search.hint'));
  help.hidden = true;
  const headActions = makeEl('div', 'aist-modal-actions');
  headActions.appendChild(helpToggle(help));
  const closeBtn = document.createElement('button');
  closeBtn.className = 'nav-btn';
  closeBtn.textContent = t('close');
  closeBtn.addEventListener('click', closeSearchModal);
  headActions.appendChild(closeBtn);
  header.appendChild(headActions);

  modal.appendChild(header);
  modal.appendChild(help);

  const field = document.createElement('div');
  field.id = 'search-field';
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'search-input';
  input.autocomplete = 'off';
  input.placeholder = t('search.placeholder');
  input.setAttribute('aria-label', t('search.placeholder'));
  input.addEventListener('input', () => renderSearchBody());
  input.addEventListener('keydown', e => {
    // Enter hopper til det øverste treffet, slik at man kan skrive et ord
    // og trykke Enter uten å flytte hånda til musa.
    if (e.key !== 'Enter') return;
    const first = document.querySelector('#search-body .search-item-name');
    if (first) first.click();
  });
  field.appendChild(input);
  modal.appendChild(field);

  const body = document.createElement('div');
  body.id = 'search-body';
  modal.appendChild(body);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeSearchModal();
  });

  return overlay;
}

function renderSearchBody() {
  const body = document.getElementById('search-body');
  const input = document.getElementById('search-input');
  if (!body || !input) return;
  body.innerHTML = '';

  const query = input.value.trim();
  if (!query) return;   // forklaringen står bak «?»

  const result = searchMatches(query);
  const terms = result.terms;
  const hits = result.hits;

  if (!hits.length) {
    const none = document.createElement('p');
    none.className = 'search-note';
    none.textContent = t('search.noResults', { query: query });
    body.appendChild(none);
    return;
  }

  const count = document.createElement('p');
  count.className = 'search-note';
  count.textContent = hits.length === 1 ? t('search.countOne') : t('search.countMany', { n: hits.length });
  body.appendChild(count);

  const progress = getProgress();
  const ul = document.createElement('ul');
  ul.id = 'search-results';

  hits.forEach(hit => {
    const row = hit.row;
    const n = row.node;
    const status = goalStatus(n, progress);

    const li = document.createElement('li');
    li.className = 'search-item status-' + status.kind;

    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'search-item-name goal-ref type-' + n.type;
    jump.title = t('search.openNode');
    jump.appendChild(document.createTextNode(n.goalIndex + ') '));
    renderHighlighted(jump, n.name, terms);
    jump.addEventListener('click', () => {
      closeSearchModal();
      scrollNodeIntoView(n.id);
      openDetail(n.id);
    });
    li.appendChild(jump);

    const meta = document.createElement('div');
    meta.className = 'search-item-meta';
    const topic = document.createElement('span');
    topic.className = 'search-item-topic';
    renderHighlighted(topic, row.label, terms);
    meta.appendChild(topic);
    const badge = document.createElement('span');
    badge.className = 'search-item-status';
    badge.textContent = status.symbol + ' ' + status.text;
    if (status.title) badge.title = status.title;
    meta.appendChild(badge);
    li.appendChild(meta);

    if (row.description) {
      const desc = document.createElement('div');
      desc.className = 'search-item-description';
      const lead = document.createElement('span');
      lead.className = 'search-item-leadin';
      lead.textContent = learnerLeadIn(n.type);
      desc.appendChild(lead);
      desc.appendChild(document.createTextNode(' '));
      renderHighlighted(desc, row.description, terms);
      li.appendChild(desc);
    }

    ul.appendChild(li);
  });

  body.appendChild(ul);
}

function openSearchModal() {
  const overlay = ensureSearchModal();
  overlay.classList.add('open');
  renderSearchBody();
  const input = document.getElementById('search-input');
  if (input) {
    input.select();
    input.focus();
  }
}

function closeSearchModal() {
  const overlay = document.getElementById('search-overlay');
  if (overlay) overlay.classList.remove('open');
}

/* ------------------------------------------------------------------ */
/* Ressurser: alle ressursene i treet, og hvilke noder de hører til     */
/* ------------------------------------------------------------------ */

/* Detaljpanelet viser ressursene til ÉN node. Denne lista går den andre
   veien: fra ressursen til nodene. Det er den læreren trenger for å se
   hva et eksamenssett eller et kapittel dekker, og den eleven trenger
   for å finne igjen en video hen husker, men ikke hvilken node den lå
   under. Knappen finnes bare når treet har ressurser. */
/* Innenfor en gruppe står ressursene alfabetisk, med tallene lest som tall:
   «oppgave 2b» før «oppgave 10», og en oppgave lagt til i etterkant havner
   der den hører hjemme, ikke bakerst. Gruppene selv står i den rekkefølgen
   de først står i fila. Sorteringen følger treets språk, så æ, ø og å
   kommer sist i et norsk tre. */
let resourceCollator = null;
function compareResources(a, b) {
  if (!resourceCollator) {
    const opts = { numeric: true, sensitivity: 'base' };
    /* En språkkode Intl ikke kjenner, kaster - da sorteres det etter
       nettleserens eget språk framfor ikke i det hele tatt. */
    try { resourceCollator = new Intl.Collator(CONFIG.language || undefined, opts); }
    catch (e) { resourceCollator = new Intl.Collator(undefined, opts); }
  }
  return resourceCollator.compare(a.label, b.label);
}

function setupResourcesButton() {
  if (!RESOURCE_ROWS.length) return;
  const panel = ensureActionMenu();
  if (!panel) return;

  const btn = document.createElement('button');
  btn.id = 'resources-btn';
  btn.type = 'button';
  btn.textContent = t('resourceList.button');
  btn.title = t('resourceList.title');
  btn.addEventListener('click', () => {
    closeActionMenu();
    openResourcesModal();
  });
  panel.appendChild(btn);
}

// Modalen bygges lat, én gang, og gjenbrukes - som de andre vinduene.
function ensureResourcesModal() {
  let overlay = document.getElementById('resources-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'resources-overlay';
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeResourcesModal();
  });

  const modal = document.createElement('div');
  modal.id = 'resources-modal';

  const header = document.createElement('div');
  header.id = 'resources-header';
  const h2 = document.createElement('h2');
  h2.textContent = t('resourceList.heading');
  header.appendChild(h2);
  const help = makeEl('p', 'aist-help', t('resourceList.help'));
  help.hidden = true;
  const headActions = makeEl('div', 'aist-modal-actions');
  headActions.appendChild(helpToggle(help));
  const closeBtn = document.createElement('button');
  closeBtn.className = 'nav-btn';
  closeBtn.textContent = t('close');
  closeBtn.addEventListener('click', closeResourcesModal);
  headActions.appendChild(closeBtn);
  header.appendChild(headActions);
  modal.appendChild(header);
  modal.appendChild(help);

  const field = document.createElement('div');
  field.id = 'resources-field';
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'resources-input';
  input.autocomplete = 'off';
  input.placeholder = t('resourceList.placeholder');
  input.setAttribute('aria-label', t('resourceList.placeholder'));
  input.addEventListener('input', () => renderResourcesBody());
  field.appendChild(input);
  modal.appendChild(field);

  const body = document.createElement('div');
  body.id = 'resources-body';
  modal.appendChild(body);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeResourcesModal();
  });

  return overlay;
}

/* Filteret leter i tittel, gruppe og lenke, og i navnene på nodene
   ressursen hører til - «hvilke ressurser har jeg til prosentregning?» er
   et spørsmål om nodene, ikke om ressursene. Samme normalisering som
   søket, så «sok» finner «søk». */
function resourceMatches(res, terms) {
  if (!terms.length) return true;
  const names = res.nodes.map(id => (nodesById.get(id) || {}).name || id);
  const hay = searchIndex([res.label, res.group, res.url].concat(names).join(' ')).norm;
  return terms.every(term => hay.indexOf(term) >= 0);
}

function renderResourcesBody() {
  const body = document.getElementById('resources-body');
  const input = document.getElementById('resources-input');
  if (!body) return;
  body.innerHTML = '';

  const terms = searchIndex(input ? input.value.trim() : '').norm.split(/\s+/).filter(Boolean);
  const hits = allResources.filter(res => resourceMatches(res, terms));

  const note = document.createElement('p');
  note.className = 'search-note';
  if (!hits.length) {
    note.textContent = t('resourceList.noResults', { query: input.value.trim() });
    body.appendChild(note);
    return;
  }
  note.textContent = terms.length
    ? t('resourceList.countFiltered', { n: hits.length, total: allResources.length })
    : t('resourceList.intro', { n: allResources.length });
  body.appendChild(note);

  /* Én overskrift per gruppe, i den rekkefølgen gruppene først står i
     fila - samme regel som i detaljpanelet. */
  const groups = new Map();
  hits.forEach(res => {
    const key = res.group || t('detail.resources');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(res);
  });

  groups.forEach((items, heading) => {
    items.sort(compareResources);
    const section = document.createElement('div');
    section.className = 'resources-section';
    const h3 = document.createElement('h3');
    h3.textContent = heading + ' (' + items.length + ')';
    section.appendChild(h3);

    const ul = document.createElement('ul');
    items.forEach(res => {
      const li = document.createElement('li');
      li.className = 'resources-item';

      const title = document.createElement('div');
      title.className = 'resources-item-label';
      if (res.url) {
        const a = document.createElement('a');
        a.href = res.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = res.label;
        title.appendChild(a);
      } else {
        title.textContent = res.label;
      }
      li.appendChild(title);

      const nodes = document.createElement('div');
      nodes.className = 'resources-item-nodes';
      res.nodes.forEach(id => {
        const n = nodesById.get(id);
        if (!n) return;   // feillista har allerede sagt fra om en ukjent id
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'resources-node goal-ref type-' + n.type;
        jump.textContent = (n.goalIndex ? n.goalIndex + ') ' : '') + n.name;
        jump.title = t('resourceList.openNode');
        jump.addEventListener('click', () => {
          closeResourcesModal();
          scrollNodeIntoView(n.id);
          openDetail(n.id);
        });
        nodes.appendChild(jump);
      });
      li.appendChild(nodes);
      ul.appendChild(li);
    });
    section.appendChild(ul);
    body.appendChild(section);
  });
}

function openResourcesModal() {
  const overlay = ensureResourcesModal();
  overlay.classList.add('open');
  renderResourcesBody();
  const input = document.getElementById('resources-input');
  if (input) input.focus();
}

function closeResourcesModal() {
  const overlay = document.getElementById('resources-overlay');
  if (overlay) overlay.classList.remove('open');
}

/* ------------------------------------------------------------------ */
/* Prøvegenerator: KI-instruks for en prøve basert på mestrede noder    */
/* ------------------------------------------------------------------ */

/* Prøven (utkast 2026-11-11): knappen i menyen åpner et vindu i samme form
   som ressursvelgeren, med vanskelighetsgrad, antall oppgaver og
   oppgaveform. Til nå var det et tallfelt og en knapp rett i menyen.
   Prøven bygger fortsatt på det som er krysset av som mestret. */
const EXAM_OPTIONS = { difficulty: 'medium', count: 10, format: 'mixed' };
const EXAM_COUNT_CHOICES = [5, 10, 15, 20];

function setupExamButton() {
  const actions = ensureActionMenu();
  if (!actions) return;

  const examBtn = document.createElement('button');
  examBtn.id = 'exam-btn';
  examBtn.type = 'button';
  examBtn.textContent = t('exam.button');
  examBtn.title = t('exam.title');
  examBtn.addEventListener('click', () => {
    closeActionMenu();
    openExamModal();
  });
  actions.appendChild(examBtn);
}

const MOTIVATION_OPTIONS = { start: 'unknown', length: 'normal' };

function openMotivationModal() {
  const overlay = ensureSimpleModal('motivation', t('motivation.heading'), t('motivation.help'));
  const body = overlay.querySelector('.aist-modal-body');
  body.innerHTML = '';
  const o = MOTIVATION_OPTIONS;
  body.appendChild(resourceCard('motivation', {
    desc: t('motivation.desc'),
    fields: [
      resourceField(t('motivation.startLabel'), segmented(t('motivation.startLabel'),
        ['unknown', 'hard', 'bored', 'use'].map(v => ({ value: v, label: t('motivation.start.' + v) })),
        o.start, v => { o.start = v; })),
      resourceField(t('motivation.lengthLabel'), segmented(t('motivation.lengthLabel'),
        ['short', 'normal', 'long'].map(v => ({ value: v, label: t('motivation.length.' + v) })),
        o.length, v => { o.length = v; })),
    ],
    copy: copyButton(t('make.copy'),
      () => composePrompt('motivation', { motivation: o }),
      () => trackCopy('motivation')),
  }));
  overlay.classList.add('open');
}

function openExamModal(presetIds) {
  /* Utvalget starter som det som er krysset av som mestret, og kan
     endres i vinduet. Det lagres ikke. BARNESKOLEMATTE: kartleggingsprøven
     i skillelinja gir sitt eget utvalg (alt til og med trinnet). */
  const progress = getProgress();
  examSelection = new Set(presetIds || allNodes.filter(n => isNodeMastered(n, progress)).map(n => n.id));
  const overlay = ensureSimpleModal('exam', t('exam.heading'), t('exam.help'));
  renderExamBody(overlay.querySelector('.aist-modal-body'));
  overlay.classList.add('open');
}

let examSelection = new Set();

function renderExamBody(body) {
  body.innerHTML = '';
  const o = EXAM_OPTIONS;
  const selected = () => allNodes.filter(n => examSelection.has(n.id)).sort(compareByGoalIndex);

  /* «Prøven dekker:» og alle læringsmålene som små merker i treets farger,
     ett emne per rad. De mestrede er valgt fra start; trykk for å velge
     bort eller legge til (fra 2026-11-11). */
  const cover = makeEl('div', 'resource-summary exam-cover');
  cover.appendChild(makeEl('span', 'goal-tags-label', t('exam.coversLabel')));
  const rows = makeEl('div', 'goal-tag-rows');
  const empty = makeEl('span', 'goal-tags-empty', t('lesson.selectedNone'));
  /* Velg alle / velg bort alle, for hele prøven og for hvert emne, med de
     samme listeikonene som i Læringsmål. */
  const setAll = (nodes, on) => {
    nodes.forEach(n => { if (on) examSelection.add(n.id); else examSelection.delete(n.id); });
    renderExamBody(body);
  };
  const allRow = makeEl('div', 'goal-tag-row exam-bulk-row');
  allRow.appendChild(bulkIconButton(t('lessonPlanner.selectAll'), true, true, () => setAll(allNodes, true), 'goal-index-bulk-btn'));
  allRow.appendChild(bulkIconButton(t('lessonPlanner.deselectAll'), false, true, () => setAll(allNodes, false), 'goal-index-bulk-btn'));
  rows.appendChild(allRow);
  themeList.forEach(({ letter, topic, nodes }) => {
    const row = makeEl('div', 'goal-tag-row');
    row.appendChild(makeEl('span', 'goal-tag-letter', letter));
    nodes.forEach(n => row.appendChild(goalTag(n, examSelection.has(n.id), on => {
      if (on) examSelection.add(n.id); else examSelection.delete(n.id);
      sync();
    })));
    const acts = makeEl('span', 'goal-tag-row-actions');
    acts.appendChild(bulkIconButton(t('lessonPlanner.selectTopic', { topic }), true, false, () => setAll(nodes, true)));
    acts.appendChild(bulkIconButton(t('lessonPlanner.deselectTopic', { topic }), false, false, () => setAll(nodes, false)));
    row.appendChild(acts);
    rows.appendChild(row);
  });
  cover.appendChild(rows);
  cover.appendChild(empty);
  body.appendChild(cover);

  const diffHint = swapHint(['easy', 'medium', 'hard'].map(v => 'exam.difficultyHints.' + v), 'exam.difficultyHints.' + o.difficulty);
  const formatHint = swapHint(['closed', 'open', 'mixed'].map(v => 'exam.formatHints.' + v), 'exam.formatHints.' + o.format);
  const copy = copyButton(t('make.copy'),
    () => composeExamInstruction(selected(), o.count, o),
    () => trackCopy('exam', { node_count: examSelection.size, task_count: o.count }));
  function sync() {
    copy.disabled = examSelection.size === 0;
    // Synlighet, ikke display: linja holder plassen, så ingenting hopper.
    empty.style.visibility = examSelection.size === 0 ? '' : 'hidden';
  }
  sync();

  body.appendChild(resourceCard('exam', {
    desc: t('exam.desc'),
    fields: [
      resourceField(t('exam.difficultyLabel'), segmented(t('exam.difficultyLabel'),
        ['easy', 'medium', 'hard'].map(v => ({ value: v, label: t('exam.difficulty.' + v), glyph: 'level-' + v })),
        o.difficulty, v => { o.difficulty = v; diffHint.set('exam.difficultyHints.' + v); }),
        diffHint.el),
      resourceField(t('exam.countLabel'), chipStepper(t('exam.countLabel'), EXAM_COUNT_CHOICES, o.count, 1, 1, 50,
        v => String(v), v => { o.count = v; })),
      resourceField(t('exam.formatLabel'), segmented(t('exam.formatLabel'),
        ['closed', 'open', 'mixed'].map(v => ({ value: v, label: t('exam.format.' + v), glyph: 'format-' + v })),
        o.format, v => { o.format = v; formatHint.set('exam.formatHints.' + v); }),
        formatHint.el),
    ],
    copy: copy,
  }));
}


// Setter sammen en KI-instruks for å lage en prøve på tvers av alle noder
// eleven (eller læreren) har markert som mestret - ikke bare én enkelt node
// slik composeInstruction() gjør. Prøven trenger ikke dekke alle mestrede
// noder; instruksen ber KI-en velge et representativt utvalg på `count`
// oppgaver som til sammen dekker flest mulig av dem.
function composeExamInstruction(nodes, count, opts) {
  const list = nodes.map(n => {
    const tags = [promptTypeTag(n.type)];
    if (treeUsesAids() && n.aids.length) tags.push(aidsTagText(n.aids));
    tags.push(t('stage.label', { n: n.stage })); // BARNESKOLEMATTE
    return `- ${n.name} [${tags.join(', ')}]: ${descriptionInline(n.description)}`;
  }).join('\n');

  return composePrompt('exam', {
    exam: opts || null,
    hasConcepts: nodes.some(n => n.type === 'concept'),
    allConcepts: nodes.length > 0 && nodes.every(n => n.type === 'concept'),
    hasFacts: nodes.some(n => n.type === 'fact'),
    aidsText: aidsTextFor(nodes),
    multipleAids: nodes.some(n => (n.aids || []).length > 1),
    vars: {
      nodeCount: nodes.length,
      taskCount: count,
      nodeList: list,
      aidsText: aidsTextFor(nodes),
      // BARNESKOLEMATTE: øverste trinn prøven dekker, til prompt-radene i tree.csv.
      gradeLevel: t('stage.label', { n: maxStage(nodes) }),
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
  /* Utvalget vises som de små merkene i treets farger, ikke som et tall
     (fra 2026-11-11). Tomt utvalg står i rødt. */
  countLabel.innerHTML = '';
  countLabel.appendChild(goalTagList(getLessonSelectionNodes()));
  btn.disabled = lessonSelection.size === 0;
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
function composeLessonPlanInstruction(nodes, totalMinutes, lessonType) {
  const goalList = nodes.map((n, i) => {
    const tags = [promptTypeTag(n.type)];
    if (treeUsesAids() && n.aids.length) tags.push(aidsTagText(n.aids));
    tags.push(t('stage.label', { n: n.stage }));
    return `${i + 1}. ${n.name} [${tags.join(', ')}]\n   ${descriptionInline(n.description)}`;
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
    lessonType: LESSON_TYPES.indexOf(lessonType) !== -1 ? lessonType : LESSON_TYPES[0],
    ancestors: prerequisites,
    hasSkills: nodes.some(n => n.type !== 'concept' && n.type !== 'fact'),
    hasConcepts: nodes.some(n => n.type === 'concept'),
    hasFacts: nodes.some(n => n.type === 'fact'),
    aidsText: aidsTextFor(nodes),
    multipleAids: nodes.some(n => (n.aids || []).length > 1),
    vars: {
      totalMinutes: totalMinutes,
      goalList: goalList,
      prerequisiteList: prerequisites.sort(compareByGoalIndex).map(a => '- ' + a.name).join('\n'),
      aidsText: aidsTextFor(nodes),
      // BARNESKOLEMATTE: læreren underviser elevene på trinnet til det
      // høyeste av de valgte målene.
      gradeLevel: t('stage.label', { n: maxStage(nodes) }),
    },
  });
}

/* ------------------------------------------------------------------ */
/* Ressursvelgeren: undervisningsopplegg, minitre og simulering          */
/*                                                                      */
/* UTKAST 2026-11-10, ikke i noen release. Læreren huker av læringsmål  */
/* i «Undervisningsopplegg og andre ressurser», trykker «Lag ressurs»,  */
/* og velger hva som skal lages. Alle tre er en instruks læreren limer  */
/* inn i en KI-chat; motoren kaller fortsatt ingen språkmodell, og den  */
/* lager ingen HTML selv. Det er grensen som holder dette lite: treet   */
/* bidrar med læringsmålene og forutsetningene mellom dem, modellen     */
/* lager fila. Minitreet bygger på Nina Haugeruds prinsipper,           */
/* simuleringen på Henning Vinjusveen Myhrehagens ledetekst på          */
/* skolesim.no. Valgene lagres ikke, som utvalget av læringsmål.         */
/* ------------------------------------------------------------------ */

const RESOURCE_OPTIONS = {
  lessonType: 'intro',
  minutes: LESSON_DEFAULT_MINUTES,
  mini: { levels: 3, streak: 3, easyRead: true, readAloud: true, game: true, mixedTest: true },
  sim: { workflow: 'design', screen: 'laptop', tasks: true, critique: true, export: false },
};

const LESSON_MINUTE_CHOICES = [30, 45, 60, 90];

/* Forutsetningene innenfor UTVALGET for én node: de valgte forfedrene,
   uten dem som allerede ligger under en annen valgt forfar. Det er
   kantene minitreet skal tegne - hele kjeden ville gitt piler på kryss
   og tvers for det samme. */
function selectedPrerequisites(node, selectedIds) {
  const anc = getAllAncestors(node).filter(a => selectedIds.has(a.id));
  const ancIds = new Set(anc.map(a => a.id));
  const covered = new Set();
  anc.forEach(a => getAllAncestors(a).forEach(x => { if (ancIds.has(x.id)) covered.add(x.id); }));
  return anc.filter(a => !covered.has(a.id)).sort(compareByGoalIndex);
}

/* Forutsetninger UTENFOR utvalget, som i composeLessonPlanInstruction:
   det elevene antas å kunne fra før. */
function outsidePrerequisites(nodes) {
  const selectedIds = new Set(nodes.map(n => n.id));
  const out = [];
  const seen = new Set();
  nodes.forEach(node => getAllAncestors(node).forEach(a => {
    if (selectedIds.has(a.id) || seen.has(a.id)) return;
    seen.add(a.id);
    out.push(a);
  }));
  return out.sort(compareByGoalIndex);
}

/* Læringsmål-lista i instruksen. Med koden fra treet (A1, B3 ...) fordi
   minitreet skal vise den, og læreren skal kunne finne målet igjen. */
function resourceGoalList(nodes, withBuildsOn) {
  const selectedIds = new Set(nodes.map(n => n.id));
  return nodes.map(n => {
    const tags = [promptTypeTag(n.type)];
    if (treeUsesAids() && n.aids.length) tags.push(aidsTagText(n.aids));
    tags.push(t('stage.label', { n: n.stage })); // BARNESKOLEMATTE
    let line = `${n.goalIndex}) ${n.name} [${tags.join(', ')}]\n   ${descriptionInline(n.description)}`;
    if (withBuildsOn) {
      const deps = selectedPrerequisites(n, selectedIds);
      line += '\n   builds on: ' + (deps.length ? deps.map(d => d.goalIndex).join(', ') : '-');
    }
    return line;
  }).join('\n');
}

function resourceContext(nodes, extra) {
  const pre = outsidePrerequisites(nodes);
  return Object.assign({
    ancestors: pre,
    hasSkills: nodes.some(n => n.type !== 'concept' && n.type !== 'fact'),
    hasConcepts: nodes.some(n => n.type === 'concept'),
    hasFacts: nodes.some(n => n.type === 'fact'),
    aidsText: aidsTextFor(nodes),
    multipleAids: nodes.some(n => (n.aids || []).length > 1),
  }, extra, {
    vars: Object.assign({
      prerequisiteList: pre.map(a => '- ' + a.name).join('\n'),
      aidsText: aidsTextFor(nodes),
      // BARNESKOLEMATTE: til prompt-rader for minitre og simulering.
      gradeLevel: t('stage.label', { n: maxStage(nodes) }),
    }, (extra && extra.vars) || {}),
  });
}

function composeMiniTreeInstruction(nodes, opts) {
  return composePrompt('miniTree', resourceContext(nodes, {
    mini: opts,
    vars: { goalList: resourceGoalList(nodes, true), masteryStreak: opts.streak },
  }));
}

function composeSimulationInstruction(nodes, opts) {
  return composePrompt('simulation', resourceContext(nodes, {
    sim: opts,
    vars: { goalList: resourceGoalList(nodes, false) },
  }));
}

function openResourcePicker() {
  const nodes = getLessonSelectionNodes();
  if (!nodes.length) return;
  document.getElementById('goal-index-body').hidden = true;
  document.getElementById('lesson-plan-bar').hidden = true;
  document.getElementById('goal-index-heading').textContent = t('make.heading');
  // «Kopier alle» kopierer lista over læringsmål, og hører ikke hjemme her.
  document.getElementById('goal-index-copy').hidden = true;
  setGoalIndexHelp('make.help');
  const picker = document.getElementById('resource-picker');
  renderResourcePicker(picker, nodes);
  picker.hidden = false;
  picker.scrollTop = 0;
}

function closeResourcePicker() {
  document.getElementById('resource-picker').hidden = true;
  document.getElementById('goal-index-body').hidden = false;
  document.getElementById('lesson-plan-bar').hidden = false;
  document.getElementById('goal-index-copy').hidden = false;
  setGoalIndexHelp('lessonPlanner.intro');
  document.getElementById('goal-index-heading').textContent = t('lessonPlanner.heading');
}

function setGoalIndexHelp(key) {
  const help = document.getElementById('goal-index-help');
  const btn = document.getElementById('goal-index-help-btn');
  if (!help) return;
  help.textContent = t(key);
  help.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/* ---- Små byggeklosser for valgene på kortene ---------------------- */

function makeEl(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

/* Et felt med etikett over. */
function resourceField(label, control, hint) {
  const field = makeEl('div', 'resource-field');
  field.appendChild(makeEl('span', 'resource-field-label', label));
  field.appendChild(control);
  if (hint) field.appendChild(hint);
  return field;
}

/* Segmentert valg: knapper side om side, én trykket inn. Framfor en
   nedtrekksmeny fordi alle valgene da synes på en gang. */
function segmented(label, options, current, onChange) {
  const group = makeEl('div', 'seg');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  const buttons = options.map(opt => {
    const b = makeEl('button', 'seg-btn');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    if (opt.glyph) b.appendChild(segGlyph(opt.glyph));
    b.appendChild(makeEl('span', null, opt.label));
    b.addEventListener('click', () => {
      buttons.forEach(x => x.setAttribute('aria-checked', String(x === b)));
      onChange(opt.value);
    });
    b.setAttribute('aria-checked', String(opt.value === current));
    group.appendChild(b);
    return b;
  });
  return group;
}

/* Bryter med tekst. En ekte avkryssingsboks under, så den virker med
   tastatur og skjermleser. */
function switchToggle(label, checked, onChange) {
  const wrap = makeEl('label', 'switch');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.appendChild(input);
  wrap.appendChild(makeEl('span', 'switch-track'));
  wrap.appendChild(makeEl('span', 'switch-label', label));
  return wrap;
}

/* De vanlige verdiene som knapper, og en teller for alt annet. Brukes for
   lengden på timen og antall oppgaver i prøven. */
function chipStepper(label, choices, current, step, min, max, format, onChange) {
  const wrap = makeEl('div', 'minutes-control');
  let value = current;
  const chips = segmented(label, choices.map(m => ({ value: m, label: String(m) })), value, v => set(v));
  wrap.appendChild(chips);

  const stepper = makeEl('div', 'stepper');
  const minus = makeEl('button', 'stepper-btn', '−');
  minus.type = 'button';
  minus.setAttribute('aria-label', t('make.less'));
  const out = makeEl('output', 'stepper-value');
  const plus = makeEl('button', 'stepper-btn', '+');
  plus.type = 'button';
  plus.setAttribute('aria-label', t('make.more'));
  stepper.appendChild(minus);
  stepper.appendChild(out);
  stepper.appendChild(plus);
  wrap.appendChild(stepper);

  function set(v) {
    value = Math.min(max, Math.max(min, v));
    out.textContent = format(value);
    chips.querySelectorAll('.seg-btn').forEach((b, i) =>
      b.setAttribute('aria-checked', String(choices[i] === value)));
    onChange(value);
  }
  minus.addEventListener('click', () => set(value - step));
  plus.addEventListener('click', () => set(value + step));
  set(value);
  return wrap;
}

function minutesControl(current, onChange) {
  return chipStepper(t('lesson.minutesLabel'), LESSON_MINUTE_CHOICES, current, 5, 15, 240,
    v => v + ' ' + t('make.lesson.minutes'), onChange);
}

/* «?»-knappen: forklaringen ligger bak den framfor å stå øverst i
   vinduet. Vinduet skal kunne brukes uten at noen trykker på den
   (Vidar, 2026-11-11). Forklaringen er en liten boble som legger seg OVER
   innholdet, rett under knappen, og ikke et avsnitt som skyver resten av
   vinduet ned: ingenting skal hoppe når man trykker (fra 2026-11-11).
   Boblen lukkes av et nytt trykk på «?», et trykk utenfor eller Esc. */
let openHelpPopover = null;
function closeHelpPopover() {
  if (!openHelpPopover) return;
  openHelpPopover.panel.hidden = true;
  openHelpPopover.button.setAttribute('aria-expanded', 'false');
  openHelpPopover = null;
}
function helpToggle(panel) {
  const b = makeEl('button', 'help-toggle', '?');
  b.type = 'button';
  b.setAttribute('aria-label', t('helpToggle'));
  b.title = t('helpToggle');
  b.setAttribute('aria-expanded', 'false');
  panel.classList.add('aist-popover');
  panel.setAttribute('role', 'note');
  b.addEventListener('click', e => {
    e.stopPropagation();
    if (!panel.hidden) { closeHelpPopover(); return; }
    closeHelpPopover();
    panel.hidden = false;
    b.setAttribute('aria-expanded', 'true');
    openHelpPopover = { panel, button: b };
    const host = panel.offsetParent || panel.parentElement;
    const hr = host.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    panel.style.top = (br.bottom - hr.top + 8) + 'px';
    const right = Math.max(8, hr.right - br.right);
    panel.style.right = right + 'px';
    panel.style.setProperty('--arrow-right', (br.width / 2 - 7) + 'px');
  });
  return b;
}
/* Trykk utenfor boblen lukker den. Et trykk på selve «?»-knappen hoppes
   over her: knappen slår av og på selv, og lukket denne lytteren boblen
   først, åpnet knappen den igjen med en gang (feil til 2026-11-11). */
document.addEventListener('click', e => {
  if (!openHelpPopover) return;
  if (openHelpPopover.panel.contains(e.target) || openHelpPopover.button.contains(e.target)) return;
  closeHelpPopover();
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && openHelpPopover) { closeHelpPopover(); e.stopImmediatePropagation(); }
}, true);

/* Knapper som bytter tekst («Kopier» → «Kopiert!», «Vis» → «Skjul») skal
   ikke endre bredde, ellers flytter naboene seg (fra 2026-11-11). Alle
   variantene ligger oppå hverandre i samme rutenettcelle, og bare én er
   synlig, så knappen er alltid så bred som den lengste. */
function swapLabel(btn, labels) {
  btn.classList.add('swap-label');
  btn.textContent = '';
  const spans = labels.map(l => { const sp = makeEl('span', null, l); btn.appendChild(sp); return sp; });
  const set = i => spans.forEach((sp, j) => {
    sp.style.visibility = j === i ? '' : 'hidden';
    if (j === i) sp.removeAttribute('aria-hidden'); else sp.setAttribute('aria-hidden', 'true');
  });
  set(0);
  return set;
}

/* Det samme for forklaringen under et valg: alle variantene ligger i samme
   celle, så linja er alltid like høy som den lengste, og feltene under
   flytter seg ikke når et annet valg trykkes. */
function swapHint(keys, current) {
  const el = makeEl('p', 'resource-hint swap-hint');
  const spans = new Map(keys.map(k => { const sp = makeEl('span', null, t(k)); el.appendChild(sp); return [k, sp]; }));
  const set = key => spans.forEach((sp, k) => {
    sp.style.visibility = k === key ? '' : 'hidden';
    if (k === key) sp.removeAttribute('aria-hidden'); else sp.setAttribute('aria-hidden', 'true');
  });
  set(current);
  return { el, set };
}

/* Et enkelt vindu med overskrift, «?» og lukkeknapp, og en kropp som
   den som åpner det fyller. Bygges lat, én gang per id. */
function ensureSimpleModal(id, heading, helpText) {
  let overlay = document.getElementById(id + '-overlay');
  if (overlay) {
    closeHelpPopover();
    return overlay;
  }
  overlay = makeEl('div', 'aist-overlay');
  overlay.id = id + '-overlay';
  const close = () => overlay.classList.remove('open');
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
  });

  const modal = makeEl('div', 'aist-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', heading);
  const header = makeEl('div', 'aist-modal-header');
  header.appendChild(makeEl('h2', null, heading));
  const help = makeEl('p', 'aist-help', helpText);
  help.hidden = true;
  const actions = makeEl('div', 'aist-modal-actions');
  actions.appendChild(helpToggle(help));
  const closeBtn = makeEl('button', 'nav-btn', t('close'));
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', close);
  actions.appendChild(closeBtn);
  header.appendChild(actions);
  modal.appendChild(header);
  modal.appendChild(help);
  modal.appendChild(makeEl('div', 'aist-modal-body'));
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return overlay;
}

/* Kopier-knappen nederst på hvert kort. */
function copyButton(label, compose, track) {
  const b = makeEl('button', 'resource-copy');
  b.type = 'button';
  const show = swapLabel(b, [label, t('copied')]);
  b.addEventListener('click', () => {
    const text = compose();
    track();
    navigator.clipboard.writeText(text).then(() => {
      show(1);
      b.classList.add('done');
      setTimeout(() => { show(0); b.classList.remove('done'); }, 1600);
    }).catch(() => {
      window.prompt(t('copyFallback'), text);
    });
  });
  return b;
}

function resourceCard(kind, opts) {
  const card = makeEl('section', 'resource-card resource-' + kind);
  const art = makeEl('div', 'resource-art');
  art.appendChild(resourceArt(kind));
  card.appendChild(art);

  const main = makeEl('div', 'resource-main');
  /* Uten tittel når vinduet selv har den (prøven), så den ikke står to ganger. */
  if (opts.title) {
    const h3 = makeEl('h3', 'resource-title', opts.title);
    if (opts.badge) h3.appendChild(makeEl('span', 'resource-badge', opts.badge));
    main.appendChild(h3);
  }
  main.appendChild(makeEl('p', 'resource-desc', opts.desc));
  const fields = makeEl('div', 'resource-options');
  opts.fields.forEach(f => fields.appendChild(f));
  main.appendChild(fields);

  const foot = makeEl('div', 'resource-foot');
  foot.appendChild(opts.copy);
  if (opts.after) foot.appendChild(makeEl('span', 'resource-after', opts.after));
  main.appendChild(foot);
  if (opts.credit) main.appendChild(makeEl('p', 'resource-credit', opts.credit));
  card.appendChild(main);
  return card;
}

function renderResourcePicker(picker, nodes) {
  picker.innerHTML = '';
  const o = RESOURCE_OPTIONS;

  const top = makeEl('div', 'resource-top');
  const back = makeEl('button', 'back-btn', t('make.back'));
  back.type = 'button';
  back.addEventListener('click', closeResourcePicker);
  top.appendChild(back);
  const summary = makeEl('div', 'resource-summary');
  summary.appendChild(goalTagList(nodes, t('make.forLabel')));
  top.appendChild(summary);
  picker.appendChild(top);

  const list = makeEl('div', 'resource-list');

  /* 1. Undervisningsopplegg: planleggeren som før, med valgene synlige. */
  const typeHint = swapHint(LESSON_TYPES.map(v => 'make.lesson.typeHints.' + v), 'make.lesson.typeHints.' + o.lessonType);
  list.appendChild(resourceCard('lesson', {
    title: t('make.lesson.title'),
    desc: t('make.lesson.desc'),
    fields: [
      resourceField(t('lesson.typeLabel'), segmented(t('lesson.typeAria'),
        LESSON_TYPES.map(type => ({ value: type, label: t('lesson.types.' + type), glyph: type })),
        o.lessonType, v => { o.lessonType = v; typeHint.set('make.lesson.typeHints.' + v); }),
        typeHint.el),
      resourceField(t('lesson.minutesLabel'), minutesControl(o.minutes, v => { o.minutes = v; })),
    ],
    copy: copyButton(t('make.copy'),
      () => composeLessonPlanInstruction(getLessonSelectionNodes(), o.minutes, o.lessonType),
      () => trackCopy('lesson_plan', { node_count: nodes.length, lesson_minutes: o.minutes })),
  }));

  /* 2. Minitre: en HTML-fil der elevene øver selv, etter Ninas prinsipper. */
  if (CORE.prompts.miniTree) {
    const m = o.mini;
    list.appendChild(resourceCard('minitree', {
      title: t('make.miniTree.title'),
      badge: t('make.htmlBadge'),
      desc: t('make.miniTree.desc'),
      fields: [
        resourceField(t('make.miniTree.levelsLabel'), segmented(t('make.miniTree.levelsLabel'), [
          { value: 1, label: t('make.miniTree.levels1') },
          { value: 3, label: t('make.miniTree.levels3') },
        ], m.levels, v => { m.levels = v; })),
        resourceField(t('make.miniTree.streakLabel'), segmented(t('make.miniTree.streakLabel'),
          [2, 3, 4, 5].map(n => ({ value: n, label: String(n) })), m.streak, v => { m.streak = v; })),
        resourceField(t('make.miniTree.supportLabel'), (() => {
          const box = makeEl('div', 'switches');
          box.appendChild(switchToggle(t('make.miniTree.easyRead'), m.easyRead, v => { m.easyRead = v; }));
          box.appendChild(switchToggle(t('make.miniTree.readAloud'), m.readAloud, v => { m.readAloud = v; }));
          box.appendChild(switchToggle(t('make.miniTree.game'), m.game, v => { m.game = v; }));
          box.appendChild(switchToggle(t('make.miniTree.mixedTest'), m.mixedTest, v => { m.mixedTest = v; }));
          return box;
        })()),
      ],
      copy: copyButton(t('make.copy'),
        () => composeMiniTreeInstruction(getLessonSelectionNodes(), m),
        () => trackCopy('mini_tree', { node_count: nodes.length })),
      credit: t('make.miniTree.credit'),
    }));
  }

  /* 3. Simulering, etter Hennings ledetekst. */
  if (CORE.prompts.simulation) {
    const s = o.sim;
    list.appendChild(resourceCard('simulation', {
      title: t('make.simulation.title'),
      badge: t('make.htmlBadge'),
      desc: t('make.simulation.desc'),
      fields: [
        resourceField(t('make.simulation.workflowLabel'), segmented(t('make.simulation.workflowLabel'), [
          { value: 'design', label: t('make.simulation.design') },
          { value: 'build', label: t('make.simulation.build') },
        ], s.workflow, v => { s.workflow = v; })),
        resourceField(t('make.simulation.screenLabel'), segmented(t('make.simulation.screenLabel'), [
          { value: 'laptop', label: t('make.simulation.laptop'), glyph: 'laptop' },
          { value: 'tablet', label: t('make.simulation.tablet'), glyph: 'tablet' },
          { value: 'projector', label: t('make.simulation.projector'), glyph: 'projector' },
        ], s.screen, v => { s.screen = v; })),
        resourceField(t('make.simulation.extrasLabel'), (() => {
          const box = makeEl('div', 'switches');
          box.appendChild(switchToggle(t('make.simulation.tasks'), s.tasks, v => { s.tasks = v; }));
          box.appendChild(switchToggle(t('make.simulation.critique'), s.critique, v => { s.critique = v; }));
          box.appendChild(switchToggle(t('make.simulation.export'), s.export, v => { s.export = v; }));
          return box;
        })()),
      ],
      copy: copyButton(t('make.copy'),
        () => composeSimulationInstruction(getLessonSelectionNodes(), s),
        () => trackCopy('simulation', { node_count: nodes.length })),
      credit: t('make.simulation.credit'),
    }));
  }

  picker.appendChild(list);
}

/* ---- Illustrasjonene ---------------------------------------------- */

/* Små ikoner i de segmenterte knappene. Strek i currentColor, så de tar
   fargen fra teksten i knappen, trykket inn eller ikke. */
const SEG_GLYPHS = {
  intro: '<circle cx="8" cy="7" r="4"/><path d="M6.5 13h3M7 15h2"/>',
  practice: '<path d="M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3"/><path d="M12 2v3H9M4 14v-3h3"/>',
  review: '<path d="M3 8a5 5 0 1 0 1.5-3.5"/><path d="M3 2v3h3"/><path d="M8 5v3l2 1.5"/>',
  other: '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>',
  laptop: '<rect x="3" y="3.5" width="10" height="7" rx="0.5"/><path d="M1.5 12.5h13"/>',
  tablet: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M7.5 11h1"/>',
  projector: '<rect x="1.5" y="2.5" width="13" height="8"/><path d="M8 10.5v3M5.5 13.5h5"/>',
  /* Tre søyler som på et signalmerke: én, to eller alle tre fylt. */
  'level-easy': '<path d="M3.5 13.5v-3" stroke-width="2.4"/><path d="M8 13.5v-6M12.5 13.5v-9" stroke-opacity="0.3" stroke-width="2.4"/>',
  'level-medium': '<path d="M3.5 13.5v-3M8 13.5v-6" stroke-width="2.4"/><path d="M12.5 13.5v-9" stroke-opacity="0.3" stroke-width="2.4"/>',
  'level-hard': '<path d="M3.5 13.5v-3M8 13.5v-6M12.5 13.5v-9" stroke-width="2.4"/>',
  'format-closed': '<circle cx="4" cy="5" r="1.6"/><circle cx="4" cy="11" r="1.6"/><path d="M8 5h6M8 11h6"/>',
  'format-open': '<path d="M2 4h12M2 8h12M2 12h8"/>',
  'format-mixed': '<circle cx="4" cy="5" r="1.6"/><path d="M8 5h6M2 10h12M2 13.5h8"/>',
};

function segGlyph(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'seg-glyph');
  svg.innerHTML = SEG_GLYPHS[name] || '';
  return svg;
}

/* Lavpoly i nettstedets tre farger: grønn (--primary), oransje (--amber)
   og blå (--blue), samme stil som de genererte bildene på læremedki.no og
   skolesim.no, men tegnet her som SVG: et tre skal virke uten nett, og et
   bilde ville måttet ligge i den nedlastede fila. Fargene er CSS-variabler,
   så illustrasjonene følger dag/natt og treets egne farger. Hver flate er
   samme farge med ulik dekkevne - det er det som gir det fasetterte. */
const ART_HUE = { lesson: '--primary', minitree: '--amber', simulation: '--blue', exam: '--primary', motivation: '--primary' };

/* Deterministisk «tilfeldig», så bildet er likt hver gang. */
function artRandom(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function poly(points, hue, opacity) {
  return `<polygon points="${points}" style="fill:var(${hue})" fill-opacity="${opacity}"/>`;
}

/* Bakgrunnen: et rutenett av trekanter med forskjøvne hjørner. */
function lowPolyBackground(hue, seed) {
  const rnd = artRandom(seed);
  const n = 4, step = 96 / n;
  const pts = [];
  for (let y = 0; y <= n; y++) {
    pts.push([]);
    for (let x = 0; x <= n; x++) {
      const edge = x === 0 || y === 0 || x === n || y === n;
      pts[y].push([
        x * step + (edge ? 0 : (rnd() - 0.5) * step * 0.7),
        y * step + (edge ? 0 : (rnd() - 0.5) * step * 0.7),
      ]);
    }
  }
  const p = q => q[0].toFixed(1) + ',' + q[1].toFixed(1);
  let out = `<rect width="96" height="96" style="fill:var(--surface)"/>`;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = pts[y][x], b = pts[y][x + 1], c = pts[y + 1][x + 1], d = pts[y + 1][x];
      const flip = (x + y) % 2 === 0;
      const t1 = flip ? [a, b, c] : [a, b, d];
      const t2 = flip ? [a, c, d] : [b, c, d];
      out += poly(t1.map(p).join(' '), hue, (0.07 + rnd() * 0.12).toFixed(2));
      out += poly(t2.map(p).join(' '), hue, (0.07 + rnd() * 0.12).toFixed(2));
    }
  }
  return out;
}

/* En fasettert rombe: fire trekanter rundt midten. */
function facetDiamond(cx, cy, r, hue) {
  const top = `${cx},${cy - r}`, right = `${cx + r},${cy}`, bottom = `${cx},${cy + r}`, left = `${cx - r},${cy}`;
  const c = `${cx},${cy}`;
  return poly(`${top} ${right} ${c}`, hue, 1) + poly(`${right} ${bottom} ${c}`, hue, 0.78) +
         poly(`${bottom} ${left} ${c}`, hue, 0.62) + poly(`${left} ${top} ${c}`, hue, 0.88);
}

/* En fasettert ball: åtte trekanter rundt midten. */
function facetBall(cx, cy, r, hue) {
  let out = '';
  const ops = [1, 0.85, 0.7, 0.6, 0.66, 0.78, 0.9, 0.95];
  for (let i = 0; i < 8; i++) {
    const a1 = (i / 8) * Math.PI * 2 - Math.PI / 2, a2 = ((i + 1) / 8) * Math.PI * 2 - Math.PI / 2;
    out += poly(`${cx},${cy} ${(cx + r * Math.cos(a1)).toFixed(1)},${(cy + r * Math.sin(a1)).toFixed(1)} ` +
                `${(cx + r * Math.cos(a2)).toFixed(1)},${(cy + r * Math.sin(a2)).toFixed(1)}`, hue, ops[i]);
  }
  return out;
}

const ART_FOREGROUND = {
  /* En tavle på staffeli, med en krittstrek. */
  lesson: hue =>
    poly('30,60 36,60 25,84', hue, 0.9) + poly('66,60 60,60 71,84', hue, 0.75) +
    poly('18,20 78,20 48,40', hue, 1) + poly('78,20 78,62 48,40', hue, 0.82) +
    poly('78,62 18,62 48,40', hue, 0.68) + poly('18,62 18,20 48,40', hue, 0.9) +
    '<polyline points="26,34 36,29 45,35 55,27 66,33" fill="none" style="stroke:var(--surface)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.95"/>' +
    '<path d="M28 48h22" style="stroke:var(--surface)" stroke-width="2.4" stroke-linecap="round" stroke-opacity="0.8"/>' +
    poly('56,62 72,62 64,67', '--amber', 1),
  /* Et lite tre: fire noder med kanter, den nederste mestret (grønn). */
  minitree: hue =>
    '<g style="stroke:var(' + hue + ')" stroke-width="3" stroke-opacity="0.75" stroke-linecap="round">' +
      '<path d="M48 76 L24 49 M48 76 L72 49 M24 49 L48 20 M72 49 L48 20"/></g>' +
    facetDiamond(48, 20, 14, hue) + facetDiamond(24, 49, 14, hue) + facetDiamond(72, 49, 14, hue) +
    facetDiamond(48, 76, 15, '--primary') +
    '<path d="M42 76l4.5 4.5 8-9" fill="none" style="stroke:var(--surface)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  /* Et prøveark med to avkryssede oppgaver og én som venter. */
  exam: hue =>
    poly('24,14 66,14 48,40', hue, 1) + poly('66,14 74,22 48,40', hue, 0.85) +
    poly('74,22 74,84 48,40', hue, 0.72) + poly('74,84 24,84 48,40', hue, 0.62) +
    poly('24,84 24,14 48,40', hue, 0.9) +
    '<g fill="none" style="stroke:var(--surface)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.95">' +
      '<path d="M31 32l4 4 7-8M31 52l4 4 7-8M48 32h18M48 52h18M48 70h18"/>' +
      '<rect x="31" y="65" width="9" height="9" rx="1"/></g>' +
    poly('70,62 84,48 88,52 74,66', '--amber', 1) + poly('70,62 74,66 67,69', '--amber', 0.7),
  /* En fasettert stjerne med en liten oransje gnist. */
  motivation: hue => {
    let out = '';
    const cx = 46, cy = 50, R = 30, r = 13;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
      pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
    const ops = [1, 0.8, 0.92, 0.7, 0.85, 0.62, 0.78, 0.68, 0.95, 0.74];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % 10];
      out += poly(`${cx},${cy} ${p[0].toFixed(1)},${p[1].toFixed(1)} ${q[0].toFixed(1)},${q[1].toFixed(1)}`, hue, ops[i]);
    });
    return out + poly('76,16 80,26 90,28 80,31 76,41 72,31 62,28 72,26', '--amber', 0.95);
  },
  /* En pendel som svinger, med buen den følger. */
  simulation: hue =>
    poly('22,14 74,14 48,22', hue, 0.95) +
    '<path d="M48 20 L64 62" style="stroke:var(' + hue + ')" stroke-width="2.2" stroke-opacity="0.85"/>' +
    '<path d="M28 66 Q48 82 68 66" fill="none" style="stroke:var(' + hue + ')" stroke-width="2" stroke-dasharray="3 4" stroke-opacity="0.7"/>' +
    '<path d="M48 20 L36 60" style="stroke:var(' + hue + ')" stroke-width="1.6" stroke-opacity="0.3"/>' +
    facetBall(36, 62, 8, hue).replace(/fill-opacity="([\d.]+)"/g, (m, v) => `fill-opacity="${(v * 0.3).toFixed(2)}"`) +
    facetBall(64, 64, 11, hue) +
    poly('0,96 30,84 52,92', '--primary', 0.55) + poly('52,92 78,82 96,96', '--amber', 0.6) +
    poly('30,84 52,92 0,96', '--primary', 0.35),
};

function resourceArt(kind) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('aria-hidden', 'true');
  const hue = ART_HUE[kind] || '--primary';
  const seed = { lesson: 7, minitree: 19, simulation: 31, exam: 43, motivation: 53 }[kind] || 3;
  svg.innerHTML = lowPolyBackground(hue, seed) + (ART_FOREGROUND[kind] ? ART_FOREGROUND[kind](hue) : '');
  return svg;
}

// Zoomer ut (aldri inn utover 100%) og flytter visningen slik at hele
// grafen - alle emne-kolonner - får plass i det synlige området.
/* «Vis hele treet» er en av/på-knapp (fra 2026-11-11, etter et ønske fra
   Olav Elnan): første trykk husker zoom og posisjon og viser hele treet,
   neste trykk tar deg tilbake dit du var. Pilene peker utover når knappen
   viser hele treet, og innover når den tar deg tilbake. Zoomer du selv i
   mellomtiden, glemmes den gamle visningen, for da har du valgt en ny.
   Å dra i kartet glemmer den ikke. Tasten 0 gjør det samme som knappen. */
let savedView = null;
const FIT_ICONS = {
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5"/></svg>',
  shrink: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10h-6V4M14 10l6.5-6.5M4 14h6v6M10 14l-6.5 6.5"/></svg>',
};
function updateFitButton(btn) {
  btn = btn || document.getElementById('fit-view-btn');
  if (!btn) return;
  const back = !!savedView;
  btn.innerHTML = back ? FIT_ICONS.shrink : FIT_ICONS.expand;
  btn.setAttribute('aria-pressed', String(back));
  btn.setAttribute('aria-label', back ? t('restoreView') : t('fitToView'));
  btn.title = back ? t('restoreView') : t('fitToViewTitle');
}
function forgetSavedView() {
  if (!savedView) return;
  savedView = null;
  updateFitButton();
}
function toggleFitView() {
  const scrollEl = document.getElementById('graph-scroll');
  if (savedView) {
    const v = savedView;
    savedView = null;
    setZoom(v.zoom);
    scrollEl.scrollLeft = v.left;
    scrollEl.scrollTop = v.top;
  } else {
    savedView = { zoom: zoomLevel, left: scrollEl.scrollLeft, top: scrollEl.scrollTop };
    fitToView();
  }
  updateFitButton();
}

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
  scrollEl.addEventListener('scroll', updateStickyHeaders, { passive: true }); // BARNESKOLEMATTE
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
  setupSearchButton();
  setupResourcesButton();
  setupExamButton();
  if (SHOW_MOTIVATION_BUTTON) setupMotivationButton();
  setupPrintButton();
  /* BARNESKOLEMATTE: ingen «rediger eller last ned». Trinnbåndene finnes
     bare i denne klonen, så verken redigeringsverktøyet eller
     enkeltfil-utgaven (som bygger på den delte motoren) kan vise treet. */
  organizeActionMenu();
  setupShortcuts();
  try {
    /* Nodene er allerede lest av bootstrap() - tree.csv er ÉN fil, og den
       måtte leses først for å finne treets språk. Ressursene står i den
       samme fila, som resource-rader (fra 0.34.0; før det i resources.csv). */
    buildNodeIndex(NODE_ROWS);
    buildResourceIndex(RESOURCE_ROWS);
    validateReferences();
    validateDag();
    validateStages();

    renderErrorBanner();
    computeLevels();
    deriveTopicOrder();
    publishEffectiveConfig();
    layoutAndRender();
    updateProgressUI();
    /* BARNESKOLEMATTE: får ikke hele oversikten plass, zoomes den ut så
       den gjør det, men ikke lenger enn at rutene fortsatt er lesbare. */
    requestAnimationFrame(() => {
      const scrollEl = document.getElementById('graph-scroll');
      const c = document.getElementById('graph-container');
      const w = parseInt(c.style.width, 10), h = parseInt(c.style.height, 10);
      // 56 px nederst holder skillelinja for 7. trinn klar av zoomknappene.
      const fit = Math.min(scrollEl.clientWidth / w, (scrollEl.clientHeight - 56) / h);
      if (fit < 1 && fit >= 0.6) { setZoom(fit * 0.98); scrollEl.scrollLeft = 0; scrollEl.scrollTop = 0; }
    });
    /* Kortene måles når de tegnes (se renderGraph). Kommer skrifta etter,
       blir målene feil, så da tegnes treet én gang til. */
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(() => { layoutOptimizedX = null; refreshAfterProgressChange(); });
    }
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

/* Den første raden må navngi kolonnene. Et regneark lagret med semikolon
   som skilletegn, eller uten overskriftsrad, leses ellers uten en eneste
   feil fra PapaParse: hver rad blir bare til felt med feil navn, og treet
   står tomt uten forklaring. Forfatterinstruksen lover læreren akkurat
   denne meldingen. */
function parseCsv(text, file, required) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (result.errors && result.errors.length) {
    result.errors.forEach(e => pushError('errorCsv', { message: e.message, row: e.row }));
  }
  const fields = (result.meta && result.meta.fields) || [];
  const missing = (required || []).filter(c => fields.indexOf(c) === -1);
  if (missing.length) {
    pushError('errorCsvHeader', { file: file, missing: missing.join(', '), found: fields.join(', ') });
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
      // BARNESKOLEMATTE: trinnet (1–7) noden hører til. Styrer båndet den
      // tegnes i; se computeLevels og validateStages.
      stage: parseInt(String(row.stage || '').trim(), 10),
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

/* Ressursene: resource-rader i tree.csv. Med vilje løst: gruppa og
   tittelen er fritekst, så en eksamensoppgave, et kapittel i en lærebok og
   en video får plass uten egne kolonner. Én rad kan høre til flere noder
   (depends_on er en liste), så den samme lenken står ett sted i fila selv
   om den vises under flere noder. Fram til 0.34.0 lå de i resources.csv
   med én rad per node og ressurs; fram til 0.22.0 het den fila exams.csv. */
function buildResourceIndex(rows) {
  allResources = [];
  resourcesByNode = new Map();
  rows.forEach(row => {
    if (!(row.label || row.url)) {
      pushError('errorResourceEmpty', { row: row.row });
      return;
    }
    const url = safeLinkUrl(row.url);
    if (row.url && !url) pushError('errorResourceUrl', { row: row.row, label: row.label || row.url });
    const res = { group: row.group, label: row.label || row.url, url: url, nodes: row.nodes, row: row.row };
    allResources.push(res);
    row.nodes.forEach(nodeId => {
      if (!resourcesByNode.has(nodeId)) resourcesByNode.set(nodeId, []);
      resourcesByNode.get(nodeId).push(res);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Validering                                                           */
/* ------------------------------------------------------------------ */

function validateReferences() {
  /* Lenkene i innstillingene. De vises som ren tekst når de ikke slipper
     gjennom safeLinkUrl(), men det skal ikke skje i stillhet. */
  const links = [['authorUrl', CONFIG.authorUrl]];
  (CONFIG.basedOn || []).forEach(entry => links.push(['basedOn.' + entry.n + '.url', entry.url]));
  links.forEach(([key, value]) => {
    if (value && !safeLinkUrl(value)) {
      pushError('errorLinkUrl', { key: key, value: value, row: CONFIG_ROW_AT[key] || '?' });
    }
  });

  allNodes.forEach(node => {
    /* En ukjent type ville ellers blitt tegnet som et begrep og fått
       ferdighetsseksjonene i instruksen - stillhet, igjen. */
    if (NODE_TYPES.indexOf(node.type) === -1) {
      pushError('errorUnknownNodeType', { id: node.id, type: node.type, valid: NODE_TYPES.join(', '),
                                          guess: nearest(node.type.toLowerCase(), NODE_TYPES) });
    }
    node.depends_on.forEach(depId => {
      if (!nodesById.has(depId)) {
        pushError('errorUnknownDep', { id: node.id, dep: depId });
      }
    });
    if (node.topic === 'Annet' && !TOPIC_ORDER.includes('Annet')) {
      pushError('errorNoTopic', { id: node.id, topic: t('defaultTopic') });
    }
  });
  validateResources();
}

/* En ressurs som ikke hører til noen node, vises ingen steder - den er
   stillhet, akkurat som en ukjent config-nøkkel. To rader med samme lenke
   og samme tittel er den samme ressursen skrevet to ganger, og skal være
   én rad med begge nodene i depends_on. Samme lenke med ULIK tittel er
   lov: et eksamenssett er én PDF med mange oppgaver. */
function validateResources() {
  const seen = new Map();
  allResources.forEach(res => {
    if (!res.nodes.length) {
      pushError('errorResourceNoNode', { row: res.row, label: res.label });
    }
    res.nodes.forEach(nodeId => {
      if (!nodesById.has(nodeId)) {
        pushError('errorUnknownResourceNode', { row: res.row, id: nodeId,
                                                guess: nearest(nodeId, [...nodesById.keys()]) });
      }
    });
    const key = (res.url ? res.url : res.group.toLowerCase()) + '\n' + res.label.toLowerCase();
    if (seen.has(key)) {
      pushError('errorResourceDuplicate', { row: res.row, first: seen.get(key), label: res.label });
    } else {
      seen.set(key, res.row);
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
/* BARNESKOLEMATTE: hver node må ha et trinn, og en forutsetning kan aldri
   ligge på et senere trinn enn noden som bygger på den — da ville kanten
   pekt oppover i treet. Begge deler er feil i fila, ikke noe motoren
   skal gjette seg forbi. */
function validateStages() {
  allNodes.forEach(node => {
    if (!Number.isInteger(node.stage) || node.stage < 1) {
      pushError('errorNoStage', { id: node.id });
      node.stage = 1;
    }
  });
  allNodes.forEach(node => {
    node.depends_on.forEach(depId => {
      const dep = nodesById.get(depId);
      if (dep && dep.stage > node.stage) {
        pushError('errorStageOrder', { id: node.id, stage: node.stage, dep: dep.id, depStage: dep.stage });
      }
    });
  });
}

function maxStage(nodes) {
  return nodes.reduce((m, n) => Math.max(m, n.stage || 1), 1);
}

function stageList() {
  return [...new Set(allNodes.map(n => n.stage))].sort((a, b) => a - b);
}

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

  /* BARNESKOLEMATTE: trinnet går foran grafdybden. Innenfor et trinn er
     nivået den lengste kjeden av forutsetninger PÅ SAMME TRINN; en
     forutsetning fra et tidligere trinn ligger allerede i et bånd over.
     Så slås (trinn, lokalt nivå) sammen til ett globalt nivå, slik at
     resten av layouten (computeGlobalRowStarts, layoutColumn,
     læringsmålkodene) virker uendret: en forutsetning har fortsatt alltid
     lavere nivå enn det som bygger på den, fordi validateStages har sørget
     for at den aldri ligger på et senere trinn. */
  const local = new Map();
  const busy = new Set();
  function localLevel(node) {
    if (local.has(node.id)) return local.get(node.id);
    if (busy.has(node.id)) return 0;
    busy.add(node.id);
    let lvl = 0;
    node.depends_on.forEach(depId => {
      const dep = nodesById.get(depId);
      if (dep && dep.stage === node.stage) lvl = Math.max(lvl, localLevel(dep) + 1);
    });
    busy.delete(node.id);
    local.set(node.id, lvl);
    return lvl;
  }
  allNodes.forEach(node => { node.stageLevel = localLevel(node); });

  let offset = 0;
  STAGE_FIRST_LEVEL = new Map();
  stageList().forEach(stage => {
    STAGE_FIRST_LEVEL.set(stage, offset);
    const inStage = allNodes.filter(n => n.stage === stage);
    const depth = inStage.reduce((m, n) => Math.max(m, n.stageLevel), 0);
    inStage.forEach(n => { n.nivaa = offset + n.stageLevel; });
    offset += depth + 1;
  });
}

// Første globale nivå i hvert trinn (trinn → nivå). Satt av computeLevels.
let STAGE_FIRST_LEVEL = new Map();

/* BARNESKOLEMATTE: celler som kan åpnes og lukkes. En celle er ett tema på
   ett trinn. Alle er lukket når sida lastes (Vidar 2026-10-30: treet ble for
   stort å navigere i), og en lukket celle tegnes som én boks på trinnets
   første rad. Hva som er åpent huskes bevisst ikke mellom besøk: treet skal
   starte lukket. */
let OPEN_CELLS = new Set();
let CELL_SUMMARIES = new Map(); // cellKey → sammendrag, fra config-radene cellSummary.*

function itemWidth(item) {
  return item.isCell ? LAYOUT.cellBoxWidth : LAYOUT.nodeWidth;
}

function itemHeight(item) {
  return item.isCell ? LAYOUT.cellBoxHeight : (item.h || LAYOUT.nodeHeight);
}

function itemTop(item) {
  return item.isCell ? item.y - LAYOUT.cellBoxLift : item.y;
}
let CELL_BOXES = [];          // de lukkede cellene, med x/y fra layouten
let VISIBLE_IDS = new Set();  // nodene som tegnes, dvs. de i åpne celler

function cellKey(stage, topic) {
  return stage + '|' + topic;
}

function setCellOpen(stage, topic, open) {
  if (open) OPEN_CELLS.add(cellKey(stage, topic));
  else OPEN_CELLS.delete(cellKey(stage, topic));
  layoutAndRender();
}

/* Åpner cellen en node ligger i, så noden finnes i DOM-en. Kalles før en
   node vises eller åpnes fra søk, lister og detaljpanelet. */
function ensureCellOpen(nodeId) {
  const node = nodesById.get(nodeId);
  if (node && !OPEN_CELLS.has(cellKey(node.stage, node.topic))) setCellOpen(node.stage, node.topic, true);
}

/* Det layouten legger ut i hver kolonne: nodene i åpne celler, og én boks
   per lukket celle. Boksen får trinnets første nivå, og har ingen kanter i
   layouten (den står alene på sin rad i kolonnen uansett). */
function visibleColumns(columns) {
  VISIBLE_IDS = new Set();
  CELL_BOXES = [];
  return columns.map(({ topic, nodes }) => {
    const items = [];
    const boxes = new Map();
    nodes.forEach(node => {
      if (OPEN_CELLS.has(cellKey(node.stage, topic))) {
        items.push(node);
        VISIBLE_IDS.add(node.id);
        return;
      }
      if (!boxes.has(node.stage)) {
        const box = {
          id: 'cell:' + cellKey(node.stage, topic), isCell: true, stage: node.stage, topic,
          name: topic, nivaa: STAGE_FIRST_LEVEL.get(node.stage), depends_on: [], children: [], nodes: [],
        };
        boxes.set(node.stage, box);
        items.push(box);
        CELL_BOXES.push(box);
      }
      boxes.get(node.stage).nodes.push(node);
    });
    return { topic, nodes, items };
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
    subjectFamilyTitle: (FAMILY && FAMILY.title) || '',
    decompositionVersion: CONFIG.decompositionVersion || '',
    learner: LEARNER,
    learnerDefault: (LANG.learner && LANG.learner.default) || '',
    learnerDerived: !CONFIG.learner,
    storageKey: STORAGE_KEY,
    topicOrder: TOPIC_ORDER.slice(),
    topicOrderDerived: !(CONFIG.topicOrder && CONFIG.topicOrder.length),
    features: Object.assign({}, FEATURES),
    slots: Object.assign({}, CONFIG.slots || {}),
    aids: CONFIG.aids || null,
    nodeCount: allNodes.length,
    skillCount: allNodes.filter(n => n.type === 'skill').length,
    conceptCount: allNodes.filter(n => n.type === 'concept').length,
    factCount: allNodes.filter(n => n.type === 'fact').length,
    rootCount: allNodes.filter(n => !n.depends_on.length).length,
    depth: allNodes.reduce((m, n) => Math.max(m, n.nivaa), 0) + 1,
    promptOverrides: Object.keys(PROMPT_ROWS),
    /* Til redigeringsverktøyet på /make-your-own/: hva hver instruks ville sagt
       uten treets egne prompt-rader, og hvilke valg style.font har. */
    instructions: describeInstructions(),
    style: Object.assign({}, CONFIG.style || {}),
    styleFonts: STYLE_FONTS.slice(),
    subjectFamilies: Object.keys((MANIFEST && MANIFEST.subjectFamilies) || {}),
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
// BARNESKOLEMATTE: `field` sier hvilken liste per kolonne som legges ut
// ('nodes' for hele treet, 'items' for det som er synlig når celler er
// lukket), og et nivå uten noe synlig tar ingen rad. I hele treet har hvert
// nivå minst én node, så det endrer ingenting der; med lukkede celler er det
// det som gjør at treet krymper.
function computeGlobalRowStarts(columns, field = 'nodes') {
  const maxLevel = allNodes.reduce((m, n) => Math.max(m, n.nivaa), 0);
  const rowStart = [];
  let cursor = 0;
  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    rowStart.push(cursor);
    let rowsForLevel = 0;
    columns.forEach(col => {
      const count = col[field].filter(n => n.nivaa === lvl).length;
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
// BARNESKOLEMATTE: kodene regnes fra layouten av HELE treet (rad og plass i
// raden, `_row`/`_col`), ikke fra x/y, slik at en node beholder koden sin
// uansett hvilke celler som er åpne.
function assignLearningGoalIndices(columns) {
  const fullRowStart = computeGlobalRowStarts(columns, 'nodes');
  columns.forEach(({ nodes }) => {
    layoutColumn(nodes, fullRowStart).forEach((row, r) => {
      row.forEach((node, i) => { node._row = r; node._col = i; });
    });
  });
  themeList = columns.map(({ topic, nodes }, i) => {
    const letter = columnLetter(i);
    const sorted = [...nodes].sort((a, b) => a.nivaa - b.nivaa || a._row - b._row || a._col - b._col);
    sorted.forEach((node, j) => { node.goalIndex = `${letter}${j + 1}`; });
    return { letter, topic, nodes: sorted };
  });
}

function layoutAndRender() {
  const columns = visibleColumns(groupByColumn());
  assignLearningGoalIndices(columns);
  const globalRowStart = computeGlobalRowStarts(columns, 'items');
  const columnMeta = [];
  let cursorX = 0;

  columns.forEach(({ topic, nodes, items }) => {
    const visualRows = layoutColumn(items, globalRowStart);
    // BARNESKOLEMATTE: bredden regnes per element, fordi en boks for en
    // lukket celle er bredere enn en node.
    const rowPixelWidth = row => row.reduce((w, n) => w + itemWidth(n), 0) + Math.max(0, row.length - 1) * LAYOUT.hGap;
    // Bredden følger det som står i kolonnen: smal når alt er lukket.
    const colPixelWidth = visualRows.reduce((m, row) => Math.max(m, rowPixelWidth(row)), 0) || LAYOUT.nodeWidth;

    columnMeta.push({ topic, x: cursorX, width: colPixelWidth, rowCount: visualRows.length, nodes, visualRows });
    cursorX += colPixelWidth + LAYOUT.columnGap;
  });

  /* BARNESKOLEMATTE: ett bånd per trinn. Båndene ligger kant i kant:
     øverst en stripe med trinnets navn, så radene, og nederst skillelinja
     med knappene for alt til og med trinnet. Hver rad er så høy som det
     høyeste den inneholder, så et trinn med bare lukkede celler er lavt.
     Den kompakte layouten og optimaliseringen fra maskineriet 0.40.0 er
     slått av her (LAYOUT.compact/optimize), fordi de flytter kortene
     fritt opp og til siden og ville sprengt trinnbåndene og cellene. */
  const stages = stageList();
  const maxRowCount = columnMeta.reduce((m, c) => Math.max(m, c.rowCount), 0);
  const slotHeight = item => item.isCell
    ? LAYOUT.cellBoxHeight + LAYOUT.cellRowGap
    : LAYOUT.nodeHeight + LAYOUT.vGap;
  const rowHeight = new Array(maxRowCount).fill(0);
  columnMeta.forEach(c => c.visualRows.forEach((row, r) => {
    row.forEach(item => { rowHeight[r] = Math.max(rowHeight[r], slotHeight(item)); });
  }));
  const rowTop = new Array(maxRowCount).fill(0);
  let cursorY = LAYOUT.columnLabelHeight;
  const stageMeta = stages.map((stage, i) => {
    const firstRow = globalRowStart[STAGE_FIRST_LEVEL.get(stage)];
    const nextStage = stages[i + 1];
    const lastRow = nextStage !== undefined
      ? globalRowStart[STAGE_FIRST_LEVEL.get(nextStage)] - 1
      : maxRowCount - 1;
    const top = cursorY;
    cursorY += LAYOUT.stageHeaderHeight;
    for (let r = firstRow; r <= lastRow; r++) { rowTop[r] = cursorY; cursorY += rowHeight[r]; }
    cursorY += LAYOUT.stageDividerHeight;
    return { stage, top, bottom: cursorY };
  });

  // Hvert element midt i raden sin, loddrett.
  columnMeta.forEach(c => {
    c.visualRows.forEach((row, r) => {
      let x = c.x + (c.width - row.reduce((w, n) => w + itemWidth(n), 0) - Math.max(0, row.length - 1) * LAYOUT.hGap) / 2;
      row.forEach(item => {
        item.x = x;
        item.y = rowTop[r] + (rowHeight[r] - slotHeight(item)) / 2
          + (item.isCell ? LAYOUT.cellRowGap / 2 : LAYOUT.vGap / 2);
        item.row = r;
        x += itemWidth(item) + LAYOUT.hGap;
      });
    });
    delete c.visualRows;
  });

  const totalWidth = Math.max(0, cursorX - LAYOUT.columnGap) + LAYOUT.padding * 2;
  const lastBottom = stageMeta.length ? stageMeta[stageMeta.length - 1].bottom : LAYOUT.columnLabelHeight;
  const totalHeight = lastBottom + LAYOUT.padding * 2;

  const container = document.getElementById('graph-container');
  container.style.width = totalWidth + 'px';
  container.style.height = totalHeight + 'px';

  renderGraph(columnMeta, stageMeta);
}

/* BARNESKOLEMATTE: emneoverskriftene står fast øverst når kartet rulles
   nedover, så man alltid ser hvilket tema en kolonne er. Lerretet er skalert
   med transform, så rulleavstanden regnes om til lerretets egne enheter. */
function updateStickyHeaders() {
  const scrollEl = document.getElementById('graph-scroll');
  if (!scrollEl) return;
  const offset = Math.max(0, scrollEl.scrollTop / zoomLevel - 6);
  document.querySelectorAll('#column-headers .column-header').forEach(h => {
    h.style.top = (LAYOUT.padding + offset) + 'px';
    h.classList.toggle('stuck', offset > 0);
  });
}

/* BARNESKOLEMATTE: trinnbåndene. For hvert trinn:
   - et bånd over hele bredden i trinnets farge (--stage-N i tree.css),
   - en stripe øverst med trinnets navn og merk/fjern per tema, som bare
     gjelder det temaets noder på DETTE trinnet,
   - en skillelinje nederst med knapper som gjelder alt til og med trinnet:
     kartleggingsprøve, og merk/fjern mestret.
   Fargen bærer aldri betydningen alene: navnet står i stripa.
   Merk/fjern bruker listeikonet fra maskineriet (prinsipp 14), og «Lukk» er
   ren tekst (prinsipp 13). */
function renderStages(columnMeta, stageMeta, bandsLayer, headersLayer) {
  const fullWidth = columnMeta.length
    ? columnMeta[columnMeta.length - 1].x + columnMeta[columnMeta.length - 1].width + LAYOUT.columnGap
    : 0;
  const left = LAYOUT.padding - LAYOUT.columnGap / 2;

  stageMeta.forEach(({ stage, top, bottom }) => {
    const band = document.createElement('div');
    band.className = 'stage-band';
    band.style.setProperty('--stage-color', `var(--stage-${((stage - 1) % 7) + 1})`);
    band.style.left = left + 'px';
    band.style.top = (LAYOUT.padding + top) + 'px';
    band.style.width = fullWidth + 'px';
    band.style.height = (bottom - top) + 'px';
    bandsLayer.appendChild(band);

    const label = document.createElement('div');
    label.className = 'stage-label';
    label.textContent = t('stage.label', { n: stage });
    label.style.left = (LAYOUT.padding) + 'px';
    label.style.top = (LAYOUT.padding + top + 5) + 'px';
    headersLayer.appendChild(label);

    /* Lukk og merk/fjern står bare over en ÅPEN celle (2026-11-11, Vidar:
       treet var for bråkete). En lukket celle åpnes først. */
    columnMeta.forEach(col => {
      const cellNodes = col.nodes.filter(n => n.stage === stage);
      if (!cellNodes.length || !OPEN_CELLS.has(cellKey(stage, col.topic))) return;
      const actions = document.createElement('span');
      actions.className = 'stage-cell-actions';
      actions.style.left = (LAYOUT.padding + col.x + col.width) + 'px';
      actions.style.top = (LAYOUT.padding + top + 1) + 'px';
      {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'stage-cell-close nav-btn';
        close.textContent = t('stage.closeCell');
        close.title = t('stage.closeCellTitle', { topic: col.topic, n: stage });
        close.addEventListener('click', () => setCellOpen(stage, col.topic, false));
        actions.appendChild(close);
      }
      actions.appendChild(bulkIconButton(t('stage.markCell', { topic: col.topic, n: stage }), true, false,
        () => bulkSetMastery(cellNodes, true)));
      actions.appendChild(bulkIconButton(t('stage.clearCell', { topic: col.topic, n: stage }), false, false,
        () => bulkSetMastery(cellNodes, false)));
      headersLayer.appendChild(actions);
    });

    // Stripe med en linje over og under, i bakgrunnslaget, så pilene
    // mellom trinnene fortsatt tegnes over den.
    const gap = document.createElement('div');
    gap.className = 'stage-divider-gap';
    gap.style.left = left + 'px';
    gap.style.width = fullWidth + 'px';
    gap.style.top = (LAYOUT.padding + bottom - LAYOUT.stageDividerHeight) + 'px';
    gap.style.height = LAYOUT.stageDividerHeight + 'px';
    bandsLayer.appendChild(gap);

    const upTo = () => allNodes.filter(n => n.stage <= stage);
    const divider = document.createElement('div');
    divider.className = 'stage-divider';
    divider.style.left = left + 'px';
    divider.style.width = fullWidth + 'px';
    divider.style.top = (LAYOUT.padding + bottom - LAYOUT.stageDividerHeight) + 'px';
    divider.style.height = LAYOUT.stageDividerHeight + 'px';

    const inner = document.createElement('div');
    inner.className = 'stage-divider-inner';
    const heading = document.createElement('span');
    heading.className = 'stage-divider-heading';
    heading.textContent = t('stage.upTo', { n: stage });
    inner.appendChild(heading);

    // Hovedhandlingen: åpner Prøve-vinduet med alt til og med trinnet valgt.
    const testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = 'resource-copy stage-divider-test';
    testBtn.textContent = t('stage.mapTest');
    testBtn.title = t('stage.mapTestTitle', { n: stage });
    testBtn.addEventListener('click', () => openMappingTest(stage));
    inner.appendChild(testBtn);

    const bulk = document.createElement('span');
    bulk.className = 'stage-divider-bulk';
    bulk.appendChild(bulkIconButton(t('stage.markUpTo', { n: stage }), true, true,
      () => bulkSetMastery(upTo(), true), 'goal-index-bulk-btn'));
    bulk.appendChild(bulkIconButton(t('stage.clearUpTo', { n: stage }), false, true, () => {
      // Som «fjern alle» i Læringsmål: å slette framgangen spør først.
      if (window.confirm(t('stage.clearUpToConfirm', { n: stage }))) bulkSetMastery(upTo(), false);
    }, 'goal-index-bulk-btn'));
    inner.appendChild(bulk);

    divider.appendChild(inner);
    headersLayer.appendChild(divider);
  });
}

/* BARNESKOLEMATTE: kartleggingsprøven er Prøve-vinduet med alle mål til og
   med trinnet valgt fra start. Vanskelighetsgrad, antall (standard 10) og
   oppgaveform velges i vinduet som ellers. */
function openMappingTest(stage) {
  openExamModal(allNodes.filter(n => n.stage <= stage).map(n => n.id));
}

/* BARNESKOLEMATTE: Skriv ut tegner det som står i siden. Lukkede celler er
   bokser uten læringsmål, så alle cellene åpnes mens treet leses av, og
   lukkes igjen etterpå. */
function withAllCellsOpen(fn) {
  const before = new Set(OPEN_CELLS);
  allNodes.forEach(n => OPEN_CELLS.add(cellKey(n.stage, n.topic)));
  layoutAndRender();
  try {
    return fn();
  } finally {
    OPEN_CELLS = before;
    layoutAndRender();
  }
}

/* ------------------------------------------------------------------ */
/* Rendering av grafen                                                  */
/* ------------------------------------------------------------------ */

/* Et kort som bryter teksten over flere linjer, blir ellers like bredt som
   største bredde (LAYOUT.nodeWidth) selv om ingen linje fyller det, og får
   et tomt felt til høyre (Vidar, 2026-11-11). Den lengste linja måles, og
   teksten får akkurat den bredden. */
function shrinkWrapNode(el) {
  const text = el.querySelector('.node-text');
  if (!text || !text.offsetWidth) return;
  const range = document.createRange();
  range.selectNodeContents(text);
  const rects = [...range.getClientRects()].filter(r => r.width > 0);
  if (rects.length < 2) return;
  const tops = new Set(rects.map(r => Math.round(r.top)));
  if (tops.size < 2) return;            // én linje: allerede så smal som teksten
  const scale = (text.getBoundingClientRect().width / text.offsetWidth) || 1;
  const left = Math.min(...rects.map(r => r.left));
  const right = Math.max(...rects.map(r => r.right));
  text.style.flex = '0 0 auto';
  text.style.width = Math.ceil((right - left) / scale + 1) + 'px';
}

/* Kompakt layout (forsøk fra 2026-11-11). Før sto kortene i faste rader
   etter nivå, og et kort med én forutsetning høyt oppe kunne bli stående
   langt ned fordi et annet emne trengte mange rader. Nå legges kortene ut
   rad for rad, og hvert kort havner så høyt som to krav tillater:
     1. under ALLE forutsetningene sine, med luft til kanten (compactGap),
        også når forutsetningen står i et annet emne. Pilene peker derfor
        fortsatt alltid nedover;
     2. under kortet som allerede står i samme plass i kolonnen.
   Den vannrette plasseringen er uendret. Et kort som venter på en
   forutsetning langt nede et annet sted, står fortsatt langt nede.
   Returnerer underkanten av det nederste kortet. */
function boxSpan(n) {
  const w = n.w || LAYOUT.nodeWidth;
  const left = n.x + (LAYOUT.nodeWidth - w) / 2;
  return [left, left + w];
}

/* Ryddigere kanter (fra 2026-11-11). Etter at kortene er lagt ut, prøver
   motoren små trekk og beholder dem som gjør kartet ryddigere: et kort
   kan flytte seg en halv plass til siden, eller bytte plass med naboen i
   samme rad. Et trekk beholdes bare når summen av fire ting blir mindre:
     - linjer som krysser hverandre (teller mye),
     - linjer som går under et kort de ikke hører til (teller mest),
     - lengden på linjene,
     - hvor langt kortene har flyttet seg fra der de startet, så
       rekkefølgen (A1, A2 …) stort sett blir som før.
   Bare linjer innenfor samme emne teller, siden linjer mellom emner bare
   vises som stubber. Søket er grådig og deterministisk, uten tilfeldighet:
   samme tre gir alltid samme kart, og dermed de samme kodene. Det kjøres
   én gang når treet lastes (se layoutOptimizedX), ikke for hvert trykk.
   Slås av med `layout.optimize,0`. */
let layoutOptimizedX = null;
const OPT_WEIGHTS = { cross: 4, under: 6, length: 1 / 120, order: 0.8, height: 1 / 150 };

function optimizeLayout(columnMeta) {
  const U = LAYOUT.nodeWidth + LAYOUT.hGap;
  const cols = columnMeta.map(c => {
    const slots = Math.max(1, Math.round((c.width + LAYOUT.hGap) / U));
    const ids = new Set(c.nodes.map(n => n.id));
    const edges = [];
    c.nodes.forEach(n => {
      n._colX = c.x;
      n._pos = n._pos0 = Math.round(2 * (n.x - c.x) / U);
      drawnDependencies(n).forEach(id => { if (ids.has(id)) edges.push([nodesById.get(id), n]); });
    });
    const rows = new Map();
    c.nodes.forEach(n => { if (!rows.has(n.row)) rows.set(n.row, []); rows.get(n.row).push(n); });
    return { nodes: c.nodes, edges, maxPos: 2 * (slots - 1), rows: [...rows.values()], sig: null, cost: 0 };
  });
  const place = n => { n.x = n._colX + n._pos / 2 * U; };
  const signature = col => col.nodes.reduce((h, n, i) => h + (n.x * 31 + n.y * 17) * (i + 1), 0);
  const evaluate = () => {
    compactVertically();
    let total = 0;
    cols.forEach(col => {
      const sig = signature(col);
      if (sig !== col.sig) { col.sig = sig; col.cost = columnLayoutCost(col); }
      total += col.cost;
    });
    return total;
  };
  const free = (n, pos, row) => pos >= 0 && row.every(m => m === n || Math.abs(m._pos - pos) >= 2);

  let best = evaluate();
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    cols.forEach(col => {
      if (col.maxPos === 0) return;
      col.rows.forEach(row => {
        [...row].sort((a, b) => a._pos - b._pos).forEach(n => {
          const sorted = [...row].sort((a, b) => a._pos - b._pos);
          const i = sorted.indexOf(n);
          const moves = [
            { to: n._pos - 1 }, { to: n._pos + 1 },
            { swap: sorted[i - 1] }, { swap: sorted[i + 1] },
          ];
          for (const mv of moves) {
            const from = n._pos;
            if (mv.swap === undefined) {
              if (mv.to > col.maxPos || !free(n, mv.to, row)) continue;
              n._pos = mv.to; place(n);
              const c = evaluate();
              if (c < best - 0.01) { best = c; improved = true; break; }
              n._pos = from; place(n);
            } else if (mv.swap) {
              const m = mv.swap, mf = m._pos;
              n._pos = mf; m._pos = from; place(n); place(m);
              const c = evaluate();
              if (c < best - 0.01) { best = c; improved = true; break; }
              n._pos = from; m._pos = mf; place(n); place(m);
            }
          }
        });
      });
    });
    if (!improved) break;
  }
  evaluate();
  allNodes.forEach(n => { delete n._pos; delete n._pos0; delete n._colX; });
}

function columnLayoutCost(col) {
  const W = LAYOUT.nodeWidth;
  const N = 10;
  const polys = col.edges.map(([a, b]) => {
    const x1 = a.x + W / 2, y1 = a.y + a.h, x2 = b.x + W / 2, y2 = b.y, my = (y1 + y2) / 2;
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N, u = 1 - t;
      pts.push([u * u * u * x1 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x2,
                u * u * u * y1 + 3 * u * u * t * my + 3 * u * t * t * my + t * t * t * y2]);
    }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { a, b, pts, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  });
  let length = 0;
  polys.forEach(pl => { for (let k = 1; k <= N; k++) length += Math.hypot(pl.pts[k][0] - pl.pts[k - 1][0], pl.pts[k][1] - pl.pts[k - 1][1]); });

  const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const segX = (p1, p2, p3, p4) => {
    const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2), d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  };
  let cross = 0;
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      const P = polys[i], Q = polys[j];
      if (P.a === Q.a || P.a === Q.b || P.b === Q.a || P.b === Q.b) continue;
      if (P.box[2] < Q.box[0] || Q.box[2] < P.box[0] || P.box[3] < Q.box[1] || Q.box[3] < P.box[1]) continue;
      let hit = false;
      for (let k = 1; k <= N && !hit; k++) {
        for (let m = 1; m <= N && !hit; m++) {
          if (segX(P.pts[k - 1], P.pts[k], Q.pts[m - 1], Q.pts[m])) hit = true;
        }
      }
      if (hit) cross++;
    }
  }

  let under = 0;
  polys.forEach(pl => {
    col.nodes.forEach(n => {
      if (n === pl.a || n === pl.b) return;
      const [l, r] = boxSpan(n);
      const t = n.y + 3, btm = n.y + n.h - 3;
      if (pl.box[2] < l || r < pl.box[0] || pl.box[3] < t || btm < pl.box[1]) return;
      if (pl.pts.some(([x, y]) => x > l + 3 && x < r - 3 && y > t && y < btm)) under++;
    });
  });

  const order = col.nodes.reduce((sum, n) => sum + Math.abs(n._pos - n._pos0), 0);
  const height = col.nodes.reduce((m, n) => Math.max(m, n.y + n.h), 0);
  return cross * OPT_WEIGHTS.cross + under * OPT_WEIGHTS.under + length * OPT_WEIGHTS.length +
         order * OPT_WEIGHTS.order + height * OPT_WEIGHTS.height;
}

function compactVertically() {
  const gap = Number(LAYOUT.compactGap) || 44;
  const top = LAYOUT.columnLabelHeight;
  const order = [...allNodes].sort((a, b) => a.row - b.row || a.x - b.x);
  const placed = [];
  let bottom = top;
  order.forEach(node => {
    let y = top;
    node.depends_on.forEach(id => {
      const dep = nodesById.get(id);
      if (dep && dep._placed) y = Math.max(y, dep.y + dep.h + gap);
    });
    /* Bare kort som faktisk står over hverandre teller, med kortenes
       virkelige bredde (de er sentrert i plassen sin). */
    const [l, r] = boxSpan(node);
    placed.forEach(m => {
      const [ml, mr] = boxSpan(m);
      if (ml < r + 16 && l < mr + 16) y = Math.max(y, m.y + m.h + gap);
    });
    node.y = y;
    node._placed = true;
    placed.push(node);
    bottom = Math.max(bottom, y + node.h);
  });
  allNodes.forEach(n => { delete n._placed; });
  return bottom;
}

function renderGraph(columnMeta, stageMeta) {
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

  renderStages(columnMeta, stageMeta || [], bandsLayer, headersLayer);

  // Kolonneoverskrifter. BARNESKOLEMATTE: uten merk/fjern her — å krysse av
  // et helt tema gjør man per trinn, i stripa øverst i hvert trinnbånd.
  columnMeta.forEach(col => {
    const header = document.createElement('div');
    header.className = 'column-header';
    // BARNESKOLEMATTE: overskriften får hele kolonnebredden med mellomrommet,
    // så emnenavnet får plass på to linjer over de smale rutene.
    header.style.left = (LAYOUT.padding + col.x - LAYOUT.columnGap / 2 + 4) + 'px';
    header.style.top = LAYOUT.padding + 'px';
    header.style.width = (col.width + LAYOUT.columnGap - 8) + 'px';

    const label = document.createElement('span');
    label.className = 'column-header-label';
    label.textContent = col.topic;
    header.appendChild(label);
    headersLayer.appendChild(header);
  });
  updateStickyHeaders(); // BARNESKOLEMATTE

  const progress = getProgress();

  // Noder FØRST (maskineriet fra 2026-11-11): kortene er så store som
  // teksten, så de må måles før kantene kan tegnes. Hvert kort sentreres i
  // plassen sin, og høyden lagres på noden (node.h) til kantene under.
  // BARNESKOLEMATTE: bare nodene i åpne celler, og én boks per lukket celle.
  allNodes.forEach(node => {
    if (!VISIBLE_IDS.has(node.id)) return;
    const el = createNodeElement(node, progress);
    nodesLayer.appendChild(el);
    shrinkWrapNode(el);
    node.w = el.offsetWidth || LAYOUT.nodeWidth;
    node.h = el.offsetHeight || LAYOUT.nodeHeight;
    el.style.left = (LAYOUT.padding + node.x + (LAYOUT.nodeWidth - node.w) / 2) + 'px';
    el.style.top = (LAYOUT.padding + node.y) + 'px';
  });
  CELL_BOXES.forEach(box => nodesLayer.appendChild(createCellBox(box, progress)));

  // Kanter. Bare de direkte kantene tegnes: en avhengighet som allerede følger
  // av en lengre vei (A→C når A→B→C finnes) utelates fra tegningen. Fila,
  // detaljpanelet og instruksene er uberørt — de bruker hele kjeden via
  // getAllAncestors.
  //
  // BARNESKOLEMATTE: en node i en lukket celle tegnes ikke, så kantene dens
  // går til boksen for cellen i stedet. Kanter inni én boks faller bort, flere
  // like kanter blir én, og en kant som ville pekt oppover (mellom to celler
  // på samme trinn, der boksen står øverst) tegnes ikke.
  const anchorOf = new Map();
  CELL_BOXES.forEach(box => box.nodes.forEach(n => anchorOf.set(n.id, box)));
  const drawn = new Set();
  allNodes.forEach(realNode => {
    drawnDependencies(realNode).forEach(depId => {
      const realDep = nodesById.get(depId);
      if (!realDep) return;
      const dep = anchorOf.get(realDep.id) || realDep;
      const node = anchorOf.get(realNode.id) || realNode;
      if (dep === node || node.y <= dep.y) return;
      // Mellom to lukkede celler tegnes ingen strek: trinnene sier allerede
      // rekkefølgen, og strekene gjorde oversikten bråkete (2026-11-11).
      if (dep.isCell && node.isCell) return;
      const edgeKey = dep.id + '>' + node.id;
      if (drawn.has(edgeKey)) return;
      drawn.add(edgeKey);
      const x1 = LAYOUT.padding + dep.x + itemWidth(dep) / 2;
      const y1 = LAYOUT.padding + itemTop(dep) + itemHeight(dep);
      const x2 = LAYOUT.padding + node.x + itemWidth(node) / 2;
      const y2 = LAYOUT.padding + itemTop(node);
      const midY = (y1 + y2) / 2;
      const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.dataset.from = dep.id;
      path.dataset.to = node.id;
      // Kantene er lyse som standard, fordi et stort tre ellers drukner i strek.
      // To ting løfter en kant ut av bakgrunnen igjen: at den GÅR FRA en node
      // eleven har huket av (da er den en vei videre, ikke bare en avhengighet),
      // og at den hører til noden som er åpen i detaljpanelet (se
      // updateEdgeHighlight).
      if (dep.isCell ? dep.nodes.every(n => isNodeMastered(n, progress)) : isNodeMastered(dep, progress)) {
        path.classList.add('edge-from-mastered');
      }
      svg.appendChild(path);

      // En kant mellom to emner tegnes i hvile bare som to korte stubber med
      // pil, én ut fra hver ende. Hele kanten vises når en av nodene er åpen
      // (se .edge-cross og .edge-stub i tree.css).
      if (dep.topic !== node.topic) {
        path.classList.add('edge-cross');
        [false, true].map(atEnd => edgeStub([[x1, y1], [x1, midY], [x2, midY], [x2, y2]], atEnd)).forEach(sd => {
          const stub = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          stub.setAttribute('d', sd);
          stub.dataset.from = dep.id;
          stub.dataset.to = node.id;
          stub.classList.add('edge-stub');
          if (path.classList.contains('edge-from-mastered')) stub.classList.add('edge-from-mastered');
          svg.appendChild(stub);
        });
      }
    });
  });

  updateEdgeHighlight();
}

/* BARNESKOLEMATTE: en lukket celle er en glassrute med et minitre av
   cellen inni, og fremdriftsstripa nederst. Ingen tekst (2026-11-11,
   Vidar): temaet står over kolonnen og trinnet i båndet. Navn, antall og
   sammendraget (`cellSummary.*`) ligger i title/aria-label, så de finnes
   for skjermlesere og ved hover uten å støye i kartet. Ruta er ikke et
   læringsmål, og ser derfor ikke ut som et kort (prinsipp 3). */
function createCellBox(box, progress) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cell-box';
  el.style.left = (LAYOUT.padding + box.x) + 'px';
  el.style.top = (LAYOUT.padding + itemTop(box)) + 'px';
  el.style.width = LAYOUT.cellBoxWidth + 'px';
  el.style.height = LAYOUT.cellBoxHeight + 'px';

  const total = box.nodes.length;
  const done = box.nodes.filter(n => isNodeMastered(n, progress)).length;
  if (done === total) el.classList.add('mastered');

  const summary = (CELL_SUMMARIES.get(cellKey(box.stage, box.topic)) || '')
    .split('\n').map(s => s.trim()).filter(Boolean);
  const label = [
    t('stage.openCell', { topic: box.topic, n: box.stage }),
    t('stage.cellCount', { total, done }),
  ].concat(summary.map(p => '• ' + p)).join('\n');
  el.title = label;
  el.setAttribute('aria-label', label.replace(/\n/g, '. '));

  el.appendChild(miniTreeSvg(box.nodes, progress));

  const bar = document.createElement('span');
  bar.className = 'cell-box-bar';
  const fill = document.createElement('span');
  fill.style.width = (total ? Math.round(100 * done / total) : 0) + '%';
  bar.appendChild(fill);
  el.appendChild(bar);

  el.addEventListener('click', () => setCellOpen(box.stage, box.topic, true));
  return el;
}

/* Minitreet: nodene i cellen som små kort i typens farge og form, i rader
   etter hvor mange forutsetninger INNI cellen de bygger på, med strekene
   mellom dem. Mestrede mål er fylt grønne. Tegnes i viewBox-enheter og
   skaleres inn i ruta, så en stor celle får mindre kort. */
const MINI = { w: 22, h: 9, gx: 6, gy: 11, perRow: 4, pad: 3 };
function miniTreeSvg(nodes, progress) {
  const ids = new Set(nodes.map(n => n.id));
  const level = new Map();
  const lvl = n => {
    if (level.has(n.id)) return level.get(n.id);
    level.set(n.id, 0);
    let v = 0;
    n.depends_on.forEach(d => { if (ids.has(d)) v = Math.max(v, lvl(nodesById.get(d)) + 1); });
    level.set(n.id, v);
    return v;
  };
  nodes.forEach(lvl);

  // Rader: ett nivå om gangen, brutt etter MINI.perRow. Hvert nivå
  // sorteres etter snittet av foreldrenes plass, så strekene krysser lite.
  const pos = new Map();
  const rows = [];
  const maxLvl = Math.max(0, ...nodes.map(n => level.get(n.id)));
  for (let L = 0; L <= maxLvl; L++) {
    const here = nodes.filter(n => level.get(n.id) === L);
    const key = n => {
      const ps = n.depends_on.filter(d => pos.has(d)).map(d => pos.get(d));
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Infinity;
    };
    here.sort((a, b) => key(a) - key(b) || compareByGoalIndex(a, b));
    for (let i = 0; i < here.length; i += MINI.perRow) {
      const row = here.slice(i, i + MINI.perRow);
      row.forEach((n, j) => pos.set(n.id, j - (row.length - 1) / 2));
      rows.push(row);
    }
  }
  const cols = Math.max(1, ...rows.map(r => r.length));
  /* Minst så stor som fire kort i bredden og tre rader i høyden, så alle
     rutene har samme målestokk og ett mål ikke blåses opp til et stort
     kort. Bare celler som er større enn det, krymper. */
  const W = Math.max(MINI.perRow * MINI.w + (MINI.perRow - 1) * MINI.gx,
    cols * MINI.w + (cols - 1) * MINI.gx) + 2 * MINI.pad;
  const H = Math.max(3 * MINI.h + 2 * MINI.gy,
    rows.length * MINI.h + (rows.length - 1) * MINI.gy) + 2 * MINI.pad;
  const yOff = (H - 2 * MINI.pad - (rows.length * MINI.h + (rows.length - 1) * MINI.gy)) / 2;
  const at = new Map();
  rows.forEach((row, r) => {
    const rowW = row.length * MINI.w + (row.length - 1) * MINI.gx;
    row.forEach((n, j) => at.set(n.id, {
      x: (W - rowW) / 2 + j * (MINI.w + MINI.gx),
      y: MINI.pad + yOff + r * (MINI.h + MINI.gy),
    }));
  });

  let edges = '';
  nodes.forEach(n => n.depends_on.forEach(d => {
    if (!at.has(d)) return;
    const a = at.get(d), b = at.get(n.id);
    const x1 = a.x + MINI.w / 2, y1 = a.y + MINI.h, x2 = b.x + MINI.w / 2, y2 = b.y, my = (y1 + y2) / 2;
    edges += `<path d="M${x1} ${y1}C${x1} ${my} ${x2} ${my} ${x2} ${y2}"/>`;
  }));
  const RX = { fact: 0.6, concept: 2.5, skill: MINI.h / 2 };
  let cards = '';
  nodes.forEach(n => {
    const p = at.get(n.id);
    const type = n.type === 'fact' || n.type === 'concept' ? n.type : 'skill';
    const cls = 'mini-node mini-' + type + (isNodeMastered(n, progress) ? ' mini-mastered' : '');
    cards += `<rect class="${cls}" x="${p.x}" y="${p.y}" width="${MINI.w}" height="${MINI.h}" rx="${RX[type]}"/>`;
  });

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'cell-box-mini');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<g class="mini-edges">${edges}</g>${cards}`;
  return svg;
}

/* Stubbene er den første og den siste biten av selve kanten: kurven kuttes der
   buelengden når STUB.length, så en stubb peker nøyaktig dit den hele kanten
   går. Pilspissen sitter på den frie enden, langs kurven og vekk fra noden.
   `c` er kantens fire kontrollpunkter; `atEnd` gir stubben ved noden som
   avhenger (starter ved noden og går opp mot forutsetningen). */
const STUB = { length: 44, head: 5 };
function bezierPoint(c, t) {
  const u = 1 - t;
  return [0, 1].map(i => u*u*u*c[0][i] + 3*u*u*t*c[1][i] + 3*u*t*t*c[2][i] + t*t*t*c[3][i]);
}
function bezierTangent(c, t) {
  const u = 1 - t;
  return [0, 1].map(i => 3*u*u*(c[1][i]-c[0][i]) + 6*u*t*(c[2][i]-c[1][i]) + 3*t*t*(c[3][i]-c[2][i]));
}
// De Casteljau: kontrollpunktene til delkurven [0, t].
function bezierHead(c, t) {
  const lerp = (a, b) => [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t];
  const a = lerp(c[0], c[1]), b = lerp(c[1], c[2]), d = lerp(c[2], c[3]);
  const e = lerp(a, b), f = lerp(b, d);
  return [c[0], a, e, lerp(e, f)];
}
function edgeStub(c, atEnd) {
  // Snu kurven for stubben ved noden, så begge tilfeller starter ved t = 0.
  const curve = atEnd ? [c[3], c[2], c[1], c[0]] : c;
  const steps = 200;
  let len = 0, t = 1, prev = curve[0];
  for (let i = 1; i <= steps; i++) {
    const pt = bezierPoint(curve, i / steps);
    len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    prev = pt;
    if (len >= STUB.length) { t = i / steps; break; }
  }
  const h = bezierHead(curve, t);
  const [ex, ey] = h[3];
  let [ux, uy] = bezierTangent(curve, t);
  const n = Math.hypot(ux, uy) || 1;
  ux /= n; uy /= n;
  const wing = (a) => {
    const cs = Math.cos(a), sn = Math.sin(a);
    return [ex - STUB.head * (ux * cs - uy * sn), ey - STUB.head * (ux * sn + uy * cs)];
  };
  const [ax, ay] = wing(Math.PI / 6);
  const [bx, by] = wing(-Math.PI / 6);
  return `M ${h[0][0]} ${h[0][1]} C ${h[1][0]} ${h[1][1]}, ${h[2][0]} ${h[2][1]}, ${ex} ${ey} ` +
         `M ${ax} ${ay} L ${ex} ${ey} L ${bx} ${by}`;
}

/* Transitiv reduksjon av én nodes avhengigheter, for tegningen: en
   avhengighet utelates hvis den allerede er en forfar til en av nodens andre
   avhengigheter. Grafen er validert asyklisk før dette kalles. */
function drawnDependencies(node) {
  const deps = node.depends_on.filter(id => nodesById.has(id));
  if (deps.length < 2) return deps;
  const implied = new Set();
  deps.forEach(id => {
    getAllAncestors(nodesById.get(id)).forEach(a => implied.add(a.id));
  });
  return deps.filter(id => !implied.has(id));
}

/* Marker kantene som hører til den åpne noden - både inn og ut - og flytt dem
   bakerst i <svg>, slik at de tegnes OVER resten. SVG har ingen z-index; det er
   dokumentrekkefølgen som bestemmer, så en grønn kant midt i en klase grå
   strek blir usynlig med mindre den flyttes sist. Kalles både fra renderGraph
   og fra openDetail/closeDetail, så valg av node ikke krever ny opptegning. */
function updateEdgeHighlight() {
  const svg = document.getElementById('edges');
  if (!svg) return;
  svg.querySelectorAll('path.edge-selected').forEach(p => p.classList.remove('edge-selected'));
  if (!activeNodeId) return;
  svg.querySelectorAll('path').forEach(p => {
    if (p.dataset.from === activeNodeId || p.dataset.to === activeNodeId) {
      p.classList.add('edge-selected');
      svg.appendChild(p);
    }
  });
}

/* Det lille merket for ett læringsmål: bare koden, i treets farge og form
   (fra 2026-11-11). Uten onToggle er det en visning; med er det en knapp
   som er svak når målet er valgt bort. */
function goalTag(node, on, onToggle) {
  const tag = makeEl(onToggle ? 'button' : 'span', 'goal-tag type-' + node.type, node.goalIndex);
  tag.title = node.goalIndex + ') ' + node.name;
  if (onToggle) {
    tag.type = 'button';
    tag.setAttribute('aria-pressed', String(!!on));
    tag.setAttribute('aria-label', node.goalIndex + ') ' + node.name);
    if (!on) tag.classList.add('off');
    tag.addEventListener('click', () => {
      const now = tag.classList.contains('off');
      tag.classList.toggle('off', !now);
      tag.setAttribute('aria-pressed', String(now));
      onToggle(now);
    });
  }
  return tag;
}

/* Et utvalg som rekke av merker, med en kort etikett foran. Tomt utvalg
   gir «Ingen læringsmål valgt» i rødt. */
function goalTagList(nodes, label) {
  const wrap = makeEl('div', 'goal-tags');
  if (!nodes.length) {
    wrap.appendChild(makeEl('span', 'goal-tags-empty', t('lesson.selectedNone')));
    return wrap;
  }
  if (label) wrap.appendChild(makeEl('span', 'goal-tags-label', label));
  nodes.forEach(n => wrap.appendChild(goalTag(n)));
  return wrap;
}

/* Haken for «mestret»: grå og svak til den trykkes, så grønn. Samme
   komponent på kortet i treet og i læringsmål-lista (fra 2026-11-11, i
   stedet for en avkrysningsboks). En knapp med aria-pressed, så den virker
   med tastatur og skjermleser. */
const CHECK_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5"/><path d="M6 10.3l2.7 2.7 5.4-5.8"/></svg>';
function masteryCheck(on, label, onChange) {
  const b = makeEl('button', 'mastery-check');
  b.type = 'button';
  b.setAttribute('aria-pressed', String(!!on));
  b.setAttribute('aria-label', label);
  b.title = label;
  b.innerHTML = CHECK_SVG;
  b.addEventListener('click', e => {
    e.stopPropagation();
    const now = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(now));
    onChange(now);
  });
  return b;
}

function createNodeElement(node, progress) {
  const el = document.createElement('div');
  el.className = `node-box type-${node.type}`;
  el.style.left = (LAYOUT.padding + node.x) + 'px';
  el.style.top = (LAYOUT.padding + node.y) + 'px';
  /* Fra 2026-11-11 (utkast) er kortet så stort som teksten, opptil
     plassen det har i rutenettet: et kort navn gir et lite kort. Det
     sentreres i plassen sin etter at det er målt (renderGraph), og kantene
     går fra den målte underkanten. */
  el.style.maxWidth = LAYOUT.nodeWidth + 'px';
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
  const text = makeEl('span', 'node-text');
  const indexSpan = document.createElement('span');
  indexSpan.className = 'node-index';
  indexSpan.textContent = node.goalIndex + ') ';
  text.appendChild(indexSpan);
  text.appendChild(document.createTextNode(node.name));
  name.appendChild(text);
  /* Teksten og haken står i hver sin kolonne: koden oppe til venstre,
     haken nederst til høyre, på linje med siste tekstlinje. Haken lå først
     i hjørnet av kortet og havnet oppå den runde kanten på ferdighetskortene,
     og som flyt i teksten hoppet den ned på en egen linje når kortet bare
     var så bredt som teksten (Vidar, 2026-11-11: «ser rar ut»). */
  const entry = progress[node.id] || {};
  name.appendChild(masteryCheck(!!entry.mastered, t('node.markMastered'),
    on => setNodeProgress(node.id, 'mastered', on)));
  topRow.appendChild(name);

  el.appendChild(topRow);

  /* «Del 1» og «FERDIGHET» står ikke på kortet (fra 2026-11-11), bare i
     detaljpanelet. Typen synes gjennom farge og form. */

  /* Et nytt trykk på det markerte kortet avmarkerer det og lukker panelet
     (Vidar, 2026-11-11). */
  el.addEventListener('click', () => {
    if (activeNodeId === node.id) closeDetail(); else openDetail(node.id);
  });

  return el;
}

function createMasteryToggle(labelText, checked, onChange) {
  /* Samme hake som på kortet og i lista (fra 2026-11-11), med teksten ved
     siden av. Teksten kan også trykkes. */
  const wrap = makeEl('div', 'mastered-toggle');
  const check = masteryCheck(checked, labelText, onChange);
  check.classList.add('inline');
  const text = makeEl('button', 'mastered-toggle-text', labelText);
  text.type = 'button';
  text.addEventListener('click', () => check.click());
  wrap.appendChild(check);
  wrap.appendChild(text);
  return wrap;
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
      gradeLevel: t('stage.label', { n: node.stage }),
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
  ensureCellOpen(nodeId); // BARNESKOLEMATTE
  const el = document.querySelector(`.node-box[data-node-id="${nodeId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  el.classList.remove('highlight-pulse');
  void el.offsetWidth; // tving reflow, slik at animasjonen kan starte på nytt ved gjentatte klikk
  el.classList.add('highlight-pulse');
  setTimeout(() => el.classList.remove('highlight-pulse'), 1600);
}

function openDetail(nodeId) {
  ensureCellOpen(nodeId); // BARNESKOLEMATTE
  activeNodeId = nodeId;
  document.querySelectorAll('.node-box').forEach(el => {
    el.classList.toggle('active', el.dataset.nodeId === nodeId);
  });
  document.getElementById('detail-panel').classList.add('open');
  updateEdgeHighlight();
  renderDetail(nodesById.get(nodeId));
}

function closeDetail() {
  activeNodeId = null;
  document.getElementById('detail-panel').classList.remove('open');
  document.querySelectorAll('.node-box.active').forEach(el => el.classList.remove('active'));
  updateEdgeHighlight();
}

function renderDetail(node) {
  if (!node) return;
  const inner = document.getElementById('detail-panel-inner');
  const progress = getProgress();
  const entry = progress[node.id] || {};
  const mastered = isNodeMastered(node, progress);
  const available = isAvailable(node, progress);
  const ancestors = getAllAncestors(node);
  const resources = resourcesByNode.get(node.id) || [];

  inner.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'detail-close';
  closeBtn.className = 'nav-btn';
  closeBtn.textContent = t('closeLower');
  closeBtn.addEventListener('click', closeDetail);
  inner.appendChild(closeBtn);

  const h2 = document.createElement('h2');
  h2.textContent = `${node.goalIndex}) ${node.name}`;
  inner.appendChild(h2);

  const meta = document.createElement('div');
  meta.id = 'detail-meta';
  if (treeUsesAids()) { const tag = makeAidsTag(node); if (tag) meta.appendChild(tag); }
  /* Typen står i et lite merke med typens egen farge og form, som et
     læringsmål ellers i treet (fra 2026-11-11). */
  const typeBadge = document.createElement('span');
  typeBadge.className = 'type-chip goal-tag type-' + node.type;
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

  /* Ledeteksten står FORAN beskrivelsen, ikke i den: «Eleven kan:» på egen
     linje, og under den det noden faktisk krever. Se learnerLeadIn(). */
  const descLines = descriptionLines(node.description);
  if (descLines.length) {
    const lead = document.createElement('p');
    lead.id = 'detail-lead';
    lead.textContent = learnerLeadIn(node.type);
    inner.appendChild(lead);
  }

  const desc = document.createElement('div');
  desc.id = 'detail-desc';
  /* Termen i halvfeit, definisjonen etter - likt enten noden definerer ett
     begrep eller fire. Flere blir en punktliste, fordi de da er sidestilte;
     én blir et avsnitt, fordi et kulepunkt alene bare er et kulepunkt
     alene. Typografien er den samme i begge tilfeller. */
  const list = descLines.length > 1 ? document.createElement('ul') : null;
  if (list) list.className = 'definition-list';
  descLines.forEach(line => {
    const holder = document.createElement(list ? 'li' : 'p');
    const parts = node.type === 'fact' ? factItem(line) : definitionTerm(line);
    if (parts) {
      const term = document.createElement('strong');
      term.textContent = parts.term;
      holder.appendChild(term);
      holder.appendChild(document.createTextNode(': ' + parts.rest));
    } else {
      holder.textContent = line;
    }
    (list || desc).appendChild(holder);
  });
  if (list) desc.appendChild(list);
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
  const showLabel = swapLabel(showBtn, [t('detail.show'), t('detail.hide')]);
  actions.appendChild(showBtn);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  const copyLabel = swapLabel(copyBtn, [t('detail.copy'), t('copied')]);
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
    showLabel(visible ? 1 : 0);
  });

  copyBtn.addEventListener('click', () => {
    trackCopy('node', { node_id: node.id, node_title: node.name || null, node_topic: node.topic || null });
    navigator.clipboard.writeText(instructionText).then(() => {
      copyLabel(1);
      setTimeout(() => copyLabel(0), 1500);
    }).catch(() => {
      textarea.classList.add('visible');
      textarea.select();
    });
  });

  /* Én overskrift per gruppe, i den rekkefølgen gruppene først står i
     fila. En rad uten gruppe havner under «Ressurser». */
  const groups = new Map();
  resources.forEach(res => {
    const key = res.group || t('detail.resources');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(res);
  });
  groups.forEach((items, heading) => {
    items.sort(compareResources);
    const h3 = document.createElement('div');
    h3.className = 'badge-type';
    h3.style.margin = '1.4rem 0 0.4rem';
    h3.textContent = heading;
    inner.appendChild(h3);

    const ul = document.createElement('ul');
    ul.className = 'resource-list';
    items.forEach(res => {
      const li = document.createElement('li');
      if (res.url) {
        const a = document.createElement('a');
        a.href = res.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = res.label;
        li.appendChild(a);
      } else {
        li.textContent = res.label;
      }
      ul.appendChild(li);
    });
    inner.appendChild(ul);
  });
}


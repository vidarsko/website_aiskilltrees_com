'use strict';

/* ------------------------------------------------------------------ */
/* Delt motor for ferdighetstre-appene.                                */
/*                                                                      */
/* Denne filen inneholder ALT som er likt på tvers av fag: CSV-parsing, */
/* DAG-validering, kolonne/lagdelt layout-algoritme, rendering,         */
/* localStorage-progresjon og komposisjon av KI-instruks.               */
/*                                                                      */
/* Alt som er spesifikt for ett fag (lagringsnøkkel, emne-rekkefølge,   */
/* KI-instruksmal, hjelpemiddel-tekst, evt. layout-justeringer) hentes  */
/* fra window.FT_CONFIG, som hvert fags config.js må definere FØR denne */
/* filen lastes. Se ferdighetstre/instruks.md for kravene til config. */
/* ------------------------------------------------------------------ */

if (!window.FT_CONFIG) {
  throw new Error('FT_CONFIG mangler. Last inn fagets config.js før engine.js.');
}

const CONFIG = window.FT_CONFIG;

const STORAGE_KEY = CONFIG.storageKey;

// Noen fag (f.eks. fag uten skriftlig del1/del2-eksamen) har ikke noe
// meningsfullt "hjelpemiddel"-konsept. Sett CONFIG.showHjelpemiddel = false i
// fagets config.js for å skjule D1/D2-merkelappen og hjelpemiddel-avsnittet i
// KI-instruksen helt. Default (udefinert eller true) beholder eksisterende
// oppførsel uendret for fag som allerede bruker feltet.
const SHOW_HJELPEMIDDEL = CONFIG.showHjelpemiddel !== false;

const LAYOUT = Object.assign({
  nodeWidth: 210,
  nodeHeight: 92,
  hGap: 34,
  vGap: 96,
  columnGap: 56,
  columnLabelHeight: 44,
  maxNodesPerRow: 3, // bryt en emne-rad i flere rader nedover når den blir bredere enn dette
  padding: 20,
  barycenterPasses: 4,
}, CONFIG.layoutOverrides || {});

// Rekkefølge på emne-kolonnene i kartet, venstre til høyre. Emner som finnes i
// noder.csv men ikke i denne listen havner til slutt (alfabetisk), slik at nye
// emner i CSV-en aldri forsvinner selv om noen glemmer å oppdatere denne listen.
const TOPIC_ORDER = CONFIG.topicOrder || [];

// Generell mal for KI-instruksen. Rollebeskrivelsen, samtalereglene og
// vurderings-/mestringsdelen er identiske uansett fag, så de er hardkodet
// her. Faget bidrar kun med `courseName` (hvilket fag/kurs dette er) og
// valgfritt `formuleringsfokus` (fagspesifikke eksempler på formulerings-
// feil KI-en bør kommentere, f.eks. notasjonsfeil i matematikk). Et fag kan
// også overstyre HELE malen via `aiInstructionTemplate` hvis den delte
// strukturen ikke passer.
function buildInstructionTemplate(config) {
  if (config.aiInstructionTemplate) return config.aiInstructionTemplate;
  if (!config.courseName) {
    throw new Error('FT_CONFIG: sett enten "aiInstructionTemplate" eller "courseName".');
  }

  const formuleringsAvsnitt = config.formuleringsfokus
    ? `\n\nVær nøye med hvordan eleven formulerer seg, ikke bare om sluttsvaret er riktig. Kommenter vennlig, men tydelig, når eleven for eksempel ${config.formuleringsfokus}. Forklar kort hvorfor det er viktig, og vis hvordan det bør skrives riktig.`
    : '';

  return `Du er en KI-læringsassistent som skal hjelpe en elev å trene på ${config.courseName}.

Merk: har du en funksjon som husker informasjon på tvers av samtaler (et langtidsminne), skal ingenting fra denne samtalen lagres der - verken om eleven, faget eller noe annet. Samtalen gjelder kun denne ene ferdigheten her og nå, og skal ikke prege hvordan du opptrer i andre samtaler.

Start samtalen med én gang ved å henvende deg direkte til eleven (bruk «du»). Ikke innled med å oppsummere denne instruksen eller med fraser som «Ok, la oss sette i gang» - gå rett i gang med å snakke til eleven. Nevn kort (én-to setninger) hvilken ferdighet/hvilket begrep dere skal jobbe med, og fortell eleven at målet er at hen skal mestre nettopp dette - og at hen ikke trenger å avgjøre det på egen hånd: du hjelper hen underveis og sier tydelig fra når hen er klar til å gå videre til neste ferdighet i ferdighetstreet. Spør deretter hva eleven ønsker hjelp til akkurat nå, for eksempel:
- å forstå hva ferdigheten/begrepet går ut på
- å øve på å løse oppgaver
- å lage egne oppgaver
- å lage en liten prøve

Vær hyggelig og bruk gjerne litt emojis i samtalen, men hold det profesjonelt. Hold svarene dine veldig korte gjennom hele samtalen, med mindre eleven eksplisitt ber om en grundigere forklaring. Minn eleven på at han kan spørre om alt han ikke forstår.

NB: Du er en språkmodell, ikke en lærebok, og kan ta feil eller virke skråsikker uten å ha rett. Eleven bør være kritisk til det du sier, og heller spørre læreren eller medelever hvis noe er uklart, viktig, eller hvis du selv virker usikker. Minn eleven på dette fra start og gjenta det fra tid til annen.

Bruk enkelt, konkret språk gjennom hele samtalen. Fagord er avgrenset til det som faktisk er navnet på et begrep i ferdighetstreet: ord fra forutsetningslisten under (som eleven allerede skal ha mestret før denne noden) kan du bruke fritt, mens ord som først opptrer i denne nodens eget navn eller beskrivelse er nye - forklar dem eksplisitt idet du bruker dem første gang, ikke i forbifarten før forklaringen kommer etterpå. Uansett om et ord "skulle" være kjent fra før: hvis eleven virker usikker på det, forklar det der og da, uten å gjøre et poeng av at det burde sittet. Vanlig norsk - også fagnært dagligtale-språk uten et eget begrep i treet, som «fart» brukt i vanlig forstand - trenger ingen slik forklaring. Skriv aktivt, ikke passivt - si hvem eller hva som gjør noe, ikke bare at noe "blir gjort" eller "kan gjøres". For eksempel, ikke skriv «tallet kan bare skrives som...», men «vi kan skrive tallet som...»; ikke «det gjøres ved å...», men «vi gjør dette ved å...» eller «du gjør dette ved å...». Når eleven ber om en forklaring, ikke start svaret med en presis, generell definisjon eller påstand - det er lett å henge seg opp i vanskelige ord før man skjønner poenget. Led eleven inn i det i stedet: sett det i en konkret sammenheng eller vis et enkelt eksempel med ekte tall først, og la selve definisjonen/regelen/begrepsnavnet komme som en naturlig konklusjon etterpå, ikke som en åpning. For eksempel, ikke start med «Ampere er SI-enheten for elektrisk strøm, definert som ladning per tidsenhet», men noe sånt som: «Se for deg at du måler hvor mye ladning som passerer gjennom en ledning. På 3 sekunder måler du at 6 Coulomb har passert. Da har det gått 6/3 = 2 Coulomb per sekund - det kaller vi 2 ampere. Ampere er altså enheten vi bruker for...». Samme prinsipp i matematikk: start gjerne med et konkret regnestykke med tall (f.eks. «Se for deg at du skal gange 2 med seg selv 6 ganger: 2×2×2×2×2×2. Det blir fort tungvint å skrive - derfor skriver vi 2⁶ i stedet. Dette kaller vi en potens.») fremfor en generell/abstrakt påstand om regelen. Tilpass hvor avansert språk og hvor mye forkunnskap du forutsetter etter nivået på faget - jo høyere nivå, jo mer kan du forutsette - men vær aldri fordummende eller nedlatende.

Tilpass vanskelighetsgraden underveis basert på hvordan eleven presterer: gjør det lettere om eleven strever, og vanskeligere om eleven mestrer lett. Gi eleven fasit og en kort vurdering av svaret/løsningen etter hvert forsøk, med konkret begrunnelse for hva som er riktig og hva som eventuelt mangler.${formuleringsAvsnitt}

Når du gir eksempler, vis gjerne flere typer: noen få vanlige, klare eksempler (de mest typiske), et eksempel som ligger helt i grenseland av definisjonen (der elever ofte blir usikre eller uenige - forklar hvorfor det likevel er innenfor), et eksempel som ligner eller ofte forveksles med begrepet, men som ikke er et eksempel på det, og gjerne et par eksempler som ser nesten like ut, men der bare det ene faktisk er et gyldig eksempel. Ikke bruk fagord som «prototype-eksempler», «grenseeksempler» eller «minimalt forskjellige par» når du snakker til eleven - beskriv dem heller med vanlige ord, for eksempel «Her er to vanlige eksempler», «Her er et eksempel som ligger helt i grenseland - hva tror du, er dette et eksempel eller ikke?», eller «Her er to eksempler som ligner veldig på hverandre, men bare det ene er egentlig et eksempel på dette. Kan du se hvorfor?». For hvert eksempel, forklar tydelig hvorfor det er et gyldig eksempel eller ikke.

Der det passer, kan du gjerne bruke en velegnet analogi for å forklare et poeng. Si i så fall tydelig fra at analogien ikke er perfekt - den er bare en mental støtte for å få tak i ideen, ikke en nøyaktig beskrivelse av det faglige innholdet.

Hjelp eleven å vurdere om hen mestrer ferdigheten: forklar tydelig hva det vil si å mestre nettopp denne ferdigheten, og si tydelig fra når du vurderer at eleven mestrer den godt og konsekvent, slik at eleven vet at hen kan gå videre til neste ferdighet i ferdighetstreet.

Gjennom hele samtalen har du noen grunnprinsipper å holde i bakhodet og minne eleven på med jevne mellomrom - ett om gangen, kort (typisk én setning), aldri som en samlet oppramsing og ikke i hver eneste melding. Prioriter det første punktet foran de andre hvis du må velge:
- Det finnes mange ulike KI/språkmodeller, av til dels svært ulik kvalitet - eleven bør ikke anta at alle gir like gode eller like pålitelige svar.
- Du kan tilby å teste eleven underveis og hjelpe hen å vurdere egen innsats, som ett av flere ting eleven kan be om.
- Hvis fenomenet ferdigheten/begrepet handler om egner seg godt for det, kan du tilby å lage en liten, selvstendig HTML-simulering (ferdig HTML/CSS/JS i én kodeblokk, ingen eksterne avhengigheter) som illustrerer det. Bruk skjønn - tilby dette kun når det faktisk gir noe pedagogisk utover forklaring i tekst, ikke som en fast rutine. Husk at eleven kan sitte med en annen KI-modell enn deg som ikke kan kjøre/vise frem kode på samme måte - nevn i så fall kort at eleven kan trenge å lime koden inn et annet sted (f.eks. lagre den som en .html-fil og åpne den i nettleseren) for å se den.
- Ferdighetstreet har også en egen «Lag prøve av mestrede ferdigheter»-knapp (nederst på siden) som lager en KI-instruks for en hel prøve på tvers av alt eleven har krysset av som mestret, ikke bare denne ene noden - minn eleven på at den finnes. Å stadig lage seg egne prøver og teste seg selv jevnlig, etter hvert som flere ferdigheter krysses av, er noe av det mest effektive eleven kan gjøre for å sikre at hen faktisk har lært stoffet - ikke bare rett før eksamen.
- Ferdighetstreet er ikke nødvendigvis fullstendig - det kan mangle ferdigheter/begreper, eller læreren kan vektlegge noe annerledes. Å krysse av alt i treet er derfor ikke en garanti for at eleven kan alt hen trenger til faget - minn eleven på å sjekke med læreren at treet faktisk dekker det som forventes.`;
}

const AI_INSTRUCTION_TEMPLATE = buildInstructionTemplate(CONFIG);

// Motivasjonsknapp («Hvorfor skal jeg lære matte?»): en egen, generell
// KI-instruks (ikke knyttet til noen enkelt node) for en kort, empatisk
// samtale om hvorfor det er verdt å lære faget i det hele tatt - ikke bare
// hvorfor jevn øving lønner seg (se buildMotivationInstructionTemplate for
// begrunnelsen for dette skillet). Kun matematikkfagene setter
// CONFIG.showMotivationButton = true - default (udefinert) skjuler knappen.
const SHOW_MOTIVATION_BUTTON = CONFIG.showMotivationButton === true;

// Delt mal for motivasjonssamtalen. Prinsippene (ett spørsmål/argument om
// gangen, korte svar, la eleven oppdage poenget selv) er identiske uansett
// fag, så malen er hardkodet her akkurat som buildInstructionTemplate. I
// motsetning til buildInstructionTemplate settes IKKE courseName inn - denne
// knappen finnes foreløpig kun for matematikkfagene (se
// CONFIG.showMotivationButton), og "matte" i løpende tekst leser mer naturlig
// enn den formelle courseName-strengen (f.eks. "matematikk 9. trinn (norsk
// ungdomsskole)") midt i en analogi. Funksjonen tar derfor ingen parametre,
// og teksten er dermed identisk for alle matematikkfag.
function buildMotivationInstructionTemplate() {
  return `Du er en KI-samtalepartner som skal hjelpe en elev å selv oppdage hvorfor det er verdt å lære matte - ikke bare hvorfor jevn øving fungerer bedre enn å pugge rett før en prøve, men selve grunnen til at faget er verdt å lære i det hele tatt. Gjennom en kort, varm og empatisk samtale, ikke en forelesning.

Merk: har du en funksjon som husker informasjon på tvers av samtaler (et langtidsminne), skal ingenting fra denne samtalen lagres der - verken om eleven eller noe annet. Samtalen gjelder kun akkurat nå, og skal ikke prege hvordan du opptrer i andre samtaler.

Kjernebudskapet samtalen skal bygge fram mot, gjennom elevens egne svar (ikke server dette rett ut med en gang - det er poenget eleven selv skal komme fram til): grunnen til å lære matte nå er at faget bygger på seg selv, slik at det eleven lærer nå gjør veien videre lettere i stedet for tyngre - og at alle kan få det til, uansett hvor vanskelig det kjennes akkurat nå, med riktig trening over tid.

Grunnprinsipp: still ett spørsmål eller argument av gangen, og la eleven svare før du sier noe mer. Bygg videre på det eleven faktisk svarer, ikke et fast manus - målet er at eleven skal oppdage poenget selv, ikke bli fortalt det. Hold svarene dine korte gjennom hele samtalen, maks 2-4 setninger per tur - mess aldri opp flere argumenter i samme svar, ett argument, én gang, så tilbake til eleven. Avslutt hver eneste melding din med et spørsmål til eleven, slik at samtalen alltid går videre - ikke la en tur ende uten at eleven har noe å svare på, heller ikke den siste, oppsummerende meldingen.

Vær varm og empatisk, aldri belærende eller formanende. Snakk med eleven, ikke til eleven. Bruk gjerne litt emoji underveis for å holde tonen lett og uformell, men ikke i hver eneste setning. Anerkjenn at matte kan oppleves vanskelig eller ubehagelig, før du kommer med råd. Bruk enkelt språk og hverdagsanalogier, ikke fagterminologi om selve læringen (unngå ord som "spacing effect" eller "kognitiv belastning" - bruk analogiene under i stedet). Dette gjelder mer enn bare fremmedord: unngå også helt vanlige norske ord som likevel er sjeldne i muntlig tale, bokmål-aktige eller litt for voksne (f.eks. "vaklende", "fundament", "ferdigheter", "motivasjon") - før du bruker et ord, sjekk om det er noe du faktisk ville sagt høyt til en venn, og bytt det ut med et enklere hvis ikke. Si heller rett ut hva eleven kan eller får til, med de enkleste ordene som finnes.

Start samtalen varmt, men kort - maks to-tre setninger, og IKKE avslør kjernebudskapet over med én gang: anerkjenn at eleven lurer på hvorfor hen i det hele tatt skal lære matte, og at det er forståelig - mange synes faget er vanskelig, og da er det lett å bli demotivert. Still deretter ett kort spørsmål om eleven selv, ikke om studieteknikk - for eksempel «Synes du matte er vanskelig?» eller «Er det vanskelig å konsentrere seg når du skal jobbe med det?». Velg ett spørsmål, ikke flere på rad.

Fortsett gjerne å bli litt kjent med eleven utover i samtalen, og bruk det du lærer videre - for eksempel om hen synes hen er flink, når faget er gøy, eller om hen er god til å jobbe jevnt med ting generelt. Still høyst ett slikt spørsmål om gangen - ikke gjør samtalen til et intervju.

Et spørsmål du gjerne kan bruke tidlig: spør hva eleven er god på - kan være idrett, et instrument, gaming, tegning eller noe helt annet. Bruk svaret aktivt resten av samtalen: trekk sammenligninger mellom hvordan eleven ble god på akkurat den tingen (øvde jevnt, tålte at det var vanskelig i starten, brukte tid på det) og hvordan det samme gjelder for matte. Et konkret grep: minn eleven på at det var forvirrende med mange nye ord og ting den aller første gangen hen prøvde det hen er god på nå - noe sånt som «Første gangen du [holdt på med den tingen], var det sikkert mange nye ord og litt forvirrende? Det er fordi det tar tid å skjønne hva ting betyr og hvordan de henger sammen. Etter hvert blir det mindre forvirrende, fordi du kan mer.» Vis så at det samme gjelder matte - de nye ordene og reglene kjennes forvirrende nå, men blir tydeligere jo mer eleven kan. Bruk gjerne denne tingen eleven selv har nevnt som eksempel når du henter fram analogiene under også, i stedet for generiske eksempler.

Du har tre typer argumenter å spille på i denne samtalen: (1) kjernebudskapet over, om at faget bygger på seg selv - det samtalen primært skal jobbe seg fram mot; (2) argumentene rett under her, om hvorfor jevn øving lønner seg og at alle kan få det til; og (3) et par egne argumenter om hvorfor matte er viktig på lengre sikt i eget liv, beskrevet til slutt i denne lista sammen med når de skal brukes - de er sjeldnere i bruk, og skal aldri ta over for de to første.

Type 2 - argumenter for hvorfor det lønner seg å øve, og hvorfor alle kan få det til: bruk ett eller to om gangen, tilpasset det eleven faktisk sier, aldri hele lista i én tur. Sikt likevel mot å komme innom flere av dem i løpet av hele samtalen, spredt utover flere turer etter hvert som samtalen utvikler seg - ikke server dem samlet, og ikke stopp ved bare ett. Snakk konkret om hva eleven kan og får til, ikke abstrakt, og formuler deg aktivt med eleven selv som subjekt ("du") der du kan, ikke upersonlig med "man":
- Muskelanalogien: å lære er som å trene en muskel - du blir ikke sterk av å lese om løfting, men av å løfte litt og ofte over tid. Hjernen din bygger seg opp ved at du bruker den gjentatte ganger, ikke ved at noen forteller deg noe én gang.
- Gym-analogien: du kommer ikke i form av én lang treningsøkt rett før et løp. Øver du jevnt gjennom uka, får du bedre resultat enn om du presser alt inn kvelden før en prøve - selv om det kan føles som du "gjør nok" da.
- Når noe sitter av seg selv: kan du for eksempel gangetabellen utenat, trenger du ikke bruke krefter på å regne den ut hver gang - da får du plass i hodet til det som faktisk er vanskelig og interessant i oppgaven.
- Testeffekten: jo flere ganger du henter fram noe fra hukommelsen, jo bedre sitter det. Det er derfor prøver og gjentatte oppgaver faktisk ER læring, ikke bare en sjekk på om du har lært det. Henter du fram noe du nesten har glemt, styrker det hukommelsen mer enn å lese det på nytt.
- Lego-analogien: matte bygger på seg selv, akkurat som et legoslott - du må sette de nederste klossene først, ellers rakner det når du bygger videre oppå. Lærer du det du møter først skikkelig nå, blir det du bygger senere både lettere og mer stabilt - det er selve svaret på hvorfor det er verdt å lære matte nå, ikke bare "nyttig en gang i fremtiden".
- Å trene opp fokus: når du øver på å jobbe med noe over lengre tid, blir du samtidig bedre til å holde fokus - like nyttig som det å kunne regne. Det er helt forståelig at du mister fokus innimellom, særlig på grunn av mobilen - den er laget for akkurat det. Et forsøk viste at elever fikk til mer i matte når de la mobilen utenfor klasserommet under timen; jo mer du øver på å jobbe uten avbrudd, jo lettere blir det - og dette hjelper deg langt utover matte også.
- Det er helt greit å synes det er kjedelig: noen synes matte er gøy, men du trenger slett ikke være en av dem. Innimellom gjør du kjedelige ting fordi de er bra for deg - som å holde deg i form eller spise sunt. Tenk på det som en treningsøkt: du jobber konsentrert en stund, og tar en ordentlig pause når du har pause. Ofte snur det også: noe du synes er kjedelig kan plutselig bli gøy den dagen du får det til - det "oi, jeg fikk det til!"-øyeblikket er verdt å stoppe opp og kjenne på.
- Empati og håp: mange synes matte er vanskelig - det er helt normalt, og ikke et tegn på at du "ikke er flink". Du kan få det til, med riktig trening, akkurat som alle andre. Bruk dette tidlig i samtalen eller når eleven virker motløs - ikke bare som noe du sier for å trøste helt til slutt.

Type 3 - argumenter for hvorfor matte er viktig på lengre sikt, i eget liv: bruk KUN hvis eleven selv bringer opp en innvending i retning av «når skal jeg noen gang få bruk for dette i det virkelige liv» eller lignende - ikke noe du tar initiativ til selv. Nevn høyst ett av dem, én gang, og gå så tilbake til type 1 og 2 - dette skal aldri bli hovedpoenget i samtalen eller noe du blir hengende fast i. Hold argumentet personlig, ikke samfunnsnyttig ("dette hjelper deg", ikke "dette er bra for samfunnet"):
- Å skjønne tall og prosent gir deg kontroll over egne penger og avtaler som voksen - du ser selv om noe er en god avtale, i stedet for bare å stole på at andre er ærlige med deg. For eksempel skjønner du hva en forsikringsselger egentlig tilbyr deg, eller hvordan du og de du bor sammen med kan dele utgifter rettferdig.

Samtalen skal ha en retning, ikke bare fortsette spørsmål for spørsmål i det uendelige - prøv å ende opp med noe dere er enige om mot slutten, som knytter seg til kjernebudskapet over (hvorfor det er verdt å lære faget, ikke bare hvorfor øve jevnt). Speil gjerne tilbake det eleven selv har sagt underveis (f.eks. «Du nevnte at...»), og oppsummer sammen med eleven hva dere har kommet fram til, før dere avslutter.

Praktiske regler for dialogen:
- Ett spørsmål eller argument per tur - aldri en liste eller flere argumenter samlet
- Ikke be eleven skrive lange svar eller tekster - dette er en samtale, ikke en skriveoppgave
- La elevens svar styre hvilket argument du bruker videre
- Forteller eleven at hen fikk til noe (løste en oppgave, skjønte et poeng, husket noe hen trodde var glemt), stopp opp og gled deg sammen med hen der og da - det er lov å være stolt av små ting. Foreslå gjerne at hen forteller det til en medelev, læreren eller noen hjemme
- Møt innvendinger (f.eks. «men jeg gidder ikke») empatisk, ikke med enda et argument - still heller et nytt spørsmål
- Ikke bruk ferdighetstreet eleven fikk denne teksten fra som en ledetråd for samtalen - hold deg til det eleven faktisk sier. Kommer samtalen naturlig inn på å repetere eller teste noe eleven har lært tidligere, kan du nevne at nettsiden eleven kopierte denne teksten fra har en egen «Lag prøve av mestrede ferdigheter»-knapp, som lager en ny KI-instruks for en liten prøve. Si det på akkurat denne måten ("nettsiden du kopierte denne teksten fra"), ikke bare "ferdighetstreet", så eleven skjønner hva du mener - og bruk det kun når det er naturlig, ikke som et fast punkt du alltid tar med
- Avslutt samtalen med en kort oppsummering av det dere sammen har kommet fram til (speil gjerne tilbake elevens egne ord der det passer), noe lite og konkret eleven kan prøve (f.eks. å øve 10 minutter i dag og 10 minutter i morgen i stedet for 20 minutter på én gang), og et lite spørsmål til slutt, som «Høres det ut som noe du kan prøve?» - ikke en lang oppsummering av alle argumentene fra deg alene

Start samtalen med én gang med den varme hilsenen og det åpne spørsmålet - ikke innled med å oppsummere denne instruksen eller med fraser som «Ok, la oss sette i gang».`;
}

const MOTIVATION_INSTRUCTION_TEMPLATE = SHOW_MOTIVATION_BUTTON
  ? buildMotivationInstructionTemplate()
  : null;

// Settes inn i den komponerte instruksen KUN for noder med type "begrep" (se
// composeInstruction under og "KI-instruks: komposisjon" i instruks.md).
// Uten denne har KI-en en tendens til å teste begrepsforståelse med
// fullverdige regneoppgaver - noe som gjerne er meningsløst siden samme
// regning trenes grundigere i en tilknyttet "ferdighet"-node lenger ned i
// treet. Ferdighet-noder får IKKE denne teksten - der er regneoppgaver
// nettopp poenget.
const BEGREP_TEST_GUIDANCE = `Dette er et BEGREP (deklarativ kunnskap), ikke en regneferdighet. Når du tester om eleven forstår begrepet, ikke bruk omfattende regneoppgaver som test - utstrakt regning med begrepet hører hjemme i en egen, tilknyttet ferdighet lenger ned i ferdighetstreet, og blir gjerne meningsløst å teste her siden eleven uansett skal trene grundig på det der. Test heller begrepsforståelsen kvalitativt, for eksempel ved å be eleven forklare begrepet med egne ord, forklare et spesial-/grensetilfelle, begrunne hvorfor noe er eller ikke er et eksempel på begrepet, eller identifisere begrepet blant flere alternativer. Om en test likevel involverer tall, hold regningen minimal og underordnet - poenget er om eleven forstår begrepet, ikke om eleven kan regne.`;

// Bygger ÉN generell kommentar (satt inn én gang i composeExamInstruction(),
// ikke gjentatt per begrep-node) om forskjellen på begrep og ferdighet - se
// BEGREP_TEST_GUIDANCE over for bakgrunnen. Kalles KUN når utvalget av
// mestrede noder inneholder minst én node av type "begrep". Uten denne ber
// prøve-instruksen KI-en lage "typiske eksamensoppgaver" for absolutt alle
// punktene i lista, uansett type - noe som for en begrep-node (kun
// dokumentert mestret på forståelsesnivå) fort blir en fullverdig
// regneoppgave langt over det som faktisk er bekreftet mestret. Teksten
// forgrener seg på sammensetningen av utvalget: består det KUN av
// begrep-noder skal hele prøven være kvalitativ (det finnes ingen
// ferdighet-oppgave å legge et begrep inn i som deloppgave), mens en
// blanding skal vektes gradvis - jo større andel begrep-noder i utvalget,
// desto mer av prøven skal være kvalitativ fremfor regneoppgaver.
function buildExamBegrepGuidance(nodes) {
  const allBegrep = nodes.every(n => n.type === 'begrep');
  const intro = `Punktene i lista over er merket [begrep] eller [ferdighet]. [ferdighet]-punkter skal testes med fullverdige oppgaver, akkurat slik du normalt ville gjort på en skriftlig prøve. [begrep]-punkter skal derimot ALDRI bli en fullverdig regneoppgave alene - test heller begrepsforståelsen kvalitativt, for eksempel ved å be eleven forklare begrepet med egne ord, begrunne om noe er et eksempel på begrepet, identifisere begrepet blant flere alternativer, eller forklare et spesial-/grensetilfelle.`;
  if (allBegrep) {
    return `${intro} Alle punktene i dette utvalget er [begrep]-punkter - hele prøven skal derfor bestå av kvalitative oppgaver, ingen regneoppgaver.`;
  }
  return `${intro} Vekt oppgavemiksen etter sammensetningen av utvalget: jo større andel [begrep]-punkter relativt til [ferdighet]-punkter, desto større andel av prøven skal være kvalitative oppgaver fremfor regneoppgaver. Et [begrep]-punkt kan også inngå som en liten, underordnet deloppgave i en oppgave som ellers tester et tilknyttet [ferdighet]-punkt.`;
}

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
/* Oppstart                                                             */
/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', init);

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
  zoomOutBtn.setAttribute('aria-label', 'Zoom ut');
  zoomOutBtn.title = 'Zoom ut';
  zoomOutBtn.addEventListener('click', () => zoomBy(1 / 1.25));
  group.appendChild(zoomOutBtn);

  const btn = document.createElement('button');
  btn.id = 'fit-view-btn';
  btn.type = 'button';
  btn.textContent = '⤢';
  btn.setAttribute('aria-label', 'Vis hele treet');
  btn.title = 'Vis hele treet (Ctrl+scroll for å zoome)';
  btn.addEventListener('click', fitToView);
  group.appendChild(btn);

  const zoomInBtn = document.createElement('button');
  zoomInBtn.id = 'zoom-in-btn';
  zoomInBtn.type = 'button';
  zoomInBtn.textContent = '+';
  zoomInBtn.setAttribute('aria-label', 'Zoom inn');
  zoomInBtn.title = 'Zoom inn';
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
  btn.textContent = 'Vis alle læringsmål';
  btn.title = 'Vis en systematisk liste over alle læringsmål, sortert etter tema';
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
  toggle.setAttribute('aria-label', 'Meny');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.title = 'Meny';
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
  btn.textContent = 'Hvorfor skal jeg lære matte?';
  btn.title = 'Kopier en KI-instruks for en samtale om hvorfor det er verdt å lære faget';
  btn.addEventListener('click', () => {
    const original = btn.textContent;
    navigator.clipboard.writeText(MOTIVATION_INSTRUCTION_TEMPLATE).then(() => {
      btn.textContent = 'Kopiert!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    }).catch(() => {
      window.prompt('Kunne ikke kopiere automatisk - kopier teksten under manuelt:', MOTIVATION_INSTRUCTION_TEMPLATE);
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
function setupHelpButton() {
  ensureActionMenu(); // sikrer at #menu-wrap finnes i verktøylinjen
  const menuWrap = document.getElementById('menu-wrap');
  if (!menuWrap) return;

  const btn = document.createElement('button');
  btn.id = 'help-btn';
  btn.type = 'button';
  btn.textContent = '?';
  btn.setAttribute('aria-label', 'Hvordan bruker jeg denne siden?');
  btn.title = 'Hvordan bruker jeg denne siden?';
  btn.addEventListener('click', () => {
    closeActionMenu();
    openHelpModal();
  });
  menuWrap.insertAdjacentElement('afterend', btn);
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
  h2.textContent = 'Hvordan bruker jeg denne siden?';
  header.appendChild(h2);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn secondary';
  closeBtn.textContent = '✕ Lukk';
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

  helpSection(body, 'Menyknappen',
    'Trykk på ☰-knappen nederst til venstre, ved siden av denne hjelpeknappen, for å åpne en meny med tilbake-lenke, lys/mørk modus, fremgangen din og de andre knappene på siden - forklart under.');

  helpSection(body, 'Kartet',
    'Kartet viser hvordan ferdigheter og begreper bygger på hverandre, fra det mest grunnleggende til venstre til det mest sammensatte til høyre. Boksene du ikke har forutsetningene for ennå, ser du som grå og låste - huk av dem du mangler først. Dra for å panorere kartet, og bruk +/- eller musehjulet for å zoome.');

  helpSection(body, 'Klikk på en boks',
    'Når du klikker på en boks, får du opp forutsetningene, en full beskrivelse av læringsmålet, og en KI-instruks du kan kopiere og lime inn i en KI-chat for å trene på nettopp den ferdigheten. Marker boksen som mestret når du kan den - fremgangen lagres i nettleseren din, og du kan fjerne markeringen igjen når du vil.');

  helpSection(body, '«Vis alle læringsmål»',
    'Når du trykker på denne knappen, får du en samlet, systematisk liste over alle læringsmålene i faget, sortert etter tema - nyttig når du vil ha oversikt eller lese gjennom hele lista uten å klikke deg gjennom kartet. Hvert læringsmål viser status: ✓ betyr at du har markert det som mestret, ◇ betyr at du har alt du trenger for å lære det nå, og ⊘ viser hvilke læringsmål du bør ta først (med koden deres, f.eks. C1).');

  helpSection(body, '«Lag undervisningsopplegg» (for lærere)',
    'Nederst i «Vis alle læringsmål» kan lærere huke av de læringsmålene neste økt skal dekke, sette lengden på økta, og få en KI-instruks for et ferdig undervisningsopplegg: starter, gjennomgang etter example-problem pair-modellen, diagnostiske spørsmål og gjenhenting til slutt. Avkrysningene for mestret er dine egne, i din egen nettleser - de viser hva du selv har vært gjennom, ikke hva klassen faktisk kan.');

  helpSection(body, '«Lag prøve av mestrede ferdigheter»',
    'Når du trykker på denne knappen, får du en KI-instruks for en prøve som dekker et utvalg av det du allerede har markert som mestret. Lim den inn i en KI-chat for å teste deg selv på tvers av flere ferdigheter samtidig.');

  if (SHOW_HJELPEMIDDEL) {
    helpSection(body, 'D1 / D2',
      'Merkelappen på en boks viser deg hvilken del av eksamen ferdigheten hører til - del 1 (uten hjelpemidler) eller del 2 (med hjelpemidler), eller begge.');
  }

  if (SHOW_MOTIVATION_BUTTON) {
    helpSection(body, '«Hvorfor skal jeg lære matte?»',
      'Når du trykker på denne knappen, får du en KI-instruks for en kort samtale om hvorfor det er verdt å lære faget i det hele tatt. Lim den inn i en KI-chat hvis du trenger et dytt i riktig retning.');
  }
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
      const lines = nodes.map(n => `${n.goalIndex}) ${n.navn}`).join('\n');
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
  h2.textContent = 'Alle læringsmål';
  header.appendChild(h2);

  const actions = document.createElement('div');
  actions.id = 'goal-index-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = 'Kopier alle';
  copyBtn.addEventListener('click', () => {
    const text = composeGoalIndexText();
    navigator.clipboard.writeText(text).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Kopiert!';
      setTimeout(() => { copyBtn.textContent = original; }, 1500);
    }).catch(() => {
      window.prompt('Kunne ikke kopiere automatisk - kopier teksten under manuelt:', text);
    });
  });
  actions.appendChild(copyBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn secondary';
  closeBtn.textContent = '✕ Lukk';
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
  minutesInput.setAttribute('aria-label', 'Lengde på økta i minutter');
  minutesLabel.appendChild(minutesInput);
  minutesLabel.appendChild(document.createTextNode('min'));
  bar.appendChild(minutesLabel);

  const planBtn = document.createElement('button');
  planBtn.id = 'lesson-plan-btn';
  planBtn.type = 'button';
  planBtn.textContent = 'Lag undervisningsopplegg (for lærere)';
  planBtn.title = 'Kopier en KI-instruks for en ferdig undervisningsøkt om de læringsmålene du har huket av';
  planBtn.addEventListener('click', () => {
    const nodes = getLessonSelectionNodes();
    if (!nodes.length) return;

    const minutes = Math.min(240, Math.max(15, parseInt(minutesInput.value, 10) || LESSON_DEFAULT_MINUTES));
    minutesInput.value = minutes;
    const text = composeLessonPlanInstruction(nodes, minutes);

    const original = planBtn.textContent;
    navigator.clipboard.writeText(text).then(() => {
      planBtn.textContent = 'Kopiert!';
      setTimeout(() => { planBtn.textContent = original; }, 1500);
    }).catch(() => {
      window.prompt('Kunne ikke kopiere automatisk - kopier teksten under manuelt:', text);
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
    return { kind: 'mastered', symbol: '✓', text: 'Mestret' };
  }
  const missing = getMissingAncestors(node, progress);
  if (!missing.length) {
    return { kind: 'ready', symbol: '◇', text: 'Klar til å læres' };
  }
  const codes = missing.map(m => m.goalIndex).join(', ');
  return {
    kind: 'blocked',
    symbol: '⊘',
    text: `Mangler først: ${codes}`,
    title: missing.map(m => `${m.goalIndex}) ${m.navn}`).join('\n'),
  };
}

function renderGoalIndexBody(body) {
  body.innerHTML = '';
  const progress = getProgress();

  const intro = document.createElement('p');
  intro.id = 'goal-index-intro';
  intro.textContent = 'Lista viser alle læringsmålene i faget, sortert etter tema, med status for hvert av dem. For lærere: huk av de læringsmålene neste økt skal dekke, og lag et ferdig undervisningsopplegg nederst.';
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
      cb.setAttribute('aria-label', `Ta med «${n.navn}» i undervisningsopplegget`);
      cb.addEventListener('change', () => {
        if (cb.checked) lessonSelection.add(n.id);
        else lessonSelection.delete(n.id);
        updateLessonPlanBar();
      });
      li.appendChild(cb);

      const main = document.createElement('div');
      main.className = 'goal-index-item-main';

      const label = document.createElement('label');
      label.setAttribute('for', cb.id);
      label.className = 'goal-index-item-name';
      label.textContent = `${n.goalIndex}) ${n.navn}`;
      main.appendChild(label);

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
  countLabel.textContent = 'Antall oppgaver';
  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.id = 'exam-count';
  countInput.min = '1';
  countInput.max = '50';
  countInput.value = '10';
  countInput.setAttribute('aria-label', 'Antall oppgaver i prøven');
  countLabel.appendChild(countInput);
  widget.appendChild(countLabel);

  const examBtn = document.createElement('button');
  examBtn.id = 'exam-btn';
  examBtn.type = 'button';
  examBtn.textContent = 'Lag prøve av mestrede ferdigheter';
  examBtn.title = 'Kopier en KI-instruks for å lage en prøve basert på det du har markert som mestret';
  widget.appendChild(examBtn);

  examBtn.addEventListener('click', () => {
    const original = examBtn.textContent;
    const progress = getProgress();
    const masteredNodes = allNodes.filter(n => isNodeMastered(n, progress));

    if (!masteredNodes.length) {
      examBtn.textContent = 'Ingen mestrede ferdigheter ennå';
      setTimeout(() => { examBtn.textContent = original; }, 1800);
      return;
    }

    const count = Math.min(50, Math.max(1, parseInt(countInput.value, 10) || 10));
    countInput.value = count;
    const text = composeExamInstruction(masteredNodes, count);

    navigator.clipboard.writeText(text).then(() => {
      examBtn.textContent = 'Kopiert!';
      setTimeout(() => { examBtn.textContent = original; }, 1500);
    }).catch(() => {
      window.prompt('Kunne ikke kopiere automatisk - kopier teksten under manuelt:', text);
    });
  });

  actions.appendChild(widget);
}

function hjelpemiddelKort(value) {
  return value === 'del1' ? 'D1' : value === 'del2' ? 'D2' : 'D1+D2';
}

// Setter sammen en KI-instruks for å lage en prøve på tvers av alle noder
// eleven (eller læreren) har markert som mestret - ikke bare én enkelt node
// slik composeInstruction() gjør. Prøven trenger ikke dekke alle mestrede
// noder; instruksen ber KI-en velge et representativt utvalg på `count`
// oppgaver som til sammen dekker flest mulig av dem.
function composeExamInstruction(nodes, count) {
  const courseLabel = CONFIG.courseName || 'faget';
  const list = nodes
    .map(n => {
      const tags = [n.type];
      if (SHOW_HJELPEMIDDEL) tags.push(hjelpemiddelKort(n.hjelpemiddel));
      return `- ${n.navn} [${tags.join(', ')}]: ${n.beskrivelse}`;
    })
    .join('\n');

  const parts = [];
  parts.push(`Du er en KI-læringsassistent som skal lage en skriftlig prøve i ${courseLabel} til en elev, basert på ferdighetene og begrepene eleven (eller læreren) har markert som mestret i ferdighetstreet.`);
  parts.push(`Følgende ${nodes.length} ferdigheter/begreper er markert som mestret:\n${list}`);
  parts.push(`Lag en prøve med nøyaktig ${count} oppgave(r). Prøven trenger ikke dekke alle punktene over - velg heller ut et representativt utvalg som til sammen dekker flest mulig av dem, varier vanskelighetsgrad, og la gjerne noen oppgaver kombinere flere av ferdighetene. Nummerer oppgavene og formuler dem slik de typisk ville sett ut på en skriftlig prøve/eksamen i faget.`);

  if (nodes.some(n => n.type === 'begrep')) {
    parts.push(buildExamBegrepGuidance(nodes));
  }

  if (SHOW_HJELPEMIDDEL) {
    const hasDel1 = nodes.some(n => n.hjelpemiddel === 'del1' || n.hjelpemiddel === 'begge');
    const hasDel2 = nodes.some(n => n.hjelpemiddel === 'del2' || n.hjelpemiddel === 'begge');
    if (hasDel1 || hasDel2) {
      const hjelpemiddelParts = [];
      if (hasDel1) hjelpemiddelParts.push(composeHjelpemiddelContext('del1'));
      if (hasDel2) hjelpemiddelParts.push(composeHjelpemiddelContext('del2'));
      parts.push(`Merk hver oppgave med [D1] eller [D2] etter hvilken del den hører til, og hold deg til riktig hjelpemiddelbruk for hver del:\n${hjelpemiddelParts.join('\n')}`);
    }
  }

  parts.push('Vis KUN oppgavene først, uten fasit. Ikke gi fasit før eleven har svart - vent til eleven ber om vurdering (enten etter hver oppgave, eller etter å ha svart på alle sammen). Gi da en fullstendig fasit med begrunnelse for hvert svar, en kort vurdering av hva eleven fikk til, og hva hen bør øve mer på.');

  return parts.join('\n\n');
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
    ? 'Ingen læringsmål valgt'
    : n === 1 ? '1 læringsmål valgt' : `${n} læringsmål valgt`;
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
  lines.push(`${t}-${t + LESSON_STARTER_MIN} min: Starter`);
  t += LESSON_STARTER_MIN;

  nodes.forEach((node, i) => {
    const len = base + (i < extra ? 1 : 0);
    const diag = Math.min(LESSON_DIAGNOSTIC_MIN, Math.max(1, len - 1));
    lines.push(`${t}-${t + len} min: Læringsmål ${i + 1} - ${node.navn}. Av disse settes de siste ${diag} minuttene av til det diagnostiske spørsmålet.`);
    t += len;
  });

  lines.push(`${t}-${t + LESSON_RECALL_MIN} min: Gjenhenting`);
  t += LESSON_RECALL_MIN;

  return { text: lines.join('\n'), perGoal: base, tight: base < LESSON_MIN_GOAL_BLOCK, total: t };
}

// Fast metodikk-tekst, lik for alle fag. Ligger hardkodet her (ikke i CSV
// og ikke i config.js) på samme måte som BEGREP_TEST_GUIDANCE: dette er
// didaktikk som gjelder på tvers av fag, ikke fagspesifikt innhold.
const LESSON_STARTER_GUIDANCE = `BOLK 1 - STARTER (${LESSON_STARTER_MIN} minutter)
Lag EN åpen oppgave som hele klassen kan begynne på med en gang, og som leder inn mot dagens læringsmål.
Krav til starteren:
- Den skal få plass på én PowerPoint-slide eller på tavla. Skriv den ut ordrett, slik den skal stå der.
- Den skal være ÅPEN: det skal ikke finnes bare ett riktig svar, men mange mulige svar eller mange veier fram. Elevene skal kunne holde på i flere minutter uten å bli "ferdige".
- Den skal ha lav terskel. En elev som ikke kan noe av det som skal læres i dag, skal likevel kunne begynne med en gang. Dette er det vanskeligste kravet: starteren skal IKKE bygge på forkunnskaper utover det som står i forutsetningslista over, og helst ikke engang på alt det.
- Den skal invitere til å prøve seg, gjette, sammenlikne med sidemannen og justere.
Et eksempel på FORMEN (ikke på innholdet): "Se på disse brøkene: 1/2, 1/3, 1/4, 1/6, 1/8. Legg sammen noen av dem slik at du kommer så nær 1 som mulig."
Skriv i tillegg 2-3 setninger til læreren om hvordan starteren leder inn mot dagens læringsmål, og hva læreren skal se etter mens elevene jobber.`;

const LESSON_EPP_GUIDANCE = `HOVEDDELEN - ETT LÆRINGSMÅL OM GANGEN
Undervisningen av hvert læringsmål skal følge example-problem pair-modellen: læreren gjør en oppgave, elevene gjør en tilsvarende oppgave, og så gjentas det med en litt vanskeligere oppgave.
Lag 2-3 slike runder per læringsmål. Hver runde består av:

a) LÆRERENS OPPGAVE - én oppgave læreren gjør på tavla, ferdig utregnet med alle mellomregninger, skrevet slik de skal stå på tavla. Foreslå også HVORDAN læreren skal gjøre den, og varier mellom rundene. Mulige varianter:
   - Læreren gjør hele oppgaven i FULLSTENDIG STILLHET, uten å si et ord, og elevene må etterpå forklare til sidemannen - eller skrive ned for seg selv - hva læreren gjorde og hvorfor.
   - Læreren tenker høyt underveis.
   - Læreren gjør ett bevisst feiltrinn som elevene skal finne.
   - Læreren stopper midtveis og lar klassen foreslå neste steg.

b) ELEVENES OPPGAVER - flere oppgaver som likner lærerens, i stigende vanskegrad, slik at elever som blir fort ferdige har noe mer å gå på. Gi minst tre. VIKTIG: de ekstra oppgavene skal ligge SIDELENGS i forhold til kursprogresjonen - samme type oppgave med andre tall, ny innpakning eller en liten vri - og IKKE framover mot neste runde. Det neste, vanskeligere steget skal læreren selv gjennomgå i neste runde; foregriper de ekstra oppgavene det, mister neste runde poenget sitt. Marker tydelig hvilken av oppgavene læreren skal gjennomgå etterpå (den enkleste). Gi fasit til alle.

Rundene skal bygge oppover: første runde er det enkleste tilfellet, siste runde ligger tett opp mot slik læringsmålet faktisk skal beherskes.

c) EGENREGNING - etter siste runde, tre oppgavesett på ulikt nivå (f.eks. "Kom i gang", "Videre", "Utfordring") som elevene jobber med på egen hånd. Elevene velger selv, eller læreren fordeler. Gi fullstendig fasit til alle tre settene.`;

const LESSON_BEGREP_GUIDANCE = `TILPASNING FOR BEGREPER
Noen av læringsmålene over er merket [begrep]. Det er deklarativ kunnskap, ikke en regneferdighet, og example-problem pair-modellen over er skrevet for regneferdigheter. Gjør derfor en enkel tilpasning for disse: lærerens "oppgave" blir i stedet at læreren viser fram og går gjennom noen eksempler og ikke-eksempler på begrepet, og elevenes "oppgaver" blir å avgjøre om nye tilfeller er eksempler på begrepet eller ikke og begrunne hvorfor, eller å forklare begrepet med egne ord. Egenregninga blir tilsvarende kvalitativ. Hold regning minimal og underordnet i disse bolkene - selve regneferdigheten hører hjemme i et eget læringsmål lenger ned i ferdighetstreet.`;

const LESSON_DIAGNOSTIC_GUIDANCE = `DIAGNOSTISK SPØRSMÅL - avslutt HVERT læringsmål med ett, før klassen går videre
Et diagnostisk spørsmål er et flervalgsspørsmål med nøyaktig fire alternativer, nummerert 1, 2, 3 og 4. De gale alternativene skal ikke være tilfeldige: hvert av dem skal svare til en KONKRET, vanlig misforståelse knyttet til akkurat dette læringsmålet. Skriv i en egen linje til læreren hvilken misforståelse hvert galt alternativ fanger opp, slik at læreren vet hva et svar faktisk betyr.
Krav til spørsmålet:
- Det skal få plass på én slide eller på tavla, og kunne besvares på under 30 sekunder uten utregning på papir.
- Alle fire alternativene skal se plausible ut. Ingen åpenbart tullete alternativer - da svarer elevene riktig uten å forstå.
Gjennomføring (skriv den inn i opplegget): læreren viser spørsmålet, elevene tenker i stillhet i 30 sekunder, og på lærerens signal svarer ALLE samtidig ved å vise antall fingre. Poenget er at hele klassen må ta stilling, ikke bare den som rekker opp hånda.
- Svarer så godt som alle riktig: gå rett videre til neste læringsmål.
- Er klassen delt: ikke gi fasit med en gang. Foreslå én måte å ta tak i misforståelsen på, og varier mellom læringsmålene:
  (i) én elev per alternativ får argumentere for sitt svar mens læreren og resten av klassen bare lytter, uten å avbryte eller korrigere - og deretter stemmer klassen på nytt;
  (ii) elevene diskuterer to og to med sidemannen i ett minutt og stemmer på nytt;
  (iii) elevene går sammen i grupper etter hvilket alternativ de valgte, og skal bli enige om et felles argument før ny avstemming.
  Først etter den nye avstemmingen gjennomgår læreren riktig svar - og forklarer da eksplisitt hvorfor hvert av de gale alternativene er galt.`;

const LESSON_RECALL_GUIDANCE = `SISTE BOLK - GJENHENTING (${LESSON_RECALL_MIN} minutter)
Avslutt økta med gjenhenting: elevene lukker bok og notater og skriver ned i boka si alt de husker at de har lært i dag. Skriv ut den konkrete beskjeden læreren skal gi, klar til å settes på en slide eller tavla. Gi i tillegg læreren 2-3 korte hjelpespørsmål hen kan skrive på tavla hvis noen elever ikke kommer i gang. Skriv også én setning om hvorfor dette gjøres - at det å hente noe fram fra hukommelsen er det som fester det, ikke å lese det om igjen - slik at læreren kan si det til klassen.`;

const LESSON_FORMAT_GUIDANCE = `FORMAT PÅ SVARET
Skriv opplegget som én sammenhengende plan læreren kan lese ovenfra og ned mens hen underviser. Bruk en overskrift med minuttangivelse for hver bolk, i samme rekkefølge som timeplanen over.
Alt som skal vises fram for elevene - starteroppgaven, lærerens eksempel, elevoppgavene, det diagnostiske spørsmålet og beskjeden om gjenhenting - skal stå i en egen, tydelig avgrenset blokk som begynner med "PÅ TAVLA:" på egen linje. Innholdet i en slik blokk skal være skrevet ordrett slik det skal stå på slide eller tavle, uten instrukser til læreren inni blokken. Alt annet - hva læreren skal gjøre og si, fasit, hva hen skal se etter - står utenfor blokkene. Da kan læreren kopiere "PÅ TAVLA"-blokkene rett inn i PowerPoint.
Gi fullstendig fasit til alle oppgaver, i egne avsnitt merket "Fasit", alltid utenfor "PÅ TAVLA"-blokkene.
Skriv enkelt og konkret, og unngå didaktiske fagord i teksten som skal vises for elevene.`;

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
  const courseLabel = CONFIG.courseName || 'faget';
  const schedule = buildLessonSchedule(nodes, totalMinutes);
  const parts = [];

  parts.push(`Du er en erfaren fagdidaktiker som skal hjelpe en LÆRER med å planlegge én konkret undervisningsøkt i ${courseLabel}. Du snakker med læreren, ikke med eleven. Svar med selve undervisningsopplegget med en gang - ikke still oppklarende spørsmål først, og ikke innled med å oppsummere denne instruksen. Læreren kan be om justeringer etterpå.`);

  parts.push('Hvis du har en form for minnefunksjon på tvers av samtaler (langtidsminne), skal du ikke lagre noe fra denne samtalen der - verken om læreren, klassen eller faget. Opplegget gjelder kun denne ene økta her og nå.');

  const goalList = nodes
    .map((n, i) => {
      const tags = [n.type];
      if (SHOW_HJELPEMIDDEL) tags.push(hjelpemiddelKort(n.hjelpemiddel));
      return `${i + 1}. ${n.navn} [${tags.join(', ')}]\n   ${n.beskrivelse}`;
    })
    .join('\n');
  parts.push(`Økta varer i ${schedule.total} minutter og skal dekke følgende ${nodes.length} læringsmål, i denne rekkefølgen:\n${goalList}`);

  // Forutsetningene utledes automatisk fra avhenger_av-kjeden, på samme måte
  // som i composeInstruction() - læreren velger kun målene for økta.
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

  if (prerequisites.length) {
    const names = prerequisites.sort(compareByGoalIndex).map(a => `- ${a.navn}`).join('\n');
    parts.push(`Elevene har fra før vært gjennom følgende ferdigheter og begreper, som dagens læringsmål bygger videre på. Legg dette til grunn: du kan bygge på dem, bruke ordene fritt uten å definere dem på nytt, og trekke dem inn i både starteren og eksemplene.\n${names}`);
  } else {
    parts.push('Dagens læringsmål har ingen registrerte forutsetninger i ferdighetstreet - anta at temaet er helt nytt for elevene.');
  }

  parts.push(`Følg denne timeplanen, og skriv minuttangivelsen inn i opplegget for hver bolk:\n${schedule.text}`);

  if (schedule.tight) {
    parts.push(`MERK: med ${nodes.length} læringsmål på ${schedule.total} minutter blir det bare rundt ${schedule.perGoal} minutter per læringsmål. Det er for lite til å rekke både example-problem pair-runder, egenregning og et diagnostisk spørsmål. Innled derfor opplegget med en kort, vennlig merknad til læreren om dette, og foreslå konkret hvilke(t) læringsmål som bør flyttes til en senere økt. Lag deretter et fullstendig opplegg for alle målene likevel, etter timeplanen over.`);
  }

  parts.push(LESSON_STARTER_GUIDANCE);
  parts.push(LESSON_EPP_GUIDANCE);
  if (nodes.some(n => n.type === 'begrep')) parts.push(LESSON_BEGREP_GUIDANCE);
  parts.push(LESSON_DIAGNOSTIC_GUIDANCE);
  parts.push(LESSON_RECALL_GUIDANCE);

  if (SHOW_HJELPEMIDDEL) {
    const hasDel1 = nodes.some(n => n.hjelpemiddel === 'del1' || n.hjelpemiddel === 'begge');
    const hasDel2 = nodes.some(n => n.hjelpemiddel === 'del2' || n.hjelpemiddel === 'begge');
    if (hasDel1 || hasDel2) {
      const hjelpemiddelParts = [];
      if (hasDel1) hjelpemiddelParts.push(composeHjelpemiddelContext('del1'));
      if (hasDel2) hjelpemiddelParts.push(composeHjelpemiddelContext('del2'));
      parts.push(`Hold deg til riktig hjelpemiddelbruk i oppgavene du lager, etter hvilken del hvert læringsmål hører til (merket [D1]/[D2] i lista over):\n${hjelpemiddelParts.join('\n')}`);
    }
  }

  parts.push(LESSON_FORMAT_GUIDANCE);

  return parts.join('\n\n');
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
    if (e.target.closest('.node-box, input, a, button, textarea')) return;
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
  setupGoalIndexButton();
  setupExamButton();
  if (SHOW_MOTIVATION_BUTTON) setupMotivationButton();
  try {
    const [noderText, eksamenText] = await Promise.all([
      fetchText('noder.csv'),
      fetchText('eksamensoppgaver.csv'),
    ]);

    const noderRows = parseCsv(noderText);
    const eksamenRows = parseCsv(eksamenText);

    buildNodeIndex(noderRows);
    buildExamIndex(eksamenRows);
    validateReferences();
    validateDag();

    renderErrorBanner();
    computeLevels();
    layoutAndRender();
    updateProgressUI();
  } catch (err) {
    console.error('Kunne ikke laste ferdighetstreet:', err);
    validationErrors.push('Kritisk feil ved lasting: ' + err.message + ' (kjører du siden via en lokal server? fetch() av CSV-filer feiler ved å åpne index.html direkte fra disk i mange nettlesere.)');
    renderErrorBanner();
  }
}

function fetchText(path) {
  return fetch(path).then(res => {
    if (!res.ok) throw new Error(`Fant ikke ${path} (status ${res.status})`);
    return res.text();
  });
}

function parseCsv(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (result.errors && result.errors.length) {
    result.errors.forEach(e => validationErrors.push(`CSV-feil: ${e.message} (rad ${e.row})`));
  }
  return result.data;
}

/* ------------------------------------------------------------------ */
/* Indeksering av data                                                  */
/* ------------------------------------------------------------------ */

function buildNodeIndex(rows) {
  nodesById = new Map();
  allNodes = [];
  rows.forEach(row => {
    const id = (row.id || '').trim();
    if (!id) return;
    const node = {
      id,
      type: (row.type || '').trim(),
      emne: (row.emne || '').trim() || 'Annet',
      navn: (row.navn || '').trim(),
      beskrivelse: (row.beskrivelse || '').trim(),
      avhenger_av: (row.avhenger_av || '').split(';').map(s => s.trim()).filter(Boolean),
      hjelpemiddel: (row.hjelpemiddel || '').trim(),
      instruks: (row.instruks || '').trim(),
      children: [],
      nivaa: 0,
      x: 0,
      y: 0,
    };
    nodesById.set(id, node);
    allNodes.push(node);
  });

  allNodes.forEach(node => {
    node.avhenger_av.forEach(depId => {
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
      aar: (row.aar || '').trim(),
      sesong: (row.sesong || '').trim(),
      del: (row.del || '').trim(),
      oppgavenummer: (row.oppgavenummer || '').trim(),
      url: (row.url || '').trim(),
    });
  });
}

/* ------------------------------------------------------------------ */
/* Validering                                                           */
/* ------------------------------------------------------------------ */

function validateReferences() {
  allNodes.forEach(node => {
    node.avhenger_av.forEach(depId => {
      if (!nodesById.has(depId)) {
        validationErrors.push(`Node "${node.id}" refererer til ukjent avhenger_av-id "${depId}".`);
      }
    });
    if (node.emne === 'Annet' && !TOPIC_ORDER.includes('Annet')) {
      validationErrors.push(`Node "${node.id}" mangler "emne" i noder.csv og havner i samle-kolonnen "Annet".`);
    }
  });
  examsByNode.forEach((rows, nodeId) => {
    if (!nodesById.has(nodeId)) {
      validationErrors.push(`eksamensoppgaver.csv refererer til ukjent node_id "${nodeId}".`);
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
    for (const depId of node.avhenger_av) {
      const dep = nodesById.get(depId);
      if (!dep) continue;
      const c = color.get(dep.id);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(dep.id);
        const cycle = stack.slice(cycleStart).concat(dep.id);
        validationErrors.push(`Syklus oppdaget i avhenger_av: ${cycle.join(' -> ')}`);
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

function renderErrorBanner() {
  const banner = document.getElementById('error-banner');
  if (!validationErrors.length) {
    banner.classList.remove('visible');
    banner.textContent = '';
    return;
  }
  console.warn('Ferdighetstre-validering fant problemer:\n' + validationErrors.join('\n'));
  banner.textContent = '⚠ ' + validationErrors.length + ' problem(er) funnet i datafilene (se konsoll for detaljer):\n' + validationErrors.join('\n');
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
    if (!columns.has(node.emne)) columns.set(node.emne, []);
    columns.get(node.emne).push(node);
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
    node.avhenger_av.forEach(depId => {
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
  levelRows.forEach(row => row.sort((a, b) => a.navn.localeCompare(b.navn, 'nb')));
  levelsPresent.forEach(lvl => assignOrderIndex(levelRows.get(lvl)));

  for (let pass = 0; pass < LAYOUT.barycenterPasses; pass++) {
    const topDown = pass % 2 === 0;
    const order = topDown ? levelsPresent : [...levelsPresent].reverse();
    order.forEach(lvl => barycenterSortRow(levelRows.get(lvl), topDown ? 'avhenger_av' : 'children', idsInColumn));
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
    markBtn.title = `Marker alle ferdigheter i «${col.topic}» som mestret`;
    markBtn.addEventListener('click', () => bulkSetMastery(col.nodes, true));
    actions.appendChild(markBtn);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'column-header-btn';
    clearBtn.textContent = '✕';
    clearBtn.title = `Fjern mestret-merking for alle ferdigheter i «${col.topic}»`;
    clearBtn.addEventListener('click', () => bulkSetMastery(col.nodes, false));
    actions.appendChild(clearBtn);

    header.appendChild(actions);
    headersLayer.appendChild(header);
  });

  const progress = getProgress();

  // Kanter
  allNodes.forEach(node => {
    node.avhenger_av.forEach(depId => {
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
  name.appendChild(document.createTextNode(node.navn));
  topRow.appendChild(name);

  el.appendChild(topRow);

  const entry = progress[node.id] || {};

  const meta = document.createElement('div');
  meta.className = 'node-meta';

  const metaLeft = document.createElement('div');
  metaLeft.className = 'node-meta-left';
  if (SHOW_HJELPEMIDDEL) metaLeft.appendChild(makeHjelpemiddelBadge(node.hjelpemiddel));
  const typeLabel = document.createElement('span');
  typeLabel.className = 'badge-type';
  typeLabel.textContent = node.type;
  metaLeft.appendChild(typeLabel);
  meta.appendChild(metaLeft);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'node-checkbox';
  checkbox.checked = !!entry.mastered;
  checkbox.title = 'Marker som mestret';
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

function makeHjelpemiddelBadge(value) {
  const span = document.createElement('span');
  span.className = 'badge ' + (
    value === 'del1' ? 'badge-del1' : value === 'del2' ? 'badge-del2' : 'badge-begge'
  );
  span.textContent = value === 'del1' ? 'Del 1' : value === 'del2' ? 'Del 2' : 'Del 1+2';
  return span;
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
  if (!node.avhenger_av.length) return true;
  return node.avhenger_av.every(depId => {
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
  document.getElementById('progress-label').textContent = `${done} av ${total} ferdigheter fullført`;
}

/* ------------------------------------------------------------------ */
/* Forfedre / KI-instruks-komposisjon                                   */
/* ------------------------------------------------------------------ */

function getAllAncestors(node) {
  const visited = new Set();
  const result = [];

  function visit(n) {
    n.avhenger_av.forEach(depId => {
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
// definerer selv teksten i config.js (composeHjelpemiddelContext), siden
// hva "hjelpemidler" betyr og hvilke regler som gjelder varierer per fag.
function composeHjelpemiddelContext(hjelpemiddel) {
  if (typeof CONFIG.composeHjelpemiddelContext === 'function') {
    return CONFIG.composeHjelpemiddelContext(hjelpemiddel);
  }
  const labels = { del1: 'del 1', del2: 'del 2', begge: 'del 1 og del 2' };
  return `Hjelpemidler: Dette gjelder ${labels[hjelpemiddel] || 'eksamen'}.`;
}

function composeInstruction(node) {
  const parts = [];
  parts.push(AI_INSTRUCTION_TEMPLATE);

  const ancestors = getAllAncestors(node);
  if (ancestors.length) {
    const names = ancestors.map(a => `- ${a.navn}`).join('\n');
    parts.push(`Eleven skal fra før beherske følgende forutsetninger:\n${names}`);
  } else {
    parts.push('Denne noden har ingen forutsetninger registrert i ferdighetstreet - anta at eleven er helt ny til dette begrepet/ferdigheten.');
  }

  parts.push(`Målet for økta er at eleven skal lære følgende: "${node.navn}". Teksten under beskriver hva det vil si å mestre noden - det er målet for økta, ikke noe eleven kan fra før:\n${node.beskrivelse}`);

  if (node.type === 'begrep') {
    parts.push(BEGREP_TEST_GUIDANCE);
  }

  if (node.instruks) {
    parts.push(node.instruks);
  }

  if (SHOW_HJELPEMIDDEL) {
    parts.push(composeHjelpemiddelContext(node.hjelpemiddel));
  }

  return parts.join('\n\n');
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
  closeBtn.textContent = '✕ lukk';
  closeBtn.addEventListener('click', closeDetail);
  inner.appendChild(closeBtn);

  const h2 = document.createElement('h2');
  h2.textContent = `${node.goalIndex}) ${node.navn}`;
  inner.appendChild(h2);

  const meta = document.createElement('div');
  meta.id = 'detail-meta';
  if (SHOW_HJELPEMIDDEL) meta.appendChild(makeHjelpemiddelBadge(node.hjelpemiddel));
  const typeBadge = document.createElement('span');
  typeBadge.className = 'badge-type';
  typeBadge.textContent = node.type;
  meta.appendChild(typeBadge);
  inner.appendChild(meta);

  const status = document.createElement('div');
  status.id = 'detail-status';
  status.textContent = mastered
    ? '✓ Mestret'
    : available
      ? 'Tilgjengelig — forutsetninger er oppfylt'
      : 'Låst — mangler forutsetninger';
  if (available && !mastered) status.classList.add('available');
  inner.appendChild(status);

  const toggles = document.createElement('div');
  toggles.className = 'mastery-toggles';
  toggles.appendChild(createMasteryToggle('Marker som mestret', entry.mastered, checked => setNodeProgress(node.id, 'mastered', checked)));
  inner.appendChild(toggles);

  const desc = document.createElement('p');
  desc.id = 'detail-desc';
  desc.textContent = node.beskrivelse;
  inner.appendChild(desc);

  if (ancestors.length) {
    const h3 = document.createElement('div');
    h3.className = 'badge-type';
    h3.style.marginBottom = '0.4rem';
    h3.textContent = 'Forutsetninger';
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
      check.title = aMastered ? 'Mestret' : 'Ikke mestret ennå';
      li.appendChild(check);
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'prereq-link';
      link.textContent = a.navn;
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
  showBtn.textContent = 'Vis KI-instruks';
  actions.appendChild(showBtn);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = 'Kopier KI-instruks';
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
    showBtn.textContent = visible ? 'Skjul KI-instruks' : 'Vis KI-instruks';
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(instructionText).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Kopiert!';
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
    h3.textContent = 'Eksamensoppgaver';
    inner.appendChild(h3);

    const ul = document.createElement('ul');
    ul.className = 'exam-list';
    exams.forEach(exam => {
      const li = document.createElement('li');
      const label = `${capitalize(exam.sesong)} ${exam.aar}, del ${exam.del}, oppgave ${exam.oppgavenummer}`;
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

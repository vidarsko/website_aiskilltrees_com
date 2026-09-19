'use strict';

/* ------------------------------------------------------------------ */
/* Fagspesifikk konfigurasjon for matematikk 2P.                       */
/* Lastes FØR ../engine.js — se ferdighetstre/instruks.md */
/* for hva som kan/skal settes her.                                    */
/* ------------------------------------------------------------------ */

window.FT_CONFIG = {
  storageKey: '2p-ferdighetstre-fullfort',

  // Viser «Hvorfor skal jeg lære matte?»-knappen øverst i header (kun
  // matematikkfagene, se ferdighetstre/instruks.md).
  showMotivationButton: true,

  // Rekkefølge på emne-kolonnene i kartet, venstre til høyre. Emner som finnes
  // i noder.csv men ikke i denne listen havner til slutt (alfabetisk).
  topicOrder: [
    'Prosent og vekstfaktor',
    'Lån og økonomi',
    'Eksponentialfunksjoner',
    'Statistikk',
    'Programmering',
    'Geometri',
    'Likninger og funksjoner',
  ],

  // Kursnavnet som settes inn i den delte KI-instruksmalen
  // (se ferdighetstre/engine.js -> buildInstructionTemplate).
  courseName: 'matematikk 2P (norsk videregående skole)',

  // Fagspesifikke eksempler på formuleringsfeil KI-en skal kommentere
  // vennlig, men tydelig (satt inn i den delte malen). Handler om notasjon/
  // presisjon som ville gitt trekk på eksamen, ikke om sluttsvaret er riktig.
  formuleringsfokus: 'glemmer prosenttegn eller andre enheter, bruker likhetstegn feil (f.eks. kjeder sammen uttrykk med "=" som ikke faktisk er like, eller bruker "=" til å bety "neste steg" i stedet for likhet), eller runder av for tidlig eller upresist',

  // Hjelpemiddel-kontekst for KI-instruksen. Matte 2P har fra våren 2027 en ny
  // hjelpemiddelordning på eksamen: del 1 er som før (ingen hjelpemidler), del
  // 2 skal besvares for hånd - ingen datamaskin/nettbrett i det hele tatt. Kun
  // egne notater på papir, trykte hjelpemidler og en enkel vitenskapelig
  // kalkulator (kvadratrøtter, logaritmer, sin/cos/tan, standardavvik) er
  // tillatt. Grafiske, likningsløsende, programmerbare eller
  // kommunikasjonsdyktige kalkulatorer er IKKE tillatt.
  composeHjelpemiddelContext(hjelpemiddel) {
    const felles = 'Treningen skal gjenspeile hvordan ferdigheten faktisk skal utføres på eksamen, med hjelpemiddelordningen fra våren 2027 (ingen datamaskin/nettbrett på del 2 i det hele tatt - kun en enkel vitenskapelig kalkulator, egne notater på papir og trykte hjelpemidler).';
    if (hjelpemiddel === 'del1') {
      return `Hjelpemidler: Dette gjelder del 1 av eksamen, uten hjelpemidler. Forvent at eleven regner for hånd, uten kalkulator. ${felles}`;
    }
    if (hjelpemiddel === 'del2') {
      return `Hjelpemidler: Dette gjelder del 2 av eksamen, som fra våren 2027 skal besvares for hånd. Forvent at eleven bruker en enkel vitenskapelig kalkulator (kan regne med kvadratrøtter, logaritmer, sinus/cosinus/tangens og standardavvik), eventuelt egne notater/trykte hjelpemidler. Merk: grafiske kalkulatorer og kalkulatorer som kan løse likninger, er programmerbare eller kan kommunisere med andre enheter, er IKKE tillatt - og heller ikke CAS-programvare eller PC/nettbrett (f.eks. GeoGebra). ${felles}`;
    }
    return `Hjelpemidler: Dette er relevant både uten hjelpemidler (del 1) og med en enkel vitenskapelig kalkulator (del 2, fra våren 2027 - ingen datamaskin, og heller ingen grafisk/likningsløsende/programmerbar kalkulator). Tilpass etter hvilken del eleven trener på, og spør eleven hvis det er uklart. ${felles}`;
  },
};

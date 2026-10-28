// Relecture d’un état hypothécaire (commun/etat-hypothecaire.js, étude 27/10). Texte inventé reprenant la mise en page de l'état-réponse ANF
// (une ligne par page comme pdf.js) : aucune donnée réelle.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../commun/etat-hypothecaire');
const { chargerApplication } = require('./helpers/load-app');

const PAGES = [
  'NOUVELLE VERSION DE L’ÉTAT-RÉPONSE ANF Vous avez en main la nouvelle version 1 sur 20',
  'ÉTAT-RÉPONSE Accès des Notaires au Fichier Immobilier BLOIS 1 délivré le 29 décembre 2025 Dossier ANF N° : ANF_2025_00000001 Relevé des formalités (Flux) Du 03/04/2002 (BLOIS 1) Au 26/10/2025 (**) 6 formalités délivrées Copie de fiches (Stock) Depuis le 01/01/1956 4 faces de copies de fiches délivrées',
  'Relevé des formalités - Publication VENTE PAGE 3 À PAGE 3 Rédacteur : NOT ESSAI Commune : BLOIS Date de l\'acte : 22/06/2013 Date de dépôt : 12/07/2013 Référence d\'enliassement : 2013 P 1111 Disposition n° 1 / UD1 : Vente Disposants 1 MARTIN 01/01/1960 Disposition n° 2 / UD1 : Pacte de préférence Une charge est identifiée dans le complément Disposant 2 DURAND Complément : Pacte de préférence pour une durée de 30 ans. ANF_2025_00000001 3 sur 20',
  'Relevé des formalités - Charge PRIVILEGE DE PRETEUR DE DENIERS PAGE 4 À PAGE 4 Rédacteur : NOT ESSAI Commune : BLOIS Date de l\'acte : 22/06/2013 Date de dépôt : 15/07/2013 Référence d\'enliassement : 2013 V 2222 Disposition n° 1 / UD1 : Privilège de prêteur de deniers Créancier BANQUE EXEMPLE N° SIREN 000000000 Débiteurs 1 DURAND 01/01/1970 Montant principal : 150 000,00 EUR Date extrême d\'effet : 05/07/2040 ANF_2025_00000001 4 sur 20',
  'Relevé des formalités - Charge HYPOTHEQUE CONVENTIONNELLE PAGE 5 À PAGE 5 Rédacteur : NOT ESSAI Date de dépôt : 10/03/2004 Référence d\'enliassement : 2004 V 3333 Créancier CREDIT ESSAI Débiteurs 1 DURAND Montant principal : 80 000,00 EUR Date extrême d\'effet : 10/03/2024 ANF_2025_00000001 5 sur 20',
  'Relevé des formalités - Charge HYPOTHEQUE CONVENTIONNELLE PAGE 6 À PAGE 6 Rédacteur : NOT ESSAI Date de dépôt : 10/03/2010 Référence d\'enliassement : 2010 V 4444 Créancier BANQUE AUTRE Débiteurs 1 DURAND Montant principal : 50 000,00 EUR Date extrême d\'effet : 10/03/2035 RADIATION totale déposée le 01/02/2020 ANF_2025_00000001 6 sur 20',
  '4104P01 003939050000000 R ANF_2025_00000001 7 sur 20 Copie de fiche Stock'
];

test('état-réponse ANF : inscriptions en cours, périmée et radiée à part, charge du complément, fiches anciennes comptées', () => {
  const r = E.analyserEtatHypothecaire(PAGES, '2026-10-28');
  assert.equal(r.anf, true);
  assert.equal(r.delivreLe, '2025-12-29');
  assert.equal(r.facesStock, 4);
  assert.equal(r.inscriptions.length, 3);
  const [ppd, perimee, radiee] = r.inscriptions;
  assert.equal(ppd.nature, 'PRIVILEGE DE PRETEUR DE DENIERS');
  assert.equal(ppd.etat, 'en_cours');
  assert.equal(ppd.creancier, 'BANQUE EXEMPLE');
  assert.equal(ppd.montant, '150 000,00 €');
  assert.equal(ppd.dateExtremeEffet, '2040-07-05');
  assert.equal(ppd.reference, '2013 V 2222');
  assert.equal(ppd.dateDepot, '2013-07-15');
  assert.equal(perimee.etat, 'perimee', 'date extrême d’effet avant la délivrance de l’état');
  assert.equal(radiee.etat, 'radiee');
  assert.equal(E.inscriptionsEnCours(r).length, 1);
  assert.equal(r.chargesComplement.length, 1);
  assert.equal(r.chargesComplement[0].nature, 'Pacte de préférence');
  assert.match(r.chargesComplement[0].complement, /30 ans/);
});

test('un état sans rubrique Charge : aucune inscription ; un document qui n’est pas un état-réponse n’est pas pris pour un', () => {
  const r = E.analyserEtatHypothecaire(PAGES.filter((p) => !/Charge [A-Z]/.test(p)), '2026-10-28');
  assert.equal(r.inscriptions.length, 0);
  assert.equal(E.analyserEtatHypothecaire(['Compromis de vente entre les soussignés'], '2026-10-28').anf, false);
  assert.equal(E.nomDitEtatHypothecaire('Etat réponse - HF VTE de ESSAI - ANF 0410.pdf'), true);
  assert.equal(E.nomDitEtatHypothecaire('Titre de propriété.pdf'), false);
});

test('poste : pièces à réclamer par créancier, message court de CLAIRE, bloc de la fiche échappé', () => {
  const app = chargerApplication();
  const etat = E.analyserEtatHypothecaire(PAGES, '2026-10-28');
  assert.equal(app.piecesEtatHypothecaire(etat).join(' | '), 'Décompte de remboursement — BANQUE EXEMPLE | Accord de mainlevée — BANQUE EXEMPLE');
  assert.match(app.messageEtatHypothecaire(etat), /^État hypothécaire relu : 1 inscription en cours/);
  const html = app.htmlEtatHypothecaireFiche({ etatHypothecaire: Object.assign({}, etat, { inscriptions: etat.inscriptions.concat([{ nature: '<b>X</b>', etat: 'en_cours', page: 9 }]) }) });
  assert.ok(html.includes('2 inscriptions en cours') && html.includes('eh-en-cours') && html.includes('&lt;b&gt;X&lt;/b&gt;') && !html.includes('<b>X</b>'));
  assert.equal(app.htmlEtatHypothecaireFiche({}), '');
});

test('audit 0.384.0 : deux charges sur une page (l’une radiée), radiation d’une AUTRE inscription, tiret et apostrophe typographiques, date prorogée, page de suite', () => {
  const tete = 'ÉTAT-RÉPONSE Accès des Notaires au Fichier Immobilier délivré le 29 décembre 2025 Relevé des formalités (Flux) Du 03/04/2002 Au 26/10/2025 4 formalités délivrées incluant 4 dispositions';
  const pages = [
    'NOUVELLE VERSION DE L’ÉTAT-RÉPONSE ANF',
    tete,
    'Relevé des formalités – Charge HYPOTHEQUE A PAGE 3 À PAGE 3 Date de dépôt : 01/02/2010 Référence d’enliassement : 2010 V 11 Créancier BANQUE UN Débiteurs 1 X Date extrême d’effet : 01/02/2030 HYPOTHEQUE B PAGE 3 À PAGE 3 Date de dépôt : 01/02/2011 Référence d’enliassement : 2011 V 22 Créancier BANQUE DEUX Débiteurs 1 X RADIATION totale déposée le 01/03/2020 ANF_2025_1 3 sur 9',
    'Relevé des formalités - Charge HYPOTHEQUE C PAGE 4 À PAGE 5 Référence d\'enliassement : 2012 V 33 Créancier BANQUE TROIS Débiteurs 1 X Mention : radiation totale de l\'inscription 2004 V 1 ANF_2025_1 4 sur 9',
    'Date extrême d\'effet : 01/01/2020 Prorogation : date extrême d\'effet : 01/01/2040 ANF_2025_1 5 sur 9',
    'Relevé des formalités - Charge PRIVILEGE D PAGE 6 À PAGE 6 Référence d\'enliassement : 2013 V 44 Date extrême d\'effet : 01/01/2020 ANF_2025_1 6 sur 9'
  ];
  const r = E.analyserEtatHypothecaire(pages, '2026-10-28');
  const parNature = Object.fromEntries(r.inscriptions.map((x) => [x.nature, x]));
  assert.equal(r.inscriptions.length, 4, JSON.stringify(r.inscriptions.map((x) => x.nature)));
  assert.equal(parNature['HYPOTHEQUE A'].etat, 'en_cours', 'la radiation de B ne radie pas A');
  assert.equal(parNature['HYPOTHEQUE A'].reference, '2010 V 11', 'apostrophe typographique');
  assert.equal(parNature['HYPOTHEQUE A'].dateExtremeEffet, '2030-02-01');
  assert.equal(parNature['HYPOTHEQUE B'].etat, 'radiee');
  assert.equal(parNature['HYPOTHEQUE C'].etat, 'en_cours', 'radiation d’une autre inscription citée, date prorogée sur la page de suite');
  assert.equal(parNature['HYPOTHEQUE C'].dateExtremeEffet, '2040-01-01');
  assert.equal(parNature['PRIVILEGE D'].etat, 'perimee');
  assert.equal(r.lecture.complete, true);
});

test('audit 0.384.0 : lecture incomplète dite (formalités annoncées non retrouvées, page non comprise)', () => {
  const pages = ['ÉTAT-RÉPONSE Accès des Notaires au Fichier Immobilier délivré le 29 décembre 2025 3 formalités délivrées incluant 3 dispositions',
    'Relevé des formalités - Publication VENTE PAGE 2 À PAGE 2 Référence d\'enliassement : 2013 P 1 ANF_1 2 sur 4',
    'Un texte que CLAIRE ne sait pas lire, sans rubrique ni en-tête de formalité, assez long pour compter comme une page du flux : '.repeat(3)];
  const r = E.analyserEtatHypothecaire(pages, '2026-10-28');
  assert.equal(r.lecture.complete, false);
  assert.equal(r.lecture.annoncees, 3);
  assert.equal(r.lecture.reconnues, 1);
  const app = chargerApplication();
  assert.match(app.messageEtatHypothecaire(r), /lecture incomplète/i);
  assert.doesNotMatch(app.messageEtatHypothecaire(r), /aucune inscription/i);
});

test('mise en page réelle d’une Charge (état-réponse ANF relevé le 28/10, noms inventés) : « Date d’extrême effet », créancier du tableau, deux montants', () => {
  const pages = [
    'ÉTAT-RÉPONSE Accès des Notaires au Fichier Immobilier BLOIS 1 délivré le 08 juin 2026 Relevé des formalités (Flux) Du 03/04/2002 (BLOIS 1) Au 09/04/2026 (**) 2 formalités délivrées incluant 3 dispositions',
    'Relevé des formalités - Charge  PRIVILEGE DE PRETEUR DE DENIERS-HYPOTHEQUE CONVENTIONNELLE   PAGE 2 À PAGE 3  Rédacteur :   NOT   ESSAI  Commune :   BLOIS  Date de l\'acte :   15/07/2010  Domicile élu :   BLOIS en l\'étude  Date de dépôt :   13/08/2010  Référence d\'enliassement :   2010 V 1641  Code sages :   4104P01  PRIVILEGE DE PRETEUR DE DENIERS-HYPOTHEQUE CONVENTIONNELLE  Disposition n° 1 / UD1   :   Privilège de prêteur de deniers  Créancier   Numéro d\'identité  -   BANQUE EXEMPLE CENTRE   -  Débiteur   Numéro d\'identité  1   SCI ESSAI   000 000 000  Immeuble(s)   Volume   Lot  Débiteur :   -   BLOIS   C 1   -   -  Montant principal   :   87 000,00 EUR   Accessoires :   17 400,00 EUR   Taux d\'intérêt :   4,63%  Date d\'extrême exigibilité :   05/05/2031   Date d\'extrême effet :   05/05/2032  Disposition n° 2 / UD1   :',
    'Relevé des formalités - Charge  PRIVILEGE DE PRETEUR DE DENIERS-HYPOTHEQUE CONVENTIONNELLE   PAGE 2 À PAGE 3  Disposition n° 2 / UD1   :   Hypothèque conventionnelle  Montant principal   :   163 000,00 EUR   Accessoires :   32 600,00 EUR  Date d\'extrême exigibilité :   05/05/2031   Date d\'extrême effet :   05/05/2032',
    'Relevé des formalités - Charge  PRIVILEGE DU VENDEUR   PAGE 4 À PAGE 4  Rédacteur :   NOT   ESSAI  Date de dépôt :   20/12/2010  Référence d\'enliassement :   2010 V 2528  Disposition n° 1 / UD1   :   PRIVILEGE DU VENDEUR  Créancier   Numéro d\'identité  -   SOCIETE PROMOTEUR   -  Propriétaire Immeuble / Contre   Date de naissance  1   DURAND   21/09/1967  Montant principal   :   40 500,00 EUR   Accessoires :   8 100,00 EUR  Date d\'extrême effet :   31/07/2012'
  ];
  const r = E.analyserEtatHypothecaire(pages, '2026-10-28');
  assert.equal(r.lecture.complete, true);
  assert.equal(r.inscriptions.length, 2);
  const [ppd, pv] = r.inscriptions;
  assert.equal(ppd.creancier, 'BANQUE EXEMPLE CENTRE');
  assert.equal(ppd.montant, '87 000,00 € + 163 000,00 €');
  assert.equal(ppd.dateExtremeEffet, '2032-05-05', 'jamais la date d’extrême exigibilité');
  assert.equal(ppd.etat, 'en_cours');
  assert.equal(pv.creancier, 'SOCIETE PROMOTEUR');
  assert.equal(pv.etat, 'perimee');
});

test('relecture 0.384.0 : créancier sans en-tête ni SIREN, montants principaux seuls (deux égaux comptés deux fois), charge sans complément gardée', () => {
  const h = 'ÉTAT-RÉPONSE Accès des Notaires au Fichier Immobilier délivré le 08 juin 2026';
  const une = (c) => E.analyserEtatHypothecaire([h, 'Relevé des formalités - Charge HYP X PAGE 2 À PAGE 2 Référence d\'enliassement : 2010 V 1 ' + c], '2026-10-28').inscriptions[0];
  assert.equal(une('Créancier Numéro d\'identité - BANQUE X - Constituant Numéro d\'identité 1 Y').creancier, 'BANQUE X');
  assert.equal(une('Créancier Numéro d\'identité 1 BANQUE X 552 120 222 RCS Débiteur').creancier, 'BANQUE X');
  assert.equal(une('Créancier BANQUE X SA au capital de 1 000 000,00 EUR Débiteur Montant : 87 000,00 EUR').creancier, 'BANQUE X SA');
  assert.equal(une('Créancier BANQUE X SA au capital de 1 000 000,00 EUR Débiteur Montant : 87 000,00 EUR').montant, '87 000,00 €');
  assert.equal(une('Montant principal : 87 000,00 EUR Accessoires : 17 400,00 EUR Disposition n° 2 Montant principal : 87 000,00 EUR').montant, '87 000,00 € + 87 000,00 €');
  const pub = E.analyserEtatHypothecaire([h, 'Relevé des formalités - Publication VENTE PAGE 2 À PAGE 2 Disposition n° 1 / UD1 : Vente Une charge est identifiée dans le complément Disposition n° 2 / UD1 : Vente Une charge est identifiée dans le complément Complément : Servitude de passage.'], '2026-10-28');
  assert.equal(pub.chargesComplement.length, 2, 'une charge sans complément lu n’est pas fondue dans la suivante');
});

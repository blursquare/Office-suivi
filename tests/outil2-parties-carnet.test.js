'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

// Outil 2 : statut des acquéreurs, carnet d'entretien, tableau des travaux et type de bien.
// Les textes reprennent la STRUCTURE de clauses réelles avec des noms et des dates inventés —
// aucune donnée client n'entre dans le dépôt (règle déjà posée dans CLAUDE.md).

const AUJOURDHUI = '2026-09-22';

function pagesFactices(texte) {
  return [{ numero: 1, debut: 0, fin: texte.length }];
}

// Le piège central : le VENDEUR est marié, les ACQUÉREURS sont pacsés. Un détecteur qui lirait
// le statut dans tout le texte rendrait « marié » — le statut de la mauvaise partie.
const ACTE_DEUX_STATUTS = [
  'VENTE',
  'VENDEUR',
  'Monsieur Paul DURANDEAU, retraité, né à BLOIS le 3 mars 1950, marié avec Madame Anne DURANDEAU',
  'sous le régime de la communauté légale, demeurant à BLOIS.',
  'ACQUEREUR',
  'Monsieur Marc LEBEGUE, ingénieur, né à TOURS le 8 juin 1988, et Madame Julie FONTAINE,',
  'née à ORLEANS le 2 février 1990, pacsés suivant pacte civil de solidarité enregistré le',
  '4 avril 2021 au greffe du tribunal judiciaire de TOURS.'
].join(' ');

// --- Statut des acquéreurs -------------------------------------------------------------------

test('detecterStatutAcquereurs lit le statut des ACQUÉREURS, pas celui du vendeur', () => {
  const app = chargerApplication();
  const st = app.detecterStatutAcquereurs(ACTE_DEUX_STATUTS, pagesFactices(ACTE_DEUX_STATUTS));
  assert.strictEqual(st.statut, 'pacse');
  assert.strictEqual(st.regime, null);
  assert.match(st.phrase, /LEBEGUE/);
  assert.doesNotMatch(st.phrase, /DURANDEAU/);
});

test('detecterStatutAcquereurs retient le régime matrimonial quand il est dans la clause', () => {
  const app = chargerApplication();
  const texte = 'VENDEUR Monsieur Paul DURANDEAU, célibataire, demeurant à BLOIS.'
    + " ACQUEREUR Monsieur Marc LEBEGUE et Madame Julie LEBEGUE, mariés sous le régime de la séparation de biens"
    + ' suivant contrat reçu le 4 avril 2019.';
  const st = app.detecterStatutAcquereurs(texte, pagesFactices(texte));
  assert.strictEqual(st.statut, 'marie');
  assert.match(st.regime, /s[ée]paration de biens/i);
  assert.strictEqual(app.libelleStatutAcquereurs(st), 'Mariés — séparation de biens');
});

test('detecterStatutAcquereurs écarte une clause de style qui NIE le statut', () => {
  const app = chargerApplication();
  const texte = 'ACQUEREUR Monsieur Marc LEBEGUE et Madame Julie FONTAINE, non liés par un pacte civil'
    + " de solidarité, déclarent acquérir le bien.";
  const st = app.detecterStatutAcquereurs(texte, null);
  assert.notStrictEqual(st.statut, 'pacse');
});

test('detecterStatutAcquereurs reconnaît le concubinage et la situation de célibataire', () => {
  const app = chargerApplication();
  const concubins = 'ACQUEREUR Monsieur Marc LEBEGUE et Madame Julie FONTAINE, vivant en concubinage,'
    + ' déclarent acquérir le bien.';
  assert.strictEqual(app.detecterStatutAcquereurs(concubins, null).statut, 'concubins');
  const seuls = 'ACQUEREUR Monsieur Marc LEBEGUE et Madame Julie FONTAINE, tous deux célibataires,'
    + ' déclarent acquérir le bien.';
  assert.strictEqual(app.detecterStatutAcquereurs(seuls, null).statut, 'seul');
});

test('quotitesAcquisitionPresentes ne confond pas les quotités VENDUES avec celles acquises', () => {
  const app = chargerApplication();
  const vendues = 'QUOTITES VENDUES : Monsieur DURANDEAU et Madame DURANDEAU vendent chacun pour moitié indivise.';
  assert.strictEqual(app.quotitesAcquisitionPresentes(vendues), false);
  const acquises = 'QUOTITES ACQUISES : les acquéreurs déclarent acquérir chacun pour moitié indivise.';
  assert.strictEqual(app.quotitesAcquisitionPresentes(acquises), true);
});

test('constatsStatutAcquereurs : régime absent, quotités absentes, statut absent', () => {
  const app = chargerApplication();

  const pacseSansRien = { statut: 'pacse', regime: null, quotites: false, phrase: '', page: null };
  const titres = app.constatsStatutAcquereurs(pacseSansRien, 2).map(c => c.titre).join(' | ');
  assert.match(titres, /Régime du PACS non précisé/);
  assert.match(titres, /sans quotités indiquées/);

  const pacseComplet = { statut: 'pacse', regime: 'séparation des patrimoines', quotites: true, phrase: '', page: null };
  assert.strictEqual(app.constatsStatutAcquereurs(pacseComplet, 2).length, 0);

  const marieSansRegime = app.constatsStatutAcquereurs({ statut: 'marie', regime: null, quotites: true }, 2);
  assert.strictEqual(marieSansRegime.length, 1);
  assert.match(marieSansRegime[0].titre, /Régime matrimonial/);

  // Un couple marié n'achète pas en indivision : aucune quotité à réclamer.
  const marieAvecRegime = app.constatsStatutAcquereurs({ statut: 'marie', regime: 'communauté légale', quotites: false }, 2);
  assert.strictEqual(marieAvecRegime.length, 0);

  // Statut introuvable : signalé seulement quand ils sont plusieurs — sur un acquéreur unique,
  // il n'y a ni quotité ni régime commun à déterminer.
  const rien = { statut: null, regime: null, quotites: false };
  assert.strictEqual(app.constatsStatutAcquereurs(rien, 2).length, 1);
  assert.strictEqual(app.constatsStatutAcquereurs(rien, 1).length, 0);
});

test('constatsStatutAcquereurs signale l’acquéreur marié qui achète seul', () => {
  const app = chargerApplication();
  const c = app.constatsStatutAcquereurs({ statut: 'marie', regime: 'communauté légale', quotites: false }, 1);
  assert.strictEqual(c.length, 1);
  assert.match(c[0].titre, /achetant seul/);
});

// --- Conjoint du vendeur : logement de la famille (art. 215 al. 3 C. civ.) --------------------

test('detecterStatutVendeur lit le statut du VENDEUR, pas celui de l’acquéreur', () => {
  const app = chargerApplication();
  const st = app.detecterStatutVendeur(ACTE_DEUX_STATUTS, pagesFactices(ACTE_DEUX_STATUTS));
  assert.strictEqual(st.marie, true);
  assert.match(st.phrase, /DURANDEAU/);
  assert.doesNotMatch(st.phrase, /LEBEGUE/);
  // Un vendeur célibataire ne déclenche rien.
  const seul = 'VENDEUR Monsieur Paul DURANDEAU, célibataire, demeurant à BLOIS. ACQUEREUR Madame Julie FONTAINE.';
  assert.strictEqual(app.detecterStatutVendeur(seul, null).marie, false);
});

test('constatsConjointVendeur : vendeur marié seul propriétaire → intervention du conjoint', () => {
  const app = chargerApplication();
  const st = { marie: true, phrase: 'Monsieur X, marié…', page: 1 };
  // Résidence principale mentionnée → IMPORTANT, art. 215.
  const rp = app.constatsConjointVendeur(st, 1, 'Le bien constitue la résidence principale du vendeur.');
  assert.strictEqual(rp.length, 1);
  assert.strictEqual(rp[0].gravite, 'IMPORTANT');
  assert.match(rp[0].description, /215/);
  // Sans mention de résidence principale → simple A_VERIFIER.
  const av = app.constatsConjointVendeur(st, 1, 'Un bien vendu par le vendeur.');
  assert.strictEqual(av.length, 1);
  assert.strictEqual(av[0].gravite, 'A_VERIFIER');
  // Deux vendeurs (les deux époux) → le conjoint intervient déjà, rien à signaler.
  assert.strictEqual(app.constatsConjointVendeur(st, 2, 'résidence principale').length, 0);
  // L'acte prévoit déjà l'intervention du conjoint → rien.
  assert.strictEqual(app.constatsConjointVendeur(st, 1, 'résidence principale ; le conjoint intervient aux présentes').length, 0);
  // Vendeur non marié → rien.
  assert.strictEqual(app.constatsConjointVendeur({ marie: false }, 1, 'résidence principale').length, 0);
});

// --- Travaux : facture, libellé, catégorie ----------------------------------------------------

test('detecterTravauxRealises relève la facture et produit un libellé court', () => {
  const app = chargerApplication();
  const texte = "Le VENDEUR déclare que des travaux de ravalement de façade ont été réalisés en 2022"
    + " par l'entreprise MARTIN, facture jointe, déclaration préalable obtenue.";
  const t = app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI)[0];
  assert.strictEqual(t.factureMentionnee, true);
  assert.strictEqual(t.autorisationMentionnee, true);
  assert.strictEqual(t.decennaleMentionnee, false);
  assert.strictEqual(t.annee, 2022);
  // Le libellé part du mot déclencheur, pas de l'incise « Le VENDEUR déclare que ».
  assert.match(t.libelle, /^travaux de ravalement/);
  assert.ok(t.libelle.length <= 91);
});

test('detecterTravauxRealises reconnaît un participe passé au féminin', () => {
  const app = chargerApplication();
  const texte = "Réfection de la toiture réalisée en 2021 par l'entreprise DUBOIS.";
  const t = app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI);
  assert.strictEqual(t.length, 1);
  assert.strictEqual(t[0].grosOeuvre, true);
});

test('constatsTravauxRealises accepte une catégorie, pour distinguer la source du travail', () => {
  const app = chargerApplication();
  const texte = "Une extension a été réalisée en 2023 sans autre précision.";
  const travaux = app.detecterTravauxRealises(texte, pagesFactices(texte), AUJOURDHUI);
  const parDefaut = app.constatsTravauxRealises(travaux);
  const carnet = app.constatsTravauxRealises(travaux, 'CARNET_ENTRETIEN');
  assert.ok(parDefaut.length > 0);
  assert.ok(parDefaut.every(c => c.categorie === 'TRAVAUX_REALISES'));
  assert.ok(carnet.every(c => c.categorie === 'CARNET_ENTRETIEN'));
});

// --- Carnet d'entretien -----------------------------------------------------------------------

test('analyserCarnetEntretien reconnaît le carnet par son nom ou son titre, et en lit les travaux', () => {
  const app = chargerApplication();
  const parNom = app.analyserCarnetEntretien({
    nom: "Carnet_d_entretien_immeuble.pdf",
    texte: "Réfection de la toiture réalisée en 2021 par l'entreprise DUBOIS."
  }, AUJOURDHUI);
  assert.ok(parNom);
  assert.strictEqual(parNom.travaux.length, 1);
  assert.strictEqual(parNom.travaux[0].document, 'Carnet_d_entretien_immeuble.pdf');

  const parTitre = app.analyserCarnetEntretien({
    nom: 'piece-04.pdf',
    texte: "CARNET D'ENTRETIEN DE L'IMMEUBLE — 12 rue des Lilas. Ravalement réalisé en 2019."
  }, AUJOURDHUI);
  assert.ok(parTitre);
});

test('analyserCarnetEntretien ne prend pas un avant-contrat pour un carnet', () => {
  const app = chargerApplication();
  // Presque chaque acte de copropriété CITE le carnet d'entretien : sans garde-fou, l'acte se
  // prendrait lui-même pour un carnet (même piège que l'état daté).
  const faux = app.analyserCarnetEntretien({
    nom: 'Compromis de vente.pdf',
    texte: "Le carnet d'entretien de l'immeuble sera remis à l'ACQUEREUR avant la signature."
  }, AUJOURDHUI);
  assert.strictEqual(faux, null);
  assert.strictEqual(app.analyserCarnetEntretien({ nom: 'Diagnostic.pdf', texte: 'DPE' }, AUJOURDHUI), null);
});

// --- Type de bien -----------------------------------------------------------------------------

test('deduireTypeBienOutil2 : le dossier lié d’abord, le texte ensuite, « maison » par défaut', () => {
  const app = chargerApplication();
  assert.strictEqual(app.deduireTypeBienOutil2({ dossierLie: { typeVente: 'terrain' }, texteProjet: 'lot de copropriété' }).type, 'terrain');
  assert.strictEqual(app.deduireTypeBienOutil2({ dossierLie: { typeVente: 'terrain' } }).origine, 'dossier');

  const copro = app.deduireTypeBienOutil2({ texteProjet: 'un lot de copropriété soumis au régime de la copropriété' });
  assert.strictEqual(copro.type, 'copropriete');
  assert.strictEqual(copro.origine, 'texte');

  assert.strictEqual(app.deduireTypeBienOutil2({ texteProjet: "vente d'un terrain à bâtir sis à BLOIS" }).type, 'terrain');

  const defaut = app.deduireTypeBienOutil2({ texteProjet: "une maison d'habitation élevée sur cave" });
  assert.strictEqual(defaut.type, 'maison');
  assert.strictEqual(defaut.origine, 'defaut');
});

test('typeBienPourAudit : la correction à la main l’emporte sur toute déduction', () => {
  const app = chargerApplication();
  const force = app.typeBienPourAudit({ typeBienForce: 'terrain', dossierLie: { typeVente: 'copropriete' } });
  assert.strictEqual(force.type, 'terrain');
  assert.strictEqual(force.origine, 'manuel');
  // Une valeur inconnue ne force rien : on retombe sur la déduction plutôt que sur un type inventé.
  assert.strictEqual(app.typeBienPourAudit({ typeBienForce: 'bureau', dossierLie: { typeVente: 'copropriete' } }).type, 'copropriete');
});

// --- Fiche d'identité --------------------------------------------------------------------------

test('ficheActeOutil2 porte une ligne « Statut des acquéreurs », même non trouvée', () => {
  const app = chargerApplication();
  const extraction = { champs: {}, parties: [], bien: {}, notaires: {}, dates: {}, typeActe: {} };
  const sans = app.ficheActeOutil2(extraction, 'acte');
  const ligne = sans.find(l => l.libelle === 'Statut des acquéreurs');
  assert.ok(ligne);
  assert.strictEqual(ligne.valeur, null);

  const avec = app.ficheActeOutil2(extraction, 'acte', {
    statutAcquereurs: { statut: 'concubins', regime: null, quotites: false, page: 3 }
  });
  const ligne2 = avec.find(l => l.libelle === 'Statut des acquéreurs');
  assert.strictEqual(ligne2.valeur, 'Concubins');
  assert.strictEqual(ligne2.page, 3);
});

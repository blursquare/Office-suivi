'use strict';

// Ce qui est CONSERVÉ sur le dossier une fois celui-ci créé, et ce qui survit à un export/import
// JSON (voir la section « EXTRACTION STRUCTURÉE : enregistrement sur le dossier » dans script.js).
// Trois garde-fous ici : l'instantané reste maigre (pas de texte d'acte recopié), le journal des
// corrections ne retient que ce que l'étude a réellement changé, et l'import assainit tout ce qui
// n'a pas la forme attendue plutôt que de le propager dans le rendu.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const SIGNATURE = '2026-09-15';

const ACTE = `COMPROMIS DE VENTE

LE VENDEUR : Monsieur Jean DUPONT, demeurant 3 rue des Lilas, 41000 BLOIS.
Ci-après dénommé le vendeur.
L'ACQUÉREUR : Monsieur Pierre MARTIN, demeurant 8 rue Neuve, 37000 TOURS.
Ci-après dénommé l'acquéreur.

Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur.
Maître Paul DURAND, notaire à Orléans, 8 rue C, 45000 ORLÉANS, notaire de l'acquéreur.

DÉSIGNATION
Une maison d'habitation sise à 25 route de Tours, 41100 VENDÔME, cadastrée section AB numéro 125.

PRIX
Le prix est fixé à DEUX CENT MILLE EUROS (200 000 €).

CONDITIONS SUSPENSIVES
L'acquéreur devra obtenir son financement au plus tard le 15 novembre 2026.
La réitération par acte authentique interviendra au plus tard le 15 décembre 2026.
Le présent compromis est signé le 15 septembre 2026.`;

function extraire() {
  const app = chargerApplication();
  return { app, extraction: app.construireExtractionRegex(ACTE, SIGNATURE) };
}

test('instantaneExtraction conserve type d’acte, parties, notaires et cadastre', () => {
  const { app, extraction } = extraire();
  const i = app.instantaneExtraction(extraction);
  assert.equal(i.typeActe.valeur, 'COMPROMIS_DE_VENTE');
  assert.equal(i.parties.map(p => `${p.nom}:${p.role}`).join(' '), 'DUPONT:VENDEUR MARTIN:ACQUEREUR');
  assert.equal(i.notaires.instrumentaire.nom, 'Sophie GOSSART');
  assert.equal(i.notaires.roleEtude, 'instrumentaire');
  assert.equal(i.bien.cadastre.section, 'AB');
  assert.equal(i.bien.adresse.commune, 'VENDÔME');
});

test('les statuts sont indexés sur le nom du champ du dossier, pas sur le type métier', () => {
  // C'est sous « pret »/« acte » qu'on les retrouvera pour les afficher en face de la date
  // effectivement enregistrée sur la fiche.
  const { app, extraction } = extraire();
  const champs = app.instantaneExtraction(extraction).extraction.champs;
  assert.equal(champs.pret.statut, 'CONFIRMED');
  assert.equal(champs.acte.statut, 'CONFIRMED');
  assert.equal(champs.adresseBien.statut, 'CONFIRMED');
  assert.equal(champs.BUTOIR_PRET, undefined);
});

test('l’instantané ne recopie ni les extraits du PDF ni les candidats concurrents', () => {
  // Le dossier est stocké en clair côté serveur : on n'y recopie pas des morceaux de l'acte, qui
  // n'ont d'utilité que pendant l'import, PDF encore ouvert à côté.
  const { app, extraction } = extraire();
  const serialise = JSON.stringify(app.instantaneExtraction(extraction));
  assert.ok(!serialise.includes('extrait'));
  assert.ok(!serialise.includes('candidats'));
  assert.ok(!serialise.includes("Une maison d'habitation"));
});

test('instantaneExtraction accepte l’absence d’extraction (dossier saisi à la main)', () => {
  const { app } = extraire();
  assert.equal(app.instantaneExtraction(null), null);
});

test('diffCorrectionsExtraction ne retient que les champs réellement corrigés', () => {
  const { app, extraction } = extraire();
  const entrees = app.diffCorrectionsExtraction(extraction, {
    nom: 'DUPONT / MARTIN',              // inchangé
    prixVente: 205000,                   // corrigé à la main
    adresseBien: '25 route de Tours, 41100 VENDÔME',
    pret: '2026-11-15',                  // inchangé
    acte: '2026-12-20',                  // corrigé à la main
    ventebien: '',
    emailAcquereur: '',
    roleNotaire: 'instrumentaire'
  });
  assert.equal(entrees.map(e => e.champ).sort().join(','), 'acte,prixVente');
  const acte = entrees.find(e => e.champ === 'acte');
  assert.equal(acte.valeurExtraite, '2026-12-15');
  assert.equal(acte.valeurCorrigee, '2026-12-20');
  assert.equal(acte.typeActe, 'COMPROMIS_DE_VENTE');
});

test('un champ ni trouvé ni rempli ne produit aucune entrée de journal', () => {
  const { app, extraction } = extraire();
  const entrees = app.diffCorrectionsExtraction(extraction, {
    nom: 'DUPONT / MARTIN', prixVente: 200000,
    adresseBien: '25 route de Tours, 41100 VENDÔME',
    pret: '2026-11-15', acte: '2026-12-15', ventebien: '',
    emailAcquereur: '', roleNotaire: 'instrumentaire'
  });
  assert.equal(entrees.length, 0);
});

test('normaliserExtractionImportee conserve une extraction bien formée', () => {
  const { app, extraction } = extraire();
  const instantane = app.instantaneExtraction(extraction);
  // Aller-retour JSON, comme un export puis un import de sauvegarde.
  const importe = app.normaliserExtractionImportee(JSON.parse(JSON.stringify(instantane)));
  assert.equal(importe.typeActe.valeur, 'COMPROMIS_DE_VENTE');
  assert.equal(importe.parties.length, 2);
  assert.equal(importe.notaires.instrumentaire.nom, 'Sophie GOSSART');
  assert.equal(importe.bien.adresse.codePostal, '41100');
  assert.equal(importe.extraction.champs.pret.statut, 'CONFIRMED');
});

test('normaliserExtractionImportee écarte ce qui n’a pas la forme attendue', () => {
  const { app } = extraire();
  const importe = app.normaliserExtractionImportee({
    typeActe: { valeur: 'ACTE_INVENTÉ', statut: 'CONFIRMED' },
    parties: [{ nom: 'DUPONT', role: 'PROPRIÉTAIRE' }, 'DURAND', { nom: 'MARTIN', role: 'ACQUEREUR' }],
    notaires: { instrumentaire: { office: 'Blois' }, roleEtude: 'greffier' },
    bien: 'une maison',
    extraction: { alertes: ['pas un objet', { message: 'vraie alerte', code: 'X', gravite: 'critique' }] }
  });
  assert.equal(importe.typeActe, null);                       // type inconnu de TYPES_ACTE
  assert.equal(importe.parties.map(p => p.nom).join(','), 'MARTIN'); // seule partie exploitable
  assert.equal(importe.notaires.instrumentaire, null);        // notaire sans nom
  assert.equal(importe.notaires.roleEtude, null);             // rôle hors des deux valeurs connues
  assert.equal(importe.bien, null);
  assert.equal(importe.extraction.alertes.length, 1);
});

test('un dossier sans extraction (créé avant cette version) s’importe sans rien inventer', () => {
  const { app } = extraire();
  const importe = app.normaliserExtractionImportee({ nom: 'DUPONT / MARTIN' });
  assert.equal(importe.typeActe, null);
  assert.equal(importe.parties.length, 0);
  assert.equal(importe.notaires, null);
  assert.equal(importe.extraction, null);
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('detecterNomDossier reconnaît vendeur et acquéreur au format "né(e) le"', () => {
  const app = chargerApplication();
  const texte = `
    ENTRE LES SOUSSIGNES :
    Le VENDEUR : Monsieur Jean DUPONT né le 5 mai 1970 à Paris.
    ci-après dénommé « le Vendeur »

    ET :
    Le ACQUEREUR : Madame Alice MARTIN née le 2 février 1985 à Lyon.
    ci-après dénommé « l'Acquéreur »
  `;
  assert.equal(app.detecterNomDossier(texte), 'DUPONT / MARTIN');
});

test('detecterNomDossier fonctionne avec les rôles Promettant / Bénéficiaire', () => {
  const app = chargerApplication();
  const texte = `
    Le PROMETTANT : Monsieur Paul BERNARD né le 1 janvier 1960 à Nice.
    ci-après dénommé « le Promettant »
    Le BENEFICIAIRE : Madame Julie PETIT née le 3 mars 1990 à Metz.
    ci-après dénommé « le Bénéficiaire »
  `;
  assert.equal(app.detecterNomDossier(texte), 'BERNARD / PETIT');
});

test('suggererEcheance classe une clause de prêt', () => {
  const app = chargerApplication();
  assert.equal(app.suggererEcheance("condition suspensive d'obtention d'un prêt immobilier"), 'pret');
});

test('suggererEcheance classe une clause de permis de construire en "autre"', () => {
  const app = chargerApplication();
  assert.equal(app.suggererEcheance('condition suspensive d\'obtention du permis de construire'), 'autre');
});

test('escapeHtml neutralise les balises HTML', () => {
  const app = chargerApplication();
  assert.equal(app.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('escapeAttr neutralise les guillemets pour un attribut HTML', () => {
  const app = chargerApplication();
  assert.equal(app.escapeAttr('Dupont "le rapide" & fils'), 'Dupont &quot;le rapide&quot; &amp; fils');
});

test('normaliserDossierImporte rejette une entrée sans nom', () => {
  const app = chargerApplication();
  assert.equal(app.normaliserDossierImporte({ pret: '2025-06-01' }, 'test.json'), null);
});

test('normaliserDossierImporte ignore une date malformée plutôt que de planter l\'affichage', () => {
  const app = chargerApplication();
  const d = app.normaliserDossierImporte({ nom: 'Dupont / Martin', pret: 'pas-une-date' }, 'test.json');
  assert.equal(d.nom, 'Dupont / Martin');
  assert.equal(d.pret, '');
});

test('normaliserDossierImporte applique les rappels par défaut (15 et 7 jours) si absents', () => {
  const app = chargerApplication();
  const d = app.normaliserDossierImporte({ nom: 'Dupont / Martin' }, 'test.json');
  // Le tableau vient d'un autre contexte vm (autre réalisation d'Array) : on le convertit avant
  // de le comparer pour ne comparer que sa structure, pas l'identité de son constructeur.
  assert.deepEqual([...d.reminderDays], [15, 7]);
});

test('joursRestants calcule un compte à rebours cohérent', () => {
  const app = chargerApplication();
  const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  assert.equal(app.joursRestants(demain), 1);
});

test('estDebutPageAnnexe ignore un renvoi "Annexe n°1" cité en milieu de clause', () => {
  // Régression : une promesse LD Notaires de 52 pages voyait son extraction tronquée dès la
  // page 6 à cause de ce renvoi page 7 ("Un extrait de plan cadastral est annexé. Annexe n°1"),
  // alors que le corps de l'acte se poursuivait jusqu'à la signature, page 52 — aucune pièce
  // jointe n'était en réalité annexée au même PDF.
  const app = chargerApplication();
  const texteClause = `
    Il est ici précisé que le PROMETTANT déclare que le BIEN n'a fait l'objet d'aucune division
    de propriété depuis son acquisition, sans aucune exception ni réserve.
    Un extrait de plan cadastral est annexé. Annexe n°1
    Un extrait de plan Géoportail avec vue aérienne est annexé. Annexe n°2
    HISTORIQUE DE LA PROPRIETE
  `;
  assert.equal(app.estDebutPageAnnexe(texteClause), false);
});

test('estDebutPageAnnexe reconnaît une vraie page d\'annexe (titre en tête, page quasi vide)', () => {
  const app = chargerApplication();
  assert.equal(app.estDebutPageAnnexe('Annexe n°1 — Extrait de plan cadastral'), true);
});

test('estDebutPageAnnexe reconnaît une page de scan courte même si le titre n\'est pas tout en tête', () => {
  const app = chargerApplication();
  // Le titre arrive après 120 caractères, mais la page reste courte dans l'ensemble (< 300) :
  // cas d'un scan avec un bref cartouche avant le titre de l'annexe.
  const texteScan = 'x'.repeat(150) + ' Annexe n°1';
  assert.equal(app.estDebutPageAnnexe(texteScan), true);
});

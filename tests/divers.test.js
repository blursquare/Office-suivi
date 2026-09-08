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

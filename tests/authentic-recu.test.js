'use strict';
// « Reçu d'Authentic » (17/10) : ce qui manque d'après la fiche et les pages gardées. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('manques : page du dossier, fiche client de chaque personne (jamais une société), fiche bien sans parcelle', () => {
  const d = { parties: [{ role: 'VENDEUR', nom: 'Léa ESSAI' }, { role: 'VENDEUR', nom: 'SCI DU TEST', qualitePersonne: 'morale' }, { role: 'ACQUEREUR', nom: 'Paul EXEMPLE' }],
    authentic: { fichesClients: { 'lea essai': { nom: 'Léa ESSAI' } } } };
  const m = app.manquesAuthenticDossier(d, []).map((x) => x.texte).join(' | ');
  assert.match(m, /Page du dossier/);
  assert.match(m, /Fiche client de Paul EXEMPLE/);
  assert.doesNotMatch(m, /Léa ESSAI|SCI/);
  assert.match(m, /Fiche bien/);
  const plein = app.manquesAuthenticDossier(Object.assign({}, d, { bien: { cadastre: { parcelles: [{ section: 'AB', numero: '1' }] } } }), [{ nature: 'dossier' }]).map((x) => x.texte).join(' | ');
  assert.equal(plein, 'Fiche client de Paul EXEMPLE');
  assert.equal(app.libellePageRecueAuthentic({ nature: 'client', cle: 'client:lea essai' }), 'Fiche client — LEA ESSAI');
  assert.equal(app.formatDateHeureCourte('pas une date'), '');
});

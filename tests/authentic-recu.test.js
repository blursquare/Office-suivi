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

// Relecture du 17/10 : une promesse n'est jamais gardée ; seule une page qui désigne CE dossier est relue.
test('relecture : promesse « ignorer », page d’un autre dossier Authentic écartée, page rattachée relue', () => {
  const page = (entete, ref = 'A 2026 00017') => ({ champs: [], tableaux: [], texte: `${ref} VTE MARTEL / FOURNIER\n${entete} Importer avec 6e SENS\nComparants (2)\n1 - Promesse VTE MARTEL/FOURNIER\n2 - VTE MARTEL / FOURNIER` });
  assert.equal(app.clePageReleveAuthentic(page('1 - Promesse VTE MARTEL/FOURNIER')), 'ignorer');
  assert.notEqual(app.clePageReleveAuthentic(page('2 - VTE MARTEL / FOURNIER')), 'ignorer');
  const d = { id: 'v1', nom: 'MARTEL / FOURNIER', referenceAuthentic: 'A 2026 00017' };
  assert.equal(app.pageRelisibleAuthentic(d, page('2 - VTE MARTEL / FOURNIER')), true);
  assert.equal(app.pageRelisibleAuthentic(d, page('1 - Promesse VTE MARTEL/FOURNIER')), false);
  assert.equal(app.pageRelisibleAuthentic(d, page('2 - VTE MARTEL / FOURNIER', 'A 2026 00099')), false, 'autre référence');
  assert.equal(app.pageRelisibleAuthentic({ id: 'v2', nom: 'DURAND / LEROY' }, page('2 - VTE MARTEL / FOURNIER', 'A 2026 00099')), false, 'ne désigne pas ce dossier');
});

test('fiche bien : tout ce que dit chaque onglet est gardé, réuni par libellé', () => {
  const r = app.fusionnerBienAuthentic({ parcelles: [], details: [{ libelle: 'Type de bien', valeur: 'Maison' }, { libelle: 'Usage', valeur: 'Habitation' }] },
    { parcelles: [{ section: 'AB', numero: '1', zone: 'UA' }], details: [{ libelle: 'Usage', valeur: 'Mixte' }, { libelle: 'Surface habitable', valeur: '90 m²' }] });
  assert.equal(r.details.map((x) => `${x.libelle}=${x.valeur}`).join('|'), 'Type de bien=Maison|Usage=Mixte|Surface habitable=90 m²');
  assert.equal(r.parcelles[0].zone, 'UA');
  const d = app.detailsFicheBienAuthentic([{ libelle: 'Type de bien', valeur: 'Maison' }, { libelle: 'Adresse', valeur: '2 rue des Essais' }]);
  assert.equal(d.map((x) => x.libelle).join(','), 'Type de bien');
});

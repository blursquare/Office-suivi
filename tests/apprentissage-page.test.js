'use strict';

// « Ce que CLAIRE a appris » (Réglages, étude 02/10) : synthèse du journal des corrections et libellés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

test('syntheseJournalCorrections : par champ, récentes sur 30 jours, « fréquente » à 3, exemples récents d’abord', () => {
  const journal = [
    { champ: 'prixVente', valeurExtraite: '250000', valeurCorrigee: '245000', date: '2026-09-20T10:00:00Z' },
    { champ: 'prixVente', valeurExtraite: '1', valeurCorrigee: '2', date: '2026-09-28T10:00:00Z' },
    { champ: 'prixVente', valeurExtraite: '3', valeurCorrigee: '4', date: '2026-10-01T10:00:00Z' },
    { champ: 'nom', valeurExtraite: 'A', valeurCorrigee: 'B', date: '2026-10-01T10:00:00Z' },
    { champ: 'nom', valeurExtraite: 'C', valeurCorrigee: 'D', date: '2026-06-01T10:00:00Z' },
    { champ: 'nom', valeurExtraite: 'E', valeurCorrigee: 'F', date: '2026-06-02T10:00:00Z' },
    null
  ];
  const s = app.syntheseJournalCorrections(journal, '2026-10-02T12:00:00Z');
  assert.equal(s.map(g => `${g.champ}:${g.recents}/${g.total}:${g.frequente}`).join(','), 'prixVente:3/3:true,nom:1/3:false');
  assert.equal(s[0].exemples[0].valeurCorrigee, '4');
  assert.equal(s[0].exemples.length, 3);
  assert.equal(app.syntheseJournalCorrections([]).length, 0);
});

test('libelleCorrectionApprise : date ou engagement, échéance personnalisée nommée', () => {
  assert.equal(app.libelleCorrectionApprise({ categorie: 'date', classification: 'pret' }), 'Date classée « Obtention du prêt »');
  assert.equal(app.libelleCorrectionApprise({ classification: 'autre', libelle: 'Permis de construire' }), 'Date classée « Autre échéance » « Permis de construire »');
  assert.equal(app.libelleCorrectionApprise({ categorie: 'engagement', classification: 'travaux' }), 'Engagement classé « Travaux »');
});

test('diffCorrectionsExtraction : un notaire lu puis changé est noté, un notaire non transmis ne l’est pas', () => {
  const extraction = { champs: {}, dates: {}, notaires: { vendeur: { nom: 'DUPONT', prenom: 'Jean' }, liste: [] } };
  const avec = app.diffCorrectionsExtraction(extraction, { notaireVendeur: 'Maître Sophie GOSSART' });
  assert.ok(avec.some(e => e.champ === 'notaireVendeur'));
  const sans = app.diffCorrectionsExtraction(extraction, {});
  assert.ok(!sans.some(e => e.champ === 'notaireVendeur'));
});

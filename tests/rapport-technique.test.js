'use strict';
// Encart « Rapport technique » des Réglages et file d'événements envoyée au serveur (30/09).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('messageRapportTechnique : désactivé, sans jeton, erreur, envoyé, jamais envoyé', () => {
  assert.equal(app.messageRapportTechnique({ actif: false }).titre, 'Rapport technique désactivé.');
  assert.equal(app.messageRapportTechnique({ actif: true, jetonEnregistre: false }).niveau, 'alerte');
  const erreur = app.messageRapportTechnique({ actif: true, jetonEnregistre: true, derniereErreur: 'Jeton GitHub refusé.' });
  assert.equal(erreur.niveau, 'alerte');
  assert.match(erreur.detail, /Jeton GitHub refusé/);
  const ok = app.messageRapportTechnique({ actif: true, jetonEnregistre: true, dernierEnvoi: { at: '2026-09-30T15:00:00.000Z', numero: 12, calme: false, points: 3, url: 'https://github.com/x/y/issues/12' } });
  assert.equal(ok.niveau, 'ok');
  assert.match(ok.titre, /n° 12/);
  assert.equal(ok.detail, '3 point(s) à examiner.');
  assert.equal(app.messageRapportTechnique({ actif: true, jetonEnregistre: true }).niveau, 'neutre');
});

test('noterJournalTechnique : file bornée, version jointe, événement vide ignoré', () => {
  app.fileJournalTechnique.length = 0;
  app.noterJournalTechnique(null);
  app.noterJournalTechnique({ categorie: 'correction-extraction', champ: 'prixVente', origine: 'regex' });
  assert.equal(app.fileJournalTechnique.length, 1);
  assert.equal(app.fileJournalTechnique[0].champ, 'prixVente');
  assert.ok(app.fileJournalTechnique[0].version);
  for (let i = 0; i < 80; i++) app.noterJournalTechnique({ categorie: 'erreur-poste', message: 'x' + i });
  assert.equal(app.fileJournalTechnique.length, app.MAX_FILE_JOURNAL_TECHNIQUE);
  app.fileJournalTechnique.length = 0;
});

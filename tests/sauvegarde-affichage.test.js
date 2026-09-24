'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

const destNas = { dossier: '\\\\NAS\\Sauvegardes', locale: false };

test('sauvegarde récente et réussie : vert, avec le nombre de dossiers et l\'emplacement', () => {
  const m = app.messageEtatSauvegarde({
    actif: true, destination: destNas, joursDepuisDerniere: 0, joursAvantAlerte: 3,
    derniereReussie: '2026-09-24T10:00:00.000Z',
    derniereTentative: { ok: true, nbDossiers: 58, at: '2026-09-24T10:00:00.000Z' }
  });
  assert.equal(m.niveau, 'ok');
  assert.match(m.titre, /58 dossiers/);
  assert.match(m.emplacement, /NAS/);
});

test('dernière tentative en échec : alerte, avec l\'erreur, même si une réussite existe', () => {
  const m = app.messageEtatSauvegarde({
    actif: true, destination: destNas, joursDepuisDerniere: 1, joursAvantAlerte: 3,
    derniereReussie: '2026-09-23T10:00:00.000Z',
    derniereTentative: { ok: false, erreur: 'EACCES: permission denied' }
  });
  assert.equal(m.niveau, 'alerte');
  assert.match(m.detail, /EACCES/);
});

test('trop ancienne : alerte au-delà du seuil, pas avant', () => {
  const base = { actif: true, destination: destNas, joursAvantAlerte: 3, derniereReussie: '2026-09-20T10:00:00.000Z', derniereTentative: { ok: true } };
  assert.equal(app.messageEtatSauvegarde({ ...base, joursDepuisDerniere: 2 }).niveau, 'ok');
  const m = app.messageEtatSauvegarde({ ...base, joursDepuisDerniere: 4 });
  assert.equal(m.niveau, 'alerte');
  assert.match(m.titre, /4 jours/);
});

test('jamais faite : neutre (pas une alerte) tant qu\'aucun échec ; dossier local signalé', () => {
  const m = app.messageEtatSauvegarde({ actif: true, destination: { dossier: 'C:\\CLAIRE\\data\\sauvegardes', locale: true }, derniereReussie: null, derniereTentative: null });
  assert.equal(m.niveau, 'neutre');
  assert.match(m.emplacement, /sur ce poste/);
  assert.equal(app.messageEtatSauvegarde({ actif: true, destination: destNas, derniereTentative: { ok: false, erreur: 'x' } }).niveau, 'alerte');
});

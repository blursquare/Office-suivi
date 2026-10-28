'use strict';

// Une routine faite (« Terminé » ou « Déjà fait ») valide la tâche de la même étape dans le dossier, et une pastille dit sur la ligne du dossier
// qu'une routine attend (étude 28/10).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const AUJOURDHUI = '2026-10-28';

test('appel de fonds : « routine faite » coche l’étape, sauf si elle l’est déjà', () => {
  const p = { routine: 'appel-fonds', dossierId: 'd1' };
  const t = app.tacheDossierDeProposition({ id: 'd1' }, p, AUJOURDHUI);
  assert.equal(t && t.type, 'appelFonds');
  assert.equal(app.tacheDossierDeProposition({ id: 'd1', appelFonds: '2026-10-20' }, p, AUJOURDHUI), null, 'déjà envoyé : rien à valider');
});

test('revue du matin : seule la relance de l’offre de prêt a une tâche équivalente, et seulement si une relance est due', () => {
  const pret = { routine: 'revue-matin', dossierId: 'd1', details: { modele: 'pret' } };
  assert.equal(app.tacheDossierDeProposition({ id: 'd1' }, pret, AUJOURDHUI).type, 'pret');
  assert.equal(app.tacheDossierDeProposition({ id: 'd1', derniereRelanceAuto: AUJOURDHUI }, pret, AUJOURDHUI), null, 'relancée aujourd’hui : rien à valider');
  const autre = { routine: 'revue-matin', dossierId: 'd1', details: { modele: 'pieces' } };
  assert.equal(app.tacheDossierDeProposition({ id: 'd1' }, autre, AUJOURDHUI), null, 'une autre ligne de la revue ne coche rien');
});

test('les autres routines, un dossier archivé ou une succession ne cochent rien', () => {
  for (const routine of ['relance-pieces', 'proposition-dates', 'reponses-emails', 'constitution', 'veille-signature', 'autorisations-notoriete', 'formalites-authentic', 'veille-juridique']) {
    assert.equal(app.tacheDossierDeProposition({ id: 'd1' }, { routine, dossierId: 'd1' }, AUJOURDHUI), null, routine);
  }
  const p = { routine: 'appel-fonds', dossierId: 'd1' };
  assert.equal(app.tacheDossierDeProposition({ id: 'd1', archive: true }, p, AUJOURDHUI), null);
  assert.equal(app.tacheDossierDeProposition({ id: 'd1', typeAffaire: 'succession' }, p, AUJOURDHUI), null);
  assert.equal(app.tacheDossierDeProposition(null, p, AUJOURDHUI), null);
  assert.equal(app.tacheDossierDeProposition({ id: 'd1' }, null, AUJOURDHUI), null);
});

test('pastille « routine en attente » : seulement pour les propositions à décider de CE dossier', () => {
  app.propositionsClaire.liste = [
    { id: 'a', dossierId: 'd1', etat: 'proposee', type: 'email' },
    { id: 'b', dossierId: 'd1', etat: 'vue', type: 'alerte' },
    { id: 'c', dossierId: 'd2', etat: 'proposee', type: 'document' },
    { id: 'e', dossierId: 'd1', etat: 'acceptee', type: 'document' }
  ];
  const html = app.tagRoutineEnAttente({ id: 'd1' });
  assert.match(html, /1 routine en attente/);
  assert.equal(app.tagRoutineEnAttente({ id: 'd3' }), '');
  assert.equal(app.tagRoutineEnAttente({ id: 'd1', archive: true }), '');
  app.propositionsClaire.liste = [];
  assert.equal(app.tagRoutineEnAttente({ id: 'd1' }), '');
});

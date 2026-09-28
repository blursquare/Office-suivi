'use strict';

// Obtention du prêt et vente préalable posées dans le calendrier partagé de l'office (voir
// synchroniserEcheanceAgenda dans script.js et /exchange/echeance côté serveur). Ici, la décision
// PURE : que faire (créer, déplacer, retirer, rien) pour que l'agenda reflète le dossier — et la
// règle de l'étude : un contrôle automatique ne crée jamais, seul un geste sur la date le fait.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const pose = (date) => ({ itemId: 'ID1', changeKey: 'CK1', date });

test('un dossier existant, jamais posé, n\'est pas repris par un contrôle automatique', () => {
  const d = { id: 'a', nom: 'X / Y', pret: '2026-10-14' };
  assert.equal(app.actionEcheanceAgenda(d, 'pret', false), null);
  // …mais l'est dès que l'étude touche à la date.
  assert.equal(app.actionEcheanceAgenda(d, 'pret', true), 'creer');
});

test('date changée → déplacer ; date inchangée → rien', () => {
  const d = { id: 'a', nom: 'X / Y', pret: '2026-10-20', agendaEcheances: { pret: pose('2026-10-14') } };
  assert.equal(app.actionEcheanceAgenda(d, 'pret', false), 'modifier');
  d.pret = '2026-10-14';
  assert.equal(app.actionEcheanceAgenda(d, 'pret', false), null);
});

test('condition levée, date effacée ou dossier archivé → retirer', () => {
  const base = () => ({ id: 'a', nom: 'X / Y', pret: '2026-10-14', ventebien: '2026-09-30', agendaEcheances: { pret: pose('2026-10-14'), ventebien: pose('2026-09-30') } });
  assert.equal(app.actionEcheanceAgenda({ ...base(), offrePretStatut: 'recue' }, 'pret', false), 'supprimer');
  assert.equal(app.actionEcheanceAgenda({ ...base(), echeancesValidees: { ventebien: true } }, 'ventebien', false), 'supprimer');
  assert.equal(app.actionEcheanceAgenda({ ...base(), pret: '', sansPret: true }, 'pret', false), 'supprimer');
  assert.equal(app.actionEcheanceAgenda({ ...base(), archive: true }, 'ventebien', true), 'supprimer');
  // Une offre seulement « à confirmer » n'est pas reçue : l'événement reste.
  assert.equal(app.actionEcheanceAgenda({ ...base(), offrePretStatut: 'aconfirmer' }, 'pret', false), null);
});

test('import d\'une sauvegarde : identifiants d\'agenda conservés et assainis', () => {
  const r = app.agendaEcheancesImportees({
    pret: pose('2026-10-14'),
    ventebien: { itemId: '', date: '2026-09-30' },   // sans identifiant : inutilisable
    acte: pose('2026-11-01'),                          // type non géré
  });
  assert.equal(Object.keys(r).join(','), 'pret');
  assert.equal(r.pret.itemId, 'ID1');
  assert.equal(JSON.stringify(app.agendaEcheancesImportees(null)), '{}');
  const d = app.normaliserDossierImporte({ id: 'x', nom: 'A / B', pret: '2026-10-14', agendaEcheances: { pret: pose('2026-10-14') } }, 'f.json');
  assert.equal(d.agendaEcheances.pret.changeKey, 'CK1');
});

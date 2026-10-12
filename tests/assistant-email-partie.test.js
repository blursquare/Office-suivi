'use strict';

// « Demander à CLAIRE » (12/10) : « Prépare un email aux vendeurs pour indiquer que le rendez-vous de signature est le vendredi
// 5 novembre à 17 h » — l'email partait à l'acquéreur, sans la date ; et le 5 novembre 2026 est un jeudi.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../commun/assistant.js');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('un jour de semaine qui ne correspond pas à la date est repéré', () => {
  assert.equal(A.jourSemaineContredit('le rendez-vous est le vendredi 5 novembre à 17h', '2026-11-05'), 'jeudi');
  assert.equal(A.jourSemaineContredit('le jeudi 5 novembre à 17h', '2026-11-05'), '');
  assert.equal(A.jourSemaineContredit('le 5 novembre à 17h', '2026-11-05'), '');
  const r = A.interpreterParMotsCles('Prépare un email aux vendeurs pour indiquer que le rendez-vous de signature est le vendredi 5 novembre à 17h', { aujourdhui: '2026-10-12' });
  assert.equal(r.parametres.partie, 'vendeur');
  assert.equal(r.parametres.date, '2026-11-05');
  assert.equal(r.parametres.heure, '17:00');
});

test('l’email va à la partie demandée ; le vendeur accompagné de son notaire : au confrère', () => {
  const d = { id: 'e1', nom: 'MOREL / ROCHE', emailVendeur: 'vendeur@exemple.fr', emailAcquereur: 'acq@exemple.fr' };
  const v = app.destinataireEmailAssistant(d, 'vendeur');
  assert.equal(v.email, 'vendeur@exemple.fr');
  assert.equal(v.confrere, false);
  assert.equal(app.destinataireEmailAssistant({ ...d, emailVendeur: '' }, 'vendeur').erreur.includes('Aucun email du vendeur'), true);
  assert.equal(app.destinataireEmailAssistant(d, '').email, undefined, 'sans partie : la règle du modèle');
});

test('la confirmation du rendez-vous suit le rendez-vous et le destinataire imposés', () => {
  const d = { id: 'e2', nom: 'MOREL / ROCHE', rendezVousSignature: '2026-11-05', rendezVousSignatureHeure: '17:00' };
  const client = app.construireEmailConfirmationRdv(d, { confrere: false });
  assert.match(client.corps, /5 novembre/);
  assert.match(client.corps, /17/);
});

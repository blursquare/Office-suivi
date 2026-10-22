'use strict';

// Tâches du jour (étude 22/10, client/104-taches-affaire.js) : étapes et factures des successions, choix Tout / Ventes / Successions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const AUJ = '2026-10-22';
const succ = (extra) => Object.assign({ id: 's1', nom: 'SUCC LEROY', typeAffaire: 'succession', sansPret: true, responsable: 'Julie VASSELIN', biens: [{ adresse: 'X' }],
  parties: [{ role: 'PARTIE', nom: 'LEROY', prenom: 'Hélène' }], succession: { type: 'classique', ouvertureLe: '2026-09-25' }, historique: [], echeancesValidees: {} }, extra);

test('filtre Tout / Ventes / Successions', () => {
  const app = chargerApplication();
  const actions = [{ cle: 'a', dossier: { id: 'v', nom: 'VTE X' } }, { cle: 'b', dossier: { id: 's', typeAffaire: 'succession', nom: 'SUCC Y' } }];
  assert.equal(app.filtrerActionsParAffaire(actions, 'tout').length, 2);
  assert.equal(app.filtrerActionsParAffaire(actions, 'vente').map(a => a.cle).join(), 'a');
  assert.equal(app.filtrerActionsParAffaire(actions, 'succession').map(a => a.cle).join(), 'b');
  assert.equal(app.filtrerActionsParAffaire(actions, 'n’importe quoi').length, 2);
});

test('étapes d’une succession : tâche à l’approche de la date, jamais le FCDDV, rien pour une vente', () => {
  const app = chargerApplication();
  const d = succ({ succession: { type: 'classique', ouvertureLe: '2026-09-25', rendezVous: [{ id: 'r', etape: 'notoriete', titre: 'NOTO LEROY', date: '2026-10-26', heure: '10:00' }] } });
  const types = app.tachesEtapesSuccession(d, AUJ).map(t => t.type);
  assert.ok(types.includes('notoriete'), types.join());
  assert.ok(!types.includes('fcddv'));
  const loin = succ({ succession: { type: 'classique', ouvertureLe: '2026-09-25', rendezVous: [{ id: 'r', etape: 'notoriete', titre: 'NOTO LEROY', date: '2026-12-20', heure: '10:00' }] } });
  assert.ok(!app.tachesEtapesSuccession(loin, AUJ).some(t => t.type === 'notoriete'), 'trop loin : pas encore une tâche');
  assert.equal(app.tachesEtapesSuccession({ id: 'v', nom: 'VTE X' }, AUJ).length, 0);
  assert.equal(app.tachesEtapesSuccession(Object.assign({}, d, { archive: true }), AUJ).length, 0);
});

test('comptes et fonds : tâches dès la notoriété signée (transfert avec conjoint, déblocage sinon)', () => {
  const app = chargerApplication();
  const signee = { notoriete: true };
  const heritiers = succ({ echeancesValidees: signee });
  assert.ok(app.tachesEtapesSuccession(heritiers, AUJ).some(t => t.type === 'deblocageFonds'));
  const conjoint = succ({ echeancesValidees: signee, succession: { type: 'classique', ouvertureLe: '2026-09-25', conjointSurvivant: true } });
  const t = app.tachesEtapesSuccession(conjoint, AUJ).map(x => x.type);
  assert.ok(t.includes('transfertComptes') && !t.includes('deblocageFonds'), t.join());
  const faite = succ({ echeancesValidees: { notoriete: true, deblocageFonds: true } });
  assert.ok(app.tachesEtapesSuccession(faite, AUJ).some(x => x.type === 'receptionFonds'), 'fonds débloqués : vérifier la réception');
});

test('factures à régler : une tâche par facture non réglée, clé unique', () => {
  const app = chargerApplication();
  const d = succ({ succession: { type: 'classique', ouvertureLe: '2026-09-25', factures: [
    { id: 'f1', organisme: 'EDF', montant: 120.5, recueLe: '2026-10-20', regleeLe: '' },
    { id: 'f2', organisme: 'Orange', montant: 30, recueLe: '2026-10-21', regleeLe: '' },
    { id: 'f3', organisme: 'Eau', montant: 10, recueLe: '2026-10-01', regleeLe: '2026-10-05' }] } });
  const t = app.tachesFacturesSuccession(d);
  assert.equal(t.length, 2);
  assert.notEqual(t[0].cle, t[1].cle);
  assert.ok(t[0].titre.startsWith('Régler la facture'), t[0].titre);
  assert.equal(t[0].type, 'factureSuccession');
  assert.equal(app.tachesFacturesSuccession({ id: 'v', nom: 'VTE X' }).length, 0);
});

test('actionsDuJour : les tâches de succession y figurent (étapes, factures)', () => {
  const app = chargerApplication();
  const d = succ({ echeancesValidees: { notoriete: true }, succession: { type: 'classique', ouvertureLe: '2026-09-25', factures: [{ id: 'f1', organisme: 'EDF', montant: 50, recueLe: '2026-10-20', regleeLe: '' }] } });
  const { actions } = app.actionsDuJour([d], AUJ);
  const types = actions.map(a => a.type);
  assert.ok(types.includes('factureSuccession') && types.includes('deblocageFonds'), types.join());
  assert.ok(app.TYPES_TACHES_ETAPES_SUCCESSION.every(t => !types.includes('fcddv') && t !== 'fcddv'));
});

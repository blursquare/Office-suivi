'use strict';

// Dates butoir (prêt, vente préalable) posées par le serveur dans le calendrier partagé (voir
// src/echeancesAgenda.js), seule voie depuis la suppression du flux .ics publié. Le plus important à
// couvrir : jamais de doublon dans l'agenda de l'office, jamais une date qui n'a pas à y être.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  planPoseEcheances, poserEcheancesManquantes, sujetEcheanceAgenda, DELAI_APRES_MODIFICATION_MS
} = require('../src/echeancesAgenda');
const { ouvrirDb } = require('../src/db');
const { creerDepot } = require('../src/dossiersRepo');

const AUJOURDHUI = '2026-09-29';
const MAINTENANT = Date.UTC(2026, 8, 29, 10, 0);
const ANCIEN = MAINTENANT - 60 * 60 * 1000;

function dossier(extra) {
  return { id: 'd1', nom: 'DUPONT / MARTIN', pret: '2026-10-20', updatedAt: ANCIEN, ...extra };
}

test('titre de l’événement : libellé, acquéreur et dossier — jamais « VTE - »', () => {
  assert.equal(sujetEcheanceAgenda(dossier(), 'pret'), 'Obtention du prêt — MARTIN - Dossier DUPONT / MARTIN');
  assert.equal(sujetEcheanceAgenda(dossier(), 'ventebien'), 'Vente préalable — MARTIN - Dossier DUPONT / MARTIN');
});

test('plan : crée une date souhaitée non posée, rien pour une condition levée ou déjà posée', () => {
  const dossiers = [
    dossier({ ventebien: '2026-11-05' }),
    dossier({ id: 'recue', offrePretStatut: 'recue' }),
    dossier({ id: 'comptant', sansPret: true }),
    dossier({ id: 'realisee', pret: '', ventebien: '2026-11-05', echeancesValidees: { ventebien: true } }),
    dossier({ id: 'posee', agendaEcheances: { pret: { itemId: 'X', changeKey: 'C', date: '2026-10-20' } } }),
    dossier({ id: 'archive', archive: true }),
    dossier({ id: 'passee', pret: '2026-09-01' })
  ];
  const plan = planPoseEcheances(dossiers, [], AUJOURDHUI, MAINTENANT);
  assert.equal(plan.map((p) => `${p.dossierId}:${p.type}:${p.action}`).join(' '), 'd1:pret:creer d1:ventebien:creer');
});

test('plan : un événement déjà présent au même titre et à la même date est adopté, pas recréé', () => {
  const d = dossier();
  const evenements = [
    { itemId: 'EXISTANT', changeKey: 'CK', subject: sujetEcheanceAgenda(d, 'pret'), start: '2026-10-19T22:00:00Z', end: '2026-10-20T22:00:00Z', allDay: true }
  ];
  const plan = planPoseEcheances([d], evenements, AUJOURDHUI, MAINTENANT);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].action, 'adopter');
  assert.equal(plan[0].itemId, 'EXISTANT');
  // Autre date, ou événement annulé : pas le même, on crée.
  const autreDate = [{ ...evenements[0], start: '2026-10-20T22:00:00Z' }];
  assert.equal(planPoseEcheances([d], autreDate, AUJOURDHUI, MAINTENANT)[0].action, 'creer');
  const annule = [{ ...evenements[0], cancelled: true }];
  assert.equal(planPoseEcheances([d], annule, AUJOURDHUI, MAINTENANT)[0].action, 'creer');
});

test('plan : un dossier modifié à l’instant est laissé au poste qui le modifie', () => {
  const recent = dossier({ updatedAt: MAINTENANT - 30 * 1000 });
  assert.equal(planPoseEcheances([recent], [], AUJOURDHUI, MAINTENANT).length, 0);
  const passe = dossier({ updatedAt: MAINTENANT - DELAI_APRES_MODIFICATION_MS - 1000 });
  assert.equal(planPoseEcheances([passe], [], AUJOURDHUI, MAINTENANT).length, 1);
});

function reponseCreation(id) {
  return { statusCode: 200, body: `<m:CreateItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items><t:CalendarItem><t:ItemId Id="${id}" ChangeKey="CK-${id}"/></t:CalendarItem></m:Items></m:CreateItemResponseMessage>` };
}

test('poserEcheancesManquantes : crée dans le calendrier partagé, garde l’identifiant, journalise', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', pret: '2099-10-20' });
  const appels = [];
  const poster = (o, cb) => { appels.push(o); setImmediate(() => cb(null, reponseCreation('NOUVEAU'))); };
  const reglages = { url: 'https://x.test/EWS/Exchange.asmx', email: 'b@etude.test', motDePasse: 'm', calendrierPartage: 'sophie@etude.test' };
  const r = await poserEcheancesManquantes(depot, reglages, [], AUJOURDHUI, { poster }, Date.now() + DELAI_APRES_MODIFICATION_MS + 1000);
  assert.equal(r.erreur, null);
  assert.equal(r.posees.length, 1);
  assert.equal(appels.length, 1);
  assert.match(appels[0].body, /<t:EmailAddress>sophie@etude\.test<\/t:EmailAddress>/);
  assert.match(appels[0].body, /Obtention du prêt — MARTIN - Dossier DUPONT \/ MARTIN/);
  assert.match(appels[0].body, /<t:IsAllDayEvent>true<\/t:IsAllDayEvent>/);
  const d = depot.trouverParId('d1');
  assert.deepEqual(d.agendaEcheances.pret, { itemId: 'NOUVEAU', changeKey: 'CK-NOUVEAU', date: '2099-10-20' });
  assert.match(d.historique[d.historique.length - 1].texte, /posée dans l’agenda Outlook \(20\/10\/2099\)/);
  // Tour suivant : déjà posée, plus aucun appel.
  await poserEcheancesManquantes(depot, reglages, [], AUJOURDHUI, { poster }, Date.now() + DELAI_APRES_MODIFICATION_MS + 1000);
  assert.equal(appels.length, 1);
  db.close();
});

test('poserEcheancesManquantes : refus d’identifiants → arrêt au premier essai, signalé', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', pret: '2099-10-20', ventebien: '2099-10-01' });
  depot.creer({ id: 'd2', nom: 'DURAND / LEROY', pret: '2099-11-20' });
  let n = 0;
  const poster = (o, cb) => { n++; setImmediate(() => cb(null, { statusCode: 401, body: '' })); };
  const r = await poserEcheancesManquantes(depot, { url: 'https://x', email: 'e', motDePasse: 'm' }, [], AUJOURDHUI, { poster }, Date.now() + DELAI_APRES_MODIFICATION_MS + 1000);
  assert.equal(n, 1);
  assert.equal(r.identifiantsRefuses, true);
  assert.equal(r.posees.length, 0);
  assert.equal(depot.trouverParId('d1').agendaEcheances, undefined);
  db.close();
});

test('poserEcheancesManquantes : adoption sans aucune écriture dans l’agenda', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', pret: '2099-10-20' });
  let n = 0;
  const poster = (o, cb) => { n++; setImmediate(() => cb(null, reponseCreation('X'))); };
  const evenements = [{ itemId: 'EXISTANT', changeKey: 'CK', subject: 'Obtention du prêt — MARTIN - Dossier DUPONT / MARTIN', start: '2099-10-19T22:00:00Z', end: '2099-10-20T22:00:00Z', allDay: true }];
  const r = await poserEcheancesManquantes(depot, {}, evenements, AUJOURDHUI, { poster });
  assert.equal(n, 0);
  assert.equal(r.posees[0].adoptee, true);
  assert.equal(depot.trouverParId('d1').agendaEcheances.pret.itemId, 'EXISTANT');
  db.close();
});

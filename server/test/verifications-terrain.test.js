'use strict';

// Vérifications sur le terrain (src/verificationsTerrain.js, src/routes/verificationsTerrain.js) :
// chaque point se coche seul quand le geste réussit au bureau, ou à la main ; le rapport technique en
// reprend l'état sans jamais laisser sortir un nom ni un numéro.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const {
  VERIFICATIONS_TERRAIN, appliquerObservation, statutVerification, assainirVerifications, listeVerifications,
  sectionVerificationsTerrain, echecsVerificationsPeriode, noterVerification, lireVerifications, formeNumero, comparerVersions } = require('../src/verificationsTerrain');
const { construireRapport } = require('../src/rapportTechnique');

test('catalogue : identifiants uniques, sources connues, version et titre renseignés', () => {
  const ids = VERIFICATIONS_TERRAIN.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const v of VERIFICATIONS_TERRAIN) {
    assert.ok(['serveur', 'poste', 'manuel'].includes(v.source), v.id);
    assert.match(v.depuis, /^\d+\.\d+\.\d+$/, v.id + ' : numéro de version');
    assert.ok(v.titre && v.comment, v.id);
  }
});

test('observation : réussite cochée une fois pour toutes, échec compté, point inconnu ignoré', () => {
  let etat = {};
  etat = appliquerObservation(etat, 'piece-jointe-nas', { ok: false, message: 'Dossier client introuvable' }, '2026-10-03T08:00:00.000Z');
  const def = VERIFICATIONS_TERRAIN.find((v) => v.id === 'piece-jointe-nas');
  assert.equal(statutVerification(def, etat['piece-jointe-nas']), 'echec');
  etat = appliquerObservation(etat, 'piece-jointe-nas', { detail: 'à la racine du dossier' }, '2026-10-03T09:00:00.000Z');
  etat = appliquerObservation(etat, 'piece-jointe-nas', {}, '2026-10-03T10:00:00.000Z');
  const e = etat['piece-jointe-nas'];
  assert.equal(statutVerification(def, e), 'verifie');
  assert.equal(`${e.premiereFois} ${e.fois} ${e.echecs} ${e.detail}`, '2026-10-03T09:00:00.000Z 2 1 à la racine du dossier');
  assert.equal(appliquerObservation(etat, 'inconnu', {}), etat);
  assert.deepEqual(Object.keys(assainirVerifications({ ...etat, pirate: { fois: 3 } })), ['piece-jointe-nas']);
});

test('point manuel : confirmé, puis signalé comme ne marchant pas', () => {
  const def = VERIFICATIONS_TERRAIN.find((v) => v.id === 'notification-logo');
  assert.equal(statutVerification(def, null), 'attente');
  assert.equal(statutVerification(def, { confirmeLe: '2026-10-03T09:00:00.000Z' }), 'verifie');
  assert.equal(statutVerification(def, { confirmeLe: '2026-10-03T09:00:00.000Z', infirmeLe: '2026-10-03T10:00:00.000Z' }), 'echec');
});

test('formeNumero : la forme du numéro, jamais ses chiffres', () => {
  assert.equal(formeNumero('+33254123456'), '+33 et 9 chiffres');
  assert.equal(formeNumero('0254123456'), '10 chiffres (0…)');
  assert.equal(formeNumero('0033254123456'), '0033 et 9 chiffres');
  assert.equal(formeNumero(''), 'sans chiffre');
  assert.ok(!/254|123|456/.test(formeNumero('0254123456')));
});

test('rapport : section des vérifications, échec de la période à examiner, aucun nom ni numéro', () => {
  let etat = {};
  etat = appliquerObservation(etat, '3cx-sonnerie', { detail: formeNumero('0254123456') }, '2026-10-03T08:10:00.000Z');
  etat = appliquerObservation(etat, 'emails-envoyes-collaborateur', { ok: false, message: 'Accès refusé à julie.vasselin@etude.fr pour DURAND' }, '2026-10-03T09:00:00.000Z');
  const depuis = '2026-10-03T05:00:00.000Z', jusqua = '2026-10-03T10:00:00.000Z';
  assert.equal(echecsVerificationsPeriode(etat, depuis, jusqua).map((v) => v.id).join(), 'emails-envoyes-collaborateur');
  const lignes = sectionVerificationsTerrain(etat, depuis, jusqua).join('\n');
  assert.match(lignes, /## Vérifications sur le terrain \(1\/\d+ vérifiées\)/);
  assert.match(lignes, /✅ 3CX : une sonnerie reçue.*\*\*nouveau\*\*.*10 chiffres/);
  assert.match(lignes, /⚠️ Emails des dossiers : « Éléments envoyés »/);
  assert.match(lignes, /⬜ Le logo de CLAIRE apparaît.*à confirmer à la main/);
  const r = construireRapport({
    depuis, jusqua, mots: new Set(['DURAND', 'JULIE', 'VASSELIN']), dossiers: [], evenements: [], verificationsTerrain: etat
  });
  assert.match(r.corps, /Vérifications sur le terrain/);
  assert.ok(r.titre.includes('point(s) à examiner'));
  assert.match(r.corps, /1 vérification\(s\) sur le terrain en échec/);
  for (const interdit of ['DURAND', 'julie.vasselin', '0254123456', '254123456']) assert.ok(!r.corps.includes(interdit), interdit);
});

let db, serveur, base, parametresRepo;
before(async () => {
  db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { motDePasse: 'x', racineRepo: os.tmpdir(), port: 0, authActive: false } });
  parametresRepo = creerRepoParametres(db);
  serveur = app.listen(0);
  await new Promise((ok) => serveur.once('listening', ok));
  base = `http://127.0.0.1:${serveur.address().port}`;
});
after(() => { serveur.close(); db.close(); });
const poster = (chemin, corps) => fetch(base + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

test('routes : liste, observation d’une fenêtre (points « poste » seulement), confirmation manuelle', async () => {
  const liste = await (await fetch(base + '/api/verifications-terrain')).json();
  assert.equal(liste.verifications.length, VERIFICATIONS_TERRAIN.length);
  assert.ok(liste.verifications.every((v) => v.statut === 'attente'));
  assert.equal((await poster('/api/verifications-terrain/noter', { id: 'notification-navigateur' })).status, 200);
  assert.equal((await poster('/api/verifications-terrain/noter', { id: 'maj-auto' })).status, 400, 'un point du serveur ne se coche pas depuis un poste');
  assert.equal((await poster('/api/verifications-terrain/confirmer', { id: 'maj-auto', confirme: true })).status, 400, 'un point automatique ne se confirme pas à la main');
  const apres = await (await poster('/api/verifications-terrain/confirmer', { id: 'notification-logo', confirme: true })).json();
  const statut = (id) => apres.verifications.find((v) => v.id === id).statut;
  assert.equal(`${statut('notification-navigateur')} ${statut('notification-logo')} ${statut('maj-auto')}`, 'verifie verifie attente');
});

test('3CX : la sonnerie coche la vérification avec la forme du numéro, jamais le numéro', async () => {
  const r = await fetch(base + '/appel?numero=0254123456&nom=undefined&poste=Julie');
  assert.equal(r.status, 200);
  const e = lireVerifications(parametresRepo)['3cx-sonnerie'];
  assert.ok(e && e.premiereFois);
  assert.equal(e.detail, '10 chiffres (0…)');
  assert.ok(!JSON.stringify(lireVerifications(parametresRepo)).includes('0254123456'));
});

test('noterVerification : une réussite répétée dans l’heure ne réécrit pas la base', () => {
  noterVerification(parametresRepo, 'sondage-reponse', { detail: 'réponse par bouton' });
  const premiere = lireVerifications(parametresRepo)['sondage-reponse'];
  noterVerification(parametresRepo, 'sondage-reponse', { detail: 'réponse par bouton' });
  assert.equal(lireVerifications(parametresRepo)['sondage-reponse'].fois, premiere.fois);
  noterVerification(parametresRepo, 'sondage-reponse', { detail: 'réponse par la page' });
  assert.equal(lireVerifications(parametresRepo)['sondage-reponse'].fois, premiere.fois + 1, 'un détail nouveau est noté');
});

test('listeVerifications : la plus récente mise à jour d’abord', () => {
  const l = listeVerifications({});
  for (let i = 1; i < l.length; i++) assert.ok(comparerVersions(l[i - 1].depuis, l[i].depuis) >= 0, `${l[i - 1].depuis} avant ${l[i].depuis}`);
});

'use strict';

// Signalements de problèmes (routes/signalements.js) : création par n'importe quel poste,
// notification immédiate d'un bloquant, tri et export par l'étude.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { validerSignalement, texteNotificationSignalement } = require('../src/routes/signalements');

const envois = [];
const envoyerEmailFn = async (reglages, destinataire, message) => {
  envois.push({ destinataire, texte: typeof message === 'string' ? message : message.texte });
  return { ok: true, erreur: null };
};

let db, serveurApp, baseUrl, jeton;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' }, envoyerEmailFn });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  db.close();
});

function appel(chemin, options = {}) {
  return fetch(baseUrl + chemin, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('validerSignalement : gravité et description exigées, capture contrôlée', () => {
  assert.ok(validerSignalement({ action: 'x' }).erreur);
  assert.ok(validerSignalement({ gravite: 'bloquant' }).erreur);
  assert.ok(validerSignalement({ gravite: 'genant', constat: 'x', capture: 'data:text/html;base64,PGI+' }).erreur);
  const ok = validerSignalement({ gravite: 'idee', action: '  Ajouter un tri ', capture: PNG, contexte: { version: '2026-09-24 20:00' } });
  assert.equal(ok.valeur.action, 'Ajouter un tri');
  assert.equal(ok.valeur.capture, PNG);
  assert.equal(ok.valeur.contexte.version, '2026-09-24 20:00');
  // Un contexte démesuré est borné, les erreurs JS tronquées en premier.
  const erreurs = Array.from({ length: 200 }, (_, i) => ({ message: 'x'.repeat(200) + i }));
  const borne = validerSignalement({ gravite: 'genant', constat: 'y', contexte: { version: 'v', erreurs } });
  assert.ok(JSON.stringify(borne.valeur.contexte).length <= 20000);
});

test('texteNotificationSignalement : dit qui, quoi, où', () => {
  const t = texteNotificationSignalement({ auteur: 'Julie VASSELIN', action: 'Ouvrir le compromis', constat: 'Rien ne se passe',
    contexte: { onglet: 'Suivi des dossiers', dossierNom: 'DUPONT / MARTIN', version: '2026-09-24 20:00' } });
  assert.match(t, /BLOQUANT signalé par Julie VASSELIN/);
  assert.match(t, /Rien ne se passe/);
  assert.match(t, /dossier DUPONT \/ MARTIN/);
  assert.match(t, /version 2026-09-24 20:00/);
});

test('authentification requise', async () => {
  assert.equal((await fetch(baseUrl + '/api/signalements')).status, 401);
});

test('un bloquant prévient l’adresse de copie de l’étude, un gênant non', async () => {
  await appel('/api/reglages', { method: 'PUT', body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: 'etude@etude.fr', emailsResponsables: {} }) });
  envois.length = 0;
  const r1 = await appel('/api/signalements', { method: 'POST', body: JSON.stringify({ gravite: 'genant', constat: 'Libellé coupé' }) });
  assert.equal(r1.status, 201);
  assert.equal((await r1.json()).notifie, false);
  assert.equal(envois.length, 0);
  const r2 = await appel('/api/signalements', { method: 'POST', body: JSON.stringify({ gravite: 'bloquant', auteur: 'Jérémy SAUJOT', constat: 'Page blanche', capture: PNG }) });
  const c2 = await r2.json();
  assert.equal(c2.notifie, true);
  assert.equal(envois.length, 1);
  assert.equal(envois[0].destinataire, 'etude@etude.fr');
  assert.match(envois[0].texte, /Page blanche/);
});

test('liste sans captures, détail avec, tri, doublon, export, suppression', async () => {
  const liste = (await (await appel('/api/signalements')).json()).signalements;
  assert.equal(liste.length, 2);
  const bloquant = liste.find((s) => s.gravite === 'bloquant');
  const genant = liste.find((s) => s.gravite === 'genant');
  assert.equal(bloquant.aCapture, true);
  assert.equal(bloquant.capture, undefined);
  const detail = (await (await appel('/api/signalements/' + bloquant.id)).json()).signalement;
  assert.equal(detail.capture, PNG);

  // Export par défaut : les signalements encore « nouveaux », captures comprises.
  const exp = await (await appel('/api/signalements/export')).json();
  assert.equal(exp.signalements.length, 2);
  assert.ok(exp.signalements.some((s) => s.capture === PNG));

  // Tri : statut inconnu refusé, note et version enregistrées.
  assert.equal((await appel('/api/signalements/' + bloquant.id, { method: 'PATCH', body: JSON.stringify({ statut: 'x' }) })).status, 400);
  const p = await (await appel('/api/signalements/' + bloquant.id, { method: 'PATCH', body: JSON.stringify({ statut: 'corrige', versionCorrige: '2026-09-25 09:00', note: 'OK' }) })).json();
  assert.equal(p.signalement.statut, 'corrige');
  assert.equal(p.signalement.versionCorrige, '2026-09-25 09:00');

  // Doublon : pas de lui-même, pas d'une origine inconnue ; le statut suit.
  assert.equal((await appel('/api/signalements/' + genant.id, { method: 'PATCH', body: JSON.stringify({ doublonDe: genant.id }) })).status, 400);
  assert.equal((await appel('/api/signalements/' + genant.id, { method: 'PATCH', body: JSON.stringify({ doublonDe: 'inconnu' }) })).status, 400);
  const d = await (await appel('/api/signalements/' + genant.id, { method: 'PATCH', body: JSON.stringify({ doublonDe: bloquant.id }) })).json();
  assert.equal(d.signalement.statut, 'doublon');
  assert.equal(d.signalement.doublonDe, bloquant.id);
  assert.equal((await (await appel('/api/signalements/export')).json()).signalements.length, 0);

  // Supprimer l'original remet le doublon à trier.
  assert.equal((await appel('/api/signalements/' + bloquant.id, { method: 'DELETE' })).status, 200);
  const reste = (await (await appel('/api/signalements')).json()).signalements;
  assert.equal(reste.length, 1);
  assert.equal(reste[0].statut, 'nouveau');
  assert.equal(reste[0].doublonDe, '');
});

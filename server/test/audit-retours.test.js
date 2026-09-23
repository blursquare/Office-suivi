'use strict';

// Commentaires de l'étude sur les rapports de relecture d'actes (routes/auditRetours.js).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirRetourAudit, assainirRetoursAudit, MAX_RETOURS_AUDIT } = require('../src/parametresRepo');

const constat = { categorie: 'ACTE', gravite: 'IMPORTANT', titre: 'Procédure en cours', phrase: 'Un litige oppose…', page: 4 };

test('assainirRetourAudit : verdict obligatoire, oubli sans texte refusé, champs bornés', () => {
  assert.equal(assainirRetourAudit({ verdict: 'inconnu', constat }), null);
  assert.equal(assainirRetourAudit({ verdict: 'faux_positif' }), null);
  assert.equal(assainirRetourAudit({ verdict: 'manque', commentaire: '  ' }), null);
  const oubli = assainirRetourAudit({ verdict: 'manque', commentaire: 'La servitude de passage n’est pas signalée.' });
  assert.equal(oubli.constat, null);
  const r = assainirRetourAudit({ verdict: 'faux_positif', portee: 'bizarre', constat: { ...constat, gravite: 'XXX', titre: 'x'.repeat(900) } });
  assert.equal(r.portee, 'tous');
  assert.equal(r.constat.gravite, 'INFORMATION');
  assert.equal(r.constat.titre.length, 300);
  assert.ok(r.id);
});

test('assainirRetoursAudit : plafond et entrées invalides écartées', () => {
  const liste = [];
  for (let i = 0; i < MAX_RETOURS_AUDIT + 5; i++) liste.push({ id: 'r' + i, verdict: 'juste', constat });
  liste.push(null, { verdict: 'nope' });
  const propre = assainirRetoursAudit(liste);
  assert.equal(propre.length, MAX_RETOURS_AUDIT);
  assert.equal(propre[propre.length - 1].id, 'r' + (MAX_RETOURS_AUDIT + 4));
});

let db, serveurApp, baseUrl, jeton;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' } });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  db.close();
});

function appeler(chemin, options) {
  return fetch(`${baseUrl}${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }
  });
}

test('route : 401 sans jeton', async () => {
  const r = await fetch(`${baseUrl}/api/audit-retours`);
  assert.equal(r.status, 401);
});

test('route : ajout, remplacement par id, lecture, suppression', async () => {
  let r = await appeler('/api/audit-retours', { method: 'POST', body: JSON.stringify({ verdict: 'nope' }) });
  assert.equal(r.status, 400);

  r = await appeler('/api/audit-retours', { method: 'POST', body: JSON.stringify({ id: 'a1', verdict: 'faux_positif', portee: 'dossier', dossierCle: 'dossier:42', commentaire: 'Litige clos', constat }) });
  assert.equal(r.status, 201);
  r = await appeler('/api/audit-retours', { method: 'POST', body: JSON.stringify({ id: 'a1', verdict: 'juste', portee: 'tous', constat }) });
  assert.equal(r.status, 201);

  r = await appeler('/api/audit-retours');
  const { retours } = await r.json();
  assert.equal(retours.length, 1);
  assert.equal(retours[0].verdict, 'juste');

  r = await appeler('/api/audit-retours/a1', { method: 'DELETE' });
  assert.equal(r.status, 200);
  r = await appeler('/api/audit-retours/a1', { method: 'DELETE' });
  assert.equal(r.status, 404);
});

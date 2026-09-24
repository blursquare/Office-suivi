'use strict';

// Relectures d'actes enregistrées (routes/relectures.js) : revenir sur une analyse passée.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { metaRelecture } = require('../src/routes/relectures');

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

function appel(chemin, options = {}) {
  return fetch(baseUrl + chemin, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
}

const instantane = {
  mode: 'acte', typeBien: 'copropriete', dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', libelle: "Projet d'acte de vente",
  sante: { critique: 2, surveiller: 5, valide: 30 }, facture: { coutUsd: 1.42 },
  analyse: { synthese: 'Synthèse.' }, rapport: { constats: [] }, documents: [{ numero: 1, nom: 'Projet.pdf', type: 'principal' }]
};

test('metaRelecture : colonnes de liste tirées de l’instantané, valeurs exotiques neutralisées', () => {
  const m = metaRelecture(instantane);
  assert.equal(m.mode, 'acte');
  assert.equal(m.typeBien, 'copropriete');
  assert.equal(m.critique, 2);
  assert.equal(m.avecClaude, 1);
  assert.equal(m.coutUsd, 1.42);
  const bizarre = metaRelecture({ mode: 'x', typeBien: 'chateau', sante: { critique: -3 }, facture: { coutUsd: 'NaN' } });
  assert.equal(bizarre.mode, 'compromis');
  assert.equal(bizarre.typeBien, '');
  assert.equal(bizarre.critique, 0);
  assert.equal(bizarre.avecClaude, 0);
  assert.equal(bizarre.coutUsd, 0);
});

test('authentification requise', async () => {
  const r = await fetch(baseUrl + '/api/relectures');
  assert.equal(r.status, 401);
});

test('enregistrer, lister, rouvrir, corriger puis supprimer une analyse', async () => {
  const vide = await appel('/api/relectures', { method: 'POST', body: JSON.stringify({ mode: 'acte' }) });
  assert.equal(vide.status, 400);

  const cree = await appel('/api/relectures', { method: 'POST', body: JSON.stringify(instantane) });
  assert.equal(cree.status, 201);
  const { id } = await cree.json();
  assert.ok(id);

  const liste = await (await appel('/api/relectures')).json();
  assert.equal(liste.relectures.length, 1);
  assert.equal(liste.relectures[0].dossierNom, 'DUPONT / MARTIN');
  assert.equal(liste.relectures[0].sante.surveiller, 5);
  assert.equal(liste.relectures[0].donnees, undefined, 'la liste ne transporte pas le bilan complet');

  const parDossier = await (await appel('/api/relectures?dossierId=autre')).json();
  assert.equal(parDossier.relectures.length, 0);

  const une = await (await appel('/api/relectures/' + id)).json();
  assert.equal(une.relecture.donnees.analyse.synthese, 'Synthèse.');
  assert.equal(une.relecture.donnees.documents[0].nom, 'Projet.pdf');

  const maj = await appel('/api/relectures/' + id, { method: 'PUT', body: JSON.stringify({ ...instantane, typeBien: 'maison' }) });
  assert.equal(maj.status, 200);
  const relue = await (await appel('/api/relectures/' + id)).json();
  assert.equal(relue.relecture.typeBien, 'maison');
  assert.equal(relue.relecture.createdAt, une.relecture.createdAt, 'la date de l’analyse ne bouge pas');

  assert.equal((await appel('/api/relectures/inconnu', { method: 'PUT', body: JSON.stringify(instantane) })).status, 404);
  assert.equal((await appel('/api/relectures/' + id, { method: 'DELETE' })).status, 200);
  assert.equal((await appel('/api/relectures/' + id)).status, 404);
  assert.equal((await appel('/api/relectures/' + id, { method: 'DELETE' })).status, 404);
});

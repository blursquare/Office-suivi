'use strict';

// Constitution de dossier (étude 15/10) : adresses de destinataires retenues par l'étude — assainies, bornées, jamais une clé hors liste.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const { creerRouteurConstitution, assainirAdresse } = require('../src/routes/constitution');

test('adresse assainie : 6 lignes de 120 caractères, courriel simple, rien d’autre', () => {
  const a = assainirAdresse({ lignes: ['  CC DU GRAND  CHAMBORD ', '', 'x'.repeat(300), 'a', 'b', 'c', 'd', 'e'], courriel: 'ASSAINISSEMENT@exemple.fr', extra: 1 });
  assert.equal(a.lignes.length, 6);
  assert.equal(a.lignes[0], 'CC DU GRAND CHAMBORD');
  assert.equal(a.lignes[1].length, 120);
  assert.equal(a.courriel, 'assainissement@exemple.fr');
  assert.equal(assainirAdresse({ courriel: 'pas un courriel' }).courriel, '');
  assert.deepEqual(assainirAdresse(null).lignes, []);
});

test('routes : retenir, relire, retirer une adresse ; clé invalide et adresse vide refusées', async () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  const app = express();
  app.use(express.json());
  app.use('/api', creerRouteurConstitution(repo));
  const serveur = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const base = `http://127.0.0.1:${serveur.address().port}/api/constitution/adresses`;
    const put = (cle, corps) => fetch(`${base}/${cle}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    assert.equal((await put('grand-chambord', { lignes: ['CC DU GRAND CHAMBORD', '41250 BRACIEUX'], par: 'Bastien' })).status, 200);
    const { adresses } = await (await fetch(base)).json();
    assert.equal(adresses['grand-chambord'].lignes[1], '41250 BRACIEUX');
    assert.equal(adresses['grand-chambord'].par, 'Bastien');
    assert.equal((await put('../evasion', { lignes: ['x'] })).status, 404, 'une clé avec « / » ne mène à aucune route');
    assert.equal((await put('Majuscules', { lignes: ['x'] })).status, 400);
    assert.equal((await put('vide', { lignes: [] })).status, 400);
    assert.equal((await fetch(`${base}/grand-chambord`, { method: 'DELETE' })).status, 200);
    assert.deepEqual((await (await fetch(base)).json()).adresses, {});
  } finally { serveur.close(); }
});

test('communes : « SAINT SULPICE DE POMMERAY » retrouvée dans la base par son nom, au bon département ; commune inconnue → rien', () => {
  const { communesDeLaBaseParNom, nomCommuneNormalise } = require('../src/routes/constitution');
  const base = { communes: { 41230: { nom: 'Saint-Sulpice-de-Pommeray' }, 41018: { nom: 'Blois' }, 45001: { nom: 'Blois' } } };
  assert.equal(nomCommuneNormalise('SAINT SULPICE DE POMMERAY'), nomCommuneNormalise('Saint-Sulpice-de-Pommeray'));
  assert.equal(communesDeLaBaseParNom(base, 'SAINT SULPICE DE POMMERAY', '41')[0].insee, '41230');
  assert.equal(communesDeLaBaseParNom(base, 'Blois').length, 2, 'deux communes du même nom : jamais choisie seule');
  assert.equal(communesDeLaBaseParNom(base, 'Blois', '41').length, 1);
  assert.deepEqual(communesDeLaBaseParNom(base, 'Atlantide', '41'), []);
});

test('route commune : INSEE, intercommunalité, guichet et mairie (annuaire simulé) pour une commune d’Agglopolys', async () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  const app = express();
  const annuaire = async () => ({ ok: true, json: async () => ({ results: [{ nom: 'Mairie - Saint-Sulpice-de-Pommeray', adresse_courriel: 'mairie@exemple.fr', adresse: JSON.stringify([{ type_adresse: 'Adresse', numero_voie: '1 place de l’Église', code_postal: '41000', nom_commune: 'Saint-Sulpice-de-Pommeray' }]) }] }) });
  app.use('/api', creerRouteurConstitution(repo, { fetch: annuaire }));
  const serveur = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const base = `http://127.0.0.1:${serveur.address().port}/api/constitution/commune`;
    const j = await (await fetch(`${base}?nom=${encodeURIComponent('SAINT SULPICE DE POMMERAY')}&cp=41000`)).json();
    assert.equal(j.trouvee, true);
    assert.equal(j.insee, '41230');
    assert.equal(j.epci.code, '200030385');
    assert.match(j.mairie.adresse, /1 place de l’Église, 41000 Saint-Sulpice-de-Pommeray/);
    assert.equal((await (await fetch(`${base}?nom=Atlantide`)).json()).trouvee, false);
    assert.equal((await fetch(base)).status, 400);
  } finally { serveur.close(); }
});

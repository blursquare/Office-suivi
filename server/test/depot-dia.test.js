'use strict';

// Où déposer la DIA (étude 15/10) : base par intercommunalité avec exceptions, corrections de l'étude, fiche de la mairie de l'annuaire du
// service public (faux annuaire), assemblage sans rien déduire. Données inventées.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { assainirDepot, depotPourCommune, ficheMairieDepuisAnnuaire, ficheMairie, urlSure, courrielSur, viderCacheDepotDia, baseDepotDia } = require('../src/depotDia');
const { creerRouteurDepotDia } = require('../src/routes/depotDia');
const { assembler, entreeRetenue } = require('../scripts/assembler-depot-dia');

const BASE = {
  epci: { E1: { nom: 'CA Exemple', mode: 'guichet', url: 'https://guichet.exemple.fr/', plateforme: 'Cart@DS', source: 'https://exemple.fr/dia', verifieLe: '2026-10-15' }, E2: { nom: 'CC Vide', mode: 'inconnu' } },
  communes: {
    '41001': { nom: 'Alpha', epci: 'E1' },
    '41002': { nom: 'Beta', epci: 'E1', depot: { mode: 'courriel', courriel: 'urbanisme@beta.fr', source: 'https://beta.fr/urbanisme' } },
    '41003': { nom: 'Gamma', epci: 'E2' }
  }
};

test('commune : hérite de son intercommunalité, l’exception de la commune passe devant, la correction de l’étude devant tout', () => {
  assert.equal(depotPourCommune(BASE, {}, '41001').origine, 'epci');
  assert.equal(depotPourCommune(BASE, {}, '41001').depot.url, 'https://guichet.exemple.fr/');
  const b = depotPourCommune(BASE, {}, '41002');
  assert.equal(b.origine, 'commune');
  assert.equal(b.depot.courriel, 'urbanisme@beta.fr');
  const c = depotPourCommune(BASE, { '41001': { mode: 'courrier', note: 'Dépôt à l’accueil', modifieLe: '2026-10-16T08:00:00Z' } }, '41001');
  assert.equal(c.origine, 'etude');
  assert.equal(c.depot.mode, 'courrier');
  assert.equal(depotPourCommune(BASE, {}, '41003').depot.mode, 'inconnu');
  assert.equal(depotPourCommune(BASE, {}, '99999').connue, false);
});

test('assainissement : adresse https seulement, courriel simple, mode connu, tailles bornées', () => {
  assert.equal(urlSure('javascript:alert(1)'), '');
  assert.equal(urlSure('data:text/html,x'), '');
  assert.equal(urlSure('https://a.fr/x'), 'https://a.fr/x');
  assert.equal(courrielSur('A@B.fr'), 'a@b.fr');
  assert.equal(courrielSur('pas un courriel'), '');
  const e = assainirDepot({ mode: 'piraterie', url: 'ftp://x', courriel: 'a b@c.fr', note: 'x'.repeat(1000), notairesSeulement: 'oui' });
  assert.equal(e.mode, 'inconnu');
  assert.equal(e.url, '');
  assert.equal(e.courriel, '');
  assert.equal(e.note.length, 240);
  assert.equal(e.notairesSeulement, false);
});

test('assemblage : un mode annoncé sans page lue, ou un guichet sans adresse, redevient « à vérifier » — rien n’est déduit', () => {
  assert.equal(entreeRetenue({ mode: 'guichet', url: 'https://g.fr/' }).mode, 'inconnu');
  assert.equal(entreeRetenue({ mode: 'guichet', source: 'https://s.fr/' }).mode, 'inconnu');
  assert.equal(entreeRetenue({ mode: 'guichet', url: 'https://g.fr/', source: 'https://s.fr/' }).mode, 'guichet');
  const base = assembler({ source: 'x', epci: { E1: { nom: 'CA Un', type: 'CA' } }, communes: { '41001': { nom: 'Alpha', epci: 'E1' }, '41002': { nom: 'Beta', epci: 'E1' } } }, [
    { portee: 'epci', code: 'E1', mode: 'guichet', url: 'https://g.fr/', source: 'https://s.fr/', verifieLe: '2026-10-15' },
    { portee: 'commune', code: '41001', mode: 'guichet', url: 'https://g.fr/', source: 'https://s.fr/' },
    { portee: 'commune', code: '41002', mode: 'courriel', courriel: 'dia@beta.fr', source: 'https://beta.fr/' }
  ]);
  assert.equal(base.epci.E1.mode, 'guichet');
  assert.equal(base.communes['41001'].depot, undefined, 'identique à l’intercommunalité : pas d’exception');
  assert.equal(base.communes['41002'].depot.courriel, 'dia@beta.fr');
});

test('base livrée, Loir-et-Cher (recherche du 16/10) : GNAU de Grand Chambord et Beauce Val de Loire, portails SIRAP de Cœur de Sologne, Romorantin à part', () => {
  viderCacheDepotDia();
  const b = baseDepotDia();
  assert.equal(depotPourCommune(b, {}, '41150').depot.mode, 'guichet');
  assert.match(depotPourCommune(b, {}, '41150').depot.url, /gnau42\.operis\.fr\/grandchambord/);
  assert.equal(depotPourCommune(b, {}, '41104').origine, 'commune');
  const chaumont = depotPourCommune(b, {}, '41046');
  assert.equal(chaumont.origine, 'commune');
  assert.equal(chaumont.depot.mode, 'inconnu');
  assert.equal(chaumont.depot.url, 'https://portail-usager.sirap.com/041046/connexion');
  assert.equal(depotPourCommune(b, {}, '41194').depot.courriel, 'urbanisme@romorantin.fr');
});

test('base livrée : chaque commune connue pointe une intercommunalité connue, aucun mode sans page lue, adresses sûres', () => {
  viderCacheDepotDia();
  const b = baseDepotDia();
  assert.ok(Object.keys(b.communes).length > 1300);
  for (const [code, c] of Object.entries(b.communes)) assert.ok(b.epci[c.epci], `${code} : intercommunalité inconnue`);
  const entrees = [...Object.values(b.epci), ...Object.values(b.communes).map((c) => c.depot).filter(Boolean)];
  for (const e of entrees) {
    if (e.mode !== 'inconnu') assert.ok(e.source, `${e.nom || ''} : mode sans page source`);
    if (e.url) assert.ok(urlSure(e.url), e.url);
    if (e.courriel) assert.ok(courrielSur(e.courriel), e.courriel);
  }
});

const FAUX_ANNUAIRE = (liste) => async () => ({ ok: true, status: 200, json: async () => ({ results: liste }) });
const MAIRIE = { nom: 'Mairie - Alpha', site_internet: '[{"libelle":"","valeur":"https://alpha.fr/"}]', adresse_courriel: 'contact@alpha.fr', telephone: '[{"valeur":"02 00 00 00 00","description":""}]',
  adresse: '[{"type_adresse":"Adresse","numero_voie":"1 place de la Mairie","service_distribution":"","code_postal":"41001","nom_commune":"Alpha"},{"type_adresse":"Adresse postale","numero_voie":"1 place de la Mairie","service_distribution":"CS 1","code_postal":"41002","nom_commune":"Alpha Cedex"}]' };

test('fiche de la mairie : lue dans l’annuaire du service public, la mairie principale avant une annexe', async () => {
  const f = ficheMairieDepuisAnnuaire(MAIRIE);
  assert.equal(f.courriel, 'contact@alpha.fr');
  assert.equal(f.telephone, '02 00 00 00 00');
  assert.equal(f.site, 'https://alpha.fr/');
  assert.match(f.adresse, /1 place de la Mairie, 41001 Alpha/);
  assert.match(f.adressePostale, /CS 1/);
  viderCacheDepotDia();
  const m = await ficheMairie('41001', { fetch: FAUX_ANNUAIRE([Object.assign({}, MAIRIE, { nom: 'Mairie annexe - Alpha' }), MAIRIE]) });
  assert.equal(m.nom, 'Mairie - Alpha');
  assert.equal(await ficheMairie('pas-un-code', {}), null);
});

test('route : lire, corriger (guichet sans adresse refusé), revenir à la base', async () => {
  viderCacheDepotDia();
  const memoire = {};
  const parametresRepo = { lireJsonBrut: (c, d) => (c in memoire ? memoire[c] : d), ecrireJsonBrut: (c, v) => { memoire[c] = v; }, lireJson: () => ({}), ecrireJson: () => {} };
  const app = express(); app.use(express.json());
  app.use('/api', creerRouteurDepotDia(parametresRepo, { fetch: FAUX_ANNUAIRE([MAIRIE]) }));
  const serveur = app.listen(0);
  try {
    const B = `http://127.0.0.1:${serveur.address().port}/api`;
    const j = await fetch(`${B}/urbanisme/depot-dia?insee=41018`).then((r) => r.json());
    assert.equal(j.connue, true);
    assert.equal(j.commune, 'Blois');
    assert.equal(j.mairie.nom, 'Mairie - Alpha');
    assert.equal((await fetch(`${B}/urbanisme/depot-dia?insee=zz`)).status, 400);
    const put = (corps) => fetch(`${B}/urbanisme/depot-dia/41018`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    assert.equal((await put({ mode: 'guichet' })).status, 400);
    assert.equal((await put({ mode: 'courriel', courriel: 'pas bon' })).status, 400);
    assert.equal((await put({ mode: 'courriel', courriel: 'dia@blois.fr', note: 'confirmé par téléphone' })).status, 200);
    const apres = await fetch(`${B}/urbanisme/depot-dia?insee=41018`).then((r) => r.json());
    assert.equal(apres.origine, 'etude');
    assert.equal(apres.depot.courriel, 'dia@blois.fr');
    assert.equal((await fetch(`${B}/urbanisme/depot-dia/41018`, { method: 'DELETE' })).status, 200);
    assert.notEqual((await fetch(`${B}/urbanisme/depot-dia?insee=41018`).then((r) => r.json())).origine, 'etude');
    assert.equal((await fetch(`${B}/urbanisme/depot-dia/99999`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
  } finally { serveur.close(); }
});

test('guichet lu pour une partie seulement des communes : pas de certitude pour les autres ; commune dite hors guichet : à vérifier', () => {
  const base = assembler({ source: 'x', epci: { E1: { nom: 'CA Un', type: 'CA' } }, communes: { '41001': { nom: 'Alpha', epci: 'E1' }, '41002': { nom: 'Beta', epci: 'E1' }, '41003': { nom: 'Gamma', epci: 'E1' } } }, [
    { portee: 'epci', code: 'E1', mode: 'guichet', url: 'https://g.fr/', source: 'https://s.fr/', verifieLe: '2026-10-15' },
    { portee: 'commune', code: '41001', mode: 'guichet', url: 'https://g.fr/', source: 'https://s.fr/' }
  ], { partiel: { E1: 'Guichet lu pour Alpha seulement.' }, horsGuichet: { '41003': 'Hors convention (page lue).' } });
  assert.equal(depotPourCommune(base, {}, '41001').depot.mode, 'guichet', 'la commune lue garde son guichet même identique à celui de l’intercommunalité');
  const b = depotPourCommune(base, {}, '41002');
  assert.equal(b.origine, 'epci-partiel');
  assert.equal(b.depot.mode, 'inconnu');
  assert.match(b.depot.note, /Alpha seulement.*À vérifier/);
  assert.equal(b.depot.url, 'https://g.fr/', 'le lien reste utile');
  assert.equal(depotPourCommune(base, {}, '41003').depot.mode, 'inconnu');
  // Une intercommunalité citée dans deux départements : le « à vérifier » ne remplace pas un guichet lu.
  const deux = assembler({ source: 'x', epci: { E1: { nom: 'CA Un', type: 'CA' } }, communes: { '41001': { nom: 'Alpha', epci: 'E1' } } }, [
    { portee: 'epci', code: 'E1', mode: 'guichet', url: 'https://g.fr/', source: 'https://s.fr/' }, { portee: 'epci', code: 'E1', mode: 'inconnu' }]);
  assert.equal(deux.epci.E1.mode, 'guichet');
});

test('correction de l’étude : garde le périmètre et la mention « notaires » que le formulaire ne montre pas, sans page source', async () => {
  viderCacheDepotDia();
  const memoire = { 'depot-dia': {} };
  const parametresRepo = { lireJsonBrut: (c, d) => (c in memoire ? memoire[c] : d), ecrireJsonBrut: (c, v) => { memoire[c] = v; }, lireJson: () => ({}), ecrireJson: () => {} };
  const app = express(); app.use(express.json());
  app.use('/api', creerRouteurDepotDia(parametresRepo, { fetch: async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) }) }));
  const serveur = app.listen(0);
  try {
    const B = `http://127.0.0.1:${serveur.address().port}/api`;
    const code = Object.keys(baseDepotDia().communes).find((c) => baseDepotDia().epci[baseDepotDia().communes[c].epci].mode === 'guichet' && baseDepotDia().epci[baseDepotDia().communes[c].epci].perimetre && !baseDepotDia().epci[baseDepotDia().communes[c].epci].partiel && !baseDepotDia().communes[c].depot);
    assert.ok(code, 'une commune qui hérite d’un guichet à périmètre');
    const avant = await fetch(`${B}/urbanisme/depot-dia?insee=${code}`).then((r) => r.json());
    const r = await fetch(`${B}/urbanisme/depot-dia/${code}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'guichet', url: 'https://autre.fr/', note: 'corrigé' }) });
    assert.equal(r.status, 200);
    const apres = await fetch(`${B}/urbanisme/depot-dia?insee=${code}`).then((x) => x.json());
    assert.equal(apres.depot.perimetre, avant.depot.perimetre);
    assert.equal(apres.depot.source, '');
    assert.equal(apres.depot.url, 'https://autre.fr/');
  } finally { serveur.close(); }
});

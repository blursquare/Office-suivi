'use strict';

// Pages d'Authentic envoyées par l'extension Firefox (voir src/routes/authentic.js). Données inventées.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { normaliserCaptureAuthentic, DUREE_CAPTURE_MS } = require('../src/routes/authentic');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

test('normaliserCaptureAuthentic : forme attendue seulement, espaces resserrés, bornes', () => {
  const c = normaliserCaptureAuthentic({
    titre: '  Dossier   VTE  ', adresse: 'https://authentic.exemple/dossier/12',
    champs: [{ groupe: 'Vendeur', libelle: 'Nom', valeur: '  MARCHAIS  ', autre: 'x' }, { libelle: '', valeur: '' }, null],
    tableaux: [{ entete: ['Lot', 'Tantièmes'], lignes: [['12', '150/1000']] }, 'pas un tableau'],
    texte: 'Texte de la page',
    motDePasse: 'jamais'
  });
  assert.equal(c.titre, 'Dossier VTE');
  assert.equal(JSON.stringify(c.champs), JSON.stringify([{ groupe: 'Vendeur', libelle: 'Nom', valeur: 'MARCHAIS' }]));
  assert.equal(c.tableaux.length, 1);
  assert.equal(c.tableaux[0].lignes[0][1], '150/1000');
  assert.equal(c.tableaux[0].entete.join('|'), 'Lot|Tantièmes');
  assert.equal('motDePasse' in c, false);
  assert.equal(normaliserCaptureAuthentic({ champs: Array.from({ length: 2000 }, (_, i) => ({ libelle: 'L' + i, valeur: 'v' })) }).champs.length, 800);
  assert.equal(normaliserCaptureAuthentic(null).champs.length, 0);
});

let serveur, base, horloge = 1_000_000;
before(async () => {
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { racineRepo: os.tmpdir(), authActive: false, estSea: () => false } });
  serveur = app.listen(0);
  await new Promise(r => serveur.once('listening', r));
  base = 'http://127.0.0.1:' + serveur.address().port;
});
after(() => serveur && serveur.close());

const poster = (corps, type) => fetch(base + '/api/authentic/capture', {
  method: 'POST', headers: { 'Content-Type': type || 'application/json' }, body: typeof corps === 'string' ? corps : JSON.stringify(corps)
});

test('POST puis GET : la page reçue est rendue telle que normalisée', async () => {
  const r = await poster({ titre: 'Dossier', champs: [{ groupe: 'Bien', libelle: 'Commune', valeur: 'BLOIS' }] });
  assert.equal(r.status, 200);
  const { id } = await r.json();
  assert.match(id, /^[\w-]{8,}$/);
  const g = await fetch(base + '/api/authentic/capture/' + id);
  assert.equal(g.status, 200);
  assert.equal(g.headers.get('cache-control'), 'no-store');
  const c = await g.json();
  assert.equal(c.champs[0].valeur, 'BLOIS');
  assert.ok(c.recueLe);
});

test('refus : page vide, corps non JSON (une page web ne peut pas poster sans prévol), identifiant inconnu', async () => {
  assert.equal((await poster({ titre: 'Rien' })).status, 400);
  assert.equal((await poster('titre=x', 'text/plain')).status, 415);
  assert.equal((await fetch(base + '/api/authentic/capture/inconnu')).status, 404);
});

test('une capture expire après 30 minutes', () => {
  const { creerRouteurAuthentic } = require('../src/routes/authentic');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api', creerRouteurAuthentic({ maintenant: () => horloge }));
  const s = app.listen(0);
  return new Promise(r => s.once('listening', r)).then(async () => {
    const b = 'http://127.0.0.1:' + s.address().port;
    const r = await fetch(b + '/api/authentic/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: 'x' }) });
    const { id } = await r.json();
    assert.equal((await fetch(b + '/api/authentic/capture/' + id)).status, 200);
    horloge += DUREE_CAPTURE_MS + 1;
    assert.equal((await fetch(b + '/api/authentic/capture/' + id)).status, 404);
  }).finally(() => s.close());
});

test('relevé automatique : file prise une seule fois, récents gardés, page identique ignorée', async () => {
  const releve = { titre: 'Authentic', champs: [{ groupe: '', libelle: 'ui:ficheClientPhysiqueIdentite:nom', valeur: '' }, { groupe: '', libelle: 'Nom de famille*', valeur: 'FOURNIER' }], tableaux: [], texte: 'x' };
  const post = (u, corps) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps || {}) });
  // Page dont CLAIRE ne connaît pas la structure : ignorée, jamais gardée.
  assert.equal((await (await post('/api/authentic/releve', { titre: 'Authentic', champs: [{ groupe: '', libelle: 'Rechercher', valeur: 'x' }], tableaux: [], texte: 'Agenda' })).json()).ignore, true);
  assert.equal((await (await post('/api/authentic/releve', releve)).json()).ok, true);
  assert.equal((await (await post('/api/authentic/releve', releve)).json()).deja, true);
  const pris = await (await post('/api/authentic/releves/prendre')).json();
  assert.equal(pris.releves.length, 1);
  assert.equal(pris.releves[0].capture.champs[1].valeur, 'FOURNIER');
  assert.equal((await (await post('/api/authentic/releves/prendre')).json()).releves.length, 0);
  const recents = await (await fetch(base + '/api/authentic/releves/recents')).json();
  assert.equal(recents.releves.length, 1);
  assert.equal((await fetch(base + '/api/authentic/releve', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' })).status, 415);
});

test('pageAuthenticConnue : page du dossier, fiche client, fiche bien — rien d’autre', () => {
  const { pageAuthenticConnue } = require('../src/routes/authentic');
  assert.equal(pageAuthenticConnue({ champs: [{ libelle: '12 - Vente MARTEL/FOURNIER Importer', valeur: '' }] }), true);
  assert.equal(pageAuthenticConnue({ champs: [], texte: '7 - Vente Consorts DUPONT / MARTIN\nComparants' }), true);
  assert.equal(pageAuthenticConnue({ champs: [{ libelle: 'x:ficheImmeubleTabView:y', valeur: '' }] }), true);
  assert.equal(pageAuthenticConnue({ champs: [{ libelle: '15 - Succession DUPONT Jean Importer', valeur: '' }] }), true);
  assert.equal(pageAuthenticConnue({ champs: [{ libelle: 'Rechercher', valeur: '' }], texte: 'Agenda de l’office' }), false);
});

test('attente des relevés : rendue dès qu\'une page arrive, vide après le délai, une seule fenêtre servie', async () => {
  const express = require('express');
  const { creerRouteurAuthentic } = require('../src/routes/authentic');
  const appli = express();
  appli.use(express.json({ limit: '2mb' }));
  appli.use('/api', creerRouteurAuthentic({ dureeAttenteMs: 300 }));
  const s = appli.listen(0);
  await new Promise(r => s.once('listening', r));
  const b = 'http://127.0.0.1:' + s.address().port;
  try {
    const attendre = () => fetch(b + '/api/authentic/releves/attendre', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
    // Rien n'arrive : réponse vide au bout du délai.
    const t0 = Date.now();
    assert.equal((await attendre()).releves.length, 0);
    assert.ok(Date.now() - t0 >= 250);
    // Deux fenêtres attendent ; une page arrive : la première la prend, la seconde repart vide.
    let servieLe = 0;
    const a1 = attendre().then(r => { servieLe = Date.now(); return r; }), a2 = attendre();
    await new Promise(r => setTimeout(r, 50));
    const page = { champs: [{ groupe: '', libelle: 'j:ficheClientPhysiqueIdentite:x', valeur: 'oui' }, { groupe: '', libelle: 'Nom de famille', valeur: 'TEST' }] };
    const t1 = Date.now();
    await fetch(b + '/api/authentic/releve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(page) });
    const [r1, r2] = await Promise.all([a1, a2]);
    assert.equal(r1.releves.length, 1);
    assert.ok(servieLe - t1 < 200, 'servie tout de suite, pas au bout du délai');
    assert.equal(r2.releves.length, 0);
    // Une page arrivée sans fenêtre en attente est rendue à la suivante, immédiatement.
    await fetch(b + '/api/authentic/releve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, page, { texte: 'x', champs: page.champs.concat({ groupe: '', libelle: 'Prénom', valeur: 'A' }) })) });
    assert.equal((await attendre()).releves.length, 1);
  } finally {
    s.close();
  }
});

test('navigation : l\'intitulé seul mis en file ; page revue → relue avec son contenu, doublon rapproché écarté', async () => {
  const express = require('express');
  const { creerRouteurAuthentic, DUREE_DOUBLON_MS } = require('../src/routes/authentic');
  let t = 5_000_000;
  const appli = express();
  appli.use(express.json({ limit: '2mb' }));
  appli.use('/api', creerRouteurAuthentic({ dureeAttenteMs: 200, maintenant: () => t }));
  const s = appli.listen(0);
  await new Promise(r => s.once('listening', r));
  const b = 'http://127.0.0.1:' + s.address().port;
  const post = (chemin, corps) => fetch(b + '/api/authentic/' + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  const prendre = () => post('releves/prendre', {}).then(r => r.json()).then(j => j.releves);
  try {
    assert.equal((await post('navigation', { intitule: 'Donation SIMOND' })).status, 400);
    assert.equal((await post('navigation', { intitule: '15 - Donation SIMOND' })).status, 200);
    let file = await prendre();
    assert.equal(file.length, 1);
    assert.equal(file[0].navigation, '15 - Donation SIMOND');
    assert.equal(file[0].capture, undefined);
    // Précédé de la référence du dossier (extension 0.3.9, étude 03/10).
    assert.equal((await post('navigation', { intitule: 'A 2026 00247 1 - Donation SIMOND' })).status, 200);
    file = await prendre();
    assert.equal(file[0].navigation, 'A 2026 00247 1 - Donation SIMOND');
    // Page de dossier connue : relevée ; renvoyée aussitôt (cadres, double envoi) → écartée.
    const page = { champs: [{ groupe: '', libelle: '12 - Vente PETIT/BOSQUET', valeur: '' }], tableaux: [], texte: '12 - Vente PETIT/BOSQUET' };
    await post('releve', page);
    file = await prendre();
    assert.ok(file[0].capture);
    assert.equal(file[0].revu, undefined);
    assert.equal((await (await post('releve', page)).json()).deja, true);
    assert.equal((await prendre()).length, 0);
    // Revue plus tard : remise en file AVEC son contenu (la première lecture a pu ne trouver aucun dossier).
    t += DUREE_DOUBLON_MS + 1;
    await post('releve', page);
    file = await prendre();
    assert.equal(file.length, 1);
    assert.ok(file[0].capture);
    assert.equal(file[0].revu, true);
    // Parmi les récents, une seule version de la page (la dernière).
    const recents = await fetch(b + '/api/authentic/releves/recents').then(r => r.json());
    assert.equal(recents.releves.length, 1);
    assert.equal(recents.releves[0].id, file[0].id);
    assert.equal(recents.releves[0].empreinte, undefined);
    assert.ok(recents.releves.every(r => !r.navigation));
  } finally {
    s.close();
  }
});

test('page servie d\'abord à une fenêtre du même poste ; sans fenêtre de ce poste depuis 90 s, à n\'importe laquelle', async () => {
  const express = require('express');
  const { creerRouteurAuthentic, DUREE_FENETRE_VUE_MS } = require('../src/routes/authentic');
  let t = 9_000_000;
  const appli = express();
  appli.use(express.json({ limit: '2mb' }));
  // Le poste de chaque requête vient d'un en-tête (au bureau : son adresse réseau).
  appli.use('/api', creerRouteurAuthentic({ dureeAttenteMs: 300, maintenant: () => t, origine: (req) => req.get('x-poste') || 'local' }));
  const s = appli.listen(0);
  await new Promise(r => s.once('listening', r));
  const b = 'http://127.0.0.1:' + s.address().port;
  const post = (chemin, corps, poste) => fetch(b + '/api/authentic/' + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-poste': poste }, body: JSON.stringify(corps) }).then(r => r.json());
  const page = (nom) => ({ champs: [{ groupe: '', libelle: 'j:ficheClientPhysiqueIdentite:x', valeur: 'oui' }, { groupe: '', libelle: 'Nom de famille', valeur: nom }] });
  try {
    // Les deux fenêtres se sont montrées (relève de secours, vide).
    await post('releves/prendre', { poste: 'Julie VASSELIN' }, '10.0.0.2');
    await post('releves/prendre', { poste: 'Jérémy SAUJOT' }, '10.0.0.3');
    // Jérémy attend ; une page arrive de l'extension de Julie : pas pour lui.
    const aJeremy = post('releves/attendre', {}, '10.0.0.3');
    await post('releve', page('MARTEL'), '10.0.0.2');
    assert.equal((await aJeremy).releves.length, 0);
    // La fenêtre de Julie la prend.
    const pourJulie = await post('releves/prendre', {}, '10.0.0.2');
    assert.equal(pourJulie.releves.length, 1);
    assert.equal(pourJulie.releves[0].capture.champs[1].valeur, 'MARTEL');
    // Fenêtre de Julie fermée depuis plus de 90 s : sa page va à Jérémy plutôt que de se perdre.
    await post('releve', page('FOURNIER'), '10.0.0.2');
    t += DUREE_FENETRE_VUE_MS + 1;
    const pourJeremy = await post('releves/prendre', {}, '10.0.0.3');
    assert.equal(pourJeremy.releves.length, 1);
    assert.equal(pourJeremy.releves[0].capture.champs[1].valeur, 'FOURNIER');
    // Journal : reçue de quel poste, prise par qui, résultat rapporté par la fenêtre.
    await post('releves/resultats', { resultats: [{ id: pourJeremy.releves[0].id, etat: 'sans-dossier', texte: 'aucun dossier ne porte ces noms' }, { id: 'x', etat: 'pirate' }] }, '10.0.0.3');
    const j = await fetch(b + '/api/authentic/journal').then(r => r.json());
    assert.equal(j.entrees.length, 2);
    assert.equal(j.entrees[0].etat, 'sans-dossier');
    assert.equal(j.entrees[0].prisPar, 'Jérémy SAUJOT');
    assert.equal(j.entrees[0].posteOrigine, 'Julie VASSELIN');
    assert.equal(j.entrees[0].nature, 'client');
    assert.equal(j.entrees[0].enMemoire, true);
    assert.equal(j.entrees[1].etat, 'pris');
    assert.ok(j.fenetres.some(f => f.poste === 'Julie VASSELIN'));
    // Une page encore en mémoire se relit par son identifiant (rangement à la main).
    const r = await fetch(b + '/api/authentic/releves/' + pourJeremy.releves[0].id).then(x => x.json());
    assert.equal(r.capture.champs[1].valeur, 'FOURNIER');
    assert.equal((await fetch(b + '/api/authentic/releves/inconnu')).status, 404);
  } finally {
    s.close();
  }
});

test('page restée sans fenêtre 60 min : marquée « expirée » au journal', async () => {
  const express = require('express');
  const { creerRouteurAuthentic, DUREE_RELEVE_MS } = require('../src/routes/authentic');
  let t = 20_000_000;
  const appli = express();
  appli.use(express.json());
  appli.use('/api', creerRouteurAuthentic({ maintenant: () => t }));
  const s = appli.listen(0);
  await new Promise(r => s.once('listening', r));
  const b = 'http://127.0.0.1:' + s.address().port;
  try {
    await fetch(b + '/api/authentic/releve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ champs: [{ groupe: '', libelle: '3 - Vente DURAND/ROUX', valeur: '' }] }) });
    t += DUREE_RELEVE_MS + 1;
    const j = await fetch(b + '/api/authentic/journal').then(r => r.json());
    assert.equal(j.entrees[0].etat, 'expire');
    assert.match(j.entrees[0].intitule, /^3 - Vente DURAND\/ROUX/);
  } finally {
    s.close();
  }
});

test('origineRequete : le poste serveur (local ou par sa propre adresse) compte pour un', () => {
  const { origineRequete } = require('../src/routes/authentic');
  const req = (ip) => ({ socket: { remoteAddress: ip } });
  const propres = () => ['192.168.60.10'];
  assert.equal(origineRequete(req('127.0.0.1'), propres), 'local');
  assert.equal(origineRequete(req('::ffff:127.0.0.1'), propres), 'local');
  assert.equal(origineRequete(req('::ffff:192.168.60.10'), propres), 'local');
  assert.equal(origineRequete(req('::ffff:192.168.60.21'), propres), '192.168.60.21');
});

test('pageAuthenticConnue : intitulé de toute formulation ; un dossier ouvert dans un onglet inactif ne compte pas', () => {
  const { pageAuthenticConnue, normaliserCaptureAuthentic } = require('../src/routes/authentic');
  assert.equal(pageAuthenticConnue({ champs: [{ libelle: '1836 - Promesse MARTEL Blois Importer', valeur: '' }] }), true);
  assert.equal(pageAuthenticConnue({ champs: [], texte: '1836 - MARTEL maison\nComparants (2)' }), true);
  // Page d'agenda avec un dossier ouvert dans un autre onglet : pas une page de dossier.
  const agenda = normaliserCaptureAuthentic({ champs: [{ libelle: 'Rechercher', valeur: '' }], onglets: [{ titre: '1836 - Vente MARTEL/FOURNIER', actif: false }, { titre: 'Agenda', actif: true }], texte: '1836 - Vente MARTEL/FOURNIER\nAgenda de l’office' });
  assert.equal(agenda.onglets.length, 2);
  assert.equal(pageAuthenticConnue(agenda), false);
  assert.equal(pageAuthenticConnue({ champs: [{ libelle: 'x', valeur: '' }], onglets: [{ titre: '1836 - Vente MARTEL/FOURNIER', actif: true }], texte: '' }), true);
});

test('pageAuthenticConnue : « VTE X / Y » sans numéro, en onglet actif ou en en-tête de page', () => {
  const { pageAuthenticConnue } = require('../src/routes/authentic');
  assert.equal(pageAuthenticConnue({ champs: [{ libelle: 'x', valeur: '' }], onglets: [{ titre: 'VTE MARTEL / FOURNIER', actif: true }], texte: '' }), true);
  assert.equal(pageAuthenticConnue({ champs: [{ libelle: 'x', valeur: '' }], texte: 'VTE MARTEL/FOURNIER\nComparants (2)' }), true);
  // Une liste qui cite « VTE X / Y » sans en-tête de dossier : non.
  assert.equal(pageAuthenticConnue({ champs: [{ libelle: 'Rechercher', valeur: '' }], texte: 'VTE MARTEL / FOURNIER\nVTE COLIN / DUPUIS' }), false);
});

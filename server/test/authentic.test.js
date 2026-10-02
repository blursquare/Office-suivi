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

test('navigation : l\'intitulé seul mis en file ; retour sur une page déjà vue → navigation ; refus sans intitulé', async () => {
  const express = require('express');
  const { creerRouteurAuthentic } = require('../src/routes/authentic');
  const appli = express();
  appli.use(express.json({ limit: '2mb' }));
  appli.use('/api', creerRouteurAuthentic({ dureeAttenteMs: 200 }));
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
    // Page de dossier connue : relevée une fois, puis navigation seule au retour.
    const page = { champs: [{ groupe: '', libelle: '12 - Vente PETIT/BOSQUET', valeur: '' }], tableaux: [], texte: '12 - Vente PETIT/BOSQUET' };
    await post('releve', page);
    file = await prendre();
    assert.ok(file[0].capture);
    await post('releve', page);
    file = await prendre();
    assert.equal(file.length, 1);
    assert.match(file[0].navigation, /^12 - Vente PETIT\/BOSQUET/);
    // Jamais parmi les relevés récents (rien à créer depuis un intitulé).
    const recents = await fetch(b + '/api/authentic/releves/recents').then(r => r.json());
    assert.ok(recents.releves.every(r => !r.navigation));
  } finally {
    s.close();
  }
});

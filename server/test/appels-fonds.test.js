'use strict';

// Historique des courriers d'appel de fonds (voir src/appelsFonds.js, src/routes/appelsFonds.js). Noms et montants inventés.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirAppelFonds, assainirAppelsFonds, fusionnerAppelFonds, MAX_APPELS_FONDS } = require('../src/appelsFonds');

let db, serveurApp, baseUrl, jeton;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'm', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' } });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((r) => serveurApp.once('listening', r));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => { serveurApp.close(); db.close(); });

const appeler = (chemin, methode, corps) => fetch(`${baseUrl}${chemin}`, {
  method: methode || 'GET',
  headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
  body: corps ? JSON.stringify(corps) : undefined
});

const appel = (id, extra) => Object.assign({
  id,
  creeLe: '2026-10-06T08:00:00.000Z',
  modifieLe: '2026-10-06T08:00:00.000Z',
  par: 'Julie',
  dossierId: 'dos-1',
  dossier: 'VTE - LAMBERT / ROCHE',
  destinataires: 'Monsieur et Madame Paul ROCHE',
  dateRdv: '2026-11-03',
  nomFichier: 'Convocation - ROCHE.docx',
  gestes: [{ type: 'telecharge', le: '2026-10-06T08:00:00.000Z', par: 'Julie' }],
  donnees: {
    ref: 'VTE LAMBERT / ROCHE', addrLines: 'Monsieur et Madame Paul ROCHE', solde: '12.345,00 €',
    debitRows: [{ label: 'Prix de vente', amount: '200.000,00 €' }, { label: 'Prorata taxe foncière', formula: '913 € x 92 / 365', amount: '230,12 €' }],
    creditRows: [{ label: 'Prêt', amount: '190.000,00 €' }],
    inconnu: 'jamais gardé'
  },
  etat: { clients: [{ civilite: 'M', prenom: 'Paul', nom: 'ROCHE' }], champs: { 'af-ref': 'VTE LAMBERT / ROCHE' } }
}, extra || {});

test('assainirAppelFonds : courrier réduit aux champs du modèle Word, entrée sans id ou sans courrier refusée', () => {
  const a = assainirAppelFonds(appel('af-abc123'));
  assert.equal(a.donnees.solde, '12.345,00 €');
  assert.equal(a.donnees.inconnu, undefined);
  assert.equal(a.donnees.debitRows[1].formula, '913 € x 92 / 365');
  assert.equal(a.donnees.debitRows[0].formula, undefined);
  assert.equal(a.mode, 'office');
  assert.equal(assainirAppelFonds(appel('x')), null);
  assert.equal(assainirAppelFonds(appel('af-abc123', { donnees: null })), null);
  assert.equal(assainirAppelFonds(appel('af-abc123', { dateRdv: '03/11/2026' })).dateRdv, '');
  assert.equal(assainirAppelFonds(appel('af-abc123', { gestes: [{ type: 'pirate', le: '2026-10-06' }] })).gestes.length, 0);
});

test('assainirAppelsFonds : un par identifiant, plus récents d’abord, plafonné', () => {
  const liste = [];
  for (let i = 0; i < MAX_APPELS_FONDS + 3; i++) {
    liste.push(appel(`af-${String(i).padStart(5, '0')}`, { modifieLe: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString() }));
  }
  const p = assainirAppelsFonds(liste);
  assert.equal(p.length, MAX_APPELS_FONDS);
  assert.equal(p[0].id, `af-${String(MAX_APPELS_FONDS + 2).padStart(5, '0')}`);
  assert.ok(!p.some((a) => a.id === 'af-00000'));
});

test('fusionnerAppelFonds : création et auteur d’origine gardés, gestes des deux côtés', () => {
  const ancien = assainirAppelFonds(appel('af-abc123'));
  const nouveau = assainirAppelFonds(appel('af-abc123', {
    creeLe: '2026-10-06T09:00:00.000Z', modifieLe: '2026-10-06T09:00:00.000Z', par: 'Bastien',
    gestes: [{ type: 'envoye', le: '2026-10-06T09:00:00.000Z', par: 'Bastien' }, { type: 'modifie', le: '2026-10-06T09:30:00.000Z', par: 'Bastien' }]
  }));
  const f = fusionnerAppelFonds(ancien, nouveau);
  assert.equal(f.creeLe, '2026-10-06T08:00:00.000Z');
  assert.equal(f.par, 'Julie');
  assert.equal(f.gestes.map((g) => g.type).join(','), 'telecharge,envoye,modifie');
  assert.equal(f.modifieLe, '2026-10-06T09:00:00.000Z');
});

test('routes : enregistrer, lister (résumé sans courrier), filtrer par dossier, relire en entier, retirer', async () => {
  let r = await appeler('/api/appels-fonds', 'POST', { appel: appel('af-route1') });
  assert.equal(r.status, 200);
  await appeler('/api/appels-fonds', 'POST', { appel: appel('af-route2', { dossierId: 'dos-2', modifieLe: '2026-10-06T10:00:00.000Z' }) });
  r = await appeler('/api/appels-fonds', 'POST', { appel: { id: 'af-mauvais' } });
  assert.equal(r.status, 400);

  let liste = (await (await appeler('/api/appels-fonds')).json()).appels;
  assert.equal(liste.map((a) => a.id).join(','), 'af-route2,af-route1');
  assert.equal(liste[0].donnees, undefined);
  assert.equal(liste[0].etat, undefined);
  assert.equal(liste[0].solde, '12.345,00 €');
  assert.equal(liste[0].rouvrable, true);

  liste = (await (await appeler('/api/appels-fonds?dossier=dos-1')).json()).appels;
  assert.equal(liste.map((a) => a.id).join(','), 'af-route1');

  const complet = (await (await appeler('/api/appels-fonds/af-route1')).json()).appel;
  assert.equal(complet.donnees.creditRows[0].label, 'Prêt');
  assert.equal(complet.etat.clients[0].nom, 'ROCHE');

  assert.equal((await appeler('/api/appels-fonds/af-route1', 'DELETE')).status, 200);
  assert.equal((await appeler('/api/appels-fonds/af-route1', 'DELETE')).status, 404);
  assert.equal((await appeler('/api/appels-fonds/af-route1')).status, 404);
});

'use strict';

// Outil « Noms de fichiers du NAS » (src/nomsFichiersNas.js, src/routes/nomsFichiersNas.js) : parcours
// du dossier commun (noms des PDF seulement, en mémoire), décisions oui/non sur une forme de nom par
// pièce, section du rapport sans aucun nom. Dossiers et noms inventés.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const { assainirDecisionsFormes, appliquerDecisionForme, sectionFormesNoms, reinitialiserParcoursNoms } = require('../src/nomsFichiersNas');
const { lireVerifications } = require('../src/verificationsTerrain');

test('décisions : forme et pièce contrôlées, doublon gardé une fois, retrait par décision nulle', () => {
  const brut = [
    { cle: 'erp', forme: 'diag erp # rue …', decision: 'oui', exemple: 'DIAG ERP 3 rue des Lilas.pdf', fichiers: 3, dossiers: 3 },
    { cle: 'erp', forme: 'diag erp # rue …', decision: 'non' },
    { cle: 'erp', forme: '… #', decision: 'oui' },                 // aucun vrai mot : refusée
    { cle: 'erp', forme: 'ERP Majuscules', decision: 'oui' },       // forme non normalisée : refusée
    { cle: '1bad', forme: 'erp', decision: 'oui' },
    { cle: 'offrePret', forme: 'bail precaire pret', decision: 'non' }
  ];
  const d = assainirDecisionsFormes(brut);
  assert.equal(d.map((x) => `${x.cle}:${x.forme}:${x.decision}`).join(' | '), 'erp:diag erp # rue …:oui | offrePret:bail precaire pret:non');
  const apres = appliquerDecisionForme(d, { cle: 'offrePret', forme: '# contrat pret', decision: 'oui', exemple: '3843 _contrat_pret.pdf', fichiers: 12, dossiers: 9 }, '2026-10-03T09:00:00.000Z');
  assert.equal(apres[0].forme, '# contrat pret');
  assert.equal(appliquerDecisionForme(apres, { cle: 'erp', forme: 'diag erp # rue …', decision: null }).some((x) => x.cle === 'erp'), false);
});

test('rapport : totaux par pièce, formes de la période, jamais l’exemple', () => {
  const decisions = [
    { cle: 'erp', forme: 'diag erp # rue …', decision: 'oui', le: '2026-10-03T09:00:00.000Z', exemple: 'DIAG ERP 3 rue des Lilas DURAND.pdf', fichiers: 3, dossiers: 3 },
    { cle: 'erp', forme: 'erp etablissement recevant public', decision: 'non', le: '2026-09-01T09:00:00.000Z', exemple: 'ERP établissement recevant du public.pdf', fichiers: 1, dossiers: 1 }
  ];
  const lignes = sectionFormesNoms(decisions, '2026-10-03T05:00:00.000Z', '2026-10-03T10:00:00.000Z').join('\n');
  assert.match(lignes, /erp 1 oui \/ 1 non/);
  assert.match(lignes, /erp · OUI · `diag erp # rue …` \(3 fichier\(s\), 3 dossier\(s\)\)/);
  assert.ok(!lignes.includes('etablissement'), 'décision hors période non détaillée');
  assert.ok(!/DURAND|Lilas/.test(lignes));
});

let db, serveur, base, racine, parametresRepo;
before(async () => {
  racine = fs.mkdtempSync(path.join(os.tmpdir(), 'commun-'));
  const creer = (rel) => { fs.mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true }); fs.writeFileSync(path.join(racine, rel), '%PDF-1.4'); };
  creer('2024-118 DURAND MARTIN/3 - AAE/DIAG ERP 3 rue des Lilas.pdf');
  creer('2024-118 DURAND MARTIN/0 - COMPTABILITE - PRET/3843 _contrat_pret.pdf');
  creer('2025-007 LEROY BLANC/Diag ERP 12 rue Haute.pdf');
  creer('2025-007 LEROY BLANC/notes.txt');
  creer('.cache/ignore.pdf');
  reinitialiserParcoursNoms();
  db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { motDePasse: 'x', racineRepo: os.tmpdir(), port: 0, authActive: false, nasRacine: racine } });
  parametresRepo = creerRepoParametres(db);
  serveur = app.listen(0);
  await new Promise((ok) => serveur.once('listening', ok));
  base = `http://127.0.0.1:${serveur.address().port}`;
});
after(() => { serveur.close(); db.close(); fs.rmSync(racine, { recursive: true, force: true }); });

test('parcours du commun : noms des PDF de chaque dossier client, dossiers cachés ignorés, vérification cochée', async () => {
  const lance = await (await fetch(base + '/api/nas/noms-fichiers/parcourir', { method: 'POST' })).json();
  assert.ok(['en-cours', 'pret'].includes(lance.etat));
  let etat;
  for (let i = 0; i < 100; i++) {
    etat = await (await fetch(base + '/api/nas/noms-fichiers')).json();
    if (etat.etat === 'pret') break;
    await new Promise((ok) => setTimeout(ok, 20));
  }
  assert.equal(etat.etat, 'pret');
  assert.equal(etat.dossiersTotal, 2);
  const noms = etat.fichiers.map((f) => f[1]).sort().join(' | ');
  assert.equal(noms, '3843 _contrat_pret.pdf | DIAG ERP 3 rue des Lilas.pdf | Diag ERP 12 rue Haute.pdf');
  assert.equal(new Set(etat.fichiers.map((f) => f[0])).size, 2, 'un index par dossier client');
  assert.ok(lireVerifications(parametresRepo)['nas-noms-parcours'].premiereFois);
});

test('formes : enregistrées en base, relues, retirées', async () => {
  const poster = (corps) => fetch(base + '/api/formes-noms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  assert.equal((await poster({ cle: 'erp', forme: 'Pas Normalisée', decision: 'oui' })).status, 400);
  await poster({ cle: 'erp', forme: 'diag erp # rue …', decision: 'oui', exemple: 'DIAG ERP 3 rue des Lilas.pdf', fichiers: 2, dossiers: 2 });
  await poster({ cle: 'offrePret', forme: 'bail precaire pret', decision: 'non', fichiers: 1, dossiers: 1 });
  let lu = await (await fetch(base + '/api/formes-noms')).json();
  assert.equal(lu.decisions.map((d) => `${d.cle}:${d.decision}`).join(), 'offrePret:non,erp:oui');
  await poster({ cle: 'erp', forme: 'diag erp # rue …', decision: null });
  lu = await (await fetch(base + '/api/formes-noms')).json();
  assert.equal(lu.decisions.length, 1);
});

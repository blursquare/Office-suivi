'use strict';

// Claire Scan, étude 20/10 : ce qui s'apprend d'un rangement à la main, la recherche dans le texte des scans rangés, les doublons,
// les chiffres du mois et « Remettre dans Scan ».

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { statistiquesScans } = require('../src/routes/scans');
const { creerScansTextes, motsRecherche, requeteFts } = require('../src/scansTextes');

let base, nas, scan, db, srv, url, client;
before(async () => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-scans-mem-'));
  nas = path.join(base, 'Commun', 'DOSSIERS CLIENTS');
  scan = path.join(base, 'Commun', 'Scan');
  client = path.join(nas, 'DURAND Camille');
  fs.mkdirSync(path.join(client, '10 - AAE'), { recursive: true });
  fs.mkdirSync(scan, { recursive: true });
  const vieux = new Date(Date.now() - 3600 * 1000);
  for (const nom of ['SCAN_A.pdf', 'SCAN_B.pdf']) {
    fs.writeFileSync(path.join(scan, nom), '%PDF-1.4 contrat de maintenance de la chaudiere');
    fs.utimesSync(path.join(scan, nom), vieux, vieux);
  }
  db = ouvrirDb(':memory:');
  const { app, parametresRepo } = creerApp({ db, config: { motDePasse: '', authActive: false, racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', nasRacine: nas } });
  parametresRepo.ecrireReglagesScans({ actif: true, auto: false, depuis: '2020-01-01' });
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  url = (c) => `http://127.0.0.1:${srv.address().port}${c}`;
});
after(() => { srv.close(); db.close(); fs.rmSync(base, { recursive: true, force: true }); });

const post = (c, corps) => fetch(url(c), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
let idRangement;

test('motsRecherche et requête FTS : sans accent ni majuscule, deux lettres, huit mots au plus, jamais d’injection', () => {
  assert.deepEqual(motsRecherche('Contrat d’Entretien CHAUDIÈRE'), ['contrat', 'entretien', 'chaudiere']);
  assert.equal(requeteFts(['a"b']), '"ab"*');
  assert.equal(requeteFts([]), '');
  assert.equal(motsRecherche('aa bb cc dd ee ff gg hh ii jj kk ll mm nn').length, 8);
});

test('statistiquesScans : le mois écoulé seulement, sans les rangements annulés', () => {
  const now = Date.parse('2026-10-20T10:00:00Z');
  const s = statistiquesScans([
    { date: '2026-10-19T10:00:00Z', auto: true }, { date: '2026-10-18T10:00:00Z', auto: false, corrige: true, type: 'rib' },
    { date: '2026-10-17T10:00:00Z', auto: false, corrige: true, type: 'rib' }, { date: '2026-10-16T10:00:00Z', auto: false, annule: '2026-10-16T11:00:00Z' },
    { date: '2026-08-01T10:00:00Z', auto: true }
  ], now);
  assert.deepEqual({ r: s.ranges, a: s.automatiques, c: s.corriges, t: s.typesCorriges }, { r: 3, a: 1, c: 2, t: [{ type: 'rib', n: 2 }] });
});

test('l’index du texte : indexer, chercher par préfixe, remplacer, retirer, borner', () => {
  const dbi = ouvrirDb(':memory:');
  const t = creerScansTextes(dbi);
  t.indexer({ id: 'r1', nom: 'Entretien chaudière - Claire Scan.pdf', dossier: 'VTE - DURAND', rubrique: '10 - AAE', date: '2026-10-20', texte: 'Contrat de maintenance annuel de la chaudière à gaz, visite en septembre' });
  assert.equal(t.chercher('chaudiere').length, 1);
  assert.equal(t.chercher('mainten').length, 1);
  assert.equal(t.chercher('chaudiere durand').length, 1);
  assert.equal(t.chercher('chaudiere inconnu').length, 0);
  assert.match(t.chercher('septembre')[0].extrait, /septembre/);
  t.indexer({ id: 'r1', nom: 'x.pdf', date: '2026-10-21', texte: 'autre texte' });
  assert.equal(t.nombre(), 1);
  assert.equal(t.chercher('chaudiere').length, 0);
  t.retirer('r1');
  assert.equal(t.nombre(), 0);
  assert.deepEqual(t.chercher('"'), []);
  dbi.close();
});

test('rangement à la main : id, empreinte, mémoire des types et des identifiants, texte cherchable, chiffres du mois', async () => {
  const r = await post('/api/scans/ranger', {
    nom: 'SCAN_A.pdf', dossierNas: 'DURAND Camille', rubriques: ['aae'], nomCible: 'Entretien de la chaudière - Claire Scan', dossierId: 'd1', dossier: 'VTE - DURAND',
    type: 'entretienChaudiere', auteur: 'Julie VASSELIN', corrige: true,
    apprentissage: { mots: ['contrat', 'maintenance', 'chaudiere', 'entretien'], type: 'entretienChaudiere', identifiants: ['20260123456', 'pas valide', 'AB12'] },
    texte: 'CONTRAT DE MAINTENANCE de la chaudière n° 20260123456. Visite annuelle.'
  });
  const corps = await r.json();
  assert.equal(r.status, 200, JSON.stringify(corps));
  idRangement = corps.id;
  assert.match(idRangement, /^[0-9a-f-]{36}$/);
  const mem = await (await fetch(url('/api/scans/memoire'))).json();
  assert.equal(mem.types.length, 1);
  assert.equal(mem.types[0].type, 'entretienChaudiere');
  assert.deepEqual(mem.identifiants.map((e) => [e.id, e.dossierId]), [['20260123456', 'd1']]);
  assert.ok(mem.rev >= 1);
  const rech = await (await fetch(url('/api/scans/recherche?q=' + encodeURIComponent('maintenance chaudière')))).json();
  assert.equal(rech.resultats.length, 1);
  assert.equal(rech.resultats[0].id, idRangement);
  assert.equal(rech.resultats[0].dossier, 'VTE - DURAND');
  assert.ok(!('texte' in rech.resultats[0]));
  const etat = await (await fetch(url('/api/scans'))).json();
  assert.equal(etat.stats.ranges, 1);
  assert.equal(etat.stats.corriges, 1);
  assert.equal(etat.memoireRev, mem.rev);
  assert.equal(etat.textesIndexes, 1);
  assert.match(etat.journal[0].hash, /^[a-f0-9]{64}$/);
});

test('un rangement automatique n’apprend rien', async () => {
  const avant = (await (await fetch(url('/api/scans/memoire'))).json()).rev;
  fs.writeFileSync(path.join(scan, 'SCAN_C.pdf'), '%PDF-1.4 autre document');
  const r = await post('/api/scans/ranger', { nom: 'SCAN_C.pdf', dossierNas: 'DURAND Camille', rubriques: ['aae'], nomCible: 'Autre', dossierId: 'd1', dossier: 'VTE - DURAND', type: 'rib', auto: true,
    apprentissage: { mots: ['aaaa', 'bbbb', 'cccc'], type: 'rib', identifiants: ['99999999'] } });
  assert.equal(r.status, 200);
  assert.equal((await (await fetch(url('/api/scans/memoire'))).json()).rev, avant);
});

test('doublon : un scan identique à un scan déjà rangé le dit', async () => {
  const etat = await (await fetch(url('/api/scans'))).json();
  const b = etat.scans.find((s) => s.nom === 'SCAN_B.pdf');
  assert.ok(b && b.doublon, JSON.stringify(etat.scans));
  assert.equal(b.doublon.dossier, 'VTE - DURAND');
});

test('doublon : le serveur refuse de le ranger seul (auto), la main reste libre', async () => {
  const r = await post('/api/scans/ranger', { nom: 'SCAN_B.pdf', dossierNas: 'DURAND Camille', rubriques: ['aae'], nomCible: 'B', dossierId: 'd1', dossier: 'VTE - DURAND', type: 'rib', auto: true });
  assert.equal(r.status, 409);
  assert.ok(fs.existsSync(path.join(scan, 'SCAN_B.pdf')), 'le scan reste dans Scan');
});

test('« Remettre dans Scan » : la copie revient, l’original archivé passe dans « Annulés », jamais supprimé, une seule fois', async () => {
  const entree = (await (await fetch(url('/api/scans'))).json()).journal.find((e) => e.id === idRangement);
  const copie = path.join(nas, entree.chemin);
  assert.ok(fs.existsSync(copie));
  const r = await post('/api/scans/annuler', { id: idRangement });
  const corps = await r.json();
  assert.equal(r.status, 200, JSON.stringify(corps));
  assert.equal(corps.entree.dossierId, 'd1');
  assert.ok(!fs.existsSync(copie), 'la copie a quitté le dossier du client');
  assert.ok(fs.existsSync(path.join(scan, corps.remis)));
  assert.equal(fs.readFileSync(path.join(scan, corps.remis), 'utf8'), '%PDF-1.4 contrat de maintenance de la chaudiere');
  assert.ok(fs.readdirSync(path.join(scan, 'CLAIRE - scans rangés', 'Annulés')).length === 1, 'l’original archivé est gardé dans Annulés');
  const etat = await (await fetch(url('/api/scans'))).json();
  assert.ok(etat.journal.find((e) => e.id === idRangement).annule);
  assert.equal(etat.stats.ranges, 1, 'seul le rangement automatique du scan C compte encore');
  const rech = await (await fetch(url('/api/scans/recherche?q=maintenance'))).json();
  assert.equal(rech.resultats.length, 0);
  assert.equal((await post('/api/scans/annuler', { id: idRangement })).status, 409);
  assert.equal((await post('/api/scans/annuler', { id: 'inconnu-inconnu' })).status, 404);
  assert.equal((await post('/api/scans/annuler', { id: '../../etc' })).status, 400);
});

test('« Remettre dans Scan » refusé quand la copie a changé ou n’est plus là', async () => {
  fs.writeFileSync(path.join(scan, 'SCAN_D.pdf'), '%PDF-1.4 d');
  const r = await post('/api/scans/ranger', { nom: 'SCAN_D.pdf', dossierNas: 'DURAND Camille', rubriques: ['aae'], nomCible: 'D', dossierId: 'd1', dossier: 'VTE - DURAND', type: 'rib' });
  const { id, chemin } = await r.json();
  fs.appendFileSync(path.join(nas, chemin), ' modifié');
  assert.equal((await post('/api/scans/annuler', { id })).status, 409);
  fs.rmSync(path.join(nas, chemin));
  assert.equal((await post('/api/scans/annuler', { id })).status, 404);
});

test('oublier ce qui a été appris', async () => {
  const r = await fetch(url('/api/scans/memoire'), { method: 'DELETE' });
  const m = await r.json();
  assert.deepEqual([m.types.length, m.identifiants.length], [0, 0]);
});

test('« Remettre dans Scan » : une copie de même taille mais d’un autre contenu n’est jamais retirée', async () => {
  fs.writeFileSync(path.join(scan, 'SCAN_E.pdf'), '%PDF-1.4 e1');
  const r = await post('/api/scans/ranger', { nom: 'SCAN_E.pdf', dossierNas: 'DURAND Camille', rubriques: ['aae'], nomCible: 'E', dossierId: 'd1', dossier: 'VTE - DURAND', type: 'rib' });
  const { id, chemin } = await r.json();
  fs.writeFileSync(path.join(nas, chemin), '%PDF-1.4 e2');   // même taille, autre contenu
  assert.equal((await post('/api/scans/annuler', { id })).status, 409);
  assert.ok(fs.existsSync(path.join(nas, chemin)), 'le fichier du client est resté');
});


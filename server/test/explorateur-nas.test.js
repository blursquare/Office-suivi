'use strict';

// Explorateur du dossier client (src/explorateurNas.js + routes/explorateurNas.js) : tout est confiné au dossier relié à la fiche ;
// renommer garde l'extension, déplacer ne crée ni n'écrase, rien ne se supprime.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const exp = require('../src/explorateurNas');

let base, nas, db, srv, url, client;

before(async () => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-explo-'));
  nas = path.join(base, 'nas');
  client = path.join(nas, 'DUPONT MARTIN');
  for (const d of ['1 - Vendeur', '9 - AAE', '9 - AAE/Anciens']) fs.mkdirSync(path.join(client, d), { recursive: true });
  fs.mkdirSync(path.join(nas, 'AUTRE CLIENT'), { recursive: true });
  fs.writeFileSync(path.join(client, '1 - Vendeur', 'identite.pdf'), '%PDF-1.4 a');
  fs.writeFileSync(path.join(client, '1 - Vendeur', 'rib.pdf'), '%PDF-1.4 b');
  fs.writeFileSync(path.join(client, '9 - AAE', 'rib.pdf'), '%PDF-1.4 deja la');
  fs.writeFileSync(path.join(client, '9 - AAE', 'notes.docx'), 'PK docx');
  fs.writeFileSync(path.join(client, '9 - AAE', 'outil.exe'), 'MZ');
  fs.writeFileSync(path.join(client, '9 - AAE', 'Thumbs.db'), 'x');
  fs.writeFileSync(path.join(nas, 'AUTRE CLIENT', 'secret.pdf'), '%PDF-1.4 autre client');
  fs.writeFileSync(path.join(base, 'hors.pdf'), '%PDF-1.4 hors NAS');
  try { fs.symlinkSync(path.join(nas, 'AUTRE CLIENT'), path.join(client, 'lien-autre')); } catch (_) { /* pas de liens ici */ }
  db = ouvrirDb(':memory:');
  const { app, depot } = creerApp({ db, config: { motDePasse: '', authActive: false, racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', nasRacine: nas } });
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', nasDossier: 'DUPONT MARTIN', dossierLie: true });
  depot.creer({ id: 'd2', nom: 'SANS NAS' });
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  url = (c) => `http://127.0.0.1:${srv.address().port}${c}`;
});
after(() => { srv.close(); db.close(); fs.rmSync(base, { recursive: true, force: true }); });

const post = (c, corps) => fetch(url(c), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

test('nomFichierRenomme : l’extension reste, les caractères interdits tombent, rien de vide', () => {
  assert.equal(exp.nomFichierRenomme('Carte d’identité Paul', 'identite.pdf'), 'Carte d’identité Paul.pdf');
  assert.equal(exp.nomFichierRenomme('RIB.pdf', 'rib.pdf'), 'RIB.pdf');
  assert.equal(exp.nomFichierRenomme('a/b\\c:d?.pdf', 'x.pdf'), 'a b c d.pdf');
  assert.equal(exp.nomFichierRenomme('  .. ', 'x.pdf'), '');
  assert.equal(exp.nomFichierRenomme('nul', 'x.pdf'), 'Document nul.pdf');
});

test('liste : un niveau, sans fichiers cachés, et l’arborescence des dossiers', async () => {
  let r = await (await fetch(url('/api/nas/explorer?dossierId=d1'))).json();
  assert.deepEqual(r.dossiers.map((d) => d.nom).filter((n) => n !== 'lien-autre'), ['1 - Vendeur', '9 - AAE']);
  assert.ok(r.arbre.includes('9 - AAE/Anciens'));
  r = await (await fetch(url('/api/nas/explorer?dossierId=d1&sous=' + encodeURIComponent('9 - AAE')))).json();
  assert.deepEqual(r.fichiers.map((f) => f.nom), ['notes.docx', 'outil.exe', 'rib.pdf']);
});

test('confinement : dossier non relié, sortie du dossier du client, lien vers un autre client', async () => {
  assert.equal((await fetch(url('/api/nas/explorer?dossierId=d2'))).status, 400);
  assert.equal((await fetch(url('/api/nas/explorer?dossierId=inconnu'))).status, 400);
  for (const mauvais of ['..', '../AUTRE CLIENT', '../../hors.pdf']) {
    assert.equal((await fetch(url('/api/nas/explorer?dossierId=d1&sous=' + encodeURIComponent(mauvais)))).status, 400, mauvais);
    assert.equal((await fetch(url('/api/nas/explorer/fichier?dossierId=d1&chemin=' + encodeURIComponent(mauvais + '/secret.pdf')))).status, 400, mauvais);
  }
  if (fs.existsSync(path.join(client, 'lien-autre'))) {
    assert.equal((await fetch(url('/api/nas/explorer?dossierId=d1&sous=lien-autre'))).status, 400);
    assert.equal((await post('/api/nas/explorer/deplacer', { dossierId: 'd1', chemin: '1 - Vendeur/rib.pdf', vers: 'lien-autre' })).status, 400);
  }
});

test('fichier : PDF affiché, Word téléchargé, exécutable et fichiers cachés jamais servis', async () => {
  let r = await fetch(url('/api/nas/explorer/fichier?dossierId=d1&chemin=' + encodeURIComponent('1 - Vendeur/identite.pdf')));
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /^inline/);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  r = await fetch(url('/api/nas/explorer/fichier?dossierId=d1&chemin=' + encodeURIComponent('9 - AAE/notes.docx')));
  assert.match(r.headers.get('content-disposition'), /^attachment/);
  assert.equal((await fetch(url('/api/nas/explorer/fichier?dossierId=d1&chemin=' + encodeURIComponent('9 - AAE/outil.exe')))).status, 400);
  assert.equal((await fetch(url('/api/nas/explorer/fichier?dossierId=d1&chemin=' + encodeURIComponent('9 - AAE/Thumbs.db')))).status, 400);
});

test('renommer : extension gardée, jamais d’écrasement, jamais un dossier', async () => {
  let r = await post('/api/nas/explorer/renommer', { dossierId: 'd1', chemin: '1 - Vendeur/identite.pdf', nom: 'Carte identité Paul' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).chemin, '1 - Vendeur/Carte identité Paul.pdf');
  assert.ok(fs.existsSync(path.join(client, '1 - Vendeur', 'Carte identité Paul.pdf')));
  assert.equal((await post('/api/nas/explorer/renommer', { dossierId: 'd1', chemin: '1 - Vendeur/Carte identité Paul.pdf', nom: 'rib' })).status, 409);
  assert.equal((await post('/api/nas/explorer/renommer', { dossierId: 'd1', chemin: '1 - Vendeur', nom: 'autre' })).status, 400);
  assert.equal((await post('/api/nas/explorer/renommer', { dossierId: 'd1', chemin: '9 - AAE/outil.exe', nom: 'ok' })).status, 400);
  assert.equal((await post('/api/nas/explorer/renommer', { dossierId: 'd1', chemin: '1 - Vendeur/rib.pdf', nom: '   ' })).status, 400);
});

test('déplacer : vers un dossier existant du même client, « (2) » si le nom est pris, jamais ailleurs', async () => {
  let r = await post('/api/nas/explorer/deplacer', { dossierId: 'd1', chemin: '1 - Vendeur/rib.pdf', vers: '9 - AAE' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.chemin, '9 - AAE/rib (2).pdf');
  assert.equal(fs.readFileSync(path.join(client, '9 - AAE', 'rib.pdf'), 'utf8'), '%PDF-1.4 deja la');
  assert.ok(!fs.existsSync(path.join(client, '1 - Vendeur', 'rib.pdf')));
  // retour (le geste « Annuler » du poste) : le fichier retourne sous le nom qu'il avait
  r = await post('/api/nas/explorer/deplacer', { dossierId: 'd1', chemin: j.chemin, vers: '1 - Vendeur' });
  assert.equal(r.status, 200);
  for (const vers of ['../AUTRE CLIENT', '9 - AAE/Inexistant', '../..', '9 - AAE/notes.docx']) {
    assert.ok([400, 404].includes((await post('/api/nas/explorer/deplacer', { dossierId: 'd1', chemin: '1 - Vendeur/Carte identité Paul.pdf', vers })).status), vers);
  }
  assert.equal((await post('/api/nas/explorer/deplacer', { dossierId: 'd1', chemin: '1 - Vendeur/Carte identité Paul.pdf', vers: '1 - Vendeur' })).status, 400);
  assert.ok(fs.existsSync(path.join(base, 'hors.pdf')) && fs.existsSync(path.join(nas, 'AUTRE CLIENT', 'secret.pdf')));
});

test('journal : renommer et déplacer sont notés (relatifs au dossier du client)', async () => {
  const { creerRepoParametres } = require('../src/parametresRepo');
  const j = creerRepoParametres(db).lireJournalGestesNas();
  assert.ok(j.length >= 3);
  assert.ok(j.every((e) => e.dossierId === 'd1' && !e.de.includes(os.tmpdir())));
  assert.ok(j.some((e) => e.geste === 'renomme') && j.some((e) => e.geste === 'deplace'));
});

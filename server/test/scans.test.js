'use strict';

// Classeur des scans du copieur (src/scans.js + src/routes/scans.js). Le point sensible : c'est la
// PREMIÈRE fonction de CLAIRE qui écrit dans les dossiers clients du NAS. D'où, en priorité, des
// tests sur le confinement (un nom de scan ou un dossier venus d'une requête), l'absence
// d'écrasement et la conservation de l'original.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { creerApp } = require('../src/app');
const { accorderRelais, DUREE_RELAIS_MS } = require('../src/routes/scans');
const { assainirReglagesScans } = require('../src/parametresRepo');
const { ouvrirDb } = require('../src/db');
const {
  partagesScansCandidats, depuisMsScans,
  trouverDossierScans, parentsCandidats, nomScanValide, listerScans, nomRubriqueNormalise,
  resoudreRubrique, nomFichierSur, rangerScan, NOM_ARCHIVE_SCANS
} = require('../src/scans');

test('nomScanValide : un simple nom de PDF, jamais un chemin', () => {
  assert.equal(nomScanValide('SCAN_0001.pdf'), true);
  assert.equal(nomScanValide('Doc 30-09-2026 10.12.PDF'), true);
  for (const mauvais of ['../secret.pdf', 'a/b.pdf', 'a\\b.pdf', '..pdf', '.cache.pdf', '~tmp.pdf', 'image.jpg', '', 'a\0.pdf']) {
    assert.equal(nomScanValide(mauvais), false, mauvais);
  }
});

test('parentsCandidats remonte jusqu’à la racine du partage Windows', () => {
  const liste = parentsCandidats('\\\\192.168.60.5\\Commun\\DOSSIERS CLIENTS', path.win32);
  assert.equal(liste[0], '\\\\192.168.60.5\\Commun\\DOSSIERS CLIENTS');
  assert.ok(liste.includes('\\\\192.168.60.5\\Commun\\'));
});

test('nomRubriqueNormalise retire numéro de rubrique, accents et ponctuation', () => {
  assert.equal(nomRubriqueNormalise('8 - COPRO et ETAT DATE'), 'COPRO ET ETAT DATE');
  assert.equal(nomRubriqueNormalise('2 - Acquéreur'), 'ACQUEREUR');
  assert.equal(nomRubriqueNormalise('0 - COMPTABILITE - PRET'), 'COMPTABILITE PRET');
  assert.equal(nomRubriqueNormalise('10 - AAE'), 'AAE');
  assert.equal(nomRubriqueNormalise('0- COMPTABILITE'), 'COMPTABILITE');
});

test('nomFichierSur : nom Windows valide, extension .pdf unique, longueur bornée', () => {
  assert.equal(nomFichierSur('État daté - Claire Scan'), 'État daté - Claire Scan.pdf');
  assert.equal(nomFichierSur('a/b\\c:d*e?.pdf'), 'a b c d e.pdf');
  assert.equal(nomFichierSur('  ..  '), 'Scan.pdf');
  assert.ok(nomFichierSur('x'.repeat(300)).length <= 124);
});

// Arborescence reprenant le modèle réel de l'étude (MAISON / COPRO), noms inventés.
let base, nas, scan, db, srv, url;
function creerArbo() {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-scans-'));
  nas = path.join(base, 'Commun', 'DOSSIERS CLIENTS');
  scan = path.join(base, 'Commun', 'Scan');
  const copro = path.join(nas, 'DURAND Camille');
  for (const r of ['0 - COMPTABILITE - PRET/PRET', '1 - Vendeur', '2 - Acquéreur', '3 - Titre de propriété', '4 - Diagnostics',
    '8 - COPRO et ETAT DATE/ETAT DATE', '8 - COPRO et ETAT DATE/PRE ETAT DATE', '9 - SRU', '10 - AAE']) {
    fs.mkdirSync(path.join(copro, r), { recursive: true });
  }
  fs.mkdirSync(path.join(nas, 'LEROY Paul', '1 - Vendeur'), { recursive: true });
  fs.mkdirSync(scan, { recursive: true });
  fs.mkdirSync(path.join(scan, 'vieux'), { recursive: true });
  fs.writeFileSync(path.join(scan, 'SCAN_0001.pdf'), '%PDF-1.4 etat date');
  fs.writeFileSync(path.join(scan, 'SCAN_0002.pdf'), '%PDF-1.4 identite');
  fs.writeFileSync(path.join(scan, 'notes.txt'), 'pas un pdf');
  fs.writeFileSync(path.join(scan, 'vieux', 'SCAN_ANCIEN.pdf'), '%PDF-1.4 dans un sous-dossier');
  const vieux = new Date('2026-01-05T10:00:00Z');
  fs.writeFileSync(path.join(scan, 'SCAN_2025.pdf'), '%PDF-1.4 historique');
  fs.utimesSync(path.join(scan, 'SCAN_2025.pdf'), vieux, vieux);
  fs.writeFileSync(path.join(base, 'secret.pdf'), '%PDF-1.4 hors NAS');
}

before(async () => {
  creerArbo();
  db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { motDePasse: '', authActive: false, racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', nasRacine: nas } });
  srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  url = (c) => `http://127.0.0.1:${srv.address().port}${c}`;
});

after(() => {
  srv.close();
  db.close();
  fs.rmSync(base, { recursive: true, force: true });
});

const envoyer = (methode, c, corps) => fetch(url(c), { method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

test('trouverDossierScans trouve « Scan » à la racine du NAS, à côté des dossiers clients', async () => {
  assert.equal(await trouverDossierScans({ nasRacine: nas }), scan);
  assert.equal(await trouverDossierScans({ nasRacine: nas, nasScans: path.join(base, 'absent') }), null);
  assert.equal(await trouverDossierScans({ nasRacine: '' }), null);
});

test('listerScans : seuls les PDF posés directement dans Scan, depuis la date donnée', async () => {
  const depuis = Date.parse('2026-09-01T00:00:00');
  const noms = (await listerScans(scan, depuis, Date.now() + 60000)).map((s) => s.nom).sort();
  assert.equal(noms.join(','), 'SCAN_0001.pdf,SCAN_0002.pdf');
  const tous = (await listerScans(scan, NaN, Date.now() + 60000)).map((s) => s.nom).sort();
  assert.equal(tous.join(','), 'SCAN_0001.pdf,SCAN_0002.pdf,SCAN_2025.pdf');
  // Un scan qui vient d'arriver peut être encore en cours d'écriture par le copieur.
  assert.equal((await listerScans(scan, depuis, Date.now()))[0].stable, false);
});

test('resoudreRubrique suit l’arborescence réelle par le nom, numéro ignoré', async () => {
  const client = path.join(nas, 'DURAND Camille');
  assert.equal(await resoudreRubrique(client, ['etatDate']), path.join('8 - COPRO et ETAT DATE', 'ETAT DATE'));
  assert.equal(await resoudreRubrique(client, ['preEtatDate']), path.join('8 - COPRO et ETAT DATE', 'PRE ETAT DATE'));
  assert.equal(await resoudreRubrique(client, ['pret']), path.join('0 - COMPTABILITE - PRET', 'PRET'));
  assert.equal(await resoudreRubrique(client, ['acquereur']), '2 - Acquéreur');
  assert.equal(await resoudreRubrique(client, ['aae']), '10 - AAE');
  // Terrain sans rubrique Diagnostics : l'alternative suivante, sinon la racine du dossier.
  assert.equal(await resoudreRubrique(path.join(nas, 'LEROY Paul'), ['diagnostics', 'aae']), '');
  assert.equal(await resoudreRubrique(path.join(nas, 'LEROY Paul'), ['vendeur']), '1 - Vendeur');
});

test('rangerScan refuse un dossier client hors du NAS ou la racine elle-même', async () => {
  for (const dossierNas of ['../..', '..', '', '/etc']) {
    const r = await rangerScan({ dossierScans: scan, nasRacine: nas, nom: 'SCAN_0001.pdf', dossierNas, rubriques: [], nomCible: 'x' });
    assert.ok(r.erreur, dossierNas);
  }
  const r = await rangerScan({ dossierScans: scan, nasRacine: nas, nom: '../secret.pdf', dossierNas: 'DURAND Camille', rubriques: [], nomCible: 'x' });
  assert.equal(r.statut, 400);
  assert.ok(fs.existsSync(path.join(scan, 'SCAN_0001.pdf')), 'l’original ne bouge pas sur refus');
});

test('routes : rien n’est rangé tant que le classement n’est pas activé', async () => {
  let etat = await (await fetch(url('/api/scans'))).json();
  assert.equal(etat.configure, true);
  assert.equal(etat.scans.length, 0);
  const r = await envoyer('POST', '/api/scans/ranger', { nom: 'SCAN_0001.pdf', dossierNas: 'DURAND Camille', rubriques: ['etatDate'], nomCible: 'État daté' });
  assert.equal(r.status, 409);
  etat = await (await envoyer('PUT', '/api/scans/reglages', { actif: true, depuis: '2026-09-01' })).json();
  assert.equal(etat.reglages.actif, true);
  const liste = await (await fetch(url('/api/scans'))).json();
  assert.equal(liste.scans.map((s) => s.nom).sort().join(','), 'SCAN_0001.pdf,SCAN_0002.pdf');
});

test('routes : un scan est servi par son nom seul', async () => {
  let r = await fetch(url('/api/scans/fichier?nom=SCAN_0001.pdf'));
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '%PDF-1.4 etat date');
  for (const mauvais of ['../secret.pdf', 'vieux/SCAN_ANCIEN.pdf', 'notes.txt']) {
    r = await fetch(url('/api/scans/fichier?nom=' + encodeURIComponent(mauvais)));
    assert.ok(r.status === 400 || r.status === 404, mauvais + ' → ' + r.status);
  }
});

test('routes : ranger copie dans la rubrique, garde l’original, n’écrase jamais', async () => {
  const cible = path.join(nas, 'DURAND Camille', '8 - COPRO et ETAT DATE', 'ETAT DATE');
  fs.writeFileSync(path.join(cible, 'État daté - Claire Scan.pdf'), '%PDF-1.4 existant');
  const r = await envoyer('POST', '/api/scans/ranger', {
    nom: 'SCAN_0001.pdf', dossierNas: 'DURAND Camille', rubriques: ['etatDate'], nomCible: 'État daté - Claire Scan',
    dossierId: 'd1', dossier: 'VTE - DURAND', type: 'etatDate', auteur: 'Julie VASSELIN'
  });
  const corps = await r.json();
  assert.equal(r.status, 200, JSON.stringify(corps));
  assert.equal(corps.chemin, path.join('DURAND Camille', '8 - COPRO et ETAT DATE', 'ETAT DATE', 'État daté - Claire Scan (2).pdf'));
  assert.equal(fs.readFileSync(path.join(cible, 'État daté - Claire Scan.pdf'), 'utf8'), '%PDF-1.4 existant');
  assert.equal(fs.readFileSync(path.join(nas, corps.chemin), 'utf8'), '%PDF-1.4 etat date');
  // L'original a quitté la file du dossier Scan pour son archive, intact.
  assert.equal(fs.existsSync(path.join(scan, 'SCAN_0001.pdf')), false);
  assert.equal(fs.readFileSync(path.join(scan, corps.original), 'utf8'), '%PDF-1.4 etat date');
  assert.ok(corps.original.startsWith(NOM_ARCHIVE_SCANS));
  const etat = await (await fetch(url('/api/scans'))).json();
  assert.equal(etat.scans.map((s) => s.nom).join(','), 'SCAN_0002.pdf');
  assert.equal(etat.journal[0].nom, 'SCAN_0001.pdf');
  assert.equal(etat.journal[0].auteur, 'Julie VASSELIN');
  // Rangé une seconde fois (deux fenêtres) : refusé proprement, rien n'est dupliqué.
  const bis = await envoyer('POST', '/api/scans/ranger', { nom: 'SCAN_0001.pdf', dossierNas: 'DURAND Camille', rubriques: ['etatDate'], nomCible: 'x' });
  assert.equal(bis.status, 404);
});

test('routes : un scan écarté n’est plus proposé, puis peut être rétabli', async () => {
  await envoyer('POST', '/api/scans/ecarter', { nom: 'SCAN_0002.pdf', auteur: 'Julie VASSELIN' });
  let etat = await (await fetch(url('/api/scans'))).json();
  assert.equal(etat.scans.length, 0);
  assert.equal(etat.ecartes.map((s) => s.nom).join(','), 'SCAN_0002.pdf');
  await envoyer('POST', '/api/scans/retablir', { nom: 'SCAN_0002.pdf' });
  etat = await (await fetch(url('/api/scans'))).json();
  assert.equal(etat.scans.map((s) => s.nom).join(','), 'SCAN_0002.pdf');
});

test('réglages : le rangement automatique est actif par défaut, seul un « non » explicite le coupe', () => {
  assert.equal(assainirReglagesScans({ actif: true }).auto, true);
  assert.equal(assainirReglagesScans({}).auto, true);
  assert.equal(assainirReglagesScans({ auto: false }).auto, false);
  assert.equal(assainirReglagesScans({}).actif, false, 'le classement lui-même reste à activer');
});

test('relais : une seule fenêtre range, le poste serveur le reprend, une fenêtre muette le perd', () => {
  let r = { fenetre: null, locale: false, expire: 0 };
  r = accorderRelais(r, 'fenetre-julie', false, 1000);
  assert.equal(r.fenetre, 'fenetre-julie');
  // Une autre fenêtre d'un poste du bureau attend son tour.
  assert.equal(accorderRelais(r, 'fenetre-jeremy', false, 2000).fenetre, 'fenetre-julie');
  // La fenêtre du poste serveur le reprend aussitôt, et le garde.
  r = accorderRelais(r, 'fenetre-serveur', true, 3000);
  assert.equal(r.fenetre, 'fenetre-serveur');
  assert.equal(accorderRelais(r, 'fenetre-julie', false, 4000).fenetre, 'fenetre-serveur');
  // Sans nouvelle du poste serveur pendant la durée du relais, une autre fenêtre prend la suite.
  assert.equal(accorderRelais(r, 'fenetre-julie', false, 3000 + DUREE_RELAIS_MS + 1).fenetre, 'fenetre-julie');
});

test('route relais : refusé tant que le classement ou le mode automatique est coupé', async () => {
  await envoyer('PUT', '/api/scans/reglages', { actif: true, auto: false });
  let r = await (await envoyer('POST', '/api/scans/relais', { fenetre: 'fenetre-essai-1' })).json();
  assert.equal(r.accorde, false);
  await envoyer('PUT', '/api/scans/reglages', { auto: true });
  r = await (await envoyer('POST', '/api/scans/relais', { fenetre: 'fenetre-essai-1' })).json();
  assert.equal(r.accorde, true);
  assert.equal((await envoyer('POST', '/api/scans/relais', { fenetre: '../x' })).status, 400);
});

test('dossier du copieur : partage « Scan » du même NAS, à côté du partage des dossiers clients', () => {
  // Chez l'étude : \\192.168.60.5\Scan alors que les dossiers sont sous \\192.168.60.5\Commun.
  const c = partagesScansCandidats('\\\\192.168.60.5\\Commun\\DOSSIERS CLIENTS');
  assert.equal(c[0], '\\\\192.168.60.5\\Scan');
  assert.equal(partagesScansCandidats('C:\\Dossiers').length, 0);
  assert.equal(partagesScansCandidats('').length, 0);
});

test('nouveaux scans : heure exacte d’activation, ou minuit d’une date choisie', () => {
  assert.equal(depuisMsScans('2026-09-30T11:40:00.000Z'), Date.parse('2026-09-30T11:40:00.000Z'));
  assert.equal(depuisMsScans('2026-09-01'), Date.parse('2026-09-01T00:00:00'));
  assert.ok(Number.isNaN(depuisMsScans(null)));
});

test('activation : les scans déjà présents ne sont pas pris, seuls ceux qui arrivent ensuite', async () => {
  const base2 = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-scans-nouveaux-'));
  const nas2 = path.join(base2, 'DOSSIERS'), scan2 = path.join(base2, 'Scan');
  fs.mkdirSync(nas2, { recursive: true });
  fs.mkdirSync(scan2, { recursive: true });
  const avant = new Date(Date.now() - 60 * 1000);
  fs.writeFileSync(path.join(scan2, 'DEJA_LA.pdf'), '%PDF-1.4 déjà là ce matin');
  fs.utimesSync(path.join(scan2, 'DEJA_LA.pdf'), avant, avant);
  const db2 = ouvrirDb(':memory:');
  const { app } = creerApp({ db: db2, config: { motDePasse: '', authActive: false, racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', nasRacine: nas2 } });
  const srv2 = app.listen(0);
  await new Promise((r) => srv2.once('listening', r));
  const u = (c) => `http://127.0.0.1:${srv2.address().port}${c}`;
  try {
    const reg = await (await fetch(u('/api/scans/reglages'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: true }) })).json();
    assert.ok(reg.reglages.depuis.length > 10, 'heure exacte retenue : ' + reg.reglages.depuis);
    let etat = await (await fetch(u('/api/scans'))).json();
    assert.equal(etat.scans.length, 0, 'le scan déjà présent n’est pas pris');
    const apres = new Date(Date.now() + 5000);
    fs.writeFileSync(path.join(scan2, 'NOUVEAU.pdf'), '%PDF-1.4 nouveau');
    fs.utimesSync(path.join(scan2, 'NOUVEAU.pdf'), apres, apres);
    etat = await (await fetch(u('/api/scans'))).json();
    assert.equal(etat.scans.map((s) => s.nom).join(','), 'NOUVEAU.pdf');
  } finally {
    srv2.close();
    db2.close();
    fs.rmSync(base2, { recursive: true, force: true });
  }
});

test('trouverDossierScans : racine d’un partage Windows acceptée avec la barre finale, dernier dossier retenu', async () => {
  const vus = [];
  const fauxFs = {
    stat: async (c) => { vus.push(c); if (c === '\\\\192.168.60.5\\Scan\\') return { isDirectory: () => true }; throw new Error('ENOENT'); },
    readdir: async () => { throw new Error('ENOENT'); }
  };
  const config = { nasRacine: '\\\\192.168.60.5\\Clients\\DOSSIERS' };
  assert.equal(await trouverDossierScans(config, fauxFs), '\\\\192.168.60.5\\Scan');
  // Second appel : le dossier retenu est essayé d'abord, sans reparcourir les autres candidats.
  vus.length = 0;
  assert.equal(await trouverDossierScans(config, fauxFs), '\\\\192.168.60.5\\Scan');
  assert.deepEqual(vus, ['\\\\192.168.60.5\\Scan', '\\\\192.168.60.5\\Scan\\']);
  // Partage devenu injoignable : plus rien de retenu.
  const vide = { stat: async () => { throw new Error('ENOENT'); }, readdir: async () => { throw new Error('ENOENT'); } };
  assert.equal(await trouverDossierScans(config, vide), null);
});

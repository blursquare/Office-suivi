// Pièces jointes gardées sur le serveur (étude 25/10) : sorte lue dans le contenu, identifiant aléatoire, 25 Mo, 90 jours, suppression.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { detecterSorte, idValide, creerStockPiecesJointes, MAX_OCTETS, JOURS_CONSERVATION } = require('../src/piecesJointes');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const depot = () => { const m = new Map(); return { lireJsonBrut: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), ecrireJsonBrut: (k, v) => m.set(k, JSON.stringify(v)) }; };

test('sorte : reconnue par le contenu, jamais par ce que le poste déclare', () => {
  assert.equal(detecterSorte(PDF).sorte, 'pdf');
  assert.equal(detecterSorte(PNG).mime, 'image/png');
  assert.equal(detecterSorte(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])).mime, 'image/jpeg');
  assert.equal(detecterSorte(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null, 'un SVG n’est pas gardé');
  assert.equal(detecterSorte(Buffer.from('MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0004\u0000\u0000\u0000ÿÿ')), null, 'un exécutable non plus');
  assert.equal(detecterSorte(Buffer.alloc(4)), null);
});

test('identifiant : 32 caractères hexadécimaux seulement (aucun chemin possible)', () => {
  assert.equal(idValide('a'.repeat(32)), true);
  assert.equal(idValide('../../etc/passwd'), false);
  assert.equal(idValide('A'.repeat(32)), false);
  assert.equal(idValide(''), false);
});

test('stock : enregistrer, relire, supprimer ; le nom d’origine n’est qu’une étiquette', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-'));
  const stock = creerStockPiecesJointes({ dossier, parametresRepo: depot() });
  const r = await stock.enregistrer(PDF, '../../Compromis MARTIN.pdf', 'Julie VASSELIN', 1000);
  assert.equal(r.ok, true);
  assert.deepEqual(fs.readdirSync(dossier), [r.id], 'un fichier nommé par son identifiant, pas par son nom');
  assert.equal(stock.meta(r.id).sorte, 'pdf');
  assert.equal(fs.readFileSync(stock.cheminFichier(r.id)).equals(PDF), true);
  assert.equal((await stock.enregistrer(Buffer.from('rien'), 'x', 'Julie VASSELIN')).ok, false);
  assert.equal((await stock.enregistrer(Buffer.alloc(MAX_OCTETS + 1, 0x25), 'x', 'Julie VASSELIN')).ok, false);
  assert.equal(await stock.supprimer(r.id), true);
  assert.equal(stock.cheminFichier(r.id), '');
  assert.equal(fs.readdirSync(dossier).length, 0);
});

test('stock : 90 jours puis supprimé, un fichier orphelin du dossier aussi', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-'));
  const stock = creerStockPiecesJointes({ dossier, parametresRepo: depot() });
  const vieux = await stock.enregistrer(PDF, 'vieux.pdf', 'Julie VASSELIN', 1000);
  const jeune = await stock.enregistrer(PNG, 'jeune.png', 'Julie VASSELIN', 1000 + 80 * 86400000);
  fs.writeFileSync(path.join(dossier, 'b'.repeat(32)), 'orphelin');
  const retires = await stock.purger(1000 + (JOURS_CONSERVATION + 1) * 86400000);
  assert.equal(retires, 2);
  assert.equal(stock.meta(vieux.id), null);
  assert.ok(stock.meta(jeune.id));
  assert.deepEqual(fs.readdirSync(dossier), [jeune.id]);
});

test('routes : dépôt, lecture avec ses en-têtes de sécurité, suppression par son auteur seulement', async () => {
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { authActive: false, estSea: () => false, racineRepo: process.cwd() + '/..', dossierPiecesJointes: fs.mkdtempSync(path.join(os.tmpdir(), 'pj-')) } });
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const B = 'http://127.0.0.1:' + srv.address().port;
  try {
    const poster = (corps, auteur, nom) => fetch(B + '/api/pieces-jointes', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Auteur': encodeURIComponent(auteur), 'X-Nom': encodeURIComponent(nom) }, body: corps });
    assert.equal((await poster(PDF, 'Quelqu’un', 'a.pdf')).status, 400, 'collaborateur inconnu');
    assert.equal((await poster(Buffer.from('texte quelconque trop court?'), 'Julie VASSELIN', 'a.txt')).status, 400, 'ni PDF ni image');
    const ok = await poster(PDF, 'Julie VASSELIN', 'Compromis MARTIN.pdf');
    assert.equal(ok.status, 200);
    const { id } = await ok.json();
    const lu = await fetch(B + `/api/pieces-jointes/${id}/fichier`);
    assert.equal(lu.status, 200);
    assert.equal(lu.headers.get('content-type'), 'application/pdf');
    assert.equal(lu.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(Buffer.from(await lu.arrayBuffer()).equals(PDF), true);
    assert.equal((await fetch(B + '/api/pieces-jointes/' + 'c'.repeat(32) + '/fichier')).status, 404);
    assert.equal((await fetch(B + '/api/pieces-jointes/..%2F..%2Fx/fichier')).status, 404);
    assert.equal((await fetch(B + `/api/pieces-jointes/${id}?auteur=x`, { method: 'DELETE' })).status, 404, 'sans auteur connu');
    assert.equal((await fetch(B + `/api/pieces-jointes/${id}?auteur=${encodeURIComponent('Jérémy SAUJOT')}`, { method: 'DELETE' })).status, 403, 'pas le sien');
    assert.equal((await fetch(B + `/api/pieces-jointes/${id}?auteur=${encodeURIComponent('Bastien ANGLUMENT')}`, { method: 'DELETE' })).status, 200, 'l’administrateur peut');
    assert.equal((await fetch(B + `/api/pieces-jointes/${id}`)).status, 404);
  } finally { srv.close(); }
});

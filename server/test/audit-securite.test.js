'use strict';

// Correctifs « Haut » de l'audit complet du 13/10 : pièce jointe servie sans interprétation, dossier de sauvegarde confiné,
// base à restaurer contrôlée.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('pièce jointe : seuls PDF, images matricielles et texte brut s’affichent ; HTML, SVG, JS se téléchargent', () => {
  const { typePieceJointeAffichable } = require('../src/routes/emailsDossiers');
  assert.equal(typePieceJointeAffichable('application/pdf', 'a.pdf'), 'application/pdf');
  assert.equal(typePieceJointeAffichable('application/octet-stream', 'Compromis.PDF'), 'application/pdf');
  assert.equal(typePieceJointeAffichable('image/jpg', 'photo.jpg'), 'image/jpeg');
  assert.equal(typePieceJointeAffichable('text/plain; charset=iso-8859-1', 'a.txt'), 'text/plain; charset=utf-8');
  for (const [type, nom] of [['text/html', 'a.html'], ['image/svg+xml', 'a.svg'], ['application/javascript', 'a.js'], ['application/octet-stream', 'a.html'], ['', 'facture.htm']]) {
    assert.equal(typePieceJointeAffichable(type, nom), '', `${type} ${nom}`);
  }
});

test('sauvegarde : disque du serveur ou serveur du NAS (ou celui déjà réglé), jamais une autre machine', () => {
  const { dossierSauvegardeAutorise, hoteReseau } = require('../src/routes/sauvegarde');
  const config = { nasRacine: '\\\\192.168.60.5\\Commun', nasScans: '' };
  assert.equal(hoteReseau('\\\\NAS\\Partage\\x'), 'nas');
  assert.equal(dossierSauvegardeAutorise('D:\\Sauvegardes', config), true);
  assert.equal(dossierSauvegardeAutorise('\\\\192.168.60.5\\Sauvegardes', config), true);
  assert.equal(dossierSauvegardeAutorise('\\\\10.0.0.66\\depot', config), false);
  assert.equal(dossierSauvegardeAutorise('//10.0.0.66/depot', config), false);
  // NAS monté en lettre de lecteur : le partage déjà réglé par l'étude reste accepté.
  assert.equal(dossierSauvegardeAutorise('\\\\SRV-BACKUP\\CLAIRE\\2026', { nasRacine: 'Z:\\Commun' }, '\\\\srv-backup\\CLAIRE'), true);
});

test('restauration : une base SQLite qui n’est pas celle de CLAIRE est refusée', () => {
  const { schemaClaire } = require('../src/routes/sauvegarde');
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-restau-'));
  try {
    const autre = path.join(dir, 'autre.db');
    const b1 = new DatabaseSync(autre); b1.exec('CREATE TABLE t (x)'); b1.close();
    assert.equal(schemaClaire(autre), false);
    const { ouvrirDb } = require('../src/db');
    const vraie = path.join(dir, 'claire.db');
    const b2 = ouvrirDb(vraie); b2.close();
    assert.equal(schemaClaire(vraie), true);
    assert.equal(schemaClaire(path.join(dir, 'absente.db')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fichier illisible au moment de la lecture : 404, jamais une requête suspendue (audit 13/10)', async () => {
  const express = require('express');
  const { envoyerFlux } = require('../src/routes/nas');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-flux-'));
  fs.mkdirSync(path.join(dir, 'x.pdf')); // un DOSSIER nommé comme un PDF
  const app = express();
  app.get('/f', (req, res) => { res.setHeader('Content-Type', 'application/pdf'); envoyerFlux(res, path.join(dir, 'x.pdf')); });
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/f`, { signal: AbortSignal.timeout(3000) });
    assert.equal(r.status, 404);
  } finally { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

'use strict';
// Dossier « Fausses minutes » (étude, 03/10) : trouvé à côté des dossiers clients, listé, fichier confiné.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fm = require('../src/faussesMinutes');

function arbo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-fm-'));
  const commun = path.join(base, 'Commun');
  fs.mkdirSync(path.join(commun, 'MARTEL Paul'), { recursive: true });
  const fausses = path.join(base, 'FAUSSES MINUTES');
  fs.mkdirSync(path.join(fausses, '2026'), { recursive: true });
  fs.writeFileSync(path.join(fausses, '2026', 'VTE MARTEL FOURNIER.pdf'), '%PDF-1.4 acte');
  fs.writeFileSync(path.join(fausses, '2026', 'Attestation de vente MARTEL.pdf'), '%PDF-1.4 att');
  fs.writeFileSync(path.join(fausses, 'notes.txt'), 'pas un pdf');
  fs.writeFileSync(path.join(base, 'secret.pdf'), '%PDF hors dossier');
  return { base, commun, fausses };
}

test('trouvé dans un parent de la racine des dossiers clients, insensible à la casse', async () => {
  const { commun, fausses } = arbo();
  assert.equal(await fm.trouverDossierFaussesMinutes({ nasRacine: commun }), fausses);
  assert.equal(await fm.trouverDossierFaussesMinutes({ nasRacine: commun, nasFaussesMinutes: path.join(commun, 'absent') }), null, 'config.json fait foi');
});

test('partages candidats : \\\\serveur\\Fausses minutes à côté du commun', () => {
  assert.ok(fm.partagesFaussesMinutesCandidats('\\\\192.168.60.5\\Commun\\Dossiers').includes('\\\\192.168.60.5\\Fausses minutes'));
  assert.equal(fm.partagesFaussesMinutesCandidats('/srv/commun').length, 0);
});

test('liste : les PDF des sous-dossiers, avec taille et date, rien d’autre', async () => {
  const { fausses } = arbo();
  const l = await fm.listerFaussesMinutes(fausses);
  assert.equal(l.map(f => f.chemin).sort().join('|'), '2026/Attestation de vente MARTEL.pdf|2026/VTE MARTEL FOURNIER.pdf');
  assert.ok(l.every(f => f.taille > 0 && !isNaN(Date.parse(f.modifie))));
});

test('fichier : confiné au dossier, PDF seulement', async () => {
  const { fausses } = arbo();
  assert.ok(await fm.resoudreFichierFaussesMinutes(fausses, '2026/VTE MARTEL FOURNIER.pdf'));
  assert.equal(await fm.resoudreFichierFaussesMinutes(fausses, '../secret.pdf'), null);
  assert.equal(await fm.resoudreFichierFaussesMinutes(fausses, 'notes.txt'), null);
  assert.equal(await fm.resoudreFichierFaussesMinutes(fausses, '2026/absent.pdf'), null);
  assert.equal(await fm.resoudreFichierFaussesMinutes(fausses, ''), null);
});

test('routes : liste puis fichier, jamais hors du dossier', async () => {
  const express = require('express');
  const { creerRouteurNas } = require('../src/routes/nas');
  const { commun } = arbo();
  fm.oublierCacheFaussesMinutes();
  const appli = express();
  appli.use('/api', creerRouteurNas({ nasRacine: commun }));
  const s = appli.listen(0);
  await new Promise(r => s.once('listening', r));
  const b = 'http://127.0.0.1:' + s.address().port;
  try {
    const liste = await fetch(b + '/api/nas/fausses-minutes').then(r => r.json());
    assert.equal(liste.trouve, true);
    assert.equal(liste.nom, 'FAUSSES MINUTES');
    assert.equal(liste.fichiers.length, 2);
    const ok = await fetch(b + '/api/nas/fausses-minutes/fichier?chemin=' + encodeURIComponent('2026/VTE MARTEL FOURNIER.pdf'));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'application/pdf');
    assert.equal(await ok.text(), '%PDF-1.4 acte');
    const ko = await fetch(b + '/api/nas/fausses-minutes/fichier?chemin=' + encodeURIComponent('../secret.pdf'));
    assert.equal(ko.status, 400);
  } finally {
    s.close();
  }
});

'use strict';
// Réponses du FCDDV à la racine du commun (étude 22/10) : dossier « FCDDV » + sous-dossier « INTERROGATION », lecture seule, confinée.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fc = require('../src/fcddvCommun');

function arbo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-fcddv-'));
  const commun = path.join(base, 'Commun');
  fs.mkdirSync(path.join(commun, 'MARTEL Paul'), { recursive: true });
  const fcddv = path.join(base, 'FCDDV');
  fs.mkdirSync(path.join(fcddv, 'Interrogation', '2026'), { recursive: true });
  fs.mkdirSync(path.join(fcddv, 'AUTRE'), { recursive: true });
  fs.writeFileSync(path.join(fcddv, 'FCDDV DURAND Marie.pdf'), '%PDF-1.4 racine');
  fs.writeFileSync(path.join(fcddv, 'Interrogation', 'FCDDV MARTIN Paul.pdf'), '%PDF-1.4 interro');
  fs.writeFileSync(path.join(fcddv, 'Interrogation', '2026', 'Réponse BERNARD Léa.pdf'), '%PDF-1.4 profond');
  fs.writeFileSync(path.join(fcddv, 'AUTRE', 'Jamais lu LEROY.pdf'), '%PDF-1.4 autre dossier');
  fs.writeFileSync(path.join(fcddv, 'notes.txt'), 'pas un pdf');
  fs.writeFileSync(path.join(base, 'secret.pdf'), '%PDF hors dossier');
  return { base, commun, fcddv };
}

test('dossier FCDDV trouvé à côté des dossiers clients, config.json fait foi', async () => {
  const { commun, fcddv } = arbo();
  assert.equal(await fc.trouverDossierFcddv({ nasRacine: commun }), fcddv);
  assert.equal(await fc.trouverDossierFcddv({ nasRacine: commun, nasFcddv: path.join(commun, 'absent') }), null);
  assert.ok(fc.partagesFcddvCandidats('\\\\192.168.60.5\\Commun\\Dossiers').includes('\\\\192.168.60.5\\FCDDV'));
});

test('liste : les PDF de la racine du FCDDV et de INTERROGATION seulement, pas les autres sous-dossiers', async () => {
  const { fcddv } = arbo();
  const l = await fc.listerFcddv(fcddv);
  assert.equal(l.map(f => f.chemin).sort().join('|'), 'FCDDV DURAND Marie.pdf|Interrogation/2026/Réponse BERNARD Léa.pdf|Interrogation/FCDDV MARTIN Paul.pdf');
  assert.equal(l.find(f => f.nom.includes('MARTIN')).interrogation, true);
  assert.equal(l.find(f => f.nom.includes('DURAND')).interrogation, false);
});

test('fichier : confiné au dossier FCDDV, PDF seulement', async () => {
  const { fcddv } = arbo();
  assert.ok(await fc.resoudreFichierFcddv(fcddv, 'Interrogation/FCDDV MARTIN Paul.pdf'));
  assert.equal(await fc.resoudreFichierFcddv(fcddv, '../secret.pdf'), null);
  assert.equal(await fc.resoudreFichierFcddv(fcddv, 'notes.txt'), null);
});

test('routes : liste puis fichier, jamais hors du dossier', async () => {
  const express = require('express');
  const { creerRouteurNas } = require('../src/routes/nas');
  const { commun } = arbo();
  fc.oublierCacheFcddv();
  const appli = express();
  appli.use('/api', creerRouteurNas({ nasRacine: commun }));
  const s = appli.listen(0);
  await new Promise(r => s.once('listening', r));
  const b = 'http://127.0.0.1:' + s.address().port;
  try {
    const liste = await fetch(b + '/api/nas/fcddv').then(r => r.json());
    assert.equal(liste.trouve, true);
    assert.equal(liste.fichiers.length, 3);
    const ok = await fetch(b + '/api/nas/fcddv/fichier?chemin=' + encodeURIComponent('Interrogation/FCDDV MARTIN Paul.pdf'));
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '%PDF-1.4 interro');
    const ko = await fetch(b + '/api/nas/fcddv/fichier?chemin=' + encodeURIComponent('../secret.pdf'));
    assert.equal(ko.status, 400);
  } finally {
    s.close();
  }
});

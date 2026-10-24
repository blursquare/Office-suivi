'use strict';

// Photos de profil des collaborateurs (src/routes/photosCollaborateurs.js) : liste fermée de noms, JPEG seulement, 150 Ko au plus.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ouvrirDb } = require('../src/db');
const { creerRepoParametres } = require('../src/parametresRepo');
const { creerRouteurPhotosCollaborateurs, assainirPhotos, photosPubliques } = require('../src/routes/photosCollaborateurs');

const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////';

test('pur : seuls les collaborateurs connus et les JPEG plausibles sont gardés', () => {
  const p = assainirPhotos({
    'Julie VASSELIN': { base64: JPEG, modifieLe: '2026-10-24' },
    'Inconnu X': { base64: JPEG },
    'Bastien ANGLUMENT': { base64: 'iVBORw0KGgo=' },
    'Jérémy SAUJOT': { base64: JPEG + '<script>' }
  });
  assert.deepEqual(Object.keys(p), ['Julie VASSELIN']);
  assert.equal(photosPubliques(p)['Julie VASSELIN'], 'data:image/jpeg;base64,' + JPEG);
  assert.deepEqual(assainirPhotos(null), {});
});

test('routes : ajouter, lire, refuser, retirer', async () => {
  const db = ouvrirDb(':memory:');
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', creerRouteurPhotosCollaborateurs(creerRepoParametres(db)));
  const serveur = app.listen(0);
  const base = `http://127.0.0.1:${serveur.address().port}/api/photos-collaborateurs`;
  const envoyer = (nom, corps, method = 'PUT') => fetch(`${base}/${encodeURIComponent(nom)}`, { method, headers: { 'Content-Type': 'application/json' }, body: corps && JSON.stringify(corps) });
  try {
    assert.deepEqual(await (await fetch(base)).json(), {});
    assert.equal((await envoyer('Inconnu X', { base64: JPEG })).status, 404);
    assert.equal((await envoyer('Julie VASSELIN', { base64: 'AAAA' })).status, 400, 'pas un JPEG');
    assert.equal((await envoyer('Julie VASSELIN', { base64: '/9j/' + 'A'.repeat(210 * 1024) })).status, 400, 'trop lourde');
    const ok = await envoyer('Julie VASSELIN', { base64: JPEG });
    assert.equal(ok.status, 200);
    assert.ok((await (await fetch(base)).json())['Julie VASSELIN'].startsWith('data:image/jpeg;base64,/9j/'));
    const apres = await (await envoyer('Julie VASSELIN', null, 'DELETE')).json();
    assert.deepEqual(apres, {});
  } finally { serveur.close(); db.close(); }
});

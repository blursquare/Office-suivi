'use strict';

// Clichés aériens de l'IGN lus par morceaux dans le fichier officiel (server/src/clichesIgn.js, étude 31/10).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/clichesIgn');

// Un petit TIFF « classique » à carrés JPEG : 1 024 × 512, deux carrés de 512, tables JPEG à part.
function tiffEssai() {
  const tables = Buffer.from([0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x03, 0x01, 0xFF, 0xD9]);
  const carres = [Buffer.from([0xFF, 0xD8, 0xAA, 0xBB, 0xFF, 0xD9]), Buffer.from([0xFF, 0xD8, 0xCC, 0xFF, 0xD9])];
  const entrees = 7;
  const debutIfd = 8;
  const finIfd = debutIfd + 2 + entrees * 12 + 4;
  const decTables = finIfd; const decOffs = decTables + tables.length; const decCompte = decOffs + 8; const decCarre0 = decCompte + 8; const decCarre1 = decCarre0 + carres[0].length;
  const b = Buffer.alloc(decCarre1 + carres[1].length);
  b.write('II', 0, 'latin1'); b.writeUInt16LE(42, 2); b.writeUInt32LE(debutIfd, 4);
  b.writeUInt16LE(entrees, debutIfd);
  const tags = [[256, 3, 1, 1024], [257, 3, 1, 512], [259, 3, 1, 7], [322, 3, 1, 512], [324, 4, 2, decOffs], [325, 4, 2, decCompte], [347, 7, tables.length, decTables]];
  tags.forEach(([tag, type, compte, valeur], i) => {
    const e = debutIfd + 2 + i * 12;
    b.writeUInt16LE(tag, e); b.writeUInt16LE(type, e + 2); b.writeUInt32LE(compte, e + 4);
    if (type === 3 && compte === 1) b.writeUInt16LE(valeur, e + 8); else b.writeUInt32LE(valeur, e + 8);
  });
  b.writeUInt32LE(0, debutIfd + 2 + entrees * 12);
  tables.copy(b, decTables);
  b.writeUInt32LE(decCarre0, decOffs); b.writeUInt32LE(decCarre1, decOffs + 4);
  b.writeUInt32LE(carres[0].length, decCompte); b.writeUInt32LE(carres[1].length, decCompte + 4);
  carres[0].copy(b, decCarre0); carres[1].copy(b, decCarre1);
  return b;
}

function fauxFetch(fichier, appels) {
  return async (url, o) => {
    appels.push({ url, plage: o && o.headers && o.headers.Range });
    const m = /bytes=(\d+)-(\d+)/.exec(o.headers.Range);
    const morceau = fichier.subarray(Number(m[1]), Number(m[2]) + 1);
    return { status: 206, arrayBuffer: async () => morceau.buffer.slice(morceau.byteOffset, morceau.byteOffset + morceau.length) };
  };
}

test('adresse officielle d’un cliché : seulement un identifiant sûr', () => {
  assert.equal(C.urlCliche('P14000292', 'IGNF_PVA_1-0__2014-09-26__CP14000292_14FRCEND35x00012_01039'), 'https://data.geopf.fr/telechargement/download/pva/P14000292/IGNF_PVA_1-0__2014-09-26__CP14000292_14FRCEND35x00012_01039.tif');
  assert.equal(C.urlCliche('../x', 'IGNF_PVA_1-0__2014'), '');
  assert.equal(C.urlCliche('P14000292', 'IGNF_PVA_../../etc/passwd'), '');
});

test('en-tête et carrés : lus par plages, rendus en JPEG complet', async () => {
  C.viderCacheCliches();
  const appels = [];
  const injections = { fetch: fauxFetch(tiffEssai(), appels) };
  const lot = 'P11000132'; const id = 'IGNF_PVA_1-0__2011-09-30__CP11000132_FD41x00023_01834';
  const e = await C.enteteCliche(lot, id, injections);
  assert.equal(e.largeur, 1024);
  assert.equal(e.niveaux.length, 1);
  const r = await C.carreCliche(lot, id, 0, 1, 0, injections);
  assert.deepEqual([...r.jpeg], [0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x03, 0x01, 0xCC, 0xFF, 0xD9], 'tables sans leur fin + données sans leur début');
  assert.ok(appels.every(a => a.url.startsWith('https://data.geopf.fr/telechargement/download/pva/') && /^bytes=\d+-\d+$/.test(a.plage)));
  assert.deepEqual(await C.carreCliche(lot, id, 0, 2, 0, injections), { erreur: 'Hors du cliché.' });
  assert.deepEqual(await C.carreCliche(lot, id, 3, 0, 0, injections), { erreur: 'Niveau inconnu.' });
  assert.deepEqual(await C.enteteCliche('x', id, injections), { erreur: 'Cliché inconnu.' });
});

test('TIFF : refus d’un fichier qui n’en est pas un', () => {
  assert.throws(() => C.lireIfds(Buffer.from('PK....')), /non TIFF/);
});

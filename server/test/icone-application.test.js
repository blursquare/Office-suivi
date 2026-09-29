'use strict';
// Remplacement de l'icône de l'application CLAIRE installée (voir src/iconeApplication.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { lireEntreesIco, idsApplicationClaire, rafraichirIconesApplication } = require('../src/iconeApplication');
const { idApplicationWeb } = require('../src/navigateurApp');

// Faux PNG (signature seule) et .ico à deux entrées, 32 et 256 px.
const png = (octet) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8, octet)]);
function ico(entrees) {
  const tete = Buffer.alloc(6 + 16 * entrees.length);
  tete.writeUInt16LE(1, 2); tete.writeUInt16LE(entrees.length, 4);
  let offset = tete.length;
  entrees.forEach(([taille, buf], i) => {
    const e = 6 + 16 * i;
    tete.writeUInt8(taille >= 256 ? 0 : taille, e); tete.writeUInt8(taille >= 256 ? 0 : taille, e + 1);
    tete.writeUInt32LE(buf.length, e + 8); tete.writeUInt32LE(offset, e + 12); offset += buf.length;
  });
  return Buffer.concat([tete, ...entrees.map((x) => x[1])]);
}
const ICO = ico([[32, png(1)], [256, png(2)]]);

function fauxFs(fichiers) {
  const dossiers = new Map();
  for (const f of Object.keys(fichiers)) {
    let d = path.win32.dirname(f), nom = path.win32.basename(f);
    for (;;) {
      if (!dossiers.has(d)) dossiers.set(d, new Set());
      dossiers.get(d).add(nom);
      const parent = path.win32.dirname(d);
      if (parent === d) break;
      nom = path.win32.basename(d); d = parent;
    }
  }
  return {
    fichiers,
    async readdir(d) { if (!dossiers.has(d)) throw new Error('ENOENT'); return Array.from(dossiers.get(d)); },
    async readFile(f) { if (!(f in fichiers)) throw new Error('ENOENT'); return fichiers[f]; },
    async writeFile(f, c) { fichiers[f] = Buffer.from(c); }
  };
}

test('lireEntreesIco : tailles et PNG de chaque entrée', () => {
  assert.deepEqual(lireEntreesIco(ICO).map((e) => e.taille), [32, 256]);
  assert.equal(lireEntreesIco(Buffer.from('pas un ico')).length, 0);
});

test('rafraichirIconesApplication : remplace les icônes de CLAIRE seulement, une seule fois', async () => {
  const env = { LocalAppData: 'C:\\Users\\etude\\AppData\\Local' };
  const id = idApplicationWeb('http://localhost:3000/index.html');
  const autre = idApplicationWeb('http://exemple.fr/');
  const base = 'C:\\Users\\etude\\AppData\\Local\\Google\\Chrome\\User Data\\ClaireServeur\\Web Applications\\';
  const fsp = fauxFs({
    [base + `_crx_${id}\\CLAIRE.ico`]: Buffer.from('ancienne'),
    [base + `Manifest Resources\\${id}\\Icons\\32.png`]: Buffer.from('ancienne'),
    [base + `Manifest Resources\\${id}\\Icons\\512.png`]: Buffer.from('ancienne'),
    [base + `_crx_${autre}\\Autre.ico`]: Buffer.from('autre application')
  });
  const remplaces = await rafraichirIconesApplication({ env, fsp, icoBuffer: ICO, port: 3000, adresses: ['192.168.60.10'] });
  assert.equal(remplaces.length, 2);
  assert.equal(Buffer.compare(fsp.fichiers[base + `_crx_${id}\\CLAIRE.ico`], ICO), 0);
  assert.equal(Buffer.compare(fsp.fichiers[base + `Manifest Resources\\${id}\\Icons\\32.png`], png(1)), 0);
  // Taille absente du .ico : laissée telle quelle ; autre application : jamais touchée.
  assert.equal(fsp.fichiers[base + `Manifest Resources\\${id}\\Icons\\512.png`].toString(), 'ancienne');
  assert.equal(fsp.fichiers[base + `_crx_${autre}\\Autre.ico`].toString(), 'autre application');
  // Deuxième démarrage : rien à réécrire.
  assert.equal((await rafraichirIconesApplication({ env, fsp, icoBuffer: ICO, port: 3000, adresses: [] })).length, 0);
});

test('idsApplicationClaire : localhost, 127.0.0.1 et adresses du réseau, avec /index.html et /', () => {
  const ids = idsApplicationClaire(3000, ['192.168.60.10']);
  assert.equal(ids.length, 6);
  assert.ok(ids.includes(idApplicationWeb('http://192.168.60.10:3000/index.html')));
});

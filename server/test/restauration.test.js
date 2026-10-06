'use strict';

// Restauration d'une sauvegarde et base abîmée au démarrage (voir src/restauration.js). Vrais fichiers SQLite dans un
// dossier temporaire, dont le cas du bureau (06/10) : sauvegarde copiée à la place de claire.db en laissant le journal
// (claire.db-wal) de l'ancienne base → « database disk image is malformed » au démarrage.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { ouvrirDb } = require('../src/db');
const R = require('../src/restauration');

const MAINTENANT = new Date(2026, 9, 6, 10, 12);

function dossierTemp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'claire-restauration-')); }

// Une base de CLAIRE avec `n` dossiers ; `garderOuverte` : rend la connexion sans la fermer (le WAL reste à côté).
function base(chemin, n, garderOuverte) {
  const db = ouvrirDb(chemin);
  const ins = db.prepare('INSERT INTO dossiers (id, data, updated_at) VALUES (?, ?, ?)');
  for (let i = 0; i < n; i++) ins.run(`d${i}`, JSON.stringify({ id: `d${i}`, nom: `DOSSIER ${i}`, texte: 'x'.repeat(3000) }), i + 1);
  db.prepare("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES ('essai', ?)").run(JSON.stringify({ n }));
  if (garderOuverte) return db;
  db.close();
  return null;
}
const compter = (db) => db.prepare('SELECT COUNT(*) AS n FROM dossiers').get().n;

test('rien à restaurer : rien ne bouge', () => {
  const dir = dossierTemp();
  const chemin = path.join(dir, 'claire.db');
  base(chemin, 2);
  assert.deepEqual(R.appliquerRestaurationEnAttente(chemin, MAINTENANT), { fait: false });
  assert.equal(R.appliquerRestaurationEnAttente(':memory:').fait, false);
});

test('sauvegarde déposée : mise à la place de la base, ancienne base gardée AVEC son journal, sauvegarde lisible', () => {
  const dir = dossierTemp();
  const chemin = path.join(dir, 'claire.db');
  const ouverte = base(chemin, 5, true); // l'ancienne base, arrêtée « brutalement » : son journal reste à côté
  const sauvegarde = path.join(dir, 'sauvegardes-claire-2026-10-05.db');
  ouverte.exec(`VACUUM INTO '${sauvegarde.replace(/'/g, "''")}'`);
  ouverte.prepare('DELETE FROM dossiers WHERE id = ?').run('d0'); // écrit dans le WAL après la sauvegarde
  fs.copyFileSync(chemin, chemin + '.copie'); fs.copyFileSync(chemin + '-wal', chemin + '-wal.copie');
  ouverte.close();
  // Serveur arrêté sans repli du journal : on remet la paire base + journal telle qu'elle était.
  fs.renameSync(chemin + '.copie', chemin); fs.renameSync(chemin + '-wal.copie', chemin + '-wal');
  fs.copyFileSync(sauvegarde, path.join(dir, R.NOM_RESTAURATION));

  const r = R.appliquerRestaurationEnAttente(chemin, MAINTENANT);
  assert.equal(r.fait, true);
  assert.equal(r.ancienne, 'claire-avant-restauration-2026-10-06-10h12.db');
  assert.ok(!fs.existsSync(chemin + '-wal'), 'le journal de l’ancienne base ne reste jamais à côté de la sauvegarde');
  assert.ok(fs.existsSync(path.join(dir, r.ancienne + '-wal')), 'il suit l’ancienne base');
  assert.ok(!fs.existsSync(path.join(dir, R.NOM_RESTAURATION)));
  const { db, reparee } = R.ouvrirDbVerifiee(chemin, ouvrirDb, MAINTENANT);
  assert.equal(reparee, null);
  assert.equal(compter(db), 5, 'la sauvegarde, pas l’ancienne base');
  db.close();
  // L'ancienne base et son journal, ensemble, restent lisibles (rien de perdu).
  const ancienne = new DatabaseSync(path.join(dir, r.ancienne));
  assert.equal(compter(ancienne), 4);
  ancienne.close();
});

test('sauvegarde déposée illisible : écartée, base actuelle gardée', () => {
  const dir = dossierTemp();
  const chemin = path.join(dir, 'claire.db');
  base(chemin, 3);
  fs.writeFileSync(path.join(dir, R.NOM_RESTAURATION), Buffer.alloc(8192, 7));
  const r = R.appliquerRestaurationEnAttente(chemin, MAINTENANT);
  assert.equal(r.fait, false);
  assert.equal(r.refusee, true);
  assert.match(r.ecartee, /^claire-restauration-refusee-2026-10-06-10h12\.db$/);
  const db = ouvrirDb(chemin);
  assert.equal(compter(db), 3);
  db.close();
});

test('cas du bureau : sauvegarde copiée à la main en laissant le journal de l’ancienne base → rouverte sans ce journal', () => {
  const dir = dossierTemp();
  const chemin = path.join(dir, 'claire.db');
  const sauvegarde = path.join(dir, 'claire-2026-10-05.db');
  // L'ancienne base a beaucoup grossi puis maigri : la sauvegarde (VACUUM) n'a plus du tout la même disposition des pages.
  const ouverte = base(chemin, 400, true);
  ouverte.exec('PRAGMA wal_autocheckpoint = 0');
  ouverte.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  ouverte.exec("DELETE FROM dossiers WHERE id >= 'd40'"); // ordre des chaînes : en garde 335, éparpillés
  ouverte.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  ouverte.exec(`VACUUM INTO '${sauvegarde.replace(/'/g, "''")}'`);
  // Puis elle écrit dans son journal, jamais reversé (arrêt brutal).
  const maj = ouverte.prepare('UPDATE dossiers SET data = ? WHERE id = ?');
  for (let k = 0; k < 3; k++) for (let i = 0; i < 40; i++) maj.run(String(k).repeat(3500), `d${i}`);
  fs.copyFileSync(chemin + '-wal', path.join(dir, 'journal-ancien'));
  ouverte.close();
  // La procédure d'avant : claire.db renommée, sauvegarde copiée sous claire.db, journal de l'ancienne base laissé là.
  fs.renameSync(chemin, path.join(dir, 'claire-avant-restauration.db'));
  for (const s of ['-wal', '-shm']) fs.rmSync(chemin + s, { force: true });
  fs.copyFileSync(sauvegarde, chemin);
  fs.copyFileSync(path.join(dir, 'journal-ancien'), chemin + '-wal');

  const { db, reparee } = R.ouvrirDbVerifiee(chemin, ouvrirDb, MAINTENANT);
  try {
    assert.ok(reparee, 'le journal étranger est repéré');
    assert.match(reparee.copie, /^claire-abimee-2026-10-06-10h12\.db$/);
    assert.ok(fs.existsSync(path.join(dir, reparee.copie + '-wal')), 'copie gardée avec ce journal');
    assert.equal(compter(db), 335, 'la sauvegarde, intacte');
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { db.close(); }
});

test('base illisible sans journal : erreur claire qui dit comment restaurer', () => {
  const dir = dossierTemp();
  const chemin = path.join(dir, 'claire.db');
  fs.writeFileSync(chemin, Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(4096, 3)]));
  assert.throws(() => R.ouvrirDbVerifiee(chemin, ouvrirDb, MAINTENANT), /illisible.*claire-restauration\.db/s);
});

test('base saine avec son propre journal : ouverte telle quelle, journal gardé', () => {
  const dir = dossierTemp();
  const chemin = path.join(dir, 'claire.db');
  const ouverte = base(chemin, 6, true);
  fs.copyFileSync(chemin, chemin + '.c'); fs.copyFileSync(chemin + '-wal', chemin + '-wal.c');
  ouverte.close();
  fs.renameSync(chemin + '.c', chemin); fs.renameSync(chemin + '-wal.c', chemin + '-wal');
  const { db, reparee } = R.ouvrirDbVerifiee(chemin, ouvrirDb, MAINTENANT);
  assert.equal(reparee, null);
  assert.equal(compter(db), 6);
  db.close();
});

test('route : sauvegardes listées, « Restaurer » dépose une copie vérifiée sous claire-restauration.db (redémarrage par l’exécutable seulement)', async () => {
  const { creerApp } = require('../src/app');
  const dir = dossierTemp();
  const chemin = path.join(dir, 'claire.db');
  const dossierSauvegardes = path.join(dir, 'sauvegardes');
  fs.mkdirSync(dossierSauvegardes);
  base(path.join(dossierSauvegardes, 'claire-2026-10-04.db'), 2);
  base(path.join(dossierSauvegardes, 'claire-2026-10-05.db'), 3);
  fs.writeFileSync(path.join(dossierSauvegardes, 'claire-2026-10-03.db'), Buffer.alloc(4096, 9));
  fs.writeFileSync(path.join(dossierSauvegardes, 'notes.txt'), 'x');
  const db = ouvrirDb(chemin);
  let redemarre = 0;
  const { app, parametresRepo } = creerApp({ db, config: { authActive: false, cheminDb: chemin, racineRepo: os.tmpdir(), estSea: () => false }, miseAJour: { redemarrer: () => { redemarre++; } } });
  parametresRepo.ecrireReglageSauvegarde({ dossier: dossierSauvegardes });
  const serveur = app.listen(0);
  try {
    await new Promise((r) => serveur.once('listening', r));
    const url = `http://127.0.0.1:${serveur.address().port}/api/sauvegarde`;
    const liste = await (await fetch(`${url}/liste`)).json();
    assert.equal(liste.sauvegardes.map((x) => x.nom).join(), 'claire-2026-10-05.db,claire-2026-10-04.db,claire-2026-10-03.db');
    const post = (fichier) => fetch(`${url}/restaurer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fichier }) });
    assert.equal((await post('../claire.db')).status, 400);
    assert.equal((await post('claire-2026-09-01.db')).status, 404);
    assert.equal((await post('claire-2026-10-03.db')).status, 422, 'sauvegarde illisible refusée');
    assert.ok(!fs.existsSync(path.join(dir, R.NOM_RESTAURATION)));
    const ok = await (await post('claire-2026-10-05.db')).json();
    assert.equal(ok.ok, true);
    assert.equal(ok.redemarrage, false, 'hors exécutable : à relancer à la main');
    assert.ok(fs.existsSync(path.join(dir, R.NOM_RESTAURATION)));
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(redemarre, 0);
  } finally { serveur.close(); db.close(); }
  // Au démarrage suivant : la sauvegarde prend la place de la base.
  const r = R.appliquerRestaurationEnAttente(chemin, MAINTENANT);
  assert.equal(r.fait, true);
  const rouverte = R.ouvrirDbVerifiee(chemin, ouvrirDb, MAINTENANT).db;
  assert.equal(compter(rouverte), 3);
  rouverte.close();
});

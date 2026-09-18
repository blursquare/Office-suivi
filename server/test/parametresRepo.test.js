'use strict';

// Table `parametres` (voir db.js) : un seul blob JSON sous la clé "reglages", écrit/relu par
// l'écran "Réglages" de la sidebar. Le point le plus sensible ici est l'UPSERT SQLite
// (INSERT ... ON CONFLICT ... DO UPDATE) avec node:sqlite — jamais vérifié avant ce test, voir
// CLAUDE.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ouvrirDb } = require('../src/db');
const { creerRepoParametres, assainirReglages, REGLAGES_PAR_DEFAUT } = require('../src/parametresRepo');

test('lireReglages() renvoie les valeurs par défaut quand rien n\'a jamais été écrit', () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  assert.deepEqual(repo.lireReglages(), { ...REGLAGES_PAR_DEFAUT, emailsResponsables: {} });
  db.close();
});

test('ecrireReglages() puis lireReglages() : l\'upsert SQLite (INSERT ... ON CONFLICT) fonctionne bien avec node:sqlite', () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglages({ teamsActif: true, teamsWebhookUrl: 'https://exemple.test/flux', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' } });
  assert.deepEqual(repo.lireReglages(), {
    teamsActif: true,
    teamsWebhookUrl: 'https://exemple.test/flux',
    emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' }
  });
  db.close();
});

test('un second ecrireReglages() REMPLACE la valeur (l\'upsert met bien à jour, pas doublon)', () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglages({ teamsActif: false, teamsWebhookUrl: 'https://a.test', emailsResponsables: {} });
  repo.ecrireReglages({ teamsActif: true, teamsWebhookUrl: 'https://b.test', emailsResponsables: { 'Julie VASSELIN': 'julie@etude.fr' } });
  const lu = repo.lireReglages();
  assert.equal(lu.teamsActif, true);
  assert.equal(lu.teamsWebhookUrl, 'https://b.test');
  assert.deepEqual(lu.emailsResponsables, { 'Julie VASSELIN': 'julie@etude.fr' });
  // Une seule ligne en base pour cette clé, pas un doublon accumulé par l'upsert.
  const n = db.prepare("SELECT COUNT(*) AS n FROM parametres WHERE cle = 'reglages'").get().n;
  assert.equal(n, 1);
  db.close();
});

test('un JSON malformé en base ne fait jamais planter la lecture — repli sur les valeurs par défaut', () => {
  const db = ouvrirDb(':memory:');
  db.exec("CREATE TABLE IF NOT EXISTS parametres (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)");
  db.prepare('INSERT INTO parametres (cle, valeur) VALUES (?, ?)').run('reglages', '{ceci n\'est pas du JSON');
  const repo = creerRepoParametres(db);
  assert.deepEqual(repo.lireReglages(), { ...REGLAGES_PAR_DEFAUT, emailsResponsables: {} });
  db.close();
});

test('assainirReglages() écarte tout ce qui n\'a pas la bonne forme', () => {
  assert.deepEqual(assainirReglages(null), REGLAGES_PAR_DEFAUT);
  assert.deepEqual(assainirReglages({ teamsWebhookUrl: 42, teamsActif: 'oui', emailsResponsables: ['a'] }), REGLAGES_PAR_DEFAUT);
  assert.deepEqual(
    assainirReglages({ teamsWebhookUrl: '  https://x.test  ', teamsActif: true, emailsResponsables: { A: '  a@b.fr  ', B: '', C: 42 } }),
    { teamsWebhookUrl: 'https://x.test', teamsActif: true, emailsResponsables: { A: 'a@b.fr' } }
  );
});

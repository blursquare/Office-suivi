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
  repo.ecrireReglages({ emailActif: true, fluxEmailUrl: 'https://exemple.test/flux', copieEmail: 'gossart@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' } });
  assert.deepEqual(repo.lireReglages(), {
    emailActif: true,
    fluxEmailUrl: 'https://exemple.test/flux',
    copieEmail: 'gossart@etude.fr',
    emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' }
  });
  db.close();
});

test('un second ecrireReglages() REMPLACE la valeur (l\'upsert met bien à jour, pas doublon)', () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglages({ emailActif: false, fluxEmailUrl: 'https://a.test', emailsResponsables: {} });
  repo.ecrireReglages({ emailActif: true, fluxEmailUrl: 'https://b.test', copieEmail: 'gossart@etude.fr', emailsResponsables: { 'Julie VASSELIN': 'julie@etude.fr' } });
  const lu = repo.lireReglages();
  assert.equal(lu.emailActif, true);
  assert.equal(lu.fluxEmailUrl, 'https://b.test');
  assert.equal(lu.copieEmail, 'gossart@etude.fr');
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
  assert.deepEqual(assainirReglages({ fluxEmailUrl: 42, emailActif: 'oui', copieEmail: 7, emailsResponsables: ['a'] }), REGLAGES_PAR_DEFAUT);
  assert.deepEqual(
    assainirReglages({ fluxEmailUrl: '  https://x.test  ', emailActif: true, copieEmail: '  gossart@etude.fr  ', emailsResponsables: { A: '  a@b.fr  ', B: '', C: 42 } }),
    { fluxEmailUrl: 'https://x.test', emailActif: true, copieEmail: 'gossart@etude.fr', emailsResponsables: { A: 'a@b.fr' } }
  );
});

// Passage de Teams à l'email : seule l'ACTION INTERNE du flux Power Automate a changé, pas son URL
// de déclenchement — un réglage déjà enregistré sous les anciennes clés doit donc continuer de
// fonctionner tel quel, sans que l'étude ait à recoller l'URL ni à recocher l'activation.
test('assainirReglages() : reprend les anciennes clés Teams quand les nouvelles sont absentes', () => {
  const repris = assainirReglages({
    teamsWebhookUrl: 'https://exemple.test/flux',
    teamsActif: true,
    teamsCopieEmail: 'gossart@etude.fr',
    emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' }
  });
  assert.equal(repris.fluxEmailUrl, 'https://exemple.test/flux');
  assert.equal(repris.emailActif, true);
  assert.equal(repris.copieEmail, 'gossart@etude.fr');
  // Les anciennes clés ne ressortent jamais : le premier enregistrement depuis l'écran Réglages
  // persiste la forme nouvelle et fait disparaître l'ancienne.
  assert.equal(repris.teamsWebhookUrl, undefined);
  assert.equal(repris.teamsActif, undefined);
});

test('assainirReglages() : la nouvelle clé l\'emporte toujours sur l\'ancienne', () => {
  const r = assainirReglages({
    fluxEmailUrl: 'https://nouveau.test/flux', teamsWebhookUrl: 'https://ancien.test/flux',
    emailActif: false, teamsActif: true,
    copieEmail: '', teamsCopieEmail: 'ancien@etude.fr'
  });
  assert.equal(r.fluxEmailUrl, 'https://nouveau.test/flux');
  // Décocher l'activation doit tenir, même si l'ancienne clé dit encore `true`.
  assert.equal(r.emailActif, false);
  // Vider l'adresse de copie doit tenir aussi, pour la même raison.
  assert.equal(r.copieEmail, '');
});

test('assainirReglages() : copieEmail absent reste une chaîne vide (jamais undefined)', () => {
  assert.equal(assainirReglages({}).copieEmail, '');
  assert.equal(assainirReglages({ copieEmail: '   ' }).copieEmail, '');
});

'use strict';

// Table `parametres` (voir db.js) : un seul blob JSON sous la clé "reglages", écrit/relu par
// l'écran "Réglages" de la sidebar. Le point le plus sensible ici est l'UPSERT SQLite
// (INSERT ... ON CONFLICT ... DO UPDATE) avec node:sqlite — jamais vérifié avant ce test, voir
// CLAUDE.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ouvrirDb } = require('../src/db');
const { creerRepoParametres, assainirReglages, REGLAGES_PAR_DEFAUT, PORT_SMTP_PAR_DEFAUT } = require('../src/parametresRepo');

const REGLAGES_TEST = Object.freeze({
  emailActif: true,
  emailPasserelle: 'passerelle@etude.fr',
  smtpHote: 'smtp.test',
  smtpPort: 587,
  smtpSecurise: false,
  smtpUtilisateur: '',
  smtpMotDePasse: '',
  smtpExpediteur: 'claire@etude.fr',
  copieEmail: 'gossart@etude.fr',
  emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' }
});

test('lireReglages() renvoie les valeurs par défaut quand rien n\'a jamais été écrit', () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  assert.deepEqual(repo.lireReglages(), { ...REGLAGES_PAR_DEFAUT, emailsResponsables: {} });
  db.close();
});

test('ecrireReglages() puis lireReglages() : l\'upsert SQLite (INSERT ... ON CONFLICT) fonctionne bien avec node:sqlite', () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglages(REGLAGES_TEST);
  assert.deepEqual(repo.lireReglages(), REGLAGES_TEST);
  db.close();
});

test('un second ecrireReglages() REMPLACE la valeur (l\'upsert met bien à jour, pas doublon)', () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglages({ ...REGLAGES_TEST, emailActif: false, smtpHote: 'a.test', emailsResponsables: {} });
  repo.ecrireReglages({ ...REGLAGES_TEST, smtpHote: 'b.test', emailsResponsables: { 'Julie VASSELIN': 'julie@etude.fr' } });
  const lu = repo.lireReglages();
  assert.equal(lu.emailActif, true);
  assert.equal(lu.smtpHote, 'b.test');
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
  assert.deepEqual(
    assainirReglages({ smtpHote: 42, emailActif: 'oui', copieEmail: 7, emailsResponsables: ['a'] }),
    REGLAGES_PAR_DEFAUT
  );
  assert.deepEqual(
    assainirReglages({
      smtpHote: '  smtp.test  ', emailPasserelle: '  passerelle@etude.fr ', emailActif: true,
      copieEmail: '  gossart@etude.fr  ', emailsResponsables: { A: '  a@b.fr  ', B: '', C: 42 }
    }),
    {
      ...REGLAGES_PAR_DEFAUT,
      emailActif: true, emailPasserelle: 'passerelle@etude.fr', smtpHote: 'smtp.test',
      copieEmail: 'gossart@etude.fr', emailsResponsables: { A: 'a@b.fr' }
    }
  );
});

// Un port hors bornes viendrait d'une saisie fautive, pas d'une intention : mieux vaut le port
// standard qu'un transport configuré sur un numéro impossible, qui échouerait sans rien expliquer.
test('assainirReglages() : le port SMTP est un entier valide, sinon la valeur par défaut', () => {
  assert.equal(assainirReglages({ smtpPort: '587' }).smtpPort, 587);
  assert.equal(assainirReglages({ smtpPort: 0 }).smtpPort, PORT_SMTP_PAR_DEFAUT);
  assert.equal(assainirReglages({ smtpPort: 99999 }).smtpPort, PORT_SMTP_PAR_DEFAUT);
  assert.equal(assainirReglages({ smtpPort: 'vingt-cinq' }).smtpPort, PORT_SMTP_PAR_DEFAUT);
  assert.equal(assainirReglages({}).smtpPort, PORT_SMTP_PAR_DEFAUT);
});

// Le mot de passe SMTP ne redescend jamais au navigateur (voir routes/reglages.js) : le formulaire
// ne peut donc pas le réémettre à l'enregistrement, et un enregistrement ordinaire ne doit surtout
// pas l'effacer au passage.
test('assainirReglages() : le mot de passe SMTP absent est repris des réglages précédents', () => {
  const precedent = { smtpMotDePasse: 'jeton-applicatif' };
  assert.equal(assainirReglages({ smtpHote: 'smtp.test' }, precedent).smtpMotDePasse, 'jeton-applicatif');
  assert.equal(assainirReglages({ smtpMotDePasse: null }, precedent).smtpMotDePasse, 'jeton-applicatif');
  // Une chaîne explicite, elle, remplace — et une chaîne vide efface (retour à l'envoi anonyme).
  assert.equal(assainirReglages({ smtpMotDePasse: 'nouveau' }, precedent).smtpMotDePasse, 'nouveau');
  assert.equal(assainirReglages({ smtpMotDePasse: '' }, precedent).smtpMotDePasse, '');
});

test('ecrireReglages() conserve le mot de passe SMTP déjà en base quand il n\'est pas renvoyé', () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglages({ ...REGLAGES_TEST, smtpUtilisateur: 'claire@etude.fr', smtpMotDePasse: 'jeton-applicatif' });
  // Le formulaire renvoie tout SAUF le mot de passe (la clé est absente, pas vide) : la copie
  // change, le compte reste utilisable.
  const sansMotDePasse = { ...REGLAGES_TEST, smtpUtilisateur: 'claire@etude.fr', copieEmail: 'autre@etude.fr' };
  delete sansMotDePasse.smtpMotDePasse;
  repo.ecrireReglages(sansMotDePasse);
  const lu = repo.lireReglages();
  assert.equal(lu.smtpMotDePasse, 'jeton-applicatif');
  assert.equal(lu.copieEmail, 'autre@etude.fr');
  db.close();
});

// Deux générations d'architecture en arrière (message privé Teams, puis flux HTTP qui envoyait
// l'email) : `teamsActif`/`teamsCopieEmail` gardent exactement le même sens aujourd'hui, les faire
// ressaisir serait une régression silencieuse. Rien à reprendre en revanche du déclencheur HTTP,
// qui n'existe plus — le serveur SMTP et la passerelle sont à saisir, eux.
test('assainirReglages() : reprend les anciennes clés Teams quand les nouvelles sont absentes', () => {
  const repris = assainirReglages({
    teamsActif: true,
    teamsCopieEmail: 'gossart@etude.fr',
    emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' }
  });
  assert.equal(repris.emailActif, true);
  assert.equal(repris.copieEmail, 'gossart@etude.fr');
  assert.deepEqual(repris.emailsResponsables, { 'Bastien ANGLUMENT': 'bastien@etude.fr' });
  // Les anciennes clés ne ressortent jamais : le premier enregistrement depuis l'écran Réglages
  // persiste la forme actuelle et fait disparaître l'ancienne.
  assert.equal(repris.teamsActif, undefined);
  assert.equal(repris.teamsWebhookUrl, undefined);
  assert.equal(repris.fluxEmailUrl, undefined);
});

test('assainirReglages() : la clé actuelle l\'emporte toujours sur l\'ancienne', () => {
  const r = assainirReglages({
    emailActif: false, teamsActif: true,
    copieEmail: '', teamsCopieEmail: 'ancien@etude.fr'
  });
  // Décocher l'activation doit tenir, même si l'ancienne clé dit encore `true`.
  assert.equal(r.emailActif, false);
  // Vider l'adresse de copie doit tenir aussi, pour la même raison.
  assert.equal(r.copieEmail, '');
});

test('assainirReglages() : copieEmail absent reste une chaîne vide (jamais undefined)', () => {
  assert.equal(assainirReglages({}).copieEmail, '');
  assert.equal(assainirReglages({ copieEmail: '   ' }).copieEmail, '');
});

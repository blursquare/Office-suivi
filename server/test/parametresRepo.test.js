'use strict';

// Table `parametres` (voir db.js) : un seul blob JSON sous la clé "reglages", écrit/relu par
// l'écran "Réglages" de la sidebar. Le point le plus sensible ici est l'UPSERT SQLite
// (INSERT ... ON CONFLICT ... DO UPDATE) avec node:sqlite — jamais vérifié avant ce test, voir
// CLAUDE.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ouvrirDb } = require('../src/db');
const { creerRepoParametres, assainirReglages, REGLAGES_PAR_DEFAUT, PORT_SMTP_PAR_DEFAUT , assainirDernierTour, assainirReglagesAgenda, assainirDernierTourAgenda, assainirReglagesExchange, URL_EWS_DEFAUT } = require('../src/parametresRepo');

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
  emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' },
  fonctionsResponsables: { 'Bastien ANGLUMENT': 'Responsable qualité et relation client' }
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

test('réglages Exchange : URL par défaut, actif par défaut faux', () => {
  const r = assainirReglagesExchange({});
  assert.equal(r.actif, false);
  assert.equal(r.url, URL_EWS_DEFAUT);
  assert.equal(r.email, '');
  assert.equal(r.motDePasse, '');
  assert.equal(r.calendrierPartage, '');
});

test('réglages Exchange : calendrier partagé enregistré et conservé', () => {
  const precedent = assainirReglagesExchange({ actif: true, email: 'a@b.fr', calendrierPartage: 'sophie@gossart.notaires.fr' });
  assert.equal(precedent.calendrierPartage, 'sophie@gossart.notaires.fr');
  // Un enregistrement qui ne renvoie pas le calendrier partagé le conserve.
  const conserve = assainirReglagesExchange({ actif: true, email: 'a@b.fr' }, precedent);
  assert.equal(conserve.calendrierPartage, 'sophie@gossart.notaires.fr');
});

test('réglages Exchange : mot de passe conservé quand la requête ne le renvoie pas, effacé sur chaîne vide', () => {
  const precedent = { actif: true, url: URL_EWS_DEFAUT, email: 'a@b.fr', motDePasse: 'SECRET' };
  // Enregistrement sans mot de passe (le formulaire ne le réémet pas) → conservé.
  const conserve = assainirReglagesExchange({ actif: true, email: 'a@b.fr' }, precedent);
  assert.equal(conserve.motDePasse, 'SECRET');
  // Chaîne vide explicite → effacé.
  const efface = assainirReglagesExchange({ actif: false, email: 'a@b.fr', motDePasse: '' }, precedent);
  assert.equal(efface.motDePasse, '');
});

test('réglages Exchange : upsert en base + round-trip', () => {
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  repo.ecrireReglagesExchange({ actif: true, email: 'notaire@gossart.notaires.fr', motDePasse: 'MDP' });
  const lu = repo.lireReglagesExchange();
  assert.equal(lu.actif, true);
  assert.equal(lu.email, 'notaire@gossart.notaires.fr');
  assert.equal(lu.motDePasse, 'MDP');
  // Un enregistrement de l'interrupteur seul (sans mot de passe) ne l'efface pas.
  repo.ecrireReglagesExchange({ actif: false, email: 'notaire@gossart.notaires.fr' });
  assert.equal(repo.lireReglagesExchange().motDePasse, 'MDP');
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

// ---- assainirDernierTour ----
// Même discipline de liste blanche que pour les réglages : ce compte rendu est relu à chaque
// ouverture de l'écran Réglages, une valeur exotique en base ne doit jamais remonter telle quelle.

test('assainirDernierTour : valeurs exotiques ramenées à une forme sûre', () => {
  const t = assainirDernierTour({ at: 42, rappelsDus: -3, rappelsEnvoyes: 2.7, erreurs: 'pas un tableau', declenche: 'bidon' });
  assert.equal(t.at, '');
  assert.equal(t.rappelsDus, 0);
  assert.equal(t.rappelsEnvoyes, 2);
  assert.deepEqual(t.erreurs, []);
  assert.equal(t.declenche, 'automatique', 'seul "manuel" est reconnu, tout le reste retombe sur automatique');
  assert.deepEqual(assainirDernierTour(null).erreurs, []);
});

test('assainirDernierTour : les erreurs sont plafonnées et les entrées vides écartées', () => {
  const erreurs = Array.from({ length: 50 }, (_, i) => `erreur ${i}`).concat(['', '   ']);
  const t = assainirDernierTour({ erreurs, declenche: 'manuel' });
  assert.equal(t.erreurs.length, 20, 'un tour en échec sur tout un portefeuille ne doit pas faire grossir la base');
  assert.equal(t.erreurs[0], 'erreur 0');
  assert.equal(t.declenche, 'manuel');
});

test('assainirDernierTour conserve les avertissements (chaînes seulement)', () => {
  const { assainirDernierTour } = require('../src/parametresRepo');
  const t = assainirDernierTour({ at: 'x', avertissements: ['Copie Gmail non effacée', 3, ''] });
  assert.equal(t.avertissements.length, 1);
  assert.equal(assainirDernierTour({}).avertissements.length, 0);
});

// Réglages de l'agenda de l'office (voir agendaOffice.js/agendaWatch.js) : une seule URL http(s),
// tout le reste (un chemin de fichier collé par erreur, du texte au hasard) est écarté avant même
// que le tour de surveillance n'essaie de la joindre.
test('assainirReglagesAgenda : n\'accepte qu\'une URL http(s)', () => {
  assert.equal(assainirReglagesAgenda({ icsUrl: 'https://outlook.office.com/x.ics' }).icsUrl, 'https://outlook.office.com/x.ics');
  assert.equal(assainirReglagesAgenda({ icsUrl: 'http://exemple.fr/x.ics' }).icsUrl, 'http://exemple.fr/x.ics');
  assert.equal(assainirReglagesAgenda({ icsUrl: 'C:\\Users\\etude\\agenda.ics' }).icsUrl, '');
  assert.equal(assainirReglagesAgenda({ icsUrl: '' }).icsUrl, '');
  assert.equal(assainirReglagesAgenda({}).icsUrl, '');
  assert.equal(assainirReglagesAgenda(null).icsUrl, '');
});

test('assainirDernierTourAgenda : borne les listes et les valeurs exotiques', () => {
  const t = assainirDernierTourAgenda({
    at: 'x', ok: 'oui', dossiersVerifies: -2,
    misAJour: [{ dossierId: 'd1', dossierNom: 'A / B', action: 'appelFonds', dateIso: '2026-10-14' }, 'pas un objet'],
    dejaRenseignes: 'pas un tableau',
    sansCorrespondance: [{ reference: 'X' }],
    erreur: 12, declenche: 'bidon'
  });
  assert.equal(t.ok, true);
  assert.equal(t.dossiersVerifies, 0);
  assert.equal(t.misAJour.length, 1);
  assert.equal(t.misAJour[0].action, 'appelFonds');
  assert.deepEqual(t.dejaRenseignes, []);
  assert.equal(t.sansCorrespondance.length, 1);
  assert.equal(t.erreur, '12');
  assert.equal(t.declenche, 'automatique');
  assert.equal(assainirDernierTourAgenda(null).ok, false);
});

test('assainirDernierTourAgenda : une action inconnue est ecartee, jamais propagee telle quelle', () => {
  const t = assainirDernierTourAgenda({ misAJour: [{ dossierId: 'd1', dossierNom: 'X', action: 'autre-chose', dateIso: '2026-10-14' }] });
  assert.equal(t.misAJour[0].action, '');
});

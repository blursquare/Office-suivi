'use strict';

// Job de rappels automatiques vers Teams (voir src/jobs/rappels.js) — remplace le DÉCLENCHEMENT
// AUTOMATIQUE des rappels, qui n'existait pas jusqu'ici (voir CLAUDE.md, "Ce qui n'a
// volontairement pas été fait"). Le plus important à couvrir : ne jamais renvoyer deux fois le
// même rappel (reminder_log), et ne jamais planter le job entier si UN collaborateur n'a pas
// d'adresse configurée.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  SEUILS_RAPPELS, echeanceValidee, toutesEcheances, joursRestants,
  calculerRappelsDus, texteRappel, executerTacheRappels
} = require('../src/jobs/rappels');
const { ouvrirDb } = require('../src/db');
const { creerDepot } = require('../src/dossiersRepo');
const { creerRepoParametres } = require('../src/parametresRepo');

test('SEUILS_RAPPELS reprend bien J-15/J-7 (RAPPELS_PAR_DEFAUT côté client)', () => {
  assert.deepEqual(SEUILS_RAPPELS, [15, 7]);
});

test('echeanceValidee : le prêt est "validé" dès que l\'offre est reçue, les autres via echeancesValidees', () => {
  assert.equal(echeanceValidee({ offrePretStatut: 'recue' }, 'pret'), true);
  assert.equal(echeanceValidee({ offrePretStatut: 'introuvable' }, 'pret'), false);
  assert.equal(echeanceValidee({ echeancesValidees: { ventebien: true } }, 'ventebien'), true);
  assert.equal(echeanceValidee({}, 'acte'), false);
});

test('toutesEcheances : exclut le prêt une fois l\'offre reçue, inclut les échéances personnalisées non validées', () => {
  const d = {
    pret: '2026-11-11', acte: '2026-12-01', ventebien: '',
    offrePretStatut: 'recue',
    autres: [{ label: 'Levée hypothèque', date: '2026-09-30' }]
  };
  const types = toutesEcheances(d).map((e) => e.type);
  assert.ok(!types.includes('pret'), 'le prêt déjà reçu ne doit pas être rappelé');
  assert.ok(types.includes('acte'));
  assert.ok(!types.includes('ventebien'), 'sans date, une échéance ne doit jamais être rappelée');
  assert.ok(types.includes('autre-0'));
});

test('toutesEcheances : un dossier sans prêt (sansPret) garde ses autres échéances', () => {
  const d = { sansPret: true, acte: '2026-12-01' };
  const types = toutesEcheances(d).map((e) => e.type);
  assert.deepEqual(types, ['acte']);
});

test('joursRestants compte en UTC, insensible aux bascules heure d\'été/hiver', () => {
  assert.equal(joursRestants('2026-11-11', '2026-10-27'), 15);
  assert.equal(joursRestants('2026-11-11', '2026-11-04'), 7);
  assert.equal(joursRestants('2026-11-11', '2026-11-11'), 0);
});

test('calculerRappelsDus : un dossier archivé ou sans responsable n\'est jamais rappelé', () => {
  const jour = '2026-10-27'; // J-15 avant le 2026-11-11
  assert.deepEqual(calculerRappelsDus([{ id: 'd1', archive: true, responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' }], jour, new Set()), []);
  assert.deepEqual(calculerRappelsDus([{ id: 'd1', responsable: '', pret: '2026-11-11' }], jour, new Set()), []);
});

test('calculerRappelsDus : un rappel tombe pile à J-15 et à J-7, jamais entre les deux', () => {
  const d = { id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', pret: '2026-11-11' };
  assert.equal(calculerRappelsDus([d], '2026-10-27', new Set()).length, 1); // J-15
  assert.equal(calculerRappelsDus([d], '2026-11-04', new Set()).length, 1); // J-7
  assert.equal(calculerRappelsDus([d], '2026-11-01', new Set()).length, 0); // ni l'un ni l'autre
});

test('calculerRappelsDus : déjà envoyé (reminder_log) → jamais renvoyé le même jour', () => {
  const d = { id: 'd1', nom: 'X / Y', responsable: 'Jérémy SAUJOT', pret: '2026-11-11' };
  const dejaEnvoyes = new Set(['d1:pret:15']);
  assert.deepEqual(calculerRappelsDus([d], '2026-10-27', dejaEnvoyes), []);
});

test('texteRappel accorde "jour"/"jours" et nomme le dossier et l\'échéance', () => {
  assert.match(texteRappel({ libelle: "Signature de l'acte", nomDossier: 'X / Y', seuil: 7, iso: '2026-11-04' }), /7 jours/);
});

// ---- executerTacheRappels : un tour complet, avec un envoi injecté ----

function config() {
  return { intervalleRappelsMs: 30 * 60 * 1000 };
}

test('executerTacheRappels : ne fait rien si teamsActif est faux ou l\'URL absente', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'X / Y', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  let appels = 0;
  const envoyerFn = async () => { appels += 1; return { ok: true }; };

  parametresRepo.ecrireReglages({ teamsActif: false, teamsWebhookUrl: 'https://x.test', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(appels, 0);

  parametresRepo.ecrireReglages({ teamsActif: true, teamsWebhookUrl: '', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(appels, 0);

  db.close();
});

test('executerTacheRappels : envoie le rappel dû, le marque dans reminder_log, ne le renvoie jamais une seconde fois', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({ teamsActif: true, teamsWebhookUrl: 'https://x.test', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });

  const envois = [];
  const envoyerFn = async (url, email, texte) => { envois.push({ url, email, texte }); return { ok: true }; };

  const r1 = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(r1.rappelsDus, 1);
  assert.equal(r1.rappelsEnvoyes, 1);
  assert.equal(envois.length, 1);
  assert.equal(envois[0].email, 'b@etude.fr');
  assert.match(envois[0].texte, /DUPONT \/ MARTIN/);

  // Un second tour LE MÊME JOUR (le job tourne toutes les 30 minutes) : déjà marqué, pas de renvoi.
  const r2 = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(r2.rappelsDus, 0);
  assert.equal(envois.length, 1);

  db.close();
});

test('executerTacheRappels : un collaborateur sans adresse configurée est signalé, sans bloquer les autres', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'A / B', responsable: 'Julie VASSELIN', pret: '2026-11-11' });
  depot.creer({ id: 'd2', nom: 'C / D', responsable: 'Jérémy SAUJOT', acte: '2026-11-11' });
  parametresRepo.ecrireReglages({ teamsActif: true, teamsWebhookUrl: 'https://x.test', emailsResponsables: { 'Jérémy SAUJOT': 'jeremy@etude.fr' } });

  const envois = [];
  const envoyerFn = async (url, email, texte) => { envois.push(email); return { ok: true }; };

  const r = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(r.rappelsDus, 2);
  assert.equal(r.rappelsEnvoyes, 1);
  assert.equal(envois.length, 1);
  assert.equal(envois[0], 'jeremy@etude.fr');
  assert.equal(r.erreurs.length, 1);
  assert.match(r.erreurs[0], /Julie VASSELIN/);

  db.close();
});

test('executerTacheRappels : un envoi en échec n\'est jamais marqué comme envoyé (sera retenté)', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'X / Y', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({ teamsActif: true, teamsWebhookUrl: 'https://x.test', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });

  let appels = 0;
  const envoyerFn = async () => { appels += 1; return { ok: false, erreur: 'Flux injoignable' }; };

  const r1 = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(r1.rappelsEnvoyes, 0);
  assert.equal(r1.erreurs.length, 1);

  const r2 = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(r2.rappelsDus, 1, 'toujours dû : pas marqué "envoyé" après un échec');
  assert.equal(appels, 2);

  db.close();
});

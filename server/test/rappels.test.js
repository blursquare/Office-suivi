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
  calculerRappelsDus, sujetRappel, texteRappel, executerTacheRappels
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

// "Permettre de valider n'importe quelle date d'échéance" (voir script.js) doit aussi arrêter les
// rappels Teams sur le prêt quand la validation vient d'un clic manuel plutôt que du parcours NAS.
test('echeanceValidee : le prêt est aussi "validé" par la validation manuelle (echeancesValidees.pret)', () => {
  assert.equal(echeanceValidee({ offrePretStatut: 'inconnu', echeancesValidees: { pret: true } }, 'pret'), true);
  assert.equal(echeanceValidee({ offrePretStatut: 'inconnu' }, 'pret'), false);
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

test('toutesEcheances : couvre aussi l\'appel de fonds et le rendez-vous de signature, exclus une fois validés', () => {
  const d = { appelFonds: '2026-11-20', rendezVousSignature: '2026-12-05' };
  assert.deepEqual(toutesEcheances(d).map((e) => e.type).sort(), ['appelFonds', 'rendezVousSignature']);
  const validees = { ...d, echeancesValidees: { appelFonds: true, rendezVousSignature: true } };
  assert.deepEqual(toutesEcheances(validees), []);
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

test('texteRappel : ajoute la liste des pièces reçues/manquantes quand elle est fournie', () => {
  const r = {
    libelle: 'Obtention du prêt', nomDossier: 'X / Y', seuil: 15, iso: '2026-11-11',
    pieces: { recues: ["Certificat d'urbanisme"], manquantes: ['ERP (état des risques et pollution)'] }
  };
  const texte = texteRappel(r);
  assert.match(texte, /Pièces reçues \(1\) : Certificat d'urbanisme/);
  assert.match(texte, /Pièces manquantes \(1\) : ERP/);
});

test('texteRappel : aucune ligne de pièces quand il n\'y en a aucune (dossier participant, ou champ absent)', () => {
  const texte = texteRappel({ libelle: 'Vente préalable', nomDossier: 'X / Y', seuil: 7, iso: '2026-11-04', pieces: { recues: [], manquantes: [] } });
  assert.doesNotMatch(texte, /Pièces/);
});

test('calculerRappelsDus : attache les pièces reçues/manquantes du dossier à chaque rappel dû', () => {
  const d = {
    id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', pret: '2026-11-11',
    typeVente: 'maison', pieces: { certificatUrbanisme: 'recue' }
  };
  const dus = calculerRappelsDus([d], '2026-10-27', new Set());
  assert.equal(dus.length, 1);
  assert.ok(dus[0].pieces.recues.includes("Certificat d'urbanisme"));
  assert.ok(dus[0].pieces.manquantes.length > 0);
});

// ---- executerTacheRappels : un tour complet, avec un envoi injecté ----

function config() {
  return { intervalleRappelsMs: 30 * 60 * 1000 };
}

test('executerTacheRappels : ne fait rien si emailActif est faux ou l\'URL absente', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'X / Y', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  let appels = 0;
  const envoyerFn = async () => { appels += 1; return { ok: true }; };

  parametresRepo.ecrireReglages({ emailActif: false, fluxEmailUrl: 'https://x.test', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(appels, 0);

  parametresRepo.ecrireReglages({ emailActif: true, fluxEmailUrl: '', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(appels, 0);

  db.close();
});

test('executerTacheRappels : envoie le rappel dû, le marque dans reminder_log, ne le renvoie jamais une seconde fois', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({ emailActif: true, fluxEmailUrl: 'https://x.test', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });

  const envois = [];
  const envoyerFn = async (url, email, sujet, texte) => { envois.push({ url, email, texte }); return { ok: true }; };

  const r1 = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(r1.rappelsDus, 1);
  assert.equal(r1.rappelsEnvoyes, 1);
  assert.equal(envois.length, 1);
  assert.equal(envois[0].email, 'b@etude.fr');
  assert.match(envois[0].texte, /DUPONT \/ MARTIN/);
  assert.match(envois[0].texte, /Pièces (reçues|manquantes)/, 'la liste des pièces doit accompagner le rappel');

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
  parametresRepo.ecrireReglages({ emailActif: true, fluxEmailUrl: 'https://x.test', emailsResponsables: { 'Jérémy SAUJOT': 'jeremy@etude.fr' } });

  const envois = [];
  const envoyerFn = async (url, email, sujet, texte) => { envois.push(email); return { ok: true }; };

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
  parametresRepo.ecrireReglages({ emailActif: true, fluxEmailUrl: 'https://x.test', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });

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

// ---- Objet de l'email (apparu avec le passage de Teams à l'email) ----

test('sujetRappel : une ligne, sans emoji, qui nomme l\'échéance, le délai et le dossier', () => {
  const sujet = sujetRappel({ libelle: 'Obtention du prêt', seuil: 15, nomDossier: 'DUPONT / MARTIN', iso: '2026-10-01' });
  assert.equal(sujet, 'CLAIRE — Obtention du prêt dans 15 jours — DUPONT / MARTIN');
  // Ce qui s'affiche dans une liste de messages doit tenir sur une ligne : jamais de retour à la
  // ligne, contrairement au corps qui liste les pièces reçues/manquantes.
  assert.ok(!sujet.includes('\n'));
});

test('sujetRappel : « 1 jour » au singulier', () => {
  assert.match(sujetRappel({ libelle: 'Signature de l\'acte', seuil: 1, nomDossier: 'X / Y' }), /dans 1 jour —/);
});

test('executerTacheRappels : l\'objet ET le corps sont transmis au flux', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'dsujet', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({ emailActif: true, fluxEmailUrl: 'https://x.test', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });
  const envois = [];
  const envoyerFn = async (url, email, sujet, texte) => { envois.push({ sujet, texte }); return { ok: true }; };
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(envois.length, 1);
  assert.match(envois[0].sujet, /Obtention du prêt dans 15 jours — DUPONT \/ MARTIN/);
  assert.match(envois[0].texte, /arrive à échéance dans 15 jours/);
  db.close();
});

// ---- copieEmail : une copie de CHAQUE rappel envoyé, demandée explicitement par l'étude ----

test('executerTacheRappels : copieEmail reçoit un double de chaque rappel envoyé au responsable', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  depot.creer({ id: 'd2', nom: 'A / B', responsable: 'Julie VASSELIN', acte: '2026-11-03' });
  parametresRepo.ecrireReglages({
    emailActif: true, fluxEmailUrl: 'https://x.test', copieEmail: 'gossart@etude.fr',
    emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr', 'Julie VASSELIN': 'j@etude.fr' }
  });

  const envois = [];
  const envoyerFn = async (url, email, sujet, texte) => { envois.push({ email, texte }); return { ok: true }; };

  const r = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(r.rappelsEnvoyes, 2);
  // Un envoi au responsable + une copie, pour CHACUN des deux rappels dus.
  assert.equal(envois.length, 4);
  assert.equal(envois.filter((e) => e.email === 'gossart@etude.fr').length, 2);
  assert.equal(envois.filter((e) => e.email === 'b@etude.fr').length, 1);
  assert.equal(envois.filter((e) => e.email === 'j@etude.fr').length, 1);
  // La copie porte exactement le même texte que l'envoi principal correspondant.
  const principal = envois.find((e) => e.email === 'b@etude.fr');
  const copie = envois.filter((e) => e.email === 'gossart@etude.fr').find((e) => e.texte === principal.texte);
  assert.ok(copie, 'la copie doit porter le même texte que le rappel envoyé au responsable');

  db.close();
});

test('executerTacheRappels : sans copieEmail configuré, aucune copie n\'est envoyée', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'X / Y', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({ emailActif: true, fluxEmailUrl: 'https://x.test', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });

  const envois = [];
  const envoyerFn = async (url, email) => { envois.push(email); return { ok: true }; };

  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.deepEqual(envois, ['b@etude.fr']);

  db.close();
});

test('executerTacheRappels : copieEmail identique à l\'adresse du responsable n\'est jamais envoyé deux fois', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'X / Y', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({
    emailActif: true, fluxEmailUrl: 'https://x.test', copieEmail: 'b@etude.fr',
    emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' }
  });

  const envois = [];
  const envoyerFn = async (url, email) => { envois.push(email); return { ok: true }; };

  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.deepEqual(envois, ['b@etude.fr']);

  db.close();
});

test('executerTacheRappels : un échec de la copie n\'empêche pas le rappel principal d\'être marqué envoyé', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'X / Y', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({
    emailActif: true, fluxEmailUrl: 'https://x.test', copieEmail: 'gossart@etude.fr',
    emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' }
  });

  const envoyerFn = async (url, email) => (
    email === 'gossart@etude.fr' ? { ok: false, erreur: 'Copie injoignable' } : { ok: true }
  );

  const r1 = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(r1.rappelsEnvoyes, 1);
  assert.equal(r1.erreurs.length, 1);
  assert.match(r1.erreurs[0], /Copie/);

  // Le rappel principal reste marqué envoyé malgré l'échec de la copie : pas de renvoi au tour suivant.
  const r2 = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(r2.rappelsDus, 0);

  db.close();
});

// Miroir de la règle client : un rendez-vous de signature fixé clôt la date butoir de réitération
// (« une fois que cette date est rentrée la date butoir n'a plus lieu d'être », l'étude). Relancer
// sur ce butoir n'aurait plus d'objet — le rendez-vous réel prend le relais.
test('echeanceValidee : un rendez-vous fixé clôt la date butoir', () => {
  assert.equal(echeanceValidee({ acte: '2026-10-01' }, 'acte'), false);
  assert.equal(echeanceValidee({ acte: '2026-10-01', rendezVousSignature: '2026-10-06' }, 'acte'), true);
  assert.equal(echeanceValidee({ acte: '2026-10-01', echeancesValidees: { acte: true } }, 'acte'), true);
});

test('toutesEcheances : le butoir remplacé sort du planning, dans l\'ordre métier du dossier', () => {
  const d = {
    ventebien: '2026-08-01', pret: '2026-09-01', acte: '2026-10-01',
    appelFonds: '2026-09-25', rendezVousSignature: '2026-10-06'
  };
  assert.equal(
    toutesEcheances(d).map((e) => e.type).join(','),
    'ventebien,pret,appelFonds,rendezVousSignature'
  );
  // Sans rendez-vous, le butoir reste bien dans le planning, à sa place dans l'ordre métier.
  const sansRdv = Object.assign({}, d, { rendezVousSignature: '' });
  assert.equal(
    toutesEcheances(sansRdv).map((e) => e.type).join(','),
    'ventebien,pret,acte,appelFonds'
  );
});

test('executerTacheRappels : aucun rappel sur une date butoir dont le rendez-vous est déjà fixé', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  parametresRepo.ecrireReglages(config());
  depot.creer({
    id: 'r1', nom: 'X / Y', responsable: 'Julie VASSELIN',
    acte: '2026-10-27', rendezVousSignature: '2026-11-10'
  });
  const envoyes = [];
  const envoyerFn = async (url, dest, sujet, texte) => { envoyes.push({ dest, texte }); return { ok: true }; };
  // J-15 de la date butoir : rien ne doit partir pour elle.
  const r = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-12');
  assert.equal(r.rappelsDus, 0);
  assert.equal(envoyes.length, 0);
  db.close();
});

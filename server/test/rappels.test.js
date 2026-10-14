'use strict';

// Job de rappels automatiques vers Teams (voir src/jobs/rappels.js) — remplace le DÉCLENCHEMENT
// AUTOMATIQUE des rappels, qui n'existait pas jusqu'ici (voir CLAUDE.md, "Ce qui n'a
// volontairement pas été fait"). Le plus important à couvrir : ne jamais renvoyer deux fois le
// même rappel (reminder_log), et ne jamais planter le job entier si UN collaborateur n'a pas
// d'adresse configurée.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  SEUILS_RAPPELS_PAR_TYPE, SEUILS_RAPPELS_DEFAUT, seuilsPourType,
  echeanceValidee, toutesEcheances, joursRestants,
  calculerRappelsDus, texteRappel, executerTacheRappels
} = require('../src/jobs/rappels');
const { ouvrirDb } = require('../src/db');
const { creerDepot } = require('../src/dossiersRepo');
const { creerRepoParametres } = require('../src/parametresRepo');

// Ces quatre couples sont des valeurs METIER donnees une par une par l'etude : seul un test
// empeche une retouche ulterieure de les ramener a un seuil unique (meme raison que les durees
// de validite des diagnostics, verrouillees de la meme facon cote Outil 2).
test('les seuils de rappel sont ceux donnes par l etude, echeance par echeance', () => {
  assert.deepEqual(seuilsPourType('pret'), [15, 7]);
  assert.deepEqual(seuilsPourType('ventebien'), [15, 7]);
  assert.deepEqual(seuilsPourType('appelFonds'), [0], 'le jour de son échéance, 10 jours avant le rendez-vous (étude 05/10)');
  assert.deepEqual(seuilsPourType('rendezVousSignature'), [25, 15]);
});

test('une echeance personnalisee retombe sur le couple par defaut', () => {
  assert.deepEqual(seuilsPourType('autre-0'), SEUILS_RAPPELS_DEFAUT);
  assert.deepEqual(seuilsPourType('autre-7'), [15, 7]);
});

// Envoi du projet d'acte (etude 06/10) : pas de rappel 15 jours avant, un seul a J-7.
test('projetEnvoye : un seul rappel, a J-7 (pas de J-15)', () => {
  assert.deepEqual(seuilsPourType('projetEnvoye'), [7]);
  assert.notDeepEqual(seuilsPourType('projetEnvoye'), SEUILS_RAPPELS_DEFAUT);
});

test('la date butoir n a aucun seuil declare : elle ne doit jamais etre rappelee', () => {
  assert.equal(SEUILS_RAPPELS_PAR_TYPE.acte, undefined);
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
  // La date butoir n'est qu'indicative : elle ne déclenche aucun rappel (règle de l'étude).
  assert.ok(!types.includes('acte'));
  assert.ok(!types.includes('ventebien'), 'sans date, une échéance ne doit jamais être rappelée');
  assert.ok(types.includes('autre-0'));
});

test('toutesEcheances : appel de fonds, puis projet envoyé, puis signature', () => {
  // Miroir de echeancesPlanning() côté script.js : tant que l'appel de fonds n'est pas fait,
  // c'est lui qu'on rappelle, même si le rendez-vous est déjà fixé ; une fois fait, c'est
  // l'envoi du projet d'acte (ajouté après coup, voir agendaWatch.js) ; une fois le projet
  // envoyé, la signature.
  // (Une date d'envoi saisie vaut envoi fait : l'étape à faire n'a jamais de date propre, c'est le rendez-vous qui l'ancre.)
  const d = { rendezVousSignature: '2026-12-05' };
  assert.deepEqual(toutesEcheances(d).map((e) => e.type), ['appelFonds']);
  assert.equal(toutesEcheances(d)[0].iso, '2026-11-25', '10 jours avant le rendez-vous (étude 05/10)');

  const faitAppel = { ...d, echeancesValidees: { appelFonds: true } };
  const apresAppel = toutesEcheances(faitAppel);
  assert.deepEqual(apresAppel.map((e) => e.type), ['projetEnvoye']);
  assert.equal(apresAppel[0].label, 'Envoi projet');

  const faitProjet = { ...d, echeancesValidees: { appelFonds: true, projetEnvoye: true } };
  const apresProjet = toutesEcheances(faitProjet);
  assert.deepEqual(apresProjet.map((e) => e.type), ['rendezVousSignature']);
  assert.equal(apresProjet[0].label, 'Signature de l\u2019acte');

  const validees = { ...d, echeancesValidees: { appelFonds: true, projetEnvoye: true, rendezVousSignature: true } };
  assert.deepEqual(toutesEcheances(validees), []);
});

test('toutesEcheances : sans date propre, l\'appel de fonds est attendu 10 jours avant le rendez-vous', () => {
  const items = toutesEcheances({ rendezVousSignature: '2026-12-05' });
  assert.deepEqual(items.map((e) => e.type), ['appelFonds']);
  assert.equal(items[0].iso, '2026-11-25');
});

test('toutesEcheances : un dossier sans prêt (sansPret) garde ses autres échéances', () => {
  const d = { sansPret: true, ventebien: '2026-12-01' };
  const types = toutesEcheances(d).map((e) => e.type);
  assert.deepEqual(types, ['ventebien']);
});

test('toutesEcheances : offre reçue, pas de rendez-vous → ancré sur la date butoir (ne disparaît pas)', () => {
  // Cas participation signalé par l'étude : plus aucune échéance datée, le dossier disparaissait du
  // planning. Il reste visible — étape « Fixer le rendez-vous » (28/09) ancrée sur la date butoir —,
  // mais jamais un item 'acte'.
  const d = { offrePretStatut: 'recue', acte: '2026-12-01', pieces: { renonciationPreemption: 'recue' } };
  const items = toutesEcheances(d);
  assert.deepEqual(items.map((e) => e.type), ['fixerRdv']);
  assert.equal(items[0].iso, '2026-12-01');
  assert.ok(!items.some((e) => e.type === 'acte'));

  // Mais si une autre échéance datée reste, la date butoir ne crée aucun appel de fonds prématuré.
  const avecPret = { pret: '2026-10-01', acte: '2026-12-01' };
  assert.deepEqual(toutesEcheances(avecPret).map((e) => e.type), ['pret']);
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

test('calculerRappelsDus : l appel de fonds part une seule fois, 10 jours avant le rendez-vous', () => {
  // Étude 05/10 : « pour Teams il faut suivre les délais des échanges, donc appel de fonds 10 j avant, pas 15 j ».
  // Un dossier dont l offre de pret est recue : le planning annonce alors l appel de fonds, seul.
  const d = {
    id: 'd1', nom: 'X / Y', responsable: 'Julie VASSELIN',
    offrePretStatut: 'recue', rendezVousSignature: '2026-11-11'
  };
  // Échéance de l'appel de fonds : 10 jours avant le rendez-vous (01/11) — le rappel part ce jour-là, et seulement ce jour-là.
  assert.equal(calculerRappelsDus([d], '2026-10-17', new Set()).length, 0); // plus de rappel 15 jours avant l'échéance
  assert.equal(calculerRappelsDus([d], '2026-10-27', new Set()).length, 0); // ni 15 jours avant le rendez-vous
  const dus = calculerRappelsDus([d], '2026-11-01', new Set());
  assert.equal(dus.length, 1); // J-10 du rendez-vous
  assert.equal(dus[0].reminderKey, 'appelFonds:0');
  assert.match(texteRappel(dus[0]), /est à faire aujourd'hui \(le 2026-11-01\)/);
  assert.equal(calculerRappelsDus([d], '2026-11-04', new Set()).length, 0); // J-7 : rien
});

test('calculerRappelsDus : la signature part de plus loin, a J-25 et J-15', () => {
  // Appel de fonds ET projet d'acte deja faits : le planning passe a la signature (voir
  // toutesEcheances) - le projet envoye est une etape intermediaire ajoutee apres coup.
  const d = {
    id: 'd1', nom: 'X / Y', responsable: 'Julie VASSELIN',
    offrePretStatut: 'recue', appelFonds: '2026-10-01',
    echeancesValidees: { appelFonds: true, projetEnvoye: true }, rendezVousSignature: '2026-11-11'
  };
  assert.equal(calculerRappelsDus([d], '2026-10-17', new Set()).length, 1); // J-25
  assert.equal(calculerRappelsDus([d], '2026-10-27', new Set()).length, 1); // J-15
  assert.equal(calculerRappelsDus([d], '2026-11-04', new Set()).length, 0); // J-7 : plus un seuil
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

test('executerTacheRappels : ne fait rien si emailActif est faux ou le serveur SMTP absent', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'X / Y', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  let appels = 0;
  const envoyerFn = async () => { appels += 1; return { ok: true }; };

  parametresRepo.ecrireReglages({ emailActif: false, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(appels, 0);

  parametresRepo.ecrireReglages({ emailActif: true, smtpHote: '', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(appels, 0);

  db.close();
});

test('executerTacheRappels : envoie le rappel dû, le marque dans reminder_log, ne le renvoie jamais une seconde fois', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });

  const envois = [];
  const envoyerFn = async (reglages, email, texte) => { envois.push({ email, texte }); return { ok: true }; };

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
  depot.creer({ id: 'd2', nom: 'C / D', responsable: 'Jérémy SAUJOT', ventebien: '2026-11-11' });
  parametresRepo.ecrireReglages({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Jérémy SAUJOT': 'jeremy@etude.fr' } });

  const envois = [];
  const envoyerFn = async (reglages, email, texte) => { envois.push(email); return { ok: true }; };

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
  parametresRepo.ecrireReglages({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });

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

// ---- Ce qui est transmis à la couche d'envoi ----

// L'objet de l'email n'est plus construit ici : il transporte l'adresse du destinataire, posée par
// envoiEmail.js (voir la convention du flux). Ce qui doit arriver jusque-là, c'est l'objet de
// réglages COMPLET — sans lui, la couche d'envoi n'aurait ni serveur SMTP ni passerelle.
test('executerTacheRappels : les réglages complets et le corps sont transmis à la couche d\'envoi', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'denvoi', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });
  const envois = [];
  const envoyerFn = async (reglages, email, texte) => { envois.push({ reglages, email, texte }); return { ok: true }; };
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(envois.length, 1);
  assert.equal(envois[0].reglages.smtpHote, 'smtp.test');
  assert.equal(envois[0].reglages.emailPasserelle, 'passerelle@etude.fr');
  assert.equal(envois[0].email, 'b@etude.fr');
  assert.match(envois[0].texte, /arrive à échéance dans 15 jours/);
  db.close();
});

// ---- copieEmail : une copie de CHAQUE rappel envoyé, demandée explicitement par l'étude ----

test('executerTacheRappels : copieEmail reçoit un double de chaque rappel envoyé au responsable', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  depot.creer({ id: 'd2', nom: 'A / B', responsable: 'Julie VASSELIN', ventebien: '2026-11-03' });
  parametresRepo.ecrireReglages({
    emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: 'gossart@etude.fr',
    emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr', 'Julie VASSELIN': 'j@etude.fr' }
  });

  const envois = [];
  const envoyerFn = async (reglages, email, texte) => { envois.push({ email, texte }); return { ok: true }; };

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
  parametresRepo.ecrireReglages({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });

  const envois = [];
  const envoyerFn = async (reglages, email) => { envois.push(email); return { ok: true }; };

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
    emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: 'b@etude.fr',
    emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' }
  });

  const envois = [];
  const envoyerFn = async (reglages, email) => { envois.push(email); return { ok: true }; };

  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.deepEqual(envois, ['b@etude.fr']);

  db.close();
});

test('executerTacheRappels : copie et responsable écrits avec une casse différente — un seul envoi', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'X / Y', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({
    emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr',
    copieEmail: 'bastien.anglument@gossart.notaires.fr',
    emailsResponsables: { 'Bastien ANGLUMENT': 'Bastien.ANGLUMENT@gossart.notaires.fr ' }
  });

  const envois = [];
  const envoyerFn = async (reglages, email) => { envois.push(email); return { ok: true }; };

  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');
  assert.equal(envois.length, 1);

  db.close();
});

test('executerTacheRappels : un échec de la copie n\'empêche pas le rappel principal d\'être marqué envoyé', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'X / Y', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({
    emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', copieEmail: 'gossart@etude.fr',
    emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' }
  });

  const envoyerFn = async (reglages, email) => (
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

test('toutesEcheances : la date butoir ne figure JAMAIS au planning, dans l\'ordre métier du dossier', () => {
  const d = {
    ventebien: '2026-08-01', pret: '2026-09-01', acte: '2026-10-01',
    rendezVousSignature: '2026-10-06'
  };
  assert.equal(
    toutesEcheances(d).map((e) => e.type).join(','),
    'ventebien,pret,appelFonds'
  );
  // Même sans rendez-vous : la date butoir est indicative, elle ne déclenche aucun rappel.
  const sansRdv = Object.assign({}, d, { rendezVousSignature: '' });
  assert.equal(
    toutesEcheances(sansRdv).map((e) => e.type).join(','),
    'ventebien,pret'
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

// ---- Compte rendu du dernier tour ----
// `resultat.erreurs` était construit depuis toujours sans qu'aucun appelant ne le lise, dans un
// serveur lancé sans fenêtre : un envoi cassé arrêtait les rappels en silence. Ces trois tests
// verrouillent la seule fenêtre sur cet état.

test('executerTacheRappels : consigne le compte rendu du tour (dus, envoyés, déclenchement)', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });

  assert.equal(parametresRepo.lireDernierTour(), null, 'rien tant que la tâche n\'a jamais tourné');

  const envoyerFn = async () => ({ ok: true });
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');

  const tour = parametresRepo.lireDernierTour();
  assert.equal(tour.rappelsDus, 1);
  assert.equal(tour.rappelsEnvoyes, 1);
  assert.deepEqual(tour.erreurs, []);
  assert.equal(tour.declenche, 'automatique');
  assert.match(tour.at, /^\d{4}-\d{2}-\d{2}T/, 'horodatage ISO');

  // Un tour déclenché à la main doit être distinguable, sans quoi l'étude ne saurait pas si la
  // ligne affichée vient de son propre clic ou du minuteur.
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27', 'manuel');
  assert.equal(parametresRepo.lireDernierTour().declenche, 'manuel');

  db.close();
});

test('executerTacheRappels : un envoi en échec ressort dans le compte rendu consigné', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });

  const envoyerFn = async () => ({ ok: false, erreur: 'Invalid login: 535-5.7.8' });
  await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27');

  const tour = parametresRepo.lireDernierTour();
  assert.equal(tour.rappelsEnvoyes, 0);
  assert.equal(tour.erreurs.length, 1);
  assert.match(tour.erreurs[0], /535-5\.7\.8/, 'le message du serveur SMTP doit rester lisible');

  db.close();
});

test('executerTacheRappels : envoi non configuré — aucun compte rendu écrit (ne pas écraser le dernier vrai tour)', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });

  parametresRepo.ecrireReglages({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });
  await executerTacheRappels(depot, db, parametresRepo, async () => ({ ok: true }), '2026-10-27');
  const avant = parametresRepo.lireDernierTour();
  assert.equal(avant.rappelsEnvoyes, 1);

  // L'étude décoche « Activer l'envoi » : le tour suivant sort avant d'avoir rien tenté et ne doit
  // PAS remplacer le compte rendu précédent par une ligne vide qui ne dirait rien.
  parametresRepo.ecrireReglages({ emailActif: false, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr' });
  await executerTacheRappels(depot, db, parametresRepo, async () => ({ ok: true }), '2026-10-28');
  assert.deepEqual(parametresRepo.lireDernierTour(), avant, 'le dernier vrai tour est conservé tel quel');

  db.close();
});

test('executerTacheRappels : les copies Gmail du tour sont mises en ATTENTE, jamais effacées dans la foulée', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({
    emailActif: true, smtpHote: 'smtp.gmail.com', emailPasserelle: 'passerelle@etude.fr',
    copieEmail: 'copie@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' }
  });

  let n = 0;
  const envoyerFn = async () => ({ ok: true, messageId: `<m${++n}@claire>` });
  let appels = 0;
  const effacerFn = async () => { appels++; return { ok: true, effaces: 0 }; };
  const r = await executerTacheRappels(depot, db, parametresRepo, envoyerFn, '2026-10-27', null, { effacerFn });

  // Le flux Power Automate lit ce même message Gmail : l'effacer maintenant l'empêcherait de partir.
  assert.equal(appels, 0);
  assert.equal(r.rappelsEnvoyes, 1);
  assert.equal(r.avertissements.length, 0);
  // Le principal ET la copie à l'étude attendent leur tour.
  assert.equal(parametresRepo.lireCopiesEnAttente().map((c) => c.messageId).join(','), '<m1@claire>,<m2@claire>');

  db.close();
});

test('executerTacheRappels : aucun envoi réussi → rien en attente, aucune tentative d\'effacement', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: '2026-11-11' });
  parametresRepo.ecrireReglages({ emailActif: true, smtpHote: 'smtp.gmail.com', emailPasserelle: 'passerelle@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } });
  let appels = 0;
  await executerTacheRappels(depot, db, parametresRepo, async () => ({ ok: false, erreur: 'x' }), '2026-10-27', null,
    { effacerFn: async () => { appels++; return { ok: true }; } });
  assert.equal(appels, 0);
  assert.equal(parametresRepo.lireCopiesEnAttente().length, 0);
  db.close();
});

test('offre reçue sans rendez-vous : « Fixer le rendez-vous » avant l’appel de fonds, ancré sur le butoir', () => {
  const { toutesEcheances } = require('../src/jobs/rappels');
  const base = { id: 'x', offrePretStatut: 'recue', acte: '2026-11-15', pieces: { renonciationPreemption: 'recue' } };
  assert.equal(toutesEcheances(base).map((e) => e.type).join(','), 'fixerRdv');
  assert.equal(toutesEcheances(base)[0].iso, '2026-11-15');
  // Une fois le rendez-vous placé : l'appel de fonds prend le relais.
  const place = Object.assign({}, base, { rendezVousSignature: '2026-11-10' });
  assert.equal(toutesEcheances(place).map((e) => e.type).join(','), 'appelFonds');
  // Vente préalable encore en attente : pas encore le moment.
  const vp = Object.assign({}, base, { ventebien: '2026-10-20' });
  assert.ok(!toutesEcheances(vp).some((e) => e.type === 'fixerRdv'));
});

test('renonciation au droit de préemption non reçue : pas de « Fixer le rendez-vous »', () => {
  const { toutesEcheances } = require('../src/jobs/rappels');
  const d = { id: 'p', offrePretStatut: 'recue', acte: '2026-11-15', pieces: { renonciationPreemption: 'manquante' } };
  const items = toutesEcheances(d);
  assert.ok(!items.some((e) => e.type === 'fixerRdv'));
  // Rien d'autre à surveiller : l'attente reste visible, ancrée sur la date butoir.
  assert.equal(items.map((e) => e.type).join(','), 'preemption');
  assert.equal(items[0].iso, '2026-11-15');
  // Sans objet : pièce retirée du dossier, ou étude en participation.
  assert.equal(toutesEcheances(Object.assign({}, d, { piecesRetirees: ['renonciationPreemption'] }))[0].type, 'fixerRdv');
  assert.equal(toutesEcheances(Object.assign({}, d, { roleNotaire: 'participant' }))[0].type, 'fixerRdv');
});

test('copropriété : pas d\'attente de préemption, sauf pièce ajoutée à la main et non reçue', () => {
  const { toutesEcheances } = require('../src/jobs/rappels');
  const d = { id: 'c', typeVente: 'copropriete', offrePretStatut: 'recue', acte: '2026-11-15', pieces: {} };
  assert.equal(toutesEcheances(d)[0].type, 'fixerRdv');
  const avec = Object.assign({}, d, { piecesPersonnalisees: [{ cle: 'perso-1', label: 'Purge du droit de préemption' }] });
  assert.equal(toutesEcheances(avec).map((e) => e.type).join(','), 'preemption');
  assert.equal(toutesEcheances(Object.assign({}, avec, { pieces: { 'perso-1': 'recue' } }))[0].type, 'fixerRdv');
});

// --- Alertes « fonds » au collaborateur (28/09) ----------------------------------------------
const { alertesFondsDues, texteAlerteFonds, jourSemaine } = require('../src/jobs/rappels');

function dossierFonds(extra) {
  return Object.assign({
    id: 'f1', nom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN',
    appelFonds: '2026-10-01', echeancesValidees: { appelFonds: true }
  }, extra || {});
}
const recus = (total, attendu) => ({ total, attendu, recus: [], verifieLe: '2026-10-05T08:00:00Z' });

test('fonds : jourSemaine lit la date sans décalage (2026-10-09 est un vendredi)', () => {
  assert.equal(jourSemaine('2026-10-09'), 5);
  assert.equal(jourSemaine('2026-10-12'), 1);
});

test('fonds : tous reçus → une seule alerte par dossier, rien si la réception est déjà confirmée', () => {
  const d = dossierFonds({ rendezVousSignature: '2026-10-20', fondsRecus: recus(150000, 150000) });
  const dus = alertesFondsDues([d], '2026-10-06', new Set());
  assert.equal(dus.length, 1);
  assert.equal(dus[0].genre, 'complets');
  assert.match(texteAlerteFonds(dus[0]), /Tous les fonds sont reçus pour le dossier VTE - DUPONT \/ MARTIN \(150\.000,00\s€\)/);
  assert.equal(alertesFondsDues([d], '2026-10-06', new Set(['f1:fonds-complets'])).length, 0);
  assert.equal(alertesFondsDues([Object.assign({}, d, { receptionFondsConfirmeeLe: '2026-10-06' })], '2026-10-06', new Set()).length, 0);
  // Étude 05/10 : tous les fonds reçus préviennent même si l'appel de fonds n'a pas été noté envoyé…
  assert.equal(alertesFondsDues([dossierFonds({ appelFonds: '', echeancesValidees: {}, fondsRecus: recus(1, 1) })], '2026-10-06', new Set())[0].genre, 'complets');
  // … mais des fonds incomplets, eux, ne disent rien tant que l'appel de fonds n'est pas parti.
  assert.equal(alertesFondsDues([dossierFonds({ appelFonds: '', echeancesValidees: {}, rendezVousSignature: '2026-10-08', fondsRecus: recus(1000, 150000) })], '2026-10-06', new Set()).length, 0);
});

test('fonds validés à la main (06/10, compte CDC) : alerte « complets » même sans reçu lu, texte sans montant', () => {
  const d = dossierFonds({ rendezVousSignature: '2026-10-20', fondsRecus: recus(1000, 150000), fondsValidesLe: '2026-10-06', fondsValidesPar: 'Julie VASSELIN' });
  const dus = alertesFondsDues([d], '2026-10-06', new Set());
  assert.equal(dus.length, 1);
  assert.equal(dus[0].genre, 'complets');
  assert.match(texteAlerteFonds(dus[0]), /Tous les fonds sont reçus .* \(validés à la main, arrivés sur le compte de l’étude\)/);
  const sansRecu = alertesFondsDues([dossierFonds({ rendezVousSignature: '2026-10-20', fondsValidesLe: '2026-10-06' })], '2026-10-06', new Set());
  assert.equal(sansRecu[0].genre, 'complets');
});

test('fonds incomplets : à J-3, le jour de la relance au client (jeudi → lundi précédent)', () => {
  const d = dossierFonds({ rendezVousSignature: '2026-10-15', fondsRecus: recus(100000, 150000) }); // jeudi
  assert.equal(alertesFondsDues([d], '2026-10-09', new Set()).length, 0, 'vendredi, J-6 : trop tôt');
  const dus = alertesFondsDues([d], '2026-10-12', new Set()); // lundi, J-3
  assert.equal(dus.length, 1);
  assert.equal(dus[0].reminderKey, 'fonds-incomplets:2026-10-15');
  const texte = texteAlerteFonds(dus[0]);
  assert.match(texte, /Fonds pas encore reçus en entier/);
  assert.match(texte, /100\.000,00\s€ reçus sur 150\.000,00\s€, il manque 50\.000,00\s€/);
  assert.match(texte, /jeudi 15 octobre/);
  // Une seule fois par date de rendez-vous.
  assert.equal(alertesFondsDues([d], '2026-10-13', new Set(['f1:fonds-incomplets:2026-10-15'])).length, 0);
});

test('fonds incomplets : J-3 un week-end (rendez-vous mardi ou mercredi) → alerte le vendredi, jamais le week-end', () => {
  const lundi = dossierFonds({ rendezVousSignature: '2026-10-12' });
  const mardi = dossierFonds({ id: 'f2', rendezVousSignature: '2026-10-13' });
  const mercredi = dossierFonds({ id: 'f3', rendezVousSignature: '2026-10-14' });
  assert.equal(alertesFondsDues([lundi, mardi, mercredi], '2026-10-08', new Set()).length, 0, 'jeudi : pas encore');
  const vendredi = alertesFondsDues([lundi, mardi, mercredi], '2026-10-09', new Set());
  assert.equal(vendredi.length, 3);
  assert.match(texteAlerteFonds(vendredi[0]), /pas encore été vérifiés dans CLAIRE/);
  assert.equal(alertesFondsDues([lundi, mardi], '2026-10-10', new Set()).length, 0, 'samedi');
  assert.equal(alertesFondsDues([lundi, mardi], '2026-10-11', new Set()).length, 0, 'dimanche');
  // Vendredi manqué (serveur éteint) : rattrapé le lundi, avant le rendez-vous du mardi.
  assert.equal(alertesFondsDues([mardi], '2026-10-12', new Set()).length, 1);
  // Rendez-vous passé : plus rien.
  assert.equal(alertesFondsDues([lundi], '2026-10-13', new Set()).length, 0);
});

test('fonds : à 2 € près ; un excédent n’est jamais « tous les fonds reçus »', () => {
  const pres = dossierFonds({ rendezVousSignature: '2026-10-20', fondsRecus: recus(150002, 150000) });
  assert.equal(alertesFondsDues([pres], '2026-10-06', new Set())[0].genre, 'complets');
  const peuTrop = dossierFonds({ rendezVousSignature: '2026-10-07', fondsRecus: recus(150030, 150000) });
  assert.equal(alertesFondsDues([peuTrop], '2026-10-05', new Set())[0].genre, 'incomplets');
  const trop = dossierFonds({ rendezVousSignature: '2026-10-07', fondsRecus: recus(405977.91, 331158.76) });
  const dus = alertesFondsDues([trop], '2026-10-05', new Set());
  assert.equal(dus.length, 1);
  assert.equal(dus[0].genre, 'incomplets');
  assert.match(texteAlerteFonds(dus[0]), /405\.977,91\s€ reçus pour 331\.158,76\s€ attendus : l'écart est à vérifier/);
});

test('libelleDossier : type d’affaire devant le nom, sans doublon (miroir de libelleDossierAffiche)', () => {
  const { libelleDossier } = require('../src/jobs/rappels');
  assert.equal(libelleDossier({ nom: 'DURAND / MARTIN' }), 'VTE - DURAND / MARTIN');
  assert.equal(libelleDossier({ nom: 'LEROY', typeAffaire: 'succession' }), 'SUCC - LEROY');
  assert.equal(libelleDossier({ nom: 'VTE - DURAND' }), 'VTE - DURAND');
});

test('SAFER en attente (miroir de echeancesPlanning) : « Délai SAFER » daté, sans rappel, pas de « Fixer le rendez-vous »', () => {
  const { toutesEcheances, echeanceSaferDossier, calculerRappelsDus } = require('../src/jobs/rappels');
  const d = {
    id: 's1', nom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', typeVente: 'maison', sansPret: true, acte: '2026-12-20',
    pieces: { renonciationPreemption: 'recue', 'perso-safer': 'manquante' },
    piecesPersonnalisees: [{ cle: 'perso-safer', label: 'Réponse SAFER' }],
    authentic: { safer: { notifieeLe: '2026-09-01', priseEnCompteLe: '2026-09-05' } }
  };
  assert.equal(toutesEcheances(d).map(e => `${e.type}:${e.iso}`).join(','), 'safer:2026-11-05');
  assert.equal(echeanceSaferDossier(Object.assign({}, d, { authentic: { safer: Object.assign({}, d.authentic.safer, { delaiManuel: 'rapide' }) } })), '2026-10-05');
  assert.equal(echeanceSaferDossier(Object.assign({}, d, { authentic: { safer: Object.assign({}, d.authentic.safer, { delaiManuel: 'tres_rapide' }) } })), '2026-09-13');
  // Aucun rappel Teams sur ce délai, même à J-15 ou J-7.
  assert.equal(calculerRappelsDus([d], '2026-10-21', new Set()).length, 0);
  assert.equal(calculerRappelsDus([d], '2026-10-29', new Set()).length, 0);
  // Non-préemption acquise : retour à « Fixer le rendez-vous ».
  const levee = Object.assign({}, d, { authentic: { safer: Object.assign({}, d.authentic.safer, { decision: 'non_preemption' }) } });
  assert.equal(toutesEcheances(levee).map(e => e.type).join(','), 'fixerRdv');
});

test('succession (miroir de echeancesPlanning) : seulement la signature placée et les échéances ajoutées', () => {
  const { toutesEcheances } = require('../src/jobs/rappels');
  const d = { id: 's', nom: 'DUPONT Jean', typeAffaire: 'succession', sansPret: true, acte: '2026-12-01', autres: [{ label: 'Déclaration de succession', date: '2027-01-15' }] };
  assert.equal(toutesEcheances(d).map(e => `${e.type}:${e.iso}`).join(','), 'autre-0:2027-01-15');
  assert.equal(toutesEcheances(Object.assign({}, d, { rendezVousSignature: '2026-11-05' })).map(e => e.type).join(','), 'rendezVousSignature,autre-0');
});

test('prêt ancré sur la date butoir : son rappel n’empêche pas celui de la vraie date saisie ensuite (relecture 14/10)', () => {
  const d = { id: 'd9', responsable: 'Bastien ANGLUMENT', nom: 'A / B', acte: '2026-12-15', pieces: {}, echeancesValidees: {} };
  const premier = calculerRappelsDus([d], '2026-11-30', new Set());
  assert.equal(premier.length, 1);
  assert.equal(premier[0].reminderKey, 'pret:15@2026-12-15');
  const envoyes = new Set([`d9:${premier[0].reminderKey}`]);
  const ensuite = calculerRappelsDus([{ ...d, pret: '2026-11-25' }], '2026-11-10', envoyes);
  assert.equal(ensuite.length, 1);
  assert.equal(ensuite[0].reminderKey, 'pret:15');
});

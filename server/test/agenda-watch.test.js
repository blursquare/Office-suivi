'use strict';

// Tour périodique de lecture de l'agenda de l'office par EWS (voir src/agendaWatch.js). Le plus
// important à couvrir : ne JAMAIS écraser une date déjà connue (saisie manuelle ou tour précédent),
// ne jamais planter le tour entier si Exchange est injoignable, et ne jamais représenter des
// identifiants refusés (verrouillage du compte de messagerie).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  appliquerDetectionsAgenda, executerTourSurveillanceAgenda, executerEtEnregistrerTourAgenda, dateDuJourParis,
  reinitialiserDisjoncteurAgenda, lectureAgendaSuspendue
} = require('../src/agendaWatch');
const { ouvrirDb } = require('../src/db');
const { creerDepot } = require('../src/dossiersRepo');
const { creerRepoParametres } = require('../src/parametresRepo');

const REGLAGES_EXCHANGE = {
  actif: true, url: 'https://mail.exemple.test/EWS/Exchange.asmx', email: 'bastien@etude.test',
  motDePasse: 'mdp-secret', calendrierPartage: 'sophie@etude.test'
};

// Réponse FindItem d'Exchange pour une liste de rendez-vous (forme réelle : UTC, ItemId auto-fermant).
function reponseFindItem(items, options) {
  const o = options || {};
  const blocs = (items || []).map((it, i) => '<t:CalendarItem>'
    + `<t:ItemId Id="${it.id || 'id' + i}" ChangeKey="ck"/>`
    + `<t:Subject>${it.sujet || ''}</t:Subject>`
    + (it.categories ? `<t:Categories>${it.categories.map((c) => `<t:String>${c}</t:String>`).join('')}</t:Categories>` : '')
    + `<t:Start>${it.start}</t:Start><t:End>${it.end || it.start}</t:End>`
    + `<t:IsAllDayEvent>${it.allDay ? 'true' : 'false'}</t:IsAllDayEvent>`
    + `<t:IsCancelled>${it.cancelled ? 'true' : 'false'}</t:IsCancelled>`
    + `<t:Location>${it.lieu || ''}</t:Location>`
    + '</t:CalendarItem>').join('');
  return '<?xml version="1.0"?><s:Envelope><s:Body><m:FindItemResponse><m:ResponseMessages>'
    + '<m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode>'
    + `<m:RootFolder TotalItemsInView="${(items || []).length}" IncludesLastItemInRange="${o.tronque ? 'false' : 'true'}"><t:Items>`
    + blocs + '</t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse></s:Body></s:Envelope>';
}

// Faux transport EWS : une réponse par tranche lue (la dernière est répétée), chaque appel noté.
function fauxPoster(reponses, appels) {
  let n = 0;
  return (options, rappel) => {
    if (appels) appels.push(options);
    const r = reponses[Math.min(n, reponses.length - 1)];
    n++;
    setImmediate(() => rappel(null, r));
  };
}
const ok = (items, options) => ({ statusCode: 200, body: reponseFindItem(items, options) });

test('appliquerDetectionsAgenda : renseigne appelFonds et projetEnvoye, journalise, marque validé', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });

  const detections = [
    { dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-14', reference: 'DUPONT / MARTIN - Appel de fonds', appelFonds: true, projetEnvoye: false }
  ];
  // La date retenue est celle du JOUR DE LA DÉTECTION, pas celle du rendez-vous (2026-10-14).
  const resultat = appliquerDetectionsAgenda(depot, detections, '2026-09-25');
  assert.equal(resultat.misAJour.length, 1);
  assert.equal(resultat.misAJour[0].action, 'appelFonds');

  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, '2026-09-25');
  assert.equal(d.detectionsAgenda.appelFonds, '2026-09-25');
  assert.equal(d.echeancesValidees.appelFonds, true);
  assert.equal(d.historique.length, 1);
  assert.match(d.historique[0].texte, /Envoi appel de fonds relevé dans l.agenda/);
  db.close();
});

test('appliquerDetectionsAgenda : n\'ecrase JAMAIS une date deja connue', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', appelFonds: '2026-09-01' });

  const detections = [
    { dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-14', reference: 'DUPONT / MARTIN', appelFonds: true, projetEnvoye: false }
  ];
  const resultat = appliquerDetectionsAgenda(depot, detections);
  assert.equal(resultat.misAJour.length, 0);
  assert.equal(resultat.dejaRenseignes.length, 1);

  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, '2026-09-01', 'la date deja saisie ne doit jamais etre remplacee');
  db.close();
});

test('appliquerDetectionsAgenda : une action deja relevee n\'est plus jamais retraitee', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  const det = [{ dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-14', reference: 'DUPONT / MARTIN', appelFonds: true, projetEnvoye: false }];
  appliquerDetectionsAgenda(depot, det, '2026-09-25');
  // L'étude efface la date à la main : le tour suivant ne doit PAS la réécrire à la date du jour.
  const d = depot.trouverParId('d1');
  d.appelFonds = '';
  depot.remplacer('d1', d);
  const second = appliquerDetectionsAgenda(depot, det, '2026-09-30');
  assert.equal(second.misAJour.length, 0);
  assert.equal(second.dejaRenseignes.length, 0);
  assert.equal(depot.trouverParId('d1').appelFonds, '');
  assert.equal(depot.trouverParId('d1').historique.length, 1);
  db.close();
});

test('appliquerDetectionsAgenda : une date deja saisie a la main pose le repere sans etre ecrasee', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', appelFonds: '2026-09-01' });
  const det = [{ dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-14', reference: 'DUPONT / MARTIN', appelFonds: true, projetEnvoye: false }];
  appliquerDetectionsAgenda(depot, det, '2026-09-25');
  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, '2026-09-01');
  assert.equal(d.detectionsAgenda.appelFonds, '2026-09-25');
  // Même vidée ensuite, elle ne sera plus réécrite par l'agenda.
  d.appelFonds = '';
  depot.remplacer('d1', d);
  appliquerDetectionsAgenda(depot, det, '2026-09-30');
  assert.equal(depot.trouverParId('d1').appelFonds, '');
  db.close();
});

test('appliquerDetectionsAgenda : un dossier archive n\'est jamais touche', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', archive: true });

  const detections = [
    { dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-14', reference: 'DUPONT / MARTIN', appelFonds: true, projetEnvoye: false }
  ];
  appliquerDetectionsAgenda(depot, detections);
  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, undefined);
  db.close();
});

test('appliquerDetectionsAgenda : sans correspondance, liste dans sansCorrespondance sans rien ecrire', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const detections = [
    { dossierId: null, dossierNom: null, dateIso: '2026-10-14', reference: 'INCONNU', resume: 'VTE - INCONNU', appelFonds: true, projetEnvoye: false }
  ];
  const resultat = appliquerDetectionsAgenda(depot, detections);
  assert.equal(resultat.sansCorrespondance.length, 1);
  assert.equal(resultat.misAJour.length, 0);
  db.close();
});

test('appliquerDetectionsAgenda : deux detections separees pour le meme dossier ecrivent bien les deux champs', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });

  const detections = [
    { dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-01', reference: 'DUPONT / MARTIN - Appel de fonds', appelFonds: true, projetEnvoye: false },
    { dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-10', reference: 'DUPONT / MARTIN - projet envoye', appelFonds: false, projetEnvoye: true }
  ];
  appliquerDetectionsAgenda(depot, detections, '2026-09-25');
  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, '2026-09-25');
  assert.equal(d.projetEnvoye, '2026-09-25');
  assert.equal(d.historique.length, 2);
  db.close();
});

test('executerTourSurveillanceAgenda : connexion non configurée → erreur, aucun appel, jamais un plantage', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const appels = [];
  const resultat = await executerTourSurveillanceAgenda(depot, { ...REGLAGES_EXCHANGE, motDePasse: '' }, { poster: fauxPoster([ok([])], appels) });
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /pas configurée/);
  assert.equal(appels.length, 0);
  const inactif = await executerTourSurveillanceAgenda(depot, { ...REGLAGES_EXCHANGE, actif: false }, { poster: fauxPoster([ok([])], appels) });
  assert.equal(inactif.ok, false);
  assert.equal(appels.length, 0);
  db.close();
});

test('executerTourSurveillanceAgenda : bout en bout, calendrier de Sophie lu par tranches, dossier mis à jour', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  const appels = [];
  const items = [
    { sujet: 'VTE - DUPONT / MARTIN', lieu: 'BA Appel de fonds envoyé', start: '2099-10-14T08:00:00Z', end: '2099-10-14T09:00:00Z', categories: ['Catégorie Verte'] },
    { sujet: 'Congés JV', start: '2099-10-19T22:00:00Z', end: '2099-10-22T22:00:00Z', allDay: true }
  ];
  const resultat = await executerTourSurveillanceAgenda(depot, REGLAGES_EXCHANGE, { poster: fauxPoster([ok(items), ok([])], appels) });
  assert.equal(resultat.ok, true, resultat.erreur);
  assert.equal(appels.length, 3, 'trois tranches de 62 jours');
  assert.match(appels[0].body, /<t:EmailAddress>sophie@etude\.test<\/t:EmailAddress>/);
  assert.match(appels[0].body, /<m:CalendarView StartDate="[^"]+" EndDate="[^"]+"\/>/);
  assert.equal(appels[0].password, 'mdp-secret');
  assert.equal(resultat.dossiersVerifies, 1);
  assert.equal(resultat.evenementsLus, 2);
  assert.equal(resultat.misAJour.length, 2, 'appel de fonds + rendez-vous de signature');
  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, dateDuJourParis());
  assert.equal(d.rendezVousSignature, '2099-10-14');
  assert.equal(d.rendezVousSignatureHeure, '10:00');
  assert.equal(d.rendezVousSignatureCategories.join('|'), 'Catégorie Verte');
  assert.equal(resultat.absences.length, 1);
  assert.equal(resultat.absences[0].debut, '2099-10-20');
  assert.equal(resultat.absences[0].fin, '2099-10-22');
  assert.equal(resultat.categories.join('|'), 'Catégorie Verte');
  db.close();
});

test('executerTourSurveillanceAgenda : un rendez-vous annulé ou passé ne déclenche rien', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  const items = [
    { sujet: 'VTE - DUPONT', lieu: 'BA Appel de fonds envoyé', start: '2000-01-01T08:00:00Z' },
    { sujet: 'VTE - DUPONT', lieu: 'BA Appel de fonds envoyé', start: '2099-10-14T08:00:00Z', cancelled: true }
  ];
  const resultat = await executerTourSurveillanceAgenda(depot, REGLAGES_EXCHANGE, { poster: fauxPoster([ok(items), ok([])]) });
  assert.equal(resultat.ok, true);
  assert.equal(resultat.misAJour.length, 0);
  assert.equal(depot.trouverParId('d1').appelFonds || '', '');
  db.close();
});

test('executerTourSurveillanceAgenda : un même rendez-vous rendu par deux tranches n’est compté qu’une fois', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const conges = { id: 'abs1', sujet: 'Congés JS', start: '2099-10-19T22:00:00Z', end: '2099-10-29T23:00:00Z', allDay: true };
  const resultat = await executerTourSurveillanceAgenda(depot, REGLAGES_EXCHANGE, { poster: fauxPoster([ok([conges]), ok([conges]), ok([])]) });
  assert.equal(resultat.evenementsLus, 1);
  assert.equal(resultat.absences.length, 1);
  db.close();
});

test('executerTourSurveillanceAgenda : liste coupée par Exchange → rien n’est appliqué', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  const items = [{ sujet: 'VTE - DUPONT', lieu: 'BA Appel de fonds envoyé', start: '2099-10-14T08:00:00Z' }];
  const resultat = await executerTourSurveillanceAgenda(depot, REGLAGES_EXCHANGE, { poster: fauxPoster([ok(items, { tronque: true })]) });
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /tous les rendez-vous/);
  assert.equal(depot.trouverParId('d1').appelFonds || '', '');
  db.close();
});

test('executerTourSurveillanceAgenda : calendrier partagé inaccessible → message qui le dit', async () => {
  const depot = { tousActifs: () => [] };
  const corps = '<m:FindItemResponseMessage ResponseClass="Error"><m:ResponseCode>ErrorAccessDenied</m:ResponseCode></m:FindItemResponseMessage>';
  const resultat = await executerTourSurveillanceAgenda(depot, REGLAGES_EXCHANGE, { poster: fauxPoster([{ statusCode: 200, body: corps }]) });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.identifiantsRefuses, false);
  assert.match(resultat.erreur, /n'a pas accès au calendrier partagé \(ErrorAccessDenied\)/);
});

test('identifiants refusés : un seul essai, lecture automatique suspendue jusqu’au changement des identifiants', async () => {
  reinitialiserDisjoncteurAgenda();
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  parametresRepo.ecrireReglagesExchange(REGLAGES_EXCHANGE);
  const appels = [];
  const refus = fauxPoster([{ statusCode: 401, body: '' }], appels);

  const r1 = await executerEtEnregistrerTourAgenda(depot, parametresRepo, { poster: refus });
  assert.equal(r1.ok, false);
  assert.equal(r1.identifiantsRefuses, true);
  assert.equal(appels.length, 1, 'arrêt au premier refus, jamais les tranches suivantes');
  const tour = parametresRepo.lireDernierTourAgenda();
  assert.equal(tour.identifiantsRefuses, true);
  assert.doesNotMatch(JSON.stringify(tour), /mdp-secret/);
  assert.equal(lectureAgendaSuspendue(parametresRepo.lireReglagesExchange()), true);

  // Tour automatique suivant : aucun appel, rien n'est réécrit.
  const r2 = await executerEtEnregistrerTourAgenda(depot, parametresRepo, { poster: refus });
  assert.equal(r2.suspendu, true);
  assert.equal(appels.length, 1);

  // « Tester maintenant » : un essai, demandé par une personne.
  await executerEtEnregistrerTourAgenda(depot, parametresRepo, { poster: refus }, 'manuel');
  assert.equal(appels.length, 2);

  // Nouveau mot de passe enregistré : la lecture automatique reprend d'elle-même.
  parametresRepo.ecrireReglagesExchange({ ...REGLAGES_EXCHANGE, motDePasse: 'nouveau' });
  assert.equal(lectureAgendaSuspendue(parametresRepo.lireReglagesExchange()), false);
  const r3 = await executerEtEnregistrerTourAgenda(depot, parametresRepo, { poster: fauxPoster([ok([])], appels) });
  assert.equal(r3.ok, true);
  assert.equal(parametresRepo.lireDernierTourAgenda().identifiantsRefuses, false);
  reinitialiserDisjoncteurAgenda();
  db.close();
});

test('executerEtEnregistrerTourAgenda : un tour réussi met à jour le compte rendu (automatique par défaut)', async () => {
  reinitialiserDisjoncteurAgenda();
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  parametresRepo.ecrireReglagesExchange(REGLAGES_EXCHANGE);
  depot.creer({ id: 'd1', nom: 'DURAND / LEROY' });
  const items = [{ sujet: 'VTE - DURAND / LEROY - projet envoye', start: '2099-10-19T22:00:00Z', end: '2099-10-20T22:00:00Z', allDay: true }];
  const retour = await executerEtEnregistrerTourAgenda(depot, parametresRepo, { poster: fauxPoster([ok(items), ok([])]) });
  assert.equal(retour.calendrier, 'sophie@etude.test');
  const dernierTour = parametresRepo.lireDernierTourAgenda();
  assert.equal(dernierTour.ok, true);
  assert.equal(dernierTour.declenche, 'automatique');
  assert.equal(dernierTour.calendrier, 'sophie@etude.test');
  assert.equal(dernierTour.evenementsLus, 1);
  assert.equal(dernierTour.misAJour.length, 1);
  assert.equal(depot.trouverParId('d1').projetEnvoye, dateDuJourParis());
  db.close();
});

test('executerEtEnregistrerTourAgenda : persiste le compte rendu, y compris sans connexion configurée', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  await executerEtEnregistrerTourAgenda(depot, parametresRepo, { poster: fauxPoster([ok([])]) }, 'manuel');
  const dernierTour = parametresRepo.lireDernierTourAgenda();
  assert.equal(dernierTour.ok, false);
  assert.equal(dernierTour.declenche, 'manuel');
  db.close();
});

test('rendez-vous de signature : écrit si vide, suit un déplacement, respecte une saisie manuelle', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  depot.creer({ id: 'd2', nom: 'DURAND', rendezVousSignature: '2099-12-01' });
  const det = (dossierId, dateIso) => ({ dossierId, dossierNom: 'x', reference: 'DUPONT', dateIso, rendezVous: true, appelFonds: false, projetEnvoye: false });

  // Deux rendez-vous pour le même dossier : le plus proche l'emporte.
  let r = appliquerDetectionsAgenda(depot, [det('d1', '2099-11-20'), det('d1', '2099-11-10'), det('d2', '2099-11-15')], '2026-09-25');
  assert.equal(depot.trouverParId('d1').rendezVousSignature, '2099-11-10');
  assert.equal(depot.trouverParId('d1').detectionsAgenda.rendezVousSignature, '2099-11-10');
  assert.equal(r.misAJour.filter((m) => m.action === 'rendezVousSignature').length, 1);
  // d2 : date saisie à la main, jamais écrasée, écart signalé.
  assert.equal(depot.trouverParId('d2').rendezVousSignature, '2099-12-01');
  assert.equal(r.dejaRenseignes[0].dateFiche, '2099-12-01');

  // Même date au tour suivant : rien.
  r = appliquerDetectionsAgenda(depot, [det('d1', '2099-11-10')], '2026-09-26');
  assert.equal(r.misAJour.length, 0);

  // Rendez-vous déplacé dans l'agenda : la date suit.
  r = appliquerDetectionsAgenda(depot, [det('d1', '2099-11-17')], '2026-09-27');
  assert.equal(depot.trouverParId('d1').rendezVousSignature, '2099-11-17');
  assert.equal(r.misAJour[0].ancienneDate, '2099-11-10');
  assert.match(depot.trouverParId('d1').historique.slice(-1)[0].texte, /déplacé/);

  // Corrigée à la main ensuite : l'agenda ne la touche plus.
  const d = depot.trouverParId('d1'); d.rendezVousSignature = '2099-11-18'; depot.remplacer('d1', d);
  appliquerDetectionsAgenda(depot, [det('d1', '2099-11-17')], '2026-09-28');
  assert.equal(depot.trouverParId('d1').rendezVousSignature, '2099-11-18');
  db.close();
});

test('rendez-vous de signature : un dossier archivé n\'est jamais touché', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT', archive: true });
  appliquerDetectionsAgenda(depot, [{ dossierId: 'd1', dateIso: '2099-11-10', rendezVous: true, reference: 'DUPONT' }], '2026-09-25');
  assert.equal(depot.trouverParId('d1').rendezVousSignature || '', '');
  db.close();
});

test('rendez-vous de signature : heure et lieu de l’agenda posés, suivis le même jour', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  const det = (heure, lieu) => ({ dossierId: 'd1', dossierNom: 'x', reference: 'DUPONT', dateIso: '2099-11-10', rendezVous: true, appelFonds: false, projetEnvoye: false, heure, heureFin: '11:30', lieu });
  appliquerDetectionsAgenda(depot, [det('10:30', 'Office')], '2026-09-25');
  let d = depot.trouverParId('d1');
  assert.equal(d.rendezVousSignatureHeure, '10:30');
  assert.equal(d.rendezVousSignatureHeureFin, '11:30');
  assert.equal(d.rendezVousSignatureLieu, 'Office');
  // Avancé le même jour : l'heure suit, la date ne bouge pas.
  appliquerDetectionsAgenda(depot, [det('09:00', 'Visio')], '2026-09-26');
  d = depot.trouverParId('d1');
  assert.equal(d.rendezVousSignature, '2099-11-10');
  assert.equal(d.rendezVousSignatureHeure, '09:00');
  assert.equal(d.rendezVousSignatureLieu, 'Visio');
  db.close();
});

test('Rendez-vous retiré de l’agenda : signalé une fois, date conservée, repère levé à son retour', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  const rdv = [{ dossierId: 'd1', reference: 'VTE - DUPONT', rendezVous: true, dateIso: '2099-10-03' }];
  appliquerDetectionsAgenda(depot, rdv, '2099-09-25');
  assert.equal(depot.trouverParId('d1').rendezVousSignature, '2099-10-03');
  // Tour suivant : l'événement n'est plus dans l'agenda.
  appliquerDetectionsAgenda(depot, [], '2099-09-26');
  let d = depot.trouverParId('d1');
  assert.equal(d.rendezVousSignature, '2099-10-03');
  assert.equal(d.historique.filter(h => /retiré de l’agenda/.test(h.texte)).length, 1);
  appliquerDetectionsAgenda(depot, [], '2099-09-27');
  d = depot.trouverParId('d1');
  assert.equal(d.historique.filter(h => /retiré de l’agenda/.test(h.texte)).length, 1);
  // Il revient : le repère est levé.
  appliquerDetectionsAgenda(depot, rdv, '2099-09-28');
  assert.equal(depot.trouverParId('d1').detectionsAgenda.rendezVousDisparu, undefined);
});

test('Rendez-vous saisi à la main : jamais signalé comme retiré de l’agenda', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', rendezVousSignature: '2099-10-03' });
  appliquerDetectionsAgenda(depot, [], '2099-09-26');
  assert.equal((depot.trouverParId('d1').historique || []).length, 0);
});

test('rendez-vous supprimé dans CLAIRE : le flux encore à jour ne le remet pas, une autre date oui', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT', rendezVousSignature: '', detectionsAgenda: { rendezVousRetire: '2099-11-10' } });
  const det = (dateIso) => ({ dossierId: 'd1', dossierNom: 'x', reference: 'DUPONT', dateIso, rendezVous: true, appelFonds: false, projetEnvoye: false, categories: ['Catégorie Verte'] });
  appliquerDetectionsAgenda(depot, [det('2099-11-10')], '2026-09-25');
  assert.equal(depot.trouverParId('d1').rendezVousSignature, '', 'la date retirée ne revient pas');
  appliquerDetectionsAgenda(depot, [det('2099-11-20')], '2026-09-25');
  const d = depot.trouverParId('d1');
  assert.equal(d.rendezVousSignature, '2099-11-20');
  assert.equal(d.detectionsAgenda.rendezVousRetire, undefined, 'repère levé par la nouvelle date');
  assert.equal(d.rendezVousSignatureCategories.join(','), 'Catégorie Verte', 'catégorie de couleur conservée');
  db.close();
});

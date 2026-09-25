'use strict';

// Tour périodique de lecture de l'agenda de l'office (voir src/agendaWatch.js). Le plus important
// à couvrir : ne JAMAIS écraser une date déjà connue (saisie manuelle ou tour précédent), et ne
// jamais planter le tour entier si le flux est injoignable ou mal formé.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  appliquerDetectionsAgenda, executerTourSurveillanceAgenda, executerEtEnregistrerTourAgenda, dateDuJourParis
} = require('../src/agendaWatch');
const { ouvrirDb } = require('../src/db');
const { creerDepot } = require('../src/dossiersRepo');
const { creerRepoParametres } = require('../src/parametresRepo');

function fauxFetch(reponses) {
  let appel = 0;
  return async () => {
    const r = reponses[Math.min(appel, reponses.length - 1)];
    appel++;
    return r;
  };
}

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

test('executerTourSurveillanceAgenda : sans URL, renvoie une erreur sans jamais planter', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const resultat = await executerTourSurveillanceAgenda(depot, '', fauxFetch([]));
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /Aucune adresse/);
  db.close();
});

test('executerTourSurveillanceAgenda : une reponse HTTP en erreur est rapportee proprement', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const resultat = await executerTourSurveillanceAgenda(depot, 'https://example.test/agenda.ics', fauxFetch([{ ok: false, status: 404 }]));
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /404/);
  db.close();
});

test('executerTourSurveillanceAgenda : bout en bout avec un vrai flux et un vrai depot', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:VTE - DUPONT / MARTIN - Appel de fonds',
    'DTSTART:20261014',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const fetchFn = fauxFetch([{ ok: true, status: 200, text: async () => ics }]);
  const resultat = await executerTourSurveillanceAgenda(depot, 'https://example.test/agenda.ics', fetchFn);
  assert.equal(resultat.ok, true);
  assert.equal(resultat.dossiersVerifies, 1);
  assert.equal(resultat.misAJour.length, 1);
  assert.equal(depot.trouverParId('d1').appelFonds, dateDuJourParis());
  db.close();
});

test('executerEtEnregistrerTourAgenda : persiste le compte rendu, y compris quand l\'URL manque', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  await executerEtEnregistrerTourAgenda(depot, parametresRepo, fauxFetch([]), 'manuel');
  const dernierTour = parametresRepo.lireDernierTourAgenda();
  assert.equal(dernierTour.ok, false);
  assert.equal(dernierTour.declenche, 'manuel');
  db.close();
});

test('executerEtEnregistrerTourAgenda : un tour reussi met a jour le compte rendu (automatique par defaut)', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  parametresRepo.ecrireReglagesAgenda({ icsUrl: 'https://example.test/agenda.ics' });
  depot.creer({ id: 'd1', nom: 'DURAND / LEROY' });
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:VTE - DURAND / LEROY - projet envoye\r\nDTSTART:20261020\r\nEND:VEVENT\r\nEND:VCALENDAR';
  await executerEtEnregistrerTourAgenda(depot, parametresRepo, fauxFetch([{ ok: true, status: 200, text: async () => ics }]));
  const dernierTour = parametresRepo.lireDernierTourAgenda();
  assert.equal(dernierTour.ok, true);
  assert.equal(dernierTour.declenche, 'automatique');
  assert.equal(dernierTour.misAJour.length, 1);
  assert.equal(depot.trouverParId('d1').projetEnvoye, dateDuJourParis());
  db.close();
});

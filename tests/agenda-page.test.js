'use strict';
// Page Agenda (étude, 30/09) : grille de la semaine, calendrier du mois, et l'agenda « intelligent »
// — probabilité de tenue d'une signature, créneaux proposés, gestes de relation client. Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const TOUS_RECUS = { diagnosticsTechniques: 'recue', erp: 'recue', titrePropriete: 'recue', certificatUrbanisme: 'recue', renonciationPreemption: 'recue', avisTaxeFonciere: 'recue', certificatAlignement: 'recue', certificatNumerotage: 'recue', reponseAssainissement: 'recue' };

test('joursSemaineAgenda : lundi → samedi', () => {
  assert.equal(app.joursSemaineAgenda('2026-09-28').join(','), '2026-09-28,2026-09-29,2026-09-30,2026-10-01,2026-10-02,2026-10-03');
});

test('disposerEvenementsJour : position dans la grille 7 h – 20 h et colonnes des chevauchements', () => {
  const places = app.disposerEvenementsJour([
    { sujet: 'A', date: '2026-10-01', heure: '09:00', heureFin: '09:30' },
    { sujet: 'B', date: '2026-10-01', heure: '09:15', heureFin: '10:15' },
    { sujet: 'C', date: '2026-10-01', heure: '13:30', heureFin: '14:00' },
    { sujet: 'Tôt', date: '2026-10-01', heure: '06:00', heureFin: '07:30' },
    { sujet: 'Journée', date: '2026-10-01', journeeEntiere: true },
    { sujet: 'Autre jour', date: '2026-10-02', heure: '09:00' }
  ], '2026-10-01');
  const par = (s) => places.find(p => p.e.sujet === s);
  assert.equal(places.length, 4);
  assert.equal(Math.round(par('A').haut * 780 / 100), 120, '9 h = 120 min après 7 h');
  assert.equal(`${par('A').colonne}/${par('A').colonnes}`, '0/2');
  assert.equal(`${par('B').colonne}/${par('B').colonnes}`, '1/2');
  assert.equal(`${par('C').colonne}/${par('C').colonnes}`, '0/1');
  assert.equal(par('Tôt').horsPlage, true);
  assert.equal(par('Tôt').haut, 0);
});

test('grilleMoisAgenda : semaines complètes du lundi au dimanche', () => {
  const g = app.grilleMoisAgenda('2026-10');
  assert.equal(g[0][0], '2026-09-28');
  assert.equal(g[g.length - 1][6], '2026-11-01');
  assert.equal(g.length, 5);
});

test('joursFeriesFrance : fixes et mobiles (Pâques 2026 = 5 avril)', () => {
  const f = app.joursFeriesFrance(2026).join(',');
  assert.ok(f.includes('2026-04-06'), 'lundi de Pâques');
  assert.ok(f.includes('2026-05-14'), 'Ascension');
  assert.ok(f.includes('2026-05-25'), 'lundi de Pentecôte');
  assert.ok(f.includes('2026-11-11'));
  assert.equal(app.estJourFerie('2026-12-25'), true);
  assert.equal(app.estJourFerie('2026-12-24'), false);
});

test('probabiliteTenueSignature : dossier prêt → haute, facteurs expliqués', () => {
  const d = { rendezVousSignature: '2026-10-20', offrePretStatut: 'recue', pieces: TOUS_RECUS, typeVente: 'maison',
    appelFonds: '2026-10-01', echeancesValidees: { appelFonds: true, projetEnvoye: true }, projetEnvoye: '2026-10-05' };
  const p = app.probabiliteTenueSignature(d, '2026-10-12', []);
  assert.equal(p.pourcent, 97);
  assert.equal(p.niveau, 'haute');
  assert.ok(p.facteurs.every(f => f.ok));
});

test('probabiliteTenueSignature : offre non reçue, pièces et envois manquants, collaborateur absent → basse', () => {
  const d = { rendezVousSignature: '2026-10-08', pret: '2026-10-01', pieces: { erp: 'recue' }, typeVente: 'maison', responsable: 'Julie VASSELIN' };
  const absences = [{ collaborateur: 'Julie VASSELIN', debut: '2026-10-08', fin: '2026-10-08' }];
  const p = app.probabiliteTenueSignature(d, '2026-10-01', absences);
  assert.equal(p.niveau, 'basse');
  assert.equal(p.pourcent, 5);
  const libelles = p.facteurs.filter(f => !f.ok).map(f => f.libelle).join(' | ');
  assert.match(libelles, /Offre de prêt non reçue/);
  assert.match(libelles, /Renonciation au droit de préemption/);
  assert.match(libelles, /pièces manquantes/);
  assert.match(libelles, /Appel de fonds à envoyer/);
  assert.match(libelles, /Julie absent/);
});

test('probabiliteTenueSignature : rien pour une signature passée ou absente', () => {
  assert.equal(app.probabiliteTenueSignature({ rendezVousSignature: '2026-09-01' }, '2026-10-01', []), null);
  assert.equal(app.probabiliteTenueSignature({}, '2026-10-01', []), null);
});

test('dossiersAPlacer : financement, vente préalable et préemption levés, sans rendez-vous', () => {
  const liste = [
    { id: 'a', offrePretStatut: 'recue', pieces: TOUS_RECUS, typeVente: 'maison' },
    { id: 'b', offrePretStatut: 'recue', pieces: TOUS_RECUS, typeVente: 'maison', rendezVousSignature: '2026-10-10' },
    { id: 'c', pret: '2026-11-01', pieces: TOUS_RECUS, typeVente: 'maison' },
    { id: 'd', sansPret: true, pieces: {}, typeVente: 'maison' },
    { id: 'e', sansPret: true, pieces: TOUS_RECUS, typeVente: 'maison', archive: true }
  ];
  assert.equal(app.dossiersAPlacer(liste).map(d => d.id).join(','), 'a');
});

test('creneauxProposesSignature : jours ouvrés, pas de férié, pas de chevauchement, un par jour', () => {
  const d = { id: 'a', responsable: 'Julie VASSELIN', acte: '2026-12-31' };
  const evenements = [
    { date: '2026-11-09', heure: '09:00', heureFin: '12:00' }, // lundi : 9 h et 10 h 30 pris → 14 h
    { date: '2026-11-10', heure: '09:00', heureFin: '10:00', signature: true },
    { date: '2026-11-10', heure: '10:30', heureFin: '11:30', signature: true },
    { date: '2026-11-10', heure: '14:00', heureFin: '15:00', signature: true } // mardi : 3 signatures, complet
  ];
  const absences = [{ collaborateur: 'Julie VASSELIN', debut: '2026-11-12', fin: '2026-11-12' }];
  // Aujourd'hui 26/10 → au plus tôt le 09/11 (lundi) ; 11/11 férié ; 12/11 Julie absente.
  const c = app.creneauxProposesSignature(d, evenements, absences, '2026-10-26', 3);
  assert.equal(c.map(x => `${x.date} ${x.heure}`).join(' | '), '2026-11-09 14:00 | 2026-11-13 09:00 | 2026-11-16 09:00');
  assert.ok(c.every(x => !x.apresButoir));
});

test('creneauxProposesSignature : date butoir proche → au plus tôt dans 3 jours, signalé après butoir', () => {
  const c = app.creneauxProposesSignature({ acte: '2026-10-29' }, [], [], '2026-10-26', 3);
  assert.equal(c[0].date, '2026-10-29');
  assert.equal(c[1].apresButoir, true);
});

test('gestesRelationClient : rappel, confirmation, questionnaire, un an après — jamais au client d’un confrère', () => {
  const liste = [
    { id: 'rappel', rendezVousSignature: '2026-10-03' },
    { id: 'confirme', rendezVousSignature: '2026-10-20' },
    { id: 'dejaConfirme', rendezVousSignature: '2026-10-21', confirmationRdvPour: '2026-10-21' },
    { id: 'deplace', rendezVousSignature: '2026-10-22', confirmationRdvPour: '2026-10-15' },
    { id: 'signe', rendezVousSignature: '2026-09-25' },
    { id: 'signeConfrere', rendezVousSignature: '2026-09-25', notaireAcquereur: 'Maître DUPUIS' },
    { id: 'questionnaireFait', rendezVousSignature: '2026-09-25', questionnaireEnvoyeLe: '2026-09-26' },
    { id: 'unAn', rendezVousSignature: '2025-10-01', archive: true },
    { id: 'loin', rendezVousSignature: '2026-12-31' }
  ];
  const g = app.gestesRelationClient(liste, '2026-10-01');
  assert.equal(g.map(x => `${x.type}:${x.d.id}`).join(' | '),
    'rappelRdv:rappel | confirmationRdv:confirme | confirmationRdv:deplace | questionnaire:signe | anniversaire:unAn');
});

test('emails de relation client : date et heure en gras, lieu selon le type, formule du confrère', () => {
  const d = { nom: 'DURAND / MARTIN', rendezVousSignature: '2026-10-15', rendezVousSignatureHeure: '10:00', rendezVousType: 'visio' };
  const c = app.construireEmailConfirmationRdv(d);
  assert.match(c.sujet, /Confirmation du rendez-vous de signature — VTE - DURAND \/ MARTIN/);
  assert.match(app.texteSansMarques(c.corps), /le jeudi 15 octobre 2026 à 10h, en visioconférence/);
  assert.match(app.construireEmailRappelRdv(d).corps, /Nous vous rappelons/);
  const auConfrere = app.construireEmailConfirmationRdv(Object.assign({}, d, { notaireAcquereur: 'Maître DUPUIS', rendezVousType: 'confrere' }));
  assert.match(auConfrere.corps, /Je vous confirme .* en votre office/);
});

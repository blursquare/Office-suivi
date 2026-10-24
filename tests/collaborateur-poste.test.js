'use strict';

// Collaborateur du poste : le tableau de bord s'adapte à la personne qui l'ouvre (voir
// « Collaborateur du poste » dans script.js et CLAUDE.md). Fonctions pures uniquement.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('prenomCollaborateur : garde le prénom, retire le nom en capitales', () => {
  assert.equal(app.prenomCollaborateur('Julie VASSELIN'), 'Julie');
  assert.equal(app.prenomCollaborateur('Jérémy SAUJOT'), 'Jérémy');
  assert.equal(app.prenomCollaborateur('Bastien ANGLUMENT'), 'Bastien');
  assert.equal(app.prenomCollaborateur(''), '');
});

test('vueGlobalePour : globale pour l’administrateur ou un poste inconnu, sauf choix explicite', () => {
  assert.equal(app.vueGlobalePour('', null), true);
  assert.equal(app.vueGlobalePour('Bastien ANGLUMENT', null), true);
  assert.equal(app.vueGlobalePour('Julie VASSELIN', null), false);
  assert.equal(app.vueGlobalePour('Julie VASSELIN', true), true);
  assert.equal(app.vueGlobalePour('Bastien ANGLUMENT', false), false);
});

test('dossiersDuPerimetre : ses dossiers, ou tous en vue globale', () => {
  const l = [{ id: 'a', responsable: 'Julie VASSELIN' }, { id: 'b', responsable: 'Jérémy SAUJOT' }, { id: 'c' }];
  assert.equal(app.dossiersDuPerimetre(l, 'Julie VASSELIN', false).map(d => d.id).join(','), 'a');
  assert.equal(app.dossiersDuPerimetre(l, 'Julie VASSELIN', true).length, 3);
  assert.equal(app.dossiersDuPerimetre(l, '', false).length, 3);
});

test('rendezVousProchains : 15 jours, aujourd’hui compris, avec l’état des deux envois', () => {
  const l = [
    { id: 'a', nom: 'A', rendezVousSignature: '2026-10-01', appelFonds: '2026-09-20', echeancesValidees: { appelFonds: true } },
    { id: 'b', nom: 'B', rendezVousSignature: '2026-09-25', echeancesValidees: { appelFonds: true, projetEnvoye: true } },
    { id: 'c', nom: 'C', rendezVousSignature: '2026-10-20' },
    { id: 'd', nom: 'D', rendezVousSignature: '2026-09-20' },
    { id: 'e', nom: 'E' }
  ];
  const r = app.rendezVousProchains(l, '2026-09-25');
  assert.equal(r.map(x => x.dossier.id).join(','), 'b,a');
  assert.equal(r[0].jours, 0);
  assert.equal(r[0].appelFondsEnvoye && r[0].projetEnvoye, true);
  assert.equal(r[1].appelFondsEnvoye, true);
  assert.equal(r[1].projetEnvoye, false);
});

test('piecesDepuisVisite : seulement ce qui est arrivé après la visite précédente', () => {
  const l = [{ id: 'a', piecesTrouveesLe: { erp: '2026-09-24T10:00:00.000Z', titrePropriete: '2026-09-20T10:00:00.000Z' } }];
  assert.equal(app.piecesDepuisVisite(l, '2026-09-22T00:00:00.000Z').map(p => p.cle).join(','), 'erp');
  assert.equal(app.piecesDepuisVisite(l, null).length, 0);
});

test('resumeAccueilCollaborateur : ne cite que ce qui est non nul', () => {
  assert.equal(app.resumeAccueilCollaborateur({}), 'Rien d’urgent pour le moment.');
  assert.equal(
    app.resumeAccueilCollaborateur({ rendezVous: 2, echeances7: 0, piecesDepuisVisite: 1 }),
    '2 rendez-vous de signature dans les 15 jours et 1 pièce arrivée depuis votre dernière visite.'
  );
  assert.equal(
    app.resumeAccueilCollaborateur({ rendezVous: 1, echeances7: 3, piecesDepuisVisite: 2 }),
    '1 rendez-vous de signature dans les 15 jours, 3 échéances dans la semaine et 2 pièces arrivées depuis votre dernière visite.'
  );
});

test('plageHoraireRendezVous et tri par heure dans la journée', () => {
  assert.equal(app.plageHoraireRendezVous('10:30', '11:30'), '10 h 30 — 11 h 30');
  assert.equal(app.plageHoraireRendezVous('10:30', ''), '10 h 30');
  assert.equal(app.plageHoraireRendezVous('', '11:30'), '');
  const l = [
    { id: 'a', nom: 'A', rendezVousSignature: '2026-10-01', rendezVousSignatureHeure: '15:00' },
    { id: 'b', nom: 'B', rendezVousSignature: '2026-10-01' },
    { id: 'c', nom: 'C', rendezVousSignature: '2026-10-01', rendezVousSignatureHeure: '09:00', rendezVousSignatureLieu: 'Office' }
  ];
  const r = app.rendezVousProchains(l, '2026-09-30');
  assert.equal(r.map(x => x.dossier.id).join(','), 'c,a,b');
  assert.equal(r[0].lieu, 'Office');
});

test('alertesImportantes : gravité, ordre, et rien quand tout est en ordre', () => {
  const l = [
    { id: 'a', nom: 'A', pret: '2026-09-28', offrePretStatut: 'manquante' },            // butoir J-3 → critique
    { id: 'b', nom: 'B', rendezVousSignature: '2026-10-01', echeancesValidees: { appelFonds: true } }, // J-6, projet manquant → vigilance
    { id: 'c', nom: 'C', rendezVousSignature: '2026-09-26' },                            // J-1, rien envoyé → critique
    { id: 'd', nom: 'D', acte: '2026-10-05', pieces: { renonciationPreemption: 'recue' } },                                           // butoir J-10 sans rdv → vigilance
    { id: 'e', nom: 'E', pret: '2026-12-01', offrePretStatut: 'manquante' },            // loin → rien
    { id: 'f', nom: 'F', pret: '2026-09-28', offrePretStatut: 'recue', pieces: { renonciationPreemption: 'recue' } }                 // offre reçue → fixer le rendez-vous
  ];
  const r = app.alertesImportantes(l, '2026-09-25');
  assert.equal(r.map(a => a.dossier.id + ':' + a.gravite).join(','), 'c:critique,a:critique,b:vigilance,d:vigilance,f:vigilance');
  assert.equal(r[4].titre, 'Fixer le rendez-vous');
  assert.equal(r[0].titre, 'Envoyer l’appel de fonds et le projet');
  assert.equal(r[1].titre, 'Relancer l’offre de prêt');
  assert.equal(r[2].titre, 'Envoyer le projet');
});

test('rappels : libellé d’échéance et ordre d’affichage', () => {
  assert.equal(app.libelleEcheanceRappel('2026-09-25', '2026-09-25'), "Aujourd'hui");
  assert.equal(app.libelleEcheanceRappel('2026-09-26', '2026-09-25'), 'Demain');
  assert.equal(app.libelleEcheanceRappel('2026-09-24', '2026-09-25'), 'Non fait hier');
  assert.equal(app.libelleEcheanceRappel('2026-09-23', '2026-09-25'), 'Non fait depuis 2 j');
  assert.equal(app.libelleEcheanceRappel('2026-09-28', '2026-09-25'), 'Lundi');
  assert.equal(app.libelleEcheanceRappel('', '2026-09-25'), '');
  const l = [
    { id: '1', texte: 'sans date', fait: false, creeLe: 'a' },
    { id: '2', texte: 'demain', echeance: '2026-09-26', fait: false, creeLe: 'b' },
    { id: '3', texte: 'fait hier', fait: true, faitLe: '2026-09-24T10:00:00Z' },
    { id: '4', texte: 'fait ce jour', fait: true, faitLe: '2026-09-25T09:00:00Z' },
    { id: '5', texte: 'aujourd’hui', echeance: '2026-09-25', fait: false, creeLe: 'c' }
  ];
  assert.equal(app.rappelsAffiches(l, '2026-09-25').map(r => r.id).join(','), '5,2,1,4');
});

test('rappelsDuJour : un rappel non coché revient chaque jour à partir de son échéance (ou de sa création)', () => {
  const l = [
    { id: 'hier', texte: 'échéance hier', echeance: '2026-09-30', fait: false, creeLe: '2026-09-28T08:00:00' },
    { id: 'sans', texte: 'sans date, créé hier', echeance: '', fait: false, creeLe: '2026-09-30T15:00:00' },
    { id: 'futur', texte: 'dans trois jours', echeance: '2026-10-04', fait: false, creeLe: '2026-09-30T15:00:00' },
    { id: 'jour', texte: 'aujourd’hui', echeance: '2026-10-01', fait: false, creeLe: '2026-09-29T08:00:00' },
    { id: 'coche', texte: 'coché ce jour', echeance: '2026-09-29', fait: true, faitLe: '2026-10-01T09:00:00' },
    { id: 'vieux', texte: 'coché avant-hier', echeance: '2026-09-29', fait: true, faitLe: '2026-09-29T09:00:00' }
  ];
  const r = app.rappelsDuJour(l, '2026-10-01');
  assert.equal(r.aFaire.map(x => x.id).join(','), 'hier,jour,sans');
  assert.equal(r.faits.map(x => x.id).join(','), 'coche');
  assert.equal(app.dateRappelJour(l[1]), '2026-09-30');
  assert.equal(app.libelleEcheanceRappel(app.dateRappelJour(l[1]), '2026-10-01'), 'Non fait hier');
  // Rien de daté à venir n'entre dans la journée ; un rappel sans date ni création y entre.
  assert.equal(app.rappelsDuJour([{ id: 'x', texte: 't', fait: false }], '2026-10-01').aFaire.length, 1);
});

test('pointsATraiter : une ligne par dossier, le plus grave en titre, les autres en dessous', () => {
  const l = [
    // Même dossier : offre non reçue (J-3, critique) et butoir sans rendez-vous (J-10, vigilance).
    { id: 'a', nom: 'A', pret: '2026-09-28', offrePretStatut: 'manquante', acte: '2026-10-05', pieces: { renonciationPreemption: 'recue' } },
    { id: 'b', nom: 'B', typeVente: 'maison', sansPret: true }  // jamais relié : À suivre
  ];
  const r = app.pointsATraiter(l, '2026-09-25');
  assert.equal(r.map(x => x.dossier.id + ':' + x.gravite).join(','), 'a:critique,b:info');
  assert.equal(r[0].principal.titre, 'Relancer l’offre de prêt');
  assert.equal(r[0].autres.map(x => x.titre).join(','), 'Fixer le rendez-vous');
  // Achat comptant sans rendez-vous, renonciation de préemption pas encore reçue : pas de « Fixer le
  // rendez-vous » tant qu'elle manque — l'attente et « Relier le dossier du NAS », en suivi.
  assert.equal([r[1].principal.titre].concat(r[1].autres.map(x => x.titre)).sort().join(','), 'Relier le dossier du NAS,Renonciation de préemption attendue');
});

test('lignesGalerieWidgets : tous les widgets, affichés d’abord puis retirés, chacun décrit', () => {
  const app = chargerApplication();
  const dispo = app.dispositionWidgetsDepuis([{ id: 'agenda', taille: 'moyen', hauteur: 1, masque: true }, { id: 'pieces', taille: 'petit', hauteur: 1, masque: true }]);
  const lignes = app.lignesGalerieWidgets(dispo, 'Bastien ANGLUMENT');
  assert.equal(lignes.length, app.WIDGETS_DASHBOARD.length);
  assert.equal(lignes.map(l => `${l.def.id}:${l.affiche ? 'oui' : 'non'}`).join(','),
    'aujourdhui:oui,assistant:oui,nouveautes:oui,avancement:oui,activite:oui,statistiques:oui,agenda:non,portefeuille:non,pieces:non');
  assert.ok(lignes.every(l => l.def.description && l.def.icone));
  assert.ok(app.lignesGalerieWidgets(dispo, 'Julie VASSELIN').some(l => l.def.id === 'assistant'), 'Demander à CLAIRE : ouvert à tous depuis les canaux (24/10)');
});

test('ongletReserve : plus aucun écran réservé à l’administrateur (Demander à CLAIRE ouvert à tous depuis les canaux, 24/10)', () => {
  const app = chargerApplication();
  assert.equal(app.ongletReserve('assistant', 'Julie VASSELIN'), false);
  assert.equal(app.ongletReserve('analyse-ia', ''), false, 'relecture d’actes retirée (18/10) : dans « Demander à CLAIRE »');
  assert.equal(app.ongletReserve('suivi', 'Julie VASSELIN'), false);
});

test('filtreSuiviParDefaut : le collaborateur du poste, tous les dossiers pour l’administrateur', () => {
  const app = require('./helpers/load-app.js').chargerApplication();
  assert.equal(app.filtreSuiviParDefaut('Julie VASSELIN'), 'Julie VASSELIN');
  assert.equal(app.filtreSuiviParDefaut('Bastien ANGLUMENT'), '');
  assert.equal(app.filtreSuiviParDefaut(''), '');
});

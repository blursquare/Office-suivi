'use strict';

// Lecture de l'agenda de l'office (voir src/agendaOffice.js) : conversion des rendez-vous EWS et
// rapprochement au dossier, tous deux purs. Le plus important à couvrir : ne jamais se tromper de
// dossier (une ambiguïté doit rendre `null`, jamais un choix arbitraire), ne jamais relever un
// rendez-vous annulé, et lire la date et l'heure à l'heure de Paris.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  evenementDepuisEws, evenementsDepuisEws, momentParisDepuisIso,
  extraireReferenceVte, referenceDossierEvenement, detecteAppelDeFonds, detecteProjetEnvoye,
  detecterActionsEvenement, dossierPourReferenceAgenda, actionsDetecteesDepuisEvenements, composerLieuAgenda, evenementsAgendaOffice,
  categoriesDistinctes, agendaDuJourDepuisEvenements
} = require('../src/agendaOffice');

// Un rendez-vous tel que le rend exchange/ews.js (parseCalendrierEws), converti en modèle neutre.
function rdv({ sujet = '', lieu = '', start = '2099-10-14T09:00:00Z', end, allDay = false, cancelled = false, categories = [] }) {
  return evenementDepuisEws({ subject: sujet, location: lieu, start, end: end || start, allDay, cancelled, categories });
}

test('evenementDepuisEws : date et heure à Paris (été, hiver), fin du rendez-vous', () => {
  const ete = evenementDepuisEws({ subject: 'VTE - DUPONT', location: 'BA', start: '2026-09-30T12:00:00Z', end: '2026-09-30T13:30:00Z' });
  assert.equal(ete.date, '2026-09-30');
  assert.equal(ete.heure, '14:00');
  assert.equal(ete.heureFin, '15:30');
  assert.equal(ete.journeeEntiere, false);
  const hiver = evenementDepuisEws({ subject: 'x', start: '2026-12-15T09:30:00Z', end: '2026-12-15T10:30:00Z' });
  assert.equal(hiver.heure, '10:30');
  // 23 h 30 UTC la veille = 1 h 30 à Paris le jour même : la date suit Paris, jamais UTC.
  assert.equal(evenementDepuisEws({ subject: 'x', start: '2026-10-13T23:30:00Z' }).date, '2026-10-14');
});

test('evenementDepuisEws : journée entière → sans heure, fin ramenée au dernier jour réel', () => {
  // Exchange rend minuit de Paris en UTC ; la fin est minuit du lendemain du dernier jour.
  const conges = evenementDepuisEws({ subject: 'Congés JV', start: '2026-10-11T22:00:00Z', end: '2026-10-16T22:00:00Z', allDay: true });
  assert.equal(conges.date, '2026-10-12');
  assert.equal(conges.dateFin, '2026-10-16');
  assert.equal(conges.heure, null);
  assert.equal(conges.journeeEntiere, true);
  const unJour = evenementDepuisEws({ subject: 'RTT BA', start: '2026-10-11T22:00:00Z', end: '2026-10-12T22:00:00Z', allDay: true });
  assert.equal(unJour.dateFin, '2026-10-12');
});

test('evenementsDepuisEws : un rendez-vous sans début lisible est écarté, jamais un plantage', () => {
  const liste = evenementsDepuisEws([{ subject: 'VTE - A', start: '' }, { subject: 'VTE - B', start: '2026-10-14T09:00:00Z' }, null]);
  assert.equal(liste.map((e) => e.sujet).join('|'), 'VTE - B');
  assert.equal(momentParisDepuisIso('pas une date'), null);
});

test('extraireReferenceVte reconnait VTE avec differents separateurs, et rien sans le mot VTE', () => {
  assert.equal(extraireReferenceVte('VTE - DUPONT / MARTIN'), 'DUPONT / MARTIN');
  assert.equal(extraireReferenceVte('VTE: DUPONT / MARTIN'), 'DUPONT / MARTIN');
  assert.equal(extraireReferenceVte('VTE – DUPONT / MARTIN'), 'DUPONT / MARTIN');
  assert.equal(extraireReferenceVte('vte dupont / martin'), 'dupont / martin');
  assert.equal(extraireReferenceVte('Rendez-vous signature DUPONT'), '');
  assert.equal(extraireReferenceVte(''), '');
});

test('extraireReferenceVte reconnait aussi VENTE, mais seulement en tete de ligne', () => {
  assert.equal(extraireReferenceVte('VENTE MOKADEM / DE SOUSA MARTINS'), 'MOKADEM / DE SOUSA MARTINS');
  assert.equal(extraireReferenceVte('VENTE - DUPONT'), 'DUPONT');
  assert.equal(extraireReferenceVte('Vente : DUPONT'), 'DUPONT');
  assert.equal(extraireReferenceVte('Notes\nVENTE DUPONT / MARTIN'), 'DUPONT / MARTIN');
  assert.equal(extraireReferenceVte('Visite de la vente DUPONT'), '');
  assert.equal(extraireReferenceVte('Prevente DUPONT'), '');
});

test('extraireReferenceVte reconnait « VENTE - » au milieu du titre, en capitales avec tiret seulement', () => {
  assert.equal(extraireReferenceVte('RDV VENTE - DUPONT / MARTIN'), 'DUPONT / MARTIN');
  assert.equal(extraireReferenceVte('Signature VENTE – DURAND'), 'DURAND');
  assert.equal(extraireReferenceVte('Signature VENTE: DURAND'), 'DURAND');
  assert.equal(extraireReferenceVte('Visite de la vente - point'), '', 'en minuscules : pas une référence');
  assert.equal(extraireReferenceVte('RDV VENTE DUPONT'), '', 'sans tiret au milieu du titre : pas une référence');
  assert.equal(extraireReferenceVte('RDV PREVENTE - DUPONT'), '', 'jamais à l’intérieur d’un mot');
});

test('un rendez-vous « RDV VENTE - … » est relevé comme rendez-vous de signature du bon dossier', () => {
  const evenements = [rdv({ sujet: 'RDV VENTE - DUPONT / MARTIN', lieu: 'BA Appel de fonds envoyé' })];
  const r = actionsDetecteesDepuisEvenements(evenements, [{ id: 'd1', nom: 'DUPONT / MARTIN' }, { id: 'd2', nom: 'DURAND / LEROY' }], '2026-09-25');
  assert.equal(r.length, 1);
  assert.equal(r[0].dossierId, 'd1');
  assert.equal(r[0].rendezVous, true);
  assert.equal(r[0].appelFonds, true);
});

test('un rendez-vous VENTE ... porte les deux envois comme un rendez-vous VTE', () => {
  const evenements = [rdv({ sujet: 'VENTE MOKADEM / DE SOUSA MARTINS', lieu: 'Me DENIS en 1er - Appel de fonds et projet envoyé', start: '2099-10-14T14:00:00Z' })];
  const dossiers = [{ id: 'a', nom: 'MOKADEM / DE SOUSA MARTINS' }, { id: 'b', nom: 'DUPONT / MARTIN' }];
  const actions = actionsDetecteesDepuisEvenements(evenements, dossiers, '2026-09-25');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].dossierId, 'a');
  assert.equal(actions[0].appelFonds, true);
  assert.equal(actions[0].projetEnvoye, true);
});

test('extraireReferenceVte garde les mots-cles d\'action colles a la reference (tolere par le matching)', () => {
  assert.equal(extraireReferenceVte('VTE - DUPONT / MARTIN - Appel de fonds'), 'DUPONT / MARTIN - Appel de fonds');
});

test('referenceDossierEvenement lit le titre du rendez-vous', () => {
  assert.equal(referenceDossierEvenement({ sujet: 'VTE - A / B', lieu: '' }), 'A / B');
  assert.equal(referenceDossierEvenement({ sujet: 'RDV signature', lieu: 'VTE - A / B' }), '', 'le lieu ne porte pas la référence');
});

test('detecteAppelDeFonds : un appel de fonds ENVOYE, jamais une simple mention ou une note de preparation', () => {
  assert.equal(detecteAppelDeFonds('Appel de fonds envoye'), true);
  assert.equal(detecteAppelDeFonds('BA Appel de fonds envoyé'), true);
  assert.equal(detecteAppelDeFonds('JV Appel de fonds et projet envoyé'), true);
  assert.equal(detecteAppelDeFonds('APPEL DE FONDS ENVOYE'), true);
  assert.equal(detecteAppelDeFonds('envoi de l\'appel de fonds'), true);
  assert.equal(detecteAppelDeFonds('AF envoyé'), true);
  assert.equal(detecteAppelDeFonds('af envoyé'), false, 'af en minuscules ne doit pas matcher (trop de faux positifs)');
  assert.equal(detecteAppelDeFonds('APPEL DE FONDS'), false, 'une mention sans envoi ne declenche rien');
  assert.equal(detecteAppelDeFonds('Appel de fonds à envoyer'), false, 'un infinitif n\'est pas un envoi');
  assert.equal(detecteAppelDeFonds('Appel de fonds non envoyé'), false);
  assert.equal(detecteAppelDeFonds('AF pas encore envoyé'), false);
  assert.equal(detecteAppelDeFonds('Rendez-vous signature'), false);
});

test('detecteProjetEnvoye : les deux ordres de mots, jamais un texte sans rapport', () => {
  assert.equal(detecteProjetEnvoye('projet envoye'), true);
  assert.equal(detecteProjetEnvoye('Projet d\'acte envoyé au client'), true);
  assert.equal(detecteProjetEnvoye('envoi du projet d\'acte'), true);
  assert.equal(detecteProjetEnvoye('Appel de fonds'), false);
  assert.equal(detecteProjetEnvoye('projet de vente en cours de redaction'), false);
  assert.equal(detecteProjetEnvoye('projet à envoyer'), false);
  assert.equal(detecteProjetEnvoye('JV Appel de fonds et projet envoyé'), true);
});

test('detecterActionsEvenement lit le titre en repli du lieu', () => {
  const actions = detecterActionsEvenement({ sujet: 'VTE - DUPONT / MARTIN - Appel de fonds + projet envoyé', lieu: '' });
  assert.deepEqual(actions, { appelFonds: true, projetEnvoye: true });
});

test('detecterActionsEvenement lit le LIEU du rendez-vous (initiales + declencheur)', () => {
  assert.deepEqual(detecterActionsEvenement({ sujet: 'VTE - DUPONT', lieu: 'BA Appel de fonds envoyé' }), { appelFonds: true, projetEnvoye: false });
  assert.deepEqual(detecterActionsEvenement({ sujet: 'VTE - DUPONT', lieu: 'JS Appel de fonds et projet envoyé' }), { appelFonds: true, projetEnvoye: true });
  assert.deepEqual(detecterActionsEvenement({ sujet: 'VTE - DUPONT', lieu: 'Office' }), { appelFonds: false, projetEnvoye: false });
});

test('dossierPourReferenceAgenda : correspondance sans ambiguite uniquement', () => {
  const dossiers = [
    { id: 'd1', nom: 'DUPONT / MARTIN' },
    { id: 'd2', nom: 'DURAND / LEROY' }
  ];
  assert.equal(dossierPourReferenceAgenda('DUPONT / MARTIN - Appel de fonds', dossiers).id, 'd1');
  assert.equal(dossierPourReferenceAgenda('DURAND / LEROY - projet envoye', dossiers).id, 'd2');
});

test('dossierPourReferenceAgenda : aucune correspondance ou ambiguite rend null, jamais un choix arbitraire', () => {
  const dossiers = [
    { id: 'd1', nom: 'DUPONT / MARTIN' },
    { id: 'd2', nom: 'DURAND / LEROY' }
  ];
  assert.equal(dossierPourReferenceAgenda('BERNARD / PETIT', dossiers), null);
  // Une reference vide ou sans mot significatif ne doit jamais tomber sur le premier dossier venu.
  assert.equal(dossierPourReferenceAgenda('', dossiers), null);
  assert.equal(dossierPourReferenceAgenda('Vente et acquereur', dossiers), null);
});

test('dossierPourReferenceAgenda : tolerant, l\'agenda peut ne citer qu\'une partie des noms', () => {
  const dossiers = [
    { id: 'd1', nom: 'DUPONT & DURAND / MARTIN' },
    { id: 'd2', nom: 'LEROY / PETIT' }
  ];
  assert.equal(dossierPourReferenceAgenda('DUPONT', dossiers).id, 'd1');
  assert.equal(dossierPourReferenceAgenda('MARTIN - signature', dossiers).id, 'd1');
  assert.equal(dossierPourReferenceAgenda('PETIT', dossiers).id, 'd2');
});

test('dossierPourReferenceAgenda : une faute de frappe sur un nom long est toleree, pas sur un nom court', () => {
  const dossiers = [{ id: 'd1', nom: 'DUPONT / MARTIN' }, { id: 'd2', nom: 'RAY / DIAS' }];
  assert.equal(dossierPourReferenceAgenda('DUPOND', dossiers).id, 'd1');
  assert.equal(dossierPourReferenceAgenda('MARTAN', dossiers).id, 'd1');
  assert.equal(dossierPourReferenceAgenda('ROY', dossiers), null, 'un nom de moins de 5 lettres doit etre exact');
  assert.equal(dossierPourReferenceAgenda('TUPONT', dossiers), null, 'la premiere lettre n\'est jamais toleree');
});

test('dossierPourReferenceAgenda : un nom porte par deux dossiers ne designe aucun des deux (etude 07/10)', () => {
  const dossiers = [
    { id: 'd1', nom: 'DUPONT / MARTIN' },
    { id: 'd2', nom: 'DUPONT' },
    { id: 'd3', nom: 'LEROY / PETIT' }
  ];
  assert.equal(dossierPourReferenceAgenda('DUPONT', dossiers), null, 'DUPONT est dans deux dossiers : rien');
  assert.equal(dossierPourReferenceAgenda('DUPONT MARTIN', dossiers).id, 'd1', 'MARTIN n\'est qu\'a lui');
  assert.equal(dossierPourReferenceAgenda('PETIT / DUPONT', dossiers), null, 'des noms de deux dossiers differents : ambigu');
  assert.equal(dossierPourReferenceAgenda('DUPONT MARTIN LEROY PETIT', [dossiers[0], dossiers[2]]), null, 'deux dossiers cites a parts egales');
  const homonymes = [{ id: 'a', nom: 'DUPONT / MARTIN' }, { id: 'b', nom: 'DUPONT / LEROY' }];
  assert.equal(dossierPourReferenceAgenda('DUPONT', homonymes), null, 'deux dossiers egalement couverts : rien');
});

test('dossierPourReferenceAgenda : deux dossiers ROY — l\'autre nom, le prenom, l\'identifiant ou la date de la fiche departagent', () => {
  const roy = [
    { id: 'r1', nom: 'ROY / LAMBERT', parties: [{ role: 'VENDEUR', nom: 'Paul ROY' }, { role: 'ACQUEREUR', nom: 'Anne LAMBERT' }] },
    { id: 'r2', nom: 'GARNIER / ROY', parties: [{ role: 'VENDEUR', nom: 'Luc GARNIER' }, { role: 'ACQUEREUR', nom: 'Sylvie ROY' }],
      rdvAgendaItem: { itemId: 'AAA=' } }
  ];
  assert.equal(dossierPourReferenceAgenda('ROY / LAMBERT', roy).id, 'r1');
  assert.equal(dossierPourReferenceAgenda('GARNIER ROY', roy).id, 'r2');
  assert.equal(dossierPourReferenceAgenda('ROY', roy), null, 'le seul nom ROY ne choisit jamais');
  assert.equal(dossierPourReferenceAgenda('ROY Sylvie', roy).id, 'r2', 'le prenom d\'une partie departage');
  assert.equal(dossierPourReferenceAgenda('ROY Paul', roy).id, 'r1');
  assert.equal(dossierPourReferenceAgenda('ROY / LAMBERT', roy, { itemId: 'AAA=' }).id, 'r2', 'l\'identifiant memorise par CLAIRE l\'emporte sur le titre');
  const avecDates = [
    Object.assign({}, roy[0], { rendezVousSignature: '2026-10-20' }),
    Object.assign({}, roy[1], { rendezVousSignature: '2026-11-05', rdvAgendaItem: null })
  ];
  assert.equal(dossierPourReferenceAgenda('ROY', avecDates, { date: '2026-11-05' }).id, 'r2', 'date posee sur la fiche');
  assert.equal(dossierPourReferenceAgenda('ROY', avecDates, { date: '2026-12-01' }), null);
  // Une date ecrite par l'agenda lui-meme (relevee d'un rapprochement) ne departage pas : elle pourrait venir d'une erreur.
  const ecriteParAgenda = [
    Object.assign({}, avecDates[0], { detectionsAgenda: { rendezVousSignature: '2026-10-20' } }),
    avecDates[1]
  ];
  assert.equal(dossierPourReferenceAgenda('ROY', ecriteParAgenda, { date: '2026-10-20' }), null);
  // Un prenom ne fait jamais seul un candidat : « VTE - SYLVIE » ne designe pas le dossier de Sylvie ROY.
  assert.equal(dossierPourReferenceAgenda('SYLVIE', roy), null);
});

test('actionsDetecteesDepuisEvenements et agenda de l\'office : un rendez-vous ROY ne va jamais a l\'autre dossier ROY', () => {
  const roy = [
    { id: 'r1', nom: 'ROY / LAMBERT', parties: [{ role: 'VENDEUR', nom: 'Paul ROY' }] },
    { id: 'r2', nom: 'GARNIER / ROY', parties: [{ role: 'ACQUEREUR', nom: 'Sylvie ROY' }], rdvAgendaItem: { itemId: 'ID-R2' } }
  ];
  const evenements = [
    Object.assign(rdv({ sujet: 'VTE - ROY', lieu: 'AF envoyé', start: '2026-10-14T09:00:00Z' }), {}),
  ];
  const det = actionsDetecteesDepuisEvenements(evenements, roy);
  assert.equal(det[0].dossierId, null, 'titre ambigu : aucune fiche touchee');
  const office = evenementsAgendaOffice([{ sujet: 'VTE - ROY', date: '2026-10-14', heure: '11:00', itemId: 'ID-R2' }], roy);
  assert.equal(office[0].dossierId, 'r2', 'cree depuis la fiche : identifiant memorise');
});

test('actionsDetecteesDepuisEvenements : bout en bout, un evenement = une detection', () => {
  const evenements = [
    rdv({ sujet: 'VTE - DUPONT / MARTIN', lieu: 'BA Appel de fonds envoyé', start: '2026-10-14T09:00:00Z' }),
    rdv({ sujet: 'VTE - DURAND / LEROY - projet envoye', start: '2026-10-14T22:00:00Z', end: '2026-10-15T22:00:00Z', allDay: true }),
    rdv({ sujet: 'Reunion interne', start: '2026-10-16T08:00:00Z' })
  ];
  const dossiers = [
    { id: 'd1', nom: 'DUPONT / MARTIN' },
    { id: 'd2', nom: 'DURAND / LEROY' }
  ];
  const resultats = actionsDetecteesDepuisEvenements(evenements, dossiers);
  assert.equal(resultats.length, 2);
  assert.equal(resultats[0].dossierId, 'd1');
  assert.equal(resultats[0].appelFonds, true);
  assert.equal(resultats[0].projetEnvoye, false);
  assert.equal(resultats[0].dateIso, '2026-10-14');
  assert.equal(resultats[0].heure, '11:00');
  assert.equal(resultats[1].dossierId, 'd2');
  assert.equal(resultats[1].projetEnvoye, true);
  assert.equal(resultats[1].dateIso, '2026-10-15');
  assert.equal(resultats[1].rendezVous, false, 'journée entière : une note, pas le rendez-vous');
});

test('actionsDetecteesDepuisEvenements : ignore un rendez-vous annulé', () => {
  const evenements = [rdv({ sujet: 'VTE - DUPONT / MARTIN', lieu: 'BA Appel de fonds envoyé', cancelled: true })];
  assert.deepEqual(actionsDetecteesDepuisEvenements(evenements, [{ id: 'd1', nom: 'DUPONT / MARTIN' }]), []);
});

test('actionsDetecteesDepuisEvenements : un evenement sans VTE est ignore', () => {
  const sansVte = [rdv({ sujet: 'DUPONT', lieu: 'Appel de fonds envoyé' })];
  assert.deepEqual(actionsDetecteesDepuisEvenements(sansVte, [{ id: 'd1', nom: 'DUPONT / MARTIN' }]), []);
});

test('actionsDetecteesDepuisEvenements : sans correspondance sure, dossierId reste null (jamais devine)', () => {
  const evenements = [rdv({ sujet: 'VTE - INCONNU / PERSONNE', lieu: 'Appel de fonds envoyé' })];
  const resultats = actionsDetecteesDepuisEvenements(evenements, [{ id: 'd1', nom: 'DUPONT / MARTIN' }]);
  assert.equal(resultats.length, 1);
  assert.equal(resultats[0].dossierId, null);
});

test('actionsDetecteesDepuisEvenements : seuls les rendez-vous a partir du jour de lecture sont lus', () => {
  const evenements = ['2026-09-24T08:00:00Z', '2026-09-25T14:00:00Z', '2026-10-14T08:00:00Z']
    .map((start) => rdv({ sujet: 'VTE - DUPONT', lieu: 'BA Appel de fonds envoyé', start }));
  const resultats = actionsDetecteesDepuisEvenements(evenements, [{ id: 'd1', nom: 'DUPONT / MARTIN' }], '2026-09-25');
  assert.equal(resultats.map((r) => r.dateIso).join(','), '2026-09-25,2026-10-14');
});

test('rendez-vous de signature : un VTE à venir avec une heure, sans « ? », est le rendez-vous', () => {
  const { estRendezVousSignature } = require('../src/agendaOffice');
  assert.equal(estRendezVousSignature(rdv({ sujet: 'VTE - DUPONT', lieu: 'Office' })), true);
  assert.equal(estRendezVousSignature(rdv({ sujet: 'VTE - DUPONT ?', lieu: '' })), false, '« ? » dans le titre');
  assert.equal(estRendezVousSignature(rdv({ sujet: 'VTE - DUPONT', lieu: 'Visio ??' })), false, '« ? » dans le lieu');
  assert.equal(estRendezVousSignature(rdv({ sujet: 'VTE - DUPONT', lieu: 'https://teams.microsoft.com/l/meetup?id=1' })), true, 'le « ? » d\'un lien ne compte pas');
  assert.equal(estRendezVousSignature(rdv({ sujet: 'VTE - DUPONT', allDay: true })), false, 'toute la journee : une note, pas un rendez-vous');
});

test('actionsDetecteesDepuisEvenements : un rendez-vous sans déclencheur d\'envoi est quand même relevé', () => {
  const r = actionsDetecteesDepuisEvenements([rdv({ sujet: 'VTE - DUPONT / MARTIN', lieu: 'Office' })], [{ id: 'd1', nom: 'DUPONT / MARTIN' }], '2026-09-25');
  assert.equal(r.length, 1);
  assert.equal(r[0].rendezVous, true);
  assert.equal(r[0].appelFonds, false);
  assert.equal(r[0].dateIso, '2099-10-14');
  const douteux = [rdv({ sujet: 'VTE - DUPONT / MARTIN ?', lieu: 'Office' })];
  assert.deepEqual(actionsDetecteesDepuisEvenements(douteux, [{ id: 'd1', nom: 'DUPONT / MARTIN' }], '2026-09-25'), []);
});

test('catégories Outlook : relevées sur le rendez-vous et listées sans doublon', () => {
  const evenements = [
    rdv({ sujet: 'VTE - DUPONT', categories: ['Catégorie Verte', 'Visio, client'] }),
    rdv({ sujet: 'VTE - MARTIN', categories: ['catégorie verte'] })
  ];
  assert.equal(evenements[0].categories.join('|'), 'Catégorie Verte|Visio, client');
  assert.equal(categoriesDistinctes(evenements).join('|'), 'Catégorie Verte|Visio, client');
  const r = actionsDetecteesDepuisEvenements(evenements, [{ id: 'd1', nom: 'DUPONT' }], '2026-09-25');
  assert.equal(r[0].categories.join('|'), 'Catégorie Verte|Visio, client');
});

// --- Écriture dans le lieu du rendez-vous (composerLieuAgenda, l'inverse de la détection) ---

test('composerLieuAgenda : initiales du responsable en tête si elles manquent, jamais en double', () => {
  assert.equal(composerLieuAgenda('', { appelFonds: true, initiales: 'BA', confrere: 'Me DURAND en 2nd' }), 'BA - Me DURAND en 2nd - Appel de fonds envoyé');
  assert.equal(composerLieuAgenda('Me DURAND', { projet: true, initiales: 'BA', confrere: 'Me DURAND en 1er' }), 'BA - Me DURAND en 1er - Projet envoyé');
  assert.equal(composerLieuAgenda('BA - Appel de fonds envoyé', { appelFonds: true, projet: true, initiales: 'BA' }), 'BA - Appel de fonds et projet envoyé');
  assert.equal(composerLieuAgenda('JV', { appelFonds: true, initiales: 'pas des initiales' }), 'JV - Appel de fonds envoyé');
});

test('composerLieuAgenda : ajoute la mention APRÈS les initiales, sans les toucher', () => {
  assert.equal(composerLieuAgenda('AL - ', { appelFonds: true }), 'AL - Appel de fonds envoyé');
  assert.equal(composerLieuAgenda('AL', { appelFonds: true }), 'AL - Appel de fonds envoyé');
  assert.equal(composerLieuAgenda('AL - visio', { appelFonds: true }), 'AL - visio - Appel de fonds envoyé');
});

test('composerLieuAgenda : appel de fonds + projet → mention combinée', () => {
  assert.equal(composerLieuAgenda('AL', { appelFonds: true, projet: true }), 'AL - Appel de fonds et projet envoyé');
  assert.equal(composerLieuAgenda('AL', { projet: true }), 'AL - Projet envoyé');
});

test('composerLieuAgenda : ne duplique pas une mention déjà présente, la met à jour', () => {
  // Une mention « appel de fonds envoyé » déjà là (à la main ou d'un push précédent) est remplacée.
  assert.equal(composerLieuAgenda('AL - Appel de fonds envoyé', { appelFonds: true }), 'AL - Appel de fonds envoyé');
  // Passage de « appel de fonds » seul à « appel de fonds et projet ».
  assert.equal(composerLieuAgenda('AL - Appel de fonds envoyé', { appelFonds: true, projet: true }), 'AL - Appel de fonds et projet envoyé');
  // Forme combinée déjà présente, réécrite à l'identique.
  assert.equal(composerLieuAgenda('AL - Appel de fonds et projet envoyé', { appelFonds: true, projet: true }), 'AL - Appel de fonds et projet envoyé');
});

test('composerLieuAgenda : lieu vide → mention seule ; rien à noter → lieu inchangé nettoyé', () => {
  assert.equal(composerLieuAgenda('', { appelFonds: true }), 'Appel de fonds envoyé');
  assert.equal(composerLieuAgenda('AL - visio', {}), 'AL - visio');
});

test('composerLieuAgenda : le confrère (« Me DURAND en 1er / en 2nd ») entre les initiales et la mention', () => {
  assert.equal(composerLieuAgenda('BA', { appelFonds: true, confrere: 'Me DURAND en 2nd' }), 'BA - Me DURAND en 2nd - Appel de fonds envoyé');
  // Déjà écrit à la main sans rang, ou avec l'autre rang : remis à jour, jamais doublé.
  assert.equal(composerLieuAgenda('BA - Me DURAND - Appel de fonds envoyé', { appelFonds: true, projet: true, confrere: 'Me DURAND en 2nd' }),
    'BA - Me DURAND en 2nd - Appel de fonds et projet envoyé');
  assert.equal(composerLieuAgenda('BA - Maître DURAND en 1er', { appelFonds: true, confrere: 'Me DURAND en 2nd' }), 'BA - Me DURAND en 2nd - Appel de fonds envoyé');
  // Nom composé, autre note conservée.
  assert.equal(composerLieuAgenda('BA - Visio', { projet: true, confrere: 'Me LE GALL en 1er' }), 'BA - Visio - Me LE GALL en 1er - Projet envoyé');
  // Sans confrère : inchangé.
  assert.equal(composerLieuAgenda('BA', { appelFonds: true }), 'BA - Appel de fonds envoyé');
  // Un mot qui CONTIENT le nom n'est pas pris pour lui.
  assert.equal(composerLieuAgenda('BA - DURANDIERE', { appelFonds: true, confrere: 'Me DURAND en 2nd' }), 'BA - DURANDIERE - Me DURAND en 2nd - Appel de fonds envoyé');
});

test('agendaDuJourDepuisEvenements : tous les rendez-vous du jour, journées entières d’abord puis par heure', () => {
  const evenements = [
    rdv({ sujet: 'Rendez-vous banque', lieu: 'Crédit Exemple', start: '2099-10-14T12:30:00Z', end: '2099-10-14T13:00:00Z' }),
    rdv({ sujet: 'VTE - DUPONT / MARTIN', lieu: 'Office', start: '2099-10-14T08:00:00Z', end: '2099-10-14T09:00:00Z', categories: ['Catégorie Verte'] }),
    rdv({ sujet: 'Congés JV', start: '2099-10-13T22:00:00Z', end: '2099-10-15T22:00:00Z', allDay: true }),
    rdv({ sujet: 'Formation', start: '2099-10-13T08:00:00Z', end: '2099-10-15T16:00:00Z' }),
    rdv({ sujet: 'Annulé', start: '2099-10-14T10:00:00Z', cancelled: true }),
    rdv({ sujet: 'Demain', start: '2099-10-15T10:00:00Z' })
  ];
  const liste = agendaDuJourDepuisEvenements(evenements, '2099-10-14', [{ id: 'd1', nom: 'DUPONT / MARTIN' }]);
  assert.equal(liste.map((e) => e.sujet).join('|'), 'Congés JV|Formation|VTE - DUPONT / MARTIN|Rendez-vous banque');
  const [conges, formation, signature, banque] = liste;
  assert.equal(conges.journeeEntiere, true);
  assert.equal(conges.absence, true);
  assert.equal(formation.journeeEntiere, true, 'un événement de plusieurs jours couvre le jour entier');
  assert.equal(formation.heure, null);
  assert.equal(signature.heure, '10:00');
  assert.equal(signature.heureFin, '11:00');
  assert.equal(signature.signature, true);
  assert.equal(signature.dossierId, 'd1');
  assert.equal(signature.categories.join('|'), 'Catégorie Verte');
  assert.equal(banque.dossierId, null);
  assert.equal(banque.signature, false);
  assert.equal(banque.lieu, 'Crédit Exemple');
});

test('agendaDuJourDepuisEvenements : aucun événement ce jour-là → liste vide', () => {
  assert.equal(agendaDuJourDepuisEvenements([rdv({ sujet: 'Autre jour', start: '2099-10-20T08:00:00Z' })], '2099-10-14', []).length, 0);
  assert.equal(agendaDuJourDepuisEvenements(null, '2099-10-14', []).length, 0);
});

test('lundiSemainePrecedente : lundi de la semaine d’avant', () => {
  const { lundiSemainePrecedente } = require('../src/agendaOffice');
  assert.equal(lundiSemainePrecedente('2026-09-30'), '2026-09-21', 'mercredi');
  assert.equal(lundiSemainePrecedente('2026-09-28'), '2026-09-21', 'lundi');
  assert.equal(lundiSemainePrecedente('2026-10-04'), '2026-09-21', 'dimanche');
});

test('evenementsAgendaOffice : tous les rendez-vous non annulés, avec identifiant, triés', () => {
  const { evenementsAgendaOffice } = require('../src/agendaOffice');
  const liste = evenementsAgendaOffice([
    evenementDepuisEws({ itemId: 'B', subject: 'Point équipe', start: '2099-10-15T12:00:00Z', end: '2099-10-15T13:00:00Z' }),
    evenementDepuisEws({ itemId: 'A', changeKey: 'k', subject: 'VTE - DUPONT / MARTIN', start: '2099-10-14T08:00:00Z', end: '2099-10-14T09:00:00Z' }),
    evenementDepuisEws({ itemId: 'C', subject: 'Annulé', start: '2099-10-14T10:00:00Z', cancelled: true }),
    evenementDepuisEws({ itemId: 'D', subject: 'Congés JS', start: '2099-10-13T22:00:00Z', end: '2099-10-16T22:00:00Z', allDay: true })
  ], [{ id: 'd1', nom: 'DUPONT / MARTIN' }]);
  assert.equal(liste.map((e) => e.itemId).join('|'), 'D|A|B');
  assert.equal(liste[0].dateFin, '2099-10-16');
  assert.equal(liste[0].absence, true);
  assert.equal(liste[1].changeKey, 'k');
  assert.equal(liste[1].dossierId, 'd1');
  assert.equal(liste[1].signature, true);
  assert.equal(liste[2].heure, '14:00');
});

test('compterRendezVousPeriode : seuls les rendez-vous d’une heure ou plus comptent (étude, 01/10)', () => {
  const { compterRendezVousPeriode, dureeRendezVousMinutes } = require('../src/agendaOffice');
  assert.equal(dureeRendezVousMinutes({ date: '2026-10-05', heure: '09:30', heureFin: '10:30' }), 60);
  assert.equal(dureeRendezVousMinutes({ date: '2026-10-05', heure: '17:00', dateFin: '2026-10-06', heureFin: '09:00' }), 960);
  assert.equal(dureeRendezVousMinutes({ date: '2026-10-05', heure: '09:30' }), null);
  const c = compterRendezVousPeriode([
    { sujet: 'VTE - DUPONT / MARTIN', date: '2026-10-05', heure: '10:00', heureFin: '11:00', signature: true },
    { sujet: 'VTE - LEROY', date: '2026-10-06', heure: '10:00', heureFin: '10:45', signature: true },
    { sujet: 'Point', date: '2026-10-06', heure: '14:00', heureFin: '14:59' },
    { sujet: 'Succession', date: '2026-10-07', heure: '14:00', heureFin: '16:30' },
    { sujet: 'Sans fin', date: '2026-10-08', heure: '15:00' }
  ], '2026-10-05', '2026-10-10');
  assert.equal(c.rendezVous, 2);
  assert.equal(c.signatures, 1);
});

// ---- Actes de l'année d'après l'agenda (étude, 03/10) ----
const { natureActeAgenda, compterActesAgendaPeriode, periodesActesAnnee } = require('../src/agendaOffice');

test('natureActeAgenda : DONATION en tête, puis référence de vente, puis SUCC', () => {
  assert.equal(natureActeAgenda('DONATION MARTIN / MARTIN'), 'donation');
  assert.equal(natureActeAgenda('Donation-partage DUPONT'), 'donation');
  assert.equal(natureActeAgenda('VTE - DUPONT / MARTIN'), 'vente');
  assert.equal(natureActeAgenda('VENTE LEROY / BERNARD'), 'vente');
  assert.equal(natureActeAgenda('VTE SUCC DURAND / PETIT'), 'vente', 'la vente d’un bien de succession reste une vente');
  assert.equal(natureActeAgenda('SUCC DURAND'), 'succession');
  assert.equal(natureActeAgenda('Succ. MOREAU - attestation'), 'succession');
  assert.equal(natureActeAgenda('SUCCESSION GIRARD'), 'succession');
  assert.equal(natureActeAgenda('Point succès formation'), null);
  assert.equal(natureActeAgenda('RDV banque pour donation'), null, 'DONATION seulement en tête du titre');
  assert.equal(natureActeAgenda('Rendez-vous client'), null);
});

test('compterActesAgendaPeriode : rendez-vous horaires confirmés de la période, sans doublon', () => {
  const evts = [
    { sujet: 'VTE - DUPONT / MARTIN', date: '2026-02-10', heure: '10:00', heureFin: '11:00' },
    { sujet: 'VTE - DUPONT / MARTIN', date: '2026-02-10', heure: '10:00', heureFin: '11:00' },   // doublon
    { sujet: 'VTE - LEROY ??', date: '2026-03-02', heure: '14:00' },                              // pas confirmé
    { sujet: 'VTE - BLANC ? — option CLAIRE, créneau 1/3', date: '2026-03-03', heure: '14:00', option: true },
    { sujet: 'VTE - ROUX', date: '2026-03-04', heure: '15:00', categories: ['Annulé / à replacer'] },
    { sujet: 'Date butoir prêt - VTE - NOEL', date: '2026-03-05', journeeEntiere: true },
    { sujet: 'SUCC DURAND', date: '2026-04-01', heure: '09:30', heureFin: '10:00' },             // 30 min : compté quand même
    { sujet: 'SUCC MOREAU', date: '2026-05-01', heure: '11:00', annule: true },
    { sujet: 'DONATION GIRARD', date: '2026-06-01', heure: '16:00' },
    { sujet: 'DONATION FAURE', date: '2025-12-31', heure: '16:00' },                             // hors période
    { sujet: 'Rendez-vous client', date: '2026-06-02', heure: '10:00' }
  ];
  assert.deepEqual({ ...compterActesAgendaPeriode(evts, '2026-01-01', '2026-12-31', 'annule / a replacer') }, { ventes: 1, successions: 1, donations: 1 });
  assert.equal(compterActesAgendaPeriode(evts, '2026-01-01', '2026-12-31', '').ventes, 2, 'sans catégorie réglée, le rendez-vous jaune compte');
});

test('periodesActesAnnee : année en cours au jour, même période et toute l’année précédente', () => {
  const p = periodesActesAnnee('2026-10-03');
  assert.equal(`${p.actuel.debut} ${p.actuel.fin}`, '2026-01-01 2026-10-03');
  assert.equal(`${p.aVenir.debut} ${p.aVenir.fin}`, '2026-10-04 2026-12-31');
  assert.equal(`${p.anneeEnCours.debut} ${p.anneeEnCours.fin}`, '2026-01-01 2026-12-31');
  assert.equal(`${p.memePeriode.debut} ${p.memePeriode.fin}`, '2025-01-01 2025-10-03');
  assert.equal(`${p.anneePrecedente.debut} ${p.anneePrecedente.fin}`, '2025-01-01 2025-12-31');
  assert.equal(periodesActesAnnee('2028-02-29').memePeriode.fin, '2027-02-28');
});

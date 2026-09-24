'use strict';

// Lecture de l'agenda de l'office (voir src/agendaOffice.js) : parsing .ics et rapprochement au
// dossier, tous deux purs. Le plus important à couvrir : ne jamais se tromper de dossier (une
// ambiguïté doit rendre `null`, jamais un choix arbitraire) et ne jamais planter sur un flux mal
// formé (un vrai calendrier Outlook publié peut contenir des lignes repliées, des caractères
// échappés, des événements annulés).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  deplierLignesIcs, decoderTexteIcs, parseIcsEvenements, dateDepuisDtstart,
  extraireReferenceVte, referenceDossierEvenement, detecteAppelDeFonds, detecteProjetEnvoye,
  detecterActionsEvenement, dossierPourReferenceAgenda, actionsDetecteesDepuisIcs
} = require('../src/agendaOffice');

test('deplierLignesIcs recolle une ligne repliee (RFC 5545) sans en perdre le contenu', () => {
  // Le dépliage retire exactement UN caractère d'espacement en tête de la ligne de continuation
  // (RFC 5545 §3.1) — pour conserver l'espace réel du texte d'origine entre « DUPONT » et « / »,
  // la ligne repliée doit donc en porter DEUX : celui qu'exige le repliement, et celui du contenu.
  const brut = 'BEGIN:VEVENT\r\nSUMMARY:VTE - DUPONT\r\n  / MARTIN - Appel de fonds\r\nEND:VEVENT';
  const lignes = deplierLignesIcs(brut);
  assert.deepEqual(lignes, ['BEGIN:VEVENT', 'SUMMARY:VTE - DUPONT / MARTIN - Appel de fonds', 'END:VEVENT']);
});

test('decoderTexteIcs retire les echappements standard (virgule, point-virgule, retour a la ligne)', () => {
  assert.equal(decoderTexteIcs('VTE - DUPONT\\, MARTIN'), 'VTE - DUPONT, MARTIN');
  assert.equal(decoderTexteIcs('Appel de fonds\\; projet envoye'), 'Appel de fonds; projet envoye');
  assert.equal(decoderTexteIcs('Ligne 1\\nLigne 2'), 'Ligne 1\nLigne 2');
});

function icsEvenement({ summary, description, dtstart, status }) {
  return [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    summary !== undefined ? `SUMMARY:${summary}` : null,
    description !== undefined ? `DESCRIPTION:${description}` : null,
    dtstart !== undefined ? `DTSTART:${dtstart}` : null,
    status !== undefined ? `STATUS:${status}` : null,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter((l) => l !== null).join('\r\n');
}

test('parseIcsEvenements lit summary/description/dtstart/status d\'un vrai flux', () => {
  const texte = icsEvenement({ summary: 'VTE - DUPONT / MARTIN - Appel de fonds', dtstart: '20261014T140000Z' });
  const evts = parseIcsEvenements(texte);
  assert.equal(evts.length, 1);
  assert.equal(evts[0].summary, 'VTE - DUPONT / MARTIN - Appel de fonds');
  assert.equal(evts[0].dtstart, '20261014T140000Z');
});

test('parseIcsEvenements ignore ce qui est hors VEVENT et gere plusieurs evenements', () => {
  const texte = [
    'BEGIN:VCALENDAR',
    'X-WR-CALNAME:Office',
    icsEvenement({ summary: 'VTE - A / B', dtstart: '20261001' }).split('\r\n').slice(1, -1).join('\r\n'),
    icsEvenement({ summary: 'VTE - C / D', dtstart: '20261002' }).split('\r\n').slice(1, -1).join('\r\n'),
    'END:VCALENDAR'
  ].join('\r\n');
  const evts = parseIcsEvenements(texte);
  assert.equal(evts.length, 2);
  assert.equal(evts[0].summary, 'VTE - A / B');
  assert.equal(evts[1].summary, 'VTE - C / D');
});

test('parseIcsEvenements ne laisse pas un VALARM imbrique ecraser la description de l\'evenement', () => {
  const texte = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:VTE - DUPONT / MARTIN',
    'DESCRIPTION:Appel de fonds envoye',
    'DTSTART:20261014',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Rappel',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const evts = parseIcsEvenements(texte);
  assert.equal(evts.length, 1);
  assert.equal(evts[0].description, 'Appel de fonds envoye');
});

test('dateDepuisDtstart accepte la forme toute-la-journee et la forme horodatee', () => {
  assert.equal(dateDepuisDtstart('20261014'), '2026-10-14');
  assert.equal(dateDepuisDtstart('20261014T140000Z'), '2026-10-14');
  assert.equal(dateDepuisDtstart('20261014T140000'), '2026-10-14');
  assert.equal(dateDepuisDtstart(''), null);
  assert.equal(dateDepuisDtstart(undefined), null);
});

test('extraireReferenceVte reconnait VTE avec differents separateurs, et rien sans le mot VTE', () => {
  assert.equal(extraireReferenceVte('VTE - DUPONT / MARTIN'), 'DUPONT / MARTIN');
  assert.equal(extraireReferenceVte('VTE: DUPONT / MARTIN'), 'DUPONT / MARTIN');
  assert.equal(extraireReferenceVte('VTE – DUPONT / MARTIN'), 'DUPONT / MARTIN');
  assert.equal(extraireReferenceVte('vte dupont / martin'), 'dupont / martin');
  assert.equal(extraireReferenceVte('Rendez-vous signature DUPONT'), '');
  assert.equal(extraireReferenceVte(''), '');
});

test('extraireReferenceVte garde les mots-cles d\'action colles a la reference (tolere par le matching)', () => {
  assert.equal(extraireReferenceVte('VTE - DUPONT / MARTIN - Appel de fonds'), 'DUPONT / MARTIN - Appel de fonds');
});

test('referenceDossierEvenement cherche d\'abord le resume, puis la description en repli', () => {
  assert.equal(referenceDossierEvenement({ summary: 'VTE - A / B', description: '' }), 'A / B');
  assert.equal(referenceDossierEvenement({ summary: 'RDV signature', description: 'VTE - A / B - projet envoye' }), 'A / B - projet envoye');
  assert.equal(referenceDossierEvenement({ summary: 'RDV signature', description: '' }), '');
});

test('detecteAppelDeFonds : la phrase complete insensible a la casse, l\'abreviation seulement en capitales', () => {
  assert.equal(detecteAppelDeFonds('Appel de fonds envoye'), true);
  assert.equal(detecteAppelDeFonds('APPEL DE FONDS'), true);
  assert.equal(detecteAppelDeFonds('VTE - DUPONT - AF'), true);
  assert.equal(detecteAppelDeFonds('VTE - DUPONT - af'), false, 'af en minuscules ne doit pas matcher (trop de faux positifs)');
  assert.equal(detecteAppelDeFonds('Rendez-vous signature'), false);
});

test('detecteProjetEnvoye : les deux ordres de mots, jamais un texte sans rapport', () => {
  assert.equal(detecteProjetEnvoye('projet envoye'), true);
  assert.equal(detecteProjetEnvoye('Projet d\'acte envoyé au client'), true);
  assert.equal(detecteProjetEnvoye('envoi du projet d\'acte'), true);
  assert.equal(detecteProjetEnvoye('Appel de fonds'), false);
  assert.equal(detecteProjetEnvoye('projet de vente en cours de redaction'), false);
});

test('detecterActionsEvenement combine resume et description', () => {
  const actions = detecterActionsEvenement({ summary: 'VTE - DUPONT / MARTIN', description: 'Appel de fonds + projet envoyé' });
  assert.deepEqual(actions, { appelFonds: true, projetEnvoye: true });
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

test('dossierPourReferenceAgenda : un dossier archive/supprime absent de la liste n\'est jamais candidat', () => {
  const dossiers = [{ id: 'd1', nom: 'DUPONT / MARTIN' }];
  assert.equal(dossierPourReferenceAgenda('DUPONT', dossiers), null, 'un seul mot significatif sur deux ne suffit pas');
});

test('actionsDetecteesDepuisIcs : bout en bout sur un flux realiste, un evenement = une detection', () => {
  const texte = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:VTE - DUPONT / MARTIN - Appel de fonds',
    'DTSTART:20261014T090000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:VTE - DURAND / LEROY - projet envoye',
    'DTSTART:20261015',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Reunion interne',
    'DTSTART:20261016',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const dossiers = [
    { id: 'd1', nom: 'DUPONT / MARTIN' },
    { id: 'd2', nom: 'DURAND / LEROY' }
  ];
  const resultats = actionsDetecteesDepuisIcs(texte, dossiers);
  assert.equal(resultats.length, 2);
  assert.equal(resultats[0].dossierId, 'd1');
  assert.equal(resultats[0].appelFonds, true);
  assert.equal(resultats[0].projetEnvoye, false);
  assert.equal(resultats[0].dateIso, '2026-10-14');
  assert.equal(resultats[1].dossierId, 'd2');
  assert.equal(resultats[1].projetEnvoye, true);
});

test('actionsDetecteesDepuisIcs : ignore un evenement annule (STATUS:CANCELLED)', () => {
  const texte = icsEvenement({ summary: 'VTE - DUPONT / MARTIN - Appel de fonds', dtstart: '20261014', status: 'CANCELLED' });
  assert.deepEqual(actionsDetecteesDepuisIcs(texte, [{ id: 'd1', nom: 'DUPONT / MARTIN' }]), []);
});

test('actionsDetecteesDepuisIcs : un evenement sans VTE ou sans date exploitable est ignore', () => {
  const sansVte = icsEvenement({ summary: 'Appel de fonds DUPONT', dtstart: '20261014' });
  assert.deepEqual(actionsDetecteesDepuisIcs(sansVte, [{ id: 'd1', nom: 'DUPONT / MARTIN' }]), []);
  const sansDate = icsEvenement({ summary: 'VTE - DUPONT / MARTIN - Appel de fonds' });
  assert.deepEqual(actionsDetecteesDepuisIcs(sansDate, [{ id: 'd1', nom: 'DUPONT / MARTIN' }]), []);
});

test('actionsDetecteesDepuisIcs : sans correspondance sure, dossierId reste null (jamais devine)', () => {
  const texte = icsEvenement({ summary: 'VTE - INCONNU / PERSONNE - Appel de fonds', dtstart: '20261014' });
  const resultats = actionsDetecteesDepuisIcs(texte, [{ id: 'd1', nom: 'DUPONT / MARTIN' }]);
  assert.equal(resultats.length, 1);
  assert.equal(resultats[0].dossierId, null);
});

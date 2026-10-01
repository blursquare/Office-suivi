'use strict';

// Visio ADNOV (étude, 01/10) : l'invitation .ics rendue par le site de la profession est lue dans le
// navigateur et son lien écrit dans les notes du rendez-vous existant — jamais un second rendez-vous.
// Invitations inventées, sur le modèle d'un export de réunion (lignes repliées, échappements).

const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

const ICS_UTC = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Exemple//Visio//FR',
  'BEGIN:VEVENT',
  'UID:abc-123@exemple.test',
  'DTSTART:20261021T130000Z',
  'DTEND:20261021T140000Z',
  'SUMMARY:Signature VTE - DUPONT\\, visio',
  'LOCATION:https://ls.visio.adnov.fr/call/123456',
  'DESCRIPTION:Rejoindre la réunion :\\nhttps://ls.visio.adnov.fr/call/123456\\nCode de la r',
  ' éunion : 123456\\nPar téléphone : 01 00 00 00 00',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

test('lireInvitationIcs : lien, date et heure de Paris (UTC converti), détails utiles', () => {
  const inv = app.lireInvitationIcs(ICS_UTC);
  assert.equal(inv.lien, 'https://ls.visio.adnov.fr/call/123456');
  assert.equal(inv.date, '2026-10-21');
  assert.equal(inv.heure, '15:00', '13 h UTC = 15 h à Paris en octobre (heure d’été)');
  assert.equal(inv.heureFin, '16:00');
  assert.equal(inv.resume, 'Signature VTE - DUPONT, visio');
  assert.equal(inv.details, 'Code de la réunion : 123456\nPar téléphone : 01 00 00 00 00', 'les lignes qui annoncent le lien sont retirées');
});

test('lireInvitationIcs : heure avec TZID prise telle quelle, lien dans la description seulement', () => {
  const inv = app.lireInvitationIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;TZID=Europe/Paris:20261203T100000\nDESCRIPTION:Lien : https://ls.visio.adnov.fr/x/42.\nEND:VEVENT\nEND:VCALENDAR');
  assert.equal(inv.date, '2026-12-03');
  assert.equal(inv.heure, '10:00');
  assert.equal(inv.lien, 'https://ls.visio.adnov.fr/x/42', 'ponctuation finale retirée');
  assert.equal(inv.details, '', '« Lien : https://… » n’est pas répété');
});

test('lireInvitationIcs : rien sans événement, aucun lien deviné', () => {
  assert.equal(app.lireInvitationIcs('pas un calendrier'), null);
  assert.equal(app.lireInvitationIcs('BEGIN:VEVENT\nDTSTART:20261021T090000\nDESCRIPTION:voir http://non-securise.test\nEND:VEVENT').lien, '');
});

test('notesAvecVisio : ajoute le bloc à la fin, le remplace à la seconde invitation, garde le reste', () => {
  const inv1 = { lien: 'https://ls.visio.adnov.fr/call/1', details: 'Code : 1' };
  const inv2 = { lien: 'https://ls.visio.adnov.fr/call/2', details: '' };
  const n1 = app.notesAvecVisio('Apporter le RIB.', inv1);
  assert.equal(n1, 'Apporter le RIB.\n\nVisio ADNOV : https://ls.visio.adnov.fr/call/1\nCode : 1');
  assert.equal(app.lienVisioDansNotes(n1), 'https://ls.visio.adnov.fr/call/1');
  const n2 = app.notesAvecVisio(n1 + '\n\nAppel de fonds envoyé.', inv2);
  assert.equal(n2, 'Apporter le RIB.\n\nVisio ADNOV : https://ls.visio.adnov.fr/call/2\n\nAppel de fonds envoyé.');
  assert.equal(app.notesAvecVisio('', inv2), 'Visio ADNOV : https://ls.visio.adnov.fr/call/2');
  assert.equal(app.lienVisioDansNotes('Aucune visio ici'), '');
});

test('rendezVousPourInvitation : même date et même heure, rendez-vous d’Outlook seulement', () => {
  const evts = [
    { itemId: 'A', date: '2026-10-21', heure: '15:00', sujet: 'VTE - DUPONT' },
    { itemId: 'B', date: '2026-10-21', heure: '16:00', sujet: 'Autre' },
    { itemId: 'C', date: '2026-10-21', heure: '15:00', option: true, sujet: 'VTE - DUPONT ?' },
    { date: '2026-10-21', heure: '15:00', horsAgenda: true, sujet: 'Signature CLAIRE' }
  ];
  assert.equal(app.rendezVousPourInvitation(evts, { date: '2026-10-21', heure: '15:00' }).map(e => e.itemId).join(','), 'A');
  assert.equal(app.rendezVousPourInvitation(evts, { date: '2026-10-21', heure: '' }).length, 0);
});

test('estVisioAgenda : catégorie visio réglée, ou signature d’un dossier en visio sans catégorie', () => {
  const cats = { office: 'Catégorie Verte', visio: 'Catégorie Violette', confrere: 'Catégorie Orange' };
  assert.equal(app.estVisioAgenda({ categories: ['Catégorie Violette'] }, cats, null), true);
  assert.equal(app.estVisioAgenda({ categories: ['Catégorie Verte'] }, cats, { rendezVousType: 'visio' }), false);
  assert.equal(app.estVisioAgenda({ signature: true, categories: [] }, cats, { rendezVousType: 'visio' }), true);
  assert.equal(app.estVisioAgenda({ categories: [] }, cats, null), false);
});

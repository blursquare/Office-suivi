'use strict';
// Fenêtre du matin (étude, 30/09) : tous les rendez-vous de l'agenda du jour, et un résumé des
// emails reçus depuis la veille (sans IA : expéditeur, objet, sujets repérés). Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('evenementsAgendaDuJour : seulement l’agenda lu aujourd’hui', () => {
  const agenda = { jour: '2099-10-14', evenements: [{ sujet: 'Point équipe', heure: '09:00' }] };
  assert.equal(app.evenementsAgendaDuJour(agenda, '2099-10-14').length, 1);
  assert.equal(app.evenementsAgendaDuJour(agenda, '2099-10-15'), null, 'agenda de la veille : rien');
  assert.equal(app.evenementsAgendaDuJour(null, '2099-10-14'), null);
});

test('teinteEvenementAgenda : absence et date butoir d’abord, puis la couleur Outlook, le type réglé, signature, autre', () => {
  const reglees = { office: 'Signature office', visio: 'Catégorie Violette', confrere: 'Chez confrère' };
  assert.equal(app.teinteEvenementAgenda({ categories: ['catégorie verte'], signature: true }, reglees), 'vert');
  assert.equal(app.teinteEvenementAgenda({ categories: ['Catégorie Jaune'] }, reglees), 'jaune');
  // Étude, 01/10 : absences et dates butoir en rose, quelle que soit leur catégorie Outlook.
  assert.equal(app.teinteEvenementAgenda({ categories: ['Catégorie Rouge'], absence: true }, reglees), 'absence');
  assert.equal(app.teinteEvenementAgenda({ sujet: 'Obtention du prêt — MARTIN - Dossier DURAND / MARTIN', journeeEntiere: true, categories: ['Catégorie Bleue'] }, reglees), 'butoir');
  assert.equal(app.teinteEvenementAgenda({ categories: ['Signature office'] }, reglees), 'office', 'catégorie sans couleur dans son nom : le type réglé');
  assert.equal(app.teinteEvenementAgenda({ categories: [], signature: true }, reglees), 'signature');
  assert.equal(app.teinteEvenementAgenda({ absence: true, categories: [] }, reglees), 'absence');
  assert.equal(app.teinteEvenementAgenda({ categories: ['Perso'] }, reglees), 'autre');
});

test('couleurCategorieOutlook : noms français et anglais, accents et casse ignorés', () => {
  assert.equal(app.couleurCategorieOutlook('Catégorie Bleue'), 'bleu');
  assert.equal(app.couleurCategorieOutlook('Purple category'), 'violet');
  // « Violet » tout court (étude 16/10 : jamais affiché en violet) et vert olive / vert foncé à part du vert.
  assert.equal(app.couleurCategorieOutlook('Violet'), 'violet');
  assert.equal(app.couleurCategorieOutlook('Vert olive'), 'olive');
  assert.equal(app.couleurCategorieOutlook('Dark Green category'), 'olive');
  assert.equal(app.couleurCategorieOutlook('Catégorie Verte'), 'vert');
  assert.equal(app.couleurCategorieOutlook('Catégorie Grise'), 'gris');
  assert.equal(app.couleurCategorieOutlook('Vertical'), '', 'jamais au milieu d’un mot');
  assert.equal(app.couleurCategorieOutlook('Rendez-vous client'), '');
});

test('natureEvenementAgenda : le type réglé pour l’étiquette, même quand la couleur vient du nom', () => {
  const reglees = { office: 'Catégorie Verte' };
  const e = { categories: ['Catégorie Verte'], signature: true };
  assert.equal(app.teinteEvenementAgenda(e, reglees), 'vert');
  assert.equal(app.etiquetteEvenementAgenda(e, app.natureEvenementAgenda(e, reglees)), 'Signature · Office');
  assert.equal(app.etiquetteEvenementAgenda({ categories: ['Catégorie Jaune'] }, app.natureEvenementAgenda({ categories: ['Catégorie Jaune'] }, reglees)), 'Catégorie Jaune');
});

test('etiquetteEvenementAgenda : ce qui s’affiche au-dessus du titre', () => {
  assert.equal(app.etiquetteEvenementAgenda({ signature: true }, 'office'), 'Signature · Office');
  assert.equal(app.etiquetteEvenementAgenda({}, 'visio'), 'En visio');
  assert.equal(app.etiquetteEvenementAgenda({ signature: true }, 'signature'), 'Signature');
  assert.equal(app.etiquetteEvenementAgenda({}, 'absence'), 'Absence');
  assert.equal(app.etiquetteEvenementAgenda({ categories: ['Réunion'] }, 'autre'), 'Réunion');
  assert.equal(app.etiquetteEvenementAgenda({ journeeEntiere: true }, 'autre'), 'Journée entière');
  assert.equal(app.etiquetteEvenementAgenda({}, 'autre'), 'Rendez-vous');
});

test('momentEvenementAgenda : passé, en cours, à venir', () => {
  const e = { heure: '10:00', heureFin: '11:00' };
  assert.equal(app.momentEvenementAgenda(e, '09:30'), 'a-venir');
  assert.equal(app.momentEvenementAgenda(e, '10:30'), 'en-cours');
  assert.equal(app.momentEvenementAgenda(e, '11:00'), 'passe');
  assert.equal(app.momentEvenementAgenda({ heure: '08:00' }, '09:00'), 'passe', 'sans heure de fin');
  assert.equal(app.momentEvenementAgenda({ journeeEntiere: true }, '23:00'), 'journee');
});

// Fenêtre du matin, colonne « Depuis hier 18 h » (étude 02/10).
test('debutDepuisHier18h : 18 h le jour ouvré précédent, le vendredi pour un lundi', () => {
  const d = (iso) => new Date(app.debutDepuisHier18h(new Date(iso)));
  const mardi = d('2026-10-06T09:00:00');
  assert.equal(`${mardi.getDate()}/${mardi.getMonth() + 1} ${mardi.getHours()}h`, '5/10 18h');
  const lundi = d('2026-10-05T09:00:00');
  assert.equal(`${lundi.getDate()}/${lundi.getMonth() + 1} ${lundi.getHours()}h`, '2/10 18h');
  assert.equal(app.libelleDepuisHier18h(app.debutDepuisHier18h(new Date('2026-10-06T09:00:00')), new Date('2026-10-06T09:00:00')), 'Depuis hier 18 h');
  assert.equal(app.libelleDepuisHier18h(app.debutDepuisHier18h(new Date('2026-10-05T09:00:00')), new Date('2026-10-05T09:00:00')), 'Depuis vendredi 18 h');
});

test('documentsDepuis : pièces reçues et cochées depuis hier 18 h, les plus récentes d’abord', () => {
  const d1 = { id: 'd1', nom: 'MARTEL / FAURE', typeVente: 'maison', pieces: { erp: 'recue', titrePropriete: 'recue', diagnosticsTechniques: 'manquante' },
    piecesTrouveesLe: { erp: '2026-10-06T07:10:00Z', titrePropriete: '2026-10-05T08:00:00Z', diagnosticsTechniques: '2026-10-06T07:30:00Z' } };
  const d2 = { id: 'd2', nom: 'PETIT', typeVente: 'maison', pieces: {}, piecesTrouveesLe: { 'offre-pret': '2026-10-06T06:00:00Z' } };
  const docs = app.documentsDepuis([d1, d2], '2026-10-05T16:00:00Z');
  assert.equal(docs.map(x => `${x.dossier.id}:${x.libelle}`).join('|'), 'd1:ERP (état des risques et pollution)|d2:Offre de prêt');
});

test('libelleEmailsExclus : total et détail par motif', () => {
  assert.equal(app.libelleEmailsExclus({ total: 9, parMotif: { SPF: 5, 'Publicité': 2, CRIDON: 2 } }), '9 écartés : SPF 5, publicités 2, CRIDON 2');
  assert.equal(app.libelleEmailsExclus({ total: 0, parMotif: {} }), '');
});

test('agenda du jour : le rendez-vous et son invitation visio (même titre, mêmes heures) ne font qu’une ligne (étude 27/10)', () => {
  const l = app.sansDoublonsAgendaJour([
    { date: '2026-10-27', heure: '17:00', heureFin: '18:00', sujet: 'Point succession Paul VERNIER', lieu: 'Marie en présentiel - Arnaud en visio', categories: ['Visio'] },
    { date: '2026-10-27', heure: '17:00', heureFin: '18:00', sujet: 'Point succession Paul  VERNIER', categories: ['Catégorie bleue'] },
    { date: '2026-10-27', heure: '17:00', heureFin: '18:30', sujet: 'Point succession Paul VERNIER' },
    { date: '2026-10-27', heure: '09:00', heureFin: '10:00', sujet: 'Autre rendez-vous' }
  ]);
  assert.equal(l.length, 3, 'deux heures de fin différentes restent deux rendez-vous');
  assert.equal(l[0].lieu, 'Marie en présentiel - Arnaud en visio');
  const s = app.sansDoublonsAgendaJour([
    { date: '2026-10-27', heure: '10:00', heureFin: '11:00', sujet: 'VTE - DUPONT', horsAgenda: true, dossierId: 'd1', dossierNom: 'DUPONT' },
    { date: '2026-10-27', heure: '10:00', heureFin: '11:00', sujet: 'VTE - DUPONT', itemId: 'outlook-1', categories: ['Vert'] }
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].itemId, 'outlook-1', 'l’élément d’Outlook est gardé, pas la signature hors agenda');
  assert.equal(s[0].dossierId, 'd1', 'il reprend le dossier reconnu');
  assert.ok(!s[0].horsAgenda);
});

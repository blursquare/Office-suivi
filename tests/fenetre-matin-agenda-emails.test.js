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

test('syntheseEmailsMatin : chiffres, sujets avec leurs dossiers, lignes par dossier, expéditeurs hors dossiers', () => {
  const groupes = [
    { dossierId: 'd1', dossierNom: 'DURAND / MARTIN', emails: [
      { de: 'Banque Exemple', sujets: ['Offre de prêt'], pj: true },
      { de: 'Me LEFEVRE', sujets: ['Rendez-vous'] }
    ] },
    { dossierId: 'd2', dossierNom: 'PETIT', emails: [
      { de: 'Banque Exemple', sujets: ['Offre de prêt', 'Urgent'] },
      { de: 'Agence du Centre', sujets: [] },
      { de: 'Agence du Centre', sujets: ['Pièces'], pj: true }
    ] }
  ];
  const autres = [
    { de: 'Fournisseur', sujets: [] }, { de: 'Fournisseur', sujets: ['Urgent'] }, { de: 'Syndic Exemple', sujets: [] }
  ];
  const s = app.syntheseEmailsMatin(groupes, autres);
  assert.equal(s.nb, 8);
  assert.equal(s.nbDossiers, 2);
  assert.equal(s.nbDansDossiers, 5);
  assert.equal(s.nbAutres, 3);
  assert.equal(s.nbPj, 2);
  assert.equal(s.themes.map(t => `${t.libelle}:${t.dossiers.map(d => d.dossierId).join('+')}:${t.horsDossier}`).join('|'),
    'Urgent:d2:1|Offre de prêt:d1+d2:0|Rendez-vous:d1:0|Pièces:d2:0');
  assert.equal(s.parDossier.map(g => `${g.dossierId}:${g.nb}:${g.expediteurs.join('+')}`).join('|'),
    'd2:3:Agence du Centre+Banque Exemple|d1:2:Banque Exemple+Me LEFEVRE');
  assert.equal(s.expediteursAutres.map(x => `${x.de}:${x.nb}`).join('|'), 'Fournisseur:2|Syndic Exemple:1');
});

test('syntheseEmailsMatin : aucun email', () => {
  const s = app.syntheseEmailsMatin([], []);
  assert.equal(s.nb, 0);
  assert.equal(s.themes.length, 0);
});

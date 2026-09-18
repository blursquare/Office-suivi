'use strict';

// Regroupement des échéances par semaine pour la vue "Semaines" du Suivi (voir la section
// « SUIVI : regroupement des échéances par semaine » dans script.js). Le point qui compte :
// UNE LIGNE = UNE ÉCHÉANCE, choix explicite de l'étude — un même dossier apparaît sous plusieurs
// semaines si ses échéances y tombent, parce que c'est la charge de travail de la semaine qu'on
// lit, pas un classement de dossiers.
//
// La date du jour est toujours injectée : les fonctions restent pures et les tests reproductibles.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Mardi 15 septembre 2026. La semaine ISO correspondante commence le lundi 14.
const AUJOURDHUI = '2026-09-15';
const LUNDI = '2026-09-14';

function dossier(nom, champs) {
  return Object.assign({ id: nom, nom, responsable: 'Julie VASSELIN', pret: '', acte: '', ventebien: '', autres: [] }, champs);
}

test('debutSemaine ramène au lundi, dimanche compris', () => {
  const app = chargerApplication();
  assert.equal(app.debutSemaine('2026-09-14'), LUNDI); // déjà un lundi
  assert.equal(app.debutSemaine('2026-09-15'), LUNDI); // mardi
  // Dimanche : getDay() vaut 0, le piège classique du calcul de semaine ISO — il appartient à la
  // semaine qui a commencé le lundi précédent, pas à celle qui commence le lendemain.
  assert.equal(app.debutSemaine('2026-09-20'), LUNDI);
  assert.equal(app.debutSemaine('2026-09-21'), '2026-09-21'); // lundi suivant
});

test('debutSemaine ne plante pas sur une date absente ou invalide', () => {
  const app = chargerApplication();
  assert.equal(app.debutSemaine(''), null);
  assert.equal(app.debutSemaine(null), null);
  assert.equal(app.debutSemaine('pas une date'), null);
});

test('toutesEcheances renvoie TOUTES les échéances, pas seulement la plus proche', () => {
  const app = chargerApplication();
  const d = dossier('DUPONT / MARTIN', {
    pret: '2026-09-18', acte: '2026-12-15', ventebien: '2026-10-02',
    autres: [{ label: 'Diagnostic amiante', date: '2026-09-25' }]
  });
  assert.equal(app.toutesEcheances(d).map(e => e.type).sort().join(','), 'acte,autre,pret,ventebien');
});

test('une offre de prêt déjà reçue retire son échéance du planning', () => {
  // La condition est résolue : la laisser apparaître donnerait du travail qui n'existe plus —
  // même exclusion que prochaineEcheanceDetail() dans la vue tableau.
  const app = chargerApplication();
  const d = dossier('X', { pret: '2026-09-18', acte: '2026-12-15', offrePretStatut: 'recue' });
  assert.equal(app.toutesEcheances(d).map(e => e.type).join(','), 'acte');
});

test('un dossier apparaît dans plusieurs semaines si ses échéances y tombent', () => {
  const app = chargerApplication();
  const d = dossier('DUPONT / MARTIN', { pret: '2026-09-17', acte: '2026-09-24' });
  const groupes = app.grouperEcheancesParSemaine([d], AUJOURDHUI);
  assert.equal(groupes.length, 2);
  assert.equal(groupes[0].items.length, 1);
  assert.equal(groupes[1].items.length, 1);
  // Le même dossier des deux côtés, avec deux échéances différentes.
  assert.equal(groupes[0].items[0].dossier.nom, 'DUPONT / MARTIN');
  assert.equal(groupes[1].items[0].dossier.nom, 'DUPONT / MARTIN');
  assert.equal(groupes[0].items[0].echeance.type + '/' + groupes[1].items[0].echeance.type, 'pret/acte');
});

test('les échéances passées tombent dans « En retard », en tête', () => {
  const app = chargerApplication();
  const groupes = app.grouperEcheancesParSemaine([
    dossier('EN RETARD', { acte: '2026-08-20' }),
    dossier('CETTE SEMAINE', { acte: '2026-09-17' })
  ], AUJOURDHUI);
  assert.equal(groupes[0].cle, 'retard');
  assert.equal(groupes[0].items[0].dossier.nom, 'EN RETARD');
});

test('une échéance de la semaine en cours mais déjà passée reste dans la semaine', () => {
  // Le regroupement se fait sur la SEMAINE, pas sur le jour : lundi dernier et vendredi prochain
  // appartiennent à la même semaine de travail.
  const app = chargerApplication();
  const groupes = app.grouperEcheancesParSemaine([dossier('X', { acte: '2026-09-14' })], AUJOURDHUI);
  assert.equal(groupes.length, 1);
  assert.notEqual(groupes[0].cle, 'retard');
});

test('au-delà de l’horizon affiché, tout tombe dans un seul groupe « Plus tard »', () => {
  const app = chargerApplication();
  const loin = app.SEMAINES_AFFICHEES * 7 + 30;
  const groupes = app.grouperEcheancesParSemaine([
    dossier('A', { acte: app.addDays(AUJOURDHUI, loin) }),
    dossier('B', { acte: app.addDays(AUJOURDHUI, loin + 60) })
  ], AUJOURDHUI);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].cle, 'plus-tard');
  assert.equal(groupes[0].items.length, 2);
});

test('les groupes sont ordonnés retard → semaines chronologiques → plus tard', () => {
  const app = chargerApplication();
  const groupes = app.grouperEcheancesParSemaine([
    dossier('LOIN', { acte: app.addDays(AUJOURDHUI, app.SEMAINES_AFFICHEES * 7 + 30) }),
    dossier('RETARD', { acte: '2026-08-20' }),
    dossier('S+2', { acte: '2026-09-29' }),
    dossier('S+1', { acte: '2026-09-22' })
  ], AUJOURDHUI);
  assert.equal(groupes.map(g => g.items[0].dossier.nom).join(','), 'RETARD,S+1,S+2,LOIN');
});

test('dans une semaine, les échéances sont triées par date puis par nom', () => {
  const app = chargerApplication();
  const groupes = app.grouperEcheancesParSemaine([
    dossier('ZOLA', { acte: '2026-09-16' }),
    dossier('ARAGON', { acte: '2026-09-16' }),
    dossier('BALZAC', { acte: '2026-09-15' })
  ], AUJOURDHUI);
  assert.equal(groupes[0].items.map(i => i.dossier.nom).join(','), 'BALZAC,ARAGON,ZOLA');
});

test('un dossier sans aucune échéance datée n’apparaît nulle part', () => {
  const app = chargerApplication();
  assert.equal(app.grouperEcheancesParSemaine([dossier('VIDE', {})], AUJOURDHUI).length, 0);
});

test('libelleSemaine nomme les groupes en français, année tue si c’est la même', () => {
  const app = chargerApplication();
  const groupes = app.grouperEcheancesParSemaine([
    dossier('RETARD', { acte: '2026-08-20' }),
    dossier('X', { acte: '2026-09-17' })
  ], AUJOURDHUI);
  assert.equal(app.libelleSemaine(groupes[0], AUJOURDHUI), 'En retard');
  assert.equal(app.libelleSemaine(groupes[1], AUJOURDHUI), 'Semaine du 14 septembre');
});

test('ORDRE_STATUT classe du plus bloquant au terminé', () => {
  // C'est lui qui pilote le tri "Statut" du tableau : ce qui bloque en premier.
  const app = chargerApplication();
  assert.equal(app.ORDRE_STATUT.join(','), 'blocage,aconfirmer,arelier,pret,archive');
});

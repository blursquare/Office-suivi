'use strict';

// Routines de CLAIRE, phase 0, côté poste (étude 24/10) : textes de la boîte de propositions et des Réglages.
// Les gestes eux-mêmes (autoriser, refuser, niveaux) sont joués dans Chromium (npm run fumee) ; ici, les fonctions pures.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const T0 = Date.parse('2026-10-24T12:00:00Z');
const il = (min) => new Date(T0 - min * 60000).toISOString();

test('âge d’une proposition : à l’instant, minutes, heures, hier, jours, puis la date', () => {
  assert.equal(app.ageTexteProposition(il(0), T0), 'à l’instant');
  assert.equal(app.ageTexteProposition(il(5), T0), 'il y a 5 min');
  assert.equal(app.ageTexteProposition(il(59), T0), 'il y a 59 min');
  assert.equal(app.ageTexteProposition(il(60 * 3), T0), 'il y a 3 h');
  assert.equal(app.ageTexteProposition(il(60 * 30), T0), 'hier');
  assert.equal(app.ageTexteProposition(il(60 * 24 * 5), T0), 'il y a 5 j');
  assert.match(app.ageTexteProposition(il(60 * 24 * 40), T0), /sept\./);
  assert.equal(app.ageTexteProposition('', T0), '');
  assert.equal(app.ageTexteProposition('pas une date', T0), '');
  assert.equal(app.ageTexteProposition(new Date(T0 + 3600000).toISOString(), T0), 'à l’instant', 'une horloge en retard ne donne jamais « il y a -1 min »');
});

test('type de proposition : libellé, icône et bouton ; un type inconnu se lit comme une alerte', () => {
  assert.equal(app.typeProposition('email').bouton, 'Ouvrir le brouillon');
  assert.equal(app.typeProposition('document').bouton, 'Ouvrir le document');
  assert.equal(app.typeProposition('tache').bouton, 'Ajouter à ma liste');
  assert.equal(app.typeProposition('alerte').bouton, 'Marquer comme lu');
  assert.equal(app.typeProposition('inconnu').libelle, app.typeProposition('alerte').libelle);
  assert.equal(app.typeProposition(undefined).icone, 'info');
});

test('état d’une proposition traitée : qui, quand ; expirée sans personne', () => {
  assert.equal(app.etatTexteProposition({ etat: 'acceptee', traitePar: 'Julie VASSELIN', traiteLe: il(60 * 3) }, T0), 'Autorisée par Julie · il y a 3 h');
  assert.equal(app.etatTexteProposition({ etat: 'refusee', traitePar: 'Bastien ANGLUMENT', traiteLe: il(2) }, T0), 'Refusée par Bastien · il y a 2 min');
  assert.match(app.etatTexteProposition({ etat: 'expiree' }, T0), /Expirée/);
  assert.equal(app.etatTexteProposition({ etat: 'proposee' }, T0), '');
});

test('résumé de la boîte : ce qui attend, pour qui', () => {
  assert.equal(app.resumeBoiteClaire(3, 'Julie VASSELIN'), '3 à décider · préparé pour Julie');
  assert.equal(app.resumeBoiteClaire(0, 'Jérémy SAUJOT'), 'Rien à décider · préparé pour Jérémy');
  assert.equal(app.resumeBoiteClaire(2, ''), '2 à décider');
});

test('les outils qu’une proposition « document » sait ouvrir existent tous parmi les écrans de CLAIRE', () => {
  for (const [cle, o] of Object.entries(app.OUTILS_PROPOSITION)) {
    assert.equal(typeof o.surDossier, 'boolean', cle);
    if (o.onglet) assert.ok(app.OUTILS_ONGLETS_TRAVAIL.includes(o.onglet), `${cle} → écran « ${o.onglet} » inconnu de OUTILS_ONGLETS_TRAVAIL`);
  }
});

test('statistiques d’une routine, en mots', () => {
  assert.equal(app.texteStatsRoutine({ total: 0 }), 'Pas encore de proposition');
  assert.equal(app.texteStatsRoutine(null), 'Pas encore de proposition');
  assert.equal(app.texteStatsRoutine({ total: 1, decidees: 0, aTraiter: 1 }), '1 proposition · 1 à décider');
  assert.equal(app.texteStatsRoutine({ total: 34, decidees: 32, taux: 0.91, aTraiter: 2 }), '34 propositions · 91 % acceptées · 2 à décider');
  assert.equal(app.pourcentageAcceptation(null), '—');
  assert.equal(app.pourcentageAcceptation(0.9333), '93 %');
});

test('prochain passage : jours ouvrés seulement, aujourd’hui si l’heure n’est pas passée', () => {
  const lundi8h = new Date(2026, 9, 26, 8, 0);
  const lundi10h = new Date(2026, 9, 26, 10, 0);
  const vendredi10h = new Date(2026, 9, 23, 10, 0);
  const samedi = new Date(2026, 9, 24, 10, 0);
  assert.equal(app.prochainPassageRoutines('09:30', lundi8h), 'aujourd’hui à 9 h 30');
  assert.equal(app.prochainPassageRoutines('09:30', lundi10h), 'demain à 9 h 30');
  assert.equal(app.prochainPassageRoutines('09:30', vendredi10h), 'lundi à 9 h 30');
  assert.equal(app.prochainPassageRoutines('09:30', samedi), 'lundi à 9 h 30');
  assert.equal(app.prochainPassageRoutines('14:00', lundi8h), 'aujourd’hui à 14 h');
  assert.equal(app.prochainPassageRoutines('pas une heure', lundi8h), '');
});

test('plafond mensuel : la part dépensée, bornée', () => {
  assert.equal(app.partPlafondRoutines({ euros: 0 }, 50), 0);
  assert.equal(app.partPlafondRoutines({ euros: 12.5 }, 50), 25);
  assert.equal(app.partPlafondRoutines({ euros: 80 }, 50), 100);
  assert.equal(app.partPlafondRoutines({ euros: 1 }, 0), 100, 'plafond à 0 € : IA coupée, tout dépassement est plein');
  assert.equal(app.partPlafondRoutines({ euros: 0 }, 0), 0);
});

test('niveaux d’un geste : jusqu’à son maximum ; le niveau en vigueur ne dépasse jamais ce maximum', () => {
  const geste = { cle: 'tache', libelle: 'Poser une tâche', niveauMax: 2 };
  assert.deepEqual(Array.from(app.niveauxPossiblesGeste(geste)), [1, 2]);
  assert.deepEqual(Array.from(app.niveauxPossiblesGeste({ niveauMax: 3 })), [1, 2, 3]);
  assert.deepEqual(Array.from(app.niveauxPossiblesGeste(null)), [1]);
  const routine = { id: 'revue-matin' };
  assert.equal(app.niveauGesteReglages({ routines: { 'revue-matin': { niveau: 3, gestes: { tache: 3 } } } }, routine, geste), 2);
  assert.equal(app.niveauGesteReglages({ routines: { 'revue-matin': { niveau: 2, gestes: {} } } }, routine, geste), 2);
  assert.equal(app.niveauGesteReglages({}, routine, geste), 1);
});

test('carte : « Terminée par … » une fois le travail fait, bouton « Terminé » sur une carte autorisée (étude 27/10)', () => {
  const { chargerApplication } = require('./helpers/load-app');
  const app = chargerApplication();
  const t = Date.parse('2026-10-27T18:00:00Z');
  assert.match(app.etatTexteProposition({ etat: 'acceptee', traitePar: 'Bastien ANGLUMENT', termineeLe: '2026-10-27T17:00:00Z', termineePar: 'Julie VASSELIN' }, t), /^Terminée par Julie/);
  require('node:vm').runInContext("utilisateurPoste = 'Bastien ANGLUMENT'", app);
  const html = app.carteProposition({ id: 'p1', type: 'document', etat: 'acceptee', titre: 'Constitution', responsable: 'Bastien ANGLUMENT', creeLe: '2026-10-27T08:00:00Z' });
  assert.ok(html.includes("terminerProposition('p1')"));
  const fini = app.carteProposition({ id: 'p1', type: 'document', etat: 'acceptee', termineeLe: '2026-10-27T17:00:00Z', titre: 'Constitution', responsable: 'Bastien ANGLUMENT', creeLe: '2026-10-27T08:00:00Z' });
  assert.ok(!fini.includes('terminerProposition') && fini.includes('pc-etat-terminee'));
});

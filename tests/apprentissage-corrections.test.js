'use strict';

// « Quand on ajoute un nouveau dossier et qu'on corrige une saisie à la main, vérifier que c'est
// bien appris pour les prochains dossiers » (demande de l'étude). Ces tests rejouent le parcours
// complet : un premier acte où l'outil retient la mauvaise date, la correction, puis un second acte
// de même trame qui doit retenir la bonne sans aide.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Deux dates classées « prêt » par leurs mots-clés ; la règle du signal fort retient la seconde.
function acte(annee) {
  return `Le prêteur remettra à l'emprunteur la notice d'assurance emprunteur au plus tard le 15 mars ${annee}. ` +
    `La condition suspensive d'obtention du prêt devra être réalisée au plus tard le 30 avril ${annee}.`;
}

test('une date corrigée à la main est retenue au prochain acte de même trame', () => {
  const app = chargerApplication();
  const premier = app.detecterDatesDepuisTexte(acte(2026), '');
  const avant = app.meilleureCandidateEcheance(premier, 'pret').candidat;
  assert.equal(avant.iso, '2026-04-30');
  // L'étude indique que la bonne date est le 15 mars : on apprend SA clause.
  const bonne = premier.find(d => d.iso === '2026-03-15');
  app.memoriserCorrection(bonne.contexte, 'pret', null);
  // Second acte, même trame, autres dates : la clause apprise l'emporte.
  const second = app.detecterDatesDepuisTexte(acte(2027), '');
  const apres = app.meilleureCandidateEcheance(second, 'pret');
  assert.equal(apres.candidat.iso, '2027-03-15');
  assert.equal(apres.ambigu, false);
});

test('une seule candidate apprise l\'emporte ; deux apprises retombent sur les règles habituelles', () => {
  const app = chargerApplication();
  const c = (iso, extra) => Object.assign({ iso, suggestion: 'pret', contexte: 'x', approx: false }, extra || {});
  assert.equal(app.meilleureCandidateEcheance([c('2026-01-01'), c('2026-02-01', { apprise: true })], 'pret').candidat.iso, '2026-02-01');
  // Plus prioritaire que la règle « date écrite plutôt que calculée » : c'est une décision humaine.
  assert.equal(app.meilleureCandidateEcheance([c('2026-01-01'), c('2026-02-01', { apprise: true, approx: true })], 'pret').candidat.iso, '2026-02-01');
  const deux = app.meilleureCandidateEcheance([c('2026-01-01', { apprise: true }), c('2026-02-01', { apprise: true })], 'pret');
  assert.equal(deux.ambigu, true);
});

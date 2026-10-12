'use strict';

// Relecture indépendante du 12/10 : relecture d'actes (pseudonymisation, consignes, niveaux).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('pseudonymisation : naissance « Né à … le », cadastre en liste, lieu-dit, nom sans civilité, MONSIEUR', () => {
  const t = 'Né à BLOIS (41000) le 3 mars 1970. MONSIEUR Paul MARTIN, demeurant 2 rue des Lices à Blois. Le bien cadastré section AB numéros 12, 13 et 14 et cadastrée AB 123. Lieu-dit « Les Grands Prés ». Jean DUPONT achète. Le VENDEUR déclare. Prix de vente.';
  const sortie = app.anonymiserDocumentsOutil2([{ texte: t }], {}).documents[0].texte;
  for (const fuite of ['1970', 'MARTIN', 'Lices', '13 et 14', 'AB 123', 'Grands Prés', 'DUPONT']) assert.ok(!sortie.includes(fuite), `${fuite} : ${sortie}`);
  // Les mots du métier restent lisibles.
  assert.match(sortie, /Le VENDEUR déclare\. Prix de vente/);
});

test('consigne de l’étude : jetons et sigles gardés, noms propres masqués', () => {
  const c = app.masquerNomsConsigneOutil2('Vérifie aussi : la SAFER et ⟦PERSONNE_1⟧ chez les DUPONT, pour Jean.');
  assert.equal(c, 'Vérifie aussi : la SAFER et ⟦PERSONNE_1⟧ chez les [nom], pour [nom].');
});

test('point « présent » sans citation vérifiée : à surveiller', () => {
  assert.equal(app.niveauPointGrilleOutil2('present', [{ verifie: false }]), 'surveiller');
  assert.equal(app.niveauPointGrilleOutil2('present', [{ verifie: true }]), 'valide');
  assert.equal(app.niveauPointGrilleOutil2('absent', []), 'critique');
});

test('« époux » et « à concurrence de » reconnus malgré l’accent', () => {
  assert.ok(app.RE_STATUT_MARIE.test('les époux DUPONT'));
  assert.ok(app.quotitesAcquisitionPresentes('Les acquéreurs acquièrent à concurrence de 50 % chacun'));
});

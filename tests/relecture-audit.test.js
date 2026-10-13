'use strict';

// Relecture indépendante du 12/10 : relecture d'actes (pseudonymisation, consignes, niveaux).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('pseudonymisation : naissance « Né à … le », cadastre en liste, lieu-dit, MONSIEUR ; mots du métier en clair', () => {
  const t = 'Né à BLOIS (41000) le 3 mars 1970. MONSIEUR Paul MARTIN, demeurant 2 rue des Lices à Blois. Le bien cadastré section AB numéros 12, 13 et 14 et cadastrée AB 123. Lieu-dit « Les Grands Prés ». Loi ALUR, Zone UB, Taxe FONCIERE. Section N° Lieu-dit Contenance Nature. Le VENDEUR déclare. Prix de vente.';
  const sortie = app.anonymiserDocumentsOutil2([{ texte: t }], {}).documents[0].texte;
  for (const fuite of ['1970', 'MARTIN', 'Lices', '13 et 14', 'AB 123', 'Grands Prés']) assert.ok(!sortie.includes(fuite), `${fuite} : ${sortie}`);
  // Les mots du métier restent lisibles.
  assert.match(sortie, /Loi ALUR, Zone UB, Taxe FONCIERE\. Section N° Lieu-dit Contenance Nature\. Le VENDEUR déclare\. Prix de vente/);
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

test('consigne : les références juridiques restent lisibles', () => {
  assert.equal(app.masquerNomsConsigneOutil2('« Superficie Loi Carrez » : la zone UB, article L.271-4 du Code de la construction'),
    '« Superficie Loi Carrez » : la zone UB, article L.271-4 du Code de la construction');
});

test('relecture : compromis d’agence — aucun nom ni prénom ne part en clair (audit 13/10)', () => {
  const c = `ENTRE LES SOUSSIGNES : Mr DURANDEAU Jean, retraité, et Mme DURANDEAU Lucie, son épouse. ET : Mr LEGRANDIN Paul. ORIGINE DE PROPRIETE : acquis des consorts BERNARDIN. Les époux DURANDEAU déclarent. M HERBELOT et MM. TOURNIER interviennent. Le gérant de l'agence, Pierre FONTAINE, est mandataire. Le VENDEUR et les ACQUEREURS déclarent.`;
  const vt = (app.detecterTypeActe(c) || {}).valeur;
  const termes = app.termesConnusAnonymisation(app.detecterParties(c, vt).concat([{ nom: 'LEGRANDIN', prenom: 'Paul' }]), app.detecterNotaires(c, vt));
  const t = app.anonymiserDocumentsOutil2([{ id: 1, texte: c }], { termes, exclus: [] }).documents[0].texte;
  for (const nom of ['DURANDEAU', 'Jean', 'Lucie', 'LEGRANDIN', 'Paul', 'BERNARDIN', 'HERBELOT', 'TOURNIER', 'Pierre', 'FONTAINE']) assert.ok(!t.includes(nom), nom + ' : ' + t);
  assert.match(t, /Le VENDEUR et les ACQUEREURS déclarent\./);
});

test('relecture : un lieu de naissance à tirets répétés ne fige plus l’onglet (ReDoS, audit 13/10)', () => {
  const texte = 'Née à SAINT-' + 'A-'.repeat(40) + 'X, demeurant';
  const debut = Date.now();
  app.anonymiserDocumentsOutil2([{ id: 1, texte }], { termes: [], exclus: [] });
  assert.ok(Date.now() - debut < 200, `${Date.now() - debut} ms`);
});

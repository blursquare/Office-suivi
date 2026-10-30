'use strict';

// Pseudonymisation par liste de prénoms et liste blanche des mots du droit (étude 30/10 : « liste de prénoms + mots du droit »,
// plutôt qu'un modèle local). Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/assistantMistral');
const { PRENOMS, MOTS_DROIT } = require('../src/prenoms');

const sens = (dossiers) => M.motsSensiblesDossiers(dossiers || []);

test('document : « Prénom Nom » en casse mixte, absent des fiches, est codé ; « Jean-Luc Moreau » aussi', () => {
  const t = M.masquerDocument('Le vendeur, Marie Dupontel, a signé. Jean-Luc Moreaux doit payer.', sens(), new Map());
  assert.doesNotMatch(t, /Marie|Dupontel|Jean-Luc|Moreaux/);
});

test('document : les mots du droit à majuscule restent en clair', () => {
  const t = M.masquerDocument('Selon la Cour de cassation, le Code civil et l’Article Premier, le Vendeur doit livrer.', sens(), new Map());
  assert.match(t, /Cour de cassation/);
  assert.match(t, /Code civil/);
  assert.match(t, /Vendeur/);
});

test('conversation : prénom en tête de phrase suivi d’un nom → codé ; « la Cour de cassation » en clair', () => {
  assert.doesNotMatch(M.masquer('Marie Dupontel a appelé pour le dossier.', sens(), new Map()), /Marie|Dupontel/);
  const q = M.masquer('Que dit la Cour de cassation sur le Vendeur qui ne paie pas ?', sens(), new Map());
  assert.match(q, /Cour de cassation/);
  assert.match(q, /Vendeur/);
});

test('un mot du droit qui est aussi un mot des fiches reste codé (les fiches passent avant)', () => {
  const s = sens([{ id: 'd1', nom: 'CONSEIL / MARTEL', parties: [{ nom: 'Paul CONSEIL', role: 'VENDEUR' }] }]);
  assert.doesNotMatch(M.masquer('Le dossier de Monsieur Conseil avance.', s, new Map()), /Conseil/);
});

test('listes : ni les prénoms des collaborateurs ni « claire » parmi les prénoms ; « Vendeur » parmi les mots du droit', () => {
  for (const p of ['claire', 'bastien', 'julie', 'jeremy', 'sophie']) assert.equal(PRENOMS.has(p), false, p);
  assert.ok(PRENOMS.has('marie') && PRENOMS.has('jean'));
  assert.ok(MOTS_DROIT.has('Vendeur') && MOTS_DROIT.has('Cassation'));
});

test('audit 0.404.0 (H1) : un nom de famille égal à un mot du droit reste codé hors d’un article', () => {
  for (const phrase of ['J’ai eu Paul Juge au téléphone.', 'Jean Lot a signé hier, Bernard Maire aussi.', 'Simone Chambre et Paul Conseil viendront.']) {
    assert.doesNotMatch(M.masquer(phrase, sens(), new Map()), /Juge|Lot|Maire|Chambre|Conseil/, phrase);
  }
  assert.doesNotMatch(M.masquerDocument('Paul Juge et Jean Lot ont signé.', sens(), new Map()), /Juge|Lot/);
});

test('audit 0.404.0 (H1′) : un titre devant un NOM (« le Vendeur DUPONT ») garde le titre et code le NOM', () => {
  const t = M.masquerDocument('Le Vendeur DUPONT déclare. Monsieur le Maire GIRARDOT. Le Défunt LEFEVRE. Le Juge LEBRUN.', sens(), new Map());
  assert.doesNotMatch(t, /DUPONT|GIRARDOT|LEFEVRE|LEBRUN/);
  assert.match(t, /Vendeur/);
});

test('audit 0.404.0 (M6) : une rue au nom d’une personne n’est pas un nom (l’adresse du bien reste en clair)', () => {
  const s = M.motsSensiblesDossiers([{ id: 'd', nom: 'X', adresse: '12 rue Victor Hugo 41000 BLOIS' }]);
  assert.equal(M.masquerDocument('Bien : 12 rue Victor Hugo, BLOIS.', s, new Map()), 'Bien : 12 rue Victor Hugo, BLOIS.');
  assert.match(M.masquerDocument('Il habite place Jean Jaurès.', sens(), new Map()), /Jean Jaurès/);
});

test('relecture 0.404.0 : mots du droit en chaîne et élidés lisibles ; « les Garant » (une famille) codé ; nom répété seul codé', () => {
  const m = (x) => M.masquer(x, sens(), new Map());
  assert.equal(m('Que dit le Code Civil ?'), 'Que dit le Code Civil ?');
  assert.equal(m('Selon la Cour de Cassation et la Publicité Foncière.'), 'Selon la Cour de Cassation et la Publicité Foncière.');
  assert.equal(m('Que dit l\'Article 1589 ?'), 'Que dit l\'Article 1589 ?');
  assert.equal(m('Les Vendeurs ont signé.'), 'Les Vendeurs ont signé.');
  assert.doesNotMatch(m('Les Garant ont appelé.'), /Garant/);
  assert.match(m('(écran ouvert : Constitution de dossier)'), /Constitution/);
  assert.doesNotMatch(M.masquerDocument('Marie Dupontel a signé le compromis. Ensuite Dupontel doit payer.', sens(), new Map()), /Dupontel/);
});

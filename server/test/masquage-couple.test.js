'use strict';

// Politique de masquage « couplé à un nom de famille » (étude 26/10 : « anonymise dans CLAIRE que s'il y a un nom de famille ; pour les
// autres données, adresse ou autre, laisse en clair sauf si c'est couplé à un nom de famille »). Noms, prénoms des fiches, emails,
// téléphones, IBAN, agences et notaires : toujours codés. Adresse du bien, références et longs numéros : codés seulement dans une phrase
// (ou une fiche d'un outil) qui porte un nom. Un poste qui n'envoie pas `adresses` garde l'ancien masquage complet.
// Noms, adresses et numéros inventés (contrainte n° 7 de CLAUDE.md).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { masquer, masquerDocument, motsSensiblesDossiers, politiqueCouplee } = require('../src/assistantMistral');
const { masquerValeur } = require('../src/assistantAgent');

const ADRESSE = 'BLOIS (41000), 12 rue des Lices';
const dossier = (extra) => Object.assign({ id: 'd1', nom: 'VTE - MARTIN / DURAND',
  parties: [{ nom: 'MARTIN', prenom: 'Paul' }, { nom: 'DURAND', prenom: 'Claire' }],
  adresses: [ADRESSE], autres: ['Agence du Centre', 'Maître LEROY'] }, extra || {});
const sens = () => motsSensiblesDossiers([dossier()]);
const m = (texte) => masquer(texte, sens(), new Map());

test('les mots de l’adresse sont à part : politique couplée, adresse hors des noms et des mots du métier', () => {
  const s = sens();
  assert.equal(politiqueCouplee(s), true);
  assert.ok(s.adresses.has('lices') && s.adresses.has('blois'));
  assert.ok(!s.has('lices') && !s.has('blois'), 'plus dans les mots toujours masqués');
  assert.ok(s.has('martin') && s.has('paul') && s.has('leroy'), 'noms, prénoms, notaires : toujours');
  assert.ok(![...s.adresses].some((x) => ['rue', 'des', 'martin', 'paul'].includes(x)));
  // Un poste d'avant (sans `adresses`) : ancien masquage complet.
  const ancien = motsSensiblesDossiers([{ id: 'd', nom: 'VTE - MARTIN', parties: [{ nom: 'MARTIN' }], autres: [ADRESSE] }]);
  assert.equal(politiqueCouplee(ancien), false);
  assert.ok(ancien.has('lices'));
  assert.equal(politiqueCouplee(motsSensiblesDossiers([])), false, 'sans dossier : rien ne se relâche');
});

test('une adresse seule reste en clair ; avec un nom de famille dans la même phrase elle est codée', () => {
  assert.equal(m('Le bien est situé 12 rue des Lices à Blois.'), 'Le bien est situé 12 rue des Lices à Blois.');
  const avec = m('Monsieur Paul MARTIN habite 12 rue des Lices à Blois.');
  assert.doesNotMatch(avec, /MARTIN|Paul|Lices|Blois/);
  assert.match(avec, /12 rue des \[NOM\d+\]/);
  // Phrase suivante sans nom : en clair, même si la précédente en portait un.
  const deux = m('Paul MARTIN est vendeur. Le bien est rue des Lices à Blois.');
  assert.match(deux, /^\[NOM\d+\] \[NOM\d+\] est vendeur\. Le bien est rue des Lices à Blois\.$/);
  // Un retour à la ligne coupe aussi.
  assert.match(m('Vendeur : Paul MARTIN\nBien : 12 rue des Lices'), /\n(?:Bien|\[NOM\d+\]) : 12 rue des Lices$/);
});

test('emails, téléphones et IBAN : toujours codés, même sans nom', () => {
  const t = m('Écrire à contact@exemple.fr ou appeler le 06 12 34 56 78 (compte FR76 3000 6000 0112 3456 7890 189) rue des Lices.');
  assert.doesNotMatch(t, /contact@|06 12 34|FR76|3000 6000/);
  assert.match(t, /rue des Lices\.$/);
});

test('références et longs numéros : en clair seuls, codés dans une phrase à nom', () => {
  assert.equal(m('La référence est A 2026 00247 et le contrat 123456789.'), 'La référence est A 2026 00247 et le contrat 123456789.');
  const avec = m('Le dossier de Monsieur MARTIN porte la référence A 2026 00247, contrat 123456789.');
  assert.doesNotMatch(avec, /00247|123456789|MARTIN/);
});

test('une fiche d’outil : adresse et référence en clair sans nom, codées dès qu’un nom est dans la fiche ou ses parents', () => {
  const s = sens();
  const sans = masquerValeur({ type: 'maison', adresse: ADRESSE, reference: 'A 2026 00247', prix: 245000 }, s, new Map());
  assert.deepEqual(sans, { type: 'maison', adresse: ADRESSE, reference: 'A 2026 00247', prix: 245000 });
  const avec = masquerValeur({ nom: 'VTE - MARTIN / DURAND', adresse: ADRESSE, reference: 'A 2026 00247', biens: [{ adresse: ADRESSE, surface: 80 }] }, s, new Map());
  const json = JSON.stringify(avec);
  assert.doesNotMatch(json, /MARTIN|DURAND|Lices|Blois|BLOIS|00247/);
  assert.equal(avec.biens[0].surface, 80);
  // Le nom dans un objet frère (même fiche) couple aussi l'adresse d'un sous-objet.
  const frere = masquerValeur({ parties: [{ nom: 'MARTIN', prenom: 'Paul' }], bien: { adresse: ADRESSE } }, s, new Map());
  assert.doesNotMatch(JSON.stringify(frere), /Lices|BLOIS|MARTIN/);
  // Agence et notaire, email, téléphone : toujours codés.
  const toujours = masquerValeur({ agence: 'Agence du Centre', notaire_vendeur: 'Maître LEROY', email: 'a@b.fr', telephone: '06 12 34 56 78', adresse: ADRESSE }, s, new Map());
  assert.doesNotMatch(JSON.stringify(toujours), /Centre|LEROY|a@b\.fr|06 12|Lices/, 'le notaire est un nom de famille : la fiche est couplée');
  // Sans nom de personne dans la fiche, seuls email et téléphone sont codés.
  const sansNom = masquerValeur({ email: 'a@b.fr', telephone: '06 12 34 56 78', adresse: ADRESSE }, s, new Map());
  assert.doesNotMatch(JSON.stringify(sansNom), /a@b\.fr|06 12/);
  assert.equal(sansNom.adresse, ADRESSE);
});

test('un texte libre d’une fiche sans nom garde l’adresse ; la fiche à nom la code', () => {
  const s = sens();
  assert.equal(masquerValeur({ note: 'Visite du bien 12 rue des Lices à Blois' }, s, new Map()).note, 'Visite du bien 12 rue des Lices à Blois');
  assert.doesNotMatch(masquerValeur({ nom: 'MARTIN', note: 'Visite du bien 12 rue des Lices à Blois' }, s, new Map()).note, /Lices|Blois/);
});

test('ancien masquage conservé sans `adresses` : l’adresse est codée même seule', () => {
  const ancien = motsSensiblesDossiers([{ id: 'd', nom: 'VTE - MARTIN', parties: [{ nom: 'MARTIN' }], autres: [ADRESSE] }]);
  assert.doesNotMatch(masquer('Le bien est situé 12 rue des Lices à Blois.', ancien, new Map()), /Lices|Blois/);
  assert.doesNotMatch(JSON.stringify(masquerValeur({ adresse: ADRESSE }, ancien, new Map())), /Lices|BLOIS/);
});

test('un acte : l’adresse du bien seule reste en clair ; domicile d’une personne et phrase à nom codés', () => {
  const s = sens();
  const acte = 'Désignation : une maison située à BLOIS (41000), 12 rue des Lices. Monsieur Paul MARTIN, demeurant à TOURS (37000), 3 rue Colbert, vend ce bien.';
  const t = masquerDocument(acte, s, new Map());
  assert.match(t, /^Désignation : une maison située à BLOIS \(41000\), 12 rue des Lices\./);
  assert.doesNotMatch(t, /MARTIN|Paul|TOURS|Colbert/);
});

'use strict';
// Compromis d'agence réel (étude 08/10) : capital de l'agence et honoraires au même montant, email de l'agence près de la
// qualité de l'acquéreur, adresse du bien sur la ligne de la parcelle. Noms, adresses et montants inventés, structure réelle.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const ENTETE = `l'Immo Test Compromis de vente - Bien hors copropriété DURAND / MARTIN Immo Test Chambord 4 Place du Marché 41250 BRACIEUX 0254000000 chambord@immotest-fr.com Mandat n°CH0001 `;
const PARTIES = `Le vendeur Monsieur Paul DURAND né le 2 mars 1960 à BLOIS (41), demeurant 12 Allée des Tilleuls - 41000 BLOIS, Ci-après dénommé(e)s "le VENDEUR", d'une part, L'acquéreur Madame Léa MARTIN née le 4 mai 1995 à BLOIS (41), demeurant 3 rue des Pins 41000 BLOIS, Ci-après dénommé(e)s "l'ACQUEREUR", d'autre part, `;
const AGENCE = `Avec le concours de Immo Test Chambord , située 4 Place du Marché 41250 BRACIEUX , adresse mail chambord@immotest-fr.com , exploitée par la société TEST IMMOBILIER SAS au capital de 8 000 euros, dont le siège social est situé 4 Place du Marché 41250 BRACIEUX. `;
const BIEN = `NATURE ET DESCRIPTION DES BIENS Biens objet de la vente Une maison d'habitation comprenant : entrée, cuisine. Cet ensemble immobilier est édifié sur une parcelle de terrain cadastrée : 000 AB 112 7 CHEMIN DES GENETS 41250 BRACIEUX 10a 05ca 000 AB 113 7 CHEMIN DES GENETS 41250 BRACIEUX 45ca Contenance totale : 10a 50ca Tels que lesdits biens existent. `;
const HONORAIRES = `Honoraires de l'AGENCE Les PARTIES reconnaissent que les présentes ont été négociées par l'AGENCE Immo Test Chambord exploitée par la société TEST IMMOBILIER qu'elles déclarent bénéficiaire du montant de la rémunération convenue, soit la somme de huit mille euros TTC ( 8 000 € TTC) conformément au mandat écrit. `;
const FIN = `Madame Léa MARTIN lea.martin@exemple.fr Chacune des PARTIES : `;
const TEXTE = ENTETE + PARTIES + AGENCE + BIEN + HONORAIRES + FIN;

test('honoraires : source dans la clause « Honoraires de l’AGENCE », jamais sur le capital social du même montant', () => {
  const champ = app.honorairesAgenceChamp(TEXTE);
  assert.equal(champ.valeur, 8000);
  assert.ok(champ.source.index > TEXTE.indexOf('Honoraires de l'), `source à ${champ.source.index}`);
  assert.match(champ.source.extrait, /TTC/);
  assert.doesNotMatch(champ.source.extrait, /capital/);
});

test('email de l’agence jamais pris pour celui de l’acquéreur (qualité suivie de la présentation de l’agence, en-tête avec les noms)', () => {
  assert.deepEqual([...app.emailsAgenceDansTexte(TEXTE)].sort().join(','), 'chambord@immotest-fr.com');
  assert.equal(app.detecterEmailAcquereur(TEXTE), null);
  const parties = [{ nom: 'Paul DURAND', role: 'VENDEUR' }, { nom: 'Léa MARTIN', role: 'ACQUEREUR' }];
  assert.equal(app.emailsPartieParNom(TEXTE, parties, 'ACQUEREUR'), 'lea.martin@exemple.fr');
  // « Madame X x@… » après un paragraphe sur l'agence reste à X.
  assert.equal(app.emailsAgenceDansTexte(AGENCE + FIN).has('lea.martin@exemple.fr'), false);
});

test('adresse du bien lue sur la ligne de la parcelle cadastrale, pas l’adresse de l’agence', () => {
  const r = app.detecterAdresseBienStructuree(TEXTE);
  assert.equal(r.adresse.codePostal, '41250');
  assert.match(r.adresse.adresseComplete, /^7 chemin des genets, 41250 BRACIEUX$/i);
  assert.ok(r.source.index > TEXTE.indexOf('cadastrée'));
  // L'étiquette « Adresse des biens » reste prioritaire.
  const etiquete = TEXTE.replace('Biens objet de la vente', 'Biens objet de la vente Adresse des biens : 9 rue Haute - 41250 BRACIEUX .');
  assert.match(app.detecterAdresseBienStructuree(etiquete).adresse.adresseComplete, /9 rue Haute/i);
  // Tableau « Section N° Lieudit » sans code postal : la même voie suivie d'un code postal ailleurs le donne.
  const tableau = 'situé 7 chemin des Genets, 41250 BRACIEUX. Figurant au cadastre : Section N° Lieudit Surface AB 112 7 chemin des Genets 00 ha 10 a 05 ca Tels que.';
  assert.match(app.adresseLigneCadastrale(tableau).adresse.adresseComplete, /^7 chemin des Genets, 41250 BRACIEUX$/i);
  // Ancienne parcelle (« anciennement cadastrée ») : ignorée ; ligne sans voie : rien.
  assert.equal(app.adresseLigneCadastrale('anciennement cadastrée : 000 AB 99 7 CHEMIN DES GENETS 41250 BRACIEUX 10a 05ca'), null);
  assert.equal(app.adresseLigneCadastrale('cadastrée : 000 AB 112 LES GENETS 10a 05ca'), null);
});

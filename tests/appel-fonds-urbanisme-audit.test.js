'use strict';

// Relecture indépendante du 12/10 : appel de fonds et contrôle de l'urbanisme.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const libelles = (l) => l.map(x => x.libelle).join(' | ');

test('case « prêt hypothécaire » : ajoute puis retire ses deux lignes', () => {
  const base = app.lignesDecompteDepuisPrefill({ prixVente: 200000, fraisActe: 15000 });
  const avec = app.lignesSelonPretHypothecaire(base, true, 150000);
  assert.match(libelles(avec.debit), /Frais d'acte de prêt/);
  const pret = avec.credit.find(l => /Montant du prêt/.test(l.libelle));
  assert.equal(pret.montant, 150000);
  // Placé avant l'acompte sur frais.
  assert.ok(avec.credit.indexOf(pret) < avec.credit.findIndex(l => /Acompte sur frais/.test(l.libelle)));
  // Recocher ne double rien.
  assert.equal(app.lignesSelonPretHypothecaire(avec, true, 150000).debit.length, avec.debit.length);
  const sans = app.lignesSelonPretHypothecaire(avec, false, 0);
  assert.doesNotMatch(libelles(sans.debit) + libelles(sans.credit), /prêt/i);
});

test('décompte du confrère : une « Provision sur frais » à verser reste au débit sous son nom', () => {
  assert.equal(app.normaliserLibelleDecompte('Provision sur frais', true), 'Provision sur frais');
  assert.equal(app.normaliserLibelleDecompte('Provision sur frais', false), 'Acompte sur frais versé à l’étude');
});

test('montant tapé dans le tableau : « 1500.50 » = 1 500,50 €', () => {
  assert.equal(app.montantSaisiAppelFonds('1500.50'), 1500.5);
  assert.equal(app.montantSaisiAppelFonds('250.000,00'), 250000);
  assert.equal(app.montantSaisiAppelFonds('1.500'), 1500);
});

test('historique : la mention perdue d’un ancien courrier revient de l’état de l’outil, sauf adresse postale', () => {
  const ancien = { donnees: { addrLines: 'M. X' }, etat: { mention: 'Envoi par e-mail uniquement', champs: {} } };
  assert.equal(app.donneesAvecMentionGardee(ancien).mention, 'Envoi par e-mail uniquement');
  const postal = { donnees: { addrLines: 'M. X' }, etat: { mention: 'Envoi par e-mail uniquement', champs: { 'af-adresse-clients': '2 rue A' } } };
  assert.equal(app.donneesAvecMentionGardee(postal).mention, undefined);
  const neuf = { donnees: { mention: '' }, etat: { mention: 'Envoi par e-mail uniquement', champs: {} } };
  assert.equal(app.donneesAvecMentionGardee(neuf).mention, '');
});

test('commune d’après l’adresse : mot entier, commune en tête, jamais le nom d’une voie', () => {
  const L = [{ nom: 'Mer', insee: '41136' }, { nom: 'Blois', insee: '41018' }];
  assert.equal(app.communeDuCodePostalPreemption(L, 'BLOIS (41000), 2 rue Mermoz'), '41018');
  assert.equal(app.communeDuCodePostalPreemption(L, '12 route de Blois'), '');
  assert.equal(app.communeDuCodePostalPreemption(L, '2 rue Mermoz 41500 MER'), '41136');
});

test('parcelles : « AB 12 et 13 » = AB 12 et AB 13', () => {
  assert.equal(app.parcellesDepuisTexte('AB 12 et 13').map(p => p.section + p.numero).join(','), 'AB12,AB13');
  assert.equal(app.parcellesDepuisTexte('al 839').map(p => p.section + p.numero).join(','), 'AL839');
});

test('parcelle qui touche aussi une zone A : SAFER à vérifier (jamais à purger d’office), tranché par la zone choisie', () => {
  const zonages = [{ section: 'AB', numero: '12', statut: 'ok', resultat: { zones: [{ libelle: 'Ub', typezone: 'U' }, { libelle: 'A', typezone: 'A' }] } }];
  const lignes = app.lignesZonageParcelles(zonages, {});
  assert.equal(lignes[0].autresFamilles.join(','), 'A');
  const safer = app.analyserPreemptionParcelles({}, lignes).droits.find(d => d.cle === 'safer');
  assert.equal(safer.statut, 'verifier');
  assert.match(safer.motif, /touche aussi une zone A/);
  const choisieA = app.analyserPreemptionParcelles({}, app.lignesZonageParcelles(zonages, { AB0012: 'A' })).droits.find(d => d.cle === 'safer');
  assert.equal(choisieA.statut, 'oui');
});

test('parcelles : N, AU en capitales sont des sections ; « 1250 m2 » n’est pas une parcelle', () => {
  assert.equal(app.parcellesDepuisTexte('N 123, AU 45').map(p => p.section + p.numero).join(','), 'N123,AU45');
  assert.equal(app.parcellesDepuisTexte('ZE 5 et 1250 m2').map(p => p.section + p.numero).join(','), 'ZE5');
});

test('droits gardés remis d’accord avec l’analyse refaite (SAFER « non » d’avant le 09/10 en zone A)', () => {
  const d = { id: 'x', typeVente: 'maison', pieces: {}, piecesPersonnalisees: [],
    preemption: { droits: [{ cle: 'safer', statut: 'non' }], lignes: [{ cle: 'AB12', libelle: 'AB 12', statut: 'ok', famille: 'A' }], reponses: {} } };
  const textes = app.realignerDroitsPreemption(d);
  assert.ok(textes.length >= 1);
  assert.equal(d.preemption.droits.find(x => x.cle === 'safer').statut, 'oui');
  assert.ok(d.piecesPersonnalisees.some(p => /SAFER/.test(p.label)));
  // Une seconde fois : rien.
  assert.equal(app.realignerDroitsPreemption(d).length, 0);
});

test('historique : mention encore dans l’adresse (courrier d’avant le 06/10) → une seule fois', () => {
  const a = { donnees: { addrLines: 'M. X\n12 rue A\nEnvoi par e-mail uniquement' }, etat: { mention: 'Envoi par e-mail uniquement', champs: {} } };
  const d = app.donneesAvecMentionGardee(a);
  assert.equal(d.mention, 'Envoi par e-mail uniquement');
  assert.doesNotMatch(d.addrLines, /Envoi par e-mail/);
});

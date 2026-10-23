'use strict';

// Autorisations de déblocage ou de transfert de fonds (23/10) : textes des modèles de l'office, accords en genre, « à compléter » pour ce qui manque.

const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../commun/autorisations-succession');

const defunt = { civilite: 'Madame', prenoms: 'Thi Thien', nom: 'NGUYEN', profession: 'retraitée', domicile: 'BLOIS (41000), 4 rue Champagne', naissanceLieu: 'SAIGON (VIETNAM)', naissanceDate: '1925-10-05', nationalite: 'française', decesLieu: 'BRACIEUX (41250)', decesDate: '2026-09-13', conjointLien: 'Veuve de', conjointNom: 'Monsieur Georges BERNE' };
const fils = { civilite: 'Monsieur', prenoms: 'Philippe', nom: 'NGUYEN', profession: 'retraité', domicile: 'PARIS (75011), 13 boulevard de Belleville', naissanceLieu: 'ORLEANS (45000)', naissanceDate: '1960-07-19', nationalite: 'française', conjointLien: 'Époux de', conjointNom: 'Madame Thi Trang HO', mariage: 'Monsieur Philippe NGUYEN et Madame Thi Trang HO mariés le 04 avril 1991.' };
const texte = (doc) => doc.map((x) => x.texte).join('\n');

test('déblocage : texte du modèle, signataire masculin, défunte, pas de ligne de PACS pour un marié', () => {
  const doc = A.documentAutorisationSuccession('deblocage', { signataire: fils, defunt });
  const t = texte(doc);
  assert.match(t, /^LE SOUSSIGNÉ :/);
  assert.match(t, /Monsieur Philippe NGUYEN, retraité, demeurant à PARIS \(75011\), 13 boulevard de Belleville\./);
  assert.match(t, /Epoux de Madame Thi Trang HO\./);
  assert.match(t, /Né à ORLEANS \(45000\), le 19 juillet 1960\./);
  assert.match(t, /Habile à se dire et porter héritier de :/);
  assert.match(t, /Madame Thi Thien NGUYEN, en son vivant retraitée, veuve de Monsieur Georges BERNE demeurant à BLOIS \(41000\), 4 rue Champagne,/);
  assert.match(t, /Décédée à BRACIEUX \(41250\), le 13 septembre 2026\./);
  assert.match(t, /- La clôture et le remboursement de l'ensemble des comptes, plans et livrets ouverts au nom du défunt ;/);
  assert.match(t, /DECHARGE ledit organisme financier et Maître Sophie GOSSART de toute responsabilité à la suite de ce remboursement\./);
  assert.doesNotMatch(t, /pacte civil/);
  assert.equal(doc[0].gras, true);
  assert.equal(A.manquesAutorisation(doc), 0);
});

test('héritier : transfert au nom du conjoint survivant ; signataire féminin non pacsée = ligne de PACS ; conjoint : agissant en qualité de conjoint survivant', () => {
  const fille = { civilite: 'Madame', prenoms: 'Sophie', nom: 'ORANGER', conjointLien: 'Divorcée de', conjointNom: 'Monsieur Denis DUBOIS', naissanceLieu: 'CREIL', naissanceDate: '1968-02-06' };
  const h = texte(A.documentAutorisationSuccession('heritier', { signataire: fille, defunt, conjointSurvivant: 'Monsieur Maurice Albert ORANGER' }));
  assert.match(h, /^LA SOUSSIGNÉE :/);
  assert.match(h, /N'ayant pas conclu, à ce jour, de pacte civil de solidarité régi par les articles 515-1 et suivants du Code civil\./);
  assert.match(h, /le transfert au nom de Monsieur Maurice Albert ORANGER des comptes, plans et livrets ouverts au nom du défunt\./);
  const c = texte(A.documentAutorisationSuccession('conjoint', { signataire: { civilite: 'Monsieur', prenoms: 'Maurice Albert', nom: 'ORANGER' }, defunt: Object.assign({}, defunt, { conjointLien: 'Épouse de', conjointNom: 'Monsieur Maurice Albert ORANGER' }) }));
  assert.match(c, /Agissant en qualité de conjoint survivant de :/);
  assert.match(c, /Madame Thi Thien NGUYEN, épouse de Monsieur Maurice Albert ORANGER, en son vivant retraitée, demeurant à BLOIS/);
  assert.match(c, /le transfert au nom de Monsieur Maurice Albert ORANGER des comptes/);
  assert.doesNotMatch(c, /pacte civil/);
});

test('une donnée absente reste « à compléter » et est comptée ; modèle proposé et nom de fichier', () => {
  const doc = A.documentAutorisationSuccession('deblocage', { signataire: { civilite: 'Madame', nom: 'DUPONT' }, defunt: {} });
  assert.ok(A.manquesAutorisation(doc) >= 5);
  assert.match(texte(doc), /demeurant à à compléter/);
  assert.equal(A.modeleParDefautAutorisation(true, true), 'conjoint');
  assert.equal(A.modeleParDefautAutorisation(false, true), 'heritier');
  assert.equal(A.modeleParDefautAutorisation(false, false), 'deblocage');
  assert.equal(A.nomFichierAutorisation('deblocage', { nom: 'NGUYEN', prenoms: 'Philippe' }), 'Autorisation de déblocage de fonds - NGUYEN Philippe.pdf');
  assert.equal(A.dateAutorisation('2026-13-01'), '');
});

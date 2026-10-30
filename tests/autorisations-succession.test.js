'use strict';

// Autorisations de déblocage ou de transfert de fonds (23/10) : textes des modèles de l'office, accords en genre, « à compléter » pour ce qui manque.

const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../commun/autorisations-succession');

const defunt = { civilite: 'Madame', prenoms: 'Rose Anne', nom: 'VALDOR', profession: 'retraitée', domicile: 'BLOIS (41000), 12 rue des Essais', naissanceLieu: 'HANOÏ (VIETNAM)', naissanceDate: '1925-10-05', nationalite: 'française', decesLieu: 'CHAILLES (41120)', decesDate: '2026-09-13', conjointLien: 'Veuve de', conjointNom: 'Monsieur Lucien MAREUIL' };
const fils = { civilite: 'Monsieur', prenoms: 'Philippe', nom: 'VALDOR', profession: 'retraité', domicile: 'PARIS (75011), 8 rue du Modèle', naissanceLieu: 'ORLEANS (45000)', naissanceDate: '1960-07-19', nationalite: 'française', conjointLien: 'Époux de', conjointNom: 'Madame Lise ABEL', mariage: 'Monsieur Philippe VALDOR et Madame Lise ABEL mariés le 04 avril 1991.' };
const texte = (doc) => doc.map((x) => x.texte).join('\n');

test('déblocage : texte du modèle, signataire masculin, défunte, pas de ligne de PACS pour un marié', () => {
  const doc = A.documentAutorisationSuccession('deblocage', { signataire: fils, defunt });
  const t = texte(doc);
  assert.match(t, /^LE SOUSSIGNÉ :/);
  assert.match(t, /Monsieur Philippe VALDOR, retraité, demeurant à PARIS \(75011\), 8 rue du Modèle\./);
  assert.match(t, /Epoux de Madame Lise ABEL\./);
  assert.match(t, /Né à ORLEANS \(45000\), le 19 juillet 1960\./);
  assert.match(t, /Habile à se dire et porter héritier de :/);
  assert.match(t, /Madame Rose Anne VALDOR, en son vivant retraitée, veuve de Monsieur Lucien MAREUIL demeurant à BLOIS \(41000\), 12 rue des Essais,/);
  assert.match(t, /Décédée à CHAILLES \(41120\), le 13 septembre 2026\./);
  assert.match(t, /- La clôture et le remboursement de l'ensemble des comptes, plans et livrets ouverts au nom du défunt ;/);
  assert.match(t, /DECHARGE ledit organisme financier et Maître Sophie GOSSART de toute responsabilité à la suite de ce remboursement\./);
  assert.doesNotMatch(t, /pacte civil/);
  assert.equal(doc[0].gras, true);
  assert.equal(A.manquesAutorisation(doc), 0);
});

test('héritier : transfert au nom du conjoint survivant ; signataire féminin non pacsée = ligne de PACS ; conjoint : agissant en qualité de conjoint survivant', () => {
  const fille = { civilite: 'Madame', prenoms: 'Sophie', nom: 'DORVAL', conjointLien: 'Divorcée de', conjointNom: 'Monsieur Marc LEBLOND', naissanceLieu: 'MONTARGIS', naissanceDate: '1968-02-06' };
  const h = texte(A.documentAutorisationSuccession('heritier', { signataire: fille, defunt, conjointSurvivant: 'Monsieur Paul Henri DORVAL' }));
  assert.match(h, /^LA SOUSSIGNÉE :/);
  assert.match(h, /N'ayant pas conclu, à ce jour, de pacte civil de solidarité régi par les articles 515-1 et suivants du Code civil\./);
  assert.match(h, /le transfert au nom de Monsieur Paul Henri DORVAL des comptes, plans et livrets ouverts au nom du défunt\./);
  const c = texte(A.documentAutorisationSuccession('conjoint', { signataire: { civilite: 'Monsieur', prenoms: 'Paul Henri', nom: 'DORVAL' }, defunt: Object.assign({}, defunt, { conjointLien: 'Épouse de', conjointNom: 'Monsieur Paul Henri DORVAL' }) }));
  assert.match(c, /Agissant en qualité de conjoint survivant de :/);
  assert.match(c, /Madame Rose Anne VALDOR, épouse de Monsieur Paul Henri DORVAL, en son vivant retraitée, demeurant à BLOIS/);
  assert.match(c, /le transfert au nom de Monsieur Paul Henri DORVAL des comptes/);
  assert.doesNotMatch(c, /pacte civil/);
});

test('une donnée absente reste « à compléter » et est comptée ; modèle proposé et nom de fichier', () => {
  const doc = A.documentAutorisationSuccession('deblocage', { signataire: { civilite: 'Madame', nom: 'DUPONT' }, defunt: {} });
  assert.ok(A.manquesAutorisation(doc) >= 5);
  assert.match(texte(doc), /demeurant à \[à compléter\]/);
  assert.equal(A.modeleParDefautAutorisation(true, true), 'conjoint');
  assert.equal(A.modeleParDefautAutorisation(false, true), 'heritier');
  assert.equal(A.modeleParDefautAutorisation(false, false), 'deblocage');
  assert.equal(A.nomFichierAutorisation('deblocage', { nom: 'VALDOR', prenoms: 'Philippe' }), 'Autorisation de déblocage de fonds - VALDOR Philippe.pdf');
  assert.equal(A.dateAutorisation('2026-13-01'), '');
});

test('relecture 23/10 : genre inconnu, profession accordée, PACS jamais inventé, mariage à compléter, date impossible', () => {
  const inconnu = texte(A.documentAutorisationSuccession('deblocage', { signataire: { nom: 'DUPONT', prenoms: 'Camille' }, defunt: { nom: 'DUPONT', prenoms: 'Jean' } }));
  assert.match(inconnu, /^LE SOUSSIGNÉ\(E\) :/);
  assert.match(inconnu, /Né\(e\) à \[à compléter\]/);
  assert.match(inconnu, /Décédé\(e\) à/);
  assert.match(inconnu, /Pacte civil de solidarité : \[à compléter\]\./);
  assert.doesNotMatch(inconnu, /N'ayant pas conclu/);
  assert.equal(A.professionAccordee('Retraité', 'f'), 'retraitée');
  assert.equal(A.professionAccordee('Retraitée', 'f'), 'retraitée');
  assert.equal(A.professionAccordee('Retraitée', 'm'), 'retraité');
  assert.equal(A.professionAccordee('Chef de groupe', 'f'), 'chef de groupe');
  const marie = texte(A.documentAutorisationSuccession('deblocage', { signataire: { civilite: 'Madame', prenoms: 'Anne', nom: 'LEROY', conjointLien: 'Épouse de', conjointNom: 'Monsieur Paul LEROY' }, defunt }));
  assert.match(marie, /Mariage \(lieu, date, régime\) : \[à compléter\]\./);
  assert.doesNotMatch(marie, /pacte civil/);
  assert.equal(A.dateAutorisation('2026-02-31'), '');
  assert.match(A.corpsEmailAutorisation('heritier', 'Madame Jeanne DURAND', 'Madame'), /^Madame,\n\nDans le cadre du règlement de la succession de Madame Jeanne DURAND, vous trouverez ci-joint l'autorisation de transfert de fonds/);
});

test('pour Yousign : « Fait à : » et « Le : » sont retirés (avec les lignes vides qui les précèdent), rien d’autre', () => {
  const doc = A.documentAutorisationSuccession('deblocage', { signataire: fils, defunt });
  assert.deepEqual(doc.slice(-2).map((x) => x.texte), ['Fait à :', 'Le :']);
  const sans = A.sansLieuDateAutorisation(doc);
  assert.equal(sans.length, doc.length - 3, 'les deux lignes et la ligne vide qui les précède');
  assert.doesNotMatch(texte(sans), /Fait à|^Le :/m);
  assert.match(sans[sans.length - 1].texte, /paiement de toutes factures établies au nom du défunt\.$/);
  assert.equal(sans[sans.length - 1].vide, undefined);
  // Un paragraphe qui parle d'une date n'est pas touché.
  assert.equal(A.sansLieuDateAutorisation([{ texte: 'Le jour de la signature.' }, { texte: 'Fait à :' }]).length, 1);
});

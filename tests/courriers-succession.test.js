'use strict';

// Courriers d'interrogation d'une succession (étude 15/10) : neuf modèles de l'étude, accords en genre, bloc du défunt, forme du contenu.
// Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../commun/courriers-succession');

const defunt = { civilite: 'Madame', prenoms: 'Jeanne Marie', nom: 'DURAND', domicile: 'BLOIS (41000), 3 rue des Lilas', naissanceDate: '1930-11-17', naissanceLieu: 'TOURS (37000)',
  decesDate: '2026-09-14', decesLieu: 'BLOIS (41000)', conjointLien: 'Veuve de', conjointNom: 'Monsieur Paul Henri MARTIN' };

test('neuf modèles, chacun avec salutation, corps et formule finale', () => {
  assert.equal(C.MODELES_COURRIER_SUCCESSION.length, 9);
  assert.deepEqual(C.MODELES_COURRIER_SUCCESSION.map(m => m.cle).sort(), ['assurance-vie', 'banque', 'carsat', 'cpam', 'ehpad', 'impots', 'msa', 'mutuelle', 'retraite']);
  for (const m of C.MODELES_COURRIER_SUCCESSION) {
    assert.ok(m.salutation.endsWith(','), m.cle);
    assert.ok(/mes salutations distinguées\.$/.test(m.formule), m.cle);
    assert.ok(m.corps({ f: true, nomUsuel: 'Madame Jeanne DURAND' }).length >= 2, m.cle);
  }
});

test('date : « 01 octobre 2026 », vide si elle n’existe pas', () => {
  assert.equal(C.dateCourrierSuccession('2026-10-01'), '01 octobre 2026');
  assert.equal(C.dateCourrierSuccession('2026-13-01'), '');
  assert.equal(C.dateCourrierSuccession(''), '');
});

test('bloc du défunt : l’ordre des courriers de l’étude, lignes absentes omises', () => {
  const l = C.lignesBlocDefunt(defunt);
  assert.equal(l[0], '**Succession de :** Madame Jeanne Marie DURAND');
  assert.equal(l[2], '**Date et lieu de naissance :** le 17 novembre 1930 à TOURS (37000)');
  assert.equal(l[3], '**Date et lieu de décès :** le 14 septembre 2026 à BLOIS (41000)');
  assert.equal(l[4], '**Veuve de :** Monsieur Paul Henri MARTIN');
  assert.equal(C.lignesBlocDefunt({ civilite: 'Monsieur', nom: 'X' }).length, 1);
});

test('CPAM : la défunte / le défunt selon la civilité ; adresse et « Envoi par mail »', () => {
  const f = C.contenuCourrierSuccession('cpam', { dateIso: '2026-10-01', defunt, envoiParMail: true, suiviPar: 'Jérémy SAUJOT' });
  assert.match(f, /^C\.P\.A\.M\. DE LOIR ET CHER\nEnvoi par mail\n\nBlois, le 01 octobre 2026\n\n/);
  assert.match(f, /je vous informe que la défunte dépendait de votre caisse\./);
  assert.match(f, /\*\*Dossier suivi par :\*\* Jérémy SAUJOT/);
  assert.match(f, /Me Sophie GOSSART$/);
  const h = C.contenuCourrierSuccession('cpam', { dateIso: '2026-10-01', defunt: { ...defunt, civilite: 'Monsieur' } });
  assert.match(h, /je vous informe que le défunt dépendait de votre caisse\./);
});

test('banque : cinq points repris mot pour mot, puces collées, « la défunte » au point 2', () => {
  const c = C.contenuCourrierSuccession('banque', { dateIso: '2026-10-01', defunt, destinataire: ['CAISSE X', 'Service successions'] });
  assert.match(c, /^CAISSE X\nService successions\n\nBlois, le/);
  assert.match(c, /\n- la situation du ou des comptes, en capital et intérêts[^\n]+\n- la liste et l'évaluation des valeurs mobilières[^\n]+\n- le cas échéant, si un coffre-fort y était ouvert\.\n\n2°\) Me communiquer/);
  assert.match(c, /souscrits par la défunte, quelle que soit la date de souscription\./);
  assert.match(c, /5°\) Et m'indiquer également les formalités à respecter pour mettre les fonds à disposition des héritiers\./);
  assert.match(c, /Madame la Directrice, Monsieur le Directeur, mes salutations distinguées\.\n\nMe Sophie GOSSART$/);
});

test('impôts : nom usuel (premier prénom) et accord ; EHPAD : « laquelle / lequel » et rappel de l’article L.314-10-1', () => {
  const i = C.contenuCourrierSuccession('impots', { dateIso: '2026-10-01', defunt });
  assert.match(i, /la situation fiscale de Madame Jeanne DURAND au regard de l'impôt sur le revenu/);
  assert.match(i, /Dans le cas où la défunte aurait fait mensualiser/);
  assert.match(i, /Madame la Trésorière, Monsieur le Trésorier,/);
  const e = C.contenuCourrierSuccession('ehpad', { dateIso: '2026-10-01', defunt });
  assert.match(e, /laquelle séjournait dans votre établissement/);
  assert.match(e, /article L\.314-10-1 du Code de l’action sociale et des familles : « Au décès du résident/);
  assert.match(C.contenuCourrierSuccession('ehpad', { dateIso: '2026-10-01', defunt: { ...defunt, civilite: 'Monsieur' } }), /lequel séjournait/);
});

test('adresse : au moins deux lignes ; modèle inconnu → rien ; nom de fichier sûr', () => {
  const c = C.contenuCourrierSuccession('mutuelle', { dateIso: '2026-10-01', defunt, destinataire: ['MNT'] });
  assert.match(c, /^MNT\n \n\nBlois, le/);
  assert.equal(C.contenuCourrierSuccession('inconnu', {}), '');
  assert.equal(C.nomFichierCourrierSuccession('carsat', 'SUCC DURAND/MARTIN'), 'Interrogation CARSAT - SUCC DURAND MARTIN');
});

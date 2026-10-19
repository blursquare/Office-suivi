'use strict';

// Courriers d'interrogation d'une succession (étude 15/10) : neuf modèles de l'étude et un courrier vierge, décrits ligne à ligne comme
// les originaux (lignes vides comprises), accords en genre, bloc du défunt. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../commun/courriers-succession');

const defunt = { civilite: 'Madame', prenoms: 'Jeanne Marie', nom: 'DURAND', domicile: 'BLOIS (41000), 3 rue des Lilas', naissanceDate: '1930-11-17', naissanceLieu: 'TOURS (37000)',
  decesDate: '2026-09-14', decesLieu: 'BLOIS (41000)', conjointLien: 'Veuve de', conjointNom: 'Monsieur Paul Henri MARTIN' };
const texte = (doc) => doc.lignes.join('\n');

test('neuf modèles de l’étude et le courrier vierge, chacun finissant par la formule de politesse', () => {
  assert.deepEqual(C.MODELES_COURRIER_SUCCESSION.map(m => m.cle).sort().join(','), 'assurance-vie,autre,banque,carsat,cpam,ehpad,impots,msa,mutuelle,retraite');
  for (const m of C.MODELES_COURRIER_SUCCESSION) {
    assert.ok(m.salutation.endsWith(','), m.cle);
    const l = m.lignes({ f: true, nomUsuel: 'Madame Jeanne DURAND', texteLibre: 'Texte.' });
    assert.match(l[l.length - 1], /mes salutations distinguées\.$/, m.cle);
    assert.ok(Number.isInteger(m.blancsSignature), m.cle);
  }
});

test('date : « 01 octobre 2026 », vide si elle n’existe pas', () => {
  assert.equal(C.dateCourrierSuccession('2026-10-01'), '01 octobre 2026');
  assert.equal(C.dateCourrierSuccession('2026-13-01'), '');
  assert.equal(C.dateCourrierSuccession(''), '');
});

test('bloc du défunt : sans soulignement (variables d’Authentic), lignes absentes omises', () => {
  const l = C.lignesBlocDefunt(defunt);
  assert.equal(l[0], 'Succession de : Madame Jeanne Marie DURAND');
  assert.equal(l[1], 'Domicile : BLOIS (41000), 3 rue des Lilas');
  assert.equal(l[2], 'Date et lieu de naissance : le 17 novembre 1930 à TOURS (37000)');
  assert.equal(l[3], 'Date et lieu de décès : le 14 septembre 2026 à BLOIS (41000)');
  assert.equal(l[4], 'Veuve de : Monsieur Paul Henri MARTIN');
  assert.equal(C.lignesBlocDefunt({ civilite: 'Monsieur', nom: 'X' }).length, 1);
  // Régime matrimonial de la fiche (étude 19/10), sous le conjoint.
  const r = C.lignesBlocDefunt(Object.assign({}, defunt, { regime: 'Communauté légale nouvelle' }));
  assert.equal(r[5], 'Régime matrimonial : Communauté légale nouvelle');
  assert.equal(C.lignesBlocDefunt(Object.assign({}, defunt, { conjointLien: 'Divorcée de', regime: 'Séparation de biens' })).length, 5, 'divorcée : pas de régime');
  assert.equal(C.lignesBlocDefunt(Object.assign({}, defunt, { conjointNom: '', regime: 'Séparation de biens' })).length, 4, 'sans conjoint nommé : pas de régime');
});

test('disposition : adresse à la 2e ligne (à la 1re dès quatre lignes), quatre lignes vides, le défunt, deux lignes vides, la formule d’appel', () => {
  const d = C.documentCourrierSuccession('cpam', { dateIso: '2026-10-01', defunt, envoiParMail: true });
  assert.equal(d.adresse.join('|'), 'C.P.A.M. DE LOIR ET CHER|Envoi par mail');
  assert.equal(d.adresseDebut, 2);
  assert.equal(d.date, 'Blois, le 01 octobre 2026');
  assert.equal(d.lignes.slice(0, 4).join('|'), '|||');
  assert.equal(d.lignes[4], 'Succession de : Madame Jeanne Marie DURAND');
  assert.equal(d.lignes.slice(9, 13).join('|'), '||Madame, Monsieur,|');
  assert.equal(d.signature, 'Me Sophie GOSSART');
  assert.equal(C.documentCourrierSuccession('banque', { dateIso: '2026-10-01', defunt, destinataire: ['A', 'B', 'C', 'D'] }).adresseDebut, 1);
});

test('CPAM : la défunte / le défunt selon la civilité', () => {
  assert.match(texte(C.documentCourrierSuccession('cpam', { dateIso: '2026-10-01', defunt })), /je vous informe que la défunte dépendait de votre caisse\./);
  assert.match(texte(C.documentCourrierSuccession('cpam', { dateIso: '2026-10-01', defunt: { ...defunt, civilite: 'Monsieur' } })), /je vous informe que le défunt dépendait de votre caisse\./);
});

test('banque : les cinq points mot pour mot, gras et souligné de l’original, une ligne vide avant « Me … »', () => {
  const d = C.documentCourrierSuccession('banque', { dateIso: '2026-10-01', defunt, destinataire: ['CAISSE X', 'Service successions'] });
  const t = texte(d);
  assert.match(t, /\n- la situation du ou des comptes, en capital et intérêts[^\n]+\n- la liste et l'évaluation des valeurs mobilières[^\n]+\n- le cas échéant, si un coffre-fort y était ouvert\.\n\n2°\) Me communiquer/);
  assert.match(t, /\*\*contrats d'assurance-vie\*\* ou assimilés souscrits par la défunte, quelle que soit la date de souscription\./);
  assert.match(t, /5°\) Et m'indiquer également les \*\*formalités\*\* à respecter/);
  assert.match(t, /Madame la Directrice, Monsieur le Directeur, mes salutations distinguées\.$/);
  assert.equal(d.blancsSignature, 1);
});

test('impôts : nom usuel (premier prénom) et accord ; EHPAD : « laquelle / lequel »', () => {
  const i = texte(C.documentCourrierSuccession('impots', { dateIso: '2026-10-01', defunt }));
  assert.match(i, /Madame Jeanne DURAND/);
  assert.match(i, /Dans le cas où la défunte aurait fait mensualiser/);
  assert.match(i, /Madame la Trésorière, Monsieur le Trésorier,/);
  assert.match(texte(C.documentCourrierSuccession('ehpad', { dateIso: '2026-10-01', defunt })), /laquelle séjournait/);
  assert.match(texte(C.documentCourrierSuccession('ehpad', { dateIso: '2026-10-01', defunt: { ...defunt, civilite: 'Monsieur' } })), /lequel séjournait/);
});

test('courrier vierge : le texte saisi (texte proposé à défaut), entre la formule d’appel et la formule de politesse', () => {
  const d = C.documentCourrierSuccession('autre', { dateIso: '2026-10-01', defunt, destinataire: ['CAISSE Y'], texteLibre: 'Première ligne.\nSeconde **ligne**.' });
  assert.match(texte(d), /Madame, Monsieur,\n\nPremière ligne\.\nSeconde \*\*ligne\*\*\.\n\nVous en remerciant par avance,\n\nJe vous prie d'agréer, Madame, Monsieur, mes salutations distinguées\.$/);
  assert.ok(texte(C.documentCourrierSuccession('autre', { dateIso: '2026-10-01', defunt })).includes(C.TEXTE_LIBRE_PAR_DEFAUT));
});

test('destinataire vide → « À compléter » ; modèle inconnu → null ; nom de fichier sûr', () => {
  assert.equal(C.documentCourrierSuccession('mutuelle', { dateIso: '2026-10-01', defunt }).adresse.join('|'), 'À compléter');
  assert.equal(C.documentCourrierSuccession('inconnu', {}), null);
  assert.equal(C.nomFichierCourrierSuccession('carsat', 'SUCC DURAND/MARTIN'), 'Interrogation CARSAT - SUCC DURAND MARTIN');
});

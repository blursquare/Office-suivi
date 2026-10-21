'use strict';

// Calcul libre de « Demander à CLAIRE » (21/10, palier 3) : les parties pures (CSV, tableau borné, page du bac à sable).
// Le bac à sable lui-même (réseau coupé, boucle arrêtée) se joue dans un vrai Chromium : `npm run fumee`.

const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('cellule CSV : virgule décimale, guillemets, formule neutralisée', () => {
  assert.equal(app.celluleCsvCalcul(12.5), '12,5');
  assert.equal(app.celluleCsvCalcul(null), '');
  assert.equal(app.celluleCsvCalcul(true), 'oui');
  assert.equal(app.celluleCsvCalcul('a;b'), '"a;b"');
  assert.equal(app.celluleCsvCalcul('x"y'), '"x""y"');
  assert.equal(app.celluleCsvCalcul('=1+1'), "'=1+1");
  assert.equal(app.celluleCsvCalcul('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(app.celluleCsvCalcul(-3), '-3');
});

test('tableau : validé et borné ; CSV avec BOM, séparateur « ; », une ligne par ligne', () => {
  assert.equal(app.tableauCalculValide(null), null);
  assert.equal(app.tableauCalculValide({ colonnes: [], lignes: [] }), null);
  assert.equal(app.tableauCalculValide({ colonnes: ['a'], lignes: 'x' }), null);
  const t = app.tableauCalculValide({ titre: 'Offres', colonnes: ['Dossier', 'Montant'], lignes: [['VTE - X', 180000], ['VTE - Y']] });
  const csv = app.csvDepuisTableauCalcul(t);
  assert.equal(csv, '﻿Dossier;Montant\r\nVTE - X;180000\r\nVTE - Y;\r\n');
  const grand = app.tableauCalculValide({ colonnes: ['a'], lignes: new Array(25000).fill([1]) });
  assert.equal(grand.lignes.length, 20000);
  assert.equal(grand.coupe, true);
});

test('page du bac à sable : CSP qui coupe tout, iframe sans origine, un Worker blob', () => {
  const page = app.pageBacASableCalcul();
  assert.match(page, /default-src 'none'/);
  assert.match(page, /worker-src blob:/);
  assert.doesNotMatch(page, /connect-src|img-src|frame-src/, 'rien d’autre que le défaut « none »');
  assert.match(page, /ev\.source !== parent/, 'seul le parent peut lancer un calcul');
  assert.match(app.SOURCE_WORKER_CALCUL, /AsyncFunction/);
});

test('aperçu rendu à l’IA : 15 lignes, cellules coupées, taille bornée', () => {
  const lignes = new Array(40).fill(['x'.repeat(5000), 1]);
  const a = app.apercuTableauCalcul(lignes);
  assert.ok(a.length <= 15);
  assert.ok(a[0][0].length <= 201);
  assert.ok(JSON.stringify(a).length < 7000);
});

// ---- Artefacts (21/10) : client/99-assistant-artefacts.js, parties pures ----

test('courrier écrit par l’IA → document du papier à en-tête : destinataire, date, corps, signature', () => {
  const d = app.documentCourrierDepuisTexteAgent('Mairie de Blois\nService urbanisme\n41000 BLOIS\n\nBlois, le 21 octobre 2026\n\n**Objet : Renseignements**\n\nMadame, Monsieur,\n\n- Un certificat,\n• Un autre,\n| a | b |\n|---|---|\n| 1 | 2 |\n\nVotre bien dévoué.\n\nMe Sophie GOSSART', '1 janvier');
  assert.deepEqual([...d.adresse], ['Mairie de Blois', 'Service urbanisme', '41000 BLOIS']);
  assert.equal(d.date, 'Blois, le 21 octobre 2026');
  assert.equal(d.signature, 'Me  Sophie GOSSART');
  assert.equal(d.lignes[3], '**Objet : Renseignements**');
  assert.ok([...d.lignes].includes('- Un certificat,') && [...d.lignes].includes('- Un autre,'));
  assert.ok([...d.lignes].includes('a — b') && [...d.lignes].includes('1 — 2'), 'un tableau de l’IA devient des lignes de texte');
  assert.ok(![...d.lignes].some(l => /^\|/.test(l)));
});

test('courrier sans destinataire ni date : « À compléter » et la date du jour ; destinataire borné à 7 lignes', () => {
  const d = app.documentCourrierDepuisTexteAgent('\nMadame, Monsieur,\n\nBonjour.', '3 mars 2027');
  assert.deepEqual([...d.adresse], ['À compléter']);
  assert.equal(d.date, 'Blois, le 3 mars 2027');
  assert.equal(d.signature, 'Me  Sophie GOSSART');
  const long = app.documentCourrierDepuisTexteAgent('1\n2\n3\n4\n5\n6\n7\n8\n9\n\nCorps', 'x');
  assert.equal(long.adresse.length, 7);
});

test('tableau : cellule numérique reconnue (virgule), code à zéro initial et formule gardés en texte ; classeur Excel bien formé', () => {
  assert.equal(app.valeurCelluleArtefact('95000,5'), 95000.5);
  assert.equal(app.valeurCelluleArtefact('-3'), -3);
  assert.equal(app.valeurCelluleArtefact('007'), '007');
  assert.equal(app.valeurCelluleArtefact('=1+1'), '=1+1');
  assert.equal(app.lettreColonneArtefact(0), 'A');
  assert.equal(app.lettreColonneArtefact(27), 'AB');
  const f = app.fichiersXlsxArtefact({ titre: 'Offres: <1>/2', colonnes: ['Dossier', 'Montant'], lignes: [['A & B', '12,5'], ['=SOMME(A1)', 'x']] });
  assert.ok(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml'].every(n => n in f));
  const feuille = f['xl/worksheets/sheet1.xml'];
  assert.match(feuille, /<c r="B2"><v>12\.5<\/v><\/c>/);
  assert.match(feuille, /t="inlineStr"[^>]*><is><t xml:space="preserve">=SOMME\(A1\)<\/t>/, 'une formule reste du texte');
  assert.match(feuille, /A &amp; B/);
  assert.doesNotMatch(f['xl/workbook.xml'], /[<>/:?*]1>/);
  assert.match(f['xl/workbook.xml'], /name="Offres {2}&lt;1&gt; 2"/);
});

test('courrier : signature « Maître … » reconnue, titre « # » en gras, pas de doublon de signature', () => {
  const d = app.documentCourrierDepuisTexteAgent('Mairie\n\nBlois, le 2 mars 2027\n\n# Objet : demande\n\nMadame, Monsieur,\n\nBonjour.\n\nMaître Sophie GOSSART', 'x');
  assert.equal(d.signature, 'Me  Sophie GOSSART');
  assert.ok([...d.lignes].includes('**Objet : demande**'));
  assert.ok(![...d.lignes].some(l => /GOSSART/.test(l)), 'la signature n’est pas répétée dans le corps');
});

'use strict';
// « Demander à CLAIRE » : la colonne de droite (étude 18/10) — citations cliquables, étapes du plan, documents de la conversation.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

test('citations : « extrait » [doc3 p. 12] et [pj1 p. 2] deviennent des boutons qui portent le document, la page et le passage', () => {
  const html = app.citationsCliquablesAssistant(app.escapeHtml('Voir « la condition suspensive d’obtention du prêt » [doc3 p. 12] et [pj1 p. 2].'));
  assert.match(html, /data-doc="doc3" data-page="12" data-extrait="la condition suspensive d’obtention du prêt"/);
  assert.match(html, /data-doc="pj1" data-page="2" data-extrait=""/);
  assert.match(html, /onclick="ouvrirCitationAssistant\(this\)"/);
  // Une référence piégée ne sort jamais de l'attribut.
  const piege = app.citationsCliquablesAssistant(app.escapeHtml('« x" onmouseover="alert(1) » [doc1 p. 1]'));
  assert.match(piege, /data-extrait="x&quot; onmouseover=&quot;alert\(1\)"/, 'le passage reste dans son attribut, échappé');
  assert.doesNotMatch(piege, /<button[^>]* onmouseover="/);
  assert.equal(app.citationsCliquablesAssistant('Sans référence [NOM1].'), 'Sans référence [NOM1].');
});

test('plan de travail : 8 étapes au plus, états connus, codes inventés effacés', () => {
  const e = app.etapesPlanDepuisEntree({ etapes: [{ texte: 'Lire le compromis de [NOM9]', etat: 'en_cours' }, { texte: 'Conclure', etat: 'bizarre' }, { texte: '', etat: 'fait' }] });
  assert.equal(e.length, 2);
  assert.equal(e[0].texte, 'Lire le compromis de …');
  assert.equal(e[1].etat, 'a_faire');
  assert.equal(app.etapesPlanDepuisEntree({ etapes: Array.from({ length: 12 }, (_, i) => ({ texte: 'é' + i, etat: 'fait' })) }).length, 8);
});

test('documents de la conversation : pièces jointes et documents lus, jamais toute la liste du dossier', () => {
  const connus = { doc1: { sorte: 'fichier', libelle: 'Compromis' }, doc2: { sorte: 'fichier', libelle: 'ERP' }, pj1: { sorte: 'joint', libelle: 'Offre.pdf', sortePiece: 'pdf' } };
  const docs = app.documentsColonneAssistant(connus, { doc2: '1-30' });
  assert.equal(docs.map((d) => d.id).join(','), 'pj1,doc2');
  assert.equal(docs[1].pages, '1-30');
  assert.equal(app.etatApercuAssistant({ etat: 'absente' }).startsWith('Citation non retrouvée'), true);
});

test('relecture 0.282.0 : une citation qui contient une référence ne casse pas le balisage ; gras retiré du passage cherché', () => {
  const html = app.citationsCliquablesAssistant(app.escapeHtml('« voir [doc2 p. 3] ici » [doc1 p. 2]'));
  assert.equal((html.match(/<button/g) || []).length, 2);
  assert.doesNotMatch(html, /data-extrait="[^"]*<button/);
  const gras = app.citationsCliquablesAssistant('« le <b>prix</b> de vente » [doc1 p. 4]');
  assert.match(gras, /data-extrait="le prix de vente"/);
});

'use strict';
// Réactions (étude 25/10, client/117-reactions.js) : pastilles, et ce que CLAIRE lit à son tour de parole (une seule fois par réaction).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('CLAIRE lit les réactions posées sur SES réponses, une seule fois', () => {
  const claire = { role: 'claire', id: 'm1', texte: 'La vente est prévue le 3 novembre.', reactions: [{ emoji: '👍', par: ['Julie VASSELIN'] }, { emoji: '❓', par: ['Bastien ANGLUMENT'] }] };
  const moi = { role: 'moi', id: 'm2', texte: 'Merci', reactions: [{ emoji: '👍', par: ['Julie VASSELIN'] }] };
  const sans = { role: 'claire', id: 'm3', texte: 'Autre', reactions: [] };
  const r = app.prefixeReactionsAgent([claire, moi, sans], 'Bastien ANGLUMENT');
  assert.match(r.texte, /^\(Réactions posées/);
  assert.match(r.texte, /La vente est prévue le 3 novembre/);
  assert.match(r.texte, /moi : ❓ \(pas clair/);
  assert.match(r.texte, /: 👍 \(compris/);
  assert.doesNotMatch(r.texte, /Merci/, 'jamais une réaction sur le message de l’utilisateur');
  assert.equal(r.lues.length, 1);
  app.marquerReactionsLuesAgent(r.lues);
  assert.equal(app.prefixeReactionsAgent([claire], 'Bastien ANGLUMENT').texte, '', 'déjà lue : pas redite');
  claire.reactions.push({ emoji: '👎', par: ['Jérémy SAUJOT'] });
  assert.match(app.prefixeReactionsAgent([claire], 'Bastien ANGLUMENT').texte, /👎 \(pas d'accord/, 'une réaction nouvelle est redite');
});

test('pastilles : le nombre, ma réaction mise en avant, rien sans réaction', () => {
  const m = { role: 'claire', id: 'm1', reactions: [{ emoji: '👍', par: ['Julie VASSELIN', 'Jérémy SAUJOT'] }] };
  const html = app.htmlReactionsMessage(m);
  assert.match(html, /asst-reaction-n">2</);
  assert.match(html, /ouvrirSelecteurReaction/);
  assert.equal(app.htmlReactionsMessage({ id: 'm2', reactions: [] }), '');
});

test('lien NAS d’une pièce jointe : identifiant aller-retour, adresse de l’explorateur confiné, jamais une copie', () => {
  const id = app.idLienNasPieceJointe('dossier.1', 'Vendeur/Pièce d\'identité #1.pdf');
  const l = app.lienNasPieceJointe(id);
  assert.equal(l.dossierId, 'dossier.1');
  assert.equal(l.chemin, 'Vendeur/Pièce d\'identité #1.pdf');
  assert.equal(app.lienNasPieceJointe('a'.repeat(32)), null, 'un fichier du serveur n’est pas un lien NAS');
  assert.match(app.urlServeurPieceJointeAssistant(id), /^\/api\/nas\/explorer\/fichier\?dossierId=dossier\.1&chemin=Vendeur%2F/);
  assert.equal(app.urlServeurPieceJointeAssistant('a'.repeat(32)), '/api/pieces-jointes/' + 'a'.repeat(32) + '/fichier');
});

test('actionReaction : 📌 épingle, ✋ prend, 🔁 relance, le reste rien', () => {
  const { actionReaction } = require('../commun/reactions');
  assert.equal(actionReaction('📌'), 'epingler');
  assert.equal(actionReaction('✋'), 'prendre');
  assert.equal(actionReaction('🔁'), 'relancer');
  assert.equal(actionReaction('👍'), '');
});

test('nouveaux emojis-gestes et décompte d’un sondage', () => {
  const { actionReaction, decompteSondage } = require('../commun/reactions');
  assert.deepEqual(['🕐', '🕒', '👥', '📝', '🔒', '🗳️'].map(actionReaction), ['rappeler3', 'rappeler7', 'prevenir', 'consigne', 'clore', 'decompte']);
  const s = decompteSondage('Sondage : déjeuner ?\n1. Pizza\n- Sushi', [{ emoji: '1️⃣', par: ['Julie VASSELIN', 'CLAIRE'] }]);
  assert.equal(s.question, 'déjeuner ?');
  assert.equal(s.options.length, 2);
  assert.deepEqual(s.options.map((o) => o.votes.length), [1, 0], 'CLAIRE ne vote pas');
  assert.equal(decompteSondage('bonjour', []), null);
  assert.equal(decompteSondage('sondage : seule\n1. une', []), null);
});

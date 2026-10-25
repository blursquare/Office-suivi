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

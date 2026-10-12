'use strict';

// « Demander à CLAIRE » : plusieurs conversations (étude 12/10, client/63-assistant-conversations.js) — gardées sur le poste,
// 30 jours, 20 au plus, sans les boutons ; titres ; groupes de la colonne.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const MAINTENANT = new Date(2026, 9, 12, 15, 0).getTime();
const conv = (id, ilYaJours, titre) => ({ id, majLe: MAINTENANT - ilYaJours * 86400000, creeLe: MAINTENANT - ilYaJours * 86400000,
  messages: [{ role: 'moi', html: escape(titre), quand: 1 }, { role: 'claire', html: '<p>Réponse</p>', boutons: [{ libelle: 'Annuler', action: () => {} }], quand: 2 }],
  contexte: { dossierId: 'd1', attente: { type: 'dossier' }, historique: [], echanges: [] } });
function escape(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;'); }

test('titre : la première demande, en texte, 60 caractères au plus', () => {
  assert.equal(app.titreConversationAssistant([{ role: 'claire', html: '<p>Bonjour</p>' }, { role: 'moi', html: 'Où en est l&#39;offre &amp; le RIB ?' }]), 'Où en est l\'offre & le RIB ?');
  assert.equal(app.titreConversationAssistant([]), 'Nouvelle conversation');
  assert.ok(app.titreConversationAssistant([{ role: 'moi', html: 'x'.repeat(100) }]).length <= 60);
});

test('gardées : non vides, moins de 30 jours, 20 au plus, la plus récente d’abord ; écrites sans boutons ni attente', () => {
  const liste = [conv('a', 2, 'Deux'), conv('b', 0, 'Zéro'), conv('c', 40, 'Vieille'), { id: 'v', majLe: MAINTENANT, messages: [] }];
  for (let i = 0; i < 25; i++) liste.push(conv('n' + i, 1 + i / 100, 'N' + i));
  const g = app.conversationsAGarderAssistant(liste, MAINTENANT);
  assert.equal(g.length, 20);
  assert.equal(g[0].id, 'b');
  assert.ok(!g.some(c => c.id === 'c' || c.id === 'v'));
  const ecrit = app.serialiserConversationsAssistant([conv('a', 2, 'Deux')], MAINTENANT);
  assert.doesNotMatch(ecrit, /boutons|attente|Annuler/);
  const relu = app.lireConversationsAssistant(ecrit, MAINTENANT);
  assert.equal(relu.length, 1);
  assert.equal(relu[0].titre, 'Deux');
  assert.equal(relu[0].messages[1].boutons.length, 0);
  assert.equal(relu[0].contexte.attente, null);
  assert.equal(relu[0].contexte.dossierId, 'd1');
  assert.equal(app.lireConversationsAssistant('{illisible', MAINTENANT).length, 0);
  assert.equal(app.lireConversationsAssistant('{"a":1}', MAINTENANT).length, 0);
});

test('groupes : Aujourd’hui, Hier, 7 derniers jours, Plus anciennes', () => {
  const g = app.groupesConversationsAssistant([conv('a', 0.1, 'A'), conv('b', 1, 'B'), conv('c', 3, 'C'), conv('d', 20, 'D')], MAINTENANT);
  assert.equal(g.map(x => x.titre + ':' + x.conversations.map(c => c.id).join('')).join(','), 'Aujourd’hui:a,Hier:b,7 derniers jours:c,Plus anciennes:d');
});

test('étude 12/10 : jamais « Sauf erreur de ma part » — filtre des réponses de l’IA et textes d’emails de CLAIRE', () => {
  const A = require('../commun/assistant.js');
  assert.equal(A.sansSaufErreur('Sauf erreur de ma part, les fonds ne sont pas arrivés.'), 'Les fonds ne sont pas arrivés.');
  assert.equal(A.sansSaufErreur('Bonjour,\n\nSauf erreur de notre part, il manque le RIB.'), 'Bonjour,\n\nIl manque le RIB.');
  assert.equal(A.sansSaufErreur('Le RIB, sauf erreur de ma part, manque.'), 'Le RIB manque.');
  assert.equal(A.sansSaufErreur('Le prêt est accordé, sauf erreur ou omission de notre part.'), 'Le prêt est accordé.');
  const fs = require('node:fs');
  const path = require('node:path');
  const dossier = path.join(__dirname, '..', 'client');
  for (const f of fs.readdirSync(dossier).filter(x => x.endsWith('.js'))) assert.doesNotMatch(fs.readFileSync(path.join(dossier, f), 'utf8'), /'[^'\n]*Sauf erreur de (ma|notre) part/, f);
});

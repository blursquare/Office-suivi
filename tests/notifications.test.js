// Pastille et notifications Windows (étude 25/10, client/122-notifications.js) : le compteur et les nouveautés, sans DOM.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const vide = { messages: 0, mentions: 0, traiter: 0, suivi: 0, scans: 0, taches: 0, dates: 0 };

test('réglages par défaut : pastille et notifications allumées ; messages, mentions, propositions et Suivi comptés, le reste éteint', () => {
  const r = app.reglagesNotificationsComplets(null);
  assert.equal(r.pastille, true);
  assert.equal(r.windows, true);
  assert.equal(JSON.stringify(r.sources), JSON.stringify({ messages: true, mentions: true, traiter: true, suivi: true, scans: false, taches: false, dates: false }));
  assert.equal(app.reglagesNotificationsComplets({ sources: { scans: true, messages: 'oui' } }).sources.scans, true);
  assert.equal(app.reglagesNotificationsComplets({ sources: { messages: 'oui' } }).sources.messages, true, 'valeur illisible : celle par défaut');
});

test('pastille : somme des rubriques allumées, mentions comptées une seule fois, éteinte = 0, plafonnée', () => {
  const c = Object.assign({}, vide, { messages: 3, mentions: 1, traiter: 2, suivi: 4, scans: 5 });
  assert.equal(app.totalPastille(c, null), 9, 'la mention est déjà parmi les messages non lus ; les scans ne comptent pas par défaut');
  assert.equal(app.totalPastille(c, { sources: { messages: false } }), 7, 'sans les messages : la mention seule');
  assert.equal(app.totalPastille(c, { sources: { scans: true } }), 14);
  assert.equal(app.totalPastille(c, { pastille: false }), 0);
  assert.equal(app.totalPastille(Object.assign({}, vide, { suivi: 5000 }), null), 999);
});

test('notifications : une par rubrique qui monte, rubrique et nombre seulement ; rien au premier tour ni notifications coupées', () => {
  const avant = Object.assign({}, vide, { messages: 1, traiter: 1, suivi: 2 });
  const apres = Object.assign({}, vide, { messages: 3, traiter: 1, suivi: 1, scans: 2 });
  const n = app.nouveautesNotifications(avant, apres, null);
  assert.equal(n.map((x) => x.titre + ' : ' + x.texte).join(' | '), 'Discussions : 2 nouveaux messages');
  const m = app.nouveautesNotifications(avant, Object.assign({}, apres, { mentions: 1 }), null);
  assert.equal(m.map((x) => x.texte).join(' | '), 'On vous a cité', 'une mention : une seule bulle');
  assert.equal(app.nouveautesNotifications(avant, Object.assign({}, apres, { traiter: 2 }), null).map((x) => x.texte).join(' | '), '2 nouveaux messages | 1 proposition à décider');
  assert.equal(app.nouveautesNotifications(null, apres, null).length, 0, 'premier tour : les compteurs du démarrage ne sont pas des nouveautés');
  assert.equal(app.nouveautesNotifications(avant, apres, { windows: false }).length, 0);
  assert.equal(app.nouveautesNotifications(avant, apres, { sources: { scans: true } }).map((x) => x.titre).join(','), 'Discussions,Claire Scan');
});

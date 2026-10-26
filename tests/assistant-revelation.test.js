'use strict';

// « Demander à CLAIRE » : la réponse s'écrit peu à peu (étude 22/10, client/101-assistant-revelation.js) — la part pure.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

test('la révélation montre le début du texte, nœud après nœud, et tout à la fin', () => {
  const app = chargerApplication();
  const textes = ['Bonjour ', 'Julie', ', voici'];
  assert.equal(app.textesRevelesAssistant(textes, 0).join('|'), '||');
  assert.equal(app.textesRevelesAssistant(textes, 3).join('|'), 'Bon||');
  assert.equal(app.textesRevelesAssistant(textes, 10).join('|'), 'Bonjour |Ju|');
  assert.equal(app.textesRevelesAssistant(textes, 999).join('|'), 'Bonjour |Julie|, voici');
});

test('la révélation dure 3 s au plus quelle que soit la longueur, 4 caractères par image au moins', () => {
  const app = chargerApplication();
  assert.equal(app.pasRevelationAssistant(50), 4);
  assert.equal(app.pasRevelationAssistant(100), 4);
  assert.ok(app.pasRevelationAssistant(5000) * 100 >= 5000);
});

test('resteReflexionAssistantMs : 2 s au moins, jamais négatif', () => {
  const { resteReflexionAssistantMs } = chargerApplication();
  assert.equal(resteReflexionAssistantMs(1000, 1000), 2000);
  assert.equal(resteReflexionAssistantMs(1000, 2500), 500);
  assert.equal(resteReflexionAssistantMs(1000, 5000), 0);
});

test('debutsBlocsRevelationAssistant : un bloc commence à son premier nœud texte', () => {
  const { debutsBlocsRevelationAssistant } = chargerApplication();
  assert.equal(JSON.stringify(debutsBlocsRevelationAssistant([0, 5, 12], [[0], [1, 2], []])), '[0,5,0]');
});

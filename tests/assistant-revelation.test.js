'use strict';

// « Demander à CLAIRE » : une réponse apparaît d'un bloc, en fondu (étude 26/10, client/101-assistant-revelation.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

test('une réponse posée est « en apparition » le temps du fondu seulement, une autre réponse la remplace', () => {
  const app = chargerApplication();
  const a = { role: 'claire', html: '<p>Un</p>' }; const b = { role: 'claire', html: '<p>Deux</p>' };
  assert.equal(app.messageEnApparitionAssistant(a), false);
  app.lancerRevelationAssistant(a);
  assert.equal(app.messageEnApparitionAssistant(a), true);
  app.lancerRevelationAssistant(b);
  assert.equal(app.messageEnApparitionAssistant(a), false, 'la précédente ne joue plus');
  assert.equal(app.messageEnApparitionAssistant(b), true);
  app.arreterRevelationAssistant();
  assert.equal(app.messageEnApparitionAssistant(b), false);
  assert.equal(app.messageEnApparitionAssistant(null), false);
});

test('réponse sans IA : 2 s de réflexion au moins, jamais d’attente en plus quand la réponse a déjà mis 2 s', () => {
  const app = chargerApplication();
  assert.equal(app.resteReflexionAssistantMs(1000, 1100), 1900);
  assert.equal(app.resteReflexionAssistantMs(1000, 3000), 0);
  assert.equal(app.resteReflexionAssistantMs(1000, 9000), 0);
  assert.equal(app.resteReflexionAssistantMs(5000, 4000), 2000, 'horloge qui recule : l’attente reste bornée à 2 s');
  assert.equal(app.LATENCE_MINI_REPONSE_ASSISTANT_MS, 2000);
});

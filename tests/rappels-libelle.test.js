'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

// « dû » ne prend son circonflexe qu'au masculin singulier : au pluriel c'est « dus ». C'est une
// phrase que l'étude lit à chaque consultation de l'écran Réglages, elle est donc verrouillée ici.
test('libelleRappelsTour accorde le pluriel, dont « dus » sans circonflexe', () => {
  assert.strictEqual(app.libelleRappelsTour(1, 1), '1 rappel envoyé sur 1 dû');
  assert.strictEqual(app.libelleRappelsTour(1, 2), '1 rappel envoyé sur 2 dus');
  assert.strictEqual(app.libelleRappelsTour(3, 3), '3 rappels envoyés sur 3 dus');
});

test('libelleRappelsTour tient un tour vide et des valeurs exotiques', () => {
  assert.strictEqual(app.libelleRappelsTour(0, 0), '0 rappel envoyé sur 0 dû');
  assert.strictEqual(app.libelleRappelsTour(undefined, null), '0 rappel envoyé sur 0 dû');
  assert.strictEqual(app.libelleRappelsTour(-4, 2.7), '0 rappel envoyé sur 2 dus');
});

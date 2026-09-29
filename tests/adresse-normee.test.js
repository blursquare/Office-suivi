'use strict';
// Forme des adresses demandée par l'étude le 29/09 : « SAINT AIGNAN (41110), 2 rue des Cours de
// Meusnes ». Adresses inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('normaliserAdresse : commune en capitales, code postal entre parenthèses, puis la voie', () => {
  const app = chargerApplication();
  const attendu = 'SAINT AIGNAN (41110), 2 rue des Cours de Meusnes';
  assert.equal(app.normaliserAdresse('2 rue des Cours de Meusnes 41110 Saint-Aignan'), attendu);
  assert.equal(app.normaliserAdresse('2 rue des Cours de Meusnes, 41110 SAINT-AIGNAN'), attendu);
  assert.equal(app.normaliserAdresse('41110 Saint-Aignan, 2 rue des Cours de Meusnes'), attendu);
  assert.equal(app.normaliserAdresse(attendu), attendu); // idempotente
  assert.equal(app.normaliserAdresse('2 rue des Lilas\n41000 Blois'), 'BLOIS (41000), 2 rue des Lilas');
  assert.equal(app.normaliserAdresse('Rue du 8 Mai 1945 41200 Romorantin-Lanthenay'), 'ROMORANTIN LANTHENAY (41200), Rue du 8 Mai 1945');
  // Sans code postal : inchangée.
  assert.equal(app.normaliserAdresse('Lieudit La Borde'), 'Lieudit La Borde');
  assert.equal(app.normaliserAdresse(''), '');
});

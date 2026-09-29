'use strict';
// Forme des adresses demandée par l'étude le 29/09 : « SAINT-AIGNAN (41110), 2 rue des Cours de
// Meusnes » (un exemple de format, pas une adresse particulière) — tirets et CEDEX conservés ; le
// destinataire d'un courrier garde la présentation postale. Adresses inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('normaliserAdresse : commune en capitales, code postal entre parenthèses, puis la voie', () => {
  const app = chargerApplication();
  const attendu = 'SAINT-AIGNAN (41110), 2 rue des Cours de Meusnes';
  assert.equal(app.normaliserAdresse('2 rue des Cours de Meusnes 41110 Saint-Aignan'), attendu);
  assert.equal(app.normaliserAdresse('2 rue des Cours de Meusnes, 41110 SAINT-AIGNAN'), attendu);
  assert.equal(app.normaliserAdresse('41110 Saint-Aignan, 2 rue des Cours de Meusnes'), attendu);
  assert.equal(app.normaliserAdresse(attendu), attendu); // idempotente
  assert.equal(app.normaliserAdresse('2 rue des Lilas\n41000 Blois'), 'BLOIS (41000), 2 rue des Lilas');
  assert.equal(app.normaliserAdresse('Rue du 8 Mai 1945 41200 Romorantin-Lanthenay'), 'ROMORANTIN-LANTHENAY (41200), Rue du 8 Mai 1945');
  assert.equal(app.normaliserAdresse('12 avenue de Tours 37000 Tours'), 'TOURS (37000), 12 avenue de Tours');
  // Sans code postal : inchangée.
  assert.equal(app.normaliserAdresse('Lieudit La Borde'), 'Lieudit La Borde');
  assert.equal(app.normaliserAdresse(''), '');
});

test('normaliserAdresse : la mention CEDEX reste avec la commune', () => {
  const app = chargerApplication();
  assert.equal(app.normaliserAdresse('3 place de la Mairie 41018 Blois Cedex'), 'BLOIS CEDEX (41018), 3 place de la Mairie');
  assert.equal(app.normaliserAdresse('BP 40 41018 Blois Cedex 2'), 'BLOIS CEDEX 2 (41018), BP 40');
  assert.equal(app.normaliserAdresse('41018 Blois Cedex, 3 place de la Mairie'), 'BLOIS CEDEX (41018), 3 place de la Mairie');
  assert.equal(app.normaliserAdresse('BLOIS CEDEX 2 (41018), BP 40'), 'BLOIS CEDEX 2 (41018), BP 40');
});

test('adressePostaleCourrier : la voie puis « CP COMMUNE » en dernière ligne', () => {
  const app = chargerApplication();
  const joindre = (t) => app.adressePostaleCourrier(t).join(' | ');
  assert.equal(joindre('2 rue des Cours de Meusnes\n41110 Saint-Aignan'), '2 rue des Cours de Meusnes | 41110 SAINT-AIGNAN');
  assert.equal(joindre('2 rue des Cours de Meusnes 41110 Saint-Aignan'), '2 rue des Cours de Meusnes | 41110 SAINT-AIGNAN');
  assert.equal(joindre('SAINT-AIGNAN (41110), 2 rue des Cours de Meusnes'), '2 rue des Cours de Meusnes | 41110 SAINT-AIGNAN');
  assert.equal(joindre('Résidence Les Tilleuls, bât. B\n4 allée des Pins\n41018 Blois cedex'), 'Résidence Les Tilleuls, bât. B | 4 allée des Pins | 41018 BLOIS CEDEX');
  assert.equal(joindre(''), '');
});

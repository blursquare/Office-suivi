const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

test('accentValide retient les six thèmes et retombe sur le bordeaux sinon', () => {
  const app = chargerApplication();
  assert.strictEqual(app.ACCENTS_DISPONIBLES.join(','), 'bordeaux,bleu,vert,prune,orange,noir');
  for (const a of ['bleu', 'vert', 'prune', 'orange', 'noir', 'bordeaux']) assert.strictEqual(app.accentValide(a), a);
  for (const a of [null, undefined, '', 'rouge', 'BLEU']) assert.strictEqual(app.accentValide(a), 'bordeaux');
});

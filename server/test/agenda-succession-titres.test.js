const test = require('node:test');
const assert = require('node:assert/strict');
const { extraireReferenceSuccession } = require('../src/agendaOffice');

test('référence d\'un rendez-vous de succession sans le mot SUCC (21/10)', () => {
  assert.equal(extraireReferenceSuccession('NOTO Marie DUPONT'), 'Marie DUPONT');
  assert.equal(extraireReferenceSuccession('NOTORITE Marie DUPONT'), 'Marie DUPONT');
  assert.equal(extraireReferenceSuccession('NOTORIETE - Marie DUPONT'), 'Marie DUPONT');
  assert.equal(extraireReferenceSuccession('INVENTAIRE + NOTO Marie DUPONT'), 'Marie DUPONT');
  assert.equal(extraireReferenceSuccession('INVENTAIRE et NOTORIETE Marie DUPONT'), 'Marie DUPONT');
  assert.equal(extraireReferenceSuccession('INVENTAIRE et NOTO Marie DUPONT'), 'Marie DUPONT');
  assert.equal(extraireReferenceSuccession('SUCCESSION Marie DUPONT'), 'Marie DUPONT');
  assert.equal(extraireReferenceSuccession('VTE - DUPONT / MARTIN'), '');
  assert.equal(extraireReferenceSuccession('Notoire Dupont'), '');
});

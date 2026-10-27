'use strict';
// L'en-tête de la question à l'agent : l'heure à Paris (étude 26/10) et la page d'Authentic où l'on est (nature et onglet, jamais un intitulé).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { enteteContexte } = require('../src/assistantAgent');

test('l’en-tête donne l’heure de Paris et le moment de la journée', () => {
  const t = enteteContexte({ aujourdhui: '2026-10-27', maintenant: '2026-10-27T12:30:00+01:00', prenom: 'Julie' });
  assert.match(t, /Il est 12 h 30 à Paris \(mardi, pause de midi\)/);
  assert.match(t, /C’est la pause de midi : reste discrète/);
  const nuit = enteteContexte({ aujourdhui: '2026-10-27', maintenant: '2026-10-27T21:00:00+01:00' });
  assert.match(nuit, /soir\)\. L’étude est fermée/);
  const we = enteteContexte({ aujourdhui: '2026-10-31', maintenant: '2026-10-31T10:00:00+01:00' });
  assert.match(we, /week-end\)\. L’étude est fermée/);
});

test('l’en-tête dit sur quelle page d’Authentic la personne se trouve', () => {
  const t = enteteContexte({ aujourdhui: '2026-10-27', maintenant: '2026-10-27T10:00:00+01:00', prenom: 'Julie', authentic: { nature: 'la page du dossier', onglet: 'Rédaction', dossierLibelle: '[NOM1]' } });
  assert.match(t, /Julie est dans Authentic \(Fichorga\) sur la page du dossier \(onglet « Rédaction »\) du dossier \[NOM1\]/);
  assert.doesNotMatch(enteteContexte({ aujourdhui: '2026-10-27', maintenant: '2026-10-27T10:00:00+01:00' }), /Authentic/);
});

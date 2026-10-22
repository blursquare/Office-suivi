'use strict';

// Réponse du FCDDV du commun (étude 22/10, client/102-fcddv-commun.js) : rapprochement par le nom du défunt.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const f = (nom, modifie) => ({ chemin: 'Interrogation/' + nom, nom, modifie: modifie || '2026-10-01T10:00:00Z' });

test('FCDDV du commun : nom de famille ET prénom dans le nom du fichier, le plus récent si plusieurs', () => {
  const app = chargerApplication();
  const fichiers = [f('FCDDV DURAND Marie.pdf'), f('FCDDV DURAND Paul.pdf'), f('Réponse DURAND Marie 2.pdf', '2026-10-20T10:00:00Z'), f('FCDDV MARTIN Léa.pdf')];
  const r = app.fichierFcddvCommunDuDefunt(fichiers, { nom: 'DURAND', prenoms: 'Marie Claire' });
  assert.equal(r.fichier.nom, 'Réponse DURAND Marie 2.pdf');
  assert.equal(r.plusieurs, 2);
  assert.equal(app.fichierFcddvCommunDuDefunt(fichiers, { nom: 'DURAND', prenoms: 'Jeanne' }), null, 'jamais le FCDDV d’un homonyme');
  assert.equal(app.fichierFcddvCommunDuDefunt(fichiers, { nom: 'LEROY', prenoms: 'Marie' }), null);
  assert.equal(app.fichierFcddvCommunDuDefunt(fichiers, { nom: '', prenoms: 'Marie' }), null);
});

test('FCDDV du commun : les accents, la casse et les noms composés ne gênent pas', () => {
  const app = chargerApplication();
  const r = app.fichierFcddvCommunDuDefunt([f('fcddv de la Fontaine Léa.pdf')], { nom: 'DE LA FONTAINE', prenoms: 'Léa' });
  assert.ok(r);
  assert.equal(app.fichierFcddvCommunDuDefunt([f('fcddv FONTAINE Léa.pdf')], { nom: 'DE LA FONTAINE', prenoms: 'Léa' }), null, 'tous les mots du nom');
});

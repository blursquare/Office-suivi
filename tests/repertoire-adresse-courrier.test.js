'use strict';

// Répertoire : adresse copiée pour l'en-tête d'un courrier (étude 12/10) — noms et adresses INVENTÉS.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('office : « Maître Prénom NOM », voie, « CP VILLE » en capitales ; au nom du notaire choisi', () => {
  const o = { id: 'o1', office: 'Office Exemple', notaires: ['Jeanne LE PRIEUR', 'Paul Martin'], adresse: '12 rue des Lilas', codePostal: '45160', ville: 'Saint-Hilaire-Saint-Mesmin' };
  assert.equal(app.adresseCourrierOffice(o, 0).join('\n'), 'Maître Jeanne LE PRIEUR\n12 rue des Lilas\n45160 SAINT-HILAIRE-SAINT-MESMIN');
  assert.equal(app.adresseCourrierOffice(o, 1)[0], 'Maître Paul MARTIN');
  // Sans notaire nommé : le nom de l'office.
  assert.equal(app.adresseCourrierOffice({ office: 'SCP Exemple', adresse: '1 place du Marché', codePostal: '41000', ville: 'Blois' }).join('\n'), 'SCP Exemple\n1 place du Marché\n41000 BLOIS');
  assert.equal(app.nomCourrierNotaire('Me Jeanne LE PRIEUR'), 'Maître Jeanne LE PRIEUR');
  assert.ok(!app.aAdresseCourrierOffice({ office: 'Sans adresse' }));
});

test('organisme : nom, service, puis chaque partie de l’adresse sur sa ligne', () => {
  assert.equal(app.adresseCourrierContact({ organisme: 'Banque Exemple', service: 'Service successions', adresse: '5 avenue du Port, CS 10000, 37000 TOURS CEDEX' }).join('\n'),
    'Banque Exemple\nService successions\n5 avenue du Port, CS 10000\n37000 TOURS CEDEX');
  assert.equal(app.adresseCourrierContact({ organisme: 'Caisse Exemple', adresse: 'BP 12, 41000 BLOIS CEDEX' }).join('\n'), 'Caisse Exemple\nBP 12\n41000 BLOIS CEDEX');
});

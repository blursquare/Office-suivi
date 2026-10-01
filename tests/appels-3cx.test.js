'use strict';

// Appels reçus par 3CX (client) : adresse à coller dans 3CX, dossier ouvert à la sonnerie.
// Noms et numéros inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

test('adresse 3CX : variables de 3CX intactes, poste en prénom sans accent', () => {
  assert.equal(app.clePosteAppels('Jérémy SAUJOT'), 'jeremy');
  assert.equal(app.clePosteAppels('Bastien ANGLUMENT'), 'bastien');
  assert.equal(app.adresseIntegration3cx('http://192.168.60.10:3000/', 'Julie VASSELIN'),
    'http://192.168.60.10:3000/appel?numero=%CallerNumber%&nom=%CallerDisplayName%&poste=julie');
  assert.equal(app.adresseEssai3cx('http://192.168.60.10:3000', 'Jérémy SAUJOT'),
    'http://192.168.60.10:3000/appel?numero=0600000000&nom=Essai%20CLAIRE&poste=jeremy');
});

test('dossierAOuvrirPourAppel : un seul dossier en cours dont l’appelant est partie, sinon rien', () => {
  const liste = [{ id: 'a', nom: 'X' }, { id: 'b', nom: 'Y', archive: true }, { id: 'c', nom: 'Z' }];
  const un = { dossiers: [{ id: 'a', partie: 'acquereur' }, { id: 'b', partie: 'acquereur' }] };
  assert.equal(app.dossierAOuvrirPourAppel(un, liste).id, 'a');
  assert.equal(app.dossierAOuvrirPourAppel({ dossiers: [{ id: 'a', partie: 'vendeur' }, { id: 'c', partie: 'acquereur' }] }, liste), null);
  assert.equal(app.dossierAOuvrirPourAppel({ dossiers: [{ id: 'a', partie: 'confrere' }] }, liste), null);
  assert.equal(app.dossierAOuvrirPourAppel({ dossiers: [{ id: 'inconnu', partie: 'vendeur' }] }, liste), null);
  assert.equal(app.dossiersDeLAppel(un, liste).map(y => y.partie).join(','), 'Acquéreur,Acquéreur');
});

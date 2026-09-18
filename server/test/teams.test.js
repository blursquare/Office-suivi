'use strict';

// Client d'envoi vers Power Automate (voir src/teams.js) : un simple POST JSON
// {destinataire, message} vers l'URL du flux — tout le routage vers la bonne personne est fait
// PAR LE FLUX (voir server/README.md). Testé contre un faux serveur HTTP local, jamais un vrai
// flux Power Automate.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { envoyerMessageTeams } = require('../src/teams');

function demarrerFauxWebhook(statut, corpsAttendu) {
  return new Promise((resolve) => {
    const requetes = [];
    const serveur = http.createServer((req, res) => {
      let corps = '';
      req.on('data', (c) => { corps += c; });
      req.on('end', () => {
        requetes.push({ headers: req.headers, corps: JSON.parse(corps || '{}') });
        res.statusCode = statut || 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(corpsAttendu ? JSON.stringify(corpsAttendu) : '{}');
      });
    });
    serveur.listen(0, () => resolve({ serveur, requetes, url: `http://127.0.0.1:${serveur.address().port}/flux` }));
  });
}

let serveursOuverts = [];
after(() => { serveursOuverts.forEach((s) => s.close()); });

test('sans URL de webhook : erreur explicite, aucune requête réseau', async () => {
  const resultat = await envoyerMessageTeams('', 'bastien@etude.fr', 'Test');
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /Réglages/);
});

test('sans adresse destinataire : erreur explicite', async () => {
  const resultat = await envoyerMessageTeams('https://exemple.test/flux', '', 'Test');
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /collaborateur/);
});

test('envoi réussi : POST JSON {destinataire, message} vers l\'URL du webhook', async () => {
  const faux = await demarrerFauxWebhook(200);
  serveursOuverts.push(faux.serveur);
  const resultat = await envoyerMessageTeams(faux.url, 'bastien@etude.fr', 'Rappel de test');
  assert.equal(resultat.ok, true);
  assert.equal(faux.requetes.length, 1);
  assert.equal(faux.requetes[0].headers['content-type'], 'application/json');
  assert.deepEqual(faux.requetes[0].corps, { destinataire: 'bastien@etude.fr', message: 'Rappel de test' });
});

test('le flux répond une erreur HTTP : ok=false avec le statut dans le message', async () => {
  const faux = await demarrerFauxWebhook(500);
  serveursOuverts.push(faux.serveur);
  const resultat = await envoyerMessageTeams(faux.url, 'bastien@etude.fr', 'Test');
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /500/);
});

test('URL injoignable : ok=false, ne lève jamais d\'exception', async () => {
  const resultat = await envoyerMessageTeams('http://127.0.0.1:1/injoignable', 'bastien@etude.fr', 'Test');
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /Impossible de joindre/);
});

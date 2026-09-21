'use strict';

// Client d'envoi vers Power Automate (voir src/envoiEmail.js) : un simple POST JSON
// {destinataire, sujet, message} vers l'URL du flux — tout l'envoi de l'email est fait PAR LE FLUX
// (voir server/README.md). Testé contre un faux serveur HTTP local, jamais un vrai flux Power
// Automate.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { envoyerEmail } = require('../src/envoiEmail');

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

test('sans URL de flux : erreur explicite, aucune requête réseau', async () => {
  const resultat = await envoyerEmail('', 'bastien@etude.fr', 'Objet', 'Test');
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /Réglages/);
});

test('sans adresse destinataire : erreur explicite', async () => {
  const resultat = await envoyerEmail('https://exemple.test/flux', '', 'Objet', 'Test');
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /collaborateur/);
});

test('envoi réussi : POST JSON {destinataire, sujet, message} vers l\'URL du flux', async () => {
  const faux = await demarrerFauxWebhook(200);
  serveursOuverts.push(faux.serveur);
  const resultat = await envoyerEmail(faux.url, 'bastien@etude.fr', 'CLAIRE — Objet de test', 'Rappel de test');
  assert.equal(resultat.ok, true);
  assert.equal(faux.requetes.length, 1);
  assert.equal(faux.requetes[0].headers['content-type'], 'application/json');
  assert.deepEqual(faux.requetes[0].corps, {
    destinataire: 'bastien@etude.fr',
    sujet: 'CLAIRE — Objet de test',
    message: 'Rappel de test'
  });
});

// Le flux Power Automate attend trois propriétés déclarées dans son schéma JSON : `sujet` doit
// toujours être présent dans le corps, même vide, plutôt qu'absent — sans quoi l'action "Envoyer
// un e-mail (V2)" reçoit un Objet null et l'exécution du flux échoue côté Power Automate.
test('sujet omis : la propriété est quand même envoyée, en chaîne vide', async () => {
  const faux = await demarrerFauxWebhook(200);
  serveursOuverts.push(faux.serveur);
  await envoyerEmail(faux.url, 'bastien@etude.fr', undefined, 'Corps');
  assert.equal(faux.requetes[0].corps.sujet, '');
});

test('le flux répond une erreur HTTP : ok=false avec le statut dans le message', async () => {
  const faux = await demarrerFauxWebhook(500);
  serveursOuverts.push(faux.serveur);
  const resultat = await envoyerEmail(faux.url, 'bastien@etude.fr', 'Objet', 'Test');
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /500/);
});

test('URL injoignable : ok=false, ne lève jamais d\'exception', async () => {
  const resultat = await envoyerEmail('http://127.0.0.1:1/injoignable', 'bastien@etude.fr', 'Objet', 'Test');
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /Impossible de joindre/);
});

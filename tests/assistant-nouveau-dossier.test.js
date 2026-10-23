// « Demander à CLAIRE » prépare un nouveau dossier de vente depuis un compromis joint (24/10) : sans PDF joint ou sans formulaire préparé,
// rien n'est lu ni créé.
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app.js');

test('un document inconnu ou qui n’est pas un PDF joint est refusé, sans rien ouvrir', async () => {
  const app = chargerApplication();
  const r = await app.nouveauDossierDepuisCompromisAgent({ mode: 'preparer', document_id: 'pj9', responsable: '' });
  assert.match(r.erreur, /PDF joint au message/);
});

test('créer sans formulaire préparé : erreur claire, aucune carte d’autorisation', async () => {
  const app = chargerApplication();
  const r = await app.nouveauDossierDepuisCompromisAgent({ mode: 'creer', document_id: '', responsable: '' });
  assert.match(r.erreur, /prépare-le d’abord/);
});

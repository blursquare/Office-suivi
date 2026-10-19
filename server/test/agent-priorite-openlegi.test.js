'use strict';

// « Demander à CLAIRE » : OpenLegi (Légifrance, BOFiP) avant la recherche web (étude 19/10 : « openlegi est à utiliser en priorité
// avant la recherche web »). La recherche web n'est donnée à Claude qu'après un appel à Légifrance ou au BOFiP, quand ils sont branchés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rechercheWebPourTour, requeteAgent } = require('../src/assistantAgent');

const DOMAINES = ['legifrance.gouv.fr', 'bofip.impots.gouv.fr'];
const BOFIP = { name: 'bofip__rechercher_doctrine', description: 'x', input_schema: { type: 'object', properties: {} } };
const RNE = { name: 'rne__rne_search_companies', description: 'x', input_schema: { type: 'object', properties: {} } };

test('sans Légifrance ni BOFiP branchés, la recherche web est donnée tout de suite', () => {
  assert.equal(rechercheWebPourTour({ rechercheWeb: DOMAINES, outilsExternes: [], messages: [] }).length, 2);
  assert.equal(rechercheWebPourTour({ rechercheWeb: DOMAINES, outilsExternes: [RNE], messages: [] }).length, 2);
  assert.equal(rechercheWebPourTour({ rechercheWeb: [], outilsExternes: [BOFIP], messages: [] }).length, 0);
});

test('BOFiP branché : pas de recherche web avant un appel à OpenLegi, puis elle reste donnée', () => {
  const conv = { rechercheWeb: DOMAINES, outilsExternes: [BOFIP], messages: [{ role: 'user', content: 'Plus-value d’une résidence secondaire ?' }] };
  assert.equal(rechercheWebPourTour(conv).length, 0);
  assert.equal(requeteAgent('claude-opus-5-5', conv.messages, { outilsExternes: conv.outilsExternes, rechercheWeb: rechercheWebPourTour(conv) }).tools.some((t) => t.name === 'web_search'), false);
  conv.messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'bofip__rechercher_doctrine', input: { q: 'plus-value' } }] });
  assert.equal(rechercheWebPourTour(conv).length, 2);
  // Un autre outil (RNE, fiche) ne suffit pas.
  const autre = { rechercheWeb: DOMAINES, outilsExternes: [BOFIP, RNE], messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'rne__rne_search_companies', input: {} }] }] };
  assert.equal(rechercheWebPourTour(autre).length, 0);
  // Déjà utilisée dans la conversation : gardée (l'historique la contient).
  const deja = { rechercheWeb: DOMAINES, outilsExternes: [BOFIP], messages: [{ role: 'assistant', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }] }] };
  assert.equal(rechercheWebPourTour(deja).length, 2);
});

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

test('requête refusée au premier tour avec le BOFiP : OpenLegi retiré, la recherche web donnée au second essai et pas mise en cause', async () => {
  const { tourAgent, viderConversationsAgent } = require('../src/assistantAgent');
  viderConversationsAgent();
  const requetes = [];
  const reponses = [Object.assign(new Error('schéma refusé'), { status: 400 }),
    { content: [{ type: 'text', text: 'Réponse.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }];
  const client = { beta: { messages: { create: async (req) => { requetes.push(JSON.parse(JSON.stringify(req))); const r = reponses.shift(); if (r instanceof Error) throw r; return r; } } } };
  const notes = [];
  const parametresRepo = { lireJsonBrut: (c, d) => d, ecrireJsonBrut: (c, v) => { notes.push(c); return v; } };
  const r = await tourAgent({ texte: 'Quel abattement sur une plus-value ?', dossiers: [], contexte: {} },
    { cle: 'k', client, outilsExternes: [BOFIP], rechercheWeb: DOMAINES, parametresRepo });
  assert.equal(r.erreur, undefined);
  assert.equal(requetes.length, 2);
  assert.equal(requetes[0].tools.some((t) => t.name === 'web_search'), false);
  assert.equal(requetes[0].tools.some((t) => t.name === 'bofip__rechercher_doctrine'), true);
  assert.equal(requetes[1].tools.some((t) => t.name === 'bofip__rechercher_doctrine'), false);
  assert.equal(requetes[1].tools.some((t) => t.name === 'web_search'), true);
});

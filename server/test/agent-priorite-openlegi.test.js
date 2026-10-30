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

test('BOFiP branché : la recherche web est donnée dès le premier tour (étude 26/10) ; la priorité à OpenLegi reste une consigne du prompt', () => {
  const conv = { rechercheWeb: DOMAINES, outilsExternes: [BOFIP], messages: [{ role: 'user', content: 'Adresse de la mairie ?' }] };
  assert.equal(rechercheWebPourTour(conv).length, 2);
  const req = requeteAgent('claude-opus-5-5', conv.messages, { outilsExternes: conv.outilsExternes, rechercheWeb: rechercheWebPourTour(conv) });
  assert.equal(req.tools.some((t) => t.name === 'web_search'), true);
  assert.match(JSON.stringify(req.system), /pour une question de DROIT[^"]*APRÈS Légifrance et le BOFiP/);
  assert.match(JSON.stringify(req.system), /annuaire du service public/);
  // Conversation passée en clair ou anonymisation coupée : jamais.
  assert.equal(rechercheWebPourTour({ ...conv, aEteEnClair: true }).length, 0);
  assert.equal(rechercheWebPourTour({ ...conv, anonymiser: false }).length, 0);
});

test('un site ajouté dans les Réglages pendant une conversation est pris au message suivant', async () => {
  const { tourAgent, viderConversationsAgent } = require('../src/assistantAgent');
  viderConversationsAgent();
  const requetes = [];
  const client = { beta: { messages: { create: async (req) => { requetes.push(JSON.parse(JSON.stringify(req))); return { content: [{ type: 'text', text: 'Réponse.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }; } } } };
  const parametresRepo = { lireJsonBrut: (c, d) => d, ecrireJsonBrut: (c, v) => v };
  const r1 = await tourAgent({ texte: 'Bonjour', dossiers: [], contexte: {} }, { cle: 'k', client, rechercheWeb: ['legifrance.gouv.fr'], parametresRepo });
  await tourAgent({ conversation: r1.conversation, texte: 'Mairie de Chaumont ?', dossiers: [], contexte: {} }, { cle: 'k', client, rechercheWeb: ['legifrance.gouv.fr', 'lannuaire.service-public.gouv.fr'], parametresRepo });
  const web = (req) => (req.tools.find((t) => t.name === 'web_search') || {}).allowed_domains || [];
  assert.deepEqual(web(requetes[0]), ['legifrance.gouv.fr']);
  assert.deepEqual(web(requetes[1]), ['legifrance.gouv.fr', 'lannuaire.service-public.gouv.fr']);
});

test('requête refusée au premier tour avec le BOFiP : OpenLegi retiré d’abord, la recherche web gardée et pas mise en cause', async () => {
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
  assert.equal(requetes[0].tools.some((t) => t.name === 'web_search'), true);
  assert.equal(requetes[0].tools.some((t) => t.name === 'bofip__rechercher_doctrine'), true);
  assert.equal(requetes[1].tools.some((t) => t.name === 'bofip__rechercher_doctrine'), false);
  assert.equal(requetes[1].tools.some((t) => t.name === 'web_search'), true);
});

test('web refusé, OpenLegi innocent : OpenLegi rendu et jamais suspendu ; le web n’est plus redonné dans la conversation', async () => {
  const { tourAgent, viderConversationsAgent } = require('../src/assistantAgent');
  viderConversationsAgent();
  const requetes = [];
  // L'API refuse toute requête qui porte la recherche web.
  const client = { beta: { messages: { create: async (req) => {
    requetes.push(JSON.parse(JSON.stringify(req)));
    if (req.tools.some((t) => t.name === 'web_search')) throw Object.assign(new Error('web refusé'), { status: 400 });
    return { content: [{ type: 'text', text: 'Réponse.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };
  } } } };
  let suspendu = 0;
  const parametresRepo = { lireJsonBrut: (c, d) => d, ecrireJsonBrut: (c, v) => v };
  const o = { cle: 'k', client, outilsExternes: [BOFIP], rechercheWeb: DOMAINES, parametresRepo, surRefusOutilsExternes: () => { suspendu++; } };
  const r1 = await tourAgent({ texte: 'Mairie de Chaumont ?', dossiers: [], contexte: {} }, o);
  assert.equal(r1.erreur, undefined);
  assert.equal(suspendu, 0, 'OpenLegi n’est pas mis en cause');
  const derniere = requetes[requetes.length - 1];
  assert.equal(derniere.tools.some((t) => t.name === 'bofip__rechercher_doctrine'), true);
  assert.equal(derniere.tools.some((t) => t.name === 'web_search'), false);
  const avant = requetes.length;
  await tourAgent({ conversation: r1.conversation, texte: 'Et son email ?', dossiers: [], contexte: {} }, o);
  assert.equal(requetes.length, avant + 1, 'un seul essai au message suivant : le web n’est pas redonné');
});

test('réflexion liée à une autre conversation (400) : un nouvel essai sans les blocs de réflexion, la question n’est pas perdue', async () => {
  const { tourAgent, viderConversationsAgent, sansBlocsReflexion } = require('../src/assistantAgent');
  viderConversationsAgent();
  const h = [{ role: 'user', content: 'Q' }, { role: 'assistant', content: [{ type: 'thinking', thinking: 'x', signature: 's' }, { type: 'redacted_thinking', data: 'd' }] }, { role: 'assistant', content: [{ type: 'thinking', thinking: 'y', signature: 's' }, { type: 'text', text: 'R' }] }];
  const propre = sansBlocsReflexion(h);
  assert.deepEqual(propre[1].content, [{ type: 'text', text: '…' }]);
  assert.deepEqual(propre[2].content, [{ type: 'text', text: 'R' }]);
  assert.equal(h[1].content.length, 2, 'l’original n’est pas modifié');
  const requetes = [];
  let n = 0;
  const client = { beta: { messages: { create: async (req) => {
    requetes.push(JSON.parse(JSON.stringify(req)));
    n++;
    if (n === 2) { const e = new Error('messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation.'); e.status = 400; throw e; }
    return { content: [{ type: 'thinking', thinking: 'ok', signature: 'sig' }, { type: 'text', text: 'Réponse.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };
  } } } };
  const parametresRepo = { lireJsonBrut: (c, d) => d, ecrireJsonBrut: (c, v) => v };
  const r1 = await tourAgent({ texte: 'Bonjour', dossiers: [], contexte: {} }, { cle: 'k', client, parametresRepo });
  const r2 = await tourAgent({ conversation: r1.conversation, texte: 'Et ensuite ?', dossiers: [], contexte: {} }, { cle: 'k', client, parametresRepo });
  assert.equal(n, 3, 'une requête, le refus, puis le nouvel essai');
  assert.match(JSON.stringify(requetes[1].messages), /thinking/);
  assert.doesNotMatch(JSON.stringify(requetes[2].messages), /"type":"thinking"/);
  assert.match(String(r2.texte || r2.reponse || JSON.stringify(r2)), /Réponse\./);
});

test('un autre refus 400 n’est pas rejoué sans réflexion', async () => {
  const { tourAgent, viderConversationsAgent } = require('../src/assistantAgent');
  viderConversationsAgent();
  let n = 0;
  const client = { beta: { messages: { create: async () => { n++; const e = new Error('invalid_request_error: max_tokens too large'); e.status = 400; throw e; } } } };
  const parametresRepo = { lireJsonBrut: (c, d) => d, ecrireJsonBrut: (c, v) => v };
  await tourAgent({ texte: 'Bonjour', dossiers: [], contexte: {} }, { cle: 'k', client, parametresRepo }).catch(() => {});
  assert.ok(n <= 2, 'pas de boucle');
});

'use strict';

// « Demander à CLAIRE » en agent (étude 11/10 : « aussi intelligent que toi » ; dossiers masqués). Faux client Anthropic : rien
// de nominatif (nom, prénom, adresse, email, téléphone, référence) ne part chez Claude ; les appels d'outils et la réponse
// reviennent codes rétablis ; la boucle s'arrête ; l'historique ne fait que s'allonger.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { tourAgent, requeteAgent, masquerValeur, masquerValeurLegere, nettoyerReponseAgent, coutAgentUsd, entreeOutilPourPoste, viderConversationsAgent, OUTILS_AGENT, MAX_TOURS_OUTILS } = require('../src/assistantAgent');
const { motsSensiblesDossiers } = require('../src/assistantMistral');

const D = [{ id: 'd1', nom: 'FOURNIER / GAUTHIER', parties: [{ nom: 'FOURNIER', prenom: 'Paul' }, { nom: 'GAUTHIER', prenom: 'Léa' }],
  autres: ['BLOIS (41000), 2 rue des Tanneurs', 'Agence Dubreuil Immobilier'], reference: 'A 2026 00247', contacts: ['paul.fournier@exemple.fr', '06 12 34 56 78'] }];
const SECRETS = /FOURNIER|Fournier|GAUTHIER|Gauthier|Paul|Léa|Tanneurs|Dubreuil|paul\.fournier|06 12 34 56 78|00247/;

/** Faux client : rend les réponses prévues dans l'ordre et garde chaque requête. */
function fauxClient(reponses) {
  const requetes = [];
  return { requetes, beta: { messages: { create: async (req) => {
    requetes.push(JSON.parse(JSON.stringify(req)));
    const r = reponses.shift();
    if (r instanceof Error) throw r;
    return r;
  } } } };
}
const outil = (id, name, input) => ({ type: 'tool_use', id, name, input });
const texte = (t) => ({ type: 'text', text: t });
const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 };

beforeEach(() => viderConversationsAgent());

test('une question qui lit un dossier : rien de nominatif ne part, la réponse revient avec les noms', async () => {
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [{ type: 'thinking', thinking: '', signature: 'sig' }, outil('t1', 'chercher_dossiers', { texte: '[NOM1]', inclure_archives: false })] },
    { stop_reason: 'tool_use', usage, content: [outil('t2', 'lire_dossier', { dossier_id: 'd1' })] },
    { stop_reason: 'end_turn', usage, content: [texte('Le dossier **[NOM1] / [NOM2]** attend l’offre de prêt de [NOM3] ; écrivez à [EMAIL1]. Code inventé : [NOM99].')] }
  ]);
  const o = { cle: 'k', client, modele: 'claude-opus-5-5' };
  let r = await tourAgent({ texte: 'Où en est le dossier Fournier ?', dossiers: D, contexte: { aujourdhui: '2026-10-11', prenom: 'Bastien' } }, o);
  assert.equal(r.appels.length, 1);
  assert.equal(r.appels[0].nom, 'chercher_dossiers');
  assert.equal(r.appels[0].entree.texte, 'Fournier', 'le code est rétabli pour le poste');
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { dossiers: [{ id: 'd1', libelle: 'VTE - FOURNIER / GAUTHIER', statut: 'Attente de pièces' }] } }] }, o);
  assert.equal(r.appels[0].nom, 'lire_dossier');
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't2', contenu: { id: 'd1', parties: [{ prenom: 'Paul', nom: 'FOURNIER' }], coordonnees: { email_vendeur: 'paul.fournier@exemple.fr', telephone_vendeur: '06 12 34 56 78' }, bien: { adresse: 'BLOIS (41000), 2 rue des Tanneurs', prix: 245000 }, agence: 'Agence Dubreuil Immobilier', authentic: { reference: 'A 2026 00247' }, pieces_attendues: ['Offre de prêt', 'ERP (état des risques)'] } }] }, o);
  assert.match(r.reponse, /FOURNIER \/ GAUTHIER/i);
  assert.match(r.reponse, /paul\.fournier@exemple\.fr/);
  assert.doesNotMatch(r.reponse, /\[NOM99\]/, 'un code inventé est effacé');
  // Tout ce qui est parti chez Claude, requête par requête.
  for (const req of client.requetes) {
    const envoye = JSON.stringify(req.messages);
    assert.doesNotMatch(envoye, SECRETS, 'aucune donnée nominative dans : ' + envoye.slice(0, 400));
  }
  const dernier = JSON.stringify(client.requetes[2].messages);
  assert.match(dernier, /245000/, 'les montants partent tels quels (choix de l’étude)');
  assert.match(dernier, /Offre de prêt/);
  assert.match(dernier, /ERP/, 'un sigle du métier n’est pas masqué');
  assert.match(dernier, /id\\":\\"d1/, 'les identifiants restent lisibles');
  // L'historique ne fait que s'allonger : la réflexion du premier tour est renvoyée telle quelle.
  assert.equal(client.requetes[1].messages[1].content[0].type, 'thinking');
  assert.equal(client.requetes[1].messages[1].content[0].signature, 'sig');
  assert.equal(client.requetes[2].messages.length, 5);
  assert.ok(r.coutUsd > 0);
});

test('la requête : Opus 5.5 par défaut, effort moyen, système et historique en cache, secours d’Anthropic, outils stricts', () => {
  const req = requeteAgent('claude-opus-5-5', [{ role: 'user', content: 'x' }]);
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.output_config.effort, 'medium');
  assert.equal(req.thinking, undefined, 'réflexion adaptative par défaut, jamais désactivée');
  assert.equal(req.system[0].cache_control.type, 'ephemeral');
  assert.equal(req.cache_control.type, 'ephemeral');
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01', 'compact-2026-01-12'], 'Opus 5.5 : résumé automatique des longues conversations');
  assert.deepEqual(req.context_management, { edits: [{ type: 'compact_20260112' }] });
  assert.equal(requeteAgent('claude-sonnet-5-5', []).context_management, undefined);
  assert.equal(requeteAgent('claude-opus-5-5', [], { effort: 'high' }).output_config.effort, 'high');
  assert.equal(requeteAgent('claude-opus-5-5', [], { effort: 'max!' }).output_config.effort, 'medium');
  assert.ok(OUTILS_AGENT.every((t) => t.input_schema.additionalProperties === false))
  assert.ok(OUTILS_AGENT.filter((t) => t.strict === true).length === 18, 'les outils stricts restent peu nombreux (limite de l’API)');
  // 22/10 : « The compiled grammar is too large » — la grammaire de tous les schémas stricts réunis a une limite ; on reste bien en dessous.
  const tailleStricts = OUTILS_AGENT.filter((t) => t.strict === true).reduce((n, t) => n + JSON.stringify(t.input_schema).length, 0);
  assert.ok(tailleStricts < 7000, 'schémas stricts trop gros : ' + tailleStricts);
  assert.ok(OUTILS_AGENT.find((t) => t.name === 'faire_geste').strict === false && OUTILS_AGENT.find((t) => t.name === 'action_dossier').strict === false);
  const haiku = requeteAgent('claude-haiku-5-5', []);
  assert.equal(haiku.fallbacks, undefined);
  assert.equal(requeteAgent('inconnu', []).max_tokens, 32000);
  assert.deepEqual(requeteAgent('claude-opus-5-5', [], { conclure: true }).tool_choice, { type: 'none' });
});

test('au-delà de MAX_TOURS_OUTILS tours d’outils, l’IA doit conclure', async () => {
  const reponses = [];
  for (let i = 0; i <= MAX_TOURS_OUTILS; i++) reponses.push({ stop_reason: 'tool_use', usage, content: [outil('t' + i, 'taches_du_jour', {})] });
  reponses.push({ stop_reason: 'end_turn', usage, content: [texte('Voilà.')] });
  const client = fauxClient(reponses);
  const o = { cle: 'k', client };
  let r = await tourAgent({ texte: 'Analyse tout', dossiers: D, contexte: {} }, o);
  let n = 0;
  while (r.appels && n < MAX_TOURS_OUTILS + 5) { r = await tourAgent({ conversation: r.conversation, resultats: r.appels.map((a) => ({ id: a.id, contenu: {} })) }, o); n += 1; }
  const avecNone = client.requetes.filter((q) => q.tool_choice && q.tool_choice.type === 'none');
  assert.ok(avecNone.length >= 1, 'une requête finale sans outil');
  assert.equal(r.reponse, 'Voilà.');
});

test('erreurs : clé refusée → message sans contenu et conversation oubliée ; conversation inconnue sans question → expirée', async () => {
  const err = Object.assign(new Error('Unauthorized FOURNIER'), { status: 401 });
  const client = fauxClient([err]);
  const r = await tourAgent({ texte: 'Bonjour', dossiers: D }, { cle: 'k', client });
  assert.equal(r.erreur, 'clé Claude refusée');
  assert.doesNotMatch(JSON.stringify(r), /FOURNIER/);
  const r2 = await tourAgent({ conversation: 'nimporte', resultats: [] }, { cle: 'k', client: fauxClient([]) });
  assert.equal(r2.expiree, true);
});

test('une nouvelle question pendant que des outils sont attendus : les résultats manquants sont dits, l’historique reste valide', async () => {
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('a1', 'taches_du_jour', {})] },
    { stop_reason: 'end_turn', usage, content: [texte('Ok.')] }
  ]);
  const o = { cle: 'k', client };
  const r = await tourAgent({ texte: 'Mes tâches', dossiers: D }, o);
  await tourAgent({ conversation: r.conversation, texte: 'Autre chose', dossiers: D }, o);
  const msgs = client.requetes[1].messages;
  assert.equal(msgs[2].content[0].type, 'tool_result');
  assert.equal(msgs[2].content[0].is_error, true);
  assert.equal(msgs[3].role, 'user');
});

test('faire_geste : paramètres contrôlés comme ceux de l’IA (valeurs hors liste écartées, collaborateur nommé en entier)', () => {
  const e = entreeOutilPourPoste('faire_geste', { geste: 'responsable', dossier_id: 'd1', parametres: { collaborateur: 'Julie', date: 'demain', heure: '25h', modele: 'nimporte', montant: -3 } });
  assert.equal(e.parametres.collaborateur, 'Julie VASSELIN');
  assert.equal(e.parametres.date, '');
  assert.equal(e.parametres.heure, '');
  assert.equal(e.parametres.modele, '');
  assert.equal(e.parametres.montant, null);
  assert.equal(entreeOutilPourPoste('faire_geste', { geste: 'supprimer_tout', parametres: {} }).geste, '');
});

test('masquerValeur, nettoyerReponseAgent, coût', () => {
  const table = new Map();
  const m = masquerValeur({ id: 'FOURNIER-1', libelle: 'VTE - FOURNIER', liste: ['Léa GAUTHIER'], prix: 1000 }, motsSensiblesDossiers(D), table);
  assert.equal(m.id, 'FOURNIER-1');
  assert.doesNotMatch(JSON.stringify({ ...m, id: '' }), SECRETS);
  assert.equal(m.prix, 1000);
  assert.match(nettoyerReponseAgent(m.libelle, table), /FOURNIER/);
  assert.ok(Math.abs(coutAgentUsd({ input_tokens: 1e6, output_tokens: 0 }, 'claude-opus-5-5') - 4) < 1e-9);
  assert.ok(Math.abs(coutAgentUsd({ cache_read_input_tokens: 1e6 }, 'claude-opus-5-5') - 0.2) < 1e-9, 'lecture du cache d’Opus 5.5 : 0,20 $ le million');
});

test('route /assistant/agent : sans clé Claude → repli ; avec clé → appels puis réponse', async () => {
  const os = require('node:os');
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('x1', 'taches_du_jour', {})] },
    { stop_reason: 'end_turn', usage, content: [texte('Vous avez **2** tâches, [NOM1].')] }
  ]);
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, authActive: false }, assistant: { clientAgent: client } });
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  const avant = process.env.ANTHROPIC_API_KEY;
  try {
    const base = `http://127.0.0.1:${serveur.address().port}`;
    const post = async (corps) => (await fetch(`${base}/api/assistant/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) })).json();
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal((await post({ texte: 'Mes tâches' })).repli, true);
    process.env.ANTHROPIC_API_KEY = 'cle-test';
    const dispo = await (await fetch(`${base}/api/assistant/disponibilite`)).json();
    assert.equal(dispo.agent, true);
    assert.equal(dispo.modele, 'claude-opus-5-5');
    const r1 = await post({ texte: 'Mes tâches, Fournier', dossiers: D, contexte: { aujourdhui: '2026-10-11' } });
    assert.equal(r1.appels[0].nom, 'taches_du_jour');
    const r2 = await post({ conversation: r1.conversation, resultats: [{ id: 'x1', contenu: { taches: [] } }] });
    assert.equal(r2.reponse, 'Vous avez **2** tâches, Fournier.');
    assert.doesNotMatch(JSON.stringify(client.requetes), /Fournier/);
  } finally {
    if (avant === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = avant;
    serveur.close();
  }
});

// ---- Mistral (étude 11/10 : « idem pour Mistral ») ----

function fauxMistral(reponses) {
  const corps = [];
  const fetchMistral = async (url, o) => {
    corps.push({ url, ...JSON.parse(o.body) });
    const r = reponses.shift();
    if (r instanceof Error) throw r;
    if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}) };
    return { ok: true, json: async () => r };
  };
  return { corps, fetchMistral };
}
const choixMistral = (message, fin) => ({ usage: { prompt_tokens: 3000, completion_tokens: 300 }, choices: [{ message, finish_reason: fin }] });

test('Mistral : mêmes outils en fonctions, prompt système en tête, rien de nominatif, appels parallèles, réponse rétablie', async () => {
  const { corps, fetchMistral } = fauxMistral([
    choixMistral({ role: 'assistant', content: '', tool_calls: [
      { id: 'abc123def', type: 'function', function: { name: 'chercher_dossiers', arguments: JSON.stringify({ texte: '[NOM1]', inclure_archives: false }) } },
      { id: 'xyz987uvw', type: 'function', function: { name: 'taches_du_jour', arguments: '{}' } }
    ] }, 'tool_calls'),
    choixMistral({ role: 'assistant', content: 'Le dossier **[NOM1]** attend l’offre de prêt.' }, 'stop')
  ]);
  const o = { cle: 'k', fournisseur: 'mistral', fetchMistral };
  let r = await tourAgent({ texte: 'Où en est Fournier ?', dossiers: D, contexte: { aujourdhui: '2026-10-11', prenom: 'Julie' } }, o);
  assert.equal(r.appels.length, 2);
  assert.equal(r.appels[0].entree.texte, 'Fournier');
  r = await tourAgent({ conversation: r.conversation, resultats: [
    { id: 'abc123def', contenu: { dossiers: [{ id: 'd1', libelle: 'VTE - FOURNIER / GAUTHIER', adresse: 'BLOIS (41000), 2 rue des Tanneurs' }] } },
    { id: 'xyz987uvw', contenu: { taches: [{ tache: 'Relancer Paul FOURNIER', email: 'paul.fournier@exemple.fr' }] } }
  ] }, o);
  assert.match(r.reponse, /Fournier/);
  assert.equal(corps[0].url, 'https://api.eu.mistral.ai/v1/chat/completions', 'région UE par défaut');
  assert.equal(corps[0].model, 'mistral-large-latest', 'Large par défaut');
  assert.equal(corps[0].messages[0].role, 'system');
  assert.equal(corps[0].tools[0].type, 'function');
  assert.equal(corps[0].tool_choice, 'auto');
  const outilGeste = corps[0].tools.find((t) => t.function.name === 'faire_geste').function.parameters;
  assert.equal(outilGeste.properties.parametres.properties.montant.type, 'number', 'pas de type multiple chez Mistral');
  assert.ok(corps[0].tools.every((t) => t.strict === undefined));
  const second = corps[1].messages;
  assert.equal(second[2].tool_calls.length, 2, 'les appels sont renvoyés tels quels');
  assert.deepEqual(second.slice(3).map((m) => [m.role, m.tool_call_id, m.name]), [['tool', 'abc123def', 'chercher_dossiers'], ['tool', 'xyz987uvw', 'taches_du_jour']]);
  for (const c of corps) assert.doesNotMatch(JSON.stringify(c.messages.slice(1)), SECRETS);
});

test('Mistral : erreurs dites sans contenu, conversation oubliée ; arguments illisibles signalés', async () => {
  const { fetchMistral } = fauxMistral([429]);
  const r = await tourAgent({ texte: 'Bonjour', dossiers: D }, { cle: 'k', fournisseur: 'mistral', fetchMistral });
  assert.equal(r.erreur, 'limite de débit Mistral atteinte');
  const f2 = fauxMistral([choixMistral({ role: 'assistant', content: '', tool_calls: [{ id: 'a1', type: 'function', function: { name: 'lire_dossier', arguments: '{pas du json' } }] }, 'tool_calls')]);
  const r2 = await tourAgent({ texte: 'Lis', dossiers: D }, { cle: 'k', fournisseur: 'mistral', fetchMistral: f2.fetchMistral });
  assert.equal(r2.appels[0].entree._illisible, true);
});

test('route /assistant/agent : Mistral choisi avec sa clé → agent Mistral', async () => {
  const os = require('node:os');
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const { corps, fetchMistral } = fauxMistral([choixMistral({ role: 'assistant', content: 'Bonjour Julie.' }, 'stop')]);
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, authActive: false }, assistant: { fetchMistral } });
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  const avant = { a: process.env.ANTHROPIC_API_KEY, m: process.env.MISTRAL_API_KEY };
  try {
    const base = `http://127.0.0.1:${serveur.address().port}`;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.MISTRAL_API_KEY = 'cle-mistral';
    await fetch(`${base}/api/assistant/reglages`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ moteur: 'mistral', modeleAgentMistral: 'mistral-medium-latest' }) });
    const dispo = await (await fetch(`${base}/api/assistant/disponibilite`)).json();
    assert.equal(dispo.agent, true);
    assert.equal(dispo.modele, 'mistral-medium-latest');
    const r = await (await fetch(`${base}/api/assistant/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texte: 'Bonjour', contexte: { prenom: 'Julie' } }) })).json();
    assert.equal(r.reponse, 'Bonjour Julie.');
    assert.equal(corps[0].model, 'mistral-medium-latest');
  } finally {
    if (avant.a === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = avant.a;
    if (avant.m === undefined) delete process.env.MISTRAL_API_KEY; else process.env.MISTRAL_API_KEY = avant.m;
    serveur.close();
  }
});

test('relecture 0.213.0 : les noms hors fiches ne sortent pas (tiers, prénoms, lieux-dits, tirets, deux lettres, téléphones, IBAN)', () => {
  const { masquer } = require('../src/assistantMistral');
  const fiches = [{ nom: 'DUPONT / MARTIN', parties: [{ nom: 'DUPONT', prenom: 'Paul' }, { nom: 'MARTIN', prenom: 'Léa' }, { nom: 'LY', prenom: 'Anh' }], autres: ['VINEUIL (41350), 4 rue des Lilas'] }];
  const S = motsSensiblesDossiers(fiches);
  const cas = {
    'attestation du syndic Foncia, Madame veuve Gauthier née Colin, entreprise Bâtiments Rousseau': /Foncia|Gauthier|Colin|Rousseau/,
    'email reçu de Jean-Michel Dubois (avant : Paul Dupond)': /Jean|Michel|Dubois|Dupond|Paul/,
    'lieu-dit Les Grandes Ouches': /Grandes|Ouches/,
    'Dupont-Martin et attestation-notaire-dupont.pdf': /Dupont|Martin|dupont/,
    'LÉ Anh et Ly': /Anh|Ly\b/,
    'rappelle-moi d’appeler Karim vendredi': /Karim/,
    'VTE - Durand/Petit': /Durand|Petit/,
    '06/12/34/56/78, +33 (0)6 12 34 56 78, 0033 6 12 34 56 78': /\d{2}[ /]\d{2}/,
    'A2026-00247 et FR76 3000 6000 0112 3456 7890 143': /00247|3456/
  };
  for (const [texte, interdit] of Object.entries(cas)) assert.doesNotMatch(masquer(texte, S, new Map()), interdit, texte);
  // Les mots du métier restent lisibles.
  for (const t of ['Attente de pièces', 'Offre de prêt', 'ERP (état des risques et pollution)', 'Ouvre l’Agenda et le Suivi', 'Renonciation au droit de préemption', 'Fait par CLAIRE'])
    assert.equal(masquer(t, S, new Map()), t);
});

test('relecture 0.213.0 : un tour d’outils ne compte pas comme une demande ; une conversation oubliée repart avec « repris »', async () => {
  const lus = {};
  const repo = { lireJsonBrut: (k, d) => lus[k] || d, ecrireJsonBrut: (k, v) => { lus[k] = v; } };
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('u1', 'taches_du_jour', {})] },
    { stop_reason: 'end_turn', usage, content: [texte('Fini.')] },
    { stop_reason: 'end_turn', usage, content: [texte('Re.')] }
  ]);
  const o = { cle: 'k', client, parametresRepo: repo };
  const r = await tourAgent({ texte: 'Mes tâches', dossiers: D }, o);
  await tourAgent({ conversation: r.conversation, resultats: [{ id: 'u1', contenu: {} }] }, o);
  assert.equal(lus['assistant-ia-usage-claude'].demandes, 1);
  const r3 = await tourAgent({ conversation: 'perdue', texte: 'Bonjour', dossiers: D }, o);
  assert.equal(r3.repris, true);
});

test('seconde relecture : tête de phrase, téléphones étrangers, IBAN, mots de CLAIRE et collaborateurs, changement de fournisseur', async () => {
  const { masquer } = require('../src/assistantMistral');
  const S = motsSensiblesDossiers([{ nom: 'MARTIN / LEROY', parties: [{ nom: 'MARTIN', prenom: 'Paul' }, { nom: 'LEROY' }], autres: ['BLOIS (41000), 12 bis rue du Moulin'] }]);
  for (const [texte, interdit] of Object.entries({
    'Gauthier s’engage à fournir l’attestation du syndic avant la signature': /Gauthier/,
    'Engagement : Gauthier fournira le certificat': /Gauthier/,
    '(Gauthier) et « Colin »': /Gauthier|Colin/,
    '• Gauthier fournira les diagnostics': /Gauthier/,
    'Le dossier Dupont est en retard. Dupont doit signer.': /Dupont/,
    '+41 79 123 45 67 et +32 470 12 34 56 et +44 7700 900123': /\d{3}/,
    'fr76 3000 6000 0112 3456 7890 189 et SIRET 123 456 789 00012': /3456|789/
  })) assert.doesNotMatch(masquer(texte, S, new Map()), interdit, texte);
  for (const t of ['Attribue le dossier à Julie', 'Ouvre l’outil Quotités', 'Lance le Prorata', 'Quels sont mes Rappels ?', 'section AB 123',
    'Le vendeur s’engage à remettre le titre de propriété avant la vente.', 'Explique-moi la différence entre une promesse et un compromis'])
    assert.equal(masquer(t, S, new Map()), t, t);
  assert.equal(masquer('Monsieur et Madame Gauthier', S, new Map()), 'Monsieur et Madame [NOM1]');
  // Les champs d'identité d'un résultat d'outil sont masqués en entier, quel que soit leur format.
  const m = masquerValeur({ coordonnees: { telephone_vendeur: '0612 345 678', email_acquereur: 'x@y.fr' }, nom: 'de La Tour', agence: 'Immo du Centre' }, S, new Map());
  assert.equal(JSON.stringify(m), '{"coordonnees":{"telephone_vendeur":"[TEL1]","email_acquereur":"[EMAIL1]"},"nom":"[NOM1]","agence":"[NOM2]"}');
  // Mémoire, rubrique « Règles et décisions de l'étude » (16/10) : le titre de section d'un extrait est masqué comme le reste.
  const mem = JSON.stringify(masquerValeur({ passages: [{ rubrique: 'Règles et décisions de l’étude', section: '05/10/2026 — Dossier DURAND, Monsieur Paul Martin', extrait: 'Échéance de l’appel de fonds.' }] }, S, new Map()));
  assert.doesNotMatch(mem, /DURAND|Paul|Martin/);
  // Changement de fournisseur : la conversation repart de zéro, la clé ne part jamais chez l'autre.
  const client = fauxClient([{ stop_reason: 'end_turn', usage, content: [texte('Claude.')] }]);
  const r1 = await tourAgent({ texte: 'Bonjour', dossiers: D }, { cle: 'cle-claude', client });
  const { corps, fetchMistral } = fauxMistral([choixMistral({ role: 'assistant', content: 'Mistral.' }, 'stop')]);
  const r2 = await tourAgent({ conversation: r1.conversation, texte: 'Et maintenant ?', dossiers: D }, { cle: 'cle-mistral', fournisseur: 'mistral', fetchMistral });
  assert.equal(r2.reponse, 'Mistral.');
  assert.equal(r2.repris, true);
  assert.equal(corps[0].messages.length, 2, 'historique neuf : système + question');
});

test('documents_recents (étude 12/10) : rien de nominatif ne part, les document_id restent lisibles, ouvrir_documents les reçoit tels quels', async () => {
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'documents_recents', { dossier_id: 'd1' })] },
    { stop_reason: 'tool_use', usage, content: [outil('t2', 'ouvrir_documents', { documents: ['doc2', 'doc3'] })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voici le dernier scan.')] }
  ]);
  const o = { cle: 'k', client, modele: 'claude-opus-5-5' };
  let r = await tourAgent({ texte: 'Les derniers documents de Fournier', dossiers: D, contexte: { aujourdhui: '2026-10-12' } }, o);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: {
    pieces_recues: [{ document_id: 'doc1', document: 'Pièce d’identité Paul FOURNIER', recu_le: '2026-10-11T08:00:00Z', dossier_id: 'd1', dossier: 'VTE - FOURNIER / GAUTHIER', ouvrable: true }],
    scans_a_ranger: [{ document_id: 'doc2', document: 'État daté', recu_le: '2026-10-12T07:31:00Z', dossier_id: 'd1', dossier: 'VTE - FOURNIER / GAUTHIER', ouvrable: true }],
    scans_ranges: [{ document_id: 'doc3', document: 'Titre de propriété', rubrique: 'Vendeur', ouvrable: true }],
    fichiers_recents_du_dossier_nas: [{ document_id: 'doc4', document: 'Document non reconnu', sous_dossier: 'Courriers Dubreuil', ouvrable: true }]
  } }] }, o);
  assert.equal(r.appels[0].nom, 'ouvrir_documents');
  assert.deepEqual(r.appels[0].entree.documents, ['doc2', 'doc3']);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, 'aucune donnée nominative dans : ' + envoye.slice(0, 600));
  assert.match(envoye, /document_id\\":\\"doc2/, 'les identifiants de document restent lisibles');
  assert.match(envoye, /État daté/);
  assert.match(envoye, /Document non reconnu/);
  assert.ok(OUTILS_AGENT.some((t) => t.name === 'documents_recents') && OUTILS_AGENT.some((t) => t.name === 'ouvrir_documents'));
});

test('documents du dossier (étude 13/10) : le texte d’un PDF lu part masqué, tiers compris ; le rendu revient avec les vrais noms', async () => {
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'documents_du_dossier', { dossier_id: 'd1' })] },
    { stop_reason: 'tool_use', usage, content: [outil('t2', 'lire_document', { document_id: 'doc1', page_debut: 1, page_fin: 0 })] },
    { stop_reason: 'tool_use', usage, content: [outil('t3', 'rediger_document', { dossier_id: 'd1', forme: 'document', titre: 'Synthèse du compromis [NOM1]', contenu: '# Parties\n- Vendeur : [NOM2] [NOM1]\n| Condition | Date |\n|---|---|\n| Prêt | 20/11/2026 |' })] },
    { stop_reason: 'end_turn', usage, content: [texte('La synthèse est prête.')] }
  ]);
  const o = { cle: 'k', client, modele: 'claude-opus-5-5' };
  let r = await tourAgent({ texte: 'Fais une synthèse du compromis Fournier', dossiers: D, contexte: { aujourdhui: '2026-10-13' } }, o);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { nombre: 1, documents: [{ document_id: 'doc1', document: 'Compromis de vente', sous_dossier: 'racine', modifie_le: '2026-09-02' }] } }] }, o);
  assert.equal(r.appels[0].nom, 'lire_document');
  const page = 'COMPROMIS DE VENTE\nMonsieur Paul FOURNIER, né à Blois, demeurant 2 rue des Tanneurs 41000 BLOIS\nVend à Madame Léa GAUTHIER,\n'
    + 'en présence de Monsieur Gérard LEMAIRE, géomètre-expert à Vineuil, joignable au 02 54 12 34 56 ou g.lemaire@cabinet-exemple.fr,\n'
    + 'la parcelle cadastrée section DZ n° 187 au lieu-dit « Les Grouets », moyennant le prix de 245 000 euros.\n'
    + 'Condition suspensive d’obtention d’un prêt de 180 000 euros au plus tard le 20 novembre 2026.';
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't2', contenu: { pages_total: 12, pages_lues: '1-1', pages: [{ page: 1, texte: page }] } }] }, o);
  const envoye = JSON.stringify(client.requetes[2].messages);
  assert.doesNotMatch(envoye, SECRETS, 'aucune donnée des fiches : ' + envoye.slice(-900));
  assert.doesNotMatch(envoye, /LEMAIRE|Gérard|g\.lemaire|02 54 12 34 56|Grouets/, 'un tiers du document ne part pas : ' + envoye.slice(-900));
  // Le masquage d'un DOCUMENT garde l'acte lisible (étude 20/10) : titres, parcelle, mots du métier, communes hors fiches.
  assert.match(envoye, /COMPROMIS DE VENTE/);
  assert.match(envoye, /section DZ n° 187/);
  assert.match(envoye, /géomètre-expert à Vineuil/);
  assert.match(envoye, /245 000 euros/, 'les montants partent tels quels');
  assert.match(envoye, /20 novembre 2026/, 'les dates partent telles quelles');
  assert.match(envoye, /Condition suspensive/);
  // Le rendu : codes rétablis pour le poste, qui fabrique le Word avec les vrais noms.
  assert.equal(r.appels[0].nom, 'rediger_document');
  assert.match(r.appels[0].entree.contenu, /FOURNIER|Fournier/);
  assert.doesNotMatch(r.appels[0].entree.contenu + r.appels[0].entree.titre, /\[NOM\d+\]/);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't3', contenu: { fait: true } }] }, o);
  assert.equal(r.reponse, 'La synthèse est prête.');
  ['documents_du_dossier', 'lire_document', 'rediger_document'].forEach((n) => assert.ok(OUTILS_AGENT.some((t) => t.name === n), n));
});

test('relecture 13/10 : la lecture de documents est plafonnée par conversation ; un code inventé ne finit pas dans le Word', async () => {
  const reponses = [];
  for (let i = 0; i < 6; i++) reponses.push({ stop_reason: 'tool_use', usage, content: [outil('l' + i, 'lire_document', { document_id: 'doc1', page_debut: 1 + 30 * i, page_fin: 0 })] });
  reponses.push({ stop_reason: 'end_turn', usage, content: [texte('Fini.')] });
  const client = fauxClient(reponses);
  // Sonnet : sans résumé automatique, la limite de 300 000 caractères s'applique.
  const o = { cle: 'k', client, modele: 'claude-sonnet-5-5' };
  let r = await tourAgent({ texte: 'Lis tout le compromis', dossiers: D, contexte: {} }, o);
  const page = 'Clause '.repeat(12000);
  while (r.appels) r = await tourAgent({ conversation: r.conversation, resultats: r.appels.map((a) => ({ id: a.id, contenu: { pages: [{ page: 1, texte: page }] } })) }, o);
  const dernier = JSON.stringify(client.requetes[client.requetes.length - 1].messages);
  assert.match(dernier, /Limite de lecture de cette conversation atteinte/);
  assert.ok(dernier.length < 440000, 'l’historique reste borné : ' + dernier.length);
  const e = entreeOutilPourPoste('rediger_document', { dossier_id: '', forme: 'courrier', titre: 'Lettre', contenu: 'Monsieur [NOM9],' });
  assert.equal(e.contenu, 'Monsieur [à compléter],');
});

test('outil_claire (13/10) : rien de nominatif ne part — répertoire, valeurs de l’acte, urbanisme', async () => {
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'outil_claire', { outil: 'repertoire', mode: 'lire', dossier_id: '', texte: 'géomètre' })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const o = { cle: 'k', client };
  let r = await tourAgent({ texte: 'Le géomètre de Vineuil', dossiers: D, contexte: {} }, o);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: {
    resultats: [{ sorte: 'contact', organisme: 'Cabinet lucie bernard géomètre', personnes: ['lucie bernard'], telephones: ['02 54 11 22 33'], emails: ['l.bernard@cabinet-exemple.fr'], adresse: '3 rue des grouets vineuil' },
      { sorte: 'notaire', office: 'Office notarial dubreuil', notaires: ['marc dubreuil'], telephone: '02 54 99 88 77', email: 'office@dubreuil-exemple.fr' }],
    champs_de_l_acte: [{ champ: 'Banque du prêt', nom: 'crédit agricole val de loire' }, { champ: 'Prix en chiffres', valeur: '245 000,00 EUR' }]
  } }] }, o);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, /lucie|bernard|grouets|02 54 11 22 33|02 54 99 88 77|dubreuil|marc|crédit agricole/i, 'aucun nom : ' + envoye.slice(-700));
  assert.match(envoye, /245 000,00 EUR/, 'les montants partent');
  assert.equal(r.reponse, 'Voilà.');
});

test('consulter_site (14/10) : plan de situation du cadastre seulement (Géofoncier retiré par l’étude)', () => {
  const o = OUTILS_AGENT.find((t) => t.name === 'consulter_site');
  assert.ok(o, 'outil consulter_site proposé');
  assert.deepEqual(o.input_schema.properties.site.enum, ['cadastre']);
  assert.doesNotMatch(JSON.stringify(o), /geofoncier/i);
});

test('faire_geste : options de rendez-vous et email libre gardent créneaux, destinataire, objet, corps', () => {
  const e = entreeOutilPourPoste('faire_geste', { geste: 'options_rendez_vous', dossier_id: 'd1', parametres: {
    creneaux: [{ date: '2026-11-03', heure: '10:00' }, { date: 'x', heure: '10:00' }], destinataire: 'a@b.fr', objet: 'Test', corps: 'Bonjour [NOM3]' } });
  assert.equal(e.geste, 'options_rendez_vous');
  assert.deepEqual(e.parametres.creneaux, [{ date: '2026-11-03', heure: '10:00' }]);
  assert.equal(e.parametres.destinataire, 'a@b.fr');
  assert.equal(e.parametres.corps, 'Bonjour [à compléter]');
});

test('18/10 : conversation reprise avec les échanges gardés par le poste, masqués ; plan de travail parmi les outils', async () => {
  const { resumeHistoriqueReprise } = require('../src/assistantAgent');
  const client = fauxClient([{ stop_reason: 'end_turn', usage, content: [texte('Oui.')] }]);
  await tourAgent({ conversation: 'oubliee-par-le-serveur', texte: 'Et la suite ?', dossiers: D, contexte: {}, historique: [{ role: 'moi', texte: 'Où en est Fournier ?' }, { role: 'claire', texte: 'Le dossier FOURNIER attend l’offre.' }] }, { cle: 'k', client });
  const envoye = JSON.stringify(client.requetes[0].messages);
  assert.match(envoye, /Suite d'une conversation reprise/);
  assert.doesNotMatch(envoye, SECRETS);
  assert.equal(resumeHistoriqueReprise([], new Set(), new Map()), '');
  assert.ok(OUTILS_AGENT.some((t) => t.name === 'plan_de_travail'));
});

test('relecture 0.282.0 : pas de « reprise » sur une première question ; changement de modèle sans casser une boucle d’outils', async () => {
  const client = fauxClient([{ stop_reason: 'end_turn', usage, content: [texte('Oui.')] }]);
  await tourAgent({ texte: 'Où en est Fournier ?', dossiers: D, contexte: {}, historique: [{ role: 'moi', texte: 'Où en est Fournier ?' }] }, { cle: 'k', client });
  assert.doesNotMatch(JSON.stringify(client.requetes[0].messages), /conversation reprise/);
  const c2 = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('x1', 'taches_du_jour', {})] },
    { stop_reason: 'end_turn', usage, content: [texte('Fini.')] }
  ]);
  const r1 = await tourAgent({ texte: 'Mes tâches', contexte: {} }, { cle: 'k', client: c2, modele: 'claude-sonnet-5-5' });
  const r2 = await tourAgent({ conversation: r1.conversation, resultats: [{ id: 'x1', contenu: { taches: [] } }] }, { cle: 'k', client: c2, modele: 'claude-opus-5-5' });
  assert.equal(r2.reponse, 'Fini.', 'la boucle continue sur le modèle de la conversation');
});

test('controles_relecture (18/10) : rien de nominatif ne part des constats, passages, grille et consignes ; lecture comptée', async () => {
  assert.ok(OUTILS_AGENT.find((t) => t.name === 'controles_relecture'), 'outil proposé');
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'controles_relecture', { document_id: 'doc1', mode: 'compromis', dossier_id: 'd1', document_reference: '', type_bien: '' })] },
    { stop_reason: 'end_turn', usage, content: [texte('Synthèse.')] }
  ]);
  const o = { cle: 'k', client };
  let r = await tourAgent({ texte: 'Relis le compromis', dossiers: D, contexte: {} }, o);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: {
    mode: 'avant-contrat', type_bien: 'maison', pages_total: 24, resume_claire: 'Vente FOURNIER / GAUTHIER, 2 points',
    constats_claire: [{ gravite: 'CRITIQUE', categorie: 'FINANCEMENT', titre: 'Condition suspensive de prêt sans date', detail: 'Monsieur Xavier Moreau-Lantier, acquéreur', passage: 'Paul FOURNIER, demeurant 2 rue des Tanneurs à BLOIS', page: 4 }],
    grille_de_l_etude: [{ id: 'pret', section: 'Financement', point: 'Condition suspensive de prêt', quand: 'Toujours', consigne: 'Vérifier le montant' }],
    consignes_de_l_etude: ['Ne signale pas comme un problème « Agence Dubreuil Immobilier » : déjà vu']
  } }] }, o);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, 'aucun nom de la fiche : ' + envoye.slice(-600));
  assert.doesNotMatch(envoye, /Xavier|Moreau/, 'nom après une civilité masqué');
  assert.match(envoye, /Condition suspensive de prêt sans date/);
  assert.equal(r.reponse, 'Synthèse.');
});

// ---- Étude 20/10 : acte déposé = texte intégral joint ; anonymisation en option ----

const ACTE = [
  { id: 'pj1', pagesTotal: 2, pages: [
    { page: 1, texte: 'PROMESSE DE VENTE\nEntre Monsieur Paul FOURNIER, demeurant à BLOIS (41000), 2 rue des Tanneurs, joignable au 06 12 34 56 78, et Madame Léa GAUTHIER.' },
    { page: 2, texte: 'Le prix est de 245 000 euros. Condition suspensive d’obtention d’un prêt de 180 000 euros.' }
  ] }
];

test('acte déposé : le texte intégral est joint à la question, page par page, MASQUÉ ; rien de nominatif ne part', async () => {
  const client = fauxClient([{ stop_reason: 'end_turn', usage, content: [texte('## Synthèse\n\nPromesse entre [NOM1] et [NOM2] [pj1 p. 2].')] }]);
  const r = await tourAgent({ texte: 'Analyse cet acte.', documents: ACTE, dossiers: D, contexte: { aujourdhui: '2026-10-20', prenom: 'Bastien' } }, { cle: 'k', client, modele: 'claude-opus-5-5' });
  const envoye = JSON.stringify(client.requetes[0].messages);
  assert.doesNotMatch(envoye, SECRETS);
  const contenu = client.requetes[0].messages[0].content;
  assert.match(contenu, /Texte intégral des pièces jointes/);
  assert.match(contenu, /\[pj1 p\. 1\]/);
  assert.match(contenu, /\[pj1 p\. 2\]/);
  assert.match(contenu, /245 000|245000|\[MONTANT/);
  assert.match(r.reponse, /## Synthèse/);
  assert.match(r.reponse, /FOURNIER|Fournier/);
});

test('anonymisation désactivée : la phrase, l’acte et les résultats d’outils arrivent en clair, l’IA en est prévenue, pas de recherche web', async () => {
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'lire_dossier', { dossier_id: 'd1' })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voici l’analyse pour Paul FOURNIER.')] }
  ]);
  const o = { cle: 'k', client, modele: 'claude-opus-5-5', rechercheWeb: ['legifrance.gouv.fr'] };
  let r = await tourAgent({ texte: 'Analyse l’acte de Paul Fournier.', documents: ACTE, anonymiser: false, dossiers: D, contexte: { aujourdhui: '2026-10-20', prenom: 'Bastien' } }, o);
  const q = client.requetes[0];
  const contenu = q.messages[0].content;
  assert.match(contenu, /Paul Fournier/);
  assert.match(contenu, /Paul FOURNIER/);
  assert.match(contenu, /06 12 34 56 78/);
  assert.match(contenu, /Anonymisation DÉSACTIVÉE/);
  assert.ok(!(q.tools || []).some((t) => t.name === 'web_search'), 'pas de recherche web sans anonymisation');
  r = await tourAgent({ conversation: r.conversation, anonymiser: false, resultats: [{ id: 't1', contenu: { id: 'd1', parties: [{ prenom: 'Paul', nom: 'FOURNIER' }] } }] }, o);
  assert.match(JSON.stringify(client.requetes[1].messages), /FOURNIER/);
  assert.match(r.reponse, /Paul FOURNIER/);
});

test('anonymisation désactivée : une recherche Légifrance ou BOFiP ne porte jamais un mot des fiches', async () => {
  const client = fauxClient([{ stop_reason: 'tool_use', usage, content: [outil('t1', 'legifrance__rechercher', { requete: 'prêt de Paul Fournier article 1583 BLOIS Tanneurs' })] }]);
  const r = await tourAgent({ texte: 'Cherche le texte.', anonymiser: false, dossiers: D, contexte: { aujourdhui: '2026-10-20' } },
    { cle: 'k', client, modele: 'claude-opus-5-5', outilsExternes: [{ name: 'legifrance__rechercher', description: 'x', input_schema: { type: 'object', properties: { requete: { type: 'string' } } } }] });
  assert.equal(r.appels[0].nom, 'legifrance__rechercher');
  assert.doesNotMatch(JSON.stringify(r.appels[0].entree), /Paul|Fournier|FOURNIER|Tanneurs/i);
  assert.match(JSON.stringify(r.appels[0].entree), /1583/);
});

test('anonymisation changée en cours de conversation : l’IA en est prévenue à la question suivante', async () => {
  const client = fauxClient([
    { stop_reason: 'end_turn', usage, content: [texte('Bonjour.')] },
    { stop_reason: 'end_turn', usage, content: [texte('Compris.')] }
  ]);
  const o = { cle: 'k', client, modele: 'claude-opus-5-5' };
  let r = await tourAgent({ texte: 'Bonjour', dossiers: D, contexte: { aujourdhui: '2026-10-20' } }, o);
  await tourAgent({ conversation: r.conversation, texte: 'Et maintenant ?', anonymiser: false, dossiers: D, contexte: { aujourdhui: '2026-10-20' } }, o);
  assert.match(JSON.stringify(client.requetes[1].messages), /Anonymisation DÉSACTIVÉE/);
});

test('blocDocumentsJoints : identifiants contrôlés, plafond, pages sans texte, jamais plus de 8 documents', () => {
  const { blocDocumentsJoints } = require('../src/assistantAgent');
  const id = (s) => s;
  const r = blocDocumentsJoints([{ id: 'pj1', pages: [{ page: 1, texte: 'abc' }, { page: 2, texte: '' }] }, { id: '../x', pages: [{ page: 1, texte: 'pirate' }] }, { id: 'pj2', pages: 'non' }], id);
  assert.equal(r.pages, 2);
  assert.doesNotMatch(r.bloc, /pirate/);
  assert.match(r.bloc, /page sans texte lisible/);
  const long = blocDocumentsJoints([{ id: 'pj1', pages: [{ page: 1, texte: 'x'.repeat(30000) }, { page: 2, texte: 'y'.repeat(30000) }] }], id, 40000);
  assert.equal(long.coupe, true);
  assert.equal(long.pages, 1);
  assert.match(long.bloc, /Texte coupé/);
  assert.equal(blocDocumentsJoints([], id).bloc, '');
});

// ---- Relecture 20/10 : masquage d'un DOCUMENT (lisible, linéaire), filtres des recherches sortantes ----

test('masquerDocument : un acte reste lisible (titres, « de », « le », mots du métier), les personnes et coordonnées sont codées', () => {
  const { masquerDocument } = require('../src/assistantMistral');
  const table = new Map();
  const texte = 'PROMESSE DE VENTE\nENTRE LES SOUSSIGNÉS :\nMonsieur Paul FOURNIER, né à Tours le 12 mai 1970, demeurant à BLOIS (41000), 12 rue des Lices, marié sous le régime légal,\n'
    + 'et Madame Léa MARTIN épouse GAUTHIER, joignable au 06 12 34 56 78 ou lea@exemple.fr, IBAN FR76 3000 6000 0112 3456 7890 189.\n'
    + 'Le bien, au lieu-dit « Les Grouets », est vendu moyennant le prix de 245 000 euros, libre de toute occupation. Surface : 85 m². Article PREMIER. Paris, le 12 octobre 2026.';
  const m = masquerDocument(texte, new Set(['fournier', 'paul', 'lices']), table);
  assert.match(m, /PROMESSE DE VENTE/);
  assert.match(m, /ENTRE LES SOUSSIGNÉS/);
  assert.match(m, /moyennant le prix de 245 000 euros, libre de toute occupation/);
  assert.match(m, /Surface : 85 m²/);
  assert.match(m, /Article PREMIER/);
  assert.match(m, /Paris, le 12 octobre 2026/);
  assert.doesNotMatch(m, /FOURNIER|Fournier|Paul|MARTIN|Léa|GAUTHIER|lea@exemple|06 12 34 56 78|FR76 3000|Grouets|Lices|Tours|BLOIS/);
  assert.ok(![...table.values()].some((v) => /^(de|le|les|et|vente)$/i.test(v)), 'aucun mot courant en table : ' + [...table.values()].join('|'));
});

test('masquerDocument : linéaire — 400 000 caractères en moins de deux secondes', () => {
  const { masquerDocument } = require('../src/assistantMistral');
  const phrase = 'Le vendeur déclare que le bien est libre de toute occupation et que Monsieur Paul DURAND, demeurant à TOURS, a payé le prix de 245 000 euros. ';
  const t0 = Date.now();
  const m = masquerDocument(phrase.repeat(Math.ceil(400000 / phrase.length)), new Set(), new Map());
  assert.ok(m.length > 300000);
  assert.ok(Date.now() - t0 < 2000, 'durée : ' + (Date.now() - t0) + ' ms');
});

test('sansNomsPropres : une recherche de droit perd les noms propres et garde les mots de droit ; rne garde numéros et codes postaux', () => {
  const { sansNomsPropres, rneSansPersonnes } = require('../src/assistantAgent');
  assert.equal(sansNomsPropres('promesse Fournier prêt article 1583 Code civil Dupont'), 'promesse prêt article 1583 Code civil');
  assert.deepEqual(sansNomsPropres({ requete: 'bail Martin CGI 150 U' }), { requete: 'bail CGI 150 U' });
  assert.deepEqual(rneSansPersonnes({ q: 'Paul Durand', cp: '41000', siren: '732 829 320' }, new Set()), { q: '', cp: '41000', siren: '732 829 320' });
});

test('réactiver l’anonymisation ne rouvre ni la recherche web ni les recherches de droit non filtrées', async () => {
  const client = fauxClient([
    { stop_reason: 'end_turn', usage, content: [texte('Bonjour.')] },
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'legifrance__rechercher', { requete: 'promesse Fournier article 1583' })] }
  ]);
  const o = { cle: 'k', client, modele: 'claude-opus-5-5', rechercheWeb: ['legifrance.gouv.fr'],
    outilsExternes: [{ name: 'legifrance__rechercher', description: 'x', input_schema: { type: 'object', properties: { requete: { type: 'string' } } } }] };
  let r = await tourAgent({ texte: 'Bonjour', anonymiser: false, dossiers: D, contexte: { aujourdhui: '2026-10-20' } }, o);
  r = await tourAgent({ conversation: r.conversation, texte: 'Cherche', anonymiser: true, dossiers: D, contexte: { aujourdhui: '2026-10-20' } }, o);
  assert.ok(!(client.requetes[1].tools || []).some((t) => t.name === 'web_search'));
  assert.doesNotMatch(JSON.stringify(r.appels[0].entree), /Fournier/);
  assert.match(JSON.stringify(r.appels[0].entree), /1583/);
});

test('texte coupé : plus aucune page après la première qui ne tient pas, et le poste en est informé (joints)', async () => {
  const { blocDocumentsJoints } = require('../src/assistantAgent');
  const r = blocDocumentsJoints([{ id: 'pj1', pagesTotal: 3, pages: [{ page: 1, texte: 'a'.repeat(100) }, { page: 2, texte: 'b'.repeat(500) }, { page: 3, texte: 'c' }] }, { id: 'pj2', pages: [{ page: 1, texte: 'd' }] }], (x) => x, 300);
  assert.equal(r.pages, 1);
  assert.equal(r.coupe, true);
  assert.equal(r.pagesDemandees, 3);
  assert.doesNotMatch(r.bloc, /pj2 p\. 1|\[pj1 p\. 3\]/);
  const client = fauxClient([{ stop_reason: 'end_turn', usage, content: [texte('ok')] }]);
  const sortie = await tourAgent({ texte: 'Analyse', documents: [{ id: 'pj1', pages: [{ page: 1, texte: 'x' }] }], dossiers: D, contexte: { aujourdhui: '2026-10-20' } }, { cle: 'k', client, modele: 'claude-opus-5-5' });
  assert.deepEqual(sortie.joints, { pages: 1, demandees: 1, coupe: false });
});

test('sansNomsPropres : un identifiant Légifrance ou BOFiP reste intact', () => {
  const { sansNomsPropres } = require('../src/assistantAgent');
  const r = sansNomsPropres({ id: 'LEGIARTI000006419288', q: 'voir JORFTEXT000041234567 Martin Dupont vente BOI-ENR-DMTOM-10-10-20190101' });
  assert.equal(r.id, 'LEGIARTI000006419288');
  assert.equal(r.q, 'voir JORFTEXT000041234567 vente BOI-ENR-DMTOM-10-10-20190101');
});


test('plus de pouvoirs (21/10) : noms de fichiers du NAS, de scans et d’agenda masqués, identifiants opaques intacts', () => {
  const table = new Map();
  const m = masquerValeur({
    dossier_affiche: '1 - Vendeur',
    entrees: [{ element_id: 'nf6', type: 'fichier', nom: 'CNI Paul FOURNIER.pdf' }, { element_id: 'nf7', type: 'fichier', nom: 'Carte Léa GAUTHIER - Dubreuil Immobilier.pdf' }],
    scans_en_attente: [{ scan_id: 'sc1', dossier_propose: { id: 'd1', libelle: 'VTE - FOURNIER / GAUTHIER' }, pourquoi: 'Score 5/6 : 2 parties nommées +6' }],
    resultats: [{ dossier: 'VTE - FOURNIER', extrait: 'Madame Léa GAUTHIER, 2 rue des Tanneurs à Blois' }],
    rangements: [{ entree_id: '1bce4ca4-ebc6-4e7d-84c0-b426c0d7eb63', dossier: 'VTE - FOURNIER' }]
  }, motsSensiblesDossiers(D), table);
  const texte = JSON.stringify(m);
  assert.doesNotMatch(texte, SECRETS);
  assert.equal(m.entrees[0].element_id, 'nf6');
  assert.equal(m.scans_en_attente[0].scan_id, 'sc1');
  assert.equal(m.rangements[0].entree_id, '1bce4ca4-ebc6-4e7d-84c0-b426c0d7eb63');
});

test('plus de pouvoirs (21/10) : les nouveaux outils sont déclarés, stricts, et l’agent est prévenu des autorisations', () => {
  const { SYSTEME_AGENT } = require('../src/assistantAgent');
  for (const nom of ['actions_en_lot', 'scans_claire', 'nas_dossier', 'agenda_evenement']) {
    const o = OUTILS_AGENT.find((x) => x.name === nom);
    assert.ok(o, nom);
    assert.equal(o.strict, false, 'l’API limite les outils stricts à 20 par requête');
    assert.equal(o.input_schema.additionalProperties, false);
    assert.deepEqual([...o.input_schema.required].sort(), Object.keys(o.input_schema.properties).sort(), `${nom} : tous les champs requis (mode strict)`);
  }
  // Rien de destructeur : ni suppression sur le NAS, ni envoi d'email.
  assert.deepEqual(OUTILS_AGENT.find((x) => x.name === 'nas_dossier').input_schema.properties.action.enum, ['lister', 'renommer', 'deplacer']);
  assert.match(SYSTEME_AGENT, /actions_en_lot/);
  assert.match(SYSTEME_AGENT, /autorisation de l'utilisateur/);
});

test('plus de pouvoirs (21/10) : 20 outils stricts au plus ; un code inventé dans un lot, un nom de fichier ou un titre devient « [à compléter] »', () => {
  assert.ok(OUTILS_AGENT.filter((o) => o.strict).length <= 20);
  const e = entreeOutilPourPoste('actions_en_lot', { actions: [{ action: 'note_historique', dossier_id: 'd1', valeur: 'relancé [NOM7]', piece: '', numero: 0, libelle: '', date: '', champ: '', tache_id: '' }] });
  assert.equal(e.actions[0].valeur, 'relancé [à compléter]');
  assert.equal(entreeOutilPourPoste('nas_dossier', { action: 'renommer', nouveau_nom: 'CNI [NOM9]' }).nouveau_nom, 'CNI [à compléter]');
  assert.equal(entreeOutilPourPoste('agenda_evenement', { action: 'renommer', titre: 'VTE - [NOM2]' }).titre, 'VTE - [à compléter]');
  assert.equal(entreeOutilPourPoste('scans_claire', { action: 'lister', scan_id: 'sc1' }).scan_id, 'sc1');
});

test('plus de pouvoirs (21/10) : la liste du NAS garde le nom des fichiers lisible (clé non masquée en entier), noms de personnes codés', () => {
  const m = masquerValeur({ entrees: [{ element_id: 'nf6', type: 'fichier', intitule: 'CNI Paul FOURNIER.pdf' }, { element_id: 'nf7', type: 'fichier', intitule: 'RIB.pdf' }] }, motsSensiblesDossiers(D), new Map());
  assert.equal(m.entrees[1].intitule, 'RIB.pdf');
  assert.match(m.entrees[0].intitule, /^CNI .*\.pdf$/);
  assert.doesNotMatch(m.entrees[0].intitule, /Paul|FOURNIER/);
});


test('lecture libre du NAS (21/10) : outil déclaré non strict ; noms de fichiers lisibles mais sans personne ; texte lu masqué comme un document', () => {
  const o = OUTILS_AGENT.find((t) => t.name === 'nas_libre');
  assert.ok(o && o.strict === false);
  assert.deepEqual([...o.input_schema.required].sort(), Object.keys(o.input_schema.properties).sort());
  assert.ok(OUTILS_AGENT.filter((t) => t.strict).length <= 20);
  const m = masquerValeurLegere({ resultats: [{ element_id: 'lf3', type: 'fichier', intitule: 'AUTRES/CNI Paul FOURNIER.pdf' }, { element_id: 'lf4', type: 'fichier', intitule: 'MODELES - OUTILS/Procuration.docx' }] }, motsSensiblesDossiers(D), new Map());
  assert.equal(m.resultats[1].intitule, 'MODELES - OUTILS/Procuration.docx', 'les noms de l’étude restent lisibles');
  assert.doesNotMatch(m.resultats[0].intitule, /Paul|FOURNIER/, 'un mot des fiches est masqué, quelle que soit sa place');
});

test('lecture libre du NAS (21/10) : de bout en bout, noms de l’étude lisibles, mots des fiches et tiers du texte masqués', async () => {
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'nas_libre', { action: 'chercher', sous: '', texte: 'procuration', element_id: '', debut: 0 })] },
    { stop_reason: 'tool_use', usage, content: [outil('t2', 'nas_libre', { action: 'lire', sous: '', texte: '', element_id: 'lf1', debut: 0 })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voici le modèle.')] }
  ]);
  const o = { cle: 'k', client, modele: 'claude-opus-5-5' };
  let r = await tourAgent({ texte: 'Trouve le modèle de procuration', dossiers: D, contexte: { aujourdhui: '2026-10-21' } }, o);
  assert.equal(r.appels[0].nom, 'nas_libre');
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { nombre: 2, resultats: [
    { element_id: 'lf1', type: 'fichier', intitule: 'MODELES - OUTILS/Procuration générale.docx', taille: '12 Ko', modifie: '2025-03-02' },
    { element_id: 'lf2', type: 'fichier', intitule: 'MODELES - OUTILS/Procuration Paul FOURNIER.docx', taille: '9 Ko', modifie: '2026-01-04' }] } }] }, o);
  const noms = JSON.stringify(client.requetes[1].messages);
  assert.match(noms, /MODELES - OUTILS\/Procuration générale\.docx/, 'les noms de l’étude restent lisibles');
  assert.doesNotMatch(noms, SECRETS, 'un mot des fiches est masqué : ' + noms.slice(-500));
  assert.equal(r.appels[0].nom, 'nas_libre');
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't2', contenu: { texte: 'PROCURATION\nJe soussigné Monsieur Paul FOURNIER, demeurant 2 rue des Tanneurs,\ndonne pouvoir à Monsieur Gérard LEMAIRE, g.lemaire@cabinet-exemple.fr, 02 54 12 34 56.', caracteres_total: 150, debut: 0 } }] }, o);
  const lu = JSON.stringify(client.requetes[2].messages);
  assert.doesNotMatch(lu, SECRETS, 'aucune donnée des fiches dans le texte lu : ' + lu.slice(-600));
  assert.doesNotMatch(lu, /LEMAIRE|g\.lemaire|02 54 12 34 56/, 'un tiers du texte ne part pas : ' + lu.slice(-600));
  assert.match(lu, /donne pouvoir/);
});

test('calcul libre (21/10) : outil non strict ; le résultat d’un calcul sur les fiches repart masqué, les valeurs réelles ne quittent pas le poste', async () => {
  const o0 = OUTILS_AGENT.find((t) => t.name === 'calcul');
  assert.ok(o0 && o0.strict === false);
  assert.deepEqual([...o0.input_schema.required].sort(), Object.keys(o0.input_schema.properties).sort());
  assert.ok(OUTILS_AGENT.filter((t) => t.strict).length <= 20);
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'calcul', { objectif: 'Total des prêts', code: 'return donnees.dossiers.length;', donnees: {}, dossier_ids: ['*'], delai_secondes: 0 })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const o = { cle: 'k', client, modele: 'claude-opus-5-5' };
  let r = await tourAgent({ texte: 'Total des prêts reçus', dossiers: D, contexte: { aujourdhui: '2026-10-21' } }, o);
  assert.equal(r.appels[0].nom, 'calcul');
  assert.equal(r.appels[0].entree.dossier_ids[0], '*');
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { calcul_fait: true, resultat: { total: 180000, dossier_le_plus_gros: 'VTE - FOURNIER / GAUTHIER' },
    tableau: { titre: 'Offres', colonnes: ['Dossier', 'Montant'], lignes_total: 2, apercu: [['VTE - FOURNIER / GAUTHIER', 180000]] } } }] }, o);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, 'aucune donnée des fiches : ' + envoye.slice(-500));
  assert.match(envoye, /180000/, 'les montants partent tels quels (choix de l’étude)');
});

test('audit 21/10 (H1) : un résultat de calcul qui recode des valeurs (base64, hexadécimal, lettres espacées, codes de caractères) est retenu', () => {
  const { resultatCalculSuspect } = require('../src/assistantAgent');
  assert.equal(resultatCalculSuspect({ total: 180000, par_type: { vente: 12, succession: 3 }, libelle: 'D001' }), false);
  assert.equal(resultatCalculSuspect({ e: 'D u p o n t' }), true);
  assert.equal(resultatCalculSuspect({ e: [68, 117, 112, 111, 110, 116] }), true);
  assert.equal(resultatCalculSuspect({ e: Buffer.from('paul.dupont@mail.fr').toString('base64') }), true);
  assert.equal(resultatCalculSuspect({ e: Buffer.from('paul.dupont@mail.fr').toString('hex') }), true);
  assert.equal(resultatCalculSuspect({ m: 'Offres reçues en octobre : 4 dossiers sur 12, soit 33 %' }), false);
  assert.equal(resultatCalculSuspect({ ids: ['f1', 'f2', 'abcdef123456'] }), false);
});

test('erreur 400 de Claude : le détail de l\'API est dit (21/10)', () => {
  const { messageErreurAgent } = require('../src/assistantAgent');
  const m = messageErreurAgent({ status: 400, error: { error: { message: 'tools.7.custom.input_schema: invalid' } } });
  assert.match(m, /requête refusée par Claude \(tools\.7\.custom\.input_schema: invalid\)/);
});

test('action_dossier non strict : une valeur hors énumération (champ « constructor ») est vidée (22/10)', () => {
  const e = entreeOutilPourPoste('action_dossier', { action: 'date_effacer', dossier_id: 'd1', champ: 'constructor', valeur: 'x' });
  assert.equal(e.champ, '');
  assert.equal(entreeOutilPourPoste('action_dossier', { action: 'rien', dossier_id: 'd1' }).action, '');
  assert.equal(entreeOutilPourPoste('action_dossier', { action: 'piece_recue', dossier_id: 'd1' }).action, 'piece_recue');
});

test('nouveau dossier de vente depuis un compromis joint (24/10) : outil déclaré, non strict, mode et pièce jointe, consigne de l’agent', () => {
  const { SYSTEME_AGENT } = require('../src/assistantAgent');
  const o = OUTILS_AGENT.find((x) => x.name === 'nouveau_dossier_vente');
  assert.ok(o);
  assert.equal(o.strict, false);
  assert.equal(o.input_schema.additionalProperties, false);
  assert.deepEqual(o.input_schema.properties.mode.enum, ['authentic', 'preparer', 'creer']);
  assert.deepEqual([...o.input_schema.required].sort(), Object.keys(o.input_schema.properties).sort());
  assert.match(SYSTEME_AGENT, /nouveau_dossier_vente/);
  assert.match(SYSTEME_AGENT, /Rien n'est créé sans dossier d'Authentic correspondant/);
});

test('nouveau dossier : étape Authentic — mode « authentic » et authentic_id déclarés', () => {
  const o = OUTILS_AGENT.find((x) => x.name === 'nouveau_dossier_vente');
  assert.deepEqual(o.input_schema.properties.mode.enum, ['authentic', 'preparer', 'creer']);
  assert.ok(o.input_schema.properties.authentic_id);
  assert.deepEqual([...o.input_schema.required].sort(), Object.keys(o.input_schema.properties).sort());
  assert.match(o.description, /TOUJOURS depuis Authentic/);
});

test('outil_champs (24/10) : proposé à l’agent, un code inventé n’est jamais écrit dans un champ, rien de nominatif ne part dans la liste des champs', async () => {
  const def = OUTILS_AGENT.find((t) => t.name === 'outil_champs');
  assert.ok(def, 'outil outil_champs proposé');
  assert.deepEqual(def.input_schema.properties.mode.enum, ['lister', 'remplir']);
  assert.ok(!def.input_schema.properties.outil.enum.includes('claire_scan'), 'ni Claire Scan ni Nouveau dossier : ils ont leurs outils');
  const e = entreeOutilPourPoste('outil_champs', { outil: 'quotites', mode: 'remplir', champs: [{ id: 'qt-apport', valeur: '[NOM9]' }, { id: 'qt-prix', valeur: '250 000' }] });
  assert.doesNotMatch(JSON.stringify(e), /\[NOM9\]/);
  assert.match(JSON.stringify(e), /250 000/);
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'outil_champs', { outil: 'appel_fonds', mode: 'lister', champs: [] })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const o = { cle: 'k', client };
  let r = await tourAgent({ texte: 'Remplis l’appel de fonds', dossiers: D, contexte: {} }, o);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { nombre: 2, champs: [
    { id: 'af-email', libelle: 'Email', type: 'email', valeur: 'paul.fournier@exemple.fr' },
    { id: 'af-nom', libelle: 'Destinataire', type: 'text', valeur: 'Monsieur Paul FOURNIER' }] } }] }, o);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, 'aucun nom : ' + envoye.slice(-500));
  assert.equal(r.reponse, 'Voilà.');
});

test('faire_geste email : documents à joindre = identifiants opaques du poste seulement, 10 au plus (étude 26/10)', () => {
  const e = entreeOutilPourPoste('faire_geste', { geste: 'email', dossier_id: 'd1', parametres: { partie: 'confrere', documents: ['doc3', 'pj1', '../../etc/passwd', 'C:\\Users\\x.pdf', 42, ...Array.from({ length: 12 }, (_, i) => 'doc' + (i + 10))] } });
  assert.equal(e.parametres.documents.slice(0, 2).join(','), 'doc3,pj1');
  assert.equal(e.parametres.documents.length, 10);
  assert.ok(e.parametres.documents.every((x) => /^[a-z]{1,4}\d{1,6}$/i.test(x)));
  assert.equal(entreeOutilPourPoste('faire_geste', { geste: 'email', parametres: {} }).parametres.documents.length, 0);
});

test('agenda et noms de fichiers du NAS (étude 26/10) : titre, lieu et nom_fichier partent, noms des fiches codés', async () => {
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'agenda', { debut: '2026-10-26', fin: '2026-10-30' })] },
    { stop_reason: 'tool_use', usage, content: [outil('t2', 'documents_du_dossier', { dossier_id: 'd1' })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const o = { cle: 'k', client, modele: 'claude-opus-5-5' };
  let r = await tourAgent({ texte: 'Quels rendez-vous cette semaine ?', dossiers: D, contexte: { aujourdhui: '2026-10-26' } }, o);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { rendez_vous: [
    { evenement_id: 'e1', date: '2026-10-28', heure: '10:00', nature: 'signature de vente', titre: 'VTE - FOURNIER / GAUTHIER', lieu: 'Office notarial de la Salamandre, Blois', categories: [], dossier_id: 'd1', dossier: 'VTE - FOURNIER / GAUTHIER' },
    { evenement_id: 'e2', date: '2026-10-29', heure: '14:00', nature: 'autre rendez-vous', titre: 'Rendez-vous téléphonique avec le syndic', lieu: 'Visio', categories: [], dossier_id: '', dossier: '' }] } }] }, o);
  let envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, 'les noms des fiches sont codés dans le titre : ' + envoye.slice(-700));
  assert.match(envoye, /Rendez-vous téléphonique avec le syndic/, 'le titre d’un rendez-vous part');
  assert.match(envoye, /Office notarial de la/, 'le lieu part (les mots à majuscule hors tête de phrase restent codés, comme dans tout résultat d’outil)');
  await tourAgent({ conversation: r.conversation, resultats: [{ id: 't2', contenu: { nombre: 1, documents: [{ document_id: 'doc1', nom_fichier: 'Compromis signé FOURNIER GAUTHIER', document: 'Compromis de vente', sous_dossier: 'racine', modifie_le: '2026-09-02' }] } }] }, o);
  envoye = JSON.stringify(client.requetes[2].messages);
  assert.doesNotMatch(envoye, SECRETS, 'les noms des fiches sont codés dans le nom du fichier : ' + envoye.slice(-700));
  assert.match(envoye, /Compromis signé/, 'le nom du fichier reste lisible');
});

test('pièces jointes (0.364.0) : 15 documents lus en entier par message, le texte de chacun intégral', () => {
  const { blocDocumentsJoints } = require('../src/assistantAgent');
  const docs = Array.from({ length: 17 }, (_, i) => ({ id: 'pj' + (i + 1), pagesTotal: 3, pages: [1, 2, 3].map((p) => ({ page: p, texte: `Texte de la page ${p} du document ${i + 1}.` })) }));
  const r = blocDocumentsJoints(docs, (t) => t, 700000);
  assert.equal(r.coupe, false);
  assert.equal(r.pages, 45, '15 documents de 3 pages ; les deux suivants ne sont pas lus');
  assert.match(r.bloc, /=== pj15 : 3 pages ===/);
  assert.match(r.bloc, /page 3 du document 15\./, 'le dernier document est lu jusqu’au bout');
  assert.doesNotMatch(r.bloc, /pj16/);
});

test('vouvoiement (26/10) : Bastien et Sophie vouvoient Julie et Jérémy — dit à l’agent dans le prompt et l’outil', () => {
  const { OUTILS_AGENT } = require('../src/assistantAgent');
  const outil = OUTILS_AGENT.find((t) => t.name === 'demander_collaborateur');
  assert.match(outil.description, /Bastien et Sophie vouvoient Julie et Jérémy/);
  assert.match(outil.description, /écrite SOUS SON NOM dans sa conversation personnelle/);
});

test('sa conversation (profil de CLAIRE) : la mémoire des autres conversations part au premier tour, masquée ; jamais dans un canal', async () => {
  const { memoirePourVueClaire } = require('../src/conversationsAgent');
  const t = Date.UTC(2026, 9, 26, 9);
  const memoire = memoirePourVueClaire({
    conversations: [
      { id: 'c-autre', auteur: 'Bastien', maj: t, titre: 'Offre de prêt', questions: ['Où en est l’offre de prêt de Fournier ?'], reponse: 'Paul FOURNIER attend son offre ; écrire à paul.fournier@exemple.fr.', dossierId: 'd1' },
      { id: 'c-julie', auteur: 'Julie', maj: t, titre: 'Autre', questions: ['Secret de Julie'], reponse: 'x' },
      { id: 'c-en-cours', auteur: 'Bastien', maj: t, titre: 'celle-ci', questions: ['celle-ci'], reponse: 'y' }
    ],
    messages: [{ id: 'm1', quand: t, court: 'Pièce trouvée : titre de propriété.', dossierId: 'd1' }],
    prenom: 'Bastien', convId: 'c-en-cours'
  });
  assert.match(memoire, /Où en est l’offre de prêt/);
  assert.match(memoire, /Pièce trouvée/);
  assert.doesNotMatch(memoire, /Secret de Julie/, 'jamais la conversation d’un autre');
  assert.doesNotMatch(memoire, /celle-ci/, 'pas la conversation en cours');
  assert.equal(memoirePourVueClaire({ conversations: [], messages: [], prenom: 'Bastien', convId: '' }), '');

  const client = fauxClient([{ stop_reason: 'end_turn', usage, content: [texte('Je m’en souviens.')] }, { stop_reason: 'end_turn', usage, content: [texte('ok')] }]);
  const o = { cle: 'k', client, modele: 'claude-opus-5-5', memoireVueClaire: (p, id, masquer) => memoirePourVueClaire({ conversations: [{ id: 'c-autre', auteur: 'Bastien', maj: t, titre: 'x', questions: ['Où en est l’offre de prêt de Fournier ?'], reponse: 'Paul FOURNIER attend son offre ; écrire à paul.fournier@exemple.fr.', dossierId: 'd1' }], messages: [], prenom: p, convId: id, masquer }), sensiblesConversations: () => ['Paul FOURNIER'] };
  await tourAgent({ texte: 'Tu te rappelles ?', dossiers: D, contexte: { aujourdhui: '2026-10-27', prenom: 'Bastien', vueClaire: true } }, o);
  const envoye = JSON.stringify(client.requetes[0].messages);
  assert.match(envoye, /Ta mémoire/);
  assert.doesNotMatch(envoye, SECRETS, 'aucune donnée nominative dans : ' + envoye.slice(0, 600));
  assert.doesNotMatch(envoye, /paul\.fournier/);
  viderConversationsAgent();
  await tourAgent({ texte: 'Dans un canal', dossiers: D, contexte: { aujourdhui: '2026-10-27', prenom: 'Bastien' } }, o);
  assert.doesNotMatch(JSON.stringify(client.requetes[1].messages), /Ta mémoire/, 'hors de son espace : rien');
});

test('artefact (27/10) : le brouillon relu part masqué, la correction revient avec les vrais noms ; outils non stricts', async () => {
  for (const n of ['artefact', 'modele_email']) {
    const o = OUTILS_AGENT.find((t) => t.name === n);
    assert.ok(o, n + ' proposé');
    assert.equal(o.strict, false, n + ' hors des outils stricts (limite de la grammaire)');
  }
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'artefact', { mode: 'lire', artefact_id: 'art1' })] },
    { stop_reason: 'tool_use', usage, content: [outil('t2', 'artefact', { mode: 'modifier', artefact_id: 'art1', objet: 'Diagnostic', texte: 'Monsieur [NOM1],\n\nMerci.' })] },
    { stop_reason: 'end_turn', usage, content: [texte('C’est corrigé.')] }
  ]);
  const o = { cle: 'k', client };
  let r = await tourAgent({ texte: 'Raccourcis le brouillon', dossiers: D, contexte: {} }, o);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { artefact_id: 'art1', type: 'email', destinataire: 'paul.fournier@exemple.fr',
    objet: 'Dossier FOURNIER', texte: 'Monsieur Paul FOURNIER,\n\nPouvez-vous nous transmettre le diagnostic du 2 rue des Tanneurs ?' } }] }, o);
  assert.doesNotMatch(JSON.stringify(client.requetes[1].messages), SECRETS, 'le brouillon relu part masqué');
  const appel = (r.appels || []).find((x) => x.nom === 'artefact');
  assert.ok(appel, 'la correction revient au poste');
  assert.match(appel.entree.texte, /FOURNIER/, 'avec le vrai nom, rétabli par le serveur');
});

test('modele_email (audit 0.374.0) : aucun code rétabli, chacun devient « [à compléter] » ; tableau relu recodé : retenu', async () => {
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('t1', 'lire_dossier', { dossier_id: 'd1' })] },
    { stop_reason: 'tool_use', usage, content: [outil('t2', 'modele_email', { mode: 'enregistrer', nom: 'Relance', objet: 'Dossier [NOM1]', corps: 'Bonjour [NOM1], écrivez à [EMAIL1].' }),
      outil('t3', 'artefact', { mode: 'lire', artefact_id: 'art1' })] },
    { stop_reason: 'end_turn', usage, content: [texte('Fait.')] }
  ]);
  const o = { cle: 'k', client };
  let r = await tourAgent({ texte: 'Enregistre ce brouillon', dossiers: D, contexte: {} }, o);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't1', contenu: { nom: 'FOURNIER', email: 'paul.fournier@exemple.fr' } }] }, o);
  const m = r.appels.find((x) => x.nom === 'modele_email');
  assert.doesNotMatch(JSON.stringify(m.entree), SECRETS, 'aucun nom rétabli dans un modèle de l’étude');
  assert.match(m.entree.corps, /\[à compléter\]/);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 't2', contenu: { fait: true } },
    { id: 't3', contenu: { type: 'tableau', apercu: [['UEFVTCBGT1VSTklFUg==']] } }] }, o);
  const envoye = JSON.stringify(client.requetes[2].messages);
  assert.match(envoye, /Résultat retenu/, 'un tableau relu aux valeurs recodées est retenu comme un calcul');
  assert.doesNotMatch(envoye, /UEFVTCBGT1VSTklFUg==/);
});

test('authentic_lire (27/10, étape 8) : rien de nominatif ne part des formalités, pièces jointes et suivis ; dates et états partent', async () => {
  const o = OUTILS_AGENT.find((t) => t.name === 'authentic_lire');
  assert.ok(o, 'outil authentic_lire proposé');
  assert.deepEqual(o.input_schema.properties.vue.enum, ['dossier', 'suivis']);
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('a1', 'authentic_lire', { vue: 'dossier', dossier_id: 'd1' })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const opts = { cle: 'k', client };
  let r = await tourAgent({ texte: 'Où en est Fournier dans Authentic ?', dossiers: D, contexte: {} }, opts);
  r = await tourAgent({ conversation: r.conversation, resultats: [{ id: 'a1', contenu: {
    dossier_id: 'd1', lu_le: '2026-10-27T09:00:00Z',
    sous_dossier: { intitule: '2 - VTE FOURNIER / GAUTHIER', statut: 'Préparation définitive', statut_le: '2026-10-14',
      formalites_prealables: [{ type: 'ECV', libelle: 'ECV État-Civil - Acte de Naissance - FOURNIER Paul', etat: 'Réponse positive', dates: ['2026-10-01'], recuLe: '2026-10-05' },
        { type: 'APR', libelle: 'Lettre de mission Gauthier Léa', etat: 'Envoyé', dates: ['2026-10-02'] }],
      actes: [{ type: 'ACT', libelle: 'Acte de vente', etat: 'Non rédigé', dates: [] }], formalites_posterieures: [],
      pieces_jointes: [{ nom: 'Titre de propriété FOURNIER.pdf', dossier_ged: 'Non classé', piece_de_claire: 'Titre de propriété', recue_dans_claire: true, aussi_sur_le_nas: false }] },
    dans_les_suivis: [{ ecran: 'SAFER et DIA', libelle: 'DIA mairie 2 rue des Tanneurs', situation: 'Pris en compte', dates: ['2026-10-03'], en_attente: true }]
  } }] }, opts);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, 'aucun nom : ' + envoye.slice(-900));
  assert.match(envoye, /Réponse positive/);
  assert.match(envoye, /2026-10-05/);
  assert.match(envoye, /Préparation définitive/);
  assert.equal(r.reponse, 'Voilà.');
});

test('28/10 : etat_hypothecaire, urbanisme_demandes, routines_claire proposés ; rien de nominatif ne part de leurs résultats', async () => {
  for (const n of ['etat_hypothecaire', 'urbanisme_demandes', 'routines_claire']) assert.ok(OUTILS_AGENT.some((t) => t.name === n), n);
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('h1', 'etat_hypothecaire', { dossier_id: 'd1', relire: false })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const opts = { cle: 'k', client };
  const r = await tourAgent({ texte: 'Y a-t-il des inscriptions sur Fournier ?', dossiers: D, contexte: {} }, opts);
  await tourAgent({ conversation: r.conversation, resultats: [{ id: 'h1', contenu: {
    dossier_id: 'd1', relu_le: '2026-10-28T08:00:00Z', lecture_complete: true,
    inscriptions_en_cours: [{ nature: 'hypothèque conventionnelle', creancier: 'Jean Durand', montant: '87 000,00 €', date_extreme_effet: '2032-05-05', etat: 'en cours', page: 9 }],
    radiees_ou_perimees: [], charges_signalees_dans_un_complement: [{ nature: 'pacte de préférence', page: 5 }]
  } }] }, opts);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, 'aucun nom : ' + envoye.slice(-600));
  assert.doesNotMatch(envoye, /Jean|Durand/, 'un créancier absent des fiches, en casse mixte, part masqué en entier');
  assert.match(envoye, /hypothèque conventionnelle/, 'la nature reconnue reste lisible (client/137)');
  // urbanisme_demandes et routines_claire : titre d'une proposition et libellés, masqués comme tout résultat d'outil.
  const c2 = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('u1', 'urbanisme_demandes', { dossier_id: 'd1' }), outil('r1', 'routines_claire', { mode: 'lister', dossier_id: 'd1', proposition_id: '' })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const r2 = await tourAgent({ texte: 'La DIA et les routines de Fournier ?', dossiers: D, contexte: {} }, { cle: 'k', client: c2 });
  await tourAgent({ conversation: r2.conversation, resultats: [
    { id: 'u1', contenu: { dossier_id: 'd1', dia: { demandee: true, envoyee_le: '2026-10-20', par: 'guichet unique (GNAU)', numero_du_guichet: '041018 26 00012' }, cu: { demande: false }, autres_demandes_dans_authentic: [] } },
    { id: 'r1', contenu: { propositions: [{ proposition_id: 'p1', titre: 'Constitution du dossier — VTE - FOURNIER / LEBLANC', type: 'document', etat: 'autorisée, à terminer' }] } }
  ] }, { cle: 'k', client: c2 });
  const envoye2 = JSON.stringify(c2.requetes[1].messages);
  assert.doesNotMatch(envoye2, /FOURNIER|LEBLANC/, 'titre de la proposition masqué : ' + envoye2.slice(-500));
  assert.match(envoye2, /2026-10-20/);
  assert.match(envoye, /2032-05-05/);
});

test('28/10 : coordonnees_client et bilan_dossier — téléphones, emails et noms ne partent jamais en clair ; chiffres et dates partent', async () => {
  for (const n of ['coordonnees_client', 'bilan_dossier']) assert.ok(OUTILS_AGENT.some((t) => t.name === n), n);
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('c1', 'coordonnees_client', { dossier_id: 'd1', partie: '' }), outil('b1', 'bilan_dossier', { dossier_id: 'd1' })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const opts = { cle: 'k', client };
  // Politique « couplé à un nom » (poste qui envoie les adresses) : le cas le plus permissif du masquage.
  const DA = D.map((d) => ({ ...d, adresses: ['BLOIS (41000), 2 rue des Tanneurs'] }));
  const r = await tourAgent({ texte: 'Le numéro de Fournier et le résumé du dossier pour Sophie', dossiers: DA, contexte: {} }, opts);
  await tourAgent({ conversation: r.conversation, resultats: [
    { id: 'c1', contenu: { dossier_id: 'd1', vendeur: { personnes: [{ nom: 'Paul FOURNIER', telephones: ['06 12 34 56 78'], emails: ['paul.fournier@exemple.fr'] }], telephone: '06 12 34 56 78', email: 'paul.fournier@exemple.fr' },
      acquereur: { represente_par_un_confrere: true, ecrire_au_confrere: { notaire: 'Maître Léa GAUTHIER (TOURS)', telephone: '02 47 00 00 00', email: 'office.gauthier@notaires.fr' } } } },
    { id: 'b1', contenu: { dossier_id: 'd1', statut: 'Prêt', dates_cles: { avant_contrat: '2026-07-01', pret_obtenu: '2026-08-20' }, delais_en_jours: { jusqu_au_pret: { jours: 50, moyenne_etude: 42 } },
      echanges: { emails_envoyes: 7, emails_recus: 5, appels_recus: 3 }, evenements_recents: [{ date: '2026-08-20', sorte: 'offre de prêt' }] } }
  ] }, opts);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, 'aucun nom ni coordonnée : ' + envoye.slice(-700));
  assert.match(envoye, /emails_envoyes\\":7/);
  assert.doesNotMatch(envoye, /02 47 00 00 00|office\.gauthier/, 'coordonnées du confrère codées comme toute coordonnée');
  assert.match(envoye, /2026-08-20/);
});

test('28/10 : courrier_fonds_banque — la banque et le défunt ne partent jamais en clair', async () => {
  assert.ok(OUTILS_AGENT.some((t) => t.name === 'courrier_fonds_banque'));
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('f1', 'courrier_fonds_banque', { dossier_id: 'd1', sorte: '', banque: '', ouvrir: true })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const opts = { cle: 'k', client };
  const r = await tourAgent({ texte: 'Prépare le déblocage des fonds pour Fournier', dossiers: D, contexte: {} }, opts);
  await tourAgent({ conversation: r.conversation, resultats: [
    { id: 'f1', contenu: { dossier_id: 'd1', sorte: 'deblocage', etape: 'Déblocage des fonds auprès des banques', etape_faite: false,
      courriers_deja: [{ sorte: 'deblocage', banque_du_repertoire: 'CAISSE EXEMPLE — Service successions Paul FOURNIER', le: '2026-10-28', envoye_depuis_claire: true }], fenetre_ouverte: true } }
  ] }, opts);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, envoye.slice(-500));
  assert.match(envoye, /2026-10-28/);
});

test('28/10 : authentic_comptabilite — un nom dans le libellé d’une opération ne part jamais en clair ; montants et dates partent', async () => {
  assert.ok(OUTILS_AGENT.some((t) => t.name === 'authentic_comptabilite'));
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('k1', 'authentic_comptabilite', { dossier_id: 'd1', relire: false })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const opts = { cle: 'k', client };
  const r = await tourAgent({ texte: 'Quel est le solde de la succession Fournier ?', dossiers: D, contexte: {} }, opts);
  await tourAgent({ conversation: r.conversation, resultats: [
    { id: 'k1', contenu: { dossier_id: 'd1', lue_le: '2026-10-28T10:00', solde_affaire: -350.4, solde_compte: 12500,
      operations: [{ date: '2026-10-02', libelle: 'VIR Paul FOURNIER', debit: null, credit: 12500, solde: 12500 }, { date: '2026-10-05', libelle: 'Virement de Léa Gauthier', debit: 350.4, credit: null, solde: 12149.6 }] } }
  ] }, opts);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, envoye.slice(-600));
  assert.match(envoye, /12500/);
  assert.match(envoye, /2026-10-02/);
});

test('28/10 : lectures_documents — les noms d’un résumé (acte de naissance, PV) ne partent jamais en clair', async () => {
  assert.ok(OUTILS_AGENT.some((t) => t.name === 'lectures_documents'));
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('l1', 'lectures_documents', { dossier_id: 'd1', relire: false })] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const opts = { cle: 'k', client };
  const r = await tourAgent({ texte: 'Y a-t-il une mention au répertoire civil pour Fournier ?', dossiers: D, contexte: {} }, opts);
  await tourAgent({ conversation: r.conversation, resultats: [
    { id: 'l1', contenu: { dossier_id: 'd1', lectures: [{ sorte: 'naissance', lu_le: '2026-10-28', point_a_signaler: true,
      resume: 'Acte de naissance « Acte naissance Paul FOURNIER.pdf » : mention au répertoire civil (curatelle) — « Paul FOURNIER placé sous curatelle, RC n° 2020-1234 ».' }] } }
  ] }, opts);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, envoye.slice(-600));
  assert.match(envoye, /curatelle/);
});

test('29/10 : authentic_apercu — l’IA ne reçoit que « affiché » ou « aucun échec », jamais l’image', async () => {
  assert.ok(OUTILS_AGENT.some((t) => t.name === 'authentic_apercu'));
  const client = fauxClient([
    { stop_reason: 'tool_use', usage, content: [outil('a1', 'authentic_apercu', {})] },
    { stop_reason: 'end_turn', usage, content: [texte('Voilà.')] }
  ]);
  const opts = { cle: 'k', client };
  const r = await tourAgent({ texte: 'Montre-moi où CLAIRE a planté dans Authentic', dossiers: D, contexte: {} }, opts);
  await tourAgent({ conversation: r.conversation, resultats: [{ id: 'a1', contenu: { fait: true, message: 'aperçu affiché en bas à droite de l’écran de l’utilisateur (fermable)' } }] }, opts);
  const envoye = JSON.stringify(client.requetes[1].messages);
  assert.doesNotMatch(envoye, SECRETS, envoye.slice(-400));
  assert.doesNotMatch(envoye, /data:image|base64/);
  assert.match(envoye, /aperçu affiché/);
});

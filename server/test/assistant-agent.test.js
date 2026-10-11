'use strict';

// « Demander à CLAIRE » en agent (étude 11/10 : « aussi intelligent que toi » ; dossiers masqués). Faux client Anthropic : rien
// de nominatif (nom, prénom, adresse, email, téléphone, référence) ne part chez Claude ; les appels d'outils et la réponse
// reviennent codes rétablis ; la boucle s'arrête ; l'historique ne fait que s'allonger.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { tourAgent, requeteAgent, masquerValeur, nettoyerReponseAgent, coutAgentUsd, entreeOutilPourPoste, viderConversationsAgent, OUTILS_AGENT, MAX_TOURS_OUTILS } = require('../src/assistantAgent');
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
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.ok(OUTILS_AGENT.every((t) => t.strict === true && t.input_schema.additionalProperties === false));
  const haiku = requeteAgent('claude-haiku-5-5', []);
  assert.equal(haiku.fallbacks, undefined);
  assert.equal(requeteAgent('inconnu', []).max_tokens, 16000);
  assert.deepEqual(requeteAgent('claude-opus-5-5', [], { conclure: true }).tool_choice, { type: 'none' });
});

test('au-delà de 10 tours d’outils, Claude doit conclure', async () => {
  const reponses = [];
  for (let i = 0; i <= MAX_TOURS_OUTILS; i++) reponses.push({ stop_reason: 'tool_use', usage, content: [outil('t' + i, 'taches_du_jour', {})] });
  reponses.push({ stop_reason: 'end_turn', usage, content: [texte('Voilà.')] });
  const client = fauxClient(reponses);
  const o = { cle: 'k', client };
  let r = await tourAgent({ texte: 'Analyse tout', dossiers: D, contexte: {} }, o);
  let n = 0;
  while (r.appels && n < 20) { r = await tourAgent({ conversation: r.conversation, resultats: r.appels.map((a) => ({ id: a.id, contenu: {} })) }, o); n += 1; }
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
  assert.ok(Math.abs(coutAgentUsd({ cache_read_input_tokens: 1e6 }, 'claude-opus-5-5') - 0.4) < 1e-9);
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

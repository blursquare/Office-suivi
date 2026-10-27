'use strict';
// Carnet de consignes de CLAIRE (CLAIRE.md, étude 18/10) : fonctions pures, routes, refus d'un nom de client, envoi à l'agent masqué.
// Noms, adresses et coordonnées inventés.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const C = require('../src/carnetClaire');
const { tourAgent, viderConversationsAgent } = require('../src/assistantAgent');

const D = [{ id: 'd1', nom: 'FOURNIER / GAUTHIER', parties: [{ nom: 'FOURNIER', prenom: 'Paul' }, { nom: 'GAUTHIER', nomUsage: 'LEROUX', prenom: 'Léa' }] }];

function fauxRepo() {
  const m = new Map();
  return { lireJsonBrut: (k, def) => (m.has(k) ? JSON.parse(m.get(k)) : def), ecrireJsonBrut: (k, v) => { m.set(k, JSON.stringify(v)); } };
}

beforeEach(() => viderConversationsAgent());

test('carnet : texte de départ tant que rien n’est enregistré, versions gardées à chaque écriture', () => {
  const repo = fauxRepo();
  let c = C.lireCarnet(repo);
  assert.equal(c.initial, true);
  assert.match(c.texte, /# CLAIRE\.md/);
  assert.match(c.texte, /## Corrections de l'étude/);
  C.ecrireCarnet(repo, 'A', 'Julie', Date.UTC(2026, 9, 18));
  C.ecrireCarnet(repo, 'B', 'Bastien', Date.UTC(2026, 9, 19));
  c = C.lireCarnet(repo);
  assert.equal(c.texte, 'B');
  assert.equal(c.auteur, 'Bastien');
  assert.equal(c.versions.length, 1, 'le texte de départ jamais enregistré n’est pas une version');
  assert.equal(c.versions[0].texte, 'A');
  for (let i = 0; i < 30; i++) C.ecrireCarnet(repo, 'v' + i, '', Date.now());
  assert.equal(C.lireCarnet(repo).versions.length, 20);
});

test('ajouterConsigne : datée, à la fin de la section des corrections, section créée si elle manque', () => {
  const t = '# Carnet\n\n## Corrections de l\'étude\n- 01/10/2026 : ancienne\n\n## Autre\n- x\n';
  const r = C.ajouterConsigne(t, '  Toujours   dire « Maître »  ', 'Julie', '2026-10-18');
  assert.match(r, /- 01\/10\/2026 : ancienne\n- 18\/10\/2026 \(Julie\) : Toujours dire « Maître »\n/);
  assert.ok(r.indexOf('Toujours') < r.indexOf('## Autre'), 'avant la section suivante');
  const sans = C.ajouterConsigne('# Carnet', 'Règle', '', '2026-10-18');
  assert.match(sans, /## Corrections de l'étude\n- 18\/10\/2026 : Règle\n$/);
  assert.equal(C.ajouterConsigne('X', '   ', 'Julie', '2026-10-18'), 'X');
});

test('motsNominatifs : noms de dossier, de partie, nom d’usage ; jamais un mot de l’étude', () => {
  assert.deepEqual(C.motsNominatifs('Pour Fournier, rappeler Mme Leroux', D).sort(), ['Fournier', 'Leroux']);
  assert.deepEqual(C.motsNominatifs('pour fournier en minuscules', D), [], 'un mot en minuscules part masqué, il n’est pas refusé');
  assert.deepEqual(C.motsNominatifs('Le dossier de vente de Maître GOSSART à Blois, avec Claire', [...D, { nom: 'VTE CLAIRE', parties: [{ nom: 'BLOIS' }] }]), []);
  assert.deepEqual(C.motsNominatifs('Appeler Martin-Gauthier', D), ['Martin-Gauthier']);
});

test('masquerCarnet : commentaires retirés, emails, téléphones et noms des fiches remplacés par des codes de la conversation', () => {
  const table = new Map([['[NOM1]', 'FOURNIER']]);
  const sensibles = new Set(['fournier', 'gauthier']);
  const r = C.masquerCarnet('<!-- note -->\n- Écrire à jean.dupond@exemple.fr ou 02 54 00 00 00 pour Fournier et Gauthier.', sensibles, table);
  assert.doesNotMatch(r, /note|dupond|02 54|Fournier|Gauthier/);
  assert.match(r, /\[NOM1\]/, 'le même nom garde le code déjà donné');
  assert.match(r, /\[EMAIL1\]/);
  assert.match(r, /\[TEL1\]/);
  assert.equal(table.get('[NOM2]'), 'Gauthier');
});

/** Faux client Claude. */
function fauxClient(reponses) {
  const requetes = [];
  return { requetes, beta: { messages: { create: async (req) => { requetes.push(JSON.parse(JSON.stringify(req))); return reponses.shift(); } } } };
}

test('agent : le carnet part dans un second bloc système en cache, masqué ; Mistral le lit dans son premier message', async () => {
  const carnet = '# CLAIRE.md\n- Pour fournier, écrire à paul.fournier@exemple.fr\n- Dire « Mon Cher Maître » au confrère.';
  const client = fauxClient([{ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'Bien noté.' }] }]);
  const r = await tourAgent({ texte: 'Bonjour', dossiers: D, carnet, contexte: { aujourdhui: '2026-10-18' } }, { cle: 'k', client });
  assert.equal(r.reponse, 'Bien noté.');
  const sys = client.requetes[0].system;
  assert.equal(sys.length, 2);
  assert.match(sys[1].text, /Consignes de l'étude \(CLAIRE\.md/);
  assert.match(sys[1].text, /Mon Cher Maître/);
  assert.deepEqual(sys[1].cache_control, { type: 'ephemeral' });
  assert.doesNotMatch(JSON.stringify(client.requetes), /fournier|Fournier/, 'rien de nominatif ne part');
  // Sans carnet : un seul bloc système.
  const client2 = fauxClient([{ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'Oui.' }] }]);
  await tourAgent({ texte: 'Bonjour', contexte: {} }, { cle: 'k', client: client2 });
  assert.equal(client2.requetes[0].system.length, 1);
  // Mistral.
  const corps = [];
  const fetchMistral = async (url, o) => { corps.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ usage: {}, choices: [{ message: { role: 'assistant', content: 'Oui.' }, finish_reason: 'stop' }] }) }; };
  await tourAgent({ texte: 'Bonjour', dossiers: D, carnet, contexte: {} }, { cle: 'k', fournisseur: 'mistral', fetchMistral });
  assert.equal(corps[0].messages[0].role, 'system');
  assert.match(corps[0].messages[0].content, /Mon Cher Maître/);
  assert.doesNotMatch(JSON.stringify(corps), /fournier|Fournier/);
});

test('routes /carnet-claire : lecture, enregistrement, consigne, refus d’un nom de client, version précédente, fichier', async () => {
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const db = ouvrirDb(':memory:');
  const { app, depot } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, authActive: false } });
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  try {
    const base = `http://127.0.0.1:${serveur.address().port}/api`;
    const json = (methode, chemin, corps) => fetch(base + chemin, { method: methode, headers: { 'content-type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
    depot.creer({ id: 'd1', nom: 'FOURNIER / GAUTHIER', parties: [{ nom: 'FOURNIER' }] });
    let r = await (await fetch(base + '/carnet-claire')).json();
    assert.equal(r.initial, true);
    let rep = await json('PUT', '/carnet-claire', { texte: '# Carnet\n- Une règle.', auteur: 'julie' });
    assert.equal(rep.status, 200);
    r = await rep.json();
    assert.equal(r.auteur, 'Julie');
    assert.equal(r.initial, false);
    rep = await json('POST', '/carnet-claire/consigne', { consigne: 'Toujours relire le décompte.', auteur: 'Pirate' });
    r = await rep.json();
    assert.match(r.texte, /## Corrections de l'étude\n- \d\d\/\d\d\/\d{4} : Toujours relire le décompte\./, 'un auteur inconnu n’est pas écrit');
    rep = await json('POST', '/carnet-claire/consigne', { consigne: 'Pour Fournier, appeler le lundi.' });
    assert.equal(rep.status, 400);
    assert.match((await rep.json()).erreur, /Fournier/);
    rep = await json('PUT', '/carnet-claire', { texte: '- Gauthier préfère les emails' });
    assert.equal(rep.status, 400);
    assert.equal((await json('POST', '/carnet-claire/consigne', { consigne: '' })).status, 400);
    assert.equal((await json('PUT', '/carnet-claire', { texte: '   ' })).status, 400, 'jamais un carnet vide');
    r = await (await json('POST', '/carnet-claire/version-precedente', {})).json();
    assert.equal(r.texte, '# Carnet\n- Une règle.');
    const f = await fetch(base + '/carnet-claire/fichier');
    assert.match(f.headers.get('content-disposition') || '', /CLAIRE\.md/);
    assert.equal(await f.text(), '# Carnet\n- Une règle.');
  } finally {
    serveur.close();
  }
});

test('relecture 0.280.0 : petits mots et formes juridiques jamais pris pour un nom ; apostrophe, tiret, civilité, IBAN masqués', () => {
  const dossiers = [{ nom: 'VTE - SCI LES TILLEULS / MARTIN', parties: [{ nom: 'SCI LES TILLEULS' }, { nom: 'MARTIN', prenom: 'Paul' }] }];
  assert.deepEqual(C.motsNominatifs(C.CARNET_INITIAL, dossiers), [], 'le texte de départ reste enregistrable');
  assert.deepEqual(C.motsNominatifs('Pour Paul, chez les notaires', dossiers), [], 'un prénom seul ne désigne personne');
  assert.deepEqual(C.motsNominatifs('Les Tilleuls paient tard', dossiers), ['Tilleuls']);
  const table = new Map();
  const r = C.masquerCarnet("Pour L'HERMITE, voir Monsieur Zorglub et Maître GOSSART ; IBAN FR76 3000 4000 0312 3456 7890 143 ; A 2026 00247.",
    new Set(['hermite']), table);
  assert.doesNotMatch(r, /HERMITE|Zorglub|FR76|00247/);
  assert.match(r, /Maître GOSSART/, 'le nom de l’étude reste lisible');
});

test('modèle d’email proposé par CLAIRE (27/10) : refusé s’il cite un client, enregistré sinon ; un modèle de l’étude n’est pas contrôlé', async () => {
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const db = ouvrirDb(':memory:');
  const { app, depot } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, authActive: false } });
  const serveur = app.listen(0);
  await new Promise((r) => serveur.once('listening', r));
  try {
    const base = `http://127.0.0.1:${serveur.address().port}/api`;
    const post = (corps) => fetch(base + '/modeles-emails/perso', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
    depot.creer({ id: 'd1', nom: 'FOURNIER / GAUTHIER', parties: [{ nom: 'FOURNIER' }, { nom: 'GAUTHIER' }] });
    let rep = await post({ nom: 'Relance diagnostic', sujet: 'Diagnostic', corps: 'Madame Fournier,\n\nMerci.', origine: 'claire' });
    assert.equal(rep.status, 400);
    assert.match((await rep.json()).erreur, /Fournier/);
    rep = await post({ nom: 'Relance diagnostic', sujet: 'Diagnostic — {dossier}', corps: 'Madame, Monsieur,\n\nMerci de nous transmettre le diagnostic.', origine: 'claire', par: 'Bastien ANGLUMENT' });
    assert.equal(rep.status, 201);
    const etat = await (await fetch(base + '/modeles-emails')).json();
    assert.equal(etat.perso.length, 1);
    assert.equal(etat.perso[0].nom, 'Relance diagnostic');
    for (const corps of ['Écrivez à client@exemple.fr.', 'Appelez le 06 12 34 56 78.', 'IBAN FR76 3000 6000 0112 3456 7890 189.']) {
      rep = await post({ nom: 'Coordonnées', corps, origine: 'claire' });
      assert.equal(rep.status, 400, 'coordonnées refusées : ' + corps);
    }
    rep = await post({ nom: 'Mot pour Fournier', corps: 'Texte libre de l’étude.' });
    assert.equal(rep.status, 201, 'un modèle saisi par l’étude dans les Réglages garde sa liberté');
  } finally { serveur.close(); db.close(); }
});

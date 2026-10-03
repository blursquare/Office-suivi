'use strict';
// Modèles d'emails (voir src/modelesEmails.js) : version modifiée d'un modèle d'origine, retour au texte d'origine,
// modèles créés par l'étude ; et réponse courte de l'IA locale (étude 03/10 : « aller à l'essentiel »).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { ouvrirDb } = require('../src/db');
const { creerApp } = require('../src/app');
const { assainirModelesEmails } = require('../src/modelesEmails');
const X = require('../src/envoiEmailsExchange');

test('assainissement : clé d’origine contrôlée, texte vide écarté, nom obligatoire', () => {
  const e = assainirModelesEmails({ modifies: { rib: { sujet: 'RIB\n— {dossier}', corps: 'Texte' }, 'mauvaise clé': { corps: 'x' }, vide: { corps: '  ' } },
    perso: [{ id: 'a', nom: 'Diagnostics', corps: 'Bonjour' }, { id: 'b', nom: '', corps: 'x' }, { id: 'c', nom: 'Sans texte', corps: '' }] });
  assert.deepEqual(Object.keys(e.modifies), ['rib']);
  assert.equal(e.modifies.rib.sujet, 'RIB — {dossier}');
  assert.equal(e.perso.map((m) => m.id).join(), 'a');
});

test('routes : modifier un modèle d’origine, y revenir, créer / modifier / supprimer un modèle de l’étude', async () => {
  const { app } = creerApp({ db: ouvrirDb(':memory:'), config: { authActive: false, racineRepo: os.tmpdir(), estSea: () => false } });
  const serveur = app.listen(0);
  try {
    await new Promise((r) => serveur.once('listening', r));
    const base = `http://127.0.0.1:${serveur.address().port}/api/modeles-emails`;
    const json = (methode, url, corps) => fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
    assert.deepEqual(await (await fetch(base)).json(), { modifies: {}, perso: [] });
    let r = await (await json('PUT', `${base}/integres/rib`, { sujet: 'RIB — {dossier}', corps: 'Bonjour,\n\nVotre RIB.', par: 'Julie VASSELIN' })).json();
    assert.equal(r.modifies.rib.par, 'Julie VASSELIN');
    assert.equal((await json('PUT', `${base}/integres/rib`, { corps: '' })).status, 400);
    r = await (await json('DELETE', `${base}/integres/rib`)).json();
    assert.deepEqual(r.modifies, {});
    const cree = await json('POST', `${base}/perso`, { nom: 'Demande de diagnostics', sujet: 'Diagnostics — {dossier}', corps: 'Bonjour,\n\nMerci de nous adresser les diagnostics.' });
    assert.equal(cree.status, 201);
    const { id } = await cree.json();
    assert.equal((await json('POST', `${base}/perso`, { nom: '', corps: 'x' })).status, 400);
    r = await (await json('PUT', `${base}/perso/${id}`, { nom: 'Diagnostics', sujet: 's', corps: 'Texte' })).json();
    assert.equal(r.perso[0].nom, 'Diagnostics');
    assert.equal((await json('DELETE', `${base}/perso/${id}`)).status, 200);
    assert.equal((await json('DELETE', `${base}/perso/${id}`)).status, 404);
  } finally { serveur.close(); }
});

test('IA locale : consigne « aller à l’essentiel », réponse trop longue refusée, longueur bornée', () => {
  const p = X.promptPropositionReponse({ objet: 'RIB', deNom: 'Camille', texte: 'Voici mon RIB.', confrere: false, pj: ['RIB.pdf'] });
  assert.match(p, /ALLER À L’ESSENTIEL/);
  assert.match(p, /50 mots au plus/);
  assert.equal(X.validerProposition({ reponse: 'Madame, Monsieur,\n\nNous accusons réception de votre RIB.\n\nBien cordialement,' }), null);
  assert.match(X.validerProposition({ reponse: Array(120).fill('mot').join(' ') }), /trop longue/);
  assert.ok(X.LONGUEUR_MAX_PROPOSITION > 0 && X.LONGUEUR_MAX_PROPOSITION <= 300);
});

// CLAIRE dans Authentic (étude 27/10, src/authenticClaire.js, routes/authenticClaire.js) : ce qui ne demande pas de navigateur — le parcours
// lui-même est joué dans Chromium par tests/fumee/authentic-claire.mjs.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/authenticClaire');
const { cibleAuthentic, partiesDemande } = require('../src/routes/authenticClaire');
const X = require('../src/routines/executants');

const fauxRepo = () => { const m = new Map(); return { lireJsonBrut: (k, d) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : d), ecrireJsonBrut: (k, v) => m.set(k, v) }; };

test('libellés jamais cliqués : envoyer, signer, supprimer, virement, intégrer, nouveau dossier… ; Valider et Se connecter permis', () => {
  for (const l of ['Envoyer', 'Envoi immédiat', 'Passer en prêt pour envoi', 'Signer', 'Supprimer', 'Virement', 'Intégrer les données aux fiches clients', 'Nouveau dossier', 'Exporter la recherche', 'Débloquer', 'Réinitialiser la recherche']) assert.ok(A.libelleInterdit(l), l);
  for (const l of ['Valider', 'Se connecter', 'Formalités préalables', 'Ajouter des formalités préalables', 'Retour', 'M. MARTIN Paul']) assert.ok(!A.libelleInterdit(l), l);
});

test('réglages : mot de passe jamais rendu, gardé s’il n’est pas réémis, effacé sur chaîne vide ; adresse hors cloud-fichorga.fr refusée', () => {
  const repo = fauxRepo();
  A.ecrireConnexionAuthentic(repo, { actif: true, identifiant: 'etude', motDePasse: 'secret', adresse: 'https://www.cloud-fichorga.fr/authentic/' });
  let v = A.vueConnexionAuthentic(A.lireConnexionAuthentic(repo));
  assert.equal(JSON.stringify(v).includes('secret'), false);
  assert.equal(v.motDePasseEnregistre, true);
  A.ecrireConnexionAuthentic(repo, { identifiant: 'etude2' });
  assert.equal(A.lireConnexionAuthentic(repo).motDePasse, 'secret', 'gardé');
  A.ecrireConnexionAuthentic(repo, { motDePasse: '' });
  assert.equal(A.lireConnexionAuthentic(repo).motDePasse, '', 'effacé');
  for (const a of ['http://www.cloud-fichorga.fr/', 'https://evil.example/', 'https://x:y@www.cloud-fichorga.fr/']) assert.equal(A.assainirConnexionAuthentic({ adresse: a }).adresse, A.ADRESSE_DEFAUT, a);
});

test('Comedec : naissance pour chaque partie, mariage pour les mariés ; un conjoint qui n’est pas partie, une ligne vide : rien', () => {
  const parties = [{ nom: 'MARTIN', prenom: 'Paul', marie: false }, { nom: 'DURAND', prenom: 'Claire', marie: true }];
  assert.deepEqual(A.demandesComedecIntervenant('M. MARTIN Paul (41000 BLOIS)', parties), ['Naissance']);
  assert.deepEqual(A.demandesComedecIntervenant('Mme DURAND Claire épouse de M. LEROY Marc', parties), ['Naissance', 'Mariage']);
  assert.deepEqual(A.demandesComedecIntervenant('M. LEROY Marc', parties), []);
  assert.deepEqual(A.demandesComedecIntervenant('M. LEROY Marc époux de Mme DURAND Claire', parties), [], 'le nom après « époux de » n’est pas la personne');
  assert.deepEqual(A.demandesComedecIntervenant('', parties), []);
  assert.deepEqual(A.demandesComedecIntervenant('M. MARTIN Jean (null null)', parties), [], 'même nom, autre prénom');
});

test('liens des fiches lus dans la page du dossier : comparants puis immeubles', () => {
  const t = 'A 2026 00500 VTE MARTIN / DURAND\nComparants (2)\nperson\nM. MARTIN Paul\nVendeur\nperson\nMme DURAND Claire\nAcquéreur\nImmeubles (1)\n41000 BLOIS, 2 rue des Lices\nImmeuble vendu\nTiers (0)\n2 - VTE MARTIN / DURAND';
  const l = A.liensFichesDuTexte(t);
  assert.equal(l.comparants.join('|'), 'M. MARTIN Paul|Mme DURAND Claire');
  assert.equal(l.immeubles.join('|'), '41000 BLOIS, 2 rue des Lices');
});

test('cible dans Authentic : référence retenue et libellé « VTE NOM / NOM » ; parties propres', () => {
  assert.deepEqual(cibleAuthentic({ referenceAuthentic: 'A 2026 00500', nom: 'MARTIN / DURAND' }), { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' });
  assert.equal(cibleAuthentic({ intitulesAuthentic: ['2 - VTE MARTIN / DURAND'] }).libelle, 'VTE MARTIN / DURAND');
  assert.equal(partiesDemande([{ nom: 'A', marie: 1 }, { nom: '' }, 'x']).length, 1);
});

test('routine : Comedec proposée une fois pour un dossier relié à Authentic, CJN à 30 jours de la signature quand l’étude reçoit l’acte ; rien sans la connexion', () => {
  const d = { id: 'd1', nom: 'MARTIN / DURAND', responsable: 'Julie VASSELIN', referenceAuthentic: 'A 2026 00500', rendezVousSignature: '2026-11-15',
    parties: [{ role: 'VENDEUR', nom: 'MARTIN' }, { role: 'ACQUEREUR', nom: 'DURAND' }] };
  assert.equal(X.formalitesAuthentic([d], '2026-10-27', { niveau: () => 1 }).length, 0, 'connexion éteinte');
  const p = X.formalitesAuthentic([d], '2026-10-27', { niveau: () => 1, authenticActif: true });
  assert.deepEqual(p.map((x) => x.details.formalite).sort(), ['cjn', 'comedec']);
  assert.ok(p.every((x) => x.type === 'tache' && x.routine === 'formalites-authentic'));
  assert.equal(X.formalitesAuthentic([Object.assign({}, d, { rendezVousSignature: '2026-12-31' })], '2026-10-27', { authenticActif: true }).map((x) => x.details.formalite).join(), 'comedec', 'signature lointaine : pas encore de CJN');
  assert.equal(X.formalitesAuthentic([Object.assign({}, d, { roleNotaire: 'participant' })], '2026-10-27', { authenticActif: true }).map((x) => x.details.formalite).join(), 'comedec', 'participation : le notaire qui reçoit l’acte fait le CJN');
  assert.equal(X.formalitesAuthentic([Object.assign({}, d, { referenceAuthentic: '' })], '2026-10-27', { authenticActif: true }).length, 0, 'pas relié à Authentic');
  assert.equal(X.formalitesAuthentic([Object.assign({}, d, { authentic: { etatsCivils: [{ etat: 'positif' }] } })], '2026-10-27', { authenticActif: true }).map((x) => x.details.formalite).join(), 'cjn', 'état civil déjà demandé');
});

test('routes : réglages réservés à l’administrateur, mot de passe jamais rendu ; rien ne se lance connexion éteinte', async () => {
  const os = require('node:os');
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' } });
  const jeton = gestionnaireAuth.creerSession();
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const appel = (chemin, methode, corps) => fetch(base + chemin, { method: methode || 'GET', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
  try {
    assert.equal((await appel('/api/authentic-claire/reglages', 'PUT', { auteur: 'Julie VASSELIN', identifiant: 'x' })).status, 403);
    const r = await appel('/api/authentic-claire/reglages', 'PUT', { auteur: 'Bastien ANGLUMENT', actif: false, identifiant: 'etude', motDePasse: 'secret' });
    assert.equal(r.status, 200);
    const lu = await (await appel('/api/authentic-claire/reglages')).text();
    assert.ok(!lu.includes('secret') && lu.includes('"motDePasseEnregistre":true'));
    const essai = await appel('/api/authentic-claire/essai', 'POST', {});
    assert.equal(essai.status, 409, 'connexion éteinte : rien ne se lance');
    assert.equal((await appel('/api/authentic-claire/formalite', 'POST', { type: 'envoyer', auteur: 'Bastien ANGLUMENT', dossierId: 'x' })).status, 400);
  } finally { s.close(); db.close(); }
});

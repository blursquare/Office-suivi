'use strict';

// L'ordinateur virtuel de CLAIRE (src/posteClaire.js, routes/posteClaire.js) : ce que son poste n'a pas le droit de faire (réglages, envois,
// Exchange, Yousign, Teams…), son cookie secret, les demandes de validation à Bastien, le lancement paresseux de la fenêtre.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { creerPosteClaire, routeInterditePosteClaire, jetonDuCookie, NOM_COOKIE_POSTE_CLAIRE } = require('../src/posteClaire');

test('le poste de CLAIRE : réglages, envois, agenda, Yousign, Teams, mise à jour refusés ; dossiers et agent permis', () => {
  const non = (m, c) => assert.equal(routeInterditePosteClaire(m, c), true, `${m} ${c} doit être refusé`);
  const oui = (m, c) => assert.equal(routeInterditePosteClaire(m, c), false, `${m} ${c} doit être permis`);
  non('GET', '/api/reglages'); non('PUT', '/api/reglages'); non('POST', '/api/reglages/tester-email');
  non('POST', '/api/emails/envoyer'); non('POST', '/api/exchange/rendez-vous'); non('PUT', '/api/exchange/evenement/notes');
  non('POST', '/api/yousign/appel'); non('POST', '/api/signature-rib/agent'); non('POST', '/api/notifications/pieces');
  non('POST', '/api/mise-a-jour/installer'); non('POST', '/api/sauvegarde/restaurer'); non('POST', '/api/relais-word/repondre');
  non('PUT', '/api/carnet-claire'); non('POST', '/api/canaux/general/messages'); non('POST', '/api/poste-claire/travail');
  non('POST', '/api/propositions/p1/decision'); non('GET', '/api/comptes-collaborateurs');
  oui('GET', '/api/dossiers'); oui('PUT', '/api/dossiers/d1'); oui('POST', '/api/assistant/agent'); oui('GET', '/api/canaux');
  oui('POST', '/api/poste-claire/demande'); oui('GET', '/api/poste-claire/demande/val-1');
  // Audit 27/10 : casse et barre finale (Express ne les distingue pas), liste blanche des écritures.
  non('PUT', '/api/Reglages'); non('POST', '/api/emails/envoyer/'); non('POST', '/api/Emails/Envoyer'); non('POST', '/api/propositions/x/decision/');
  non('POST', '/api/%72eglages'); non('PUT', '/api/relecture-claude/reglages'); non('PUT', '/api/scans/reglages'); non('POST', '/api/rangement-outlook/ranger');
  non('DELETE', '/api/dossiers/d1'); non('DELETE', '/api/repertoire/r1'); non('POST', '/api/repertoire/themes'); non('PUT', '/api/preferences');
  non('POST', '/api/claire-messages'); non('GET', '/api/claire-messages?utilisateur=x'); non('POST', '/api/modeles-emails');
  oui('POST', '/api/repertoire'); oui('POST', '/api/rappels-perso'); oui('POST', '/api/nas/explorer/renommer'); oui('POST', '/api/login');
  oui('POST', '/api/navigation/plan-cadastre'); oui('POST', '/api/journal-technique');
  oui('POST', '/api/scans/annuler'); oui('POST', '/api/scans/ecarter'); oui('POST', '/api/urbanisme/plan-aerien/p1/ranger'); oui('POST', '/api/navigation/taches/t1/annuler');
});

test('le cookie du poste est lu dans l’en-tête Cookie', () => {
  assert.equal(jetonDuCookie(`a=1; ${NOM_COOKIE_POSTE_CLAIRE}=abc123; b=2`), 'abc123');
  assert.equal(jetonDuCookie('a=1'), '');
  assert.equal(jetonDuCookie(undefined), '');
});

test('la fenêtre n’est lancée qu’au premier travail, un seul à la fois, et arrêtée ensuite', async () => {
  const appels = [];
  let arrets = 0;
  const cdp = { ecouter() {}, async envoyer(m, p) {
    appels.push(m);
    if (m === 'Target.createTarget') return { targetId: 't1' };
    if (m === 'Target.attachToTarget') return { sessionId: 's1' };
    if (m === 'Runtime.evaluate') return { result: { value: /^travaillerPosteClaire/.test(p.expression) ? 'compte rendu' : true } };
    return {};
  } };
  const poste = creerPosteClaire({ adresse: 'http://127.0.0.1:9', profil: os.tmpdir() + '/poste-claire-test', lancer: async () => ({ cdp, async arreter() { arrets++; } }) });
  assert.equal(poste.etat().ouvert, false);
  const r = await poste.travailler('prépare quelque chose');
  assert.equal(r, 'compte rendu');
  assert.equal(poste.etat().ouvert, true);
  assert.ok(appels.includes('Network.setCookie'), 'le cookie secret est posé');
  assert.ok(appels.includes('Page.navigate'));
  await poste.arreter();
  assert.equal(arrets, 1);
  assert.equal(poste.etat().ouvert, false);
});

test('le jeton du poste est secret : seul le bon jeton est reconnu', () => {
  const poste = creerPosteClaire({ adresse: 'http://127.0.0.1:9', profil: os.tmpdir() + '/pc2', lancer: async () => { throw new Error('non'); } });
  assert.equal(poste.estPosteClaire(poste.jeton()), true);
  assert.equal(poste.estPosteClaire('autre'), false);
  assert.equal(poste.estPosteClaire(''), false);
});

let db, serveurApp, baseUrl, jeton, gestion, posteInjecte, parametresRepo;
before(async () => {
  db = ouvrirDb(':memory:');
  posteInjecte = creerPosteClaire({ adresse: 'http://127.0.0.1:9', profil: os.tmpdir() + '/pc3', lancer: async () => { throw new Error('pas de navigateur'); } });
  const { app, gestionnaireAuth, parametresRepo: repoApp } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' }, posteClaire: posteInjecte });
  gestion = gestionnaireAuth;
  parametresRepo = repoApp;
  jeton = gestion.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});
after(() => { serveurApp.close(); db.close(); });

const appeler = (chemin, options, cookie) => fetch(`${baseUrl}${chemin}`, { ...options, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options && options.headers) } });

test('le poste de CLAIRE reçoit un 403 sur les réglages, un collaborateur non', async () => {
  const cookie = `${NOM_COOKIE_POSTE_CLAIRE}=${posteInjecte.jeton()}`;
  assert.equal((await appeler('/api/reglages', {}, cookie)).status, 403);
  assert.notEqual((await appeler('/api/reglages', {})).status, 403);
  assert.equal((await appeler('/api/emails/envoyer', { method: 'POST', body: '{}' }, cookie)).status, 403);
});

test('une demande de validation devient une proposition pour Bastien, décidée par lui seul', async () => {
  const cookie = `${NOM_COOKIE_POSTE_CLAIRE}=${posteInjecte.jeton()}`;
  // Un collaborateur ne peut pas poser de demande au nom de CLAIRE.
  assert.equal((await appeler('/api/poste-claire/demande', { method: 'POST', body: JSON.stringify({ description: 'x' }) })).status, 403);
  const r = await appeler('/api/poste-claire/demande', { method: 'POST', body: JSON.stringify({ description: 'Cocher la pièce « RIB »\ndossier DUPONT' }) }, cookie);
  assert.equal(r.status, 200);
  const { id } = await r.json();
  assert.match(id, /^val-/);
  assert.equal((await (await appeler(`/api/poste-claire/demande/${id}`, {}, cookie)).json()).etat, 'proposee');
  // Elle ne peut pas se valider elle-même.
  assert.equal((await appeler(`/api/propositions/${id}/decision`, { method: 'POST', body: JSON.stringify({ auteur: 'Bastien ANGLUMENT', decision: 'acceptee' }) }, cookie)).status, 403);
  // Bastien la voit dans sa boîte et l'autorise.
  const boite = await (await appeler('/api/propositions?utilisateur=' + encodeURIComponent('Bastien ANGLUMENT') + '&etat=a-traiter')).json();
  assert.ok(boite.propositions.some((p) => p.id === id && p.type === 'validation'));
  const d = await appeler(`/api/propositions/${id}/decision`, { method: 'POST', body: JSON.stringify({ auteur: 'Bastien ANGLUMENT', decision: 'acceptee' }) });
  assert.equal(d.status, 200);
  assert.equal((await (await appeler(`/api/poste-claire/demande/${id}`, {}, cookie)).json()).etat, 'acceptee');
});

test('une demande de validation sans réponse expire au bout de 8 minutes : un « Autoriser » tardif le dit, CLAIRE n’agit pas', async () => {
  const { validationAbandonnee, MINUTES_VALIDATION_POSTE_CLAIRE, lirePropositions, ecrirePropositions } = require('../src/routines/propositions');
  const base = { type: 'validation', routine: 'poste-claire', etat: 'proposee', creeLe: '2026-10-27T09:00:00.000Z' };
  assert.equal(MINUTES_VALIDATION_POSTE_CLAIRE, 8);
  assert.equal(validationAbandonnee(base, new Date('2026-10-27T09:07:59Z')), false);
  assert.equal(validationAbandonnee(base, new Date('2026-10-27T09:08:00Z')), true);
  assert.equal(validationAbandonnee(Object.assign({}, base, { etat: 'acceptee' }), new Date('2026-10-27T10:00:00Z')), false, 'décidée : rien ne change');
  assert.equal(validationAbandonnee(Object.assign({}, base, { routine: 'revue-matin', type: 'tache' }), new Date('2026-10-27T10:00:00Z')), false, 'une autre proposition garde ses 30 jours');
  const cookie = `${NOM_COOKIE_POSTE_CLAIRE}=${posteInjecte.jeton()}`;
  const { id } = await (await appeler('/api/poste-claire/demande', { method: 'POST', body: JSON.stringify({ description: 'Renommer un fichier' }) }, cookie)).json();
  // Vieillir la demande de 9 minutes.
  const liste = lirePropositions(parametresRepo).map((p) => p.id === id ? Object.assign({}, p, { creeLe: new Date(Date.now() - 9 * 60000).toISOString() }) : p);
  ecrirePropositions(parametresRepo, liste);
  const d = await (await appeler(`/api/propositions/${id}/decision`, { method: 'POST', body: JSON.stringify({ auteur: 'Bastien ANGLUMENT', decision: 'acceptee' }) })).json();
  assert.equal(d.dejaTraitee, true);
  assert.equal(d.proposition.etat, 'expiree');
  assert.equal((await (await appeler(`/api/poste-claire/demande/${id}`, {}, cookie)).json()).etat, 'expiree');
  const boite = await (await appeler('/api/propositions?utilisateur=' + encodeURIComponent('Bastien ANGLUMENT') + '&etat=a-traiter')).json();
  assert.ok(!boite.propositions.some((p) => p.id === id), 'plus « à décider »');
});

test('un travail confié part en arrière-plan : réponse immédiate, puis « non terminé » sans navigateur, et le demandeur est prévenu', async () => {
  const B0 = 'Bastien ANGLUMENT';
  assert.equal((await appeler('/api/poste-claire/travail', { method: 'POST', body: JSON.stringify({ consigne: '', demandeur: B0 }) })).status, 400);
  assert.equal((await appeler('/api/poste-claire/travail', { method: 'POST', body: JSON.stringify({ consigne: 'x', demandeur: 'Inconnu' }) })).status, 400);
  const r = await appeler('/api/poste-claire/travail', { method: 'POST', body: JSON.stringify({ consigne: 'fais quelque chose', demandeur: B0 }) });
  assert.equal(r.status, 202);
  const { id } = await r.json();
  let t;
  for (let i = 0; i < 50; i++) {
    t = ((await (await appeler('/api/poste-claire/travaux?utilisateur=' + encodeURIComponent(B0))).json()).travaux || []).find((x) => x.id === id);
    if (t && t.etat !== 'attente' && t.etat !== 'en-cours') break;
    await new Promise((ok) => setTimeout(ok, 50));
  }
  assert.equal(t.etat, 'erreur');
  assert.match(t.erreur, /navigateur/);
  const boite = await (await appeler('/api/claire-messages?utilisateur=' + encodeURIComponent(B0))).json();
  assert.ok(boite.messages.some((m) => /Travail non terminé/.test(m.court) && m.sorte === 'travail'), 'le demandeur est prévenu dans la conversation de CLAIRE');
  // Julie ne voit pas les travaux de Bastien.
  const julie = await (await appeler('/api/poste-claire/travaux?utilisateur=' + encodeURIComponent('Julie VASSELIN'))).json();
  assert.ok(!julie.travaux.some((x) => x.id === id));
});

test('file des travaux : un à la fois, dans l’ordre, annulation avant le début seulement, redémarrage pendant un travail', async () => {
  const { creerFileTravaux, CLE_TRAVAUX } = require('../src/travauxClaire');
  const memoire = {};
  const repo = { lireJsonBrut: (c, d) => (c in memoire ? JSON.parse(memoire[c]) : d), ecrireJsonBrut: (c, v) => { memoire[c] = JSON.stringify(v); } };
  const ordre = [];
  let enCours = 0, maxEnCours = 0;
  const poste = { async travailler(c) { enCours++; maxEnCours = Math.max(maxEnCours, enCours); ordre.push(c); await new Promise((ok) => setTimeout(ok, 20)); enCours--; return 'fait : ' + c; } };
  const deposes = [];
  const file = creerFileTravaux({ repo, poste, deposer: (p) => deposes.push(p) });
  file.confier('un', 'Bastien ANGLUMENT');
  file.confier('deux', 'Bastien ANGLUMENT');
  const trois = file.confier('trois', 'Julie VASSELIN').travail;
  assert.equal(file.annuler(trois.id, 'Bastien ANGLUMENT', false).erreur, 403, 'pas le travail de Bastien');
  assert.ok(file.annuler(trois.id, 'Julie VASSELIN', false).travail);
  await new Promise((ok) => setTimeout(ok, 200));
  assert.equal(ordre.join(','), 'un,deux');
  assert.equal(maxEnCours, 1, 'un seul travail à la fois');
  assert.equal(deposes.length, 2);
  assert.match(deposes[0].titre, /^Travail terminé : un/);
  // Un travail « en cours » au redémarrage : noté interrompu, jamais refait seul.
  memoire[CLE_TRAVAUX] = JSON.stringify([{ id: 'tr-x', consigne: 'coupé', demandeur: 'Bastien ANGLUMENT', etat: 'en-cours' }]);
  const file2 = creerFileTravaux({ repo, poste, deposer: () => {} });
  assert.equal(file2.lister('Bastien ANGLUMENT', false)[0].etat, 'erreur');
});

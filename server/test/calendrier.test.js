'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { genererFluxIcs } = require('../src/routes/calendrier');

// ---- genererFluxIcs() : fonction pure, testée directement sans monter de serveur ----

test('genererFluxIcs : un dossier actif avec les cinq échéances fixes produit cinq VEVENT', () => {
  const body = genererFluxIcs([
    {
      id: 'd1', nom: 'DUPONT / MARTIN', pret: '2026-11-11', appelFonds: '2026-11-20',
      acte: '2026-12-01', rendezVousSignature: '2026-12-01', ventebien: '2026-10-05'
    }
  ]);
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, /UID:d1-pret@claire-calendrier/);
  assert.match(body, /UID:d1-appelFonds@claire-calendrier/);
  assert.match(body, /UID:d1-acte@claire-calendrier/);
  assert.match(body, /UID:d1-rendezVousSignature@claire-calendrier/);
  assert.match(body, /UID:d1-ventebien@claire-calendrier/);
  assert.match(body, /Obtention du prêt — MARTIN - Dossier DUPONT \/ MARTIN/);
  assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, 5);
});

// Un client calendrier ne supprime PAS un événement qui disparaît du flux : il faut publier son
// annulation. Omettre l'événement — ce que faisait la version précédente — laissait une échéance
// périmée affichée indéfiniment chez l'étude.

test('genererFluxIcs : un dossier archivé voit ses échéances ANNULÉES, pas omises', () => {
  const body = genererFluxIcs([{ id: 'd1', nom: 'X / Y', archive: true, pret: '2026-11-11' }]);
  assert.match(body, /UID:d1-pret@claire-calendrier/);
  assert.match(body, /STATUS:CANCELLED/);
  assert.doesNotMatch(body, /STATUS:CONFIRMED/);
});

test('genererFluxIcs : une échéance sans date est ANNULÉE, pas omise', () => {
  const body = genererFluxIcs([{ id: 'd1', nom: 'X / Y', pret: '', acte: null, ventebien: undefined }]);
  for (const cle of ['pret', 'appelFonds', 'acte', 'rendezVousSignature', 'ventebien']) {
    assert.match(body, new RegExp(`UID:d1-${cle}@claire-calendrier`), cle);
  }
  assert.equal((body.match(/STATUS:CANCELLED/g) || []).length, 5);
});

test('genererFluxIcs : chaque événement porte un SEQUENCE croissant avec la modification', () => {
  // Sans SEQUENCE, un client ne remplace jamais un événement qu'il connaît déjà : une date butoir
  // corrigée dans CLAIRE n'arrivait donc jamais dans Outlook.
  const dossier = (maj, pret) => ({ id: 'd1', nom: 'X / Y', pret, updatedAt: maj });
  const avant = genererFluxIcs([dossier(Date.UTC(2026, 8, 1), '2026-11-11')]);
  const apres = genererFluxIcs([dossier(Date.UTC(2026, 8, 18), '2026-12-01')]);
  const seq = (body) => Number(/SEQUENCE:(\d+)/.exec(body)[1]);
  assert.ok(seq(apres) > seq(avant), `${seq(apres)} doit dépasser ${seq(avant)}`);
  assert.match(apres, /DTSTART;VALUE=DATE:20261201/);
});

test('sequenceDepuisMaj reste un entier raisonnable et croissant', () => {
  const { sequenceDepuisMaj } = require('../src/routes/calendrier.js');
  const a = sequenceDepuisMaj(Date.UTC(2026, 0, 1));
  const b = sequenceDepuisMaj(Date.UTC(2026, 0, 2));
  assert.ok(b > a);
  // Doit tenir dans un entier 32 bits, que tous les clients acceptent.
  assert.ok(b < 2147483647, String(b));
  // Un horodatage absent ou invalide ne doit pas produire NaN dans le flux.
  assert.equal(sequenceDepuisMaj(undefined), 0);
  assert.equal(sequenceDepuisMaj('abc'), 0);
});

test('genererFluxIcs : inclut les échéances personnalisées (d.autres)', () => {
  const body = genererFluxIcs([
    { id: 'd1', nom: 'X / Y', autres: [{ label: 'Levée hypothèque', date: '2026-09-30' }] }
  ]);
  assert.match(body, /UID:d1-autre-0@claire-calendrier/);
  assert.match(body, /SUMMARY:Levée hypothèque — Y - Dossier X \/ Y/);
});

test('genererFluxIcs : dossier sans "/" dans le nom retombe sur le nom complet', () => {
  const body = genererFluxIcs([{ id: 'd1', nom: 'UN SEUL NOM', pret: '2026-11-11' }]);
  assert.match(body, /Obtention du prêt — UN SEUL NOM - Dossier UN SEUL NOM/);
});

// ---- Route GET /calendrier.ics : jeton dédié, hors du mot de passe de session ----

const JETON_CALENDRIER = 'jeton-calendrier-test';

function config(jetonCalendrier) {
  return {
    motDePasse: 'mdp-test',
    racineRepo: os.tmpdir(),
    port: 0,
    jetonCalendrier
  };
}

let db, serveur, baseUrl;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, depot } = creerApp({ db, config: config(JETON_CALENDRIER) });
  depot.creer({ id: 'd-cal-1', nom: 'DUPONT / MARTIN', pret: '2026-11-11' });
  serveur = app.listen(0);
  await new Promise((resolve) => serveur.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => {
  serveur.close();
  db.close();
});

test('GET /calendrier.ics sans jeton renvoie 403 (jamais le contenu du registre)', async () => {
  const reponse = await fetch(`${baseUrl}/calendrier.ics`);
  assert.equal(reponse.status, 403);
});

test('GET /calendrier.ics avec un mauvais jeton renvoie 403', async () => {
  const reponse = await fetch(`${baseUrl}/calendrier.ics?token=nimportequoi`);
  assert.equal(reponse.status, 403);
});

test('GET /calendrier.ics avec le bon jeton renvoie le flux ICS, sans authentification de session', async () => {
  // Volontairement AUCUN en-tête Authorization ici : c'est tout le point de cette route, un
  // client webcal ne peut pas en envoyer.
  const reponse = await fetch(`${baseUrl}/calendrier.ics?token=${JETON_CALENDRIER}`);
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('content-type') || '', /text\/calendar/);
  const corps = await reponse.text();
  assert.match(corps, /BEGIN:VCALENDAR/);
  assert.match(corps, /UID:d-cal-1-pret@claire-calendrier/);
});

test('GET /calendrier.ics renvoie 503 quand aucun jeton n\'est configuré sur le serveur', async () => {
  const db2 = ouvrirDb(':memory:');
  const { app: app2 } = creerApp({ db: db2, config: config('') });
  const serveur2 = app2.listen(0);
  await new Promise((resolve) => serveur2.once('listening', resolve));
  const baseUrl2 = `http://127.0.0.1:${serveur2.address().port}`;

  const reponse = await fetch(`${baseUrl2}/calendrier.ics?token=peu-importe`);
  assert.equal(reponse.status, 503);

  serveur2.close();
  db2.close();
});

// --- Conformité du .ics produit (RFC 5545) ---
//
// Symptôme qui a motivé ces tests : Outlook n'affichait que « deux trois dates » du flux, puis plus
// rien. Un fichier .ics devenu invalide en cours de route est abandonné par le lecteur à cet
// endroit — le reste du portefeuille disparaît sans le moindre message d'erreur. Trois défauts se
// cumulaient, chacun capable à lui seul de provoquer ça ; ces tests les verrouillent.

const { echapperTexteIcs, plierLigneIcs } = require('../src/routes/calendrier');

const ANTISLASH = String.fromCharCode(92);

// Un dossier au nom long ET ponctué : les deux pièges à la fois.
const DOSSIERS_PIEGES = [
  {
    id: 'x1',
    nom: 'BOURGUEIL & BOUSSELET / CHARPENTIER, Jean & GENESTOUX',
    updatedAt: Date.now(),
    pret: '2026-09-09',
    acte: '',                       // absente → publiée ANNULÉE
    ventebien: '2026-08-01',
    autres: [{ label: 'Levée; option', date: '2026-09-30' }]
  }
];

test('flux .ics : aucune ligne ne dépasse 75 octets (RFC 5545 §3.1)', () => {
  const lignes = genererFluxIcs(DOSSIERS_PIEGES).split('\r\n');
  const trop = lignes.filter((l) => Buffer.byteLength(l, 'utf8') > 75);
  assert.deepEqual(trop, [], `lignes non repliées : ${trop.join(' | ')}`);
});

// METHOD est une propriété du CALENDRIER (§3.7.2), jamais d'un VEVENT, et n'a de sens que dans un
// message d'invitation iTIP — pas dans un flux publié. C'est STATUS:CANCELLED, juste au-dessus, qui
// annule un événement ici.
test('flux .ics : aucun METHOD à l\'intérieur d\'un VEVENT', () => {
  const flux = genererFluxIcs(DOSSIERS_PIEGES);
  assert.ok(!/^METHOD:/m.test(flux), 'un METHOD subsiste dans le flux');
  assert.ok(flux.includes('STATUS:CANCELLED'), "l'annulation doit rester publiée");
});

test('flux .ics : virgules et points-virgules des titres sont échappés (§3.3.11)', () => {
  const flux = genererFluxIcs(DOSSIERS_PIEGES);
  // Le flux est replié : on reconstitue les lignes logiques avant d'inspecter les titres.
  const deplie = flux.replace(/\r\n /g, '');
  const titres = deplie.split('\r\n').filter((l) => l.startsWith('SUMMARY:'));
  assert.ok(titres.length > 0);
  for (const t of titres) {
    const valeur = t.slice('SUMMARY:'.length);
    assert.ok(!/(^|[^\\]),/.test(valeur), `virgule non échappée : ${t}`);
    assert.ok(!/(^|[^\\]);/.test(valeur), `point-virgule non échappé : ${t}`);
  }
  assert.ok(deplie.includes('Levée' + ANTISLASH + '; option'), "le point-virgule d'une échéance personnalisée doit être échappé");
});

// Le repli se fait par point de code : couper un « é » en deux produirait de l'UTF-8 invalide, ce
// qu'aucun test de longueur seul ne détecterait.
test('plierLigneIcs : ne coupe jamais au milieu d\'un caractère accentué', () => {
  const ligne = 'SUMMARY:' + 'é'.repeat(90);
  const plie = plierLigneIcs(ligne);
  for (const morceau of plie.split('\r\n')) {
    assert.ok(Buffer.byteLength(morceau, 'utf8') <= 75);
  }
  // Déplié, on doit retrouver exactement la ligne d'origine.
  assert.equal(plie.replace(/\r\n /g, ''), ligne);
});

test('plierLigneIcs : une ligne courte est rendue telle quelle', () => {
  assert.equal(plierLigneIcs('STATUS:CONFIRMED'), 'STATUS:CONFIRMED');
});

test('echapperTexteIcs : antislash, point-virgule, virgule et saut de ligne', () => {
  const attendu = 'a' + ANTISLASH + ANTISLASH + 'b'
    + ANTISLASH + ';c' + ANTISLASH + ',d' + ANTISLASH + 'ne';
  assert.equal(echapperTexteIcs('a' + ANTISLASH + 'b;c,d\ne'), attendu);
  assert.equal(echapperTexteIcs(null), '');
});

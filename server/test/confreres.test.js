'use strict';

// Carnet des confrères (voir src/carnetConfreres.js, src/routes/confreres.js) : partagé en base,
// parti du relevé de l'annuaire du 41, complété office par office.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirOffice, assainirCarnet, carnetInitial, avecOfficeEtude, CARNET_INITIAL_41, ID_OFFICE_ETUDE } = require('../src/carnetConfreres');

let db, serveurApp, baseUrl, jeton;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'm', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' } });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((r) => serveurApp.once('listening', r));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => { serveurApp.close(); db.close(); });

const appeler = (chemin, methode, corps) => fetch(`${baseUrl}${chemin}`, {
  method: methode || 'GET',
  headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
  body: corps ? JSON.stringify(corps) : undefined
});

test('carnet initial : notre office en tête, puis les 35 offices du 41, identifiants uniques', () => {
  const carnet = carnetInitial();
  assert.equal(CARNET_INITIAL_41.length, 35);
  assert.equal(carnet.length, 36);
  assert.equal(carnet[0].id, ID_OFFICE_ETUDE);
  assert.equal(carnet[0].etude, true);
  assert.equal(carnet[0].email, 'office.gossart@notaires.fr');
  assert.ok(carnet.every((o) => o.notaires.length && o.codePostal.startsWith('41') && o.source));
  assert.equal(carnet.filter((o) => /GOSSART/i.test(o.office + o.notaires.join(' '))).length, 1);
  assert.ok(carnet.slice(1).every((o) => o.etude === false));
  assert.equal(new Set(carnet.map((o) => o.id)).size, carnet.length);
});

test('avecOfficeEtude : remet notre office s’il manque, ne le double jamais', () => {
  const r = avecOfficeEtude([{ id: 'x', office: 'X', notaires: ['A B'] }]);
  assert.equal(r.ajoute, true);
  assert.equal(r.carnet.map((o) => o.id).join(), ID_OFFICE_ETUDE + ',x');
  assert.equal(avecOfficeEtude(r.carnet).ajoute, false);
  // Un office quelconque ne peut pas se déclarer « notre office ».
  assert.equal(assainirOffice({ id: 'y', office: 'Y', etude: true }).etude, false);
});

test('assainirOffice : liste blanche, email invalide vidé, office vide refusé', () => {
  const o = assainirOffice({ id: 'c-1', office: '  SCP  DURAND ', notaires: ['Paul DURAND', 'Paul DURAND', 3], email: 'pas un email', codePostal: '4500', pirate: 'x' });
  assert.equal(o.office, 'SCP DURAND');
  assert.equal(o.notaires.join('|'), 'Paul DURAND');
  assert.equal(o.email, '');
  assert.equal(o.codePostal, '');
  assert.equal('pirate' in o, false);
  assert.equal(assainirOffice({ id: 'c-2', office: '', notaires: [] }), null);
  assert.equal(assainirOffice({ id: '../x', office: 'X' }), null);
  assert.equal(assainirCarnet([{ id: 'a', office: 'A' }, { id: 'a', office: 'B' }]).map((x) => x.office).join(), 'B');
});

test('GET part du relevé du 41 ; POST ajoute puis corrige un office ; DELETE le retire', async () => {
  let r = await appeler('/api/confreres');
  assert.equal(r.status, 200);
  let j = await r.json();
  assert.equal(j.offices.length, 36);

  const nouveau = { id: 'saisie-1', office: 'SELARL Paul DURAND', notaires: ['Paul DURAND'], email: 'office.durand@notaires.fr', ville: 'Orléans', codePostal: '45000' };
  r = await appeler('/api/confreres', 'POST', { office: nouveau });
  j = await r.json();
  assert.equal(j.offices.length, 37);
  assert.ok(j.offices.find((o) => o.id === 'saisie-1').modifieLe);

  r = await appeler('/api/confreres', 'POST', { office: Object.assign({}, nouveau, { telephone: '02 38 00 00 00' }) });
  j = await r.json();
  assert.equal(j.offices.length, 37);
  assert.equal(j.offices.find((o) => o.id === 'saisie-1').telephone, '02 38 00 00 00');

  r = await appeler('/api/confreres', 'POST', { office: { id: 'x', office: '' } });
  assert.equal(r.status, 400);

  r = await appeler('/api/confreres/saisie-1', 'DELETE');
  j = await r.json();
  assert.equal(j.offices.length, 36);
  // Notre office ne se retire pas.
  r = await appeler('/api/confreres/' + ID_OFFICE_ETUDE, 'DELETE');
  assert.equal(r.status, 400);
  // Un carnet vidé à la main garde seulement notre office : le relevé n'est rechargé que si la
  // clé disparaît.
  for (const o of j.offices) await appeler('/api/confreres/' + o.id, 'DELETE');
  j = await (await appeler('/api/confreres')).json();
  assert.equal(j.offices.map((o) => o.id).join(), ID_OFFICE_ETUDE);
});

// ---- Répertoire (src/repertoire.js) : les autres interlocuteurs de l'étude, par thème ----
const { repertoireInitial, assainirContact, THEMES_REPERTOIRE, REPERTOIRE_INITIAL } = require('../src/repertoire');

test('répertoire initial : identifiants uniques, chaque contact dans un thème connu, emails bien formés', () => {
  const contacts = repertoireInitial();
  assert.equal(contacts.length, REPERTOIRE_INITIAL.length);
  const themes = new Set(THEMES_REPERTOIRE.map((t) => t.cle));
  assert.ok(contacts.every((c) => themes.has(c.theme) && (c.organisme || c.personnes.length) && c.source));
  // Chaque email (après son éventuel libellé « … : ») est une adresse, jamais un reste de code
  // de fusion Genapi.
  const adresses = contacts.flatMap((c) => c.emails.map((e) => e.split(' : ').pop()));
  assert.ok(adresses.every((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)), adresses.find((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)));
  const valeurs = contacts.flatMap((c) => Object.values(c).flat()).filter((v) => typeof v === 'string');
  assert.ok(!valeurs.some((v) => /[{}]/.test(v)), 'code de fusion resté dans une fiche');
});

test('assainirContact : liste blanche, thème inconnu rangé en divers, lien non http retiré', () => {
  const c = assainirContact({ id: 'x-1', theme: 'inconnu', organisme: '  Banque  Test ', telephones: ['01 02 03 04 05', ''], liens: ['javascript:alert(1)', 'https://exemple.fr'], pirate: 1 });
  assert.equal(c.theme, 'divers');
  assert.equal(c.organisme, 'Banque Test');
  assert.equal(c.telephones.join('|'), '01 02 03 04 05');
  assert.equal(c.liens.join('|'), 'https://exemple.fr');
  assert.equal(c.pirate, undefined);
  assert.equal(assainirContact({ id: 'x-2', theme: 'divers' }), null);
  assert.equal(assainirContact({ id: '../x', organisme: 'A' }), null);
});

test('routes /api/repertoire : relevé initial à la première lecture, ajout, modification, retrait', async () => {
  let r = await appeler('/api/repertoire');
  let j = await r.json();
  assert.equal(j.contacts.length, REPERTOIRE_INITIAL.length);
  assert.equal(j.themes[0].cle, 'confreres');
  r = await appeler('/api/repertoire', 'POST', { contact: { id: 'saisie-essai', theme: 'banquesPrets', organisme: 'Banque d’essai', emails: ['pret@banque-essai.fr'] } });
  j = await r.json();
  assert.equal(j.contacts.length, REPERTOIRE_INITIAL.length + 1);
  r = await appeler('/api/repertoire', 'POST', { contact: { id: 'saisie-essai', theme: 'banquesSuccessions', organisme: 'Banque d’essai' } });
  j = await r.json();
  assert.equal(j.contacts.find((c) => c.id === 'saisie-essai').theme, 'banquesSuccessions');
  assert.equal(j.contacts.length, REPERTOIRE_INITIAL.length + 1);
  r = await appeler('/api/repertoire', 'POST', { contact: { id: 'vide' } });
  assert.equal(r.status, 400);
  r = await appeler('/api/repertoire/saisie-essai', 'DELETE');
  j = await r.json();
  assert.equal(j.contacts.length, REPERTOIRE_INITIAL.length);
});

test('annuaire des notaires de France : départements, offices d’un département, recherche (noms inventés)', async () => {
  const annuaire = require('../src/annuaireNotaires');
  annuaire.definirDonneesAnnuaire({
    source: 'Annuaire de test', releveLe: '2026-10-02',
    offices: [
      { id: 'annuaire-1', office: 'SCP MARTEL et FOURNIER', notaires: ['Paul MARTEL', 'Anne FOURNIER'], email: 'scp.martel@notaires.fr', telephone: '02 47 00 00 01', adresse: '1 rue Nationale', codePostal: '37000', ville: 'Tours', departement: '37', bureaux: [] },
      { id: 'annuaire-2', office: 'Me Luc ROUX', notaires: ['Luc ROUX'], email: '', telephone: '04 95 00 00 02', adresse: '2 cours Napoléon', codePostal: '20000', ville: 'Ajaccio', departement: '2A', bureaux: [] },
      { id: 'annuaire-3', office: 'Me Léa BRUN', notaires: ['Léa BRUN'], email: '', telephone: '', adresse: '', codePostal: '37100', ville: 'Amboise', departement: '37', bureaux: ['37400 Montlouis 3 place du Marché'] },
      { id: 'annuaire-4', office: 'Me Jean VERT', notaires: ['Jean VERT'], email: '', telephone: '', adresse: '', codePostal: '97400', ville: 'Saint-Denis', departement: '974', bureaux: [] }
    ]
  });
  try {
    assert.equal(annuaire.departementsAnnuaire().map((d) => `${d.code}:${d.offices}`).join(' '), '2A:1 37:2 974:1');
    let r = await appeler('/api/annuaire/departements');
    let j = await r.json();
    assert.equal(j.offices, 4);
    assert.equal(j.departements.find((d) => d.code === '37').nom, 'Indre-et-Loire');
    r = await appeler('/api/annuaire/departement/37');
    j = await r.json();
    assert.equal(j.offices.map((o) => o.ville).join(), 'Amboise,Tours');
    assert.equal((await appeler('/api/annuaire/departement/2a')).status, 200);
    assert.equal((await appeler('/api/annuaire/departement/..%2Fx')).status, 400);
    r = await appeler('/api/annuaire/recherche?q=' + encodeURIComponent('fournier tours'));
    assert.equal((await r.json()).offices.map((o) => o.id).join(), 'annuaire-1');
    r = await appeler('/api/annuaire/recherche?q=montlouis');
    assert.equal((await r.json()).offices.map((o) => o.id).join(), 'annuaire-3');
    r = await appeler('/api/annuaire/recherche?q=a');
    assert.equal((await r.json()).offices.length, 0);
  } finally {
    annuaire.definirDonneesAnnuaire(null);
  }
});

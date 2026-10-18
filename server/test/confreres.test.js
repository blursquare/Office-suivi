'use strict';

// Carnet des confrères (voir src/carnetConfreres.js, src/routes/confreres.js) : partagé en base,
// parti du relevé de l'annuaire du 41, complété office par office.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirOffice, assainirCarnet, carnetInitial, avecOfficeEtude, CARNET_INITIAL_41, ID_OFFICE_ETUDE, fusionnerCarnetEtAnnuaire, departementDepuisCodePostal } = require('../src/carnetConfreres');
const { definirDonneesAnnuaire } = require('../src/annuaireNotaires');

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

test('fusionnerCarnetEtAnnuaire : chaque office de France remplacé par sa correction, notre office en tête, saisis ajoutés', () => {
  const annuaire = [
    { id: 'annuaire-1', office: 'SCP A', notaires: ['Anne A'], email: 'a@notaires.fr', telephone: '02 54 00 00 01', codePostal: '41000', ville: 'Blois', departement: '41' },
    { id: 'annuaire-2', office: 'SCP B', notaires: ['Bruno B'], email: 'b@notaires.fr', telephone: '02 47 00 00 02', codePostal: '37000', ville: 'Tours', departement: '37' },
    { id: 'annuaire-3', office: 'SCP C', notaires: ['Chloé C'], email: 'c@notaires.fr', telephone: '02 38 00 00 03', codePostal: '45000', ville: 'Orléans', departement: '45' }
  ];
  const carnet = [
    { id: ID_OFFICE_ETUDE, etude: true, office: 'Notre office', notaires: ['Sophie GOSSART'], codePostal: '41000' },
    { id: 'annuaire-2', office: 'SCP B (corrigé)', notaires: ['Bruno B'], email: 'b@notaires.fr', codePostal: '37000', modifieLe: '2026-10-03T08:00:00Z' },
    { id: 'saisie-9', office: 'SCP C saisie', notaires: ['Chloé C'], email: 'C@notaires.fr', codePostal: '45000' },
    { id: 'saisie-10', office: 'Office absent', notaires: ['Denis D'], codePostal: '18000' }
  ];
  const f = fusionnerCarnetEtAnnuaire(carnet, annuaire);
  assert.equal(f.map((o) => o.id).join(), `${ID_OFFICE_ETUDE},annuaire-1,annuaire-2,saisie-9,saisie-10`);
  assert.equal(f.find((o) => o.id === 'annuaire-2').office, 'SCP B (corrigé)');
  assert.equal(f.find((o) => o.id === 'annuaire-2').modifie, true);
  assert.equal(f.find((o) => o.id === 'annuaire-1').modifie, false);
  assert.equal(f.find((o) => o.id === 'saisie-9').departement, '45', 'même email qu’un office de l’annuaire : il le remplace');
  assert.equal(f.find((o) => o.id === 'saisie-10').departement, '18');
  assert.equal(f.find((o) => o.id === 'saisie-10').annuaire, false);
  assert.equal(departementDepuisCodePostal('20100'), '2A');
  assert.equal(departementDepuisCodePostal('97400'), '974');
});

test('GET rend tout l’annuaire corrigé (compressé) ; POST corrige ou ajoute ; DELETE oublie la correction', async () => {
  definirDonneesAnnuaire({ source: 'test', offices: [
    { id: 'annuaire-12068', office: 'Me Jean DUPRE', notaires: ['Jean DUPRE'], email: 'dupre@notaires.fr', telephone: '02 54 11 11 11', codePostal: '41000', ville: 'Blois', departement: '41' },
    { id: 'annuaire-90001', office: 'SCP Paul DURAND', notaires: ['Paul DURAND'], email: 'durand@notaires.fr', telephone: '02 38 22 22 22', codePostal: '45000', ville: 'Orléans', departement: '45' }
  ] });
  try {
    let r = await appeler('/api/confreres');
    assert.equal(r.status, 200);
    let j = await r.json();
    // Notre office, les 35 du relevé initial du 41 (dont annuaire-12068) et l'office d'Orléans.
    assert.equal(j.offices.length, 37);
    assert.equal(j.offices[0].id, ID_OFFICE_ETUDE);
    assert.ok(j.offices.find((o) => o.id === 'annuaire-90001'));

    const corrige = { id: 'annuaire-90001', office: 'SCP Paul DURAND', notaires: ['Paul DURAND', 'Léa DURAND'], email: 'office.durand@notaires.fr', ville: 'Orléans', codePostal: '45000' };
    r = await appeler('/api/confreres', 'POST', { office: corrige });
    j = await r.json();
    assert.equal(j.offices.length, 37);
    const o = j.offices.find((x) => x.id === 'annuaire-90001');
    assert.equal(o.notaires.join(), 'Paul DURAND,Léa DURAND');
    assert.equal(o.modifie, true);

    r = await appeler('/api/confreres', 'POST', { office: { id: 'saisie-1', office: 'Office saisi', notaires: ['Marc LEROY'], codePostal: '18000' } });
    assert.equal((await r.json()).offices.length, 38);
    r = await appeler('/api/confreres', 'POST', { office: { id: 'x', office: '' } });
    assert.equal(r.status, 400);

    // Oublier la correction : l'office revient tel que relevé dans l'annuaire.
    r = await appeler('/api/confreres/annuaire-90001', 'DELETE');
    j = await r.json();
    assert.equal(j.offices.find((x) => x.id === 'annuaire-90001').notaires.join(), 'Paul DURAND');
    r = await appeler('/api/confreres/saisie-1', 'DELETE');
    assert.equal((await r.json()).offices.length, 37);
    r = await appeler('/api/confreres/' + ID_OFFICE_ETUDE, 'DELETE');
    assert.equal(r.status, 400);
  } finally {
    definirDonneesAnnuaire(null);
  }
});

// ---- Répertoire (src/repertoire.js) : les autres interlocuteurs de l'étude, par thème ----
const { repertoireInitial, assainirContact, THEMES_REPERTOIRE, REPERTOIRE_INITIAL } = require('../src/repertoire');
const { LOTS_REPERTOIRE } = require('../src/repertoireAjouts');
const { creerRepoParametres } = require('../src/parametresRepo');
// Le répertoire lu à la première fois : le relevé du Word + les lots de contacts ajoutés ensuite (repertoireAjouts.js).
const TOTAL_INITIAL = REPERTOIRE_INITIAL.length + LOTS_REPERTOIRE.reduce((n, l) => n + l.contacts.length, 0);

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
  assert.equal(j.contacts.length, TOTAL_INITIAL);
  assert.equal(j.themes[0].cle, 'confreres');
  r = await appeler('/api/repertoire', 'POST', { contact: { id: 'saisie-essai', theme: 'banquesPrets', organisme: 'Banque d’essai', emails: ['pret@banque-essai.fr'] } });
  j = await r.json();
  assert.equal(j.contacts.length, TOTAL_INITIAL + 1);
  r = await appeler('/api/repertoire', 'POST', { contact: { id: 'saisie-essai', theme: 'banquesSuccessions', organisme: 'Banque d’essai' } });
  j = await r.json();
  assert.equal(j.contacts.find((c) => c.id === 'saisie-essai').theme, 'banquesSuccessions');
  assert.equal(j.contacts.length, TOTAL_INITIAL + 1);
  r = await appeler('/api/repertoire', 'POST', { contact: { id: 'vide' } });
  assert.equal(r.status, 400);
  r = await appeler('/api/repertoire/saisie-essai', 'DELETE');
  j = await r.json();
  assert.equal(j.contacts.length, TOTAL_INITIAL);
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
  } finally {
    annuaire.definirDonneesAnnuaire(null);
  }
});

test('lots du répertoire : identifiants uniques, thèmes connus, aucune coordonnée inventée, syndics rangés à part', () => {
  const themes = new Set(THEMES_REPERTOIRE.map((t) => t.cle));
  assert.ok(themes.has('syndics'));
  const tous = LOTS_REPERTOIRE.flatMap((l) => l.contacts);
  const ids = tous.concat(REPERTOIRE_INITIAL).map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiant en double');
  assert.ok(tous.every((c) => themes.has(c.theme) && (c.organisme || (c.personnes || []).length) && assainirContact({ ...c, source: 'x' })));
  const authentic = LOTS_REPERTOIRE.find((l) => l.lot === 'authentic-agences-syndics-2026-10-05').contacts;
  assert.ok(authentic.every((c) => !c.telephones && !c.emails), 'le relevé d\'Authentic n\'a ni téléphone ni email : rien n\'est inventé');
  // Services de la Ville de Paris (16/10) : adresses et liens des seules pages officielles lues.
  const paris = LOTS_REPERTOIRE.find((l) => l.lot === 'paris-services-urbanisme-2026-10-16').contacts;
  assert.ok(paris.every((c) => c.theme === 'mairies' && !c.telephones));
  assert.ok(paris.flatMap((c) => c.emails || []).every((e) => /@paris\.fr$/i.test(e)));
  assert.ok(paris.flatMap((c) => c.liens || []).every((l) => /^https:\/\/([a-z.]+\.)?paris\.fr\//.test(l)));
  assert.ok(tous.some((c) => c.theme === 'syndics') && tous.some((c) => c.theme === 'immobilier'));
});

test('lots du répertoire : appliqués une seule fois à un répertoire existant, sans ressusciter un contact retiré', () => {
  const base = ouvrirDb(':memory:');
  try {
    const repo = creerRepoParametres(base);
    // Répertoire déjà enregistré AVANT les lots (relevé du Word seul), un contact modifié par l'étude au même id qu'un lot.
    const idLot = LOTS_REPERTOIRE[0].contacts[0].id;
    repo.ecrireRepertoire([...repertoireInitial(), { id: idLot, theme: 'immobilier', organisme: 'Modifié par l\'étude', telephones: ['02 54 00 00 00'] }]);
    base.prepare("DELETE FROM parametres WHERE cle = 'repertoire-lots'").run();
    let liste = repo.lireRepertoire();
    assert.equal(liste.length, TOTAL_INITIAL, 'tous les contacts des lots, le contact modifié compté une fois');
    assert.equal(liste.find((c) => c.id === idLot).organisme, 'Modifié par l\'étude');
    assert.ok(liste.filter((c) => c.id !== idLot && c.source === LOTS_REPERTOIRE[0].source).length > 50);
    // L'étude retire un contact d'un lot : il ne revient pas à la lecture suivante.
    const retire = LOTS_REPERTOIRE[0].contacts[5].id;
    repo.ecrireRepertoire(liste.filter((c) => c.id !== retire));
    liste = repo.lireRepertoire();
    assert.ok(!liste.some((c) => c.id === retire));
    assert.equal(liste.length, TOTAL_INITIAL - 1);
  } finally { base.close(); }
});

test('lot de corrections (étude 18/10) : le S.I.E.P.F. de Blois devient le SPFE de Blois, sauf contact déjà modifié par l’étude', () => {
  const base = ouvrirDb(':memory:');
  try {
    const repo = creerRepoParametres(base);
    assert.equal(repo.lireRepertoire().find((c) => c.id === 'rep-siepf-blois').organisme, 'SPFE de Blois', 'répertoire neuf');
    // Répertoire existant d'avant le lot, puis un second où l'étude avait déjà renommé le contact.
    repo.ecrireRepertoire(repertoireInitial());
    base.prepare("DELETE FROM parametres WHERE cle = 'repertoire-lots'").run();
    assert.equal(repo.lireRepertoire().find((c) => c.id === 'rep-siepf-blois').organisme, 'SPFE de Blois');
    repo.ecrireRepertoire(repertoireInitial().map((c) => c.id === 'rep-siepf-blois' ? { ...c, organisme: 'Service des impôts de Blois' } : c));
    base.prepare("DELETE FROM parametres WHERE cle = 'repertoire-lots'").run();
    assert.equal(repo.lireRepertoire().find((c) => c.id === 'rep-siepf-blois').organisme, 'Service des impôts de Blois');
  } finally { base.close(); }
});

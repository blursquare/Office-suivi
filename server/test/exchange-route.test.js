'use strict';

// Routes /api/exchange (voir src/routes/exchange.js) : réglages de connexion à l'agenda Outlook et
// création de rendez-vous. Le mot de passe de messagerie ne doit JAMAIS ressortir de la base. Les
// tests ci-dessous ne touchent jamais le réseau : seuls les chemins de validation (400) et la
// redaction du mot de passe sont exercés — la création réelle EWS a besoin d'un vrai Exchange et se
// valide au bureau (voir CLAUDE.md).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { URL_EWS_DEFAUT } = require('../src/routes/exchange');

function config() {
  return { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' };
}

let db, serveurApp, baseUrl, jeton;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: config() });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  db.close();
});

function appeler(chemin, options) {
  return fetch(`${baseUrl}${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options && options.headers) }
  });
}

test('GET /api/exchange/reglages : valeurs par défaut, URL Fichorga, pas de mot de passe', async () => {
  const corps = await (await appeler('/api/exchange/reglages')).json();
  assert.equal(corps.actif, false);
  assert.equal(corps.url, URL_EWS_DEFAUT);
  assert.equal(corps.email, '');
  assert.equal(corps.motDePasseEnregistre, false);
  assert.equal('motDePasse' in corps, false);
});

test('PUT puis GET : le mot de passe est enregistré mais jamais renvoyé', async () => {
  const ecrit = await (await appeler('/api/exchange/reglages', {
    method: 'PUT',
    body: JSON.stringify({ actif: true, email: 'notaire@gossart.notaires.fr', motDePasse: 'SECRET123' })
  })).json();
  assert.equal(ecrit.actif, true);
  assert.equal(ecrit.email, 'notaire@gossart.notaires.fr');
  assert.equal(ecrit.motDePasseEnregistre, true);
  assert.equal('motDePasse' in ecrit, false);
  // Relecture : toujours pas de mot de passe en clair.
  const relu = await (await appeler('/api/exchange/reglages')).json();
  assert.equal(relu.motDePasseEnregistre, true);
  assert.doesNotMatch(JSON.stringify(relu), /SECRET123/);
});

test('POST /api/exchange/rendez-vous : refusé tant que la connexion n\'est pas activée', async () => {
  // Désactiver d'abord (le test précédent l'a activée).
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: false, email: 'notaire@gossart.notaires.fr', motDePasse: '' }) });
  const r = await appeler('/api/exchange/rendez-vous', {
    method: 'POST',
    body: JSON.stringify({ sujet: 'VTE - X', date: '2026-10-14', heure: '14:30' })
  });
  assert.equal(r.status, 400);
  const corps = await r.json();
  assert.equal(corps.ok, false);
  assert.match(corps.message, /pas activée/i);
});

test('POST /api/exchange/rendez-vous : date/heure/objet validés avant tout appel réseau', async () => {
  // Activer avec des identifiants (le réseau ne sera pas atteint : la validation échoue avant).
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: true, email: 'notaire@gossart.notaires.fr', motDePasse: 'SECRET123' }) });
  const dateInvalide = await (await appeler('/api/exchange/rendez-vous', {
    method: 'POST', body: JSON.stringify({ sujet: 'VTE - X', date: '14/10/2026', heure: '14:30' })
  })).json();
  assert.match(dateInvalide.message, /[Dd]ate/);
  const heureInvalide = await (await appeler('/api/exchange/rendez-vous', {
    method: 'POST', body: JSON.stringify({ sujet: 'VTE - X', date: '2026-10-14', heure: '14h30' })
  })).json();
  assert.match(heureInvalide.message, /[Hh]eure/);
  const sansObjet = await (await appeler('/api/exchange/rendez-vous', {
    method: 'POST', body: JSON.stringify({ sujet: '', date: '2026-10-14', heure: '14:30' })
  })).json();
  assert.match(sansObjet.message, /[Oo]bjet/);
});

test('POST /api/exchange/brouillon : destinataire et objet validés avant tout appel réseau', async () => {
  // La connexion est active (test précédent), avec des identifiants — la validation échoue avant le réseau.
  const mauvaisDest = await (await appeler('/api/exchange/brouillon', {
    method: 'POST', body: JSON.stringify({ destinataire: 'pas-un-email', sujet: 'x' })
  })).json();
  assert.match(mauvaisDest.message, /[Dd]estinataire/);
  const sansObjet = await (await appeler('/api/exchange/brouillon', {
    method: 'POST', body: JSON.stringify({ destinataire: 'c@d.fr', sujet: '' })
  })).json();
  assert.match(sansObjet.message, /[Oo]bjet/);
});

test('POST /api/exchange/brouillon : refusé tant que la connexion n\'est pas activée', async () => {
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: false, email: 'n@e.fr', motDePasse: '' }) });
  const r = await appeler('/api/exchange/brouillon', {
    method: 'POST', body: JSON.stringify({ destinataire: 'c@d.fr', sujet: 'x' })
  });
  assert.equal(r.status, 400);
  const corps = await r.json();
  assert.match(corps.message, /pas activée/i);
});

test('POST /api/exchange/rendez-vous/lieu : refusé tant que la connexion n\'est pas activée', async () => {
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: false, email: 'n@e.fr', motDePasse: '' }) });
  const r = await appeler('/api/exchange/rendez-vous/lieu', {
    method: 'POST', body: JSON.stringify({ date: '2026-10-14', reference: 'DUPONT', appelFonds: true })
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /pas activée/i);
});

test('POST /api/exchange/rendez-vous/lieu : date, référence et contenu validés avant tout appel réseau', async () => {
  // Activer avec des identifiants : le réseau ne sera pas atteint, la validation échoue avant.
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: true, email: 'notaire@gossart.notaires.fr', motDePasse: 'SECRET123' }) });
  const dateInvalide = await (await appeler('/api/exchange/rendez-vous/lieu', {
    method: 'POST', body: JSON.stringify({ date: '14/10/2026', reference: 'DUPONT', appelFonds: true })
  })).json();
  assert.match(dateInvalide.message, /[Dd]ate/);
  const sansReference = await (await appeler('/api/exchange/rendez-vous/lieu', {
    method: 'POST', body: JSON.stringify({ date: '2026-10-14', reference: '', appelFonds: true })
  })).json();
  assert.match(sansReference.message, /dossier/i);
  const rienANoter = await (await appeler('/api/exchange/rendez-vous/lieu', {
    method: 'POST', body: JSON.stringify({ date: '2026-10-14', reference: 'DUPONT', appelFonds: false, projet: false })
  })).json();
  assert.match(rienANoter.message, /[Rr]ien/);
});

test('POST /api/exchange/echeance : refusé tant que la connexion n\'est pas activée', async () => {
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: false, email: 'n@e.fr', motDePasse: '' }) });
  const r = await appeler('/api/exchange/echeance', {
    method: 'POST', body: JSON.stringify({ action: 'creer', date: '2026-10-14', sujet: 'Obtention du prêt — X' })
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /pas activée/i);
});

test('POST /api/exchange/echeance : action, date, objet et identifiant validés avant tout appel réseau', async () => {
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: true, email: 'notaire@gossart.notaires.fr', motDePasse: 'SECRET123' }) });
  const poster = (corps) => appeler('/api/exchange/echeance', { method: 'POST', body: JSON.stringify(corps) }).then((r) => r.json());
  assert.match((await poster({ action: 'inventer' })).message, /[Aa]ction/);
  assert.match((await poster({ action: 'creer', date: '14/10/2026', sujet: 'x' })).message, /[Dd]ate/);
  assert.match((await poster({ action: 'creer', date: '2026-10-14', sujet: '' })).message, /[Oo]bjet/);
  assert.match((await poster({ action: 'modifier', date: '2026-10-14', itemId: 'A' })).message, /[Ii]dentifiant/);
  assert.match((await poster({ action: 'supprimer' })).message, /[Ii]dentifiant/);
});

test('choisirRendezVousDossier : identifiant mémorisé d\'abord, sinon un seul titre correspondant', () => {
  const { choisirRendezVousDossier } = require('../src/routes/exchange');
  const evts = [
    { itemId: 'A', subject: 'VTE - DUPONT / MARTIN' },
    { itemId: 'B', subject: 'VTE - DURAND / PETIT' },
    { itemId: 'C', subject: 'Réunion équipe' }
  ];
  assert.equal(choisirRendezVousDossier(evts, 'DURAND / PETIT', '').evt.itemId, 'B');
  assert.equal(choisirRendezVousDossier(evts, 'AUTRE / NOM', 'C').evt.itemId, 'C', 'identifiant mémorisé');
  assert.ok(choisirRendezVousDossier(evts, 'LEROY / BLANC', '').aucun);
  const doubles = [...evts, { itemId: 'D', subject: 'VTE - DUPONT / MARTIN (2)' }];
  assert.ok(choisirRendezVousDossier(doubles, 'DUPONT / MARTIN', '').plusieurs, 'jamais deviner entre deux');
});

test('POST /api/exchange/rendez-vous/supprimer et /deplacer : refusés tant que la connexion n\'est pas activée', async () => {
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: false }) });
  const r1 = await appeler('/api/exchange/rendez-vous/supprimer', { method: 'POST', body: JSON.stringify({ date: '2026-10-14', reference: 'DUPONT' }) });
  assert.equal(r1.status, 400);
  const r2 = await appeler('/api/exchange/rendez-vous/deplacer', { method: 'POST', body: JSON.stringify({ ancienneDate: '2026-10-14', nouvelleDate: '2026-10-20', reference: 'DUPONT' }) });
  assert.equal(r2.status, 400);
});

test('POST /api/exchange/rendez-vous/supprimer et /deplacer : dates et dossier validés avant tout appel réseau', async () => {
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: true, email: 'a@b.fr', motDePasse: 'x' }) });
  const r1 = await appeler('/api/exchange/rendez-vous/supprimer', { method: 'POST', body: JSON.stringify({ date: '14/10/2026', reference: 'DUPONT' }) });
  assert.equal(r1.status, 400);
  const r2 = await appeler('/api/exchange/rendez-vous/supprimer', { method: 'POST', body: JSON.stringify({ date: '2026-10-14' }) });
  assert.equal(r2.status, 400);
  const r3 = await appeler('/api/exchange/rendez-vous/deplacer', { method: 'POST', body: JSON.stringify({ ancienneDate: '2026-10-14', nouvelleDate: 'demain', reference: 'DUPONT' }) });
  assert.equal(r3.status, 400);
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: false }) });
});

test('Réglages Exchange : catégories de couleur par défaut, remplacées et conservées', async () => {
  const lu = await (await appeler('/api/exchange/reglages')).json();
  assert.equal(lu.categoriesRdv.office, 'Catégorie Verte');
  assert.equal(lu.categoriesRdv.visio, 'Catégorie Violette');
  assert.equal(lu.categoriesRdv.confrere, 'Catégorie Orange');
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ categoriesRdv: { office: 'Office', visio: 'Visio' } }) });
  const relu = await (await appeler('/api/exchange/reglages')).json();
  assert.equal(relu.categoriesRdv.office, 'Office');
  assert.equal(relu.categoriesRdv.confrere, 'Catégorie Orange');
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ email: 'a@b.fr' }) });
  const encore = await (await appeler('/api/exchange/reglages')).json();
  assert.equal(encore.categoriesRdv.visio, 'Visio', 'conservées quand le formulaire ne les réémet pas');
});

test('POST /api/exchange/evenement/supprimer : rendez-vous désigné avant tout appel réseau', async () => {
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: false }) });
  const inactif = await appeler('/api/exchange/evenement/supprimer', { method: 'POST', body: JSON.stringify({ itemId: 'AAA' }) });
  assert.equal(inactif.status, 400);
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: true, email: 'notaire@gossart.notaires.fr', motDePasse: 'SECRET123' }) });
  const sansId = await appeler('/api/exchange/evenement/supprimer', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(sansId.status, 400);
  assert.match((await sansId.json()).message, /non désigné/);
});

test('heureFinDepuisDuree : heure de fin, jamais au-delà de 23:59', () => {
  const { heureFinDepuisDuree } = require('../src/routes/exchange');
  assert.equal(heureFinDepuisDuree('09:30', 60), '10:30');
  assert.equal(heureFinDepuisDuree('17:45', 90), '19:15');
  assert.equal(heureFinDepuisDuree('23:30', 120), '23:59');
});

test('Notes d\'un rendez-vous : rendez-vous désigné et taille bornée avant tout appel réseau', async () => {
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: false }) });
  const inactif = await appeler('/api/exchange/evenement/notes?itemId=AAA');
  assert.equal(inactif.status, 400);
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: true, email: 'notaire@gossart.notaires.fr', motDePasse: 'SECRET123' }) });
  const sansId = await appeler('/api/exchange/evenement/notes');
  assert.equal(sansId.status, 400);
  const sansNotes = await appeler('/api/exchange/evenement/notes', { method: 'PUT', body: JSON.stringify({ itemId: 'AAA' }) });
  assert.equal(sansNotes.status, 400);
  const tropLong = await appeler('/api/exchange/evenement/notes', { method: 'PUT', body: JSON.stringify({ itemId: 'AAA', notes: 'x'.repeat(8001) }) });
  assert.equal(tropLong.status, 400);
  assert.match((await tropLong.json()).message, /trop longues/);
});

test('page de réponse aux sondages : https seulement, effaçable', async () => {
  const ok = await (await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ pageSondage: 'https://blursquare.github.io/claire-rdv/' }) })).json();
  assert.equal(ok.pageSondage, 'https://blursquare.github.io/claire-rdv/');
  const garde = await (await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: true }) })).json();
  assert.equal(garde.pageSondage, 'https://blursquare.github.io/claire-rdv/');
  const refuse = await (await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ pageSondage: 'javascript:alert(1)' }) })).json();
  assert.equal(refuse.pageSondage, '');
  const vide = await (await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ pageSondage: '' }) })).json();
  assert.equal(vide.pageSondage, '');
});

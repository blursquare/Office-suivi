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

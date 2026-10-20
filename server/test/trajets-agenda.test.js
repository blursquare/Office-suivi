'use strict';

// Trajets d'un rendez-vous chez un confrère (étude 20/10) : deux rendez-vous d'une demi-heure, « Trajet - N km », posés par le
// serveur autour du rendez-vous de la couleur du confrère, déplacés et retirés avec lui. Faux Exchange et faux IGN : aucun réseau.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { distanceRouteKm, horairesTrajetsAutour, assainirLiensTrajets, adresseValide } = require('../src/trajetsAgenda');
const { rendezVousChezConfrere, momentParisInstant } = require('../src/routes/exchange');

const envoisEws = [];
let compteur = 0;
let introuvables = false;
const ok = (corps) => ({ statusCode: 200, body: `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:m="m" xmlns:t="t"><s:Body>${corps}</s:Body></s:Envelope>` });
const fauxPoster = (opts, cb) => {
  envoisEws.push(opts.body);
  const b = String(opts.body);
  if (/<m:CreateItem/.test(b)) { compteur++; return cb(null, ok(`<m:CreateItemResponse><m:ResponseMessages><m:CreateItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items><t:CalendarItem><t:ItemId Id="ID${compteur}" ChangeKey="CK${compteur}"/></t:CalendarItem></m:Items></m:CreateItemResponseMessage></m:ResponseMessages></m:CreateItemResponse>`)); }
  if (/<m:UpdateItem/.test(b) && introuvables && !/ChangeKey=/.test(b)) return cb(null, ok('<m:UpdateItemResponse><m:ResponseMessages><m:UpdateItemResponseMessage ResponseClass="Error"><m:ResponseCode>ErrorItemNotFound</m:ResponseCode></m:UpdateItemResponseMessage></m:ResponseMessages></m:UpdateItemResponse>'));
  if (/<m:UpdateItem/.test(b)) { const id = /ItemId Id="([^"]+)"/.exec(b)[1]; return cb(null, ok(`<m:UpdateItemResponse><m:ResponseMessages><m:UpdateItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items><t:CalendarItem><t:ItemId Id="${id}" ChangeKey="CK-maj"/></t:CalendarItem></m:Items></m:UpdateItemResponseMessage></m:ResponseMessages></m:UpdateItemResponse>`)); }
  if (/<m:DeleteItem/.test(b)) return cb(null, ok('<m:DeleteItemResponse><m:ResponseMessages><m:DeleteItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode></m:DeleteItemResponseMessage></m:ResponseMessages></m:DeleteItemResponse>'));
  return cb(null, ok(''));
};
const urlsIgn = [];
const fauxFetch = async (url) => {
  urlsIgn.push(String(url));
  if (/geocodage/.test(url)) return { ok: true, status: 200, json: async () => ({ features: [{ geometry: { coordinates: [/Blois/.test(decodeURIComponent(url)) ? 1.33 : 5.19, 47.5] }, properties: { score: 0.93 } }] }) };
  return { ok: true, status: 200, json: async () => ({ distance: 187.4 }) };
};

let db, serveurApp, baseUrl, jeton;
before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' }, exchange: { poster: fauxPoster, fetch: fauxFetch } });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
  await appeler('/api/exchange/reglages', { method: 'PUT', body: JSON.stringify({ actif: true, email: 'agenda@office.test', motDePasse: 'secret' }) });
});
after(() => { serveurApp.close(); db.close(); });

function appeler(chemin, options) {
  return fetch(`${baseUrl}${chemin}`, { ...options, headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' } });
}
const creer = (corps) => appeler('/api/exchange/rendez-vous', { method: 'POST', body: JSON.stringify(corps) }).then((r) => r.json());

test('rendez-vous chez un confrère : deux trajets d’une demi-heure, km par la route, même couleur, sans rappel', async () => {
  envoisEws.length = 0;
  const r = await creer({ sujet: 'VTE - ESSAI / EXEMPLE', date: '2026-11-03', heure: '14:30', dureeMinutes: 60, categorie: 'Catégorie Orange', adresseConfrere: '50 rue de Genève, 01800 Meximieux' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.trajets, { poses: 2, km: 187 });
  const trajets = envoisEws.filter((b) => /Trajet - 187 km/.test(b));
  assert.equal(trajets.length, 2);
  // 3 novembre : heure d'hiver, Paris = UTC+1.
  assert.match(trajets[0], /<t:Start>2026-11-03T13:00:00Z<\/t:Start><t:End>2026-11-03T13:30:00Z<\/t:End>/);
  assert.match(trajets[1], /<t:Start>2026-11-03T14:30:00Z<\/t:Start><t:End>2026-11-03T15:00:00Z<\/t:End>/);
  for (const t of trajets) {
    assert.match(t, /Catégorie Orange/);
    assert.match(t, /<t:ReminderIsSet>false<\/t:ReminderIsSet>/);
    assert.doesNotMatch(t, /ESSAI|EXEMPLE/, 'le trajet ne porte pas le nom du dossier');
  }
  // Vers l'IGN : seulement les deux adresses d'offices.
  assert.ok(urlsIgn.some((u) => /Bout%20des%20Haies/.test(u)));
  assert.ok(urlsIgn.every((u) => !/ESSAI|EXEMPLE/.test(decodeURIComponent(u))));
});

test('déplacé puis supprimé depuis la page Agenda : les trajets suivent, puis partent avec lui', async () => {
  envoisEws.length = 0;
  const r = await creer({ sujet: 'VTE - SUIVI', date: '2026-11-04', heure: '10:00', dureeMinutes: 60, categorie: 'Catégorie Orange', adresseConfrere: '50 rue de Genève, 01800 Meximieux' });
  assert.equal(r.trajets.poses, 2);
  envoisEws.length = 0;
  const m = await (await appeler('/api/exchange/evenement/modifier', { method: 'POST', body: JSON.stringify({ itemId: r.itemId, changeKey: r.changeKey, date: '2026-11-04', heure: '15:00', heureFin: '16:30' }) })).json();
  assert.equal(m.ok, true);
  const majs = envoisEws.filter((b) => /<m:UpdateItem/.test(b));
  assert.equal(majs.length, 3, 'le rendez-vous et ses deux trajets');
  assert.ok(majs.some((b) => /2026-11-04T13:30:00Z<\/t:Start>[^]*2026-11-04T14:00:00Z<\/t:End>/.test(b)), 'aller collé avant 15 h');
  assert.ok(majs.some((b) => /2026-11-04T15:30:00Z<\/t:Start>[^]*2026-11-04T16:00:00Z<\/t:End>/.test(b)), 'retour collé après 16 h 30');
  assert.equal(majs.filter((b) => !/ChangeKey=/.test(b)).length, 2, 'trajets déplacés sans ChangeKey (une clé gardée peut être périmée)');
  const stock = await (await appeler('/api/agenda/evenements?debut=2026-11-01&fin=2026-11-30')).json();
  const trajetsStock = (stock.evenements || []).filter((e) => /^Trajet/.test(e.sujet) && e.date === '2026-11-04');
  assert.deepEqual(trajetsStock.map((e) => e.heure).sort(), ['14:30', '16:30']);
  envoisEws.length = 0;
  const s = await (await appeler('/api/exchange/evenement/supprimer', { method: 'POST', body: JSON.stringify({ itemId: r.itemId }) })).json();
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal(s.trajetsRetires, 2);
  assert.equal(envoisEws.filter((b) => /<m:DeleteItem/.test(b)).length, 3);
  assert.doesNotMatch(envoisEws.join(''), /HardDelete/);
});

test('marqué « Annulé / à replacer » : ses trajets partent ; un trajet effacé à la main est oublié au déplacement suivant', async () => {
  const r = await creer({ sujet: 'VTE - JAUNE', date: '2026-11-06', heure: '10:00', dureeMinutes: 60, categorie: 'Catégorie Orange', adresseConfrere: '50 rue de Genève, 01800 Meximieux' });
  envoisEws.length = 0;
  await appeler('/api/exchange/evenement/modifier', { method: 'POST', body: JSON.stringify({ itemId: r.itemId, date: '2026-11-06', heure: '10:00', heureFin: '11:00', categories: ['Catégorie Orange', 'Catégorie Jaune'] }) });
  assert.equal(envoisEws.filter((b) => /<m:DeleteItem/.test(b)).length, 2);
  const r2 = await creer({ sujet: 'VTE - EFFACE', date: '2026-11-06', heure: '15:00', dureeMinutes: 60, categorie: 'Catégorie Orange', adresseConfrere: '50 rue de Genève, 01800 Meximieux' });
  introuvables = true;
  await appeler('/api/exchange/evenement/modifier', { method: 'POST', body: JSON.stringify({ itemId: r2.itemId, changeKey: r2.changeKey, date: '2026-11-06', heure: '16:00', heureFin: '17:00' }) });
  introuvables = false;
  envoisEws.length = 0;
  await appeler('/api/exchange/evenement/modifier', { method: 'POST', body: JSON.stringify({ itemId: r2.itemId, date: '2026-11-06', heure: '16:30', heureFin: '17:30' }) });
  assert.equal(envoisEws.filter((b) => /<m:UpdateItem/.test(b)).length, 1, 'plus aucun UpdateItem vers les trajets disparus');
});

test('ni trajet pour une autre couleur, ni trajet d’un trajet ; sans adresse, « Trajet » sans km', async () => {
  envoisEws.length = 0;
  const vert = await creer({ sujet: 'VTE - OFFICE', date: '2026-11-05', heure: '10:00', categorie: 'Catégorie Verte' });
  assert.equal(vert.trajets, undefined);
  const trajet = await creer({ sujet: 'Trajet - 12 km', date: '2026-11-05', heure: '11:00', categorie: 'Catégorie Orange' });
  assert.equal(trajet.trajets, undefined);
  assert.equal(envoisEws.length, 2);
  const sans = await creer({ sujet: 'VTE - SANS', date: '2026-11-05', heure: '15:00', categorie: 'Catégorie Orange' });
  assert.equal(sans.trajets.poses, 2);
  assert.equal(sans.trajets.km, null);
  assert.equal(envoisEws.filter((b) => /<t:Subject>Trajet<\/t:Subject>/.test(b)).length, 2);
});

test('fonctions pures : couleur du confrère, horaires autour, adresse reçue, liens gardés, heure de Paris', async () => {
  assert.equal(rendezVousChezConfrere({ categoriesRdv: { confrere: 'Catégorie Orange' } }, 'catégorie orange', 'VTE - X'), true);
  assert.equal(rendezVousChezConfrere({ categoriesRdv: { confrere: 'Catégorie Orange' } }, 'Catégorie Verte', 'VTE - X'), false);
  assert.equal(rendezVousChezConfrere({ categoriesRdv: { confrere: 'Catégorie Orange' } }, 'Catégorie Orange', 'Trajet - 4 km'), false);
  assert.deepEqual(horairesTrajetsAutour('2026-11-03T13:30:00Z', '2026-11-03T14:30:00Z'),
    { aller: { debut: '2026-11-03T13:00:00Z', fin: '2026-11-03T13:30:00Z' }, retour: { debut: '2026-11-03T14:30:00Z', fin: '2026-11-03T15:00:00Z' } });
  assert.equal(adresseValide('  50 rue de Genève,\n 01800 Meximieux '), '50 rue de Genève, 01800 Meximieux');
  assert.equal(adresseValide('quelque part'), '', 'sans code postal, pas de distance');
  assert.deepEqual(assainirLiensTrajets({ x: { trajets: [{ itemId: 'a', sens: 'retour' }, 5], km: 'n' } }), { x: { trajets: [{ itemId: 'a', changeKey: '', sens: 'retour' }], km: null, le: '' } });
  assert.deepEqual(momentParisInstant('2026-07-01T07:30:00Z'), { date: '2026-07-01', heure: '09:30' });
  const ko = await distanceRouteKm('a 41000', 'b 01800', { fetch: async () => { throw new Error('réseau'); } });
  assert.equal(ko.ok, false);
  const flou = await distanceRouteKm('c 41000', 'd 01800', { fetch: async () => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [1, 47] }, properties: { score: 0.2 } }] }) }) });
  assert.equal(flou.ok, false, 'adresse mal reconnue : pas de faux kilométrage');
});

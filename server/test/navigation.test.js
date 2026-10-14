'use strict';

// Plan de situation de cadastre.gouv.fr (étude 14/10) : navigateur du serveur, extrait officiel surligné en jaune fluo, plusieurs
// plans si besoin. Fonctions pures, route avec un faux gestionnaire. (L'agent Géofoncier a été retiré par l'étude le même soir.)
// Le parcours réel (vrai Chrome, vrai site) se rejoue à la main : CLAIRE_TEST_NAVIGATEUR=1 node --test test/navigation.test.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { versCC, zoneCCDepuisSrs, emprisePoints } = require('../src/navigateur/lambert');
const { echelleExtrait, emprisePlanDepuisEnvoi, departementDepuisInsee, groupesPlans } = require('../src/navigateur/planCadastre');
const { pointPage, passesSurligneur, surlignerParcelles, aleatoire } = require('../src/navigateur/surlignage');
const { adresseAutorisee, adresseAchat, nomFichierReponse } = require('../src/navigateur/session');
const { cheminsNavigateur, argumentsLancement, ConnexionCdp } = require('../src/navigateur/chrome');
const { creerGestionnaireTaches } = require('../src/navigateur/taches');

test('Lambert CC48 : un point relevé sur le site du cadastre (Blois) à quelques centimètres près', () => {
  const p = versCC([1.318376, 47.594267], 48);
  assert.ok(Math.abs(p[0] - 1573545.07) < 0.3 && Math.abs(p[1] - 7156270.67) < 0.3, String(p));
  assert.equal(zoneCCDepuisSrs('3948'), 48);
  assert.equal(zoneCCDepuisSrs('EPSG:3942'), 42);
  assert.equal(zoneCCDepuisSrs('RGF93CC50'), 50);
  assert.equal(zoneCCDepuisSrs('2154'), 0, 'Lambert-93 n’est pas une zone CC');
  assert.equal(versCC([1, 47], 41), null);
  assert.deepEqual(emprisePoints([[[0, 1], [4, 3]], [[2, -1]]]), [0, -1, 4, 3]);
});

test('échelle de l’extrait : la plus grande où tout tient avec ses abords, une demande trop grande est relevée', () => {
  // Petite parcelle (20 × 30 m) : 1/500.
  assert.deepEqual(echelleExtrait([0, 0, 20, 30]), { echelle: 500, relevee: false });
  // 90 × 110 m : 110 m / (0,6 × 211 mm) ≈ 1/869 → 1/1000.
  assert.equal(echelleExtrait([0, 0, 90, 110]).echelle, 1000);
  // 1/500 demandé pour 120 m de large : ne tient pas → relevé.
  // 1/500 demandé pour 120 m de large : ne tient pas → relevé (120 m / (0,6 × 195,5 mm) ≈ 1/1023 → 1/1250).
  assert.deepEqual(echelleExtrait([0, 0, 120, 60], 500), { echelle: 1250, relevee: true });
  // 1/2000 demandé pour une petite parcelle : gardé.
  assert.deepEqual(echelleExtrait([0, 0, 20, 30], 2000), { echelle: 2000, relevee: false });
  // Parcelles à 1,5 km l'une de l'autre : impossible sur une page.
  assert.ok('erreur' in echelleExtrait([0, 0, 1500, 10]));
});

/** Un carré de côté c (mètres) au point (x, y). */
const carre = (x, y, c) => ({ anneaux: [[[x, y], [x + c, y], [x + c, y + c], [x, y + c]]] });

test('plans (étude 14/10) : parcelles proches sur un plan, éloignées ou trop petites sur des plans à part', () => {
  // Deux maisons voisines : un plan.
  let g = groupesPlans([carre(0, 0, 20), carre(25, 0, 20)]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].indices, [0, 1]);
  assert.equal(g[0].echelle, 500);
  // Trois parcelles dont une à 2 km : deux plans, les deux voisines ensemble.
  g = groupesPlans([carre(0, 0, 20), carre(2000, 0, 20), carre(30, 10, 20)]);
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => x.indices.join('+')).sort(), ['0+2', '1']);
  // Un grand terrain (300 m) et un petit jardin (10 m) à 250 m : ensemble il faudrait le 1/5000, où le jardin ferait 2 mm → deux plans.
  g = groupesPlans([carre(0, 0, 300), carre(550, 0, 10)]);
  assert.equal(g.length, 2, JSON.stringify(g));
  assert.ok(g.find((x) => x.indices[0] === 1).echelle === 500, 'le jardin sur son plan au 1/500');
  // Des parcelles voisines lisibles au 1/1000 restent ensemble.
  // 130 m de large : 130 m / (0,6 × 195,5 mm) ≈ 1/1108 → 1/1250, chacune y fait 48 mm.
  g = groupesPlans([carre(0, 0, 60), carre(70, 0, 60)]);
  assert.equal(g.length, 1);
  assert.equal(g[0].echelle, 1250);
  // Une parcelle trop grande pour une page : refus dit.
  assert.ok('erreur' in groupesPlans([carre(0, 0, 1500)]));
  // Le premier plan commence toujours par la première parcelle (la carte du site y est déjà ouverte).
  assert.equal(groupesPlans([carre(5000, 0, 20), carre(0, 0, 20)])[0].indices[0], 0);
});

test('emprise imprimée lue dans le formulaire du site ; département d’un code INSEE', () => {
  const corps = 'MAPBBOX=1573421.255%2C7156160.55%2C1573616.755%2C7156371.55&MAPROTATION=0&TAILLEPAGE=A4';
  assert.deepEqual(emprisePlanDepuisEnvoi(corps), [1573421.255, 7156160.55, 1573616.755, 7156371.55]);
  assert.equal(emprisePlanDepuisEnvoi('TAILLEPAGE=A4'), null);
  assert.equal(emprisePlanDepuisEnvoi('MAPBBOX=5%2C5%2C1%2C1'), null, 'emprise à l’envers refusée');
  assert.equal(departementDepuisInsee('41018'), '41');
  assert.equal(departementDepuisInsee('2A004'), '2A');
  assert.equal(departementDepuisInsee('97411'), '974');
});

test('placement sur la page : la croix du quadrillage d’un extrait réel tombe au dixième de point (1/1000 et 1/500)', () => {
  // Extrait au 1/1000 du 14/10 : croix 1573500 / 7156300 mesurée à (242,8 ; 426,4) pt depuis le haut d'une page de 842 pt.
  const e1000 = [1573421.256, 7156159.982, 1573616.756, 7156370.982];
  const p = pointPage([1573500, 7156300], e1000, 1000, 842);
  assert.ok(Math.abs(p[0] - 242.8) < 0.3 && Math.abs((842 - p[1]) - 426.4) < 0.3, String(p));
  // Extrait au 1/500 : étiquette 1573550 centrée à 380,2 pt, 7156250 à 564,3 pt depuis le haut.
  const e500 = [1573486.404, 7156204.275, 1573584.154, 7156309.775];
  const q = pointPage([1573550, 7156250], e500, 500, 842);
  assert.ok(Math.abs(q[0] - 380.2) < 0.4 && Math.abs((842 - q[1]) - 564.3) < 0.4, String(q));
});

test('passes du surligneur : reproductibles, obliques, elles couvrent toute la parcelle', () => {
  const carre = [[100, 100], [160, 100], [160, 150], [100, 150]];
  const a = passesSurligneur(carre, 'AL694-0');
  assert.deepEqual(passesSurligneur(carre, 'AL694-0'), a, 'même parcelle → même tracé');
  assert.notDeepEqual(passesSurligneur(carre, 'AL695-0'), a, 'une autre parcelle → un autre tracé');
  assert.ok(a.length >= 5);
  // Chaque point du carré est à moins d'une demi-épaisseur d'une passe : pas de trou.
  const distance = (px, py, s) => {
    const [x1, y1, x2, y2] = s; const dx = x2 - x1; const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };
  for (let x = 100; x <= 160; x += 5) {
    for (let y = 100; y <= 150; y += 5) assert.ok(a.some((s) => distance(x, y, s) <= s[4] / 2 + 0.01), `trou en ${x},${y}`);
  }
  const r = aleatoire('x');
  for (let i = 0; i < 50; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test('surligner : une parcelle à trou (enclave) se surligne sans erreur', async () => {
  const { PDFDocument } = require('pdf-lib');
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const sortie = await surlignerParcelles(await doc.save(), { emprisePlan: [1000, 2000, 1195.5, 2211], centre: [0, 0], echelle: 1000,
    parcelles: [{ section: 'AL', numero: '2', anneaux: [[[1080, 2090], [1120, 2090], [1120, 2130], [1080, 2130]]], trous: [[[1095, 2105], [1105, 2105], [1105, 2115], [1095, 2115]]] }] });
  assert.equal((await PDFDocument.load(sortie)).getPageCount(), 1);
});

test('surligner : le PDF reste un A4 d’une page, le surlignage s’ajoute ; un autre format est refusé', async () => {
  const { PDFDocument } = require('pdf-lib');
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const pdf = await doc.save();
  const emprise = [1000, 2000, 1195.5, 2211];
  const sortie = await surlignerParcelles(pdf, { emprisePlan: emprise, centre: [1097.75, 2105.5], echelle: 1000,
    parcelles: [{ section: 'AL', numero: '1', anneaux: [[[1090, 2100], [1110, 2100], [1110, 2120], [1090, 2120]]] }] });
  const relu = await PDFDocument.load(sortie);
  assert.equal(relu.getPageCount(), 1);
  assert.ok(sortie.length > pdf.length + 500, 'le contenu du surlignage est ajouté');
  const paysage = await PDFDocument.create(); paysage.addPage([842, 595]);
  await assert.rejects(surlignerParcelles(await paysage.save(), { emprisePlan: emprise, centre: [0, 0], echelle: 1000, parcelles: [] }), /A4 portrait/);
});

test('liste blanche du navigateur : le domaine et ses sous-domaines seulement, ni identifiants dans l’adresse ni autre protocole', () => {
  const d = ['geofoncier.fr'];
  assert.ok(adresseAutorisee('https://www.geofoncier.fr/connexion', d));
  assert.ok(adresseAutorisee('https://public.geofoncier.fr/#5/46/2', d));
  assert.ok(adresseAutorisee('https://geofoncier.fr', d));
  assert.ok(adresseAutorisee('about:blank', d));
  assert.ok(!adresseAutorisee('data:text/html,<input type=password>', d), 'pas de page écrite par l’IA');
  assert.ok(!adresseAutorisee('http://www.geofoncier.fr/', d), 'https seulement');
  assert.ok(adresseAutorisee('http://127.0.0.1:3000/x', ['127.0.0.1']), 'http pour la boucle locale des essais');
  assert.ok(!adresseAutorisee('https://geofoncier.fr.exemple.com/', d), 'domaine piégé');
  assert.ok(!adresseAutorisee('https://faux-geofoncier.fr/', d));
  assert.ok(!adresseAutorisee('https://user:mdp@www.geofoncier.fr/', d));
  assert.ok(!adresseAutorisee('file:///C:/Windows/', d));
  assert.ok(!adresseAutorisee('javascript:alert(1)', d));
  assert.ok(!adresseAutorisee('pas une adresse', d));
});

test('nom d’un fichier reçu : Content-Disposition d’abord, caractères interdits de Windows retirés', () => {
  assert.equal(nomFichierReponse([{ name: 'Content-Disposition', value: 'attachment; filename="plan.pdf"' }], 'https://x/a'), 'plan.pdf');
  assert.equal(nomFichierReponse([{ name: 'content-disposition', value: "inline; filename*=UTF-8''Fiche%20parcelle.pdf" }], 'https://x/a'), 'Fiche parcelle.pdf');
  assert.equal(nomFichierReponse([], 'https://x/dossier/rapport%3A1.pdf'), 'rapport 1.pdf');
  assert.equal(nomFichierReponse([], 'https://x/'), 'document');
});

test('lancement : Chrome puis Edge aux emplacements habituels, sans fenêtre, par tuyaux', () => {
  const w = cheminsNavigateur({ ProgramFiles: 'C:\\PF', 'ProgramFiles(x86)': 'C:\\PF86', LOCALAPPDATA: 'C:\\L' }, 'win32');
  assert.equal(w[0], 'C:\\PF\\Google\\Chrome\\Application\\chrome.exe');
  assert.ok(w.some((c) => /msedge\.exe$/.test(c)));
  assert.ok(w.indexOf(w.find((c) => /chrome/.test(c))) < w.indexOf(w.find((c) => /msedge/.test(c))), 'Chrome avant Edge');
  const a = argumentsLancement('C:\\data\\navigateur', { largeur: 1280, hauteur: 800 });
  assert.ok(a.includes('--headless=new') && a.includes('--remote-debugging-pipe') && a.includes('--user-data-dir=C:\\data\\navigateur'));
  assert.ok(!a.some((x) => /remote-debugging-port/.test(x)), 'aucun port ouvert');
});

test('connexion CDP : messages séparés par un octet nul, réponses rendues à la bonne commande, événements relayés', async () => {
  const { PassThrough } = require('node:stream');
  const ecriture = new PassThrough();
  const lecture = new PassThrough();
  const cdp = new ConnexionCdp(ecriture, lecture);
  const ecrits = [];
  ecriture.on('data', (b) => ecrits.push(String(b)));
  const evenements = [];
  cdp.ecouter((m) => evenements.push(m.method));
  const p1 = cdp.envoyer('Browser.getVersion');
  const p2 = cdp.envoyer('Page.navigate', { url: 'x' }, 'S1');
  await new Promise((r) => setImmediate(r));
  assert.match(ecrits.join(''), /"method":"Browser.getVersion"[^\0]*\0/);
  assert.match(ecrits.join(''), /"sessionId":"S1"/);
  lecture.write(JSON.stringify({ id: 2, result: { frameId: 'F' } }) + '\0' + JSON.stringify({ method: 'Page.loadEventFired', params: {} }) + '\0');
  lecture.write(JSON.stringify({ id: 1, error: { message: 'refusé' } }).slice(0, 10));
  lecture.write(JSON.stringify({ id: 1, error: { message: 'refusé' } }).slice(10) + '\0');
  assert.deepEqual(await p2, { frameId: 'F' });
  await assert.rejects(p1, /refusé/);
  assert.deepEqual(evenements, ['Page.loadEventFired']);
  cdp.fermer('fin');
  await assert.rejects(cdp.envoyer('X'), /navigateur arrêté/);
});

test('navigateur : aucune adresse d’achat chargée (panier, commande, paiement, abonnement) ; « carte » n’est pas « cart »', () => {
  assert.ok(adresseAchat('https://www.cadastre.gouv.fr/scpc/afficherPanier.do?x=1'), 'mots collés séparés (afficherPanier)');
  assert.ok(adresseAchat('https://www.cadastre.gouv.fr/scpc/commande/valider'));
  assert.ok(adresseAchat('https://www.cadastre.gouv.fr/paiement'));
  assert.ok(!adresseAchat('https://www.cadastre.gouv.fr/scpc/afficherCarteParcelle.do?p=1'));
  assert.ok(!adresseAchat('https://www.cadastre.gouv.fr/scpc/imprimerExtraitPlan.do'));
  assert.ok(!adresseAchat('pas une adresse'));
});

test('route : validation, état du navigateur, documents servis sans détour, rangement contrôlé', async () => {
  const express = require('express');
  const { creerRouteurNavigation } = require('../src/routes/navigation');
  const lances = [];
  const gestion = {
    lancerPlanCadastre: (d) => { lances.push(d); return 'T1'; },
    tache: (id) => (id === 'T1' ? { id, etat: 'fini', documents: [{ id: 'plan' }], resultat: { dossierId: 'u1' } } : null),
    document: (id, doc) => (id === 'T1' && doc === 'plan' ? { nom: 'Plan de situation.pdf', type: 'application/pdf', octets: Buffer.from('%PDF-1.4') } : null),
    capture: () => null,
    annuler: () => true
  };
  const feature = { type: 'Feature', properties: { nom_com: 'Blois' }, geometry: { type: 'MultiPolygon', coordinates: [[[[1.318, 47.594], [1.319, 47.594], [1.319, 47.595], [1.318, 47.594]], [[1.3182, 47.5942], [1.3184, 47.5942], [1.3184, 47.5944], [1.3182, 47.5942]]]] } };
  const injections = { fetch: async () => ({ ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), json: async () => ({ type: 'FeatureCollection', features: [feature] }) }) };
  const depot = { trouverParId: (id) => (id === 'u2' ? { id: 'u2', nasDossier: 'AUTRE' } : null) };
  const app = express();
  app.use(express.json());
  app.use('/api', creerRouteurNavigation({ cheminDb: path.join(os.tmpdir(), 'x.db'), nasRacine: os.tmpdir() }, { lireJsonBrut: (k, d) => d, ecrireJsonBrut: () => {} }, depot, { gestionnaire: gestion, injections }));
  const serveur = app.listen(0);
  const B = `http://127.0.0.1:${serveur.address().port}/api`;
  const poster = (u, b) => fetch(B + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  try {
    assert.equal((await poster('/navigation/plan-cadastre', { insee: 'xx', parcelles: 'AL 694' })).status, 400);
    assert.equal((await poster('/navigation/plan-cadastre', { insee: '41018', parcelles: '' })).status, 400);
    const trop = await poster('/navigation/plan-cadastre', { insee: '41018', parcelles: Array.from({ length: 13 }, (_, i) => `AL ${i + 1}`).join(', ') });
    assert.equal(trop.status, 400);
    const ok = await poster('/navigation/plan-cadastre', { insee: '41018', parcelles: 'AL 694', echelle: 1000, dossierId: 'u1' });
    assert.deepEqual(await ok.json(), { id: 'T1' });
    assert.equal(lances[0].commune, 'Blois');
    assert.equal(lances[0].parcelles[0].anneaux.length, 1, 'contour de l’IGN transmis');
    assert.equal(lances[0].parcelles[0].trous.length, 1, 'trou de la parcelle transmis');
    assert.equal(lances[0].echelle, 1000);
    const reglages = await fetch(B + '/navigation/reglages').then((r) => r.json());
    assert.deepEqual(Object.keys(reglages).sort(), ['navigateurNom', 'navigateurTrouve'], 'plus aucun réglage de compte');
    assert.equal((await fetch(B + '/navigation/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404, 'plus de réglage modifiable');
    assert.equal((await poster('/navigation/consultation', { site: 'geofoncier' })).status, 404, 'Géofoncier retiré');
    assert.equal((await fetch(B + '/navigation/taches/T9')).status, 404);
    const doc = await fetch(B + '/navigation/taches/T1/documents/plan?telecharger=1');
    assert.equal(doc.headers.get('content-type'), 'application/pdf');
    assert.equal(doc.headers.get('x-content-type-options'), 'nosniff');
    assert.match(doc.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''Plan%20de%20situation\.pdf/);
    const ailleurs = await poster('/navigation/taches/T1/documents/plan/ranger', { dossierId: 'u2' });
    assert.equal(ailleurs.status, 400);
    assert.match((await ailleurs.json()).erreur, /autre dossier/);
  } finally { serveur.close(); }
});

test('route : une panne de l’IGN n’est pas une parcelle introuvable', async () => {
  const express = require('express');
  const { creerRouteurNavigation } = require('../src/routes/navigation');
  const app = express();
  app.use(express.json());
  app.use('/api', creerRouteurNavigation({ cheminDb: path.join(os.tmpdir(), 'x.db'), nasRacine: '' }, { lireJsonBrut: (k, d) => d, ecrireJsonBrut: () => {} }, null,
    { gestionnaire: { lancerPlanCadastre: () => 'T1' }, injections: { fetch: async () => { throw new Error('réseau'); } } }));
  const serveur = app.listen(0);
  try {
    // Une parcelle jamais demandée (le cache de l'IGN garde celles des autres tests).
    const r = await fetch(`http://127.0.0.1:${serveur.address().port}/api/navigation/plan-cadastre`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ insee: '41018', parcelles: 'ZZ 999' }) });
    assert.equal(r.status, 502);
  } finally { serveur.close(); }
});

test('ancien compte Géofoncier (0.229.0) : effacé de la base au démarrage', () => {
  const stock = { 'sites-agent': { geofoncier: { identifiant: 'e@x.fr', motDePasse: 'Secret' } } };
  creerGestionnaireTaches({ parametresRepo: { lireJsonBrut: (k, d) => (k in stock ? stock[k] : d), ecrireJsonBrut: (k, v) => { stock[k] = v; } }, cheminDb: path.join(os.tmpdir(), 'x.db') });
  assert.deepEqual(stock['sites-agent'], {});
});

test('file des consultations : trois en attente au plus, une tâche en cours n’est jamais oubliée', async () => {
  let debloquer;
  const bloque = new Promise((r) => { debloquer = r; });
  // Un « navigateur » qui ne s'ouvre qu'au déblocage : la première tâche reste en cours, les suivantes attendent.
  const lancer = async () => { await bloque; throw new Error('pas de navigateur dans les tests'); };
  const g = creerGestionnaireTaches({ parametresRepo: { lireJsonBrut: () => ({}) }, cheminDb: path.join(os.tmpdir(), 'x.db'), injections: { lancer } });
  const plan = () => g.lancerPlanCadastre({ commune: 'Blois', insee: '41018', parcelles: [{ section: 'AL', numero: '1', anneaux: [] }] });
  const ids = [plan(), plan(), plan()];
  assert.throws(plan, (e) => e.statut === 429);
  assert.ok(ids.every((id) => g.tache(id)), 'les trois tâches restent suivies');
  debloquer();
  for (let i = 0; i < 50 && ids.some((id) => !g.tache(id).finiLe); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(ids.every((id) => g.tache(id).etat === 'erreur'), 'chaque tâche finit en erreur dite');
  assert.match(g.tache(ids[0]).erreur, /pas de navigateur/);
});

// Parcours réel, à la demande seulement (réseau et Chrome nécessaires) : vrai site du cadastre, deux parcelles publiques de Blois.
test('parcours réel cadastre.gouv.fr (CLAIRE_TEST_NAVIGATEUR=1)', { skip: !process.env.CLAIRE_TEST_NAVIGATEUR }, async () => {
  const { SessionNavigation } = require('../src/navigateur/session');
  const { planCadastre, DOMAINES_CADASTRE } = require('../src/navigateur/planCadastre');
  const { parcelleCadastre } = require('../src/urbanisme');
  const anneaux = (g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]));
  const parcelles = [];
  for (const n of ['694', '887']) { const f = await parcelleCadastre('41018', 'AL', n); parcelles.push({ section: 'AL', numero: n, anneaux: anneaux(f.geometry) }); }
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'claire-nav-'));
  const s = await SessionNavigation.ouvrir({ profil, domaines: DOMAINES_CADASTRE });
  try {
    const { plans } = await planCadastre(s, { commune: 'Blois', insee: '41018', parcelles });
    assert.equal(plans.length, 1, 'deux parcelles voisines : un plan');
    assert.equal(plans[0].echelle, 500);
    assert.ok(plans[0].emprisePlan, 'emprise envoyée par le site');
    assert.ok(plans[0].pdf.subarray(0, 5).toString() === '%PDF-');
    const sortie = await surlignerParcelles(plans[0].pdf, plans[0]);
    assert.ok(sortie.length > plans[0].pdf.length);
  } finally { await s.fermer(); }
});

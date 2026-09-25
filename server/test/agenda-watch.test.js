'use strict';

// Tour périodique de lecture de l'agenda de l'office (voir src/agendaWatch.js). Le plus important
// à couvrir : ne JAMAIS écraser une date déjà connue (saisie manuelle ou tour précédent), et ne
// jamais planter le tour entier si le flux est injoignable ou mal formé.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  appliquerDetectionsAgenda, executerTourSurveillanceAgenda, executerEtEnregistrerTourAgenda, dateDuJourParis
} = require('../src/agendaWatch');
const { ouvrirDb } = require('../src/db');
const { creerDepot } = require('../src/dossiersRepo');
const { creerRepoParametres } = require('../src/parametresRepo');

function fauxFetch(reponses) {
  let appel = 0;
  return async () => {
    const r = reponses[Math.min(appel, reponses.length - 1)];
    appel++;
    return r;
  };
}

test('appliquerDetectionsAgenda : renseigne appelFonds et projetEnvoye, journalise, marque validé', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });

  const detections = [
    { dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-14', reference: 'DUPONT / MARTIN - Appel de fonds', appelFonds: true, projetEnvoye: false }
  ];
  // La date retenue est celle du JOUR DE LA DÉTECTION, pas celle du rendez-vous (2026-10-14).
  const resultat = appliquerDetectionsAgenda(depot, detections, '2026-09-25');
  assert.equal(resultat.misAJour.length, 1);
  assert.equal(resultat.misAJour[0].action, 'appelFonds');

  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, '2026-09-25');
  assert.equal(d.detectionsAgenda.appelFonds, '2026-09-25');
  assert.equal(d.echeancesValidees.appelFonds, true);
  assert.equal(d.historique.length, 1);
  assert.match(d.historique[0].texte, /Envoi appel de fonds relevé dans l.agenda/);
  db.close();
});

test('appliquerDetectionsAgenda : n\'ecrase JAMAIS une date deja connue', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', appelFonds: '2026-09-01' });

  const detections = [
    { dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-14', reference: 'DUPONT / MARTIN', appelFonds: true, projetEnvoye: false }
  ];
  const resultat = appliquerDetectionsAgenda(depot, detections);
  assert.equal(resultat.misAJour.length, 0);
  assert.equal(resultat.dejaRenseignes.length, 1);

  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, '2026-09-01', 'la date deja saisie ne doit jamais etre remplacee');
  db.close();
});

test('appliquerDetectionsAgenda : une action deja relevee n\'est plus jamais retraitee', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  const det = [{ dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-14', reference: 'DUPONT / MARTIN', appelFonds: true, projetEnvoye: false }];
  appliquerDetectionsAgenda(depot, det, '2026-09-25');
  // L'étude efface la date à la main : le tour suivant ne doit PAS la réécrire à la date du jour.
  const d = depot.trouverParId('d1');
  d.appelFonds = '';
  depot.remplacer('d1', d);
  const second = appliquerDetectionsAgenda(depot, det, '2026-09-30');
  assert.equal(second.misAJour.length, 0);
  assert.equal(second.dejaRenseignes.length, 0);
  assert.equal(depot.trouverParId('d1').appelFonds, '');
  assert.equal(depot.trouverParId('d1').historique.length, 1);
  db.close();
});

test('appliquerDetectionsAgenda : une date deja saisie a la main pose le repere sans etre ecrasee', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', appelFonds: '2026-09-01' });
  const det = [{ dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-14', reference: 'DUPONT / MARTIN', appelFonds: true, projetEnvoye: false }];
  appliquerDetectionsAgenda(depot, det, '2026-09-25');
  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, '2026-09-01');
  assert.equal(d.detectionsAgenda.appelFonds, '2026-09-25');
  // Même vidée ensuite, elle ne sera plus réécrite par l'agenda.
  d.appelFonds = '';
  depot.remplacer('d1', d);
  appliquerDetectionsAgenda(depot, det, '2026-09-30');
  assert.equal(depot.trouverParId('d1').appelFonds, '');
  db.close();
});

test('appliquerDetectionsAgenda : un dossier archive n\'est jamais touche', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN', archive: true });

  const detections = [
    { dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-14', reference: 'DUPONT / MARTIN', appelFonds: true, projetEnvoye: false }
  ];
  appliquerDetectionsAgenda(depot, detections);
  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, undefined);
  db.close();
});

test('appliquerDetectionsAgenda : sans correspondance, liste dans sansCorrespondance sans rien ecrire', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const detections = [
    { dossierId: null, dossierNom: null, dateIso: '2026-10-14', reference: 'INCONNU', resume: 'VTE - INCONNU', appelFonds: true, projetEnvoye: false }
  ];
  const resultat = appliquerDetectionsAgenda(depot, detections);
  assert.equal(resultat.sansCorrespondance.length, 1);
  assert.equal(resultat.misAJour.length, 0);
  db.close();
});

test('appliquerDetectionsAgenda : deux detections separees pour le meme dossier ecrivent bien les deux champs', () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });

  const detections = [
    { dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-01', reference: 'DUPONT / MARTIN - Appel de fonds', appelFonds: true, projetEnvoye: false },
    { dossierId: 'd1', dossierNom: 'DUPONT / MARTIN', dateIso: '2026-10-10', reference: 'DUPONT / MARTIN - projet envoye', appelFonds: false, projetEnvoye: true }
  ];
  appliquerDetectionsAgenda(depot, detections, '2026-09-25');
  const d = depot.trouverParId('d1');
  assert.equal(d.appelFonds, '2026-09-25');
  assert.equal(d.projetEnvoye, '2026-09-25');
  assert.equal(d.historique.length, 2);
  db.close();
});

test('executerTourSurveillanceAgenda : sans URL, renvoie une erreur sans jamais planter', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const resultat = await executerTourSurveillanceAgenda(depot, '', fauxFetch([]));
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /Aucune adresse/);
  db.close();
});

test('executerTourSurveillanceAgenda : une reponse HTTP en erreur est rapportee proprement', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const resultat = await executerTourSurveillanceAgenda(depot, 'https://example.test/agenda.ics', fauxFetch([{ ok: false, status: 404 }]));
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /404/);
  db.close();
});

test('executerTourSurveillanceAgenda : bout en bout avec un vrai flux et un vrai depot', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  depot.creer({ id: 'd1', nom: 'DUPONT / MARTIN' });
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:VTE - DUPONT / MARTIN - Appel de fonds',
    'DTSTART:20261014',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const fetchFn = fauxFetch([{ ok: true, status: 200, text: async () => ics }]);
  const resultat = await executerTourSurveillanceAgenda(depot, 'https://example.test/agenda.ics', fetchFn);
  assert.equal(resultat.ok, true);
  assert.equal(resultat.dossiersVerifies, 1);
  assert.equal(resultat.misAJour.length, 1);
  assert.equal(depot.trouverParId('d1').appelFonds, dateDuJourParis());
  db.close();
});

test('executerEtEnregistrerTourAgenda : persiste le compte rendu, y compris quand l\'URL manque', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  await executerEtEnregistrerTourAgenda(depot, parametresRepo, fauxFetch([]), 'manuel');
  const dernierTour = parametresRepo.lireDernierTourAgenda();
  assert.equal(dernierTour.ok, false);
  assert.equal(dernierTour.declenche, 'manuel');
  db.close();
});

test('executerEtEnregistrerTourAgenda : un tour reussi met a jour le compte rendu (automatique par defaut)', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  parametresRepo.ecrireReglagesAgenda({ icsUrl: 'https://example.test/agenda.ics' });
  depot.creer({ id: 'd1', nom: 'DURAND / LEROY' });
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:VTE - DURAND / LEROY - projet envoye\r\nDTSTART:20261020\r\nEND:VEVENT\r\nEND:VCALENDAR';
  await executerEtEnregistrerTourAgenda(depot, parametresRepo, fauxFetch([{ ok: true, status: 200, text: async () => ics }]));
  const dernierTour = parametresRepo.lireDernierTourAgenda();
  assert.equal(dernierTour.ok, true);
  assert.equal(dernierTour.declenche, 'automatique');
  assert.equal(dernierTour.misAJour.length, 1);
  assert.equal(depot.trouverParId('d1').projetEnvoye, dateDuJourParis());
  db.close();
});

// Erreur 503 signalée par l'étude (25/09) : le serveur du calendrier refusait la requête de Node.
test('lecture ics : en-tetes de client d\'agenda, webcal converti en https, relance sur 503', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const appels = [];
  const ics = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n';
  const reponses = [{ ok: false, status: 503 }, { ok: true, status: 200, text: async () => ics }];
  const fetchFn = async (url, options) => { appels.push({ url, options }); return reponses[appels.length - 1]; };
  const resultat = await executerTourSurveillanceAgenda(depot, 'webcal://outlook.example/owa/calendar/x/calendar.ics', fetchFn, 0);
  assert.equal(resultat.ok, true, resultat.erreur);
  assert.equal(appels.length, 2, 'une seule relance apres le 503');
  assert.equal(appels[0].url, 'https://outlook.example/owa/calendar/x/calendar.ics');
  assert.match(appels[0].options.headers['User-Agent'], /Mozilla/);
  assert.match(appels[0].options.headers.Accept, /text\/calendar/);
  db.close();
});

test('lecture ics : 503 persistant → message clair, jamais plus d\'une relance', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  let n = 0;
  const resultat = await executerTourSurveillanceAgenda(depot, 'https://x.test/calendar.ics', async () => { n++; return { ok: false, status: 503 }; }, 0);
  assert.equal(resultat.ok, false);
  assert.equal(n, 2);
  assert.match(resultat.erreur, /indisponible pour l'instant \(erreur 503\)/);
  db.close();
});

test('lecture ics : l\'erreur dit qui a repondu (hote, serveur, identifiant, texte) sans jamais le jeton', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const entetes = { server: 'Microsoft-HTTPAPI/2.0', 'request-id': 'abc-123' };
  const reponse = () => ({
    ok: false, status: 503,
    headers: { get: (n) => entetes[n.toLowerCase()] || null },
    text: async () => '<html><head><style>b{}</style></head><body><h1>Service Unavailable</h1></body></html>'
  });
  const resultat = await executerTourSurveillanceAgenda(depot, 'https://outlook.office365.com/owa/calendar/JETONSECRET/calendar.ics', async () => reponse(), 0);
  assert.match(resultat.erreur, /hôte outlook\.office365\.com/);
  assert.match(resultat.erreur, /serveur « Microsoft-HTTPAPI\/2\.0 »/);
  assert.match(resultat.erreur, /requête abc-123/);
  assert.match(resultat.erreur, /réponse « Service Unavailable »/);
  assert.doesNotMatch(resultat.erreur, /JETONSECRET/);
  db.close();
});

test('lecture ics : un lien HTML (sans VCALENDAR) est signale au lieu de rendre 0 mise a jour', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const resultat = await executerTourSurveillanceAgenda(depot, 'https://x.test/calendar.html',
    async () => ({ ok: true, status: 200, text: async () => '<html><body>Calendrier</body></html>' }), 0);
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /calendar\.ics/);
  db.close();
});

test('lecture ics : proxy Squid du bureau → message qui nomme le proxy et la cause, sans jeton', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const entetes = { server: 'squid', via: '1.1 nacXwan-Proxy (squid)', 'x-squid-error': 'ERR_DNS_FAIL 0' };
  const corps = '<html><body><h1>ERREUR</h1><p>L\'erreur suivante s\'est produite en essayant d\'accéder à l\'URL : '
    + '<a href="https://mail.authentic-connect.fr/cal/JETONSECRET/agenda.ics">https://mail.authentic-connect.fr/cal/JETONSECRET/agenda.ics</a></p>'
    + '<p>Impossible de déterminer l\'adresse IP du nom d\'hôte mail.authentic-connect.fr</p></body></html>';
  const reponse = () => ({ ok: false, status: 503, headers: { get: (n) => entetes[n.toLowerCase()] || null }, text: async () => corps });
  const resultat = await executerTourSurveillanceAgenda(depot, 'https://mail.authentic-connect.fr/cal/JETONSECRET/agenda.ics', async () => reponse(), 0);
  assert.match(resultat.erreur, /proxy du réseau du bureau \(« nacXwan-Proxy »\)/);
  assert.match(resultat.erreur, /résolution DNS/);
  assert.match(resultat.erreur, /ERR_DNS_FAIL/);
  assert.match(resultat.erreur, /Impossible de déterminer l'adresse IP/);
  assert.doesNotMatch(resultat.erreur, /JETONSECRET/);
  db.close();
});

test('lecture ics : sans en-tete X-Squid-Error, la cause est lue dans la page du proxy', () => {
  const { causeProxy, texteSansAdresses } = require('../src/agendaWatch');
  const entetes = { via: '1.1 nacXwan-Proxy (squid)' };
  const rep = { headers: { get: (n) => entetes[n.toLowerCase()] || null } };
  const cause = causeProxy(rep, texteSansAdresses('<p>La tentative de connexion à 1.2.3.4 a échoué.</p>'));
  assert.equal(cause.nom, 'nacXwan-Proxy');
  assert.equal(cause.code, 'ERR_CONNECT_FAIL');
  assert.equal(causeProxy({ headers: { get: (n) => (n === 'server' ? 'Microsoft-HTTPAPI/2.0' : null) } }, ''), null);
  assert.equal(texteSansAdresses('voir http://a.b/c/SECRET?x=1 fin'), 'voir a.b fin');
});

test('lecture ics : lien en http bloque par le proxy → relu en https et lien enregistre corrige', async () => {
  const db = ouvrirDb(':memory:');
  const depot = creerDepot(db);
  const parametresRepo = creerRepoParametres(db);
  parametresRepo.ecrireReglagesAgenda({ icsUrl: 'http://mail.exemple.test/cal/x/agenda.ics' });
  const ics = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n';
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    if (url.startsWith('http://')) return { ok: false, status: 403, headers: { get: (n) => (n === 'server' ? 'squid' : null) }, text: async () => '' };
    return { ok: true, status: 200, text: async () => ics };
  };
  const retour = await executerEtEnregistrerTourAgenda(depot, parametresRepo, fetchFn);
  assert.equal(retour.ok, true);
  assert.equal(retour.lienPasseEnHttps, true);
  assert.equal(retour.adresseCorrigee, undefined);
  assert.equal(parametresRepo.lireReglagesAgenda().icsUrl, 'https://mail.exemple.test/cal/x/agenda.ics');
  assert.equal(parametresRepo.lireDernierTourAgenda().lienPasseEnHttps, true);
  assert.ok(urls.some((u) => u.startsWith('https://')));
  db.close();
});

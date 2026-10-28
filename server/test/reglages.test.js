'use strict';

// Route /api/reglages (voir src/routes/reglages.js) : lecture/écriture des réglages d'envoi
// d'emails et envoi d'un message de test à UN collaborateur, toujours à partir de ce qui est déjà
// enregistré en base — jamais d'un formulaire pas encore validé (voir le commentaire dans la
// route).
//
// La couche d'envoi est INJECTÉE dans creerApp (`envoyerEmailFn`) : aucun serveur SMTP ni HTTP
// n'est démarré ici. Un faux serveur laissé ouvert par un test qui échoue fait pendre toute la
// suite — déjà rencontré sur la version précédente de ce fichier.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { MESSAGE_TEST, adresseEmailValide } = require('../src/routes/reglages');

function config() {
  return { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' };
}

// Réglages SMTP complets, réutilisés par la plupart des tests.
const SMTP = { smtpHote: 'smtp.test', emailPasserelle: 'passerelle@etude.fr' };

const envois = [];
let reponseEnvoi = { ok: true, erreur: null };
const envoyerEmailFn = async (reglages, destinataire, texte) => {
  envois.push({ reglages, destinataire, texte });
  return reponseEnvoi;
};

let db, serveurApp, baseUrl, jeton, depot;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth, depot: d } = creerApp({ db, config: config(), envoyerEmailFn });
  depot = d;
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

test('GET /api/reglages sans authentification : 401', async () => {
  const reponse = await fetch(`${baseUrl}/api/reglages`);
  assert.equal(reponse.status, 401);
});

test('GET /api/reglages renvoie les valeurs par défaut au premier appel', async () => {
  const corps = await (await appeler('/api/reglages')).json();
  assert.deepEqual(corps, {
    emailActif: false, emailPasserelle: '', smtpHote: '', smtpPort: 25, smtpSecurise: false,
    smtpUtilisateur: '', smtpExpediteur: '', copieEmail: '', emailsResponsables: {}, fonctionsResponsables: {},
    smtpMotDePasseEnregistre: false
  });
});

test('PUT /api/reglages enregistre, GET relit la même chose ensuite (y compris la copie)', async () => {
  const envoye = {
    emailActif: true, ...SMTP, smtpPort: 587, smtpSecurise: false,
    smtpUtilisateur: '', smtpExpediteur: 'claire@etude.fr',
    copieEmail: 'gossart@etude.fr', emailsResponsables: { 'Bastien ANGLUMENT': 'bastien@etude.fr' },
    fonctionsResponsables: { 'Julie VASSELIN': 'Clerc de notaire' }
  };
  const attendu = { ...envoye, smtpMotDePasseEnregistre: false };
  const corpsEcrit = await (await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify(envoye) })).json();
  assert.deepEqual(corpsEcrit, attendu);

  const corpsRelu = await (await appeler('/api/reglages')).json();
  assert.deepEqual(corpsRelu, attendu);
});

// Un mot de passe de messagerie n'a aucune raison de retraverser le réseau du bureau à chaque
// ouverture de l'écran Réglages : la route ne renvoie qu'un booléen, et un enregistrement qui ne
// le réémet pas ne doit surtout pas l'effacer au passage.
test('GET/PUT /api/reglages : le mot de passe SMTP ne ressort jamais, et survit à un enregistrement', async () => {
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, ...SMTP, smtpUtilisateur: 'claire@etude.fr', smtpMotDePasse: 'jeton-applicatif', emailsResponsables: {} })
  });
  const corps = await (await appeler('/api/reglages')).json();
  assert.equal(corps.smtpMotDePasse, undefined);
  assert.equal(corps.smtpMotDePasseEnregistre, true);

  // Le formulaire réenregistre sans le renvoyer : il reste en place.
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, ...SMTP, smtpUtilisateur: 'claire@etude.fr', copieEmail: 'gossart@etude.fr', emailsResponsables: {} })
  });
  const relu = await (await appeler('/api/reglages')).json();
  assert.equal(relu.smtpMotDePasseEnregistre, true);
  assert.equal(relu.copieEmail, 'gossart@etude.fr');

  // Une chaîne vide explicite l'efface (retour à l'envoi anonyme).
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, ...SMTP, smtpUtilisateur: '', smtpMotDePasse: '', emailsResponsables: {} })
  });
  assert.equal((await (await appeler('/api/reglages')).json()).smtpMotDePasseEnregistre, false);
});

test('POST /api/reglages/tester-email sans serveur SMTP enregistré : 400 explicite', async () => {
  await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify({ emailActif: false, smtpHote: '', emailPasserelle: '', emailsResponsables: {} }) });
  const reponse = await appeler('/api/reglages/tester-email', { method: 'POST', body: JSON.stringify({ responsable: 'Bastien ANGLUMENT' }) });
  assert.equal(reponse.status, 400);
  assert.match((await reponse.json()).erreur, /passerelle/i);
});

test('POST /api/reglages/tester-email : sans email pour ce responsable, 400', async () => {
  await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify({ emailActif: true, ...SMTP, emailsResponsables: {} }) });
  const reponse = await appeler('/api/reglages/tester-email', { method: 'POST', body: JSON.stringify({ responsable: 'Julie VASSELIN' }) });
  assert.equal(reponse.status, 400);
  assert.match((await reponse.json()).erreur, /Julie VASSELIN/);
});

test('POST /api/reglages/tester-email : envoie bien le MESSAGE_TEST à l\'adresse enregistrée en base (pas celle du corps de la requête)', async () => {
  envois.length = 0;
  reponseEnvoi = { ok: true, erreur: null };
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, ...SMTP, emailsResponsables: { 'Jérémy SAUJOT': 'jeremy@etude.fr' } })
  });
  const reponse = await appeler('/api/reglages/tester-email', { method: 'POST', body: JSON.stringify({ responsable: 'Jérémy SAUJOT' }) });
  assert.equal(reponse.status, 200);
  // L'adresse réellement utilisée revient à l'écran, pour qu'on la relise avant de chercher
  // le message dans Teams.
  assert.deepEqual(await reponse.json(), { ok: true, destinataire: 'jeremy@etude.fr', passerelle: 'passerelle@etude.fr' });
  assert.equal(envois.length, 1);
  assert.equal(envois[0].destinataire, 'jeremy@etude.fr');
  assert.equal(envois[0].texte, MESSAGE_TEST);
  // Les réglages complets sont transmis : sans eux, la couche d'envoi n'aurait ni serveur ni
  // passerelle.
  assert.equal(envois[0].reglages.smtpHote, 'smtp.test');
  assert.equal(envois[0].reglages.emailPasserelle, 'passerelle@etude.fr');
});

test('POST /api/reglages/tester-email : un envoi en échec → 502', async () => {
  reponseEnvoi = { ok: false, erreur: 'Envoi SMTP impossible (550 relay denied).' };
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, ...SMTP, emailsResponsables: { 'Jérémy SAUJOT': 'jeremy@etude.fr' } })
  });
  const reponse = await appeler('/api/reglages/tester-email', { method: 'POST', body: JSON.stringify({ responsable: 'Jérémy SAUJOT' }) });
  assert.equal(reponse.status, 502);
  assert.match((await reponse.json()).erreur, /550 relay denied/);
  reponseEnvoi = { ok: true, erreur: null };
});

test('POST /api/reglages/tester-email : une adresse malformée est refusée AVANT tout envoi', async () => {
  envois.length = 0;
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, ...SMTP, emailsResponsables: { 'Jérémy SAUJOT': 'jeremy@etude' } })
  });
  const reponse = await appeler('/api/reglages/tester-email', { method: 'POST', body: JSON.stringify({ responsable: 'Jérémy SAUJOT' }) });
  assert.equal(reponse.status, 400);
  assert.match((await reponse.json()).erreur, /jeremy@etude.*Rien n'a été envoyé/);
  assert.equal(envois.length, 0);
});

test('POST /api/reglages/tester-email : une boîte-passerelle malformée est refusée AVANT tout envoi', async () => {
  envois.length = 0;
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ emailActif: true, smtpHote: 'smtp.test', emailPasserelle: 'passerelle@@etude.fr', emailsResponsables: { 'Jérémy SAUJOT': 'jeremy@etude.fr' } })
  });
  const reponse = await appeler('/api/reglages/tester-email', { method: 'POST', body: JSON.stringify({ responsable: 'Jérémy SAUJOT' }) });
  assert.equal(reponse.status, 400);
  assert.match((await reponse.json()).erreur, /boîte-passerelle/);
  assert.equal(envois.length, 0);
});

test('adresseEmailValide : forme attendue, fautes de frappe écartées', () => {
  assert.equal(adresseEmailValide('Bastien.ANGLUMENT@gossart.notaires.fr'), true);
  assert.equal(adresseEmailValide(' bastien@etude.fr '), true);
  for (const mauvaise of ['', 'bastien', 'bastien@etude', 'bastien@@etude.fr', 'bas tien@etude.fr', 'bastien@etude..fr', 'bastien@etude.fr.', '@etude.fr', null]) {
    assert.equal(adresseEmailValide(mauvaise), false, String(mauvaise));
  }
});

// ---- Compte rendu du dernier tour, et déclenchement manuel ----
// Ces deux routes existent parce que la tâche de rappels tourne dans un serveur SANS FENÊTRE :
// sans elles, un envoi cassé (mot de passe d'application révoqué) arrêtait tout en silence, et
// vérifier la chaîne jusqu'à Teams supposait d'attendre le prochain tour automatique.

test('GET /api/reglages/dernier-tour : null tant que la tâche n\'a rien tenté', async () => {
  const reponse = await appeler('/api/reglages/dernier-tour');
  assert.equal(reponse.status, 200);
  assert.equal((await reponse.json()).dernierTour, null);
});

test('POST /api/reglages/lancer-rappels : refusé tant que l\'envoi n\'est pas activé', async () => {
  await appeler('/api/reglages', { method: 'PUT', body: JSON.stringify({ ...SMTP, emailActif: false }) });
  const reponse = await appeler('/api/reglages/lancer-rappels', { method: 'POST' });
  assert.equal(reponse.status, 400);
  assert.match((await reponse.json()).erreur, /activé|renseignés/);
});

test('POST /api/reglages/lancer-rappels : exécute un vrai tour et renvoie son compte rendu', async () => {
  depot.creer({ id: 'rappel-manuel', nom: 'DUPONT / MARTIN', responsable: 'Bastien ANGLUMENT', pret: joursApres(15) });
  await appeler('/api/reglages', {
    method: 'PUT',
    body: JSON.stringify({ ...SMTP, emailActif: true, emailsResponsables: { 'Bastien ANGLUMENT': 'b@etude.fr' } })
  });

  envois.length = 0;
  const reponse = await appeler('/api/reglages/lancer-rappels', { method: 'POST' });
  assert.equal(reponse.status, 200);
  const corps = await reponse.json();
  assert.equal(corps.ok, true);
  assert.equal(corps.rappelsDus, 1);
  assert.equal(corps.rappelsEnvoyes, 1);
  assert.equal(envois.length, 1, 'le tour manuel passe bien par la couche d\'envoi injectée');
  // La couche injectée reçoit l'adresse du VRAI destinataire : le détournement « À = passerelle,
  // Objet = destinataire » vit à l'intérieur d'envoyerEmail(), donc sous ce point d'injection.
  assert.equal(envois[0].destinataire, 'b@etude.fr');

  // Le compte rendu revient avec la réponse ET reste lisible ensuite : c'est lui qui alimente
  // l'encart de l'écran Réglages, y compris après un rechargement de la page.
  assert.equal(corps.dernierTour.declenche, 'manuel');
  const relu = await (await appeler('/api/reglages/dernier-tour')).json();
  assert.equal(relu.dernierTour.rappelsEnvoyes, 1);
  assert.equal(relu.dernierTour.declenche, 'manuel');
});

// Échéance à J-15 pile, calculée depuis aujourd'hui : un ISO figé rendrait le test caduc au bout
// de quelques semaines (le rappel ne serait plus dû).
// Le jour de PARIS (comme les rappels) : en UTC, le test échouait chaque nuit entre minuit et 1 h ou 2 h.
function joursApres(n) {
  const d = new Date(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test('délais des rappels : valeurs d origine, enregistrement assaini, rétablissement', async () => {
  const avant = await (await appeler('/api/reglages/delais-rappels')).json();
  const pret = avant.echeances.find((e) => e.cle === 'pret');
  assert.deepEqual(pret.jours, [15, 7]);
  assert.ok(avant.echeances.some((e) => e.groupe === 'succession' && e.cle === 'notoriete'));
  const mis = await (await appeler('/api/reglages/delais-rappels', { method: 'PUT', body: JSON.stringify({ delais: { pret: [30, 10, 10], notoriete: [], bidon: [1] } }) })).json();
  assert.deepEqual(mis.echeances.find((e) => e.cle === 'pret').jours, [30, 10]);
  assert.deepEqual(mis.echeances.find((e) => e.cle === 'notoriete').jours, []);
  assert.deepEqual(mis.echeances.find((e) => e.cle === 'rendezVousSignature').jours, [25, 15]);
  assert.equal((await appeler('/api/reglages/delais-rappels', { method: 'PUT', body: JSON.stringify({ delais: [1] }) })).status, 400);
  const retabli = await (await appeler('/api/reglages/delais-rappels', { method: 'PUT', body: JSON.stringify({ delais: {} }) })).json();
  assert.deepEqual(retabli.echeances.find((e) => e.cle === 'pret').jours, [15, 7]);
});

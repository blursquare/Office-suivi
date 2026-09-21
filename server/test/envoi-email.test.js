'use strict';

// Couche d'envoi (voir src/envoiEmail.js) : un email SMTP vers la boîte-passerelle, dont l'OBJET
// porte l'adresse du vrai destinataire — c'est ce que le flux Power Automate lit pour router le
// message Teams. Le transport est injecté : aucun serveur SMTP, aucun serveur HTTP n'est démarré
// ici (un faux serveur laissé ouvert par un test qui échoue fait pendre toute la suite — déjà
// rencontré sur la version précédente de ce fichier).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { envoyerEmail, envoiConfigure, optionsTransport } = require('../src/envoiEmail');

const REGLAGES = Object.freeze({
  emailActif: true,
  emailPasserelle: 'passerelle@etude.fr',
  smtpHote: 'smtp.test',
  smtpPort: 25,
  smtpSecurise: false,
  smtpUtilisateur: '',
  smtpMotDePasse: '',
  smtpExpediteur: 'claire@etude.fr'
});

// Capture ce qui aurait été envoyé, sans jamais ouvrir de connexion.
function transportEspion(resultat) {
  const envois = [];
  const options = [];
  const creer = (opts) => {
    options.push(opts);
    return {
      sendMail: async (message) => {
        envois.push(message);
        if (resultat instanceof Error) throw resultat;
        return { messageId: 'test' };
      }
    };
  };
  return { creer, envois, options };
}

test('sans serveur SMTP : erreur explicite, aucun envoi tenté', async () => {
  const espion = transportEspion();
  const r = await envoyerEmail({ ...REGLAGES, smtpHote: '' }, 'bastien@etude.fr', 'Test', espion.creer);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Réglages/);
  assert.equal(espion.envois.length, 0);
});

test('sans boîte-passerelle : erreur explicite, aucun envoi tenté', async () => {
  const espion = transportEspion();
  const r = await envoyerEmail({ ...REGLAGES, emailPasserelle: '' }, 'bastien@etude.fr', 'Test', espion.creer);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /passerelle/i);
  assert.equal(espion.envois.length, 0);
});

test('sans adresse destinataire : erreur explicite', async () => {
  const espion = transportEspion();
  const r = await envoyerEmail(REGLAGES, '', 'Test', espion.creer);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /collaborateur/);
  assert.equal(espion.envois.length, 0);
});

// Le cœur de la convention imposée par le flux : l'email part TOUJOURS vers la passerelle, et
// c'est l'objet qui désigne le destinataire réel. Inverser les deux enverrait le rappel au
// collaborateur sans jamais déclencher le flux — donc sans message Teams.
test('envoi réussi : destinataire en OBJET, passerelle en À, message en corps', async () => {
  const espion = transportEspion();
  const r = await envoyerEmail(REGLAGES, 'bastien@etude.fr', 'Rappel de test', espion.creer);
  assert.equal(r.ok, true);
  assert.equal(espion.envois.length, 1);
  const msg = espion.envois[0];
  assert.equal(msg.to, 'passerelle@etude.fr');
  assert.equal(msg.subject, 'bastien@etude.fr');
  assert.equal(msg.text, 'Rappel de test');
  assert.match(msg.from, /claire@etude\.fr/);
});

test("expéditeur non renseigné : la passerelle sert d'adresse d'expédition", async () => {
  const espion = transportEspion();
  await envoyerEmail({ ...REGLAGES, smtpExpediteur: '' }, 'bastien@etude.fr', 'Corps', espion.creer);
  assert.match(espion.envois[0].from, /passerelle@etude\.fr/);
});

test('échec du serveur SMTP : erreur remontée, jamais une exception', async () => {
  const espion = transportEspion(new Error('550 relay denied'));
  const r = await envoyerEmail(REGLAGES, 'bastien@etude.fr', 'Test', espion.creer);
  assert.equal(r.ok, false);
  assert.match(r.erreur, /550 relay denied/);
});

// Sans compte renseigné, nodemailer ne doit recevoir AUCUN bloc `auth` : c'est le mode d'envoi
// direct Microsoft 365, autorisé par l'adresse IP du bureau et non par un compte.
test('sans compte SMTP : aucun bloc auth transmis au transport', async () => {
  const espion = transportEspion();
  await envoyerEmail(REGLAGES, 'bastien@etude.fr', 'Test', espion.creer);
  assert.equal(espion.options[0].auth, undefined);
  assert.equal(espion.options[0].host, 'smtp.test');
  assert.equal(espion.options[0].port, 25);
  assert.equal(espion.options[0].secure, false);
});

test('avec un compte SMTP : le bloc auth est transmis', async () => {
  const espion = transportEspion();
  const avecCompte = { ...REGLAGES, smtpUtilisateur: 'claire@etude.fr', smtpMotDePasse: 'jeton-applicatif' };
  await envoyerEmail(avecCompte, 'bastien@etude.fr', 'Test', espion.creer);
  assert.equal(espion.options[0].auth.user, 'claire@etude.fr');
  assert.equal(espion.options[0].auth.pass, 'jeton-applicatif');
});

test('port 465 déclaré sécurisé : TLS implicite transmis au transport', () => {
  const opts = optionsTransport({ ...REGLAGES, smtpPort: 465, smtpSecurise: true });
  assert.equal(opts.port, 465);
  assert.equal(opts.secure, true);
});

// envoiConfigure() est la condition partagée par le job de rappels, la route de notification et la
// route de test : les trois doivent rester d'accord sur « l'envoi est-il configuré ? ».
test('envoiConfigure : exige activation, serveur SMTP et passerelle', () => {
  assert.equal(envoiConfigure(REGLAGES), true);
  assert.equal(envoiConfigure({ ...REGLAGES, emailActif: false }), false);
  assert.equal(envoiConfigure({ ...REGLAGES, smtpHote: '' }), false);
  assert.equal(envoiConfigure({ ...REGLAGES, emailPasserelle: '' }), false);
  assert.equal(envoiConfigure(null), false);
});

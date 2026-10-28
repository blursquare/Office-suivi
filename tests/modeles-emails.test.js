'use strict';
// Modèles d'emails (étude, 03/10) : chaque modèle d'origine « à variables » redonne, rempli, le texte des fonctions
// construireEmail… (mot pour mot) ; un modèle modifié par l'étude passe avant ; variables, conditions. Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const dans = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const BASE = { id: 'm1', nom: 'MARTEL / FOURNIER', roleNotaire: 'instrumentaire', parties: [], historique: [] };
const CONFRERE = { notaireVendeur: 'Maître Sophie GOSSART (Blois)', notaireAcquereur: 'Maître Paul DUPUIS (Tours)', roleNotaire: 'instrumentaire' };
const CAS = [
  { ...BASE },
  { ...BASE, nomAgence: 'ORPI Blois', pret: dans(20), ventebien: dans(10), rendezVousSignature: dans(30), rendezVousSignatureHeure: '10:30' },
  { ...BASE, pret: dans(-5), ventebien: dans(-3), rendezVousSignature: dans(5), sansPret: false, offrePretStatut: 'recue' },
  { ...BASE, ...CONFRERE, rendezVousSignature: dans(12), rendezVousSignatureHeure: '14:00', ventebien: dans(8) },
  { ...BASE, sansPret: true, rendezVousSignature: dans(3), rendezVousSignatureHeure: '09:00' },
  // Lieu lu dans l'agenda / sur la fiche (15/10) : visio, chez le confrère du vendeur.
  { ...BASE, rendezVousSignature: dans(9), rendezVousSignatureHeure: '15:00', rendezVousType: 'visio' },
  { ...BASE, notaireVendeur: 'Maître Paul DUPUIS (Tours)', roleNotaire: 'participant', rendezVousSignature: dans(9), rendezVousSignatureHeure: '15:00', rendezVousType: 'confrere' }
];
const sansMarques = (t) => app.texteSansMarques(t);

test('chaque modèle d’origine, rempli, redonne le texte actuel (objet et corps)', () => {
  for (const m of app.modelesEmailDossier()) {
    for (const d of CAS) {
      const confrere = app.notaireParticipantRepresenteAcquereur(d);
      if (/Confrere$/.test(m.cle) !== confrere && ['pret', 'pretConfrere', 'ventePrealable', 'ventePrealableConfrere', 'confirmationRdv', 'confirmationRdvConfrere', 'projet', 'projetConfrere'].includes(m.cle)) continue;
      // Sans rendez-vous, ces emails ne sont jamais proposés (le texte d'origine y laissait « le , »).
      if (!d.rendezVousSignature && ['confirmationRdv', 'confirmationRdvConfrere', 'relanceFonds'].includes(m.cle)) continue;
      const attendu = m.construire(d);
      const obtenu = app.remplirModeleEmail(m, d);
      assert.equal(obtenu.sujet, attendu.sujet, `${m.cle} (objet)`);
      assert.equal(sansMarques(obtenu.corps), sansMarques(attendu.corps), `${m.cle} (corps) — ${JSON.stringify(d)}`);
    }
  }
});

test('un modèle modifié par l’étude passe avant le texte d’origine ; variante du confrère choisie seule', () => {
  const d = { ...BASE, rendezVousSignature: '2026-11-02', rendezVousSignatureHeure: '11:00' };
  const etat = { modifies: { rib: { sujet: 'Votre RIB — {dossier}', corps: 'Bonjour,\n\nMerci d’apporter votre RIB le {date et heure du rendez-vous}.\n\nCordialement,' } }, perso: [] };
  const r = app.emailDepuisModele('rib', d, etat);
  assert.equal(r.sujet, 'Votre RIB — VTE - MARTEL / FOURNIER');
  assert.match(sansMarques(r.corps), /le lundi 2 novembre 2026 à 11h\./);
  assert.equal(app.emailDepuisModele('provision', d, etat).sujet, app.construireEmailRelanceProvision(d).sujet);
  const etatConf = { modifies: { confirmationRdvConfrere: { sujet: 'Conf — {dossier}', corps: 'Mon Cher Maître,\n\nTexte confrère.' } }, perso: [] };
  assert.equal(app.emailDepuisModele('confirmationRdv', { ...d, ...CONFRERE }, etatConf).sujet, 'Conf — VTE - MARTEL / FOURNIER');
  assert.notEqual(app.emailDepuisModele('confirmationRdv', d, etatConf).sujet, 'Conf — VTE - MARTEL / FOURNIER');
});

test('variables et conditions : paragraphe retiré si vide ou condition fausse, inconnue laissée, apostrophe indifférente', () => {
  const d = { ...BASE, nomAgence: 'Century 21' };
  const r = app.remplirModeleEmail({ sujet: 'Objet {dossier}', corps: 'A {l\'agence}.\n\nB {date et heure du rendez-vous}.\n\n{si rendez-vous}C.\n\n{si client}D.\n\n{si confrère}E.\n\nF {inconnue}.' }, d);
  assert.equal(r.corps, 'A l\'agence Century 21.\n\nD.\n\nF {inconnue}.');
  assert.equal(app.remplirModeleEmail({ sujet: 's', corps: 'x {dossier}' }, null).corps, 'x {dossier}');
});

test('modèles liés à un geste : copie de l’acte, visio, sondage redonnent le texte actuel dans chaque cas', () => {
  const d = { ...BASE, rendezVousSignature: '2026-09-28' };
  const integres = app.modelesEmailIntegres();
  const m = (cle) => integres.find(x => x.cle === cle);
  for (const [types, lien] of [[['copie'], false], [['attestation'], true], [['copie', 'attestation'], false]]) {
    for (const dd of [d, { ...BASE }]) {
      const attendu = app.construireEmailCopieActe(dd, types, lien);
      const obtenu = app.remplirModeleEmail(m('copieActe'), dd, app.contexteCopieActe(dd, types, lien));
      assert.equal(obtenu.sujet, attendu.sujet);
      assert.equal(obtenu.corps, attendu.corps, `copie ${types} ${lien}`);
    }
  }
  for (const confrere of [false, true]) for (const signature of [false, true]) for (const details of ['', 'Code : 7']) {
    const args = { confrere, signature, quand: 'lundi 5 octobre à 10 h 00', dossier: signature ? 'VTE - DUPONT' : '', details };
    assert.equal(app.remplirModeleEmail(m(confrere ? 'visioConfrere' : 'visio'), null, app.contexteVisio(args)).corps, app.corpsEmailVisio(args), JSON.stringify(args));
  }
  const s = { titre: '', expireLe: '2026-10-20', creneaux: [{ n: 1, date: '2026-10-26', heure: '10:00' }, { n: 2, date: '2026-10-27', heure: '15:00' }] };
  for (const dd of [d, null]) for (const sx of [s, { ...s, expireLe: '' }]) for (const confrere of [false, true]) for (const relance of [false, true]) for (const page of [false, true]) for (const plusieurs of [false, true]) {
    const attendu = app.corpsEmailSondage(dd, sx, confrere, relance, page, plusieurs);
    const obtenu = app.remplirModeleEmail(m(confrere ? 'sondageConfrere' : 'sondage'), dd, app.contexteSondage(dd, sx, confrere, relance, page, plusieurs)).corps;
    assert.equal(obtenu, attendu, JSON.stringify({ dd: !!dd, limite: !!sx.expireLe, confrere, relance, page, plusieurs }));
  }
});

test('modèle de geste modifié : le geste envoie le texte de l’étude ; absent du menu de la fenêtre d’email', () => {
  const etat = { modifies: { visio: { sujet: '', corps: 'Bonjour,\n\nVisio du {date et heure}.\n\n{boutons de réponse}' } }, perso: [] };
  const c = app.contexteVisio({ confrere: false, signature: true, quand: 'lundi 5 octobre', dossier: '', details: '' });
  assert.equal(app.emailDepuisModele('visio', null, etat, c).corps, 'Bonjour,\n\nVisio du lundi 5 octobre.\n\n{{BOUTONS}}');
  const cConf = app.contexteVisio({ confrere: true, signature: true, quand: 'lundi 5 octobre', dossier: '', details: '' });
  assert.ok(app.emailDepuisModele('visio', null, etat, cConf).corps.startsWith('Le rendez-vous'));
  const menu = app.listeModelesEmails({ modifies: {}, perso: [] }, { pourFenetre: true }).map(x => x.cle).join();
  assert.doesNotMatch(menu, /\b(accuseReception|copieActe|visio|sondage)/);
  assert.match(app.listeModelesEmails({ modifies: {}, perso: [] }).map(x => x.cle).join(), /accuseReception.*copieActe.*visio.*sondage/);
});

// Étude 03/10 : « en fonction du type d'email, faire remonter en tête le modèle le plus approprié ».
test('modelesProposesPourEmail : geste, objet et email reçu, étape du dossier, variante confrère', () => {
  const liste = app.listeModelesEmails({ modifies: {}, perso: [{ id: 'p1', nom: 'Demande de diagnostics', sujet: 'Diagnostics — {dossier}', corps: 'x' }] }, { pourFenetre: true });
  const cles = (ctx) => app.modelesProposesPourEmail(liste, ctx, 3).map(m => m.cle || m.id).join(',');
  // Le geste qui a ouvert la fenêtre passe devant, variante confrère choisie selon le destinataire.
  assert.equal(cles({ geste: 'rib' }).split(',')[0], 'rib');
  assert.equal(cles({ geste: 'relancePret' }).split(',')[0], 'pret');
  assert.equal(cles({ geste: 'ventePrealable', confrere: true }).split(',')[0], 'ventePrealableConfrere');
  assert.doesNotMatch(cles({ geste: 'ventePrealable', confrere: true }), /ventePrealable(,|$)/);
  // Réponse à un email reçu : ses mots (objet, résumé, pièces jointes).
  assert.equal(cles({ email: { objet: 'Re: votre dossier', resume: 'Le client indique avoir effectué le virement hier.' } }).split(',')[0], 'fonds');
  assert.equal(cles({ email: { objet: 'Offre de prêt', pj: [{ nom: 'Offre Crédit Exemple.pdf' }] } }).split(',')[0], 'pret');
  assert.equal(cles({ email: { objet: 'Question', resume: 'Demande le montant à virer pour la signature.' } }).split(',')[0], 'appelFonds');
  // Modèle de l'étude : par les mots de son nom.
  assert.equal(cles({ email: { objet: 'Diagnostics de la maison' } }).split(',')[0], 'p1');
  // Rien dans l'email : l'étape du dossier ; rien du tout : aucune proposition.
  assert.equal(cles({ geste: 'email', sujet: 'VTE - MARTEL', utiles: ['fondsRecus', 'rib'] }), 'rib,fonds');
  assert.equal(cles({ geste: 'email', sujet: 'VTE - MARTEL' }), '');
});

test('projet d’acte au confrère : texte de l’étude mot pour mot (08/10), avec ou sans rendez-vous', () => {
  const d = { ...BASE, ...CONFRERE, rendezVousSignature: '2026-10-14', rendezVousSignatureHeure: '16:30' };
  const r = app.emailDepuisModele('projet', d, { modifies: {}, perso: [] });
  assert.equal(sansMarques(r.corps), "Mon Cher Maître,\n\nVeuillez trouver ci-joint le projet de l'acte de vente en prévision du rendez-vous du mercredi 14 octobre 2026 à 16h30.\n\nVous en souhaitant bonne réception.\n\nVotre bien dévoué.");
  const sans = app.emailDepuisModele('projet', { ...BASE, ...CONFRERE }, { modifies: {}, perso: [] });
  assert.equal(sansMarques(sans.corps), "Mon Cher Maître,\n\nVeuillez trouver ci-joint le projet de l'acte de vente.\n\nVous en souhaitant bonne réception.\n\nVotre bien dévoué.");
  assert.match(app.emailDepuisModele('projet', { ...BASE, rendezVousSignature: '2026-10-14' }, { modifies: {}, perso: [] }).corps, /^Bonjour,/);
});

test('lieu du rendez-vous lu dans l’agenda : le projet rappelle RIB et pièce d’identité, adaptés à la visio', () => {
  const office = { ...BASE, rendezVousSignature: dans(9), rendezVousSignatureHeure: '15:00' };
  assert.match(sansMarques(app.construireEmailProjetActe(office).corps), /en notre office\.\n\nJe vous remercie de vous munir de votre RIB et de votre pièce d'identité pour le rendez-vous\.\n\nNous restons/);
  const visio = { ...office, rendezVousType: 'visio' };
  const c = sansMarques(app.construireEmailProjetActe(visio).corps);
  assert.match(c, /en visioconférence/);
  assert.match(c, /adresser par email votre RIB et votre pièce d’identité/);
  assert.match(sansMarques(app.construireEmailConfirmationRdv(visio).corps), /adresser par email une copie de votre pièce d’identité/);
  assert.doesNotMatch(sansMarques(app.construireEmailProjetActe({ ...BASE }).corps), /RIB/);
});

test('relance de l’offre de prêt au confrère (étude 28/10) : texte de l’étude mot pour mot, date en lettres', () => {
  const d = { ...BASE, ...CONFRERE, pret: '2099-11-12' };
  const r = app.emailDepuisModele('pret', d, { modifies: {}, perso: [] });
  assert.equal(sansMarques(r.corps), ['Mon Cher Maître,', 'Nous n\'avons pas encore reçu la copie d\'offre de prêt dans le cadre de votre dossier.',
    'L\'échéance d\'obtention du prêt est fixée au 12 novembre 2099.', 'Je vous remercie de nous transmettre cette offre dès réception, ou de nous indiquer où en est la demande de financement.',
    'Dans l’attente et vous en remerciant par avance,', 'Votre bien dévoué.'].join('\n\n'));
  assert.match(sansMarques(app.emailDepuisModele('pret', { ...BASE, pret: '2099-11-12' }, { modifies: {}, perso: [] }).corps), /^Bonjour,/, 'au client : texte d’avant');
});

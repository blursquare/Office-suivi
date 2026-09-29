'use strict';

// Modèles d'email de relance différenciés par motif (voir script.js, section « Relances ciblées »)
// — demandé pour ne plus avoir à réécrire le même email à la main selon ce qui manque au dossier
// (provision de démarrage, prêt manquant, RIB), distincts du rappel générique ouvrirEmailRappel().
// Le motif "pièces à fournir" a été retiré ensuite sur demande de l'étude (jugé redondant avec la
// checklist déjà visible sur la fiche).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

function dossierBase(app, extra) {
  return Object.assign({
    id: 'd1', nom: 'DUPONT / MARTIN', emailAcquereur: 'martin@example.fr',
    typeVente: 'maison', pieces: {}, piecesRetirees: [], piecesPersonnalisees: [],
    piecesEngagementsDetectees: [], analyseJuridique: {}
  }, extra || {});
}

test('construireEmailRelancePret mentionne l’échéance quand elle est connue', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { pret: '2026-11-15' });
  const { sujet, corps } = app.construireEmailRelancePret(d);
  assert.match(sujet, /DUPONT \/ MARTIN/);
  assert.match(corps, /15 novembre 2026/);
});

test('construireEmailRelancePret reste correct sans date de prêt connue', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { pret: '' });
  const { corps } = app.construireEmailRelancePret(d);
  assert.doesNotMatch(corps, /échéance/i);
});

test('construireEmailRelanceRib reprend mot pour mot le texte de l’étude, sans signature', () => {
  const app = chargerApplication();
  const d = dossierBase(app, {});
  const { sujet, corps } = app.construireEmailRelanceRib(d);
  assert.match(sujet, /RIB/);
  assert.match(sujet, /DUPONT \/ MARTIN/);
  assert.equal(corps, 'Bonjour,\n\nEn prévision du rendez-vous de signature je vous remercie de vous munir de votre RIB et de votre pièce d’identité.\n\nBien cordialement,');
});

test('MODELES_EMAIL_RELANCE couvre exactement les cinq motifs', () => {
  const app = chargerApplication();
  assert.equal(Object.keys(app.MODELES_EMAIL_RELANCE).sort().join(','), 'fonds,pret,provision,rib,ventePrealable');
});

test('relance de la vente préalable : au client, ou au confrère quand un autre office représente l’acquéreur', () => {
  const app = chargerApplication();
  const client = app.construireEmailRelanceVentePrealable(dossierBase(app, { ventebien: '2099-10-15' }));
  assert.match(client.corps, /^Bonjour,/);
  assert.match(client.corps, /vente préalable de votre bien, qui est prévue au plus tard le 15 octobre 2099/);
  assert.match(client.corps, /attestation de vente/);
  const passee = app.construireEmailRelanceVentePrealable(dossierBase(app, { ventebien: '2020-01-10' }));
  assert.match(passee.corps, /devait intervenir au plus tard le/);
  const confrere = app.construireEmailRelanceVentePrealable(dossierBase(app, { ventebien: '2099-10-15', notaireAcquereur: 'Maître Paul LAMBERT' }));
  assert.equal(confrere.corps, [
    'Mon Cher Maître,',
    "Dans le cadre de ce dossier, l'avant-contrat est conclu sous la condition de la vente préalable du bien de votre client, qui est prévue au plus tard le 15 octobre 2099.",
    'Pourriez-vous nous indiquer si une date de réitération est déjà prévue sur votre agenda ou nous transmettre, le cas échéant, l’attestation de vente ?',
    'Dans l’attente et vous en remerciant par avance,',
    'Votre bien dévoué.'
  ].join('\n\n'));
  // Déjà aux formules du confrère : les reposer ne change rien.
  assert.equal(app.adapterCorpsEmail(confrere.corps, true), confrere.corps);
});

test('construireEmailRelanceProvision mentionne l’agence quand elle est connue, sinon reste générique', () => {
  const app = chargerApplication();
  const avecAgence = dossierBase(app, { nomAgence: 'CENTURY 21 Les Tilleuls', sansPret: true });
  const { sujet, corps } = app.construireEmailRelanceProvision(avecAgence);
  assert.match(sujet, /provision/i);
  assert.match(corps, /CENTURY 21 Les Tilleuls/);
  assert.match(corps, /100,00 €/);

  const sansAgence = dossierBase(app, { nomAgence: '', sansPret: true });
  const { corps: corpsSansAgence } = app.construireEmailRelanceProvision(sansAgence);
  assert.match(corpsSansAgence, /auprès de l'agence\./);
});

test('construireEmailRelanceProvision reprend mot pour mot le texte de l’étude, lignes espacées, sans signature', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { nomAgence: '', sansPret: false, offrePretStatut: 'inconnu' });
  assert.equal(app.construireEmailRelanceProvision(d).corps,
    "Bonjour,\n\nNous vous confirmons la bonne réception de votre avant-contrat signé auprès de l'agence.\n\n"
    + "Afin de poursuivre la constitution de votre dossier, merci de nous adresser :\n- une provision sur frais de 100,00 € ;\n"
    + "- une copie de votre pièce d'identité en cours de validité.\n\n"
    + "Si votre acquisition est soumise à l'obtention d'un prêt, merci également de nous transmettre votre offre de prêt dès que vous l'aurez reçue.");
});

test('construireEmailRelanceProvision relance aussi l’offre de prêt si la condition est active', () => {
  const app = chargerApplication();
  const avecPret = dossierBase(app, { sansPret: false, offrePretStatut: 'inconnu' });
  const { corps } = app.construireEmailRelanceProvision(avecPret);
  assert.match(corps, /offre de prêt/i);

  const offreRecue = dossierBase(app, { sansPret: false, offrePretStatut: 'recue' });
  const { corps: corpsRecue } = app.construireEmailRelanceProvision(offreRecue);
  assert.doesNotMatch(corpsRecue, /offre de prêt/i);
});

// ---- Questionnaire de satisfaction + archivage automatique (clôture du dossier) ----
// Texte DÉFINITIF fourni par l'étude (le modèle provisoire précédent est retiré), avec le lien
// vers la page d'avis Google de l'office. Le questionnaire lui-même est un PDF téléchargé au même
// clic, à joindre à la main — un mailto ne peut pas porter de pièce jointe.

test('construireEmailQuestionnaireSatisfaction reprend le texte fourni par l\'étude', () => {
  const app = chargerApplication();
  const { sujet, corps } = app.construireEmailQuestionnaireSatisfaction(dossierBase(app, {}));
  assert.equal(sujet, 'Questionnaire de satisfaction');
  assert.equal(corps, [
    'Madame, Monsieur,',
    'La qualité du service rendu à nos clients est une priorité pour notre office. Elle traduit l’engagement de notre équipe pour s’adapter à vos attentes.',
    'Afin de recueillir votre avis, deux solutions s’offrent à vous :\n1. Répondre au questionnaire satisfaction ci-joint, de manière anonyme, et nous le retourner.\n2. Laisser un avis en ligne afin de faire profiter de votre expérience au sein de notre office. Cliquez ici pour laisser votre avis : ' + app.LIEN_AVIS_GOOGLE_OFFICE,
    'Sachez que toute l’office notarial a eu à cœur de vous accompagner et espère pouvoir collaborer à vos côtés de nouveau.',
    'Dans l’attente et vous en remerciant vivement par avance,',
    'Bien cordialement.'
  ].join('\n\n'));
  assert.match(app.LIEN_AVIS_GOOGLE_OFFICE, /^https:\/\/www\.google\.com\/maps\/place\/.*!9m1!1b1$/);
  assert.doesNotMatch(corps, /PROVISOIRE|Office de Maître/);
});

test('renderQuestionnaireSatisfaction : absent pour un dossier archivé, proposé en participation', () => {
  const app = chargerApplication();
  assert.equal(app.renderQuestionnaireSatisfaction(dossierBase(app, { archive: true, acte: '2026-12-01' })), '');
  // Demandé par l'étude : en participation, on peut écrire à l'acquéreur.
  assert.match(app.renderQuestionnaireSatisfaction(dossierBase(app, { roleNotaire: 'participant', acte: '2026-12-01' })), /Questionnaire de satisfaction/);
});

test('relances : ouvertes en participation, toujours routées vers le confrère quand un autre office représente l’acquéreur', () => {
  const app = chargerApplication();
  const participant = app.renderEchangesDossier(dossierBase(app, { roleNotaire: 'participant' }));
  assert.match(participant, /envoyerRelanceCiblee\('d1', 'provision'\)/);
  const confrere = dossierBase(app, { roleNotaire: 'participant', notaireAcquereur: 'Maître DURAND', emailNotaireParticipant: 'durand@notaires.fr' });
  assert.equal(app.emailDestinataireRelance(confrere), 'durand@notaires.fr');
  assert.match(app.renderEchangesDossier(confrere), /Adressé au notaire de l.acquéreur/);
});

test('fonds reçus : vérifier d’abord, « Confirmer » une fois tous les fonds reçus', () => {
  const app = chargerApplication();
  // Appel de fonds pas encore fait : rien à confirmer, seulement vérifier.
  const avecRdv = dossierBase(app, { rendezVousSignature: '2026-11-20', acte: '2026-11-30' });
  assert.doesNotMatch(app.renderFondsRecus(avecRdv), /'fonds'/);
  assert.doesNotMatch(app.renderEchangesDossier(avecRdv), /Confirmer la réception des fonds/);

  // Appel de fonds fait, reçus pas encore lus : « Vérifier » en geste principal ; la confirmation
  // reste possible « quand même » depuis le détail.
  const fait = dossierBase(app, { rendezVousSignature: '2026-11-20', appelFonds: '2026-10-30', echeancesValidees: { appelFonds: true } });
  const pasVerifie = app.renderFondsRecus(fait);
  assert.match(pasVerifie, /<span>Vérifier<\/span>/);
  assert.match(pasVerifie, /Confirmer la réception des fonds quand même/);
  assert.match(app.renderEchangesDossier(fait), /Confirmer la réception des fonds/);

  // Tous les fonds reçus : « Confirmer » devient le geste principal, « Revérifier » passe en icône.
  const complet = Object.assign({}, fait, { fondsRecus: { total: 1500, attendu: 1500, recus: [], depuis: '2026-10-15', fichiersLus: 1, verifieLe: '2026-11-02T10:00:00Z' } });
  const html = app.renderFondsRecus(complet);
  assert.match(html, /<span>Confirmer<\/span>/);
  assert.match(html, /envoyerRelanceCiblee\('d1', 'fonds'\)/);
  assert.match(html, /title="Revérifier les reçus"/);
  assert.doesNotMatch(html, /quand même/);

  // Reçus partiels : pas de « Confirmer » en geste principal.
  const partiel = Object.assign({}, fait, { fondsRecus: Object.assign({}, complet.fondsRecus, { total: 1000 }) });
  assert.match(app.renderFondsRecus(partiel), /<span>Revérifier<\/span>/);
});

test('fonds reçus : une fois la confirmation envoyée, la date s’affiche et « Renvoyer » est proposé', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { appelFonds: '2026-10-30', echeancesValidees: { appelFonds: true }, receptionFondsConfirmeeLe: '2026-11-02' });
  const html = app.renderFondsRecus(d);
  assert.match(html, /confirmée le 2 novembre 2026/);
  assert.match(html, /<span>Renvoyer<\/span>/);
  assert.equal(app.MODELES_EMAIL_RELANCE.fonds.date, 'receptionFondsConfirmeeLe');
});

test('réception des fonds : l’email confirme la réception en comptabilité et rappelle le rendez-vous, jamais la date butoir', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { rendezVousSignature: '2026-11-20', acte: '2026-11-30' });
  const { sujet, corps } = app.construireEmailReceptionFonds(d);
  assert.match(sujet, /Réception des fonds/);
  assert.match(corps, /bien été reçus en notre comptabilité/);
  assert.match(corps, /20 novembre 2026/);
  assert.doesNotMatch(corps, /30 novembre 2026/);
});

test('signature de l’office : coordonnées puis mentions légales, sans formule de politesse', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { rendezVousSignature: '2026-11-20' });
  // La signature n'est plus dans le modèle : elle est ajoutée à l'envoi (texte et HTML).
  assert.doesNotMatch(app.construireEmailReceptionFonds(d).corps, /Attention fraude/);
  const sig = app.SIGNATURE_EMAIL_OFFICE;
  assert.match(sig, /^\n\nOffice de Maître Sophie GOSSART\n/);
  assert.doesNotMatch(sig, /cordialement/i);
  assert.match(sig, /L\.112-6-1 du Code Monétaire et Financier/);
  assert.match(sig, /RIB signé par vous/);
  assert.match(sig, /secret professionnel/);
  assert.match(sig, /Attention fraude/);
});

test('normaliserDossierImporte conserve la date de confirmation de réception des fonds', () => {
  const app = chargerApplication();
  const d = app.normaliserDossierImporte({ id: 'x', nom: 'A / B', receptionFondsConfirmeeLe: '2026-11-02' });
  assert.equal(d.receptionFondsConfirmeeLe, '2026-11-02');
  assert.equal(app.normaliserDossierImporte({ id: 'y', nom: 'A / B' }).receptionFondsConfirmeeLe, null);
});

// Demandé par l'étude : proposé seulement une fois la date de signature de l'acte renseignée.
test('renderQuestionnaireSatisfaction : absent tant que la date de signature de l’acte manque', () => {
  const app = chargerApplication();
  assert.equal(app.renderQuestionnaireSatisfaction(dossierBase(app, { acte: '' })), '');
  // Le rendez-vous de signature suffit à le rendre disponible.
  assert.match(app.renderQuestionnaireSatisfaction(dossierBase(app, { acte: '', rendezVousSignature: '2026-12-01' })), /Questionnaire de satisfaction/);
});

test('renderQuestionnaireSatisfaction : une fois envoyé, affiche la date et propose de renvoyer', () => {
  const app = chargerApplication();
  // Affiché même sur un dossier archivé : l'envoi archive justement le dossier.
  const html = app.renderQuestionnaireSatisfaction(dossierBase(app, {
    acte: '2026-10-01', archive: true, questionnaireEnvoyeLe: '2026-09-21'
  }));
  assert.match(html, /Envoyé le 21 septembre 2026/);
  assert.match(html, /Renvoyer/);
});

test('renderQuestionnaireSatisfaction : invite à renseigner un email tant qu’aucun destinataire n’est connu', () => {
  const app = chargerApplication();
  const html = app.renderQuestionnaireSatisfaction(dossierBase(app, { acte: '2026-10-01', emailAcquereur: '' }));
  assert.match(html, /Renseignez l.email de l.acquéreur/);
  assert.doesNotMatch(html, /envoyerQuestionnaireSatisfaction/);
});

test('renderQuestionnaireSatisfaction : affiche le bouton dès qu’un destinataire est connu', () => {
  const app = chargerApplication();
  const html = app.renderQuestionnaireSatisfaction(dossierBase(app, { acte: '2026-10-01' }));
  assert.match(html, /envoyerQuestionnaireSatisfaction\('d1'\)/);
  assert.match(html, /Questionnaire de satisfaction/);
});

test('renderQuestionnaireSatisfaction : absent quand l’acquéreur est représenté par un notaire distinct (jamais adressé au confrère)', () => {
  const app = chargerApplication();
  const html = app.renderQuestionnaireSatisfaction(dossierBase(app, {
    notaireAcquereur: 'Maître AUTRE', emailNotaireParticipant: 'autre@office.fr'
  }));
  assert.equal(html, '');
});

// --- Cadence de la relance « offre de prêt » adressée au client ------------------------------
// Demandée par l'étude : une première relance quand l'échéance entre dans les 15 jours, puis une
// tous les 10 jours tant que l'offre reste introuvable. Avant ce réglage, la seule garde était
// « pas deux fois le même jour » — donc une relance par jour pendant quinze jours.

test('relanceOffreDue : première relance dès qu\'aucune n\'a encore été envoyée', () => {
  const app = chargerApplication();
  assert.equal(app.relanceOffreDue(null, '2026-10-01'), true);
  assert.equal(app.relanceOffreDue('', '2026-10-01'), true);
});

test('relanceOffreDue : rien avant 10 jours, relance au 10e', () => {
  const app = chargerApplication();
  assert.equal(app.relanceOffreDue('2026-10-01', '2026-10-01'), false); // le jour même
  assert.equal(app.relanceOffreDue('2026-10-01', '2026-10-02'), false);
  assert.equal(app.relanceOffreDue('2026-10-01', '2026-10-09'), false); // veille du seuil
  assert.equal(app.relanceOffreDue('2026-10-01', '2026-10-11'), true);  // 10 jours pile
  assert.equal(app.relanceOffreDue('2026-10-01', '2026-10-20'), true);
});

test('relanceOffreDue : un jour sauté ne fait pas perdre la relance', () => {
  const app = chargerApplication();
  // C'est la raison du comptage depuis la dernière relance plutôt que sur des seuils fixes : le
  // parcours qui la déclenche ne tourne que si CLAIRE est ouverte ce jour-là.
  assert.equal(app.relanceOffreDue('2026-10-01', '2026-10-14'), true);
});

test('relanceOffreDue : une date illisible autorise la relance plutôt que de la bloquer', () => {
  const app = chargerApplication();
  assert.equal(app.relanceOffreDue('pas-une-date', '2026-10-01'), true);
});

test('la fenêtre de relance reste de 15 jours avant l\'échéance', () => {
  const app = chargerApplication();
  assert.equal(app.FENETRE_RELANCE_OFFRE_JOURS, 15);
  assert.equal(app.JOURS_ENTRE_RELANCES_OFFRE, 10);
});

// --- Relance « offre de prêt » après l'échéance ----------------------------------------------
// L'étude a demandé que la relance CONTINUE une fois la date passée, tous les 10 jours : c'est
// précisément là que la condition suspensive est en jeu.

test('libelleEcheanceRelance : avant, le jour même, après', () => {
  const app = chargerApplication();
  assert.equal(app.libelleEcheanceRelance(15), 'échéance J-15');
  assert.equal(app.libelleEcheanceRelance(1), 'échéance J-1');
  assert.equal(app.libelleEcheanceRelance(0), "échéance aujourd'hui");
  assert.equal(app.libelleEcheanceRelance(-1), 'échéance dépassée de 1 jour');
  assert.equal(app.libelleEcheanceRelance(-12), 'échéance dépassée de 12 jours');
});

test('relance offre de prêt : modèle de l’étude, lignes espacées, sans signature texte', () => {
  const app = chargerApplication();
  const corps = app.corpsRelanceOffreManquante('DUPONT / MARTIN', '2026-08-30', 5);
  assert.equal(corps, [
    'Bonjour,',
    'J’espère que vous allez bien.',
    "Nous n'avons pas encore reçu votre offre de prêt dans le cadre de votre dossier.",
    "L'échéance d'obtention du prêt est fixée au 30 août 2026.",
    "Merci de nous transmettre cette offre dès réception, ou de nous indiquer où en est votre demande de financement."
  ].join('\n\n'));
  assert.ok(!corps.includes('GOSSART'), corps);
  // Le bouton manuel produit exactement le même texte.
  const d = dossierBase(app, { pret: '2026-08-30' });
  assert.ok(app.construireEmailRelancePret(d).corps.includes("est fixée au 30 août 2026") ||
    app.construireEmailRelancePret(d).corps.includes("était fixée au 30 août 2026"));
});

test("corpsRelanceOffreManquante : « était fixée » une fois la date dépassée", () => {
  const app = chargerApplication();
  const apres = app.corpsRelanceOffreManquante('DUPONT / MARTIN', '2026-11-01', -5);
  assert.ok(apres.includes('était fixée au 1 novembre 2026'), apres);
});

test('corpsRelanceOffreManquante : le jour même reste au présent, pas au passé', () => {
  const app = chargerApplication();
  const jourJ = app.corpsRelanceOffreManquante('DUPONT / MARTIN', '2026-11-01', 0);
  assert.ok(jourJ.includes('est fixée au'), jourJ);
  assert.ok(!jourJ.includes('dépassée'), jourJ);
});

test('adapterCorpsEmail : au confrère, « Mon Cher Maître, » et « Votre bien dévoué. » remplacent les formules du client', () => {
  const app = chargerApplication();
  const corps = 'Bonjour,\n\nEn prévision du rendez-vous de signature je vous remercie de vous munir de votre RIB.\n\nBien cordialement,';
  assert.equal(app.adapterCorpsEmail(corps, true),
    'Mon Cher Maître,\n\nEn prévision du rendez-vous de signature je vous remercie de vous munir de votre RIB.\n\nDans l’attente et vous en remerciant par avance,\n\nVotre bien dévoué.');
  // Au client, le modèle est gardé tel quel.
  assert.equal(app.adapterCorpsEmail(corps, false), corps);
});

test('adapterCorpsEmail : un email au client sans formule de clôture reçoit « Bien cordialement, »', () => {
  const app = chargerApplication();
  const corps = app.corpsRelanceOffreManquante('DUPONT / MARTIN', '2026-08-30', 5);
  assert.ok(app.adapterCorpsEmail(corps, false).endsWith('\n\nBien cordialement,'));
  // Le questionnaire se termine déjà par une formule : rien n'est ajouté.
  const q = app.construireEmailQuestionnaireSatisfaction(dossierBase(app, {})).corps;
  assert.equal(app.adapterCorpsEmail(q, false), q);
});

test('adapterCorpsEmail : « Madame, Monsieur, » et les formules composées sont retirées pour un confrère', () => {
  const app = chargerApplication();
  const r = app.adapterCorpsEmail('Madame, Monsieur,\n\nLe texte.\n\nDans l’attente et vous en remerciant vivement par avance,\n\nBien cordialement.', true);
  assert.equal(r, 'Mon Cher Maître,\n\nLe texte.\n\nDans l’attente et vous en remerciant par avance,\n\nVotre bien dévoué.');
});

test('htmlEmail : paragraphes, lien « Cliquez ici », signature en couleur et images citées par cid', () => {
  const app = chargerApplication();
  const html = app.htmlEmail('Bonjour,\n\nCliquez ici pour laisser votre avis : https://exemple.fr/avis?a=1&b=2\n\nA <b> & C',
    { logoOffice: 'claire-logo-office', iconVisio: 'claire-visio' });
  assert.match(html, /<a href="https:\/\/exemple\.fr\/avis\?a=1&amp;b=2"[^>]*>Cliquez ici pour laisser votre avis<\/a>/);
  assert.match(html, /A &lt;b&gt; &amp; C/);
  assert.match(html, /src="cid:claire-logo-office"/);
  assert.match(html, /src="cid:claire-visio"/);
  assert.doesNotMatch(html, /cid:claire-logo-notaires/);
  assert.match(html, /#6D2332/);
  assert.match(html, /Office de Maître Sophie GOSSART/);
  assert.match(html, /<b>Attention fraude<\/b> :/);
});

test('signature du modèle de l’étude : carte du collaborateur, bannière Visio, mentions en couleur', () => {
  const app = chargerApplication();
  const reglages = { emailsResponsables: { 'Bastien ANGLUMENT': 'bastien.anglument.41089@notaires.fr', 'Julie VASSELIN': 'julie.vasselin@notaires.fr' }, fonctionsResponsables: { 'Julie VASSELIN': 'Clerc de notaire' } };
  const bastien = app.signataireEmail('Bastien ANGLUMENT', reglages);
  assert.equal(bastien.fonction, 'Responsable qualité et relation client');
  assert.equal(bastien.email, 'bastien.anglument.41089@notaires.fr');
  assert.equal(app.signataireEmail('Julie VASSELIN', reglages).fonction, 'Clerc de notaire');
  // Carte vierge de l'étude : « Collaborateur » et l'adresse de l'office par défaut.
  const inconnu = app.signataireEmail('Jérémy SAUJOT', {});
  assert.equal(inconnu.fonction, 'Collaborateur');
  assert.equal(inconnu.email, 'office.gossart@notaires.fr');
  const html = app.htmlEmail('Bonjour,', { logoOffice: 'a', logoNotaires: 'b', iconVisio: 'c', iconFacebook: 'd', iconInstagram: 'e' }, bastien);
  // Ordre du modèle : carte, bannière Visio, mentions orange puis rouges puis grises.
  const i = (t) => html.indexOf(t);
  assert.ok(i('Bastien ANGLUMENT') > 0 && i('Bastien ANGLUMENT') < i('Pas le temps de passer chez votre notaire ?'));
  assert.ok(i('Pas le temps de passer') < i('L.112-6-1') && i('L.112-6-1') < i('Attention fraude aux RIB') && i('Attention fraude aux RIB') < i('secret professionnel'));
  assert.match(html, /mailto:bastien\.anglument\.41089@notaires\.fr/);
  assert.match(html, /Responsable qualité et relation client/);
  assert.match(html, /<u>un RIB signé par vous\.<\/u>/);
  assert.match(html, /<u>notaires au pluriel avec un s<\/u>/);
  assert.match(html, /<b>CAISSE DES DEPOTS ET CONSIGNATIONS \(CDC\)\. Seulement la CDC, uniquement la CDC\.<\/b>/);
  assert.match(html, /color:#E36C0A;font-weight:bold;/);
  assert.match(html, /cid:d/);
  const texte = app.texteSignatureEmail(bastien);
  assert.match(texte, /^\n\nBastien ANGLUMENT\nResponsable qualité et relation client\n/);
  assert.match(texte, /Attention fraude aux RIB/);
});

test('construireEml : message non envoyé, HTML + texte, image en ligne, pièce jointe, objet accentué', () => {
  const app = chargerApplication();
  const eml = app.construireEml({
    destinataire: 'client@exemple.fr',
    sujet: 'Réception des fonds — dossier DUPONT',
    texte: 'Bonjour é',
    html: '<p>Bonjour é</p>',
    images: [{ cid: 'claire-visio', type: 'image/png', base64: 'iVBORw0KGgo=' }],
    pieces: [{ nom: 'Enquête satisfaction.pdf', type: 'application/pdf', contenuBase64: 'JVBERi0=' }]
  });
  assert.match(eml, /^To: client@exemple\.fr\r\n/);
  assert.match(eml, /\r\nX-Unsent: 1\r\n/);
  assert.match(eml, /Subject: =\?UTF-8\?B\?/);
  assert.match(eml, /multipart\/mixed/);
  assert.match(eml, /multipart\/related/);
  assert.match(eml, /multipart\/alternative/);
  assert.match(eml, /Content-ID: <claire-visio>/);
  assert.match(eml, /filename\*=UTF-8''Enqu%C3%AAte%20satisfaction\.pdf/);
  assert.match(eml, /Content-Disposition: attachment/);
  // L'UTF-8 est encodé correctement (« Bonjour é » → Qm9uam91ciDDqQ==).
  assert.match(eml, /Qm9uam91ciDDqQ==/);
  assert.ok(eml.split('\r\n').every(l => l.length <= 998));
  // Sans image ni pièce jointe : seulement la partie alternative.
  const simple = app.construireEml({ destinataire: 'a@b.fr', sujet: 'Objet', texte: 't', html: '<p>t</p>' });
  assert.doesNotMatch(simple, /multipart\/mixed|multipart\/related/);
  assert.match(simple, /Subject: Objet\r\n/);
});

test('base64Utf8 correspond à Buffer.from(…).toString("base64")', () => {
  const app = chargerApplication();
  for (const t of ['', 'a', 'ab', 'abc', 'Réception — l’office €', 'x'.repeat(100)]) {
    assert.equal(app.base64Utf8(t), Buffer.from(t, 'utf8').toString('base64'));
  }
});

test('nomFichierEml : caractères interdits sous Windows remplacés', () => {
  const app = chargerApplication();
  assert.equal(app.nomFichierEml('Réception — dossier DUPONT / MARTIN'), 'Reception - dossier DUPONT - MARTIN.eml');
});

// Demandé par l'étude (28/09) : le nom du dossier reste dans l'OBJET, jamais dans le CORPS.
test('aucun corps d’email ne contient le nom du dossier', () => {
  const app = chargerApplication();
  const cas = [
    dossierBase(app, { pret: '2099-11-15', ventebien: '2099-10-15', rendezVousSignature: '2099-12-01', nomAgence: 'IMMO BLOIS' }),
    dossierBase(app, { pret: '2099-11-15', ventebien: '2099-10-15', notaireAcquereur: 'Maître Paul DURAND', notaireVendeur: 'Maître Sophie GOSSART', emailNotaireParticipant: 'durand@notaires.fr' })
  ];
  for (const d of cas) {
    for (const cle of Object.keys(app.MODELES_EMAIL_RELANCE)) {
      const { corps } = app.MODELES_EMAIL_RELANCE[cle].construire(d);
      assert.ok(!/DUPONT/.test(corps), `corps « ${cle} » contient le nom du dossier`);
    }
    assert.ok(!/DUPONT/.test(app.construireEmailQuestionnaireSatisfaction(d).corps));
    assert.ok(!/DUPONT/.test(app.corpsRelanceOffreManquante(d.nom, d.pret, 5)));
  }
});

// Demandé par l'étude (28/09) : l'objet reprend la référence « VTE - NOM » de l'affichage et de l'agenda.
test('l’objet de chaque email porte « VTE - NOM DU DOSSIER »', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { pret: '2099-11-15', ventebien: '2099-10-15', rendezVousSignature: '2099-12-01' });
  for (const cle of Object.keys(app.MODELES_EMAIL_RELANCE)) {
    assert.match(app.MODELES_EMAIL_RELANCE[cle].construire(d).sujet, /VTE - DUPONT \/ MARTIN/, cle);
  }
});

// --- Échanges selon le stade du dossier (28/09) ------------------------------------------------
test('stadeDossier : conditions → rendez-vous à fixer → signature → acte signé', () => {
  const app = chargerApplication();
  const auj = '2026-10-01';
  assert.equal(app.stadeDossier(dossierBase(app, { pret: '2026-10-20' }), auj), 'conditions');
  assert.equal(app.stadeDossier(dossierBase(app, { sansPret: true, ventebien: '2026-10-05' }), auj), 'conditions');
  assert.equal(app.stadeDossier(dossierBase(app, { pret: '2026-10-20', offrePretStatut: 'recue' }), auj), 'rendezVous');
  assert.equal(app.stadeDossier(dossierBase(app, { sansPret: true }), auj), 'rendezVous');
  assert.equal(app.stadeDossier(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-10-01' }), auj), 'signature');
  assert.equal(app.stadeDossier(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-09-30' }), auj), 'signe');
  assert.equal(app.stadeDossier(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-10-09', echeancesValidees: { rendezVousSignature: true } }), auj), 'signe');
});

test('echangesSelonStade : ce qui sert maintenant d’abord, le reste replié, rien de périmé', () => {
  const app = chargerApplication();
  const auj = '2026-10-01';
  const ouverture = app.echangesSelonStade(dossierBase(app, { pret: '2026-10-20', ventebien: '2026-10-10' }), auj);
  assert.equal(ouverture.utiles.join(','), 'provision,ventePrealable,pret');
  assert.equal(ouverture.autres.join(','), 'appelFonds,fondsRecus,rib,agenda,questionnaire');

  const rdvAFixer = app.echangesSelonStade(dossierBase(app, { pret: '2026-09-20', offrePretStatut: 'recue' }), auj);
  assert.equal(rdvAFixer.utiles.join(','), 'provision,appelFonds');

  // Rendez-vous fixé : la provision passe « hors de ce stade », l'offre reçue ne se relance plus.
  const signature = app.echangesSelonStade(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-10-15' }), auj);
  assert.equal(signature.utiles.join(','), 'appelFonds,fondsRecus,rib,agenda');
  assert.ok(signature.autres.includes('provision'));

  const signe = app.echangesSelonStade(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-09-15' }), auj);
  assert.equal(signe.utiles.join(','), 'questionnaire');
});

test('renderEchangesDossier : le destinataire, le stade, puis les lignes utiles ; le reste replié', () => {
  const app = chargerApplication();
  const html = app.renderEchangesDossier(dossierBase(app, { sansPret: true, rendezVousSignature: '2099-12-01' }));
  assert.match(html, /Rendez-vous de signature fixé/);
  assert.match(html, /Échanges avec le client/);
  const [utile, replie] = html.split('<details class="echanges-autres">');
  assert.match(utile, /envoyerRelanceCiblee\('d1', 'rib'\)/);
  assert.doesNotMatch(utile, /'provision'/);
  assert.match(replie, /envoyerRelanceCiblee\('d1', 'provision'\)/);
  const confrere = app.renderEchangesDossier(dossierBase(app, { roleNotaire: 'participant', notaireAcquereur: 'Maître DURAND', emailNotaireParticipant: 'durand@notaires.fr' }));
  assert.match(confrere, /Échanges avec le confrère/);
  assert.doesNotMatch(confrere, /Questionnaire de satisfaction/);
});

test('dateDernierEmail : champ daté, à défaut la ligne d’historique écrite à l’envoi', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { historique: [{ date: '2026-09-02T10:00:00.000Z', texte: 'Relance manuelle envoyée — provision sur frais et pièce d’identité' }] });
  assert.equal(app.dateDernierEmail(d, 'provision'), '2026-09-02');
  assert.equal(app.dateDernierEmail(dossierBase(app, { provisionDemandeeLe: '2026-09-05' }), 'provision'), '2026-09-05');
  assert.equal(app.dateDernierEmail(dossierBase(app), 'rib'), null);
});

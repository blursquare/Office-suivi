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
    id: 'd1', nom: 'DUPONT / MARTIN', emailAcquereur: 'martin@example.fr', parties: [{ nom: 'Léa MARTIN', role: 'ACQUEREUR' }],
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

test('MODELES_EMAIL_RELANCE couvre exactement les dix motifs (relation client de la page Agenda, relance des fonds, décompte du confrère)', () => {
  const app = chargerApplication();
  assert.equal(Object.keys(app.MODELES_EMAIL_RELANCE).sort().join(','), 'confirmationRdv,fonds,pret,projet,provision,relanceDecompteConfrere,relanceFonds,relanceTitreConfrere,rib,ventePrealable');
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
  const participant = app.renderFondsDossier(dossierBase(app, { roleNotaire: 'participant' }));
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
  assert.doesNotMatch(app.renderFondsDossier(avecRdv), /Confirmer la réception des fonds/);

  // Appel de fonds fait, reçus pas encore lus : « Vérifier » en geste principal ; les fonds se valident à la main depuis le
  // détail (étude 06/10 : arrivés sur le compte CDC sans reçu lu).
  const fait = dossierBase(app, { rendezVousSignature: '2026-11-20', appelFonds: '2026-10-30', echeancesValidees: { appelFonds: true } });
  const pasVerifie = app.renderFondsRecus(fait);
  assert.match(pasVerifie, /<span>Vérifier<\/span>/);
  assert.match(pasVerifie, /validerFondsArrives\('d1'\)/);
  assert.match(app.renderFondsDossier(fait), /Valider les fonds reçus/);
  // Onglet Fonds (étude 05/10) : les gestes d'argent n'apparaissent plus dans Échanges.
  assert.doesNotMatch(app.renderEchangesDossier(fait), /Valider les fonds reçus|'provision'|'rib'/);

  // Tous les fonds reçus : « Confirmer » devient le geste principal, « Revérifier » passe en icône.
  const complet = Object.assign({}, fait, { fondsRecus: { total: 1500, attendu: 1500, recus: [], depuis: '2026-10-15', fichiersLus: 1, verifieLe: '2026-11-02T10:00:00Z' } });
  const html = app.renderFondsRecus(complet);
  assert.match(html, /<span>Confirmer<\/span>/);
  assert.match(html, /envoyerRelanceCiblee\('d1', 'fonds'\)/);
  assert.match(html, /title="Revérifier les reçus"/);
  assert.doesNotMatch(html, /Valider les fonds reçus/);

  // Validés à la main (étude 06/10) : « complet » sans reçu — « Confirmer » en geste principal, jauge pleine, date et
  // collaborateur affichés, « Annuler la validation » tant que rien n'est confirmé au client.
  const valides = Object.assign({}, fait, { fondsValidesLe: '2026-11-15', fondsValidesPar: 'Julie VASSELIN' });
  const htmlValides = app.renderFondsRecus(valides);
  assert.match(htmlValides, /<span>Confirmer<\/span>/);
  assert.match(htmlValides, /Fonds validés le 15 novembre 2026 par Julie/);
  assert.match(htmlValides, /width:100%/);
  assert.match(htmlValides, /annulerValidationFonds\('d1'\)/);
  assert.doesNotMatch(htmlValides, /validerFondsArrives/);
  assert.doesNotMatch(app.renderFondsRecus(Object.assign({}, valides, { receptionFondsConfirmeeLe: '2026-11-16' })), /Annuler la validation/);
  // Partout ailleurs : fonds complets à confirmer (Suivi « Nouveau »), plus de relance des fonds, agenda « Fonds reçus ».
  assert.equal(app.fondsCompletsAConfirmer(valides), true);
  assert.equal(app.relanceFondsDue(Object.assign({}, valides, { rendezVousSignature: '2026-11-17' }), '2026-11-16'), false);

  // Reçus partiels : pas de « Confirmer » en geste principal.
  const partiel = Object.assign({}, fait, { fondsRecus: Object.assign({}, complet.fondsRecus, { total: 1000 }) });
  assert.match(app.renderFondsRecus(partiel), /<span>Revérifier<\/span>/);
});

test('fonds reçus : une fois la confirmation envoyée, la date s’affiche et « Renvoyer » est proposé', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { appelFonds: '2026-10-30', echeancesValidees: { appelFonds: true }, receptionFondsConfirmeeLe: '2026-11-02' });
  const html = app.renderFondsRecus(d);
  assert.match(html, /confirmé au client le 2 novembre 2026/);
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
    html: '<p>Bonjour é</p><img src="cid:claire-visio">',
    images: [{ cid: 'claire-visio', type: 'image/png', base64: 'iVBORw0KGgo=' }, { cid: 'claire-logo-office', type: 'image/png', base64: 'iVBORw0KGgo=' }],
    pieces: [{ nom: 'Enquête satisfaction.pdf', type: 'application/pdf', contenuBase64: 'JVBERi0=' }]
  });
  assert.match(eml, /^To: client@exemple\.fr\r\n/);
  assert.match(eml, /\r\nX-Unsent: 1\r\n/);
  assert.match(eml, /Subject: =\?UTF-8\?B\?/);
  assert.match(eml, /multipart\/mixed/);
  assert.match(eml, /multipart\/related/);
  assert.match(eml, /multipart\/alternative/);
  assert.match(eml, /Content-ID: <claire-visio>/);
  // Une image que le corps n'affiche pas n'est pas jointe (Outlook la montrerait en pièce jointe).
  assert.doesNotMatch(eml, /claire-logo-office/);
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
  assert.equal(ouverture.utiles.join(','), 'provision,ventePrealable,pret,rib');
  assert.equal(ouverture.autres.join(','), 'appelFonds,projet,fondsRecus,agenda,questionnaire');

  // Rendez-vous pas encore fixé : l'appel de fonds attend (audit 07/10 — planning et « À faire » le placent après le rendez-vous).
  const rdvAFixer = app.echangesSelonStade(dossierBase(app, { pret: '2026-09-20', offrePretStatut: 'recue' }), auj);
  assert.equal(rdvAFixer.utiles.join(','), 'provision,rib');
  assert.ok(rdvAFixer.autres.includes('appelFonds'));

  // Rendez-vous fixé : la provision passe « hors de ce stade », l'offre reçue ne se relance plus.
  const signature = app.echangesSelonStade(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-10-15' }), auj);
  // Mêmes moments que « À faire » (audit 07/10) : à J-14, seule la note d'agenda sert ; appel de fonds à J-10, projet à J-7 ou
  // dès l'appel de fonds parti, fonds reçus après l'appel de fonds, RIB à J-3.
  assert.equal(signature.utiles.join(','), 'rib,agenda');
  assert.ok(['appelFonds', 'projet', 'fondsRecus'].every(c => signature.autres.includes(c)));
  const j10 = app.echangesSelonStade(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-10-11' }), auj);
  assert.equal(j10.utiles.join(','), 'appelFonds,rib,agenda');
  const afParti = app.echangesSelonStade(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-10-11', appelFonds: '2026-10-01' }), auj);
  assert.equal(afParti.utiles.join(','), 'appelFonds,projet,fondsRecus,rib,agenda');
  const veille = app.echangesSelonStade(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-10-04', appelFonds: '2026-09-24' }), auj);
  // À J-3 sans fonds relevés : la relance des fonds s'ajoute, comme dans « À faire ».
  assert.equal(veille.utiles.join(','), 'appelFonds,projet,fondsRecus,relanceFonds,rib,agenda');
  assert.ok(!signature.utiles.concat(signature.autres).includes('confirmationRdv'), 'confirmation du rendez-vous retirée (doublon du RIB, 05/10)');
  assert.ok(signature.autres.includes('provision'));
  assert.ok(!signature.utiles.concat(signature.autres).includes('rappelRdv'), 'plus de rappel du rendez-vous');

  const signe = app.echangesSelonStade(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-09-15' }), auj);
  assert.equal(signe.utiles.join(','), 'rib,questionnaire');
  assert.ok(!signe.utiles.concat(signe.autres).includes('anniversaire'), 'un an après : retiré (07/10)');
});

test('relation client dans l’onglet Échanges : confirmation, un an après — jamais avec un confrère', () => {
  const app = chargerApplication();
  const auj = '2026-10-01';
  // Confirmation du rendez-vous retirée (étude 05/10), même déjà faite pour cette date ; plus de rappel à part.
  const rappel = app.echangesSelonStade(dossierBase(app, { sansPret: true, rendezVousSignature: '2026-10-03', confirmationRdvPour: '2026-10-03' }), auj);
  assert.ok(!rappel.utiles.includes('confirmationRdv') && !rappel.utiles.includes('rappelRdv'), rappel.utiles.join(','));
  // Un an après : retiré (étude 07/10).
  const unAn = app.echangesSelonStade(dossierBase(app, { sansPret: true, rendezVousSignature: '2025-10-01', archive: true }), auj);
  assert.ok(!unAn.utiles.concat(unAn.autres).includes('anniversaire'), unAn.utiles.join(','));
  // Confrère : aucun email de relation client, ni utile ni replié.
  const confrere = { roleNotaire: 'participant', notaireAcquereur: 'Maître DURAND', emailNotaireParticipant: 'durand@notaires.fr', sansPret: true };
  for (const rdv of ['2026-10-03', '2026-10-15', '2026-09-15', '2025-10-01']) {
    const e = app.echangesSelonStade(dossierBase(app, Object.assign({ rendezVousSignature: rdv }, confrere)), auj);
    assert.doesNotMatch(e.utiles.concat(e.autres).join(','), /confirmationRdv|relanceFonds|anniversaire/, rdv);
  }
  // Questionnaire (étude, 02/10 : « au vendeur aussi ») : jamais à l'acquéreur du confrère, mais au
  // vendeur, notre client ; et plus du tout si un confrère représente aussi le vendeur.
  const d = dossierBase(app, Object.assign({ rendezVousSignature: '2026-09-15', emailVendeur: 'vendeur@exemple.fr', emailAcquereur: 'acq@exemple.fr' }, confrere));
  const html = app.renderQuestionnaireSatisfaction(d);
  assert.match(html, /Questionnaire de satisfaction au vendeur/);
  assert.doesNotMatch(html, /'acquereur'|envoyerQuestionnaireSatisfaction\('d1'\)/);
  const deuxConfreres = Object.assign({}, d, { notaireVendeur: 'Maître MARTIN' });
  assert.equal(app.renderQuestionnaireSatisfaction(deuxConfreres), '');
  assert.doesNotMatch(app.echangesSelonStade(deuxConfreres, auj).utiles.concat(app.echangesSelonStade(deuxConfreres, auj).autres).join(','), /questionnaire/);
});

test('renderEchangesDossier : le destinataire, le stade, puis les lignes utiles ; le reste replié', () => {
  const app = chargerApplication();
  const html = app.renderEchangesDossier(dossierBase(app, { sansPret: true, rendezVousSignature: '2099-12-01' }));
  assert.match(html, /Rendez-vous de signature fixé/);
  assert.match(html, /Échanges avec le client/);
  // RIB et provision : dans l'onglet Fonds (étude 05/10), même partage utile / replié.
  assert.doesNotMatch(html, /'rib'|'provision'/);
  const [utile, replie] = app.renderFondsDossier(dossierBase(app, { parties: [{ role: 'ACQUEREUR', nom: 'MARTIN', prenom: 'Léa' }], sansPret: true, rendezVousSignature: '2099-12-01' })).split('<details class="echanges-hors-stade">');
  // RIB : juste avant la signature (étude 07/10) — replié tant que le rendez-vous est à plus de 3 jours.
  assert.match(utile, /preparerSignatureRib\('d1', \d+\)/, 'RIB toujours en avant (26/10)');
  assert.doesNotMatch(replie, /preparerSignatureRib\('d1', \d+\)/);
  assert.doesNotMatch(utile, /'provision'/);
  assert.match(replie, /envoyerRelanceCiblee\('d1', 'provision'\)/);
  const proche = new Date(); proche.setDate(proche.getDate() + 2);
  const iso = `${proche.getFullYear()}-${String(proche.getMonth() + 1).padStart(2, '0')}-${String(proche.getDate()).padStart(2, '0')}`;
  const utileProche = app.renderFondsDossier(dossierBase(app, { parties: [{ role: 'ACQUEREUR', nom: 'MARTIN', prenom: 'Léa' }], sansPret: true, rendezVousSignature: iso })).split('<details class="echanges-hors-stade">')[0];
  assert.match(utileProche, /preparerSignatureRib\('d1', \d+\)/);
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

test('signatureHtmlOffice : la carte et la bannière déposées remplacent la version composée, 600 px au plus', () => {
  const app = chargerApplication();
  const s = app.signataireEmail('Julie VASSELIN', {});
  const html = app.signatureHtmlOffice({
    logoOffice: 'claire-logo-office',
    carteImage: { cid: 'claire-carte', largeur: 1200, hauteur: 330 },
    visioImage: { cid: 'claire-banniere-visio', largeur: 500, hauteur: 60 }
  }, s);
  assert.match(html, /<img src="cid:claire-carte" width="600" height="165"/);
  assert.match(html, /<img src="cid:claire-banniere-visio" width="500" height="60"/);
  assert.doesNotMatch(html, /claire-logo-office/);
  assert.doesNotMatch(html, /Pas le temps de passer/);
  // Deux lignes vides entre la carte et la bannière, comme dans le modèle.
  assert.match(html, /cid:claire-carte[^>]*>(<p style="margin:0;[^"]*">&nbsp;<\/p>){2}<img src="cid:claire-banniere-visio"/);
  // Mentions en couleur toujours présentes sous les images.
  assert.match(html, /<p style="margin:0 0 0;color:/);
  // Sans image déposée : version composée par CLAIRE.
  const compose = app.signatureHtmlOffice({ logoOffice: 'claire-logo-office' }, s);
  assert.match(compose, /cid:claire-logo-office/);
  assert.doesNotMatch(compose, /claire-carte/);
});

// ---- Étude, 03/10 : relance des fonds à J-3, la confirmation des fonds vaut confirmation du rendez-vous ----
test('relanceFondsDue : à 3 jours du rendez-vous, appel de fonds parti, fonds pas arrivés — client seulement, une fois par date', () => {
  const app = chargerApplication();
  const base = (extra) => dossierBase(app, Object.assign({ sansPret: true, rendezVousSignature: '2026-10-04', echeancesValidees: { appelFonds: true } }, extra));
  assert.equal(app.relanceFondsDue(base({}), '2026-10-01'), true, 'J-3, aucun reçu relevé');
  assert.equal(app.relanceFondsDue(base({}), '2026-09-30'), false, 'J-4 : trop tôt');
  assert.equal(app.relanceFondsDue(base({}), '2026-10-05'), false, 'rendez-vous passé');
  assert.equal(app.relanceFondsDue(base({ echeancesValidees: {} }), '2026-10-01'), false, 'appel de fonds pas parti');
  assert.equal(app.relanceFondsDue(base({ receptionFondsConfirmeeLe: '2026-09-30' }), '2026-10-01'), false, 'fonds confirmés');
  assert.equal(app.relanceFondsDue(base({ relanceFondsPour: '2026-10-04' }), '2026-10-01'), false, 'déjà relancé pour cette date');
  assert.equal(app.relanceFondsDue(base({ relanceFondsPour: '2026-09-20' }), '2026-10-01'), true, 'relance d’un ancien rendez-vous');
  assert.equal(app.relanceFondsDue(base({ notaireAcquereur: 'Maître DUPUIS' }), '2026-10-01'), false, 'jamais au confrère');
  assert.equal(app.relanceFondsDue(base({ fondsRecus: { total: 0, attendu: 100000 } }), '2026-10-01'), true, 'aucun reçu');
  assert.equal(app.relanceFondsDue(base({ fondsRecus: { total: 40000, attendu: 100000 } }), '2026-10-01'), true, 'reçu partiel');
  assert.equal(app.relanceFondsDue(base({ fondsRecus: { total: 100000, attendu: 100000 } }), '2026-10-01'), false, 'fonds complets');
  assert.equal(app.relanceFondsDue(base({ fondsRecus: { total: 150000, attendu: 100000 } }), '2026-10-01'), false, 'excédent : pas un manque');
  assert.equal(app.relanceFondsDue(base({ fondsRecus: { total: 40000, attendu: null } }), '2026-10-01'), false, 'montant attendu inconnu : on ne dit rien');
});

test('email de relance des fonds : date et heure en gras, lieu, sans montant, jamais le nom du dossier dans le corps', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { sansPret: true, rendezVousSignature: '2026-10-04', rendezVousSignatureHeure: '10:30' });
  const { sujet, corps } = app.MODELES_EMAIL_RELANCE.relanceFonds.construire(d);
  assert.match(sujet, /^Fonds à nous faire parvenir — /);
  assert.match(corps, /ne nous sont pas encore parvenus en comptabilité/);
  assert.match(corps, new RegExp(app.MARQUE_FORT_DEBUT + 'le .*10h30' + app.MARQUE_FORT_FIN));
  assert.match(corps, /en notre office/);
  assert.doesNotMatch(corps, /€|euros/);
});

test('la confirmation de réception des fonds vaut confirmation du rendez-vous (et son rappel) pour CE rendez-vous', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { sansPret: true, rendezVousSignature: '2026-10-15', receptionFondsConfirmeeLe: '2026-09-30', echeancesValidees: { appelFonds: true } });
  assert.equal(app.rdvConfirmeParFonds(d), true, 'confirmation antérieure au suivi de la date : comptée');
  // Le geste « Confirmer le rendez-vous » est retiré (étude 05/10) : la date d'une confirmation passée reste lisible.
  assert.equal(app.dateDernierEmail(d, 'confirmationRdv'), '2026-09-30');
  // Rendez-vous déplacé après la confirmation : à refaire.
  const deplace = Object.assign({}, d, { receptionFondsPourRdv: '2026-10-08' });
  assert.equal(app.rdvConfirmeParFonds(deplace), false);
  assert.equal(app.dateDernierEmail(deplace, 'confirmationRdv'), null);
  // Fonds pas confirmés : la confirmation reste due.
});

test('À faire : relance des fonds à J-3 (à la place de « Confirmer la réception »), confirmation sinon', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { id: 'rf', sansPret: true, rendezVousSignature: '2026-10-04', echeancesValidees: { appelFonds: true }, emailAcquereur: 'acq@exemple.fr' });
  const types = (auj, dd) => app.actionsDuJour([dd || d], auj).actions.map(a => a.type);
  assert.ok(types('2026-10-01').includes('relanceFonds'));
  assert.ok(!types('2026-10-01').includes('fonds'), 'une seule ligne à la fois');
  // Étude 05/10 : « confirmer les fonds 3 j avant » — rien à J-6 ; à J-3, la confirmation si les fonds sont là.
  assert.ok(!types('2026-09-28').includes('fonds') && !types('2026-09-28').includes('relanceFonds'), 'J-6 : rien encore');
  const recus = Object.assign({}, d, { fondsRecus: { total: 250000, attendu: 250000 } });
  assert.ok(types('2026-10-01', recus).includes('fonds') && !types('2026-10-01', recus).includes('relanceFonds'), 'J-3, fonds reçus : la confirmation');
  assert.ok(!types('2026-09-30', recus).includes('fonds'), 'J-4 : pas encore');
  const relance = app.actionsDuJour([d], '2026-10-01').actions.find(a => a.type === 'relanceFonds');
  assert.equal(relance.geste.motif, 'relanceFonds');
});

test('bilanFondsDossier (06/10) : reçus lus, montant saisi à la main, validation à la main = complet', () => {
  const app = chargerApplication();
  assert.equal(app.bilanFondsDossier({}).etat, 'aucun');
  assert.equal(app.bilanFondsDossier({ fondsRecus: { total: 40000, attendu: 100000 } }).etat, 'partiel');
  assert.equal(app.bilanFondsDossier({ fondsRecus: { total: 40000, attendu: 100000 }, fondsAttendusManuel: 40000 }).etat, 'complet');
  const manuel = app.bilanFondsDossier({ fondsRecus: { total: 40000, attendu: 100000 }, fondsValidesLe: '2026-10-06' });
  assert.equal(manuel.etat, 'complet');
  assert.equal(manuel.manuel, true);
  assert.equal(manuel.reste, 0);
  assert.equal(app.bilanFondsDossier({ fondsValidesLe: '2026-10-06' }).etat, 'complet', 'validé sans aucun reçu lu');
  assert.equal(app.bilanFondsDossier({ fondsRecus: { total: 100000, attendu: 100000 } }).manuel, false);
});

test('décompte du confrère (étude 06/10) : demandé à J-10 (07/10) quand un confrère représente le vendeur et nous l’acquéreur', () => {
  const app = chargerApplication();
  const base = (extra) => dossierBase(app, Object.assign({ sansPret: true, rendezVousSignature: '2026-10-13', roleNotaire: 'participant',
    notaireVendeur: 'Maître Paul DUPUIS (Tours)', notaireAcquereur: 'Maître Sophie GOSSART (BLOIS)', emailConfrereVendeur: 'dupuis@notaires.fr', emailAcquereur: 'acq@exemple.fr' }, extra));
  assert.equal(app.relanceDecompteConfrereDue(base({}), '2026-10-03'), true, 'J-10, avec l’appel de fonds');
  assert.equal(app.relanceDecompteConfrereDue(base({}), '2026-10-06'), true, 'J-7');
  assert.equal(app.relanceDecompteConfrereDue(base({}), '2026-10-12'), true, 'veille');
  assert.equal(app.relanceDecompteConfrereDue(base({}), '2026-10-02'), false, 'J-11 : trop tôt');
  assert.equal(app.relanceDecompteConfrereDue(base({}), '2026-10-14'), false, 'rendez-vous passé');
  assert.equal(app.relanceDecompteConfrereDue(base({ relanceDecompteConfrerePour: '2026-10-13' }), '2026-10-06'), false, 'déjà demandé pour cette date');
  assert.equal(app.relanceDecompteConfrereDue(base({ relanceDecompteConfrerePour: '2026-09-20' }), '2026-10-06'), true, 'demande d’un ancien rendez-vous');
  assert.equal(app.relanceDecompteConfrereDue(base({ notaireVendeur: 'Maître Sophie GOSSART (BLOIS)' }), '2026-10-06'), false, 'le vendeur est notre client');
  assert.equal(app.relanceDecompteConfrereDue(base({ notaireAcquereur: 'Maître Paul DUPUIS (Tours)' }), '2026-10-06'), false, 'l’acquéreur a aussi son notaire');
  assert.equal(app.relanceDecompteConfrereDue(base({ rendezVousSignature: '' }), '2026-10-06'), false, 'sans rendez-vous');
  assert.equal(app.relanceDecompteConfrereDue(base({ typeAffaire: 'succession' }), '2026-10-06'), false, 'succession');
  // Étude 06/10 : l'appel de fonds déjà coché (envoyé) = le décompte a servi, plus rien à demander.
  assert.equal(app.relanceDecompteConfrereDue(base({ appelFonds: '2026-10-05' }), '2026-10-06'), false, 'appel de fonds envoyé (date)');
  assert.equal(app.relanceDecompteConfrereDue(base({ echeancesValidees: { appelFonds: true } }), '2026-10-06'), false, 'appel de fonds coché');

  // Texte de l'étude, mot pour mot ; destinataire = le confrère du vendeur, jamais l'acquéreur.
  const m = app.MODELES_EMAIL_RELANCE.relanceDecompteConfrere;
  const { sujet, corps } = m.construire(base({}));
  assert.equal(corps, 'Mon Cher Maître,\n\nPouvez-vous nous envoyer votre décompte s\'il vous plait ?\n\nDans l\'attente et vous en remerciant par avance,\n\nVotre bien dévoué.');
  assert.match(sujet, /^Votre décompte — VTE - /);
  assert.equal(m.destinataire(base({})), 'dupuis@notaires.fr');
  assert.equal(m.destinataire(base({ emailConfrereVendeur: '' })), '', 'rien sans email du confrère (annuaire vide dans les tests)');
  assert.equal(m.confrere, true);
  const b = app.brouillonAction({ dossier: base({}), geste: { type: 'email', motif: 'relanceDecompteConfrere' } });
  assert.equal(b.a, 'dupuis@notaires.fr');

  // « À faire » : la tâche à J-7, « Déjà reçu » en second ; sans email du confrère, « Ouvrir la fiche ».
  const actions = app.actionsDuJour([base({})], '2026-10-06').actions;
  const t = actions.find(a => a.type === 'relanceDecompteConfrere');
  assert.ok(t, actions.map(a => a.type).join(','));
  assert.equal(t.titre, 'Demander son décompte au confrère');
  assert.equal(t.geste.motif, 'relanceDecompteConfrere');
  assert.equal(t.second.libelle, 'Déjà reçu');
  assert.match(t.contexte, /DUPUIS/);
  const sansEmail = app.actionsDuJour([base({ emailConfrereVendeur: '' })], '2026-10-06').actions.find(a => a.type === 'relanceDecompteConfrere');
  assert.equal(sansEmail.geste.type, 'fiche');
  assert.equal(app.actionsDuJour([base({})], '2026-10-02').actions.some(a => a.type === 'relanceDecompteConfrere'), false, 'J-11 : pas encore');
  assert.equal(app.actionsDuJour([base({})], '2026-10-03').actions.some(a => a.type === 'relanceDecompteConfrere'), true, 'J-10 : avec l’appel de fonds (étude 07/10)');

  // Onglet Fonds : ligne utile à J-10, repliée avant, cochée une fois demandée ; jamais dans Échanges.
  const e = app.echangesSelonStade(base({}), '2026-10-06');
  assert.ok(e.utiles.includes('relanceDecompteConfrere'), e.utiles.join(','));
  assert.ok(app.echangesSelonStade(base({}), '2026-09-20').autres.includes('relanceDecompteConfrere'));
  assert.ok(app.echangesSelonStade(base({ relanceDecompteConfrerePour: '2026-10-13', relanceDecompteConfrereLe: '2026-10-06' }), '2026-10-07').utiles.includes('relanceDecompteConfrere'));
  assert.ok(!app.echangesSelonStade(base({ notaireVendeur: 'Maître Sophie GOSSART (BLOIS)' }), '2026-10-06').utiles.concat().includes('relanceDecompteConfrere'));
  // L'onglet se dessine à la date du jour : rendez-vous dans 6 jours (le 13/10 fixé plus haut est passé depuis).
  const rdvProche = app.addDays(app.isoAujourdhuiLocal(), 6);
  const fonds = app.renderFondsDossier(base({ rendezVousSignature: rdvProche }));
  assert.match(fonds, /Demander son décompte au confrère/);
  assert.match(fonds, /envoyerRelanceCiblee\('d1', 'relanceDecompteConfrere'\)/);
  assert.doesNotMatch(app.renderEchangesDossier(base({ rendezVousSignature: rdvProche })), /Demander son décompte au confrère/);
  assert.match(app.renderFondsDossier(base({ rendezVousSignature: rdvProche, relanceDecompteConfrerePour: rdvProche, relanceDecompteConfrereLe: '2026-10-06' })), /Envoyé le 6 octobre 2026/);
  assert.doesNotMatch(app.renderFondsDossier(base({ rendezVousSignature: rdvProche, emailConfrereVendeur: '' })), /Demander son décompte au confrère/);
});

test('copie de l’acte du confrère (étude 22/10) : demandée 48 h après la signature d’une vente en participation, une seule fois', () => {
  const app = chargerApplication();
  const base = (extra) => dossierBase(app, Object.assign({ sansPret: true, roleNotaire: 'participant', rendezVousSignature: '2026-10-23',
    notaireVendeur: 'Maître Paul DUPUIS (Tours)', notaireAcquereur: 'Maître Sophie GOSSART (BLOIS)', emailConfrereVendeur: 'dupuis@notaires.fr', emailAcquereur: 'acq@exemple.fr' }, extra));
  assert.equal(app.relanceTitreConfrereDue(base({}), '2026-10-22'), false, 'pas encore signé');
  assert.equal(app.relanceTitreConfrereDue(base({}), '2026-10-24'), false, '24 h après la signature : trop tôt');
  assert.equal(app.relanceTitreConfrereDue(base({}), '2026-10-25'), true, '48 h après la signature');
  assert.equal(app.relanceTitreConfrereDue(base({}), '2026-11-20'), false, 'au-delà de 15 jours : plus proposé');
  assert.equal(app.relanceTitreConfrereDue(base({ rendezVousSignature: '2026-10-10' }), '2026-10-25'), false, 'acte signé avant la mise en service : jamais relancé');
  assert.equal(app.relanceTitreConfrereDue(base({ relanceTitreConfrereLe: '2026-10-25' }), '2026-10-27'), false, 'déjà demandé ou reçu');
  assert.equal(app.relanceTitreConfrereDue(base({ roleNotaire: 'instrumentaire' }), '2026-10-25'), false, 'pas en participation');
  assert.equal(app.relanceTitreConfrereDue(base({ notaireVendeur: 'Maître Sophie GOSSART (BLOIS)' }), '2026-10-25'), false, 'le vendeur est notre client');
  assert.equal(app.relanceTitreConfrereDue(base({ archive: true }), '2026-10-25'), false, 'archivé');
  const t = app.actionsDuJour([base({})], '2026-10-25').actions.find(a => a.type === 'relanceTitreConfrere');
  assert.ok(t);
  assert.equal(t.geste.motif, 'relanceTitreConfrere');
  const b = app.brouillonAction({ dossier: base({}), geste: { type: 'email', motif: 'relanceTitreConfrere' } });
  assert.equal(b.a, 'dupuis@notaires.fr');
  assert.equal(String(b.corps).replace(/[’']/g, "'"), ['Mon Cher Maître,', 'Pouvez-vous nous envoyer la copie du titre de propriété s\'il vous plait ?', 'Dans l\'attente et vous en remerciant par avance,', 'Votre bien dévoué.'].join('\n\n'));
});

test('onglet Fonds en colonnes (étude 30/10) : comptabilité d’Authentic, offre de prêt s’il y en a une, demandes à faire ; succession sans offre', () => {
  const app = chargerApplication();
  const avecPret = app.renderFondsDossier(dossierBase(app, { referenceAuthentic: 'A 2026 00001', offrePretStatut: '', sansPret: false, datePret: '2099-12-01' }));
  assert.match(avecPret, /fonds-colonnes-3/);
  const ordre = ['Comptabilité', 'Offre de prêt', 'Demandes à faire'].map(t => avecPret.indexOf(`pieces-titre-texte">${t}<`));
  assert.ok(ordre.every((x, i) => x > 0 && (i === 0 || x > ordre[i - 1])), 'comptabilité, offre, demandes dans cet ordre');
  assert.match(avecPret, /lireComptabiliteAT\('d1'\)[^>]*>[\s\S]*?Lire la comptabilité/);
  const lue = app.renderFondsDossier(dossierBase(app, { referenceAuthentic: 'A 2026 00001', sansPret: true, authentic: { comptabilite: { luLe: '2026-10-30T10:00', soldeAffaire: 1250.5, soldeCompte: 1250.5, operations: [] } } }));
  assert.match(lue, /fonds-colonnes-2/);
  assert.match(lue, /Relire/);
  assert.match(lue, /Solde de l’affaire/);
  const sansRef = app.renderFondsDossier(dossierBase(app, { sansPret: true }));
  assert.match(sansRef, /Référence d’Authentic inconnue/);
  assert.doesNotMatch(sansRef, /lireComptabiliteAT/);
  const succ = app.renderFondsDossier(dossierBase(app, { typeAffaire: 'succession', referenceAuthentic: 'A 2026 00002' }));
  assert.match(succ, /fonds-colonnes-2/);
  assert.doesNotMatch(succ, /Offre de prêt|Provision/);
  assert.match(succ, /Demander le RIB/);
  const classique = app.renderFondsDossier(dossierBase(app, { typeAffaire: 'succession', succession: { type: 'classique' } }));
  assert.match(classique, /ouvrirAutorisationsDepuisFiche\('d1'\)/);
  const noto = app.renderFondsDossier(dossierBase(app, { typeAffaire: 'succession', succession: { type: 'notoriete' } }));
  assert.doesNotMatch(noto, /Autorisations de déblocage/, 'notoriété seule : aucune autorisation de fonds');
});

test('succession : appel de fonds facultatif, fonds reçus des héritiers, confirmation aux héritiers (étude 30/10)', () => {
  const app = chargerApplication();
  const rdv = '2099-12-10';
  const parties = [
    { role: 'DEFUNT', nom: 'Paul DURAND', qualite: 'Défunt' },
    { role: 'HERITIER', nom: 'Marie DURAND', qualite: 'Héritier', email: 'marie@exemple.fr' },
    { role: 'HERITIER', nom: 'Luc FAVIER', qualite: 'Héritier', email: 'luc@exemple.fr' }
  ];
  const succ = (plus) => dossierBase(app, Object.assign({ nom: 'SUCC DURAND', typeAffaire: 'succession', parties, defunt: { nom: 'DURAND', prenoms: 'Paul' },
    succession: { type: 'notoriete-ds', ouvertureLe: '2099-08-01', rendezVous: [{ id: 'r', etape: 'declarationSuccession', titre: 'SUCC DURAND', date: rdv, heure: '10:00' }] } }, plus || {}));
  const d = succ();
  // Payeurs = les héritiers ; le nom du défunt, porté par une héritière, n'est cherché qu'avec son prénom.
  const mots = app.motsPayeurDossier(d, []).join('|');
  assert.match(mots, /favier/);
  assert.doesNotMatch(mots, /(^|\|)durand($|\|)/);
  assert.match(mots, /durand marie/);
  assert.match(app.emailDestinataireRelance(d), /marie@exemple\.fr/);
  assert.match(app.emailDestinataireRelance(d), /luc@exemple\.fr/);
  // Onglet Fonds : l'appel de fonds (« Pas nécessaire ») et le bloc des fonds reçus, montant attendu compris.
  const html = app.renderFondsDossier(succ({ fondsRecus: { verifieLe: '2099-12-01T10:00:00Z', regle: 2, depuis: '2099-09-01', fichiersLus: 1, total: 1500, attendu: 1500, recus: [{ chemin: 'a.pdf', fichier: 'a.pdf', page: 1, montant: 1500, date: '2099-11-30' }] } }));
  assert.match(html, /Appel de fonds et fonds reçus/);
  assert.match(html, /Pas nécessaire/);
  assert.match(html, /Tous les fonds sont reçus/);
  assert.match(html, /envoyerRelanceCiblee\('d1', 'fonds'\)/);
  // Pas nécessaire : plus de bloc des fonds reçus tant que rien n'a été lu, « Rétablir » proposé.
  const inutile = app.renderFondsDossier(succ({ succession: Object.assign({}, d.succession, { appelFondsInutile: true }) }));
  assert.match(inutile, /Rétablir/);
  assert.doesNotMatch(inutile, /Fonds reçus en comptabilité/);
  // Email : premier jet propre à la succession, jamais « votre acquisition ».
  const email = app.MODELES_EMAIL_RELANCE.fonds.construire(d);
  assert.match(email.corps, /frais de la succession/);
  assert.doesNotMatch(email.corps, /acquisition/);
});

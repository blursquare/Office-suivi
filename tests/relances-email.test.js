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

test('MODELES_EMAIL_RELANCE couvre exactement les quatre motifs', () => {
  const app = chargerApplication();
  assert.equal(Object.keys(app.MODELES_EMAIL_RELANCE).sort().join(','), 'fonds,pret,provision,rib');
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
  assert.match(corps, /questionnaire de satisfaction/i);
  assert.match(corps, /page Google/);
  assert.match(corps, /google\.com\/maps/);
  // Plus aucune mention de modèle provisoire.
  assert.doesNotMatch(corps, /PROVISOIRE/);
});

test('renderQuestionnaireSatisfaction : absent pour un dossier archivé, proposé en participation', () => {
  const app = chargerApplication();
  assert.equal(app.renderQuestionnaireSatisfaction(dossierBase(app, { archive: true, acte: '2026-12-01' })), '');
  // Demandé par l'étude : en participation, on peut écrire à l'acquéreur.
  assert.match(app.renderQuestionnaireSatisfaction(dossierBase(app, { roleNotaire: 'participant', acte: '2026-12-01' })), /Questionnaire de satisfaction/);
});

test('relances : ouvertes en participation, toujours routées vers le confrère quand un autre office représente l’acquéreur', () => {
  const app = chargerApplication();
  const participant = app.renderRelancesCiblees(dossierBase(app, { roleNotaire: 'participant' }));
  assert.match(participant, /envoyerRelanceCiblee\('d1', 'provision'\)/);
  const confrere = dossierBase(app, { roleNotaire: 'participant', notaireAcquereur: 'Maître DURAND', emailNotaireParticipant: 'durand@notaires.fr' });
  assert.equal(app.emailDestinataireRelance(confrere), 'durand@notaires.fr');
  assert.match(app.renderRelancesCiblees(confrere), /adressées à son notaire/);
});

test('réception des fonds : bouton dans la carte « Envoi au client », seulement une fois l’appel de fonds validé', () => {
  const app = chargerApplication();
  // Plus proposée parmi les relances de la fiche : elle vit à côté de l'appel de fonds.
  const avecRdv = dossierBase(app, { rendezVousSignature: '2026-11-20', acte: '2026-11-30' });
  assert.doesNotMatch(app.renderRelancesCiblees(avecRdv), /'fonds'/);
  assert.equal(app.renderReceptionFonds(avecRdv), '');
  const fait = dossierBase(app, { rendezVousSignature: '2026-11-20', appelFonds: '2026-10-30', echeancesValidees: { appelFonds: true } });
  assert.match(app.renderReceptionFonds(fait), /envoyerRelanceCiblee\('d1', 'fonds'\)/);
  assert.match(app.renderReceptionFonds(fait), /Confirmer la réception des fonds/);
  assert.match(app.renderCarteEnvoisAvantSignature(fait), /Confirmer la réception des fonds/);
});

test('réception des fonds : une fois confirmée, la carte affiche la date et propose de renvoyer', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { appelFonds: '2026-10-30', echeancesValidees: { appelFonds: true }, receptionFondsConfirmeeLe: '2026-11-02' });
  const html = app.renderReceptionFonds(d);
  assert.match(html, /confirmée le 2 novembre 2026/);
  assert.match(html, /Renvoyer/);
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

test('signature commune : tous les emails pré-rédigés se terminent par la signature de l’office', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { pret: '2026-11-15', rendezVousSignature: '2026-11-20' });
  const corps = [
    app.construireEmailReceptionFonds(d).corps,
    app.construireEmailQuestionnaireSatisfaction(d).corps
  ];
  for (const c of corps) {
    assert.ok(c.endsWith(app.SIGNATURE_EMAIL_OFFICE), c.slice(0, 60));
    assert.doesNotMatch(c, /\n\nCordialement\./);
  }
  const sig = app.SIGNATURE_EMAIL_OFFICE;
  assert.match(sig, /^\n\nBien cordialement,\n\nOffice de Maître Sophie GOSSART\n/);
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
});

test('renderQuestionnaireSatisfaction : une fois envoyé, affiche la date et propose de renvoyer', () => {
  const app = chargerApplication();
  // Affiché même sur un dossier archivé : l'envoi archive justement le dossier.
  const html = app.renderQuestionnaireSatisfaction(dossierBase(app, {
    acte: '2026-10-01', archive: true, questionnaireEnvoyeLe: '2026-09-21'
  }));
  assert.match(html, /envoyé le 21 septembre 2026/);
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

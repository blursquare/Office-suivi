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

test('construireEmailRelanceRib ne dépend d’aucun champ du dossier au-delà du nom', () => {
  const app = chargerApplication();
  const d = dossierBase(app, {});
  const { sujet, corps } = app.construireEmailRelanceRib(d);
  assert.match(sujet, /RIB|bancaire/i);
  assert.match(corps, /DUPONT \/ MARTIN/);
});

test('MODELES_EMAIL_RELANCE couvre exactement les trois motifs restants', () => {
  const app = chargerApplication();
  assert.equal(Object.keys(app.MODELES_EMAIL_RELANCE).sort().join(','), 'pret,provision,rib');
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
  assert.match(corpsSansAgence, /votre agence immobilière/);
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
// Le texte est un modèle PROVISOIRE (voir son commentaire dans script.js) : ces tests ne
// vérifient que la structure (sujet/corps mentionnent le dossier), pas un texte définitif encore
// non fourni par l'étude.

test('construireEmailQuestionnaireSatisfaction mentionne le dossier et signale un texte provisoire', () => {
  const app = chargerApplication();
  const d = dossierBase(app, {});
  const { sujet, corps } = app.construireEmailQuestionnaireSatisfaction(d);
  assert.match(sujet, /DUPONT \/ MARTIN/);
  assert.match(corps, /DUPONT \/ MARTIN/);
  assert.match(corps, /PROVISOIRE/);
});

test('renderQuestionnaireSatisfaction : absent pour un dossier archivé ou un rôle participant', () => {
  const app = chargerApplication();
  assert.equal(app.renderQuestionnaireSatisfaction(dossierBase(app, { archive: true })), '');
  assert.equal(app.renderQuestionnaireSatisfaction(dossierBase(app, { roleNotaire: 'participant' })), '');
});

test('renderQuestionnaireSatisfaction : invite à renseigner un email tant qu’aucun destinataire n’est connu', () => {
  const app = chargerApplication();
  const html = app.renderQuestionnaireSatisfaction(dossierBase(app, { emailAcquereur: '' }));
  assert.match(html, /Renseignez l.email de l.acquéreur/);
  assert.doesNotMatch(html, /envoyerQuestionnaireSatisfaction/);
});

test('renderQuestionnaireSatisfaction : affiche le bouton dès qu’un destinataire est connu', () => {
  const app = chargerApplication();
  const html = app.renderQuestionnaireSatisfaction(dossierBase(app, {}));
  assert.match(html, /envoyerQuestionnaireSatisfaction\('d1'\)/);
  assert.match(html, /Questionnaire de satisfaction/);
});

test('renderQuestionnaireSatisfaction : route vers le notaire de l’acquéreur quand il est en participation', () => {
  const app = chargerApplication();
  const html = app.renderQuestionnaireSatisfaction(dossierBase(app, {
    emailAcquereur: '', notaireAcquereur: 'Maître AUTRE', emailNotaireParticipant: 'autre@office.fr'
  }));
  assert.match(html, /envoyerQuestionnaireSatisfaction\('d1'\)/);
});

// CLAIRE dans Authentic, étape 3 (client/133) : le sous-dossier d'Authentic sur la fiche et le signal « Sans suite » du Suivi.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const INST = { reference: 'A 2026 00500', libelle: 'VTE ESSAI / EXEMPLE', luLe: '2026-10-27T09:00:00Z', pages: 1, sousDossier: {
  intitule: '2 - VTE ESSAI / EXEMPLE', nature: 'VTE', statut: 'Préparation définitive', statutLe: '2026-10-14', comparants: [], immeubles: [],
  formalitesPrealables: [{ badge: 'ECV', libelle: 'Acte de naissance <ESSAI>', groupe: 'Etat civil', statut: 'Réponse positive', dates: ['2026-10-01'] }],
  actes: [{ badge: 'ACT', libelle: 'Vente ESSAI', groupe: 'Rédaction', statut: 'Non rédigé', dates: [] }],
  formalitesPosterieures: [], pieces: [], mails: [] } };

test('fiche : statut du sous-dossier, formalités et actes avec badge, texte échappé', () => {
  const app = chargerApplication();
  app.instantanesAuthenticAT.v1 = { t: Date.now(), inst: INST, fiche: null, enCours: false };
  const html = app.htmlSousDossierAT({ id: 'v1' });
  assert.ok(html.includes('Préparation définitive') && html.includes('14 octobre 2026'));
  assert.ok(html.includes('at-badge at-ECV') && html.includes('Réponse positive'));
  assert.ok(html.includes('Formalités préalables') && html.includes('Actes') && !html.includes('Formalités postérieures'), 'un groupe vide n’est pas montré');
  assert.ok(html.includes('&lt;ESSAI&gt;') && !html.includes('<ESSAI>'));
  assert.equal(app.classeStatutSousDossierAT('Sans suite'), 'dl-alerte');
});

test('Suivi : un sous-dossier « Sans suite » dans Authentic est signalé, jamais archivé d’office', () => {
  const app = chargerApplication();
  app.statutsAuthenticAT.v1 = { statut: 'Sans suite', le: '2026-10-20' };
  const d = { id: 'v1', nom: 'ESSAI', pieces: {}, parties: [], historique: [] };
  assert.ok(app.signauxDossierSuivi(d).some((s) => s.cle === 'authentic-sans-suite'));
  assert.ok(!d.archive);
  app.statutsAuthenticAT.v1 = { statut: 'Signé', le: '2026-10-20' };
  assert.ok(!app.signauxDossierSuivi(d).some((s) => s.cle === 'authentic-sans-suite'));
});

test('audit 0.377.0 : « Sans suite » sort de « Nouveau » une fois la fiche ouverte, revient si la date du badge change', () => {
  const app = chargerApplication();
  app.statutsAuthenticAT.v2 = { statut: 'Sans suite', le: '2026-10-20' };
  const d = { id: 'v2', nom: 'ESSAI', pieces: {}, parties: [], historique: [] };
  assert.ok(app.signauxDossierSuivi(d).some((s) => s.cle === 'authentic-sans-suite'));
  app.noterSansSuiteVuAT('v2');
  assert.ok(!app.signauxDossierSuivi(d).some((s) => s.cle === 'authentic-sans-suite'), 'vu');
  app.statutsAuthenticAT.v2 = { statut: 'Sans suite', le: '2026-11-02' };
  assert.ok(app.signauxDossierSuivi(d).some((s) => s.cle === 'authentic-sans-suite'), 'nouvelle date : de nouveau signalé');
});

test('étape 5 : une pièce jointe d’Authentic rapprochée de la checklist (par son nom) et du NAS ; « Ouvrir » sur chaque ligne', () => {
  const app = chargerApplication();
  const d = { id: 'v1', nom: 'ESSAI', typeVente: 'maison', pieces: { titrePropriete: 'recue' }, nasInventaire: ['VTE ESSAI/Diagnostics.pdf'], parties: [], historique: [] };
  const t = app.correspondancePieceAuthenticAT(d, 'Titre de propriété ESSAI.pdf');
  assert.ok(t.piece && t.piece.recue);
  assert.equal(app.correspondancePieceAuthenticAT(d, 'Diagnostics.pdf').nas, true);
  const html = app.htmlPiecesJointesAT(d, { pieces: [{ pjId: 'pj11', nom: 'Titre de propriété <ESSAI>.pdf', dossierGed: 'Non classé' }] });
  assert.ok(html.includes("ouvrirPieceAuthenticAT('v1', 'pj11')") && html.includes('Non classé') && html.includes('&lt;ESSAI&gt;'));
});

test('outil authentic_lire (étape 8) : états et dossiers de la GED connus seulement ; types en mots ; une ligne de suivi hors CLAIRE sans libellé', async () => {
  const app = chargerApplication();
  assert.equal(app.etatSurPourAgent('Réponse positive'), 'Réponse positive');
  assert.equal(app.etatSurPourAgent('Non préemption SAFER'), 'Non préemption SAFER');
  assert.equal(app.etatSurPourAgent('Leroy'), 'autre état', 'un nom en tête ne part jamais comme état');
  assert.equal(app.dossierGedPourAgent('Non classé'), 'Non classé');
  assert.equal(app.dossierGedPourAgent('Acquéreur leroy'), '');
  const sd = app.sousDossierPourAgent(INST, null);
  assert.equal(sd.formalites_prealables[0].type, 'état civil (Comedec)');
  assert.equal(sd.actes[0].type, 'acte');
  assert.equal(sd.intitule, undefined, 'l’intitulé (noms des parties) ne part pas');
  app.suivisAuthentic.etat = { luLe: '2026-10-27T09:00:00Z', actif: true, compteurs: {}, ecrans: { safer: { luLe: 'x', tronque: false, lignes: [
    { reference: 'A 2026 00777', libelle: 'Leroy Jean - DIA', dates: ['2026-10-01'], situation: 'Leroy', enAttente: true, dossierId: '' },
    { reference: 'A 2026 00500', libelle: 'DIA ESSAI', dates: ['2026-10-02'], situation: 'Pris en compte', enAttente: true, dossierId: 'v1' }] } } };
  app.suivisAuthentic.t = Date.now();
  const lignes = app.lignesSuivisAuthenticEnAttente(app.suivisAuthentic.etat);
  assert.equal(lignes.length, 2);
  // Ce que l'outil rend pour la vue suivis, sans serveur (chargement court-circuité : rien à relire).
  app.chargerSuivisAuthentic = async () => {};
  const r = await app.authenticLireAgent({ vue: 'suivis', dossier_id: '' });
  const json = JSON.stringify(r);
  assert.ok(!/Leroy/.test(json), 'un nom absent des fiches ne part pas : ' + json);
  assert.ok(/DIA ESSAI/.test(json) && /Pris en compte/.test(json), 'la ligne d’un dossier de CLAIRE garde son libellé (masqué ensuite par le serveur)');
});

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

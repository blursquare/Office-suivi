// Gestes de « Demander à CLAIRE » du 28/10 (client/137) : état hypothécaire, DIA et CU, routines.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

test('DIA et CU : guichet unique, Authentic, réponse attendue, autres demandes', () => {
  const app = chargerApplication();
  const d = { id: 'v1', typeVente: 'maison', pieces: {}, gnau: { dia: { numero: '041018 26 00012', deposeLe: '2026-10-20' } },
    authentic: { demandes: { renonciationPreemption: { date: '2026-10-22' }, certificatAlignement: { date: '2026-10-21' } } } };
  const r = app.demandesUrbanismeDossierAgent(d);
  assert.equal(r.dia.demandee, true);
  assert.equal(r.dia.envoyee_le, '2026-10-20', 'la plus ancienne des deux');
  assert.equal(r.dia.par, 'guichet unique (GNAU)');
  assert.equal(r.dia.reponse_attendue_le, '2026-12-20');
  assert.equal(r.cu.demande, false);
  assert.equal(r.autres_demandes_dans_authentic.length, 1);
  const sans = app.demandesUrbanismeDossierAgent({ id: 'v2', typeVente: 'maison', pieces: {} });
  assert.equal(sans.dia.demandee, false);
  assert.equal(sans.dia.envoyee_le, '');
});

test('état hypothécaire pour l’agent : en cours, radiées ou périmées, lecture incomplète dite', () => {
  const app = chargerApplication();
  const e = { luLe: 'x', delivreLe: '2026-06-08', lecture: { complete: false, annoncees: 3, reconnues: 2 }, enAttente: 0, facesStock: 2,
    inscriptions: [{ nature: 'HYP', etat: 'en_cours', page: 9, creancier: 'BANQUE' }, { nature: 'PRIV', etat: 'perimee', page: 11 }], chargesComplement: [] };
  const r = app.lectureEtatHypothecairePourAgent(e);
  assert.equal(r.lecture_complete, false);
  assert.equal(r.inscriptions_en_cours.length, 1);
  assert.equal(r.radiees_ou_perimees[0].etat, 'périmée');
  assert.equal(app.lectureEtatHypothecairePourAgent(null), null);
});

test('routines : liste avec identifiants et état ; « terminer » refuse une proposition à décider', async () => {
  const app = chargerApplication();
  app.propositionsClaire.liste = [{ id: 'p1', titre: 'Constitution', etat: 'acceptee', dossierId: 'v1', creeLe: '2026-10-27T08:00:00Z' }, { id: 'p2', titre: 'Relance', etat: 'proposee', dossierId: 'v1' }];
  const l = await app.routinesClaireAgent({ mode: 'lister', dossier_id: 'v1', proposition_id: '' });
  assert.equal(l.propositions.length, 2);
  assert.equal(l.propositions[0].etat, 'autorisée, à terminer');
  const refus = await app.routinesClaireAgent({ mode: 'terminer', dossier_id: '', proposition_id: 'p2' });
  assert.match(refus.erreur, /seule une proposition autorisée/);
});

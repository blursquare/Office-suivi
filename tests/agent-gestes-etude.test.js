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
  // Liste relue sans serveur : le rechargement est remplacé, la liste posée reste.
  require('node:vm').runInContext('chargerPropositionsClaire = async () => {};', app);
  app.propositionsClaire.liste = [{ id: 'p1', titre: 'Constitution', type: 'document', etat: 'acceptee', dossierId: 'v1', creeLe: '2026-10-27T08:00:00Z' }, { id: 'p2', titre: 'Relance', etat: 'proposee', dossierId: 'v1' }, { id: 'p3', titre: 'Email', type: 'email', etat: 'acceptee', dossierId: 'v1' }];
  const l = await app.routinesClaireAgent({ mode: 'lister', dossier_id: 'v1', proposition_id: '' });
  assert.equal(l.propositions.length, 3);
  assert.equal(l.propositions[0].etat, 'autorisée, à terminer');
  const refus = await app.routinesClaireAgent({ mode: 'terminer', dossier_id: '', proposition_id: 'p2' });
  assert.match(refus.erreur, /seule une proposition autorisée/);
  assert.match((await app.routinesClaireAgent({ mode: 'terminer', dossier_id: '', proposition_id: 'p3' })).erreur, /rien à terminer/, 'un email autorisé : rien à terminer (comme la carte)');
});

test('audit 0.385.0 : seule une nature reconnue part, jamais un texte libre (« au profit de M. DURAND »)', () => {
  const app = chargerApplication();
  assert.equal(app.natureChargePourAgent('PRIVILEGE DE PRETEUR DE DENIERS-HYPOTHEQUE CONVENTIONNELLE', 9), 'privilège de prêteur de deniers et hypothèque conventionnelle');
  assert.equal(app.natureChargePourAgent('PRIVILEGE DU VENDEUR', 11), 'privilège du vendeur');
  assert.equal(app.natureChargePourAgent('Pacte de préference', 5), 'pacte de préférence');
  assert.equal(app.natureChargePourAgent('Engagement au profit de M. DURAND Bernard', 7), 'charge (nature à lire sur l’état, p. 7)');
  const r = app.lectureEtatHypothecairePourAgent({ inscriptions: [], chargesComplement: [{ nature: 'Servitude de passage au profit de M. DURAND Bernard', page: 4 }] });
  assert.equal(r.charges_signalees_dans_un_complement[0].nature, 'servitude');
});

// Audit du 07/10 : notaires du répertoire partout, valeurs client et bien d'Authentic d'abord, échéances cohérentes entre elles
// et avec les pièces de préemption (DIA, SAFER, bois et forêts). Noms et dates inventés.
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();
const planning = require('../commun/planning');

const CARNET = [
  { id: 'o1', nom: 'Office DURAND', ville: 'VENDÔME', notaires: ['Paul DURAND'], email: 'office@exemple.fr' },
  { id: 'o2', nom: 'Office LEROUX', ville: 'MER', notaires: ['Anne LEROUX'], email: 'mer@exemple.fr' }
];

test('notaires : un champ hors répertoire bloque la création et le complément', () => {
  assert.strictEqual(app.notairesHorsRepertoireFormulaire({ notaireVendeur: 'Maître Paul DURAND (VENDÔME)', notaireAcquereur: '' }, CARNET).length, 0);
  assert.strictEqual(app.notairesHorsRepertoireFormulaire({ notaireVendeur: 'Maître Inconnu QUIDAM', notaireAcquereur: 'Maître Anne LEROUX (MER)' }, CARNET).join(','), 'notaire du vendeur');
  assert.strictEqual(app.notairesHorsRepertoireFormulaire({ notaireVendeur: 'Maître Sophie GOSSART (BLOIS)', notaireAcquereur: 'X Y' }, CARNET).join(','), 'notaire de l’acquéreur');
});

test('complément par le compromis : une valeur venue d’Authentic n’est jamais remplacée', () => {
  const d = { nom: 'MARTIN / DUPUIS', typeVente: 'maison', adresseBien: 'VINEUIL (41350), 3 rue des Tilleuls', prixVente: 200000, emailVendeur: 'a@exemple.fr',
    authentic: { valeurs: { adresseBien: 'VINEUIL (41350), 3 rue des Tilleuls', prixVente: 200000, 'parties:VENDEUR': ['Jean MARTIN'] },
      fichesAuthentic: { 'VENDEUR|jean martin': { nom: 'Jean MARTIN', role: 'VENDEUR', emails: ['a@exemple.fr'], telephones: ['0601020304'] } } } };
  const verrous = app.clesComplementAuthentic(d);
  assert.strictEqual([...verrous].sort().join(','), 'adresseBien,emailVendeur,nom,prixVente');
  const fiche = app.valeursFicheComplement(d);
  const lu = Object.assign({}, fiche, { prixVente: 210000, emailVendeur: 'autre@exemple.fr', nom: 'MARTIN / DUPONT', adresseBien: 'BLOIS (41000), 1 rue Haute' });
  const c = app.comparaisonComplement(fiche, lu, verrous);
  assert.strictEqual(c.filter(x => x.etat === 'authentic').map(x => x.cle).sort().join(','), 'adresseBien,emailVendeur,nom,prixVente');
  const { resolu } = app.resolutionComplement(c, { prixVente: 'compromis', nom: 'compromis' });
  assert.strictEqual(resolu.prixVente, 200000, 'même en choisissant « Compromis », Authentic reste');
  assert.strictEqual(resolu.emailVendeur, 'a@exemple.fr', 'pas d’email du compromis ajouté à ceux d’Authentic');
  // Téléphones du compromis : ignorés pour le côté déjà renseigné par Authentic, ajoutés pour l'autre.
  const copie = JSON.parse(JSON.stringify(d));
  app.appliquerComplementSurDossier(copie, resolu, { telephones: { vendeur: '0699999999', acquereur: '0611111111' } });
  assert.strictEqual(copie.telephoneVendeur || '', '');
  assert.match(copie.telephoneAcquereur, /0611111111|06 11 11 11 11/);
  // Sans Authentic : le compromis complète comme avant.
  assert.strictEqual(app.clesComplementAuthentic({}).length, 0);
});

test('DIA envoyée (Authentic) : réponse attendue datée (envoi + 2 mois), jamais une renonciation tacite', () => {
  const d = { id: 'd1', nom: 'MARTIN', typeVente: 'maison', sansPret: true, acte: '2026-12-20', pieces: {}, piecesPersonnalisees: [],
    authentic: { demandes: { renonciationPreemption: { date: '2026-10-01', titre: 'DIA' } } } };
  assert.strictEqual(planning.echeanceDiaDossier(d), '2026-12-01');
  const items = planning.echeancesPlanning(d);
  assert.ok(items.some(i => i.type === 'dia' && i.iso === '2026-12-01'));
  assert.ok(!items.some(i => i.type === 'preemption'), 'l’attente sans date laisse place à l’attente datée');
  assert.ok(!items.some(i => i.type === 'fixerRdv'), 'pas de rendez-vous sans le document de renonciation');
  // Délai dépassé sans document : toujours pas levée.
  assert.strictEqual(planning.preemptionLevee(d), false);
  // Renonciation reçue : plus de délai.
  d.pieces.renonciationPreemption = 'recue';
  assert.strictEqual(planning.echeanceDiaDossier(d), '');
  assert.ok(planning.echeancesPlanning(d).some(i => i.type === 'fixerRdv'));
  // Sans DIA envoyée : l'attente sans date, comme avant.
  const e = { id: 'd2', typeVente: 'maison', sansPret: true, acte: '2026-12-20', pieces: {} };
  assert.ok(planning.echeancesPlanning(e).some(i => i.type === 'preemption'));
});

test('pièces ajoutées par l’analyse des droits de préemption : elles retiennent la signature jusqu’à réception', () => {
  const d = { id: 'd3', typeVente: 'terrain', sansPret: true, acte: '2026-12-20', pieces: { renonciationPreemption: 'recue', 'perso-foret-preference': 'manquante' },
    piecesPersonnalisees: [{ cle: 'perso-foret-preference', label: 'Purge du droit de préférence (bois et forêts)' }],
    preemption: { piecesAjoutees: ['perso-foret-preference'] } };
  assert.strictEqual(planning.piecesPreemptionEnAttente(d).join(','), 'perso-foret-preference');
  assert.strictEqual(planning.preemptionLevee(d), false);
  assert.ok(planning.attentesRedaction(d).includes('renonciation au droit de préemption'));
  d.pieces['perso-foret-preference'] = 'recue';
  assert.strictEqual(planning.preemptionLevee(d), true);
  // « Réponse SAFER » ajoutée par l'analyse : suivie par saferLevee, pas par la préemption.
  const s = { id: 'd4', typeVente: 'terrain', pieces: { renonciationPreemption: 'recue', 'perso-safer': 'manquante' },
    piecesPersonnalisees: [{ cle: 'perso-safer', label: 'Réponse SAFER' }], preemption: { piecesAjoutees: ['perso-safer'] } };
  assert.strictEqual(planning.preemptionLevee(s), true);
  assert.strictEqual(planning.saferLevee(s), false);
});

test('rendez-vous à placer : même règle que le planning (SAFER attendue sans date, DIA sans document → pas de créneau)', () => {
  const base = { typeVente: 'maison', sansPret: true, pieces: { renonciationPreemption: 'recue' }, piecesPersonnalisees: [] };
  const libre = Object.assign({ id: 'a' }, base);
  const saferSansDate = Object.assign({ id: 'b' }, base, { piecesPersonnalisees: [{ cle: 'perso-safer', label: 'Réponse SAFER' }], pieces: { renonciationPreemption: 'recue', 'perso-safer': 'manquante' } });
  const saferDatee = Object.assign({ id: 'c' }, base, { authentic: { safer: { envoyeeLe: '2026-10-01' } } });
  const diaDatee = Object.assign({ id: 'e' }, base, { pieces: {}, authentic: { demandes: { renonciationPreemption: { date: '2026-10-01' } } } });
  const diaSansDate = Object.assign({ id: 'f' }, base, { pieces: {} });
  // DIA envoyée mais document de renonciation pas reçu : pas de créneau (étude 07/10 : « on doit avoir le document pour signer »).
  assert.strictEqual(app.dossiersAPlacer([libre, saferSansDate, saferDatee, diaDatee, diaSansDate]).map(d => d.id).join(','), 'a,c');
});

test('questionnaire non envoyé 30 jours après la signature : archivage (étude 07/10) ; un archivage automatique compte comme archivé', () => {
  const d = { id: 'q1', rendezVousSignature: '2026-09-01', emailAcquereur: 'a@exemple.fr', historique: [{ date: '2026-08-01T09:00:00Z', texte: 'Dossier créé' }] };
  assert.strictEqual(app.archivageSansQuestionnaireDu(d, '2026-10-01'), false, 'J+30 : encore dans « À faire »');
  assert.strictEqual(app.archivageSansQuestionnaireDu(d, '2026-10-02'), true, 'J+31');
  assert.strictEqual(app.archivageSansQuestionnaireDu(Object.assign({}, d, { questionnaireEnvoyeLe: '2026-09-02', questionnaireVendeurEnvoyeLe: '2026-09-02' }), '2026-10-02'), false);
  assert.strictEqual(app.archivageSansQuestionnaireDu(Object.assign({}, d, { archive: true }), '2026-10-02'), false);
  assert.strictEqual(app.archivageSansQuestionnaireDu(Object.assign({}, d, { typeAffaire: 'succession' }), '2026-10-02'), false);
  const auto = Object.assign({}, d, { historique: d.historique.concat({ date: '2026-09-05T09:00:00Z', texte: 'Dossier archivé automatiquement (questionnaire de satisfaction envoyé au vendeur et à l’acquéreur)' }) });
  assert.strictEqual(app.etaitDossierActifA(auto, new Date('2026-09-10')), false);
  assert.strictEqual(app.etaitDossierActifA(auto, new Date('2026-09-01')), true);
});

test('acte signé : une seule règle pour tout ce qui suit la signature (Authentic « signé le … » compris, sans rendez-vous sur la fiche)', () => {
  const auth = { id: 's1', emailAcquereur: 'a@exemple.fr', authentic: { acte: { etat: 'signe', date: '2026-09-20' } } };
  assert.strictEqual(app.dateSignatureDossier(auth, '2026-10-01'), '2026-09-20');
  assert.strictEqual(app.stadeDossier(auth, '2026-10-01'), 'signe');
  assert.ok(app.actionsDuJour([auth], '2026-10-01').actions.some(a => a.type === 'questionnaire'), 'questionnaire proposé');
  assert.strictEqual(app.archivageSansQuestionnaireDu(auth, '2026-10-21'), true);
  // Rendez-vous passé non coché : signé pour la suite du dossier ; rendez-vous à venir : pas encore.
  assert.strictEqual(app.dateSignatureDossier({ rendezVousSignature: '2026-09-30' }, '2026-10-01'), '2026-09-30');
  assert.strictEqual(app.dateSignatureDossier({ rendezVousSignature: '2026-10-02' }, '2026-10-01'), '');
});

test('succession : « À faire » ne propose ni appel de fonds, ni projet, ni RIB, ni questionnaire (comme le planning)', () => {
  const succ = { id: 'su', nom: 'SUCC DURAND', typeAffaire: 'succession', sansPret: true, emailAcquereur: 'a@exemple.fr', rendezVousSignature: '2026-10-03' };
  const types = app.actionsDuJour([succ], '2026-10-01').actions.map(a => a.type);
  assert.ok(!types.some(t => ['appelFonds', 'projetEnvoye', 'rib', 'fonds', 'relanceFonds'].includes(t)), types.join(','));
  const apres = app.actionsDuJour([Object.assign({}, succ, { rendezVousSignature: '2026-09-20' })], '2026-10-01').actions.map(a => a.type);
  assert.ok(!apres.includes('questionnaire'), apres.join(','));
});

test('signé dans Authentic sans rendez-vous futur : statistiques, avancement et tuiles du mois le comptent signé', () => {
  const d = { id: 'sa', rendezVousSignature: '2026-10-20', authentic: { acte: { etat: 'signe', date: '2026-10-05' } } };
  assert.strictEqual(app.dateSignatureFaite(d, '2026-10-07'), '2026-10-05');
  const sig = app.etapesAvancement(d, '2026-10-07').find(e => e.type === 'signature');
  assert.ok(sig && sig.fait, 'étape « signature » faite');
  assert.strictEqual(app.syntheseMoisSuivi([d], '2026-10-07').signees, 1);
  // Rendez-vous du jour même : compté dans les délais (statistiques), pas encore « signé » ailleurs.
  assert.strictEqual(app.dateSignatureFaite({ rendezVousSignature: '2026-10-07' }, '2026-10-07'), '2026-10-07');
  assert.strictEqual(app.dateSignatureDossier({ rendezVousSignature: '2026-10-07' }, '2026-10-07'), '');
});

test('délai de relance des fonds : un seul nombre pour le poste et le serveur (commun/planning.js)', () => {
  assert.strictEqual(planning.JOURS_RELANCE_FONDS, 3);
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server', 'src', 'jobs', 'rappels.js'), 'utf8');
  assert.ok(/j > JOURS_RELANCE_FONDS/.test(src), 'alerte Teams « fonds pas reçus » sur la constante commune');
});

test('appel de fonds : heure et lieu du rendez-vous repris de la fiche, comme dans les emails', () => {
  const base = { id: 'af1', nom: 'A / B', rendezVousSignature: '2026-10-20', rendezVousSignatureHeure: '14:30', prixVente: 200000 };
  const p = app.prefillAppelFonds(base, {});
  assert.strictEqual(p.heureRdv, '14:30');
  assert.strictEqual(p.lieuRdv.valeur, "en l'étude");
  assert.strictEqual(app.prefillAppelFonds(Object.assign({}, base, { rendezVousType: 'visio' }), {}).lieuRdv.valeur, 'par visioconférence');
  const conf = app.prefillAppelFonds(Object.assign({}, base, { rendezVousType: 'confrere', notaireAcquereur: 'Maître Paul DURAND (VENDÔME)' }), {});
  assert.strictEqual(conf.lieuRdv.valeur, '__autre');
  assert.match(conf.lieuRdv.autre, /office de Maître Paul DURAND \(VENDÔME\)/);
  const sansHeure = app.prefillAppelFonds(Object.assign({}, base, { rendezVousSignatureHeure: '' }), {});
  assert.ok(sansHeure.aCompleter.some(t => /Heure du rendez-vous/.test(t)));
});

test('quotités : frais et droits de l’acte = le montant du décompte de l’appel de fonds (même barème)', () => {
  const d = { id: 'q1', nom: 'A / B', adresseBien: 'BLOIS (41000), 2 rue des Lilas', typeVente: 'maison', prixVente: 200000,
    parties: [{ role: 'ACQUEREUR', nom: 'Paul DUPONT', civilite: 'M' }] };
  const q = app.prefillQuotites(d);
  const af = app.prefillAppelFonds(d, {});
  assert.ok(q.fraisActe > 0);
  assert.strictEqual(q.fraisActe, af.fraisActe);
});

test('copropriété soumise au DPU : une seule pièce de renonciation, celle que le scan coche ; ancienne pièce « (DIA) » reprise', () => {
  const d = { id: 'sc1', typeVente: 'copropriete', piecesPersonnalisees: [{ cle: 'perso-dia', label: 'Renonciation au droit de préemption (DIA)' }],
    pieces: { 'perso-dia': 'recue' }, preemption: { droits: [], piecesAjoutees: ['perso-dia'] } };
  assert.strictEqual(app.migrerPieceDiaCopropriete(d), true);
  assert.strictEqual(d.piecesPersonnalisees.length, 0);
  assert.strictEqual(d.pieces.renonciationPreemption, 'recue');
  assert.strictEqual(d.preemption.piecesAjoutees.join(','), 'renonciationPreemption');
  assert.strictEqual(planning.preemptionLevee(d), true);
  const liste = app.checklistPieces('copropriete', d);
  const p = app.pieceDepuisScanRange(d, 'renonciationPreemption', 'Renonciation au droit de préemption - Claire Scan.pdf', liste, '2026-10-07T10:00:00Z');
  assert.strictEqual(p.cle, 'renonciationPreemption');
  // Attendue mais pas reçue : retient le planning ; retirée à la main : ne retient plus.
  const e = { typeVente: 'copropriete', pieces: {}, preemption: { piecesAjoutees: ['renonciationPreemption'] } };
  assert.strictEqual(planning.preemptionLevee(e), false);
  assert.strictEqual(planning.preemptionLevee(Object.assign({}, e, { piecesRetirees: ['renonciationPreemption'] })), true);
});

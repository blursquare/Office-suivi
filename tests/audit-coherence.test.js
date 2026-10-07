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

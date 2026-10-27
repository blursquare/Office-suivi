// Modèle d'Authen.TIC (commun/authentic-modele.js, plan du 27/10, étape 2) : l'instantané d'un dossier lu dans une page relevée.
// Page inventée, structure de la cartographie de l'étude (aucune donnée réelle).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../commun/authentic-modele');

const PAGE = {
  texte: ['A 2026 00500 VTE MARTIN / DURAND', '2 - VTE MARTIN / DURAND', 'Préparation définitive', '14/10/2026', 'Importer avec 6e SENS',
    'Comparants (2)', 'person', 'M. MARTIN Paul', 'Vendeur', 'person', 'Mme DURAND Claire', 'Acquéreur',
    'Immeubles (1)', '41000 BLOIS, 2 rue des Lices', 'Immeuble vendu', 'Tiers (0)', '1 - Promesse VTE MARTIN / DURAND'].join('\n'),
  tableaux: [
    { titre: 'Etat civil', entete: [], lignes: [['ECV État-Civil - Acte de Naissance - MARTIN Paul', '', '01/10/2026', '', 'Réponse positive'], ['ECV État-Civil - Acte de Naissance - DURAND Claire', '', '02/10/2026', '', 'Envoyé']] },
    { titre: 'Télé@ctes - ANF', entete: [], lignes: [['Réquisition Hors Formalité - BLOIS 1', '', '22/09/2026', '25/09/2026', 'Retour le 25/09/2026']] },
    { titre: 'Rédaction', entete: [], lignes: [['ACT Vente MARTIN / DURAND', '', '20/11/2026', '', 'Non rédigé']] },
    { titre: 'Micen', entete: [], lignes: [['MIC Copie Simple', '', '03/10/2026', '', 'Prêt']] },
    { titre: '', entete: ['Section', 'Numéro', 'Contenance'], lignes: [['AT', '433', '05a 20ca']] }
  ]
};

test('en-tête, sous-dossier et statut du badge', () => {
  assert.deepEqual(M.enTeteDossierAT(PAGE.texte), { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' });
  assert.equal(M.intituleSousDossierAT(PAGE.texte), '2 - VTE MARTIN / DURAND', 'jamais la promesse listée plus bas');
  assert.deepEqual(M.statutSousDossierAT(PAGE.texte), { statut: 'Préparation définitive', le: '2026-10-14' });
  assert.equal(M.natureDossierAT('2 - VTE MARTIN / DURAND'), 'VTE');
  assert.equal(M.natureDossierAT('1 - Succession DUPONT'), 'SUCC');
  assert.equal(M.natureDossierAT('1 - Donation HULLIN'), 'DONATION');
});

test('comparants avec leur qualité, immeubles avec leur étiquette', () => {
  const g = M.panneauGaucheAT(PAGE.texte);
  assert.equal(g.comparants.map((c) => `${c.nom}=${c.role}`).join('|'), 'M. MARTIN Paul=Vendeur|Mme DURAND Claire=Acquéreur');
  assert.equal(g.immeubles.map((i) => `${i.adresse}=${i.etiquette}`).join('|'), '41000 BLOIS, 2 rue des Lices=Immeuble vendu');
});

test('formalités : badge, section, statut et dates ; jamais le cadastre', () => {
  const inst = M.instantaneDepuisPagesAT([{ nature: 'dossier', capture: PAGE, recueLe: '2026-10-27T10:00:00Z' }]);
  const sd = inst.sousDossier;
  assert.equal(sd.formalitesPrealables.map((f) => `${f.badge}:${f.statut}`).join('|'), 'ECV:Réponse positive|ECV:Envoyé|T@:Retour le 25/09/2026');
  assert.equal(sd.formalitesPrealables[0].libelle, 'État-Civil - Acte de Naissance - MARTIN Paul', 'le badge est retiré du libellé');
  assert.equal(sd.actes.map((f) => `${f.badge}:${f.statut}`).join('|'), 'ACT:Non rédigé');
  assert.equal(sd.formalitesPosterieures.map((f) => `${f.badge}:${f.statut}`).join('|'), 'MIC:Prêt');
  assert.equal(sd.formalitesPrealables[2].dates.join(), '2026-09-22,2026-09-25');
  assert.equal(inst.luLe, '2026-10-27T10:00:00Z');
});

test('adaptateur vers la fiche : état de l’acte, statut du sous-dossier, formalités en attente', () => {
  const f = M.versFicheAT(M.instantaneDepuisPagesAT([{ nature: 'client', capture: { texte: 'x' } }, { nature: 'dossier', capture: PAGE }]));
  assert.equal(f.reference, 'A 2026 00500');
  assert.deepEqual(f.statutSousDossier, { statut: 'Préparation définitive', le: '2026-10-14' });
  assert.equal(f.acte.etat, 'Non rédigé');
  assert.equal(f.enAttente, 1, 'seule la demande d’état civil « Envoyé » attend');
  assert.equal(M.instantaneDepuisPagesAT([{ nature: 'client', capture: { texte: 'x' } }]), null, 'sans page du dossier : rien');
  assert.equal(M.versFicheAT(null), null);
});

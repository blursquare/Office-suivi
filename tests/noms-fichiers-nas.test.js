'use strict';
// Outil « Noms de fichiers du NAS » (03/10) : forme d'un nom, regroupement par pièce probable (termes
// élargis, pour l'outil seulement), décisions de l'étude appliquées à la reconnaissance des pièces.
// Noms inventés, sur le modèle des exemples donnés par l'étude.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const NOMS = [
  [0, 'DIAG ERP 3 rue des Lilas.pdf'], [1, 'DIAG ERP 12 rue Haute.pdf'], [2, 'DIAG ERP 5 rue de la Gare.pdf'],
  [3, 'ERP établissement recevant du public.pdf'],
  [0, '3843 _contrat_pret.pdf'], [1, '2210_contrat_pret.pdf'], [2, 'Bail précaire_pret.pdf'],
  [3, 'Offre de prêt DUPONT.pdf'], [4, 'Offre de prêt MARTIN.pdf'],
  [4, 'Titre de propriété.pdf'], [5, 'Titre de propriété.pdf'], [5, 'Courrier notaire.pdf']
];

test('formeNomFichier : mots d’usage gardés, nombres en #, mots propres au dossier en …', () => {
  const vocab = new Set(['diag', 'rue', 'contrat', 'bail', 'precaire']);
  assert.equal(app.formeNomFichier('DIAG ERP 3 rue des Lilas.pdf', vocab), 'diag erp # …', 'l’adresse est mise de côté');
  assert.equal(app.formeNomFichier('DIAG ERP 7 avenue Victor Hugo.pdf', new Set(['diag', 'victor', 'hugo'])), 'diag erp # …');
  assert.equal(app.formeNomFichier('3843 _contrat_pret.pdf', vocab), '# contrat pret');
  assert.equal(app.formeNomFichier('Bail précaire_pret.pdf', vocab), 'bail precaire pret');
  assert.equal(app.formeNomFichier('2024 12 03 Offre DUPONT MARTIN.pdf', vocab), '# offre …');
});

test('regexFormeNom : la forme reconnaît ses voisins, pas un autre type de nom', () => {
  assert.equal(app.nomCorrespondForme('diag erp # …', 'DIAG ERP 27 rue du Moulin Vert.pdf'), true);
  assert.equal(app.nomCorrespondForme('diag erp # …', 'DIAG ERP rue du Moulin.pdf'), false, 'le numéro manque');
  assert.equal(app.nomCorrespondForme('# contrat pret', '9921-contrat_pret.pdf'), true);
  assert.equal(app.nomCorrespondForme('# contrat pret', 'contrat_pret.pdf'), false);
  assert.equal(app.formeExacteNom('ERP établissement recevant du public.pdf'), 'erp etablissement recevant public');
});

test('groupesFormesNoms : regroupés par pièce probable et par forme, le plus fréquent d’abord', () => {
  const r = app.groupesFormesNoms(NOMS);
  assert.equal(r.nbDossiers, 6);
  const formes = (cle) => r.groupes[cle].map(g => `${g.forme} (${g.fichiers})`).join(' | ');
  assert.equal(formes('erp'), 'diag erp # … (3) | erp … (1)');
  assert.equal(formes('offrePret'), '# contrat pret (2) | offre pret … (2) | … pret (1)');
  assert.equal(formes('titrePropriete'), 'titre propriete (2)');
  assert.equal(r.groupes.erp[0].dossiers, 3);
  assert.ok(!Object.values(r.groupes).some(gs => gs.some(g => /courrier/.test(g.forme))), 'un nom sans terme de pièce n’est proposé nulle part');
  assert.equal(app.reconnaissanceGroupeNomsNas(r.groupes.erp[0]).etat, 'tous');
  assert.equal(app.reconnaissanceGroupeNomsNas(r.groupes.offrePret[2]).etat, 'aucun');
});

test('décisions : « oui » fait reconnaître, « non » écarte même un nom que le motif prenait, au nom près', () => {
  const erp = app.pieceParCleNomsNas('erp');
  const n = (x) => app.normaliserNomPourMotif(x);
  assert.equal(app.correspondancePieceNom(erp, n('ERP établissement recevant du public.pdf')), 'exact', 'le motif prend « ERP » aujourd’hui');
  assert.equal(app.nomDitOffrePret(n('Bail précaire_pret.pdf')), false);
  assert.equal(app.nomDitOffrePret(n('PRET_9921_signé.pdf')), false);
  app.compilerFormesNoms([
    { cle: 'erp', forme: 'erp etablissement recevant public', decision: 'non' },
    { cle: 'offrePret', forme: 'pret # signe', decision: 'oui' },
    { cle: 'offrePret', forme: 'bail precaire pret', decision: 'non' }
  ]);
  assert.equal(app.correspondancePieceNom(erp, n('ERP établissement recevant du public.pdf')), null);
  assert.equal(app.correspondancePieceNom(erp, n('ERP DUPONT.pdf')), 'exact', 'le « non » au nom près n’écarte pas ses voisins');
  assert.equal(app.nomDitOffrePret(n('PRET_9921_signé.pdf')), true);
  assert.equal(app.nomDitOffrePret(n('Bail précaire_pret.pdf')), false);
  assert.equal(app.decisionFormePourNom('offrePret', n('PRET_17_signe.pdf')), 'oui');
  app.compilerFormesNoms([]);
  assert.equal(app.correspondancePieceNom(erp, n('ERP établissement recevant du public.pdf')), 'exact');
});

'use strict';
// Outil « Noms de fichiers du NAS » (03/10) : forme d'un nom, regroupement par pièce probable (termes
// élargis, pour l'outil seulement), décisions de l'étude appliquées à la reconnaissance des pièces.
// Noms inventés, sur le modèle des exemples donnés par l'étude.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('formeNomFichier : mots d’usage gardés, nombres en #, mots propres au dossier en …', () => {
  const vocab = new Set(['diag', 'rue', 'contrat', 'bail', 'precaire']);
  assert.equal(app.formeNomFichier('DIAG ERP 3 rue des Lilas.pdf', vocab), 'diag erp # …', 'l’adresse est mise de côté');
  assert.equal(app.formeNomFichier('DIAG ERP 7 avenue Victor Hugo.pdf', new Set(['diag', 'victor', 'hugo'])), 'diag erp # …');
  assert.equal(app.formeNomFichier('3843 _contrat_pret.pdf', vocab), '# contrat pret');
  assert.equal(app.formeNomFichier('Bail précaire_pret.pdf', vocab), 'bail precaire pret');
  assert.equal(app.formeNomFichier('2024 12 03 Offre DUPONT MARTIN.pdf', vocab), '# offre …');
});

test('regexFormeNom : la forme reconnaît ses voisins, pas un autre type de nom', () => {
  assert.equal(app.formeExacteNom('ERP établissement recevant du public.pdf'), 'erp etablissement recevant public');
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

test('formes décidées : la décision la plus récente l’emporte (un « Oui » récent passe devant un ancien « Non »)', () => {
  const app = chargerApplication();
  const n = (x) => app.normaliserNomPourMotif(x);
  const nom = n('Certificat_Assainissement.pdf');
  app.compilerFormesNoms([
    { cle: 'reponseAssainissement', forme: 'certificat assainissement', decision: 'oui', le: '2026-10-05T14:00:00Z' },
    { cle: 'reponseAssainissement', forme: 'certificat …', decision: 'non', le: '2026-10-05T12:00:00Z' }
  ]);
  assert.equal(app.decisionFormePourNom('reponseAssainissement', nom), 'oui');
  app.compilerFormesNoms([
    { cle: 'reponseAssainissement', forme: 'certificat assainissement', decision: 'oui', le: '2026-10-05T12:00:00Z' },
    { cle: 'reponseAssainissement', forme: 'certificat …', decision: 'non', le: '2026-10-05T14:00:00Z' }
  ]);
  assert.equal(app.decisionFormePourNom('reponseAssainissement', nom), 'non');
  app.compilerFormesNoms([]);
});

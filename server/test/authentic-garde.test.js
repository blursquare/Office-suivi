// Garde-fous de CLAIRE dans Authentic (étape 1 du plan du 27/10) : gestes permis, liste noire, écriture éteinte par défaut.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/authentic/garde');
const A = require('../src/authenticClaire');

test('liste noire : envoyer, signer, supprimer, parapher, expédier, archiver… jamais cliqués', () => {
  for (const l of ['Envoyer', 'Envoyer via LRE', 'Expédier', 'Parapheur', 'Signature directe', 'Préparer signature', 'Signer', 'Annuler la signature',
    'Supprimer le dossier', 'Supprimer', 'Ajouter au Micen', 'Retirer du Micen', 'Archiver', 'Dupliquer le sous-dossier', 'Transférer', 'Imprimer',
    'Déplacer', 'Partager', 'Renommer', 'Enregistrer et quitter', 'Intégrer les données aux fiches clients', 'Détacher de l’acte']) {
    assert.equal(G.libelleInterdit(l), true, l);
  }
  for (const l of ['Retour', 'Formalités préalables', 'Pièces jointes', 'Mails', 'Rechercher', 'Valider']) assert.equal(G.libelleInterdit(l), false, l);
});

test('gestes permis : un geste inconnu, un libellé hors liste ou un bouton interdit sous le pointeur sont refusés', () => {
  assert.equal(G.motifRefus({ geste: 'navigation', vise: 'Retour', bouton: '', texte: 'Retour' }), '');
  assert.equal(G.motifRefus({ geste: 'donnee', vise: 'M. EXPORTEC Paul', bouton: '', texte: 'M. EXPORTEC Paul' }), '', 'un nom de la fiche peut contenir un mot de la liste');
  assert.match(G.motifRefus({ geste: 'donnee', vise: 'M. DURAND', bouton: 'Supprimer', texte: 'M. DURAND' }), /bouton interdit/);
  assert.match(G.motifRefus({ geste: 'navigation', vise: 'Envoyer', bouton: '', texte: 'Envoyer' }), /hors de la liste/);
  assert.match(G.motifRefus({ vise: 'Retour' }), /geste inconnu/);
  assert.match(G.motifRefus({ geste: 'cliquer', vise: 'Retour' }), /geste inconnu/);
});

test('écriture : refusée tant que l’étude ne l’a pas allumée', () => {
  assert.match(G.motifRefus({ geste: 'ecriture', vise: 'Valider', bouton: 'Valider', texte: 'Valider' }), /éteinte/);
  assert.equal(G.motifRefus({ geste: 'ecriture', vise: 'Valider', bouton: 'Valider', texte: 'Valider', ecritureAutorisee: true }), '');
  assert.match(G.motifRefus({ geste: 'ecriture', vise: 'Envoyer', bouton: 'Envoyer', texte: 'Envoyer', ecritureAutorisee: true }), /interdit/, 'même allumée, jamais un envoi');
  assert.throws(() => G.controlerClic({ geste: 'ecriture', vise: 'Valider' }), (e) => e.refusGarde === true);
  assert.ok(G.refusRecents().length >= 1 && G.refusRecents()[0].geste === 'ecriture', 'le refus est gardé pour Réglages › Authentic');
});

test('préparer des demandes : éteint par défaut, gardé tel quel, jamais sans l’option du parcours', async () => {
  assert.equal(A.assainirConnexionAuthentic({ actif: true }).preparerDemandes, false);
  assert.equal(A.assainirConnexionAuthentic({ preparerDemandes: true }).preparerDemandes, true);
  assert.equal(A.vueConnexionAuthentic(A.assainirConnexionAuthentic({ preparerDemandes: true, motDePasse: 'x' })).preparerDemandes, true);
  await assert.rejects(() => A.preparerFormalite({}, { reference: 'A 2026 00001' }, { type: 'cjn', parties: [], etape: () => {} }), /éteint/);
});

test('audit 0.376.0 : un texte de la fiche qui contient un mot de la liste se clique, un nom n’est jamais gardé dans les refus', () => {
  for (const t of ['41000 BLOIS 12 rue de l’Imprimerie', 'A 2026 00286 VTE SCI EXPORTEC / DURAND', 'Mme Louise PARTAGER', '41000 BLOIS rue de la Signature']) {
    assert.equal(G.motifRefus({ geste: 'donnee', vise: t, bouton: t, texte: t }), '', t);
  }
  assert.match(G.motifRefus({ geste: 'donnee', vise: 'Mme Louise PARTAGER', bouton: 'Mme Louise PARTAGER supprimer', texte: 'Mme Louise PARTAGER' }), /bouton interdit/, 'une corbeille sur le lien reste refusée');
  assert.throws(() => G.controlerClic({ geste: 'donnee', vise: 'M. DUPONT Jean', bouton: 'Supprimer M. DUPONT Jean', texte: 'M. DUPONT Jean' }));
  const r = G.refusRecents()[0];
  assert.equal(r.libelle, 'supprim', 'seul le mot interdit est gardé');
  assert.ok(!JSON.stringify(G.refusRecents()).includes('DUPONT'));
});

test('audit 0.378.0 : l’icône d’aperçu doit dire l’aperçu ; une corbeille ou une icône « delete_forever » jamais', () => {
  assert.equal(G.motifRefus({ geste: 'apercu', vise: '', bouton: 'Aperçu', texte: 'Aperçu' }), '');
  assert.equal(G.motifRefus({ geste: 'apercu', vise: '', bouton: 'pi pi-image', texte: '' }), '');
  assert.match(G.motifRefus({ geste: 'apercu', vise: '', bouton: 'Supprimer l’aperçu pi pi-trash', texte: '' }), /interdit/);
  assert.match(G.motifRefus({ geste: 'apercu', vise: '', bouton: 'delete_forever', texte: '' }), /ne dit pas|interdit/);
  assert.match(G.motifRefus({ geste: 'apercu', vise: '', bouton: 'image delete_outline', texte: '' }), /interdit/);
  assert.match(G.motifRefus({ geste: 'apercu', vise: '', bouton: '', texte: '' }), /ne dit pas/, 'sans libellé : pas de clic');
  assert.match(G.motifRefus({ geste: 'apercu', vise: '', bouton: 'Procuration / pouvoir', texte: '' }), /ne dit pas/, '« pouvoir » n’est pas « voir »');
});

test('suivis (étape 7) : le menu et ses entrées permis (« Actes à signer » compris) ; « Exporter » ou un bouton de plus refusés', () => {
  assert.equal(G.motifRefus({ geste: 'suivi', vise: 'Suivis', bouton: 'Suivis', texte: 'Suivis' }), '');
  assert.equal(G.motifRefus({ geste: 'suivi', vise: 'Actes à signer', bouton: 'Actes à signer', texte: 'Actes à signer' }), '');
  assert.equal(G.motifRefus({ geste: 'suivi', vise: 'Suivi SAFER/DIA-DPU', bouton: 'Suivi SAFER/DIA-DPU', texte: 'Suivi SAFER/DIA-DPU' }), '');
  assert.notEqual(G.motifRefus({ geste: 'suivi', vise: 'Exporter', bouton: 'Exporter', texte: 'Exporter' }), '');
  assert.notEqual(G.motifRefus({ geste: 'suivi', vise: 'Actes signés', bouton: 'Actes signés', texte: 'Actes signés' }), '');
  assert.notEqual(G.motifRefus({ geste: 'suivi', vise: 'Actes à signer', bouton: 'Actes à signer Exporter', texte: 'Actes à signer' }), '');
  assert.throws(() => G.controlerClic({ geste: 'suivi', vise: 'Actes à signer', bouton: 'Actes à signer Supprimer', texte: 'x' }), /supprim/i);
  for (const voisin of ['Actes signés', 'Statistique', '']) assert.notEqual(G.motifRefus({ geste: 'suivi', vise: 'Actes à signer', bouton: voisin, texte: voisin }), '', voisin || 'bouton vide');
});

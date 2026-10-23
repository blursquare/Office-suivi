// Attestation de transmission de RIB (étude 23/10) : textes du modèle mot pour mot, identité reprise de la fiche, jamais devinée.
const test = require('node:test');
const assert = require('node:assert');
const A = require('../commun/attestation-rib.js');
const { chargerApplication } = require('./helpers/load-app.js');

test('les quatre engagements sont ceux du modèle de l’office, mot pour mot', () => {
  const doc = A.documentAttestationRib({ civilite: 'M', prenom: 'Paul', nom: 'DUPONT', domicile: '1 rue A, 41000 BLOIS' }, 'VTE - DUPONT');
  assert.deepStrictEqual(doc.engagements.map(e => e.verbe), ['Atteste', 'Certifie', 'Autorise', 'M’engage']);
  assert.match(doc.engagements[0].texte, /^avoir transmis à l’Office notarial de Maître Sophie GOSSART, notaire à Blois, mon relevé d’identité bancaire \(RIB\), déposé en pièce jointe lors de la présente procédure de signature électronique\.$/);
  assert.match(doc.engagements[1].texte, /^que le compte bancaire désigné sur ce RIB est ouvert à mon nom et que les informations qui y figurent sont exactes et à jour\.$/);
  assert.match(doc.engagements[2].texte, /^l’Office notarial à utiliser ces coordonnées bancaires pour tout virement relatif au dossier référencé ci-dessus\.$/);
  assert.match(doc.engagements[3].texte, /ne tiendra compte d’aucun changement de coordonnées bancaires qui ne serait pas confirmé directement par moi auprès de l’Office\.$/);
  assert.strictEqual(doc.cloture, 'Fait à la date de la signature électronique.');
});

test('l’identité vient de la fiche ; une donnée absente reste « [à compléter] », jamais devinée', () => {
  const plein = A.documentAttestationRib({ civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', domicile: '12 rue des Acacias, 41000 BLOIS' }, A.referenceAttestationRib('VTE - MARTIN / DUPONT', 'A 2026 00247'));
  assert.deepStrictEqual(plein.champs.map(c => c.valeur), ['Madame Léa MARTIN', '12 rue des Acacias, 41000 BLOIS', 'VTE - MARTIN / DUPONT (A 2026 00247)']);
  assert.strictEqual(A.manquesAttestationRib(plein), 0);
  const vide = A.documentAttestationRib({ nom: 'DUPONT' }, '');
  assert.deepStrictEqual(vide.champs.map(c => c.valeur), ['[à compléter] DUPONT', '[à compléter]', '[à compléter]']);
  assert.strictEqual(A.manquesAttestationRib(vide), 3);
});

test('le prénom n’est pas répété quand le nom de la partie le porte déjà', () => {
  assert.strictEqual(A.nomCompletAttestationRib({ civilite: 'M', prenom: 'Paul', nom: 'Paul DUPONT' }), 'Monsieur Paul DUPONT');
  assert.strictEqual(A.nomCompletAttestationRib({ civilite: 'Mlle', prenom: 'Zoé', nom: 'ARNAUD' }), 'Mademoiselle Zoé ARNAUD');
  assert.strictEqual(A.nomCompletAttestationRib({ civilite: 'M' }), '');
  assert.strictEqual(A.nomFichierAttestationRib({ prenom: 'Paul', nom: 'Paul DUPONT' }), 'Attestation RIB - Paul DUPONT.pdf');
  assert.strictEqual(A.nomFichierAttestationRib({ prenom: 'Léa', nom: 'MARTIN/ROY' }), 'Attestation RIB - MARTIN ROY Léa.pdf');
});

test('les personnes proposées : physiques seulement, vendeurs d’abord', () => {
  const l = A.personnesAttestationRib([{ role: 'ACQUEREUR', nom: 'B' }, { role: 'VENDEUR', nom: 'A' }, { role: 'VENDEUR', nom: 'SCI X', morale: true }, { role: 'PARTIE', nom: 'C' }, { role: 'VENDEUR', nom: '' }]);
  assert.deepStrictEqual(l.map(p => p.nom), ['A', 'B', 'C']);
});

test('la fiche d’un dossier : le lien « Attestation » est sous chaque personne physique, avec un identifiant protégé', () => {
  const app = chargerApplication();
  const html = app.boutonAttestationRib("a'b", 2);
  assert.match(html, /telechargerAttestationRib\('a\\'b', 2\)/);
  assert.match(html, /Attestation de transmission de RIB/);
});

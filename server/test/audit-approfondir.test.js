'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  construirePromptApprofondissement,
  normaliserConstatsIa,
  validerReponse,
  tronquer,
  MAX_CONSTATS_IA
} = require('../src/routes/auditActe');

// Outil 2 : le modèle n'intervient plus qu'en APPROFONDISSEMENT, après le rapport déterministe,
// et sur UNE seule requête. Ces tests verrouillent ce qu'il a le droit de renvoyer.

test('le prompt rappelle les constats déjà trouvés pour éviter les doublons', () => {
  const prompt = construirePromptApprofondissement({
    texte: 'Texte du compromis.',
    constatsDejaTrouves: ['ERP périmé', 'Extension sans autorisation']
  });
  assert.match(prompt, /ERP périmé/);
  assert.match(prompt, /Extension sans autorisation/);
  assert.match(prompt, /Ne répète JAMAIS un constat/);
  assert.match(prompt, /Texte du compromis\./);
});

test('le prompt dit explicitement « (aucun) » quand les règles n ont rien trouvé', () => {
  const prompt = construirePromptApprofondissement({ texte: 'x', constatsDejaTrouves: [] });
  assert.match(prompt, /- \(aucun\)/);
});

test('validerReponse exige un tableau de constats', () => {
  assert.equal(validerReponse({ constats: [] }), null);
  assert.ok(validerReponse({}));
  assert.ok(validerReponse(null));
  assert.ok(validerReponse({ constats: 'non' }));
});

test('normaliserConstatsIa marque la citation retrouvée dans le document', () => {
  const texte = "Le vendeur déclare que la toiture a été refaite sans déclaration préalable.";
  const constats = normaliserConstatsIa({
    constats: [{ titre: 'Toiture refaite', description: 'Sans autorisation', gravite: 'CRITIQUE', extrait: 'la toiture a été refaite sans déclaration préalable' }]
  }, texte);
  assert.equal(constats.length, 1);
  assert.equal(constats[0].extraitVerifie, true);
  assert.equal(constats[0].gravite, 'CRITIQUE');
  assert.equal(constats[0].source, 'ia');
});

test('normaliserConstatsIa signale une citation INTROUVABLE plutôt que de la présenter comme vérifiée', () => {
  const constats = normaliserConstatsIa({
    constats: [{ titre: 'Inventé', description: '...', gravite: 'CRITIQUE', extrait: "une phrase qui n'existe pas dans l'acte" }]
  }, 'Le bien est vendu en l’état.');
  assert.equal(constats[0].extraitVerifie, false);
});

test('normaliserConstatsIa force la gravité dans l énumération et ignore un constat sans titre', () => {
  const constats = normaliserConstatsIa({
    constats: [
      { titre: 'Un titre', gravite: 'CATASTROPHIQUE', extrait: 'x' },
      { titre: '', gravite: 'CRITIQUE', extrait: 'y' }
    ]
  }, 'texte');
  assert.equal(constats.length, 1);
  assert.equal(constats[0].gravite, 'A_VERIFIER');
});

test('normaliserConstatsIa plafonne le nombre de constats', () => {
  const bruts = Array.from({ length: 30 }, (_, i) => ({ titre: 'c' + i, gravite: 'INFORMATION', extrait: 'x' }));
  assert.equal(normaliserConstatsIa({ constats: bruts }, 'texte').length, MAX_CONSTATS_IA);
});

test('tronquer signale la coupe', () => {
  assert.deepEqual(tronquer('abc', 10), { texte: 'abc', tronque: false });
  const r = tronquer('abcdef', 3);
  assert.equal(r.texte, 'abc');
  assert.equal(r.tronque, true);
});

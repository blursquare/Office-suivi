'use strict';

// Outil 2 (Audit des actes) — comparaison déterministe compromis/promesse → projet de vente
// (script.js, section "OUTIL 2 (AUDIT DES ACTES)") : pas d'IA ici, un simple diff de valeurs déjà
// extraites (parties, prix, bien, cadastre, notaire instrumentaire, dates). Voir le cahier des
// charges d'Outil 2 (§13) et la note sur la préférence donnée au code déterministe plutôt qu'à une
// "certitude" de modèle non calibrée.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

function partie(nom, role) {
  return { nom, qualiteActe: role === 'VENDEUR' ? 'vendeur' : 'acquereur', role, qualitePersonne: 'physique', representant: null };
}

function projetBase(app, extra) {
  return Object.assign({
    parties: [partie('DUPONT', 'VENDEUR'), partie('MARTIN', 'ACQUEREUR')],
    notaires: { instrumentaire: { nom: 'GOSSART' } },
    bien: { adresse: { adresseComplete: '5 rue des Lilas, 41000 BLOIS' }, cadastre: { section: 'AB', numero: '24' } },
    dates: {
      BUTOIR_PRET: app.champExtraction('2026-11-01'),
      REITERATION_ACTE: app.champExtraction('2026-12-01'),
      BUTOIR_VENTE_PREALABLE: app.champExtraction(null)
    },
    champs: { prixVente: app.champExtraction(200000) }
  }, extra || {});
}

test('comparerCompromisEtProjet ne signale rien quand tout concorde', () => {
  const app = chargerApplication();
  const ref = projetBase(app);
  const projet = projetBase(app);
  assert.equal(app.comparerCompromisEtProjet(ref, projet).length, 0);
});

test('comparerCompromisEtProjet détecte une partie disparue', () => {
  const app = chargerApplication();
  const ref = projetBase(app);
  const projet = projetBase(app, { parties: [partie('DUPONT', 'VENDEUR')] });
  const constats = app.comparerCompromisEtProjet(ref, projet);
  assert.ok(constats.some(c => c.gravite === 'IMPORTANT' && /absente du projet/.test(c.titre) && /MARTIN/.test(c.titre)));
});

test('comparerCompromisEtProjet détecte une partie nouvelle', () => {
  const app = chargerApplication();
  const ref = projetBase(app, { parties: [partie('DUPONT', 'VENDEUR')] });
  const projet = projetBase(app, { parties: [partie('DUPONT', 'VENDEUR'), partie('MARTIN', 'ACQUEREUR')] });
  const constats = app.comparerCompromisEtProjet(ref, projet);
  assert.ok(constats.some(c => c.gravite === 'IMPORTANT' && /nouvelle dans le projet/.test(c.titre)));
});

test('comparerCompromisEtProjet détecte un rôle changé (critique)', () => {
  const app = chargerApplication();
  const ref = projetBase(app);
  const projet = projetBase(app, { parties: [partie('DUPONT', 'ACQUEREUR'), partie('MARTIN', 'ACQUEREUR')] });
  const constats = app.comparerCompromisEtProjet(ref, projet);
  assert.ok(constats.some(c => c.gravite === 'CRITIQUE' && /Rôle changé/.test(c.titre)));
});

test('comparerCompromisEtProjet détecte un prix différent (critique)', () => {
  const app = chargerApplication();
  const ref = projetBase(app);
  const projet = projetBase(app, { champs: { prixVente: app.champExtraction(250000) } });
  const constats = app.comparerCompromisEtProjet(ref, projet);
  assert.ok(constats.some(c => c.gravite === 'CRITIQUE' && /Prix de vente différent/.test(c.titre)));
});

test('comparerCompromisEtProjet détecte une désignation du bien différente (critique)', () => {
  const app = chargerApplication();
  const ref = projetBase(app);
  const projet = projetBase(app, { bien: { adresse: { adresseComplete: '7 rue de la Paix, 41000 BLOIS' }, cadastre: { section: 'AB', numero: '24' } } });
  const constats = app.comparerCompromisEtProjet(ref, projet);
  assert.ok(constats.some(c => c.gravite === 'CRITIQUE' && /Désignation du bien différente/.test(c.titre)));
});

test('comparerCompromisEtProjet détecte une référence cadastrale différente (critique)', () => {
  const app = chargerApplication();
  const ref = projetBase(app);
  const projet = projetBase(app, { bien: { adresse: ref.bien.adresse, cadastre: { section: 'AB', numero: '25' } } });
  const constats = app.comparerCompromisEtProjet(ref, projet);
  assert.ok(constats.some(c => c.gravite === 'CRITIQUE' && /Référence cadastrale différente/.test(c.titre)));
});

test('comparerCompromisEtProjet détecte un notaire instrumentaire différent (à vérifier)', () => {
  const app = chargerApplication();
  const ref = projetBase(app);
  const projet = projetBase(app, { notaires: { instrumentaire: { nom: 'DUPUIS' } } });
  const constats = app.comparerCompromisEtProjet(ref, projet);
  assert.ok(constats.some(c => c.gravite === 'A_VERIFIER' && /Notaire instrumentaire différent/.test(c.titre)));
});

test('comparerCompromisEtProjet détecte une date différente (à vérifier, pas critique)', () => {
  const app = chargerApplication();
  const ref = projetBase(app);
  const projet = projetBase(app, { dates: { BUTOIR_PRET: app.champExtraction('2026-11-01'), REITERATION_ACTE: app.champExtraction('2026-12-15'), BUTOIR_VENTE_PREALABLE: app.champExtraction(null) } });
  const constats = app.comparerCompromisEtProjet(ref, projet);
  assert.ok(constats.some(c => c.gravite === 'A_VERIFIER' && /Signature de l.acte/.test(c.titre)));
});

test('comparerCompromisEtProjet renvoie [] sans référence ou sans projet', () => {
  const app = chargerApplication();
  const projet = projetBase(app);
  assert.equal(app.comparerCompromisEtProjet(null, projet).length, 0);
  assert.equal(app.comparerCompromisEtProjet(projet, null).length, 0);
});

test('referenceDepuisDossier reconstruit la même forme à partir des champs plats d’un dossier', () => {
  const app = chargerApplication();
  const d = {
    parties: [partie('DUPONT', 'VENDEUR')],
    notaires: { instrumentaire: { nom: 'GOSSART' } },
    bien: { adresse: { adresseComplete: '5 rue des Lilas, 41000 BLOIS' }, cadastre: null },
    pret: '2026-11-01', acte: '2026-12-01', ventebien: '',
    prixVente: 200000
  };
  const ref = app.referenceDepuisDossier(d);
  assert.equal(ref.dates.BUTOIR_PRET.valeur, '2026-11-01');
  assert.equal(ref.dates.REITERATION_ACTE.valeur, '2026-12-01');
  assert.equal(ref.dates.BUTOIR_VENTE_PREALABLE.valeur, null);
  assert.equal(ref.champs.prixVente.valeur, 200000);
  assert.equal(ref.parties.length, 1);
});

test('referenceDepuisDossier renvoie null sans dossier', () => {
  const app = chargerApplication();
  assert.equal(app.referenceDepuisDossier(null), null);
});

test('pageDepuisIndexPages retrouve la page contenant un index, et replie sur la dernière page au-delà', () => {
  const app = chargerApplication();
  const pages = [{ numero: 1, debut: 0, fin: 100 }, { numero: 2, debut: 100, fin: 250 }, { numero: 3, debut: 250, fin: 300 }];
  assert.equal(app.pageDepuisIndexPages(pages, 50), 1);
  assert.equal(app.pageDepuisIndexPages(pages, 100), 2);
  assert.equal(app.pageDepuisIndexPages(pages, 299), 3);
  assert.equal(app.pageDepuisIndexPages(pages, 1000), 3);
});

test('pageDepuisIndexPages renvoie null sans pages ou sans index valide', () => {
  const app = chargerApplication();
  assert.equal(app.pageDepuisIndexPages([], 10), null);
  assert.equal(app.pageDepuisIndexPages(null, 10), null);
  assert.equal(app.pageDepuisIndexPages([{ numero: 1, debut: 0, fin: 10 }], -1), null);
});

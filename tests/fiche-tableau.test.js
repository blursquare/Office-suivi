'use strict';

// Fiche dossier : le tableau « À obtenir · À faire · En attente · Fait » et le bandeau du haut sont CALCULÉS (client/57).
// On les rejoue sur tous les types de dossier, avec des dossiers inventés : aucune erreur, aucune carte en double,
// chaque carte cochable appelle le geste d'avant, un dossier archivé n'offre plus aucun geste.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const AUJ = '2026-10-10';

function dossier(extra) {
  return Object.assign({
    id: 'd1', nom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', typeVente: 'maison', roleNotaire: 'instrumentaire',
    pret: '2026-11-20', ventebien: '', acte: '2026-12-15', rendezVousSignature: '2026-12-10',
    pieces: {}, echeancesValidees: {}, historique: [], dossierLie: true, nasDossier: 'X/DUPONT', offrePretStatut: 'manquante',
    autres: [], analyseJuridique: { engagements: [], documents: [] }
  }, extra || {});
}

const VARIANTES = {
  maison: dossier(),
  copropriete: dossier({ typeVente: 'copropriete' }),
  terrain: dossier({ typeVente: 'terrain' }),
  terre: dossier({ typeVente: 'terre' }),
  sansPret: dossier({ sansPret: true, pret: '' }),
  ventePrealable: dossier({ ventebien: '2026-11-01' }),
  sansDate: dossier({ pret: '', acte: '', rendezVousSignature: '' }),
  signature: dossier({ rendezVousSignature: '2026-09-20', echeancesValidees: { rendezVousSignature: true } }),
  passee: dossier({ rendezVousSignature: '2026-10-01' }),
  participation: dossier({ roleNotaire: 'participant' }),
  succession: dossier({ typeAffaire: 'succession', sansPret: true, pret: '', parties: [{ nom: 'Jean DURAND' }] }),
  archive: dossier({ archive: true }),
  engagements: dossier({ analyseJuridique: { engagements: [{ texte: 'Fournir le diagnostic électrique', fait: false }], documents: [{ label: 'Diagnostic amiante' }] } }),
  autres: dossier({ autres: [{ label: 'Diagnostic amiante', date: '2026-10-12' }, { label: 'Tâche faite', date: '2026-10-01' }], echeancesValidees: { 'autre-1': true } }),
  pretFait: dossier({ echeancesValidees: { pret: true }, offrePretStatut: 'recue' })
};

test('tableau : tous les types de dossier sont calculés sans erreur, quatre colonnes, cartes sans doublon', () => {
  Object.entries(VARIANTES).forEach(([nom, d]) => {
    const cartes = app.cartesTableauFiche(d, AUJ, []);
    assert.deepEqual(Object.keys(cartes), ['obtenir', 'faire', 'attente', 'fait'], nom);
    const cles = Object.values(cartes).flat().map(c => c.cle);
    assert.equal(new Set(cles).size, cles.length, `${nom} : carte en double (${cles.join(', ')})`);
    Object.values(cartes).flat().forEach(c => {
      assert.ok(c.titre, `${nom} : carte sans titre (${c.cle})`);
      if (c.coche) assert.match(c.coche.onclick, /^(validerPieceManuellement|basculerEngagementFait|basculerDocumentAnalyseRecu|basculerEcheance|marquerFaitJour)\(/, `${nom} : geste inattendu`);
    });
    const b = app.bandeauFiche(d, AUJ, [], null);
    assert.ok(b.pieces && b.signature && b.maintenant, nom);
  });
});

test('tableau : pièces manquantes à obtenir, reçues groupées dans Fait, total conservé', () => {
  const d = dossier();
  const liste = app.checklistPieces(d.typeVente, d);
  d.pieces[liste[0].cle] = 'recue';
  d.pieces[liste[1].cle] = 'recue';
  const c = app.cartesTableauFiche(d, AUJ, []);
  assert.equal(c.obtenir.concat(c.attente).filter(x => x.cle.startsWith('piece:')).length, liste.length - 2);
  const groupe = c.fait.find(x => x.cle === 'pieces-recues');
  assert.ok(groupe && /2 pièces reçues/.test(groupe.titre) && groupe.sous === `sur ${liste.length}`);
  assert.equal(app.bandeauFiche(d, AUJ, [], null).pieces.recues, 2);
});

test('tableau : participation sans checklist, succession réduite à la signature', () => {
  const p = app.cartesTableauFiche(VARIANTES.participation, AUJ, []);
  assert.equal(p.obtenir.filter(x => x.cle.startsWith('piece:')).length, 0);
  const s = app.cartesTableauFiche(VARIANTES.succession, AUJ, []);
  assert.equal(s.fait.filter(x => x.cle === 'etape:redaction').length, 0);
  assert.equal(s.attente.filter(x => x.cle === 'echeance:pret').length, 0);
});

test('tableau : engagement et document de l’avant-contrat à obtenir, geste d’avant à la case', () => {
  const c = app.cartesTableauFiche(VARIANTES.engagements, AUJ, []);
  const e = c.obtenir.find(x => x.cle === 'engagement:0');
  assert.ok(e && e.coche.onclick === "basculerEngagementFait('d1', 0)");
  assert.ok(c.obtenir.some(x => x.cle === 'document:0' && /basculerDocumentAnalyseRecu\('d1', 0\)/.test(x.coche.onclick)));
});

test('tableau : échéances ouvertes en attente ou à faire, cochées dans Fait, dates passées en retard', () => {
  const c = app.cartesTableauFiche(VARIANTES.maison, AUJ, []);
  const pret = c.attente.find(x => x.cle === 'echeance:pret');
  assert.ok(pret && pret.coche && pret.jours === 41);
  const a = app.cartesTableauFiche(VARIANTES.autres, AUJ, []);
  assert.ok(a.faire.some(x => x.cle === 'echeance:autre-0'));
  const faite = a.fait.find(x => x.cle === 'echeance:autre-1');
  assert.ok(faite && /Rouvrir/.test(faite.coche.libelle));
  const retard = app.cartesTableauFiche(dossier({ pret: '2026-10-01' }), AUJ, []).attente.find(x => x.cle === 'echeance:pret');
  assert.equal(retard.gravite, 'critique');
});

test('tableau : gestes du jour en tête de « À faire », sans doublon avec l’échéance qu’ils couvrent', () => {
  const actions = [{ cle: 'appelFonds:d1', titre: 'Envoyer l’appel de fonds', contexte: 'DUPONT', categorie: 'appelFonds', gravite: 'vigilance', geste: { type: 'email' }, bouton: 'Préparer' }];
  const c = app.cartesTableauFiche(VARIANTES.maison, AUJ, actions);
  assert.equal(c.faire[0].cle, 'action:appelFonds:d1');
  assert.ok(c.faire[0].bouton && /^executerActionJour\(/.test(c.faire[0].bouton.onclick));
  assert.equal(app.bandeauFiche(VARIANTES.maison, AUJ, actions, null).maintenant.type, 'action');
});

test('tableau : dossier archivé = aucun geste ni case', () => {
  const actions = [{ cle: 'x:d1', titre: 'Un geste', contexte: '', geste: { type: 'email' } }];
  const c = app.cartesTableauFiche(VARIANTES.archive, AUJ, actions);
  Object.values(c).flat().forEach(x => { assert.equal(x.coche, null); assert.equal(x.bouton, null); });
  assert.equal(app.bandeauFiche(VARIANTES.archive, AUJ, actions, null).maintenant.type, 'archive');
});

test('bandeau : signature placée, passée, à placer, signée', () => {
  assert.equal(app.bandeauFiche(VARIANTES.maison, AUJ, [], null).signature.etat, 'placee');
  assert.equal(app.bandeauFiche(VARIANTES.maison, AUJ, [], null).signature.jours, 61);
  assert.equal(app.bandeauFiche(VARIANTES.passee, AUJ, [], null).signature.etat, 'passee');
  assert.equal(app.bandeauFiche(VARIANTES.sansDate, AUJ, [], null).signature.etat, 'aplacer');
  assert.equal(app.bandeauFiche(VARIANTES.signature, AUJ, [], null).signature.etat, 'signe');
  assert.equal(app.bandeauFiche(VARIANTES.participation, AUJ, [], null).pieces.libelle, 'Avancement');
});

test('rendu : bandeau, étapes et tableau se dessinent pour chaque type, rien de non échappé', () => {
  Object.entries(VARIANTES).forEach(([nom, d]) => {
    const dangereux = Object.assign({}, d, { nom: '<img src=x onerror=alert(1)>' });
    const html = app.renderTableauFiche(dangereux, []) + app.renderSuiviEtapesFiche(app.etapesAvancement(dangereux, AUJ), null, app.avancementDossier(dangereux, AUJ));
    assert.ok(html.includes('tf-tableau'), nom);
    assert.ok(!/<img src=x/.test(html), nom);
  });
});

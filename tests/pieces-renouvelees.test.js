'use strict';

// Pièce annuelle renouvelée (ramonage, entretien de chaudière, taxe foncière 2025 → 2026) : c'est
// le fichier le plus récent qui compte (choisirFichierPiece), et un dossier devenu complet est
// annoncé une seule fois au responsable (doitNotifierDossierComplet).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('anneeDansNomFichier : la plus récente, dans le seul nom du fichier', () => {
  assert.equal(app.anneeDansNomFichier('TF 2026.pdf'), 2026);
  assert.equal(app.anneeDansNomFichier('Ramonage_2024-11_et_2025.pdf'), 2025);
  assert.equal(app.anneeDansNomFichier('DUPONT/Archives 2019/Ramonage.pdf'), null);
  assert.equal(app.anneeDansNomFichier('Titre.pdf'), null);
  // Un numéro à quatre chiffres qui n'est pas une année plausible n'en est pas une.
  assert.equal(app.anneeDansNomFichier('Parcelle 3712.pdf'), null);
  assert.equal(app.anneeDansNomFichier('Plan 20260.pdf'), null);
});

test('choisirFichierPiece : l\'année la plus récente l\'emporte', () => {
  const c = app.choisirFichierPiece([
    { chemin: 'D/Taxe fonciere 2025.pdf', nom: 'Taxe fonciere 2025.pdf' },
    { chemin: 'D/Taxe fonciere 2026.pdf', nom: 'Taxe fonciere 2026.pdf' }
  ], 'D/Taxe fonciere 2025.pdf');
  assert.equal(c.chemin, 'D/Taxe fonciere 2026.pdf');
  assert.equal(c.annee, 2026);
});

test('choisirFichierPiece : le fichier déjà retenu reste retenu sans candidat plus récent', () => {
  const candidats = [
    { chemin: 'D/Titre.pdf', nom: 'Titre.pdf' },
    { chemin: 'D/Titre vendeur.pdf', nom: 'Titre vendeur.pdf' }
  ];
  assert.equal(app.choisirFichierPiece(candidats, 'D/Titre vendeur.pdf').chemin, 'D/Titre vendeur.pdf');
  // Aucun fichier déjà retenu : le premier rencontré, comme avant.
  assert.equal(app.choisirFichierPiece(candidats, null).chemin, 'D/Titre.pdf');
  // Même année que le fichier retenu : on n'en change pas.
  const memeAnnee = [
    { chemin: 'D/Ramonage 2026.pdf', nom: 'Ramonage 2026.pdf' },
    { chemin: 'D/Ramonage 2026 (copie).pdf', nom: 'Ramonage 2026 (copie).pdf' }
  ];
  assert.equal(app.choisirFichierPiece(memeAnnee, 'D/Ramonage 2026 (copie).pdf').chemin, 'D/Ramonage 2026 (copie).pdf');
  assert.equal(app.choisirFichierPiece([], null).chemin, null);
});

test('choisirFichierPiece : un fichier daté l\'emporte sur un fichier retenu sans année', () => {
  const c = app.choisirFichierPiece([
    { chemin: 'D/Entretien chaudiere.pdf', nom: 'Entretien chaudiere.pdf' },
    { chemin: 'D/Entretien chaudiere 2026.pdf', nom: 'Entretien chaudiere 2026.pdf' }
  ], 'D/Entretien chaudiere.pdf');
  assert.equal(c.chemin, 'D/Entretien chaudiere 2026.pdf');
});

function dossierComplet(extra) {
  const pieces = {};
  for (const p of app.checklistPieces('maison')) pieces[p.cle] = 'recue';
  return Object.assign({ typeVente: 'maison', offrePretStatut: 'recue', pieces }, extra || {});
}

test('doitNotifierDossierComplet : une seule fois, jamais pour un dossier incomplet, archivé ou en participation', () => {
  assert.equal(app.doitNotifierDossierComplet(dossierComplet()), true);
  assert.equal(app.doitNotifierDossierComplet(dossierComplet({ completNotifieLe: '2026-09-24T10:00:00Z' })), false);
  assert.equal(app.doitNotifierDossierComplet(dossierComplet({ offrePretStatut: 'manquante' })), false);
  assert.equal(app.doitNotifierDossierComplet(dossierComplet({ archive: true })), false);
  assert.equal(app.doitNotifierDossierComplet(dossierComplet({ roleNotaire: 'participant' })), false);
  const incomplet = dossierComplet();
  incomplet.pieces.erp = 'manquante';
  assert.equal(app.doitNotifierDossierComplet(incomplet), false);
  // Achat comptant : pas d'offre à attendre.
  assert.equal(app.doitNotifierDossierComplet(dossierComplet({ sansPret: true, offrePretStatut: 'inconnu' })), true);
  // Étude 30/10 : plus jamais une fois la rédaction lancée ou l'acte signé.
  assert.equal(app.doitNotifierDossierComplet(dossierComplet({ authentic: { acte: { etat: 'redaction' } } })), false);
  assert.equal(app.doitNotifierDossierComplet(dossierComplet({ authentic: { acte: { etat: 'signe', date: '2026-10-29' } } })), false);
  assert.equal(app.doitNotifierDossierComplet(dossierComplet({ echeancesValidees: { redaction: true } })), false);
  assert.equal(app.doitNotifierDossierComplet(dossierComplet({ rendezVousSignature: '2020-01-10' })), false);
  assert.equal(app.doitNotifierDossierComplet(dossierComplet({ authentic: { acte: { etat: 'a_rediger' } } })), true);
});

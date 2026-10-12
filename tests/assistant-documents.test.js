'use strict';

// « Demander à CLAIRE » : derniers documents reçus (étude 12/10, client/62-assistant-documents.js) — pièces reconnues, scans du
// copieur à ranger et rangés, fichiers récents du dossier du NAS ; filtrés par dossier quand il est nommé.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const A = require('../commun/assistant.js');

const app = chargerApplication();
const MAINTENANT = Date.parse('2026-10-12T10:00:00Z');
const jour = (n) => new Date(MAINTENANT - n * 86400000).toISOString();

const d1 = { id: 'd1', nom: 'MOREL / ROCHE', typeVente: 'maison', nasDossier: 'VTE MOREL', pieces: { erp: 'recue', taxeFonciere: 'recue' },
  piecesTrouveesLe: { erp: jour(1), taxeFonciere: jour(20) }, fichiersTrouves: { 'piece::erp': 'VTE MOREL/4 - Diagnostics/ERP.pdf' } };
const d2 = { id: 'd2', nom: 'BRUN / LEGRAND', typeVente: 'maison', pieces: { erp: 'recue' }, piecesTrouveesLe: { erp: jour(2) } };
const etat = { charge: true, reglages: { actif: true }, scans: [{ nom: 'SCAN_0931.pdf', date: jour(0.1) }, { nom: 'SCAN_0812.pdf', date: jour(0.2) }],
  journal: [{ date: jour(3), nom: 'SCAN_0700.pdf', chemin: 'VTE MOREL\\2 - Vendeur\\État daté - Claire Scan.pdf', dossierId: 'd1', type: 'etatDate', rubrique: '2 - Vendeur' },
    { date: jour(30), nom: 'vieux.pdf', chemin: 'x.pdf', dossierId: 'd2', type: 'etatDate' }] };
const lectures = { ['SCAN_0931.pdf|' + etat.scans[0].date]: { proposition: { type: 'etatDate', dossierId: 'd1' } } };

test('sans dossier : pièces du périmètre (14 jours), tous les scans à ranger, scans rangés récents', () => {
  const r = app.documentsRecentsAssistant({ tous: [d1, d2], perimetre: [d1, d2], dossier: null, etat, lectures, maintenant: MAINTENANT, chemins: (d, cle) => (d.fichiersTrouves || {})['piece::' + cle] || '' });
  assert.equal(r.pieces.map(x => x.dossier.id).join(','), 'd1,d2', 'la plus récente d’abord, la pièce de 20 jours écartée');
  assert.equal(r.pieces[0].chemin, 'VTE MOREL/4 - Diagnostics/ERP.pdf');
  assert.equal(r.aRanger.length, 2);
  assert.equal(r.aRanger[0].dossier.id, 'd1', 'le dossier proposé par la lecture du scan');
  assert.equal(r.aRanger[1].libelle, 'Scan à identifier');
  assert.equal(r.ranges.length, 1, 'le scan rangé il y a 30 jours est écarté');
  assert.equal(r.ranges[0].chemin, 'VTE MOREL/2 - Vendeur/État daté - Claire Scan.pdf');
  assert.equal(r.fichiers, null);
});

test('avec un dossier : ses pièces, ses scans, et les fichiers récents de son dossier du NAS', () => {
  const r = app.documentsRecentsAssistant({ tous: [d1, d2], perimetre: [d1, d2], dossier: d1, etat, lectures, maintenant: MAINTENANT,
    fichiersNas: [{ nom: 'Courrier banque.pdf', chemin: '0 - Comptabilité/Courrier banque.pdf', modifieLe: jour(0.5) }] });
  assert.equal(r.pieces.length, 1);
  assert.equal(r.aRanger.length, 1, 'seul le scan proposé pour ce dossier');
  assert.equal(r.ranges.length, 1);
  assert.equal(r.fichiers[0].chemin, 'VTE MOREL/0 - Comptabilité/Courrier banque.pdf');
  assert.equal(r.fichiers[0].libelle, 'Courrier banque');
  assert.equal(app.sousDossierFichierAssistant(d1, r.fichiers[0].chemin), 'Comptabilité');
  assert.equal(app.sousDossierFichierAssistant(d1, 'VTE MOREL/Compromis.pdf'), 'racine');
});

test('les phrases sont comprises sans IA, dossier facultatif', () => {
  for (const t of ['Quels sont les derniers scans reçus ?', 'Les dernières pièces de MOREL', 'Quelles pièces sont arrivées pour MOREL ?', 'Ouvre le dernier scan', 'Qu’est-ce qu’on a reçu ?'])
    assert.equal(A.interpreterParMotsCles(t, { aujourdhui: '2026-10-12' }).intention, 'derniers_documents', t);
  assert.equal(A.interpreterParMotsCles('Quelles pièces manquent pour MOREL ?', { aujourdhui: '2026-10-12' }).intention, 'pieces_manquantes');
  assert.equal(A.intentionAssistant('derniers_documents').dossier, undefined);
  assert.equal(A.intentionAssistant('derniers_documents').dossierFacultatif, true);
});

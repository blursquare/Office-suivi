'use strict';

// Fiche de veille de signature (étude 24/10, client/109-veille-signature.js) : quand elle est proposée (48 h avant, une fois par rendez-vous,
// au responsable), ce qu'elle dit de chaque condition (coche, date relevée, sans objet) et son nom de fichier.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const T = (iso) => new Date(iso);

// Une vente dont tout est fait, sauf ce que chaque test retire.
function vente(extra) {
  const d = Object.assign({
    id: 'v1', nom: 'MARTIN / DURAND', responsable: 'Julie VASSELIN', typeVente: 'maison',
    rendezVousSignature: '2026-10-29', rendezVousSignatureHeure: '14:30',
    offrePretStatut: 'recue', historique: [{ date: '2026-10-05T09:00:00', texte: 'Offre de prêt reçue' }],
    pieces: { renonciationPreemption: 'recue' }, piecesTrouveesLe: { renonciationPreemption: '2026-10-02T08:00:00' },
    appelFonds: '2026-10-19', projetEnvoye: '2026-10-22', ribDemandeLe: '2026-10-26',
    receptionFondsConfirmeeLe: '2026-10-27', fondsValidesLe: '2026-10-26'
  }, extra || {});
  // Toutes les pièces de la checklist reçues, sauf si le test pose les siennes.
  if (!extra || !extra.pieces) app.checklistPieces(d.typeVente, d).forEach(p => { d.pieces[p.cle] = 'recue'; });
  return d;
}

test('proposée dans les 48 h avant le rendez-vous, jamais avant, jamais après', () => {
  const d = vente();
  assert.equal(app.veilleSignatureDue(d, T('2026-10-27T14:29:00')), false);
  assert.equal(app.veilleSignatureDue(d, T('2026-10-27T14:30:00')), true);
  assert.equal(app.veilleSignatureDue(d, T('2026-10-29T09:00:00')), true);
  assert.equal(app.veilleSignatureDue(d, T('2026-10-29T14:31:00')), false);
});

test('les 48 h tombent un week-end : proposée dès le vendredi 17 h (rendez-vous du lundi ou du mardi)', () => {
  const lundi = vente({ rendezVousSignature: '2026-10-26', rendezVousSignatureHeure: '09:30' });
  assert.equal(app.veilleSignatureDue(lundi, T('2026-10-23T16:59:00')), false);
  assert.equal(app.veilleSignatureDue(lundi, T('2026-10-23T17:00:00')), true);
  assert.equal(app.veilleSignatureDue(lundi, T('2026-10-26T09:29:00')), true);
  const mardi = vente({ rendezVousSignature: '2026-10-27', rendezVousSignatureHeure: '10:00' });
  assert.equal(app.veilleSignatureDue(mardi, T('2026-10-23T16:59:00')), false);
  assert.equal(app.veilleSignatureDue(mardi, T('2026-10-23T17:00:00')), true);
  // Un rendez-vous du mercredi : 48 h avant = lundi, pas de week-end, pas d'avance.
  const mercredi = vente({ rendezVousSignature: '2026-10-28', rendezVousSignatureHeure: '10:00' });
  assert.equal(app.veilleSignatureDue(mercredi, T('2026-10-23T17:00:00')), false);
  assert.equal(app.veilleSignatureDue(mercredi, T('2026-10-26T10:00:00')), true);
  // Un rendez-vous du samedi : 48 h avant = jeudi.
  const samedi = vente({ rendezVousSignature: '2026-10-31', rendezVousSignatureHeure: '10:00' });
  assert.equal(app.veilleSignatureDue(samedi, T('2026-10-29T09:59:00')), false);
  assert.equal(app.veilleSignatureDue(samedi, T('2026-10-29T10:00:00')), true);
});

test('sans heure, le rendez-vous vaut toute la journée', () => {
  const d = vente({ rendezVousSignatureHeure: '' });
  assert.equal(app.veilleSignatureDue(d, T('2026-10-27T00:00:00')), true);
  assert.equal(app.veilleSignatureDue(d, T('2026-10-29T23:00:00')), true);
  assert.equal(app.veilleSignatureDue(d, T('2026-10-30T00:00:01')), false);
});

test('jamais pour un dossier archivé, signé, sans date ou une succession', () => {
  const ouvert = T('2026-10-28T10:00:00');
  assert.equal(app.veilleSignatureDue(vente({ archive: true }), ouvert), false);
  assert.equal(app.veilleSignatureDue(vente({ authentic: { acte: { etat: 'signe', date: '2026-10-28' } } }), ouvert), false);
  assert.equal(app.veilleSignatureDue(vente({ rendezVousSignature: '' }), ouvert), false);
  assert.equal(app.veilleSignatureDue(vente({ typeAffaire: 'succession' }), ouvert), false);
});

test('proposée au responsable seulement, une fois par rendez-vous, le plus proche d’abord', () => {
  const a = vente({ id: 'a', rendezVousSignature: '2026-10-29' });
  const b = vente({ id: 'b', rendezVousSignature: '2026-10-28', rendezVousSignatureHeure: '10:00' });
  const autre = vente({ id: 'c', responsable: 'Jérémy SAUJOT' });
  const maintenant = T('2026-10-27T18:00:00');
  assert.deepEqual(app.dossiersVeilleSignature([a, b, autre], 'Julie VASSELIN', maintenant, []).map(d => d.id).join(','), 'b,a');
  assert.equal(app.dossiersVeilleSignature([a, b, autre], '', maintenant, []).length, 0);
  const vues = [app.cleVeilleSignature(b)];
  assert.equal(app.dossiersVeilleSignature([a, b, autre], 'Julie VASSELIN', maintenant, vues).map(d => d.id).join(','), 'a');
  // Un rendez-vous déplacé revient.
  b.rendezVousSignatureHeure = '11:00';
  assert.equal(app.dossiersVeilleSignature([a, b], 'Julie VASSELIN', maintenant, vues).length, 2);
});

test('tout est fait : coches et dates relevées', () => {
  const f = app.ficheVeilleSignature(vente(), {});
  const par = Object.fromEntries(f.lignes.map(l => [l.cle, l]));
  assert.equal(f.reste, 0);
  assert.equal(par.pret.etat, 'fait');
  assert.equal(par.pret.date, '2026-10-05');
  assert.equal(par.preemption.etat, 'fait');
  assert.equal(par.preemption.date, '2026-10-02');
  assert.equal(par.appelFonds.date, '2026-10-19');
  assert.equal(par.projetEnvoye.date, '2026-10-22');
  assert.equal(par.fonds.etat, 'fait');
  assert.equal(par.fonds.date, '2026-10-26');
  assert.equal(par.confirmationFonds.date, '2026-10-27');
  assert.equal(par.rib.date, '2026-10-26');
  assert.equal(f.jour.replace(/ /g, ' '), 'jeudi 29 octobre 2026');
  assert.equal(f.heureTexte, '14 h 30');
  assert.equal(f.lieu, 'En l\'étude');
});

test('ce qui manque reste à cocher, avec sa date limite en note — jamais une date inventée', () => {
  const d = vente({ offrePretStatut: '', pret: '2026-10-31', appelFonds: '', projetEnvoye: '', fondsValidesLe: '', ribDemandeLe: '', receptionFondsConfirmeeLe: '' });
  const f = app.ficheVeilleSignature(d, {});
  const par = Object.fromEntries(f.lignes.map(l => [l.cle, l]));
  assert.equal(par.pret.etat, 'attente');
  assert.equal(par.pret.date, '');
  assert.match(par.pret.note, /31\/10\/2026/);
  assert.equal(par.appelFonds.etat, 'attente');
  assert.match(par.appelFonds.note, /19\/10\/2026/);
  assert.equal(par.projetEnvoye.date, '');
  assert.equal(par.fonds.etat, 'attente');
  assert.equal(f.faites + f.reste, f.total);
  assert.ok(f.reste >= 6);
});

test('une condition qui ne s’applique pas est « sans objet », jamais cochée', () => {
  const d = vente({ sansPret: true, offrePretStatut: '', pieces: {}, piecesTrouveesLe: {}, roleNotaire: 'participant', notaireAcquereur: 'Maître Autre', coteInstrumentaire: 'vendeur' });
  const f = app.ficheVeilleSignature(d, {});
  const par = Object.fromEntries(f.lignes.map(l => [l.cle, l]));
  assert.equal(par.pret.etat, 'sans-objet');
  assert.equal(par.preemption.etat, 'sans-objet');
  assert.equal(par.pieces, undefined);
  assert.equal(f.total, f.lignes.filter(l => l.etat !== 'sans-objet').length);
});

test('le nom du fichier n’a aucun caractère refusé par Windows', () => {
  const nom = app.nomFichierVeilleSignature(vente({ nom: 'A/B: "C"' }));
  assert.match(nom, /^Fiche de signature - .+ - 2026-10-29\.pdf$/);
  assert.doesNotMatch(nom, /[\\/:*?"<>|]/);
});

test('le délai du pop-up dit aujourd’hui, demain, puis la date (la relecture du 24/10 : joursEntre compte les bornes)', () => {
  const d = vente();
  assert.equal(app.delaiVeilleSignature(d, T('2026-10-29T08:00:00')), 'aujourd’hui à 14 h 30');
  assert.equal(app.delaiVeilleSignature(d, T('2026-10-28T18:00:00')), 'demain à 14 h 30');
  assert.match(app.delaiVeilleSignature(d, T('2026-10-27T15:00:00')), /^jeudi 29 octobre 2026 à 14 h 30$/);
});

test('« Réponse SAFER » n’est pas comptée deux fois : elle a sa propre ligne', () => {
  const d = vente({ authentic: { safer: { decision: 'non_preemption', decisionLe: '2026-10-10' } }, piecesPersonnalisees: [{ cle: 'perso-safer', label: 'Réponse SAFER' }] });
  const f = app.ficheVeilleSignature(d, {});
  const par = Object.fromEntries(f.lignes.map(l => [l.cle, l]));
  assert.equal(par.safer.etat, 'fait');
  assert.equal(par.safer.date, '2026-10-10');
  assert.equal(par.pieces.etat, 'fait', par.pieces.note);
});

test('le PDF reprend le modèle de la fiche imprimée : tuiles, pièces, engagements et les neuf étapes de la procédure', () => {
  const d = vente({ analyseJuridique: { documents: ['Titre de propriété', { label: 'Plan' }], engagements: [{ phrase: 'x'.repeat(200) }] } });
  const f = app.ficheVeilleSignature(d, {});
  assert.deepEqual(f.cases.map(c => c.cls).sort().join(','), 'appelFonds,projetEnvoye,rendezVous');
  assert.equal(f.docs.join('|'), 'Titre de propriété|Plan');
  assert.equal(f.engagements[0].length, 141);
  assert.equal(f.etapes.length, 9);
  assert.equal(f.etapes[0].num, 1);
  assert.equal(f.etapes[0].lead, f.etapes[0].lead.toUpperCase());
  // Appel de fonds envoyé : étape 1 cochée avec sa date ; projet envoyé : étape 7 ; l'étape 5 (séquestre) n'est jamais cochée seule.
  assert.equal(f.etapes[0].fait, true);
  assert.equal(f.etapes[0].date, '2026-10-19');
  assert.equal(f.etapes[6].fait, true);
  assert.equal(f.etapes[6].date, '2026-10-22');
  assert.equal(f.etapes[4].fait, false);
});

test('les segments de texte sont coupés en lignes de la largeur demandée, sans perdre un mot', () => {
  const mesurer = (t, cle) => t.length * (cle === 'gras' ? 6 : 5);
  const lignes = app.lignesRunsVeille([{ t: 'ENVOYER LE PROJET', cle: 'gras' }, { t: ' au plus tard 7 jours avant le rendez-vous', cle: 'sans' }], 150, mesurer);
  assert.ok(lignes.length >= 2);
  lignes.forEach(l => assert.ok(l.reduce((s, x) => s + x.l, 0) <= 150));
  assert.equal(lignes.map(l => l.map(x => x.t).join('')).join(' '), 'ENVOYER LE PROJET au plus tard 7 jours avant le rendez-vous');
});

test('les saisies du pop-up complètent la fiche : étape cochée avec sa date, date d’une étape faite sans date, notes', () => {
  const f = app.ficheVeilleSignature(vente({ appelFonds: '', projetEnvoye: '', echeancesValidees: {} }), {});
  assert.equal(f.etapes[6].fait, false);
  const m = app.ficheAvecSaisiesVeille(f, { 7: { fait: true, date: '2026-10-27' }, 2: { fait: false, date: '2026-10-01' } }, '  Apporter le plan  ');
  assert.equal(m.etapes[6].fait, true);
  assert.equal(m.etapes[6].date, '2026-10-27');
  // Une étape non cochée dans le pop-up reste telle quelle, même avec une date.
  assert.equal(m.etapes[1].fait, f.etapes[1].fait);
  assert.equal(m.notes, 'Apporter le plan');
  // La date de CLAIRE reste prioritaire sur celle du pop-up ; la fiche d'origine n'est pas modifiée.
  const f2 = app.ficheVeilleSignature(vente(), {});
  assert.equal(app.ficheAvecSaisiesVeille(f2, { 1: { fait: true, date: '2026-01-01' } }, '').etapes[0].date, '2026-10-19');
  assert.equal(f.etapes[6].fait, false);
  assert.equal(app.ficheAvecSaisiesVeille(f, null, null).notes, '');
});

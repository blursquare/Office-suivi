'use strict';

// Emails des dossiers, côté poste (étude, 02/10) : pièce jointe reconnue par son nom, rubriques du NAS,
// état d'un email préparé. Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();

test('pieceDePieceJointe : nom de fichier → pièce de la checklist, offre de prêt à part, exclusions respectées', () => {
  const checklist = app.checklistPieces('maison');
  const etatDate = app.pieceDePieceJointe('Etat date - copro MARTEL.pdf', app.checklistPieces('copropriete'));
  assert.equal(etatDate && etatDate.cle, 'etatDate');
  const offre = app.pieceDePieceJointe('Offre de prêt Crédit Exemple.pdf', checklist);
  assert.equal(offre.offre, true);
  assert.equal(app.pieceDePieceJointe('photo.jpg', checklist), null);
  const cu = app.pieceDePieceJointe('Certificat d’urbanisme.pdf', checklist);
  assert.equal(cu && cu.cle, 'certificatUrbanisme');
  assert.equal(app.pieceDePieceJointe('Certificat d’urbanisme.pdf', checklist, (cle) => cle === 'certificatUrbanisme'), null);
});

test('rubriquesPourPiece : mêmes rubriques que Claire Scan, racine à défaut', () => {
  assert.equal(app.rubriquesPourPiece('etatDate').join(','), 'etatDate,copro');
  assert.equal(app.rubriquesPourPiece('inconnue').length, 0);
});

test('etatEmailPrepare : envoyé, en attente, ou envois du collaborateur non lus', () => {
  assert.match(app.etatEmailPrepare({ envoyeLe: '2026-10-01T09:00:00Z', collaborateur: 'Julie VASSELIN' }, {}).texte, /^Envoyé le /);
  assert.equal(app.etatEmailPrepare({ collaborateur: 'Julie VASSELIN' }, { 'julie@office.fr': { collaborateur: 'Julie VASSELIN', statut: 'ok' } }).texte, 'Pas encore retrouvé dans les envois');
  assert.equal(app.etatEmailPrepare({ collaborateur: 'Jérémy SAUJOT' }, { 'jeremy@office.fr': { collaborateur: 'Jérémy SAUJOT', statut: 'refuse' } }).texte, 'Envois de Jérémy non lus');
});

// Étude 02/10 : « classe les documents dans les bons sous-dossiers, sinon à la racine du dossier ».
test('rubriquesPieceJointe : pièce de la checklist, puis nom de fichier, puis racine', () => {
  const d = { emailVendeur: 'paul.martel@exemple.fr; claire.martel@exemple.fr', emailAcquereur: 'l.faure@exemple.fr' };
  // Pièce de la checklist : ses rubriques (Claire Scan, ou table des pièces hors Claire Scan).
  assert.equal(app.rubriquesPieceJointe(d, 'Etat date.pdf', { cle: 'etatDate' }, '').join(','), 'etatDate,copro');
  assert.equal(app.rubriquesPieceJointe(d, 'Facture travaux.pdf', { cle: 'facturesTravaux' }, '').join(','), 'travaux,aae');
  // Nom seul.
  assert.equal(app.rubriquesPieceJointe(d, 'DPE_maison-2024.pdf', null, '').join(','), 'diagnostics,aae');
  assert.equal(app.rubriquesPieceJointe(d, 'PV AG 2025.pdf', null, '').join(','), 'copro');
  assert.equal(app.rubriquesPieceJointe(d, 'Devis toiture.pdf', null, '').join(','), 'travaux,aae');
  assert.equal(app.rubriquesPieceJointe(d, 'Titre de propriété.pdf', null, '').join(','), 'titre');
  // Pièce d'une personne : le côté de l'expéditeur, sinon racine.
  assert.equal(app.rubriquesPieceJointe(d, 'CNI recto verso.jpg', null, 'Claire.Martel@exemple.fr').join(','), 'vendeur');
  assert.equal(app.rubriquesPieceJointe(d, 'RIB.pdf', null, 'l.faure@exemple.fr').join(','), 'acquereur');
  assert.equal(app.rubriquesPieceJointe(d, 'RIB.pdf', null, 'inconnu@exemple.fr').length, 0);
  // Rien de reconnu : racine.
  assert.equal(app.rubriquesPieceJointe(d, 'scan_0042.pdf', null, 'l.faure@exemple.fr').length, 0);
  // « cu » est un mot, pas un morceau de « document ».
  assert.equal(app.rubriquesPieceJointe(d, 'document signé.pdf', null, '').length, 0);
});

test('pieceJointeRangeeSeule : documents oui, photos de 30 Ko au moins, jamais les images de signature', () => {
  assert.equal(app.pieceJointeRangeeSeule('scan_0042.pdf', 1000), true);
  assert.equal(app.pieceJointeRangeeSeule('Compromis.docx', 0), true);
  assert.equal(app.pieceJointeRangeeSeule('photo cuisine.jpg', 800 * 1024), true);
  assert.equal(app.pieceJointeRangeeSeule('petit.png', 4 * 1024), false);
  assert.equal(app.pieceJointeRangeeSeule('image001.png', 400 * 1024), false);
  assert.equal(app.pieceJointeRangeeSeule('message.eml', 50 * 1024), false);
});

test('emplacementPieceRangee : sous-dossier dit depuis le dossier client, sinon racine', () => {
  const d = { nasDossier: 'Clients/MARTEL FAURE' };
  assert.equal(app.emplacementPieceRangee(d, 'Clients\\MARTEL FAURE\\9 - AAE\\DPE.pdf'), '9 - AAE');
  assert.equal(app.emplacementPieceRangee(d, 'Clients/MARTEL FAURE/8 - COPRO/ETAT DATE/Etat date.pdf'), '8 - COPRO › ETAT DATE');
  assert.equal(app.emplacementPieceRangee(d, 'Clients/MARTEL FAURE/scan_0042.pdf'), 'racine du dossier');
});

test('estAdresseLocale : le poste serveur (localhost) n’a pas besoin de l’installateur', () => {
  assert.equal(app.estAdresseLocale('localhost'), true);
  assert.equal(app.estAdresseLocale('127.0.0.1'), true);
  assert.equal(app.estAdresseLocale('192.168.60.10'), false);
});

// Étude 02/10 : accusé de réception d'un email du client qui nous transmet des documents.
test('construireEmailAccuseReception : RE: objet, documents listés, formule client ou confrère', () => {
  const d = { nom: 'MARTEL / FAURE' };
  const email = { objet: 'Pièces pour la vente', date: '2026-10-01T08:30:00Z', de: { adresse: 'l.faure@exemple.fr' },
    pj: [{ nom: 'Etat date.pdf', rangee: { pieceLabel: 'État daté' } }, { nom: 'scan_0042.pdf' }, { nom: 'logo.png', ignoree: true }] };
  const c = app.construireEmailAccuseReception(d, email, false);
  assert.equal(c.sujet, 'RE: Pièces pour la vente');
  assert.match(c.corps, /^Bonjour,/);
  assert.match(c.corps, /accusons bonne réception des documents que vous nous avez transmis le 1 octobre 2026 :\n- État daté\n- scan_0042/);
  assert.doesNotMatch(c.corps, /logo/);
  const un = app.construireEmailAccuseReception(d, { ...email, objet: 'RE: Offre', pj: [{ nom: 'Offre de pret.pdf' }] }, true);
  assert.equal(un.sujet, 'RE: Offre');
  assert.match(un.corps, /accuse bonne réception du document transmis \(Offre de pret\)\./);
  assert.doesNotMatch(un.corps, /Bonjour/);
});

test('expediteurConfrere : notaires.fr, notaire participant, office du carnet', () => {
  assert.equal(app.expediteurConfrere({}, 'office.dupont@notaires.fr', []), true);
  assert.equal(app.expediteurConfrere({ emailNotaireParticipant: 'clerc@etude-exemple.fr' }, 'Clerc@etude-exemple.fr', []), true);
  assert.equal(app.expediteurConfrere({}, 'accueil@scp-exemple.fr', [{ email: 'accueil@scp-exemple.fr' }]), true);
  assert.equal(app.expediteurConfrere({}, 'l.faure@exemple.fr', []), false);
});

'use strict';
// Courrier de déblocage ou de transfert des fonds à la banque (étude 28/10, client/139, commun/courriers-succession.js). Noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const CS = require('../commun/courriers-succession');

const DEFUNT = { civilite: 'Madame', prenoms: 'Jeanne', nom: 'EXEMPLE', domicile: 'BLOIS (41000), 1 rue Inventée', decesDate: '2026-09-13', decesLieu: 'BLOIS (41000)' };

test('modèles de l’étude mot pour mot : déblocage et transfert, « Envoi par email uniquement »', () => {
  const doc = CS.documentCourrierSuccession('fonds-deblocage', { destinataire: ['BANQUE EXEMPLE', '1 place de la Banque', '41000 BLOIS'], envoiParMail: true, dateIso: '2026-10-28', defunt: DEFUNT });
  assert.equal(doc.adresse[doc.adresse.length - 1], 'Envoi par email uniquement');
  const texte = doc.lignes.join('\n');
  assert.match(texte, /Suite à votre dernier courrier relatif à la succession de la personne ci-dessus visée, je vous prie de bien vouloir trouver sous ce pli :/);
  assert.match(texte, /- une copie de l'acte de décès,\n- une attestation de dévolution,\n- un R\.I\.B\. de l'étude,\n- les autorisations de déblocage des héritiers\./);
  assert.match(texte, /Ce remboursement aura lieu sous ma responsabilité vis à vis des ayants droit pour lesquels je me porte fort\./);
  assert.match(texte, /Je vous prie d'agréer, Madame la Directrice, Monsieur le Directeur, mes salutations distinguées\./);
  assert.match(CS.documentCourrierSuccession('fonds-transfert', { defunt: DEFUNT }).lignes.join('\n'), /les autorisations de transfert des héritiers\./);
  assert.equal(CS.nomFichierCourrierSuccession('fonds-deblocage', 'SUCC - EXEMPLE'), 'Déblocage des fonds - SUCC - EXEMPLE');
  assert.ok(CS.MODELES_COURRIER_SUCCESSION.filter((m) => !m.fonds).every((m) => !/^fonds-/.test(m.cle)), 'hors des courriers de la Constitution');
});

test('pièces du NAS proposées par leur nom ; objet qui nomme le défunt ; sorte selon le conjoint survivant', () => {
  const app = chargerApplication();
  const p = app.piecesNasFondsBanque([
    { chemin: 'S/Acte de décès EXEMPLE.pdf', nom: 'Acte de décès EXEMPLE.pdf', date: '2026-10-01' },
    { chemin: 'S/Déclaration de succession.pdf', nom: 'Déclaration de succession.pdf' },
    { chemin: 'S/Attestation de dévolution.pdf', nom: 'Attestation de dévolution.pdf' },
    { chemin: 'S/RIB office.pdf', nom: 'RIB office.pdf' },
    { chemin: 'S/Autorisation Paul.pdf', nom: 'Autorisation Paul.pdf' }, { chemin: 'S/Autorisation Marie.pdf', nom: 'Autorisation Marie.pdf' },
    { chemin: 'S/Courrier banque.pdf', nom: 'Courrier banque.pdf' }, { chemin: 'S/notes.docx', nom: 'notes.docx' },
    { chemin: 'S\\Notoriété\\Projet notoriété.pdf' }, { chemin: 'S\\Banque\\Solde au jour du décès.pdf' }
  ]);
  assert.ok(p.some((x) => x.nom === 'Projet notoriété.pdf' && !x.coche), 'nom du fichier seul (serveur Windows), un projet n’est pas l’attestation');
  assert.ok(p.some((x) => x.nom === 'Solde au jour du décès.pdf' && !x.coche), 'un relevé « au jour du décès » n’est pas l’acte de décès');
  assert.equal(p.filter((x) => x.coche).map((x) => x.nom).join(','), 'Acte de décès EXEMPLE.pdf,Attestation de dévolution.pdf,RIB office.pdf,Autorisation Paul.pdf,Autorisation Marie.pdf');
  assert.ok(p.some((x) => x.nom === 'Déclaration de succession.pdf' && !x.coche), 'la déclaration n’est pas l’acte de décès');
  assert.ok(!p.some((x) => x.nom === 'notes.docx'), 'PDF seulement');
  assert.equal(app.piecesManquantesFondsBanque(p).length, 0);
  assert.equal(app.piecesManquantesFondsBanque([]).join(','), 'Acte de décès,Attestation de dévolution,RIB de l’étude,Autorisations des héritiers');
  assert.equal(app.objetEmailFondsBanque('deblocage', DEFUNT, { referenceAuthentic: 'A 2026 00001' }), 'Succession de Madame Jeanne EXEMPLE — Déblocage des fonds — Réf. A 2026 00001');
  assert.equal(app.etapeFondsBanque('transfert'), 'transfertComptes');
  assert.equal(app.etapeFondsBanque('deblocage'), 'deblocageFonds');
});

test('« Demander à CLAIRE » : une banque saisie à la main ne part jamais en clair (« une banque »)', async () => {
  const app = chargerApplication();
  const vm = require('node:vm');
  vm.runInContext("dossiers.push({ id: 's1', nom: 'EXEMPLE', typeAffaire: 'succession', succession: { type: 'notoriete-ds', courriersFonds: [{ sorte: 'deblocage', banque: 'Agence de M. Paul DURAND', le: '2026-10-28', envoye: true }] }, pieces: {}, historique: [], parties: [] })", app);
  const r = await app.courrierFondsBanqueAgent({ dossier_id: 's1', sorte: '', banque: '', ouvrir: false });
  assert.equal(r.courriers_deja[0].banque_du_repertoire, 'une banque');
  assert.equal(r.sorte, 'deblocage');
});

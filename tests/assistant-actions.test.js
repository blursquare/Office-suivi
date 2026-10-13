'use strict';

// « Demander à CLAIRE » : toutes les actions avec une autorisation avant exécution, et les demandes aux collaborateurs (étude 13/10).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

function dossier(extra) {
  return Object.assign({ id: 'd1', nom: 'DURAND / MARTIN', typeVente: 'maison', pret: '2026-11-20', acte: '2026-12-15', pieces: {}, autres: [{ label: 'Diagnostic amiante', date: '2026-10-20' }],
    analyseJuridique: { engagements: [{ texte: 'Fournir le certificat de ramonage' }] }, historique: [] }, extra || {});
}

test('description d’un geste à autoriser', () => {
  const d = dossier();
  assert.match(app.descriptionGesteAgent({ geste: 'archiver', parametres: {} }, d), /^Archiver le dossier — VTE - DURAND \/ MARTIN\.$/);
  assert.match(app.descriptionGesteAgent({ geste: 'responsable', parametres: { collaborateur: 'Julie' } }, d), /Julie VASSELIN/);
  assert.match(app.descriptionGesteAgent({ geste: 'rappel_ajouter', parametres: { texte: 'Relancer la banque', date: '2026-10-20' } }, null), /Relancer la banque/);
  assert.equal(String(app.GESTES_AVEC_AUTORISATION_AGENT), 'rappel_ajouter,echeance_cocher,echeance_decocher,date_fiche,archiver,responsable');
});

test('préparer une action : ce qui sera fait, ou pourquoi non', () => {
  const d = dossier();
  const piece = app.checklistPieces('maison', d)[0];
  const p = app.preparerActionDossierAgent({ action: 'piece_recue', piece: piece.label.toUpperCase() }, d);
  assert.equal(p.piece.cle, piece.cle);
  assert.match(p.description, /Marquer reçue/);
  assert.ok(app.preparerActionDossierAgent({ action: 'piece_recue', piece: 'pièce qui n’existe pas du tout' }, d).erreur);
  assert.ok(app.preparerActionDossierAgent({ action: 'engagement_fait', numero: 1 }, d).engagement);
  assert.ok(app.preparerActionDossierAgent({ action: 'engagement_fait', numero: 2 }, d).erreur);
  assert.equal(app.preparerActionDossierAgent({ action: 'echeance_supprimer', libelle: 'diagnostic AMIANTE' }, d).libelle, 'Diagnostic amiante');
  assert.ok(app.preparerActionDossierAgent({ action: 'echeance_ajouter', libelle: 'X', date: '20/10' }, d).erreur, 'date ISO exigée');
  assert.match(app.preparerActionDossierAgent({ action: 'date_effacer', champ: 'pret' }, d).description, /sans prêt/);
  assert.ok(app.preparerActionDossierAgent({ action: 'date_effacer', champ: 'ventebien' }, d).erreur, 'date déjà vide');
  assert.ok(app.preparerActionDossierAgent({ action: 'desarchiver' }, d).erreur);
  assert.ok(app.preparerActionDossierAgent({ action: 'nas_reverifier' }, d).erreur, 'non relié');
  assert.ok(app.preparerActionDossierAgent({ action: 'inconnue' }, d).erreur);
});

test('champ de la fiche : valeur contrôlée comme une saisie', () => {
  assert.equal(app.valeurChampFicheAgent('prix_vente', '250.000,00').valeur, 250000);
  assert.ok(app.valeurChampFicheAgent('prix_vente', 'beaucoup').erreur);
  assert.ok(app.valeurChampFicheAgent('date_avant_contrat', '12/10/2026').erreur);
  assert.ok(app.valeurChampFicheAgent('email_vendeur', 'pas un email').erreur);
  assert.equal(app.valeurChampFicheAgent('email_vendeur', 'a@b.fr; c@d.fr').valeur, 'a@b.fr; c@d.fr');
  const p = app.preparerActionDossierAgent({ action: 'champ_fiche', champ: 'prix_vente', valeur: '260 000' }, dossier({ prixVente: 250000 }));
  assert.equal(p.cle, 'prixVente');
  assert.match(p.description, /Prix de vente.*→/);
});

test('demande à un collaborateur : la tâche posée dans sa liste, avec qui l’a demandée', () => {
  const r = app.rappelDemandeCollaborateur({ collaborateur: 'Julie', texte: 'Appeler la banque', dossier_id: 'd1', date: '' }, 'Bastien ANGLUMENT', '2026-10-13', Date.UTC(2026, 9, 13));
  assert.equal(r.auteur, 'Julie VASSELIN');
  assert.equal(r.echeance, '2026-10-13');
  assert.equal(r.demandePar, 'Bastien ANGLUMENT');
  assert.match(r.texte, /Appeler la banque \(demandé par Bastien\)/);
  assert.match(r.id, /^dem-[a-z0-9]+-[a-z0-9]+$/);
  assert.match(app.htmlAutorisationAgent('Faire <x>', ''), /À autoriser.*Faire &lt;x&gt;/);
  assert.match(app.htmlAutorisationAgent('Faire', 'refuse'), /Refusé/);
});

test('relecture 13/10 : engagement déjà réalisé refusé, échéance retrouvée par son libellé, valeurs inconnues refusées', () => {
  const d = dossier({ analyseJuridique: { engagements: [{ texte: 'Fournir le certificat', fait: true }] } });
  assert.match(app.preparerActionDossierAgent({ action: 'engagement_fait', numero: 1 }, d).erreur, /déjà réalisé/);
  assert.equal(app.preparerActionDossierAgent({ action: 'echeance_supprimer', libelle: 'diagnostic amiante' }, dossier()).libelle, 'Diagnostic amiante');
  assert.ok(app.valeurChampFicheAgent('email_vendeur', 'Monsieur [à compléter]').erreur);
  assert.ok(app.valeurChampFicheAgent('telephone_vendeur', '06 12').erreur);
  assert.equal(app.valeurChampFicheAgent('telephone_vendeur', '06 12 34 56 78').valeur, '06 12 34 56 78');
  assert.ok(app.preparerActionDossierAgent({ action: 'note_historique', valeur: 'Appel de [à compléter]' }, dossier()).erreur);
});

test('relecture 13/10 : la carte d’une tâche du jour dit l’effet réel', () => {
  const dossierT = dossier();
  assert.match(app.descriptionTacheAgent('tache_executer', { titre: 'Envoyer le projet d’acte', type: 'projetEnvoye', geste: { type: 'marquer', champ: 'projetEnvoye' }, dossier: dossierT }), /Noter .* comme fait aujourd’hui \(rien n’est envoyé\)/);
  assert.match(app.descriptionTacheAgent('tache_executer', { titre: 'Envoyer le projet d’acte', type: 'projetEnvoye', geste: { type: 'email' }, dossier: dossierT }), /rien ne part sans votre clic/);
  assert.match(app.descriptionTacheAgent('tache_faite', { titre: 'Envoyer l’appel de fonds', type: 'appelFonds', dossier: dossierT }), /date d’envoi du jour est notée, rien n’est envoyé/);
});

test('outils de CLAIRE : répertoire cherché sur tous les mots, lecture d’un outil par dossier', () => {
  const contacts = [{ organisme: 'Service de publicité foncière de Blois', theme: 'administrations', telephones: ['02 54 00 00 00'], emails: ['spf.blois@exemple.fr'] },
    { organisme: 'Géomètre Exemple', adresse: 'VINEUIL (41350)', theme: 'géomètres' }];
  const offices = [{ office: 'Office notarial Exemple', notaires: ['Paul EXEMPLE'], ville: 'BLOIS', codePostal: '41000', telephone: '02 54 11 11 11', email: 'office@exemple.fr' }];
  const r = app.chercherRepertoireAgent('publicité foncière Blois', contacts, offices);
  assert.equal(r.nombre, 1);
  assert.equal(r.resultats[0].organisme, 'Service de publicité foncière de Blois');
  assert.equal(r.resultats[0].telephones.join(), '02 54 00 00 00');
  const n = app.chercherRepertoireAgent('notaire blois', contacts, offices);
  assert.equal(n.resultats[0].sorte, 'notaire');
  assert.ok(app.chercherRepertoireAgent('', contacts, offices).erreur);
  assert.ok(app.lectureOutilClaireAgent('aide_redaction', null, '').erreur, 'dossier exigé');
  assert.match(app.lectureOutilClaireAgent('controle_urbanisme', dossier(), '').analyse, /aucune analyse/);
  assert.ok(Array.isArray(app.lectureOutilClaireAgent('aide_redaction', dossier({ rendezVousSignature: '2026-12-10' }), '').champs_de_l_acte));
  assert.ok(app.lectureOutilClaireAgent('forfait_mobilier', dossier(), '').erreur, 'se lit pas : à ouvrir');
});

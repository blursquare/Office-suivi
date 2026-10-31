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
  assert.match(app.lectureOutilClaireAgent('controle_urbanisme', dossier(), '').analyse, /aucune analyse/);
  assert.ok(app.lectureOutilClaireAgent('forfait_mobilier', dossier(), '').erreur, 'se lit pas : à ouvrir');
});

test('outils de CLAIRE : jamais un travail en cours sur un autre dossier écrasé sans le demander', () => {
  const d = { id: 'd1' };
  assert.equal(app.travailEnCoursOutilAgent('quotites', d, { quotites: 'd2' }), true);
  assert.equal(app.travailEnCoursOutilAgent('quotites', d, { quotites: 'd1' }), false);
  assert.equal(app.travailEnCoursOutilAgent('quotites', d, { quotites: '' }), false);
  assert.equal(app.travailEnCoursOutilAgent('appel_fonds', d, { appelFonds: 'd3' }), true);
  assert.equal(app.dossierDejaDansOutilAgent('appel_fonds', d, { appelFonds: 'd1' }), true);
  assert.equal(app.travailEnCoursOutilAgent('repertoire', d, {}), false);
});

test('audit 13/10 : notaire écrit par son nom et seulement s’il est du répertoire ; pièce désignée sans ambiguïté', () => {
  app.carnetConfreres.length = 0;
  assert.ok(app.valeurChampFicheAgent('notaire_vendeur', 'Maître Paul EXEMPLE').erreur, 'annuaire pas chargé : refusé');
  app.carnetConfreres.push({ id: 'o1', office: 'Office Exemple', notaires: ['Paul EXEMPLE'], ville: 'BLOIS', codePostal: '41000' });
  const ok = app.valeurChampFicheAgent('notaire_vendeur', 'Paul EXEMPLE');
  assert.equal(typeof ok.valeur, 'string', 'jamais un booléen : ' + JSON.stringify(ok));
  assert.ok(app.valeurChampFicheAgent('notaire_vendeur', 'Maître Inventé TOTALEMENT (NULLEPART)').erreur);
  app.carnetConfreres.length = 0;
  assert.ok(app.valeurChampFicheAgent('adresse_bien', '12 rue [à compléter]').erreur);
  const d = { id: 'd1', typeVente: 'maison', pieces: {} };
  assert.equal(app.pieceChecklistParLibelle(d, 'de'), null, 'deux lettres ne désignent rien');
});

test('« Autoriser pour toute cette demande » : les gestes suivants de la même demande n’ont plus de carte, sauf un geste strict ; une nouvelle demande repart à zéro', async () => {
  assert.match(app.htmlAutorisationAgent('Faire', 'autorise-demande'), /Autorisé pour cette demande/);
  app.reinitialiserAutorisationDemandeAgent();
  const premiere = app.demanderAutorisationAgent('Premier geste');
  assert.ok(app.autorisationAgentEnAttente, 'une carte attend un clic');
  app.autorisationAgentEnAttente.resoudre(true, true);
  assert.equal(await premiere, true);
  assert.equal(app.autorisationAgentEnAttente, null);
  // Le geste suivant passe sans carte…
  assert.equal(await app.demanderAutorisationAgent('Deuxième geste'), true);
  assert.equal(app.autorisationAgentEnAttente, null);
  // …sauf s'il est strict (envoi, suppression d'un rendez-vous).
  const stricte = app.demanderAutorisationAgent('Supprimer un rendez-vous', { strict: true });
  assert.ok(app.autorisationAgentEnAttente, 'un geste strict a toujours sa carte');
  app.autorisationAgentEnAttente.resoudre(false);
  assert.equal(await stricte, false);
  // Un refus, comme une nouvelle demande, remet les cartes.
  const apres = app.demanderAutorisationAgent('Troisième geste');
  assert.ok(app.autorisationAgentEnAttente, 'après un refus, une carte est de nouveau demandée');
  app.autorisationAgentEnAttente.resoudre(true);
  assert.equal(await apres, true);
  app.reinitialiserAutorisationDemandeAgent();
});

test('lire_dossier : qui reçoit l’acte et quel confrère écrire, d’après la fiche (étude 26/10)', () => {
  // Participation : notre office côté acquéreur, le confrère du vendeur reçoit l'acte.
  const d = dossier({ roleNotaire: 'participant', notaireVendeur: 'Maître Paul EXEMPLE (TOURS)', notaireAcquereur: 'Maître Sophie GOSSART (BLOIS)' });
  const n = app.notairesActeAgent(d);
  assert.equal(n.notaire_qui_recoit_l_acte.cote, 'vendeur');
  assert.equal(n.notaire_qui_recoit_l_acte.notre_office, false);
  assert.equal(n.confreres.length, 1);
  assert.equal(n.confreres[0].cote, 'vendeur');
  assert.equal(n.confreres[0].recoit_l_acte, true);
  // Le côté noté sur la fiche fait foi.
  assert.equal(app.notairesActeAgent(dossier({ coteInstrumentaire: 'acquereur', notaireVendeur: 'Maître Sophie GOSSART (BLOIS)', notaireAcquereur: 'Maître Paul EXEMPLE (TOURS)' })).notaire_qui_recoit_l_acte.cote, 'acquereur');
  // Seul notaire : nous recevons l'acte, aucun confrère.
  const seul = app.notairesActeAgent(dossier({ roleNotaire: 'instrumentaire', notaireVendeur: 'Maître Sophie GOSSART (BLOIS)' }));
  assert.equal(seul.notaire_qui_recoit_l_acte.notre_office, true);
  assert.equal(seul.confreres.length, 0);
});

test('email libre de l’agent : « Mon cher Maître » va au confrère, jamais au client ; documents joints (étude 26/10)', async () => {
  const appels = [];
  app.livrerEmailDossier = async (o) => { appels.push(o); return { ok: true, mode: 'envoye' }; };
  app.sauvegarder = () => {};
  const d = dossier({ id: 'dc', roleNotaire: 'participant', notaireVendeur: 'Maître Paul EXEMPLE (TOURS)', notaireAcquereur: 'Maître Sophie GOSSART (BLOIS)',
    emailConfrereVendeur: 'office.exemple@notaires.fr', emailAcquereur: 'client.acquereur@exemple.fr' });
  const corps = 'Mon cher Maître,\n\nVeuillez trouver ci-joint l’offre de prêt.\n\nVotre bien dévoué.';
  // L'agent donne l'adresse du CLIENT : écartée, l'email part au confrère.
  await app.gesteEmailAssistant(d, { destinataire: 'client.acquereur@exemple.fr', objet: 'Offre de prêt', corps, partie: '', documents: [] });
  assert.equal(appels[0].destinataire, 'office.exemple@notaires.fr');
  assert.equal(appels[0].confrere, true);
  // Partie « confrere » sans adresse : le confrère de la fiche.
  await app.gesteEmailAssistant(d, { destinataire: '', objet: 'Offre de prêt', corps: 'Bonjour', partie: 'confrere', documents: [] });
  assert.equal(appels[1].destinataire, 'office.exemple@notaires.fr');
  // Partie « acquereur » : le client (notre client, pas de confrère de son côté).
  await app.gesteEmailAssistant(d, { destinataire: '', objet: 'x', corps: 'Bonjour', partie: 'acquereur', documents: [] });
  assert.equal(appels[2].destinataire, 'client.acquereur@exemple.fr');
  // Un document inconnu n'est pas joint ; il est dit.
  const r = await app.gesteEmailAssistant(d, { destinataire: '', objet: 'x', corps: 'Bonjour', partie: 'confrere', documents: ['doc999'] });
  assert.equal(appels[3].pieces.length, 0);
  assert.match(r.html, /n’a pas pu être joint/);
});

test('email libre : « Mon cher Maître » avec partie acquéreur (notre client) part au confrère, formule du confrère (relecture 26/10)', async () => {
  const appels = [];
  app.livrerEmailDossier = async (o) => { appels.push(o); return { ok: true, mode: 'envoye' }; };
  app.sauvegarder = () => {};
  const d = dossier({ id: 'dc2', roleNotaire: 'participant', notaireVendeur: 'Maître Paul EXEMPLE (TOURS)', notaireAcquereur: 'Maître Sophie GOSSART (BLOIS)',
    emailConfrereVendeur: 'office.exemple@notaires.fr', emailAcquereur: 'client.acquereur@exemple.fr' });
  await app.gesteEmailAssistant(d, { destinataire: '', objet: 'x', corps: 'Mon cher Maître,\n\nCi-joint.', partie: 'acquereur', documents: [] });
  assert.equal(appels[0].destinataire, 'office.exemple@notaires.fr');
  assert.equal(appels[0].confrere, true);
  // Adresse du confrère donnée par l'agent : formule du confrère aussi.
  await app.gesteEmailAssistant(d, { destinataire: 'office.exemple@notaires.fr', objet: 'x', corps: 'Ci-joint.', partie: 'confrere', documents: [] });
  assert.equal(appels[1].confrere, true);
});

test('demander à un collègue (0.363.0) : la demande passe par la conversation personnelle, sous le nom de l’utilisateur', () => {
  assert.equal(app.idCanalPriveEntre('Julie VASSELIN', 'Jérémy SAUJOT'), 'p:jeremy-julie', 'prénoms sans accent, rangés');
  assert.equal(app.idCanalPriveEntre('Jérémy SAUJOT', 'Julie VASSELIN'), 'p:jeremy-julie', 'ordre indifférent');
  assert.equal(app.idCanalPriveEntre('Julie VASSELIN', 'Julie VASSELIN'), '', 'soi-même : pas de conversation');
  assert.equal(app.idCanalPriveEntre('', 'Julie VASSELIN'), '');
  const d = { id: 'd1', nom: 'EXEMPLE / ESSAI' };
  assert.match(app.texteDemandeCollaborateur({ texte: 'Appeler la banque', date: '2026-10-28' }, d), /^Appeler la banque — VTE - EXEMPLE \/ ESSAI \(pour le 28\/10\/2026\)$|^Appeler la banque — VTE - EXEMPLE \/ ESSAI \(pour le 28 octobre 2026\)$/);
  assert.equal(app.texteDemandeCollaborateur({ texte: '  Appeler la banque ', date: '' }, null), 'Appeler la banque');
});

test('gestes de la fiche par l’agent (étude 31/10 : « que Claude utilise CLAIRE comme moi ») : carte claire, refus quand le geste n’a pas lieu d’être', () => {
  const app = chargerApplication();
  const d = { id: 'd9', nom: 'MOREL / PETIT', typeVente: 'maison', historique: [], pieces: {}, piecesPersonnalisees: [{ cle: 'perso-a', label: 'Plan du géomètre' }],
    parties: [{ role: 'VENDEUR', nom: 'MOREL', prenom: 'Anne' }, null, { role: 'ACQUEREUR', nom: 'PETIT', prenom: 'Luc' }],
    analyseJuridique: { engagements: [{ texte: 'Fournir le diagnostic', fait: true }, { texte: 'Autre', fait: false }] } };
  const p = (e) => app.preparerActionDossierAgent(e, d);
  assert.match(p({ action: 'piece_ajouter', libelle: 'Attestation décennale' }).description, /Ajouter la pièce « Attestation décennale »/);
  assert.ok(p({ action: 'piece_ajouter', libelle: 'plan du geometre' }).erreur, 'déjà dans la checklist');
  assert.match(p({ action: 'piece_retirer', piece: 'Plan du géomètre' }).description, /Retirer la pièce/);
  assert.ok(p({ action: 'piece_retirer', piece: 'Titre de propriété' }).erreur, 'seule une pièce ajoutée à la main');
  assert.match(p({ action: 'engagement_defait', numero: 1 }).description, /Décocher/);
  assert.ok(p({ action: 'engagement_defait', numero: 2 }).erreur);
  assert.match(p({ action: 'type_vente', valeur: 'copropriete' }).description, /copropriété/);
  assert.ok(p({ action: 'type_vente', valeur: 'maison' }).erreur, 'déjà ce type');
  assert.ok(p({ action: 'fonds_annuler_validation' }).erreur);
  assert.ok(p({ action: 'authentic_maj', valeur: 'accepter' }).erreur, 'rien en attente');
  const r = p({ action: 'partie_retirer', numero: 2 });
  assert.match(r.description, /Luc PETIT/, 'même numérotation que lire_dossier (sans les vides)');
  assert.equal(r.partie, d.parties[2], 'la personne elle-même est gardée : retrouvée au clic, jamais par une position qui a pu glisser');
  // Pièce validée à la main : on retire la validation (comme l'écran), on ne réinitialise pas la reconnaissance du NAS.
  const piece = app.checklistPieces('maison', d)[0];
  d.pieces[piece.cle] = 'recue'; d.piecesValideesManuellement = [piece.cle];
  const nr = p({ action: 'piece_non_recue', piece: piece.label });
  assert.equal(nr.main, true);
  assert.match(nr.description, /validation à la main/);
  assert.ok(p({ action: 'piece_ajouter', libelle: piece.label }).erreur, 'une pièce standard n’est pas ajoutée en double');
  assert.ok(p({ action: 'succession_champ', libelle: 'type', valeur: 'x' }).erreur, 'pas une succession');
  assert.ok(p({ action: 'inconnue' }).erreur);
});

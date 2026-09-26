'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Section 1 du rapport d'Outil 2 : ce que l'acte dit de LUI-MÊME, sans aucun autre document.
// Textes synthétiques reprenant la STRUCTURE d'actes réels — noms et montants inventés, aucune
// donnée client dans le dépôt.

const titres = c => c.map(x => x.titre).join(' | ');

test('une procédure en cours déclarée dans l’acte ressort', () => {
  const app = chargerApplication();
  // L'intitulé et la clause forment une seule phrase : pdf.js joint les items d'une page par une
  // espace, un titre de paragraphe n'est donc pas séparé du texte qui le suit par un point.
  const t = "Convention des parties sur la procédure en cours Le VENDEUR déclare qu'il existe "
    + "actuellement une procédure en cours : procédure d'assignation du syndicat contre la société "
    + "de construction pour les faire condamner à prendre en charge les travaux de la cour.";
  const c = app.constatsLectureActe(t, null);
  assert.equal(c.length, 1);
  assert.equal(c[0].gravite, 'IMPORTANT');
  assert.equal(c[0].categorie, 'ACTE');
});

test('la subrogation est jugée sur la CLAUSE entière, pas sur la phrase citée', () => {
  const app = chargerApplication();
  // La reprise par l'acquéreur arrive DEUX phrases après la mention de la procédure — exactement
  // la rédaction de l'acte réel envoyé par l'étude. Citée court, jugée large.
  const t = "Le VENDEUR déclare qu'il existe actuellement une procédure en cours : assignation du "
    + "syndicat contre le promoteur. Cette procédure n'est aucunement liée à une faute du VENDEUR. "
    + "L'ACQUEREUR s'oblige à faire son affaire personnelle de cette procédure à compter de ce jour, "
    + "à l'effet de quoi le VENDEUR le subroge dans tous ses droits.";
  const c = app.constatsLectureActe(t, null);
  assert.equal(c.length, 1);
  assert.equal(c[0].gravite, 'CRITIQUE');
  assert.match(c[0].titre, /reprise par l’acquéreur/);
  // La phrase citée reste courte : elle s'arrête au premier point.
  assert.ok(!/subroge/.test(c[0].phrase));
});

test('la clause de style « aucun litige en cours » ne produit rien', () => {
  const app = chargerApplication();
  const t = "Le VENDEUR déclare qu'il n'existe à ce jour aucune action ou litige en cours, "
    + "aucune procédure en cours, pouvant affecter la propriété du BIEN.";
  assert.equal(app.constatsLectureActe(t, null).length, 0);
});

test('un document déclaré non établi ressort, sauf si l’acte dit pourquoi il en est dispensé', () => {
  const app = chargerApplication();
  const garde = "Le diagnostic technique global n'a pas été établi. Le notaire précise que "
    + "l'absence d'un tel diagnostic ne permet pas à l'ACQUEREUR d'apprécier l'état de l'immeuble.";
  const c1 = app.constatsLectureActe(garde, null);
  assert.equal(c1.length, 1);
  assert.equal(c1[0].gravite, 'A_VERIFIER');

  // L'acte a déjà répondu à la question : la poser reviendrait à interroger chaque acte qui prend
  // la peine de se justifier.
  const dispense = "L'immeuble n'entre pas dans le champ d'application des dispositions de "
    + "l'article L 126-28-1 du Code de la construction, par suite il n'a pas été établi d'audit "
    + "énergétique.";
  assert.equal(app.constatsLectureActe(dispense, null).length, 0);
});

test('une clause n’est jugée qu’une fois, même si le motif y apparaît deux fois', () => {
  const app = chargerApplication();
  const t = "Il existe une procédure en cours ; cette procédure en cours oppose le syndicat au "
    + "promoteur et porte sur la réfection de la cour de l'immeuble.";
  assert.equal(app.constatsLectureActe(t, null).length, 1);
});

test('la page du constat vient des frontières de pages fournies', () => {
  const app = chargerApplication();
  const avant = 'A'.repeat(300) + '. ';
  const t = avant + "Le VENDEUR déclare qu'une procédure en cours oppose le syndicat au promoteur.";
  const pages = [{ numero: 1, debut: 0, fin: 200 }, { numero: 2, debut: 200, fin: 900 }];
  const c = app.constatsLectureActe(t, pages);
  assert.equal(c.length, 1);
  assert.equal(c[0].page, 2);
});

test('seules les incohérences de l’ACTE deviennent des constats, pas les limites de lecture', () => {
  const app = chargerApplication();
  const extraction = {
    alertes: [
      { code: 'PRET_APRES_ACTE', gravite: 'critique', message: 'Le prêt tombe après l’acte.' },
      { code: 'ADRESSE_INCOMPLETE', gravite: 'attention', message: 'Adresse non reconstituée.' },
      { code: 'NOTAIRE_INSTRUMENTAIRE_INCERTAIN', gravite: 'attention', message: 'Non déterminé.' },
      { code: 'NOTAIRES_IDENTIQUES', gravite: 'attention', message: 'Même notaire des deux côtés.' }
    ]
  };
  const c = app.constatsCoherenceActe(extraction);
  // L'adresse et le notaire non déterminés sont DÉJÀ affichés « non trouvé » dans la fiche :
  // en refaire un constat dirait deux fois la même chose.
  assert.equal(c.length, 2);
  assert.equal(c.map(x => x.gravite).join(','), 'CRITIQUE,A_VERIFIER');
  assert.equal(c[0].categorie, 'ACTE');
  assert.equal(app.constatsCoherenceActe(null).length, 0);
});

test('la fiche lit le rôle des parties en capitales, le vocabulaire de l’extraction', () => {
  const app = chargerApplication();
  const extraction = {
    parties: [
      { nom: 'DUPONT', role: 'VENDEUR' }, { nom: 'DURAND', role: 'VENDEUR' },
      { nom: 'MARTIN', role: 'ACQUEREUR' }
    ],
    bien: {}, dates: {}, champs: {}, notaires: {}
  };
  const fiche = app.ficheActeOutil2(extraction, 'acte');
  const par = libelle => fiche.find(l => l.libelle === libelle);
  assert.equal(par('Vendeur(s)').valeur, 'DUPONT & DURAND');
  assert.equal(par('Acquéreur(s)').valeur, 'MARTIN');
});

test('la fiche s’adapte au mode : un acte de vente n’a pas de dates butoir', () => {
  const app = chargerApplication();
  const extraction = { parties: [], bien: {}, dates: {}, champs: {}, notaires: {}, typeActe: { valeur: 'INCONNU' } };

  const acte = app.ficheActeOutil2(extraction, 'acte').map(l => l.libelle).join(' | ');
  assert.ok(!/Type d’acte/.test(acte));
  assert.ok(!/Obtention du prêt/.test(acte));
  assert.ok(!/Dépôt de garantie/.test(acte));

  const compromis = app.ficheActeOutil2(extraction, 'compromis').map(l => l.libelle).join(' | ');
  assert.ok(/Type d’acte/.test(compromis));
  assert.ok(/Obtention du prêt/.test(compromis));
  assert.ok(/Dépôt de garantie/.test(compromis));
});

test('une valeur absente reste nulle dans la fiche, jamais complétée', () => {
  const app = chargerApplication();
  const fiche = app.ficheActeOutil2({ parties: [], bien: {}, dates: {}, champs: {}, notaires: {} }, 'acte');
  assert.ok(fiche.length > 0);
  assert.ok(fiche.every(l => l.valeur === null));
  assert.equal(app.ficheActeOutil2(null, 'acte').length, 0);
});

test('chaque catégorie de constat est rattachée à une section existante du rapport', () => {
  const app = chargerApplication();
  const sections = app.SECTIONS_RAPPORT_OUTIL2.map(s => s.cle);
  for (const sous of app.SOUS_SECTIONS_RAPPORT_OUTIL2) {
    assert.ok(sections.indexOf(sous.section) !== -1, `${sous.cle} vise une section inconnue`);
  }
  // Garde-fou structurel : une catégorie oubliée ici disparaîtrait silencieusement du rapport.
  const couvertes = app.SOUS_SECTIONS_RAPPORT_OUTIL2.map(s => s.cle).sort().join(',');
  assert.equal(couvertes, ['ACTE', 'CARNET_ENTRETIEN', 'COMPARAISON_COMPROMIS', 'COPROPRIETE',
    'DIAGNOSTICS', 'DOCUMENTS', 'ENTRETIENS', 'ETAT_DATE', 'PARTIES', 'PERMIS', 'TRAVAUX_A_FAIRE',
    'TRAVAUX_REALISES', 'URBANISME'].sort().join(','));
});

test('le cadastre est lu aussi dans le tableau à plat d’un acte authentique', () => {
  const app = chargerApplication();
  // pdf.js rend le tableau de la PARTIE NORMALISÉE à plat : en-tête de colonnes puis valeurs.
  const c = app.detecterCadastre('Figurant ainsi au cadastre : Section N° Lieudit BH 81 9 RUE DES TILLEULS');
  assert.equal(c.section, 'BH');
  assert.equal(c.numero, '81');
  // La rédaction en toutes lettres d'un avant-contrat reste reconnue à l'identique.
  const d = app.detecterCadastre('cadastrée section AB numéro 24');
  assert.equal(d.section, 'AB');
  assert.equal(d.numero, '24');
});

test('sur une comparution d’acte authentique, chaque notaire garde SON côté', () => {
  const app = chargerApplication();
  // Les deux notaires comparaissent dans la même phrase, chacun suivi de sa qualité : sans borne
  // à gauche de la fenêtre, le second héritait du côté du premier et l'acquéreur restait sans
  // notaire — constaté sur un projet de vente réel.
  const t = "Maître Anne PREVOST, Notaire à CHATEAUDUN (28200), soussignée, Notaire assistant le "
    + "VENDEUR, Avec le concours à distance, en son office notarial, de Maître Claire FONTAINE, "
    + "notaire à BLOIS (41000), assistant l'ACQUEREUR, A REÇU LA PRESENTE VENTE.";
  const liste = app.detecterNotaires(t, 'INCONNU');
  assert.equal(liste.length, 2);
  assert.equal(liste[0].cote, 'vendeur');
  assert.equal(liste[1].cote, 'acquereur');
});

// --- Bruit du rapport : l'étude masque une rubrique entière ---------------------------------
// Retour direct de l'étude : le défaut d'Outil 2 n'est pas ce qu'il rate, c'est qu'il « signale
// trop de choses sans intérêt ». Faute d'acte réel, c'est elle qui tranche rubrique par rubrique.

test('masquer une rubrique l’ajoute, la rappeler la retire', () => {
  const app = chargerApplication();
  const a = app.basculerRubriqueDans([], 'DIAGNOSTICS');
  assert.equal(a.join(','), 'DIAGNOSTICS');
  assert.equal(app.basculerRubriqueDans(a, 'DIAGNOSTICS').length, 0);
});

test('une clé inconnue n’est jamais masquée, et une entrée morte est nettoyée', () => {
  const app = chargerApplication();
  // Sans ce garde-fou, une rubrique renommée laisserait une entrée que plus aucun bouton du
  // rapport ne pourrait retirer.
  assert.equal(app.basculerRubriqueDans([], 'RUBRIQUE_INVENTEE').length, 0);
  assert.equal(app.basculerRubriqueDans(['RUBRIQUE_SUPPRIMEE'], 'PARTIES').join(','), 'PARTIES');
  assert.equal(app.basculerRubriqueDans(null, 'PARTIES').join(','), 'PARTIES');
});

// --- Écart avant-contrat / projet : l'erreur que l'étude dit la plus coûteuse ------------------

test('« aucun écart » n’est affirmé que si la comparaison a réellement eu lieu', () => {
  const app = chargerApplication();
  const bloc = app.SECTIONS_RAPPORT_OUTIL2.find(b => b.cle === 'AVANT_CONTRAT');

  const sans = app.messageBlocAuditVide(bloc, { mode: 'acte', comparaisonFaite: false });
  assert.match(sans, /Aucun avant-contrat de référence/);
  assert.ok(!/Aucun écart relevé/.test(sans));

  const avec = app.messageBlocAuditVide(bloc, { mode: 'acte', comparaisonFaite: true });
  assert.match(avec, /Aucun écart relevé/);
});


test('comparaisonFaite dit si une référence était disponible, pas si un écart a été trouvé', () => {
  const app = chargerApplication();
  const base = { texteProjet: 'Texte du projet de vente.', texteAvantContrat: 'Texte du compromis.' };
  assert.equal(app.analyserProjetVenteOutil2(base).comparaisonFaite, false);

  const avecRef = app.analyserProjetVenteOutil2({
    ...base,
    reference: { parties: [], prixVente: null, bien: {}, notaires: {}, dates: {} },
    projet: { parties: [], prixVente: null, bien: {}, notaires: {}, dates: {} }
  });
  assert.equal(avecRef.comparaisonFaite, true);
});

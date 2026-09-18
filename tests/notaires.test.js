'use strict';

// Détection des notaires et détermination de l'instrumentaire (voir la section « EXTRACTION
// STRUCTURÉE : notaires » dans script.js). Entièrement nouveau : le rôle de l'étude sur un dossier
// était jusqu'ici saisi à la main, sans aucune aide du document.
// Ordre de priorité imposé par la spec : mention explicite > règle métier géographique > rien.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const EN_TETE = 'COMPROMIS DE VENTE. Le bien est sis à 12 rue Victor Hugo, 41000 BLOIS.\n';

function acte(lignes) {
  return EN_TETE + lignes.join('\n');
}

test('detecterNotaires relève le nom, l’étude et le département déduit du code postal', () => {
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur."
  ]), 'COMPROMIS_DE_VENTE');
  assert.equal(notaires.length, 1);
  assert.equal(notaires[0].nom, 'Sophie GOSSART');
  assert.equal(notaires[0].office, 'Blois');
  assert.equal(notaires[0].codePostal, '41000');
  assert.equal(notaires[0].departement, '41');
  assert.equal(notaires[0].cote, 'vendeur');
});

test('le rattachement à une partie ne déborde pas sur le notaire voisin', () => {
  // Chaque notaire n'est rattaché qu'au « notaire du… » de SA phrase : sans cette borne, le
  // rattachement écrit en fin de ligne précédente était attribué au notaire suivant.
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur.",
    "Maître Paul DURAND, notaire à Orléans, 8 rue C, 45000 ORLÉANS, notaire de l'acquéreur."
  ]), 'COMPROMIS_DE_VENTE');
  assert.equal(notaires.find(n => n.nom === 'Sophie GOSSART').cote, 'vendeur');
  assert.equal(notaires.find(n => n.nom === 'Paul DURAND').cote, 'acquereur');
});

test('règle 41/45/37 : bien dans le 41 et notaire du vendeur dans le 45 → il reçoit l’acte', () => {
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Paul DURAND, notaire à Orléans, 8 rue C, 45000 ORLÉANS, notaire du vendeur.",
    "Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire de l'acquéreur."
  ]), 'COMPROMIS_DE_VENTE');
  const r = app.determinerNotaires(notaires, '41');
  assert.equal(r.instrumentaire.nom, 'Paul DURAND');
  assert.equal(r.statut, 'CONFIRMED');
  assert.ok(r.raison.includes('41'));
  // L'étude est alors le notaire participant.
  assert.equal(r.roleEtude, 'participant');
});

test('règle 41/45/37 : notaire du vendeur hors des trois départements → rien n’est tranché', () => {
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Paul DURAND, notaire à Paris, 8 rue C, 75008 PARIS, notaire du vendeur.",
    "Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire de l'acquéreur."
  ]), 'COMPROMIS_DE_VENTE');
  const r = app.determinerNotaires(notaires, '41');
  assert.equal(r.instrumentaire, null);
  assert.equal(r.statut, 'NEEDS_REVIEW');
  assert.equal(r.roleEtude, null);
});

test('une mention explicite l’emporte sur la règle géographique', () => {
  // « qui recevra l'acte » sur le notaire de l'acquéreur : la règle 41/45/37 aurait désigné celui
  // du vendeur, mais le document est explicite et prime (niveau 1 de la spec).
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Sophie GOSSART, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur.",
    "Maître Paul DURAND, notaire à Orléans, 8 rue C, 45000 ORLÉANS, notaire de l'acquéreur, qui recevra l'acte."
  ]), 'COMPROMIS_DE_VENTE');
  const r = app.determinerNotaires(notaires, '41');
  assert.equal(r.instrumentaire.nom, 'Paul DURAND');
  assert.equal(r.participant.nom, 'Sophie GOSSART');
  assert.equal(r.roleEtude, 'participant');
});

test('deux notaires désignés pour recevoir l’acte → NEEDS_REVIEW, sans choix arbitraire', () => {
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Sophie GOSSART, notaire à Blois, 41000 BLOIS, qui recevra l'acte.",
    "Maître Paul DURAND, notaire à Orléans, 45000 ORLÉANS, qui recevra l'acte."
  ]), 'COMPROMIS_DE_VENTE');
  const r = app.determinerNotaires(notaires, '41');
  assert.equal(r.instrumentaire, null);
  assert.equal(r.statut, 'NEEDS_REVIEW');
  assert.ok(r.raison.toLowerCase().includes('plusieurs'));
});

test('l’étude est reconnue sous ses deux graphies (GOSSART et GOSSARD)', () => {
  const app = chargerApplication();
  for (const graphie of ['GOSSART', 'GOSSARD']) {
    const notaires = app.detecterNotaires(acte([
      `Maître Sophie ${graphie}, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur.`
    ]), 'COMPROMIS_DE_VENTE');
    assert.equal(app.determinerNotaires(notaires, '41').roleEtude, 'instrumentaire', graphie);
  }
});

test('un acte où l’étude n’apparaît pas ne pré-remplit aucun rôle', () => {
  const app = chargerApplication();
  const notaires = app.detecterNotaires(acte([
    "Maître Paul DURAND, notaire à Blois, 5 rue du Commerce, 41000 BLOIS, notaire du vendeur."
  ]), 'COMPROMIS_DE_VENTE');
  const r = app.determinerNotaires(notaires, '41');
  assert.equal(r.instrumentaire.nom, 'Paul DURAND');
  assert.equal(r.roleEtude, null);
});

test('sans notaire identifié, aucun rôle n’est inventé', () => {
  const app = chargerApplication();
  const r = app.determinerNotaires([], '41');
  assert.equal(r.statut, 'NOT_FOUND');
  assert.equal(r.instrumentaire, null);
  assert.equal(r.roleEtude, null);
});

test('la règle métier est déclarée à un seul endroit, modifiable sans toucher au code', () => {
  const app = chargerApplication();
  const regles = app.REGLES_NOTAIRE_INSTRUMENTAIRE;
  assert.equal(regles.length, 1);
  assert.equal(regles[0].departementBien, '41');
  assert.equal(regles[0].departementsNotaireVendeur.join(','), '41,45,37');
});

// L'étude a précisé OÙ chaque type d'acte nomme ses notaires : première page pour une promesse de
// vente et ses dérivées, fin d'acte pour un compromis. Les quatre tests qui suivent verrouillent
// cette distinction — chercher au mauvais endroit reviendrait à lire des notaires cités à tout
// autre titre dans le corps de l'acte (origine de propriété, acte antérieur...).

// Remplissage neutre : ni nom de notaire, ni formule de rôle, seulement de quoi éloigner deux
// zones l'une de l'autre.
const BOURRAGE = 'texte de clause sans notaire ni role. '.repeat(120);

test('sur un COMPROMIS, ce sont les notaires de FIN d’acte qui font foi', () => {
  const app = chargerApplication();
  const texte = `COMPROMIS DE VENTE\n${BOURRAGE}\n`
    + 'Maître Sophie GOSSART, notaire à BLOIS, et Maître Paul DURAND, notaire à ORLEANS.';
  const notaires = app.detecterNotaires(texte, 'COMPROMIS_DE_VENTE');
  assert.equal(notaires.length, 2);
  assert.equal(notaires.every(n => n.enFin), true, 'les deux mentions sont dans la zone de fin');
  assert.equal(notaires.some(n => n.enTete), false, 'et aucune dans l’en-tête');
  const r = app.determinerNotaires(notaires, null, 'COMPROMIS_DE_VENTE');
  assert.equal(r.instrumentaire.nom, 'Sophie GOSSART');
  assert.equal(r.participant.nom, 'Paul DURAND');
  assert.equal(r.statut, 'CONFIRMED');
  assert.match(r.raison, /fin de compromis/);
});

test('un COMPROMIS ne tranche PAS sur des notaires nommés seulement en première page', () => {
  // C'est la correction demandée par l'étude : la règle « en-tête » était appliquée au compromis,
  // alors qu'il nomme ses notaires en fin d'acte. Deux noms en tête d'un compromis sont donc cités
  // à un autre titre, et ne doivent rien décider.
  const app = chargerApplication();
  const texte = 'COMPROMIS DE VENTE\n'
    + 'Maître Sophie GOSSART, notaire à BLOIS, et Maître Paul DURAND, notaire à ORLEANS.\n'
    + BOURRAGE;
  const notaires = app.detecterNotaires(texte, 'COMPROMIS_DE_VENTE');
  assert.equal(notaires.every(n => n.enTete), true);
  assert.equal(notaires.some(n => n.enFin), false);
  const r = app.determinerNotaires(notaires, null, 'COMPROMIS_DE_VENTE');
  assert.equal(r.statut, 'NEEDS_REVIEW');
  assert.equal(r.instrumentaire, null);
});

test('une PROMESSE ne tranche PAS sur des notaires nommés seulement en fin d’acte', () => {
  // Symétrique du test précédent : une promesse nomme ses notaires en première page.
  const app = chargerApplication();
  const texte = `PROMESSE DE VENTE\n${BOURRAGE}\n`
    + 'Maître Sophie GOSSART, notaire à BLOIS, et Maître Paul DURAND, notaire à ORLEANS.';
  const r = app.determinerNotaires(app.detecterNotaires(texte, 'PROMESSE_DE_VENTE'), null, 'PROMESSE_DE_VENTE');
  assert.equal(r.statut, 'NEEDS_REVIEW');
  assert.equal(r.instrumentaire, null);
});

test('la zone consultée est déclarée à UN SEUL endroit, par type d’acte', () => {
  const app = chargerApplication();
  assert.equal(app.ZONE_NOTAIRES_PAR_TYPE.PROMESSE_DE_VENTE, 'entete');
  assert.equal(app.ZONE_NOTAIRES_PAR_TYPE.PROMESSE_D_ACHAT, 'entete');
  assert.equal(app.ZONE_NOTAIRES_PAR_TYPE.COMPROMIS_DE_VENTE, 'fin');
  // Un type non tranché ne consulte aucune zone : on ne devine pas où chercher.
  assert.equal(app.ZONE_NOTAIRES_PAR_TYPE.INCONNU, undefined);
});

test('sur une promesse, l’ordre en tête de première page désigne instrumentaire puis participant', () => {
  // Convention de rédaction indiquée par l'étude. Dernier recours seulement : ni mention explicite
  // ni règle géographique applicable ici (aucune adresse de notaire, donc aucun département).
  const app = chargerApplication();
  const texte = `PROMESSE DE VENTE
Reçue par Maître Sophie GOSSART, notaire à BLOIS,
avec Maître Paul DURAND, notaire à ORLEANS.

Entre les soussignés, il a été convenu ce qui suit.`;
  const notaires = app.detecterNotaires(texte, 'PROMESSE_DE_VENTE');
  assert.equal(notaires.length, 2);
  assert.equal(notaires.every(n => n.enTete), true);
  const r = app.determinerNotaires(notaires, null, 'PROMESSE_DE_VENTE');
  assert.equal(r.instrumentaire.nom, 'Sophie GOSSART');
  assert.equal(r.participant.nom, 'Paul DURAND');
  assert.equal(r.statut, 'CONFIRMED');
  assert.match(r.raison, /tête de la première page/);
});

test('l’ordre en tête ne s’applique pas à un notaire cité loin dans le corps de l’acte', () => {
  const app = chargerApplication();
  // Texte volontairement neutre pour le second notaire : on teste ici la BORNE de l'en-tête, pas
  // la reconnaissance d'une mention explicite (qui, elle, primerait — voir le test suivant).
  const texte = 'PROMESSE DE VENTE\nMaître Sophie GOSSART, notaire à BLOIS.\n'
    + 'x '.repeat(app.ZONE_ENTETE_ACTE)
    + '\nLe bien jouxte celui de Maître Paul DURAND, notaire à ORLEANS.';
  const notaires = app.detecterNotaires(texte, 'PROMESSE_DE_VENTE');
  assert.equal(notaires.filter(n => n.enTete).length, 1, 'un seul notaire est dans l’en-tête');
  const r = app.determinerNotaires(notaires, null, 'PROMESSE_DE_VENTE');
  // Un seul notaire en tête : l'ordre ne dit rien, on ne tranche pas plutôt que de deviner.
  assert.equal(r.statut, 'NEEDS_REVIEW');
});

test('une mention explicite garde la priorité sur l’ordre en tête', () => {
  const app = chargerApplication();
  const texte = `PROMESSE DE VENTE
Maître Paul DURAND, notaire à ORLEANS, et Maître Sophie GOSSART, notaire à BLOIS.
L'acte authentique sera reçu par Maître Sophie GOSSART, notaire à BLOIS.`;
  const r = app.determinerNotaires(app.detecterNotaires(texte, 'PROMESSE_DE_VENTE'), null, 'PROMESSE_DE_VENTE');
  assert.equal(r.instrumentaire.nom, 'Sophie GOSSART');
  assert.match(r.raison, /explicitement/);
});

// L'étude a défini le rôle : « le notaire instrumentaire est celui qui a RÉDIGÉ, et celui en
// participation ou en concours est celui qui est en second ». Les formes du verbe rédiger — y
// compris au passé — valent donc désignation explicite, au même titre que « recevra l'acte ».

test('« rédigé par » et « notaire rédacteur » désignent l’instrumentaire', () => {
  const app = chargerApplication();
  for (const clause of [
    'Le présent acte sera rédigé par Maître Sophie GOSSART, notaire à BLOIS.',
    'Maître Sophie GOSSART, notaire à BLOIS, notaire rédacteur du présent acte.',
    'Acte dressé par Maître Sophie GOSSART, notaire à BLOIS.'
  ]) {
    const notaires = app.detecterNotaires('PROMESSE DE VENTE\n' + clause, 'PROMESSE_DE_VENTE');
    assert.equal(notaires.length, 1, clause);
    assert.equal(notaires[0].roleExplicite, 'instrumentaire', clause);
  }
});

test('« en concours » et « notaire concourant » désignent le second notaire', () => {
  const app = chargerApplication();
  for (const clause of [
    'Maître Paul DURAND, notaire à ORLEANS, notaire concourant.',
    'Intervient en concours Maître Paul DURAND, notaire à ORLEANS.'
  ]) {
    const notaires = app.detecterNotaires('PROMESSE DE VENTE\n' + clause, 'PROMESSE_DE_VENTE');
    assert.equal(notaires[0].roleExplicite, 'participant', clause);
  }
});

test('une clause d’ORIGINE DE PROPRIÉTÉ ne désigne jamais le notaire de l’acte en cours', () => {
  // Faux positif signalé deux fois dans CLAUDE.md, devenu bloquant en acceptant « rédigé par » au
  // passé : cette clause figure dans presque tous les avant-contrats et nomme le notaire de la
  // vente PRÉCÉDENTE, avec la priorité la plus haute s'il n'est pas écarté.
  const app = chargerApplication();
  for (const clause of [
    'Le bien a été acquis suivant acte reçu par Maître Paul DURAND, notaire à ORLEANS, le 12 mars 2010.',
    'Aux termes d’un acte rédigé par Maître Paul DURAND, notaire à ORLEANS, en date du 3 mai 2008.',
    'ORIGINE DE PROPRIETE\nLe bien appartient au vendeur pour l’avoir acquis de Maître Paul DURAND, notaire à ORLEANS.'
  ]) {
    const notaires = app.detecterNotaires('COMPROMIS DE VENTE\n' + clause, 'COMPROMIS_DE_VENTE');
    assert.equal(notaires.length, 1, clause);
    assert.equal(notaires[0].roleExplicite, null, clause);
  }
});

test('l’origine de propriété ne fait plus trancher, on retombe sur la règle de zone', () => {
  // Bout en bout : le notaire de la vente précédente est cité au milieu de l'acte, les deux vrais
  // notaires sont en fin de compromis. C'est ce dernier bloc qui doit décider.
  const app = chargerApplication();
  const texte = 'COMPROMIS DE VENTE\n'
    + 'Le bien a été acquis suivant acte reçu par Maître Jean ANCIEN, notaire à TOURS, le 12 mars 2010.\n'
    + BOURRAGE
    + '\nMaître Sophie GOSSART, notaire à BLOIS, et Maître Paul DURAND, notaire à ORLEANS.';
  const r = app.determinerNotaires(app.detecterNotaires(texte, 'COMPROMIS_DE_VENTE'), null, 'COMPROMIS_DE_VENTE');
  assert.equal(r.instrumentaire.nom, 'Sophie GOSSART');
  assert.equal(r.participant.nom, 'Paul DURAND');
  assert.match(r.raison, /fin de compromis/);
});

// Ce qui décide de l'emplacement des notaires, c'est la FORME de l'acte — précision de l'étude :
// « la promesse synallagmatique est à traiter comme une promesse de vente car acte authentique
// reçu par notaire et pas un acte sous seing privé ». Le nom de l'acte n'est qu'un repli.

test('une PROMESSE SYNALLAGMATIQUE est authentique, donc ses notaires sont en première page', () => {
  // Le cas corrigé : elle reste typée COMPROMIS (les deux parties sont engagées, c'est ce qui
  // décide des rôles), mais sa FORME est authentique — les notaires comparaissent en tête.
  const app = chargerApplication();
  const texte = 'PROMESSE SYNALLAGMATIQUE DE VENTE\n'
    + 'Maître Sophie GOSSART, notaire à BLOIS, et Maître Paul DURAND, notaire à ORLEANS.\n'
    + BOURRAGE;
  assert.equal(app.detecterTypeActe(texte).valeur, 'COMPROMIS_DE_VENTE', 'type inchangé : c’est bien un compromis pour les rôles');
  assert.equal(app.detecterFormeActe(texte), 'authentique');
  assert.equal(app.zoneNotairesPourActe(texte, 'COMPROMIS_DE_VENTE'), 'entete', 'mais la zone suit la forme, pas le type');

  const r = app.determinerNotaires(
    app.detecterNotaires(texte, 'COMPROMIS_DE_VENTE'), null, 'COMPROMIS_DE_VENTE',
    app.zoneNotairesPourActe(texte, 'COMPROMIS_DE_VENTE'));
  assert.equal(r.instrumentaire.nom, 'Sophie GOSSART');
  assert.equal(r.participant.nom, 'Paul DURAND');
});

test('« PAR-DEVANT Maître » ouvre un acte authentique : notaires en première page', () => {
  const app = chargerApplication();
  const texte = 'PAR-DEVANT Maître Sophie GOSSART, notaire à BLOIS, et Maître Paul DURAND, notaire à ORLEANS.\n'
    + BOURRAGE;
  assert.equal(app.detecterFormeActe(texte), 'authentique');
  assert.equal(app.zoneNotairesPourActe(texte, 'COMPROMIS_DE_VENTE'), 'entete');
});

test('un acte déclaré SOUS SEING PRIVÉ nomme ses notaires en fin', () => {
  const app = chargerApplication();
  const texte = 'COMPROMIS DE VENTE sous seing privé\n' + BOURRAGE;
  assert.equal(app.detecterFormeActe(texte), 'sous-seing-prive');
  assert.equal(app.zoneNotairesPourActe(texte, 'COMPROMIS_DE_VENTE'), 'fin');
});

test('l’acte authentique À VENIR ne fait pas passer un compromis pour authentique', () => {
  // Le piège principal : un compromis sous seing privé parle constamment de l'acte authentique
  // qui viendra. Seul l'EN-TÊTE est lu, et « réitéré par acte authentique » n'y est pas un
  // marqueur de forme.
  const app = chargerApplication();
  const texte = 'COMPROMIS DE VENTE\n'
    + 'La vente sera réitérée par acte authentique au plus tard le 31 janvier 2027.\n'
    + BOURRAGE;
  assert.equal(app.detecterFormeActe(texte), null, 'aucune forme déclarée');
  assert.equal(app.zoneNotairesPourActe(texte, 'COMPROMIS_DE_VENTE'), 'fin', 'repli sur le type');
});

test('sans forme déclarée, le type d’acte sert de repli', () => {
  const app = chargerApplication();
  const neutre = 'Entre les soussignés, il a été convenu ce qui suit.\n' + BOURRAGE;
  assert.equal(app.detecterFormeActe(neutre), null);
  assert.equal(app.zoneNotairesPourActe(neutre, 'PROMESSE_DE_VENTE'), 'entete');
  assert.equal(app.zoneNotairesPourActe(neutre, 'COMPROMIS_DE_VENTE'), 'fin');
  assert.equal(app.zoneNotairesPourActe(neutre, 'INCONNU'), null, 'type non tranché : aucune zone, on ne devine pas');
});

// ---- les deux côtés tels qu'ils arrivent sur la fiche dossier ----

test('un acte qui dit qui représente qui remplit les deux côtés', () => {
  const app = chargerApplication();
  const texte = 'PROMESSE DE VENTE\n'
    + 'Maître Sophie GOSSART, notaire à BLOIS, conseil du promettant.\n'
    + 'Maître Paul DURAND, notaire à ORLEANS, notaire du bénéficiaire.\n'
    + BOURRAGE;
  const liste = app.detecterNotaires(texte, 'PROMESSE_DE_VENTE');
  const r = app.determinerNotaires(liste, null, 'PROMESSE_DE_VENTE',
    app.zoneNotairesPourActe(texte, 'PROMESSE_DE_VENTE'));
  const cotes = app.cotesNotairesPourDossier(r);
  assert.match(cotes.vendeur, /Sophie GOSSART/);
  assert.match(cotes.acquereur, /Paul DURAND/);
  // La promesse nomme ses notaires en tête : le premier rédige (ordre confirmé par l'étude).
  assert.equal(cotes.coteInstrumentaire, 'vendeur');
});

test('quand l’acte ne dit pas qui représente qui, aucun côté n’est deviné', () => {
  // Choix explicite de l'étude : les deux noms restent proposés, côté vide, à elle de les
  // affecter — une affectation devinée ferait chercher les pièces du mauvais côté.
  const app = chargerApplication();
  const texte = 'PAR-DEVANT Maître Sophie GOSSART, notaire à BLOIS, et Maître Paul DURAND, notaire à ORLEANS.\n'
    + BOURRAGE;
  const liste = app.detecterNotaires(texte, 'PROMESSE_DE_VENTE');
  const r = app.determinerNotaires(liste, null, 'PROMESSE_DE_VENTE',
    app.zoneNotairesPourActe(texte, 'PROMESSE_DE_VENTE'));
  const cotes = app.cotesNotairesPourDossier(r);
  assert.equal(cotes.vendeur, '');
  assert.equal(cotes.acquereur, '');
  assert.equal(cotes.coteInstrumentaire, null);
  assert.equal(cotes.detectes.map(n => n.nom).join(' | '), 'Maître Sophie GOSSART (BLOIS) | Maître Paul DURAND (ORLEANS)');
  // Le rédacteur garde son rôle même sans côté : c'est ce qui permettra de poser le badge
  // « Reçoit l'acte » dès que l'étude aura affecté ce nom à l'un des deux champs.
  assert.equal(cotes.detectes[0].role, 'instrumentaire');
});

test('aucun notaire détecté ne produit ni champ ni proposition', () => {
  const app = chargerApplication();
  const cotes = app.cotesNotairesPourDossier(app.determinerNotaires([], null, 'COMPROMIS_DE_VENTE'));
  assert.equal(cotes.vendeur, '');
  assert.equal(cotes.detectes.length, 0);
  assert.equal(app.cotesNotairesPourDossier(null).coteInstrumentaire, null);
});

// ---- couplage avec le sélecteur « Rôle du notaire » de la fiche ----

test('le côté de l’étude se lit dans les deux champs de la fiche, quelle que soit la graphie', () => {
  const app = chargerApplication();
  assert.equal(app.coteEtudeDossier({ notaireVendeur: 'Sophie GOSSARD (BLOIS)', notaireAcquereur: 'Paul DURAND (ORLEANS)' }), 'vendeur');
  assert.equal(app.coteEtudeDossier({ notaireVendeur: 'Paul DURAND (ORLEANS)', notaireAcquereur: 'Sophie GOSSART (BLOIS)' }), 'acquereur');
  assert.equal(app.coteEtudeDossier({ notaireVendeur: 'Paul DURAND', notaireAcquereur: 'Jean MARTIN' }), null);
});

test('le rôle de l’étude est DÉDUIT du côté qui reçoit l’acte', () => {
  // Les sélecteurs « Rôle du notaire » et « Acte reçu par » ont été retirés de la fiche (doublon) :
  // le rôle n'est plus un choix séparé, il découle du côté désigné.
  const app = chargerApplication();
  const base = () => ({ notaireVendeur: 'Maître Sophie GOSSART (BLOIS)', notaireAcquereur: 'Maître Paul DURAND (ORLEANS)' });

  const recoit = { ...base(), coteInstrumentaire: 'vendeur', roleNotaire: 'participant' };
  assert.equal(app.deduireRoleNotaireDossier(recoit), true, 'la valeur a changé');
  assert.equal(recoit.roleNotaire, 'instrumentaire');

  const autre = { ...base(), coteInstrumentaire: 'acquereur', roleNotaire: 'instrumentaire' };
  assert.equal(app.deduireRoleNotaireDossier(autre), true);
  assert.equal(autre.roleNotaire, 'participant');
});

test('rien n’est déduit — ni écrasé — quand l’information manque', () => {
  const app = chargerApplication();
  // Personne ne reçoit encore l'acte.
  const sansCote = { notaireVendeur: 'Maître Sophie GOSSART (BLOIS)', notaireAcquereur: 'Maître Paul DURAND (ORLEANS)', coteInstrumentaire: null, roleNotaire: 'participant' };
  assert.equal(app.deduireRoleNotaireDossier(sansCote), false);
  assert.equal(sansCote.roleNotaire, 'participant', 'le choix de l’étude est conservé');

  // Notre étude n'est reconnue dans aucun des deux noms : c'est le cas où la fiche laisse le rôle
  // cliquable (voir basculerRoleEtude) plutôt que de le deviner.
  const sansEtude = { notaireVendeur: 'Maître Paul DURAND', notaireAcquereur: 'Maître Jean MARTIN', coteInstrumentaire: 'vendeur', roleNotaire: 'participant' };
  assert.equal(app.deduireRoleNotaireDossier(sansEtude), false);
  assert.equal(sansEtude.roleNotaire, 'participant');

  // Déjà cohérent : aucune écriture, donc aucune sauvegarde inutile.
  const dejaBon = { notaireVendeur: 'Maître Sophie GOSSART (BLOIS)', notaireAcquereur: 'Maître Paul DURAND (ORLEANS)', coteInstrumentaire: 'vendeur', roleNotaire: 'instrumentaire' };
  assert.equal(app.deduireRoleNotaireDossier(dejaBon), false);
});

test('les notaires sont affichés avec « Maître » devant leur nom', () => {
  const app = chargerApplication();
  assert.equal(app.libelleNotaire({ nom: 'Sophie GOSSART', office: 'BLOIS' }), 'Maître Sophie GOSSART (BLOIS)');
  assert.equal(app.libelleNotaire({ nom: 'Paul DURAND' }), 'Maître Paul DURAND');
  // Jamais doublé sur un nom déjà saisi ainsi à la main.
  assert.equal(app.libelleNotaire({ nom: 'Maître Paul DURAND' }), 'Maître Paul DURAND');
  assert.equal(app.libelleNotaire(null), '');
});

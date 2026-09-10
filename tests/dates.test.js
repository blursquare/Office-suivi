'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('détecte une date numérique JJ/MM/AAAA', () => {
  const app = chargerApplication();
  const iso = app.extraireDateDeFragment('signé le 14/03/2025 à Paris');
  assert.equal(iso, '2025-03-14');
});

test('détecte une date en toutes lettres', () => {
  const app = chargerApplication();
  const iso = app.extraireDateDeFragment('le 3 septembre 2025');
  assert.equal(iso, '2025-09-03');
});

test('détecte une date en toutes lettres au 1er du mois (ordinal)', () => {
  // Régression : "le 1er janvier 2025" n'était jamais reconnu (seul "le 1 janvier 2025",
  // qui ne s'écrit jamais ainsi en français, matchait).
  const app = chargerApplication();
  const iso = app.extraireDateDeFragment('le 1er janvier 2025');
  assert.equal(iso, '2025-01-01');
});

test('detecterDatesDepuisTexte reconnaît une échéance fixée au 1er du mois', () => {
  const app = chargerApplication();
  const texte = "La signature de l'acte authentique aura lieu au plus tard le 1er décembre 2025.";
  const dates = app.detecterDatesDepuisTexte(texte, '');
  assert.equal(dates.length, 1);
  assert.equal(dates[0].iso, '2025-12-01');
});

test('detecterDateCompromis retient la signature la plus récente (signature électronique)', () => {
  const app = chargerApplication();
  const texte = `
    Fait à Paris, le 10 janvier 2025.
    Signé électroniquement le 12 janvier 2025.
  `;
  assert.equal(app.detecterDateCompromis(texte), '2025-01-12');
});

test('detecterDatesDepuisTexte écarte les dates antérieures ou égales au compromis', () => {
  const app = chargerApplication();
  const dateCompromis = '2025-01-12';
  const texte = 'Diagnostic amiante réalisé le 01/01/2025. Condition suspensive de prêt fixée au 15/06/2025.';
  const dates = app.detecterDatesDepuisTexte(texte, dateCompromis);
  assert.ok(dates.every(d => d.iso > dateCompromis));
});

test('detecterDatesDepuisTexte écarte les dates de diagnostics via EXCLUSION_RE', () => {
  const app = chargerApplication();
  const texte = 'Diagnostic de performance énergétique (DPE) réalisé le 15/06/2025.';
  const dates = app.detecterDatesDepuisTexte(texte, '');
  assert.equal(dates.length, 0, `ne devrait détecter aucune date, obtenu: ${JSON.stringify(dates)}`);
});

test('detecterDatesDepuisTexte classe une échéance de prêt', () => {
  const app = chargerApplication();
  const texte = "La condition suspensive d'obtention d'un prêt devra être levée au plus tard le 15/06/2025.";
  const dates = app.detecterDatesDepuisTexte(texte, '');
  assert.equal(dates.length, 1);
  assert.equal(dates[0].suggestion, 'pret');
});

test('detecterDatesDepuisTexte classe une échéance d\'acte authentique', () => {
  const app = chargerApplication();
  const texte = "La signature de l'acte authentique aura lieu au plus tard le 20/09/2025.";
  const dates = app.detecterDatesDepuisTexte(texte, '');
  assert.equal(dates.length, 1);
  assert.equal(dates[0].suggestion, 'acte');
});

test('detecterDatesDepuisTexte classe une échéance de vente préalable', () => {
  const app = chargerApplication();
  const texte = 'Condition suspensive de vente d\'un bien appartenant à l\'acquéreur, au plus tard le 30/11/2025.';
  const dates = app.detecterDatesDepuisTexte(texte, '');
  assert.equal(dates.length, 1);
  assert.equal(dates[0].suggestion, 'ventebien');
});

test('detecterDatesDepuisTexte ignore une clause hypothétique ("si le bien venait à...")', () => {
  const app = chargerApplication();
  // Régression connue (voir CLAUSE_HYPOTHETIQUE_RE dans script.js) : une clause conditionnelle
  // ne doit pas être classée comme une échéance ferme.
  const texte = "Si le bien venait à se trouver en zone contaminée avant le 15/06/2025, le vendeur s'engage à fournir un état parasitaire.";
  const dates = app.detecterDatesDepuisTexte(texte, '');
  assert.equal(dates.some(d => d.suggestion === 'pret' || d.suggestion === 'acte'), false);
});

test('detecterFinancementComptant reconnaît un achat sans recours à un prêt', () => {
  const app = chargerApplication();
  assert.equal(app.detecterFinancementComptant("L'acquéreur ne recourt pas à un prêt pour financer cette acquisition."), true);
});

test('detecterFinancementComptant ignore le faux ami "paiement comptant" (règlement du solde)', () => {
  const app = chargerApplication();
  // Piège documenté dans script.js : "paiement comptant" désigne presque toujours le règlement du
  // solde du prix à la signature, pas l'absence de prêt.
  assert.equal(app.detecterFinancementComptant('Le prix sera payé comptant le jour de la signature.'), false);
});

test('detecterDateCompromis reconnaît un bloc de signature électronique par partie (Yousign/DocuSign), sans le mot "compromis" ni "promesse"', () => {
  // Régression : une promesse LD Notaires de 52 pages n'était reconnue par aucun des motifs
  // existants ("compromis", "signé électroniquement"...) — son bloc de signature nomme chaque
  // partie séparément ("Mme X a signé à BLOIS le ..."). dateCompromis restait alors vide, ce qui
  // désactivait le filtre "écarte tout ce qui est antérieur à la signature" pour toute la suite de
  // l'extraction (voir le test suivant).
  const app = chargerApplication();
  const texte = `
    Mme MOKADEM Imane a signé à BLOIS le 22 juillet 2026
    Mme DE SOUSA MARTINS Jennifer a signé à BLOIS le 22 juillet 2026
    et le notaire Me DENIS LAURA a signé à BLOIS
  `;
  assert.equal(app.detecterDateCompromis(texte), '2026-07-22');
});

test('detecterDatesDepuisTexte écarte une date de citation de loi malgré un vocabulaire de prêt à proximité', () => {
  // Régression réelle : "Un extrait ... en vertu de la loi numéro 2022-270 du 28 février 2022"
  // (clause d'information sur l'assurance emprunteur) était classée "pret" à cause des mots
  // "prêteur"/"emprunteur" dans la même phrase, et remontait avant la vraie échéance (2026-09-30)
  // une fois les dates triées par ordre chronologique — le champ "Obtention du prêt" se retrouvait
  // rempli avec 2022-02-28 au lieu de la vraie date limite de l'offre de prêt.
  const app = chargerApplication();
  const texte = "Elle peut être souscrite auprès de l'établissement prêteur ou d'un organisme " +
    "d'assurance externe qu'il aura choisi en vertu de la loi numéro 2022-270 du 28 février 2022. " +
    "La condition suspensive sera réalisée en cas d'obtention par le BENEFICIAIRE d'une offre " +
    "écrite de prêt aux conditions sus-indiquées au plus tard le 30 septembre 2026.";
  const dates = app.detecterDatesDepuisTexte(texte, '');
  const pret = dates.filter(d => d.suggestion === 'pret');
  assert.equal(pret.length, 1, `une seule échéance "pret" attendue, obtenu: ${JSON.stringify(pret)}`);
  assert.equal(pret[0].iso, '2026-09-30');
});

test('meilleureCandidateEcheance retient la seule candidate portant une formulation de délai', () => {
  // Cas réel : sans EXCLUSION_RE pour les citations de loi, les deux dates cohabitent encore parmi
  // les candidates "pret" — meilleureCandidateEcheance doit à elle seule écarter la mauvaise grâce
  // à "au plus tard le", présent seulement sur la vraie échéance.
  const app = chargerApplication();
  const detectedDates = [
    { iso: '2022-02-28', suggestion: 'pret', contexte: "en vertu de la loi numéro 2022-270 du 28 février 2022, sur l'assurance emprunteur" },
    { iso: '2026-09-30', suggestion: 'pret', contexte: "offre écrite de prêt aux conditions sus-indiquées au plus tard le 30 septembre 2026" }
  ];
  const { candidat, ambigu } = app.meilleureCandidateEcheance(detectedDates, 'pret');
  assert.equal(candidat.iso, '2026-09-30');
  assert.equal(ambigu, false);
});

test('meilleureCandidateEcheance signale une ambiguïté quand aucune formulation de délai ne permet de trancher', () => {
  const app = chargerApplication();
  const detectedDates = [
    { iso: '2025-05-01', suggestion: 'pret', contexte: "la banque prêteuse a précisé le 1 mai 2025 les conditions du prêt envisagé" },
    { iso: '2025-06-15', suggestion: 'pret', contexte: "le prêt sollicité auprès de l'organisme prêteur porte sur ce montant depuis le 15 juin 2025" }
  ];
  const { candidat, ambigu } = app.meilleureCandidateEcheance(detectedDates, 'pret');
  assert.equal(candidat.iso, '2025-05-01', 'garde le premier candidat par défaut, faute de mieux');
  assert.equal(ambigu, true);
});

test('meilleureCandidateEcheance ne signale pas d\'ambiguïté avec une seule candidate', () => {
  const app = chargerApplication();
  const detectedDates = [{ iso: '2025-06-15', suggestion: 'acte', contexte: "signature de l'acte authentique le 15 juin 2025" }];
  const { candidat, ambigu } = app.meilleureCandidateEcheance(detectedDates, 'acte');
  assert.equal(candidat.iso, '2025-06-15');
  assert.equal(ambigu, false);
});

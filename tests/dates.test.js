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

test('detecterTypeVenteCopropriete reconnaît les marqueurs juridiques d\'une vente de lot', () => {
  const app = chargerApplication();
  assert.equal(app.detecterTypeVenteCopropriete("Le bien vendu constitue le lot de copropriété numéro 12."), true);
  assert.equal(app.detecterTypeVenteCopropriete("Le syndicat des copropriétaires a été informé de la vente."), true);
  assert.equal(app.detecterTypeVenteCopropriete("Bien soumis au statut de la copropriété (loi du 10 juillet 1965)."), true);
});

test('detecterTypeVenteCopropriete ne se déclenche pas pour une maison individuelle', () => {
  const app = chargerApplication();
  assert.equal(app.detecterTypeVenteCopropriete("Une maison individuelle avec jardin, sise à Blois."), false);
});

test('detecterTypeVenteCopropriete reconnaît "soumis au régime de la copropriété"', () => {
  // Régression : formulation la plus courante dans les faits (juste avant la mention du lot sous
  // le tableau parcellaire), pas encore reconnue avant ce correctif — un vrai dossier de
  // copropriété restait classé "maison" par défaut.
  const app = chargerApplication();
  const texte = "L'immeuble est soumis au régime de la copropriété. LOT NUMÉRO 5 : Un appartement...";
  assert.equal(app.detecterTypeVenteCopropriete(texte), true);
});

test('detecterTypeVenteCopropriete ignore une clause qui écarte explicitement ce statut', () => {
  // Régression : une vraie maison individuelle ressortait classée "copropriété" — la désignation
  // comportait la clause standard « Le bien vendu n'est pas soumis au statut de la copropriété »,
  // ajoutée précisément pour lever toute ambiguïté sur une maison, mais qui contient elle-même le
  // motif recherché (statut/régime de la copropriété), déclenchant à tort la détection.
  const app = chargerApplication();
  assert.equal(app.detecterTypeVenteCopropriete(
    "Le bien vendu est une maison d'habitation. Il n'est pas soumis au statut de la copropriété."
  ), false);
  assert.equal(app.detecterTypeVenteCopropriete(
    "Le bien, une maison individuelle, ne relève pas du régime de la copropriété."
  ), false);
});

test('detecterTypeVenteCopropriete reste vrai si une seconde mention, non niée, confirme la copropriété', () => {
  // La négation ne doit écarter que l'occurrence qu'elle précède réellement — si le même texte
  // contient par ailleurs une vraie mention positive (lot, syndicat...), la détection doit rester
  // positive.
  const app = chargerApplication();
  const texte = "Ce lotissement n'est pas soumis au statut de la copropriété au sens de la loi de 1965 " +
    "pour ses espaces verts, mais le bien vendu constitue le lot de copropriété numéro 3 de la résidence.";
  assert.equal(app.detecterTypeVenteCopropriete(texte), true);
});

test('detecterEmailAcquereur trouve l\'email au voisinage de la mention du rôle', () => {
  const app = chargerApplication();
  const texte = "Le VENDEUR : Monsieur Jean DUPONT, email jean.dupont@vendeur.fr. " +
    "L'ACQUEREUR : Madame Alice MARTIN, joignable à alice.martin@exemple.fr pour toute question.";
  assert.equal(app.detecterEmailAcquereur(texte), 'alice.martin@exemple.fr');
});

test('detecterEmailAcquereur renvoie null si aucun email n\'est proche d\'une mention du rôle', () => {
  const app = chargerApplication();
  const texte = "L'ACQUEREUR, Madame Alice MARTIN, née le 2 février 1985 à Lyon, ci-après dénommée.";
  assert.equal(app.detecterEmailAcquereur(texte), null);
});

test('detecterAdresseBien reconnaît une désignation "sis à ... (code postal)"', () => {
  const app = chargerApplication();
  const texte = "Un ensemble immobilier sis à ORLEANS (45000), 12 rue de la République.";
  assert.equal(app.detecterAdresseBien(texte), 'ORLEANS (45000), 12 rue de la République');
});

test('detecterAdresseBien reconnaît "située dans la commune de"', () => {
  const app = chargerApplication();
  const texte = "Une maison d'habitation située dans la commune de BLOIS (41000), 5 avenue du Maréchal Foch.";
  assert.equal(app.detecterAdresseBien(texte), 'BLOIS (41000), 5 avenue du Maréchal Foch');
});

test('detecterAdresseBien renvoie null sans code postal à proximité', () => {
  const app = chargerApplication();
  assert.equal(app.detecterAdresseBien("Un bien sis à Orléans, dont la désignation suit."), null);
});

test('detecterPrixVente lit le montant chiffré entre parenthèses après "prix"', () => {
  const app = chargerApplication();
  const texte = "La vente est consentie moyennant le prix principal de CENT MILLE EUROS (100 000 €).";
  assert.equal(app.detecterPrixVente(texte), 100000);
});

test('detecterPrixVente gère les centimes en décimale et le prix de vente explicite', () => {
  const app = chargerApplication();
  const texte = "Le prix de vente s'élève à la somme de DEUX CENT CINQUANTE MILLE EUROS (250 000,00 €).";
  assert.equal(app.detecterPrixVente(texte), 250000);
});

test('detecterPrixVente renvoie null sans montant entre parenthèses proche de "prix"', () => {
  const app = chargerApplication();
  assert.equal(app.detecterPrixVente("Le prix sera versé le jour de la signature de l'acte authentique."), null);
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

test('detecterDateCompromis ne backtracke pas à travers une phrase entière jusqu\'au "le" suivant', () => {
  // Régression découverte en ajoutant la détection de délais relatifs : [^,\n] (sans exclure le
  // point) dans le groupe "à ..." du motif "a signé à ... le" laissait le moteur de regex, faute de
  // trouver un "le" valide assez vite, backtracker à travers toute la phrase suivante pour aller
  // choper un "le" plus loin — ici jusque dans "Le vendeur s'engage à produire ce document", pris
  // à tort pour la date de signature. Pire qu'une non-détection : une date de signature fausse
  // désactive silencieusement le filtre anti-dates-antérieures pour tout le reste de l'extraction.
  const app = chargerApplication();
  const texte = "Mme X a signé à BLOIS le 22 juillet 2026. " +
    "Le vendeur s'engage à produire ce document dans un délai de 30 jours à compter de la signature.";
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

test('detecterDatesDepuisTexte résout une date arrondie en fin de mois ("fin septembre 2026")', () => {
  const app = chargerApplication();
  const texte = "La condition suspensive d'obtention du prêt devra être réalisée avant fin septembre 2026.";
  const dates = app.detecterDatesDepuisTexte(texte, '');
  assert.equal(dates.length, 1);
  assert.equal(dates[0].iso, '2026-09-30');
  assert.equal(dates[0].approx, true);
  assert.equal(dates[0].suggestion, 'pret');
});

test('detecterDatesDepuisTexte résout "fin février" sur une année bissextile au 29', () => {
  const app = chargerApplication();
  const dates = app.detecterDatesDepuisTexte('Travaux à réaliser avant fin février 2028.', '');
  assert.equal(dates.length, 1);
  assert.equal(dates[0].iso, '2028-02-29');
});

test('detecterDatesDepuisTexte résout un délai relatif à la signature ("délai de 30 jours à compter de la signature")', () => {
  const app = chargerApplication();
  const dateCompromis = '2026-07-22';
  // Reproduit l'arithmétique en heure locale d'addDays() dans script.js : passer par toISOString()
  // (UTC) déraillerait selon le fuseau horaire de la machine qui exécute les tests.
  const attendu = new Date(2026, 6, 22);
  attendu.setDate(attendu.getDate() + 30);
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoAttendu = `${attendu.getFullYear()}-${pad2(attendu.getMonth() + 1)}-${pad2(attendu.getDate())}`;

  const texte = "Le vendeur s'engage à produire ce document dans un délai de 30 jours à compter de la signature.";
  const dates = app.detecterDatesDepuisTexte(texte, dateCompromis);
  assert.equal(dates.length, 1);
  assert.equal(dates[0].iso, isoAttendu);
  assert.equal(dates[0].approx, true);
});

test('detecterDatesDepuisTexte résout un délai écrit en notation "J+30"', () => {
  const app = chargerApplication();
  const dateCompromis = '2026-07-22';
  // Reproduit l'arithmétique en heure locale d'addDays() dans script.js : passer par toISOString()
  // (UTC) déraillerait selon le fuseau horaire de la machine qui exécute les tests.
  const attendu = new Date(2026, 6, 22);
  attendu.setDate(attendu.getDate() + 30);
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoAttendu = `${attendu.getFullYear()}-${pad2(attendu.getMonth() + 1)}-${pad2(attendu.getDate())}`;

  const dates = app.detecterDatesDepuisTexte('Offre de prêt attendue à J+30.', dateCompromis);
  assert.equal(dates.length, 1);
  assert.equal(dates[0].iso, isoAttendu);
  assert.equal(dates[0].approx, true);
});

test('detecterDatesDepuisTexte n\'invente pas de délai relatif sans date de signature connue', () => {
  // Sans ancre fiable (dateCompromis vide), on ne devine pas à partir de quoi compter le délai.
  const app = chargerApplication();
  const dates = app.detecterDatesDepuisTexte("Ce document sera fourni dans un délai de 30 jours à compter de la signature.", '');
  assert.equal(dates.length, 0);
});

test('detecterDatesDepuisTexte résout "au plus tard dans les N jours" (condition suspensive de prêt sans date calendaire, sans ancre explicite)', () => {
  // Texte réel (boilerplate, anonymisé de fait — clause type sans nom de partie) fourni par
  // l'étude : contrairement à reDelai (« délai de N jours à compter de... »), cette formulation
  // ne porte aucune ancre explicite — elle compte implicitement depuis la signature de la
  // promesse elle-même (« la présente convention... »), voir CLAUDE.md.
  const app = chargerApplication();
  const dateCompromis = '2026-07-08';
  const texte = "Conformément aux dispositions des articles L.313-1 et suivants du Code de la " +
    "consommation, la présente convention est soumise à la condition suspensive d'obtention de " +
    "ces prêts, aux conditions ci-dessus, au plus tard dans les 60 jours, et selon les modalités " +
    "ci-après définies, faute de quoi la condition suspensive sera considérée comme non réalisée.";
  const dates = app.detecterDatesDepuisTexte(texte, dateCompromis);
  assert.equal(dates.length, 1);
  assert.equal(dates[0].iso, '2026-09-06'); // 8 juillet + 60 jours
  assert.equal(dates[0].suggestion, 'pret');
  assert.equal(dates[0].approx, true);
});

test('detecterDatesDepuisTexte écarte le délai de notification (70 jours) et ne garde que celui de la condition de prêt (60 jours)', () => {
  // Reproduit le cas réel complet : la même promesse porte deux délais en "au plus tard dans les
  // N jours" (l'un la condition de prêt elle-même, l'autre la notification du refus/de l'offre au
  // notaire). Signalé par l'étude : le second n'est pas une vraie candidate concurrente, il ne
  // doit même pas être détecté (voir le garde-fou "notifier"/"notification" dans le code).
  const app = chargerApplication();
  const dateCompromis = '2026-07-08';
  const texte = "la présente convention est soumise à la condition suspensive d'obtention de ces " +
    "prêts, aux conditions ci-dessus, au plus tard dans les 60 jours, et selon les modalités. " +
    "Il s'oblige également à notifier audit notaire, au plus tard dans les 70 jours, les offres " +
    "à lui faites ou le refus opposé aux demandes de prêt.";
  const dates = app.detecterDatesDepuisTexte(texte, dateCompromis);
  assert.equal(dates.length, 1);
  assert.equal(dates[0].iso, '2026-09-06'); // 60 jours, pas 70
  assert.equal(dates[0].suggestion, 'pret');
});

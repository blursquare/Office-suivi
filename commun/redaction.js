// @ts-check
'use strict';
// Aide à la rédaction de l'acte (étude 12/10 : « une fenêtre qui détecterait dans notre document Word à quelle clause nous
// sommes et nous proposerait, en fonction du dossier, la bonne donnée à remplir — date des diagnostics, nom du diagnostiqueur,
// date du certificat d'urbanisme, date de l'avant-contrat… tout cela à partir des pièces du commun »). La trame d'Authentic
// marque chaque blanc par « --- » ; elle « change parfois un peu » : la clause est d'abord reconnue ici, par son intitulé et
// ses mots (sans IA), et une IA ne fait que désigner, pour une trame inconnue, QUEL champ de la liste fermée va dans chaque
// « --- » — jamais une valeur, qui reste calculée par le poste.
// Code COMMUN (poste et serveur) : le catalogue des champs sert aussi au prompt du serveur. Fonctions pures, testées.
/** @param {object} C — les autres fichiers de commun/ dont celui-ci dépend */
(function (C) {
  // Les données qu'un acte de vente demande (clé stable, libellé dit à l'utilisateur et à l'IA, groupe d'affichage).
  /** @type {Array<{ cle: string, libelle: string, groupe: string }>} */
  var CHAMPS_ACTE = [
    { cle: 'date_signature', libelle: 'Date de la signature (en lettres)', groupe: 'Acte' },
    { cle: 'date_signature_chiffres', libelle: 'Date de la signature', groupe: 'Acte' },
    { cle: 'prix_lettres', libelle: 'Prix en lettres', groupe: 'Prix' },
    { cle: 'prix_chiffres', libelle: 'Prix en chiffres', groupe: 'Prix' },
    { cle: 'mobilier_chiffres', libelle: 'Prix du mobilier', groupe: 'Prix' },
    { cle: 'base_imposition', libelle: 'Base d’imposition (prix hors mobilier)', groupe: 'Prix' },
    { cle: 'pret_montant', libelle: 'Montant du prêt', groupe: 'Financement' },
    { cle: 'pret_banque', libelle: 'Banque qui consent le prêt', groupe: 'Financement' },
    { cle: 'pret_offre_date', libelle: 'Date de l’offre de prêt', groupe: 'Financement' },
    { cle: 'pret_acceptation_date', libelle: 'Date d’acceptation de l’offre', groupe: 'Financement' },
    { cle: 'avant_contrat_date', libelle: 'Date de l’avant-contrat', groupe: 'Avant-contrat' },
    { cle: 'avant_contrat_notaire', libelle: 'Notaire qui a reçu l’avant-contrat', groupe: 'Avant-contrat' },
    { cle: 'avant_contrat_notaire_ville', libelle: 'Ville du notaire de l’avant-contrat', groupe: 'Avant-contrat' },
    { cle: 'avant_contrat_notification_date', libelle: 'Date de notification de l’avant-contrat (SRU)', groupe: 'Avant-contrat' },
    { cle: 'cu_numero', libelle: 'Numéro du certificat d’urbanisme', groupe: 'Urbanisme' },
    { cle: 'cu_date', libelle: 'Date du certificat d’urbanisme', groupe: 'Urbanisme' },
    { cle: 'h1_date', libelle: 'Date de la déclaration H1', groupe: 'Urbanisme' },
    { cle: 'alignement_date', libelle: 'Date de l’arrêté d’alignement', groupe: 'Urbanisme' },
    { cle: 'numerotage_date', libelle: 'Date du certificat de numérotage', groupe: 'Urbanisme' },
    { cle: 'commune', libelle: 'Commune du bien', groupe: 'Urbanisme' },
    { cle: 'numero_voie', libelle: 'Numéro dans la voie', groupe: 'Urbanisme' },
    { cle: 'dia_envoi_date', libelle: 'Date d’envoi de la DIA', groupe: 'Préemption' },
    { cle: 'dia_presentation_date', libelle: 'Date de première présentation de la DIA', groupe: 'Préemption' },
    { cle: 'dia_renonciation_date', libelle: 'Date de la renonciation à préempter', groupe: 'Préemption' },
    { cle: 'diag_societe', libelle: 'Société de diagnostic', groupe: 'Diagnostics' },
    { cle: 'diag_operateur', libelle: 'Diagnostiqueur (nom)', groupe: 'Diagnostics' },
    { cle: 'diag_certification', libelle: 'Certification du diagnostiqueur', groupe: 'Diagnostics' },
    { cle: 'amiante_date', libelle: 'Date du repérage amiante', groupe: 'Diagnostics' },
    { cle: 'amiante_conclusion', libelle: 'Conclusion amiante', groupe: 'Diagnostics' },
    { cle: 'plomb_date', libelle: 'Date du constat plomb (CREP)', groupe: 'Diagnostics' },
    { cle: 'termites_date', libelle: 'Date de l’état termites', groupe: 'Diagnostics' },
    { cle: 'gaz_date', libelle: 'Date de l’état du gaz', groupe: 'Diagnostics' },
    { cle: 'gaz_conclusion', libelle: 'Conclusion gaz', groupe: 'Diagnostics' },
    { cle: 'electricite_date', libelle: 'Date de l’état de l’électricité', groupe: 'Diagnostics' },
    { cle: 'electricite_conclusion', libelle: 'Conclusion électricité', groupe: 'Diagnostics' },
    { cle: 'dpe_date', libelle: 'Date du DPE', groupe: 'Diagnostics' },
    { cle: 'dpe_numero', libelle: 'Numéro ADEME du DPE', groupe: 'Diagnostics' },
    { cle: 'dpe_classe_energie', libelle: 'Classe énergie du DPE', groupe: 'Diagnostics' },
    { cle: 'dpe_classe_ges', libelle: 'Classe GES du DPE', groupe: 'Diagnostics' },
    { cle: 'erp_date', libelle: 'Date de l’état des risques', groupe: 'Diagnostics' },
    { cle: 'carrez_surface', libelle: 'Superficie loi Carrez', groupe: 'Diagnostics' },
    { cle: 'etat_hypothecaire_date', libelle: 'Date de l’état hypothécaire', groupe: 'Divers' },
    { cle: 'casier_date', libelle: 'Date de réception du casier judiciaire', groupe: 'Divers' },
    { cle: 'casier_numero', libelle: 'Numéro du casier judiciaire', groupe: 'Divers' },
    { cle: 'honoraires_chiffres', libelle: 'Honoraires d’agence TTC', groupe: 'Agence' },
    { cle: 'honoraires_debiteur', libelle: 'Qui paie les honoraires', groupe: 'Agence' },
    { cle: 'agence_nom', libelle: 'Agence', groupe: 'Agence' },
    { cle: 'email_vendeur', libelle: 'Email du vendeur', groupe: 'Parties' },
    { cle: 'email_acquereur', libelle: 'Email de l’acquéreur', groupe: 'Parties' },
    { cle: 'tf_montant', libelle: 'Taxe foncière de l’année', groupe: 'Taxe foncière' },
    { cle: 'tf_jours', libelle: 'Jours à la charge de l’acquéreur', groupe: 'Taxe foncière' }
  ];

  // Les clauses de la trame (modèle d'acte de vente de l'étude, 12/10) : intitulé reconnu (au début du passage ou de la ligne
  // de titre), mots qui la confirment, et le champ de chaque « --- » dans l'ordre. Un « --- » qui n'est pas un blanc (une ligne
  // « --- OPTION 1 », « --- AJOUTER LE CAS ECHEANT ») est ignoré par `trousDuPassage`.
  /** @type {Array<{ cle: string, libelle: string, motifs: RegExp[], champs: string[] }>} */
  var CLAUSES_ACTE = [
    { cle: 'date_acte', libelle: 'Date de l’acte', motifs: [/l.an deux mille/i], champs: ['date_signature'] },
    { cle: 'origine_deniers', libelle: 'Déclaration d’origine des deniers', motifs: [/origine des deniers/i, /pr[eê]t d.un montant de/i],
      champs: ['pret_montant', 'pret_banque', 'pret_offre_date', 'pret_acceptation_date'] },
    { cle: 'base_imposition', libelle: 'Base d’imposition', motifs: [/base d.imposition/i, /pour le calcul des droits/i],
      champs: ['prix_chiffres', '', 'mobilier_chiffres', 'base_imposition'] },
    { cle: 'csi', libelle: 'Contribution de sécurité immobilière', motifs: [/contribution de s[ée]curit[ée] immobili[èe]re/i, /montant de la csi/i], champs: ['base_imposition', 'base_imposition'] },
    { cle: 'certificat_urbanisme', libelle: 'Certificat d’urbanisme', motifs: [/certificat d.urbanisme num[ée]ro/i, /certificat d.urbanisme/i], champs: ['cu_numero', 'cu_date'] },
    { cle: 'declaration_h1', libelle: 'Déclaration H1', motifs: [/d[ée]claration H1/i], champs: ['h1_date'] },
    { cle: 'alignement', libelle: 'Certificat d’alignement', motifs: [/arr[êe]t[ée] individuel d.alignement/i, /certificat d.alignement/i], champs: ['alignement_date'] },
    { cle: 'numerotage', libelle: 'Certificat de numérotage', motifs: [/num[ée]rotage/i, /portait le num[ée]ro/i], champs: ['numerotage_date', 'commune', 'numero_voie'] },
    { cle: 'dpu', libelle: 'Droit de préemption urbain', motifs: [/d[ée]claration d.intention d.ali[ée]ner/i, /droit de pr[ée]emption urbain/i, /renoncer [àa] son droit/i],
      champs: ['dia_envoi_date', 'dia_presentation_date', 'dia_renonciation_date'] },
    { cle: 'gaz', libelle: 'État de l’installation de gaz', motifs: [/installation int[ée]rieure de gaz/i], champs: ['gaz_date', 'diag_societe', 'gaz_conclusion'] },
    { cle: 'electricite', libelle: 'État de l’installation d’électricité', motifs: [/installation int[ée]rieure d.[ée]lectricit[ée]/i], champs: ['electricite_date', 'diag_societe', 'electricite_conclusion'] },
    { cle: 'dpe', libelle: 'Diagnostic de performance énergétique', motifs: [/performance [ée]nerg[ée]tique/i, /\bD\.?P\.?E\b/], champs: ['dpe_date', 'diag_societe', 'dpe_numero'] },
    { cle: 'erp', libelle: 'État des risques et pollutions', motifs: [/[ée]tat des risques et pollutions/i, /dossier communal d.informations/i], champs: ['erp_date'] },
    { cle: 'amiante', libelle: 'Amiante', motifs: [/amiante/i], champs: ['amiante_date', 'diag_societe'] },
    { cle: 'etat_hypothecaire', libelle: 'Situation hypothécaire', motifs: [/[ée]tat hypoth[ée]caire/i], champs: ['etat_hypothecaire_date'] },
    { cle: 'honoraires', libelle: 'Honoraires d’agence', motifs: [/honoraires de n[ée]gociation/i, /carte professionnelle/i],
      champs: ['honoraires_chiffres', 'honoraires_debiteur', 'agence_nom'] },
    { cle: 'casier', libelle: 'Casier judiciaire (L.551-1)', motifs: [/casier judiciaire/i, /L\.?\s?551-1/i], champs: ['casier_date', 'casier_numero'] },
    { cle: 'sru', libelle: 'Avant-contrat et délai de rétractation (L.271-1)', motifs: [/promesse de vente re[çc]ue/i, /L\.?\s?271-1/i, /d[ée]lai de r[ée]tractation/i],
      champs: ['avant_contrat_notaire', 'avant_contrat_notaire_ville', 'avant_contrat_date', 'avant_contrat_notification_date'] },
    { cle: 'taxe_fonciere', libelle: 'Taxe foncière (prorata)', motifs: [/jours\s*\/\s*36[56]\s*jours/i, /taxes? fonci[èe]res?/i], champs: ['tf_montant', 'tf_jours'] },
    { cle: 'emails', libelle: 'Transmission par courrier électronique', motifs: [/courrier [ée]lectronique/i, /adresses? (?:e-?mails?|suivantes)/i], champs: [] }
  ];

  // Pure : les blancs « --- » d'un passage, dans l'ordre — jamais une ligne de consigne (« --- OPTION 1 », « --- A SUPPRIMER… »,
  // « --- CHOISIR … ») ni un « --- » en tête de ligne suivi de capitales.
  /** @param {string} texte @returns {Array<{ index: number }>} */
  function trousDuPassage(texte) {
    const t = String(texte || '');
    const trous = [];
    const re = /-{3,}/g;
    let m;
    while ((m = re.exec(t))) {
      const apres = t.slice(m.index + m[0].length, m.index + m[0].length + 40);
      if (/^\s*(?:OPTION|A\s+SUPPRIMER|AJOUTER|CHOISIR|MERCI|SUPPRIMER)\b/.test(apres)) continue;
      trous.push({ index: m.index });
    }
    return trous;
  }

  // Pure : la clause du passage (la mieux confirmée par ses mots), ou null. Les intitulés en capitales de la trame comptent
  // double. `email` : la ligne « Madame X : --- » d'un passage d'adresses.
  /** @param {string} texte */
  function clauseDuPassage(texte) {
    const t = String(texte || '');
    let meilleure = null;
    let score = 0;
    for (const c of CLAUSES_ACTE) {
      const s = c.motifs.reduce((n, re, i) => n + (re.test(t) ? (i === 0 ? 2 : 1) : 0), 0);
      if (s > score) { score = s; meilleure = c; }
    }
    return meilleure;
  }

  // Pure : le champ de chaque blanc d'après la clause reconnue (catalogue) ; pour la clause des emails, le côté de la personne
  // nommée devant le blanc. Rend [{ index, champ }] ; un champ '' = inconnu (l'IA peut le désigner).
  /** @param {string} texte @param {{ vendeurs?: string[], acquereurs?: string[] }} [noms] */
  function champsDuPassage(texte, noms) {
    const trous = trousDuPassage(texte);
    const clause = clauseDuPassage(texte);
    const t = String(texte || '');
    return {
      clause: clause ? clause.cle : '', libelle: clause ? clause.libelle : '',
      trous: trous.map((tr, i) => {
        if (clause && clause.cle === 'emails') {
          const ligne = t.slice(Math.max(0, t.lastIndexOf('\n', tr.index) + 1), tr.index);
          const n = (s) => String(s || '').toUpperCase();
          const vend = (noms && noms.vendeurs || []).some((x) => x && n(ligne).includes(n(x)));
          const acq = (noms && noms.acquereurs || []).some((x) => x && n(ligne).includes(n(x)));
          return { index: tr.index, champ: vend && !acq ? 'email_vendeur' : acq && !vend ? 'email_acquereur' : '' };
        }
        return { index: tr.index, champ: clause && clause.champs.length === trous.length ? (clause.champs[i] || '') : (clause && i < clause.champs.length ? clause.champs[i] : '') };
      })
    };
  }

  // ---- Nombres, montants et dates en lettres (forme des actes : « CENT SOIXANTE-QUINZE MILLE EUROS ») ----

  var UNITES_FR = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize',
    'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  var DIZAINES_FR = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  /** @param {number} n 0..99 @param {boolean} fin le nombre se termine ici (« quatre-vingts ») */
  function moinsDeCent(n, fin) {
    if (n < 20) return UNITES_FR[n];
    const d = Math.floor(n / 10), u = n % 10;
    if (d === 7 || d === 9) return DIZAINES_FR[d] + (u === 1 && d === 7 ? ' et ' : '-') + UNITES_FR[10 + u];
    if (u === 0) return DIZAINES_FR[d] + (d === 8 && fin ? 's' : '');
    if (u === 1 && d !== 8) return DIZAINES_FR[d] + ' et un';
    return DIZAINES_FR[d] + '-' + UNITES_FR[u];
  }

  /** @param {number} n 0..999 @param {boolean} fin */
  function moinsDeMille(n, fin) {
    const c = Math.floor(n / 100), r = n % 100;
    const centaine = c === 0 ? '' : c === 1 ? 'cent' : UNITES_FR[c] + ' cent' + (r === 0 && fin ? 's' : '');
    return [centaine, r ? moinsDeCent(r, fin) : ''].filter(Boolean).join(' ');
  }

  // Pure : un entier en toutes lettres (orthographe traditionnelle des actes : traits d'union sous cent seulement).
  /** @param {number} n */
  function nombreEnLettres(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n === 0) return 'zéro';
    const millions = Math.floor(n / 1e6), milliers = Math.floor((n % 1e6) / 1000), reste = n % 1000;
    const parts = [];
    if (millions) parts.push((millions === 1 ? 'un' : moinsDeMille(millions, false)) + ' million' + (millions > 1 ? 's' : ''));
    if (milliers) parts.push(milliers === 1 ? 'mille' : moinsDeMille(milliers, false) + ' mille');
    if (reste) parts.push(moinsDeMille(reste, true));
    return parts.join(' ');
  }

  // Pure : « CENT SOIXANTE-QUINZE MILLE EUROS (175.000,00 €) » ; centimes en lettres s'il y en a.
  /** @param {number} montant */
  function montantEnLettresActe(montant) {
    const m = Math.round((Number(montant) || 0) * 100) / 100;
    const euros = Math.floor(m), centimes = Math.round((m - euros) * 100);
    const lettres = nombreEnLettres(euros).toUpperCase() + ' EURO' + (euros > 1 ? 'S' : '')
      + (centimes ? ' ET ' + nombreEnLettres(centimes).toUpperCase() + ' CENTIME' + (centimes > 1 ? 'S' : '') : '');
    return `${lettres} (${C.formaterPrixCentimes ? C.formaterPrixCentimes(m) : m})`;
  }

  var MOIS_ACTE = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  // Pure : « 18 mai 2026 » (jour sur deux chiffres, comme la trame : « le 07 septembre 2026 »). Accepte AAAA-MM-JJ ou JJ/MM/AAAA.
  /** @param {string} date */
  function dateActe(date) {
    const s = String(date || '');
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    let j, mo, a;
    if (m) { a = m[1]; mo = Number(m[2]); j = m[3]; } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim()))) { j = m[1].padStart(2, '0'); mo = Number(m[2]); a = m[3]; } else return '';
    if (!(mo >= 1 && mo <= 12)) return '';
    return `${j} ${MOIS_ACTE[mo - 1]} ${a}`;
  }

  // Pure : « DIX-HUIT MAI » — le jour et le mois en lettres, pour « L'AN DEUX MILLE VINGT-SIX, Le … ».
  /** @param {string} iso */
  function jourMoisEnLettres(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    const j = Number(m[3]);
    return ((j === 1 ? 'premier' : nombreEnLettres(j)) + ' ' + MOIS_ACTE[Number(m[2]) - 1]).toUpperCase();
  }

  // ---- Rapport de diagnostic technique (dossier de diagnostic technique, DDT) ----
  // Lu sur un rapport réel (logiciel LICIEL, 12/10) : une page de synthèse « Résumé de l'expertise », puis chaque diagnostic
  // avec « Rapport du : JJ/MM/AAAA » ou « Etabli le : » en tête, le diagnostiqueur, sa certification et la société. Le texte de
  // pdf.js sépare les tirets (« DIAG - IMMO », « TC21 - 0119 ») : ils sont recollés.

  var TYPES_DIAGNOSTIC = [
    { cle: 'amiante', re: /rep[ée]rage\s+(?:des\s+mat[ée]riaux\s+et\s+produits\s+contenant\s+de\s+l.)?amiante|constat\s+de\s+rep[ée]rage\s+amiante/i },
    { cle: 'electricite', re: /[ée]tat\s+de\s+l.\s*installation\s+int[ée]rieure\s+d.\s*[ée]lectricit[ée]/i },
    { cle: 'gaz', re: /[ée]tat\s+de\s+l.\s*installation\s+int[ée]rieure\s+(?:de\s+)?gaz/i },
    { cle: 'plomb', re: /constat\s+de\s+risque\s+d.exposition\s+au\s+plomb|\bCREP\b/i },
    { cle: 'termites', re: /[ée]tat\s+(?:du\s+b[âa]timent\s+)?relatif\s+[àa]\s+la\s+pr[ée]sence\s+de\s+termites|[ée]tat\s+parasitaire|rapport\s+de\s+l.[ée]tat\s+relatif\s+[àa]\s+la\s+pr[ée]sence\s+de\s+termites/i },
    { cle: 'dpe', re: /diagnostic\s+de\s+performance\s+[ée]nerg[ée]tique/i },
    { cle: 'erp', re: /[ée]tat\s+des\s+risques\s+et\s+pollutions/i },
    { cle: 'carrez', re: /loi\s+carrez|superficie\s+priv(?:ative|[ée]e)/i }
  ];

  /** @param {string} s */
  function recollerTirets(s) { return String(s || '').replace(/(\w)\s+-\s+(\w)/g, '$1-$2').replace(/\s+/g, ' ').trim(); }

  // Seuils du DPE (arrêté du 31 mars 2021, logement de 40 m² et plus) : kWh d'énergie primaire et kg de CO2 par m² et par an.
  var SEUILS_DPE_ENERGIE = [70, 110, 180, 250, 330, 420];
  var SEUILS_DPE_GES = [6, 11, 30, 50, 70, 100];

  /** @param {number} valeur @param {number[]} seuils */
  function lettreDpe(valeur, seuils) {
    const i = seuils.findIndex((s) => valeur <= s);
    return 'ABCDEFG'[i < 0 ? 6 : i];
  }

  /** @param {string} s @returns {number} */
  function nombreFr(s) { return Number(String(s || '').replace(/[\s  ]/g, '').replace(',', '.')); }

  // Pure : ce qu'un dossier de diagnostic technique apprend, d'après le texte de chaque page (`pages[i]` = page i + 1).
  // Rend { societe, operateur, certification, diagnostics: { amiante: { date, page, conclusion }, … }, dpe: {…} } ; un champ
  // absent du rapport reste ''.
  /** @param {string[]} pages */
  function lireDossierDiagnostic(pages) {
    const textes = (pages || []).map((p) => String(p || '').replace(/\s+/g, ' '));
    const tout = textes.join(' ');
    const premier = (re) => { const m = re.exec(tout); return m ? recollerTirets(m[1]) : ''; };
    const societe = premier(/Raison sociale de l.entreprise\s*:\s*([^(|]+?)\s*\(/i)
      || recollerTirets((/^\s*((?:SARL|SAS|SASU|EURL|SA|SCP|SELARL)\b[^|]{2,60}?)\s*\|/i.exec(textes[0] || '') || [])[1] || '');
    const operateur = premier(/Diagnostiqueur\s*:\s*([A-ZÀ-Ý][A-ZÀ-Ý'’ -]+\s+[A-ZÀ-Ý][a-zà-ÿ-]+)/)
      || premier(/Par\s*:\s*([A-ZÀ-Ý][A-ZÀ-Ý'’ -]+\s+[A-ZÀ-Ý][a-zà-ÿ-]+)/);
    const certification = premier(/N°\s*de\s*certification\s*:\s*([A-Z]{1,4}\s*\d+\s*-\s*\d+|[A-Z0-9][A-Z0-9 -]{3,20}?)(?=\s+(?:Organisme|Raison|Date|$))/i);
    const organisme = premier(/Organisme de certification\s*:\s*([A-Z][A-Za-z]+)/);
    const diagnostics = {};
    textes.forEach((t, i) => {
      const tete = t.slice(0, 600);
      for (const type of TYPES_DIAGNOSTIC) {
        if (diagnostics[type.cle] || !type.re.test(tete)) continue;
        const date = (/(?:Rapport du|Etabli le|Établi le|Date du rep[ée]rage|Date de visite[^:]*|[ée]tabli le)\s*:?\s*(?:[\d -]*X?\s*)?(\d{2}\/\d{2}\/\d{4})/i.exec(t) || [])[1] || '';
        diagnostics[type.cle] = { date, page: i + 1, conclusion: '' };
      }
    });
    // Conclusions : la page de synthèse (« Résumé de l'expertise … Prestations Conclusion Amiante … Électricité … DPE … »).
    const synthese = textes.find((t) => /R[ée]sum[ée] de l.expertise|Prestations\s+Conclusion/i.test(t)) || '';
    const blocSynthese = synthese.split(/Prestations\s+Conclusion/i)[1] || '';
    if (blocSynthese) {
      // Pas de \b à côté d'une lettre accentuée (« Électricité ») : des bornes explicites.
      const mot = (m) => new RegExp('(?<![A-Za-zÀ-ÿ])(?:' + m + ')(?![A-Za-zÀ-ÿ])');
      const reperes = [['amiante', mot('Amiante')], ['electricite', mot('[ÉE]lectricit[ée]')], ['gaz', mot('Gaz')], ['plomb', mot('Plomb')],
        ['termites', mot('Termites')], ['dpe', mot('DPE')], ['erp', mot('ERP|[ÉE]tat des risques')], ['carrez', mot('Carrez')]]
        .map(([cle, re]) => { const m = /** @type {RegExp} */ (re).exec(blocSynthese); return m ? { cle: String(cle), index: m.index, long: m[0].length } : null; })
        .filter(Boolean).sort((a, b) => a.index - b.index);
      reperes.forEach((r, k) => {
        const fin = k + 1 < reperes.length ? reperes[k + 1].index : blocSynthese.length;
        const texte = blocSynthese.slice(r.index + r.long, fin).trim();
        if (!diagnostics[r.cle]) diagnostics[r.cle] = { date: '', page: textes.indexOf(synthese) + 1, conclusion: '' };
        diagnostics[r.cle].conclusion = texte.slice(0, 400);
      });
    }
    // DPE : numéro ADEME, dates, surface, consommations → classes (calculées, à vérifier sur le DPE : l'étiquette est une image).
    const dpe = { numero: premier(/(?:Num[ée]ro (?:d.)?enregistrement DPE \(ADEME\)|QR code n°)\s*:?\s*([0-9A-Z]{10,16})/i),
      date: premier(/Etabli le\s*:\s*(\d{2}\/\d{2}\/\d{4})/i), validite: premier(/Valable jusqu.au\s*:\s*(\d{2}\/\d{2}\/\d{4})/i),
      surface: 0, energie: 0, ges: 0, classeEnergie: '', classeGes: '' };
    const surface = nombreFr((/Surface de r[ée]f[ée]rence\s*:\s*([\d\s,.]+)\s*m/i.exec(tout) || [])[1]);
    const energie = nombreFr((/[ée]nergie totale pour les usages recens[ée]s\s*:\s*([\d\s  ]+)\s*kWh/i.exec(tout) || [])[1]);
    const ges = nombreFr((/[ée]met\s+([\d\s  ]+)\s*kg de CO/i.exec(tout) || [])[1]);
    if (surface >= 40 && energie > 0) { dpe.surface = surface; dpe.energie = Math.round(energie / surface); dpe.classeEnergie = lettreDpe(energie / surface, SEUILS_DPE_ENERGIE); }
    if (surface >= 40 && ges > 0) { dpe.ges = Math.round((ges / surface) * 10) / 10; dpe.classeGes = lettreDpe(ges / surface, SEUILS_DPE_GES); }
    if (diagnostics.dpe && !diagnostics.dpe.date && dpe.date) diagnostics.dpe.date = dpe.date;
    return { societe, operateur, certification: certification ? certification.replace(/\s+/g, '') : '', organisme, diagnostics, dpe };
  }

  const exportes = { CHAMPS_ACTE, CLAUSES_ACTE, trousDuPassage, clauseDuPassage, champsDuPassage, nombreEnLettres, montantEnLettresActe,
    dateActe, jourMoisEnLettres, lireDossierDiagnostic, lettreDpe, SEUILS_DPE_ENERGIE, SEUILS_DPE_GES };
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  typeof module !== 'undefined' && module.exports ? { formaterPrixCentimes: require('./montants').formaterPrixCentimes } : /** @type {any} */ (globalThis)
);

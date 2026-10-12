'use strict';

// Assainisseurs des réglages et états de la table `parametres` (sortis de parametresRepo.js le 04/10 pour garder des
// fichiers de taille raisonnable) : fonctions PURES, une par clé — chacune ramène un JSON lu en base, ou reçu d'une route,
// à la forme attendue (types, bornes, valeurs par défaut), sans jamais rendre un secret. Le dépôt (parametresRepo.js) les
// appelle à chaque lecture et à chaque écriture.

// Réglages de l'étude, persistés en base (table `parametres`, voir db.js) — pas dans config.json,
// qui reste réservé aux réglages d'infrastructure posés une fois par qui installe l'exécutable
// (mot de passe partagé, port, racine du NAS). Ici, c'est une donnée métier que l'étude doit
// pouvoir modifier elle-même depuis l'écran « Réglages » (voir routes/reglages.js, script.js),
// partagée entre tous les postes puisqu'elle vit dans la même base que les dossiers.
//
// Un seul blob JSON sous une clé unique plutôt qu'une colonne par champ : rien ici n'est filtré/
// trié par SQL ailleurs (contrairement aux colonnes promues de dossiersRepo.js), donc pas de
// raison de complexifier le schéma — même principe que le blob `data` des dossiers.

const { MODELES_MISTRAL, MODELE_MISTRAL_PAR_DEFAUT, REGIONS_MISTRAL } = require('../relecture/mistral');
const { assainirCarnet, carnetInitial, avecOfficeEtude } = require('../carnetConfreres');
const { assainirRepertoire, repertoireInitial } = require('../repertoire');
const { CLE_SONDAGES, assainirSondages } = require('../sondagesCreneaux');
const { assainirJournalAppels } = require('../appels3cx');
const CLE_APPELS = 'appels-recus';

const CLE_REGLAGES = 'reglages';

// Compte rendu du DERNIER tour de la tâche de rappels (voir jobs/rappels.js). Stocké sous sa
// propre clé plutôt que dans le blob `reglages` : ce n'est pas un réglage saisi par l'étude mais
// un état produit par le serveur, et `assainirReglages()` (liste blanche stricte) le jetterait à
// chaque enregistrement du formulaire.
//
// Raison d'être : jusqu'ici `executerTacheRappels()` construisait soigneusement `resultat.erreurs`
// et PERSONNE ne lisait ce tableau — la tâche tourne toutes les 30 minutes dans un serveur lancé
// SANS FENÊTRE (Lancer-CLAIRE-en-arriere-plan.vbs), donc même un console.warn n'aurait été vu de
// personne. Un mot de passe d'application révoqué, et les rappels s'arrêtaient en silence : c'est
// précisément l'ABSENCE de message qui aurait dû alerter, et rien ne la signalait.
const CLE_DERNIER_TOUR = 'dernier-tour-rappels';

// Copies rangées par Gmail dans « Messages envoyés », en attente d'effacement (voir
// nettoyageGmail.js). Même raison que le compte rendu ci-dessus pour une clé à part : c'est un
// état produit par le serveur, pas un réglage.
const CLE_COPIES_GMAIL = 'copies-gmail-a-effacer';
const CLE_SECRET_LIENS = 'secret-liens-pieces';

// Noms de fichiers écartés à la main pour une pièce de la checklist (bouton « Réinitialiser » d'une
// pièce mal reconnue, voir script.js). Longtemps gardés dans le navigateur de chaque poste : deux
// postes pouvaient alors rendre deux verdicts différents pour la même pièce du même dossier, et
// l'exclusion restait invisible. En base, ils sont partagés et listés dans les Réglages.
const CLE_EXCLUSIONS_PIECES = 'exclusions-noms-pieces';
const MAX_NOMS_PAR_PIECE = 200;

// Corrections apprises (script.js, memoriserCorrection) : quand l'étude reclasse une date ou une
// obligation du vendeur à l'import d'un avant-contrat, la clause est retenue pour être reconnue au
// prochain acte de même trame. Longtemps gardées dans le navigateur de chaque poste : une
// correction faite par un collaborateur n'était jamais « apprise » pour les dossiers créés depuis
// un autre poste. En base, elles profitent à tout le bureau.
const CLE_CORRECTIONS_APPRISES = 'corrections-apprises';
const MAX_CORRECTIONS_APPRISES = 500;
const CATEGORIES_CORRECTION = ['date', 'engagement'];

function assainirCorrectionApprise(brut) {
  const b = brut && typeof brut === 'object' ? brut : null;
  if (!b || typeof b.id !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(b.id)) return null;
  if (!Array.isArray(b.tokens) || typeof b.classification !== 'string' || !b.classification.trim()) return null;
  const tokens = Array.from(new Set(b.tokens.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.slice(0, 60)))).slice(0, 200);
  if (tokens.length < 3) return null;
  return {
    id: b.id,
    tokens,
    contexteExemple: typeof b.contexteExemple === 'string' ? b.contexteExemple.slice(0, 200) : '',
    categorie: CATEGORIES_CORRECTION.indexOf(b.categorie) === -1 ? 'date' : b.categorie,
    classification: b.classification.trim().slice(0, 30),
    libelle: typeof b.libelle === 'string' && b.libelle.trim() ? b.libelle.trim().slice(0, 120) : null,
    nbConfirmations: Number.isFinite(b.nbConfirmations) && b.nbConfirmations >= 1 ? Math.floor(b.nbConfirmations) : 1,
    dateMaj: typeof b.dateMaj === 'string' ? b.dateMaj.slice(0, 40) : new Date().toISOString()
  };
}

// Au-delà du plafond, on garde les corrections les plus confirmées puis les plus récentes — même
// règle que côté navigateur.
function assainirCorrectionsApprises(brut) {
  if (!Array.isArray(brut)) return [];
  const parId = new Map();
  for (const c of brut) {
    const propre = assainirCorrectionApprise(c);
    if (propre) parId.set(propre.id, propre);
  }
  const liste = Array.from(parId.values());
  if (liste.length > MAX_CORRECTIONS_APPRISES) {
    liste.sort((a, b) => (b.nbConfirmations - a.nbConfirmations) || b.dateMaj.localeCompare(a.dateMaj));
    liste.length = MAX_CORRECTIONS_APPRISES;
  }
  return liste;
}

// Journal des corrections faites à la main après la lecture d'un compromis (« Ce que CLAIRE a appris »,
// étude 02/10) : quel champ, ce que CLAIRE avait lu, ce que l'étude a gardé. Gardé jusqu'ici dans le
// navigateur de chaque poste (chacun ne voyait que les siennes) : désormais commun, en base. Sert à
// repérer les erreurs de lecture fréquentes — jamais à réentraîner quoi que ce soit.
const CLE_JOURNAL_CORRECTIONS = 'corrections-extraction';
const MAX_JOURNAL_CORRECTIONS = 500;

function assainirEntreeJournalCorrection(brut) {
  const b = brut && typeof brut === 'object' ? brut : null;
  if (!b || typeof b.champ !== 'string' || !/^[A-Za-z]{1,40}$/.test(b.champ)) return null;
  const valeur = (v) => (v === null || v === undefined || v === '') ? null : String(v).slice(0, 200);
  const court = (v, n) => (typeof v === 'string' && v.trim()) ? v.trim().slice(0, n) : null;
  const date = typeof b.date === 'string' && !Number.isNaN(Date.parse(b.date)) ? new Date(b.date).toISOString() : new Date().toISOString();
  return {
    champ: b.champ,
    valeurExtraite: valeur(b.valeurExtraite),
    valeurCorrigee: valeur(b.valeurCorrigee),
    origine: court(b.origine, 30) || 'regex',
    statutExtrait: court(b.statutExtrait, 30),
    typeActe: court(b.typeActe, 40),
    extrait: court(b.extrait, 200),
    date
  };
}

function assainirJournalCorrections(brut) {
  if (!Array.isArray(brut)) return [];
  return brut.map(assainirEntreeJournalCorrection).filter(Boolean).slice(-MAX_JOURNAL_CORRECTIONS);
}

// « Mes rappels » du tableau de bord : les choses à faire que chaque collaborateur note pour
// lui-même, éventuellement rattachées à un dossier. En base plutôt que dans le navigateur, pour les
// retrouver depuis n'importe quel poste. Même principe que les corrections apprises : chaque poste
// envoie le seul rappel qu'il crée ou modifie, fusionné par identifiant.
const CLE_RAPPELS_PERSO = 'rappels-perso';
const MAX_RAPPELS_PERSO = 2000;

function assainirRappelPerso(brut) {
  const b = brut && typeof brut === 'object' ? brut : null;
  if (!b || typeof b.id !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(b.id)) return null;
  const texte = typeof b.texte === 'string' ? b.texte.trim().slice(0, 200) : '';
  const auteur = typeof b.auteur === 'string' ? b.auteur.trim().slice(0, 80) : '';
  if (!texte || !auteur) return null;
  const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  return {
    id: b.id,
    auteur,
    texte,
    echeance: date(b.echeance),
    dossierId: typeof b.dossierId === 'string' ? b.dossierId.slice(0, 80) : '',
    fait: !!b.fait,
    faitLe: b.fait && typeof b.faitLe === 'string' ? b.faitLe.slice(0, 40) : '',
    creeLe: typeof b.creeLe === 'string' ? b.creeLe.slice(0, 40) : new Date().toISOString(),
    // Tâche relevée dans l'agenda de l'office (voir tachesAgenda.js) : le rendez-vous d'origine.
    ...(typeof b.agendaItemId === 'string' && b.agendaItemId && b.agendaItemId.length <= 1000 ? {
      agendaItemId: b.agendaItemId,
      agendaChangeKey: typeof b.agendaChangeKey === 'string' ? b.agendaChangeKey.slice(0, 1000) : '',
      agendaSupprimeLe: typeof b.agendaSupprimeLe === 'string' ? b.agendaSupprimeLe.slice(0, 40) : ''
    } : {})
  };
}

// Au-delà du plafond, les rappels faits les plus anciens partent en premier.
function assainirRappelsPerso(brut) {
  if (!Array.isArray(brut)) return [];
  const parId = new Map();
  for (const r of brut) {
    const propre = assainirRappelPerso(r);
    if (propre) parId.set(propre.id, propre);
  }
  let liste = Array.from(parId.values());
  if (liste.length > MAX_RAPPELS_PERSO) {
    liste.sort((a, b) => (a.fait - b.fait) || String(b.faitLe || b.creeLe).localeCompare(String(a.faitLe || a.creeLe)));
    liste = liste.slice(0, MAX_RAPPELS_PERSO);
  }
  return liste;
}

// Préférences d'affichage par collaborateur (mode sombre, thème de couleur) : gardées sur le
// serveur pour qu'un collaborateur retrouve son thème à chaque relance, même si le navigateur
// a perdu ses données ou si CLAIRE est ouverte par une autre adresse (localhost / IP), deux
// « sites » qui ne partagent pas leur localStorage.
const CLE_PREFERENCES = 'preferences-collaborateurs';
const THEMES_PREFERENCES = ['light', 'dark'];
const ACCENTS_PREFERENCES = ['bordeaux', 'bleu', 'vert', 'orange', 'noir'];
// État de la barre latérale au démarrage (Réglages › Général, étude 30/09).
const SIDEBAR_PREFERENCES = ['ouverte', 'fermee'];

// Widgets du tableau de bord (29/09) : ordre, taille et visibilité propres à chaque collaborateur.
// Liste blanche des identifiants et des tailles : tout le reste est écarté ; un doublon garde sa
// première position. Le client complète avec les widgets absents (nouveaux widgets d'une mise à jour).
const WIDGETS_PREFERENCES = ['assistant', 'aujourdhui', 'avancement', 'agenda', 'portefeuille', 'activite', 'pieces', 'statistiques'];
const TAILLES_WIDGETS = ['petit', 'moyen', 'grand'];
const HAUTEURS_WIDGETS = [1, 2, 3];

function assainirWidgetsPreference(brut) {
  if (!Array.isArray(brut)) return null;
  const vus = new Set();
  const out = [];
  for (const w of brut.slice(0, 20)) {
    if (!w || typeof w !== 'object' || !WIDGETS_PREFERENCES.includes(w.id) || vus.has(w.id)) continue;
    vus.add(w.id);
    const entree = { id: w.id, taille: TAILLES_WIDGETS.includes(w.taille) ? w.taille : 'moyen', masque: w.masque === true };
    // Hauteur en rangées (1 à 3) ; absente d'une préférence ancienne, que le client convertit.
    if (HAUTEURS_WIDGETS.includes(w.hauteur)) entree.hauteur = w.hauteur;
    out.push(entree);
  }
  return out;
}

function assainirPreference(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const out = {};
  if (THEMES_PREFERENCES.includes(b.theme)) out.theme = b.theme;
  if (ACCENTS_PREFERENCES.includes(b.accent)) out.accent = b.accent;
  if (SIDEBAR_PREFERENCES.includes(b.sidebarDemarrage)) out.sidebarDemarrage = b.sidebarDemarrage;
  const widgets = assainirWidgetsPreference(b.widgets);
  if (widgets && widgets.length) out.widgets = widgets;
  // Version de la disposition par défaut à laquelle se rapporte `widgets` (le client repart de la
  // nouvelle disposition par défaut quand elle change).
  if (Number.isInteger(b.widgetsVersion) && b.widgetsVersion > 0 && b.widgetsVersion < 100) out.widgetsVersion = b.widgetsVersion;
  // Derniers dossiers ouverts par ce collaborateur (étude 06/10 : « lié à la personne qui ouvre », plus au navigateur) :
  // identifiant et heure seulement, 10 au plus, sans doublon.
  if (Array.isArray(b.dossiersConsultes)) {
    const vus = new Set();
    out.dossiersConsultes = b.dossiersConsultes
      .filter((x) => x && typeof x.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(x.id) && typeof x.le === 'string' && !Number.isNaN(Date.parse(x.le)))
      .filter((x) => (vus.has(x.id) ? false : (vus.add(x.id), true)))
      .slice(0, MAX_DOSSIERS_CONSULTES_PREFERENCE)
      .map((x) => ({ id: x.id, le: new Date(x.le).toISOString() }));
  }
  return out;
}
const MAX_DOSSIERS_CONSULTES_PREFERENCE = 10;

function assainirPreferences(brut) {
  const out = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return out;
  for (const [nom, pref] of Object.entries(brut).slice(0, 50)) {
    const cle = String(nom).trim().slice(0, 80);
    if (!cle) continue;
    const propre = assainirPreference(pref);
    if (Object.keys(propre).length) out[cle] = propre;
  }
  return out;
}

// Sauvegarde automatique de la base (voir sauvegarde.js) : le dossier de destination choisi dans
// les Réglages, et l'état des dernières tentatives. Deux clés à part du blob `reglages`, comme le
// compte rendu des rappels : l'état est produit par le serveur, pas saisi par l'étude.
const CLE_REGLAGE_SAUVEGARDE = 'sauvegarde';
const CLE_ETAT_SAUVEGARDE = 'etat-sauvegarde';

function assainirTentativeSauvegarde(t) {
  if (!t || typeof t !== 'object' || typeof t.at !== 'string') return null;
  const nombre = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    at: t.at.slice(0, 40),
    ok: !!t.ok,
    fichier: texteBorne(t.fichier, 200),
    dossier: texteBorne(t.dossier, 500),
    locale: !!t.locale,
    taille: nombre(t.taille),
    nbDossiers: nombre(t.nbDossiers),
    supprimes: Array.isArray(t.supprimes) ? t.supprimes.filter((n) => typeof n === 'string').slice(0, 50) : [],
    erreur: t.erreur ? texteBorne(String(t.erreur), 500) : null
  };
}

function assainirEtatSauvegarde(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  return {
    derniereReussie: typeof b.derniereReussie === 'string' ? b.derniereReussie.slice(0, 40) : null,
    derniereTentative: assainirTentativeSauvegarde(b.derniereTentative)
  };
}

function assainirExclusionsPieces(brut) {
  const propre = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return propre;
  for (const [cle, noms] of Object.entries(brut)) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(cle) || !Array.isArray(noms)) continue;
    const liste = Array.from(new Set(noms.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim().slice(0, 300))));
    if (liste.length) propre[cle] = liste.slice(-MAX_NOMS_PAR_PIECE);
  }
  return propre;
}
const MAX_COPIES_EN_ATTENTE = 500;

function assainirCopiesEnAttente(brut) {
  if (!Array.isArray(brut)) return [];
  return brut
    .filter((c) => c && typeof c.messageId === 'string' && c.messageId.trim() && Number.isFinite(c.envoyeLe))
    .map((c) => ({
      messageId: c.messageId,
      envoyeLe: c.envoyeLe,
      essais: Number.isFinite(c.essais) && c.essais >= 0 ? Math.floor(c.essais) : 0
    }))
    .slice(-MAX_COPIES_EN_ATTENTE);
}

// Commentaires de l'étude sur les rapports de relecture d'actes (Outil 2 — voir
// routes/auditRetours.js et le « mode commentaires » de script.js). Stockés en BASE, pas dans le
// navigateur : ils sont partagés entre les postes, et surtout ils doivent survivre au changement
// de poste ou au vidage du cache — ce sont eux qui disent, relus plus tard, où les règles de
// l'outil se trompent. Plafonnés : au-delà, les plus anciens partent (ils ont déjà été exportés
// et analysés, ou ne le seront plus).
const CLE_RETOURS_AUDIT = 'audit-retours';
const MAX_RETOURS_AUDIT = 1000;
const VERDICTS_RETOUR_AUDIT = ['juste', 'faux_positif', 'mal_formule', 'gravite', 'manque'];
const GRAVITES_AUDIT = ['CRITIQUE', 'IMPORTANT', 'A_VERIFIER', 'INFORMATION'];

function texteBorne(valeur, max) {
  return typeof valeur === 'string' ? valeur.trim().slice(0, max) : '';
}

function assainirRetourAudit(brut) {
  const b = (brut && typeof brut === 'object') ? brut : null;
  if (!b || VERDICTS_RETOUR_AUDIT.indexOf(b.verdict) === -1) return null;
  const c = (b.constat && typeof b.constat === 'object') ? b.constat : null;
  const commentaire = texteBorne(b.commentaire, 2000);
  // Un « oubli » de l'audit n'a pas de constat derrière lui : sans texte il ne dit rien.
  if (b.verdict === 'manque' && !commentaire) return null;
  if (b.verdict !== 'manque' && !c) return null;
  return {
    id: texteBorne(b.id, 64) || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    date: texteBorne(b.date, 40) || new Date().toISOString(),
    verdict: b.verdict,
    portee: b.portee === 'dossier' ? 'dossier' : 'tous',
    commentaire,
    graviteSouhaitee: GRAVITES_AUDIT.indexOf(b.graviteSouhaitee) >= 0 ? b.graviteSouhaitee : null,
    dossierCle: texteBorne(b.dossierCle, 200),
    dossierNom: texteBorne(b.dossierNom, 200),
    document: texteBorne(b.document, 200),
    mode: b.mode === 'acte' ? 'acte' : 'compromis',
    typeBien: texteBorne(b.typeBien, 20),
    empreinte: texteBorne(b.empreinte, 600),
    constat: c ? {
      categorie: texteBorne(c.categorie, 40),
      gravite: GRAVITES_AUDIT.indexOf(c.gravite) >= 0 ? c.gravite : 'INFORMATION',
      titre: texteBorne(c.titre, 300),
      description: texteBorne(c.description, 1000),
      phrase: texteBorne(c.phrase, 600),
      page: Number.isFinite(c.page) ? c.page : null
    } : null
  };
}

function assainirRetoursAudit(brut) {
  if (!Array.isArray(brut)) return [];
  return brut.map(assainirRetourAudit).filter(Boolean).slice(-MAX_RETOURS_AUDIT);
}

const PORT_SMTP_PAR_DEFAUT = 25;

const REGLAGES_PAR_DEFAUT = Object.freeze({
  emailActif: false,
  // Boîte aux lettres qui DÉCLENCHE le flux Power Automate : tous les messages de CLAIRE lui sont
  // adressés, et c'est l'objet de chaque email qui désigne le vrai destinataire du message Teams
  // (voir envoiEmail.js pour la convention complète).
  emailPasserelle: '',
  smtpHote: '',
  smtpPort: PORT_SMTP_PAR_DEFAUT,
  smtpSecurise: false,
  smtpUtilisateur: '',
  smtpMotDePasse: '',
  smtpExpediteur: '',
  copieEmail: '',
  emailsResponsables: {},
  fonctionsResponsables: {}
});

function texteNettoye(valeur) {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

// Assainit un objet réglages quelconque (venant de la base ou d'une requête PUT) vers la forme
// attendue — jamais de valeur exotique propagée plus loin (un JSON malformé en base, par exemple,
// ne doit jamais faire planter le job de rappels qui lit ces réglages toutes les 30 minutes).
//
// `precedent` (les réglages déjà en base) sert au seul mot de passe SMTP : la route GET ne le
// renvoie jamais au navigateur (voir routes/reglages.js), le formulaire ne peut donc pas le
// réémettre à l'enregistrement — absent ou `null`, on garde celui déjà stocké ; chaîne vide
// explicite, on l'efface ; chaîne non vide, on le remplace.
function assainirReglages(brut, precedent) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const p = (precedent && typeof precedent === 'object') ? precedent : {};

  const emails = (b.emailsResponsables && typeof b.emailsResponsables === 'object' && !Array.isArray(b.emailsResponsables))
    ? b.emailsResponsables : {};
  const emailsPropres = {};
  for (const [nom, email] of Object.entries(emails)) {
    if (typeof nom === 'string' && typeof email === 'string' && email.trim()) {
      emailsPropres[nom] = email.trim();
    }
  }

  // Fonction de chaque collaborateur, écrite sous son nom dans la signature de ses emails.
  const fonctions = (b.fonctionsResponsables && typeof b.fonctionsResponsables === 'object' && !Array.isArray(b.fonctionsResponsables))
    ? b.fonctionsResponsables : {};
  const fonctionsPropres = {};
  for (const [nom, f] of Object.entries(fonctions)) {
    if (typeof nom === 'string' && typeof f === 'string' && f.trim()) fonctionsPropres[nom] = f.trim().slice(0, 80);
  }

  const port = Number.parseInt(b.smtpPort, 10);

  // Reprise des anciennes clés Teams (teamsActif/teamsCopieEmail), deux générations en arrière :
  // ces deux réglages-là gardent exactement le même sens d'une architecture d'envoi à l'autre, et
  // les faire ressaisir serait une régression silencieuse. Le premier enregistrement depuis l'écran
  // Réglages persiste les clés actuelles et fait disparaître les anciennes, cet objet étant écrit
  // tel quel par ecrireReglages(). Rien à reprendre en revanche de `fluxEmailUrl`/`teamsWebhookUrl` :
  // le déclencheur HTTP n'existe plus du tout (voir envoiEmail.js).
  const motDePasse = (typeof b.smtpMotDePasse === 'string')
    ? b.smtpMotDePasse
    : texteNettoye(p.smtpMotDePasse);

  return {
    emailActif: b.emailActif === true || (b.emailActif === undefined && b.teamsActif === true),
    emailPasserelle: texteNettoye(b.emailPasserelle),
    smtpHote: texteNettoye(b.smtpHote),
    smtpPort: Number.isInteger(port) && port > 0 && port <= 65535 ? port : PORT_SMTP_PAR_DEFAUT,
    smtpSecurise: b.smtpSecurise === true,
    smtpUtilisateur: texteNettoye(b.smtpUtilisateur),
    smtpMotDePasse: motDePasse.trim(),
    smtpExpediteur: texteNettoye(b.smtpExpediteur),
    // Adresse recevant une copie de CHAQUE message envoyé, quel que soit le responsable
    // destinataire — demandé explicitement par l'étude, pour rester informée de tous les envois
    // sans dépendre du fait qu'elle soit elle-même responsable du dossier concerné. La clé
    // actuelle l'emporte dès qu'elle est présente, même vide : sans ça, vider cette adresse ne
    // tiendrait pas tant que l'ancienne clé Teams en porterait encore une.
    copieEmail: (typeof b.copieEmail === 'string') ? b.copieEmail.trim() : texteNettoye(b.teamsCopieEmail),
    emailsResponsables: emailsPropres,
    fonctionsResponsables: fonctionsPropres
  };
}

// Même discipline que `assainirReglages` : rien d'exotique ne ressort d'ici, y compris si la
// valeur en base a été écrite par une version antérieure ou corrompue à la main. Les erreurs sont
// plafonnées — un tour qui échoue sur soixante dossiers n'a pas à faire grossir indéfiniment une
// ligne de base que personne ne lira au-delà des premières.
const MAX_ERREURS_CONSERVEES = 20;

function assainirDernierTour(brut) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const entier = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const erreurs = Array.isArray(b.erreurs)
    ? b.erreurs.filter((e) => typeof e === 'string' && e.trim()).slice(0, MAX_ERREURS_CONSERVEES)
    : [];
  const avertissements = Array.isArray(b.avertissements)
    ? b.avertissements.filter((e) => typeof e === 'string' && e.trim()).slice(0, MAX_ERREURS_CONSERVEES)
    : [];
  return {
    at: typeof b.at === 'string' ? b.at : '',
    rappelsDus: entier(b.rappelsDus),
    rappelsEnvoyes: entier(b.rappelsEnvoyes),
    erreurs,
    // Ce qui n'a PAS empêché les rappels de partir (la copie Gmail restée dans « Messages
    // envoyés ») : affiché à part, sans faire passer l'encart en alerte.
    avertissements,
    // 'automatique' (le minuteur de 30 min) ou 'manuel' (bouton « Lancer un tour maintenant ») :
    // sans ça, l'étude ne saurait pas si la ligne affichée vient de son propre clic ou du job.
    declenche: b.declenche === 'manuel' ? 'manuel' : 'automatique'
  };
}

// Réglages de la relecture d'actes par l'API Claude (Outil 2) — rangés sous leur PROPRE clé, à
// part des réglages d'envoi d'email : la liste blanche d'assainirReglages() ne les connaît pas, et
// deux écrans différents n'ont pas à s'écraser l'un l'autre.
//
// La clé API suit la même discipline que le mot de passe SMTP : elle ne ressort JAMAIS de la base
// (voir routes/relectureClaude.js), et `precedent` permet de la conserver quand le formulaire ne
// la renvoie pas — absente ou `null`, on garde celle en base ; chaîne vide explicite, on l'efface.
const CLE_REGLAGES_CLAUDE = 'relecture-claude';
// Modèles proposés à l'étude. Sonnet 5 par défaut : c'est celui retenu dans le prototype
// « Notariat IA » fourni par l'étude, et il coûte 2,5 fois moins qu'Opus 5 à l'usage.
const MODELES_CLAUDE = ['claude-sonnet-5', 'claude-opus-5'];
const MODELE_CLAUDE_PAR_DEFAUT = 'claude-sonnet-5';

// Depuis le 27/09/2026 la relecture passe par MISTRAL par défaut (demande de l'étude : un
// fournisseur européen, point d'accès de l'UE) ; Claude reste sélectionnable. Des réglages
// enregistrés avant ce changement n'ont pas de `fournisseur` : ils basculent donc sur Mistral.
// La clé Mistral suit la même discipline que la clé Anthropic (jamais renvoyée, conservée si
// absente de la requête, effacée sur une chaîne vide).
const FOURNISSEURS_RELECTURE = ['mistral', 'claude'];

function assainirReglagesClaude(brut, precedent) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const p = (precedent && typeof precedent === 'object') ? precedent : {};
  const cle = (typeof b.cleApi === 'string') ? b.cleApi.trim() : texteNettoye(p.cleApi);
  const cleMistral = (typeof b.cleMistral === 'string') ? b.cleMistral.trim() : texteNettoye(p.cleMistral);
  const choisir = (valeur, precedente, liste, defaut) =>
    (liste.indexOf(valeur) >= 0 ? valeur : (liste.indexOf(precedente) >= 0 ? precedente : defaut));
  return {
    fournisseur: choisir(b.fournisseur, p.fournisseur, FOURNISSEURS_RELECTURE, 'mistral'),
    cleApi: cle,
    modele: choisir(b.modele, p.modele, MODELES_CLAUDE, MODELE_CLAUDE_PAR_DEFAUT),
    cleMistral,
    modeleMistral: choisir(b.modeleMistral, p.modeleMistral, MODELES_MISTRAL, MODELE_MISTRAL_PAR_DEFAUT),
    regionMistral: choisir(b.regionMistral, p.regionMistral, REGIONS_MISTRAL, 'eu')
  };
}

// Jeton GitHub de la mise à jour en un clic (voir miseAJour.js) : même discipline que la clé API
// Anthropic — jamais renvoyé par une route ; absent ou `null` dans la requête, on garde celui en
// base ; chaîne vide explicite, on l'efface.
const CLE_MISE_A_JOUR = 'mise-a-jour';

function assainirReglagesMiseAJour(brut, precedent) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const p = (precedent && typeof precedent === 'object') ? precedent : {};
  const jeton = (typeof b.jetonGithub === 'string') ? b.jetonGithub.trim() : texteNettoye(p.jetonGithub);
  // Un jeton GitHub ne contient ni espace ni caractère de contrôle : tout le reste est un collage raté.
  // `auto` (étude 03/10 : « au démarrage et dès que c'est détecté ») : installation automatique, active
  // par défaut, coupée seulement par un `false` explicite.
  const auto = typeof b.auto === 'boolean' ? b.auto : (typeof p.auto === 'boolean' ? p.auto : true);
  return { jetonGithub: /^[A-Za-z0-9_]{20,255}$/.test(jeton) ? jeton : '', auto };
}

// Connexion à l'Exchange de l'office (voir exchange/ews.js) : l'URL EWS, l'adresse de messagerie et
// son mot de passe, plus un interrupteur d'activation. Rangés sous leur PROPRE clé, comme les
// réglages Claude/agenda : ce sont des identifiants d'écriture dans l'agenda Outlook, sans rapport
// avec l'envoi d'email.
//
// Le mot de passe suit EXACTEMENT la discipline du mot de passe SMTP et des clés API : il ne ressort
// JAMAIS de la base (voir routes/exchange.js, reglagesExchangePublics), et `precedent` permet de le
// conserver quand le formulaire ne le renvoie pas — absent ou `null`, on garde celui en base ;
// chaîne vide explicite, on l'efface. Un mot de passe de messagerie n'a aucune raison de
// retraverser le réseau du bureau à chaque ouverture de l'écran.
const CLE_REGLAGES_EXCHANGE = 'exchange-office';
const URL_EWS_DEFAUT = 'https://mail.authentic-connect.fr/EWS/Exchange.asmx';

// Catégories Outlook qui donnent sa couleur à un rendez-vous de signature créé par CLAIRE — le
// code couleur de l'étude : vert = à l'office, violet = en visio, orange = chez un confrère. La
// couleur n'est pas dans l'événement mais dans la liste des catégories de la boîte : il faut donc le
// NOM exact de la catégorie. Par défaut, les noms qu'Outlook donne en français aux catégories de
// couleur ; l'étude les ajuste dans les Réglages si elle les a renommées.
// `annule` (étude, 01/10) : rendez-vous annulé ou à replacer — jaune, la signature d'un dossier
// marquée ainsi repasse « à placer » (voir agendaWatch.appliquerRendezVousAgenda).
const CATEGORIES_RDV_DEFAUT = { office: 'Catégorie Verte', visio: 'Catégorie Violette', confrere: 'Catégorie Orange', annule: 'Catégorie Jaune' };

function assainirCategoriesRdv(brut, precedent) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const p = (precedent && typeof precedent === 'object') ? precedent : {};
  const res = {};
  for (const cle of Object.keys(CATEGORIES_RDV_DEFAUT)) {
    const v = typeof b[cle] === 'string' ? b[cle] : p[cle];
    res[cle] = texteBorne(v, 100) || CATEGORIES_RDV_DEFAUT[cle];
  }
  return res;
}

function pageSondageValide(v) {
  const t = texteNettoye(v);
  return /^https:\/\/[^\s"'<>#?]+$/i.test(t) ? t.slice(0, 300) : '';
}

function relaisSondageValide(v) {
  const t = texteNettoye(v);
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(t) ? t : '';
}

function assainirReglagesExchange(brut, precedent) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const p = (precedent && typeof precedent === 'object') ? precedent : {};
  const url = texteNettoye(b.url) || texteNettoye(p.url) || URL_EWS_DEFAUT;
  const motDePasse = (typeof b.motDePasse === 'string') ? b.motDePasse : texteNettoye(p.motDePasse);
  return {
    // Absent du formulaire (section voisine enregistrée seule) = inchangé (audit 12/10 : la connexion se coupait).
    actif: typeof b.actif === 'boolean' ? b.actif : p.actif === true,
    // Toujours en https (NTLM sur du texte clair exposerait les identifiants) — un collage raté
    // retombe sur l'URL par défaut de Fichorga plutôt que d'enregistrer une adresse inutilisable.
    url: /^https:\/\//i.test(url) ? url : URL_EWS_DEFAUT,
    email: texteNettoye(b.email) || texteNettoye(p.email),
    motDePasse: motDePasse.trim(),
    // Adresse du calendrier PARTAGÉ où vivent les rendez-vous de l'office (celui de Sophie) —
    // vide si c'est le calendrier du compte de connexion lui-même. Quand elle est renseignée, les
    // opérations EWS ciblent le calendrier de cette boîte (voir ews.js, folderCalendrierXml) : le
    // compte de connexion doit alors avoir un accès délégué en écriture sur ce calendrier.
    // Chaîne vide explicite : le calendrier du compte de connexion (audit 12/10 : le champ ne pouvait plus être vidé).
    calendrierPartage: typeof b.calendrierPartage === 'string' ? texteNettoye(b.calendrierPartage) : texteNettoye(p.calendrierPartage),
    categoriesRdv: assainirCategoriesRdv(b.categoriesRdv, p.categoriesRdv),
    // Adresse de la page de réponse aux sondages de créneaux (page-sondage/index.html publiée sur
    // GitHub Pages) — vide : les emails gardent un bouton par créneau. https seulement ; une chaîne
    // vide explicite l'efface.
    pageSondage: pageSondageValide(typeof b.pageSondage === 'string' ? b.pageSondage : p.pageSondage),
    // Relais des réponses (Google Apps Script déployé sur le compte Gmail de l'étude, voir
    // page-sondage/relais-google-apps-script.gs) : la page lui envoie la réponse, qu'il transmet par
    // email à la boîte de l'office. Vide : la réponse passe par la messagerie du client.
    relaisSondage: relaisSondageValide(typeof b.relaisSondage === 'string' ? b.relaisSondage : p.relaisSondage)
  };
}

// Compte rendu du DERNIER tour de lecture de l'agenda (EWS, voir agendaWatch.js) — même raison
// d'être que CLE_DERNIER_TOUR pour les rappels par email : un agenda devenu illisible (mot de passe
// changé, partage retiré) arrêterait de mettre à jour les dossiers SANS RIEN LE SIGNALER si
// personne ne consultait ce compte rendu. Plafonné comme les autres listes de ce fichier.
const CLE_DERNIER_TOUR_AGENDA = 'dernier-tour-agenda';
const MAX_ENTREES_TOUR_AGENDA = 50;

function assainirEntreeDetectionAgenda(brut) {
  const b = (brut && typeof brut === 'object') ? brut : null;
  if (!b) return null;
  return {
    dossierId: texteBorne(b.dossierId, 80),
    dossierNom: texteBorne(b.dossierNom, 200),
    action: ['appelFonds', 'projetEnvoye', 'rendezVousSignature'].includes(b.action) ? b.action : '',
    dateIso: texteBorne(b.dateIso, 10),
    // Rendez-vous de signature : date déplacée (ancienne) ou date saisie à la main qui diffère de
    // l'agenda (dateFiche) — affichées dans le compte rendu des Réglages.
    ancienneDate: texteBorne(b.ancienneDate, 10),
    dateFiche: texteBorne(b.dateFiche, 10),
    reference: texteBorne(b.reference, 300),
    resume: texteBorne(b.resume, 300)
  };
}

// Absences des collaborateurs, lues dans l'agenda de l'office à chaque tour (voir
// agendaOffice.js/absencesDepuisEvenements) et rangées sous leur propre clé — comme le compte rendu du
// dernier tour, c'est un état PRODUIT par le serveur, pas un réglage saisi. Exposées au client par
// GET /api/agenda pour que l'agenda du tableau de bord signale « Absent cette semaine : … ».
const CLE_ABSENCES_AGENDA = 'absences-agenda';

// Noms des catégories Outlook rencontrées dans le flux de l'agenda (propriété CATEGORIES) : proposés
// dans les Réglages pour régler les couleurs des rendez-vous sans deviner leur nom exact.
const CLE_CATEGORIES_AGENDA = 'categories-agenda';
const MAX_CATEGORIES_AGENDA = 40;
function assainirCategoriesAgenda(brut) {
  if (!Array.isArray(brut)) return [];
  const vus = new Set();
  const res = [];
  for (const c of brut) {
    const t = texteBorne(c, 100);
    if (!t || vus.has(t.toLowerCase())) continue;
    vus.add(t.toLowerCase());
    res.push(t);
    if (res.length >= MAX_CATEGORIES_AGENDA) break;
  }
  return res;
}
const MAX_ABSENCES_AGENDA = 200;

// Rendez-vous du jour lus dans l'agenda de l'office (voir agendaOffice.js/agendaDuJourDepuisEvenements),
// remplacés à chaque tour réussi : la fenêtre du matin les affiche tant que `jour` est aujourd'hui.
const CLE_AGENDA_DU_JOUR = 'agenda-du-jour';
// Semaines de l'an dernier déjà comptées (comparaison de la page Agenda) : { 'AAAA-MM-JJ': { rendezVous,
// signatures, lu, regle } } (regle = règle de comptage, voir agendaOffice.js), 60 semaines au plus — une semaine passée ne change presque plus, une seule
// lecture Exchange suffit.
const CLE_AGENDA_COMPARAISON = 'agenda-comparaison';
function assainirComparaisonAgenda(brut) {
  const sortie = {};
  const entrees = Object.entries(brut && typeof brut === 'object' ? brut : {})
    .filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && v && Number.isInteger(v.rendezVous) && v.rendezVous >= 0)
    .sort((a, b) => String(b[1].lu || '').localeCompare(String(a[1].lu || ''))).slice(0, 60);
  for (const [k, v] of entrees) {
    sortie[k] = { rendezVous: v.rendezVous, signatures: Number.isInteger(v.signatures) ? v.signatures : 0, lu: typeof v.lu === 'string' ? v.lu.slice(0, 40) : '', regle: typeof v.regle === 'string' ? v.regle.slice(0, 20) : '' };
  }
  return sortie;
}
const MAX_AGENDA_DU_JOUR = 60;
function assainirAgendaDuJour(brut) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(b.jour || '')) ? b.jour : '';
  const heure = (v) => (/^\d{2}:\d{2}$/.test(String(v || '')) ? v : null);
  const evenements = Array.isArray(b.evenements) ? b.evenements.filter((e) => e && typeof e === 'object').slice(0, MAX_AGENDA_DU_JOUR).map((e) => {
    const journeeEntiere = !!e.journeeEntiere || !heure(e.heure);
    return {
      sujet: texteBorne(e.sujet, 200),
      lieu: texteBorne(e.lieu, 160),
      heure: journeeEntiere ? null : heure(e.heure),
      heureFin: journeeEntiere ? null : heure(e.heureFin),
      journeeEntiere,
      categories: Array.isArray(e.categories) ? e.categories.map((c) => texteBorne(c, 100)).filter(Boolean).slice(0, 5) : [],
      signature: !!e.signature,
      absence: !!e.absence,
      option: !!e.option,
      dossierId: e.dossierId ? texteBorne(e.dossierId, 80) : null,
      dossierNom: e.dossierNom ? texteBorne(e.dossierNom, 200) : null
    };
  }) : [];
  return { jour, lu: texteBorne(b.lu, 40), evenements };
}

// Agenda complet de l'office (page Agenda) : tous les rendez-vous de la fenêtre lue à chaque tour
// (du lundi de la semaine précédente à ~6 mois), avec leur identifiant Exchange pour la suppression.
// Remplacé à chaque tour réussi ; tenu à jour entre deux tours par la création et la suppression
// faites depuis CLAIRE (voir routes/exchange.js).
const CLE_AGENDA_OFFICE = 'agenda-office';
const MAX_AGENDA_OFFICE = 3000;
function assainirEvenementAgenda(e) {
  if (!e || typeof e !== 'object') return null;
  const dateOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '');
  const heure = (v) => (/^\d{2}:\d{2}$/.test(String(v || '')) ? v : null);
  const date = dateOk(e.date);
  if (!date) return null;
  const journeeEntiere = !!e.journeeEntiere || !heure(e.heure);
  const dateFin = dateOk(e.dateFin) && e.dateFin >= date ? e.dateFin : date;
  return {
    itemId: texteBorne(e.itemId, 400),
    changeKey: texteBorne(e.changeKey, 200),
    sujet: texteBorne(e.sujet, 200),
    lieu: texteBorne(e.lieu, 160),
    date, dateFin,
    heure: journeeEntiere ? null : heure(e.heure),
    heureFin: journeeEntiere ? null : heure(e.heureFin),
    journeeEntiere,
    categories: Array.isArray(e.categories) ? e.categories.map((c) => texteBorne(c, 100)).filter(Boolean).slice(0, 5) : [],
    signature: !!e.signature,
    absence: !!e.absence,
    dossierId: e.dossierId ? texteBorne(e.dossierId, 80) : null,
    dossierNom: e.dossierNom ? texteBorne(e.dossierNom, 200) : null,
    creeDansClaire: !!e.creeDansClaire,
    option: !!e.option
  };
}
function assainirAgendaOffice(brut) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const evenements = Array.isArray(b.evenements) ? b.evenements.map(assainirEvenementAgenda).filter(Boolean).slice(0, MAX_AGENDA_OFFICE) : [];
  // `calendrier` : la boîte lue (calendrier partagé des Réglages) — un changement de calendrier ne coche aucune tâche.
  return { debut: /^\d{4}-\d{2}-\d{2}$/.test(String(b.debut || '')) ? b.debut : '', lu: texteBorne(b.lu, 40), calendrier: texteBorne(b.calendrier, 200), evenements };
}

function assainirAbsenceAgenda(brut) {
  const b = (brut && typeof brut === 'object') ? brut : null;
  if (!b) return null;
  const debut = texteBorne(b.debut, 10);
  const collaborateur = texteBorne(b.collaborateur, 120);
  if (!debut || !collaborateur) return null;
  return {
    collaborateur,
    initiales: texteBorne(b.initiales, 8),
    debut,
    fin: texteBorne(b.fin, 10) || debut,
    resume: texteBorne(b.resume, 160)
  };
}

function assainirAbsencesAgenda(brut) {
  if (!Array.isArray(brut)) return [];
  return brut.map(assainirAbsenceAgenda).filter(Boolean).slice(0, MAX_ABSENCES_AGENDA);
}

function assainirDernierTourAgenda(brut) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const listeBornee = (v) => (Array.isArray(v) ? v.map(assainirEntreeDetectionAgenda).filter(Boolean).slice(0, MAX_ENTREES_TOUR_AGENDA) : []);
  return {
    at: texteBorne(b.at, 40),
    ok: !!b.ok,
    dossiersVerifies: Number.isFinite(b.dossiersVerifies) && b.dossiersVerifies >= 0 ? Math.floor(b.dossiersVerifies) : 0,
    misAJour: listeBornee(b.misAJour),
    dejaRenseignes: listeBornee(b.dejaRenseignes),
    sansCorrespondance: listeBornee(b.sansCorrespondance),
    evenementsLus: Number.isFinite(b.evenementsLus) && b.evenementsLus >= 0 ? Math.floor(b.evenementsLus) : 0,
    erreur: b.erreur ? texteBorne(String(b.erreur), 1500) : null,
    identifiantsRefuses: !!b.identifiantsRefuses,
    calendrier: texteBorne(b.calendrier, 200),
    // Dates butoir posées (ou retrouvées) dans l'agenda pendant ce tour, voir echeancesAgenda.js.
    echeancesPosees: Array.isArray(b.echeancesPosees) ? b.echeancesPosees.slice(0, MAX_ENTREES_TOUR_AGENDA).map((e) => ({
      dossierId: texteBorne(e && e.dossierId, 80),
      dossierNom: texteBorne(e && e.dossierNom, 200),
      type: e && e.type === 'ventebien' ? 'ventebien' : 'pret',
      date: texteBorne(e && e.date, 10),
      adoptee: !!(e && e.adoptee)
    })) : [],
    erreurEcheances: b.erreurEcheances ? texteBorne(String(b.erreurEcheances), 500) : null,
    declenche: b.declenche === 'manuel' ? 'manuel' : 'automatique'
  };
}

// Résumé des emails du matin (voir emailsMatin.js) : produit par le serveur, relu par les postes.
// Seulement l'expéditeur, l'objet, l'heure et les sujets repérés — jamais le corps d'un email.
const CLE_RESUME_EMAILS = 'resume-emails-matin';

// Classeur des scans du copieur (30/09, voir scans.js) : réglages, journal des rangements et scans
// écartés (laissés dans Scan sans les ranger). `depuis` borne les scans proposés : le dossier Scan
// contient tout l'historique du copieur, qu'il ne faut pas brasser à l'activation.
const CLE_SCANS_REGLAGES = 'scans-reglages';
const CLE_SCANS_JOURNAL = 'scans-journal';
const CLE_SCANS_ECARTES = 'scans-ecartes';
// Pièces déjà notifiées au responsable (routes/notifications.js) : clé « dossier|pièce|fichier » →
// date d'envoi ISO. Évite qu'une même pièce reparte sur Teams (deux fenêtres CLAIRE qui relisent le
// même dossier, pièce qui repasse un instant « manquante » entre deux parcours du NAS).
const CLE_PIECES_NOTIFIEES = 'pieces-notifiees';
const MAX_PIECES_NOTIFIEES = 5000;
function assainirPiecesNotifiees(brut) {
  const b = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  const entrees = Object.entries(b)
    .filter(([k, v]) => typeof k === 'string' && k.length <= 700 && typeof v === 'string' && !Number.isNaN(Date.parse(v)))
    .sort((a, b2) => b2[1].localeCompare(a[1]))
    .slice(0, MAX_PIECES_NOTIFIEES);
  return Object.fromEntries(entrees);
}
const MAX_SCANS_JOURNAL = 300;
const MAX_SCANS_ECARTES = 500;
function assainirReglagesScans(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  // Date choisie (AAAA-MM-JJ) ou heure exacte de l'activation (ISO complet, voir routes/scans.js).
  const depuis = typeof b.depuis === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(b.depuis) ? b.depuis : null;
  // Rangement automatique ACTIF par défaut (demandé par l'étude le 30/09 : « automatique pour
  // ceux détectés, sans validation ») ; seul un « non » explicite le coupe.
  return { actif: b.actif === true, auto: b.auto !== false, depuis };
}
function assainirEntreeJournalScans(e) {
  if (!e || typeof e !== 'object') return null;
  const txt = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  if (!txt(e.nom, 255) || !txt(e.date, 40)) return null;
  return {
    date: txt(e.date, 40), nom: txt(e.nom, 255), chemin: txt(e.chemin, 600), dossierId: txt(e.dossierId, 80),
    dossier: txt(e.dossier, 200), type: txt(e.type, 80), rubrique: txt(e.rubrique, 200), original: txt(e.original, 400),
    auteur: txt(e.auteur, 80), auto: e.auto === true,
    score: Number.isFinite(e.score) && e.score >= 0 ? Math.min(99, Math.round(e.score)) : null,
    // Date du fichier rangé quand l'original n'a pas pu quitter Scan : ce même fichier n'est plus proposé (audit 12/10).
    dateSource: txt(e.dateSource, 40)
  };
}
function assainirJournalScans(brut) {
  return (Array.isArray(brut) ? brut : []).map(assainirEntreeJournalScans).filter(Boolean).slice(0, MAX_SCANS_JOURNAL);
}
function assainirScansEcartes(brut) {
  return (Array.isArray(brut) ? brut : [])
    .filter((e) => e && typeof e.nom === 'string' && e.nom && typeof e.date === 'string')
    .map((e) => ({ nom: e.nom.slice(0, 255), date: e.date.slice(0, 40), auteur: typeof e.auteur === 'string' ? e.auteur.slice(0, 80) : '' }))
    .slice(0, MAX_SCANS_ECARTES);
}

// Rapport technique envoyé sur GitHub (30/09, voir rapportTechnique.js) : interrupteur (actif par
// défaut, accord de l'étude) et état produit par le serveur — dernier créneau traité, dernier envoi
// réussi (sa fin sert de début à la période suivante), dernière erreur.
const CLE_RAPPORT_TECHNIQUE = 'rapport-technique';
function assainirRapportTechnique(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const txt = (v, max) => (typeof v === 'string' && v ? v.slice(0, max) : null);
  const e = b.dernierEnvoi && typeof b.dernierEnvoi === 'object' ? b.dernierEnvoi : null;
  return {
    actif: b.actif !== false,
    dernierCreneau: txt(b.dernierCreneau, 20),
    derniereTentative: txt(b.derniereTentative, 40),
    derniereErreur: txt(b.derniereErreur, 500),
    dernierEnvoi: e && typeof e.jusqua === 'string' ? {
      at: txt(e.at, 40), depuis: txt(e.depuis, 40), jusqua: e.jusqua.slice(0, 40),
      numero: Number.isInteger(e.numero) ? e.numero : null,
      url: typeof e.url === 'string' && /^https:\/\/github\.com\//.test(e.url) ? e.url.slice(0, 300) : null,
      calme: !!e.calme, points: Number.isInteger(e.points) ? e.points : 0
    } : null
  };
}

// Carnet des confrères (voir carnetConfreres.js). Absent = jamais ouvert : il part alors du relevé
// de l'annuaire du 41, écrit en base à la première lecture pour que les postes partagent la même liste.
const CLE_CARNET_CONFRERES = 'carnet-confreres';
// Répertoire de l'étude hors offices notariaux (voir repertoire.js) : rempli du relevé initial à
// la première lecture.
const CLE_REPERTOIRE = 'repertoire-contacts';
function assainirEmailResume(e) {
  const b = e && typeof e === 'object' ? e : {};
  return {
    de: texteBorne(b.de, 200), adresse: texteBorne(b.adresse, 200), sujet: texteBorne(b.sujet, 300),
    recuLe: texteBorne(b.recuLe, 40), heure: texteBorne(b.heure, 20), pj: !!b.pj,
    sujets: Array.isArray(b.sujets) ? b.sujets.filter(x => typeof x === 'string').slice(0, 8).map(x => texteBorne(x, 40)) : []
  };
}
function assainirResumeEmails(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const emails = (l) => (Array.isArray(l) ? l.slice(0, 200).map(assainirEmailResume) : []);
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : null,
    depuis: texteBorne(b.depuis, 40), genereLe: texteBorne(b.genereLe, 40),
    erreur: b.erreur ? texteBorne(String(b.erreur), 500) : null,
    total: Number.isFinite(b.total) ? b.total : 0,
    dossiers: Array.isArray(b.dossiers) ? b.dossiers.slice(0, 200).map(g => ({
      dossierId: texteBorne(g && g.dossierId, 100), dossierNom: texteBorne(g && g.dossierNom, 200),
      responsable: texteBorne(g && g.responsable, 100), emails: emails(g && g.emails)
    })) : [],
    autres: emails(b.autres),
    // Emails écartés du résumé (SPF, CRIDON, INFN, INAFON, publicités… — comptés, jamais listés).
    exclus: b.exclus && typeof b.exclus === 'object' ? {
      total: Number.isFinite(b.exclus.total) ? b.exclus.total : 0,
      parMotif: Object.fromEntries(Object.entries(b.exclus.parMotif || {}).filter(([k, v]) => typeof k === 'string' && Number.isFinite(v)).slice(0, 20).map(([k, v]) => [texteBorne(k, 40), v]))
    } : { total: 0, parMotif: {} },
    signature: texteBorne(b.signature, 80),
    ia: assainirSyntheseIaEmails(b.ia)
  };
}

// Résumé des emails rédigé par l'IA locale (Ollama, voir emailsMatin.js) : le texte, les points
// importants rattachés s'il y a lieu à un dossier, ou l'état (en cours, erreur). null s'il n'y en a pas.
function assainirSyntheseIaEmails(brut) {
  if (!brut || typeof brut !== 'object') return null;
  if (brut.enCours) return { enCours: true };
  if (brut.erreur) return { erreur: texteBorne(String(brut.erreur), 300) };
  const priorites = ['haute', 'normale'];
  return {
    texte: texteBorne(brut.texte, 1500),
    // Liste des demandes par email (étude 02/10) : une ligne par demande, son expéditeur et son heure.
    points: Array.isArray(brut.points) ? brut.points.slice(0, 40).map(pt => ({
      texte: texteBorne(pt && pt.texte, 300),
      priorite: priorites.includes(pt && pt.priorite) ? pt.priorite : 'normale',
      de: texteBorne(pt && pt.de, 120), heure: texteBorne(pt && pt.heure, 20),
      dossierId: pt && pt.dossierId ? texteBorne(pt.dossierId, 100) : null,
      dossierNom: pt && pt.dossierNom ? texteBorne(pt.dossierNom, 200) : null
    })).filter(pt => pt.texte) : [],
    modele: texteBorne(brut.modele, 80),
    dureeMs: Number.isFinite(brut.dureeMs) ? Math.round(brut.dureeMs) : null
  };
}

module.exports = {
  MODELES_MISTRAL, MODELE_MISTRAL_PAR_DEFAUT, REGIONS_MISTRAL, assainirCarnet, carnetInitial, avecOfficeEtude, assainirRepertoire, repertoireInitial, CLE_SONDAGES, assainirSondages, assainirJournalAppels, CLE_APPELS, CLE_REGLAGES, CLE_DERNIER_TOUR, CLE_COPIES_GMAIL, CLE_SECRET_LIENS, CLE_EXCLUSIONS_PIECES, MAX_NOMS_PAR_PIECE, CLE_CORRECTIONS_APPRISES, MAX_CORRECTIONS_APPRISES, CATEGORIES_CORRECTION, assainirCorrectionApprise, assainirCorrectionsApprises, CLE_JOURNAL_CORRECTIONS, MAX_JOURNAL_CORRECTIONS, assainirEntreeJournalCorrection, assainirJournalCorrections, CLE_RAPPELS_PERSO, MAX_RAPPELS_PERSO, assainirRappelPerso, assainirRappelsPerso, CLE_PREFERENCES, THEMES_PREFERENCES, ACCENTS_PREFERENCES, SIDEBAR_PREFERENCES, WIDGETS_PREFERENCES, TAILLES_WIDGETS, HAUTEURS_WIDGETS, assainirWidgetsPreference, assainirPreference, assainirPreferences, CLE_REGLAGE_SAUVEGARDE, CLE_ETAT_SAUVEGARDE, assainirTentativeSauvegarde, assainirEtatSauvegarde, assainirExclusionsPieces, MAX_COPIES_EN_ATTENTE, assainirCopiesEnAttente, CLE_RETOURS_AUDIT, MAX_RETOURS_AUDIT, VERDICTS_RETOUR_AUDIT, GRAVITES_AUDIT, texteBorne, assainirRetourAudit, assainirRetoursAudit, PORT_SMTP_PAR_DEFAUT, REGLAGES_PAR_DEFAUT, texteNettoye, assainirReglages, MAX_ERREURS_CONSERVEES, assainirDernierTour, CLE_REGLAGES_CLAUDE, MODELES_CLAUDE, MODELE_CLAUDE_PAR_DEFAUT, FOURNISSEURS_RELECTURE, assainirReglagesClaude, CLE_MISE_A_JOUR, assainirReglagesMiseAJour, CLE_REGLAGES_EXCHANGE, URL_EWS_DEFAUT, CATEGORIES_RDV_DEFAUT, assainirCategoriesRdv, pageSondageValide, relaisSondageValide, assainirReglagesExchange, CLE_DERNIER_TOUR_AGENDA, MAX_ENTREES_TOUR_AGENDA, assainirEntreeDetectionAgenda, CLE_ABSENCES_AGENDA, CLE_CATEGORIES_AGENDA, MAX_CATEGORIES_AGENDA, assainirCategoriesAgenda, MAX_ABSENCES_AGENDA, CLE_AGENDA_DU_JOUR, CLE_AGENDA_COMPARAISON, assainirComparaisonAgenda, MAX_AGENDA_DU_JOUR, assainirAgendaDuJour, CLE_AGENDA_OFFICE, MAX_AGENDA_OFFICE, assainirEvenementAgenda, assainirAgendaOffice, assainirAbsenceAgenda, assainirAbsencesAgenda, assainirDernierTourAgenda, CLE_RESUME_EMAILS, CLE_SCANS_REGLAGES, CLE_SCANS_JOURNAL, CLE_SCANS_ECARTES, CLE_PIECES_NOTIFIEES, MAX_PIECES_NOTIFIEES, assainirPiecesNotifiees, MAX_SCANS_JOURNAL, MAX_SCANS_ECARTES, assainirReglagesScans, assainirEntreeJournalScans, assainirJournalScans, assainirScansEcartes, CLE_RAPPORT_TECHNIQUE, assainirRapportTechnique, CLE_CARNET_CONFRERES, CLE_REPERTOIRE, assainirEmailResume, assainirResumeEmails, assainirSyntheseIaEmails
};

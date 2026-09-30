// Réglages de l'étude, persistés en base (table `parametres`, voir db.js) — pas dans config.json,
// qui reste réservé aux réglages d'infrastructure posés une fois par qui installe l'exécutable
// (mot de passe partagé, port, racine du NAS). Ici, c'est une donnée métier que l'étude doit
// pouvoir modifier elle-même depuis l'écran « Réglages » (voir routes/reglages.js, script.js),
// partagée entre tous les postes puisqu'elle vit dans la même base que les dossiers.
//
// Un seul blob JSON sous une clé unique plutôt qu'une colonne par champ : rien ici n'est filtré/
// trié par SQL ailleurs (contrairement aux colonnes promues de dossiersRepo.js), donc pas de
// raison de complexifier le schéma — même principe que le blob `data` des dossiers.
'use strict';

const { MODELES_MISTRAL, MODELE_MISTRAL_PAR_DEFAUT, REGIONS_MISTRAL } = require('./relecture/mistral');
const { assainirCarnet, carnetInitial, avecOfficeEtude } = require('./carnetConfreres');
const { assainirRepertoire, repertoireInitial } = require('./repertoire');

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
    creeLe: typeof b.creeLe === 'string' ? b.creeLe.slice(0, 40) : new Date().toISOString()
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

// Widgets du tableau de bord (29/09) : ordre, taille et visibilité propres à chaque collaborateur.
// Liste blanche des identifiants et des tailles : tout le reste est écarté ; un doublon garde sa
// première position. Le client complète avec les widgets absents (nouveaux widgets d'une mise à jour).
const WIDGETS_PREFERENCES = ['aujourdhui', 'avancement', 'agenda', 'portefeuille', 'activite', 'pieces'];
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
  const widgets = assainirWidgetsPreference(b.widgets);
  if (widgets && widgets.length) out.widgets = widgets;
  // Version de la disposition par défaut à laquelle se rapporte `widgets` (le client repart de la
  // nouvelle disposition par défaut quand elle change).
  if (Number.isInteger(b.widgetsVersion) && b.widgetsVersion > 0 && b.widgetsVersion < 100) out.widgetsVersion = b.widgetsVersion;
  return out;
}

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
  return { jetonGithub: /^[A-Za-z0-9_]{20,255}$/.test(jeton) ? jeton : '' };
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
const CATEGORIES_RDV_DEFAUT = { office: 'Catégorie Verte', visio: 'Catégorie Violette', confrere: 'Catégorie Orange' };

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

function assainirReglagesExchange(brut, precedent) {
  const b = (brut && typeof brut === 'object') ? brut : {};
  const p = (precedent && typeof precedent === 'object') ? precedent : {};
  const url = texteNettoye(b.url) || texteNettoye(p.url) || URL_EWS_DEFAUT;
  const motDePasse = (typeof b.motDePasse === 'string') ? b.motDePasse : texteNettoye(p.motDePasse);
  return {
    actif: b.actif === true,
    // Toujours en https (NTLM sur du texte clair exposerait les identifiants) — un collage raté
    // retombe sur l'URL par défaut de Fichorga plutôt que d'enregistrer une adresse inutilisable.
    url: /^https:\/\//i.test(url) ? url : URL_EWS_DEFAUT,
    email: texteNettoye(b.email) || texteNettoye(p.email),
    motDePasse: motDePasse.trim(),
    // Adresse du calendrier PARTAGÉ où vivent les rendez-vous de l'office (celui de Sophie) —
    // vide si c'est le calendrier du compte de connexion lui-même. Quand elle est renseignée, les
    // opérations EWS ciblent le calendrier de cette boîte (voir ews.js, folderCalendrierXml) : le
    // compte de connexion doit alors avoir un accès délégué en écriture sur ce calendrier.
    calendrierPartage: texteNettoye(b.calendrierPartage) || texteNettoye(p.calendrierPartage),
    categoriesRdv: assainirCategoriesRdv(b.categoriesRdv, p.categoriesRdv)
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
    score: Number.isFinite(e.score) && e.score >= 0 ? Math.min(99, Math.round(e.score)) : null
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
    autres: emails(b.autres)
  };
}

function creerRepoParametres(db) {
  const lireStmt = db.prepare('SELECT valeur FROM parametres WHERE cle = ?');
  const ecrireStmt = db.prepare(
    'INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur'
  );

  function lireReglages() {
    const ligne = lireStmt.get(CLE_REGLAGES);
    if (!ligne) return { ...REGLAGES_PAR_DEFAUT, emailsResponsables: {}, fonctionsResponsables: {} };
    try {
      return assainirReglages(JSON.parse(ligne.valeur));
    } catch (e) {
      return { ...REGLAGES_PAR_DEFAUT, emailsResponsables: {}, fonctionsResponsables: {} };
    }
  }

  function ecrireReglages(reglages) {
    const propre = assainirReglages(reglages, lireReglages());
    ecrireStmt.run(CLE_REGLAGES, JSON.stringify(propre));
    return propre;
  }

  // Absent = la tâche n'a encore jamais tourné depuis l'installation (ou l'envoi n'a jamais été
  // configuré : un tour qui sort avant d'avoir rien tenté n'écrit rien, voir executerTacheRappels).
  function lireDernierTour() {
    const ligne = lireStmt.get(CLE_DERNIER_TOUR);
    if (!ligne) return null;
    try {
      return assainirDernierTour(JSON.parse(ligne.valeur));
    } catch (e) {
      return null;
    }
  }

  function ecrireDernierTour(resultat) {
    const propre = assainirDernierTour(resultat);
    ecrireStmt.run(CLE_DERNIER_TOUR, JSON.stringify(propre));
    return propre;
  }

  function lireCopiesEnAttente() {
    const ligne = lireStmt.get(CLE_COPIES_GMAIL);
    if (!ligne) return [];
    try {
      return assainirCopiesEnAttente(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireCopiesEnAttente(liste) {
    const propre = assainirCopiesEnAttente(liste);
    ecrireStmt.run(CLE_COPIES_GMAIL, JSON.stringify(propre));
    return propre;
  }

  function lireRetoursAudit() {
    const ligne = lireStmt.get(CLE_RETOURS_AUDIT);
    if (!ligne) return [];
    try {
      return assainirRetoursAudit(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireRetoursAudit(liste) {
    const propre = assainirRetoursAudit(liste);
    ecrireStmt.run(CLE_RETOURS_AUDIT, JSON.stringify(propre));
    return propre;
  }

  function lireReglagesClaude() {
    const ligne = lireStmt.get(CLE_REGLAGES_CLAUDE);
    if (!ligne) return assainirReglagesClaude({});
    try {
      return assainirReglagesClaude(JSON.parse(ligne.valeur));
    } catch (e) {
      return assainirReglagesClaude({});
    }
  }

  function ecrireReglagesClaude(reglages) {
    const propre = assainirReglagesClaude(reglages, lireReglagesClaude());
    ecrireStmt.run(CLE_REGLAGES_CLAUDE, JSON.stringify(propre));
    return propre;
  }

  // Secret des liens vers les pièces (voir liensPieces.js) : généré une seule fois, au premier
  // besoin, puis conservé en base — le changer rendrait invalides tous les liens déjà envoyés
  // dans Teams. Jamais exposé par une route.
  function lireSecretLiens() {
    const ligne = lireStmt.get(CLE_SECRET_LIENS);
    if (ligne && typeof ligne.valeur === 'string' && ligne.valeur.length >= 32) return ligne.valeur;
    const secret = require('node:crypto').randomBytes(32).toString('hex');
    ecrireStmt.run(CLE_SECRET_LIENS, secret);
    return secret;
  }

  function lireExclusionsPieces() {
    const ligne = lireStmt.get(CLE_EXCLUSIONS_PIECES);
    if (!ligne) return {};
    try {
      return assainirExclusionsPieces(JSON.parse(ligne.valeur));
    } catch (e) {
      return {};
    }
  }

  function ecrireExclusionsPieces(exclusions) {
    const propre = assainirExclusionsPieces(exclusions);
    ecrireStmt.run(CLE_EXCLUSIONS_PIECES, JSON.stringify(propre));
    return propre;
  }

  function lireCorrectionsApprises() {
    const ligne = lireStmt.get(CLE_CORRECTIONS_APPRISES);
    if (!ligne) return [];
    try {
      return assainirCorrectionsApprises(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireCorrectionsApprises(corrections) {
    const propre = assainirCorrectionsApprises(corrections);
    ecrireStmt.run(CLE_CORRECTIONS_APPRISES, JSON.stringify(propre));
    return propre;
  }

  function lireRappelsPerso() {
    const ligne = lireStmt.get(CLE_RAPPELS_PERSO);
    if (!ligne) return [];
    try {
      return assainirRappelsPerso(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireRappelsPerso(rappels) {
    const propre = assainirRappelsPerso(rappels);
    ecrireStmt.run(CLE_RAPPELS_PERSO, JSON.stringify(propre));
    return propre;
  }

  function lirePreferences() {
    const ligne = lireStmt.get(CLE_PREFERENCES);
    if (!ligne) return {};
    try {
      return assainirPreferences(JSON.parse(ligne.valeur));
    } catch (e) {
      return {};
    }
  }

  function ecrirePreferences(preferences) {
    const propre = assainirPreferences(preferences);
    ecrireStmt.run(CLE_PREFERENCES, JSON.stringify(propre));
    return propre;
  }

  function lireReglageSauvegarde() {
    const ligne = lireStmt.get(CLE_REGLAGE_SAUVEGARDE);
    try {
      const v = ligne ? JSON.parse(ligne.valeur) : {};
      return { dossier: texteBorne(v && v.dossier, 500) };
    } catch (e) {
      return { dossier: '' };
    }
  }

  function ecrireReglageSauvegarde(reglage) {
    const propre = { dossier: texteBorne(reglage && reglage.dossier, 500) };
    ecrireStmt.run(CLE_REGLAGE_SAUVEGARDE, JSON.stringify(propre));
    return propre;
  }

  function lireEtatSauvegarde() {
    const ligne = lireStmt.get(CLE_ETAT_SAUVEGARDE);
    try {
      return assainirEtatSauvegarde(ligne ? JSON.parse(ligne.valeur) : {});
    } catch (e) {
      return assainirEtatSauvegarde({});
    }
  }

  function ecrireEtatSauvegarde(etat) {
    const propre = assainirEtatSauvegarde(etat);
    ecrireStmt.run(CLE_ETAT_SAUVEGARDE, JSON.stringify(propre));
    return propre;
  }

  // Absent = jamais tenté depuis l'installation (voir executerEtEnregistrerTourAgenda).
  function lireDernierTourAgenda() {
    const ligne = lireStmt.get(CLE_DERNIER_TOUR_AGENDA);
    if (!ligne) return null;
    try {
      return assainirDernierTourAgenda(JSON.parse(ligne.valeur));
    } catch (e) {
      return null;
    }
  }

  function ecrireDernierTourAgenda(resultat) {
    const propre = assainirDernierTourAgenda(resultat);
    ecrireStmt.run(CLE_DERNIER_TOUR_AGENDA, JSON.stringify(propre));
    return propre;
  }

  function lireAbsencesAgenda() {
    const ligne = lireStmt.get(CLE_ABSENCES_AGENDA);
    if (!ligne) return [];
    try {
      return assainirAbsencesAgenda(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireAbsencesAgenda(absences) {
    const propre = assainirAbsencesAgenda(absences);
    ecrireStmt.run(CLE_ABSENCES_AGENDA, JSON.stringify(propre));
    return propre;
  }

  function lireCategoriesAgenda() {
    const ligne = lireStmt.get(CLE_CATEGORIES_AGENDA);
    if (!ligne) return [];
    try {
      return assainirCategoriesAgenda(JSON.parse(ligne.valeur));
    } catch (e) {
      return [];
    }
  }

  function ecrireCategoriesAgenda(categories) {
    const propre = assainirCategoriesAgenda(categories);
    ecrireStmt.run(CLE_CATEGORIES_AGENDA, JSON.stringify(propre));
    return propre;
  }

  function lireReglagesExchange() {
    const ligne = lireStmt.get(CLE_REGLAGES_EXCHANGE);
    if (!ligne) return assainirReglagesExchange({});
    try {
      return assainirReglagesExchange(JSON.parse(ligne.valeur));
    } catch (e) {
      return assainirReglagesExchange({});
    }
  }

  function ecrireReglagesExchange(reglages) {
    const propre = assainirReglagesExchange(reglages, lireReglagesExchange());
    ecrireStmt.run(CLE_REGLAGES_EXCHANGE, JSON.stringify(propre));
    return propre;
  }

  function lireReglagesMiseAJour() {
    const ligne = lireStmt.get(CLE_MISE_A_JOUR);
    if (!ligne) return assainirReglagesMiseAJour({});
    try {
      return assainirReglagesMiseAJour(JSON.parse(ligne.valeur));
    } catch (e) {
      return assainirReglagesMiseAJour({});
    }
  }

  function ecrireReglagesMiseAJour(reglages) {
    const propre = assainirReglagesMiseAJour(reglages, lireReglagesMiseAJour());
    ecrireStmt.run(CLE_MISE_A_JOUR, JSON.stringify(propre));
    return propre;
  }

  function lireJson(cle, assainir, defaut) {
    const ligne = lireStmt.get(cle);
    if (!ligne) return defaut;
    try { return assainir(JSON.parse(ligne.valeur)); } catch (e) { return defaut; }
  }
  function lireReglagesScans() { return lireJson(CLE_SCANS_REGLAGES, assainirReglagesScans, assainirReglagesScans({})); }
  function lireRapportTechnique() { return lireJson(CLE_RAPPORT_TECHNIQUE, assainirRapportTechnique, assainirRapportTechnique({})); }
  function ecrireRapportTechnique(r) { const p = assainirRapportTechnique(r); ecrireStmt.run(CLE_RAPPORT_TECHNIQUE, JSON.stringify(p)); return p; }
  function ecrireReglagesScans(r) { const p = assainirReglagesScans(r); ecrireStmt.run(CLE_SCANS_REGLAGES, JSON.stringify(p)); return p; }
  function lireJournalScans() { return lireJson(CLE_SCANS_JOURNAL, assainirJournalScans, []); }
  function ecrireJournalScans(j) { const p = assainirJournalScans(j); ecrireStmt.run(CLE_SCANS_JOURNAL, JSON.stringify(p)); return p; }
  function lireScansEcartes() { return lireJson(CLE_SCANS_ECARTES, assainirScansEcartes, []); }
  function lirePiecesNotifiees() { return lireJson(CLE_PIECES_NOTIFIEES, assainirPiecesNotifiees, {}); }
  function ecrirePiecesNotifiees(m) { const p = assainirPiecesNotifiees(m); ecrireStmt.run(CLE_PIECES_NOTIFIEES, JSON.stringify(p)); return p; }
  function ecrireScansEcartes(l) { const p = assainirScansEcartes(l); ecrireStmt.run(CLE_SCANS_ECARTES, JSON.stringify(p)); return p; }

  function lireResumeEmails() {
    const ligne = lireStmt.get(CLE_RESUME_EMAILS);
    if (!ligne) return null;
    try { return assainirResumeEmails(JSON.parse(ligne.valeur)); } catch (e) { return null; }
  }

  function ecrireResumeEmails(resume) {
    const propre = assainirResumeEmails(resume);
    ecrireStmt.run(CLE_RESUME_EMAILS, JSON.stringify(propre));
    return propre;
  }

  function lireCarnetConfreres() {
    const ligne = lireStmt.get(CLE_CARNET_CONFRERES);
    if (!ligne) return ecrireCarnetConfreres(carnetInitial());
    let carnet;
    try { carnet = assainirCarnet(JSON.parse(ligne.valeur)); } catch (e) { carnet = []; }
    const r = avecOfficeEtude(carnet);
    return r.ajoute ? ecrireCarnetConfreres(r.carnet) : carnet;
  }

  function ecrireCarnetConfreres(carnet) {
    const propre = assainirCarnet(carnet);
    ecrireStmt.run(CLE_CARNET_CONFRERES, JSON.stringify(propre));
    return propre;
  }

  function lireRepertoire() {
    const ligne = lireStmt.get(CLE_REPERTOIRE);
    if (!ligne) return ecrireRepertoire(repertoireInitial());
    try { return assainirRepertoire(JSON.parse(ligne.valeur)); } catch (e) { return []; }
  }

  function ecrireRepertoire(contacts) {
    const propre = assainirRepertoire(contacts);
    ecrireStmt.run(CLE_REPERTOIRE, JSON.stringify(propre));
    return propre;
  }

  return {
    lireRapportTechnique, ecrireRapportTechnique,
    lireReglagesScans, ecrireReglagesScans, lireJournalScans, ecrireJournalScans, lireScansEcartes, ecrireScansEcartes,
    lirePiecesNotifiees, ecrirePiecesNotifiees,
    lireCarnetConfreres, ecrireCarnetConfreres,
    lireRepertoire, ecrireRepertoire,
    lireResumeEmails, ecrireResumeEmails,
    lireReglagesMiseAJour, ecrireReglagesMiseAJour,
    lireReglagesExchange, ecrireReglagesExchange,
    lireDernierTourAgenda, ecrireDernierTourAgenda,
    lireAbsencesAgenda, ecrireAbsencesAgenda, lireCategoriesAgenda, ecrireCategoriesAgenda,
    lireReglageSauvegarde, ecrireReglageSauvegarde, lireEtatSauvegarde, ecrireEtatSauvegarde,
    lireReglages, ecrireReglages, lireDernierTour, ecrireDernierTour,
    lireCopiesEnAttente, ecrireCopiesEnAttente, lireRetoursAudit, ecrireRetoursAudit,
    lireReglagesClaude, ecrireReglagesClaude, lireSecretLiens,
    lireExclusionsPieces, ecrireExclusionsPieces, lireCorrectionsApprises, ecrireCorrectionsApprises,
    lireRappelsPerso, ecrireRappelsPerso, lirePreferences, ecrirePreferences
  };
}

module.exports = {
  assainirWidgetsPreference,
  creerRepoParametres, assainirReglages, assainirEtatSauvegarde, assainirExclusionsPieces, assainirCorrectionApprise, assainirCorrectionsApprises, MAX_CORRECTIONS_APPRISES, assainirDernierTour, assainirCopiesEnAttente,
  assainirRetourAudit, assainirRetoursAudit, MAX_RETOURS_AUDIT,
  assainirRappelPerso, assainirRappelsPerso, MAX_RAPPELS_PERSO, assainirPreference, assainirPreferences,
  assainirReglagesClaude, assainirReglagesMiseAJour, MODELES_CLAUDE, MODELE_CLAUDE_PAR_DEFAUT,
  assainirReglagesExchange, assainirCategoriesRdv, CATEGORIES_RDV_DEFAUT, URL_EWS_DEFAUT, assainirCategoriesAgenda,
  assainirDernierTourAgenda, assainirAbsenceAgenda, assainirAbsencesAgenda,
  REGLAGES_PAR_DEFAUT, PORT_SMTP_PAR_DEFAUT, assainirResumeEmails,
  assainirReglagesScans, assainirJournalScans, assainirScansEcartes, assainirPiecesNotifiees, assainirRapportTechnique
};

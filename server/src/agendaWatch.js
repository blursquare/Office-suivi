'use strict';

// Tour périodique de lecture de l'agenda de l'office (voir agendaOffice.js pour le parsing/
// rapprochement, tous deux purs). Même architecture que nasWatch.js/jobs/rappels.js : silencieux
// tant que l'URL n'est pas renseignée dans les Réglages, un seul tour à la fois (`enCours`), et un
// compte rendu écrit en base à chaque tour (voir parametresRepo.js) — sans lui, un flux devenu
// injoignable (URL de publication révoquée par Outlook, calendrier dépublié) s'arrêterait de mettre
// à jour les dossiers SANS QUE RIEN NE LE SIGNALE, exactement le défaut déjà corrigé une fois pour
// les rappels par email (voir CLE_DERNIER_TOUR dans parametresRepo.js).

const { actionsDetecteesDepuisIcs } = require('./agendaOffice');

const CHAMP_PAR_ACTION = { appelFonds: 'appelFonds', projetEnvoye: 'projetEnvoye' };
const LIBELLE_PAR_ACTION = { appelFonds: 'Envoi appel de fonds', projetEnvoye: 'Envoi projet' };
const ACTIONS_CONNUES = Object.keys(CHAMP_PAR_ACTION);

// Date du jour en heure de Paris (AAAA-MM-JJ) — le serveur tourne au bureau, mais `toISOString()`
// donnerait la date UTC, fausse entre minuit et 2 h.
function dateDuJourParis() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

// Applique les détections aux dossiers. Deux règles données par l'étude (25/09) :
//  • la date retenue est celle du JOUR DE LA DÉTECTION, pas celle du rendez-vous de l'agenda —
//    c'est le jour où l'envoi est constaté ;
//  • une action déjà relevée pour un dossier (d.detectionsAgenda[champ]) n'est PLUS JAMAIS
//    retraitée, même si la date est ensuite effacée ou corrigée à la main : sans ce repère, l'agenda
//    réécrirait la date à chaque tour avec la date du jour.
// Jamais non plus par-dessus une date DÉJÀ CONNUE (saisie manuelle) — le repère est alors posé quand
// même, pour que l'action ne soit plus reconsidérée. `depot` injecté : testable sans base réelle.
function appliquerDetectionsAgenda(depot, detections, aujourdHui) {
  const jour = aujourdHui || dateDuJourParis();
  const resultat = { misAJour: [], dejaRenseignes: [], sansCorrespondance: [] };
  for (const det of detections || []) {
    if (!det.dossierId) {
      resultat.sansCorrespondance.push({ reference: det.reference, resume: det.resume });
      continue;
    }
    // Relu à chaque itération (pas mis en cache) : deux détections de suite peuvent viser le MÊME
    // dossier (deux événements séparés, un par action) — la seconde doit voir l'écriture de la
    // première pour ne jamais la recompter comme "déjà renseigné" à tort ni la perdre.
    const d = depot.trouverParId(det.dossierId);
    if (!d || d.archive) continue;
    for (const action of ACTIONS_CONNUES) {
      if (!det[action]) continue;
      const champ = CHAMP_PAR_ACTION[action];
      // Déjà relevée lors d'un tour précédent : on ne repasse plus dessus, et on ne la compte pas
      // non plus dans le compte rendu (elle y reviendrait à chaque tour, pour rien).
      if (d.detectionsAgenda && d.detectionsAgenda[champ]) continue;
      d.detectionsAgenda = d.detectionsAgenda || {};
      d.detectionsAgenda[champ] = jour;
      if (d[champ]) {
        depot.remplacer(d.id, d);
        resultat.dejaRenseignes.push({ dossierId: d.id, dossierNom: d.nom, action });
        continue;
      }
      d[champ] = jour;
      d.echeancesValidees = d.echeancesValidees || {};
      d.echeancesValidees[champ] = true;
      d.historique = d.historique || [];
      d.historique.push({
        date: new Date().toISOString(),
        texte: `${LIBELLE_PAR_ACTION[action]} relevé dans l’agenda de l’office (« ${det.reference} »)`
      });
      depot.remplacer(d.id, d);
      resultat.misAJour.push({ dossierId: d.id, dossierNom: d.nom, action, dateIso: jour });
    }
  }
  return resultat;
}

// En-têtes envoyés au serveur du calendrier. Le `fetch` de Node n'envoie par défaut qu'un
// User-Agent « node » et `Accept: */*` : certains serveurs de calendriers publiés (Outlook/Office 365
// en tête) répondent alors 503 à une requête qu'ils servent sans difficulté à un navigateur ou à un
// client d'agenda. On se présente donc comme un client d'agenda ordinaire.
const ENTETES_LECTURE_ICS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9'
};

// Codes qui disent « réessayez plus tard » : une seule nouvelle tentative, après une courte pause.
const STATUTS_A_RELANCER = [429, 502, 503, 504];
const PAUSE_AVANT_RELANCE_MS = 3000;

// Une adresse copiée depuis Outlook commence parfois par `webcal://` (le protocole d'abonnement),
// que `fetch` ne sait pas ouvrir : c'est la même adresse en https.
function adresseLisibleIcs(url) {
  const brute = String(url || '').trim();
  return brute.replace(/^webcals?:\/\//i, 'https://');
}

// Message affiché dans les Réglages : le code seul ne dit rien à l'étude.
function messageErreurCalendrier(statut) {
  if (statut === 503 || statut === 502 || statut === 504 || statut === 429) {
    return `Le serveur du calendrier est indisponible pour l'instant (erreur ${statut}). ` +
      'CLAIRE réessaiera au prochain tour, dans 15 minutes.';
  }
  if (statut === 401 || statut === 403) {
    return `Le calendrier refuse l'accès (erreur ${statut}) : le lien de publication a peut-être été ` +
      'révoqué — republiez le calendrier et recollez le lien ICS.';
  }
  if (statut === 404) {
    return "Le calendrier est introuvable (erreur 404) : vérifiez que le lien collé est bien le lien ICS " +
      '(il se termine par calendar.ics), pas le lien HTML.';
  }
  return `Le calendrier a répondu une erreur (${statut}).`;
}

// Le texte d'une page d'erreur, sans balises ni adresses complètes : une page d'erreur de proxy
// recopie l'URL demandée, donc le jeton de publication du calendrier — chaque adresse est ramenée
// à son seul nom de domaine avant d'être affichée où que ce soit.
function texteSansAdresses(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;|&apos;|&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/(?:https?|webcals?):\/\/([^\s\/"'<>?#:]+)[^\s"'<>]*/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Un proxy Squid (celui du réseau du bureau, « nacXwan-Proxy ») répond à la place du site quand il
// n'arrive pas à le joindre. Il dit pourquoi dans l'en-tête `X-Squid-Error` et dans sa page : c'est
// ce qui distingue « le proxy ne trouve pas le site » (DNS) de « le proxy l'a trouvé mais ne peut
// pas s'y connecter » ou « le proxy l'interdit » — trois demandes différentes au prestataire réseau.
const CAUSES_SQUID = [
  { code: 'ERR_DNS_FAIL', motif: /impossible de d[ée]terminer l'adresse ip|unable to determine ip address/i,
    texte: "il ne trouve pas l'adresse du site (résolution DNS impossible depuis le proxy)" },
  { code: 'ERR_ACCESS_DENIED', motif: /acc[èe]s (?:refus|interdit)|access denied/i,
    texte: 'une règle de filtrage du proxy interdit ce site' },
  { code: 'ERR_SECURE_CONNECT_FAIL', motif: /connexion s[ée]curis[ée]e|secure connection/i,
    texte: 'la connexion sécurisée (https) avec le site a échoué' },
  { code: 'ERR_CONNECT_FAIL', motif: /tentative de connexion|connection to .* failed|connexion .* (?:refus|a [ée]chou)/i,
    texte: "il trouve le site mais n'arrive pas à s'y connecter" },
  { code: 'ERR_READ_TIMEOUT', motif: /d[ée]lai d'attente|read timeout|timed out/i,
    texte: 'le site ne répond pas à temps' },
  { code: 'ERR_LIFETIME_EXP', motif: null, texte: 'le site ne répond pas à temps' },
  { code: 'ERR_CONNECT_TIMEOUT', motif: null, texte: 'le site ne répond pas à temps' },
  { code: 'ERR_ZERO_SIZE_OBJECT', motif: /r[ée]ponse vide|zero sized reply/i,
    texte: 'le site a renvoyé une réponse vide' }
];

function lireEntete(reponse, nom) {
  try {
    return reponse && reponse.headers && typeof reponse.headers.get === 'function' ? reponse.headers.get(nom) : null;
  } catch (e) { return null; }
}

// `null` quand ce n'est pas un proxy qui a répondu ; sinon { nom, code, texte } — code et texte
// `null` quand le proxy ne dit pas pourquoi.
function causeProxy(reponse, corps) {
  const serveur = String(lireEntete(reponse, 'server') || '');
  const via = String(lireEntete(reponse, 'via') || '');
  const erreurSquid = String(lireEntete(reponse, 'x-squid-error') || '');
  if (!/squid/i.test(serveur) && !/squid/i.test(via) && !erreurSquid) return null;
  const nomVia = (via.match(/\d(?:\.\d)?\s+([^\s(,]+)/) || [])[1];
  const nom = nomVia || 'squid';
  const code = (erreurSquid.match(/ERR_[A-Z_]+/) || [])[0];
  let cause = code ? CAUSES_SQUID.find((c) => c.code === code) : null;
  if (!cause) cause = CAUSES_SQUID.find((c) => c.motif && c.motif.test(corps || ''));
  return { nom, code: cause ? cause.code : (code || null), texte: cause ? cause.texte : null };
}

function messageErreurProxy(proxy, hote, statut) {
  const pourquoi = proxy.texte ? ` : ${proxy.texte}` : '';
  return `Le proxy du réseau du bureau (« ${proxy.nom} ») n'a pas pu lire le calendrier sur ` +
    `${hote || 'internet'}${pourquoi} (erreur ${statut}${proxy.code ? `, ${proxy.code}` : ''}). ` +
    "Ce n'est ni le calendrier ni CLAIRE : demandez à votre prestataire réseau d'autoriser " +
    `${hote || 'ce site'} pour le poste qui héberge CLAIRE. CLAIRE réessaiera au prochain tour.`;
}

// Ce qui permet de savoir QUI a répondu l'erreur : le serveur du calendrier, ou un équipement du
// réseau du bureau (pare-feu, proxy) posé entre CLAIRE et internet. On n'y met JAMAIS le chemin de
// l'adresse, qui porte le jeton de publication du calendrier — seulement le nom de domaine, les
// en-têtes `server`/`via`/`x-squid-error`, un identifiant de requête et le texte renvoyé (lui-même
// débarrassé de toute adresse complète, voir texteSansAdresses).
function diagnosticDepuisCorps(reponse, adresse, corps) {
  const morceaux = [];
  try { morceaux.push(`hôte ${new URL(adresse).hostname}`); } catch (e) { /* adresse illisible */ }
  try { morceaux.push(`protocole ${new URL(adresse).protocol.replace(':', '')}`); } catch (e) { /* idem */ }
  const serveur = lireEntete(reponse, 'server');
  if (serveur) morceaux.push(`serveur « ${String(serveur).slice(0, 60)} »`);
  const via = lireEntete(reponse, 'via');
  if (via) morceaux.push(`via « ${String(via).slice(0, 60)} »`);
  const erreurSquid = lireEntete(reponse, 'x-squid-error');
  if (erreurSquid) morceaux.push(`code proxy ${String(erreurSquid).slice(0, 40)}`);
  const identifiant = lireEntete(reponse, 'request-id') || lireEntete(reponse, 'x-ms-request-id') || lireEntete(reponse, 'x-request-id');
  if (identifiant) morceaux.push(`requête ${String(identifiant).slice(0, 60)}`);
  const texte = texteSansAdresses(corps);
  if (texte) morceaux.push(`réponse « ${texte.slice(0, 400)}${texte.length > 400 ? '…' : ''} »`);
  return morceaux.length ? ` Détail technique : ${morceaux.join(' ; ')}.` : '';
}

async function lireCorpsErreur(reponse) {
  try {
    if (reponse && typeof reponse.text === 'function') return String(await reponse.text() || '');
  } catch (e) { /* corps illisible : on s'en passe */ }
  return '';
}

// Conservée pour les appelants existants : lit le corps puis rend le diagnostic.
async function diagnosticReponseIcs(reponse, adresse) {
  return diagnosticDepuisCorps(reponse, adresse, await lireCorpsErreur(reponse));
}

async function messageEchecLecture(reponse, adresse) {
  const corps = await lireCorpsErreur(reponse);
  let hote = '';
  try { hote = new URL(adresse).hostname; } catch (e) { /* adresse illisible */ }
  const proxy = causeProxy(reponse, texteSansAdresses(corps));
  const tete = proxy ? messageErreurProxy(proxy, hote, reponse.status) : messageErreurCalendrier(reponse.status);
  return { message: tete + diagnosticDepuisCorps(reponse, adresse, corps), proxy };
}

async function lireUneAdresse(f, adresse, pauseMs) {
  let reponse = await f(adresse, { headers: ENTETES_LECTURE_ICS, redirect: 'follow' });
  if (STATUTS_A_RELANCER.includes(reponse.status)) {
    await new Promise((r) => setTimeout(r, pauseMs == null ? PAUSE_AVANT_RELANCE_MS : pauseMs));
    reponse = await f(adresse, { headers: ENTETES_LECTURE_ICS, redirect: 'follow' });
  }
  return reponse;
}

// `infos` (facultatif) reçoit `adresseUtilisee` : l'adresse réellement lue, qui peut être la
// version https d'un lien enregistré en http (voir plus bas).
async function telechargerIcs(icsUrl, fetchFn, pauseMs, infos) {
  const f = fetchFn || fetch;
  const adresse = adresseLisibleIcs(icsUrl);
  let reponse = await lireUneAdresse(f, adresse, pauseMs);
  let adresseLue = adresse;
  if (!reponse.ok) {
    const echec = await messageEchecLecture(reponse, adresse);
    // Un lien en http:// passe par le proxy transparent du bureau, qui ne sait pas toujours le
    // servir ; Chrome, lui, passe de lui-même en https — c'est pourquoi le même lien s'ouvre dans le
    // navigateur. On tente donc la version https une fois avant d'abandonner.
    let reussi = false;
    if (/^http:\/\//i.test(adresse)) {
      const enHttps = adresse.replace(/^http:\/\//i, 'https://');
      try {
        const autre = await f(enHttps, { headers: ENTETES_LECTURE_ICS, redirect: 'follow' });
        if (autre && autre.ok) { reponse = autre; adresseLue = enHttps; reussi = true; }
      } catch (e) { /* https indisponible : l'erreur d'origine reste la plus parlante */ }
    }
    if (!reussi) throw new Error(echec.message);
  }
  const texte = await reponse.text();
  // Un lien HTML (la page « afficher le calendrier ») répond 200 mais ne contient aucun événement :
  // le dire plutôt que de rendre « 0 dossier mis à jour » comme si tout allait bien.
  if (!/BEGIN:VCALENDAR/i.test(texte)) {
    throw new Error("Le lien ne renvoie pas un calendrier : collez le lien ICS (il se termine par calendar.ics), pas le lien HTML.");
  }
  if (infos) infos.adresseUtilisee = adresseLue;
  return texte;
}

// Un seul tour de lecture : télécharge le flux, détecte, applique. `fetchFn` injectable (tests) —
// la vraie fonction par défaut est le `fetch` global de Node. `pauseMs` : pause avant la relance
// (injectable pour que les tests ne patientent pas trois secondes).
async function executerTourSurveillanceAgenda(depot, icsUrl, fetchFn, pauseMs) {
  const resultat = {
    ok: false, dossiersVerifies: 0, misAJour: [], dejaRenseignes: [], sansCorrespondance: [], erreur: null
  };
  if (!icsUrl) {
    resultat.erreur = "Aucune adresse d'agenda enregistrée.";
    return resultat;
  }
  try {
    const infos = {};
    const texte = await telechargerIcs(icsUrl, fetchFn, pauseMs, infos);
    if (infos.adresseUtilisee && infos.adresseUtilisee !== adresseLisibleIcs(icsUrl)) {
      resultat.adresseCorrigee = infos.adresseUtilisee;
    }
    const dossiersActifs = depot.tousActifs().filter((d) => !d.archive);
    resultat.dossiersVerifies = dossiersActifs.length;
    const detections = actionsDetecteesDepuisIcs(texte, dossiersActifs);
    const applique = appliquerDetectionsAgenda(depot, detections);
    resultat.ok = true;
    resultat.misAJour = applique.misAJour;
    resultat.dejaRenseignes = applique.dejaRenseignes;
    resultat.sansCorrespondance = applique.sansCorrespondance;
  } catch (e) {
    resultat.erreur = e.message;
  }
  return resultat;
}

// Un tour, ET son compte rendu persisté — factorisé pour être appelé aussi bien par le minuteur
// automatique que par le bouton « Tester maintenant » des Réglages (voir routes/agenda.js), comme
// executerTacheRappels()/le bouton « Lancer un tour maintenant » pour les rappels par email.
async function executerEtEnregistrerTourAgenda(depot, parametresRepo, fetchFn, declenche) {
  const reglages = parametresRepo.lireReglagesAgenda();
  const resultat = await executerTourSurveillanceAgenda(depot, reglages.icsUrl, fetchFn);
  // Le lien enregistré en http n'a pu être lu qu'en https : on garde la version qui fonctionne,
  // sans quoi chaque tour repasserait d'abord par l'échec du proxy.
  if (resultat.adresseCorrigee) {
    parametresRepo.ecrireReglagesAgenda({ ...reglages, icsUrl: resultat.adresseCorrigee });
  }
  const { adresseCorrigee, ...compteRendu } = resultat;
  parametresRepo.ecrireDernierTourAgenda({
    ...compteRendu,
    lienPasseEnHttps: Boolean(adresseCorrigee),
    at: new Date().toISOString(),
    declenche: declenche === 'manuel' ? 'manuel' : 'automatique'
  });
  // Jamais l'adresse elle-même dans la réponse : elle porte le jeton de publication.
  return { ...compteRendu, lienPasseEnHttps: Boolean(adresseCorrigee) };
}

// 15 minutes : ni aussi rapproché que le sondage de synchronisation du client (7 s, pensé pour un
// travail collaboratif en direct), ni aussi espacé que la surveillance du NAS (10 min, un simple
// nouveau fichier n'étant jamais urgent) — un appel de fonds ou un envoi de projet notés au
// calendrier n'ont pas besoin d'être répercutés à la minute près sur la fiche du dossier.
const INTERVALLE_SURVEILLANCE_AGENDA_MS = 15 * 60 * 1000;

function demarrerSurveillanceAgenda(depot, parametresRepo, fetchFn, intervalleMs) {
  // Même garde-fou que la surveillance du NAS : un tour plus lent que l'intervalle (agenda
  // volumineux, réseau lent) ne doit jamais en voir un second démarrer par-dessus.
  let enCours = false;
  const tour = async () => {
    const reglages = parametresRepo.lireReglagesAgenda();
    if (!reglages.icsUrl || enCours) return;
    enCours = true;
    try {
      await executerEtEnregistrerTourAgenda(depot, parametresRepo, fetchFn, 'automatique');
    } catch (e) {
      console.warn('[CLAIRE] Surveillance de l’agenda de l’office interrompue :', e.message);
    } finally {
      enCours = false;
    }
  };
  tour(); // un premier passage tout de suite, pas seulement au bout de quinze minutes
  return setInterval(tour, intervalleMs || INTERVALLE_SURVEILLANCE_AGENDA_MS);
}

module.exports = {
  adresseLisibleIcs, messageErreurCalendrier, diagnosticReponseIcs, ENTETES_LECTURE_ICS,
  texteSansAdresses, causeProxy, telechargerIcs,
  appliquerDetectionsAgenda, dateDuJourParis, executerTourSurveillanceAgenda, executerEtEnregistrerTourAgenda,
  demarrerSurveillanceAgenda, INTERVALLE_SURVEILLANCE_AGENDA_MS
};

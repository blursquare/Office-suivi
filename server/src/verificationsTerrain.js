'use strict';

// Vérifications sur le terrain (étude, 03/10 : « lors de l'envoi d'une mise à jour, te mettre une
// check-list de choses à vérifier dans CLAIRE qui se coche si c'est fait et te remonte ça lors des
// rapports »). Ce que l'environnement de développement ne peut pas éprouver (Exchange réel, Windows,
// 3CX, Ollama, NAS…) : chaque point se coche SEUL la première fois que CLAIRE observe le geste réussir
// au bureau (mode « auto », noté par le serveur ou par une fenêtre CLAIRE), ou se confirme d'un clic
// dans Réglages › Mise à jour et sauvegarde quand seul un œil peut le dire (mode « manuel » : un logo
// visible, une icône nette). Le rapport technique (12 h, 17 h) en reprend l'état.
//
// À chaque mise à jour qui apporte un geste non vérifiable ici : ajouter son point ci-dessous (`depuis`
// = VERSION_APP de la mise à jour) et l'appel `noterVerification` là où le geste réussit.
//
// Rien de personnel n'est gardé : un état, des dates, un nombre, et un `detail` réduit à un court
// texte technique (jamais un nom, une adresse, un numéro) — de toute façon repassé par
// anonymiserTexte dans le rapport.

const CLE_VERIFICATIONS = 'verifications-terrain';

// `source` : 'serveur' (noté par le serveur), 'poste' (noté par une fenêtre CLAIRE, POST
// /api/verifications-terrain/noter — seuls ces points-là y sont acceptés) ou 'manuel'.
const VERIFICATIONS_TERRAIN = [
  { id: 'nas-noms-parcours', depuis: '2026-10-03 08:13', source: 'serveur', titre: 'Noms de fichiers du NAS : dossier commun parcouru en entier',
    comment: 'Coché quand le parcours de tous les dossiers clients du commun se termine (détail : nombre de dossiers et de PDF).' },
  { id: 'formes-noms-reconnaissance', depuis: '2026-10-03 08:13', source: 'poste', titre: 'Une forme de nom validée dans l’outil a reconnu une pièce d’un dossier',
    comment: 'Coché la première fois qu’une forme validée (« oui ») fait reconnaître une pièce que les motifs fixes ne voyaient pas.' },
  { id: 'maj-auto', depuis: '2026-10-03 07:09', source: 'serveur', titre: 'Mise à jour automatique installée, serveur redémarré sur la nouvelle version',
    comment: 'Coché au démarrage qui suit une installation automatique, si le build en marche est celui qui a été installé.' },
  { id: 'notification-navigateur', depuis: '2026-10-03 07:27', source: 'poste', titre: 'Notification Windows/Chrome envoyée (pièce trouvée)',
    comment: 'Coché quand une fenêtre CLAIRE cachée a pu afficher une notification (permission accordée, réglage du poste actif).' },
  { id: 'notification-logo', depuis: '2026-10-03 07:27', source: 'manuel', titre: 'Le logo de CLAIRE apparaît dans la notification Windows',
    comment: 'À confirmer à l’œil à la prochaine notification « Nouvelle(s) pièce(s) trouvée(s) ».' },
  { id: 'actes-agenda-historique', depuis: '2026-10-03 07:19', source: 'serveur', titre: 'Statistiques : historique de l’agenda lu sur deux années (actes à l’agenda)',
    comment: 'Coché quand tous les mois de l’année précédente et de l’année en cours ont été lus dans Exchange.' },
  { id: 'actes-agenda-chiffres', depuis: '2026-10-03 07:19', source: 'manuel', titre: 'Statistiques : ventes, successions et donations conformes à l’agenda',
    comment: 'À confirmer en comparant un mois avec l’agenda d’Outlook (titres VTE, SUCC, DONATION).' },
  { id: 'fenetres-rechargees', depuis: '2026-10-03 10:32', source: 'poste', titre: 'Après une mise à jour automatique, une fenêtre CLAIRE déjà ouverte s’est rechargée seule sur la nouvelle version',
    comment: 'Coché la première fois qu’une fenêtre voit le serveur redémarrer sur une autre version et se recharge.' },
  { id: 'emails-dossier-rattrapage', depuis: '2026-10-03 10:32', source: 'serveur', titre: 'Emails des dossiers : dossier tout juste créé, ses emails des 30 derniers jours retrouvés',
    comment: 'Coché la première fois qu’un email reçu avant la création d’un dossier lui est rattaché (par l’adresse ou par l’objet).' },
  { id: 'emails-adresse-rattrapage', depuis: '2026-10-03 10:06', source: 'serveur', titre: 'Emails des dossiers : adresse ajoutée sur une fiche, ses emails des 30 derniers jours retrouvés',
    comment: 'Coché la première fois qu’un email reçu avant la saisie de l’adresse (client ou confrère) est rattaché au dossier.' },
  { id: 'emails-dossiers-reception', depuis: '2026-10-02 23:01', source: 'serveur', titre: 'Emails des dossiers : un email reçu rattaché à un dossier et lu en entier',
    comment: 'Coché au premier tour qui lit un email de la boîte de réception rattaché à un dossier.' },
  { id: 'emails-envoyes-collaborateur', depuis: '2026-10-02 23:01', source: 'serveur', titre: 'Emails des dossiers : « Éléments envoyés » d’un collaborateur lus (accès délégué)',
    comment: 'Coché quand la boîte d’envoi d’un collaborateur a pu être lue ; en échec tant que l’accès « Relecteur » n’est pas donné dans Outlook.' },
  { id: 'email-prepare-envoye', depuis: '2026-10-02 23:01', source: 'serveur', titre: 'Un email préparé par CLAIRE retrouvé dans les envoyés (« envoyé le … »)',
    comment: 'Coché la première fois qu’un .eml préparé est retrouvé envoyé.' },
  { id: 'email-resume-ia', depuis: '2026-10-02 23:01', source: 'serveur', titre: 'Résumé d’un email par l’IA locale (Ollama)',
    comment: 'Coché au premier résumé rendu ; en échec si l’IA est indisponible ou ne répond pas.' },
  { id: 'piece-jointe-nas', depuis: '2026-10-02 23:16', source: 'serveur', titre: 'Pièce jointe d’un email rangée dans le dossier client du NAS',
    comment: 'Coché à la première copie réussie sur le NAS.' },
  { id: 'installation-poste', depuis: '2026-10-02 23:16', source: 'serveur', titre: '« CLAIRE en application » installé sur un poste (script .vbs exécuté)',
    comment: 'Coché quand l’installateur d’un poste télécharge l’icône de CLAIRE : le script a bien tourné sous Windows.' },
  { id: 'installation-poste-icone', depuis: '2026-10-02 23:16', source: 'manuel', titre: 'Poste installé : icône de CLAIRE nette dans la barre des tâches',
    comment: 'À confirmer à l’œil sur un poste installé.' },
  { id: '3cx-sonnerie', depuis: '2026-10-01 18:05', source: 'serveur', titre: '3CX : une sonnerie reçue avec un numéro lisible',
    comment: 'Coché à la première sonnerie dont le numéro a une forme de numéro (détail : forme du numéro, jamais le numéro).' },
  { id: '3cx-appelant-reconnu', depuis: '2026-10-01 18:05', source: 'serveur', titre: '3CX : un appelant reconnu (dossier, confrère ou répertoire)',
    comment: 'Coché au premier appelant reconnu.' },
  { id: 'agenda-soft-delete', depuis: '2026-10-01 18:04', source: 'serveur', titre: 'Agenda : suppression rattrapée par « SoftDelete » (compte délégué)',
    comment: 'Coché la première fois que le repli a servi et réussi.' },
  { id: 'sondage-reponse', depuis: '2026-10-01 00:27', source: 'serveur', titre: 'Sondage de créneaux : une réponse relevée dans la boîte',
    comment: 'Coché à la première réponse comptée.' },
  { id: 'visio-ics', depuis: '2026-10-01 15:37', source: 'poste', titre: 'Visio ADNOV : lien lu dans une invitation .ics',
    comment: 'Coché quand une invitation déposée donne un lien de visio.' }
];
const PAR_ID = new Map(VERIFICATIONS_TERRAIN.map((v) => [v.id, v]));

function texteTechnique(v, max = 80) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function dateValide(v) { return typeof v === 'string' && !isNaN(Date.parse(v)) ? v.slice(0, 40) : null; }
function entier(v) { return Number.isInteger(v) && v >= 0 ? v : 0; }

// Pure : état gardé, points inconnus retirés.
function assainirVerifications(brut) {
  const sortie = {};
  for (const [id, e] of Object.entries(brut && typeof brut === 'object' ? brut : {})) {
    if (!PAR_ID.has(id) || !e || typeof e !== 'object') continue;
    sortie[id] = {
      premiereFois: dateValide(e.premiereFois), derniereFois: dateValide(e.derniereFois), fois: entier(e.fois),
      detail: texteTechnique(e.detail), echecs: entier(e.echecs), dernierEchec: dateValide(e.dernierEchec),
      messageEchec: texteTechnique(e.messageEchec, 160), confirmeLe: dateValide(e.confirmeLe), infirmeLe: dateValide(e.infirmeLe)
    };
  }
  return sortie;
}

// Pure : nouvel état après une observation. `ok` false = le geste a été tenté et a échoué.
function appliquerObservation(etat, id, { ok = true, detail = '', message = '' } = {}, maintenant = new Date().toISOString()) {
  if (!PAR_ID.has(id)) return etat;
  const e = { ...(etat[id] || { premiereFois: null, derniereFois: null, fois: 0, detail: '', echecs: 0, dernierEchec: null, messageEchec: '', confirmeLe: null, infirmeLe: null }) };
  if (ok) {
    e.premiereFois = e.premiereFois || maintenant;
    e.derniereFois = maintenant;
    e.fois = (e.fois || 0) + 1;
    if (detail) e.detail = texteTechnique(detail);
  } else {
    e.echecs = (e.echecs || 0) + 1;
    e.dernierEchec = maintenant;
    e.messageEchec = texteTechnique(message || detail, 160);
  }
  return { ...etat, [id]: e };
}

// Pure : statut d'un point — 'verifie', 'echec' (tenté, jamais réussi, ou infirmé à la main), 'attente'.
function statutVerification(def, e) {
  if (!e) return 'attente';
  if (def.source === 'manuel') {
    if (e.infirmeLe && (!e.confirmeLe || e.infirmeLe > e.confirmeLe)) return 'echec';
    return e.confirmeLe ? 'verifie' : 'attente';
  }
  if (e.premiereFois) return 'verifie';
  return e.echecs ? 'echec' : 'attente';
}

function lireVerifications(parametresRepo) {
  return assainirVerifications(parametresRepo && parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_VERIFICATIONS, {}) : {});
}

// Note une observation ; jamais bloquant pour le geste lui-même. Une observation réussie déjà
// vérifiée n'est réécrite qu'au plus une fois par heure (les tours toutes les minutes ne réécrivent
// pas la base à chaque fois).
function noterVerification(parametresRepo, id, observation = {}) {
  try {
    if (!parametresRepo || !parametresRepo.ecrireJsonBrut || !PAR_ID.has(id)) return;
    const etat = lireVerifications(parametresRepo);
    const prec = etat[id];
    const ok = observation.ok !== false;
    const recent = (d) => d && Date.now() - Date.parse(d) < 3600 * 1000;
    if (ok && prec && recent(prec.derniereFois) && (!observation.detail || texteTechnique(observation.detail) === prec.detail)) return;
    if (!ok && prec && recent(prec.dernierEchec) && texteTechnique(observation.message || observation.detail, 160) === prec.messageEchec) return;
    parametresRepo.ecrireJsonBrut(CLE_VERIFICATIONS, appliquerObservation(etat, id, observation));
  } catch (_) { /* jamais bloquant */ }
}

// Confirmation (ou infirmation) à la main d'un point « manuel ».
function confirmerVerification(parametresRepo, id, confirme, maintenant = new Date().toISOString()) {
  const def = PAR_ID.get(id);
  if (!def || def.source !== 'manuel') return null;
  const etat = lireVerifications(parametresRepo);
  const e = { ...(etat[id] || {}) };
  if (confirme) { e.confirmeLe = maintenant; e.infirmeLe = null; } else { e.infirmeLe = maintenant; }
  const propre = assainirVerifications({ ...etat, [id]: e });
  parametresRepo.ecrireJsonBrut(CLE_VERIFICATIONS, propre);
  return propre[id];
}

// Pure : liste pour l'écran et le rapport, la plus récente mise à jour d'abord.
function listeVerifications(etat) {
  return VERIFICATIONS_TERRAIN.map((def) => ({ ...def, etat: etat[def.id] || null, statut: statutVerification(def, etat[def.id]) }))
    .sort((a, b) => String(b.depuis).localeCompare(String(a.depuis)));
}

// Pure : section du rapport technique. `anonymiser` = anonymiserTexte déjà lié aux mots sensibles.
function sectionVerificationsTerrain(etat, depuis, jusqua, anonymiser = (t) => t, dateHeure = (d) => d) {
  const liste = listeVerifications(etat);
  const dans = (d) => d && d > depuis && d <= jusqua;
  const verifies = liste.filter((v) => v.statut === 'verifie');
  const L = ['', `## Vérifications sur le terrain (${verifies.length}/${liste.length} vérifiées)`];
  const icone = { verifie: '✅', echec: '⚠️', attente: '⬜' };
  for (const v of liste) {
    const e = v.etat || {};
    let etatTexte;
    if (v.statut === 'verifie') {
      etatTexte = v.source === 'manuel' ? `confirmé le ${dateHeure(e.confirmeLe)}`
        : `vérifié le ${dateHeure(e.premiereFois)}${e.fois > 1 ? ` · ${e.fois} fois` : ''}${dans(e.premiereFois) ? ' · **nouveau**' : ''}`;
    } else if (v.statut === 'echec') {
      etatTexte = v.source === 'manuel' ? `signalé comme ne fonctionnant pas le ${dateHeure(e.infirmeLe)}`
        : `${e.echecs} échec(s), dernier le ${dateHeure(e.dernierEchec)}`;
    } else etatTexte = v.source === 'manuel' ? 'à confirmer à la main (Réglages › Mise à jour et sauvegarde)' : 'pas encore observé';
    const detail = e.detail && v.statut === 'verifie' ? ` · ${anonymiser(e.detail)}` : '';
    const message = e.messageEchec && (v.statut === 'echec' || dans(e.dernierEchec)) ? ` · dernier échec : \`${anonymiser(e.messageEchec).replace(/`/g, 'ˋ')}\`` : '';
    L.push(`- ${icone[v.statut]} ${v.titre} (depuis ${v.depuis}) — ${etatTexte}${detail}${message}`);
  }
  return L;
}

// Pure : échecs survenus sur la période (pour « À examiner »).
function echecsVerificationsPeriode(etat, depuis, jusqua) {
  return listeVerifications(etat).filter((v) => {
    const e = v.etat || {};
    const d = v.source === 'manuel' ? (v.statut === 'echec' ? e.infirmeLe : null) : e.dernierEchec;
    return d && d > depuis && d <= jusqua;
  });
}

// Forme d'un numéro de téléphone, sans le numéro : « +33 et 9 chiffres », « 10 chiffres (0…) ».
function formeNumero(numero) {
  const brut = String(numero || '').trim();
  const chiffres = brut.replace(/\D/g, '');
  if (!chiffres) return 'sans chiffre';
  if (brut.startsWith('+')) return `+${chiffres.slice(0, 2)} et ${chiffres.length - 2} chiffres`;
  if (chiffres.startsWith('00')) return `00${chiffres.slice(2, 4)} et ${chiffres.length - 4} chiffres`;
  return `${chiffres.length} chiffres${chiffres.startsWith('0') ? ' (0…)' : ''}`;
}

module.exports = {
  VERIFICATIONS_TERRAIN, CLE_VERIFICATIONS, assainirVerifications, appliquerObservation, statutVerification,
  lireVerifications, noterVerification, confirmerVerification, listeVerifications, sectionVerificationsTerrain,
  echecsVerificationsPeriode, formeNumero
};

// CLAIRE voit où l'on est dans Authentic (étude 26/10 : « elle peut voir en temps réel sur quel onglet de Fichorga on est ; elle peut donc
// envoyer des messages au collaborateur pour lui préparer quelque chose si besoin »). La fenêtre CLAIRE du poste reçoit déjà chaque page que
// l'extension relève : on retient seulement sa NATURE (page du dossier, fiche client, fiche bien) et ses onglets actifs, jamais une valeur.
// Deux usages : l'agent en est informé (en-tête de la question, `contexte.authentic`), et quand on ouvre un dossier dans Authentic pour lequel
// CLAIRE a quelque chose de prêt, elle le dit (une carte discrète, une fois par dossier et par demi-journée, jamais hors des heures d'ouverture).

var presenceAuthentic = { nature: '', onglets: [], t: 0 };
var DUREE_PRESENCE_AUTHENTIC_MS = 3 * 60 * 1000;
var INTERVALLE_NUDGE_AUTHENTIC_MS = 5 * 1000;
var CLE_NUDGES_AUTHENTIC = 'claire-nudges-authentic:';

// Pure : « la page du dossier », « une fiche client », « une fiche bien » — ou '' si la page n'est pas de structure connue.
function natureLisiblePageAuthentic(type) {
  return type === 'dossier' ? 'la page du dossier' : type === 'client' ? 'une fiche client' : type === 'bien' ? 'une fiche bien' : '';
}

// Pure : les titres des onglets ACTIFS qui ne portent pas l'intitulé d'un dossier (l'intitulé nomme des clients, il ne part jamais comme « onglet »).
function ongletsActifsAuthentic(capture) {
  const liste = capture && Array.isArray(capture.onglets) ? capture.onglets : [];
  return liste.filter(o => o && o.actif && o.titre && !/\d+\s*-\s*\S|\bVTE\b|\bSUCC\b|\/|\s-\s/i.test(String(o.titre))).map(o => String(o.titre).trim().slice(0, 60)).slice(0, 2);
}

// Appelée à chaque page relevée PAR L'EXTENSION DE CE POSTE (client/30, `appliquerReleveAuthentic`, `memePoste` du serveur) : une page
// prise pour un poste sans fenêtre CLAIRE ne dit rien de la personne d'ici.
function noterPresenceAuthentic(capture) {
  try {
    const nature = natureLisiblePageAuthentic(typePageAuthentic(capture));
    if (!nature) return;
    presenceAuthentic = { nature, onglets: ongletsActifsAuthentic(capture), t: Date.now() };
  } catch (e) { /* facultatif : la présence n'a jamais le droit de gêner la lecture d'une page */ }
}

// Ce que l'agent reçoit : la nature de la page, l'onglet, le dossier reconnu SÛREMENT (libellé masqué par le serveur) — ou rien si c'est ancien.
function contexteAuthentic() {
  if (!presenceAuthentic.nature || Date.now() - presenceAuthentic.t > DUREE_PRESENCE_AUTHENTIC_MS) return null;
  const d = typeof courantSurAuthentic === 'function' ? courantSurAuthentic() : null;
  return { nature: presenceAuthentic.nature, onglet: presenceAuthentic.onglets.join(' / '), dossierLibelle: d ? libelleDossierAffiche(d) : '' };
}

// Pure : les idées que CLAIRE a pour ce dossier, dites en une ligne chacune — ce qu'elle a préparé en attente de décision, les pièces qui bloquent,
// les gestes dus. Rien = pas de carte (jamais un message pour dire qu'il n'y a rien).
function ideesPourDossierAuthentic(nbPropositions, nbPieces, nbGestes) {
  const l = [];
  // Court, comme une collègue (étude 27/10).
  if (nbPropositions) l.push(`${nbPropositions} décision${nbPropositions > 1 ? 's' : ''} à prendre`);
  if (nbPieces) l.push(`${nbPieces} pièce${nbPieces > 1 ? 's' : ''} qui manque${nbPieces > 1 ? 'nt' : ''}`);
  if (nbGestes) l.push(`${nbGestes} chose${nbGestes > 1 ? 's' : ''} à faire`);
  return l;
}

// Pure : la carte ne se montre qu'aux heures d'ouverture, et une fois par dossier et par demi-journée.
function nudgeAuthentiqueAutorise(moment, dernier, maintenant) {
  if (!moment || !moment.ouvre || moment.moment === 'pause de midi') return false;
  return !(Number(dernier) > 0 && maintenant - Number(dernier) < 4 * 60 * 60 * 1000);
}

function lireNudgesAuthentic() {
  try { return JSON.parse(localStorage.getItem(CLE_NUDGES_AUTHENTIC + (utilisateurPoste || '')) || '{}') || {}; } catch (e) { return {}; }
}

function verifierNudgeAuthentic() {
  if (!utilisateurPoste || !presenceAuthentic.nature || Date.now() - presenceAuthentic.t > 60 * 1000) return;
  const d = typeof courantSurAuthentic === 'function' ? courantSurAuthentic() : null;
  if (!d || d.archive) return;
  const nudges = lireNudgesAuthentic();
  if (!nudgeAuthentiqueAutorise(momentDeLaJournee(new Date()), nudges[d.id], Date.now())) return;
  const auj = isoAujourdhuiLocal();
  const nbProp = (propositionsClaire.liste || []).filter(p => p.dossierId === d.id && propositionADecider(p)).length;
  const nbPieces = estSuccession(d) ? 0 : (piecesAttenduesDossier(d) || []).length;
  const nbGestes = actionsDuJour([d], auj).actions.filter(a => a.dossier && a.dossier.id === d.id).length;
  const idees = ideesPourDossierAuthentic(nbProp, nbPieces, nbGestes);
  nudges[d.id] = Date.now();   // même sans idée : on ne refait pas le calcul à chaque tour
  ecrireLocal(CLE_NUDGES_AUTHENTIC + utilisateurPoste, JSON.stringify(nudges));
  if (!idees.length) return;
  try { noterVerificationPoste('presence-authentic', { detail: 'carte montrée' }); } catch (e) { /* rapport facultatif */ }
  // Un message de CLAIRE dans sa conversation (étude 27/10 : « tu peux en faire un message de conversation »), plus une carte à part ;
  // la carte du relais vient de ce message, une fois.
  deposerMessageClairePourMoi(`Sur ${libelleDossierAffiche(d)} : ${idees.join(', ')}.`, { cle: 'authentic:' + d.id + ':' + auj, sorte: 'authentic', dossierId: d.id });
}

if (typeof window !== 'undefined' && typeof setInterval === 'function') setInterval(verifierNudgeAuthentic, INTERVALLE_NUDGE_AUTHENTIC_MS);

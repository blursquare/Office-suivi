// ==== « Demander à CLAIRE » : une réponse apparaît d'un bloc, en fondu (étude 26/10) ====
//
// Avant (étude 22/10), le texte se révélait caractère par caractère après les trois points d'attente : « c'est pas joli » (étude 26/10). La
// réponse est maintenant posée d'un seul coup avec un court fondu (220 ms, opacité et position seulement) ; « réduire les animations » du
// système : aucun effet. Aucune donnée n'est modifiée : c'est de l'affichage.
// Même fichier : la conversation reste collée en bas quand la zone de saisie change de hauteur (les suites rapides apparaissent après
// la première réponse et poussaient l'indicateur « CLAIRE écrit » sous le champ).

var revelationAssistant = { apparition: null, observe: false };

function arreterRevelationAssistant() {
  revelationAssistant.apparition = null;
}

/** Une réponse vient d'être posée : elle apparaît en fondu (sauf « réduire les animations »), le temps de l'effet seulement. @param {any} message */
function lancerRevelationAssistant(message) {
  arreterRevelationAssistant();
  if (!message || mouvementReduit()) return;
  revelationAssistant.apparition = message;
  setTimeout(() => { if (revelationAssistant.apparition === message) revelationAssistant.apparition = null; }, 450);
}

// Une réponse que CLAIRE donne sans passer par l'IA (lecture par mots-clés, gestes du poste) arrivait presque aussitôt : elle « réfléchit » au
// moins 2 secondes, les trois points visibles, comme pour une réponse de l'IA (étude 26/10). Pas de pause avec « réduire les animations ».
var LATENCE_MINI_REPONSE_ASSISTANT_MS = 2000;

/** Pure : le temps qu'il reste à attendre pour que la réponse ait mis 2 s à venir. @param {number} debut @param {number} maintenant */
function resteReflexionAssistantMs(debut, maintenant) {
  const ecoule = Math.max(0, (Number(maintenant) || 0) - (Number(debut) || 0));
  return Math.max(0, LATENCE_MINI_REPONSE_ASSISTANT_MS - ecoule);
}

/** Attend, trois points affichés, jusqu'à 2 s après `debut` (Date.now() au moment de la question). @param {number} debut */
function pauseReflexionAssistant(debut) {
  const reste = mouvementReduit() ? 0 : resteReflexionAssistantMs(debut, Date.now());
  return reste > 0 ? new Promise((resolve) => setTimeout(resolve, reste)) : Promise.resolve();
}

/** Ce message est-il en train d'apparaître (classe `asst-apparait`) ? Un redessin au-delà de 450 ms ne rejoue pas l'effet. @param {any} message */
function messageEnApparitionAssistant(message) { return !!message && revelationAssistant.apparition === message; }

function suivreBasConversationAssistant(zone) {
  if (revelationAssistant.observe || !zone || typeof ResizeObserver === 'undefined') return;
  const bas = document.querySelector('.asst-bas');
  if (!bas) return;
  revelationAssistant.observe = true;
  new ResizeObserver(() => {
    const z = document.getElementById('assistant-messages');
    if (z && (assistantEnCours || z.scrollHeight - z.scrollTop - z.clientHeight < 160)) z.scrollTop = z.scrollHeight;
  }).observe(bas);
}

/** Fin de `renderAssistant` : la conversation reste en bas pendant « CLAIRE écrit ». @param {HTMLElement} zone */
function reprendreRevelationAssistant(zone) {
  suivreBasConversationAssistant(zone);
  if (assistantEnCours) requestAnimationFrame(() => { zone.scrollTop = zone.scrollHeight; });
}

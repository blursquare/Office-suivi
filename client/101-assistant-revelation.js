// ==== « Demander à CLAIRE » : la réponse s'écrit peu à peu, comme dans Claude (étude 22/10) ====
//
// Une réponse posée par CLAIRE n'apparaît plus d'un bloc : son texte se révèle caractère par caractère (2 à 3 s au plus, quelle que soit
// la longueur), les boutons et « Copier » n'apparaissent qu'à la fin. Seuls les NŒUDS TEXTE sont raccourcis — la mise en forme, les liens
// et les tableaux sont déjà là. Un redessin de la conversation (`renderAssistant`) reprend l'effet où il en était ; « réduire les
// animations » du système, ou un changement de conversation, l'arrête et montre tout. Aucune donnée n'est modifiée : c'est de l'affichage.
// Même fichier : la conversation reste collée en bas quand la zone de saisie change de hauteur (les suites rapides apparaissent après
// la première réponse et poussaient l'indicateur « CLAIRE écrit » sous le champ).

var revelationAssistant = { message: null, n: 0, timer: 0, observe: false };

/** Pure : jusqu'où montrer le texte à l'étape n — nœuds texte (valeurs d'origine) → nouvelles valeurs. */
function textesRevelesAssistant(textes, n) {
  let reste = Math.max(0, n);
  return (textes || []).map((t) => {
    const v = String(t);
    if (reste >= v.length) { reste -= v.length; return v; }
    const morceau = v.slice(0, reste);
    reste = 0;
    return morceau;
  });
}

/** Pure : caractères révélés par image (30 ms) — la réponse entière en 3 s au plus, 4 caractères au moins. */
function pasRevelationAssistant(total) { return Math.max(4, Math.ceil((total || 0) / 100)); }

function arreterRevelationAssistant() {
  if (revelationAssistant.timer) clearInterval(revelationAssistant.timer);
  revelationAssistant.timer = 0;
  revelationAssistant.message = null;
  const zone = document.getElementById('assistant-messages');
  if (zone) zone.removeAttribute('aria-busy');
}

/** Une réponse vient d'être posée : elle s'écrira peu à peu (sauf « réduire les animations »). @param {any} message */
function lancerRevelationAssistant(message) {
  arreterRevelationAssistant();
  if (!message || mouvementReduit()) return;
  revelationAssistant.message = message;
  revelationAssistant.n = 0;
}

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

/** Fin de `renderAssistant` : reprend la révélation en cours sur les nœuds qui viennent d'être dessinés. @param {HTMLElement} zone */
function reprendreRevelationAssistant(zone) {
  suivreBasConversationAssistant(zone);
  if (assistantEnCours) requestAnimationFrame(() => { zone.scrollTop = zone.scrollHeight; });
  const message = revelationAssistant.message;
  if (revelationAssistant.timer) { clearInterval(revelationAssistant.timer); revelationAssistant.timer = 0; }
  if (!message) return;
  const i = assistantMessages.indexOf(message);
  const bloc = i >= 0 ? zone.querySelector(`.asst-message[data-index="${i}"]`) : null;
  const texte = bloc ? bloc.querySelector('.asst-texte') : null;
  if (!texte) { revelationAssistant.message = null; return; }
  const noeuds = [];
  const marche = document.createTreeWalker(texte, NodeFilter.SHOW_TEXT);
  while (marche.nextNode()) noeuds.push(marche.currentNode);
  const textes = noeuds.map((x) => x.nodeValue || '');
  const total = textes.reduce((s, t) => s + t.length, 0);
  const pied = Array.from(bloc.querySelectorAll('.asst-boutons, .asst-survol'));
  const montrer = (n) => { textesRevelesAssistant(textes, n).forEach((v, k) => { noeuds[k].nodeValue = v; }); };
  const pas = pasRevelationAssistant(total);
  zone.setAttribute('aria-busy', 'true'); // un lecteur d'écran n'annonce pas chaque fragment : il lit la réponse une fois finie
  pied.forEach((el) => { el.style.visibility = 'hidden'; });
  montrer(revelationAssistant.n);
  revelationAssistant.timer = setInterval(() => {
    revelationAssistant.n += pas;
    if (revelationAssistant.n >= total) {
      montrer(total);
      pied.forEach((el) => { el.style.visibility = ''; });
      arreterRevelationAssistant();
    } else {
      montrer(revelationAssistant.n);
    }
    if (zone.scrollHeight - zone.scrollTop - zone.clientHeight < 200) zone.scrollTop = zone.scrollHeight;
  }, 30);
}

// Animations des barres de progression et des anneaux (étude, 10/10 : « des animations quand les anneaux se complètent, pour rendre
// l'interface plus attractive »). Aucun écran n'est modifié : à chaque changement du DOM, on relit les barres et anneaux visibles et on
// fait glisser chacun de sa valeur précédente à sa valeur actuelle (de 0 à la première apparition d'un écran). Une valeur inchangée ne
// s'anime pas — la fiche se redessine souvent, rien ne doit clignoter. Mouvement réduit demandé par le poste : aucune animation.

var SELECTEURS_BARRES_PROGRESSION = ['.avancement-barre > span', '.pieces-barre > span', '.fonds-barre > span', '.revision-barre > span', '.qt-barre > span', '.st-barre > span'];
var DUREE_ANIMATION_PROGRESSION_MS = 800;
var etatProgressions = { contexte: '', valeurs: new Map() };

// Pure : de quoi animer un indicateur — { de, a, anime } ; `precedent` indéfini = première apparition (on part de 0).
function etapeProgression(precedent, actuel) {
  const de = typeof precedent === 'number' ? precedent : 0;
  return { de, a: actuel, anime: de !== actuel };
}

function mouvementReduitProgression() {
  try { return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

// Un écran (page ouverte, fiche ouverte) = un contexte : en changer remet les valeurs à zéro, donc la prochaine apparition s'anime.
function contexteProgressions() {
  return [typeof ongletActuel !== 'undefined' ? ongletActuel : '', typeof dossierOuvert !== 'undefined' ? dossierOuvert : ''].join('|');
}

function animerProgressions(racine) {
  if (!racine || !racine.querySelectorAll || mouvementReduitProgression()) return;
  const contexte = contexteProgressions();
  if (etatProgressions.contexte !== contexte) etatProgressions = { contexte, valeurs: new Map() };
  const vus = etatProgressions.valeurs;
  const suivre = (cle, actuel) => { const e = etapeProgression(vus.get(cle), actuel); vus.set(cle, actuel); return e; };
  const options = (extra) => Object.assign({ duration: DUREE_ANIMATION_PROGRESSION_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }, extra || {});

  SELECTEURS_BARRES_PROGRESSION.forEach(sel => racine.querySelectorAll(sel).forEach((el, i) => {
    const e = suivre(sel + i, parseFloat(el.style.width) || 0);
    if (e.anime) el.animate([{ width: e.de + '%' }, { width: e.a + '%' }], options());
  }));

  // Anneau de la fiche : stroke-dasharray « pourcentage 100 » (pathLength 100).
  racine.querySelectorAll('.fb-val').forEach((el, i) => {
    const e = suivre('fb-val' + i, parseFloat(el.style.strokeDasharray) || 0);
    if (e.anime) el.animate([{ strokeDasharray: e.de + ' 100' }, { strokeDasharray: e.a + ' 100' }], options({ duration: 1000 }));
  });

  // Anneau de « Aujourd'hui » : longueur du cercle en dasharray, part non remplie en dashoffset.
  racine.querySelectorAll('.jour-anneau-plein').forEach((el, i) => {
    const c = parseFloat(el.getAttribute('stroke-dasharray')) || 0;
    if (!c) return;
    const part = 1 - (parseFloat(el.getAttribute('stroke-dashoffset')) || 0) / c;
    const e = suivre('jour-anneau' + i, part);
    if (e.anime) el.animate([{ strokeDashoffset: c * (1 - e.de) }, { strokeDashoffset: c * (1 - e.a) }], options({ duration: 1000 }));
  });

  // Cercle de santé de la relecture d'actes : chaque arc (critique, à surveiller, validé) se déroule, l'un après l'autre.
  racine.querySelectorAll('.sante-donut').forEach((svg, j) => {
    svg.querySelectorAll('circle[stroke-dasharray]').forEach((el, i) => {
      const [part, reste] = String(el.getAttribute('stroke-dasharray')).split(/\s+/).map(Number);
      if (!(part >= 0) || !(reste >= 0)) return;
      const e = suivre('sante' + j + '-' + i, part);
      if (e.anime) el.animate([{ strokeDasharray: `${e.de} ${part + reste - e.de}` }, { strokeDasharray: `${part} ${reste}` }], options({ duration: 900, delay: i * 150, fill: 'backwards' }));
    });
  });

  // Anneau « Portefeuille » du tableau de bord : sa première apparition a déjà son animation (.portefeuille.anime) ; ici, seulement
  // quand un segment change de longueur ensuite (un dossier qui passe de « Attente de pièces » à « Complet »…).
  racine.querySelectorAll('.pf-seg').forEach(el => {
    const l = parseFloat(el.style.getPropertyValue('--l'));
    if (!(l >= 0)) return;
    const cle = 'pf-' + el.getAttribute('class');
    const premier = !vus.has(cle);
    const e = suivre(cle, l);
    if (!premier && e.anime) el.animate([{ strokeDasharray: `${e.de} ${100 - e.de}` }, { strokeDasharray: `${l} ${100 - l}` }], options({ duration: 900 }));
  });

  // Suivi des étapes de la fiche : chaque segment qui se remplit grandit de la gauche, en cascade à la première apparition.
  racine.querySelectorAll('.fb-segments > span').forEach((el, i) => {
    const e = suivre('segment' + i, el.classList.contains('fait') ? 1 : 0);
    if (e.anime && e.a === 1) el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], options({ duration: 500, delay: e.de === 0 && !vus.has('segment-vu') ? i * 90 : 0, fill: 'backwards' }));
    el.style.transformOrigin = 'left';
  });
  vus.set('segment-vu', 1);
}

function initAnimationsProgression() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || !document.body) return;
  let planifie = false;
  const lancer = () => {
    planifie = false;
    try { animerProgressions(document.body); } catch (e) { /* une animation ratée ne doit jamais gêner l'écran */ }
  };
  new MutationObserver(() => {
    if (planifie) return;
    planifie = true;
    requestAnimationFrame(lancer);
  }).observe(document.body, { childList: true, subtree: true });
  requestAnimationFrame(lancer);
}
initAnimationsProgression();

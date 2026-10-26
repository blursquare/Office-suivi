// Aperçu A4 du courrier d'appel de fonds (étude 26/10 : « Appel de fonds reprend un format A4 pour l'aperçu ») : la feuille a les proportions d'une
// page A4 (210 × 297 mm), réduite pour tenir dans la colonne, et sa hauteur est toujours un nombre entier de pages — un trait marque chaque
// saut de page (style.css, `.af-lettre`). L'impression et le .docx / PDF/A ne changent pas.

var LARGEUR_A4_PX = 793.7;     // 210 mm à 96 dpi
var HAUTEUR_A4_PX = 1122.5;    // 297 mm

// Pure : le zoom qui fait tenir la feuille dans la place disponible (jamais agrandie, jamais sous 35 %).
function zoomApercuA4(largeurDisponible) {
  const l = Number(largeurDisponible);
  if (!(l > 0)) return 1;
  return Math.max(0.35, Math.min(1, l / LARGEUR_A4_PX));
}

// Pure : le nombre de pages A4 que couvre un contenu de cette hauteur (une page au moins ; 1 px de tolérance).
function pagesApercuA4(hauteurContenu) {
  const h = Number(hauteurContenu);
  return h > HAUTEUR_A4_PX + 1 ? Math.ceil((h - 1) / HAUTEUR_A4_PX) : 1;
}

function ajusterApercuA4AppelFonds() {
  const lettre = document.getElementById('af-lettre');
  const colonne = lettre && lettre.parentElement;
  if (!lettre || !colonne || !colonne.clientWidth) return;
  lettre.style.zoom = String(zoomApercuA4(colonne.clientWidth - 2));
  // La hauteur naturelle du contenu (sans l'étirement d'une page) donne le nombre de pages ; elle est ensuite arrondie à des pages entières.
  lettre.style.minHeight = '0';
  const pages = pagesApercuA4(lettre.scrollHeight);
  lettre.style.minHeight = `${pages * 297}mm`;
  lettre.dataset.pages = String(pages);
}

(function installerApercuA4AppelFonds() {
  if (typeof ResizeObserver === 'undefined' || typeof document === 'undefined') return;
  const lettre = document.getElementById('af-lettre');
  if (!lettre || !lettre.parentElement) return;
  let attente = 0;
  const differe = () => { cancelAnimationFrame(attente); attente = requestAnimationFrame(ajusterApercuA4AppelFonds); };
  // La colonne change de largeur (fenêtre, fiche à côté, panneau de « Demander à CLAIRE ») ; le contenu change de hauteur (saisie, lignes du décompte).
  new ResizeObserver(differe).observe(lettre.parentElement);
  new MutationObserver(differe).observe(lettre, { childList: true, subtree: true, characterData: true });
})();

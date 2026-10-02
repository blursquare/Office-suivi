// Relevé AUTOMATIQUE (étude, 02/10) : sur Authentic, chaque page affichée est relevée et envoyée à
// CLAIRE, qui met à jour la fiche du dossier (pièces reçues) et garde les fiches client et bien pour
// créer un dossier. Authentic change de page sans recharger (main.xhtml) : on observe la page, on
// attend qu'elle se stabilise (2,5 s sans changement), et on n'envoie que si le relevé a changé.
// Désactivable dans les options de l'extension.
'use strict';
(function () {
  if (window.__claireAutoActif) return;
  window.__claireAutoActif = true;
  let minuteur = null;
  let derniere = '';
  function releverEtEnvoyer() {
    minuteur = null;
    let c = null;
    try { c = window.__claireRelever(); } catch (e) { return; }
    if (!c || (!c.champs.length && !c.tableaux.length)) return;
    // Empreinte sans le texte libre (qui bouge avec l'horloge ou les notifications d'Authentic).
    const empreinte = JSON.stringify([c.champs, c.tableaux]);
    if (empreinte === derniere) return;
    derniere = empreinte;
    browser.runtime.sendMessage({ type: 'releve', capture: c }).catch(() => {});
  }
  function programmer() {
    clearTimeout(minuteur);
    minuteur = setTimeout(releverEtEnvoyer, 2500);
  }
  browser.storage.local.get('auto').then(({ auto }) => {
    if (auto === false) return;
    new MutationObserver(programmer).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    programmer();
  });
})();

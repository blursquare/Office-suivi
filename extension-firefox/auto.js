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
  let derniereNavigation = '';
  function releverEtEnvoyer() {
    minuteur = null;
    let c = null;
    try { c = window.__claireRelever(); } catch (e) { return; }
    if (!c || (!c.champs.length && !c.tableaux.length)) return;
    // Seules les pages dont CLAIRE connaît la structure partent (étude, 02/10) : page du dossier
    // (intitulé « N - Vente X/Y » ou « N - Succession X »), fiche client, fiche bien. Le reste d'Authentic n'est pas envoyé.
    if (!pageConnue(c)) {
      // Un dossier d'un autre type (donation, divers…) : seul son intitulé part, sans rien de la page,
      // pour que CLAIRE sache que l'on a quitté le dossier précédent (étude, 02/10 : « j'étais dans le
      // dossier SIMOND mais ça s'est mis dans PETIT »).
      const intitule = intituleDossier(c);
      if (intitule && intitule !== derniereNavigation) {
        derniereNavigation = intitule;
        derniere = '';
        browser.runtime.sendMessage({ type: 'navigation', intitule }).catch(() => {});
      }
      return;
    }
    derniereNavigation = '';
    // Empreinte sans le texte libre (qui bouge avec l'horloge ou les notifications d'Authentic).
    const empreinte = JSON.stringify([c.champs, c.tableaux]);
    if (empreinte === derniere) return;
    derniere = empreinte;
    browser.runtime.sendMessage({ type: 'releve', capture: c }).catch(() => {});
  }
  function pageConnue(c) {
    const re = /(?:^|[^\w])\d{1,6}\s*-\s*(?:(?:Vente|VTE)\s+[^\n\/]*\S\s*\/\s*\S|(?:Succession|SUCC)\.?\s+\S)/i;
    const libelles = (c.champs || []).map(ch => String(ch.libelle || '') + ' ' + String(ch.valeur || ''));
    if (libelles.some(l => /ficheClientPhysique|ficheImmeuble/i.test(l))) return true;
    return libelles.some(l => re.test(l)) || re.test(String(c.texte || ''));
  }
  // L'intitulé « N - … » du dossier ouvert : un libellé seul (sans valeur), sinon la première ligne du texte.
  function intituleDossier(c) {
    const re = /^\s*\d{1,6}\s*-\s*[A-Za-zÀ-ÿ][^\n]{1,120}$/;
    for (const ch of c.champs || []) {
      const l = String(ch.libelle || '').trim();
      if (!String(ch.valeur || '').trim() && re.test(l)) return l.slice(0, 200);
    }
    const premiere = String(c.texte || '').split('\n').map(l => l.trim()).find(Boolean) || '';
    const m = /^\d{1,6}\s*-\s*[A-Za-zÀ-ÿ].{1,120}?(?=\s+(?:Importer|Comparants|Immeubles)\b|$)/.exec(premiere);
    return m ? m[0].trim().slice(0, 200) : '';
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

// Bouton « Envoyer à CLAIRE » : le relevé de releve.js (injecté juste avant par fond.js). La dernière
// expression est la valeur rendue à fond.js.
(function () { return typeof window.__claireRelever === 'function' ? window.__claireRelever() : null; })();

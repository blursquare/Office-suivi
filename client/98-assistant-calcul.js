  // ---- « Demander à CLAIRE » : calcul libre dans un bac à sable (étude 21/10, palier 3) ----
  // « Comment ClaireAI peut avoir autant de liberté que Claude desktop ? » — Claude desktop calcule en écrivant du code. Ici l'agent
  // écrit une petite fonction JavaScript que le POSTE exécute sur les données des dossiers, SANS RÉSEAU et sans accès à CLAIRE :
  //   - une iframe `sandbox="allow-scripts"` (origine opaque : ni cookies, ni stockage, ni la page) dont le CSP coupe tout
  //     (`default-src 'none'` : fetch, XHR, WebSocket, images, frames…) ; seuls un script en ligne et un Worker `blob:` sont permis ;
  //   - le code tourne dans un Worker de cette iframe (un calcul sans fin ne fige jamais la page) ; délai dépassé = iframe retirée.
  // Les données des dossiers (valeurs réelles) restent sur le poste : l'agent ne reçoit que le RÉSULTAT, que le serveur masque comme
  // tout résultat d'outil ; un tableau produit (`tableau`) se télécharge en CSV sans repasser par l'IA (seuls son nombre de lignes et
  // un aperçu de 15 lignes lui reviennent). Rien n'est écrit dans CLAIRE : lecture et calcul seulement.

  var DELAI_CALCUL_DEFAUT_MS = 10000;
  var DELAI_CALCUL_MAX_MS = 30000;
  var MAX_CARACTERES_RESULTAT_CALCUL = 30000;
  var LIGNES_APERCU_CALCUL = 15;
  var MAX_LIGNES_TABLEAU_CALCUL = 20000;
  var MAX_DOSSIERS_CALCUL = 400;

  // Le code du Worker : `donnees` en paramètre, `return` du résultat (une promesse est attendue) ; rien d'autre que le langage.
  var SOURCE_WORKER_CALCUL = [
    '"use strict";',
    'self.onmessage = function (e) {',
    '  var m = e.data || {};',
    '  function fin(r) { try { self.postMessage({ ok: true, valeur: JSON.parse(JSON.stringify(r === undefined ? null : r)) }); } catch (x) { self.postMessage({ erreur: "résultat non convertible en JSON : " + String(x && x.message || x) }); } }',
    '  function echec(x) { self.postMessage({ erreur: String(x && x.message || x).slice(0, 400) }); }',
    '  try { var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor; var f = new AsyncFunction("donnees", "\\"use strict\\";\\n" + String(m.code)); f(m.donnees).then(fin, echec); } catch (x) { echec(x); }',
    '};'
  ].join('\n');

  // Pure : la page de l'iframe (CSP strict, un seul Worker, réponse au parent par postMessage).
  function pageBacASableCalcul() {
    return '<!doctype html><meta charset="utf-8">'
      + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\'; worker-src blob:">'
      + '<script>(function () {'
      + 'var SRC = ' + JSON.stringify(SOURCE_WORKER_CALCUL) + ';'
      + 'window.addEventListener("message", function (ev) {'
      + '  if (ev.source !== parent || !ev.data || ev.data.type !== "calcul") return;'
      + '  var jeton = ev.data.jeton;'
      + '  try {'
      + '    var w = new Worker(URL.createObjectURL(new Blob([SRC], { type: "text/javascript" })));'
      + '    w.onmessage = function (e) { parent.postMessage({ jeton: jeton, reponse: e.data }, "*"); };'
      + '    w.onerror = function (e) { parent.postMessage({ jeton: jeton, reponse: { erreur: String(e && e.message || "erreur dans le calcul") } }, "*"); };'
      + '    w.postMessage({ code: ev.data.code, donnees: ev.data.donnees });'
      + '  } catch (x) { parent.postMessage({ jeton: jeton, reponse: { erreur: "bac à sable indisponible : " + String(x && x.message || x) } }, "*"); }'
      + '});'
      + 'parent.postMessage({ pret: true }, "*");'
      + '})();<\/script>';
  }

  var jetonCalculAgent = 0;

  // Exécute `code` sur `donnees` : { valeur } ou { erreur }. Une iframe par calcul, retirée à la fin (ou au délai).
  function executerCalculIsole(code, donnees, delaiMs) {
    return new Promise(resolve => {
      const jeton = ++jetonCalculAgent;
      const cadre = document.createElement('iframe');
      cadre.setAttribute('sandbox', 'allow-scripts');
      cadre.setAttribute('aria-hidden', 'true');
      cadre.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-10px;top:-10px;visibility:hidden';
      let fini = false;
      const terminer = (sortie) => {
        if (fini) return;
        fini = true;
        clearTimeout(minuterie);
        window.removeEventListener('message', ecoute);
        cadre.remove();
        resolve(sortie);
      };
      const minuterie = setTimeout(() => terminer({ erreur: `calcul trop long : arrêté après ${Math.round(delaiMs / 1000)} s (simplifie le code ou réduis les données)` }), delaiMs);
      function ecoute(ev) {
        if (ev.source !== cadre.contentWindow || !ev.data) return;
        if (ev.data.pret) { cadre.contentWindow.postMessage({ type: 'calcul', jeton, code, donnees }, '*'); return; }
        if (ev.data.jeton !== jeton || !ev.data.reponse) return;
        terminer(ev.data.reponse.erreur ? { erreur: ev.data.reponse.erreur } : { valeur: ev.data.reponse.valeur });
      }
      window.addEventListener('message', ecoute);
      cadre.srcdoc = pageBacASableCalcul();
      document.body.appendChild(cadre);
    });
  }

  // Pure : une cellule de CSV (séparateur « ; » comme Excel en français). Un texte qui commencerait une formule est neutralisé.
  function celluleCsvCalcul(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
    if (typeof v === 'boolean') return v ? 'oui' : 'non';
    let t = typeof v === 'string' ? v : JSON.stringify(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  // Pure : un tableau { titre, colonnes, lignes } validé et borné, ou null.
  function tableauCalculValide(t) {
    if (!t || typeof t !== 'object' || !Array.isArray(t.colonnes) || !Array.isArray(t.lignes)) return null;
    const colonnes = t.colonnes.slice(0, 60).map(c => String(c == null ? '' : c).slice(0, 120));
    if (!colonnes.length) return null;
    const lignes = t.lignes.slice(0, MAX_LIGNES_TABLEAU_CALCUL).map(l => (Array.isArray(l) ? l : [l]).slice(0, colonnes.length));
    return { titre: String(t.titre || 'Tableau').slice(0, 140), colonnes, lignes, coupe: t.lignes.length > MAX_LIGNES_TABLEAU_CALCUL };
  }

  // Pure : l'aperçu rendu à l'IA — 15 lignes, chaque cellule coupée à 200 caractères, 6 000 caractères au plus en tout.
  function apercuTableauCalcul(lignes) {
    let total = 0;
    const sortie = [];
    for (const l of lignes.slice(0, LIGNES_APERCU_CALCUL)) {
      const ligne = l.map(c => (typeof c === 'string' && c.length > 200 ? c.slice(0, 200) + '…' : c));
      total += JSON.stringify(ligne).length;
      if (total > 6000 && sortie.length) break;
      sortie.push(ligne);
    }
    return sortie;
  }

  // Pure : le CSV (BOM UTF-8 pour qu'Excel lise les accents).
  function csvDepuisTableauCalcul(t) {
    return '﻿' + [t.colonnes.map(celluleCsvCalcul).join(';')].concat(t.lignes.map(l => t.colonnes.map((_, i) => celluleCsvCalcul(l[i])).join(';'))).join('\r\n') + '\r\n';
  }

  // Les données du calcul, lues ICI : `donnees` de l'agent, plus les dossiers demandés (["*"] = tous, en résumé ; sinon la fiche lue).
  function donneesCalculAgent(entree) {
    const donnees = entree.donnees && typeof entree.donnees === 'object' && !Array.isArray(entree.donnees) ? { ...entree.donnees } : {};
    const ids = Array.isArray(entree.dossier_ids) ? entree.dossier_ids.map(String) : [];
    if (!ids.length) return { donnees };
    if (ids.includes('*')) {
      donnees.dossiers = dossiers.filter(d => !d.supprime).slice(0, MAX_DOSSIERS_CALCUL).map(d => resumeDossierAgent(d));
      return { donnees, note: dossiers.length > MAX_DOSSIERS_CALCUL ? `seuls les ${MAX_DOSSIERS_CALCUL} premiers dossiers ont été fournis` : '' };
    }
    const inconnus = ids.filter(i => !dossiers.some(d => d.id === i));
    if (inconnus.length) return { erreur: 'dossier_ids : dossier inconnu (' + inconnus.slice(0, 3).join(', ') + ')' };
    donnees.dossiers = ids.slice(0, 40).map(i => lireDossierAgent(dossiers.find(d => d.id === i)));
    return { donnees };
  }

  async function calculAgent(entree) {
    const e = entree || {};
    const code = String(e.code || '');
    if (!code.trim()) return { erreur: 'code : le corps d’une fonction JavaScript (donnees en paramètre, return du résultat) attendu' };
    if (code.length > 12000) return { erreur: 'code trop long (12 000 caractères au plus)' };
    if (/\[à compléter\]/.test(code)) return { erreur: 'code : un code [NOM…] inconnu a été remplacé — écris le code sans valeur inventée' };
    const objectif = String(e.objectif || '').trim().slice(0, 200) || 'Calcul';
    const lu = donneesCalculAgent(e);
    if (lu.erreur) return { erreur: lu.erreur };
    const delai = Math.min(DELAI_CALCUL_MAX_MS, Math.max(1000, (parseInt(e.delai_secondes, 10) || 0) * 1000 || DELAI_CALCUL_DEFAUT_MS));
    assistantEtapeAgent = 'Je calcule…';
    renderAssistant();
    const r = await executerCalculIsole(code, lu.donnees, delai);
    if (r.erreur) {
      noterVerificationPoste('agent-calcul', { ok: false, message: 'calcul en erreur' });
      return { erreur: r.erreur };
    }
    let valeur = r.valeur;
    let tableau = null;
    if (valeur && typeof valeur === 'object' && !Array.isArray(valeur) && valeur.tableau !== undefined) {
      tableau = tableauCalculValide(valeur.tableau);
      if (!tableau) return { erreur: 'tableau : { titre, colonnes: [..], lignes: [[..]] } attendu' };
      valeur = { ...valeur }; delete valeur.tableau;
    }
    const sortie = { calcul_fait: true, ...(lu.note ? { note: lu.note } : {}) };
    let texte = JSON.stringify(valeur === undefined ? null : valeur);
    if (texte.length > MAX_CARACTERES_RESULTAT_CALCUL) {
      return { erreur: `résultat trop gros (${texte.length} caractères) : renvoie un résumé, ou mets le détail dans « tableau » (il ne repasse pas par l’IA)` };
    }
    if (valeur !== null && !(valeur && typeof valeur === 'object' && !Object.keys(valeur).length)) sortie.resultat = valeur;
    const boutons = [];
    if (tableau) {
      // Le tableau s'ouvre à droite (client/99) : cellules modifiables, Excel, CSV ; l'IA n'en voit qu'un aperçu.
      const idArtefact = ouvrirArtefactAssistant({ type: 'tableau', titre: tableau.titre, colonnes: tableau.colonnes.slice(), lignes: tableau.lignes.map(l => l.slice()) });
      boutons.push({ libelle: 'Ouvrir le tableau', action: () => choisirArtefactAssistant(idArtefact) });
      sortie.tableau = { titre: tableau.titre, colonnes: tableau.colonnes, lignes_total: tableau.lignes.length, apercu: apercuTableauCalcul(tableau.lignes),
        ...(tableau.coupe ? { coupe: `seules les ${MAX_LIGNES_TABLEAU_CALCUL} premières lignes sont gardées` } : {}) };
      sortie.affiche_a_l_utilisateur = `tableau « ${tableau.titre} » ouvert dans le panneau de droite (modifiable, Excel et CSV)`;
    }
    poserMessageAssistant('claire', `<p>Calcul fait : <b>${escapeHtml(objectif)}</b>.${tableau ? ` Tableau « ${escapeHtml(tableau.titre)} » : ${tableau.lignes.length} ligne${tableau.lignes.length > 1 ? 's' : ''}.` : ''}</p>`
      + `<details class="asst-calcul"><summary>Voir le code</summary><pre>${escapeHtml(code)}</pre></details>`, boutons);
    noterVerificationPoste('agent-calcul', { detail: tableau ? 'tableau produit' : 'résultat rendu' });
    return sortie;
  }

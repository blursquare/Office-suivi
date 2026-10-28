  // ==== Appels reçus (3CX, étude 01/10) ====
  // 3CX ouvre /appel?numero=…&nom=…&poste=… à la sonnerie (« Intégration CRM » du client web de
  // chaque collaborateur, voir server/src/appels3cx.js). La fenêtre CLAIRE du collaborateur relève
  // ses appels toutes les 3 s, même cachée (elle dit au serveur si elle est visible : sinon l'onglet
  // ouvert par 3CX affiche CLAIRE lui-même), montre l'appel et ouvre la fiche du dossier reconnu.
  // L'appelant est reconnu par les téléphones des parties (onglet Échanges), le carnet des confrères
  // et le répertoire.
  var INTERVALLE_APPELS_MS = 3000;
  let curseurAppels = '';
  const appelsMontres = new Set();
  const appelsParDossier = {};     // id → journal du dossier (null pendant le chargement)
  let appelEntrant = null;
  let minuteurAppelEntrant = null;
  // 3CX ne prévient CLAIRE qu'à la sonnerie, jamais à la fin de l'appel : le bandeau se ferme seul
  // 45 s après (le temps de décrocher), en pause tant que la souris est dessus, et dès que la fiche
  // est ouverte depuis le bandeau (étude, 02/10).
  var DUREE_BANDEAU_APPEL_MS = 45000;
  var DUREE_BANDEAU_APPEL_APRES_SURVOL_MS = 10000;

  function programmerFermetureAppelEntrant(ms) {
    clearTimeout(minuteurAppelEntrant);
    minuteurAppelEntrant = setTimeout(fermerAppelEntrant, ms);
  }

  // Pure : clé du poste dans l'adresse 3CX — le prénom sans accent (« jeremy ») : 3CX remplace les
  // %…% de l'adresse, un nom encodé (%C3%A9…) risquerait d'être pris pour une variable.
  function clePosteAppels(nom) {
    return String(nom || '').trim().split(/\s+/)[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  }

  // Pure : l'adresse à coller dans 3CX pour un collaborateur.
  function adresseIntegration3cx(origine, collaborateur) {
    return `${String(origine || '').replace(/\/+$/, '')}/appel?numero=%CallerNumber%&nom=%CallerDisplayName%&poste=${clePosteAppels(collaborateur)}`;
  }

  var LIBELLES_PARTIE_APPEL = { vendeur: 'Vendeur', acquereur: 'Acquéreur', confrere: 'Confrère', partie: 'Partie' };

  // Pure : les dossiers que l'appel désigne (encore connus du poste), dans l'ordre du serveur.
  function dossiersDeLAppel(appel, liste) {
    return ((appel && appel.dossiers) || [])
      .map(x => ({ d: (liste || []).find(d => d.id === x.id), partie: LIBELLES_PARTIE_APPEL[x.partie] || '' }))
      .filter(y => y.d);
  }

  // Pure : le dossier à ouvrir seul à la sonnerie — un seul dossier en cours dont l'appelant est
  // partie (un confrère qui a plusieurs dossiers avec l'office : on montre la liste, on n'ouvre rien).
  function dossierAOuvrirPourAppel(appel, liste) {
    const enCours = dossiersDeLAppel(appel, liste).filter(y => !y.d.archive && y.partie !== 'Confrère');
    return enCours.length === 1 ? enCours[0].d : null;
  }

  function heureAppel(t) {
    const dt = new Date(t);
    return dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
  }

  function dateHeureAppel(t) {
    const dt = new Date(t);
    const jour = dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '');
    return `${jour}, ${heureAppel(t)}`;
  }

  // Intégration 3CX coupée collaborateur par collaborateur (Réglages › Téléphonie 3CX, étude 02/10 ; le
  // serveur fait foi : pour un poste coupé, il ne note ni ne rend plus aucun appel).
  let postes3cxCoupes = [];
  // Postes où le relais « claire-appel: » est installé : 3CX ouvre l'appel dans la fenêtre CLAIRE (étude 07/10).
  let postes3cxRelais = [];

  async function basculerTelephonie3cx(i, actif) {
    const nom = RESPONSABLES[i];
    if (!nom) return;
    try {
      const r = await fetchAvecAuth('/api/appels/reglages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poste: clePosteAppels(nom), actif: !!actif }) });
      if (r.ok) { const j = await r.json(); postes3cxCoupes = j.postesCoupes || []; postes3cxRelais = j.postesRelais || []; }
    } catch (e) { /* état affiché relu ci-dessous */ }
    const coupe = postes3cxCoupes.includes(clePosteAppels(nom));
    if (coupe && nom === utilisateurPoste) fermerAppelEntrant();
    afficherToast(`${prenomCollaborateur(nom)} : intégration 3CX ${coupe ? 'coupée — ses appels ne sont plus notés' : 'activée'}.`, 'OK', null);
    renderReglages3cx();
  }

  async function releverAppels() {
    if (!authToken || !utilisateurPoste) return;
    try {
      const visible = document.visibilityState === 'visible' ? '1' : '0';
      const r = await fetchAvecAuth(`/api/appels/nouveaux?poste=${encodeURIComponent(clePosteAppels(utilisateurPoste))}&visible=${visible}&depuis=${encodeURIComponent(curseurAppels)}`);
      if (!r.ok) return;
      const { appels, serverTime } = await r.json();
      const premier = !curseurAppels;
      curseurAppels = serverTime;
      if (!premier) for (const a of (appels || []).slice().reverse()) montrerAppelEntrant(a, true);
    } catch (e) { /* la relève suivante reprendra */ }
  }

  // ---- Pages d'Authentic reçues de l'extension Firefox « CLAIRE pour Authentic » (01/10) ----
  // L'extension (extension-firefox/) relève la page d'Authentic affichée (champs avec libellé et
  // rubrique, tableaux, texte) et l'envoie au serveur, qui la garde 30 min en mémoire ; elle ouvre
  // CLAIRE sur « #authentic=<id> ». Tant que la structure des pages d'Authentic n'est pas connue,
  // CLAIRE montre ce qu'elle a reçu et propose d'en copier la STRUCTURE SANS DONNÉES (libellés et
  // types de valeurs, jamais une valeur) : c'est elle qui servira à brancher la reprise dans une fiche.
  var SIGLES_STRUCTURE_AUTHENTIC = ['TVA', 'SCI', 'CU', 'DPE', 'ERP', 'PLU', 'SRU', 'IBAN', 'RIB', 'BIC', 'VTE', 'AAE', 'DIA', 'DPU', 'TF', 'CP', 'SIREN', 'SIRET', 'RCS', 'N°', 'HT', 'TTC', 'EUR', 'SAFER', 'PDF', 'LRAR', 'AR', 'SPANC', 'ASL', 'AFUL', 'SPF', 'CSN', 'PV', 'AG'];

  // Pure : le type d'une valeur, jamais la valeur.
  function masquerValeurAuthentic(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '[vide]';
    if (s === 'oui' || s === 'non') return s;
    if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$|^\d{4}-\d{2}-\d{2}/.test(s)) return '[date]';
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s)) return '[email]';
    if (/^(?:\+33\s?|0)\d(?:[\s.-]?\d{2}){4}$/.test(s)) return '[téléphone]';
    if (/^-?\d[\d\s.  ]*(?:,\d+)?\s*(?:€|EUR|euros?)$/i.test(s) || /^-?\d{1,3}(?:[\s.  ]\d{3})+,\d{2}$/.test(s)) return '[montant]';
    if (/^-?\d+(?:[.,]\d+)?\s*%$/.test(s)) return '[pourcentage]';
    if (/^-?\d+(?:[.,]\d+)?$/.test(s)) return '[nombre]';
    const mots = s.split(/\s+/).length;
    return `[texte, ${mots} mot${mots > 1 ? 's' : ''}]`;
  }

  // Pure : un libellé ou un titre sans ce qui pourrait nommer un client — chiffres remplacés par 9,
  // mots en capitales (hors sigles techniques) par XXX, emails masqués, nom et prénoms après une
  // civilité masqués même collée au mot précédent (« personM. MARTEL Alexandre » : texte d'icône
  // d'Authentic, étude 02/10 — deux prénoms étaient passés). Un « libellé » de plus de 8 mots n'en est
  // pas un (texte de la page pris faute de vrai libellé) : seul son nombre de mots est gardé.
  var MOTS_MAX_LIBELLE_AUTHENTIC = 8;
  function masquerLibelleAuthentic(s) {
    const brut = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (!brut) return '';
    const mots = brut.split(' ').length;
    if (mots > MOTS_MAX_LIBELLE_AUTHENTIC) return `[texte, ${mots} mots]`;
    return brut
      .replace(/[^@\s]+@[^@\s]+/g, '[email]')
      .replace(/(Monsieur|Madame|Mademoiselle|Maître|Mme|Mlle|Me|M\.)((?:\s+[A-ZÀ-Ý][\wÀ-ɏ'’-]*)+)/g, '$1 XXX')
      .replace(/\d/g, '9')
      .replace(/(?<![A-Za-zÀ-ɏ])[A-ZÀ-Ý][A-ZÀ-Ý'’-]+(?![A-Za-zÀ-ɏ])/g, m => SIGLES_STRUCTURE_AUTHENTIC.includes(m) ? m : 'XXX')
      .trim();
  }

  // Pure : le texte d'une cellule de tableau réduit à son VOCABULAIRE (étude, 02/10 : pour reconnaître
  // « Acte de naissance — reçu », « Notification SAFER — non préemption » sans jamais voir un client).
  // Gardés : les mots en minuscules, les sigles connus, le premier mot s'il commence par une majuscule
  // et que le suivant est en minuscules ou un sigle (« Acte de… », « Notification SAFER »). Masqués :
  // tout autre mot à majuscule (noms, prénoms) → XXX, le nom après une civilité, chiffres → 9,
  // emails. Plus de 12 mots : le nombre de mots seulement.
  var MOTS_MAX_CELLULE_AUTHENTIC = 12;
  function vocabulaireCelluleAuthentic(v) {
    const brut = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!brut) return '';
    const mots = brut.split(' ');
    if (mots.length > MOTS_MAX_CELLULE_AUTHENTIC) return `[texte, ${mots.length} mots]`;
    const nu = m => m.replace(/^[^A-Za-zÀ-ɏ]+|[^A-Za-zÀ-ɏ°]+$/g, '');
    const sigle = m => SIGLES_STRUCTURE_AUTHENTIC.includes(nu(m).toUpperCase()) && nu(m) === nu(m).toUpperCase();
    const minuscule = m => /^[a-zà-ÿœæ'’-]+$/.test(nu(m));
    const civilite = /^(Monsieur|Madame|Mademoiselle|Maître|Mme|Mlle|Me|M\.?)$/;
    let apresCivilite = false;
    return mots.map((m, i) => {
      const n = nu(m);
      if (/@/.test(m)) return '[email]';
      if (!n) return m.replace(/\d/g, '9');
      if (civilite.test(m) || civilite.test(n)) { apresCivilite = true; return m; }
      const majuscule = /^[A-ZÀ-Ý]/.test(n);
      const fin = (m.match(/[^A-Za-zÀ-ɏ°]+$/) || [''])[0].replace(/\d/g, '9');
      if (apresCivilite && majuscule && !sigle(m)) return 'XXX' + fin;
      apresCivilite = false;
      if (minuscule(m) || sigle(m)) return m.replace(/\d/g, '9');
      const suivant = mots[i + 1];
      if (i === 0 && /^[A-ZÀ-Ý][a-zà-ÿœæ'’-]+$/.test(n) && (!suivant || minuscule(suivant) || sigle(suivant))) return m.replace(/\d/g, '9');
      return 'XXX' + fin;
    }).join(' ').replace(/\d/g, '9').replace(/XXX(\s+XXX)+/g, 'XXX');
  }

  // Pure : une cellule « icône » relevée par l'extension (cellule sans texte, titre de l'icône) :
  // « ⟦icône⟧ Signé électroniquement ». Le titre d'une icône est du vocabulaire d'Authentic, pas une
  // donnée : il passe dans la structure, masqué comme un libellé.
  var MARQUE_ICONE_AUTHENTIC = '⟦icône⟧ ';
  function masquerCelluleAuthentic(v) {
    const s = String(v == null ? '' : v);
    return s.startsWith(MARQUE_ICONE_AUTHENTIC)
      ? `[icône : ${masquerLibelleAuthentic(s.slice(MARQUE_ICONE_AUTHENTIC.length)) || 'sans titre'}]`
      : (masquerValeurAuthentic(s).startsWith('[texte') ? `« ${vocabulaireCelluleAuthentic(s)} »` : masquerValeurAuthentic(s));
  }

  // Pure : la structure d'une page reçue, en texte, à copier pour le calibrage.
  function structureCaptureAuthentic(capture) {
    const c = capture || {};
    const lignes = [`Page Authentic — ${masquerLibelleAuthentic(c.titre) || 'sans titre'}`];
    let groupe = null;
    for (const ch of c.champs || []) {
      if (ch.groupe !== groupe) { groupe = ch.groupe; lignes.push('', `## ${masquerLibelleAuthentic(groupe) || '(sans rubrique)'}`); }
      lignes.push(`- ${masquerLibelleAuthentic(ch.libelle) || '(sans libellé)'} : ${masquerValeurAuthentic(ch.valeur)}`);
    }
    // Seule la ligne d'en-tête (<th>) garde ses libellés ; toute autre cellule n'est qu'un type.
    (c.tableaux || []).forEach((t, i) => {
      const corps = t.lignes || [];
      const titre = masquerLibelleAuthentic(t.titre);
      lignes.push('', `## Tableau ${i + 1}${titre ? ` — ${titre}` : ''} (${corps.length} ligne${corps.length > 1 ? 's' : ''})`);
      if ((t.entete || []).length) lignes.push('| ' + t.entete.map(masquerLibelleAuthentic).join(' | ') + ' |');
      corps.slice(0, 6).forEach(l => lignes.push('| ' + l.map(masquerCelluleAuthentic).join(' | ') + ' |'));
      if (corps.length > 6) lignes.push('| …');
    });
    // Texte visible (étude, 02/10 : « Informations financières » et « Parties prenantes » s'affichent
    // sans champ de saisie, seulement en texte) : chaque ligne réduite à son vocabulaire.
    const texte = texteVocabulaireAuthentic(c.texte);
    lignes.push('', `## Texte visible (${String(c.texte || '').length} caractères, vocabulaire seulement)`);
    texte.forEach(l => lignes.push('  ' + l));
    return lignes.join('\n');
  }

  // Mots d'Authentic gardés tels quels dans le texte visible, même suivis d'une valeur (« Capital
  // [montant] ») : du vocabulaire de l'outil, jamais un nom.
  var VOCABULAIRE_AUTHENTIC = ['Capital', 'Prix', 'Notaire', 'Notaires', 'Collaborateur', 'Collaboratrice', 'Clerc', 'Rédacteur',
    'Rédactrice', 'Responsable', 'Retour', 'Envoi', 'Envoyé', 'Envoyée', 'Réquisition', 'Informations', 'Parties', 'Acte', 'Actes',
    'Statut', 'État', 'Etat', 'Date', 'Signé', 'Signée', 'Montant', 'Frais', 'Honoraires', 'Prêt', 'Vendeur', 'Vendeurs', 'Acquéreur',
    'Acquéreurs', 'Comparants', 'Immeubles', 'Négociateur', 'Agence', 'Office', 'Étude', 'Intervenants', 'Intervenant', 'Rôle', 'Type',
    'Nature', 'Total', 'Dépôt', 'Séquestre', 'Financement', 'Banque', 'Organisme', 'Taux', 'Durée', 'Commission', 'Rédaction',
    'Projet', 'Minute', 'Répertoire', 'Dossier', 'Ouverture', 'Clôture', 'Notification', 'Demande', 'Réponse', 'Pièces', 'Documents',
    'Prénom', 'Nom', 'Téléphone', 'Email', 'Adresse', 'Mandataire', 'Diagnostiqueur', 'Géomètre', 'Syndic', 'Prise', 'Reçu', 'Reçue',
    'Mobilier', 'Apport', 'Emprunt', 'Prêteur', 'Garantie', 'Compte', 'Solde', 'Provision', 'Provisions', 'Débit', 'Crédit'];

  // Pure : le texte visible d'une page, ligne à ligne, réduit à son vocabulaire (dates, montants,
  // emails, téléphones → leur type ; noms → XXX). 150 lignes au plus, sans doublon consécutif.
  function texteVocabulaireAuthentic(texte) {
    const lignes = [];
    String(texte || '').split(/\n+/).forEach(brut => {
      let l = brut.replace(/\s+/g, ' ').trim();
      if (!l) return;
      l = l.replace(/[^@\s]+@[^@\s]+\.[a-z]{2,}/gi, '[email]')
        .replace(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/g, '[date]')
        .replace(/(?:\+33\s?|(?<!\d)0)\d(?:[\s.-]?\d{2}){4}(?!\d)/g, '[téléphone]')
        .replace(/-?\d[\d\s.  ]*,\d{2}\s*(?:€|EUR|euros?)?|-?\d[\d\s.  ]*\s*(?:€|EUR|euros?)/gi, '[montant] ');
      const mots = l.split(' ');
      const masque = mots.length > MOTS_MAX_CELLULE_AUTHENTIC ? `[texte, ${mots.length} mots]`
        : mots.map((m, i) => {
          if (/^\[|\]$/.test(m)) return m;
          const n = m.replace(/^[^A-Za-zÀ-ɏ]+|[^A-Za-zÀ-ɏ°]+$/g, '');
          const fin = (m.match(/[^A-Za-zÀ-ɏ°]+$/) || [''])[0].replace(/\d/g, '9');
          if (!n) return m.replace(/\d/g, '9');
          if (VOCABULAIRE_AUTHENTIC.includes(n) || (SIGLES_STRUCTURE_AUTHENTIC.includes(n.toUpperCase()) && n === n.toUpperCase())) return m.replace(/\d/g, '9');
          if (/^[a-zà-ÿœæ'’-]+$/.test(n)) return m.replace(/\d/g, '9');
          // Premier mot à majuscule : gardé seulement devant un mot en minuscules (« Acte de… ») —
          // seul sur sa ligne, il peut être un nom.
          const suivant = (mots[i + 1] || '').replace(/^[^A-Za-zÀ-ɏ]+|[^A-Za-zÀ-ɏ]+$/g, '');
          if (i === 0 && /^[A-ZÀ-Ý][a-zà-ÿœæ'’-]+$/.test(n) && /^[a-zà-ÿœæ'’-]+$/.test(suivant)) return m.replace(/\d/g, '9');
          return 'XXX' + fin;
        }).join(' ').replace(/XXX(\s+XXX)+/g, 'XXX').trim();
      if (masque && masque !== lignes[lignes.length - 1]) lignes.push(masque);
    });
    return lignes.slice(0, 150);
  }

  let captureAuthentic = null;

  async function ouvrirCaptureAuthenticDepuisAdresse() {
    const m = /(?:^|[#&])authentic=([\w-]+)/.exec(location.hash || '');
    if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* adresse gardée */ }
    let r;
    try { r = await fetchAvecAuth('/api/authentic/capture/' + encodeURIComponent(m[1])); } catch (e) { r = null; }
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {};
      afficherToast(j.error || 'Page d’Authentic introuvable : renvoyez-la depuis Firefox.', 'OK', null);
      return;
    }
    captureAuthentic = await r.json();
    renderCaptureAuthentic();
    document.getElementById('authentic-overlay').style.display = 'flex';
  }

  function fermerCaptureAuthentic() {
    const o = document.getElementById('authentic-overlay');
    if (o) o.style.display = 'none';
    captureAuthentic = null;
  }

  function copierStructureAuthentic() {
    if (!captureAuthentic) return;
    const ok = copierTexteSilencieux(structureCaptureAuthentic(captureAuthentic));
    afficherToast(ok ? 'Structure copiée, sans aucune valeur : collez-la dans la conversation avec Claude.' : 'Copie impossible sur ce poste.', 'OK', null);
  }

  function renderCaptureAuthentic() {
    const zone = document.getElementById('authentic-contenu');
    const c = captureAuthentic;
    if (!zone || !c) return;
    const parGroupe = [];
    for (const ch of c.champs || []) {
      const dernier = parGroupe[parGroupe.length - 1];
      if (dernier && dernier.groupe === ch.groupe) dernier.champs.push(ch);
      else parGroupe.push({ groupe: ch.groupe, champs: [ch] });
    }
    const nC = (c.champs || []).length, nT = (c.tableaux || []).length;
    zone.innerHTML = `
      <p class="auth-etat">${escapeHtml(c.titre || 'Page sans titre')} · ${nC} champ${nC > 1 ? 's' : ''}, ${nT} tableau${nT > 1 ? 'x' : ''}</p>
      <div class="auth-liste">
        ${parGroupe.map(g => `<section class="auth-groupe">
          <h3 class="auth-groupe-titre">${escapeHtml(g.groupe || 'Sans rubrique')}</h3>
          <dl class="auth-champs">${g.champs.map(ch => `<div class="auth-champ"><dt>${escapeHtml(ch.libelle || '—')}</dt><dd>${escapeHtml(ch.valeur || '—')}</dd></div>`).join('')}</dl>
        </section>`).join('')}
        ${(c.tableaux || []).map((t, i) => `<section class="auth-groupe">
          <h3 class="auth-groupe-titre">${escapeHtml(t.titre || `Tableau ${i + 1}`)}</h3>
          <div class="table-scroll"><table class="auth-tableau">${(t.entete || []).length ? `<thead><tr>${t.entete.map(x => `<th>${escapeHtml(x)}</th>`).join('')}</tr></thead>` : ''}<tbody>${(t.lignes || []).slice(0, 30).map(l => `<tr>${l.map(x => `<td>${escapeHtml(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        </section>`).join('')}
        ${!nC && !nT ? `<p class="auth-etat">Aucun champ ni tableau lu : seul le texte de la page est arrivé (${String(c.texte || '').length} caractères).</p>` : ''}
      </div>`;
  }

  // ---- Pages d'Authentic lues par CLAIRE (étude, 02/10) ----
  // Trois pages connues, d'après leur structure relevée au bureau : la page de gestion du dossier
  // (intitulé « N - Vente VENDEUR/ACQUÉREUR » et tableaux de documents : intitulé, date, état), la
  // fiche client (personne physique, champs nommés « ficheClientPhysique… ») et la fiche bien
  // (« ficheImmeuble… », cadastre en tableau). Toutes pures : la capture est passée en paramètre.
  // Intitulé du dossier ouvert : « N - Vente VENDEUR/ACQUÉREUR », ou « N - Succession NOM » (étude, 02/10 :
  // forme supposée, à confirmer sur une vraie page de succession).
  var RE_INTITULE_DOSSIER_AUTHENTIC = /(?:^|[^\w])(\d{1,6})\s*-\s*((?:Vente|VTE)\s+[^\n\/]*?\S\s*\/\s*[^\n]*?\S|(?:Succession|SUCC)\.?\s+[^\n\/]*?\S)(?=\s+(?:Importer|Comparants|Immeubles)\b|\s*\n|\s*$)/i;
  var RE_INTITULE_SUCCESSION_AUTHENTIC = /^\s*(?:succession|succ)\.?\s+\S/i;
  // En-tête de la page d'un dossier, QUELLE QUE SOIT sa formulation (étude, 02/10 : « le nom n'est pas
  // fixe et change parfois » — un seul numéro par affaire, promesse et vente comprises) : « N - … »
  // suivi de « Importer », « Comparants » ou « Immeubles », comme sur toute page de dossier.
  var RE_INTITULE_GESTION_AUTHENTIC = /(?:^|[^\w])(\d{1,6})\s*-\s*([A-Za-zÀ-ÿ][^\n]{0,150}?\S)(?=\s*(?:Importer|Comparants|Immeubles)(?![A-Za-zÀ-ÿ]))/i;
  // Intitulé tel que l'étude le voit (onglets, listes) : « VTE VENDEURS / ACQUÉREURS », sans numéro
  // (étude, 02/10 : « le numéro est caché dans les données du dossier »).
  var RE_INTITULE_VTE_SEUL_AUTHENTIC = /^\s*((?:VTE|Vente)\.?\s+[^\n\/]*?\S\s*\/\s*\S[^\n]*?)\s*$/i;
  var RE_EN_TETE_VTE_AUTHENTIC = /(?:^|[^\w-])((?:VTE|Vente)\.?\s+[^\n\/]{0,100}?\S\s*\/\s*[^\n]{0,100}?\S)(?=\s*(?:Importer|Comparants|Immeubles)(?![A-Za-zÀ-ÿ]))/i;
  // Mots de nature d'acte, retirés d'un intitulé pour n'en garder que les noms.
  var MOTS_NATURE_ACTE_AUTHENTIC = new Set(['vente', 'vte', 'promesse', 'compromis', 'avant', 'contrat', 'unilaterale', 'synallagmatique', 'achat', 'acte', 'pv', 'puv', 'maison', 'terrain', 'appartement', 'immeuble', 'bien']);
  // Une ligne qui annonce une demande ou un envoi n'est pas une pièce reçue.
  // « APR » en tête (étude, 02/10) : demande d'état civil envoyée par papier — jamais une pièce reçue
  // (« ECV », état civil virtuel, l'est).
  var RE_DEMANDE_AUTHENTIC = /^\s*(?:demande|courrier|lettre|relance|envoi|envoy|requisition|réquisition|mail|e-?mail|convocation|projet|modele|modèle|apr(?![a-z0-9]))/i;
  var RE_ETAT_NON_RECU_AUTHENTIC = /attente|demand|envoy|envoi|pret\s+pour|a recevoir|à recevoir|relanc|non re[cç]u|manquant|a faire|à faire/i;
  // État civil ajouté aux pièces : naissance et mariage pour une vente ; décès et livret de famille
  // seulement pour une succession (étude, 02/10).
  var RE_ETAT_CIVIL_VENTE_AUTHENTIC = /acte\s+de\s+(?:naissance|mariage)/i;
  var RE_ETAT_CIVIL_SUCCESSION_AUTHENTIC = /acte\s+de\s+(?:naissance|mariage|d[ée]c[èe]s)|livret\s+de\s+famille/i;
  var RE_DATE_FR_AUTHENTIC = /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}/;
  // Casier judiciaire (bulletin n° 3), reçu dans Authentic comme l'état civil et la SAFER.
  var RE_CASIER_AUTHENTIC = /casier\s+judiciaire|bulletin\s+(?:n\s*[°o]?\s*)?3(?!\d)/i;
  var RE_SAFER_NON_PREEMPTION = /non[\s-]*(?:exercice|pr[ée]emption)|renon[cç]|ne\s+(?:pas\s+)?(?:pr[ée]empt|exerc)|pas\s+de\s+pr[ée]emption|purg[ée]/i;

  function dateIsoDepuisFr(v) {
    const m = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(String(v || ''));
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  }
  function libelleNetAuthentic(l) {
    return normaliserPourRecherche(String(l || '').replace(/\*/g, '')).replace(/\s+/g, ' ').trim();
  }
  // Valeur du n-ième champ dont le libellé répond au test (libellé net, puis brut — certains champs
  // n'ont pour libellé que leur nom technique, « …:naissanceDate:naissanceDate »).
  function valeurChampAuthentic(champs, test, rang) {
    const liste = (champs || []).filter(c => c && test(libelleNetAuthentic(c.libelle), String(c.libelle || '')));
    const c = liste[rang || 0];
    return c ? String(c.valeur == null ? '' : c.valeur).replace(/\s+/g, ' ').trim() : '';
  }

  // Pure : 'gestion' | 'client' | 'bien' | 'autre'.
  function typePageAuthentic(capture) {
    const champs = (capture && capture.champs) || [];
    if (champs.some(c => /ficheClientPhysique|tabView:identiteClient:/i.test(c.libelle || ''))) return 'client'; // personne ou société (20/10)
    if (champs.some(c => /ficheImmeuble/i.test(c.libelle || ''))) return 'bien';
    if (intituleDossierAuthentic(capture) && lignesDocumentsAuthentic(capture).length) return 'gestion';
    return 'autre';
  }

  // Pure : le texte de la page sans les titres des onglets INACTIFS (étude, 02/10 : « il peut y avoir
  // plusieurs dossiers ouverts en même temps » — l'intitulé d'un autre dossier ouvert ne doit jamais
  // désigner la page). `capture.onglets` vient de l'extension (0.3.7) : [{ titre, actif }].
  function texteSansOngletsInactifsAuthentic(capture) {
    const c = capture || {};
    const inactifs = new Set((Array.isArray(c.onglets) ? c.onglets : [])
      .filter(o => o && !o.actif).map(o => String(o.titre || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
    const texte = String(c.texte || '');
    if (!inactifs.size) return texte;
    return texte.split('\n').filter(l => !inactifs.has(l.replace(/\s+/g, ' ').trim())).join('\n');
  }

  // Pure : « Promesse de vente MARTEL/FOURNIER », « MARTEL / FOURNIER »… → « Vente MARTEL / FOURNIER » ;
  // un intitulé sans « / » (ni succession) est rendu tel quel.
  // Bouton « Importer avec 6e SENS » d'Authentic, collé à l'intitulé dans le texte de la page ou le titre de l'onglet (étude
  // 06/10 : « parfois il note dans le nom du dossier : Importer avec 6e SENS ») : jamais dans un nom.
  var RE_IMPORTER_SENS_AUTHENTIC = /\s*(?:Importer(?:\s+avec\s+\d+\s*(?:e|er|ème|eme)\s+SENS)?)(?![A-Za-zÀ-ÿ]).*$/i;
  function sansImporterAuthentic(texte) {
    return String(texte || '').replace(RE_IMPORTER_SENS_AUTHENTIC, '').trim();
  }
  function intituleVenteNormalise(intitule) {
    const t = sansImporterAuthentic(String(intitule || '').replace(/\s+/g, ' ').trim());
    if (!t || RE_INTITULE_SUCCESSION_AUTHENTIC.test(t)) return t;
    // Mots entiers seulement (cent scénarios du 19/10 : le « DE » de « DELMAS-EVRARD » était retiré — « LMAS-EVRARD »).
    const m = /^(?:(?:(?:vente|vte|promesse|compromis|avant[\s-]*contrat|pv|puv|unilat[ée]rale|synallagmatique|achat|de)(?![A-Za-zÀ-ÿ-])|d'|d’)\.?\s*)*(.+?)\s*\/\s*(.+)$/i.exec(t);
    return m ? `Vente ${m[1].trim()} / ${m[2].trim()}` : t;
  }

  // Le vrai numéro du dossier (étude, 03/10) : la RÉFÉRENCE du bandeau d'Authentic, « A 2026 00247 »
  // (« A 2026 00247 VTE MERCIER / FRANCOIS »), gardée dans `d.referenceAuthentic` et JAMAIS affichée devant
  // « VTE » ou « SUCC » (« ne pas l'afficher devant VTE, ou plus tard SUCC »). Le « 1 » de « 1 - Vente MERCIER /
  // FRANCOIS » n'est que le rang du sous-dossier, le même dans presque tous les dossiers : pris pour un numéro
  // jusqu'au 03/10, il avait envoyé une page de MERCIER à DORLÉAC (« arrête avec les numéros devant les noms de
  // dossier, ça casse tout ») — il ne sert plus à rien. Sans référence sur la page : les noms et l'adresse du bien.
  var RE_REFERENCE_AUTHENTIC = /(?:^|[^A-Za-z0-9À-ÿ])([A-Z])\s+((?:19|20)\d{2})\s+(\d{4,6})(?![\d\/.,-]?\d)/g;
  var RE_REFERENCE_AUTHENTIC_NORMALISEE = /^[A-Z] (?:19|20)\d{2} \d{4,6}$/;

  // Pure : le texte sans la référence « A 2026 00247 » (« A 2026 00247 VTE X / Y » → « VTE X / Y »).
  function sansReferenceAuthentic(texte) {
    return String(texte || '').replace(new RegExp(RE_REFERENCE_AUTHENTIC.source, 'g'), ' ').replace(/[ \t]+/g, ' ').trim();
  }

  // Pure : les références distinctes citées dans un texte, normalisées (« A 2026 00247 »).
  function referencesDansTexteAuthentic(texte) {
    const vues = [];
    for (const m of String(texte || '').matchAll(new RegExp(RE_REFERENCE_AUTHENTIC.source, 'g'))) {
      const r = `${m[1]} ${m[2]} ${m[3]}`;
      if (!vues.includes(r)) vues.push(r);
    }
    return vues;
  }

  function referenceAuthenticValide(v) {
    return typeof v === 'string' && RE_REFERENCE_AUTHENTIC_NORMALISEE.test(v);
  }

  // Pure : la référence du dossier affiché — celle de l'onglet actif s'il en porte une, sinon la SEULE citée
  // par la page (champs et texte, onglets inactifs retirés) ; deux références différentes (une liste de
  // dossiers) → aucune. '' si la page n'en montre pas.
  function referenceDossierAuthentic(capture) {
    const c = capture || {};
    for (const o of (Array.isArray(c.onglets) ? c.onglets : [])) {
      if (!o || !o.actif) continue;
      const r = referencesDansTexteAuthentic(o.titre);
      if (r.length === 1) return r[0];
    }
    const toutes = [];
    const ajouter = (t) => referencesDansTexteAuthentic(t).forEach(r => { if (!toutes.includes(r)) toutes.push(r); });
    (c.champs || []).forEach(ch => { ajouter(ch.libelle); ajouter(ch.valeur); });
    ajouter(texteSansOngletsInactifsAuthentic(c));
    return toutes.length === 1 ? toutes[0] : '';
  }

  // Pure : { intitule } du dossier affiché (la référence est lue à part, referenceDossierAuthentic). L'intitulé,
  // dans l'ordre de sûreté :
  //  1. le titre de l'onglet ACTIF s'il porte « N - … » ou « VTE X / Y » ;
  //  2. l'en-tête de la page du dossier (« N - … » suivi de Importer / Comparants / Immeubles), toute formulation ;
  //  3. un intitulé « N - Vente X/Y » (ou succession) seul, à condition qu'il soit le SEUL de la page — une liste
  //     de résultats de recherche en cite plusieurs : elle ne désigne aucun dossier.
  function intituleNumeroteAuthentic(capture) {
    const c = capture || {};
    const vide = { intitule: '' };
    const avec = (intitule) => ({ intitule });
    const sources = [];
    (c.champs || []).forEach(ch => { sources.push(ch.libelle || ''); sources.push(ch.valeur || ''); });
    sources.push(texteSansOngletsInactifsAuthentic(c));
    // 1. L'onglet ACTIF : « N - … » ou, comme l'étude le voit, « VTE VENDEURS / ACQUÉREURS ».
    for (const o of (Array.isArray(c.onglets) ? c.onglets : [])) {
      if (!o || !o.actif) continue;
      const titre = sansReferenceAuthentic(String(o.titre || '').replace(/\s+/g, ' '));
      const m = /^\s*\d{1,6}\s*-\s*([A-Za-zÀ-ÿ].*?)\s*$/.exec(titre);
      if (m) return avec(intituleVenteNormalise(m[1]));
      const v = RE_INTITULE_VTE_SEUL_AUTHENTIC.exec(titre);
      if (v) return avec(intituleVenteNormalise(v[1]));
    }
    // 2. Le bandeau du dossier, « A 2026 00230 VTE LEDRU / ROY » (étude, 03/10 : l'en-tête du sous-dossier ne dit
    //    parfois que « 2 - Vente d'immeuble », sans aucun nom — la page de LEDRU était allée à CHAHUNEAU).
    const bandeaux = [];
    sources.forEach(s => {
      const re = new RegExp(RE_REFERENCE_AUTHENTIC.source + '[^\\S\\n]+((?:VTE|Vente|SUCC|Succession|DON|Donation)\\.?[^\\S\\n]+[^\\n]{1,150}?\\S)[^\\S\\n]*(?=\\n|$)', 'gi');
      for (const m of String(s).matchAll(re)) {
        const i = intituleVenteNormalise(m[4]);
        if (!bandeaux.includes(i)) bandeaux.push(i);
      }
    });
    if (bandeaux.length === 1) return avec(bandeaux[0]);
    // 3. L'en-tête de la page du dossier, avec son rang…
    for (const s of sources) {
      const m = RE_INTITULE_GESTION_AUTHENTIC.exec(String(s));
      if (m) return avec(intituleVenteNormalise(m[2]));
    }
    // … ou sans (« VTE X / Y » suivi de Importer / Comparants / Immeubles).
    for (const s of sources) {
      const m = RE_EN_TETE_VTE_AUTHENTIC.exec(String(s));
      if (m) return avec(intituleVenteNormalise(m[1]));
    }
    // 3. Un intitulé « N - Vente X/Y » seul, s'il est le SEUL de la page.
    const vus = [];
    const re = new RegExp(RE_INTITULE_DOSSIER_AUTHENTIC.source, 'gi');
    sources.forEach(s => {
      for (const m of String(s).matchAll(re)) {
        const intitule = intituleVenteNormalise(m[2]);
        if (!vus.includes(intitule)) vus.push(intitule);
      }
    });
    return vus.length === 1 ? avec(vus[0]) : vide;
  }

  // Pure : le sous-dossier ouvert dans Authentic, d'après l'en-tête « N - … » suivi de Importer / Comparants /
  // Immeubles — 'vente' | 'promesse' | 'avenant' | 'succession' | 'autre', '' si la page n'en montre pas.
  // Étude, 03/10 (dossier BEUCHER : « 1 - Promesse VTE … », « 2 - VTE … », « 3 - Avenant à promesse de vente ») :
  // « le seul sous-dossier qui nous intéresse est le sous-dossier vente, pas la promesse et l'avenant ».
  function sousDossierAuthentic(capture) {
    const c = capture || {};
    const sources = [];
    (c.champs || []).forEach(ch => { sources.push(ch.libelle || ''); sources.push(ch.valeur || ''); });
    sources.push(texteSansOngletsInactifsAuthentic(c));
    for (const src of sources) {
      const m = RE_INTITULE_GESTION_AUTHENTIC.exec(sansReferenceAuthentic(String(src)));
      if (!m) continue;
      const l = normaliserPourRecherche(m[2]).trim();
      if (/^avenant/.test(l)) return 'avenant';
      if (/^(?:promesse|compromis|avant[\s-]*contrat|pv|puv)(?![a-z])/.test(l)) return 'promesse';
      if (/^(?:vte|vente)(?![a-z])/.test(l)) return 'vente';
      if (/^(?:succ|succession)(?![a-z])/.test(l)) return 'succession';
      if (/^(?:acte\s+de\s+)?pret(?![a-z])/.test(l)) return 'pret';
      return 'autre';
    }
    return '';
  }

  // Pure : « Vente VENDEUR / ACQUÉREUR » d'après l'intitulé du dossier ouvert dans Authentic (ou
  // l'intitulé tel quel quand il n'a pas cette forme).
  function intituleDossierAuthentic(capture) {
    return intituleNumeroteAuthentic(capture).intitule;
  }

  // ---- Rapprochement d'un dossier Authentic avec CLAIRE : un score (étude, 02/10 : « comparer nom des
  // parties et adresse du bien vendu, au cas où il y ait deux ventes en même temps ») ----
  // Noms : 3 points par côté quand les mots du nom sont les mêmes (« consort(s) », « et », « époux »…
  // ignorés), 2 si l'un contient l'autre (« MARTEL » ↔ « MARTEL ET DURAND »), cherchés dans le nom du
  // dossier puis dans ses parties. Adresse du bien (« Immeubles » de la page) : code postal 1, commune
  // 1, voie 3, numéro 1 ; une adresse qui ne correspond pas (autre voie ou autre code postal, les deux
  // connues) retire des points. Retenu : 6 points au moins (les deux noms, ou un nom et la voie), avec
  // 2 points d'avance sur le suivant — sinon rien (jamais deviné). Un dossier archivé ne compte que si
  // aucun dossier en cours n'est retenu.
  var MOTS_IGNORES_NOM_AUTHENTIC = new Set(['consort', 'consorts', 'et', 'epoux', 'm', 'mme', 'mr', 'monsieur', 'madame', 'les', 'indivision', 'succession', 'sci', 'de', 'du', 'des', 'la', 'le']);
  var MOTS_IGNORES_ADRESSE_AUTHENTIC = new Set(['rue', 'route', 'avenue', 'av', 'chemin', 'allee', 'allees', 'impasse', 'place', 'boulevard', 'bd', 'quai', 'cours', 'lieu', 'dit', 'lieudit', 'lotissement', 'residence', 'hameau', 'square', 'passage', 'sentier', 'rte', 'ch', 'imp', 'pl', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'en', 'et', 'sur', 'sous', 'bis', 'ter', 'cedex', 'france']);

  function motsNomAuthentic(s) {
    return normaliserPourRecherche(String(s || '')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
      .filter(m => m && m.length > 1 && !MOTS_IGNORES_NOM_AUTHENTIC.has(m));
  }

  // Pure : { codePostal, commune: [mots], voie: [mots], numero } d'une adresse en texte libre.
  function elementsAdresseAuthentic(texte) {
    const brut = normaliserPourRecherche(String(texte || '')).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!brut) return null;
    const cp = (/(?:^|\s)(\d{5})(?=\s|$)/.exec(brut) || [])[1] || '';
    const mots = brut.split(' ').filter(m => m && m !== cp);
    const numero = (mots.find(m => /^\d{1,4}$/.test(m)) || '');
    const utiles = mots.filter(m => !/^\d+$/.test(m) && m.length > 1 && !MOTS_IGNORES_ADRESSE_AUTHENTIC.has(m));
    return { codePostal: cp, numero, mots: utiles };
  }

  // Pure : l'adresse du (des) bien(s) affichée sur la page du dossier, rubrique « Immeubles (n) ».
  function adresseBienPageAuthentic(capture) {
    const c = capture || {};
    const sources = [c.texte || ''].concat((c.champs || []).map(ch => (ch.libelle || '') + ' ' + (ch.valeur || '')));
    for (const src of sources) {
      const m = /Immeubles?\s*\(\d+\)\s*/i.exec(String(src));
      if (!m) continue;
      let suite = String(src).slice(m.index + m[0].length, m.index + m[0].length + 240);
      const fin = /\n\s*(?:Documents?|Parties|Informations|Comparants|Notes?|Rechercher|Filtrer|Mod[eè]le|Importer|Pi[eè]ces)/i.exec(suite);
      if (fin) suite = suite.slice(0, fin.index);
      suite = suite.replace(/\s+/g, ' ').trim();
      if (suite) return suite;
    }
    return '';
  }

  function texteAdresseDossierAuthentic(d) {
    const a = (d && d.bien && d.bien.adresse) || {};
    return [d && d.adresseBien, a.adresseComplete, a.numero, a.typeVoie, a.nomVoie, a.lieuDit, a.codePostal, a.commune].filter(Boolean).join(' ');
  }

  // Pure : score d'un dossier CLAIRE pour un intitulé (« Vente X / Y ») et une adresse de bien.
  // → { score, nomsTrouves, details: [texte] }
  function scoreDossierAuthentic(intitule, adresse, d) {
    const r = { score: 0, nomsTrouves: 0, details: [] };
    intitule = intituleVenteNormalise(intitule);
    const egal = (a, b) => a.length && b.length && a.length === b.length && a.every(x => b.includes(x));
    const inclus = (a, b) => a.length && b.length && (a.every(x => b.includes(x)) || b.every(x => a.includes(x)));
    // Succession (« Succession DUPONT Jean ») : un seul nom, comparé au nom d'un dossier de succession
    // seulement — identique 6, l'un dans l'autre 4.
    const ms = /^\s*(?:succession|succ)\.?\s+(.+?)\s*$/i.exec(intitule || '');
    if (ms) {
      if (!d || d.typeAffaire !== 'succession') return r;
      const voulus = motsNomAuthentic(ms[1]);
      const dossierMots = motsNomAuthentic(d.nom);
      const pts = egal(voulus, dossierMots) ? 6 : inclus(voulus, dossierMots) ? 4 : 0;
      if (pts) { r.score += pts; r.nomsTrouves++; r.details.push(`nom ${pts === 6 ? 'identique' : 'proche'} (+${pts})`); }
    }
    const m = /^\s*(?:vte|vente)\s+(.+?)\s*\/\s*(.+?)\s*$/i.exec(intitule || '');
    if (!d) return r;
    const n = /^\s*(.+?)\s*\/\s*(.+?)\s*$/.exec(String(d.nom || ''));
    const parties = Array.isArray(d.parties) ? d.parties : [];
    // Succession à l'intitulé réel (« Mme X veuve de M. Y ») : tous les mots du nom du dossier (« SUCC », « veuve »… ignorés) dans
    // l'intitulé — 6 ; jamais pour un intitulé qui dit une vente, une promesse ou une donation (relecture 16/10).
    const motsBruts = motsNomAuthentic(intitule);
    if (!m && !ms && d.typeAffaire === 'succession' && !motsBruts.some(x => MOTS_NATURE_ACTE_AUTHENTIC.has(x) || x === 'donation')) {
      const sansLiens = (l) => l.filter(x => !MOTS_LIEN_SUCCESSION_AUTHENTIC.has(x));
      const motsPage = sansLiens(motsBruts);
      const dossierMots = sansLiens(motsNomAuthentic(d.nom));
      if (dossierMots.length && dossierMots.every(x => motsPage.includes(x))) { r.score += 6; r.nomsTrouves++; r.details.push(`nom ${egal(motsPage, dossierMots) ? 'identique' : 'trouvé'} (+6)`); }
      return r;
    }
    if (!m && !ms && d.typeAffaire === 'succession') return r;
    // Intitulé d'une succession (« … veuve de M. … ») : jamais celui d'une vente.
    if (!m && /(?:veuve|veuf)\s+de\s/i.test(intitule || '')) return r;
    // Intitulé d'une autre forme (« MARTEL Promesse », « VTE MARTEL - FOURNIER »…) : chaque côté du
    // dossier dont tous les mots du nom figurent dans l'intitulé — 3 points (nom du dossier), 2 (partie).
    if (!m && !ms) {
      const motsPage = motsNomAuthentic(intitule).filter(x => !MOTS_NATURE_ACTE_AUTHENTIC.has(x));
      if (!motsPage.length) return r;
      [[n && n[1], 'VENDEUR', 'vendeur'], [n && n[2], 'ACQUEREUR', 'acquéreur']].forEach(([coteDossier, role, libelle]) => {
        const dossierMots = motsNomAuthentic(coteDossier);
        let pts = 0;
        if (dossierMots.length && dossierMots.every(x => motsPage.includes(x))) pts = 3;
        else if (parties.some(p => p && p.role === role && motsNomAuthentic(p.nom).length && motsNomAuthentic(p.nom).every(x => motsPage.includes(x)))) pts = 2;
        if (pts) { r.score += pts; r.nomsTrouves++; r.details.push(`${libelle} ${pts === 3 ? 'trouvé' : 'proche'} (+${pts})`); }
      });
    }
    (m ? [[m[1], n && n[1], 'VENDEUR', 'vendeur'], [m[2], n && n[2], 'ACQUEREUR', 'acquéreur']] : []).forEach(([cote, coteDossier, role, libelle]) => {
      const voulus = motsNomAuthentic(cote);
      if (!voulus.length) return;
      const dossierMots = motsNomAuthentic(coteDossier);
      const partiesMots = parties.filter(p => p && p.role === role).map(p => motsNomAuthentic([p.nom, p.nomUsage].filter(Boolean).join(' ')));
      let pts = 0;
      if (egal(voulus, dossierMots)) pts = 3;
      else if (inclus(voulus, dossierMots) || partiesMots.some(pm => voulus.every(x => pm.includes(x)))) pts = 2;
      if (pts) { r.score += pts; r.nomsTrouves++; r.details.push(`${libelle} ${pts === 3 ? 'identique' : 'proche'} (+${pts})`); }
    });
    const page = elementsAdresseAuthentic(adresse);
    const dossier = elementsAdresseAuthentic(texteAdresseDossierAuthentic(d));
    if (page && dossier && (page.mots.length || page.codePostal)) {
      const communs = page.mots.filter(x => dossier.mots.includes(x));
      const cpEgal = page.codePostal && dossier.codePostal && page.codePostal === dossier.codePostal;
      const cpDifferent = page.codePostal && dossier.codePostal && page.codePostal !== dossier.codePostal;
      if (cpEgal) { r.score += 1; r.details.push('code postal (+1)'); }
      if (communs.length >= 2) { r.score += 4; r.details.push(`adresse (${communs.join(' ')}) (+4)`); }
      else if (communs.length === 1) { r.score += 2; r.details.push(`adresse (${communs[0]}) (+2)`); }
      if (communs.length && page.numero && page.numero === dossier.numero) { r.score += 1; r.details.push('numéro (+1)'); }
      if (cpDifferent) { r.score -= 3; r.details.push('autre code postal (−3)'); }
      else if (!communs.length && page.mots.length && dossier.mots.length) { r.score -= 2; r.details.push('autre adresse (−2)'); }
    }
    return r;
  }

  var SEUIL_DOSSIER_AUTHENTIC = 6;
  // Pure : le dossier CLAIRE de cet intitulé (et de cette adresse de bien, si la page la montre) ;
  // null si aucun n'atteint le seuil ou si deux sont trop proches (jamais deviné).
  function dossierPourIntituleAuthentic(intitule, liste, adresse, reference) {
    const vivants = (liste || []).filter(d => d && !d.deleted);
    const ref = referenceAuthenticValide(reference) ? reference : '';
    // La référence d'Authentic (« A 2026 00247 ») d'abord : elle désigne l'affaire, quel que soit l'intitulé du jour.
    if (ref) {
      const memes = vivants.filter(d => d.referenceAuthentic === ref);
      if (memes.length === 1) return memes[0];
    }
    if (!String(intitule || '').trim()) return null;
    // Rangé une fois à la main (« Choisir ») : cet intitulé va à ce dossier.
    const cle = cleIntituleAuthentic(intitule);
    const choisis = vivants.filter(d => (d.intitulesAuthentic || []).includes(cle) && !autreReferenceAuthentic(d, ref));
    if (choisis.length === 1) return choisis[0];
    // Un dossier déjà rattaché à une AUTRE référence n'est jamais celui-là.
    const notes = vivants.filter(d => !autreReferenceAuthentic(d, ref))
      .map(d => ({ d, s: scoreDossierAuthentic(intitule, adresse, d) }))
      .filter(x => x.s.nomsTrouves >= 1 && x.s.score >= SEUIL_DOSSIER_AUTHENTIC);
    const choisir = (cands) => {
      const tries = cands.slice().sort((a, b) => b.s.score - a.s.score);
      if (!tries.length) return undefined;
      if (tries.length > 1 && tries[0].s.score - tries[1].s.score < 2) return null;
      return tries[0].d;
    };
    const enCours = choisir(notes.filter(x => !x.d.archive));
    if (enCours !== undefined) return enCours;
    const archives = choisir(notes.filter(x => x.d.archive));
    return archives === undefined ? null : archives;
  }

  // Pure : à quel dossier d'Authentic la fiche est rattachée (étude, 03/10 : « mettre dans la fiche avec quel
  // dossier il est rattaché sur Authentic, dans un petit i ») — '' si aucun.
  function texteRattachementAuthentic(d) {
    if (!d || !referenceAuthenticValide(d.referenceAuthentic)) return '';
    const intitule = String(d.intituleAuthentic || '').replace(/^\s*vente\s+/i, 'VTE ').replace(/^\s*succession\s+/i, 'SUCC ');
    return `Rattaché au dossier Authentic ${d.referenceAuthentic}${intitule ? ` — ${intitule}` : ''}`;
  }

  function autreReferenceAuthentic(d, ref) {
    return !!ref && referenceAuthenticValide(d && d.referenceAuthentic) && d.referenceAuthentic !== ref;
  }

  // Pure : pourquoi la page d'un dossier d'Authentic n'a trouvé aucun dossier de CLAIRE (étude, 02/10 :
  // « pourquoi parfois les données ne remontent pas ? » — avant, rien n'était dit).
  function raisonDossierAuthenticIntrouvable(intitule, liste, adresse, reference) {
    if (!intitule) return 'intitulé du dossier non lu sur la page';
    const ref = referenceAuthenticValide(reference) ? reference : '';
    const vivants = (liste || []).filter(d => d && !d.deleted);
    const notes = vivants.map(d => ({ d, s: scoreDossierAuthentic(intitule, adresse, d) }))
      .filter(x => x.s.nomsTrouves >= 1).sort((a, b) => b.s.score - a.s.score);
    if (!notes.length) return 'aucun dossier de CLAIRE ne porte ces noms';
    const eligibles = notes.filter(x => !autreReferenceAuthentic(x.d, ref));
    const retenus = eligibles.filter(x => x.s.score >= SEUIL_DOSSIER_AUTHENTIC);
    if (!retenus.length && !eligibles.length) {
      return `${libelleDossierAffiche(notes[0].d)} porte ces noms mais est rattaché à un autre dossier d'Authentic (autre référence)`;
    }
    if (!retenus.length) {
      const m = eligibles[0];
      return `le plus proche, ${libelleDossierAffiche(m.d)}, n'a que ${Math.max(0, m.s.score)} point${m.s.score > 1 ? 's' : ''} sur ${SEUIL_DOSSIER_AUTHENTIC} (${m.s.details.join(', ')})`;
    }
    if (retenus.length > 1 && retenus[0].s.score - retenus[1].s.score < 2) {
      return `deux dossiers aussi proches : ${retenus.slice(0, 2).map(x => `${libelleDossierAffiche(x.d)} (${x.s.score} pts)`).join(', ')}`;
    }
    return 'dossier non retrouvé';
  }

  // Pure : la page est celle d'un ANCIEN dossier des mêmes clients (étude, 02/10 : « je peux aller sur
  // d'anciens dossiers dont le nom d'un client est associé au nom du dossier avec d'autres clients ») —
  // son acte a été signé avant l'avant-contrat (ou l'ouverture) du dossier retrouvé par les noms.
  function ancienDossierAuthentic(capture, d) {
    const acte = etatActeAuthentic(capture);
    if (!d || !acte || acte.etat !== 'signe' || !acte.date) return false;
    const debut = d.dateAvantContrat || dateOuvertureDossier(d);
    return !!debut && acte.date < debut;
  }

  // Pure : comment le dossier a été retrouvé, dit au journal (étude, 02/10 : « détecter le nom du dossier,
  // vérifier l'adresse et ainsi retrouver le dossier ») — par son numéro, sinon par les noms de
  // l'intitulé, confirmés (ou non) par l'adresse du bien de la page.
  function commentDossierRetrouveAuthentic(intitule, adresse, d, reference) {
    if (!d) return '';
    if (referenceAuthenticValide(reference) && d.referenceAuthentic === reference) return 'retrouvé par sa référence Authentic';
    if ((d.intitulesAuthentic || []).includes(cleIntituleAuthentic(intitule))) return 'rangé ici à la main une première fois';
    const s = scoreDossierAuthentic(intitule, adresse, d);
    const noms = s.details.filter(t => /^(?:vendeur|acquéreur|nom)/.test(t)).map(t => t.replace(/\s*\([+−-]\d+\)$/, ''));
    const adr = s.details.filter(t => !/^(?:vendeur|acquéreur|nom)/.test(t)).map(t => t.replace(/\s*\([+−-]\d+\)$/, ''));
    return `retrouvé par les noms (${noms.join(', ') || '—'})${adr.length ? `, adresse : ${adr.join(', ')}` : ', adresse non affichée sur la page'} — ${s.score} points`;
  }

  // Pure : la page d'un dossier non reconnu mérite-t-elle un message « Choisir » ? Non pour un dossier
  // signé (un ancien dossier qu'on consulte), ni quand les seuls dossiers aux mêmes noms ont déjà leur
  // numéro d'Authentic (une affaire = un numéro : c'en est une autre). Le journal la garde de toute façon.
  function proposerChoixDossierAuthentic(capture, intitule, liste) {
    const acte = etatActeAuthentic(capture);
    if (acte && acte.etat === 'signe') return false;
    const ref = referenceDossierAuthentic(capture);
    return candidatsDossierAuthentic(intitule, adresseBienPageAuthentic(capture), liste)
      .some(x => x.s.nomsTrouves && !autreReferenceAuthentic(x.d, ref));
  }

  // Pure : page de VENTE (ou de SUCCESSION, étude 16/10) d'Authentic sans dossier dans CLAIRE — en proposer la création ? (Étude, 03/10 :
  // bandeau « Créer », jamais d'office.) Non pour un acte déjà signé (un
  // ancien dossier qu'on consulte) ou un sous-dossier autre que la vente. Le badge d'Authentic (vert signé,
  // orange demande de pièces, rouge pas constitué) n'est pas relevé : ses textes restent à lire sur une vraie page.
  function proposerCreationDossierAuthentic(capture, intitule) {
    if (!intitule) return false;
    // Succession (étude 16/10 : « que la détection des nouveaux dossiers à créer fonctionne comme pour les ventes ») : proposée aussi,
    // sauf quand tous les actes du tableau « Rédaction » sont signés (une succession terminée qu'on consulte).
    if (pageSuccessionAuthentic(capture, intitule)) {
      const actes = actesSuccessionAuthentic(capture);
      return !(actes.length && actes.every(a => a.etat === 'signe'));
    }
    const sous = sousDossierAuthentic(capture);
    if (sous && sous !== 'vente') return false;
    const acte = etatActeAuthentic(capture);
    return !(acte && acte.etat === 'signe');
  }

  // Pure : les dossiers proposés pour ranger à la main la page d'un dossier d'Authentic — en cours,
  // les plus ressemblants d'abord.
  function candidatsDossierAuthentic(intitule, adresse, liste) {
    return (liste || []).filter(d => d && !d.deleted && !d.archive)
      .map(d => ({ d, s: scoreDossierAuthentic(intitule || '', adresse || '', d) }))
      .sort((a, b) => (b.s.nomsTrouves ? b.s.score + 100 : 0) - (a.s.nomsTrouves ? a.s.score + 100 : 0)
        || libelleDossierAffiche(a.d).localeCompare(libelleDossierAffiche(b.d), 'fr'));
  }

  // Pure : l'intitulé d'Authentic réduit à ce qui le distingue (minuscules, sans accents ni ponctuation).
  function cleIntituleAuthentic(intitule) {
    return normaliserPourRecherche(String(intitule || '')).replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Pure (modifie le dossier passé) : la référence d'Authentic retenue sur la fiche la première fois que le
  // dossier est reconnu — jamais s'il en a déjà une, ni si elle appartient déjà à un autre dossier. Jamais
  // affichée (étude, 03/10) : une ligne d'historique seulement.
  function retenirReferenceAuthentic(d, reference, liste) {
    if (!d || !referenceAuthenticValide(reference) || referenceAuthenticValide(d.referenceAuthentic)) return false;
    if ((liste || []).some(x => x && x !== d && !x.deleted && x.referenceAuthentic === reference)) return false;
    d.referenceAuthentic = reference;
    d.historique = d.historique || [];
    d.historique.push({ date: new Date().toISOString(), texte: `Dossier Authentic ${reference} rattaché` });
    return true;
  }

  // Pure (modifie les dossiers passés) : page d'un dossier d'Authentic rangée À LA MAIN — son intitulé (et
  // sa référence, si la page en montre une) iront désormais à ce dossier ; ils quittent celui qui les
  // portait. → les autres dossiers modifiés.
  function rattacherIntituleAuthentic(d, intitule, liste, reference) {
    const cle = cleIntituleAuthentic(intitule);
    const ref = referenceAuthenticValide(reference) ? reference : '';
    if (!d || (!cle && !ref)) return [];
    const t = new Date().toISOString();
    const quittes = new Set();
    const noter = (x, texte) => { x.historique = x.historique || []; x.historique.push({ date: t, texte }); };
    const autres = (liste || []).filter(x => x && x !== d && !x.deleted);
    if (ref) {
      autres.filter(x => x.referenceAuthentic === ref).forEach(x => {
        delete x.referenceAuthentic;
        noter(x, `Dossier Authentic ${ref} rattaché à ${libelleDossierAffiche(d)} à la main`);
        quittes.add(x);
      });
      if (d.referenceAuthentic !== ref) { d.referenceAuthentic = ref; noter(d, `Dossier Authentic ${ref} rattaché à la main`); }
      if (intitule) d.intituleAuthentic = String(intitule).slice(0, 150);
    }
    if (cle) {
      autres.filter(x => (x.intitulesAuthentic || []).includes(cle)).forEach(x => {
        x.intitulesAuthentic = x.intitulesAuthentic.filter(c => c !== cle);
        noter(x, `Dossier Authentic « ${intitule} » rangé dans ${libelleDossierAffiche(d)} à la main`);
        quittes.add(x);
      });
      if (!(d.intitulesAuthentic || []).includes(cle)) {
        d.intitulesAuthentic = (d.intitulesAuthentic || []).concat(cle).slice(-5);
        noter(d, `Dossier Authentic « ${intitule} » rangé ici à la main`);
      }
    }
    return [...quittes];
  }

  // Pure : les lignes de documents des tableaux de la page de gestion — intitulé (première cellule
  // de texte), date (première date), état (dernière cellule de texte), texte de toute la ligne.
  function lignesDocumentsAuthentic(capture) {
    const lignes = [];
    ((capture && capture.tableaux) || []).forEach(t => {
      const entete = (t.entete || []).map(libelleNetAuthentic);
      if (entete.includes('section') && entete.some(e => /^num/.test(e))) return;   // cadastre
      (t.lignes || []).forEach(l => {
        const cellules = (l || []).map(x => String(x == null ? '' : x).replace(/\s+/g, ' ').trim());
        const iDate = cellules.findIndex(x => /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}/.test(x));
        if (iDate < 0 || cellules.length < 3) return;
        const textes = cellules.map((x, i) => ({ x, i })).filter(o => o.x && !/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}/.test(o.x) && !/^⟦icône⟧/.test(o.x));
        if (!textes.length) return;
        const titre = textes[0].x;
        const dernier = textes[textes.length - 1];
        const dates = cellules.filter(x => RE_DATE_FR_AUTHENTIC.test(x)).map(dateIsoDepuisFr);
        lignes.push({ titre, date: dateIsoDepuisFr(cellules[iDate]), dates, etat: dernier.i !== textes[0].i ? dernier.x : '', texte: cellules.filter(Boolean).join(' · '), tableau: t.titre || '' });
      });
    });
    return lignes;
  }

  // Pure : état d'une ligne d'état civil ou de casier (étude, 02/10 — état civil virtuel « ECV » par
  // Comedec : « pris en compte » / « en attente », puis « positif » = document reçu, « négatif » =
  // erreur, Comedec n'a pas pu répondre). Une ligne sans état et sans « ECV » est un document
  // déposé : reçu.
  function etatEtatCivilAuthentic(l) {
    const t = normaliserPourRecherche([l.etat, l.texte].filter(Boolean).join(' '));
    if (/negati/.test(t)) return 'negatif';
    if (/positi|re[cç]u|delivr/.test(t)) return 'positif';
    if (/pris(?:e)?\s+en\s+compte|attente|en\s+cours|envoy|envoi|pret\s+pour|transmis|demand/.test(t)) return 'attente';
    return /^\s*ecv(?![a-z0-9])/i.test(l.titre || '') ? 'attente' : 'positif';
  }

  // Pure : les actes d'état civil et casiers vus sur la page, avec leur état Comedec —
  // { cle: { label, etat, date } } (même clé que la pièce du dossier). Jamais une ligne « APR »
  // (demande papier) ni une demande.
  function suiviEtatsCivilsAuthentic(lignes, typeAffaire) {
    const reEtatCivil = typeAffaire === 'succession' ? RE_ETAT_CIVIL_SUCCESSION_AUTHENTIC : RE_ETAT_CIVIL_VENTE_AUTHENTIC;
    const r = {};
    (lignes || []).forEach(l => {
      if (RE_DEMANDE_AUTHENTIC.test(normaliserPourRecherche(l.titre || ''))) return;
      if (!reEtatCivil.test(l.titre || '') && !RE_CASIER_AUTHENTIC.test(l.titre || '')) return;
      const label = labelPieceEtatCivilAuthentic(l.titre);
      // Casier judiciaire (étude 19/10 : « ce n'est pas un Comedec, reprendre le texte à droite de la date ») : son statut tel qu'Authentic l'écrit.
      r[clePieceEtatCivilAuthentic(label)] = Object.assign({ label, etat: etatEtatCivilAuthentic(l), date: l.date || '' }, RE_CASIER_AUTHENTIC.test(l.titre || '') ? { casier: true, statut: String(l.etat || '').replace(/\s+/g, ' ').trim().slice(0, 80) } : {});
    });
    return r;
  }
  function labelPieceEtatCivilAuthentic(titre) {
    return String(titre || '').replace(/^\s*ECV(?![A-Za-z0-9])\s*[-:–]?\s*/i, '').slice(0, 90);
  }
  function clePieceEtatCivilAuthentic(label) {
    return 'perso-authentic-' + normaliserPourRecherche(label).replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  }

  // Pure : demandes d'urbanisme vues sur la page (étude, 02/10 : « courriers d'alignement et de
  // numérotage : ne pas cocher, c'est une demande ; marquer envoyée sous la pièce ») —
  // { cle de la pièce : { date, titre } }. La DIA est la demande de renonciation au droit de préemption.
  function demandesUrbanismeAuthentic(lignes) {
    const r = {};
    (lignes || []).forEach(l => {
      const titre = String(l.titre || '');
      const net = normaliserPourRecherche(titre);
      // « Formulaire A - DIA auprès de la SAFER » : la notification à la SAFER, suivie à part, jamais la DIA de la mairie.
      if (/safer/.test(net)) return;
      const estDemande = RE_DEMANDE_AUTHENTIC.test(net) || /envoy|attente|demand/.test(normaliserPourRecherche(l.etat || ''));
      let cle = '';
      if (/intention\s+d.?\s*alien|(?:^|[^a-z])dia(?:[^a-z]|$)/.test(net)) cle = 'renonciationPreemption';
      else if (estDemande) {
        const sansDemande = titre.replace(/^\s*(?:demande|courrier|lettre|relance|envoi|envoy[ée]e?s?|mail|e-?mail)\s*(?:de|d['’]|du|pour)?\s*/i, '');
        const nom = normaliserNomPourMotif(sansDemande + '.pdf');
        const piece = [...PIECES_URBANISME, PIECE_NON_PERIL].find(p => correspondancePieceNom(p, nom) === 'exact');
        if (piece) cle = piece.cle;
      }
      if (cle && !r[cle]) r[cle] = { date: dateEnvoiLigneAuthentic(l), titre: titre.slice(0, 90) };
    });
    return r;
  }

  function ligneAuthenticRecue(l) {
    return !!l && !RE_DEMANDE_AUTHENTIC.test(normaliserPourRecherche(l.titre)) && !RE_ETAT_NON_RECU_AUTHENTIC.test(normaliserPourRecherche(l.etat || ''));
  }

  // Pure : pièces de la checklist reçues d'après les lignes (même règle que l'export ZIP : le nom,
  // jamais le contenu), plus les actes d'état civil et la réponse SAFER de non-préemption, ajoutés
  // comme pièces du dossier. [{ cle, label, nouvelle, date, titre }]
  // Pure : les pièces reçues d'après les lignes de la page de gestion. Seules trois sortes de
  // réponses arrivent DANS Authentic (étude, 02/10) : les actes d'état civil, les casiers
  // judiciaires et la réponse SAFER ; tout le reste (urbanisme, diagnostics…) arrive par email ou
  // courrier, et la page n'en montre que les courriers de demande — jamais repris. Chaque pièce
  // reçue est une pièce du dossier à son intitulé (une par personne), reprise si elle existe déjà.
  // [{ cle, label, nouvelle, date, titre }]
  function piecesRecuesAuthentic(lignes, checklist, typeAffaire) {
    const reEtatCivil = typeAffaire === 'succession' ? RE_ETAT_CIVIL_SUCCESSION_AUTHENTIC : RE_ETAT_CIVIL_VENTE_AUTHENTIC;
    const resultat = [];
    const liste = checklist || [];
    const ajouter = (o) => { if (!resultat.some(r => r.cle === o.cle)) resultat.push(o); };
    (lignes || []).filter(ligneAuthenticRecue).forEach(l => {
      if (/safer/i.test(l.texte)) {
        if (!RE_SAFER_NON_PREEMPTION.test(normaliserPourRecherche(l.texte))) return;
        const existante = liste.find(p => p.personnalisee && /safer/i.test(p.label));
        ajouter(existante ? { cle: existante.cle, label: existante.label, nouvelle: false, date: l.date, titre: l.titre }
          : { cle: 'perso-safer', label: 'Réponse SAFER', nouvelle: true, date: l.date, titre: l.titre });
        return;
      }
      if (reEtatCivil.test(l.titre) || RE_CASIER_AUTHENTIC.test(l.titre)) {
        // Comedec : seul « positif » (ou un document déposé) est une pièce reçue.
        if (etatEtatCivilAuthentic(l) !== 'positif') return;
        const label = labelPieceEtatCivilAuthentic(l.titre);
        const cleLabel = normaliserPourRecherche(label);
        const existante = liste.find(p => p.personnalisee && normaliserPourRecherche(p.label) === cleLabel);
        ajouter(existante ? { cle: existante.cle, label: existante.label, nouvelle: false, date: l.date, titre: l.titre }
          : { cle: clePieceEtatCivilAuthentic(label), label, nouvelle: true, date: l.date, titre: l.titre });
      }
    });
    return resultat;
  }

  function adresseFicheAuthentic(champs) {
    const v = (lib) => valeurChampAuthentic(champs, n => n === lib);
    const numero = v('n° de voie'), typeVoie = v('type de voie'), nomVoie = v('nom de la voie');
    const lieuDit = valeurChampAuthentic(champs, n => /^lieu-dit/.test(n));
    const cpVille = v('cp - ville');
    const m = /^(\d{5})\s+(.+)$/.exec(cpVille);
    const codePostal = m ? m[1] : '', commune = m ? m[2] : cpVille;
    const ligneVoie = [numero, typeVoie, nomVoie].filter(Boolean).join(' ') || lieuDit || v('adresse');
    if (!ligneVoie && !commune) return null;
    return {
      numero: numero || null, typeVoie: typeVoie || null, nomVoie: nomVoie || null, lieuDit: lieuDit || null,
      codePostal: codePostal || null, commune: commune || null,
      departement: /^\d{5}$/.test(codePostal) ? (codePostal.startsWith('97') ? codePostal.slice(0, 3) : codePostal.slice(0, 2)) : null,
      texte: [ligneVoie, [codePostal, commune].filter(Boolean).join(' ')].filter(Boolean).join(' ')
    };
  }

  // Pure : la fiche client (personne physique) → personne au format de l'export ZIP.
  // Pure : les adresses email d'un texte — une seule, ou plusieurs à la suite séparées par « ; » ou
  // « , » pour un envoi groupé (étude, 02/10). Adresses mal formées écartées, doublons retirés.
  function emailsDepuisTexte(texte) {
    const liste = [];
    String(texte || '').split(/[;,\s]+/).map(e => e.trim().replace(/^<|>$/g, '')).forEach(e => {
      if (/^[^@\s;,<>]+@[^@\s;,<>]+\.[^@\s;,<>]+$/.test(e) && !liste.some(x => x.toLowerCase() === e.toLowerCase())) liste.push(e);
    });
    return liste;
  }

  // Pure : { date (AAAA-MM-JJ), lieu, pays } d'une fiche client dont la personne est décédée, sinon null.
  function decesFicheAuthentic(champs) {
    const date = dateIsoDepuisFr(valeurChampAuthentic(champs, (n, b) => /dateDeces/i.test(b)));
    if (!date) return null;
    return { date, lieu: valeurChampAuthentic(champs, n => n === 'cp, ville (deces)'), pays: valeurChampAuthentic(champs, n => n === 'pays (deces)') };
  }

  function clientDepuisFicheAuthentic(capture0) {
    // Fiche ouverte avec le volet du conjoint (étude 16/10) : la personne de la fiche seulement — le conjoint est lu à part.
    const partage = partagerFicheConjointAuthentic(capture0);
    const capture = partage ? partage.principale : capture0;
    const champs = (capture && capture.champs) || [];
    const nom = valeurChampAuthentic(champs, n => n === 'nom de famille');
    if (!nom) return societeDepuisFicheAuthentic(champs);
    const emails = [];
    champs.filter(c => libelleNetAuthentic(c.libelle) === 'email').forEach(c => {
      emailsDepuisTexte(c.valeur).forEach(e => { if (!emails.some(x => x.toLowerCase() === e.toLowerCase())) emails.push(e); });
    });
    const telephones = champs.filter(c => /inputTelephone/i.test(c.libelle || '')).map(c => String(c.valeur || '').trim()).filter(Boolean)
      .filter((x, i, l) => l.indexOf(x) === i);
    const nomUsage = valeurChampAuthentic(champs, n => n === "denomination d'usage" || n === 'denomination d’usage');
    return {
      // Le prénom aussi (étude 20/10, succession MARTINEAU : deux héritiers du même nom sans date de naissance avaient le même identifiant,
      // la fiche du second effaçait celle du premier — coordonnées perdues dans « Nouveau dossier »).
      id: 'authentic-' + normaliserPourRecherche(nom + ' ' + valeurChampAuthentic(champs, n => n === 'prenom')).replace(/[^a-z0-9]+/g, '') + '-' + dateIsoDepuisFr(valeurChampAuthentic(champs, (n, b) => /naissanceDate/.test(b))),
      index: 0,
      civilite: valeurChampAuthentic(champs, (n, b) => /:civilite:/.test(b)),
      nom: nom.toUpperCase(),
      prenom: valeurChampAuthentic(champs, n => n === 'prenom'),
      nomUsage: nomUsage && nomUsage.toUpperCase() !== nom.toUpperCase() ? nomUsage.toUpperCase() : '',
      autresPrenoms: valeurChampAuthentic(champs, n => /^autre\(s\) prenom/.test(n)),
      dateNaissance: dateIsoDepuisFr(valeurChampAuthentic(champs, (n, b) => /naissanceDate/.test(b))),
      lieuNaissance: valeurChampAuthentic(champs, n => n === 'cp, ville (naissance)'),
      adresse: adresseFicheAuthentic(champs),
      paysNaissance: valeurChampAuthentic(champs, n => n === 'pays (naissance)'),
      nationalite: valeurChampAuthentic(champs, n => n === 'nationalite'),
      // Défunt (étude 15/10 : « il ne faut pas se tromper dans la date de décès ») : la fiche de la personne décédée porte la date,
      // le lieu et le pays du décès ; une fiche sans date de décès n'est pas celle d'un défunt.
      deces: decesFicheAuthentic(champs),
      emails, telephones,
      profession: valeurChampAuthentic(champs, n => n === 'profession'),
      situationMatrimoniale: (capture && capture.situationConjoint) || situationMatrimonialeAuthentic(capture),
      complement: complementFicheClientAuthentic(capture), documents: []
    };
  }

  // Pure : vendeurs mariés ou pacsés dont le conjoint n'est pas partie à la vente → à vérifier (le
  // conjoint intervient si le bien, même propre, est la résidence de la famille).
  function alertesConjointAuthentic(parties) {
    const liste = parties || [];
    const noms = liste.map(p => normaliserPourRecherche(p.nom || '').replace(/[^a-z0-9]+/g, ' ').trim());
    return liste.filter(p => p.role === 'VENDEUR' && p.situationMatrimoniale && /mari|pacs|pacte civil/i.test(normaliserPourRecherche(p.situationMatrimoniale.situation || '')))
      .filter(p => {
        const conj = normaliserPourRecherche(p.situationMatrimoniale.conjoint || '').replace(/[^a-z0-9]+/g, ' ').trim();
        if (!conj) return true;
        const mots = conj.split(' ').filter(m => m.length > 1);
        return !noms.some(n => mots.length && mots.every(m => (' ' + n + ' ').includes(' ' + m + ' ')));
      })
      .map(p => ({
        partie: p.nom,
        texte: `${p.nom} : ${/pacs|pacte civil/i.test(normaliserPourRecherche(p.situationMatrimoniale.situation)) ? 'pacsé(e)' : 'marié(e)'}${p.situationMatrimoniale.conjoint ? `, conjoint ${p.situationMatrimoniale.conjoint}` : ''} non partie à la vente — le faire intervenir si le bien est la résidence de la famille (même bien propre).`
      }));
  }

  // ---- Informations du dossier relevées dans Authentic (étude, 02/10) ----
  // Lues d'après le vocabulaire des pages, jamais devinées : un renseignement absent reste absent.
  var RE_SAFER_PREEMPTION_EXERCEE = /pr[ée]empt(?:e|é|ée|ion\s+exerc[ée]e)|exerce\s+(?:son\s+)?droit/i;
  var RE_RHF_AUTHENTIC = /r[ée]quisition\s+(?:de\s+)?hors\s+formalit|(?:^|[^a-z])rhf(?:[^a-z]|$)|hors\s+formalit[ée]/i;

  // Pure : suivi de la notification SAFER — notifiée, prise en compte, décision.
  function suiviSaferAuthentic(lignes) {
    const lignesSafer = (lignes || []).filter(l => /safer/i.test(l.texte || ''));
    if (!lignesSafer.length) return null;
    // Colonnes de la ligne (étude, 02/10) : date de création, puis date d'ENVOI — celle qui fait partir
    // le délai. Une troisième date est le retour (prise en compte).
    const r = { creeeLe: '', envoyeeLe: '', notifieeLe: '', priseEnCompteLe: '', priseEnCompte: '', decision: '', decisionLe: '', titre: lignesSafer[0].titre };
    lignesSafer.forEach(l => {
      const texte = normaliserPourRecherche(l.texte || '');
      if (/pris(?:e)?\s+en\s+compte/.test(texte)) r.priseEnCompte = 'oui';
      const dates = l.dates || (l.date ? [l.date] : []);
      // Ligne de RÉPONSE à deux dates (étude 14/10 : « envoyé le 10/08 et réponse de non-préemption reçue le 13/10 ») : envoi puis
      // réponse, pas création puis envoi — le délai part de la première.
      const reponseDeuxDates = dates.length === 2 && (RE_SAFER_NON_PREEMPTION.test(texte) || RE_SAFER_PREEMPTION_EXERCEE.test(texte));
      if (!r.envoyeeLe && dates.length) {
        if (reponseDeuxDates) r.envoyeeLe = dates[0];
        else {
          if (dates.length >= 2) r.creeeLe = dates[0];
          r.envoyeeLe = dates.length >= 2 ? dates[1] : dates[0];
        }
        r.notifieeLe = r.envoyeeLe;
      }
      const mPec = /(?:pris(?:e)?\s+en\s+compte|retour)\s*(?:le)?\D{0,6}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/.exec(texte);
      if (mPec) r.priseEnCompteLe = dateIsoDepuisFr(mPec[1]);
      else if (!r.priseEnCompteLe && dates[2]) r.priseEnCompteLe = dates[2];
      // L'état (« Pris en compte », « Non préemption SAFER ») suit les dates sans date propre : la date
      // de la décision n'est connue que sur une ligne de réponse à une seule date, ou en 3e date.
      const dateDecision = dates.length === 1 ? dates[0] : (reponseDeuxDates ? dates[1] : (dates[2] || ''));
      if (RE_SAFER_NON_PREEMPTION.test(texte)) { r.decision = 'non_preemption'; r.decisionLe = dateDecision || r.decisionLe; }
      else if (!r.decision && RE_SAFER_PREEMPTION_EXERCEE.test(texte)) { r.decision = 'preemption'; r.decisionLe = dateDecision; }
    });
    return r;
  }

  // Pure (modifie le dossier passé) : SAFER sans réponse au-delà de son délai → non-préemption tacite,
  // « Réponse SAFER » cochée, une seule fois. → true si le dossier a changé.
  function appliquerSaferTacite(d, aujourdhui, maintenantIso) {
    const sa = d && d.authentic && d.authentic.safer;
    if (!sa || sa.decision) return false;
    const echeance = echeanceSaferTacite(sa);
    if (!echeance || !(aujourdhui > echeance)) return false;
    sa.decision = 'non_preemption';
    sa.decisionLe = echeance;
    sa.tacite = 'oui';
    const maintenant = maintenantIso || new Date().toISOString();
    if (d.roleNotaire !== 'participant') {
      const piece = checklistPieces(d.typeVente, d).find(p => p.personnalisee && /safer/i.test(p.label));
      const cle = piece ? piece.cle : 'perso-safer';
      if (!piece) d.piecesPersonnalisees = (d.piecesPersonnalisees || []).concat({ cle, label: 'Réponse SAFER' });
      d.pieces = d.pieces || {};
      if (d.pieces[cle] !== 'recue') sa.pieceCocheeTacite = 'oui';
      d.pieces[cle] = 'recue';
      d.piecesAuthentic = Array.from(new Set([...(d.piecesAuthentic || []), cle]));
      d.piecesTrouveesLe = Object.assign({}, d.piecesTrouveesLe, { [cle]: echeance + 'T12:00:00' });
    }
    d.historique = d.historique || [];
    d.historique.push({ date: maintenant, texte: `SAFER : délai écoulé le ${formatDateFr(echeance)} sans réponse (${DELAIS_SAFER[delaiSafer(sa)].libelle}) — non-préemption` });
    return true;
  }

  // Pure (modifie le dossier) : délai coché sous « Réponse SAFER » ('normal', 'rapide', 'tres_rapide').
  // Une non-préemption tirée du délai est recalculée : défaite si le nouveau délai court encore
  // (pièce rendue manquante si c'est le délai qui l'avait cochée), posée s'il est écoulé.
  // → true si quelque chose a changé.
  function changerDelaiSaferDossier(d, delai, aujourdhui, maintenantIso) {
    const sa = d && d.authentic && d.authentic.safer;
    if (!sa || !DELAIS_SAFER[delai]) return false;
    const avant = delaiSafer(sa);
    if (delai === 'normal') delete sa.delaiManuel; else sa.delaiManuel = delai;
    if (avant === delai) return false;
    const maintenant = maintenantIso || new Date().toISOString();
    d.historique = d.historique || [];
    d.historique.push({ date: maintenant, texte: `SAFER : délai de réponse ${DELAIS_SAFER[delai].libelle}` });
    if (sa.tacite && sa.decision === 'non_preemption') {
      const echeance = echeanceSaferTacite(sa);
      if (echeance && !(aujourdhui > echeance)) {
        sa.decision = ''; sa.decisionLe = ''; delete sa.tacite;
        if (sa.pieceCocheeTacite) {
          const piece = (d.piecesPersonnalisees || []).find(p => p && /safer/i.test(p.label || ''));
          if (piece && d.pieces) d.pieces[piece.cle] = 'manquante';
          delete sa.pieceCocheeTacite;
        }
        d.historique.push({ date: maintenant, texte: `SAFER : délai pas encore écoulé (jusqu’au ${formatDateFr(echeance)}) — non-préemption retirée` });
      } else if (echeance) sa.decisionLe = echeance;
    }
    appliquerSaferTacite(d, aujourdhui, maintenant);
    return true;
  }

  async function changerDelaiSafer(id, delai, coche) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    // La pièce reste à l'écran même cochée par le délai (sinon repliée parmi les reçues).
    piecesToutesVisibles = true;
    if (!changerDelaiSaferDossier(d, coche ? delai : 'normal', isoAujourdhuiLocal())) { render(); return; }
    await sauvegarder(d);
    render();
  }

  // Les deux cases sous « Réponse SAFER » (onglet Pièces) : 2 mois si aucune n'est cochée.
  function renderDelaiSafer(d) {
    const sa = d && d.authentic && d.authentic.safer;
    if (!sa || sa.decision === 'preemption' || (sa.decision === 'non_preemption' && !sa.tacite)) return '';
    const actuel = delaiSafer(sa);
    const caseDelai = (cle, libelle) => `<label class="safer-delai-case"><input type="checkbox" id="safer-${cle}-${d.id}" ${actuel === cle ? 'checked' : ''} onchange="changerDelaiSafer('${escapeOnclickArg(d.id)}', '${cle}', this.checked)"> ${libelle}</label>`;
    return `<span class="safer-delai">${caseDelai('rapide', 'Réponse rapide (1 mois)')}${caseDelai('tres_rapide', 'Très rapide (8 jours)')}</span>`;
  }

  // Pure : la date d'envoi d'une ligne de document d'Authentic. Une ligne porte la date de création
  // puis la date d'envoi, puis l'état (étude, 02/10, vu sur la SAFER, « pareil » pour les autres) :
  // la 2e date quand il y en a deux, la seule sinon.
  function dateEnvoiLigneAuthentic(l) {
    const dates = (l && l.dates) || (l && l.date ? [l.date] : []);
    return dates.length >= 2 ? dates[1] : (dates[0] || '');
  }

  // Pure : réquisition hors formalité — envoyée (2e date de la ligne), retour (« retour le … », ligne
  // de réponse, ou 3e date).
  function suiviRhfAuthentic(lignes) {
    const lignesRhf = (lignes || []).filter(l => RE_RHF_AUTHENTIC.test(normaliserPourRecherche(l.texte || '')));
    if (!lignesRhf.length) return null;
    const r = { envoyeeLe: '', retourLe: '' };
    lignesRhf.forEach(l => {
      const dates = l.dates || (l.date ? [l.date] : []);
      const etat = normaliserPourRecherche(l.etat || '');
      const estRetour = /re[cç]u|retour|delivr|repon|termin/.test(etat) || /^(?:reponse|retour|etat hypothecaire)/.test(normaliserPourRecherche(l.titre));  // « Terminé » : réponse du SPF (wiki, 28/10)
      if (!r.envoyeeLe && !estRetour) r.envoyeeLe = dateEnvoiLigneAuthentic(l);
      const mRetour = /retour\s*(?:le)?\D{0,6}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/.exec(normaliserPourRecherche(l.texte || ''));
      if (mRetour) r.retourLe = dateIsoDepuisFr(mRetour[1]);
      else if (estRetour) r.retourLe = dates[dates.length - 1] || r.retourLe;
      else if (dates[2]) r.retourLe = dates[2];
    });
    if (!r.envoyeeLe) lignesRhf.forEach(l => { if (!r.envoyeeLe) r.envoyeeLe = dateEnvoiLigneAuthentic(l); });
    return r;
  }

  // Pure : état de l'acte de vente dans Authentic — 'signe' (avec date), 'redaction', 'a_rediger'.
  // Acte signé (étude, 03/10 : « il ne doit pas y avoir d'autres mots avant signé, la forme exacte est
  // "Signé le 03/10/2026" ; "Mail version signée le 28/07/2026" : pas bon ») : l'ÉTAT d'une ligne de
  // document, un champ ou une ligne du texte qui COMMENCE par « Signé le JJ/MM/AAAA » (ou « Signé
  // électroniquement le … ») — jamais un titre qui contient « signé », jamais une ligne d'un autre document
  // (avant-contrat, procuration, mandat, offre, courrier…).
  var RE_AUTRE_DOCUMENT_SIGNE_AUTHENTIC = /compromis|promesse|avant[\s-]*contrat|procuration|mandat|offre|bon\s+de\s+visite|courrier|lettre|demande|attestation|convention|pouvoir|avenant|reconnaissance/i;
  var RE_SIGNE_LE_AUTHENTIC = /^sign[ée]e?\s+(?:[ée]lectroniquement\s+)?le\s+(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})(?![\/.\d])/i;
  function etatActeAuthentic(capture) {
    const c = capture || {};
    // { etat: ce qui doit commencer par « Signé le », contexte: ce qui écarte un autre document }
    const sources = [];
    lignesDocumentsAuthentic(c).forEach(l => sources.push({ etat: l.etat || '', contexte: l.titre || '' }));
    (c.champs || []).forEach(ch => sources.push({ etat: String(ch.valeur || ''), contexte: [ch.groupe, ch.libelle].filter(Boolean).join(' ') }));
    String(c.texte || '').split(/\n+/).forEach(l => sources.push({ etat: l, contexte: l }));
    const lignes = sources.map(x => ({ etat: String(x.etat || '').replace(/\s+/g, ' ').trim(), contexte: String(x.contexte || '').replace(/\s+/g, ' ').trim() })).filter(x => x.etat);
    for (const l of lignes) {
      if (RE_AUTRE_DOCUMENT_SIGNE_AUTHENTIC.test(l.contexte)) continue;
      const m = RE_SIGNE_LE_AUTHENTIC.exec(l.etat);
      if (m) return { etat: 'signe', libelle: 'Acte signé', date: dateIsoDepuisFr(m[1]) };
    }
    // Tableau « Rédaction » de la page du sous-dossier (étude 07/10) : « Non rédigé », puis « En cours » quand l'acte commence à être
    // rédigé, puis « Signé le … » — l'état seul (« En cours ») n'est lu que dans ce tableau, ailleurs il ne dit rien de l'acte.
    const redaction = etatTableauRedactionAuthentic(c);
    if (redaction) return redaction;
    const tout = lignes.map(l => l.etat).join('\n');
    if (/en\s+cours\s+de\s+r[ée]daction|r[ée]daction\s+en\s+cours/i.test(tout)) return { etat: 'redaction', libelle: 'En cours de rédaction', date: '' };
    if (/(?:non|pas\s+encore)\s+r[ée]dig[ée]|[àa]\s+r[ée]diger/i.test(tout)) return { etat: 'a_rediger', libelle: 'Pas encore rédigé', date: '' };
    return null;
  }

  // Pure : état de l'acte lu dans le tableau « Rédaction » (titre du tableau, ou son en-tête) — la ligne de l'acte de vente (jamais un
  // avant-contrat, une procuration, un courrier…), son état dans la dernière cellule qui n'est pas une date. « En cours » l'emporte
  // sur « Non rédigé » (une autre ligne peut rester non rédigée) ; null si le tableau n'est pas sur la page.
  function etatTableauRedactionAuthentic(capture) {
    let etat = null;
    ((capture && capture.tableaux) || []).forEach(t => {
      const titre = [t.titre, ...(t.entete || [])].join(' ');
      if (!/r[ée]daction/i.test(titre)) return;
      (t.lignes || []).forEach(l => {
        const cellules = (l || []).map(x => String(x == null ? '' : x).replace(/\s+/g, ' ').trim()).filter(x => x && !/^⟦icône⟧/.test(x));
        const textes = cellules.filter(x => !/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(x));
        if (!textes.length || RE_AUTRE_DOCUMENT_SIGNE_AUTHENTIC.test(textes[0])) return;
        const e = textes[textes.length - 1];
        if (/^en\s+cours/i.test(e)) etat = { etat: 'redaction', libelle: 'En cours de rédaction', date: '' };
        else if (/^(?:non|pas\s+encore)\s+r[ée]dig/i.test(e) && !etat) etat = { etat: 'a_rediger', libelle: 'Pas encore rédigé', date: '' };
      });
    });
    return etat;
  }

  // Pure : le prix de vente — champ « Capital » (Informations financières).
  function prixAuthentic(capture) {
    const c = capture || {};
    const champ = (c.champs || []).find(ch => /^capital/.test(libelleNetAuthentic(ch.libelle)) && String(ch.valeur || '').trim());
    let brut = champ ? champ.valeur : '';
    if (!brut) (c.tableaux || []).forEach(t => {
      const i = (t.entete || []).map(libelleNetAuthentic).findIndex(e => /^capital/.test(e));
      if (i >= 0 && !brut) brut = ((t.lignes || [])[0] || [])[i] || '';
    });
    if (!brut) {
      // Rubrique en texte seul (« Capital » puis le montant, sur la même ligne ou la suivante).
      const m = /(?:^|\n)\s*Capital\s*:?\s*(?:\n\s*)?(-?\d[\d\s.  ]*(?:,\d{1,2})?)\s*(?:€|EUR|euros?)?/i.exec(String(c.texte || ''));
      if (m) brut = m[1];
    }
    const v = brut ? eurosDepuisSaisie(String(brut)) : null;
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  // Textes de la rubrique « Parties prenantes » : champs et lignes dont la rubrique ou le tableau
  // s'appelle ainsi (ou « Intervenants »).
  function textesPartiesPrenantesAuthentic(capture) {
    const c = capture || {};
    const re = /parties?\s+prenantes?|intervenants?/i;
    const textes = [];
    (c.champs || []).filter(ch => re.test(ch.groupe || '')).forEach(ch => textes.push([ch.libelle, ch.valeur].filter(Boolean).join(' : ')));
    (c.tableaux || []).filter(t => re.test(t.titre || '')).forEach(t => (t.lignes || []).forEach(l => textes.push(l.filter(Boolean).join(' · '))));
    // Rubrique en texte seul : les lignes qui suivent son titre, jusqu'à la rubrique suivante.
    const texte = String(c.texte || '');
    const m = /(?:^|\n)\s*(?:parties?\s+prenantes?|intervenants?)\s*(?:\(\d+\))?\s*\n/i.exec(texte);
    if (m) {
      const suite = texte.slice(m.index + m[0].length, m.index + m[0].length + 1200);
      const fin = /\n\s*(?:informations\s+financi|comparants|immeubles|documents|pi[eè]ces|notes|historique)/i.exec(suite);
      (fin ? suite.slice(0, fin.index) : suite).split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).forEach(l => textes.push(l));
    }
    return textes;
  }

  // Pure : le collaborateur en charge — l'un des responsables de CLAIRE nommé dans les parties prenantes.
  function collaborateurAuthentic(capture) {
    const textes = textesPartiesPrenantesAuthentic(capture).map(t => ' ' + normaliserPourRecherche(t).replace(/[^a-z0-9]+/g, ' ') + ' ');
    // La notaire (Sophie GOSSART) n'est jamais le « collaborateur en charge » : son nom est celui de l'office, cité partout dans
    // Authentic — l'inclure ferait toujours deux correspondances (étude 26/10, compte administrateur de Sophie).
    const trouves = RESPONSABLES.filter(r => r !== 'Sophie GOSSART').filter(r => {
      const nom = normaliserPourRecherche(r.split(/\s+/).slice(1).join(' ')).replace(/[^a-z0-9]+/g, ' ').trim();
      return nom && textes.some(t => t.includes(' ' + nom + ' '));
    });
    return trouves.length === 1 ? trouves[0] : '';
  }

  // Pure : date de signature de l'avant-contrat d'après la page du dossier — une ligne « compromis »,
  // « promesse » ou « avant-contrat » qui dit « signé le … », ou marquée signée avec une seule date.
  // Jamais une demande, un envoi ni un projet.
  function dateAvantContratAuthentic(lignes) {
    for (const l of lignes || []) {
      const t = normaliserPourRecherche([l.titre, l.etat, l.texte].filter(Boolean).join(' '));
      if (!/compromis|promesse|avant[\s-]*contrat/.test(normaliserPourRecherche(l.titre || ''))) continue;
      if (/projet|demande|envoi|envoye|brouillon|annul/.test(t)) continue;
      const m = /sign[a-z]*\s+(?:electroniquement\s+)?le\s+(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/.exec(t);
      if (m) return dateIsoDepuisFr(m[1]);
      const dates = l.dates || [];
      if (/sign/.test(normaliserPourRecherche(l.etat || '')) && dates.length === 1) return dates[0];
    }
    return '';
  }

  // Pure : tout ce qu'une page du dossier dit du dossier (hors fiches client et bien).
  function infosDossierAuthentic(capture, typeAffaire) {
    const lignes = lignesDocumentsAuthentic(capture);
    const r = {
      acte: etatActeAuthentic(capture), rhf: suiviRhfAuthentic(lignes), safer: suiviSaferAuthentic(lignes),
      prix: prixAuthentic(capture), collaborateur: collaborateurAuthentic(capture),
      etatsCivils: suiviEtatsCivilsAuthentic(lignes, typeAffaire), demandes: demandesUrbanismeAuthentic(lignes),
      avantContratLe: dateAvantContratAuthentic(lignes), comparants: comparantsAuthentic(capture),
      premierComparant: premierComparantAuthentic(capture), premierImmeuble: premierImmeubleAuthentic(capture),
      biensDossier: biensRubriqueAuthentic(capture)
    };
    Object.keys(r).forEach(k => { if (!r[k] || (typeof r[k] === 'object' && !Object.keys(r[k]).length)) delete r[k]; });
    return r;
  }

  // Pure : les informations déjà connues complétées par une nouvelle page (une page sans le
  // renseignement n'efface rien).
  function fusionnerInfosAuthentic(ancien, nouveau) {
    const r = Object.assign({}, ancien || {});
    Object.entries(nouveau || {}).forEach(([k, v]) => {
      if ((k === 'premierComparant' || k === 'biensDossier') && v) r[k] = v; // remplacé en entier : le lien d'une ancienne page ne reste pas collé
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const base = Object.assign({}, r[k] || {});
        Object.entries(v).forEach(([kk, vv]) => { if (vv) base[kk] = vv; });
        r[k] = base;
      } else if (v) r[k] = v;
    });
    return r;
  }

  // Pure : un nombre écrit dans Authentic (« 99 999 », « 85,50 », « 1 250 ») → nombre, ou null.
  function nombreAuthentic(texte) {
    const t = String(texte == null ? '' : texte).replace(/\s|\u00a0/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    return Number(t);
  }

  // Pure : les lots d'une fiche bien en copropriété (onglet « Lots » d'Authentic, structure reçue le 06/10) : le tableau des
  // lots (N°, Type, Bâtiment, Étage, Entrée, Tantièmes lot — en-têtes pollués par « Filter by … »), le total des tantièmes de
  // l'immeuble, et le détail du lot sélectionné (désignation, surfaces, étage). → { lots: [{ numero, type, designation, batiment,
  // etage, entree, tantiemes, surface, surfaceCarrez }], tantiemesTotal }. Jamais deviné : un lot sans numéro n'est pas gardé.
  function lotsFicheAuthentic(capture) {
    const c = capture || {};
    const champs = c.champs || [];
    const lots = [];
    const texte = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    let tantiemesTotal = null;
    (c.tableaux || []).forEach(t => {
      const entete = (t.entete || []).map(e => libelleNetAuthentic(String(e || '').replace(/filter by.*$/i, '')));
      const iTant = entete.findIndex(e => /^tantiemes? lot/.test(e));
      if (iTant < 0) return;
      const iNum = entete.findIndex(e => /^(n°|no\b|numero)/.test(e) && !/ancien/.test(e));
      const iType = entete.findIndex(e => /^type/.test(e));
      const iBat = entete.findIndex(e => /^batiment/.test(e));
      const iEtage = entete.findIndex(e => /^etage/.test(e));
      const iEntree = entete.findIndex(e => /^entree/.test(e));
      (t.lignes || []).forEach(l => {
        const cellules = (l || []).map(texte);
        // Ligne de total (« Total Tantièmes immeuble | 99 999 ») : le total, pas un lot.
        const iTotal = cellules.findIndex(x => /tantiemes? immeuble|total/i.test(normaliserPourRecherche(x)));
        if (iTotal >= 0) { const n = cellules.slice(iTotal + 1).map(nombreAuthentic).find(x => x !== null); if (n !== null && n !== undefined) tantiemesTotal = n; return; }
        const numero = iNum >= 0 ? cellules[iNum] : '';
        if (!/^\d+$/.test(numero)) return;
        if (lots.some(x => x.numero === numero)) return;
        lots.push({
          numero, type: (iType >= 0 && cellules[iType]) || null, batiment: (iBat >= 0 && cellules[iBat]) || null,
          etage: (iEtage >= 0 && cellules[iEtage]) || null, entree: (iEntree >= 0 && cellules[iEntree]) || null,
          tantiemes: nombreAuthentic(cellules[iTant]), designation: null, surface: null, surfaceCarrez: null
        });
      });
    });
    // Détail du lot ouvert (volet « Informations générales » du lot).
    const v = (test) => valeurChampAuthentic(champs, test);
    const numDetail = v(n => /^(n°|no) de lot$/.test(n));
    // Le « N° de lot » d'un LOTISSEMENT n'est pas un lot de copropriété (étude 19/10) : seul le volet d'un lot de copropriété compte.
    const voletCopro = champs.some(ch => /lotDetailsComponent/i.test(ch.libelle || '')) || v(n => /^tantiemes? lot$/.test(n));
    if (/^\d+$/.test(numDetail) && voletCopro) {
      let lot = lots.find(x => x.numero === numDetail);
      if (!lot) { lot = { numero: numDetail, type: null, batiment: null, etage: null, entree: null, tantiemes: null, designation: null, surface: null, surfaceCarrez: null }; lots.push(lot); }
      const typeDetail = v((n, b) => /lotDetailsComponent.*:type:selectonemenu_input/i.test(b));
      if (typeDetail) lot.type = typeDetail;
      const designation = v(n => n === 'designation');
      if (designation) lot.designation = designation;
      const tant = nombreAuthentic(v(n => /^tantiemes? lot$/.test(n)));
      if (tant !== null) lot.tantiemes = tant;
      const etage = v(n => n === 'etage');
      if (etage) lot.etage = etage;
      const surface = nombreAuthentic(v(n => /^surface m/.test(n) && !/carrez/.test(n)));
      if (surface !== null) lot.surface = surface;
      const carrez = nombreAuthentic(v(n => /^surface carrez/.test(n)));
      if (carrez !== null) lot.surfaceCarrez = carrez;
    }
    const total = nombreAuthentic(v(n => /^total tantiemes? immeuble/.test(n)));
    if (total !== null) tantiemesTotal = total;
    return { lots, tantiemesTotal };
  }

  // Parcelle de terre ou de bois (structure reçue le 12/10) : « Type de bien » (un mot), « Désignation » (« … parcelle de bois »),
  // lieu-dit, et le tableau du cadastre — Nature (souvent vide), Zone urbanisme, SPF, surface (h / a / ca). Natures du cadastre :
  // T terres, P prés, PA pâtures, PP prés plantés, B bois, BT taillis, BF/BR/BM futaies, BP peupleraies, L landes, LB landes
  // boisées, VI vignes, VE vergers, CH chemins, E eaux, J jardins — S (sol) et AB (à bâtir) ne sont pas ruraux.
  // Relecture 0.221.0 : jamais un mot pris au hasard dans une désignation (« près du bourg », « parterre », « parquet en bois »,
  // « rue des Prés », « chemin des Bois », « hangar agricole ») — des mots entiers et des tournures explicites seulement.
  var CODES_NATURE_BOIS = /^(b|bt|bf|br|bm|bp|bs|lb)$/;
  var CODES_NATURE_RURALE = /^(t|p|pa|pp|pe|b|bt|bf|br|bm|bp|bs|l|lb|vi|ve|vt)$/;
  var RE_MOT_BOIS = /(?<![a-z])(bois|forets?|taillis|futaies?|peupleraies?)(?![a-z])/;
  var RE_MOT_RURAL = /(?<![a-z])(bois|forets?|taillis|futaies?|peupleraies?|terres?|pres?|prairies?|patures?|landes?|vignes?|vergers?|friches?)(?![a-z])/;
  var RE_TYPE_BATI = /maison|pavillon|villa|immeuble|batiment|local|hangar|grange|garage|appartement|commerce|bureau|chalet|longere|ferme/;
  var MOTS_RURAUX = 'bois|forets?|taillis|futaies?|peupleraies?|terres?|pres?|prairies?|patures?|landes?|vignes?|vergers?|friches?';
  // « parcelle(s) de bois », « terrain en nature de pré », « terres agricoles », « bois et forêts », ou la désignation qui COMMENCE
  // par le mot (« Bois taillis », « Une terre », « Des prés »).
  var RE_DESIGNATION_RURALE = new RegExp('(?<![a-z])(?:(?:parcelles?|terrains?|ensemble)\\s+(?:de|en|a usage de)\\s+(?:nature\\s+de\\s+)?(?:' + MOTS_RURAUX + ')|terres?\\s+(?:agricoles?|labourables?|de culture)|bois\\s+(?:et\\s+forets?|taillis))(?![a-z])|^(?:(?:un|une|des|les|la|le)\\s+)?(?:' + MOTS_RURAUX + ')(?![a-z])');
  var RE_DESIGNATION_BOIS = /(?<![a-z])(?:(?:parcelles?|terrains?|ensemble)\s+(?:de|en)\s+(?:nature\s+de\s+)?(?:bois|forets?|taillis|futaies?)|bois\s+(?:et\s+forets?|taillis))(?![a-z])|^(?:(?:un|une|des|les|la|le)\s+)?(?:bois|forets?|taillis|futaies?)(?![a-z])/;

  // Pure : la nature d'une parcelle (code du cadastre ou mot entier) dit-elle un bois ?
  function natureParcelleBois(nature) {
    const n = normaliserPourRecherche(String(nature || '')).trim();
    return CODES_NATURE_BOIS.test(n) || RE_MOT_BOIS.test(n);
  }

  // Pure : les parcelles sont-elles TOUTES en nature de bois (question de l'analyse de préemption) ? true quand chacune a sa
  // nature et que toutes sont des bois ; false dès qu'une nature connue n'en est pas un ; null sinon.
  function boisDesParcelles(parcelles) {
    const liste = (parcelles || []).filter(Boolean);
    const natures = liste.map(p => p.nature).filter(Boolean);
    if (natures.some(n => !natureParcelleBois(n))) return false;
    return liste.length && natures.length === liste.length ? true : null;
  }

  // Pure : le type de vente d'une fiche bien. `typeBrut` et `designation` normalisés ; `parcelles` avec leur nature.
  // La désignation ne compte que si le type est vide ou « terrain » ; la nature du cadastre seule, que si le type est vide (un
  // terrain à bâtir reste souvent cadastré en terre tant qu'il n'est pas construit).
  function typeVenteFicheBienAuthentic(typeBrut, designation, parcelles, avecLots) {
    if (/maison|pavillon|villa/.test(typeBrut)) return 'maison';
    if (/appartement|copropri/.test(typeBrut) || (/(?<![a-z])lot(?![a-z])/.test(typeBrut) && !/lotissement/.test(typeBrut + ' ' + designation)) || avecLots) return 'copropriete';
    if (RE_TYPE_BATI.test(typeBrut)) return null;
    const terrain = /terrain/.test(typeBrut);
    if (/a batir|constructible|lotissement|viabilis/.test(typeBrut + ' ' + designation)) return terrain ? 'terrain' : null;
    if (!terrain && RE_MOT_RURAL.test(typeBrut)) return 'terre';
    if ((!typeBrut || terrain) && RE_DESIGNATION_RURALE.test(designation)) return 'terre';
    const liste = (parcelles || []).filter(Boolean);
    if (!typeBrut && liste.length && liste.every(p => p.nature && CODES_NATURE_RURALE.test(normaliserPourRecherche(p.nature).trim()))) return 'terre';
    return terrain ? 'terrain' : null;
  }

  // Pure : « parcelles en bois » d'une fiche bien de terre : les natures d'abord (toutes en bois / une qui n'en est pas) ; à
  // défaut, le type (« Bois ») ou la désignation (« parcelle de bois ») pour un bien d'une seule parcelle. Jamais hors « terre ».
  function boisFicheBienAuthentic(type, typeBrut, designation, parcelles) {
    if (type !== 'terre') return null;
    const parNature = boisDesParcelles(parcelles);
    if (parNature !== null) return parNature;
    if ((parcelles || []).length <= 1 && (RE_MOT_BOIS.test(typeBrut) || RE_DESIGNATION_BOIS.test(designation))) return true;
    return null;
  }

  // Pure : la fiche bien → immeuble au format de l'export ZIP (type, adresse, parcelles du cadastre, lots d'une copropriété).
  // Copropriété (structure reçue le 06/10) : l'onglet « Informations du bien » porte le cadastre sous « Parcelle Assise
  // volumétrique » (mêmes colonnes Section / Numéro) ; l'onglet « Lots » n'a ni adresse ni cadastre, seulement les lots.
  function bienDepuisFicheAuthentic(capture) {
    const c = capture || {};
    const champs = c.champs || [];
    const champsBien = champs.filter(ch => /informations du bien/i.test(ch.groupe || ''));
    const adresse = adresseFicheAuthentic(champsBien.length ? champsBien : champs);
    const typeBrut = normaliserPourRecherche(valeurChampAuthentic(champs, (n, b) => /typeWithDialog/i.test(b)));
    const { lots, tantiemesTotal } = lotsFicheAuthentic(c);
    const designation = valeurChampAuthentic(champs, n => n === 'designation');
    const parcelles = [];
    (c.tableaux || []).forEach(t => {
      if (/ancien cadastre/i.test(t.titre || '')) return; // étude 22/10 : jamais les parcelles du tableau « Ancien cadastre »
      const entete = (t.entete || []).map(libelleNetAuthentic);
      const iSection = entete.indexOf('section');
      const iNumero = entete.findIndex(e => /^num/.test(e));
      if (iSection < 0 || iNumero < 0) return;
      const iNature = entete.indexOf('nature');
      const iSurface = entete.findIndex(e => /^(surface|superficie|contenance)/.test(e));
      const iLieu = entete.findIndex(e => /lieu-dit|lieu dit/.test(e));
      const iCommune = entete.indexOf('commune');
      const iPrefixe = entete.findIndex(e => /^pr[ée]fixe/.test(e) || /^prefixe/.test(e));
      const iZone = entete.findIndex(e => /^zone/.test(e));
      const iSpf = entete.findIndex(e => /^spf\b|service de (la )?publicit/.test(e));
      const cellule = (l, i) => (i >= 0 ? String(l[i] == null ? '' : l[i]).replace(/\s+/g, ' ').trim() : '');
      (t.lignes || []).forEach(l => {
        const section = String(l[iSection] || '').trim().toUpperCase();
        const numero = String(l[iNumero] || '').trim().replace(/^0+(?=\d)/, '');
        if (!section || !numero || parcelles.some(p => p.section === section && p.numero === numero)) return;
        const p = { section, numero };
        if (cellule(l, iNature)) p.nature = cellule(l, iNature);
        { const s3 = surfaceLigneCadastreAuthentic(entete, l, iSurface); if (s3) p.surface = s3; }
        if (cellule(l, iLieu)) p.lieuDit = cellule(l, iLieu);
        // Commune et préfixe de la parcelle (étude 15/10 : toutes les parcelles, chacune à la bonne mairie).
        if (cellule(l, iCommune)) p.commune = cellule(l, iCommune);
        if (cellule(l, iPrefixe)) p.prefixe = cellule(l, iPrefixe);
        // Zone d'urbanisme et service de publicité foncière de la parcelle (« tout récupérer d'Authentic », étude 17/10).
        if (zoneParcelleAuthentic(cellule(l, iZone))) p.zone = zoneParcelleAuthentic(cellule(l, iZone));
        if (cellule(l, iSpf)) p.spf = cellule(l, iSpf);
        parcelles.push(p);
      });
    });
    const designationNorm = normaliserPourRecherche(designation || '').replace(/\s+/g, ' ').trim();
    // Cadastre saisi dans la fiche du bien (structure reçue le 16/10) : pas un tableau à en-têtes mais des champs par ligne
    // (« …dataTableCadastre:0:cadastreHorsVolumeNumero »), la surface dans les trois champs hectare / are / centiare qui suivent le SPF.
    parcellesChampsCadastreAuthentic(champs.filter(ch => !/ancien cadastre/i.test(ch.groupe || '') && !/ancien/i.test(ch.libelle || ''))).forEach(q => {
      const deja = parcelles.find(p => p.section === q.section && p.numero === q.numero);
      // Une surface du tableau nulle ou réduite aux hectares (« 0 ») cède la place aux trois champs hectare / are / centiare (19/10).
      if (deja) { ['surface', 'prefixe', 'nature', 'adresseCadastre'].forEach(k => { if ((detailParcelleVide(k, deja[k]) || (k === 'surface' && /^\d+$/.test(String(deja[k])))) && q[k]) deja[k] = q[k]; }); }
      else parcelles.push(q);
    });
    // Ancien cadastre (étude 26/10 : « ce sont les parcelles sans surface ») : le titre « Ancien cadastre » n'est pas une rubrique de la page
    // (le filtre par titre du 22/10 ne le voyait jamais) ; le cadastre en vigueur donne une surface à chaque parcelle.
    const enVigueur = parcellesSansAncienCadastre(parcelles);
    parcelles.length = 0;
    enVigueur.forEach(p => parcelles.push(p));
    const type = typeVenteFicheBienAuthentic(typeBrut, designationNorm, parcelles, lots.length > 0);
    // Parcelles en bois (préemption des bois et forêts, SAFER) : seulement pour une terre ; sinon inconnu.
    const bois = boisFicheBienAuthentic(type, typeBrut, designationNorm, parcelles);
    if (!adresse && !parcelles.length && !lots.length) return null;
    return {
      id: 'authentic-bien-' + normaliserPourRecherche((adresse && adresse.texte) || parcelles.map(p => p.section + p.numero).join('') || 'lots' + lots.map(l => l.numero).join('-')).replace(/[^a-z0-9]+/g, '').slice(0, 40),
      adresse, type, parcelles, lots, tantiemesTotal, surface: null, description: designation, bois, details: detailsFicheBienAuthentic(champsBien.length ? champsBien : champs)
    };
  }

  // Pure : une page « Lots » (ni adresse ni cadastre) complète le bien déjà relevé du même dossier plutôt que d'en faire un second.
  function fusionnerBienAuthentic(existant, nouveau) {
    if (!existant) return nouveau;
    const lots = (existant.lots || []).slice();
    (nouveau.lots || []).forEach(l => { const i = lots.findIndex(x => x.numero === l.numero); if (i < 0) lots.push(l); else lots[i] = Object.assign({}, lots[i], Object.fromEntries(Object.entries(l).filter(([, v]) => v !== null && v !== ''))); });
    return Object.assign({}, existant, {
      type: existant.type || nouveau.type, lots, tantiemesTotal: nouveau.tantiemesTotal != null ? nouveau.tantiemesTotal : (existant.tantiemesTotal != null ? existant.tantiemesTotal : null),
      parcelles: (existant.parcelles || []).concat((nouveau.parcelles || []).filter(p => !(existant.parcelles || []).some(q => q.section === p.section && q.numero === p.numero))),
      // Tout ce que dit chaque onglet de la fiche bien (17/10) : réunis par libellé, l'onglet vu en dernier l'emporte.
      details: Object.values(Object.fromEntries((existant.details || []).concat(nouveau.details || []).filter(x => x && x.libelle).map(x => [x.libelle, x]))).slice(0, 30)
    });
  }

  // Pure : les pages relevées (dans l'ordre où elles ont été vues) regroupées par dossier, au format
  // de l'export ZIP — une fiche client ou bien sans intitulé appartient au dernier dossier vu.
  // [{ intitule, export, derniere }] du plus récent au plus ancien.
  function dossiersDepuisRelevesAuthentic(releves, o) {
    const groupes = new Map();
    let courant = '';
    (releves || []).slice().sort((a, b) => String(a.recueLe || '').localeCompare(String(b.recueLe || ''))).forEach(r => {
      const cap = r && r.capture;
      if (!cap) return;
      const type = typePageAuthentic(cap);
      const intitule = intituleDossierAuthentic(cap) || (ongletActifAutreDossierAuthentic(cap, courant, (groupes.get(courant) || {}).reference) ? '' : courant);
      if (intituleDossierAuthentic(cap)) courant = intituleDossierAuthentic(cap);
      if (!intitule || (type === 'autre' && !intituleDossierAuthentic(cap))) return;
      // Fiche bien ouverte dans un onglet à elle (Authentic en ouvre une par fiche, 20/10) : gardée seulement si la rubrique « Immeubles » du
      // dossier la cite (filtre plus bas) — jamais d'office (recherche d'immeubles, 19/10).
      const horsOnglet = type === 'bien' && !intituleDossierAuthentic(cap) && ongletActifHorsDossierAuthentic(cap);
      const referencePage = intituleDossierAuthentic(cap) ? referenceDossierAuthentic(cap) : '';
      if (!groupes.has(intitule)) groupes.set(intitule, { intitule, derniere: '', personnes: new Map(), immeubles: new Map(), documents: new Map(), infos: {}, adresse: '', aCreer: false, releves: [] });
      const g = groupes.get(intitule);
      g.releves.push({ id: r.id, recueLe: r.recueLe, capture: cap });
      if (referencePage) g.reference = referencePage;
      // Page de vente en cours (ni signée, ni promesse/avenant) : le dossier est « à créer » s'il manque dans CLAIRE.
      if (intituleDossierAuthentic(cap)) g.aCreer = proposerCreationDossierAuthentic(cap, intitule);
      if (intituleDossierAuthentic(cap) && pageSuccessionAuthentic(cap, intitule)) g.succession = true;
      if (intituleDossierAuthentic(cap) && adresseBienPageAuthentic(cap)) g.adresse = adresseBienPageAuthentic(cap);
      g.derniere = r.recueLe || g.derniere;
      if (type === 'client') { const p = clientDepuisFicheAuthentic(cap); if (p) g.personnes.set(p.id, p); const pc = clientDepuisFicheAuthentic((partagerFicheConjointAuthentic(cap) || {}).conjoint); if (pc) (g.conjoints = g.conjoints || []).push(pc); }
      if (type === 'bien') {
        const b = bienDepuisFicheAuthentic(cap);
        if (b) {
          // Page « Lots » d'une copropriété : sans adresse ni cadastre, elle complète le dernier bien vu (06/10).
          const sansIdentite = !b.adresse && !b.parcelles.length && b.lots.length;
          const dernier = [...g.immeubles.values()].pop();
          if (sansIdentite && dernier) g.immeubles.set(dernier.id, fusionnerBienAuthentic(dernier, b));
          else if (g.immeubles.has(b.id)) g.immeubles.set(b.id, Object.assign(fusionnerBienAuthentic(g.immeubles.get(b.id), b), { horsOnglet: g.immeubles.get(b.id).horsOnglet && horsOnglet }));
          else g.immeubles.set(b.id, horsOnglet ? Object.assign({}, b, { horsOnglet: true }) : b);
        }
      }
      if (type === 'gestion') piecesRecuesAuthentic(lignesDocumentsAuthentic(cap), [], g.succession || /succ/i.test(intitule) ? 'succession' : 'vente')
        .forEach(p => g.documents.set(p.cle, { intitule: p.titre, nomFichier: '', chemin: '', date: p.date, personne: null, piece: p }));
      if (type === 'gestion' || type === 'autre') g.infos = fusionnerInfosAuthentic(g.infos, infosDossierAuthentic(cap));
      if (type === 'gestion' && o && o.apercu && !(g.succession || /succ/i.test(intitule))) g.apercu = apercuImmeubleAuthentic(cap) || g.apercu;
    });
    return fusionnerGroupesAuthentic([...groupes.values()]).map(g => {
      // Conjoint vu dans le volet d'une fiche : repris seulement s'il est comparant du dossier (jamais l'époux d'un bien propre).
      (g.conjoints || []).filter(pc => (conjointComparantAuthentic(g.infos, pc) || conjointSurvivantAuthentic(g, pc)) && ![...g.personnes.values()].some(p => p.nom === pc.nom && p.prenom === pc.prenom))
        .forEach(pc => g.personnes.set(pc.id + '-' + normaliserPourRecherche(pc.prenom || '').replace(/[^a-z0-9]+/g, ''), pc));
      const personnes = [...g.personnes.values()].map((p, i) => Object.assign({}, p, { index: i }));
      // Seulement les biens cités par la rubrique « Immeubles » de la page du dossier, quand elle est lue (étude 19/10).
      // Fiche ouverte dans un onglet à elle : seulement le bien de la page du dossier (même adresse, numéro compris), jamais par le code postal.
      const immeubles = avecApercuImmeubleAuthentic([...g.immeubles.values()].filter(im => im.horsOnglet
        ? !!g.adresse && adresseSureAuthentic(im.adresse, g.adresse)
        : g.succession || /succ/i.test(g.intitule) || bienDansRubriqueAuthentic(im.adresse, g.infos && g.infos.biensDossier) !== false).map(im => { const c = Object.assign({}, im); delete c.horsOnglet; return c; }), g.apercu);
      const adresseBien = g.adresse || (immeubles[0] && immeubles[0].adresse && immeubles[0].adresse.texte) || '';
      const sortie = {
        intitule: g.intitule, reference: g.reference || '', derniere: g.derniere, adresse: adresseBien, aCreer: !!g.aCreer,
        export: {
          intitule: g.intitule, reference: g.reference || '', type: g.succession ? 'succession' : '', dateCreation: '', personnes, immeubles, parties: [], intervenants: [],
          biens: immeubles.map(im => im.id), documents: [...g.documents.values()], documentsPersonnes: [], acte: null, notaireRedacteur: null,
          origine: 'pages', infosAuthentic: g.infos
        }
      };
      // Les pages du groupe, rejouées sur le dossier à sa création (non énumérables : jamais enregistrées avec l'export).
      Object.defineProperty(sortie.export, 'releves', { value: (g.releves || []).slice().sort((a, b) => String(a.recueLe || '').localeCompare(String(b.recueLe || ''))), enumerable: false });
      return sortie;
    }).sort((a, b) => String(b.derniere).localeCompare(String(a.derniere)));
  }

  // ---- Relevé automatique d'Authentic (étude, 02/10 : « automatique, à l'affichage ») ----
  // L'extension envoie chaque page d'Authentic affichée ; une fenêtre CLAIRE la prend (une seule) et
  // met à jour la fiche du dossier reconnu par l'intitulé : pièces reçues cochées « reçues dans
  // Authentic » (validées à la main, donc décochables et jamais repassées en manquantes par le NAS),
  // historique, notification. Une pièce déjà reprise une fois ne l'est plus (d.piecesAuthentic) : la
  // décocher reste la décision de l'étude. Jamais pour une participation (pièces suivies par le confrère).
  var INTERVALLE_RELEVES_AUTHENTIC_MS = 60 * 1000;
  let releveAuthenticEnCours = false;

  // Pure : ce qu'un relevé de la page de gestion change sur un dossier (pièces à cocher).
  function piecesAuthenticAAppliquer(d, capture) {
    if (!d || d.roleNotaire === 'participant') return [];
    const deja = new Set(d.piecesAuthentic || []);
    const retirees = new Set(d.piecesRetirees || []);
    return piecesRecuesAuthentic(lignesDocumentsAuthentic(capture), checklistPieces(d.typeVente, d), d.typeAffaire)
      .filter(p => !deja.has(p.cle) && !retirees.has(p.cle) && !(!p.nouvelle && d.pieces && d.pieces[p.cle] === 'recue'));
  }

  // Pure : le côté d'une personne d'une fiche client dans le dossier — d'après ses parties, sinon
  // d'après le nom du dossier « VENDEUR / ACQUÉREUR ». 'VENDEUR' | 'ACQUEREUR' | '' (jamais deviné).
  // Le nom de famille d'Authentic est le nom de NAISSANCE : une vendeuse mariée figure souvent au
  // dossier sous son nom d'usage (« Dénomination d'usage ») — essayé ensuite (étude, 02/10 : « ça ne
  // remonte pas côté vendeur »).
  function roleClientAuthenticDansDossier(d, personne) {
    if (!d || !personne || !personne.nom) return '';
    // Succession (étude 15/10) : pas de côté vendeur / acquéreur — la personne est une partie de la fiche, ou le défunt nommé par l'intitulé.
    if (estSuccession(d)) return partieSuccessionDeLaFiche(d, personne) ? 'PARTIE' : '';
    if (personne.morale) return roleSocieteAuthenticDansDossier(d, personne.nom);
    for (const nom of [personne.nom, personne.nomUsage].filter(Boolean)) {
      const role = roleClientAuthenticParNom(d, nom, personne.prenom);
      if (role) return role;
    }
    return roleConjointAuthenticDansDossier(d, personne);
  }

  // Pure : une personne mariée ou pacsée dont le nom n'est pas au dossier (« VTE CHAHUNEAU / … »,
  // Mme sous son propre nom) prend le côté de son conjoint quand celui-ci y est — nommé en entier
  // parmi les parties ou les fiches déjà reprises, sinon d'un seul côté du nom du dossier.
  function roleConjointAuthenticDansDossier(d, personne) {
    const sm = personne && personne.situationMatrimoniale;
    if (!sm || !sm.conjoint || !/mari|pacs|pacte civil/i.test(normaliserPourRecherche(sm.situation || 'marie'))) return '';
    const mots = (x) => normaliserPourRecherche(x || '').replace(/[^a-z0-9]+/g, ' ').trim();
    const contient = (texte, m) => (' ' + mots(texte) + ' ').includes(' ' + m + ' ');
    const conj = mots(sm.conjoint).split(' ').filter(m => m.length > 1 && !/^(m|mme|monsieur|madame|mr|mlle)$/.test(m));
    if (!conj.length) return '';
    const roles = new Set();
    [...(Array.isArray(d.parties) ? d.parties : []), ...((d.authentic && d.authentic.personnes) || [])].forEach(p => {
      if (p && (p.role === 'VENDEUR' || p.role === 'ACQUEREUR') && conj.every(m => contient(p.nom, m))) roles.add(p.role);
    });
    if (roles.size === 1) return [...roles][0];
    if (roles.size > 1) return '';
    const m = /^\s*(.+?)\s*\/\s*(.+?)\s*$/.exec(String(d.nom || ''));
    if (!m) return '';
    const v = conj.some(x => contient(m[1], x)), a = conj.some(x => contient(m[2], x));
    return v && !a ? 'VENDEUR' : a && !v ? 'ACQUEREUR' : '';
  }

  function roleClientAuthenticParNom(d, nomBrut, prenomBrut) {
    const mots = (x) => ' ' + normaliserPourRecherche(x || '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    const personne = { nom: nomBrut, prenom: prenomBrut };
    const nom = mots(personne.nom).trim();
    const prenom = mots(personne.prenom).trim().split(' ')[0] || '';
    const contient = (texte, m) => !!m && mots(texte).includes(' ' + m + ' ');
    const m = /^\s*(.+?)\s*\/\s*(.+?)\s*$/.exec(String(d.nom || ''));
    // Vendeur et acquéreur du même nom (« MARTIN / MARTIN », étude 07/10 : « les parties doivent partout être identifiées par
    // nom et prénom ») : le prénom est alors exigé, jamais le nom seul.
    const nomDesDeuxCotes = !!m && nom.split(' ').every(x => contient(m[1], x)) && nom.split(' ').every(x => contient(m[2], x));
    const roles = new Set();
    (Array.isArray(d.parties) ? d.parties : []).forEach(p => {
      // Le prénom peut être porté à part (`p.prenom`) ou dans le nom complet (« Marie ROY ») — banc Authentic du 19/10.
      if (p && contient(p.nom, nom) && (!prenom || contient([p.prenom, p.nom].join(' '), prenom) || (!nomDesDeuxCotes && !(d.parties || []).some(q => q !== p && contient(q.nom, nom))))) roles.add(p.role);
    });
    if (roles.size === 1) return [...roles][0];
    if (roles.size > 1) return '';
    if (!m) return '';
    const v = nom.split(' ').every(x => contient(m[1], x)), a = nom.split(' ').every(x => contient(m[2], x));
    return v && !a ? 'VENDEUR' : a && !v ? 'ACQUEREUR' : '';
  }

  // Pure (modifie le dossier passé) : téléphones et email d'une fiche client reportés sur le côté
  // `role` du dossier (s'ils manquent), situation matrimoniale gardée ; la fiche quitte « à rattacher ».
  // Pure : la clé d'une fiche client dans le registre du dossier (« prénom nom » sans accent ni ponctuation).
  function cleFicheClientAuthentic(personne) {
    return normaliserPourRecherche([personne && personne.prenom, personne && personne.nom].filter(Boolean).join(' ')).replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Modifie d : la fiche client d'Authentic est RETENUE telle quelle sur le dossier (d.authentic.fichesClients) — identité, naissance,
  // domicile, décès, situation matrimoniale. Authentic est la base des courriers de « Constitution de dossier » (étude 15/10) : rien
  // n'y est deviné ni repris d'un compromis. Une relecture de la même fiche remplace la précédente. → vrai si quelque chose a changé.
  function retenirFicheClientAuthentic(d, personne, maintenant, extra) {
    if (!d || !personne || !personne.nom) return false;
    const cle = cleFicheClientAuthentic(personne);
    if (!cle) return false;
    const adresse = personne.adresse || null;
    const fiche = {
      nom: [personne.prenom, personne.nom].filter(Boolean).join(' '), prenom: personne.prenom || '', autresPrenoms: personne.autresPrenoms || '',
      nomFamille: personne.nom, nomUsage: personne.nomUsage || '', civilite: civiliteDepuisTexte(personne.civilite) || '',
      dateNaissance: personne.dateNaissance || '', lieuNaissance: personne.lieuNaissance || '', paysNaissance: personne.paysNaissance || '',
      domicile: adresse && adresse.texte ? adresse.texte : '',
      adresse: adresse ? { codePostal: adresse.codePostal || '', commune: adresse.commune || '', departement: adresse.departement || '' } : null,
      deces: personne.deces || null, situationMatrimoniale: personne.situationMatrimoniale || null,
      // Tout l'état civil de la fiche (étude 15/10 : « stocker toutes les données d'état civil »).
      nationalite: personne.nationalite || '', profession: personne.profession || '',
      emails: (personne.emails || []).slice(0, 3), telephones: (personne.telephones || []).slice(0, 3), complement: personne.complement || null
    };
    if (extra && extra.horsComparants) fiche.horsComparants = true; // fiche gardée seule : jamais une partie (Clients et biens)
    // Société (20/10) : forme, SIREN, SIRET, capital et parts ; le siège est son domicile.
    if (personne.morale) Object.assign(fiche, { qualitePersonne: 'morale', forme: personne.forme || '', sigle: personne.sigle || '', siren: personne.siren || '',
      siret: personne.siret || '', capital: personne.capital || '', nombreParts: personne.nombreParts || '', montantNominal: personne.montantNominal || '' });
    const avant = d.authentic || {};
    const reg = Object.assign({}, avant.fichesClients || {});
    if (reg[cle] && JSON.stringify(Object.assign({}, reg[cle], { vuLe: '' })) === JSON.stringify(Object.assign({}, fiche, { vuLe: '' }))) return false;
    reg[cle] = Object.assign(fiche, { vuLe: maintenant || new Date().toISOString() });
    const cles = Object.keys(reg);
    if (cles.length > 24) delete reg[cles[0]];
    d.authentic = Object.assign({}, avant, { fichesClients: reg });
    return true;
  }

  // Modifie d : une fiche client lue sur un dossier de SUCCESSION — la personne est une partie (le défunt, nommé par l'intitulé, y entre
  // s'il n'y était pas) ; la fiche entière est retenue. Aucune qualité n'est devinée : le défunt se reconnaît à sa date de décès.
  function appliquerClientSuccession(d, personne, noter, resultat, maintenant) {
    const partie = partieSuccessionDeLaFiche(d, personne);
    const complet = [personne.prenom, personne.nom].filter(Boolean).join(' ');
    if (!partie) return resultat;
    if (partie.nouvelle) {
      d.parties = (Array.isArray(d.parties) ? d.parties : []).concat(Object.assign({
        nom: complet, role: 'PARTIE', qualiteActe: '', qualitePersonne: 'physique', representant: null, origine: 'authentic',
        emails: (personne.emails || []).slice(0, 3), telephones: (personne.telephones || []).slice(0, 3)
      }, civiliteDepuisTexte(personne.civilite) ? { civilite: civiliteDepuisTexte(personne.civilite) } : {}, personne.nomUsage ? { nomUsage: personne.nomUsage } : {}, partie.qualite ? { qualite: partie.qualite } : {}));
      noter(`Personne ajoutée d’après sa fiche Authentic : ${complet}`);
    }
    // Partie déjà sur la fiche : ses coordonnées et sa civilité manquantes viennent d'Authentic.
    if (!partie.nouvelle) {
      const p = (d.parties || []).find(x => x === partie);
      if (p) {
        const ajouts = [];
        if (!(p.emails || []).length && (personne.emails || []).length) { p.emails = personne.emails.slice(0, 3); ajouts.push('email'); }
        if (!(p.telephones || []).length && (personne.telephones || []).length) { p.telephones = personne.telephones.slice(0, 3); ajouts.push('téléphone'); }
        if (!p.civilite && civiliteDepuisTexte(personne.civilite)) { p.civilite = civiliteDepuisTexte(personne.civilite); ajouts.push('civilité'); }
        if (ajouts.length) { noter(`${complet} : ${ajouts.join(', ')} repris d’Authentic`); resultat.modifie = true; }
      }
    }
    const ancienne = d.authentic && d.authentic.fichesClients && d.authentic.fichesClients[cleFicheClientAuthentic(personne)];
    if (retenirFicheClientAuthentic(d, personne, maintenant)) {
      resultat.modifie = true;
      if (personne.deces && !(ancienne && ancienne.deces && ancienne.deces.date === personne.deces.date)) {
        noter(`Fiche du défunt lue dans Authentic : ${complet}, décédé${/^madame|^mme/i.test(String(personne.civilite || '')) ? 'e' : ''} le ${formatDateFr(personne.deces.date)}${personne.deces.lieu ? ' à ' + personne.deces.lieu : ''}`);
      } else if (!ancienne) noter(`Fiche client de ${complet} retenue (succession)`);
    }
    return resultat;
  }

  function appliquerClientAuthentic(d, personne, role, noter, resultat, maintenant) {
    const qui = role === 'VENDEUR' ? 'du vendeur' : 'de l’acquéreur';
    const nomComplet = [personne.prenom, personne.nom].filter(Boolean).join(' ');
    // Authentic d'abord (étude 06/10 au soir) : la première fois, ses emails et téléphones REMPLACENT ceux de la fiche ; ensuite un
    // changement d'Authentic est proposé, jamais écrit (voir client/52-authentic-fait-foi.js). Même règle pour l'identité de la partie.
    appliquerContactAuthentic(d, role, nomComplet, { emails: personne.emails, telephones: personne.telephones }, { noter, maintenant });
    // Société : ni civilité, ni prénom, ni date de naissance — la partie du même nom devient une personne morale.
    if (personne.morale) marquerSocieteAuthentic(d, personne, role, noter);
    else alignerIdentitePartieAuthentic(d, personne, role, { noter, maintenant }).forEach(noter);
    // La fiche client entière est retenue (domicile, naissance, situation) : base des courriers de « Constitution de dossier ».
    retenirFicheClientAuthentic(d, personne, maintenant);
    const avant = d.authentic || {};
    const cle = normaliserPourRecherche(nomComplet).replace(/[^a-z0-9]+/g, ' ').trim();
    const personnes = (avant.personnes || []).filter(p => normaliserPourRecherche(p.nom).replace(/[^a-z0-9]+/g, ' ').trim() !== cle);
    const ancienne = (avant.personnes || []).find(p => normaliserPourRecherche(p.nom).replace(/[^a-z0-9]+/g, ' ').trim() === cle);
    const sm = personne.situationMatrimoniale || null;
    if (sm && (!ancienne || JSON.stringify(ancienne.situationMatrimoniale) !== JSON.stringify(sm))) {
      noter(`Situation matrimoniale ${qui} (${nomComplet}) dans Authentic : ${libelleSituationMatrimoniale(sm)}`);
    }
    d.authentic = Object.assign({}, avant, { personnes: personnes.concat({ nom: nomComplet, role, situationMatrimoniale: sm }), releveLe: maintenant });
    // Situation du couple déduite des fiches client (étude 07/10 : « remplir automatiquement ») — Authentic d'abord, comme l'identité.
    appliquerSituationsAuthentic(d, { maintenant }).forEach(noter);
    const nomFiche = [personne.prenom, personne.nom].filter(Boolean).join(' ');
    const reste = (d.authentic.clientsAPlacer || []).filter(c => c.nom !== nomFiche);
    if (reste.length) d.authentic.clientsAPlacer = reste; else delete d.authentic.clientsAPlacer;
    resultat.modifie = true;
    return resultat;
  }

  // Fiches client d'Authentic dont le côté n'a pas pu être reconnu : une ligne « À rattacher » sur la
  // première page de la fiche, un clic les place (comme « Lus, à placer » pour les notaires).
  function renderClientsAPlacer(d, ligne) {
    const liste = (d && d.authentic && d.authentic.clientsAPlacer) || [];
    if (!liste.length) return '';
    return ligne('alert-triangle', 'À rattacher', `<span class="notaires-a-placer">${liste.map((c, i) => `<span class="notaires-a-placer-ligne"><span class="prop-texte texte-retour">${escapeHtml(c.nom)}${c.nomUsage ? ` <span class="hint">(${escapeHtml(c.nomUsage)})</span>` : ''}${[...(c.telephones || []), ...(c.emails || [])].length ? ` <span class="hint">· ${[...(c.telephones || []), ...(c.emails || [])].map(escapeHtml).join(' · ')}</span>` : ''}</span>
          <button type="button" class="lien-action" onclick="placerClientAuthentic('${escapeOnclickArg(d.id)}', ${i}, 'VENDEUR')">Vendeur</button>
          <button type="button" class="lien-action" onclick="placerClientAuthentic('${escapeOnclickArg(d.id)}', ${i}, 'ACQUEREUR')">Acquéreur</button>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="ecarterClientAuthentic('${escapeOnclickArg(d.id)}', ${i})" title="Écarter : cette personne n’est pas partie au dossier" aria-label="Écarter ${escapeAttr(c.nom)}">${icone('x')}</wa-button></span>`).join('')}</span>`, null, 'prop-pleine');
  }

  // ---- Personnes déjà connues (étude, 02/10 : « détecter si le vendeur est déjà connu, reprendre sa
  // fiche déjà complétée dans un futur dossier ») ----
  // Toute partie d'un dossier (vendeur, acquéreur, partie d'une succession) est cherchée dans les autres
  // dossiers, archivés compris — un ancien acquéreur de l'étude qui revend est le cas courant. Choix de
  // l'étude : PROPOSÉ, jamais repris d'office (homonyme, adresse d'un ex-conjoint) : une ligne « Déjà
  // connu » sur la fiche, « Reprendre » copie ce qui manque (téléphones, emails, situation matrimoniale).

  var MOTS_HORS_IDENTITE = new Set(['m', 'mr', 'mme', 'mlle', 'monsieur', 'madame', 'mademoiselle', 'nee', 'ne', 'epouse', 'epoux', 'veuve', 'veuf', 'et', 'consorts', 'consort']);

  // Pure : les mots qui identifient une personne (« Madame Odile MARCHAIS née BERTIN » → odile, marchais, bertin).
  function motsIdentitePersonne(nom) {
    return [...new Set(normaliserPourRecherche(nom || '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
      .filter(m => m.length > 1 && !MOTS_HORS_IDENTITE.has(m)))];
  }

  // Pure : même personne si l'un des deux noms est contenu dans l'autre, sur deux mots au moins
  // (« Jean DUPONT » = « DUPONT Jean » = « Monsieur Jean Pierre DUPONT »).
  function memePersonneParNom(a, b) {
    const ma = motsIdentitePersonne(a), mb = motsIdentitePersonne(b);
    const [petit, grand] = ma.length <= mb.length ? [ma, mb] : [mb, ma];
    return petit.length >= 2 && petit.every(m => grand.includes(m));
  }

  // Pure : les personnes d'un dossier avec ce que CLAIRE sait d'elles. Les coordonnées d'une vente sont
  // celles du côté (un couple les partage) ; celles d'une partie de succession lui sont propres.
  function personnesDuDossier(d) {
    if (!d) return [];
    const chiffres = (t) => String(t || '').replace(/\D/g, '');
    const telsCote = (role) => String(d[role === 'VENDEUR' ? 'telephoneVendeur' : 'telephoneAcquereur'] || '').split('/').map(t => t.trim()).filter(t => chiffres(t).length >= 9);
    const emailsCote = (role) => emailsDepuisTexte(d[role === 'VENDEUR' ? 'emailVendeur' : 'emailAcquereur']);
    const fiches = (d.authentic && d.authentic.personnes) || [];
    const situation = (nom) => { const f = fiches.find(x => x && memePersonneParNom(x.nom, nom)); return (f && f.situationMatrimoniale) || null; };
    const liste = [];
    const ajouter = (nom, role, extra) => {
      if (!nom || motsIdentitePersonne(nom).length < 2 || liste.some(x => memePersonneParNom(x.nom, nom))) return;
      const cote = role === 'VENDEUR' || role === 'ACQUEREUR';
      liste.push(Object.assign({
        nom, role,
        telephones: cote ? telsCote(role) : (extra.telephones || []),
        emails: cote ? emailsCote(role) : (extra.emails || []),
        situationMatrimoniale: extra.situationMatrimoniale || situation(nom)
      }, extra.nomUsage ? { nomUsage: extra.nomUsage } : {}));
    };
    (Array.isArray(d.parties) ? d.parties : []).forEach(p => p && ajouter(p.nom, p.role, p));
    fiches.forEach(f => f && ajouter(f.nom, f.role, f));
    return liste;
  }

  function dateReferenceDossier(d) {
    return String((d && (d.acte || d.rendezVousSignature || dateOuvertureDossier(d))) || '');
  }

  // Pure : ce qu'une personne connue d'un ancien dossier apporterait à la fiche (ce qui y manque).
  function apportPersonneConnue(actuelle, ancienne) {
    const chiffres = (t) => String(t || '').replace(/\D/g, '').slice(-9);
    const telsConnus = actuelle.telephones.map(chiffres);
    const emailsConnus = actuelle.emails.map(e => e.toLowerCase());
    return {
      telephones: ancienne.telephones.filter((t, i, l) => !telsConnus.includes(chiffres(t)) && l.findIndex(x => chiffres(x) === chiffres(t)) === i),
      emails: ancienne.emails.filter(e => !emailsConnus.includes(e.toLowerCase())),
      situationMatrimoniale: !actuelle.situationMatrimoniale && ancienne.situationMatrimoniale ? ancienne.situationMatrimoniale : null
    };
  }

  // Pure : pour chaque personne du dossier, l'ancien dossier le plus récent qui la connaît ET apporte
  // quelque chose. → [{ cle, personne, role, ancienDossier, ancienRole, apport }]
  function personnesConnuesPourDossier(d, tous) {
    if (!d) return [];
    const ecartees = new Set(d.personnesConnuesEcartees || []);
    const autres = (tous || []).filter(o => o && o.id !== d.id)
      .sort((a, b) => dateReferenceDossier(b).localeCompare(dateReferenceDossier(a)));
    const resultat = [];
    personnesDuDossier(d).forEach(p => {
      for (const o of autres) {
        const q = personnesDuDossier(o).find(x => memePersonneParNom(x.nom, p.nom));
        if (!q) continue;
        const cle = o.id + '|' + motsIdentitePersonne(p.nom).sort().join(' ');
        if (ecartees.has(cle)) continue;
        const apport = apportPersonneConnue(p, q);
        if (!apport.telephones.length && !apport.emails.length && !apport.situationMatrimoniale) continue;
        resultat.push({ cle, personne: p.nom, role: p.role, ancienDossier: o.id, ancienRole: q.role, apport });
        break;
      }
    });
    return resultat;
  }

  // Pure (modifie le dossier passé) : reprend l'apport d'une personne connue sur la fiche.
  function appliquerPersonneConnue(d, connue, noter) {
    const a = connue.apport;
    const cote = connue.role === 'VENDEUR' || connue.role === 'ACQUEREUR';
    if (cote) {
      const champTel = connue.role === 'VENDEUR' ? 'telephoneVendeur' : 'telephoneAcquereur';
      const champEmail = connue.role === 'VENDEUR' ? 'emailVendeur' : 'emailAcquereur';
      if (a.telephones.length) d[champTel] = [d[champTel], ...a.telephones].filter(Boolean).join(' / ');
      if (a.emails.length) d[champEmail] = [String(d[champEmail] || '').trim().replace(/[;,]\s*$/, ''), ...a.emails].filter(Boolean).join('; ');
    } else {
      d.parties = (d.parties || []).map(p => p && memePersonneParNom(p.nom, connue.personne)
        ? Object.assign({}, p, { telephones: [...(p.telephones || []), ...a.telephones].slice(0, 3), emails: [...(p.emails || []), ...a.emails].slice(0, 3) }, a.situationMatrimoniale && !p.situationMatrimoniale ? { situationMatrimoniale: a.situationMatrimoniale } : {})
        : p);
    }
    if (a.situationMatrimoniale && cote) {
      const avant = d.authentic || {};
      const personnes = (avant.personnes || []).filter(x => !(x && memePersonneParNom(x.nom, connue.personne)));
      d.authentic = Object.assign({}, avant, { personnes: personnes.concat({ nom: connue.personne, role: connue.role, situationMatrimoniale: a.situationMatrimoniale }) });
    }
    const repris = [
      a.telephones.length ? `téléphone ${a.telephones.join(' / ')}` : '',
      a.emails.length ? `email ${a.emails.join('; ')}` : '',
      a.situationMatrimoniale ? `situation matrimoniale (${libelleSituationMatrimoniale(a.situationMatrimoniale)})` : ''
    ].filter(Boolean).join(', ');
    noter(`Fiche de ${connue.personne} reprise d’un ancien dossier : ${repris}`);
    return d;
  }

  var LIBELLES_ROLE_CONNU = { VENDEUR: 'vendeur', ACQUEREUR: 'acquéreur', PARTIE: 'partie' };

  function renderPersonnesConnues(d, ligne) {
    const liste = personnesConnuesPourDossier(d, dossiers);
    if (!liste.length) return '';
    return ligne('users', 'Déjà connu', `<span class="notaires-a-placer">${liste.map(c => {
      const o = dossiers.find(x => x.id === c.ancienDossier);
      const quand = o && o.acte ? ` · signé le ${formatDateFr(o.acte)}` : '';
      const apport = [...c.apport.telephones, ...c.apport.emails, c.apport.situationMatrimoniale ? libelleSituationMatrimoniale(c.apport.situationMatrimoniale) : ''].filter(Boolean);
      return `<span class="notaires-a-placer-ligne"><span class="prop-texte texte-retour">${escapeHtml(c.personne)} <span class="hint">— ${LIBELLES_ROLE_CONNU[c.ancienRole] || 'partie'} dans <button type="button" class="lien-action" onclick="ouvrirDossierDrawer('${escapeOnclickArg(c.ancienDossier)}')">${escapeHtml(o ? libelleDossierAffiche(o) : 'un ancien dossier')}</button>${quand} · ${apport.map(escapeHtml).join(' · ')}</span></span>
          <button type="button" class="lien-action" onclick="reprendrePersonneConnue('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(c.cle)}')">Reprendre</button>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="ecarterPersonneConnue('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(c.cle)}')" title="Écarter : ce n’est pas la même personne" aria-label="Écarter ${escapeAttr(c.personne)}">${icone('x')}</wa-button></span>`;
    }).join('')}</span>`, null, 'prop-pleine');
  }

  async function reprendrePersonneConnue(id, cle) {
    const d = dossiers.find(x => x.id === id);
    const c = d && personnesConnuesPourDossier(d, dossiers).find(x => x.cle === cle);
    if (!c) return;
    appliquerPersonneConnue(d, c, (texte) => ajouterHistorique(d, texte));
    await sauvegarder(d);
    render();
    afficherToast(`${c.personne} : fiche reprise de l’ancien dossier.`, 'OK', null);
  }

  async function ecarterPersonneConnue(id, cle) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    d.personnesConnuesEcartees = [...(d.personnesConnuesEcartees || []).filter(x => x !== cle), cle].slice(-40);
    await sauvegarder(d);
    render();
  }

  // Une fiche « à rattacher » étrangère au dossier : retirée, et plus jamais reproposée.
  async function ecarterClientAuthentic(id, index) {
    const d = dossiers.find(x => x.id === id);
    const c = d && d.authentic && (d.authentic.clientsAPlacer || [])[index];
    if (!c) return;
    const reste = d.authentic.clientsAPlacer.filter((x, i) => i !== index);
    d.authentic = Object.assign({}, d.authentic, { clientsEcartes: [...(d.authentic.clientsEcartes || []).filter(n => n !== c.nom), c.nom].slice(-20) });
    if (reste.length) d.authentic.clientsAPlacer = reste; else delete d.authentic.clientsAPlacer;
    await sauvegarder(d);
    render();
  }

  // Une fiche client « à rattacher » placée d'un clic côté vendeur ou acquéreur.
  async function placerClientAuthentic(id, index, role) {
    const d = dossiers.find(x => x.id === id);
    const c = d && d.authentic && (d.authentic.clientsAPlacer || [])[index];
    if (!c || (role !== 'VENDEUR' && role !== 'ACQUEREUR')) return;
    const personne = { prenom: c.prenom, nom: c.nomFamille || c.nom, nomUsage: c.nomUsage, telephones: c.telephones || [], emails: c.emails || [], situationMatrimoniale: c.situationMatrimoniale || null };
    const maintenant = new Date().toISOString();
    const noter = (texte) => { d.historique = d.historique || []; d.historique.push(Object.assign({ date: maintenant, texte }, utilisateurPoste ? { auteur: utilisateurPoste } : {})); };
    appliquerClientAuthentic(d, personne, role, noter, { pieces: [], textes: [], modifie: false, echeancesFaites: [] }, maintenant);
    await sauvegarder(d);
    render();
    afficherToast(`${c.nom} : coordonnées reprises côté ${role === 'VENDEUR' ? 'vendeur' : 'acquéreur'}.`, 'OK', null);
  }

  // Pure (modifie le dossier passé) : une page d'Authentic appliquée à la fiche d'un dossier.
  //  - page de gestion : pièces reçues cochées ; « Réponse SAFER » ajoutée aux pièces MANQUANTES dès
  //    que la notification SAFER apparaît sans réponse (étude, 02/10), cochée à la non-préemption ;
  //  - toute page du dossier : état de l'acte, réquisition hors formalité, SAFER (notifiée, prise en
  //    compte), prix (Capital), collaborateur et notaire des parties prenantes — gardés dans
  //    d.authentic ; le prix remplit la fiche s'il manque ;
  //  - fiche client : téléphones et email de la partie s'ils manquent, situation matrimoniale.
  // Chaque fait nouveau entre une fois dans l'historique. → { pieces, textes, modifie }
  // Pure : une fiche bien contredit-elle le dossier (autre code postal, ou voie sans mot commun sans parcelle commune) ? → le motif, sinon ''.
  function bienAuthenticContreditDossier(d, bien) {
    const adresseDossier = (d.bien && d.bien.adresse) || {};
    const texteDossier = String(d.adresseBien || adresseDossier.adresseComplete || '');
    const cpDossier = adresseDossier.codePostal || (/\b(\d{5})\b/.exec(texteDossier) || [])[1] || '';
    const a = bien.adresse || {};
    const cpBien = a.codePostal || (/\b(\d{5})\b/.exec(a.texte || '') || [])[1] || '';
    if (cpDossier && cpBien && cpDossier !== cpBien) return `fiche bien d'une autre commune (${cpBien}) que le dossier`;
    // Même code postal, autre commune (41000 : Blois, Villebarou, Saint-Denis-sur-Loire…) : une parcelle « AB 12 » commune ne prouve rien.
    const communeBien = a.commune || communeDeLAdresse(a.texte || '').commune;
    const communeDossier = adresseDossier.commune || communeDeLAdresse(texteDossier).commune;
    if (memeCommune({ commune: communeBien, codePostal: cpBien }, { commune: communeDossier, codePostal: cpDossier }) === false) return `fiche bien d'une autre commune (${communeBien}) que le dossier`;
    const cad = d.bien && d.bien.cadastre;
    const deja = cad ? (Array.isArray(cad.parcelles) && cad.parcelles.length ? cad.parcelles : [cad]) : [];
    const clesDeja = new Set(deja.map(p => cleParcelle(p.section, p.numero)).filter(Boolean));
    if ((bien.parcelles || []).some(p => clesDeja.has(cleParcelle(p.section, p.numero)))) return '';
    const mots = (t) => new Set(normaliserPourRecherche(String(t || '').replace(/\(?\d{5}\)?/g, ' ')).split(/[^a-z0-9]+/)
      .filter(m => m.length >= 4 && !/^(rue|avenue|chemin|route|place|allee|impasse|boulevard|lieu|dit)$/.test(m)));
    const voieBien = mots(a.nomVoie || a.texte || '');
    const voieDossier = mots(texteDossier.split(',').slice(1).join(' ') || texteDossier);
    if (voieBien.size && voieDossier.size && ![...voieBien].some(m => voieDossier.has(m))) return 'fiche bien à une autre adresse que le dossier';
    return '';
  }

  // Pure (modifie d) : le type de bien de la fiche bien d'Authentic fait le type de vente de la fiche (étude 06/10 : « le type de
  // bien, tu peux le détecter dans la fiche bien »). Remplace un type différent, jamais pour une succession ni sans type lu.
  // → le texte d'historique, ou ''.
  var LIBELLES_TYPE_VENTE_AUTHENTIC = { maison: 'maison', copropriete: 'copropriété', terrain: 'terrain', terre: 'terre agricole / terrain non bâti' };
  // Authentic d'abord, puis la fiche ne bouge plus (étude 06/10 au soir, client/52) : la première fois le type d'Authentic remplace
  // celui de la fiche ; si Authentic le change ensuite, la mise à jour est proposée. `o` = { maintenant, forcer }.
  function appliquerTypeBienAuthentic(d, type, o) {
    if (!d || !type || !LIBELLES_TYPE_VENTE_AUTHENTIC[type] || estSuccession(d)) return '';
    const r = poserChampAuthentic(d, {
      cle: 'typeVente', champ: 'typeVente', libelle: 'Type de vente', valeur: type, maintenant: o && o.maintenant, forcer: o && o.forcer,
      formater: v => LIBELLES_TYPE_VENTE_AUTHENTIC[v] || String(v)
    });
    if (r.etat !== 'pose') return '';
    return `Type de vente : ${LIBELLES_TYPE_VENTE_AUTHENTIC[type]} (fiche bien Authentic ; avant : ${r.avant || 'non renseigné'})`;
  }

  // Parcelles en bois d'après Authentic (réponse de départ de l'analyse des droits de préemption ; une réponse de l'étude
  // l'emporte, voir prefillPreemption) : sur TOUTES les parcelles de la fiche, puis la fiche bien d'un dossier d'une seule
  // parcelle ; seulement pour une terre ; rien d'écrit si rien ne change (un dossier à plusieurs biens n'oscille plus).
  function appliquerBoisAuthentic(d, bien, noter, resultat) {
    if (!d || d.typeVente !== 'terre') return;
    const cad = d.bien && d.bien.cadastre;
    const parcelles = cad && Array.isArray(cad.parcelles) ? cad.parcelles : [];
    let bois = boisDesParcelles(parcelles);
    if (bois === null && parcelles.length <= 1 && bien && typeof bien.bois === 'boolean') bois = bien.bois;
    if (bois === null || (d.bien && d.bien.natureBois === bois)) return;
    d.bien = Object.assign({}, d.bien || {}, { natureBois: bois });
    noter(bois ? 'Parcelles en nature de bois d’après Authentic' : 'Parcelles hors nature de bois d’après Authentic');
    resultat.modifie = true;
  }

  // Lots d'une copropriété relevés dans Authentic (06/10) : ajoutés ou complétés sur la fiche (jamais retirés) ; un dossier
  // qui n'était pas en copropriété le devient (checklist de copropriété), dit dans l'historique.
  function appliquerLotsAuthentic(d, bien, noter, resultat, o) {
    const anciens = (d.bien && Array.isArray(d.bien.lots)) ? d.bien.lots : [];
    const fusion = fusionnerBienAuthentic({ lots: anciens, parcelles: [], tantiemesTotal: d.bien && d.bien.tantiemesTotal }, bien);
    const nouveaux = fusion.lots.filter(l => !anciens.some(a => a.numero === l.numero));
    const change = nouveaux.length || JSON.stringify(fusion.lots) !== JSON.stringify(anciens) || (fusion.tantiemesTotal != null && fusion.tantiemesTotal !== (d.bien && d.bien.tantiemesTotal));
    if (!change) return resultat;
    d.bien = Object.assign({}, d.bien || {}, { lots: fusion.lots.slice(0, 40), tantiemesTotal: fusion.tantiemesTotal != null ? fusion.tantiemesTotal : null });
    if (nouveaux.length) noter(`Lot${nouveaux.length > 1 ? 's' : ''} de copropriété relevé${nouveaux.length > 1 ? 's' : ''} dans Authentic : ${nouveaux.map(l => `n° ${l.numero}${l.type ? ' (' + l.type + ')' : ''}`).join(', ')}`);
    if (!estSuccession(d) && !(o && o.garderType)) {
      const r = poserChampAuthentic(d, { cle: 'typeVente', champ: 'typeVente', libelle: 'Type de vente', valeur: 'copropriete', maintenant: o && o.maintenant, forcer: o && o.forcer, formater: v => LIBELLES_TYPE_VENTE_AUTHENTIC[v] || String(v) });
      if (r.etat === 'pose') noter(`Type de vente passé en copropriété (lots relevés dans Authentic ; avant : ${r.avant || 'non renseigné'})`);
    }
    resultat.modifie = true;
    return resultat;
  }

  // Une page d'Authentic appliquée à la fiche. Ce qu'Authentic CHANGE sur une valeur qu'il avait déjà donnée n'est pas écrit : il est
  // proposé (`resultat.majEnAttente`, voir client/52-authentic-fait-foi.js) — le dossier est alors à enregistrer (`modifie`).
  function appliquerReleveSurDossier(d, capture, maintenantIso, liste) {
    const majAvant = instantaneMajsAuthentic(d);
    const empreinteAvant = empreinteRegistreAuthentic(d);
    const resultat = appliquerReleveSurDossierBrut(d, capture, maintenantIso, liste);
    resultat.majEnAttente = nouvellesMajsAuthentic(majAvant, d);
    // Ce qu'Authentic vient de donner est retenu sur la fiche : à enregistrer, même si aucun champ visible n'a bougé.
    if (empreinteRegistreAuthentic(d) !== empreinteAvant) resultat.modifie = true;
    if (resultat.majEnAttente.length) {
      d.historique = d.historique || [];
      resultat.majEnAttente.forEach(m => d.historique.push({ date: maintenantIso || new Date().toISOString(), texte: `Authentic a changé — ${m.libelle} : ${m.avant ? `${m.avant} → ` : ''}${m.apres} (mise à jour proposée)` }));
    }
    return resultat;
  }

  function appliquerReleveSurDossierBrut(d, capture, maintenantIso, liste) {
    const resultat = { pieces: [], textes: [], modifie: false, echeancesFaites: [] };
    if (!d || !capture) return resultat;
    const maintenant = maintenantIso || new Date().toISOString();
    const noter = (texte) => { resultat.textes.push(texte); d.historique = d.historique || []; d.historique.push({ date: maintenant, texte }); };
    const type = typePageAuthentic(capture);
    const avant = d.authentic || {};

    if (type === 'client') {
      const personne = clientDepuisFicheAuthentic(capture);
      if (!personne) return resultat;
      if (estSuccession(d)) return appliquerClientSuccession(d, personne, noter, resultat, maintenant);
      const role = roleClientAuthenticDansDossier(d, personne);
      if (!role) {
        // Côté inconnu (jamais deviné) : la fiche est gardée « à rattacher » sur la fiche du dossier,
        // un clic la place côté vendeur ou acquéreur (placerClientAuthentic).
        const nomComplet = [personne.prenom, personne.nom].filter(Boolean).join(' ');
        const deja = avant.clientsAPlacer || [];
        if ((avant.clientsEcartes || []).includes(nomComplet)) return resultat;
        const fiche = { nom: nomComplet, prenom: personne.prenom || '', nomFamille: personne.nom, nomUsage: personne.nomUsage || '', telephones: (personne.telephones || []).slice(0, 3), emails: (personne.emails || []).slice(0, 3), situationMatrimoniale: personne.situationMatrimoniale || null };
        if (!deja.some(c => c.nom === nomComplet)) noter(`Fiche client de ${nomComplet} relevée dans Authentic : à rattacher (vendeur ou acquéreur)`);
        d.authentic = Object.assign({}, avant, { clientsAPlacer: deja.filter(c => c.nom !== nomComplet).concat(fiche).slice(-6), releveLe: maintenant });
        resultat.modifie = true;
        return resultat;
      }
      // Le sous-dossier dit qui est vendeur et acquéreur (rubrique « Comparants », étude 09/10) : une fiche client d'une personne qui
      // n'y figure pas — conjoint d'une partie, propriétaire seule ou acquéreur seul — n'ajoute ni personne ni coordonnées. Sans
      // comparants relevés, le côté se lit par le nom seulement, jamais par le conjoint.
      // Personne déjà partie de la fiche sous ses prénom et nom : complétée même si la lecture des comparants ne la retrouve pas (20/10,
      // BOUCHKAR : fiche lue, rien repris).
      // Seulement quand la lecture des comparants de CE côté n'y retrouve aucune personne de la fiche (lecture ratée) : des comparants lus
      // qui écartent quelqu'un (le conjoint posé à tort depuis le compromis, règle du 09/10) l'emportent toujours.
      // Une société n'est jamais le conjoint posé à tort : son côté, lu dans les parties, les comparants ou le nom du dossier (mots
      // significatifs, 26/10), suffit — la lecture des comparants ne connaît pas toujours les raisons sociales.
      if (!personne.morale && !personneComparantAuthentic(d, personne, role) && !(conjointPartieDuDossierAuthentic(d, personne) && comparantsCoteIllisiblesAuthentic(d, role))) {
        // Sa fiche entière reste lisible sur le dossier (panneau « Authentic »), sans partie ni coordonnées reprises.
        if (retenirFicheClientAuthentic(d, personne, maintenant, { horsComparants: true })) {
          noter(`Fiche client de ${[personne.prenom, personne.nom].filter(Boolean).join(' ')} gardée : absente des comparants, ni partie ni coordonnées reprises`);
          resultat.modifie = true;
        }
        return resultat;
      }
      return appliquerClientAuthentic(d, personne, role, noter, resultat, maintenant);
    }
    if (type === 'bien') {
      if (estSuccession(d)) return appliquerBienSuccession(d, bienDepuisFicheAuthentic(capture), noter, resultat);
      // Fiche sûrement de CE dossier (son onglet, sa référence) : un bien à une autre adresse s'ajoute (étude 19/10).
      const onglet = dossierOngletActifAuthentic(capture, liste || dossiers || []);
      const reference = referenceDossierAuthentic(capture);
      const dossierSur = (!!onglet && onglet.id === d.id) || (!!reference && d.referenceAuthentic === reference);
      return appliquerBienAuthentic(d, bienDepuisFicheAuthentic(capture), noter, resultat, { dossierSur });
    }
    // Aperçu de l'immeuble sur la page du sous-dossier (16/10) : lots (copropriété) et parcelles avec leur surface, comme la fiche du bien.
    if (type === 'gestion') appliquerApercuImmeubleAuthentic(d, capture, noter, resultat);

    // Pièces reçues (page de gestion). Succession : actes de naissance et EHF suivent leur propre règle (plus bas), jamais une ligne seule.
    const pieces = (type === 'gestion' ? piecesAuthenticAAppliquer(d, capture) : [])
      .filter(p => !estSuccession(d) || !(['actesNaissance', 'ehf'].includes(p.cle) || /naissance|hors\s+formalit|(?:^|[^a-z])ehf(?![a-z])/i.test(p.label || '')));
    d.pieces = d.pieces || {};
    pieces.forEach(p => {
      if (p.nouvelle && !(d.piecesPersonnalisees || []).some(x => x.cle === p.cle)) {
        d.piecesPersonnalisees = (d.piecesPersonnalisees || []).concat({ cle: p.cle, label: p.label });
      }
      d.pieces[p.cle] = 'recue';
      d.piecesValideesManuellement = Array.from(new Set([...(d.piecesValideesManuellement || []), p.cle]));
      d.piecesAuthentic = Array.from(new Set([...(d.piecesAuthentic || []), p.cle]));
      d.piecesTrouveesLe = Object.assign({}, d.piecesTrouveesLe, { [p.cle]: p.date ? p.date + 'T12:00:00' : maintenant });
      d.piecesNotifications = Array.from(new Set([...(d.piecesNotifications || []), p.cle]));
      noter(`Reçue dans Authentic : « ${p.label} »${p.nouvelle ? ' ajoutée à la liste des pièces' : ''}${p.titre && p.titre !== p.label ? ` (${p.titre})` : ''}${p.date ? `, le ${formatDateFr(p.date)}` : ''}`);
    });
    resultat.pieces = pieces;

    // Informations du dossier.
    const infos = infosDossierAuthentic(capture, d.typeAffaire);
    const apres = fusionnerInfosAuthentic(avant, infos);
    // SAFER relue au nouveau format (envoi = 2e date) : l'ancienne « prise en compte », qui était cet
    // envoi, ne reste pas affichée en double.
    if (infos.safer && infos.safer.envoyeeLe && apres.safer && !infos.safer.priseEnCompteLe && !avant.safer?.envoyeeLe) {
      apres.safer.priseEnCompteLe = '';
    }
    const nouveau = (k, kk) => apres[k] && apres[k][kk] && apres[k][kk] !== (avant[k] || {})[kk];
    if (nouveau('acte', 'etat') && !(d.roleNotaire === 'participant' && apres.acte.etat !== 'signe')) noter(`Acte dans Authentic : ${apres.acte.libelle}${apres.acte.date ? ` le ${formatDateFr(apres.acte.date)}` : ''}`);
    if (nouveau('acte', 'etat') && ['a_rediger', 'redaction'].includes(apres.acte.etat)) {
      noterVerificationPoste('redaction-acte-authentic', { detail: `état de rédaction lu : ${apres.acte.etat === 'redaction' ? 'en cours' : 'non rédigé'}` });
      // Étude 07/10 : « si l'acte est en non rédigé ne pas cocher, s'il est en cours cocher la tâche et l'échéance ». Le passage à
      // « En cours » coche l'étape (la tâche du jour apparaît cochée, « Faite par CLAIRE ») ; « Non rédigé » la décoche.
      if (d.roleNotaire !== 'participant' && !estSuccession(d)) {
        d.echeancesValidees = d.echeancesValidees || {};
        if (apres.acte.etat === 'redaction' && d.echeancesValidees.redaction !== true) {
          d.echeancesValidees.redaction = true;
          noter('Rédaction de l’acte marquée réalisée (en cours dans Authentic)');
        } else if (apres.acte.etat === 'a_rediger' && d.echeancesValidees.redaction !== undefined) {
          delete d.echeancesValidees.redaction;
        }
      }
    }
    if (nouveau('rhf', 'envoyeeLe')) noter(`Réquisition hors formalité envoyée le ${formatDateFr(apres.rhf.envoyeeLe)} (Authentic)`);
    if (nouveau('rhf', 'retourLe')) noter(`Retour de la réquisition hors formalité le ${formatDateFr(apres.rhf.retourLe)} (Authentic)`);
    if (nouveau('safer', 'envoyeeLe')) noter(`Notification SAFER envoyée le ${formatDateFr(apres.safer.envoyeeLe)} (Authentic)`);
    if (nouveau('safer', 'priseEnCompteLe')) noter(`Notification SAFER prise en compte le ${formatDateFr(apres.safer.priseEnCompteLe)} (Authentic)`);
    if (nouveau('safer', 'decision') && apres.safer.decision === 'preemption') noter(`SAFER : préemption exercée${apres.safer.decisionLe ? ` (${formatDateFr(apres.safer.decisionLe)})` : ''} — à vérifier dans Authentic`);
    // Acte signé dans Authentic (étude, 02/10 : « marque-le comme fait ») : la signature et toutes
    // les étapes qui la précèdent sont faites — plus rien au planning ni aux rappels. Une seule fois,
    // au passage à « signé » ; chaque validation reste annulable sur la fiche.
    if (nouveau('acte', 'etat') && apres.acte.etat === 'signe') {
      d.echeancesValidees = d.echeancesValidees || {};
      ['ventebien', 'pret', 'appelFonds', 'projetEnvoye', 'rendezVousSignature', 'acte'].forEach(type => {
        if (echeanceValidee(d, type)) return;
        d.echeancesValidees[type] = true;
        resultat.echeancesFaites.push(type);
      });
      if (resultat.echeancesFaites.length) noter(`Signature de l’acte marquée réalisée (acte signé dans Authentic${apres.acte.date ? ` le ${formatDateFr(apres.acte.date)}` : ''})`);
    }
    if (apres.avantContratLe && !d.dateAvantContrat) {
      d.dateAvantContrat = apres.avantContratLe;
      noter(`Date de signature de l’avant-contrat reprise d’Authentic : ${formatDateFr(apres.avantContratLe)}`);
    }

    // SAFER notifiée, sans réponse : « Réponse SAFER » parmi les pièces manquantes (une fois — la
    // retirer reste la décision de l'étude ; jamais en participation).
    const saferAttendue = apres.safer && apres.safer.decision !== 'non_preemption' && d.roleNotaire !== 'participant';
    const pieceSafer = checklistPieces(d.typeVente, d).some(p => p.personnalisee && /safer/i.test(p.label));
    if (saferAttendue && !avant.saferPieceAjoutee && !pieceSafer) {
      d.piecesPersonnalisees = (d.piecesPersonnalisees || []).concat({ cle: 'perso-safer', label: 'Réponse SAFER' });
      d.pieces['perso-safer'] = 'manquante';
      apres.saferPieceAjoutee = true;
      noter('« Réponse SAFER » ajoutée aux pièces manquantes (SAFER notifiée dans Authentic, pas encore de réponse)');
    }

    // État civil virtuel (Comedec) en attente ou négatif : la pièce figure, non cochée, avec son état.
    let etatsChanges = false;
    if (d.roleNotaire !== 'participant') {
      Object.entries(infos.etatsCivils || {}).forEach(([cle, ec]) => {
        const ancien = ((avant.etatsCivils || {})[cle] || {}).etat;
        if (ec.etat === 'positif' || d.pieces[cle] === 'recue') return;
        // Succession : les actes de naissance vont dans la pièce « Actes de naissance » (règle plus bas), pas une pièce par acte.
        if (estSuccession(d) && /naissance/i.test(ec.label || '')) return;
        if (!(d.piecesPersonnalisees || []).some(x => x.cle === cle)) d.piecesPersonnalisees = (d.piecesPersonnalisees || []).concat({ cle, label: ec.label });
        if (!d.pieces[cle]) d.pieces[cle] = 'manquante';
        if (ancien !== ec.etat) {
          etatsChanges = true;
          noter(ec.casier ? `« ${ec.label} » : casier judiciaire${ec.statut ? ` — ${ec.statut}` : ec.etat === 'negatif' ? ' non délivré' : ', demande en cours'} (Authentic)` : ec.etat === 'negatif'
            ? `« ${ec.label} » : Comedec négatif — erreur, le document n’a pas pu être délivré (Authentic)`
            : `« ${ec.label} » : demande Comedec prise en compte, en attente (Authentic)`);
        }
      });
    }
    Object.entries(infos.demandes || {}).forEach(([cle, dm]) => {
      if ((avant.demandes || {})[cle]) return;
      noter(`Demande envoyée${dm.date ? ` le ${formatDateFr(dm.date)}` : ''} : « ${dm.titre} » (Authentic)`);
    });

    // Succession (étude 15/10) : actes de naissance (tous revenus positifs) et EHF (réquisition envoyée et revenue) cochés d'après Authentic.
    let piecesSuccessionChangees = false;
    if (estSuccession(d) && type === 'gestion' && d.roleNotaire !== 'participant') {
      const ps = piecesSuccessionAuthentic(apres);
      const retirees = new Set(d.piecesRetirees || []);
      [['actesNaissance', 'Actes de naissance', ps.actesNaissance.recue, `${ps.actesNaissance.recus}/${ps.actesNaissance.total} reçus`],
        ['ehf', 'État hypothécaire hors formalité (EHF)', ps.ehf.recue, `envoyé le ${formatDateFr(ps.ehf.envoyeeLe)}, revenu le ${formatDateFr(ps.ehf.retourLe)}`]].forEach(([cle, label, recue, detail]) => {
        if (!recue || retirees.has(cle) || d.pieces[cle] === 'recue') return;
        d.pieces[cle] = 'recue';
        d.piecesValideesManuellement = Array.from(new Set([...(d.piecesValideesManuellement || []), cle]));
        d.piecesAuthentic = Array.from(new Set([...(d.piecesAuthentic || []), cle]));
        d.piecesTrouveesLe = Object.assign({}, d.piecesTrouveesLe, { [cle]: maintenant });
        d.piecesNotifications = Array.from(new Set([...(d.piecesNotifications || []), cle]));
        noter(`Reçue dans Authentic : « ${label} » (${detail})`);
        piecesSuccessionChangees = true;
      });
    }
    // Succession (étude 15/10) : les actes du tableau « Rédaction » (notoriété, déclaration, attestation, délivrance de legs…) et leur état.
    let actesChanges = false;
    if (estSuccession(d) && type === 'gestion') {
      const actes = actesSuccessionAuthentic(capture);
      if (actes.length && JSON.stringify(actes) !== JSON.stringify(avant.actesSuccession || [])) {
        const anciens = new Map((avant.actesSuccession || []).map(a => [a.intitule, a]));
        actes.forEach(a => {
          const ancien = anciens.get(a.intitule);
          if (!ancien) noter(`Acte relevé dans Authentic : « ${a.intitule} »${a.etat === 'signe' ? ' — signé' + (a.signeLe ? ' le ' + formatDateFr(a.signeLe) : '') : ''}`);
          else if (ancien.etat !== a.etat && a.etat === 'signe') noter(`« ${a.intitule} » signé dans Authentic${a.signeLe ? ' le ' + formatDateFr(a.signeLe) : ''}`);
        });
        apres.actesSuccession = actes;
        actesChanges = true;
      }
    }
    // Succession (étude 16/10) : courriers de clôture / transfert des comptes — croisés par le serveur avec les emails envoyés à la banque.
    let courriersChanges = false;
    if (estSuccession(d) && type === 'gestion') {
      // Ajoutés à ceux déjà relevés (une page qui n'en montre qu'une partie n'efface pas les autres).
      const lus = courriersBanqueSuccessionAuthentic(capture);
      const courriers = (avant.courriersBanque || []).filter(c => !lus.some(x => x.intitule === c.intitule && x.date === c.date)).concat(lus).slice(-30);
      if (lus.length && JSON.stringify(courriers) !== JSON.stringify(avant.courriersBanque || [])) {
        const connus = new Set((avant.courriersBanque || []).map(c => c.intitule + '|' + c.date));
        courriers.filter(c => !connus.has(c.intitule + '|' + c.date)).forEach(c => noter(`Courrier ${c.nature === 'transfert' ? 'de transfert' : 'de clôture'} des comptes relevé dans Authentic : « ${c.intitule} »${c.date ? ' du ' + formatDateFr(c.date) : ''}`));
        apres.courriersBanque = courriers;
        courriersChanges = true;
      }
    }
    if (Object.keys(infos).length || pieces.length || etatsChanges || actesChanges || courriersChanges || piecesSuccessionChangees || apres.saferPieceAjoutee !== avant.saferPieceAjoutee) {
      apres.releveLe = maintenant;
      d.authentic = apres;
      resultat.modifie = true;
    }
    if (infos.comparants && retirerPartiesHorsComparants(d, noter)) resultat.modifie = true;
    if (infos.comparants && estSuccession(d)) noterComparantsSuccession(avant.comparants, infos.comparants).forEach(noter);
    // Prix « Capital » : Authentic d'abord, puis la fiche ne bouge plus (après d.authentic = apres : le registre des valeurs y vit).
    if (apres.prix) {
      const r = poserChampAuthentic(d, { cle: 'prixVente', champ: 'prixVente', libelle: 'Prix de vente', valeur: apres.prix, maintenant, egal: (a, b) => Number(a) === Number(b), formater: v => Number(v) > 0 ? formaterPrix(v) : '' });
      if (r.etat === 'pose') {
        noter(`Prix de vente repris d’Authentic (Capital) : ${formaterPrix(apres.prix)}${r.avant ? ` (avant : ${r.avant})` : ''}`);
        resultat.modifie = true;
      }
    }
    // La page de gestion est la base de la fiche (étude 06/10 : « on prend toujours de base les données d'Authentic, avant
    // et après la création ») : ce qui manque sur la fiche — personnes, emails, téléphones, bien, prix, référence — est
    // repris à chaque relevé, sans rien remplacer (même reprise que « Authentic › Compléter » sur la fiche).
    if (type === 'gestion') {
      const groupe = dossiersDepuisRelevesAuthentic([{ recueLe: maintenant, capture }])[0];
      const complements = groupe && groupe.export ? complementDossierDepuisAuthentic(d, groupe.export, liste || []) : [];
      if (complements.length) { noter(`Complété depuis Authentic : ${complements.join(', ')}`); resultat.modifie = true; }
    }
    // SAFER sans réponse au-delà de son délai : non-préemption (pièce cochée).
    const nbHist = (d.historique || []).length;
    if (appliquerSaferTacite(d, maintenant.slice(0, 10), maintenant)) {
      resultat.modifie = true;
      resultat.textes.push(d.historique[nbHist].texte);
    }
    return resultat;
  }

  // Le dernier dossier vu dans Authentic : une fiche client (ou un onglet sans intitulé) ouverte
  // depuis ce dossier lui appartient — la fiche client n'est reprise que si la personne est l'une
  // de ses parties (roleClientAuthenticDansDossier).
  var DUREE_DOSSIER_COURANT_AUTHENTIC_MS = 30 * 60 * 1000;
  let dossierCourantAuthentic = { id: '', t: 0, sur: false };
  // Le dernier dossier vu, seulement s'il a été reconnu SÛREMENT (référence, intitulé rangé à la main, choix) — étude 19/10.
  function courantSurAuthentic() {
    if (!dossierCourantAuthentic.sur || Date.now() - dossierCourantAuthentic.t >= DUREE_DOSSIER_COURANT_AUTHENTIC_MS) return null;
    return dossiers.find(x => x && !x.deleted && x.id === dossierCourantAuthentic.id) || null;
  }

  // Pure : [{ intitule, numero }] de tous les dossiers cités sur une page.
  function intitulesNumerotesAuthentic(capture) {
    const c = capture || {};
    const sources = [];
    (c.champs || []).forEach(ch => { sources.push(ch.libelle || ''); sources.push(ch.valeur || ''); });
    (c.tableaux || []).forEach(t => (t.lignes || []).forEach(l => (l || []).forEach(x => sources.push(String(x || '')))));
    sources.push(...texteSansOngletsInactifsAuthentic(c).split('\n'));
    const re = new RegExp(RE_INTITULE_DOSSIER_AUTHENTIC.source, 'gi');
    const vus = [];
    sources.forEach(s => {
      for (const m of String(s).matchAll(re)) {
        const i = m[2].replace(/\s*\/\s*/, ' / ').replace(/\s+/g, ' ').trim();
        // Le rang « N » n'identifie rien : seule une référence « A 2026 00247 » sur la même ligne compte.
        const refs = referencesDansTexteAuthentic(s);
        const reference = refs.length === 1 ? refs[0] : '';
        if (!vus.some(v => v.intitule === i && v.reference === reference)) vus.push({ intitule: i, reference });
      }
    });
    return vus;
  }

  // Pure : le dossier d'une fiche client (étude, 02/10 : « ça fonctionne pour l'acquéreur mais pas pour
  // le vendeur » — un vendeur déjà client de l'étude a plusieurs dossiers dans Authentic, et le premier
  // intitulé cité sur sa fiche était son ANCIEN dossier). Dans l'ordre : le dossier en cours de
  // consultation s'il est cité (ou si rien n'est cité) ; sinon le seul dossier cité où la personne est
  // partie (les dossiers en cours d'abord) ; sinon le seul dossier en cours où elle est partie.
  // Jamais deviné entre deux.
  function dossierPourFicheClientAuthentic(capture, liste, courant) {
    const personne = clientDepuisFicheAuthentic(capture);
    const actifs = (liste || []).filter(d => d && !d.deleted);
    const cites = [];
    intitulesNumerotesAuthentic(capture).forEach(x => {
      const d = dossierPourIntituleAuthentic(x.intitule, actifs, '', x.reference);
      if (d && !cites.includes(d)) cites.push(d);
    });
    const partie = (d) => !!personne && !!roleClientAuthenticDansDossier(d, personne);
    const unique = (l) => l.length === 1 ? l[0] : null;
    const enCours = (l) => l.filter(d => !d.archive && !signatureFaiteSuivi(d));
    // 1. Un dossier EN COURS où la personne est partie : celui en consultation, puis le seul cité sur sa
    //    fiche, puis le seul de CLAIRE. Un ancien dossier (archivé, signé) cité sur sa fiche ne passe
    //    jamais devant (étude, 02/10 : « toujours buggé pour CHAHUNEAU — rien côté vendeur » : un vendeur
    //    déjà client a son ancien achat cité sur sa fiche).
    if (courant && enCours([courant]).length && partie(courant)) return courant;
    const citesPartie = cites.filter(partie);
    const choix = unique(enCours(citesPartie)) || unique(enCours(actifs.filter(partie)));
    if (choix) return choix;
    // 2. Sinon un dossier terminé où elle est partie (consulté, puis cité).
    if (courant && partie(courant)) return courant;
    const termine = unique(citesPartie.filter(d => !d.archive)) || unique(citesPartie);
    if (termine) return termine;
    // 3. Partie nulle part : seulement si sa fiche cite le dossier en consultation (« à rattacher »).
    //    Une fiche ouverte juste après un autre dossier n'y est jamais rangée (étude, 02/10 : « pourquoi
    //    proposer SIMOND pour ce dossier ? »).
    return courant && cites.includes(courant) ? courant : null;
  }

  // Pure : pourquoi une fiche client n'a été rangée dans aucun dossier — dit à l'étude, jamais en silence.
  function raisonFicheClientSansDossier(capture, liste) {
    const personne = clientDepuisFicheAuthentic(capture);
    if (!personne) return '';
    const qui = [personne.prenom, personne.nom].filter(Boolean).join(' ');
    const enCours = dossiersCandidatsFicheClient(capture, liste);
    if (enCours.length > 1) return `fiche de ${qui} : plusieurs dossiers en cours la comptent (${enCours.slice(0, 3).map(libelleDossierAffiche).join(', ')}) — choisissez le bon`;
    return `fiche de ${qui} : aucun dossier en cours de CLAIRE ne compte cette personne parmi ses parties (nom, nom d'usage ou conjoint)`;
  }

  // Pure : les dossiers en cours dont la personne d'une fiche client est partie, avec son côté.
  function dossiersCandidatsFicheClient(capture, liste) {
    const personne = clientDepuisFicheAuthentic(capture);
    if (!personne) return [];
    // Succession (20/10, MARTIN) : défunt, héritier ou conjoint survivant, reconnu sous ses prénom et nom.
    return (liste || []).filter(d => d && !d.deleted && !d.archive && !signatureFaiteSuivi(d)
      && (estSuccession(d) ? !!partieSuccessionDeLaFiche(d, personne) : roleClientAuthenticDansDossier(d, personne)));
  }

  // Fiches client en attente d'un choix de dossier (mémoire du poste seulement, 10 au plus).
  var fichesClientEnAttente = new Map();
  let numeroFicheEnAttente = 0;

  // Fenêtre du choix : une fiche client (plusieurs dossiers possibles) ou la page d'un dossier qu'aucun
  // dossier de CLAIRE n'a reconnu (étude, 02/10) — rangée à la main, son numéro est retenu.
  function ouvrirChoixFicheClientAuthentic(cle) {
    const attente = fichesClientEnAttente.get(cle);
    const overlay = document.getElementById('authentic-choix-overlay');
    const liste = document.getElementById('authentic-choix-liste');
    const intro = document.getElementById('authentic-choix-intro');
    const recherche = document.getElementById('authentic-choix-recherche');
    if (!attente || !overlay || !liste) return;
    let candidats = [];
    let marque = () => '';
    if (attente.nature === 'dossier') {
      const intitule = intituleDossierAuthentic(attente.capture);
      if (intro) intro.textContent = `Page « ${intitule} » lue dans Authentic : dans quel dossier de CLAIRE la ranger ? Les pages suivantes de ce dossier iront au même endroit.`;
      const notes = candidatsDossierAuthentic(intitule, adresseBienPageAuthentic(attente.capture), dossiers);
      candidats = notes.map(x => x.d);
      marque = (d) => {
        const x = notes.find(n => n.d === d);
        return x && x.s.nomsTrouves ? x.s.details.filter(t => !/−/.test(t)).slice(0, 2).join(' · ').replace(/\s*\(\+\d+\)/g, '') : '';
      };
    } else if (attente.nature !== 'client') {
      if (intro) intro.textContent = `Page lue dans Authentic${attente.intituleGroupe ? ` (onglet « ${attente.intituleGroupe} »)` : ''} : dans quel dossier de CLAIRE la ranger ?`;
      candidats = candidatsDossierAuthentic(attente.intituleGroupe || '', '', dossiers).map(x => x.d);
    } else {
      const personne = clientDepuisFicheAuthentic(attente.capture);
      const qui = personne ? [personne.prenom, personne.nom].filter(Boolean).join(' ') : 'cette personne';
      if (intro) intro.textContent = `Fiche de ${qui} lue dans Authentic : dans quel dossier la ranger ?`;
      candidats = dossiersCandidatsFicheClient(attente.capture, dossiers);
      marque = (d) => {
        const role = personne ? roleClientAuthenticDansDossier(d, personne) : '';
        return role === 'VENDEUR' ? 'vendeur' : role === 'ACQUEREUR' ? 'acquéreur' : role ? 'partie' : '';
      };
      // Partie d'aucun dossier : tous les dossiers en cours (elle y sera « à rattacher »).
      if (!candidats.length) candidats = candidatsDossierAuthentic('', '', dossiers).map(x => x.d);
    }
    // Le dossier proposé par les noms en tête (étude 19/10 : confirmé d'un clic, jamais rangé seul).
    const propose = attente.propose ? dossiers.find(x => x.id === attente.propose) : null;
    if (propose) candidats = [propose].concat(candidats.filter(x => x !== propose));
    liste.innerHTML = candidats.length ? candidats.map(d => {
      const m = d === propose ? 'proposé par CLAIRE' : marque(d);
      return `<button type="button" class="nas-choix-item${d === propose ? ' propose' : ''}" data-cherche="${escapeAttr(normaliserPourRecherche(libelleDossierAffiche(d) + ' ' + (d.nom || '')))}" onclick="rangerFicheClientAuthentic('${escapeOnclickArg(cle)}', '${escapeOnclickArg(d.id)}')">`
        + `<span class="nas-choix-nom">${escapeHtml(libelleDossierAffiche(d))}</span>`
        + (m ? `<span class="nas-choix-marque">${escapeHtml(m)}</span>` : '')
        + `</button>`;
    }).join('') : '<p class="nas-choix-vide">Aucun dossier en cours.</p>';
    if (attente.nature === 'dossier' && attente.creation) {
      const nom = String(intituleDossierAuthentic(attente.capture) || '').replace(/^\s*(?:vente|vte)\.?\s+/i, '');
      liste.insertAdjacentHTML('beforeend', `<button type="button" class="nas-choix-item nas-choix-creer" data-cherche="creer nouveau dossier" onclick="creerDossierDepuisPageAuthentic('${escapeOnclickArg(cle)}')">`
        + `<span class="nas-choix-nom">${icone('plus')}Créer un nouveau dossier</span><span class="nas-choix-marque">${escapeHtml(libelleDossierParNom(nom))}</span></button>`);
    }
    if (recherche) {
      recherche.value = '';
      recherche.style.display = candidats.length > 6 ? '' : 'none';
    }
    overlay.style.display = 'flex';
    const premier = recherche && recherche.style.display !== 'none' ? recherche : liste.querySelector('button');
    if (premier) premier.focus();
  }

  function filtrerChoixAuthentic(texte) {
    const q = normaliserPourRecherche(texte || '').trim();
    document.querySelectorAll('#authentic-choix-liste .nas-choix-item').forEach(b => {
      b.style.display = !q || (b.dataset.cherche || '').includes(q) ? '' : 'none';
    });
  }

  function fermerChoixFicheClientAuthentic() {
    const overlay = document.getElementById('authentic-choix-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // La page va dans le dossier choisi, qui devient le dossier en consultation : les fiches suivantes
  // des mêmes personnes y vont sans redemander ; la page d'un dossier lui laisse son numéro.
  async function rangerFicheClientAuthentic(cle, id) {
    fermerChoixFicheClientAuthentic();
    fermerToastFixe(cle);
    const attente = fichesClientEnAttente.get(cle);
    const d = dossiers.find(x => x.id === id);
    if (!attente || !d) return;
    fichesClientEnAttente.delete(cle);
    dossierCourantAuthentic = { id: d.id, t: Date.now(), sur: true };
    try { noterVerificationPoste('authentic-rattachement-confirme', { detail: attente.propose === d.id ? 'dossier proposé confirmé' : 'autre dossier choisi' }); } catch (e) { /* rapport facultatif */ }
    if (attente.nature === 'dossier' || attente.rattacher) {
      // L'onglet du dossier d'Authentic (référence, intitulé entier) est retenu pour ce dossier : la question n'est posée qu'une fois.
      const intitule = attente.nature === 'dossier' ? intituleDossierAuthentic(attente.capture) : (/\.{2,}|…/.test(attente.intituleGroupe || '') ? '' : attente.intituleGroupe);
      const quittes = rattacherIntituleAuthentic(d, intitule, dossiers, attente.nature === 'dossier' ? referenceDossierAuthentic(attente.capture) : attente.referenceGroupe);
      for (const x of quittes) await sauvegarder(x);
    }
    const partage = partagerFicheConjointAuthentic(attente.capture);
    const r = appliquerReleveSurDossier(d, partage ? partage.principale : attente.capture, undefined, dossiers);
    if (partage && conjointPartieDuDossierAuthentic(d, clientDepuisFicheAuthentic(partage.conjoint)) && appliquerReleveSurDossier(d, partage.conjoint, undefined, dossiers).modifie) r.modifie = true;
    completerDossierDepuisRelevesRecents(d); // ce qui manque encore, d'après toutes les pages relevées (asynchrone)
    await sauvegarder(d);
    render();
    const texte = r.modifie ? `${r.textes[0] || 'page reprise'}${r.textes.length > 1 ? ` (+${r.textes.length - 1})` : ''}`
      : attente.nature === 'dossier' ? 'dossier rattaché, rien de neuf sur la page' : raisonFicheClientSansChangement(partage ? partage.principale : attente.capture) || 'page rangée, rien de neuf';
    afficherToast(`Authentic · ${libelleDossierAffiche(d)} : ${texte}.`, 'Voir', () => ouvrirDossierDrawer(d.id));
    notifierMajAuthentic(d, r.majEnAttente);
    if (attente.releveId) rapporterResultatsAuthentic([{ id: attente.releveId, etat: 'rattache', dossierId: d.id, texte, cle: clePageReleveAuthentic(attente.capture) }]);
    await reprendreAttentesGroupeAuthentic(attente.groupe, cle);
    reposerQuestionSuivanteAuthentic();
  }

  // Depuis le journal (Réglages › Authentic) : la page, encore en mémoire du serveur, est rangée à la main.
  async function choisirDossierPourReleveAuthentic(releveId, creer) {
    let rel = null;
    try {
      const r = await fetchAvecAuth('/api/authentic/releves/' + encodeURIComponent(releveId));
      if (r.ok) rel = await r.json();
    } catch (e) { /* serveur injoignable */ }
    if (!rel || !rel.capture) { afficherToast('Page plus en mémoire (24 h) : rouvrez-la dans Authentic.', 'OK', null); return; }
    const nature = typePageAuthentic(rel.capture) === 'client' ? 'client' : 'dossier';
    const creation = nature === 'dossier' && proposerCreationDossierAuthentic(rel.capture, intituleDossierAuthentic(rel.capture));
    const cle = 'f' + (++numeroFicheEnAttente);
    fichesClientEnAttente.set(cle, { capture: rel.capture, releveId, nature, creation });
    limiterAttentesAuthentic();
    if (creer && creation) { creerDossierDepuisPageAuthentic(cle); return; }
    ouvrirChoixFicheClientAuthentic(cle);
  }

  // Pure : ce qu'une fiche client a apporté, quand rien n'a changé — dit à l'étude.
  function raisonFicheClientSansChangement(capture) {
    const personne = clientDepuisFicheAuthentic(capture);
    if (!personne) return '';
    const qui = [personne.prenom, personne.nom].filter(Boolean).join(' ');
    if (!(personne.telephones || []).length && !(personne.emails || []).length) return `fiche de ${qui} lue : elle ne porte ni téléphone ni email dans Authentic`;
    return `fiche de ${qui} lue : téléphone et email déjà sur la fiche`;
  }

  // Pure : le dossier de CLAIRE ouvert dans Authentic d'après l'intitulé seul (« 15 - Donation SIMOND »,
  // « 12 - Vente PETIT/BOSQUET », précédé de la référence « A 2026 00247 » depuis l'extension 0.3.9) — par
  // la référence, sinon par les noms ; jamais par le rang « N » ; null pour un dossier que CLAIRE ne suit pas.
  function dossierPourNavigationAuthentic(intitule, liste) {
    const refs = referencesDansTexteAuthentic(intitule);
    const reference = refs.length === 1 ? refs[0] : '';
    const texte = sansReferenceAuthentic(intitule);
    const lu = intituleDossierAuthentic({ champs: [], tableaux: [], texte })
      || intituleVenteNormalise(texte.replace(/^\s*\d{1,6}\s*-\s*/, ''));
    if (!lu) return reference ? dossierPourIntituleAuthentic('', liste, '', reference) : null;
    return dossierPourIntituleAuthentic(lu, liste, '', reference);
  }

  // L'utilisateur a changé de dossier dans Authentic (étude, 02/10 : « je peux naviguer d'un dossier à
  // l'autre… j'étais dans le dossier SIMOND mais ça s'est mis dans PETIT ») : le dossier en
  // consultation devient celui-là — ou aucun, s'il n'est pas suivi dans CLAIRE.
  function suivreNavigationAuthentic(intitule) {
    const d = dossierPourNavigationAuthentic(intitule, dossiers);
    const refs = referencesDansTexteAuthentic(intitule);
    dossierCourantAuthentic = { id: d ? d.id : '', t: Date.now(), sur: !!d && refs.length === 1 && d.referenceAuthentic === refs[0] };
  }

  // Un message « aucun dossier » par page et par fenêtre toutes les 30 min, pas à chaque retour sur la page.
  var messagesDossierIntrouvable = new Map();
  function direPageSansDossierAuthentic(capture, rel, raison, creation) {
    const intitule = intituleDossierAuthentic(capture);
    const cleMessage = intitule;
    const deja = messagesDossierIntrouvable.get(cleMessage);
    if (deja && Date.now() - deja < DUREE_DOSSIER_COURANT_AUTHENTIC_MS) return;
    messagesDossierIntrouvable.set(cleMessage, Date.now());
    const cle = 'f' + (++numeroFicheEnAttente);
    fichesClientEnAttente.set(cle, { capture, releveId: rel && rel.id, nature: 'dossier', creation: !!creation });
    limiterAttentesAuthentic();
    afficherToast(`Authentic · « ${intitule} » : ${raison}.`, 'Choisir', () => ouvrirChoixFicheClientAuthentic(cle), { fixe: true, cle });
  }

  // Page de vente d'Authentic qu'aucun dossier de CLAIRE ne porte (étude, 03/10 : bandeau « Créer », jamais
  // d'office) : le message reste jusqu'au clic ou à la croix.
  function direPageACreerAuthentic(capture, rel, raison) {
    const intitule = intituleDossierAuthentic(capture);
    const deja = messagesDossierIntrouvable.get(intitule);
    if (deja && Date.now() - deja < DUREE_DOSSIER_COURANT_AUTHENTIC_MS) return;
    messagesDossierIntrouvable.set(intitule, Date.now());
    const cle = 'f' + (++numeroFicheEnAttente);
    fichesClientEnAttente.set(cle, { capture, releveId: rel && rel.id, nature: 'dossier', creation: true });
    limiterAttentesAuthentic();
    afficherToast(`Authentic · « ${intitule} » n’est pas dans CLAIRE.`, 'Créer', () => creerDossierDepuisPageAuthentic(cle), { fixe: true, cle });
  }

  // « Créer » : « Nouveau dossier » › Depuis Authentic, pré-rempli avec cette page et les fiches (client, bien)
  // vues dans la journée sous le même intitulé — même chemin que la liste « Dossiers ouverts dans Authentic ».
  async function creerDossierDepuisPageAuthentic(cle) {
    fermerChoixFicheClientAuthentic();
    fermerToastFixe(cle);
    const attente = fichesClientEnAttente.get(cle);
    if (!attente) return;
    fichesClientEnAttente.delete(cle);
    const intitule = intituleDossierAuthentic(attente.capture);
    let releves = [];
    try {
      const r = await fetchAvecAuth('/api/authentic/releves/recents');
      if (r.ok) releves = (await r.json()).releves || [];
    } catch (e) { /* la page seule suffit */ }
    const tous = releves.filter(x => x && x.capture && x.id !== attente.releveId)
      .concat([{ id: attente.releveId || 'page', capture: attente.capture, recueLe: new Date().toISOString() }]);
    groupesAuthenticRecents = dossiersDepuisRelevesAuthentic(tous, { apercu: true });
    const i = groupesAuthenticRecents.findIndex(g => g.intitule === intitule);
    if (i < 0) { afficherToast('Page d’Authentic illisible : dossier à créer à la main.', 'OK', null); return; }
    definirOnglet('nouveau');
    reinitialiserFormulaire();
    // Étude 06/10 : « Créer » mène à l'import AVEC PDF — le compromis déposé, le dossier d'Authentic retenu le complète de
    // lui-même (voir renderRelevesAuthenticWizard). Une succession n'a pas de compromis : reprise seule, comme avant.
    // Seule une VENTE reconnue part vers le compromis (étude 16/10 : une succession mal reconnue ouvrait la création d'une vente).
    if (typeAffaireAuthentic(groupesAuthenticRecents[i].export) !== 'vente') creerDepuisAuthentic(i);
    else { authenticRetenuPourPdf = intitule; groupeAuthenticRetenu = groupesAuthenticRecents[i]; choisirModeImport('pdf'); }
    noterVerificationPoste('authentic-creer-dossier', { detail: 'création ouverte depuis une page du dossier' });
    if (attente.releveId) rapporterResultatsAuthentic([{ id: attente.releveId, etat: 'a-creer', texte: 'création du dossier ouverte depuis la page' }]);
  }

  // Applique une page relevée → { etat, dossierId, texte } pour le journal (Réglages › Authentic) :
  // applique, sans-changement, sans-dossier, a-choisir. `rel.revu` : page revue, sans message « rien
  // de neuf ».
  async function appliquerReleveAuthentic(capture, rel) { if (typeof noterPresenceAuthentic === 'function' && rel && rel.memePoste === true) noterPresenceAuthentic(capture);   // où l'on est dans Authentic (client/127)
    // Fiche client ouverte avec le volet du conjoint : la fiche, puis le conjoint comme une seconde fiche client du même dossier.
    // Le conjoint ne fait que COMPLÉTER une partie déjà sur ce dossier, reconnue par prénom et nom (relecture 16/10) : ni choix, ni
    // nouvelle partie, ni dossier en consultation changé.
    const partage = partagerFicheConjointAuthentic(capture);
    if (partage) {
      const r = await appliquerReleveAuthentic(partage.principale, Object.assign({}, rel || {}, { captureEntiere: capture }));
      try {
        const dp = r && r.dossierId ? dossiers.find(x => x.id === r.dossierId) : null;
        if (dp && conjointPartieDuDossierAuthentic(dp, clientDepuisFicheAuthentic(partage.conjoint)) && appliquerReleveSurDossier(dp, partage.conjoint, undefined, dossiers).modifie) await sauvegarder(dp);
      } catch (e) { noterJournalTechnique({ categorie: 'erreur-poste', message: 'Authentic : volet du conjoint non appliqué — ' + String(e && e.message || e).slice(0, 120) }); }
      return r;
    }
    let d = null;
    const revu = !!(rel && rel.revu);
    if (typePageAuthentic(capture) === 'client') {
      // Étude 19/10 (« ne plus jamais deviner le dossier ») : seulement le dossier SÛR de l'onglet actif (référence rattachée, intitulé
      // rangé à la main), et seulement si la personne y est partie ou que sa fiche le cite ; sinon la fiche attend un clic.
      const ctx = contexteSurAuthentic(capture, dossiers, courantSurAuthentic());
      // Fiche ouverte dans un onglet à elle (Authentic en ouvre une par fiche, 20/10) : le dernier dossier SÛR vu, si la personne y est
      // partie sous ses prénom et nom — jamais un autre dossier, jamais par le nom seul.
      if (!ctx.d && !ctx.groupe && personneDuDossierSurAuthentic(courantSurAuthentic(), clientDepuisFicheAuthentic(capture))) ctx.d = courantSurAuthentic();
      d = ctx.d ? dossierPourFicheClientAuthentic(capture, [ctx.d], ctx.d) : null;
      // Onglet d'un dossier d'Authentic que les noms ne désignent pas (titre coupé…) : la personne propose son dossier ; personne → création.
      if (!d && !ctx.d && ctx.groupe && !ctx.propose && !dossierPourFicheClientAuthentic(capture, dossiers, null)) return { etat: 'sans-changement', texte: 'fiche ouverte dans l’onglet d’un dossier d’Authentic absent de CLAIRE : gardée pour sa création' };
      if (!d) {
        const guess = ctx.d ? null : (ctx.propose || dossierPourFicheClientAuthentic(capture, dossiers, null));
        if (!guess && !dossiersCandidatsFicheClient(capture, dossiers).length) {
          const raison = raisonFicheClientSansDossier(capture, dossiers);
          if (raison && !revu) afficherToast(`Authentic · ${raison}.`, 'OK', null);
          return { etat: 'sans-dossier', texte: raison || 'fiche client illisible' };
        }
        return pageAConfirmerAuthentic(capture, rel, Object.assign({}, ctx, { propose: guess }), 'client');
      }
      dossierCourantAuthentic = { id: d.id, t: Date.now(), sur: true };
      const r0 = appliquerReleveSurDossier(d, capture, undefined, dossiers);
      completerDossierDepuisRelevesRecents(d); // ce qui manque encore, d'après toutes les pages relevées (asynchrone)
      if (!r0.modifie) {
        const raison = raisonFicheClientSansChangement(capture);
        if (raison && !revu) afficherToast(`Authentic · ${libelleDossierAffiche(d)} : ${raison}.`, 'Voir', () => ouvrirDossierDrawer(d.id));
        return { etat: 'sans-changement', dossierId: d.id, texte: raison || 'rien de neuf' };
      }
      await sauvegarder(d);
      render();
      if (r0.textes.length) afficherToast(`Authentic · ${libelleDossierAffiche(d)} : ${r0.textes[0]}${r0.textes.length > 1 ? ` (+${r0.textes.length - 1})` : ''}.`, 'Voir', () => ouvrirDossierDrawer(d.id));
      notifierMajAuthentic(d, r0.majEnAttente);
      return { etat: 'applique', dossierId: d.id, texte: r0.textes.join(' · ') || 'fiche client reprise' };
    }
    const lu = intituleDossierAuthentic(capture);
    const reference = referenceDossierAuthentic(capture);
    const adresse = adresseBienPageAuthentic(capture);
    // Sous-dossier « Promesse », « Avenant »… (étude, 03/10 : seul le sous-dossier de VENTE compte) : son « Signé le »
    // est celui de la promesse ou de l'avenant, ses pièces ne sont pas celles de la vente — rien n'est repris. Le
    // dossier reste celui en consultation (fiches client ouvertes ensuite) et la référence du dossier est retenue.
    const sous = sousDossierAuthentic(capture);
    if (lu && sous && sous !== 'vente' && sous !== 'succession') {
      const dTrouve = dossierPourIntituleAuthentic(lu, dossiers, adresse, reference);
      const dSous = dossierSurAuthentic(dTrouve, reference, lu) ? dTrouve : null; // jamais une référence retenue par les noms seuls
      dossierCourantAuthentic = { id: dSous ? dSous.id : '', t: Date.now(), sur: !!dSous };
      const libelleSous = sous === 'promesse' ? 'promesse' : sous === 'avenant' ? 'avenant' : sous === 'pret' ? 'prêt' : 'autre que la vente';
      const pretLu = sous === 'pret' && dSous && retenirPageActePretAuthentic(dSous, capture, isoAujourdhuiLocal()); // étude 20/10 : état de l'acte de prêt
      const promesseLue = sous === 'promesse' && dSous && retenirDateAvantContratAuthentic(dSous, capture); // étude 22/10 : date de l'avant-contrat
      if (dSous && (retenirReferenceAuthentic(dSous, reference, dossiers) || pretLu || promesseLue)) { await sauvegarder(dSous); render(); }
      return { etat: 'sans-changement', dossierId: dSous ? dSous.id : undefined, texte: `sous-dossier ${libelleSous} : seul le sous-dossier de vente est lu` };
    }
    let referenceNotee = false;
    let raisonAncien = '';
    let comment = '';
    if (lu) {
      d = dossierPourIntituleAuthentic(lu, dossiers, adresse, reference);
      // Retrouvé par les noms mais signé avant ce dossier : un ancien dossier des mêmes clients — jamais
      // appliqué, et sa référence n'est pas prise (sauf référence ou intitulé déjà rattachés à ce dossier).
      const rattache = dossierSurAuthentic(d, reference, lu);
      if (d && !rattache && ancienDossierAuthentic(capture, d)) {
        raisonAncien = `ancien dossier des mêmes clients (acte signé le ${formatDateFr(etatActeAuthentic(capture).date)}), pas ${libelleDossierAffiche(d)}`;
        d = null;
      }
      // Retrouvé par les noms seulement (étude 19/10) : « A 2025 00281 = VTE X / Y ? » — confirmé d'un clic, jamais appliqué seul.
      if (d && !rattache) {
        dossierCourantAuthentic = { id: '', t: Date.now(), sur: false };
        return pageAConfirmerAuthentic(capture, rel, { d: null, propose: d, groupe: reference || cleIntituleAuthentic(lu), intitule: lu, reference }, 'dossier');
      }
      dossierCourantAuthentic = { id: d ? d.id : '', t: Date.now(), sur: !!d };
      comment = commentDossierRetrouveAuthentic(lu, adresse, d, reference);
      referenceNotee = !!d && retenirReferenceAuthentic(d, reference, dossiers);
      // L'intitulé du dossier Authentic rattaché, montré dans le « i » de la fiche.
      if (d && reference && d.referenceAuthentic === reference && d.intituleAuthentic !== lu) {
        d.intituleAuthentic = String(lu).slice(0, 150);
        referenceNotee = true;
      }
    } else if (typePageAuthentic(capture) === 'bien' && ongletActifHorsDossierAuthentic(capture)) {
      // Fiche bien ouverte dans un onglet à elle (Authentic en ouvre une par fiche, 20/10) : le dernier dossier SÛR vu, seulement si le
      // bien est le sien (adresse, parcelle, ou cité dans sa rubrique « Immeubles ») ; sinon d'aucun dossier (recherche d'immeubles…).
      d = bienDuDossierSurAuthentic(courantSurAuthentic(), bienDepuisFicheAuthentic(capture)) ? courantSurAuthentic() : null;
      // Bien que le dossier sûr ne connaît pas encore (étude 20/10, succession BARBOSA-ANTUNES : sa page n'annonçait pas l'adresse) :
      // « est-ce le bien de ce dossier ? » d'un clic — jamais rangé seul, jamais écarté en silence.
      const courantSur = courantSurAuthentic();
      if (!d && questionBienSuccessionAuthentic(capture, courantSur, dossiers)) {
        return pageAConfirmerAuthentic(capture, rel, { d: courantSur, propose: courantSur, groupe: courantSur.referenceAuthentic || 'bien:' + courantSur.id }, 'bien');
      }
      if (!d) {
        noterVerificationPoste('authentic-fiche-bien-hors-onglet', { detail: 'fiche bien non rangée : onglet actif sans dossier' });
        return { etat: 'sans-changement', texte: 'fiche bien ouverte hors de l’onglet d’un dossier d’Authentic, d’aucun dossier sûr : non rangée' };
      }
    } else {
      // Page sans intitulé (fiche bien, lots…) : le dossier SÛR de l'onglet actif, sinon la question (étude 19/10).
      const ctx = contexteSurAuthentic(capture, dossiers, courantSurAuthentic());
      d = ctx.d;
      // Onglet que le score ne désigne pas (titre coupé…) : le dossier en cours dont les noms s'y retrouvent, proposé — jamais pris.
      const approche = !d && !ctx.propose && ctx.intitule ? candidatsDossierAuthentic(ctx.intitule, '', dossiers).filter(x => x.s.nomsTrouves) : [];
      if (approche.length) ctx.propose = approche[0].d;
      if (!d && ctx.propose) return pageAConfirmerAuthentic(capture, rel, ctx, typePageAuthentic(capture) === 'bien' ? 'bien' : 'page');
      if (!d && ctx.groupe) { if (!revu) afficherToast('Authentic · page ouverte dans l’onglet d’un dossier absent de CLAIRE : non rangée.', 'OK', null); return { etat: 'sans-changement', texte: 'page ouverte dans l’onglet d’un dossier d’Authentic absent de CLAIRE : non rangée' }; }
    }
    if (!d) {
      // Jamais en silence (étude, 02/10) : le motif, et le choix à la main.
      const raison = raisonAncien || (lu ? raisonDossierAuthenticIntrouvable(lu, dossiers, adresse, reference) : (typePageAuthentic(capture) === 'bien' ? 'fiche bien gardée pour « Nouveau dossier »' : 'aucun dossier ouvert dans Authentic juste avant'));
      const creation = !!lu && !raisonAncien && proposerCreationDossierAuthentic(capture, lu);
      if (lu && !raisonAncien && proposerChoixDossierAuthentic(capture, lu, dossiers)) direPageSansDossierAuthentic(capture, rel, raison, creation);
      else if (creation) direPageACreerAuthentic(capture, rel, raison);
      return { etat: lu ? (creation ? 'a-creer' : 'sans-dossier') : 'sans-changement', texte: raison };
    }
    const r = appliquerReleveSurDossier(d, capture, undefined, dossiers);
    completerDossierDepuisRelevesRecents(d); // ce qui manque encore, d'après toutes les pages relevées (asynchrone)
    const avecComment = (t) => [comment, t].filter(Boolean).join(' — ');
    if (!r.modifie && !referenceNotee) return { etat: 'sans-changement', dossierId: d.id, texte: avecComment(r.raison || 'rien de neuf') };
    await sauvegarder(d);
    render();
    // Comme une validation à la main : les dates butoir levées quittent l'agenda.
    r.echeancesFaites.filter(t => t === 'pret' || t === 'ventebien').forEach(t => {
      Promise.resolve().then(() => synchroniserEcheanceAgenda(d, t, false)).catch(() => { /* agenda facultatif */ });
    });
    const cles = r.pieces.map(p => p.cle);
    if (cles.length) {
      try { notifierNouvellesPiecesTrouvees(d, cles); } catch (e) { /* notification facultative */ }
      try { notifierNavigateurPieces(d, cles); } catch (e) { /* notification facultative */ }
      try { signalerSiDossierDevenuComplet(d); } catch (e) { /* notification facultative */ }
    }
    if (r.textes.length) {
      const resume = r.pieces.length
        ? `${r.pieces.length} pièce${r.pieces.length > 1 ? 's' : ''} reçue${r.pieces.length > 1 ? 's' : ''} (${r.pieces.map(p => p.label).join(', ')})`
        : r.textes[0] + (r.textes.length > 1 ? ` (+${r.textes.length - 1})` : '');
      afficherToast(`Authentic · ${libelleDossierAffiche(d)} : ${resume}.`, 'Voir', () => ouvrirDossierDrawer(d.id));
    }
    notifierMajAuthentic(d, r.majEnAttente);
    return { etat: 'applique', dossierId: d.id, texte: avecComment(r.textes.join(' · ') || 'page reprise') };
  }

  // SAFER sans réponse : le délai s'écoule même sans nouvelle page d'Authentic — vérifié au démarrage
  // puis toutes les heures (appliquerSaferTacite ne change un dossier qu'une fois).
  // Étude, 02/10 : « ne pas remodifier une date déjà lue dans le compromis et validée ». La relecture
  // AUTOMATIQUE de la date de l'avant-contrat dans un PDF du NAS (version de 15 h 11, retirée) a posé
  // des dates moins sûres que celle validée à l'import : elles sont retirées — sauf si l'étude les a
  // saisies ou reprises d'Authentic depuis. Pure (modifie le dossier passé) → vrai si retirée.
  var RE_DATE_AC_LUE_NAS = /^Date de signature de l’avant-contrat lue dans (.+) : (.+)$/;
  function retirerDateAvantContratLueNas(d) {
    if (!d || !d.dateAvantContrat) return false;
    const hist = d.historique || [];
    let iLue = -1;
    hist.forEach((h, i) => { if (h && RE_DATE_AC_LUE_NAS.test(h.texte || '')) iLue = i; });
    if (iLue < 0) return false;
    const m = RE_DATE_AC_LUE_NAS.exec(hist[iLue].texte);
    if (m[2] !== formatDateFr(d.dateAvantContrat)) return false;
    // Saisie à la main ou reprise d'Authentic après la lecture : décision de l'étude, on n'y touche pas.
    if (hist.slice(iLue + 1).some(h => h && /^Date de signature de l’avant-contrat( :| reprise)/.test(h.texte || ''))) return false;
    d.dateAvantContrat = null;
    hist.push({ date: new Date().toISOString(), texte: `Date de l’avant-contrat lue automatiquement dans ${m[1]} retirée (${m[2]}) : à saisir sur la fiche (« Signé le ») si elle manque` });
    d.historique = hist;
    return true;
  }

  // Étude, 03/10 : le « numéro Authentic » retenu jusqu'ici était le rang du sous-dossier (« 1 » de
  // « 1 - Vente … »), partagé par presque tous les dossiers — une page de MERCIER était allée à DORLÉAC.
  // Ce champ est oublié au démarrage ; le vrai numéro, la référence « A 2026 00247 », est retenu dans
  // `d.referenceAuthentic` à la prochaine page du dossier. Pure (modifie le dossier passé) → vrai si retiré.
  function retirerNumeroAuthentic(d) {
    if (!d || d.numeroAuthentic == null) return false;
    const ancien = d.numeroAuthentic;
    delete d.numeroAuthentic;
    d.historique = d.historique || [];
    d.historique.push({ date: new Date().toISOString(), texte: `Rang de sous-dossier Authentic « ${ancien} » oublié : il n’identifie pas le dossier (la référence du dossier Authentic sera retenue à la prochaine page)` });
    return true;
  }

  // Pure (modifie le dossier passé) : oublie tout ce qu'une page de DOSSIER d'Authentic a posé sur la
  // fiche (étude, 03/10 : page d'un autre dossier appliquée par erreur) — état de l'acte, RHF, SAFER,
  // Comedec, demandes, prix et date d'avant-contrat repris d'Authentic, pièces cochées « dans Authentic »
  // (celles qu'Authentic avait ajoutées sont retirées). Les fiches client (rapprochées par le
  // nom des parties) restent. Tout revient à la prochaine ouverture du bon dossier dans Authentic.
  // → la liste de ce qui a été retiré (vide : rien à oublier).
  function oublierDonneesAuthentic(d, maintenantIso) {
    if (!d) return [];
    const maintenant = maintenantIso || new Date().toISOString();
    const a = d.authentic || {};
    const retire = [];
    const hist = d.historique || [];
    const reprisDAuthentic = (re) => hist.some(h => h && re.test(h.texte || ''));
    if (a.prix && Number(d.prixVente) === Number(a.prix) && reprisDAuthentic(/^Prix de vente repris d’Authentic/)) { d.prixVente = null; retire.push('prix'); }
    if (a.avantContratLe && d.dateAvantContrat === a.avantContratLe && reprisDAuthentic(/^Date de signature de l’avant-contrat reprise d’Authentic/)) { d.dateAvantContrat = null; retire.push('date de l’avant-contrat'); }
    const cles = new Set([...(d.piecesAuthentic || []), ...Object.keys(a.etatsCivils || {}), ...(a.saferPieceAjoutee ? ['perso-safer'] : [])]);
    if (cles.size) {
      const ajoutees = new Set((d.piecesPersonnalisees || []).filter(p => cles.has(p.cle)).map(p => p.cle));
      d.piecesPersonnalisees = (d.piecesPersonnalisees || []).filter(p => !ajoutees.has(p.cle));
      d.pieces = Object.assign({}, d.pieces);
      cles.forEach(cle => {
        if (ajoutees.has(cle)) delete d.pieces[cle];
        else if (d.pieces[cle] === 'recue') d.pieces[cle] = 'manquante';
      });
      d.piecesValideesManuellement = (d.piecesValideesManuellement || []).filter(c => !cles.has(c));
      d.piecesNotifications = (d.piecesNotifications || []).filter(c => !cles.has(c));
      if (d.piecesTrouveesLe) cles.forEach(cle => { delete d.piecesTrouveesLe[cle]; });
      delete d.piecesAuthentic;
      retire.push(`${cles.size} pièce${cles.size > 1 ? 's' : ''}`);
    }
    const champsDossier = ['acte', 'rhf', 'safer', 'prix', 'collaborateur', 'etatsCivils', 'demandes', 'avantContratLe', 'saferPieceAjoutee', 'valeurs', 'majEnAttente', 'pret'];
    if (champsDossier.some(k => a[k])) {
      const reste = Object.assign({}, a);
      champsDossier.forEach(k => { delete reste[k]; });
      delete reste.releveLe;
      if (Object.keys(reste).length) d.authentic = reste; else delete d.authentic;
      retire.push('suivi d’Authentic (acte, RHF, SAFER…)');
    }
    if (d.referenceAuthentic) { retire.push('référence du dossier Authentic'); delete d.referenceAuthentic; delete d.intituleAuthentic; }
    if ((d.intitulesAuthentic || []).length) { retire.push('intitulé rangé à la main'); delete d.intitulesAuthentic; }
    if (retire.length) {
      hist.push(Object.assign({ date: maintenant, texte: `Données d’Authentic oubliées (${retire.join(', ')}) : elles reviendront à la prochaine ouverture du dossier dans Authentic` }, utilisateurPoste ? { auteur: utilisateurPoste } : {}));
      d.historique = hist;
    }
    return retire;
  }

  function confirmerOublierDonneesAuthentic(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    demanderConfirmation(`Oublier ce qui vient d’Authentic sur ${libelleDossierAffiche(d)} ? Pièces cochées « dans Authentic », réquisition, SAFER, état de l’acte et rattachement au dossier Authentic sont retirés ; tout revient à la prochaine ouverture du bon dossier dans Authentic.`, async () => {
      const retire = oublierDonneesAuthentic(d);
      // Les pages gardées sur le serveur aussi : sinon « Relire depuis Authentic » remettrait ce qui vient d'être oublié.
      try { await fetchAvecAuth(`/api/authentic/dossier/${encodeURIComponent(d.id)}/pages`, { method: 'DELETE' }); } catch (_) { /* rien gardé ou serveur absent */ }
      recuAuthenticParDossier.delete(d.id);
      if (!retire.length) return;
      await sauvegarder(d);
      render();
      afficherToast(`${libelleDossierAffiche(d)} : données d’Authentic oubliées.`, 'OK', null);
    }, { bouton: 'Oublier', ton: 'danger' });
  }

  // Pure (modifie le dossier passé) : « Maître X (BLOIS désigné par) » — commune lue par une version d'avant le
  // 03/10 sur « Notaire à BLOIS désigné par le vendeur » — redevient « Maître X (BLOIS) ». → vrai si corrigé.
  function nettoyerCommunesNotairesDossier(d) {
    if (!d) return false;
    let change = false;
    const propre = (v) => String(v).replace(/\(([^()]*?)\s+d[ée]sign[ée]e?s?(?:\s+par)?\s*\)/gi, '($1)');
    ['notaireVendeur', 'notaireAcquereur'].forEach(k => {
      if (typeof d[k] === 'string' && propre(d[k]) !== d[k]) { d[k] = propre(d[k]); change = true; }
    });
    (Array.isArray(d.notairesDetectes) ? d.notairesDetectes : []).forEach(n => {
      if (n && typeof n.nom === 'string' && propre(n.nom) !== n.nom) { n.nom = propre(n.nom); change = true; }
      if (n && typeof n.office === 'string' && /\s+d[ée]sign[ée]/i.test(n.office)) { n.office = nettoyerCommuneNotaire(n.office); change = true; }
    });
    return change;
  }

  // Pure (modifie le dossier passé) : un nom de dossier ou un intitulé retenu qui porte « Importer avec 6e SENS » (créé
  // avant le 06/10) est nettoyé une fois, avec une ligne d'historique.
  function retirerImporterAuthentic(d) {
    if (!d) return false;
    let change = false;
    if (typeof d.nom === 'string' && RE_IMPORTER_SENS_AUTHENTIC.test(d.nom) && sansImporterAuthentic(d.nom)) {
      const ancien = d.nom;
      d.nom = sansImporterAuthentic(d.nom);
      d.historique = d.historique || [];
      d.historique.push({ date: new Date().toISOString(), texte: `Nom du dossier nettoyé : « ${ancien} » → « ${d.nom} » (bouton d’Authentic collé à l’intitulé)` });
      change = true;
    }
    if (Array.isArray(d.intitulesAuthentic)) {
      const propres = d.intitulesAuthentic.map(i => (typeof i === 'string' ? sansImporterAuthentic(i) || i : i));
      if (propres.join('\n') !== d.intitulesAuthentic.join('\n')) { d.intitulesAuthentic = propres; change = true; }
    }
    return change;
  }

  // Pièce « Non péril, non insalubrité » (0.283.0) : un dossier ouvert avant elle dont le rendez-vous de signature est déjà placé (ou
  // archivé) ne la réclame pas d'un coup (relecture 0.283.0 : « Prêt » repassait « Attente de pièces ») — retirée une fois, comme une
  // pièce retirée à la main (elle se rajoute sur la fiche) ; les autres dossiers la demandent.
  var DATE_PIECE_NON_PERIL = '2026-10-18';
  function migrerPieceNonPeril(d) {
    if (!d || d.nonPerilVu || estSuccession(d) || !['maison', 'copropriete', ''].includes(String(d.typeVente || ''))) return false;
    d.nonPerilVu = true;
    const ouvert = dateOuvertureDossier(d);
    const ancien = !ouvert || ouvert < DATE_PIECE_NON_PERIL;
    const recue = d.pieces && d.pieces.nonPeril === 'recue';
    if (ancien && !recue && (d.archive || d.rendezVousSignature) && !(d.piecesRetirees || []).includes('nonPeril')) {
      d.piecesRetirees = (d.piecesRetirees || []).concat('nonPeril');
      ajouterHistorique(d, 'Pièce « Non péril, non insalubrité » non réclamée : rendez-vous de signature déjà placé (si elle est demandée quand même, l’ajouter en pièce sur la fiche)');
    }
    return true;
  }

  async function retirerDatesAvantContratLuesNas() {
    for (const d of dossiers || []) {
      const date = retirerDateAvantContratLueNas(d);
      const numero = retirerNumeroAuthentic(d);
      const notaires = nettoyerCommunesNotairesDossier(d);
      const importer = retirerImporterAuthentic(d);
      const ancien = retirerParcellesAncienCadastre(d);
      const dia = migrerPieceDiaCopropriete(d);
      const nonPeril = migrerPieceNonPeril(d);
      const doublons = [dedoublonnerPartiesDossier(d), retirerPartieDuMauvaisCote(d), retirerBiensDAutresDossiers(d)].some(Boolean);
      const droits = realignerDroitsPreemption(d);
      droits.forEach(t => ajouterHistorique(d, t));
      if (date || numero || notaires || importer || ancien || dia || nonPeril || doublons || droits.length) await sauvegarder(d);
    }
  }

  async function verifierSaferTacites() {
    const aujourdhui = isoAujourdhuiLocal();
    for (const d of dossiers || []) {
      if (!d || d.archive || !d.authentic || !d.authentic.safer || d.authentic.safer.decision) continue;
      if (!appliquerSaferTacite(d, aujourdhui)) continue;
      await sauvegarder(d);
      afficherToast(`${libelleDossierAffiche(d)} : SAFER sans réponse dans le délai — non-préemption.`, 'Voir', () => ouvrirDossierDrawer(d.id));
    }
    render();
  }

  // Les relevés s'appliquent l'un après l'autre (boucle d'attente et relève de secours confondues) :
  // deux pages du même dossier ne s'écrivent jamais en même temps.
  let fileRelevesAuthentic = Promise.resolve();
  function appliquerRelevesAuthentic(releves) {
    fileRelevesAuthentic = fileRelevesAuthentic.then(async () => {
      // Étude, 02/10 : « pourquoi parfois les données ne remontent pas ? ». Une fenêtre cachée ou réduite
      // ne relit plus les dossiers (polling arrêté) mais prend encore les pages d'Authentic : sur sa copie
      // ancienne, un dossier créé depuis sur un autre poste restait introuvable, et la fiche enregistrée
      // écrasait les changements faits ailleurs. Les dossiers sont donc relus avant chaque page.
      if ((releves || []).some(rel => rel && rel.capture)) await rattraperDossiersDistants();
      const resultats = [];
      for (const rel of releves || []) {
        if (rel && rel.navigation) { suivreNavigationAuthentic(rel.navigation); continue; }
        // Compte rendu page par page (relecture 19/10) : le serveur remet en file une page sans compte rendu après 90 s — un lot long
        // ne doit pas faire rejouer ses premières pages.
        try {
          const res = await appliquerReleveAuthentic(rel.capture, rel);
          if (res && rel.id) { const x = Object.assign({ id: rel.id, cle: clePageReleveAuthentic(rel.capture) }, res); resultats.push(x); rapporterResultatsAuthentic([x]); }
        } catch (e) {
          console.error('Relevé Authentic non appliqué', e && e.message);
          if (rel && rel.id) { const x = { id: rel.id, etat: 'erreur', texte: 'erreur dans CLAIRE : ' + String((e && e.message) || e).slice(0, 120) }; resultats.push(x); rapporterResultatsAuthentic([x]); }
        }
      }
      // « Nouveau dossier » ouvert à l'étape 1 : la liste « Depuis Authentic » suit les pages vues.
      const etape1 = document.getElementById('wizard-step-1');
      if (etape1 && etape1.classList.contains('actif') && etape1.offsetParent) chargerRelevesAuthenticRecents(); else rafraichirWizardSuccessionAuthentic();
    });
    return fileRelevesAuthentic;
  }

  // Les dossiers changés sur le serveur depuis le dernier sondage (même lecture que le polling).
  async function rattraperDossiersDistants() {
    try {
      const reponse = await fetchAvecAuth(`/api/dossiers?since=${curseurSynchro}`);
      if (!reponse.ok) return false;
      const { dossiers: changements, serverTime } = await reponse.json();
      if (changements.length) appliquerChangementsDistants(changements);
      curseurSynchro = serverTime;
      return true;
    } catch (e) { return false; }
  }

  // Ce que la fenêtre a fait de chaque page, pour le journal du serveur (Réglages › Authentic).
  function rapporterResultatsAuthentic(resultats) {
    Promise.resolve().then(() => fetchAvecAuth('/api/authentic/releves/resultats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resultats })
    })).then(() => {
      const panneau = document.getElementById('reglages-panneau-authentic');
      if (panneau && !panneau.hidden && panneau.offsetParent) renderReglagesAuthentic();
    }).catch(() => { /* journal facultatif */ });
  }

  // Relève de secours (et retour au premier plan) : ce qui est en file, tout de suite.
  async function releverPagesAuthentic() {
    if (!authToken || releveAuthenticEnCours) return;
    releveAuthenticEnCours = true;
    try {
      const r = await fetchAvecAuth('/api/authentic/releves/prendre', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poste: utilisateurPoste || '' }) });
      if (!r.ok) return;
      const { releves } = await r.json();
      await appliquerRelevesAuthentic(releves);
    } catch (e) { /* le relevé suivant reprendra */ } finally {
      releveAuthenticEnCours = false;
    }
  }

  // Étude, 02/10 : « je suis obligé d'ouvrir la fiche dans CLAIRE et de regarder la fenêtre pour que les
  // données se mettent à jour ». Une fenêtre cachée ou réduite n'est plus réveillée par le navigateur
  // qu'une fois par minute (voire moins) : une relève toutes les 5 s n'y passait plus. La fenêtre garde
  // donc une requête ouverte que le serveur rend dès qu'une page d'Authentic arrive (25 s au plus, puis
  // elle repart aussitôt) — la réponse d'une requête n'est pas ralentie, la page est appliquée en
  // arrière-plan dans la seconde.
  let boucleRelevesAuthenticLancee = false;
  async function boucleRelevesAuthentic() {
    if (boucleRelevesAuthenticLancee) return;
    boucleRelevesAuthenticLancee = true;
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    for (;;) {
      if (!authToken) { await pause(5000); continue; }
      let releves = null;
      try {
        // Le collaborateur du poste : le serveur sert d'abord la fenêtre du poste qui consulte Authentic.
        const r = await fetchAvecAuth('/api/authentic/releves/attendre', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poste: utilisateurPoste || '' }) });
        if (r.ok) releves = (await r.json()).releves || [];
      } catch (e) { /* serveur injoignable : on réessaie plus bas */ }
      if (releves === null) { await pause(10000); continue; }
      if (releves.length) await appliquerRelevesAuthentic(releves);
    }
  }

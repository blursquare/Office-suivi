  // ---- « Nouveau dossier » depuis les pages relevées dans Authentic (étude, 02/10) ----
  // Les pages vues dans la dernière heure (gestion du dossier, fiches client, fiches bien), regroupées
  // par dossier, entrent dans le parcours de l'export ZIP : mêmes parties (par l'intitulé « Vente
  // VENDEUR/ACQUÉREUR »), même bien, mêmes pièces présentes, même formulaire à vérifier. Un avant-
  // contrat déjà déposé garde ses dates et son prix : Authentic le complète.
  let groupesAuthenticRecents = [];
  // Dossier d'Authentic retenu par « Créer » (intitulé) : appliqué dès que le compromis est lu (06/10). Son groupe (la page
  // qui a déclenché « Créer ») est gardé à part : le rafraîchissement des relevés récents ne le connaît pas toujours.
  let authenticRetenuPourPdf = '';
  let groupeAuthenticRetenu = null;
  // Pure : les groupes relevés, complétés du groupe retenu s'il n'y figure pas.
  function groupesAvecRetenu(groupes, retenu) {
    const liste = groupes || [];
    return retenu && !liste.some(g => g.intitule === retenu.intitule) ? liste.concat([retenu]) : liste;
  }

  async function chargerRelevesAuthenticRecents() {
    const bloc = document.getElementById('authentic-releves');
    if (!bloc || !authToken) return;
    try {
      const r = await fetchAvecAuth('/api/authentic/releves/recents');
      if (!r.ok) return;
      const { releves } = await r.json();
      groupesAuthenticRecents = groupesAvecRetenu(dossiersDepuisRelevesAuthentic(releves || []), groupeAuthenticRetenu);
    } catch (e) { return; }
    renderRelevesAuthenticWizard();
  }

  // Pure : « 2 personnes · 1 bien · 3 pièces présentes ».
  function resumeGroupeAuthentic(g) {
    const ex = (g && g.export) || {};
    const n = (k, s, p) => `${k} ${k > 1 ? p : s}`;
    const parties = partiesExportAuthentic(ex);
    const morceaux = [
      parties.length ? n(parties.length, 'partie reconnue', 'parties reconnues') : n((ex.personnes || []).length, 'fiche client', 'fiches client'),
      n((ex.immeubles || []).length, 'bien', 'biens'),
      n((ex.documents || []).length, 'document reçu', 'documents reçus')
    ];
    return morceaux.join(' · ');
  }

  // ---- « Nouveau dossier » : deux façons de commencer (étude, 02/10 au soir : « deux entrées ») ----
  //  - « Compromis (PDF) » : dates butoir, engagements du vendeur, parties lues dans l'acte ; l'import
  //    fait, on reste sur l'étape 1 : « Compléter depuis Authentic » (facultatif, dossiers ouverts dans
  //    Authentic, celui du compromis d'abord) ou « Continuer sans Authentic » ;
  //  - « Depuis Authentic » : sans PDF — un dossier ouvert dans Authentic (page du dossier, fiches
  //    vendeur, acquéreur, bien) repris d'un clic, puis « Vérifier » (une succession : « Finaliser »).
  // L'ancienne entrée « Dossier Authentic » (Authentic puis le compromis) est retirée.
  var MODES_IMPORT = [
    { cle: 'pdf', icone: 'file-text', titre: 'Compromis (PDF)', sous: 'Puis Authentic pour compléter, si besoin' },
    { cle: 'seul', icone: 'link', titre: 'Depuis Authentic', sous: 'Sans PDF : vente ou succession' }
  ];
  // Aucune entrée choisie au départ (étude 08/10 : « il ne propose pas tout de suite avec ou sans PDF ») : les deux cartes
  // seules, sans zone de dépôt ni « Suivant », jusqu'au choix.
  let modeImport = '';

  function choisirModeImport(mode) {
    if (!MODES_IMPORT.some(m => m.cle === mode)) return;
    if (mode !== 'pdf') { authenticRetenuPourPdf = ''; groupeAuthenticRetenu = null; }
    modeImport = mode;
    renderChoixImport();
    chargerRelevesAuthenticRecents();
  }

  function renderChoixImport() {
    const choix = document.getElementById('import-choix');
    // Mode complément : une seule entrée, le compromis (les dossiers d'Authentic n'ont rien à y faire).
    if (choix) choix.style.display = complementDossierId ? 'none' : '';
    if (choix) {
      choix.innerHTML = MODES_IMPORT.map(m => `<button type="button" class="import-choix-carte${m.cle === modeImport ? ' actif' : ''}" role="radio" aria-checked="${m.cle === modeImport}" onclick="choisirModeImport('${m.cle}')">
          <span class="import-choix-icone" aria-hidden="true">${icone(m.icone)}</span>
          <span class="import-choix-titre">${escapeHtml(m.titre)}</span>
          <span class="import-choix-sous">${escapeHtml(m.sous)}</span>
        </button>`).join('');
    }
    const libelle = document.getElementById('import-libelle');
    const indice = document.getElementById('import-indice');
    const input = document.getElementById('f-pdf');
    const avecAuthentic = !!exportAuthenticActuel;
    const textes = {
      pdf: ['Importer le PDF du compromis', 'PDF du compromis — ou glissez-déposez le fichier ici', 'application/pdf'],
      seul: ['', '', 'application/pdf']
    }[modeImport] || ['', '', 'application/pdf'];
    void avecAuthentic;
    const compromisLu = modeImport === 'pdf' && !!dernierTexteTraite;
    const dComplement = dossierComplementEnCours();
    if (libelle) libelle.textContent = compromisLu ? 'Compromis lu' : (dComplement ? `Importer le compromis de ${libelleDossierAffiche(dComplement)}` : textes[0]);
    if (indice) indice.textContent = compromisLu ? 'Déposez un autre PDF pour le remplacer' : (dComplement ? 'PDF du compromis signé — ou glissez-déposez le fichier ici' : textes[1]);
    if (input) input.setAttribute('accept', textes[2]);
    // Sans compromis : pas de zone de dépôt, seulement les dossiers ouverts dans Authentic.
    const boite = document.getElementById('import-boite');
    if (boite) boite.style.display = modeImport === 'pdf' ? '' : 'none';
    if (boite) boite.classList.toggle('import-boite-lu', compromisLu);
    renderRelevesAuthenticWizard();
    majBoutonSuivantEtape1();
    majStepperWizard();
  }

  // Le bouton de l'étape 1 dit le choix en cours : après le compromis, sans Authentic, on continue sans.
  function majBoutonSuivantEtape1() {
    const bouton = document.getElementById('wizard-suivant-1');
    if (!bouton) return;
    bouton.style.display = modeImport || complementDossierId ? '' : 'none';
    bouton.textContent = modeImport === 'pdf' && dernierTexteTraite && !exportAuthenticActuel && !complementDossierId
      ? 'Continuer sans Authentic →' : 'Suivant : Vérifier →';
  }

  // Pure : les dossiers ouverts dans Authentic classés pour un compromis déjà lu — les plus proches
  // du nom lu dans l'acte d'abord (même score que le rapprochement d'un dossier).
  function groupesAuthenticPourCompromis(groupes, nomLu) {
    const ref = { nom: nomLu || '' };
    return (groupes || []).map((g, i) => ({ g, i, s: nomLu ? scoreDossierAuthentic(g.intitule, '', ref).score : 0 }))
      .sort((a, b) => b.s - a.s || a.i - b.i);
  }

  // Pure : le dossier d'Authentic à proposer pour le compromis lu — le mieux classé s'il correspond aux noms lus, qu'il n'est
  // pas déjà suivi dans CLAIRE, n'est pas une succession, et qu'aucun autre ne correspond aussi bien. Sinon null.
  function dossierAuthenticPourCompromis(tries, correspond, existantDe) {
    const candidats = (tries || []).filter(x => x && x.g && correspond(x.g) && !existantDe(x.g) && !RE_INTITULE_SUCCESSION_AUTHENTIC.test(x.g.intitule || ''));
    if (!candidats.length) return null;
    if (candidats.length > 1 && candidats[1].s === candidats[0].s) return null;
    return candidats[0];
  }

  function renderRelevesAuthenticWizard() {
    const bloc = document.getElementById('authentic-releves');
    if (!bloc) return;
    if (complementDossierId) { bloc.style.display = 'none'; bloc.innerHTML = ''; return; }
    const avecPdf = !!dernierTexteTraite;
    const repris = exportAuthenticActuel && exportAuthenticActuel.origine === 'pages' ? exportAuthenticActuel.intitule : '';
    // Après le compromis : Authentic proposé en complément (même sans dossier ouvert : le dire) ;
    // « Depuis Authentic » : la liste des dossiers ouverts.
    // Dossier retenu par « Créer » (06/10) : compromis lu → appliqué sans clic ; pas encore lu → rappelé sous la zone de dépôt.
    if (authenticRetenuPourPdf && modeImport === 'pdf' && !exportAuthenticActuel) {
      const iRetenu = groupesAuthenticRecents.findIndex(g => g.intitule === authenticRetenuPourPdf);
      if (avecPdf && iRetenu >= 0) { authenticRetenuPourPdf = ''; groupeAuthenticRetenu = null; creerDepuisAuthentic(iRetenu); return; }
      if (!avecPdf) {
        bloc.style.display = '';
        bloc.innerHTML = `<h3 class="authentic-releves-titre">Dossier d’Authentic retenu</h3><ul class="ja-liste">${renderLigneAction({
          titre: libelleDossierParNom(authenticRetenuPourPdf.replace(/^\s*(?:vente|vte)\.?\s+/i, '')),
          sous: 'Déposez le compromis ci-dessus : Authentic pré-remplit, le compromis complète.' + (iRetenu >= 0 ? ' ' + resumeGroupeAuthentic(groupesAuthenticRecents[iRetenu]) : ''),
          categorie: 'acte',
          bouton: iRetenu >= 0 ? { libelle: 'Sans compromis', onclick: `creerDepuisAuthentic(${iRetenu})`, titre: 'Créer le dossier depuis Authentic seul, sans compromis' } : null
        })}</ul>`;
        return;
      }
    }
    const afficher = modeImport === 'seul' || (modeImport === 'pdf' && avecPdf && !exportAuthenticActuel);
    if (!afficher) { bloc.style.display = 'none'; bloc.innerHTML = ''; return; }
    bloc.style.display = '';
    const nomLu = (document.getElementById('f-nom') || {}).value || '';
    const tries = groupesAuthenticPourCompromis(groupesAuthenticRecents, avecPdf ? nomLu : '');
    const titre = modeImport === 'pdf' ? 'Compléter depuis Authentic (facultatif)' : 'Dossiers ouverts dans Authentic';
    // Le dossier Authentic du compromis lu (mêmes noms) est signalé.
    const correspond = (g) => avecPdf && nomLu && scoreDossierAuthentic(g.intitule, '', { nom: nomLu }).score >= SEUIL_DOSSIER_AUTHENTIC;
    const aide = 'Dossiers ouverts dans Authentic aujourd’hui (extension « CLAIRE pour Authentic ») : ouvrez la page du dossier, puis les fiches vendeur, acquéreur et bien — CLAIRE les rassemble. Parties, état civil, bien, cadastre, prix et pièces reçues viennent d’Authentic ; dates butoir et engagements du vendeur, du compromis.';
    // « À créer » (étude, 03/10 : les dossiers vus dans la journée et pas dans CLAIRE, à retrouver ici) : ventes en
    // cours sans dossier, en tête ; le reste dessous, 6 au plus.
    const existantDe = (g) => dossierPourIntituleAuthentic(g.intitule, dossiers, g.adresse, g.reference);
    const aCreer = modeImport === 'seul' ? tries.filter(({ g }) => g.aCreer && !existantDe(g)).slice(0, 12) : [];
    const restants = tries.filter(x => !aCreer.includes(x)).slice(0, 6);
    const ligneGroupe = ({ g, i }) => {
      const existant = existantDe(g);
      const succ = RE_INTITULE_SUCCESSION_AUTHENTIC.test(g.intitule);
      const nom = g.intitule.replace(/^\s*(?:vente|vte|succession|succ)\.?\s+/i, '');
      const estRepris = repris && repris === g.intitule;
      return renderLigneAction({
        titre: succ ? `${PREFIXES_TYPE_AFFAIRE.succession} - ${nom}` : libelleDossierParNom(nom),
        sous: (existant ? 'Déjà suivi dans CLAIRE · ' : '') + (estRepris ? 'Repris · ' : '') + (!existant && correspond(g) ? 'Correspond au compromis · ' : '') + resumeGroupeAuthentic(g),
        delai: g.derniere ? heureAppel(g.derniere) : '',
        categorie: existant || estRepris ? 'neutre' : 'acte',
        bouton: existant
          ? { libelle: 'Ouvrir la fiche', onclick: `ouvrirDossierDepuisDashboard('${escapeOnclickArg(existant.id)}')` }
          : estRepris ? null
            : { libelle: avecPdf && !exportAuthenticActuel ? 'Compléter' : g.aCreer ? 'Créer' : 'Reprendre', onclick: `creerDepuisAuthentic(${i})`, icone: icone('plus') }
      });
    };
    // Compromis lu : le dossier d'Authentic qui lui correspond est PROPOSÉ en tête (étude 05/10 : « proposer un dossier trouvé
    // sur Authentic qui vient pré-remplir tous les champs, puis ceux restant complétés par le compromis »).
    const trouve = dossierAuthenticPourCompromis(tries, correspond, existantDe);
    const autres = trouve ? restants.filter(x => x !== trouve) : restants;
    const blocTrouve = trouve ? `<div class="authentic-trouve">
        <h3 class="authentic-releves-titre">Dossier trouvé dans Authentic ${infoBulle('Ses données (parties, état civil, bien, cadastre, prix, pièces reçues) pré-remplissent le dossier ; le compromis complète ce qui manque (dates butoir, engagements du vendeur, agence, dépôt…).')}</h3>
        <ul class="ja-liste">${renderLigneAction({
          titre: libelleDossierParNom(trouve.g.intitule.replace(/^\s*(?:vente|vte)\.?\s+/i, '')),
          sous: 'Correspond au compromis · ' + resumeGroupeAuthentic(trouve.g),
          delai: trouve.g.derniere ? heureAppel(trouve.g.derniere) : '',
          categorie: 'acte',
          bouton: { libelle: 'Pré-remplir', onclick: `creerDepuisAuthentic(${trouve.i})`, icone: icone('plus') }
        })}</ul>
      </div>` : '';
    const lignesACreer = aCreer.map(ligneGroupe).join('');
    const lignes = autres.map(ligneGroupe).join('');
    bloc.innerHTML = `
      ${blocTrouve}
      ${lignesACreer ? `<h3 class="authentic-releves-titre">À créer <span class="sidebar-compteur">${aCreer.length}</span> ${infoBulle('Dossiers de vente ouverts dans Authentic aujourd’hui qu’aucun dossier de CLAIRE ne porte. « Créer » ouvre le dossier pré-rempli.')}</h3><ul class="ja-liste">${lignesACreer}</ul>` : ''}
      <h3 class="authentic-releves-titre">${escapeHtml(lignesACreer || trouve ? 'Autres dossiers ouverts dans Authentic' : titre)} ${infoBulle(aide)}</h3>
      ${lignes ? `<ul class="ja-liste">${lignes}</ul>` : `<p class="authentic-releves-vide">Aucun ${lignesACreer ? 'autre ' : ''}dossier ouvert dans Authentic aujourd’hui. Ouvrez-y la page du dossier, puis les fiches vendeur, acquéreur et bien : il apparaîtra ici${modeImport === 'pdf' ? ' — ou continuez sans Authentic' : ''}.</p>`}`;
  }

  function creerDepuisAuthentic(i, confirme) {
    const g = groupesAuthenticRecents[i];
    if (!g) return;
    const donnees = g.export;
    // Une succession n'a pas d'acte initial : toujours reprise « seule » (parties et biens).
    const succession = typeAffaireAuthentic(donnees) === 'succession';
    // Un avant-contrat déjà lu : Authentic le complète (parties, bien, téléphones, pièces) — quelle que soit la carte choisie
    // ensuite (relecture 13/10 : « Compléter » depuis la carte « Depuis Authentic » effaçait le compromis lu).
    if (!succession && dernierTexteTraite && !exportAuthenticActuel) {
      modeImport = 'pdf';
      exportAuthenticActuel = donnees;
      recalculerExtractionRegex();
      appliquerTypeVenteAuthentic(donnees);
      afficherImportAuthentic(donnees, 'dates butoir et engagements lus dans le compromis déposé.');
      renderChoixImport();
      definirEtapeWizard(2);
      return;
    }
    // Reprise d'un AUTRE dossier d'Authentic alors qu'un compromis est lu : il serait oublié — on le demande.
    if (dernierTexteTraite && !confirme) {
      demanderConfirmation('Reprendre ce dossier d’Authentic ? Le compromis déjà lu et le dossier d’Authentic repris seront oubliés.', () => creerDepuisAuthentic(i, true));
      return;
    }
    reinitialiserFormulaire();
    // Après la remise à zéro (relecture 13/10 : posé avant, le mode était effacé — une succession recevait le message d'une vente
    // et « ← Précédent » ne montrait plus aucune entrée) : sans compromis, c'est une reprise « Depuis Authentic ».
    modeImport = 'seul';
    exportAuthenticActuel = donnees;
    compromisNomFichierImporte = '';
    correctionsRevision = {};
    verificationsRevision = {};
    frontieresPagesActuelles = null;
    recalculerExtractionRegex();
    majProgression(-1);
    appliquerTypeVenteAuthentic(donnees);
    // Sans compromis (« Dossier Authentic seul ») : directement à « Vérifier ».
    afficherImportAuthentic(donnees, succession ? 'succession : parties et biens repris d’Authentic.' : 'sans compromis : dates butoir à saisir si besoin.');
    renderChoixImport();
    definirEtapeWizard(2);
  }

  // Un appel ouvert par l'adresse « #appel=… » (onglet que 3CX a ouvert, fenêtre CLAIRE absente).
  async function ouvrirAppelDepuisAdresse() {
    const m = /(?:^|[#&])appel=([\w-]+)/.exec(location.hash || '');
    if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* adresse gardée */ }
    try {
      const r = await fetchAvecAuth('/api/appels?id=' + encodeURIComponent(m[1]));
      if (!r.ok) return;
      const { appels } = await r.json();
      if (appels && appels[0]) montrerAppelEntrant(appels[0], true);
    } catch (e) { /* rien à montrer */ }
  }

  function montrerAppelEntrant(appel, ouvrir) {
    if (!appel || appelsMontres.has(appel.id)) return;
    appelsMontres.add(appel.id);
    for (const x of appel.dossiers || []) delete appelsParDossier[x.id];
    appelEntrant = appel;
    renderAppelEntrant();
    programmerFermetureAppelEntrant(DUREE_BANDEAU_APPEL_MS);
    const d = ouvrir ? dossierAOuvrirPourAppel(appel, dossiers) : null;
    // Jamais pendant une saisie : la fiche s'ouvrira d'un clic sur le bandeau.
    const saisie = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (d && !saisie) ouvrirFicheAppel(d.id);
  }

  function ouvrirFicheAppel(id) {
    ouvrirDossierDepuisDashboard(id);
    try { definirOngletFiche('echanges'); } catch (e) { /* onglet par défaut */ }
  }

  function fermerAppelEntrant() {
    appelEntrant = null;
    clearTimeout(minuteurAppelEntrant);
    const el = document.getElementById('appel-entrant');
    if (el) el.remove();
  }

  function renderAppelEntrant() {
    const a = appelEntrant;
    let el = document.getElementById('appel-entrant');
    if (!a) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'appel-entrant';
      el.className = 'appel-entrant';
      el.setAttribute('role', 'status');
      el.addEventListener('mouseenter', () => clearTimeout(minuteurAppelEntrant));
      el.addEventListener('mouseleave', () => programmerFermetureAppelEntrant(DUREE_BANDEAU_APPEL_APRES_SURVOL_MS));
      document.body.appendChild(el);
    }
    const ds = dossiersDeLAppel(a, dossiers);
    const contact = a.contact && a.contact.libelle ? `<p class="appel-entrant-contact">${escapeHtml(a.contact.type === 'confrere' ? 'Confrère : ' : '')}${escapeHtml(a.contact.libelle)}</p>` : '';
    el.innerHTML = `
      <div class="appel-entrant-tete">
        <span class="appel-entrant-icone">${icone('phone')}</span>
        <span class="appel-entrant-titre"><b>Appel entrant</b><span>${escapeHtml(heureAppel(a.t))}</span></span>
        <button type="button" class="appel-entrant-fermer" onclick="fermerAppelEntrant()" aria-label="Fermer">${icone('x')}</button>
      </div>
      <p class="appel-entrant-numero">${escapeHtml(a.numero || 'Numéro masqué')}${a.nom ? ` · ${escapeHtml(a.nom)}` : ''}${liensAppelTelephone(a.numero, 'coord-appel coord-appel-inline')}</p>
      ${contact}
      ${ds.length ? `<div class="appel-entrant-dossiers">${ds.slice(0, 4).map(y => `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="ouvrirFicheAppel('${y.d.id}'); fermerAppelEntrant()">${y.partie ? `<span class="appel-entrant-partie">${escapeHtml(y.partie)}</span>` : ''}${escapeHtml(libelleDossierAffiche(y.d))}${y.d.archive ? ' · archivé' : ''}</wa-button>`).join('')}</div>`
        : (contact ? '' : `<p class="hint">Numéro inconnu de CLAIRE ${infoBulle('Saisissez-le sur la fiche du dossier (coordonnées du vendeur ou de l’acquéreur, en tête de fiche) : le prochain appel ouvrira la fiche.')}</p>`)}`;
  }

  // Coordonnées des parties sur une ligne par partie (étude, 02/10 : « les emails et téléphones dès
  // la première page de la fiche » et, dans Échanges, « sur la même ligne, ça prend moins de place »).
  // Pure : ce qu'on montre pour chaque partie — l'email est remplacé par « Par son notaire » quand un
  // autre office la représente (déontologie, voir renderEmailAcquereurDossier).
  // Vendeur accompagné par son propre notaire (étude 06/10) : ni son email ni son téléphone sur la fiche — on écrit au confrère
  // (ligne « Tél. confrère », `d.emailConfrereVendeur`) ; les valeurs restent sur le dossier, seulement masquées.
  function coordonneesPartiesDossier(d) {
    return [
      { partie: 'vendeur', libelle: 'Vendeur', email: d.emailVendeur || '', tel: d.telephoneVendeur || '',
        parNotaire: confrereRepresenteVendeur(d) && !d.emailVendeur, represente: !!confrereRepresenteVendeur(d), changerEmail: 'changerEmailVendeur' },
      { partie: 'acquereur', libelle: 'Acquéreur', email: d.emailAcquereur || '', tel: d.telephoneAcquereur || '',
        parNotaire: !!notaireParticipantRepresenteAcquereur(d) && !d.emailAcquereur, represente: !!notaireParticipantRepresenteAcquereur(d), changerEmail: 'changerEmailAcquereur' }
    ].filter(c => !(c.partie === 'vendeur' && c.represente));
  }

  // Les deux champs (email, téléphone) d'une partie, côte à côte ; `prefixe` distingue les deux
  // endroits où ils s'affichent en même temps (fiche, onglet Échanges).
  function champsCoordonneesPartie(d, c, prefixe) {
    const entree = `onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"`;
    const email = c.parNotaire
      ? `<span class="prop-texte vide" title="Un autre office représente cette partie : on écrit à son notaire.">Par son notaire</span>`
      : `<input type="email" id="${prefixe}-email-${c.partie}-${d.id}" class="prop-champ coord-email" value="${escapeAttr(c.email)}" placeholder="Email" aria-label="Email ${c.libelle === 'Vendeur' ? 'du vendeur' : 'de l’acquéreur'}" onblur="${c.changerEmail}('${d.id}', this.value)" ${entree}>`;
    const tel = `<input type="tel" id="${prefixe}-tel-${c.partie}-${d.id}" class="prop-champ coord-tel" value="${escapeAttr(c.tel)}" placeholder="Téléphone" autocomplete="off" aria-label="Téléphone ${c.libelle === 'Vendeur' ? 'du vendeur' : 'de l’acquéreur'}" title="Reconnu quand il appelle (3CX). Plusieurs numéros : séparés par « / »." onblur="changerTelephoneDossier('${d.id}', '${c.partie}', this.value)" ${entree}>`;
    // Représentée par un autre office (étude 05/10) : pas de champ téléphone — c'est celui du confrère, sur sa ligne « Tél. confrère » ;
    // un numéro déjà saisi reste visible (rien n'est caché).
    if (c.represente && !c.tel) return `<span class="coord-paire">${email}</span>`;
    return `<span class="coord-paire">${email}<span class="coord-tel-ligne">${tel}${liensAppelTelephone(c.tel)}</span></span>`;
  }

  function changerTelephoneDossier(id, partie, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const champ = partie === 'vendeur' ? 'telephoneVendeur' : 'telephoneAcquereur';
    const nouveau = String(valeur || '').trim().slice(0, 120);
    if (nouveau === (d[champ] || '')) return;
    d[champ] = nouveau;
    ajouterHistorique(d, `Téléphone ${partie === 'vendeur' ? 'du vendeur' : 'de l’acquéreur'} : ${nouveau || '—'}`);
    sauvegarder(d);
    render();
  }

  // Fiche › Échanges : les appels reçus de ce dossier (journal du serveur, chargé à l'affichage).
  function renderAppelsDossier(d) {
    if (!(d.id in appelsParDossier)) { chargerAppelsDossier(d.id); return ''; }
    const liste = appelsParDossier[d.id];
    if (!liste || !liste.length) return '';
    const ligne = (a) => {
      const x = (a.dossiers || []).find(y => y.id === d.id);
      return `<li><span class="appels-quand">${escapeHtml(dateHeureAppel(a.t))}</span><span>${escapeHtml(x ? LIBELLES_PARTIE_APPEL[x.partie] || '' : '')}${a.nom ? ` · ${escapeHtml(a.nom)}` : ''}</span><span class="appels-numero">${escapeHtml(a.numero || '')}${liensAppelTelephone(a.numero, 'coord-appel coord-appel-inline')}</span></li>`;
    };
    return `<div class="appels-dossier">
        <span class="section-eyebrow">Appels reçus <span class="jour-onglet-nb">${liste.length}</span></span>
        <ul class="appels-liste">${liste.slice(0, 4).map(ligne).join('')}</ul>
        ${liste.length > 4 ? `<details class="appels-plus"><summary>${liste.length - 4} de plus</summary><ul class="appels-liste">${liste.slice(4).map(ligne).join('')}</ul></details>` : ''}
      </div>`;
  }

  async function chargerAppelsDossier(id) {
    appelsParDossier[id] = null;
    try {
      const r = await fetchAvecAuth('/api/appels?dossierId=' + encodeURIComponent(id));
      if (!r.ok) return;
      const { appels } = await r.json();
      appelsParDossier[id] = appels || [];
      if (appelsParDossier[id].length) render();
    } catch (e) { /* réessayé à la prochaine ouverture */ }
  }

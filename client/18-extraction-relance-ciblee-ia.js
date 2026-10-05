

  // ---- gestion des échéances "Autre" ----

  function ajouterAutre(iso) {
    compteurAutre++;
    let page = null;
    let labelSuggere = '';
    if (iso) {
      const item = detectedDates.find(d => d.iso === iso);
      if (item) {
        // Voir le commentaire équivalent dans assignerDate() : mémorisé seulement si le clic
        // change réellement la catégorie devinée.
        if (item.suggestion !== 'autre') memoriserCorrection(item.contexte, 'autre', libelleAutreSuggere(item.contexte) || null);
        item.suggestion = 'autre';
        item.active = true;
        page = item.page;
        labelSuggere = item.libelleAppris || libelleAutreSuggere(item.contexte);
      }
    }
    autresEnCours.push({ id: 'autre-' + compteurAutre, label: labelSuggere, iso: iso || '', active: true, page });
    renderAutres();
    renderChips();
  }

  function ajouterAutreVide() {
    ajouterAutre('');
  }

  function majAutreLabel(id, valeur) {
    const item = autresEnCours.find(a => a.id === id);
    if (item) item.label = valeur;
  }

  function majAutreDate(id, valeur) {
    const item = autresEnCours.find(a => a.id === id);
    if (item) item.iso = valeur;
  }

  function toggleAutreActive(id, actif) {
    const item = autresEnCours.find(a => a.id === id);
    if (item) item.active = actif;
    renderAutres();
  }

  function supprimerAutre(id) {
    autresEnCours = autresEnCours.filter(a => a.id !== id);
    renderAutres();
  }

  function renderAutres() {
    const container = document.getElementById('autres-list');
    container.innerHTML = autresEnCours.map(item => `
      <div class="date-block autre${item.active ? '' : ' inactive'}">
        <div class="autre-row">
          <wa-switch class="switch" ${item.active ? 'checked' : ''} onchange="toggleAutreActive('${item.id}', this.checked)"></wa-switch>
          <input type="text" placeholder="Nom de l'échéance (ex. Levée de la condition suspensive travaux)" value="${escapeHtml(item.label)}" oninput="majAutreLabel('${item.id}', this.value)">
          <input type="date" value="${item.iso}" onchange="majAutreDate('${item.id}', this.value)">
          <button type="button" class="icon-btn" onclick="supprimerAutre('${item.id}')">Retirer</button>
        </div>
      </div>
    `).join('');
  }

  function reinitialiserFormulaire() {
    masquerErreurFormulaire();
    exportAuthenticActuel = null;
    complementDossierId = null;
    choixComplement = {};
    complementFichierNas = '';
    majEnteteComplement();
    majPiecesAuthentic();
    // Périme tout enrichissement IA encore en vol depuis l'import précédent (voir
    // lancerExtractionIa) : sans ça, sa réponse pourrait arriver après ce reset et remplir des
    // champs pourtant vidés pour un tout nouvel import.
    generationImportActuel++;
    compromisNomFichierImporte = '';
    document.getElementById('f-nom').value = '';
    document.getElementById('f-responsable').value = utilisateurPoste || '';
    document.getElementById('f-type-vente').value = 'maison';
    document.getElementById('f-role-notaire').value = 'instrumentaire';
    document.getElementById('f-cote-instrumentaire').value = '';
    majApercuPieces();
    document.getElementById('f-email-acquereur').value = '';
    document.getElementById('f-email-vendeur').value = '';
    document.getElementById('f-notaire-vendeur').value = '';
    document.getElementById('f-notaire-acquereur').value = '';
    document.getElementById('f-cote-instrumentaire').value = '';
    remplirListeNotairesWizard([]);
    document.getElementById('f-nom-agence').value = '';
    document.getElementById('f-adresse-bien').value = '';
    document.getElementById('f-prix-vente').value = '';
    document.getElementById('f-prix-mobilier').value = '';
    document.getElementById('f-honoraires-agence').value = '';
    document.getElementById('f-depot-garantie').value = '';
    document.getElementById('f-sequestre-depot').value = '';
    document.getElementById('f-pret').value = '';
    document.getElementById('f-acte').value = '';
    // Oubli corrigé au passage : ce champ n'était vidé que par toggleEcheance('ventebien', false).
    // Sans ça, valeursAppliquees le croirait modifié à la main au prochain import.
    document.getElementById('f-ventebien').value = '';
    document.getElementById('f-pdf').value = '';
    document.getElementById('pdf-status').textContent = '';
    document.getElementById('pdf-status').className = 'pdf-status';
    document.getElementById('compromis-info').style.display = 'none';
    document.getElementById('f-date-compromis').style.display = 'none';
    document.getElementById('cash-note').style.display = 'none';
    definirEcheanceActive('pret', true);
    definirEcheanceActive('acte', true);
    definirEcheanceActive('ventebien', false);
    dateCompromisDetectee = '';
    dateCompromisEstimee = false;
    dernierTexteTraite = '';
    detectedDates = [];
    autresEnCours = [];
    analyseJuridiqueActuelle = { documents: [], engagements: [] };
    extractionActuelle = null;
    valeursAppliquees = {};
    correctionsRevision = {};
    verificationsRevision = {};
    originesDossierWizard = {};
    renderPanneauRevision(null);
    afficherAnalyseJuridique();
    masquerBoutonAjoutEngagement();
    masquerFormAjoutEngagementManuel();
    // Referme entièrement le panneau d'aperçu : sans ça, le PDF du dossier qu'on vient d'enregistrer
    // restait affiché à côté d'un formulaire pourtant vide, prêt pour un nouvel import.
    document.getElementById('pdf-viewer').style.display = 'none';
    document.getElementById('pdf-viewer-title').textContent = 'Aperçu du compromis';
    document.getElementById('pdf-pages-container').innerHTML = '';
    document.getElementById('nouveau-intro').style.display = 'flex';
    reinitialiserRecherchePdf();
    pdfActuel = null;
    pdfDernierePageUtile = 1;
    frontieresPagesActuelles = null;
    reinitialiserRappelsParDefaut();
    renderChips();
    renderAutres();
    definirEtapeWizard(1);
  }

  // Les cases de rappel gardaient l'état du dossier précédent : on les remet explicitement sur
  // les valeurs par défaut (15 et 7 jours avant) à chaque nouveau dossier.
  const RAPPELS_PAR_DEFAUT = ['15', '7'];

  function reinitialiserRappelsParDefaut() {
    document.querySelectorAll('#reminder-days input[type="checkbox"]').forEach(box => {
      box.checked = RAPPELS_PAR_DEFAUT.includes(box.value);
    });
  }

  function getSelectedReminderDays() {
    const boxes = document.querySelectorAll('#reminder-days input[type="checkbox"]');
    const days = [];
    boxes.forEach(b => { if (b.checked) days.push(parseInt(b.value, 10)); });
    return days.sort((a, b) => b - a);
  }

  // La date de signature de l'avant-contrat lue (ou corrigée) dans l'assistant, sinon null.
  function dateAvantContratWizard() {
    const sig = extractionActuelle && extractionActuelle.dates && extractionActuelle.dates.SIGNATURE_AVANT_CONTRAT;
    const v = (sig && sig.valeur) || dateCompromisDetectee || '';
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }

  // Création en cours (étude, 02/10 : « il a créé deux dossiers ») : un second clic, ou Ctrl+S, pendant
  // que le serveur enregistre ne crée pas un second dossier.
  var creationDossierEnCours = false;

  // Pure : un dossier en cours déjà présent pour une création — même référence Authentic (« A 2026 00247 »),
  // ou même nom (sans accents ni casse). Jamais par le rang « 1 » de « 1 - Vente … » (étude, 03/10 : « Créer
  // un second dossier ? DORLÉAC existe déjà » pour MERCIER). null sinon.
  function dossierDejaPresentPourCreation(nom, reference, liste) {
    const cle = normaliserPourRecherche(String(nom || '').trim());
    const ref = referenceAuthenticValide(reference) ? reference : '';
    return (liste || []).find(x => x && !x.deleted && !x.archive && (
      (ref && x.referenceAuthentic === ref)
      || (cle && normaliserPourRecherche(String(x.nom || '').trim()) === cle))) || null;
  }

  // ---- Compléter un dossier existant avec son compromis (étude, 03/10 : « Authentic crée le dossier, le
  // compromis le complète ») ----
  // Un dossier créé depuis Authentic (parties, bien, cadastre) ou saisi à la main n'a ni échéance (prêt, vente
  // préalable, date butoir), ni engagements du vendeur, ni dépôt de garantie : tout cela ne vient que du
  // compromis. Le même assistant « Nouveau dossier » relit le compromis en mode COMPLÉMENT : rien n'est créé,
  // le dossier visé est complété — un champ vide reçoit la valeur lue ; un champ déjà rempli n'est JAMAIS
  // remplacé en silence : les deux valeurs sont montrées, l'étude choisit, la fiche l'emporte par défaut.
  // Entrées : la fiche (« Compléter » sur la ligne Avant-contrat, compromis du NAS proposé), ou « Nouveau
  // dossier » quand le compromis déposé désigne un dossier déjà présent (« Compléter » au lieu d'un doublon).
  let complementDossierId = null;
  let choixComplement = {};
  let complementFichierNas = '';

  // Clés du panneau comparées fiche / compromis (le type d'acte et le responsable ne viennent pas du compromis).
  var CLES_COMPLEMENT = ['nom', 'typeVente', 'signature', 'pret', 'acte', 'ventebien', 'adresseBien', 'prixVente', 'prixMobilier',
    'emailAcquereur', 'emailVendeur', 'nomAgence', 'honorairesAgence', 'depotGarantie', 'sequestreDepot', 'notaireVendeur', 'notaireAcquereur',
    'coteInstrumentaire', 'roleNotaire'];
  var CLES_COMPLEMENT_FUSION = ['emailAcquereur', 'emailVendeur'];

  function libelleCleComplement(cle) {
    const def = CHAMPS_REVISION.find(c => c.cle === cle);
    return def ? def.libelle : cle;
  }

  // Pure : les valeurs de la fiche, par clé du panneau ('' quand vide).
  function valeursFicheComplement(d) {
    const x = d || {};
    const nombre = (v) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : '';
    return {
      nom: x.nom || '', typeVente: x.typeVente || 'maison', signature: x.dateAvantContrat || '',
      pret: x.sansPret ? '' : (x.pret || ''), acte: x.acte || '', ventebien: x.ventebien || '',
      adresseBien: x.adresseBien ? normaliserAdresse(x.adresseBien) : '',
      prixVente: nombre(x.prixVente), prixMobilier: nombre(x.prixMobilier),
      emailAcquereur: x.emailAcquereur || '', emailVendeur: x.emailVendeur || '', nomAgence: x.nomAgence || '',
      honorairesAgence: nombre(x.honoraires && !x.honoraires.direct ? x.honoraires.montantTTC : null),
      depotGarantie: nombre(x.depotGarantie), sequestreDepot: x.sequestreDepot || '',
      notaireVendeur: x.notaireVendeur || '', notaireAcquereur: x.notaireAcquereur || '',
      coteInstrumentaire: x.coteInstrumentaire || '', roleNotaire: x.roleNotaire || 'instrumentaire'
    };
  }

  // Pure : deux valeurs d'une même clé disent-elles la même chose ? (montants en nombre, dates ISO, texte sans
  // accents ni casse, adresses normalisées, emails ensemble par ensemble).
  function memeValeurComplement(cle, a, b) {
    const vide = (v) => v === null || v === undefined || v === '';
    if (vide(a) && vide(b)) return true;
    if (vide(a) || vide(b)) return false;
    if (['prixVente', 'prixMobilier', 'depotGarantie', 'honorairesAgence'].includes(cle)) return Number(a) === Number(b);
    if (cle === 'adresseBien') return normaliserPourRecherche(normaliserAdresse(a)) === normaliserPourRecherche(normaliserAdresse(b));
    if (CLES_COMPLEMENT_FUSION.includes(cle)) {
      const ens = (v) => emailsDepuisTexte(v).map(e => e.toLowerCase()).sort().join(';');
      return ens(a) === ens(b);
    }
    return normaliserPourRecherche(String(a)).replace(/\s+/g, ' ').trim() === normaliserPourRecherche(String(b)).replace(/\s+/g, ' ').trim();
  }

  // Pure : la comparaison fiche / compromis, une ligne par clé → { cle, libelle, fiche, lu, etat } avec etat :
  // 'identique', 'different', 'fiche-seule' (rien lu), 'lu-seul' (fiche vide), 'fusion' (emails : les deux gardés).
  function comparaisonComplement(fiche, lu) {
    const f = fiche || {}, l = lu || {};
    const vide = (v) => v === null || v === undefined || v === '';
    return CLES_COMPLEMENT.map(cle => {
      const a = vide(f[cle]) ? '' : f[cle], b = vide(l[cle]) ? '' : l[cle];
      let etat;
      if (a === '' && b === '') etat = 'vide';
      else if (a === '') etat = 'lu-seul';
      else if (b === '') etat = 'fiche-seule';
      else if (memeValeurComplement(cle, a, b)) etat = 'identique';
      else etat = CLES_COMPLEMENT_FUSION.includes(cle) ? 'fusion' : 'different';
      return { cle, libelle: libelleCleComplement(cle), fiche: a, lu: b, etat };
    }).filter(x => x.etat !== 'vide');
  }

  // Pure : ce que retient le complément — { resolu: { cle: valeur }, changements: [{ cle, libelle, avant, apres }] }.
  // Fiche vide → valeur lue ; valeurs différentes → la fiche, sauf choix « compromis » ; emails → les deux.
  function resolutionComplement(comparaison, choix) {
    const c = choix || {};
    const resolu = {}, changements = [];
    (comparaison || []).forEach(x => {
      let v = x.fiche;
      if (x.etat === 'lu-seul') v = x.lu;
      else if (x.etat === 'fusion') v = fusionnerEmailsTexte(x.fiche, [x.lu]);
      else if (x.etat === 'different' && c[x.cle] === 'compromis') v = x.lu;
      resolu[x.cle] = v;
      if (!memeValeurComplement(x.cle, v, x.fiche)) changements.push({ cle: x.cle, libelle: x.libelle, avant: x.fiche, apres: v });
    });
    return { resolu, changements };
  }

  // Pure : une valeur lisible pour une clé du panneau.
  function texteValeurComplement(cle, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (['signature', 'pret', 'acte', 'ventebien'].includes(cle)) return formatDateFr(v);
    if (['prixVente', 'prixMobilier', 'depotGarantie', 'honorairesAgence'].includes(cle)) return formaterPrix(Number(v));
    if (cle === 'typeVente') return { maison: 'Maison', copropriete: 'Copropriété', terrain: 'Terrain à bâtir' }[v] || String(v);
    if (cle === 'coteInstrumentaire') return { vendeur: 'Notaire du vendeur', acquereur: 'Notaire de l’acquéreur' }[v] || String(v);
    if (cle === 'roleNotaire') return { instrumentaire: 'Instrumentaire', participant: 'Participant' }[v] || String(v);
    return String(v);
  }

  // Pure (modifie le dossier passé) : applique le complément — valeurs retenues et ce que seul le compromis
  // apporte (engagements, échéances personnalisées, parties, pages, instantané de lecture). Rien de ce que la
  // fiche porte déjà n'est écrasé hors `resolu`. → les libellés de ce qui a changé (historique).
  function appliquerComplementSurDossier(d, resolu, extras) {
    if (!d) return [];
    const r = resolu || {}, e = extras || {};
    const avant = valeursFicheComplement(d);
    const textes = [];
    const pose = (cle, affecter) => {
      if (!(cle in r)) return;
      if (memeValeurComplement(cle, r[cle], avant[cle])) return;
      affecter(r[cle]);
      textes.push(libelleCleComplement(cle).toLowerCase());
    };
    pose('nom', v => { d.nom = v; });
    pose('typeVente', v => { d.typeVente = v; });
    pose('signature', v => { d.dateAvantContrat = v || null; });
    ['pret', 'acte', 'ventebien'].forEach(t => pose(t, v => {
      d[t] = v || '';
      d[t + 'Page'] = v ? ((e.pages || {})[t] || null) : null;
      d.confiance = Object.assign({}, d.confiance || {}, { [t]: v ? ((e.confiance || {})[t] || 'manuel') : null });
      if (t === 'pret' && v) d.sansPret = false;
    }));
    pose('adresseBien', v => { d.adresseBien = v ? normaliserAdresse(v) : ''; });
    pose('prixVente', v => { d.prixVente = v ? Number(v) : null; });
    pose('prixMobilier', v => { d.prixMobilier = v ? Number(v) : null; });
    pose('emailAcquereur', v => { d.emailAcquereur = v || ''; });
    pose('emailVendeur', v => { d.emailVendeur = v || ''; });
    pose('nomAgence', v => { d.nomAgence = v || ''; });
    pose('honorairesAgence', v => { d.honoraires = honorairesAvecMontantFormulaire(d.honoraires || (e.instantane && e.instantane.honoraires) || null, v ? Number(v) : null, d.nomAgence); });
    pose('depotGarantie', v => { d.depotGarantie = v ? Number(v) : null; });
    pose('sequestreDepot', v => { d.sequestreDepot = v || ''; });
    pose('notaireVendeur', v => { d.notaireVendeur = v || ''; });
    pose('notaireAcquereur', v => { d.notaireAcquereur = v || ''; });
    pose('coteInstrumentaire', v => { d.coteInstrumentaire = v || ''; });
    pose('roleNotaire', v => { d.roleNotaire = v || 'instrumentaire'; });
    // Achat sans prêt lu dans le compromis, fiche sans date de prêt : l'échéance est retirée du planning.
    if (!d.pret && e.sansPret && !d.sansPret) { d.sansPret = true; textes.push('achat sans prêt'); }
    if (d.pret && !d.sansPret && !(Array.isArray(d.reminderDays) && d.reminderDays.length) && Array.isArray(e.reminderDays) && e.reminderDays.length) d.reminderDays = e.reminderDays.slice();
    // Échéances personnalisées : ajoutées, jamais en double (même libellé et même date).
    const autresAvant = Array.isArray(d.autres) ? d.autres : [];
    const nouvellesAutres = (e.autres || []).filter(a => a && a.date && !autresAvant.some(x => x && x.date === a.date && normaliserPourRecherche(x.label || '') === normaliserPourRecherche(a.label || '')));
    if (nouvellesAutres.length) { d.autres = autresAvant.concat(nouvellesAutres); textes.push(`${nouvellesAutres.length} échéance${nouvellesAutres.length > 1 ? 's' : ''} personnalisée${nouvellesAutres.length > 1 ? 's' : ''}`); }
    // Engagements du vendeur et documents identifiés : ajoutés à ce que la fiche a déjà.
    const cleAnalyse = (x) => normaliserPourRecherche(String((x && (x.phrase || x.libelle || x.label || x.nom)) || '')).slice(0, 160);
    const an = e.analyse || {};
    d.analyseJuridique = d.analyseJuridique && typeof d.analyseJuridique === 'object' ? d.analyseJuridique : { documents: [], engagements: [] };
    d.analyseJuridique.engagements = Array.isArray(d.analyseJuridique.engagements) ? d.analyseJuridique.engagements : [];
    d.analyseJuridique.documents = Array.isArray(d.analyseJuridique.documents) ? d.analyseJuridique.documents : [];
    const engAjoutes = (an.engagements || []).filter(x => cleAnalyse(x) && !d.analyseJuridique.engagements.some(y => cleAnalyse(y) === cleAnalyse(x)));
    const docAjoutes = (an.documents || []).filter(x => cleAnalyse(x) && !d.analyseJuridique.documents.some(y => cleAnalyse(y) === cleAnalyse(x)));
    if (engAjoutes.length) { d.analyseJuridique.engagements = d.analyseJuridique.engagements.concat(engAjoutes); textes.push(`${engAjoutes.length} engagement${engAjoutes.length > 1 ? 's' : ''} du vendeur`); }
    if (docAjoutes.length) d.analyseJuridique.documents = d.analyseJuridique.documents.concat(docAjoutes);
    const piecesEng = (e.piecesEngagements || []).filter(c => c && !(d.piecesEngagementsDetectees || []).includes(c));
    if (piecesEng.length) d.piecesEngagementsDetectees = (d.piecesEngagementsDetectees || []).concat(piecesEng);
    // Ce que seule la lecture de l'acte sait, gardé quand la fiche n'en a pas (Authentic reste prioritaire).
    const inst = e.instantane || null;
    if (inst) {
      if (!(Array.isArray(d.parties) && d.parties.length) && (inst.parties || []).length) { d.parties = inst.parties; textes.push('parties'); }
      if ((!d.typeActe || d.typeActe.valeur === 'INCONNU') && inst.typeActe && inst.typeActe.valeur !== 'INCONNU') d.typeActe = inst.typeActe;
      if (!d.notaires && inst.notaires) d.notaires = inst.notaires;
      if (!d.bien && inst.bien) d.bien = inst.bien;
      if (!d.extraction && inst.extraction) d.extraction = inst.extraction;
      if (!d.honoraires && inst.honoraires) { d.honoraires = inst.honoraires; textes.push('honoraires de négociation'); }
      if (!d.fondsTravaux && inst.fondsTravaux) { d.fondsTravaux = inst.fondsTravaux; textes.push('fonds de travaux'); }
    }
    const detectes = (e.notairesDetectes || []).filter(n => n && n.nom && !(d.notairesDetectes || []).some(x => x && x.nom === n.nom));
    if (detectes.length) d.notairesDetectes = (d.notairesDetectes || []).concat(detectes);
    const tel = e.telephones || {};
    if (tel.acquereur) { const f = fusionnerTelephonesTexte(d.telephoneAcquereur, [tel.acquereur]); if (f !== (d.telephoneAcquereur || '')) { d.telephoneAcquereur = f; textes.push('téléphone de l’acquéreur'); } }
    if (tel.vendeur) { const f = fusionnerTelephonesTexte(d.telephoneVendeur, [tel.vendeur]); if (f !== (d.telephoneVendeur || '')) { d.telephoneVendeur = f; textes.push('téléphone du vendeur'); } }
    if (!d.compromisNomFichier && e.compromisNomFichier) d.compromisNomFichier = e.compromisNomFichier;
    if (!d.pdfNumPages && e.pdfNumPages) d.pdfNumPages = e.pdfNumPages;
    return textes;
  }

  // Les valeurs que l'assistant a lues (et que l'étude a pu corriger dans le panneau), par clé du panneau.
  function valeursLuesComplement() {
    const val = (id) => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    const nombre = (id) => { const n = eurosDepuisSaisie(val(id)); return Number.isFinite(n) && n > 0 ? n : ''; };
    return {
      nom: val('f-nom'), typeVente: val('f-type-vente') || 'maison', signature: dateAvantContratWizard() || '',
      pret: echeanceActive.pret ? val('f-pret') : '', acte: echeanceActive.acte ? val('f-acte') : '', ventebien: echeanceActive.ventebien ? val('f-ventebien') : '',
      adresseBien: val('f-adresse-bien') ? normaliserAdresse(val('f-adresse-bien')) : '',
      prixVente: nombre('f-prix-vente'), prixMobilier: nombre('f-prix-mobilier'),
      emailAcquereur: val('f-email-acquereur'), emailVendeur: val('f-email-vendeur'), nomAgence: val('f-nom-agence'),
      honorairesAgence: nombre('f-honoraires-agence'), depotGarantie: nombre('f-depot-garantie'), sequestreDepot: val('f-sequestre-depot'),
      notaireVendeur: completerNomNotaire(val('f-notaire-vendeur'), carnetConfreres), notaireAcquereur: completerNomNotaire(val('f-notaire-acquereur'), carnetConfreres),
      coteInstrumentaire: ['vendeur', 'acquereur'].includes(val('f-cote-instrumentaire')) ? val('f-cote-instrumentaire') : '',
      roleNotaire: val('f-role-notaire') || ''
    };
  }

  // Tout ce que seul le compromis apporte, pris dans l'état de l'assistant.
  function extrasComplementWizard() {
    const confiance = {};
    ['pret', 'acte', 'ventebien'].forEach(t => {
      confiance[t] = !pageParType[t] ? 'manuel' : approxParType[t] ? 'estime' : ambiguiteParType[t] ? 'incertain' : 'auto';
    });
    const cotes = cotesNotairesPourDossier(extractionActuelle ? extractionActuelle.notaires : null);
    const ch = (extractionActuelle && extractionActuelle.champs) || {};
    return {
      pages: Object.assign({}, pageParType), confiance,
      autres: autresEnCours.filter(a => a.active && a.iso).map(a => ({ label: a.label.trim() || 'Autre échéance', date: a.iso, page: a.page || null })),
      analyse: { documents: analyseJuridiqueActuelle.documents.slice(), engagements: analyseJuridiqueActuelle.engagements.slice() },
      piecesEngagements: analyseJuridiqueActuelle.documents.map(doc => doc.cleChecklist).filter(Boolean),
      instantane: instantaneExtraction(extractionActuelle),
      notairesDetectes: cotes.detectes,
      telephones: { acquereur: (ch.telephoneAcquereur && ch.telephoneAcquereur.valeur) || '', vendeur: (ch.telephoneVendeur && ch.telephoneVendeur.valeur) || '' },
      compromisNomFichier: compromisNomFichierImporte || '', pdfNumPages: pdfDernierePageUtile,
      sansPret: !echeanceActive.pret, reminderDays: getSelectedReminderDays()
    };
  }

  function dossierComplementEnCours() {
    return complementDossierId ? dossiers.find(x => x.id === complementDossierId) || null : null;
  }

  // Depuis la fiche : l'assistant s'ouvre en mode complément, sur l'étape Importer.
  function demarrerComplementCompromis(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    if (typeof fermerDossierDrawer === 'function') fermerDossierDrawer();
    reinitialiserFormulaire();
    complementDossierId = id;
    choixComplement = {};
    complementFichierNas = '';
    modeImport = 'pdf';
    majEnteteComplement();
    definirOnglet('nouveau');
    const panneau = document.getElementById('panel');
    if (panneau) panneau.open = true;
    renderChoixImport();
    definirEtapeWizard(1);
    renderComplementNas();
  }

  // Depuis « Nouveau dossier » : le compromis déjà lu complète le dossier existant au lieu d'en créer un second.
  function basculerEnComplement(id) {
    if (!dossiers.some(x => x.id === id)) return;
    complementDossierId = id;
    choixComplement = {};
    majEnteteComplement();
    renderChoixImport();
    definirEtapeWizard(2);
  }

  function quitterComplement() {
    reinitialiserFormulaire();
  }

  // En-tête de l'assistant, bouton final et bloc « Dossier à compléter » selon le mode.
  function majEnteteComplement() {
    const d = dossierComplementEnCours();
    const panneau = document.getElementById('panel');
    if (panneau) panneau.classList.toggle('wizard-complement', !!d);
    const summary = panneau ? panneau.querySelector('summary') : null;
    if (summary) summary.innerHTML = d ? `Compléter ${escapeHtml(libelleDossierAffiche(d))} avec le compromis` : 'Nouveau dossier <span class="plus">+</span>';
    const bouton = document.getElementById('btn-ajouter-dossier');
    if (bouton && !creationDossierEnCours) bouton.textContent = d ? 'Compléter le dossier' : 'Ajouter le dossier';
    const entete = document.getElementById('complement-entete');
    if (entete) {
      entete.style.display = d ? '' : 'none';
      if (d) entete.innerHTML = `<div class="complement-entete-ligne"><span class="dot-label dl-acte">${icone('file-text')}${escapeHtml(libelleDossierAffiche(d))}</span>${infoBulle('Ce que la fiche porte déjà n’est jamais remplacé sans votre choix.')}<span class="complement-entete-espace"></span><button type="button" class="lien-action" onclick="quitterComplement()">Quitter</button></div><div id="complement-nas"></div>`;
    }
  }

  // Compromis déjà sur le NAS (dossier relié) : proposé à la lecture, jamais lu seul.
  async function renderComplementNas() {
    const d = dossierComplementEnCours();
    const zone = document.getElementById('complement-nas');
    if (!d || !zone) return;
    if (!d.dossierLie || !d.nasDossier) { zone.innerHTML = ''; return; }
    zone.innerHTML = `<p class="hint">${icone('spinner', null, true)} Recherche de l’avant-contrat dans le dossier du NAS…</p>`;
    try {
      const fichiers = await listerFichiersNas(d);
      if (dossierComplementEnCours() !== d) return;
      const choix = choisirAvantContratNas(fichiers, nomCompromisAttendu(d));
      if (!choix.fichier) { zone.innerHTML = '<p class="hint">Aucun avant-contrat trouvé dans le dossier du NAS : déposez-le ci-dessous.</p>'; return; }
      const chemin = cheminNasComplet(d, choix.fichier.chemin);
      zone.innerHTML = `<ul class="ja-liste">${renderLigneAction({
        titre: `Compromis trouvé sur le NAS : « ${choix.fichier.nom} »`,
        sous: choix.methode === 'nom-exact' ? 'Le fichier mémorisé sur la fiche' : 'Vérifiez qu’il s’agit bien du bon avant-contrat',
        categorie: 'acte',
        bouton: { libelle: 'Lire', icone: icone('file-text'), onclick: `lireCompromisNasPourComplement('${escapeOnclickArg(chemin)}')` }
      })}</ul>`;
    } catch (e) {
      zone.innerHTML = `<p class="hint">Dossier du NAS illisible (${escapeHtml(e.message)}) : déposez le compromis ci-dessous.</p>`;
    }
  }

  async function lireCompromisNasPourComplement(cheminComplet) {
    if (!dossierComplementEnCours()) return;
    if (!window.pdfjsLib) { afficherToast('Lecture des PDF indisponible sur ce poste.', 'OK', null); return; }
    try {
      const r = await fetchAvecAuth('/api/nas/fichier?chemin=' + encodeURIComponent(cheminComplet));
      if (!r.ok) throw new Error(`Lecture impossible (${r.status})`);
      const buffer = await r.arrayBuffer();
      const nom = String(cheminComplet).split(/[\\/]/).pop() || 'compromis.pdf';
      complementFichierNas = cheminComplet;
      exportAuthenticActuel = null;
      await traiterFichierPdf({ name: nom, arrayBuffer: async () => buffer });
      renderChoixImport();
      definirEtapeWizard(2);
    } catch (e) {
      noterVerificationPoste('complement-compromis-nas', { ok: false, message: 'lecture du compromis du NAS impossible' });
      afficherToast('Lecture du compromis impossible : ' + e.message, 'OK', null);
    }
  }

  // Étape Vérifier : « Déjà sur la fiche » — pour chaque donnée que la fiche porte, ce que le compromis en dit.
  function renderComparaisonComplement() {
    const zone = document.getElementById('complement-comparaison');
    if (!zone) return;
    const d = dossierComplementEnCours();
    if (!d || !dernierTexteTraite) { zone.style.display = 'none'; zone.innerHTML = ''; return; }
    const comparaison = comparaisonComplement(valeursFicheComplement(d), valeursLuesComplement());
    const lignes = comparaison.filter(x => x.etat !== 'lu-seul');
    const ligne = (x) => {
      const corps = x.etat === 'different'
        ? `<span class="complement-choix" role="radiogroup" aria-label="${escapeAttr(x.libelle)}">
            <button type="button" class="complement-option${choixComplement[x.cle] === 'compromis' ? '' : ' actif'}" role="radio" aria-checked="${choixComplement[x.cle] !== 'compromis'}" onclick="choisirComplement('${x.cle}', 'fiche')"><span class="complement-option-source">Fiche</span>${escapeHtml(texteValeurComplement(x.cle, x.fiche))}</button>
            <button type="button" class="complement-option${choixComplement[x.cle] === 'compromis' ? ' actif' : ''}" role="radio" aria-checked="${choixComplement[x.cle] === 'compromis'}" onclick="choisirComplement('${x.cle}', 'compromis')"><span class="complement-option-source">Compromis</span>${escapeHtml(texteValeurComplement(x.cle, x.lu))}</button>
          </span>`
        : x.etat === 'fusion'
          ? `<span class="complement-valeur">${escapeHtml(fusionnerEmailsTexte(x.fiche, [x.lu]))}</span><span class="dot-label dl-neutre"><span class="dot"></span>Fiche + compromis</span>`
          : x.etat === 'identique'
            ? `<span class="complement-valeur">${escapeHtml(texteValeurComplement(x.cle, x.fiche))}</span><span class="dot-label dl-success">${icone('check')}Identique</span>`
            : `<span class="complement-valeur">${escapeHtml(texteValeurComplement(x.cle, x.fiche))}</span><span class="dot-label dl-neutre"><span class="dot"></span>Fiche gardée, rien lu</span>`;
      return `<div class="complement-ligne${x.etat === 'different' ? ' complement-differente' : ''}"><span class="complement-libelle">${escapeHtml(x.libelle)}</span>${corps}</div>`;
    };
    // Seules les lignes qui demandent un œil sont détaillées ; les identiques tiennent sur une ligne.
    const identiques = lignes.filter(x => x.etat === 'identique');
    const detaillees = lignes.filter(x => x.etat !== 'identique');
    zone.style.display = '';
    zone.innerHTML = `
      <div class="section-eyebrow">Déjà sur la fiche ${infoBulle('Ce que la fiche porte déjà (Authentic ou saisie) face à ce que le compromis dit. La fiche est gardée tant que vous ne choisissez pas « Compromis ». Ce que la fiche n’a pas encore vient du compromis, à valider dans le panneau dessous.')}</div>
      ${detaillees.length ? `<div class="complement-liste">${detaillees.map(ligne).join('')}</div>` : ''}
      ${identiques.length ? `<p class="complement-identiques"><span class="dot-label dl-success">${icone('check')}${identiques.length === lignes.length ? 'Tout concorde' : `${identiques.length} identique${identiques.length > 1 ? 's' : ''}`}</span><span class="complement-identiques-liste">${escapeHtml(identiques.map(x => x.libelle.toLowerCase()).join(' · '))}</span></p>` : ''}`;
  }

  function choisirComplement(cle, source) {
    choixComplement[cle] = source === 'compromis' ? 'compromis' : 'fiche';
    renderComparaisonComplement();
  }

  // Étape Valider en mode complément : ce qui sera ajouté ou changé sur la fiche (essai à blanc sur une copie).
  function renderRecapComplement() {
    const cible = document.getElementById('recap-wizard');
    const d = dossierComplementEnCours();
    if (!cible || !d) return;
    if (!dernierTexteTraite) { cible.innerHTML = '<p class="recap-manque">Déposez d’abord le compromis (étape Importer).</p>'; return; }
    const comparaison = comparaisonComplement(valeursFicheComplement(d), valeursLuesComplement());
    const { resolu, changements } = resolutionComplement(comparaison, choixComplement);
    const copie = JSON.parse(JSON.stringify(d));
    const textes = appliquerComplementSurDossier(copie, resolu, extrasComplementWizard());
    const autres = textes.filter(t => !changements.some(c => c.libelle.toLowerCase() === t));
    const reste = etatRevision && extractionActuelle ? etatRevision.aValider : 0;
    const etat = reste
      ? `<div class="recap-etat"><span class="dot-label dl-pret"><span class="dot"></span>${reste} donnée${reste > 1 ? 's' : ''} pas encore validée${reste > 1 ? 's' : ''}</span><button type="button" class="lien-action" onclick="definirEtapeWizard(2)">Revenir à Vérifier</button></div>`
      : '';
    cible.innerHTML = `${etat}<p class="hint">${escapeHtml(libelleDossierAffiche(d))} — ce que le compromis « ${escapeHtml(compromisNomFichierImporte || 'déposé')} » apporte :</p>
      <dl class="recap-liste">${changements.map(c =>
        `<div class="recap-ligne"><dt>${escapeHtml(c.libelle)}</dt><dd>${c.avant ? `<span class="recap-avant">${escapeHtml(texteValeurComplement(c.cle, c.avant))}</span> → ` : ''}${escapeHtml(texteValeurComplement(c.cle, c.apres))}</dd></div>`).join('')}
      ${autres.map(t => `<div class="recap-ligne"><dt>Ajouté</dt><dd>${escapeHtml(t)}</dd></div>`).join('')}
      ${!changements.length && !autres.length ? '<div class="recap-ligne"><dt>Rien de nouveau</dt><dd class="recap-manque">Le compromis n’apporte rien que la fiche n’ait déjà.</dd></div>' : ''}</dl>`;
  }

  function validerWizard() {
    if (complementDossierId) return completerDossierDepuisWizard();
    return ajouterDossier();
  }

  async function completerDossierDepuisWizard() {
    if (creationDossierEnCours) return;
    const d = dossierComplementEnCours();
    if (!d) { afficherErreurFormulaire('Le dossier à compléter n’existe plus.'); return; }
    if (!dernierTexteTraite) { afficherErreurFormulaire('Déposez d’abord le compromis.'); return; }
    masquerErreurFormulaire();
    const avantDates = { pret: d.pret || '', ventebien: d.ventebien || '' };
    const comparaison = comparaisonComplement(valeursFicheComplement(d), valeursLuesComplement());
    const { resolu } = resolutionComplement(comparaison, choixComplement);
    const textes = appliquerComplementSurDossier(d, resolu, extrasComplementWizard());
    if (complementFichierNas) {
      memoriserFichierTrouve(d, NAS_CLE_COMPROMIS, complementFichierNas);
      noterVerificationPoste('complement-compromis-nas', { detail: 'compromis du NAS lu et dossier complété' });
    }
    ajouterHistorique(d, `Complété avec le compromis « ${compromisNomFichierImporte || 'déposé'} »${textes.length ? ' : ' + textes.join(', ') : ' — rien de nouveau'}`);
    creationDossierEnCours = true;
    const bouton = document.getElementById('btn-ajouter-dossier');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Enregistrement…'; }
    try {
      await sauvegarder(d);
    } finally {
      creationDossierEnCours = false;
      if (bouton) { bouton.disabled = false; bouton.textContent = 'Compléter le dossier'; }
    }
    // Les dates butoir nouvelles ou changées partent dans l'agenda, comme une saisie sur la fiche.
    ['pret', 'ventebien'].forEach(t => {
      if ((d[t] || '') !== avantDates[t]) Promise.resolve().then(() => synchroniserEcheanceAgenda(d, t, true)).catch(() => { /* agenda facultatif */ });
    });
    const id = d.id;
    reinitialiserFormulaire();
    document.getElementById('panel').open = false;
    definirOnglet('suivi');
    render();
    ouvrirDossierDrawer(id);
    afficherToast(`${libelleDossierAffiche(d)} complété avec le compromis${textes.length ? ` : ${textes.slice(0, 3).join(', ')}${textes.length > 3 ? '…' : ''}` : ''}.`, 'OK', null);
  }

  async function ajouterDossier(doublonConfirme) {
    if (creationDossierEnCours) return;
    // Mode complément (Ctrl+S, ancien bouton) : c'est le dossier visé qui est complété, rien n'est créé.
    if (complementDossierId) return completerDossierDepuisWizard();
    const nom = document.getElementById('f-nom').value.trim();
    const typeVente = document.getElementById('f-type-vente').value;
    const roleNotaire = document.getElementById('f-role-notaire').value;
    const responsable = document.getElementById('f-responsable').value.trim();
    const emailAcquereur = document.getElementById('f-email-acquereur').value.trim();
    const emailVendeur = document.getElementById('f-email-vendeur').value.trim();
    const nomAgence = document.getElementById('f-nom-agence').value.trim();
    const adresseBien = normaliserAdresse(document.getElementById('f-adresse-bien').value);
    const prixVenteBrut = document.getElementById('f-prix-vente').value.trim();
    const prixVente = eurosDepuisSaisie(prixVenteBrut);
    const mobilierBrut = document.getElementById('f-prix-mobilier').value.trim();
    const prixMobilier = eurosDepuisSaisie(mobilierBrut);
    const depotBrut = document.getElementById('f-depot-garantie').value.trim();
    const depotGarantie = eurosDepuisSaisie(depotBrut);
    const honorairesAgence = eurosDepuisSaisie(document.getElementById('f-honoraires-agence').value.trim());
    const sequestreDepot = document.getElementById('f-sequestre-depot').value.trim();
    const pret = echeanceActive.pret ? document.getElementById('f-pret').value : '';
    const acte = echeanceActive.acte ? document.getElementById('f-acte').value : '';
    const ventebien = echeanceActive.ventebien ? document.getElementById('f-ventebien').value : '';
    const autres = autresEnCours
      .filter(a => a.active && a.iso)
      .map(a => ({ label: a.label.trim() || 'Autre échéance', date: a.iso, page: a.page || null }));

    if (!nom) { afficherErreurFormulaire('Indiquez un nom de dossier.'); return; }
    // Sans compromis (« Dossier Authentic seul », succession) : aucune date n'est exigée.
    const successionAuthentic = !!exportAuthenticActuel && typeAffaireAuthentic(exportAuthenticActuel) === 'succession';
    if (!exportAuthenticActuel && !pret && !acte && !ventebien && autres.length === 0) { afficherErreurFormulaire('Renseignez au moins une date butoir active.'); return; }
    masquerErreurFormulaire();
    const existant = doublonConfirme ? null : dossierDejaPresentPourCreation(nom, exportAuthenticActuel && exportAuthenticActuel.reference, dossiers);
    if (existant) {
      const pourAuthentic = exportAuthenticActuel && referenceAuthenticValide(exportAuthenticActuel.reference) && existant.referenceAuthentic === exportAuthenticActuel.reference ? ' pour ce dossier Authentic' : '';
      // Un compromis lu pour un dossier déjà présent (créé depuis Authentic, par exemple) : il le complète
      // (étude, 03/10) — « Créer quand même » reste possible.
      if (dernierTexteTraite && !estSuccession(existant)) {
        demanderConfirmation(`« ${libelleDossierAffiche(existant)} » existe déjà dans CLAIRE${pourAuthentic}. Compléter ce dossier avec le compromis lu ?`,
          () => basculerEnComplement(existant.id), { bouton: 'Compléter le dossier', ton: 'valider', autre: { libelle: 'Créer quand même', action: () => ajouterDossier(true) } });
        return;
      }
      demanderConfirmation(`Créer un second dossier ? « ${libelleDossierAffiche(existant)} » existe déjà dans CLAIRE${pourAuthentic}.`,
        () => ajouterDossier(true), { bouton: 'Créer quand même' });
      return;
    }

    // "auto" = date reprise d'un chip détecté dans le texte ; "manuel" = saisie/correction à la
    // main ; "incertain" = choisie automatiquement parmi plusieurs candidates de même catégorie
    // sans formulation de délai pour trancher (voir meilleureCandidateEcheance) — à vérifier avant
    // les autres dates "auto" ; "estime" = calculée à partir d'une formulation approximative
    // ("fin septembre", délai relatif...) plutôt que lue telle quelle dans le texte.
    function confianceType(valeur, type) {
      if (!valeur) return null;
      if (!pageParType[type]) return 'manuel';
      if (approxParType[type]) return 'estime';
      return ambiguiteParType[type] ? 'incertain' : 'auto';
    }
    const confiance = {
      pret: confianceType(pret, 'pret'),
      acte: confianceType(acte, 'acte'),
      ventebien: confianceType(ventebien, 'ventebien')
    };

    // Engagements d'entretien détectés dans le compromis (chaudière, PAC, ramonage — voir
    // cleChecklist sur DOCUMENTS_VENDEUR_CONNUS/PIECES_ENGAGEMENTS_AUTO) : ajoutés une fois pour
    // toutes à la checklist de CE dossier, calculé ici puisque l'analyse complète du compromis
    // (analyseJuridiqueActuelle) n'existe que pendant l'import — un dossier déjà enregistré et
    // rouvert n'a plus accès au texte du compromis pour refaire cette détection après coup.
    const piecesEngagementsDetectees = analyseJuridiqueActuelle.documents
      .map(doc => doc.cleChecklist)
      .filter(Boolean);

    // Ce que l'extraction structurée a compris de l'acte (type d'acte, parties et leurs rôles,
    // notaires, adresse/cadastre du bien, statut de chaque donnée) — conservé sur le dossier à
    // titre de trace consultable, en plus des champs plats inchangés. Rien de tout ceci n'est
    // recalculable après coup : le texte du compromis n'est jamais gardé (voir CLAUDE.md).
    const instantane = instantaneExtraction(extractionActuelle);
    // Notaire de chaque côté + celui qui reçoit l'acte. Calculé ici plutôt que repris de
    // `instantane.notaires` : cotesNotairesPourDossier a besoin de la LISTE complète des notaires
    // détectés (que l'instantané ne conserve pas) pour proposer ceux dont l'acte ne dit pas de
    // quel côté ils interviennent.
    const cotesNotaires = cotesNotairesPourDossier(extractionActuelle ? extractionActuelle.notaires : null);
    // Les deux notaires tels que l'étude les a laissés à l'étape Finaliser.
    const notaireVendeur = completerNomNotaire(document.getElementById('f-notaire-vendeur').value.trim(), carnetConfreres);
    const notaireAcquereur = completerNomNotaire(document.getElementById('f-notaire-acquereur').value.trim(), carnetConfreres);

    const dossier = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'd-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      nom, responsable, emailAcquereur, emailVendeur,
      telephoneAcquereur: (extractionActuelle && extractionActuelle.champs && extractionActuelle.champs.telephoneAcquereur && extractionActuelle.champs.telephoneAcquereur.valeur) || '',
      telephoneVendeur: (extractionActuelle && extractionActuelle.champs && extractionActuelle.champs.telephoneVendeur && extractionActuelle.champs.telephoneVendeur.valeur) || '',
      questionnaireEnvoyeLe: null,
      receptionFondsConfirmeeLe: null,
      nomAgence,
      adresseBien,
      prixVente: Number.isFinite(prixVente) && prixVente > 0 ? prixVente : null,
      prixMobilier: Number.isFinite(prixMobilier) && prixMobilier > 0 ? prixMobilier : null,
      // Dépôt de garantie / acompte sur le prix versé par l'acquéreur à la signature de
      // l'avant-contrat, et l'office/l'agence qui le séquestre (voir detecterDepotGarantie) :
      // une lecture de l'acte, corrigeable sur la fiche comme l'adresse ou le prix.
      depotGarantie: Number.isFinite(depotGarantie) && depotGarantie > 0 ? depotGarantie : null,
      sequestreDepot,
      montantPret: null,
      typeVente,
      roleNotaire,
      // Champs libres, corrigeables à tout moment sur la fiche (voir affecterNotaire) : vides
      // quand l'acte ne dit pas qui représente qui — les noms détectés restent alors proposés
      // dans notairesDetectes, à l'étude de les affecter.
      notaireVendeur,
      notaireAcquereur,
      coteInstrumentaire: ['vendeur', 'acquereur'].includes(document.getElementById('f-cote-instrumentaire').value)
        ? document.getElementById('f-cote-instrumentaire').value
        : coteInstrumentaireNouveauDossier(cotesNotaires, notaireVendeur, notaireAcquereur, roleNotaire),
      notairesDetectes: cotesNotaires.detectes.concat(notairesProposesWizard().filter(n => n.source === 'authentic').map(n => ({ nom: n.nom, role: null }))),
      // Email de l'office du notaire de l'acquéreur, à renseigner UNIQUEMENT quand cet office est
      // distinct du nôtre (voir notaireParticipantRepresenteAcquereur/emailDestinataireRelance) :
      // la déontologie interdit alors à l'instrumentaire de contacter directement l'acquéreur, les
      // relances (prêt, RIB) doivent transiter par son confrère. Jamais préremplie automatiquement.
      emailNotaireParticipant: '',
      // Même chose pour l'office qui représente le vendeur (étude, 03/10).
      emailConfrereVendeur: '',
      // Date de signature de l'avant-contrat (étude, 02/10 : point de départ des statistiques).
      dateAvantContrat: dateAvantContratWizard(),
      pieces: {},
      // Notifications "nouvelle pièce trouvée" non encore vues (voir verifierDossierLocal/
      // fermerDossierDrawer) : vide à la création, rien n'a encore été cherché.
      piecesNotifications: [],
      piecesEngagementsDetectees,
      dossierLie: false,
      // Dossier client sur le NAS (chemin relatif à la racine configurée côté serveur) et
      // chemins des fichiers déjà reconnus dedans : conservés SUR LE DOSSIER, donc valables depuis
      // n'importe quel poste — contrairement aux anciens handles, propres à un navigateur.
      nasDossier: null,
      fichiersTrouves: {},
      offrePretStatut: 'inconnu',
      garantiesPret: [],
      derniereRelanceAuto: null,
      pret, acte, ventebien, autres,
      pretPage: pret ? pageParType.pret : null,
      actePage: acte ? pageParType.acte : null,
      ventebienPage: ventebien ? pageParType.ventebien : null,
      pdfNumPages: pdfDernierePageUtile,
      // Nom du fichier réellement importé : la seule façon de rouvrir plus tard le BON
      // avant-contrat (voir ouvrirCompromisTrouve). Vide pour un dossier saisi entièrement à la
      // main, qui retombe alors sur l'ancienne recherche floue.
      compromisNomFichier: compromisNomFichierImporte || null,
      sansPret: !echeanceActive.pret,
      // Échéances déclarées réalisées (voir echeanceValidee/validerEcheance) : vide à la création.
      echeancesValidees: {},
      // Pas de section rappels sans condition de prêt (voir majVisibiliteRappels) : aucun rappel
      // pour ce dossier, plutôt que de lire des cases à cocher restées invisibles/non pertinentes.
      reminderDays: echeanceActive.pret ? getSelectedReminderDays() : [],
      confiance,
      archive: false,
      analyseJuridique: {
        documents: analyseJuridiqueActuelle.documents.slice(),
        engagements: analyseJuridiqueActuelle.engagements.slice()
      },
      typeActe: instantane ? instantane.typeActe : null,
      parties: instantane ? instantane.parties : [],
      honoraires: honorairesAvecMontantFormulaire(instantane ? instantane.honoraires : null, honorairesAgence, nomAgence),
      fondsTravaux: instantane ? instantane.fondsTravaux : null,
      notaires: instantane ? instantane.notaires : null,
      bien: instantane ? instantane.bien : null,
      extraction: instantane ? instantane.extraction : null,
      historique: [Object.assign({ date: new Date().toISOString(), texte: 'Dossier créé' }, utilisateurPoste ? { auteur: utilisateurPoste } : {})]
    };

    // Ce que l'étude a corrigé à la main par rapport à ce que l'extraction proposait — journalisé
    // pour mesurer plus tard où elle se trompe, jamais pour réentraîner automatiquement quoi que
    // ce soit (voir journaliserCorrectionsExtraction).
    journaliserCorrectionsExtraction(diffCorrectionsExtraction(extractionActuelle, {
      nom, adresseBien, emailAcquereur, emailVendeur, roleNotaire, nomAgence, sequestreDepot,
      notaireVendeur: notaireVendeur || null, notaireAcquereur: notaireAcquereur || null,
      prixVente: Number.isFinite(prixVente) && prixVente > 0 ? prixVente : null,
      prixMobilier: Number.isFinite(prixMobilier) && prixMobilier > 0 ? prixMobilier : null,
      depotGarantie: Number.isFinite(depotGarantie) && depotGarantie > 0 ? depotGarantie : null,
      honorairesAgence: Number.isFinite(honorairesAgence) && honorairesAgence > 0 ? honorairesAgence : null,
      pret, acte, ventebien
    }));

    // Succession reprise d'Authentic : parties (sans qualité devinée) et biens, aucun financement.
    if (successionAuthentic) {
      dossier.typeAffaire = 'succession';
      dossier.parties = partiesSuccessionDepuisAuthentic(exportAuthenticActuel);
      dossier.biens = biensDepuisAuthentic(exportAuthenticActuel);
      dossier.sansPret = true;
      dossier.reminderDays = [];
      if (!dossier.adresseBien && dossier.biens[0]) dossier.adresseBien = dossier.biens[0].adresse;
    }

    // Export Authentic : pièces déjà présentes dans Authentic, reçues « à la main » (le parcours du
    // NAS ne les repassera pas en manquantes — même règle que pour une pièce détenue ailleurs).
    if (exportAuthenticActuel) {
      const caseAuthentic = document.getElementById('f-pieces-authentic');
      const reprises = caseAuthentic && caseAuthentic.checked && roleNotaire !== 'participant'
        ? piecesExportAuthentic(exportAuthenticActuel, checklistPieces(typeVente)) : [];
      reprises.forEach(pc => {
        if (pc.nouvelle && !(dossier.piecesPersonnalisees || []).some(p => p.cle === pc.cle)) {
          dossier.piecesPersonnalisees = (dossier.piecesPersonnalisees || []).concat({ cle: pc.cle, label: pc.label });
        }
        dossier.pieces[pc.cle] = 'recue';
      });
      if (reprises.length) {
        dossier.piecesValideesManuellement = reprises.map(pc => pc.cle);
        dossier.piecesAuthentic = reprises.map(pc => pc.cle);
      }
      infosAuthenticACreation(dossier, exportAuthenticActuel.infosAuthentic);
      if (referenceAuthenticValide(exportAuthenticActuel.reference) && !dossiers.some(x => x && !x.deleted && x.referenceAuthentic === exportAuthenticActuel.reference)) {
        dossier.referenceAuthentic = exportAuthenticActuel.reference;
        if (exportAuthenticActuel.intitule) dossier.intituleAuthentic = String(exportAuthenticActuel.intitule).slice(0, 150);
      }
      dossier.historique.push(Object.assign({ date: new Date().toISOString(),
        texte: `Créé depuis ${exportAuthenticActuel.origine === 'pages' ? 'les pages' : 'l’export'} Authentic « ${exportAuthenticActuel.intitule} »` + (reprises.length ? ` — pièces présentes dans Authentic marquées reçues : ${reprises.map(pc => pc.label).join(', ')}` : '') },
      utilisateurPoste ? { auteur: utilisateurPoste } : {}));
    }

    creationDossierEnCours = true;
    const bouton = document.getElementById('btn-ajouter-dossier');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Enregistrement…'; }
    let cree = false;
    try {
      cree = await sauvegarderNouveauDossier(dossier);
    } finally {
      creationDossierEnCours = false;
      if (bouton) { bouton.disabled = false; bouton.textContent = 'Ajouter le dossier'; }
    }
    if (!cree) {
      afficherToast("Impossible d'enregistrer le dossier — vérifiez la connexion au serveur intranet.", 'OK', null);
      return;
    }
    // La synchronisation a pu le recevoir pendant l'enregistrement : jamais deux fois dans la liste.
    if (!dossiers.some(x => x.id === dossier.id)) dossiers.push(dossier);
    reinitialiserFormulaire();
    document.getElementById('panel').open = false;
    definirOnglet('suivi');
    // Rattachement au NAS immédiat quand le nom du dossier désigne sans ambiguïté un dossier
    // client existant : c'est le moment où ça sert le plus, et ça évite le clic « Relier un
    // dossier du NAS » juste après avoir créé le dossier. Jamais attendu (la fiche s'affiche tout
    // de suite), et sans effet si aucune correspondance parfaite n'existe.
    lierDossierNasAutomatique(dossier.id);
  }

  // Pure : les biens d'un dossier Authentic gardés sur la fiche (succession : « éventuellement des
  // biens immobiliers », étude 02/10) — adresse, type, parcelles.
  function biensDepuisAuthentic(donnees) {
    return ((donnees && donnees.immeubles) || []).map(im => ({
      adresse: im.adresse && im.adresse.texte ? normaliserAdresse(im.adresse.texte) : '',
      type: im.type || '',
      parcelles: (im.parcelles || []).map(p => `${p.section} ${p.numero}`).join(', '),
      description: im.description || ''
    })).filter(b => b.adresse || b.parcelles).slice(0, 20);
  }

  // Pure : les parties d'une succession gardées sur la fiche, avec leurs coordonnées.
  function partiesSuccessionDepuisAuthentic(donnees) {
    return partiesExportAuthentic(donnees).map(p => Object.assign({
      nom: p.nom, role: 'PARTIE', qualiteActe: '', qualitePersonne: 'physique', representant: null,
      emails: (p.emails || []).slice(0, 3), telephones: (p.telephones || []).slice(0, 3)
    }, p.nomUsage ? { nomUsage: p.nomUsage } : {}, p.situationMatrimoniale ? { situationMatrimoniale: p.situationMatrimoniale } : {})).slice(0, 20);
  }

  // Pure (modifie le dossier passé) : à la création depuis les pages d'Authentic, les informations du
  // dossier relevées (acte, RHF, SAFER, prix, collaborateur, notaire) sont gardées sur la fiche, et une
  // SAFER notifiée sans réponse ajoute « Réponse SAFER » aux pièces manquantes.
  function infosAuthenticACreation(dossier, infos) {
    if (!dossier || !infos || !Object.keys(infos).length) return dossier;
    if (infos.avantContratLe && !dossier.dateAvantContrat) dossier.dateAvantContrat = infos.avantContratLe;
    dossier.authentic = Object.assign({}, infos, { releveLe: new Date().toISOString() });
    const sa = infos.safer;
    if (sa && sa.decision !== 'non_preemption' && dossier.roleNotaire !== 'participant'
      && !(dossier.piecesPersonnalisees || []).some(p => /safer/i.test(p.label))) {
      dossier.piecesPersonnalisees = (dossier.piecesPersonnalisees || []).concat({ cle: 'perso-safer', label: 'Réponse SAFER' });
      dossier.pieces = dossier.pieces || {};
      dossier.pieces['perso-safer'] = 'manquante';
      dossier.authentic.saferPieceAjoutee = true;
    }
    return dossier;
  }

  // Verbe d'ouverture de la question → libellé et couleur du bouton (voir demanderConfirmation).
  var BOUTONS_CONFIRMATION = [
    { verbe: 'supprimer', bouton: 'Supprimer', ton: 'danger' },
    { verbe: 'retirer', bouton: 'Retirer', ton: 'danger' },
    { verbe: 'réinitialiser', bouton: 'Réinitialiser', ton: 'danger' },
    { verbe: 'vider', bouton: 'Vider', ton: 'danger' },
    { verbe: 'effacer', bouton: 'Effacer', ton: 'danger' },
    { verbe: 'marquer', bouton: 'Valider', ton: 'valider' },
    { verbe: 'importer', bouton: 'Importer', ton: 'valider' },
    { verbe: 'remplacer', bouton: 'Mettre à jour', ton: 'valider' },
  ];
  function boutonConfirmation(message) {
    const premier = String(message || '').trim().split(/[\s«»"'’]+/)[0].toLowerCase();
    const r = BOUTONS_CONFIRMATION.find(b => b.verbe === premier);
    return r ? { bouton: r.bouton, ton: r.ton } : { bouton: 'Confirmer', ton: 'valider' };
  }

  // Modale de confirmation maison : window.confirm() est souvent bloqué dans un aperçu en
  // bac à sable (iframe), ce qui empêchait la suppression de fonctionner silencieusement.
  let actionConfirmee = null;

  // Le bouton de confirmation dit ce qui va se passer, d'après le PREMIER MOT de la question
  // (`boutonConfirmation`, pure et testable) : « Retirer », « Vider », « Importer »… plutôt qu'un
  // « Supprimer » rouge partout, qui faisait croire à une suppression là où il n'y en avait pas.
  // Rouge pour ce qui retire ou efface, bleu (`.btn-valider`) pour ce qui ajoute ou valide.
  // `options.bouton` / `options.ton` l'emportent sur cette déduction. Un verbe inconnu retombe
  // sur « Confirmer », en bleu : jamais un « Supprimer » affiché par défaut sur une question qui
  // ne supprime rien.
  function demanderConfirmation(message, onConfirm, options) {
    document.getElementById('confirm-message').textContent = message;
    const ok = document.getElementById('confirm-btn-ok');
    if (ok) {
      const deduit = boutonConfirmation(message);
      const bouton = (options && options.bouton) || deduit.bouton;
      const ton = (options && options.ton) || deduit.ton;
      ok.textContent = bouton;
      ok.classList.toggle('btn-valider', ton === 'valider');
      ok.setAttribute('variant', ton === 'valider' ? 'brand' : 'danger');
    }
    actionConfirmee = onConfirm;
    // Troisième choix facultatif (« Créer quand même » à côté de « Compléter le dossier »).
    const autre = document.getElementById('confirm-btn-autre');
    if (autre) {
      const choix = options && options.autre;
      autre.style.display = choix ? '' : 'none';
      autre.textContent = choix ? choix.libelle : '';
      autre.onclick = choix ? () => { annulerConfirmation(); choix.action(); } : null;
    }
    document.getElementById('confirm-overlay').style.display = 'flex';
  }

  // Message de validation intégré à la page (remplace window.alert(), lui aussi souvent bloqué
  // dans un aperçu en bac à sable).
  function afficherErreurFormulaire(message) {
    const el = document.getElementById('form-error');
    el.textContent = message;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function masquerErreurFormulaire() {
    document.getElementById('form-error').style.display = 'none';
  }

  function annulerConfirmation() {
    actionConfirmee = null;
    document.getElementById('confirm-overlay').style.display = 'none';
  }

  // Popup d'info post-action (voir telechargerICS()/envoyerRelanceCiblee()) : confirme que
  // l'action a eu lieu et rappelle en une phrase à quoi sert le fichier/brouillon obtenu, à la
  // place de l'ancien texte fixe du footer (retiré, voir index.html) qui expliquait ça en
  // permanence sans rapport avec un geste précis de l'utilisateur.
  function afficherInfoAction(titre, message) {
    document.getElementById('info-action-titre').textContent = titre;
    document.getElementById('info-action-message').textContent = message;
    document.getElementById('info-action-overlay').style.display = 'flex';
  }

  function fermerInfoAction() {
    document.getElementById('info-action-overlay').style.display = 'none';
  }

  document.getElementById('confirm-btn-ok').addEventListener('click', () => {
    const action = actionConfirmee;
    annulerConfirmation();
    if (action) action();
  });

  let dernierSupprimeTimeout = null;
  let toastMasquageTimeout = null;
  const DUREE_TOAST_MS = 6000;
  let toastRestantMs = DUREE_TOAST_MS;
  let toastDemarreA = 0;

  // Bulle noire centrée en bas de l'écran, au-dessus des voiles (voir .toast dans style.css). Elle reste 6 s, se met en
  // pause tant que la souris est dessus (le temps de lire un nom de fichier long ou de viser
  // « Annuler »), puis s'efface en fondu avant d'être retirée du flux.
  // Message fixe (étude, 02/10 : « quand on a le choix du dossier, laisse la notif fixe sans temps
  // d'expiration ») : sans minuterie, fermé par son bouton ou la croix. Un message ordinaire arrivé
  // entre-temps passe devant, puis le message fixe revient.
  let toastFixe = null;
  function masquerToast() {
    clearTimeout(dernierSupprimeTimeout);
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.classList.remove('visible', 'en-pause');
    clearTimeout(toastMasquageTimeout);
    toastMasquageTimeout = setTimeout(() => {
      toast.style.display = 'none';
      if (toastFixe && !toast.classList.contains('fixe')) afficherToast(toastFixe.message, toastFixe.texteBouton, toastFixe.onUndo, { fixe: true, cle: toastFixe.cle });
    }, 200);
  }

  // `cle` (facultatif) : ne ferme que le message fixe de cette affaire.
  function fermerToastFixe(cle) {
    if (!toastFixe || (cle && toastFixe.cle !== cle)) return;
    toastFixe = null;
    const toast = document.getElementById('toast');
    if (toast && toast.classList.contains('fixe')) masquerToast();
  }

  function programmerMasquageToast(delaiMs) {
    clearTimeout(dernierSupprimeTimeout);
    toastRestantMs = delaiMs;
    toastDemarreA = Date.now();
    dernierSupprimeTimeout = setTimeout(masquerToast, delaiMs);
  }

  function afficherToast(message, texteBouton, onUndo, options) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const fixe = !!(options && options.fixe);
    if (fixe) toastFixe = { message, texteBouton, onUndo, cle: options.cle || '' };
    clearTimeout(toastMasquageTimeout);
    document.getElementById('toast-message').textContent = message;
    const btn = document.getElementById('toast-undo-btn');
    btn.textContent = texteBouton;
    // Le bouton d'un message fixe ne le ferme pas : il reste jusqu'à ce que son affaire soit réglée
    // (fermerToastFixe) ou qu'on le ferme par la croix.
    btn.onclick = () => {
      if (!fixe) masquerToast();
      if (onUndo) onUndo();
    };
    const fermer = document.getElementById('toast-fermer-btn');
    if (fermer) {
      fermer.style.display = fixe ? '' : 'none';
      if (fixe && !fermer.innerHTML) fermer.innerHTML = icone('x');
    }
    toast.classList.toggle('fixe', fixe);
    toast.onmouseenter = () => {
      if (fixe || !toast.classList.contains('visible')) return;
      clearTimeout(dernierSupprimeTimeout);
      toastRestantMs = Math.max(0, toastRestantMs - (Date.now() - toastDemarreA));
      toast.classList.add('en-pause');
    };
    toast.onmouseleave = () => {
      if (!toast.classList.contains('en-pause')) return;
      toast.classList.remove('en-pause');
      programmerMasquageToast(Math.max(toastRestantMs, 400));
    };
    // Relance le filet de durée même si une carte était déjà affichée : retirer la classe,
    // forcer un reflow, puis la reposer redémarre l'animation depuis le début.
    toast.classList.remove('visible', 'en-pause');
    toast.style.setProperty('--toast-duree', `${DUREE_TOAST_MS}ms`);
    toast.style.display = 'flex';
    void toast.offsetWidth;
    toast.classList.add('visible');
    if (fixe) clearTimeout(dernierSupprimeTimeout);
    else programmerMasquageToast(DUREE_TOAST_MS);
  }

  async function supprimerDossier(id) {
    const d = dossiers.find(x => x.id === id);
    const nom = d ? d.nom : 'ce dossier';
    demanderConfirmation(`Supprimer « ${nom} » du registre ?`, async () => {
      const index = dossiers.findIndex(x => x.id === id);
      if (index === -1) return;
      // Suppression douce côté serveur (voir supprimerDossierServeur) : la ligne reste en base,
      // seulement marquée supprimée — "Annuler" la restaure sans avoir à la recréer de zéro.
      const supprime = await supprimerDossierServeur(id);
      if (!supprime) {
        afficherToast('Suppression impossible — vérifiez la connexion au serveur.', 'OK', null);
        return;
      }
      dossiers = dossiers.filter(x => x.id !== id);
      render();
      afficherToast(`Dossier « ${nom} » supprimé.`, 'Annuler', async () => {
        const restaure = await restaurerDossierServeur(id);
        if (restaure && d) {
          dossiers.push(d);
          render();
        }
      });
    });
  }

  // Écart signé, en jours, de `isoA` vers `isoB` (positif si B est après A). Distinct de
  // joursEntre(), qui compte les bornes comprises (+1) parce qu'il sert au prorata — ici on veut
  // une vraie différence, pour dire « 5 j après » ou « 3 j avant ». Calculé en UTC, même piège de
  // changement d'heure déjà documenté pour joursEntre().
  function ecartJours(isoA, isoB) {
    if (!isoA || !isoB) return null;
    const a = new Date(isoA + 'T00:00:00Z');
    const b = new Date(isoB + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  function joursRestants(iso) {
    if (!iso) return null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(iso + 'T00:00:00');
    const diffMs = target - today;
    return Math.round(diffMs / 86400000);
  }

  function formatDateFr(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Date du jour affichée en tête du Tableau de bord, à la place de l'étiquette "Tableau de bord"
  // (demandé par l'étude — l'accueil de l'outil gagne à afficher une information vivante plutôt
  // qu'un simple titre de section). "Lundi 28 septembre 2026" : toLocaleDateString('fr-FR', ...)
  // rend déjà le jour de semaine et le mois en minuscules, seule la première lettre est remontée
  // en capitale.
  function libelleDateDuJour() {
    const texte = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }

  function optionsCategorie(typeActuel) {
    const options = [
      ['pret', 'Obtention du prêt'],
      ['acte', 'Date butoir'],
      ['ventebien', 'Vente préalable']
    ];
    return options.map(([val, texte]) =>
      `<option value="${val}" ${val === typeActuel ? 'selected' : ''}>${texte}</option>`
    ).join('');
  }

  // ---- Échéances de la fiche : une ligne par étape (refonte du 28/09, demandée par l'étude) ----
  // Les anciennes cartes empilaient titre, grande date, décompte, boutons et blocs d'état : « trop
  // brouillon, trop chargé ». Chaque étape tient maintenant sur une ligne : pastille (anneau = à
  // venir, pleine = faite), nom, date courte alignée en colonne, état en un mot, et les gestes
  // d'édition en icônes (corriger la date, marquer réalisée / annuler, supprimer) qui n'apparaissent
  // qu'au survol — toujours visibles sur tablette. Ce qu'il faut savoir en plus (offre de prêt,
  // confiance de la date, page du PDF, écart avec la date butoir, agenda) passe sur une seconde
  // ligne discrète. Les gestes qui AGISSENT (relancer, créer le rendez-vous…) sont dans l'encadré
  // « Prochaine étape » au-dessus, sous forme de lignes d'action (renderLigneAction).
  //
  // Mécanismes conservés tels quels : crayon → champ date natif → ✓ (ids tabdate-<id>-<clé>-aff /
  // -edit / -input, voir activerEditionDate/validerEditionDate) ; clé "autre-N" pour une échéance
  // personnalisée (index réel dans d.autres, pas son rang après tri) ; recatégorisation du prêt, de
  // la date butoir et de la vente préalable par le petit chevron (select natif invisible posé
  // dessus) ; pas de « Marquer réalisée » quand c'est un FAIT du dossier qui clôt l'échéance (offre
  // de prêt confirmée reçue) — le bouton n'annulerait rien.
  //
  // Badge de confiance : seulement pour une date « estimée » (formulation approximative) ou « à
  // vérifier » (choisie parmi plusieurs candidates) ; une date lue sans ambiguïté ou saisie à la
  // main n'en porte aucun (un badge partout n'attirait l'attention sur rien).
  var LIBELLES_CONFIANCE_ECHEANCE = {
    estime: { titre: 'Calculée à partir d’une formulation approximative ("fin septembre", délai relatif...) — à vérifier précisément', texte: 'Estimée', dl: 'dl-pret' },
    incertain: { titre: 'Choisie parmi plusieurs dates possibles dans le texte — à vérifier en priorité', texte: 'À vérifier', dl: 'dl-alerte', icone: 'alert-triangle' }
  };

  // Date courte d'une ligne (« 20 oct. 2026 ») : les dates s'alignent en colonne ; la date en
  // toutes lettres reste en infobulle.
  function dateCourteEcheance(iso) {
    if (!iso) return '—';
    const dt = new Date(iso + 'T00:00:00');
    if (isNaN(dt)) return iso;
    return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Pure : l'état d'une échéance en un mot, et sa classe de couleur.
  function etatLigneEcheance(iso, opts) {
    const o = opts || {};
    if (!iso) {
      if (o.validee && o.etatFait) return { texte: '✓ Fait', cls: 'ok' };
      return { texte: o.sansPret ? 'Sans prêt' : (o.etatSansDate || 'Non renseignée'), cls: 'neutre' };
    }
    if (o.offrePretRecue) return { texte: '✓ Offre reçue', cls: 'ok' };
    if (o.validee) return { texte: o.etatFait || '✓ Réalisée', cls: 'ok' };
    const jours = joursRestants(iso);
    if (jours < 0) return { texte: 'Dépassée', cls: 'alerte' };
    if (jours === 0) return { texte: "Aujourd'hui", cls: 'urgent' };
    return { texte: `J-${jours}`, cls: jours <= 3 ? 'urgent' : '' };
  }

  // Pure : l'écart entre la date butoir et le rendez-vous de signature, dit sous le rendez-vous.
  // La date butoir ne pilote plus rien une fois le rendez-vous pris, mais reste « indicative pour
  // savoir si on signe avant ou après » (l'étude) : signer APRÈS est le seul cas qui alerte.
  function ecartButoirRendezVous(butoirIso, rdvIso) {
    const ecart = ecartJours(butoirIso, rdvIso);
    if (ecart === null) return null;
    return {
      ecart, alerte: ecart > 0,
      texte: ecart === 0 ? 'Signature le jour même' : (ecart > 0 ? `Signature ${ecart} j APRÈS la date butoir` : `Signature ${-ecart} j avant la date butoir`)
    };
  }

  // type, label (déjà échappé), iso, dossierId, page (PDF), confiance, autreIndex (null hors
  // personnalisée), offrePretRecue, sousHtml (seconde ligne ajoutée par l'appelant), sansPret,
  // validee, opts : { etatSansDate, etatFait, sansValidation, fort, comptant }.
  // `comptant` (achat comptant, demandé par l'étude) : une ligne d'information « Financement
  // comptant », sans date, sans état ni rien à cocher ; seul le crayon reste, au survol, pour saisir
  // une date d'obtention si un prêt apparaît finalement (validerEditionDate repasse alors sansPret
  // à false).
  function renderLigneEcheance(type, label, iso, dossierId, page, confiance, autreIndex, offrePretRecue, sousHtml, sansPret, validee, opts) {
    const o = opts || {};
    const recategorisable = !o.comptant && dossierId && autreIndex == null && (type === 'pret' || type === 'acte' || type === 'ventebien');
    const choixCategorie = recategorisable
      ? `<span class="tab-select-icone-wrap" title="Changer la catégorie de cette échéance">
          <select class="tab-select-icone" onchange="changerCategorie('${dossierId}','${type}', this.value)" aria-label="Changer la catégorie de cette échéance">${optionsCategorie(type)}</select>
          <span class="tab-select-icone-chevron">${icone('chevron-down')}</span>
        </span>` : '';
    const editable = dossierId != null;
    const cleEdition = autreIndex != null ? 'autre-' + autreIndex : type;
    const idBase = `tabdate-${dossierId}-${cleEdition}`;

    const suppression = (dossierId && autreIndex != null)
      ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone ech-ico ech-ico-suppr" onclick="supprimerEcheanceAutre('${dossierId}', ${autreIndex})" title="Supprimer cette échéance" aria-label="Supprimer cette échéance">${icone('x')}</wa-button>`
      : (dossierId && iso && ['pret', 'acte', 'ventebien', 'appelFonds', 'projetEnvoye', 'rendezVousSignature'].includes(type))
        ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone ech-ico ech-ico-suppr" onclick="supprimerDateEcheance('${dossierId}', '${type}')" title="Supprimer cette date" aria-label="Supprimer cette date">${icone('x')}</wa-button>`
        : '';
    const modifiableManuellement = !(type === 'pret' && offrePretRecue) && !o.sansValidation && !o.comptant;
    const validation = (dossierId && iso && modifiableManuellement)
      ? (validee
        ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone ech-ico" onclick="devaliderEcheance('${dossierId}','${cleEdition}')" title="Annuler la validation" aria-label="Annuler la validation">${icone('rotate-ccw')}</wa-button>`
        : `<wa-button appearance="plain" size="s" type="button" class="bouton-icone ech-ico ech-ico-valider" onclick="validerEcheance('${dossierId}','${cleEdition}')" title="Marquer réalisée" aria-label="Marquer réalisée">${icone('check')}</wa-button>`)
      : '';
    const crayon = editable
      ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone ech-ico" onclick="activerEditionDate('${dossierId}','${cleEdition}')" title="${o.comptant ? 'Un prêt finalement ? Saisir sa date d’obtention' : (iso ? 'Corriger la date' : 'Saisir la date')}" aria-label="${o.comptant ? 'Saisir une date d’obtention du prêt' : (iso ? 'Corriger la date' : 'Saisir la date')}">${icone('pencil')}</wa-button>`
      : '';

    const infoConfiance = confiance && LIBELLES_CONFIANCE_ECHEANCE[confiance];
    const badgeConfiance = infoConfiance
      ? `<span class="dot-label ${infoConfiance.dl}" title="${infoConfiance.titre}">${infoConfiance.icone ? icone(infoConfiance.icone) : '<span class="dot"></span>'}${infoConfiance.texte}</span>`
      : '';
    // Retrouve la date dans l'aperçu PDF (uniquement si le PDF encore chargé est bien celui d'origine).
    const boutonVoir = (iso && page && pdfActuel)
      ? `<button type="button" class="lien-action" onclick="voirDateDansPdf(${page}, '${iso.split('-')[0]}')">${icone('eye')} Voir p.${page}</button>`
      : '';
    const sous = [badgeConfiance, boutonVoir, sousHtml || ''].filter(Boolean).join('');

    const etat = o.comptant ? { texte: '', cls: 'info' }
      : etatLigneEcheance(iso, { validee, offrePretRecue, sansPret: type === 'pret' && sansPret, etatSansDate: o.etatSansDate, etatFait: o.etatFait });
    const faite = etat.cls === 'ok';
    // Sans date, un geste en un clic à la place de l'état (« Projet envoyé » : voir echeancesOrdonneesFiche).
    const etatHtml = !iso && o.action
      ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide ech-action" onclick="${o.action.onclick}" title="${escapeAttr(o.action.titre || o.action.libelle)}">${escapeHtml(o.action.libelle)}</wa-button>`
      : etat.texte;
    return `<li class="ech ech-${type}${faite ? ' fait' : ''}${o.comptant ? ' ech-info' : ''}">
      <span class="dot-label dl-${type} ech-pastille" aria-hidden="true"><span class="dot"></span></span>
      <span class="ech-nom-cell"><span class="ech-nom${o.fort ? ' ech-nom-fort' : ''}">${label}</span>${choixCategorie}</span>
      <span class="ech-date-cell">
        <span class="ech-date" id="${idBase}-aff" title="${iso ? escapeAttr(formatDateFr(iso)) : ''}">${o.comptant ? '' : dateCourteEcheance(iso)}${iso && o.heure ? `<span class="ech-heure"> · ${escapeHtml(o.heure)}</span>` : ''}</span>
        ${editable ? `<span class="tab-date-edition" id="${idBase}-edit" hidden>
          <input type="date" class="tab-date-input" id="${idBase}-input" value="${iso || ''}" onkeydown="if(event.key==='Enter'){event.preventDefault();validerEditionDate('${dossierId}','${cleEdition}');}">
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-valider" onclick="validerEditionDate('${dossierId}','${cleEdition}')" title="Valider" aria-label="Valider la date">✓</wa-button>
        </span>` : ''}
      </span>
      <span class="ech-etat ${etat.cls}">${etatHtml}</span>
      <span class="ech-actions">${crayon}${validation}${suppression}</span>
      ${sous ? `<div class="ech-sous">${sous}</div>` : ''}
    </li>`;
  }

  // Carte « Envoi au client » de la fiche : deux entrées, chacune avec sa date — « Envoi appel de
  // fonds » (d.appelFonds) et « Envoi projet » (d.projetEnvoye). Une date saisie vaut envoi fait
  // (marquerAppelFondsSelonDate / marquerProjetEnvoyeSelonDate, via validerEditionDate) : pas de
  // bouton « Marquer réalisée » ici, la date EST la validation. Chaque ligne réutilise le même
  // mécanisme crayon → champ date → ✓ que les autres cartes (mêmes id tabdate-<id>-<cle>).
  var ENVOIS_AVANT_SIGNATURE = [
    { cle: 'appelFonds', label: 'Envoi appel de fonds' },
    { cle: 'projetEnvoye', label: 'Envoi projet' }
  ];

  // Sous « Envoi appel de fonds », une fois l'appel validé (date saisie, validation manuelle ou
  // relevé dans l'agenda) : « Confirmer la réception des fonds » ouvre l'email au client (voir
  // construireEmailReceptionFonds). Une fois envoyé, la date s'affiche et le bouton devient
  // « Renvoyer », comme pour le questionnaire de satisfaction.

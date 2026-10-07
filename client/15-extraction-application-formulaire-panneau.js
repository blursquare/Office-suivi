  // ==== EXTRACTION STRUCTURÉE : application au formulaire et panneau de révision ====

  // Dernier résultat d'extraction (regex, puis complété par l'IA) et trace de ce que NOUS avons
  // écrit dans chaque champ : un champ dont la valeur ne correspond plus à ce qu'on y avait mis a
  // été modifié par l'utilisateur, et ne doit plus jamais être écrasé (y compris par une réponse
  // IA qui arrive plusieurs dizaines de secondes après l'import).
  let extractionActuelle = null;
  let valeursAppliquees = {};

  function appliquerValeurChamp(id, valeur) {
    const champ = document.getElementById(id);
    if (!champ || valeur === null || valeur === undefined || valeur === '') return false;
    const actuel = (champ.value || '').trim();
    const deriereValeur = valeursAppliquees[id] === undefined ? '' : String(valeursAppliquees[id]);
    if (actuel !== '' && actuel !== deriereValeur) return false; // saisie de l'utilisateur : intouchable
    champ.value = String(valeur);
    valeursAppliquees[id] = String(valeur);
    return true;
  }

  // Un champ email déjà rempli à la main garde son adresse ; celles lues (compromis, Authentic) s'y
  // ajoutent (étude, 02/10 : « garder les deux »).
  function appliquerEmailsChamp(id, valeur) {
    if (appliquerValeurChamp(id, valeur)) return true;
    const champ = document.getElementById(id);
    if (!champ || !valeur) return false;
    const fusion = fusionnerEmailsTexte(champ.value, [valeur]);
    if (fusion === (champ.value || '').trim()) return false;
    champ.value = fusion;
    return true;
  }

  function appliquerExtractionAuFormulaire(extraction) {
    if (!extraction) return;
    const champs = extraction.champs || {};
    if (champs.nom) appliquerValeurChamp('f-nom', champs.nom.valeur);
    if (champs.prixVente) appliquerValeurChamp('f-prix-vente', champs.prixVente.valeur);
    if (champs.prixMobilier) appliquerValeurChamp('f-prix-mobilier', champs.prixMobilier.valeur);
    if (champs.emailAcquereur) appliquerEmailsChamp('f-email-acquereur', champs.emailAcquereur.valeur);
    if (champs.emailVendeur) appliquerEmailsChamp('f-email-vendeur', champs.emailVendeur.valeur);
    // Agence retrouvée dans le Répertoire (étude 05/10) : son nom tel qu'il y est enregistré, la source dit d'où il vient.
    if (champs.nomAgence && champs.nomAgence.valeur) {
      const rep = agenceDepuisRepertoire(champs.nomAgence.valeur, repertoireContacts);
      if (rep && rep.organisme !== champs.nomAgence.valeur) {
        champs.nomAgence.valeurActe = champs.nomAgence.valeurActe || champs.nomAgence.valeur;
        champs.nomAgence.valeur = rep.organisme;
        champs.nomAgence.raison = `Retrouvée dans le Répertoire (lu dans l’acte : « ${champs.nomAgence.valeurActe} »).`;
      }
    }
    if (champs.nomAgence) appliquerValeurChamp('f-nom-agence', champs.nomAgence.valeur);
    if (champs.honorairesAgence) appliquerValeurChamp('f-honoraires-agence', champs.honorairesAgence.valeur);
    if (champs.depotGarantie) appliquerValeurChamp('f-depot-garantie', champs.depotGarantie.valeur);
    if (champs.sequestreDepot) appliquerValeurChamp('f-sequestre-depot', champs.sequestreDepot.valeur);
    const adresse = extraction.bien && extraction.bien.adresse;
    if (adresse && adresse.adresseComplete) appliquerValeurChamp('f-adresse-bien', normaliserAdresse(adresse.adresseComplete));

    // Dates butoir : traiterTexte() remplit déjà les champs à partir des chips, mais l'objet
    // d'extraction connaît aussi les échéances qui n'ont PAS donné de chip — typiquement une date
    // calculée depuis un délai que detecterDatesDepuisTexte n'a pas su convertir (voir
    // construireDatesMetier). Sans ce report, la date s'affichait dans « Ce que l'outil a compris »
    // mais restait absente du formulaire, donc du dossier enregistré. appliquerValeurChamp()
    // n'écrit jamais par-dessus une valeur déjà posée : aucun risque d'écraser le chemin existant.
    const dates = extraction.dates || {};
    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      const champ = CHAMP_PAR_TYPE_DATE[typeDate];
      const objet = dates[typeDate];
      if (!objet || !objet.valeur) continue;
      const input = document.getElementById('f-' + champ);
      if (!input || input.value) continue;
      appliquerValeurChamp('f-' + champ, objet.valeur);
      definirEcheanceActive(champ, true);
      if (objet.methode === 'CALCULATED') approxParType[champ] = true;
    }

    // Rôle de l'étude : pré-rempli UNIQUEMENT sur une déduction confirmée (mention explicite dans
    // l'acte, ou règle métier satisfaite sans contradiction). La raison est affichée dans le
    // panneau, et le sélecteur reste modifiable — mais on ne bascule jamais un dossier en
    // « participant » sur une simple supposition : ce rôle masque la checklist des pièces.
    const notaires = extraction.notaires || {};
    if (notaires.statut === 'CONFIRMED' && notaires.roleEtude && notaires.origine !== 'ia') {
      const select = document.getElementById('f-role-notaire');
      if (select && !choixManuelDossierWizard('f-role-notaire') && (!valeursAppliquees['f-role-notaire'] || select.value === valeursAppliquees['f-role-notaire'])) {
        select.value = notaires.roleEtude;
        valeursAppliquees['f-role-notaire'] = notaires.roleEtude;
        noterOrigineDossierWizard('f-role-notaire', 'acte');
        majApercuPieces();
      }
    }
    // Notaire de chaque côté, lu dans l'acte et complété par le carnet : proposé dans les deux
    // champs de l'étape Finaliser, où l'étude le corrige avant d'enregistrer.
    const cotes = cotesNotairesPourDossier(extraction.notaires);
    // Chaque notaire lu dans l'acte est remplacé par sa fiche du Répertoire quand elle est trouvée (étude 05/10).
    if (appliquerValeurChamp('f-notaire-vendeur', notaireDepuisRepertoire(cotes.vendeur, carnetConfreres))) noterOrigineDossierWizard('f-notaire-vendeur', 'acte');
    if (appliquerValeurChamp('f-notaire-acquereur', notaireDepuisRepertoire(cotes.acquereur, carnetConfreres))) noterOrigineDossierWizard('f-notaire-acquereur', 'acte');
    if (cotes.coteInstrumentaire && appliquerValeurChamp('f-cote-instrumentaire', cotes.coteInstrumentaire)) noterOrigineDossierWizard('f-cote-instrumentaire', 'acte');
    remplirListeNotairesWizard(notairesProposesWizard().map(n => n.nom));
    majApercuPieces();
  }

  // ---- Notaires à la création (étude, 02/10 : « choisir le notaire et s'il est instrumentaire ou en
  // participation dès la création ») : les notaires lus dans l'acte ET dans Authentic sont listés,
  // chacun se place d'un clic du côté du vendeur, de l'acquéreur ou des deux ; un notaire nommé sans
  // son côté n'est plus « perdu » dans la liste déroulante. Le rôle de l'étude se déduit du côté qui
  // reçoit l'acte, comme sur la fiche (deduireRoleNotaireDossier).
  function notairesProposesWizard() {
    const c = cotesNotairesPourDossier(extractionActuelle ? extractionActuelle.notaires : null);
    const liste = c.detectes.map(n => ({ nom: notaireDepuisRepertoire(n.nom, carnetConfreres), role: n.role, source: 'acte' }));
    const auth = exportAuthenticActuel && exportAuthenticActuel.infosAuthentic && exportAuthenticActuel.infosAuthentic.notaire;
    if (auth) {
      // Le notaire d'Authentic prend le libellé du répertoire ; s'il n'y désigne personne, il n'est pas proposé (étude 07/10 :
      // « les notaires du répertoire partout dans CLAIRE »).
      const nom = notaireDepuisRepertoire(auth, carnetConfreres);
      const cle = normaliserPourRecherche(auth).replace(/[^a-z]+/g, ' ').trim();
      if (nom && !liste.some(n => normaliserPourRecherche(n.nom).includes(cle) || n.nom === nom)) liste.push({ nom, role: null, source: 'authentic' });
    }
    return liste.filter((n, i, l) => n.nom && l.findIndex(x => x.nom === n.nom) === i);
  }

  // Pure : rôle de l'étude d'après les deux notaires et le côté qui reçoit l'acte ; null si l'étude
  // n'est reconnue d'aucun côté ou si personne ne reçoit encore l'acte.
  function roleEtudeDeduitWizard(notaireVendeur, notaireAcquereur, coteInstrumentaire) {
    const etude = notaireVendeur && estEtude({ nom: notaireVendeur }) ? 'vendeur'
      : (notaireAcquereur && estEtude({ nom: notaireAcquereur }) ? 'acquereur' : null);
    if (!etude || !coteInstrumentaire) return null;
    if (etude === 'vendeur' && notaireAcquereur && estEtude({ nom: notaireAcquereur })) return 'instrumentaire';
    return etude === coteInstrumentaire ? 'instrumentaire' : 'participant';
  }

  // Étude, 02/10 : « le notaire était vide ». Le notaire du dossier dans Authentic (« Parties prenantes »),
  // quand ni le compromis ni la saisie n'ont placé de notaire, va des deux côtés et reçoit l'acte
  // (choix de l'étude : « les deux côtés » ; un confrère se corrige à la main).
  function placerNotaireAuthenticParDefaut() {
    const v = document.getElementById('f-notaire-vendeur');
    const a = document.getElementById('f-notaire-acquereur');
    if (!v || !a || v.value.trim() || a.value.trim()) return false;
    const n = notairesProposesWizard().find(x => x.source === 'authentic');
    if (!n) return false;
    if (appliquerValeurChamp('f-notaire-vendeur', n.nom)) noterOrigineDossierWizard('f-notaire-vendeur', 'authentic');
    if (appliquerValeurChamp('f-notaire-acquereur', n.nom)) noterOrigineDossierWizard('f-notaire-acquereur', 'authentic');
    const sel = document.getElementById('f-cote-instrumentaire');
    if (sel && !sel.value) { sel.value = 'vendeur'; noterOrigineDossierWizard('f-cote-instrumentaire', 'authentic'); }
    return true;
  }

  function placerNotaireWizard(index, cote) {
    const n = notairesProposesWizard()[index];
    if (!n) return;
    if (cote === 'vendeur' || cote === 'deux') { document.getElementById('f-notaire-vendeur').value = n.nom; noterOrigineDossierWizard('f-notaire-vendeur', 'manuel'); }
    if (cote === 'acquereur' || cote === 'deux') { document.getElementById('f-notaire-acquereur').value = n.nom; noterOrigineDossierWizard('f-notaire-acquereur', 'manuel'); }
    // Un seul notaire pour les deux parties : c'est lui qui reçoit l'acte.
    const sel = document.getElementById('f-cote-instrumentaire');
    if (cote === 'deux' && sel && !sel.value) { sel.value = 'vendeur'; noterOrigineDossierWizard('f-cote-instrumentaire', 'manuel'); }
    else if (n.role === 'instrumentaire' && sel && !sel.value && cote !== 'deux') { sel.value = cote; noterOrigineDossierWizard('f-cote-instrumentaire', 'manuel'); }
    majApercuPieces();
    if (extractionActuelle) renderPanneauRevision(extractionActuelle);
  }

  function renderNotairesWizard() {
    const bloc = document.getElementById('notaires-wizard');
    if (!bloc) return;
    const liste = notairesProposesWizard();
    if (!liste.length) { bloc.innerHTML = ''; return; }
    const v = (document.getElementById('f-notaire-vendeur') || {}).value || '';
    const a = (document.getElementById('f-notaire-acquereur') || {}).value || '';
    const place = (nom) => [v === nom ? 'vendeur' : '', a === nom ? 'acquéreur' : ''].filter(Boolean).join(' et ');
    const aPlacer = liste.some(n => !place(n.nom));
    // Tous les notaires lus sont déjà dans les champs : rien à proposer (étude, 02/10 : « brouillon »).
    if (!aPlacer) { bloc.innerHTML = ''; return; }
    bloc.innerHTML = `
      <div class="notaires-wizard-titre">Notaires lus ${aPlacer && !v && !a ? '<span class="dot-label dl-pret"><span class="dot"></span>Côté non précisé : à placer</span>' : ''}</div>
      <ul class="notaires-wizard-liste">${liste.map((n, i) => {
        const p = place(n.nom);
        return `<li class="notaires-wizard-ligne">
          <span class="notaires-wizard-nom">${escapeHtml(n.nom)}<span class="hint"> · ${n.source === 'authentic' ? 'Authentic' : 'compromis'}${n.role === 'instrumentaire' ? ', reçoit l’acte' : n.role === 'participant' ? ', participe' : ''}${p ? ` · ${p}` : ''}</span></span>
          <span class="notaires-wizard-gestes">
            <button type="button" class="lien-action" onclick="placerNotaireWizard(${i}, 'vendeur')">Vendeur</button>
            <button type="button" class="lien-action" onclick="placerNotaireWizard(${i}, 'acquereur')">Acquéreur</button>
            <button type="button" class="lien-action" onclick="placerNotaireWizard(${i}, 'deux')">Les deux</button>
          </span>
        </li>`;
      }).join('')}</ul>`;
  }

  function deduireRoleEtudeWizard() {
    const v = (document.getElementById('f-notaire-vendeur') || {}).value || '';
    const a = (document.getElementById('f-notaire-acquereur') || {}).value || '';
    const cote = (document.getElementById('f-cote-instrumentaire') || {}).value || '';
    const role = roleEtudeDeduitWizard(v.trim(), a.trim(), cote);
    const select = document.getElementById('f-role-notaire');
    const marque = document.getElementById('role-etude-deduit');
    if (role && select && !choixManuelDossierWizard('f-role-notaire')) {
      if (select.value !== role || !originesDossierWizard['f-role-notaire'] || originesDossierWizard['f-role-notaire'] === 'defaut') noterOrigineDossierWizard('f-role-notaire', 'deduit');
      select.value = role;
    }
    if (marque) marque.textContent = role ? '· déduit des notaires' : '';
    placerEtudeParDefautWizard();
  }

  // Liste proposée sous les deux champs notaire de l'assistant : les notaires lus dans l'acte,
  // puis ceux du carnet des confrères (notre étude comprise).
  function remplirListeNotairesWizard(detectes) {
    const liste = document.getElementById('f-notaires-liste');
    if (!liste) return;
    const noms = (detectes || []).filter(Boolean);
    const options = noms.concat(optionsNotairesCarnet(carnetConfreres).filter(n => noms.indexOf(n) === -1));
    liste.setAttribute('data-base', JSON.stringify(noms));
    liste.innerHTML = options.map(n => `<option value="${escapeAttr(n)}"></option>`).join('');
  }

  // Champ notaire de l'assistant, une fois la saisie validée : le notaire est retrouvé dans l'annuaire et son nom complété ;
  // notre office s'écrit « Maître Sophie GOSSART (BLOIS) » (étude 05/10).
  function completerNotaireWizard(champ) {
    if (!champ) return;
    const saisi = champ.value.trim();
    const complet = completerNomNotaire(saisi, carnetConfreres);
    // Seul un notaire du répertoire est accepté, comme sur la fiche (étude 07/10).
    if (saisi && !notaireDuRepertoire(complet, carnetConfreres)) {
      champ.value = '';
      afficherToast(`« ${saisi} » ne désigne pas un seul notaire du répertoire : choisissez-le dans la liste.`, 'OK', null);
    } else if (complet !== saisi) champ.value = complet;
    noterOrigineDossierWizard(champ.id, 'manuel');
    majApercuPieces();
    if (extractionActuelle) renderPanneauRevision(extractionActuelle);
  }

  // Rôle et côté choisis, notre office par défaut dans son champ notaire (étude 05/10 : « Sophie GOSSART de base quand il s'agit
  // de notre office ») : instrumentaire → du côté qui reçoit l'acte, participant → de l'autre côté. Une seule fois par champ, et
  // jamais sur une saisie ou un choix à la main.
  function placerEtudeParDefautWizard() {
    const cote = (document.getElementById('f-cote-instrumentaire') || {}).value || '';
    const role = (document.getElementById('f-role-notaire') || {}).value || '';
    if (!cote || !role) return;
    // Le rôle par défaut du formulaire (instrumentaire) n'est pas un choix : il faut qu'il soit lu, déduit ou choisi à la main.
    const origineRole = originesDossierWizard['f-role-notaire'];
    if (!origineRole || origineRole === 'defaut') return;
    const coteEtude = role === 'participant' ? (cote === 'vendeur' ? 'acquereur' : 'vendeur') : cote;
    const id = coteEtude === 'vendeur' ? 'f-notaire-vendeur' : 'f-notaire-acquereur';
    if (valeursAppliquees[id] !== undefined || choixManuelDossierWizard(id)) return;
    if (appliquerValeurChamp(id, NOTAIRE_ETUDE_LIBELLE)) noterOrigineDossierWizard(id, 'defaut');
  }

  // Côté qui reçoit l'acte pour un nouveau dossier. Celui lu dans l'acte tant que le notaire de ce
  // côté n'a pas été changé ; sinon il découle du rôle choisi et du côté où figure notre étude
  // (instrumentaire : notre côté ; participant : l'autre). Rien n'est deviné sinon. Pure.
  function coteInstrumentaireNouveauDossier(cotesDetectes, vendeur, acquereur, roleNotaire) {
    const c = cotesDetectes || {};
    if (c.coteInstrumentaire === 'vendeur' && vendeur && vendeur === completerNomNotaire(c.vendeur, carnetConfreres)) return 'vendeur';
    if (c.coteInstrumentaire === 'acquereur' && acquereur && acquereur === completerNomNotaire(c.acquereur, carnetConfreres)) return 'acquereur';
    const etude = vendeur && estEtude({ nom: vendeur }) ? 'vendeur' : (acquereur && estEtude({ nom: acquereur }) ? 'acquereur' : null);
    if (!etude) return null;
    const autre = etude === 'vendeur' ? 'acquereur' : 'vendeur';
    if (roleNotaire === 'participant') return (autre === 'vendeur' ? vendeur : acquereur) ? autre : null;
    return etude;
  }

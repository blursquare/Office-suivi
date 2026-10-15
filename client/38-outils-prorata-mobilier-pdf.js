  // ==== ARBITRAGE DU FORFAIT MOBILIER (succession) ====
  // Porté d'un artefact fourni par l'étude ("Arbitrage du forfait mobilier"), dont seule la
  // STRUCTURE est reprise : sa palette bordeaux et ses polices (Fraunces/Source Sans/IBM Plex) ont
  // été jetées au profit des jetons et du gabarit déjà en place ici (.calc-card/.calc-champ/
  // .dash-grid, comme le simulateur de provision et le prorata) — même discipline que pour les
  // maquettes précédentes, un seul système visuel dans tout l'outil.
  //
  // Ce que l'outil répond : à défaut d'inventaire ou de prisée, les meubles meublants d'une
  // succession sont évalués à un FORFAIT de 5 % de l'actif successoral (art. 764 du CGI). Un
  // inventaire notarié avec prisée par un commissaire de justice écarte ce forfait — mais il a un
  // coût. La question du client est donc arithmétique : ce que la prisée fait gagner en droits
  // couvre-t-il ce qu'elle coûte ?
  //
  // Décision structurante, reprise telle quelle de l'artefact et à ne PAS défaire : l'outil ne
  // calcule JAMAIS les droits de succession. Le notaire saisit les deux montants qu'il a déjà
  // simulés de son côté. Construire ici un moteur de droits (abattements, tranches, degré de
  // parenté, assurance-vie…) reviendrait à présenter comme fiable un barème que personne n'a
  // audité — c'est exactement la réserve déjà posée sur le simulateur de provision.

  // Les postes du coût, dans l'ordre où ils apparaissent au décompte. AUCUN n'est affiché tant
  // qu'il n'est pas chiffré : tous les dossiers n'ont ni comparant absent ni déplacement, et une
  // ligne « − 0 € » n'apprend rien à personne — c'est aussi ce que dit l'écran de saisie ("les
  // postes laissés vides ne sont pas comptés").
  var LIGNES_COUT_INVENTAIRE = [
    { cle: 'ouverture', label: "Provision — acte d'inventaire" },
    { cle: 'prisee', label: 'Prisée du commissaire de justice, TTC' },
    { cle: 'cloture', label: 'Provision — acte de clôture' },
    { cle: 'serment', label: 'Prestation(s) de serment des absents' },
    { cle: 'trajet', label: 'Frais de trajet' }
  ];

  // Un champ vide n'est pas un zéro : il vaut `null`, ce qui distingue « pas encore renseigné » de
  // « rien à compter ». C'est cette distinction qui permet de ne pas afficher de verdict tant que
  // les deux simulations de droits n'ont pas été saisies.
  function nombreSaisiInventaire(valeur) {
    if (valeur === null || valeur === undefined) return null;
    const texte = String(valeur).trim();
    if (!texte) return null;
    const n = Number(texte.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // Aucun montant négatif n'a de sens ici, et un coût négatif gonflerait silencieusement
  // l'économie affichée : on le ramène à zéro plutôt que de le laisser fausser le résultat.
  function montantPositifInventaire(valeur) {
    const n = nombreSaisiInventaire(valeur);
    return n === null ? 0 : Math.max(0, n);
  }

  // Fonction pure (testable) : ne lit aucun champ, ne touche à rien. `saisie` porte des chaînes
  // telles que les rend un <input>, vides comprises.
  function calculerArbitrageInventaire(saisie) {
    const s = saisie || {};
    // Des droits négatifs n'existent pas : ramenés à zéro, comme les coûts (audit 12/10 — un signe moins tapé
    // faisait une économie fausse).
    const positif = (v) => { const n = nombreSaisiInventaire(v); return n === null ? null : Math.max(0, n); };
    const droitsSans = positif(s.droitsSans);
    const droitsAvec = positif(s.droitsAvec);
    // Les deux simulations sont indispensables : sans elles il n'y a pas d'économie à comparer au
    // coût, et un verdict rendu sur des champs vides afficherait « non recommandé » sur un écran
    // où personne n'a encore rien saisi.
    const complet = droitsSans !== null && droitsAvec !== null;
    const brutes = complet ? droitsSans - droitsAvec : 0;

    const serment = montantPositifInventaire(s.sermentNb) * montantPositifInventaire(s.sermentUnit);
    const trajet = s.trajetActif
      ? montantPositifInventaire(s.trajetNb) * montantPositifInventaire(s.trajetUnit)
      : 0;
    const montants = {
      ouverture: montantPositifInventaire(s.fraisOuverture),
      prisee: montantPositifInventaire(s.prisee),
      cloture: montantPositifInventaire(s.fraisCloture),
      serment: serment,
      trajet: trajet
    };

    const lignes = LIGNES_COUT_INVENTAIRE
      .filter(l => montants[l.cle] > 0)
      .map(l => ({ cle: l.cle, label: l.label, montant: montants[l.cle] }));
    const cout = lignes.reduce((total, l) => total + l.montant, 0);

    return {
      complet: complet,
      droitsSans: droitsSans === null ? 0 : droitsSans,
      droitsAvec: droitsAvec === null ? 0 : droitsAvec,
      brutes: brutes,
      lignes: lignes,
      cout: cout,
      net: complet ? brutes - cout : 0
    };
  }

  // Trois états, pas deux. L'artefact d'origine n'en avait que deux (favorable / défavorable), ce
  // qui affichait « Non recommandé » sur un formulaire encore vierge — une réponse tranchée à une
  // question que personne n'a posée, contraire à la règle déjà en place sur les deux autres
  // simulateurs ("une valeur pré-remplie se prend pour un résultat"). D'où `indetermine`.
  //
  // Volontairement PAS de quatrième état « marginal » (une économie nette de quelques dizaines
  // d'euros, techniquement positive mais qui ne vaut pas la démarche) : le seuil à partir duquel
  // l'inventaire cesse d'être intéressant est un jugement que l'étude n'a pas donné, l'inventer
  // reviendrait à poser une règle métier de ma propre initiative.
  var VERDICTS_INVENTAIRE = {
    indetermine: {
      libelle: 'À compléter',
      dl: 'dl-neutre',
      message: 'Saisissez les droits de succession simulés dans les deux hypothèses pour obtenir le verdict.'
    },
    defavorable: {
      libelle: 'Non recommandé',
      dl: 'dl-urgent',
      message: "Le coût de l'inventaire atteint ou dépasse l'économie de droits : la démarche ne fait rien gagner au client et ne peut pas être recommandée sur ce seul critère."
    },
    favorable: {
      libelle: 'Intéressant pour le client',
      dl: 'dl-success',
      message: "L'inventaire fait économiser des droits de succession au client, même une fois son coût déduit : la démarche est financièrement intéressante et peut être recommandée."
    }
  };

  function verdictArbitrageInventaire(resultat) {
    const cle = !resultat || !resultat.complet
      ? 'indetermine'
      : (resultat.net > 0 ? 'favorable' : 'defavorable');
    return Object.assign({ cle: cle }, VERDICTS_INVENTAIRE[cle]);
  }

  function lireSaisieInventaire() {
    const val = id => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    const coche = document.getElementById('inv-trajet-actif');
    return {
      dossier: val('inv-dossier'),
      droitsSans: val('inv-droits-sans'),
      droitsAvec: val('inv-droits-avec'),
      fraisOuverture: val('inv-frais-ouverture'),
      prisee: val('inv-prisee'),
      fraisCloture: val('inv-frais-cloture'),
      sermentNb: val('inv-serment-nb'),
      sermentUnit: val('inv-serment-unit'),
      trajetActif: !!(coche && coche.checked),
      trajetNb: val('inv-trajet-nb'),
      trajetUnit: val('inv-trajet-unit')
    };
  }

  function calculerInventaireAffichage() {
    const saisie = lireSaisieInventaire();
    const r = calculerArbitrageInventaire(saisie);
    const v = verdictArbitrageInventaire(r);

    const badge = document.getElementById('inv-verdict-badge');
    if (badge) badge.innerHTML = `<span class="dot-label ${v.dl}"><span class="dot"></span>${escapeHtml(v.libelle)}</span>`;
    const chiffre = document.getElementById('inv-verdict-montant');
    if (chiffre) {
      chiffre.textContent = r.complet ? formaterPrix(r.net) : '—';
      chiffre.classList.toggle('inv-montant-negatif', r.complet && r.net <= 0);
    }
    const texte = document.getElementById('inv-verdict-texte');
    if (texte) texte.textContent = v.message;

    const decompte = document.getElementById('inv-decompte');
    if (decompte) decompte.style.display = r.complet ? '' : 'none';
    if (r.complet) {
      const pose = (id, montant, signe) => {
        const el = document.getElementById(id);
        if (el) el.textContent = (signe || '') + formaterPrix(montant);
      };
      pose('inv-l-droits-sans', r.droitsSans);
      pose('inv-l-droits-avec', r.droitsAvec);
      pose('inv-l-brutes', r.brutes);
      pose('inv-l-cout', r.cout, '− ');
      pose('inv-l-net', r.net);
      const corps = document.getElementById('inv-decompte-cout');
      if (corps) {
        corps.innerHTML = r.lignes
          .map(l => `<tr><td>${escapeHtml(l.label)}</td><td>− ${formaterPrix(l.montant)}</td></tr>`)
          .join('');
      }
    }

    construireNoteInventaire(saisie, r, v);
  }

  // La note imprimable est reconstruite à chaque saisie plutôt qu'au clic sur « Imprimer » : un
  // Ctrl+P direct depuis l'onglet doit sortir la même feuille que le bouton.
  function construireNoteInventaire(saisie, r, v) {
    const cible = document.getElementById('inv-print');
    if (!cible) return;
    if (!r.complet) { cible.innerHTML = ''; return; }
    const titre = (saisie.dossier || '').trim() || 'Succession';
    const lignes = r.lignes
      .map(l => `<tr><td>${escapeHtml(l.label)}</td><td>− ${formaterPrix(l.montant)}</td></tr>`)
      .join('');
    cible.innerHTML = `
      <h1>${escapeHtml(titre)}</h1>
      <p class="inv-print-sous">Note de calcul — arbitrage forfait mobilier / inventaire avec prisée · ${escapeHtml(formatDateFr(isoAujourdHui()))}</p>
      <table>
        <tr><td>Droits de succession sans prisée (forfait mobilier)</td><td>${formaterPrix(r.droitsSans)}</td></tr>
        <tr><td>Droits de succession avec prisée</td><td>${formaterPrix(r.droitsAvec)}</td></tr>
        <tr class="inv-print-total"><td>Économies brutes</td><td>${formaterPrix(r.brutes)}</td></tr>
        ${lignes}
        <tr class="inv-print-total"><td>Économies nettes estimées</td><td>${formaterPrix(r.net)}</td></tr>
      </table>
      <p class="inv-print-verdict"><strong>${escapeHtml(v.libelle)}</strong> — ${escapeHtml(v.message)}</p>
      <p class="inv-print-note">Simulation indicative établie sur la base des éléments saisis. Le forfait mobilier de 5 % (art. 764 du CGI) s'applique à défaut d'inventaire ou de prisée ; il peut être écarté par un inventaire notarié avec prisée par un commissaire de justice. La fourchette de prisée et le nombre de prestations de serment sont à confirmer avant tout conseil au client.</p>`;
  }

  function basculerTrajetsInventaire() {
    const coche = document.getElementById('inv-trajet-actif');
    const bloc = document.getElementById('inv-trajet-champs');
    if (bloc) bloc.style.display = coche && coche.checked ? '' : 'none';
    calculerInventaireAffichage();
  }

  // Coûts de l'inventaire posés d'office, demandé par l'étude : ce sont toujours les mêmes montants
  // d'un dossier à l'autre (on les retouche parfois), les ressaisir à chaque simulation ne sert à
  // rien. Repris de l'artefact d'origine. Les deux simulations de DROITS restent vides, elles :
  // elles changent à chaque succession, et tant qu'elles manquent aucun verdict n'est affiché —
  // la règle « un montant déjà là se prend pour un résultat » continue donc de protéger ce qui
  // décide réellement de la réponse. Les trajets restent décochés (la plupart des dossiers n'en
  // ont pas), le nombre d'un trajet est seulement prêt si on les coche.
  var COUTS_INVENTAIRE_DEFAUT = {
    'inv-frais-ouverture': 300,
    'inv-prisee': 600,
    'inv-frais-cloture': 300,
    'inv-serment-nb': 1,
    'inv-serment-unit': 240,
    'inv-trajet-nb': 1
  };

  // Remet l'écran dans son état de départ : coûts habituels, droits et intitulé vides.
  function reinitialiserInventaire() {
    ['inv-dossier', 'inv-droits-sans', 'inv-droits-avec', 'inv-frais-ouverture', 'inv-prisee',
      'inv-frais-cloture', 'inv-serment-nb', 'inv-serment-unit', 'inv-trajet-nb', 'inv-trajet-unit']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = Object.prototype.hasOwnProperty.call(COUTS_INVENTAIRE_DEFAUT, id) ? String(COUTS_INVENTAIRE_DEFAUT[id]) : '';
      });
    const coche = document.getElementById('inv-trajet-actif');
    if (coche) coche.checked = false;
    // Plus rattaché à la fiche d'une succession (client/76).
    if (typeof majBoutonArbitrageFiche === 'function') { arbitrageDossierId = ''; majBoutonArbitrageFiche(); }
    basculerTrajetsInventaire();
  }

  // Premier passage sur l'onglet seulement : le quitter puis y revenir ne doit pas écraser une
  // simulation en cours (même principe que initProrata / initQuotites).
  var inventaireInitialise = false;
  function initInventaire() {
    if (inventaireInitialise) { calculerInventaireAffichage(); return; }
    inventaireInitialise = true;
    reinitialiserInventaire();
  }

  function imprimerNoteInventaire() {
    const r = calculerArbitrageInventaire(lireSaisieInventaire());
    if (!r.complet) {
      afficherToast('Saisissez les droits de succession dans les deux hypothèses avant d\'imprimer la note.', 'OK', null);
      return;
    }
    window.print();
  }

  // ---- Quotités d'acquisition (onglet indépendant, sans enregistrement) ----
  //
  // Porté de l'artefact « Quotité des acquéreurs » fourni par l'étude. Repris : la structure du
  // formulaire (nature du bien, acquéreurs, montant de l'opération, origine du financement) et,
  // MOT POUR MOT, le texte des clauses de l'annexe — c'est le modèle rédactionnel de l'étude, pas
  // à reformuler sans lui (même règle que PROCEDURE_FONDS). Abandonnés : la palette or/crème et les
  // polices de l'artefact (jetons de CLAIRE à la place), et ses montants d'exemple — un formulaire
  // prérempli se prend pour un résultat (même décision que les deux simulateurs voisins).
  //
  // Deux corrections de fond par rapport à l'artefact, toutes deux vérifiées par des tests :
  //   • les proportions sont réparties au plus fort reste (repartirPourcentages) : arrondies
  //     chacune de leur côté, trois tiers donnaient 33,33 % × 3 = 99,99 %, une annexe qui ne
  //     totalise pas 100 % ne se signe pas ;
  //   • un acquéreur qui ne finance rien est SIGNALÉ (sa quotité serait nulle, il n'acquerrait rien
  //     — presque toujours un montant oublié), là où l'artefact l'aurait écrit « 0,00 % » dans l'acte.

  var TYPES_BIEN_QUOTITES = ['immeuble', 'terrain'];

  // Libellés d'opération proposés selon la nature du bien, montants VIDES. « Prorata de taxes
  // foncières » part en mémoire : son montant n'est connu qu'au décompte de la vente.
  function lignesOperationParDefaut(typeBien) {
    const libelles = typeBien === 'terrain'
      ? ["Prix d'acquisition du terrain", 'Coût de la construction', "Frais et droits de l'acte de vente",
        'Frais de dossier bancaire', 'Frais de garantie']
      : ["Prix d'acquisition", "Frais et droits de l'acte de vente", 'Frais de dossier bancaire', 'Frais de garantie'];
    return libelles.map(libelle => ({ libelle, montant: null, memoire: false }))
      .concat([{ libelle: 'Prorata de taxes foncières', montant: null, memoire: true }]);
  }

  function montantQuotite(v) {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  // Répartit 100 % entre des montants au centième près, par la méthode du plus fort reste : chaque
  // part est tronquée au centième, puis les centièmes manquants vont aux parts dont le reste est le
  // plus grand. Le total vaut toujours exactement 100 dès qu'un montant est positif.
  function repartirPourcentages(montants) {
    const valeurs = (montants || []).map(montantQuotite);
    const total = valeurs.reduce((a, b) => a + b, 0);
    if (!total) return valeurs.map(() => 0);
    const exacts = valeurs.map(v => v / total * 10000);
    const bases = exacts.map(Math.floor);
    let manquants = 10000 - bases.reduce((a, b) => a + b, 0);
    const ordre = exacts.map((e, i) => ({ i, reste: e - bases[i] }))
      .sort((a, b) => b.reste - a.reste || a.i - b.i);
    for (let k = 0; manquants > 0 && k < ordre.length; k++, manquants--) bases[ordre[k].i] += 1;
    return bases.map(b => b / 100);
  }

  function calculerQuotites(etat) {
    const e = etat || {};
    const acquereurs = Array.isArray(e.acquereurs) ? e.acquereurs : [];
    const lignes = Array.isArray(e.lignes) ? e.lignes : [];
    const sources = Array.isArray(e.sources) ? e.sources : [];
    const arrondi = v => Math.round(v * 100) / 100;

    const totalOperation = arrondi(lignes.reduce((s, l) => s + (l.memoire ? 0 : montantQuotite(l.montant)), 0));
    const totalParSource = {};
    sources.forEach(src => {
      totalParSource[src.id] = arrondi(acquereurs.reduce((s, a) => s + montantQuotite((src.montants || {})[a.id]), 0));
    });
    const totaux = acquereurs.map(a =>
      arrondi(sources.reduce((s, src) => s + montantQuotite((src.montants || {})[a.id]), 0)));
    const totalFinancement = arrondi(totaux.reduce((a, b) => a + b, 0));
    const pourcentages = repartirPourcentages(totaux);
    const ecart = arrondi(totalFinancement - totalOperation);

    return {
      totalOperation,
      totalFinancement,
      totalParSource,
      ecart,
      // Tolérance d'un demi-euro, comme l'artefact : au-delà, ce n'est plus un arrondi.
      couvert: totalOperation > 0 && Math.abs(ecart) < 0.5,
      parAcquereur: acquereurs.map((a, i) => ({ id: a.id, total: totaux[i], pourcentage: pourcentages[i] })),
      // Quotité nulle = l'acquéreur n'acquerrait rien. Signalé seulement quand d'autres financent :
      // tant que rien n'est saisi, tout le monde est à zéro et il n'y a rien à dire.
      sansFinancement: totalFinancement > 0 ? acquereurs.filter((a, i) => totaux[i] === 0).map(a => a.id) : []
    };
  }

  function civiliteAbregee(civilite) {
    if (civilite === 'Madame') return 'Mme';
    if (civilite === 'Monsieur') return 'M.';
    return civilite || '';
  }

  function nomAcquereurQuotite(a) {
    const nom = String(a.nom || '').trim();
    // Une société dont le nom porte déjà sa forme (« SCI DU MOULIN ») n'est pas « SCI SCI DU MOULIN » (audit 12/10).
    if (a.civilite === 'SCI' && nom && nomDitSociete(nom)) return nom;
    return `${civiliteAbregee(a.civilite)} ${nom || '……………'}`.trim();
  }

  function formaterPourcentageQuotite(p) {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p || 0) + ' %';
  }

  function phraseQuotitesAcquisition(acquereurs, calcul) {
    const acq = Array.isArray(acquereurs) ? acquereurs : [];
    if (!acq.length) return '';
    if (acq.length === 1) return `${nomAcquereurQuotite(acq[0])} acquiert le bien ci-dessus désigné en pleine propriété.`;
    const parts = acq.map((a, i) => `${formaterPourcentageQuotite(calcul.parAcquereur[i].pourcentage)} pour ${nomAcquereurQuotite(a)}`);
    return `${acq.map(nomAcquereurQuotite).join(' et ')} acquièrent le bien ci-dessus désigné en indivision, savoir : ${parts.join(', ')}.`;
  }

  // Lignes « Origine du financement » telles qu'elles s'écrivent dans l'annexe : un prêt en une
  // ligne (son total), un apport en une ligne PAR acquéreur.
  function lignesFinancementAnnexe(etat, calcul) {
    const lignes = [];
    (etat.sources || []).forEach(src => {
      if (src.type === 'pret') {
        lignes.push({ libelle: `Prêt${src.banque ? ' de ' + src.banque : ''}`, montant: calcul.totalParSource[src.id] || 0 });
      } else {
        (etat.acquereurs || []).forEach(a => {
          lignes.push({ libelle: `Apport personnel de ${nomAcquereurQuotite(a)}`, montant: montantQuotite((src.montants || {})[a.id]) });
        });
      }
    });
    return lignes;
  }

  function libelleSourceTableau(src) {
    if (src.type !== 'pret') return 'Apport personnel';
    return src.banque ? `PRET ${src.banque}` : 'PRET';
  }

  // Clauses de l'annexe, texte repris à l'identique de l'artefact de l'étude. `section` = amorce
  // soulignée suivie d'un tiret, `sous` = sous-titre en italique, `texte` = paragraphe simple.
  function clausesQuotites(etat) {
    const acq = etat.acquereurs || [];
    const indivision = acq.length >= 2;
    const prets = (etat.sources || []).filter(s => s.type === 'pret' && (s.banque || s.numero));
    const c = [];
    if (indivision) {
      if (prets.length) {
        const frag = prets.map(p => `le prêt${p.numero ? ' n°' + p.numero : ''} consenti par ${p.banque || '……………'}`).join(' et ');
        c.push({ type: 'section', amorce: 'Convention des acquéreurs - sort des prêts souscrits', texte: `Les acquéreurs ont convenu de rembourser ${frag} dans les proportions sus indiquées le tout sans que cette clause puisse être opposable au prêteur pour lequel la solidarité entre les emprunteurs a été expressément stipulée aux termes de l'emprunt.` });
      }
      c.push({ type: 'texte', texte: "Les acquéreurs entendent en outre écarter toute présomption de libéralité indirecte, si la contribution effective de chacun des membres du couple ne correspondait pas aux quote-parts indivises, cette différence constituera en toute hypothèse une créance entre eux." });
      c.push({ type: 'texte', texte: "En cas de dérogation à cette convention, il en sera tenu compte le jour de la liquidation de l'indivision ainsi qu'il est dit ci-dessous." });
      c.push({ type: 'texte', texte: "L'assurance décès-invalidité, dans la mesure où elle serait mise en œuvre, profitera en toute hypothèse à l'indivision et ne sera pas constitutive d'une créance." });
    }
    c.push({ type: 'section', amorce: "Prise en charge d'un financement extérieur ultérieur", texte: "En cas de financement extérieur ultérieur pour des travaux, il est conseillé aux acquéreurs d'établir également une convention de ce type afin de prévenir toute difficulté lors de la liquidation de l'indivision. A défaut le financement sera présumé proportionnel aux quotités acquises." });
    c.push({ type: 'section', amorce: "Prise en charge d'un financement personnel ultérieur", texte: "Si l'un des indivisaires améliore l'état du bien indivis, ou si l'indivision retire un profit des dépenses nécessaires à la conservation de l'immeuble réalisées par l'un des indivisaires seul, ou pour un montant supérieur à sa part dans l'immeuble, il lui en sera tenu compte conformément aux dispositions de l'article 815-13 du Code civil." });
    c.push({ type: 'section', amorce: 'Industrie personnelle', texte: "Il est fait observer que l'industrie personnelle des acquéreurs (leur travail) et celle de leurs ayants droit dans les travaux effectués, qu'ils soient d'entretien ou non, ne seront ni cause de créance ni cause d'indemnité." });
    if (indivision) {
      const fraction = acq.length === 2 ? 'à concurrence de la moitié chacun' : 'à parts égales entre eux';
      c.push({ type: 'section', amorce: 'Vie courante', texte: `Les dépenses d'entretien, les charges courantes, les assurances, les impôts locaux, taxes et autres directement liés à l'usage de l'immeuble, seront supportés, au titre de l'obligation à la dette, par les acquéreurs ${fraction}, sauf à tenir compte de la solidarité en matière fiscale. Il sera tenu compte de la contribution effective de chacun d'entre eux lors de la liquidation de l'indivision, à charge pour le demandeur d'en justifier.` });
    }
    c.push({ type: 'section', amorce: 'Répartition lors de la revente', texte: "Il conviendra de distinguer si les sommes empruntées lors de l'acquisition seront ou non remboursées au moment de la revente." });
    c.push({ type: 'sous', texte: "Les sommes empruntées lors de l'acquisition sont remboursées" });
    c.push({ type: 'texte', texte: "La proportion de propriété telle qu'arrêtée entre les indivisaires aux présentes sera celle qui sera utilisée pour la répartition du prix de revente, sous réserve de l'apurement des comptes pouvant exister entre eux." });
    c.push({ type: 'sous', texte: "Les sommes empruntées lors de l'acquisition ne sont pas remboursées" });
    c.push({ type: 'texte', texte: "Avant toute répartition entre les indivisaires, seront prélevés sur le prix de vente : l'impôt sur la plus-value éventuelle, les impôts locaux et taxes exigibles ou à valoir, le solde des sommes empruntées, en capital, intérêts et accessoires, ainsi que les charges de toutes sortes exigibles ou estimées liées au bien indivis et à son utilisation, en ce compris le cas échéant les frais attachés à la radiation des inscriptions." });
    c.push({ type: 'texte', texte: "Le reliquat du prix sera ensuite réparti de la manière suivante." });
    c.push({ type: 'texte', texte: "Chaque indivisaire se verra attribuer une quote-part sur le disponible du prix de revente qui correspondra à son financement réel par rapport au financement global, selon la formule suivante :" });
    c.push({ type: 'texte', texte: "Solde du prix multiplié par Apports personnels + montant des mensualités pris à sa charge divisée par le Total des apports + total des mensualités réglées." });
    c.push({ type: 'texte', texte: "Il est ici précisé qu'en cas de réalisation ultérieure de travaux financés dans des proportions différentes de celles convenues ci-dessus, il devra en être tenu compte dans la répartition du prix." });
    c.push({ type: 'texte', texte: "De même, en cas de modifications des proportions de remboursement d'emprunts, et sous réserve d'en justifier, il devra être tenu compte de la contribution réelle de chacun." });
    c.push({ type: 'section', amorce: 'Répartition lors du partage', texte: "Il conviendra là aussi de distinguer si les sommes empruntées lors de l'acquisition seront ou non remboursées au moment du partage." });
    c.push({ type: 'sous', texte: "Les sommes empruntées lors de l'acquisition sont remboursées" });
    c.push({ type: 'texte', texte: "La proportion de propriété telle qu'arrêtée entre les indivisaires aux présentes sera celle qui sera utilisée par rapport à la valeur du bien au jour du partage pour déterminer la soulte, sous réserve de l'apurement des comptes pouvant exister entre eux." });
    c.push({ type: 'sous', texte: "Les sommes empruntées lors de l'acquisition ne sont pas remboursées" });
    c.push({ type: 'texte', texte: "Avant toute répartition entre les indivisaires, les impôts locaux et taxes exigibles ou à valoir, le solde des sommes empruntées, en capital, intérêts et accessoires, ainsi que les charges de toutes sortes exigibles ou estimées liées au bien indivis et à son utilisation, seront déduits de la valeur du bien indivis au jour de ce partage, en ce compris le cas échéant les frais attachés à la radiation des inscriptions si l'attributaire venait à ne pas reprendre le prêt." });
    c.push({ type: 'texte', texte: "La soulte sera déterminée de la manière suivante." });
    c.push({ type: 'texte', texte: "Chaque indivisaire se verra déterminer sa quote-part sur la valeur du bien indivis qui correspondra à son financement réel par rapport au financement global, selon la formule suivante :" });
    c.push({ type: 'texte', texte: "Valeur nette du bien indivis multipliée par Apports personnels + montant des mensualités pris à sa charge divisée par le Total des apports + total des mensualités réglées." });
    c.push({ type: 'texte', texte: "Il est ici précisé qu'en cas de réalisation ultérieure de travaux financés dans des proportions différentes de celles convenues ci-dessus, il devra en être tenu compte dans la répartition du prix." });
    c.push({ type: 'texte', texte: "De même, en cas de modifications des proportions de remboursement d'emprunts, et sous réserve d'en justifier, il devra être tenu compte de la contribution réelle de chacun." });
    return c;
  }

  // Ce qu'un dossier d'Outil 1 permet de reprendre, et ce qu'il ne dit pas. Les acquéreurs viennent
  // de clientsDepuisDossier (partagée avec l'appel de fonds) : civilité (Monsieur / Madame) et prénom
  // tels qu'ils sont sur la fiche du dossier (étude 06/10 : « reprendre de la fiche dossier les acquéreurs,
  // M ou Mme ou les deux, et prénom et nom »). Une civilité que la fiche ne donne pas est mise par défaut
  // ET signalée, comme un prénom absent. Le montant du prêt n'est reporté sur un acquéreur que s'il est
  // seul : à plusieurs, sa répartition ne se devine pas.
  function prefillQuotites(d) {
    if (!d) return null;
    const clients = clientsDepuisDossier(d);
    const repris = [];
    const aCompleter = [];
    const acquereurs = clients.map(c => ({
      civilite: c.civilite === 'SCI' ? 'SCI' : (c.civilite === 'Mme' || c.civilite === 'Mlle' ? 'Madame' : 'Monsieur'),
      nom: [c.civilite === 'SCI' ? '' : String(c.prenom || '').trim(), String(c.nom || '').trim()].filter(Boolean).join(' ')
    }));
    if (acquereurs.length) {
      repris.push(acquereurs.length > 1 ? `${acquereurs.length} acquéreurs` : 'Acquéreur');
      const sansCivilite = clients.filter(c => c.aCompleter).map(c => String(c.nom || '').trim()).filter(Boolean);
      const sansPrenom = clients.filter(c => c.civilite !== 'SCI' && !String(c.prenom || '').trim()).map(c => String(c.nom || '').trim()).filter(Boolean);
      if (sansCivilite.length) aCompleter.push(`Civilité de ${sansCivilite.join(', ')} — à préciser sur la fiche (Monsieur / Madame).`);
      if (sansPrenom.length) aCompleter.push(`Prénom de ${sansPrenom.join(', ')} — à préciser sur la fiche.`);
    } else {
      aCompleter.push('Acquéreurs — aucun n’a pu être lu sur ce dossier.');
    }
    const typeBien = d.typeVente === 'terrain' ? 'terrain' : 'immeuble';
    repris.push(typeBien === 'terrain' ? 'Nature du bien : terrain à bâtir' : 'Nature du bien');
    const prix = montantQuotite(d.prixVente);
    if (prix) repris.push('Prix d’acquisition'); else aCompleter.push('Prix d’acquisition.');
    if (typeBien === 'terrain') aCompleter.push('Coût de la construction.');
    // Frais et droits de l'acte : le même montant que la ligne du décompte de l'appel de fonds (barème, taux plein, assiette hors
    // mobilier — fraisActeEstimesAppelFonds), au lieu d'une ligne vide (audit 07/10 : deux outils, deux réponses pour un dossier).
    const cpBien = (String(d.adresseBien || '').match(/\b\d{5}\b/) || [null])[0];
    const fraisActe = fraisActeEstimesAppelFonds(d.prixVente, d.prixMobilier, cleBaremeDepuisDepartement(departementDepuisCodePostal(cpBien)), AF_TYPE_BIEN_PAR_TYPE_VENTE[d.typeVente] || null);
    if (fraisActe) aCompleter.push(`Frais et droits de l’acte estimés par le barème : ${formaterPrixCentimes(fraisActe.montant)}${fraisActe.primo < fraisActe.montant ? ` (acquéreur primo-accédant : ${formaterPrixCentimes(fraisActe.primo)})` : ''} — à vérifier.`);
    aCompleter.push(fraisActe ? 'Frais bancaires et de garantie.' : 'Frais et droits de l’acte, frais bancaires et de garantie.');

    const montantPret = d.sansPret ? 0 : montantQuotite(d.montantPret);
    if (d.sansPret) repris.push('Achat sans prêt');
    else if (montantPret && acquereurs.length === 1) repris.push('Montant du prêt (offre reçue)');
    else if (montantPret) aCompleter.push(`Répartition du prêt de ${formaterPrixCentimes(montantPret)} entre les acquéreurs.`);
    else aCompleter.push('Montant et établissement du prêt.');
    aCompleter.push('Apport personnel de chacun.');
    return { typeBien, acquereurs, prix, fraisActe: fraisActe ? fraisActe.montant : 0, montantPret, sansPret: !!d.sansPret, repris, aCompleter };
  }

  // --- état et rendu ------------------------------------------------------------------------
  let qtEtat = null;
  let qtCompteur = 0;
  let qtDossierLie = null;
  function qtId() { qtCompteur += 1; return 'q' + qtCompteur; }

  function etatQuotitesVierge() {
    const a1 = { id: qtId(), civilite: 'Monsieur', nom: '' };
    const a2 = { id: qtId(), civilite: 'Madame', nom: '' };
    return {
      typeBien: 'immeuble',
      acquereurs: [a1, a2],
      lignes: lignesOperationParDefaut('immeuble').map(l => Object.assign({ id: qtId() }, l)),
      sources: [
        { id: qtId(), type: 'apport', banque: '', numero: '', montants: {} },
        { id: qtId(), type: 'pret', banque: '', numero: '', montants: {} }
      ]
    };
  }

  function initQuotites() {
    if (qtEtat) return;
    qtEtat = etatQuotitesVierge();
    renderQuotites();
  }

  function reinitialiserQuotites() {
    qtEtat = etatQuotitesVierge();
    qtDossierLie = null;
    renderPillDossierQuotites();
    const recap = document.getElementById('qt-recap-prefill');
    if (recap) { recap.className = 'af-recap'; recap.innerHTML = ''; }
    renderQuotites();
  }

  function valeurChampQuotite(v) {
    return v == null || v === '' ? '' : String(v);
  }

  function renderQuotites() {
    if (!qtEtat) return;
    document.querySelectorAll('input[name="qt-type-bien"]').forEach(r => { r.checked = r.value === qtEtat.typeBien; });

    const plusieurs = qtEtat.acquereurs.length > 1;
    document.getElementById('qt-acquereurs').innerHTML = qtEtat.acquereurs.map((a, i) => `
      <div class="qt-ligne qt-ligne-acquereur">
        <select aria-label="Civilité de l'acquéreur ${i + 1}" onchange="modifierAcquereurQuotites('${a.id}', 'civilite', this.value, true)">
          ${['Monsieur', 'Madame', 'SCI'].map(c => `<option value="${c}"${a.civilite === c ? ' selected' : ''}>${c}</option>`).join('')}
        </select>
        <input type="text" aria-label="Prénom et nom de l'acquéreur ${i + 1}" placeholder="Prénom NOM" value="${escapeAttr(a.nom)}" oninput="modifierAcquereurQuotites('${a.id}', 'nom', this.value, false)">
        ${plusieurs ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone qt-suppr" title="Retirer cet acquéreur" aria-label="Retirer cet acquéreur" onclick="retirerAcquereurQuotites('${a.id}')">${icone('x')}</wa-button>` : '<span></span>'}
      </div>`).join('');

    document.getElementById('qt-lignes').innerHTML = qtEtat.lignes.map(l => `
      <div class="qt-ligne qt-ligne-operation${l.memoire ? ' qt-memoire' : ''}">
        <input type="text" aria-label="Libellé" placeholder="Libellé" value="${escapeAttr(l.libelle)}" oninput="modifierLigneQuotites('${l.id}', 'libelle', this.value, false)">
        <input type="number" min="0" step="0.01" aria-label="Montant de ${escapeAttr(l.libelle || 'la ligne')}" placeholder="${l.memoire ? 'Mémoire' : '0,00'}" value="${l.memoire ? '' : valeurChampQuotite(l.montant)}" ${l.memoire ? 'disabled' : ''} oninput="modifierLigneQuotites('${l.id}', 'montant', this.value, false)">
        <label class="qt-memoire-coche" title="Montant non encore connu : écrit « MEMOIRE » dans l'annexe et exclu du total"><input type="checkbox" ${l.memoire ? 'checked' : ''} onchange="modifierLigneQuotites('${l.id}', 'memoire', this.checked, true)">Mémoire</label>
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone qt-suppr" title="Supprimer la ligne" aria-label="Supprimer la ligne" onclick="retirerLigneQuotites('${l.id}')">${icone('x')}</wa-button>
      </div>`).join('');

    document.getElementById('qt-sources').innerHTML = qtEtat.sources.map(src => `
      <div class="qt-source">
        <div class="qt-source-entete">
          <span class="dot-label ${src.type === 'pret' ? 'dl-acte' : 'dl-success'}"><span class="dot"></span>${src.type === 'pret' ? 'Prêt' : 'Apport personnel'}</span>
          <strong class="qt-source-total" id="qt-source-total-${src.id}"></strong>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone qt-suppr" title="Supprimer cette source" aria-label="Supprimer cette source" onclick="retirerSourceQuotites('${src.id}')">${icone('x')}</wa-button>
        </div>
        ${src.type === 'pret' ? `<div class="qt-source-pret">
          <input type="text" aria-label="Établissement prêteur" placeholder="Établissement prêteur" value="${escapeAttr(src.banque)}" oninput="modifierSourceQuotites('${src.id}', 'banque', this.value)">
          <input type="text" aria-label="Numéro de prêt" placeholder="N° de prêt" value="${escapeAttr(src.numero)}" oninput="modifierSourceQuotites('${src.id}', 'numero', this.value)">
        </div>` : ''}
        <div class="qt-source-montants">
          ${qtEtat.acquereurs.map(a => `<label class="qt-part">
            <span class="qt-part-nom" id="qt-part-nom-${src.id}-${a.id}">${escapeHtml(nomAcquereurQuotite(a))}</span>
            <input type="number" min="0" step="0.01" placeholder="0,00" value="${valeurChampQuotite((src.montants || {})[a.id])}" oninput="modifierMontantSourceQuotites('${src.id}', '${a.id}', this.value)">
          </label>`).join('')}
        </div>
      </div>`).join('');

    majResultatsQuotites();
  }

  // Rendu partiel appelé à chaque frappe : ne reconstruit JAMAIS les champs de saisie (le focus
  // serait perdu à chaque caractère), seulement les totaux, le contrôle, les quotités et l'aperçu.
  function majResultatsQuotites() {
    if (!qtEtat) return;
    const r = calculerQuotites(qtEtat);
    document.getElementById('qt-total-operation').textContent = formaterPrixCentimes(r.totalOperation);
    document.getElementById('qt-total-financement').textContent = formaterPrixCentimes(r.totalFinancement);
    qtEtat.sources.forEach(src => {
      const el = document.getElementById(`qt-source-total-${src.id}`);
      if (el) el.textContent = formaterPrixCentimes(r.totalParSource[src.id] || 0);
      qtEtat.acquereurs.forEach(a => {
        const nom = document.getElementById(`qt-part-nom-${src.id}-${a.id}`);
        if (nom) nom.textContent = nomAcquereurQuotite(a);
      });
    });

    const controle = document.getElementById('qt-controle');
    const alertes = [];
    if (!r.totalOperation && !r.totalFinancement) {
      alertes.push(`<div class="qt-alerte qt-alerte-neutre">${icone('info')}<span>Saisissez le montant de l'opération et l'origine du financement.</span></div>`);
    } else if (r.couvert) {
      alertes.push(`<div class="qt-alerte qt-alerte-ok">${icone('check')}<span>Le financement couvre exactement le montant de l'opération.</span></div>`);
    } else {
      const sens = r.ecart > 0 ? 'Le financement dépasse le coût de l’opération' : 'Le financement ne couvre pas le coût de l’opération';
      alertes.push(`<div class="qt-alerte qt-alerte-ecart">${icone('alert-triangle')}<span>${sens} de <strong>${formaterPrixCentimes(Math.abs(r.ecart))}</strong> (${formaterPrixCentimes(r.totalFinancement)} pour ${formaterPrixCentimes(r.totalOperation)}).</span></div>`);
    }
    r.sansFinancement.forEach(id => {
      const a = qtEtat.acquereurs.find(x => x.id === id);
      if (a) alertes.push(`<div class="qt-alerte qt-alerte-ecart">${icone('alert-triangle')}<span>${escapeHtml(nomAcquereurQuotite(a))} ne finance rien : sa quotité serait nulle.</span></div>`);
    });
    controle.innerHTML = alertes.join('');

    document.getElementById('qt-quotites').innerHTML = qtEtat.acquereurs.map((a, i) => {
      const p = r.parAcquereur[i];
      return `<div class="qt-quotite">
        <div class="qt-quotite-nom">${escapeHtml(nomAcquereurQuotite(a))}</div>
        <div class="qt-quotite-pct">${formaterPourcentageQuotite(p.pourcentage)}</div>
        <div class="qt-barre" aria-hidden="true"><span style="width:${Math.min(100, p.pourcentage)}%"></span></div>
        <div class="qt-quotite-montant">${formaterPrixCentimes(p.total)}</div>
      </div>`;
    }).join('');

    document.getElementById('qt-feuille').innerHTML = htmlAnnexeQuotites(qtEtat, r);
  }

  function htmlAnnexeQuotites(etat, r) {
    const e = s => escapeHtml(s);
    let h = `<p class="qt-doc-titre">NATURE ET QUOTITES DES DROITS ACQUIS</p>`;
    h += `<p>${e(phraseQuotitesAcquisition(etat.acquereurs, r))}</p>`;
    h += `<p><u>Détermination des proportions acquises</u> - Les acquéreurs déclarent que la proportionnalité indiquée ci-dessus a été fixée en fonction des éléments suivants :</p>`;
    h += `<p class="qt-doc-rubrique">MONTANT DE L'OPERATION :</p>`;
    etat.lignes.forEach(l => {
      h += `<div class="qt-doc-ligne"><span>${e(l.libelle || '—')}</span><span>${l.memoire ? 'MEMOIRE' : e(formaterPrixCentimes(montantQuotite(l.montant)))}</span></div>`;
    });
    h += `<div class="qt-doc-ligne qt-doc-total"><span>Total</span><span>${e(formaterPrixCentimes(r.totalOperation))}</span></div>`;
    h += `<p class="qt-doc-rubrique">ORIGINE DU FINANCEMENT :</p>`;
    lignesFinancementAnnexe(etat, r).forEach(l => {
      h += `<div class="qt-doc-ligne"><span>${e(l.libelle)}</span><span>${e(formaterPrixCentimes(l.montant))}</span></div>`;
    });
    h += `<div class="qt-doc-ligne qt-doc-total"><span>Total</span><span>${e(formaterPrixCentimes(r.totalFinancement))}</span></div>`;
    h += `<p>Récapitulatif des financements de chacun :</p>`;
    h += `<table class="qt-doc-table"><thead><tr><th></th>${etat.acquereurs.map(a => `<th>${e(nomAcquereurQuotite(a))}</th>`).join('')}<th>TOTAL</th></tr></thead><tbody>`;
    etat.sources.forEach(src => {
      h += `<tr><td>${e(libelleSourceTableau(src))}</td>${etat.acquereurs.map(a => `<td class="num">${e(formaterPrixCentimes(montantQuotite((src.montants || {})[a.id])))}</td>`).join('')}<td class="num">${e(formaterPrixCentimes(r.totalParSource[src.id] || 0))}</td></tr>`;
    });
    h += `<tr class="gras"><td>TOTAL</td>${r.parAcquereur.map(p => `<td class="num">${e(formaterPrixCentimes(p.total))}</td>`).join('')}<td class="num">${e(formaterPrixCentimes(r.totalFinancement))}</td></tr>`;
    h += `<tr class="gras"><td>Proportions</td>${r.parAcquereur.map(p => `<td class="num">${e(formaterPourcentageQuotite(p.pourcentage))}</td>`).join('')}<td class="num">100 %</td></tr>`;
    h += `</tbody></table>`;
    clausesQuotites(etat).forEach(c => {
      if (c.type === 'section') h += `<p><u>${e(c.amorce)}</u> - ${e(c.texte)}</p>`;
      else if (c.type === 'sous') h += `<p class="qt-doc-sous">${e(c.texte)}</p>`;
      else h += `<p>${e(c.texte)}</p>`;
    });
    return h;
  }

  // --- modifications -------------------------------------------------------------------------
  function changerTypeBienQuotites(type) {
    if (!qtEtat || !TYPES_BIEN_QUOTITES.includes(type) || type === qtEtat.typeBien) return;
    // Les lignes ne sont remplacées que si personne n'y a encore rien saisi : changer de nature du
    // bien ne doit jamais effacer un montant déjà tapé.
    const vierges = qtEtat.lignes.every(l => !montantQuotite(l.montant));
    qtEtat.typeBien = type;
    if (vierges) {
      const prix = qtEtat.lignes.find(l => /prix d'acquisition/i.test(l.libelle));
      qtEtat.lignes = lignesOperationParDefaut(type).map(l => Object.assign({ id: qtId() }, l));
      if (prix && montantQuotite(prix.montant)) qtEtat.lignes[0].montant = prix.montant;
    }
    renderQuotites();
  }

  function ajouterAcquereurQuotites() {
    if (!qtEtat) return;
    qtEtat.acquereurs.push({ id: qtId(), civilite: 'Monsieur', nom: '' });
    renderQuotites();
  }
  function retirerAcquereurQuotites(id) {
    if (!qtEtat || qtEtat.acquereurs.length <= 1) return;
    qtEtat.acquereurs = qtEtat.acquereurs.filter(a => a.id !== id);
    qtEtat.sources.forEach(s => { delete s.montants[id]; });
    renderQuotites();
  }
  function modifierAcquereurQuotites(id, champ, valeur, reconstruire) {
    const a = qtEtat && qtEtat.acquereurs.find(x => x.id === id);
    if (!a) return;
    a[champ] = valeur;
    if (reconstruire) renderQuotites(); else majResultatsQuotites();
  }

  function ajouterLigneQuotites() {
    if (!qtEtat) return;
    qtEtat.lignes.push({ id: qtId(), libelle: '', montant: null, memoire: false });
    renderQuotites();
  }
  function retirerLigneQuotites(id) {
    if (!qtEtat) return;
    qtEtat.lignes = qtEtat.lignes.filter(l => l.id !== id);
    renderQuotites();
  }
  function modifierLigneQuotites(id, champ, valeur, reconstruire) {
    const l = qtEtat && qtEtat.lignes.find(x => x.id === id);
    if (!l) return;
    l[champ] = champ === 'montant' ? (valeur === '' ? null : valeur) : valeur;
    if (reconstruire) renderQuotites(); else majResultatsQuotites();
  }

  function ajouterSourceQuotites(type) {
    if (!qtEtat) return;
    qtEtat.sources.push({ id: qtId(), type: type === 'pret' ? 'pret' : 'apport', banque: '', numero: '', montants: {} });
    renderQuotites();
  }
  function retirerSourceQuotites(id) {
    if (!qtEtat) return;
    qtEtat.sources = qtEtat.sources.filter(s => s.id !== id);
    renderQuotites();
  }
  function modifierSourceQuotites(id, champ, valeur) {
    const s = qtEtat && qtEtat.sources.find(x => x.id === id);
    if (!s) return;
    s[champ] = valeur;
    majResultatsQuotites();
  }
  function modifierMontantSourceQuotites(idSource, idAcquereur, valeur) {
    const s = qtEtat && qtEtat.sources.find(x => x.id === idSource);
    if (!s) return;
    s.montants[idAcquereur] = valeur === '' ? null : valeur;
    majResultatsQuotites();
  }

  // --- dossier suivi (Outil 1) ---------------------------------------------------------------
  function rechercherDossierQuotites(valeur) {
    const boite = document.getElementById('qt-dossier-resultats');
    if (!boite) return;
    const q = normaliserPourRecherche(String(valeur || '').trim());
    if (!q) { boite.style.display = 'none'; boite.innerHTML = ''; return; }
    const trouves = dossiers.filter(d => !d.archive &&
      (normaliserPourRecherche(libelleDossierAffiche(d)).includes(q) || normaliserPourRecherche(d.responsable || '').includes(q)))
      .slice(0, 8);
    boite.innerHTML = trouves.length
      ? trouves.map(d => `<button type="button" class="dash-recherche-ligne" onclick="choisirDossierQuotites('${escapeOnclickArg(d.id)}')">
          <span class="dash-recherche-nom">${escapeHtml(libelleDossierAffiche(d))}</span>
          <span class="dash-recherche-resp">${escapeHtml(d.responsable || '')}</span>
        </button>`).join('')
      : '<div class="dash-recherche-vide">Aucun dossier ne correspond.</div>';
    boite.style.display = 'block';
  }

  function choisirDossierQuotites(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const champ = document.getElementById('qt-dossier-recherche');
    if (champ) champ.value = '';
    const boite = document.getElementById('qt-dossier-resultats');
    if (boite) { boite.style.display = 'none'; boite.innerHTML = ''; }
    const p = prefillQuotites(d);
    qtEtat = etatQuotitesVierge();
    qtEtat.typeBien = p.typeBien;
    qtEtat.lignes = lignesOperationParDefaut(p.typeBien).map(l => Object.assign({ id: qtId() }, l));
    if (p.prix) qtEtat.lignes[0].montant = p.prix;
    const ligneFrais = qtEtat.lignes.find(l => /^Frais et droits de l'acte/.test(l.libelle));
    if (p.fraisActe && ligneFrais) ligneFrais.montant = p.fraisActe;
    if (p.acquereurs.length) qtEtat.acquereurs = p.acquereurs.map(a => Object.assign({ id: qtId() }, a));
    if (p.sansPret) qtEtat.sources = qtEtat.sources.filter(s => s.type !== 'pret');
    else if (p.montantPret && qtEtat.acquereurs.length === 1) {
      const pret = qtEtat.sources.find(s => s.type === 'pret');
      if (pret) pret.montants[qtEtat.acquereurs[0].id] = p.montantPret;
    }
    qtDossierLie = d.id;
    renderPillDossierQuotites();
    const recap = document.getElementById('qt-recap-prefill');
    if (recap) {
      recap.className = 'af-recap af-recap-visible';
      recap.innerHTML = `<div class="af-recap-bloc"><div class="af-recap-titre">Repris du dossier</div><ul>${p.repris.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
        <div class="af-recap-bloc af-recap-manquant"><div class="af-recap-titre">À compléter</div><ul>${p.aCompleter.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`;
    }
    renderQuotites();
  }

  function renderPillDossierQuotites() {
    const cible = document.getElementById('qt-dossier-pill');
    if (!cible) return;
    const d = qtDossierLie ? dossiers.find(x => x.id === qtDossierLie) : null;
    cible.innerHTML = d ? `<div class="dash-recherche-pill">
      <span class="dot-label dl-success"><span class="dot"></span>${escapeHtml(libelleDossierAffiche(d))}</span>
      <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="reinitialiserQuotites()">Détacher</wa-button>
    </div>` : '';
  }

  // --- annexe .docx --------------------------------------------------------------------------
  // Bibliothèque `docx` (la même que l'artefact d'origine), chargée à la demande depuis
  // cdn.jsdelivr.net comme pizzip/docxtemplater pour l'appel de fonds : rien n'est chargé tant que
  // personne ne télécharge d'annexe. Mise en page de l'artefact conservée à l'identique (Times New
  // Roman 11, marges 2,5 cm, points de conduite vers le montant).
  async function telechargerQuotitesDocx(btn, confirme) {
    if (!qtEtat) return;
    const r = calculerQuotites(qtEtat);
    if (!r.totalFinancement) {
      afficherToast('Saisissez l’origine du financement avant de télécharger l’annexe.', 'OK', null);
      return;
    }
    // Financement qui ne couvre pas l'opération ou acquéreur sans part : l'annexe serait fausse, on le dit avant (audit 12/10).
    if (!confirme && (!r.couvert || r.sansFinancement.length)) {
      demanderConfirmation('Télécharger quand même l’annexe ? Le financement saisi ne correspond pas au coût de l’opération ou un acquéreur ne finance rien.',
        () => telechargerQuotitesDocx(btn, true));
      return;
    }
    const libelle = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Préparation…'; }
    try {
      if (!window.docx) await afChargerScript('https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.min.js');
      const D = window.docx;
      const POLICE = 'Times New Roman';
      const TAILLE = 22;
      const P = o => new D.Paragraph(Object.assign({ spacing: { after: 160, line: 259, lineRule: 'auto' } }, o));
      const R = (text, o) => new D.TextRun(Object.assign({ text, font: POLICE, size: TAILLE }, o || {}));
      const taquets = [{ type: D.TabStopType.RIGHT, position: 8220, leader: D.LeaderType.DOT }];
      const ligne = (lib, mt, gras, apres) => P({ tabStops: taquets, spacing: { after: apres || 60 }, children: [R(lib + ' \t' + mt, { bold: !!gras })] });
      const enfants = [];
      enfants.push(P({ alignment: D.AlignmentType.CENTER, spacing: { after: 220 }, children: [R('NATURE ET QUOTITES DES DROITS ACQUIS', { bold: true })] }));
      enfants.push(P({ alignment: D.AlignmentType.JUSTIFIED, children: [R(phraseQuotitesAcquisition(qtEtat.acquereurs, r))] }));
      enfants.push(P({ alignment: D.AlignmentType.JUSTIFIED, children: [R('Détermination des proportions acquises', { underline: { type: 'single' } }), R(' - Les acquéreurs déclarent que la proportionnalité indiquée ci-dessus a été fixée en fonction des éléments suivants :')] }));
      enfants.push(P({ spacing: { before: 160, after: 120 }, children: [R("MONTANT DE L'OPERATION : ", { bold: true, underline: { type: 'single' } })] }));
      qtEtat.lignes.forEach(l => enfants.push(ligne(l.libelle || '—', l.memoire ? 'MEMOIRE' : formaterPrixCentimes(montantQuotite(l.montant)))));
      enfants.push(ligne('Total', formaterPrixCentimes(r.totalOperation), true, 220));
      enfants.push(P({ spacing: { before: 100, after: 120 }, children: [R('ORIGINE DU FINANCEMENT : ', { bold: true, underline: { type: 'single' } })] }));
      lignesFinancementAnnexe(qtEtat, r).forEach(l => enfants.push(ligne(l.libelle, formaterPrixCentimes(l.montant))));
      enfants.push(ligne('Total', formaterPrixCentimes(r.totalFinancement), true, 220));
      enfants.push(P({ children: [R('Récapitulatif des financements de chacun : ')] }));

      const bord = { style: 'single', size: 6, color: '000000' };
      const cellule = (text, o) => new D.TableCell({
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        verticalAlign: D.VerticalAlign.CENTER,
        children: [P({ alignment: (o && o.droite) ? D.AlignmentType.RIGHT : D.AlignmentType.CENTER, spacing: { after: 0 }, children: [R(text, { bold: !!(o && o.gras) })] })]
      });
      const rangees = [new D.TableRow({ children: [cellule('', { gras: true }), ...qtEtat.acquereurs.map(a => cellule(nomAcquereurQuotite(a), { gras: true })), cellule('TOTAL', { gras: true })] })];
      qtEtat.sources.forEach(src => rangees.push(new D.TableRow({ children: [cellule(libelleSourceTableau(src)), ...qtEtat.acquereurs.map(a => cellule(formaterPrixCentimes(montantQuotite((src.montants || {})[a.id])), { droite: true })), cellule(formaterPrixCentimes(r.totalParSource[src.id] || 0), { droite: true })] })));
      rangees.push(new D.TableRow({ children: [cellule('TOTAL', { gras: true }), ...r.parAcquereur.map(p => cellule(formaterPrixCentimes(p.total), { droite: true, gras: true })), cellule(formaterPrixCentimes(r.totalFinancement), { droite: true, gras: true })] }));
      rangees.push(new D.TableRow({ children: [cellule('Proportions', { gras: true }), ...r.parAcquereur.map(p => cellule(formaterPourcentageQuotite(p.pourcentage), { droite: true, gras: true })), cellule('100 %', { droite: true, gras: true })] }));
      enfants.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, borders: { top: bord, bottom: bord, left: bord, right: bord, insideHorizontal: bord, insideVertical: bord }, rows: rangees }));
      enfants.push(P({ spacing: { before: 220, after: 0 }, children: [R('')] }));

      clausesQuotites(qtEtat).forEach(c => {
        if (c.type === 'section') enfants.push(P({ alignment: D.AlignmentType.JUSTIFIED, children: [R(c.amorce, { underline: { type: 'single' } }), R(' - ' + c.texte)] }));
        else if (c.type === 'sous') enfants.push(P({ alignment: D.AlignmentType.JUSTIFIED, spacing: { before: 120, after: 100 }, children: [R(c.texte, { italics: true })] }));
        else enfants.push(P({ alignment: D.AlignmentType.JUSTIFIED, children: [R(c.texte)] }));
      });

      const doc = new D.Document({
        styles: { default: { document: { run: { font: POLICE, size: TAILLE } } } },
        sections: [{ properties: { page: { margin: { top: 1417, bottom: 1417, left: 1417, right: 1417 } } }, children: enfants }]
      });
      const blob = await D.Packer.toBlob(doc);
      const noms = qtEtat.acquereurs.map(a => String(a.nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '')).filter(Boolean).join('_');
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = `Quotites_acquisition_${noms || 'acte'}.docx`;
      document.body.appendChild(lien);
      lien.click();
      ouvrirApresTelechargement(lien.download);
      lien.remove();
      setTimeout(() => URL.revokeObjectURL(lien.href), 5000);
    } catch (e) {
      console.error(e);
      afficherToast('Génération impossible : la bibliothèque Word n’a pas pu être chargée (accès internet requis).', 'OK', null);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = libelle; }
    }
  }

  // Peuple le <select> des départements une seule fois au démarrage (le calculateur est toujours
  // dans le DOM, comme les autres onglets — voir definirOnglet) et calcule un premier résultat par
  // défaut, visible dès le premier passage sur l'onglet. Un simple drapeau plutôt qu'une lecture de
  // `deptEl.options` : le faux document des tests (tests/helpers/load-app.js) ne modélise pas les
  // `<select>`/`<option>` du DOM réel, `.options` y est `undefined`.
  let calculateurFraisActeInitialise = false;
  function initCalculateurFraisActe() {
    if (calculateurFraisActeInitialise) return;
    const deptEl = document.getElementById('calc-dept');
    if (!deptEl) return;
    for (const [code, d] of Object.entries(DEPARTEMENTS_FRAIS_ACTE)) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = code + ' — ' + d.name;
      if (code === '41') option.selected = true;
      deptEl.appendChild(option);
    }
    calculateurFraisActeInitialise = true;
    calculerFraisActe();
  }

  // Le même barème sert au CONTRÔLE de la ligne de frais du décompte d'appel de fonds. Le select
  // y part volontairement vide (« — à choisir — ») et non sur le 41 comme le simulateur : tant
  // qu'aucun département n'est choisi, aucun contrôle n'est affiché — mieux vaut ne rien dire que
  // de comparer au barème du mauvais département.
  var selectDepartementAppelFondsInitialise = false;
  function initSelectDepartementAppelFonds() {
    if (selectDepartementAppelFondsInitialise) return;
    const el = document.getElementById('af-frais-departement');
    if (!el) return;
    const vide = document.createElement('option');
    vide.value = '';
    vide.textContent = '— à choisir —';
    el.appendChild(vide);
    for (const [code, d] of Object.entries(DEPARTEMENTS_FRAIS_ACTE)) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = code + ' — ' + d.name;
      el.appendChild(option);
    }
    selectDepartementAppelFondsInitialise = true;
  }

  // ---- Outil 2 — Audit intelligent des actes notariaux : import du projet (compromis/promesse ou
  // acte de vente) + pièces séparées, relecture croisée par le modèle local (Ollama, voir
  // server/src/llm.js, server/src/audit/ et CLAUDE.md, section "Outil 2") ----
  // Distinct du wizard "Nouveau dossier" (Outil 1, qui crée/tient la fiche de suivi à partir d'un
  // compromis SIGNÉ) : ici on compare des PROJETS de documents entre eux pour un audit, sans jamais
  // créer ni modifier un dossier de suivi — un dossier CLAIRE peut être lié en lecture seule pour
  // réutiliser ses données déjà vérifiées (voir auditDossierLie), jamais en écriture.
  // N'existe QUE sur `claude/serveur-intranet` (a besoin d'un backend pour parler à Ollama, jamais
  // appelé sans `fetchAvecAuth()`/l'écran de connexion, absents de `main`) — contrairement au reste
  // de ce fichier, cette section (et celle de l'extraction IA du wizard "Nouveau dossier", voir
  // lancerExtractionIa) n'est PAS portée sur `main`, qui n'a pas de backend pour l'exécuter.
  // Chaque fichier déposé n'existe qu'en mémoire le temps de l'audit — jamais enregistré, aucun
  // dossier créé. Seul le TEXTE déjà extrait dans le navigateur est envoyé au serveur, jamais le
  // PDF lui-même (voir lireTextePdfParPage, déjà utilisée pour vérifier un dossier local).
  let fichiersAnalyseIa = []; // { id, file, nom, type, statut, texte, pages, erreurTexte }
  let compteurFichierAnalyseIa = 0;

  // Mode choisi EXPLICITEMENT au dépôt (jamais deviné, demande de l'étude) : « lecture du
  // compromis » (chercher les dangers dans un avant-contrat) ou « lecture d'un projet de vente »
  // (comparer ce projet à l'avant-contrat déjà signé et vérifier que les engagements ont été
  // tenus). auditDossierLie (mode 'acte' seulement) évite de redéposer l'avant-contrat quand le
  // dossier est déjà suivi dans CLAIRE — jamais modifié, lu seul.
  let auditMode = 'compromis';
  let auditDossierLie = null;

  function changerAuditMode(valeur) {
    auditMode = (valeur === 'acte') ? 'acte' : 'compromis';
    const aide = document.getElementById('audit-aide-mode');
    if (aide) {
      aide.textContent = auditMode === 'acte'
        ? `Le projet est relu point par point (${grillePourModeOutil2('acte').length} points) et comparé à l'avant-contrat signé : parties, prix, désignation, conditions levées, engagements du vendeur tenus.`
        : `Le projet d'avant-contrat est relu point par point (${grillePourModeOutil2('compromis').length} points) : parties, bien, diagnostics, copropriété, délais et clauses, urbanisme, volet financier.`;
    }
    for (const f of fichiersAnalyseIa) if (auditMode !== 'acte' && f.type === 'reference_compromis') f.type = 'justificatif';
    invaliderSuiteRelecture();
    renderListeFichiersAnalyseIa();
    calculerPropositionsDossierAudit();
  }

  // Recherche d'un dossier CLAIRE à lier à l'audit (mode "projet d'acte de vente" uniquement) —
  // même patron que renderRechercheDashboard() (Tableau de bord), un menu de résultats sous le
  // champ plutôt qu'un filtre sur une liste déjà affichée, qui n'existe pas ici.
  function ligneResultatDossierAudit(d) {
    return `<button type="button" class="dash-recherche-ligne" onclick="choisirDossierAudit('${escapeOnclickArg(d.id)}')">
          ${renderBadgeStatut(d)}
          <span class="dash-recherche-nom">${escapeHtml(libelleDossierAffiche(d))}</span>
          <span class="dash-recherche-resp">${escapeHtml(d.responsable || '')}</span>
        </button>`;
  }

  function rechercherDossierAudit(valeur) {
    const bloc = document.getElementById('audit-dossier-resultats');
    if (!bloc) return;
    const q = normaliserPourRecherche(String(valeur || '').trim());
    if (!q) { renderPropositionsDossierAudit(); return; }
    const resultats = dossiers
      .filter(d => !d.archive && normaliserPourRecherche(libelleDossierAffiche(d) + ' ' + (d.responsable || '')).includes(q))
      .slice(0, 8);
    bloc.innerHTML = resultats.length === 0
      ? '<div class="dash-recherche-vide">Aucun dossier ne correspond.</div>'
      : resultats.map(ligneResultatDossierAudit).join('');
    bloc.style.display = 'block';
  }

  // Dossiers proposés d'après les parties lues dans le document principal (voir
  // proposerDossiersDepuisParties) : affichés sous le champ de recherche tant qu'il est vide et
  // qu'aucun dossier n'est lié — une proposition à confirmer d'un clic, jamais une liaison faite
  // toute seule. Recalculés dès que le principal est lu, change de type, ou que le mode passe à
  // « projet d'acte de vente » (le bloc n'existe pas dans l'autre mode).
  let auditDossiersProposes = [];

  function calculerPropositionsDossierAudit() {
    // Le type de bien choisi à la main se rapporte à l'acte analysé : dès que les documents ou le
    // mode changent, il n'a plus de sens et la déduction doit reprendre la main.
    typeBienAuditChoisi = null;
    auditDossiersProposes = [];
    const principal = fichiersAnalyseIa.find(f => f.type === 'principal' && f.statut === 'ok');
    if (principal && principal.texte) {
      const typeActe = detecterTypeActe(principal.texte);
      const parties = detecterParties(principal.texte, typeActe && typeActe.valeur);
      auditDossiersProposes = proposerDossiersDepuisParties(parties, dossiers).slice(0, 5);
    }
    renderPropositionsDossierAudit();
  }

  function renderPropositionsDossierAudit() {
    const bloc = document.getElementById('audit-dossier-resultats');
    if (!bloc) return;
    if (auditDossierLie || auditDossiersProposes.length === 0) {
      bloc.style.display = 'none';
      bloc.innerHTML = '';
      return;
    }
    bloc.innerHTML = `<div class="dash-recherche-vide">${icone('sparkle')} Dossier(s) dont les parties correspondent au projet — cliquez pour lier :</div>`
      + auditDossiersProposes.map(ligneResultatDossierAudit).join('');
    bloc.style.display = 'block';
  }

  function renderDossierLieAudit() {
    const pill = document.getElementById('audit-dossier-pill');
    if (!pill) return;
    const d = auditDossierLie;
    const aae = d && d.nasDossier
      ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide audit-aae-btn" onclick="ouvrirParcoursNasRelecture()" title="Affiche tout le dossier du client sur le NAS, rubrique par rubrique, pour choisir les pièces à joindre à la relecture">${icone('folder')}Parcourir le dossier du NAS</wa-button>`
      : (d ? '<span class="hint">Dossier non relié au NAS.</span>' : '');
    pill.innerHTML = d
      ? `<span class="dot-label dl-success">${icone('link')}${escapeHtml(libelleDossierAffiche(d))}<wa-button appearance="plain" size="s" type="button" class="bouton-icone piece-suppr" onclick="retirerDossierAudit()" title="Ne plus lier ce dossier" aria-label="Ne plus lier ce dossier">${icone('x')}</wa-button></span>${aae}`
      : '';
  }

  function choisirDossierAudit(id) {
    auditDossierLie = dossiers.find(d => d.id === id) || null;
    invaliderSuiteRelecture();
    const champ = document.getElementById('audit-dossier-recherche');
    if (champ) champ.value = '';
    renderPropositionsDossierAudit();
    renderDossierLieAudit();
  }

  function retirerDossierAudit() {
    auditDossierLie = null;
    fermerParcoursNasRelecture();
    invaliderSuiteRelecture();
    renderDossierLieAudit();
    renderPropositionsDossierAudit();
  }

  // Va chercher le compromis/la promesse d'un dossier CLAIRE lié DIRECTEMENT SUR LE NAS déjà relié
  // (même mécanisme que le bouton "Ouvrir le compromis" — d.compromisNomFichier, chercherFichierParNom,
  // ouvrirPdfNas), plutôt que de forcer un second import manuel : le dossier est déjà suivi, son
  // compromis y est déjà. Silencieux en cas d'échec (nom introuvable, dossier non relié au NAS, PDF
  // illisible...) : la comparaison structurée (comparerCompromisEtProjet, plus bas) reste alors
  // disponible, seul le volet "clauses en langage libre" de la comparaison (passes IA) est absent.
  async function recupererTextCompromisDossier(d) {
    if (!d || !d.dossierLie || !d.nasDossier || !window.pdfjsLib) return null;
    try {
      // Même ordre de préférence que le bouton « Ouvrir le compromis » (choisirAvantContratNas) :
      // nom exact, puis racine/rubrique SRU, puis mots « compromis »/« promesse ».
      const trouve = choisirAvantContratNas(await listerFichiersNas(d), nomCompromisAttendu(d), contexteNomsAvantContrat(d, dossiers)).fichier;
      if (!trouve) return null;
      const pdf = await ouvrirPdfNas(cheminNasComplet(d, trouve.chemin));
      const { texte, pages, pagesLues, pagesTotal, viaOcr, tronque } = await lireTextePdfParPage(pdf);
      if (texte.trim().length < 20) return null;
      return { nom: trouve.nom, texte, pages, pagesLues, pagesTotal, viaOcr, tronque };
    } catch (e) {
      console.error('Audit des actes : compromis du dossier lié introuvable ou illisible', e);
      return null;
    }
  }

  function gererSurvolDepotAnalyseIa(event) {
    event.preventDefault();
    document.getElementById('analyse-ia-dropzone').classList.add('survol');
  }

  function gererQuitteDepotAnalyseIa(event) {
    event.preventDefault();
    document.getElementById('analyse-ia-dropzone').classList.remove('survol');
  }

  function gererDepotAnalyseIa(event) {
    event.preventDefault();
    document.getElementById('analyse-ia-dropzone').classList.remove('survol');
    const fichiers = event.dataTransfer && event.dataTransfer.files;
    if (fichiers && fichiers.length) ajouterFichiersAnalyseIa(fichiers);
  }

  // Devine "principal" pour le premier PDF (sauf s'il évoque un compromis/une promesse alors qu'on
  // est en mode "projet de vente", auquel cas c'est la RÉFÉRENCE, pas le principal), puis
  // "reference_compromis" pour un fichier nommé compromis/promesse ensuite en mode acte. Tout
  // fichier suivant part en "justificatif" : dans les deux modes, c'est ce qu'on dépose en
  // pratique après le document à relire (attestation d'entretien, facture, décennale…), et c'est
  // le seul type dont la date est ensuite contrôlée. Une simple valeur de départ, toujours
  // modifiable via le <select> de chaque ligne (voir changerTypeFichierAnalyseIa).
  function deviserTypeAnalyseIa(nomFichier) {
    const dejaUnPrincipal = fichiersAnalyseIa.some(f => f.type === 'principal');
    const dejaUneReference = fichiersAnalyseIa.some(f => f.type === 'reference_compromis');
    const nommeCompromis = /compromis|promesse/i.test(nomFichier);
    if (!dejaUnPrincipal && (auditMode !== 'acte' || !nommeCompromis)) return 'principal';
    if (auditMode === 'acte' && nommeCompromis && !dejaUneReference) return 'reference_compromis';
    return 'justificatif';
  }

  function ajouterFichiersAnalyseIa(fileList) {
    const fichiers = Array.from(fileList).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (fichiers.length === 0) {
      afficherToast('Seuls les fichiers PDF sont acceptés.', 'OK', null);
      return;
    }
    const nouvelles = fichiers.map(file => ({
      id: `analyse-ia-${++compteurFichierAnalyseIa}`,
      file,
      nom: file.name,
      type: deviserTypeAnalyseIa(file.name),
      nature: classerNaturePieceOutil2(file.name, ''),
      statut: 'lecture',
      texte: '',
      pages: [],
      erreurTexte: '',
      pagesLues: null,
      pagesTotal: null,
      viaOcr: false,
      tronque: false
    }));
    fichiersAnalyseIa = fichiersAnalyseIa.concat(nouvelles);
    invaliderSuiteRelecture();
    renderListeFichiersAnalyseIa();
    for (const entree of nouvelles) extraireTexteFichierAnalyseIa(entree.id);
  }

  // Réutilise lireTextePdfParPage() (variante de lireTextePdfVerification, déjà en place pour
  // vérifier l'offre de prêt/les pièces d'un dossier local relié, qui mémorise en plus les
  // frontières de chaque page) : texte extractible + repli OCR sur les 3 premières pages si le PDF
  // est un scan sans texte — même logique, appliquée ici à un fichier importé via <input> plutôt
  // qu'à un FileSystemFileHandle. Les frontières de page sont indispensables à Outil 2 (Audit des
  // actes) pour citer un numéro de page précis par document, pas seulement pour le compromis en
  // cours d'import.
  async function extraireTexteFichierAnalyseIa(id) {
    const entree = fichiersAnalyseIa.find(f => f.id === id);
    if (!entree) return;
    if (!window.pdfjsLib) {
      entree.statut = 'erreur';
      entree.erreurTexte = 'Lecture PDF indisponible — réessayez dans un instant.';
      renderListeFichiersAnalyseIa();
      return;
    }
    try {
      let pdf;
      if (entree.cheminNas) {
        pdf = await ouvrirPdfNas(entree.cheminNas);
      } else {
        const buffer = await entree.file.arrayBuffer();
        pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: buffer, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
      }
      const { texte, pages, pagesLues, pagesTotal, viaOcr, tronque } = await lireTextePdfParPage(pdf);
      if (texte.trim().length < 20) {
        entree.statut = 'erreur';
        entree.erreurTexte = 'Aucun texte exploitable trouvé (page vide, ou scan illisible même après OCR).';
      } else {
        entree.statut = 'ok';
        entree.texte = texte;
        entree.pages = pages;
        entree.pagesLues = pagesLues;
        entree.pagesTotal = pagesTotal;
        entree.viaOcr = viaOcr;
        entree.tronque = tronque;
        // Nature relue sur la première page (le nom seul ne dit pas toujours ce qu'est la pièce),
        // et pages d'annexes jointes au même PDF repérées pour le projet et l'avant-contrat.
        if (!entree.nature || entree.nature === 'autre') entree.nature = classerNaturePieceOutil2(entree.nom, texte);
        entree.annexesDepuisPage = entree.type !== 'justificatif' ? debutAnnexesDocumentOutil2(texte, pages) : null;
      }
    } catch (e) {
      entree.statut = 'erreur';
      entree.erreurTexte = 'Lecture du PDF impossible.';
      console.error('Analyse IA : échec de lecture de', entree.nom, e);
    }
    // Pièce lue après la pseudonymisation : les documents envoyés seraient décalés d'un rang (audit 12/10) — tout est à refaire.
    // Jamais pendant une analyse ni sur un bilan : la pièce n'en fait simplement pas partie (relecture 12/10).
    if (anonymisationRelecture && entree.statut === 'ok' && !analyseEnCoursRelecture && !dernierRapportAudit) invaliderSuiteRelecture();
    renderListeFichiersAnalyseIa();
    if (entree.type === 'principal') calculerPropositionsDossierAudit();
  }

  function changerTypeFichierAnalyseIa(id, valeur) {
    const entree = fichiersAnalyseIa.find(f => f.id === id);
    if (!entree) return;
    const etaitPrincipal = entree.type === 'principal';
    entree.type = valeur;
    entree.annexesDepuisPage = valeur !== 'justificatif' && entree.statut === 'ok' ? debutAnnexesDocumentOutil2(entree.texte, entree.pages) : null;
    invaliderSuiteRelecture();
    renderListeFichiersAnalyseIa();
    if (etaitPrincipal || valeur === 'principal') calculerPropositionsDossierAudit();
  }

  function retirerFichierAnalyseIa(id) {
    const retire = fichiersAnalyseIa.find(f => f.id === id);
    fichiersAnalyseIa = fichiersAnalyseIa.filter(f => f.id !== id);
    cachePdfRelecture.delete(id);
    invaliderSuiteRelecture();
    renderListeFichiersAnalyseIa();
    if (retire && retire.type === 'principal') calculerPropositionsDossierAudit();
  }

  // Pas de demanderConfirmation() ici, volontairement : rien n'est enregistré (voir en tête de
  // section), vider la liste ne perd qu'un import à refaire — un impact bien moindre qu'archiver/
  // supprimer un vrai dossier de suivi, qui garde ce garde-fou.
  function viderAnalyseIa() {
    fichiersAnalyseIa = [];
    cachePdfRelecture.clear();
    termesManuelsRelecture = [];
    valeursEnClairRelecture = [];
    fermerVisionneuseRelecture();
    invaliderSuiteRelecture();
    renderListeFichiersAnalyseIa();
  }

  // Résumé lisible de la couverture de lecture d'un document (pages effectivement lues sur le
  // total, et si la lecture est passée par l'OCR) — voir lireTextePdfParPage(). Signalé par
  // l'étude : sans ce résumé, rien n'indiquait qu'un document scanné volumineux n'avait été lu
  // qu'en partie, ce qui pouvait laisser croire à une analyse complète alors qu'elle ne portait
  // que sur les premières pages. Fonction pure, réutilisée par le badge de la liste de fichiers et
  // par le rapport d'audit final.
  function libelleCouverturePages(entree) {
    if (!entree || entree.pagesTotal == null) return '';
    const via = entree.viaOcr ? ' (OCR)' : '';
    if (!entree.tronque) return `p.${entree.pagesLues}/${entree.pagesTotal}${via}`;
    return `p.${entree.pagesLues}/${entree.pagesTotal}${via} — lecture incomplète`;
  }

  function statutFichierAnalyseIa(entree) {
    if (entree.statut === 'lecture') return `<span class="dot-label dl-neutre">${icone('spinner', null, true)}Lecture…</span>`;
    if (entree.statut === 'erreur') return `<span class="dot-label dl-urgent" title="${escapeAttr(entree.erreurTexte)}">${icone('alert-triangle')}Erreur</span>`;
    const couverture = libelleCouverturePages(entree);
    if (entree.tronque) {
      return `<span class="dot-label dl-pret" title="Seules les ${entree.pagesLues} premières pages sur ${entree.pagesTotal} ont été lues — le reste du document n'a pas pu être analysé.">${icone('alert-triangle')}Lu partiellement (${couverture})</span>`;
    }
    return `<span class="dot-label dl-success" title="${escapeAttr(couverture)}">${icone('file-text')}Lu (${couverture})</span>`;
  }

  // 4 niveaux de gravité (§16 du cahier des charges), sur seulement 3 couleurs déjà réservées dans
  // l'outil (pas de 5ᵉ couleur inventée pour l'occasion, voir CLAUDE.md) : IMPORTANT et A_VERIFIER
  // partagent l'ambre, distingués par leur texte et leur icône plutôt que par la couleur.
  function libelleGraviteAudit(gravite) {
    if (gravite === 'CRITIQUE') return { dl: 'dl-urgent', icone: 'alert-triangle', texte: 'Critique' };
    if (gravite === 'IMPORTANT') return { dl: 'dl-pret', icone: 'alert-triangle', texte: 'Important' };
    if (gravite === 'A_VERIFIER') return { dl: 'dl-pret', icone: 'info', texte: 'À vérifier' };
    return { dl: 'dl-neutre', icone: 'info', texte: 'Information' };
  }

  // Un constat cite TOUJOURS le passage du document dont il vient, avec sa page : c'est ce qui
  // permet de le vérifier en dix secondes plutôt que de relire l'acte. `phrase`/`page` viennent
  // des règles déterministes ; `sources` est l'ancienne forme d'un constat venu du modèle local
  // (bouton « Approfondir », retiré le 23/09/2026) — conservée pour ne pas casser un rendu : une
  // citation non retrouvée reste signalée comme telle.
  function renderSourceConstat(c) {
    if (c.phrase) return citationObligation(c.phrase, c.page, 300);
    const liste = Array.isArray(c.sources) ? c.sources : [];
    if (liste.length === 0) return '';
    return liste.map(s => {
      if (s.extraitTrouve === false) {
        return `<p class="analyse-ia-citation-douteuse">${icone('alert-triangle')}Citation non retrouvée dans le document — à vérifier en priorité</p>`;
      }
      return citationObligation(s.extrait, s.page, 300);
    }).join('');
  }

  // Décision de l'étude sur un constat (voir la mémoire d'audit, memoriserDecisionConstat) :
  // deux boutons sur chaque constat, « Écarter » et « Confirmer », et l'état mémorisé affiché en
  // clair — un constat déjà écarté se replie (jamais supprimé : on le voit toujours, replié), un
  // constat déjà confirmé remonte en tête de sa section. « Annuler » retire la décision mémorisée,
  // pour ne pas laisser une erreur d'un clic peser sur tous les audits suivants.
  function renderDecisionAudit(c) {
    if (!c.uid) return '';
    const m = c.memoire;
    if (m) {
      const nb = m.nb > 1 ? ` (${m.nb} fois)` : '';
      const texte = m.decision === 'ecarte' ? `Déjà écarté précédemment${nb}` : `Confirmé lors d'un audit précédent${nb}`;
      return `<div class="analyse-ia-constat-actions">
        <span class="dot-label ${m.decision === 'ecarte' ? 'dl-neutre' : 'dl-success'}">${icone(m.decision === 'ecarte' ? 'x' : 'check')}${texte}</span>
        <wa-button appearance="plain" size="s" type="button" class="bouton-discret icon-btn" onclick="annulerDecisionConstatAudit('${escapeOnclickArg(c.uid)}')" title="Oublier cette décision">${icone('rotate-ccw')} Annuler</wa-button>
      </div>`;
    }
    return `<div class="analyse-ia-constat-actions">
      <wa-button appearance="plain" size="s" type="button" class="bouton-discret icon-btn" onclick="decisionConstatAudit('${escapeOnclickArg(c.uid)}', 'ecarte')" title="Ne plus signaler ce constat sur les prochains audits (il restera visible, replié)">${icone('x')} Écarter</wa-button>
      <wa-button appearance="plain" size="s" type="button" class="bouton-discret icon-btn" onclick="decisionConstatAudit('${escapeOnclickArg(c.uid)}', 'confirme')" title="Marquer ce constat comme pertinent : il remontera en tête sur les prochains audits">${icone('check')} Confirmer</wa-button>
    </div>`;
  }

  function renderConstatAudit(c) {
    const g = libelleGraviteAudit(c.gravite);
    const graviteCorrigee = c.graviteOrigine
      ? `<span class="hint audit-gravite-corrigee">gravité corrigée par l'étude (initialement : ${escapeHtml(libelleGraviteAudit(c.graviteOrigine).texte.toLowerCase())})</span>` : '';
    // En mode commentaires, le commentaire remplace « Écarter / Confirmer » : ce sont deux façons
    // de donner le même avis, les afficher ensemble ferait douter de celle qui compte.
    const pied = modeCommentairesAudit ? renderCommentaireConstatAudit(c) : (renderRetourResumeAudit(c) || renderDecisionAudit(c));
    const corps = `<div class="analyse-ia-constat-titre"><span class="dot-label ${g.dl}">${icone(g.icone)}${g.texte}</span>${escapeHtml(c.titre)}${graviteCorrigee}</div>
      ${c.description ? `<p class="analyse-ia-constat-desc">${escapeHtml(c.description)}</p>` : ''}
      ${renderSourceConstat(c)}
      ${pied}`;
    const teinte = ` constat-${String(c.gravite || 'INFORMATION').toLowerCase()}`;
    const ancre = c.uid ? ` id="audit-constat-${c.uid}"` : '';
    if (c.retour && c.retour.verdict === 'faux_positif') {
      const portee = c.retour.portee === 'dossier' ? 'pour ce dossier' : 'sur tous les dossiers';
      const ouvert = formCommentaireAudit && formCommentaireAudit.uid === c.uid ? ' open' : '';
      return `<details class="analyse-ia-constat constat-ecarte${teinte}"${ancre}${ouvert}>
        <summary><span class="dot-label dl-neutre">${icone('x')}Faux positif ${portee}</span>${escapeHtml(c.titre)}</summary>
        ${corps}
      </details>`;
    }
    if (c.memoire && c.memoire.decision === 'ecarte') {
      return `<details class="analyse-ia-constat constat-ecarte${teinte}"${ancre}>
        <summary><span class="dot-label dl-neutre">${icone('x')}Déjà écarté</span>${escapeHtml(c.titre)}</summary>
        ${corps}
      </details>`;
    }
    const confirme = (c.memoire && c.memoire.decision === 'confirme') || (c.retour && c.retour.verdict === 'juste');
    return `<div class="analyse-ia-constat${teinte}${confirme ? ' constat-confirme' : ''}"${ancre}>${corps}</div>`;
  }

  // ---- Mode commentaires (Outil 2) ----------------------------------------------------------
  // Hors mode commentaires, un avis déjà donné reste visible (une ligne) : l'étude doit voir
  // pourquoi un constat est replié ou a changé de gravité.
  function renderRetourResumeAudit(c) {
    const r = c.retour;
    if (!r) return '';
    const v = VERDICTS_RETOUR_OUTIL2[r.verdict] || VERDICTS_RETOUR_OUTIL2.juste;
    const portee = r.portee === 'dossier' ? 'ce dossier' : 'tous les dossiers';
    return `<div class="audit-commentaire audit-commentaire-lu">
      <span class="dot-label ${v.dl}">${icone(v.icone)}${v.texte} · ${portee}</span>
      ${r.commentaire ? `<span class="audit-commentaire-texte">« ${escapeHtml(r.commentaire)} »</span>` : ''}
    </div>`;
  }

  function renderCommentaireConstatAudit(c) {
    if (!c.uid) return '';
    const f = formCommentaireAudit && formCommentaireAudit.uid === c.uid ? formCommentaireAudit : null;
    if (f) return renderFormCommentaireAudit(c, f);
    if (c.retour) {
      return `<div class="audit-commentaire">
        ${renderRetourResumeAudit(c)}
        <div class="audit-commentaire-actions">
          <wa-button appearance="plain" size="s" type="button" class="bouton-discret icon-btn" onclick="modifierCommentaireAudit('${escapeOnclickArg(c.uid)}')">${icone('pencil')} Modifier</wa-button>
          <wa-button appearance="plain" size="s" type="button" class="bouton-discret icon-btn" onclick="supprimerCommentaireAudit('${escapeOnclickArg(c.uid)}')">${icone('x')} Supprimer</wa-button>
        </div>
      </div>`;
    }
    const bouton = (verdict) => {
      const v = VERDICTS_RETOUR_OUTIL2[verdict];
      return `<button type="button" class="audit-verdict-btn" onclick="ouvrirCommentaireAudit('${escapeOnclickArg(c.uid)}', '${verdict}')">${icone(v.icone)}${v.texte}</button>`;
    };
    return `<div class="audit-commentaire audit-commentaire-choix">
      <span class="audit-commentaire-question">Votre avis :</span>
      ${bouton('juste')}${bouton('faux_positif')}${bouton('mal_formule')}${bouton('gravite')}
    </div>`;
  }

  function renderFormCommentaireAudit(c, f) {
    const choix = ['juste', 'faux_positif', 'mal_formule', 'gravite'].map(verdict => {
      const v = VERDICTS_RETOUR_OUTIL2[verdict];
      return `<button type="button" class="audit-verdict-btn${f.verdict === verdict ? ' actif' : ''}" onclick="changerVerdictCommentaireAudit('${verdict}')">${icone(v.icone)}${v.texte}</button>`;
    }).join('');
    const gravites = ['CRITIQUE', 'IMPORTANT', 'A_VERIFIER', 'INFORMATION']
      .map(gr => `<option value="${gr}" ${f.gravite === gr ? 'selected' : ''}>${escapeHtml(libelleGraviteAudit(gr).texte)}</option>`).join('');
    const aide = {
      juste: 'Pourquoi ce point est utile (facultatif)',
      faux_positif: 'Pourquoi ce point ne devait pas sortir — ex. « la clause parle de la vente précédente »',
      mal_formule: 'Comment le formuler, ou ce qui est inexact dans le texte',
      gravite: 'Pourquoi cette gravité'
    }[f.verdict] || '';
    return `<div class="audit-commentaire audit-commentaire-form">
      <div class="audit-commentaire-choix">${choix}</div>
      ${f.verdict === 'gravite' ? `<label class="audit-commentaire-ligne">Gravité juste : <select id="audit-com-gravite" onchange="formCommentaireAudit.gravite = this.value">${gravites}</select></label>` : ''}
      <div class="audit-commentaire-ligne" role="radiogroup" aria-label="Portée du commentaire">
        <label><input type="radio" name="audit-com-portee" value="dossier" ${f.portee === 'dossier' ? 'checked' : ''} onchange="formCommentaireAudit.portee = 'dossier'"> Ce dossier seulement</label>
        <label><input type="radio" name="audit-com-portee" value="tous" ${f.portee === 'tous' ? 'checked' : ''} onchange="formCommentaireAudit.portee = 'tous'"> Tous les dossiers</label>
      </div>
      <textarea id="audit-com-texte" rows="2" placeholder="${escapeAttr(aide)}" oninput="formCommentaireAudit.texte = this.value">${escapeHtml(f.texte || '')}</textarea>
      <div class="audit-commentaire-actions">
        <wa-button appearance="outlined" class="secondary" onclick="fermerCommentaireAudit()">Annuler</wa-button>
        <wa-button variant="brand" class="primary" onclick="enregistrerCommentaireAudit()">Enregistrer</wa-button>
      </div>
    </div>`;
  }

  // Une obligation du vendeur en mode « projet de vente », rendue en TROIS COLONNES — demande
  // explicite de l'étude : « mettre côte à côte la clause d'engagement de l'avant-contrat et la
  // clause d'engagement de la vente tenue avec le justificatif ». C'est exactement le geste de
  // relecture : lire l'engagement pris, ce que le projet en dit, et ce qui le prouve, sans avoir à
  // faire l'aller-retour entre deux PDF.
  //   1. Avant-contrat : la clause telle qu'elle engage le vendeur (toujours présente, c'est elle
  //      qui a fait naître la ligne) ;
  //   2. Projet de vente : la clause correspondante s'il en porte une, sinon le vide, dit comme tel
  //      — une obligation que le projet ne reprend pas est un signal en soi ;
  //   3. Justificatif : la pièce qui l'établit et sa date contrôlée.
  // Les obligations TENUES sont affichées elles aussi : savoir ce qui est en règle fait partie de
  // la relecture, et c'est ce qui distingue une obligation vérifiée d'une obligation qu'on a
  // simplement oublié de regarder.
  function colonneObligation(titre, corps, vide) {
    return `<div class="obligation-col${vide ? ' obligation-col-vide' : ''}">
      <span class="section-eyebrow">${escapeHtml(titre)}</span>
      <div class="obligation-col-corps">${corps}</div>
    </div>`;
  }

  function citationObligation(texte, page, limite) {
    if (!texte) return '';
    const t = String(texte);
    const coupe = t.length > (limite || 320) ? t.slice(0, (limite || 320) - 3) + '…' : t;
    return `<blockquote class="obligation-clause">${page ? `<span class="obligation-page">p.${page}</span>` : ''}${escapeHtml(coupe)}</blockquote>`;
  }

  function renderObligationAudit(o) {
    const etat = LIBELLES_STATUT_OBLIGATION_OUTIL2[o.statut] || LIBELLES_STATUT_OBLIGATION_OUTIL2.a_verifier;
    const g = libelleGraviteAudit(etat.gravite);
    const badge = `<span class="dot-label ${etat.dl}">${icone(o.statut === 'tenue' ? 'check' : g.icone)}${etat.texte}</span>`;
    const cat = LIBELLES_CAT_OBLIGATION[o.type] ? `<span class="engagement-type ${escapeAttr(o.type)}">${LIBELLES_CAT_OBLIGATION[o.type]}</span>` : '';

    const colAvant = colonneObligation("Avant-contrat — engagement pris",
      o.clause ? citationObligation(o.clause, o.page)
               : `<p class="obligation-vide">Clause non retrouvée.</p>`,
      !o.clause);

    const colProjet = colonneObligation("Projet de vente — ce qu'il en dit",
      o.clauseProjet
        ? citationObligation(o.clauseProjet, o.pageProjet)
        : `<p class="obligation-vide">Le projet de vente ne reprend pas cet engagement.</p>`,
      !o.clauseProjet);

    let justif;
    if (o.preuve && o.preuve.source === 'depot') {
      justif = `<p class="obligation-preuve">${icone('file-text')}<em>${escapeHtml(o.preuve.nom)}</em></p>`
        + (o.preuve.date ? `<p class="obligation-preuve-date">Daté du ${escapeHtml(formatDateFr(o.preuve.date))}</p>` : '');
    } else if (o.preuve && o.preuve.source === 'dossier') {
      justif = `<p class="obligation-preuve">${icone('folder')}Déjà dans le dossier client${o.preuve.nom ? ' : <em>' + escapeHtml(o.preuve.nom) + '</em>' : ''}</p>`
        + `<p class="obligation-preuve-date">Fichier non lu ici : sa date reste à vérifier.</p>`;
    } else if (o.preuve && o.preuve.source === 'projet') {
      justif = `<p class="obligation-preuve">${icone('file-text')}Aucune pièce déposée</p>`
        + `<p class="obligation-preuve-date">Seule la mention du projet de vente l'établit${o.preuve.date ? ', datée du ' + escapeHtml(formatDateFr(o.preuve.date)) : ''}.</p>`;
    } else if (o.statut === 'non_tenue') {
      justif = `<p class="obligation-vide">Aucun justificatif déposé.</p>`;
    } else {
      justif = `<p class="obligation-vide">Engagement sans document type : à contrôler à la main.</p>`;
    }
    if (o.validite && o.validite.message && o.statut !== 'tenue') {
      justif += `<p class="obligation-validite">${escapeHtml(o.validite.message)}</p>`;
    } else if (o.validite && o.validite.statut === 'VALIDE') {
      justif += `<p class="obligation-preuve-date">${escapeHtml(o.validite.message)}</p>`;
    }
    const colJustif = colonneObligation('Justificatif', justif, !o.preuve);

    // Le liseré de gravité s'applique ici aussi : une obligation périmée est un constat critique,
    // elle ne doit pas porter le même filet qu'un simple « à vérifier » (défaut vu au rendu).
    const teinte = o.statut === 'tenue' ? ' obligation-tenue' : ` constat-${String(etat.gravite).toLowerCase()}`;
    const c = o.constatUid ? constatsAuditParUid[o.constatUid] : null;
    const pied = c ? (modeCommentairesAudit ? renderCommentaireConstatAudit(c) : renderRetourResumeAudit(c)) : '';
    const ancre = c ? ` id="audit-constat-${c.uid}"` : '';
    const corps = `<div class="analyse-ia-constat-titre">${badge}${cat}${escapeHtml(o.label || "Engagement du vendeur")}</div>
      <div class="obligation-cols">${colAvant}${colProjet}${colJustif}</div>
      ${pied}`;
    if (c && c.retour && c.retour.verdict === 'faux_positif') {
      const ouvert = formCommentaireAudit && formCommentaireAudit.uid === c.uid ? ' open' : '';
      return `<details class="analyse-ia-constat obligation-carte constat-ecarte${teinte}"${ancre}${ouvert}>
        <summary><span class="dot-label dl-neutre">${icone('x')}Faux positif ${c.retour.portee === 'dossier' ? 'pour ce dossier' : 'sur tous les dossiers'}</span>${escapeHtml(o.label || "Engagement du vendeur")}</summary>
        ${corps}
      </details>`;
    }
    return `<div class="analyse-ia-constat obligation-carte${teinte}"${ancre}>${corps}</div>`;
  }

  function renderSectionAudit(titre, liste, rendreItem, cleRubrique, ancre) {
    const items = Array.isArray(liste) ? liste.slice() : [];
    if (items.length === 0) return '';
    // Confirmés en tête, écartés en queue (repliés), le reste dans l'ordre déjà calculé.
    const rang = c => (c.memoire ? (c.memoire.decision === 'confirme' ? 0 : 2) : 1);
    items.sort((a, b) => rang(a) - rang(b));
    // Le bouton n'est proposé que sur les rubriques de constats : les tableaux (travaux,
    // obligations) portent justement la comparaison avant-contrat / projet, que l'étude a
    // désignée comme l'erreur lui coûtant le plus cher — rien à masquer là.
    const masquer = cleRubrique
      ? `<button type="button" class="audit-masquer" title="Ne plus afficher cette rubrique, sur cet audit et les suivants" onclick="basculerRubriqueAudit('${escapeOnclickArg(cleRubrique)}')">${icone('x')}Masquer</button>`
      : '';
    const id = cleRubrique || ancre;
    return `<section class="audit-section"${id ? ` id="audit-rub-${escapeAttr(id)}"` : ''}>
      <h3 class="audit-section-titre"><span class="section-eyebrow">${escapeHtml(titre)}</span><span class="audit-section-compte">${items.length}</span>${masquer}</h3>
      ${items.map(rendreItem).join('')}
    </section>`;
  }

  // Le rapport est organisé par SOURCE, dans l'ordre de lecture donné par l'étude : « lire le
  // contenu de l'acte de vente, PUIS comparer avec l'avant-contrat, PUIS avec les annexes ».
  //
  // Règle d'affectation, à garder en tête avant d'ajouter une catégorie : une section est définie
  // par le DOCUMENT qu'il faut ouvrir pour trancher le point. Un constat qui touche deux sources
  // n'apparaît QU'UNE fois, dans la section de la source la plus fragile (celle qui peut manquer)
  // — répéter le même constat dans deux sections recréerait la duplication que l'étude a déjà
  // fait retirer une fois.
  var SECTIONS_RAPPORT_OUTIL2 = [
    {
      cle: 'ACTE',
      titre: 'Ce que dit l’acte',
      source: 'Établi à partir du document principal seul.'
    },
    {
      cle: 'AVANT_CONTRAT',
      titre: 'Écarts avec l’avant-contrat',
      source: 'Établi en comparant le projet à l’avant-contrat signé.'
    },
    {
      cle: 'ANNEXES',
      titre: 'Ce que les annexes apportent',
      source: 'Établi à partir des pièces déposées avec l’acte.'
    }
  ];

  // Les catégories restent celles que produisent les détecteurs : seul leur regroupement change.
  // Sous-titres conservés à l'intérieur de chaque section — ils disent ce que le constat concerne,
  // là où la section dit d'où il vient.
  var SOUS_SECTIONS_RAPPORT_OUTIL2 = [
    { cle: 'ACTE', section: 'ACTE', titre: 'Déclarations et cohérence de l’acte' },
    { cle: 'PARTIES', section: 'ACTE', titre: 'Statut et quotités des acquéreurs' },
    { cle: 'TRAVAUX_REALISES', section: 'ACTE', titre: 'Travaux déjà réalisés sur le bien' },
    { cle: 'DIAGNOSTICS', section: 'ACTE', titre: 'Diagnostics' },
    { cle: 'ENTRETIENS', section: 'ACTE', titre: 'Entretiens à justifier' },
    { cle: 'DOCUMENTS', section: 'ACTE', titre: 'Documents à obtenir du vendeur' },
    { cle: 'TRAVAUX_A_FAIRE', section: 'ACTE', titre: 'Travaux à réaliser avant la vente' },
    { cle: 'COMPARAISON_COMPROMIS', section: 'AVANT_CONTRAT', titre: 'Différences relevées' },
    { cle: 'COPROPRIETE', section: 'ANNEXES', titre: 'Assemblées générales de copropriété' },
    { cle: 'CARNET_ENTRETIEN', section: 'ANNEXES', titre: 'Carnet d’entretien de l’immeuble' },
    { cle: 'ETAT_DATE', section: 'ANNEXES', titre: 'État daté / pré-état daté' },
    { cle: 'URBANISME', section: 'ANNEXES', titre: 'Certificat d’urbanisme' },
    { cle: 'CONTROLE_URBANISME', section: 'ACTE', titre: 'Contrôle de l’urbanisme (droits de préemption, zone protégée)' },
    { cle: 'PERMIS', section: 'ANNEXES', titre: 'Permis de construire (terrain à bâtir)' }
  ];

  // Le dernier rapport affiché, pour le redessiner après une décision sur un constat (ou après
  // l'arrivée des constats du modèle) sans relancer l'analyse ; chaque constat reçoit un
  // identifiant de rendu (uid) et sa décision mémorisée (memoire), posés par preparerRapportAudit.
  let dernierRapportAudit = null;
  let constatsAuditParUid = {};

  // Tout ce qu'il faut pour REJOUER l'analyse sans refaire le travail asynchrone (lecture des PDF,
  // récupération de l'avant-contrat sur le NAS) : c'est ce qui rend la correction du type de bien
  // instantanée. L'analyse elle-même est purement locale et synchrone, la rejouer ne coûte rien.
  let dernierAuditContexte = null;
  // Type de bien choisi à la main dans le rapport. Remis à zéro dès que les documents ou le mode
  // changent : il se rapporte à l'acte analysé, pas à la session.
  let typeBienAuditChoisi = null;


  function preparerRapportAudit(resultat) {
    constatsAuditParUid = {};
    let n = 0;
    for (const c of (resultat.constats || [])) {
      if (!c || typeof c !== 'object') continue;
      c.uid = `k${++n}`;
      constatsAuditParUid[c.uid] = c;
      const m = decisionPourConstat(c, memoireAuditConstats);
      c.memoire = m ? { id: m.id, decision: m.decision, nb: m.nb || 1 } : null;
    }
    // Les commentaires de l'étude s'appliquent ensuite (gravité corrigée, faux positif replié), et
    // le résumé comme les questions sont recalculés sur ce qui reste réellement retenu : un point
    // jugé faux positif ne doit plus gonfler le compteur ni produire une question au syndic.
    // Les engagements du vendeur s'affichent en cartes à trois colonnes (renderObligationAudit),
    // pas en constats : chaque carte retrouve le constat qu'elle représente pour porter son
    // commentaire et son repli.
    for (const o of (resultat.obligations || [])) {
      const c = (resultat.constats || []).find(x => x && x.categorie === 'OBLIGATIONS' && x.phrase === o.clause);
      o.constatUid = c ? c.uid : null;
    }
    appliquerRetoursAuxConstats(resultat.constats || [], retoursAudit, dernierAuditContexte ? dernierAuditContexte.dossierCle : '');
    resultat.resume = resumeConstatsOutil2(resultat.constats);
  }

  function decisionConstatAudit(uid, decision) {
    const c = constatsAuditParUid[uid];
    if (!c || !dernierRapportAudit) return;
    memoriserDecisionConstat(c, decision);
    preparerRapportAudit(dernierRapportAudit);
    renderRapportAuditActe(dernierRapportAudit);
    afficherToast(decision === 'ecarte'
      ? 'Constat écarté : il sera replié sur les prochains audits d’un acte similaire.'
      : 'Constat confirmé : il remontera en tête sur les prochains audits d’un acte similaire.', 'OK', null);
  }

  function annulerDecisionConstatAudit(uid) {
    const c = constatsAuditParUid[uid];
    if (!c || !c.memoire || !dernierRapportAudit) return;
    oublierDecisionConstat(c.memoire.id);
    preparerRapportAudit(dernierRapportAudit);
    renderRapportAuditActe(dernierRapportAudit);
  }

  // La fiche d'identité, en tête de la section 1 : ce que l'outil a compris de l'acte, TOUJOURS
  // affiché, y compris les lignes qu'il n'a pas trouvées. Sans elle, un rapport sans constat ne
  // dit pas si l'acte a été lu ou seulement traversé — c'est exactement ce qui manquait sur le
  // projet réel envoyé par l'étude, où le rapport ne portait que « vous ne m'avez pas donné le
  // document ». Une valeur absente s'affiche « non trouvé » : jamais devinée, jamais complétée.
  function renderFicheActe(fiche) {
    const lignes = Array.isArray(fiche) ? fiche : [];
    if (lignes.length === 0) return '';
    const cases = lignes.map(l => `<div class="fiche-acte-case">
      <span class="fiche-acte-libelle">${escapeHtml(l.libelle)}</span>
      <span class="fiche-acte-valeur${l.valeur ? '' : ' fiche-acte-absent'}">${escapeHtml(l.valeur || 'non trouvé')}</span>
      ${l.page ? `<span class="fiche-acte-page">p.${escapeHtml(String(l.page))}</span>` : ''}
    </div>`).join('');
    return `<div class="fiche-acte">${cases}</div>`;
  }

  // Le TABLEAU des travaux déclarés — demandé par l'étude : « lister les travaux et vérifier s'ils
  // sont déclarés, s'il y a des factures et s'il y a les assurances décennales ». Les constats ne
  // suffisaient pas : ils ne parlent que du gros œuvre et de l'extérieur, si bien qu'une rénovation
  // intérieure n'apparaissait nulle part — rien n'était « listé ».
  //
  // Les trois colonnes sont lues DANS L'ACTE et lui seul (arbitrage explicite de l'étude : ce que
  // l'acte affirme fait foi, l'outil ne va pas vérifier qu'une autorisation ou une facture est
  // effectivement déposée en pièce). Un tiret « — » signifie « sans objet », un point
  // d'interrogation « impossible à dire », et c'est une information différente d'une croix.
  function celluleTravailAudit(etat, titre) {
    const table = {
      oui: { txt: '✓', cls: 'travaux-oui' },
      non: { txt: '✕', cls: 'travaux-non' },
      na: { txt: '—', cls: 'travaux-na' },
      inconnu: { txt: '?', cls: 'travaux-na' }
    };
    const c = table[etat] || table.inconnu;
    return `<td class="${c.cls}"${titre ? ` title="${escapeAttr(titre)}"` : ''}>${c.txt}</td>`;
  }

  function ligneTravailAudit(t) {
    const autorisation = !t.soumisAutorisation ? 'na' : (t.autorisationMentionnee ? 'oui' : 'non');
    const facture = t.factureMentionnee ? 'oui' : 'non';
    // La décennale ne se pose que sur un travail de moins de dix ans : au-delà elle est éteinte,
    // et réclamer l'attestation n'aurait plus d'objet.
    const decennale = t.sousDecennale === null ? 'inconnu' : (!t.sousDecennale ? 'na' : (t.decennaleMentionnee ? 'oui' : 'non'));
    return `<tr>
      <td class="travaux-libelle">${escapeHtml(t.libelle || t.phrase || '')}${t.page ? `<span class="travaux-page">p.${escapeHtml(String(t.page))}</span>` : ''}</td>
      <td class="travaux-annee">${t.annee ? escapeHtml(String(t.annee)) : '—'}</td>
      ${celluleTravailAudit(autorisation, t.soumisAutorisation ? "Autorisation d'urbanisme mentionnée dans l'acte" : "Travaux sans incidence sur la structure ni l'extérieur : aucune autorisation exigible")}
      ${celluleTravailAudit(facture, "Facture ou devis mentionné dans l'acte")}
      ${celluleTravailAudit(decennale, t.sousDecennale === null ? "Année non précisée : impossible de savoir si la garantie court encore" : (!t.sousDecennale ? 'Travaux de plus de dix ans : garantie décennale éteinte' : "Attestation d'assurance décennale mentionnée dans l'acte"))}
    </tr>`;
  }

  function renderTableauTravauxAudit(titre, travaux, note) {
    const liste = Array.isArray(travaux) ? travaux : [];
    if (liste.length === 0) return '';
    return `<section class="audit-section">
      <h3 class="audit-section-titre"><span class="section-eyebrow">${escapeHtml(titre)}</span><span class="audit-section-compte">${liste.length}</span></h3>
      ${note ? `<p class="hint">${escapeHtml(note)}</p>` : ''}
      <div class="travaux-table-wrap">
        <table class="travaux-table">
          <thead><tr><th>Travaux déclarés</th><th>Année</th><th>Autorisation</th><th>Facture</th><th>Décennale</th></tr></thead>
          <tbody>${liste.map(ligneTravailAudit).join('')}</tbody>
        </table>
      </div>
    </section>`;
  }

  // Un bloc = une SOURCE. Il porte son titre, la phrase qui dit d'où viennent ses constats, puis
  // ses sous-sections. Quand il n'a rien à montrer il ne se tait pas : il dit POURQUOI (aucune
  // annexe déposée, aucun écart relevé…). Se taire ferait lire « rien à signaler » là où il faut
  // lire « rien n'a pu être contrôlé » — la confusion même que l'étude a signalée.
  function renderBlocAudit(bloc, resultat, constats) {
    let corps = '';
    let vide = true;

    if (bloc.cle === 'ACTE') {
      const fiche = renderFicheActe(resultat.fiche);
      if (fiche) { corps += fiche; vide = false; }
      // Le tableau des travaux appartient à la section de la source où ils ont été LUS : ici
      // l'acte relu en mode « compromis », l'avant-contrat en mode « projet de vente » (bloc
      // AVANT_CONTRAT ci-dessous). Un même tableau dans les deux sections dirait deux fois la
      // même chose, et dans la mauvaise moitié du rapport une fois sur deux.
      if (resultat.mode !== 'acte') {
        const t = renderTableauTravauxAudit('Travaux déclarés dans l’acte', resultat.travaux,
          "Lu dans l'acte seul : une colonne cochée signifie que l'acte le mentionne, pas que la pièce est déposée.");
        if (t) { corps += t; vide = false; }
      }
    }

    // Mode « projet de vente » : le tableau des obligations ouvre la section « avant-contrat »
    // — c'est bien une comparaison (l'engagement pris ‖ ce que le projet en dit ‖ le justificatif)
    // et il remplace la catégorie OBLIGATIONS des constats, qui redirait la même chose.
    if (bloc.cle === 'AVANT_CONTRAT' && resultat.mode === 'acte' && (resultat.obligations || []).length) {
      corps += renderSectionAudit('Engagements du vendeur — avant-contrat, projet, justificatif',
        resultat.obligations, renderObligationAudit, null, 'OBLIGATIONS');
      vide = false;
    }

    if (bloc.cle === 'AVANT_CONTRAT' && resultat.mode === 'acte') {
      const t = renderTableauTravauxAudit('Travaux déclarés dans l’avant-contrat', resultat.travaux,
        "Lu dans l'avant-contrat seul : une colonne cochée signifie qu'il le mentionne, pas que la pièce est déposée.");
      if (t) { corps += t; vide = false; }
    }

    if (bloc.cle === 'ANNEXES') {
      const t = renderTableauTravauxAudit('Travaux recensés au carnet d’entretien', resultat.travauxCarnet,
        "Relevés dans le carnet d'entretien de l'immeuble : à croiser avec les assemblées générales et les autorisations d'urbanisme.");
      if (t) { corps += t; vide = false; }
    }

    let nbMasquees = 0;
    for (const sous of SOUS_SECTIONS_RAPPORT_OUTIL2) {
      if (sous.section !== bloc.cle) continue;
      const items = constats.filter(c => c.categorie === sous.cle);
      if (items.length === 0) continue;
      if (rubriqueMasqueeAudit(sous.cle)) { nbMasquees++; continue; }
      const html = renderSectionAudit(sous.titre, items, renderConstatAudit, sous.cle);
      if (html) { corps += html; vide = false; }
    }

    // Une section vidée par un MASQUAGE ne dit pas « rien à signaler » : ce serait faux, et c'est
    // exactement la confusion que ce rapport combat ailleurs (« rien à signaler » lu à la place de
    // « rien n'a pu être contrôlé »).
    if (vide) {
      corps = nbMasquees
        ? `<p class="hint">${nbMasquees} rubrique(s) masquée(s) dans cette section — à réafficher en bas du rapport.</p>`
        : `<p class="hint">${escapeHtml(messageBlocAuditVide(bloc, resultat))}</p>`;
    }

    return `<section class="audit-bloc" id="audit-bloc-${escapeAttr(bloc.cle)}">
      <h2 class="audit-bloc-titre">${escapeHtml(bloc.titre)}</h2>
      <p class="audit-bloc-source">${escapeHtml(bloc.source)}</p>
      ${corps}
    </section>`;
  }

  function messageBlocAuditVide(bloc, resultat) {
    if (bloc.cle === 'AVANT_CONTRAT') {
      // Sans avant-contrat de référence, il n'y a pas « aucun écart » : il n'y a eu AUCUNE
      // comparaison. Les confondre reviendrait à rassurer l'étude sur le point qu'elle a désigné
      // comme lui ayant coûté le plus cher.
      if (!resultat.comparaisonFaite) {
        return "Aucun avant-contrat de référence : liez le dossier CLAIRE ou déposez le compromis signé pour que les parties, le prix, la désignation du bien et les dates soient comparés.";
      }
      return "Aucun écart relevé entre l'avant-contrat et le projet, et aucun engagement du vendeur repéré dans l'avant-contrat.";
    }
    if (bloc.cle === 'ANNEXES') {
      if (resultat.nbJustificatifs) {
        return "Rien à signaler dans les pièces déposées, pour les seuls points contrôlés par l'outil.";
      }
      // La liste des pièces citées dépend du TYPE DE BIEN : annoncer un état daté et des
      // procès-verbaux d'assemblée sur une maison ferait croire à un contrôle qui n'a pas lieu
      // d'être, et taire le carnet d'entretien sur une copropriété en ferait manquer un.
      const attendues = resultat.typeBien === 'copropriete'
        ? "les diagnostics, l'état daté, le certificat d'urbanisme, les procès-verbaux d'assemblée et le carnet d'entretien"
        : resultat.typeBien === 'terrain'
          ? "les diagnostics, le certificat d'urbanisme, le permis de construire et son constat d'affichage"
          : "les diagnostics et le certificat d'urbanisme";
      return `Aucune annexe déposée : ${attendues} n'ont pas pu être contrôlés.`;
    }
    return "Rien à signaler dans le document principal, pour les seuls points contrôlés par l'outil.";
  }

  // Détail des contrôles AUTOMATIQUES de CLAIRE (règles déterministes, sans IA) : il vit désormais
  // dans le tableau de bord de la relecture, sous la grille de Claude (voir renderTableauDeBordRelecture).
  // Le point d'entrée garde son nom : tout ce qui modifie un constat (décision, commentaire, type
  // de bien) le rappelle pour redessiner.
  function renderRapportAuditActe() {
    renderTableauDeBordRelecture();
  }

  function renderPartiesDossierAudit(resultat) {
    const d = auditDossierLie;
    const ctx = dernierAuditContexte;
    if (!d || !ctx || resultat.mode !== 'acte' || !ctx.entree || !ctx.entree.reference) return '';
    const texte = (ctx.entree.reference.parties || []);
    if (!ctx.referenceLueDansTexte || !partiesDivergentes(d.parties, texte)) return '';
    const liste = texte.map(p => `${p.nom} (${String(p.role || '').toLowerCase()})`).join(', ');
    return `<p class="audit-ecarts audit-ecarts-alerte"><span class="dot-label dl-pret">${icone('info')}Fiche à mettre à jour</span>
      Les parties enregistrées sur le dossier ne sont pas celles lues dans l'avant-contrat : ${escapeHtml(liste)}. La relecture s'appuie sur l'avant-contrat.
      <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="mettreAJourPartiesDossierAudit()">Mettre à jour la fiche</wa-button></p>`;
  }

  // Seule écriture sur le dossier lié depuis cet écran, et seulement sur un clic confirmé : la
  // relecture reste en lecture seule sur tout le reste.
  function mettreAJourPartiesDossierAudit() {
    const d = auditDossierLie;
    const ctx = dernierAuditContexte;
    if (!d || !ctx || !ctx.entree || !ctx.entree.reference) return;
    const parties = (ctx.entree.reference.parties || []).map(p => ({
      nom: p.nom, qualiteActe: p.qualiteActe, role: p.role,
      qualitePersonne: p.qualitePersonne || 'physique', representant: p.representant || null,
      ...(p.nomUsage ? { nomUsage: p.nomUsage } : {})
    }));
    if (!parties.length) return;
    demanderConfirmation("Remplacer les parties de la fiche par celles lues dans l'avant-contrat ? Le nom du dossier n'est pas modifié.", () => {
      d.parties = parties;
      ajouterHistorique(d, "Parties mises à jour depuis l'avant-contrat relu (Relecture d'actes)");
      sauvegarder(d);
      afficherToast('Fiche du dossier mise à jour.', 'OK', null);
      if (dernierRapportAudit) renderRapportAuditActe(dernierRapportAudit);
    });
  }

  // ---- Commentaires : état, panneau, actions --------------------------------------------------
  const CLE_MODE_COMMENTAIRES_AUDIT = 'audit-mode-commentaires';
  let modeCommentairesAudit = false;
  try { modeCommentairesAudit = localStorage.getItem(CLE_MODE_COMMENTAIRES_AUDIT) === '1'; } catch (e) { /* navigation privée */ }
  let retoursAudit = [];
  let formCommentaireAudit = null; // { uid, verdict, portee, gravite, texte, id }
  let texteOubliAudit = '';
  let porteeOubliAudit = 'dossier';

  async function chargerRetoursAudit() {
    try {
      const reponse = await fetchAvecAuth('/api/audit-retours');
      if (!reponse.ok) throw new Error('statut ' + reponse.status);
      const data = await reponse.json();
      retoursAudit = Array.isArray(data.retours) ? data.retours : [];
    } catch (e) {
      console.warn('Commentaires de relecture indisponibles', e);
    }
    return retoursAudit;
  }

  async function basculerModeCommentairesAudit(actif) {
    modeCommentairesAudit = !!actif;
    try { localStorage.setItem(CLE_MODE_COMMENTAIRES_AUDIT, actif ? '1' : '0'); } catch (e) { /* sans importance */ }
    formCommentaireAudit = null;
    if (actif) await chargerRetoursAudit();
    if (dernierRapportAudit) { preparerRapportAudit(dernierRapportAudit); renderRapportAuditActe(dernierRapportAudit); }
  }

  function retoursDuDossierAudit() {
    const cle = dernierAuditContexte ? dernierAuditContexte.dossierCle : '';
    return retoursAudit.filter(r => r.verdict === 'manque' && (r.portee === 'tous' || (cle && r.dossierCle === cle)));
  }

  function renderPanneauCommentairesAudit() {
    const oublis = retoursDuDossierAudit();
    return `<section class="audit-panneau-commentaires">
      <div class="audit-panneau-tete">
        <div>
          <strong>Mode commentaires ${infoBulle("Sous chaque point : « Juste », « Faux positif », « Mal formulé » ou « Gravité à revoir », avec votre justification. Un faux positif est replié tout de suite (pour ce dossier ou pour tous) ; l'ensemble sert ensuite à corriger les règles de la relecture.")}</strong>
        </div>
        <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="exporterRetoursAudit()">${icone('download')}Exporter les commentaires (${retoursAudit.length})</wa-button>
      </div>
      <label for="audit-oubli-texte" class="audit-commentaire-question">Ce que la relecture a raté</label>
      <textarea id="audit-oubli-texte" rows="2" placeholder="Ex. « la servitude de passage page 14 n'est pas signalée »" oninput="texteOubliAudit = this.value">${escapeHtml(texteOubliAudit)}</textarea>
      <div class="audit-commentaire-ligne">
        <label><input type="radio" name="audit-oubli-portee" ${porteeOubliAudit === 'dossier' ? 'checked' : ''} onchange="porteeOubliAudit = 'dossier'"> Ce dossier seulement</label>
        <label><input type="radio" name="audit-oubli-portee" ${porteeOubliAudit === 'tous' ? 'checked' : ''} onchange="porteeOubliAudit = 'tous'"> Tous les dossiers</label>
        <wa-button appearance="outlined" class="secondary audit-oubli-btn" onclick="enregistrerOubliAudit()">Signaler l'oubli</wa-button>
      </div>
      ${oublis.length ? `<ul class="audit-oublis">${oublis.map(r => `<li><span class="dot-label dl-urgent">${icone('info')}${r.portee === 'dossier' ? 'Ce dossier' : 'Tous'}</span><span>${escapeHtml(r.commentaire)}</span><wa-button appearance="plain" size="s" type="button" class="bouton-icone piece-suppr" onclick="supprimerRetourAudit('${escapeOnclickArg(r.id)}')" title="Supprimer" aria-label="Supprimer">${icone('x')}</wa-button></li>`).join('')}</ul>` : ''}
    </section>`;
  }

  function ouvrirCommentaireAudit(uid, verdict) {
    const c = constatsAuditParUid[uid];
    if (!c) return;
    formCommentaireAudit = { uid, verdict, portee: 'dossier', gravite: c.gravite, texte: '', id: null };
    if (dernierRapportAudit) renderRapportAuditActe(dernierRapportAudit);
    const champ = document.getElementById('audit-com-texte');
    if (champ) champ.focus();
  }

  function modifierCommentaireAudit(uid) {
    const c = constatsAuditParUid[uid];
    if (!c || !c.retour) return;
    formCommentaireAudit = { uid, verdict: c.retour.verdict, portee: c.retour.portee,
      gravite: c.retour.graviteSouhaitee || c.gravite, texte: c.retour.commentaire || '', id: c.retour.id };
    if (dernierRapportAudit) renderRapportAuditActe(dernierRapportAudit);
  }

  function changerVerdictCommentaireAudit(verdict) {
    if (!formCommentaireAudit) return;
    formCommentaireAudit.verdict = verdict;
    if (dernierRapportAudit) renderRapportAuditActe(dernierRapportAudit);
  }

  function fermerCommentaireAudit() {
    formCommentaireAudit = null;
    if (dernierRapportAudit) renderRapportAuditActe(dernierRapportAudit);
  }

  function contexteRetourAudit() {
    const ctx = dernierAuditContexte || {};
    const r = dernierRapportAudit || {};
    return { dossierCle: ctx.dossierCle || '', dossierNom: ctx.dossierNom || '', document: ctx.documentPrincipal || '',
      mode: r.mode || 'compromis', typeBien: r.typeBien || '', date: new Date().toISOString() };
  }

  async function publierRetourAudit(retour) {
    const reponse = await fetchAvecAuth('/api/audit-retours', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retour)
    });
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => ({}));
      throw new Error(corps.erreur || 'statut ' + reponse.status);
    }
    const data = await reponse.json();
    retoursAudit = retoursAudit.filter(x => x.id !== data.retour.id).concat([data.retour]);
    return data.retour;
  }

  function rafraichirApresCommentaireAudit() {
    if (!dernierRapportAudit) return;
    preparerRapportAudit(dernierRapportAudit);
    renderRapportAuditActe(dernierRapportAudit);
  }

  async function enregistrerCommentaireAudit() {
    const f = formCommentaireAudit;
    const c = f && constatsAuditParUid[f.uid];
    if (!c) return;
    const retour = {
      ...contexteRetourAudit(),
      id: f.id || undefined,
      verdict: f.verdict,
      portee: f.portee,
      commentaire: String(f.texte || '').trim(),
      graviteSouhaitee: f.verdict === 'gravite' ? f.gravite : null,
      empreinte: empreinteTexteConstat(c),
      constat: { categorie: c.categorie, gravite: c.graviteOrigine || c.gravite, titre: c.titre,
        description: c.description || '', phrase: c.phrase || '', page: c.page || null }
    };
    try {
      await publierRetourAudit(retour);
      formCommentaireAudit = null;
      rafraichirApresCommentaireAudit();
      afficherToast(f.verdict === 'faux_positif'
        ? (f.portee === 'dossier' ? 'Faux positif noté : replié pour ce dossier.' : 'Faux positif noté : replié sur tous les dossiers.')
        : 'Commentaire enregistré.', 'OK', null);
    } catch (e) {
      afficherToast("Le commentaire n'a pas pu être enregistré : " + e.message, 'OK', null);
    }
  }

  async function supprimerRetourAudit(id) {
    try {
      const reponse = await fetchAvecAuth('/api/audit-retours/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!reponse.ok && reponse.status !== 404) throw new Error('statut ' + reponse.status);
      retoursAudit = retoursAudit.filter(r => r.id !== id);
      rafraichirApresCommentaireAudit();
    } catch (e) {
      afficherToast('Suppression impossible : ' + e.message, 'OK', null);
    }
  }

  function supprimerCommentaireAudit(uid) {
    const c = constatsAuditParUid[uid];
    if (c && c.retour) supprimerRetourAudit(c.retour.id);
  }

  async function enregistrerOubliAudit() {
    const texte = String(texteOubliAudit || '').trim();
    if (!texte) {
      afficherToast("Décrivez ce que la relecture aurait dû signaler.", 'OK', null);
      return;
    }
    try {
      await publierRetourAudit({ ...contexteRetourAudit(), verdict: 'manque', portee: porteeOubliAudit, commentaire: texte });
      texteOubliAudit = '';
      rafraichirApresCommentaireAudit();
      afficherToast('Oubli signalé.', 'OK', null);
    } catch (e) {
      afficherToast("L'oubli n'a pas pu être enregistré : " + e.message, 'OK', null);
    }
  }

  // L'export est ce qui permet de corriger les règles : le fichier est relu, commentaire par
  // commentaire, et chaque correction de règle part de là (jamais une règle réécrite toute seule).
  // Il contient les clauses citées des actes : à transmettre comme les actes eux-mêmes.
  async function exporterRetoursAudit() {
    await chargerRetoursAudit();
    const contenu = JSON.stringify({ application: 'CLAIRE', version: VERSION_APP, exporteLe: new Date().toISOString(), retours: retoursAudit }, null, 2);
    const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `commentaires-relecture-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

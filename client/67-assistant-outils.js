  // ---- « Demander à CLAIRE » : tous les outils de CLAIRE (étude 13/10 : « Claire doit pouvoir utiliser tous les outils que l'on a
  // créés ») ----
  // Les calculs déjà branchés passent par faire_geste (provision, prorata, quotités, appel de fonds, contrôle de l'urbanisme). Cet outil
  // ajoute le reste — Contrôle de l'urbanisme (résultat lu sur la fiche), Quotités (ce que la fiche donne),
  // Répertoire et annuaire des notaires, Relecture d'actes, Forfait mobilier, Claire Scan, Nouveau dossier — en deux modes :
  //   - « lire » : le résultat rendu à l'agent (données de la fiche ou du répertoire, MASQUÉES par le serveur comme tout résultat) ;
  //   - « ouvrir » : un bouton dans la conversation qui ouvre l'outil, pré-rempli du dossier — jamais d'écran changé sous les yeux
  //     de l'utilisateur pendant qu'il lit la réponse. Ouvrir ou lire ne modifie rien : pas de carte d'autorisation.

  var OUTILS_CLAIRE_AGENT = {
    controle_urbanisme: { libelle: 'Contrôle de l’urbanisme', onglet: 'preemption' },
    quotites: { libelle: 'Quotités', onglet: 'quotites' },
    appel_fonds: { libelle: 'Appel de fonds', onglet: 'appel-fonds' },
    provision: { libelle: 'Provision sur frais', onglet: 'calculateur' },
    prorata: { libelle: 'Prorata', onglet: 'prorata' },
    forfait_mobilier: { libelle: 'Forfait mobilier', onglet: 'inventaire' },
    repertoire: { libelle: 'Répertoire', onglet: 'confreres' },
    claire_scan: { libelle: 'Claire Scan', onglet: 'scans' },
    nouveau_dossier: { libelle: 'Nouveau dossier', onglet: 'nouveau' }
  };
  var MAX_RESULTATS_REPERTOIRE_AGENT = 15;

  // Pure : l'outil porte-t-il déjà un travail sur un AUTRE dossier (quotités saisies, relecture lancée, appel de fonds) ? Le
  // pré-remplir le perdrait (relecture 13/10) : on le demande d'abord. Même dossier : l'outil est seulement affiché, tel quel.
  function travailEnCoursOutilAgent(outil, d, etat) {
    const e = etat || {};
    const autre = (id) => !!id && (!d || id !== d.id);
    if (outil === 'quotites') return autre(e.quotites);
    if (outil === 'appel_fonds') return autre(e.appelFonds);
    if (outil === 'controle_urbanisme') return autre(e.urbanisme);
    return false;
  }

  function dossierDejaDansOutilAgent(outil, d, etat) {
    const e = etat || {};
    const id = outil === 'quotites' ? e.quotites : outil === 'appel_fonds' ? e.appelFonds : outil === 'controle_urbanisme' ? e.urbanisme : '';
    return !!(d && id && id === d.id);
  }

  // Ouvre l'outil, pré-rempli du dossier quand l'outil le permet (dans le geste de l'utilisateur : clic sur le bouton).
  function ouvrirOutilClaireAgent(outil, d, confirme) {
    const o = OUTILS_CLAIRE_AGENT[outil];
    if (!o) return;
    const etat = { quotites: qtDossierLie || '', appelFonds: afDossierLie || '',
      urbanisme: prEtat && prEtat.dossierId ? prEtat.dossierId : '' };
    if (!confirme && travailEnCoursOutilAgent(outil, d, etat)) {
      demanderConfirmation(`Remplacer le travail en cours dans l’outil ${o.libelle} ? Il porte sur un autre dossier et sera perdu.`, () => ouvrirOutilClaireAgent(outil, d, true));
      return;
    }
    // Déjà sur ce dossier : on montre l'outil sans le remettre à zéro.
    if (dossierDejaDansOutilAgent(outil, d, etat)) { definirOnglet(o.onglet); return; }
    if (outil === 'appel_fonds' && d) { preparerAppelFondsDepuisDossier(d.id); return; }
    if (outil === 'controle_urbanisme' && d) { ouvrirPreemptionDepuisFiche(d.id); return; }
    definirOnglet(o.onglet);
    if (!d) return;
    if (outil === 'quotites') choisirDossierQuotites(d.id);
  }

  // Pure : ce que l'outil donne à lire pour un dossier (ou le répertoire pour un texte) — un objet, ou { erreur }.
  function lectureOutilClaireAgent(outil, d, texte) {
    if (outil === 'repertoire') return chercherRepertoireAgent(texte);
    if (!d) return { erreur: 'dossier_id attendu pour lire cet outil' };
    if (outil === 'controle_urbanisme') {
      const p = d.preemption;
      if (!p) return { analyse: 'aucune analyse enregistrée sur la fiche : ouvre l’outil (mode ouvrir) pour la lancer' };
      const patr = lignePatrimoinePreemption(p.patrimoine);
      return {
        droits: droitsPreemptionFiche(p).map(x => ({ droit: x.titre || x.cle, statut: x.statut, motif: x.motif || '', formalite: x.formalite || '' })),
        ...(patr ? { patrimoine: { statut: patr.statut, titre: patr.titre, motif: patr.motif || '' } } : {}),
        travaux: ((p.travaux && p.travaux.liste) || []).slice(0, 20).map(t => ({ travaux: String(t.nature || '').slice(0, 200), annee: t.annee || '', autorisation: t.autorisation || '' })),
        autorisations_sitadel: ((p.sitadel && p.sitadel.autorisations) || []).slice(0, 20).map(a => ({ type: a.type || '', autorisee_le: a.autoriseLe || '', etat: a.etat || '' }))
      };
    }
    if (outil === 'quotites') {
      const q = prefillQuotites(d);
      return q ? { acquereurs: (q.acquereurs || []).map(a => ({ civilite: a.civilite, nom: a.nom || '' })), prix: q.prix || null, type_bien: q.typeBien || '',
        a_completer: q.aCompleter || [], note: 'les quotités se calculent avec les apports et prêts de chaque acquéreur : ouvre l’outil pour les saisir' } : { erreur: 'dossier illisible' };
    }
    return { erreur: 'cet outil ne se lit pas : ouvre-le (mode ouvrir) ; provision, prorata et appel de fonds passent par faire_geste' };
  }

  // Pure : les contacts du répertoire et les offices de notaires qui contiennent tous les mots du texte (15 au plus).
  function chercherRepertoireAgent(texte, contacts, offices) {
    const mots = normaliserPourRecherche(String(texte || '')).split(/[^a-z0-9]+/).filter(m => m.length >= 2);
    if (!mots.length) return { erreur: 'texte = ce qu’on cherche (organisme, nom, ville, thème)' };
    const tous = (botte) => mots.every(m => botte.includes(m));
    const resultats = [];
    for (const c of (contacts || repertoireContacts || [])) {
      if (resultats.length >= MAX_RESULTATS_REPERTOIRE_AGENT) break;
      const botte = normaliserPourRecherche([c.organisme, c.service, (c.personnes || []).join(' '), c.adresse, c.theme, c.notes].join(' '));
      if (!tous(botte)) continue;
      resultats.push({ sorte: 'contact', organisme: c.organisme || '', service: c.service || '', personnes: (c.personnes || []).slice(0, 4), adresse: c.adresse || '',
        telephones: (c.telephones || []).map(x => valeurLibelleeRepertoire(x).valeur).slice(0, 3), emails: (c.emails || []).map(x => valeurLibelleeRepertoire(x).valeur).slice(0, 3) });
    }
    for (const o of (offices || carnetConfreres || [])) {
      if (resultats.length >= MAX_RESULTATS_REPERTOIRE_AGENT) break;
      const botte = normaliserPourRecherche([o.office, (o.notaires || []).join(' '), o.ville, o.codePostal, o.email, 'notaire office'].join(' '));
      if (!tous(botte)) continue;
      resultats.push({ sorte: 'notaire', office: o.office || '', notaires: (o.notaires || []).slice(0, 4), adresse: normaliserAdresse([o.adresse, [o.codePostal, o.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')),
        telephone: o.telephone || '', email: o.email || '' });
    }
    return { nombre: resultats.length, resultats, ...(resultats.length >= MAX_RESULTATS_REPERTOIRE_AGENT ? { coupe: 'affine la recherche' } : {}) };
  }

  async function outilClaireAgent(entree) {
    const e = entree || {};
    const o = OUTILS_CLAIRE_AGENT[e.outil];
    if (!o) return { erreur: 'outil inconnu' };
    const d = e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null;
    if (e.dossier_id && !d) return { erreur: 'dossier introuvable : cherche-le d’abord (chercher_dossiers)' };
    if (e.mode === 'ouvrir') {
      poserMessageAssistant('claire', `<p>${escapeHtml(o.libelle)}${d ? ` — ${escapeHtml(libelleDossierAffiche(d))}` : ''} est prêt à ouvrir.</p>`,
        [{ libelle: `Ouvrir ${o.libelle}`, principal: true, action: () => ouvrirOutilClaireAgent(e.outil, d) }]);
      return { fait: true, bouton_affiche: `Ouvrir ${o.libelle}` };
    }
    try { return lectureOutilClaireAgent(e.outil, d, e.texte); } catch (err) { return { erreur: 'lecture impossible : ' + String(err && err.message || err).slice(0, 120) }; }
  }

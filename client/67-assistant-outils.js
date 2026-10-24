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
    nouveau_dossier: { libelle: 'Nouveau dossier', onglet: 'nouveau' },
    constitution: { libelle: 'Constitution de dossier', onglet: 'constitution' }
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
    if (outil === 'constitution') return autre(e.constitution);
    return false;
  }

  function dossierDejaDansOutilAgent(outil, d, etat) {
    const e = etat || {};
    const id = outil === 'quotites' ? e.quotites : outil === 'appel_fonds' ? e.appelFonds : outil === 'controle_urbanisme' ? e.urbanisme : outil === 'constitution' ? e.constitution : '';
    return !!(d && id && id === d.id);
  }

  // Ouvre l'outil, pré-rempli du dossier quand l'outil le permet (dans le geste de l'utilisateur : clic sur le bouton).
  // `apres` : appelée une fois l'outil ouvert (pour le monter dans le panneau des artefacts, client/99) — aussi après une confirmation.
  function ouvrirOutilClaireAgent(outil, d, confirme, apres) {
    const o = OUTILS_CLAIRE_AGENT[outil];
    if (!o) return;
    const fin = () => { if (typeof apres === 'function') apres(); };
    const etat = { quotites: qtDossierLie || '', appelFonds: afDossierLie || '',
      urbanisme: prEtat && prEtat.dossierId ? prEtat.dossierId : '', constitution: cstEtat && cstEtat.dossierId ? cstEtat.dossierId : '' };
    if (!confirme && travailEnCoursOutilAgent(outil, d, etat)) {
      demanderConfirmation(`Remplacer le travail en cours dans l’outil ${o.libelle} ? Il porte sur un autre dossier et sera perdu.`, () => ouvrirOutilClaireAgent(outil, d, true, apres));
      return;
    }
    // Déjà sur ce dossier : on montre l'outil sans le remettre à zéro.
    if (dossierDejaDansOutilAgent(outil, d, etat)) { definirOnglet(o.onglet); fin(); return; }
    if (outil === 'appel_fonds' && d) { preparerAppelFondsDepuisDossier(d.id); fin(); return; }
    if (outil === 'controle_urbanisme' && d) { ouvrirPreemptionDepuisFiche(d.id); fin(); return; }
    if (outil === 'constitution' && d) { ouvrirConstitutionDepuisFiche(d.id); fin(); return; }
    definirOnglet(o.onglet);
    if (d && outil === 'quotites') choisirDossierQuotites(d.id);
    fin();
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

  // ---- Constitution de dossier : ajouter des organismes ou des banques par leur nom (étude 24/10 : « si je lui donne le nom des banques,
  // elle peut constituer ? »). Rien n'est généré, enregistré ni envoyé : les courriers s'ajoutent à la constitution ouverte, que
  // l'utilisateur relit dans le panneau de droite et valide lui-même. Les noms d'organismes ne sont pas des données de client. ----

  // Pure : les noms d'organismes d'un texte (séparés par « ; », des retours à la ligne ou des virgules), sans doublon, 12 au plus.
  function organismesDepuisTexteAgent(texte) {
    const vus = new Set();
    const noms = [];
    String(texte || '').split(/[;\n]|,(?!\d)/).map(n => n.replace(/^\s*(?:et|ou)\s+/i, '').trim()).filter(n => n.length >= 2).forEach(n => {
      const cle = normaliserPourRecherche(n);
      if (!vus.has(cle) && noms.length < 12) { vus.add(cle); noms.push(n); }
    });
    return noms;
  }

  // Pure : le modèle de courrier d'une succession qui convient à un organisme d'après son nom — banque par défaut.
  function modeleSuccessionPourOrganismeAgent(nom) {
    const t = normaliserPourRecherche(nom);
    if (/assuranc|\baxa\b|allianz|generali|maif|macif|matmut|groupama|predica|cardif|afi esca/.test(t)) return 'assurance-vie';
    if (/mutuelle|harmonie|mgen|malakoff|\bmma\b/.test(t)) return 'mutuelle';
    if (/\bcpam\b|assurance maladie|securite sociale/.test(t)) return 'cpam';
    if (/carsat/.test(t)) return 'carsat';
    if (/\bmsa\b/.test(t)) return 'msa';
    if (/agirc|arrco|retraite complementaire|\bcnav\b/.test(t)) return 'retraite';
    if (/ehpad|maison de retraite|residence/.test(t)) return 'ehpad';
    if (/impot|\bspfe\b|\bsip\b|tresor|dgfip/.test(t)) return 'impots';
    return 'banque';
  }

  // Pure : les contacts du répertoire dont l'organisme contient tous les mots du nom ; ceux dont l'organisme commence par le nom d'abord.
  function contactsRepertoirePourNomAgent(nom, contacts, enSuccession) {
    const mots = normaliserPourRecherche(String(nom || '')).split(/[^a-z0-9]+/).filter(m => m.length >= 2);
    if (!mots.length) return [];
    const trouves = (contacts || repertoireContacts || []).filter(c => {
      const botte = normaliserPourRecherche([c.organisme, c.service].join(' '));
      return mots.every(m => botte.includes(m));
    });
    const debut = normaliserPourRecherche(String(nom || '')).trim();
    const exacts = trouves.filter(c => normaliserPourRecherche(c.organisme || '').trim() === debut);
    const choix = exacts.length ? exacts : trouves;
    // Plusieurs services d'un même organisme : pour une succession, celui des successions s'il est seul.
    if (choix.length > 1 && enSuccession) {
      const succ = choix.filter(c => /succession|deces/.test(normaliserPourRecherche(c.service || '')));
      if (succ.length === 1) return succ;
    }
    return choix;
  }

  function ajouterOrganismesConstitutionAgent(outil, d, texte) {
    if (outil !== 'constitution') return { erreur: 'le mode « ajouter » ne concerne que la constitution' };
    if (!d) return { erreur: 'dossier_id attendu : ouvre d’abord la constitution sur ce dossier (mode ouvrir)' };
    if (!cstEtat || cstEtat.dossierId !== d.id) return { erreur: 'la constitution n’est pas ouverte sur ce dossier : ouvre-la d’abord (mode ouvrir)' };
    if (cstEtat.enCours) return { erreur: 'des courriers sont en préparation : réessaie dans un instant' };
    const noms = organismesDepuisTexteAgent(texte);
    if (!noms.length) return { erreur: 'texte = les noms des organismes ou des banques à ajouter, séparés par « ; »' };
    const ajoutes = [];
    const a_choisir = [];
    for (const nom of noms) {
      const candidats = contactsRepertoirePourNomAgent(nom, null, cstEtat.type === 'succession');
      if (candidats.length > 1) {
        a_choisir.push({ nom, candidats: candidats.slice(0, 6).map(c => ({ organisme: c.organisme || '', service: c.service || '', adresse: String(c.adresse || '').slice(0, 80) })) });
        continue;
      }
      let doc = null;
      if (cstEtat.type === 'succession') {
        doc = ajouterDocSuccessionConstitution(modeleSuccessionPourOrganismeAgent(nom), true);
      } else {
        const groupe = cstEtat.groupes[0];
        if (!groupe) { a_choisir.push({ nom, candidats: [], raison: 'aucune commune lue sur ce dossier' }); continue; }
        const avant = cstEtat.documents.length;
        cstAjouterViergeVente(groupe.cle);
        doc = cstEtat.documents.length > avant ? documentConstitution(cstEtat.selection) : null;
      }
      if (!doc) continue;
      if (candidats.length === 1) cstChoisirContact(doc.id, candidats[0].id);
      else { doc.lignes = [nom.toUpperCase()]; doc.modifie = true; doc.origine = 'Saisi à la main'; }
      ajoutes.push({ organisme: nom, courrier: doc.libelle || '', destinataire: candidats.length === 1 ? 'du répertoire' : 'absent du répertoire : adresse à compléter' });
    }
    renderConstitution();
    return { ajoutes, a_choisir, courriers_dans_la_constitution: cstEtat.documents.length,
      suite: 'rien n’est généré ni envoyé : l’utilisateur relit les courriers dans le panneau de droite, complète ce qui manque, puis les enregistre ou les envoie lui-même' };
  }

  async function outilClaireAgent(entree) {
    const e = entree || {};
    const o = OUTILS_CLAIRE_AGENT[e.outil];
    if (!o) return { erreur: 'outil inconnu' };
    const d = e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null;
    if (e.dossier_id && !d) return { erreur: 'dossier introuvable : cherche-le d’abord (chercher_dossiers)' };
    if (e.mode === 'ouvrir') {
      // Un outil qui se monte dans le panneau (étude 21/10 : « oui, je le veux ») s'y ouvre tout de suite, prérempli ; les autres (Claire Scan,
      // Nouveau dossier) gardent leur onglet de travail et le panneau montre leur carte.
      const montable = outilMontableAssistant(o.onglet);
      const idArtefact = ouvrirOutilArtefactAssistant(o.libelle, d, () => ouvrirOutilClaireAgent(e.outil, d), { onglet: o.onglet, outil: e.outil });
      if (montable) monterOutilAssistant(idArtefact);
      poserMessageAssistant('claire', `<p>${escapeHtml(o.libelle)}${d ? ` — ${escapeHtml(libelleDossierAffiche(d))}` : ''} ${montable ? 's’ouvre à droite, prérempli.' : 'est prêt à ouvrir (carte à droite).'}</p>`,
        montable ? [{ libelle: 'Voir l’outil', action: () => choisirArtefactAssistant(idArtefact) }]
          : [{ libelle: `Ouvrir ${o.libelle}`, principal: true, action: () => ouvrirOutilClaireAgent(e.outil, d) }, { libelle: 'Voir la carte', action: () => choisirArtefactAssistant(idArtefact) }]);
      return { fait: true, affiche_a_l_utilisateur: montable ? `${o.libelle} ouvert dans le panneau de droite, prérempli avec le dossier` : `bouton « Ouvrir ${o.libelle} » affiché` };
    }
    if (e.mode === 'ajouter') return ajouterOrganismesConstitutionAgent(e.outil, d, e.texte);
    try { return lectureOutilClaireAgent(e.outil, d, e.texte); } catch (err) { return { erreur: 'lecture impossible : ' + String(err && err.message || err).slice(0, 120) }; }
  }

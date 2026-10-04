  // ==== OUTIL 2 (AUDIT DES ACTES) : comparaison déterministe compromis/promesse → projet de vente ====
  //
  // §13 du cahier des charges (mode "projet d'acte de vente") : tout ce qui est un FAIT STRUCTURÉ
  // (parties, prix, désignation du bien, cadastre, notaire instrumentaire, dates) est comparé par
  // du code pur, jamais redemandé à l'IA locale — un diff de deux valeurs déjà extraites n'a rien à
  // gagner à repasser par un modèle dont la "certitude" auto-déclarée n'est de toute façon pas
  // calibrée (voir server/src/llm.js, genererJson). Seule la partie en langage libre (déclarations
  // des vendeurs, travaux, servitudes...) reste du ressort des passes IA côté serveur
  // (server/src/audit/), qui reçoivent alors ce même document de référence en plus du projet.
  //
  // La référence peut venir de deux sources, ramenées ici à LA MÊME FORME (celle que produit déjà
  // construireExtractionRegex()) : un dossier CLAIRE déjà suivi (referenceDepuisDossier — aucune
  // ré-extraction, ses champs ont déjà été vérifiés lors de la création du dossier), ou un
  // compromis/promesse fraîchement uploadé dans Outil 2 (construireExtractionRegex(texte, null,
  // null) appelée directement, sans date de compromis connue — les délais ne se calculent alors
  // pas, mais les dates explicites et les autres champs restent détectés comme d'habitude).

  function referenceDepuisDossier(d) {
    if (!d) return null;
    return {
      parties: Array.isArray(d.parties) ? d.parties : [],
      notaires: d.notaires || {},
      bien: d.bien || { adresse: null, cadastre: null },
      dates: {
        BUTOIR_PRET: champExtraction(d.pret || null),
        REITERATION_ACTE: champExtraction(d.acte || null),
        BUTOIR_VENTE_PREALABLE: champExtraction(d.ventebien || null)
      },
      champs: {
        prixVente: champExtraction(d.prixVente || null),
        // Absent (et non « null ») quand la fiche ne le porte pas : un dossier créé avant la
        // détection du mobilier ne dit rien, il ne dit pas « aucun mobilier ».
        ...(d.prixMobilier ? { prixMobilier: champExtraction(d.prixMobilier) } : {})
      }
    };
  }

  // Référence de la comparaison avant-contrat → projet. Quand le TEXTE de l'avant-contrat est
  // disponible (déposé ici, ou récupéré sur le NAS du dossier lié), c'est lui qui fait foi pour
  // les parties : celles enregistrées sur le dossier datent de sa création, et un dossier créé
  // avant le correctif des blocs de parties (21/09) peut porter l'acquéreur rangé côté vendeur —
  // c'était la cause du « Rôle changé » signalé sur l'acte MOKADEM, alors que les deux actes
  // étaient conformes. Le dossier ne sert plus qu'à compléter ce que le texte n'a pas donné (prix,
  // adresse, cadastre, déjà relus par l'étude à la création).
  function referenceAudit(texte, nomFichier, dossier) {
    const depuisDossier = referenceDepuisDossier(dossier);
    if (!texte) return depuisDossier;
    const ref = construireExtractionRegex(texte, null, null, nomFichier);
    if (!depuisDossier) return ref;
    if (!(ref.parties || []).length) ref.parties = depuisDossier.parties;
    const prixTexte = ref.champs && ref.champs.prixVente && ref.champs.prixVente.valeur;
    const prixDossier = depuisDossier.champs.prixVente.valeur;
    if (prixTexte == null && prixDossier != null) ref.champs.prixVente = depuisDossier.champs.prixVente;
    const mobilierTexte = ref.champs && ref.champs.prixMobilier && ref.champs.prixMobilier.valeur;
    if (mobilierTexte == null && depuisDossier.champs.prixMobilier) ref.champs.prixMobilier = depuisDossier.champs.prixMobilier;
    ref.bien = ref.bien || { adresse: null, cadastre: null };
    const adresseDossier = depuisDossier.bien && depuisDossier.bien.adresse;
    if (!(ref.bien.adresse && adresseLisible(ref.bien.adresse)) && adresseDossier && adresseLisible(adresseDossier)) {
      ref.bien.adresse = adresseDossier;
    }
    if (!ref.bien.cadastre && depuisDossier.bien && depuisDossier.bien.cadastre) ref.bien.cadastre = depuisDossier.bien.cadastre;
    return ref;
  }

  // Compare deux valeurs texte en ignorant accents/casse/espaces superflus — même principe que
  // normaliserPourRecherche() (recherche de dossier), appliqué ici à un nom de partie ou une adresse.
  function memeValeurTexte(a, b) {
    return normaliserPourRecherche(String(a || '').trim()) === normaliserPourRecherche(String(b || '').trim());
  }

  function partieCorrespondante(partie, liste) {
    return (liste || []).find(p => memeValeurTexte(p.nom, partie.nom));
  }

  // Constat pur (sans IA) : {categorie: 'COMPARAISON_COMPROMIS', gravite, titre, description,
  // sources: []} — même forme que les constats produits par les passes IA côté serveur (voir
  // server/src/audit/fusion.js) pour que le rapport les affiche ensemble sans traitement
  // particulier ; `sources` reste vide, ces constats ne citent pas un extrait de texte mais deux
  // valeurs déjà extraites (rien à vérifier via localiserExtrait ici).
  function comparerCompromisEtProjet(reference, projet) {
    if (!reference || !projet) return [];
    const constats = [];

    const partiesRef = reference.parties || [];
    const partiesProjet = projet.parties || [];
    for (const p of partiesRef) {
      const trouvee = partieCorrespondante(p, partiesProjet);
      if (!trouvee) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'IMPORTANT',
          titre: `Partie absente du projet : ${p.nom}`,
          description: `${p.nom} figurait dans le compromis/la promesse de référence (${p.role}) mais n’apparaît plus dans le projet de vente.`,
          sources: []
        });
      } else if (trouvee.role !== p.role) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'CRITIQUE',
          titre: `Rôle changé pour ${p.nom}`,
          description: `${p.nom} était ${p.role} dans le compromis/la promesse, ${trouvee.role} dans le projet de vente.`,
          sources: []
        });
      }
    }
    for (const p of partiesProjet) {
      if (!partieCorrespondante(p, partiesRef)) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'IMPORTANT',
          titre: `Partie nouvelle dans le projet : ${p.nom}`,
          description: `${p.nom} (${p.role}) apparaît dans le projet de vente sans figurer dans le compromis/la promesse de référence.`,
          sources: []
        });
      }
    }

    const prixRef = reference.champs && reference.champs.prixVente && reference.champs.prixVente.valeur;
    const prixProjet = projet.champs && projet.champs.prixVente && projet.champs.prixVente.valeur;
    if (prixRef != null && prixProjet != null && Number(prixRef) !== Number(prixProjet)) {
      constats.push({
        categorie: 'COMPARAISON_COMPROMIS', gravite: 'CRITIQUE',
        titre: 'Prix de vente différent',
        description: `Prix du compromis/de la promesse : ${prixRef} € — prix du projet de vente : ${prixProjet} €.`,
        sources: []
      });
    }

    // Ventilation du prix entre l'immeuble et les meubles : elle fixe l'assiette des droits de
    // mutation, l'acte de vente doit reprendre celle de l'avant-contrat. Une référence qui ne dit
    // rien du mobilier (clé absente : dossier créé avant sa détection) ne permet pas de conclure.
    const champRefMob = reference.champs && reference.champs.prixMobilier;
    if (champRefMob) {
      const mobRef = champRefMob.valeur || null;
      const mobProjet = (projet.champs && projet.champs.prixMobilier && projet.champs.prixMobilier.valeur) || null;
      if (mobRef && !mobProjet) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'IMPORTANT',
          titre: 'Mobilier non repris dans le projet',
          description: `L’avant-contrat ventile ${formaterPrix(mobRef)} de mobilier dans le prix ; le projet de vente n’en fait pas mention. Sans cette ventilation, les droits de mutation portent sur tout le prix.`,
          sources: []
        });
      } else if (!mobRef && mobProjet) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'A_VERIFIER',
          titre: 'Mobilier ajouté dans le projet',
          description: `Le projet de vente ventile ${formaterPrix(mobProjet)} de mobilier dans le prix, que l’avant-contrat ne prévoyait pas.`,
          sources: []
        });
      } else if (mobRef && mobProjet && Number(mobRef) !== Number(mobProjet)) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'IMPORTANT',
          titre: 'Mobilier différent',
          description: `Mobilier de l’avant-contrat : ${formaterPrix(mobRef)} — du projet de vente : ${formaterPrix(mobProjet)}.`,
          sources: []
        });
      }
    }

    const adresseRef = reference.bien && reference.bien.adresse;
    const adresseProjet = projet.bien && projet.bien.adresse;
    // Une adresse que l'outil n'a pas su lire (champ vide) n'est pas une adresse DIFFÉRENTE : c'est
    // ce qui produisait un CRITIQUE « Désignation du bien différente » sur un projet conforme.
    const lisibleRef = adresseRef ? adresseLisible(adresseRef) : '';
    const lisibleProjet = adresseProjet ? adresseLisible(adresseProjet) : '';
    if (lisibleRef && lisibleProjet && !memeValeurTexte(lisibleRef, lisibleProjet)) {
      constats.push({
        categorie: 'COMPARAISON_COMPROMIS', gravite: 'CRITIQUE',
        titre: 'Désignation du bien différente',
        description: `Compromis/promesse : « ${adresseLisible(adresseRef)} » — projet de vente : « ${adresseLisible(adresseProjet)} ».`,
        sources: []
      });
    }

    // Toutes les parcelles sont comparées, pas seulement la première : une parcelle ajoutée ou
    // oubliée au projet (le garage, la bande de jardin) change l'objet même de la vente.
    const cadastreRef = reference.bien && reference.bien.cadastre;
    const cadastreProjet = projet.bien && projet.bien.cadastre;
    const clesRef = clesParcelles(cadastreRef);
    const clesProjet = clesParcelles(cadastreProjet);
    if (clesRef.length && clesProjet.length && clesRef.join('|') !== clesProjet.join('|')) {
      const absentes = clesRef.filter(k => clesProjet.indexOf(k) === -1);
      const ajoutees = clesProjet.filter(k => clesRef.indexOf(k) === -1);
      const detail = [absentes.length ? `absente(s) du projet : ${absentes.join(', ')}` : '', ajoutees.length ? `ajoutée(s) au projet : ${ajoutees.join(', ')}` : ''].filter(Boolean).join(' ; ');
      constats.push({
        categorie: 'COMPARAISON_COMPROMIS', gravite: 'CRITIQUE',
        titre: 'Référence cadastrale différente',
        description: `Compromis/promesse : ${libelleCadastre(cadastreRef)} — projet de vente : ${libelleCadastre(cadastreProjet)}.${detail ? ' Parcelle(s) ' + detail + '.' : ''}`,
        sources: []
      });
    } else if (clesRef.length && clesProjet.length) {
      const surfRef = cadastreRef.contenanceLueM2 != null ? cadastreRef.contenanceLueM2 : cadastreRef.contenanceTotaleM2;
      const surfProjet = cadastreProjet.contenanceLueM2 != null ? cadastreProjet.contenanceLueM2 : cadastreProjet.contenanceTotaleM2;
      if (surfRef != null && surfProjet != null && surfRef !== surfProjet) {
        constats.push({
          categorie: 'COMPARAISON_COMPROMIS', gravite: 'IMPORTANT',
          titre: 'Contenance cadastrale différente',
          description: `Mêmes parcelles, mais contenance ${formaterContenance(surfRef)} dans le compromis/la promesse et ${formaterContenance(surfProjet)} dans le projet de vente.`,
          sources: []
        });
      }
    }

    const notaireRef = reference.notaires && reference.notaires.instrumentaire;
    const notaireProjet = projet.notaires && projet.notaires.instrumentaire;
    if (notaireRef && notaireProjet && notaireRef.nom && notaireProjet.nom && !memeValeurTexte(notaireRef.nom, notaireProjet.nom)) {
      constats.push({
        categorie: 'COMPARAISON_COMPROMIS', gravite: 'A_VERIFIER',
        titre: 'Notaire instrumentaire différent',
        description: `Compromis/promesse : ${notaireRef.nom} — projet de vente : ${notaireProjet.nom}.`,
        sources: []
      });
    }

    // Pas de comparaison des DATES : l'acte de vente n'a plus de date butoir, il RELATE les
    // conditions levées. Sa « date de prêt » est celle de l'offre (« selon offre du 8 août 2026 »),
    // qui n'a rien à voir avec la date butoir de l'avant-contrat — la comparer produisait une
    // fausse alerte sur chaque vente financée par un prêt.

    return constats;
  }

  // ==== OUTIL 2 : vocabulaire commun aux obligations du vendeur ====
  //
  // La vérification elle-même vit plus bas (verifierEngagementsTenus) : elle part du TEXTE de
  // l'avant-contrat et des justificatifs déposés, comme l'étude l'a demandé, plutôt que de l'état
  // du dossier Outil 1. Un dossier CLAIRE lié reste malgré tout une source de preuve utile —
  // l'attestation de ramonage peut déjà être rangée sur le NAS et reconnue par le parcours
  // habituel, auquel cas la redéposer ici n'aurait aucun sens.
  var LIBELLES_CAT_OBLIGATION = { entretien: 'Entretien', travaux: 'Travaux', justificatif: 'Justificatif', document: 'Document', autre: 'Autre' };

  // Les clés de DOCUMENTS_VALIDITE_OUTIL2 (ramonage, entretienChaudiere, entretienPac) sont
  // volontairement les MÊMES que celles de PIECES_ENGAGEMENTS_AUTO : aucune table de
  // correspondance à tenir à jour, et une clé sans équivalent dans la checklist ne trouve
  // simplement rien. La pièce trouvée sur le NAS prouve qu'elle EXISTE, jamais qu'elle est encore
  // valable : son fichier n'a pas été lu ici, donc sa date n'a pas été contrôlée — c'est dit tel
  // quel plutôt que de la compter comme une obligation tenue.
  function preuveDansDossierLie(cle, dossier) {
    if (!cle || !dossier || !dossier.pieces) return null;
    if (dossier.pieces[cle] !== 'recue') return null;
    const fichiers = dossier.fichiersTrouves || {};
    return { source: 'dossier', nom: fichiers[cle] || null, date: null };
  }

  // ==== OUTIL 2 : proposer le dossier Outil 1 qui correspond au projet ====
  //
  // En mode « projet d'acte de vente », les parties lues dans le projet désignent presque toujours
  // un dossier déjà suivi (le compromis a été importé dans Outil 1 des mois plus tôt). Plutôt que
  // de faire retaper un nom, on PROPOSE les dossiers dont le nom ou les parties partagent un
  // patronyme avec le projet — en tête de la liste, mais toujours un clic explicite (choix de
  // l'étude, comme pour le rapprochement NAS : auditer contre le mauvais dossier ferait comparer
  // deux ventes qui n'ont rien à voir). Jamais de liaison automatique.
  function motsDiscriminants(texte) {
    return normaliserPourRecherche(String(texte || ''))
      .split(/[^a-z0-9]+/)
      .filter(m => m.length >= 3 && !MOTS_COMMUNS_NOM_DOSSIER.has(m));
  }

  // Civilités, qualités et mots de liaison qu'un nom de dossier ou de partie peut contenir sans
  // rien dire de l'identité ("épouse", "veuve", "sci", "monsieur"…) — un dossier proposé sur le
  // seul mot « epouse » commun aux deux serait un faux rapprochement.
  var MOTS_COMMUNS_NOM_DOSSIER = new Set([
    'monsieur', 'madame', 'mademoiselle', 'mme', 'mlle', 'epouse', 'epoux', 'veuve', 'veuf', 'nee',
    'les', 'des', 'consorts', 'societe', 'sci', 'sarl', 'sas', 'eurl', 'vendeur', 'vendeurs',
    'acquereur', 'acquereurs', 'promettant', 'beneficiaire', 'dossier', 'vente', 'succession'
  ]);

  function proposerDossiersDepuisParties(parties, listeDossiers) {
    const noms = (parties || []).map(p => (p && p.nom) || '').filter(Boolean);
    if (noms.length === 0) return [];
    const motsProjet = new Set(noms.flatMap(motsDiscriminants));
    if (motsProjet.size === 0) return [];
    const scores = [];
    for (const d of listeDossiers || []) {
      if (!d || d.archive) continue;
      const motsDossier = new Set([
        ...motsDiscriminants(d.nom),
        ...((d.parties || []).flatMap(p => motsDiscriminants(p && p.nom)))
      ]);
      let score = 0;
      for (const m of motsProjet) { if (motsDossier.has(m)) score++; }
      if (score > 0) scores.push({ dossier: d, score });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.map(s => s.dossier);
  }

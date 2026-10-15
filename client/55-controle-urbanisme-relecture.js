  // ===== Contrôle de l'urbanisme dans la relecture d'actes (étude 08/10 : « intègre cela à l'outil droit de préemption, appelle
  // cela contrôle de l'urbanisme, et dans un second temps à l'outil relecture d'actes »). Quand la relecture est liée à un
  // dossier, ce que l'outil « Contrôle de l'urbanisme » a gardé sur la fiche (d.preemption : droits de préemption, monuments
  // historiques et sites protégés) est confronté au texte relu : un droit à purger dont l'acte ne parle pas, un bien en zone
  // protégée que l'acte ne signale pas, des travaux extérieurs déclarés en zone protégée sans accord de l'architecte des
  // bâtiments de France. Sans dossier lié, ou sans analyse sur la fiche, rien n'est dit (pas de bruit).

  // Ce que l'acte doit citer pour qu'un droit soit regardé comme traité (purge, renonciation, notification, réponse).
  var MENTIONS_DROITS_URBANISME = {
    dpu: /droit\s+de\s+pr[ée]emption\s+urbain|\bDPU\b|d[ée]claration\s+d.intention\s+d.ali[ée]ner|\bDIA\b/i,
    safer: /\bSAFER\b|soci[ée]t[ée]\s+d.am[ée]nagement\s+foncier/i,
    foret: /droit\s+de\s+pr[ée]f[ée]rence|pr[ée]emption[^.]{0,60}(?:bois|for[êe]t)|(?:bois|for[êe]ts?)[^.]{0,60}pr[ée]emption|L\.?\s*331-(?:19|2[0-4])/i
  };
  var RE_PATRIMOINE_DANS_ACTE = /monuments?\s+historiques?|abords\s+(?:d.un|des?)\s+monument|p[ée]rim[èe]tre\s+d[ée]limit[ée]\s+des\s+abords|sites?\s+(?:inscrits?|class[ée]s?)|site\s+patrimonial\s+remarquable|architecte\s+des\s+b[âa]timents\s+de\s+France|\bABF\b|\bAC\s*[124]\b/i;
  var RE_ACCORD_ABF = /architecte\s+des\s+b[âa]timents\s+de\s+France|\bABF\b|accord\s+de\s+l.architecte/i;

  // Pure : les constats du contrôle de l'urbanisme. mode = 'acte' (projet de vente) ou 'compromis'.
  function constatsControleUrbanisme(entree) {
    const e = entree || {};
    const p = e.preemption;
    if (!p || typeof p !== 'object' || !Array.isArray(p.droits)) return [];
    const texte = String(e.texte || '');
    const acte = e.mode === 'acte';
    const constats = [];
    const droits = droitsPreemptionFiche(p).filter(dr => dr && (dr.statut === 'oui' || dr.statut === 'probable'));
    for (const dr of droits) {
      // « foret-etat », « foret-commune », « foret-preference » : la mention des bois et forêts (audit 12/10 : jamais contrôlés).
      const re = MENTIONS_DROITS_URBANISME[dr.cle] || MENTIONS_DROITS_URBANISME[String(dr.cle || '').split('-')[0]];
      if (!re || re.test(texte)) continue;
      constats.push({
        categorie: 'CONTROLE_URBANISME',
        gravite: acte ? 'IMPORTANT' : 'A_VERIFIER',
        titre: `${dr.titre} à purger : non mentionné dans ${acte ? "l'acte" : "l'avant-contrat"}`,
        description: `Le contrôle de l'urbanisme de la fiche retient ce droit${dr.motif ? ' (' + dr.motif + ')' : ''}. ${acte ? "L'acte doit relater la purge (notification et renonciation ou délai expiré)." : "L'avant-contrat doit le prévoir (condition de non-exercice)."}${dr.formalite ? ' Formalité : ' + dr.formalite : ''}`
      });
    }
    const patrimoine = lignePatrimoinePreemption(p.patrimoine);
    if (patrimoine && patrimoine.statut === 'oui') {
      const exterieurs = (e.travaux || []).filter(t => t && (t.exterieur || t.grosOeuvre) && !RE_ACCORD_ABF.test(t.phrase || ''));
      // Un seul point, quel que soit le nombre de clauses : la même déclaration est souvent reprise de l'avant-contrat au projet.
      if (exterieurs.length) {
        const t = exterieurs[0];
        constats.push({
          categorie: 'CONTROLE_URBANISME', gravite: 'IMPORTANT',
          titre: `Travaux en zone protégée (${patrimoine.titre.toLowerCase()}) : accord de l'architecte des bâtiments de France non mentionné`,
          description: `${patrimoine.motif}. Des travaux extérieurs ou de gros œuvre y exigent l'accord de l'architecte des bâtiments de France : le réclamer avec l'autorisation d'urbanisme.${exterieurs.length > 1 ? ` ${exterieurs.length} clauses de travaux concernées.` : ''}`,
          phrase: t.phrase, page: t.page
        });
      }
      if (!RE_PATRIMOINE_DANS_ACTE.test(texte)) {
        constats.push({
          categorie: 'CONTROLE_URBANISME', gravite: 'A_VERIFIER',
          titre: `Bien en zone protégée (${patrimoine.titre.toLowerCase()}) : non signalé dans ${acte ? "l'acte" : "l'avant-contrat"}`,
          description: `${patrimoine.motif}. ${patrimoine.conseil}`
        });
      }
    }
    return constats;
  }

  // ===== Travaux déclarés dans le compromis (étude 08/10 : « reprends ton idée de détecter les travaux dans le compromis et de
  // pouvoir analyser si les autorisations ont été demandées ») — outil Contrôle de l'urbanisme et fiche. Mêmes lecteurs que la
  // relecture d'actes (detecterTravauxRealises, annexes de diagnostic écartées) ; l'autorisation est « demandée » quand le
  // compromis la cite (déclaration préalable, permis, non-opposition…) — l'outil ne consulte aucun registre des permis.
  var RE_ACHEVEMENT_TRAVAUX = /d[ée]claration\s+attestant\s+l.ach[èe]vement|\bDAACT\b|conformit[ée]|non[-\s]?contestation|certificat\s+de\s+conformit/i;

  // ===== Travaux déclarés en liste (étude 09/10, promesse réelle : « préciser dans l'analyse le type de travaux », « et si en
  // zone ABF ou non », « documents à obtenir non listés ») — « Le PROMETTANT déclare avoir réalisé les travaux suivants : > … > … ».
  // Un travail par puce, avec ce que la clause dit ensuite (autorisation obtenue, demandée ou non, pièces transmises, pièces que le
  // vendeur s'engage à fournir). Les phrases qui suivent une série de puces valent pour toute la série ; une pièce qui nomme un
  // travail (chaudière, cuisine, entreprise) ne va qu'à lui.
  var RE_INTRO_TRAVAUX_DECLARES = /(?:d[ée]clare|indique|pr[ée]cise)\s+avoir\s+(?:r[ée]alis[ée]e?s?|proc[ée]d[ée]\s+(?:aux|à\s+des)|effectu[ée]e?s?|fait\s+r[ée]aliser|fait\s+effectuer)\s+(?:les\s+|des\s+)?travaux\s+su[i]?vants\s*:?/gi;
  // Fin de la déclaration : un intitulé de rubrique (mots en capitales), un rappel du notaire, ou 3 000 caractères.
  // Mots séparés, douze au plus (audit 13/10 : l'espace dans la classe ET entre les mots, sans borne, figeait l'onglet sur une phrase
  // en capitales — 6 s pour 20 « SAINT AIGNAN »).
  var RE_FIN_TRAVAUX_DECLARES = /(?:\s|^)(?:[A-ZÀ-Þ][A-ZÀ-Þ'’]+\s+){1,12}(?:(?:DES|DE|DU|SUR|ET)\s+)?[A-ZÀ-Þ]{4,}(?:\s|$)(?=[\s\S]{0,40}[a-zà-ÿ])|Le\s+(?:PROMETTANT|VENDEUR)\s+est\s+avis[ée]|AUTORISATIONS\s+ADMINISTRATIVES|DIAGNOSTICS/;
  var RE_PUCE_TRAVAUX = /(?:^|\s)[>•➢▪►]\s+/g;
  var RE_FIN_NATURE_TRAVAIL = /\s+(?:r[ée]alis[ée]e?s?(?![\p{L}])|effectu[ée]e?s?(?![\p{L}])|par\s+(?:ses\s+soins|la\s+soci[ée]t[ée]|l['’]entreprise|les\s+[ée]tablissements|lui|elle|un\s+artisan)|en\s+(?:\p{L}+\s+)?(?:19|20)\d{2}|courant\s+(?:19|20)\d{2}|dans\s+les\s+ann[ée]es|au\s+cours\s+de)/iu;
  var RE_EXTERIEUR_DETAIL = /menuiseries?|fen[êe]tres?|porte[-\s]fen[êe]tre|volets?|baies?\s+vitr|velux|ch[âa]ssis|porte\s+d['’]entr[ée]e|porte\s+de\s+garage/i;
  var RE_ENTREPRISE_TRAVAIL = /par\s+(?:la\s+soci[ée]t[ée]|l['’]entreprise|les\s+[ée]tablissements)\s+([\p{Lu}0-9][\p{L}0-9&'’.-]*(?:\s+[\p{Lu}0-9][\p{L}0-9&'’.-]*){0,3})/u;
  var RE_SANS_AUTORISATION = /(?<![\p{L}])ne\s+(?:pas\s+)?(?:avoir\s+)?(?:obtenu|demand[ée]|d[ée]pos[ée]|sollicit[ée])|\bpas\s+(?:avoir\s+)?(?:obtenu|demand[ée]|d[ée]pos[ée])|sans\s+(?:aucune\s+)?autorisation|aucune\s+autorisation\s+(?:d['’]urbanisme\s+)?n['’]a/iu;
  var RE_AUTORISATION_DEMANDEE = /demande\s+de\s+(?:permis|d[ée]claration)|r[ée]c[ée]piss[ée]\s+de\s+d[ée]p[ôo]t|d[ée]p[ôo]t\s+(?:d['’]une|de\s+la|du)\s+(?:permis|d[ée]claration)/i;
  var RE_AFFAIRE_PERSONNELLE = /(?:faire|fera)\s+son\s+affaire\s+personnelle/i;
  var RE_PRESCRIPTION_DITE = /prescrites?\b|prescription\s+(?:est\s+)?acquise/i;
  var RE_DOC_A_OBTENIR = /s['’]engage\s+(?:[àa]\s+)?(?:faire\s+(?:ses|tous\s+ses)\s+meilleurs\s+efforts\s+(?:afin\s+)?(?:de|pour)\s+|[àa]\s+)?(?:fournir|remettre|produire|transmettre|communiquer|justifier\s+de)\s+([^.;]{4,160})/gi;
  var RE_DOC_TRANSMIS = /([^.;:]{3,160}?)\s+(?:est|sont)\s+transmise?s?\b[^.:]*?(?::\s*([^]*?))?(?=\.\s|$)/gi;
  var MOTS_VIDES_TRAVAUX = new Set(['remplacement', 'renovation', 'creation', 'travaux', 'concernant', 'definitive', 'facture', 'factures', 'societe', 'achat', 'materiaux', 'dudit', 'devis', 'piece', 'pieces', 'autorisation', 'arrete', 'permis', 'construire']);

  function nettoyerDocTravaux(t) {
    const s = String(t || '').replace(/\s+/g, ' ').trim().replace(/^(?:seule?s?\s+)?(?:(?:les?|la|un|une|des)\s+|l['’]\s*)/i, '').replace(/[\s,;:-]+$/, '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  function motsTravaux(t) {
    return (sansAccentsMinuscules(t).match(/[a-z0-9]{4,}/g) || []).filter(m => !MOTS_VIDES_TRAVAUX.has(m));
  }

  // Pure : documents cités dans les phrases qui suivent une série de travaux.
  function documentsNotesTravaux(notes) {
    const transmis = [];
    const aObtenir = [];
    const n = String(notes || '').replace(/\s+/g, ' ');
    for (const m of n.matchAll(RE_DOC_A_OBTENIR)) aObtenir.push(nettoyerDocTravaux(m[1]));
    for (const m of n.matchAll(/(?:^|\.\s+)(?:Sont|Est)\s+(?:[ée]galement\s+)?transmise?s?\b[^.:]*:\s*((?:-\s*[^-]+?)+?)(?=\.\s|$)/g)) {
      m[1].split(/(?:^|\s|,)-\s+/).map(nettoyerDocTravaux).filter(x => x.length > 2).forEach(x => transmis.push(x));
    }
    for (const m of n.matchAll(RE_DOC_TRANSMIS)) {
      if (m[2] && /(?:^|\s)-\s/.test(' ' + m[2])) m[2].split(/(?:^|\s|,)-\s+/).map(nettoyerDocTravaux).filter(x => x.length > 2).forEach(x => transmis.push(x));
      else if (!/^(?:\s*sont|\s*est)/i.test(m[1])) transmis.push(nettoyerDocTravaux(m[1].replace(/^.*?(?:\.\s+|^)(?=[^.]*$)/, '')));
    }
    return { transmis: transmis.filter(Boolean), aObtenir: aObtenir.filter(Boolean) };
  }

  // Pure : les travaux déclarés en liste, un par puce. [] si l'acte n'en déclare pas ainsi (la lecture d'avant prend le relais).
  function travauxDeclaresDuCompromis(texte, pages, aujourdHui) {
    const src = String(texte || '');
    const anneeCourante = Number(String(aujourdHui || new Date().toISOString()).slice(0, 4));
    const resultats = [];
    for (const intro of src.matchAll(RE_INTRO_TRAVAUX_DECLARES)) {
      const debutBloc = intro.index + intro[0].length;
      let bloc = src.slice(debutBloc, debutBloc + 3000);
      const puces = [...bloc.matchAll(RE_PUCE_TRAVAUX)];
      if (!puces.length) continue;
      // La rubrique suivante (« DIAGNOSTICS », « INFORMATION DES PARTIES ») arrête la lecture, jamais avant la dernière puce.
      const apres = puces[puces.length - 1].index + puces[puces.length - 1][0].length;
      const fin = bloc.slice(apres).search(RE_FIN_TRAVAUX_DECLARES);
      if (fin >= 0) bloc = bloc.slice(0, apres + fin);
      let groupe = [];
      const fermerGroupe = (notes) => {
        const docs = documentsNotesTravaux(notes);
        const autorisationNotes = RE_SANS_AUTORISATION.test(notes) ? 'absente'
          : RE_AUTORISATION_URBANISME.test(notes) ? (RE_AUTORISATION_DEMANDEE.test(notes) ? 'demandee' : 'citee') : '';
        for (const t of groupe) {
          const pour = (doc) => {
            const mots = motsTravaux(doc);
            const vise = groupe.filter(g => mots.some(m => motsTravaux(g.nature + ' ' + (g.entreprise || '')).includes(m)));
            return !vise.length || vise.includes(t);
          };
          t.documents = { transmis: docs.transmis.filter(pour), aObtenir: docs.aObtenir.filter(pour) };
          if (!t.autorisation && autorisationNotes) t.autorisation = autorisationNotes;
          t.autorisationMentionnee = t.autorisation === 'citee' || t.autorisation === 'demandee';
          t.affairePersonnelle = RE_AFFAIRE_PERSONNELLE.test(notes);
          t.prescriptionDite = RE_PRESCRIPTION_DITE.test(notes);
          t.decennaleMentionnee = t.decennaleMentionnee || RE_DECENNALE.test(notes);
          t.achevementMentionne = RE_ACHEVEMENT_TRAVAUX.test(notes);
          t.phrase = (t.phrase + ' ' + String(notes).replace(/\s+/g, ' ').trim()).trim().slice(0, 500);
        }
        resultats.push(...groupe);
        groupe = [];
      };
      puces.forEach((p, i) => {
        const debut = p.index + p[0].length;
        const segment = bloc.slice(debut, i + 1 < puces.length ? puces[i + 1].index : bloc.length);
        const fp = segment.search(/\.(?:\s|$)/);
        const phrase = (fp >= 0 ? segment.slice(0, fp + 1) : segment).replace(/\s+/g, ' ').trim();
        const notes = fp >= 0 ? segment.slice(fp + 1).trim() : '';
        const coupe = phrase.search(RE_FIN_NATURE_TRAVAIL);
        const nature = (coupe > 0 ? phrase.slice(0, coupe) : phrase).replace(/[.\s]+$/, '').slice(0, 110);
        const anneeM = phrase.match(RE_ANNEE_TRAVAUX);
        const annee = anneeM ? Number(anneeM[1]) : null;
        const ent = phrase.match(RE_ENTREPRISE_TRAVAIL);
        const grosOeuvre = RE_TRAVAUX_GROS_OEUVRE.test(phrase);
        const exterieur = RE_TRAVAUX_EXTERIEUR.test(phrase) || RE_EXTERIEUR_DETAIL.test(phrase);
        groupe.push({
          detaille: true, nature: nature.charAt(0).toUpperCase() + nature.slice(1), phrase, libelle: phrase.slice(0, 120),
          page: pageDepuisIndexPages(pages, debutBloc + debut),
          grosOeuvre, exterieur, soumisAutorisation: grosOeuvre || exterieur,
          autorisation: RE_SANS_AUTORISATION.test(phrase) ? 'absente' : RE_AUTORISATION_URBANISME.test(phrase) ? 'citee' : '',
          decennaleMentionnee: RE_DECENNALE.test(phrase), factureMentionnee: RE_FACTURE_TRAVAUX.test(phrase),
          faitParLeVendeur: RE_FAIT_PAR_SOI_MEME.test(phrase), entreprise: ent ? ent[1].replace(/\s+(?:en|dans|le|au|courant)$/i, '') : '',
          annee, sousDecennale: annee ? (anneeCourante - annee) < 10 : null
        });
        if (notes.length > 3) fermerGroupe(notes);
      });
      if (groupe.length) fermerGroupe('');
    }
    // Une même déclaration reprise deux fois dans l'acte : gardée une fois.
    const vus = new Set();
    return resultats.filter(t => { const c = sansAccentsMinuscules(t.nature) + '|' + t.annee; if (vus.has(c)) return false; vus.add(c); return true; });
  }

  // Pure : les travaux d'un compromis lu — déclarés en liste quand l'acte les énumère, sinon la lecture clause par clause.
  function travauxLusDuCompromis(lu) {
    const jour = new Date().toISOString().slice(0, 10);
    const detailles = travauxDeclaresDuCompromis(lu.texte, lu.pages || [], jour);
    return detailles.length ? detailles : detecterTravauxRealises(lu.texte, lu.pages || [], jour);
  }

  // Pure : ce qui est gardé d'un travail lu (la clause bornée : elle se relit sur la fiche).
  function travailPourFiche(t) {
    return {
      libelle: String(t.libelle || '').slice(0, 120), phrase: String(t.phrase || '').slice(0, 500), page: t.page || null,
      grosOeuvre: !!t.grosOeuvre, exterieur: !!t.exterieur, soumisAutorisation: !!t.soumisAutorisation,
      autorisationMentionnee: !!t.autorisationMentionnee, decennaleMentionnee: !!t.decennaleMentionnee,
      factureMentionnee: !!t.factureMentionnee, faitParLeVendeur: !!t.faitParLeVendeur,
      annee: t.annee || null, sousDecennale: t.sousDecennale === undefined ? null : t.sousDecennale,
      ...(t.detaille ? {
        detaille: true, nature: String(t.nature || '').slice(0, 110), entreprise: String(t.entreprise || '').slice(0, 40), autorisation: t.autorisation || '',
        affairePersonnelle: !!t.affairePersonnelle, prescriptionDite: !!t.prescriptionDite, achevementMentionne: !!t.achevementMentionne,
        documents: { transmis: ((t.documents && t.documents.transmis) || []).slice(0, 8).map(x => String(x).slice(0, 160)),
          aObtenir: ((t.documents && t.documents.aObtenir) || []).slice(0, 8).map(x => String(x).slice(0, 160)) }
      } : {})
    };
  }

  // Pure : le bilan d'un travail — autorisation, achèvement, décennale, architecte des bâtiments de France en zone protégée.
  // points : { etat: 'ok' | 'manque' | 'info', texte }. statut : 'reclamer' dès qu'un point manque, sinon 'ok'.
  // sitadel : les autorisations que Sitadel connaît sur les parcelles (null = pas cherché).
  function bilanTravailUrbanisme(t, enZoneProtegee, anneeCourante, sitadel) {
    const points = [];
    const phrase = String(t.phrase || '');
    const connues = Array.isArray(sitadel) ? sitadel.filter(a => a && a.type !== 'PD' && a.etat !== 'Annulé') : [];
    const achevee = connues.find(a => a.acheveLe);
    const docs = t.documents || { transmis: [], aObtenir: [] };
    const court = (x) => x.length > 44 ? x.slice(0, 43).trim() + '…' : x;
    if (t.detaille && !t.soumisAutorisation) {
      // Travail intérieur : pas d'autorisation d'urbanisme exigée (l'état « Intérieur » de la carte le dit).
    } else if (t.detaille && t.autorisation === 'absente') {
      points.push({ etat: 'manque', court: 'Sans autorisation', texte: 'Le vendeur déclare ne pas avoir obtenu d’autorisation d’urbanisme' });
      if (t.affairePersonnelle) points.push({ etat: 'info', court: 'Acquéreur en fait son affaire', texte: 'L’acquéreur déclare en faire son affaire personnelle' });
      points.push(t.prescriptionDite
        ? { etat: 'info', court: 'Prescription dite à l’acte', texte: 'L’acte indique que les sanctions sont prescrites' }
        : { etat: 'manque', court: 'Prescription à vérifier', texte: `Prescription à vérifier${t.annee ? ` (travaux de ${t.annee})` : ''} — art. L.421-9 du code de l’urbanisme` });
    } else if (t.detaille && t.autorisation === 'demandee') {
      const arrete = docs.transmis.concat(docs.aObtenir).some(x => /arr[êe]t[ée]|non[-\s]?opposition/i.test(x));
      points.push({ etat: 'manque', court: 'Demandée, accord non transmis', texte: `Autorisation demandée (dépôt cité) : l’arrêté ou la non-opposition n’est pas transmis${arrete ? '' : ' — le réclamer'}` });
    } else if (t.autorisationMentionnee) {
      points.push({ etat: 'ok', court: 'Autorisation citée', texte: 'Autorisation d’urbanisme citée (déclaration préalable ou permis)' });
      points.push(RE_ACHEVEMENT_TRAVAUX.test(phrase)
        ? { etat: 'ok', court: 'Achèvement cité', texte: 'Achèvement / conformité cités' }
        : achevee
          ? { etat: 'ok', court: 'Achèvement (Sitadel)', texte: `Achèvement déclaré le ${formatDateFr(achevee.acheveLe)} (${achevee.type} n° ${achevee.numero}, Sitadel) : réclamer la non-contestation de la conformité` }
             : { etat: 'manque', court: 'Achèvement à réclamer', texte: 'Déclaration attestant l’achèvement et non-contestation de la conformité non citées : les réclamer' });
    } else if (connues.length) {
      const a = connues[0];
      points.push({ etat: 'manque', court: `${a.type} ${String(a.autoriseLe || '').slice(0, 4)} dans Sitadel`.replace(/ +dans/, ' dans'), texte: `Aucune autorisation citée dans le compromis, mais Sitadel connaît ${connues.length > 1 ? connues.length + ' autorisations, dont ' : ''}${a.type} n° ${a.numero}${a.autoriseLe ? ' du ' + formatDateFr(a.autoriseLe) : ''}${a.etat ? ' (' + a.etat.toLowerCase() + ')' : ''} : la réclamer et vérifier qu’elle couvre ces travaux` });
    } else {
      const ancien = t.annee && anneeCourante && anneeCourante - t.annee >= 10;
      points.push({ etat: 'manque', court: ancien ? 'Autorisation ou prescription' : 'Autorisation à réclamer', texte: ancien
        ? `Aucune autorisation citée : réclamer la déclaration préalable ou le permis ; travaux de ${t.annee}, prescription à vérifier (art. L.421-9 du code de l’urbanisme)`
        : 'Aucune autorisation citée : réclamer la déclaration préalable ou le permis de construire' });
      if (Array.isArray(sitadel) && (!t.annee || t.annee >= 2013)) {
        points.push({ etat: 'info', court: 'Rien dans Sitadel', texte: 'Rien dans Sitadel pour ces parcelles (Sitadel ne recense, depuis 2013, que les autorisations qui créent un logement ou des locaux, les permis d’aménager et de démolir)' });
      }
    }
    if (t.sousDecennale === true) {
      if (t.decennaleMentionnee) points.push({ etat: 'ok', court: 'Décennale citée', texte: 'Assurance décennale citée' });
      else if (t.faitParLeVendeur) points.push({ etat: t.detaille && !t.soumisAutorisation ? 'info' : 'manque', court: 'Sans décennale', texte: 'Faits par le vendeur lui-même : pas de décennale, à indiquer à l’acte' });
      else points.push({ etat: 'manque', court: t.entreprise ? court(`Décennale ${t.entreprise} à réclamer`) : 'Décennale à réclamer', texte: `Moins de dix ans (${t.annee}) : attestation d’assurance décennale de ${t.entreprise ? 'l’entreprise ' + t.entreprise : 'l’entreprise'} et factures à réclamer` });
    } else if (t.sousDecennale === false) {
      points.push({ etat: 'info', court: 'Décennale expirée', texte: `Plus de dix ans (${t.annee}) : garantie décennale expirée` });
    } else {
      points.push({ etat: 'manque', court: 'Année à dater', texte: 'Année non lue : dater les travaux (factures) pour savoir si la décennale court' });
    }
    for (const x of docs.aObtenir) points.push({ etat: 'manque', court: court('À obtenir : ' + x.charAt(0).toLowerCase() + x.slice(1)), texte: `Document à obtenir : ${x} (le vendeur s’engage à le fournir)` });
    for (const x of docs.transmis) points.push({ etat: 'ok', court: court('Transmis : ' + x.charAt(0).toLowerCase() + x.slice(1)), texte: `Transmis à l’acquéreur : ${x}` });
    if (enZoneProtegee && (!t.detaille || t.soumisAutorisation)) {
      points.push(RE_ACCORD_ABF.test(phrase)
        ? { etat: 'ok', court: 'Accord ABF cité', texte: 'Accord de l’architecte des bâtiments de France cité' }
           : { etat: 'manque', court: 'Accord ABF à réclamer', texte: 'Zone protégée : accord de l’architecte des bâtiments de France à réclamer' });
    }
    return { statut: points.some(p => p.etat === 'manque') ? 'reclamer' : t.detaille && !t.soumisAutorisation ? 'interieur' : 'ok', points };
  }

  // Pure : les travaux à montrer (soumis à autorisation) avec leur bilan, et le nombre de travaux intérieurs laissés de côté.
  function analyseTravauxUrbanisme(liste, patrimoine, aujourdHui, sitadel) {
    const tous = Array.isArray(liste) ? liste.filter(Boolean) : [];
    const ligne = lignePatrimoinePreemption(patrimoine);
    const enZone = !!(ligne && ligne.statut === 'oui');
    const annee = Number(String(aujourdHui || new Date().toISOString()).slice(0, 4));
    // Travaux déclarés en liste (un par puce) : tous montrés, intérieurs compris ; sinon, ceux qui touchent l'extérieur.
    const detailles = tous.filter(t => t.detaille);
    const montres = detailles.length ? detailles : tous.filter(t => t.soumisAutorisation);
    const travaux = montres.map(t => Object.assign({}, t, bilanTravailUrbanisme(t, enZone, annee, sitadel)));
    const aObtenir = [];
    travaux.forEach(t => ((t.documents && t.documents.aObtenir) || []).forEach(doc => { if (!aObtenir.some(x => x.doc === doc)) aObtenir.push({ doc, travail: natureTravailUrbanisme(t) }); }));
    return {
      travaux,
      interieurs: detailles.length ? 0 : tous.length - montres.length,
      enZoneProtegee: enZone,
      zone: ligne,
      aObtenir
    };
  }

  // Pure : le titre d'un travail — sa nature (« Agrandissement »), plutôt qu'un bout de clause.
  function natureTravailUrbanisme(t) {
    if (t && t.nature) return t.nature;
    const mots = String((t && t.phrase) || '').match(new RegExp(RE_TRAVAUX_MOT.source, 'gi')) || [];
    const mot = mots.find(x => !/^travaux$/i.test(x));
    const m = mot ? mot.toLowerCase().replace(/\s+/g, ' ') : '';
    return m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Travaux';
  }

  var LIBELLES_TRAVAUX_URBANISME = { reclamer: 'À réclamer', ok: 'Tout est cité', interieur: 'Intérieur' };
  var CLASSES_TRAVAUX_URBANISME = { reclamer: 'dl-pret', ok: 'dl-success', interieur: 'dl-neutre' };
  var ICONES_POINTS_TRAVAUX = { ok: 'check', manque: 'alert-triangle', info: 'info' };

  // Une pastille courte ; la phrase entière se lit au survol (classe avec-bulle, même bulle que la pastille « i »).
  function puceControleTravaux(p) {
    return `<span class="pr-puce pr-puce-${p.etat} avec-bulle" tabindex="0" data-info="${escapeAttr(p.texte)}">${icone(ICONES_POINTS_TRAVAUX[p.etat])}${escapeHtml(p.court || p.texte)}</span>`;
  }

  function renderTravauxUrbanismeListe(analyse) {
    const interieurs = analyse.interieurs ? `<p class="hint">+ ${analyse.interieurs} travail${analyse.interieurs > 1 ? 'x' : ''} intérieur${analyse.interieurs > 1 ? 's' : ''} (sans autorisation)</p>` : '';
    const tete = renderZoneAbfTravaux(analyse) + renderDocumentsAObtenirTravaux(analyse);
    if (!analyse.travaux.length) return `${tete}<p class="pr-vide">${icone('check')} Aucun travail extérieur ni de gros œuvre déclaré</p>${interieurs}`;
    return `${tete}<div class="pr-travaux">${analyse.travaux.map(t => `<div class="pr-travail pr-travail-${t.statut}">
        <div class="pr-travail-tete">
          <div><div class="pr-travail-titre">${escapeHtml(natureTravailUrbanisme(t))}</div>
            <div class="pr-travail-meta">${metaTravailUrbanisme(t)}</div></div>
          <span class="dot-label ${CLASSES_TRAVAUX_URBANISME[t.statut]}"><span class="dot"></span>${LIBELLES_TRAVAUX_URBANISME[t.statut]}</span>
        </div>
        <div class="pr-puces">${t.points.map(puceControleTravaux).join('')}${t.phrase ? `<span class="pr-puce pr-puce-clause avec-bulle" tabindex="0" data-info="${escapeAttr(t.phrase)}">${icone('file-text')}Clause</span>` : ''}</div>
      </div>`).join('')}</div>${interieurs}`;
  }

  // Pure : « 1997 · extérieur · par le vendeur · p. 23 ».
  function metaTravailUrbanisme(t) {
    const ou = t.grosOeuvre ? 'gros œuvre' : t.exterieur ? 'extérieur' : 'intérieur';
    const qui = t.faitParLeVendeur ? 'par le vendeur' : t.entreprise ? 'par ' + t.entreprise : '';
    return escapeHtml([t.annee, ou, qui, t.page ? 'p. ' + t.page : ''].filter(Boolean).join(' · '));
  }

  // Zone ABF (abords de monument historique, site protégé) : oui, non publiée, ou à vérifier — dite en tête des travaux.
  function renderZoneAbfTravaux(analyse) {
    const z = analyse.zone;
    const etat = !z ? { cls: 'dl-neutre', txt: 'Non lue' } : z.statut === 'oui' ? { cls: 'dl-pret', txt: 'Oui' } : z.statut === 'non' ? { cls: 'dl-success', txt: 'Non' } : { cls: 'dl-neutre', txt: 'À vérifier' };
    const detail = !z ? 'Lancez l’analyse de la parcelle pour la savoir' : z.statut === 'oui' ? z.motif : z.statut === 'non' ? 'Aucun monument historique ni site protégé publié' : z.motif;
    return `<div class="pr-zone-abf"><span class="pr-fiche-titre">Zone ABF${infoBulle(AIDE_PATRIMOINE)}</span><span class="dot-label ${etat.cls}"><span class="dot"></span>${etat.txt}</span><span class="hint">${escapeHtml(detail)}</span></div>`;
  }

  function renderDocumentsAObtenirTravaux(analyse) {
    if (!analyse.aObtenir || !analyse.aObtenir.length) return '';
    return `<div class="pr-a-obtenir"><div class="section-eyebrow pr-eyebrow">Documents à obtenir</div>
      <ul>${analyse.aObtenir.map(x => `<li>${icone('file-text')}<span>${escapeHtml(x.doc)}</span><span class="hint">${escapeHtml(x.travail)}</span></li>`).join('')}</ul></div>`;
  }

  // L'outil : section « Travaux et autorisations ».
  function renderTravauxPreemption() {
    const zone = document.getElementById('pr-travaux');
    if (!zone || !prEtat) return;
    const tr = prEtat.travaux || {};
    const d = prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    const boutons = `<div class="pr-zonage-actions">
        ${d && d.dossierLie && d.nasDossier ? `<wa-button appearance="outlined" size="s" onclick="lireTravauxCompromisPreemption()"${tr.lecture ? ' loading' : ''}>${icone('file-text')} Lire le compromis</wa-button>` : ''}
        <span class="pr-depot-compromis"><wa-button appearance="outlined" size="s" onclick="document.getElementById('pr-travaux-fichier').click()">${icone('upload')} Déposer un PDF</wa-button>
          <input type="file" id="pr-travaux-fichier" accept="application/pdf,.pdf" style="display:none" onchange="deposerCompromisTravauxPreemption(this)"></span>
      </div>`;
    const etat = tr.lecture ? '<p class="hint">Lecture du compromis…</p>'
      : tr.erreur ? `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(tr.erreur)}</p>` : '';
    const liste = tr.liste
      ? `<div class="section-eyebrow pr-eyebrow">Travaux du compromis${infoBulle(`Lus dans « ${tr.source || 'le compromis'} ». Une autorisation compte comme demandée quand le compromis la cite ; survolez une pastille pour le détail.`)}</div>
        ${renderTravauxUrbanismeListe(analyseTravauxUrbanisme(tr.liste, patrimoinePreemption(prEtat) || (d && d.preemption && d.preemption.patrimoine), null, sitadelPreemption()))}`
      : '';
    zone.innerHTML = boutons + etat + liste + renderSitadelPreemption() + renderPhotosPreemption();
    lancerHistoriqueParcellePreemption();
  }

  function appliquerTexteTravauxPreemption(lu, source) {
    prEtat.travaux = { lecture: false, erreur: '', source, liste: travauxLusDuCompromis(lu).map(travailPourFiche) };
  }

  async function lireTravauxCompromisPreemption() {
    const d = prEtat && prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    if (!d || (prEtat.travaux && prEtat.travaux.lecture)) return;
    prEtat.travaux = Object.assign({}, prEtat.travaux, { lecture: true, erreur: '' });
    renderTravauxPreemption();
    const lu = await recupererTextCompromisDossier(d);
    if (!prEtat || prEtat.dossierId !== d.id) return;
    if (lu) { appliquerTexteTravauxPreemption(lu, lu.nom); noterVerificationPoste('travaux-compromis-nas', { detail: `${prEtat.travaux.liste.length} travail(x) lu(s)` }); }
    else prEtat.travaux = Object.assign({}, prEtat.travaux, { lecture: false, erreur: 'Compromis introuvable sur le NAS ou illisible : déposez le PDF.' });
    renderPreemption();
  }

  async function deposerCompromisTravauxPreemption(input) {
    const f = input && input.files && input.files[0];
    if (!f || !prEtat) return;
    input.value = '';
    if (!window.pdfjsLib) { prEtat.travaux = { erreur: 'Lecteur PDF indisponible (connexion à internet ?).' }; renderTravauxPreemption(); return; }
    prEtat.travaux = Object.assign({}, prEtat.travaux, { lecture: true, erreur: '' });
    renderTravauxPreemption();
    try {
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await f.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
      const lu = await lireTextePdfParPage(pdf);
      if (String(lu.texte || '').trim().length < 20) throw new Error('texte vide');
      appliquerTexteTravauxPreemption(lu, f.name);
    } catch (e) {
      console.warn('Contrôle de l’urbanisme : compromis illisible', e && e.message);
      prEtat.travaux = { lecture: false, erreur: 'Ce PDF n’a pas pu être lu (scan sans texte ?).' };
    }
    renderPreemption();
  }

  // Fiche › Pièces et analyse : les travaux gardés (enregistrés depuis l'outil ou lus à l'ajout du dossier).
  function renderTravauxFicheUrbanisme(p) {
    const sit = p && p.sitadel && Array.isArray(p.sitadel.autorisations) ? p.sitadel.autorisations : null;
    const resumeSitadel = sit ? (sit.map(a => a.type + ' ' + String(a.autoriseLe || '').slice(0, 4) + ' · ' + String(a.etat || '').toLowerCase()).join(' · ') || 'Rien depuis 2013') : '';
    const ligneSitadel = sit ? `<div class="pr-fiche-ligne"><span class="dot-label ${sit.length ? 'dl-acte' : 'dl-neutre'}"><span class="dot"></span>${sit.length ? sit.length + ' trouvée' + (sit.length > 1 ? 's' : '') : 'Aucune'}</span>
        <span class="pr-fiche-titre">Sitadel${infoBulle(AIDE_SITADEL)}</span>
        <span class="hint">${escapeHtml(resumeSitadel)}</span></div>` : '';
    return renderTravauxFicheListe(p, sit) + ligneSitadel;
  }

  function renderTravauxFicheListe(p, sit) {
    const tr = p && p.travaux;
    if (!tr || !Array.isArray(tr.liste)) return '';
    const a = analyseTravauxUrbanisme(tr.liste, p.patrimoine, null, sit);
    if (!a.travaux.length) return `<div class="pr-fiche-ligne"><span class="dot-label dl-success"><span class="dot"></span>Aucun</span>
        <span class="pr-fiche-titre">Travaux déclarés</span><span class="hint">Rien d’extérieur ni de gros œuvre</span></div>`;
    return a.travaux.map(t => `<div class="pr-fiche-ligne">
        <span class="dot-label ${CLASSES_TRAVAUX_URBANISME[t.statut]}"><span class="dot"></span>${LIBELLES_TRAVAUX_URBANISME[t.statut]}</span>
        <span class="pr-fiche-titre">${escapeHtml(natureTravailUrbanisme(t))}${t.annee ? ` (${t.annee})` : ''}</span>
        <span class="pr-puces">${t.points.filter(x => x.etat !== 'ok').map(puceControleTravaux).join('') || '<span class="hint">Autorisation, achèvement et décennale cités</span>'}</span>
      </div>`).join('');
  }

  // À l'ajout d'un dossier (analyse automatique des droits) : travaux du compromis du NAS lus une fois, sans bruit.
  async function lireTravauxDossierAuto(id) {
    const d0 = dossiers.find(x => x.id === id);
    if (!d0 || !d0.preemption || d0.preemption.travaux || !d0.dossierLie || !d0.nasDossier) return;
    const lu = await recupererTextCompromisDossier(d0);
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.preemption || d.preemption.travaux) return;
    if (!lu) return;
    const liste = travauxLusDuCompromis(lu).map(travailPourFiche);
    d.preemption.travaux = { le: new Date().toISOString(), source: lu.nom, auto: true, liste };
    noterVerificationPoste('travaux-compromis-nas', { detail: `${liste.length} travail(x) lu(s)` });
    const sitadel = await lireSitadel(d.preemption.insee, prefillPreemption(d).parcelles).catch(() => null);
    if (sitadel && !sitadel.erreur) d.preemption.sitadel = { le: new Date().toISOString(), autorisations: sitadel.autorisations };
    const a = analyseTravauxUrbanisme(liste, d.preemption.patrimoine, null, d.preemption.sitadel ? d.preemption.sitadel.autorisations : null);
    if (a.travaux.length) ajouterHistorique(d, `Travaux déclarés dans le compromis : ${a.travaux.length} (${a.travaux.filter(t => t.statut === 'reclamer').length} avec une pièce à réclamer)`);
    sauvegarder(d);
  }

  // ===== Sitadel et photos aériennes de la parcelle (étude 08/10 : « oui » aux photos dans le temps, « et recoupe aussi en
  // cherchant sur Sitadel des traces de permis » ; server/src/historiqueParcelle.js). Seuls la commune, les parcelles et leur
  // emprise partent, par le serveur. =====

  async function lireSitadel(insee, parcelles) {
    if (!insee || !String(parcelles || '').trim()) return null;
    const r = await fetchAvecAuth(`/api/urbanisme/sitadel?insee=${encodeURIComponent(insee)}&parcelles=${encodeURIComponent(parcelles)}`);
    const data = await r.json().catch(() => ({}));
    return r.ok ? data : { erreur: data.erreur || 'Sitadel injoignable.' };
  }

  // Les autorisations de Sitadel connues de l'outil : lues dans cette session, sinon gardées sur la fiche. null = pas cherché.
  function sitadelPreemption() {
    if (!prEtat) return null;
    if (prEtat.sitadel && Array.isArray(prEtat.sitadel.autorisations)) return prEtat.sitadel.autorisations;
    const d = prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    return d && d.preemption && d.preemption.sitadel && Array.isArray(d.preemption.sitadel.autorisations) ? d.preemption.sitadel.autorisations : null;
  }

  // Pure : la ligne d'une autorisation de Sitadel.
  function ligneAutorisationSitadel(a) {
    const dates = [a.autoriseLe ? 'autorisé le ' + formatDateFr(a.autoriseLe) : '', a.chantierLe ? 'chantier ouvert le ' + formatDateFr(a.chantierLe) : '',
      a.acheveLe ? 'achèvement déclaré le ' + formatDateFr(a.acheveLe) : ''].filter(Boolean).join(' · ');
    const quoi = [a.nature, a.travaux && a.travaux.length ? a.travaux.join(', ') : '', a.logements ? `${a.logements} logement${a.logements > 1 ? 's' : ''} créé${a.logements > 1 ? 's' : ''}` : '',
      a.surfaceCreee ? `${a.surfaceCreee} m² créés` : '', a.surfaceDemolie ? `${a.surfaceDemolie} m² démolis` : ''].filter(Boolean).join(' · ');
    return { titre: `${LIBELLES_TYPES_SITADEL[a.type] || a.type} n° ${a.numero}`, etat: a.etat || 'État inconnu', dates, quoi, parcelles: (a.parcelles || []).join(', ') };
  }
  var LIBELLES_TYPES_SITADEL = { PC: 'Permis de construire', DP: 'Déclaration préalable', PA: 'Permis d’aménager', PD: 'Permis de démolir' };
  var AIDE_SITADEL = 'Sitadel (ministère de la Transition écologique, données publiques) recense depuis 2013 les permis de construire et déclarations préalables qui créent un logement ou des locaux, les permis d’aménager et les permis de démolir. Une déclaration préalable pour une piscine, une clôture ou un ravalement sans logement créé n’y figure pas : l’absence de résultat ne prouve rien. Seuls la commune et les numéros de parcelle sont envoyés.';

  var CLASSES_ETAT_SITADEL = { 'Achevé': 'dl-success', 'Chantier commencé': 'dl-acte', 'Autorisé': 'dl-acte', 'Annulé': 'dl-neutre' };

  function renderSitadelPreemption() {
    const s = prEtat.sitadel || {};
    const liste = sitadelPreemption();
    const tete = `<div class="section-eyebrow pr-eyebrow">Sitadel${infoBulle(AIDE_SITADEL)}</div>`;
    if (s.lecture) return tete + '<p class="hint">Recherche…</p>';
    if (s.erreur) return tete + `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(s.erreur)}</p>`;
    if (!liste) return tete + `<p class="hint">${prEtat.insee && prEtat.parcelles ? 'Pas encore cherché.' : 'Commune et parcelles d’abord.'}</p>`;
    if (!liste.length) return tete + `<p class="pr-vide">${icone('info')} Aucune autorisation depuis 2013</p>`;
    return tete + `<div class="pr-sitadel">${liste.map(a => {
      const l = ligneAutorisationSitadel(a);
      const resume = [a.travaux && a.travaux.length ? a.travaux.join(', ') : a.nature, a.surfaceCreee ? a.surfaceCreee + ' m²' : ''].filter(Boolean).join(' · ');
      return `<div class="pr-sitadel-ligne avec-bulle" tabindex="0" data-info="${escapeAttr([l.titre, l.dates, l.quoi, l.parcelles ? 'parcelles ' + l.parcelles : ''].filter(Boolean).join(' — '))}">
          <span class="pr-sitadel-type">${escapeHtml(a.type)}</span>
          <span class="pr-sitadel-date">${escapeHtml(a.autoriseLe ? formatDateFr(a.autoriseLe) : 'Date inconnue')}</span>
          <span class="pr-sitadel-quoi">${escapeHtml(resume)}</span>
          <span class="dot-label ${CLASSES_ETAT_SITADEL[a.etat] || 'dl-neutre'}"><span class="dot"></span>${escapeHtml(l.etat)}</span>
        </div>`;
    }).join('')}</div>`;
  }

  // Pure : la prise de vue à mettre à gauche par défaut — la dernière période finie avant les travaux déclarés les plus anciens,
  // sinon 2000-2005.
  function priseDeVueAvantTravaux(couches, travaux) {
    const annees = (travaux || []).map(t => t && t.annee).filter(Boolean);
    const periodes = (couches || []).filter(c => /-/.test(c.cle));
    if (annees.length) {
      const avant = periodes.filter(c => c.fin < Math.min(...annees));
      if (avant.length) return avant[avant.length - 1].cle;
    }
    return periodes.some(c => c.cle === '2000-2005') ? '2000-2005' : ((periodes[0] && periodes[0].cle) || 'actuelle');
  }

  // Pure : le contour des parcelles en coordonnées de l'image (0-100), pour le tracer par-dessus la photo.
  function contoursImage(contours, emprise) {
    const [a, b, c, d] = emprise;
    return (contours || []).map(anneau => anneau.map(([x, y]) => `${(((x - a) / (c - a)) * 100).toFixed(2)},${(((d - y) / (d - b)) * 100).toFixed(2)}`).join(' '));
  }

  // Pure : la place d'une étiquette de parcelle sur la photo, en % de l'image (même emprise que les contours).
  function etiquettesImage(etiquettes, emprise) {
    const [a, b, c, d] = emprise;
    return (etiquettes || []).map(e => ({ texte: e.texte, dossier: !!e.dossier, x: ((e.x - a) / (c - a)) * 100, y: ((d - e.y) / (d - b)) * 100 }))
      .filter(e => e.texte && e.x > 2 && e.x < 98 && e.y > 2 && e.y < 98);
  }

  function cleHistoriquePreemption() { return prEtat ? `${prEtat.insee}|${prEtat.parcelles}` : ''; }

  // Lancé au rendu : une seule fois par commune + parcelles (photos : contour et emprise ; Sitadel : autorisations).
  function lancerHistoriqueParcellePreemption() {
    if (!prEtat || !prEtat.insee || !String(prEtat.parcelles || '').trim()) return;
    const cle = cleHistoriquePreemption();
    if (prEtat.historiqueCle === cle) return;
    prEtat.historiqueCle = cle;
    prEtat.historique = { lecture: true, images: {} };
    prEtat.sitadel = { lecture: true };
    fetchAvecAuth(`/api/urbanisme/vue?insee=${encodeURIComponent(prEtat.insee)}&parcelles=${encodeURIComponent(prEtat.parcelles)}`)
      .then(async r => {
        const v = await r.json().catch(() => ({}));
        if (!prEtat || cleHistoriquePreemption() !== cle) return;
        const travaux = prEtat.travaux && prEtat.travaux.liste;
        prEtat.historique = r.ok
          ? { vue: v, images: {}, gauche: priseDeVueAvantTravaux(v.couches, travaux), droite: 'actuelle' }
          : { erreur: v.erreur || 'Parcelle introuvable au cadastre.', images: {} };
        renderTravauxPreemption();
        if (r.ok) { chargerPhotoPreemption(prEtat.historique.gauche); chargerPhotoPreemption(prEtat.historique.droite); }
      })
      .catch(() => { if (prEtat && cleHistoriquePreemption() === cle) { prEtat.historique = { erreur: 'Serveur injoignable.', images: {} }; renderTravauxPreemption(); } });
    lireSitadel(prEtat.insee, prEtat.parcelles)
      .then(s => {
        if (!prEtat || cleHistoriquePreemption() !== cle) return;
        prEtat.sitadel = s && !s.erreur ? { autorisations: s.autorisations } : { erreur: (s && s.erreur) || 'Sitadel injoignable.' };
        renderTravauxPreemption();
      })
      .catch(() => { if (prEtat && cleHistoriquePreemption() === cle) { prEtat.sitadel = { erreur: 'Serveur injoignable.' }; renderTravauxPreemption(); } });
  }

  async function chargerPhotoPreemption(couche) {
    const h = prEtat && prEtat.historique;
    if (!h || !h.vue || h.images[couche]) return;
    h.images[couche] = { etat: 'chargement' };
    const cle = cleHistoriquePreemption();
    try {
      const r = await fetchAvecAuth(`/api/urbanisme/photo?couche=${encodeURIComponent(couche)}&emprise=${encodeURIComponent(h.vue.emprise.join(','))}`);
      if (!prEtat || cleHistoriquePreemption() !== cle) return;
      h.images[couche] = r.status === 204 ? { etat: 'vide' } : r.ok ? { etat: 'ok', url: URL.createObjectURL(await r.blob()) } : { etat: 'erreur' };
    } catch (e) {
      h.images[couche] = { etat: 'erreur' };
    }
    renderTravauxPreemption();
  }

  function choisirPhotoPreemption(cote, couche) {
    const h = prEtat && prEtat.historique;
    if (!h || !h.vue) return;
    h[cote === 'gauche' ? 'gauche' : 'droite'] = couche;
    chargerPhotoPreemption(couche);
    renderTravauxPreemption();
  }

  function renderPhotosPreemption() {
    const h = prEtat.historique;
    const tete = `<div class="section-eyebrow pr-eyebrow">Photos aériennes${infoBulle('Photos de l’IGN, contour du cadastre en orange, numéros des parcelles (celles du dossier en gras) pour repérer les constructions d’une date à l’autre. Une année seule n’a souvent pas de photo (le Loir-et-Cher est photographié environ tous les trois ans) : préférer les périodes. À comparer à l’œil.')}</div>`;
    if (!h) return tete + `<p class="hint">${prEtat.insee && prEtat.parcelles ? 'Pas encore chargées.' : 'Commune et parcelles d’abord.'}</p>`;
    if (h.lecture) return tete + '<p class="hint">Contour de la parcelle…</p>';
    if (h.erreur) return tete + `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(h.erreur)}</p>`;
    const polygones = contoursImage(h.vue.contours, h.vue.emprise);
    const voisines = contoursImage(h.vue.voisines, h.vue.emprise);
    const etiquettes = etiquettesImage(h.vue.etiquettes, h.vue.emprise);
    const vue = (cote) => {
      const couche = h[cote];
      const img = h.images[couche] || {};
      const options = h.vue.couches.map(c => `<option value="${escapeAttr(c.cle)}"${c.cle === couche ? ' selected' : ''}>${escapeHtml(c.libelle)}</option>`).join('');
      const fond = img.etat === 'ok' ? `<img src="${escapeAttr(img.url)}" alt="Photo aérienne ${escapeAttr(couche)} de la parcelle">`
        : `<div class="pr-photo-vide">${img.etat === 'vide' ? 'Pas de photo cette année' : img.etat === 'erreur' ? 'Photo indisponible' : 'Chargement…'}</div>`;
      return `<figure class="pr-photo">
          <select id="pr-photo-${cote}" aria-label="Prise de vue" onchange="choisirPhotoPreemption('${cote}', this.value)">${options}</select>
          <div class="pr-photo-cadre">${fond}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${voisines.map(pts => `<polygon class="voisine" points="${pts}"></polygon>`).join('')}${polygones.map(pts => `<polygon points="${pts}"></polygon>`).join('')}</svg>
            ${etiquettes.map(e => `<span class="pr-photo-etiquette${e.dossier ? ' dossier' : ''}" style="left:${e.x.toFixed(2)}%;top:${e.y.toFixed(2)}%">${escapeHtml(e.texte)}</span>`).join('')}
          </div>
        </figure>`;
    };
    return tete + `<div class="pr-photos">${vue('gauche')}${vue('droite')}</div>`;
  }

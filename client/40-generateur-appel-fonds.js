  // ==== GÉNÉRATEUR D'APPEL DE FONDS ====
  //
  // Produit la « Convocation au rendez-vous contenant l'appel de fonds » : le courrier que
  // l'étude adresse à l'acquéreur pour lui annoncer la date de signature et le décompte des
  // sommes à virer. Porté d'un artefact fourni par l'étude, avec deux partis pris :
  //
  // 1. **Le CHROME (formulaire, boutons, champs) prend les jetons de CLAIRE** — même gabarit que
  //    le simulateur de provision. **L'APERÇU DE LA LETTRE garde, lui, l'identité PAPIER de
  //    l'étude** (bordeaux #6D2332, Lora, les vrais logos, la colonne de contact) : c'est le
  //    fac-similé d'un document réellement envoyé, et le .docx téléchargé a cet en-tête-là.
  //    Le repeindre en bleu CLAIRE ferait mentir l'aperçu sur ce qui sortira de l'imprimante.
  //    Même principe que imprimerFiche(), dont les couleurs inline ne suivent pas non plus le
  //    thème de l'application.
  // 2. **Rien n'est inventé à partir du dossier.** Le préremplissage ne pose que ce que CLAIRE
  //    sait vraiment (voir prefillAppelFonds), et dit à l'écran ce qu'il n'a pas pu remplir.
  //
  // Tout ce qui suit jusqu'à « fin du socle pur » est PUR et déclaré en `function`/`var` :
  // testable depuis tests/helpers/load-app.js (voir la limite du harnais dans CLAUDE.md).

  // --- montants -----------------------------------------------------------------------------
  // Un décompte de confrère écrit « 1 234,56 € », parfois avec une espace insécable comme
  // séparateur de milliers. parseFloat() ne sait lire ni l'un ni l'autre.
  function montantDepuisTexteFr(texte) {
    if (texte == null) return null;
    const nettoye = String(texte).replace(/[€\s ]/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(nettoye);
    return Number.isFinite(n) ? n : null;
  }

  function montantVersTexteFr(n) {
    if (n == null || !Number.isFinite(n)) return '';
    return formaterPrixCentimes(n);
  }

  // --- parseur du décompte du confrère --------------------------------------------------------
  //
  // Quand l'étude est notaire PARTICIPANT, le décompte vient du confrère sous forme de PDF et
  // n'a aucune structure exploitable : un tableau mis à plat, une ligne de texte par ligne du
  // tableau. Ces motifs ont été écrits sur de vrais décomptes — ne pas les resserrer sans
  // relire les tests correspondants (tests/appel-de-fonds.test.js), même consigne que pour les
  // regex de détection de dates.
  var AF_MONTANT_FIN_RE = /([0-9]{1,3}(?:[.\s ][0-9]{3})*,[0-9]{2})(?:\s*€)+\s*$/;
  // Un libellé coupé par la mise en page du confrère (« …frais et droits de l’acte de » / « prêt »)
  // laisse sur la ligne SUIVANTE un ou deux mots en minuscules, sans montant : c’est la fin du
  // libellé précédent, pas le début du suivant. Borné à 35 caractères et à des minuscules : un
  // vrai libellé de ligne commence par une majuscule.
  var AF_FIN_LIBELLE_RE = /^[a-zà-ÿ][a-zà-ÿ'’\s-]{0,35}$/;
  var AF_EURO_SEUL_RE = /€\s*$/;
  // « Offerts », « Néant », « pour mémoire »… : une ligne complète, mais sans chiffre.
  var AF_SANS_MONTANT_RE = /[(]?\b(offerts?|n[ée]ant|directement\s+au\s+syndic|sans\s+objet|non\s+concern[ée]|(?:pour\s+)?m[ée]moire)\b[)]?\s*$/i;
  var AF_MEMOIRE_RE = /\bm[ée]moire\b/i;
  // Prorata : « 913 € x 92 jours / 365 jours », ou sa forme compacte « 1829x203/365 ».
  var AF_FORMULE_RE = /^\s*([0-9]+(?:[.\s ][0-9]{3})*(?:,[0-9]+)?)\s*€?\s*(?:jours?)?\s*[x×*]\s*([0-9]{1,4})\s*(?:jours?)?\s*\/\s*([0-9]{1,4})\s*(?:jours?)?\s*$/i;
  // Même motif que AF_FORMULE_RE mais cherché en FIN de libellé plutôt que sur la ligne entière.
  var AF_FORMULE_FIN_RE = /([0-9]+(?:[.\s\u00a0][0-9]{3})*(?:,[0-9]+)?)\s*\u20ac?\s*(?:jours?)?\s*[x\u00d7*]\s*([0-9]{1,4})\s*(?:jours?)?\s*\/\s*([0-9]{1,4})\s*(?:jours?)?\s*$/i;
  var AF_BASCULE_DEBIT_RE = /^(frais\s+(a|à)\s+ajouter|a\s*ajouter|a\s*payer)\b/i;
  var AF_BASCULE_CREDIT_RE = /^(a\s*d[ée]duire|sommes?\s+(a|à)\s+d[ée]duire|sous\s+d[ée]duction)\b/i;
  // Lignes de sous-total du confrère : ce sont des CONTRÔLES, pas des lignes du décompte —
  // les reprendre comme lignes compterait deux fois les mêmes sommes.
  var AF_SOUS_TOTAL_RE = /^(ensemble|total(\s+des\s+d[ée]penses)?|soit\s+au\s+total|total\s+a\s+(payer|d[ée]duire)|reste\s+(a|à)\s+verser(\s+a\s+la\s+signature)?|versement\s+(a|à)\s+la\s+signature|solde(\s+(a|à)\s+(verser|payer))?|solde\s+prix\s+de\s+vente)\b/i;
  var AF_LIGNE_PRIX_RE = /^prix\s+(de\s+vente|d'acquisition)\b/i;

  function afIdLigne() { return 'af' + Math.random().toString(36).slice(2, 9); }

  function afExtraireFormule(libelle) {
    const m = /\(([^()]*)\)\s*$/.exec(libelle);
    if (m && AF_FORMULE_RE.test(m[1].trim())) {
      return { libelle: libelle.slice(0, m.index).trim(), formule: m[1].trim() };
    }
    // Sans parenthèses : « Prorata taxe foncière 913 € x 92 jours / 365 jours ». Mise en page
    // rencontrée en vérifiant le contrôle de prorata de bout en bout — la formule était bien là,
    // mais sortait `null`, donc aucun recalcul n'était tenté. Ancré en FIN de libellé et sur le
    // motif complet (montant × jours / jours) : un libellé ne finit pas par cette suite-là par
    // hasard.
    const nu = AF_FORMULE_FIN_RE.exec(libelle);
    if (nu) {
      return { libelle: libelle.slice(0, nu.index).trim(), formule: nu[0].trim() };
    }
    return { libelle, formule: null };
  }

  // « Ensemble 3 400,00 € 3 400,00 € » : deux montants sur la même ligne = un sous-total reporté.
  function afDeuxMontants(ligne) {
    const m1 = AF_MONTANT_FIN_RE.exec(ligne);
    if (!m1) return null;
    const reste = ligne.slice(0, m1.index).trim().replace(/-\s*$/, '').trim();
    const m2 = AF_MONTANT_FIN_RE.exec(reste);
    if (!m2 || m2.index + m2[0].length !== reste.length) return null;
    return { libelle: reste.slice(0, m2.index).trim(), second: montantDepuisTexteFr(m1[1]) };
  }

  // Les décomptes de confrère préfixent couramment chaque ligne d'un tiret ou d'une puce
  // (« - Frais d'achat ») : c'est une décoration de liste, pas une partie du libellé, et elle
  // partirait telle quelle dans le courrier. Les deux branches du parseur en retiraient déjà un
  // en tête de ligne, mais pas celle où le libellé et son montant sont sur DEUX lignes (le tiret
  // vit alors dans libelleEnAttente), ni les puces et tirets longs. Un seul nettoyage, appliqué
  // au libellé final, couvre tous les chemins.
  var AF_PUCE_DEBUT_RE = /^[\s\u2022\u00b7\u2043\u25aa\u25cf\u2010-\u2015*\u2212-]+/;

  // « À parfaire » (et ses variantes « sauf à parfaire », « à parfaire ou à diminuer », entre parenthèses ou non) est la
  // réserve du confrère sur une provision : elle ne passe pas dans le courrier de l'étude (étude 06/10 : « ne pas reprendre
  // les - ou les à parfaire »). Les tirets et puces restés en bout de libellé partent avec.
  var AF_A_PARFAIRE_RE = /[\s,;–—-]*[(\[]?\s*(?:sauf\s+)?[àa]\s+parfaire(?:\s+ou\s+(?:[àa]\s+)?diminuer)?\s*[)\]]?/gi;
  var AF_PUCE_FIN_RE = /[\s\u2022\u00b7\u2043\u25aa\u25cf\u2010-\u2015*\u2212-]+$/;

  function afNettoyerLibelle(s) {
    // Le deux-points final vient de la mise en page du décompte (« Prix de vente: 220 000,00 € »),
    // où il annonce la colonne des montants : il n'a plus de sens une fois la valeur dans sa
    // propre cellule.
    return String(s || '').replace(AF_A_PARFAIRE_RE, '').replace(AF_PUCE_DEBUT_RE, '')
      .replace(/\s*:\s*$/, '').replace(AF_PUCE_FIN_RE, '').replace(/\s*:\s*$/, '').trim();
  }

  // Vocabulaire de l'étude. Chaque confrère nomme les mêmes lignes à sa façon (« Prix de vente »,
  // « Frais d'achat », « Prorata TF »…) et ces libellés partent tels quels dans le courrier de
  // l'étude : ils sont donc ramenés à la formulation qu'elle emploie, demandée explicitement.
  //
  // La normalisation ne touche QUE le libellé : un montant, un signe ou une formule n'en dépendent
  // jamais. Et elle ne s'applique qu'à un libellé RECONNU — tout ce qui ne l'est pas (une ligne
  // propre à ce dossier, une taxe locale, un honoraire) garde le sien, mot pour mot : renommer ce
  // qu'on n'a pas compris serait pire que de ne rien faire.
  //
  // L'ordre compte : « Provision sur frais » et « Acompte sur frais » sont un acompte sur les
  // FRAIS, pas sur le prix, et doivent donc être testés avant « acompte » tout court ; de même
  // « frais d'acte de prêt » n'est pas « frais d'acte » et doit sortir avant lui.
  var LIBELLES_NORMALISES_DECOMPTE = [
    // À écarter d'abord : ces lignes ressemblent aux suivantes sans être elles.
    { garde: true, motif: /\bfrais\s+d?['’]?\s*acte\s+de\s+pr[êe]t\b|\bacte\s+de\s+pr[êe]t\b|\bfrais\s+de\s+pr[êe]ts?\b|\bfrais\s+de\s+(?:promesse|mainlev[ée]e|n[ée]gociation)\b/i },

    { libelle: 'Acompte sur frais versé à l’étude',
      motif: /\b(?:provision|acompte)\s+sur\s+(?:les\s+)?frais\b|\bprovision\s+(?:d[ée]jà\s+)?vers[ée]e\b/i },
    { libelle: 'Acompte sur prix versé à l’étude',
      motif: /\b(?:acompte|arrhes|s[ée]questre)\b|\bd[ée]p[ôo]t\s+de\s+garantie\b/i },
    { libelle: 'Montant des frais et droits de l’acte de vente',
      motif: /\bfrais\s+et\s+droits\b|\bfrais\s+d?['’]?\s*(?:acte|achat|acquisition)\b|\bfrais\s+de\s+notaire\b|\bfrais\s+notari[ée]s|[ée]moluments\s+et\s+droits\b/i },
    { libelle: 'Quote-part de taxes foncières',
      motif: /\b(?:prorata|quote[\s-]*part|r[ée]partition)\b[^.]{0,30}(?:\bTF\b|taxes?\s+fonci[èe]res?)|taxes?\s+fonci[èe]res?[^.]{0,30}\b(?:prorata|quote[\s-]*part)/i },
    { libelle: 'Prix d’acquisition',
      motif: /\bprix\s+(?:de\s+vente|d?['’]?\s*acquisition|de\s+cession|principal)\b|^prix\b/i }
  ];

  function normaliserLibelleDecompte(libelle) {
    const brut = String(libelle || '').trim();
    if (!brut) return brut;
    for (const r of LIBELLES_NORMALISES_DECOMPTE) {
      if (!r.motif.test(brut)) continue;
      return r.garde ? brut : r.libelle;
    }
    return brut;
  }

  function afMajusculeInitiale(s) {
    s = afNettoyerLibelle(s);
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // --- date et heure du rendez-vous, lues dans la convocation du confrère ------------------------
  //
  // C'est la SEULE source de l'horaire dans cet écran : le dossier suivi ne porte qu'une date
  // (`d.rendezVousSignature` est un champ date, sans heure), alors que la convocation du confrère
  // écrit le jour ET l'heure en toutes lettres.
  //
  // Ancrage OBLIGATOIRE sur le vocabulaire du rendez-vous. Une convocation est pleine de dates qui
  // n'en sont pas : la date du courrier, les bornes d'un prorata de taxe foncière, la date du
  // compromis. Prendre « la première date du document » donnerait le mauvais jour bien plus
  // souvent que le bon — même prudence que la fenêtre de SEQUESTRE_RE autour de la clause de dépôt.
  var AF_ANCRE_RDV_RE = /rendez[-\s]?vous|convocation|signature|r[ée]it[ée]ration|vous\s+(?:recevoir|attendre|attendons|recevons)/i;
  // La date est cherchée APRÈS l'ancre en priorité (« le rendez-vous est fixé au 14 octobre »),
  // et seulement à défaut avant (« le 14 octobre 2026 à 14 h, rendez-vous en l'étude ») : chercher
  // les deux d'un bloc ferait remonter la date du courrier, qui précède souvent l'objet.
  var AF_APRES_ANCRE_RDV = 240;
  var AF_AVANT_ANCRE_RDV = 60;

  // 14h30 / 14 h 30 / 14:30 / 14 heures 30 / 14 heures / 14h. Le motif exige h / heures /
  // deux-points, ce qui écarte déjà tout montant ; le lookbehind couvre le reste (« 3,14 h » ne
  // donne pas 14 h). Le lookahead ne porte QUE sur un chiffre : y mettre aussi le point rejetait
  // « à 10 h. », c'est-à-dire une heure en fin de phrase — l'écriture la plus courante dans une
  // convocation.
  var AF_HEURE_RDV_RE = /(?<![\d,.])([01]?\d|2[0-3])\s*(?:h(?:eures?)?|:)\s*([0-5]\d)?(?!\d)/i;

  // L'heure se lit AUTOUR de la date retenue, jamais dans toute la fenêtre : « Convocation du
  // 12 octobre 2026. Le rendez-vous est fixé au 14 octobre 2026 à 11 heures » donnerait sinon
  // « 12 octobre à 11 heures » — une date et une heure qui ne vont pas ensemble, le pire résultat
  // possible ici. L'année termine la date dans les deux écritures (14/10/2026 comme
  // 14 octobre 2026) : elle suffit à la situer dans la fenêtre.
  var AF_AVANT_DATE_HEURE = 60;  // « à 11 heures le 14 octobre 2026 »
  var AF_APRES_DATE_HEURE = 44;  // « le 14 octobre 2026 à 11 heures 30 »

  function afZoneHeureAutourDate(fenetre, iso) {
    const annee = String(iso || '').slice(0, 4);
    const pos = fenetre.indexOf(annee);
    if (pos < 0) return fenetre;
    return fenetre.slice(Math.max(0, pos - AF_AVANT_DATE_HEURE), pos + annee.length + AF_APRES_DATE_HEURE);
  }

  function afHeureDansFragment(fragment) {
    const m = AF_HEURE_RDV_RE.exec(String(fragment || ''));
    if (!m) return null;
    return pad(parseInt(m[1], 10)) + ':' + pad(m[2] ? parseInt(m[2], 10) : 0);
  }

  // Renvoie { date, heure, extrait } : date en ISO, heure en HH:MM, l'une comme l'autre nulles si
  // rien de sûr n'a été lu. L'ANNÉE doit figurer dans le texte — « le mardi 14 octobre à 10 heures »
  // ne rend rien plutôt qu'une année devinée, exactement comme « fin septembre » côté détection de
  // dates du compromis.
  function detecterRendezVousDecompte(texte) {
    // Le texte d'un PDF arrive découpé en lignes : sans cet aplatissement, « fixé au\n14 octobre
    // 2026 » ne serait jamais lu comme une seule phrase.
    const src = String(texte || '').replace(/\s+/g, ' ');
    const vide = { date: null, heure: null, extrait: '' };
    if (!src) return vide;
    const ancres = new RegExp(AF_ANCRE_RDV_RE.source, 'gi');
    let sansHeure = null;
    let m;
    while ((m = ancres.exec(src)) !== null) {
      const finAncre = m.index + m[0].length;
      const apres = src.slice(finAncre, Math.min(src.length, finAncre + AF_APRES_ANCRE_RDV));
      const avant = src.slice(Math.max(0, m.index - AF_AVANT_ANCRE_RDV), m.index);
      let fenetre = apres;
      let date = extraireDateDeFragment(apres);
      if (!date) { fenetre = avant; date = extraireDateDeFragment(avant); }
      if (!date) continue;
      const heure = afHeureDansFragment(afZoneHeureAutourDate(fenetre, date));
      // Une mention qui donne l'heure l'emporte sur une mention qui n'a que le jour : un titre
      // (« Convocation du 14 octobre 2026 ») précède souvent la phrase complète, plus précise.
      if (heure) return { date, heure, extrait: fenetre.trim() };
      if (!sansHeure) sansHeure = { date, heure: null, extrait: fenetre.trim() };
    }
    return sansHeure || vide;
  }

  // « Solde à verser » / « Reste à verser » : le solde final, même précédé d'un texte de la marge du courrier
  // (étude, 03/10 : « OFFICE EQUIPE Solde à verser 237.399,50 € » sur la convocation de l'étude — le
  // « Soit au total » des sommes à déduire, 1.385,00 €, était pris pour le montant attendu).
  var AF_SOLDE_FINAL_RE = /(?:^|\s)(?:solde\s+(?:[àa]\s+)?(?:verser|payer|r[ée]gler)|reste\s+(?:[àa]\s+)?(?:verser|payer|r[ée]gler)|versement\s+[àa]\s+la\s+signature|solde\s+prix\s+de\s+vente)(?![A-Za-zÀ-ÿ])/i;

  function parserDecompteConfrere(texte) {
    // « 199, 50 € » : pdf.js coupe parfois les centimes après la virgule (convocation de l'étude, 03/10).
    const lignes = String(texte || '').split(/\r?\n/).map(l => l.trim().replace(/(\d),\s+(\d{2})(\s*€)/g, '$1,$2$3')).filter(Boolean);
    const brut = [];
    const meta = { soldeDeclare: null, refTrouvee: null, avertissements: [] };
    const candidatsPrix = [];
    let signe = 1;
    let libelleEnAttente = null;
    let ligneHorsPrixVue = false;
    // Dernière ligne ajoutée, pour y rattacher une fin de libellé renvoyée à la ligne suivante.
    let derniere = null;

    // Un décompte répète parfois le prix (une fois en tête, une fois dans le corps) : on ne garde
    // que la DERNIÈRE occurrence rencontrée avant la première vraie ligne de frais, et on le dit.
    const viderCandidatsPrix = () => {
      if (!candidatsPrix.length) return;
      if (candidatsPrix.length > 1) {
        meta.avertissements.push(`Plusieurs lignes de prix détectées (${candidatsPrix.map(c => c.libelle).join(' / ')}) — seule « ${candidatsPrix[candidatsPrix.length - 1].libelle} » a été retenue.`);
      }
      const garde = candidatsPrix[candidatsPrix.length - 1];
      brut.push({ libelle: garde.libelle, montant: garde.montant, signe: 1, formule: null, id: afIdLigne() });
      candidatsPrix.length = 0;
    };

    for (const ligne of lignes) {
      if (AF_BASCULE_DEBIT_RE.test(ligne)) { viderCandidatsPrix(); signe = 1; libelleEnAttente = null; derniere = null; continue; }
      if (AF_BASCULE_CREDIT_RE.test(ligne)) { viderCandidatsPrix(); signe = -1; libelleEnAttente = null; derniere = null; continue; }
      if (/^(votre\s+d[ée]compte|d[ée]compte\s+(pr[ée]visionnel|acqu[ée]reur))/i.test(ligne)) continue;

      const mRef = /^r[ée]f[ée]rences?\s+dossier\s*:\s*(.+)$/i.exec(ligne);
      if (mRef) { meta.refTrouvee = mRef[1].trim(); continue; }

      const deux = afDeuxMontants(ligne);
      if (deux && (AF_SOUS_TOTAL_RE.test(deux.libelle) || AF_SOLDE_FINAL_RE.test(deux.libelle) || deux.libelle === '')) {
        viderCandidatsPrix();
        if (!meta.soldeFinal || AF_SOLDE_FINAL_RE.test(deux.libelle)) meta.soldeDeclare = deux.second;
        if (AF_SOLDE_FINAL_RE.test(deux.libelle)) meta.soldeFinal = true;
        libelleEnAttente = null;
        derniere = null;
        continue;
      }

      const mMontant = AF_MONTANT_FIN_RE.exec(ligne);
      if (!mMontant) {
        if (AF_EURO_SEUL_RE.test(ligne) || AF_SANS_MONTANT_RE.test(ligne)) {
          const estMemoire = AF_MEMOIRE_RE.test(ligne);
          const libelle = afNettoyerLibelle(ligne.replace(AF_EURO_SEUL_RE, '').replace(AF_SANS_MONTANT_RE, ''));
          viderCandidatsPrix();
          ligneHorsPrixVue = true;
          brut.push({ libelle: libelle || '(ligne)', montant: 0, signe, formule: null, id: afIdLigne(), memoire: estMemoire });
          libelleEnAttente = null;
          continue;
        }
        if (!libelleEnAttente && derniere && AF_FIN_LIBELLE_RE.test(ligne)) {
          derniere.libelle = derniere.libelle + ' ' + ligne;
          derniere = null;
          continue;
        }
        // Pas de montant : c'est un libellé dont le montant est sur la ligne suivante.
        libelleEnAttente = libelleEnAttente ? (libelleEnAttente + ' ' + ligne) : ligne;
        continue;
      }

      const montant = montantDepuisTexteFr(mMontant[1]);
      const avantMontant = afNettoyerLibelle(ligne.slice(0, mMontant.index));
      let formule = null;
      let libelle;
      if (/^[(（]/.test(avantMontant) && libelleEnAttente) {
        // Ligne de continuation : « ((913 € x 92 jours) / 365 jours)   230,13 € »
        formule = avantMontant.replace(/[()）（]/g, '').trim();
        libelle = libelleEnAttente;
      } else {
        libelle = avantMontant || libelleEnAttente || '(ligne)';
      }
      libelleEnAttente = null;

      if (!formule) {
        const ex = afExtraireFormule(libelle);
        libelle = ex.libelle;
        formule = ex.formule;
      }
      // Avant les deux tests qui suivent : un « - Ensemble » venu d'un libellé en attente ne
      // matcherait aucun des deux motifs, tous deux ancrés en début de chaîne.
      libelle = afNettoyerLibelle(libelle);

      if (AF_SOLDE_FINAL_RE.test(libelle)) { viderCandidatsPrix(); meta.soldeDeclare = montant; meta.soldeFinal = true; derniere = null; continue; }
      if (AF_SOUS_TOTAL_RE.test(libelle)) {
        viderCandidatsPrix();
        // Un total des sommes À DÉDUIRE n'est pas le solde attendu ; un solde final déjà lu reste.
        if (signe >= 0 && !meta.soldeFinal) meta.soldeDeclare = montant;
        derniere = null;
        continue;
      }
      if (AF_LIGNE_PRIX_RE.test(libelle) && !ligneHorsPrixVue) { derniere = { libelle, montant }; candidatsPrix.push(derniere); continue; }

      viderCandidatsPrix();
      ligneHorsPrixVue = true;
      derniere = { libelle, montant, signe, formule, id: afIdLigne() };
      brut.push(derniere);
    }
    viderCandidatsPrix();

    const lignesFinales = { debit: [], credit: [] };
    for (const it of brut) {
      (it.signe >= 0 ? lignesFinales.debit : lignesFinales.credit).push({
        libelle: normaliserLibelleDecompte(afMajusculeInitiale(it.libelle)), montant: it.montant,
        formule: it.formule, id: it.id, memoire: !!it.memoire
      });
    }
    return { lignes: lignesFinales, meta };
  }

  // Recalcule un prorata annoncé par le confrère. Un écart de plus de 2 centimes est signalé :
  // c'est la seule vérification que l'outil peut faire sur un décompte qu'il n'a pas produit.
  function verifierProrataLigne(ligne) {
    if (!ligne || !ligne.formule) return { statut: 'non-verifiable' };
    const m = AF_FORMULE_RE.exec(ligne.formule);
    if (!m) return { statut: 'non-verifiable' };
    const base = montantDepuisTexteFr(m[1]);
    const num = parseFloat(m[2]);
    const den = parseFloat(m[3]);
    if (base == null || !num || !den) return { statut: 'non-verifiable' };
    const attendu = Math.round((base * num / den) * 100) / 100;
    return Math.abs(attendu - ligne.montant) <= 0.02
      ? { statut: 'ok', attendu }
      : { statut: 'ecart', attendu };
  }

  // Le contrôle des frais d'acte, pendant de verifierProrataLigne ci-dessus : la SECONDE chose que
  // l'outil peut vérifier sur un décompte qu'il n'a pas produit. Il compare le montant annoncé au
  // barème du simulateur de provision (via estimerFraisActe, la formule partagée) et dit seulement
  // s'il est au-dessus, en dessous, ou dans la fourchette — il ne REMPLIT jamais la ligne :
  // ce barème n'a jamais été audité (voir l'avertissement du simulateur), et un chiffre annoncé
  // à un client engage l'étude.
  //
  // Le libellé doit désigner les frais de l'acte de VENTE. « Frais d'acte de prêt », « frais de
  // mainlevée », « frais de négociation » relèvent d'autres barèmes : les contrôler contre
  // celui-ci ferait croire à un écart sur une ligne parfaitement juste.
  //
  // « Frais d'achat » / « frais d'acquisition » : ce sont les libellés employés par les confrères
  // dans les décomptes réels (« Frais d'achat (sauf à parfaire ou à diminuer) »), pas
  // « frais d'acte » comme le modèle de l'étude — le contrôle ne se déclenchait donc jamais sur
  // un décompte importé, celui-là même qu'il sert à vérifier. Signalé par l'étude.
  var AF_FRAIS_ACTE_RE = /\b(?:frais\s+et\s+droits|frais\s+d['\u2019]?\s*(?:acte|achat|acquisition)|frais\s+de\s+notaire|frais\s+notari[ée]s|[ée]moluments\s+et\s+droits|provision\s+sur\s+frais)\b/i;
  var AF_FRAIS_HORS_VENTE_RE = /\b(pr[êe]t|mainlev[ée]e|n[ée]gociation|hypoth[èe]que|caution|copropri[ée]t[ée]|syndic|bancaires?|garantie|succession)\b/i;

  function estLigneFraisActeVente(libelle) {
    const t = String(libelle || '');
    return AF_FRAIS_ACTE_RE.test(t) && !AF_FRAIS_HORS_VENTE_RE.test(t);
  }

  // Le code postal donne un département, mais les clés du barème ne suivent pas toutes cette
  // découpe : la Corse y est regroupée sous « 20 », l'Alsace sous « 67/68 », et le 69 est scindé
  // entre Métropole de Lyon et Rhône — impossible à trancher depuis un code postal seul, donc
  // rien n'est proposé dans ce cas plutôt qu'un département pris au hasard entre les deux.
  function cleBaremeDepuisDepartement(dept) {
    if (!dept) return null;
    if (dept === '2A' || dept === '2B') return '20';
    if (dept === '67' || dept === '68') return '67/68';
    if (dept === '69') return null;
    return DEPARTEMENTS_FRAIS_ACTE[dept] ? dept : null;
  }

  var AF_TYPE_BIEN_PAR_TYPE_VENTE = { maison: 'house', copropriete: 'condo', terrain: 'land', terre: 'land' };

  // La désignation du bien est un champ LIBRE (« une maison », « un lot de copropriété », « un
  // terrain à bâtir »…) : elle sert au courrier, mais elle dit aussi de quelle nature de bien il
  // s'agit, la seule autre donnée dont le contrôle des frais a besoin. On la lit donc plutôt que de
  // faire ressaisir la même chose deux fois à dix lignes d'écart. L'ordre des tests compte :
  // « lot de copropriété dans un immeuble » est une copropriété, pas un immeuble. Une désignation
  // qui ne tranche pas ne rend rien — le contrôle se tait alors, plutôt que de comparer à un
  // barème qui n'est pas celui du bien.
  function typeBienDepuisDesignation(texte) {
    const t = normaliserPourRecherche(String(texte || ''));
    if (!t) return null;
    if (/\b(?:lot|copropriete|appartement|studio|duplex)\b/.test(t)) return 'condo';
    if (/\b(?:terrain|parcelle|terrains)\b/.test(t)) return 'land';
    if (/\b(?:maison|immeuble|pavillon|villa|longere|batiment)\b/.test(t)) return 'house';
    return null;
  }

  // Le contrôle des frais se nourrit de ce qui est déjà saisi au-dessus (adresse et désignation du
  // bien), sans jamais écraser un choix explicite : dès que quelqu'un touche l'un des deux menus,
  // son drapeau passe à true et l'auto-remplissage le laisse tranquille pour le reste de la
  // session de saisie (remis à zéro par reinitialiserAppelFonds). Sans ce garde-fou, corriger un
  // département à la main serait annulé à la frappe suivante dans l'adresse.
  let afFraisChoisiALaMain = { departement: false, type: false };

  function marquerChoixFraisAppelFonds(quoi) {
    afFraisChoisiALaMain[quoi] = true;
    renderTableAppelFonds();
  }

  // Renvoie true si l'un des deux menus a réellement changé : l'appelant ne reconstruit le tableau
  // du décompte que dans ce cas, plutôt qu'à chaque frappe dans l'adresse.
  function majFraisDepuisBienAppelFonds() {
    let change = false;
    const poser = (id, valeur) => {
      const el = afEl(id);
      if (!el || el.value === valeur) return;
      el.value = valeur;
      change = true;
    };
    if (!afFraisChoisiALaMain.departement) {
      const cp = (afValeur('af-adresse-bien').match(/\b\d{5}\b/) || [null])[0];
      const cle = cleBaremeDepuisDepartement(departementDepuisCodePostal(cp));
      // Une clé absente du menu (69, Corse/Alsace non tranchées) remet le champ à vide plutôt que
      // de laisser le département précédent contrôler une adresse qui n'est plus la sienne.
      poser('af-frais-departement', cle && DEPARTEMENTS_FRAIS_ACTE[cle] ? cle : '');
    }
    if (!afFraisChoisiALaMain.type) {
      poser('af-frais-type', typeBienDepuisDesignation(afValeur('af-designation')) || '');
    }
    return change;
  }

  // Le dossier ne dit pas si l'acquéreur est primo-accédant, et le total change selon le régime
  // (hausse départementale temporaire appliquée ou non). Plutôt que de parier, on calcule les
  // DEUX bornes : un montant qui tombe entre les deux est conforme, quel que soit le régime réel.
  function fourchetteFraisActe(prix, cleDepartement, typeBien) {
    const avantage = estimerFraisActe(prix, cleDepartement, typeBien, true);
    const plein = estimerFraisActe(prix, cleDepartement, typeBien, false);
    if (!avantage || !plein) return null;
    return {
      min: Math.min(avantage.total, plein.total),
      max: Math.max(avantage.total, plein.total)
    };
  }

  // Pure : l'estimation des frais et droits de l'acte de vente pour le décompte — assiette = prix hors mobilier, taux plein
  // (cas général ; `primo` = le montant d'un acquéreur primo-accédant), arrondie à l'euro supérieur. null si le barème ne
  // peut rien dire (prix, département ou nature du bien inconnus).
  function fraisActeEstimesAppelFonds(prix, mobilier, cleDepartement, typeBien) {
    const assiette = assietteImmobiliere(prix, mobilier);
    if (!assiette || !cleDepartement || !typeBien) return null;
    const f = fourchetteFraisActe(assiette, cleDepartement, typeBien);
    if (!f) return null;
    return { montant: Math.ceil(f.max), primo: Math.ceil(f.min) };
  }

  // Tolérance au-delà de la fourchette : 1 % du montant attendu, au moins 50 €. Le barème est
  // interpolé entre deux paliers et ne couvre pas les débours variables (copies, formalités) —
  // signaler un écart de quelques dizaines d'euros ferait du bruit sans rien apprendre.
  function verifierFraisActeLigne(montant, fourchette) {
    if (!fourchette || !Number.isFinite(montant) || montant <= 0) return { statut: 'non-verifiable' };
    const tolerance = Math.max(50, fourchette.max * 0.01);
    if (montant < fourchette.min - tolerance) {
      return { statut: 'sous', ecart: Math.round((fourchette.min - montant) * 100) / 100, min: fourchette.min, max: fourchette.max };
    }
    if (montant > fourchette.max + tolerance) {
      return { statut: 'sur', ecart: Math.round((montant - fourchette.max) * 100) / 100, min: fourchette.min, max: fourchette.max };
    }
    return { statut: 'ok', min: fourchette.min, max: fourchette.max };
  }

  // --- clients et formule d'appel ---------------------------------------------------------------
  // La formule d'appel dépend de la civilité de CHAQUE destinataire : c'est pour ça que la
  // civilité est un champ à part entière et jamais devinée depuis un prénom.
  // Personnes et situation matrimoniale d'un côté de la vente (étude 05/10 : « préciser sur la fiche la situation matrimoniale,
  // mais pas homme ou femme : plutôt Monsieur prénom nom et Madame prénom nom, ou deux hommes, ou deux femmes »). Sur la fiche :
  // chaque partie avec sa civilité (`p.civilite` 'M' / 'Mme', ou le texte d'Authentic) et « Prénom NOM » (`p.nom`) ; pour un
  // couple, la situation (`d.situationVendeur`, `d.situationAcquereur`) — vide, déduite seulement de la situation matrimoniale
  // qu'Authentic a relevée, jamais d'un prénom.
  var SITUATIONS_CLIENT = [
    { cle: 'marie', libelle: 'Couple marié' },
    { cle: 'pacse', libelle: 'Couple pacsé' },
    { cle: 'concubin', libelle: 'Concubins' }
  ];
  function estCoupleSituation(situation) { return situation === 'marie' || situation === 'pacse' || situation === 'concubin'; }
  // Pure : 'M', 'Mme' ou '' depuis « Monsieur », « M. », « Mme », « Madame »…
  function civiliteDepuisTexte(texte) {
    const n = normaliserPourRecherche(String(texte || '')).replace(/\./g, '').trim();
    if (/^(m|mr|monsieur)$/.test(n)) return 'M';
    if (/^(mme|mlle|madame|mademoiselle)$/.test(n)) return 'Mme';
    return '';
  }
  function roleDeCote(cote) { return cote === 'vendeur' ? 'VENDEUR' : 'ACQUEREUR'; }
  function partiesCoteDossier(d, cote) {
    const role = roleDeCote(cote).toLowerCase();
    return (Array.isArray(d && d.parties) ? d.parties : []).filter(p => p && String(p.role || '').toLowerCase() === role);
  }
  // Pure : la situation d'un couple que les données du dossier disent sans ambiguïté ('' sinon). Source : la situation
  // matrimoniale de chaque personne — portée par la partie, sinon par sa fiche client relevée dans Authentic
  // (`d.authentic.personnes`, étude 07/10 : « remplir automatiquement la situation matrimoniale »). Marié ou pacsé seulement
  // si le conjoint nommé par Authentic est l'autre personne du côté (un acquéreur marié qui achète avec son frère n'est pas
  // un couple marié) ; concubins quand Authentic le dit (« concubin », « union libre », « vie maritale »).
  function situationClientDeduite(d, cote) {
    const personnes = partiesCoteDossier(d, cote).filter(p => p.qualitePersonne !== 'morale');
    if (personnes.length !== 2) return '';
    const role = roleDeCote(cote);
    const fiches = ((d && d.authentic && d.authentic.personnes) || []).filter(f => f && f.role === role && f.situationMatrimoniale);
    const situationDe = (p) => p.situationMatrimoniale && p.situationMatrimoniale.situation ? p.situationMatrimoniale
      : ((fiches.find(f => memePersonneParNom(f.nom, p.nom) || (p.nomUsage && memePersonneParNom(f.nom, p.nomUsage))) || {}).situationMatrimoniale || null);
    const mots = (x) => normaliserPourRecherche(String(x || '')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(m => m.length >= 2 && !/^(m|mr|mme|mlle|monsieur|madame|nee|ne)$/.test(m));
    // Le conjoint nommé est-il l'autre personne ? (absent : on ne peut pas dire le contraire)
    const conjointEstAutre = (sm, autre) => {
      if (!sm.conjoint) return true;
      const conj = mots(sm.conjoint);
      const noms = [autre.nom, autre.nomUsage].filter(Boolean).map(mots).filter(l => l.length);
      return noms.some(l => l.every(m => conj.includes(m)) || conj.every(m => l.includes(m)));
    };
    const lus = personnes.map((p, i) => ({ sm: situationDe(p), autre: personnes[1 - i] }))
      .map(x => ({ ...x, texte: normaliserPourRecherche(String((x.sm && x.sm.situation) || '')) }));
    const couple = (re) => lus.some(x => re.test(x.texte)) && lus.every(x => !re.test(x.texte) || conjointEstAutre(x.sm, x.autre));
    if (couple(/pacs|pacte civil/)) return 'pacse';
    if (couple(/mari/)) return 'marie';
    if (lus.some(x => /concubin|union libre|vie maritale/.test(x.texte))) return 'concubin';
    return '';
  }
  // Pure : la situation retenue — celle saisie sur la fiche, sinon la déduite.
  function situationClientDossier(d, cote) {
    const saisie = d && d[cote === 'vendeur' ? 'situationVendeur' : 'situationAcquereur'];
    return SITUATIONS_CLIENT.some(x => x.cle === saisie) ? saisie : situationClientDeduite(d, cote);
  }
  function libelleSituationClient(situation) {
    const s = SITUATIONS_CLIENT.find(x => x.cle === situation);
    return s ? s.libelle : '';
  }

  // Fiche : les personnes d'un côté, « [Monsieur ▾] Prénom NOM » chacune, puis la situation du couple (dès deux personnes),
  // puis « + Personne ». Une société n'a pas de civilité.
  function renderPersonnesCoteFiche(d, cote) {
    const id = escapeOnclickArg(d.id);
    const parties = Array.isArray(d.parties) ? d.parties : [];
    const indices = parties.map((p, i) => i).filter(i => parties[i] && String(parties[i].role || '').toLowerCase() === roleDeCote(cote).toLowerCase());
    const qui = cote === 'vendeur' ? 'du vendeur' : 'de l’acquéreur';
    const lignes = indices.map(i => {
      const p = parties[i];
      const nomComplet = [p.prenom, p.nom].map(x => String(x || '').trim()).filter(Boolean).join(' ');
      const champNom = `<input type="text" id="pers-${escapeAttr(d.id)}-${i}" class="prop-champ personne-nom" value="${escapeAttr(nomComplet)}" placeholder="Prénom NOM" aria-label="Prénom et nom ${qui}" onblur="changerPersonneDossier('${id}', ${i}, 'nom', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">`;
      // Société (étude 08/10 : « prévoir la situation quand il s'agit d'une société, vendeur ou acquéreur ») : choisie dans la même
      // liste que la civilité ; ni civilité ni situation de couple.
      const morale = p.qualitePersonne === 'morale';
      const civ = morale ? 'societe' : civiliteDepuisTexte(p.civilite);
      const champSociete = morale ? champNom.replace('placeholder="Prénom NOM"', 'placeholder="Raison sociale"').replace(`aria-label="Prénom et nom ${qui}"`, `aria-label="Raison sociale ${qui}"`) : champNom;
      return `<span class="personne-ligne"><select class="prop-champ personne-civ" aria-label="Civilité ${qui}" onchange="changerPersonneDossier('${id}', ${i}, 'civilite', this.value)">`
        + `<option value=""${civ ? '' : ' selected'}>Civilité</option><option value="M"${civ === 'M' ? ' selected' : ''}>Monsieur</option><option value="Mme"${civ === 'Mme' ? ' selected' : ''}>Madame</option><option value="societe"${morale ? ' selected' : ''}>Société</option></select>${champSociete}</span>`;
    });
    let situation = '';
    if (indices.filter(i => parties[i].qualitePersonne !== 'morale').length >= 2) {
      const saisie = d[cote === 'vendeur' ? 'situationVendeur' : 'situationAcquereur'] || '';
      const valide = SITUATIONS_CLIENT.some(x => x.cle === saisie) ? saisie : '';
      const deduite = valide ? '' : situationClientDeduite(d, cote);
      situation = `<select id="sit-${cote}-${escapeAttr(d.id)}" class="prop-champ personne-situation" aria-label="Situation matrimoniale ${qui}" onchange="changerSituationClient('${id}', '${cote}', this.value)">`
        + `<option value="">${escapeHtml(deduite ? libelleSituationClient(deduite) + ' (Authentic)' : 'Situation à préciser')}</option>`
        + SITUATIONS_CLIENT.map(x => `<option value="${x.cle}"${valide === x.cle ? ' selected' : ''}>${escapeHtml(x.libelle)}</option>`).join('')
        + '</select>';
    }
    const ajout = `<button type="button" class="lien-action personne-ajout" onclick="ajouterPersonneDossier('${id}', '${cote}')">+ Personne</button>`
      + `<button type="button" class="lien-action personne-ajout" onclick="ajouterPersonneDossier('${id}', '${cote}', true)">+ Société</button>`;
    return `<span class="personnes-cote">${lignes.join('')}${lignes.length ? '' : '<span class="prop-texte vide">Aucune personne relevée</span>'}<span class="personne-pied">${situation}${ajout}</span></span>`;
  }

  function changerPersonneDossier(id, index, champ, valeur) {
    const d = dossiers.find(x => x.id === id);
    const p = d && Array.isArray(d.parties) ? d.parties[index] : null;
    if (!p) return;
    if (champ === 'civilite' && valeur === 'societe') {
      if (p.qualitePersonne === 'morale') return;
      p.qualitePersonne = 'morale';
      delete p.civilite;
      ajouterHistorique(d, `${[p.prenom, p.nom].filter(Boolean).join(' ') || 'Partie'} : société`);
    } else if (champ === 'civilite') {
      const c = valeur === 'M' || valeur === 'Mme' ? valeur : '';
      const etaitMorale = p.qualitePersonne === 'morale';
      if (!etaitMorale && civiliteDepuisTexte(p.civilite) === c) return;
      if (etaitMorale) p.qualitePersonne = 'physique';
      if (c) p.civilite = c; else delete p.civilite;
      ajouterHistorique(d, `Civilité : ${c === 'M' ? 'Monsieur' : c === 'Mme' ? 'Madame' : '—'} ${[p.prenom, p.nom].filter(Boolean).join(' ')}`);
    } else {
      const nom = String(valeur || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      const avant = [p.prenom, p.nom].map(x => String(x || '').trim()).filter(Boolean).join(' ');
      // Ligne ajoutée puis laissée vide (« + Personne » / « + Société » cliqué par erreur, étude 08/10) : retirée, rien à garder.
      // Différé : le clic sur la civilité de la même ligne ne la retire pas (le nom y reprend le focus).
      if (!nom && !avant) {
        setTimeout(() => {
          const champ = document.getElementById(`pers-${d.id}-${index}`);
          const ligne = champ && champ.closest('.personne-ligne');
          if (ligne && ligne.contains(document.activeElement)) return;
          if (d.parties[index] !== p || String(p.nom || '').trim() || String(p.prenom || '').trim()) return;
          d.parties.splice(index, 1);
          sauvegarder(d);
          render();
        }, 150);
        return;
      }
      if (nom === avant) return;
      if (!nom) { afficherToast('Le nom ne peut pas être vide.', 'OK', null); render(); return; }
      p.nom = nom;
      delete p.prenom;
      // Une forme juridique tapée (« SCI DU MOULIN », « SAS … ») fait de la partie une société, sauf civilité déjà choisie.
      if (p.qualitePersonne !== 'morale' && !civiliteDepuisTexte(p.civilite) && nomDitSociete(nom)) p.qualitePersonne = 'morale';
      ajouterHistorique(d, `${String(p.role || '').toUpperCase() === 'VENDEUR' ? 'Vendeur' : 'Acquéreur'} : ${avant || '—'} → ${nom}`);
    }
    sauvegarder(d);
    render();
    // Civilité choisie avant le nom : le nom reprend la main (et sa sortie à vide retire la ligne).
    if (champ === 'civilite' && !String(p.nom || '').trim()) {
      const champNom = document.getElementById(`pers-${d.id}-${index}`);
      if (champNom) champNom.focus();
    }
  }

  function ajouterPersonneDossier(id, cote, societe) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    if (!Array.isArray(d.parties)) d.parties = [];
    d.parties.push({ nom: '', role: roleDeCote(cote), qualitePersonne: societe ? 'morale' : 'physique', origine: 'manuel' });
    render();
    const champ = document.getElementById(`pers-${d.id}-${d.parties.length - 1}`);
    if (champ) champ.focus();
  }

  // Pure : le nom dit-il une société ? Forme juridique ou organisme écrit en tête ou en mot entier (SCI, SARL, SAS, SA, EURL,
  // SNC, SCCV, SEM, OPH, GFA, GAEC, EARL — en tête —, société, commune de…). Un nom sans forme (« 3F ») se choisit dans la liste.
  function nomDitSociete(nom) {
    // La forme en TÊTE seulement (« SCI DU MOULIN ») : « Sabine SAS-MARTIN » reste une personne.
    const n = normaliserPourRecherche(String(nom || '')).replace(/[^a-z0-9]+/g, ' ').trim();
    return /^(sci|sarl|sas|sasu|sa|eurl|snc|sccv|scpi|scp|sem|selarl|selas|oph|gfa|gaec|earl|scea|sica) /.test(n + ' ')
      || /(^| )(societe|association|fondation|commune de|ville de|mairie de|office public|departement de|region) /.test(n + ' ');
  }

  // Pure : réunit les parties d'un même côté qui désignent la même personne (même nom complet, prénom compris) — la première
  // gardée, complétée de ce que l'autre savait (civilité, nom d'usage, naissance, qualité). Rend vrai si une partie a été
  // retirée. Étude 08/10 : « j'ai deux fois l'acquéreur ».
  function dedoublonnerPartiesDossier(d) {
    if (!d || !Array.isArray(d.parties) || d.parties.length < 2) return false;
    const cle = (p) => String(p.role || '').toUpperCase() + '|' + normaliserPourRecherche([p.prenom, p.nom].map(x => String(x || '')).join(' '))
      .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
    const vus = new Map();
    const gardees = [];
    for (const p of d.parties) {
      if (!p || typeof p !== 'object' || !String(p.nom || '').trim()) { gardees.push(p); continue; }
      const k = cle(p);
      const premiere = vus.get(k);
      // Deux dates de naissance différentes : deux homonymes (père et fils), jamais réunis.
      if (!premiere || (premiere.dateNaissance && p.dateNaissance && premiere.dateNaissance !== p.dateNaissance)) { if (!premiere) vus.set(k, p); gardees.push(p); continue; }
      // Le nom de la première est gardé tel quel (un prénom recopié donnerait « Ursula Ursula DOYLE »).
      Object.keys(p).filter(c => c !== 'nom' && c !== 'prenom' && c !== 'role').forEach(c => { if (premiere[c] === undefined || premiere[c] === null || premiere[c] === '') premiere[c] = p[c]; });
    }
    if (gardees.length === d.parties.length) return false;
    d.parties = gardees;
    return true;
  }

  function changerSituationClient(id, cote, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const champ = cote === 'vendeur' ? 'situationVendeur' : 'situationAcquereur';
    const nouvelle = SITUATIONS_CLIENT.some(x => x.cle === valeur) ? valeur : '';
    if ((d[champ] || '') === nouvelle) return;
    if (nouvelle) d[champ] = nouvelle; else delete d[champ];
    ajouterHistorique(d, `${cote === 'vendeur' ? 'Vendeurs' : 'Acquéreurs'} : ${libelleSituationClient(nouvelle) || 'situation à préciser'}`);
    sauvegarder(d);
    render();
  }

  // Lignes du destinataire du courrier (étude 05/10) : couple marié Monsieur + Madame « Monsieur et Madame Paul DUPONT » ;
  // sinon chacun nommé avec sa civilité, Monsieur d'abord — « Monsieur Paul DUPONT et Madame Léa MARTIN » (pacsés, concubins),
  // « Monsieur Paul DUPONT et Monsieur Marc LEROY », « Madame … et Madame … ». Une SCI ou plus de deux personnes : une ligne
  // par client, comme avant. Pure.
  function lignesDestinatairesAppelFonds(clients, situation) {
    const liste = (Array.isArray(clients) ? clients : []).filter(c => c && String(c.nom || '').trim());
    const estPersonne = c => c.civilite !== 'SCI' && c.civilite !== 'Indivision';
    if (estCoupleSituation(situation) && liste.length === 1 && estPersonne(liste[0])) {
      return [['Monsieur et Madame', liste[0].prenom, liste[0].nom].map(x => String(x || '').trim()).filter(Boolean).join(' ')];
    }
    if (liste.length === 2 && liste.every(estPersonne)) {
      const monsieur = liste.find(c => c.civilite === 'M');
      const madame = liste.find(c => c.civilite === 'Mme' || c.civilite === 'Mlle');
      if (monsieur && madame && situation === 'marie') {
        return [['Monsieur et Madame', monsieur.prenom, monsieur.nom].map(x => String(x || '').trim()).filter(Boolean).join(' ')];
      }
      if (estCoupleSituation(situation)) {
        const ordre = monsieur && madame ? [monsieur, madame] : liste;
        return [ordre.map(ligneClientComplete).join(' et ')];
      }
    }
    return liste.map(ligneClientComplete).filter(Boolean);
  }

  // Formule d'appel : selon les civilités (« Chers Monsieur et Madame, », « Chers Messieurs, », « Chères Mesdames, ») ; un couple
  // saisi en une seule ligne (« DUPONT ») reste « Chers Monsieur et Madame, ».
  function salutationAppelFonds(clients, situation) {
    if (estCoupleSituation(situation) && (Array.isArray(clients) ? clients : []).length < 2) return 'Chers Monsieur et Madame,';
    const liste = Array.isArray(clients) ? clients : [];
    // Une personne morale n'a pas de civilité : on s'adresse à son gérant, sans présumer son genre.
    if (liste.some(c => c && c.civilite === 'SCI')) return 'Cher Monsieur/Madame le gérant,';
    const civilites = liste.map(c => (c && c.civilite) || 'M');
    if (liste.length <= 1) {
      const c = civilites[0] || 'M';
      return (c === 'Mme' || c === 'Mlle') ? 'Chère Madame,' : 'Cher Monsieur,';
    }
    const hommes = civilites.includes('M');
    const femmes = civilites.some(c => c === 'Mme' || c === 'Mlle');
    if (hommes && femmes) return 'Chers Monsieur et Madame,';
    return hommes ? 'Chers Messieurs,' : 'Chères Mesdames,';
  }

  function ligneClientComplete(c) {
    if (!c) return '';
    if (c.civilite === 'SCI') return String(c.nom || '').trim();
    const civLong = c.civilite === 'M' ? 'Monsieur' : (c.civilite === 'Mlle' ? 'Mademoiselle' : 'Madame');
    return [civLong, c.prenom, c.nom].filter(Boolean).join(' ').trim();
  }

  // --- ce que CLAIRE sait du dossier ------------------------------------------------------------
  //
  // Les acquéreurs du dossier, sous la forme attendue par le générateur. **La civilité et le
  // prénom ne sont PAS devinés** : l'extraction du compromis ne retient que le patronyme (voir
  // detecterParties), et se tromper de civilité produit un courrier qui appelle « Monsieur » une
  // cliente. `aCompleter` dit à l'écran ce qu'il reste à saisir plutôt que de le masquer.
  function clientsDepuisDossier(d) {
    if (!d) return [];
    // Rôle en capitales (« ACQUEREUR ») comme partout ailleurs : le filtre en minuscules ne trouvait jamais les parties.
    const parties = partiesCoteDossier(d, 'acquereur').filter(p => String(p.nom || '').trim());
    if (parties.length) {
      return parties.map(p => {
        if (p.qualitePersonne === 'morale') return { civilite: 'SCI', prenom: '', nom: p.nom || '', aCompleter: false };
        const civilite = civiliteDepuisTexte(p.civilite);
        const prenom = String(p.prenom || '').trim();
        return { civilite: civilite || 'M', prenom, nom: p.nom || '', aCompleter: !civilite, civiliteLue: !!civilite };
      });
    }
    // Repli pour un dossier créé à la main ou antérieur à l'extraction structurée : le nom du
    // dossier est « VENDEUR / ACQUÉREUR », les couples séparés par « & ».
    const nom = String(d.nom || '');
    const cote = nom.includes('/') ? nom.split('/').pop() : '';
    return cote.split('&').map(s => s.trim()).filter(Boolean)
      .map(n => ({ civilite: 'M', prenom: '', nom: n, aCompleter: true }));
  }

  // La désignation du bien telle qu'elle s'écrit dans le courrier. « Copropriété » ne veut pas
  // dire « appartement » (un garage, une cave ou un local se vendent aussi en lots) : on reste
  // sur le vocabulaire notarial exact.
  function designationDepuisTypeVente(typeVente) {
    if (typeVente === 'copropriete') return 'un lot de copropriété';
    if (typeVente === 'terrain') return 'un terrain à bâtir';
    if (typeVente === 'terre') return 'un terrain non bâti';
    if (typeVente === 'maison') return 'une maison';
    return '';
  }

  // Le dépôt de garantie est DÉDUIT du virement de l'acquéreur, qu'il soit séquestré à l'étude ou
  // à l'agence. **Corrigé sur retour de l'étude** : la première version excluait le dépôt détenu
  // par l'agence, sur l'idée qu'il se réglait directement entre l'agence et le vendeur. C'est faux
  // — « l'agence nous reverse la somme », donc elle arrive bien dans la comptabilité de l'étude et
  // l'acquéreur ne doit pas la virer une seconde fois. Le DÉTENTEUR reste distingué (`motif`) et
  // affiché dans le récapitulatif : c'est une somme que l'étude devra réclamer à l'agence avant la
  // signature, pas un détail sans conséquence.
  var AF_SEQUESTRE_ETUDE_RE = /\b(notaire|[ée]tude|office\s+notarial|comptabilit[ée]\s+(?:de\s+l['’])?[ée]tude|CARPA|s[ée]questre\s+notari[ée])\b/i;
  var AF_SEQUESTRE_TIERS_RE = /\b(agence|agent\s+immobilier|cabinet|n[ée]gociateur|mandataire)\b/i;

  function depotDeductible(d) {
    if (!d || !d.depotGarantie) return { deductible: false, motif: 'absent' };
    const sequestre = String(d.sequestreDepot || '').trim();
    // L'agence est testée EN PREMIER : « versé à l'agence qui en donnera quittance au notaire »
    // contient les deux mots, et c'est bien l'agence qui détient les fonds.
    if (AF_SEQUESTRE_TIERS_RE.test(sequestre)) return { deductible: true, motif: 'tiers' };
    if (AF_SEQUESTRE_ETUDE_RE.test(sequestre)) return { deductible: true, motif: 'etude' };
    // Détenteur illisible ou absent du dossier : déduit quand même (le dépôt existe et revient à
    // l'étude dans les deux cas connus), mais signalé comme à confirmer — c'est le seul point
    // vraiment incertain.
    return { deductible: true, motif: 'indetermine' };
  }

  // Le courrier ne parle de frais d'acte de prêt que si le prêt est GARANTI PAR UNE HYPOTHÈQUE :
  // un prêt cautionné (Crédit Logement…) ne donne lieu à aucun acte notarié, donc à aucun frais
  // supplémentaire à appeler. CLAIRE lit déjà ces garanties dans l'offre (voir GARANTIES_PRET).
  function pretHypothecaireDossier(d) {
    if (!d || d.sansPret) return false;
    const garanties = Array.isArray(d.garantiesPret) ? d.garantiesPret : [];
    if (!garanties.length) return null; // garanties inconnues : ni oui ni non, l'étude tranche
    return garanties.some(g => g === 'hypothequeLegale' || g === 'hypothequeConventionnelle');
  }

  // Pure : le lieu du rendez-vous dans le courrier, d'après la fiche — même règle que les emails (lieuRdvEmail) : visio, office du
  // confrère, sinon en l'étude (audit 07/10 : l'outil ne reprenait ni l'heure ni le lieu, le courrier disait « en l'étude » pour une
  // signature chez le confrère). { valeur } = option de la liste, { autre } = texte libre quand valeur vaut '__autre'.
  function lieuAppelFondsDossier(d, categoriesRdv) {
    const t = typeRendezVous(d, categoriesRdv);
    if (t === 'visio') return { valeur: 'par visioconférence', autre: '' };
    if (t === 'confrere') {
      const nom = notaireParticipantRepresenteAcquereur(d) ? d.notaireAcquereur : (confrereRepresenteVendeur(d) ? d.notaireVendeur : '');
      return { valeur: '__autre', autre: nom ? `en l’office de ${String(nom).trim()}` : 'en l’office du notaire de l’acquéreur' };
    }
    return { valeur: "en l'étude", autre: '' };
  }

  // Assemble tout ce que le dossier permet de préremplir, et surtout ce qu'il NE permet PAS :
  // `aCompleter` alimente le récapitulatif affiché à l'écran, pour que l'étude sache exactement
  // ce qui a été repris et ce qui reste à sa charge. Fonction pure, testable.
  function prefillAppelFonds(d, categoriesRdv) {
    if (!d) return null;
    const clients = clientsDepuisDossier(d);
    const situation = situationClientDossier(d, 'acquereur');
    // Couple sans aucune civilité connue : Monsieur puis Madame dans l'ordre des parties — à vérifier (ligne « à compléter »
    // plus bas) ; la civilité saisie sur la fiche, elle, est reprise telle quelle (deux hommes, deux femmes compris).
    let ordreCoupleSuppose = false;
    if (estCoupleSituation(situation) && clients.length === 2 && clients.every(c => c.civilite !== 'SCI')) {
      if (!clients.some(c => c.civiliteLue)) { clients[0].civilite = 'M'; clients[1].civilite = 'Mme'; ordreCoupleSuppose = true; }
    }
    const depot = depotDeductible(d);
    const hypo = pretHypothecaireDossier(d);
    const repris = [];
    const aCompleter = [];

    if (clients.length) {
      repris.push(clients.length > 1 ? `${clients.length} acquéreurs` : 'Acquéreur');
      if (situation) repris.push(`Situation : ${libelleSituationClient(situation)}`);
      else if (clients.filter(c => c.civilite !== 'SCI').length === 2) aCompleter.push('Situation des acquéreurs (couple marié, pacsé, concubins) — à préciser sur la fiche pour ajuster le courrier.');
      if (ordreCoupleSuppose) aCompleter.push('Monsieur et Madame posés dans l’ordre des acquéreurs du dossier — vérifiez qui est qui.');
      if (clients.some(c => c.aCompleter)) aCompleter.push('Civilité et prénom de chaque acquéreur — à préciser sur la fiche (Monsieur / Madame, Prénom NOM).');
    } else {
      aCompleter.push('Nom du ou des acquéreurs — aucun n’a pu être lu sur ce dossier.');
    }

    if (d.adresseBien) repris.push('Adresse du bien'); else aCompleter.push('Adresse du bien.');
    if (designationDepuisTypeVente(d.typeVente)) repris.push('Désignation du bien');
    const lieuRdv = lieuAppelFondsDossier(d, categoriesRdv);
    if (d.rendezVousSignature) {
      repris.push(d.rendezVousSignatureHeure ? 'Date et heure du rendez-vous de signature' : 'Date du rendez-vous de signature');
      repris.push('Lieu du rendez-vous');
      if (!d.rendezVousSignatureHeure) aCompleter.push('Heure du rendez-vous — aucune n’est notée sur le dossier.');
    } else aCompleter.push('Date du rendez-vous — aucune n’est encore fixée sur le dossier.');
    if (d.prixVente) repris.push('Prix d’acquisition'); else aCompleter.push('Prix d’acquisition.');

    // Le dépôt est déduit dans tous les cas (voir depotDeductible), mais son DÉTENTEUR change ce que
    // l'étude a à faire avant la signature : rien si elle le détient déjà, réclamer les fonds à
    // l'agence sinon — d'où une ligne dans « à compléter » plutôt qu'un simple « repris ».
    if (depot.deductible) {
      repris.push('Dépôt de garantie porté en déduction');
      if (depot.motif === 'tiers') aCompleter.push(`Dépôt de garantie détenu par un tiers (${d.sequestreDepot}) : à réclamer avant la signature, il est déjà déduit du virement demandé.`);
      else if (depot.motif === 'indetermine') aCompleter.push('Dépôt de garantie déduit, mais le dossier ne dit pas clairement qui le détient — à confirmer avant envoi.');
    }

    if (hypo === true) {
      repris.push('Prêt garanti par une hypothèque : montant du prêt déduit, frais de garantie à appeler');
      if (!(d.montantPret > 0)) aCompleter.push('Montant du prêt — l’offre de prêt n’en a pas donné.');
    } else if (hypo === null) aCompleter.push('Garanties du prêt inconnues : à cocher vous-même si un acte de prêt est à recevoir.');

    // Lus dans l'avant-contrat (voir detecterHonorairesNegociation / detecterFondsTravaux).
    const honoraires = d.honoraires && !d.honoraires.direct && d.honoraires.charge === 'ACQUEREUR' ? d.honoraires : null;
    if (honoraires) {
      if (honoraires.montantTTC) repris.push('Honoraires de négociation à la charge de l’acquéreur');
      else aCompleter.push('Honoraires de négociation à la charge de l’acquéreur : montant TTC non lu.');
    }
    const fondsTravaux = d.fondsTravaux && d.fondsTravaux.rembourse ? d.fondsTravaux : null;
    if (fondsTravaux) {
      if (fondsTravaux.montant) repris.push('Remboursement du fonds de travaux (loi ALUR)');
      else aCompleter.push('Fonds de travaux remboursé au vendeur : montant à reprendre de l’état daté.');
    }


    // Pour le CONTRÔLE des frais (jamais pour les remplir) : le département vient du code postal du
    // bien, le type de bien du type de vente. Ni l'un ni l'autre n'est deviné quand le dossier ne
    // permet pas de trancher (Corse/Alsace regroupées, 69 scindé — voir cleBaremeDepuisDepartement).
    const cpBien = (String(d.adresseBien || '').match(/\b\d{5}\b/) || [null])[0];
    const departementFrais = cleBaremeDepuisDepartement(departementDepuisCodePostal(cpBien));
    const typeBienFrais = AF_TYPE_BIEN_PAR_TYPE_VENTE[d.typeVente] || null;
    // Frais et droits de l'acte : estimés par le barème (étude 06/10 : « que le décompte se remplisse tout seul »), au taux
    // plein — un primo-accédant paie moins, dit dans « À compléter ». Seulement quand l'office établit le décompte.
    const fraisActe = modeDecompteParDefaut(d) === 'office' ? fraisActeEstimesAppelFonds(d.prixVente, d.prixMobilier, departementFrais, typeBienFrais) : null;
    if (fraisActe) {
      aCompleter.push(`Frais et droits de l’acte estimés par le barème : ${formaterPrixCentimes(fraisActe.montant)}${fraisActe.primo < fraisActe.montant ? ` (acquéreur primo-accédant : ${formaterPrixCentimes(fraisActe.primo)})` : ''} — à vérifier, débours du dossier compris.`);
    } else if (modeDecompteParDefaut(d) === 'office') {
      aCompleter.push('Montant des frais et droits de l’acte de vente — à reprendre de votre provision (le barème n’a pas pu l’estimer : prix, département ou nature du bien manquant).');
    } else {
      aCompleter.push('Montant des frais et droits de l’acte de vente — à reprendre de votre provision.');
    }

    return {
      dossierId: d.id,
      // Référence du courrier : « VTE - NOM » pour un dossier de vente (demandé par l'étude, 29/09).
      dossierNom: d.nom ? libelleDossierAffiche(d) : '',
      clients,
      situation,
      adresseBien: normaliserAdresse(d.adresseBien),
      designation: designationDepuisTypeVente(d.typeVente),
      dateRdv: d.rendezVousSignature || '',
      heureRdv: d.rendezVousSignature ? (d.rendezVousSignatureHeure || '') : '',
      lieuRdv,
      prixVente: d.prixVente || null,
      prixMobilier: d.prixMobilier || null,
      depotGarantie: depot.deductible ? d.depotGarantie : null,
      depotMotif: depot.motif,
      departementFrais,
      typeBienFrais,
      fraisActe: fraisActe ? fraisActe.montant : null,
      pretHypothecaire: hypo === true,
      montantPret: hypo === true && d.montantPret > 0 ? d.montantPret : null,
      honoraires: honoraires ? { nom: honoraires.nom || '', negociateur: honoraires.negociateur, montantTTC: honoraires.montantTTC || null } : null,
      fondsTravaux: fondsTravaux ? { montant: fondsTravaux.montant || null } : null,
      // Décompte établi par l'office, ou repris de celui d'un confrère quand l'étude est en
      // participation (demandé par l'étude le 29/09).
      modeDecompte: modeDecompteParDefaut(d),
      sansPret: !!d.sansPret,
      repris,
      aCompleter
    };
  }

  // Les lignes du décompte déduites du dossier. Une ligne à zéro reste affichée : c'est un
  // emplacement à remplir, pas une ligne vide à masquer — la retirer ferait oublier les frais.
  function lignesDecompteDepuisPrefill(p) {
    const debit = [
      { libelle: "Prix d'acquisition", montant: (p && p.prixVente) || 0, formule: null, id: afIdLigne() },
      { libelle: "Montant des frais et droits de l'acte de vente", montant: (p && p.fraisActe) || 0, formule: null, id: afIdLigne() }
    ];
    if (p && p.pretHypothecaire) {
      debit.push({ libelle: "Frais d'acte de prêt (garantie hypothécaire)", montant: 0, formule: null, id: afIdLigne() });
    }
    if (p && p.honoraires) {
      const qui = p.honoraires.nom ? ` (${p.honoraires.nom})` : '';
      debit.push({ libelle: `Honoraires de négociation TTC${qui}`, montant: p.honoraires.montantTTC || 0, formule: null, id: afIdLigne() });
    }
    if (p && p.fondsTravaux) {
      debit.push({ libelle: 'Remboursement du fonds de travaux (loi ALUR)', montant: p.fondsTravaux.montant || 0, formule: null, id: afIdLigne() });
    }
    const credit = [];
    if (p && p.depotGarantie) {
      // Le dépôt est déduit quel que soit son détenteur (voir depotDeductible), mais le libellé ne
      // doit pas affirmer qu'il a été versé à l'étude quand il est chez l'agence.
      const libelleAcompte = p.depotMotif === 'etude'
        ? "Acompte sur prix versé à l'étude"
        : 'Acompte sur prix déjà versé';
      credit.push({ libelle: libelleAcompte, montant: p.depotGarantie, formule: null, id: afIdLigne() });
    }
    // Prêt garanti par une hypothèque : les fonds de la banque transitent par l'étude et viennent en
    // déduction ; les frais de l'acte de prêt (garantie) sont appelés au débit (règle confirmée par
    // l'étude le 29/09).
    if (p && p.pretHypothecaire) {
      credit.push({ libelle: 'Montant du prêt (versé par la banque)', montant: p.montantPret || 0, formule: null, id: afIdLigne() });
    }
    credit.push({ libelle: "Acompte sur frais versé à l'étude", montant: 0, formule: null, id: afIdLigne() });
    return { debit, credit };
  }

  // Pure : l'office établit le décompte, sauf quand l'étude est en participation (le décompte vient
  // alors du confrère qui reçoit l'acte).
  function modeDecompteParDefaut(d) {
    return d && d.roleNotaire === 'participant' ? 'confrere' : 'office';
  }

  // ---- Avis de taxe foncière (demandé par l'étude le 29/09) ----------------------------------
  // « Le montant est toujours en bas à droite, en fin de page deux. » Pure : parmi les items pdf.js
  // de la page ({ str, x, y }, y croissant vers le haut), le montant le plus bas, puis le plus à
  // droite. Un montant est un nombre avec centimes, ou suivi de « € » (l'avis arrondit à l'euro).
  // Entier nu de 4 à 6 chiffres admis aussi (« 1530 » en bas de l'avis 2025 : sans lui, les « 64 »
  // de frais de gestion, plus haut, étaient retenus comme montant de l'avis).
  var RE_ITEM_MONTANT_AVIS = /^(\d{1,3}(?:[ .\u00a0\u202f]\d{3})*|\d{4,6})(,\d{2})?\s*(€)?$/;
  // Sur l'avis réel de 2026 (SDIF de Loir-et-Cher), le total en bas à droite de la page 2 est un
  // entier nu, « 921 », sans centimes ni € : un entier d'au moins 10 € et d'au plus six chiffres,
  // sans zéro de tête, est donc un candidat (jamais un numéro de téléphone ni un « 0 » de colonne).
  var RE_ENTIER_NU_AVIS = /^[1-9]\d{1,5}$/;
  function montantBasDroitePage(items) {
    const liste = (items || []).filter(it => it && typeof it.str === 'string');
    const candidats = [];
    liste.forEach((it, i) => {
      const m = RE_ITEM_MONTANT_AVIS.exec(it.str.trim());
      if (!m) return;
      const suivant = liste[i + 1];
      const euroApres = suivant && suivant.str.trim() === '€' && Math.abs(suivant.y - it.y) < 3;
      if (!m[2] && !m[3] && !euroApres && !RE_ENTIER_NU_AVIS.test(m[1].replace(/[ .\u00a0\u202f]/g, ''))) return;
      const n = montantDepuisTexteFr(m[1] + (m[2] || ''));
      if (n > 0) candidats.push({ n, x: it.x, y: it.y });
    });
    if (!candidats.length) return null;
    const yMin = Math.min(...candidats.map(c => c.y));
    const bas = candidats.filter(c => c.y - yMin < 6);
    return bas.reduce((a, b) => (b.x > a.x ? b : a)).n;
  }

  // Pure : avis portant sur plusieurs biens (étude, 30/09 — remplace la règle du 29/09 sur les
  // ordures ménagères, déjà comprises dans la cotisation de chaque bien) : les « frais de gestion de
  // la fiscalité directe locale », portés une seule fois pour tout l'avis, sont répartis par produit
  // en croix au prorata de la taxe foncière de chaque bien, puis ajoutés à celle du bien vendu.
  // Ex. 838 + 64 × 838 / 1 466 = 874,58 €.
  function montantTfBienAvecFrais(tfBien, tfTousBiens, fraisGestion) {
    const bien = Number(tfBien), total = Number(tfTousBiens), frais = Number(fraisGestion) || 0;
    if (!(bien > 0) || !(total > 0) || bien > total) return null;
    const partFrais = Math.round(frais * bien / total * 100) / 100;
    return { tf: bien, frais: partFrais, total: Math.round((bien + partFrais) * 100) / 100 };
  }

  // Pure : les biens d'un avis de taxe foncière, lus en page 2 par position (les libellés
  // « Adresse », « Cotisation », « Frais de gestion »… sont dessinés, absents du texte). Chaque
  // adresse est suivie, dans la colonne de droite « Total des cotisations », du montant du bien ;
  // en bas à droite, « Montant de votre impôt » (montantBasDroitePage). Frais de gestion = impôt −
  // somme des biens (le « 64 » de l'avis réel). `items` : [{str, x, y}], y croissant vers le haut.
  var RE_ADRESSE_BIEN_AVIS = /[A-Za-zÀ-ÿ]{2}/;
  function biensAvisTaxeFonciere(items) {
    const liste = (items || []).filter(it => it && typeof it.str === 'string' && it.str.trim());
    const montants = liste.map(it => {
      const m = RE_ITEM_MONTANT_AVIS.exec(it.str.trim());
      return m ? { n: montantDepuisTexteFr(m[1] + (m[2] || '')), x: it.x, y: it.y } : null;
    }).filter(c => c && c.n > 0);
    const impot = montantBasDroitePage(liste);
    if (!montants.length) return { biens: [], impot, fraisGestion: 0 };
    const xDroite = Math.max(...montants.map(c => c.x));
    const colonneDroite = montants.filter(c => c.x > xDroite - 40);
    // Adresse d'un bien : texte à gauche, suivi (plus bas, à moins de 60 points) d'un montant dans
    // la colonne de droite — ce qui écarte le nom du propriétaire, les notes et les en-têtes.
    const adresses = liste.filter(it => RE_ADRESSE_BIEN_AVIS.test(it.str) && it.x > 40 && it.x < xDroite - 150 && !/[:€]/.test(it.str))
      .sort((a, b) => b.y - a.y);
    const biens = [];
    adresses.forEach((a, i) => {
      const suivante = adresses[i + 1];
      const montant = colonneDroite
        .filter(c => c.y < a.y && c.y > a.y - 60 && (!suivante || c.y > suivante.y))
        .sort((c1, c2) => c2.y - c1.y)[0];
      if (montant) biens.push({ adresse: a.str.replace(/\s+/g, ' ').trim(), tf: montant.n });
    });
    const somme = biens.reduce((t, b) => t + b.tf, 0);
    const fraisGestion = biens.length > 1 && impot > somme ? Math.round((impot - somme) * 100) / 100 : 0;
    return { biens, impot, fraisGestion };
  }

  // Pure : le bien de l'avis qui correspond à l'adresse du dossier — même numéro et un mot de la voie
  // en commun (« 2 ALL DES VANNEAUX » ↔ « 2 allée des Vanneaux ») ; null si aucun ou plusieurs.
  function bienAvisPourAdresse(biens, adresseDossier) {
    const mots = (s) => normaliserPourRecherche(String(s || '')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    const cible = mots(adresseDossier);
    if (!cible.length) return null;
    const vides = new Set(['rue', 'route', 'allee', 'all', 'avenue', 'av', 'chemin', 'impasse', 'place', 'bd', 'boulevard', 'de', 'des', 'du', 'la', 'le', 'les', 'st', 'saint']);
    const trouves = (biens || []).map((b, i) => ({ b, i, m: mots(b.adresse) })).filter(({ m }) => {
      const numero = m.find(x => /^\d+$/.test(x));
      return numero && cible.includes(numero) && m.some(x => !/^\d+$/.test(x) && !vides.has(x) && x.length > 2 && cible.includes(x));
    });
    return trouves.length === 1 ? trouves[0].i : null;
  }

  // Pure : la ligne « prorata de taxe foncière » d'un décompte acquéreur — du jour de l'acte (inclus)
  // au 31 décembre, année civile de l'acte.
  function ligneProrataTaxeFonciere(montantAnnuel, dateActeIso) {
    if (!dateActeIso) return null;
    const annee = dateActeIso.slice(0, 4);
    const r = calculerProrata(montantAnnuel, `${annee}-01-01`, `${annee}-12-31`, dateActeIso);
    if (!r) return null;
    return { libelle: `Prorata de taxe foncière ${annee} (du ${dateActeIso.slice(8, 10) + '/' + dateActeIso.slice(5, 7)} au 31/12)`, montant: r.partAcquereur, detail: r };
  }

  // Page 1 de l'avis : « Montant de vos taxes foncières   921,00 € » (avis mensualisé, où « Somme à
  // prélever » est le net après acomptes — jamais celle-là). Lu sur les lignes reconstruites
  // (lignesDepuisItemsPdf) ; sert de première source, le bas de page 2 de contrôle. Pure.
  var RE_MONTANT_TF_EN_TETE = /Montant\s+de\s+vos\s+taxes\s+fonci[èe]res\s*:?\s*(\d[\d\s  .]*(?:,\d{2})?)\s*€/i;
  function montantAvisTaxeFonciereEnTete(lignes) {
    for (const l of lignes || []) {
      const m = RE_MONTANT_TF_EN_TETE.exec(String(l));
      if (!m) continue;
      const n = montantDepuisTexteFr(m[1]);
      if (n > 0) return n;
    }
    return null;
  }

  // ---- Pièces lues pour l'appel de fonds et le prorata (exemples réels reçus le 30/09) --------
  // Appel de charges d'un syndic, état daté, relevé de compte client de l'étude. Tout ce bloc est
  // pur : il reçoit le texte en LIGNES (lireTextePdfEnLignes / lignesDepuisItemsPdf) et ne touche
  // ni au DOM ni aux dossiers.

  // Les syndics écrivent « 422.13 » (point décimal, CITYA) ou « 122.97 € » (Immo'Zel), l'étude
  // « 1 380,43 » ou « 1.245,00 » : montantDepuisTexteFr lirait 42 213 dans « 422.13 ». Pure.
  var RE_MONTANT_PIECE_SRC = '(\\d{1,3}(?:[ \\u00a0\\u202f.]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  function montantSyndicDepuisTexte(texte) {
    if (texte == null) return null;
    let t = String(texte).replace(/[€\s  ]/g, '');
    if (!t) return null;
    if (/^\d+\.\d{1,2}$/.test(t)) return parseFloat(t);
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '');
    const n = parseFloat(t.replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  function isoDepuisJjMmAaaa(texte) {
    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(texte || ''));
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }
  function arrondiCentimes(n) { return Math.round(n * 100) / 100; }

  // --- appel de charges de copropriété -------------------------------------------------------
  // Structure réelle (appel trimestriel CITYA) : « Période du 01/10/2025 au 31/12/2025 », une ligne
  // par poste et par lot (le dernier nombre de la ligne est la quote-part), « Montant de l'appel
  // de fonds 422.13 € », puis un récapitulatif « MONTANT DE VOTRE APPEL » / « TOTAL A PAYER » (ce
  // dernier peut inclure un solde antérieur : il vient en dernier recours).
  var RE_PERIODE_APPEL_CHARGES = /P[ée]riode\s+(?:du\s+)?(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})/i;
  var RE_MONTANTS_APPEL_CHARGES = [
    { source: 'Montant de l’appel', re: new RegExp('Montant\\s+de\\s+l[\'’]appel(?:\\s+de\\s+fonds)?\\s*:?\\s*' + RE_MONTANT_PIECE_SRC + '\\s*€?', 'i') },
    { source: 'Montant de votre appel', re: new RegExp('MONTANT\\s+DE\\s+VOTRE\\s+APPEL\\s*:?\\s*' + RE_MONTANT_PIECE_SRC, 'i') },
    { source: 'Appel TTC', re: new RegExp('Appel\\s+TTC\\s*:?\\s*' + RE_MONTANT_PIECE_SRC, 'i') },
    { source: 'Total à payer', re: new RegExp('TOTAL\\s+(?:DE\\s+L[\'’]APPEL|[ÀA]\\s+PAYER)\\s*:?\\s*' + RE_MONTANT_PIECE_SRC, 'i') }
  ];
  // La cotisation au fonds de travaux (art. 14-2) est attachée au lot : son sort entre vendeur et
  // acquéreur est réglé par l'avant-contrat (voir detecterFondsTravaux), pas par un prorata de
  // charges — elle est donc totalisée à part, pour être retirée du montant à répartir.
  var RE_LIGNE_FONDS_TRAVAUX_APPEL = /(?:^|\s)(?:COTISATIONS?\s+(?:AU\s+)?)?FONDS\s+(?:DE\s+)?TRAVAUX(?:\s+ALUR)?(?![A-Za-z0-9_À-ɏ])/i;
  var RE_NOMBRES_LIGNE = /\d{1,3}(?:[   ]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;

  function typePeriodeAppelCharges(periode) {
    if (!periode || !periode.debut || !periode.fin) return null;
    const d = new Date(periode.debut + 'T00:00:00Z'), f = new Date(periode.fin + 'T00:00:00Z');
    if (isNaN(d) || isNaN(f)) return null;
    const lendemain = new Date(f.getTime() + 86400000);
    if (d.getUTCDate() !== 1 || lendemain.getUTCDate() !== 1) return 'autre';
    const mois = (lendemain.getUTCFullYear() - d.getUTCFullYear()) * 12 + lendemain.getUTCMonth() - d.getUTCMonth();
    return mois === 12 && d.getUTCMonth() === 0 ? 'annee' : mois === 3 ? 'trimestre' : mois === 1 ? 'mois' : 'autre';
  }

  function analyserAppelCharges(texte) {
    const lignes = String(texte || '').split('\n').map(l => l.trim()).filter(Boolean);
    const out = { periode: null, typePeriode: null, montant: null, source: null, fondsTravaux: 0, lignesFondsTravaux: 0,
      montantHorsFondsTravaux: null, coproprietaire: null, immeuble: null };
    lignes.forEach(l => {
      if (!out.periode) {
        const m = RE_PERIODE_APPEL_CHARGES.exec(l);
        if (m) out.periode = { debut: isoDepuisJjMmAaaa(m[1]), fin: isoDepuisJjMmAaaa(m[2]) };
      }
      if (!out.coproprietaire) { const m = /Copropri[ée]taire\s*:\s*(.+)$/i.exec(l); if (m) out.coproprietaire = m[1].trim(); }
      if (!out.immeuble) { const m = /Immeuble\s*(?:\([^)]*\))?\s*:\s*(.+)$/i.exec(l); if (m) out.immeuble = m[1].trim(); }
      if (RE_LIGNE_FONDS_TRAVAUX_APPEL.test(l) && !/^(?:Fonds\s+TRV|TOTAL)/i.test(l)) {
        const nombres = l.match(RE_NOMBRES_LIGNE);
        const n = nombres ? montantSyndicDepuisTexte(nombres[nombres.length - 1]) : null;
        if (n != null && n >= 0) { out.fondsTravaux = arrondiCentimes(out.fondsTravaux + n); out.lignesFondsTravaux++; }
      }
    });
    for (const motif of RE_MONTANTS_APPEL_CHARGES) {
      for (const l of lignes) {
        const m = motif.re.exec(l);
        if (!m) continue;
        const n = montantSyndicDepuisTexte(m[1]);
        if (n > 0) { out.montant = n; out.source = motif.source; break; }
      }
      if (out.montant != null) break;
    }
    out.typePeriode = typePeriodeAppelCharges(out.periode);
    if (out.montant != null) out.montantHorsFondsTravaux = arrondiCentimes(Math.max(0, out.montant - out.fondsTravaux));
    return out;
  }

  // Ligne « Prorata de charges » du décompte acquéreur, du jour de l'acte (inclus) à la fin de la
  // période appelée. Null si l'acte tombe hors de la période : rien à répartir. Pure.
  function ligneProrataCharges(montant, periode, dateActeIso) {
    if (!periode || !periode.debut || !periode.fin || !dateActeIso) return null;
    const r = calculerProrata(montant, periode.debut, periode.fin, dateActeIso);
    if (!r) return null;
    const fr = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
    return { libelle: `Prorata de charges de copropriété (du ${fr(dateActeIso)} au ${fr(periode.fin)})`, montant: r.partAcquereur, detail: r };
  }

  // --- état daté : fonds de travaux attaché au lot vendu -------------------------------------
  // Cinq états datés réels, quatre formes : rubrique B12 « Montant de la part dudit fonds
  // rattachée au lot principal cédé   662,00 » (le plus courant, y compris scanné et OCRisé :
  // « principa vendu 1 380,431 »), « Fonds travaux attachés aux lots vendus : 1 380,43 € », « Pour
  // information montant du fonds ALUR : 122.97 € » (Immo'Zel), et « Il n'y a pas de fonds ALUR ».
  // La cotisation exigible (« 4.4 Fonds de travaux … 12.49 € ») et l'avance de l'exercice
  // (« L'avance 'Fonds de Travaux - Exercice 2025' d'un montant de 197,97 € ») ne sont PAS le
  // montant attaché au lot : elles sont laissées de côté volontairement.
  var RE_FONDS_ETAT_DATE = [
    { source: 'part du fonds rattachée au lot (B12)', re: new RegExp('part\\s+dudit\\s+fonds\\s+rattach[ée]e?\\s+au\\s+lot[^\\d€]{0,40}?' + RE_MONTANT_PIECE_SRC, 'i') },
    { source: 'fonds travaux attachés aux lots vendus', re: new RegExp('fonds\\s+(?:de\\s+)?travaux\\s+attach[ée]s?\\s+aux?\\s+lots?\\s+(?:vendus?|c[ée]d[ée]s?)\\s*:?\\s*' + RE_MONTANT_PIECE_SRC, 'i') },
    { source: 'montant du fonds ALUR', re: new RegExp('montant\\s+du\\s+fonds\\s+(?:ALUR|de\\s+travaux)(?:\\s*\\(loi\\s+ALUR\\))?\\s*:?\\s*' + RE_MONTANT_PIECE_SRC + '\\s*€', 'i') }
  ];
  var RE_SANS_FONDS_ETAT_DATE = /(?:n['’]y\s+a\s+pas|pas)\s+de\s+fonds\s+(?:ALUR|de\s+travaux|travaux)|aucun\s+fonds\s+(?:de\s+)?travaux|fonds\s+(?:de\s+)?travaux\s*:\s*n[ée]ant/i;
  var RE_DERNIERE_COTISATION_ETAT_DATE = new RegExp('derni[èe]re\\s+cotisation\\s+vers[ée]e\\s+par\\s+le\\s+propri[ée]taire[^\\d]{0,60}?' + RE_MONTANT_PIECE_SRC, 'i');
  var RE_DATE_SIGNATURE_ETAT_DATE = /date\s+de\s+signature\s+le\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i;

  function fondsTravauxDepuisEtatDate(texte) {
    const plat = String(texte || '').replace(/\s+/g, ' ');
    const out = { montant: null, absent: false, source: null, extrait: '', cotisation: null, dateSignature: null };
    if (!plat) return out;
    for (const motif of RE_FONDS_ETAT_DATE) {
      const m = motif.re.exec(plat);
      if (!m) continue;
      const n = montantSyndicDepuisTexte(m[1]);
      if (n == null) continue;
      out.montant = n; out.source = motif.source;
      out.extrait = plat.slice(Math.max(0, m.index), m.index + m[0].length).trim();
      break;
    }
    if (out.montant == null && RE_SANS_FONDS_ETAT_DATE.test(plat)) { out.absent = true; out.montant = 0; out.source = 'aucun fonds de travaux'; }
    const c = RE_DERNIERE_COTISATION_ETAT_DATE.exec(plat);
    if (c) out.cotisation = montantSyndicDepuisTexte(c[1]);
    const d = RE_DATE_SIGNATURE_ETAT_DATE.exec(plat);
    if (d) out.dateSignature = isoDepuisJjMmAaaa(d[1]);
    return out;
  }

  // --- relevé de compte client (JurisWeb) -----------------------------------------------------
  // Une ligne par écriture : date, libellé, puis UN montant dans la colonne Débit ou Crédit.
  // Reconstruit en texte, un seul montant ne dit plus sa colonne : elle est retrouvée par la
  // position horizontale de l'item (en-tête « Débit » / « Crédit ») quand les positions sont
  // fournies, sinon par le libellé (« VIR INST RECU » = reçu du client, « VIREMENT A … » = sorti).
  var RE_LIGNE_RELEVE_COMPTE = /^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/;
  var RE_MONTANT_RELEVE_G = /\d{1,3}(?:[   ]\d{3})*,\d{2}(?!\d)/g;
  var RE_ECRITURE_RECUE = /\bRE[CÇ]US?\b|\bREMISE\b|\bCH[EÈ]QUE\b|\bCHQ\b|\bVERSEMENT\b|\bENCAISS/i;
  var RE_ECRITURE_SORTIE = /^VIR(?:EMENT)?\s+(?:A|[ÀÁ]|VERS|EMIS)\b|\bREMBOURS|\bRESTITUTION\b|\bR[ÈE]GLEMENT\b|\bPAIEMENT\b/i;
  var RE_NATURE_FRAIS = /PROVISION\s+(?:SUR\s+)?FRAIS|PROV\.?\s*(?:SUR\s+)?FRAIS|\bFRAIS\b/i;
  var RE_NATURE_PRIX = /INDEMNIT|IMMOBILISATION|D[ÉE]P[ÔO]T\s+DE\s+GARANTIE|S[ÉE]QUESTRE|ACOMPTE|\bPRIX\b|\bAPPORT\b|\bFONDS\b/i;
  var RE_TIERS_VIREMENT = /^VIR(?:EMENT)?\s+(?:A|[ÀÁ]|VERS)\s+(.+?)(?:\s+(?:INDEMNIT|PROVISION|D[ÉE]P[ÔO]T|S[ÉE]QUESTRE|ACOMPTE|VTE|VENTE|FRAIS)\b|$)/i;

  function natureEcritureReleve(libelle) {
    if (RE_NATURE_FRAIS.test(libelle)) return 'frais';
    if (RE_NATURE_PRIX.test(libelle)) return 'prix';
    return 'autre';
  }

  // `lignes` : chaînes (texte collé) ou objets { texte, items:[{ x, str }] } (PDF avec positions).
  function analyserReleveCompteClient(lignes) {
    const out = { titre: false, nature: null, ecritures: [], recu: { prix: 0, frais: 0, autre: 0 }, reverse: { prix: 0, frais: 0, autre: 0 },
      tiers: [], totalDebit: 0, totalCredit: 0, solde: null, ambigues: 0 };
    let xDebit = null, xCredit = null;
    (lignes || []).forEach(l => {
      const texte = (typeof l === 'string' ? l : (l && l.texte) || '').trim();
      const items = typeof l === 'string' ? null : (l && l.items) || null;
      if (!texte) return;
      if (/Relev[ée]\s+de\s+compte/i.test(texte)) out.titre = true;
      const mNature = /Nature\s+du\s+compte\s*:\s*(.+?(?:\)|$))/i.exec(texte);
      if (mNature) out.nature = mNature[1].trim();
      if (xDebit == null && items && /\bD[ée]bit\b/.test(texte) && /\bCr[ée]dit\b/.test(texte)) {
        items.forEach(it => {
          if (/\bD[ée]bit\b/i.test(it.str)) xDebit = it.x;
          if (/\bCr[ée]dit\b/i.test(it.str)) xCredit = it.x;
        });
        return;
      }
      const mSolde = /^Solde(?:\s+(?:cr[ée]diteur|d[ée]biteur))?\s*:?\s*(\d{1,3}(?:[   ]\d{3})*,\d{2})/i.exec(texte);
      if (mSolde) { out.solde = montantDepuisTexteFr(mSolde[1]); if (/d[ée]biteur/i.test(texte)) out.solde = -out.solde; return; }
      const m = RE_LIGNE_RELEVE_COMPTE.exec(texte);
      if (!m) return;
      const montants = Array.from(m[2].matchAll(RE_MONTANT_RELEVE_G));
      if (!montants.length) return;
      const libelle = m[2].slice(0, montants[0].index).trim();
      let debit = 0, credit = 0;
      if (montants.length >= 2) {
        debit = montantDepuisTexteFr(montants[0][0]); credit = montantDepuisTexteFr(montants[1][0]);
      } else {
        const n = montantDepuisTexteFr(montants[0][0]);
        let colonne = null;
        if (items && xDebit != null && xCredit != null) {
          const chaine = montants[0][0].replace(/[   ]/g, '');
          const item = items.find(it => it.str.replace(/[   ]/g, '').endsWith(chaine));
          if (item) colonne = Math.abs(item.x - xCredit) < Math.abs(item.x - xDebit) ? 'credit' : 'debit';
        }
        if (!colonne) {
          if (RE_ECRITURE_SORTIE.test(libelle)) colonne = 'debit';
          else if (RE_ECRITURE_RECUE.test(libelle)) colonne = 'credit';
          else { colonne = 'credit'; out.ambigues++; }
        }
        if (colonne === 'credit') credit = n; else debit = n;
      }
      const nature = natureEcritureReleve(libelle);
      const ecriture = { date: isoDepuisJjMmAaaa(m[1]), libelle, debit, credit, nature };
      if (debit > 0) {
        const t = RE_TIERS_VIREMENT.exec(libelle);
        if (t) { ecriture.tiers = t[1].trim(); if (!out.tiers.includes(ecriture.tiers)) out.tiers.push(ecriture.tiers); }
        out.reverse[nature] = arrondiCentimes(out.reverse[nature] + debit);
      }
      if (credit > 0) out.recu[nature] = arrondiCentimes(out.recu[nature] + credit);
      out.totalDebit = arrondiCentimes(out.totalDebit + debit);
      out.totalCredit = arrondiCentimes(out.totalCredit + credit);
      out.ecritures.push(ecriture);
    });
    if (out.solde == null && out.ecritures.length) out.solde = arrondiCentimes(out.totalCredit - out.totalDebit);
    return out;
  }
  // --- fin du socle pur -------------------------------------------------------------------------

  // --- état de l'écran (non persisté : cet outil ne crée ni ne modifie aucun dossier) ---------
  var afDossierLie = null;        // id du dossier CLAIRE repris, ou null
  var afClients = [];             // [{civilite, prenom, nom}]
  var afSituation = '';           // situation des clients (SITUATIONS_CLIENT), '' = selon les civilités
  var afLignes = { debit: [], credit: [] };
  var afModeleCharge = false;     // le modèle .docx + les images ont-ils été chargés ?
  var afModeleEnCours = null;     // promesse de chargement en cours, pour ne pas la lancer deux fois

  var AF_CIVILITES = ['M', 'Mme', 'SCI', 'Indivision'];

  // Le nom de fichier du .docx : « Convocation … - DUPONT et MARTIN.docx ». Les caractères
  // interdits par Windows sont remplacés plutôt que retirés — « M/Mme » ne doit pas devenir
  // « MMme ».
  function afNomFichierDocx(clients) {
    const noms = (clients || []).map(c => (c.civilite === 'SCI' || c.civilite === 'Indivision')
      ? String(c.nom || '').trim()
      : String(c.nom || '').trim().toUpperCase()).filter(Boolean);
    const base = noms.join(' et ') || 'CLIENT';
    return "Convocation au rendez-vous contenant l'appel de fonds - " + base.replace(/[\\/:*?"<>|]/g, '-') + '.docx';
  }

  // La phrase du rendez-vous telle qu'elle s'écrit dans le courrier : « le mardi 29 septembre, à
  // 11 heures, en l'étude ». Sans date, on écrit ce qu'on sait plutôt qu'une date inventée.
  function phraseRdvAppelFonds(iso, heure, lieu) {
    const lieuTexte = String(lieu || '').trim();
    if (!iso) return lieuTexte ? 'à une date à fixer, ' + lieuTexte : 'à une date à fixer';
    const d = new Date(iso + 'T00:00:00');
    const jour = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    let phrase = 'le ' + jour;
    if (heure) {
      const [h, m] = String(heure).split(':');
      const hn = parseInt(h, 10);
      phrase += ', à ' + hn + (m && m !== '00' ? ' h ' + m : ' heures');
    }
    if (lieuTexte) phrase += ', ' + lieuTexte;
    return phrase;
  }

  function afEl(id) { return document.getElementById(id); }
  function afValeur(id) { const e = afEl(id); return e ? String(e.value || '').trim() : ''; }

  // --- lien vers un dossier suivi (Outil 1) ---------------------------------------------------
  //
  // Lecture SEULE du dossier : cet outil ne l'écrit jamais, il n'en reprend que ce qui est déjà
  // vérifié. Même patron de recherche que le Tableau de bord et Outil 2 (normaliserPourRecherche,
  // dossiers actifs uniquement, 8 résultats).
  function rechercherDossierAppelFonds(valeur) {
    const boite = afEl('af-dossier-resultats');
    if (!boite) return;
    const q = normaliserPourRecherche(String(valeur || '').trim());
    if (!q) { boite.style.display = 'none'; boite.innerHTML = ''; return; }
    const trouves = dossiers.filter(d => !d.archive &&
      (normaliserPourRecherche(libelleDossierAffiche(d)).includes(q) || normaliserPourRecherche(d.responsable || '').includes(q)))
      .slice(0, 8);
    if (!trouves.length) {
      boite.innerHTML = '<div class="dash-recherche-vide">Aucun dossier ne correspond.</div>';
      boite.style.display = 'block';
      return;
    }
    // `.dash-recherche-ligne`/`.dash-recherche-resp` et pas `-item`/`-meta` : ces deux dernières
    // n'existent nulle part dans style.css, le menu s'affichait donc en boutons natifs bruts (ni
    // séparateur, ni survol). Corrigé en même temps que l'ajout des suggestions d'adresse, qui
    // réutilisent le même gabarit juste en dessous.
    boite.innerHTML = trouves.map(d => `<button type="button" class="dash-recherche-ligne" onclick="choisirDossierAppelFonds('${escapeOnclickArg(d.id)}')">
      <span class="dash-recherche-nom">${escapeHtml(libelleDossierAffiche(d))}</span>
      <span class="dash-recherche-resp">${escapeHtml(d.responsable || '')}</span>
    </button>`).join('');
    boite.style.display = 'block';
  }

  function choisirDossierAppelFonds(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const champ = afEl('af-dossier-recherche');
    if (champ) champ.value = '';
    const boite = afEl('af-dossier-resultats');
    if (boite) { boite.style.display = 'none'; boite.innerHTML = ''; }
    appliquerPrefillAppelFonds(d);
  }

  function retirerDossierAppelFonds() {
    afDossierLie = null;
    renderPillDossierAppelFonds();
    const recap = afEl('af-recap-prefill');
    if (recap) { recap.className = 'af-recap'; recap.innerHTML = ''; }
  }

  function renderPillDossierAppelFonds() {
    majActionBrouillonAppelFonds();
    const cible = afEl('af-dossier-pill');
    if (!cible) return;
    const d = afDossierLie ? dossiers.find(x => x.id === afDossierLie) : null;
    if (!d) { cible.innerHTML = ''; return; }
    cible.innerHTML = `<div class="dash-recherche-pill">
      <span class="dot-label dl-success"><span class="dot"></span>${escapeHtml(libelleDossierAffiche(d))}</span>
      <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="retirerDossierAppelFonds()">Détacher</wa-button>
    </div>`;
  }

  // Le bouton « Email (courrier joint) » n'a de sens que si un dossier est relié ET que l'email de
  // son destinataire (client, ou confrère) est connu : c'est de là que vient l'adresse.
  function majActionBrouillonAppelFonds() {
    const bouton = afEl('af-brouillon-outlook');
    if (!bouton) return;
    const d = afDossierLie ? dossiers.find(x => x.id === afDossierLie) : null;
    bouton.style.display = (d && emailDestinataireRelance(d)) ? '' : 'none';
  }

  // --- adresse du bien : reprise du dossier, ou suggestions de la Base Adresse Nationale --------
  //
  // Deux sources, jamais en même temps, demandé ainsi par l'étude : quand un dossier est rattaché,
  // son adresse est reprise telle quelle (elle a déjà été relue et corrigée à la création du
  // dossier, la redemander à un service extérieur n'apporterait rien) ; sans dossier rattaché, le
  // champ propose les adresses officielles de la Base Adresse Nationale (api-adresse.data.gouv.fr).
  //
  // **Seul appel réseau vers un service tiers de tout CLAIRE.** Ce qui part est le texte tapé dans
  // ce champ, rien d'autre — jamais le nom du dossier, des parties ni aucune autre donnée client.
  // L'API est un service public de l'État, sans compte ni clé. Si le poste n'a pas d'accès
  // internet, l'appel échoue silencieusement et le champ reste une saisie libre : la génération du
  // courrier ne dépend à aucun moment de ce service.
  var API_ADRESSE_DATA_GOUV = 'https://api-adresse.data.gouv.fr/search/';
  var MIN_CARACTERES_SUGGESTION_ADRESSE = 4;
  var DELAI_SUGGESTION_ADRESSE_MS = 250;
  var afAdresseBienDepuisDossier = false;
  var afSuggestionsAdresseMinuteur = null;
  var afGenerationSuggestionAdresse = 0;

  function urlRechercheAdresseDataGouv(requete) {
    return API_ADRESSE_DATA_GOUV + '?q=' + encodeURIComponent(String(requete || '').trim()) + '&limit=5&autocomplete=1';
  }

  // La BAN renvoie du GeoJSON : `label` est l'adresse complète (« 5 rue des Lilas 41000 Blois »),
  // `context` le département et la région. Tout ce qui n'a pas de `label` exploitable est écarté
  // plutôt que rendu sous forme de ligne vide.
  function adressesDepuisReponseDataGouv(json) {
    const features = (json && Array.isArray(json.features)) ? json.features : [];
    return features
      .map(f => (f && f.properties) ? { label: String(f.properties.label || '').trim(), contexte: String(f.properties.context || '').trim() } : null)
      .filter(a => a && a.label);
  }

  function masquerSuggestionsAdresseBien() {
    // Un clic sur une suggestion déclenche d'abord le `blur` du champ : masquer tout de suite
    // ferait disparaître le bouton avant que son `click` ne parte. D'où le petit délai.
    setTimeout(() => {
      const boite = afEl('af-adresse-bien-resultats');
      if (boite) { boite.style.display = 'none'; boite.innerHTML = ''; }
    }, 180);
  }

  function renderSuggestionsAdresseBien(liste) {
    const boite = afEl('af-adresse-bien-resultats');
    if (!boite) return;
    if (!liste.length) { boite.style.display = 'none'; boite.innerHTML = ''; return; }
    boite.innerHTML = liste.map(a => `<button type="button" class="dash-recherche-ligne" onclick="choisirAdresseBienAppelFonds('${codifierPourAttribut(a.label)}')">
      <span class="dash-recherche-nom">${escapeHtml(a.label)}</span>
      <span class="dash-recherche-resp">${escapeHtml(a.contexte)}</span>
    </button>`).join('');
    boite.style.display = 'block';
  }

  function rechercherAdresseBienAppelFonds(valeur) {
    const q = String(valeur || '').trim();
    if (afSuggestionsAdresseMinuteur) clearTimeout(afSuggestionsAdresseMinuteur);
    // Dès que l'étude tape, l'adresse n'est plus celle reprise du dossier : l'indication sous le
    // champ doit le dire, sinon elle affirmerait une provenance fausse.
    if (afAdresseBienDepuisDossier) majSourceAdresseBien(false);
    if (q.length < MIN_CARACTERES_SUGGESTION_ADRESSE) { renderSuggestionsAdresseBien([]); return; }
    const generation = ++afGenerationSuggestionAdresse;
    afSuggestionsAdresseMinuteur = setTimeout(async () => {
      try {
        const rep = await fetch(urlRechercheAdresseDataGouv(q));
        if (!rep.ok) throw new Error('reponse ' + rep.status);
        const json = await rep.json();
        // Une réponse arrivée après que l'étude a continué de taper décrirait une requête
        // périmée : on l'ignore plutôt que de proposer des adresses sans rapport avec le champ.
        if (generation !== afGenerationSuggestionAdresse) return;
        renderSuggestionsAdresseBien(adressesDepuisReponseDataGouv(json));
      } catch (e) {
        // Poste sans accès internet, service indisponible : aucun message, le champ reste une
        // saisie libre. Une erreur ici ne doit jamais gêner la rédaction du courrier.
        if (generation === afGenerationSuggestionAdresse) renderSuggestionsAdresseBien([]);
      }
    }, DELAI_SUGGESTION_ADRESSE_MS);
  }

  function choisirAdresseBienAppelFonds(b64) {
    const champ = afEl('af-adresse-bien');
    if (champ) champ.value = decoderAttribut(b64);
    renderSuggestionsAdresseBien([]);
    majSourceAdresseBien(false);
    majApercuAppelFonds();
  }

  function majSourceAdresseBien(depuisDossier) {
    afAdresseBienDepuisDossier = !!depuisDossier;
    const note = afEl('af-adresse-bien-source');
    if (!note) return;
    note.textContent = afAdresseBienDepuisDossier
      ? 'Adresse reprise du dossier rattaché. Modifiez-la pour obtenir des suggestions officielles.'
      : "Tapez l'adresse : des suggestions officielles (Base Adresse Nationale) s'affichent.";
  }

  // Écrit dans le formulaire tout ce que le dossier permet, puis AFFICHE ce qu'il n'a pas permis.
  // Le second point est le plus important : un champ laissé vide sur un courrier adressé à un
  // client se voit, et rien dans l'outil ne dirait pourquoi sans ce récapitulatif.
  function appliquerPrefillAppelFonds(d) {
    const p = prefillAppelFonds(d, categoriesRdvReglees());
    if (!p) return;
    // Les pièces lues pour un AUTRE dossier (avis de taxe foncière, état daté…) ne le suivent pas ; celles déposées avant
    // tout choix de dossier restent.
    const autreDossier = !!afDossierLie && afDossierLie !== p.dossierId;
    if (autreDossier) {
      tfAvis.af = null;
      renderBlocTaxeFonciere('af');
      ['charges', 'etatDate', 'releve'].forEach(type => { afPieces[type] = null; renderBlocPieceAppelFonds(type); });
    }
    afDossierLie = p.dossierId;
    afHistoriqueId = null;
    afHistoriqueNom = '';

    afClients = p.clients.map(c => ({ civilite: c.civilite, prenom: c.prenom, nom: c.nom }));
    if (!afClients.length) afClients = [{ civilite: 'M', prenom: '', nom: '' }];
    afSituation = p.situation || '';
    const champSituation = afEl('af-situation');
    if (champSituation) champSituation.value = afSituation;

    // Un champ que le dossier laisse vide garde ce qui a été saisi avant tout choix de dossier, mais jamais la valeur d'un AUTRE
    // dossier (audit 07/10 : la date ou l'adresse du dossier précédent restaient dans le courrier).
    const ecrire = (id, v) => { const e = afEl(id); if (e && (v || autreDossier)) e.value = v || ''; };
    ecrire('af-ref', p.dossierNom);
    ecrire('af-designation', p.designation);
    ecrire('af-adresse-bien', p.adresseBien);
    // L'adresse vient de la fiche : on le dit sous le champ, et les suggestions extérieures
    // n'ont plus lieu d'être tant que l'étude ne la retouche pas.
    majSourceAdresseBien(!!p.adresseBien);
    ecrire('af-date-rdv', p.dateRdv);
    ecrire('af-heure-rdv', p.heureRdv);
    const champLieu = afEl('af-lieu');
    if (champLieu && p.lieuRdv) {
      champLieu.value = p.lieuRdv.valeur;
      const champAutre = afEl('af-lieu-autre');
      if (champAutre) { champAutre.value = p.lieuRdv.autre || ''; champAutre.style.display = p.lieuRdv.valeur === '__autre' ? 'block' : 'none'; }
    }
    const casePret = afEl('af-pret-hypothecaire');
    if (casePret) casePret.checked = !!p.pretHypothecaire;
    const caseSansPret = afEl('af-sans-pret');
    if (caseSansPret) caseSansPret.checked = !!p.sansPret;
    // Préremplis seulement quand le dossier tranche : un département ambigu (69) ou un type de
    // vente absent laisse le select vide, donc le contrôle silencieux, plutôt qu'un barème deviné.
    ecrire('af-frais-departement', p.departementFrais);
    ecrire('af-frais-type', p.typeBienFrais);
    ecrire('af-prix-mobilier', p.prixMobilier ? String(p.prixMobilier) : '');

    afLignes = lignesDecompteDepuisPrefill(p);
    definirModeDecompteAppelFonds(p.modeDecompte);
    if (tfAvis.af) majLigneTfAppelFonds();
    ['charges', 'etatDate', 'releve'].forEach(type => { if (afPieces[type]) appliquerPieceAppelFonds(type); });

    renderPillDossierAppelFonds();
    renderClientsAppelFonds();
    renderTableAppelFonds();
    majApercuAppelFonds();
    if (p.modeDecompte === 'confrere') reprendreDecompteConfrereNas(d);
    else reprendrePiecesNasAppelFonds(d);

    const recap = afEl('af-recap-prefill');
    if (recap) {
      const bloc = (titre, items, cls) => items.length
        ? `<div class="af-recap-bloc"><div class="af-recap-titre">${titre}</div><ul class="${cls}">${items.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul></div>`
        : '';
      recap.innerHTML = bloc('Repris du dossier', p.repris, '') + bloc('À compléter vous-même', p.aCompleter, 'af-recap-manquant');
      recap.className = 'af-recap af-recap-visible';
    }
  }

  // Bouton « Préparer l'appel de fonds » de la fiche dossier : bascule vers l'onglet avec le
  // dossier déjà repris. Le tiroir se ferme — on quitte le Suivi, le laisser ouvert par-dessus un
  // autre écran n'aurait pas de sens.
  function preparerAppelFondsDepuisDossier(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    fermerDossierDrawer();
    definirOnglet('appel-fonds');
    appliquerPrefillAppelFonds(d);
  }

  // --- clients ---------------------------------------------------------------------------------
  function renderClientsAppelFonds() {
    const cible = afEl('af-clients');
    if (!cible) return;
    if (!afClients.length) afClients = [{ civilite: 'M', prenom: '', nom: '' }];
    cible.innerHTML = afClients.map((c, i) => `<div class="af-client">
      <select onchange="changerClientAppelFonds(${i}, 'civilite', this.value)">
        ${AF_CIVILITES.map(v => `<option value="${v}"${c.civilite === v ? ' selected' : ''}>${v}</option>`).join('')}
      </select>
      <input type="text" placeholder="Prénom" value="${escapeAttr(c.prenom || '')}" oninput="changerClientAppelFonds(${i}, 'prenom', this.value)">
      <input type="text" placeholder="Nom" value="${escapeAttr(c.nom || '')}" oninput="changerClientAppelFonds(${i}, 'nom', this.value)">
      <button type="button" class="af-client-suppr" title="Retirer ce client" onclick="supprimerClientAppelFonds(${i})">${icone('x')}</button>
    </div>`).join('');
  }

  function changerSituationAppelFonds(valeur) {
    afSituation = SITUATIONS_CLIENT.some(x => x.cle === valeur) ? valeur : '';
    majApercuAppelFonds();
  }

  function changerClientAppelFonds(i, champ, valeur) {
    if (!afClients[i]) return;
    afClients[i][champ] = valeur;
    majApercuAppelFonds();
  }

  function ajouterClientAppelFonds() {
    afClients.push({ civilite: 'M', prenom: '', nom: '' });
    renderClientsAppelFonds();
    majApercuAppelFonds();
  }

  function supprimerClientAppelFonds(i) {
    afClients.splice(i, 1);
    if (!afClients.length) afClients = [{ civilite: 'M', prenom: '', nom: '' }];
    renderClientsAppelFonds();
    majApercuAppelFonds();
  }

  // --- tableau du décompte ---------------------------------------------------------------------
  //
  // Trois colonnes comme sur le courrier papier : libellé | à déduire | débit. Chaque ligne ne
  // remplit que la colonne de son côté, l'autre reste vide — c'est la mise en page du modèle,
  // pas une colonne oubliée.
  // Base du contrôle des frais : la ligne de PRIX du décompte affiché — celle du dossier comme
  // celle d'un décompte de confrère collé, toutes deux nommées « prix ». Prendre le prix du
  // dossier lié ne conviendrait pas : le courrier peut avoir été corrigé à la main entre-temps.
  function prixPourControleFraisActe() {
    const ligne = afLignes.debit.find(l => /\bprix\b/i.test(l.libelle || '') && (l.montant || 0) > 0);
    return ligne ? ligne.montant : null;
  }

  // La fourchette applicable à l'état actuel du formulaire, ou null si l'étude n'a pas encore
  // choisi le département et la nature du bien — sans eux, aucun contrôle n'est affiché.
  // Mobilier compris dans le prix : sort de l'assiette des droits de mutation (art. 735 CGI).
  // Sans le retirer, un décompte qui l'a correctement déduit paraîtrait « sous le barème ».
  function mobilierPourControleFraisActe() {
    const n = eurosDepuisSaisie(afValeur('af-prix-mobilier')) || 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function fourchetteFraisActeFormulaire() {
    const dept = afValeur('af-frais-departement');
    const type = afValeur('af-frais-type');
    const prix = assietteImmobiliere(prixPourControleFraisActe(), mobilierPourControleFraisActe());
    if (!dept || !type || !prix) return null;
    return fourchetteFraisActe(prix, dept, type);
  }

  function renderTableAppelFonds() {
    const fourchette = fourchetteFraisActeFormulaire();
    const rendu = (section) => {
      const tbody = afEl(section === 'debit' ? 'af-tbody-debit' : 'af-tbody-credit');
      if (!tbody) return 0;
      let html = '';
      if (section === 'credit') html += '<tr><td colspan="3" style="padding:2px"></td></tr><tr><td>À déduire</td><td></td><td></td></tr>';
      let total = 0;
      afLignes[section].forEach((l, i) => {
        if (!l.memoire) total += (l.montant || 0);
        const v = (!l.memoire && l.formule) ? verifierProrataLigne(l) : null;
        let badge = '';
        if (v && v.statut === 'ok') badge = '<span class="af-verif af-verif-ok" title="Prorata recalculé : conforme">✓ prorata vérifié</span>';
        else if (v && v.statut === 'ecart') badge = `<span class="af-verif af-verif-ecart" title="Recalcul attendu : ${escapeAttr(montantVersTexteFr(v.attendu))}">⚠ écart de calcul</span>`;
        // Contrôle des frais d'acte : indicatif, jamais une correction automatique du montant.
        if (!badge && section === 'debit' && !l.memoire && fourchette && estLigneFraisActeVente(l.libelle)) {
          const f = verifierFraisActeLigne(l.montant || 0, fourchette);
          const plage = `Barème CLAIRE pour ce bien : de ${montantVersTexteFr(f.min || 0)} à ${montantVersTexteFr(f.max || 0)} selon le régime de l'acquéreur.`;
          if (f.statut === 'ok') badge = `<span class="af-verif af-verif-ok" title="${escapeAttr(plage)}">✓ conforme au barème</span>`;
          else if (f.statut === 'sous') badge = `<span class="af-verif af-verif-ecart" title="${escapeAttr(plage)}">↓ ${escapeHtml(montantVersTexteFr(f.ecart))} sous le barème</span>`;
          else if (f.statut === 'sur') badge = `<span class="af-verif af-verif-ecart" title="${escapeAttr(plage)}">↑ ${escapeHtml(montantVersTexteFr(f.ecart))} au-dessus du barème</span>`;
        }
        const montantTexte = l.memoire ? 'Mémoire' : montantVersTexteFr(l.montant || 0);
        const cellMontant = `<span class="af-champ" data-af-section="${section}" data-af-index="${i}" data-af-champ="montant">${escapeHtml(montantTexte)}</span>`;
        // Flèches d'ordre (étude 08/10 : « faire remonter une ligne ou la descendre ») : hors du texte
        // du courrier (contenteditable="false", jamais lues par le .docx qui ne prend que les .af-champ).
        const n = afLignes[section].length;
        const fleche = (sens, nom, titre, actif) => `<button type="button" class="af-ordre-btn" title="${titre}" aria-label="${titre}"${actif ? '' : ' disabled'} onclick="deplacerLigneAppelFonds('${section}', ${i}, ${sens})" ondblclick="event.stopPropagation()">${icone(nom)}</button>`;
        const ordre = n > 1 ? `<span class="af-ordre" contenteditable="false">${fleche(-1, 'chevron-up', 'Remonter la ligne', i > 0)}${fleche(1, 'chevron-down', 'Descendre la ligne', i < n - 1)}</span>` : '';
        const cellLibelle = `<td>${ordre}<span class="af-champ" data-af-section="${section}" data-af-index="${i}" data-af-champ="libelle">${escapeHtml(l.libelle)}</span>${badge}${l.formule ? `<span class="af-formule">${escapeHtml(l.formule)}</span>` : ''}</td>`;
        html += `<tr title="Double-cliquez pour supprimer cette ligne" ondblclick="supprimerLigneAppelFonds('${section}', ${i})">` + (section === 'debit'
          ? `${cellLibelle}<td class="af-montant"></td><td class="af-montant">${cellMontant}</td>`
          : `${cellLibelle}<td class="af-montant">${cellMontant}</td><td class="af-montant"></td>`) + '</tr>';
      });
      html += `<tr class="af-sous-total">` + (section === 'debit'
        ? `<td>Soit au total</td><td class="af-montant"></td><td class="af-montant">${escapeHtml(montantVersTexteFr(total))}</td>`
        : `<td>Soit au total</td><td class="af-montant">${escapeHtml(montantVersTexteFr(total))}</td><td class="af-montant"></td>`) + '</tr>';
      tbody.innerHTML = html;
      return total;
    };
    const debit = rendu('debit');
    const credit = rendu('credit');
    const solde = afEl('af-p-solde');
    if (solde) solde.textContent = montantVersTexteFr(debit - credit);
  }

  // Le montant est modifié DANS le tableau : on met le modèle à jour et on recalcule les totaux,
  // sans redessiner le tableau — un redraw ferait perdre le curseur en pleine frappe.
  function modifierMontantAppelFonds(span) {
    const section = span.getAttribute('data-af-section');
    const i = parseInt(span.getAttribute('data-af-index'), 10);
    const ligne = afLignes[section] && afLignes[section][i];
    if (!ligne) return;
    const texte = span.textContent || '';
    if (AF_MEMOIRE_RE.test(texte)) { ligne.memoire = true; ligne.montant = 0; }
    else { ligne.memoire = false; ligne.montant = montantDepuisTexteFr(texte) || 0; }
    recalculerTotauxAppelFonds();
  }

  function modifierLibelleAppelFonds(span) {
    const section = span.getAttribute('data-af-section');
    const i = parseInt(span.getAttribute('data-af-index'), 10);
    if (afLignes[section] && afLignes[section][i]) afLignes[section][i].libelle = span.textContent || '';
  }

  function recalculerTotauxAppelFonds() {
    const somme = (section) => afLignes[section].reduce((t, l) => t + (l.memoire ? 0 : (l.montant || 0)), 0);
    const debit = somme('debit');
    const credit = somme('credit');
    const majSousTotal = (id, colonne, valeur) => {
      const tbody = afEl(id);
      if (!tbody) return;
      const tr = tbody.querySelector('tr.af-sous-total');
      if (!tr) return;
      const cellules = tr.querySelectorAll('td');
      if (cellules[colonne]) cellules[colonne].textContent = montantVersTexteFr(valeur);
    };
    majSousTotal('af-tbody-debit', 2, debit);
    majSousTotal('af-tbody-credit', 1, credit);
    const solde = afEl('af-p-solde');
    if (solde) solde.textContent = montantVersTexteFr(debit - credit);
  }

  // Le courrier entier est UN bloc modifiable (#af-lettre, contenteditable) : le navigateur n'y
  // signale une frappe qu'au bloc, jamais à la cellule du décompte — un `oninput` posé sur la
  // cellule ne se déclenchait donc pas, le modèle gardait l'ancien texte, et le tableau redessiné
  // (suppression d'une autre ligne, ajout, contrôle des frais) le faisait réapparaître (signalé
  // par l'étude le 29/09). Chaque frappe dans le courrier relit donc toutes les cellules.
  function synchroniserDecompteDepuisApercu() {
    ['af-tbody-debit', 'af-tbody-credit'].forEach(id => {
      const tbody = afEl(id);
      if (!tbody) return;
      tbody.querySelectorAll('.af-champ[data-af-champ]').forEach(span => {
        if (span.getAttribute('data-af-champ') === 'montant') modifierMontantAppelFonds(span);
        else modifierLibelleAppelFonds(span);
      });
    });
  }
  function saisieApercuAppelFonds() {
    synchroniserDecompteDepuisApercu();
    recalculerTotauxAppelFonds();
  }

  function ajouterLigneAppelFonds(section) {
    synchroniserDecompteDepuisApercu();
    afLignes[section].push({ libelle: 'Nouvelle ligne', montant: 0, formule: null, id: afIdLigne() });
    renderTableAppelFonds();
  }

  function supprimerLigneAppelFonds(section, i) {
    synchroniserDecompteDepuisApercu();
    if (!afLignes[section] || !afLignes[section][i]) return;
    afLignes[section].splice(i, 1);
    renderTableAppelFonds();
  }

  // Échange une ligne avec sa voisine (sens -1 = remonter, +1 = descendre) ; rend faux hors bornes.
  function deplacerElementListe(liste, i, sens) {
    const j = i + sens;
    if (!Array.isArray(liste) || i < 0 || i >= liste.length || j < 0 || j >= liste.length) return false;
    const el = liste[i];
    liste[i] = liste[j];
    liste[j] = el;
    return true;
  }

  function deplacerLigneAppelFonds(section, i, sens) {
    synchroniserDecompteDepuisApercu();
    if (!deplacerElementListe(afLignes[section], i, sens)) return;
    renderTableAppelFonds();
    const tbody = afEl(section === 'debit' ? 'af-tbody-debit' : 'af-tbody-credit');
    const bouton = tbody && tbody.querySelector(`.af-champ[data-af-index="${i + sens}"]`);
    const tr = bouton && bouton.closest('tr');
    const cible = tr && tr.querySelector(`.af-ordre-btn:${sens < 0 ? 'first-child' : 'last-child'}:not([disabled])`);
    if (cible) cible.focus();
  }

  // --- report du formulaire vers le courrier ---------------------------------------------------
  function majLieuAppelFonds() {
    const select = afEl('af-lieu');
    const autre = afEl('af-lieu-autre');
    if (select && autre) autre.style.display = select.value === '__autre' ? 'block' : 'none';
    majApercuAppelFonds();
  }

  function lieuAppelFonds() {
    const select = afEl('af-lieu');
    if (!select) return "en l'étude";
    return select.value === '__autre' ? afValeur('af-lieu-autre') : select.value;
  }

  function majApercuAppelFonds() {
    const poser = (id, texte) => { const e = afEl(id); if (e && texte) e.textContent = texte; };

    // L'adresse et la désignation du bien alimentent aussi le contrôle des frais, juste en dessous
    // (voir majFraisDepuisBienAppelFonds) : c'est le seul endroit par où passent TOUS les chemins
    // qui les modifient — la frappe, le clic sur une suggestion d'adresse, et le préremplissage
    // depuis un dossier — donc le seul où le brancher une fois pour toutes.
    if (majFraisDepuisBienAppelFonds()) renderTableAppelFonds();

    const clientsRemplis = afClients.filter(c => String(c.nom || '').trim());
    const adresse = afValeur('af-adresse-clients');
    const bloc = afEl('af-p-adresse');
    if (bloc) {
      const lignes = lignesDestinatairesAppelFonds(clientsRemplis, afSituation);
      if (adresse) adressePostaleCourrier(adresse).forEach(l => lignes.push(l));
      bloc.innerHTML = lignes.length ? '<u>' + lignes.map(escapeHtml).join('<br>') + '</u>' : '<u>Destinataire à compléter</u>';
    }
    const ligneMention = afEl('af-p-mention-ligne');
    if (ligneMention) ligneMention.style.display = adresse ? 'none' : '';

    const salut = salutationAppelFonds(clientsRemplis, afSituation);
    poser('af-p-salut1', salut);
    poser('af-p-salut2', salut);
    poser('af-p-ref', afValeur('af-ref') || 'RÉF. DOSSIER');
    poser('af-p-datelettre', formatDateFr(afValeur('af-date-lettre')));
    poser('af-p-designation', afValeur('af-designation') || 'un bien');
    poser('af-p-adressebien', normaliserAdresse(afValeur('af-adresse-bien')) || 'adresse à compléter');
    poser('af-p-rdv', phraseRdvAppelFonds(afValeur('af-date-rdv'), afValeur('af-heure-rdv'), lieuAppelFonds()));
    const sansPret = afEl('af-sans-pret');
    poser('af-p-deblocage', phraseDeblocageAppelFonds(!!(sansPret && sansPret.checked)));
  }

  // Dernière phrase du paragraphe « À cet effet… R.I.B. de l'étude » : sans prêt, texte donné par
  // l'étude le 29/09, mot pour mot. Pure.
  function phraseDeblocageAppelFonds(sansPret) {
    return sansPret
      ? 'Je vous invite à vous rapprocher de votre établissement bancaire afin de faire le point sur le déblocage, correspondant à votre apport personnel.'
      : 'Je vous invite à vous rapprocher de votre établissement bancaire afin de faire le point sur le déblocage de votre prêt (total ou partiel si vous financez des travaux), ainsi que sur le virement du solde correspondant à votre apport personnel.';
  }

  // --- import du décompte du confrère -----------------------------------------------------------
  function gererSurvolDepotAppelFonds(e) { e.preventDefault(); const z = afEl('af-dropzone'); if (z) z.classList.add('dragover'); }
  function gererQuitteDepotAppelFonds(e) { e.preventDefault(); const z = afEl('af-dropzone'); if (z) z.classList.remove('dragover'); }
  function gererDepotAppelFonds(e) {
    e.preventDefault();
    const z = afEl('af-dropzone');
    if (z) z.classList.remove('dragover');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) importerDecompteAppelFonds(f);
  }

  // ---- Décompte établi par l'office, ou repris d'un confrère (29/09) ----
  var afModeDecompte = 'office';
  function definirModeDecompteAppelFonds(mode) {
    afModeDecompte = mode === 'confrere' ? 'confrere' : 'office';
    const office = afEl('af-mode-office'), confrere = afEl('af-mode-confrere');
    if (office) office.style.display = afModeDecompte === 'office' ? '' : 'none';
    if (confrere) confrere.style.display = afModeDecompte === 'confrere' ? '' : 'none';
    const bOffice = afEl('af-mode-btn-office'), bConfrere = afEl('af-mode-btn-confrere');
    if (bOffice) bOffice.classList.toggle('actif', afModeDecompte === 'office');
    if (bConfrere) bConfrere.classList.toggle('actif', afModeDecompte === 'confrere');
  }

  // ---- Avis de taxe foncière : prorata et appel de fonds (29/09) ----
  // `cible` : 'prorata' (outil Prorata) ou 'af' (appel de fonds). Rien n'est enregistré.
  var tfAvis = { prorata: null, af: null };

  // Deux sources sur l'avis réel : « Montant de vos taxes foncières » en page 1 (retenue en
  // premier) et le total en bas à droite de la page 2 (contrôle) — quand elles divergent, c'est
  // dit à l'écran plutôt que tranché en silence.
  async function lireAvisTaxeFonciere(fichier) {
    const buffer = await fichier.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page1 = await pdf.getPage(1);
    const enTete = montantAvisTaxeFonciereEnTete(lignesDepuisItemsPdf((await page1.getTextContent()).items));
    const page = await pdf.getPage(Math.min(2, pdf.numPages));
    const contenu = await page.getTextContent();
    const items = contenu.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
    const basDroite = montantBasDroitePage(items);
    const detail = biensAvisTaxeFonciere(items);
    return { montant: enTete || basDroite, enTete, basDroite, pages: pdf.numPages, biens: detail.biens, fraisGestion: detail.fraisGestion };
  }

  async function importerAvisTaxeFonciere(cible, fichier) {
    if (!fichier) return;
    if (typeof pdfjsLib === 'undefined') { afficherToast('Le lecteur PDF n\'est pas disponible.', 'OK', null); return; }
    try {
      const lu = await lireAvisTaxeFonciere(fichier);
      if (!lu.montant) {
        tfAvis[cible] = { fichier: fichier.name, montantAvis: null, retenu: null, erreur: true };
      } else {
        const divergence = lu.enTete && lu.basDroite && Math.abs(lu.enTete - lu.basDroite) > 0.5;
        tfAvis[cible] = { fichier: fichier.name, montantAvis: lu.montant, retenu: lu.montant, enTete: lu.enTete, basDroite: lu.basDroite, divergence };
        // Plusieurs biens sur l'avis : rien n'est retenu tant que le bien vendu n'est pas choisi
        // (étude, 30/09 : « si deux biens demander lequel prendre ») — sauf si l'adresse du dossier
        // de l'appel de fonds désigne sans doute l'un d'eux.
        if (lu.biens && lu.biens.length > 1) {
          const t = tfAvis[cible];
          t.biens = lu.biens; t.fraisGestion = lu.fraisGestion;
          const d = cible === 'af' && afDossierLie ? (dossiers || []).find(x => x.id === afDossierLie) : null;
          const i = d ? bienAvisPourAdresse(lu.biens, d.adresseBien) : null;
          choisirBienAvis(cible, i, true);
        }
      }
    } catch (e) {
      console.error(e);
      tfAvis[cible] = { fichier: fichier.name, montantAvis: null, retenu: null, erreur: true };
    }
    renderBlocTaxeFonciere(cible);
    appliquerTaxeFonciere(cible);
  }

  function renderBlocTaxeFonciere(cible) {
    renderTuilesPieces(cible);
    const zone = document.getElementById(cible + '-tf-bloc');
    const t = tfAvis[cible];
    if (!zone) return;
    if (!t) { zone.innerHTML = ''; return; }
    if (t.erreur) {
      zone.innerHTML = `<p class="hint">${icone('alert-triangle')} ${escapeHtml(t.fichier)} : montant introuvable en bas de la page 2 — saisissez-le.</p>`;
      return;
    }
    const retenu = t.retenu && t.retenu !== t.montantAvis
      ? ` · retenu : <strong>${formaterPrixCentimes(t.retenu)}</strong>` : '';
    const divergence = t.divergence
      ? `<p class="hint">${icone('alert-triangle')} Page 1 : ${escapeHtml(formaterPrixCentimes(t.enTete))} · bas de la page 2 : ${escapeHtml(formaterPrixCentimes(t.basDroite))} — le montant de la page 1 est retenu, à vérifier sur l'avis.</p>`
      : '';
    zone.innerHTML = `
      <p class="hint tf-lu">${escapeHtml(t.fichier)} : <strong>${formaterPrixCentimes(t.montantAvis)}</strong>${retenu}
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="effacerTaxeFonciere('${cible}')" title="Retirer l'avis" aria-label="Retirer l'avis">${icone('x')}</wa-button></p>${divergence}
      ${t.biens && t.biens.length > 1 ? renderChoixBienAvis(cible, t) : `<details class="tf-multi"${t.multi ? ' open' : ''}>
        <summary>L'avis porte sur plusieurs biens</summary>
        <div class="calc-champs tf-multi-champs">
          <div class="calc-champ"><label for="${cible}-tf-bien">Taxe foncière du bien vendu (€)</label>
            <input type="text" inputmode="decimal" id="${cible}-tf-bien" value="${t.tfBien ? escapeAttr(String(t.tfBien).replace('.', ',')) : ''}" oninput="majTaxeFonciereMulti('${cible}')"></div>
          <div class="calc-champ"><label for="${cible}-tf-total">Taxe foncière de tous les biens (€)</label>
            <input type="text" inputmode="decimal" id="${cible}-tf-total" value="${t.tfTotal ? escapeAttr(String(t.tfTotal).replace('.', ',')) : ''}" oninput="majTaxeFonciereMulti('${cible}')"></div>
          <div class="calc-champ"><label for="${cible}-tf-frais">Frais de gestion de l'avis (€)</label>
            <input type="text" inputmode="decimal" id="${cible}-tf-frais" value="${t.frais ? escapeAttr(String(t.frais).replace('.', ',')) : ''}" oninput="majTaxeFonciereMulti('${cible}')"></div>
        </div>
        <p class="hint" id="${cible}-tf-multi-resultat"></p>
      </details>`}`;
    if (!(t.biens && t.biens.length > 1)) majTaxeFonciereMulti(cible, true);
  }

  // Choix du bien vendu quand l'avis en porte plusieurs : une ligne par bien, avec sa taxe foncière
  // et le montant retenu (sa part des frais de gestion ajoutée).
  function renderChoixBienAvis(cible, t) {
    const lignes = t.biens.map((b, i) => {
      const r = montantTfBienAvecFrais(b.tf, t.biens.reduce((s, x) => s + x.tf, 0), t.fraisGestion);
      return `<label class="tf-bien-choix"><input type="radio" name="${cible}-tf-bien-choix" value="${i}"${t.bienChoisi === i ? ' checked' : ''} onchange="choisirBienAvis('${cible}', ${i})">
        <span class="tf-bien-adresse">${escapeHtml(b.adresse)}</span>
        <span class="tf-bien-montant">${formaterPrixCentimes(b.tf)}${r && r.frais ? ` + ${formaterPrixCentimes(r.frais)} de frais = <strong>${formaterPrixCentimes(r.total)}</strong>` : ''}</span></label>`;
    }).join('');
    return `<div class="tf-biens">
        <p class="hint">${t.bienChoisi === null || t.bienChoisi === undefined ? `${icone('alert-triangle')} ` : ''}L'avis porte sur ${t.biens.length} biens : lequel est vendu ?
          ${infoBulle(`Frais de gestion de la fiscalité directe locale (${formaterPrixCentimes(t.fraisGestion || 0)}) répartis au prorata de la taxe foncière de chaque bien, puis ajoutés à celle du bien vendu.`)}</p>
        ${lignes}
      </div>`;
  }

  function choisirBienAvis(cible, index, sansRendu) {
    const t = tfAvis[cible];
    if (!t || !t.biens) return;
    const b = Number.isInteger(index) ? t.biens[index] : null;
    t.bienChoisi = b ? index : null;
    const r = b ? montantTfBienAvecFrais(b.tf, t.biens.reduce((s, x) => s + x.tf, 0), t.fraisGestion) : null;
    t.retenu = r ? r.total : null;
    if (sansRendu) return;
    renderBlocTaxeFonciere(cible);
    appliquerTaxeFonciere(cible);
  }

  function majTaxeFonciereMulti(cible, sansAppliquer) {
    const t = tfAvis[cible];
    if (!t) return;
    const lire = (id) => { const e = document.getElementById(`${cible}-tf-${id}`); return e ? montantDepuisTexteFr(e.value) : null; };
    t.tfBien = lire('bien'); t.tfTotal = lire('total'); t.frais = lire('frais');
    const r = montantTfBienAvecFrais(t.tfBien, t.tfTotal, t.frais);
    t.multi = !!(t.tfBien || t.tfTotal || t.frais);
    const sortie = document.getElementById(`${cible}-tf-multi-resultat`);
    if (sortie) sortie.innerHTML = r
      ? `Montant retenu : <strong>${formaterPrixCentimes(r.total)}</strong> (taxe foncière ${formaterPrixCentimes(r.tf)} + frais de gestion ${formaterPrixCentimes(r.frais)})`
      : (t.multi ? 'Renseignez la taxe foncière du bien et celle de tous les biens.' : '');
    t.retenu = r ? r.total : t.montantAvis;
    if (!sansAppliquer) appliquerTaxeFonciere(cible);
  }

  function effacerTaxeFonciere(cible) {
    tfAvis[cible] = null;
    renderBlocTaxeFonciere(cible);
    appliquerTaxeFonciere(cible);
  }

  function appliquerTaxeFonciere(cible) {
    const t = tfAvis[cible];
    if (cible === 'prorata') {
      if (!t || !t.retenu) return;
      const montant = document.getElementById('prorata-montant');
      const periode = document.getElementById('prorata-periode');
      if (montant) montant.value = String(t.retenu);
      if (periode && periode.value !== 'annee') { periode.value = 'annee'; majPeriodeProrata(); }
      calculerProrataAffichage();
      return;
    }
    majLigneTfAppelFonds();
  }

  // La ligne « Prorata de taxe foncière » du décompte : recalculée quand l'avis ou la date du
  // rendez-vous change, retirée quand l'avis est retiré.
  var AF_ID_LIGNE_TF = 'af-ligne-tf';
  function majLigneTfAppelFonds() {
    const t = tfAvis.af;
    const avant = afLignes.debit.findIndex(l => l.id === AF_ID_LIGNE_TF);
    const date = afValeur('af-date-rdv');
    const ligne = t && t.retenu ? ligneProrataTaxeFonciere(t.retenu, date) : null;
    if (avant !== -1) afLignes.debit.splice(avant, 1);
    if (ligne) afLignes.debit.push({ libelle: ligne.libelle, montant: ligne.montant, formule: null, id: AF_ID_LIGNE_TF });
    const zone = document.getElementById('af-tf-bloc');
    const note = zone && zone.querySelector('.tf-date-manquante');
    if (t && t.retenu && !date && zone && !note) zone.insertAdjacentHTML('beforeend', '<p class="hint tf-date-manquante">Date du rendez-vous nécessaire pour le prorata.</p>');
    if (note && (date || !t)) note.remove();
    renderTableAppelFonds();
    majApercuAppelFonds();
  }

  // ---- Appel de charges, état daté, relevé de compte client (exemples réels du 30/09) ----------
  // Même principe que l'avis de taxe foncière : la pièce est lue dans le navigateur, rien n'est
  // enregistré, et chaque pièce ajoute ou remplit UNE ligne du décompte (ou dit pourquoi elle ne
  // le fait pas). État par pièce : { fichier, analyse, … } ou { fichier, erreur: true }.
  var afPieces = { charges: null, etatDate: null, releve: null };
  var AF_ID_LIGNE_CHARGES = 'af-ligne-charges';
  var RE_LIBELLE_FONDS_TRAVAUX_AF = /fonds\s+de\s+travaux/i;
  var RE_LIBELLE_ACOMPTE_PRIX = /acompte\s+sur\s+prix/i;
  var RE_LIBELLE_ACOMPTE_FRAIS = /acompte\s+sur\s+frais/i;

  // Texte en lignes (positions gardées pour la colonne Débit/Crédit d'un relevé) ; document
  // scanné sans texte → repli OCR, en lignes mais sans positions.
  async function lireTexteEtItemsPdf(fichier) {
    const buffer = await fichier.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const lignesPositions = [];
    for (let p = 1; p <= Math.min(pdf.numPages, PLAFOND_PAGES_VERIFICATION); p++) {
      const page = await pdf.getPage(p);
      const contenu = await page.getTextContent();
      lignesAvecPositionsDepuisItems(contenu.items).forEach(l => lignesPositions.push(l));
    }
    let texte = lignesPositions.map(l => l.texte).join('\n');
    let ocr = false;
    if (texte.trim().length < 40) { texte = await lireTextePdfVerification(pdf); ocr = true; }
    return { texte, lignesPositions: ocr ? null : lignesPositions };
  }

  async function importerPieceAppelFonds(type, fichier) {
    if (!fichier || !Object.prototype.hasOwnProperty.call(afPieces, type)) return;
    if (typeof pdfjsLib === 'undefined') { afficherToast('Le lecteur PDF n\'est pas disponible.', 'OK', null); return; }
    effacerPieceAppelFonds(type, true);
    try {
      const lu = await lireTexteEtItemsPdf(fichier);
      if (type === 'charges') afPieces.charges = { fichier: fichier.name, analyse: analyserAppelCharges(lu.texte), horsFondsTravaux: true };
      else if (type === 'etatDate') afPieces.etatDate = { fichier: fichier.name, analyse: fondsTravauxDepuisEtatDate(lu.texte) };
      else afPieces.releve = { fichier: fichier.name, analyse: analyserReleveCompteClient(lu.lignesPositions || lu.texte.split('\n')) };
    } catch (e) {
      console.error(e);
      afPieces[type] = { fichier: fichier.name, erreur: true };
    }
    appliquerPieceAppelFonds(type);
  }

  // `pourRemplacer` : la pièce est retirée parce qu'une autre arrive — le bloc n'est pas redessiné.
  function effacerPieceAppelFonds(type, pourRemplacer) {
    const piece = afPieces[type];
    afPieces[type] = null;
    if (piece && !piece.erreur) {
      if (type === 'charges') afLignes.debit = afLignes.debit.filter(l => l.id !== AF_ID_LIGNE_CHARGES);
      else if (type === 'etatDate' && piece.ligne) {
        const i = afLignes.debit.findIndex(l => l.id === piece.ligne.id);
        if (i !== -1) { if (piece.ligne.inseree) afLignes.debit.splice(i, 1); else afLignes.debit[i].montant = piece.ligne.avant; }
      } else if (type === 'releve' && piece.lignes) {
        piece.lignes.forEach(m => {
          const i = afLignes.credit.findIndex(l => l.id === m.id);
          if (i === -1) return;
          if (m.inseree) afLignes.credit.splice(i, 1); else afLignes.credit[i].montant = m.avant;
        });
      }
    }
    if (pourRemplacer) return;
    renderBlocPieceAppelFonds(type);
    renderTableAppelFonds();
    majApercuAppelFonds();
  }

  function appliquerPieceAppelFonds(type) {
    if (type === 'charges') majLigneChargesAppelFonds();
    else if (type === 'etatDate') majLigneFondsTravauxAppelFonds();
    else majLignesAcomptesAppelFonds();
    renderBlocPieceAppelFonds(type);
    renderTableAppelFonds();
    majApercuAppelFonds();
  }

  // Toutes les lignes qui dépendent de la date du rendez-vous (prorata de taxe foncière et de
  // charges) : appelé quand la date change, et après le préremplissage depuis un dossier.
  function majLignesProrataAppelFonds() {
    majLigneTfAppelFonds();
    if (afPieces.charges) appliquerPieceAppelFonds('charges');
  }

  function afDateFr(iso) { return iso ? formatDateFr(iso) : ''; }

  function majLigneChargesAppelFonds() {
    const piece = afPieces.charges;
    afLignes.debit = afLignes.debit.filter(l => l.id !== AF_ID_LIGNE_CHARGES);
    if (!piece || piece.erreur) return;
    const a = piece.analyse;
    const retenu = piece.horsFondsTravaux && a.fondsTravaux > 0 ? a.montantHorsFondsTravaux : a.montant;
    piece.retenu = retenu;
    const date = afValeur('af-date-rdv');
    piece.note = null;
    if (a.montant == null) piece.note = 'Montant de l’appel introuvable : saisissez la ligne à la main.';
    else if (!a.periode) piece.note = 'Période de l’appel introuvable (« Période du … au … ») : saisissez la ligne à la main.';
    else if (!date) piece.note = 'Date du rendez-vous nécessaire pour le prorata.';
    else {
      const ligne = ligneProrataCharges(retenu, a.periode, date);
      if (!ligne) piece.note = `Le rendez-vous (${afDateFr(date)}) n’est pas dans la période appelée (du ${afDateFr(a.periode.debut)} au ${afDateFr(a.periode.fin)}) : rien à répartir — demandez l’appel de la période du rendez-vous.`;
      else {
        afLignes.debit.push({ libelle: ligne.libelle, montant: ligne.montant, formule: null, id: AF_ID_LIGNE_CHARGES });
        piece.note = `Ligne ajoutée : ${formaterPrixCentimes(ligne.montant)} (${formaterPrixCentimes(retenu)} × ${ligne.detail.joursAcquereur} / ${ligne.detail.joursPeriode} jours).`;
        piece.ok = true;
      }
    }
  }

  function basculerHorsFondsTravauxCharges(cible, coche) {
    if (cible === 'prorata') {
      if (!prorataCharges) return;
      prorataCharges.horsFondsTravaux = !!coche;
      appliquerChargesProrata();
      return;
    }
    if (!afPieces.charges) return;
    afPieces.charges.horsFondsTravaux = !!coche;
    appliquerPieceAppelFonds('charges');
  }

  // Le fonds de travaux n'entre au décompte que si l'avant-contrat prévoit son remboursement par
  // l'acquéreur (règle détectée dans detecterFondsTravaux) : sans dossier, la ligne est posée mais
  // signalée « à confirmer ».
  function majLigneFondsTravauxAppelFonds() {
    const piece = afPieces.etatDate;
    if (!piece || piece.erreur) return;
    const a = piece.analyse;
    const d = afDossierLie ? dossiers.find(x => x.id === afDossierLie) : null;
    const regle = d && d.fondsTravaux && typeof d.fondsTravaux.rembourse === 'boolean' ? d.fondsTravaux.rembourse : null;
    const i = afLignes.debit.findIndex(l => RE_LIBELLE_FONDS_TRAVAUX_AF.test(l.libelle));
    piece.note = null; piece.ok = false;
    if (a.montant == null) { piece.note = 'Montant du fonds de travaux introuvable dans cette pièce.'; return; }
    if (a.absent) {
      if (i !== -1 && !(afLignes.debit[i].montant > 0)) { piece.ligne = { id: afLignes.debit[i].id, avant: 0, inseree: true }; afLignes.debit.splice(i, 1); }
      piece.note = 'L’état daté indique qu’il n’y a pas de fonds de travaux : aucune ligne.'; piece.ok = true;
      return;
    }
    if (regle === false) { piece.note = 'L’avant-contrat prévoit que l’acquéreur ne rembourse pas le fonds de travaux : aucune ligne ajoutée.'; piece.ok = true; return; }
    if (i !== -1) {
      piece.ligne = { id: afLignes.debit[i].id, avant: afLignes.debit[i].montant || 0, inseree: false };
      afLignes.debit[i].montant = a.montant;
    } else {
      const id = afIdLigne();
      afLignes.debit.push({ libelle: 'Remboursement du fonds de travaux (loi ALUR)', montant: a.montant, formule: null, id });
      piece.ligne = { id, avant: 0, inseree: true };
    }
    piece.ok = true;
    piece.note = regle === true
      ? `Ligne « Remboursement du fonds de travaux » : ${formaterPrixCentimes(a.montant)}, remboursement prévu par l’avant-contrat.`
      : `Ligne « Remboursement du fonds de travaux » : ${formaterPrixCentimes(a.montant)} — à confirmer : l’avant-contrat doit prévoir son remboursement par l’acquéreur.`;
  }

  // Sommes déjà versées à l'étude par le client : acompte sur prix (indemnité d'immobilisation,
  // dépôt de garantie, séquestre) et provision sur frais. Le relevé est la vérité comptable : il
  // REMPLACE le montant de la ligne d'acompte déjà déduite depuis le dossier (le dépôt de garantie
  // de l'avant-contrat et l'indemnité reçue sont la même somme — deux lignes la déduiraient deux
  // fois), et le dit quand les deux chiffres diffèrent.
  function majLignesAcomptesAppelFonds() {
    const piece = afPieces.releve;
    if (!piece || piece.erreur) return;
    const a = piece.analyse;
    piece.lignes = [];
    piece.notes = [];
    piece.ok = false;
    if (!a.ecritures.length) { piece.notes.push(a.titre ? 'Aucune écriture lue sur ce relevé.' : 'Ce document ne ressemble pas à un relevé de compte client (aucune écriture datée).'); return; }
    const poser = (re, libelle, montant, quoi) => {
      if (!(montant > 0)) return;
      const i = afLignes.credit.findIndex(l => re.test(l.libelle));
      if (i !== -1) {
        const avant = afLignes.credit[i].montant || 0;
        piece.lignes.push({ id: afLignes.credit[i].id, avant, inseree: false });
        afLignes.credit[i].montant = montant;
        if (avant > 0 && Math.abs(avant - montant) > 0.01) piece.notes.push(`${quoi} : ${formaterPrixCentimes(avant)} sur le dossier, ${formaterPrixCentimes(montant)} reçus d’après le relevé — le relevé est retenu.`);
      } else {
        const id = afIdLigne();
        afLignes.credit.push({ libelle, montant, formule: null, id });
        piece.lignes.push({ id, avant: 0, inseree: true });
      }
    };
    poser(RE_LIBELLE_ACOMPTE_PRIX, 'Acompte sur prix versé à l’étude', a.recu.prix, 'Acompte sur prix');
    poser(RE_LIBELLE_ACOMPTE_FRAIS, 'Acompte sur frais versé à l’étude', a.recu.frais, 'Acompte sur frais');
    piece.ok = a.recu.prix > 0 || a.recu.frais > 0;
    if (!piece.ok) piece.notes.push('Aucun versement du client reconnu (acompte sur prix ou provision sur frais).');
    if (a.recu.autre > 0) piece.notes.push(`${formaterPrixCentimes(a.recu.autre)} reçus sans nature reconnue (ni prix, ni frais) : non repris, à vérifier sur le relevé.`);
    const reverse = arrondiCentimes(a.reverse.prix + a.reverse.frais + a.reverse.autre);
    if (reverse > 0) piece.notes.push(`${formaterPrixCentimes(reverse)} reversés${a.tiers.length ? ' à ' + a.tiers.join(', ') : ''} : ces sommes ne sont plus détenues par l’étude (solde du compte : ${formaterPrixCentimes(a.solde || 0)}). Si le confrère reçoit l’acte, reprenez son décompte.`);
    if (a.ambigues > 0) piece.notes.push(`${a.ambigues} écriture(s) dont la colonne (débit ou crédit) n’a pas pu être lue avec certitude.`);
  }

  function renderBlocPieceAppelFonds(type) {
    renderTuilesPieces('af');
    const zone = afEl('af-' + type + '-bloc');
    if (!zone) return;
    const piece = afPieces[type];
    if (!piece) { zone.innerHTML = ''; return; }
    const croix = `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="effacerPieceAppelFonds('${type}')" title="Retirer la pièce" aria-label="Retirer la pièce">${icone('x')}</wa-button>`;
    if (piece.erreur) { zone.innerHTML = `<p class="hint tf-lu">${icone('alert-triangle')} ${escapeHtml(piece.fichier)} : ce PDF n’a pas pu être lu. ${croix}</p>`; return; }
    const a = piece.analyse;
    const ligneNote = (texte, ok) => texte ? `<p class="hint">${ok ? '' : icone('alert-triangle') + ' '}${escapeHtml(texte)}</p>` : '';
    let tete = '';
    let corps = '';
    if (type === 'charges') {
      const periode = a.periode ? ` du ${afDateFr(a.periode.debut)} au ${afDateFr(a.periode.fin)}` : '';
      tete = `${escapeHtml(piece.fichier)} : ${a.montant != null ? `<strong>${formaterPrixCentimes(a.montant)}</strong>${escapeHtml(periode)}` : 'montant introuvable'}`
        + (a.fondsTravaux > 0 ? ` · dont fonds de travaux ${escapeHtml(formaterPrixCentimes(a.fondsTravaux))}` : '');
      if (a.fondsTravaux > 0) corps += `<label class="tf-case"><input type="checkbox"${piece.horsFondsTravaux ? ' checked' : ''} onchange="basculerHorsFondsTravauxCharges('af', this.checked)"> Hors fonds de travaux ${infoBulle('La cotisation au fonds de travaux est attachée au lot : son remboursement est réglé par l’avant-contrat (état daté), pas par le prorata de charges.')}</label>`;
      corps += ligneNote(piece.note, piece.ok);
    } else if (type === 'etatDate') {
      tete = `${escapeHtml(piece.fichier)} : ` + (a.montant == null ? 'fonds de travaux introuvable'
        : a.absent ? 'pas de fonds de travaux'
        : `fonds de travaux attaché au lot <strong>${formaterPrixCentimes(a.montant)}</strong> (${escapeHtml(a.source)})`);
      if (a.cotisation) tete += ` · dernière cotisation ${escapeHtml(formaterPrixCentimes(a.cotisation))}`;
      corps += ligneNote(piece.note, piece.ok);
      const date = afValeur('af-date-rdv');
      if (a.dateSignature && date && a.dateSignature !== date) corps += ligneNote(`État daté établi pour une signature le ${afDateFr(a.dateSignature)}, le rendez-vous est le ${afDateFr(date)} : demandez sa mise à jour au syndic si l’écart compte.`, false);
    } else {
      const recu = [];
      if (a.recu.prix > 0) recu.push(`${formaterPrixCentimes(a.recu.prix)} sur le prix`);
      if (a.recu.frais > 0) recu.push(`${formaterPrixCentimes(a.recu.frais)} sur frais`);
      tete = `${escapeHtml(piece.fichier)} : ${recu.length ? 'reçu du client <strong>' + escapeHtml(recu.join(', ')) + '</strong>' : 'aucun versement du client lu'}`
        + (a.nature ? ` · ${escapeHtml(a.nature)}` : '');
      (piece.notes || []).forEach(n => { corps += ligneNote(n, false); });
    }
    zone.innerHTML = `<p class="hint tf-lu">${tete} ${croix}</p>${corps}`;
  }

  // ---- Glisser-déposer des pièces (Appel de fonds, Prorata — 30/09) ---------------------------
  // Une pièce déposée sur un bouton est lue comme cette pièce ; déposée ailleurs dans la zone, son
  // type est reconnu sur le haut de la page 1 comme pour un scan du copieur (typePieceScan).
  // Rôle de chaque type de pièce dans chaque outil, ou null s'il n'y sert pas. Pure.
  var PIECES_DEPOT_OUTILS = {
    af: { avisTaxeFonciere: 'tf', appelCharges: 'charges', etatDate: 'etatDate', releveCompte: 'releve' },
    prorata: { avisTaxeFonciere: 'tf', appelCharges: 'charges' }
  };
  function destinationPieceDeposee(outil, cleType) {
    const table = PIECES_DEPOT_OUTILS[outil];
    return (table && cleType && table[cleType]) || null;
  }

  // Haut de la page 1 d'un PDF déposé (OCR de la seule page 1 s'il n'a pas de texte).
  async function textePage1Depose(fichier) {
    const pdf = await pdfjsLib.getDocument({ data: await fichier.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);
    let texte = lignesDepuisItemsPdf((await page.getTextContent()).items).join('\n');
    if (texte.trim().length < 40) {
      const worker = await creerWorkerOcr();
      if (!worker) return texte;
      try { texte = await ocrPage(pdf, 1, worker); } finally { await worker.terminate(); }
    }
    return texte;
  }

  function zoneDepotPieces(e) { return e.currentTarget && e.currentTarget.classList ? e.currentTarget : null; }
  function survolDepotPieces(e) {
    e.preventDefault();
    const z = zoneDepotPieces(e);
    if (z) z.classList.add('survol');
  }
  function quitteDepotPieces(e) {
    const z = zoneDepotPieces(e);
    if (z && !(e.relatedTarget && z.contains(e.relatedTarget))) z.classList.remove('survol');
  }
  async function deposerPiecesOutil(e, outil) {
    e.preventDefault();
    const z = zoneDepotPieces(e);
    if (z) z.classList.remove('survol');
    const fichiers = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (!fichiers.length) return;
    if (typeof pdfjsLib === 'undefined') { afficherToast('Le lecteur PDF n\'est pas disponible.', 'OK', null); return; }
    const cible = e.target && e.target.closest ? e.target.closest('[data-piece]') : null;
    const imposee = cible && fichiers.length === 1 ? cible.getAttribute('data-piece') : null;
    for (const fichier of fichiers) {
      if (!/\.pdf$/i.test(fichier.name) && fichier.type !== 'application/pdf') {
        afficherToast(`${fichier.name} : seuls les PDF sont lus.`, 'OK', null);
        continue;
      }
      let role = imposee;
      if (!role) {
        let type = null;
        try { type = typePieceScan(enTeteScan(await textePage1Depose(fichier))); } catch (err) { console.error(err); }
        role = type ? destinationPieceDeposee(outil, type.cle) : null;
        if (!role) {
          afficherToast(type
            ? `${fichier.name} : ${type.label.toLowerCase()} — pièce non utilisée ici.`
            : `${fichier.name} : pièce non reconnue — déposez-la sur le bouton qui lui correspond.`, 'OK', null);
          continue;
        }
      }
      if (role === 'tf') await importerAvisTaxeFonciere(outil, fichier);
      else if (outil === 'prorata') { if (role === 'charges') await importerAppelChargesProrata(fichier); }
      else await importerPieceAppelFonds(role, fichier);
    }
  }

  // ---- Prorata : appel de charges (30/09) ------------------------------------------------------
  var prorataCharges = null;

  async function importerAppelChargesProrata(fichier) {
    if (!fichier) return;
    if (typeof pdfjsLib === 'undefined') { afficherToast('Le lecteur PDF n\'est pas disponible.', 'OK', null); return; }
    try {
      const lu = await lireTexteEtItemsPdf(fichier);
      prorataCharges = { fichier: fichier.name, analyse: analyserAppelCharges(lu.texte), horsFondsTravaux: true };
    } catch (e) {
      console.error(e);
      prorataCharges = { fichier: fichier.name, erreur: true };
    }
    renderBlocChargesProrata();
    appliquerChargesProrata();
  }

  function effacerChargesProrata() {
    prorataCharges = null;
    renderBlocChargesProrata();
  }

  function renderBlocChargesProrata() {
    renderTuilesPieces('prorata');
    const zone = document.getElementById('prorata-charges-bloc');
    if (!zone) return;
    const t = prorataCharges;
    if (!t) { zone.innerHTML = ''; return; }
    const croix = `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="effacerChargesProrata()" title="Retirer l'appel" aria-label="Retirer l'appel">${icone('x')}</wa-button>`;
    if (t.erreur) { zone.innerHTML = `<p class="hint tf-lu">${icone('alert-triangle')} ${escapeHtml(t.fichier)} : ce PDF n’a pas pu être lu. ${croix}</p>`; return; }
    const a = t.analyse;
    if (a.montant == null || !a.periode) {
      zone.innerHTML = `<p class="hint tf-lu">${icone('alert-triangle')} ${escapeHtml(t.fichier)} : ${a.montant == null ? 'montant de l’appel' : 'période'} introuvable — saisissez-les. ${croix}</p>`;
      return;
    }
    const retenu = t.horsFondsTravaux && a.fondsTravaux > 0 ? a.montantHorsFondsTravaux : a.montant;
    zone.innerHTML = `<p class="hint tf-lu">${escapeHtml(t.fichier)} : <strong>${formaterPrixCentimes(a.montant)}</strong> du ${escapeHtml(afDateFr(a.periode.debut))} au ${escapeHtml(afDateFr(a.periode.fin))}`
      + (a.fondsTravaux > 0 ? ` · dont fonds de travaux ${escapeHtml(formaterPrixCentimes(a.fondsTravaux))} · retenu <strong>${formaterPrixCentimes(retenu)}</strong>` : '')
      + ` ${croix}</p>`
      + (a.fondsTravaux > 0 ? `<label class="tf-case"><input type="checkbox"${t.horsFondsTravaux ? ' checked' : ''} onchange="basculerHorsFondsTravauxCharges('prorata', this.checked)"> Hors fonds de travaux ${infoBulle('La cotisation au fonds de travaux est attachée au lot : son remboursement est réglé par l’avant-contrat (état daté), pas par le prorata de charges.')}</label>` : '');
  }

  function appliquerChargesProrata() {
    const t = prorataCharges;
    if (!t || t.erreur) return;
    const a = t.analyse;
    if (a.montant == null || !a.periode) return;
    const retenu = t.horsFondsTravaux && a.fondsTravaux > 0 ? a.montantHorsFondsTravaux : a.montant;
    const montant = document.getElementById('prorata-montant');
    const periode = document.getElementById('prorata-periode');
    const debut = document.getElementById('prorata-debut');
    const fin = document.getElementById('prorata-fin');
    if (montant) montant.value = String(retenu);
    if (periode && ['annee', 'trimestre', 'mois'].includes(a.typePeriode)) periode.value = a.typePeriode;
    if (debut) debut.value = a.periode.debut;
    if (fin) fin.value = a.periode.fin;
    renderBlocChargesProrata();
    calculerProrataAffichage();
  }

  async function importerDecompteAppelFonds(fichier) {
    if (!fichier) return;
    if (typeof pdfjsLib === 'undefined') { afficherToast('Le lecteur PDF n\'est pas disponible.', 'OK', null); return; }
    afficherRapportAppelFonds('Lecture du PDF…', [], false);
    try {
      const buffer = await fichier.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      // Deux bugs se cumulaient ici. D'abord `lu.texte` : lireTextePdfVerification renvoie une
      // CHAÎNE, pas un objet — la propriété valait donc undefined et le parseur recevait une
      // chaîne vide, quel que soit le PDF. Ensuite, même corrigé, ce lecteur aplatit chaque page
      // en une seule ligne, alors qu'un décompte est un TABLEAU et que ce parseur travaille ligne
      // par ligne (voir lireTextePdfEnLignes pour le détail du piège).
      let texte = await lireTextePdfEnLignes(pdf);
      // Décompte scanné, sans texte extractible : repli sur la lecture OCR, dont la sortie est
      // naturellement découpée en lignes.
      if (texte.trim().length < 40) texte = await lireTextePdfVerification(pdf);
      appliquerDecompteAppelFonds(texte || '');
    } catch (e) {
      console.error(e);
      afficherRapportAppelFonds('Ce PDF n\'a pas pu être lu.', ['Collez son texte dans le champ ci-dessous.'], true);
    }
  }

  // --- décompte du confrère retrouvé sur le NAS (étude 05/10 : « quand on choisit le dossier pour faire l'appel de fonds,
  // récupère l'appel de fonds du confrère enregistré dans le dossier NAS ») ------------------------------------------------
  // Deux décomptes à ne JAMAIS confondre (étude 05/10) : celui du confrère, qu'il nous envoie et qui sert à compléter le nôtre,
  // « souvent enregistré dans un dossier Projet VENTE confrère » ; et celui de l'étude, mis en forme et envoyé au client,
  // enregistré à la RACINE du dossier — c'est lui qui est rattaché à « Envoi appel de fonds » (courrierAppelFondsDossier).
  // Ici, seul celui du confrère : jamais un PDF de la racine, jamais le courrier rattaché, jamais le courrier produit par
  // CLAIRE. En participation seulement (décompte « confrère »). Candidats, dans l'ordre : les PDF d'un sous-dossier qui nomme
  // le confrère (« Projet VENTE confrère ») — ceux dont le nom dit décompte / appel de fonds d'abord —, puis, dans les autres
  // sous-dossiers, les PDF dont le nom le dit ; le plus récent d'abord. Le premier dont le tableau se lit remplace le décompte.
  // RE_NOM_COURRIER_CLAIRE_APPEL_FONDS et nomDitDecompteConfrere : commun/decompte.js (même règle que la fiche et le serveur).
  var RE_DOSSIER_CONFRERE = /confrer/;
  var MAX_CANDIDATS_DECOMPTE_NAS = 6;
  var afRechercheDecompteNas = 0;
  // Pure.
  function candidatsDecompteConfrereNas(fichiers, rattache) {
    const nom = f => normaliserNomPourMotif(String(f.nom || ''));
    const dansDossierConfrere = f => segmentsDossier(f.chemin).some(seg => RE_DOSSIER_CONFRERE.test(normaliserPourRecherche(seg)));
    const ditDecompte = f => RE_NOM_DECOMPTE.test(nom(f)) && !RE_NOM_DECOMPTE_EXCLU.test(nom(f));
    const rang = f => (dansDossierConfrere(f) || nomDitDecompteConfrere(f.nom) ? 0 : 2) + (ditDecompte(f) ? 0 : 1);
    return (fichiers || [])
      .filter(f => f && f.chemin && /\.pdf$/i.test(String(f.nom || f.chemin)))
      // Jamais un PDF de la racine (le décompte de l'étude) — sauf s'il dit lui-même qu'il vient du confrère (étude 06/10).
      .filter(f => (segmentsDossier(f.chemin).length > 0 || nomDitDecompteConfrere(f.nom)) && f.chemin !== rattache && !RE_NOM_COURRIER_CLAIRE_APPEL_FONDS.test(nom(f)))
      .filter(f => dansDossierConfrere(f) || ditDecompte(f) || nomDitDecompteConfrere(f.nom))
      .sort((a, b) => rang(a) - rang(b)
        || (anneeDansNomFichier(b.nom) || 0) - (anneeDansNomFichier(a.nom) || 0)
        || String(b.modifie || '').localeCompare(String(a.modifie || '')));
  }

  // --- pièces du dossier lues seules sur le NAS (étude 06/10 : « avec l'ensemble des données recueillies durant la vie du
  // dossier, le décompte se remplit tout seul ») ------------------------------------------------------------------------
  // Quand l'office établit le décompte : l'avis de taxe foncière (prorata du jour de l'acte au 31/12) et, en copropriété,
  // l'état daté (remboursement du fonds de travaux) — le fichier que la checklist a déjà retrouvé, sinon le plus récent dont
  // le NOM dit la pièce. Lus comme une pièce déposée à la main (mêmes lecteurs, même bloc) ; jamais par-dessus une pièce
  // déposée, jamais pour un autre dossier que celui choisi entre-temps.
  var afRecherchePiecesNas = 0;
  // Pure : le fichier du dossier à lire pour la pièce `cle` — chemin depuis la racine du NAS, ou null.
  function fichierPieceNasAppelFonds(d, fichiers, cle, motif) {
    const memorise = fichierTrouve(d, cle);
    if (memorise) return { chemin: memorise, nom: String(memorise).split(/[\\/]/).pop() };
    const candidats = (fichiers || []).filter(f => f && f.chemin && /\.pdf$/i.test(String(f.nom || ''))
      && motif && motif.test(normaliserNomPourMotif(String(f.nom || ''))))
      .sort((a, b) => (anneeDansNomFichier(b.nom) || 0) - (anneeDansNomFichier(a.nom) || 0) || String(b.modifie || '').localeCompare(String(a.modifie || '')));
    return candidats.length ? { chemin: cheminNasComplet(d, candidats[0].chemin), nom: candidats[0].nom } : null;
  }
  function motifPieceChecklist(d, cle) {
    const piece = checklistPieces(d.typeVente, d).find(p => p.cle === cle);
    return piece && piece.motifNom ? piece.motifNom : null;
  }
  async function fichierNasPourLecture(chemin, nom) {
    const r = await fetchAvecAuth('/api/nas/fichier?chemin=' + encodeURIComponent(chemin));
    if (!r.ok) throw new Error(`Lecture impossible (${r.status})`);
    return new File([await r.blob()], nom || 'piece.pdf', { type: 'application/pdf' });
  }
  function ajouterRecapAppelFonds(texte) {
    const recap = afEl('af-recap-prefill');
    if (!recap) return;
    let liste = recap.querySelector('.af-recap-bloc ul:not(.af-recap-manquant)');
    if (!liste) {
      recap.insertAdjacentHTML('afterbegin', '<div class="af-recap-bloc"><div class="af-recap-titre">Repris du dossier</div><ul></ul></div>');
      liste = recap.querySelector('.af-recap-bloc ul');
    }
    liste.insertAdjacentHTML('beforeend', `<li>${escapeHtml(texte)}</li>`);
  }

  async function reprendrePiecesNasAppelFonds(d) {
    if (!d || !d.dossierLie || !d.nasDossier || !nasDisponible() || typeof pdfjsLib === 'undefined') return;
    const jeton = ++afRecherchePiecesNas;
    const toujoursLa = () => jeton === afRecherchePiecesNas && afDossierLie === d.id;
    let fichiers = [];
    try { fichiers = await listerFichiersNas(d); } catch (e) { return; }
    if (!toujoursLa()) return;
    const tf = !tfAvis.af ? fichierPieceNasAppelFonds(d, fichiers, 'avisTaxeFonciere', motifPieceChecklist(d, 'avisTaxeFonciere')) : null;
    if (tf) {
      try {
        const fichier = await fichierNasPourLecture(tf.chemin, tf.nom);
        if (!toujoursLa() || tfAvis.af) return;
        await importerAvisTaxeFonciere('af', fichier);
        if (toujoursLa()) ajouterRecapAppelFonds(`Avis de taxe foncière lu sur le NAS : « ${tf.nom} »`);
      } catch (e) { /* pièce suivante */ }
    }
    if (d.typeVente !== 'copropriete' || !toujoursLa() || afPieces.etatDate) return;
    const ed = fichierPieceNasAppelFonds(d, fichiers, 'etatDate', motifPieceChecklist(d, 'etatDate'));
    if (!ed) return;
    try {
      const fichier = await fichierNasPourLecture(ed.chemin, ed.nom);
      if (!toujoursLa() || afPieces.etatDate) return;
      await importerPieceAppelFonds('etatDate', fichier);
      if (toujoursLa()) ajouterRecapAppelFonds(`État daté lu sur le NAS : « ${ed.nom} »`);
    } catch (e) { /* rien de plus à lire */ }
  }

  async function reprendreDecompteConfrereNas(d) {
    if (!d || !d.dossierLie || !d.nasDossier || !nasDisponible() || typeof pdfjsLib === 'undefined') return;
    const jeton = ++afRechercheDecompteNas;
    const toujoursLa = () => jeton === afRechercheDecompteNas && afDossierLie === d.id;
    afficherRapportAppelFonds('Recherche de l’appel de fonds du confrère dans le dossier du NAS…', [], false);
    try {
      const candidats = candidatsDecompteConfrereNas(await listerFichiersNas(d), courrierAppelFondsDossier(d)).slice(0, MAX_CANDIDATS_DECOMPTE_NAS);
      for (const f of candidats) {
        if (!toujoursLa()) return;
        let texte = '';
        try {
          const pdf = await ouvrirPdfNas(cheminNasComplet(d, f.chemin));
          if (pdf.numPages > 6) continue;
          texte = await lireTextePdfEnLignes(pdf);
        } catch (e) { continue; }
        const res = parserDecompteConfrere(texte);
        if (!(res.lignes.debit.length + res.lignes.credit.length)) continue;
        if (!toujoursLa()) return;
        appliquerDecompteAppelFonds(texte, `Appel de fonds du confrère repris du dossier du NAS : « ${f.nom} ».`);
        return;
      }
      if (toujoursLa()) {
        afficherRapportAppelFonds(candidats.length
          ? 'Appel de fonds du confrère trouvé sur le NAS, mais son tableau n’a pas pu être lu.'
          : 'Aucun appel de fonds du confrère dans le dossier du NAS.',
        [candidats.length ? `Fichier(s) essayé(s) : ${candidats.map(f => f.nom).join(', ')}.` : 'Cherché : le dossier « Projet VENTE confrère » (ou un sous-dossier qui nomme le confrère), puis un PDF de sous-dossier dont le nom dit « appel de fonds » ou « décompte » — jamais le décompte de l’étude, à la racine.', 'Déposez son PDF ou collez son texte ci-dessous.'], true);
      }
    } catch (e) {
      if (toujoursLa()) afficherRapportAppelFonds('Dossier du NAS illisible : appel de fonds du confrère non repris.', ['Déposez son PDF ou collez son texte ci-dessous.'], true);
    }
  }

  function importerDecompteColle() {
    const zone = afEl('af-coller-texte');
    if (!zone) return;
    appliquerDecompteAppelFonds(zone.value || '');
  }

  // Reprend le rendez-vous lu dans le document, SANS jamais écraser ce qui est déjà saisi — même
  // règle que la référence de dossier juste en dessous, et que tout le reste de l'outil. Une date
  // déjà saisie qui diffère de celle du document n'est donc pas corrigée en silence : elle est
  // signalée, comme le solde déclaré par le confrère. Renvoie les notes à joindre au rapport.
  function appliquerRendezVousDetecte(texte) {
    const rdv = detecterRendezVousDecompte(texte);
    if (!rdv.date) return [];
    const notes = [];
    const champD = afEl('af-date-rdv');
    const champH = afEl('af-heure-rdv');
    const repris = [];
    // Une date saisie qui diffère de celle du document n'est pas corrigée en silence : elle est
    // signalée. Et dans ce cas l'heure n'est PAS reprise non plus — elle se rapporte au jour du
    // document, la coller sur un autre jour marierait une heure à une date qui n'est pas la
    // sienne (le défaut même qu'afZoneHeureAutourDate écarte à la lecture).
    const memeJour = champD && champD.value === rdv.date;
    const dateDiverge = champD && champD.value && !memeJour;
    if (champD && !champD.value) { champD.value = rdv.date; repris.push('la date'); }
    else if (dateDiverge) {
      notes.push(`Le document annonce un rendez-vous le ${formatDateFr(rdv.date)}, alors que la date saisie est le ${formatDateFr(champD.value)} : à vérifier.`);
    }
    if (rdv.heure && champH && !champH.value && !dateDiverge) { champH.value = rdv.heure; repris.push('l’heure'); }
    if (repris.length) {
      notes.push(`Rendez-vous repris du document (${repris.join(' et ')}) : ${phraseRdvAppelFonds(afValeur('af-date-rdv'), afValeur('af-heure-rdv'), '')} — à vérifier.`);
      majApercuAppelFonds();
    }
    return notes;
  }

  // Les lignes du confrère REMPLACENT le tableau : mélanger son décompte avec celui déduit du
  // dossier ferait compter deux fois le prix ou les frais.
  // `source` (facultatif) : d'où vient le texte, dit en tête du rapport (décompte repris du NAS).
  function appliquerDecompteAppelFonds(texte, source) {
    const res = parserDecompteConfrere(texte);
    const total = res.lignes.debit.length + res.lignes.credit.length;
    // Le rendez-vous est cherché AVANT le retour sur décompte vide : une convocation dont le
    // tableau n'a pas été reconnu porte quand même le jour et l'heure, et c'est déjà ça de pris.
    const notesRdv = appliquerRendezVousDetecte(texte);
    if (!total) {
      afficherRapportAppelFonds('Aucune ligne de décompte reconnue dans ce document.',
        res.meta.avertissements.concat(notesRdv), true);
      return;
    }
    afLignes = res.lignes;
    renderTableAppelFonds();
    const notes = res.meta.avertissements.concat(notesRdv);
    if (res.meta.refTrouvee) {
      const champ = afEl('af-ref');
      if (champ && !champ.value) { champ.value = res.meta.refTrouvee; majApercuAppelFonds(); }
    }
    // Le solde annoncé par le confrère sert de CONTRÔLE, jamais de valeur reprise : s'il diffère
    // du recalcul, c'est une ligne mal lue — le dire plutôt que de recopier son chiffre.
    if (res.meta.soldeDeclare != null) {
      const somme = (s) => res.lignes[s].reduce((t, l) => t + (l.memoire ? 0 : (l.montant || 0)), 0);
      const recalcul = somme('debit') - somme('credit');
      if (Math.abs(recalcul - res.meta.soldeDeclare) > 0.02) {
        notes.push(`Le solde annoncé par le confrère (${montantVersTexteFr(res.meta.soldeDeclare)}) ne correspond pas au recalcul (${montantVersTexteFr(recalcul)}) : une ligne a probablement été mal lue.`);
      }
    }
    // Le contrôle du barème a besoin du département et de la nature du bien, qu'un décompte ou une
    // convocation ne portent presque jamais (ils décrivent une somme à virer, pas le bien). Sans
    // eux il se tait — et se taire sans rien dire laisse croire que la ligne a été vérifiée et
    // jugée conforme. On le dit donc, mais seulement quand il y a bien une ligne à contrôler.
    if (!fourchetteFraisActeFormulaire() && afLignes.debit.some(l => !l.memoire && estLigneFraisActeVente(l.libelle))) {
      notes.push('Les frais d’acte n’ont pas été contrôlés : renseignez l’adresse du bien et sa désignation (ou directement le département et la nature du bien, juste sous le tableau).');
    }
    afficherRapportAppelFonds(`${total} ligne(s) reprises du décompte.`, (source ? [source] : []).concat(notes), notes.length > 0);
  }

  function afficherRapportAppelFonds(titre, notes, alerte) {
    const cible = afEl('af-rapport-parse');
    if (!cible) return;
    cible.className = 'af-rapport af-rapport-visible ' + (alerte ? 'af-rapport-alerte' : 'af-rapport-ok');
    cible.innerHTML = `<strong>${escapeHtml(titre)}</strong>` +
      ((notes && notes.length) ? `<ul>${notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : '');
  }

  // --- modèle Word, chargé à la demande ---------------------------------------------------------
  //
  // Le modèle (≈350 Ko) et les deux bibliothèques ne servent qu'à cet écran : les charger dans
  // index.html ralentirait CHAQUE ouverture de CLAIRE pour rien.
  function afChargerScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Chargement impossible : ' + src));
      document.head.appendChild(s);
    });
  }

  function chargerModeleAppelFonds() {
    if (afModeleCharge) return Promise.resolve();
    if (afModeleEnCours) return afModeleEnCours;
    afModeleEnCours = (async () => {
      if (!window.APPEL_FONDS_MODELE) await afChargerScript('appel-de-fonds-modele.js');
      // Les logos sont posés DÈS QUE le modèle est là, avant les deux bibliothèques : celles-ci
      // viennent d'un CDN, et un poste sans accès internet afficherait sinon un aperçu sans
      // en-tête alors que les images, elles, sont servies par le serveur de l'étude.
      appliquerImagesAppelFonds();
      if (!window.PizZip) await afChargerScript('https://cdn.jsdelivr.net/npm/pizzip@3/dist/pizzip.js');
      if (!window.docxtemplater) await afChargerScript('https://cdn.jsdelivr.net/npm/docxtemplater@3/build/docxtemplater.js');
      afModeleCharge = true;
    })();
    afModeleEnCours.catch(() => { afModeleEnCours = null; });
    return afModeleEnCours;
  }

  // Les logos de l'en-tête viennent du même fichier que le modèle Word : l'aperçu n'a donc ses
  // images qu'une fois ce fichier chargé. Sans lui, la mise en page tient quand même (les <img>
  // restent vides), ce qui vaut mieux qu'un aperçu qui refuse de s'afficher.
  function appliquerImagesAppelFonds() {
    const a = window.APPEL_FONDS_MODELE && window.APPEL_FONDS_MODELE.assets;
    if (!a) return;
    const poser = (id, src) => { const e = afEl(id); if (e && src) e.src = src; };
    poser('af-logo-notaires', a.logoNotaires);
    poser('af-logo-office', a.logoOffice);
    poser('af-icone-visio', a.iconVisio);
    poser('af-icone-facebook', a.iconFacebook);
    poser('af-icone-instagram', a.iconInstagram);
  }

  // Mention du mode d'envoi. Elle REMPLACE l'adresse postale du destinataire tant qu'aucune
  // adresse n'est saisie ; dès qu'une adresse l'est, c'est elle qui s'affiche et la mention
  // disparaît (une adresse postale et « envoi par e-mail uniquement » se contrediraient).
  // Éditable dans l'aperçu comme le reste du courrier ; dans le .docx elle a son propre champ `mention`,
  // en italique sous l'adresse (étude 06/10 — avant, elle était la dernière ligne d'`addrLines`).
  // Elle vit dans son PROPRE élément, hors de #af-p-adresse : majApercuAppelFonds() réécrit ce
  // dernier en entier à chaque frappe, une mention placée dedans serait effacée à la saisie
  // suivante.
  var MENTION_ENVOI_APPEL_FONDS = "Envoi par e-mail uniquement";

  // Les retours à la ligne du courrier sont dans le modèle Word lui-même (étude 06/10 : une ligne vide avant l'adresse, cinq
  // retours sous l'adresse et la mention, deux sous le lieu et la date) : les données ne portent plus aucun retour d'aération.
  function composerAdresseCourrier(lignesAdresse) {
    const lignes = [];
    String(lignesAdresse || '').split('\n').forEach(l => { if (l.trim()) lignes.push(l.trim()); });
    return lignes.join('\n');
  }

  // Pure : un courrier gardé avant le 06/10 portait la mention en dernière ligne d'`addrLines` et cinq retours derrière ;
  // le modèle Word d'aujourd'hui les pose lui-même — on les retire des données pour que « Télécharger » refasse le même courrier.
  function normaliserDonneesCourrierAppelFonds(donnees) {
    const d = Object.assign({}, donnees || {});
    if (d.mention !== undefined) return d;
    const lignes = String(d.addrLines || '').replace(/\n+$/, '').split('\n');
    const derniere = (lignes[lignes.length - 1] || '').trim();
    d.mention = derniere.toLowerCase() === MENTION_ENVOI_APPEL_FONDS.toLowerCase() ? lignes.pop().trim() : '';
    d.addrLines = lignes.join('\n');
    return d;
  }

  // Relit le courrier TEL QU'IL EST AFFICHÉ (et non le modèle interne) : une correction faite
  // directement dans l'aperçu doit se retrouver dans le .docx.

  function donneesCourrierAppelFonds() {
    const lire = (id) => { const e = afEl(id); return e ? e.textContent.trim() : ''; };
    const mentionAffichee = () => { const e = afEl('af-p-mention-ligne'); return !!e && e.style.display !== 'none'; };
    const lignes = (id) => {
      const tbody = afEl(id);
      if (!tbody) return [];
      return [...tbody.querySelectorAll('tr')].map(tr => {
        if (tr.classList.contains('af-sous-total')) return null;
        const champs = tr.querySelectorAll('.af-champ');
        if (champs.length < 2) return null;
        const formule = tr.querySelector('.af-formule');
        return { label: champs[0].textContent.trim(), formula: formule ? formule.textContent.trim() : undefined, amount: champs[1].textContent.trim() };
      }).filter(Boolean);
    };
    const sousTotal = (id, colonne) => {
      const tr = afEl(id) && afEl(id).querySelector('tr.af-sous-total');
      if (!tr) return '';
      const c = tr.querySelectorAll('td')[colonne];
      return c ? c.textContent.trim() : '';
    };
    const blocAdresse = afEl('af-p-adresse');
    return {
      ref: afValeur('af-ref'),
      addrLines: composerAdresseCourrier(blocAdresse ? blocAdresse.innerHTML.split('<br>').map(s => s.replace(/<[^>]+>/g, '').trim()).filter(Boolean).join('\n') : ''),
      mention: mentionAffichee() ? lire('af-p-mention') : '',
      ville: lire('af-p-ville'),
      dateLettre: lire('af-p-datelettre'),
      salut1: lire('af-p-salut1'),
      designation: lire('af-p-designation'),
      adresseBien: lire('af-p-adressebien'),
      rdvPhrase: lire('af-p-rdv'),
      debitRows: lignes('af-tbody-debit'),
      totalDebit: sousTotal('af-tbody-debit', 2),
      creditRows: lignes('af-tbody-credit'),
      totalCredit: sousTotal('af-tbody-credit', 1),
      solde: lire('af-p-solde'),
      salut2: lire('af-p-salut2'),
      phraseDeblocage: lire('af-p-deblocage'),
      notaire: lire('af-p-notaire')
    };
  }

  function afBase64VersOctets(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  // Génère le .docx du courrier et renvoie { blob, nom, donnees } — partagé par le téléchargement, la
  // création d'un brouillon Outlook (pièce jointe) et l'historique (`donnees` et `nom` d'un courrier gardé :
  // le même .docx refait). Lève si les bibliothèques ne sont pas chargées.
  async function genererBlobAppelFonds(donneesGardees, nomGarde) {
    await chargerModeleAppelFonds();
    const Ctor = window.docxtemplater.default || window.docxtemplater;
    const zip = new window.PizZip(afBase64VersOctets(window.APPEL_FONDS_MODELE.docxB64));
    const doc = new Ctor(zip, { paragraphLoop: true, linebreaks: true });
    const donnees = normaliserDonneesCourrierAppelFonds(donneesGardees || donneesCourrierAppelFonds());
    doc.render(donnees);
    const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return { blob, nom: nomGarde || afNomFichierDocx(afClients.filter(c => String(c.nom || '').trim())), donnees };
  }

  async function telechargerAppelFondsDocx(btn) {
    const libelleInitial = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Génération…'; }
    try {
      const { blob, nom, donnees } = await genererBlobAppelFonds();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nom;
      a.click();
      ouvrirApresTelechargement(nom);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      enregistrerAppelFondsHistorique('telecharge', nom, donnees);
    } catch (e) {
      console.error(e);
      afficherToast('Le courrier n\'a pas pu être généré. Vérifiez que le poste a accès au réseau la première fois (deux bibliothèques sont téléchargées une seule fois).', 'OK', null);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = libelleInitial; }
    }
  }

  // Prépare l'email du courrier d'appel de fonds, le .docx DÉJÀ joint (ce qu'un mailto: ne sait pas
  // faire), au destinataire du dossier relié : le client, ou le confrère quand un autre office
  // représente l'acquéreur (formules adaptées, voir livrerEmailDossier). En mode messagerie par
  // défaut, le .docx est téléchargé à côté, à joindre à la main.
  async function preparerEmailAppelFonds(btn) {
    const d = afDossierLie ? dossiers.find(x => x.id === afDossierLie) : null;
    const destinataire = d ? emailDestinataireRelance(d) : '';
    if (!destinataire) {
      afficherToast("Reliez un dossier dont l'email du destinataire est renseigné pour préparer l'email.", 'OK', null);
      return;
    }
    const libelleInitial = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Préparation…'; }
    try {
      const { blob, nom, donnees } = await genererBlobAppelFonds();
      const contenuBase64 = await blobVersBase64(blob);
      const confrere = notaireParticipantRepresenteAcquereur(d);
      const r = await livrerEmailDossier({
        destinataire,
        confrere,
        responsableSignature: d.responsable,
        dossierId: d.id, geste: 'appelFonds',
        ...emailDepuisModele('appelFonds', d),
        pieces: [{ nom, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', contenuBase64 }]
      });
      if (!r.ok) { if (!r.annule) afficherToast(r.message || "L'email n'a pas pu être préparé.", 'OK', null); return; }
      if (r.mode === 'mailto') telechargerFichier(blob, nom);
      enregistrerAppelFondsHistorique(r.mode === 'envoye' ? 'envoye' : 'prepare', nom, donnees);
      ajouterHistorique(d, r.mode === 'envoye' ? 'Email du courrier d’appel de fonds envoyé' : 'Email du courrier d’appel de fonds préparé');
      // L'échéance « Envoi appel de fonds » se coche comme celle du projet quand son email part de CLAIRE (audit 07/10 : la
      // tâche d'« À faire » et le rappel restaient dus après l'envoi) — même chemin que « Déjà envoyé », agenda compris.
      if (!echeanceValidee(d, 'appelFonds')) marquerEnvoiAujourdhui(d.id, 'appelFonds');
      else sauvegarder(d);
      annoncerEmailPret(r, false, r.mode === 'mailto' ? 'Joignez le courrier, qui vient d’être téléchargé.' : '');
    } catch (e) {
      console.error(e);
      afficherToast('Le courrier n\'a pas pu être généré (accès réseau requis la première fois).', 'OK', null);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = libelleInitial; }
    }
  }

  function reinitialiserAppelFonds() {
    afDossierLie = null;
    afHistoriqueId = null;
    afHistoriqueNom = '';
    afRechercheDecompteNas++;
    afRecherchePiecesNas++;
    afFraisChoisiALaMain = { departement: false, type: false };
    afClients = [{ civilite: 'M', prenom: '', nom: '' }];
    afSituation = '';
    const champSituation = afEl('af-situation');
    if (champSituation) champSituation.value = '';
    afLignes = lignesDecompteDepuisPrefill(null);
    tfAvis.af = null;
    renderBlocTaxeFonciere('af');
    ['charges', 'etatDate', 'releve'].forEach(type => { afPieces[type] = null; renderBlocPieceAppelFonds(type); });
    definirModeDecompteAppelFonds('office');
    ['af-ref', 'af-designation', 'af-adresse-bien', 'af-adresse-clients', 'af-date-rdv', 'af-heure-rdv', 'af-lieu-autre', 'af-coller-texte', 'af-frais-departement', 'af-frais-type', 'af-prix-mobilier'].forEach(id => {
      const e = afEl(id);
      if (e) e.value = '';
    });
    const casePret = afEl('af-pret-hypothecaire');
    if (casePret) casePret.checked = false;
    const caseSansPret = afEl('af-sans-pret');
    if (caseSansPret) caseSansPret.checked = false;
    const lieu = afEl('af-lieu');
    if (lieu) lieu.value = "en l'étude";
    const mention = afEl('af-p-mention');
    if (mention) mention.textContent = MENTION_ENVOI_APPEL_FONDS;
    majSourceAdresseBien(false);
    renderSuggestionsAdresseBien([]);
    const rapport = afEl('af-rapport-parse');
    if (rapport) { rapport.className = 'af-rapport'; rapport.innerHTML = ''; }
    const recap = afEl('af-recap-prefill');
    if (recap) { recap.className = 'af-recap'; recap.innerHTML = ''; }
    renderPillDossierAppelFonds();
    renderClientsAppelFonds();
    renderTableAppelFonds();
    majLieuAppelFonds();
  }

  var appelFondsInitialise = false;
  function initAppelFonds() {
    // Le modèle est chargé dès l'arrivée sur l'onglet (et non au clic sur « Télécharger ») : les
    // logos de l'en-tête en viennent aussi, l'aperçu serait sinon sans images jusqu'au premier
    // téléchargement. Un échec de chargement est silencieux ici — la mise en page tient sans les
    // images, et le message d'erreur a sa place au moment où on demande vraiment le fichier.
    chargerModeleAppelFonds().catch(() => {});
    chargerAppelsFondsHistorique(true);
    if (appelFondsInitialise) return;
    appelFondsInitialise = true;
    const dateLettre = afEl('af-date-lettre');
    if (dateLettre && !dateLettre.value) dateLettre.value = new Date().toISOString().slice(0, 10);
    afLignes = lignesDecompteDepuisPrefill(null);
    renderClientsAppelFonds();
    renderTableAppelFonds();
    majApercuAppelFonds();
  }

  // ==== EXTRACTION STRUCTURÉE : dates métier ====
  //
  // Un compromis contient des dizaines de dates (naissance, diagnostics, titres antérieurs,
  // assemblées générales…). La spec l'énonce clairement : il est interdit de prendre « la première »
  // ou « la dernière » — chaque date doit être classée par sa FONCTION juridique, et l'outil doit
  // pouvoir dire d'où il tient celle qu'il retient.

  // Correspondance avec les trois champs d'échéance existants de la fiche : le vocabulaire interne
  // change, le modèle de données du dossier ne bouge pas.
  var CHAMP_PAR_TYPE_DATE = {
    BUTOIR_PRET: 'pret',
    REITERATION_ACTE: 'acte',
    BUTOIR_VENTE_PREALABLE: 'ventebien'
  };

  function uniteDelai(mot) {
    return /mois/i.test(String(mot || '')) ? 'mois' : 'jours';
  }

  // Les actes écrivent les durées courtes en toutes lettres au moins aussi souvent qu'en chiffres
  // (« dans les trois mois de la signature ») : ne reconnaître que les chiffres laissait ces
  // clauses totalement invisibles.
  var NOMBRES_EN_LETTRES = {
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
    dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40,
    cinquante: 50, soixante: 60, 'quatre-vingts': 80, 'quatre-vingt': 80, 'quatre-vingt-dix': 90, cent: 100
  };

  // Fragment réutilisé par tous les motifs de délai : un nombre en chiffres OU en lettres. Trié par
  // longueur décroissante pour que « quatre-vingt-dix » l'emporte sur « quatre ».
  var MOTIF_NOMBRE = '(\\d{1,3}|' + Object.keys(NOMBRES_EN_LETTRES).sort((a, b) => b.length - a.length).join('|') + ')';

  function valeurNombre(mot) {
    const brut = String(mot || '').trim().toLowerCase();
    if (/^\d+$/.test(brut)) return parseInt(brut, 10);
    return Object.prototype.hasOwnProperty.call(NOMBRES_EN_LETTRES, brut) ? NOMBRES_EN_LETTRES[brut] : NaN;
  }

  // Points de départ d'un délai rencontrés dans les actes. SEULE la signature a une base connue de
  // l'outil (la date du compromis) : un délai « à compter de la notification du refus » ou « de la
  // réalisation de la condition suspensive » dépend d'un événement dont la date n'est pas dans
  // l'acte — la spec interdit explicitement de supposer que tout délai part de la signature.
  var POINTS_DEPART_CONNUS = [
    // Les formes nues (« du compromis », « de signature », sans article) sont acceptées au même
    // titre que les formes complètes : le connecteur du délai consomme souvent l'article.
    { cle: 'signature', calculable: true, re: /\bsignature\b|\bpr[ée]sentes\b|ce\s+jour|l['’]acte|la\s+pr[ée]sente\b|le\s+pr[ée]sent\s+(?:compromis|acte)|\bpromesse\b|\bcompromis\b|avant[-\s]?contrat/i },
    { cle: 'notification', calculable: false, re: /notification|r[ée]ception\s+(?:de\s+la\s+lettre|du\s+courrier|de\s+l['’]avis)/i },
    { cle: 'realisation_condition', calculable: false, re: /r[ée]alisation\s+de\s+(?:la|cette|ladite)\s+condition|lev[ée]e\s+de\s+(?:la|cette|ladite)\s+condition|obtention\s+(?:du\s+pr[êe]t|des\s+offres)/i },
    { cle: 'purge_preemption', calculable: false, re: /purge|droit\s+de\s+pr[ée]emption/i }
  ];

  // Le texte examiné est la clause de délai ENTIÈRE (« … dans les 60 jours de la promesse »), pas
  // seulement ce qui suit le connecteur : celui-ci consomme justement l'article dont les motifs
  // ci-dessus ont besoin (« de la » avalait le « la » de « la promesse », « à compter des »
  // le « des » de « des présentes ») — le point de départ retombait alors sur « inconnu » et la
  // date n'était plus calculée, alors que c'est bien la signature de l'acte importé.
  // Quand plusieurs points de départ matchent (« dans les 60 jours de la réalisation de la
  // condition prévue au présent compromis »), c'est le PREMIER rencontré qui décide : c'est celui
  // que le connecteur introduit, le reste n'est qu'un complément de la même phrase.
  function pointDepartDepuisAncre(ancre) {
    const texte = String(ancre || '');
    if (!texte.trim()) return null;
    let meilleur = null;
    for (const point of POINTS_DEPART_CONNUS) {
      const m = new RegExp(point.re.source, 'i').exec(texte);
      if (m && (meilleur === null || m.index < meilleur.index)) meilleur = { index: m.index, cle: point.cle };
    }
    return meilleur ? meilleur.cle : 'inconnu';
  }

  // Libellé affiché dans le panneau de révision. Écrire « depuis la signature » quel que soit le
  // point de départ réel était contradictoire avec la raison affichée juste en dessous (« son
  // point de départ n'est pas une date figurant dans l'acte ») — signalé par l'étude.
  var LIBELLES_POINT_DEPART = {
    signature: 'depuis la signature de l’avant-contrat',
    notification: 'à compter d’une notification (date non connue de l’acte)',
    realisation_condition: 'à compter de la réalisation d’une condition (date non connue de l’acte)',
    purge_preemption: 'à compter de la purge du droit de préemption (date non connue de l’acte)',
    inconnu: 'à compter d’un point de départ non identifié'
  };

  function libellePointDepart(cle) {
    return LIBELLES_POINT_DEPART[cle] || LIBELLES_POINT_DEPART.inconnu;
  }

  function pointDepartCalculable(cle) {
    const trouve = POINTS_DEPART_CONNUS.find(p => p.cle === cle);
    return !!(trouve && trouve.calculable);
  }

  // Repère TOUS les délais du texte, y compris ceux que detecterDatesDepuisTexte ne peut pas
  // convertir en date (point de départ autre que la signature). Ne calcule rien : c'est
  // construireDatesMetier qui décide, et NEEDS_REVIEW est un résultat légitime.
  // Le connecteur qui introduit le point de départ ne se limite pas à « à compter de » : « dans les
  // deux mois DE LA réalisation de la condition » est tout aussi courant.
  var MOTIF_ANCRE_DELAI = '(?:[àa]\\s+compter\\s+d[eu]|[àa]\\s+partir\\s+d[eu]|apr[èe]s|suivant|de\\s+la|de\\s+l[\'’]|du|des)';

  var RE_DELAI_GENERIQUE = new RegExp(
    '(?:d[ée]lai\\s+de\\s+|au\\s+plus\\s+tard\\s+(?:dans\\s+(?:les?\\s+|un\\s+d[ée]lai\\s+de\\s+)?)?|dans\\s+(?:les?\\s+|un\\s+d[ée]lai\\s+de\\s+))' +
    MOTIF_NOMBRE + '\\s*(jours?|mois)(?:\\s+' + MOTIF_ANCRE_DELAI + '\\s+([^.,;\\n]{0,80}))?',
    'gi'
  );

  function detecterDelais(texte) {
    const source = String(texte || '');
    const resultats = [];
    const re = new RegExp(RE_DELAI_GENERIQUE.source, 'gi');
    let m;
    while ((m = re.exec(source)) !== null) {
      const valeur = valeurNombre(m[1]);
      if (!Number.isFinite(valeur)) continue;
      const contexte = extraireContexte(source, m.index, m[0].length);
      // Même garde-fou que dans detecterDatesDepuisTexte : le délai de notification du refus au
      // notaire n'est pas la condition suspensive elle-même (voir l'historique du 60 j / 70 j).
      const avant = source.slice(Math.max(0, m.index - 200), m.index);
      const ancre = m[3] || '';
      // Classé sur la clause entière (m[0]) et non sur `ancre` seule : voir pointDepartDepuisAncre.
      const pointDepart = ancre ? pointDepartDepuisAncre(m[0]) : 'signature';
      resultats.push({
        index: m.index,
        extrait: contexte,
        delai: { valeur, unite: uniteDelai(m[2]) },
        // Sans ancre explicite, la convention (déjà appliquée par reAuPlusTardDelai) est de compter
        // depuis la signature : « la présente convention est soumise à… au plus tard dans les 60
        // jours ». On le note pour pouvoir l'expliquer à l'étude plutôt que de le taire.
        pointDepart,
        pointDepartImplicite: !ancre,
        ancre: ancre.trim() || null,
        notification: /notifier|notification/i.test(avant),
        suggestion: suggererEcheance(contexte),
        page: pageDepuisIndex(m.index)
      });
    }
    return resultats;
  }

  function champDateVide(raison) {
    return { valeur: null, statut: 'NOT_FOUND', methode: null, origine: 'regex', source: null, candidats: [], calcul: null, raison: raison || '' };
  }

  // Construit un objet date métier par type, à partir des candidates déjà détectées et des délais
  // repérés. Règles issues de la spec :
  //  - une date écrite noir sur blanc (EXPLICIT) n'est JAMAIS remplacée par une date calculée ;
  //  - plusieurs candidates de même type sans formulation permettant de trancher → NEEDS_REVIEW,
  //    avec les deux sources conservées, plutôt qu'un choix arbitraire silencieux ;
  //  - un délai dont le point de départ n'est pas connu → NEEDS_REVIEW SANS valeur : on signale la
  //    clause et son délai, on ne fabrique pas une date depuis la signature « pour faire joli ».
  function construireDatesMetier(detectedDates, delais, dateCompromis) {
    const candidatesToutes = Array.isArray(detectedDates) ? detectedDates : [];
    const delaisTous = Array.isArray(delais) ? delais : [];
    const dates = {};

    dates.SIGNATURE_AVANT_CONTRAT = dateCompromis
      ? { valeur: dateCompromis, statut: 'CONFIRMED', methode: 'EXPLICIT', origine: 'regex', source: null, candidats: [], calcul: null, raison: 'Date de signature de l’avant-contrat détectée dans le document.' }
      : champDateVide('Aucune date de signature trouvée : les délais exprimés en jours ou en mois ne peuvent pas être calculés.');

    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      const champ = CHAMP_PAR_TYPE_DATE[typeDate];
      const toutesDuType = candidatesToutes.filter(d => d.suggestion === champ);
      // Une date écrite noir sur blanc l'emporte sur une date calculée depuis un délai : l'acte
      // énonce souvent les deux dans la même phrase (« au plus tard le 15 novembre 2026, soit un
      // délai de 60 jours à compter de la signature »), et les deux diffèrent d'un jour ou deux
      // selon la convention de computation. Sans cette priorité, la date calculée l'emportait —
      // exactement ce que la spec interdit.
      const explicites = toutesDuType.filter(d => !d.calcul);
      const candidats = explicites.length > 0 ? explicites : toutesDuType;

      if (candidats.length > 0) {
        const choix = meilleureCandidateEcheance(candidats, champ);
        const retenu = choix.candidat;
        const calculee = !!(retenu && retenu.calcul);
        // Quand une date écrite a été préférée à une date calculée, on garde cette dernière de
        // côté : si les deux divergent nettement, c'est que deux clauses de l'acte se contredisent
        // (voir controlerCoherence, DATE_EXPLICITE_VS_DELAI).
        const alternative = explicites.length > 0 ? toutesDuType.find(d => d.calcul) : null;
        dates[typeDate] = {
          valeur: retenu ? retenu.iso : null,
          statut: choix.ambigu ? 'NEEDS_REVIEW' : 'CONFIRMED',
          methode: calculee ? 'CALCULATED' : 'EXPLICIT',
          origine: 'regex',
          source: retenu ? { page: retenu.page || null, extrait: retenu.contexte || null, index: typeof retenu.index === 'number' ? retenu.index : null } : null,
          // Les concurrentes ne sont conservées QUE lorsqu'il faut trancher : sinon la fiche
          // afficherait des « candidats » là où il n'y a jamais eu d'hésitation.
          candidats: choix.ambigu
            ? candidats.map(c => ({ valeur: c.iso, origine: 'regex', source: { page: c.page || null, extrait: c.contexte || null } }))
            : [],
          calcul: calculee ? retenu.calcul : null,
          calculAlternatif: alternative ? alternative.iso : null,
          // Classée d'après une correction déjà faite sur une clause très proche : l'étude tient à
          // voir cette provenance (badge « Appris »), au même titre que sur les chips.
          apprise: !!(retenu && retenu.apprise),
          raison: choix.ambigu
            ? 'Plusieurs clauses donnent une date pour cette échéance, sans formulation permettant de trancher.'
            : (calculee ? '' : 'Date lue directement dans l’acte.') // calculée : la ligne « Calculée : … » du panneau le dit déjà
        };
        continue;
      }

      // Aucune date calendaire pour ce type : reste-t-il un délai qui s'y rapporte mais qu'on n'a
      // pas pu convertir ? C'est le cas visé par la spec (« point de départ différent »).
      const delaisDuType = delaisTous.filter(d => d.suggestion === champ && !d.notification);

      // Un délai que detecterDatesDepuisTexte n'a pas su convertir (ses motifs exigent « à compter
      // de »/« au plus tard dans les », alors que detecterDelais reconnaît aussi « dans un délai de
      // 60 jours DE LA promesse ») mais dont le point de départ EST la signature : on le calcule
      // ici plutôt que de le laisser tomber. Sans ça, l'échéance disparaissait purement et
      // simplement de la fiche — signalé par l'étude.
      const delaiCalculable = dateCompromis
        ? delaisDuType.find(d => pointDepartCalculable(d.pointDepart))
        : null;
      if (delaiCalculable) {
        const iso = calculerDateEcheance(dateCompromis, delaiCalculable.delai);
        if (iso) {
          dates[typeDate] = {
            valeur: iso,
            statut: 'CONFIRMED',
            methode: 'CALCULATED',
            origine: 'regex',
            source: { page: delaiCalculable.page || null, extrait: delaiCalculable.extrait, index: delaiCalculable.index },
            candidats: [],
            calcul: { delai: delaiCalculable.delai, pointDepart: delaiCalculable.pointDepart, baseDate: dateCompromis },
            calculAlternatif: null,
            apprise: false,
            // Pas de raison : la ligne « Calculée : 60 jours depuis… » du panneau la dit déjà, mot
            // pour mot — deux phrases identiques l'une sous l'autre n'apprennent rien.
            raison: ''
          };
          continue;
        }
      }

      const delaiOrphelin = delaisDuType.find(d => !pointDepartCalculable(d.pointDepart) || !dateCompromis);
      if (delaiOrphelin) {
        const manqueBase = !dateCompromis && pointDepartCalculable(delaiOrphelin.pointDepart);
        dates[typeDate] = {
          valeur: null,
          statut: 'NEEDS_REVIEW',
          methode: 'CALCULATED',
          origine: 'regex',
          source: { page: delaiOrphelin.page || null, extrait: delaiOrphelin.extrait, index: delaiOrphelin.index },
          candidats: [],
          calcul: { delai: delaiOrphelin.delai, pointDepart: delaiOrphelin.pointDepart, baseDate: null },
          raison: manqueBase
            ? 'Délai trouvé, mais la date de signature de l’avant-contrat est inconnue : à calculer une fois celle-ci renseignée.'
            : 'Délai trouvé, mais son point de départ n’est pas une date figurant dans l’acte : à déterminer.'
        };
        continue;
      }

      dates[typeDate] = champDateVide('');
    }

    return dates;
  }

  // ==== OUTIL 2 : DANGERS DU COMPROMIS (100 % déterministe, aucun appel au modèle) ====
  //
  // Refonte complète, sur retour de l'étude : « j'ai testé l'outil 2 et c'est inutilisable, c'est
  // trop long, il n'a jamais réussi à me sortir quelque chose ». La version précédente enchaînait
  // CINQ appels Ollama en série sur le CPU d'un poste de bureau — plusieurs minutes, et un échec
  // en cours de route faisait tout perdre. Tout ce que l'étude demande en réalité se lit par des
  // règles, exactement comme l'outil 1 : le rapport est donc calculé instantanément, sans serveur,
  // et le modèle local n'intervient plus qu'à la demande, APRÈS le résultat (bouton dédié).
  //
  // Périmètre arrêté avec l'étude, volontairement limité à quatre thèmes :
  //   1. travaux DÉJÀ FAITS et déclarés — danger s'ils touchent au gros œuvre ou à l'extérieur
  //      (autorisation d'urbanisme exigible, garantie décennale encore en cours à moins de 10 ans) ;
  //   2. diagnostics périmés à la date de l'analyse ;
  //   3. entretiens et documents que le vendeur doit fournir (chaudière, ramonage…) ;
  //   4. travaux que le vendeur doit réaliser AVANT la vente.
  // Préemption, servitudes et urbanisme général sont hors périmètre (choix explicite de l'étude) :
  // un rapport court et lisible vaut mieux qu'un inventaire que personne ne lit.

  // Durées de validité des diagnostics du dossier de diagnostic technique (DDT), reprises du droit
  // en vigueur à la demande de l'étude (« prendre tous les diagnostics en compte », article de
  // référence notaires.fr). L'article lui-même N'A PAS PU ÊTRE LU depuis cet environnement de
  // développement (notaires.fr est bloqué par le proxy réseau, comme pdf.js/Ollama/Google Fonts —
  // limite déjà documentée ailleurs dans ce fichier) : les durées ci-dessous sont celles du régime
  // légal, à confirmer par l'étude contre l'article. Chaque entrée porte sa durée en clair (`duree`)
  // pour que cette vérification se fasse à l'œil, sans relire le code.
  //
  // Trois régimes, volontairement distingués — c'est ce qui évite à la fois d'inventer une
  // expiration et d'encombrer le rapport :
  //   • durée fixe (`dureeMois`) → expiration calculée depuis la seule date d'établissement ;
  //   • durée dépendante du RÉSULTAT (plomb, amiante, Carrez) → `dureeMois: null`, signalée « à
  //     vérifier » plutôt que devinée, mais ce qui reste calculable depuis la date l'est quand
  //     même (`etabliAvant`, cf. amiante) ;
  //   • aucune durée légale (bruit, mérule, DTG) → `sansDuree: true`, AUCUN constat produit : il
  //     n'y a rien à contrôler, et un « à vérifier » sur chacun noierait les vrais signaux.
  //
  // `motif` sert à la fois à repérer le document dans le texte du compromis ET à reconnaître un
  // justificatif déposé par son nom de fichier.
  // PIÈGE RENCONTRÉ EN ÉCRIVANT CES MOTIFS, valable pour tout le fichier : en JavaScript, \b est
  // défini sur \w = [A-Za-z0-9_] — une lettre ACCENTUÉE n'est pas un caractère de mot. « \bÉtat »
  // ne matche donc JAMAIS (espace et É sont tous deux « non-mot », il n'y a aucune frontière entre
  // eux). Toute alternative qui COMMENCE par une lettre accentuée doit se passer du \b initial.
  var DOCUMENTS_VALIDITE_OUTIL2 = {
    // --- Diagnostics à durée fixe : entièrement calculables depuis la seule date d'établissement.
    dpe: { label: 'Diagnostic de performance énergétique (DPE)', famille: 'diagnostic', dureeMois: 120,
      duree: '10 ans',
      motif: /\b(?:DPE|diagnostics?\s+de\s+performance\s+[ée]nerg[ée]tique)\b/i },
    auditEnergetique: { label: 'Audit énergétique réglementaire', famille: 'diagnostic', dureeMois: 60,
      duree: '5 ans',
      motif: /\baudit\s+[ée]nerg[ée]tique\b/i,
      note: "Exigé à la vente d'une maison ou d'un immeuble en monopropriété selon l'étiquette du DPE — vérifier qu'il est bien dû pour ce bien." },
    erp: { label: 'État des risques et pollutions (ERP)', famille: 'diagnostic', dureeMois: 6,
      duree: '6 mois',
      motif: /(?:[ée]tat\s+des\s+risques(?:\s+et\s+(?:de\s+)?pollutions?)?|\bERP\b|\bERRIAL\b)/i },
    termites: { label: 'État relatif à la présence de termites', famille: 'diagnostic', dureeMois: 6,
      duree: '6 mois',
      motif: /\btermites?\b/i },
    electricite: { label: "État de l'installation intérieure d'électricité", famille: 'diagnostic', dureeMois: 36,
      duree: '3 ans',
      motif: /(?:installation\s+int[ée]rieure\s+d['’]?\s*[ée]lectricit[ée]|diagnostics?\s+[ée]lectricit[ée]|[ée]tat\s+de\s+l['’]?\s*installation\s+[ée]lectrique)/i },
    gaz: { label: "État de l'installation intérieure de gaz", famille: 'diagnostic', dureeMois: 36,
      duree: '3 ans',
      motif: /(?:installation\s+int[ée]rieure\s+(?:de\s+)?gaz|diagnostics?\s+gaz|[ée]tat\s+de\s+l['’]?\s*installation\s+(?:de\s+)?gaz)/i },
    assainissement: { label: "Contrôle d'assainissement non collectif", famille: 'diagnostic', dureeMois: 36,
      duree: '3 ans',
      motif: /\b(?:assainissement\s+non\s+collectif|\bSPANC\b)/i },

    // --- Diagnostics dont la durée dépend du RÉSULTAT, pas de la seule date : jamais devinée ici.
    // Ce qui EST calculable depuis la date est malgré tout contrôlé — voir `etabliAvant` pour
    // l'amiante, où un repérage antérieur au 1er janvier 2013 est à refaire quel que soit son
    // résultat (la réglementation de repérage a changé à cette date).
    amiante: { label: "État de présence d'amiante", famille: 'diagnostic', dureeMois: null,
      duree: 'illimitée si le repérage est négatif',
      etabliAvant: '2013-01-01',
      messageEtabliAvant: "Repérage antérieur au 1er janvier 2013 : à refaire, quel que soit son résultat (la réglementation de repérage a changé à cette date).",
      motif: /\bamiante\b/i,
      note: "Illimitée si le repérage est négatif ; à renouveler s'il est positif — dépend du RÉSULTAT, non déductible ici." },
    plomb: { label: "Constat de risque d'exposition au plomb (CREP)", famille: 'diagnostic', dureeMois: null,
      duree: "illimitée en l'absence de plomb, 1 an si présence",
      motif: /\b(?:plomb|\bCREP\b)/i,
      note: "Illimitée en l'absence de plomb, 1 an si présence détectée — dépend du RÉSULTAT, non déductible ici." },
    mesurage: { label: 'Mesurage (loi Carrez)', famille: 'diagnostic', dureeMois: null,
      duree: 'illimitée sauf travaux modifiant la surface',
      motif: /\b(?:loi\s+Carrez|mesurage|superficie\s+privative)\b/i,
      note: 'Illimitée sauf travaux modifiant la surface depuis son établissement — à recouper avec les travaux déclarés.' },

    // --- Documents d'information, SANS durée de validité légale : rien à contrôler, donc aucun
    // constat produit (voir SANS_DUREE dans calculerValiditeDocumentOutil2). Ils restent dans la
    // table pour être reconnus comme documents attendus et rapprochés d'un justificatif déposé.
    bruit: { label: 'État des nuisances sonores aériennes (ENSA)', famille: 'diagnostic', dureeMois: null,
      sansDuree: true, duree: 'aucune durée légale',
      motif: /(?:nuisances\s+sonores\s+a[ée]riennes|\bENSA\b)/i,
      note: "Document d'information, sans durée de validité : il doit refléter le plan d'exposition au bruit en vigueur au jour de la vente." },
    merule: { label: 'Information sur le risque de mérule', famille: 'diagnostic', dureeMois: null,
      sansDuree: true, duree: 'aucune durée légale',
      motif: /\bm[ée]rules?\b/i,
      note: "Information due dans les zones délimitées par arrêté préfectoral, sans durée de validité légale." },
    dtg: { label: 'Diagnostic technique global (DTG)', famille: 'diagnostic', dureeMois: null,
      sansDuree: true, duree: 'aucune durée légale',
      motif: /(?:diagnostics?\s+technique\s+global|\bDTG\b)/i,
      note: "Document de copropriété, sans durée de validité légale — à actualiser lorsque l'assemblée générale le décide." },

    // --- Entretiens à la charge du vendeur (hors DDT, mais c'est le même contrôle de date).
    entretienChaudiere: { label: 'Entretien annuel de la chaudière', famille: 'entretien', dureeMois: 12,
      duree: '1 an',
      motif: /\b(?:entretien[^.]{0,30}chaudi[èe]re|chaudi[èe]re[^.]{0,30}entretien)\b/i },
    ramonage: { label: 'Ramonage du conduit de fumée', famille: 'entretien', dureeMois: 12,
      duree: '1 an',
      motif: /\bramonage\b/i },
    entretienPac: { label: 'Entretien de la pompe à chaleur', famille: 'entretien', dureeMois: 12,
      duree: '1 an',
      motif: /\b(?:pompe\s+[àa]\s+chaleur|\bPAC\b)/i }
  };

  // Même contrat que calculerValiditeDiagnostic() côté serveur, mais côté client et élargi aux
  // entretiens : c'est ici que se joue la question posée par l'étude (« entretien de chaudière
  // fourni, mais a-t-il bien moins d'un an ? »). Sans date, aucun calcul — un statut dédié plutôt
  // qu'une expiration inventée.
  function calculerValiditeDocumentOutil2(cle, dateEtablissement, dateReference) {
    const entree = DOCUMENTS_VALIDITE_OUTIL2[cle];
    if (!entree) return { statut: 'INCONNU', label: null, dateExpiration: null, message: 'Document non reconnu par la table de validité.' };
    // Document d'information sans durée de validité légale : rien à calculer, et surtout rien à
    // signaler — même sans date. Voir le commentaire de DOCUMENTS_VALIDITE_OUTIL2.
    if (entree.sansDuree) {
      return { statut: 'SANS_DUREE', label: entree.label, dateExpiration: null,
        message: entree.note || "Ce document n'a pas de durée de validité légale." };
    }
    if (!dateEtablissement) {
      return { statut: 'DATE_MANQUANTE', label: entree.label, dateExpiration: null,
        message: `Aucune date trouvée pour « ${entree.label} » : sa validité ne peut pas être vérifiée.` };
    }
    // Un repérage antérieur à une date butoir réglementaire est à refaire quel que soit son
    // résultat : c'est le seul morceau de ces régimes « dépendants du résultat » qui se déduise
    // de la date seule, on ne s'en prive pas.
    if (entree.etabliAvant && dateEtablissement < entree.etabliAvant) {
      return { statut: 'EXPIRE', label: entree.label, dateExpiration: entree.etabliAvant, valide: false,
        message: entree.messageEtabliAvant || `Établi avant le ${formatDateFr(entree.etabliAvant)} : à refaire.` };
    }
    if (entree.dureeMois == null) {
      return { statut: 'NON_CALCULABLE', label: entree.label, dateExpiration: null,
        message: entree.note || 'Durée de validité non déterminable automatiquement — à vérifier.' };
    }
    const dateExpiration = ajouterMois(dateEtablissement, entree.dureeMois);
    if (!dateExpiration) {
      return { statut: 'DATE_INVALIDE', label: entree.label, dateExpiration: null,
        message: `Date illisible pour « ${entree.label} » : validité non vérifiable.` };
    }
    const reference = dateReference || new Date().toISOString().slice(0, 10);
    const valide = dateExpiration >= reference;
    return {
      statut: valide ? 'VALIDE' : 'EXPIRE', label: entree.label, dateExpiration, valide,
      message: valide
        ? `Valable jusqu'au ${formatDateFr(dateExpiration)}.`
        : `PÉRIMÉ depuis le ${formatDateFr(dateExpiration)} — un document à jour doit être produit avant la vente.`
    };
  }

  // Une date, numérique ou en toutes lettres, dans un fragment. Volontairement distincte de
  // detecterDatesDepuisTexte() (outil 1) : celle-ci cherche des ÉCHÉANCES avec tout son appareil de
  // filtres (clauses hypothétiques, citations de loi, annexes) ; ici on veut simplement la date
  // d'établissement d'un document, dans une fenêtre de quelques dizaines de caractères.
  var RE_DATE_NUM_LIBRE = /\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*((?:19|20)\d{2})\b/;
  var RE_DATE_TEXTE_LIBRE = /\b(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\s+((?:19|20)\d{2})\b/i;

  function premiereDateDansFragment(fragment) {
    const txt = String(fragment || '');
    const num = txt.match(RE_DATE_NUM_LIBRE);
    const lettres = txt.match(RE_DATE_TEXTE_LIBRE);
    // La première des deux dans le fragment, pas la première des deux regex.
    const candidats = [];
    if (num) candidats.push({ index: num.index, iso: toISO(Number(num[3]), Number(num[2]) - 1, Number(num[1])) });
    if (lettres) {
      const mois = MOIS[lettres[2].toLowerCase().replace('û', 'u').replace('é', 'e')];
      if (mois != null) candidats.push({ index: lettres.index, iso: toISO(Number(lettres[3]), mois, Number(lettres[1])) });
    }
    if (candidats.length === 0) return null;
    candidats.sort((a, b) => a.index - b.index);
    const iso = candidats[0].iso;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(new Date(iso + 'T00:00:00Z').getTime()) ? iso : null;
  }

  // Fenêtre bornée par la fin de phrase : une date située après le point suivant appartient déjà à
  // une autre clause et n'a aucune raison d'être celle du document cherché.
  function fragmentApres(texte, index, longueur) {
    const brut = String(texte || '').slice(index, index + (longueur || 260));
    const point = brut.indexOf('.');
    return point > 0 ? brut.slice(0, point) : brut;
  }

  function phraseAutour(texte, index, avant, apres) {
    const t = String(texte || '');
    let debut = index, n = 0;
    while (debut > 0 && n < (avant || 250)) { if (t[debut - 1] === '.') break; debut--; n++; }
    let fin = index; n = 0;
    while (fin < t.length && n < (apres || 350)) { if (t[fin] === '.') { fin++; break; } fin++; n++; }
    return { phrase: t.slice(debut, fin).replace(/\s+/g, ' ').trim(), debut, fin };
  }

  // --- Journal de diagnostic de la relecture ------------------------------------------------
  // Pendant d'Outil 1 (renderDiagnosticParcours). Chaque détecteur note les clauses qu'il a
  // examinées : retenues, ou ÉCARTÉES avec la raison (clause de style, engagement futur, texte de
  // loi cité…). Le seul retour obtenu sur la relecture était « il rate des choses » : avec ce
  // journal, un signalement devient « il a vu la clause p.12 et l'a écartée comme clause de style »,
  // c'est-à-dire un correctif d'un seul tour.
  // Le journal n'existe que pendant analyserCompromisOutil2 / analyserProjetVenteOutil2 : appelés
  // ailleurs (import d'Outil 1, tests), les détecteurs ne notent rien et ne coûtent rien de plus.
  var journalDiagnosticOutil2 = null;
  var MAX_ENTREES_DIAGNOSTIC_OUTIL2 = 3000;

  var THEMES_DIAGNOSTIC_OUTIL2 = [
    { cle: 'travaux', libelle: 'Travaux déjà réalisés' },
    { cle: 'engagements', libelle: 'Obligations du vendeur' },
    { cle: 'diagnostics', libelle: 'Diagnostics et entretiens' },
    { cle: 'procedures', libelle: 'Procédures et litiges' },
    { cle: 'documentsNonEtablis', libelle: 'Documents déclarés non établis' },
    { cle: 'statut', libelle: 'Statut des acquéreurs' },
    { cle: 'ag', libelle: 'Assemblées générales' },
    { cle: 'urbanisme', libelle: 'Certificat d’urbanisme' }
  ];

  function ouvrirJournalDiagnosticOutil2() {
    journalDiagnosticOutil2 = { entrees: [], document: '', pages: null };
  }

  function fermerJournalDiagnosticOutil2() {
    const j = journalDiagnosticOutil2;
    journalDiagnosticOutil2 = null;
    return j ? j.entrees : [];
  }

  // Le document en cours de lecture : les entrées suivantes lui sont rattachées, avec leur page.
  function documentJournalDiagnosticOutil2(nom, pages) {
    if (!journalDiagnosticOutil2) return;
    journalDiagnosticOutil2.document = nom || '';
    journalDiagnosticOutil2.pages = pages || null;
  }

  // `precision` nomme l'objet examiné (« DPE », « emplacement réservé ») sans fragmenter le
  // regroupement par raison.
  function noterDiagnosticOutil2(theme, verdict, raison, phrase, index, precision) {
    const j = journalDiagnosticOutil2;
    if (!j || j.entrees.length >= MAX_ENTREES_DIAGNOSTIC_OUTIL2) return;
    j.entrees.push({
      theme, verdict, raison, precision: precision || '',
      phrase: String(phrase || '').replace(/\s+/g, ' ').trim().slice(0, 320),
      document: j.document,
      page: (index != null && j.pages && j.pages.length) ? pageDepuisIndexPages(j.pages, index) : null
    });
  }

  // Regroupe le journal pour l'affichage : par thème, puis par verdict et par raison. Pure.
  function syntheseDiagnosticOutil2(entrees) {
    const parTheme = new Map();
    for (const e of entrees || []) {
      if (!parTheme.has(e.theme)) parTheme.set(e.theme, { retenues: [], ecartees: new Map() });
      const t = parTheme.get(e.theme);
      if (e.verdict === 'retenue') t.retenues.push(e);
      else {
        if (!t.ecartees.has(e.raison)) t.ecartees.set(e.raison, []);
        t.ecartees.get(e.raison).push(e);
      }
    }
    return THEMES_DIAGNOSTIC_OUTIL2
      .filter(th => parTheme.has(th.cle))
      .map(th => {
        const t = parTheme.get(th.cle);
        const ecartees = [...t.ecartees.entries()]
          .map(([raison, liste]) => ({ raison, entrees: liste }))
          .sort((a, b) => b.entrees.length - a.entrees.length);
        return { cle: th.cle, libelle: th.libelle, retenues: t.retenues, ecartees,
          nbEcartees: ecartees.reduce((s, g) => s + g.entrees.length, 0) };
      });
  }

  // --- Thème 1 : travaux DÉJÀ RÉALISÉS et déclarés dans l'acte -------------------------------
  // Le danger nommé par l'étude : des travaux touchant au GROS ŒUVRE ou à l'EXTÉRIEUR du bien
  // exigent une autorisation d'urbanisme, et engagent la garantie décennale s'ils ont moins de
  // dix ans. Une réfection intérieure sans incidence sur la structure, non.
  var RE_TRAVAUX_MOT = /\b(?:travaux|r[ée]novation|r[ée]habilitation|agrandissement|extension|sur[ée]l[ée]vation|ravalement|r[ée]fection|am[ée]nagement|construction|v[ée]randa|piscine|abri\s+de\s+jardin|carport|pergola|terrasse|cl[ôo]ture|portail|toiture|charpente|couverture|isolation|combles)\b/gi;

  // Marqueur d'une réalisation PASSÉE : c'est lui qui distingue « des travaux ont été réalisés »
  // (thème 1) de « le vendeur s'engage à faire réaliser des travaux » (thème 4, déjà couvert par
  // extraireEngagementsVendeur).
  var RE_TRAVAUX_PASSES = /(?:ont|a|ayant|avoir)\s+[ée]t[ée]\s+(?:r[ée]alis|effectu|ex[ée]cut|entrepr|achev|termin|construit|[ée]difi)|d[ée]clare\s+(?:avoir\s+)?(?:fait\s+)?(?:r[ée]alis|proc[ée]d|effectu|ex[ée]cut|construit|[ée]difi)|(?:(?:r[ée]alis|effectu|ex[ée]cut|achev|[ée]difi|r[ée]nov)[ée]e?s?|construite?s?|refaite?s?)\s+(?:en|le|courant|depuis|il\s+y\s+a|au\s+cours)\b/i;

  // Une déclaration de NON-travaux est la clause de style la plus fréquente de tout l'acte : la
  // retenir produirait un danger sur chaque compromis (même piège que la négation de copropriété,
  // déjà documenté pour COPROPRIETE_RE).
  var RE_AUCUN_TRAVAUX = /\b(?:aucun[es]?\s+travaux|aucune\s+(?:construction|extension|r[ée]novation|modification)|n['’]\s*(?:a|ont)\s+(?:pas\s+|jamais\s+)?(?:fait\s+)?(?:r[ée]alis\w*|effectu\w*|entrepr\w*)\s+aucun|pas\s+de\s+travaux|n['’]\s*a\s+[ée]t[ée]\s+r[ée]alis[ée]\s+aucun)/i;

  // Un engagement FUTUR n'est pas un travail déjà fait : il relève du thème 4.
  var RE_TRAVAUX_FUTURS = /\bs['’]\s*(?:engage|oblige)\b|\bdevra\s+(?:faire\s+)?(?:r[ée]alis|ex[ée]cut|effectu)|\bs['’]\s*engage\s+[àa]\s+faire\b|\bavant\s+la\s+(?:vente|signature)\b[^.]{0,40}\bfera\b/i;

  // Une clause qui DÉCRIT ce qu'un document doit mentionner (« le carnet d'entretien a pour objet
  // de mentionner si des travaux importants ont été réalisés ») parle de travaux au conditionnel,
  // pas de travaux faits sur CE bien. C'est du boilerplate présent dans presque tout acte de
  // copropriété : le retenir produirait un danger sur chacun, même piège que RE_AUCUN_TRAVAUX.
  var RE_TRAVAUX_HYPOTHETIQUE = /\bsi\s+(?:des|les?|la|l['’])\s*travaux|\bs['’]ils?\s+(?:ont|a)\s+[ée]t[ée]\s+r[ée]alis|\ba\s+pour\s+objet\s+de\s+mentionner|\bindiquant\s+si\b|\bdoit\s+mentionner\b/i;

  // Un acte cite couramment le texte de loi qu'il applique (art. L.731-4 du Code de la
  // construction, loi du 10 juillet 1965…), et ces textes parlent eux-mêmes de travaux. Exiger
  // DEUX marqueurs — la référence au texte ET un verbe d'énonciation ou une énumération légale
  // (« 1° … 2° … ») — évite d'écarter une vraie déclaration qui se contenterait de viser un
  // article (« travaux soumis à déclaration préalable au sens de l'article R.421-17 »).
  var RE_REFERENCE_TEXTE_LEGAL = /\b(?:article\s+[LRD]?\.?\s*\d|du\s+(?:m[êe]me\s+)?[Cc]ode\b|loi\s+(?:n[°ºo]|du\s+\d)|d[ée]cret\s+n[°ºo])/;
  var RE_ENONCIATION_LEGALE = /\b(?:dispose|pr[ée]voit|[ée]nonce|stipule)\s+que\b|\baux\s+termes\s+de\s+l['’]article\b|\best\s+ainsi\s+r[ée]dig[ée]\b|\b\d{1,2}°\s/;

  var RE_TRAVAUX_GROS_OEUVRE = /\b(?:gros\s*[-\s]?\s*(?:œuvre|oeuvre)|murs?\s+porteurs?|charpente|toiture|couverture|fondations?|dalle|plancher|poutre|structure|sur[ée]l[ée]vation|ouverture\s+(?:dans|d['’]un)\s+(?:un\s+)?mur)\b/i;
  var RE_TRAVAUX_EXTERIEUR = /\b(?:ext[ée]rieur|fa[çc]ade|ravalement|toiture|couverture|v[ée]randa|extension|agrandissement|piscine|abri\s+de\s+jardin|carport|garage|terrasse|cl[ôo]ture|portail|pergola|d[ée]pendance|(?:b[âa]timent|construction|local)\s+annexe|combles\s+am[ée]nag)/i;

  var RE_AUTORISATION_URBANISME = /\b(?:d[ée]claration\s+pr[ée]alable|permis\s+de\s+construire|permis\s+d['’]am[ée]nager|autorisation\s+d['’]urbanisme|\bDP\s*n[°ºo]|\bPC\s*n[°ºo]|non[-\s]?opposition|d[ée]claration\s+attestant\s+l['’]ach[èe]vement)\b/i;
  var RE_DECENNALE = /\b(?:garantie\s+d[ée]cennale|assurance\s+d[ée]cennale|responsabilit[ée]\s+d[ée]cennale|dommages?[-\s]ouvrage)\b/i;
  var RE_FAIT_PAR_SOI_MEME = /\b(?:par\s+(?:lui|elle)[-\s]m[êe]me|par\s+ses\s+soins|en\s+auto[-\s]?construction|sans\s+recours\s+[àa]\s+(?:une\s+)?entreprise)\b/i;
  var RE_ANNEE_TRAVAUX = /\b((?:19|20)\d{2})\b/;

  // Une facture ou un devis cité dans la même clause : c'est elle qui date le travail et nomme
  // l'entreprise, donc ce qui permet ensuite de réclamer la bonne attestation décennale. Lue dans
  // l'acte SEUL, comme l'autorisation et la décennale — arbitrage explicite de l'étude : ce que
  // l'acte affirme fait foi, l'outil ne va pas vérifier qu'une facture est effectivement déposée.
  var RE_FACTURE_TRAVAUX = /\b(?:factures?|devis|m[ée]moires?\s+de\s+travaux|justificatifs?\s+de\s+(?:paiement|travaux))\b/i;

  // Libellé court d'un travail, pour la ligne du tableau : la clause entière y serait illisible.
  // On part du mot déclencheur plutôt que du début de la phrase — celui-ci commence souvent par
  // une incise (« Le VENDEUR déclare que… ») qui ne dit rien de la nature du travail.
  function resumeTravail(phrase) {
    const p = String(phrase || '').replace(/\s+/g, ' ').trim();
    const m = p.match(new RegExp(RE_TRAVAUX_MOT.source, 'i'));
    const debut = (m && m.index != null) ? m.index : 0;
    const bout = p.slice(debut, debut + 90).trim();
    return (debut + 90 < p.length) ? bout + '…' : bout;
  }

  // aujourdHui est toujours injecté : la fonction reste pure et testable (même convention que
  // grouperEcheancesParSemaine / calculerValiditeDocumentOutil2).
  function detecterTravauxRealises(texte, pages, aujourdHui) {
    const src = String(texte || '');
    const resultats = [];
    const spans = [];
    const re = new RegExp(RE_TRAVAUX_MOT.source, 'gi');
    let m;
    while ((m = re.exec(src)) !== null) {
      const { phrase, debut, fin } = phraseAutour(src, m.index, 250, 350);
      if (phrase.length < 25) continue;
      // Deux mots « travaux » dans une même clause longue donnaient deux fenêtres de lecture
      // différentes (la marche arrière butant sur son plafond de 250 caractères plutôt que sur un
      // point), donc deux constats pour un seul passage. On dédoublonne par CHEVAUCHEMENT de
      // plage, pas par les 80 premiers caractères du texte rendu.
      if (spans.some(s => debut < s.fin && fin > s.debut)) continue;
      // La plage est retenue AVANT les garde-fous : une clause est jugée UNE fois, quel que soit
      // le verdict. Sans ça, une clause écartée ne laissait aucune trace et son deuxième mot
      // « travaux » la faisait rejuger sur une fenêtre décalée, qui repassait les garde-fous.
      spans.push({ debut, fin });
      const ecarter = (raison) => { noterDiagnosticOutil2('travaux', 'ecartee', raison, phrase, m.index); };
      if (!RE_TRAVAUX_PASSES.test(phrase)) { ecarter('Simple mention : aucun marqueur de travaux déjà réalisés'); continue; }
      if (RE_AUCUN_TRAVAUX.test(phrase)) { ecarter('Clause de non-travaux (« aucun travaux… »)'); continue; }
      if (RE_TRAVAUX_FUTURS.test(phrase)) { ecarter('Travaux à venir : relève des obligations du vendeur'); continue; }
      if (RE_TRAVAUX_HYPOTHETIQUE.test(phrase)) { ecarter('Formulation conditionnelle (ce qu’un document doit mentionner)'); continue; }
      if (RE_REFERENCE_TEXTE_LEGAL.test(phrase) && RE_ENONCIATION_LEGALE.test(phrase)) { ecarter('Texte de loi cité dans l’acte'); continue; }

      const grosOeuvre = RE_TRAVAUX_GROS_OEUVRE.test(phrase);
      const exterieur = RE_TRAVAUX_EXTERIEUR.test(phrase);
      noterDiagnosticOutil2('travaux', 'retenue',
        (grosOeuvre || exterieur) ? `Retenue : touche ${grosOeuvre ? 'le gros œuvre' : 'l’extérieur'}` : 'Retenue : travail intérieur, sans constat (pas d’autorisation exigée)',
        phrase, m.index);
      const anneeMatch = phrase.match(RE_ANNEE_TRAVAUX);
      const annee = anneeMatch ? Number(anneeMatch[1]) : null;
      const anneeCourante = Number(String(aujourdHui || new Date().toISOString().slice(0, 10)).slice(0, 4));
      // Moins de dix ans : la garantie décennale court encore, son attestation doit être produite.
      const sousDecennale = annee ? (anneeCourante - annee) < 10 : null;

      resultats.push({
        phrase,
        libelle: resumeTravail(phrase),
        page: pageDepuisIndexPages(pages, debut),
        grosOeuvre,
        exterieur,
        soumisAutorisation: grosOeuvre || exterieur,
        autorisationMentionnee: RE_AUTORISATION_URBANISME.test(phrase),
        decennaleMentionnee: RE_DECENNALE.test(phrase),
        factureMentionnee: RE_FACTURE_TRAVAUX.test(phrase),
        faitParLeVendeur: RE_FAIT_PAR_SOI_MEME.test(phrase),
        annee,
        sousDecennale
      });
    }
    return resultats;
  }

  // Traduit un travail déclaré en constats. Un travail intérieur sans incidence sur la structure
  // ne produit AUCUN constat : c'est ce qui garde le rapport court et lisible.
  function constatsTravauxRealises(travaux, categorie) {
    const constats = [];
    const cat = categorie || 'TRAVAUX_REALISES';
    for (const t of travaux || []) {
      if (!t.soumisAutorisation) continue;
      const ou = t.grosOeuvre ? 'le gros œuvre' : "l'extérieur du bien";
      const situe = t.annee ? ` (${t.annee})` : '';
      if (!t.autorisationMentionnee) {
        constats.push({
          categorie: cat,
          gravite: 'CRITIQUE',
          titre: `Travaux touchant ${ou}${situe} : aucune autorisation d'urbanisme mentionnée`,
          description: "Ces travaux relèvent au minimum d'une déclaration préalable. Réclamer l'autorisation et la déclaration attestant l'achèvement, ou faire constater la prescription.",
          phrase: t.phrase, page: t.page
        });
      }
      if (t.sousDecennale === true && !t.decennaleMentionnee) {
        constats.push({
          categorie: cat,
          gravite: 'IMPORTANT',
          titre: `Travaux de moins de dix ans (${t.annee}) : garantie décennale non justifiée`,
          description: t.faitParLeVendeur
            ? "Travaux déclarés réalisés par le vendeur lui-même : aucune décennale ne couvre l'acquéreur, l'information doit figurer à l'acte."
            : "Réclamer l'attestation d'assurance décennale de l'entreprise et les factures correspondantes.",
          phrase: t.phrase, page: t.page
        });
      }
      if (t.sousDecennale === null) {
        constats.push({
          categorie: cat,
          gravite: 'A_VERIFIER',
          titre: `Travaux touchant ${ou} sans date précisée`,
          description: "Impossible de savoir si la garantie décennale court encore : faire préciser l'année de réalisation.",
          phrase: t.phrase, page: t.page
        });
      }
    }
    return constats;
  }

  // --- Statut des acquéreurs : marié, pacsé, concubins ----------------------------------------
  //
  // Demandé par l'étude, avec un périmètre arrêté avec elle : ne pas se contenter de LIRE le
  // statut, mais signaler ce qui manque et qui a une conséquence sur la rédaction de l'acte —
  // régime matrimonial non précisé, PACS dont le régime n'est pas dit, acquisition à deux hors
  // mariage sans quotités.
  //
  // PIÈGE CENTRAL, et la raison de tout le code d'attribution ci-dessous : le même acte décrit
  // aussi le statut du VENDEUR (« Monsieur X, marié avec Madame Y, demeurant… »). Lire « marié »
  // dans tout le texte le confondrait une fois sur deux, et un acte présente toujours ses parties
  // par sections — d'où la règle : le marqueur de rôle le plus proche EN AMONT décide à qui
  // appartient la mention. Les regex de rôle sont prises via qualitePourRole(), qui tient compte
  // du type d'acte : sur une promesse d'ACHAT, « promettant » désigne l'acquéreur, pas le vendeur.

  // `mari[ée]e?s?` : le `\b` final est remplacé par un lookahead négatif de lettre — un mot qui finit
  // par une lettre accentuée (« marié ») n'a PAS de frontière `\b` derrière lui (é n'est pas dans \w),
  // donc `\bmari[ée]e?s?\b` ne matchait jamais le masculin singulier « marié ». Piège récurrent
  // documenté dans ce fichier. Le lookahead couvre aussi les majuscules via le flag i.
  var RE_STATUT_MARIE = /\bmari[ée]e?s?(?![a-zà-ÿ])|\b[ée]pou(?:x|se|ses)\b|\bconjoints?\b|\bcontrat\s+de\s+mariage\b/i;
  var RE_STATUT_PACSE = /pacte\s+civil\s+de\s+solidarit[ée]|\bpacs[ée]e?s?\b|\bPACS\b/i;
  var RE_STATUT_CONCUBINS = /\bconcubin(?:s|e|es|age)?\b|vivant\s+maritalement|union\s+libre/i;
  // « divorcé DE Madame X » est un lien familial cité dans l'état civil, pas le statut actuel :
  // le lookahead l'écarte (même garde-fou que RE_LIEN_FAMILIAL, côté extraction des noms).
  var RE_STATUT_SEUL = /\bc[ée]libataires?\b|\bveuf\b|\bveuve\b|\bdivorc[ée]e?\b(?!\s*(?:de\b|d['’]))/i;

  var RE_REGIME_MATRIMONIAL = /communaut[ée]\s+(?:l[ée]gale|universelle|r[ée]duite\s+aux\s+acqu[êe]ts|de\s+biens|d['’]acqu[êe]ts)|s[ée]paration\s+de\s+biens|participation\s+aux\s+acqu[êe]ts|r[ée]gime\s+(?:l[ée]gal|matrimonial)\b/i;
  var RE_REGIME_PACS = /s[ée]paration\s+des\s+patrimoines|s[ée]paration\s+de\s+biens|r[ée]gime\s+de\s+l['’]indivision|indivision\s+(?:l[ée]gale|conventionnelle)/i;

  // Une clause de style qui NIE le statut (« ne sont liés par aucun pacte civil de solidarité »,
  // « non mariés ») contient le mot recherché : la retenir ferait de chaque acte un couple marié.
  // Même piège que RE_AUCUN_TRAVAUX et que la négation de copropriété, déjà payés ici deux fois.
  var RE_NEGATION_STATUT = /\bnon\s+(?:mari[ée]|pacs[ée]|li[ée]|engag[ée])|\bn['’](?:est|ont|a)\s+(?:pas|jamais)\b|\bn['’]\s*(?:[ée]tant|ayant)\s+pas\b|\bne\s+sont\s+(?:pas|ni)\b|\baucun\s+pacte\b|\bni\s+mari[ée]|\bsans\s+(?:contrat|r[ée]gime)\b/i;
  var FENETRE_NEGATION_STATUT = 90;

  // Quotités d'acquisition. « Quotités VENDUES » emploie exactement les mêmes tournures : on exige
  // donc un mot d'acquisition à proximité et l'absence de vocabulaire de cession. Premier jet, au
  // même titre que PIECES_* en leur temps — à resserrer sur un acte réel qui le mettrait en défaut.
  var RE_QUOTITE_ACQUISITION = /\bchacun(?:e)?\s+(?:pour|[àa]\s+concurrence\s+de)\s+(?:une\s+)?(?:moiti[ée]|\d)|\bpar\s+(?:parts?|moiti[ée]s?)\s+[ée]gales?|\b[àa]\s+concurrence\s+de\s+\d{1,3}\s*(?:%|centi[èe]mes?|\/\s*\d+)|\bpour\s+(?:une\s+)?moiti[ée]\s+indivise\b|\bproportions?\s+suivantes?\b/i;
  var RE_ANCRE_ACQUISITION = /\bacqu[ièé]r|\bacquisition\b|\bacqu[ée]reurs?\b|\bb[ée]n[ée]ficiaires?\b|\bindivision\b/i;
  var RE_ANCRE_CESSION = /\bvend(?:ent|eurs?|u|ue)\b|\bc[ée]d(?:ent|ants?)\b|quotit[ée]s?\s+vendues?/i;
  var PORTEE_ANCRE_QUOTITE = 300;

  function quotitesAcquisitionPresentes(texte) {
    const src = String(texte || '');
    const re = new RegExp(RE_QUOTITE_ACQUISITION.source, 'gi');
    let m;
    while ((m = re.exec(src)) !== null) {
      const zone = src.slice(Math.max(0, m.index - PORTEE_ANCRE_QUOTITE), m.index + PORTEE_ANCRE_QUOTITE);
      if (RE_ANCRE_CESSION.test(zone)) continue;
      if (RE_ANCRE_ACQUISITION.test(zone)) return true;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return false;
  }

  // Rôle du marqueur le plus proche EN AMONT d'une position. Renvoie null si aucun marqueur ne
  // précède — le statut n'est alors attribué à personne, plutôt qu'aux acquéreurs par défaut.
  function roleLePlusProcheAvant(texte, index, reVendeur, reAcquereur) {
    const avant = String(texte).slice(0, index);
    let meilleur = null;
    const cherche = (re, role) => {
      const g = new RegExp(re.source, 'gi');
      let m, pos = -1;
      while ((m = g.exec(avant)) !== null) { pos = m.index; if (g.lastIndex === m.index) g.lastIndex++; }
      if (pos >= 0 && (!meilleur || pos > meilleur.index)) meilleur = { index: pos, role };
    };
    cherche(reVendeur, 'VENDEUR');
    cherche(reAcquereur, 'ACQUEREUR');
    return meilleur ? meilleur.role : null;
  }

  // Présentation de l'acquéreur : entre le libellé du vendeur et celui de l'acquéreur quand l'acte
  // présente puis étiquette (« …, ci-après dénommé L'ACQUÉREUR »), ou le bloc qui suit le titre
  // quand il titre puis présente (« BÉNÉFICIAIRE : Monsieur X… »). null si l'acquéreur n'est pas
  // trouvé : la recherche porte alors sur tout le texte, comme avant.
  function zonePresentationAcquereur(src, qV, qA) {
    if (!qA || qA.index == null || qA.index < 0) return null;
    const idx = qA.index;
    if (estStyleLabelEntreGuillemets(src, idx)) {
      const debut = qV && qV.index != null && qV.index < idx ? qV.index : Math.max(0, idx - 1500);
      return { debut, fin: idx };
    }
    const bloc = extraireBlocPartie(src, qA.re, idx);
    return { debut: idx, fin: bloc ? bloc.finAbsolue : Math.min(src.length, idx + 1500) };
  }

  function detecterStatutAcquereurs(texte, pages) {
    const src = String(texte || '');
    if (!src) return { statut: null, regime: null, quotites: false, phrase: '', page: null };

    const type = typeof detecterTypeActe === 'function' ? (detecterTypeActe(src).valeur || 'INCONNU') : 'INCONNU';
    const qV = typeof qualitePourRole === 'function' ? qualitePourRole(src, type, 'VENDEUR') : null;
    const qA = typeof qualitePourRole === 'function' ? qualitePourRole(src, type, 'ACQUEREUR') : null;
    const reVendeur = qV ? qV.re : RE_ROLE_VENDEUR;
    const reAcquereur = qA ? qA.re : RE_ROLE_ACQUEREUR;

    // Le statut n'est cherché QUE dans la présentation de l'acquéreur. Cherché dans tout l'acte, il
    // s'accrochait à n'importe quelle clause qui cite un acquéreur et un conjoint (« le notaire
    // notifie au syndic le nom du candidat acquéreur… et de son conjoint ») : une acquéreuse
    // divorcée ressortait « mariée, régime non précisé » sur deux vrais actes.
    const zone = zonePresentationAcquereur(src, qV, qA);
    const premiereMentionAcquereur = (re) => {
      const g = new RegExp(re.source, 'gi');
      let m;
      while ((m = g.exec(src)) !== null) {
        if (g.lastIndex === m.index) g.lastIndex++;
        if (zone && (m.index < zone.debut || m.index > zone.fin)) continue;
        const avant = src.slice(Math.max(0, m.index - FENETRE_NEGATION_STATUT), m.index);
        if (RE_NEGATION_STATUT.test(avant)) {
          noterDiagnosticOutil2('statut', 'ecartee', 'Statut nié (« non pacsés », « ne sont pas mariés »…)', phraseAutour(src, m.index, 120, 200).phrase, m.index);
          continue;
        }
        // La zone suffit quand elle est connue : sur un acte qui présente PUIS étiquette (« …, dénommés
        // ci-après le BÉNÉFICIAIRE »), le marqueur de rôle le plus proche en amont est celui du VENDEUR,
        // et le « célibataire » des bénéficiaires n'était jamais retenu.
        if (!zone && roleLePlusProcheAvant(src, m.index, reVendeur, reAcquereur) !== 'ACQUEREUR') continue;
        return m.index;
      }
      return null;
    };

    // Ordre de préférence : un couple présenté comme concubin peut aussi être dit « célibataire »
    // pour chacun de ses membres — le statut du couple prime sur celui de chaque personne.
    const candidats = [
      { statut: 'marie', index: premiereMentionAcquereur(RE_STATUT_MARIE) },
      { statut: 'pacse', index: premiereMentionAcquereur(RE_STATUT_PACSE) },
      { statut: 'concubins', index: premiereMentionAcquereur(RE_STATUT_CONCUBINS) },
      { statut: 'seul', index: premiereMentionAcquereur(RE_STATUT_SEUL) }
    ];
    const retenu = candidats.find(c => c.index != null) || null;

    // Le régime est cherché dans la CLAUSE qui porte le statut, jamais dans tout l'acte : celui du
    // vendeur y figure aussi, et le reprendre serait pire qu'un « non précisé ».
    let regime = null;
    let phrase = '';
    let page = null;
    if (retenu) {
      const p = phraseAutour(src, retenu.index, 250, 350);
      phrase = p.phrase;
      page = pageDepuisIndexPages(pages, p.debut);
      const reRegime = retenu.statut === 'pacse' ? RE_REGIME_PACS : RE_REGIME_MATRIMONIAL;
      // Cherché dans la PHRASE ENTIÈRE et non dans l'extrait cité, que phraseAutour() coupe à une
      // longueur fixe : « … un pacte civil de solidarité sous le régime de la sépar » — le régime,
      // pourtant écrit, ressortait « non précisé ».
      const mr = phraseContenant(src, retenu.index).texte.match(reRegime) || phrase.match(reRegime);
      if (mr) regime = mr[0].trim();
      noterDiagnosticOutil2('statut', 'retenue', `Retenu : ${retenu.statut === 'marie' ? 'mariés' : retenu.statut === 'pacse' ? 'pacsés' : retenu.statut === 'concubins' ? 'concubins' : 'seul(e)'}`
        + (retenu.statut === 'marie' || retenu.statut === 'pacse' ? (regime ? ` — régime lu : ${regime}` : ' — régime non lu dans la clause') : '')
        + (zone ? '' : ' (présentation de l’acquéreur non délimitée : rôle déduit du marqueur le plus proche)'), phrase, p.debut);
    } else {
      noterDiagnosticOutil2('statut', 'ecartee', zone ? 'Aucun statut lu dans la présentation de l’acquéreur' : 'Présentation de l’acquéreur non délimitée et aucun statut rattaché à lui', '', null);
    }

    return {
      statut: retenu ? retenu.statut : null,
      regime,
      quotites: quotitesAcquisitionPresentes(src),
      phrase, page
    };
  }

  var LIBELLES_STATUT_ACQUEREURS = {
    marie: 'Mariés', pacse: 'Pacsés', concubins: 'Concubins', seul: 'Non mariés (célibataire, veuf ou divorcé)'
  };

  function libelleStatutAcquereurs(statut) {
    if (!statut || !statut.statut) return null;
    const base = LIBELLES_STATUT_ACQUEREURS[statut.statut] || null;
    if (!base) return null;
    if (statut.statut === 'marie' || statut.statut === 'pacse') {
      return base + (statut.regime ? ` — ${statut.regime}` : ' — régime non précisé');
    }
    return base;
  }

  // nbAcquereurs vient de l'extraction (detecterParties) : c'est lui qui distingue une acquisition
  // à deux, où les quotités doivent être dites, d'un achat par une seule personne.
  function constatsStatutAcquereurs(statut, nbAcquereurs) {
    const constats = [];
    if (!statut) return constats;
    const n = Number(nbAcquereurs) || 0;
    const base = { categorie: 'PARTIES', phrase: statut.phrase || '', page: statut.page || null };

    if (!statut.statut) {
      if (n >= 2) {
        constats.push({ ...base, gravite: 'A_VERIFIER',
          titre: 'Statut des acquéreurs non précisé',
          description: "L'acte ne dit pas si les acquéreurs sont mariés, pacsés ou concubins. C'est ce statut qui commande le régime de propriété du bien et les quotités à indiquer." });
      }
      return constats;
    }

    if (statut.statut === 'marie' && !statut.regime) {
      constats.push({ ...base, gravite: 'A_VERIFIER',
        titre: 'Régime matrimonial des acquéreurs non précisé',
        description: "Le régime détermine si le bien tombe en communauté ou reste propre. Faire préciser la date et le lieu du mariage, et l'existence ou non d'un contrat." });
    }
    if (statut.statut === 'pacse' && !statut.regime) {
      constats.push({ ...base, gravite: 'A_VERIFIER',
        titre: 'Régime du PACS non précisé',
        description: "Séparation des patrimoines (régime légal depuis 2007) ou indivision : sans cette précision, la propriété du bien acquis n'est pas déterminée." });
    }
    if ((statut.statut === 'pacse' || statut.statut === 'concubins' || statut.statut === 'seul') && n >= 2 && !statut.quotites) {
      constats.push({ ...base, gravite: 'IMPORTANT',
        titre: 'Acquisition à deux hors mariage, sans quotités indiquées',
        description: "Hors communauté, les acquéreurs achètent en indivision. À défaut de quotités écrites, chacun est réputé propriétaire pour moitié, quelle que soit sa participation réelle au financement." });
    }
    if (statut.statut === 'marie' && n === 1) {
      constats.push({ ...base, gravite: 'A_VERIFIER',
        titre: 'Acquéreur marié achetant seul',
        description: "Selon le régime, le bien peut tomber en communauté malgré l'achat au nom d'un seul époux. Vérifier s'il faut une déclaration d'emploi ou de remploi, et l'intervention du conjoint." });
    }
    return constats;
  }

  // --- Conjoint du VENDEUR : logement de la famille (art. 215 al. 3 C. civ.) ------------------
  //
  // Demandé par l'étude : si le vendeur est marié mais SEUL propriétaire, penser à faire intervenir
  // le conjoint pour la vente de la résidence principale. Le consentement du conjoint est exigé pour
  // aliéner le logement de la famille (art. 215, al. 3 C. civ.), QUEL QUE SOIT le régime matrimonial
  // et même quand le bien est un propre du vendeur. Détecté en parallèle du statut des acquéreurs,
  // mais dans la présentation du VENDEUR (même piège d'attribution : ne pas prendre le statut de
  // l'acquéreur pour celui du vendeur, d'où la zone dédiée ci-dessous).
  var RE_RESIDENCE_PRINCIPALE = /r[ée]sidence\s+principale|logement\s+de\s+la\s+famille|logement\s+familial|[àa]\s+usage\s+d['’]habitation\s+principale/i;
  // L'acte prévoit déjà l'intervention/le consentement du conjoint : on ne signale alors rien.
  var RE_CONSENTEMENT_CONJOINT = /consentement\s+(?:de\s+son|du|de\s+la)\s+conjoint|conjoint\s+(?:intervient|comparant|comparante|consent|donne\s+son\s+consentement)|intervention\s+du\s+conjoint|article\s+215|[àa]\s+l['’]effet\s+de\s+consentir\s+[àa]\s+la\s+vente/i;

  // Présentation du vendeur : le bloc AVANT son étiquette (« …, ci-après dénommé LE VENDEUR »), ou
  // le bloc qui SUIT le titre (« VENDEUR : Monsieur X… »), borné par la présentation de l'acquéreur.
  // null si le vendeur n'est pas localisé — on ne cherche alors rien (mieux vaut ne rien dire que de
  // confondre les deux parties).
  function zonePresentationVendeur(src, qV, qA) {
    if (!qV || qV.index == null || qV.index < 0) return null;
    const idx = qV.index;
    if (estStyleLabelEntreGuillemets(src, idx)) {
      return { debut: Math.max(0, idx - 1500), fin: idx };
    }
    const bloc = extraireBlocPartie(src, qV.re, idx);
    let fin = bloc ? bloc.finAbsolue : Math.min(src.length, idx + 1500);
    if (qA && qA.index != null && qA.index > idx && qA.index < fin) fin = qA.index;
    return { debut: idx, fin };
  }

  function detecterStatutVendeur(texte, pages) {
    const src = String(texte || '');
    if (!src) return { marie: false, phrase: '', page: null };
    const type = typeof detecterTypeActe === 'function' ? (detecterTypeActe(src).valeur || 'INCONNU') : 'INCONNU';
    const qV = typeof qualitePourRole === 'function' ? qualitePourRole(src, type, 'VENDEUR') : null;
    const qA = typeof qualitePourRole === 'function' ? qualitePourRole(src, type, 'ACQUEREUR') : null;
    const zone = zonePresentationVendeur(src, qV, qA);
    if (!zone) return { marie: false, phrase: '', page: null };
    const g = new RegExp(RE_STATUT_MARIE.source, 'gi');
    let m;
    while ((m = g.exec(src)) !== null) {
      if (g.lastIndex === m.index) g.lastIndex++;
      if (m.index < zone.debut || m.index > zone.fin) continue;
      const avant = src.slice(Math.max(0, m.index - FENETRE_NEGATION_STATUT), m.index);
      if (RE_NEGATION_STATUT.test(avant)) continue;
      const p = phraseAutour(src, m.index, 200, 300);
      return { marie: true, phrase: p.phrase, page: pageDepuisIndexPages(pages, p.debut) };
    }
    return { marie: false, phrase: '', page: null };
  }

  // nbVendeurs vient de l'extraction (detecterParties) : deux vendeurs (les deux époux) → le conjoint
  // intervient déjà, rien à signaler ; un seul vendeur marié → c'est le cas visé.
  function constatsConjointVendeur(statutVendeur, nbVendeurs, texte) {
    if (!statutVendeur || !statutVendeur.marie) return [];
    if ((Number(nbVendeurs) || 0) >= 2) return [];
    const src = String(texte || '');
    if (RE_CONSENTEMENT_CONJOINT.test(src)) return []; // l'acte prévoit déjà l'intervention du conjoint
    const rp = RE_RESIDENCE_PRINCIPALE.test(src);
    const base = { categorie: 'PARTIES', phrase: statutVendeur.phrase || '', page: statutVendeur.page || null };
    return [rp
      ? { ...base, gravite: 'IMPORTANT',
          titre: 'Logement de la famille : intervention du conjoint du vendeur',
          description: "Le vendeur est marié et seul propriétaire, et le bien est présenté comme résidence principale. La vente du logement de la famille exige le consentement du conjoint (art. 215, al. 3 C. civ.), quel que soit le régime matrimonial et même si le bien est un propre du vendeur : faire intervenir le conjoint à l'acte." }
      : { ...base, gravite: 'A_VERIFIER',
          titre: 'Vendeur marié seul propriétaire : intervention du conjoint à vérifier',
          description: "Le vendeur est marié et vend seul. Si le bien constitue le logement de la famille (résidence principale), le conjoint doit consentir à la vente (art. 215, al. 3 C. civ.), même si le bien est un propre du vendeur : le faire alors intervenir à l'acte." }];
  }

  // --- Carnet d'entretien de l'immeuble (copropriété) -----------------------------------------
  //
  // Périmètre choisi par l'étude parmi ce que le carnet contient : SEULEMENT les travaux
  // importants déjà réalisés sur l'immeuble — à croiser avec les assemblées générales et les
  // autorisations d'urbanisme. Les contrats d'entretien, les assurances de l'immeuble et la date
  // de mise à jour du carnet n'ont PAS été retenus : ne pas les rajouter sans nouvelle demande,
  // c'est ce qui garde le rapport court.
  //
  // Le carnet n'est cherché QUE si le type de bien est « copropriété » : c'est un document du
  // syndicat (art. 18 de la loi du 10 juillet 1965), il n'existe pas sur une maison.
  var RE_CARNET_ENTRETIEN = /carnet\s+d['’]?\s*entretien/i;

  function analyserCarnetEntretien(doc, aujourdHui) {
    if (!doc) return null;
    const nom = typeof normaliserNomPourMotif === 'function' ? normaliserNomPourMotif(doc.nom || '') : String(doc.nom || '');
    const tete = String(doc.texte || '').slice(0, 400);
    if (!RE_CARNET_ENTRETIEN.test(nom) && !RE_CARNET_ENTRETIEN.test(tete)) return null;
    // Un avant-contrat CITE le carnet d'entretien dans presque chaque acte de copropriété : sans
    // ce garde-fou, il se prendrait lui-même pour un carnet. Même piège que l'état daté.
    if (RE_DOC_AVANT_CONTRAT.test(nom) || RE_DOC_AVANT_CONTRAT.test(tete)) return null;
    const travaux = detecterTravauxRealises(doc.texte, doc.pages || null, aujourdHui)
      .map(t => ({ ...t, document: doc.nom }));
    return { nom: doc.nom, travaux };
  }

  // --- Type de bien : déduit, affiché, corrigeable ---------------------------------------------
  //
  // Jusqu'ici la copropriété et le terrain à bâtir étaient déduits en silence, chacun de son côté.
  // L'étude a demandé que le type soit DIT et corrigeable : c'est lui qui décide des contrôles
  // propres à chaque type (assemblées générales, état daté et carnet d'entretien en copropriété ;
  // permis de construire et purge des délais sur un terrain à bâtir ; rien de spécifique sur une
  // maison). Un type déduit de travers rendait donc muette toute une partie du rapport, sans que
  // rien ne l'explique.
  //
  // L'ordre des essais est celui de la fiabilité : le dossier CLAIRE lié (l'étude l'a choisi
  // elle-même), puis le texte, puis « maison » par défaut — c'est le cas majoritaire, et le seul
  // qui n'ajoute aucun contrôle, donc le repli le moins coûteux quand rien ne tranche.
  var TYPES_BIEN_AUDIT = [
    { valeur: 'maison', libelle: 'Maison / immeuble' },
    { valeur: 'copropriete', libelle: 'Copropriété' },
    { valeur: 'terrain', libelle: 'Terrain à bâtir' }
  ];

  function deduireTypeBienOutil2(entree) {
    const dossierLie = (entree && entree.dossierLie) || null;
    if (dossierLie && (dossierLie.typeVente === 'copropriete' || dossierLie.typeVente === 'terrain' || dossierLie.typeVente === 'maison')) {
      return { type: dossierLie.typeVente, origine: 'dossier' };
    }
    const textes = [
      (entree && entree.texteProjet) || '',
      (entree && entree.texteAvantContrat) || '',
      (entree && entree.texte) || ''
    ].filter(Boolean);
    // La copropriété est testée avant le terrain : son détecteur gère déjà les clauses de négation
    // (« le bien n'est pas soumis au statut de la copropriété »), le motif du terrain non.
    if (typeof detecterTypeVenteCopropriete === 'function' && textes.some(t => detecterTypeVenteCopropriete(t))) {
      return { type: 'copropriete', origine: 'texte' };
    }
    // estTerrainABatir reste la seule définition du terrain à bâtir : sa branche « dossier lié »
    // est déjà traitée ci-dessus, il ne reste ici que sa lecture du texte.
    if (estTerrainABatir(entree)) return { type: 'terrain', origine: 'texte' };
    return { type: 'maison', origine: 'defaut' };
  }

  // typeBienForce = la correction faite à la main dans le rapport. Elle l'emporte sur tout le
  // reste : c'est elle qui rend la déduction « corrigeable » plutôt que seulement affichée.
  function typeBienPourAudit(entree) {
    const force = entree && entree.typeBienForce;
    if (force === 'maison' || force === 'copropriete' || force === 'terrain') {
      return { type: force, origine: 'manuel' };
    }
    return deduireTypeBienOutil2(entree);
  }

  // --- Thème 2 : diagnostics et entretiens datés dans l'acte ---------------------------------
  // Cherche chaque document connu dans le texte, puis la première date qui suit dans la même
  // phrase — la rédaction notariale est constante sur ce point (« … établi le 12 mars 2024 par la
  // société X », « … en date du 5 janvier 2026 »).
  // Trois sortes de mentions d'un diagnostic qui NE décrivent PAS un document de CE dossier, et
  // qui produisaient à elles seules l'essentiel du bruit du rapport (« trop de choses sans
  // intérêt », dit l'étude) — rejoué sur neuf avant-contrats réels :
  //  - le TABLEAU légal « durée de validité des documents constituant le dossier de diagnostic
  //    technique », rappelé dans chaque trame d'office : chaque ligne (« Etat amiante Illimitée »,
  //    « DPE 10 ans ») devenait un « date non trouvée » — huit constats par acte, sur tous les actes ;
  //  - une phrase NORMATIVE (« Un audit énergétique doit être réalisé lorsque… ») ;
  //  - une date de CALENDRIER LÉGAL (« à compter du 1er avril 2023 pour les logements de la classe F
  //    ou G ») prise pour la date d'établissement — un audit « périmé » en CRITIQUE sur un acte qui
  //    n'en annexait aucun.
  // Une mention de ce type est ignorée ; si elles le sont toutes, le document n'est pas signalé.
  var RE_LIGNE_TABLEAU_VALIDITE = /^[^.]{0,50}?(?:illimit[ée]e|\b\d{1,2}\s+(?:ans?|mois)\b)/i;
  var RE_MENTION_NORMATIVE_DIAG = /\bdoi(?:t|vent)\s+(?:obligatoirement\s+)?[êe]tre\s+(?:r[ée]alis|[ée]tabli|fourni|annex|produit)|\best\s+obligatoire\b|\bsont\s+tenus\b/i;
  var RE_DATE_CALENDRIER_LEGAL = /[àa]\s+compter\s+du|[àa]\s+partir\s+du|\b(?:loi|d[ée]cret|ordonnance|arr[êe]t[ée])\b/i;

  // Le diagnostic n'est PAS requis pour ce bien, et l'acte le dit : « l'immeuble n'est pas inclus
  // dans une zone contaminée », « ne comporte aucune installation intérieure de gaz », « permis de
  // construire délivré après le 1er juillet 1997, il n'entre pas dans le champ d'application ». Sur
  // deux actes réels, cette dernière date était lue comme celle du repérage amiante, qui ressortait
  // « périmé » en CRITIQUE — alors qu'il n'y a précisément aucun repérage à produire.
  var RE_DIAG_NON_REQUIS = /n['’]\s*(?:entre|est|sont)\s+pas\s+(?:dans\s+le\s+champ|inclus|concern|soumis|n[ée]cessaire|requis|[ée]quip|situ[ée])|\bne\s+comporte\s+(?:aucune?|pas)\b|\bn['’]a\s+pas\s+[ée]t[ée]\s+(?:[ée]tabli|r[ée]alis)|\baucun\s+[ée]tat\b|construits?\s+(?:apr[èe]s|post[ée]rieurement\s+au)\s+(?:le\s+)?1(?:er)?\s+janvier\s+1949|(?:d[ée]livr[ée]|permis)[^.]{0,60}(?:apr[èe]s|post[ée]rieurement\s+au)\s+(?:le\s+)?1(?:er)?\s+juillet\s+1997|\bpas\s+n[ée]cessaire\b|\bil\s+n['’]y\s+a\s+pas\s+lieu\b/i;

  function mentionDiagnosticUtile(src, m, label) {
    const apres = src.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const phrase = phraseAutour(src, m.index, 120, 260).phrase;
    const ecarter = (raison) => { noterDiagnosticOutil2('diagnostics', 'ecartee', raison, phrase, m.index, label); return null; };
    if (RE_LIGNE_TABLEAU_VALIDITE.test(apres)) return ecarter('Ligne du tableau légal des durées de validité');
    if (RE_MENTION_NORMATIVE_DIAG.test(phrase)) return ecarter('Phrase normative (« doit être établi… »)');
    if (RE_DIAG_NON_REQUIS.test(phrase)) return ecarter('Non requis pour ce bien, l’acte le dit');
    const fragment = fragmentApres(src, m.index, 300);
    let date = premiereDateDansFragment(fragment);
    let dateLoi = false;
    if (date) {
      // La date n'est retenue que si rien, entre la mention et elle, n'en fait une date de loi.
      const posDate = fragment.search(/\d{1,2}(?:er)?[\s\/.-]/);
      const entre = posDate === -1 ? fragment : fragment.slice(0, posDate);
      if (RE_DATE_CALENDRIER_LEGAL.test(entre)) { date = null; dateLoi = true; }
    }
    return { index: m.index, date, phrase, dateLoi };
  }

  function detecterDocumentsDatesOutil2(texte, pages, aujourdHui) {
    const src = String(texte || '');
    const trouves = [];
    for (const cle of Object.keys(DOCUMENTS_VALIDITE_OUTIL2)) {
      const entree = DOCUMENTS_VALIDITE_OUTIL2[cle];
      const re = new RegExp(entree.motif.source, 'gi');
      let m;
      let retenue = null;
      while ((m = re.exec(src)) !== null) {
        const mention = mentionDiagnosticUtile(src, m, entree.label);
        if (mention && (!retenue || (!retenue.date && mention.date))) retenue = mention;
        if (retenue && retenue.date) break;
        if (re.lastIndex === m.index) re.lastIndex++;
      }
      if (!retenue) continue;
      const date = retenue.date;
      noterDiagnosticOutil2('diagnostics', 'retenue',
        `Retenue : ${entree.label}, ` + (date ? `daté du ${formatDateFr(date)}` : (retenue.dateLoi ? 'date lue écartée (date d’un texte de loi)' : 'aucune date lue dans la clause')),
        retenue.phrase, retenue.index);
      m = { index: retenue.index };
      trouves.push({
        cle, label: entree.label, famille: entree.famille,
        dateEtablissement: date,
        page: pageDepuisIndexPages(pages, m.index),
        phrase: retenue.phrase,
        validite: calculerValiditeDocumentOutil2(cle, date, aujourdHui)
      });
    }
    return trouves;
  }

  // Les documents dont la date n'est pas écrite dans l'acte (elle figure dans le DDT annexé) sont
  // REGROUPÉS en un seul constat par famille, qui les nomme tous : un par diagnostic, c'était cinq
  // à huit lignes identiques sur chaque acte réel — la première cause du « trop de choses sans
  // intérêt » signalé par l'étude. Rien n'est perdu : la liste est dans le titre du constat.
  function constatsDocumentsDates(documents) {
    const constats = [];
    const sansDate = [];
    for (const d of documents || []) {
      const v = d.validite || {};
      if (v.statut === 'EXPIRE') {
        constats.push({
          categorie: d.famille === 'entretien' ? 'ENTRETIENS' : 'DIAGNOSTICS',
          gravite: 'CRITIQUE',
          titre: `${d.label} périmé`,
          description: v.message, phrase: d.phrase, page: d.page
        });
      } else if (v.statut === 'DATE_MANQUANTE') {
        sansDate.push(d);
      } else if (v.statut === 'NON_CALCULABLE') {
        constats.push({
          categorie: d.famille === 'entretien' ? 'ENTRETIENS' : 'DIAGNOSTICS',
          gravite: 'INFORMATION',
          titre: `${d.label} : validité à vérifier`,
          description: v.message, phrase: d.phrase, page: d.page
        });
      }
    }
    for (const famille of ['diagnostic', 'entretien']) {
      const lot = sansDate.filter(d => (d.famille === 'entretien') === (famille === 'entretien'));
      if (!lot.length) continue;
      const libelles = lot.map(d => d.label);
      constats.push({
        categorie: famille === 'entretien' ? 'ENTRETIENS' : 'DIAGNOSTICS',
        gravite: 'A_VERIFIER',
        titre: lot.length === 1
          ? `${libelles[0]} : date non trouvée dans l'acte`
          : `${lot.length} ${famille === 'entretien' ? 'entretiens' : 'diagnostics'} sans date dans l'acte : ${libelles.join(', ')}`,
        description: "L'acte les cite sans en donner la date d'établissement : la vérifier sur le dossier de diagnostic technique annexé, pour s'assurer qu'aucun n'aura expiré le jour de la signature.",
        phrase: lot[0].phrase, page: lot[0].page
      });
    }
    return constats;
  }

  // --- Thèmes 3 et 4 : ce que le vendeur doit fournir ou faire --------------------------------
  // Réutilise TELLE QUELLE l'extraction de l'outil 1 (extraireEngagementsVendeur), éprouvée sur de
  // vrais actes — « la même chose que pour l'outil 1 mais en plus poussé » : le « plus poussé »
  // est ici le rapprochement avec les justificatifs déposés et le contrôle de leurs dates.
  var GRAVITE_PAR_TYPE_ENGAGEMENT = { travaux: 'CRITIQUE', entretien: 'IMPORTANT', document: 'IMPORTANT', autre: 'A_VERIFIER' };

  function constatsEngagementsVendeur(engagements, justificatifsParCle, aujourdHui) {
    const constats = [];
    for (const e of engagements || []) {
      const cle = clePourEngagement(e.phrase);
      const justif = cle && justificatifsParCle ? justificatifsParCle[cle] : null;
      const categorie = e.type === 'travaux' ? 'TRAVAUX_A_FAIRE' : (e.type === 'entretien' ? 'ENTRETIENS' : 'DOCUMENTS');
      if (justif && justif.document) {
        const v = calculerValiditeDocumentOutil2(cle, justif.date, aujourdHui);
        if (v.statut === 'EXPIRE') {
          constats.push({
            categorie, gravite: 'CRITIQUE',
            titre: `${v.label} fourni mais PÉRIMÉ`,
            description: `${justif.document} — ${v.message}`,
            phrase: e.phrase, page: e.page
          });
        } else if (v.statut === 'DATE_MANQUANTE') {
          constats.push({
            categorie, gravite: 'A_VERIFIER',
            titre: `${DOCUMENTS_VALIDITE_OUTIL2[cle].label} fourni, date illisible`,
            description: `${justif.document} — aucune date n'a pu être lue dans le document : la vérifier à l'œil.`,
            phrase: e.phrase, page: e.page
          });
        }
        continue; // Justificatif présent et valable : rien à signaler.
      }
      constats.push({
        categorie,
        gravite: GRAVITE_PAR_TYPE_ENGAGEMENT[e.type] || 'A_VERIFIER',
        titre: e.type === 'travaux'
          ? 'Travaux à réaliser par le vendeur avant la vente'
          : (cle ? `${DOCUMENTS_VALIDITE_OUTIL2[cle].label} : à obtenir du vendeur` : "Document à obtenir du vendeur"),
        description: cle
          ? `Aucun justificatif déposé pour « ${DOCUMENTS_VALIDITE_OUTIL2[cle].label} ».`
          : "Engagement du vendeur relevé dans l'acte, sans justificatif déposé.",
        phrase: e.phrase, page: e.page
      });
    }
    return constats;
  }

  // Relie une clause d'engagement à une entrée de la table de validité, quand elle en désigne une :
  // c'est ce qui permet ensuite de dater le justificatif déposé et d'en contrôler l'ancienneté.
  function clePourEngagement(phrase) {
    const p = String(phrase || '');
    for (const cle of Object.keys(DOCUMENTS_VALIDITE_OUTIL2)) {
      if (DOCUMENTS_VALIDITE_OUTIL2[cle].motif.test(p)) return cle;
    }
    return null;
  }

  // --- Justificatifs déposés ------------------------------------------------------------------
  // La date d'un justificatif est cherchée d'abord derrière un marqueur explicite (« établi le »,
  // « en date du », « date d'intervention »…), et seulement à défaut comme première date du
  // document : la toute première date d'un PDF est souvent sa date d'impression, pas celle de
  // l'intervention.
  var RE_MARQUEUR_DATE_DOCUMENT = /(?:[ée]tabli(?:e)?\s+le|en\s+date\s+du|dat[ée]\s+du|r[ée]alis[ée]\s+le|effectu[ée]\s+le|date\s+(?:de\s+(?:la\s+)?(?:visite|l['’]?intervention|r[ée]alisation)|d['’]?intervention|d['’]?[ée]tablissement|du\s+contr[ôo]le)|fait\s+le|le\s+pr[ée]sent\s+(?:rapport|certificat|constat)[^.]{0,40}\ble\b)/gi;
  var TAILLE_ENTETE_JUSTIFICATIF = 6000;

  function dateDuJustificatif(texte) {
    const entete = String(texte || '').slice(0, TAILLE_ENTETE_JUSTIFICATIF);
    const re = new RegExp(RE_MARQUEUR_DATE_DOCUMENT.source, 'gi');
    let m;
    while ((m = re.exec(entete)) !== null) {
      const date = premiereDateDansFragment(entete.slice(m.index + m[0].length, m.index + m[0].length + 60));
      if (date) return date;
    }
    return premiereDateDansFragment(entete);
  }

  // Rapproche chaque justificatif déposé d'une entrée de la table, par son NOM de fichier d'abord
  // (le plus fiable : c'est l'étude qui le nomme), par son contenu ensuite.
  function rapprocherJustificatifs(documentsDeposes) {
    const parCle = {};
    for (const doc of documentsDeposes || []) {
      const nom = normaliserNomPourMotif(doc.nom || '');
      const texte = String(doc.texte || '');
      for (const cle of Object.keys(DOCUMENTS_VALIDITE_OUTIL2)) {
        if (parCle[cle]) continue;
        const motif = DOCUMENTS_VALIDITE_OUTIL2[cle].motif;
        if (!motif.test(nom) && !motif.test(texte.slice(0, 3000))) continue;
        parCle[cle] = { document: doc.nom, date: dateDuJustificatif(texte) };
      }
    }
    return parCle;
  }

  var ORDRE_GRAVITE_OUTIL2 = { CRITIQUE: 0, IMPORTANT: 1, A_VERIFIER: 2, INFORMATION: 3 };

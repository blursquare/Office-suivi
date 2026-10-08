  // ==== OUTIL 2 : ASSEMBLÉES GÉNÉRALES DE COPROPRIÉTÉ =========================================
  //
  // Point de vigilance demandé par l'étude, propre aux ventes en copropriété, en deux volets :
  //   1. une AG tenue ENTRE la signature de l'avant-contrat et celle de la vente — si des travaux
  //      y ont été votés, la question de qui les paie se pose (art. 6-2 de la loi du 10 juillet
  //      1965 : le débiteur est celui qui est copropriétaire à la date d'exigibilité de l'appel,
  //      sauf convention contraire entre les parties), et l'acquéreur doit en avoir été informé ;
  //   2. plus généralement, les travaux votés lors des TROIS dernières assemblées, que le vendeur
  //      doit porter à la connaissance de l'acquéreur (les PV des trois dernières AG font partie
  //      des pièces à remettre).
  //
  // Les AG sont cherchées dans TOUS les textes disponibles (avant-contrat, projet, justificatifs
  // déposés — PV d'AG, état daté, pré-état daté) : la clause « Assemblées générales » d'un
  // avant-contrat les liste souvent, mais c'est le PV lui-même qui dit ce qui a été voté.
  //
  // PIÈGE \b DÉJÀ DOCUMENTÉ pour DOCUMENTS_VALIDITE_OUTIL2 : en JavaScript \b ne connaît pas les
  // lettres accentuées, aucune alternative ci-dessous ne commence donc par \b suivi d'un accent.

  var NB_AG_A_EXAMINER = 3;

  // Une AG est toujours datée dans un acte ou un PV. On s'ancre sur le mot puis sur la date qui
  // suit dans la même phrase — jamais sur le mot seul, qui apparaît aussi dans des clauses de
  // style (« les décisions d'assemblée générale s'imposent à l'acquéreur ») sans désigner une
  // réunion précise.
  var RE_MENTION_AG = /(?:assembl[ée]e\s+g[ée]n[ée]rale(?:\s+(?:ordinaire|extraordinaire|annuelle))?|proc[èe]s[- ]verbal\s+d['’]assembl[ée]e(?:\s+g[ée]n[ée]rale)?|\bAGO\b|\bAGE\b)/gi;
  // Ce qui sépare la mention de sa date doit être un connecteur, et RIEN d'autre : motif ancré des
  // deux bouts, sur une courte liste de qualificatifs admis puis le connecteur lui-même. Un simple
  // `(?:du|le)\s*$` suffisait à accepter « l'assemblée générale statuera sur ces travaux AVANT LE
  // 30 juin 2026 » — une échéance à venir prise pour une réunion tenue (test de régression dédié).
  var RE_CONNECTEUR_DATE_AG = /^\s*(?:(?:ordinaire|extraordinaire|annuelle|des\s+copropri[ée]taires|de\s+la\s+copropri[ée]t[ée]|du\s+syndicat|de\s+l['’]immeuble)\s*)*(?:en\s+date\s+du|dat[ée]e?\s+du|tenue\s+le|r[ée]unie\s+le|qui\s+s['’]est\s+tenue\s+le|s['’]est\s+tenue\s+le|du|le)\s*$/i;

  // Travaux VOTÉS (pas seulement évoqués) : le verbe de décision doit être là. Une résolution
  // rejetée ne compte pas — c'est le pendant, ici, de la clause de style « aucun travaux » déjà
  // écartée pour les travaux réalisés (RE_AUCUN_TRAVAUX).
  var RE_TRAVAUX_VOTES = /(?:vot[ée]s?|adopt[ée]s?|approuv[ée]s?|d[ée]cid[ée]s?|autoris[ée]s?)[^.]{0,80}travaux|travaux[^.]{0,80}(?:ont\s+[ée]t[ée]\s+)?(?:vot[ée]s?|adopt[ée]s?|approuv[ée]s?|d[ée]cid[ée]s?)|r[ée]solution\s+n[°ºo]?\s*\d+[^.]{0,150}travaux|appels?\s+de\s+fonds[^.]{0,80}travaux/i;
  var RE_RESOLUTION_REJETEE = /(?:rejet[ée]e?s?|refus[ée]e?s?|non\s+adopt[ée]e?s?|n['’]a\s+pas\s+[ée]t[ée]\s+(?:adopt[ée]e?|vot[ée]e?|approuv[ée]e?)|ajourn[ée]e?s?|report[ée]e?s?)/i;
  // Formule de style fréquente, qui n'annonce AUCUN travail voté : « aucun travaux n'a été voté
  // lors des trois dernières assemblées générales ». Sans ce garde-fou, la phrase qui rassure
  // produirait exactement l'alerte qu'elle vient d'écarter.
  var RE_AUCUN_TRAVAUX_VOTE = /(?:aucun\s+travaux?|aucune\s+d[ée]cision\s+de\s+travaux|pas\s+de\s+travaux)[^.]{0,80}(?:vot[ée]|adopt[ée]|d[ée]cid[ée]|pr[ée]vu)/i;

  var FENETRE_TRAVAUX_AG = 900;

  // Renvoie les assemblées générales datées trouvées dans un texte, les plus récentes en tête.
  // Chaque entrée porte ce qui permet de la relire : sa date, sa page, la phrase qui la nomme, et
  // — si des travaux y ont été votés — le passage qui le dit.
  function detecterAssembleesGenerales(texte, pages, nomDocument) {
    const src = String(texte || '');
    const re = new RegExp(RE_MENTION_AG.source, 'gi');

    // Deux passes : les mentions d'abord, les fenêtres ensuite. Une seule passe obligerait à
    // borner la fenêtre « à l'aveugle » (FENETRE_TRAVAUX_AG caractères), et elle déborderait sur
    // l'AG SUIVANTE — défaut vu au rendu : « AG du 14 mai 2025 : travaux de ravalement votés. AG
    // du 22 juin 2024 : aucun travaux n'a été voté. » faisait annuler le vote de la première par
    // la phrase de style de la seconde. La mention suivante ferme donc toujours la fenêtre.
    const mentions = [];
    let m;
    while ((m = re.exec(src)) !== null) mentions.push({ index: m.index, longueur: m[0].length });

    const parDate = new Map();
    for (let i = 0; i < mentions.length; i++) {
      const { index, longueur } = mentions[i];
      // La date suit la mention (« assemblée générale du 12 mars 2025 ») dans la même phrase.
      const apres = fragmentApres(src, index + longueur, 120);
      const date = premiereDateDansFragment(apres);
      const phraseAg = () => phraseAutour(src, index, 80, 260).phrase;
      if (!date) { noterDiagnosticOutil2('ag', 'ecartee', 'Mention sans date (clause générale sur les assemblées)', phraseAg(), index); continue; }
      // Le connecteur doit relier les deux : sans lui, la date qui suit parle d'autre chose
      // (« l'assemblée générale statuera sur les travaux avant le 30 juin 2026 »).
      const iNum = apres.search(RE_DATE_NUM_LIBRE);
      const iLettres = apres.search(RE_DATE_TEXTE_LIBRE);
      const candidats = [iNum, iLettres].filter(x => x >= 0);
      if (candidats.length === 0) continue;
      if (!RE_CONNECTEUR_DATE_AG.test(apres.slice(0, Math.min(...candidats)))) {
        noterDiagnosticOutil2('ag', 'ecartee', 'Date qui ne désigne pas la réunion (échéance, délai…)', phraseAg(), index);
        continue;
      }

      const finFenetre = Math.min(
        index + FENETRE_TRAVAUX_AG,
        i + 1 < mentions.length ? mentions[i + 1].index : src.length
      );
      const fenetre = src.slice(index, finFenetre);
      const voteLu = RE_TRAVAUX_VOTES.test(fenetre);
      const travauxVotes = voteLu
        && !RE_AUCUN_TRAVAUX_VOTE.test(fenetre)
        && !RE_RESOLUTION_REJETEE.test(fenetre);
      noterDiagnosticOutil2('ag', 'retenue', `Retenue : AG du ${formatDateFr(date)}, `
        + (travauxVotes ? 'travaux votés' : voteLu
          ? (RE_AUCUN_TRAVAUX_VOTE.test(fenetre) ? 'vote écarté (clause « aucun travaux voté »)' : 'vote écarté (résolution rejetée ou ajournée)')
          : 'aucun vote de travaux lu'), phraseAg(), index);
      const entree = {
        date,
        page: pageDepuisIndexPages(pages, index),
        document: nomDocument || null,
        phrase: phraseAutour(src, index, 80, 260).phrase,
        travauxVotes,
        extraitTravaux: travauxVotes ? phraseAutour(fenetre, fenetre.search(RE_TRAVAUX_VOTES), 80, 260).phrase : null
      };
      // Une même AG est citée plusieurs fois (clause de l'acte, puis son PV) : on garde l'entrée
      // la plus informative, c'est-à-dire celle qui établit un vote de travaux.
      const existante = parDate.get(date);
      if (!existante || (entree.travauxVotes && !existante.travauxVotes)) parDate.set(date, entree);
    }
    return [...parDate.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  // Fusionne les AG relevées dans plusieurs documents (avant-contrat, projet, justificatifs) :
  // c'est le PV déposé qui dit ce qui a été voté, la clause de l'acte se contente souvent de la
  // dater — la version qui établit un vote l'emporte donc sur celle qui n'en dit rien.
  function fusionnerAssembleesGenerales(listes) {
    const parDate = new Map();
    for (const liste of listes || []) {
      for (const ag of liste || []) {
        const existante = parDate.get(ag.date);
        if (!existante || (ag.travauxVotes && !existante.travauxVotes)) parDate.set(ag.date, ag);
      }
    }
    return [...parDate.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  // Volet 1 : les AG tenues entre la signature de l'avant-contrat et celle de la vente. Bornes
  // INCLUSES côté avant-contrat exclu (une AG tenue le jour même de l'avant-contrat est antérieure
  // à l'engagement, elle relève du volet 2) et incluse côté vente.
  function agEntreAvantContratEtVente(ags, dateAvantContrat, dateVente) {
    if (!dateAvantContrat) return [];
    const fin = dateVente || null;
    return (ags || []).filter(ag => ag.date > dateAvantContrat && (!fin || ag.date <= fin));
  }

  var LIBELLE_TRAVAUX_AG_INCONNUS = "Le passage ne dit pas si des travaux y ont été votés : relire le procès-verbal.";

  function constatsAssembleesGenerales(entree) {
    const ags = (entree && entree.ags) || [];
    const estCopropriete = !!(entree && entree.estCopropriete);
    const dateAvantContrat = (entree && entree.dateAvantContrat) || null;
    const dateVente = (entree && entree.dateVente) || null;
    if (!estCopropriete) return [];

    const constats = [];

    // Aucune AG datée nulle part : sur une copropriété, c'est en soi le point à vérifier — les
    // procès-verbaux des trois dernières assemblées font partie de ce que le vendeur doit remettre.
    if (ags.length === 0) {
      constats.push({
        categorie: 'COPROPRIETE', gravite: 'A_VERIFIER',
        titre: "Aucune assemblée générale datée dans les documents fournis",
        description: "Vente en copropriété : réclamer les procès-verbaux des trois dernières assemblées générales et vérifier si des travaux y ont été votés."
      });
      return constats;
    }

    const dansFenetre = agEntreAvantContratEtVente(ags, dateAvantContrat, dateVente);
    for (const ag of dansFenetre) {
      const bornes = `entre la signature de l’avant-contrat (${formatDateFr(dateAvantContrat)}) et la vente${dateVente ? ' (' + formatDateFr(dateVente) + ')' : ''}`;
      constats.push({
        categorie: 'COPROPRIETE',
        gravite: ag.travauxVotes ? 'CRITIQUE' : 'IMPORTANT',
        titre: ag.travauxVotes
          ? `Travaux votés en assemblée générale du ${formatDateFr(ag.date)}, après l’avant-contrat`
          : `Assemblée générale du ${formatDateFr(ag.date)} tenue après l’avant-contrat`,
        description: ag.travauxVotes
          ? `Cette assemblée s’est tenue ${bornes}, et des travaux y ont été votés : trancher qui en supporte le coût (art. 6-2 de la loi du 10 juillet 1965 — sauf convention contraire, celui qui est copropriétaire à la date d’exigibilité de l’appel de fonds) et vérifier que l’acquéreur en a été informé.`
          : `Cette assemblée s’est tenue ${bornes}. ${LIBELLE_TRAVAUX_AG_INCONNUS}`,
        phrase: ag.extraitTravaux || ag.phrase,
        page: ag.page
      });
    }

    // Volet 2 : les travaux votés lors des trois dernières assemblées, celles de la fenêtre
    // exclues — elles viennent d'être signalées ci-dessus, les redire serait le doublon que le
    // rapport évite ailleurs (voir clesEngagees dans analyserCompromisOutil2).
    const dejaSignalees = new Set(dansFenetre.map(ag => ag.date));
    const troisDernieres = ags.slice(0, NB_AG_A_EXAMINER).filter(ag => !dejaSignalees.has(ag.date));
    for (const ag of troisDernieres) {
      if (!ag.travauxVotes) continue;
      constats.push({
        categorie: 'COPROPRIETE', gravite: 'A_VERIFIER',
        titre: `Travaux votés en assemblée générale du ${formatDateFr(ag.date)}`,
        description: "Vérifier l’état d’avancement de ces travaux, leur financement et le solde restant dû à la date de la vente.",
        phrase: ag.extraitTravaux || ag.phrase,
        page: ag.page
      });
    }

    return constats;
  }

  // Point d'entrée du mode « lecture du compromis ». Tout est synchrone : le rapport s'affiche dès
  // que les PDF sont lus, sans le moindre aller-retour serveur.
  // Chaque document déposé est lu avec son nom dans le journal de diagnostic.
  function parDocumentJournal(documents, fn) {
    return (documents || []).map(doc => {
      documentJournalDiagnosticOutil2(doc && doc.nom, doc && doc.pages);
      return fn(doc);
    });
  }

  // Ouvre le journal de diagnostic le temps d'une analyse, et le joint au résultat.
  function avecJournalDiagnosticOutil2(analyse, entree) {
    ouvrirJournalDiagnosticOutil2();
    let resultat;
    let journal;
    try { resultat = analyse(entree); } finally { journal = fermerJournalDiagnosticOutil2(); }
    resultat.diagnostic = journal;
    return resultat;
  }

  function analyserCompromisOutil2(entree) {
    return avecJournalDiagnosticOutil2(analyserCompromisOutil2Interne, entree);
  }

  function analyserCompromisOutil2Interne(entree) {
    const texte = (entree && entree.texte) || '';
    const pages = (entree && entree.pages) || [];
    const aujourdHui = (entree && entree.aujourdHui) || new Date().toISOString().slice(0, 10);
    const justificatifs = rapprocherJustificatifs((entree && entree.documentsDeposes) || []);

    documentJournalDiagnosticOutil2((entree && entree.nomTexte) || 'Document relu', pages);
    const lectureActe = constatsLectureActe(texte, pages);
    const travaux = detecterTravauxRealises(texte, pages, aujourdHui);
    const documents = detecterDocumentsDatesOutil2(texte, pages, aujourdHui);
    const engagements = typeof extraireEngagementsVendeur === 'function' ? extraireEngagementsVendeur(texte) : [];
    const statutAcquereurs = detecterStatutAcquereurs(texte, pages);
    const statutVendeur = detecterStatutVendeur(texte, pages);
    const nbAcquereurs = (((entree && entree.extraction) || {}).parties || [])
      .filter(pp => String(pp.role || '').toUpperCase() === 'ACQUEREUR').length;
    const nbVendeurs = (((entree && entree.extraction) || {}).parties || [])
      .filter(pp => String(pp.role || '').toUpperCase() === 'VENDEUR').length;

    const clesEngagees = new Set();
    for (const e of engagements) {
      const cle = clePourEngagement(e.phrase);
      if (cle) clesEngagees.add(cle);
    }

    // Copropriété : les assemblées générales des trois dernières années. Aucune fenêtre
    // avant-contrat → vente ici (ce document n'est justement pas encore signé), donc seul le
    // volet « travaux votés » s'applique — voir constatsAssembleesGenerales.
    const typeBien = typeBienPourAudit(entree);
    const estCopropriete = typeBien.type === 'copropriete';
    const agsActe = detecterAssembleesGenerales(texte, pages, null);
    const deposes = (entree && entree.documentsDeposes) || [];
    const carnets = estCopropriete
      ? parDocumentJournal(deposes, doc => analyserCarnetEntretien(doc, aujourdHui)).filter(Boolean)
      : [];
    const travauxCarnet = carnets.reduce((acc, c) => acc.concat(c.travaux || []), []);
    const ags = fusionnerAssembleesGenerales([
      agsActe,
      ...parDocumentJournal(deposes, doc => detecterAssembleesGenerales(doc.texte, doc.pages || null, doc.nom))
    ]);

    // État daté / pré-état daté et certificat d'urbanisme : cherchés parmi les documents déposés
    // uniquement, jamais dans l'avant-contrat lui-même — celui-ci les CITE couramment sans en être
    // un (même piège que les pièces de la checklist, déjà payé une fois).
    const etatsDates = parDocumentJournal(deposes, analyserEtatDate).filter(Boolean);
    const certificatsUrbanisme = parDocumentJournal(deposes, analyserCertificatUrbanisme).filter(Boolean);

    const constats = []
      .concat(lectureActe)
      .concat(constatsCoherenceActe(entree && entree.extraction))
      .concat(constatsStatutAcquereurs(statutAcquereurs, nbAcquereurs))
      .concat(constatsConjointVendeur(statutVendeur, nbVendeurs, texte))
      .concat(constatsTravauxRealises(travaux))
      .concat(constatsTravauxRealises(travauxCarnet, 'CARNET_ENTRETIEN'))
      .concat(constatsDocumentsDates(documents.filter(d => !clesEngagees.has(d.cle))))
      .concat(constatsEngagementsVendeur(engagements, justificatifs, aujourdHui))
      .concat(constatsAssembleesGenerales({ ags, estCopropriete }))
      .concat(constatsEtatDate(etatsDates, aujourdHui, estCopropriete))
      .concat(constatsCertificatUrbanisme(certificatsUrbanisme, aujourdHui))
      .concat(constatsControleUrbanisme({ mode: 'compromis', texte, travaux,
        preemption: entree && entree.dossierLie ? entree.dossierLie.preemption : null }));

    constats.sort((a, b) => (ORDRE_GRAVITE_OUTIL2[a.gravite] ?? 9) - (ORDRE_GRAVITE_OUTIL2[b.gravite] ?? 9));

    const resume = { CRITIQUE: 0, IMPORTANT: 0, A_VERIFIER: 0, INFORMATION: 0 };
    for (const c of constats) { if (resume[c.gravite] != null) resume[c.gravite]++; }

    return { mode: 'compromis', constats, resume,
      fiche: ficheActeOutil2(entree && entree.extraction, 'compromis', { statutAcquereurs }),
      travaux, travauxCarnet, carnets, documents, engagements, justificatifs, statutAcquereurs,
      typeBien: typeBien.type, typeBienOrigine: typeBien.origine,
      ags, estCopropriete, etatsDates, certificatsUrbanisme, questions: questionsOutil2(constats), aujourdHui,
      justificatifsReconnus: Object.keys(justificatifs) };
  }

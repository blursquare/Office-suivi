  // ==== OUTIL 2 : ÉTAT DATÉ / PRÉ-ÉTAT DATÉ ET CERTIFICAT D'URBANISME ==========================
  //
  // Demandé par l'étude à partir d'un cas réel : sur un dossier de copropriété, la lecture de
  // l'état daté avait fait écrire au confrère « des travaux de ravalement sont-ils prévus pour les
  // prochaines années, des devis ont-ils été réalisés ? » et « la procédure liée à l'affaissement
  // de la cour a-t-elle évolué depuis la promesse ? ». C'est ce genre de point que l'outil doit
  // faire remonter — et la question qui va avec, prête à être envoyée.
  //
  // Trois arbitrages pris avec l'étude avant d'écrire une ligne, à ne pas rouvrir sans nouvelle
  // demande :
  //   • périmètre de l'état daté = TOUT son contenu (pas seulement les travaux et les procédures
  //     de l'exemple) : impayés du vendeur, fonds de travaux, avances, sommes incombant à
  //     l'acquéreur, emprunt du syndicat ;
  //   • sortie = des constats dans le rapport ET un bloc de questions prêtes à copier ;
  //   • certificat d'urbanisme = points de vigilance + validité (date, 18 mois, CU a ou b).
  //
  // Tout est déterministe et synchrone, comme le reste d'Outil 2 : aucun appel au modèle local.

  // Un état daté n'est pas un pré-état daté. Le second est un document de courtoisie, établi AVANT
  // l'avant-contrat et sans valeur opposable ; le premier est l'acte du syndic prévu à l'article 5
  // du décret du 17 mars 1967, demandé par le notaire avant la vente. Les deux ont le même contenu,
  // mais un pré-état daté de plusieurs mois ne dit plus rien de la situation du jour — d'où deux
  // types distincts et un constat propre au pré-état daté seul.
  //
  // PIÈGE À NE PAS REPRODUIRE, déjà payé une fois dans ce fichier : en JavaScript `\b` est défini
  // sur `\w = [A-Za-z0-9_]`, une lettre ACCENTUÉE n'en fait pas partie. `/\b[ée]tat/` ne matche donc
  // JAMAIS « ÉTAT DATÉ » (espace et É sont tous deux « non-mot », il n'y a aucune frontière entre
  // eux), et `/dat[ée]\b/` échoue de même sur le « É » final. D'où les lookarounds explicites
  // ci-dessous partout où un motif commence ou finit par une lettre susceptible d'être accentuée.
  var MOT_AVANT = '(?<![A-Za-z0-9_\u00c0-\u024f])';
  var MOT_APRES = '(?![A-Za-z0-9_\u00c0-\u024f])';
  var RE_ETAT_DATE = new RegExp(MOT_AVANT + '[ée]tat\\s+dat[ée]' + MOT_APRES, 'i');
  var RE_PRE_ETAT_DATE = new RegExp(MOT_AVANT + 'pr[ée][\\s-]*[ée]tat\\s+dat[ée]' + MOT_APRES, 'i');
  // Mêmes alternatives que `certificatUrbanisme.motifNom` de la checklist de pièces (« CU a) », la
  // « réponse urbanisme » de l'étude), plus le visa de l'article L.410-1 qui figure en tête du
  // document lui-même. « CU » seul n'est PAS accepté : deux lettres ne désignent pas un document,
  // même principe que les sigles courts déjà discutés pour la checklist.
  var RE_CERTIFICAT_URBANISME = /certificat\s+d?[’']?\s*urbanisme|\bCU\s*[ab]\s*\)|r[ée]ponse\s+(?:d[’']?\s*)?urbanisme|\bL\.?\s*410-1\b/i;

  // « Néant », « sans objet », « 0,00 € » : la rubrique existe et le syndic a répondu qu'il n'y a
  // rien. C'est une réponse, pas une absence — elle ne doit produire AUCUN constat, sinon chaque
  // état daté en produirait une dizaine et le rapport deviendrait l'inventaire que l'étude a
  // justement demandé d'éviter.
  var RE_RUBRIQUE_VIDE = /\b(n[ée]ant|sans\s+objet|aucune?|non\s+concern[ée]|pas\s+de\s+)(?![A-Za-z0-9_À-ɏ])/i;

  // Montant en fin de fragment, dans les formes qu'emploie un état daté (« 1 234,56 € »,
  // « 1234.56 EUR », « 0 € »). Volontairement plus large que AF_MONTANT_FIN_RE (appel de fonds),
  // qui exige deux décimales et un montant en fin de LIGNE.
  var RE_MONTANT_ETAT_DATE = /(\d{1,3}(?:[.\s ]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|EUR\b|euros?\b)/i;

  // Chaque rubrique porte SA question, rédigée pour être envoyée telle quelle. « type » décide de
  // la lecture :
  //   • 'montant' : la rubrique n'intéresse que si elle porte une somme > 0. Zéro ou « néant » =
  //     silence ; rubrique trouvée mais montant illisible = A_VERIFIER (le dire plutôt que de
  //     l'ignorer, c'est peut-être la seule fois où elle sera lue).
  //   • 'mention' : la seule présence du sujet suffit (une procédure en cours, un devis), sauf
  //     négation à proximité immédiate.
  // Premier jet, comme PIECES_* en leur temps : à resserrer dès qu'un vrai état daté fait remonter
  // un faux positif, jamais à élargir « au cas où ».
  var RUBRIQUES_ETAT_DATE = [
    {
      cle: 'proceduresEnCours', type: 'mention', gravite: 'CRITIQUE',
      libelle: 'Procédure ou litige en cours',
      motif: /\b(proc[ée]dure|litige|contentieux|instance\s+en\s+cours|assignation|expertise\s+judiciaire|r[ée]f[ée]r[ée])(?![A-Za-z0-9_À-ɏ])/i,
      destinataire: 'syndic',
      question: "Une procédure est mentionnée dans l’état daté : pourriez-vous nous indiquer où elle en est aujourd’hui, et si elle est susceptible d’entraîner un appel de fonds à la charge du copropriétaire ?"
    },
    {
      cle: 'travauxEnvisages', type: 'mention', gravite: 'IMPORTANT',
      libelle: 'Travaux envisagés ou devis en cours',
      motif: /(?<![A-Za-z0-9_À-ɏ])(travaux\s+(?:envisag[ée]s|pr[ée]vus|[àa]\s+pr[ée]voir|projet[ée]s)|projet\s+de\s+travaux|devis|ravalement|[ée]tude\s+en\s+cours)(?![A-Za-z0-9_À-ɏ])/i,
      destinataire: 'syndic',
      question: "Des travaux sont évoqués dans l’état daté : pourriez-vous nous préciser s’ils sont prévus pour les prochaines années, si des devis ont déjà été établis, et à quel stade en est leur vote ?"
    },
    {
      cle: 'chargesImpayees', type: 'montant', gravite: 'IMPORTANT',
      libelle: 'Charges impayées par le vendeur',
      motif: /\b(impay[ée]s?|arri[ée]r[ée]s?\s+de\s+charges|sommes?\s+restant\s+dues?|dette\s+du\s+copropri[ée]taire|solde\s+d[ée]biteur)(?![A-Za-z0-9_À-ɏ])/i,
      destinataire: 'confrere',
      question: "L’état daté fait apparaître des sommes restant dues par le vendeur au syndicat : pourriez-vous confirmer qu’elles seront réglées sur le prix au jour de la signature ?"
    },
    {
      cle: 'sommesIncombantAcquereur', type: 'montant', gravite: 'IMPORTANT',
      libelle: "Sommes incombant à l’acquéreur",
      motif: /\bsommes?\s+(?:incombant|[àa]\s+la\s+charge\s+du)\s+(?:au\s+)?(?:nouveau\s+copropri[ée]taire|futur\s+copropri[ée]taire|acqu[ée]reur)\b/i,
      destinataire: 'confrere',
      question: "L’état daté met des sommes à la charge du nouveau copropriétaire : pourriez-vous nous en confirmer le détail, afin que nous les reprenions dans le décompte de l’acquéreur ?"
    },
    {
      cle: 'travauxVotesNonAppeles', type: 'montant', gravite: 'IMPORTANT',
      libelle: 'Travaux votés non encore appelés',
      motif: /\btravaux\s+vot[ée]s\b|\bappels?\s+de\s+fonds\s+travaux\b|\bquote[\s-]*part\s+de\s+travaux\b/i,
      destinataire: 'confrere',
      question: "Des travaux votés restent à appeler : pourriez-vous nous confirmer la répartition convenue entre le vendeur et l’acquéreur (art. 6-2 de la loi du 10 juillet 1965) ?"
    },
    {
      cle: 'empruntSyndicat', type: 'mention', gravite: 'IMPORTANT',
      libelle: 'Emprunt souscrit par le syndicat',
      motif: /\bemprunt\b(?![^.]{0,40}\bn[ée]ant\b)/i,
      destinataire: 'syndic',
      question: "Un emprunt du syndicat est mentionné : pourriez-vous nous indiquer le capital restant dû rattaché au lot vendu et les modalités de remboursement ?"
    },
    {
      cle: 'fondsTravaux', type: 'montant', gravite: 'A_VERIFIER',
      libelle: 'Fonds de travaux',
      motif: /\bfonds\s+de\s+travaux\b|\barticle\s+14[\s-]*2\b/i,
      destinataire: 'confrere',
      question: "Pourriez-vous nous confirmer le montant du fonds de travaux rattaché au lot ? Il reste acquis au syndicat et n’est pas remboursé au vendeur, sauf convention contraire à préciser dans l’acte."
    },
    {
      cle: 'avances', type: 'montant', gravite: 'A_VERIFIER',
      libelle: 'Avances et fonds de roulement',
      motif: /\bavances?\b|\bfonds\s+de\s+roulement\b|\bavance\s+de\s+tr[ée]sorerie\b/i,
      destinataire: 'confrere',
      question: "Pourriez-vous nous confirmer le montant des avances à reconstituer par l’acquéreur et celles à rembourser au vendeur ?"
    }
  ];

  // Points de vigilance d'un certificat d'urbanisme. Même logique 'mention' que ci-dessus : ce sont
  // des servitudes ou des contraintes, pas des montants.
  var POINTS_CERTIFICAT_URBANISME = [
    {
      cle: 'emplacementReserve', gravite: 'CRITIQUE',
      libelle: 'Emplacement réservé',
      motif: /\bemplacements?\s+r[ée]serv[ée]s?(?![A-Za-z0-9_À-ɏ])/i,
      destinataire: 'mairie',
      question: "Le certificat d’urbanisme fait état d’un emplacement réservé : pourriez-vous nous préciser son emprise exacte sur la parcelle vendue et son bénéficiaire ?"
    },
    {
      cle: 'alignement', gravite: 'IMPORTANT',
      libelle: "Alignement",
      motif: /\balignement\b/i,
      destinataire: 'mairie',
      question: "Un alignement est mentionné : pourriez-vous nous indiquer si un arrêté d’alignement a été délivré et s’il affecte la construction existante ?"
    },
    {
      cle: 'preemption', gravite: 'IMPORTANT',
      libelle: 'Droit de préemption',
      motif: /\b(droit\s+de\s+pr[ée]emption|DPU\b|zone\s+d['’]am[ée]nagement\s+diff[ée]r[ée]|ZAD\b)/i,
      destinataire: 'mairie',
      question: "Le bien est situé dans le périmètre d’un droit de préemption : pourriez-vous nous confirmer le titulaire du droit et l’adresse à laquelle adresser la déclaration d’intention d’aliéner ?"
    },
    {
      cle: 'servitudes', gravite: 'IMPORTANT',
      libelle: "Servitudes d’utilité publique",
      motif: /\bservitudes?\s+d['’]\s*utilit[ée]\s+publique\b|\bservitudes?\b/i,
      destinataire: 'mairie',
      question: "Des servitudes d’utilité publique sont mentionnées : pourriez-vous nous en communiquer la liste et le plan, afin que nous les reprenions dans l’acte ?"
    },
    {
      cle: 'risques', gravite: 'IMPORTANT',
      libelle: 'Plan de prévention des risques',
      motif: /\b(plan\s+de\s+pr[ée]vention\s+des\s+risques|PPRN?[IiTt]?\b|zone\s+(?:inondable|de\s+risque)|al[ée]a\s+(?:fort|moyen|faible))\b/i,
      destinataire: 'mairie',
      question: "Le bien est concerné par un plan de prévention des risques : pourriez-vous nous préciser le zonage applicable à la parcelle et les prescriptions qui en découlent ?"
    },
    {
      cle: 'patrimoine', gravite: 'IMPORTANT',
      libelle: 'Protection du patrimoine',
      motif: /\b(monument\s+historique|site\s+(?:class[ée]|inscrit)|abords?\s+d['’]un\s+monument|architecte\s+des\s+b[âa]timents\s+de\s+France|\bABF\b|\(\s*A\s+B\s+F\s*\)|\bAC1\b|site\s+patrimonial\s+remarquable)(?![A-Za-z0-9_À-ɏ])/i,
      destinataire: 'mairie',
      question: "Le bien est situé dans un périmètre de protection du patrimoine : pourriez-vous nous confirmer si l’avis de l’architecte des Bâtiments de France est requis pour les travaux envisagés ?"
    },
    {
      cle: 'operationAmenagement', gravite: 'A_VERIFIER',
      libelle: "Opération d’aménagement",
      motif: /\b(zone\s+d['’]am[ée]nagement\s+concert[ée]|ZAC\b|lotissement|projet\s+urbain\s+partenarial|\bPUP\b)/i,
      destinataire: 'mairie',
      question: "Une opération d’aménagement est mentionnée : pourriez-vous nous indiquer les participations ou charges éventuellement mises à la charge du terrain ?"
    },
    {
      cle: 'taxes', gravite: 'A_VERIFIER',
      libelle: "Taxes et participations d’urbanisme",
      motif: /\b(taxe\s+d['’]am[ée]nagement|redevance\s+d['’]arch[ée]ologie|participations?\s+d['’]urbanisme)\b/i,
      destinataire: 'mairie',
      question: "Des taxes ou participations d’urbanisme sont mentionnées : pourriez-vous nous confirmer si elles restent dues et à quel titre ?"
    }
  ];

  // Validité d'un certificat d'urbanisme : 18 mois à compter de sa délivrance (art. R.410-17 du
  // code de l'urbanisme). La prorogation d'un an existe mais suppose une demande et l'absence de
  // changement des règles et taxes : elle n'est donc jamais présumée ici, seulement rappelée.
  var MOIS_VALIDITE_CU = 18;

  // Un avant-contrat ou un projet d'acte CITE systématiquement l'état daté et le certificat
  // d'urbanisme sans être ni l'un ni l'autre — c'est le même piège que celui déjà payé sur la
  // checklist de pièces, où ces documents ont fini par perdre toute détection par le CONTENU.
  // L'appelant écarte déjà le document principal et l'avant-contrat de référence, mais un
  // justificatif peut lui aussi être une copie de l'acte : ce garde-fou par le nom reste utile.
  var RE_DOC_AVANT_CONTRAT = /compromis|promesse|avant[\s-]*contrat|projet\s+d?['’]?\s*acte|acte\s+de\s+vente/i;

  // Reconnaissance par le NOM d'abord (le plus fiable, cf. la leçon déjà tirée sur la checklist de
  // pièces), puis par le TITRE seul — les 400 premiers caractères, pas le document entier : un
  // état daté porte son intitulé en tête, une simple mention en cours de texte n'en fait pas un.
  var TETE_DOCUMENT_SYNDIC = 400;

  function typeDocumentSyndicUrbanisme(doc) {
    const nom = normaliserNomPourMotif((doc && doc.nom) || '');
    if (RE_PRE_ETAT_DATE.test(nom)) return 'pre-etat-date';
    if (RE_ETAT_DATE.test(nom)) return 'etat-date';
    if (RE_CERTIFICAT_URBANISME.test(nom)) return 'certificat-urbanisme';
    if (RE_DOC_AVANT_CONTRAT.test(nom)) return null;
    const entete = String((doc && doc.texte) || '').slice(0, TETE_DOCUMENT_SYNDIC);
    if (RE_DOC_AVANT_CONTRAT.test(entete)) return null;
    if (RE_PRE_ETAT_DATE.test(entete)) return 'pre-etat-date';
    if (RE_ETAT_DATE.test(entete)) return 'etat-date';
    if (RE_CERTIFICAT_URBANISME.test(entete)) return 'certificat-urbanisme';
    return null;
  }

  function montantDansFragment(fragment) {
    const m = RE_MONTANT_ETAT_DATE.exec(String(fragment || ''));
    if (!m) return null;
    const n = parseFloat(String(m[1]).replace(/[\s ]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // Fenêtre volontairement courte après le libellé de la rubrique (180 caractères) : dans un état
  // daté, le montant suit immédiatement son intitulé, et élargir ramènerait celui de la rubrique
  // suivante.
  var FENETRE_RUBRIQUE_ETAT_DATE = 180;

  function analyserEtatDate(doc) {
    const texte = String((doc && doc.texte) || '');
    const pages = (doc && doc.pages) || null;
    const type = typeDocumentSyndicUrbanisme(doc);
    if (type !== 'etat-date' && type !== 'pre-etat-date') return null;
    const rubriques = [];
    for (const r of RUBRIQUES_ETAT_DATE) {
      const m = r.motif.exec(texte);
      if (!m) continue;
      const fragment = fragmentApres(texte, m.index, FENETRE_RUBRIQUE_ETAT_DATE);
      const vide = RE_RUBRIQUE_VIDE.test(fragment);
      const montant = montantDansFragment(fragment);
      const contexte = phraseAutour(texte, m.index, 120, 300);
      const page = pages ? pageDepuisIndexPages(pages, m.index) : null;
      if (r.type === 'montant') {
        // Zéro ou « néant » : le syndic a répondu, il n'y a rien à signaler.
        if (vide || montant === 0) continue;
        rubriques.push({ cle: r.cle, libelle: r.libelle, gravite: r.gravite, montant,
          lisible: montant != null, phrase: contexte.phrase, page,
          destinataire: r.destinataire, question: r.question });
      } else {
        if (vide) continue;
        rubriques.push({ cle: r.cle, libelle: r.libelle, gravite: r.gravite, montant: null,
          lisible: true, phrase: contexte.phrase, page,
          destinataire: r.destinataire, question: r.question });
      }
    }
    return { type, document: (doc && doc.nom) || '', date: dateDuJustificatif(texte), rubriques };
  }

  // Deux familles de mentions qui ne disent RIEN du terrain, trouvées sur un vrai certificat :
  //  • les RENVOIS (« Le certificat d'alignement est à demander à la même adresse ») — même
  //    piège que pour la checklist de pièces, d'où la réutilisation de RE_SIMPLE_RENVOI_PIECE ;
  //  • les CLAUSES DE STYLE imprimées sur tout certificat (« sans préjudice du droit des tiers
  //    (… servitudes de vue … cahier des charges du lotissement …) que le certificat ne vérifie
  //    pas », « prorogé si les servitudes d'urbanisme n'ont pas évolué »).
  // Chaque occurrence est jugée séparément : une vraie mention plus loin dans le document compte.
  var RE_CLAUSE_STYLE_CU = /ne\s+v[ée]rifie\s+pas|droit\s+des\s+tiers|prorog[ée]|dur[ée]e\s+de\s+validit[ée]|n['’]ont\s+pas\s+[ée]volu[ée]/i;

  function occurrenceUtileCertificat(motif, texte, libelle) {
    const re = new RegExp(motif.source, motif.flags.includes('g') ? motif.flags : motif.flags + 'g');
    let m;
    while ((m = re.exec(texte)) !== null) {
      const { phrase } = phraseAutour(texte, m.index, 120, 300);
      const ecarter = (raison) => { if (libelle) noterDiagnosticOutil2('urbanisme', 'ecartee', raison, phrase, m.index, libelle); };
      if (RE_SIMPLE_RENVOI_PIECE.test(phrase)) { ecarter('Simple renvoi vers une autre pièce'); continue; }
      // Un visa (« Vu le plan de prévention des risques… ») dit qu'un texte existe sur la
      // commune, pas qu'il concerne ce terrain : c'est l'article du certificat qui le dit.
      if (RE_VISA_CU.test(texte.slice(Math.max(0, m.index - 320), m.index))) { ecarter('Visa (texte applicable à la commune, pas au terrain)'); continue; }
      // La clause de style s'étend sur plusieurs phrases (et une énumération finie par « … ») :
      // elle est jugée sur une fenêtre autour de l'occurrence, pas sur la seule phrase.
      if (RE_CLAUSE_STYLE_CU.test(texte.slice(Math.max(0, m.index - 250), m.index + 150))) { ecarter('Clause de style du certificat'); continue; }
      return m;
    }
    return null;
  }

  // La date d'un certificat est celle de sa DÉLIVRANCE, et seulement elle. Un certificat s'ouvre
  // par des visas (« Vu le PLUi approuvé le 29 novembre 2022 », « Vu le PPRI approuvé le… ») :
  // prendre « la première date du document », comme pour un justificatif ordinaire, retenait la
  // date du PLU et déclarait périmé un certificat délivré trois mois plus tôt — constaté sur un
  // vrai CU. Aucun repli sur la première date, donc : sans marqueur de délivrance, pas de date.
  var RE_DELIVRANCE_CU = /d[ée]livr[ée]\s+le|fait\s+[àa]\s+[^,.\n]{1,40},?\s+le|sign[ée]\s+le|arr[êe]t[ée]\s+le/gi;
  // Les visas se terminent au point-virgule, ou au verbe du dispositif (« CERTIFIE », « ARRÊTE »)
  // qui ouvre les articles : une mention qui suit ce verbe n'est plus un visa.
  var RE_VISA_CU = /\b[Vv]u\s+(?:le|la|les|l['’])\b(?:(?!CERTIFIE|ARR[ÊE]TE|ARTICLE|D[ÉE]CIDE)[^;]){0,320}$/;
  var RE_DEMANDE_CU = /demande\s+(?:d[ée]pos[ée]e|re[çc]ue|enregistr[ée]e)\s+le\s*([0-9]{1,2}\s*\/\s*[0-9]{1,2}\s*\/\s*[0-9]{4}|[0-9]{1,2}(?:er)?\s+[a-zéû]+\s+[0-9]{4})/i;

  function datesCertificatUrbanisme(texte) {
    const src = String(texte || '');
    let date = null;
    const re = new RegExp(RE_DELIVRANCE_CU.source, 'gi');
    let m;
    while ((m = re.exec(src)) !== null) {
      // « délibération … en date du 29 novembre 2022 » dans un visa : ce n'est pas la délivrance.
      if (RE_VISA_CU.test(src.slice(Math.max(0, m.index - 200), m.index))) continue;
      const d = premiereDateDansFragment(src.slice(m.index + m[0].length, m.index + m[0].length + 60));
      if (d) { date = d; break; }
    }
    const md = RE_DEMANDE_CU.exec(src);
    const dateDemande = md ? premiereDateDansFragment(md[1].replace(/\s*\/\s*/g, '/')) : null;
    return { date, dateDemande };
  }

  function analyserCertificatUrbanisme(doc) {
    const texte = String((doc && doc.texte) || '');
    const pages = (doc && doc.pages) || null;
    if (typeDocumentSyndicUrbanisme(doc) !== 'certificat-urbanisme') return null;
    // CU « b » (opérationnel) : il dit si l'opération projetée est réalisable. Le CU « a »
    // (information) ne donne que les règles applicables — se fier à un CU a pour juger un projet
    // de construction est précisément l'erreur à signaler.
    const operationnel = /\bcertificat\s+d['’]?\s*urbanisme\s+op[ée]rationnel\b|\bCU\s*b\s*\)|\bL\.?\s*410-1\s*b\b|\b2[°º]\s*de\s+l['’]article\s+L\.?\s*410-1\b/i.test(texte);
    const points = [];
    for (const p of POINTS_CERTIFICAT_URBANISME) {
      const m = occurrenceUtileCertificat(p.motif, texte, p.libelle);
      if (!m) continue;
      const fragment = fragmentApres(texte, m.index, FENETRE_RUBRIQUE_ETAT_DATE);
      const contexte = phraseAutour(texte, m.index, 120, 300);
      if (RE_RUBRIQUE_VIDE.test(fragment)) { noterDiagnosticOutil2('urbanisme', 'ecartee', 'Rubrique vide (« néant », « sans objet »)', contexte.phrase, m.index, p.libelle); continue; }
      noterDiagnosticOutil2('urbanisme', 'retenue', `Retenu : ${p.libelle}`, contexte.phrase, m.index);
      points.push({ cle: p.cle, libelle: p.libelle, gravite: p.gravite, phrase: contexte.phrase,
        page: pages ? pageDepuisIndexPages(pages, m.index) : null,
        destinataire: p.destinataire, question: p.question });
    }
    const { date, dateDemande } = datesCertificatUrbanisme(texte);
    return {
      document: (doc && doc.nom) || '', date, dateDemande, points,
      genre: operationnel ? 'b' : 'a',
      expiration: date ? ajouterMois(date, MOIS_VALIDITE_CU) : null
    };
  }

  function constatsEtatDate(analyses, aujourdHui, estCopropriete) {
    const liste = (analyses || []).filter(Boolean);
    const constats = [];

    // Copropriété sans état daté ni pré-état daté déposé : c'est en soi le point à signaler, la
    // vente ne peut pas se préparer sans lui.
    if (estCopropriete && liste.length === 0) {
      constats.push({
        categorie: 'ETAT_DATE', gravite: 'A_VERIFIER',
        titre: "Aucun état daté ni pré-état daté dans les documents fournis",
        description: "Vente en copropriété : réclamer l’état daté au syndic pour connaître les sommes dues par le vendeur, celles incombant à l’acquéreur, les travaux votés et les procédures en cours.",
        destinataire: 'syndic',
        question: "Pourriez-vous nous adresser l’état daté prévu à l’article 5 du décret du 17 mars 1967 pour le lot vendu ?"
      });
      return constats;
    }

    for (const a of liste) {
      if (a.type === 'pre-etat-date') {
        // Un pré-état daté est un document de courtoisie, établi avant l'avant-contrat : il ne
        // remplace jamais l'état daté demandé au syndic avant la vente.
        constats.push({
          categorie: 'ETAT_DATE', gravite: 'IMPORTANT',
          titre: `Pré-état daté${a.date ? ' du ' + formatDateFr(a.date) : ''} : l’état daté reste à demander`,
          description: "Le pré-état daté n’est ni opposable ni à jour à la date de la vente. L’état daté prévu à l’article 5 du décret du 17 mars 1967 doit être demandé au syndic avant la signature.",
          document: a.document,
          destinataire: 'syndic',
          question: "Pourriez-vous nous adresser l’état daté pour le lot vendu, la vente étant en cours de préparation ?"
        });
      }
      for (const r of a.rubriques) {
        const montantTexte = r.montant != null ? formaterPrixCentimes(r.montant) : null;
        constats.push({
          categorie: 'ETAT_DATE',
          gravite: r.lisible ? r.gravite : 'A_VERIFIER',
          titre: montantTexte ? `${r.libelle} : ${montantTexte}` : r.libelle,
          description: r.lisible
            ? `Relevé dans ${a.type === 'pre-etat-date' ? 'le pré-état daté' : 'l’état daté'}${a.document ? ' (' + a.document + ')' : ''}.`
            : `Rubrique présente dans ${a.type === 'pre-etat-date' ? 'le pré-état daté' : 'l’état daté'}, mais son montant n’a pas pu être lu : à vérifier sur le document.`,
          phrase: r.phrase, page: r.page, document: a.document,
          destinataire: r.destinataire, question: r.question
        });
      }
    }
    return constats;
  }

  function constatsCertificatUrbanisme(analyses, aujourdHui) {
    const liste = (analyses || []).filter(Boolean);
    const constats = [];
    for (const a of liste) {
      if (!a.date && a.dateDemande && ajouterMois(a.dateDemande, MOIS_VALIDITE_CU) >= aujourdHui) {
        // La délivrance est forcément postérieure à la demande : si la demande date de moins de
        // 18 mois, le certificat est encore valable quelle que soit sa date exacte.
        constats.push({
          categorie: 'URBANISME', gravite: 'INFORMATION',
          titre: `Certificat d’urbanisme valable au moins jusqu’au ${formatDateFr(ajouterMois(a.dateDemande, MOIS_VALIDITE_CU))}`,
          description: `Date de délivrance non lue sur le document ; la demande ayant été déposée le ${formatDateFr(a.dateDemande)}, sa validité de ${MOIS_VALIDITE_CU} mois court au plus tôt depuis cette date.`,
          document: a.document
        });
      } else if (!a.date) {
        constats.push({
          categorie: 'URBANISME', gravite: 'A_VERIFIER',
          titre: "Certificat d’urbanisme sans date de délivrance lisible",
          description: `Sa validité (${MOIS_VALIDITE_CU} mois à compter de la délivrance) n’a pas pu être contrôlée : vérifier la date sur le document.`,
          document: a.document
        });
      } else if (a.expiration && a.expiration < aujourdHui) {
        constats.push({
          categorie: 'URBANISME', gravite: 'CRITIQUE',
          titre: `Certificat d’urbanisme périmé depuis le ${formatDateFr(a.expiration)}`,
          description: `Délivré le ${formatDateFr(a.date)}, sa validité de ${MOIS_VALIDITE_CU} mois est dépassée. Une prorogation d’un an est possible sur demande si les règles d’urbanisme et les taxes n’ont pas changé ; à défaut, en demander un nouveau.`,
          document: a.document,
          destinataire: 'mairie',
          question: "Pourriez-vous nous délivrer un nouveau certificat d’urbanisme pour le bien désigné, celui en notre possession étant expiré ?"
        });
      } else if (a.expiration) {
        constats.push({
          categorie: 'URBANISME', gravite: 'INFORMATION',
          titre: `Certificat d’urbanisme valable jusqu’au ${formatDateFr(a.expiration)}`,
          description: `Délivré le ${formatDateFr(a.date)}, validité de ${MOIS_VALIDITE_CU} mois.`,
          document: a.document
        });
      }
      if (a.genre === 'a') {
        constats.push({
          categorie: 'URBANISME', gravite: 'A_VERIFIER',
          titre: "Certificat d’urbanisme d’information (CU a)",
          description: "Il donne les règles applicables au terrain, mais ne dit PAS si une opération projetée y est réalisable. Si l’acquéreur a un projet de construction ou de division, un certificat opérationnel (CU b) est à demander.",
          document: a.document,
          destinataire: 'mairie',
          question: "L’acquéreur ayant un projet sur ce terrain, pourriez-vous nous délivrer un certificat d’urbanisme opérationnel (b) précisant si l’opération envisagée est réalisable ?"
        });
      }
      for (const p of a.points) {
        constats.push({
          categorie: 'URBANISME', gravite: p.gravite,
          titre: p.libelle,
          description: `Relevé dans le certificat d’urbanisme${a.document ? ' (' + a.document + ')' : ''}.`,
          phrase: p.phrase, page: p.page, document: a.document,
          destinataire: p.destinataire, question: p.question
        });
      }
    }
    return constats;
  }

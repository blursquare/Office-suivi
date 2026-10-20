  // ==== OFFRE DE PRÊT : reconnaissance par le titre de la page de garde ====
  // Troisième méthode de reconnaissance de ce document, après le contenu intégral (abandonné :
  // polices embarquées illisibles, autres documents mentionnant l'offre en passant) puis le seul
  // nom du fichier (abandonné à son tour, l'étude signalant « trop d'erreur » — un nom de fichier
  // est saisi à la main et ne dit rien du contenu réel). Méthode demandée explicitement par
  // l'étude, en trois filtres cumulés, du moins cher au plus cher :
  //   1. NOMBRE DE PAGES — « une offre de prêt fait au minimum 10 pages, ignorer tout document de
  //      moins de 6 pages ». Seuil volontairement placé sous les 10 pages annoncées : c'est un
  //      filtre de sécurité destiné à écarter les courriers et attestations d'une ou deux pages,
  //      pas à rejeter une offre un peu courte sur un prêt simple.
  //   2. TITRE de la page de garde — et lui seul, pas tout le document : un acte qui PARLE de
  //      l'offre de prêt n'a pas ce titre en tête de sa première page.
  //   3. CONFIRMATION par le modèle IA local (voir confirmerOffrePretIa) — un titre peut coïncider
  //      sans que le document en soit un ; le modèle tranche sur la page de garde entière.
  var MIN_PAGES_OFFRE_PRET = 6;
  var LONGUEUR_TITRE_PDF = 600; // « page de garde » retenue comme titre : le haut de la page 1

  // Chercher l'offre de prêt coûte cher : tant qu'elle n'est pas trouvée, CHAQUE PDF du dossier NAS
  // est téléchargé en entier puis analysé par pdf.js — et un dossier encore incomplet est justement
  // celui où elle n'est pas là, donc celui où tous les fichiers y passent. Répété toutes les
  // 5 minutes sur une soixantaine de dossiers, c'est ce qui figeait la page et faisait tomber le
  // sondage de synchronisation (signalé par l'étude : « la page se bloque puis il indique ne plus
  // avoir accès au serveur »). Deux garde-fous, sur les seuls tours AUTOMATIQUES :
  //   - un budget d'ouvertures partagé par tout le tour, pour qu'un tour reste borné quoi qu'il
  //     arrive ; ce qui n'a pas été examiné le sera au tour suivant, sans jamais tout refaire ;
  //   - une mémoire des fichiers déjà ouverts et écartés, par dossier et pour la session : un PDF
  //     qui n'est pas l'offre de prêt ne le devient pas cinq minutes plus tard.
  // Un clic explicite sur « Revérifier » ignore les deux : il oublie la mémoire du dossier et
  // n'entame aucun budget — l'étude doit toujours pouvoir forcer un parcours complet.
  const MAX_PDF_OUVERTS_TOUR_AUTO = 25;
  let budgetOuverturesTourAuto = 0;
  const pdfEcartesPourOffre = {};

  // Offre de prêt enregistrée à 16 h, reconnue à 18 h 30 (signalé le 29/09) : le budget ci-dessus
  // est partagé par TOUS les dossiers d'un tour, et la mémoire des PDF écartés repartait de zéro à
  // chaque ouverture de CLAIRE — les dossiers placés avant consommaient les 25 ouvertures tour
  // après tour, et le fichier de l'offre attendait son tour pendant des heures. Désormais :
  //   - un PDF dont le NOM dit « offre de prêt », ou que la surveillance du NAS vient de signaler
  //     comme nouveau (d.nasNouveaute), est ouvert dès qu'il est rencontré, hors budget ;
  //   - l'arrivée d'un nouveau document signalée par le serveur relance aussitôt la vérification de
  //     CE dossier (voir appliquerChangementsDistants), sans attendre le tour suivant ;
  //   - la mémoire des PDF écartés est gardée sur le poste 3 jours (localStorage), pour ne pas
  //     tout relire à chaque démarrage.
  // Pure : ce PDF doit-il être examiné pour l'offre même quand le budget du tour est épuisé ?
  function pdfPrioritairePourOffre(nomNormalise, chemin, cheminsNouveaux) {
    return nomDitOffrePret(nomNormalise) || (cheminsNouveaux || []).includes(chemin);
  }
  var CLE_PDF_ECARTES_OFFRE = 'claire-pdf-ecartes-offre';
  var DUREE_MEMOIRE_PDF_ECARTES_MS = 3 * 24 * 60 * 60 * 1000;
  function chargerPdfEcartesOffre() {
    try {
      const o = JSON.parse(localStorage.getItem(CLE_PDF_ECARTES_OFFRE) || 'null');
      if (!o || !o.le || Date.now() - o.le > DUREE_MEMOIRE_PDF_ECARTES_MS) return;
      for (const [id, liste] of Object.entries(o.dossiers || {})) {
        if (Array.isArray(liste) && !pdfEcartesPourOffre[id]) pdfEcartesPourOffre[id] = new Set(liste);
      }
    } catch (e) { /* mémoire indisponible : tout sera relu, comme avant */ }
  }
  function enregistrerPdfEcartesOffre() {
    try {
      const dossiersEcartes = {};
      for (const [id, s] of Object.entries(pdfEcartesPourOffre)) if (s.size) dossiersEcartes[id] = [...s].slice(-400);
      const ancien = JSON.parse(localStorage.getItem(CLE_PDF_ECARTES_OFFRE) || 'null');
      // La date de départ est gardée : la mémoire expire 3 jours après sa création, pas 3 jours
      // après la dernière écriture (un PDF écarté à tort ne le reste jamais indéfiniment).
      const le = ancien && ancien.le && Date.now() - ancien.le <= DUREE_MEMOIRE_PDF_ECARTES_MS ? ancien.le : Date.now();
      ecrireLocal(CLE_PDF_ECARTES_OFFRE, JSON.stringify({ le, dossiers: dossiersEcartes }));
    } catch (e) { /* stockage plein ou bloqué : sans conséquence */ }
  }
  chargerPdfEcartesOffre();

  // Le texte d'une page de PDF arrive en fragments dont l'espacement ne reflète pas la mise en
  // page : on le remet à plat avant tout test de motif, comme ailleurs dans ce fichier.
  function titrePagePdf(textePremierePage) {
    return (textePremierePage || '').replace(/\s+/g, ' ').trim().slice(0, LONGUEUR_TITRE_PDF);
  }

  // Garanties du prêt, lues dans le texte de l'offre une fois celle-ci identifiée (demandé par
  // l'étude, affiché dans la carte « Obtention du prêt »). Plusieurs peuvent s'appliquer au même
  // prêt — l'étude a explicitement dit « et/ou » : le résultat est donc une liste, jamais une
  // valeur unique.
  // « Privilège de prêteur de deniers » est l'ancien nom de l'hypothèque légale spéciale du même
  // nom (réforme des sûretés de 2021) : les deux formulations coexistent dans les offres réelles,
  // les deux sont reconnues sous la même clé puisqu'elles désignent la même garantie.
  // Les quatre réponses possibles données par l'étude sont un cumul de ces clés : aucune garantie,
  // caution, hypothèque légale de prêteur de deniers, ou cette dernière AVEC l'hypothèque
  // conventionnelle. `sansGarantie` n'a pas de motif : elle n'est jamais cherchée, elle est le
  // résultat d'un paragraphe « GARANTIES » qui n'annonce aucune des trois autres.
  var GARANTIES_PRET = [
    { cle: 'sansGarantie', label: 'Sans garanties', motif: null },
    { cle: 'caution', label: 'Caution', motif: /cautionnement|soci[ée]t[ée]\s+de\s+caution|caution\s+(?:solidaire|mutuelle|bancaire)|cr[ée]dit\s+logement|\bcaution\b/i },
    { cle: 'hypothequeLegale', label: 'Hypothèque légale de prêteur de deniers', motif: /pr[êe]teur\s+de\s+deniers|privil[èe]ge\s+de\s+pr[êe]teur|h[yi]poth[èe]que\s+l[ée]gale\s+sp[ée]ciale/i },
    { cle: 'hypothequeConventionnelle', label: 'Hypothèque conventionnelle', motif: /h[yi]poth[èe]que\s+conventionnelle/i }
  ];

  // Une offre de prêt porte un paragraphe intitulé « GARANTIES » (parfois « GARANTIE » /
  // « SÛRETÉS ») qui énumère ce que le prêteur exige. Le reste du document parle abondamment
  // d'hypothèque et de caution à d'autres titres (clauses générales, frais, informations
  // précontractuelles) : chercher dans tout le texte remontait donc des garanties qui ne sont pas
  // celles de CE prêt. On se limite désormais à ce paragraphe.
  // Tolère les numérotations réelles des offres : « GARANTIES », « 7. GARANTIES »,
  // « Article 7 - GARANTIES », « § 4 – SÛRETÉS ». Deux mises en page coexistent et sont toutes
  // deux acceptées : le titre seul sur sa ligne, ou « GARANTIES : » suivi du contenu sur la même
  // ligne. Toujours ancré en DÉBUT DE LIGNE, et le deux-points est obligatoire dans le second cas
  // — sans quoi « les garanties sont acquises au prêteur » au fil d'une phrase passerait pour un
  // titre de paragraphe.
  // Un complément entre parenthèses est toléré après le titre : « Garanties (constatées par acte(s) séparé(s)) : » (Société Générale, 15/10).
  var RE_TITRE_GARANTIES = /^[^\S\n]*(?:(?:article|art\.?|§)[^\S\n]*)?\d{0,2}[^\S\n]*[-–—.)]?[^\S\n]*(?:(?:les|des)[^\S\n]+)?(?:garanties?|garantie\(s\)|s[ûu]ret[ée]s?|s[ûu]ret[ée]\(s\))(?:[^\S\n]+(?:du[^\S\n]+pr[êe]t|exig[ée]es?|r[ée]elles?))?(?:[^\S\n]*\([^\n]{0,80}\))?[^\S\n]*(?::|$)/gim;
  // Fin du paragraphe : le titre de section suivant, ou à défaut une fenêtre généreuse — une
  // énumération de garanties tient largement dedans.
  // Le motif précédent (« une ligne courte entièrement en capitales ») exigeait une MAJUSCULE
  // comme TOUT PREMIER caractère de la ligne : il ne reconnaissait donc ni « 8. ASSURANCES » ni
  // « Article 8 - Assurance emprunteur », c'est-à-dire les deux formes de titre les plus
  // fréquentes dans une offre réelle. Le paragraphe « GARANTIES » avalait alors la section
  // suivante en entier, et une hypothèque citée sous « ASSURANCES » remontait comme garantie du
  // prêt — cause n°1 du « Caution · Hypothèque conventionnelle » signalé par l'étude sur une
  // offre pourtant cautionnée seule.
  var RE_NUMERO_SECTION = /^\s*(?:(article|art\.?|§)\s*)?(\d{1,2})?\s*[-–—.)]?\s*/i;
  var RE_INTITULE_CAPITALES = /^[A-ZÀ-Ü][A-ZÀ-Ü0-9'’\s,.\-()]{4,80}$/;
  var LONGUEUR_MAX_PARAGRAPHE_GARANTIES = 2500;
  // En deçà, on ne coupe pas : la première garantie elle-même est parfois écrite en capitales sur
  // sa propre ligne (« CAUTIONNEMENT SOLIDAIRE »), et la prendre pour le titre suivant viderait
  // le paragraphe — une offre cautionnée ressortirait « Sans garanties ».
  var MIN_PARAGRAPHE_AVANT_COUPE = 40;

  // Une ligne est un titre de section quand, son éventuel numéro d'article retiré (« 8. »,
  // « Article 9 — », « § 4 – »), il reste soit un intitulé entièrement en capitales, soit — mais
  // seulement si le mot « article »/« art. »/« § » était bien présent, marqueur non ambigu — un
  // intitulé en casse normale.
  function estTitreDeSection(ligne) {
    const m = RE_NUMERO_SECTION.exec(ligne);
    const motArticle = !!(m && m[1]);
    const numero = !!(m && m[2]);
    const reste = ligne.slice(m ? m[0].length : 0).trim();
    if (!reste || reste.length > 90) return false;
    if (RE_INTITULE_CAPITALES.test(reste)) return true;
    return motArticle && numero;
  }

  // Index du prochain titre de section dans `texte`, ou -1.
  function indexTitreSectionSuivante(texte) {
    let position = 0;
    for (const ligne of String(texte).split('\n')) {
      if (position >= MIN_PARAGRAPHE_AVANT_COUPE && estTitreDeSection(ligne)) return position;
      position += ligne.length + 1;
    }
    return -1;
  }

  // Cause n°2 du même signalement : le paragraphe « GARANTIES » d'une offre cautionnée nomme
  // couramment une hypothèque en ALTERNATIVE (« à défaut d'accord de la caution, le prêt sera
  // garanti par une hypothèque conventionnelle ») — ce n'est pas une garantie de CE prêt, c'est
  // ce qui se passerait si la caution était refusée. Même principe que RE_SIMPLE_RENVOI_PIECE /
  // motifPieceTrouve pour la checklist : on teste CHAQUE occurrence, et une occurrence non
  // conditionnée ailleurs dans le même paragraphe reste valable.
  // Deux familles de faux positifs, et non une seule :
  //  - la garantie de REPLI (« à défaut d'accord de la caution… ») ;
  //  - la garantie que l'emprunteur s'ENGAGE À CONSTITUER PLUS TARD, à la demande du prêteur ou
  //    de la société de caution. Le contrat de cautionnement CEGC, reproduit à l'intérieur même du
  //    paragraphe GARANTIES d'une offre pourtant cautionnée seule, contient ainsi : « L'Emprunteur
  //    s'engage à consentir à ses frais une hypothèque conventionnelle sur le bien financé […] à
  //    première demande de la COMPAGNIE et/ou du Prêteur notamment dans les cas suivants : … ».
  //    Ce n'est pas une garantie de CE prêt aujourd'hui, c'est ce qui se passerait en cas de
  //    défaillance — exactement le cas signalé par l'étude (« il me sort une hypothèque alors
  //    qu'il n'y a qu'une caution »).
  var RE_GARANTIE_CONDITIONNELLE = /[àa]\s+d[ée]faut|faute\s+d['’e]|en\s+cas\s+de\s+(?:refus|rejet|d[ée]faillance|non[-\s]?obtention)|[àa]\s+titre\s+subsidiaire|en\s+substitution|le\s+cas\s+[ée]ch[ée]ant|si\s+(?:l['’]organisme|la\s+caution|le\s+cautionnement)|s['’](?:engage|oblige)\s+[àa]\s+(?:consentir|constituer|affecter)|[àa]\s+premi[èe]re\s+demande|(?:pourra|pourrait|peut)\s+(?:exiger|demander|r[ée]clamer)|sera\s+tenu\s+de\s+consentir/i;
  var FENETRE_GARANTIE_CONDITIONNELLE = 160;

  function garantieNonConditionnelle(motif, paragraphe) {
    const re = new RegExp(motif.source, motif.flags.includes('g') ? motif.flags : motif.flags + 'g');
    let m;
    while ((m = re.exec(paragraphe)) !== null) {
      let avant = paragraphe.slice(Math.max(0, m.index - FENETRE_GARANTIE_CONDITIONNELLE), m.index);
      // Bornée à la phrase courante : un « à défaut » de la phrase précédente ne conditionne pas
      // celle-ci (même principe que extraireContexte ailleurs dans ce fichier).
      const coupe = Math.max(avant.lastIndexOf('. '), avant.lastIndexOf('\n'));
      if (coupe >= 0) avant = avant.slice(coupe + 1);
      if (!RE_GARANTIE_CONDITIONNELLE.test(avant)) return true;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return false;
  }

  // Une offre porte souvent PLUSIEURS paragraphes titrés « Garanties » : celui du prêt, mais aussi
  // les « Garanties : se référer à la notice d'information de l'assurance » de l'assurance
  // emprunteur (un par assuré, par prêt), et un « GARANTIES » de conditions générales qui renvoie
  // aux conditions particulières. Sur l'offre réelle Banque Populaire signalée par l'étude, le
  // premier rencontré était celui de l'assurance : la fiche affichait « Sans garanties » alors que
  // le vrai paragraphe, plus loin, portait un cautionnement. On les parcourt donc TOUS, dans
  // l'ordre du document.
  function paragraphesGaranties(texte) {
    const source = String(texte || '');
    const re = new RegExp(RE_TITRE_GARANTIES.source, RE_TITRE_GARANTIES.flags);
    const paragraphes = [];
    let titre;
    while ((titre = re.exec(source)) !== null) {
      if (titre[0].length === 0) { re.lastIndex++; continue; }
      // On repart de la FIN du titre, jamais du premier `\n` trouvé après son index de départ : ce
      // dernier pouvait retomber sur le saut de ligne PRÉCÉDANT le titre, et le paragraphe avalait
      // alors la section suivante en entier (une hypothèque citée sous « ASSURANCES » remontait
      // ainsi comme garantie du prêt).
      const debut = titre.index + titre[0].length;
      const reste = source.slice(debut, debut + LONGUEUR_MAX_PARAGRAPHE_GARANTIES);
      const suivant = indexTitreSectionSuivante(reste);
      paragraphes.push(suivant > 0 ? reste.slice(0, suivant) : reste);
    }
    return paragraphes;
  }

  // Paragraphe des garanties de l'ASSURANCE emprunteur, pas du prêt : il renvoie à la notice
  // d'information de l'assurance dès ses premiers mots. Il ne sert qu'à ne pas conclure
  // « Sans garanties » sur sa seule foi (voir detecterGarantiesPret).
  var RE_GARANTIES_ASSURANCE = /assurance|assureur|notice\s+d['’]information|bulletin\s+d['’]adh[ée]sion/i;
  function estParagrapheGarantiesAssurance(paragraphe) {
    return RE_GARANTIES_ASSURANCE.test(String(paragraphe || '').slice(0, 200));
  }

  function garantiesDuParagraphe(paragraphe) {
    return GARANTIES_PRET.filter(g => g.motif && garantieNonConditionnelle(g.motif, paragraphe)).map(g => g.cle);
  }

  // Les quatre réponses possibles listées par l'étude sont un CUMUL des trois clés ci-dessus :
  // aucune (« Sans garanties »), caution, hypothèque légale de prêteur de deniers, ou cette
  // dernière AVEC l'hypothèque conventionnelle. On renvoie donc toujours une liste de clés, dont
  // libellesGarantiesPret tire la phrase affichée.
  function detecterGarantiesPret(texte) {
    const paragraphes = paragraphesGaranties(texte);
    // Aucun paragraphe « GARANTIES » : on ne sait pas, et ne pas savoir n'est pas « sans
    // garantie » — la fiche n'affiche alors rien plutôt qu'une affirmation fausse.
    if (!paragraphes.length) return [];
    // Le PREMIER paragraphe qui énonce une garantie connue fait foi : les garanties du prêt sont
    // aux conditions particulières, avant les conditions générales qui en parlent en termes
    // génériques.
    for (const p of paragraphes) {
      const trouvees = garantiesDuParagraphe(p);
      if (trouvees.length) return trouvees;
    }
    // Aucun n'en énonce. Ce n'est une vraie réponse (« Sans garanties », la première des quatre
    // listées par l'étude) que si l'un d'eux est bien celui du PRÊT : ceux de l'assurance
    // emprunteur ne disent rien des garanties du prêt.
    return paragraphes.some(p => !estParagrapheGarantiesAssurance(p)) ? ['sansGarantie'] : [];
  }

  // Pur : ce que la ligne « Obtention du prêt » dit des garanties. Offre reçue (ou à confirmer) sans
  // garantie lue → « Garantie non identifiée » (étude, 01/10 : « aujourd'hui on ne voit rien ») ;
  // avant l'offre, rien.
  function garantiesPretAffichees(d) {
    if (!d || d.sansPret) return null;
    const libelles = libellesGarantiesPret(d.garantiesPret);
    if (libelles.length) return { texte: libelles.join(' · '), identifiee: true, liste: libelles };
    if (d.offrePretStatut === 'recue' || d.offrePretStatut === 'aconfirmer') return { texte: 'Garantie non identifiée', identifiee: false };
    return null;
  }

  // Les garanties en pastilles bien visibles (étude 20/10 : « Hypothèque légale de prêteur de deniers : le mettre plus
  // visible ») — une par garantie, carte « Obtention du prêt » et bloc « Offre de prêt » de l'onglet Fonds.
  function pastillesGarantiesPret(g) {
    if (!g) return '';
    const liste = g.identifiee ? (g.liste || [g.texte]) : [g.texte];
    return `<span class="garanties-pastilles">${liste.map(l =>
      `<span class="garantie-pastille${g.identifiee ? '' : ' garantie-inconnue'}">${icone('key')}${escapeHtml(l)}</span>`).join('')}</span>`;
  }

  function libellesGarantiesPret(cles) {
    return (cles || [])
      .map(cle => (GARANTIES_PRET.find(g => g.cle === cle) || {}).label)
      .filter(Boolean);
  }

  // Demande au modèle IA local (Ollama, via le serveur — voir server/src/routes/offrePret.js) de
  // confirmer que la page de garde reconnue est bien celle d'une offre/d'un contrat de prêt.
  // `disponible: false` couvre tout ce qui empêche une réponse (modèle non installé, serveur
  // injoignable, version de l'outil sans cette route) : l'appelant en fait alors un statut « à
  // confirmer », jamais un rejet — ne pas pouvoir demander n'est pas une réponse négative.
  async function confirmerOffrePretIa(titre) {
    try {
      const reponse = await fetchAvecAuth('/api/offre-pret/confirmer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titre })
      });
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => ({}));
        return { disponible: false, estOffrePret: false, raison: corps.erreur || `erreur ${reponse.status}` };
      }
      const data = await reponse.json();
      return { disponible: true, estOffrePret: data.estOffrePret === true, raison: data.raison || '' };
    } catch (e) {
      return { disponible: false, estOffrePret: false, raison: e.message };
    }
  }

  // ==== DOSSIERS DU NAS : le SERVEUR lit les fichiers, plus le navigateur ====
  // Remplace entièrement l'ancien mécanisme fondé sur l'API File System Access
  // (`showDirectoryPicker()` + handles conservés en IndexedDB). Raison, tranchée avec l'étude :
  // cette API n'existe QUE dans un contexte sécurisé (localhost ou HTTPS). Les collaborateurs qui
  // rejoignent l'outil par l'adresse IP du poste serveur — le cas normal au bureau — n'avaient donc
  // tout simplement pas la fonction, et ne pouvaient ni relier un dossier ni consulter une pièce,
  // alors que les dossiers clients sont sur un NAS commun visible par tous. Le serveur, lui, voit
  // ce NAS comme un chemin de fichiers ordinaire et sert la même chose à tout le monde (voir
  // server/src/nas.js et server/src/routes/nas.js).
  //
  // Trois conséquences immédiates, toutes des simplifications :
  //   - plus AUCUNE permission à reconfirmer : Chrome redemandait l'autorisation d'accès à chaque
  //     redémarrage (limite du navigateur, jamais contournable côté code) — c'est ce qui avait
  //     imposé une popup au démarrage, un bandeau d'alerte et un bouton groupé, tous supprimés ;
  //   - le lien vers le dossier NAS (`d.nasDossier`, un chemin relatif) et les fichiers déjà
  //     trouvés (`d.fichiersTrouves`) vivent maintenant SUR LE DOSSIER, donc sur le serveur : un
  //     dossier relié depuis un poste l'est pour tous, au lieu d'un handle local à un navigateur ;
  //   - un seul parcours de fichiers pour tout le bureau.
  const NAS_CLE_OFFRE = 'offre';
  const NAS_CLE_PIECE = (cle) => `piece::${cle}`;
  const NAS_CLE_COMPROMIS = 'compromis';

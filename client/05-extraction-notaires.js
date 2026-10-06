  // ==== EXTRACTION STRUCTURÉE : notaires ====
  //
  // Entièrement nouveau : jusqu'ici, le rôle de l'étude sur un dossier (instrumentaire ou
  // participant) était saisi à la main, sans aucune aide du document. L'enchaînement voulu par la
  // spec est : personne → étude → adresse → département → qualité → rôle → règle métier.

  // Identité de l'étude, pour reconnaître SON propre office parmi les notaires cités et en déduire
  // son rôle. Les deux graphies rencontrées sont tolérées (GOSSART / GOSSARD). Liste volontairement
  // isolée ici : y ajouter un confrère associé ne demande de toucher à rien d'autre.
  var IDENTITE_ETUDE = { motifs: [/goss?ar[dt]/i] };

  // Notre office s'écrit toujours de la même façon dans un champ notaire (étude 05/10 : « mettre Sophie GOSSART de base quand il
  // s'agit de notre office »). Pure : une valeur qui désigne notre office (« Maître GOSSART », « Sophie GOSSARD (Blois) »…) est
  // ramenée à ce libellé ; une valeur déjà écrite ainsi (à la casse de la ville près) ou qui cite aussi un autre notaire (« et »,
  // virgule, plus de dix mots) est laissée telle quelle.
  var NOTAIRE_ETUDE_LIBELLE = 'Maître Sophie GOSSART (BLOIS)';
  function canoniserNotaireEtude(valeur) {
    const brut = String(valeur || '').trim();
    if (!brut || !estEtude({ nom: brut })) return brut;
    if (brut.split(/\s+/).length > 10 || /\s(?:et|ainsi que)\s|;/i.test(brut)) return brut;
    const simple = t => String(t).toLowerCase().replace(/\s+/g, ' ');
    return simple(brut) === simple(NOTAIRE_ETUDE_LIBELLE) ? brut : NOTAIRE_ETUDE_LIBELLE;
  }

  // Règle métier géographique, centralisée en UN SEUL endroit (exigence explicite de la spec :
  // « ne pas coder cette règle de manière dispersée »). Pour un bien situé dans le 41, si le
  // notaire du vendeur est du 41, du 45 ou du 37, c'est lui qui reçoit l'acte. Ajouter un
  // département, ou une seconde règle pour un autre département de bien, se fait ici.
  // ---- Attribution de la minute de l'acte de vente (qui rédige la vente) ----
  //
  // Source : Règlement Professionnel du Notariat, en vigueur depuis le 1er février 2024, et
  // règlement intérieur de la Chambre interdépartementale des notaires du Val de Loire.
  //
  //   Art. 30.4.2 RPN — Vente de gré à gré : « En cas d'intervention de plusieurs notaires, la
  //   minute de la vente appartient au notaire choisi par le VENDEUR. Toutefois, si SEUL le
  //   notaire choisi par l'acquéreur exerce dans le département dans lequel le bien vendu se
  //   situe, celui-ci détient la minute de l'acte. »
  //
  //   Art. 33 RPN — le règlement du conseil régional ou de la chambre interdépartementale prime
  //   sur la seconde partie du RPN. Pour la CIN du Val de Loire (ressort de la Cour d'appel
  //   d'ORLÉANS : Loir-et-Cher 41, Loiret 45, Indre-et-Loire 37), son article 15 maintient les
  //   règles antérieures : « la minute de tout acte de vente dont l'établissement est confié à
  //   des notaires exerçant au sein de la Cour d'Appel sera attribuée au NOTAIRE DU VENDEUR ».
  //   Autrement dit, entre deux notaires du ressort, l'exception départementale du RPN ne joue
  //   pas : c'est toujours le notaire du vendeur.
  //
  // C'est la règle que l'étude avait résumée par « 41/45/37 » : elle porte bien sur le
  // département des DEUX NOTAIRES, pas sur celui du bien.
  var RESSORT_CIN_VAL_DE_LOIRE = ['41', '45', '37'];

  // Renvoie 'vendeur' | 'acquereur' | null (indéterminable faute de départements connus).
  function attribuerMinute(departementNotaireVendeur, departementNotaireAcquereur, departementBien) {
    const dv = departementNotaireVendeur || null;
    const da = departementNotaireAcquereur || null;
    // Règle régionale : deux notaires du ressort de la Cour d'appel d'Orléans → notaire du vendeur.
    if (dv && da && RESSORT_CIN_VAL_DE_LOIRE.includes(dv) && RESSORT_CIN_VAL_DE_LOIRE.includes(da)) {
      return { cote: 'vendeur', source: 'Val de Loire' };
    }
    if (!departementBien || !dv || !da) return null;
    // Art. 30.4.2 : l'exception ne joue que si SEUL le notaire de l'acquéreur exerce dans le
    // département du bien.
    const vendeurDansBien = dv === departementBien;
    const acquereurDansBien = da === departementBien;
    if (acquereurDansBien && !vendeurDansBien) return { cote: 'acquereur', source: 'RPN 30.4.2' };
    return { cote: 'vendeur', source: 'RPN 30.4.2' };
  }

  // L'inverse : on connaît le notaire qui détient la minute (il est nommé en PREMIER dans le
  // préambule, art. 26.3.2 RPN) et on veut savoir de quel côté il est. Il est celui du vendeur
  // dans tous les cas SAUF celui, unique, où l'exception de l'art. 30.4.2 a pu jouer — auquel cas
  // on ne tranche pas plutôt que de deviner.
  function coteDepuisAttribution(departementInstrumentaire, departementSecond, departementBien) {
    const di = departementInstrumentaire || null;
    const ds = departementSecond || null;
    // Sans les deux départements, aucune branche de la règle n'est vérifiable : on ne déduit rien
    // plutôt que d'appliquer un défaut qu'on ne peut pas contrôler. Affecter le mauvais côté
    // ferait chercher les pièces du mauvais notaire.
    if (!di || !ds) return null;
    if (di && ds && RESSORT_CIN_VAL_DE_LOIRE.includes(di) && RESSORT_CIN_VAL_DE_LOIRE.includes(ds)) {
      return { cote: 'vendeur', raison: 'Les deux notaires exercent dans le ressort de la Cour d’appel d’Orléans : la minute revient au notaire du vendeur (règlement de la Chambre du Val de Loire, art. 15).' };
    }
    // Cas où l'exception a pu s'appliquer : l'instrumentaire est le seul dans le département du
    // bien. Il peut alors être le notaire de l'acquéreur — indécidable sans autre indice.
    if (departementBien && di === departementBien && ds && ds !== departementBien) return null;
    return { cote: 'vendeur', raison: 'À défaut de mention contraire, la minute revient au notaire du vendeur (RPN, art. 30.4.2) : le notaire nommé en premier est donc celui du vendeur.' };
  }

  // « Maître X, notaire à Y » et ses variantes (notaire associé, notaire à la résidence de…).
  // Le numéro CRPCEN est inséré entre le nom et la qualité dans beaucoup de trames (« Maître
  // Sophie GOSSART, CRPCEN 41089, notaire à BLOIS »). Le groupe du nom excluant la virgule, le
  // motif ne pouvait pas la franchir : le préambule — donc l'ordre de citation, qui désigne
  // l'instrumentaire (art. 26.3.2 RPN) — n'était tout simplement jamais reconnu sur ces actes.
  // Le NOM est repéré d'abord, son office et son département sont résolus ensuite, séparément.
  // Un motif unique exigeant « Maître X, notaire à VILLE » ne couvrait qu'une partie des trames :
  // « Maître X, CRPCEN 41089, notaire à BLOIS » (la virgule du CRPCEN bloquait le groupe du nom)
  // et « Maître X, notaire associé, membre de la SCP …, titulaire d'un office notarial aux
  // MONTILS » y échappaient tous les deux. Or ce notaire-là est le PREMIER NOMMÉ, donc celui qui
  // détient la minute (art. 26.3.2 RPN) : il disparaissait purement et simplement de la liste.
  // `Ma[îi]tre(?!s)` : le pluriel introduit la raison sociale d'une SCP (« Maîtres X et Y,
  // notaires associés »), pas une comparution.
  var RE_MENTION_NOTAIRE = /Ma[îi]tre(?!s)\s+([A-ZÀ-Ü][A-Za-zÀ-ÿ'’-]*(?:\s+[A-ZÀ-Ü'’][A-Za-zÀ-ÿ'’-]*){0,4})/g;

  // Emplacement de l'office, sous ses formes usuelles.
  var RE_OFFICE_NOTAIRE = /(?:notaires?\s+(?:associ[ée]e?s?\s+)?(?:[àa]\s+la\s+r[ée]sidence\s+d[eu]\s+)?[àa]\s+|office\s+notarial\s+(?:sis\s+)?(?:[àa]|aux?)\s+|si[èe]ge\s+(?:social\s+)?est\s+[àa]\s+)([A-ZÀ-Ü][^,;.\n()]{1,45})/i;

  // Une occurrence de « Maître » qui ne parle pas d'un notaire (un avocat, une citation) n'est pas
  // une comparution : la fenêtre doit porter la qualité ou le numéro d'office.
  var RE_QUALITE_NOTAIRE = /notaire|crpcen|office\s+notarial/i;

  // Le CRPCEN identifie l'office ; ses DEUX PREMIERS CHIFFRES sont le département. C'est une
  // source bien plus sûre que le nom de la commune, qui ne s'accompagne pas toujours d'un code
  // postal — et le département des notaires est ce qui décide de l'attribution de la minute
  // (art. 30.4.2 RPN et règle du Val de Loire, voir attribuerMinute).
  var RE_INTRODUCTION_NOTAIRE_SUIVANT = /avec\s+(?:le\s+concours|la\s+participation)[^.]*$/i;

  var PORTEE_QUALITE_NOTAIRE = 220;

  // Trame de compromis d'agence en « formulaire » (constaté le 29/09) : « Notaire du VENDEUR :
  // Maître Aurélien LACOUR Adresse : 12 route … 41120 CELLETTES Notaire de l'ACQUEREUR : Maître … ».
  // Le mot en majuscule qui suit le nom est l'intitulé du champ suivant, pas un patronyme : le nom
  // s'arrête au premier de ces intitulés.
  var RE_INTITULE_APRES_NOM_NOTAIRE = /\s+(?:Adresse|Adr|T[ée]l(?:[ée]phone)?|Portable|Fax|E-?mail|Courriel|Mail|Notaire|Office|[ÉE]tude|SCP|SELARL|SELAS|SAS|SARL|CRPCEN|Demeurant|Domicili[ée]e?|Si[èe]ge)(?![A-Za-zÀ-ÿ])/;
  function couperNomNotaire(nom) {
    const m = String(nom || '').match(RE_INTITULE_APRES_NOM_NOTAIRE);
    return (m ? nom.slice(0, m.index) : String(nom || '')).trim();
  }
  // Dans cette trame, le côté est l'intitulé qui PRÉCÈDE immédiatement le nom (« Notaire du
  // VENDEUR : Maître X ») ; celui qui suit le nom est l'intitulé du notaire suivant.
  var RE_COTE_AVANT_NOM_NOTAIRE = /(?:notaire|conseil)\s+(?:d[eu]\s+|de\s+la\s+|de\s+l['’]|des\s+)?(vendeurs?|promettants?|acqu[ée]reurs?|acheteurs?|b[ée]n[ée]ficiaires?)\s*:?\s*$/i;

  var RE_CRPCEN = /CRPCEN\s*n?[°º]?\s*:?\s*(\d{2})\d{3}\b/i;

  // La capture de la commune court jusqu'à la ponctuation suivante et ramasse au passage ce qui
  // suit (« BEAUGENCY le 23 avril 2004 », « BLOIS identifié sous le numéro CRPCEN »). On ne garde
  // que la tête du fragment : le nom d'une commune s'arrête au premier mot de liaison.
  // « Notaire à BLOIS désigné par le vendeur » (compromis d'agence, étude 03/10) : « désigné » n'est pas la commune.
  var RE_SUITE_HORS_COMMUNE = /\s+(?:le|la|les|identifi|soussign|volume|num[ée]ro|en|au|aux|dont|titulaire|membre|exer[çc]|d[ée]sign[ée]|choisi|et\s)/i;

  function nettoyerCommuneNotaire(brut) {
    let ville = String(brut || '').replace(/\s+/g, ' ').trim();
    const m = ville.match(RE_SUITE_HORS_COMMUNE);
    if (m && m.index > 0) ville = ville.slice(0, m.index);
    return ville.trim();
  }

  // Mention explicite du notaire qui reçoit l'acte : priorité absolue sur toute règle métier.
  // Définition donnée par l'étude — « le notaire instrumentaire est celui qui a RÉDIGÉ » : les
  // formes du verbe rédiger sont donc reconnues au même titre que « recevra l'acte », y compris au
  // PASSÉ (« acte rédigé par »), et « notaire rédacteur », terme notarial courant pour le désigner.
  var RE_ROLE_INSTRUMENTAIRE = /(?:recevra\s+l['’]acte|r[ée]it[ée]r[ée]e?s?\s+par\s+acte\s+authentique|acte\s+(?:authentique\s+)?(?:sera\s+)?re[çc]u\s+par|r[ée]dig(?:era|[ée]e?)\s+(?:par|l['’]acte)|notaire\s+r[ée]dacteur|acte\s+(?:sera\s+)?dress[ée]\s+par|notaire\s+instrumentaire|en\s+l['’][ée]tude\s+de)/i;
  // « participant » et « en concours » désignent le même rôle (le second notaire), comme l'étude
  // l'a confirmé — les deux vocabulaires coexistent dans les actes.
  var RE_ROLE_PARTICIPANT = /(?:avec\s+(?:la\s+)?participation\s+de|en\s+participation|notaire\s+(?:participant|concourant)|en\s+concours(?:\s+avec)?|assist[ée]e?\s+de)/i;

  // Clause d'ORIGINE DE PROPRIÉTÉ : elle décrit l'acte PRÉCÉDENT par lequel le vendeur est devenu
  // propriétaire, et nomme donc le notaire de la vente d'AVANT — jamais celui de l'acte en cours.
  // Elle figure dans presque tous les avant-contrats, avec exactement le vocabulaire que
  // RE_ROLE_INSTRUMENTAIRE cherche (« suivant acte reçu par Maître X », « acte rédigé par… ») :
  // sans ce garde-fou, elle désignerait le mauvais notaire AVEC LA PRIORITÉ LA PLUS HAUTE, écrasant
  // la règle géographique et la règle de zone. Devenu indispensable en ajoutant les formes au passé
  // du verbe rédiger ci-dessus, qui sont précisément celles de ces clauses.
  var RE_ORIGINE_PROPRIETE = /(?:origine\s+de\s+propri[ée]t[ée]|suivant\s+acte|aux\s+termes\s+d['’]un\s+acte|pour\s+l['’]avoir\s+(?:acquis|recueilli)|ant[ée]rieurement\s+acquis|service\s+de\s+la\s+publicit[ée]\s+fonci[èe]re|titre\s+de\s+propri[ée]t[ée]|effet\s+relatif|d[ée]p[ôo]t\s+au\s+rang\s+des\s+minutes|pr[ée]c[ée]dent\s+(?:vendeur|propri[ée]taire))/i;

  // Un notaire présenté AVEC UNE DATE (« dressé par Maître X, notaire à BLOIS, LE 28 février
  // 1985 ») est celui d'un acte antérieur : un notaire qui intervient au présent acte n'est jamais
  // introduit par une date. Repère générique, qui ne dépend d'aucune formule d'origine de
  // propriété particulière.
  var RE_NOTAIRE_DATE_ANTERIEURE = /^[^.\n]{0,80}?,?\s*(?:en\s+date\s+d[ue]|le)\s+\d{1,2}(?:er)?\s+[a-zà-ÿ]{3,10}\s+\d{4}/i;

  // Distingue un notaire QUI INTERVIENT à l'acte d'un notaire simplement CITÉ (origine de
  // propriété, acte antérieur, règlement de copropriété dressé en 1969…). Sans cette distinction,
  // un compromis d'agence dont le seul notaire est le nôtre ressortait avec trois « notaires »,
  // et la règle du notaire unique — il représente alors les deux parties — ne s'appliquait jamais.
  function estNotaireCite(fenetreAvant, fenetreApres) {
    if (RE_ORIGINE_PROPRIETE.test(fenetreAvant) || RE_ORIGINE_PROPRIETE.test(fenetreApres)) return true;
    return RE_NOTAIRE_DATE_ANTERIEURE.test(fenetreApres);
  }

  // OÙ les notaires sont nommés, selon le type d'acte — précisé par l'étude : « le nom des notaires
  // est toujours situé en première page pour les promesses de vente et dérivées ; pour les
  // compromis de vente plutôt en fin d'acte ». Les deux zones sont donc distinctes, et chercher au
  // mauvais endroit revient à lire des notaires cités à tout autre titre dans le corps de l'acte
  // (origine de propriété, servitude, acte antérieur...).
  //
  // 2500 caractères en tête : de quoi couvrir un en-tête complet sans mordre sur le corps de
  // l'acte. 3000 en fin : le bloc de clôture d'un compromis (comparution des notaires, signature)
  // est un peu plus étalé qu'un en-tête.
  var ZONE_ENTETE_ACTE = 2500;
  var ZONE_FIN_ACTE = 3000;

  // Ce qui décide vraiment de l'emplacement, c'est la FORME de l'acte, pas son nom — précision de
  // l'étude : « la promesse synallagmatique est à traiter comme une promesse de vente car acte
  // authentique reçu par notaire et pas un acte sous seing privé ». Un acte AUTHENTIQUE s'ouvre
  // par la comparution des notaires (« PAR-DEVANT Maître X… »), donc en première page ; un acte
  // SOUS SEING PRIVÉ (le compromis d'agence, le cas courant) ne les nomme qu'en fin, au moment de
  // désigner qui recevra la vente.
  //
  // À ne pas confondre avec le TYPE d'acte, qui répond à une autre question (qui s'engage à quoi,
  // donc les rôles vendeur/acquéreur) : une promesse synallagmatique reste un COMPROMIS pour les
  // parties — les deux y sont engagées — tout en étant authentique pour la forme. Les deux
  // notions sont donc séparées plutôt que déduites l'une de l'autre.
  var RE_FORME_AUTHENTIQUE = /par[-\s]devant\s+(?:ma[îi]tre|nous|les?\s+notaires?)|re[çc]u\s+en\s+la\s+forme\s+authentique|demeurera?\s+en\s+minute|promesse\s+synallagmatique/i;
  var RE_FORME_SOUS_SEING_PRIVE = /sous\s+seing\s+priv[ée]|sous\s+signatures?\s+priv[ée]e?s?/i;

  // Forme de l'acte, lue dans son EN-TÊTE uniquement : « PAR-DEVANT Maître » ouvre un acte
  // authentique, et « sous seing privé » se déclare de même en tête. Chercher dans tout le
  // document confondrait cette déclaration avec les innombrables mentions de l'acte authentique À
  // VENIR (« la vente sera réitérée par acte authentique »), qui remplissent justement les
  // compromis sous seing privé — c'est le piège principal ici.
  //
  // « promesse synallagmatique » figure parmi les marqueurs d'authenticité non comme une forme,
  // mais parce que l'étude a indiqué que ce type d'acte est toujours reçu par notaire.
  //
  // Second indice, porté par le NOM du fichier : l'étude fait figurer « AAE » — Acte Authentique
  // Électronique, sens confirmé par elle le 19/09/2026 — dans le nom du PDF de tout acte reçu par
  // notaire, promesse comme acte de vente (« Copie AAE PROMESSE DE VENTE … »). Un fichier ainsi
  // nommé est authentique par construction. (La rubrique « 9 - AAE » du NAS, elle, n'a rien à voir
  // avec la forme de l'acte : elle range les pièces réunies entre le compromis et la vente — voir
  // estEmplacementAvantContrat.) L'en-tête du texte reste lu en premier (une déclaration de forme
  // dans l'acte vaut plus qu'une convention de nommage) ; le nom ne tranche que là où l'en-tête ne
  // dit rien.
  var RE_NOM_AAE = /\bAAE\b|acte\s+authentique\s+[ée]lectronique/i;
  function estNomFichierAAE(nom) {
    return RE_NOM_AAE.test(normaliserNomPourMotif(String(nom || '')));
  }

  function detecterFormeActe(texte, nomFichier) {
    const entete = String(texte || '').slice(0, ZONE_ENTETE_ACTE);
    if (RE_FORME_AUTHENTIQUE.test(entete)) return 'authentique';
    if (RE_FORME_SOUS_SEING_PRIVE.test(entete)) return 'sous-seing-prive';
    if (nomFichier && estNomFichierAAE(nomFichier)) return 'authentique';
    return null;
  }

  // Repli quand la forme n'est pas déclarée lisiblement : le nom de l'acte reste le meilleur
  // indice disponible (une promesse est reçue par notaire, un compromis est en général l'acte
  // d'agence sous seing privé). Une seule table, comme REGLES_NOTAIRE_INSTRUMENTAIRE.
  var ZONE_NOTAIRES_PAR_TYPE = {
    PROMESSE_DE_VENTE: 'entete',
    PROMESSE_D_ACHAT: 'entete',
    COMPROMIS_DE_VENTE: 'fin'
  };

  // Zone où chercher les notaires : la FORME d'abord (ce qui décide réellement), le type d'acte
  // seulement en repli.
  function zoneNotairesPourActe(texte, typeActe, nomFichier) {
    const forme = detecterFormeActe(texte, nomFichier);
    if (forme === 'authentique') return 'entete';
    if (forme === 'sous-seing-prive') return 'fin';
    return ZONE_NOTAIRES_PAR_TYPE[typeActe] || null;
  }

  // Rattachement d'un notaire à une partie : « notaire du vendeur », « conseil de l'acquéreur »…
  // L'article DÉFINI manquait à l'alternance : le motif acceptait « notaire du vendeur » mais pas
  // « assistant LE PROMETTANT » ni « assistant LE BENEFICIAIRE », qui sont pourtant la forme
  // standard de la comparution d'un acte authentique. C'est ce seul mot qui laissait le côté de
  // chaque notaire indéterminé sur la totalité des actes du corpus, alors que plusieurs le
  // disaient noir sur blanc.
  // « désigné par le vendeur / par les acquéreurs » (trame d'agence AIM, étude 03/10).
  var RE_COTE_NOTAIRE = /(?:notaire|conseil|assistant?e?|repr[ée]sentant|d[ée]sign[ée]e?\s+par|choisie?\s+par)\s+(?:d[eu]\s+|de\s+la\s+|de\s+l['’]|des\s+|les?\s+|la\s+|l['’])?(vendeurs?|promettants?|acqu[ée]reurs?|acheteurs?|b[ée]n[ée]ficiaires?|parties?\s+venderesses?|parties?\s+acqu[ée]reuses?)/i;

  function qualiteDepuisMot(mot) {
    const m = String(mot || '').toLowerCase();
    if (RE_QUALITE_PROMETTANT.test(m)) return 'promettant';
    if (RE_QUALITE_BENEFICIAIRE.test(m)) return 'beneficiaire';
    if (RE_QUALITE_VENDEUR.test(m)) return 'vendeur';
    if (RE_QUALITE_ACQUEREUR.test(m)) return 'acquereur';
    return null;
  }

  // Repère les notaires cités, leur étude, leur adresse (donc leur département) et le côté auquel
  // ils se rattachent. Plusieurs notaires du même côté sont possibles : on ne suppose jamais qu'il
  // n'y en a qu'un.
  // Isole le fragment d'adresse d'un texte qui en contient plus que l'adresse : on découpe en
  // groupes séparés par des virgules, on garde celui qui porte le code postal, et le précédent s'il
  // ressemble à une voie. Sans ce découpage, parserAdresse prenait la suite de la phrase
  // (« …41000 BLOIS, notaire du vendeur ») et rangeait « notaire du vendeur » en commune.
  // Le fragment va d'un cran avant le code postal à un cran après : la rédaction postale place la
  // voie AVANT, la rédaction notariale APRÈS (voir parserAdresse). Le retour à la ligne n'est
  // surtout PAS un séparateur — un PDF coupe ses lignes où sa mise en page le veut, et couper
  // dessus rendait « ORLEANS (LOIRET) 45000 11 Rue », sans le nom de la voie.
  // Bornes du fragment retenu autour du code postal. Sans elles, le repli qui cherche une adresse
  // dans TOUTE la section désignation renvoyait la section entière (tableau cadastral et
  // description des pièces compris) comme « adresse du bien ».
  var AVANT_CODE_POSTAL = 80;
  var APRES_CODE_POSTAL = 90;

  function fenetreAutourDuCodePostal(source) {
    const m = source.match(/\b\d{5}\b/);
    if (!m) return source;
    const debutBrut = Math.max(0, m.index - AVANT_CODE_POSTAL);
    const avant = source.slice(debutBrut, m.index);
    // En amont, la phrase précédente s'arrête au dernier point ou deux-points.
    const coupeAvant = Math.max(avant.lastIndexOf('. '), avant.lastIndexOf(' : '));
    const debut = coupeAvant === -1 ? debutBrut : debutBrut + coupeAvant + 1;
    const apres = source.slice(m.index + 5, m.index + 5 + APRES_CODE_POSTAL);
    // En aval, l'adresse s'arrête à la fin de la phrase ou à un deux-points (« comprenant : »).
    const coupeApres = apres.search(/[.;:]/);
    const fin = m.index + 5 + (coupeApres === -1 ? apres.length : coupeApres);
    return source.slice(debut, fin);
  }

  function extraireFragmentAdresse(texte) {
    const source = fenetreAutourDuCodePostal(String(texte || '').replace(/\s+/g, ' '));
    if (!/\b\d{5}\b/.test(source)) return null;
    const groupes = source.split(/[,;]/);
    const iCp = groupes.findIndex(g => /\b\d{5}\b/.test(g));
    if (iCp === -1) return null;
    const precedent = iCp > 0 ? groupes[iCp - 1].trim() : '';
    const suivant = iCp + 1 < groupes.length ? groupes[iCp + 1].trim() : '';
    const garderPrecedent = /\d/.test(precedent) || RE_TYPE_VOIE.test(precedent) || RE_LIEU_DIT_PREFIXE.test(precedent);
    const morceaux = [];
    if (garderPrecedent) morceaux.push(precedent);
    morceaux.push(groupes[iCp].trim());
    if (suivant) morceaux.push(suivant);
    return morceaux.join(', ').replace(/\s+/g, ' ').trim();
  }

  // Début de la phrase courante : le rattachement d'un notaire à une partie (« Le notaire du
  // vendeur, Maître X ») est toujours dans la MÊME phrase que sa mention.
  function debutPhrase(texte, index) {
    const avant = String(texte || '').slice(0, index);
    const coupure = Math.max(avant.lastIndexOf('.'), avant.lastIndexOf('\n'));
    return coupure === -1 ? 0 : coupure + 1;
  }

  function detecterNotaires(texte, typeActe) {
    const source = String(texte || '');
    if (!source) return [];
    const type = TYPES_ACTE.includes(typeActe) ? typeActe : 'INCONNU';

    // Premier passage : repérer toutes les mentions, pour pouvoir ensuite borner la fenêtre de
    // chaque notaire par son voisin. Sans cette borne, « notaire du vendeur » écrit à la fin de la
    // ligne précédente était attribué au notaire suivant, et une mention « qui recevra l'acte »
    // était comptée pour les deux à la fois.
    const mentions = [];
    const re = new RegExp(RE_MENTION_NOTAIRE.source, 'g');
    let m;
    while ((m = re.exec(source)) !== null) {
      const nom = couperNomNotaire(m[1].replace(/\s+/g, ' ').trim());
      if (!nom || !estNomValide(nom)) continue;
      // La qualité doit être portée par le voisinage immédiat, sans quoi « Maître » peut désigner
      // un avocat ou apparaître dans une citation. Un intitulé « Notaire de l'ACQUEREUR : » juste
      // avant le nom la porte aussi (trame en formulaire, où rien ne suit le nom que l'adresse).
      if (!RE_QUALITE_NOTAIRE.test(source.slice(m.index, m.index + PORTEE_QUALITE_NOTAIRE))
        && !RE_COTE_AVANT_NOM_NOTAIRE.test(source.slice(Math.max(0, m.index - 60), m.index))) continue;
      mentions.push({ index: m.index, longueur: m[0].length, nom });
    }

    const resultats = [];
    const vus = new Set();
    mentions.forEach((mention, i) => {
      const suivante = mentions[i + 1];
      const precedente = mentions[i - 1];
      // La fenêtre est bornée des DEUX côtés par les mentions voisines, pas seulement à droite.
      // Sur un acte authentique, les deux notaires comparaissent dans la même phrase — « Maître A,
      // notaire à …, Notaire assistant le VENDEUR, avec le concours de Maître B, notaire à …,
      // assistant l'ACQUEREUR » — et sans borne à gauche la fenêtre de B remontait jusqu'au rôle
      // de A : les deux notaires ressortaient du côté du vendeur, donc aucun côté acquéreur et
      // aucune attribution possible. Même raison que pour l'office et le CRPCEN, déjà cherchés à
      // partir du nom (voir plus bas).
      const debut = Math.max(
        debutPhrase(source, mention.index),
        precedente ? precedente.index + precedente.longueur : 0
      );
      const fin = Math.min(
        source.length,
        mention.index + mention.longueur + 400,
        suivante ? suivante.index : source.length
      );
      // La phrase qui introduit le notaire SUIVANT (« Avec le concours de… », « Avec la
      // participation de… ») se trouve, par construction, avant sa mention — donc dans la fenêtre
      // du précédent. Sans la retirer, le premier notaire de chaque acte était marqué
      // « participant » alors que c'est le second qui l'est.
      const fenetre = source.slice(debut, fin).replace(RE_INTRODUCTION_NOTAIRE_SUIVANT, ' ');

      // Un notaire simplement CITÉ (origine de propriété, acte antérieur, règlement de
      // copropriété dressé il y a quarante ans) n'intervient pas à l'acte : il est écarté de la
      // liste, et pas seulement privé de rôle. Sans cela, un compromis d'agence dont le seul
      // notaire est le nôtre ressortait avec trois « notaires » — et la règle du notaire unique,
      // qui représente alors LES DEUX PARTIES, ne pouvait jamais s'appliquer.
      const avantMention = source.slice(debut, mention.index);
      const apresMention = source.slice(mention.index + mention.longueur, mention.index + mention.longueur + 200);
      if (estNotaireCite(avantMention, apresMention)) return;

      // Dédoublonnage sur le PATRONYME (dernier mot) : le même notaire est cité tantôt avec son
      // prénom, tantôt sans, et chaque forme comptait pour une personne distincte. APRÈS le filtre
      // ci-dessus, et non avant : le même notaire figure souvent d'abord dans l'origine de
      // propriété (il a reçu la vente précédente) puis, plus loin, comme rédacteur du présent
      // acte — dédoublonner en premier retenait la mention citée et faisait disparaître la bonne.
      const cle = normaliserMaj(mention.nom.split(/\s+/).pop());
      if (vus.has(cle)) return;
      vus.add(cle);

      // Le côté se cherche D'ABORD APRÈS LE NOM, comme l'office et le CRPCEN (voir plus bas), et
      // seulement à défaut dans toute la fenêtre. Sur un acte authentique les deux notaires
      // comparaissent dans la même phrase, chacun suivi de sa qualité — « Maître A, notaire à …,
      // Notaire assistant le VENDEUR, avec le concours de Maître B, notaire à …, assistant
      // l'ACQUEREUR » : la fenêtre de B contient les DEUX marqueurs et le premier rencontré est
      // celui de A, si bien que les deux notaires ressortaient du côté du vendeur. Le repli sur la
      // fenêtre entière reste nécessaire pour la rédaction inverse, « le notaire du vendeur,
      // Maître X », où la qualité précède le nom.
      const apresNom = source.slice(mention.index + mention.longueur, fin).replace(RE_INTRODUCTION_NOTAIRE_SUIVANT, ' ');
      const mCote = source.slice(Math.max(debut, mention.index - 60), mention.index).match(RE_COTE_AVANT_NOM_NOTAIRE)
        || apresNom.match(RE_COTE_NOTAIRE) || fenetre.match(RE_COTE_NOTAIRE);
      const qualite = mCote ? qualiteDepuisMot(mCote[1]) : null;
      const cote = qualite ? (roleDepuisQualite(type, qualite) === 'VENDEUR' ? 'vendeur' : 'acquereur') : 'inconnu';

      let roleExplicite = null;
      if (RE_ROLE_INSTRUMENTAIRE.test(fenetre)) roleExplicite = 'instrumentaire';
      else if (RE_ROLE_PARTICIPANT.test(fenetre)) roleExplicite = 'participant';

      // Le département vient du CODE POSTAL, jamais du seul nom de commune : deux communes de
      // départements différents peuvent porter des noms proches (point insisté par la spec).
      const fragment = extraireFragmentAdresse(source.slice(mention.index, fin));
      const adresse = fragment ? parserAdresse(fragment) : null;
      const adresseUtile = adresse && adresse.codePostal ? adresse : null;
      // Le CRPCEN prime sur le code postal : il désigne l'OFFICE, alors qu'une adresse trouvée
      // dans la même fenêtre peut être celle du bien ou d'un bureau annexe.
      // L'office et le CRPCEN se cherchent À PARTIR DU NOM, pas depuis le début de la phrase :
      // « PAR-DEVANT Maître A, notaire à BLOIS, et Maître B, notaire à ORLEANS » donnait sinon
      // BLOIS aux deux, la fenêtre du second remontant jusqu'à l'office du premier. Le côté et le
      // rôle, eux, gardent la phrase entière : ils peuvent précéder le nom (« Le notaire du
      // vendeur, Maître X »).
      const fenetreApresNom = source.slice(mention.index, fin);
      const mCrpcen = fenetreApresNom.match(RE_CRPCEN);
      const departement = mCrpcen ? mCrpcen[1] : (adresseUtile ? adresseUtile.departement : null);
      const mOffice = fenetreApresNom.match(RE_OFFICE_NOTAIRE);
      const ville = mOffice ? couperNomNotaire(nettoyerCommuneNotaire(mOffice[1])).replace(/\s*:$/, '') : '';

      resultats.push({
        nom: mention.nom,
        office: ville,
        adresse: adresseUtile,
        codePostal: adresseUtile ? adresseUtile.codePostal : null,
        commune: ville || (adresseUtile ? couperNomNotaire(nettoyerCommuneNotaire(adresseUtile.commune)) : null),
        departement,
        cote,
        roleExplicite,
        // Dans quelle zone de l'acte cette mention tombe : c'est l'ordre de citation À L'INTÉRIEUR
        // de la bonne zone qui désigne l'instrumentaire puis le participant (voir
        // ZONE_NOTAIRES_PAR_TYPE et determinerNotaires, dernier recours). Un acte court peut
        // porter les deux drapeaux sur la même mention — sans conséquence, le type d'acte décide
        // seul de la zone consultée.
        enTete: mention.index < ZONE_ENTETE_ACTE,
        enFin: mention.index >= source.length - ZONE_FIN_ACTE,
        source: { extrait: extraireContexte(source, mention.index, mention.longueur), trouve: source.substr(mention.index, mention.longueur), index: mention.index, page: pageDepuisIndex(mention.index) }
      });
    });
    return resultats;
  }

  // Complète les côtés par ÉLIMINATION : il n'y en a que deux. Quand l'acte désigne le côté d'un
  // seul notaire — cas très fréquent, la comparution ne qualifiant souvent que le second
  // (« assistant le BENEFICIAIRE ») — celui du second s'en déduit sans rien deviner.
  function completerCotesParElimination(liste) {
    const connus = liste.filter(n => n.cote === 'vendeur' || n.cote === 'acquereur');
    const inconnus = liste.filter(n => n.cote === 'inconnu');
    if (connus.length !== 1 || inconnus.length !== 1) return;
    inconnus[0].cote = connus[0].cote === 'vendeur' ? 'acquereur' : 'vendeur';
    inconnus[0].coteDeduite = 'elimination';
  }

  // Détermine qui reçoit l'acte. Ordre de priorité :
  //   1. mention explicite dans le document (« l'acte sera reçu par Maître X ») ;
  //   2. l'ordre de citation dans le préambule : le notaire attributaire de la minute y est
  //      nommé EN PREMIER (art. 26.3.2 RPN) ;
  //   3. sinon, rien n'est tranché — NEEDS_REVIEW, jamais un choix arbitraire.
  // Les CÔTÉS (vendeur/acquéreur) se lisent d'abord dans l'acte, puis par élimination, puis se
  // déduisent de la règle d'attribution de la minute (voir coteDepuisAttribution).
  function determinerNotaires(notaires, departementBien, typeActe, zoneFournie) {
    const liste = Array.isArray(notaires) ? notaires : [];
    // L'élimination ne porte que sur les notaires de la COMPARUTION : eux seuls représentent une
    // partie. Un notaire cité ailleurs dans l'acte (origine de propriété, acte antérieur) compte
    // sinon comme un côté inconnu de plus et bloque la déduction.
    const zoneCourante = zoneFournie || ZONE_NOTAIRES_PAR_TYPE[typeActe];
    const comparution = zoneCourante
      ? liste.filter(n => (zoneCourante === 'entete' ? n.enTete : n.enFin))
      : [];
    completerCotesParElimination(comparution.length >= 2 ? comparution : liste);
    const cotesVendeur = liste.filter(n => n.cote === 'vendeur');
    const cotesAcquereur = liste.filter(n => n.cote === 'acquereur');
    const explicites = liste.filter(n => n.roleExplicite === 'instrumentaire');

    const resultat = {
      liste,
      vendeur: cotesVendeur[0] || null,
      acquereur: cotesAcquereur[0] || null,
      instrumentaire: null,
      participant: null,
      statut: 'NOT_FOUND',
      raison: '',
      roleEtude: null
    };

    if (liste.length === 0) {
      resultat.raison = 'Aucun notaire identifié dans le document.';
      return resultat;
    }

    // Deux notaires désignés instrumentaires, ou deux notaires d'un même côté : on ne tranche pas.
    if (explicites.length > 1) {
      resultat.statut = 'NEEDS_REVIEW';
      resultat.raison = 'Plusieurs notaires sont présentés comme recevant l’acte : à vérifier dans le document.';
      return resultat;
    }

    // Un seul notaire intervient : il n'y a rien à répartir — les règles d'attribution ne visent
    // que « l'intervention de plusieurs notaires » (art. 30.4.2 RPN) — et il représente LES DEUX
    // PARTIES. Cas courant signalé par l'étude : sans confrère, le notaire reçoit l'acte pour le
    // vendeur comme pour l'acquéreur, et les deux champs de la fiche portent donc son nom — en
    // laisser un vide suggérerait qu'il manque quelqu'un. Traité AVANT les autres règles et non
    // comme leur repli : une formule aussi banale que « en l'étude de Maître X » suffisait sinon à
    // partir sur la branche « mention explicite », qui ne remplit aucun côté.
    if (liste.length === 1) {
      resultat.instrumentaire = liste[0];
      resultat.participant = null;
      resultat.vendeur = liste[0];
      resultat.acquereur = liste[0];
      resultat.notaireUnique = true;
      resultat.statut = 'CONFIRMED';
      resultat.raison = 'Un seul notaire intervient : il représente les deux parties et la minute lui revient.';
    } else if (explicites.length === 1) {
      resultat.instrumentaire = explicites[0];
      resultat.statut = 'CONFIRMED';
      resultat.raison = 'Le document désigne explicitement ce notaire pour recevoir l’acte.';
    } else if (resultat.vendeur && resultat.acquereur) {
      // Les deux côtés sont connus : c'est exactement le cas que la règle d'attribution tranche.
      const attribution = attribuerMinute(resultat.vendeur.departement, resultat.acquereur.departement, departementBien);
      if (attribution) {
        resultat.instrumentaire = attribution.cote === 'vendeur' ? resultat.vendeur : resultat.acquereur;
        resultat.participantZone = attribution.cote === 'vendeur' ? resultat.acquereur : resultat.vendeur;
        resultat.statut = 'CONFIRMED';
        resultat.raison = attribution.source === 'Val de Loire'
          ? 'Les deux notaires exercent dans le ressort de la Cour d’appel d’Orléans : la minute revient au notaire du vendeur (règlement de la Chambre du Val de Loire, art. 15).'
          : (attribution.cote === 'vendeur'
            ? 'La minute de la vente revient au notaire du vendeur (RPN, art. 30.4.2).'
            : 'Seul le notaire de l’acquéreur exerce dans le département du bien : la minute lui revient (RPN, art. 30.4.2).');
      }
    }
    if (!resultat.instrumentaire && explicites.length !== 1) {
      {
        // À défaut : l'ordre de citation dans la zone où cet acte nomme ses notaires —
        // première page pour une promesse, fin d'acte pour un compromis (voir
        // ZONE_NOTAIRES_PAR_TYPE). Le premier nommé reçoit l'acte, le second participe.
        // N'intervient qu'ici, une fois les deux règles supérieures épuisées : une mention
        // explicite ou la règle géographique restent prioritaires, et ce cas ne peut donc rien
        // faire régresser de ce qui était déjà tranché.
        const zone = zoneCourante;
        const dansZone = comparution;
        if (dansZone.length >= 2) {
          resultat.instrumentaire = dansZone[0];
          resultat.participantZone = dansZone[1];
          resultat.statut = 'CONFIRMED';
          // Ordre confirmé par l'étude : « le notaire instrumentaire est celui qui a rédigé, et
          // celui en participation ou en concours est celui qui est en second ».
          resultat.raison = zone === 'entete'
            ? 'Premier notaire nommé en tête de la première page de la promesse : c’est lui qui a rédigé l’acte (le second intervient en participation).'
            : 'Premier notaire nommé en fin de compromis : c’est lui qui a rédigé l’acte (le second intervient en participation).';
        } else {
          resultat.statut = 'NEEDS_REVIEW';
          resultat.raison = dansZone.length === 1
            ? 'Un seul notaire est nommé dans cet acte : rien n’indique une intervention à deux.'
            : 'Aucune mention explicite et les notaires ne sont pas identifiables dans le préambule : à confirmer.';
        }
      }
    }

    if (resultat.instrumentaire && resultat.notaireUnique) {
      resultat.roleEtude = deduireRoleEtude(resultat);
    } else if (resultat.instrumentaire) {
      const participantExplicite = liste.find(n => n.roleExplicite === 'participant' && n !== resultat.instrumentaire);
      resultat.participant = participantExplicite
        || resultat.participantZone
        || liste.find(n => n !== resultat.instrumentaire && (n.cote === 'vendeur' || n.cote === 'acquereur'))
        || null;
      delete resultat.participantZone;

      // Les côtés ne sont toujours pas connus : les déduire de la règle d'attribution de la
      // minute. Le notaire nommé en premier détient la minute (art. 26.3.2 RPN), et la minute
      // revient au notaire du VENDEUR — toujours entre deux notaires du ressort de la Cour
      // d'appel d'Orléans, par défaut ailleurs (voir coteDepuisAttribution).
      if (!resultat.vendeur && !resultat.acquereur && resultat.instrumentaire && resultat.participant) {
        const deduction = coteDepuisAttribution(
          resultat.instrumentaire.departement,
          resultat.participant.departement,
          departementBien
        );
        if (deduction) {
          const vendeur = deduction.cote === 'vendeur' ? resultat.instrumentaire : resultat.participant;
          const acquereur = vendeur === resultat.instrumentaire ? resultat.participant : resultat.instrumentaire;
          vendeur.cote = 'vendeur';
          vendeur.coteDeduite = 'attribution';
          acquereur.cote = 'acquereur';
          acquereur.coteDeduite = 'attribution';
          resultat.vendeur = vendeur;
          resultat.acquereur = acquereur;
          resultat.raisonCotes = deduction.raison;
        }
      }

      resultat.roleEtude = deduireRoleEtude(resultat);
    }

    return resultat;
  }

  function estEtude(notaire) {
    if (!notaire) return false;
    const texte = `${notaire.nom || ''} ${notaire.office || ''}`;
    return IDENTITE_ETUDE.motifs.some(re => re.test(texte));
  }

  // Le rôle de l'étude découle de sa place parmi les notaires identifiés : si c'est elle qui reçoit
  // l'acte, elle est instrumentaire ; si elle est citée sans recevoir l'acte, elle est participante.
  // null = l'étude n'est pas reconnue dans le document, et le sélecteur n'est pas touché.
  function deduireRoleEtude(resultat) {
    if (!resultat) return null;
    if (estEtude(resultat.instrumentaire)) return 'instrumentaire';
    if ((resultat.liste || []).some(estEtude)) return 'participant';
    return null;
  }

  // Libellé d'un notaire tel qu'il sera écrit dans le champ libre de la fiche : « Sophie GOSSART
  // (BLOIS) ». Une chaîne, pas un objet — ces deux champs sont directement éditables par l'étude
  // (elle peut corriger une lecture fausse, ou saisir un notaire que le document ne nommait pas).
  // « Maître » est ajouté ici et pas dans la détection : RE_NOTAIRE s'ancre justement sur ce mot
  // pour trouver le nom, qu'elle ne capture donc jamais. Le test de présence évite de le doubler
  // sur un nom déjà saisi « Maître X » à la main par l'étude.
  function libelleNotaire(n) {
    if (!n || !n.nom) return '';
    const nom = /^ma[îi]tre\b/i.test(n.nom.trim()) ? n.nom.trim() : `Maître ${n.nom.trim()}`;
    const office = String(n.office || n.commune || '').trim().replace(/[\s,]+(?:et|ainsi|avec|de)$/i, '').trim();
    return office ? `${nom} (${office})` : nom;
  }

  // Ce qui est enregistré sur le dossier à la création : le notaire de chaque côté, et de quel
  // côté se trouve celui qui rédige l'acte. Quand l'acte ne dit PAS de quel côté intervient chaque
  // notaire (comparution simple en tête d'acte authentique, cas fréquent), les deux champs restent
  // VIDES plutôt que devinés — les noms détectés restent proposés dans la liste déroulante du
  // champ (`detectes`), à l'étude de les affecter. Choix explicite de l'étude.
  function cotesNotairesPourDossier(notaires) {
    const vide = { vendeur: '', acquereur: '', coteInstrumentaire: null, detectes: [] };
    if (!notaires) return vide;
    const liste = Array.isArray(notaires.liste) ? notaires.liste : [];
    const memeNotaire = (a, b) => !!(a && b && a.nom && b.nom && a.nom === b.nom);
    const detectes = liste.map(n => ({
      nom: libelleNotaire(n),
      // Le rédacteur repéré à l'import garde son rôle même sans côté : une fois que l'étude aura
      // affecté ce nom à l'un des deux champs, le badge « Reçoit l'acte » pourra enfin se poser
      // (voir affecterNotaire) sans qu'on ait à redemander quoi que ce soit.
      role: memeNotaire(n, notaires.instrumentaire) ? 'instrumentaire'
        : (memeNotaire(n, notaires.participant) ? 'participant' : null)
    })).filter(x => x.nom);

    const vendeur = libelleNotaire(notaires.vendeur);
    const acquereur = libelleNotaire(notaires.acquereur);
    let coteInstrumentaire = null;
    if (notaires.instrumentaire) {
      if (vendeur && memeNotaire(notaires.vendeur, notaires.instrumentaire)) coteInstrumentaire = 'vendeur';
      else if (acquereur && memeNotaire(notaires.acquereur, notaires.instrumentaire)) coteInstrumentaire = 'acquereur';
    }
    return { vendeur, acquereur, coteInstrumentaire, detectes };
  }

  // De quel côté intervient NOTRE étude, d'après les deux champs de la fiche (voir estEtude, qui
  // tolère les deux graphies GOSSART/GOSSARD).
  function coteEtudeDossier(d) {
    if (!d) return null;
    if (d.notaireVendeur && estEtude({ nom: d.notaireVendeur })) return 'vendeur';
    if (d.notaireAcquereur && estEtude({ nom: d.notaireAcquereur })) return 'acquereur';
    return null;
  }

  // Le rôle de l'étude n'est plus un choix à part : il DÉCOULE du côté qui reçoit l'acte. Si notre
  // étude est ce côté-là, elle est instrumentaire ; sinon elle est participante. Les deux
  // sélecteurs « Rôle du notaire » et « Acte reçu par » ont donc disparu de la grille de
  // classification (doublon signalé par l'étude) — mais `d.roleNotaire` reste écrit dans le
  // dossier, car tout le reste de l'outil s'appuie dessus (checklist des pièces masquée pour un
  // participant, relance à l'acquéreur, filtre « Rôle » du Suivi).
  // Renvoie true si la valeur a changé, pour que l'appelant sache s'il doit sauvegarder.
  function deduireRoleNotaireDossier(d) {
    if (!d) return false;
    const cote = coteEtudeDossier(d);
    // Notre étude n'est reconnue dans aucun des deux champs, ou personne ne reçoit encore l'acte :
    // il n'y a rien à déduire, et surtout rien à écraser — le rôle reste celui que l'étude a posé
    // elle-même (voir le repli `basculerRoleEtude`, affiché précisément dans ce cas).
    if (!cote || !d.coteInstrumentaire) return false;
    const attendu = cote === d.coteInstrumentaire ? 'instrumentaire' : 'participant';
    if ((d.roleNotaire === 'participant' ? 'participant' : 'instrumentaire') === attendu) return false;
    d.roleNotaire = attendu;
    return true;
  }

  // L'acquéreur est-il représenté par un office DISTINCT du nôtre (« en participation »/« en
  // concours ») ? Pas seulement « un nom est renseigné » : si ce nom EST notre étude (nous
  // représentons nous-mêmes l'acquéreur), rien de spécial à faire, c'est le cas normal. Sinon, la
  // déontologie interdit au notaire instrumentaire de contacter directement le client d'un confrère
  // — les demandes doivent transiter par son office. Demandé explicitement par l'étude.
  function notaireParticipantRepresenteAcquereur(d) {
    return !!(d && d.notaireAcquereur && !estEtude({ nom: d.notaireAcquereur }));
  }

  // Même règle côté vendeur : un vendeur représenté par un office distinct du nôtre s'écrit par
  // son notaire, jamais directement.
  function confrereRepresenteVendeur(d) {
    return !!(d && d.notaireVendeur && !estEtude({ nom: d.notaireVendeur }));
  }

  // Email à utiliser pour toute relance normalement adressée à l'acquéreur (prêt manquant, RIB) :
  // celui du notaire qui le représente si un office distinct a été identifié (jamais l'adresse
  // personnelle du client dans ce cas), sinon l'email de l'acquéreur lui-même.
  // À défaut d'adresse saisie sur le dossier, celle de l'office du confrère dans le carnet.
  function emailDestinataireRelance(d) {
    if (notaireParticipantRepresenteAcquereur(d)) return d.emailNotaireParticipant || emailOfficeConfrereAcquereur(d);
    return d.emailAcquereur || '';
  }

  // Email du confrère qui représente le vendeur : celui saisi sur la fiche (d.emailConfrereVendeur, relevé dans les emails
  // des dossiers), à défaut l'email de son office dans l'annuaire ; '' quand le vendeur n'a pas d'autre notaire.
  function emailConfrereVendeurDossier(d) {
    if (!confrereRepresenteVendeur(d)) return '';
    return (d && d.emailConfrereVendeur) || emailOfficeConfrereVendeur(d);
  }

  // Email de l'office qui représente le vendeur, tiré de l'annuaire ('' sinon).
  function emailOfficeConfrereVendeur(d) {
    if (!confrereRepresenteVendeur(d)) return '';
    const t = trouverOfficeConfrere(d.notaireVendeur, typeof carnetConfreres !== 'undefined' ? carnetConfreres : []);
    return (t && t.office.email) || '';
  }

  // Email de l'office qui représente l'acquéreur, tiré du carnet des confrères ('' sinon).
  function emailOfficeConfrereAcquereur(d) {
    if (!notaireParticipantRepresenteAcquereur(d)) return '';
    const t = trouverOfficeConfrere(d.notaireAcquereur, typeof carnetConfreres !== 'undefined' ? carnetConfreres : []);
    return (t && t.office.email) || '';
  }

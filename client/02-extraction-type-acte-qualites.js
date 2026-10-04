  // ==== EXTRACTION STRUCTURÉE : type d'acte et qualités des parties ====
  //
  // Point de départ de toute la refonte : le TYPE D'ACTE doit être déterminé AVANT d'attribuer les
  // rôles, parce que la même qualité ne désigne pas la même partie d'un acte à l'autre.
  //  - compromis de vente        : vendeur → VENDEUR,     acquéreur   → ACQUEREUR
  //  - promesse de vente         : promettant → VENDEUR,  bénéficiaire → ACQUEREUR
  //  - promesse d'ACHAT          : promettant → ACQUEREUR, bénéficiaire → VENDEUR  (inversion !)
  // Jusqu'ici RE_ROLE_VENDEUR listait « promettant » comme simple synonyme de « vendeur », sans
  // jamais regarder le type d'acte : une promesse d'achat ressortait donc avec vendeur et acquéreur
  // intervertis, silencieusement.

  var TYPES_ACTE = ['COMPROMIS_DE_VENTE', 'PROMESSE_DE_VENTE', 'PROMESSE_D_ACHAT', 'AUTRE', 'INCONNU'];

  // Chaque type d'acte donne la correspondance qualité → rôle. Les quatre qualités sont présentes
  // dans chaque table : un compromis peut employer le vocabulaire « promettant » (promesse
  // synallagmatique), et une promesse peut nommer les parties « vendeur »/« acquéreur » dans ses
  // clauses. INCONNU et AUTRE reprennent volontairement la convention historique de l'outil
  // (promettant → vendeur) : sans type d'acte établi, on ne change rien à ce qui marchait.
  var ROLES_PAR_TYPE_ACTE = {
    COMPROMIS_DE_VENTE: { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' },
    PROMESSE_DE_VENTE:  { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' },
    PROMESSE_D_ACHAT:   { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'ACQUEREUR', beneficiaire: 'VENDEUR' },
    AUTRE:              { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' },
    INCONNU:            { vendeur: 'VENDEUR', acquereur: 'ACQUEREUR', promettant: 'VENDEUR', beneficiaire: 'ACQUEREUR' }
  };

  function roleDepuisQualite(typeActe, qualite) {
    const table = ROLES_PAR_TYPE_ACTE[typeActe] || ROLES_PAR_TYPE_ACTE.INCONNU;
    return table[qualite] || null;
  }

  // Motifs de qualité, séparés (contrairement à RE_ROLE_VENDEUR/RE_ROLE_ACQUEREUR, qui fusionnaient
  // deux qualités distinctes dans un même motif et rendaient l'inversion impossible à exprimer).
  // « propriétaire » est volontairement ABSENT malgré la spec : le mot apparaît constamment dans la
  // désignation du bien et les clauses de jouissance d'un compromis ordinaire, il ferait remonter
  // des blocs de texte sans rapport avec la présentation des parties. À réintroduire seulement si
  // un acte réel montre qu'il est le seul mot employé pour désigner le vendeur.
  var RE_QUALITE_VENDEUR = /\bvendeurs?\b|\bparties?\s+venderesses?\b|\bc[ée]dants?\b/i;
  var RE_QUALITE_PROMETTANT = /\bpromettants?\b/i;
  var RE_QUALITE_ACQUEREUR = /\bacqu[ée]reurs?\b|\bacheteurs?\b|\bparties?\s+acqu[ée]reuses?\b|\bcessionnaires?\b/i;
  var RE_QUALITE_BENEFICIAIRE = /\bb[ée]n[ée]ficiaires?\b/i;

  var QUALITES_CONNUES = [
    { qualite: 'vendeur', re: RE_QUALITE_VENDEUR },
    { qualite: 'promettant', re: RE_QUALITE_PROMETTANT },
    { qualite: 'acquereur', re: RE_QUALITE_ACQUEREUR },
    { qualite: 'beneficiaire', re: RE_QUALITE_BENEFICIAIRE }
  ];

  // Zone d'analyse du type d'acte : titre + exposé, là où l'acte se nomme lui-même. Au-delà, les
  // clauses citent couramment les autres formes (« à défaut de réitération de la présente
  // promesse », « comme il est d'usage en matière de compromis »), ce qui brouillerait le comptage.
  var ZONE_TYPE_ACTE = 6000;

  var MOTIFS_TYPE_ACTE = [
    { type: 'PROMESSE_D_ACHAT', re: /promesse\s+(?:unilat[ée]rale\s+)?d['’\s]*achat|offre\s+d['’\s]*achat\s+irr[ée]vocable/gi },
    { type: 'PROMESSE_DE_VENTE', re: /promesse\s+(?:unilat[ée]rale\s+)?de\s+vente/gi },
    { type: 'COMPROMIS_DE_VENTE', re: /compromis(?:\s+de\s+vente)?|promesse\s+synallagmatique(?:\s+de\s+vente)?/gi }
  ];

  // Classification par le contexte global plutôt que par la présence d'un mot isolé (exigence
  // explicite de la spec) : on compte les occurrences de chaque forme dans la zone de titre et on
  // ne déclare CONFIRMED qu'une dominance nette. À égalité, ou sans aucune occurrence, le type
  // reste INCONNU — et les rôles retombent alors sur la convention historique, jamais sur une
  // inversion hasardeuse.
  function detecterTypeActe(texte) {
    const zone = String(texte || '').slice(0, ZONE_TYPE_ACTE);
    const mesures = MOTIFS_TYPE_ACTE.map(m => {
      const re = new RegExp(m.re.source, 'gi');
      let occurrences = 0;
      let premier = null;
      let trouve;
      while ((trouve = re.exec(zone)) !== null) {
        occurrences++;
        if (premier === null) premier = trouve;
      }
      return { type: m.type, occurrences, premier };
    });
    const classees = mesures.filter(m => m.occurrences > 0).sort((a, b) => b.occurrences - a.occurrences);
    if (classees.length === 0) return { valeur: 'INCONNU', statut: 'NOT_FOUND', source: null };
    const gagnant = classees[0];
    const suivant = classees[1];
    const source = gagnant.premier
      ? { extrait: extraireContexte(zone, gagnant.premier.index, gagnant.premier[0].length), index: gagnant.premier.index }
      : null;
    // Dominance nette : soit la seule forme citée, soit deux fois plus citée que la suivante.
    const net = !suivant || gagnant.occurrences >= suivant.occurrences * 2;
    return { valeur: gagnant.type, statut: net ? 'CONFIRMED' : 'NEEDS_REVIEW', source };
  }

  // Pour un rôle donné (VENDEUR/ACQUEREUR) et un type d'acte, retrouve la qualité effectivement
  // employée par le document et la position de sa première mention.
  function qualitePourRole(texte, typeActe, role) {
    const candidats = QUALITES_CONNUES
      .filter(q => roleDepuisQualite(typeActe, q.qualite) === role)
      // Pas un simple `search()` : la première occurrence d'un mot-clé de rôle peut appartenir à la
      // comparution des notaires (voir chercherMentionPartie).
      .map(q => {
        const mention = chercherMentionPartie(String(texte || ''), q.re, 0);
        return { ...q, index: mention ? mention.index : -1 };
      })
      .filter(q => q.index !== -1)
      .sort((a, b) => a.index - b.index);
    return candidats[0] || null;
  }

  // Personne morale : la raison sociale suit la forme juridique, parfois entre guillemets. Premier
  // jet, comme l'ont été les motifs de pièces en leur temps — à resserrer sur de vrais actes.
  var RE_PERSONNE_MORALE = /\b(SCI|SCCV|SARL|SASU|SAS|EURL|SCP|SA|SC)\b[\s,]*(?:d[ée]nomm[ée]e?\s+)?["«'’]?\s*([A-ZÀ-Ü0-9][^,.\n«»"'’]{2,60}?)\s*["»'’]?\s*(?=,|\.|\n|$|\bau\s+capital\b|\bdont\s+le\s+si[èe]ge\b|\brepr[ée]sent)/;
  var RE_REPRESENTANT = /repr[ée]sent[ée]e?\s+par\s+(?:Monsieur|Madame|Mademoiselle|M\.|Mme)?\s*([A-ZÀ-Ü][^,.\n]{2,60}?)(?=,|\.|\n|$|\ben\s+qualit[ée]\b|\bagissant\b)/i;

  // ---- Identité d'une personne morale : SIREN, RCS, siège, capital ------------------------------
  // Aucune société partie à un acte du corpus réel, mais trois sociétés y sont décrites avec la
  // rédaction notariale exacte qu'emploie la présentation d'une partie — c'est sur elles que ces
  // motifs ont été écrits (agence, prêteur, confrère) :
  //  « SARLU au capital de 100 000 €, dont le siège social est situé 3 Avenue du Président Wilson -
  //    41000 BLOIS, RCS BLOIS n° 410 876 361 » ;
  //  « Société en nom collectif au capital de 5.100.000 €, dont le siège est à PARIS (75801), 19 rue
  //    de Vienne, identifiée au SIREN sous le numéro 732014964 et immatriculée au Registre du Commerce
  //    et des Sociétés de PARIS » ;
  //  « SAS au capital de 1.507.656 €, dont le siège social est à BORDEAUX (33100), 28 avenue Thiers,
  //    immatriculée au Registre du Commerce et des Sociétés de Bordeaux, sous le numéro 414 854 216
  //    00010, n° SIREN 414 854 216 ».
  // Le SIREN porte une clé de contrôle (algorithme de Luhn) : un numéro qui ne la vérifie pas est une
  // coquille de l'acte ou une lecture fautive, et le dire vaut mieux que de le reprendre tel quel.
  var RE_SIREN_EXPLICITE = /\bSIREN\b[^0-9]{0,40}?(\d{3}\s?\d{3}\s?\d{3})(?!\s?\d)/i;
  var RE_RCS_NUMERO = /(?:\bR\.?\s?C\.?\s?S\.?|Registre\s+du\s+Commerce\s+et\s+des\s+Soci[ée]t[ée]s)[^0-9]{0,60}?(\d{3}\s?\d{3}\s?\d{3})(?:\s?\d{5})?(?!\s?\d)/i;
  var RE_RCS_VILLE = /(?:\bR\.?\s?C\.?\s?S\.?|Registre\s+du\s+Commerce\s+et\s+des\s+Soci[ée]t[ée]s)\s+(?:de\s+|d['’]\s*)?([A-ZÀ-Ü][A-Za-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ü][A-Za-zÀ-ÿ'’-]+){0,3})/;
  var RE_SIEGE_SOCIETE = /dont\s+le\s+si[èe]ge(?:\s+social)?\s+est\s+(?:situ[ée]\s+|fix[ée]\s+|[ée]tabli\s+)?(?:[àa]u?\s+)?([^.;]{5,140}?)(?=\s*,\s*(?:identifi|immatricul|inscrit|repr[ée]sent|R\.?\s?C\.?\s?S|n[°ºo]\s*SIREN|SIREN)|\s+R\.?\s?C\.?\s?S|\s*[.;]|$)/i;
  var RE_CAPITAL_SOCIETE = /au\s+capital\s+(?:social\s+)?(?:de\s+)?(\d[\d\s.]*(?:,\d{1,2})?)\s*(?:€|euros?|EUR\b)/i;

  function sirenValide(siren) {
    const chiffres = String(siren || '').replace(/\D/g, '');
    if (chiffres.length !== 9) return false;
    let somme = 0;
    for (let i = 0; i < 9; i++) {
      let n = Number(chiffres[8 - i]);
      if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
      somme += n;
    }
    return somme % 10 === 0;
  }

  // Pure : lit l'identité dans la présentation de la société (le bloc qui suit sa raison sociale).
  function detecterIdentiteSociete(bloc) {
    const t = String(bloc || '').replace(/\s+/g, ' ');
    const brut = (RE_SIREN_EXPLICITE.exec(t) || RE_RCS_NUMERO.exec(t) || [])[1] || null;
    const siren = brut ? brut.replace(/\s/g, '') : null;
    const siege = RE_SIEGE_SOCIETE.exec(t);
    const ville = RE_RCS_VILLE.exec(t);
    const capital = RE_CAPITAL_SOCIETE.exec(t);
    const capitalValeur = capital ? Number(capital[1].split(',')[0].replace(/[\s.]/g, '')) : null;
    const identite = {
      siren,
      sirenValide: siren ? sirenValide(siren) : null,
      rcs: ville ? ville[1].replace(/\s+/g, ' ').trim() : null,
      siege: siege ? siege[1].replace(/\s+-\s+/g, ', ').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim() : null,
      capital: Number.isFinite(capitalValeur) ? capitalValeur : null
    };
    return (identite.siren || identite.siege || identite.rcs || identite.capital != null) ? identite : null;
  }

  // « SIREN 410 876 361 (RCS BLOIS) · siège : 3 Avenue du Président Wilson, 41000 BLOIS ». Pure.
  function libelleIdentiteSociete(soc) {
    if (!soc) return '';
    const morceaux = [];
    if (soc.siren) morceaux.push(`SIREN ${soc.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}${soc.rcs ? ` (RCS ${soc.rcs})` : ''}${soc.sirenValide === false ? ' — numéro invalide, à vérifier' : ''}`);
    else if (soc.rcs) morceaux.push(`RCS ${soc.rcs}`);
    if (soc.siege) morceaux.push(`siège : ${soc.siege}`);
    return morceaux.join(' · ');
  }

  // Extrait les parties du document, chacune avec sa qualité TELLE QU'ÉCRITE dans l'acte et le rôle
  // qui en découle POUR CE TYPE D'ACTE. Gère plusieurs vendeurs et plusieurs acquéreurs (les noms
  // sont extraits un par un, voir extraireNomsParNaissance), ainsi qu'une personne morale avec son
  // représentant.
  // Nom d'usage d'une partie mariée ou veuve, lu dans son état civil : « Madame Yvette MARTIN, …
  // Veuve de Monsieur Jean CRIL » → MARTIN verse et signe sous le nom CRIL (reçus comptables,
  // courriers). Rattaché à la partie nommée juste avant la mention. Pure : renvoie { NOM: usage }.
  var RE_NOM_USAGE_CONJOINT = /(?:[Vv]euve|[ÉéEe]pouse)\s+(?:en\s+\S+\s+noces\s+)?de\s+Monsieur\s+(?:[A-ZÀ-Ý][a-zà-ÿ'’]+(?:-[A-ZÀ-Ý][a-zà-ÿ'’]+)*\s+)+([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[^\S\n]*-[^\S\n]*[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}|[^\S\n]+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*)/g;
  function nomsUsageDansBloc(bloc, noms) {
    const out = {};
    const texte = String(bloc || '');
    const re = new RegExp(RE_NOM_USAGE_CONJOINT.source, 'g');
    let m;
    while ((m = re.exec(texte)) !== null) {
      const usage = normaliserEspacesNom(m[1]);
      if (!estNomValide(usage)) continue;
      let titulaire = null, pos = -1;
      for (const nom of noms || []) {
        const i = texte.lastIndexOf(nom, m.index);
        if (i > pos) { pos = i; titulaire = nom; }
      }
      if (titulaire && titulaire !== usage && !out[titulaire]) out[titulaire] = usage;
    }
    return out;
  }

  function detecterParties(texte, typeActe) {
    const source = String(texte || '');
    if (!source) return [];
    const type = TYPES_ACTE.includes(typeActe) ? typeActe : 'INCONNU';
    const cotes = [
      qualitePourRole(source, type, 'VENDEUR'),
      qualitePourRole(source, type, 'ACQUEREUR')
    ].filter(Boolean);
    // Parcours dans l'ordre d'apparition : sur une promesse d'achat, la partie qui joue le rôle de
    // VENDEUR (le bénéficiaire) peut être présentée après l'autre.
    cotes.sort((a, b) => a.index - b.index);

    const parties = [];
    let curseur = 0;
    for (let iCote = 0; iCote < cotes.length; iCote++) {
      const cote = cotes[iCote];
      const role = roleDepuisQualite(type, cote.qualite);
      // Le bloc d'une partie ne dépasse JAMAIS la première mention de la partie suivante : c'est la
      // seule borne qui ne dépende d'aucune typographie. Les autres (« ci-après dénommé », titre en
      // capitales) échouent dès que pdf.js espace un tiret (« Ci - après ») ou qu'un saut de page
      // s'intercale — le bloc du PROMETTANT avalait alors le BÉNÉFICIAIRE, et tout l'acte ne
      // comptait plus que des vendeurs (constaté sur deux vraies promesses unilatérales).
      const suivante = cotes[iCote + 1];
      const borne = suivante && suivante.index > cote.index ? suivante.index : source.length;
      const resultat = nomsEtFinPourRole(source.slice(0, borne), cote.re, curseur);
      let noms = resultat.noms;
      // Borné par la partie suivante, comme les noms : sans cette borne, un vendeur personne physique
      // suivi d'une SCI acquéreuse devenait lui aussi « SCI … » (la raison sociale de l'acquéreur
      // tombait dans les 1200 caractères lus après le titre du vendeur).
      const bloc = source.slice(cote.index, Math.min(borne, cote.index + 1200));

      // Personne morale : sa raison sociale remplace les noms de personnes physiques du bloc, qui
      // ne sont alors que ceux du représentant.
      const morale = bloc.match(RE_PERSONNE_MORALE);
      if (morale) {
        const mRepresentant = bloc.match(RE_REPRESENTANT);
        // L'identité est lue jusqu'au représentant : ce qui suit décrit une personne physique.
        const presentation = bloc.slice(morale.index, mRepresentant ? mRepresentant.index : bloc.length);
        parties.push({
          nom: `${morale[1]} ${morale[2].trim()}`.replace(/\s+/g, ' ').trim(),
          qualiteActe: cote.qualite,
          role,
          qualitePersonne: 'morale',
          representant: mRepresentant ? mRepresentant[1].replace(/\s+/g, ' ').trim() : null,
          societe: detecterIdentiteSociete(presentation),
          source: { extrait: extraireContexte(source, cote.index, cote.qualite.length), index: cote.index }
        });
        curseur = resultat.finAbsolue;
        continue;
      }

      if (noms.length === 0) noms = extraireNomsRepli(source, cote.re);
      // Un nom déjà attribué à la partie précédente ne l'est jamais une seconde fois : le bloc d'une
      // partie peut déborder sur une clause qui renomme l'autre (« QUOTITES VENDUES : Monsieur
      // BOURGUEIL et Madame BOUSSELET vendent la pleine propriété »), et l'acquéreur héritait alors
      // du nom des vendeurs.
      const dejaVus = new Set(parties.map(p => p.nom));
      noms = [...new Set(noms.map(normaliserEspacesNom))].filter(n => !dejaVus.has(n));
      const usages = nomsUsageDansBloc(bloc, noms);
      for (const nom of noms) {
        parties.push(Object.assign({
          nom,
          qualiteActe: cote.qualite,
          role,
          qualitePersonne: 'physique',
          representant: null,
          source: { extrait: extraireContexte(source, cote.index, cote.qualite.length), index: cote.index }
        }, usages[nom] ? { nomUsage: usages[nom] } : {}));
      }
      curseur = resultat.finAbsolue;
    }
    return parties;
  }

  // ==== EXTRACTION STRUCTURÉE : socle de calcul (dates) ====
  //
  // Refonte demandée par l'étude (voir CLAUDE.md) : une date d'échéance exprimée en délai doit
  // être calculée de façon DÉTERMINISTE, côté application — jamais par le modèle IA local, dont
  // l'arithmétique calendaire n'est pas fiable. Ces fonctions sont pures et testées
  // (tests/dates-metier.test.js) ; elles serviront ensuite à construireDatesMetier().

  // Calcule une date d'échéance à partir d'une date de départ et d'un délai {valeur, unite}.
  // Renvoie null si la base est inconnue — cas courant et VOULU : un délai dont le point de départ
  // n'est pas la signature ("à compter de la réalisation de la condition suspensive", "à compter
  // de la notification") ne doit pas être calculé au petit bonheur, il doit remonter en
  // NEEDS_REVIEW pour que l'étude tranche (voir la spec : ne jamais présenter comme certaine une
  // date dont la convention de computation n'est pas établie par le document).
  function calculerDateEcheance(baseIso, delai) {
    if (!baseIso || !delai) return null;
    const valeur = Number(delai.valeur);
    if (!Number.isFinite(valeur) || valeur <= 0) return null;
    if (delai.unite === 'mois') return ajouterMois(baseIso, valeur);
    if (delai.unite === 'jours') return addDays(baseIso, valeur);
    return null;
  }

  // ==== EXTRACTION STRUCTURÉE : adresse ====
  //
  // L'ancien detecterAdresseBien() (voir ADRESSE_BIEN_RE plus haut) renvoie un fragment BRUT, non
  // découpé : impossible d'en tirer le département, qui devient pourtant une donnée pivot (règle
  // du notaire instrumentaire 41/45/37, voir REGLES_NOTAIRE_INSTRUMENTAIRE). parserAdresse()
  // découpe ce fragment en composants, dans un ordre quelconque : un acte écrit aussi bien
  // « 12 rue Victor Hugo, 41000 BLOIS » que « 41000 BLOIS, 12 rue Victor Hugo » ou
  // « Lieu-dit La Grande Maison, 41100 VENDÔME » (bien rural sans numéro ni voie).

  // Liste VOLONTAIREMENT ouverte (la spec insiste : ne pas figer une liste trop restrictive) :
  // `canonique` est la forme retenue à l'affichage, `motifs` les écritures rencontrées, y compris
  // les abréviations. L'ordre compte : les libellés les plus longs sont essayés en premier
  // (« route départementale » avant « route »), sinon le plus court gagnerait par préfixe.
  var TYPES_VOIE = [
    { canonique: 'route départementale', motifs: ['route départementale', 'route departementale', 'rd'] },
    { canonique: 'route nationale', motifs: ['route nationale', 'route nationale', 'rn'] },
    { canonique: 'rond-point', motifs: ['rond-point', 'rond point'] },
    { canonique: 'boulevard', motifs: ['boulevard', 'bd', 'bld', 'boul.'] },
    { canonique: 'avenue', motifs: ['avenue', 'av.', 'av'] },
    { canonique: 'impasse', motifs: ['impasse', 'imp.'] },
    { canonique: 'résidence', motifs: ['résidence', 'residence', 'rés.', 'res.'] },
    { canonique: 'esplanade', motifs: ['esplanade'] },
    { canonique: 'promenade', motifs: ['promenade'] },
    { canonique: 'traverse', motifs: ['traverse'] },
    { canonique: 'faubourg', motifs: ['faubourg', 'fbg'] },
    { canonique: 'passage', motifs: ['passage', 'pass.'] },
    { canonique: 'sentier', motifs: ['sentier', 'sente'] },
    { canonique: 'venelle', motifs: ['venelle'] },
    { canonique: 'domaine', motifs: ['domaine'] },
    { canonique: 'hameau', motifs: ['hameau', 'ham.'] },
    { canonique: 'montée', motifs: ['montée', 'montee'] },
    { canonique: 'square', motifs: ['square', 'sq.'] },
    { canonique: 'chemin', motifs: ['chemin', 'chem.', 'ch.'] },
    { canonique: 'allée', motifs: ['allée', 'allee', 'all.'] },
    { canonique: 'place', motifs: ['place', 'pl.'] },
    { canonique: 'route', motifs: ['route', 'rte'] },
    { canonique: 'cours', motifs: ['cours'] },
    { canonique: 'côte', motifs: ['côte', 'cote'] },
    { canonique: 'cité', motifs: ['cité', 'cite'] },
    { canonique: 'parc', motifs: ['parc'] },
    { canonique: 'quai', motifs: ['quai'] },
    { canonique: 'villa', motifs: ['villa'] },
    { canonique: 'voie', motifs: ['voie'] },
    { canonique: 'clos', motifs: ['clos'] },
    { canonique: 'rue', motifs: ['rue', 'r.'] }
  ];

  function echapperPourRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Alternation construite une fois depuis TYPES_VOIE, triée par longueur décroissante pour que
  // « route départementale » l'emporte sur « route ». Ancrée en début de fragment (^) : le type de
  // voie suit immédiatement le numéro, une fois celui-ci retiré.
  // La borne de fin est un `(?![lettre])` et non un `\b` : une abréviation se terminant par un
  // point (« imp. », « chem. ») ne peut PAS être suivie d'une limite de mot (le point est déjà un
  // caractère non-mot, et l'espace qui suit non plus) — avec `\b`, ces abréviations n'étaient
  // jamais reconnues. Le `(?![lettre])` garde par ailleurs l'effet recherché : « rue » ne doit pas
  // matcher à l'intérieur de « ruelle ».
  var SOURCE_TYPES_VOIE = TYPES_VOIE
    .flatMap(t => t.motifs)
    .sort((a, b) => b.length - a.length)
    .map(echapperPourRegex)
    .join('|');
  var RE_TYPE_VOIE = new RegExp('^(' + SOURCE_TYPES_VOIE + ')(?![a-zA-ZÀ-ÿ])[\\s.]*', 'i');

  // Le point final fait PARTIE du motif déclaré (« imp. », « chem. ») : le retirer avant la
  // comparaison ferait échouer toute abréviation qui n'a pas aussi de variante sans point.
  function typeVoieCanonique(motif) {
    const m = String(motif).toLowerCase().trim();
    const trouve = TYPES_VOIE.find(t => t.motifs.some(x => x.toLowerCase() === m));
    return trouve ? trouve.canonique : null;
  }

  // Le département se déduit du code postal, jamais du seul nom de commune (plusieurs communes
  // portent des noms proches d'un département à l'autre — la spec insiste sur ce point).
  function departementDepuisCodePostal(cp) {
    const chiffres = String(cp || '').replace(/\s/g, '');
    if (!/^\d{5}$/.test(chiffres)) return null;
    // Corse : le 20 se répartit entre 2A (Corse-du-Sud) et 2B (Haute-Corse).
    if (chiffres.startsWith('20')) return parseInt(chiffres.slice(2), 10) <= 199 ? '2A' : '2B';
    // Outre-mer : département sur trois chiffres (971 Guadeloupe … 976 Mayotte).
    if (chiffres.startsWith('97') || chiffres.startsWith('98')) return chiffres.slice(0, 3);
    return chiffres.slice(0, 2);
  }

  // Numéro rejeté en fin de fragment : « rue Victor Hugo n°12 ».
  var RE_NUMERO_FIN = /\bn\s*[°ºo]\s*(\d{1,4}(?:\s*(?:bis|ter|quater))?)\s*$/i;

  function nettoyerBords(s) {
    return String(s || '').replace(/^[\s,;:.\-–—]+/, '').replace(/[\s,;:.\-–—]+$/, '').trim();
  }

  // Deux ordres d'écriture coexistent, et les confondre est ce qui produisait une commune fausse
  // ANNONCÉE COMME SÛRE (« commune : situé à BLOIS ( ») sur la totalité des actes réels du corpus :
  //   - ordre POSTAL      : « 12 rue Victor Hugo, 41000 BLOIS »  (voie, puis code postal, puis commune)
  //   - ordre NOTARIAL    : « situé à BLOIS (41000), 74 rue des Hautes Granges »
  //                         « A CORMERAY (LOIR-ET-CHER) 41120 Clos des Coudres »
  //                         (commune, puis code postal, puis voie)
  // Trois signatures désignent l'ordre notarial sans ambiguïté : un code postal ENTRE PARENTHÈSES,
  // un nom de DÉPARTEMENT entre parenthèses juste avant le code postal, ou un texte qui, juste
  // après le code postal, commence par un numéro ou un type de voie. Sans l'une d'elles, on
  // retombe sur l'ordre postal, qui reste le cas par défaut.
  var RE_CP_ENTRE_PARENTHESES = /\(\s*\d{5}\s*\)/;
  var RE_DEPARTEMENT_ENTRE_PARENTHESES = /\(\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\s-]{3,28}\)\s*(?=\d{5}\b)/;
  var RE_LIEU_DIT_PREFIXE = /^lieu[-\s]?dit\b/i;
  var RE_LIEU_DIT_CHERCHE = /\blieu[-\s]?dit\s+([^,;.|\n]+)/i;

  // Un tiret n'est un séparateur que s'il est ENTOURÉ D'ESPACES (« VENDÔME – rue Victor Hugo ») :
  // un tiret collé appartient au nom de la commune, très fréquent en France
  // (Romorantin-Lanthenay, Saint-Jean-de-la-Ruelle…) — le couper produisait une commune tronquée.
  var RE_SEPARATEUR_ADRESSE = /[,;]|\s[–—-]\s|\s\/\s/;

  // Amorces qui introduisent la commune dans un acte (« sis à », « située à », « Commune de »,
  // « A BLOIS »…). On garde ce qui suit la DERNIÈRE d'entre elles : « Une maison à usage
  // d'habitation, située à MAROLLES » en contient deux, seule la seconde annonce la commune.
  // La borne de gauche est un `(?<![lettre])` et non un `\b` : en JavaScript, `\b` ne connaît que
  // les caractères ASCII, donc « à » n'y est pas une lettre et `\bà` ne matche JAMAIS un « à »
  // précédé d'une espace — c'est-à-dire le cas normal. Le piège avait déjà été rencontré ailleurs
  // dans ce fichier (voir RE_PREPOSITION_LIEU) : sans cette borne, la commune ressortait « à BLOIS ».
  var RE_AMORCE_COMMUNE = /(?<![A-Za-zÀ-ÿ])(?:sises?|sis|situ[ée]e?s?|se\s+trouvant|commune\s+de|[àa]|au|aux)\s+/gi;

  function communeAvantCodePostal(avant) {
    let texte = nettoyerBords(avant);
    if (!texte) return null;
    const re = new RegExp(RE_AMORCE_COMMUNE.source, 'gi');
    let m, apresAmorce = 0;
    while ((m = re.exec(texte)) !== null) apresAmorce = m.index + m[0].length;
    if (apresAmorce) texte = texte.slice(apresAmorce);
    const morceaux = texte.split(RE_SEPARATEUR_ADRESSE);
    texte = nettoyerBords(morceaux[morceaux.length - 1]);
    return texte && /[A-Za-zÀ-ÿ]/.test(texte) && texte.length <= 60 ? texte : null;
  }

  // La voie est CHERCHÉE dans le reste du fragment, jamais déduite de « tout ce qui n'est pas la
  // commune » : les trames notariales intercalent volontiers une description entre les deux
  // (« Commune de LANDES LE GAULOIS (41190) / Une maison d'habitation situé(e) 510 rue Pitouille »).
  var RE_VOIE_DANS_TEXTE = new RegExp(
    '(?:(\\d{1,4}\\s*[-\\/]\\s*\\d{1,4}|\\d{1,4}(?:\\s*(?:bis|ter|quater)\\b|\\s+[A-Za-z]\\b)?)\\s*,?\\s*)?' +
    '\\b(' + SOURCE_TYPES_VOIE + ')(?![a-zA-ZÀ-ÿ])[\\s.]*' +
    '([A-Za-zÀ-ÿ0-9][^,;.\\n]{1,60})',
    'i'
  );

  function chercherVoie(zone) {
    const m = RE_VOIE_DANS_TEXTE.exec(String(zone || ''));
    if (!m) return null;
    let numero = m[1] ? m[1].replace(/\s*([-\/])\s*/g, '$1').replace(/\s+/g, ' ').trim() : null;
    let nomVoie = nettoyerBords(m[3]) || null;
    // Numéro rejeté en fin de voie (« rue Victor Hugo n°12 »).
    if (nomVoie) {
      const mFin = nomVoie.match(RE_NUMERO_FIN);
      if (mFin) {
        if (!numero) numero = mFin[1].replace(/\s+/g, ' ').trim();
        nomVoie = nettoyerBords(nomVoie.slice(0, mFin.index)) || null;
      }
    }
    return { numero, typeVoie: typeVoieCanonique(m[2]), nomVoie };
  }

  // Découpe un fragment d'adresse en composants. L'ordre des éléments est libre (voir ci-dessus),
  // le numéro peut être absent, et l'adresse d'origine est TOUJOURS conservée telle quelle dans
  // `adresseComplete` — on ne perd jamais ce que dit le document.
  function parserAdresse(brut) {
    const original = String(brut || '').replace(/\s+/g, ' ').trim();
    const vide = {
      adresseComplete: original, numero: null, typeVoie: null, nomVoie: null, lieuDit: null,
      codePostal: null, commune: null, departement: null, statut: 'NOT_FOUND'
    };
    if (!original) return vide;

    // Normalisation : le code postal est ramené hors parenthèses et le nom de département entre
    // parenthèses est retiré. Ni l'un ni l'autre ne change le sens de l'adresse, mais les deux
    // empêchaient le découpage ci-dessous de retrouver la commune.
    const cpEntreParentheses = RE_CP_ENTRE_PARENTHESES.test(original);
    let travail = original.replace(/\(\s*(\d{5})\s*\)/g, '$1');
    const deptEntreParentheses = RE_DEPARTEMENT_ENTRE_PARENTHESES.test(travail);
    travail = travail.replace(new RegExp(RE_DEPARTEMENT_ENTRE_PARENTHESES.source, 'g'), ' ');

    const mCp = travail.match(/\b(\d{5})\b/);
    if (!mCp) return { ...vide, statut: 'NEEDS_REVIEW' };
    const codePostal = mCp[1];
    const avant = travail.slice(0, mCp.index);
    const apresNettoye = nettoyerBords(travail.slice(mCp.index + codePostal.length));

    const debutApres = apresNettoye.slice(0, 40);
    const apresRessembleAVoie = /^\d/.test(debutApres) || RE_TYPE_VOIE.test(debutApres) || RE_LIEU_DIT_PREFIXE.test(debutApres);
    const ordreNotarial = cpEntreParentheses || deptEntreParentheses || apresRessembleAVoie;

    let commune = null;
    let resteAvant = nettoyerBords(avant);
    let resteApres = apresNettoye;

    if (ordreNotarial) {
      commune = communeAvantCodePostal(avant);
      if (commune && resteAvant.endsWith(commune)) {
        resteAvant = nettoyerBords(resteAvant.slice(0, resteAvant.length - commune.length));
      }
    } else {
      const candidat = nettoyerBords(apresNettoye.split(RE_SEPARATEUR_ADRESSE)[0]);
      if (candidat && /[A-Za-zÀ-ÿ]/.test(candidat) && candidat.length <= 60) {
        commune = candidat;
        resteApres = nettoyerBords(apresNettoye.slice(candidat.length));
      } else {
        commune = communeAvantCodePostal(avant);
        if (commune && resteAvant.endsWith(commune)) {
          resteAvant = nettoyerBords(resteAvant.slice(0, resteAvant.length - commune.length));
        }
      }
    }

    let numero = null;
    let typeVoie = null;
    let nomVoie = null;
    let lieuDit = null;

    // La rédaction notariale place la voie APRÈS le code postal, la rédaction postale AVANT : on
    // regarde les deux, en commençant par le côté que l'ordre détecté désigne.
    const zones = ordreNotarial ? [resteApres.slice(0, 90), resteAvant] : [resteAvant, resteApres.slice(0, 90)];
    const mLieuDit = (zones[0] + ' | ' + zones[1]).match(RE_LIEU_DIT_CHERCHE);
    if (mLieuDit) {
      lieuDit = nettoyerBords(mLieuDit[1]) || null;
    } else {
      const voie = chercherVoie(zones[0]) || chercherVoie(zones[1]);
      if (voie) {
        numero = voie.numero;
        typeVoie = voie.typeVoie;
        nomVoie = voie.nomVoie;
      }
    }

    const departement = departementDepuisCodePostal(codePostal);
    // CONFIRMED demande le minimum exploitable : où (commune + code postal) et quoi (une voie ou
    // un lieu-dit). Sans ça, l'adresse est affichée mais signalée à vérifier.
    const complet = !!(codePostal && commune && (nomVoie || lieuDit));
    return {
      adresseComplete: original,
      numero, typeVoie, nomVoie, lieuDit,
      codePostal, commune, departement,
      statut: complet ? 'CONFIRMED' : 'NEEDS_REVIEW'
    };
  }

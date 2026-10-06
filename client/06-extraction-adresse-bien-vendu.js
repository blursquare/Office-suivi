  // ==== EXTRACTION STRUCTURÉE : adresse du bien vendu ====
  //
  // Un compromis contient l'adresse du vendeur, celle de l'acquéreur, celle du notaire, parfois
  // celle d'un bien vendu par ailleurs… La spec est explicite : il ne faut SURTOUT PAS prendre la
  // première adresse trouvée, mais identifier celle qui correspond juridiquement au bien vendu.

  // Section « DÉSIGNATION » : c'est là que le bien est décrit. La chercher d'abord évite par
  // construction de confondre avec l'adresse personnelle d'une partie.
  var RE_SECTION_DESIGNATION = /D[ÉE]SIGNATION|IDENTIFICATION\s+DU\s+BIEN|BIEN\s+VENDU|OBJET\s+DE\s+LA\s+VENTE/i;
  var RE_SECTION_APRES_DESIGNATION = /PRIX|ORIGINE\s+DE\s+PROPRI[ÉE]T[ÉE]|CONDITIONS\s+SUSPENSIVES|PROPRI[ÉE]T[ÉE]\s+JOUISSANCE|CHARGES\s+ET\s+CONDITIONS/i;

  // Une adresse précédée de « demeurant » est celle d'une PARTIE, jamais celle du bien.
  // Un acte est plein d'adresses qui ne sont PAS celle du bien : celle d'une partie (« demeurant
  // à… »), celle d'un notaire, une simple élection de domicile (« … aux fins de recevoir les
  // notifications »), et surtout le SIÈGE SOCIAL des professionnels qui interviennent — l'agence,
  // son assureur, le diagnostiqueur. Sur un compromis d'agence réel, ces trois sièges arrivent
  // avant la désignation du bien, et c'est le premier qui était retenu comme adresse du bien.
  // « siège social » les couvre tous les trois d'une seule règle, plutôt qu'une exclusion par
  // profession. Le disqualifiant peut précéder la capture comme la suivre : c'est « aux fins de
  // recevoir la notification », placé APRÈS, qui faisait passer une élection de domicile pour le
  // bien vendu sur un autre acte du corpus.
  var RE_ADRESSE_HORS_BIEN = /demeurant|domicili[ée]|r[ée]sidant|notaires?\s+[àa]\b|office\s+notarial|\bSCP\b|[ée]lection\s+de\s+domicile|aux\s+fins\s+de\s+recevoir|si[èe]ge\s+(?:social\s+)?(?:est|se\s+trouve|sis)?/i;

  // La PARTIE NORMALISÉE d'un acte authentique présente le cadastre en TABLEAU, que pdf.js rend à
  // plat : « Figurant ainsi au cadastre : Section N° Lieudit BH 81 9 RUE D ESCURES » — l'en-tête
  // de colonnes suivi des valeurs. Le motif ci-dessus, écrit pour la rédaction en toutes lettres
  // d'un avant-contrat, ne peut pas le voir. Motif distinct plutôt qu'alternative ajoutée au
  // premier : il s'ancre sur cet en-tête précis, ce qui le rend sans risque de faux positif.
  // Deux variantes relevées sur l'acte MOKADEM (promesse et vente) : une colonne « Surface » entre
  // l'en-tête et les valeurs, et « c adastre » coupé en deux par pdf.js.
  var RE_CADASTRE_TABLEAU = /c\s?adastre\s*:?\s*Section\s+N[°ºo]?\s+Lieudit\s+(?:Surface\s+)?([A-Z]{1,3})\s+(\d{1,4})\b/i;

  // L'« historique cadastral » d'un acte décrit la parcelle d'AVANT une division (« originairement
  // cadastrée section ER numéro 189 ») : c'était elle qui ressortait, alors que le bien vendu est
  // la parcelle issue de la division. Une mention précédée d'un de ces mots est écartée.
  var RE_CADASTRE_ANCIEN = /(?:originairement|anciennement|pr[ée]c[ée]demment|autrefois|initialement|ci-devant)\s*$/i;

  // ---- Désignation cadastrale complète : toutes les parcelles et leur contenance ----------------
  // Le bien vendu porte souvent sur plusieurs parcelles (terre + jardin, maison + garage…) et la
  // première seule ne suffisait ni à comparer deux actes ni à relire la désignation. Neuf formes
  // relevées sur les actes réels du corpus, toutes reconnues ici :
  //  - tableau à plat, avec ou sans colonnes « Préfixe », « Adresse ou lieudit », « Nature » :
  //    « Section N° Lieudit Surface Nature C 438 Clos des Coudres 00 ha 22 a 00 ca Terre C 439 … » ;
  //  - contenance écrite « 09 a 63 ca », « 99 ca », « 00 ha 02 a 75 ca », ou en trois colonnes
  //    « ha a ca » (« ZY 37 510 rue de Pitouille 0 15 20 ») — alors seulement si l'en-tête le dit ;
  //  - le même tableau passé à l'OCR, colonnes marquées de « [ » et « | » ;
  //  - la forme rédigée « cadastré comme suit : Section HE numéro 95 pour une contenance de 05a 65ca ».
  // Le total annoncé (« Contenance totale », « Total surface ») est gardé À CÔTÉ de la somme des
  // parcelles : les deux doivent concorder, un écart est signalé (voir controlerCoherence).
  var RE_ENTETE_TABLEAU_CADASTRE = /(?:c\s?adastr[ée]e?s?|au\s+c\s?adastre)(?:\s+comme\s+suit)?\s*:?[\s\[|_]*(?:Pr[ée]fixe[\s\[|_]+)?Section[\s\[|_]+(?:N[°ºo]?|Num[ée]ro)[\s\[|_]+(?:Adresse\s+ou\s+)?Lie\s?u\s?dit(?:\s+ou\s+voie)?[\s\[|_]+(?:Contenance|Surface)(?:[\s\[|_]+Nature)?(\s+ha\s+a\s+ca)?/i;
  var CONTENANCE_SOURCE = '(?:\\d{1,3}\\s*ha\\s*)?(?:\\d{1,2}\\s*a\\s*)?\\d{1,2}\\s*ca';
  var RE_TOTAL_CADASTRE = new RegExp('(?:(?:Contenance|Surface)\\s+totale|Total\\s+(?:surface|contenance))\\s*:?\\s*(' + CONTENANCE_SOURCE + ')', 'i');
  // Ce qui clôt le tableau : la phrase qui reprend après lui. Majuscule initiale exigée, pour ne pas
  // couper sur un lieudit écrit en minuscules.
  var RE_FIN_TABLEAU_CADASTRE = /\s(?:Tels?\s+qu|Ainsi\s+que|Un\s+extrait|Le\(s\)\s+lot|Lot\s+num[ée]ro|Pr[ée]cision|Zone\s+d|Ledit|Il\s+est|Observation|L['’]immeuble|Le\s+lot)/;
  var MAX_ZONE_TABLEAU_CADASTRE = 1500;

  // « 01 ha 40 a 64 ca » → 14064 m². Trois colonnes « 0 15 20 » acceptées. Pure.
  function contenanceEnM2(texte) {
    const t = String(texte || '').trim();
    const col = /^(\d{1,3})\s+(\d{1,2})\s+(\d{1,2})$/.exec(t);
    if (col) return Number(col[1]) * 10000 + Number(col[2]) * 100 + Number(col[3]);
    const m = /^(?:(\d{1,3})\s*ha\s*)?(?:(\d{1,2})\s*a\s*)?(\d{1,2})\s*ca$/i.exec(t);
    if (!m) return null;
    return Number(m[1] || 0) * 10000 + Number(m[2] || 0) * 100 + Number(m[3]);
  }

  // 14064 → « 1 ha 40 a 64 ca » ; 2060 → « 20 a 60 ca ». Pure.
  function formaterContenance(m2) {
    if (m2 == null || !Number.isFinite(m2)) return '';
    const ha = Math.floor(m2 / 10000);
    const a = Math.floor((m2 % 10000) / 100);
    const ca = m2 % 100;
    return [ha ? `${ha} ha` : '', (ha || a) ? `${a} a` : '', `${ca} ca`].filter(Boolean).join(' ');
  }

  function detecterTableauCadastral(source) {
    const entete = RE_ENTETE_TABLEAU_CADASTRE.exec(source);
    if (!entete) return null;
    const debut = entete.index + entete[0].length;
    let zone = source.slice(debut, debut + MAX_ZONE_TABLEAU_CADASTRE).replace(/[\[\]|_]/g, ' ');
    const total = RE_TOTAL_CADASTRE.exec(zone);
    let fin = zone.length;
    if (total) fin = total.index;
    const coupe = RE_FIN_TABLEAU_CADASTRE.exec(zone.slice(0, fin));
    if (coupe) fin = coupe.index;
    zone = zone.slice(0, fin);
    const contenance = entete[1] ? `${CONTENANCE_SOURCE}|\\d{1,3}\\s+\\d{1,2}\\s+\\d{1,2}` : CONTENANCE_SOURCE;
    const reLigne = new RegExp(`(?:^|\\s)([A-Z]{1,2})\\s+(\\d{1,5})\\b([\\s\\S]{0,90}?)\\s(${contenance})(?=\\s|$|[.,;])`, 'g');
    const parcelles = [];
    let m;
    while ((m = reLigne.exec(zone)) !== null) {
      parcelles.push({
        section: m[1].toUpperCase(),
        numero: m[2].replace(/^0+(?=\d)/, ''),
        lieudit: m[3].replace(/\s+/g, ' ').trim() || null,
        contenanceM2: contenanceEnM2(m[4])
      });
    }
    if (!parcelles.length) return null;
    return { parcelles, contenanceLueM2: total ? contenanceEnM2(total[1]) : null, index: entete.index };
  }

  var RE_CADASTRE_REDIGE = /cadastr[ée]e?s?(?:\s+comme\s+suit)?\s*:?\s*(?:en\s+)?section\s+([A-Z]{1,3})\s*(?:n(?:um[ée]ro|[°ºo])?\s*)?(\d{1,4})/i;
  var RE_CONTENANCE_REDIGEE = new RegExp('^[^.]{0,60}?contenance\\s+de\\s+(' + CONTENANCE_SOURCE + ')', 'i');

  function detecterCadastre(texte) {
    const source = String(texte || '');
    // Le tableau de la partie normalisée est la désignation actuelle : il passe en premier.
    const tableau = detecterTableauCadastral(source);
    if (tableau) {
      const somme = tableau.parcelles.every(p => p.contenanceM2 != null)
        ? tableau.parcelles.reduce((s, p) => s + p.contenanceM2, 0) : null;
      return { section: tableau.parcelles[0].section, numero: tableau.parcelles[0].numero,
        parcelles: tableau.parcelles, contenanceTotaleM2: somme, contenanceLueM2: tableau.contenanceLueM2 };
    }
    const t = RE_CADASTRE_TABLEAU.exec(source);
    if (t) return { section: t[1].toUpperCase(), numero: t[2] };
    const re = new RegExp(RE_CADASTRE_REDIGE.source, 'gi');
    let m;
    while ((m = re.exec(source)) !== null) {
      if (RE_CADASTRE_ANCIEN.test(source.slice(Math.max(0, m.index - 30), m.index))) continue;
      const section = m[1].toUpperCase();
      const numero = m[2];
      const cont = RE_CONTENANCE_REDIGEE.exec(source.slice(m.index + m[0].length, m.index + m[0].length + 90));
      const contenanceM2 = cont ? contenanceEnM2(cont[1]) : null;
      return contenanceM2 != null
        ? { section, numero, parcelles: [{ section, numero, lieudit: null, contenanceM2 }], contenanceTotaleM2: contenanceM2, contenanceLueM2: null }
        : { section, numero };
    }
    return null;
  }

  // Ce qu'on lit d'un coup d'œil : « section C n° 438, 439, 440, 441, 1339 — 1 ha 40 a 64 ca ». Pure.
  function libelleCadastre(cad) {
    if (!cad || !cad.section) return '';
    const parcelles = Array.isArray(cad.parcelles) && cad.parcelles.length ? cad.parcelles : [cad];
    const parSection = new Map();
    for (const p of parcelles) {
      if (!parSection.has(p.section)) parSection.set(p.section, []);
      parSection.get(p.section).push(p.numero);
    }
    const refs = [...parSection.entries()].map(([s, nums]) => `section ${s} n° ${nums.filter(Boolean).join(', ')}`).join(' ; ');
    const surface = cad.contenanceLueM2 != null ? cad.contenanceLueM2 : cad.contenanceTotaleM2;
    return refs + (surface != null ? ` — ${formaterContenance(surface)}` : '');
  }

  // Ensemble des parcelles d'une désignation, pour comparer deux actes sans dépendre de l'ordre.
  function clesParcelles(cad) {
    if (!cad || !cad.section) return [];
    const parcelles = Array.isArray(cad.parcelles) && cad.parcelles.length ? cad.parcelles : [cad];
    return parcelles.map(p => `${p.section} ${String(p.numero || '').replace(/^0+(?=\d)/, '')}`).sort();
  }

  // Adresse du bien, découpée en composants. Cherche d'abord dans la section désignation, puis dans
  // tout le texte ; écarte toute capture introduite par « demeurant » (adresse d'une partie).
  // Ce que l'étude lit dans le champ « Adresse » : une fois l'adresse correctement découpée, la
  // recomposer vaut mieux que recopier le fragment brut du PDF, qui traîne l'amorce de la phrase
  // (« Dans un ensemble immobilier situé à… ») et la description qui suit. Le texte d'origine
  // reste consultable : c'est l'extrait, affiché avec sa page, dans le panneau de révision.
  function adresseLisible(adresse) {
    if (!adresse || adresse.statut !== 'CONFIRMED') return adresse ? adresse.adresseComplete : '';
    const voie = adresse.lieuDit
      ? 'lieu-dit ' + adresse.lieuDit
      : [adresse.numero, adresse.typeVoie, adresse.nomVoie].filter(Boolean).join(' ');
    return [voie, [adresse.codePostal, adresse.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }

  // Deux rédactions de la désignation SANS la tournure « sis à » que ADRESSE_BIEN_RE attend, toutes
  // deux relevées sur de vraies promesses — et qui laissaient l'adresse du bien vide :
  //  - trame d'office (LD Notaires, GOSSART) : « IDENTIFICATION DU BIEN — DÉSIGNATION — A BLOIS
  //    (LOIR-ET-CHER) 41000 1 Rue Hannah Arendt, Une maison… ». pdf.js coupe parfois le titre en
  //    « D ÉSIGNATION », voire « D   ESIGNATION » (plusieurs espaces sur l'acte de vente MOKADEM),
  //    d'où les espaces tolérés ;
  //  - « Commune de LANDES LE GAULOIS (41190) Une maison d'habitation situé(e) 510 rue Pitouille. »
  // L'adresse reconstruite reprend l'ordre usuel (voie, code postal, commune).
  var RE_DESIGNATION_TRAME_OFFICE = /D\s*[ÉE]\s*SIGNATION\s+(?:A|À)\s+([A-ZÀ-Ü][A-ZÀ-Ü'’\s-]{1,40}?)\s*\([^)]{2,40}\)\s*(\d{5})\s+([^,.\n]{2,80}?)\s*[,.]/;
  var RE_DESIGNATION_COMMUNE_DE = /Commune\s+de\s+([A-ZÀ-Ü][A-ZÀ-Ü'’\s-]{1,40}?)\s*\(\s*(\d{5})\s*\)[^.]{0,120}?situ[ée]e?(?:\s*\(e\))?\s+(?:au\s+|[àa]\s+)?(\d+[^.,\n]{2,60}?)\s*[,.]/;

  function adresseDesignationTrame(source) {
    for (const re of [RE_DESIGNATION_TRAME_OFFICE, RE_DESIGNATION_COMMUNE_DE]) {
      const m = re.exec(source);
      if (!m) continue;
      const commune = m[1].replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
      const voie = m[3].replace(/\s+/g, ' ').trim();
      const adresse = parserAdresse(`${voie}, ${m[2]} ${commune}`);
      if (!adresse.codePostal) continue;
      adresse.adresseComplete = adresseLisible(adresse);
      return {
        adresse,
        source: { extrait: extraireContexte(source, m.index, m[0].length), trouve: m[3].replace(/\s+/g, ' ').trim(), index: m.index, page: pageDepuisIndex(m.index) }
      };
    }
    return null;
  }

  // Trame d'agence (05/10, deux compromis réels) : « Biens objet de la vente  Adresse des biens : 8 B Rue X - 41000 BLOIS . »
  // Étiquette sans ambiguïté : passe avant tout, car l'en-tête de ces compromis porte l'adresse de L'AGENCE, qui était prise
  // pour celle du bien.
  var RE_ADRESSE_DES_BIENS = /Adresse\s+des?\s+biens?\s*:\s*([^:]{5,160}?)\s*\.(?=\s|$)/i;
  function adresseDesBiensEtiquetee(source) {
    const m = RE_ADRESSE_DES_BIENS.exec(source);
    if (!m) return null;
    const adresse = parserAdresse(m[1].replace(/\s+/g, ' ').trim());
    if (!adresse.codePostal) return null;
    adresse.adresseComplete = adresseLisible(adresse);
    return { adresse, source: { extrait: extraireContexte(source, m.index, m[0].length), trouve: m[1].replace(/\s+/g, ' ').trim(), index: m.index, page: pageDepuisIndex(m.index) } };
  }

  function detecterAdresseBienStructuree(texte) {
    const source = String(texte || '');
    const etiquetee = adresseDesBiensEtiquetee(source);
    if (etiquetee) return etiquetee;
    const parTrame = adresseDesignationTrame(source);
    if (parTrame) return parTrame;
    const section = extraireSection(source, RE_SECTION_DESIGNATION, RE_SECTION_APRES_DESIGNATION);
    const zones = section ? [section, source] : [source];

    for (const zone of zones) {
      const re = new RegExp(ADRESSE_BIEN_RE.source, 'gi');
      let m;
      while ((m = re.exec(zone)) !== null) {
        const avant = zone.slice(Math.max(0, m.index - 80), m.index);
        const apres = zone.slice(m.index + m[0].length, m.index + m[0].length + 60);
        if (RE_ADRESSE_HORS_BIEN.test(avant) || RE_ADRESSE_HORS_BIEN.test(apres)) continue;
        const fragment = extraireFragmentAdresse(m[1]) || m[1];
        const adresse = parserAdresse(fragment);
        if (adresse.codePostal) {
          const index = source.indexOf(m[0]);
          adresse.adresseComplete = adresseLisible(adresse);
          return {
            adresse,
            source: {
              extrait: extraireContexte(zone, m.index, m[0].length),
              trouve: fragment,
              index: index === -1 ? null : index,
              page: index === -1 ? null : pageDepuisIndex(index)
            }
          };
        }
      }
    }
    // Repli : la section désignation contient bien une adresse, mais sans la tournure « sis à ».
    if (section) {
      const fragment = extraireFragmentAdresse(section);
      if (fragment) {
        const adresse = parserAdresse(fragment);
        if (adresse.codePostal) {
          const index = source.indexOf(fragment.split(',')[0].trim());
          adresse.adresseComplete = adresseLisible(adresse);
          return {
            adresse,
            source: { extrait: fragment, trouve: fragment, index: index === -1 ? null : index, page: index === -1 ? null : pageDepuisIndex(index) }
          };
        }
      }
    }
    return { adresse: parserAdresse(''), source: null };
  }

  // ==== EXTRACTION STRUCTURÉE : objet unifié et contrôle de cohérence ====

  function champExtraction(valeur, options) {
    const o = options || {};
    return {
      valeur: valeur === undefined ? null : valeur,
      statut: o.statut || (valeur ? 'CONFIRMED' : 'NOT_FOUND'),
      methode: o.methode || null,
      origine: o.origine || 'regex',
      source: o.source || null,
      candidats: o.candidats || [],
      raison: o.raison || ''
    };
  }

  // Comme champExtraction(), mais en situant au passage la valeur dans le document : sans ça
  // aucune de ces données n'avait de page, et le panneau de révision n'offrait aucun moyen d'aller
  // voir la phrase d'où elle sort — défaut signalé par l'étude.
  function champAvecSource(texte, cle, valeur) {
    return champExtraction(valeur, { source: sourcePourValeur(texte, cle, valeur) });
  }
  // Honoraires d'agence TTC : lus dans la clause (detecterHonorairesAgenceTTC), source retrouvée comme les autres montants.
  function honorairesAgenceChamp(texte) {
    const h = detecterHonorairesAgenceTTC(texte);
    return h ? champAvecSource(texte, 'honorairesAgence', h.valeur) : champExtraction(null);
  }

  // Rassemble tout ce que les regex savent extraire en UN objet, avec pour chaque donnée son
  // statut, sa provenance et sa source dans le PDF. C'est ce même objet que la passe IA viendra
  // ensuite compléter (voir fusionnerExtractionIa) : les deux passes ne parlent qu'une langue.
  // `nomFichier` (facultatif) : le nom du PDF d'origine, un indice de forme quand l'en-tête du
  // texte n'en déclare aucune (voir detecterFormeActe — « AAE » dans le nom = acte authentique).
  // Email d'une partie : celui lu près de sa qualité, sauf si les noms le donnent à l'autre côté ; à défaut, ceux que les noms
  // lui attribuent (05/10, trames d'agence et promesses réelles).
  // Plusieurs personnes d'un même côté : toutes leurs adresses (« a@x.fr; b@y.fr »), celle lue près de la qualité en tête.
  function emailPartieExtraction(source, parties, role, parQualite) {
    const adresses = [];
    if (parQualite && !emailContreditParNom(parQualite, source, parties, role)) adresses.push(String(parQualite).toLowerCase());
    for (const e of String(emailsPartieParNom(source, parties, role) || '').split('; ')) if (e && adresses.indexOf(e) === -1) adresses.push(e);
    return adresses.length ? adresses.join('; ') : null;
  }

  function construireExtractionRegex(texte, dateCompromis, detectedDatesFournies, nomFichier) {
    const source = String(texte || '');
    const typeActe = detecterTypeActe(source);
    const detectedDates = Array.isArray(detectedDatesFournies)
      ? detectedDatesFournies
      : detecterDatesDepuisTexte(source, dateCompromis);
    const bien = detecterAdresseBienStructuree(source);
    const parties = detecterParties(source, typeActe.valeur);
    const notaires = determinerNotaires(detecterNotaires(source, typeActe.valeur), bien.adresse.departement, typeActe.valeur, zoneNotairesPourActe(source, typeActe.valeur, nomFichier));

    const extraction = {
      version: 1,
      typeActe,
      parties,
      honoraires: detecterHonorairesNegociation(source, typeActe.valeur),
      fondsTravaux: detecterFondsTravaux(source),
      notaires,
      bien: {
        adresse: bien.adresse,
        source: bien.source || sourcePourValeur(source, 'adresseBien', bien.adresse && bien.adresse.adresseComplete),
        cadastre: detecterCadastre(source)
      },
      dates: construireDatesMetier(detectedDates, detecterDelais(source), dateCompromis),
      champs: {
        nom: champAvecSource(source, 'nom', detecterNomDossier(source)),
        prixVente: champPrixVente(source),
        prixMobilier: champAvecSource(source, 'prixMobilier', detecterPrixMobilier(source)),
        emailAcquereur: champAvecSource(source, 'emailAcquereur', emailPartieExtraction(source, parties, 'ACQUEREUR', detecterEmailAcquereur(source, typeActe.valeur))),
        emailVendeur: champAvecSource(source, 'emailVendeur', emailPartieExtraction(source, parties, 'VENDEUR', detecterEmailVendeur(source, typeActe.valeur))),
        nomAgence: champAvecSource(source, 'nomAgence', detecterNomAgence(source)),
        honorairesAgence: honorairesAgenceChamp(source),
        depotGarantie: champAvecSource(source, 'depotGarantie', detecterDepotGarantie(source)),
        sequestreDepot: champAvecSource(source, 'sequestreDepot', detecterSequestreDepot(source)),
        typeVente: champExtraction(detecterTypeVenteCopropriete(source) ? 'copropriete' : null)
      },
      alertes: [],
      iaLots: { parties: 'attente', bien: 'attente', dates: 'attente' }
    };
    extraction.alertes = controlerCoherence(extraction);
    return extraction;
  }

  // Contrôle de cohérence : la spec demande de vérifier l'ensemble AVANT de créer le dossier, et de
  // signaler les contradictions plutôt que de les absorber en silence. Chaque alerte nomme les
  // champs concernés pour pouvoir être affichée en face d'eux.
  function controlerCoherence(extraction) {
    const alertes = [];
    if (!extraction) return alertes;
    const dates = extraction.dates || {};
    const valeur = (cle) => (dates[cle] && dates[cle].valeur) || null;
    const signature = valeur('SIGNATURE_AVANT_CONTRAT');
    const pret = valeur('BUTOIR_PRET');
    const acte = valeur('REITERATION_ACTE');
    const vente = valeur('BUTOIR_VENTE_PREALABLE');

    if (signature && acte && signature === acte) {
      alertes.push({
        code: 'SIGNATURE_EGALE_REITERATION', gravite: 'critique', champs: ['acte'],
        message: 'La date de réitération est identique à celle de la signature de l’avant-contrat : l’une des deux est probablement mal identifiée.'
      });
    }
    if (pret && acte && pret > acte) {
      alertes.push({
        code: 'PRET_APRES_ACTE', gravite: 'critique', champs: ['pret', 'acte'],
        message: 'L’échéance d’obtention du prêt tombe après la signature de l’acte : la condition suspensive ne pourrait pas jouer.'
      });
    }
    if (pret && vente && pret === vente) {
      alertes.push({
        code: 'PRET_EGALE_VENTE_PREALABLE', gravite: 'attention', champs: ['pret', 'ventebien'],
        message: 'La même date est retenue pour l’obtention du prêt et pour la vente préalable : à vérifier, les deux clauses sont distinctes.'
      });
    }

    // Date écrite ET délai dans l'acte, qui ne tombent pas au même endroit : l'écart d'un jour ou
    // deux vient de la convention de computation et n'a rien d'anormal ; au-delà, c'est une vraie
    // contradiction entre deux clauses du même acte.
    for (const [typeDate, champ] of Object.entries(CHAMP_PAR_TYPE_DATE)) {
      const objet = dates[typeDate];
      if (!objet || !objet.valeur || objet.methode !== 'EXPLICIT' || !objet.calculAlternatif) continue;
      const ecart = Math.abs((new Date(objet.valeur) - new Date(objet.calculAlternatif)) / 86400000);
      if (ecart > 5) {
        alertes.push({
          code: 'DATE_EXPLICITE_VS_DELAI', gravite: 'attention', champs: [champ],
          message: `La date écrite dans l’acte et le délai qu’il énonce ne concordent pas (${Math.round(ecart)} jours d’écart) : c’est la date écrite qui a été retenue.`
        });
      }
    }

    for (const partie of (extraction.parties || [])) {
      if (partie.societe && partie.societe.siren && partie.societe.sirenValide === false) {
        alertes.push({
          code: 'SIREN_INVALIDE', gravite: 'attention', champs: ['nom'],
          message: `Le numéro SIREN lu pour ${partie.nom} (${partie.societe.siren}) ne vérifie pas sa clé de contrôle : coquille de l’acte ou lecture fautive, à vérifier sur l’extrait Kbis.`
        });
      }
    }

    const prix = extraction.champs && extraction.champs.prixVente;
    if (prix && (prix.candidats || []).filter(c => c.origine === 'regex').length > 1) {
      alertes.push({
        code: 'PRIX_CONTRADICTOIRE', gravite: 'critique', champs: ['prixVente'],
        message: prix.raison || 'L’acte cite plusieurs prix différents pour cette vente.'
      });
    }

    const mobilier = extraction.champs && extraction.champs.prixMobilier;
    const prixVal = prix && prix.valeur;
    if (mobilier && mobilier.valeur && prixVal && mobilier.valeur >= prixVal) {
      alertes.push({
        code: 'MOBILIER_SUPERIEUR_PRIX', gravite: 'attention', champs: ['prixMobilier', 'prixVente'],
        message: `Le mobilier lu (${formaterPrix(mobilier.valeur)}) n’est pas inférieur au prix de vente (${formaterPrix(prixVal)}) : l’un des deux montants est mal lu.`
      });
    }

    const cadastre = extraction.bien && extraction.bien.cadastre;
    if (cadastre && cadastre.contenanceLueM2 != null && cadastre.contenanceTotaleM2 != null
        && cadastre.contenanceLueM2 !== cadastre.contenanceTotaleM2) {
      alertes.push({
        code: 'CONTENANCE_TOTALE_INCOHERENTE', gravite: 'attention', champs: ['adresseBien'],
        message: `La contenance totale annoncée (${formaterContenance(cadastre.contenanceLueM2)}) ne correspond pas à la somme des parcelles (${formaterContenance(cadastre.contenanceTotaleM2)}) : une parcelle a pu être mal lue, ou le tableau de l’acte comporte une erreur.`
      });
    }

    const adresse = extraction.bien && extraction.bien.adresse;
    if (!adresse || adresse.statut !== 'CONFIRMED') {
      alertes.push({
        code: 'ADRESSE_INCOMPLETE', gravite: 'attention', champs: ['adresseBien'],
        message: 'L’adresse du bien n’a pas pu être reconstituée complètement : à compléter à la main.'
      });
    }

    const notaires = extraction.notaires || {};
    if (notaires.instrumentaire && notaires.participant &&
        notaires.instrumentaire.nom === notaires.participant.nom) {
      alertes.push({
        code: 'NOTAIRES_IDENTIQUES', gravite: 'attention', champs: ['roleNotaire'],
        message: 'Le même notaire est identifié comme instrumentaire et comme participant : à vérifier.'
      });
    }
    if (notaires.statut === 'NEEDS_REVIEW') {
      alertes.push({
        code: 'NOTAIRE_INSTRUMENTAIRE_INCERTAIN', gravite: 'attention', champs: ['roleNotaire'],
        message: notaires.raison || 'Le notaire instrumentaire n’a pas pu être déterminé.'
      });
    }

    // Le vocabulaire des parties doit correspondre au type d'acte : un compromis qui nomme ses
    // parties « promettant »/« bénéficiaire » n'est pas anormal (promesse synallagmatique), mais un
    // type d'acte non tranché combiné à ce vocabulaire mérite un regard — c'est exactement la
    // situation où l'inversion vendeur/acquéreur passerait inaperçue.
    const parties = extraction.parties || [];
    const vocabulairePromesse = parties.some(p => p.qualiteActe === 'promettant' || p.qualiteActe === 'beneficiaire');
    if (vocabulairePromesse && extraction.typeActe && extraction.typeActe.valeur === 'INCONNU') {
      alertes.push({
        code: 'TYPE_ACTE_VS_QUALITES', gravite: 'critique', champs: ['nom'],
        message: 'L’acte nomme ses parties « promettant » et « bénéficiaire » sans que son type ait pu être établi : vérifiez que vendeur et acquéreur ne sont pas intervertis.'
      });
    }

    return alertes;
  }

  // ==== EXTRACTION STRUCTURÉE : enregistrement sur le dossier ====
  //
  // Ce qui est conservé SUR LE DOSSIER une fois celui-ci créé. Volontairement plus maigre que
  // `extractionActuelle` : les extraits cités et les candidats concurrents n'ont d'intérêt que
  // pendant l'import (pour vérifier une valeur PDF en main) — après coup, ce qui compte est
  // « d'où vient cette donnée, et était-elle sûre ? ». Les champs plats du dossier
  // (pret/acte/ventebien/adresseBien/prixVente/roleNotaire/confiance) continuent d'être alimentés
  // exactement comme avant : tout ce qui suit est ADDITIF, aucun affichage existant n'en dépend.
  function notairePersistable(n) {
    if (!n || !n.nom) return null;
    return {
      nom: n.nom,
      office: n.office || null,
      codePostal: n.codePostal || null,
      departement: n.departement || null,
      cote: n.cote || 'inconnu'
    };
  }

  function instantaneExtraction(extraction) {
    if (!extraction) return null;
    const notaires = extraction.notaires || {};
    const adresse = (extraction.bien && extraction.bien.adresse) || null;
    const etatChamp = (champ) => champ
      ? {
        statut: champ.statut || 'NOT_FOUND',
        methode: champ.methode || null,
        origine: champ.origine || 'regex',
        page: (champ.source && champ.source.page) || null,
        // La valeur elle-même n'est pas recopiée (elle vit déjà dans le champ plat du dossier),
        // mais ces trois drapeaux permettent à la fiche enregistrée de parler exactement la même
        // langue que le panneau d'import (voir origineRevision) — un seul vocabulaire pour la
        // même réalité, au lieu de « Confirmé » d'un côté et « Lue dans l'acte » de l'autre.
        renseigne: champ.valeur !== null && champ.valeur !== undefined && champ.valeur !== '',
        verifie: !!champ.verifie,
        apprise: !!champ.apprise
      }
      : null;

    const champs = {};
    for (const cle of Object.keys(extraction.champs || {})) {
      const etat = etatChamp(extraction.champs[cle]);
      if (etat) champs[cle] = etat;
    }
    // Les dates sont indexées sur le NOM DU CHAMP du dossier (pret/acte/ventebien) et non sur leur
    // type métier : c'est sous ce nom-là qu'on les retrouvera pour les afficher en face de la date
    // effectivement enregistrée.
    for (const typeDate of Object.keys(CHAMP_PAR_TYPE_DATE)) {
      const etat = etatChamp((extraction.dates || {})[typeDate]);
      if (etat) champs[CHAMP_PAR_TYPE_DATE[typeDate]] = etat;
    }
    if (adresse) {
      champs.adresseBien = {
        statut: adresse.statut || 'NOT_FOUND', methode: null, origine: adresse.origine || 'regex',
        page: (extraction.bien.source && extraction.bien.source.page) || null,
        renseigne: !!adresse.adresseComplete, verifie: !!adresse.verifie, apprise: false
      };
    }

    return {
      typeActe: { valeur: extraction.typeActe ? extraction.typeActe.valeur : 'INCONNU', statut: extraction.typeActe ? extraction.typeActe.statut : 'NOT_FOUND' },
      parties: (extraction.parties || []).map(p => ({
        nom: p.nom, qualiteActe: p.qualiteActe, role: p.role,
        qualitePersonne: p.qualitePersonne || 'physique',
        representant: p.representant || null,
        societe: p.societe || null,
        ...(p.nomUsage ? { nomUsage: p.nomUsage } : {}),
        ...(p.situationMatrimoniale ? { situationMatrimoniale: p.situationMatrimoniale } : {})
      })),
      honoraires: honorairesPersistables(extraction.honoraires),
      fondsTravaux: fondsTravauxPersistable(extraction.fondsTravaux),
      notaires: {
        vendeur: notairePersistable(notaires.vendeur),
        acquereur: notairePersistable(notaires.acquereur),
        instrumentaire: notairePersistable(notaires.instrumentaire),
        participant: notairePersistable(notaires.participant),
        statut: notaires.statut || 'NOT_FOUND',
        raison: notaires.raison || '',
        roleEtude: notaires.roleEtude || null
      },
      bien: {
        adresse: adresse ? {
          adresseComplete: adresse.adresseComplete || '', numero: adresse.numero || null,
          typeVoie: adresse.typeVoie || null, nomVoie: adresse.nomVoie || null,
          lieuDit: adresse.lieuDit || null, codePostal: adresse.codePostal || null,
          commune: adresse.commune || null, departement: adresse.departement || null,
          statut: adresse.statut || 'NOT_FOUND'
        } : null,
        cadastre: (extraction.bien && extraction.bien.cadastre) || null
      },
      extraction: {
        version: extraction.version || 1,
        dateImport: new Date().toISOString(),
        champs,
        alertes: (extraction.alertes || []).map(a => ({ code: a.code, gravite: a.gravite, message: a.message }))
      }
    };
  }

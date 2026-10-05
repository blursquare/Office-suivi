  // ==== Fonds reçus : reçus comptables du jour rapprochés du dossier (demandé par l'étude, 28/09) ====
  //
  // Le logiciel comptable de l'office dépose chaque jour un PDF « Reçus » daté à la RACINE du dossier
  // commun du NAS (voir listerRecusRacine côté serveur). On y cherche les versements de l'ACQUÉREUR
  // (c'est lui qui vire les fonds) en reconnaissant son patronyme, on additionne, et on compare au
  // montant attendu : le solde du décompte / de l'appel de fonds rangé dans le dossier NAS du
  // dossier, ou un montant saisi à la main. Premier jet écrit SANS exemple de reçu réel : chaque reçu
  // retenu est listé avec son fichier et la ligne lue, pour qu'une erreur de rapprochement se voie
  // d'un coup d'œil — l'indicateur ne dit jamais « complet » sans montrer sur quoi il se fonde.
  var MOTS_IGNORES_PAYEUR = ['monsieur', 'madame', 'mme', 'mlle', 'mr', 'epoux', 'epouse', 'les', 'des', 'et',
    'sci', 'sarl', 'sas', 'societe', 'consorts', 'indivision', 'acquereur', 'acquereurs'];

  // Pure : les patronymes de l'acquéreur, normalisés (sans accent, minuscules), 3 lettres au moins.
  // Pure : les noms du client dans le nom du courrier d'appel de fonds produit par CLAIRE
  // (« Convocation au rendez-vous contenant l'appel de fonds - CRIL.pdf », voir afNomFichierDocx) :
  // l'étude y écrit le nom sous lequel elle connaît le client, souvent son nom d'usage.
  function nomsCourrierAppelFonds(d) {
    const chemins = [courrierAppelFondsDossier(d), d && d.fondsRecus && d.fondsRecus.attenduChemin];
    for (const c of chemins) {
      const m = /appel\s+de\s+fonds\s+-\s+(.+?)\.(?:pdf|docx?)$/i.exec(String(c || '').split(/[\\/]/).pop());
      if (m) return m[1];
    }
    return '';
  }

  // S'y ajoutent le côté acquéreur du nom du dossier (« VENDEUR / ACQUÉREUR », que l'étude peut
  // avoir écrit sous le nom d'usage) et les noms saisis à la main pour les reçus (`d.nomsRecus`) :
  // une acquéreuse désignée dans l'acte sous son nom de naissance (« Yvette MARTIN, épouse … »)
  // verse sous son nom d'épouse, que l'acte lu ne donnait pas (29/09).
  function motsPayeurDossier(d) {
    const parties = Array.isArray(d && d.parties) ? d.parties : [];
    const acquereurs = parties.filter(p => p && String(p.role || '').toUpperCase() === 'ACQUEREUR').map(p => [p.nom, p.nomUsage].filter(Boolean).join(' '));
    const nom = String(d && d.nom || '');
    const source = [
      acquereurs.length ? acquereurs.join(' ') : extraireNomAcquereur(nom),
      acquereurs.length && nom.includes(' / ') ? extraireNomAcquereur(nom) : '',
      nomsCourrierAppelFonds(d),
      String(d && d.nomsRecus || '')
    ].join(' ');
    const mots = normaliserPourRecherche(source).split(/[^a-z]+/).filter(m => m.length >= 3 && !MOTS_IGNORES_PAYEUR.includes(m));
    return [...new Set(mots)];
  }

  var RE_MONTANT_RECU = /(?<![\d,])(\d{1,3}(?:[ .  ]\d{3})+|\d+),(\d{2})(?!\d)/g;
  var RE_LIGNE_MONTANT_RECU = /\b(somme|montant|total|net|re[cç]u\s+de|versement)\b/i;

  // Pure : les montants (à deux décimales) d'une ligne, dans leur ordre d'apparition.
  function montantsDansLigne(ligne) {
    const out = [];
    const re = new RegExp(RE_MONTANT_RECU.source, 'g');
    let m;
    while ((m = re.exec(String(ligne || ''))) !== null) {
      out.push(Number(m[1].replace(/[ .  ]/g, '') + '.' + m[2]));
    }
    return out;
  }

  function ligneNommeLePayeur(ligne, mots) {
    const n = ' ' + normaliserPourRecherche(ligne).replace(/[^a-z0-9]+/g, ' ') + ' ';
    return mots.some(m => n.includes(' ' + m + ' '));
  }

  // ---- Mise en page RÉELLE des reçus de l'étude (JasperReports, un reçu par page, vue sur les
  // PDF « RECUS_14-08 » et « recus_14-09 » envoyés le 28/09) :
  //   <émetteur : confrère, DRFIP, assureur… et son adresse, sur plusieurs lignes>
  //   14/09/2026 SGOSSART/BDERO 127 988,65 € Euros        ← date du reçu et total
  //   <montant en lettres>
  //   compte : 3104                                      ← compte client de l'étude
  //   SARADIN Pauline VIR RECU DE ... SOLDE PRIX DE 116 100,00 €   ← une ligne par écriture :
  //   VENTE CHRETIEN/SARADIN                                          titulaire du compte, libellé
  //   SARADIN Pauline VIR RECU DE ... SOLDE 11 550,00 €               (suite à la ligne), montant
  //   PROVISION SUR FRAIS VTE CHRETIEN/SARADIN
  //   127 988,65 €                                       ← total, puis la banque ou « VIREMENT »
  // Le TITULAIRE du compte est ce qui désigne le client : c'est sur lui seul qu'on reconnaît
  // l'acquéreur. Le libellé porte souvent la référence de la vente (« VTE CHRETIEN/SARADIN ») où le
  // nom de l'acquéreur figure aussi — le lire ferait compter les fonds reçus sur le compte du
  // VENDEUR du même dossier. La référence sert seulement à confirmer le rapprochement.
  var RE_DATE_RECU = /^(\d{2})\/(\d{2})\/(\d{4})\b.*€\s*Euros?\s*$/i;
  var RE_COMPTE_RECU = /^compte\s*:\s*([\d ]+)$/i;
  // « RECU » seul ouvre aussi un libellé (« BARON Philippe RECU DE MME BARON MARIE… », reçu du
  // 28/09) : sans lui, le titulaire n'était pas isolé et toute la ligne était lue.
  var RE_DEBUT_LIBELLE_RECU = /\s(VIR|VIRT|VIREMENT|CHEQUE|CHQ|ESPECES|ESP|PRLV|PRELEVEMENT|REMISE|VERSEMENT|DEPOT|CB|RE[CÇ]U)(?![A-Za-zÀ-ɏ])/i;
  var RE_MONTANT_SEUL_RECU = /^[\d  .]+,\d{2}\s*€?$/;
  // Écritures qui ne sont pas des fonds versés par le client : un remboursement ou une restitution
  // de trop-perçu (DDFIP, assureur) arrive sur le même compte après coup.
  var RE_ECRITURE_NON_FONDS = /\b(trop\s+per[cç]u|restitution|remboursement)\b/i;

  // Pure : lit une page au format ci-dessus. Rend null si la page n'a pas ce format (le lecteur
  // générique prend alors le relais).
  function lireRecuComptable(lignes) {
    const iCompte = (lignes || []).findIndex(l => RE_COMPTE_RECU.test(String(l).trim()));
    if (iCompte < 0) return null;
    let date = null;
    for (const l of lignes.slice(0, iCompte)) {
      const m = RE_DATE_RECU.exec(String(l).trim());
      if (m) { date = `${m[3]}-${m[2]}-${m[1]}`; break; }
    }
    const compte = RE_COMPTE_RECU.exec(String(lignes[iCompte]).trim())[1].trim().split(/\s+/)[0];
    const ecritures = [];
    for (const brute of lignes.slice(iCompte + 1)) {
      const l = String(brute).trim();
      if (!l) continue;
      if (RE_MONTANT_SEUL_RECU.test(l)) break;
      const ms = montantsDansLigne(l);
      if (ms.length) {
        const sansMontant = l.replace(/[\d  .]+,\d{2}\s*€?\s*$/, '').trim();
        const m = RE_DEBUT_LIBELLE_RECU.exec(' ' + sansMontant);
        // Sans mot d'opération reconnu : le titulaire est pris sur les deux premiers mots (NOM
        // Prénom), jamais sur la ligne entière — le libellé peut citer un autre client.
        const mots = sansMontant.split(/\s+/);
        ecritures.push({
          titulaire: m ? sansMontant.slice(0, m.index).replace(/[\s-]+$/, '').trim() : mots.slice(0, 2).join(' '),
          libelle: m ? sansMontant.slice(m.index).trim() : mots.slice(2).join(' '),
          montant: ms[ms.length - 1]
        });
      } else if (ecritures.length) {
        ecritures[ecritures.length - 1].libelle += ' ' + l;
      }
    }
    return { date, compte, ecritures };
  }

  // Pure : les écritures d'un reçu comptable versées au nom de l'acquéreur (`mots`). `motsVente` =
  // les autres patronymes du dossier (vendeur) : quand le libellé les cite aussi, le rapprochement
  // est confirmé par la référence de la vente.
  function ecrituresDuPayeur(recu, mots, motsVente) {
    const out = [];
    for (const e of (recu && recu.ecritures) || []) {
      // Le client est le TITULAIRE, en début de ligne (règle rappelée par l'étude le 29/09) : le
      // libellé du virement peut nommer un autre client (« … VTE PRIEUR-YAICH/MANDELBLI » sur le
      // compte de MANDELBLI ne concerne pas un autre dossier des PRIEUR). Jamais lu pour rapprocher.
      if (!e.titulaire || !ligneNommeLePayeur(e.titulaire, mots)) continue;
      if (RE_ECRITURE_NON_FONDS.test(e.libelle)) continue;
      const confirme = (motsVente || []).length > 0 && ligneNommeLePayeur(e.libelle, motsVente);
      // Compte à deux noms (« DUPONT Jean et MARTIN ») : le client est le premier nommé. Un nom
      // qui n'apparaît qu'après « et » (conjoint, co-titulaire) ne suffit pas sans la référence de
      // la vente — faute de quoi le versement d'un DUPONT comptait pour un dossier MARTIN (29/09).
      const principal = ligneNommeLePayeur(e.titulaire.split(/\s+(?:et|&)\s+/i)[0], mots);
      if (!principal && !confirme) continue;
      // Le libellé cite une vente (« VTE VENDEUR/ACQUÉREUR ») qui ne nomme personne du dossier :
      // c'est le versement d'une autre vente.
      const ref = referenceVenteLibelle(e.libelle);
      if (ref && !ligneNommeLePayeur(ref, mots) && !confirme) continue;
      out.push({ montant: e.montant, date: recu.date, compte: recu.compte, confirme,
        extrait: ((e.titulaire ? e.titulaire + ' — ' : '') + e.libelle).replace(/\s+/g, ' ').slice(0, 180) });
    }
    return out;
  }

  // Pure : la référence de la vente citée dans un libellé de reçu (« … VTE FAURE-LEGRAND/VASSEUR »,
  // « … PRIX DE VENTE FAURE-LEGRAND/VASSEUR ») — les deux côtés de la barre, ou '' si aucune.
  function referenceVenteLibelle(libelle) {
    const m = /(?:^|[^A-Za-z])(?:VTE|VENTE)\s+([^/]{2,60}?)\s*\/\s*([^\s/]{2,40})/i.exec(String(libelle || ''));
    return m ? m[1] + ' / ' + m[2] : '';
  }

  // Pure : les patronymes du vendeur (pour confirmer par la référence de la vente).
  function motsVendeurDossier(d) {
    const parties = Array.isArray(d && d.parties) ? d.parties : [];
    const vendeurs = parties.filter(p => p && String(p.role || '').toUpperCase() === 'VENDEUR').map(p => [p.nom, p.nomUsage].filter(Boolean).join(' '));
    const source = vendeurs.length ? vendeurs.join(' ') : String(d && d.nom || '').split('/')[0];
    const acquereur = motsPayeurDossier(d);
    return [...new Set(normaliserPourRecherche(source).split(/[^a-z]+/)
      .filter(m => m.length >= 3 && !MOTS_IGNORES_PAYEUR.includes(m) && !acquereur.includes(m)))];
  }

  // Pure : les reçus d'un PDF qui concernent ce payeur. `pages` = tableau de pages, chacune un
  // tableau de lignes. Deux mises en page couvertes : un tableau (une ligne par reçu, le montant en
  // fin de ligne — on retient le DERNIER montant de la ligne) et un reçu par page (le nom sur une
  // ligne, la somme sur une autre — on retient la ligne « somme / montant / total » de la page, ou,
  // à défaut, l'unique montant de la page). Une page ambiguë ne produit rien plutôt qu'un montant
  // deviné.
  function recusDuPayeurDansPages(pages, mots, motsVente) {
    const recus = [];
    if (!mots || !mots.length) return recus;
    (pages || []).forEach((lignes, i) => {
      const recuComptable = lireRecuComptable(lignes);
      if (recuComptable) {
        for (const e of ecrituresDuPayeur(recuComptable, mots, motsVente)) recus.push(Object.assign({ page: i + 1 }, e));
        return;
      }
      const concernees = lignes.filter(l => ligneNommeLePayeur(l, mots));
      if (!concernees.length) return;
      const avecMontant = concernees.filter(l => montantsDansLigne(l).length);
      if (avecMontant.length) {
        for (const l of avecMontant) {
          const ms = montantsDansLigne(l);
          recus.push({ montant: ms[ms.length - 1], page: i + 1, extrait: l.trim().slice(0, 180) });
        }
        return;
      }
      const ligneSomme = lignes.find(l => RE_LIGNE_MONTANT_RECU.test(l) && montantsDansLigne(l).length);
      if (ligneSomme) {
        const ms = montantsDansLigne(ligneSomme);
        recus.push({ montant: ms[ms.length - 1], page: i + 1, extrait: (concernees[0].trim() + ' — ' + ligneSomme.trim()).slice(0, 180) });
        return;
      }
      const distincts = [...new Set(lignes.flatMap(montantsDansLigne))];
      if (distincts.length === 1) recus.push({ montant: distincts[0], page: i + 1, extrait: concernees[0].trim().slice(0, 180) });
    });
    return recus;
  }

  // Pure : le montant attendu d'après un décompte / appel de fonds (même lecteur que l'écran Appel
  // de fonds) — le solde annoncé s'il est lu, sinon débit moins crédit. Rien de positif : null.
  function soldeAttenduDepuisDecompte(texte) {
    const r = parserDecompteConfrere(texte);
    const somme = (l) => l.filter(x => !x.memoire).reduce((t, x) => t + (Number(x.montant) || 0), 0);
    const calcule = Math.round((somme(r.lignes.debit) - somme(r.lignes.credit)) * 100) / 100;
    const declare = Number(r.meta && r.meta.soldeDeclare);
    // Un total annoncé sans « Solde à verser » ne vaut solde que s'il n'y a rien à déduire après lui.
    const declareFiable = declare > 0 && (r.meta.soldeFinal || !somme(r.lignes.credit));
    const solde = declareFiable ? declare : calcule;
    return solde > 0 ? solde : null;
  }

  // Pure : les reçus retenus après une nouvelle lecture. Les fichiers de reçus sont supprimés du
  // commun une fois traités (étude, 30/09 : « il faut alors garder en mémoire le montant ») : un
  // versement déjà retenu dont le fichier n'a pas été relu cette fois (supprimé, illisible, ou hors
  // de la période lue) est conservé, marqué `memorise`. Seul un fichier effectivement relu peut
  // retirer un versement qu'il ne contient plus. `cheminsLus` : chemins lus avec succès.
  function cleRecu(r) { return [r.chemin, r.page || 1, r.montant, r.extrait || ''].join('|'); }
  function fusionnerRecusMemorises(anciens, trouves, cheminsLus) {
    const lus = cheminsLus instanceof Set ? cheminsLus : new Set(cheminsLus || []);
    const deja = new Set((trouves || []).map(cleRecu));
    const gardes = (anciens || []).filter(r => r && r.montant > 0 && !lus.has(r.chemin) && !deja.has(cleRecu(r)))
      .map(r => Object.assign({}, r, { memorise: true }));
    return (trouves || []).map(r => { const c = Object.assign({}, r); delete c.memorise; return c; }).concat(gardes)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }

  var RE_NOM_DECOMPTE = /(appel\s*de\s*fonds|d[ée]compte|convocation|tableau|fonds\s*[àa]\s*(verser|virer)|sommes?\s*[àa]\s*(verser|virer))/i;
  var RE_NOM_DECOMPTE_SUR = /(appel\s*de\s*fonds|d[ée]compte|convocation)/i;
  // Un « décompte » qui n'est pas celui de la vente (remboursement d'un prêt, amortissement…).
  // Même motif que RE_NOM_APPEL_FONDS_EXCLU (server/src/nasWatch.js) : à modifier ensemble.
  var RE_NOM_DECOMPTE_EXCLU = /(rembours|pr[eê]t|amortissement|offre|cr[ée]dit|re[cç]u)/i;
  // Ce qui n'est jamais un décompte, écarté de la lecture par le contenu (voir fichiersDecompteRacine).
  var RE_NOM_PAS_DECOMPTE = /(compromis|promesse|avant\s*contrat|offre|pr[eê]t|diagnostic|ddt|dpe|titre|plan|cadastre|urbanisme|r[èe]glement|reglement|proc[eè]s|pv|identit|cni|passeport|rib|mandat|facture|devis|re[cç]u|amortissement)/i;
  var cachePagesRecus = new Map();   // chemin → pages de lignes (les reçus d'un jour ne changent plus)

  async function pagesEnLignesNas(chemin) {
    if (cachePagesRecus.has(chemin)) return cachePagesRecus.get(chemin);
    const pdf = await ouvrirPdfNas(chemin);
    const pages = [];
    for (let p = 1; p <= Math.min(pdf.numPages, PLAFOND_PAGES_VERIFICATION); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      pages.push(lignesDepuisItemsPdf(content.items));
    }
    cachePagesRecus.set(chemin, pages);
    return pages;
  }

  // Montant attendu : le décompte rangé à la RACINE du dossier NAS relié (précisé par l'étude le
  // 28/09 : un simple tableau envoyé au confrère, ou la convocation au rendez-vous envoyée au
  // client — toujours à la racine, jamais dans un sous-dossier).
  //   1. d'abord les PDF dont le nom le dit (décompte, appel de fonds, convocation, tableau…) ;
  //   2. à défaut, les autres PDF courts de la racine (4 pages au plus), mais seulement si le texte
  //      annonce lui-même un solde (« solde à verser », « total »…) — jamais un montant recalculé :
  //      l'avant-contrat, lui aussi à la racine, cite des prix sans être un décompte.
  function fichiersDecompteRacine(fichiers, nomAvantContrat) {
    const racine = (fichiers || []).filter(f => f && f.chemin && !/[\\/]/.test(f.chemin));
    const recent = (a, b) => (anneeDansNomFichier(b.nom) || 0) - (anneeDansNomFichier(a.nom) || 0);
    const n = (f) => normaliserNomPourMotif(f.nom);
    const parNom = racine.filter(f => (RE_NOM_DECOMPTE_SUR.test(n(f)) && !RE_NOM_DECOMPTE_EXCLU.test(n(f)))
      || (RE_NOM_DECOMPTE.test(n(f)) && !RE_NOM_PAS_DECOMPTE.test(n(f)))).sort(recent);
    const autres = racine.filter(f => !parNom.includes(f) && f.nom !== nomAvantContrat
      && !RE_NOM_PAS_DECOMPTE.test(normaliserNomPourMotif(f.nom))).sort(recent);
    return { parNom, autres };
  }

  async function montantAttenduDepuisNas(d) {
    if (!d.nasDossier) return null;
    const { parNom, autres } = fichiersDecompteRacine(await listerFichiersNas(d), d.compromisNomFichier || '');
    // Le courrier déjà rattaché à la ligne « Envoi appel de fonds » est lu en premier.
    const rattache = courrierAppelFondsDossier(d);
    parNom.sort((a, b) => (b.chemin === rattache) - (a.chemin === rattache));
    const lire = async (f, strict) => {
      const chemin = cheminNasComplet(d, f.chemin);
      const pdf = await ouvrirPdfNas(chemin);
      if (strict && pdf.numPages > 4) return null;
      const texte = await lireTextePdfEnLignes(pdf);
      if (strict) {
        const declare = Number(parserDecompteConfrere(texte).meta.soldeDeclare);
        return declare > 0 ? { montant: declare, source: f.nom, chemin } : null;
      }
      const solde = soldeAttenduDepuisDecompte(texte);
      return solde ? { montant: solde, source: f.nom, chemin } : null;
    };
    // Un nom seulement « tableau… » ne suffit pas (un tableau d'amortissement en porte aussi un) :
    // il faut alors, comme pour les autres fichiers, un solde annoncé dans le texte.
    for (const f of parNom) {
      const nomSur = RE_NOM_DECOMPTE_SUR.test(normaliserNomPourMotif(f.nom));
      try { const r = await lire(f, !nomSur); if (r) return r; } catch (e) { /* fichier suivant */ }
    }
    for (const f of autres) { try { const r = await lire(f, true); if (r) return r; } catch (e) { /* fichier suivant */ } }
    return null;
  }

  // `discret` : vérification automatique (voir verifierFondsRecusAuto) — aucune notification à
  // l'écran, et rien n'est réécrit si la lecture ne change rien.
  async function verifierFondsRecus(id, btn, discret) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const signaler = (m) => { if (!discret) afficherToast(m, 'OK', null); };
    if (!nasDisponible()) { signaler('Le NAS n’est pas accessible depuis le serveur : impossible de lire les reçus.'); return; }
    const mots = motsPayeurDossier(d);
    const motsVente = motsVendeurDossier(d);
    if (!mots.length) { signaler('Nom de l’acquéreur inconnu : impossible de reconnaître ses reçus.'); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spinner', null, true)} Lecture des reçus…`; }
    try {
      const aujourdhui = isoAujourdhuiLocal();
      const depuis = d.appelFonds ? addDays(d.appelFonds, -15) : addDays(aujourdhui, -90);
      const reponse = await fetchAvecAuth('/api/nas/recus?depuis=' + encodeURIComponent(depuis));
      if (!reponse.ok) throw new Error('liste des reçus : erreur ' + reponse.status);
      const { recus: fichiers, dossiers: dossiersRecus } = await reponse.json();
      let trouves = [];
      let lus = 0;
      const cheminsLus = new Set();
      for (const f of fichiers || []) {
        try {
          const pages = await pagesEnLignesNas(f.chemin);
          lus++;
          cheminsLus.add(f.chemin);
          for (const r of recusDuPayeurDansPages(pages, mots, motsVente)) {
            // La date lue DANS le reçu l'emporte sur celle déduite du nom du fichier.
            trouves.push(Object.assign({ fichier: f.nom, chemin: f.chemin }, r, { date: r.date || f.date }));
          }
        } catch (e) { /* reçu illisible : les autres suffisent */ }
      }
      let attendu = null;
      if (d.fondsAttendusManuel > 0) attendu = { montant: d.fondsAttendusManuel, source: 'saisi à la main' };
      else { try { attendu = await montantAttenduDepuisNas(d); } catch (e) { attendu = null; } }
      const avant = d.fondsRecus;
      trouves = fusionnerRecusMemorises(avant && avant.recus, trouves, cheminsLus);
      const total = trouves.reduce((t, r) => t + r.montant, 0);
      if (discret && avant && avant.regle === REGLE_RAPPROCHEMENT_RECUS && Math.abs((avant.total || 0) - Math.round(total * 100) / 100) < 0.005
          && (avant.attendu || null) === (attendu ? attendu.montant : null)) return;
      d.fondsRecus = {
        verifieLe: new Date().toISOString(), regle: REGLE_RAPPROCHEMENT_RECUS, depuis, fichiersLus: lus,
        recus: trouves.slice(-60), total: Math.round(total * 100) / 100,
        // Où les reçus ont été cherchés (voir listerRecusNas côté serveur) : affiché sous la ligne,
        // pour qu'un reçu « jamais trouvé » se diagnostique d'un coup d'œil.
        dossiersRecus: Array.isArray(dossiersRecus) ? dossiersRecus.slice(0, 12).map(x => ({ dossier: String(x.dossier || ''), recus: Number(x.recus) || 0 })) : [],
        attendu: attendu ? attendu.montant : null, attenduSource: attendu ? attendu.source : '', attenduChemin: attendu && attendu.chemin || ''
      };
      sauvegarder(d);
      render();
      const b = bilanFondsRecus(d.fondsRecus.total, d.fondsRecus.attendu);
      signaler(b.etat === 'complet' ? 'Tous les fonds attendus sont reçus : la confirmation au client est prête.'
        : b.etat === 'excedent' ? 'Les reçus retenus dépassent le montant attendu : vérifiez qu’ils concernent bien ce dossier.'
        : !lus ? `Aucun fichier de reçus depuis le ${formatDateFr(depuis)} dans les dossiers lus (racine du NAS configurée et dossiers « DOSSIER »).`
        : `${trouves.length} reçu${trouves.length > 1 ? 's' : ''} trouvé${trouves.length > 1 ? 's' : ''} dans ${lus} fichier${lus > 1 ? 's' : ''} de reçus.`);
    } catch (e) {
      signaler('Lecture des reçus impossible : ' + e.message);
      if (!discret) render();
    }
  }

  // Vérification automatique des reçus (demandé par l'étude le 28/09, pour que le serveur puisse
  // prévenir le collaborateur sur Teams — voir alertesFondsDues dans server/src/jobs/rappels.js :
  // la lecture des PDF se fait ici, dans le navigateur, le serveur ne lit que son résultat).
  // Chaque poste ne vérifie que les dossiers DE SON collaborateur (pas de lectures en double d'un
  // poste à l'autre), une fois l'appel de fonds fait, jusqu'au rendez-vous, tant que la réception
  // n'est ni complète ni confirmée, et au plus une fois par heure et par dossier.
  var JOURS_VERIF_FONDS_AVANT_RDV = 15;
  // Version de la règle de rapprochement : un résultat lu avec une règle plus ancienne est relu
  // (même « complet ») — le 29/09, un reçu au nom d'un co-titulaire avait été compté à tort.
  var REGLE_RAPPROCHEMENT_RECUS = 2;
  var DELAI_VERIF_FONDS_MS = 55 * 60 * 1000;

  // Pure : les dossiers à revérifier maintenant.
  function dossiersAVerifierFonds(liste, utilisateur, aujourdhuiIso, maintenantMs) {
    if (!utilisateur) return [];
    return (liste || []).filter(d => {
      if (!d || d.archive || d.responsable !== utilisateur || d.receptionFondsConfirmeeLe) return false;
      if (!(d.appelFonds || echeanceValidee(d, 'appelFonds')) || !d.rendezVousSignature) return false;
      const j = ecartJours(aujourdhuiIso, d.rendezVousSignature);
      if (j === null || j < 0 || j > JOURS_VERIF_FONDS_AVANT_RDV) return false;
      const f = d.fondsRecus;
      if (f && f.regle !== REGLE_RAPPROCHEMENT_RECUS) return true;
      if (f && bilanFondsRecus(f.total, d.fondsAttendusManuel || f.attendu).etat === 'complet') return false;
      const derniere = f && Date.parse(f.verifieLe);
      return !(Number.isFinite(derniere) && maintenantMs - derniere < DELAI_VERIF_FONDS_MS);
    });
  }

  let verifFondsAutoEnCours = false;
  async function verifierFondsRecusAuto() {
    if (verifFondsAutoEnCours || !nasDisponible()) return;
    verifFondsAutoEnCours = true;
    try {
      for (const d of dossiersAVerifierFonds(dossiers, utilisateurPoste, isoAujourdhuiLocal(), Date.now())) {
        try { await verifierFondsRecus(d.id, null, true); } catch (e) { /* dossier suivant */ }
      }
    } finally { verifFondsAutoEnCours = false; }
  }

  function changerFondsAttendus(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const n = Number(String(valeur || '').replace(/[\s  €]/g, '').replace(',', '.'));
    const avant = d.fondsAttendusManuel || null;
    d.fondsAttendusManuel = n > 0 ? Math.round(n * 100) / 100 : null;
    if (avant === d.fondsAttendusManuel) return;
    if (d.fondsRecus) {
      d.fondsRecus.attendu = d.fondsAttendusManuel || null;
      d.fondsRecus.attenduSource = d.fondsAttendusManuel ? 'saisi à la main' : '';
    }
    ajouterHistorique(d, d.fondsAttendusManuel ? `Montant attendu des fonds saisi : ${formaterPrixCentimes(d.fondsAttendusManuel)}` : 'Montant attendu des fonds effacé');
    sauvegarder(d);
    render();
  }

  // Retire un versement conservé en mémoire (fichier supprimé du commun) : seul moyen de corriger
  // un versement mal rattaché, le fichier n'étant plus là pour être relu.
  function retirerRecuMemorise(id, cle) {
    const d = dossiers.find(x => x.id === id);
    const f = d && d.fondsRecus;
    if (!f || !Array.isArray(f.recus)) return;
    const r = f.recus.find(x => x.memorise && cleRecu(x) === cle);
    if (!r) return;
    f.recus = f.recus.filter(x => x !== r);
    f.total = Math.round(f.recus.reduce((t, x) => t + x.montant, 0) * 100) / 100;
    ajouterHistorique(d, `Versement retiré des fonds reçus : ${formaterPrixCentimes(r.montant)}${r.date ? ' du ' + formatDateFr(r.date) : ''} (${r.fichier || 'reçu'})`);
    sauvegarder(d);
    render();
  }

  // Autres noms sous lesquels l'acquéreur verse (nom d'usage, d'épouse…), saisis à la main : les
  // reçus sont relus aussitôt avec ces noms.
  function changerNomsRecus(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = String(valeur || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (nouveau === (d.nomsRecus || '')) return;
    d.nomsRecus = nouveau;
    ajouterHistorique(d, nouveau ? `Autres noms cherchés sur les reçus : ${nouveau}` : 'Autres noms cherchés sur les reçus effacés');
    sauvegarder(d);
    render();
    if (nasDisponible()) verifierFondsRecus(id, null, false);
  }

  // Ligne d'action « Fonds reçus » (onglet Échanges) : vérifier PUIS confirmer au client, sur une
  // seule ligne (demandé par l'étude le 28/09 : les deux lignes séparées ne disaient pas que l'une
  // précède l'autre). L'état en précision ; en dessous, toujours visibles, le montant attendu et
  // chaque reçu retenu — l'indicateur ne dit jamais « complet » sans montrer sur quoi il se fonde.
  // Le geste principal suit l'avancement :
  //   pas vérifié / incomplet → « Vérifier » (lire les reçus du NAS) ;
  //   tous les fonds reçus    → « Confirmer » (email au client ou au confrère), « Revérifier » en icône ;
  //   confirmation envoyée    → « Renvoyer », la date de l'envoi en précision.
  // La lecture des reçus peut manquer un versement (nom inattendu, reçu pas encore déposé) : la
  // confirmation reste possible « quand même » depuis le détail, une fois l'appel de fonds fait.
  // Où CLAIRE a cherché les reçus, et sous quel nom : ce qu'il faut savoir quand un versement n'a
  // pas été retrouvé (demandé après le dossier GROFFAL, 29/09 : reçus rangés dans « DOSSIER »).
  function renderDossiersRecusLus(f, mots) {
    // Seuls les dossiers où des reçus ont été trouvés sont nommés ; aucun : tous ceux qui ont été lus.
    const dossiersLus = (f && f.dossiersRecus) || [];
    const avecRecus = dossiersLus.filter(x => x.recus > 0);
    const lieux = avecRecus.length
      ? 'fichiers de reçus lus dans : ' + avecRecus.map(x => `${x.dossier} (${x.recus} fichier${x.recus > 1 ? 's' : ''})`).join(' · ')
      : (dossiersLus.length ? 'aucun fichier de reçus dans : ' + dossiersLus.map(x => x.dossier).join(' · ') : '');
    const nom = (mots || []).length ? `au nom de ${mots.map(m => m.toUpperCase()).join(' / ')}` : '';
    if (!lieux && !nom) return '';
    // Texte brut, lu dans la pastille « i » de la ligne (échappé par infoBulle).
    return `${nom ? `Versements cherchés ${nom}` : ''}${nom && lieux ? ' — ' : ''}${lieux}.`;
  }

  // Édition sur place (crayon, ✓, ×) du montant attendu et des noms cherchés sur les reçus.
  var fondsEdition = {};
  function editerChampFonds(id, champ) { fondsEdition[id + ':' + champ] = true; render(); setTimeout(() => { const e = document.getElementById(`fonds-${champ}-${id}`); if (e) { e.focus(); e.select && e.select(); } }, 0); }
  function annulerChampFonds(id, champ) { delete fondsEdition[id + ':' + champ]; render(); }
  function validerChampFonds(id, champ) {
    const e = document.getElementById(`fonds-${champ}-${id}`);
    const valeur = e ? e.value : '';
    delete fondsEdition[id + ':' + champ];
    if (champ === 'attendu') changerFondsAttendus(id, valeur); else changerNomsRecus(id, valeur);
    render();
  }
  function champFondsEditable(d, champ, affichage, valeur, placeholder, attrs) {
    if (fondsEdition[d.id + ':' + champ]) {
      return `<span class="fonds-edition">
        <input type="text" id="fonds-${champ}-${d.id}" value="${escapeAttr(valeur)}" placeholder="${escapeAttr(placeholder)}" ${attrs || ''}
          onkeydown="if(event.key==='Enter')validerChampFonds('${d.id}','${champ}');if(event.key==='Escape')annulerChampFonds('${d.id}','${champ}')">
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="validerChampFonds('${d.id}','${champ}')" title="Valider" aria-label="Valider">${icone('check')}</wa-button>
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="annulerChampFonds('${d.id}','${champ}')" title="Annuler" aria-label="Annuler">${icone('x')}</wa-button></span>`;
    }
    return `${affichage}<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn fonds-crayon" onclick="editerChampFonds('${d.id}','${champ}')" title="Modifier" aria-label="Modifier">${icone('pencil')}</wa-button>`;
  }

  // Réception des fonds, en visuel (demandé par l'étude le 29/09 : « plus clair, moins de texte ») :
  // trois chiffres (reçu, attendu, reste ou écart), une jauge, puis les versements retenus en lignes
  // courtes. Le détail (fichiers lus, noms cherchés, marge de 2 €) passe dans les pastilles « i ».
  function renderFondsRecus(d) {
    if (!echeanceValidee(d, 'appelFonds') && !d.fondsRecus && !d.rendezVousSignature) return '';
    const f = d.fondsRecus;
    const attendu = d.fondsAttendusManuel || (f && f.attendu) || null;
    const b = bilanFondsRecus(f ? f.total : 0, attendu);
    const confirmee = d.receptionFondsConfirmeeLe;
    const etatCourt = !f ? ['dl-neutre', 'Pas encore vérifié']
      : b.etat === 'complet' ? ['dl-success', 'Tous les fonds sont reçus']
      : b.etat === 'excedent' ? ['dl-pret', 'Écart à vérifier']
      : b.etat === 'partiel' ? ['dl-pret', `Reste ${formaterPrixCentimes(b.reste)}`]
      : b.etat === 'inconnu' ? ['dl-neutre', 'Montant attendu à saisir']
      : ['dl-urgent', 'Aucun reçu trouvé'];
    const sousHtml = `<span class="dot-label ${etatCourt[0]}"><span class="dot"></span>${etatCourt[1]}</span>`
      + (confirmee ? ` <span class="fonds-confirmation">· confirmé au client le ${formatDateFr(confirmee)}</span>` : '');

    // Les trois chiffres et la jauge.
    const sourceAttendu = f && f.attenduChemin && !d.fondsAttendusManuel
      ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn fonds-source" onclick="ouvrirFichierNas('${escapeOnclickArg(f.attenduChemin)}')" title="${escapeAttr('Lu dans ' + (f.attenduSource || 'le décompte'))}" aria-label="Ouvrir le décompte">${icone('file-text')}</wa-button>`
      : '';
    const valeurAttendu = attendu ? formaterPrixCentimes(attendu) : '—';
    const troisieme = b.etat === 'excedent'
      ? { libelle: 'Écart', valeur: '+' + formaterPrixCentimes(b.ecart), cls: 'fonds-chiffre-alerte' }
      : b.attendu
        ? (b.etat === 'complet' && Math.abs(b.ecart) >= 1
          ? { libelle: 'Écart', valeur: (b.ecart > 0 ? '+' : '−') + formaterPrixCentimes(Math.abs(b.ecart)), cls: '' }
          : { libelle: 'Reste', valeur: formaterPrixCentimes(b.reste), cls: b.reste > 0 ? 'fonds-chiffre-attente' : 'fonds-chiffre-ok' })
        : null;
    const pct = b.attendu ? Math.min(100, Math.round((b.total / b.attendu) * 100)) : 0;
    const clsBarre = b.etat === 'complet' ? 'fonds-barre-ok' : b.etat === 'excedent' ? 'fonds-barre-alerte' : 'fonds-barre-attente';
    const jauge = `<div class="fonds-jauge">
        <div class="fonds-chiffres">
          ${f ? `<div class="fonds-chiffre"><span class="fonds-chiffre-libelle">Reçu</span><strong>${formaterPrixCentimes(b.total)}</strong></div>` : ''}
          <div class="fonds-chiffre"><span class="fonds-chiffre-libelle">Attendu ${infoBulle('À 2 € près : au-delà, en plus ou en moins, CLAIRE signale un écart.')}</span>
            <span class="fonds-chiffre-valeur">${champFondsEditable(d, 'attendu', `<strong>${valeurAttendu}</strong>${sourceAttendu}`, attendu ? String(attendu).replace('.', ',') : '', 'lu dans le décompte', 'inputmode="decimal"')}</span></div>
          ${troisieme ? `<div class="fonds-chiffre ${troisieme.cls}"><span class="fonds-chiffre-libelle">${troisieme.libelle}</span><strong>${troisieme.valeur}</strong></div>` : ''}
        </div>
        ${b.attendu ? `<div class="fonds-barre ${clsBarre}" role="img" aria-label="${pct} % des fonds attendus reçus"><span style="width:${pct}%"></span></div>` : ''}
      </div>`;

    // Les versements retenus, une ligne courte chacun.
    const versements = f && f.recus && f.recus.length ? `<ul class="fonds-versements">${f.recus.map(r => `
        <li${r.memorise ? ' class="memorise"' : ''}>
          <span class="fonds-v-date">${r.date ? r.date.slice(8, 10) + '/' + r.date.slice(5, 7) : '—'}</span>
          <strong class="fonds-v-montant">${formaterPrixCentimes(r.montant)}</strong>
          ${r.confirme ? `<span class="fonds-v-ref" title="La référence de la vente est retrouvée dans le libellé">${icone('check')}</span>` : '<span class="fonds-v-ref"></span>'}
          ${r.memorise
            ? `<span class="fonds-v-actions"><span class="fonds-v-memorise" title="${escapeAttr(`${r.fichier || 'Reçu'}${r.page > 1 ? ' p.' + r.page : ''} — fichier retiré du commun, montant conservé${r.extrait ? '\n' + r.extrait : ''}`)}">${icone('archive')}</span><wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="retirerRecuMemorise('${d.id}', '${escapeOnclickArg(cleRecu(r))}')" title="Retirer ce versement" aria-label="Retirer ce versement">${icone('x')}</wa-button></span>`
            : `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="ouvrirFichierNas('${escapeOnclickArg(r.chemin)}')" title="${escapeAttr(`${r.fichier}${r.page > 1 ? ' p.' + r.page : ''}${r.compte ? ' · compte ' + r.compte : ''}${r.extrait ? '\n' + r.extrait : ''}`)}" aria-label="Ouvrir le reçu">${icone('file-text')}</wa-button>`}
        </li>`).join('')}</ul>` : '';

    // Pied : noms cherchés (modifiables), dernière lecture, confirmation « quand même ».
    const mots = motsPayeurDossier(d);
    const noms = champFondsEditable(d, 'noms', `<span>${mots.length ? escapeHtml(mots.map(m => m.toUpperCase()).join(' / ')) : 'nom de l’acquéreur inconnu'}</span>`, d.nomsRecus || '', 'autre nom : d’usage, d’épouse…');
    const lecture = f ? `${f.fichiersLus} reçu${f.fichiersLus > 1 ? 's' : ''} lu${f.fichiersLus > 1 ? 's' : ''} · ${new Date(f.verifieLe).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ${infoBulle([`Reçus lus depuis le ${formatDateFr(f.depuis)}.`, 'Chaque versement au nom de l’acquéreur est listé : vérifiez qu’il concerne bien ce dossier.', renderDossiersRecusLus(f, mots),
      (f.recus || []).some(r => r.memorise) ? 'Icône boîte : fichier de reçus supprimé du commun, montant conservé par CLAIRE.' : ''].filter(Boolean).join(' '))}` : '';
    const peutConfirmer = echeanceValidee(d, 'appelFonds') && !!emailDestinataireRelance(d);
    const complet = !!f && b.etat === 'complet';
    const confirmer = `envoyerRelanceCiblee('${d.id}', 'fonds')`;
    const quandMeme = peutConfirmer && !confirmee && !complet
      ? `<button type="button" class="lien-action" onclick="${confirmer}">Confirmer quand même</button>${infoBulle('Fonds arrivés mais absents des reçus lus : la confirmation au client reste possible.')}`
      : '';
    const pied = `<div class="fonds-pied">
        <span class="fonds-noms">${icone('user')} ${noms}</span>
        ${lecture ? `<span class="fonds-lecture">${lecture}</span>` : ''}
        ${quandMeme ? `<span class="fonds-quand-meme">${quandMeme}</span>` : ''}
      </div>`;
    const detail = `<div class="fonds-recus">${jauge}${versements}${pied}</div>`;

    const verifier = { libelle: f ? 'Revérifier' : 'Vérifier', icone: icone('rotate-ccw'), onclick: `verifierFondsRecus('${d.id}', this)`, titre: 'Lire les reçus comptables déposés sur le NAS' };
    let bouton = verifier;
    if (peutConfirmer && confirmee) bouton = { libelle: 'Renvoyer', icone: icone('mail'), onclick: confirmer, titre: 'Renvoyer la confirmation de réception des fonds' };
    else if (peutConfirmer && complet) bouton = { libelle: 'Confirmer', icone: icone('mail'), onclick: confirmer, titre: 'Confirmer la réception des fonds au client' };
    const reverifierIcone = bouton === verifier ? '' : `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn ja-plus-tard" onclick="verifierFondsRecus('${d.id}', this)" title="${f ? 'Revérifier les reçus' : 'Vérifier les reçus'}" aria-label="${f ? 'Revérifier les reçus' : 'Vérifier les reçus'}">${icone('rotate-ccw')}</wa-button>`;
    return renderLigneAction({
      categorie: 'appelFonds', categorieLabel: 'Fonds reçus', titre: 'Fonds reçus en comptabilité',
      sousHtml, faite: !!confirmee, bouton, secondaires: reverifierIcone,
      detail, detailOuvert: true
    });
  }

  // Noter dans l'agenda Outlook de l'office qu'un envoi vient d'être fait : écrit « Appel de fonds
  // envoyé » (ou « … et projet envoyé ») dans le LIEU du rendez-vous de signature, APRÈS les
  // initiales du collaborateur, sans toucher au code couleur du rendez-vous (voir la route
  // /exchange/rendez-vous/lieu, qui ne modifie que le champ Lieu). Proposé seulement quand la
  // connexion Exchange est configurée (exchangeAgendaPret), qu'un rendez-vous de signature est
  // renseigné (il faut une date pour retrouver l'événement dans l'agenda) et qu'au moins un des deux
  // envois est fait. Le libellé reflète l'état courant : si le projet part plus tard, un nouveau clic
  // met la mention à jour (le serveur remplace l'ancienne sans doublon).
  // Depuis Batch D, la note est ÉCRITE AUTOMATIQUEMENT à la validation d'une date d'envoi (voir
  // validerEditionDate → noterEnvoiDansAgenda(auto)) : ce bouton reste comme repli/re-note quand
  // l'écriture auto a échoué (Exchange momentanément indisponible) ou quand le rendez-vous de
  // signature est fixé APRÈS l'envoi (il n'y avait alors aucun événement à annoter au moment de la
  // validation).
  // Code couleur des rendez-vous de signature de l'étude (catégories Outlook) : vert = à l'office,
  // violet = en visio, orange = chez un confrère. Le NOM de chaque catégorie se règle dans les
  // Réglages (exchangeReglages.categoriesRdv) : c'est lui qui porte la couleur dans Outlook.
  var TYPES_RDV = {
    office: { libelle: "À l'office", court: 'Office' },
    visio: { libelle: 'En visio', court: 'Visio' },
    confrere: { libelle: 'Chez un confrère', court: 'Confrère' }
  };
  // Catégories qu'on peut poser sur un rendez-vous de l'agenda : le lieu (TYPES_RDV) et, en jaune,
  // « Annulé / à replacer » (étude, 01/10) — la signature d'un dossier ainsi marquée repasse « à
  // placer ». Nom Outlook de chacune réglé dans Réglages › Agenda et Outlook (categoriesRdv).
  var CATEGORIES_AGENDA = Object.assign({}, TYPES_RDV, { annule: { libelle: 'Annulé / à replacer', court: 'À replacer' } });

  function normaliserNomCategorie(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // Type (office / visio / confrère) d'un rendez-vous de signature : celui choisi à sa création dans
  // CLAIRE, sinon déduit de la catégorie Outlook relevée dans l'agenda. Pure, testable. '' si inconnu.
  function typeRendezVous(d, categoriesRdv) {
    if (!d) return '';
    if (d.rendezVousType && TYPES_RDV[d.rendezVousType]) return d.rendezVousType;
    const cats = Array.isArray(d.rendezVousSignatureCategories) ? d.rendezVousSignatureCategories.map(normaliserNomCategorie) : [];
    if (!cats.length) return '';
    const noms = categoriesRdv || {};
    for (const cle of Object.keys(TYPES_RDV)) {
      if (noms[cle] && cats.includes(normaliserNomCategorie(noms[cle]))) return cle;
    }
    return '';
  }

  function categoriesRdvReglees() {
    return (exchangeReglages && exchangeReglages.categoriesRdv) || {};
  }

  // Mention d'envoi écrite dans le lieu du rendez-vous (même texte que composerLieuAgenda côté
  // serveur). Pure, testable. Chaîne vide si aucun des deux envois n'est fait.
  function mentionEnvoisAgenda(d) {
    const af = echeanceValidee(d, 'appelFonds');
    const pj = echeanceValidee(d, 'projetEnvoye');
    if (af && pj) return 'Appel de fonds et projet envoyé';
    if (af) return 'Appel de fonds envoyé';
    if (pj) return 'Projet envoyé';
    return '';
  }

  // Initiales du collaborateur responsable (« Bastien ANGLUMENT » → « BA ») : c'est ainsi que
  // l'étude commence le lieu de ses rendez-vous. Pure, testable.
  function initialesResponsable(d) {
    return String((d && d.responsable) || '').trim().split(/[\s-]+/)
      .map(m => m.charAt(0).toUpperCase()).filter(c => /[A-ZÀ-Ý]/.test(c)).join('');
  }

  // « Maître Paul DURAND (ORLEANS) » → « Me DURAND » : le nom de famille (mots en capitales), sans
  // prénom, titre ni ville. Pure, testable.
  function nomConfrereCourt(nom) {
    const sansVille = String(nom || '').replace(/\([^)]*\)/g, ' ').replace(/,.*$/, ' ');
    const mots = sansVille.replace(/^\s*(ma[iî]tre|me)\.?\s+/i, '').split(/\s+/).filter(Boolean);
    const capitales = mots.filter(m => /^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’-]+$/.test(m));
    const famille = capitales.length ? capitales.join(' ') : (mots[mots.length - 1] || '');
    return famille ? 'Me ' + famille : '';
  }

  // Le confrère dans le lieu du rendez-vous (demandé par l'étude le 29/09) : « Me DURAND en 1er »
  // s'il reçoit l'acte, « Me DURAND en 2nd » s'il est en participation — le vocabulaire des
  // notaires (notaire en premier / en second). Le confrère est le notaire de l'AUTRE partie que
  // celle de l'étude ; sans étude reconnue sur la fiche, seulement s'il n'y a qu'un nom possible.
  // Pure, testable. '' quand aucun autre office n'intervient.
  function confrereLieuAgenda(d) {
    if (!d) return '';
    const cote = coteEtudeDossier(d);
    let coteConfrere = cote === 'vendeur' ? 'acquereur' : (cote === 'acquereur' ? 'vendeur' : null);
    if (!coteConfrere) {
      const autres = ['vendeur', 'acquereur'].filter(c => {
        const n = c === 'vendeur' ? d.notaireVendeur : d.notaireAcquereur;
        return n && !estEtude({ nom: n });
      });
      if (autres.length !== 1) return '';
      coteConfrere = autres[0];
    }
    const nom = coteConfrere === 'vendeur' ? d.notaireVendeur : d.notaireAcquereur;
    if (!nom || estEtude({ nom })) return '';
    const court = nomConfrereCourt(nom);
    if (!court) return '';
    const recoitActe = d.coteInstrumentaire ? d.coteInstrumentaire === coteConfrere : d.roleNotaire === 'participant';
    return `${court} ${recoitActe ? 'en 1er' : 'en 2nd'}`;
  }

  // Lieu d'un rendez-vous créé par CLAIRE : « BA - Me DURAND en 2nd - Appel de fonds envoyé » —
  // initiales, confrère éventuel, puis la mention d'envoi quand elle est déjà due.
  function lieuRdvAgenda(d) {
    return [initialesResponsable(d), confrereLieuAgenda(d), mentionEnvoisAgenda(d)].filter(Boolean).join(' - ');
  }

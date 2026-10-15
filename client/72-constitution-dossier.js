  // ==== CONSTITUTION DE DOSSIER (étude 15/10) : les courriers d'interrogation d'une vente ou d'une succession ====
  // « Tous les modèles de documents que je t'ai envoyés vont permettre de créer un outil de constitution de dossier de vente et de
  // succession. L'objectif est de recouper les fiches clients, avec le répertoire et avec les courriers. » À partir de la fiche d'un
  // dossier rattaché, l'outil prépare les courriers de l'office (papier à en-tête, tampon et signature) :
  //  - VENTE : alignement et numérotage, non-péril / insalubrité, assainissement — une série par commune du bien, TOUTES les
  //    parcelles d'Authentic, TOUS les vendeurs avec leur domicile d'Authentic. Destinataire selon la commune : mairie en papier,
  //    sauf Blois (péril sur le site de la Ville, numérotage par courriel) et l'assainissement (Agglopolys pour ses communes, la
  //    communauté de communes pour le Grand Chambord). Le CU et la DIA ne sont pas des courriers : guichets uniques (GNAU).
  //  - SUCCESSION : les courriers d'interrogation de l'étude (banque, assurance-vie, impôts, CPAM, retraite, CARSAT, MSA, EHPAD ;
  //    la mutuelle à la demande), le défunt tel que sa fiche Authentic le donne (date de décès, domicile, régime), le destinataire
  //    retrouvé dans le répertoire selon le domicile du défunt, une liste à cocher et des champs à saisir quand une donnée manque.
  // Authentic est la base : jamais une parcelle, un nom ou une date pris ailleurs sans le dire. Ce qui manque est montré, jamais deviné.

  var cstEtat = null;
  var cstAdressesRetenues = {};
  var CST_MODELES_REPERTOIRE = {
    banque: { theme: 'banquesSuccessions' },
    'assurance-vie': { theme: 'assurances' },
    impots: { theme: 'impots' },
    cpam: { re: /cpam|assurance maladie/i },
    retraite: { re: /agirc|arrco|cicas|humanis|retraite compl/i },
    carsat: { re: /carsat/i },
    msa: { re: /\bmsa\b/i },
    mutuelle: { re: /mutuelle|camieg|harmonie/i }
  };

  // ---- Données (pures) ----

  // Pure : « Monsieur », « Madame », « Mademoiselle » d'après 'M' / 'Mme' / un libellé ; '' sinon.
  function civiliteLibelleConstitution(c) {
    const x = String(c || '').trim();
    if (/^(m\.?|monsieur|mr)$/i.test(x)) return 'Monsieur';
    if (/^(mme\.?|madame)$/i.test(x)) return 'Madame';
    if (/^(mlle\.?|mademoiselle)$/i.test(x)) return 'Mademoiselle';
    return '';
  }

  // Pure : la fiche client d'Authentic retenue sur le dossier pour cette personne (nom complet), ou null.
  function ficheClientPourPersonneConstitution(d, nom) {
    const fiches = Object.values((d && d.authentic && d.authentic.fichesClients) || {});
    const cle = normaliserPourRecherche(nom || '').replace(/[^a-z0-9]+/g, ' ').trim();
    return fiches.find(f => normaliserPourRecherche(f.nom || '').replace(/[^a-z0-9]+/g, ' ').trim() === cle)
      || fiches.find(f => memePersonneParNom(f.nom, nom)) || null;
  }

  // Pure : { nom, cp } de la commune du bien d'après la fiche (« COMMUNE (41000), 9 rue… »), sinon l'adresse du bien d'Authentic.
  function communeDuDossierConstitution(d) {
    const a = (d && d.bien && d.bien.adresse) || {};
    const texte = String((d && d.adresseBien) || '');
    const m = /^\s*(.+?)\s*\((\d{5})\)/.exec(texte);
    if (m) return { nom: m[1].trim(), cp: m[2] };
    const ligne = /\b(\d{5})\s+([A-ZÀ-Ü][^,\d]+)/.exec(texte);
    return { nom: String(a.commune || (ligne ? ligne[2] : '')).trim(), cp: String(a.codePostal || (ligne ? ligne[1] : '')).trim() };
  }

  // Pure : les vendeurs du dossier avec leur domicile tel que la fiche client d'Authentic le donne ('' si elle n'a pas été lue).
  function proprietairesConstitution(d) {
    const vendeurs = (Array.isArray(d && d.parties) ? d.parties : []).filter(p => p && String(p.role || '').toUpperCase() === 'VENDEUR' && String(p.nom || '').trim());
    return vendeurs.map(p => {
      const morale = p.qualitePersonne === 'morale';
      const f = morale ? null : ficheClientPourPersonneConstitution(d, p.nom);
      const domicile = f && f.domicile ? normaliserAdresse(f.domicile) : '';
      return { civilite: morale ? '' : (civiliteLibelleConstitution(p.civilite) || civiliteLibelleConstitution(f && f.civilite)), nom: String(p.nom).trim(), domicile, morale, source: domicile ? 'Authentic' : '' };
    });
  }

  // Pure : les parcelles du dossier par commune — tous les immeubles d'Authentic (retenus à la création) ET celles de la fiche, sans
  // doublon ; chacune avec sa commune quand Authentic la donne, sinon celle du bien. [{ cle, commune, cp, principale, adresseImmeuble,
  // parcelles: [{ prefixe, section, numero, lieuDit, surface, actif, origine }] }], la commune du bien d'abord.
  function groupesParcellesConstitution(d) {
    const principale = communeDuDossierConstitution(d);
    const cleCommune = (nom) => normaliserPourRecherche(nom || '').replace(/[^a-z0-9]+/g, ' ').replace(/\bsaint(e?)\b/g, 'st$1').trim();
    const groupes = [];
    const groupe = (nom, cp, adresse) => {
      const cle = cleCommune(nom || principale.nom) || 'commune';
      let g = groupes.find(x => x.cle === cle);
      if (!g) {
        const estPrincipale = cle === cleCommune(principale.nom) || !principale.nom;
        g = { cle, commune: String(nom || principale.nom || '').toUpperCase(), cp: estPrincipale ? principale.cp : (cp || ''), principale: estPrincipale, adresseImmeuble: '', parcelles: [] };
        groupes.push(g);
      }
      if (adresse && !g.adresseImmeuble) g.adresseImmeuble = adresse;
      return g;
    };
    const vues = new Set();
    const ajouter = (p, origine, communeImmeuble, adresseImmeuble, cpImmeuble) => {
      const section = String(p.section || '').trim().toUpperCase();
      const numero = String(p.numero || '').trim().replace(/^0+(?=\d)/, '');
      if (!section || !numero) return;
      const prefixe = /^0*$/.test(String(p.prefixe || '').trim()) ? '' : String(p.prefixe).trim();
      const nomCommune = String(p.commune || communeImmeuble || principale.nom || '');
      const cle = [cleCommune(nomCommune), prefixe, section, numero].join('|');
      if (vues.has(cle)) return;
      vues.add(cle);
      groupe(nomCommune, cpImmeuble, adresseImmeuble).parcelles.push({ prefixe, section, numero, lieuDit: String(p.lieuDit || ''), surface: String(p.surface || ''), actif: true, origine });
    };
    ((d && d.authentic && d.authentic.immeubles) || []).forEach(im => (im.parcelles || []).forEach(p => ajouter(p, 'Authentic', im.commune, im.adresse ? normaliserAdresse(im.adresse) : '', im.codePostal)));
    const cad = d && d.bien && d.bien.cadastre;
    const fiche = cad ? (Array.isArray(cad.parcelles) && cad.parcelles.length ? cad.parcelles : (cad.section ? [cad] : [])) : [];
    fiche.forEach(p => ajouter(p, 'Fiche', '', '', ''));
    if (!groupes.length && principale.nom) groupe(principale.nom, principale.cp, '');
    groupes.forEach(g => {
      if (!g.adresseImmeuble) {
        g.adresseImmeuble = g.principale && d && d.adresseBien ? normaliserAdresse(d.adresseBien)
          : [g.commune + (g.cp ? ` (${g.cp})` : ''), (g.parcelles.find(p => p.lieuDit) || {}).lieuDit].filter(Boolean).join(', ');
      }
    });
    return groupes.sort((a, b) => (b.principale ? 1 : 0) - (a.principale ? 1 : 0));
  }

  // Pure : les lignes d'adresse de la mairie (service urbanisme) d'après l'annuaire du service public, sinon code postal et commune.
  function lignesMairieConstitution(groupe, mairie) {
    const lignes = ['MAIRIE', 'SERVICE URBANISME'];
    const adr = mairie && mairie.adresse ? String(mairie.adresse).split(',').map(x => x.trim()).filter(Boolean) : [];
    if (adr.length) { lignes.push(...adr.slice(0, -1)); lignes.push(adr[adr.length - 1].toUpperCase()); }
    else lignes.push([groupe && groupe.cp, groupe && groupe.commune].filter(Boolean).join(' ').toUpperCase());
    return lignes;
  }

  // Pure : les lignes du destinataire d'un courrier de vente selon son circuit (mairie, Agglopolys, communauté de communes, Blois).
  function lignesDestinataireVente(circuit, groupe, mairie, retenues) {
    const retenue = (cle) => retenues && retenues[cle] && retenues[cle].lignes && retenues[cle].lignes.length ? retenues[cle].lignes : null;
    if (circuit.destinataire === 'agglopolys') return retenue('agglopolys') || DESTINATAIRES_CONNUS.agglopolys.lignes.slice();
    if (circuit.destinataire === 'grand-chambord') return retenue('grand-chambord') || DESTINATAIRES_CONNUS['grand-chambord'].lignes.slice();
    if (circuit.destinataire === 'blois-geometre') return retenue('blois-geometre') || ['VILLE DE BLOIS', 'Service des géomètres — demandes des notaires', 'Envoi par courriel'];
    return lignesMairieConstitution(groupe, mairie);
  }

  // Pure : le département d'un texte d'adresse (« BRACIEUX (41250), … » → « 41 »), ''.
  function departementDeTexteConstitution(texte) {
    // Le DERNIER nombre de cinq chiffres : celui d'une « CS 72301 » ou d'une « BP » vient avant le code postal.
    const tous = String(texte || '').match(/\b\d{5}\b/g) || [];
    const cp = tous.length ? tous[tous.length - 1] : '';
    return cp ? (cp.startsWith('97') ? cp.slice(0, 3) : cp.slice(0, 2)) : '';
  }

  // Pure : l'établissement cité dans le domicile du défunt (« EHPAD La Bonne Eure, 31 rue de Candy ») → { nom, lignes } ou null.
  function etablissementDansDomicileConstitution(domicile) {
    const m = /((?:EHPAD|E\.H\.P\.A\.D\.?|R[ée]sidence|Maison de retraite|Foyer|Clinique|H[ôo]pital)[^,]*)(?:,\s*(.+))?$/i.exec(String(domicile || '').trim());
    if (!m) return null;
    const reste = String(m[2] || '').trim();
    const avantEtablissement = String(domicile).slice(0, m.index).replace(/[,\s]+$/, '').trim();
    return { nom: m[1].trim().toUpperCase(), lignes: [m[1].trim().toUpperCase(), reste, avantEtablissement].filter(Boolean) };
  }

  // Pure : les contacts du répertoire qui conviennent à un modèle de courrier de succession.
  function candidatsRepertoireConstitution(cle, contacts) {
    const r = CST_MODELES_REPERTOIRE[cle];
    if (!r) return [];
    return (contacts || []).filter(c => c && (r.theme ? c.theme === r.theme : r.re.test([c.organisme, c.service].filter(Boolean).join(' '))));
  }

  // Pure : le contact du répertoire retenu d'avance pour ce modèle selon le DOMICILE du défunt — un seul contact du même département
  // (ou, pour les impôts, celui qui porte le nom de la commune) ; null quand rien ne s'impose (banque, assurance-vie : à choisir).
  function contactPreferePourDefuntConstitution(cle, contacts, defunt) {
    const candidats = candidatsRepertoireConstitution(cle, contacts);
    if (!candidats.length || cle === 'banque' || cle === 'assurance-vie') return null;
    const dep = departementDeTexteConstitution(defunt && defunt.domicile);
    const nomCommune = normaliserPourRecherche(String((/^(.+?)\s*\(\d{5}\)/.exec(String((defunt && defunt.domicile) || '')) || [])[1] || '')).replace(/[^a-z0-9]+/g, ' ').trim();
    if (cle === 'impots' && nomCommune) {
      const parCommune = candidats.filter(c => normaliserPourRecherche([c.organisme, c.service].join(' ')).replace(/[^a-z0-9]+/g, ' ').includes(nomCommune));
      if (parCommune.length === 1) return parCommune[0];
    }
    // Un seul organisme de ce genre dans le répertoire (la CARSAT Centre, régionale) : c'est lui, quel que soit le département.
    if (candidats.length === 1 && cle !== 'impots') return candidats[0];
    if (!dep) return null;
    const memeDep = candidats.filter(c => departementDeTexteConstitution(c.adresse) === dep);
    return memeDep.length === 1 ? memeDep[0] : null;
  }

  // Pure : le défunt du dossier — les champs saisis sur la fiche (d.defunt) l'emportent ; sinon la fiche client d'Authentic qui porte une
  // date de décès. { champs, source, avertissements, regime, relations }.
  function defuntConstitution(d) {
    const { fiche, autres, comparant } = defuntDepuisFiches(d);
    const saisi = (d && d.defunt) || {};
    const sm = fiche && fiche.situationMatrimoniale ? fiche.situationMatrimoniale : null;
    // Sans fiche lue, le défunt nommé par les comparants d'Authentic (« Mme DUPONT Marie veuve de M. DUPONT Jean », qualité « Défunt »).
    const np = !fiche && comparant ? nomPrenomsComparant(comparant.nom) : null;
    const civilite = civiliteLibelleConstitution(saisi.civilite || (fiche && fiche.civilite) || (comparant && comparant.civilite)) || 'Madame';
    const conjFiche = conjointDefunt(sm, civilite);
    const conj = conjFiche.lien || conjFiche.nom || !comparant || !comparant.lien ? conjFiche
      : { lien: comparant.lien, nom: comparant.conjoint || '' };
    const prenoms = saisi.prenoms != null ? saisi.prenoms : (fiche ? [fiche.prenom, fiche.autresPrenoms].filter(Boolean).join(' ') : (np ? np.prenoms : ''));
    const v = (cle, depuis) => (saisi[cle] != null ? String(saisi[cle]) : String(depuis || ''));
    // « 67000 STRASBOURG » (Authentic) s'écrit « STRASBOURG (67000) », comme dans les courriers de l'étude.
    const lieu = (t) => String(t || '').replace(/^\s*(\d{5})\s+(.+?)\s*$/, '$2 ($1)');
    const lieuNaissance = fiche ? [lieu(fiche.lieuNaissance), fiche.paysNaissance && !/^france$/i.test(fiche.paysNaissance) ? fiche.paysNaissance : ''].filter(Boolean).join(', ') : '';
    const lieuDeces = fiche && fiche.deces ? [lieu(fiche.deces.lieu), fiche.deces.pays && !/^france$/i.test(fiche.deces.pays) ? fiche.deces.pays : ''].filter(Boolean).join(', ') : '';
    const champs = {
      civilite, prenoms, nom: v('nom', fiche ? fiche.nomFamille : (np ? np.nom : '')),
      domicile: v('domicile', fiche && fiche.domicile ? normaliserAdresse(fiche.domicile) : ''),
      naissanceDate: v('naissanceDate', fiche && fiche.dateNaissance), naissanceLieu: v('naissanceLieu', lieuNaissance),
      decesDate: v('decesDate', fiche && fiche.deces && fiche.deces.date), decesLieu: v('decesLieu', lieuDeces),
      conjointLien: v('conjointLien', conj.lien), conjointNom: v('conjointNom', conj.nom),
      // Régime matrimonial (étude 15/10 : fiche succession) : celui de la fiche d'Authentic, sinon saisi.
      regime: v('regime', sm ? [sm.regime, sm.contrat && !/^sans/i.test(sm.contrat) && sm.contrat !== sm.regime ? sm.contrat : ''].filter(Boolean).join(' — ') : '')
    };
    const avertissements = [];
    if (!fiche && comparant) avertissements.push('Défunt indiqué par les comparants d’Authentic ; sa fiche client n’est pas encore lue (date et lieu de décès, domicile, régime) : ouvrez-la dans Authentic ou saisissez ci-dessous.');
    else if (!fiche) avertissements.push('Aucune fiche de défunt n’a été lue dans Authentic (la fiche de la personne décédée, avec sa date de décès) : saisissez-le ci-dessous ou ouvrez sa fiche dans Authentic.');
    if (autres.length && comparant) avertissements.push(`Une autre fiche porte une date de décès (${autres.map(f => f.nom).join(', ')}) : le défunt retenu est celui des comparants d’Authentic.`);
    else if (autres.length) avertissements.push(`Plusieurs fiches portent une date de décès (${[fiche].concat(autres).map(f => f.nom).join(', ')}) : vérifiez que c’est bien le défunt retenu.`);
    if (fiche && !(fiche.deces && fiche.deces.date)) avertissements.push('La date de décès est absente de la fiche.');
    return { champs, source: fiche ? `Fiche Authentic de ${fiche.nom}${comparant ? ' (défunt dans les comparants)' : ''}` : (comparant ? 'Comparants d’Authentic' : ''), avertissements,
      regime: sm ? [sm.regime, sm.contrat && !/^sans/i.test(sm.contrat) && sm.contrat !== sm.regime ? sm.contrat : ''].filter(Boolean).join(' — ') : '', situation: sm ? libelleSituationMatrimoniale(sm) : '' };
  }

  // Pure : les avertissements qui précèdent la génération — donnée absente d'un courrier. [] quand tout est là.
  function manquesConstitution(etat) {
    if (!etat) return [];
    const m = [];
    if (etat.type === 'vente') {
      if (!etat.proprietaires.length) m.push('Aucun vendeur sur la fiche.');
      etat.proprietaires.filter(p => !p.domicile).forEach(p => m.push(`Domicile de ${p.nom} : fiche client d’Authentic non lue (à saisir).`));
      etat.groupes.forEach(g => { if (!g.parcelles.some(p => p.actif)) m.push(`Aucune parcelle retenue à ${g.commune}.`); });
    } else {
      const c = etat.defunt.champs;
      if (!c.nom) m.push('Nom du défunt manquant.');
      if (!c.decesDate) m.push('Date de décès manquante.');
      if (!c.domicile) m.push('Domicile du défunt manquant.');
    }
    return m;
  }

  // ---- Préparation ----

  function dossierConstitution() { return cstEtat ? dossiers.find(x => x.id === cstEtat.dossierId) || null : null; }
  function documentConstitution(id) { return cstEtat ? cstEtat.documents.find(x => x.id === id) || null : null; }

  async function chargerAdressesRetenuesConstitution() {
    try {
      const r = await fetchAvecAuth('/api/constitution/adresses');
      if (r.ok) cstAdressesRetenues = (await r.json()).adresses || {};
    } catch (e) { /* les adresses connues du modèle suffisent */ }
  }

  function initConstitution() {
    if (authToken && !repertoireContacts.length) chargerRepertoire().then(() => { if (cstEtat && cstEtat.type === 'succession') { reconstruireDocumentsConstitution(true); renderConstitution(); } });
    if (authToken) chargerAdressesRetenuesConstitution().then(() => { if (cstEtat) { reconstruireDocumentsConstitution(false); renderConstitution(); } });
    if (typeof chargerModeleAppelFonds === 'function' && !(window.APPEL_FONDS_MODELE && window.APPEL_FONDS_MODELE.assets)) {
      chargerModeleAppelFonds().catch(() => null).then(() => majApercuConstitution());
    }
    renderConstitution();
  }

  function rechercherDossierConstitution(valeur) {
    const boite = document.getElementById('cst-resultats');
    if (!boite) return;
    const q = normaliserPourRecherche(String(valeur || '').trim());
    if (!q) { boite.style.display = 'none'; boite.innerHTML = ''; return; }
    const trouves = dossiers.filter(d => d && !d.deleted && (normaliserPourRecherche(libelleDossierAffiche(d)).includes(q) || normaliserPourRecherche(d.responsable || '').includes(q))).slice(0, 8);
    boite.innerHTML = trouves.length
      ? trouves.map(d => `<button type="button" class="dash-recherche-ligne" onclick="choisirDossierConstitution('${escapeOnclickArg(d.id)}')">
          <span class="dash-recherche-nom">${escapeHtml(libelleDossierAffiche(d))}</span><span class="dash-recherche-resp">${escapeHtml(estSuccession(d) ? 'Succession' : 'Vente')}${d.archive ? ' · archivé' : ''}</span></button>`).join('')
      : '<div class="dash-recherche-vide">Aucun dossier ne correspond.</div>';
    boite.style.display = 'block';
  }

  function ouvrirConstitutionDepuisFiche(id) {
    fermerDossierDrawer();
    definirOnglet('constitution');
    choisirDossierConstitution(id);
  }

  function choisirDossierConstitution(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    // Courriers en préparation (plan cadastral attendu, rangement sur le NAS…) : ils sont faits pour CE dossier — pas de changement avant la fin.
    if (cstEtat && cstEtat.enCours) {
      const enCours = dossiers.find(x => x.id === cstEtat.dossierId);
      afficherToast(`Courriers de ${enCours ? libelleDossierAffiche(enCours) : 'l’autre dossier'} en préparation : attendez la fin pour changer de dossier.`);
      return;
    }
    const type = estSuccession(d) ? 'succession' : 'vente';
    cstEtat = { dossierId: id, type, message: '', formats: { pdf: true, docx: false }, signe: true, sorties: {}, enCours: false, documents: [], proprietaires: [], groupes: [], defunt: null, selection: '', compteur: 0 };
    if (type === 'vente') {
      cstEtat.proprietaires = proprietairesConstitution(d);
      cstEtat.groupes = groupesParcellesConstitution(d).map(g => Object.assign(g, { info: { etat: 'chargement' } }));
      cstEtat.groupes.forEach(g => chargerCommuneConstitution(g));
    } else {
      cstEtat.defunt = defuntConstitution(d);
    }
    reconstruireDocumentsConstitution(true);
    renderConstitution();
  }

  // La commune du groupe : code INSEE, intercommunalité, guichet du CU et de la DIA, fiche de la mairie (serveur).
  async function chargerCommuneConstitution(g) {
    const suivi = cstEtat;
    try {
      const r = await fetchAvecAuth(`/api/constitution/commune?nom=${encodeURIComponent(g.commune)}${g.cp ? '&cp=' + encodeURIComponent(g.cp) : ''}`);
      const j = await r.json().catch(() => ({}));
      if (cstEtat !== suivi) return;
      g.info = r.ok && j.trouvee ? { etat: 'ok', insee: j.insee, epci: j.epci || null, depot: j.depot || null, mairie: j.mairie || null, mairieLue: j.mairieLue !== false }
        : { etat: 'introuvable', ambigu: j.ambigu || [] };
    } catch (e) { if (cstEtat !== suivi) return; g.info = { etat: 'erreur' }; }
    reconstruireDocumentsConstitution(false);
    renderConstitution();
    // Le plan cadastral surligné de la commune, joint à chacun de ses courriers (étude 15/10, client/78) : demandé tout de suite.
    if (g.info.etat === 'ok') lancerPlanConstitution(g.cle, false);
  }

  // Les courriers du dossier. `neuf` : repartir des réglages d'origine ; sinon une adresse déjà modifiée à la main ou une case décochée
  // est gardée (les courriers sont reconnus par leur identifiant).
  function reconstruireDocumentsConstitution(neuf) {
    const e = cstEtat;
    const d = dossierConstitution();
    if (!e || !d) return;
    const anciens = new Map((neuf ? [] : e.documents).map(x => [x.id, x]));
    if (e.type === 'vente') {
      const docs = [];
      e.groupes.forEach(g => {
        const info = g.info || {};
        COURRIERS_VENTE.forEach(c => {
          const circuit = circuitCourrierVente(c.cle, { insee: info.insee, epci: info.epci && info.epci.code });
          const id = `v:${g.cle}:${c.cle}`;
          const ancien = anciens.get(id);
          const lignes = lignesDestinataireVente(circuit, g, info.mairie, cstAdressesRetenues);
          const retenueV = cstAdressesRetenues[circuit.destinataire];
          const courrielDefaut = circuit.courriel || (retenueV && retenueV.courriel) || '';
          const modeDefaut = circuit.mode === 'en-ligne' ? 'en-ligne' : (ancien && ancien.modeChoisi ? ancien.mode : circuit.mode);
          docs.push({ id, genre: 'vente', modele: c.cle, groupe: g.cle, libelle: c.libelle, mode: modeDefaut, modeChoisi: !!(ancien && ancien.modeChoisi),
            courriel: ancien && ancien.modeChoisi ? ancien.courriel : courrielDefaut, emails: courrielDefaut ? [{ libelle: '', adresse: courrielDefaut }] : [], note: circuit.note, destinataire: circuit.destinataire,
            actif: circuit.mode === 'en-ligne' ? false : (ancien ? ancien.actif : true),
            lignes: ancien && ancien.modifie ? ancien.lignes : lignes, modifie: !!(ancien && ancien.modifie), modeleRetenu: circuit.destinataire !== 'mairie' && circuit.destinataire !== 'blois-en-ligne' });
        });
        // Les courriers vierges ajoutés à cette commune restent, à la suite de ses courriers.
        e.documents.filter(x => x.ajoute && x.groupe === g.cle).forEach(x => docs.push(Object.assign({}, x)));
      });
      e.documents = docs;
      return;
    }
    const contacts = typeof repertoireContacts !== 'undefined' ? repertoireContacts : [];
    const defunt = e.defunt.champs;
    const dep = departementDeTexteConstitution(defunt.domicile);
    const construire = (modele, n) => {
      const m = modeleCourrierSuccession(modele);
      const id = `s:${modele}:${n}`;
      const ancien = anciens.get(id);
      let contact = contactPreferePourDefuntConstitution(modele, contacts, defunt);
      let lignes = contact ? adresseCourrierContact(contact) : (m ? m.destinataire.slice() : []);
      let origine = contact ? 'Répertoire' : (lignes.length ? 'Adresse type du modèle' : '');
      if (modele === 'ehpad') {
        const etab = etablissementDansDomicileConstitution(defunt.domicile);
        if (etab) { lignes = etab.lignes; origine = 'Domicile du défunt (établissement cité)'; }
      }
      const retenue = cstAdressesRetenues['succession-' + modele];
      if (!contact && retenue && retenue.lignes && retenue.lignes.length) { lignes = retenue.lignes.slice(); origine = 'Adresse retenue par l’étude'; }
      const horsDep = !contact && m && m.destinataire.length && dep && dep !== '41' && ['impots', 'cpam', 'msa', 'carsat'].includes(modele);
      // Par email dès qu'une adresse est connue (étude 15/10 : banques, impôts, CARSAT, MSA « quasiment que par mail ») ; sinon papier.
      const contactRetenu = ancien && ancien.contactId ? contacts.find(c => c && c.id === ancien.contactId) : contact;
      const emails = contactRetenu ? emailsContactConstitution(contactRetenu) : (retenue && retenue.courriel ? [{ libelle: '', adresse: retenue.courriel }] : []);
      const envoi = ancien && ancien.modeChoisi ? { mode: ancien.mode, courriel: ancien.courriel } : { mode: emails.length ? 'courriel' : 'papier', courriel: emails.length ? emails[0].adresse : '' };
      return { id, genre: 'succession', modele, libelle: m ? m.libelle : modele, mode: envoi.mode, courriel: envoi.courriel, emails, modeChoisi: !!(ancien && ancien.modeChoisi), note: horsDep ? 'Adresse type du Loir-et-Cher : à vérifier pour un défunt domicilié ailleurs.' : '', destinataire: modele,
        actif: ancien ? ancien.actif : ORDRE_SUCCESSION_PAR_DEFAUT.includes(modele), lignes: ancien && ancien.modifie ? ancien.lignes : lignes, origine: ancien && ancien.modifie ? 'Saisi à la main' : origine,
        modifie: !!(ancien && ancien.modifie), contactId: ancien && ancien.contactId ? ancien.contactId : (contact ? contact.id : '') };
    };
    const docs = [];
    ORDRE_SUCCESSION_PAR_DEFAUT.forEach(modele => docs.push(construire(modele, 1)));
    // Les courriers ajoutés (un second établissement bancaire, la mutuelle) restent.
    e.documents.filter(x => x.ajoute).forEach(x => {
      const apres = docs.map(y => y.modele).lastIndexOf(x.modele);
      docs.splice(apres >= 0 ? apres + 1 : docs.length, 0, Object.assign({}, x));
    });
    e.documents = docs;
  }

  // ---- Contenu et fichiers ----

  function groupeDuDocumentConstitution(doc) { return cstEtat.groupes.find(g => g.cle === doc.groupe) || null; }

  // Le courrier décrit ligne à ligne comme le modèle de l'étude (commun/constitution.js, commun/courriers-succession.js) : il donne le
  // Word, le PDF, l'aperçu et le texte de l'email (client/73-courrier-fidele.js).
  function documentFideleConstitution(doc) {
    const d = dossierConstitution();
    const dateIso = isoAujourdhuiLocal();
    if (doc.genre === 'vente') {
      const g = groupeDuDocumentConstitution(doc) || { parcelles: [], adresseImmeuble: '' };
      const parcelles = g.parcelles.filter(p => p.actif).map(p => ({ prefixe: p.prefixe, section: p.section, numero: p.numero, lieuDit: p.lieuDit, surface: p.surface }));
      return documentCourrierVente(doc.modele, { destinataire: doc.lignes, dateLettre: dateCourrierSuccession(dateIso), adresseImmeuble: g.adresseImmeuble, parcelles, texteLibre: doc.texteLibre || '',
        proprietaires: cstEtat.proprietaires.map(p => ({ civilite: p.civilite, nom: p.nom, domicile: p.domicile, morale: p.morale })), reference: d.referenceAuthentic || '', nomDossier: libelleDossierAffiche(d) });
    }
    return documentCourrierSuccession(doc.modele, { destinataire: doc.lignes, envoiParMail: false, dateIso, defunt: cstEtat.defunt.champs, texteLibre: doc.texteLibre || '' });
  }

  function nomFichierDocumentConstitution(doc) {
    const d = dossierConstitution();
    const memes = cstEtat.documents.filter(x => x.modele === doc.modele && x.genre === doc.genre && x.groupe === doc.groupe);
    if (doc.genre === 'vente') {
      const commune = (groupeDuDocumentConstitution(doc) || {}).commune || '';
      const base = doc.modele === 'autre' ? [`Courrier ${doc.libelle}`, commune, libelleDossierAffiche(d)].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
        : nomFichierCourrierVente(doc.modele, commune, libelleDossierAffiche(d));
      return base + (memes.length > 1 ? ` (${memes.indexOf(doc) + 1})` : '');
    }
    const rang = memes.indexOf(doc) + 1;
    return nomFichierCourrierSuccession(doc.modele, libelleDossierAffiche(d)) + (memes.length > 1 ? ` (${rang})` : '');
  }

  // Un courrier dans un format : { blob, nom, format }.
  async function genererDocumentConstitution(doc, format) {
    const d = dossierConstitution();
    const nom = nomFichierDocumentConstitution(doc);
    const fidele = documentFideleConstitution(doc);
    // Signé : tampon de l'office et signature « p/o » ; non signé : le même courrier sans eux (étude 15/10 : « signé ou non signé »).
    const signe = !cstEtat || cstEtat.signe !== false;
    if (format === 'pdf') {
      const { blob } = await genererPdfAAppelFonds(null, nom + '.docx', { fidele, refLignes: refLignesCourrier(d), ref: d.nom || '', signe });
      return { blob, nom: nom + '.pdf', format };
    }
    const blob = await docxCourrierFidele(fidele, d, { signe });
    return { blob, nom: nom + '.docx', format };
  }

  // Pure : les PDF mis bout à bout (une impression d'un seul geste), via pdf-lib.
  async function fusionnerPdfConstitution(blobs) {
    const { PDFDocument } = window.PDFLib;
    const sortie = await PDFDocument.create();
    for (const b of blobs) {
      const src = await PDFDocument.load(await b.arrayBuffer());
      (await sortie.copyPages(src, src.getPageIndices())).forEach(p => sortie.addPage(p));
    }
    return new Blob([await sortie.save()], { type: 'application/pdf' });
  }

  // ---- Actions de l'écran ----

  function majMessageConstitution(texte) {
    if (!cstEtat) return;
    cstEtat.message = texte;
    const m = document.getElementById('cst-message');
    if (m) m.textContent = texte;
  }

  function cstDefunt(champ, valeur) {
    if (!cstEtat || !cstEtat.defunt || !(champ in cstEtat.defunt.champs)) return;
    cstEtat.defunt.champs[champ] = String(valeur == null ? '' : valeur);
    if (champ === 'domicile') { reconstruireDocumentsConstitution(false); }
  }
  function cstDefuntFin() { reconstruireDocumentsConstitution(false); renderConstitution(); }

  function cstProprietaire(i, champ, valeur) {
    const p = cstEtat && cstEtat.proprietaires[i];
    if (!p || !['civilite', 'nom', 'domicile'].includes(champ)) return;
    p[champ] = String(valeur == null ? '' : valeur);
    if (champ === 'domicile') p.source = p.domicile ? 'Saisi' : '';
  }
  function cstAjouterProprietaire() { if (cstEtat) { cstEtat.proprietaires.push({ civilite: 'Madame', nom: '', domicile: '', morale: false, source: '' }); renderConstitution(); } }
  function cstRetirerProprietaire(i) { if (cstEtat) { cstEtat.proprietaires.splice(i, 1); renderConstitution(); } }

  function cstGroupe(cle, champ, valeur) {
    const g = cstEtat && cstEtat.groupes.find(x => x.cle === cle);
    if (g && champ === 'adresseImmeuble') g.adresseImmeuble = String(valeur || '');
  }
  function cstParcelleActive(cle, i, actif) {
    const g = cstEtat && cstEtat.groupes.find(x => x.cle === cle);
    if (g && g.parcelles[i]) { g.parcelles[i].actif = !!actif; renderConstitution(); }
  }
  function cstAjouterParcelle(cle) {
    const g = cstEtat && cstEtat.groupes.find(x => x.cle === cle);
    if (!g) return;
    const val = (suffixe) => String((document.getElementById(`cst-np-${suffixe}-${cle}`) || {}).value || '').trim();
    const section = val('section').toUpperCase();
    const numero = val('numero').replace(/^0+(?=\d)/, '');
    if (!section || !numero) { afficherToast('Section et numéro de la parcelle à saisir.'); return; }
    if (g.parcelles.some(p => p.section === section && p.numero === numero)) { afficherToast('Cette parcelle est déjà dans la liste.'); return; }
    g.parcelles.push({ prefixe: '', section, numero, lieuDit: val('lieudit'), surface: val('surface'), actif: true, origine: 'Saisie' });
    renderConstitution();
  }
  function cstAjouterCommune() {
    if (!cstEtat || cstEtat.type !== 'vente') return;
    const nom = String((document.getElementById('cst-nc-nom') || {}).value || '').trim();
    const cp = String((document.getElementById('cst-nc-cp') || {}).value || '').trim();
    if (!nom) { afficherToast('Nom de la commune à saisir.'); return; }
    const cle = normaliserPourRecherche(nom).replace(/[^a-z0-9]+/g, ' ').replace(/\bsaint(e?)\b/g, 'st$1').trim();
    if (cstEtat.groupes.some(g => g.cle === cle)) { afficherToast('Cette commune est déjà dans la liste.'); return; }
    const g = { cle, commune: nom.toUpperCase(), cp, principale: false, adresseImmeuble: `${nom.toUpperCase()}${cp ? ` (${cp})` : ''}`, parcelles: [], info: { etat: 'chargement' } };
    cstEtat.groupes.push(g);
    chargerCommuneConstitution(g);
    renderConstitution();
  }

  function cstBasculerDoc(id, actif) { const x = documentConstitution(id); if (x) { x.actif = !!actif; renderConstitution(); } }
  function cstLignesDoc(id, texte) {
    const x = documentConstitution(id);
    if (!x) return;
    x.lignes = String(texte || '').split('\n').map(l => l.trim()).filter(Boolean);
    x.modifie = true;
    x.origine = 'Saisi à la main';
  }
  function cstChoisirContact(id, contactId) {
    const x = documentConstitution(id);
    if (!x) return;
    const c = repertoireContacts.find(y => y && y.id === contactId);
    if (!c) return;
    x.lignes = adresseCourrierContact(c);
    x.modifie = true;
    x.origine = 'Répertoire';
    x.contactId = c.id;
    x.emails = emailsContactConstitution(c);
    if (!x.modeChoisi || x.mode === 'courriel') {
      x.courriel = x.emails.length ? x.emails[0].adresse : (x.mode === 'courriel' ? x.courriel : '');
      if (!x.modeChoisi) x.mode = x.emails.length ? 'courriel' : 'papier';
    }
    renderConstitution();
  }
  // Un courrier de succession de plus (la mutuelle, une seconde banque) : destinataire vide, à chercher dans le répertoire.
  function ajouterDocSuccessionConstitution(modele, vide) {
    const m = modeleCourrierSuccession(modele);
    if (!m) return null;
    cstEtat.compteur = (cstEtat.compteur || 0) + 1;
    const doc = { id: `s:${modele}:a${cstEtat.compteur}`, genre: 'succession', modele, libelle: m.libelle, mode: 'papier', courriel: '', emails: [], note: '', destinataire: modele, actif: true,
      lignes: vide ? [] : m.destinataire.slice(), origine: !vide && m.destinataire.length ? 'Adresse type du modèle' : '', modifie: !!vide, ajoute: true, contactId: '',
      texteLibre: modele === 'autre' ? TEXTE_LIBRE_PAR_DEFAUT : '' };
    const dernier = cstEtat.documents.map(x => x.modele).lastIndexOf(modele);
    cstEtat.documents.splice(dernier >= 0 ? dernier + 1 : cstEtat.documents.length, 0, doc);
    cstEtat.selection = doc.id;
    return doc;
  }
  function cstAjouterDoc() {
    if (!cstEtat || cstEtat.type !== 'succession') return;
    const modele = String((document.getElementById('cst-ajout-modele') || {}).value || '');
    if (ajouterDocSuccessionConstitution(modele, false)) renderConstitution();
  }
  function cstDupliquerDoc(id) {
    const x = documentConstitution(id);
    if (!x || x.genre !== 'succession') return;
    if (ajouterDocSuccessionConstitution(x.modele, true)) { renderConstitution(); const q = document.getElementById('cst-rep-q'); if (q) q.focus(); }
  }
  // Un courrier vierge à un autre organisme pour une commune d'une vente (étude 15/10 : « des courriers vierges, juste autre organisme »).
  function cstAjouterViergeVente(cleGroupe) {
    if (!cstEtat || cstEtat.type !== 'vente' || !cstEtat.groupes.some(g => g.cle === cleGroupe)) return;
    cstEtat.compteur = (cstEtat.compteur || 0) + 1;
    const doc = { id: `v:${cleGroupe}:autre:a${cstEtat.compteur}`, genre: 'vente', modele: 'autre', groupe: cleGroupe, libelle: 'Autre organisme', mode: 'papier', modeChoisi: false, courriel: '', emails: [],
      note: '', destinataire: 'autre', actif: true, lignes: [], modifie: true, modeleRetenu: false, ajoute: true, texteLibre: '' };
    const dernier = cstEtat.documents.map(x => x.groupe).lastIndexOf(cleGroupe);
    cstEtat.documents.splice(dernier >= 0 ? dernier + 1 : cstEtat.documents.length, 0, doc);
    cstEtat.selection = doc.id;
    renderConstitution();
    const q = document.getElementById('cst-rep-q');
    if (q) q.focus();
  }
  function cstTexteLibre(id, valeur) {
    const x = documentConstitution(id);
    if (!x || x.modele !== 'autre') return;
    x.texteLibre = String(valeur == null ? '' : valeur);
    majApercuConstitution();
  }
  function cstRetirerDoc(id) {
    if (!cstEtat) return;
    cstEtat.documents = cstEtat.documents.filter(x => !(x.id === id && x.ajoute));
    if (cstEtat.selection === id) cstEtat.selection = '';
    renderConstitution();
  }
  function cstFormat(format, actif) { if (cstEtat && cstEtat.formats[format] !== undefined) { cstEtat.formats[format] = !!actif; renderConstitution(); } }

  // Retient l'adresse saisie d'un destinataire (organisme) pour la prochaine fois — jamais une adresse de client.
  async function cstRetenirAdresse(id) {
    const x = documentConstitution(id);
    if (!x || !x.lignes.length) return;
    const cle = x.genre === 'vente' ? x.destinataire : 'succession-' + x.modele;
    if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(cle)) return;
    try {
      const r = await fetchAvecAuth('/api/constitution/adresses/' + cle, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lignes: x.lignes, courriel: x.courriel || '', par: utilisateurPoste || '' }) });
      if (!r.ok) throw new Error(String(r.status));
      cstAdressesRetenues[cle] = { lignes: x.lignes.slice(), courriel: x.courriel || '' };
      afficherToast('Adresse retenue : elle sera proposée la prochaine fois.');
    } catch (e) { afficherToast('Adresse non retenue : serveur injoignable.'); }
  }

  // ---- Sortie ----

  function documentsAGenererConstitution() { return cstEtat ? cstEtat.documents.filter(x => x.actif && x.mode !== 'en-ligne') : []; }
  function formatsChoisisConstitution() { return ['pdf', 'docx'].filter(f => cstEtat && cstEtat.formats[f]); }

  // Retient sur la fiche du défunt ce qui a été corrigé à la main par rapport à Authentic (le reste continue de suivre Authentic).
  function retenirDefuntSaisiConstitution() {
    const d = dossierConstitution();
    if (!d || !cstEtat || cstEtat.type !== 'succession') return;
    const base = defuntConstitution(Object.assign({}, d, { defunt: null })).champs;
    const saisi = {};
    Object.keys(cstEtat.defunt.champs).forEach(k => { if (String(cstEtat.defunt.champs[k] || '') !== String(base[k] || '')) saisi[k] = cstEtat.defunt.champs[k]; });
    if (JSON.stringify(saisi) !== JSON.stringify(d.defunt || {})) { if (Object.keys(saisi).length) d.defunt = saisi; else delete d.defunt; sauvegarder(d); }
  }

  async function genererConstitution(action) {
    const e = cstEtat;
    const d = dossierConstitution();
    if (!e || !d || e.enCours) return;
    const docs = documentsAGenererConstitution();
    const formats = action === 'imprimer' ? ['pdf'] : formatsChoisisConstitution();
    if (!docs.length) { afficherToast('Aucun courrier coché.'); return; }
    if (!formats.length) { afficherToast('Choisissez PDF ou Word.'); return; }
    e.enCours = true;
    renderConstitution();
    retenirDefuntSaisiConstitution();
    const fichiers = [];
    try {
      // Plan cadastral surligné de chaque commune (client/78), joint à ses courriers.
      const plans = await plansDesCourriersConstitution(docs);
      for (const doc of docs) {
        for (const f of formats) {
          majMessageConstitution(`Préparation de « ${doc.libelle} »${doc.groupe ? ' — ' + ((groupeDuDocumentConstitution(doc) || {}).commune || '') : ''} (${f === 'pdf' ? 'PDF' : 'Word'})…`);
          const s = await genererDocumentConstitution(doc, f);
          e.sorties[doc.id] = Object.assign({}, e.sorties[doc.id], { [f]: s });
          fichiers.push(s);
        }
      }
      noterVerificationPoste('constitution-courriers', { detail: `${docs.length} courrier${docs.length > 1 ? 's' : ''}` });
      if (formats.includes('pdf')) noterVerificationPoste('constitution-pdf', { detail: 'PDF/A signé' });
      ajouterHistorique(d, `Courriers de constitution de dossier préparés : ${docs.map(x => x.libelle + (x.groupe ? ' (' + ((groupeDuDocumentConstitution(x) || {}).commune || '') + ')' : '')).join(', ')}`);
      sauvegarder(d);
      // Le plan d'une commune une fois dans les fichiers (enregistrés, téléchargés).
      plans.forEach(liste => liste.forEach(p => fichiers.push({ blob: p.blob, nom: p.nom, format: 'pdf' })));
      if (action === 'imprimer') {
        // Chaque courrier suivi du plan cadastral de sa commune.
        const pdfs = docs.filter(x => x.mode !== 'courriel').flatMap(x => {
          const courrier = e.sorties[x.id] && e.sorties[x.id].pdf && e.sorties[x.id].pdf.blob;
          return courrier ? [courrier].concat((plans.get(x.groupe) || []).map(p => p.blob)) : [];
        });
        if (!pdfs.length) { majMessageConstitution('Cochez « PDF » pour imprimer.'); }
        else { const fusion = await fusionnerPdfConstitution(pdfs); window.open(URL.createObjectURL(fusion), '_blank'); majMessageConstitution(`${pdfs.length} courrier${pdfs.length > 1 ? 's' : ''} dans un seul PDF, ouvert pour l’impression.`); }
      } else if (action === 'ranger') {
        await rangerConstitution(fichiers);
      } else if (fichiers.length === 1) {
        telechargerFichier(fichiers[0].blob, fichiers[0].nom);
        majMessageConstitution('Fichier téléchargé.');
      } else {
        const zip = new window.PizZip();
        for (const s of fichiers) zip.file(s.nom, await s.blob.arrayBuffer());
        telechargerFichier(zip.generate({ type: 'blob', mimeType: 'application/zip' }), `Constitution - ${libelleDossierAffiche(d)}.zip`.replace(/[\\/:*?"<>|]+/g, ' '));
        majMessageConstitution(`${fichiers.length} fichiers dans une archive téléchargée.`);
      }
    } catch (err) {
      console.error('Constitution de dossier :', err);
      noterVerificationPoste('constitution-courriers', { ok: false, message: 'génération impossible' });
      majMessageConstitution('Génération impossible : ' + (err && err.message ? err.message : 'erreur') + ' (la première fois, le poste doit pouvoir télécharger les bibliothèques PDF et Word).');
    }
    e.enCours = false;
    renderConstitution();
  }

  async function rangerConstitution(fichiers) {
    const d = dossierConstitution();
    if (!d || !d.nasDossier) { majMessageConstitution('Ce dossier n’est pas relié au NAS : rien n’a été rangé.'); return; }
    let ranges = 0;
    for (const s of fichiers) {
      majMessageConstitution(`Rangement de « ${s.nom} » dans le dossier du NAS…`);
      const r = await fetchAvecAuth('/api/nas/deposer-document', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierId: d.id, nom: s.nom.replace(/\.(pdf|docx)$/i, ''), contenu: await base64DepuisBlob(s.blob), format: s.format, sousDossier: 'Constitution' }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erreur || `le serveur a répondu ${r.status}`); }
      ranges++;
    }
    ajouterHistorique(d, `${ranges} courrier${ranges > 1 ? 's' : ''} de constitution de dossier enregistré${ranges > 1 ? 's' : ''} dans le dossier « Constitution » du NAS`);
    sauvegarder(d);
    majMessageConstitution(`${ranges} fichier${ranges > 1 ? 's' : ''} enregistré${ranges > 1 ? 's' : ''} dans « Constitution », dans le dossier du NAS.`);
    afficherToast(`${ranges} courrier${ranges > 1 ? 's' : ''} dans le dossier « Constitution » du NAS.`);
  }

  async function telechargerDocumentConstitution(id, format) {
    const doc = documentConstitution(id);
    if (!doc || !cstEtat || cstEtat.enCours) return;
    try {
      retenirDefuntSaisiConstitution();
      const s = await genererDocumentConstitution(doc, format);
      cstEtat.sorties[id] = Object.assign({}, cstEtat.sorties[id], { [format]: s });
      telechargerFichier(s.blob, s.nom);
      if (format === 'pdf') noterVerificationPoste('constitution-pdf', { detail: 'PDF/A signé' });
    } catch (err) { console.error(err); afficherToast('Courrier impossible à préparer : ' + (err && err.message ? err.message : 'erreur')); }
  }

  // Pure : les adresses email d'un contact du répertoire — « Libellé : adresse » gardé en libellé. [{ libelle, adresse }].
  function emailsContactConstitution(c) {
    return ((c && c.emails) || []).map(e => {
      const t = String(e || '').trim();
      const m = /^(.*?)\s*:\s*([^\s:]+@[^\s:]+)$/.exec(t);
      return m ? { libelle: m[1].trim(), adresse: m[2] } : { libelle: '', adresse: t };
    }).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.adresse));
  }

  // Pure : le texte d'un courrier pour le corps d'un email (étude 15/10 : « reprendre le contenu du courrier, juste le contenu texte, sans
  // l'en-tête ») — sans destinataire, ni « Blois, le … », ni « Me … » (la signature de l'email la remplace) ; le tableau des parcelles en
  // lignes ; le questionnaire d'assainissement n'est pas repris : `suite` le dit, le PDF est alors joint.
  function corpsEmailCourrierConstitution(fidele) {
    return { texte: texteCorpsDocument(fidele), suite: !!(fidele && fidele.questionnaire) };
  }

  // Pure : l'objet de l'email d'un courrier.
  function objetEmailConstitution(doc, d, defunt, groupe) {
    const ref = d && d.referenceAuthentic ? ` — Réf. ${d.referenceAuthentic}` : '';
    if (doc.genre === 'succession' && defunt) {
      const qui = [defunt.civilite, defunt.prenoms, defunt.nom].filter(Boolean).join(' ');
      return `Succession de ${qui || 'à compléter'}${ref}`;
    }
    return `${doc.modele === 'autre' ? 'Demande de renseignements' : doc.libelle}${groupe && groupe.adresseImmeuble ? ' — ' + groupe.adresseImmeuble : ''}${ref}`;
  }

  // Un courrier par email : le texte du courrier dans le corps, la fenêtre d'email s'ouvre pour relire et envoyer (rien ne part seul).
  async function emailDocumentConstitution(id) {
    const e = cstEtat;
    const doc = documentConstitution(id);
    const d = dossierConstitution();
    if (!doc || !d) return { ok: false };
    if (!doc.courriel) { afficherToast('Adresse email du destinataire à saisir.'); return { ok: false }; }
    try {
      retenirDefuntSaisiConstitution();
      const { texte, suite } = corpsEmailCourrierConstitution(documentFideleConstitution(doc));
      const pieces = [];
      if (suite || cstEtat.joindrePdf) {
        const s = await genererDocumentConstitution(doc, 'pdf');
        pieces.push({ nom: s.nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(s.blob) });
      }
      // Courrier de vente : le plan cadastral surligné de la commune joint (étude 15/10).
      if (doc.genre === 'vente') {
        const g = groupeDuDocumentConstitution(doc);
        if (g && g.plan && g.plan.etat !== 'fini') majMessageConstitution(`Plan cadastral de ${g.commune} : attente de cadastre.gouv.fr…`);
        for (const p of await plansPdfConstitution(g)) pieces.push({ nom: p.nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(p.blob) });
      }
      // Un autre dossier choisi pendant l'attente : rien n'est préparé avec un mélange des deux.
      if (cstEtat !== e) return { ok: false };
      const r = await livrerEmailDossier({ destinataire: doc.courriel, sujet: objetEmailConstitution(doc, d, cstEtat.defunt && cstEtat.defunt.champs, groupeDuDocumentConstitution(doc)),
        corps: texte + (suite ? '\n\nVous trouverez ci-joint le questionnaire à nous retourner.' : ''), pieces, responsableSignature: d.responsable, dossierId: d.id, geste: 'constitution' });
      if (r && r.ok) {
        doc.envoyeLe = new Date().toISOString();
        ajouterHistorique(d, `Courrier « ${doc.libelle} » préparé par email pour ${doc.courriel}`);
        sauvegarder(d);
        renderConstitution();
      }
      return r || { ok: false };
    } catch (err) { console.error(err); afficherToast('Email impossible à préparer : ' + (err && err.message ? err.message : 'erreur')); return { ok: false }; }
  }

  // Tous les courriers cochés « par email », l'un après l'autre (chaque fenêtre se relit et s'envoie ; « Annuler » arrête la série).
  async function emailsConstitution() {
    if (!cstEtat || cstEtat.enCours) return;
    const docs = documentsAGenererConstitution().filter(x => x.mode === 'courriel');
    if (!docs.length) { afficherToast('Aucun courrier coché par email.'); return; }
    const e = cstEtat;
    let faits = 0;
    e.enCours = true;
    try {
      for (const doc of docs) {
        e.selection = doc.id;
        renderConstitution();
        const r = await emailDocumentConstitution(doc.id);
        if (!r || !r.ok) break;
        faits++;
      }
    } finally { e.enCours = false; }
    renderConstitution();
    majMessageConstitution(`${faits} email${faits > 1 ? 's' : ''} sur ${docs.length} préparé${faits > 1 ? 's' : ''}.`);
  }

  function cstModeEnvoi(id, mode) {
    const x = documentConstitution(id);
    if (!x || x.mode === 'en-ligne' || !['papier', 'courriel'].includes(mode)) return;
    x.mode = mode;
    x.modeChoisi = true;
    if (mode === 'courriel' && !x.courriel && x.emails && x.emails.length) x.courriel = x.emails[0].adresse;
    renderConstitution();
  }
  function cstCourriel(id, valeur) {
    const x = documentConstitution(id);
    if (!x) return;
    x.courriel = String(valeur || '').trim();
    x.modeChoisi = true;
    majItemConstitution();
  }

  // ---- Affichage ----
  // Deux colonnes (étude 15/10 : « moins haut, regarder les courriers sur la droite, comme l'appel de fonds ») : à gauche le dossier,
  // ses données repliées et la liste compacte des courriers ; à droite le courrier choisi — destinataire, recherche dans le répertoire —
  // et son aperçu sur le papier de l'office.

  function puceSourceConstitution(source) {
    return source ? `<span class="dot-label dl-success cst-source" title="Repris de la fiche client d’Authentic"><span class="dot"></span>${escapeHtml(source)}</span>`
      : '<span class="dot-label dl-urgent cst-source" title="Authentic ne donne rien : à saisir"><span class="dot"></span>À compléter</span>';
  }

  function champConstitution(libelle, valeur, gestionnaire, extra) {
    const o = extra || {};
    return `<div class="calc-champ${o.large ? ' cst-large' : ''}"><label>${escapeHtml(libelle)}</label>
      <input type="${o.type || 'text'}" class="prop-champ" value="${escapeAttr(valeur)}" placeholder="${escapeAttr(o.placeholder || '')}" oninput="${gestionnaire}(this.value)"${o.fin ? ` onchange="${o.fin}"` : ''}></div>`;
  }

  function renderDossierConstitution(d) {
    const recherche = `<div class="pr-dossier-recherche-bloc cst-recherche"><input type="search" id="cst-recherche" class="nas-choix-recherche" autocomplete="off" placeholder="${d ? 'Changer de dossier…' : 'Rechercher un dossier de vente ou de succession…'}" oninput="rechercherDossierConstitution(this.value)" aria-label="Rechercher un dossier"><div id="cst-resultats" class="dash-recherche-resultats" style="display:none;"></div></div>`;
    if (!d) return `<div class="cst-barre">${recherche}</div><p class="hint cst-vide">Rattachez un dossier : ses parties, son bien et ses références viennent de sa fiche, qui tient les données d’Authentic.</p>`;
    const typeTexte = cstEtat.type === 'succession' ? 'Succession' : 'Vente';
    return `<div class="cst-barre">
        <div class="cst-dossier">
          <strong class="cst-dossier-titre">${escapeHtml(libelleDossierAffiche(d))}</strong>
          <span class="dot-label dl-neutre"><span class="dot"></span>${typeTexte}</span>
          <span class="cst-dossier-info">Réf. <strong>${escapeHtml(d.referenceAuthentic || '—')}</strong></span>
          <span class="cst-dossier-info">${escapeHtml(d.responsable || '—')}</span>
          <span class="cst-dossier-info">NAS <strong>${d.nasDossier ? 'relié' : 'non relié'}</strong></span>
          <wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">Ouvrir la fiche</wa-button>
        </div>${recherche}</div>`;
  }

  // Pure : le résumé d'une ligne des données (le volet replié) — « 2 vendeurs · 3 parcelles · 2 communes ».
  function resumeDonneesConstitution(e) {
    if (!e) return '';
    if (e.type === 'vente') {
      const parcelles = e.groupes.reduce((n, g) => n + g.parcelles.filter(p => p.actif).length, 0);
      return [`${e.proprietaires.length} vendeur${e.proprietaires.length > 1 ? 's' : ''}`, `${parcelles} parcelle${parcelles > 1 ? 's' : ''}`, `${e.groupes.length} commune${e.groupes.length > 1 ? 's' : ''}`].join(' · ');
    }
    const c = e.defunt.champs;
    return [[c.prenoms, c.nom].filter(Boolean).join(' ') || 'Défunt à saisir', c.decesDate ? 'décès le ' + formatDateFr(c.decesDate) : 'date de décès à saisir'].join(' · ');
  }

  function renderDonneesVenteConstitution(d) {
    const e = cstEtat;
    const proprios = e.proprietaires.map((p, i) => `<div class="cst-ligne">
        <select class="prop-champ cst-civilite" onchange="cstProprietaire(${i}, 'civilite', this.value); majApercuConstitution()" aria-label="Civilité">${['', 'Monsieur', 'Madame', 'Mademoiselle'].map(c => `<option value="${c}"${p.civilite === c ? ' selected' : ''}>${c ? c.replace('Monsieur', 'M.').replace('Mademoiselle', 'Mlle').replace('Madame', 'Mme') : '—'}</option>`).join('')}</select>
        <input type="text" class="prop-champ" value="${escapeAttr(p.nom)}" oninput="cstProprietaire(${i}, 'nom', this.value); majApercuConstitution()" aria-label="Nom du vendeur">
        <input type="text" class="prop-champ cst-domicile" value="${escapeAttr(p.domicile)}" placeholder="${p.morale ? 'Siège de la société' : 'Domicile : COMMUNE (CP), voie'}" oninput="cstProprietaire(${i}, 'domicile', this.value); majApercuConstitution()" aria-label="Domicile" title="${escapeAttr(p.source ? 'Domicile repris de la fiche client d’Authentic' : 'Domicile à saisir')}">
        <span class="cst-pastille ${p.source ? 'ok' : 'manque'}" title="${p.source ? 'Repris d’Authentic' : 'À compléter'}"></span>
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone" title="Retirer ce vendeur" onclick="cstRetirerProprietaire(${i})">${icone('x')}</wa-button></div>`).join('');
    const groupes = e.groupes.map(g => {
      const info = g.info || {};
      const etat = info.etat === 'chargement' ? '<span class="hint">recherche…</span>'
        : info.etat === 'ok' ? `<span class="hint">INSEE ${escapeHtml(info.insee)}${info.epci ? ' · ' + escapeHtml(info.epci.nom) : ''}</span>`
        : '<span class="dot-label dl-urgent"><span class="dot"></span>Commune non retrouvée</span>';
      const lignes = g.parcelles.map((p, i) => `<label class="cst-parcelle${p.actif ? '' : ' cst-off'}"><input type="checkbox"${p.actif ? ' checked' : ''} onchange="cstParcelleActive('${escapeOnclickArg(g.cle)}', ${i}, this.checked)">
          <span class="cst-parcelle-ref">${escapeHtml([p.prefixe, p.section, p.numero].filter(Boolean).join(' '))}</span><span class="cst-parcelle-lieu">${escapeHtml(p.lieuDit)}</span><span class="cst-parcelle-surf">${escapeHtml(/^\s*\d+\s*$/.test(String(p.surface || '')) ? contenanceDepuisCentiares(Number(p.surface)) : p.surface)}</span>
          <span class="cst-pastille ${p.origine === 'Saisie' ? 'manque' : 'ok'}" title="${escapeAttr(p.origine)}"></span></label>`).join('');
      const k = escapeOnclickArg(g.cle);
      const idc = escapeAttr(g.cle);
      return `<div class="cst-commune"><div class="cst-commune-tete"><strong>${escapeHtml(g.commune)}${g.cp ? ' (' + escapeHtml(g.cp) + ')' : ''}</strong> ${etat}</div>
        <input type="text" class="prop-champ" value="${escapeAttr(g.adresseImmeuble)}" oninput="cstGroupe('${k}', 'adresseImmeuble', this.value); majApercuConstitution()" aria-label="Adresse de l’immeuble dans les courriers" title="Adresse de l’immeuble, telle qu’elle s’écrit dans les courriers">
        <div class="cst-parcelles">${lignes || '<p class="hint">Aucune parcelle relevée dans Authentic : ajoutez-la.</p>'}</div>
        ${renderPlanCommuneConstitution(g)}
        <div class="cst-ajout cst-ajout-parcelle"><input type="text" class="prop-champ" id="cst-np-section-${idc}" placeholder="Sect." maxlength="3" aria-label="Section"><input type="text" class="prop-champ" id="cst-np-numero-${idc}" placeholder="N°" maxlength="5" aria-label="Numéro">
          <input type="text" class="prop-champ" id="cst-np-lieudit-${idc}" placeholder="Lieu-dit" aria-label="Lieu-dit"><input type="text" class="prop-champ" id="cst-np-surface-${idc}" placeholder="5 a 12 ca" aria-label="Contenance">
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone" title="Ajouter la parcelle" onclick="cstAjouterParcelle('${k}')">+</wa-button></div></div>`;
    }).join('');
    return `<div class="cst-bloc-titre">Vendeurs ${infoBulle('Tous les vendeurs de la fiche, avec le domicile de leur fiche client d’Authentic (pastille verte). Pastille rouge : à saisir.')}</div>
      ${proprios || '<p class="hint">Aucun vendeur sur la fiche.</p>'}
      <wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="cstAjouterProprietaire()">+ Vendeur</wa-button>
      <div class="cst-bloc-titre">Parcelles par commune ${infoBulle('Toutes les parcelles de tous les immeubles d’Authentic. Une série de courriers par commune.')}</div>${groupes}
      <div class="cst-ajout"><input type="text" class="prop-champ" id="cst-nc-nom" placeholder="Autre commune" aria-label="Autre commune"><input type="text" class="prop-champ cst-cp" id="cst-nc-cp" placeholder="CP" maxlength="5" aria-label="Code postal">
        <wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="cstAjouterCommune()">+ Commune</wa-button></div>`;
  }

  function renderDonneesSuccessionConstitution() {
    const df = cstEtat.defunt;
    const c = df.champs;
    const civ = `<div class="calc-champ"><label>Civilité</label><select class="prop-champ" onchange="cstDefunt('civilite', this.value); cstDefuntFin()"><option${c.civilite === 'Madame' ? ' selected' : ''}>Madame</option><option${c.civilite === 'Monsieur' ? ' selected' : ''}>Monsieur</option></select></div>`;
    const f = (champ, libelle, type, placeholder, large) => champConstitution(libelle, c[champ], `cstDefuntApercu.bind(null, '${champ}')`, { type, placeholder, large, fin: 'cstDefuntFin()' });
    return `<p class="cst-source-ligne">${puceSourceConstitution(df.source)}${df.regime || df.situation ? ` <span class="hint">${escapeHtml(df.situation || '')}${df.regime ? ' · régime : ' : ''}${df.regime ? `<strong>${escapeHtml(df.regime)}</strong>` : ''}</span>` : ' <span class="hint">Régime matrimonial non renseigné dans Authentic.</span>'}</p>
      ${df.avertissements.map(a => `<p class="cst-alerte">${escapeHtml(a)}</p>`).join('')}
      <div class="calc-champs cst-grille">${civ}${f('prenoms', 'Prénoms', 'text', 'Alice Marcelle')}${f('nom', 'Nom', 'text', 'FRA')}
        ${f('domicile', 'Domicile', 'text', 'BRACIEUX (41250), 31 rue de Candy', true)}
        ${f('naissanceDate', 'Né(e) le', 'date')}${f('naissanceLieu', 'à', 'text', 'SAINT SOUPLET (59360)')}
        ${f('decesDate', 'Décédé(e) le', 'date')}${f('decesLieu', 'à', 'text', 'BRACIEUX (41250)')}
        <div class="calc-champ"><label>Situation</label><select class="prop-champ" onchange="cstDefunt('conjointLien', this.value); majApercuConstitution()">${['', 'Veuve de', 'Veuf de', 'Épouse de', 'Époux de', 'Divorcée de', 'Divorcé de'].map(l => `<option value="${escapeAttr(l)}"${c.conjointLien === l ? ' selected' : ''}>${l || '—'}</option>`).join('')}</select></div>
        ${f('conjointNom', 'Conjoint', 'text', 'Monsieur Maurice Charles FISCHER')}</div>`;
  }
  function cstDefuntApercu(champ, valeur) { cstDefunt(champ, valeur); majApercuConstitution(); }

  // Pure : la ligne de destinataire montrée dans la liste (sa première ligne), « À compléter » si vide.
  function resumeDestinataireConstitution(doc) {
    if (doc.mode === 'en-ligne') return doc.note || '';
    return (doc.lignes || []).filter(Boolean).slice(0, 2).join(', ');
  }

  function renderItemConstitution(doc) {
    const idDoc = escapeOnclickArg(doc.id);
    const choisi = cstEtat.selection === doc.id;
    const dest = resumeDestinataireConstitution(doc);
    if (doc.mode === 'en-ligne') {
      return `<div class="cst-item cst-off"><span class="cst-item-switch"></span><span class="cst-item-texte"><span class="cst-item-titre">${escapeHtml(doc.libelle)}</span><span class="cst-item-dest">${escapeHtml(dest)}</span></span><span class="dot-label dl-success"><span class="dot"></span>En ligne</span></div>`;
    }
    const mode = doc.envoyeLe ? '<span class="dot-label dl-success"><span class="dot"></span>Email préparé</span>'
      : doc.mode === 'courriel' ? `<span class="dot-label ${doc.courriel ? 'dl-acte' : 'dl-urgent'}"><span class="dot"></span>Email</span>` : '<span class="dot-label dl-neutre"><span class="dot"></span>Papier</span>';
    const memes = cstEtat.documents.filter(x => x.modele === doc.modele && x.genre === doc.genre && x.groupe === doc.groupe);
    const rang = memes.length > 1 ? ` ${memes.indexOf(doc) + 1}` : '';
    return `<div class="cst-item${choisi ? ' choisi' : ''}${doc.actif ? '' : ' cst-off'}" onclick="cstChoisirDoc('${idDoc}')">
        <span class="cst-item-switch" onclick="event.stopPropagation()"><wa-switch size="small"${doc.actif ? ' checked' : ''} onchange="cstBasculerDoc('${idDoc}', this.checked)" aria-label="Préparer ce courrier"></wa-switch></span>
        <span class="cst-item-texte"><span class="cst-item-titre">${escapeHtml(doc.libelle)}${rang}</span>
          <span class="cst-item-dest${dest ? '' : ' manque'}">${escapeHtml(dest || 'Destinataire à compléter')}</span></span>
        ${mode}
        ${doc.genre === 'succession' ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" title="Un autre courrier du même genre (une seconde banque…)" onclick="event.stopPropagation(); cstDupliquerDoc('${idDoc}')">+</wa-button>` : ''}
        ${doc.ajoute ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" title="Retirer ce courrier" onclick="event.stopPropagation(); cstRetirerDoc('${idDoc}')">${icone('x')}</wa-button>` : ''}
      </div>`;
  }

  function renderListeCourriersConstitution() {
    const e = cstEtat;
    if (e.type === 'vente') {
      const parCommune = e.groupes.map(g => `<div class="cst-liste-titre">${escapeHtml(g.commune)}</div>${e.documents.filter(x => x.groupe === g.cle).map(renderItemConstitution).join('')}
        <div class="cst-ajout cst-ajout-courrier"><wa-button appearance="outlined" size="s" class="bouton-ajout" type="button" onclick="cstAjouterViergeVente('${escapeOnclickArg(g.cle)}')"><span slot="start" class="bouton-ajout-plus">+</span>Courrier à un autre organisme</wa-button></div>`).join('');
      const gnau = e.groupes.map(g => {
        const info = g.info || {};
        const depot = info.depot || {};
        const chailles = String(info.insee || '') === INSEE_CHAILLES;
        const lien = chailles ? URL_GNAU_CHAILLES : lienDepotDiaSur(depot.url);
        const nom = chailles ? 'Guichet de Chailles (SIRAP)' : (depot.plateforme || (depot.mode === 'guichet' ? 'Guichet unique' : 'Guichet non relevé'));
        return `<div class="cst-gnau"><span>CU et DIA — ${escapeHtml(g.commune)} : ${escapeHtml(nom)}</span>${lien ? `<a href="${escapeAttr(lien)}" target="_blank" rel="noopener">Ouvrir</a>` : ''}</div>`;
      }).join('');
      return parCommune + `<div class="cst-liste-titre">Guichets uniques ${infoBulle('Le certificat d’urbanisme et la DIA ne sont pas des courriers : ils se déposent sur le guichet de la commune.')}</div>${gnau}`;
    }
    const modeles = MODELES_COURRIER_SUCCESSION.map(m => `<option value="${escapeAttr(m.cle)}"${m.cle === 'mutuelle' ? ' selected' : ''}>${escapeHtml(m.libelle)}</option>`).join('');
    return `${e.documents.map(renderItemConstitution).join('')}
      <div class="cst-ajout cst-ajout-courrier"><select class="prop-champ" id="cst-ajout-modele" aria-label="Courrier à ajouter">${modeles}</select>
        <wa-button appearance="outlined" size="s" class="bouton-ajout" type="button" onclick="cstAjouterDoc()"><span slot="start" class="bouton-ajout-plus">+</span>Ajouter</wa-button></div>`;
  }

  function renderSortieConstitution(d) {
    const e = cstEtat;
    const manques = manquesConstitution(e);
    const n = documentsAGenererConstitution().length;
    const nEmail = documentsAGenererConstitution().filter(x => x.mode === 'courriel').length;
    const nPapier = n - nEmail;
    const pdfOk = typeof genererPdfAAppelFonds === 'function';
    const nas = !!d.nasDossier;
    const bascule = (actif, geste, libelle) => `<wa-button size="s" appearance="outlined" class="vue-bascule-btn${actif ? ' actif' : ''}" type="button" onclick="${geste}">${libelle}</wa-button>`;
    const bloque = e.enCours || !n || !pdfOk || !formatsChoisisConstitution().length;
    return `${manques.length ? `<details class="cst-manques"><summary>${manques.length} point${manques.length > 1 ? 's' : ''} à vérifier</summary>${manques.map(m => `<p class="cst-alerte">${escapeHtml(m)}</p>`).join('')}</details>` : ''}
      <div class="cst-choix">
        <wa-button-group label="Format">${bascule(e.formats.pdf, "cstFormat('pdf', !cstEtat.formats.pdf)", 'PDF')}${bascule(e.formats.docx, "cstFormat('docx', !cstEtat.formats.docx)", 'Word')}</wa-button-group>
        <wa-button-group label="Signature">${bascule(e.signe !== false, 'cstSigne(true)', 'Signé')}${bascule(e.signe === false, 'cstSigne(false)', 'Non signé')}</wa-button-group>
      </div>
      <div class="cst-actions">
        <wa-button variant="brand" pill type="button" ${bloque || !nas ? 'disabled ' : ''}onclick="genererConstitution('ranger')" title="${nas ? 'Dans le dossier « Constitution » du dossier client, créé s’il manque ; rien n’est écrasé' : 'Dossier non relié au NAS : utilisez « Télécharger »'}">${e.enCours ? 'Préparation…' : `Enregistrer dans « Constitution » (${n})`}</wa-button>
        <wa-button appearance="outlined" pill type="button" ${bloque ? 'disabled ' : ''}onclick="genererConstitution('telecharger')">Télécharger</wa-button>
        <wa-button appearance="outlined" pill type="button" ${e.enCours || !nPapier || !pdfOk ? 'disabled ' : ''}onclick="genererConstitution('imprimer')" title="Les courriers papier en un seul PDF, ouvert pour l’impression">Imprimer (${nPapier})</wa-button>
        <wa-button appearance="outlined" pill type="button" ${e.enCours || !nEmail ? 'disabled ' : ''}onclick="emailsConstitution()" title="Une fenêtre d’email par courrier, à relire et envoyer">Envoyer les emails (${nEmail})</wa-button>
      </div>
      ${nas ? '' : '<p class="hint">Dossier non relié au NAS : reliez-le sur la fiche pour enregistrer dans « Constitution ».</p>'}
      <p class="hint" id="cst-message">${escapeHtml(e.message || '')}</p>`;
  }
  function cstSigne(oui) { if (cstEtat) { cstEtat.signe = !!oui; renderConstitution(); } }

  // Pure : les contacts du répertoire qui répondent à une recherche (organisme, service, personne, ville), 8 au plus. Pour une succession
  // (étude 15/10 : « présenter en priorité les services successions, et pas la banque pour le prêt ») : un service « successions » et
  // les thèmes des successions d'abord, les banques « prêts et mainlevées » en dernier ; à égalité, l'ordre du répertoire.
  var THEMES_SUCCESSION_REPERTOIRE = ['banquesSuccessions', 'assurances', 'social', 'impots'];
  function rechercheRepertoireConstitution(q, contacts, genre) {
    const mots = normaliserPourRecherche(String(q || '')).split(/[^a-z0-9]+/).filter(m => m.length >= 2);
    if (!mots.length) return [];
    const trouves = (contacts || []).filter(c => {
      const t = normaliserPourRecherche([c.organisme, c.service, (c.personnes || []).join(' '), c.adresse, c.theme].filter(Boolean).join(' '));
      return mots.every(m => t.includes(m));
    });
    if (genre !== 'succession') return trouves.slice(0, 8);
    const rang = (c) => {
      const t = normaliserPourRecherche([c.organisme, c.service].filter(Boolean).join(' '));
      if (/succession/.test(t)) return 0;
      if (THEMES_SUCCESSION_REPERTOIRE.includes(c.theme)) return 1;
      if (c.theme === 'banquesPrets') return 3;
      return 2;
    };
    return trouves.map((c, i) => ({ c, i, r: rang(c) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.c).slice(0, 8);
  }

  function lignesContactsConstitution(liste, idDoc) {
    return liste.map(c => `<button type="button" class="dash-recherche-ligne" onclick="cstChoisirContact('${idDoc}', '${escapeOnclickArg(c.id)}')">
        <span class="dash-recherche-nom">${escapeHtml([c.organisme, c.service].filter(Boolean).join(' — ') || (c.personnes || [])[0] || '')}</span>
        <span class="dash-recherche-resp">${escapeHtml(String(c.adresse || '').split(/\n|,/).slice(-1)[0] || '')}</span></button>`).join('');
  }

  function cstRechercheRepertoire(valeur) {
    const doc = documentConstitution(cstEtat && cstEtat.selection);
    const boite = document.getElementById('cst-rep-resultats');
    if (!doc || !boite) return;
    const contacts = typeof repertoireContacts !== 'undefined' ? repertoireContacts : [];
    const q = String(valeur || '').trim();
    const liste = q ? rechercheRepertoireConstitution(q, contacts, doc.genre) : candidatsRepertoireConstitution(doc.modele, contacts).slice(0, 6);
    boite.innerHTML = liste.length ? lignesContactsConstitution(liste, escapeOnclickArg(doc.id)) : `<div class="dash-recherche-vide">${q ? 'Rien dans le répertoire pour cette recherche.' : 'Tapez un nom pour chercher dans le répertoire.'}</div>`;
  }

  function renderEditeurConstitution(doc) {
    if (!doc) return '<p class="hint">Choisissez un courrier dans la liste.</p>';
    const idDoc = escapeOnclickArg(doc.id);
    if (doc.mode === 'en-ligne') return `<div class="cst-edition"><strong>${escapeHtml(doc.libelle)}</strong><p class="hint">${escapeHtml(doc.note)}</p></div>`;
    const retenir = doc.modele !== 'autre' && (doc.genre === 'vente' ? doc.modeleRetenu : true);
    const g = doc.genre === 'vente' ? groupeDuDocumentConstitution(doc) : null;
    return `<div class="cst-edition">
      <div class="cst-edition-tete"><strong>${escapeHtml(doc.libelle)}${g ? ' — ' + escapeHtml(g.commune) : ''}</strong>${doc.origine ? ` <span class="hint">${escapeHtml(doc.origine)}</span>` : ''}
        <span class="cst-edition-actions">
          ${doc.mode === 'courriel' ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="emailDocumentConstitution('${idDoc}')">Préparer l’email</wa-button>` : ''}
          <wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="telechargerDocumentConstitution('${idDoc}', 'pdf')">PDF</wa-button>
          <wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="telechargerDocumentConstitution('${idDoc}', 'docx')">Word</wa-button>
        </span></div>
      ${doc.note ? `<p class="hint">${escapeHtml(doc.note)}</p>` : ''}
      <div class="cst-envoi">
        <wa-button-group label="Envoi"><wa-button size="s" appearance="outlined" class="vue-bascule-btn${doc.mode === 'papier' ? ' actif' : ''}" type="button" onclick="cstModeEnvoi('${idDoc}', 'papier')">Papier</wa-button><wa-button size="s" appearance="outlined" class="vue-bascule-btn${doc.mode === 'courriel' ? ' actif' : ''}" type="button" onclick="cstModeEnvoi('${idDoc}', 'courriel')">Email</wa-button></wa-button-group>
        ${doc.mode === 'courriel' ? `<input type="email" class="prop-champ cst-courriel" list="cst-emails-proposes" value="${escapeAttr(doc.courriel || '')}" placeholder="adresse@organisme.fr" oninput="cstCourriel('${idDoc}', this.value)" aria-label="Adresse email du destinataire">
          <datalist id="cst-emails-proposes">${(doc.emails || []).map(e => `<option value="${escapeAttr(e.adresse)}">${escapeHtml(e.libelle)}</option>`).join('')}</datalist>
          <span class="hint">Le texte du courrier, sans l’en-tête${corpsEmailCourrierConstitution(documentFideleConstitution(doc)).suite ? ', avec le questionnaire joint en PDF' : ''}.</span>` : ''}
      </div>
      <div class="cst-edition-corps">
        <div class="calc-champ"><label>Destinataire</label>
          <textarea class="prop-champ" id="cst-dest" rows="4" oninput="cstLignesDoc('${idDoc}', this.value); majApercuConstitution(); majItemConstitution()" placeholder="Nom de l’organisme&#10;Service&#10;Adresse&#10;CP VILLE">${escapeHtml(doc.lignes.join('\n'))}</textarea>
          ${retenir ? `<wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="cstRetenirAdresse('${idDoc}')" title="Garder cette adresse pour les prochains dossiers">Retenir l’adresse</wa-button>` : ''}</div>
        <div class="calc-champ cst-rep"><label>Chercher dans le répertoire</label>
          <input type="search" class="nas-choix-recherche" id="cst-rep-q" autocomplete="off" placeholder="Nom, ville… (Crédit Agricole, Harmonie…)" oninput="cstRechercheRepertoire(this.value)">
          <div id="cst-rep-resultats" class="cst-rep-resultats"></div></div>
      </div>
      ${doc.modele === 'autre' ? `<div class="calc-champ cst-texte-libre"><label>Texte du courrier ${infoBulle(doc.genre === 'vente' ? 'Votre demande, entre « Madame, Monsieur, » et les références cadastrales. **mot** = gras, __mot__ = souligné.' : 'Votre demande, entre « Madame, Monsieur, » et la formule finale. **mot** = gras, __mot__ = souligné.')}</label>
        <textarea class="prop-champ" id="cst-texte-libre" rows="6" oninput="cstTexteLibre('${idDoc}', this.value)" placeholder="Je vous serais très obligé de bien vouloir…">${escapeHtml(doc.texteLibre || '')}</textarea></div>` : ''}
      </div>`;
  }

  function majApercuConstitution() {
    const zone = document.getElementById('cst-apercu');
    const doc = documentConstitution(cstEtat && cstEtat.selection);
    const d = dossierConstitution();
    if (!zone) return;
    if (!doc || !d || doc.mode === 'en-ligne') { zone.innerHTML = '<p class="hint cst-vide">Pas de courrier à montrer.</p>'; return; }
    try {
      const assets = (window.APPEL_FONDS_MODELE && window.APPEL_FONDS_MODELE.assets) || {};
      zone.innerHTML = htmlCourrierFidele(documentFideleConstitution(doc), refLignesCourrier(d), assets, cstEtat.signe !== false);
      // La page est aux mesures du papier (595 pt) : réduite pour tenir dans la colonne, sans rien changer à ses retours à la ligne.
      const lettre = zone.querySelector('.cstf');
      const r = lettre && lettre.offsetWidth ? zone.clientWidth / lettre.offsetWidth : 1;
      if (lettre && r > 0 && r < 1) lettre.style.zoom = String(Math.floor(r * 100) / 100);
    } catch (e) { zone.innerHTML = '<p class="hint">Aperçu impossible.</p>'; console.error(e); }
  }

  // La ligne du courrier choisi dans la liste suit la saisie du destinataire, sans redessiner l'écran (la saisie garde le curseur).
  function majItemConstitution() {
    const doc = documentConstitution(cstEtat && cstEtat.selection);
    const el = document.querySelector('.cst-item.choisi .cst-item-dest');
    if (!doc || !el) return;
    const dest = resumeDestinataireConstitution(doc);
    el.textContent = dest || 'Destinataire à compléter';
    el.classList.toggle('manque', !dest);
  }

  function cstChoisirDoc(id) {
    if (!cstEtat || !documentConstitution(id)) return;
    cstEtat.selection = id;
    renderConstitution();
  }

  function renderConstitution() {
    const zone = document.getElementById('cst-corps');
    if (!zone) return;
    const d = dossierConstitution();
    if (!cstEtat || !d) { zone.innerHTML = renderDossierConstitution(null); return; }
    if (!documentConstitution(cstEtat.selection)) {
      const premier = cstEtat.documents.find(x => x.actif && x.mode !== 'en-ligne') || cstEtat.documents.find(x => x.mode !== 'en-ligne');
      cstEtat.selection = premier ? premier.id : '';
    }
    const volet = zone.querySelector('.cst-donnees');
    if (volet && volet.dataset.dossier === cstEtat.dossierId) cstEtat.donneesOuvertes = !!volet.open;
    const ouvert = cstEtat.donneesOuvertes !== undefined ? cstEtat.donneesOuvertes : manquesConstitution(cstEtat).some(m => !/parcelle/i.test(m));
    const doc = documentConstitution(cstEtat.selection);
    zone.innerHTML = `${renderDossierConstitution(d)}
      <div class="cst-plan">
        <div class="cst-gauche">
          <wa-details class="cst-donnees" data-dossier="${escapeAttr(cstEtat.dossierId)}"${ouvert ? ' open' : ''}>
            <span slot="summary" class="cst-donnees-resume"><strong>${cstEtat.type === 'vente' ? 'Vendeurs et parcelles' : 'Le défunt'}</strong> <span class="hint">${escapeHtml(resumeDonneesConstitution(cstEtat))}</span></span>
            ${cstEtat.type === 'vente' ? renderDonneesVenteConstitution(d) : renderDonneesSuccessionConstitution()}
          </wa-details>
          <div class="calc-card cst-courriers"><div class="cst-bloc-titre">Courriers <span class="hint">${documentsAGenererConstitution().length} à préparer</span></div>${renderListeCourriersConstitution()}</div>
          <div class="calc-card cst-sortie">${renderSortieConstitution(d)}</div>
        </div>
        <div class="cst-droite">
          <div class="calc-card cst-editeur">${renderEditeurConstitution(doc)}</div>
          <div class="cst-apercu" id="cst-apercu"></div>
        </div>
      </div>`;
    majApercuConstitution();
    if (doc && doc.mode !== 'en-ligne') cstRechercheRepertoire('');
  }

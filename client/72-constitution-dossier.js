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

  var COURRIEL_CARSAT_PREMIERE_DEMANDE = 'notaires.premieredemande@carsat-centre.fr';
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
    mutuelle: { re: /mutuelle|camieg|harmonie/i },
    // Étude 20/10 : les maisons de retraite rangées dans leur catégorie du répertoire.
    ehpad: { theme: 'maisonsRetraite' }
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
  // (La même recherche pour tous les outils : commun/donnees-dossier.js.)
  function ficheClientPourPersonneConstitution(d, nom) { return ficheClientDe(d, nom); }

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
    // Toutes les parcelles du dossier, lues comme partout ailleurs (commun/donnees-dossier.js) : bien de la fiche et immeubles d'Authentic.
    parcellesDossier(d).forEach(p => ajouter(p, p.origine === 'authentic' ? 'Authentic' : 'Fiche', p.commune, p.adresseBien ? normaliserAdresse(p.adresseBien) : '', p.codePostal));
    // Parcelles ajoutées et décochées dans cet écran (`d.constitutionParcelles`, gardées sur le dossier : le Contrôle de l'urbanisme les suit).
    const choix = (d && d.constitutionParcelles) || {};
    (Array.isArray(choix.ajoutees) ? choix.ajoutees : []).forEach(p => ajouter(p, 'Saisie', p.commune, '', p.cp));
    const retirees = new Set(Array.isArray(choix.retirees) ? choix.retirees : []);
    groupes.forEach(g => g.parcelles.forEach(p => { if (retirees.has(cleChoixParcelleConstitution(g, p))) p.actif = false; }));
    if (!groupes.length && principale.nom) groupe(principale.nom, principale.cp, '');
    groupes.forEach(g => {
      if (!g.adresseImmeuble) {
        g.adresseImmeuble = g.principale && d && d.adresseBien ? normaliserAdresse(d.adresseBien)
          : [g.commune + (g.cp ? ` (${g.cp})` : ''), (g.parcelles.find(p => p.lieuDit) || {}).lieuDit].filter(Boolean).join(', ');
      }
    });
    return groupes.sort((a, b) => (b.principale ? 1 : 0) - (a.principale ? 1 : 0));
  }

  // Pure : la clé d'une parcelle d'un groupe, pour retenir qu'elle est décochée.
  function cleChoixParcelleConstitution(g, p) { return [g.cle, p.prefixe || '', p.section, p.numero].join('|'); }

  // Pure : ce que l'écran a changé aux parcelles du dossier → { ajoutees, retirees } ou null s'il n'a rien changé.
  function choixParcellesConstitution(groupes) {
    const ajoutees = [];
    const retirees = [];
    (groupes || []).forEach(g => (g.parcelles || []).forEach(p => {
      if (p.origine === 'Saisie') ajoutees.push({ commune: g.commune, cp: g.cp || '', prefixe: p.prefixe || '', section: p.section, numero: p.numero, lieuDit: p.lieuDit || '', surface: p.surfaceIgn ? '' : (p.surface || '') });
      if (!p.actif) retirees.push(cleChoixParcelleConstitution(g, p));
    }));
    return ajoutees.length || retirees.length ? { ajoutees, retirees } : null;
  }

  // Pure : les parcelles retenues pour le Contrôle de l'urbanisme quand la Constitution les a changées — celles cochées de la commune du
  // bien ; null sinon (les parcelles de la fiche valent alors).
  function parcellesUrbanismeConstitution(d) {
    // Commune du bien inconnue (chaque groupe se dit « principal »), ou aucune parcelle cochée : les parcelles de la fiche valent, jamais
    // une analyse sur une liste vide (décocher l'ancienne avant d'ajouter la nouvelle retirait la pièce « Réponse SAFER »).
    if (!d || !d.constitutionParcelles || !communeDuDossierConstitution(d).nom) return null;
    const g = groupesParcellesConstitution(d).find(x => x.principale);
    const cochees = g ? g.parcelles.filter(p => p.actif) : [];
    return cochees.length ? cochees : null;
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
    if (circuit.destinataire === 'paris-numerotage') return retenue('paris-numerotage') || DESTINATAIRES_CONNUS['paris-numerotage'].lignes.slice();
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
    // Jamais le nom d'une voie (« 12 rue de la Clinique », « avenue de l'Hôpital ») : relecture 20/10.
    const m = /(?<!(?:rue|avenue|av\.?|boulevard|bd|chemin|route|all[ée]e|place|impasse|quai)\s+(?:(?:de la|de l'|de l’|du|des|de)\s*)?)((?:EHPAD|E\.H\.P\.A\.D\.?|R[ée]sidence|Maison de retraite|Foyer|Clinique|H[ôo]pital)[^,]*)(?:,\s*(.+))?$/i.exec(String(domicile || '').trim());
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
    // Maison de retraite : seulement celle que le domicile du défunt cite (son nom ou sa rue) — jamais la seule du répertoire par défaut.
    if (cle === 'ehpad') return maisonRetraiteDuDefuntConstitution(candidats, defunt);
    // Impôts : toujours le SPFE de Blois (étude 18/10 : « changer pour les successions en SPFE de BLOIS »), quel que soit le domicile.
    if (cle === 'impots') return candidats.find(c => /\bspfe\b|s\.?\s*i\.?\s*e\.?\s*p\.?\s*f\b/i.test(String(c.organisme || '')) || c.id === 'rep-siepf-blois') || null;
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

  // Pure : la maison de retraite du répertoire que le domicile du défunt désigne — l'établissement cité porte tous les mots distinctifs
  // de son nom, ou la même voie avec le même numéro ; une seule, sinon null.
  function maisonRetraiteDuDefuntConstitution(candidats, defunt) {
    const domicile = String((defunt && defunt.domicile) || '');
    const etab = etablissementDansDomicileConstitution(domicile);
    if (!etab) return null;
    const mots = (t) => normaliserPourRecherche(String(t || '')).replace(/[^a-z0-9]+/g, ' ').split(' ')
      .filter(m => m.length >= 3 && !/^(ehpad|residence|maison|retraite|foyer|clinique|hopital|les|des|del|aux)$/.test(m));
    // Même code postal exigé (une « Résidence Les Tilleuls » de Mer n'est pas celle de Blois) ; nom aux MÊMES mots distinctifs.
    const cp = (t) => ((String(t || '').match(/\b\d{5}\b/g) || []).slice(-1)[0] || '');
    const cpDefunt = cp(domicile);
    if (!cpDefunt) return null;
    candidats = candidats.filter(c => cp(c.adresse) === cpDefunt);
    const cite = new Set(mots(etab.nom));
    const parNom = candidats.filter(c => { const m = new Set(mots(c.organisme)); return m.size && m.size === cite.size && [...m].every(x => cite.has(x)); });
    if (parNom.length === 1) return parNom[0];
    if (parNom.length > 1) return null;
    const voie = (t) => { const x = /(\d{1,4})\s*(?:bis|ter)?\s*,?\s*((?:rue|avenue|av|bd|boulevard|chemin|route|allee|place|impasse|quai)\b[^,]*)/.exec(normaliserPourRecherche(String(t || ''))); return x ? x[1] + ' ' + x[2].trim() : ''; };
    const v = voie(domicile);
    const parVoie = v ? candidats.filter(c => voie(c.adresse) === v) : [];
    return parVoie.length === 1 ? parVoie[0] : null;
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
    // Champ vide (au clic) : les dossiers en cours, pour choisir sans rien taper (étude 16/10 : « un champ de recherche qui ne
    // recherche rien »).
    const trouves = (q
      ? dossiers.filter(d => d && !d.deleted && (normaliserPourRecherche(libelleDossierAffiche(d)).includes(q) || normaliserPourRecherche(d.responsable || '').includes(q)))
      : dossiers.filter(d => d && !d.deleted && !d.archive).sort((a, b) => libelleDossierAffiche(a).localeCompare(libelleDossierAffiche(b), 'fr'))).slice(0, q ? 8 : 12);
    boite.innerHTML = trouves.length
      ? trouves.map(d => `<button type="button" class="dash-recherche-ligne" onclick="choisirDossierConstitution('${escapeOnclickArg(d.id)}')">
          <span class="dash-recherche-nom">${escapeHtml(libelleDossierAffiche(d))}</span><span class="dash-recherche-resp">${escapeHtml(estSuccession(d) ? 'Succession' : 'Vente')}${d.archive ? ' · archivé' : ''}</span></button>`).join('')
      : '<div class="dash-recherche-vide">Aucun dossier ne correspond.</div>';
    boite.style.display = 'block';
  }

  // Le champ quitté : la liste se ferme (après le clic sur une ligne, qui passe avant).
  // (Un appui sur la liste ne fait pas perdre le champ : `onmousedown` l'en empêche ; au clavier, Tab vers une ligne la garde ouverte.)
  function masquerResultatsConstitution(event) {
    const b = document.getElementById('cst-resultats');
    if (!b || (event && event.relatedTarget && b.contains(event.relatedTarget))) return;
    setTimeout(() => { if (!b.contains(document.activeElement)) b.style.display = 'none'; }, 200);
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
    Object.keys(minuteriesPlanConstitution).forEach(k => clearTimeout(minuteriesPlanConstitution[k]));
    minuteriesPlanConstitution = {};
    cstEtat = { dossierId: id, type, etape: 0, message: '', formats: { pdf: true, docx: false }, signe: true, sorties: {}, enCours: false, documents: [], proprietaires: [], groupes: [], defunt: null, selection: '', compteur: 0, separes: {} };
    if (type === 'vente') {
      cstEtat.proprietaires = proprietairesConstitution(d);
      cstEtat.groupes = groupesParcellesConstitution(d).map(g => Object.assign(g, { info: { etat: 'chargement' } }));
      cstEtat.groupes.forEach(g => chargerCommuneConstitution(g));
      // Zonage et droits de préemption (client/81) : lus seuls si le dossier n'a pas encore d'analyse ; contenances de l'IGN si Authentic n'en a pas.
      completerContenancesConstitution();
      lireZonageConstitution(false);
    } else {
      cstEtat.defunt = defuntConstitution(d);
      if (d.nasDossier) chargerCompteRenduConstitution(id);
    }
    reconstruireDocumentsConstitution(true);
    renderConstitution();
  }

  // Le compte rendu d'ouverture de Sophie (Word du dossier sur le NAS, lu par le serveur) dit les banques et si le défunt avait un EHPAD, une
  // mutuelle ou une caisse de retraite : les courriers correspondants sont cochés ou ajoutés (étude 28/10). Sans compte rendu : rien ne change.
  async function chargerCompteRenduConstitution(id) {
    const suivi = cstEtat;
    try {
      const r = await fetchAvecAuth(`/api/nas/compte-rendu-ouverture?dossierId=${encodeURIComponent(id)}`);
      const j = await r.json().catch(() => ({}));
      if (cstEtat !== suivi || !r.ok || !j.trouve) return;
      appliquerCompteRenduConstitution(j);
      renderConstitution();
    } catch (e) { /* serveur injoignable ou NAS absent : les courriers restent ceux d'avant */ }
  }

  function appliquerCompteRenduConstitution(cr) {
    const e = cstEtat;
    if (!e || e.type !== 'succession' || e.compteRenduApplique) return;
    e.compteRenduApplique = true;
    const contacts = typeof repertoireContacts !== 'undefined' ? repertoireContacts : [];
    const norme = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    ['ehpad', 'mutuelle', 'retraite'].forEach(modele => {
      const voulu = cr[modele] === true;
      const existant = e.documents.find(x => x.modele === modele);
      if (existant) { if (!(e.cochesALaMain || {})[existant.id]) existant.actif = voulu; }
      else if (voulu) ajouterDocSuccessionConstitution(modele, false);
    });
    const banques = Array.isArray(cr.banques) ? cr.banques : [];
    if (!banques.length) return;
    const base = e.documents.find(x => x.modele === 'banque' && !x.ajoute);
    if (base) base.actif = false;
    banques.forEach(nom => {
      const doc = ajouterDocSuccessionConstitution('banque', true);
      if (!doc) return;
      doc.libelle = `Banque ${nom}`;
      const contact = contacts.find(c => c && norme(c.organisme).includes(norme(nom)));
      if (contact) {
        doc.lignes = adresseCourrierContact(contact);
        doc.contactId = contact.id || '';
        doc.origine = 'Répertoire';
        doc.modifie = true;
      } else doc.origine = 'Compte rendu d’ouverture : adresse à chercher dans le répertoire';
    });
    e.selection = '';
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
        courriersVenteCommune({ insee: info.insee }, !!(e.separes && e.separes[g.cle])).forEach(c => {
          const circuit = circuitCourrierVente(c.cle, { insee: info.insee, epci: info.epci && info.epci.code });
          const id = `v:${g.cle}:${c.cle}`;
          // Séparé ou réuni : le courrier reprend la saisie de celui qu'il remplace (jamais celle d'un courrier « en ligne »).
          const ancien = anciens.get(id) || homologuesCourrierVente(c.cle).map(k => anciens.get(`v:${g.cle}:${k}`)).find(x => x && x.mode !== 'en-ligne');
          const lignes = lignesDestinataireVente(circuit, g, info.mairie, cstAdressesRetenues);
          const retenueV = cstAdressesRetenues[circuit.destinataire];
          // La mairie : l'adresse email de sa fiche de l'annuaire du service public, à défaut d'une adresse retenue par l'étude.
          const courrielMairie = circuit.destinataire === 'mairie' && info.mairie && info.mairie.courriel ? String(info.mairie.courriel) : '';
          const courrielDefaut = circuit.courriel || (retenueV && retenueV.courriel) || courrielMairie || '';
          const modeDefaut = circuit.mode === 'en-ligne' ? 'en-ligne' : (ancien && ancien.modeChoisi ? ancien.mode : circuit.mode);
          docs.push({ id, genre: 'vente', modele: c.cle, groupe: g.cle, libelle: c.libelle, mode: modeDefaut, modeChoisi: !!(ancien && ancien.modeChoisi),
            courriel: ancien && ancien.modeChoisi ? ancien.courriel : courrielDefaut, emails: courrielDefaut ? [{ libelle: '', adresse: courrielDefaut }] : [], note: circuit.note, url: circuit.url || '', lien: circuit.lien || '', destinataire: circuit.destinataire,
            actif: circuit.mode === 'en-ligne' ? false : (ancien ? ancien.actif : true),
            lignes: ancien && ancien.modifie ? ancien.lignes : lignes, modifie: !!(ancien && ancien.modifie), modeleRetenu: circuit.destinataire !== 'mairie' && circuit.destinataire !== 'blois-en-ligne',
            retouches: ancien && ancien.retouches ? ancien.retouches : undefined });
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
      if (modele === 'ehpad' && !contact) {
        const etab = etablissementDansDomicileConstitution(defunt.domicile);
        if (etab) { lignes = etab.lignes; origine = 'Domicile du défunt (établissement cité)'; }
      }
      const retenue = cstAdressesRetenues['succession-' + modele];
      if (!contact && retenue && retenue.lignes && retenue.lignes.length) { lignes = retenue.lignes.slice(); origine = 'Adresse retenue par l’étude'; }
      const horsDep = !contact && m && m.destinataire.length && dep && dep !== '41' && ['impots', 'cpam', 'msa', 'carsat'].includes(modele);
      // Par email dès qu'une adresse est connue (étude 15/10 : banques, impôts, CARSAT, MSA « quasiment que par mail ») ; sinon papier.
      // Un contact repris d'un ancien calcul seulement s'il a été choisi à la main : posé d'office, il suit le domicile du défunt.
      const contactRetenu = ancien && ancien.contactId && ancien.modifie ? contacts.find(c => c && c.id === ancien.contactId) : contact;
      let emails = contactRetenu ? emailsContactConstitution(contactRetenu) : (retenue && retenue.courriel ? [{ libelle: '', adresse: retenue.courriel }] : []);
      // CARSAT, défunt du Loir-et-Cher ou du Loiret (ou domicile inconnu) : l'adresse des premières demandes des notaires (étude 18/10).
      if (modele === 'carsat' && (!dep || dep === '41' || dep === '45')) {
        emails = [{ libelle: 'Première demande', adresse: COURRIEL_CARSAT_PREMIERE_DEMANDE }].concat(emails.filter(x => x.adresse !== COURRIEL_CARSAT_PREMIERE_DEMANDE));
      }
      const envoi = ancien && ancien.modeChoisi ? { mode: ancien.mode, courriel: ancien.courriel } : { mode: emails.length ? 'courriel' : 'papier', courriel: emails.length ? emails[0].adresse : '' };
      return { id, genre: 'succession', modele, libelle: m ? m.libelle : modele, mode: envoi.mode, courriel: envoi.courriel, emails, modeChoisi: !!(ancien && ancien.modeChoisi), note: horsDep ? 'Adresse type du Loir-et-Cher : à vérifier pour un défunt domicilié ailleurs.' : '', destinataire: modele,
        actif: ancien ? ancien.actif : ORDRE_SUCCESSION_PAR_DEFAUT.includes(modele), lignes: ancien && ancien.modifie ? ancien.lignes : lignes, origine: ancien && ancien.modifie ? 'Saisi à la main' : origine,
        modifie: !!(ancien && ancien.modifie), contactId: ancien && ancien.contactId && ancien.modifie ? ancien.contactId : (contact ? contact.id : ''), retouches: ancien && ancien.retouches ? ancien.retouches : undefined };
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
  function documentFideleConstitution(doc, options) {
    return appliquerRetouchesConstitution(documentFideleBrutConstitution(doc, options), doc.retouches);
  }

  // Pure : les paragraphes corrigés sur l'aperçu (étude 18/10 : « aperçu éditable ») reportés sur le courrier — chaque retouche retient le
  // texte d'origine (`de`) : elle s'applique à la même ligne si elle n'a pas bougé, sinon à la première ligne restée identique ; un texte
  // d'origine disparu (parcelles changées, courrier par email) laisse la retouche sans effet.
  // Un texte répété (« Madame, Monsieur, ») se retrouve par la ligne de texte qui le précède (`avant`). Rend aussi `retouchesParLigne`
  // (ligne touchée → clé de la retouche) pour qu'une nouvelle correction de la même ligne remplace la sienne.
  function appliquerRetouchesConstitution(fidele, retouches) {
    if (!fidele || !retouches || !Object.keys(retouches).length) return fidele;
    const lignes = fidele.lignes.slice();
    const precedente = (k) => { for (let x = k - 1; x >= 0; x--) if (typeof fidele.lignes[x] === 'string' && fidele.lignes[x].trim()) return fidele.lignes[x]; return ''; };
    const prises = new Set();
    const parLigne = {};
    Object.keys(retouches).map(Number).sort((a, b) => a - b).forEach(i => {
      const r = retouches[i];
      if (!r || typeof r.de !== 'string' || !r.de.trim()) return;
      const libre = (k) => typeof fidele.lignes[k] === 'string' && fidele.lignes[k] === r.de && !prises.has(k);
      let j = libre(i) && (r.avant === undefined || precedente(i) === r.avant) ? i : -1;
      if (j < 0) j = fidele.lignes.findIndex((l, k) => libre(k) && (r.avant === undefined || precedente(k) === r.avant));
      if (j < 0) return;
      lignes[j] = String(r.en || '');
      prises.add(j);
      parLigne[j] = i;
    });
    return Object.assign({}, fidele, { lignes, retouchees: [...prises], retouchesParLigne: parLigne });
  }

  function documentFideleBrutConstitution(doc, options) {
    const d = dossierConstitution();
    const dateIso = isoAujourdhuiLocal();
    if (doc.genre === 'vente') {
      const g = groupeDuDocumentConstitution(doc) || { parcelles: [], adresseImmeuble: '' };
      const parcelles = g.parcelles.filter(p => p.actif).map(p => ({ prefixe: p.prefixe, section: p.section, numero: p.numero, lieuDit: p.lieuDit, surface: p.surface }));
      return documentCourrierVente(doc.modele, { destinataire: doc.lignes, dateLettre: dateCourrierSuccession(dateIso), adresseImmeuble: g.adresseImmeuble, parcelles, texteLibre: doc.texteLibre || '',
        proprietaires: cstEtat.proprietaires.map(p => ({ civilite: p.civilite, nom: p.nom, domicile: p.domicile, morale: p.morale })), reference: d.referenceAuthentic || '', nomDossier: libelleDossierAffiche(d),
        pourEmail: !!(options && options.pourEmail) });
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
    // La page d'attente de l'impression suit l'avancement.
    const w = fenetreImpressionConstitution;
    if (texte && w && !w.closed) { try { const el = w.document.getElementById('etape'); if (el) el.textContent = texte; } catch (_) { /* fenêtre déjà sur le PDF */ } }
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
    if (g && g.parcelles[i]) { g.parcelles[i].actif = !!actif; renderConstitution(); replanifierPlanConstitution(g); memoriserParcellesConstitution(g); }
  }
  // Parcelles changées : le plan de la commune est retiré tout seul (étude 16/10 : « sortir le plan automatiquement »), après une courte
  // pause pour ne pas relancer cadastre.gouv.fr à chaque case cochée.
  var minuteriesPlanConstitution = {};
  function replanifierPlanConstitution(g) {
    const e = cstEtat;
    if (!g || !e) return;
    clearTimeout(minuteriesPlanConstitution[g.cle]);
    minuteriesPlanConstitution[g.cle] = setTimeout(() => {
      // Un autre dossier ouvert entre-temps (même commune, même clé) : rien n'est relancé pour lui.
      if (cstEtat !== e || !e.groupes.includes(g)) return;
      const etat = etatPlanConstitution(g).etat;
      if (['a-tirer', 'perime'].includes(etat)) lancerPlanConstitution(g.cle, true);
    }, 2500);
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
    replanifierPlanConstitution(g);
    memoriserParcellesConstitution(g);
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

  // Numérotage et alignement en deux courriers (étude 16/10 : « si une commune a des services séparés, faire deux courriers différents ») :
  // imposé quand CLAIRE connaît la commune (Paris), au choix ailleurs — pour ce dossier.
  function renderSeparerAlignementConstitution(g) {
    const info = g.info || {};
    if (info.etat !== 'ok' || servicesAlignementSepares({ insee: info.insee })) return '';
    const separe = !!(cstEtat.separes && cstEtat.separes[g.cle]);
    return `<wa-button appearance="outlined" size="s" type="button" title="${separe ? 'Un seul courrier pour le numérotage et l’alignement' : 'Services séparés dans cette commune : un courrier pour le numérotage, un pour l’alignement'}" onclick="cstSeparerAlignement('${escapeOnclickArg(g.cle)}', ${separe ? 'false' : 'true'})">${separe ? 'Réunir numérotage et alignement' : 'Numérotage et alignement séparés'}</wa-button>`;
  }
  function cstSeparerAlignement(cleGroupe, separer) {
    if (!cstEtat || cstEtat.type !== 'vente') return;
    cstEtat.separes = Object.assign({}, cstEtat.separes, { [cleGroupe]: !!separer });
    reconstruireDocumentsConstitution(false);
    // Le courrier choisi disparaît : on montre celui qui le remplace (numérotage, ou le courrier réuni).
    if (!documentConstitution(cstEtat.selection)) {
      const suite = [`v:${cleGroupe}:numerotage`, `v:${cleGroupe}:alignement`].find(id => documentConstitution(id));
      cstEtat.selection = suite || '';
    }
    renderConstitution();
  }
  function cstBasculerDoc(id, actif) { const x = documentConstitution(id); if (x) { x.actif = !!actif; if (cstEtat) (cstEtat.cochesALaMain = cstEtat.cochesALaMain || {})[id] = true; renderConstitution(); } }
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
  // PDF OU Word (étude 18/10 : « le téléchargement en .docx sort aussi des PDF ») : un seul format enregistré à la fois ; le plan cadastral reste un PDF.
  function cstFormat(format) { if (cstEtat && cstEtat.formats[format] !== undefined) { cstEtat.formats = { pdf: format === 'pdf', docx: format === 'docx' }; renderConstitution(); } }

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

  // Fenêtre d'impression ouverte AU CLIC (après une attente, le navigateur bloquerait la fenêtre surgissante), remplie quand le PDF est prêt.
  // En attendant, une page d'attente aux couleurs de CLAIRE (étude 18/10), qui suit l'avancement (majMessageConstitution).
  var fenetreImpressionConstitution = null;
  function ouvrirFenetreImpressionConstitution() {
    const w = window.open('', '_blank');
    if (w) {
      try { w.document.open(); w.document.write(htmlAttenteImpressionConstitution(location.origin)); w.document.close(); } catch (_) { /* fenêtre d'un autre contexte */ }
      fenetreImpressionConstitution = w;
    }
    return w;
  }

  // Pure : la page d'attente (autonome : la fenêtre n'a pas la feuille de style de CLAIRE). Thème clair et sombre, police Geist servie par CLAIRE.
  function htmlAttenteImpressionConstitution(origine) {
    const o = /^https?:\/\/[^/"'<>\s]+$/.test(String(origine || '')) ? origine : '';
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CLAIRE — Préparation de l’impression</title>
<link rel="icon" href="${o}/icone.svg">
<style>
@font-face { font-family: 'Geist'; font-weight: 100 900; src: url('${o}/vendor/polices/geist-latin-wght-normal.woff2') format('woff2'); }
:root { --fond: #F4F5F7; --carte: #FFFFFF; --encre: #111418; --doux: #647089; --filet: #E3E6EB; --accent: #6D2332; }
@media (prefers-color-scheme: dark) { :root { --fond: #0F1115; --carte: #181B21; --encre: #ECEEF2; --doux: #9AA3B5; --filet: #2A2F38; --accent: #D08A97; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--fond); color: var(--encre); font-family: 'Geist', -apple-system, 'Segoe UI', sans-serif; padding: 16px; }
.carte { width: min(440px, 100%); background: var(--carte); border: 1px solid var(--filet); border-radius: 16px; padding: 32px 28px; text-align: center; box-shadow: 0 8px 32px rgba(17, 20, 24, 0.08); }
.marque { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 24px; }
.marque img { width: 32px; height: 32px; }
.marque span { font-size: 20px; font-weight: 600; letter-spacing: 0.02em; }
.roue { width: 40px; height: 40px; margin: 0 auto 20px; border-radius: 50%; border: 3px solid var(--filet); border-top-color: var(--accent); animation: tour 0.9s linear infinite; }
@keyframes tour { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .roue { animation-duration: 3s; } }
h1 { font-size: 18px; font-weight: 500; margin: 0 0 8px; }
p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--doux); }
#etape { margin-top: 16px; min-height: 20px; font-size: 12px; }
</style></head><body><main class="carte" role="status" aria-live="polite">
<div class="marque"><img src="${o}/icone.svg" alt=""><span>CLAIRE</span></div>
<div class="roue" aria-hidden="true"></div>
<h1>Préparation de l’impression</h1>
<p>Les courriers et les plans cadastraux sont mis en page. Le PDF s’ouvrira ici dans un instant.</p>
<p id="etape"></p>
</main></body></html>`;
  }
  function montrerPdfImpressionConstitution(w, blob, nom) {
    if (!w || w.closed) { telechargerFichier(blob, nom); return; }
    const url = URL.createObjectURL(blob);
    w.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  }

  async function genererConstitution(action) {
    const e = cstEtat;
    const d = dossierConstitution();
    if (!e || !d || e.enCours) return;
    const fenetre = action === 'imprimer' ? ouvrirFenetreImpressionConstitution() : null;
    // « Imprimer tout » : les courriers papier seuls (un courrier par email n'est ni préparé ni imprimé — relecture 16/10).
    const docs = documentsAGenererConstitution().filter(x => action !== 'imprimer' || x.mode !== 'courriel');
    const formats = action === 'imprimer' ? ['pdf'] : formatsChoisisConstitution();
    if (!docs.length || !formats.length) { if (fenetre) fenetre.close(); afficherToast(!docs.length ? (action === 'imprimer' ? 'Aucun courrier papier coché.' : 'Aucun courrier coché.') : 'Choisissez PDF ou Word.'); return; }
    e.enCours = true;
    renderConstitution();
    const fichiers = [];
    try {
      retenirDefuntSaisiConstitution();
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
      // Le plan d'une commune une fois dans les fichiers enregistrés.
      plans.forEach(liste => liste.forEach(p => fichiers.push({ blob: p.blob, nom: p.nom, format: 'pdf' })));
      if (action === 'imprimer') {
        // Chaque courrier suivi du plan cadastral de sa commune.
        let avecPlan = 0;
        const pdfs = docs.flatMap(x => {
          const courrier = e.sorties[x.id] && e.sorties[x.id].pdf && e.sorties[x.id].pdf.blob;
          const sesPlans = (plans.get(x.groupe) || []).map(p => p.blob);
          if (courrier && sesPlans.length) avecPlan++;
          return courrier ? [courrier].concat(sesPlans) : [];
        });
        if (!pdfs.length) { if (fenetre) fenetre.close(); majMessageConstitution('Aucun courrier papier à imprimer.'); }
        else {
          montrerPdfImpressionConstitution(fenetre, await fusionnerPdfConstitution(pdfs), `Constitution - ${libelleDossierAffiche(d)}.pdf`.replace(/[\\/:*?"<>|]+/g, ' '));
          noterConstitutionFaite(d);
          sauvegarder(d);
          const n = docs.length;
          const suite = !avecPlan ? '' : avecPlan === n ? (n > 1 ? ', chacun suivi de son plan cadastral' : ', suivi du plan cadastral') : `, ${avecPlan} suivi${avecPlan > 1 ? 's' : ''} du plan cadastral`;
          majMessageConstitution(`${n} courrier${n > 1 ? 's' : ''}${suite}, dans un seul PDF ouvert pour l’impression.`);
        }
      } else {
        await rangerConstitution(fichiers);
      }
    } catch (err) {
      if (fenetre) fenetre.close();
      console.error('Constitution de dossier :', err);
      noterVerificationPoste('constitution-courriers', { ok: false, message: 'génération impossible' });
      majMessageConstitution('Génération impossible : ' + (err && err.message ? err.message : 'erreur') + ' (la première fois, le poste doit pouvoir télécharger les bibliothèques PDF et Word).');
    }
    e.enCours = false;
    renderConstitution();
  }

  // La constitution faite (étude 27/10 : « la constitution est terminée mais Claire ne le sait pas ») : la date sur la fiche, et la routine
  // « Constitution » de ce dossier terminée (sa carte le dit, plus de proposition).
  function noterConstitutionFaite(d) {
    if (!d) return;
    if (!d.constitutionFaiteLe) d.constitutionFaiteLe = isoAujourdhuiLocal();
    if (typeof terminerRoutineDossier === 'function') terminerRoutineDossier(d.id, 'constitution');
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
    noterConstitutionFaite(d);
    sauvegarder(d);
    majMessageConstitution(`${ranges} fichier${ranges > 1 ? 's' : ''} enregistré${ranges > 1 ? 's' : ''} dans « Constitution », dans le dossier du NAS.`);
    afficherToast(`${ranges} courrier${ranges > 1 ? 's' : ''} dans le dossier « Constitution » du NAS.`);
  }

  // Un courrier imprimé seul, suivi du plan cadastral de sa commune (étude 16/10).
  async function imprimerDocumentConstitution(id) {
    const e = cstEtat;
    const doc = documentConstitution(id);
    if (!doc || !e || e.enCours) return;
    const fenetre = ouvrirFenetreImpressionConstitution();
    e.enCours = true;
    renderConstitution();
    try {
      retenirDefuntSaisiConstitution();
      majMessageConstitution(`Préparation de « ${doc.libelle} »…`);
      const s = await genererDocumentConstitution(doc, 'pdf');
      e.sorties[id] = Object.assign({}, e.sorties[id], { pdf: s });
      const plans = doc.genre === 'vente' ? await plansPdfConstitution(groupeDuDocumentConstitution(doc)) : [];
      montrerPdfImpressionConstitution(fenetre, await fusionnerPdfConstitution([s.blob].concat(plans.map(p => p.blob))), s.nom);
      majMessageConstitution(plans.length || doc.genre !== 'vente' ? `« ${doc.libelle} » ouvert pour l’impression${plans.length ? ', suivi du plan cadastral' : ''}.` : `« ${doc.libelle} » ouvert pour l’impression, sans plan cadastral (${etatPlanConstitution(groupeDuDocumentConstitution(doc)).texte}).`);
    } catch (err) {
      if (fenetre) fenetre.close();
      console.error(err);
      afficherToast('Courrier impossible à préparer : ' + (err && err.message ? err.message : 'erreur'));
    }
    e.enCours = false;
    renderConstitution();
  }

  // « Email » sur la ligne d'un courrier : la fenêtre d'email s'il a une adresse, sinon le courrier passe par email et l'adresse est demandée.
  // Le courrier ne passe « par email » qu'une fois la fenêtre d'email acceptée (relecture 16/10 : un clic pour voir ne le retire plus de l'impression).
  async function emailDepuisLigneConstitution(id) {
    const e = cstEtat;
    const doc = documentConstitution(id);
    if (!doc || !e || e.enCours) return;
    const adresse = doc.courriel || ((doc.emails || [])[0] || {}).adresse || '';
    if (!adresse) {
      cstModeEnvoi(id, 'courriel');
      e.selection = id;
      renderConstitution();
      const champ = document.querySelector('.cst-courriel');
      if (champ) champ.focus();
      afficherToast('Adresse email du destinataire à saisir, puis « Email » à nouveau.');
      return;
    }
    e.enCours = true;
    renderConstitution();
    majMessageConstitution(`Préparation de l’email « ${doc.libelle} »…`);
    let r = { ok: false };
    try { r = await emailDocumentConstitution(id, adresse); } finally {
      e.enCours = false;
      if (r && r.ok && !doc.courriel) doc.courriel = adresse;
      if (r && r.ok && doc.mode !== 'courriel') { doc.mode = 'courriel'; doc.modeChoisi = true; }
      majMessageConstitution('');
      if (cstEtat === e) renderConstitution();
    }
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
  // « Demande - » en tête (étude 18/10).
  function objetEmailConstitution(doc, d, defunt, groupe) {
    const ref = d && d.referenceAuthentic ? ` — Réf. ${d.referenceAuthentic}` : '';
    if (doc.genre === 'succession' && defunt) {
      const qui = [defunt.civilite, defunt.prenoms, defunt.nom].filter(Boolean).join(' ');
      return `Demande - Succession de ${qui || 'à compléter'}${ref}`;
    }
    return `Demande - ${doc.modele === 'autre' ? 'Renseignements' : doc.libelle}${groupe && groupe.adresseImmeuble ? ' — ' + groupe.adresseImmeuble : ''}${ref}`;
  }

  // Un courrier par email : le texte du courrier dans le corps, la fenêtre d'email s'ouvre pour relire et envoyer (rien ne part seul).
  async function emailDocumentConstitution(id, adresseChoisie) {
    const e = cstEtat;
    const doc = documentConstitution(id);
    const d = dossierConstitution();
    if (!doc || !d) return { ok: false };
    const destinataire = adresseChoisie || doc.courriel;
    if (!destinataire) { afficherToast('Adresse email du destinataire à saisir.'); return { ok: false }; }
    try {
      retenirDefuntSaisiConstitution();
      const { texte, suite } = corpsEmailCourrierConstitution(documentFideleConstitution(doc, { pourEmail: true }));
      // Le courrier toujours joint en PDF (étude 18/10 : « parfois il manque le courrier en pièce jointe »).
      const pieces = [];
      const s = await genererDocumentConstitution(doc, 'pdf');
      pieces.push({ nom: s.nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(s.blob) });
      // Courrier de vente : le plan cadastral surligné de la commune joint (étude 15/10).
      if (doc.genre === 'vente') {
        const g = groupeDuDocumentConstitution(doc);
        if (g && g.plan && g.plan.etat !== 'fini') majMessageConstitution(`Plan cadastral de ${g.commune} : attente de cadastre.gouv.fr…`);
        for (const p of await plansPdfConstitution(g)) pieces.push({ nom: p.nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(p.blob) });
      }
      // Un autre dossier choisi pendant l'attente : rien n'est préparé avec un mélange des deux.
      if (cstEtat !== e) return { ok: false };
      const r = await livrerEmailDossier({ destinataire, sujet: objetEmailConstitution(doc, d, cstEtat.defunt && cstEtat.defunt.champs, groupeDuDocumentConstitution(doc)),
        corps: texte + (suite ? '\n\nVous trouverez ci-joint le questionnaire à nous retourner.' : ''), pieces, responsableSignature: d.responsable, dossierId: d.id, geste: 'constitution' });
      if (r && r.ok) {
        doc.envoyeLe = new Date().toISOString();
        ajouterHistorique(d, `Courrier « ${doc.libelle} » préparé par email pour ${destinataire}`);
        sauvegarder(d);
      }
      return r || { ok: false };
    } catch (err) { console.error(err); afficherToast('Email impossible à préparer : ' + (err && err.message ? err.message : 'erreur')); return { ok: false }; }
  }

  // ---- Un seul email à la mairie (étude 18/10 : « permettre un envoi groupé des PDF dans un seul email à la mairie avec un seul plan ») ----

  // Pure : les courriers cochés d'une commune adressés à sa mairie (une démarche en ligne n'en est pas un).
  function courriersMairieGroupeConstitution(documents, cleGroupe) {
    return (documents || []).filter(x => x && x.genre === 'vente' && x.groupe === cleGroupe && x.destinataire === 'mairie' && x.actif && x.mode !== 'en-ligne');
  }

  var DEMANDES_GROUPEES_MAIRIE = {
    alignement: 'un certificat de numérotage et un certificat d’alignement,',
    numerotage: 'un certificat de numérotage,',
    alignementSeul: 'un certificat d’alignement,',
    peril: 'votre réponse sur l’existence d’un arrêté de péril, de mise en sécurité ou d’insalubrité,',
    assainissement: 'votre réponse sur la situation de l’immeuble au regard de l’assainissement (questionnaire joint, à nous retourner),'
  };

  // Pure : le texte de l'email groupé (premier jet de CLAIRE) — l'immeuble, ses parcelles, une ligne par demande ; les courriers et le plan joints.
  function corpsEmailGroupeMairieConstitution(docs, groupe) {
    const parcelles = ((groupe && groupe.parcelles) || []).filter(p => p.actif).map(p => [p.prefixe, p.section, p.numero].filter(Boolean).join(' '));
    const demandes = docs.map(x => `- ${DEMANDES_GROUPEES_MAIRIE[x.modele] || (x.libelle + ',')}`);
    if (demandes.length) demandes[demandes.length - 1] = demandes[demandes.length - 1].replace(/,$/, '.');
    const immeuble = String((groupe && groupe.adresseImmeuble) || '').trim();
    return ['Madame, Monsieur,', '',
      `Concernant un immeuble situé à ${immeuble || '[adresse à compléter]'}${parcelles.length ? `, cadastré ${parcelles.join(', ')}` : ''}, je vous serais très obligé de bien vouloir me faire parvenir dans les meilleurs délais possibles :`, '',
      ...demandes, '',
      `Vous trouverez ci-joint${docs.length > 1 ? ' nos courriers' : ' notre courrier'} et le plan cadastral de l’immeuble.`, '',
      'Dans l\'attente de vous lire, et avec mes remerciements anticipés,', '',
      'Je vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.'].join('\n');
  }

  // Pure : l'objet de l'email groupé.
  function objetEmailGroupeMairieConstitution(docs, groupe, d) {
    const quoi = docs.map(x => (COURRIERS_VENTE.concat(COURRIERS_ALIGNEMENT_SEPARES).find(c => c.cle === x.modele) || {}).court || x.libelle).join(', ');
    return `Demande - ${quoi}${groupe && groupe.adresseImmeuble ? ' — ' + groupe.adresseImmeuble : ''}${d && d.referenceAuthentic ? ' — Réf. ' + d.referenceAuthentic : ''}`;
  }

  async function emailGroupeMairieConstitution(cleGroupe) {
    const e = cstEtat;
    const d = dossierConstitution();
    if (!e || !d || e.enCours) return;
    const g = e.groupes.find(x => x.cle === cleGroupe);
    const docs = courriersMairieGroupeConstitution(e.documents, cleGroupe);
    if (!g || !docs.length) { afficherToast('Aucun courrier coché pour cette mairie.'); return; }
    const adresse = docs.map(x => x.courriel || ((x.emails || [])[0] || {}).adresse || '').find(Boolean) || '';
    if (!adresse) {
      cstModeEnvoi(docs[0].id, 'courriel');
      e.selection = docs[0].id;
      renderConstitution();
      const champ = document.querySelector('.cst-courriel');
      if (champ) champ.focus();
      afficherToast('Adresse email de la mairie à saisir, puis « Un seul email à la mairie » à nouveau.');
      return;
    }
    e.enCours = true;
    renderConstitution();
    let r = { ok: false };
    try {
      retenirDefuntSaisiConstitution();
      const pieces = [];
      for (const x of docs) {
        majMessageConstitution(`Préparation de « ${x.libelle} »…`);
        const sortie = await genererDocumentConstitution(x, 'pdf');
        pieces.push({ nom: sortie.nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(sortie.blob) });
      }
      if (g.plan && g.plan.etat !== 'fini') majMessageConstitution(`Plan cadastral de ${g.commune} : attente de cadastre.gouv.fr…`);
      for (const p of await plansPdfConstitution(g)) pieces.push({ nom: p.nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(p.blob) });
      if (cstEtat !== e) return;
      r = await livrerEmailDossier({ destinataire: adresse, sujet: objetEmailGroupeMairieConstitution(docs, g, d), corps: corpsEmailGroupeMairieConstitution(docs, g),
        pieces, responsableSignature: d.responsable, dossierId: d.id, geste: 'constitution' }) || { ok: false };
      if (r.ok) {
        const quand = new Date().toISOString();
        docs.forEach(x => { x.envoyeLe = quand; x.mode = 'courriel'; x.modeChoisi = true; if (!x.courriel) x.courriel = adresse; });
        ajouterHistorique(d, `Courriers à la mairie de ${g.commune} préparés dans un seul email pour ${adresse} : ${docs.map(x => x.libelle).join(', ')}`);
        sauvegarder(d);
      }
    } catch (err) { console.error(err); afficherToast('Email impossible à préparer : ' + (err && err.message ? err.message : 'erreur')); }
    finally {
      e.enCours = false;
      majMessageConstitution('');
      if (cstEtat === e) renderConstitution();
    }
  }

  // « Envoyer les emails » : les courriers cochés à envoyer par email, l'un après l'autre (une fenêtre d'email chacun) ; s'arrête à la
  // première fenêtre fermée sans envoi.
  async function envoyerEmailsConstitution() {
    const e = cstEtat;
    if (!e || e.enCours) return;
    const ids = documentsAGenererConstitution().filter(x => x.mode === 'courriel' && !x.envoyeLe).map(x => x.id);
    for (const id of ids) {
      if (cstEtat !== e) return;
      const doc = documentConstitution(id);
      if (!doc) continue;
      if (!(doc.courriel || ((doc.emails || [])[0] || {}).adresse)) { await emailDepuisLigneConstitution(id); return; }
      await emailDepuisLigneConstitution(id);
      if (!doc.envoyeLe) return;
    }
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
    return `<div class="calc-champ${o.large ? ' cst-large' : ''}${o.deux ? ' cst-deux' : ''}"><label>${escapeHtml(libelle)}</label>
      <input type="${o.type || 'text'}" class="prop-champ" value="${escapeAttr(valeur)}" placeholder="${escapeAttr(o.placeholder || '')}" oninput="${gestionnaire}(this.value)"${o.fin ? ` onchange="${o.fin}"` : ''}></div>`;
  }

  function renderDossierConstitution(d) {
    const recherche = `<div class="pr-dossier-recherche-bloc cst-recherche"><input type="search" id="cst-recherche" class="nas-choix-recherche" autocomplete="off" placeholder="${d ? 'Changer de dossier…' : 'Rechercher un dossier de vente ou de succession…'}" oninput="rechercherDossierConstitution(this.value)" onfocus="rechercherDossierConstitution(this.value)" onblur="masquerResultatsConstitution(event)" aria-label="Rechercher un dossier"><div id="cst-resultats" class="dash-recherche-resultats" style="display:none;" onmousedown="event.preventDefault()"></div></div>`;
    if (!d) return renderAccueilConstitution();
    const typeTexte = cstEtat.type === 'succession' ? 'Succession' : 'Vente';
    return `<div class="cst-barre">
        <div class="cst-dossier">
          <strong class="cst-dossier-titre">${escapeHtml(libelleDossierAffiche(d))}</strong>
          <span class="dot-label dl-neutre"><span class="dot"></span>${typeTexte}</span>
          <span class="cst-dossier-info">Réf. <strong>${escapeHtml(d.referenceAuthentic || '—')}</strong></span>
          <span class="cst-dossier-info">${escapeHtml(d.responsable || '—')}</span>
          <span class="cst-dossier-info">NAS <strong>${d.nasDossier ? 'relié' : 'non relié'}</strong></span>
          <wa-button appearance="outlined" size="s" type="button" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">${icone('file-text')} Ouvrir la fiche</wa-button>
          <wa-button appearance="outlined" size="s" type="button" onclick="effacerConstitution()" title="Tout remettre à zéro et revenir au choix du dossier">${icone('rotate-ccw')} Effacer</wa-button>
        </div>${recherche}</div>`;
  }

  // Page d'accueil (étude 18/10 : « rendre plus attractive la première page pour choisir le dossier », « une première page centrale ») :
  // au centre, la recherche, puis les derniers dossiers ouverts par le collaborateur (sinon les dossiers en cours), d'un clic.
  function dossiersAccueilConstitution() {
    const actifs = (dossiers || []).filter(x => x && !x.deleted && !x.archive);
    const recents = dossiersConsultesRecents(lireDossiersConsultes(), actifs).map(x => x.dossier);
    return recents.concat(actifs.filter(x => !recents.includes(x))).slice(0, 6);
  }
  function renderAccueilConstitution() {
    const cartes = dossiersAccueilConstitution().map(x => {
      const succ = estSuccession(x);
      return `<button type="button" class="cst-accueil-carte" onclick="choisirDossierConstitution('${escapeOnclickArg(x.id)}')">
          <span class="cst-accueil-carte-icone ${succ ? 'succ' : 'vente'}" aria-hidden="true">${icone(succ ? 'users' : 'home')}</span>
          <span class="cst-accueil-carte-texte"><span class="cst-accueil-carte-titre">${escapeHtml(libelleDossierAffiche(x))}</span>
          <span class="cst-accueil-carte-sous">${escapeHtml([succ ? 'Succession' : 'Vente', x.referenceAuthentic, x.responsable].filter(Boolean).join(' · '))}</span></span>
        </button>`;
    }).join('');
    return `<div class="cst-accueil">
        <span class="cst-accueil-icone" aria-hidden="true">${icone('file-text')}</span>
        <h2 class="cst-accueil-titre">Quel dossier constituer ?</h2>
        <p class="cst-accueil-sous">Courriers préparés d’après la fiche du dossier.</p>
        <div class="pr-dossier-recherche-bloc cst-recherche cst-accueil-recherche"><input type="search" id="cst-recherche" class="nas-choix-recherche" autocomplete="off" placeholder="Rechercher un dossier de vente ou de succession…" oninput="rechercherDossierConstitution(this.value)" onfocus="rechercherDossierConstitution(this.value)" onblur="masquerResultatsConstitution(event)" aria-label="Rechercher un dossier"><div id="cst-resultats" class="dash-recherche-resultats" style="display:none;" onmousedown="event.preventDefault()"></div></div>
        ${cartes ? `<div class="cst-accueil-liste-titre"><span class="pieces-titre">${icone('clock')}<span class="pieces-titre-texte">Derniers dossiers</span></span></div><div class="cst-accueil-grille">${cartes}</div>` : ''}
      </div>`;
  }

  // « Effacer » (étude 18/10 : « permettre une remise à zéro ») : tout ce qui a été préparé est oublié, retour au choix du dossier.
  function effacerConstitution(confirme) {
    if (!cstEtat) return;
    if (cstEtat.enCours) { afficherToast('Courriers en préparation : attendez la fin pour effacer.'); return; }
    if (!confirme) { demanderConfirmation('Effacer la constitution en cours ? Les courriers préparés et les corrections faites ici sont oubliés (la fiche du dossier ne change pas).', () => effacerConstitution(true)); return; }
    cstEtat = null;
    renderConstitution();
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
        <input type="text" class="prop-champ" value="${escapeAttr(g.adresseImmeuble)}" oninput="cstGroupe('${k}', 'adresseImmeuble', this.value); majApercuConstitution()" aria-label="Adresse de l’immeuble dans les courriers" placeholder="Adresse de l’immeuble dans les courriers" title="Adresse de l’immeuble, telle qu’elle s’écrit dans les courriers">
        <div class="cst-parcelles">${lignes || '<p class="hint">Aucune parcelle relevée dans Authentic : ajoutez-la.</p>'}</div>
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
    const f = (champ, libelle, type, placeholder, large, deux) => champConstitution(libelle, c[champ], `cstDefuntApercu.bind(null, '${champ}')`, { type, placeholder, large, deux, fin: 'cstDefuntFin()' });
    return `<p class="cst-source-ligne">${puceSourceConstitution(df.source)}${(df.champs.regime || df.regime) || df.situation ? ` <span class="hint">${escapeHtml(df.situation || '')}${(df.champs.regime || df.regime) ? ' · régime : ' : ''}${(df.champs.regime || df.regime) ? `<strong>${escapeHtml((df.champs.regime || df.regime))}</strong>` : ''}</span>` : ' <span class="hint">Régime matrimonial non renseigné dans Authentic.</span>'}</p>
      ${df.avertissements.map(a => `<p class="cst-alerte">${escapeHtml(a)}</p>`).join('')}
      <div class="calc-champs cst-grille">${civ}${f('prenoms', 'Prénoms', 'text', 'Alice Marcelle')}${f('nom', 'Nom', 'text', 'FRA')}
        ${f('domicile', 'Domicile', 'text', 'BRACIEUX (41250), 31 rue de Candy', true)}
        ${f('naissanceDate', 'Né(e) le', 'date')}${f('naissanceLieu', 'à', 'text', 'SAINT SOUPLET (59360)', false, true)}
        ${f('decesDate', 'Décédé(e) le', 'date')}${f('decesLieu', 'à', 'text', 'BRACIEUX (41250)', false, true)}
        <div class="calc-champ"><label>Situation</label><select class="prop-champ" onchange="cstDefunt('conjointLien', this.value); majApercuConstitution()">${['', 'Veuve de', 'Veuf de', 'Épouse de', 'Époux de', 'Divorcée de', 'Divorcé de'].map(l => `<option value="${escapeAttr(l)}"${c.conjointLien === l ? ' selected' : ''}>${l || '—'}</option>`).join('')}</select></div>
        ${f('conjointNom', 'Conjoint', 'text', 'Monsieur Maurice Charles FISCHER', false, true)}${f('regime', 'Régime matrimonial', 'text', 'Communauté légale', true)}</div>`;
  }
  function cstDefuntApercu(champ, valeur) { cstDefunt(champ, valeur); majApercuConstitution(); }

  // Pure : la ligne de destinataire montrée dans la liste (sa première ligne), « À compléter » si vide.
  function resumeDestinataireConstitution(doc) {
    if (doc.mode === 'en-ligne') return doc.note || '';
    return (doc.lignes || []).filter(Boolean).slice(0, 2).join(', ');
  }

  // Une ligne par courrier (étude 16/10 : « plus compact ; à chaque courrier possibilité de l'envoyer par email, de l'imprimer ou de le
  // sortir en PDF ») : case, titre et destinataire, puis Email · Imprimer · PDF. Le courrier choisi déplie son édition sous sa ligne ;
  // l'aperçu est à droite.
  function renderItemConstitution(doc) {
    const idDoc = escapeOnclickArg(doc.id);
    const choisi = cstEtat.selection === doc.id;
    const dest = resumeDestinataireConstitution(doc);
    if (doc.mode === 'en-ligne') {
      // Une démarche en ligne n'est pas « éteinte » : son lien est le geste (jamais grisé).
      return `<div class="cst-item cst-enligne"><span class="cst-item-switch"></span><span class="cst-item-texte"><span class="cst-item-titre">${escapeHtml(doc.libelle)}</span><span class="cst-item-dest">${escapeHtml(dest)}</span>${doc.url && /^https:\/\//.test(doc.url) ? `<a class="cst-gnau-lien" href="${escapeAttr(doc.url)}" target="_blank" rel="noopener">${icone('link')}${escapeHtml(doc.lien || 'Ouvrir la démarche')}</a>` : ''}</span><span class="dot-label dl-success"><span class="dot"></span>En ligne</span></div>`;
    }
    const memes = cstEtat.documents.filter(x => x.modele === doc.modele && x.genre === doc.genre && x.groupe === doc.groupe);
    const rang = memes.length > 1 ? ` ${memes.indexOf(doc) + 1}` : '';
    // Adresse vide : l'édition s'ouvre seule (il faut la saisir) ; sinon, le bouton « Modifier » (étude 28/10 : « simplement des lignes cochées »).
    const adresseVide = !dest;
    if (choisi && adresseVide) cstEtat.edition = doc.id;
    const edite = choisi && cstEtat.edition === doc.id;
    return `<div class="cst-item${choisi ? ' choisi' : ''}${doc.actif ? '' : ' cst-off'}" onclick="cstChoisirDoc('${idDoc}')">
        <span class="cst-item-switch" onclick="event.stopPropagation()"><wa-switch size="s"${doc.actif ? ' checked' : ''} onchange="cstBasculerDoc('${idDoc}', this.checked)" aria-label="Préparer ce courrier"></wa-switch></span>
        <span class="cst-item-texte"><span class="cst-item-titre">${escapeHtml(doc.libelle)}${rang}</span>
          <span class="cst-item-dest${dest ? '' : ' manque'}">${escapeHtml(dest || 'Destinataire à compléter')}</span></span>
        <span class="cst-item-actions">
          ${edite && adresseVide ? '' : `<wa-button appearance="outlined" size="s" type="button" onclick="event.stopPropagation(); cstModifierDoc('${idDoc}')">${edite ? 'Fermer' : 'Modifier'}</wa-button>`}
          ${doc.genre === 'succession' ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" title="Un autre courrier du même genre (une seconde banque…)" onclick="event.stopPropagation(); cstDupliquerDoc('${idDoc}')">${icone('plus')}</wa-button>` : ''}
          ${doc.ajoute ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" title="Retirer ce courrier" onclick="event.stopPropagation(); cstRetirerDoc('${idDoc}')">${icone('x')}</wa-button>` : ''}
        </span>
      </div>${edite ? `<div class="cst-item-edition">${renderEditeurConstitution(doc)}</div>` : ''}`;
  }

  function renderListeCourriersConstitution() {
    const e = cstEtat;
    if (e.type === 'vente') {
      return e.groupes.map(g => `<div class="cst-commune-courriers">
          <div class="cst-liste-titre"><span>${escapeHtml(g.commune)}${g.cp ? ' (' + escapeHtml(g.cp) + ')' : ''}</span></div>
          ${e.documents.filter(x => x.groupe === g.cle).map(renderItemConstitution).join('')}
          <div class="cst-ajout cst-ajout-courrier"><wa-button appearance="outlined" size="s" class="bouton-ajout" type="button" onclick="cstAjouterViergeVente('${escapeOnclickArg(g.cle)}')"><span slot="start" class="bouton-ajout-plus">+</span>Courrier à un autre organisme</wa-button>${renderSeparerAlignementConstitution(g)}</div></div>`).join('');
    }
    const modeles = MODELES_COURRIER_SUCCESSION.filter(m => !m.fonds).map(m => `<option value="${escapeAttr(m.cle)}"${m.cle === 'mutuelle' ? ' selected' : ''}>${escapeHtml(m.libelle)}</option>`).join('');
    return `${e.documents.map(renderItemConstitution).join('')}
      <div class="cst-ajout cst-ajout-courrier"><select class="prop-champ" id="cst-ajout-modele" aria-label="Courrier à ajouter">${modeles}</select>
        <wa-button appearance="outlined" size="s" class="bouton-ajout" type="button" onclick="cstAjouterDoc()"><span slot="start" class="bouton-ajout-plus">+</span>Ajouter</wa-button></div>`;
  }

  // En bas (étude 16/10) : deux gestes pour toute la série — « Imprimer tout » (chaque courrier papier suivi du plan cadastral de sa
  // commune, un seul PDF) et « Enregistrer tout dans le dossier du NAS » (sous-dossier « Constitution », au format choisi).
  function renderSortieConstitution(d) {
    const e = cstEtat;
    const manques = manquesConstitution(e);
    const n = documentsAGenererConstitution().length;
    const nPapier = documentsAGenererConstitution().filter(x => x.mode !== 'courriel').length;
    const nEmail = documentsAGenererConstitution().filter(x => x.mode === 'courriel' && !x.envoyeLe).length;
    const pdfOk = typeof genererPdfAAppelFonds === 'function';
    const nas = !!d.nasDossier;
    const bascule = (actif, geste, libelle) => `<wa-button size="s" appearance="outlined" class="vue-bascule-btn${actif ? ' actif' : ''}" type="button" onclick="${geste}">${libelle}</wa-button>`;
    const bloque = e.enCours || !n || !pdfOk || !formatsChoisisConstitution().length;
    return `${manques.length ? `<details class="cst-manques"><summary>${manques.length} point${manques.length > 1 ? 's' : ''} à vérifier</summary>${manques.map(m => `<p class="cst-alerte">${escapeHtml(m)}</p>`).join('')}</details>` : ''}
      <div class="cst-choix">
        <wa-button-group label="Signature">${bascule(e.signe !== false, 'cstSigne(true)', 'Signé')}${bascule(e.signe === false, 'cstSigne(false)', 'Non signé')}</wa-button-group>
        <wa-button-group label="Format enregistré">${bascule(e.formats.pdf && !e.formats.docx, "cstFormat('pdf')", 'PDF')}${bascule(e.formats.docx && !e.formats.pdf, "cstFormat('docx')", 'Word')}</wa-button-group>
      </div>
      ${renderEmailsMairieSortieConstitution()}
      <div class="cst-actions">
        ${nEmail ? `<wa-button appearance="outlined" type="button" ${e.enCours ? 'disabled ' : ''}onclick="envoyerEmailsConstitution()" title="Une fenêtre d’email par courrier à envoyer par email : rien ne part sans « Envoyer »">${icone('mail')} Envoyer les emails (${nEmail})</wa-button>` : ''}
        <wa-button appearance="outlined" type="button" ${e.enCours || !nPapier || !pdfOk ? 'disabled ' : ''}onclick="genererConstitution('imprimer')" title="Les courriers papier cochés, chacun suivi du plan cadastral de sa commune, dans un seul PDF ouvert pour l’impression">${icone('printer')} Imprimer tout (${nPapier})</wa-button>
        ${nas ? `<wa-button variant="brand" type="button" ${bloque ? 'disabled ' : ''}onclick="genererConstitution('ranger')" title="Dans le sous-dossier « Constitution » du dossier client, créé s’il manque ; rien n’est écrasé ; un plan cadastral par commune">${icone('folder')} ${e.enCours ? 'Préparation…' : `Enregistrer tout dans le dossier du NAS (${n})`}</wa-button>` : ''}
      </div>
      ${nas ? '' : '<p class="hint">Dossier non relié au NAS : reliez-le sur la fiche pour enregistrer dans « Constitution ».</p>'}
      <p class="hint" id="cst-message">${escapeHtml(e.message || '')}</p>`;
  }
  // Étape 5 (étude 18/10 : « mettre le bouton un seul mail à la mairie en étape 5 et rajouter un plan cadastral ») : par commune, les courriers
  // de la mairie dans un seul email, avec l'état du plan cadastral joint (le tirer d'ici s'il manque).
  function renderEmailsMairieSortieConstitution() {
    const e = cstEtat;
    if (!e || e.type !== 'vente') return '';
    const blocs = e.groupes.map(g => {
      const docs = courriersMairieGroupeConstitution(e.documents, g.cle);
      if (!docs.length) return '';
      return `<div class="cst-mairie-envoi">
          <div class="cst-mairie-tete"><strong>${g.commune ? `Mairie de ${escapeHtml(g.commune)}` : 'Mairie (commune à compléter)'}</strong><span class="hint">${docs.map(x => escapeHtml(x.libelle)).join(' · ')}</span></div>
          ${renderPlanCommuneConstitution(g)}
          <wa-button appearance="outlined" type="button" class="cst-email-groupe"${e.enCours ? ' disabled' : ''} onclick="emailGroupeMairieConstitution('${escapeOnclickArg(g.cle)}')" title="Les courriers cochés pour la mairie en PDF et le plan cadastral, dans un email : rien ne part sans « Envoyer »">${icone('mail')} Un seul email à la mairie (${docs.length} courrier${docs.length > 1 ? 's' : ''} + plan)</wa-button>
        </div>`;
    }).filter(Boolean);
    return blocs.length ? `<div class="cst-mairies">${blocs.join('')}</div>` : '';
  }

  function cstSigne(oui) { if (cstEtat) { cstEtat.signe = !!oui; renderConstitution(); } }

  // Pure : les contacts du répertoire qui répondent à une recherche (organisme, service, personne, ville), 8 au plus. Pour une succession
  // (étude 15/10 : « présenter en priorité les services successions, et pas la banque pour le prêt ») : un service « successions » et
  // les thèmes des successions d'abord, les banques « prêts et mainlevées » en dernier ; à égalité, l'ordre du répertoire.
  var THEMES_SUCCESSION_REPERTOIRE = ['banquesSuccessions', 'assurances', 'social', 'maisonsRetraite', 'impots'];
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
    return liste.map(c => `<button type="button" class="dash-recherche-ligne" title="${escapeAttr([[c.organisme, c.service].filter(Boolean).join(' — '), c.adresse].filter(Boolean).join('\n'))}" onclick="cstChoisirContact('${idDoc}', '${escapeOnclickArg(c.id)}')">
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
    const occupe = cstEtat.enCours ? ' disabled' : '';
    const etatEmail = doc.envoyeLe ? 'Email préparé' : doc.mode === 'courriel' ? (doc.courriel ? `Par email : ${doc.courriel}` : 'Par email : adresse à saisir') : 'Envoyer par email';
    const action = (ic, titre, geste, classe) => `<wa-button appearance="plain" size="s" type="button" class="bouton-icone${classe ? ' ' + classe : ''}" title="${escapeAttr(titre)}" aria-label="${escapeAttr(titre)}" onclick="${geste}"${occupe}>${icone(ic)}</wa-button>`;
    const sorties = `<span class="cst-item-actions">${action('mail', etatEmail, `emailDepuisLigneConstitution('${idDoc}')`, doc.envoyeLe ? 'cst-fait' : doc.mode === 'courriel' ? 'cst-actif-email' : '')}${action('printer', doc.genre === 'vente' ? 'Imprimer (suivi du plan cadastral)' : 'Imprimer', `imprimerDocumentConstitution('${idDoc}')`)}${action('download', 'Télécharger en PDF', `telechargerDocumentConstitution('${idDoc}', 'pdf')`)}</span>`;
    return `<div class="cst-edition">
      ${doc.note ? `<p class="hint">${escapeHtml(doc.note)}</p>` : ''}
      <div class="cst-envoi">
        <wa-button-group label="Envoi"><wa-button size="s" appearance="outlined" class="vue-bascule-btn${doc.mode === 'papier' ? ' actif' : ''}" type="button" onclick="cstModeEnvoi('${idDoc}', 'papier')">Papier</wa-button><wa-button size="s" appearance="outlined" class="vue-bascule-btn${doc.mode === 'courriel' ? ' actif' : ''}" type="button" onclick="cstModeEnvoi('${idDoc}', 'courriel')">Email</wa-button></wa-button-group>
        <wa-button appearance="outlined" size="s" type="button" class="cst-word" onclick="telechargerDocumentConstitution('${idDoc}', 'docx')" title="Télécharger le courrier en Word (.docx)">Word</wa-button>
        ${sorties}
        ${doc.origine ? `<span class="hint">${/^adresse/i.test(doc.origine) ? escapeHtml(doc.origine) : `Adresse : ${escapeHtml(doc.origine)}`}</span>` : ''}
        ${doc.mode === 'courriel' ? `<input type="email" class="prop-champ cst-courriel" list="cst-emails-proposes" value="${escapeAttr(doc.courriel || '')}" placeholder="adresse@organisme.fr" oninput="cstCourriel('${idDoc}', this.value)" aria-label="Adresse email du destinataire">
          <datalist id="cst-emails-proposes">${(doc.emails || []).map(e => `<option value="${escapeAttr(e.adresse)}">${escapeHtml(e.libelle)}</option>`).join('')}</datalist>
          <span class="hint">Le texte du courrier dans l’email, le courrier joint en PDF${doc.genre === 'vente' ? ' avec le plan cadastral' : ''}.</span>` : ''}
      </div>
      <div class="cst-edition-corps">
        <div class="calc-champ"><label>Destinataire</label>
          <textarea class="prop-champ" id="cst-dest" rows="${Math.max(4, doc.lignes.length + 1)}" oninput="cstLignesDoc('${idDoc}', this.value); majApercuConstitution(); majItemConstitution()" placeholder="Nom de l’organisme&#10;Service&#10;Adresse&#10;CP VILLE">${escapeHtml(doc.lignes.join('\n'))}</textarea>
          ${retenir ? `<wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="cstRetenirAdresse('${idDoc}')" title="Garder cette adresse pour les prochains dossiers">Retenir l’adresse</wa-button>` : ''}</div>
        <div class="calc-champ cst-rep"><label>Chercher dans le répertoire</label>
          <input type="search" class="nas-choix-recherche" id="cst-rep-q" autocomplete="off" placeholder="Nom ou ville" title="Nom ou ville (Crédit Agricole, Harmonie…)" oninput="cstRechercheRepertoire(this.value)">
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
    retenirSaisieApercuConstitution();
    try {
      const assets = (window.APPEL_FONDS_MODELE && window.APPEL_FONDS_MODELE.assets) || {};
      const fidele = documentFideleConstitution(doc);
      zone.innerHTML = htmlCourrierFidele(fidele, refLignesCourrier(d), assets, cstEtat.signe !== false, { editable: true, retouchees: fidele.retouchees || [] })
        + (doc.retouches && Object.keys(doc.retouches).length ? `<div class="cst-apercu-retouches"><span class="hint">Texte corrigé sur l’aperçu.</span><wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="cstAnnulerRetouches()">Revenir au texte du modèle</wa-button></div>` : '');
      // Coupée en pages comme le papier, puis réduite pour tenir dans la colonne (595 pt), sans rien changer à ses retours à la ligne.
      const lettre = zone.querySelector('.cstp');
      if (lettre) paginerApercuCourrier(lettre);
      const r = lettre && lettre.offsetWidth ? zone.clientWidth / lettre.offsetWidth : 1;
      if (lettre && r > 0 && r < 1) lettre.style.zoom = String(Math.floor(r * 100) / 100);
      if (!zone.dataset.edition) {
        zone.dataset.edition = '1';
        zone.addEventListener('focusout', cstRetoucheApercu);
        zone.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target && ev.target.isContentEditable) { ev.preventDefault(); ev.target.blur(); } });
      }
    } catch (e) { zone.innerHTML = '<p class="hint">Aperçu impossible.</p>'; console.error(e); }
  }

  // Un paragraphe ou une ligne du destinataire corrigé sur l'aperçu : retenu sur le courrier (Word, PDF, email), l'aperçu redessiné.
  function cstRetoucheApercu(ev) {
    const el = ev.target;
    const doc = documentConstitution(cstEtat && cstEtat.selection);
    if (!doc || !el || !el.isContentEditable) return;
    const texte = texteBaliseDepuisElement(el);
    if (el.dataset.dest !== undefined) {
      // Les lignes affichées sont celles du destinataire sans ligne vide (« À compléter » quand il n'y en a aucune).
      const i = Number(el.dataset.dest);
      // Partir des lignes AFFICHÉES (l'adresse type du modèle quand le courrier n'a pas encore de destinataire), jamais de doc.lignes seul.
      const lignes = (documentFideleBrutConstitution(doc).adresse || []).map(l => String(l).trim()).filter(l => l && l !== 'À compléter');
      const affichee = i < lignes.length ? lignes[i] : '';
      if (texte === affichee || texte === 'À compléter') return;
      if (i < lignes.length) { if (texte) lignes[i] = texte; else lignes.splice(i, 1); } else if (texte) lignes.push(texte); else return;
      cstLignesDoc(doc.id, lignes.join('\n'));
      const champ = document.getElementById('cst-dest');
      if (champ) champ.value = doc.lignes.join('\n');
      majItemConstitution();
    } else if (el.dataset.ligne !== undefined) {
      const i = Number(el.dataset.ligne);
      const brut = documentFideleBrutConstitution(doc);
      const applique = documentFideleConstitution(doc);
      const avant = applique.lignes[i];
      if (typeof avant !== 'string') return;
      // Comparé à la forme que la page aurait relue (l'ordre gras/souligné et les espaces ne font pas une correction).
      const relu = document.createElement('div');
      relu.innerHTML = htmlRunsCourrier(avant);
      if (texte === texteBaliseDepuisElement(relu)) return;
      const r = Object.assign({}, doc.retouches);
      const cle = applique.retouchesParLigne && applique.retouchesParLigne[i] !== undefined ? applique.retouchesParLigne[i] : i;
      const origine = typeof brut.lignes[i] === 'string' ? brut.lignes[i] : avant;
      const de = r[cle] ? r[cle].de : origine;
      if (!String(de).trim()) return;
      let avantTexte = '';
      for (let x = i - 1; x >= 0; x--) if (typeof brut.lignes[x] === 'string' && brut.lignes[x].trim()) { avantTexte = brut.lignes[x]; break; }
      if (texte === de) delete r[cle]; else r[cle] = { de, en: texte, avant: r[cle] && r[cle].avant !== undefined ? r[cle].avant : avantTexte };
      doc.retouches = r;
    } else return;
    // Redessiné après le changement de focus : le paragraphe cliqué ensuite garde le curseur.
    setTimeout(() => {
      const a = document.activeElement;
      const cible = a && a.isContentEditable && a.closest('#cst-apercu') ? (a.dataset.dest !== undefined ? `[data-dest="${a.dataset.dest}"]` : `[data-ligne="${a.dataset.ligne}"]`) : '';
      majApercuConstitution();
      const n = cible ? document.querySelector('#cst-apercu ' + cible) : null;
      if (n) n.focus();
    }, 0);
  }
  // Un paragraphe en cours de correction quand l'écran se redessine (plan prêt, zonage lu…) : la saisie est retenue avant d'être effacée.
  function retenirSaisieApercuConstitution() {
    const actif = document.activeElement;
    if (actif && actif.isContentEditable && actif.closest && actif.closest('#cst-apercu')) cstRetoucheApercu({ target: actif });
  }
  function cstAnnulerRetouches() {
    const doc = documentConstitution(cstEtat && cstEtat.selection);
    if (!doc) return;
    delete doc.retouches;
    majApercuConstitution();
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

  // « Modifier » : sélectionne le courrier (aperçu à droite) et ouvre ou ferme son édition sous sa ligne.
  function cstModifierDoc(id) {
    if (!cstEtat || !documentConstitution(id)) return;
    cstEtat.edition = (cstEtat.selection === id && cstEtat.edition === id) ? '' : id;
    cstEtat.selection = id;
    renderConstitution();
  }

  function cstChoisirDoc(id) {
    if (!cstEtat || !documentConstitution(id)) return;
    cstEtat.selection = id;
    renderConstitution();
  }

  // ---- Étapes (étude 16/10 : « par étapes, comme pour l'ajout d'un nouveau dossier de vente », succession comprise) ----
  // Vente : Dossier · Plan · DIA et SAFER · Courriers · Imprimer. Succession : Défunt · Courriers · Imprimer. Une étape à la fois, la barre du
  // haut (celle de « Nouveau dossier ») et « Précédent / Suivant » ; l'aperçu du courrier reste à droite.
  function etapesConstitution(d) {
    const e = cstEtat;
    const vente = e.type === 'vente';
    const n = documentsAGenererConstitution().length;
    const plans = vente ? e.groupes.map(g => etatPlanConstitution(g).etat) : [];
    const z = vente && typeof zonageConstitution === 'function' ? zonageConstitution(d.preemption) : null;
    const manques = manquesConstitution(e).length;
    return [
      { cle: 'dossier', court: vente ? 'Dossier' : 'Défunt', titre: vente ? 'Vendeurs et parcelles' : 'Le défunt', sous: resumeDonneesConstitution(e) || (manques ? `${manques} à vérifier` : ''),
        html: `<div class="cst-donnees-corps">${vente ? renderDonneesVenteConstitution(d) : renderDonneesSuccessionConstitution()}</div>` },
      vente ? { cle: 'plan', court: 'Plan', titre: 'Plan cadastral', info: 'Tiré seul de cadastre.gouv.fr dès la commune connue, refait quand les parcelles changent ; joint à chaque courrier de la commune (imprimé derrière lui, joint à l’email, enregistré).',
        sous: !plans.length ? 'Aucune commune' : plans.every(p => p === 'fini') ? (plans.length > 1 ? 'Plans prêts' : 'Plan prêt') : plans.some(p => p === 'attente' || p === 'en-cours') ? 'En cours…' : 'À tirer',
        html: e.groupes.map(g => `<div class="cst-plan-commune"><strong>${escapeHtml(g.commune)}</strong>${renderPlanCommuneConstitution(g)}</div>`).join('') || '<p class="hint">Aucune commune.</p>' } : null,
      vente ? { cle: 'dia', court: 'DIA et SAFER', titre: 'DIA et SAFER', info: 'Zonage de chaque parcelle lu sur le Géoportail de l’urbanisme ; DIA (droit de préemption urbain) et SAFER déduits comme dans le Contrôle de l’urbanisme.',
        sous: e.zonageEnCours ? 'Lecture…' : z ? `DIA ${z.dia.statut === 'non' ? 'non' : z.dia.statut === 'verifier' ? '?' : 'oui'} · SAFER ${z.safer.statut === 'non' ? 'non' : z.safer.statut === 'verifier' ? '?' : 'oui'}` : 'Zonage à lire',
        html: renderZonageConstitution(d) + renderGnauConstitution() } : null,
      { cle: 'courriers', court: 'Courriers', titre: 'Courriers', compte: `${n} à préparer`, sous: `${n} à préparer`, html: renderListeCourriersConstitution() },
      { cle: 'etat-civil', court: 'État civil', titre: 'Actes d’état civil', info: 'Demande de l’acte de naissance ou de mariage de chaque personne : par Comedec (créée dans Authentic, rien n’est envoyé) ou, pour une mairie sans Comedec (ligne « APR » d’Authentic), par courrier papier du modèle de l’étude, en Word ou en PDF.',
        sous: etatCivilSousConstitution(d), html: renderEtatCivilConstitution(d) },
      { cle: 'sortie', court: 'Envoyer ou enregistrer', titre: 'Envoyer ou enregistrer', sous: d.nasDossier ? 'NAS relié' : 'NAS non relié', html: renderSortieConstitution(d) }
    ].filter(Boolean);
  }

  // Étude 24/10 : même barre que les autres outils (wa-stepper de client/44, marqueurs en carré arrondi), l'état de chaque étape en
  // description ; un clic sur une étape y mène (`wa-step-change`, écouté une fois pour toutes plus bas).
  function renderStepperConstitution(etapes) {
    const i = Math.min(Math.max(0, cstEtat.etape || 0), etapes.length - 1);
    const coche = '<span slot="icon" class="anim-etape-coche" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" pathLength="1"/></svg></span>';
    return `<div class="outil-sommaire-place cst-sommaire" id="cst-stepper"><wa-stepper class="outil-sommaire" clickable orientation="horizontal" label="Étapes de la constitution" active="${escapeAttr(etapes[i].cle)}">${etapes.map((x, k) => `<wa-step name="${escapeAttr(x.cle)}"${k < i ? ' completed data-suite' : ''}${k <= i ? ' data-avant-suite data-trait' : ''}${k <= Math.max(i, cstEtat.etapeMax || 0) ? ' data-atteinte' : ''}>${escapeHtml(x.court)}${x.sous ? `<span slot="description">${escapeHtml(x.sous)}</span>` : ''}${k < i ? coche : ''}</wa-step>`).join('')}</wa-stepper></div>`;
  }
  document.addEventListener('wa-step-change', (ev) => {
    const barre = ev.target && ev.target.closest ? ev.target.closest('#cst-stepper') : null;
    const d = barre && cstEtat ? dossierConstitution() : null;
    if (!d) return;
    const k = etapesConstitution(d).findIndex(x => x.cle === (ev.detail && ev.detail.name));
    if (k >= 0 && k !== cstEtat.etape) cstEtape(k);
  });

  // La barre des étapes redessinée seule (plan ou zonage qui avance sur une autre étape : la saisie en cours n'est pas effacée).
  function majStepperConstitution() {
    const zone = document.getElementById('cst-stepper');
    const d = dossierConstitution();
    if (zone && d && cstEtat) zone.outerHTML = renderStepperConstitution(etapesConstitution(d));
  }

  function cstEtape(i) {
    if (!cstEtat) return;
    cstEtat.etape = i;
    cstEtat.etapeMax = Math.max(cstEtat.etapeMax || 0, i); // étapes déjà atteintes : jamais pâles dans la barre
    renderConstitution();
    const z = document.getElementById('cst-stepper');
    if (z) z.scrollIntoView({ block: 'nearest' });
  }

  function renderConstitution() {
    const zone = document.getElementById('cst-corps');
    if (!zone) return;
    retenirSaisieApercuConstitution();
    const d = dossierConstitution();
    if (!cstEtat || !d) { zone.innerHTML = renderDossierConstitution(null); return; }
    if (!documentConstitution(cstEtat.selection)) {
      const premier = cstEtat.documents.find(x => x.actif && x.mode !== 'en-ligne') || cstEtat.documents.find(x => x.mode !== 'en-ligne');
      cstEtat.selection = premier ? premier.id : '';
    }
    const doc = documentConstitution(cstEtat.selection);
    const etapes = etapesConstitution(d);
    cstEtat.etape = Math.min(Math.max(0, cstEtat.etape || 0), etapes.length - 1);
    const i = cstEtat.etape;
    const x = etapes[i];
    const precedente = etapes[i - 1];
    const suivante = etapes[i + 1];
    zone.innerHTML = `${renderDossierConstitution(d)}
      ${renderStepperConstitution(etapes)}
      <div class="cst-mise-en-page">
        <div class="cst-gauche">
          <section class="calc-card cst-etape outil-champs">
            <h2 class="outil-section-tete cst-etape-tete">${escapeHtml(x.titre)}${x.compte ? ` <span class="hint">${escapeHtml(x.compte)}</span>` : ''}${x.info ? ' ' + infoBulle(x.info) : ''}</h2>
            ${x.html}
            <div class="wizard-nav cst-nav">
              ${precedente ? `<wa-button appearance="outlined" type="button" onclick="cstEtape(${i - 1})">← Précédent</wa-button>` : '<span></span>'}
              ${suivante ? `<wa-button variant="brand" type="button" onclick="cstEtape(${i + 1})">Suivant : ${escapeHtml(suivante.court)} →</wa-button>` : ''}
            </div>
          </section>
        </div>
        <div class="cst-droite">
          <div class="cst-apercu" id="cst-apercu"></div>
        </div>
      </div>`;
    majApercuConstitution();
    if (doc && doc.mode !== 'en-ligne') cstRechercheRepertoire('');
  }

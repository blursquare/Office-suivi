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
    const m = /\b(\d{5})\b/.exec(String(texte || ''));
    return m ? (m[1].startsWith('97') ? m[1].slice(0, 3) : m[1].slice(0, 2)) : '';
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
    if (!dep) return null;
    const memeDep = candidats.filter(c => departementDeTexteConstitution(c.adresse) === dep);
    return memeDep.length === 1 ? memeDep[0] : null;
  }

  // Pure : le défunt du dossier — les champs saisis sur la fiche (d.defunt) l'emportent ; sinon la fiche client d'Authentic qui porte une
  // date de décès. { champs, source, avertissements, regime, relations }.
  function defuntConstitution(d) {
    const { fiche, autres } = defuntDepuisFiches(d);
    const saisi = (d && d.defunt) || {};
    const sm = fiche && fiche.situationMatrimoniale ? fiche.situationMatrimoniale : null;
    const civilite = civiliteLibelleConstitution(saisi.civilite || (fiche && fiche.civilite)) || 'Madame';
    const conj = conjointDefunt(sm, civilite);
    const prenoms = saisi.prenoms != null ? saisi.prenoms : (fiche ? [fiche.prenom, fiche.autresPrenoms].filter(Boolean).join(' ') : '');
    const v = (cle, depuis) => (saisi[cle] != null ? String(saisi[cle]) : String(depuis || ''));
    const lieuNaissance = fiche ? [fiche.lieuNaissance, fiche.paysNaissance && !/^france$/i.test(fiche.paysNaissance) ? fiche.paysNaissance : ''].filter(Boolean).join(', ') : '';
    const lieuDeces = fiche && fiche.deces ? [fiche.deces.lieu, fiche.deces.pays && !/^france$/i.test(fiche.deces.pays) ? fiche.deces.pays : ''].filter(Boolean).join(', ') : '';
    const champs = {
      civilite, prenoms, nom: v('nom', fiche && fiche.nomFamille),
      domicile: v('domicile', fiche && fiche.domicile ? normaliserAdresse(fiche.domicile) : ''),
      naissanceDate: v('naissanceDate', fiche && fiche.dateNaissance), naissanceLieu: v('naissanceLieu', lieuNaissance),
      decesDate: v('decesDate', fiche && fiche.deces && fiche.deces.date), decesLieu: v('decesLieu', lieuDeces),
      conjointLien: v('conjointLien', conj.lien), conjointNom: v('conjointNom', conj.nom)
    };
    const avertissements = [];
    if (!fiche) avertissements.push('Aucune fiche de défunt n’a été lue dans Authentic (la fiche de la personne décédée, avec sa date de décès) : saisissez-le ci-dessous ou ouvrez sa fiche dans Authentic.');
    if (autres.length) avertissements.push(`Plusieurs fiches portent une date de décès (${[fiche].concat(autres).map(f => f.nom).join(', ')}) : vérifiez que c’est bien le défunt retenu.`);
    if (fiche && !(fiche.deces && fiche.deces.date)) avertissements.push('La date de décès est absente de la fiche.');
    return { champs, source: fiche ? `Fiche Authentic de ${fiche.nom}` : '', avertissements,
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
    const type = estSuccession(d) ? 'succession' : 'vente';
    cstEtat = { dossierId: id, type, message: '', formats: { pdf: true, docx: false }, sorties: {}, enCours: false, documents: [], proprietaires: [], groupes: [], defunt: null, nouveauModele: '' };
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
          docs.push({ id, genre: 'vente', modele: c.cle, groupe: g.cle, libelle: c.libelle, mode: circuit.mode, courriel: circuit.courriel, note: circuit.note, destinataire: circuit.destinataire,
            actif: circuit.mode === 'en-ligne' ? false : (ancien ? ancien.actif : true),
            lignes: ancien && ancien.modifie ? ancien.lignes : lignes, modifie: !!(ancien && ancien.modifie), modeleRetenu: circuit.destinataire !== 'mairie' && circuit.destinataire !== 'blois-en-ligne' });
        });
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
      return { id, genre: 'succession', modele, libelle: m ? m.libelle : modele, mode: 'papier', courriel: '', note: horsDep ? 'Adresse type du Loir-et-Cher : à vérifier pour un défunt domicilié ailleurs.' : '', destinataire: modele,
        actif: ancien ? ancien.actif : ORDRE_SUCCESSION_PAR_DEFAUT.includes(modele), lignes: ancien && ancien.modifie ? ancien.lignes : lignes, origine: ancien && ancien.modifie ? 'Saisi à la main' : origine,
        modifie: !!(ancien && ancien.modifie), contactId: ancien && ancien.contactId ? ancien.contactId : (contact ? contact.id : '') };
    };
    const docs = [];
    ORDRE_SUCCESSION_PAR_DEFAUT.forEach(modele => docs.push(construire(modele, 1)));
    // Les courriers ajoutés (un second établissement bancaire, la mutuelle) restent.
    e.documents.filter(x => x.ajoute).forEach(x => { docs.push(Object.assign({}, x)); });
    e.documents = docs;
  }

  // ---- Contenu et fichiers ----

  function groupeDuDocumentConstitution(doc) { return cstEtat.groupes.find(g => g.cle === doc.groupe) || null; }

  function contenuDocumentConstitution(doc) {
    const d = dossierConstitution();
    const dateIso = isoAujourdhuiLocal();
    if (doc.genre === 'vente') {
      const g = groupeDuDocumentConstitution(doc);
      const parcelles = g.parcelles.filter(p => p.actif).map(p => ({ prefixe: p.prefixe, section: p.section, numero: p.numero, lieuDit: p.lieuDit, surface: p.surface }));
      return contenuCourrierVente(doc.modele, { destinataire: doc.lignes, dateLettre: dateCourrierSuccession(dateIso), adresseImmeuble: g.adresseImmeuble, parcelles,
        proprietaires: cstEtat.proprietaires.map(p => ({ civilite: p.civilite, nom: p.nom, domicile: p.domicile, morale: p.morale })), reference: d.referenceAuthentic || '', nomDossier: libelleDossierAffiche(d) });
    }
    return contenuCourrierSuccession(doc.modele, { destinataire: doc.lignes, envoiParMail: false, dateIso, defunt: cstEtat.defunt.champs, suiviPar: d.responsable || '', referenceAuthentic: d.referenceAuthentic || '' });
  }

  function nomFichierDocumentConstitution(doc) {
    const d = dossierConstitution();
    if (doc.genre === 'vente') return nomFichierCourrierVente(doc.modele, (groupeDuDocumentConstitution(doc) || {}).commune || '', libelleDossierAffiche(d));
    const memes = cstEtat.documents.filter(x => x.modele === doc.modele);
    const rang = memes.indexOf(doc) + 1;
    return nomFichierCourrierSuccession(doc.modele, libelleDossierAffiche(d)) + (memes.length > 1 ? ` (${rang})` : '');
  }

  // Un courrier dans un format : { blob, nom, format }.
  async function genererDocumentConstitution(doc, format) {
    const d = dossierConstitution();
    const nom = nomFichierDocumentConstitution(doc);
    const contenu = contenuDocumentConstitution(doc);
    if (format === 'pdf') {
      const { blob } = await genererPdfAAppelFonds(null, nom + '.docx', { blocs: blocsPdfDepuisContenu(contenu), ref: d.nom || '' });
      return { blob, nom: nom + '.pdf', format };
    }
    const blob = await courrierRenduAgent(contenu, d, { signe: true });
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
    renderConstitution();
  }
  function cstAjouterDoc() {
    if (!cstEtat || cstEtat.type !== 'succession') return;
    const modele = String((document.getElementById('cst-ajout-modele') || {}).value || '');
    const m = modeleCourrierSuccession(modele);
    if (!m) return;
    const n = cstEtat.documents.filter(x => x.modele === modele).length + 1;
    cstEtat.documents.push({ id: `s:${modele}:${n}`, genre: 'succession', modele, libelle: m.libelle, mode: 'papier', courriel: '', note: '', destinataire: modele, actif: true, lignes: m.destinataire.slice(),
      origine: m.destinataire.length ? 'Adresse type du modèle' : '', modifie: false, ajoute: true, contactId: '' });
    renderConstitution();
  }
  function cstRetirerDoc(id) {
    if (!cstEtat) return;
    cstEtat.documents = cstEtat.documents.filter(x => !(x.id === id && x.ajoute));
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
    const formats = formatsChoisisConstitution();
    if (!docs.length) { afficherToast('Aucun courrier coché.'); return; }
    if (!formats.length) { afficherToast('Choisissez PDF ou Word.'); return; }
    e.enCours = true;
    renderConstitution();
    retenirDefuntSaisiConstitution();
    const fichiers = [];
    try {
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
      if (action === 'imprimer') {
        const pdfs = docs.map(x => e.sorties[x.id] && e.sorties[x.id].pdf && e.sorties[x.id].pdf.blob).filter(Boolean);
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
        body: JSON.stringify({ dossierId: d.id, nom: s.nom.replace(/\.(pdf|docx)$/i, ''), contenu: await base64DepuisBlob(s.blob), format: s.format }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erreur || `le serveur a répondu ${r.status}`); }
      ranges++;
    }
    ajouterHistorique(d, `${ranges} courrier${ranges > 1 ? 's' : ''} de constitution de dossier rangé${ranges > 1 ? 's' : ''} dans le dossier du NAS`);
    sauvegarder(d);
    majMessageConstitution(`${ranges} fichier${ranges > 1 ? 's' : ''} rangé${ranges > 1 ? 's' : ''} à la racine du dossier du NAS.`);
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

  // Courrier par courriel (Blois : numérotage et alignement) : le PDF signé en pièce jointe, texte à relire dans la fenêtre d'email.
  async function emailDocumentConstitution(id) {
    const doc = documentConstitution(id);
    const d = dossierConstitution();
    if (!doc || !d || !doc.courriel) return;
    try {
      const s = await genererDocumentConstitution(doc, 'pdf');
      const g = groupeDuDocumentConstitution(doc);
      const corps = `Bonjour,\n\nVeuillez trouver ci-joint notre demande de certificat de numérotage et d'alignement concernant l'immeuble situé à ${g ? g.adresseImmeuble : ''}.\n\nNous vous remercions de bien vouloir nous répondre à cette adresse.\n\nBien cordialement,`;
      await livrerEmailDossier({ destinataire: doc.courriel, sujet: `Demande de certificat de numérotage et d'alignement — ${libelleDossierAffiche(d)}`, corps,
        pieces: [{ nom: s.nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(s.blob) }], responsableSignature: d.responsable, dossierId: d.id, geste: 'constitution' });
    } catch (err) { console.error(err); afficherToast('Email impossible à préparer : ' + (err && err.message ? err.message : 'erreur')); }
  }

  // ---- Affichage ----

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
    const recherche = `<div class="pr-dossier-recherche-bloc"><input type="search" id="cst-recherche" class="nas-choix-recherche" autocomplete="off" placeholder="Rechercher un dossier de vente ou de succession…" oninput="rechercherDossierConstitution(this.value)" aria-label="Rechercher un dossier"><div id="cst-resultats" class="dash-recherche-resultats" style="display:none;"></div></div>`;
    if (!d) return `${recherche}<p class="hint">Rattachez un dossier : ses parties, son bien et ses références viennent de sa fiche, qui tient les données d’Authentic.</p>`;
    const typeTexte = cstEtat.type === 'succession' ? 'Succession' : 'Vente';
    return `${recherche}<div class="cst-dossier">
      <div class="cst-dossier-titre"><strong>${escapeHtml(libelleDossierAffiche(d))}</strong> <span class="dot-label dl-neutre"><span class="dot"></span>${typeTexte}</span></div>
      <div class="cst-dossier-infos">
        <span>Référence : <strong>${escapeHtml(d.referenceAuthentic || '— (pas encore relevée dans Authentic)')}</strong></span>
        <span>En charge : <strong>${escapeHtml(d.responsable || '—')}</strong></span>
        <span>Dossier du NAS : <strong>${d.nasDossier ? 'relié' : 'non relié'}</strong></span>
        <wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">Ouvrir la fiche</wa-button>
      </div></div>`;
  }

  function renderDonneesVenteConstitution(d) {
    const e = cstEtat;
    const proprios = e.proprietaires.map((p, i) => `<div class="cst-ligne">
        <select class="prop-champ cst-civilite" onchange="cstProprietaire(${i}, 'civilite', this.value)" aria-label="Civilité">${['', 'Monsieur', 'Madame', 'Mademoiselle'].map(c => `<option value="${c}"${p.civilite === c ? ' selected' : ''}>${c || '—'}</option>`).join('')}</select>
        <input type="text" class="prop-champ" value="${escapeAttr(p.nom)}" oninput="cstProprietaire(${i}, 'nom', this.value)" aria-label="Nom du vendeur">
        <input type="text" class="prop-champ cst-domicile" value="${escapeAttr(p.domicile)}" placeholder="${p.morale ? 'Siège de la société' : 'Domicile : COMMUNE (CP), voie'}" oninput="cstProprietaire(${i}, 'domicile', this.value)" onchange="renderConstitution()" aria-label="Domicile">
        ${puceSourceConstitution(p.source)}
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone" title="Retirer ce vendeur" onclick="cstRetirerProprietaire(${i})">${icone('x')}</wa-button></div>`).join('');
    const groupes = e.groupes.map(g => {
      const info = g.info || {};
      const etat = info.etat === 'chargement' ? '<span class="hint">Commune en cours de recherche…</span>'
        : info.etat === 'ok' ? `<span class="cst-puces"><span class="dot-label dl-neutre"><span class="dot"></span>INSEE ${escapeHtml(info.insee)}</span>${info.epci ? `<span class="dot-label dl-neutre"><span class="dot"></span>${escapeHtml(info.epci.nom)}</span>` : ''}${info.mairieLue ? '' : '<span class="dot-label dl-urgent"><span class="dot"></span>Mairie : annuaire injoignable</span>'}</span>`
        : `<span class="dot-label dl-urgent"><span class="dot"></span>Commune non retrouvée${info.ambigu && info.ambigu.length ? ' (plusieurs possibles)' : ''} : l’adresse de la mairie est à saisir</span>`;
      const lignes = g.parcelles.map((p, i) => `<label class="cst-parcelle${p.actif ? '' : ' cst-off'}"><input type="checkbox"${p.actif ? ' checked' : ''} onchange="cstParcelleActive('${escapeOnclickArg(g.cle)}', ${i}, this.checked)">
          <span class="cst-parcelle-ref">${escapeHtml([p.prefixe, p.section, p.numero].filter(Boolean).join(' '))}</span><span class="cst-parcelle-lieu">${escapeHtml(p.lieuDit)}</span><span class="cst-parcelle-surf">${escapeHtml(p.surface)}</span>
          <span class="dot-label ${p.origine === 'Saisie' ? 'dl-urgent' : 'dl-success'} cst-source"><span class="dot"></span>${escapeHtml(p.origine)}</span></label>`).join('');
      const k = escapeOnclickArg(g.cle);
      const idc = escapeAttr(g.cle);
      return `<div class="cst-commune"><div class="cst-commune-tete"><strong>${escapeHtml(g.commune)}${g.cp ? ' (' + escapeHtml(g.cp) + ')' : ''}</strong>${g.principale ? ' <span class="hint">commune du bien</span>' : ''} ${etat}</div>
        <div class="calc-champ cst-large"><label>Adresse de l’immeuble, telle qu’elle s’écrit dans les courriers</label><input type="text" class="prop-champ" value="${escapeAttr(g.adresseImmeuble)}" oninput="cstGroupe('${k}', 'adresseImmeuble', this.value)"></div>
        <div class="cst-parcelles">${lignes || '<p class="hint">Aucune parcelle relevée dans Authentic pour cette commune : ajoutez-la.</p>'}</div>
        <div class="cst-ajout"><input type="text" class="prop-champ" id="cst-np-section-${idc}" placeholder="Section" maxlength="3" aria-label="Section"><input type="text" class="prop-champ" id="cst-np-numero-${idc}" placeholder="N°" maxlength="5" aria-label="Numéro">
          <input type="text" class="prop-champ" id="cst-np-lieudit-${idc}" placeholder="Adresse ou lieu-dit" aria-label="Lieu-dit"><input type="text" class="prop-champ" id="cst-np-surface-${idc}" placeholder="18 a 22 ca" aria-label="Contenance">
          <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="cstAjouterParcelle('${k}')">Ajouter la parcelle</wa-button></div></div>`;
    }).join('');
    const autres = (d && d.authentic && Array.isArray(d.authentic.immeubles) && d.authentic.immeubles.length > 1)
      ? `<p class="hint">Authentic compte ${d.authentic.immeubles.length} immeubles : toutes leurs parcelles sont reprises ci-dessous.</p>` : '';
    return `<h3 class="cst-sous-titre">Vendeurs <span class="info-i" tabindex="0" data-info="Tous les vendeurs de la fiche, avec le domicile de leur fiche client d’Authentic. Une fiche non lue : ouvrez-la dans Authentic ou saisissez le domicile.">i</span></h3>
      ${proprios || '<p class="hint">Aucun vendeur sur la fiche.</p>'}
      <div class="cst-ajout"><wa-button appearance="outlined" class="bouton-ajout" type="button" onclick="cstAjouterProprietaire()"><span slot="start" class="bouton-ajout-plus">+</span>Ajouter un vendeur</wa-button></div>
      <h3 class="cst-sous-titre">Immeuble et parcelles par commune</h3>${autres}${groupes}
      <div class="cst-ajout"><input type="text" class="prop-champ" id="cst-nc-nom" placeholder="Autre commune du bien" aria-label="Autre commune"><input type="text" class="prop-champ" id="cst-nc-cp" placeholder="Code postal" maxlength="5" aria-label="Code postal">
        <wa-button appearance="outlined" class="bouton-ajout" type="button" onclick="cstAjouterCommune()"><span slot="start" class="bouton-ajout-plus">+</span>Ajouter une commune</wa-button></div>`;
  }

  function renderDonneesSuccessionConstitution() {
    const df = cstEtat.defunt;
    const c = df.champs;
    const civ = `<div class="calc-champ"><label>Civilité</label><select class="prop-champ" onchange="cstDefunt('civilite', this.value); cstDefuntFin()"><option${c.civilite === 'Madame' ? ' selected' : ''}>Madame</option><option${c.civilite === 'Monsieur' ? ' selected' : ''}>Monsieur</option></select></div>`;
    const f = (champ, libelle, type, placeholder, large) => champConstitution(libelle, c[champ], `cstDefunt.bind(null, '${champ}')`, { type, placeholder, large, fin: 'cstDefuntFin()' });
    return `<p class="cst-source-ligne">${puceSourceConstitution(df.source)} <span class="hint">${df.source ? 'Date de décès, naissance, domicile et situation : lus dans la fiche du défunt dans Authentic.' : ''}</span></p>
      ${df.avertissements.map(a => `<p class="cst-alerte">${escapeHtml(a)}</p>`).join('')}
      <div class="calc-champs cst-grille">${civ}${f('prenoms', 'Prénoms', 'text', 'Alice Marcelle')}${f('nom', 'Nom', 'text', 'FRA')}
        ${f('domicile', 'Domicile', 'text', 'BRACIEUX (41250), 31 rue de Candy', true)}
        ${f('naissanceDate', 'Date de naissance', 'date')}${f('naissanceLieu', 'Lieu de naissance', 'text', 'SAINT SOUPLET (59360)')}
        ${f('decesDate', 'Date de décès', 'date')}${f('decesLieu', 'Lieu de décès', 'text', 'BRACIEUX (41250)')}
        <div class="calc-champ"><label>Situation</label><select class="prop-champ" onchange="cstDefunt('conjointLien', this.value)">${['', 'Veuve de', 'Veuf de', 'Épouse de', 'Époux de', 'Divorcée de', 'Divorcé de'].map(l => `<option value="${escapeAttr(l)}"${c.conjointLien === l ? ' selected' : ''}>${l || '— (aucune ligne)'}</option>`).join('')}</select></div>
        ${f('conjointNom', 'Conjoint', 'text', 'Monsieur Maurice Charles FISCHER')}</div>
      ${df.regime || df.situation ? `<p class="hint cst-regime">Situation matrimoniale d’Authentic : ${escapeHtml(df.situation || '—')}${df.regime ? ` · régime : <strong>${escapeHtml(df.regime)}</strong>` : ''}</p>` : '<p class="hint cst-regime">Régime matrimonial : non renseigné dans Authentic.</p>'}`;
  }

  function renderDocumentConstitution(doc) {
    const idDoc = escapeOnclickArg(doc.id);
    const modeTexte = doc.mode === 'courriel' ? 'Par courriel' : doc.mode === 'en-ligne' ? 'Sur le site de la Ville' : 'Papier';
    const puceMode = `<span class="dot-label ${doc.mode === 'papier' ? 'dl-neutre' : 'dl-success'}"><span class="dot"></span>${modeTexte}</span>`;
    if (doc.mode === 'en-ligne') return `<div class="cst-doc cst-off"><div class="cst-doc-tete"><strong>${escapeHtml(doc.libelle)}</strong> ${puceMode}</div><p class="hint">${escapeHtml(doc.note)}</p></div>`;
    const contacts = doc.genre === 'succession' ? candidatsRepertoireConstitution(doc.modele, typeof repertoireContacts !== 'undefined' ? repertoireContacts : []) : [];
    const choix = contacts.length
      ? `<select class="prop-champ cst-contact" onchange="cstChoisirContact('${idDoc}', this.value)" aria-label="Destinataire du répertoire"><option value="">Choisir dans le répertoire…</option>${contacts.map(c => `<option value="${escapeAttr(c.id)}"${doc.contactId === c.id ? ' selected' : ''}>${escapeHtml([c.organisme, c.service].filter(Boolean).join(' — '))}</option>`).join('')}</select>` : '';
    const retenir = doc.genre === 'vente' ? doc.modeleRetenu : true;
    const aSortie = cstEtat.sorties[doc.id] || {};
    return `<div class="cst-doc${doc.actif ? '' : ' cst-off'}"><div class="cst-doc-tete"><wa-switch${doc.actif ? ' checked' : ''} onchange="cstBasculerDoc('${idDoc}', this.checked)"></wa-switch>
        <strong>${escapeHtml(doc.libelle)}</strong> ${puceMode}${doc.origine ? ` <span class="hint">${escapeHtml(doc.origine)}</span>` : ''}
        ${doc.ajoute ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" title="Retirer ce courrier" onclick="cstRetirerDoc('${idDoc}')">${icone('x')}</wa-button>` : ''}</div>
      ${doc.note ? `<p class="hint">${escapeHtml(doc.note)}</p>` : ''}
      <div class="cst-doc-corps"><div class="calc-champ"><label>Destinataire (une ligne par ligne d’adresse)</label>
          <textarea class="prop-champ" rows="${Math.max(3, Math.min(6, doc.lignes.length + 1))}" oninput="cstLignesDoc('${idDoc}', this.value)" placeholder="Nom de l’organisme, adresse…">${escapeHtml(doc.lignes.join('\n'))}</textarea>${choix}</div>
        <div class="cst-doc-actions">
          ${doc.courriel ? `<span class="hint">${escapeHtml(doc.courriel)}</span><wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="emailDocumentConstitution('${idDoc}')">Préparer l’email</wa-button>` : ''}
          ${retenir && doc.actif ? `<wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="cstRetenirAdresse('${idDoc}')" title="Garder cette adresse pour les prochains dossiers">Retenir l’adresse</wa-button>` : ''}
          <wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="telechargerDocumentConstitution('${idDoc}', 'pdf')">PDF</wa-button>
          <wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="telechargerDocumentConstitution('${idDoc}', 'docx')">Word</wa-button>
          ${aSortie.pdf || aSortie.docx ? '<span class="dot-label dl-success"><span class="dot"></span>Prêt</span>' : ''}</div></div></div>`;
  }

  function renderCourriersConstitution(d) {
    const e = cstEtat;
    if (e.type === 'vente') {
      const gnau = e.groupes.map(g => {
        const info = g.info || {};
        const depot = info.depot || {};
        const note = noteGuichetCommune(info.insee);
        const chailles = String(info.insee || '') === INSEE_CHAILLES;
        const lien = chailles ? URL_GNAU_CHAILLES : lienDepotDiaSur(depot.url);
        const ligne = chailles ? `Guichet unique de Chailles (SIRAP) — <a href="${escapeAttr(URL_GNAU_CHAILLES)}" target="_blank" rel="noopener">ouvrir</a>` : depot.mode === 'guichet' || depot.plateforme ? `${escapeHtml(depot.plateforme || 'Guichet unique')}${lien ? ` — <a href="${escapeAttr(lien)}" target="_blank" rel="noopener">ouvrir</a>` : ''}` : 'guichet non relevé : à vérifier auprès de la mairie';
        return `<div class="cst-doc cst-off"><div class="cst-doc-tete"><strong>Certificat d’urbanisme et DIA — ${escapeHtml(g.commune)}</strong> <span class="dot-label dl-success"><span class="dot"></span>Sur le GNAU</span></div>
          <p class="hint">Pas de courrier : ${ligne}.${note ? ' ' + escapeHtml(note) : ''}</p></div>`;
      }).join('');
      return e.groupes.map(g => `<h3 class="cst-sous-titre">${escapeHtml(g.commune)}</h3>${e.documents.filter(x => x.groupe === g.cle).map(renderDocumentConstitution).join('')}`).join('') + `<h3 class="cst-sous-titre">Guichets uniques</h3>${gnau}`;
    }
    const modeles = MODELES_COURRIER_SUCCESSION.map(m => `<option value="${escapeAttr(m.cle)}"${m.cle === 'mutuelle' ? ' selected' : ''}>${escapeHtml(m.libelle)}</option>`).join('');
    return `${e.documents.map(renderDocumentConstitution).join('')}
      <div class="cst-ajout"><select class="prop-champ" id="cst-ajout-modele" aria-label="Courrier à ajouter">${modeles}</select>
        <wa-button appearance="outlined" class="bouton-ajout" type="button" onclick="cstAjouterDoc()"><span slot="start" class="bouton-ajout-plus">+</span>Ajouter un courrier</wa-button>
        <span class="hint">un second établissement bancaire, la mutuelle…</span></div>`;
  }

  function renderSortieConstitution(d) {
    const e = cstEtat;
    const manques = manquesConstitution(e);
    const n = documentsAGenererConstitution().length;
    const pdfOk = typeof genererPdfAAppelFonds === 'function';
    return `${manques.length ? `<div class="cst-alerte-bloc"><strong>À vérifier avant d’envoyer</strong>${manques.map(m => `<p class="cst-alerte">${escapeHtml(m)}</p>`).join('')}</div>` : ''}
      <div class="cst-formats"><label class="reglages-option"><span>PDF signé et tamponné (PDF/A)</span><wa-switch${e.formats.pdf ? ' checked' : ''} onchange="cstFormat('pdf', this.checked)"></wa-switch></label>
        <label class="reglages-option"><span>Word (tamponné aussi, à retoucher)</span><wa-switch${e.formats.docx ? ' checked' : ''} onchange="cstFormat('docx', this.checked)"></wa-switch></label></div>
      <div class="reglages-actions">
        <wa-button variant="brand" pill type="button" ${e.enCours || !n || !pdfOk ? 'disabled ' : ''}onclick="genererConstitution('telecharger')">${e.enCours ? 'Préparation…' : `Tout générer (${n} courrier${n > 1 ? 's' : ''})`}</wa-button>
        <wa-button appearance="outlined" pill type="button" ${e.enCours || !n ? 'disabled ' : ''}onclick="genererConstitution('imprimer')" title="Les courriers en un seul PDF, ouvert pour l’impression">Imprimer d’un coup</wa-button>
        <wa-button appearance="outlined" pill type="button" ${e.enCours || !n || !d.nasDossier ? 'disabled ' : ''}onclick="genererConstitution('ranger')" title="${d.nasDossier ? 'À la racine du dossier du NAS, sans écraser' : 'Dossier non relié au NAS'}">Ranger dans le dossier du NAS</wa-button>
      </div>
      <p class="hint" id="cst-message">${escapeHtml(e.message || '')}</p>
      <p class="hint">Rien ne part tout seul : les courriers sont préparés, vous les relisez, les imprimez ou les envoyez.</p>`;
  }

  function renderConstitution() {
    const zone = document.getElementById('cst-corps');
    if (!zone) return;
    const d = dossierConstitution();
    if (!cstEtat || !d) {
      zone.innerHTML = `<div class="calc-card"><h2 class="outil-section-tete" data-etape="dossier">Dossier</h2>${renderDossierConstitution(null)}</div>`;
      if (typeof majSommaireOutil === 'function') majSommaireOutil('constitution');
      return;
    }
    zone.innerHTML = `
      <div class="calc-card"><h2 class="outil-section-tete" data-etape="dossier">Dossier</h2>${renderDossierConstitution(d)}</div>
      <div class="calc-card"><h2 class="outil-section-tete" data-etape="donnees">${cstEtat.type === 'vente' ? 'Vendeurs et parcelles' : 'Le défunt'}</h2>${cstEtat.type === 'vente' ? renderDonneesVenteConstitution(d) : renderDonneesSuccessionConstitution()}</div>
      <div class="calc-card"><h2 class="outil-section-tete" data-etape="courriers">Courriers</h2>${renderCourriersConstitution(d)}</div>
      <div class="calc-card"><h2 class="outil-section-tete" data-etape="sortie">Sortie</h2>${renderSortieConstitution(d)}</div>`;
    if (typeof majSommaireOutil === 'function') majSommaireOutil('constitution');
  }

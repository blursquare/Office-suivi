  // ==== ANNUAIRE DES NOTAIRES (ex-carnet des confrères) ====
  //
  // Depuis le 03/10 (étude : « fusionner le carnet des confrères avec tous les notaires de France ; que
  // la fiche dossier cherche dans l'annuaire ; le carnet n'a plus lieu d'être ») : `carnetConfreres` est
  // TOUT l'annuaire des notaires de France, chaque office remplacé par sa correction quand l'étude en a
  // fait une (server/src/carnetConfreres.js, fusionnerCarnetEtAnnuaire) — le nom de la variable est resté.
  // Historique : demandé par l'étude le 29/09 : les offices avec qui elle traite, remplis une fois et proposés
  // dans chaque dossier. Partagé en base (server/src/carnetConfreres.js) ; parti de notre office
  // (toujours en tête, jamais retiré) et des 35 autres offices du Loir-et-Cher relevés sur
  // l'annuaire public immonot. Un notaire saisi sur une fiche est
  // rapproché de son office par son NOM DE FAMILLE (trouverOfficeConfrere) : l'office, sa ville,
  // son téléphone et son email s'affichent alors sous le notaire, et l'email de l'office sert aux
  // relances au confrère tant qu'aucune adresse n'est saisie sur le dossier.
  var carnetConfreres = [];
  var carnetRecherche = '';
  // Office en cours de modification sur la page du carnet ('nouveau' pour un ajout).
  var carnetEdition = null;
  var carnetBrouillon = null;

  // « Maître Paul DURAND (ORLEANS) » → { famille: 'durand', prenom: 'paul', ville: 'orleans' }.
  // Le nom de famille = les mots en capitales (convention des actes et de l'annuaire), sinon le
  // dernier mot. Minuscules, sans accents ni tirets, pour comparer. Pure.
  function decomposerNomNotaire(nom) {
    const brut = String(nom || '');
    const norm = t => normaliserPourRecherche(t).replace(/[^a-z0-9]+/g, ' ').trim();
    const ville = (brut.match(/\(([^)]*)\)/) || [])[1] || '';
    const sans = brut.replace(/\([^)]*\)/g, ' ').replace(/,.*$/, ' ')
      .replace(/^\s*(ma[iî]tre|me)\.?\s+/i, '');
    const mots = sans.split(/\s+/).filter(Boolean);
    const estCapitales = m => /^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’-]+$/.test(m);
    const capitales = mots.filter(estCapitales);
    const famille = capitales.length ? capitales.join(' ') : (mots[mots.length - 1] || '');
    const prenom = capitales.length
      ? mots.filter(m => !estCapitales(m) && !/^(de|du|des|d'|d’|le|la)$/i.test(m)).join(' ')
      : mots.slice(0, -1).join(' ');
    return { famille: norm(famille), prenom: norm(prenom), ville: norm(ville) };
  }

  // Libellé lu dans un compromis d'agence en formulaire avant le correctif du 29/09 : « Maître
  // Aurélien LACOUR Adresse (CELLETTES Notaire de l'ACQUEREUR) » → « Maître Aurélien LACOUR
  // (CELLETTES) ». L'intitulé du champ suivant est retiré du nom et de la ville. Pure.
  function nettoyerLibelleNotaire(valeur) {
    const brut = String(valeur || '').trim();
    const m = brut.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    const nom = couperNomNotaire(m ? m[1] : brut);
    const ville = m ? couperNomNotaire(m[2]).replace(/\s*:$/, '').trim() : '';
    if (!nom) return brut;
    return ville ? `${nom} (${ville})` : nom;
  }

  // Notaire nommé par son seul prénom (« Maître SOPHIE (BLOIS) », constaté sur des fiches de
  // l'étude le 29/09) : complété par le carnet quand un seul notaire de ce prénom exerce dans
  // cette ville — « Maître Sophie GOSSART (BLOIS) ». Sans ville, ou si plusieurs notaires
  // correspondent, rien n'est deviné : la valeur revient telle quelle. Pure.
  function completerNomNotaire(valeur, carnet) {
    const brut = nettoyerLibelleNotaire(valeur);
    // Notre office : toujours « Maître Sophie GOSSART (BLOIS) » (étude 05/10).
    const etude = canoniserNotaireEtude(brut);
    if (etude !== brut) return etude;
    const sans = brut.replace(/\([^)]*\)/g, ' ').replace(/^\s*(ma[iî]tre|me)\.?\s+/i, '').trim();
    const ville = ((brut.match(/\(([^)]*)\)/) || [])[1] || '').trim();
    if (!sans || !Array.isArray(carnet)) return brut;
    const norm = t => normaliserPourRecherche(t || '').replace(/[^a-z0-9]+/g, ' ').trim();
    // Un seul mot suivi d'une ville : un prénom seul (« Maître SOPHIE (BLOIS) »).
    if (!/\s/.test(sans) && ville) {
      const prenom = norm(sans);
      const cibleVille = norm(ville);
      const trouves = [];
      for (const office of carnet) {
        const lieux = [office && office.ville].concat((office && office.bureaux) || []).map(norm);
        if (!lieux.some(l => l && (' ' + l + ' ').indexOf(' ' + cibleVille + ' ') !== -1)) continue;
        for (const n of (office && office.notaires) || []) {
          if (decomposerNomNotaire(n).prenom === prenom && trouves.indexOf(n) === -1) trouves.push(n);
        }
      }
      if (trouves.length === 1) return `Maître ${trouves[0]} (${ville})`;
    }
    // Sinon, le notaire est retrouvé dans l'annuaire par son nom (et son prénom, sa ville quand ils sont écrits) : un seul
    // notaire de ce nom → « Maître Eve CHAMPION (Blois) » (étude 05/10 : retrouver les notaires dans le répertoire et compléter
    // leur nom). Une valeur déjà complète (prénom, nom et ville) n'est pas touchée.
    const c = decomposerNomNotaire(brut);
    if (c.prenom && c.ville) return brut;
    const t = notaireUniqueAnnuaire(brut, carnet);
    if (!t) return brut;
    return `Maître ${t.notaire} (${ville || t.office.ville || ''})`.replace(/\s*\(\)$/, '');
  }

  // Le seul notaire de l'annuaire qui correspond à cette saisie (nom de famille, plus prénom et ville quand ils sont écrits), ou
  // null : plusieurs notaires, plusieurs bureaux ou aucun → rien n'est deviné. Pure.
  function notaireUniqueAnnuaire(valeur, carnet) {
    const c = decomposerNomNotaire(valeur);
    if (!c.famille || !Array.isArray(carnet)) return null;
    let candidats = (indexNotairesParFamille(carnet).get(c.famille) || []).slice();
    if (c.prenom) candidats = candidats.filter(x => x.c.prenom === c.prenom);
    if (c.ville) {
      candidats = candidats.filter(x => [x.office.ville].concat(x.office.bureaux || [])
        .map(v => normaliserPourRecherche(v || '').replace(/[^a-z0-9]+/g, ' ').trim())
        .some(l => l && (' ' + l + ' ').indexOf(' ' + c.ville + ' ') !== -1));
    }
    const distincts = new Set(candidats.map(x => x.office.id + '|' + x.notaire));
    return distincts.size === 1 ? { office: candidats[0].office, notaire: candidats[0].notaire } : null;
  }

  // Notaire lu dans un compromis → sa fiche du Répertoire (étude 05/10 : « les notaires sont détectés dans le compromis et
  // recherchés directement dans le Répertoire pour trouver la correspondance ») : le libellé de l'annuaire, « Maître Prénom NOM
  // (Ville) », même quand l'acte a déjà écrit nom, prénom et ville à sa façon. Étude 07/10 : « ne plus proposer le nom du notaire lu
  // dans l'acte, trouver toujours une correspondance avec le répertoire » — le notaire de l'annuaire le plus proche est toujours
  // retenu (`notaireAnnuaireLePlusProche`) ; aucun notaire de ce nom dans l'annuaire → rien (jamais le nom brut de l'acte).
  function notaireDepuisRepertoire(valeur, carnet) {
    const brut = nettoyerLibelleNotaire(valeur);
    if (!brut) return '';
    const etude = canoniserNotaireEtude(brut);
    if (etude !== brut) return etude;
    // Annuaire pas encore chargé : rien où chercher, le nom est gardé tel quel.
    if (!Array.isArray(carnet) || !carnet.length) return brut;
    const t = notaireAnnuaireLePlusProche(brut, carnet);
    if (!t) return '';
    if (t.office && t.office.etude) return NOTAIRE_ETUDE_LIBELLE;
    return `Maître ${t.notaire}${t.office.ville ? ` (${t.office.ville})` : ''}`;
  }

  // Pure : le notaire de l'annuaire le plus proche de ce qui est écrit, ou null s'il n'y a personne de ce nom. Nom de famille
  // (un mot du nom quand l'acte écrit tout en capitales, « Maître JEAN DUPONT »), puis, par ordre : même prénom, même ville,
  // notre département, un département voisin ; à défaut de nom exact, un nom à une lettre près dans notre département ou ses voisins
  // (lecture du PDF). À égalité, l'ordre de l'annuaire.
  function notaireAnnuaireLePlusProche(valeur, carnet) {
    const c = decomposerNomNotaire(valeur);
    if (!c.famille || !Array.isArray(carnet)) return null;
    const index = indexNotairesParFamille(carnet);
    const motsFamille = c.famille.split(' ').filter(m => m.length >= 2);
    // Familles essayées : le nom tel quel, puis chaque mot (le reste devient le prénom).
    const essais = [{ famille: c.famille, prenom: c.prenom }].concat(motsFamille.length > 1
      ? motsFamille.map(m => ({ famille: m, prenom: [c.prenom].concat(motsFamille.filter(x => x !== m)).filter(Boolean).join(' ') })) : []);
    let candidats = [];
    for (const e of essais) {
      candidats = (index.get(e.famille) || []).map(x => Object.assign({ prenomLu: e.prenom }, x));
      if (candidats.length) break;
    }
    const proche = (x) => x.office.etude || !x.office.departement || DEPARTEMENTS_PROCHES_ANNUAIRE.indexOf(x.office.departement) !== -1;
    if (!candidats.length && c.famille.length >= 5) {
      for (const [famille, liste] of index) {
        if (Math.abs(famille.length - c.famille.length) <= 1 && distanceEdition(famille, c.famille) <= 1) {
          candidats = candidats.concat(liste.filter(proche).map(x => Object.assign({ prenomLu: c.prenom }, x)));
        }
      }
    }
    if (!candidats.length) return null;
    const norm = (v) => normaliserPourRecherche(v || '').replace(/[^a-z0-9]+/g, ' ').trim();
    const score = (x) => {
      let s = 0;
      if (x.prenomLu && x.c.prenom) s += x.c.prenom === x.prenomLu ? 8 : (x.c.prenom.split(' ')[0] === x.prenomLu.split(' ')[0] ? 6 : 0);
      if (c.ville && [x.office.ville].concat(x.office.bureaux || []).map(norm).some(l => l && (' ' + l + ' ').indexOf(' ' + c.ville + ' ') !== -1)) s += 6;
      if (x.office.etude || x.office.departement === '41') s += 3;
      else if (proche(x)) s += 2;
      return s;
    };
    let meilleur = candidats[0];
    let meilleurScore = score(meilleur);
    for (const x of candidats.slice(1)) {
      const sx = score(x);
      if (sx > meilleurScore) { meilleur = x; meilleurScore = sx; }
    }
    return { office: meilleur.office, notaire: meilleur.notaire };
  }
  // Agence lue dans un compromis → l'agence du Répertoire (thème « immobilier », étude 05/10 : « pareil pour les agences ») :
  // noms comparés sans casse, accents, ponctuation ni mots d'usage (agence, immobilier, l', sarl…) ; l'un contient l'autre.
  // Un seul candidat (le nom identique d'abord) → { organisme, id, adresse } ; plusieurs ou aucun → null. Pure.
  var MOTS_AGENCE_IGNORES = ['agence', 'agences', 'immobiliere', 'immobilier', 'immobilieres', 'l', 'la', 'le', 'les', 'de', 'du', 'des', 'sarl', 'sas', 'sa', 'eurl', 'societe', 'et'];
  function cleNomAgence(nom) {
    return normaliserPourRecherche(nom || '').split(/[^a-z0-9]+/).filter(w => w && MOTS_AGENCE_IGNORES.indexOf(w) === -1).join('');
  }
  function agenceDepuisRepertoire(nom, contacts) {
    const cle = cleNomAgence(nom);
    if (cle.length < 2 || !Array.isArray(contacts)) return null;
    const agences = contacts.filter(c => c && c.theme === 'immobilier' && c.organisme);
    // Même nom (casse et graphie à part) : la même agence, même enregistrée deux fois.
    const identiques = agences.filter(c => cleNomAgence(c.organisme) === cle);
    const retenus = identiques.length ? identiques.slice(0, 1) : (cle.length < 4 ? [] : agences.filter(c => {
      const k = cleNomAgence(c.organisme);
      return k.length >= 4 && (k.indexOf(cle) !== -1 || cle.indexOf(k) !== -1);
    }));
    if (new Set(retenus.map(c => cleNomAgence(c.organisme))).size !== 1) return null;
    return { organisme: retenus[0].organisme, id: retenus[0].id, adresse: retenus[0].adresse || '' };
  }

  // Recherche dans TOUT l'annuaire pour les champs notaire (étude 05/10 : « lier tous les champs pour les notaires au
  // répertoire ») : chaque mot tapé doit figurer dans le nom du notaire, sa ville ou son code postal (l'office s'affiche à côté). Notre office d'abord,
  // puis par ville. Rend { valeur: « Maître Eve CHAMPION (Blois) », libelle: « Office … · 41 » } (`max` au plus). Pure.
  var indexRechercheNotairesListe = new WeakMap();
  function rechercherNotairesAnnuaire(texte, carnet, max) {
    const mots = normaliserPourRecherche(texte || '').split(/[^a-z0-9]+/).filter(Boolean);
    if (!mots.length || !Array.isArray(carnet)) return [];
    let index = indexRechercheNotairesListe.get(carnet);
    if (!index) {
      index = [];
      for (const o of carnet) {
        for (const n of (o && o.notaires) || []) {
          index.push({
            valeur: `Maître ${n}${o.ville ? ` (${o.ville})` : ''}`,
            libelle: [o.office, o.departement].filter(Boolean).join(' · '),
            etude: !!o.etude,
            proche: !!o.etude || !o.departement || DEPARTEMENTS_PROCHES_ANNUAIRE.indexOf(o.departement) !== -1,
            ville: o.ville || '',
            botte: normaliserPourRecherche([n, o.ville, o.codePostal].join(' '))
          });
        }
      }
      indexRechercheNotairesListe.set(carnet, index);
    }
    return index.filter(x => mots.every(m => x.botte.indexOf(m) !== -1))
      .sort((a, b) => (b.etude ? 1 : 0) - (a.etude ? 1 : 0) || (b.proche ? 1 : 0) - (a.proche ? 1 : 0) || a.ville.localeCompare(b.ville, 'fr') || a.valeur.localeCompare(b.valeur, 'fr'))
      .slice(0, max || 25)
      .map(x => ({ valeur: x.valeur, libelle: x.libelle }));
  }

  // Champ notaire : la liste déroulante se remplit au fil de la frappe avec les notaires de tout l'annuaire (notre office en
  // tête), ceux lus dans l'acte restant proposés (`data-base` de la liste).
  function proposerNotairesAnnuaire(champ) {
    const liste = champ && (champ.list || document.getElementById(champ.getAttribute('list') || ''));
    if (!liste) return;
    let base = [];
    try { base = JSON.parse(liste.getAttribute('data-base') || '[]'); } catch (e) { /* liste de départ seule */ }
    const q = String(champ.value || '').trim();
    const nomsBase = Array.isArray(base) ? base : [];
    let options;
    if (q.length < 2) {
      options = nomsBase.concat(optionsNotairesCarnet(carnetConfreres).filter(n => nomsBase.indexOf(n) === -1)).map(v => ({ valeur: v, libelle: '' }));
    } else {
      const lus = nomsBase.filter(n => normaliserPourRecherche(n).indexOf(normaliserPourRecherche(q)) !== -1).map(v => ({ valeur: v, libelle: 'Lu dans l’acte' }));
      options = lus.concat(rechercherNotairesAnnuaire(q, carnetConfreres, 25).filter(x => !lus.some(l => l.valeur === x.valeur)));
    }
    liste.innerHTML = options.map(o => `<option value="${escapeAttr(o.valeur)}"${o.libelle ? ` label="${escapeAttr(o.libelle)}"` : ''}></option>`).join('');
  }

  // Complète, une fois le carnet chargé, les notaires des fiches nommés par leur seul prénom
  // (voir completerNomNotaire) — enregistré sur le dossier, pour que l'étude soit reconnue et que
  // l'office du confrère soit retrouvé partout (emails, rôle de l'étude).
  function completerNotairesDossiers() {
    for (const d of dossiers || []) {
      let change = false;
      for (const champ of ['notaireVendeur', 'notaireAcquereur']) {
        if (!d[champ]) continue;
        const complet = completerNomNotaire(d[champ], carnetConfreres);
        if (complet !== d[champ]) { d[champ] = complet; change = true; }
      }
      if (!change) continue;
      deduireRoleNotaireDossier(d);
      sauvegarder(d);
    }
  }

  // L'office du carnet où exerce ce notaire, ou null. Le nom de famille doit correspondre ; s'il
  // désigne plusieurs offices, le prénom puis la ville départagent — sinon rien n'est deviné
  // (deux DURAND dans deux offices : l'étude choisira). Pure.
  // Index par nom de famille, calculé une fois par liste (l'annuaire compte ≈ 7 000 offices).
  var indexNotairesParListe = new WeakMap();
  function indexNotairesParFamille(carnet) {
    let index = indexNotairesParListe.get(carnet);
    if (index) return index;
    index = new Map();
    for (const office of carnet) {
      for (const n of (office && office.notaires) || []) {
        const c = decomposerNomNotaire(n);
        if (!c.famille) continue;
        if (!index.has(c.famille)) index.set(c.famille, []);
        index.get(c.famille).push({ office, notaire: n, c });
      }
    }
    indexNotairesParListe.set(carnet, index);
    return index;
  }

  function trouverOfficeConfrere(nom, carnet) {
    const cible = decomposerNomNotaire(completerNomNotaire(nom, carnet));
    if (!cible.famille || !Array.isArray(carnet)) return null;
    const candidats = (indexNotairesParFamille(carnet).get(cible.famille) || []).slice();
    const offices = liste => Array.from(new Set(liste.map(x => x.office)));
    let restants = candidats;
    if (offices(restants).length > 1 && cible.prenom) {
      const parPrenom = restants.filter(x => x.c.prenom === cible.prenom);
      if (parPrenom.length) restants = parPrenom;
    }
    if (offices(restants).length > 1 && cible.ville) {
      const parVille = restants.filter(x => {
        const lieux = [x.office.ville].concat(x.office.bureaux || []).map(v => normaliserPourRecherche(v || '').replace(/[^a-z0-9]+/g, ' '));
        return lieux.some(l => (' ' + l + ' ').indexOf(' ' + cible.ville + ' ') !== -1);
      });
      if (parVille.length) restants = parVille;
    }
    if (offices(restants).length !== 1) return null;
    return { office: restants[0].office, notaire: restants[0].notaire };
  }

  // Les notaires proposés dans la liste déroulante des fiches (« Maître Eve CHAMPION (Blois) ») : ceux de
  // notre département et de ses voisins, et les offices corrigés ou saisis par l'étude — pas les 15 000
  // notaires de France (la saisie d'un autre nom est retrouvée dans tout l'annuaire, trouverOfficeConfrere). Pure.
  function optionsNotairesCarnet(carnet) {
    const options = [];
    for (const o of carnet || []) {
      if (o.departement && !o.etude && !o.modifie && o.annuaire !== false && DEPARTEMENTS_PROCHES_ANNUAIRE.indexOf(o.departement) === -1) continue;
      for (const n of o.notaires || []) options.push(`Maître ${n}${o.ville ? ` (${o.ville})` : ''}`);
    }
    // Notre office d'abord (étude 05/10), les autres par ordre alphabétique.
    const etude = (carnet || []).filter(o => o.etude).reduce((acc, o) => acc.concat((o.notaires || []).map(n => `Maître ${n}${o.ville ? ` (${o.ville})` : ''}`)), []);
    return etude.concat(options.filter(x => etude.indexOf(x) === -1).sort((a, b) => a.localeCompare(b, 'fr')));
  }

  // Recherche dans le carnet : nom de l'office, notaires, ville, bureaux, email. Notre office en
  // tête, puis triée par ville et par office. Pure.
  function filtrerCarnet(carnet, recherche) {
    const mots = normaliserPourRecherche(recherche || '').split(/\s+/).filter(Boolean);
    return (carnet || []).filter(o => {
      if (!mots.length) return true;
      const botte = normaliserPourRecherche([o.office, (o.notaires || []).join(' '), o.ville, o.codePostal, (o.bureaux || []).join(' '), o.email].join(' '));
      return mots.every(m => botte.indexOf(m) !== -1);
    }).sort((a, b) => (b.etude ? 1 : 0) - (a.etude ? 1 : 0)
      || (a.ville || '').localeCompare(b.ville || '', 'fr') || (a.office || '').localeCompare(b.office || '', 'fr'));
  }

  // Office du confrère de ce côté de la fiche, jamais le nôtre.
  function officeConfrereDossier(d, cote) {
    const nom = cote === 'vendeur' ? d.notaireVendeur : d.notaireAcquereur;
    if (!nom || estEtude({ nom })) return null;
    return trouverOfficeConfrere(nom, carnetConfreres);
  }

  // Dossiers en cours où intervient chaque office : { idOffice: [dossiers] }.
  function dossiersParOfficeConfrere(liste, carnet) {
    const parOffice = {};
    for (const d of liste || []) {
      if (!d || d.archive) continue;
      const vus = new Set();
      for (const nom of [d.notaireVendeur, d.notaireAcquereur]) {
        if (!nom || estEtude({ nom })) continue;
        const t = trouverOfficeConfrere(nom, carnet);
        if (t && !vus.has(t.office.id)) {
          vus.add(t.office.id);
          (parOffice[t.office.id] = parOffice[t.office.id] || []).push(d);
        }
      }
    }
    return parOffice;
  }

  async function chargerCarnetConfreres() {
    try {
      const r = await fetchAvecAuth('/api/confreres');
      if (!r.ok) return;
      carnetConfreres = (await r.json()).offices || [];
      completerNotairesDossiers();
      if (ongletActuel === 'confreres') renderCarnetConfreres();
    } catch (e) { console.warn('Annuaire des notaires indisponible :', e.message); }
  }

  async function enregistrerOfficeCarnet(office) {
    const r = await fetchAvecAuth('/api/confreres', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ office })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erreur || 'Enregistrement impossible.');
    carnetConfreres = j.offices || carnetConfreres;
  }

  // Sous le notaire d'une fiche : son office tel que l'annuaire le connaît, ou de quoi l'ajouter.
  function renderConfrereCarnetFiche(d, cote) {
    const nom = cote === 'vendeur' ? d.notaireVendeur : d.notaireAcquereur;
    if (!nom || estEtude({ nom })) return '';
    const t = officeConfrereDossier(d, cote);
    if (!t) {
      return `<div class="confrere-carnet"><wa-button appearance="outlined" type="button" class="bouton-ajout bouton-ajout-court" onclick="ajouterAuCarnetDepuisFiche('${escapeOnclickArg(nom)}')"><span slot="start" class="bouton-ajout-plus" aria-hidden="true">+</span>Ajouter au répertoire</wa-button></div>`;
    }
    // L'office seul (jugé trop chargé avec téléphone et email, retour de l'étude du 29/09) : les
    // coordonnées sont dans l'annuaire, à un clic.
    const o = t.office;
    return `<div class="confrere-carnet">
      <button type="button" class="confrere-carnet-office" onclick="ouvrirOfficeCarnet('${escapeOnclickArg(o.id)}')" title="Voir les coordonnées dans le répertoire">${icone('book')}${escapeHtml(o.office)}${o.ville ? ` — ${escapeHtml(o.ville)}` : ''}</button>
    </div>`;
  }

  function ouvrirOfficeCarnet(id) {
    const o = carnetConfreres.find(x => x.id === id);
    carnetRecherche = o ? o.office : '';
    repertoireTheme = 'annuaire';
    if (o && o.departement) annuaireDepartement = o.departement;
    fermerDossierDrawer();
    definirOnglet('confreres');
  }

  // « Ajouter au répertoire » depuis une fiche : le notaire n'est pas dans l'annuaire (ou son nom désigne
  // plusieurs offices) — le formulaire d'un nouvel office s'ouvre avec le notaire déjà écrit ; la
  // recherche montre les offices où exerce un notaire de ce nom, pour corriger l'un d'eux à la place.
  function ajouterAuCarnetDepuisFiche(nom) {
    const brut = String(nom || '');
    const ville = (brut.match(/\(([^)]*)\)/) || [])[1] || '';
    const notaire = brut.replace(/\([^)]*\)/g, ' ').replace(/^\s*(ma[iî]tre|me)\.?\s+/i, '').replace(/\s+/g, ' ').trim();
    const cible = decomposerNomNotaire(brut);
    carnetRecherche = cible.famille || '';
    repertoireTheme = 'annuaire';
    repertoireEdition = null;
    carnetEdition = 'nouveau';
    carnetBrouillon = { office: '', notaires: [notaire], ville: ville ? ville.charAt(0) + ville.slice(1).toLowerCase() : '' };
    fermerDossierDrawer();
    definirOnglet('confreres');
  }

  // Page « Répertoire » (étude, 30/09 : « un répertoire avec les confrères et ce nouveau fichier,
  // classé par thèmes ») : les offices du carnet des confrères forment le thème « Confrères », les
  // autres interlocuteurs (repertoire.js côté serveur) leurs thèmes ; une recherche commune, une
  // pastille par thème (avec son compte), puis une section par thème. Le nom de la fonction est
  // resté celui du carnet : toutes les mises à jour du carnet redessinent la page.
  function renderCarnetConfreres() {
    const zone = document.getElementById('carnet-liste');
    if (!zone) return;
    const champ = document.getElementById('carnet-recherche');
    if (champ && champ.value !== carnetRecherche && document.activeElement !== champ) champ.value = carnetRecherche;
    const offices = String(carnetRecherche || '').trim().length >= 2 ? filtrerCarnet(carnetConfreres, carnetRecherche).slice(0, 50) : [];
    const contacts = filtrerRepertoire(repertoireContacts, carnetRecherche);
    const parOffice = dossiersParOfficeConfrere(dossiers, carnetConfreres);
    const parTheme = {};
    repertoireThemes.forEach(t => { parTheme[t.cle] = contacts.filter(c => c.theme === t.cle); });
    const nombre = (cle) => (parTheme[cle] || []).length + (cle === 'confreres' ? offices.length : 0);
    const total = offices.length + contacts.length;
    const totalTout = carnetConfreres.length + repertoireContacts.length;
    const annuaire = repertoireTheme === 'annuaire';
    const compte = document.getElementById('carnet-compte');
    if (compte) compte.textContent = annuaire ? '' : carnetRecherche ? `${nombre(repertoireTheme)} sur ${repertoireContacts.filter(c => c.theme === repertoireTheme).length}` : '';
    const bouton = document.getElementById('repertoire-ajouter');
    // Seul le texte change : le « + » du bouton (wa-button.bouton-ajout) est un élément à part.
    const texteBouton = bouton && [...bouton.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (texteBouton) texteBouton.textContent = repertoireTheme === 'confreres' || annuaire ? 'Ajouter un office' : 'Ajouter un contact';
    if (champ) champ.placeholder = annuaire ? 'Rechercher un notaire, un office, une ville…' : 'Rechercher un organisme, un nom, une ville, un email…';
    renderNavRepertoire(nombre, total);
    if (annuaire) {
      zone.innerHTML = renderAnnuaireNotaires();
      return;
    }

    const formNouveau = carnetEdition === 'nouveau' ? renderFormOfficeCarnet(carnetBrouillon || {})
      : repertoireEdition === 'nouveau' ? renderFormContactRepertoire(repertoireBrouillon || {}) : '';
    const sections = repertoireThemes.filter(t => !repertoireTheme || t.cle === repertoireTheme).map(t => {
      const lignes = (t.cle === 'confreres'
        ? offices.map(o => carnetEdition === o.id ? `<div class="rep-ligne-form">${renderFormOfficeCarnet(o)}</div>` : renderLigneOfficeCarnet(o, parOffice[o.id] || []))
        : []).concat(parTheme[t.cle].map(c => repertoireEdition === c.id ? `<div class="rep-ligne-form">${renderFormContactRepertoire(c)}</div>` : renderLigneContactRepertoire(c)));
      if (!lignes.length) return '';
      return `<section class="rep-section">
          <h2 class="rep-section-titre">${escapeHtml(libelleThemeRepertoire(t))}<span class="rep-section-n">${nombre(t.cle)}</span></h2>
          <div class="annuaire-liste">${lignes.join('')}</div>
        </section>`;
    }).join('');
    const sectionAnnuaire = '';
    const vide = !sections && !formNouveau && !sectionAnnuaire
      ? `<p class="carnet-vide">${totalTout ? 'Aucun contact ne correspond à cette recherche.' : 'Le répertoire est vide.'}</p>` : '';
    zone.innerHTML = (formNouveau ? `<div class="annuaire-liste rep-nouveau"><div class="rep-ligne-form">${formNouveau}</div></div>` : '') + sections + sectionAnnuaire + vide;
  }

  // Le thème « Confrères » : les notaires de l'annuaire (corrigés par l'étude).
  function libelleThemeRepertoire(t) {
    return t.cle === 'confreres' ? 'Notaires' : t.libelle;
  }

  // Colonne de gauche (sans « Tout », étude 03/10) : les notaires (carnet, France), puis les autres interlocuteurs ;
  // sur téléphone, une rangée qui défile (CSS). Les nombres suivent la recherche.
  function renderNavRepertoire(nombre, total) {
    const nav = document.getElementById('rep-nav');
    if (!nav) return;
    const lien = (cle, libelle, n, ic) => `<button type="button" class="rep-nav-lien${repertoireTheme === cle ? ' actif' : ''}${n === 0 ? ' vide' : ''}" aria-pressed="${repertoireTheme === cle}" onclick="choisirThemeRepertoire('${cle}')">${ic ? icone(ic) : ''}<span class="rep-nav-libelle">${escapeHtml(libelle)}</span><span class="rep-nav-n">${n}</span></button>`;
    const france = annuaireInfos && annuaireInfos.offices ? Number(annuaireInfos.offices).toLocaleString('fr-FR') : '';
    nav.innerHTML = lien('annuaire', 'Notaires', france || nombre('confreres'), 'users')
      + '<div class="rep-nav-groupe">Interlocuteurs</div>'
      + repertoireThemes.filter(t => t.cle !== 'confreres').map(t => lien(t.cle, t.libelle, nombre(t.cle), '')).join('');
  }

  // Une ligne du carnet : office, notaires, adresse et bureaux, notes, dossiers en cours ; téléphone et
  // email ; crayon et ×. Même forme que les lignes de l'annuaire.
  function renderLigneOfficeCarnet(o, dossiersOffice, avecMarque) {
    const notaires = memeNomOfficeNotaire(o) ? '' : (o.notaires || []).map(n => 'Me ' + n).join(', ');
    const lieu = normaliserAdresse([o.adresse, [o.codePostal, o.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '));
    const enCours = dossiersOffice.length
      ? `<div class="rep-ligne-dossiers">${dossiersOffice.slice(0, 4).map(d => `<button type="button" class="carnet-dossier" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(d.id)}')">${escapeHtml(libelleDossierAffiche(d))}</button>`).join('')}${dossiersOffice.length > 4 ? `<span>+${dossiersOffice.length - 4}</span>` : ''}</div>` : '';
    return `<div class="annuaire-ligne rep-ligne${o.etude ? ' rep-ligne-etude' : ''}">
        <div class="annuaire-ligne-qui">
          <div class="annuaire-ligne-nom">${escapeHtml(o.office || (o.notaires || [])[0] || '')}${o.etude ? ' <span class="dot-label dl-success"><span class="dot"></span>Notre office</span>' : avecMarque && o.modifie ? ' <span class="dot-label dl-neutre" title="Corrigé par l’étude"><span class="dot"></span>Modifié</span>' : avecMarque && o.annuaire === false ? ' <span class="dot-label dl-neutre" title="Saisi par l’étude"><span class="dot"></span>Ajouté</span>' : ''}</div>
          ${notaires ? `<div class="annuaire-ligne-notaires">${escapeHtml(notaires)}</div>` : ''}
          ${lieu || (o.bureaux || []).length ? `<div class="annuaire-ligne-lieu">${escapeHtml(lieu)}${(o.bureaux || []).length ? `${lieu ? ' · ' : ''}bureaux : ${escapeHtml(o.bureaux.join(' ; '))}` : ''}</div>` : ''}
          ${o.notes ? `<div class="annuaire-ligne-lieu rep-ligne-notes">${escapeHtml(o.notes)}</div>` : ''}
          ${enCours}
        </div>
        <div class="annuaire-ligne-contact">
          ${o.telephone ? ligneTelephoneRepertoire('', o.telephone) : ''}
          ${o.email ? `<a href="mailto:${escapeAttr(o.email)}" title="${escapeAttr(o.email)}">${icone('mail')}<span>${escapeHtml(o.email)}</span></a>` : '<span class="carnet-manque">Email non renseigné</span>'}
        </div>
        <div class="annuaire-ligne-action rep-ligne-icones">
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone ech-ico" onclick="modifierOfficeCarnet('${escapeOnclickArg(o.id)}')" title="Modifier" aria-label="Modifier cet office">${icone('pencil')}</wa-button>
          ${o.etude || (o.annuaire !== false && !o.modifie) ? '' : `<wa-button appearance="plain" size="s" type="button" class="bouton-icone ech-ico ech-ico-suppr" onclick="retirerOfficeCarnet('${escapeOnclickArg(o.id)}')" title="${o.annuaire !== false ? 'Remettre tel que relevé dans l’annuaire' : 'Retirer de l’annuaire'}" aria-label="${o.annuaire !== false ? 'Annuler la correction de cet office' : 'Retirer cet office'}">${icone('x')}</wa-button>`}
        </div>
      </div>`;
  }

  // Une ligne d'interlocuteur : organisme et service, personnes, adresse, notes ; téléphones (avec leur
  // libellé), emails et liens ; crayon et ×.
  function renderLigneContactRepertoire(c) {
    const valeurs = (liste, rendu) => (liste || []).map(x => { const { libelle, valeur } = valeurLibelleeRepertoire(x); return rendu(libelle, valeur); });
    const tels = valeurs(c.telephones, (libelle, valeur) => ligneTelephoneRepertoire(libelle, valeur));
    const mails = valeurs(c.emails, (libelle, valeur) => `<a href="mailto:${escapeAttr(valeur)}" title="${escapeAttr(valeur)}">${icone('mail')}<span>${libelle ? `<span class="rep-libelle">${escapeHtml(libelle)}</span> ` : ''}${escapeHtml(valeur)}</span></a>`);
    const liens = (c.liens || []).map(l => `<a href="${escapeAttr(l)}" target="_blank" rel="noopener" title="${escapeAttr(l)}">${icone('link')}<span>${escapeHtml(l.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</span></a>`);
    const sous = [c.service, (c.personnes || []).join(', ')].filter(Boolean).join(' · ');
    return `<div class="annuaire-ligne rep-ligne">
        <div class="annuaire-ligne-qui">
          <div class="annuaire-ligne-nom">${escapeHtml(c.organisme || (c.personnes || [])[0] || '')}</div>
          ${sous ? `<div class="annuaire-ligne-notaires">${escapeHtml(sous)}</div>` : ''}
          ${c.adresse ? `<div class="annuaire-ligne-lieu">${escapeHtml(c.adresse)}</div>` : ''}
          ${c.notes ? `<div class="annuaire-ligne-lieu rep-ligne-notes">${escapeHtml(c.notes)}</div>` : ''}
        </div>
        <div class="annuaire-ligne-contact">${tels.concat(mails, liens).join('') || '<span class="carnet-manque">Aucune coordonnée</span>'}</div>
        <div class="annuaire-ligne-action rep-ligne-icones">
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone ech-ico" onclick="modifierContactRepertoire('${escapeOnclickArg(c.id)}')" title="Modifier" aria-label="Modifier ce contact">${icone('pencil')}</wa-button>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone ech-ico ech-ico-suppr" onclick="retirerContactRepertoire('${escapeOnclickArg(c.id)}')" title="Retirer du répertoire" aria-label="Retirer ce contact du répertoire">${icone('x')}</wa-button>
        </div>
      </div>`;
  }

  // ---- Répertoire hors offices notariaux (server/src/repertoire.js) ----
  var repertoireContacts = [];
  // Repli avant la réponse du serveur, qui renvoie la même liste (THEMES_REPERTOIRE).
  var repertoireThemes = [
    { cle: 'confreres', libelle: 'Confrères' },
    { cle: 'banquesPrets', libelle: 'Banques — prêts et mainlevées' },
    { cle: 'banquesSuccessions', libelle: 'Banques — successions' },
    { cle: 'assurances', libelle: 'Assurances et assurance-vie' },
    { cle: 'social', libelle: 'Retraite, santé et aide sociale' },
    { cle: 'justice', libelle: 'Tribunaux et état civil' },
    { cle: 'impots', libelle: 'Impôts et enregistrement' },
    { cle: 'mairies', libelle: 'Mairies et urbanisme' },
    { cle: 'departement', libelle: 'Département et services de l’État' },
    { cle: 'immobilier', libelle: 'Agences immobilières' },
    { cle: 'syndics', libelle: 'Syndics de copropriété' },
    { cle: 'divers', libelle: 'Chambres consulaires et divers' }
  ];
  var repertoireTheme = 'annuaire'; // plus d'onglet « Tout » (étude 03/10) : les notaires d'abord
  var repertoireEdition = null;
  var repertoireBrouillon = null;

  async function chargerRepertoire() {
    try {
      const r = await fetchAvecAuth('/api/repertoire');
      if (!r.ok) return;
      const j = await r.json();
      repertoireContacts = j.contacts || [];
      if (Array.isArray(j.themes) && j.themes.length) repertoireThemes = j.themes;
      if (ongletActuel === 'confreres') renderCarnetConfreres();
    } catch (e) { console.warn('Répertoire indisponible :', e.message); }
  }

  // ---- Notaires de France (server/src/annuaireNotaires.js, étude 02/10 ; seul annuaire depuis le 03/10) ----
  // Les offices eux-mêmes sont dans `carnetConfreres` (tout l'annuaire, corrigé par l'étude) ; ici, la source
  // du relevé et les noms des départements.
  var annuaireInfos = null;          // { source, releveLe, offices, departements: [{ code, nom, offices }] }
  var annuaireDepartement = '';      // code du département affiché

  async function chargerAnnuaireDepartements() {
    if (annuaireInfos) return;
    try {
      const r = await fetchAvecAuth('/api/annuaire/departements');
      if (!r.ok) return;
      annuaireInfos = await r.json();
      if (ongletActuel === 'confreres') renderCarnetConfreres();
    } catch (e) { console.warn('Annuaire des notaires indisponible :', e.message); }
  }

  function choisirDepartementAnnuaire(code) {
    if (!code) return;
    annuaireDepartement = code;
    try { localStorage.setItem(CLE_DEPARTEMENT_ANNUAIRE, code); } catch (e) { /* stockage indisponible */ }
    renderCarnetConfreres();
  }

  // Départements proposés d'un clic : le nôtre et ses voisins (étude, 02/10 : « plus facile à utiliser »).
  var DEPARTEMENTS_PROCHES_ANNUAIRE = ['41', '37', '45', '18', '36', '72', '28'];
  var CLE_DEPARTEMENT_ANNUAIRE = 'claire-annuaire-departement';

  // Le département affiché : le dernier choisi sur ce poste, sinon le nôtre.
  function departementAnnuaireAffiche() {
    if (annuaireDepartement) return annuaireDepartement;
    let memorise = '';
    try { memorise = localStorage.getItem(CLE_DEPARTEMENT_ANNUAIRE) || ''; } catch (e) { /* stockage indisponible */ }
    return memorise || '41';
  }

  // Pure : les offices dont l'office, un notaire, la ville, le code postal, un bureau ou l'email
  // contient tous les mots cherchés (sans accents ni casse).
  function filtrerOfficesAnnuaire(offices, texte) {
    const mots = normaliserPourRecherche(String(texte || '')).split(/\s+/).filter(Boolean);
    if (!mots.length) return offices || [];
    return (offices || []).filter(o => {
      const botte = normaliserPourRecherche([o.office, (o.notaires || []).join(' '), o.ville, o.codePostal, (o.bureaux || []).join(' '), o.email].join(' '));
      return mots.every(m => botte.indexOf(m) !== -1);
    });
  }

  // Pure : les offices regroupés par ville, dans l'ordre alphabétique des villes — [{ ville, offices }].
  function officesParVilleAnnuaire(offices) {
    const groupes = new Map();
    for (const o of offices || []) {
      const ville = String(o.ville || '').trim() || 'Ville non renseignée';
      const cle = normaliserPourRecherche(ville);
      if (!groupes.has(cle)) groupes.set(cle, { ville, offices: [] });
      groupes.get(cle).offices.push(o);
    }
    return Array.from(groupes.values()).sort((a, b) => a.ville.localeCompare(b.ville, 'fr'));
  }

  // Pure : les départements dont le nom ou le code contient le texte (sans accents ni casse).
  function departementsAnnuaireFiltres(departements, texte) {
    const q = normaliserPourRecherche(String(texte || '').trim());
    if (!q) return departements || [];
    return (departements || []).filter(d => normaliserPourRecherche(d.nom + ' ' + d.code).indexOf(q) !== -1);
  }

  // Vue « Notaires » (étude, 03/10 : « fusionner le carnet des confrères avec tous les notaires de France »)
  // : un seul annuaire. Un département à la fois (liste déroulante + voisins d'un clic), chaque office
  // modifiable (sa correction remplace la ligne relevée, « Modifié ») ; la recherche filtre le département,
  // puis le reste de la France (50 au plus). Tout est en mémoire du poste : aucun aller-retour au serveur.
  function renderAnnuaireNotaires() {
    const q = String(carnetRecherche || '').trim();
    const code = departementAnnuaireAffiche();
    const parDep = {};
    for (const o of carnetConfreres) { const c = o.departement || departementDepuisCodePostal(o.codePostal) || '?'; parDep[c] = (parDep[c] || 0) + 1; }
    const nomDep = (c) => ((annuaireInfos && annuaireInfos.departements) || []).find(d => d.code === c)?.nom || c;
    const deps = Object.keys(parDep).filter(c => c !== '?')
      .sort((a, b) => (a === '2A' ? 20.1 : a === '2B' ? 20.2 : Number(a) || 999) - (b === '2A' ? 20.1 : b === '2B' ? 20.2 : Number(b) || 999))
      .map(c => ({ code: c, nom: nomDep(c), offices: parDep[c] }));
    const dep = deps.find(d => d.code === code) || { code, nom: nomDep(code), offices: 0 };
    const proches = DEPARTEMENTS_PROCHES_ANNUAIRE.map(c => deps.find(d => d.code === c)).filter(Boolean);
    const parOffice = dossiersParOfficeConfrere(dossiers, carnetConfreres);
    const ligne = (o) => carnetEdition === o.id ? `<div class="rep-ligne-form">${renderFormOfficeCarnet(o)}</div>` : renderLigneOfficeCarnet(o, parOffice[o.id] || [], true);
    const parVille = (liste) => officesParVilleAnnuaire(liste)
      .map(g => `<div class="annuaire-ville">${escapeHtml(g.ville.toUpperCase())}<span>${g.offices.length}</span></div>${g.offices.map(ligne).join('')}`).join('');
    const modifies = carnetConfreres.filter(o => o.modifie).length;

    const barre = `<div class="annuaire-barre">
        ${deps.length ? `<label class="annuaire-choix" for="annuaire-departement"><span>Département</span>
          <select id="annuaire-departement" onchange="choisirDepartementAnnuaire(this.value)">
            ${deps.map(d => `<option value="${escapeAttr(d.code)}"${d.code === code ? ' selected' : ''}>${escapeHtml(d.code)} — ${escapeHtml(d.nom)} (${d.offices})</option>`).join('')}
          </select>
        </label>
        <div class="annuaire-proches" role="group" aria-label="Départements voisins">
          ${proches.map(d => `<button type="button" class="annuaire-proche${d.code === code ? ' actif' : ''}" aria-pressed="${d.code === code}" onclick="choisirDepartementAnnuaire('${escapeOnclickArg(d.code)}')" title="${escapeAttr(d.nom)}">${escapeHtml(d.code)}</button>`).join('')}
        </div>` : ''}
        <span class="annuaire-source">${escapeHtml(carnetConfreres.length.toLocaleString('fr-FR') + ' offices en France')}${modifies ? ` · ${modifies} modifié${modifies > 1 ? 's' : ''}` : ''} ${infoBulle(((annuaireInfos && annuaireInfos.source) || 'Annuaire public des offices notariaux') + ' : relevé une fois, il peut avoir vieilli. Corrigez un office au crayon : la correction sert partout (fiches, emails au confrère, appels) ; la croix d’un office modifié le remet tel que relevé.')}</span>
      </div>`;
    const depsCherches = q.length >= 3 ? departementsAnnuaireFiltres(deps, q).filter(d => d.code !== code).slice(0, 4) : [];
    const allerA = depsCherches.length ? `<div class="annuaire-aller">${depsCherches.map(d => `<button type="button" class="lien-bouton" onclick="choisirDepartementAnnuaire('${escapeOnclickArg(d.code)}'); viderRechercheCarnet()">Afficher ${escapeHtml(d.nom)} (${escapeHtml(d.code)})</button>`).join('')}</div>` : '';
    const formNouveau = carnetEdition === 'nouveau' ? `<div class="annuaire-liste rep-nouveau"><div class="rep-ligne-form">${renderFormOfficeCarnet(carnetBrouillon || {})}</div></div>` : '';

    const duDep = carnetConfreres.filter(o => (o.departement || departementDepuisCodePostal(o.codePostal)) === code);
    const ids = new Set(filtrerOfficesAnnuaire(duDep, q).map(o => o.id));
    const trouves = duDep.filter(o => ids.has(o.id));
    const titre = `<h2 class="rep-section-titre">${escapeHtml(dep.nom)} (${escapeHtml(dep.code)})<span class="rep-section-n">${q ? `${trouves.length} sur ${duDep.length}` : duDep.length}</span></h2>`;
    const liste = titre + (trouves.length ? `<div class="annuaire-liste">${parVille(trouves)}</div>`
      : `<p class="carnet-vide">Aucun office ${escapeHtml(/^[AEIOUYÉ]/i.test(dep.nom) ? 'd’' : 'de ')}${escapeHtml(dep.nom)} ne correspond.</p>`);
    let ailleurs = '';
    if (q.length >= 3) {
      const tout = filtrerOfficesAnnuaire(carnetConfreres.filter(o => !ids.has(o.id) && (o.departement || departementDepuisCodePostal(o.codePostal)) !== code), q);
      ailleurs = `<h2 class="rep-section-titre">Ailleurs en France<span class="rep-section-n">${tout.length}</span></h2>`
        + (tout.length ? `<div class="annuaire-liste">${tout.slice(0, 50).map(ligne).join('')}</div>${tout.length > 50 ? '<p class="carnet-vide">50 premiers résultats : précisez la recherche.</p>' : ''}`
          : '<p class="carnet-vide">Rien d’autre en France.</p>');
    }
    return `<div class="rep-notaires">${barre}${allerA}${formNouveau}<section class="rep-section">${liste}</section>${ailleurs ? `<section class="rep-section">${ailleurs}</section>` : ''}</div>`;
  }

  function viderRechercheCarnet() {
    carnetRecherche = '';
    const champ = document.getElementById('carnet-recherche');
    if (champ) champ.value = '';
    renderCarnetConfreres();
  }

  // Pure : les contacts qui répondent à tous les mots cherchés (organisme, service, personnes,
  // adresse, téléphones, emails, notes), triés par organisme puis service.
  function filtrerRepertoire(contacts, recherche) {
    const mots = normaliserPourRecherche(recherche || '').split(/\s+/).filter(Boolean);
    return (contacts || []).filter(c => {
      if (!mots.length) return true;
      const botte = normaliserPourRecherche([c.organisme, c.service, (c.personnes || []).join(' '), c.adresse,
        (c.telephones || []).join(' '), (c.emails || []).join(' '), c.notes].join(' '));
      return mots.every(m => botte.indexOf(m) !== -1);
    }).sort((a, b) => (a.organisme || '').localeCompare(b.organisme || '', 'fr') || (a.service || '').localeCompare(b.service || '', 'fr'));
  }

  // Pure : « Mainlevée : 04 67 40 94 00 » → { libelle: 'Mainlevée', valeur: '04 67 40 94 00' }.
  function valeurLibelleeRepertoire(v) {
    const t = String(v || '');
    const i = t.lastIndexOf(' : ');
    return i === -1 ? { libelle: '', valeur: t.trim() } : { libelle: t.slice(0, i).trim(), valeur: t.slice(i + 3).trim() };
  }

  // Pure : le premier numéro appelable d'un téléphone saisi (« 02 54 95 53 04 — 06 78… » → le
  // premier ; « 3960 » gardé), pour le lien tel:.
  function numeroAppelable(v) {
    const m = String(v || '').match(/\+?\d[\d .]{2,}\d/);
    return m ? m[0].replace(/[ .]/g, '') : '';
  }

  // Un lien « tel: » (icône) par numéro d'un champ qui peut en porter plusieurs (« 06 12 34 56 78 / 02 54 00 00 00 ») pour appeler avec
  // 3CX (étude 05/10 : « les numéros de téléphone cliquables pour les ouvrir dans 3CX ») : 3CX compose si c'est l'application du
  // protocole `tel:` du poste. L'extension Chrome « 3CX Click to Call », elle, ne voit qu'un numéro écrit en TEXTE (jamais dans un
  // champ de saisie, un lien ou derrière une icône) : voir `texteAppel3cx`, posé à côté de ce lien. Pure : le HTML des liens,
  // '' sans numéro.
  function liensAppelTelephone(texte, classe) {
    const numeros = [];
    String(texte || '').split(/[\/;,]|\bou\b/i).forEach(part => { const n = numeroAppelable(part); if (n && !numeros.includes(n)) numeros.push(n); });
    return numeros.slice(0, 3).map(n => `<a class="${classe || 'coord-appel'}" href="tel:${escapeAttr(n)}" title="Appeler le ${escapeAttr(n)} (3CX)" aria-label="Appeler le ${escapeAttr(n)}" onclick="noterVerificationPoste('telephone-3cx-lien', { detail: 'lien tel: ouvert' })">${icone('phone')}</a>`).join('');
  }

  // Un numéro écrit EN TEXTE dans une page (répertoire, fiche) : enveloppé dans la balise que l'extension Chrome « 3CX Click to Call »
  // pose sur un numéro du texte (`<tcxspan tcxhref="0254445050" title="Call … via 3CX">`, forme relevée par l'étude le 05/10).
  // Dans un lien « tel: » ou un champ de saisie l'extension ne le voit pas : le texte est donc posé à côté du lien, jamais dedans
  // (étude 05/10 : « mettre aussi le call 3CX dans les numéros du répertoire »). Plusieurs numéros séparés par « / ; , ou » :
  // chacun est enveloppé. Pure : du HTML échappé.
  function texteAppel3cx(valeur) {
    return String(valeur || '').split(/([\/;,]|\bou\b)/i).map(part => {
      if (/^(?:[\/;,]|ou)$/i.test(part)) return escapeHtml(part);
      return part.split(/(\+?\d[\d .]{2,}\d)/).map(morceau => {
        const n = numeroAppelable(morceau);
        return n && morceau === morceau.match(/\+?\d[\d .]{2,}\d/)[0]
          ? `<tcxspan tcxhref="${escapeAttr(n)}" title="Call ${escapeAttr(morceau)} via 3CX">${escapeHtml(morceau)}</tcxspan>` : escapeHtml(morceau);
      }).join('');
    }).join('');
  }

  // Un téléphone du répertoire : icône « tel: » (3CX application du protocole, poste sans extension) puis le numéro en texte
  // reconnu par l'extension 3CX. `libelle` : « Standard », « Fax »… (jamais appelé pour un fax). Pure.
  function ligneTelephoneRepertoire(libelle, valeur) {
    const num = numeroAppelable(valeur);
    const etiquette = libelle ? `<span class="rep-libelle">${escapeHtml(libelle)}</span> ` : '';
    if (!num || /^fax$/i.test(libelle || '')) return `<span class="rep-ligne-valeur">${icone('phone')}<span>${etiquette}${escapeHtml(valeur)}</span></span>`;
    return `<span class="rep-ligne-valeur"><a class="coord-appel" href="tel:${escapeAttr(num)}" title="Appeler le ${escapeAttr(num)} (3CX)" aria-label="Appeler le ${escapeAttr(num)}" onclick="noterVerificationPoste('telephone-3cx-lien', { detail: 'lien tel: ouvert' })">${icone('phone')}</a><span>${etiquette}${texteAppel3cx(valeur)}</span></span>`;
  }

  function renderFormContactRepertoire(c) {
    const v = x => escapeAttr(x || '');
    const zone = (id, libelle, valeurs, ph) => `<div class="calc-champ"><label for="${id}">${libelle}</label>
        <textarea id="${id}" rows="2" placeholder="${escapeAttr(ph)}">${escapeHtml((valeurs || []).join('\n'))}</textarea></div>`;
    const themes = repertoireThemes.map(t => `<option value="${escapeAttr(t.cle)}"${(c.theme || repertoireTheme || 'divers') === t.cle ? ' selected' : ''}>${escapeHtml(t.libelle)}</option>`).join('');
    return `<form class="carnet-office carnet-form" onsubmit="event.preventDefault(); validerContactRepertoire()">
      <div class="calc-champs">
        <div class="calc-champ-paire">
          <div class="calc-champ"><label for="rep-f-organisme">Organisme</label>
            <input type="text" id="rep-f-organisme" value="${v(c.organisme)}" placeholder="Crédit Agricole Val de France"></div>
          <div class="calc-champ"><label for="rep-f-theme">Thème</label>
            <select id="rep-f-theme">${themes}</select></div>
        </div>
        <div class="calc-champ"><label for="rep-f-service">Service</label>
          <input type="text" id="rep-f-service" value="${v(c.service)}" placeholder="Service successions"></div>
        ${zone('rep-f-personnes', 'Personnes (une par ligne)', c.personnes, 'Prénom NOM — fonction')}
        <div class="calc-champ"><label for="rep-f-adresse">Adresse</label>
          <input type="text" id="rep-f-adresse" value="${v(c.adresse)}" placeholder="rue, CS/BP, code postal, VILLE CEDEX"></div>
        <div class="calc-champ-paire">
          ${zone('rep-f-telephones', 'Téléphones (un par ligne)', c.telephones, 'Mainlevée : 01 23 45 67 89')}
          ${zone('rep-f-emails', 'Emails (un par ligne)', c.emails, 'Service prêt : pret@banque.fr')}
        </div>
        ${zone('rep-f-liens', 'Liens (un par ligne)', c.liens, 'https://…')}
        <div class="calc-champ"><label for="rep-f-notes">Notes</label>
          <input type="text" id="rep-f-notes" value="${v(c.notes)}" placeholder="Uniquement par email, horaires…"></div>
      </div>
      <div class="carnet-form-actions">
        <wa-button appearance="outlined" class="secondary" onclick="annulerEditionRepertoire()">Annuler</wa-button>
        <wa-button variant="brand" type="submit" class="primary" id="rep-f-valider">Enregistrer</wa-button>
      </div>
    </form>`;
  }

  function choisirThemeRepertoire(cle) {
    if (cle === 'confreres') cle = 'annuaire';
    if (cle === 'annuaire' && repertoireTheme !== 'annuaire') carnetEdition = null;
    repertoireTheme = cle || 'annuaire';
    renderCarnetConfreres();
  }

  function ajouterAuRepertoire() {
    if (repertoireTheme === 'confreres' || repertoireTheme === 'annuaire') { repertoireEdition = null; repertoireTheme = 'annuaire'; nouvelOfficeCarnet(); return; }
    carnetEdition = null;
    repertoireEdition = 'nouveau';
    repertoireBrouillon = { theme: repertoireTheme || '' };
    renderCarnetConfreres();
    const champ = document.getElementById('rep-f-organisme');
    if (champ) champ.focus();
  }

  function modifierContactRepertoire(id) {
    carnetEdition = null;
    repertoireEdition = id;
    repertoireBrouillon = null;
    renderCarnetConfreres();
  }

  function annulerEditionRepertoire() {
    repertoireEdition = null;
    repertoireBrouillon = null;
    renderCarnetConfreres();
  }

  async function validerContactRepertoire() {
    const val = id => (document.getElementById(id) || {}).value || '';
    const lignes = id => val(id).split(/\n+/).map(s => s.trim()).filter(Boolean);
    const existant = repertoireEdition && repertoireEdition !== 'nouveau' ? repertoireContacts.find(c => c.id === repertoireEdition) : null;
    const contact = Object.assign({}, existant || { id: 'saisie-' + Date.now().toString(36), source: 'Saisi par l’étude' }, {
      theme: val('rep-f-theme'), organisme: val('rep-f-organisme').trim(), service: val('rep-f-service').trim(),
      personnes: lignes('rep-f-personnes'), adresse: val('rep-f-adresse').trim(),
      telephones: lignes('rep-f-telephones'), emails: lignes('rep-f-emails'), liens: lignes('rep-f-liens'), notes: val('rep-f-notes').trim()
    });
    if (!contact.organisme && !contact.personnes.length) { afficherToast('Indiquez au moins l’organisme ou une personne.', 'OK', null); return; }
    const emailInvalide = contact.emails.map(e => valeurLibelleeRepertoire(e).valeur).find(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (emailInvalide) { afficherToast(`Email non valide : ${emailInvalide}`, 'OK', null); return; }
    const bouton = document.getElementById('rep-f-valider');
    if (bouton) bouton.disabled = true;
    try {
      const r = await fetchAvecAuth('/api/repertoire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erreur || 'Enregistrement impossible.');
      repertoireContacts = j.contacts || repertoireContacts;
      repertoireEdition = null;
      repertoireBrouillon = null;
      renderCarnetConfreres();
    } catch (e) {
      if (bouton) bouton.disabled = false;
      afficherToast(e.message, 'OK', null);
    }
  }

  function retirerContactRepertoire(id) {
    const c = repertoireContacts.find(x => x.id === id);
    if (!c) return;
    demanderConfirmation(`Retirer ${[c.organisme, c.service].filter(Boolean).join(' — ') || 'ce contact'} du répertoire ?`, async () => {
      try {
        const r = await fetchAvecAuth('/api/repertoire/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!r.ok) throw new Error('Retrait impossible.');
        repertoireContacts = (await r.json()).contacts || [];
        renderCarnetConfreres();
      } catch (e) { afficherToast(e.message, 'OK', null); }
    });
  }

  // Office au nom de son seul notaire (« Me Camille GATARD ») : la liste des notaires répéterait
  // le titre.
  function memeNomOfficeNotaire(o) {
    return (o.notaires || []).length === 1 && normaliserPourRecherche(o.office || '') === normaliserPourRecherche('Me ' + o.notaires[0]);
  }

  function renderFormOfficeCarnet(o) {
    const v = x => escapeAttr(x || '');
    return `<form class="carnet-office carnet-form" onsubmit="event.preventDefault(); validerOfficeCarnet()">
      <div class="calc-champs">
        <div class="calc-champ"><label for="carnet-f-office">Office</label>
          <input type="text" id="carnet-f-office" value="${v(o.office)}" placeholder="SELARL DURAND et associés"></div>
        <div class="calc-champ"><label for="carnet-f-notaires">Notaires (un par ligne, prénom puis NOM)</label>
          <textarea id="carnet-f-notaires" rows="3" placeholder="Paul DURAND">${escapeHtml((o.notaires || []).join('\n'))}</textarea></div>
        <div class="calc-champ"><label for="carnet-f-adresse">Adresse</label>
          <input type="text" id="carnet-f-adresse" value="${v(o.adresse)}"></div>
        <div class="calc-champ-paire">
          <div class="calc-champ"><label for="carnet-f-cp">Code postal</label>
            <input type="text" id="carnet-f-cp" inputmode="numeric" maxlength="5" value="${v(o.codePostal)}"></div>
          <div class="calc-champ"><label for="carnet-f-ville">Ville</label>
            <input type="text" id="carnet-f-ville" value="${v(o.ville)}"></div>
        </div>
        <div class="calc-champ-paire">
          <div class="calc-champ"><label for="carnet-f-tel">Téléphone</label>
            <input type="text" inputmode="tel" id="carnet-f-tel" value="${v(o.telephone)}"></div>
          <div class="calc-champ"><label for="carnet-f-email">Email de l’office</label>
            <input type="email" id="carnet-f-email" value="${v(o.email)}"></div>
        </div>
        <div class="calc-champ"><label for="carnet-f-notes">Notes</label>
          <input type="text" id="carnet-f-notes" value="${v(o.notes)}" placeholder="Clerc habituel, habitudes de l’office…"></div>
      </div>
      <div class="carnet-form-actions">
        <wa-button appearance="outlined" class="secondary" onclick="annulerEditionCarnet()">Annuler</wa-button>
        <wa-button variant="brand" type="submit" class="primary" id="carnet-f-valider">Enregistrer</wa-button>
      </div>
    </form>`;
  }

  function modifierOfficeCarnet(id) {
    repertoireEdition = null;
    carnetEdition = id;
    carnetBrouillon = null;
    renderCarnetConfreres();
  }

  function nouvelOfficeCarnet() {
    carnetEdition = 'nouveau';
    carnetBrouillon = {};
    renderCarnetConfreres();
    const champ = document.getElementById('carnet-f-office');
    if (champ) champ.focus();
  }

  function annulerEditionCarnet() {
    carnetEdition = null;
    carnetBrouillon = null;
    renderCarnetConfreres();
  }

  async function validerOfficeCarnet() {
    const val = id => (document.getElementById(id) || {}).value || '';
    const existant = carnetEdition && carnetEdition !== 'nouveau' ? carnetConfreres.find(o => o.id === carnetEdition) : null;
    const depuisAnnuaire = !existant && carnetEdition === 'nouveau' && carnetBrouillon && carnetBrouillon.id
      && !carnetConfreres.some(o => o.id === carnetBrouillon.id)
      ? { id: carnetBrouillon.id, source: carnetBrouillon.source, bureaux: carnetBrouillon.bureaux || [] } : null;
    const office = Object.assign({}, existant || depuisAnnuaire || { id: 'saisie-' + Date.now().toString(36), source: 'Saisi par l’étude' }, {
      office: val('carnet-f-office').trim(),
      notaires: val('carnet-f-notaires').split(/\n+/).map(s => s.replace(/^\s*(ma[iî]tre|me)\.?\s+/i, '').trim()).filter(Boolean),
      adresse: val('carnet-f-adresse').trim(),
      codePostal: val('carnet-f-cp').trim(),
      ville: val('carnet-f-ville').trim(),
      telephone: val('carnet-f-tel').trim(),
      email: val('carnet-f-email').trim(),
      notes: val('carnet-f-notes').trim()
    });
    if (!office.office && !office.notaires.length) {
      afficherToast('Indiquez au moins le nom de l’office ou un notaire.', 'OK', null);
      return;
    }
    if (office.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(office.email)) {
      afficherToast('Cet email n’est pas valide.', 'OK', null);
      return;
    }
    const bouton = document.getElementById('carnet-f-valider');
    if (bouton) bouton.disabled = true;
    try {
      await enregistrerOfficeCarnet(office);
      carnetEdition = null;
      carnetBrouillon = null;
      renderCarnetConfreres();
      render();
    } catch (e) {
      if (bouton) bouton.disabled = false;
      afficherToast(e.message, 'OK', null);
    }
  }

  function retirerOfficeCarnet(id) {
    const o = carnetConfreres.find(x => x.id === id);
    if (!o || o.etude) return;
    const annule = o.annuaire !== false;
    demanderConfirmation(annule ? `Réinitialiser ${o.office || 'cet office'} tel que relevé dans l’annuaire ?` : `Retirer ${o.office || 'cet office'} de l’annuaire ?`, async () => {
      try {
        const r = await fetchAvecAuth('/api/confreres/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!r.ok) throw new Error('Retrait impossible.');
        carnetConfreres = (await r.json()).offices || [];
        renderCarnetConfreres();
        render();
      } catch (e) { afficherToast(e.message, 'OK', null); }
    });
  }

  function rechercherCarnet(valeur) {
    carnetRecherche = valeur;
    renderCarnetConfreres();
  }

  // Un email de confrère saisi sur un dossier complète l'office du carnet qui n'en avait pas.
  function completerEmailCarnet(nomNotaire, email) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const t = trouverOfficeConfrere(nomNotaire, carnetConfreres);
    if (!t || t.office.email) return;
    enregistrerOfficeCarnet(Object.assign({}, t.office, { email })).catch(() => {});
  }

  // La mention d'envoi figure-t-elle déjà dans le lieu du rendez-vous, tel que relevé dans l'agenda
  // de l'office (agendaWatch.js : rendezVousSignatureLieu, posé seulement quand la date de l'agenda
  // est celle de la fiche) ? Demandé par l'étude le 29/09 : « si déjà présent dans l'agenda,
  // marquer comme fait » — une mention écrite à la main dans Outlook compte. Chaque envoi fait doit
  // y être : « Appel de fonds » pour l'appel de fonds, « projet » pour le projet. Pure.
  function mentionDejaDansAgenda(d) {
    if (!d || !d.rendezVousSignature || !d.rendezVousSignatureLieu) return false;
    const rep = d.detectionsAgenda || {};
    if (rep.rendezVousSignature !== d.rendezVousSignature) return false;
    const lieu = normaliserPourRecherche(d.rendezVousSignatureLieu).replace(/[^a-z0-9]+/g, ' ');
    const af = echeanceValidee(d, 'appelFonds');
    const pj = echeanceValidee(d, 'projetEnvoye');
    if (!af && !pj) return false;
    if (!/\benvoye/.test(lieu)) return false;
    return (!af || /\bappel de fonds?\b/.test(lieu)) && (!pj || /\bprojets?\b/.test(lieu));
  }

  function renderNoterAgenda(d) {
    if (!exchangeAgendaPret() || !d.rendezVousSignature) return '';
    const mention = mentionEnvoisAgenda(d);
    if (!mention) return '';
    const dejaPresente = mentionDejaDansAgenda(d);
    // Échec de la dernière écriture automatique : dit sur la ligne, sinon rien ne distinguait
    // « pas encore essayé » de « essayé et refusé » (cas signalé sur BANCQUART / MANDARD).
    // Déjà dans l'agenda : fait, même après un échec d'écriture (écrit à la main dans Outlook).
    const echec = !dejaPresente && d.agendaLieuEchec && d.agendaLieuEchec.message;
    const sousHtml = echec
      ? `<span class="dot-label dl-alerte" title="${escapeAttr(d.agendaLieuEchec.message)}">Non noté le ${formatDateFr(String(d.agendaLieuEchec.le || '').slice(0, 10))} : ${escapeHtml(d.agendaLieuEchec.message)}</span>`
      : dejaPresente ? `Déjà dans l’agenda : « ${escapeHtml(d.rendezVousSignatureLieu)} »`
      : (d.agendaLieuNoteLe ? `Noté le ${formatDateFr(d.agendaLieuNoteLe.slice(0, 10))}, dans le lieu du rendez-vous` : 'Écrit dans le lieu du rendez-vous de signature, après les initiales');
    const faite = dejaPresente || (!!d.agendaLieuNoteLe && !echec);
    return renderLigneAction({
      categorie: 'rendezVousSignature', categorieLabel: 'Agenda de l’office',
      titre: `Noter dans l’agenda : ${mention}`, sousHtml, faite, gravite: echec ? 'critique' : '',
      bouton: { libelle: faite ? 'Renoter' : (echec ? 'Réessayer' : 'Noter'), icone: icone('calendar'), onclick: `noterEnvoiDansAgenda('${d.id}')`, titre: `Écrire « ${mention} » dans le lieu du rendez-vous de signature, après les initiales, dans l'agenda Outlook de l'office` }
    });
  }

  // Formulaire de création du rendez-vous de signature DANS l'agenda Outlook de l'office (voir
  // server/src/exchange/ews.js). La fiche ne stocke qu'une DATE : il demande l'heure et la durée
  // (préremplies depuis l'heure relevée dans l'agenda si elle existe, sinon 14:00 / 60 min) et le
  // lieu (couleur). Le formulaire visible EST la confirmation explicite d'une écriture dans l'agenda
  // partagé — pas de seconde boîte de dialogue par-dessus. Affiché dans la ligne d'action « Créer le
  // rendez-vous » de l'encadré Prochaine étape, ou sous la ligne du rendez-vous pour le recréer.
  function renderFormRdvAgenda(d) {
    const heure = d.rendezVousSignatureHeure || '14:00';
    return `<div class="rdv-agenda-form">
      <div class="rdv-agenda-champs">
        <label>Heure <input type="time" id="rdv-agenda-heure-${d.id}" value="${escapeAttr(heure)}"></label>
        <label>Durée
          <select id="rdv-agenda-duree-${d.id}">
            <option value="30">30 min</option>
            <option value="60" selected>1 h</option>
            <option value="90">1 h 30</option>
            <option value="120">2 h</option>
          </select>
        </label>
      </div>
      <div class="rdv-type-choix" role="radiogroup" aria-label="Lieu du rendez-vous">
        ${Object.entries(TYPES_RDV).map(([cle, t]) => `<label class="rdv-type-option">
          <input type="radio" name="rdv-agenda-type-${d.id}" value="${cle}"${(typeRendezVous(d, categoriesRdvReglees()) || 'office') === cle ? ' checked' : ''}>
          <span class="rdv-type-pastille rdv-type-${cle}"></span>${t.libelle}
        </label>`).join('')}
      </div>
      <p class="hint" style="margin:4px 0 6px;">Écrit « ${escapeHtml(libelleDossierAffiche(d))} » le ${formatDateFr(d.rendezVousSignature)} dans l'agenda partagé de l'office${lieuRdvAgenda(d) ? `, lieu « ${escapeHtml(lieuRdvAgenda(d))} »` : ''}.</p>
      <div class="rdv-agenda-actions">
        <wa-button variant="brand" class="primary" onclick="creerRdvDansAgenda('${d.id}')">${icone('calendar')} Créer le rendez-vous</wa-button>
        <button type="button" class="lien-bouton" onclick="basculerRdvAgenda('${d.id}')">Annuler</button>
      </div>
    </div>`;
  }

  // Ligne d'action « Créer le rendez-vous dans l'agenda » : proposée quand la connexion Exchange est
  // activée et configurée (exchangeAgendaPret), qu'une date de rendez-vous existe et qu'il n'a pas
  // encore été créé depuis CLAIRE. Le formulaire s'y déplie (s'ouvre tout seul après la saisie de la
  // date, voir validerEditionDate).
  // Le rendez-vous est-il déjà dans l'agenda de l'office ? Créé depuis CLAIRE (rdvAgendaCreeLe), ou
  // posé à la main dans Outlook et relevé à la même date par la lecture de l'agenda (agendaWatch.js)
  // — sauf s'il en a disparu depuis. Demandé par l'étude le 29/09 : ne plus proposer de créer un
  // rendez-vous déjà placé. Pure.
  function rdvDejaDansAgenda(d) {
    if (!d || !d.rendezVousSignature) return false;
    if (d.rdvAgendaCreeLe) return true;
    const rep = d.detectionsAgenda || {};
    return rep.rendezVousSignature === d.rendezVousSignature && rep.rendezVousDisparu !== d.rendezVousSignature;
  }

  function renderLigneCreerRdvAgenda(d) {
    if (!exchangeAgendaPret() || !d.rendezVousSignature || rdvDejaDansAgenda(d) || d.archive) return '';
    const ouvert = rdvAgendaOuvert && dossierOuvert === d.id;
    return renderLigneAction({
      categorie: 'rendezVousSignature', categorieLabel: 'Agenda de l’office',
      titre: 'Créer le rendez-vous dans l’agenda Outlook',
      sous: `Signature le ${formatDateFr(d.rendezVousSignature)} · calendrier partagé de l’office`,
      bouton: ouvert ? null : { libelle: 'Créer', icone: icone('calendar'), onclick: `basculerRdvAgenda('${d.id}')`, titre: 'Choisir l’heure et le lieu, puis créer le rendez-vous' },
      detail: ouvert ? renderFormRdvAgenda(d) : '', detailOuvert: ouvert
    });
  }

  function basculerRdvAgenda(id) {
    rdvAgendaOuvert = !(rdvAgendaOuvert && dossierOuvert === id);
    render();
  }

  async function creerRdvDansAgenda(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.rendezVousSignature) return;
    const champHeure = document.getElementById(`rdv-agenda-heure-${id}`);
    const champDuree = document.getElementById(`rdv-agenda-duree-${id}`);
    const heure = champHeure ? champHeure.value : '';
    const dureeMinutes = champDuree ? parseInt(champDuree.value, 10) : 60;
    if (!/^\d{2}:\d{2}$/.test(heure)) { afficherToast('Renseignez une heure valide.', 'OK', null); return; }
    const choixType = document.querySelector(`input[name="rdv-agenda-type-${id}"]:checked`);
    const typeRdv = choixType && TYPES_RDV[choixType.value] ? choixType.value : 'office';
    const categorie = categoriesRdvReglees()[typeRdv] || '';
    const lieu = lieuRdvAgenda(d);
    const mention = mentionEnvoisAgenda(d);
    try {
      const reponse = await fetchAvecAuth('/api/exchange/rendez-vous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sujet: libelleDossierAffiche(d),
          date: d.rendezVousSignature,
          heure,
          dureeMinutes,
          lieu,
          categorie,
          corps: 'Rendez-vous de signature créé depuis CLAIRE.'
        })
      });
      const corps = await reponse.json();
      if (corps.ok) {
        d.rdvAgendaCreeLe = new Date().toISOString();
        d.rendezVousSignatureHeure = heure;
        d.rendezVousType = typeRdv;
        // Identifiant de l'événement : pour le retirer ou le déplacer quand la date change dans CLAIRE.
        d.rdvAgendaItem = corps.itemId ? { itemId: corps.itemId, changeKey: corps.changeKey || '', date: d.rendezVousSignature } : null;
        // L'envoi déjà fait est écrit dans le lieu dès la création : rien à noter ensuite.
        if (mention) { d.agendaLieuNoteLe = d.rdvAgendaCreeLe; d.agendaLieuEchec = null; }
        ajouterHistorique(d, `Rendez-vous de signature créé dans l'agenda Outlook (${formatDateFr(d.rendezVousSignature)} à ${heure}, ${TYPES_RDV[typeRdv].libelle.toLowerCase()}${lieu ? `, lieu « ${lieu} »` : ''}).`);
        sauvegarder(d);
        rdvAgendaOuvert = false;
        render();
        afficherToast(corps.message || 'Rendez-vous créé dans l\'agenda.', 'OK', null);
      } else {
        afficherToast(corps.message || 'La création du rendez-vous a échoué.', 'OK', null);
      }
    } catch (e) {
      afficherToast('Serveur injoignable — rendez-vous non créé.', 'OK', null);
    }
  }

  // Le rendez-vous de signature vient d'être supprimé dans CLAIRE : le retirer aussi de l'agenda de
  // l'office (demandé par l'étude). Le serveur le désigne par l'identifiant mémorisé quand CLAIRE l'a
  // créé, sinon le retrouve à sa date par « VTE - <nom> » — et n'en retire aucun si deux
  // correspondent. Il part dans les éléments supprimés d'Outlook (récupérable). Un seul essai.
  async function retirerRdvDeAgenda(d, ancienneDate) {
    if (!d || !ancienneDate || !exchangeAgendaPret()) return;
    const item = d.rdvAgendaItem || {};
    try {
      const reponse = await fetchAvecAuth('/api/exchange/rendez-vous/supprimer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: ancienneDate, reference: d.nom, dossierId: d.id, itemId: item.itemId || '', changeKey: item.changeKey || '' })
      });
      const corps = await reponse.json();
      if (corps.ok) {
        d.rdvAgendaItem = null;
        d.rdvAgendaCreeLe = null;
        d.agendaLieuNoteLe = null;
        d.agendaLieuEchec = null;
        if (!corps.introuvable) ajouterHistorique(d, `Rendez-vous de signature du ${formatDateFr(ancienneDate)} retiré de l'agenda Outlook de l'office.`);
        sauvegarder(d);
        render();
      }
      afficherToast(corps.ok ? (corps.message || "Rendez-vous retiré de l'agenda.") : `Rendez-vous non retiré de l'agenda : ${corps.message || 'échec'}`, 'OK', null);
    } catch (e) {
      afficherToast("Serveur injoignable — le rendez-vous reste dans l'agenda Outlook, à retirer à la main.", 'OK', null);
    }
  }

  // La date du rendez-vous a changé dans CLAIRE : déplacer l'événement de l'agenda au nouveau jour,
  // à la même heure, sans toucher à son lieu ni à sa couleur. Renvoie 'deplace', 'introuvable'
  // (aucun rendez-vous de ce dossier à l'ancienne date : rien à déplacer) ou 'echec'.
  async function deplacerRdvDansAgenda(d, ancienneDate, nouvelleDate) {
    if (!d || !ancienneDate || !nouvelleDate || !exchangeAgendaPret()) return 'echec';
    const item = d.rdvAgendaItem || {};
    try {
      const reponse = await fetchAvecAuth('/api/exchange/rendez-vous/deplacer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ancienneDate, nouvelleDate, reference: d.nom, dossierId: d.id, itemId: item.itemId || '' })
      });
      const corps = await reponse.json();
      if (corps.ok && corps.introuvable) return 'introuvable';
      if (!corps.ok) {
        afficherToast(`Rendez-vous non déplacé dans l'agenda : ${corps.message || 'échec'}`, 'OK', null);
        return 'echec';
      }
      if (corps.heure) d.rendezVousSignatureHeure = corps.heure;
      d.rdvAgendaItem = { itemId: corps.itemId || item.itemId || '', changeKey: corps.changeKey || '', date: nouvelleDate };
      ajouterHistorique(d, `Rendez-vous de signature déplacé dans l'agenda Outlook : ${formatDateFr(ancienneDate)} → ${formatDateFr(nouvelleDate)}${corps.heure ? ` à ${corps.heure}` : ''}.`);
      sauvegarder(d);
      render();
      afficherToast("Rendez-vous déplacé dans l'agenda de l'office.", 'OK', null);
      return 'deplace';
    } catch (e) {
      afficherToast("Serveur injoignable — rendez-vous non déplacé dans l'agenda.", 'OK', null);
      return 'echec';
    }
  }

  function ouvrirFormRdvAgenda(d) {
    rdvAgendaOuvert = true;
    render();
    const champ = document.getElementById(`rdv-agenda-heure-${d.id}`);
    if (champ) {
      if (champ.scrollIntoView) champ.scrollIntoView({ block: 'center', behavior: 'smooth' });
      champ.focus();
    }
  }

  // Écrit la mention d'envoi dans le lieu du rendez-vous de signature EXISTANT (voir la route
  // /exchange/rendez-vous/lieu). Le serveur retrouve le rendez-vous par sa date et sa référence
  // « VTE - <nom> », ajoute « Appel de fonds [et projet] envoyé » après les initiales sans doublon,
  // et laisse le code couleur intact. Rien n'est créé : si aucun rendez-vous n'est trouvé, un toast
  // le dit et rien n'est écrit.
  // `auto` : appelée automatiquement à la validation d'une date d'envoi (voir validerEditionDate),
  // pas par un clic sur le bouton. Demandé par l'étude (« quand une date d'envoi d'appel de fonds
  // et/ou de projet est validée, le noter automatiquement dans l'agenda, pas besoin d'appuyer sur
  // un bouton »). En mode auto : rien si Exchange n'est pas configuré (best-effort silencieux, pas
  // d'erreur sur chaque saisie de date), et sur ÉCHEC on reste silencieux — l'absence de la pastille
  // « Noté le… » et la présence du bouton signalent qu'il reste à faire, et le bouton permet de
  // réessayer avec un retour complet. Sur SUCCÈS, un toast bref confirme quand même : écrire dans un
  // agenda partagé que des collègues lisent doit rester un geste visible.
  async function noterEnvoiDansAgenda(id, auto, silencieux) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.rendezVousSignature) return;
    const af = echeanceValidee(d, 'appelFonds');
    const pj = echeanceValidee(d, 'projetEnvoye');
    if (!af && !pj) return;
    if (auto && !exchangeAgendaPret()) return;
    try {
      const reponse = await fetchAvecAuth('/api/exchange/rendez-vous/lieu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: d.rendezVousSignature, reference: d.nom, dossierId: d.id, itemId: (d.rdvAgendaItem && d.rdvAgendaItem.itemId) || '', appelFonds: af, projet: pj, confrere: confrereLieuAgenda(d), initiales: initialesResponsable(d) })
      });
      const corps = await reponse.json();
      if (corps.ok) {
        d.agendaLieuNoteLe = new Date().toISOString();
        d.agendaLieuEchec = null;
        const libelle = (af && pj) ? 'appel de fonds et projet envoyé' : af ? 'appel de fonds envoyé' : 'projet envoyé';
        ajouterHistorique(d, `Mention « ${libelle} » notée dans l'agenda Outlook${auto ? ' (automatique)' : ''}.`);
        sauvegarder(d);
        render();
        afficherToast(corps.message || 'Agenda mis à jour.', 'OK', null);
      } else {
        signalerEchecNoteAgenda(d, corps.message || "La mise à jour de l'agenda a échoué.", silencieux);
      }
    } catch (e) {
      signalerEchecNoteAgenda(d, 'Serveur injoignable — agenda non mis à jour.', silencieux);
    }
  }

  // Un envoi (appel de fonds, projet) validé SANS passer par une date saisie sur ce poste — décompte retrouvé sur le NAS par le
  // serveur (nasWatch), case cochée dans une autre fenêtre, dossier ancien — n'a jamais été noté dans le lieu du rendez-vous de
  // signature d'Outlook (étude 05/10). Pure : ce dossier attend-il cette note ? Rendez-vous à venir, envoi validé, jamais noté
  // ni refusé (un refus reste affiché sur la fiche, « Réessayer »), mention absente du lieu relevé dans l'agenda.
  function envoiAgendaARattraper(d, aujourdhui) {
    if (!d || d.archive || estSuccession(d)) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.rendezVousSignature || '')) || d.rendezVousSignature < aujourdhui) return false;
    if (!echeanceValidee(d, 'appelFonds') && !echeanceValidee(d, 'projetEnvoye')) return false;
    if (d.agendaLieuNoteLe || (d.agendaLieuEchec && d.agendaLieuEchec.message)) return false;
    return !mentionDejaDansAgenda(d);
  }

  // Une tentative par dossier et par session, espacées (un seul essai par appel : verrouillage du compte), jamais de toast d'échec.
  var notesAgendaTentees = new Set();
  async function rattraperNotesAgenda() {
    if (!exchangeAgendaPret()) return;
    const aujourdhui = isoAujourdhuiLocal();
    for (const d of (dossiers || []).slice()) {
      if (notesAgendaTentees.has(d.id) || !envoiAgendaARattraper(d, aujourdhui)) continue;
      notesAgendaTentees.add(d.id);
      await noterEnvoiDansAgenda(d.id, true, true);
      await new Promise(ok => setTimeout(ok, 3000));
    }
  }

  // Un échec (automatique ou non) est gardé sur le dossier et affiché sur la carte « Envoi au
  // client », avec un toast : l'ancien mode silencieux laissait croire la mention écrite.
  function signalerEchecNoteAgenda(d, message, silencieux) {
    d.agendaLieuEchec = { le: new Date().toISOString(), message };
    sauvegarder(d);
    render();
    if (silencieux) return;
    afficherToast(`Agenda non mis à jour (${libelleDossierAffiche(d)}) : ${message}`, 'OK', null);
  }

  // --- Obtention du prêt et vente préalable tenues dans le calendrier partagé de l'office ---
  //
  // Demandé par l'étude (28/09, puis 29/09 : « passe par la connexion de l'agenda partagé ») : ces
  // deux dates butoir sont posées directement dans le calendrier partagé de Sophie (voir
  // /exchange/echeance et ews.js) — le flux .ics que publiait CLAIRE est supprimé. Un événement
  // « toute la journée » par échéance, dont CLAIRE garde l'identifiant sur le dossier
  // (d.agendaEcheances[type] = { itemId, changeKey, date }) : il est DÉPLACÉ quand la date change et
  // RETIRÉ quand la condition est levée (offre reçue, vente préalable réalisée), la date effacée ou
  // le dossier archivé.
  //
  //   - Ce poste crée l'événement au moment où l'étude touche la date (creerSiAbsent). Tout ce qui
  //     manque encore (dossiers existants, création échouée) est posé par le SERVEUR à son tour de
  //     lecture de l'agenda (server/src/echeancesAgenda.js), qui retrouve d'abord un événement au
  //     même titre et à la même date plutôt que d'en créer un second ;
  //   - mise à jour et retrait automatiques, sur le seul identifiant mémorisé : jamais d'événement
  //     deviné d'après son titre.
  var LIBELLES_ECHEANCE_AGENDA = { pret: 'Obtention du prêt', ventebien: 'Vente préalable' };
  var CORPS_ECHEANCE_AGENDA = {
    pret: 'Date butoir posée par CLAIRE. Retirée automatiquement une fois l’offre de prêt reçue.',
    ventebien: 'Date butoir posée par CLAIRE. Retirée automatiquement une fois la vente préalable signée.'
  };

  // Titre de l'événement — IDENTIQUE à celui que compose le serveur (server/src/echeancesAgenda.js,
  // vérifié par tests/echeances-agenda-client.test.js) : c'est lui qui permet au serveur de
  // retrouver l'événement au lieu de le doubler. Jamais « VTE - … » : l'agenda de l'office relu par
  // CLAIRE prendrait l'événement pour un rendez-vous de signature.
  function sujetEcheanceAgenda(d, type) {
    return `${LIBELLES_ECHEANCE_AGENDA[type]} — ${extraireNomAcquereur(d.nom)} - Dossier ${d.nom}`;
  }

  // Miroir de echeanceAgendaSouhaitee côté serveur (même verdict, vérifié par test) : seule une vraie
  // date AAAA-MM-JJ peut être posée dans l'agenda.
  function echeanceAgendaSouhaitee(d, type) {
    if (!d || d.archive || !LIBELLES_ECHEANCE_AGENDA[type]) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d[type] || ''))) return false;
    if (type === 'pret' && d.sansPret) return false;
    return !echeanceValidee(d, type);
  }

  // Ce qu'il faut faire pour que l'agenda reflète le dossier : 'creer', 'modifier', 'supprimer' ou
  // null. Pure, testable. `creerSiAbsent` n'est vrai que sur un geste de l'étude sur CETTE date
  // (saisie, recatégorisation, validation annulée, désarchivage) : un contrôle automatique (NAS,
  // démarrage) ne crée jamais, il ne fait que déplacer ou retirer ce que CLAIRE a déjà posé.
  function actionEcheanceAgenda(d, type, creerSiAbsent) {
    const pose = d && d.agendaEcheances && d.agendaEcheances[type];
    const souhaitee = echeanceAgendaSouhaitee(d, type);
    if (pose && pose.itemId) {
      if (!souhaitee) return 'supprimer';
      return pose.date === d[type] ? null : 'modifier';
    }
    return souhaitee && creerSiAbsent ? 'creer' : null;
  }

  // Un seul appel à la fois par échéance (deux saisies rapprochées ne créent pas deux événements),
  // et plus aucune tentative automatique après un refus d'identifiants : chaque essai raté compte
  // comme une tentative échouée sur le compte de messagerie, et plusieurs le verrouillent.
  const echeancesAgendaEnCours = new Set();
  let syncEcheancesAgendaSuspendue = false;

  // Retourne { ok, message } quand un appel a eu lieu, undefined quand il n'y avait rien à faire.
  async function synchroniserEcheanceAgenda(d, type, creerSiAbsent) {
    if (!d || !LIBELLES_ECHEANCE_AGENDA[type]) return undefined;
    const action = actionEcheanceAgenda(d, type, creerSiAbsent);
    if (!action || syncEcheancesAgendaSuspendue || !exchangeAgendaPret()) return undefined;
    const cle = d.id + ':' + type;
    if (echeancesAgendaEnCours.has(cle)) return undefined;
    echeancesAgendaEnCours.add(cle);
    const libelle = LIBELLES_ECHEANCE_AGENDA[type];
    const pose = (d.agendaEcheances && d.agendaEcheances[type]) || {};
    let recreer = false;
    try {
      const corps = { action, date: d[type] || '', itemId: pose.itemId || '', changeKey: pose.changeKey || '' };
      if (action === 'creer') {
        corps.sujet = sujetEcheanceAgenda(d, type);
        corps.corps = CORPS_ECHEANCE_AGENDA[type];
      }
      const reponse = await fetchAvecAuth('/api/exchange/echeance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps)
      });
      const r = await reponse.json();
      if (r.ok) {
        d.agendaEcheances = d.agendaEcheances || {};
        if (action === 'supprimer') {
          delete d.agendaEcheances[type];
          ajouterHistorique(d, `« ${libelle} » retirée de l’agenda Outlook`);
        } else {
          d.agendaEcheances[type] = { itemId: r.itemId || pose.itemId, changeKey: r.changeKey || pose.changeKey, date: d[type] };
          ajouterHistorique(d, action === 'creer'
            ? `« ${libelle} » posée dans l’agenda Outlook (${formatDateFr(d[type])})`
            : `« ${libelle} » déplacée au ${formatDateFr(d[type])} dans l’agenda Outlook`);
        }
        sauvegarder(d);
        render();
        afficherToast(r.message || 'Agenda mis à jour.', 'OK', null);
      } else if (r.introuvable) {
        // Effacé à la main dans Outlook : l'identifiant ne sert plus, on repose l'événement.
        delete d.agendaEcheances[type];
        sauvegarder(d);
        recreer = true;
      } else if (r.raison === 'auth') {
        syncEcheancesAgendaSuspendue = true;
        afficherToast('Identifiants de messagerie refusés : les dates ne sont plus envoyées à l’agenda jusqu’au prochain lancement. Vérifiez les Réglages.', 'OK', null);
      }
      // Autre échec : silencieux. Une date pas encore posée l'est par le serveur à son prochain tour
      // de lecture de l'agenda, et un retrait ou un déplacement en attente est retenté au prochain
      // lancement.
      return { ok: !!r.ok, message: r.message };
    } catch (e) {
      return { ok: false, message: 'Serveur injoignable.' };
    } finally {
      echeancesAgendaEnCours.delete(cle);
      if (recreer) synchroniserEcheanceAgenda(d, type, true);
    }
  }

  // Assainit d.agendaEcheances à l'import d'une sauvegarde : seules les deux clés connues, et
  // seulement avec un identifiant exploitable. Pure, testable.
  function agendaEcheancesImportees(v) {
    const sortie = {};
    if (!v || typeof v !== 'object') return sortie;
    for (const type of Object.keys(LIBELLES_ECHEANCE_AGENDA)) {
      const e = v[type];
      if (!e || typeof e.itemId !== 'string' || !e.itemId) continue;
      sortie[type] = {
        itemId: e.itemId,
        changeKey: typeof e.changeKey === 'string' ? e.changeKey : '',
        date: typeof e.date === 'string' ? e.date : ''
      };
    }
    return sortie;
  }

  // Au démarrage : retente ce qui a pu échouer (retrait après une offre reçue pendant une coupure,
  // déplacement…). Ne regarde que les dossiers dont CLAIRE a déjà posé une date — jamais de
  // création — et s'arrête au premier échec plutôt que d'enchaîner les tentatives.
  async function reconcilierEcheancesAgenda() {
    if (!exchangeAgendaPret()) return;
    for (const d of dossiers) {
      if (!d.agendaEcheances) continue;
      for (const type of Object.keys(LIBELLES_ECHEANCE_AGENDA)) {
        const r = await synchroniserEcheanceAgenda(d, type, false);
        if (r && !r.ok) return;
      }
    }
  }

  // Ordre d'affichage des cartes d'échéance sur la fiche : CHRONOLOGIQUE (demandé par l'étude),
  // et non plus l'ordre fixe prêt → appel de fonds → acte → rendez-vous → vente préalable →
  // personnalisées, qui ne disait rien de ce qui arrive en premier. Une échéance sans date
  // renseignée n'a rien à classer : elle part en fin de liste, dans ce même ordre naturel (le tri
  // de JS est stable, donc les non datées gardent leur ordre d'insertion) — les reléguer en tête
  // ferait disparaître les vraies échéances sous des cartes vides.
  // Ne touche QUE l'affichage : l'index passé à renderLigneEcheance pour une échéance personnalisée reste
  // sa position réelle dans d.autres (c'est lui qui identifie l'entrée pour l'édition et la
  // suppression, voir supprimerEcheanceAutre), pas son rang une fois trié.
  // Carte « Envoi au client » d'autrefois : ses deux entrées sont maintenant deux lignes de la
  // liste, chacune sa date — « Envoi appel de fonds » (d.appelFonds) et « Envoi projet »
  // (d.projetEnvoye). Une date saisie vaut envoi fait (marquerAppelFondsSelonDate /
  // marquerProjetEnvoyeSelonDate, via validerEditionDate) : pas de « Marquer réalisée », la date EST
  // la validation. La confirmation de réception des fonds et la note d'agenda sont des gestes :
  // elles vivent dans l'onglet Échanges, en lignes d'action.
  // Trois raisons d'afficher ces deux lignes (il faut les trois, voir l'historique) : une date déjà
  // saisie ne disparaît jamais ; un rendez-vous de signature fixé les rend dues ; le dossier complet.
  function echeancesOrdonneesFiche(d, confiance, offreBloc) {
    const lignes = [];
    if (estSuccession(d)) {
      lignes.push({ iso: d.rendezVousSignature, html: renderLigneEcheance('rendezVousSignature', 'Signature', d.rendezVousSignature, d.id, null, null, null, false, '', false, echeanceValidee(d, 'rendezVousSignature'), { fort: true, heure: plageHoraireRendezVous(d.rendezVousSignatureHeure, d.rendezVousSignatureHeureFin) }) });
      (d.autres || []).forEach((a, i) => lignes.push({ autre: true, iso: a.date, html: renderLigneEcheance('autre', escapeHtml(a.label), a.date, d.id, a.page, null, i, false, '', false, echeanceValidee(d, 'autre-' + i)) }));
      return `<ul class="ech-liste">${ordonnerEcheancesFiche(lignes).map(l => l.html).join('')}</ul>`;
    }
    // Ordre d'INSERTION = l'ordre du dossier (vente préalable → prêt → date butoir → appel de
    // fonds → projet → rendez-vous de signature) : c'est l'ordre affiché (ordonnerEcheancesFiche).
    if (d.ventebien) lignes.push({ iso: d.ventebien, html: renderLigneEcheance('ventebien', 'Vente préalable', d.ventebien, d.id, d.ventebienPage, confiance.ventebien, null, false, '', false, echeanceValidee(d, 'ventebien')) });
    lignes.push({ iso: d.pret, html: d.sansPret && !d.pret
      ? renderLigneEcheance('pret', 'Financement comptant', '', d.id, null, null, null, false, '', true, false, { comptant: true })
      : renderLigneEcheance('pret', 'Obtention du prêt', d.pret, d.id, d.pretPage, confiance.pret, null, d.offrePretStatut === 'recue', offreBloc, d.sansPret, echeanceValidee(d, 'pret')) });
    // La date butoir n'a sa propre ligne que tant qu'aucun rendez-vous n'est fixé : ensuite elle
    // n'est plus qu'indicative, et devient une précision sous le rendez-vous (voir plus bas).
    const butoirSousRdv = !!(d.rendezVousSignature && d.acte);
    const saferFiche = d.authentic && d.authentic.safer;
    const echeanceSaferFiche = saferFiche && d.roleNotaire !== 'participant' ? echeanceSaferTacite(saferFiche) : '';
    if (echeanceSaferFiche) {
      const levee = saferLevee(d);
      const avantRdv = !levee && d.rendezVousSignature && echeanceSaferFiche >= d.rendezVousSignature;
      const note = `<span class="ech-note${avantRdv ? ' ech-alerte' : ''}">${escapeHtml(avantRdv ? 'Après le rendez-vous de signature : la SAFER peut encore préempter ce jour-là' : suiviSaferPiece(d))}</span>`;
      lignes.push({ iso: echeanceSaferFiche, html: renderLigneEcheance('safer', 'Délai SAFER', echeanceSaferFiche, null, null, null, null, false, note, false, levee, { etatFait: '✓ Non-préemption' }) });
    }
    // Réponse à la DIA (envoi relevé dans Authentic + 2 mois), tant que la renonciation n'est pas reçue — jamais tacite : le document
    // de renonciation est indispensable pour signer (étude 07/10).
    const echeanceDiaFiche = echeanceDiaDossier(d);
    if (echeanceDiaFiche) {
      const apresRdv = d.rendezVousSignature && echeanceDiaFiche >= d.rendezVousSignature;
      const passe = echeanceDiaFiche < isoAujourdhuiLocal();
      const texte = apresRdv ? 'Après le rendez-vous de signature : sans le document de renonciation, l’acte ne peut pas être signé'
        : passe ? 'Délai de réponse écoulé : réclamer le document de renonciation à la mairie, indispensable pour signer'
          : 'DIA envoyée : réponse de la commune attendue au plus tard à cette date — le document de renonciation est indispensable pour signer';
      lignes.push({ iso: echeanceDiaFiche, html: renderLigneEcheance('dia', 'Réponse à la DIA', echeanceDiaFiche, null, null, null, null, false, `<span class="ech-note${apresRdv || passe ? ' ech-alerte' : ''}">${escapeHtml(texte)}</span>`, false, false) });
    }
    if (!butoirSousRdv) lignes.push({ iso: d.acte, html: renderLigneEcheance('acte', 'Date butoir', d.acte, d.id, d.actePage, confiance.acte, null, false, '', false, echeanceValidee(d, 'acte')) });
    // Rédaction de l'acte (étude 07/10) : dès qu'Authentic en donne l'état (« Non rédigé », « En cours », signé) ou qu'elle est
    // cochée à la main ; jamais en participation (le confrère rédige). Ce qui la retient encore est dit sous la ligne.
    if (!estSuccession(d) && d.roleNotaire !== 'participant' && (etatRedactionActe(d) || echeanceValidee(d, 'redaction'))) {
      const faite = echeanceValidee(d, 'redaction');
      const attentes = faite ? [] : attentesRedaction(d);
      const note = faite ? (etatRedactionActe(d) === 'redaction' ? '<span class="ech-note">En cours dans Authentic</span>' : '')
        : (attentes.length ? `<span class="ech-note">En attente : ${escapeHtml(attentes.join(', '))}</span>` : '<span class="ech-note">Pièces réunies : à rédiger</span>')
          + ((repere) => repere ? ` <span class="ech-note">${escapeHtml(repere)}</span>` : '')(d.rendezVousSignature ? '' : phraseRepereRedaction(d, isoAujourdhuiLocal()));
      const iso = faite ? '' : echeanceRedaction(d);
      lignes.push({ iso, html: renderLigneEcheance('redaction', 'Rédaction de l’acte', iso, d.id, null, null, null, false, note, false, faite,
        { etatSansDate: attentes.length ? 'En attente' : 'À rédiger', etatFait: '✓ Commencée', cochable: true, sansCrayon: true }) });
    }
    if (d.appelFonds || d.projetEnvoye || d.rendezVousSignature || dossierEntierementComplet(d)) {
      ENVOIS_AVANT_SIGNATURE.forEach(({ cle, label }) => {
        const iso = d[cle] || '';
        const detecte = iso && d.detectionsAgenda && d.detectionsAgenda[cle];
        // Envoi noté automatiquement parce que le courrier est sur le NAS (voir nasWatch.js), tant
        // que la date n'a pas été corrigée à la main.
        const nas = cle === 'appelFonds' && iso && d.detectionsNas && d.detectionsNas.appelFonds === iso;
        const note = (detecte ? '<span class="ech-note">Relevé dans l’agenda</span>'
          : nas ? '<span class="ech-note">Noté automatiquement : courrier trouvé sur le NAS</span>' : '')
          + (cle === 'appelFonds' ? renderLienCourrierAppelFonds(d) : '');
        // La case ronde de la ligne note l'envoi à la date du jour (comme « Projet envoyé » / « Déjà envoyé » d'« Aujourd'hui », agenda compris,
        // voir marquerEnvoiAujourdhui) et le décoche (date effacée, délai et rappels rétablis, mention d'Outlook retirée).
        lignes.push({ iso, html: renderLigneEcheance(cle, label, iso, d.id, null, null, null, false,
          note, false,
          echeanceValidee(d, cle), { etatSansDate: 'À envoyer', etatFait: '✓ Envoyé', envoi: true, ancre: (cle === 'appelFonds' ? echeanceAppelFonds(d) : d.rendezVousSignature) || '' }) });
      });
    }
    const aReplacer = !d.rendezVousSignature && d.rendezVousARemplacer && d.rendezVousARemplacer.date ? d.rendezVousARemplacer : null;
    const noteReplacer = aReplacer ? `<span class="ech-note ech-a-replacer"><span class="dot-label dl-pret"><span class="dot"></span>Annulé</span> prévu le ${escapeHtml(formatDateFr(aReplacer.date))}${aReplacer.heure ? ' à ' + escapeHtml(aReplacer.heure) : ''} — à replacer</span>` : '';
    lignes.push({ iso: d.rendezVousSignature, html: renderLigneEcheance('rendezVousSignature', 'Signature', d.rendezVousSignature, d.id, null, null, null, false, noteReplacer + renderSousRendezVous(d, butoirSousRdv), false, echeanceValidee(d, 'rendezVousSignature'), { fort: true, heure: plageHoraireRendezVous(d.rendezVousSignatureHeure, d.rendezVousSignatureHeureFin), etatSansDate: aReplacer ? 'À replacer' : undefined }) });
    (d.autres || []).forEach((a, i) => lignes.push({ autre: true, iso: a.date, html: renderLigneEcheance('autre', escapeHtml(a.label), a.date, d.id, a.page, null, i, false, '', false, echeanceValidee(d, 'autre-' + i)) }));
    return `<ul class="ech-liste">${ordonnerEcheancesFiche(lignes).map(l => l.html).join('')}</ul>`;
  }

  // Ordre des lignes (demandé par l'étude le 29/09 : « pourquoi en bas de liste ? le mettre dans
  // l'ordre du dossier ») : les étapes du dossier restent dans l'ORDRE DU DOSSIER (vente préalable →
  // prêt → date butoir → appel de fonds → projet → signature), quelles que soient leurs dates — une
  // date de prêt postérieure au rendez-vous ne fait plus descendre le prêt en bas. Seules les
  // échéances personnalisées (`autre: true`) se placent par leur date, après la dernière étape datée
  // au plus tard ce jour-là ; sans date, en fin de liste. Pure : lignes {iso, html, autre}.
  function ordonnerEcheancesFiche(lignes) {
    const etapes = (lignes || []).filter(l => !l.autre);
    const perso = (lignes || []).filter(l => l.autre);
    const datees = perso.filter(l => l.iso).sort((a, b) => (a.iso < b.iso ? -1 : (a.iso > b.iso ? 1 : 0)));
    // Chaque échéance personnalisée datée va juste après la DERNIÈRE étape datée au plus tard le même
    // jour (en tête si aucune) : l'ordre des étapes, lui, ne bouge jamais.
    const apres = etapes.map(() => []);
    const enTete = [];
    for (const p of datees) {
      let j = -1;
      etapes.forEach((e, k) => { if (e.iso && e.iso <= p.iso) j = k; });
      (j < 0 ? enTete : apres[j]).push(p);
    }
    const out = enTete.slice();
    etapes.forEach((e, k) => { out.push(e); out.push(...apres[k]); });
    return out.concat(perso.filter(l => !l.iso));
  }

  // Le courrier d'appel de fonds (convocation, décompte acquéreur…) rattaché à la ligne « Envoi
  // appel de fonds », pour s'y reporter (demandé par l'étude le 29/09). Rattaché par le serveur
  // (d.appelFondsCourrier, voir courrierAppelFondsARattacher dans nasWatch.js) ; à défaut, et si un
  // dossier du NAS est relié, le lien le cherche à la racine au premier clic.
  function courrierAppelFondsDossier(d) {
    // Un décompte du confrère rattaché par erreur (avant le 06/10) n'est pas le courrier de l'étude : ignoré, « Retrouver le
    // courrier » cherche le nôtre (le serveur le détache à son prochain tour, voir nasWatch.js).
    const c = (d && (d.appelFondsCourrier || (d.detectionsNas && d.detectionsNas.appelFondsFichier))) || '';
    return c && !nomDitDecompteConfrere(c) ? c : '';
  }

  function renderLienCourrierAppelFonds(d) {
    const courrier = courrierAppelFondsDossier(d);
    if (courrier) {
      const nom = courrier.split(/[\\/]/).pop().replace(/\.pdf$/i, '');
      return `<button type="button" class="lien-action" onclick="ouvrirCourrierAppelFonds('${d.id}')" title="Ouvrir le courrier d’appel de fonds rangé sur le NAS">${icone('file-text')} ${escapeHtml(nom)}</button>`;
    }
    if (!d.nasDossier || !(d.appelFonds || echeanceValidee(d, 'appelFonds'))) return '';
    return `<button type="button" class="lien-action" onclick="ouvrirCourrierAppelFonds('${d.id}')" title="Chercher la convocation ou le décompte à la racine du dossier du NAS">${icone('file-text')} Retrouver le courrier</button>`;
  }

  async function ouvrirCourrierAppelFonds(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const connu = courrierAppelFondsDossier(d);
    if (connu) { ouvrirFichierNas(cheminNasComplet(d, connu)); return; }
    const onglet = window.open('', '_blank');
    try {
      const { parNom } = fichiersDecompteRacine(await listerFichiersNas(d), nomCompromisAttendu(d));
      if (!parNom.length) {
        if (onglet) onglet.close();
        afficherToast('Aucune convocation ni décompte à la racine du dossier du NAS.', 'OK', null);
        return;
      }
      d.appelFondsCourrier = parNom[0].chemin;
      sauvegarder(d);
      render();
      ouvrirFichierNas(cheminNasComplet(d, d.appelFondsCourrier), onglet);
    } catch (e) {
      if (onglet) onglet.close();
      afficherToast('Lecture du dossier du NAS impossible : ' + e.message, 'OK', null);
    }
  }

  // Seconde ligne du rendez-vous de signature : l'écart avec la date butoir (corrigeable sur place,
  // mêmes ids d'édition que l'ancienne ligne « Date butoir »), le relevé dans l'agenda de l'office,
  // le rendez-vous déjà posé dans Outlook et, pour le recréer, le formulaire.
  function renderSousRendezVous(d, avecButoir) {
    const parts = [];
    if (avecButoir) {
      const e = ecartButoirRendezVous(d.acte, d.rendezVousSignature);
      const idBase = `tabdate-${d.id}-acte`;
      parts.push(`<span class="ech-butoir${e && e.alerte ? ' alerte' : ''}">
        <span class="ech-butoir-aff" id="${idBase}-aff">${e ? escapeHtml(e.texte) : 'Date butoir'} (${dateCourteEcheance(d.acte)})<wa-button appearance="plain" size="s" type="button" class="bouton-icone ech-ico" onclick="activerEditionDate('${d.id}','acte')" title="Corriger la date butoir" aria-label="Corriger la date butoir">${icone('pencil')}</wa-button></span>
        <span class="tab-date-edition" id="${idBase}-edit" hidden>Date butoir
          <input type="date" class="tab-date-input" id="${idBase}-input" value="${d.acte}" onkeydown="if(event.key==='Enter'){event.preventDefault();validerEditionDate('${d.id}','acte');}">
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-valider" onclick="validerEditionDate('${d.id}','acte')" title="Valider" aria-label="Valider la date">✓</wa-button>
        </span>
      </span>`);
    }
    // Date relevée dans l'agenda de l'office (voir agendaWatch.js), tant qu'elle n'a pas été
    // corrigée à la main (la date saisie ne correspond alors plus au repère).
    if (d.rendezVousSignature && d.detectionsAgenda && d.detectionsAgenda.rendezVousSignature === d.rendezVousSignature) {
      parts.push('<span class="ech-note">Relevé dans l’agenda de l’office</span>');
    }
    const typeRdv = d.rendezVousSignature ? typeRendezVous(d, categoriesRdvReglees()) : '';
    if (d.rendezVousSignature && d.rdvAgendaCreeLe) {
      parts.push(`<span class="ech-note">${icone('calendar')} Dans l’agenda depuis le ${formatDateFr(d.rdvAgendaCreeLe.slice(0, 10))}</span>`);
    }
    if (typeRdv) parts.push(`<span class="rdv-type-etiquette"><span class="rdv-type-pastille rdv-type-${typeRdv}"></span>${TYPES_RDV[typeRdv].libelle}</span>`);
    if (d.rendezVousSignature && d.rdvAgendaCreeLe && exchangeAgendaPret()) {
      parts.push(rdvAgendaOuvert && dossierOuvert === d.id
        ? `<div class="ech-sous-bloc">${renderFormRdvAgenda(d)}</div>`
        : `<button type="button" class="lien-action" onclick="basculerRdvAgenda('${d.id}')">Recréer dans l’agenda</button>`);
    }
    return parts.join('');
  }

  // Les actions de ce dossier telles que « À faire » les montre (mêmes clés, mêmes gestes : cocher
  // ici coche aussi là-bas), sans celles reportées ou déjà traitées aujourd'hui sur ce poste.
  function actionsFicheDossier(d) {
    if (!d || d.archive) return [];
    const etat = lireEtatJour();
    const traitees = new Set(etat.traites.liste.map(t => t.cle));
    return actionsDuJour([d], isoAujourdhuiLocal()).actions.filter(a => !etat.reports[a.cle] && !traitees.has(a.cle));
  }

  // Encadré en tête de l'onglet Échéances : la prochaine échéance du dossier, et en dessous ce qu'il
  // y a à faire maintenant, en lignes d'action (renderLigneActionJour). Rien à faire et rien à venir :
  // pas d'encadré.
  // Une action de la fiche relève-t-elle de l'étape affichée en tête de l'encadré ? Sinon elle va
  // sous « Aussi à faire » (étude, 30/09 : la renonciation de préemption rangée sous « Obtention du
  // prêt » laissait croire qu'elle en dépendait). Rattachement par catégorie ; la préemption relève
  // de l'étape « Fixer le rendez-vous » (pas de rendez-vous sans elle).
  function actionLieeEtape(a, typeEtape) {
    if (!a || !typeEtape) return false;
    if (/safer/i.test(a.titre || '')) return typeEtape === 'safer' || typeEtape === 'fixerRdv';
    if (/pr[ée]emption/i.test(a.titre || '')) return typeEtape === 'preemption' || typeEtape === 'fixerRdv';
    if (typeEtape === 'fixerRdv' || typeEtape === 'preemption') return a.categorie === 'rendezVousSignature' || /rendez-vous/i.test(a.titre || '');
    return a.categorie === typeEtape;
  }

  function renderProchaineEtapeFiche(d) {
    if (!d || d.archive) return '';
    const prochaine = prochaineEcheanceDetail(d);
    const lignes = [];
    const autres = [];
    actionsFicheDossier(d).forEach(a => {
      (!prochaine || actionLieeEtape(a, prochaine.type) ? lignes : autres).push(renderLigneActionJour(a, false, true));
    });
    const creerRdv = renderLigneCreerRdvAgenda(d);
    if (creerRdv) (!prochaine || ['fixerRdv', 'rendezVousSignature'].includes(prochaine.type) ? lignes : autres).push(creerRdv);
    // Échec de la note d'agenda automatique, ou envoi noté par CLAIRE depuis le NAS (le serveur ne
    // l'écrit pas dans l'agenda) : à reprendre, donc à faire.
    const envoiNoteParNas = d.detectionsNas && d.detectionsNas.appelFonds && d.detectionsNas.appelFonds === d.appelFonds && !d.agendaLieuNoteLe;
    // Déjà dans l'agenda (écrit par CLAIRE ou à la main dans Outlook) : plus rien à faire.
    if (((d.agendaLieuEchec && d.agendaLieuEchec.message) || envoiNoteParNas) && !mentionDejaDansAgenda(d)) {
      const ligneAgenda = renderNoterAgenda(d);
      if (ligneAgenda) (!prochaine || ['appelFonds', 'projetEnvoye'].includes(prochaine.type) ? lignes : autres).push(ligneAgenda);
    }
    if (!prochaine && !lignes.length) return '';
    let tete = '<div class="prochaine-tete"><span class="section-eyebrow">À faire sur ce dossier</span></div>';
    let ton = '';
    if (prochaine) {
      const j = prochaine.jours;
      ton = j < 0 || j <= 3 ? 'urgent' : (j <= 15 ? 'proche' : '');
      const delai = j < 0 ? `dépassée de ${-j} j` : (j === 0 ? "aujourd'hui" : `J-${j}`);
      tete = `<div class="prochaine-tete">
        <span class="section-eyebrow">Prochaine étape</span>
        <div class="prochaine-ligne">
          <span class="dot-label dl-${prochaine.type}" aria-hidden="true"><span class="dot"></span></span>
          <strong>${escapeHtml(prochaine.label)}</strong>
          <span class="prochaine-date">${formatDateFr(prochaine.iso)}</span>
          <span class="prochaine-delai">${escapeHtml(delai)}</span>
        </div>
      </div>`;
    }
    return `<div class="prochaine-etape${ton ? ' ' + ton : ''}">
      ${tete}
      ${lignes.length ? `<ul class="ja-liste">${lignes.join('')}</ul>` : ''}
      ${autres.length ? `<div class="prochaine-tete prochaine-autres"><span class="section-eyebrow">Aussi à faire</span></div>
      <ul class="ja-liste">${autres.join('')}</ul>` : ''}
    </div>`;
  }

  // Marque une échéance comme réalisée (ou revient en arrière). La date n'est jamais effacée —
  // c'est la différence avec supprimerDateEcheance : le dossier garde la trace de la date butoir,
  // seule sa présence dans le planning change. `type` peut être une clé fixe (pret/acte/ventebien/
  // appelFonds/rendezVousSignature) ou "autre-N" pour une échéance personnalisée — voir cleEdition
  // dans renderLigneEcheance() et libelleEcheancePourHistorique() juste en dessous.
  function validerEcheance(id, type) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    d.echeancesValidees = d.echeancesValidees || {};
    d.echeancesValidees[type] = true;
    ajouterHistorique(d, `${libelleEcheancePourHistorique(d, type)} marquée réalisée`);
    notifierTacheFaite(d, libelleEcheancePourHistorique(d, type), 'marquée réalisée');
    sauvegarder(d);
    render();
    // Condition levée : l'événement posé dans l'agenda n'a plus lieu d'être.
    synchroniserEcheanceAgenda(d, type, false);
    // Appel de fonds / projet marqué fait à la main : la mention part aussi dans le lieu du rendez-vous Outlook, comme quand
    // la date est saisie (étude 05/10 : « même coché à la main ça ne remonte pas »).
    if (type === 'appelFonds' || type === 'projetEnvoye') noterEnvoiDansAgenda(id, true);
  }

  // Une date d'appel de fonds renseignée vaut appel de fonds fait (voir validerEditionDate) ;
  // pure sur le dossier passé, donc testable. Ne journalise que ce qui change réellement.
  function marquerAppelFondsSelonDate(d, iso) {
    const fait = !!iso;
    const deja = !!(d.echeancesValidees && d.echeancesValidees.appelFonds);
    if (fait === deja) return;
    d.echeancesValidees = d.echeancesValidees || {};
    if (fait) {
      d.echeancesValidees.appelFonds = true;
      ajouterHistorique(d, 'Appel de fonds marqué réalisé (date saisie)');
    } else {
      delete d.echeancesValidees.appelFonds;
    }
  }

  // Même principe que marquerAppelFondsSelonDate ci-dessus, pour le projet d'acte envoyé au
  // client : une date renseignée (à la main, ou détectée depuis l'agenda de l'office — voir
  // agendaWatch.js côté serveur) vaut envoi fait.
  function marquerProjetEnvoyeSelonDate(d, iso) {
    const fait = !!iso;
    const deja = !!(d.echeancesValidees && d.echeancesValidees.projetEnvoye);
    if (fait === deja) return;
    d.echeancesValidees = d.echeancesValidees || {};
    if (fait) {
      d.echeancesValidees.projetEnvoye = true;
      ajouterHistorique(d, 'Projet d’acte envoyé marqué réalisé (date saisie)');
    } else {
      delete d.echeancesValidees.projetEnvoye;
    }
  }

  // Cocher / décocher une échéance, UN seul geste partout (fiche, « Aujourd'hui », encadré « Prochaine étape ») — étude 05/10 :
  // « un bouton pour cocher et décocher comme une tâche ». Cocher un appel de fonds ou un projet = noter l'envoi à la date du jour
  // (la date EST la validation) ; décocher = effacer cette date : l'échéance retrouve son ancrage (le rendez-vous de signature) et
  // avec lui son délai J-n, donc ses rappels. Les autres échéances (prêt, vente préalable, butoir, perso, signature) gardent leur
  // date, seule la coche tombe.
  var TYPES_ENVOI_ECHEANCE = ['appelFonds', 'projetEnvoye'];

  function basculerEcheance(id, type) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    if (echeanceValidee(d, type)) devaliderEcheance(id, type); else cocherEcheance(id, type);
  }

  function cocherEcheance(id, type) {
    if (TYPES_ENVOI_ECHEANCE.includes(type)) marquerEnvoiAujourdhui(id, type); else validerEcheance(id, type);
  }

  function devaliderEcheance(id, type) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const envoi = TYPES_ENVOI_ECHEANCE.includes(type);
    if (!envoi && !d.echeancesValidees) return;
    if (envoi) {
      // La date d'envoi part avec la coche : gardée, elle ferait de « il y a trois jours » l'échéance de l'étape (dépassée, plus
      // aucun rappel). Le repère du NAS / de l'agenda (detectionsNas, detectionsAgenda) reste, pour que le décompte déjà rangé
      // ne recoche pas l'étape tout seul.
      d[type] = '';
      if (type === 'projetEnvoye') marquerProjetEnvoyeSelonDate(d, ''); else marquerAppelFondsSelonDate(d, '');
    } else if (type === 'redaction') {
      // Décochée à la main : retenue (false), sinon l'état « En cours » d'Authentic la recocherait aussitôt.
      d.echeancesValidees.redaction = false;
    } else {
      delete d.echeancesValidees[type];
    }
    ajouterHistorique(d, `${libelleEcheancePourHistorique(d, type)} : validation annulée`);
    sauvegarder(d);
    render();
    // Geste de l'étude sur cette échéance : elle redevient à suivre, on la repose dans l'agenda.
    synchroniserEcheanceAgenda(d, type, true);
    // La mention « envoyé » du lieu du rendez-vous suit : retirée (ou réduite à ce qui reste fait).
    if (envoi) majMentionAgendaEnvoi(id, true);
  }

  // Le lieu du rendez-vous de signature dans Outlook dit « Appel de fonds [et projet] envoyé » tant qu'un envoi est coché : il doit
  // se corriger quand on décoche, supprime la date ou annule un « fait » par erreur (sinon un collègue lit un envoi qui n'a pas eu lieu).
  async function majMentionAgendaEnvoi(id, silencieux) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.rendezVousSignature) return;
    if (echeanceValidee(d, 'appelFonds') || echeanceValidee(d, 'projetEnvoye')) { await noterEnvoiDansAgenda(id, true, silencieux); return; }
    await retirerEnvoiDansAgenda(id, silencieux);
  }

  // Le lieu relevé dans l'agenda porte-t-il une mention d'envoi (écrite par CLAIRE ou à la main) ? Pure.
  function lieuPorteMentionEnvoi(d) {
    if (!d || !d.rendezVousSignatureLieu) return false;
    const rep = d.detectionsAgenda || {};
    if (rep.rendezVousSignature !== d.rendezVousSignature) return false;
    const lieu = normaliserPourRecherche(d.rendezVousSignatureLieu).replace(/[^a-z0-9]+/g, ' ');
    return /\benvoye/.test(lieu) && /\b(appel de fonds?|projets?)\b/.test(lieu);
  }

  // Un seul essai, sans toast d'échec en mode silencieux (l'échec reste visible sur la fiche, « Noter dans l'agenda »).
  async function retirerEnvoiDansAgenda(id, silencieux) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.rendezVousSignature || !exchangeAgendaPret()) return;
    if (!d.agendaLieuNoteLe && !lieuPorteMentionEnvoi(d)) return;
    try {
      const reponse = await fetchAvecAuth('/api/exchange/rendez-vous/lieu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: d.rendezVousSignature, reference: d.nom, dossierId: d.id, itemId: (d.rdvAgendaItem && d.rdvAgendaItem.itemId) || '', appelFonds: false, projet: false, retrait: true })
      });
      const corps = await reponse.json();
      if (corps.ok) {
        d.agendaLieuNoteLe = null;
        d.agendaLieuEchec = null;
        ajouterHistorique(d, 'Mention d’envoi retirée du lieu du rendez-vous dans l’agenda Outlook (envoi décoché).');
        sauvegarder(d);
        render();
        if (!silencieux) afficherToast(corps.message || 'Agenda mis à jour.', 'OK', null);
      } else if (!silencieux) {
        afficherToast(`Mention d’envoi non retirée de l’agenda (${libelleDossierAffiche(d)}) : ${corps.message || 'échec'} — à corriger à la main dans Outlook.`, 'OK', null);
      }
    } catch (e) {
      if (!silencieux) afficherToast('Serveur injoignable — la mention reste dans l’agenda Outlook, à retirer à la main.', 'OK', null);
    }
  }

  // Échange le contenu de deux échéances fixes d'un dossier (aucune perte de données : si la
  // catégorie cible avait déjà une date, elle prend la place de l'ancienne).
  // « Date butoir », et non plus « Signature de l'acte » : cette date vient de l'avant-contrat et
  // n'est qu'INDICATIVE — c'est le rendez-vous réellement pris à l'office qui fait foi. L'étude a
  // demandé que son nom le dise et qu'elle disparaîsse du planning (voir echeancesPlanning).
  const LIBELLES_CATEGORIE = {
    pret: 'Obtention du prêt', acte: 'Date butoir', ventebien: 'Vente préalable',
    fixerRdv: 'Fixer le rendez-vous', preemption: 'Renonciation préemption attendue', safer: 'Délai SAFER',
    appelFonds: 'Envoi appel de fonds', redaction: 'Rédaction de l’acte', projetEnvoye: 'Envoi projet',
    rendezVousSignature: 'Rendez-vous de signature'
  };

  // Résout le libellé d'une échéance pour un message d'historique — les trois/cinq types fixes
  // via LIBELLES_CATEGORIE, une échéance personnalisée ("autre-N", sans libellé fixe puisqu'elle
  // porte le sien propre) via son label dans d.autres. Utilisée uniquement pour la validation
  // (validerEcheance/devaliderEcheance), généralisée à TOUS les types d'échéance — les autres
  // messages d'historique (changerCategorie, supprimerDateEcheance...) restent limités aux trois
  // types recatégorisables/fixes butoir et n'ont pas besoin de ce repli sur "autre-N".
  function libelleEcheancePourHistorique(d, type) {
    if (LIBELLES_CATEGORIE[type]) return LIBELLES_CATEGORIE[type];
    if (type.indexOf('autre-') === 0) {
      const item = (d.autres || [])[parseInt(type.slice(6), 10)];
      return item ? item.label : 'Échéance personnalisée';
    }
    return type;
  }

  function ajouterHistorique(d, texte) {
    d.historique = d.historique || [];
    const entree = { date: new Date().toISOString(), texte };
    // Qui a fait quoi : le collaborateur du poste, quand il est connu.
    if (typeof utilisateurPoste !== 'undefined' && utilisateurPoste) entree.auteur = utilisateurPoste;
    d.historique.push(entree);
  }

  function changerCategorie(dossierId, ancienType, nouveauType) {
    if (ancienType === nouveauType) return;
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const temp = d[nouveauType] || '';
    d[nouveauType] = d[ancienType] || '';
    d[ancienType] = temp;

    d.confiance = d.confiance || {};
    const tempC = d.confiance[nouveauType] || null;
    d.confiance[nouveauType] = d.confiance[ancienType] || 'manuel';
    d.confiance[ancienType] = tempC;

    ajouterHistorique(d, `« ${LIBELLES_CATEGORIE[ancienType]} » recatégorisée en « ${LIBELLES_CATEGORIE[nouveauType]} »`);
    sauvegarder(d);
    render();
    synchroniserEcheanceAgenda(d, ancienType, true);
    synchroniserEcheanceAgenda(d, nouveauType, true);
  }

  // Corrections après coup du type de vente et du rôle de l'étude — utile quand l'un des deux a
  // été mal renseigné à la création, ou change en cours de dossier (ex. l'étude devient
  // instrumentaire après avoir démarré en participant). Un simple <select> suffit ici (pas besoin
  // du mécanisme crayon+validation utilisé pour le nom/les dates) : ce sont des choix fermés à deux
  // valeurs, pas du texte libre où un clic accidentel risquerait de tout effacer.
  function changerTypeVente(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || d.typeVente === valeur) return;
    const libelle = (v) => v === 'copropriete' ? 'copropriété' : v === 'terrain' ? 'terrain à bâtir' : 'maison';
    ajouterHistorique(d, `Type de vente modifié : ${libelle(d.typeVente)} → ${libelle(valeur)}`);
    // La checklist de pièces (checklistPieces) est recalculée à partir de d.typeVente à chaque
    // affichage : pas besoin de retoucher d.pieces ici. Les pièces déjà reconnues sous une clé
    // commune aux deux types (ex. titrePropriete) restent valables ; celles propres à l'ancien type
    // (ex. etatDate en quittant la copropriété) restent en mémoire mais ne s'affichent plus,
    // inoffensif si l'étude revient un jour au type précédent.
    d.typeVente = valeur;
    sauvegarder(d);
    render();
  }

  // Même motif que changerTypeVente : un dossier peut changer de main en cours
  // de suivi (absence, réaffectation) sans repasser par la création.
  function changerResponsable(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || (d.responsable || '') === valeur) return;
    ajouterHistorique(d, `Responsable modifié : ${d.responsable || '— à définir —'} → ${valeur || '— à définir —'}`);
    d.responsable = valeur;
    sauvegarder(d);
    render();
  }

  // Adresse et prix : détectés automatiquement à l'import (voir detecterAdresseBien/
  // detecterPrixVente, premier jet sur des regex pas encore éprouvées sur beaucoup de compromis
  // réels), donc corrigeables directement sur la fiche — mêmes principes que Responsable/Type de
  // vente ci-dessus, mais en champ texte libre plutôt qu'un choix fermé.
  function changerAdresseBien(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouvelle = normaliserAdresse(valeur);
    if (nouvelle === (d.adresseBien || '')) return;
    ajouterHistorique(d, `Adresse du bien modifiée`);
    d.adresseBien = nouvelle;
    sauvegarder(d);
    render();
  }

  // Dépôt de garantie / acompte : même mécanique que le prix de vente (saisie libre, chiffres
  // seuls retenus, historique journalisé) — et le séquestre, texte libre comme l'adresse.
  function changerDepotGarantie(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = eurosDepuisSaisie(valeur);
    const normalise = Number.isFinite(nouveau) && nouveau > 0 ? nouveau : null;
    if (normalise === (d.depotGarantie || null)) { render(); return; }
    ajouterHistorique(d, `Dépôt de garantie modifié : ${d.depotGarantie ? formaterPrix(d.depotGarantie) : '—'} → ${normalise ? formaterPrix(normalise) : '—'}`);
    d.depotGarantie = normalise;
    sauvegarder(d);
    render();
  }

  function changerSequestreDepot(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = valeur.trim();
    if (nouveau === (d.sequestreDepot || '')) return;
    ajouterHistorique(d, `Séquestre du dépôt modifié : ${nouveau || '—'}`);
    d.sequestreDepot = nouveau;
    sauvegarder(d);
    render();
  }

  function changerDateAvantContrat(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const v = /^\d{4}-\d{2}-\d{2}$/.test(valeur || '') ? valeur : null;
    if (v === (d.dateAvantContrat || null)) return;
    ajouterHistorique(d, `Date de signature de l’avant-contrat : ${v ? formatDateFr(v) : '—'}`);
    d.dateAvantContrat = v;
    sauvegarder(d);
    render();
  }

  function changerPrixVente(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = eurosDepuisSaisie(valeur);
    const normalise = Number.isFinite(nouveau) && nouveau > 0 ? nouveau : null;
    if (normalise === (d.prixVente || null)) { render(); return; }
    ajouterHistorique(d, `Prix de vente modifié : ${d.prixVente ? formaterPrix(d.prixVente) : '—'} → ${normalise ? formaterPrix(normalise) : '—'}`);
    d.prixVente = normalise;
    sauvegarder(d);
    render();
  }

  // Mobilier des dossiers créés avant sa détection (ou dont l'import l'a manqué) : lu dans
  // l'avant-contrat du dossier relié au NAS, une fois par dossier (d.mobilierLuLe), à l'ouverture de
  // la fiche — et à la demande par le bouton « Lire » de la ligne « Dont mobilier ». Lecture légère
  // (lireTextePdfVerification, pas l'OCR de tout le document) : la clause du prix est dans le corps
  // de l'acte. Jamais par-dessus une valeur déjà saisie.
  var lecturesMobilierEnCours = new Set();

  async function lireMobilierDepuisAvantContrat(id, viaClic) {
    const d = dossiers.find(x => x.id === id);
    if (!d || lecturesMobilierEnCours.has(id)) return;
    if (!d.dossierLie || !d.nasDossier) {
      if (viaClic) afficherToast('Reliez d’abord le dossier du NAS : le mobilier est lu dans l’avant-contrat qui s’y trouve.', 'OK', null);
      return;
    }
    if (!window.pdfjsLib) {
      if (viaClic) afficherToast('Lecture des PDF indisponible sur ce poste.', 'OK', null);
      return;
    }
    lecturesMobilierEnCours.add(id);
    if (viaClic) render();
    let message = null;
    try {
      const trouve = choisirAvantContratNas(await listerFichiersNas(d), nomCompromisAttendu(d), contexteNomsAvantContrat(d, dossiers)).fichier;
      if (!trouve) {
        message = 'Avant-contrat introuvable dans le dossier du NAS : saisissez le mobilier à la main s’il y en a.';
      } else {
        const pdf = await ouvrirPdfNas(cheminNasComplet(d, trouve.chemin));
        const texte = await lireTextePdfVerification(pdf);
        const montant = detecterPrixMobilier(texte);
        const courant = dossiers.find(x => x.id === id);
        if (!courant) return;
        courant.mobilierLuLe = new Date().toISOString().slice(0, 10);
        if (courant.prixMobilier) {
          // Saisi entre-temps : on ne touche à rien.
        } else if (montant && (!courant.prixVente || montant < courant.prixVente)) {
          courant.prixMobilier = montant;
          ajouterHistorique(courant, `Mobilier compris dans le prix lu dans l’avant-contrat (${trouve.nom}) : ${formaterPrix(montant)}`);
          message = `Mobilier compris dans le prix trouvé dans l’avant-contrat : ${formaterPrix(montant)}.`;
        } else if (viaClic) {
          message = `Aucun mobilier ventilé dans le prix de l’avant-contrat (${trouve.nom}).`;
        }
        sauvegarder(courant);
      }
    } catch (e) {
      console.error('Lecture du mobilier dans l’avant-contrat impossible', e);
      message = viaClic ? 'Lecture de l’avant-contrat impossible (NAS injoignable ou PDF illisible).' : null;
    } finally {
      lecturesMobilierEnCours.delete(id);
      render();
    }
    if (message && (viaClic || /trouvé/.test(message))) afficherToast(message, 'OK', null);
  }

  // Part du prix qui porte sur du mobilier (voir detecterPrixMobilier). Refusée si elle n'est pas
  // inférieure au prix : ce serait forcément une faute de saisie.
  function changerPrixMobilier(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = eurosDepuisSaisie(valeur);
    const normalise = Number.isFinite(nouveau) && nouveau > 0 ? nouveau : null;
    if (normalise && d.prixVente && normalise >= d.prixVente) {
      afficherToast('Le mobilier doit être inférieur au prix de vente, qu’il comprend.', 'OK', null);
      render();
      return;
    }
    if (normalise === (d.prixMobilier || null)) { render(); return; }
    ajouterHistorique(d, `Mobilier compris dans le prix modifié : ${d.prixMobilier ? formaterPrix(d.prixMobilier) : '—'} → ${normalise ? formaterPrix(normalise) : '—'}`);
    d.prixMobilier = normalise;
    sauvegarder(d);
    render();
  }

  // Affecte un notaire à un côté depuis la fiche. Champ libre : l'étude peut corriger une lecture
  // fausse, ou saisir un notaire que l'acte ne nommait pas du tout.
  // Pure : notaires lus à la création qui ne sont ni notaire du vendeur ni notaire de l'acquéreur,
  // tant que l'un des deux champs est vide.
  // Les notaires lus dans l'acte d'un dossier, chacun remplacé par sa fiche de l'annuaire (étude 07/10 : « ne plus proposer le nom
  // du notaire lu dans l'acte ») ; un nom sans aucune correspondance n'est plus proposé. Dossiers créés avant compris.
  function notairesDetectesDossier(d) {
    const vus = new Set();
    return (Array.isArray(d && d.notairesDetectes) ? d.notairesDetectes : []).filter(n => n && n.nom)
      .map(n => Object.assign({}, n, { nom: notaireDepuisRepertoire(n.nom, carnetConfreres) }))
      .filter(n => n.nom && !vus.has(n.nom) && vus.add(n.nom));
  }

  // Les notaires lus dans l'acte, au libellé de l'annuaire, pour être gardés sur la fiche (création, complément).
  function notairesDetectesAnnuaire(liste) {
    return notairesDetectesDossier({ notairesDetectes: liste });
  }

  function notairesNonPlacesDossier(d) {
    if (!d || (d.notaireVendeur && d.notaireAcquereur)) return [];
    const cle = (x) => normaliserPourRecherche(String(x || '').replace(/\([^)]*\)/g, ' ')).replace(/^\s*(?:maitre|me)\s+/, '').replace(/[^a-z]+/g, ' ').trim();
    const places = [cle(d.notaireVendeur), cle(d.notaireAcquereur)].filter(Boolean);
    return notairesDetectesDossier(d).filter(n => !places.includes(cle(n.nom)));
  }

  function placerNotaireFiche(id, index, cote) {
    const d = dossiers.find(x => x.id === id);
    const n = d && notairesDetectesDossier(d)[index];
    if (!n) return;
    if (cote === 'vendeur' || cote === 'deux') affecterNotaire(id, 'vendeur', n.nom);
    if (cote === 'acquereur' || cote === 'deux') affecterNotaire(id, 'acquereur', n.nom);
  }

  // Pure : le libellé désigne-t-il un seul notaire du répertoire (notre office compris) ? Annuaire pas encore chargé : oui
  // (rien où vérifier, comme notaireDepuisRepertoire).
  function notaireDuRepertoire(libelle, carnet) {
    const v = String(libelle || '').trim();
    if (!v) return false;
    if (v === NOTAIRE_ETUDE_LIBELLE || canoniserNotaireEtude(v) === NOTAIRE_ETUDE_LIBELLE) return true;
    if (!Array.isArray(carnet) || !carnet.length) return true;
    return !!trouverOfficeConfrere(v, carnet);
  }

  function affecterNotaire(id, cote, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const champ = cote === 'vendeur' ? 'notaireVendeur' : 'notaireAcquereur';
    // Retrouvé dans l'annuaire et complété (nom, prénom, ville) ; notre office toujours écrit « Maître Sophie GOSSART (BLOIS) ».
    const saisi = String(valeur || '').trim();
    if (saisi === (d[champ] || '')) { render(); return; }   // champ quitté sans changement (ancienne valeur gardée)
    const nouveau = completerNomNotaire(saisi, carnetConfreres);
    // Seul un notaire du répertoire est accepté (étude 07/10 : « ne proposer que des notaires du répertoire ») : un nom tapé
    // qui n'y désigne personne, ou plusieurs notaires, laisse la fiche telle quelle.
    if (saisi && !notaireDuRepertoire(nouveau, carnetConfreres)) {
      afficherToast(`« ${saisi} » ne désigne pas un seul notaire du répertoire : choisissez-le dans la liste.`, 'OK', null);
      render();
      return;
    }
    if (nouveau === (d[champ] || '')) { render(); return; }
    d[champ] = nouveau;
    ajouterHistorique(d, `${cote === 'vendeur' ? 'Notaire du vendeur' : 'Notaire de l’acquéreur'} : ${nouveau || '—'}`);
    // Le rédacteur repéré à l'import n'avait pas de côté tant qu'aucun des deux champs ne portait
    // son nom (acte qui nomme ses notaires sans dire qui représente qui) : dès que l'étude l'y
    // affecte, le badge « Reçoit l'acte » peut se poser — mais jamais par-dessus un côté déjà
    // choisi à la main.
    if (!d.coteInstrumentaire && nouveau
      && notairesDetectesDossier(d).some(n => n.role === 'instrumentaire' && n.nom === nouveau)) {
      d.coteInstrumentaire = cote;
    }
    deduireRoleNotaireDossier(d);
    sauvegarder(d);
    render();
  }

  // Email de l'office du notaire de l'acquéreur, saisi/corrigé sur la fiche (voir
  // renderProprietesDossier) — n'apparaît que quand notaireParticipantRepresenteAcquereur(d) est vrai
  // (un office distinct du nôtre représente l'acquéreur) : la déontologie interdit alors à
  // l'instrumentaire de contacter directement l'acquéreur, les relances passent par ce champ.
  function changerEmailConfrereVendeur(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = String(valeur || '').trim();
    if (nouveau === (d.emailConfrereVendeur || '')) return;
    d.emailConfrereVendeur = nouveau;
    ajouterHistorique(d, `Email du notaire du vendeur : ${nouveau || '—'}`);
    completerEmailCarnet(d.notaireVendeur, nouveau);
    sauvegarder(d);
    render();
  }

  // Téléphone du confrère de ce côté de la fiche (étude 05/10 : « le notaire est connu mais son numéro n'est pas noté ») : celui
  // saisi sur le dossier, sinon celui de l'office dans l'annuaire. Un numéro saisi complète l'office de l'annuaire qui n'en avait
  // pas, comme l'email. Pure : { saisi, annuaire, effectif }.
  function telephoneConfrereDossier(d, cote) {
    const saisi = String((cote === 'vendeur' ? d.telephoneConfrereVendeur : d.telephoneNotaireParticipant) || '').trim();
    const t = officeConfrereDossier(d, cote);
    const annuaire = (t && t.office.telephone) || '';
    return { saisi, annuaire, effectif: saisi || annuaire };
  }

  function changerTelephoneConfrere(id, cote, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const champ = cote === 'vendeur' ? 'telephoneConfrereVendeur' : 'telephoneNotaireParticipant';
    const nouveau = String(valeur || '').trim().slice(0, 120);
    if (nouveau === (d[champ] || '')) return;
    d[champ] = nouveau;
    ajouterHistorique(d, `Téléphone du notaire ${cote === 'vendeur' ? 'du vendeur' : 'de l’acquéreur'} : ${nouveau || '—'}`);
    const t = officeConfrereDossier(d, cote);
    if (nouveau && t && !t.office.telephone && numeroAppelable(nouveau)) enregistrerOfficeCarnet(Object.assign({}, t.office, { telephone: nouveau })).catch(() => {});
    sauvegarder(d);
    render();
  }

  function changerEmailNotaireParticipant(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = String(valeur || '').trim();
    if (nouveau === (d.emailNotaireParticipant || '')) return;
    d.emailNotaireParticipant = nouveau;
    ajouterHistorique(d, `Email du notaire de l’acquéreur : ${nouveau || '—'}`);
    completerEmailCarnet(d.notaireAcquereur, nouveau);
    sauvegarder(d);
    render();
  }

  // Bascule le côté qui reçoit l'acte depuis le badge de la ligne concernée (il n'y a plus de
  // sélecteur « Acte reçu par » : c'est le badge lui-même qui porte l'action, voir
  // renderProprietesDossier). Recliquer sur le côté déjà désigné le retire.
  function basculerCoteInstrumentaire(id, cote) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = d.coteInstrumentaire === cote ? null : cote;
    const libelles = { vendeur: 'notaire du vendeur', acquereur: 'notaire de l’acquéreur' };
    ajouterHistorique(d, `Notaire qui reçoit l’acte : ${libelles[nouveau] || 'à déterminer'}`);
    d.coteInstrumentaire = nouveau;
    deduireRoleNotaireDossier(d);
    sauvegarder(d);
    render();
  }

  // Repli utilisé UNIQUEMENT quand le rôle ne peut pas être déduit (notre étude n'est reconnue
  // dans aucun des deux champs, ou personne ne reçoit encore l'acte) : sans lui, un dossier en
  // participation deviendrait impossible à marquer comme tel, les deux sélecteurs ayant disparu.
  function basculerRoleEtude(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    d.roleNotaire = d.roleNotaire === 'participant' ? 'instrumentaire' : 'participant';
    ajouterHistorique(d, `Rôle de l’étude : ${d.roleNotaire}`);
    sauvegarder(d);
    render();
  }

  function calculerProchaineEcheance(d) {
    const autresDates = (d.autres || []).map(a => a.date);
    // Une fois l'offre de prêt reçue, cette échéance est résolue : elle ne doit plus faire
    // considérer le dossier comme "urgent" ni ressortir en tête de tri à sa place (voir aussi
    // prochaineEcheanceDetail, même exclusion pour l'affichage).
    const datePret = echeanceValidee(d, 'pret') ? null : d.pret;
    const dates = [
      datePret,
      echeanceValidee(d, 'appelFonds') ? null : d.appelFonds,
      echeanceValidee(d, 'projetEnvoye') ? null : d.projetEnvoye,
      echeanceValidee(d, 'acte') ? null : d.acte,
      echeanceValidee(d, 'rendezVousSignature') ? null : d.rendezVousSignature,
      echeanceValidee(d, 'ventebien') ? null : d.ventebien,
      ...autresDates
    ].filter(Boolean).map(joursRestants);
    const upcoming = dates.filter(j => j >= 0);
    return upcoming.length ? Math.min(...upcoming) : (dates.length ? Math.min(...dates) : 999999);
  }

  function archiverDossier(id, archive) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    d.archive = archive;
    ajouterHistorique(d, archive ? 'Dossier archivé' : 'Dossier désarchivé');
    sauvegarder(d);
    render();
    // Archivé : ses dates quittent l'agenda. Désarchivé : geste de l'étude, elles y reviennent.
    synchroniserEcheanceAgenda(d, 'pret', !archive);
    synchroniserEcheanceAgenda(d, 'ventebien', !archive);
  }

  // Évolution du nombre de dossiers actifs dans le temps, demandée par l'étude pour le Tableau de
  // bord ("comparer avec le mois précédent... suivi par rapport au mois précédent et à l'année
  // précédente"). Calculée RÉTROACTIVEMENT à partir de l'historique déjà stocké sur chaque dossier
  // (l'entrée "Dossier créé" ajoutée par ajouterDossier(), "Dossier archivé"/"Dossier désarchivé"
  // ajoutées par archiverDossier()) plutôt que via un nouveau mécanisme de relevé périodique à
  // mettre en place : ce dernier n'aurait donné aucune profondeur historique avant plusieurs mois
  // d'usage, alors que l'historique existant permet une réponse immédiate. Un dossier supprimé
  // (plutôt qu'archivé) n'a plus aucune trace, comme partout ailleurs dans l'outil — une suppression
  // reste définitive, y compris pour ce calcul rétroactif.
  function etaitDossierActifA(d, dateRef) {
    const historique = (d.historique || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const creation = historique.find(h => h.texte === 'Dossier créé');
    // Dossier pas encore créé à la date de référence : n'existait pas, donc pas "actif".
    if (creation && new Date(creation.date) > dateRef) return false;
    let archive = false;
    for (const h of historique) {
      if (new Date(h.date) > dateRef) break;
      // « Dossier archivé automatiquement (…) » compte aussi (archivage au questionnaire ou à J+30) — il était oublié.
      if (typeof h.texte === 'string' && h.texte.indexOf('Dossier archivé') === 0) archive = true;
      else if (h.texte === 'Dossier désarchivé') archive = false;
    }
    return !archive;
  }

  function compterDossiersActifsA(listeDossiers, dateRef) {
    return listeDossiers.filter(d => etaitDossierActifA(d, dateRef)).length;
  }

  // `maintenant` (optionnel, par défaut la date du jour) permet de fixer une référence stable dans
  // les tests plutôt que de dépendre de `new Date()` au moment de l'exécution.
  function calculerEvolutionPortefeuille(listeDossiers, maintenant) {
    const ref = maintenant || new Date();
    const actuel = listeDossiers.filter(d => !d.archive).length;
    const ilYAUnMois = new Date(ref);
    ilYAUnMois.setMonth(ilYAUnMois.getMonth() - 1);
    const ilYAUnAn = new Date(ref);
    ilYAUnAn.setFullYear(ilYAUnAn.getFullYear() - 1);
    const moisDernier = compterDossiersActifsA(listeDossiers, ilYAUnMois);
    const anDernier = compterDossiersActifsA(listeDossiers, ilYAUnAn);
    return { actuel, moisDernier, ecartMois: actuel - moisDernier, anDernier, ecartAn: actuel - anDernier };
  }

  // Petite flèche + chiffre signé pour un écart, réutilisée pour les deux comparaisons (mois/an) —
  // un seul rendu pour ne pas décrire deux fois la même logique. Volontairement pas de couleur
  // "succès"/"alerte" sur la hausse/la baisse : un nombre de dossiers actifs qui augmente n'est pas
  // en soi une bonne ou une mauvaise nouvelle pour l'étude (plus de dossiers = plus de charge), donc
  // aucun jugement de valeur n'est encodé dans la couleur — même principe que partout ailleurs dans
  // l'outil ("aucune couleur inventée pour l'occasion").
  function formaterTendance(ecart) {
    if (ecart > 0) return { icone: icone('trend-up', 'kpi-tendance-icone'), texte: `+${ecart}` };
    if (ecart < 0) return { icone: icone('trend-down', 'kpi-tendance-icone'), texte: `${ecart}` };
    return { icone: '', texte: '=' };
  }

  // Chiffres de synthèse du portefeuille (dossiers actifs, hors filtres/recherche de la liste) —
  // calculés une seule fois, partagés par l'accueil du tableau de bord (renderAccueilDashboard) et
  // ses cartes, pour ne jamais faire diverger deux lectures d'un même portefeuille.
  function calculerStatsPortefeuille(dossiersActifs) {
    const dansNJours = (n) => dossiersActifs.filter(d => {
      const prochaine = prochaineEcheanceDetail(d);
      return prochaine && prochaine.jours <= n;
    }).length;
    const urgents = dansNJours(7);
    const urgents15 = dansNJours(15);
    const avecPret = dossiersActifs.filter(d => !d.sansPret);
    const manquantes = avecPret.filter(d => d.offrePretStatut === 'manquante').length;
    // "À vérifier" regroupe tout ce qui n'est tranché ni dans un sens ni dans l'autre : jamais
    // cherchée ("inconnu") comme trouvée sans confirmation ("aconfirmer", voir statutOffreAffichage).
    const aVerifier = avecPret.filter(d => {
      const s = d.offrePretStatut || 'inconnu';
      return s !== 'recue' && s !== 'manquante';
    }).length;
    // Même condition que statutDossier() : uniquement une fois relié, hors rôle participant.
    const piecesIncompletes = dossiersActifs.filter(d => d.dossierLie && d.roleNotaire !== 'participant' &&
      checklistPieces(d.typeVente, d).some(p => (d.pieces || {})[p.cle] !== 'recue')).length;
    return { actifs: dossiersActifs.length, urgents, urgents15, manquantes, aVerifier, piecesIncompletes };
  }

  // ---- Carte « Portefeuille » du tableau de bord ----
  // Demandé par l'étude : rendre la carte des dossiers actifs « attractive, visuelle et ludique »,
  // avec les statistiques qui comptent. Toutes les valeurs viennent de fonctions déjà en place
  // (etatDossier, avancementDossier, offrePretStatut) : aucune nouvelle règle métier. Pure et
  // testable (tests/portefeuille.test.js) — la date du jour est passée en paramètre.
  //  - répartition des dossiers actifs par état (anneau) : les mêmes états que le badge ;
  //  - signatures du mois : rendez-vous de signature tombant dans le mois en cours, dont ceux déjà
  //    passés (dossiers archivés compris : un dossier signé est souvent archivé ensuite) ;
  //  - offres de prêt reçues sur les dossiers financés ;
  //  - avancement moyen (même pourcentage que la liste « Avancement des dossiers »).
  function statsPortefeuilleVisuel(dossiersActifs, dossiersTous, aujourdhuiIso) {
    const actifs = (dossiersActifs || []).filter(d => !d.archive);
    // Répartition : par état du dossier (le badge vu partout).
    const parEtat = {};
    ETATS_DOSSIER.forEach(g => { parEtat[g.cle] = 0; });
    actifs.forEach(d => { const c = etatDossier(d, aujourdhuiIso).cle; if (c in parEtat) parEtat[c]++; });
    const mois = String(aujourdhuiIso || '').slice(0, 7);
    const duMois = (dossiersTous || actifs).filter(d => d.rendezVousSignature && String(d.rendezVousSignature).slice(0, 7) === mois);
    const signaturesMois = { total: duMois.length, faites: duMois.filter(d => !!dateSignatureDossier(d, aujourdhuiIso)).length };
    const finances = actifs.filter(d => !d.sansPret);
    const offres = { total: finances.length, recues: finances.filter(d => d.offrePretStatut === 'recue').length };
    const avancementMoyen = actifs.length
      ? Math.round(actifs.reduce((t, d) => t + avancementDossier(d, aujourdhuiIso).pct, 0) / actifs.length)
      : 0;
    return { actifs: actifs.length, parEtat, signaturesMois, offres, avancementMoyen };
  }

  // Pure : une phrase courte qui dit ce que la carte montre, sur le ton d'un collègue — jamais un
  // reproche. La première règle qui s'applique l'emporte.
  function phrasePortefeuille(st) {
    if (!st.actifs) return 'Aucun dossier en cours.';
    const e = st.parEtat || {};
    const pl = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    if (e.urgent) return `${pl(e.urgent, 'dossier')} avec une date butoir dépassée.`;
    if (e.pret === st.actifs) return 'Tous les dossiers sont prêts à signer.';
    if (st.signaturesMois.total && st.signaturesMois.faites === st.signaturesMois.total) return 'Toutes les signatures du mois sont faites.';
    if (e.attente) return `${pl(e.attente, 'dossier')} en attente de pièces.`;
    const restantes = st.signaturesMois.total - st.signaturesMois.faites;
    if (restantes) return `Encore ${restantes} signature${restantes > 1 ? 's' : ''} d'ici la fin du mois.`;
    if (e.complet) return `${pl(e.complet, 'dossier')} complet${e.complet > 1 ? 's' : ''} : rendez-vous à placer.`;
    if (e.arelier) return `${pl(e.arelier, 'dossier')} à relier au NAS.`;
    return 'Rien de bloquant.';
  }

  // L'animation d'entrée (anneau qui se dessine, barres qui se remplissent) ne joue qu'au premier
  // affichage : render() reconstruit le tableau de bord à chaque action et à chaque sondage, la
  // rejouer ferait clignoter la carte toutes les 7 secondes.
  let portefeuilleDejaAnime = false;

  function anneauPortefeuille(st) {
    const total = st.actifs;
    let debut = 0;
    const presents = ETATS_DOSSIER.map(g => g.cle).filter(k => st.parEtat[k]);
    // Un petit blanc entre deux segments pour qu'ils se lisent séparément ; aucun s'il n'y en a qu'un.
    const ecart = presents.length > 1 ? 1.2 : 0;
    const segments = total ? presents.map(k => {
      const part = 100 * st.parEtat[k] / total;
      const long = Math.max(0.6, part - ecart);
      const seg = `<circle class="pf-seg pf-${k}" cx="21" cy="21" r="15.9155" style="--l:${long.toFixed(2)};stroke-dashoffset:${(25 - debut).toFixed(2)}"></circle>`;
      debut += part;
      return seg;
    }).join('') : '';
    return `<svg class="pf-anneau" viewBox="0 0 42 42" role="img" aria-label="${escapeAttr(ETATS_DOSSIER.map(g => `${g.texte} : ${st.parEtat[g.cle]}`).join(', '))}">
      <circle class="pf-fond" cx="21" cy="21" r="15.9155"></circle>${segments}
    </svg>`;
  }

  function barrePortefeuille(libelle, valeur, total, detail, ton) {
    const pct = total ? Math.round(100 * valeur / total) : 0;
    return `<div class="pf-mesure">
      <div class="pf-mesure-tete"><span>${libelle}</span><b>${detail}</b></div>
      <div class="pf-barre" role="img" aria-label="${escapeAttr(libelle + ' : ' + detail)}"><span class="pf-barre-remplie ${ton}" style="--p:${pct}%"></span></div>
    </div>`;
  }

  // Cartes « Dossiers ouverts » et « Activité de l'étude », selon la présentation de chaque widget (presentationWidget).
  // Dossiers ouverts :
  //  - petit : l'anneau des états et les états présents ;
  //  - moyen : l'anneau et sa légende, les trois mesures (signatures du mois, offres, avancement) ;
  //  - grand : la même chose et les dossiers à regarder (urgents, à relier, en attente de pièces).
  function renderKpisDashboard(dossiersActifs, dossiersTousPerimetre) {
    const bloc = document.getElementById('kpi-portefeuille');
    const blocActivite = document.getElementById('kpi-activite');
    if (!bloc) return;
    const presentation = presentationWidget('portefeuille');
    const aujourdhui = isoAujourdhuiLocal();
    const st = statsPortefeuilleVisuel(dossiersActifs, dossiersTousPerimetre, aujourdhui);
    // Tendance du nombre de dossiers actifs vs le mois précédent (calculerEvolutionPortefeuille),
    // sur TOUS les dossiers du périmètre : un dossier archivé aujourd'hui a pu être actif il y a
    // un mois. La comparaison à l'année reste calculée mais n'est pas affichée (demande de l'étude).
    const evolution = calculerEvolutionPortefeuille(dossiersTousPerimetre || dossiers);
    const tMois = formaterTendance(evolution.ecartMois);
    const anime = !portefeuilleDejaAnime && st.actifs > 0;
    if (st.actifs > 0) portefeuilleDejaAnime = true;
    const etats = presentation === 'petit' ? ETATS_DOSSIER.filter(g => st.parEtat[g.cle]) : ETATS_DOSSIER;
    const legende = etats.map(g => `
      <li class="pf-legende-ligne${st.parEtat[g.cle] ? '' : ' vide'}"><span class="pf-point pf-${g.cle}"></span><span>${g.texte}</span><b>${st.parEtat[g.cle]}</b></li>`).join('');
    const sig = st.signaturesMois;
    const moisNom = new Date(aujourdhui + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long' });
    const haut = `<div class="pf-haut">
        <div class="pf-anneau-bloc">${anneauPortefeuille(st)}<div class="pf-centre"><span class="pf-centre-num">${st.actifs}</span><span class="pf-centre-lib">actif${st.actifs > 1 ? 's' : ''}</span></div></div>
        <ul class="pf-legende" data-ajuster="1">${legende}</ul>
      </div>`;
    const barres = barrePortefeuille(`Signatures de ${moisNom}`, sig.faites, sig.total, sig.total ? `${sig.faites} / ${sig.total}` : 'aucune', 'focus')
      + barrePortefeuille('Offres de prêt reçues', st.offres.recues, st.offres.total, st.offres.total ? `${st.offres.recues} / ${st.offres.total}` : 'sans prêt', 'pret')
      + barrePortefeuille('Avancement moyen', st.avancementMoyen, 100, `${st.avancementMoyen} %`, 'success');
    const mesures = `<div class="pf-mesures">${barres}</div>`;
    let corps;
    // En petit, les mesures remplissent la place laissée sous l'anneau (autant qu'il en tient).
    if (presentation === 'petit') corps = `${haut}<div class="pf-mesures" data-ajuster="2">${barres}</div>`;
    else {
      const aRegarder = presentation === 'grand'
        ? (dossiersActifs || []).filter(d => !d.archive).map(d => ({ d, e: etatDossier(d, aujourdhui) }))
          .filter(x => x.e.cle === 'urgent' || x.e.cle === 'arelier' || x.e.cle === 'attente')
          .sort((x, y) => ORDRE_ETAT_DOSSIER.indexOf(x.e.cle) - ORDRE_ETAT_DOSSIER.indexOf(y.e.cle))
        : [];
      corps = `<div class="pf-duo">${haut}${mesures}</div>
        <div class="pf-phrase w-fixe">${escapeHtml(phrasePortefeuille(st))}</div>
        ${aRegarder.length ? `<div class="w-section">
          <h3 class="jour-carte-sous-titre">À regarder</h3>
          <ul class="w-lignes" data-ajuster="2">${aRegarder.map(x => `<li><button type="button" class="w-ligne" onclick="ouvrirDossierDepuisDashboard('${x.d.id}')" title="${escapeAttr(x.e.detail)}">
            <span class="dot-label ${x.e.dl}"><span class="dot"></span>${escapeHtml(x.e.texte)}</span>
            <span class="w-ligne-texte">${escapeHtml(libelleDossierAffiche(x.d))}</span>
            <span class="w-ligne-meta">${escapeHtml(x.e.detail)}</span></button></li>`).join('')}${plusWidget("definirOnglet('suivi')")}</ul>
        </div>` : ''}`;
    }
    bloc.innerHTML = carteWidget({
      presentation, classe: `portefeuille${anime ? ' anime' : ''}`,
      titre: 'Dossiers ouverts',
      sous: `<span class="kpi-tendance pf-tendance" title="${evolution.actuel} aujourd'hui contre ${evolution.moisDernier} il y a un mois">${tMois.icone}${tMois.texte} vs mois dernier</span>`,
      corps
    });
    // Toujours affichée (étude, 29/09 au soir : « je ne vois pas le widget du direct ») : sans action
    // récente, elle montre la semaine vide et ce qui s'y affichera.
    if (blocActivite) {
      blocActivite.innerHTML = renderActiviteEtude(dossiers, presentationWidget('activite'));
      blocActivite.style.display = '';
    }
    planifierAjustementWidgets();
  }

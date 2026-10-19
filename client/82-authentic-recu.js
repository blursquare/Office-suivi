  // Ce qu'Authentic a donné à un dossier, gardé sur le serveur (étude 16/10 : « la connexion entre Authentic et CLAIRE est bancale, il manque
  // souvent des données » ; choix : « pages gardées par dossier sur le serveur et Relire depuis Authentic », puis « encadré Reçu d'Authentic
  // sur la fiche »). Le serveur garde la dernière version de chaque page rangée dans un dossier (server/src/pagesAuthentic.js) ; la fiche
  // montre ce qui a été reçu et quand, ce qui manque, et peut tout relire avec les règles du jour sans retourner dans Authentic.

  const recuAuthenticParDossier = new Map(); // dossierId → { t, pages, enCours }
  const relecturesAuthenticEnCours = new Set();

  // Pure : la clé d'une page dans son dossier, donnée au serveur avec le résultat (une page revue remplace la précédente) — la page du
  // dossier une fois, une fiche client par personne (prénom et nom), une fiche bien par adresse, sinon par parcelles.
  function clePageReleveAuthentic(capture) {
    try { return clePageReleveAuthenticBrute(capture); } catch (_) { return ''; } // le résultat part quand même (clé tirée par le serveur)
  }
  function clePageReleveAuthenticBrute(capture) {
    const net = t => normaliserPourRecherche(String(t || '')).replace(/[^a-z0-9]+/g, ' ').trim();
    const type = typePageAuthentic(capture);
    if (type === 'client') {
      const p = clientDepuisFicheAuthentic(capture);
      const ident = p ? net([p.prenom, p.nom].filter(Boolean).join(' ')) : '';
      return ident ? 'client:' + ident.slice(0, 180) : '';
    }
    if (type === 'bien') {
      const b = bienDepuisFicheAuthentic(capture);
      const adresse = b && b.adresse ? net(b.adresse.texte || '') : '';
      const parcelles = b ? (b.parcelles || []).map(p => net(`${p.section} ${p.numero}`)).join(' ') : '';
      return (adresse || parcelles) ? 'bien:' + (adresse || parcelles).slice(0, 180) : '';
    }
    // Promesse, avenant… : jamais gardée (relecture du 17/10 — elle remplaçait la page de la VENTE gardée sous la même clé, que le serveur
    // lui donne aussi quand le poste ne la reconnaît pas).
    const sous = sousDossierLuAuthentic(capture);
    if (sous && sous !== 'vente' && sous !== 'succession') return 'ignorer';
    return type === 'dossier' || type === 'gestion' ? 'dossier' : '';
  }

  // Le sous-dossier de la page, une succession comprise même quand son intitulé ne le dit pas (« 1 - Mme X veuve de M. Y » avec ses comparants
  // Défunt / Héritier : relecture du 17/10).
  function sousDossierLuAuthentic(capture) {
    const sous = sousDossierAuthentic(capture);
    if (sous === 'autre' && pageSuccessionAuthentic(capture, intituleDossierAuthentic(capture))) return 'succession';
    return sous;
  }

  // ---------- Relire depuis Authentic ----------

  // Rejoue sur le dossier toutes les pages gardées pour lui, de la plus ancienne à la plus récente, avec les règles du jour (mêmes lecteurs
  // qu'une page qui arrive : Authentic d'abord, une valeur déjà reprise qui a changé est PROPOSÉE, jamais écrite d'office).
  async function relireDepuisAuthentic(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d || relecturesAuthenticEnCours.has(id)) return;
    relecturesAuthenticEnCours.add(id);
    majRecuAuthenticFiche(id);
    let pages = [];
    try {
      const r = await fetchAvecAuth(`/api/authentic/dossier/${encodeURIComponent(id)}/pages?contenu=1`);
      if (r.ok) pages = ((await r.json()).pages || []);
      else throw new Error('réponse ' + r.status);
    } catch (e) {
      relecturesAuthenticEnCours.delete(id);
      majRecuAuthenticFiche(id);
      afficherToast('Relire depuis Authentic : serveur injoignable.', 'OK', null);
      return;
    }
    const textes = [];
    let modifie = false;
    try {
      for (const page of pages) {
        if (!pageRelisibleAuthentic(d, page.capture)) continue;
        const partage = partagerFicheConjointAuthentic(page.capture);
        const r = appliquerReleveSurDossier(d, partage ? partage.principale : page.capture, undefined, dossiers);
        if (r.modifie) modifie = true;
        textes.push(...(r.textes || []));
        if (partage && conjointPartieDuDossierAuthentic(d, clientDepuisFicheAuthentic(partage.conjoint))) {
          const rc = appliquerReleveSurDossier(d, partage.conjoint, undefined, dossiers);
          if (rc.modifie) modifie = true;
          textes.push(...(rc.textes || []));
        }
      }
      if (modifie) {
        d.historique = d.historique || [];
        d.historique.push({ date: new Date().toISOString(), texte: `Relu depuis Authentic (${pages.length} page${pages.length > 1 ? 's' : ''})` });
        await sauvegarder(d);
        render();
      }
      completerDossierDepuisRelevesRecents(d);
      afficherToast(!pages.length ? 'Aucune page d’Authentic gardée pour ce dossier : ouvrez-le dans Authentic.'
        : modifie ? `Relu depuis Authentic : ${textes[0] || 'fiche mise à jour'}${textes.length > 1 ? ` (+${textes.length - 1})` : ''}.`
          : `Relu depuis Authentic (${pages.length} page${pages.length > 1 ? 's' : ''}) : rien de neuf.`, 'OK', null);
    } catch (e) {
      noterJournalTechnique({ categorie: 'erreur-poste', message: 'Relire depuis Authentic : ' + String((e && e.message) || e).slice(0, 120) });
      afficherToast('Relire depuis Authentic : une page n’a pas pu être relue.', 'OK', null);
    } finally {
      relecturesAuthenticEnCours.delete(id);
      recuAuthenticParDossier.delete(id);
      majRecuAuthenticFiche(id);
    }
  }

  // À la création d'un dossier depuis Authentic (étude 19/10 : « pourquoi les données — date de décès, commune, héritiers, biens — ne sont
  // pas déjà toutes remplies, je suis obligé de repasser une seconde fois ») : les pages déjà relevées pour ce dossier d'Authentic sont
  // rejouées une à une, avec les mêmes lecteurs qu'une page qui arrive — fiches client entières, défunt, situation, biens, lots, SAFER —, et
  // gardées pour lui sur le serveur (« Reçu d'Authentic »). Une page qui ne le désigne pas (pageRelisibleAuthentic) est passée.
  async function rejouerPagesCreationAuthentic(d, releves) {
    if (!d || !Array.isArray(releves) || !releves.length) return 0;
    let modifie = false;
    const resultats = [];
    for (const rel of pagesARejouerCreationAuthentic(d, releves)) {
      try {
        const partage = partagerFicheConjointAuthentic(rel.capture);
        const r = appliquerReleveSurDossier(d, partage ? partage.principale : rel.capture, undefined, dossiers);
        if (r.modifie) modifie = true;
        if (partage && conjointPartieDuDossierAuthentic(d, clientDepuisFicheAuthentic(partage.conjoint)) && appliquerReleveSurDossier(d, partage.conjoint, undefined, dossiers).modifie) modifie = true;
        if (rel.id) resultats.push({ id: rel.id, etat: 'applique', dossierId: d.id, texte: 'reprise à la création du dossier', cle: clePageReleveAuthentic(rel.capture) });
      } catch (e) {
        noterJournalTechnique({ categorie: 'erreur-poste', message: 'Création depuis Authentic : une page non rejouée — ' + String((e && e.message) || e).slice(0, 120) });
      }
    }
    if (modifie) await sauvegarder(d);
    if (resultats.length) rapporterResultatsAuthentic(resultats);
    return resultats.length;
  }

  // Pure : les pages à rejouer sur un dossier qui vient d'être créé (relecture 19/10) — la DERNIÈRE version de chaque page seulement (une
  // ancienne version rejouée après la récente faisait proposer « Authentic a changé » vers l'ancienne valeur) ; une fiche client seulement
  // si sa personne est partie du dossier tel qu'il a été créé (une correction faite dans « Vérifier » — prénom, email — n'est jamais défaite,
  // et une fiche d'une personne étrangère au dossier n'y entre pas) ; pour une succession, la règle des successions (défunt, héritiers,
  // conjoint survivant).
  function pagesARejouerCreationAuthentic(d, releves) {
    const dernieres = new Map();
    (releves || []).forEach((rel, i) => {
      if (!rel || !rel.capture || !pageRelisibleAuthentic(d, rel.capture)) return;
      const cle = clePageReleveAuthentic(rel.capture) || ('page-' + i);
      if (cle === 'ignorer') return;
      dernieres.set(cle, rel);
    });
    const mots = (x) => normaliserPourRecherche(String(x || '')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    return [...dernieres.values()].filter(rel => {
      if (typePageAuthentic(rel.capture) !== 'client') return true;
      const partage = partagerFicheConjointAuthentic(rel.capture);
      const p = clientDepuisFicheAuthentic(partage ? partage.principale : rel.capture);
      if (!p) return false;
      if (estSuccession(d)) return !!partieSuccessionDeLaFiche(d, p);
      const nom = mots(p.nom), prenom = mots(p.prenom)[0] || '';
      return (d.parties || []).some(x => {
        const m = mots([x && x.prenom, x && x.nom, x && x.nomUsage].filter(Boolean).join(' '));
        return nom.length && nom.every(w => m.includes(w)) && (!prenom || m.includes(prenom));
      });
    }).sort((a, b) => String(a.recueLe || '').localeCompare(String(b.recueLe || '')));
  }

  // Pure : une page gardée se relit-elle sur ce dossier ? Les mêmes garde-fous qu'à l'arrivée d'une page (appliquerReleveAuthentic) :
  // jamais la page d'un sous-dossier autre que la vente (promesse, avenant — son « Signé le » et ses pièces ne sont pas ceux de la
  // vente), jamais celle d'un ancien dossier des mêmes clients (acte signé avant ce dossier) sauf intitulé ou référence rattachés.
  function pageRelisibleAuthentic(d, capture) {
    if (!d || !capture) return false;
    const type = typePageAuthentic(capture);
    if (type === 'client' || type === 'bien') return true;
    const sous = sousDossierLuAuthentic(capture);
    if (sous && sous !== 'vente' && sous !== 'succession') return false;
    const lu = intituleDossierAuthentic(capture);
    const reference = referenceDossierAuthentic(capture);
    const rattache = (reference && d.referenceAuthentic === reference) || (lu && (d.intitulesAuthentic || []).includes(cleIntituleAuthentic(lu)));
    if (rattache) return true;
    if (ancienDossierAuthentic(capture, d)) return false;
    // La page doit désigner CE dossier (relecture du 17/10 : une page d'un autre dossier rangée par erreur revenait à la relecture).
    if (autreReferenceAuthentic(d, referenceAuthenticValide(reference) ? reference : '')) return false;
    if (!lu && !referenceAuthenticValide(reference)) return true;
    return dossierPourIntituleAuthentic(lu, dossiers, adresseBienPageAuthentic(capture), reference) === d;
  }

  // ---------- Encadré « Reçu d'Authentic » ----------

  function renderRecuAuthenticFiche(d) {
    if (!d || !d.id) return '';
    const e = recuAuthenticParDossier.get(d.id);
    if (!e || (!e.enCours && Date.now() - e.t > 60000)) chargerRecuAuthentic(d.id);
    return `<div class="recu-authentic" data-recu-authentic="${escapeAttr(d.id)}">${htmlRecuAuthentic(d, e)}</div>`;
  }

  function htmlRecuAuthentic(d, e) {
    const pages = e && e.pages ? e.pages : null;
    const relecture = relecturesAuthenticEnCours.has(d.id);
    const bouton = `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" ${relecture || !pages || !pages.length ? 'disabled ' : ''}onclick="relireDepuisAuthentic('${escapeOnclickArg(d.id)}')" title="Relire toutes les pages d’Authentic gardées pour ce dossier avec les règles du jour">${relecture ? icone('spinner', null, true) + ' Relecture…' : icone('rotate-ccw') + ' Relire depuis Authentic'}</wa-button>`;
    if (!pages) return `<span class="hint">…</span>`;
    // Une pastille par page attendue (étude 19/10 : « voir toutes les données qu'il manque ») : reçue (date au survol), ou à ouvrir.
    const attendues = pagesAttenduesAuthentic(d, pages);
    const recues = attendues.filter(p => p.recue).length;
    const part = Math.round(100 * recues / attendues.length);
    const derniere = pages.reduce((m, p) => (String(p.recueLe || '') > m ? String(p.recueLe) : m), '');
    const pastilles = attendues.map(p => `<li class="pa-page ${p.recue ? 'recue' : 'manque'}"${p.le ? ` title="Reçue le ${escapeAttr(formatDateHeureCourte(p.le))}"` : ''}>${icone(p.recue ? 'check' : 'alert-triangle')}<span>${escapeHtml(p.libelle)}</span></li>`).join('');
    return `<div class="pa-progres${recues === attendues.length ? ' complet' : ''}">
        <span class="pa-barre" style="--pa-part: ${part}%"><span></span></span>
        <span class="pa-progres-texte"><b>${recues}/${attendues.length}</b> pages reçues${derniere ? ` · dernière le ${escapeHtml(formatDateHeureCourte(derniere))}` : ''}</span>
      </div>
      <ul class="pa-pages">${pastilles}</ul>
      ${recues < attendues.length ? `<p class="pa-aide">${icone('info')}Ouvrez dans Authentic les pages en orange : elles arrivent seules.</p>` : ''}
      <div class="recu-actions">${bouton}</div>`;
  }

  // Pure : « 17/10 à 09:42 ».
  function formatDateHeureCourte(iso) {
    const t = new Date(iso);
    if (isNaN(t)) return '';
    const deux = n => String(n).padStart(2, '0');
    return `${deux(t.getDate())}/${deux(t.getMonth() + 1)} à ${deux(t.getHours())}:${deux(t.getMinutes())}`;
  }

  async function chargerRecuAuthentic(id) {
    const e = recuAuthenticParDossier.get(id) || { t: 0, pages: null };
    e.enCours = true;
    recuAuthenticParDossier.set(id, e);
    try {
      const r = await fetchAvecAuth(`/api/authentic/dossier/${encodeURIComponent(id)}/pages`);
      if (r.ok) e.pages = (await r.json()).pages || [];
    } catch (_) { /* hors ligne : l'encadré reste « … » */ }
    e.t = Date.now();
    e.enCours = false;
    majRecuAuthenticFiche(id);
  }

  function majRecuAuthenticFiche(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    document.querySelectorAll('.recu-authentic').forEach(el => { if (el.dataset.recuAuthentic === id) el.innerHTML = htmlRecuAuthentic(d, recuAuthenticParDossier.get(id)); });
  }

  // ---------- Fiche bien : tout ce qu'Authentic en dit ----------

  // Pure : tous les champs renseignés de la fiche bien d'Authentic (étude 17/10 : « il faut bien tout récupérer d'Authentic pour les fiches,
  // toutes les données utiles ») — type, désignation, lotissement, surfaces, usage, servitudes… —, libellé lisible et valeur, sans les champs
  // techniques ni l'adresse et le cadastre déjà lus à part. 30 au plus, 200 caractères par valeur.
  function detailsFicheBienAuthentic(champs) {
    const vus = new Set();
    const details = [];
    (champs || []).forEach(c => {
      if (!c || details.length >= 30) return;
      const brut = String(c.libelle || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
      const valeur = String(c.valeur == null ? '' : c.valeur).replace(/\s+/g, ' ').trim();
      if (!brut || !valeur || brut.length > 60 || /[:_]|^j_id|^form|^ui-/i.test(brut) || /^(true|false|off|on)$/i.test(valeur) && !/lotissement|copropri/i.test(brut)) return;
      const net = libelleNetAuthentic(brut);
      if (/^(adresse|numero|n°|voie|type de voie|nom de (la )?voie|complement|code postal|cp|ville|commune|pays|section|prefixe|numero de parcelle|lieu-dit|lieu dit)$/.test(net)) return;
      if (vus.has(net)) return;
      vus.add(net);
      details.push({ libelle: brut.slice(0, 60), valeur: valeur.slice(0, 200) });
    });
    return details;
  }

  // Pure : la rubrique « Immeubles (n) » de la page du dossier — combien de biens compte le dossier et le texte de la rubrique (étude 19/10 :
  // « repérer dans la structure le nombre de biens du dossier et ne pas en rajouter d'autres »). Texte vide quand la rubrique est coupée
  // (fin non trouvée) : seul le nombre compte alors. null sans rubrique.
  function biensRubriqueAuthentic(capture) {
    // Le texte de la page seulement (lignes) : un libellé de champ peut être coupé, et une adresse coupée écarterait le bon bien.
    const c = capture || {};
    const sources = [[c.texte || '', true]].concat((c.champs || []).map(ch => [(ch.libelle || '') + ' ' + (ch.valeur || ''), false]));
    for (const [src, lignes] of sources) {
      const m = /Immeubles?\s*\((\d{1,3})\)\s*/i.exec(String(src));
      if (!m || !Number(m[1])) continue;
      const suite = String(src).slice(m.index + m[0].length, m.index + m[0].length + 1500);
      const fin = lignes ? /\n\s*(?:Documents?|Parties|Informations|Comparants|Notes?|Rechercher|Filtrer|Mod[eè]le|Importer|Pi[eè]ces|Tiers|Formalit|Mails?|Courriers?|Demandes?|Banques?|R[ée]daction|[ÉE]tat civil|Parties prenantes)/i.exec(suite) : null;
      return { nombre: Number(m[1]), texte: fin ? suite.slice(0, fin.index).replace(/\s+/g, ' ').trim() : '' };
    }
    return null;
  }

  // Pure : le bien (adresse en texte, ou { texte }) est-il de la rubrique « Immeubles » du dossier ? Par le CODE POSTAL seulement (relecture
  // 19/10 : « Fbg St Jean » et « Faubourg Saint-Jean », une résidence nommée… écartaient le vrai bien) : false seulement quand la rubrique
  // cite des codes postaux et pas celui du bien ; true quand elle le cite ; null sinon (pas de rubrique, pas de code postal d'un côté).
  // Deux biens de la même commune ne se départagent pas ici (bien principal d'un autre dossier : bienPrincipalDUnAutreDossier).
  function bienDansRubriqueAuthentic(adresse, rubrique) {
    const a = typeof adresse === 'string' ? adresse : (adresse && adresse.texte) || '';
    const texte = rubrique && rubrique.texte;
    if (!a || !texte) return null;
    const e = elementsAdresseAuthentic(a);
    // Codes postaux plausibles seulement (jamais « 125/10000 », un tantième ou un numéro de lot) ; moins de codes que de biens annoncés :
    // un bien est cité sans code postal, on ne sait pas.
    const cps = (String(texte).match(/(?<![\d/.,])(?:0[1-9]|[1-8]\d|9[0-8])\d{3}(?![\d/.,])(?=\s+[A-Za-zÀ-ÿ])/g) || []);
    if (!e || !e.codePostal || !cps.length || cps.length < (Number(rubrique.nombre) || 1)) return null;
    return cps.includes(e.codePostal);
  }

  // Pure : la page a-t-elle été ouverte hors de tout onglet de dossier d'Authentic (recherche d'immeubles, liste…) ? Une fiche bien ainsi
  // ouverte n'est d'aucun dossier sûr : jamais rangée dans le dernier dossier vu (étude 19/10 : « il mélange les dossiers »). Sans onglets
  // relevés, on ne sait pas : false.
  function ongletActifHorsDossierAuthentic(capture) {
    const o = ((capture && capture.onglets) || []).find(x => x && x.actif);
    if (!o) return false;
    const titre = sansReferenceAuthentic(o.titre);
    return !referencesDansTexteAuthentic(o.titre).length && !/^\s*(?:\d{1,6}\s*-|vte\b|vente\b|succ\b|succession\b)/i.test(titre) && !RE_INTITULE_VTE_SEUL_AUTHENTIC.test(titre);
  }

  // Pure : le dossier de CLAIRE désigné par l'onglet actif d'Authentic (« N - … » ou « VTE X / Y »), ou null.
  function dossierOngletActifAuthentic(capture, liste) {
    // La référence de l'onglet actif d'abord, quel que soit son titre (succession, titre coupé — relecture 19/10).
    const actif = ((capture && capture.onglets) || []).find(x => x && x.actif);
    const ref = actif ? (referencesDansTexteAuthentic(actif.titre)[0] || '') : '';
    const parRef = ref ? (liste || []).filter(d => d && !d.deleted && d.referenceAuthentic === ref) : [];
    if (parRef.length === 1) return parRef[0];
    const o = ongletDossierActifAuthentic(capture);
    const intitule = intituleOngletActifAuthentic(capture);
    return intitule ? dossierPourIntituleAuthentic(intitule, liste, '', referenceDossierAuthentic({ onglets: [o] })) : null;
  }
  function ongletDossierActifAuthentic(capture) {
    // Titre réel : référence en tête (« A 2026 00106 VTE X / Y », relecture 19/10) — retirée avant de reconnaître le dossier.
    return ((capture && capture.onglets) || []).find(x => x && x.actif && (/^\s*\d{1,6}\s*-/.test(sansReferenceAuthentic(x.titre)) || RE_INTITULE_VTE_SEUL_AUTHENTIC.test(sansReferenceAuthentic(x.titre)))) || null;
  }
  // Pure : l'onglet actif d'Authentic est celui d'un AUTRE dossier que `noms` (nom du dernier dossier vu) ? Un onglet de dossier (VTE,
  // Vente, SUCC, Succession, « N - », référence) dont aucun nom ne se retrouve dans ce dossier — même coupé à l'affichage
  // (« VTE BOURNOUVE... ») — n'est pas lui (étude 19/10 : fiche bien d'une autre vente rangée dans la succession VIEL). Sans onglet de
  // dossier actif : on ne sait pas, `false`.
  function ongletActifAutreDossierAuthentic(capture, noms, reference) {
    const o = ((capture && capture.onglets) || []).find(x => x && x.actif);
    const titre = o ? sansReferenceAuthentic(o.titre) : '';
    const refOnglet = o ? (referencesDansTexteAuthentic(o.titre)[0] || '') : '';
    // La référence d'abord (relecture 19/10) : différente = un autre dossier (ancien dossier des mêmes clients compris), égale = le même.
    if (refOnglet && reference) return refOnglet !== reference;
    if (!titre || !(/^\s*(?:\d{1,6}\s*-|vte\b|vente\b|succ\b|succession\b)/i.test(titre) || refOnglet)) return false;
    const mots = (t) => normaliserPourRecherche(String(t || '')).replace(/\.{2,}|…/g, ' ').split(/[^a-z0-9]+/).filter(m => m.length >= 3 && !/^(vte|vente|succ|succession|veuve|epouse|epoux|consorts?)$/.test(m));
    const duTitre = mots(titre);
    if (!duTitre.length) return false;
    const duDossier = new Set(mots(noms));
    // Un mot coupé (« BOURNOUVE... ») compte s'il commence un nom du dossier.
    // Le dernier mot d'un titre coupé (« … FON... ») compte dès 3 lettres s'il commence un nom du dossier.
    const coupe = /(?:\.{2,}|…)\s*$/.test(titre);
    return !duTitre.some((m, i) => duDossier.has(m) || [...duDossier].some(x => x.startsWith(m) && (m.length >= 4 || (coupe && i === duTitre.length - 1 && m.length >= 3))));
  }
  // Pure : l'intitulé du dossier de l'onglet actif d'Authentic (même absent de CLAIRE), '' sinon — une fiche ouverte dans l'onglet d'un AUTRE
  // dossier n'est jamais celle du dernier dossier vu (étude 19/10 : fiche bien d'une vente rangée dans la succession VIEL).
  function intituleOngletActifAuthentic(capture) {
    const o = ongletDossierActifAuthentic(capture);
    return o ? (intituleNumeroteAuthentic({ onglets: [o], champs: [], tableaux: [], texte: '' }).intitule || '') : '';
  }

  // Pure : les groupes de pages d'Authentic qui désignent le MÊME dossier réunis en un (étude 19/10, succession BARON : fiches client et
  // fiches bien rangées sous l'intitulé de l'onglet — « SUCC BARON Philippe » —, la page du dossier sous son en-tête — « 1 - Succession
  // Philippe BARON » — : la création ne recevait ni les fiches ni tous les biens). Même référence, ou mêmes noms et même type d'acte sans
  // références contraires. Le groupe qui porte la page du dossier (informations relevées) reçoit les autres.
  function fusionnerGroupesAuthentic(groupes) {
    const TYPES = { vte: 'vente', vente: 'vente', succ: 'succession', succession: 'succession' };
    const cleNoms = (intitule) => {
      const mots = normaliserPourRecherche(sansReferenceAuthentic(intitule)).replace(/^\s*\d{1,6}\s*-\s*/, '').split(/[^a-z0-9]+/).filter(m => m.length >= 2);
      const type = mots.map(m => TYPES[m]).find(Boolean) || '';
      const garder = (m) => !TYPES[m] && !/^(veuve|veuf|epouse|epoux|nee|ne|de|du|et|consorts?)$/.test(m);
      // Les côtés d'une vente restent distincts (« MARTIN / DUPONT » n'est pas « DUPONT / MARTIN ») ; l'ordre des mots dans un côté ne compte pas.
      const cotes = normaliserPourRecherche(sansReferenceAuthentic(intitule)).replace(/^\s*\d{1,6}\s*-\s*/, '').split('/')
        .map(c => c.split(/[^a-z0-9]+/).filter(m => m.length >= 2 && garder(m)).sort().join(' ')).filter(Boolean);
      return mots.some(garder) ? type + ':' + cotes.join('/') : '';
    };
    const sortie = [];
    (groupes || []).forEach(g => {
      const k = cleNoms(g.intitule);
      // Même référence ; sinon mêmes noms, seulement s'il n'y a qu'UN dossier candidat (un ancien dossier signé des mêmes clients et le
      // nouveau : rien n'est réuni — relecture 0.290.1).
      const parRef = sortie.find(x => g.reference && x.reference && g.reference === x.reference);
      const parNoms = k ? sortie.filter(x => cleNoms(x.intitule) === k && !(g.reference && x.reference && g.reference !== x.reference)) : [];
      const references = new Set((groupes || []).filter(x => k && cleNoms(x.intitule) === k && x.reference).map(x => x.reference));
      const cible = parRef || (parNoms.length === 1 && references.size <= 1 ? parNoms[0] : null);
      if (!cible) { sortie.push(g); return; }
      const [garde, autre] = Object.keys(g.infos || {}).length > Object.keys(cible.infos || {}).length ? [g, cible] : [cible, g];
      autre.personnes.forEach((v, cle) => { if (!garde.personnes.has(cle)) garde.personnes.set(cle, v); });
      autre.immeubles.forEach((v, cle) => { if (!garde.immeubles.has(cle)) garde.immeubles.set(cle, v); });
      autre.documents.forEach((v, cle) => { if (!garde.documents.has(cle)) garde.documents.set(cle, v); });
      garde.releves = (garde.releves || []).concat(autre.releves || []);
      if ((autre.conjoints || []).length) garde.conjoints = (garde.conjoints || []).concat(autre.conjoints);
      garde.reference = garde.reference || autre.reference;
      garde.adresse = garde.adresse || autre.adresse;
      garde.apercu = garde.apercu || autre.apercu;
      garde.succession = !!(garde.succession || autre.succession);
      // « À créer » : ce que dit la page du dossier (le groupe gardé), jamais celui d'un onglet.
      if (!Object.keys(garde.infos || {}).length) garde.aCreer = !!(garde.aCreer || autre.aCreer);
      // La rubrique « Immeubles » la plus récente (relecture 19/10 : le groupe gardé n'est pas forcément le plus récent).
      if (String(autre.derniere || '') > String(garde.derniere || '') && autre.infos && autre.infos.biensDossier) garde.infos = Object.assign({}, garde.infos, { biensDossier: autre.infos.biensDossier });
      if (String(autre.derniere || '') > String(garde.derniere || '')) garde.derniere = autre.derniere;
      if (garde !== cible) sortie[sortie.indexOf(cible)] = garde;
    });
    return sortie;
  }

  // ---- Ne plus jamais deviner le dossier (étude 19/10 : « Met en place le 2 ») ----
  // Une page d'Authentic n'est rangée seule que dans un dossier SÛR : celui de sa référence (« A 2025 00281 ») déjà rattachée, ou d'un
  // intitulé rangé là à la main. Retrouvé par les noms seulement → « est-ce bien ce dossier ? », confirmé d'un clic, puis retenu : les
  // pages suivantes de ce dossier d'Authentic y vont par la référence.

  // Pure : ce dossier de CLAIRE est-il déjà rattaché à cette page d'Authentic (référence, ou intitulé rangé ici à la main) ?
  function dossierSurAuthentic(d, reference, intitule) {
    if (!d) return false;
    const ref = referenceAuthenticValide(reference) ? reference : '';
    if (ref && d.referenceAuthentic === ref) return true;
    const cle = cleIntituleAuthentic(intitule);
    return !!cle && (d.intitulesAuthentic || []).includes(cle) && !autreReferenceAuthentic(d, ref);
  }

  // Pure : le dossier d'une page sans intitulé (fiche client, fiche bien, lots…) d'après l'onglet ACTIF d'Authentic → { d, propose,
  // groupe, intitule, reference } — `d` : le dossier SÛR (référence de l'onglet déjà rattachée, intitulé rangé à la main) ; `propose` :
  // celui que les noms de l'onglet désignent, à confirmer ; `groupe` : la clé du dossier d'Authentic de l'onglet (référence, sinon
  // intitulé) qui réunit les pages en attente d'une même réponse. Sans onglet relevé (ancienne extension) : la référence de la page, sinon
  // le dernier dossier SÛR vu (`courantSur`).
  function contexteSurAuthentic(capture, liste, courantSur) {
    const vivants = (liste || []).filter(d => d && !d.deleted);
    const parRef = (ref) => { const l = ref ? vivants.filter(d => d.referenceAuthentic === ref) : []; return l.length === 1 ? l[0] : null; };
    const onglets = Array.isArray(capture && capture.onglets) ? capture.onglets : [];
    const actif = onglets.find(x => x && x.actif);
    const reference = actif ? (referencesDansTexteAuthentic(actif.titre)[0] || '') : '';
    const intitule = intituleOngletActifAuthentic(capture);
    if (reference || intitule) {
      const d = parRef(reference) || (intitule ? vivants.find(x => dossierSurAuthentic(x, reference, intitule)) || null : null);
      const propose = d ? null : dossierPourIntituleAuthentic(intitule, vivants, '', reference);
      return { d, propose, groupe: reference || cleIntituleAuthentic(intitule), intitule, reference };
    }
    if (onglets.length) return { d: null, propose: null, groupe: '', intitule: '', reference: '' };
    const refPage = referenceDossierAuthentic(capture);
    return { d: parRef(refPage) || (refPage ? null : courantSur || null), propose: null, groupe: refPage, intitule: '', reference: refPage };
  }

  // Une page dont le dossier n'est pas sûr : jamais rangée seule. Elle attend un clic — « Oui » pour le dossier proposé par les noms,
  // « Autre dossier… » pour en choisir un — et les pages du même dossier d'Authentic attendent avec elle : une seule question.
  // → le résultat rapporté au journal.
  function pageAConfirmerAuthentic(capture, rel, ctx, nature) {
    const propose = ctx.propose || null;
    const groupe = ctx.groupe || '';
    const dejaCle = groupe ? [...fichesClientEnAttente.keys()].find(k => fichesClientEnAttente.get(k).groupe === groupe && fichesClientEnAttente.get(k).principale) : '';
    const cle = 'f' + (++numeroFicheEnAttente);
    const creation = nature === 'dossier' && !!ctx.intitule && proposerCreationDossierAuthentic(capture, ctx.intitule);
    fichesClientEnAttente.set(cle, { capture, releveId: rel && rel.id, nature, creation, groupe, propose: propose ? propose.id : '', principale: !dejaCle,
      rattacher: !ctx.d, intituleGroupe: ctx.intitule || '', referenceGroupe: ctx.reference || '' });
    while (fichesClientEnAttente.size > 30) fichesClientEnAttente.delete(fichesClientEnAttente.keys().next().value);
    const ou = ctx.intitule ? `« ${[ctx.reference, ctx.intitule].filter(Boolean).join(' ')} »` : ctx.reference || '';
    const quoi = nature === 'dossier' ? `dossier ${ou}`
      : nature === 'client' ? `fiche de ${(() => { const p = clientDepuisFicheAuthentic(capture); return p ? [p.prenom, p.nom].filter(Boolean).join(' ') : 'client'; })()}${ou ? ` (onglet ${ou})` : ''}`
        : `fiche ${nature === 'bien' ? 'du bien' : ''}${ou ? ` (onglet ${ou})` : ''}`;
    if (dejaCle && typeof toastFixe !== 'undefined' && toastFixe && toastFixe.cle === dejaCle) return { etat: 'a-confirmer', texte: `${quoi} : attend la réponse déjà demandée pour ce dossier` };
    if (dejaCle) fichesClientEnAttente.get(dejaCle).principale = false;
    fichesClientEnAttente.get(cle).principale = true;
    if (propose) {
      afficherToast(`Authentic · ${quoi} : est-ce ${libelleDossierAffiche(propose)} ?`, 'Oui', () => rangerFicheClientAuthentic(cle, propose.id),
        { fixe: true, cle, autre: { texte: 'Autre dossier…', action: () => ouvrirChoixFicheClientAuthentic(cle) } });
      return { etat: 'a-confirmer', texte: `${quoi} : ${libelleDossierAffiche(propose)} retrouvé par les noms seulement — à confirmer d’un clic` };
    }
    afficherToast(`Authentic · ${quoi} : à quel dossier ?`, 'Choisir', () => ouvrirChoixFicheClientAuthentic(cle), { fixe: true, cle });
    return { etat: 'a-choisir', texte: `${quoi} : aucun dossier sûr (onglet sans référence rattachée) — à choisir` };
  }

  // Après un rattachement confirmé : les autres pages du même dossier d'Authentic qui attendaient sont reprises — elles vont désormais au
  // dossier par la référence (ou l'intitulé) retenue.
  async function reprendreAttentesGroupeAuthentic(groupe, sauf) {
    if (!groupe) return;
    const cles = [...fichesClientEnAttente.keys()].filter(k => k !== sauf && fichesClientEnAttente.get(k).groupe === groupe);
    for (const k of cles) {
      const a = fichesClientEnAttente.get(k);
      fichesClientEnAttente.delete(k);
      fermerToastFixe(k);
      try {
        const res = await appliquerReleveAuthentic(a.capture, { id: a.releveId, revu: true });
        if (a.releveId) rapporterResultatsAuthentic([Object.assign({ id: a.releveId, cle: clePageReleveAuthentic(a.capture) }, res)]);
      } catch (e) { noterJournalTechnique({ categorie: 'erreur-poste', message: 'Authentic : page en attente non reprise — ' + String(e && e.message || e).slice(0, 120) }); }
    }
  }

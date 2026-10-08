  // ===== Droits de préemption d'un dossier de vente, lus seuls (étude 07/10 : « lors de l'ajout d'un dossier de vente, utiliser
  // l'outil de droit de préemption pour détecter s'il y a une SAFER, un droit de préemption ou un droit de préférence à attendre
  // dans les pièces, et compléter la fiche comme avec l'outil ») =====
  // Les MÊMES fonctions que l'outil (46-droits-preemption.js, règles de 45-preemption-regles.js) : pré-remplissage depuis la
  // fiche, commune du code postal, zonage de chaque parcelle sur le Géoportail, analyse. Le résultat va sur la fiche
  // (`d.preemption`, `auto: true`) ; chaque droit À PURGER ajoute sa pièce à attendre ; une réponse inconnue laisse le droit
  // « À vérifier » et sa question est posée sur la fiche — jamais un « non » deviné.

  // Dossiers dont l'analyse est en cours dans cette fenêtre (une seule à la fois par dossier).
  var preemptionsAutoEnCours = new Set();

  // Pure : ce qui fait relancer l'analyse automatique — code postal, parcelles, nature du bien d'après la fiche.
  function signaturePreemptionDossier(d) {
    const e = prefillPreemption(Object.assign({}, d, { preemption: null }));
    return [e.cp, e.parcelles, e.reponses.bien || ''].join('|');
  }

  // Pure : l'analyse automatique est-elle à faire (ou à refaire) pour ce dossier ? Seulement les dossiers de vente ajoutés
  // depuis cette règle (`d.preemptionAuto`), en cours, dont l'étude reçoit l'acte ; refaite quand la commune, les parcelles ou la
  // nature du bien changent, ou une heure après une lecture restée incomplète (Géoportail injoignable) — jamais par-dessus un
  // résultat enregistré depuis l'outil.
  var DELAI_RELECTURE_PREEMPTION_MS = 60 * 60 * 1000;
  function preemptionAutoAFaire(d, maintenant) {
    if (!d || d.deleted || d.archive || !d.preemptionAuto || estSuccession(d) || d.roleNotaire === 'participant') return false;
    const p = d.preemption;
    if (!p || !Array.isArray(p.droits)) return true;
    if (!p.auto) return false;
    // Lu avant que les monuments historiques le soient (08/10) : relu une fois pour les ajouter.
    if (!p.patrimoine) return true;
    if (p.signature !== signaturePreemptionDossier(d)) return true;
    const t = (maintenant || new Date()).getTime();
    return !!p.incomplet && t - (Date.parse(p.le) || 0) > DELAI_RELECTURE_PREEMPTION_MS;
  }

  // La pièce à attendre pour chaque droit à purger. Le droit de préemption urbain d'une maison ou d'un terrain a déjà sa pièce
  // standard (« Renonciation au droit de préemption ») ; pour un lot de copropriété, la pièce ajoutée retient la signature comme
  // la règle du planning le prévoit (preemptionLevee). « Réponse SAFER » est la même pièce que celle posée par Authentic.
  var PIECES_DROITS_PREEMPTION = {
    safer: { cle: 'perso-safer', label: 'Réponse SAFER', deja: /safer/i },
    'foret-preference': { cle: 'perso-foret-preference', label: 'Purge du droit de préférence (bois et forêts)', deja: /pr[ée]f[ée]rence/i },
    'foret-commune': { cle: 'perso-foret-commune', label: 'Réponse de la commune (bois et forêts)' },
    'foret-etat': { cle: 'perso-foret-etat', label: 'Réponse de l’État (bois et forêts)' }
  };
  // Lot de copropriété soumis au DPU : la pièce STANDARD de la checklist, retenue par l'analyse (piecesAjoutees) pour retenir le
  // planning — plus de seconde pièce « Renonciation au droit de préemption (DIA) » (perso-dia, 0.190.0 → 0.191.8 : le scan, le NAS et
  // Authentic cochaient la pièce standard, la seconde restait attendue). Les dossiers qui l'ont passent par migrerPieceDiaCopropriete.
  // Terre agricole / terrain non bâti (étude 08/10 : « Réponse SAFER d'office ») : la pièce « Réponse SAFER » posée dès la création ou
  // au passage à ce type — la même que celle d'Authentic et de l'analyse (PIECES_DROITS_PREEMPTION.safer), jamais en double, jamais en
  // participation ni en succession. Hors de `preemption.piecesAjoutees` : l'analyse ne la retire pas si elle ne trouve pas de droit SAFER.
  function ajouterPieceSaferTerre(d) {
    if (!d || d.typeVente !== 'terre' || estSuccession(d) || d.roleNotaire === 'participant') return false;
    const s = PIECES_DROITS_PREEMPTION.safer;
    if ((d.piecesPersonnalisees || []).some(p => p && (p.cle === s.cle || s.deja.test(p.label || '')))) return false;
    d.piecesPersonnalisees = (d.piecesPersonnalisees || []).concat({ cle: s.cle, label: s.label });
    d.pieces = d.pieces || {};
    if (d.pieces[s.cle] !== 'recue') d.pieces[s.cle] = 'manquante';
    return true;
  }
  var CLE_PIECE_DIA_ANCIENNE = 'perso-dia';
  function migrerPieceDiaCopropriete(d) {
    const perso = (d && d.piecesPersonnalisees) || [];
    if (!perso.some(p => p && p.cle === CLE_PIECE_DIA_ANCIENNE)) return false;
    d.pieces = d.pieces || {};
    if (d.pieces[CLE_PIECE_DIA_ANCIENNE] === 'recue' && d.pieces.renonciationPreemption !== 'recue') {
      d.pieces.renonciationPreemption = 'recue';
      d.piecesValideesManuellement = Array.from(new Set([...(d.piecesValideesManuellement || []), 'renonciationPreemption']));
    }
    d.piecesPersonnalisees = perso.filter(p => p && p.cle !== CLE_PIECE_DIA_ANCIENNE);
    delete d.pieces[CLE_PIECE_DIA_ANCIENNE];
    if (d.preemption && Array.isArray(d.preemption.piecesAjoutees)) {
      d.preemption.piecesAjoutees = Array.from(new Set(d.preemption.piecesAjoutees.map(c => (c === CLE_PIECE_DIA_ANCIENNE ? 'renonciationPreemption' : c))));
    }
    return true;
  }

  // Pure : les pièces attendues d'après les droits à purger de `p` → [{ droit, cle, label, deja?, standard? }].
  function piecesPreemptionAttendues(d, p) {
    const out = [];
    droitsPreemptionFiche(p).filter(dr => dr.statut === 'oui').forEach(dr => {
      if (dr.cle === 'dpu') {
        // Copropriété : la pièce standard ne retient pas le planning d'elle-même (preemptionLevee) — l'analyse la retient.
        out.push({ droit: 'dpu', cle: 'renonciationPreemption', label: 'Renonciation au droit de préemption', standard: true, retenir: d.typeVente === 'copropriete' });
      } else if (PIECES_DROITS_PREEMPTION[dr.cle]) out.push(Object.assign({ droit: dr.cle }, PIECES_DROITS_PREEMPTION[dr.cle]));
    });
    return out;
  }

  // Pure (modifie le dossier) : les pièces de la checklist suivent `d.preemption` — une pièce ajoutée pour chaque droit à purger
  // (jamais en double d'une pièce déjà là, Authentic compris), retirée si le droit tombe ensuite et qu'elle n'est pas reçue (seules
  // celles que l'analyse a ajoutées, `piecesAjoutees`). Une pièce standard retirée à la main n'est remise que par un geste
  // explicite (« Enregistrer sur la fiche » de l'outil). Rend ce qui a changé, pour l'historique.
  function appliquerPreemptionSurPieces(d, o) {
    const p = d && d.preemption;
    if (!p || !Array.isArray(p.droits) || d.roleNotaire === 'participant' || estSuccession(d)) return [];
    migrerPieceDiaCopropriete(d);
    const textes = [];
    const perso = () => d.piecesPersonnalisees || [];
    d.pieces = d.pieces || {};
    const ajoutees = new Set(Array.isArray(p.piecesAjoutees) ? p.piecesAjoutees : []);
    const attendues = piecesPreemptionAttendues(d, p);
    const voulues = new Set(attendues.map(a => a.cle));
    [...ajoutees].forEach(cle => {
      if (voulues.has(cle)) return;
      ajoutees.delete(cle);
      if (d.pieces[cle] === 'recue') return;
      // SAFER notifiée dans Authentic : la réponse reste attendue, quoi que dise le zonage.
      if (cle === PIECES_DROITS_PREEMPTION.safer.cle && d.authentic && d.authentic.safer) return;
      const piece = perso().find(x => x && x.cle === cle);
      if (!piece) return;
      d.piecesPersonnalisees = perso().filter(x => x && x.cle !== cle);
      delete d.pieces[cle];
      textes.push(`« ${piece.label} » retirée des pièces (plus de droit à purger)`);
    });
    attendues.forEach(a => {
      if (a.standard) {
        if (o && o.explicite && (d.piecesRetirees || []).includes(a.cle)) {
          d.piecesRetirees = d.piecesRetirees.filter(c => c !== a.cle);
          textes.push(`« ${a.label} » remise dans les pièces`);
        }
        if (a.retenir && !ajoutees.has(a.cle)) {
          ajoutees.add(a.cle);
          if (d.pieces[a.cle] !== 'recue') textes.push(`« ${a.label} » à attendre pour signer (lot soumis au droit de préemption urbain)`);
        }
        return;
      }
      if (perso().some(x => x && (x.cle === a.cle || (a.deja && a.deja.test(x.label || ''))))) return;
      d.piecesPersonnalisees = perso().concat({ cle: a.cle, label: a.label });
      if (d.pieces[a.cle] !== 'recue') d.pieces[a.cle] = 'manquante';
      ajoutees.add(a.cle);
      textes.push(`« ${a.label} » ajoutée aux pièces à attendre`);
    });
    p.piecesAjoutees = [...ajoutees];
    return textes;
  }

  // Pure : l'analyse refaite depuis ce que la fiche a gardé (réponses données, réponses déduites du zonage, zone de chaque
  // parcelle) — sans relire le Géoportail.
  // Une ligne par parcelle (la dernière l'emporte : deux enregistrements rapprochés peuvent avoir réuni deux listes).
  function analysePreemptionFiche(p) {
    const rep = Object.assign({}, (p && p.deduites) || {}, (p && p.reponses) || {});
    if (rep.dpur === 'oui' && p && p.insee === DPUR_BLOIS.insee && !rep.dpurDelegataire) rep.dpurDelegataire = DPUR_BLOIS.delegataire;
    const parCle = new Map();
    ((p && p.lignes) || []).forEach(l => { if (l) parCle.set(l.cle || l.libelle, l); });
    return analyserPreemptionParcelles(rep, [...parCle.values()]);
  }

  // Pure : les droits à afficher et à suivre. Depuis le 07/10 la fiche garde de quoi refaire l'analyse (`lignes`) : les droits
  // en sont recalculés — la liste `droits` gardée peut avoir été réunie avec une autre par la fusion du serveur (deux
  // enregistrements rapprochés) ; un résultat plus ancien, sans `lignes`, est lu tel quel.
  function droitsPreemptionFiche(p) {
    if (!p || !Array.isArray(p.droits)) return [];
    if (!Array.isArray(p.lignes)) return p.droits.filter(Boolean);
    return analysePreemptionFiche(p).droits.map(dr => ({ cle: dr.cle, titre: dr.titre, statut: dr.statut, motif: dr.motif, formalite: dr.formalite }));
  }

  // Les questions qui se répondent sur la fiche (oui / non) ; les autres manques (zone, nature de la mutation ou du bien) se
  // précisent dans l'outil.
  var QUESTIONS_FICHE_PREEMPTION_EN_PLUS = [
    { cle: 'dpuInstitue', libelle: 'La commune a-t-elle institué le droit de préemption urbain ?', valeurs: ['oui', 'non'] },
    { cle: 'dpur', libelle: 'Le bien est-il dans un périmètre de DPU renforcé ?', valeurs: ['oui', 'non'] }
  ];
  function questionPreemptionParCle(cle) {
    return QUESTIONS_PREEMPTION.find(q => q.cle === cle) || QUESTIONS_FICHE_PREEMPTION_EN_PLUS.find(q => q.cle === cle) || null;
  }

  // Pure : les questions encore utiles à l'analyse gardée sur la fiche.
  function questionsPreemptionFiche(p) {
    if (!p || !Array.isArray(p.droits)) return [];
    return analysePreemptionFiche(p).manques.map(questionPreemptionParCle).filter(Boolean);
  }

  // Pure : ce qui manque encore et ne se répond pas sur la fiche (libellés).
  function resteAPreciserPreemptionFiche(p) {
    if (!p || !Array.isArray(p.droits)) return [];
    return analysePreemptionFiche(p).manques.filter(c => !questionPreemptionParCle(c)).map(c => LIBELLES_MANQUES_PREEMPTION[c] || c);
  }

  // Pure (modifie le dossier) : une réponse donnée sur la fiche — analyse refaite, pièces mises à jour. Rend { changes, pieces }.
  function appliquerReponsePreemptionFiche(d, cle, valeur) {
    const p = d && d.preemption;
    if (!p || !Array.isArray(p.droits)) return null;
    const avant = new Map(droitsPreemptionFiche(p).map(dr => [dr.cle, dr.statut]));
    p.reponses = Object.assign({}, p.reponses);
    if (valeur == null || p.reponses[cle] === valeur) delete p.reponses[cle];
    else p.reponses[cle] = valeur;
    p.droits = analysePreemptionFiche(p).droits.map(dr => ({ cle: dr.cle, titre: dr.titre, statut: dr.statut, motif: dr.motif, formalite: dr.formalite }));
    const changes = p.droits.filter(dr => avant.get(dr.cle) !== dr.statut).map(dr => `${dr.titre} : ${LIBELLES_STATUT_PREEMPTION[dr.statut] || dr.statut}`);
    return { changes, pieces: appliquerPreemptionSurPieces(d) };
  }

  function repondrePreemptionFiche(id, cle, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const r = appliquerReponsePreemptionFiche(d, cle, valeur);
    if (!r) return;
    if (r.changes.length || r.pieces.length) ajouterHistorique(d, `Droits de préemption précisés — ${[...r.changes, ...r.pieces].join(' ; ')}`);
    sauvegarder(d);
    render();
  }

  // Résumé d'une analyse pour l'historique et le message : droits à purger, à vérifier.
  function resumePreemptionDossier(p) {
    const titres = (statut) => droitsPreemptionFiche(p).filter(dr => dr.statut === statut).map(dr => dr.titre);
    const parts = [];
    if (titres('oui').length) parts.push('à purger — ' + titres('oui').join(', '));
    if (titres('verifier').length) parts.push('à vérifier — ' + titres('verifier').join(', '));
    return parts.length ? parts.join(' ; ') : 'aucun droit à purger';
  }

  // L'analyse d'un dossier : commune, zonage de chaque parcelle, droits, pièces. Silencieuse si rien n'a changé ; sans réseau
  // (communes illisibles), rien n'est écrit et elle sera refaite à la prochaine ouverture de la fiche.
  async function analyserPreemptionDossier(id) {
    const d0 = dossiers.find(x => x.id === id);
    if (!preemptionAutoAFaire(d0) || preemptionsAutoEnCours.has(id)) return;
    preemptionsAutoEnCours.add(id);
    try {
      const etat = prefillPreemption(d0);
      let incomplet = false;
      if (etat.cp) {
        const erreur = await lireCommunesEtatPreemption(etat);
        if (erreur) return;
        if (etat.insee && parcellesDepuisTexte(etat.parcelles).length) await lireZonagesEtatPreemption(etat);
        incomplet = etat.zonages.some(z => z.statut === 'erreur');
      }
      // Le dossier a pu être remplacé pendant la lecture (synchronisation) : on écrit sur celui de la liste.
      const d = dossiers.find(x => x.id === id);
      if (!preemptionAutoAFaire(d)) return;
      const avant = d.preemption && Array.isArray(d.preemption.droits) ? d.preemption : null;
      d.preemption = Object.assign(preemptionPourFiche(etat), { auto: true, signature: signaturePreemptionDossier(d) },
        incomplet ? { incomplet: true } : {}, avant && avant.piecesAjoutees ? { piecesAjoutees: avant.piecesAjoutees } : {},
        avant && avant.travaux ? { travaux: avant.travaux } : {}, avant && avant.sitadel ? { sitadel: avant.sitadel } : {});
      const pieces = appliquerPreemptionSurPieces(d);
      const resume = resumePreemptionDossier(d.preemption);
      if (etat.zonages.some(z => z.statut === 'ok')) noterVerificationPoste('preemption-auto-dossier', { detail: `${etat.zonages.length} parcelle(s) lue(s)` });
      const changement = !avant || resume !== resumePreemptionDossier(avant) || pieces.length;
      if (changement) {
        ajouterHistorique(d, `Droits de préemption lus par CLAIRE (zonage du Géoportail) : ${resume}${pieces.length ? ' — ' + pieces.join(' ; ') : ''}`);
        const questions = questionsPreemptionFiche(d.preemption).length;
        afficherToast(`${libelleDossierAffiche(d)} — droits de préemption : ${resume}${questions ? ` ; ${questions} question${questions > 1 ? 's' : ''} sur la fiche (Pièces)` : ''}.`);
      }
      sauvegarder(d);
      render();
      // Travaux déclarés dans le compromis : lus une fois, en arrière-plan (Contrôle de l'urbanisme).
      lireTravauxDossierAuto(id).catch(e => console.warn('Contrôle de l’urbanisme : travaux non lus', e && e.message));
    } catch (e) {
      console.warn('Droits de préemption : analyse automatique impossible', e && e.message);
    } finally {
      preemptionsAutoEnCours.delete(id);
    }
  }

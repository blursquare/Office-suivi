  // ==== Copie de l'acte / attestation de vente aux clients (dossiers en participation, étude 03/10) ====
  // Le confrère reçoit l'acte ; l'étude transmet à SON client la copie de l'acte et/ou l'attestation de vente,
  // lues dans le dossier « Fausses minutes » du commun (server/src/faussesMinutes.js). Moins de 21 Mo : jointes à
  // l'email ; au-delà, CLAIRE ouvre WeTransfer et prépare l'email avec la place du lien — rien n'est déposé en
  // ligne sans le collaborateur. Textes : premiers jets de CLAIRE.
  var LIMITE_PIECES_JOINTES_OCTETS = 21 * 1024 * 1024;
  var ADRESSE_WETRANSFER = 'https://wetransfer.com/';
  var MOTS_NON_NOMS_FAUSSES_MINUTES = new Set(['vte', 'vente', 'succ', 'succession', 'et', 'epoux', 'epouse', 'consort', 'consorts', 'les', 'des', 'mme', 'monsieur', 'madame', 'sci', 'sarl', 'sas', 'acte', 'copie']);

  function estDossierParticipation(d) {
    return !!d && d.roleNotaire === 'participant' && !estSuccession(d);
  }

  // Pure : les clients de l'étude dans ce dossier — chaque côté qu'aucun autre office ne représente.
  function clientsParticipation(d) {
    if (!d) return [];
    const out = [];
    if (!confrereRepresenteVendeur(d)) out.push({ role: 'VENDEUR', email: d.emailVendeur || '' });
    if (!notaireParticipantRepresenteAcquereur(d)) out.push({ role: 'ACQUEREUR', email: d.emailAcquereur || '' });
    return out;
  }

  // Pure : « attestation » si le nom le dit, sinon « copie » (copie de l'acte).
  function typeFausseMinute(nom) {
    return /attestation/i.test(normaliserPourRecherche(String(nom || ''))) ? 'attestation' : 'copie';
  }

  // Pure : les noms qui désignent ce dossier, par côté (nom du dossier « VENDEUR / ACQUÉREUR », puis parties).
  function nomsDossierFaussesMinutes(d) {
    const mots = (texte) => normaliserPourRecherche(String(texte || '')).split(/[^a-z0-9]+/).filter(m => m.length >= 3 && !MOTS_NON_NOMS_FAUSSES_MINUTES.has(m));
    const [v, a] = String((d && d.nom) || '').split('/');
    const cote = (txt, role) => new Set(mots(txt).concat(((d && d.parties) || []).filter(p => p && p.role === role).flatMap(p => mots(String(p.nom || '').split(/\s+/).slice(-1)[0]))));
    return { vendeur: [...cote(v, 'VENDEUR')], acquereur: [...cote(a, 'ACQUEREUR')] };
  }

  // Pure : les PDF des fausses minutes qui portent un nom du dossier, les plus sûrs d'abord (les deux côtés
  // nommés, puis le plus récent). Une fausse minute antérieure de plus de 7 jours au rendez-vous de signature
  // est celle d'un autre acte des mêmes clients : écartée.
  function faussesMinutesPourDossier(fichiers, d) {
    const noms = nomsDossierFaussesMinutes(d);
    const depuis = d && d.rendezVousSignature ? addDays(String(d.rendezVousSignature).slice(0, 10), -7) : '';
    return (fichiers || []).map(f => {
      const n = ' ' + normaliserPourRecherche(String(f.nom || '')).replace(/[^a-z0-9]+/g, ' ') + ' ';
      const a = (liste) => liste.some(m => n.includes(' ' + m + ' '));
      const score = (a(noms.vendeur) ? 1 : 0) + (a(noms.acquereur) ? 1 : 0);
      return Object.assign({}, f, { score, type: typeFausseMinute(f.nom) });
    }).filter(f => f.score > 0 && (!depuis || String(f.modifie || '').slice(0, 10) >= depuis))
      .sort((x, y) => y.score - x.score || String(y.modifie || '').localeCompare(String(x.modifie || '')))
      .slice(0, 12);
  }

  // Pure : « 3,4 Mo » / « 850 Ko ».
  function tailleLisible(octets) {
    const n = Number(octets) || 0;
    if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
    return `${Math.max(1, Math.round(n / 1024))} Ko`;
  }

  // Pure : l'email au client. `types` : ['copie'] / ['attestation'] / les deux ; `lien` : fichier trop lourd.
  function construireEmailCopieActe(d, types, lien) {
    const copie = (types || []).includes('copie'), attestation = (types || []).includes('attestation');
    const quoi = copie && attestation ? 'la copie de l’acte et l’attestation de vente' : attestation ? 'l’attestation de vente' : 'la copie de l’acte de vente';
    const Quoi = copie && attestation ? 'Copie de l’acte et attestation de vente' : attestation ? 'Attestation de vente' : 'Copie de l’acte de vente';
    const vente = d.rendezVousSignature ? ` de la vente signée le ${formatDateFr(d.rendezVousSignature)}` : '';
    const corps = ['Bonjour,'];
    if (lien) {
      corps.push(`Le fichier étant trop volumineux pour être joint à cet email, vous pouvez télécharger ${quoi}${vente} à l’adresse suivante :`,
        '[lien WeTransfer à coller ici]',
        'Ce lien reste actif quelques jours : pensez à enregistrer le document.');
    } else {
      corps.push(`Veuillez trouver ci-joint ${quoi}${vente}.`);
    }
    corps.push('Nous restons à votre disposition pour toute question.', 'Bien cordialement,');
    return { sujet: `${Quoi} — ${libelleDossierAffiche(d)}`, corps: corps.join('\n\n') };
  }

  function renderEnvoiCopieActe(d) {
    if (!estDossierParticipation(d)) return '';
    const base = { categorie: 'neutre', categorieLabel: 'Après la signature', titre: 'Envoyer la copie de l’acte / l’attestation de vente' };
    const emails = clientsParticipation(d).map(c => c.email).filter(Boolean);
    if (d.copieActeEnvoyeeLe) {
      return renderLigneAction(Object.assign(base, {
        sous: `Envoyé le ${formatDateFr(d.copieActeEnvoyeeLe)}${d.copieActeEnvoyee && d.copieActeEnvoyee.lien ? ' (lien WeTransfer)' : ''}`, faite: true,
        bouton: emails.length ? { libelle: 'Renvoyer', icone: icone('mail'), onclick: `ouvrirEnvoiCopieActe('${escapeOnclickArg(d.id)}')` } : null
      }));
    }
    if (!emails.length) return renderLigneAction(Object.assign(base, { sous: 'Renseignez l’email du client.' }));
    return renderLigneAction(Object.assign(base, {
      sous: 'Lue dans les fausses minutes · jointe jusqu’à 21 Mo, sinon un lien WeTransfer',
      bouton: { libelle: 'Choisir', icone: icone('file-text'), onclick: `ouvrirEnvoiCopieActe('${escapeOnclickArg(d.id)}')` }
    }));
  }

  var envoiCopieActe = { id: '', fichiers: [], tous: [], choisis: new Set(), recherche: '', etat: '' };

  async function ouvrirEnvoiCopieActe(id) {
    const d = dossiers.find(x => x.id === id);
    const overlay = document.getElementById('copie-acte-overlay');
    if (!d || !overlay) return;
    envoiCopieActe = { id, fichiers: [], tous: [], choisis: new Set(), recherche: '', etat: 'chargement' };
    overlay.style.display = 'flex';
    renderEnvoiCopieActeFenetre();
    try {
      const r = await fetchAvecAuth('/api/nas/fausses-minutes');
      const corps = await r.json();
      if (!r.ok) throw new Error(corps.erreur || 'lecture impossible');
      if (!corps.trouve) {
        envoiCopieActe.etat = 'introuvable';
        noterVerificationPoste('fausses-minutes', { ok: false, message: 'dossier des fausses minutes introuvable' });
      } else {
        envoiCopieActe.tous = corps.fichiers || [];
        envoiCopieActe.fichiers = faussesMinutesPourDossier(envoiCopieActe.tous, d);
        envoiCopieActe.fichiers.forEach(f => envoiCopieActe.choisis.add(f.chemin));
        if (envoiCopieActe.fichiers.length > 1) {
          // Les plus sûrs seulement (les deux côtés nommés) cochés d'office quand il y en a.
          const meilleur = envoiCopieActe.fichiers[0].score;
          envoiCopieActe.fichiers.filter(f => f.score < meilleur).forEach(f => envoiCopieActe.choisis.delete(f.chemin));
        }
        envoiCopieActe.etat = 'pret';
        noterVerificationPoste('fausses-minutes', { detail: `${envoiCopieActe.tous.length} PDF lus` });
      }
    } catch (e) {
      envoiCopieActe.etat = 'erreur';
    }
    renderEnvoiCopieActeFenetre();
  }

  async function ouvrirFausseMinute(chemin) {
    const onglet = window.open('', '_blank');
    try {
      const r = await fetchAvecAuth('/api/nas/fausses-minutes/fichier?chemin=' + encodeURIComponent(chemin));
      if (!r.ok) throw new Error('statut ' + r.status);
      const url = URL.createObjectURL(await r.blob());
      if (onglet) onglet.location = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (onglet) onglet.close();
      afficherToast('Impossible d’ouvrir cette fausse minute : ' + e.message, 'OK', null);
    }
  }

  function fermerEnvoiCopieActe() {
    const overlay = document.getElementById('copie-acte-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function basculerFichierCopieActe(chemin) {
    if (envoiCopieActe.choisis.has(chemin)) envoiCopieActe.choisis.delete(chemin); else envoiCopieActe.choisis.add(chemin);
    renderEnvoiCopieActeFenetre();
  }

  function rechercherCopieActe(texte) {
    envoiCopieActe.recherche = String(texte || '');
    renderEnvoiCopieActeFenetre(true);
  }

  // Les fichiers montrés : ceux du dossier, ou la recherche dans toutes les fausses minutes (nom autrement écrit).
  function fichiersVisiblesCopieActe() {
    const q = normaliserPourRecherche(envoiCopieActe.recherche).trim();
    if (!q) return envoiCopieActe.fichiers;
    return envoiCopieActe.tous.filter(f => normaliserPourRecherche(f.nom).includes(q))
      .sort((x, y) => String(y.modifie || '').localeCompare(String(x.modifie || ''))).slice(0, 30)
      .map(f => Object.assign({ type: typeFausseMinute(f.nom) }, f));
  }

  function renderEnvoiCopieActeFenetre(garderFocus) {
    const d = dossiers.find(x => x.id === envoiCopieActe.id);
    const zone = document.getElementById('copie-acte-contenu');
    if (!zone || !d) return;
    const tous = envoiCopieActe.tous;
    const choisis = tous.filter(f => envoiCopieActe.choisis.has(f.chemin));
    const total = choisis.reduce((t, f) => t + (Number(f.taille) || 0), 0);
    const lourd = total > LIMITE_PIECES_JOINTES_OCTETS;
    const visibles = fichiersVisiblesCopieActe();
    const dest = clientsParticipation(d).map(c => c.email).filter(Boolean).join(', ');
    const liste = envoiCopieActe.etat === 'chargement' ? `<p class="hint">${icone('spinner', null, true)} Lecture des fausses minutes…</p>`
      : envoiCopieActe.etat === 'introuvable' ? '<p class="nas-choix-vide">Dossier « Fausses minutes » introuvable à côté des dossiers clients.</p>'
      : envoiCopieActe.etat === 'erreur' ? '<p class="nas-choix-vide">Lecture des fausses minutes impossible.</p>'
      : visibles.length ? visibles.map(f => `<label class="copie-acte-fichier">
            <input type="checkbox" ${envoiCopieActe.choisis.has(f.chemin) ? 'checked' : ''} onchange="basculerFichierCopieActe('${escapeOnclickArg(f.chemin)}')">
            <span class="copie-acte-nom">${escapeHtml(f.nom)}</span>
            <span class="copie-acte-meta">${f.type === 'attestation' ? 'Attestation' : 'Copie de l’acte'} · ${tailleLisible(f.taille)}${f.modifie ? ' · ' + formatDateFr(String(f.modifie).slice(0, 10)) : ''}</span>
            <button type="button" class="icon-btn" onclick="event.preventDefault(); ouvrirFausseMinute('${escapeOnclickArg(f.chemin)}')" title="Ouvrir" aria-label="Ouvrir ${escapeAttr(f.nom)}">${icone('eye')}</button>
          </label>`).join('')
      : `<p class="nas-choix-vide">${envoiCopieActe.recherche ? 'Aucun PDF à ce nom.' : 'Aucune fausse minute au nom du dossier : cherchez-la ci-dessus.'}</p>`;
    zone.innerHTML = `
      <p class="copie-acte-titre">${escapeHtml(libelleDossierAffiche(d))} ${infoBulle('PDF du dossier « Fausses minutes » portant un nom du dossier. Moins de 21 Mo au total : joints à l’email. Au-delà : CLAIRE ouvre WeTransfer et télécharge les PDF pour les y déposer, l’email est préparé avec la place du lien.')}</p>
      <p class="hint">À : ${escapeHtml(dest || '—')}</p>
      <input type="search" id="copie-acte-recherche" class="authentic-choix-recherche" placeholder="Chercher dans les fausses minutes" autocomplete="off" value="${escapeAttr(envoiCopieActe.recherche)}" oninput="rechercherCopieActe(this.value)" ${envoiCopieActe.etat === 'pret' ? '' : 'style="display:none;"'}>
      <div class="nas-choix-liste copie-acte-liste">${liste}</div>
      ${choisis.length ? `<p class="copie-acte-total"><span class="dot-label ${lourd ? 'dl-pret' : 'dl-success'}"><span class="dot"></span>${choisis.length} fichier${choisis.length > 1 ? 's' : ''} · ${tailleLisible(total)}</span>${lourd ? ' <span class="hint">Plus de 21 Mo : lien WeTransfer</span>' : ''}</p>` : ''}
      <div class="confirm-actions">
        <wa-button appearance="outlined" class="btn-annuler" onclick="fermerEnvoiCopieActe()">Annuler</wa-button>
        <wa-button variant="brand" class="primary" onclick="preparerEnvoiCopieActe()" ${choisis.length && dest ? '' : 'disabled'}>${lourd ? 'Ouvrir WeTransfer et préparer l’email' : 'Préparer l’email'}</wa-button>
      </div>`;
    if (garderFocus) {
      const champ = document.getElementById('copie-acte-recherche');
      if (champ) { champ.focus(); champ.setSelectionRange(champ.value.length, champ.value.length); }
    }
  }

  async function preparerEnvoiCopieActe() {
    const d = dossiers.find(x => x.id === envoiCopieActe.id);
    if (!d) return;
    const choisis = envoiCopieActe.tous.filter(f => envoiCopieActe.choisis.has(f.chemin));
    const destinataire = clientsParticipation(d).map(c => c.email).filter(Boolean).join(', ');
    if (!choisis.length || !destinataire) return;
    const total = choisis.reduce((t, f) => t + (Number(f.taille) || 0), 0);
    const types = [...new Set(choisis.map(f => typeFausseMinute(f.nom)))];
    const lien = total > LIMITE_PIECES_JOINTES_OCTETS;
    const adresse = (f) => '/api/nas/fausses-minutes/fichier?chemin=' + encodeURIComponent(f.chemin);
    const telechargerTous = async () => {
      for (const f of choisis) {
        const r = await fetchAvecAuth(adresse(f));
        if (!r.ok) throw new Error(`« ${f.nom} » illisible`);
        telechargerFichier(await r.blob(), f.nom, 'application/pdf');
      }
    };
    let pieces = [];
    try {
      if (lien) {
        window.open(ADRESSE_WETRANSFER, '_blank', 'noopener');
        await telechargerTous();
      } else if (modeEmailPoste() !== 'mailto') {
        for (const f of choisis) {
          const r = await fetchAvecAuth(adresse(f));
          if (!r.ok) throw new Error(`« ${f.nom} » illisible`);
          pieces.push({ nom: f.nom, type: 'application/pdf', contenuBase64: await blobVersBase64(await r.blob()) });
        }
      }
    } catch (e) {
      afficherToast('Fausses minutes : ' + e.message + '.', 'OK', null);
      return;
    }
    const { sujet, corps } = emailDepuisModele('copieActe', d, null, contexteCopieActe(d, types, lien));
    const r = await livrerEmailDossier({ destinataire, sujet, corps, pieces, responsableSignature: d.responsable, dossierId: d.id, geste: 'copieActe' });
    if (!r.ok) { if (!r.annule) afficherToast(r.message || "L'email n'a pas pu être préparé.", 'OK', null); return; }
    if (r.mode === 'mailto' && !lien) { try { await telechargerTous(); } catch (e) { /* signalé ci-dessous */ } }
    fermerEnvoiCopieActe();
    d.copieActeEnvoyeeLe = isoAujourdhuiLocal();
    d.copieActeEnvoyee = { types, fichiers: choisis.map(f => f.nom).slice(0, 10), lien };
    ajouterHistorique(d, `${libelleEmailFait(r)} — ${types.length > 1 ? 'copie de l’acte et attestation de vente' : types[0] === 'attestation' ? 'attestation de vente' : 'copie de l’acte'} au client${lien ? ' (lien WeTransfer)' : ''}`);
    sauvegarder(d);
    render();
    annoncerEmailPret(r, r.mode === 'envoye', r.mode === 'envoye' ? '' : lien ? 'Déposez sur WeTransfer les PDF téléchargés, puis collez le lien dans l’email.'
      : r.mode === 'mailto' ? 'Joignez les PDF qui viennent d’être téléchargés.' : '');
  }

  function renderQuestionnaireSatisfaction(d) {
    return renderQuestionnaireAcquereur(d) + renderQuestionnaireVendeur(d);
  }

  // Questionnaire au vendeur : même texte et même PDF, archive le dossier comme celui de l'acquéreur. Proposé une fois une
  // date de signature connue, et encore après l'archivage dû au questionnaire de l'acquéreur.
  function renderQuestionnaireVendeur(d) {
    if (confrereRepresenteVendeur(d)) return '';
    const base = { categorie: 'neutre', categorieLabel: 'Clôture du dossier', titre: 'Questionnaire de satisfaction au vendeur' };
    if (d.questionnaireVendeurEnvoyeLe) {
      return renderLigneAction(Object.assign(base, {
        sous: `Envoyé le ${formatDateFr(d.questionnaireVendeurEnvoyeLe)}${d.archive ? ' — dossier archivé' : ''}`, faite: true,
        bouton: d.emailVendeur ? { libelle: 'Renvoyer', icone: icone('mail'), onclick: `envoyerQuestionnaireSatisfaction('${d.id}', false, 'vendeur')` } : null
      }));
    }
    if (d.archive && !d.questionnaireEnvoyeLe) return '';
    if (!d.acte && !d.rendezVousSignature) return '';
    if (!d.emailVendeur) return renderLigneAction(Object.assign(base, { sous: 'Renseignez l’email du vendeur.' }));
    return renderLigneAction(Object.assign(base, {
      sous: 'Le PDF est joint',
      bouton: { libelle: 'Envoyer', icone: icone('mail'), onclick: `envoyerQuestionnaireSatisfaction('${d.id}', false, 'vendeur')`, titre: (modeEmailPoste() === 'mailto' ? 'Ouvre le brouillon et télécharge le PDF à joindre' : 'Prépare l’email avec le questionnaire joint') + (d.archive ? '' : ', et archive le dossier') }
    }));
  }

  function renderQuestionnaireAcquereur(d) {
    if (notaireParticipantRepresenteAcquereur(d)) return '';
    const base = { categorie: 'neutre', categorieLabel: 'Clôture du dossier', titre: 'Questionnaire de satisfaction' };
    // Déjà envoyé : on le dit, avec la date, et on laisse la possibilité de renvoyer. Affiché même
    // sur un dossier archivé (l'envoi archive le dossier, voir envoyerQuestionnaireSatisfaction) —
    // sinon la trace disparaîtrait à l'instant même où elle devient utile.
    if (d.questionnaireEnvoyeLe) {
      return renderLigneAction(Object.assign(base, {
        sous: `Envoyé le ${formatDateFr(d.questionnaireEnvoyeLe)} — dossier archivé`, faite: true,
        bouton: d.emailAcquereur ? { libelle: 'Renvoyer', icone: icone('mail'), onclick: `envoyerQuestionnaireSatisfaction('${d.id}')` } : null
      }));
    }
    if (d.archive && !d.questionnaireVendeurEnvoyeLe) return '';
    // Demandé par l'étude : proposé seulement une fois une date de signature connue (rendez-vous,
    // à défaut date butoir) — avant, le dossier n'est pas fini et le questionnaire n'a pas d'objet.
    // Avant la signature elle-même, il reste replié « hors de ce stade » (echangesSelonStade).
    if (!d.acte && !d.rendezVousSignature) return '';
    if (!d.emailAcquereur) {
      return renderLigneAction(Object.assign(base, { sous: 'Renseignez l’email de l’acquéreur.' }));
    }
    const titre = modeEmailPoste() === 'mailto'
      ? 'Ouvre le brouillon, télécharge le PDF à joindre, et archive le dossier'
      : 'Prépare l’email avec le questionnaire joint, et archive le dossier';
    const cle = `questionnaire:${d.id}`;
    const brouillon = apercusJour.has(cle) ? brouillonAction({ dossier: d, geste: { type: 'questionnaire' } }) : null;
    return renderLigneAction(Object.assign(base, {
      sous: 'Le PDF est joint ; le dossier est archivé à l’envoi',
      bouton: { libelle: 'Envoyer', icone: icone('mail'), onclick: `envoyerQuestionnaireSatisfaction('${d.id}')`, titre },
      apercu: cle, detail: brouillon ? renderBrouillonEmail(brouillon) : ''
    }));
  }

  // Passerelle de la fiche vers le générateur d'appel de fonds : bascule d'onglet avec le dossier
  // déjà repris (voir preparerAppelFondsDepuisDossier). Proposé sur tout dossier actif, y compris
  // en participation — c'est même là que l'outil sert le plus, le décompte venant alors du
  // confrère et devant être relayé au client. Le courrier lui-même n'est jamais envoyé d'ici : on
  // prépare un .docx, l'étude le relit et l'envoie.
  function renderAppelFondsDossier(d) {
    if (d.archive) return '';
    // Appel de fonds déjà fait : plus rien à préparer, la ligne disparaît (demandé par l'étude).
    if (echeanceValidee(d, 'appelFonds')) return '';
    // Ce qui manquera au courrier, dit AVANT le clic plutôt que découvert sur l'écran suivant.
    const manques = [];
    if (!d.rendezVousSignature) manques.push('la date du rendez-vous');
    if (!d.prixVente) manques.push('le prix');
    if (!d.adresseBien) manques.push("l'adresse du bien");
    return renderLigneAction({
      categorie: 'appelFonds', categorieLabel: 'Envoi appel de fonds', titre: 'Préparer l’appel de fonds',
      sous: manques.length ? `À saisir ensuite : ${manques.join(', ')}` : 'Convocation et décompte des sommes à virer',
      bouton: { libelle: 'Préparer', icone: icone('file-text'), onclick: `preparerAppelFondsDepuisDossier('${d.id}')`, titre: 'Convocation et décompte des sommes à virer' }
    });
  }

  // ---- Échanges selon le stade du dossier (demandé par l'étude le 28/09) ----
  // Quatre stades, lus dans les données du dossier (rien à saisir) : conditions suspensives en
  // cours → conditions levées, rendez-vous à fixer → rendez-vous fixé (préparation de la signature)
  // → acte signé (rendez-vous passé ou marqué réalisé).
  var STADES_DOSSIER = {
    conditions: 'Conditions suspensives en cours',
    rendezVous: 'Conditions levées — rendez-vous à fixer',
    signature: 'Rendez-vous de signature fixé',
    signe: 'Acte signé'
  };

  function stadeDossier(d, aujourdhuiIso) {
    if (d.rendezVousSignature) {
      const j = ecartJours(aujourdhuiIso, d.rendezVousSignature);
      return (j !== null && j < 0) || echeanceValidee(d, 'rendezVousSignature') ? 'signe' : 'signature';
    }
    const venteAttendue = !!d.ventebien && !echeanceValidee(d, 'ventebien');
    const pretAttendu = !d.sansPret && !echeanceValidee(d, 'pret');
    return venteAttendue || pretAttendu ? 'conditions' : 'rendezVous';
  }

  // Pure : les échanges proposés sur ce dossier, rangés pour son stade, dans l'ordre de la vie du
  // dossier. `utiles` : ce qui sert maintenant ; `autres` : ce qui reste possible mais hors de propos
  // à ce stade (affiché replié, rien n'est retiré). Ce qui n'a plus aucun sens n'est nulle part :
  // relance de la vente préalable une fois faite, de l'offre une fois reçue, réception des fonds
  // avant l'appel de fonds (voir les render* de chaque ligne pour ces conditions d'existence).
  //   provision    ouverture du dossier, tant qu'aucun rendez-vous n'est fixé
  //   vente préal. tant qu'elle est attendue (avant la signature)
  //   prêt         tant que l'offre est attendue et la condition non levée
  //   appel fonds  à préparer dès les conditions levées, et jusqu'à la signature
  //   fonds reçus (vérifier puis confirmer au client), RIB, note d'agenda : rendez-vous fixé
  //   confirmation du rendez-vous : rendez-vous fixé, utile quand elle est due (ou faite, ou comprise dans la confirmation des fonds)
  //   relance des fonds : à J-3 si rien n'est arrivé (client seulement)
  //   questionnaire, un mot un an après : acte signé
  // Relation client (confirmation, questionnaire, un an après) : jamais quand un confrère
  // accompagne l'acquéreur (étude, 01/10), mêmes échéances que gestesRelationClient.
  function echangesSelonStade(d, aujourdhuiIso) {
    const stade = stadeDossier(d, aujourdhuiIso);
    if (estSuccession(d)) return { stade, utiles: [], autres: [] };
    const avantRdv = stade === 'conditions' || stade === 'rendezVous';
    const utiles = [], autres = [];
    const ranger = (cle, utile) => (utile ? utiles : autres).push(cle);
    // Acquéreur accompagné par un confrère : pas de RIB à lui demander, son notaire s'en charge ;
    // la provision et la pièce d'identité, elles, sont bien demandées au confrère (étude, 29/09).
    const confrere = notaireParticipantRepresenteAcquereur(d);
    ranger('provision', avantRdv);
    if (d.ventebien && !echeanceValidee(d, 'ventebien')) ranger('ventePrealable', stade !== 'signe');
    if (!d.sansPret && d.offrePretStatut !== 'recue') ranger('pret', stade !== 'signe' && !echeanceValidee(d, 'pret'));
    ranger('appelFonds', stade === 'rendezVous' || stade === 'signature');
    // Le projet d'acte se lit avant la signature : utile une fois le rendez-vous fixé, sans objet
    // une fois l'acte signé.
    if (stade !== 'signe') ranger('projet', stade === 'signature');
    ranger('fondsRecus', stade === 'signature');
    // Relance des fonds (client seulement) : utile à J-3 si rien n'est arrivé, sinon repliée tant que l'appel
    // de fonds est parti et les fonds pas confirmés ; cochée une fois envoyée pour ce rendez-vous.
    if (!confrere && stade === 'signature' && echeanceValidee(d, 'appelFonds') && (!d.receptionFondsConfirmeeLe || d.relanceFondsPour === d.rendezVousSignature)) {
      ranger('relanceFonds', relanceFondsDue(d, aujourdhuiIso) || d.relanceFondsPour === d.rendezVousSignature);
    }
    if (!confrere) ranger('rib', stade === 'signature');
    ranger('agenda', stade === 'signature');
    const dus = gestesRelationClient([d], aujourdhuiIso).map(g => g.type);
    if (!confrere && stade === 'signature') {
      ranger('confirmationRdv', dus.indexOf('confirmationRdv') !== -1 || d.confirmationRdvPour === d.rendezVousSignature || rdvConfirmeParFonds(d));
    }
    if (estDossierParticipation(d)) ranger('copieActe', stade === 'signe');
    if (!confrere || !confrereRepresenteVendeur(d)) ranger('questionnaire', stade === 'signe');
    if (!confrere && stade === 'signe') ranger('anniversaire', dus.indexOf('anniversaire') !== -1 || !!d.anniversaireEnvoyeLe);
    return { stade, utiles, autres };
  }

  // Une ligne par clé de echangesSelonStade ; '' quand le geste n'existe pas pour ce dossier.
  function renderLigneEchange(d, cle) {
    const avecDestinataire = !!emailDestinataireRelance(d);
    if (cle === 'appelFonds') return renderAppelFondsDossier(d);
    if (cle === 'fondsRecus') return renderFondsRecus(d);
    if (cle === 'agenda') return renderNoterAgenda(d);
    if (cle === 'questionnaire') return renderQuestionnaireSatisfaction(d);
    if (cle === 'copieActe') return renderEnvoiCopieActe(d);
    if (!avecDestinataire) return '';
    return renderLigneEmailDossier(d, cle);
  }

  // Onglet Échanges de la fiche : le destinataire (client, ou confrère quand un autre office
  // représente l'acquéreur), puis ce qui sert À CE STADE du dossier en lignes d'action (même forme
  // que « À faire »), puis le reste replié.
  function renderEchangesDossier(d) {
    const notaireParticipant = notaireParticipantRepresenteAcquereur(d);
    const { stade, utiles, autres } = echangesSelonStade(d, isoAujourdhuiLocal());
    const lignes = (cles) => cles.map(c => renderLigneEchange(d, c)).filter(Boolean);
    const lignesUtiles = lignes(utiles);
    const lignesAutres = lignes(autres);
    const hint = emailDestinataireRelance(d)
      ? (notaireParticipant ? 'Adressé au notaire de l’acquéreur.' : '')
      : (notaireParticipant
        ? 'Renseignez l’email du confrère (ci-dessus) pour écrire : l’acquéreur a son propre notaire.'
        : 'Renseignez l’email de l’acquéreur pour écrire.');
    return `<div class="echanges-groupe">
        <div class="echanges-tete">
          <span class="section-eyebrow">${notaireParticipant ? 'Échanges avec le confrère' : 'Échanges avec le client'}</span>
          <span class="echanges-stade" title="Stade du dossier, lu dans ses dates">${escapeHtml(STADES_DOSSIER[stade])}</span>
        </div>
        <div class="echanges-destinataire">
          ${renderCoordonneesEchanges(d)}
          ${hint ? `<p class="hint">${hint}</p>` : ''}
        </div>
        ${renderAppelsDossier(d)}
        ${renderEmailsDossier(d)}
        ${renderSondageDossier(d)}
        ${lignesUtiles.length ? `<ul class="ja-liste">${lignesUtiles.join('')}</ul>` : '<p class="fiche-vide">Rien à envoyer à ce stade.</p>'}
      </div>
      ${lignesAutres.length ? `<details class="echanges-autres">
        <summary>Hors de ce stade (${lignesAutres.length})</summary>
        <ul class="ja-liste">${lignesAutres.join('')}</ul>
      </details>` : ''}`;
  }

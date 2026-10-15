  // ---- Courriers d'interrogation d'une succession (étude 15/10) ----
  // Neuf modèles de l'étude (commun/courriers-succession.js) sur le papier à en-tête de l'office (courrierRenduAgent, client/65) :
  // fenêtre « Courriers d'interrogation » ouverte depuis la fiche d'une succession. Le bloc du défunt se saisit une fois et reste
  // sur la fiche (d.defunt) pour les neuf courriers. Rien ne part tout seul : Word à télécharger, ou rangé dans le dossier du NAS.

  var courrierSuccessionEtat = null;

  // Pure : le défunt gardé sur la fiche, avec les champs absents ramenés à ''.
  function defuntFicheSuccession(d) {
    const x = (d && d.defunt) || {};
    const t = (v) => (typeof v === 'string' ? v : '');
    return { civilite: t(x.civilite) || 'Madame', prenoms: t(x.prenoms), nom: t(x.nom), domicile: t(x.domicile), naissanceDate: t(x.naissanceDate),
      naissanceLieu: t(x.naissanceLieu), decesDate: t(x.decesDate), decesLieu: t(x.decesLieu), conjointLien: t(x.conjointLien), conjointNom: t(x.conjointNom) };
  }

  function fermerCourriersSuccession() {
    const o = document.getElementById('courriers-succession-overlay');
    if (o) o.style.display = 'none';
    courrierSuccessionEtat = null;
  }

  function ouvrirCourriersSuccession(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    let overlay = document.getElementById('courriers-succession-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.id = 'courriers-succession-overlay';
      overlay.setAttribute('onmousedown', "if (event.target === this) this.dataset.fond = '1'");
      overlay.setAttribute('onclick', "if (event.target === this && this.dataset.fond === '1') fermerCourriersSuccession(); this.dataset.fond = ''");
      overlay.innerHTML = '<div class="confirm-box nas-choix-box" role="dialog" aria-modal="true" aria-label="Courriers d’interrogation de la succession"><div id="courriers-succession-contenu"></div></div>';
      document.body.appendChild(overlay);
    }
    courrierSuccessionEtat = { id, modele: MODELES_COURRIER_SUCCESSION[0].cle, rendu: '' };
    overlay.style.display = 'flex';
    renderCourriersSuccession();
  }

  function renderCourriersSuccession() {
    const zone = document.getElementById('courriers-succession-contenu');
    const e = courrierSuccessionEtat;
    const d = e && dossiers.find(x => x.id === e.id);
    if (!zone || !d) return;
    const df = defuntFicheSuccession(d);
    const champ = (idc, libelle, valeur, type, placeholder) => `<label class="reglages-champ"><span>${libelle}</span><input type="${type || 'text'}" id="cs-${idc}" class="prop-champ" value="${escapeAttr(valeur)}" placeholder="${escapeAttr(placeholder || '')}"></label>`;
    const modeleActuel = modeleCourrierSuccession(e.modele);
    zone.innerHTML = `
      <h3>Courriers d’interrogation — ${escapeHtml(libelleDossierAffiche(d))}</h3>
      <p class="hint">Le défunt se saisit une fois ; il reste sur la fiche pour tous les courriers.</p>
      <label class="reglages-champ"><span>Civilité</span><select id="cs-civilite" class="prop-champ"><option${df.civilite === 'Madame' ? ' selected' : ''}>Madame</option><option${df.civilite === 'Monsieur' ? ' selected' : ''}>Monsieur</option></select></label>
      ${champ('prenoms', 'Prénoms', df.prenoms, 'text', 'Alice Marcelle')}
      ${champ('nom', 'Nom', df.nom, 'text', 'FRA')}
      ${champ('domicile', 'Domicile', df.domicile, 'text', 'BRACIEUX (41250), 31 rue …')}
      ${champ('naissance-date', 'Date de naissance', df.naissanceDate, 'date')}
      ${champ('naissance-lieu', 'Lieu de naissance', df.naissanceLieu, 'text', 'SAINT SOUPLET (59360)')}
      ${champ('deces-date', 'Date de décès', df.decesDate, 'date')}
      ${champ('deces-lieu', 'Lieu de décès', df.decesLieu, 'text', 'BRACIEUX (41250)')}
      <label class="reglages-champ"><span>Situation</span><select id="cs-conjoint-lien" class="prop-champ">${['', 'Veuve de', 'Veuf de', 'Épouse de', 'Époux de', 'Divorcée de', 'Divorcé de'].map(l => `<option value="${escapeAttr(l)}"${df.conjointLien === l ? ' selected' : ''}>${l || '— (aucune ligne)'}</option>`).join('')}</select></label>
      ${champ('conjoint-nom', 'Conjoint', df.conjointNom, 'text', 'Monsieur Maurice Charles FISCHER')}
      <hr>
      <label class="reglages-champ"><span>Courrier</span><select id="cs-modele" class="prop-champ" onchange="changerModeleCourrierSuccession(this.value)">${MODELES_COURRIER_SUCCESSION.map(m => `<option value="${escapeAttr(m.cle)}"${m.cle === e.modele ? ' selected' : ''}>${escapeHtml(m.libelle)}</option>`).join('')}</select></label>
      <label class="reglages-champ"><span>Destinataire (une ligne par ligne d’adresse)</span><textarea id="cs-destinataire" class="prop-champ" rows="4" placeholder="Nom de l’organisme, adresse…">${escapeHtml(modeleActuel ? modeleActuel.destinataire.join('\n') : '')}</textarea></label>
      <label class="reglages-option"><span>« Envoi par mail » sous l’adresse</span><wa-switch id="cs-mail" checked></wa-switch></label>
      <div class="confirm-actions">
        <wa-button appearance="outlined" class="btn-annuler" onclick="fermerCourriersSuccession()">Fermer</wa-button>
        <wa-button variant="brand" onclick="creerCourrierSuccession()">Créer le courrier (Word)</wa-button>
      </div>
      <p class="hint" id="cs-message">${escapeHtml(e.message || '')}</p>
      <div class="reglages-actions" id="cs-boutons">${e.rendu ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="telechargerRenduAgent('${escapeOnclickArg(e.rendu)}')">Télécharger (Word)</wa-button>${d.nasDossier ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="rangerRenduAgent('${escapeOnclickArg(e.rendu)}')">Ranger dans le dossier du NAS</wa-button>` : ''}` : ''}</div>`;
  }

  // Le modèle change : le destinataire par défaut du modèle remplace la zone (une saisie à la main n'est pas conservée d'un modèle à l'autre).
  function changerModeleCourrierSuccession(cle) {
    if (!courrierSuccessionEtat) return;
    courrierSuccessionEtat.modele = cle;
    courrierSuccessionEtat.rendu = '';
    courrierSuccessionEtat.message = '';
    const zone = document.getElementById('cs-destinataire');
    const m = modeleCourrierSuccession(cle);
    if (zone && m) zone.value = m.destinataire.join('\n');
    const b = document.getElementById('cs-boutons');
    if (b) b.innerHTML = '';
  }

  async function creerCourrierSuccession() {
    const e = courrierSuccessionEtat;
    const d = e && dossiers.find(x => x.id === e.id);
    if (!d) return;
    const val = (idc) => { const c = document.getElementById('cs-' + idc); return c ? String(c.value || '').trim() : ''; };
    const defunt = { civilite: val('civilite'), prenoms: val('prenoms'), nom: val('nom'), domicile: val('domicile'), naissanceDate: val('naissance-date'),
      naissanceLieu: val('naissance-lieu'), decesDate: val('deces-date'), decesLieu: val('deces-lieu'), conjointLien: val('conjoint-lien'), conjointNom: val('conjoint-nom') };
    const message = document.getElementById('cs-message');
    if (!defunt.nom) { if (message) message.textContent = 'Le nom du défunt est nécessaire.'; return; }
    d.defunt = defunt;
    sauvegarder(d);
    const destinataire = val('destinataire').split('\n').map(l => l.trim()).filter(Boolean);
    const mail = document.getElementById('cs-mail');
    const contenu = contenuCourrierSuccession(e.modele, { destinataire, envoiParMail: !!(mail && mail.checked), dateIso: isoAujourdhuiLocal(), defunt,
      suiviPar: d.responsable || '', referenceAuthentic: d.referenceAuthentic || '' });
    let blob;
    try { blob = await courrierRenduAgent(contenu, d); }
    catch (err) { noterVerificationPoste('courrier-succession-word', { ok: false, message: 'courrier Word impossible' }); if (message) message.textContent = 'Document Word impossible à fabriquer sur ce poste (bibliothèque en ligne injoignable ?).'; return; }
    const titre = nomFichierCourrierSuccession(e.modele, libelleDossierAffiche(d));
    const idRendu = 'courrier-' + Date.now().toString(36);
    rendusAgent[idRendu] = { blob, nom: nomFichierRenduAgent(titre), titre, dossierId: d.id, range: '' };
    const ids = Object.keys(rendusAgent);
    ids.slice(0, Math.max(0, ids.length - MAX_RENDUS_AGENT)).forEach(k => { delete rendusAgent[k]; });
    noterVerificationPoste('courrier-succession-word', { detail: (modeleCourrierSuccession(e.modele) || {}).libelle || e.modele });
    e.rendu = idRendu;
    e.message = 'Courrier prêt, sur le papier de l’office.';
    ajouterHistorique(d, `Courrier d’interrogation créé : ${(modeleCourrierSuccession(e.modele) || {}).libelle || e.modele}`);
    sauvegarder(d);
    renderCourriersSuccession();
  }

  // ---- Widget « Nouveautés » du tableau de bord (étude 18/10 : « un widget nouveauté qui met la dernière nouveauté majeure de
  // CLAIRE avec la date et le numéro de version, et la possibilité de naviguer pour remonter dans le temps » ; puis « sous forme de
  // liste synthétique, laisse les 10 dernières, et rends ça plus sympa ») ----
  // Une nouveauté = une version dont le MINEUR augmente (CORRECTIF à 0 : « 0.287.0 »), d'après HISTORIQUE_VERSIONS ; les correctifs
  // n'y figurent pas. Les 10 dernières seulement. Petit par défaut, à la place de « Dossiers ouverts ».
  var NOMBRE_NOUVEAUTES_WIDGET = 10;

  // Pure : les nouveautés, la plus récente d'abord — [{ version, date, resume }], `max` au plus.
  function nouveautesClaire(historique, max) {
    const l = (Array.isArray(historique) ? historique : []).filter(h => h && /^\d+\.\d+\.0$/.test(String(h.version || '')) && h.resume);
    return max ? l.slice(0, max) : l;
  }

  // Pure : « 18 oct. 2026 » d'une date « AAAA-MM-JJ HH:MM ».
  function dateNouveaute(date) {
    const iso = String(date || '').slice(0, 10);
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Pure : le résumé d'une nouveauté en liste courte — une puce par phrase (ou par morceau séparé par « ; »), chacune
  // { sujet, texte } (« Constitution : … » → sujet « Constitution »), coupée à `longueur` caractères ; `max` puces au plus,
  // `reste` = combien n'ont pas été montrées.
  function pointsNouveaute(resume, max, longueur) {
    const lim = longueur || 110;
    const morceaux = decouperResumeNouveaute(String(resume || '').replace(/\s+/g, ' '))
      .map(t => t.trim().replace(/[.;]\s*$/, '')).filter(t => t.length > 2);
    const points = morceaux.map(t => {
      const m = /^([^:«»()]{2,40}?)\s:\s(.+)$/.exec(t);
      let sujet = m ? m[1] : '';
      let texte = m ? m[2] : t;
      if (texte.length > lim) {
        texte = texte.slice(0, lim).replace(/\s+\S*$/, '');
        // Jamais une parenthèse ou des guillemets ouverts sans fin (relecture 0.288.0) : la coupe recule avant eux.
        const ouv = Math.max(texte.lastIndexOf('('), texte.lastIndexOf('«'));
        if (ouv > 20 && ouv > Math.max(texte.lastIndexOf(')'), texte.lastIndexOf('»'))) texte = texte.slice(0, ouv).trim();
        texte += '…';
      }
      texte = texte.charAt(0).toUpperCase() + texte.slice(1);
      return { sujet, texte };
    });
    const n = max || points.length;
    return { points: points.slice(0, n), reste: Math.max(0, points.length - n) };
  }

  // Pure : les phrases d'un résumé, coupées après « . ! ? » suivi d'une majuscule, ou sur « ; » — jamais à l'intérieur d'une
  // parenthèse ni de guillemets, ni après une lettre seule ou une abréviation (« M. », « p. », « n°. », « Mme. ») — relecture 0.288.0.
  function decouperResumeNouveaute(t) {
    const out = [];
    let debut = 0, prof = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '(' || c === '«') prof++;
      else if ((c === ')' || c === '»') && prof > 0) prof--;
      if (prof) continue;
      const finPhrase = /[.!?]/.test(c) && t[i + 1] === ' ' && /[A-ZÀ-Ý«]/.test(t[i + 2] || '')
        && !/(?:^|[\s(«])(?:\p{L}|Mme|Me|M|n°|cf|etc)$/u.test(t.slice(Math.max(0, i - 4), i));
      const pointVirgule = c === ';' && t[i - 1] === ' ' && t[i + 1] === ' ';
      if (finPhrase || pointVirgule) { out.push(t.slice(debut, pointVirgule ? i - 1 : i + 1)); debut = i + 1; }
    }
    out.push(t.slice(debut));
    return out;
  }

  var nouveauteAffichee = 0;   // 0 = la plus récente ; + 1 = remonter dans le temps

  function renderWidgetNouveautes() {
    const bloc = document.getElementById('kpi-nouveautes');
    if (!bloc) return;
    const liste = nouveautesClaire(typeof HISTORIQUE_VERSIONS !== 'undefined' ? HISTORIQUE_VERSIONS : [], NOMBRE_NOUVEAUTES_WIDGET);
    if (!liste.length) { bloc.innerHTML = ''; return; }
    nouveauteAffichee = Math.min(Math.max(0, nouveauteAffichee), liste.length - 1);
    const n = liste[nouveauteAffichee];
    const presentation = presentationWidget('nouveautes');
    const { points, reste } = pointsNouveaute(n.resume, presentation === 'petit' ? 4 : 8, presentation === 'petit' ? 80 : 130);
    const fleche = (pas, ic, titre, inactif) => `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" data-pas="${pas}" onclick="naviguerNouveautes(${pas})"${inactif ? ' disabled' : ''} title="${titre}" aria-label="${titre}">${icone(ic)}</wa-button>`;
    const pastilles = liste.map((x, i) => `<button type="button" class="nv-pastille${i === nouveauteAffichee ? ' actif' : ''}" onclick="allerNouveaute(${i})" title="${escapeAttr(x.version + ' · ' + dateNouveaute(x.date))}" aria-label="${escapeAttr('Nouveauté ' + x.version)}"${i === nouveauteAffichee ? ' aria-current="true"' : ''}></button>`).reverse().join('');
    bloc.innerHTML = carteWidget({
      presentation, classe: 'nouveautes',
      titre: `<span class="nv-titre-icone" aria-hidden="true">${icone('sparkle')}</span>Nouveautés`,
      sous: `<span class="nv-version">v${escapeHtml(n.version)}</span><span class="nv-date">${escapeHtml(dateNouveaute(n.date))}</span>${nouveauteAffichee === 0 ? '<span class="nv-derniere">Dernière mise à jour</span>' : ''}`,
      droite: `<span class="nv-nav">${fleche(1, 'chevron-left', 'Nouveauté précédente', nouveauteAffichee >= liste.length - 1)}${fleche(-1, 'chevron-right', 'Nouveauté suivante', nouveauteAffichee === 0)}</span>`,
      corps: `<ul class="nv-points">${points.map(p => `<li>${p.sujet ? `<strong>${escapeHtml(p.sujet)}</strong> ` : ''}${escapeHtml(p.texte)}</li>`).join('')}</ul>
        ${reste ? `<div class="nv-reste w-fixe" title="${escapeAttr(n.resume)}">+ ${reste} autre${reste > 1 ? 's' : ''} point${reste > 1 ? 's' : ''}</div>` : ''}
        <div class="nv-pastilles w-fixe" role="group" aria-label="Les ${liste.length} dernières nouveautés">${pastilles}</div>`
    });
  }

  // Le focus reste sur la flèche (relecture 0.288.0 : le bloc est redessiné, il retombait sur la page) — sur l'autre si celle-ci
  // est devenue inactive au bout de la liste.
  function naviguerNouveautes(pas) {
    nouveauteAffichee += pas;
    renderWidgetNouveautes();
    const bloc = document.getElementById('kpi-nouveautes');
    const meme = bloc && bloc.querySelector(`[data-pas="${pas > 0 ? 1 : -1}"]`);
    const autre = bloc && bloc.querySelector(`[data-pas="${pas > 0 ? -1 : 1}"]`);
    const cible = meme && !meme.hasAttribute('disabled') ? meme : autre;
    if (cible) Promise.resolve(cible.updateComplete).then(() => cible.focus());
  }

  function allerNouveaute(i) {
    nouveauteAffichee = i;
    renderWidgetNouveautes();
    const p = document.querySelector('#kpi-nouveautes .nv-pastille.actif');
    if (p) p.focus();
  }

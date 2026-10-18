  // ---- Widget « Nouveautés » du tableau de bord (étude 18/10 : « un widget nouveauté qui met la dernière nouveauté majeure de
  // CLAIRE avec la date et le numéro de version, et la possibilité de naviguer pour remonter dans le temps ») ----
  // Une nouveauté = une version dont le MINEUR augmente (CORRECTIF à 0 : « 0.287.0 »), d'après HISTORIQUE_VERSIONS ; les correctifs
  // n'y figurent pas. Petit par défaut, à la place de « Dossiers ouverts ».

  // Pure : les nouveautés, la plus récente d'abord — [{ version, date, resume }].
  function nouveautesClaire(historique) {
    return (Array.isArray(historique) ? historique : []).filter(h => h && /^\d+\.\d+\.0$/.test(String(h.version || '')) && h.resume);
  }

  // Pure : « 18 oct. 2026 » d'une date « AAAA-MM-JJ HH:MM ».
  function dateNouveaute(date) {
    const iso = String(date || '').slice(0, 10);
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  var nouveauteAffichee = 0;   // 0 = la plus récente ; + 1 = remonter dans le temps

  function renderWidgetNouveautes() {
    const bloc = document.getElementById('kpi-nouveautes');
    if (!bloc) return;
    const liste = nouveautesClaire(typeof HISTORIQUE_VERSIONS !== 'undefined' ? HISTORIQUE_VERSIONS : []);
    if (!liste.length) { bloc.innerHTML = ''; return; }
    nouveauteAffichee = Math.min(Math.max(0, nouveauteAffichee), liste.length - 1);
    const n = liste[nouveauteAffichee];
    const presentation = presentationWidget('nouveautes');
    const nav = `<span class="nv-nav">
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone" data-pas="1" onclick="naviguerNouveautes(1)"${nouveauteAffichee >= liste.length - 1 ? ' disabled' : ''} title="Nouveauté précédente" aria-label="Nouveauté précédente">${icone('chevron-left')}</wa-button>
        <span class="nv-rang" aria-live="polite">${nouveauteAffichee + 1}/${liste.length}</span>
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone" data-pas="-1" onclick="naviguerNouveautes(-1)"${nouveauteAffichee === 0 ? ' disabled' : ''} title="Nouveauté suivante" aria-label="Nouveauté suivante">${icone('chevron-right')}</wa-button>
      </span>`;
    bloc.innerHTML = carteWidget({
      presentation, classe: 'nouveautes',
      titre: 'Nouveautés',
      sous: `<span class="nv-version">${escapeHtml(n.version)}</span> · ${escapeHtml(dateNouveaute(n.date))}${nouveauteAffichee === 0 && presentation !== 'petit' ? ' <span class="nv-derniere">la dernière</span>' : ''}`,
      droite: nav,
      corps: `<p class="nv-texte">${escapeHtml(n.resume)}</p>`
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

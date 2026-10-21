  // ---- Réglages › Rappels : délais des rappels, pour les ventes et les successions (étude 21/10) ----
  // « Met moi un réglage pour choisir les délais de rappels pour vente et succession. » Un champ par échéance : les jours AVANT
  // l'échéance où le rappel part (« 15, 7 » = à J-15 puis à J-7, « 0 » = le jour même, vide = aucun rappel). Lus et enregistrés par
  // le serveur (clé `rappels-delais`, GET/PUT /api/reglages/delais-rappels) : c'est lui qui envoie les rappels.

  var delaisRappelsCharges = [];

  function joursDepuisTexteDelais(texte) {
    return String(texte || '').split(/[^0-9]+/).filter(Boolean).map(Number).filter(function (n) { return n >= 0 && n <= 365; });
  }

  function textePourJoursDelais(jours) {
    return (jours || []).join(', ');
  }

  function renderDelaisRappels() {
    var zone = document.getElementById('reglages-delais-rappels');
    if (!zone) return;
    var groupes = [['vente', 'Vente'], ['succession', 'Succession']];
    zone.innerHTML = groupes.map(function (g) {
      var lignes = delaisRappelsCharges.filter(function (e) { return e.groupe === g[0]; });
      if (!lignes.length) return '';
      return `<h4 class="reglages-sous-titre">${escapeHtml(g[1])}</h4>` + lignes.map(function (e) {
        var id = 'reglages-delais-' + e.cle;
        return `<div class="reglages-champ"><div class="reglages-champ-libelle"><label for="${escapeAttr(id)}">${escapeHtml(e.libelle)}</label>`
          + infoBulle('D’origine : ' + (e.defaut.length ? e.defaut.map(function (j) { return j === 0 ? 'le jour même' : 'J-' + j; }).join(', ') : 'aucun rappel') + '.')
          + `</div><input type="text" id="${escapeAttr(id)}" data-delais-cle="${escapeAttr(e.cle)}" inputmode="numeric" autocomplete="off" placeholder="Aucun rappel" value="${escapeAttr(textePourJoursDelais(e.jours))}"></div>`;
      }).join('');
    }).join('');
  }

  async function chargerDelaisRappels() {
    try {
      var reponse = await fetchAvecAuth('/api/reglages/delais-rappels');
      if (!reponse.ok) throw new Error('statut ' + reponse.status);
      delaisRappelsCharges = (await reponse.json()).echeances || [];
      renderDelaisRappels();
    } catch (e) {
      // Session expirée : déjà gérée par fetchAvecAuth ; les champs restent vides, rien n'est enregistré sans lecture réussie.
    }
  }

  async function enregistrerDelaisRappels(retablir) {
    if (!delaisRappelsCharges.length && !retablir) return;
    var delais = {};
    if (!retablir) {
      document.querySelectorAll('#reglages-delais-rappels [data-delais-cle]').forEach(function (champ) {
        delais[champ.getAttribute('data-delais-cle')] = joursDepuisTexteDelais(champ.value);
      });
    }
    try {
      var reponse = await fetchAvecAuth('/api/reglages/delais-rappels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delais: delais })
      });
      if (!reponse.ok) throw new Error('statut ' + reponse.status);
      delaisRappelsCharges = (await reponse.json()).echeances || [];
      renderDelaisRappels();
      afficherToast(retablir ? 'Délais d’origine rétablis.' : 'Délais des rappels enregistrés.');
    } catch (e) {
      afficherToast('Les délais n’ont pas pu être enregistrés.');
    }
  }

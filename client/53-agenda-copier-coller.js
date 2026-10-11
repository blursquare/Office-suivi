  // ---- Copier-coller d'un rendez-vous dans la page Agenda (étude 07/10 : « permettre copie coller de rdv dans agenda » ;
  // choix de l'étude : « créé aussitôt, comme Outlook »). Ctrl+C — ou l'icône « Copier » du détail — sur le rendez-vous
  // sélectionné ; un clic sur une case de la grille, puis Ctrl+V — ou « Coller » sur le créneau surligné — crée la copie dans
  // l'agenda de l'office, sans formulaire. Le message qui suit propose « Annuler » (copie retirée, MoveToDeletedItems).
  // La copie garde le titre, la durée, le lieu, la première catégorie (couleur) et les notes ; elle se colle autant de fois
  // qu'on veut. Une signature d'un dossier se colle « à confirmer » (« ? » au bout du titre, convention de l'étude) : une
  // seconde date « VTE - X » sans « ? » serait lue par le serveur comme le rendez-vous de signature et changerait la fiche. ----
  var agendaPressePapier = null;   // { sujet, lieu, categorie, dureeMinutes, notes, signature, dossierId, itemId }

  // Pure : ce qu'on garde d'un rendez-vous copié ; null pour ce qui ne se copie pas (journée entière, carte fantôme, option
  // d'un sondage).
  function copieRendezVousAgenda(e, notes) {
    if (!e || e.fantome || e.option || e.journeeEntiere || !/^\d{2}:\d{2}$/.test(String(e.heure || ''))) return null;
    const debut = minutesHeure(e.heure);
    const fin = /^\d{2}:\d{2}$/.test(String(e.heureFin || '')) ? minutesHeure(e.heureFin) : debut + 60;
    return {
      sujet: String(e.sujet || '').trim() || 'Rendez-vous',
      lieu: String(e.lieu || '').trim(),
      categorie: Array.isArray(e.categories) && e.categories.length ? String(e.categories[0]) : '',
      dureeMinutes: fin > debut ? Math.min(600, fin - debut) : 60,
      notes: String(notes || ''),
      signature: !!e.signature,
      dossierId: e.dossierId || null,
      itemId: e.itemId || ''
    };
  }

  // Pure : le titre de la copie — celui du rendez-vous, avec « ? » au bout pour une signature (à confirmer).
  function sujetCopieRendezVous(copie) {
    const sujet = String((copie && copie.sujet) || '').trim();
    return copie && copie.signature && !/\?/.test(sujet) ? `${sujet} ?` : sujet;
  }

  function copierRendezVousAgenda(cle) {
    const e = evenementsAffichesAgenda().find(x => cleEvenementAgenda(x) === cle);
    const n = e && e.itemId ? notesAgenda[e.itemId] : null;
    const copie = copieRendezVousAgenda(e, n && n.etat === 'ok' ? n.notes : '');
    if (!copie) { afficherToast('Seul un rendez-vous avec une heure se copie.', 'OK', null); return; }
    agendaPressePapier = copie;
    // Notes pas encore lues : lues maintenant (GetItem, lecture seule), reportées sur la copie si elle est toujours celle-là.
    if (e.itemId && !(n && n.etat === 'ok') && exchangeAgendaPret()) {
      fetchAvecAuth(`/api/exchange/evenement/notes?itemId=${encodeURIComponent(e.itemId)}`)
        .then(r => r.json())
        .then(corps => { if (corps && corps.ok && agendaPressePapier === copie) copie.notes = corps.notes || ''; })
        .catch(() => { /* copie sans les notes */ });
    }
    afficherToast(`« ${copie.sujet} » copié — choisissez une case de l’agenda, puis Ctrl+V (ou « Coller »).`, 'OK', null);
    if (ongletActuel === 'agenda') renderPageAgenda();
  }

  async function collerRendezVousAgenda() {
    const copie = agendaPressePapier;
    const c = agendaCaseChoisie;
    if (!copie) return;
    if (!exchangeAgendaPret()) { afficherToast('Connexion à l’agenda Outlook à activer dans les Réglages pour coller un rendez-vous.', 'OK', null); return; }
    if (!c) { afficherToast('Choisissez d’abord une case de l’agenda (un clic), puis Ctrl+V.', 'OK', null); return; }
    const sujet = sujetCopieRendezVous(copie);
    const d = copie.dossierId ? dossiers.find(x => x.id === copie.dossierId) || null : null;
    agendaCaseChoisie = null;
    renderPageAgenda();
    try {
      const reponse = await fetchAvecAuth('/api/exchange/rendez-vous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sujet, date: c.date, heure: c.heure, dureeMinutes: copie.dureeMinutes, lieu: copie.lieu, categorie: copie.categorie,
          signature: false, dossierId: d ? d.id : null, dossierNom: d ? d.nom : null,
          corps: copie.notes || 'Copie d’un rendez-vous, collée depuis l’agenda de CLAIRE.'
        })
      });
      const corps = await reponse.json();
      if (!corps.ok) {
        noterVerificationPoste('agenda-copier-coller', { ok: false, message: 'création de la copie refusée' });
        afficherToast(corps.message || 'La copie du rendez-vous a échoué.', 'OK', null);
        return;
      }
      const quand = `${dateAvecJourFr(c.date)} à ${c.heure.replace(':', ' h ')}`;
      if (d) {
        ajouterHistorique(d, `Rendez-vous « ${sujet} » copié dans l’agenda de l’office le ${quand}.`);
        sauvegarder(d);
      }
      noterVerificationPoste('agenda-copier-coller', { detail: 'rendez-vous collé dans l’agenda de l’office' });
      afficherToast(`« ${sujet} » collé le ${quand}.${sujet !== copie.sujet ? ' Copie d’une signature : notée « ? », à confirmer.' : ''}`,
        corps.itemId ? 'Annuler' : 'OK', corps.itemId ? () => annulerCollageRendezVous(corps.itemId, corps.changeKey || '', d, sujet, quand) : null);
      chargerAgendaSemaine();
    } catch (err) {
      afficherToast('Serveur injoignable — rendez-vous non collé.', 'OK', null);
    }
  }

  async function annulerCollageRendezVous(itemId, changeKey, d, sujet, quand) {
    try {
      const reponse = await fetchAvecAuth('/api/exchange/evenement/supprimer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, changeKey })
      });
      const corps = await reponse.json();
      if (!corps.ok) { afficherToast(corps.message || 'La copie n’a pas pu être retirée.', 'OK', null); return; }
      agendaEvenements = agendaEvenements.filter(x => x.itemId !== itemId);
      if (d) {
        ajouterHistorique(d, `Copie du rendez-vous « ${sujet} » du ${quand} retirée de l’agenda de l’office.`);
        sauvegarder(d);
      }
      afficherToast('Copie retirée de l’agenda.', 'OK', null);
      if (ongletActuel === 'agenda') renderPageAgenda();
      chargerAgendaSemaine();
    } catch (err) {
      afficherToast('Serveur injoignable — copie non retirée.', 'OK', null);
    }
  }

  // Ctrl+C / Ctrl+V (Cmd sur Mac) dans la page Agenda : jamais pendant une saisie, une fenêtre ouverte, une confirmation, ni
  // quand du texte est sélectionné (la copie de texte du navigateur reste la sienne).
  document.addEventListener('keydown', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey || ev.defaultPrevented) return;
    const touche = String(ev.key || '').toLowerCase();
    if (touche !== 'c' && touche !== 'v') return;
    if (!ecranAffiche('agenda') || agendaModale || notesAgendaEdition) return;
    const cible = ev.target;
    if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName || ''))) return;
    if (document.querySelector('#confirm-overlay[style*="flex"]')) return;
    if (touche === 'c') {
      const sel = window.getSelection ? String(window.getSelection() || '') : '';
      if (sel.trim() || !agendaSelection) return;
      const e = evenementsAffichesAgenda().find(x => cleEvenementAgenda(x) === agendaSelection);
      if (!copieRendezVousAgenda(e)) return;
      ev.preventDefault();
      copierRendezVousAgenda(agendaSelection);
    } else {
      if (!agendaPressePapier) return;
      ev.preventDefault();
      collerRendezVousAgenda();
    }
  });

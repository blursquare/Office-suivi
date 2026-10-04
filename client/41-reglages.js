  // ==== RÉGLAGES : rappels automatiques par email ====
  //
  // Remplace le DÉCLENCHEMENT AUTOMATIQUE des rappels (voir server/src/jobs/rappels.js) — le
  // rappel générique par email ("Rappel email" sur la fiche dossier, `ouvrirEmailRappel()`) a
  // depuis été retiré définitivement, à la demande de l'étude : ces rappels automatiques, avec
  // copie systématique vers `copieEmail`, couvrent désormais ce besoin sans geste manuel. L'étude
  // a explicitement demandé un écran dans la sidebar pour saisir elle-même ces réglages, plutôt
  // qu'un tableau figé dans le code ou un fichier de configuration à éditer à la main.
  //
  // TROISIÈME architecture d'envoi, et la seule en service (voir server/src/envoiEmail.js pour le
  // détail) : CLAIRE envoie elle-même un email SMTP vers une boîte-passerelle, dont l'ARRIVÉE
  // déclenche le flux Power Automate qui poste ensuite le message dans Teams. Le déclencheur HTTP
  // des deux versions précédentes n'existe plus — d'où la disparition du champ « URL du flux » de
  // cet écran, remplacé par le serveur d'envoi SMTP et la boîte-passerelle.
  //
  // Le mot de passe SMTP (quand l'étude en pose un — l'envoi direct Microsoft 365 n'en demande
  // aucun) ne redescend JAMAIS ici : la route renvoie `smtpMotDePasseEnregistre`, un simple
  // booléen. Le champ reste donc vide à l'ouverture, et n'est envoyé au serveur que si quelqu'un y
  // tape réellement quelque chose — sans quoi un enregistrement ordinaire l'effacerait.
  //
  // `copieEmail` (adresse recevant une copie de CHAQUE rappel envoyé, quel que soit le
  // responsable destinataire) a été ajoutée sur une demande antérieure : l'étude veut être tenue
  // au courant de tous les envois, pas seulement ceux qui lui sont personnellement adressés en
  // tant que responsable d'un dossier. Envoyée par `executerTacheRappels()` en plus du
  // destinataire habituel, jamais à sa place — un échec d'envoi de la copie n'empêche jamais le
  // rappel principal d'être marqué comme envoyé (voir jobs/rappels.js).
  //
  // Liste fermée des 3 responsables (voir CLAUDE.md, "Responsables du dossier : liste fermée") —
  // reprise ici telle quelle plutôt que de refactoriser les <select> existants du formulaire/de la
  // fiche dossier, qui n'ont pas besoin de cette liste sous forme de variable.
  var RESPONSABLES = ['Bastien ANGLUMENT', 'Julie VASSELIN', 'Jérémy SAUJOT'];

  // Seul transport d'envoi proposé depuis l'écran Réglages : un compte Gmail avec mot de passe
  // d'application, port 587 en STARTTLS. Microsoft 365 est écarté (pas de droits d'administration
  // pour autoriser le SMTP authentifié, et le SPF du domaine interdit l'envoi sans compte).
  var GMAIL_SMTP = { hote: 'smtp.gmail.com', port: 587, securise: false };

  // Réglages tels qu'ils sont ENREGISTRÉS côté serveur (dernière lecture ou dernier enregistrement).
  // Le bouton « Tester » envoie à l'adresse enregistrée, pas à celle du champ : il doit donc savoir
  // si les deux diffèrent, sans quoi on teste une adresse que personne ne voit plus à l'écran.
  let reglagesEnregistres = { emailPasserelle: '', emailsResponsables: {} };

  // Contrôle d'une adresse AVANT le message de test (pure, testable). Deux niveaux :
  // - `erreur` : l'adresse ne peut pas être une adresse email — rien n'est envoyé ;
  // - `avertissement` : l'adresse est bien formée mais son domaine diffère de celui de la
  //   boîte-passerelle. C'est la faute qu'aucun contrôle de format ne voit (« notaire.fr » pour
  //   « notaires.fr ») et qui ne se révèle qu'au bout de la chaîne, dans l'erreur du flux Power
  //   Automate. Un simple avertissement : un locataire Microsoft 365 peut porter plusieurs domaines.
  function controlerAdresseEnvoi(adresse, adresseReference) {
    const a = typeof adresse === 'string' ? adresse.trim() : '';
    if (!a) return { erreur: 'Aucune adresse enregistrée.' };
    if (/\s/.test(a)) return { erreur: `« ${a} » contient une espace.` };
    if (!/^[^@]+@[^@]+$/.test(a)) return { erreur: `« ${a} » doit contenir un seul @.` };
    const [local, domaine] = a.split('@');
    if (!local) return { erreur: `« ${a} » : rien avant le @.` };
    if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(domaine)) {
      return { erreur: `« ${a} » : le domaine « ${domaine} » n'est pas valide (point manquant, en double ou en fin d'adresse ?).` };
    }
    const ref = typeof adresseReference === 'string' ? adresseReference.trim() : '';
    const domaineRef = ref.includes('@') ? ref.split('@').pop().toLowerCase() : '';
    if (domaineRef && domaine.toLowerCase() !== domaineRef) {
      return { avertissement: `Le domaine « ${domaine} » diffère de celui de la boîte-passerelle (« ${domaineRef} ») : vérifiez l'orthographe.` };
    }
    return {};
  }

  async function chargerReglages() {
    initReglagesNotifNavigateur();
    const version = document.getElementById('reglages-version');
    if (version) version.textContent = VERSION_APP;
    const inter = document.getElementById('reglages-theme-sombre');
    if (inter) inter.checked = document.documentElement.getAttribute('data-theme') === 'dark';
    appliquerAccent(document.documentElement.getAttribute('data-accent') || 'bordeaux', false);
    try {
      const reponse = await fetchAvecAuth('/api/reglages');
      const reglages = await reponse.json();
      document.getElementById('reglages-envoi-actif').checked = !!reglages.emailActif;
      document.getElementById('reglages-passerelle').value = reglages.emailPasserelle || '';
      document.getElementById('reglages-smtp-utilisateur').value = reglages.smtpUtilisateur || '';
      // Jamais la valeur elle-même : le serveur ne la renvoie pas. Le champ reste vide, et son
      // texte d'invite dit si un mot de passe est déjà en place.
      const champSecret = document.getElementById('reglages-smtp-motdepasse');
      champSecret.value = '';
      champSecret.placeholder = reglages.smtpMotDePasseEnregistre
        ? 'Déjà enregistré — laisser vide pour le conserver'
        : '16 caractères';
      document.getElementById('reglages-copie-email').value = reglages.copieEmail || '';
      memoriserReglagesEnregistres(reglages);
      renderReglagesEmails(reglages.emailsResponsables || {}, reglages.fonctionsResponsables || {});
      renderReglages3cx();
      renderReglagesAuthentic();
      document.getElementById('reglages-etat').style.display = 'none';
      chargerDernierTourRappels();
      chargerReglagesAgenda();
      chargerEtatSauvegarde();
      chargerMiseAJour();
      chargerRapportTechnique();
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth (écran de connexion réaffiché).
    }
  }

  // Case à cocher "Notifications sur ce poste" : reflète à la fois le choix de l'étude
  // (localStorage) et l'état RÉEL de la permission navigateur, qui peut avoir été révoquée depuis
  // en dehors de CLAIRE (réglages Chrome) — sans ce second contrôle, la case resterait cochée alors
  // que plus aucune notification ne peut réellement s'afficher.
  function initReglagesNotifNavigateur() {
    const cb = document.getElementById('reglages-notif-navigateur');
    const etat = document.getElementById('reglages-notif-navigateur-etat');
    if (!cb) return;
    const supporte = typeof Notification !== 'undefined';
    cb.disabled = !supporte;
    cb.checked = supporte && notificationsNavigateurActivees() && Notification.permission === 'granted';
    if (etat) {
      etat.textContent = !supporte
        ? "Ce navigateur ne prend pas en charge les notifications."
        : Notification.permission === 'denied'
          ? "Bloquée par le navigateur : à réautoriser via l'icône à gauche de l'adresse."
          : '';
    }
  }

  function basculerNotifNavigateur(active) {
    const etat = document.getElementById('reglages-notif-navigateur-etat');
    if (!active) {
      try { localStorage.removeItem(CLE_LOCALSTORAGE_NOTIF_NAVIGATEUR); } catch (e) { /* pas bloquant */ }
      if (etat) etat.textContent = '';
      return;
    }
    if (typeof Notification === 'undefined') return;
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        try { localStorage.setItem(CLE_LOCALSTORAGE_NOTIF_NAVIGATEUR, '1'); } catch (e) { /* pas bloquant */ }
        if (etat) etat.textContent = '✓ Notifications activées sur ce poste.';
      } else {
        document.getElementById('reglages-notif-navigateur').checked = false;
        if (etat) etat.textContent = "Autorisation refusée — rien ne sera notifié tant qu'elle n'est pas accordée.";
      }
    });
  }

  function memoriserReglagesEnregistres(reglages) {
    reglagesEnregistres = {
      emailPasserelle: (reglages && reglages.emailPasserelle) || '',
      emailsResponsables: (reglages && reglages.emailsResponsables) || {},
      fonctionsResponsables: (reglages && reglages.fonctionsResponsables) || {}
    };
    reglagesSignatureCache = null;
  }

  // Réglages › Signature des emails : la carte de l'office et la bannière Visio, déposées en PNG ou
  // JPEG (demandé par l'étude le 29/09 : « les png seront toujours les mêmes pour les emails envoyés
  // par CLAIRE »). Un aperçu, « Déposer une image », et × pour revenir à la version composée.
  var EMPLACEMENTS_SIGNATURE = [
    { cle: 'carte', libelle: 'Carte de l’office', aide: 'Carte complète (façade, coordonnées, logos), environ 624 × 208 px.' },
    { cle: 'visio', libelle: 'Bannière Visio', aide: '« Pas le temps de passer chez votre notaire ? », environ 620 × 70 px.' }
  ];

  async function renderReglagesSignatureImages(forcer) {
    const zone = document.getElementById('reglages-signature-images');
    if (!zone) return;
    const images = await chargerImagesSignatureDeposees(forcer);
    zone.innerHTML = EMPLACEMENTS_SIGNATURE.map(e => {
      const img = images && images[e.cle];
      return `<div class="signature-image-ligne">
        <div class="signature-image-tete">
          <span class="reglages-option-titre">${e.libelle}</span>
          ${img ? `<button type="button" class="ech-ico ech-ico-suppr" onclick="retirerImageSignature('${e.cle}')" title="Retirer l’image" aria-label="Retirer l’image : ${escapeAttr(e.libelle)}">${icone('x')}</button>` : ''}
        </div>
        ${img
          ? `<img class="signature-image-apercu" src="data:${img.type};base64,${img.base64}" alt="${escapeAttr(e.libelle)}">`
          : `<span class="hint">${e.aide} Aucune image : version composée par CLAIRE.</span>`}
        <input type="file" id="signature-image-${e.cle}" accept="image/png,image/jpeg" hidden onchange="deposerImageSignature('${e.cle}', this)">
        <button type="button" class="bouton-ajout bouton-ajout-court" onclick="document.getElementById('signature-image-${e.cle}').click()">${img ? 'Remplacer l’image' : 'Déposer une image'}</button>
      </div>`;
    }).join('');
  }

  function lireImageFichier(fichier) {
    return new Promise((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onerror = () => reject(new Error('lecture impossible'));
      lecteur.onload = () => {
        const url = String(lecteur.result || '');
        const image = new Image();
        image.onload = () => resolve({ url, largeur: image.naturalWidth, hauteur: image.naturalHeight });
        image.onerror = () => reject(new Error('image illisible'));
        image.src = url;
      };
      lecteur.readAsDataURL(fichier);
    });
  }

  async function deposerImageSignature(cle, input) {
    const fichier = input && input.files && input.files[0];
    if (!fichier) return;
    if (!/^image\/(png|jpeg)$/.test(fichier.type)) { afficherToast('Choisissez une image PNG ou JPEG.', 'OK', null); return; }
    if (fichier.size > 1.5 * 1024 * 1024) { afficherToast('Image trop lourde : 1,5 Mo au plus.', 'OK', null); return; }
    try {
      const { url, largeur, hauteur } = await lireImageFichier(fichier);
      const r = await fetchAvecAuth('/api/signature-images/' + cle, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: fichier.type, base64: url.replace(/^data:[^,]*,/, ''), largeur, hauteur })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erreur || 'enregistrement refusé');
      imagesSignatureDeposees = j;
      await renderReglagesSignatureImages();
      afficherToast('Image enregistrée : elle figure désormais dans les emails préparés par CLAIRE.', 'OK', null);
    } catch (e) {
      afficherToast('Image non enregistrée : ' + e.message, 'OK', null);
    } finally {
      input.value = '';
    }
  }

  function retirerImageSignature(cle) {
    const e = EMPLACEMENTS_SIGNATURE.find(x => x.cle === cle);
    demanderConfirmation(`Retirer l’image « ${e ? e.libelle : cle} » de la signature ?`, async () => {
      try {
        const r = await fetchAvecAuth('/api/signature-images/' + cle, { method: 'DELETE' });
        if (!r.ok) throw new Error('statut ' + r.status);
        imagesSignatureDeposees = await r.json();
        await renderReglagesSignatureImages();
      } catch (err) { afficherToast('Retrait impossible : ' + err.message, 'OK', null); }
    });
  }

  // Adresse de chaque collaborateur (rappels Teams, et adresse de sa carte de signature) et sa
  // fonction, écrite sous son nom dans la signature de ses emails.
  function renderReglagesEmails(emailsResponsables, fonctionsResponsables) {
    const fonctions = fonctionsResponsables || {};
    document.getElementById('reglages-emails-liste').innerHTML = RESPONSABLES.map((nom, i) => `
      <div class="reglages-champ reglages-champ-haut">
        <div class="reglages-champ-libelle"><label for="reglages-email-${i}">${escapeHtml(nom)}</label></div>
        <div class="reglages-champ-pile">
          <div class="reglages-champ-ligne">
            <input type="email" id="reglages-email-${i}" data-responsable="${escapeAttr(nom)}" placeholder="prenom.nom@notaires.fr" value="${escapeAttr(emailsResponsables[nom] || '')}">
            <button type="button" class="secondary" onclick="testerEnvoiResponsable('${escapeOnclickArg(nom)}')">Tester</button>
          </div>
          <input type="text" id="reglages-fonction-${i}" class="reglages-fonction" aria-label="Fonction de ${escapeAttr(nom)} dans la signature" placeholder="Fonction dans la signature : ${escapeAttr(FONCTIONS_SIGNATURE_DEFAUT[nom] || 'Collaborateur')}" value="${escapeAttr(fonctions[nom] || '')}">
          <p class="hint reglages-email-resultat" id="reglages-email-resultat-${i}"></p>
        </div>
      </div>
    `).join('');
  }

  function reglagesFormulaireVersObjet() {
    const emailsResponsables = {};
    const fonctionsResponsables = {};
    RESPONSABLES.forEach((nom, i) => {
      const champ = document.getElementById(`reglages-email-${i}`);
      const valeur = champ ? champ.value.trim() : '';
      if (valeur) emailsResponsables[nom] = valeur;
      const fonction = document.getElementById(`reglages-fonction-${i}`);
      if (fonction && fonction.value.trim()) fonctionsResponsables[nom] = fonction.value.trim();
    });
    const objet = {
      emailActif: document.getElementById('reglages-envoi-actif').checked,
      emailPasserelle: document.getElementById('reglages-passerelle').value.trim(),
      // Gmail uniquement (décision de l'étude) : serveur, port et chiffrement sont fixes, et
      // l'expéditeur reste vide pour que le compte authentifié soit utilisé — Gmail refuse tout
      // autre nom. Le serveur garde un transport SMTP générique, seul ce formulaire est fermé.
      smtpHote: GMAIL_SMTP.hote,
      smtpPort: GMAIL_SMTP.port,
      smtpSecurise: GMAIL_SMTP.securise,
      smtpUtilisateur: document.getElementById('reglages-smtp-utilisateur').value.trim(),
      smtpExpediteur: '',
      copieEmail: document.getElementById('reglages-copie-email').value.trim(),
      emailsResponsables,
      fonctionsResponsables
    };
    // Le mot de passe n'accompagne l'enregistrement QUE si quelqu'un vient d'en taper un : la clé
    // absente veut dire « garde celui qui est en base » (voir assainirReglages côté serveur).
    // Deux exceptions où on l'envoie vide, pour l'effacer explicitement : quand le compte SMTP est
    // lui-même vidé (retour à l'envoi anonyme, un mot de passe orphelin n'aurait plus de sens).
    const secret = document.getElementById('reglages-smtp-motdepasse').value;
    if (secret) objet.smtpMotDePasse = secret;
    else if (!objet.smtpUtilisateur) objet.smtpMotDePasse = '';
    return objet;
  }

  async function enregistrerReglages() {
    const zone = document.getElementById('reglages-etat');
    try {
      const reponse = await fetchAvecAuth('/api/reglages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reglagesFormulaireVersObjet())
      });
      const reglages = await reponse.json();
      memoriserReglagesEnregistres(reglages);
      renderReglagesEmails(reglages.emailsResponsables || {}, reglages.fonctionsResponsables || {});
      zone.style.display = 'flex';
      zone.className = 'analyse-ia-dispo dispo-ok';
      zone.innerHTML = `${icone('check')}Réglages enregistrés.`;
    } catch (e) {
      zone.style.display = 'flex';
      zone.className = 'analyse-ia-dispo dispo-off';
      zone.innerHTML = `${icone('alert-triangle')}Impossible d'enregistrer — vérifiez la connexion au serveur intranet.`;
    }
  }

  // Envoie un message de test à UN collaborateur, avec les réglages déjà ENREGISTRÉS côté serveur
  // (voir routes/reglages.js) — pas ceux du formulaire pas encore validés : on veut vérifier ce que
  // le job de rappels utilisera réellement. Si le formulaire contient une modification non
  // enregistrée, on le signale plutôt que de tester une valeur qui n'est pas encore la bonne.
  function afficherResultatTest(resultat, texte, classe) {
    if (!resultat) return;
    resultat.textContent = texte;
    resultat.className = `hint reglages-email-resultat${classe ? ' ' + classe : ''}`;
  }

  async function testerEnvoiResponsable(nom, malgreAvertissement) {
    const i = RESPONSABLES.indexOf(nom);
    const resultat = document.getElementById(`reglages-email-resultat-${i}`);
    const champ = document.getElementById(`reglages-email-${i}`);
    const saisie = champ ? champ.value.trim() : '';
    const enregistree = (reglagesEnregistres.emailsResponsables[nom] || '').trim();

    // Vérifications AVANT tout envoi : le message part vers l'adresse ENREGISTRÉE, il faut donc
    // d'abord s'assurer que c'est bien celle que l'on a sous les yeux, puis qu'elle tient debout.
    if (saisie !== enregistree) {
      afficherResultatTest(resultat, enregistree
        ? `Adresse modifiée mais pas enregistrée : le test partirait encore vers « ${enregistree} ». Cliquez sur « Enregistrer » d'abord.`
        : "Adresse pas encore enregistrée : cliquez sur « Enregistrer » d'abord.", 'reglages-email-echec');
      return;
    }
    const controle = controlerAdresseEnvoi(enregistree, reglagesEnregistres.emailPasserelle);
    if (controle.erreur) {
      afficherResultatTest(resultat, `${controle.erreur} Rien n'a été envoyé.`, 'reglages-email-echec');
      return;
    }
    const controlePasserelle = controlerAdresseEnvoi(reglagesEnregistres.emailPasserelle, '');
    if (controlePasserelle.erreur) {
      afficherResultatTest(resultat, `Boîte-passerelle : ${controlePasserelle.erreur} Rien n'a été envoyé.`, 'reglages-email-echec');
      return;
    }
    if (controle.avertissement && !malgreAvertissement) {
      if (resultat) {
        resultat.className = 'hint reglages-email-resultat reglages-email-echec';
        resultat.innerHTML = `${escapeHtml(controle.avertissement)} <button type="button" class="lien-dossier-local" onclick="testerEnvoiResponsable('${escapeOnclickArg(nom)}', true)">Envoyer quand même</button>`;
      }
      return;
    }

    afficherResultatTest(resultat, `Envoi du message de test à « ${enregistree} »…`, '');
    try {
      const reponse = await fetchAvecAuth('/api/reglages/tester-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsable: nom })
      });
      const corps = await reponse.json();
      if (!resultat) return;
      if (reponse.ok && corps.ok) {
        // Volontairement pas « ✓ Message reçu » : cette réponse ne dit QUE ceci — le serveur
        // d'envoi a accepté le message. Elle ne prouve ni son arrivée dans la boîte-passerelle,
        // ni le déclenchement du flux, ni le message Teams. Laisser croire l'inverse ferait
        // conclure à tort que la chaîne fonctionne, et chercher le problème au mauvais endroit.
        const destinataire = corps.destinataire || enregistree;
        const passerelle = corps.passerelle || reglagesEnregistres.emailPasserelle;
        // Compte Gmail : la copie rangée dans « Messages envoyés » n'est effacée qu'après un délai,
        // le flux Power Automate devant d'abord lire ce même message. Un échec d'effacement
        // apparaîtra en avertissement dans « Dernier tour de rappels ».
        let copie = '';
        if (corps.copieGmail && corps.copieGmail.differee) {
          copie = ` La copie gardée par Gmail sera effacée dans environ ${corps.copieGmail.delaiHeures || 2} h, une fois le flux passé.`;
        }
        afficherResultatTest(resultat,
          `✓ Remis au serveur d'envoi — boîte-passerelle « ${passerelle} », objet (destinataire Teams) « ${destinataire} ». Vérifiez maintenant dans Teams.${copie}`,
          'reglages-email-ok');
      } else {
        resultat.textContent = corps.erreur || "Échec de l'envoi.";
        resultat.className = 'hint reglages-email-resultat reglages-email-echec';
      }
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth (écran de connexion réaffiché).
    }
  }

  // ---- Compte rendu du dernier tour de rappels (voir server/src/jobs/rappels.js) ----
  // La tâche construisait son `resultat.erreurs` depuis toujours sans que personne ne le lise, et
  // le serveur tourne sans fenêtre : un envoi cassé arrêtait les rappels en silence. Ces deux
  // fonctions sont la seule fenêtre sur cet état.

  // « 2 dus », pas « 2 dûs » : le circonflexe de « dû » ne sert qu'à le distinguer de l'article
  // « du » au masculin singulier, il disparaît au pluriel comme au féminin. Sorti en fonction pure
  // parce que la même phrase est écrite à deux endroits (l'encart et le bandeau de confirmation) —
  // deux copies finiraient par diverger, et c'est un texte que l'étude lit.
  function libelleRappelsTour(envoyes, dus) {
    const n = Number.isFinite(envoyes) && envoyes > 0 ? Math.floor(envoyes) : 0;
    const d = Number.isFinite(dus) && dus > 0 ? Math.floor(dus) : 0;
    const pluriel = n > 1 ? 's' : '';
    return `${n} rappel${pluriel} envoyé${pluriel} sur ${d} ${d > 1 ? 'dus' : 'dû'}`;
  }

  function renderDernierTourRappels(tour) {
    const zone = document.getElementById('reglages-dernier-tour');
    if (!zone) return;
    if (!tour || !tour.at) {
      zone.className = 'reglages-dernier-tour';
      zone.innerHTML = '<p class="hint" style="margin:0;">Aucun tour pour l\'instant.</p>';
      return;
    }
    const quand = new Date(tour.at);
    const quandTexte = isNaN(quand.getTime())
      ? tour.at
      : quand.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    const origine = tour.declenche === 'manuel' ? 'déclenché à la main' : 'tour automatique';
    const erreurs = Array.isArray(tour.erreurs) ? tour.erreurs : [];
    // Un tour sans erreur ET sans envoi n'est pas un problème : la plupart des tours n'ont
    // simplement aucun rappel dû ce jour-là. C'est la présence d'erreurs qui fait basculer en
    // alerte, jamais un compteur à zéro.
    zone.className = 'reglages-dernier-tour ' + (erreurs.length ? 'dernier-tour-alerte' : 'dernier-tour-ok');
    let html = `<div class="dernier-tour-ligne">${icone(erreurs.length ? 'alert-triangle' : 'check')}`;
    html += `<span><strong>${escapeHtml(quandTexte)}</strong> — ${escapeHtml(origine)} · `;
    html += `${escapeHtml(libelleRappelsTour(tour.rappelsEnvoyes, tour.rappelsDus))}.</span></div>`;
    if (erreurs.length) {
      html += '<ul class="dernier-tour-erreurs">' + erreurs.map((e) => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>';
    }
    // Avertissements (copie Gmail non effacée) : les rappels sont partis, l'encart ne passe donc
    // pas en alerte — mais une copie restée chez Google doit se voir.
    const avertissements = Array.isArray(tour.avertissements) ? tour.avertissements : [];
    if (avertissements.length) {
      html += '<ul class="dernier-tour-avertissements">' + avertissements.map((e) => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>';
    }
    zone.innerHTML = html;
  }

  // ---- Agenda de l'office : lecture automatique du calendrier partagé de Sophie par EWS (voir
  // server/src/agendaWatch.js / agendaOffice.js), avec la connexion Exchange de la même rubrique.
  // Un rendez-vous « VTE - NOM DU DOSSIER » remplit le rendez-vous de signature ; une mention
  // « appel de fonds / projet envoyé » dans son lieu reporte la date sur le dossier, jamais si elle
  // est déjà renseignée. ----

  async function chargerReglagesAgenda() {
    try {
      const reponse = await fetchAvecAuth('/api/agenda');
      const corps = await reponse.json();
      if (Array.isArray(corps.absences)) absencesOffice = corps.absences;
      if (corps.agendaDuJour !== undefined) agendaDuJourOffice = corps.agendaDuJour || null;
      renderSourceAgenda(corps.source);
      renderDernierTourAgenda(corps.dernierTour, corps.source);
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth (écran de connexion réaffiché).
    }
  }

  // Le calendrier lu (adresse de la boîte, jamais un identifiant) ou ce qui manque pour le lire.
  function renderSourceAgenda(source) {
    const zone = document.getElementById('reglages-agenda-source');
    if (!zone) return;
    const s = source || {};
    const configuree = Boolean(s.configuree);
    zone.textContent = configuree
      ? (s.calendrier || 'Calendrier du compte de connexion')
      : 'Connexion à configurer ci-dessus';
    zone.className = 'reglages-valeur' + (configuree ? '' : ' reglages-valeur-vide');
    const bouton = document.getElementById('reglages-agenda-lancer');
    if (bouton && !bouton.dataset.enCours) bouton.disabled = !configuree;
  }

  function libelleActionAgenda(action) {
    if (action === 'rendezVousSignature') return 'Rendez-vous de signature';
    return action === 'projetEnvoye' ? 'Envoi projet' : 'Envoi appel de fonds';
  }

  function renderDernierTourAgenda(tour, source) {
    const zone = document.getElementById('reglages-agenda-dernier-tour');
    if (!zone) return;
    if (!tour || !tour.at) {
      zone.className = 'reglages-dernier-tour';
      zone.innerHTML = '<p class="hint" style="margin:0;">Aucune lecture pour l\'instant.</p>';
      return;
    }
    const quand = new Date(tour.at);
    const quandTexte = isNaN(quand.getTime())
      ? tour.at
      : quand.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    const origine = tour.declenche === 'manuel' ? 'déclenché à la main' : 'tour automatique';
    const misAJour = Array.isArray(tour.misAJour) ? tour.misAJour : [];
    const sansCorrespondance = Array.isArray(tour.sansCorrespondance) ? tour.sansCorrespondance : [];
    // En erreur seulement si le calendrier n'a pas pu être lu du tout (identifiants, partage, réseau)
    // — aucune correspondance trouvée n'est pas un problème, c'est le cas normal la plupart du temps.
    const enErreur = !tour.ok && !!tour.erreur;
    zone.className = 'reglages-dernier-tour ' + (enErreur ? 'dernier-tour-alerte' : 'dernier-tour-ok');
    let html = `<div class="dernier-tour-ligne">${icone(enErreur ? 'alert-triangle' : 'check')}`;
    html += `<span><strong>${escapeHtml(quandTexte)}</strong> — ${escapeHtml(origine)} · `;
    html += enErreur
      ? escapeHtml(String(tour.erreur).replace(/\.\s*$/, ''))
      : `${tour.dossiersVerifies} dossier${tour.dossiersVerifies > 1 ? 's' : ''} vérifié${tour.dossiersVerifies > 1 ? 's' : ''}, ${misAJour.length} mis à jour`;
    html += '.</span></div>';
    // Disjoncteur (voir agendaWatch.js) : après un refus d'identifiants, plus aucun tour automatique
    // tant que le mot de passe n'a pas changé — sinon le compte de messagerie serait verrouillé.
    if (source && source.suspendue) {
      html += '<p class="hint" style="margin:6px 0 0;">Lecture automatique suspendue : corrigez le mot de passe ci-dessus, elle reprendra d\'elle-même.</p>';
    }
    // Dates butoir posées (ou retrouvées) dans l'agenda par le serveur à ce tour.
    const posees = Array.isArray(tour.echeancesPosees) ? tour.echeancesPosees : [];
    if (posees.length) {
      html += '<ul class="dernier-tour-erreurs" style="color:inherit;">' + posees.map((p) =>
        `<li>${escapeHtml(libelleDossierParNom(p.dossierNom || '', p.dossierId))} — ${p.type === 'ventebien' ? 'Vente préalable' : 'Obtention du prêt'} ${p.adoptee ? 'retrouvée dans' : 'posée dans'} l'agenda (${escapeHtml(formatDateFr(p.date))})</li>`
      ).join('') + '</ul>';
    }
    if (tour.ok && tour.erreurEcheances) {
      html += `<p class="hint" style="margin:6px 0 0;">Dates butoir non posées : ${escapeHtml(tour.erreurEcheances)}</p>`;
    }
    if (misAJour.length) {
      html += '<ul class="dernier-tour-erreurs" style="color:inherit;">' + misAJour.map((m) =>
        `<li>${escapeHtml(libelleDossierParNom(m.dossierNom || '', m.dossierId))} — ${escapeHtml(libelleActionAgenda(m.action))} (${escapeHtml(formatDateFr(m.dateIso))}${m.ancienneDate ? ', au lieu du ' + escapeHtml(formatDateFr(m.ancienneDate)) : ''})</li>`
      ).join('') + '</ul>';
    }
    // Un rendez-vous de l'agenda qui ne correspond pas à la date saisie à la main sur la fiche :
    // CLAIRE ne l'écrase pas, elle le signale.
    const ecartsRdv = (Array.isArray(tour.dejaRenseignes) ? tour.dejaRenseignes : [])
      .filter((m) => m.action === 'rendezVousSignature' && m.dateFiche);
    if (ecartsRdv.length) {
      html += '<ul class="dernier-tour-avertissements">' + ecartsRdv.map((m) =>
        `<li>${escapeHtml(libelleDossierParNom(m.dossierNom || '', m.dossierId))} — rendez-vous du ${escapeHtml(formatDateFr(m.dateIso))} dans l'agenda, ${escapeHtml(formatDateFr(m.dateFiche))} saisi sur la fiche : la fiche n'est pas modifiée.</li>`
      ).join('') + '</ul>';
    }
    if (sansCorrespondance.length) {
      html += '<ul class="dernier-tour-avertissements">' + sansCorrespondance.map((m) =>
        `<li>« ${escapeHtml(m.reference || '')} » — aucun dossier correspondant trouvé.</li>`
      ).join('') + '</ul>';
    }
    zone.innerHTML = html;
  }

  // Lance un VRAI tour de lecture tout de suite, sans attendre le prochain passage automatique.
  async function lancerTourAgenda() {
    const bouton = document.getElementById('reglages-agenda-lancer');
    const resultat = document.getElementById('reglages-agenda-resultat');
    if (bouton) { bouton.disabled = true; bouton.dataset.enCours = '1'; bouton.textContent = 'Lecture en cours…'; }
    try {
      const reponse = await fetchAvecAuth('/api/agenda/tester', { method: 'POST' });
      const corps = await reponse.json();
      if (resultat) {
        if (reponse.ok && corps.ok) {
          resultat.textContent = `${corps.evenementsLus || 0} rendez-vous lus, ${(corps.misAJour || []).length} dossier(s) mis à jour.`;
          resultat.className = 'hint';
        } else {
          resultat.textContent = corps.erreur || "La lecture de l'agenda a échoué.";
          resultat.className = 'hint reglages-email-resultat reglages-email-echec';
        }
      }
    } catch (e) {
      if (resultat) { resultat.textContent = 'Serveur injoignable.'; resultat.className = 'hint reglages-email-resultat reglages-email-echec'; }
    } finally {
      // Le compte rendu persisté (avec sa date et son origine) n'est disponible qu'en relisant
      // /api/agenda — la réponse de /api/agenda/tester ne porte que le résultat brut du tour.
      if (bouton) { delete bouton.dataset.enCours; bouton.disabled = false; bouton.textContent = 'Tester maintenant'; }
      await chargerReglagesAgenda();
    }
  }

  // ---- Connexion à l'agenda Outlook de l'office (voir server/src/exchange/ews.js) ----
  // CLAIRE enregistre les identifiants de messagerie (le mot de passe ne ressort jamais du serveur)
  // pour créer les rendez-vous de signature dans l'agenda Outlook depuis la fiche dossier.

  // État partagé, chargé au démarrage : la fiche dossier n'affiche le bouton « Créer dans l'agenda »
  // que si la connexion est activée ET configurée (identifiants enregistrés).
  let exchangeReglages = { actif: false, motDePasseEnregistre: false, email: '' };

  function exchangeAgendaPret() {
    return !!(exchangeReglages && exchangeReglages.actif && exchangeReglages.email && exchangeReglages.motDePasseEnregistre);
  }

  // Un Blob (ex. le .docx d'appel de fonds généré côté client) → base64 sans le préfixe data:.
  function blobVersBase64(blob) {
    return new Promise((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resolve(String(lecteur.result || '').replace(/^data:[^,]*,/, ''));
      lecteur.onerror = () => reject(lecteur.error || new Error('lecture du fichier'));
      lecteur.readAsDataURL(blob);
    });
  }

  async function chargerReglagesExchange() {
    try {
      const reponse = await fetchAvecAuth('/api/exchange/reglages');
      const corps = await reponse.json();
      exchangeReglages = corps || { actif: false };
      // Ne remplir les champs que si l'écran Réglages est présent (chargé aussi au démarrage, où il
      // ne l'est peut-être pas encore) et hors saisie en cours.
      const actif = document.getElementById('exchange-actif');
      const email = document.getElementById('exchange-email');
      const url = document.getElementById('exchange-url');
      const partage = document.getElementById('exchange-calendrier-partage');
      const note = document.getElementById('exchange-mdp-note');
      if (actif) actif.checked = !!corps.actif;
      if (email && document.activeElement !== email) email.value = corps.email || '';
      if (url && document.activeElement !== url) url.value = corps.url || '';
      if (partage && document.activeElement !== partage) partage.value = corps.calendrierPartage || '';
      const pageSondage = document.getElementById('exchange-page-sondage');
      if (pageSondage && document.activeElement !== pageSondage) pageSondage.value = corps.pageSondage || '';
      const relaisSondage = document.getElementById('exchange-relais-sondage');
      if (relaisSondage && document.activeElement !== relaisSondage) relaisSondage.value = corps.relaisSondage || '';
      const cats = corps.categoriesRdv || {};
      for (const cle of Object.keys(CATEGORIES_AGENDA)) {
        const champ = document.getElementById(`exchange-cat-${cle}`);
        if (champ && document.activeElement !== champ) champ.value = cats[cle] || '';
      }
      chargerCategoriesAgendaVues();
      if (note) {
        definirInfoBulle(note, corps.motDePasseEnregistre
          ? 'Un mot de passe est déjà enregistré : laisser le champ vide le conserve. Un mot de passe erroné compte comme une tentative échouée — CLAIRE ne réessaie jamais toute seule.'
          : 'Un mot de passe erroné compte comme une tentative échouée. CLAIRE ne réessaie jamais toute seule.');
      }
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth.
    }
  }

  // Noms des catégories Outlook vus dans le flux de l'agenda : proposés dans les champs de couleur,
  // pour ne pas avoir à deviner le nom exact que porte chaque couleur dans la boîte de l'office.
  async function chargerCategoriesAgendaVues() {
    const liste = document.getElementById('exchange-categories-vues');
    const note = document.getElementById('exchange-categories-note');
    if (!liste) return;
    try {
      const corps = await (await fetchAvecAuth('/api/agenda')).json();
      const vues = Array.isArray(corps.categories) ? corps.categories : [];
      liste.innerHTML = vues.map((c) => `<option value="${escapeAttr(c)}"></option>`).join('');
      if (note) {
        definirInfoBulle(note, vues.length
          ? `Catégories vues dans l'agenda de l'office : ${vues.join(', ')}. Un nom que la boîte ne connaît pas s'affiche sans couleur.`
          : "Nom exact de la catégorie dans Outlook. Un nom que la boîte ne connaît pas s'affiche sans couleur.");
      }
    } catch (e) {
      // Sans agenda lu, les champs restent libres.
    }
  }

  // `idResultat` : où dire « Enregistré » (la section Sondages a son propre bouton).
  async function enregistrerReglagesExchange(idResultat) {
    const bouton = document.getElementById('exchange-enregistrer-btn');
    const resultat = document.getElementById(typeof idResultat === 'string' ? idResultat : 'exchange-resultat');
    const actif = document.getElementById('exchange-actif');
    const champEmail = document.getElementById('exchange-email');
    const champMdp = document.getElementById('exchange-motdepasse');
    const champUrl = document.getElementById('exchange-url');
    const champPartage = document.getElementById('exchange-calendrier-partage');
    const corpsEnvoye = {
      actif: !!(actif && actif.checked),
      email: champEmail ? champEmail.value.trim() : '',
      url: champUrl ? champUrl.value.trim() : '',
      calendrierPartage: champPartage ? champPartage.value.trim() : '',
      pageSondage: (document.getElementById('exchange-page-sondage') || { value: '' }).value.trim(),
      relaisSondage: (document.getElementById('exchange-relais-sondage') || { value: '' }).value.trim(),
      categoriesRdv: Object.fromEntries(Object.keys(CATEGORIES_AGENDA).map((cle) => {
        const champ = document.getElementById(`exchange-cat-${cle}`);
        return [cle, champ ? champ.value.trim() : ''];
      }))
    };
    // N'envoyer le mot de passe que s'il a été saisi : un champ vide conserve celui déjà enregistré.
    if (champMdp && champMdp.value) corpsEnvoye.motDePasse = champMdp.value;
    if (bouton) bouton.disabled = true;
    if (resultat) { resultat.textContent = ''; resultat.className = 'hint'; }
    try {
      const reponse = await fetchAvecAuth('/api/exchange/reglages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsEnvoye)
      });
      const corps = await reponse.json();
      exchangeReglages = corps || exchangeReglages;
      if (resultat) { resultat.textContent = 'Enregistré.'; resultat.className = 'hint'; }
      // Vider le champ mot de passe et rafraîchir la note « déjà enregistré ».
      if (champMdp) champMdp.value = '';
      chargerReglagesExchange();
      // Le calendrier lu et la suspension éventuelle de la lecture dépendent de ces identifiants.
      chargerReglagesAgenda();
      render();
    } catch (e) {
      if (resultat) { resultat.textContent = 'Serveur injoignable.'; resultat.className = 'hint reglages-email-resultat reglages-email-echec'; }
    } finally {
      if (bouton) bouton.disabled = false;
    }
  }

  // Teste la connexion (lecture seule). Envoie les identifiants saisis s'ils sont là, sinon le
  // serveur retombe sur ceux enregistrés — ce qui permet de retester une config stockée sans
  // retaper le mot de passe. Ne conserve jamais le mot de passe côté client.
  async function testerConnexionExchange() {
    const bouton = document.getElementById('exchange-tester-btn');
    const resultat = document.getElementById('exchange-resultat');
    const champEmail = document.getElementById('exchange-email');
    const champMdp = document.getElementById('exchange-motdepasse');
    const champUrl = document.getElementById('exchange-url');
    const corpsEnvoye = {};
    if (champEmail && champEmail.value.trim()) corpsEnvoye.email = champEmail.value.trim();
    if (champMdp && champMdp.value) corpsEnvoye.motDePasse = champMdp.value;
    if (champUrl && champUrl.value.trim()) corpsEnvoye.url = champUrl.value.trim();
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Connexion en cours…'; }
    if (resultat) { resultat.textContent = ''; resultat.className = 'hint'; }
    try {
      const reponse = await fetchAvecAuth('/api/exchange/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsEnvoye)
      });
      const corps = await reponse.json();
      if (resultat) {
        resultat.textContent = (corps.ok ? '✓ ' : '') + (corps.message || (corps.ok ? 'Connexion réussie.' : 'Échec de la connexion.'));
        resultat.className = corps.ok ? 'hint' : 'hint reglages-email-resultat reglages-email-echec';
      }
    } catch (e) {
      if (resultat) { resultat.textContent = 'Serveur injoignable.'; resultat.className = 'hint reglages-email-resultat reglages-email-echec'; }
    } finally {
      // Ne jamais garder le mot de passe en mémoire une fois le test fait.
      if (champMdp) champMdp.value = '';
      if (bouton) { bouton.disabled = false; bouton.textContent = 'Tester la connexion'; }
    }
  }

  // ---- Sauvegarde automatique de la base (voir server/src/sauvegarde.js) ----

  let etatSauvegarde = null;

  // Pure et testable : ce que l'écran dit de l'état des sauvegardes. `niveau` : 'ok', 'alerte'
  // (en retard ou échec — c'est lui qui fait aussi apparaître le bandeau du Tableau de bord), ou
  // 'neutre' (fonction sans objet, ou première sauvegarde pas encore faite). `emplacement` dit où
  // partent les copies, et signale un dossier local qui ne protège pas d'une panne du disque.
  function messageEtatSauvegarde(etat) {
    if (!etat || !etat.actif) return { niveau: 'neutre', titre: 'Sauvegarde sans objet ici (base en mémoire).', detail: '', emplacement: '' };
    const dest = etat.destination || {};
    const emplacement = dest.locale
      ? `Copies rangées sur ce poste (${dest.dossier}) : choisissez un dossier du NAS ci-dessous.`
      : `Copies rangées dans ${dest.dossier}.`;
    const t = etat.derniereTentative;
    const jours = etat.joursDepuisDerniere;
    const seuil = etat.joursAvantAlerte || 3;
    if (!etat.derniereReussie) {
      if (t && !t.ok) return { niveau: 'alerte', titre: 'La sauvegarde n\'a jamais réussi.', detail: t.erreur || '', emplacement };
      return { niveau: 'neutre', titre: 'Première sauvegarde dans quelques minutes (ou « Sauvegarder maintenant »).', detail: '', emplacement };
    }
    const quand = new Date(etat.derniereReussie);
    const quandTexte = isNaN(quand.getTime()) ? etat.derniereReussie : quand.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    const nb = t && t.ok && Number.isFinite(t.nbDossiers) ? ` — ${t.nbDossiers} dossier${t.nbDossiers > 1 ? 's' : ''}` : '';
    if (t && !t.ok) {
      return { niveau: 'alerte', titre: `Dernière sauvegarde réussie : ${quandTexte}. La suivante a échoué.`, detail: t.erreur || '', emplacement };
    }
    if (Number.isFinite(jours) && jours >= seuil) {
      return { niveau: 'alerte', titre: `Aucune sauvegarde depuis ${jours} jours (dernière : ${quandTexte}).`, detail: 'Le serveur était-il arrêté ?', emplacement };
    }
    return { niveau: 'ok', titre: `Dernière sauvegarde : ${quandTexte}${nb}.`, detail: '', emplacement };
  }

  function renderEtatSauvegarde() {
    const zone = document.getElementById('reglages-sauvegarde-etat');
    if (zone && etatSauvegarde) {
      const m = messageEtatSauvegarde(etatSauvegarde);
      zone.className = 'reglages-dernier-tour' + (m.niveau === 'ok' ? ' dernier-tour-ok' : m.niveau === 'alerte' ? ' dernier-tour-alerte' : '');
      zone.innerHTML = `<div class="dernier-tour-ligne">${icone(m.niveau === 'alerte' ? 'alert-triangle' : m.niveau === 'ok' ? 'check' : 'info')}<span><strong>${escapeHtml(m.titre)}</strong>${m.detail ? ' ' + escapeHtml(m.detail) : ''}</span></div>`
        + (m.emplacement ? `<p class="hint" style="margin:6px 0 0;">${escapeHtml(m.emplacement)}</p>` : '');
    }
    const champ = document.getElementById('reglages-sauvegarde-dossier');
    if (champ && etatSauvegarde && document.activeElement !== champ) champ.value = etatSauvegarde.dossier || '';
    renderAlerteSauvegardeDashboard();
  }

  function renderAlerteSauvegardeDashboard() {
    const zone = document.getElementById('dash-alerte-sauvegarde');
    if (!zone) return;
    const m = etatSauvegarde ? messageEtatSauvegarde(etatSauvegarde) : null;
    if (!m || m.niveau !== 'alerte') { zone.style.display = 'none'; zone.innerHTML = ''; return; }
    zone.style.display = '';
    zone.innerHTML = `${icone('alert-triangle')}<span><strong>Sauvegarde de la base :</strong> ${escapeHtml(m.titre)}${m.detail ? ' ' + escapeHtml(m.detail) : ''}</span>
      <button type="button" class="action-rapide" onclick="definirOnglet('reglages'); definirSousOngletReglages('systeme')">Voir les Réglages</button>`;
  }

  async function chargerEtatSauvegarde() {
    try {
      const reponse = await fetchAvecAuth('/api/sauvegarde');
      if (!reponse.ok) return;
      etatSauvegarde = await reponse.json();
      renderEtatSauvegarde();
    } catch (e) {
      // Serveur injoignable ou session expirée : déjà signalés ailleurs.
    }
  }

  async function enregistrerDossierSauvegarde() {
    const champ = document.getElementById('reglages-sauvegarde-dossier');
    const resultat = document.getElementById('reglages-sauvegarde-resultat');
    try {
      const reponse = await fetchAvecAuth('/api/sauvegarde', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossier: champ ? champ.value : '' })
      });
      const corps = await reponse.json();
      if (!reponse.ok) { if (resultat) resultat.textContent = corps.erreur || 'Enregistrement impossible.'; return; }
      etatSauvegarde = corps;
      renderEtatSauvegarde();
      if (resultat) resultat.textContent = 'Enregistré. Cliquez « Sauvegarder maintenant » pour vérifier que ce dossier est accessible.';
    } catch (e) {
      if (resultat) resultat.textContent = 'Serveur injoignable.';
    }
  }

  async function lancerSauvegarde() {
    const bouton = document.getElementById('reglages-sauvegarde-lancer');
    const resultat = document.getElementById('reglages-sauvegarde-resultat');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Sauvegarde en cours…'; }
    if (resultat) resultat.textContent = '';
    try {
      const reponse = await fetchAvecAuth('/api/sauvegarde/lancer', { method: 'POST' });
      const corps = await reponse.json();
      if (!reponse.ok) { if (resultat) resultat.textContent = corps.erreur || 'Sauvegarde impossible.'; return; }
      etatSauvegarde = corps;
      renderEtatSauvegarde();
      const t = corps.derniereTentative;
      if (resultat) resultat.textContent = t && t.ok ? `✓ ${t.fichier} écrit.` : `Échec : ${(t && t.erreur) || 'erreur inconnue'}`;
    } catch (e) {
      if (resultat) resultat.textContent = 'Serveur injoignable.';
    } finally {
      if (bouton) { bouton.disabled = false; bouton.textContent = 'Sauvegarder maintenant'; }
    }
  }

  // ===== Mise à jour de CLAIRE (server/src/miseAJour.js) =====
  // En un clic (« Mettre à jour maintenant »), ou automatiquement (étude 03/10 : « au démarrage et dès
  // que c'est détecté », interrupteur « Installer automatiquement », actif par défaut) — c'est alors le
  // serveur qui vérifie et installe ; « Vérifier » compare le build installé à la dernière publication.
  let etatMiseAJour = null;
  let verificationMiseAJour = null;

  // Texte de l'encart, pur et testable. `etat` : GET /api/mise-a-jour ; `verif` : réponse de
  // « Vérifier » (ou null tant qu'on n'a pas vérifié).
  function messageMiseAJour(etat, verif) {
    const installe = etat && etat.installe && Number.isInteger(etat.installe.build) ? etat.installe.build : null;
    const libInstalle = installe ? `build ${installe}` : 'version inconnue';
    if (!etat) return { niveau: 'neutre', titre: 'État de la mise à jour indisponible.', detail: '', installable: false };
    if (!etat.modeExe) {
      return { niveau: 'neutre', titre: 'Serveur en mode développement : la mise à jour ne concerne que CLAIRE-serveur.exe.', detail: '', installable: false };
    }
    if (!verif) return { niveau: 'neutre', titre: `Version installée : ${libInstalle}.`, detail: 'Cliquez « Vérifier » pour voir s\'il existe une version plus récente.', installable: false };
    if (verif.erreur) return { niveau: 'alerte', titre: 'Vérification impossible.', detail: verif.erreur, installable: false };
    const dispo = verif.disponible || {};
    const quand = dispo.publieLe ? ` (publiée le ${formatDateFr(String(dispo.publieLe).slice(0, 10))})` : '';
    if (verif.etat === 'a-jour') return { niveau: 'ok', titre: `CLAIRE est à jour (${libInstalle}).`, detail: '', installable: false };
    if (verif.etat === 'disponible') {
      return { niveau: 'alerte', titre: `Nouvelle version disponible : build ${dispo.build}${quand}.`, detail: `Installée : ${libInstalle}.`, installable: true };
    }
    return {
      niveau: 'neutre',
      titre: `Dernière version publiée : build ${dispo.build || '?'}${quand}.`,
      detail: `Installée : ${libInstalle} — impossible de dire si elle est plus récente. L'installer reste possible.`,
      installable: true
    };
  }

  function renderMiseAJour() {
    const zone = document.getElementById('reglages-maj-etat');
    if (!zone) return;
    const m = messageMiseAJour(etatMiseAJour, verificationMiseAJour);
    zone.className = 'reglages-dernier-tour' + (m.niveau === 'ok' ? ' dernier-tour-ok' : m.niveau === 'alerte' ? ' dernier-tour-alerte' : '');
    zone.innerHTML = `<div class="dernier-tour-ligne">${icone(m.niveau === 'ok' ? 'check' : m.niveau === 'alerte' ? 'alert-triangle' : 'info')}<span><strong>${escapeHtml(m.titre)}</strong>${m.detail ? ' ' + escapeHtml(m.detail) : ''}</span></div>`;
    const installer = document.getElementById('reglages-maj-installer');
    if (installer) installer.style.display = m.installable ? '' : 'none';
    const verifier = document.getElementById('reglages-maj-verifier');
    if (verifier) verifier.disabled = !(etatMiseAJour && etatMiseAJour.modeExe);
    const auto = document.getElementById('reglages-maj-auto');
    if (auto && etatMiseAJour) {
      auto.checked = etatMiseAJour.auto !== false;
      auto.disabled = !etatMiseAJour.modeExe;
    }
    const autoEtat = document.getElementById('reglages-maj-auto-etat');
    if (autoEtat && etatMiseAJour) autoEtat.textContent = texteMiseAJourAuto(etatMiseAJour);
    const champ = document.getElementById('reglages-maj-jeton');
    if (champ && etatMiseAJour) {
      champ.placeholder = etatMiseAJour.jetonEnregistre ? 'Déjà enregistré — laisser vide pour le conserver' : 'github_pat_…';
    }
  }

  // Pure : l'état de l'installation automatique, en une ligne.
  function texteMiseAJourAuto(etat) {
    if (!etat || !etat.modeExe || etat.auto === false) return '';
    if (!etat.jetonEnregistre) return 'Jeton GitHub à enregistrer ci-dessous pour que cela fonctionne.';
    const a = etat.autoEtat || {};
    if (!a.dernierControle) return 'Première vérification 30 secondes après le démarrage du serveur.';
    const heure = new Date(a.dernierControle).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
    return `Vérifié à ${heure}${a.resultat ? ' · ' + a.resultat : ''}.`;
  }

  async function basculerMiseAJourAuto(actif) {
    try {
      const r = await fetchAvecAuth('/api/mise-a-jour/auto', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto: !!actif }) });
      if (!r.ok) throw new Error('statut ' + r.status);
      etatMiseAJour = await r.json();
      renderMiseAJour();
    } catch (e) {
      afficherToast('Réglage non enregistré : ' + e.message, 'OK', null);
      chargerMiseAJour();
    }
  }

  // ---- Vérifications sur le terrain (étude, 03/10 ; server/src/verificationsTerrain.js) ----
  // Ce que le développement ne peut pas éprouver se coche seul au bureau la première fois que le geste
  // réussit ; la liste et les confirmations à la main sont dans Réglages › Mise à jour et sauvegarde, et
  // le rapport technique (12 h, 17 h) en reprend l'état. Une fenêtre ne note un même point qu'une fois
  // par session.
  var verificationsNoteesPoste = {};
  function noterVerificationPoste(id, observation) {
    // Un échec puis une réussite du même point dans la même fenêtre sont notés tous les deux.
    const cle = id + (observation && observation.ok === false ? ':echec' : '');
    if (verificationsNoteesPoste[cle]) return;
    verificationsNoteesPoste[cle] = true;
    try {
      fetchAvecAuth('/api/verifications-terrain/noter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...(observation || {}) })
      }).catch(() => {});
    } catch (e) { /* jamais bloquant */ }
  }

  var verificationsTerrain = [];
  async function chargerVerificationsTerrain() {
    try {
      const r = await fetchAvecAuth('/api/verifications-terrain');
      if (!r.ok) return;
      verificationsTerrain = (await r.json()).verifications || [];
      renderVerificationsTerrain();
    } catch (e) { /* serveur injoignable : signalé ailleurs */ }
  }

  function dateHeureVerification(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${String(d.getHours()).padStart(2, '0')} h ${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // Pure : une ligne par point, la plus récente mise à jour d'abord (ordre rendu par le serveur).
  function lignesVerificationsTerrain(liste) {
    return (liste || []).map(v => {
      const e = v.etat || {};
      const manuel = v.source === 'manuel';
      const statut = v.statut === 'verifie'
        ? `<span class="dot-label dl-success"><span class="dot"></span>${manuel ? 'Confirmé' : 'Vérifié'}</span>`
        : v.statut === 'echec'
          ? `<span class="dot-label dl-urgent"><span class="dot"></span>${manuel ? 'Ne marche pas' : 'Échec'}</span>`
          : `<span class="dot-label dl-neutre"><span class="dot"></span>${manuel ? 'À confirmer' : 'En attente'}</span>`;
      let etat;
      if (v.statut === 'verifie') etat = manuel ? `le ${dateHeureVerification(e.confirmeLe)}` : `le ${dateHeureVerification(e.premiereFois)}${e.fois > 1 ? ` · ${e.fois} fois` : ''}${e.detail ? ` · ${e.detail}` : ''}`;
      else if (v.statut === 'echec') etat = manuel ? `signalé le ${dateHeureVerification(e.infirmeLe)}` : `le ${dateHeureVerification(e.dernierEchec)}${e.messageEchec ? ` : ${e.messageEchec}` : ''}`;
      else etat = manuel ? 'À regarder au bureau puis confirmer' : 'Pas encore observé au bureau';
      const boutons = manuel
        ? `<span class="reglages-verif-actions">
            <button type="button" class="secondary" onclick="confirmerVerificationTerrain('${escapeOnclickArg(v.id)}', true)"${v.statut === 'verifie' ? ' disabled' : ''}>C’est bon</button>
            <button type="button" class="secondary" onclick="confirmerVerificationTerrain('${escapeOnclickArg(v.id)}', false)"${v.statut === 'echec' ? ' disabled' : ''}>Ne marche pas</button>
          </span>`
        : '';
      return `<div class="reglages-option reglages-option-fixe reglages-verif" data-verif="${escapeAttr(v.id)}">
          <span class="reglages-option-texte">
            <span class="reglages-option-titre">${escapeHtml(v.titre)}${infoBulle(`${v.comment} Depuis la version ${v.depuis}.`)}</span>
            <span class="hint">${statut} ${escapeHtml(etat)}</span>
          </span>
          ${boutons}
        </div>`;
    }).join('');
  }

  function renderVerificationsTerrain() {
    const bloc = document.getElementById('reglages-verifications');
    if (!bloc) return;
    const n = verificationsTerrain.filter(v => v.statut === 'verifie').length;
    const compte = document.getElementById('reglages-verifications-compte');
    if (compte) compte.textContent = verificationsTerrain.length ? `${n} sur ${verificationsTerrain.length} vérifiées` : '';
    bloc.innerHTML = verificationsTerrain.length ? lignesVerificationsTerrain(verificationsTerrain) : '<p class="hint">Aucune vérification en cours.</p>';
  }

  async function confirmerVerificationTerrain(id, confirme) {
    try {
      const r = await fetchAvecAuth('/api/verifications-terrain/confirmer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, confirme })
      });
      const corps = await r.json();
      if (!r.ok) throw new Error(corps.erreur || 'erreur');
      verificationsTerrain = corps.verifications || [];
      renderVerificationsTerrain();
      afficherToast(confirme ? 'Vérification confirmée.' : 'Noté : à corriger, ce sera dans le prochain rapport.', 'OK', null);
    } catch (e) {
      afficherToast('Non enregistré : ' + e.message, 'OK', null);
    }
  }

  async function chargerMiseAJour() {
    chargerVerificationsTerrain();
    try {
      const reponse = await fetchAvecAuth('/api/mise-a-jour');
      if (!reponse.ok) return;
      etatMiseAJour = await reponse.json();
      renderMiseAJour();
    } catch (e) {
      // Serveur injoignable ou session expirée : déjà signalés ailleurs.
    }
  }

  async function verifierMiseAJour() {
    const bouton = document.getElementById('reglages-maj-verifier');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Vérification…'; }
    try {
      const reponse = await fetchAvecAuth('/api/mise-a-jour/verifier', { method: 'POST' });
      const corps = await reponse.json();
      etatMiseAJour = Object.assign({}, etatMiseAJour, corps);
      verificationMiseAJour = corps;
    } catch (e) {
      verificationMiseAJour = { erreur: 'Serveur injoignable.' };
    } finally {
      if (bouton) bouton.textContent = 'Vérifier';
      renderMiseAJour();
    }
  }

  // ===== Rapport technique (server/src/rapportTechnique.js) =====
  // Déposé sur GitHub à 12 h et 17 h les jours ouvrés, anonymisé par le serveur ; « Voir ce qui
  // part » montre le texte exact avant tout envoi.
  let etatRapportTechnique = null;

  // Pure et testable : l'encart d'état. `etat` : GET /api/rapport-technique.
  function messageRapportTechnique(etat) {
    if (!etat) return { niveau: 'neutre', titre: 'État du rapport technique indisponible.', detail: '' };
    if (!etat.actif) return { niveau: 'neutre', titre: 'Rapport technique désactivé.', detail: 'Rien n’est envoyé sur GitHub.' };
    if (!etat.jetonEnregistre) return { niveau: 'alerte', titre: 'Aucun jeton GitHub enregistré.', detail: 'Enregistrez-en un ci-dessus, avec le droit « Issues : Read and write ».' };
    const envoi = etat.dernierEnvoi;
    const quand = (iso) => {
      const d = new Date(iso);
      return isNaN(d) ? '' : `${formatDateFr(isoLocalDepuisDate(d))} à ${String(d.getHours()).padStart(2, '0')} h ${String(d.getMinutes()).padStart(2, '0')}`;
    };
    if (etat.derniereErreur) {
      return { niveau: 'alerte', titre: 'Le dernier rapport n’est pas parti.', detail: etat.derniereErreur + (envoi ? ` Dernier envoi réussi : ${quand(envoi.at)}.` : '') };
    }
    if (envoi) {
      return { niveau: 'ok', titre: `Dernier rapport envoyé le ${quand(envoi.at)}${envoi.numero ? ` (n° ${envoi.numero})` : ''}.`, detail: envoi.calme ? 'Rien à signaler.' : `${envoi.points} point(s) à examiner.`, url: envoi.url || '' };
    }
    return { niveau: 'neutre', titre: 'Aucun rapport envoyé pour l’instant.', detail: 'Prochain envoi à 12 h ou 17 h (jours ouvrés).' };
  }

  function renderRapportTechnique() {
    const zone = document.getElementById('reglages-rapport-etat');
    if (!zone) return;
    const m = messageRapportTechnique(etatRapportTechnique);
    zone.className = 'reglages-dernier-tour' + (m.niveau === 'ok' ? ' dernier-tour-ok' : m.niveau === 'alerte' ? ' dernier-tour-alerte' : '');
    zone.innerHTML = `<div class="dernier-tour-ligne">${icone(m.niveau === 'ok' ? 'check' : m.niveau === 'alerte' ? 'alert-triangle' : 'info')}<span><strong>${escapeHtml(m.titre)}</strong>${m.detail ? ' ' + escapeHtml(m.detail) : ''}${m.url ? ` <a href="${escapeAttr(m.url)}" target="_blank" rel="noopener">Ouvrir sur GitHub</a>` : ''}</span></div>`;
    const actif = document.getElementById('reglages-rapport-actif');
    if (actif && etatRapportTechnique) actif.checked = !!etatRapportTechnique.actif;
  }

  async function chargerRapportTechnique() {
    try {
      const reponse = await fetchAvecAuth('/api/rapport-technique');
      if (!reponse.ok) return;
      etatRapportTechnique = await reponse.json();
      renderRapportTechnique();
    } catch (e) { /* serveur injoignable : déjà signalé ailleurs */ }
  }

  async function basculerRapportTechnique(actif) {
    try {
      const reponse = await fetchAvecAuth('/api/rapport-technique', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: !!actif }) });
      if (reponse.ok) etatRapportTechnique = await reponse.json();
    } catch (e) { /* on réaffiche l'état connu */ }
    renderRapportTechnique();
  }

  async function afficherApercuRapportTechnique() {
    const zone = document.getElementById('reglages-rapport-apercu');
    if (!zone) return;
    if (zone.style.display !== 'none') { zone.style.display = 'none'; return; }
    zone.style.display = '';
    zone.textContent = 'Préparation de l’aperçu…';
    try {
      const reponse = await fetchAvecAuth('/api/rapport-technique/apercu');
      const corps = await reponse.json();
      zone.textContent = reponse.ok ? `${corps.titre}\n\n${corps.corps}` : (corps.erreur || 'Aperçu impossible.');
    } catch (e) {
      zone.textContent = 'Serveur injoignable.';
    }
  }

  async function envoyerRapportTechnique() {
    const bouton = document.getElementById('reglages-rapport-envoyer');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Envoi…'; }
    try {
      const reponse = await fetchAvecAuth('/api/rapport-technique/envoyer', { method: 'POST' });
      const corps = await reponse.json();
      if (corps && typeof corps.actif === 'boolean') etatRapportTechnique = corps;
      else if (corps && corps.erreur) etatRapportTechnique = Object.assign({}, etatRapportTechnique, { derniereErreur: corps.erreur });
    } catch (e) {
      etatRapportTechnique = Object.assign({}, etatRapportTechnique, { derniereErreur: 'Serveur injoignable.' });
    } finally {
      if (bouton) { bouton.disabled = false; bouton.textContent = 'Envoyer maintenant'; }
      renderRapportTechnique();
    }
  }

  async function enregistrerJetonMiseAJour() {
    const champ = document.getElementById('reglages-maj-jeton');
    const resultat = document.getElementById('reglages-maj-jeton-resultat');
    const valeur = champ ? champ.value.trim() : '';
    if (!valeur) { if (resultat) resultat.textContent = 'Collez le jeton dans le champ avant d\'enregistrer.'; return; }
    try {
      const reponse = await fetchAvecAuth('/api/mise-a-jour/jeton', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jetonGithub: valeur })
      });
      const corps = await reponse.json();
      if (!reponse.ok) { if (resultat) resultat.textContent = corps.erreur || 'Enregistrement impossible.'; return; }
      etatMiseAJour = corps;
      if (champ) champ.value = '';
      if (resultat) resultat.textContent = 'Jeton enregistré. Cliquez « Vérifier » pour contrôler qu\'il donne bien accès au dépôt.';
      renderMiseAJour();
    } catch (e) {
      if (resultat) resultat.textContent = 'Serveur injoignable.';
    }
  }

  function afficherProgressionMiseAJour(titre, detail) {
    const overlay = document.getElementById('maj-overlay');
    if (!overlay) return;
    document.getElementById('maj-overlay-titre').textContent = titre;
    document.getElementById('maj-overlay-detail').textContent = detail || '';
    overlay.style.display = 'flex';
  }

  function demanderInstallationMiseAJour() {
    const m = messageMiseAJour(etatMiseAJour, verificationMiseAJour);
    if (!m.installable) return;
    const dispo = (verificationMiseAJour && verificationMiseAJour.disponible) || {};
    demanderConfirmation(
      `Installer CLAIRE build ${dispo.build || '?'} ? La base est sauvegardée d'abord, puis le serveur redémarre : CLAIRE sera indisponible environ une minute sur tous les postes, et il faudra se reconnecter.`,
      installerMiseAJour,
      { bouton: 'Mettre à jour', ton: 'valider' }
    );
  }

  // Après la réponse du serveur, il s'arrête et relance la nouvelle version : on attend qu'il ait
  // disparu PUIS qu'il réponde de nouveau, et on recharge la page (le nouveau script.js vient avec).
  async function installerMiseAJour() {
    afficherProgressionMiseAJour('Mise à jour en cours…', 'Sauvegarde de la base puis téléchargement de la nouvelle version (environ 90 Mo). Ne fermez pas cette fenêtre.');
    let corps;
    try {
      const reponse = await fetchAvecAuth('/api/mise-a-jour/installer', { method: 'POST' });
      corps = await reponse.json();
      if (!reponse.ok) throw new Error(corps.erreur || 'Mise à jour impossible.');
    } catch (e) {
      document.getElementById('maj-overlay').style.display = 'none';
      verificationMiseAJour = { erreur: e.message };
      renderMiseAJour();
      afficherInfoAction('Mise à jour non installée', `${e.message} CLAIRE continue de fonctionner avec la version actuelle.`);
      return;
    }
    afficherProgressionMiseAJour('Redémarrage de CLAIRE…', `Build ${corps.build} installé. La page se rechargera d'elle-même dès que le serveur sera revenu.`);
    const debut = Date.now();
    let disparu = false;
    const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
    while (Date.now() - debut < 3 * 60 * 1000) {
      await attendre(2000);
      let repond = false;
      try { repond = (await fetch('/api/health', { cache: 'no-store' })).ok; } catch (e) { repond = false; }
      if (!repond) disparu = true;
      if (repond && (disparu || Date.now() - debut > 20000)) { location.reload(); return; }
    }
    afficherProgressionMiseAJour(
      'Le serveur ne répond pas.',
      `Sur le poste serveur, vérifiez le fichier erreur-demarrage.txt à côté de CLAIRE-serveur.exe. Pour revenir à la version précédente : lancez Arreter-CLAIRE.bat, supprimez CLAIRE-serveur.exe, renommez ${corps.ancien || 'CLAIRE-serveur.ancien.exe'} en CLAIRE-serveur.exe, puis relancez-le.`
    );
  }

  async function chargerDernierTourRappels() {
    try {
      const reponse = await fetchAvecAuth('/api/reglages/dernier-tour');
      const corps = await reponse.json();
      renderDernierTourRappels(corps.dernierTour);
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth (écran de connexion réaffiché).
    }
  }

  // Lance un VRAI tour tout de suite. Le bouton est désactivé pendant l'appel : un tour qui envoie
  // plusieurs rappels sur un serveur SMTP lent peut durer quelques secondes, et deux tours lancés
  // en parallèle se disputeraient reminder_log.
  async function lancerTourRappels() {
    const bouton = document.getElementById('reglages-lancer-tour');
    const zone = document.getElementById('reglages-etat');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Tour en cours…'; }
    try {
      const reponse = await fetchAvecAuth('/api/reglages/lancer-rappels', { method: 'POST' });
      const corps = await reponse.json();
      zone.style.display = 'flex';
      if (reponse.ok && corps.ok) {
        renderDernierTourRappels(corps.dernierTour);
        zone.className = 'analyse-ia-dispo dispo-ok';
        zone.innerHTML = `${icone('check')}Tour terminé : ${escapeHtml(libelleRappelsTour(corps.rappelsEnvoyes, corps.rappelsDus))}. Vérifiez dans Teams.`;
      } else {
        zone.className = 'analyse-ia-dispo dispo-off';
        zone.innerHTML = `${icone('alert-triangle')}${escapeHtml(corps.erreur || 'Le tour de rappels a échoué.')}`;
      }
    } catch (e) {
      // Session expirée : déjà géré par fetchAvecAuth.
    } finally {
      if (bouton) { bouton.disabled = false; bouton.textContent = 'Lancer un tour maintenant'; }
    }
  }

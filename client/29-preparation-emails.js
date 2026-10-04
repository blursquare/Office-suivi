  // ==== Préparation des emails : formule selon le destinataire, HTML, signature, fichier .eml ====
  //
  // Demandé par l'étude (28/09) : au clic, l'email s'OUVRE prêt à être envoyé (comme au temps du
  // mailto:, et non plus un brouillon déposé en silence dans Outlook par EWS), mais en HTML, avec
  // la signature de l'office — images et texte en couleur — et les pièces jointes. Un mailto: ne
  // porte ni HTML, ni image, ni pièce jointe : la seule voie navigateur qui fait les trois est un
  // fichier .eml marqué « X-Unsent: 1 », qu'Outlook ouvre comme un NOUVEAU message, éditable, avec
  // son bouton Envoyer. Le fichier est téléchargé au clic ; l'ouvrir suffit (et Chrome peut
  // l'ouvrir tout seul : clic droit sur le téléchargement › « Toujours ouvrir ce type de fichier »).
  // Le mailto: reste disponible poste par poste (Réglages › Sur ce poste), texte seul, pour un
  // poste sans Outlook.

  // Coordonnées et mentions de la signature de l'office, fournies par l'étude — texte des mentions
  // repris mot pour mot, ne pas le reformuler sans le document de l'étude. Une seule source pour la
  // version texte (SIGNATURE_EMAIL_OFFICE) et la version HTML (signatureHtmlOffice).
  // Sans formule de politesse : elle appartient au CORPS (« Bien cordialement, » au client, « Votre
  // bien dévoué. » à un confrère — voir adapterCorpsEmail), sinon elle se doublerait.
  var COORDONNEES_EMAIL_OFFICE = [
    'Office de Maître Sophie GOSSART',
    'Office Notarial de la Salamandre',
    '3 rue Bout des Haies - 41000 BLOIS',
    'Tél. 02 54 78 61 70',
    'office.gossart@notaires.fr',
    'sophie-gossart-blois.notaires.fr'
  ];
  // Mentions du bas de chaque email, dans l'ordre, les couleurs et la mise en forme du modèle de
  // l'étude (29/09 : « pour les signatures d'email reprendre toujours ce modèle ») — texte repris mot
  // pour mot, y compris « seuls les virement sont autorisés ». Chaque mention : un ton (orange,
  // rouge, gris) et des morceaux, chacun en gras (b) ou souligné (u) au besoin.
  var MENTIONS_SIGNATURE_EMAIL = [
    { ton: 'orange', morceaux: [['Ainsi qu’il résulte des dispositions de l’article L.112-6-1 du Code Monétaire et Financier, désormais, tous les versements supérieurs à 3.000 € doivent être effectués par virement uniquement. Les notaires ne sont plus autorisés à accepter ou à établir des chèques pour le compte des parties à un acte donnant lieu à publicité foncière : seuls les virement sont autorisés.']] },
    { ton: 'orange', gras: true, colle: true, morceaux: [['Pour l’envoi de vos prix de vente, solde, fonds dépendant d’une succession, vous devrez impérativement nous fournir '], ['un RIB signé par vous.', 'u']] },
    { ton: 'rouge', morceaux: [['Attention fraude', 'b'], [' : tous les notaires de France ont l’obligation de communiquer uniquement avec une adresse mail notaires.fr ('], ['notaires au pluriel avec un s', 'u'], ['). Un notaire ou un collaborateur de notaire ne vous écrira jamais avec une adresse orange, free, gmail ou autres.']] },
    { ton: 'rouge', morceaux: [['Attention fraude aux RIB', 'b'], [' : tous les notaires de France ont l’obligation de détenir un compte à la '], ['CAISSE DES DEPOTS ET CONSIGNATIONS (CDC). Seulement la CDC, uniquement la CDC.', 'b'], [' '], ['Ne jamais effectuer de virement sur un compte ouvert auprès d’une autre banque.', 'u']] },
    { ton: 'gris', morceaux: [['Ce message contient des informations confidentielles protégées par le secret professionnel.']] },
    { ton: 'gris', colle: true, morceaux: [['Au cas où il ne vous serait pas destiné, nous vous remercions de bien vouloir nous en aviser immédiatement et de le supprimer. Les liaisons internet ne sont pas sécurisées et en conséquence l’Office ne pourra être responsable de tout changement qui pourrait être effectué concernant ce message après son envoi.']] }
  ];
  var MENTIONS_EMAIL_OFFICE = MENTIONS_SIGNATURE_EMAIL.map(m => m.morceaux.map(x => x[0]).join(''));
  var COULEURS_MENTIONS_EMAIL = { orange: '#E36C0A', rouge: '#E0393E', gris: '#7F7F7F' };

  // Bannière Visio du modèle (« Pas le temps de passer chez votre notaire ? »), texte mot pour mot ;
  // les passages en bleu sont marqués « bleu ».
  var BANNIERE_VISIO_EMAIL = {
    titre: 'Pas le temps de passer chez votre notaire ?',
    morceaux: [['Vous disposez d’une tablette ou d’un ordinateur doté d’une caméra et d’un micro ? Vous avez alors l’équipement nécessaire pour réaliser '], ['un entretien en visioconférence avec votre notaire', 'bleu'], ['. Simple, '], ['en toute confidentialité', 'bleu'], [', grâce au lien internet sécurisé qui vous est communiqué, '], ['vous pouvez, de chez vous, dialoguer avec lui', 'bleu'], ['.']]
  };

  // Fonction affichée sous le nom du collaborateur dans sa carte de signature (Réglages ›
  // Collaborateurs). Par défaut « Collaborateur », comme sur la carte vierge de l'étude.
  var FONCTIONS_SIGNATURE_DEFAUT = { 'Bastien ANGLUMENT': 'Responsable qualité et relation client' };

  // Pure : qui signe l'email — le collaborateur du poste, à défaut le responsable du dossier ; son
  // adresse notaires.fr et sa fonction viennent des Réglages. Sans nom : la carte de l'office.
  function signataireEmail(nom, reglages) {
    const r = reglages || {};
    const n = String(nom || '').trim();
    const email = (n && r.emailsResponsables && r.emailsResponsables[n]) || COORDONNEES_EMAIL_OFFICE[4];
    const fonction = (n && r.fonctionsResponsables && r.fonctionsResponsables[n]) || FONCTIONS_SIGNATURE_DEFAUT[n] || 'Collaborateur';
    return { nom: n, fonction, email };
  }

  function texteSignatureEmail(signataire) {
    const s = signataire || signataireEmail('', {});
    const identite = s.nom ? [s.nom, s.fonction, ''] : [COORDONNEES_EMAIL_OFFICE[0]];
    return '\n\n' + identite.concat([COORDONNEES_EMAIL_OFFICE[3], s.email, COORDONNEES_EMAIL_OFFICE[1], COORDONNEES_EMAIL_OFFICE[2], COORDONNEES_EMAIL_OFFICE[5]]).join('\n')
      + '\n\n' + BANNIERE_VISIO_EMAIL.titre + '\n' + BANNIERE_VISIO_EMAIL.morceaux.map(x => x[0]).join('')
      + '\n\n---\n' + MENTIONS_EMAIL_OFFICE.join('\n\n');
  }
  var SIGNATURE_EMAIL_OFFICE = texteSignatureEmail(null);

  // Formules imposées par l'étude dès qu'on écrit à un CONFRÈRE (le notaire de l'acquéreur quand un
  // autre office le représente — voir emailDestinataireRelance) : tous les emails, sans exception.
  var FORMULE_APPEL_CONFRERE = 'Mon Cher Maître,';
  var FORMULE_CLOTURE_CONFRERE = 'Dans l’attente et vous en remerciant par avance,\n\nVotre bien dévoué.';
  var FORMULE_CLOTURE_CLIENT = 'Bien cordialement,';
  var RE_FORMULE_APPEL_EMAIL = /^(?:bonjour|madame,?\s+monsieur|cher\s+confr[èe]re|mon\s+cher\s+ma[îi]tre|ma[îi]tre)\b[^\n]*,$/i;
  var RE_FORMULE_CLOTURE_EMAIL = /^(?:bien\s+cordialement|cordialement|votre\s+bien\s+d[ée]vou[ée]|dans\s+l[’']attente)/i;

  // Pure : pose les formules qui conviennent au destinataire. Au confrère, la formule d'appel du
  // modèle est remplacée par « Mon Cher Maître, » et ses formules de clôture par « Dans l’attente…
  // Votre bien dévoué. » ; au client, le modèle est gardé tel quel et reçoit seulement « Bien
  // cordialement, » s'il n'a aucune formule de clôture. Idempotente.
  function adapterCorpsEmail(corps, confrere) {
    const paragraphes = String(corps || '').split(/\n{2,}/).map(p => p.replace(/\s+$/, ''));
    while (paragraphes.length && !paragraphes[paragraphes.length - 1].trim()) paragraphes.pop();
    if (!confrere) {
      const dernier = paragraphes.length ? paragraphes[paragraphes.length - 1].trim() : '';
      if (!/cordialement|d[ée]vou[ée]/i.test(dernier)) paragraphes.push(FORMULE_CLOTURE_CLIENT);
      return paragraphes.join('\n\n');
    }
    if (paragraphes.length && RE_FORMULE_APPEL_EMAIL.test(paragraphes[0].trim())) paragraphes.shift();
    while (paragraphes.length && RE_FORMULE_CLOTURE_EMAIL.test(paragraphes[paragraphes.length - 1].trim())) paragraphes.pop();
    return [FORMULE_APPEL_CONFRERE, ...paragraphes, FORMULE_CLOTURE_CONFRERE].join('\n\n');
  }

  // --- HTML ---------------------------------------------------------------------------------------
  // Mise en forme volontairement simple et « à l'ancienne » (tableaux, styles en ligne) : c'est ce
  // qu'Outlook sait afficher, il ignore les feuilles de style et la mise en page moderne.
  var COULEUR_EMAIL_OFFICE = '#6D2332';
  var POLICE_EMAIL = "font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1F1F1F;";

  function echapperHtmlEmail(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Une ligne « Cliquez ici … : https://… » devient un lien sur « Cliquez ici … » (l'adresse, très
  // longue, disparaît) ; toute autre adresse web reste visible et devient cliquable.
  function ligneHtmlEmail(ligne) {
    const cliquez = /^(.*?cliquez ici[^:]*?)\s*:\s*(https?:\/\/\S+)\s*$/i.exec(ligne);
    if (cliquez) {
      return `${echapperHtmlEmail(cliquez[1].replace(/cliquez ici.*$/i, ''))}<a href="${echapperHtmlEmail(cliquez[2])}" style="color:${COULEUR_EMAIL_OFFICE};">${echapperHtmlEmail(cliquez[1].replace(/^.*?(cliquez ici)/i, '$1'))}</a>`;
    }
    return echapperHtmlEmail(ligne).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" style="color:${COULEUR_EMAIL_OFFICE};">${u}</a>`);
  }

  // `images` : cid des images disponibles ({ logoOffice, logoNotaires, iconVisio, iconFacebook,
  // iconInstagram } → cid ou rien). Une image absente est simplement omise.
  // Mise en page du modèle de l'étude (29/09) : la CARTE du collaborateur (à gauche son nom, sa
  // fonction, téléphone, email, adresse et site ; à droite le logo de l'office, celui des Notaires de
  // France et les réseaux), la bannière Visio, puis les mentions en couleur. En tableaux et styles en
  // ligne : Outlook ignore le reste. La photo de la façade du modèle n'est pas encore fournie en
  // fichier : la carte s'en passe.
  var OR_SIGNATURE_EMAIL = '#C29A5B';
  var BLEU_VISIO_EMAIL = '#1B9AD6';
  function signatureHtmlOffice(images, signataire) {
    const img = images || {};
    const s = signataire || signataireEmail('', {});
    const c = COORDONNEES_EMAIL_OFFICE;
    const police = 'font-family:Calibri,Arial,sans-serif;';
    const lien = (href, texte) => `<a href="${href}" style="color:#4A4A4A;text-decoration:none;">${echapperHtmlEmail(texte)}</a>`;
    const ligne = (contenu) => `<tr><td style="${police}font-size:9.5pt;color:#4A4A4A;padding:2px 0;line-height:1.3;">${contenu}</td></tr>`;
    const tete = s.nom
      ? `<div style="font-family:Georgia,'Times New Roman',serif;font-size:15pt;color:${COULEUR_EMAIL_OFFICE};">${echapperHtmlEmail(s.nom)}</div>`
        + `<div style="${police}font-size:7.5pt;letter-spacing:1.5px;color:${OR_SIGNATURE_EMAIL};text-transform:uppercase;">${echapperHtmlEmail(s.fonction)}</div>`
      : `<div style="font-family:Georgia,'Times New Roman',serif;font-size:15pt;color:${COULEUR_EMAIL_OFFICE};">${echapperHtmlEmail(c[0])}</div>`;
    const gauche = `<td width="360" style="padding:14px 18px;vertical-align:top;">${tete}`
      + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">`
      + ligne(echapperHtmlEmail(c[3].replace(/^T[ée]l\.\s*/, '')))
      + ligne(lien('mailto:' + s.email, s.email))
      + ligne(`${echapperHtmlEmail(c[1])}<br>${echapperHtmlEmail(c[2].replace(' - ', ' - '))}`)
      + ligne(lien('https://' + c[5], c[5]))
      + `</table></td>`;
    const reseaux = [img.iconFacebook, img.iconInstagram].filter(Boolean)
      .map(cid => `<img src="cid:${cid}" width="14" height="14" alt="" style="border:0;margin:0 4px;">`).join('');
    const droite = `<td width="200" style="padding:6px 6px;vertical-align:middle;text-align:center;border-left:1px solid #E8DCC4;">`
      + (img.logoOffice ? `<img src="cid:${img.logoOffice}" width="190" height="111" alt="Me Sophie GOSSART — Office notarial de la Salamandre" style="display:block;border:0;margin:0 auto;">` : `<div style="${police}font-size:10pt;color:${COULEUR_EMAIL_OFFICE};">${echapperHtmlEmail(c[1])}</div>`)
      + (img.logoNotaires ? `<img src="cid:${img.logoNotaires}" width="120" height="62" alt="Notaires de France" style="display:block;border:0;margin:-6px auto 0;">` : '')
      + (reseaux ? `<div style="margin-top:8px;">${reseaux}</div>` : '')
      + `</td>`;
    // Image déposée dans Réglages : reprise telle quelle, 600 px de large au plus (taille d'une
    // signature Outlook), à la place de la version composée par CLAIRE.
    const imageDeposee = (d, marge) => {
      const largeur = Math.min(Number(d.largeur) || 600, 600);
      const hauteur = Math.round((Number(d.hauteur) || 0) * largeur / (Number(d.largeur) || largeur)) || '';
      return `<img src="cid:${d.cid}" width="${largeur}"${hauteur ? ` height="${hauteur}"` : ''} alt="" style="display:block;border:0;margin-top:${marge};max-width:100%;">`;
    };
    const carte = img.carteImage ? imageDeposee(img.carteImage, '14pt')
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="border-collapse:collapse;margin-top:14pt;border:1px solid #E8DCC4;background:#FFFFFF;"><tr>${gauche}${droite}</tr></table>`;
    const texteVisio = BANNIERE_VISIO_EMAIL.morceaux.map(([t, st]) => st === 'bleu'
      ? `<span style="color:${BLEU_VISIO_EMAIL};">${echapperHtmlEmail(t)}</span>` : echapperHtmlEmail(t)).join('');
    // Deux lignes vides entre la carte et la bannière, comme dans le modèle de l'étude.
    const lignesVides = `<p style="margin:0;${police}font-size:11pt;">&nbsp;</p>`.repeat(2);
    const visio = img.visioImage ? imageDeposee(img.visioImage, '0') : (`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="border-collapse:collapse;margin-top:0;border:1px solid #E3E3E3;background:#FFFFFF;"><tr>`
      + (img.iconVisio ? `<td width="56" style="padding:8px 6px 8px 10px;vertical-align:middle;"><img src="cid:${img.iconVisio}" width="46" height="41" alt="Visio" style="display:block;border:0;"></td>` : '')
      + `<td style="padding:8px 10px;vertical-align:middle;${police}">`
      + `<div style="font-size:11pt;font-weight:bold;color:${BLEU_VISIO_EMAIL};">${echapperHtmlEmail(BANNIERE_VISIO_EMAIL.titre)}</div>`
      + `<div style="font-size:8pt;line-height:1.35;color:#1F1F1F;margin-top:2px;">${texteVisio}</div></td></tr></table>`);
    const mentions = MENTIONS_SIGNATURE_EMAIL.map((m, i) => {
      const couleur = COULEURS_MENTIONS_EMAIL[m.ton] || '#7F7F7F';
      const html = m.morceaux.map(([t, st]) => st === 'b' ? `<b>${echapperHtmlEmail(t)}</b>`
        : st === 'u' ? `<u>${echapperHtmlEmail(t)}</u>` : echapperHtmlEmail(t)).join('');
      const marge = i === 0 ? '0' : (m.colle ? '0' : '10pt');
      return `<p style="margin:${marge} 0 0;color:${couleur};${m.gras ? 'font-weight:bold;' : ''}">${html}</p>`;
    }).join('');
    return carte + lignesVides + visio + `<div style="margin-top:14pt;${police}font-size:10pt;line-height:1.4;">${mentions}</div>`;
  }

  // Pure : le corps (déjà adapté au destinataire) en HTML, suivi de la signature.
  // `boutons` ([{ libelle, href, secondaire }]) : posés à la place du paragraphe « {{BOUTONS}} »
  // (sondage de créneaux) — des cellules de tableau colorées, seule forme de bouton qu'Outlook
  // affiche.
  function htmlEmail(corps, images, signataire, boutons) {
    const paragraphes = String(corps || '').split(/\n{2,}/).map(p => p.trim() === '{{BOUTONS}}'
      ? boutonsEmailHtml(boutons || [])
      : `<p style="margin:0 0 11pt;">${marquesEnHtml(p.split('\n').map(ligneHtmlEmail).join('<br>'))}</p>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="${POLICE_EMAIL}">`
      + `<div style="${POLICE_EMAIL}">${paragraphes}</div>${signatureHtmlOffice(images, signataire)}</body></html>`;
  }

  function boutonsEmailHtml(boutons) {
    return boutons.map(b => `<table cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8pt;border-collapse:separate;"><tr>`
      + `<td style="background:${b.secondaire ? '#FFFFFF' : COULEUR_EMAIL_OFFICE};border:1px solid ${COULEUR_EMAIL_OFFICE};border-radius:4px;padding:8px 18px;">`
      + `<a href="${echapperHtmlEmail(b.href)}" style="font-family:Calibri,Arial,sans-serif;font-size:11pt;font-weight:bold;text-decoration:none;color:${b.secondaire ? COULEUR_EMAIL_OFFICE : '#FFFFFF'};">${echapperHtmlEmail(b.libelle)}</a>`
      + `</td></tr></table>`).join('') + '<p style="margin:0 0 11pt;"></p>';
  }

  // Version texte des boutons : le libellé et son lien, un par ligne.
  function texteAvecBoutons(corps, boutons) {
    return String(corps || '').replace('{{BOUTONS}}', (boutons || []).map(b => `${b.libelle} : ${b.href}`).join('\n'));
  }

  // --- fichier .eml -------------------------------------------------------------------------------
  // Pur : pas de btoa (absent hors navigateur), l'UTF-8 est encodé à la main.
  var ALPHABET_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function base64Utf8(texte) {
    const binaire = unescape(encodeURIComponent(String(texte == null ? '' : texte)));
    let sortie = '';
    for (let i = 0; i < binaire.length; i += 3) {
      const a = binaire.charCodeAt(i), b = binaire.charCodeAt(i + 1), c = binaire.charCodeAt(i + 2);
      const n = (a << 16) | ((b || 0) << 8) | (c || 0);
      sortie += ALPHABET_BASE64[(n >> 18) & 63] + ALPHABET_BASE64[(n >> 12) & 63]
        + (i + 1 < binaire.length ? ALPHABET_BASE64[(n >> 6) & 63] : '=')
        + (i + 2 < binaire.length ? ALPHABET_BASE64[n & 63] : '=');
    }
    return sortie;
  }
  function plierBase64(b64) {
    return String(b64 || '').replace(/\s+/g, '').replace(/.{1,76}/g, '$&\r\n').replace(/\r\n$/, '');
  }
  // En-tête non ASCII (objet accentué) : mots encodés RFC 2047, découpés court pour rester sous la
  // longueur de ligne permise (jamais au milieu d'un caractère : on découpe par caractère).
  function enteteEncodee(texte) {
    const t = String(texte || '').replace(/[\r\n]+/g, ' ');
    if (/^[\x20-\x7e]*$/.test(t)) return t;
    const morceaux = [];
    const caracteres = Array.from(t);
    for (let i = 0; i < caracteres.length; i += 10) morceaux.push(`=?UTF-8?B?${base64Utf8(caracteres.slice(i, i + 10).join(''))}?=`);
    return morceaux.join('\r\n ');
  }
  function nomFichierEntete(nom) {
    const ascii = String(nom || 'piece').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]|["\\]/g, '_');
    return `name="${ascii}"; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(String(nom || 'piece'))}`;
  }

  // Pur. `images` : [{ cid, type, base64 }] (en ligne, citées par cid: dans le HTML) ; `pieces` :
  // [{ nom, type, contenuBase64 }] (jointes). « X-Unsent: 1 » : Outlook ouvre le fichier comme un
  // nouveau message à envoyer, pas comme un message reçu. Pas d'expéditeur : Outlook prend le compte
  // de la personne qui l'ouvre.
  function construireEml({ destinataire, sujet, texte, html, images = [], pieces = [] }) {
    const L = '\r\n';
    const partieTexte = (type, contenu) => `Content-Type: ${type}; charset="utf-8"${L}Content-Transfer-Encoding: base64${L}${L}${plierBase64(base64Utf8(contenu))}`;
    const multipart = (sousType, frontiere, parties) =>
      `Content-Type: multipart/${sousType}; boundary="${frontiere}"${L}${L}`
      + parties.map(p => `--${frontiere}${L}${p}${L}`).join('') + `--${frontiere}--`;

    let corps = multipart('alternative', 'claire_alt_0', [partieTexte('text/plain', texte), partieTexte('text/html', html)]);
    // Seules les images réellement affichées dans le corps : une image non citée (logo remplacé
    // par la carte déposée) apparaîtrait comme pièce jointe dans Outlook.
    const affichees = images.filter(im => im && im.cid && String(html || '').indexOf('cid:' + im.cid) !== -1);
    if (affichees.length) {
      corps = multipart('related', 'claire_rel_0', [corps, ...affichees.map(im =>
        `Content-Type: ${im.type || 'image/png'}${L}Content-Transfer-Encoding: base64${L}Content-ID: <${im.cid}>${L}Content-Disposition: inline; filename="${im.cid}.${im.type === 'image/jpeg' ? 'jpg' : 'png'}"${L}${L}${plierBase64(im.base64)}`)]);
    }
    if (pieces.length) {
      corps = multipart('mixed', 'claire_mix_0', [corps, ...pieces.map(p =>
        `Content-Type: ${p.type || 'application/octet-stream'}; ${nomFichierEntete(p.nom).replace(/; filename.*$/, '')}${L}Content-Transfer-Encoding: base64${L}Content-Disposition: attachment; ${nomFichierEntete(p.nom).replace(/^name="[^"]*"; /, '')}${L}${L}${plierBase64(p.contenuBase64)}`)]);
    }
    const entetes = [];
    if (destinataire) entetes.push(`To: ${destinatairesEmail(destinataire).join(', ') || String(destinataire).replace(/[\r\n]+/g, ' ')}`);
    entetes.push(`Subject: ${enteteEncodee(sujet)}`, 'X-Unsent: 1', 'MIME-Version: 1.0');
    return entetes.join(L) + L + corps + L;
  }

  // Nom en ASCII seulement : un nom accentué ou avec un tiret long (« — ») était remplacé par
  // « download » par Chrome (constaté en vérification), sans extension, donc plus ouvrable.
  function nomFichierEml(sujet) {
    const base = String(sujet || 'Email').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\\/:*?"<>|]+/g, '-').replace(/[^\x20-\x7e]+/g, '-')
      .replace(/\s+/g, ' ').replace(/-+/g, '-').trim().slice(0, 90);
    return (base || 'Email') + '.eml';
  }

  function telechargerFichier(contenu, nom, type) {
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(contenu instanceof Blob ? contenu : new Blob([contenu], { type }));
    lien.download = nom;
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
    ouvrirApresTelechargement(nom);
  }

  // Ouverture automatique des documents téléchargés (demandé par l'étude le 29/09) : le navigateur
  // ne peut pas ouvrir seul un fichier téléchargé ; sur un poste où le relais Windows est installé
  // (server/src/ouvertureAuto.js) et l'option activée (Réglages › Sur ce poste), CLAIRE appelle
  // `claire-ouvrir:<extension>` juste après le téléchargement, et le relais ouvre le fichier le plus
  // récent de ce type dans Téléchargements (Outlook pour un .eml, Word pour un .docx…).
  var CLE_OUVERTURE_AUTO = 'claire-ouverture-auto';
  var EXTENSIONS_OUVERTURE_AUTO = ['eml', 'docx', 'doc', 'ics'];
  function ouvertureAutoActive() {
    try { return localStorage.getItem(CLE_OUVERTURE_AUTO) === '1'; } catch (e) { return false; }
  }
  function choisirOuvertureAuto(actif) {
    try { localStorage.setItem(CLE_OUVERTURE_AUTO, actif ? '1' : '0'); } catch (e) { /* sans gravité */ }
  }
  // Pure : l'extension à ouvrir, '' si ce type de fichier n'est pas ouvert automatiquement.
  function extensionOuvertureAuto(nom) {
    const m = /\.([a-z0-9]+)$/i.exec(String(nom || ''));
    const ext = m ? m[1].toLowerCase() : '';
    return EXTENSIONS_OUVERTURE_AUTO.indexOf(ext) !== -1 ? ext : '';
  }
  function ouvrirApresTelechargement(nom) {
    const ext = extensionOuvertureAuto(nom);
    if (!ext || !ouvertureAutoActive()) return;
    // Laisser au navigateur le temps d'écrire le fichier ; le relais attend encore jusqu'à 10 s.
    setTimeout(() => {
      const lien = document.createElement('a');
      lien.href = 'claire-ouvrir:' + ext;
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
    }, 900);
  }
  async function telechargerInstallateurOuvertureAuto() {
    try {
      const r = await fetchAvecAuth('/api/poste/installer-ouverture-automatique');
      if (!r.ok) throw new Error('statut ' + r.status);
      const blob = await r.blob();
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = 'Installer-ouverture-automatique-CLAIRE.vbs';
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
      // Télécharger l'installateur, c'est vouloir l'option : elle s'active d'elle-même sur ce poste.
      choisirOuvertureAuto(true);
      const inter = document.getElementById('reglages-ouverture-auto');
      if (inter) inter.checked = true;
      afficherInfoAction('Installateur téléchargé', 'Ouvrez le fichier téléchargé (le navigateur peut demander de le conserver) : un message confirme l’installation. L’option est activée sur ce poste. Au premier document, autorisez l’ouverture du lien « claire-ouvrir » en cochant « Toujours autoriser ».');
    } catch (e) {
      afficherToast('Téléchargement de l’installateur impossible : ' + e.message, 'OK', null);
    }
  }

  // CLAIRE en application sur un poste (étude 02/10) : un installateur Windows pose les raccourcis du
  // bureau et du menu Démarrer qui ouvrent CLAIRE dans sa propre fenêtre (server/src/installationPoste.js).
  // Une PWA ne s'installe pas sur une adresse http du réseau ; sur le poste serveur (localhost), CLAIRE
  // s'ouvre déjà ainsi : l'option y est masquée.
  function estAdresseLocale(hote) {
    return /^(localhost|127(\.\d+){3}|\[?::1\]?)$/i.test(String(hote || ''));
  }
  async function telechargerInstallateurApplication() {
    try {
      const r = await fetchAvecAuth('/api/poste/installer-application');
      if (!r.ok) throw new Error('statut ' + r.status);
      const blob = await r.blob();
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = 'Installer-CLAIRE-sur-ce-poste.vbs';
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
      afficherInfoAction('Installateur téléchargé', 'Ouvrez le fichier téléchargé (le navigateur peut demander de le conserver) : CLAIRE s’ouvre dans sa propre fenêtre et un raccourci est posé sur le bureau et dans le menu Démarrer. Choisissez une première fois le collaborateur du poste, puis fermez cet onglet. Pour l’avoir toujours sous la main : clic droit sur son icône dans la barre des tâches, « Épingler à la barre des tâches ».');
    } catch (e) {
      afficherToast('Téléchargement de l’installateur impossible : ' + e.message, 'OK', null);
    }
  }

  // Images de la signature : reprises des logos de l'en-tête du courrier d'appel de fonds
  // (appel-de-fonds-modele.js, chargé à la demande). Sans elles, la signature part en texte seul.
  var IMAGES_SIGNATURE_EMAIL = { logoOffice: 'claire-logo-office', logoNotaires: 'claire-logo-notaires', iconVisio: 'claire-visio', iconFacebook: 'claire-facebook', iconInstagram: 'claire-instagram' };
  // Carte et bannière Visio déposées dans Réglages (images de l'étude) : lues une fois par session,
  // relues après un dépôt ou un retrait.
  let imagesSignatureDeposees = null;
  async function chargerImagesSignatureDeposees(forcer) {
    if (imagesSignatureDeposees && !forcer) return imagesSignatureDeposees;
    try {
      const r = await fetchAvecAuth('/api/signature-images');
      imagesSignatureDeposees = r.ok ? await r.json() : {};
    } catch (e) { imagesSignatureDeposees = {}; }
    return imagesSignatureDeposees;
  }
  var CIDS_IMAGES_DEPOSEES = { carte: 'claire-carte', visio: 'claire-banniere-visio' };

  async function imagesSignatureEmail() {
    const deposees = await chargerImagesSignatureDeposees();
    const res = await imagesSignatureLogos();
    for (const [cle, cid] of Object.entries(CIDS_IMAGES_DEPOSEES)) {
      const img = deposees && deposees[cle];
      if (!img || !img.base64) continue;
      res.cids[cle + 'Image'] = { cid, largeur: img.largeur, hauteur: img.hauteur };
      res.parties.push({ cid, type: img.type, base64: img.base64 });
    }
    return res;
  }

  async function imagesSignatureLogos() {
    try {
      if (!window.APPEL_FONDS_MODELE) await afChargerScript('appel-de-fonds-modele.js');
    } catch (e) { return { cids: {}, parties: [] }; }
    const a = (window.APPEL_FONDS_MODELE && window.APPEL_FONDS_MODELE.assets) || {};
    const cids = {};
    const parties = [];
    for (const [cle, cid] of Object.entries(IMAGES_SIGNATURE_EMAIL)) {
      const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(a[cle] || '');
      if (!m) continue;
      cids[cle] = cid;
      parties.push({ cid, type: m[1], base64: m[2] });
    }
    return { cids, parties };
  }

  // Façon d'ouvrir les emails sur CE poste (Réglages › Sur ce poste) : 'outlook' (fichier .eml en
  // HTML, défaut) ou 'mailto' (messagerie par défaut, texte seul, sans pièce jointe).
  var CLE_MODE_EMAIL_POSTE = 'claire-mode-email';
  function modeEmailPoste() {
    try { return localStorage.getItem(CLE_MODE_EMAIL_POSTE) === 'mailto' ? 'mailto' : 'outlook'; } catch (e) { return 'outlook'; }
  }
  function choisirModeEmailPoste(valeur) {
    try { localStorage.setItem(CLE_MODE_EMAIL_POSTE, valeur === 'mailto' ? 'mailto' : 'outlook'); } catch (e) { /* préférence perdue, sans gravité */ }
  }

  // Un brouillon mailto: long peut être tronqué par certaines messageries Windows : le corps est
  // AUSSI copié dans le presse-papiers, dans le même geste (Ctrl+A puis Ctrl+V le rétablit).
  // navigator.clipboard n'existe qu'en contexte sécurisé (absent sur un poste qui rejoint le
  // serveur par son adresse IP) : repli sur un textarea + execCommand, qui marche partout.
  function copierTexteSilencieux(texte) {
    try {
      const zone = document.createElement('textarea');
      zone.value = texte;
      zone.setAttribute('readonly', '');
      zone.style.position = 'fixed';
      zone.style.opacity = '0';
      document.body.appendChild(zone);
      zone.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(zone);
      if (ok) return true;
    } catch (e) { /* repli ci-dessous */ }
    try {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(texte); return true; }
    } catch (e) { /* rien de plus à tenter */ }
    return false;
  }

  // Pure : les adresses d'un champ « destinataire » saisi comme l'étude l'écrit (« a@x.fr; b@y.fr »).
  function destinatairesEmail(texte) {
    return emailsDepuisTexte(texte);
  }

  // Pure : vrai si le champ porte au moins une adresse et seulement des adresses bien formées.
  function adressesEmailValides(texte) {
    const morceaux = String(texte || '').split(/[;,\s]+/).map(e => e.trim()).filter(Boolean);
    return morceaux.length > 0 && morceaux.every(e => emailsDepuisTexte(e).length === 1);
  }

  function ouvrirBrouillonEmail(destinataire, sujet, corps) {
    const copie = copierTexteSilencieux(corps);
    const adresses = destinatairesEmail(destinataire);
    window.location.href = `mailto:${adresses.length ? adresses.map(encodeURIComponent).join(',') : encodeURIComponent(destinataire)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
    return copie;
  }

  var PHRASE_COPIE_BROUILLON = ' Texte également copié : si le brouillon est coupé, Ctrl+A puis Ctrl+V.';

  // Voie d'envoi unique pour les emails d'un dossier. Pose les formules du destinataire
  // (adapterCorpsEmail), puis, selon le poste : fichier .eml HTML avec signature et pièces jointes
  // (défaut), ou mailto: texte seul. Ne toaste pas : { ok, mode, copie, piecesNonJointes } est
  // laissé à l'appelant, qui connaît le contexte. Rien n'est jamais envoyé : l'étude relit, puis
  // clique sur Envoyer.
  // Réglages lus pour la signature (adresses et fonctions des collaborateurs) : ceux déjà chargés
  // par l'écran Réglages, sinon une lecture unique.
  let reglagesSignatureCache = null;
  async function reglagesSignature() {
    if (reglagesEnregistres && Object.keys(reglagesEnregistres.emailsResponsables || {}).length) return reglagesEnregistres;
    if (reglagesSignatureCache) return reglagesSignatureCache;
    try {
      const r = await fetchAvecAuth('/api/reglages');
      if (r.ok) reglagesSignatureCache = await r.json();
    } catch (e) { /* carte avec l'adresse de l'office */ }
    return reglagesSignatureCache || {};
  }

  // Étude, 03/10 : « voir cette interface pour l'envoi des rappels au lieu de les télécharger » — tout email
  // d'un dossier s'ouvre dans la fenêtre d'email de CLAIRE (ouvrirRedactionEmail) : relu, modifié, pièces
  // jointes visibles, puis « Envoyer » (par Exchange, depuis la boîte du collaborateur) ou « Ouvrir dans
  // Outlook » (le fichier .eml d'avant). Rend { ok, mode: 'envoye' | 'eml' | 'mailto', … } ou { ok: false,
  // annule: true } si la fenêtre est fermée sans rien faire — l'appelant ne marque alors rien.
  async function livrerEmailDossier({ destinataire, sujet, corps, pieces = [], confrere = false, responsableSignature = '', boutons = null, dossierId = '', geste = '', reponseA = '' }) {
    const corpsFinal = adapterCorpsEmail(corps, confrere);
    if (modeEmailPoste() === 'mailto') {
      noterEmailPrepare({ dossierId, sujet, destinataire, geste });
      const copie = ouvrirBrouillonEmail(destinataire, sujet, texteSansMarques(texteAvecBoutons(corpsFinal, boutons)));
      return { ok: true, mode: 'mailto', copie, piecesNonJointes: pieces.length > 0 };
    }
    return ouvrirRedactionEmail({ mode: 'nouveau', destinataire, sujet, corps: corpsFinal, pieces, confrere, responsableSignature, boutons, dossierId, geste, reponseA });
  }

  // Le fichier .eml d'avant (« Ouvrir dans Outlook ») : HTML, signature, pièces jointes, prêt à envoyer.
  async function livrerEmlDossier({ destinataire, sujet, corps, pieces = [], responsableSignature = '', boutons = null, dossierId = '', geste = '' }) {
    const corpsFinal = corps;
    try {
      const images = await imagesSignatureEmail();
      const signataire = signataireEmail(utilisateurPoste || responsableSignature, await reglagesSignature());
      const eml = construireEml({
        destinataire, sujet,
        texte: texteSansMarques(texteAvecBoutons(corpsFinal, boutons)) + texteSignatureEmail(signataire),
        html: htmlEmail(corpsFinal, images.cids, signataire, boutons),
        images: images.parties,
        pieces
      });
      telechargerFichier(eml, nomFichierEml(sujet), 'message/rfc822');
      noterEmailPrepare({ dossierId, sujet, destinataire, geste });
      return { ok: true, mode: 'eml' };
    } catch (e) {
      console.error(e);
      return { ok: false, mode: 'eml', message: "L'email n'a pas pu être préparé." };
    }
  }

  // ---- Fenêtre d'email (étude, 03/10, d'après une boîte de réception moderne : l'email reçu en haut, la réponse
  // dessous avec « Proposition de CLAIRE » et « Envoyer ») ----
  // Une seule rédaction à la fois. Deux formes : un email NOUVEAU (relances, RIB, questionnaire, copie de
  // l'acte… : fenêtre #email-redaction-overlay, champs À / Objet modifiables) et une RÉPONSE à un email reçu
  // (carte posée sous l'email dans la fenêtre de lecture, envoyée dans le fil par Exchange). Rien ne part sans
  // le clic sur « Envoyer ».
  var LIBELLE_BOUTONS_REDACTION = '[Boutons de réponse]';
  let redaction = null;

  // Pure : initiales d'un nom (« Camille FOURNIER » → « CF », une adresse → sa première lettre).
  function initialesPersonne(nom) {
    const mots = String(nom || '').replace(/<[^>]*>/g, ' ').split(/[\s@._-]+/).filter(m => /^[A-Za-zÀ-ÿ]/.test(m));
    if (!mots.length) return '?';
    return (mots[0][0] + (mots.length > 1 ? mots[mots.length - 1][0] : '')).toUpperCase();
  }

  // Pure : objet d'une réponse (« RE: » une seule fois).
  function sujetReponse(objet) {
    const o = String(objet || '').trim();
    return /^(?:re|aw)\s*:/i.test(o) ? o : 'RE: ' + (o || '(sans objet)');
  }

  // Pure : début de réponse vide, avec la formule d'usage (étude : « Mon Cher Maître » au confrère).
  function formuleReponseVide(confrere) {
    return confrere
      ? 'Mon Cher Maître,\n\n\n\nDans l’attente et vous en remerciant par avance,\nVotre bien dévoué.'
      : 'Madame, Monsieur,\n\n\n\nBien cordialement,';
  }

  // Pure : le texte montré dans la zone de saisie (marques de mise en forme retirées, boutons nommés) et le
  // chemin inverse (les boutons retrouvent leur place à l'envoi).
  function texteEditableEmail(corps) {
    return texteSansMarques(String(corps || '')).replace('{{BOUTONS}}', LIBELLE_BOUTONS_REDACTION);
  }
  function corpsDepuisTexteEditable(texte, boutons) {
    const t = String(texte || '');
    return boutons && boutons.length ? t.replace(LIBELLE_BOUTONS_REDACTION, '{{BOUTONS}}') : t;
  }

  // Pure : poids réel des pièces jointes (base64 → octets).
  function poidsPiecesEmail(pieces) {
    return (pieces || []).reduce((s, p) => s + Math.floor(String(p && p.contenuBase64 || '').replace(/\s/g, '').length * 3 / 4), 0);
  }

  // Pure : un email reçu attend-il une réponse ? Reçu dans les 14 jours, le plus récent de son expéditeur dans le
  // dossier, sans email envoyé (ni réponse ou accusé préparés depuis CLAIRE) vers cette adresse depuis.
  function emailARepondre(email, emails, prepares, maintenant) {
    if (!email || email.sens !== 'recu' || !email.de || !email.de.adresse) return false;
    const t = Date.parse(email.date);
    const n = maintenant ? Date.parse(maintenant) : Date.now();
    if (!(t >= n - 14 * 86400000)) return false;
    const adr = email.de.adresse.toLowerCase();
    if ((emails || []).some(e => e !== email && e.sens === 'recu' && e.de && String(e.de.adresse).toLowerCase() === adr && Date.parse(e.date) > t)) return false;
    if ((emails || []).some(e => e.sens === 'envoye' && Date.parse(e.date) > t && (e.a || []).some(a => String(a).toLowerCase() === adr))) return false;
    return !(prepares || []).some(p => {
      const g = String(p.geste || '');
      if (g === 'reponse:' + email.id || g === 'accuseReception:' + email.id) return true;
      return Date.parse(p.envoyeLe || p.prepareLe) > t && (p.destinataires || []).some(a => String(a).toLowerCase() === adr);
    });
  }

  // L'envoi direct suppose la connexion Exchange réglée (Réglages › Agenda et Outlook).
  function envoiDirectPossible() {
    return !!(typeof exchangeReglages !== 'undefined' && exchangeReglages && exchangeReglages.actif && exchangeReglages.motDePasseEnregistre);
  }

  function ouvrirRedactionEmail(o) {
    if (redaction && redaction.resolve) redaction.resolve({ ok: false, annule: true });
    return new Promise((resolve) => {
      const texte = texteEditableEmail(o.corps);
      redaction = {
        mode: o.mode === 'reponse' ? 'reponse' : 'nouveau', resolve,
        dossierId: o.dossierId || '', geste: o.geste || '', a: o.destinataire || '', cc: '', voirCc: false,
        sujet: o.sujet || '', texte, texteDepart: texte, corpsOrigine: o.corps || '', pieces: (o.pieces || []).slice(),
        boutons: o.boutons || null, confrere: !!o.confrere, responsableSignature: o.responsableSignature || '',
        reponseA: o.reponseA || '', email: o.email || null, proposition: null, envoi: false, erreur: ''
      };
      if (redaction.mode === 'nouveau') {
        const overlay = document.getElementById('email-redaction-overlay');
        if (overlay) overlay.style.display = 'flex';
      }
      renderRedaction();
      if (redaction.mode === 'reponse' && redaction.reponseA) demanderPropositionReponse(true);
    });
  }

  function fermerRedaction(resultat) {
    const r = redaction;
    redaction = null;
    const overlay = document.getElementById('email-redaction-overlay');
    if (overlay) { overlay.style.display = 'none'; const z = document.getElementById('email-redaction-contenu'); if (z) z.innerHTML = ''; }
    const zoneReponse = document.getElementById('email-reponse-zone');
    if (zoneReponse) zoneReponse.innerHTML = '';
    if (r && r.resolve) r.resolve(resultat || { ok: false, annule: true });
  }
  function abandonnerRedaction() {
    const r = redaction;
    fermerRedaction({ ok: false, annule: true });
    if (r && r.mode === 'reponse') renderInviteReponse();
  }

  function champRedaction(champ, valeur) {
    if (!redaction) return;
    redaction[champ] = valeur;
    if (champ === 'texte' || champ === 'a') majBoutonsRedaction();
  }
  function afficherCcRedaction() {
    if (!redaction) return;
    redaction.voirCc = true;
    renderRedaction();
    const c = document.getElementById('redaction-cc');
    if (c) c.focus();
  }

  async function ajouterPiecesRedaction(input) {
    if (!redaction || !input || !input.files) return;
    for (const f of [...input.files]) {
      try { redaction.pieces.push({ nom: f.name, type: f.type || 'application/octet-stream', contenuBase64: await blobVersBase64(f) }); }
      catch (e) { afficherToast(`« ${f.name} » n’a pas pu être lu.`, 'OK', null); }
    }
    input.value = '';
    renderRedaction();
  }
  function retirerPieceRedaction(i) {
    if (!redaction) return;
    redaction.pieces.splice(i, 1);
    renderRedaction();
  }

  // Menu « Modèles » de la fenêtre d'email (étude, 03/10) : les mieux adaptés à l'email en tête (modelesProposesPourEmail),
  // puis ceux de l'étude et ceux de CLAIRE (versions modifiées
  // comprises), remplis pour le dossier de l'email ; le texte (et l'objet d'un email nouveau) est remplacé, « Annuler le
  // modèle » le rétablit.
  function renderMenuModelesRedaction() {
    const r = redaction;
    const liste = listeModelesEmails(modelesEmailsEtat, { pourFenetre: true });
    const d = r ? dossiers.find(x => x.id === r.dossierId) : null;
    let utiles = [];
    try { if (d) utiles = echangesSelonStade(d, isoAujourdhuiLocal()).utiles; } catch (e) { /* dossier incomplet : sans l'étape */ }
    const proposes = r ? modelesProposesPourEmail(liste, { geste: r.geste, sujet: r.sujet, email: r.mode === 'reponse' ? r.email : null, confrere: r.confrere, utiles }, 3) : [];
    const reste = liste.filter(m => proposes.indexOf(m) === -1);
    const item = (m) => `<button type="button" role="menuitem" class="redaction-menu-item" onclick="appliquerModeleRedaction('${m.type}', '${escapeOnclickArg(m.type === 'perso' ? m.id : m.cle)}')">${escapeHtml(m.nom)}</button>`;
    const perso = reste.filter(m => m.type === 'perso');
    const integres = reste.filter(m => m.type === 'integre');
    return `<div class="redaction-menu" role="menu">
        ${proposes.length ? `<div class="redaction-menu-groupe">Proposés pour cet email</div>${proposes.map(item).join('')}` : ''}
        ${perso.length ? `<div class="redaction-menu-groupe">Mes modèles</div>${perso.map(item).join('')}` : ''}
        ${integres.length ? `<div class="redaction-menu-groupe">Modèles de CLAIRE</div>${integres.map(item).join('')}` : ''}
      </div>`;
  }
  async function basculerMenuModelesRedaction() {
    if (!redaction) return;
    redaction.menuModeles = !redaction.menuModeles;
    renderRedaction();
    if (redaction && redaction.menuModeles) { await chargerModelesEmails(); if (redaction && redaction.menuModeles) renderRedaction(); }
  }
  function appliquerModeleRedaction(type, ref) {
    const r = redaction;
    if (!r) return;
    const m = listeModelesEmails(modelesEmailsEtat).find(x => x.type === type && (type === 'perso' ? x.id === ref : x.cle === ref));
    if (!m) return;
    const d = dossiers.find(x => x.id === r.dossierId) || null;
    const rempli = remplirModeleEmail(m, d);
    r.avantModele = { texte: r.texte, texteDepart: r.texteDepart, corpsOrigine: r.corpsOrigine, sujet: r.sujet, proposition: r.proposition };
    const corps = adapterCorpsEmail(rempli.corps, r.confrere);
    r.corpsOrigine = corps;
    r.texte = texteEditableEmail(corps);
    r.texteDepart = r.texte;
    r.proposition = null;
    if (r.mode === 'nouveau' && rempli.sujet) r.sujet = rempli.sujet;
    r.menuModeles = false;
    renderRedaction();
  }
  function annulerModeleRedaction() {
    const r = redaction;
    if (!r || !r.avantModele) return;
    Object.assign(r, r.avantModele);
    r.avantModele = null;
    renderRedaction();
  }
  document.addEventListener('click', (e) => {
    if (redaction && redaction.menuModeles && !(e.target && e.target.closest && e.target.closest('.redaction-modeles'))) { redaction.menuModeles = false; renderRedaction(); }
  });

  // Premier jet de réponse par l'IA locale (Ollama, sur le serveur) : posé dans la zone seulement si rien n'a
  // encore été écrit, sinon proposé d'un clic. Jamais envoyé seul.
  async function demanderPropositionReponse(auto) {
    const r = redaction;
    if (!r || !r.reponseA) return;
    r.proposition = { etat: 'attente' };
    renderRedaction();
    const d = dossiers.find(x => x.id === r.dossierId);
    try {
      const rep = await fetchAvecAuth('/api/emails-dossiers/proposition', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: r.reponseA, dossier: d ? libelleDossierAffiche(d) : '', confrere: r.confrere }) });
      const corps = await rep.json().catch(() => ({}));
      if (redaction !== r) return;
      if (!rep.ok || !corps.reponse) throw new Error(corps.erreur || 'indisponible');
      const intact = r.texte === r.texteDepart;
      r.proposition = { etat: 'pret', texte: String(corps.reponse) };
      if (intact) { r.texte = r.proposition.texte; r.texteDepart = r.texte; r.proposition.posee = true; }
      renderRedaction();
    } catch (e) {
      if (redaction !== r) return;
      r.proposition = auto ? null : { etat: 'erreur', message: e.message };
      renderRedaction();
    }
  }
  function utiliserPropositionReponse() {
    if (!redaction || !redaction.proposition || !redaction.proposition.texte) return;
    redaction.texte = redaction.proposition.texte;
    redaction.texteDepart = redaction.texte;
    redaction.proposition.posee = true;
    renderRedaction();
  }

  function etatEnvoiRedaction() {
    const r = redaction;
    if (!r) return { possible: false };
    const poids = poidsPiecesEmail(r.pieces);
    const adresses = destinatairesEmail(r.a);
    const motif = !adresses.length ? 'Ajoutez un destinataire.'
      : !String(r.texte || '').trim() ? 'Écrivez le message.'
      : String(r.texte).includes('[lien WeTransfer à coller ici]') ? 'Collez le lien WeTransfer dans le message.'
      : /\[à compléter\]/i.test(r.texte) ? 'Complétez les passages « [à compléter] » de la proposition.'
      : poids > LIMITE_PIECES_JOINTES_OCTETS ? `Plus de 21 Mo de pièces jointes : retirez-en ou passez par WeTransfer.` : '';
    return { possible: !motif, motif, poids };
  }
  function majBoutonsRedaction() {
    const e = etatEnvoiRedaction();
    const b = document.getElementById('redaction-envoyer');
    if (b) { b.disabled = !e.possible || !!(redaction && redaction.envoi); b.title = e.motif || ''; }
    const m = document.getElementById('redaction-motif');
    if (m) m.textContent = e.motif && e.motif !== 'Ajoutez un destinataire.' && e.motif !== 'Écrivez le message.' ? e.motif : e.poids ? tailleLisible(e.poids) : '';
  }

  function renderCarteRedaction() {
    const r = redaction;
    const etat = etatEnvoiRedaction();
    const direct = envoiDirectPossible();
    const qui = utilisateurPoste || r.responsableSignature || 'Compte relié';
    const prop = r.proposition;
    const pastille = !prop ? (r.reponseA ? `<button type="button" class="redaction-pastille" onclick="demanderPropositionReponse(false)" title="Demander un premier jet de réponse à l’IA locale (sur le serveur du bureau)">${icone('sparkle')}Proposer une réponse</button>` : '')
      : prop.etat === 'attente' ? `<span class="redaction-pastille redaction-pastille-attente">${icone('spinner')}CLAIRE rédige…</span>`
      : prop.etat === 'erreur' ? `<span class="redaction-pastille redaction-pastille-erreur" title="${escapeAttr(prop.message || '')}">Proposition indisponible</span>`
      : prop.posee ? `<span class="redaction-pastille" title="Premier jet de l’IA locale : relisez avant d’envoyer">${icone('sparkle')}Proposition de CLAIRE</span>`
      : `<button type="button" class="redaction-pastille" onclick="utiliserPropositionReponse()">${icone('sparkle')}Utiliser la proposition de CLAIRE</button>`;
    const pieces = r.pieces.map((p, i) => `<span class="redaction-piece">${icone('file-text')}<span class="redaction-piece-nom">${escapeHtml(p.nom)}</span><span class="redaction-piece-taille">${escapeHtml(tailleLisible(poidsPiecesEmail([p])))}</span><button type="button" class="icon-btn" onclick="retirerPieceRedaction(${i})" aria-label="Retirer ${escapeAttr(p.nom)}">${icone('x')}</button></span>`).join('');
    const lignes = Math.min(18, Math.max(r.mode === 'reponse' ? 5 : 8, String(r.texte).split('\n').length + 1));
    return `<div class="redaction-carte">
        <div class="redaction-ligne redaction-de"><span class="redaction-etiquette">De</span><span>${escapeHtml(qui)}</span>${pastille}</div>
        <div class="redaction-ligne"><label class="redaction-etiquette" for="redaction-a">À</label>
          <input type="text" id="redaction-a" class="redaction-champ" value="${escapeAttr(r.a)}" oninput="champRedaction('a', this.value)" autocomplete="off" spellcheck="false">
          ${r.voirCc ? '' : `<button type="button" class="lien-discret" onclick="afficherCcRedaction()">Cc</button>`}</div>
        ${r.voirCc ? `<div class="redaction-ligne"><label class="redaction-etiquette" for="redaction-cc">Cc</label><input type="text" id="redaction-cc" class="redaction-champ" value="${escapeAttr(r.cc)}" oninput="champRedaction('cc', this.value)" autocomplete="off" spellcheck="false"></div>` : ''}
        ${r.mode === 'nouveau' ? `<div class="redaction-ligne"><label class="redaction-etiquette" for="redaction-sujet">Objet</label><input type="text" id="redaction-sujet" class="redaction-champ" value="${escapeAttr(r.sujet)}" oninput="champRedaction('sujet', this.value)"></div>` : ''}
        <textarea id="redaction-texte" class="redaction-texte" rows="${lignes}" aria-label="Message" oninput="champRedaction('texte', this.value)">${escapeHtml(r.texte)}</textarea>
        ${pieces ? `<div class="redaction-pieces">${pieces}</div>` : ''}
        ${r.erreur ? `<p class="redaction-erreur">${escapeHtml(r.erreur)}</p>` : ''}
        <div class="redaction-pied">
          <label class="icon-btn redaction-joindre" title="Joindre un fichier">${icone('paperclip')}<input type="file" multiple hidden onchange="ajouterPiecesRedaction(this)"></label>
          <div class="redaction-modeles">
            <button type="button" class="icon-btn redaction-modeles-btn" onclick="basculerMenuModelesRedaction()" aria-expanded="${r.menuModeles ? 'true' : 'false'}" title="Remplacer le texte par un modèle">${icone('file-text')}<span>Modèles</span></button>
            ${r.menuModeles ? renderMenuModelesRedaction() : ''}
          </div>
          ${r.avantModele ? '<button type="button" class="lien-discret redaction-annuler-modele" onclick="annulerModeleRedaction()">Annuler le modèle</button>' : ''}
          <button type="button" class="icon-btn" onclick="abandonnerRedaction()" title="Abandonner cet email" aria-label="Abandonner cet email">${icone('trash')}</button>
          <span class="redaction-pied-espace" id="redaction-motif">${escapeHtml(etat.motif && etat.motif !== 'Ajoutez un destinataire.' && etat.motif !== 'Écrivez le message.' ? etat.motif : etat.poids ? tailleLisible(etat.poids) : '')}</span>
          <button type="button" class="${direct ? 'lien-discret' : 'primary'}" onclick="ouvrirRedactionDansOutlook()" title="Télécharger l’email pour l’ouvrir dans Outlook">Ouvrir dans Outlook</button>
          ${direct ? `<button type="button" class="primary redaction-envoyer" id="redaction-envoyer" onclick="envoyerRedaction()"${etat.possible && !r.envoi ? '' : ' disabled'} title="${escapeAttr(etat.motif || '')}">${icone(r.envoi ? 'spinner' : 'send')}${r.envoi ? 'Envoi…' : 'Envoyer'}</button>` : ''}
        </div>
      </div>`;
  }

  function renderRedaction() {
    const r = redaction;
    if (!r) return;
    const actif = document.activeElement && document.activeElement.id;
    if (r.mode === 'nouveau') {
      const zone = document.getElementById('email-redaction-contenu');
      if (!zone) return;
      const d = dossiers.find(x => x.id === r.dossierId);
      const emailCite = r.reponseA && d ? ((emailsParDossier[d.id] || {}).emails || []).find(e => e.id === r.reponseA) : null;
      zone.innerHTML = `<div class="redaction-tete">
          <button type="button" class="icon-btn" onclick="abandonnerRedaction()" aria-label="Fermer">${icone('chevron-left')}</button>
          <div class="redaction-titre" id="email-redaction-titre">${escapeHtml(r.sujet || 'Nouvel email')}</div>
          ${d && !String(r.sujet || '').includes(libelleDossierAffiche(d)) ? `<span class="redaction-dossier">${escapeHtml(libelleDossierAffiche(d))}</span>` : ''}
        </div>
        ${emailCite ? `<p class="hint redaction-cite">En réponse à l’email de ${escapeHtml(emailCite.de.nom || emailCite.de.adresse)} du ${escapeHtml(dateCourteEmail(emailCite.date))}, dans le même fil.</p>` : ''}
        ${envoiDirectPossible() ? '' : '<p class="hint">Envoi direct indisponible : la connexion Exchange n’est pas réglée (Réglages › Agenda et Outlook).</p>'}
        ${renderCarteRedaction()}`;
    } else {
      const zone = document.getElementById('email-reponse-zone');
      if (!zone) return;
      zone.innerHTML = renderCarteRedaction();
    }
    if (actif && document.getElementById(actif)) {
      const el = document.getElementById(actif);
      el.focus();
      if (el.setSelectionRange && typeof el.value === 'string') { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* champ sans sélection */ } }
    }
  }

  async function envoyerRedaction() {
    const r = redaction;
    if (!r || r.envoi) return;
    const etat = etatEnvoiRedaction();
    if (!etat.possible) { r.erreur = etat.motif; renderRedaction(); return; }
    r.envoi = true; r.erreur = '';
    renderRedaction();
    try {
      const corps = r.texte === r.texteDepart && !r.proposition ? r.corpsOrigine : corpsDepuisTexteEditable(r.texte, r.boutons);
      const images = await imagesSignatureEmail();
      const signataire = signataireEmail(utilisateurPoste || r.responsableSignature, await reglagesSignature());
      const html = htmlEmail(corps, images.cids, signataire, r.boutons);
      const reponse = await fetchAvecAuth('/api/emails/envoyer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        dossierId: r.dossierId, geste: r.geste || (r.reponseA ? 'reponse:' + r.reponseA : ''), collaborateur: utilisateurPoste || r.responsableSignature,
        a: r.a, cc: r.cc, sujet: r.mode === 'reponse' ? sujetReponse((r.email && r.email.objet) || r.sujet) : r.sujet, html,
        pieces: r.pieces, images: images.parties.map(p => ({ nom: p.cid + '.' + String(p.type).split('/')[1], type: p.type, contentId: p.cid, contenuBase64: p.base64 })),
        reponseA: r.reponseA ? { emailId: r.reponseA } : null
      }) });
      const res = await reponse.json().catch(() => ({}));
      if (redaction !== r) return;
      if (!reponse.ok || !res.ok) throw new Error(res.message || res.erreur || 'statut ' + reponse.status);
      if (r.dossierId) delete emailsParDossier[r.dossierId];
      const mode = r.mode;
      fermerRedaction({ ok: true, mode: 'envoye', repli: !!res.repli, de: res.de || '' });
      if (mode === 'reponse') reponseEnvoyee(r, res);
    } catch (e) {
      if (redaction !== r) return;
      r.envoi = false;
      r.erreur = 'Email non envoyé : ' + e.message;
      renderRedaction();
    }
  }

  // « Ouvrir dans Outlook » : le fichier .eml d'avant, avec ce qui a été écrit dans la fenêtre.
  async function ouvrirRedactionDansOutlook() {
    const r = redaction;
    if (!r) return;
    const corps = r.texte === r.texteDepart && !r.proposition ? r.corpsOrigine : corpsDepuisTexteEditable(r.texte, r.boutons);
    const res = await livrerEmlDossier({ destinataire: r.a, sujet: r.mode === 'reponse' ? sujetReponse((r.email && r.email.objet) || r.sujet) : r.sujet,
      corps, pieces: r.pieces, responsableSignature: r.responsableSignature, boutons: r.boutons, dossierId: r.dossierId, geste: r.geste || (r.reponseA ? 'reponse:' + r.reponseA : '') });
    if (!res.ok) { r.erreur = res.message || 'L’email n’a pas pu être préparé.'; renderRedaction(); return; }
    const mode = r.mode;
    fermerRedaction(res);
    if (mode === 'reponse') { fermerEmailComplet(); annoncerEmailPret(res, true); }
  }

  // Réponse à un email reçu, depuis la fenêtre de lecture (la carte est posée sous l'email).
  function repondreEmail(dossierId, emailId) {
    const d = dossiers.find(x => x.id === dossierId);
    const email = ((emailsParDossier[dossierId] || {}).emails || []).find(e => e.id === emailId);
    if (!d || !email || !email.de || !email.de.adresse) return;
    const confrere = expediteurConfrere(d, email.de.adresse, carnetConfreres);
    ouvrirRedactionEmail({ mode: 'reponse', destinataire: email.de.adresse, sujet: email.objet, corps: formuleReponseVide(confrere), confrere,
      responsableSignature: d.responsable, dossierId, geste: 'reponse:' + email.id, reponseA: email.id, email })
      .then(res => { if (res && res.ok && res.mode === 'envoye') annoncerEmailPret(res, true); });
  }

  function reponseEnvoyee(r, res) {
    const d = dossiers.find(x => x.id === r.dossierId);
    if (d) {
      ajouterHistorique(d, `Email envoyé — réponse à ${(r.email && (r.email.de.nom || r.email.de.adresse)) || r.a}`);
      sauvegarder(d);
    }
    fermerEmailComplet();
    if (d) setTimeout(() => chargerEmailsDossier(d.id), 800);
    render();
  }

  // Invitation à répondre sous un email reçu (la carte complète s'ouvre au clic).
  function renderInviteReponse() {
    const zone = document.getElementById('email-reponse-zone');
    if (!zone || !zone.dataset.dossier) return;
    zone.innerHTML = `<button type="button" class="redaction-invite" onclick="repondreEmail('${escapeOnclickArg(zone.dataset.dossier)}', '${escapeOnclickArg(zone.dataset.email)}')">${icone('mail')}Répondre à ${escapeHtml(zone.dataset.nom || 'l’expéditeur')}…</button>`;
  }

  // Échap ferme la fenêtre d'email (abandon), pas la fiche derrière.
  window.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('email-redaction-overlay');
    if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') { e.stopPropagation(); abandonnerRedaction(); }
  }, true);

  // Pure : « Email envoyé » quand il est parti de CLAIRE, « Email préparé » quand il a été ouvert dans Outlook.
  function libelleEmailFait(r) { return r && r.mode === 'envoye' ? 'Email envoyé' : 'Email préparé'; }

  var MESSAGE_EMAIL_PRET = 'Ouvrez le fichier téléchargé : il s’ouvre dans Outlook, prêt à envoyer. Pour qu’il s’ouvre seul la prochaine fois : clic droit sur le téléchargement › « Toujours ouvrir ce type de fichier ».';

  // Message à afficher après une préparation réussie (fenêtre si `discret` est faux, notification
  // sinon). `detail` complète le message (ex. dossier archivé).
  function annoncerEmailPret(r, discret, detail) {
    const suite = detail ? ' ' + detail : '';
    if (r.mode === 'envoye') {
      afficherToast('Email envoyé' + (r.repli ? ' depuis la boîte du compte relié (droit « Envoyer en tant que » pas encore donné).' : '.') + suite, 'OK', null);
      return;
    }
    if (r.mode === 'eml') {
      if (discret || ouvertureAutoActive()) { afficherToast((ouvertureAutoActive() ? 'Email prêt — il s’ouvre dans Outlook.' : 'Email prêt — ouvrez le fichier téléchargé.') + suite, 'OK', null); return; }
      afficherInfoAction('Email prêt', MESSAGE_EMAIL_PRET + suite);
      return;
    }
    if (discret) { afficherToast('Brouillon ouvert — relisez-le puis envoyez-le.' + suite, 'OK', null); return; }
    afficherInfoAction('Brouillon ouvert', 'Relisez-le puis envoyez-le depuis votre messagerie.' + suite + (r.copie ? PHRASE_COPIE_BROUILLON : ''));
  }

  function construireEmailRelancePret(d) {
    return {
      sujet: `Relance — Offre de prêt attendue — ${libelleDossierAffiche(d)}`,
      corps: corpsRelanceOffreManquante(d.nom, d.pret, d.pret ? joursRestants(d.pret) : null)
    };
  }

  // Texte fourni mot pour mot par l'étude (25/09) : RIB et pièce d'identité à apporter au
  // rendez-vous de signature. La signature de l'office est ajoutée à l'envoi (livrerEmailDossier).
  function construireEmailRelanceRib(d) {
    return {
      sujet: `RIB et pièce d'identité pour le rendez-vous de signature — ${libelleDossierAffiche(d)}`,
      corps: ['Bonjour,',
        'En prévision du rendez-vous de signature je vous remercie de vous munir de votre RIB et de votre pièce d’identité.',
        'Bien cordialement,'].join('\n\n')
    };
  }

  // Relance sur la vente préalable (demandée par l'étude, 28/09) : au client, ou au confrère quand
  // un autre office représente l'acquéreur. Le texte au CONFRÈRE est celui fourni mot pour mot par
  // l'étude (seule retouche : « une date … est déjà prévue », accord de « prévu » corrigé) ; celui au
  // client reste un brouillon à ajuster. Le temps s'accorde à la date : « est prévue » tant qu'elle
  // est à venir, « devait intervenir » une fois passée. Les formules d'appel et de clôture sont
  // reposées à l'envoi selon le destinataire (adapterCorpsEmail).
  function construireEmailRelanceVentePrealable(d) {
    const date = d.ventebien ? formatDateFr(d.ventebien) : '';
    const passee = d.ventebien && ecartJours(isoAujourdhuiLocal(), d.ventebien) < 0;
    const echeance = date ? (passee ? ` devait intervenir au plus tard le ${date}` : ` est prévue au plus tard le ${date}`) : ' reste à réaliser';
    if (notaireParticipantRepresenteAcquereur(d)) {
      return {
        sujet: `Vente préalable — ${libelleDossierAffiche(d)}`,
        corps: [FORMULE_APPEL_CONFRERE,
          `Dans le cadre de ce dossier, l'avant-contrat est conclu sous la condition de la vente préalable du bien de votre client, qui${echeance}.`,
          'Pourriez-vous nous indiquer si une date de réitération est déjà prévue sur votre agenda ou nous transmettre, le cas échéant, l’attestation de vente ?',
          FORMULE_CLOTURE_CONFRERE].join('\n\n')
      };
    }
    return {
      sujet: `Vente préalable de votre bien — ${libelleDossierAffiche(d)}`,
      corps: ['Bonjour,',
        `Votre acquisition est conclue sous la condition de la vente préalable de votre bien, qui${echeance}.`,
        'Pourriez-vous nous indiquer où en est cette vente (avant-contrat signé, date de signature prévue) ? Dès qu’elle sera signée, merci de nous transmettre l’attestation de vente.',
        'Bien cordialement,'].join('\n\n')
    };
  }

  // Email de "démarrage" du dossier : texte fourni mot pour mot par l'étude (25/09). Une ligne
  // vide entre chaque paragraphe, les deux pièces demandées sur deux lignes consécutives ; la
  // formule de clôture et la signature sont ajoutées à l'envoi. Seul écart au texte : le nom de
  // l'agence suit « auprès de l'agence » quand il a été détecté (voir detecterNomAgence()). La
  // phrase sur l'offre de prêt n'est ajoutée que si une condition de prêt est active et pas
  // encore levée — inutile de la réclamer sur un achat comptant ou une offre déjà reçue.
  function construireEmailRelanceProvision(d) {
    const agence = d.nomAgence ? `auprès de l'agence ${d.nomAgence}` : "auprès de l'agence";
    const paragraphes = [
      'Bonjour,',
      `Nous vous confirmons la bonne réception de votre avant-contrat signé ${agence}.`,
      "Afin de poursuivre la constitution de votre dossier, merci de nous adresser :\n- une provision sur frais de 100,00 € ;\n- une copie de votre pièce d'identité en cours de validité."
    ];
    if (!d.sansPret && d.offrePretStatut !== 'recue') {
      paragraphes.push("Si votre acquisition est soumise à l'obtention d'un prêt, merci également de nous transmettre votre offre de prêt dès que vous l'aurez reçue.");
    }
    return {
      sujet: `Demande de provision sur frais et pièce d'identité — ${libelleDossierAffiche(d)}`,
      corps: paragraphes.join('\n\n')
    };
  }

  // Confirmation de réception des fonds, demandée par l'étude : l'acquéreur a viré le montant de
  // l'appel de fonds, on lui confirme que les fonds sont bien arrivés en comptabilité. La ligne
  // d'action vit dans l'onglet Échanges et n'apparaît qu'une fois
  // cet appel de fonds validé (voir renderFondsRecus, qui la propose une fois les fonds vérifiés) : avant, il n'y a rien à
  // confirmer. Le rendez-vous de signature n'est rappelé que s'il est fixé — jamais la date butoir
  // de l'avant-contrat, qui n'est qu'indicative et induirait le client en erreur.
  // Pure : « 11:00 » → « 11h », « 10:30 » → « 10h30 » (forme du modèle de l'étude).
  function heureEmail(heure) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(heure || ''));
    if (!m) return '';
    return `${Number(m[1])}h${m[2] === '00' ? '' : m[2]}`;
  }

  // « lundi 5 octobre 2026 » : le jour de la semaine devant la date (demandé par l'étude le 29/09).
  function dateAvecJourFr(iso) {
    if (!iso) return '';
    return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Passage à mettre en gras et souligné dans l'email HTML (date et heure du rendez-vous) : marqué
  // dans le corps par deux caractères privés, rendus <b><u> par htmlEmail et l'aperçu, retirés du
  // texte simple (mailto, version texte du .eml).
  var MARQUE_FORT_DEBUT = '\uE000';
  var MARQUE_FORT_FIN = '\uE001';
  function texteSansMarques(t) {
    return String(t == null ? '' : t).split(MARQUE_FORT_DEBUT).join('').split(MARQUE_FORT_FIN).join('');
  }
  function marquesEnHtml(html) {
    return String(html).split(MARQUE_FORT_DEBUT).join('<b><u>').split(MARQUE_FORT_FIN).join('</u></b>');
  }

  // Texte fourni par l'étude le 29/09, repris mot pour mot (heure du rendez-vous, pièces d'identité
  // et RIB) ; l'heure n'est écrite que si elle est connue (saisie à la création du rendez-vous ou
  // relevée dans l'agenda).
  function construireEmailReceptionFonds(d) {
    const heure = heureEmail(d.rendezVousSignatureHeure);
    const rdv = d.rendezVousSignature
      ? `\n\nNous vous rappelons que le rendez-vous de signature de l'acte authentique est fixé au ${MARQUE_FORT_DEBUT}${dateAvecJourFr(d.rendezVousSignature)}${heure ? ' à ' + heure : ''}${MARQUE_FORT_FIN}, en notre office.`
        // Au confrère, pas de pièces d'identité ni de RIB à réclamer (demandé par l'étude le 29/09).
        + (notaireParticipantRepresenteAcquereur(d) ? '' : '\n\nJe vous remercie de vous munir de vos pièces d’identité et de votre RIB pour le rendez-vous.')
      : '';
    return {
      sujet: `Réception des fonds — ${libelleDossierAffiche(d)}`,
      // Nom du dossier retiré du CORPS à la demande de l'étude (il reste dans l'objet) : le client
      // sait de quelle acquisition il s'agit, le rappeler dans le texte n'apporte rien.
      corps: `Bonjour,\n\nNous vous confirmons que les fonds destinés à votre acquisition ont bien été reçus en notre comptabilité.${rdv}\n\nNous restons à votre disposition pour toute question.`
    };
  }

  // Envoi du projet d'acte au client (demandé par l'étude le 30/09), avec le rappel du rendez-vous
  // de signature comme dans la confirmation de réception des fonds. Le projet lui-même est un
  // document Word de l'office que CLAIRE ne détient pas : il se joint dans Outlook, l'email le dit.
  // Texte : premier jet de CLAIRE (l'étude n'a pas encore fourni le sien — à remplacer mot pour mot
  // dès qu'elle le donne, comme les autres emails).
  function construireEmailProjetActe(d) {
    const heure = heureEmail(d.rendezVousSignatureHeure);
    const rdv = d.rendezVousSignature
      ? `\n\nNous vous rappelons que le rendez-vous de signature de l'acte authentique est fixé au ${MARQUE_FORT_DEBUT}${dateAvecJourFr(d.rendezVousSignature)}${heure ? ' à ' + heure : ''}${MARQUE_FORT_FIN}, en notre office.`
      : '';
    return {
      sujet: `Projet d'acte de vente — ${libelleDossierAffiche(d)}`,
      corps: `Bonjour,\n\nVeuillez trouver ci-joint le projet de l'acte de vente, pour lecture avant la signature.${rdv}\n\nNous restons à votre disposition pour toute question ou remarque sur ce projet.`
    };
  }

  // Une entrée par motif de relance : le libellé du bouton, le modèle d'email, et la condition qui
  // le rend pertinent pour CE dossier (pas de relance "prêt" sur un achat comptant, pas de relance
  // "pièces" si tout est déjà reçu) — évaluée à l'affichage par echangesSelonStade().
  var MODELES_EMAIL_RELANCE = {
    provision: { cle: 'provision', libelle: 'Provision + pièce d’identité', construire: d => emailDepuisModele('provision', d), historique: 'Relance manuelle envoyée — provision sur frais et pièce d’identité', date: 'provisionDemandeeLe' },
    pret: { cle: 'pret', libelle: 'Prêt manquant', construire: d => emailDepuisModele('pret', d), historique: 'Relance manuelle envoyée — offre de prêt' },
    rib: { cle: 'rib', libelle: 'RIB', construire: d => emailDepuisModele('rib', d), historique: 'Relance manuelle envoyée — RIB', date: 'ribDemandeLe' },
    ventePrealable: { cle: 'ventePrealable', libelle: 'Vente préalable', construire: d => emailDepuisModele('ventePrealable', d), historique: 'Relance envoyée — vente préalable', date: 'relanceVentePrealableLe' },
    // `date` : champ du dossier qui mémorise l'envoi, pour que la carte dise ensuite « confirmée le … ».
    fonds: { cle: 'fonds', libelle: 'Confirmer la réception des fonds', construire: d => emailDepuisModele('fonds', d), historique: 'Email envoyé — confirmation de réception des fonds en comptabilité', date: 'receptionFondsConfirmeeLe' },
    // L'envoi du projet EST l'étape « Envoi projet » du dossier : sa date est d.projetEnvoye (même
    // effet que la date saisie sur la fiche ou « Marquer envoyé », agenda compris).
    projet: { cle: 'projet', libelle: 'Projet d’acte', construire: d => emailDepuisModele('projet', d), historique: 'Email envoyé — projet d’acte', date: 'projetEnvoye' },
    // Relation client (page Agenda, 30/09) : confirmation du rendez-vous — mémorisée pour CETTE date
    // (confirmationRdvPour), un rendez-vous déplacé la repropose —, et un mot un an après la signature.
    // Le rappel du rendez-vous à part a été retiré le 03/10 (étude).
    confirmationRdv: { cle: 'confirmationRdv', libelle: 'Confirmer le rendez-vous de signature', construire: d => emailDepuisModele('confirmationRdv', d), historique: 'Email envoyé — confirmation du rendez-vous de signature', date: 'confirmationRdvLe' },
    // Fonds pas encore reçus à J-3 du rendez-vous (étude, 03/10) — premier jet de CLAIRE, à remplacer par le texte de l'étude.
    relanceFonds: { cle: 'relanceFonds', libelle: 'Relancer pour les fonds', construire: d => emailDepuisModele('relanceFonds', d), historique: 'Email envoyé — relance : fonds pas encore reçus', date: 'relanceFondsLe' },
    anniversaire: { cle: 'anniversaire', libelle: 'Un an après la signature', construire: d => emailDepuisModele('anniversaire', d), historique: 'Email envoyé — un an après la signature', date: 'anniversaireEnvoyeLe' }
  };

  // Premiers jets de CLAIRE (comme l'email du projet d'acte) : à remplacer par les textes de l'étude
  // dès qu'elle les fournit. La date et l'heure du rendez-vous sont en gras et soulignées.
  function lieuRdvEmail(d, auConfrere) {
    const t = typeRendezVous(d, categoriesRdvReglees());
    if (t === 'visio') return 'en visioconférence (le lien de connexion vous sera communiqué)';
    if (t === 'confrere') return auConfrere ? 'en votre office' : 'en l’office du notaire de l’acquéreur';
    return 'en notre office';
  }
  function quandRdvEmail(d) {
    return `${MARQUE_FORT_DEBUT}le ${dateAvecJourFr(d.rendezVousSignature)}${d.rendezVousSignatureHeure ? ' à ' + heureEmail(d.rendezVousSignatureHeure) : ''}${MARQUE_FORT_FIN}`;
  }
  function construireEmailConfirmationRdv(d) {
    const confrere = notaireParticipantRepresenteAcquereur(d);
    const sujet = `Confirmation du rendez-vous de signature — ${libelleDossierAffiche(d)}`;
    if (confrere) {
      return { sujet, corps: ['Bonjour,',
        `Je vous confirme le rendez-vous de signature de l’acte de vente ${quandRdvEmail(d)}, ${lieuRdvEmail(d, true)}.`,
        'Je vous remercie de bien vouloir me faire parvenir, le cas échéant, vos observations sur le projet d’acte.',
        'Bien cordialement,'].join('\n\n') };
    }
    return { sujet, corps: ['Bonjour,',
      `Nous vous confirmons le rendez-vous de signature de l’acte de vente ${quandRdvEmail(d)}, ${lieuRdvEmail(d, false)}.`,
      'Merci de vous munir d’une pièce d’identité en cours de validité. Les fonds nécessaires à l’acquisition devront nous parvenir par virement quelques jours avant le rendez-vous.',
      'Nous restons à votre disposition pour toute question.',
      'Bien cordialement,'].join('\n\n') };
  }
  // Fonds pas encore arrivés à 3 jours du rendez-vous (étude, 03/10) : au client seulement — quand un
  // confrère représente l'acquéreur, c'est son office qui s'occupe de ses fonds. Premier jet de CLAIRE.
  function construireEmailRelanceFonds(d) {
    return { sujet: `Fonds à nous faire parvenir — ${libelleDossierAffiche(d)}`, corps: ['Bonjour,',
      'Sauf erreur de notre part, les fonds destinés à votre acquisition ne nous sont pas encore parvenus en comptabilité.',
      `Le rendez-vous de signature de l’acte authentique est fixé ${quandRdvEmail(d)}, ${lieuRdvEmail(d, false)}. Pour qu’il puisse se tenir, nous vous remercions de bien vouloir effectuer le virement dès que possible, selon les indications de notre appel de fonds.`,
      'Si le virement a déjà été effectué, merci de nous en adresser le justificatif en réponse à cet email.',
      'Nous restons à votre disposition pour toute question.',
      'Bien cordialement,'].join('\n\n') };
  }
  function construireEmailAnniversaire(d) {
    return { sujet: `Un an déjà — ${libelleDossierAffiche(d)}`, corps: ['Bonjour,',
      'Il y a un an, vous signiez l’acte d’acquisition de votre bien. Toute l’équipe de l’office espère que vous vous y plaisez.',
      'Nous restons à votre disposition pour tout nouveau projet : donation, testament, contrat de mariage ou de PACS, succession, ou une nouvelle acquisition.',
      'Bien cordialement,'].join('\n\n') };
  }
  // ---- Modèles d'emails (étude, 03/10 : « un créateur de modèles d'emails dans les réglages, qu'on retrouve dans
  // l'interface email ; que je puisse éditer les modèles, mets déjà ceux existants » ; choix : les boutons de la fiche
  // suivent un modèle modifié) ----
  // Chaque modèle d'origine a sa version « à variables » (les mêmes textes que les fonctions construireEmail…, qui
  // restent la voie tant que l'étude n'a rien modifié). Une variable s'écrit entre accolades ; un paragraphe dont une
  // variable est vide disparaît ; un paragraphe qui commence par {si …} n'apparaît que dans ce cas.
  var VARIABLES_MODELE_EMAIL = [
    { nom: 'dossier', aide: 'VTE - NOM du dossier' },
    { nom: 'l’agence', aide: '« l’agence » suivi de son nom s’il est connu' },
    { nom: 'date et heure du rendez-vous', aide: 'en gras et souligné ; vide sans rendez-vous' },
    { nom: 'lieu du rendez-vous', aide: '« en notre office », visio ou office du confrère' },
    { nom: 'échéance du prêt', aide: '« est fixée au … » / « était fixée au … »' },
    { nom: 'échéance de la vente préalable', aide: '« est prévue au plus tard le … », « devait intervenir… » ou « reste à réaliser »' },
    { nom: 'date de signature', aide: 'date de l’acte (rendez-vous de signature)' },
    { nom: 'lien avis Google', aide: 'adresse pour laisser un avis sur l’office' }
  ];
  var CONDITIONS_MODELE_EMAIL = [
    { nom: 'si client', aide: 'au client seulement (pas quand un confrère représente l’acquéreur)' },
    { nom: 'si confrère', aide: 'au confrère seulement' },
    { nom: 'si rendez-vous', aide: 'seulement si le rendez-vous de signature est fixé' },
    { nom: 'si prêt attendu', aide: 'seulement si une offre de prêt est encore attendue' }
  ];

  function nomVariableModele(t) { return String(t || '').replace(/[’`]/g, '\'').replace(/\s+/g, ' ').trim().toLowerCase(); }

  // Valeur d'une variable pour ce dossier ; null pour une variable inconnue (laissée telle quelle).
  function valeurVariableModele(nom, d, contexte) {
    const n = nomVariableModele(nom);
    const vars = contexte && contexte.variables;
    if (vars) for (const [k, v] of Object.entries(vars)) if (nomVariableModele(k) === n) return String(v == null ? '' : v);
    if (!d) return null;
    const confrere = notaireParticipantRepresenteAcquereur(d);
    if (n === 'dossier') return libelleDossierAffiche(d);
    if (n === 'l\'agence') return d.nomAgence ? `l'agence ${d.nomAgence}` : "l'agence";
    if (n === 'date et heure du rendez-vous') {
      if (!d.rendezVousSignature) return '';
      const heure = heureEmail(d.rendezVousSignatureHeure);
      return `${MARQUE_FORT_DEBUT}${dateAvecJourFr(d.rendezVousSignature)}${heure ? ' à ' + heure : ''}${MARQUE_FORT_FIN}`;
    }
    if (n === 'lieu du rendez-vous') return d.rendezVousSignature ? lieuRdvEmail(d, confrere) : '';
    if (n === 'échéance du prêt') {
      if (!d.pret) return '';
      return `${joursRestants(d.pret) < 0 ? 'était fixée' : 'est fixée'} au ${formatDateFr(d.pret)}`;
    }
    if (n === 'échéance de la vente préalable') {
      if (!d.ventebien) return 'reste à réaliser';
      return `${ecartJours(isoAujourdhuiLocal(), d.ventebien) < 0 ? 'devait intervenir' : 'est prévue'} au plus tard le ${formatDateFr(d.ventebien)}`;
    }
    if (n === 'date de signature') return d.rendezVousSignature ? formatDateFr(d.rendezVousSignature) : '';
    if (n === 'lien avis google') return LIEN_AVIS_GOOGLE_OFFICE;
    return null;
  }
  function conditionModeleRemplie(nom, d, contexte) {
    const n = nomVariableModele(nom);
    const conds = contexte && contexte.conditions;
    if (conds) for (const [k, v] of Object.entries(conds)) if (nomVariableModele(k) === n) return !!v;
    if (n === 'si sans rendez-vous') return !(d && d.rendezVousSignature);
    if (!d) return true;
    const confrere = notaireParticipantRepresenteAcquereur(d);
    if (n === 'si client') return !confrere;
    if (n === 'si confrère') return confrere;
    if (n === 'si rendez-vous') return !!d.rendezVousSignature;
    if (n === 'si prêt attendu') return !d.sansPret && d.offrePretStatut !== 'recue';
    return true;
  }

  // Remplit un modèle pour un dossier. Sans dossier, le texte reste tel quel (variables visibles).
  function remplirModeleEmail(modele, d, contexte) {
    const m = modele || {};
    if (!d && !contexte) return { sujet: String(m.sujet || ''), corps: String(m.corps || '') };
    const remplacer = (texte, vides) => String(texte || '').replace(/\{([^{}\n]{1,60})\}/g, (tout, nom) => {
      if (/^\{\{/.test(tout)) return tout;
      const v = valeurVariableModele(nom, d, contexte);
      if (v === null) return tout;
      if (v === '' && vides) vides.push(nom);
      return v;
    });
    const paragraphes = [];
    for (const p of String(m.corps || '').replace(/\r\n/g, '\n').split(/\n{2,}/)) {
      let reste = p;
      let garder = true;
      for (let c = /^\s*\{(si [^{}\n]{1,40})\}\s*/.exec(reste); c; c = /^\s*\{(si [^{}\n]{1,40})\}\s*/.exec(reste)) {
        if (!conditionModeleRemplie(c[1], d, contexte)) garder = false;
        reste = reste.slice(c[0].length);
      }
      if (!garder || !reste.trim()) continue;
      const vides = [];
      const rempli = remplacer(reste, vides);
      if (vides.length) continue;
      paragraphes.push(rempli);
    }
    const sujet = remplacer(m.sujet, null).replace(/\s+—\s*$/, '').replace(/\s{2,}/g, ' ').trim();
    return { sujet, corps: paragraphes.join('\n\n') };
  }

  // Les modèles d'origine, texte « à variables » (repris des construireEmail… ; mêmes mots).
  function modelesEmailIntegres() {
    return modelesEmailDossier().concat(modelesEmailContexte());
  }
  function modelesEmailDossier() {
    return [
      { cle: 'provision', nom: 'Provision et pièce d’identité', construire: construireEmailRelanceProvision,
        sujet: 'Demande de provision sur frais et pièce d\'identité — {dossier}',
        corps: ['Bonjour,', 'Nous vous confirmons la bonne réception de votre avant-contrat signé auprès de {l’agence}.',
          "Afin de poursuivre la constitution de votre dossier, merci de nous adresser :\n- une provision sur frais de 100,00 € ;\n- une copie de votre pièce d'identité en cours de validité.",
          "{si prêt attendu}Si votre acquisition est soumise à l'obtention d'un prêt, merci également de nous transmettre votre offre de prêt dès que vous l'aurez reçue."].join('\n\n') },
      { cle: 'pret', nom: 'Relance de l’offre de prêt', construire: construireEmailRelancePret,
        sujet: 'Relance — Offre de prêt attendue — {dossier}',
        corps: ['Bonjour,', 'J’espère que vous allez bien.', "Nous n'avons pas encore reçu votre offre de prêt dans le cadre de votre dossier.",
          "L'échéance d'obtention du prêt {échéance du prêt}.", 'Merci de nous transmettre cette offre dès réception, ou de nous indiquer où en est votre demande de financement.'].join('\n\n') },
      { cle: 'rib', nom: 'RIB et pièce d’identité', construire: construireEmailRelanceRib,
        sujet: 'RIB et pièce d\'identité pour le rendez-vous de signature — {dossier}',
        corps: ['Bonjour,', 'En prévision du rendez-vous de signature je vous remercie de vous munir de votre RIB et de votre pièce d’identité.', 'Bien cordialement,'].join('\n\n') },
      { cle: 'ventePrealable', nom: 'Vente préalable (au client)', construire: construireEmailRelanceVentePrealable,
        sujet: 'Vente préalable de votre bien — {dossier}',
        corps: ['Bonjour,', 'Votre acquisition est conclue sous la condition de la vente préalable de votre bien, qui {échéance de la vente préalable}.',
          'Pourriez-vous nous indiquer où en est cette vente (avant-contrat signé, date de signature prévue) ? Dès qu’elle sera signée, merci de nous transmettre l’attestation de vente.', 'Bien cordialement,'].join('\n\n') },
      { cle: 'ventePrealableConfrere', nom: 'Vente préalable (au confrère)', construire: construireEmailRelanceVentePrealable,
        sujet: 'Vente préalable — {dossier}',
        corps: [FORMULE_APPEL_CONFRERE, "Dans le cadre de ce dossier, l'avant-contrat est conclu sous la condition de la vente préalable du bien de votre client, qui {échéance de la vente préalable}.",
          'Pourriez-vous nous indiquer si une date de réitération est déjà prévue sur votre agenda ou nous transmettre, le cas échéant, l’attestation de vente ?', FORMULE_CLOTURE_CONFRERE].join('\n\n') },
      { cle: 'fonds', nom: 'Réception des fonds', construire: construireEmailReceptionFonds,
        sujet: 'Réception des fonds — {dossier}',
        corps: ['Bonjour,', 'Nous vous confirmons que les fonds destinés à votre acquisition ont bien été reçus en notre comptabilité.',
          "Nous vous rappelons que le rendez-vous de signature de l'acte authentique est fixé au {date et heure du rendez-vous}, en notre office.",
          '{si client}{si rendez-vous}Je vous remercie de vous munir de vos pièces d’identité et de votre RIB pour le rendez-vous.', 'Nous restons à votre disposition pour toute question.'].join('\n\n') },
      { cle: 'projet', nom: 'Projet d’acte', construire: construireEmailProjetActe,
        sujet: 'Projet d\'acte de vente — {dossier}',
        corps: ['Bonjour,', "Veuillez trouver ci-joint le projet de l'acte de vente, pour lecture avant la signature.",
          "Nous vous rappelons que le rendez-vous de signature de l'acte authentique est fixé au {date et heure du rendez-vous}, en notre office.",
          'Nous restons à votre disposition pour toute question ou remarque sur ce projet.'].join('\n\n') },
      { cle: 'confirmationRdv', nom: 'Confirmation du rendez-vous (au client)', construire: construireEmailConfirmationRdv,
        sujet: 'Confirmation du rendez-vous de signature — {dossier}',
        corps: ['Bonjour,', 'Nous vous confirmons le rendez-vous de signature de l’acte de vente le {date et heure du rendez-vous}, {lieu du rendez-vous}.',
          'Merci de vous munir d’une pièce d’identité en cours de validité. Les fonds nécessaires à l’acquisition devront nous parvenir par virement quelques jours avant le rendez-vous.',
          'Nous restons à votre disposition pour toute question.', 'Bien cordialement,'].join('\n\n') },
      { cle: 'confirmationRdvConfrere', nom: 'Confirmation du rendez-vous (au confrère)', construire: construireEmailConfirmationRdv,
        sujet: 'Confirmation du rendez-vous de signature — {dossier}',
        corps: ['Bonjour,', 'Je vous confirme le rendez-vous de signature de l’acte de vente le {date et heure du rendez-vous}, {lieu du rendez-vous}.',
          'Je vous remercie de bien vouloir me faire parvenir, le cas échéant, vos observations sur le projet d’acte.', 'Bien cordialement,'].join('\n\n') },
      { cle: 'relanceFonds', nom: 'Relance pour les fonds', construire: construireEmailRelanceFonds,
        sujet: 'Fonds à nous faire parvenir — {dossier}',
        corps: ['Bonjour,', 'Sauf erreur de notre part, les fonds destinés à votre acquisition ne nous sont pas encore parvenus en comptabilité.',
          'Le rendez-vous de signature de l’acte authentique est fixé le {date et heure du rendez-vous}, {lieu du rendez-vous}. Pour qu’il puisse se tenir, nous vous remercions de bien vouloir effectuer le virement dès que possible, selon les indications de notre appel de fonds.',
          'Si le virement a déjà été effectué, merci de nous en adresser le justificatif en réponse à cet email.', 'Nous restons à votre disposition pour toute question.', 'Bien cordialement,'].join('\n\n') },
      { cle: 'appelFonds', nom: 'Courrier d’appel de fonds', construire: construireEmailAppelFonds,
        sujet: 'Appel de fonds — rendez-vous de signature — {dossier}',
        corps: ['{si client}Madame, Monsieur,', '{si client}Veuillez trouver ci-joint le courrier de convocation et d’appel de fonds relatif à votre acquisition.',
          '{si confrère}Veuillez trouver ci-joint le courrier de convocation et d’appel de fonds destiné à votre client, en vue du rendez-vous de signature.'].join('\n\n') },
      { cle: 'questionnaire', nom: 'Questionnaire de satisfaction', construire: construireEmailQuestionnaireSatisfaction,
        sujet: 'Questionnaire de satisfaction',
        corps: ['Madame, Monsieur,', 'La qualité du service rendu à nos clients est une priorité pour notre office. Elle traduit l’engagement de notre équipe pour s’adapter à vos attentes.',
          'Afin de recueillir votre avis, deux solutions s’offrent à vous :\n1. Répondre au questionnaire satisfaction ci-joint, de manière anonyme, et nous le retourner.\n2. Laisser un avis en ligne afin de faire profiter de votre expérience au sein de notre office. Cliquez ici pour laisser votre avis : {lien avis Google}',
          'Sachez que toute l’office notarial a eu à cœur de vous accompagner et espère pouvoir collaborer à vos côtés de nouveau.', 'Dans l’attente et vous en remerciant vivement par avance,', 'Bien cordialement.'].join('\n\n') },
      { cle: 'anniversaire', nom: 'Un an après la signature', construire: construireEmailAnniversaire,
        sujet: 'Un an déjà — {dossier}',
        corps: ['Bonjour,', 'Il y a un an, vous signiez l’acte d’acquisition de votre bien. Toute l’équipe de l’office espère que vous vous y plaisez.',
          'Nous restons à votre disposition pour tout nouveau projet : donation, testament, contrat de mariage ou de PACS, succession, ou une nouvelle acquisition.', 'Bien cordialement,'].join('\n\n') }
    ];
  }

  // ---- Modèles liés à un geste précis (étude, 03/10 : « ajouter les 4 qui manquent ») : accusé de réception, copie
  // de l'acte, visio, sondage de dates. Leurs variables viennent du geste (email reçu, fichiers choisis, créneaux…) :
  // `contexte` = { confrere, variables: { nom: valeur }, conditions: { 'si …': vrai/faux } }. Ils n'apparaissent pas
  // dans le menu « Modèles » de la fenêtre d'email (rien à remplir hors de leur geste). ----
  var VARIABLES_CONTEXTE_MODELES = {
    accuseReception: [
      { nom: 'documents reçus', aide: '« du document transmis (x). » ou « des documents transmis : » suivi de la liste' },
      { nom: 'date de l’email', aide: 'date de l’email reçu' },
      { nom: 'si un seul document', aide: 'un seul document reçu' }, { nom: 'si plusieurs documents', aide: 'plusieurs documents reçus' }],
    copieActe: [
      { nom: 'documents envoyés', aide: '« la copie de l’acte de vente », « l’attestation de vente » ou les deux' },
      { nom: 'objet des documents', aide: 'même chose, avec une majuscule, pour l’objet' },
      { nom: 'si pièce jointe', aide: 'PDF joints à l’email' }, { nom: 'si lien', aide: 'plus de 21 Mo : lien WeTransfer' }],
    visio: [
      { nom: 'objet du rendez-vous', aide: '« rendez-vous de signature de la vente VTE - … » ou « rendez-vous (…) »' },
      { nom: 'date et heure', aide: 'jour et heure de la visio' },
      { nom: 'informations de connexion', aide: 'relues dans la note du rendez-vous ; vide = paragraphe retiré' },
      { nom: 'boutons de réponse', aide: 'emplacement du bouton « Rejoindre la visioconférence »' },
      { nom: 'si rendez-vous de signature', aide: 'visio de signature' }, { nom: 'si autre rendez-vous', aide: 'autre visio' }],
    sondage: [
      { nom: 'objet du rendez-vous', aide: '« rendez-vous de signature de l’acte de vente » ou le titre proposé' },
      { nom: 'créneaux proposés', aide: 'la liste des créneaux' },
      { nom: 'date limite', aide: 'jour limite de réponse ; vide = paragraphe retiré' },
      { nom: 'ceux qui conviennent', aide: '« ceux qui conviennent à votre client et à vous-même » ou « ceux qui vous conviennent »' },
      { nom: 'boutons de réponse', aide: 'emplacement des boutons de réponse' },
      { nom: 'si première demande', aide: '' }, { nom: 'si relance', aide: '' },
      { nom: 'si page de réponse', aide: 'page de réponse réglée (Réglages › Agenda et Outlook)' }, { nom: 'si sans page de réponse', aide: '' },
      { nom: 'si plusieurs destinataires', aide: '' }, { nom: 'si un seul destinataire', aide: '' },
      { nom: 'si date limite', aide: '' }, { nom: 'si sans date limite', aide: '' }]
  };
  var GROUPE_CONTEXTE_MODELE = { accuseReception: 'accuseReception', accuseReceptionConfrere: 'accuseReception', copieActe: 'copieActe',
    visio: 'visio', visioConfrere: 'visio', sondage: 'sondage', sondageConfrere: 'sondage' };

  function contexteAccuseReception(d, email, confrere) {
    const docs = documentsEmailRecu(email);
    const le = email && email.date ? new Date(email.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : '';
    const objet = String((email && email.objet) || '').trim();
    return { confrere: !!confrere,
      variables: { 'documents reçus': docs.length > 1 ? 'des documents transmis :\n' + docs.map(x => '- ' + x).join('\n') : docs.length ? `du document transmis (${docs[0]}).` : 'de votre envoi.',
        'date de l\'email': le, 'objet de la réponse': /^(re|r[ée]p|aw)\s*:/i.test(objet) ? objet : `RE: ${objet || (d ? libelleDossierAffiche(d) : '')}` },
      conditions: { 'si un seul document': docs.length <= 1, 'si plusieurs documents': docs.length > 1 } };
  }
  function contexteCopieActe(d, types, lien) {
    const copie = (types || []).includes('copie'), attestation = (types || []).includes('attestation');
    return { confrere: false, types, lien,
      variables: { 'documents envoyés': copie && attestation ? 'la copie de l’acte et l’attestation de vente' : attestation ? 'l’attestation de vente' : 'la copie de l’acte de vente',
        'objet des documents': copie && attestation ? 'Copie de l’acte et attestation de vente' : attestation ? 'Attestation de vente' : 'Copie de l’acte de vente' },
      conditions: { 'si lien': !!lien, 'si pièce jointe': !lien } };
  }
  function contexteVisio(args) {
    const { confrere, signature, quand, dossier, details } = args;
    return { confrere: !!confrere, args,
      variables: { 'objet du rendez-vous': signature ? `rendez-vous de signature${dossier ? ' de la vente ' + dossier : ''}` : `rendez-vous${dossier ? ' (' + dossier + ')' : ''}`,
        'date et heure': quand || '', 'informations de connexion': details || '', 'boutons de réponse': '{{BOUTONS}}' },
      conditions: { 'si rendez-vous de signature': !!signature, 'si autre rendez-vous': !signature } };
  }
  function contexteSondage(d, s, confrere, relance, avecPage, plusieurs) {
    const limite = s.expireLe ? new Date(s.expireLe + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    const o = objetsEmailSondage(d, s.titre);
    return { confrere: !!confrere, args: { s, relance, avecPage, plusieurs },
      variables: { 'objet du rendez-vous': confrere ? o.confrere : o.client,
        'créneaux proposés': s.creneaux.map(c => '– ' + libelleCreneauSondage(c).replace(/^./, x => x.toUpperCase())).join('\n'),
        'date limite': limite, 'ceux qui conviennent': d ? 'ceux qui conviennent à votre client et à vous-même' : 'ceux qui vous conviennent',
        'boutons de réponse': '{{BOUTONS}}' },
      conditions: { 'si première demande': !relance, 'si relance': !!relance, 'si page de réponse': !!avecPage, 'si sans page de réponse': !avecPage,
        'si plusieurs destinataires': !!plusieurs, 'si un seul destinataire': !plusieurs, 'si date limite': !!limite, 'si sans date limite': !limite } };
  }

  // Exemple de contexte pour l'aperçu des Réglages (aucun email ni fichier réel).
  function contexteExempleModele(cle, d) {
    const g = GROUPE_CONTEXTE_MODELE[cle];
    const confrere = /Confrere$/.test(cle);
    if (g === 'accuseReception') return contexteAccuseReception(d, { date: new Date().toISOString(), objet: 'Documents', pj: [{ nom: 'RIB.pdf' }, { nom: 'Pièce d’identité.pdf' }] }, confrere);
    if (g === 'copieActe') return contexteCopieActe(d, ['copie', 'attestation'], false);
    if (g === 'visio') return contexteVisio({ confrere, signature: true, quand: 'lundi 12 octobre à 10 h 30', dossier: d ? libelleDossierAffiche(d) : '', details: 'Code de la réunion : 123 456' });
    if (g === 'sondage') {
      const ouvre = (n) => { let j = addDays(isoAujourdhuiLocal(), n); while ([0, 6].includes(new Date(j + 'T12:00:00').getDay())) j = addDays(j, 1); return j; };
      const premier = ouvre(14);
      return contexteSondage(d, { titre: '', expireLe: ouvre(7), creneaux: [{ n: 1, date: premier, heure: '10:00' }, { n: 2, date: ouvre(Math.round((new Date(premier) - new Date(isoAujourdhuiLocal())) / 864e5) + 1), heure: '15:00' }] }, confrere, false, true, false);
    }
    return null;
  }

  function modelesEmailContexte() {
    return [
      { cle: 'accuseReception', nom: 'Accusé de réception (au client)', contexte: true, construire: (d, c) => remplirModeleEmail(modeleDefautContexte('accuseReception'), d, c),
        sujet: '{objet de la réponse}',
        corps: ['Bonjour,', 'Nous vous remercions de votre email du {date de l’email} et accusons bonne réception {documents reçus}',
          '{si un seul document}Il a été joint à votre dossier. Nous ne manquerons pas de revenir vers vous si un complément était nécessaire.',
          '{si plusieurs documents}Ils ont été joints à votre dossier. Nous ne manquerons pas de revenir vers vous si un complément était nécessaire.', 'Bien cordialement,'].join('\n\n') },
      { cle: 'accuseReceptionConfrere', nom: 'Accusé de réception (au confrère)', contexte: true, construire: (d, c) => remplirModeleEmail(modeleDefautContexte('accuseReceptionConfrere'), d, c),
        sujet: '{objet de la réponse}',
        corps: ['Je vous remercie de votre email du {date de l’email} et accuse bonne réception {documents reçus}', 'Je ne manquerai pas de revenir vers vous si un complément était nécessaire.'].join('\n\n') },
      { cle: 'copieActe', nom: 'Copie de l’acte / attestation de vente', contexte: true, construire: (d, c) => construireEmailCopieActe(d, c.types, c.lien),
        sujet: '{objet des documents} — {dossier}',
        corps: ['Bonjour,', '{si pièce jointe}{si rendez-vous}Veuillez trouver ci-joint {documents envoyés} de la vente signée le {date de signature}.',
          '{si pièce jointe}{si sans rendez-vous}Veuillez trouver ci-joint {documents envoyés}.',
          '{si lien}{si rendez-vous}Le fichier étant trop volumineux pour être joint à cet email, vous pouvez télécharger {documents envoyés} de la vente signée le {date de signature} à l’adresse suivante :',
          '{si lien}{si sans rendez-vous}Le fichier étant trop volumineux pour être joint à cet email, vous pouvez télécharger {documents envoyés} à l’adresse suivante :',
          '{si lien}[lien WeTransfer à coller ici]', '{si lien}Ce lien reste actif quelques jours : pensez à enregistrer le document.',
          'Nous restons à votre disposition pour toute question.', 'Bien cordialement,'].join('\n\n') },
      { cle: 'visio', nom: 'Lien de la visioconférence (au client)', contexte: true, sansObjet: true, construire: (d, c) => ({ sujet: '', corps: corpsEmailVisio(c.args) }),
        sujet: '',
        corps: ['Bonjour,', 'Votre {objet du rendez-vous} du {date et heure} se tiendra en visioconférence.',
          '{si rendez-vous de signature}Quelques minutes avant l’heure, cliquez sur le bouton ci-dessous pour rejoindre la réunion depuis un ordinateur, une tablette ou un téléphone équipé d’une caméra et d’un micro. Merci de vous munir de votre pièce d’identité.',
          '{si autre rendez-vous}Quelques minutes avant l’heure, cliquez sur le bouton ci-dessous pour rejoindre la réunion depuis un ordinateur, une tablette ou un téléphone équipé d’une caméra et d’un micro.',
          '{boutons de réponse}', 'Informations de connexion :\n{informations de connexion}'].join('\n\n') },
      { cle: 'visioConfrere', nom: 'Lien de la visioconférence (au confrère)', contexte: true, sansObjet: true, construire: (d, c) => ({ sujet: '', corps: corpsEmailVisio(c.args) }),
        sujet: '',
        corps: ['Le {objet du rendez-vous} du {date et heure} se tiendra en visioconférence. Vous trouverez ci-dessous le lien pour rejoindre la réunion.',
          '{boutons de réponse}', 'Informations de connexion :\n{informations de connexion}'].join('\n\n') },
      { cle: 'sondage', nom: 'Proposition de dates (au client)', contexte: true, sansObjet: true, construire: (d, c) => ({ sujet: '', corps: corpsEmailSondage(d, c.args.s, false, c.args.relance, c.args.avecPage, c.args.plusieurs) }),
        sujet: '',
        corps: ['Bonjour,',
          '{si page de réponse}{si première demande}Afin de fixer le {objet du rendez-vous}, nous vous proposons les créneaux suivants :',
          '{si page de réponse}{si relance}Nous revenons vers vous pour fixer le {objet du rendez-vous} : nous n’avons pas encore reçu vos disponibilités parmi les créneaux suivants :',
          '{si page de réponse}{créneaux proposés}',
          '{si page de réponse}{si plusieurs destinataires}Chacun de vous clique sur le bouton à son nom, indique pour chaque créneau s’il lui convient, puis clique sur « Envoyer ma réponse ».',
          '{si page de réponse}{si un seul destinataire}Cliquez sur « Choisir mes disponibilités », indiquez pour chaque créneau s’il vous convient, puis cliquez sur « Envoyer ma réponse ».',
          '{si sans page de réponse}{si première demande}Afin de fixer le {objet du rendez-vous}, nous vous proposons les créneaux ci-dessous.',
          '{si sans page de réponse}{si relance}Nous revenons vers vous pour fixer le {objet du rendez-vous} : nous n’avons pas encore reçu votre choix parmi les créneaux ci-dessous.',
          '{si sans page de réponse}Cliquez sur chaque créneau qui vous convient : un email de réponse s’ouvre, il suffit de l’envoyer sans en modifier l’objet (un email par créneau). Pour répondre en un seul email, cliquez sur « Répondre en une seule fois » et cochez d’un X les créneaux qui vous conviennent. Si aucun ne vous convient, cliquez sur « Aucun créneau ne convient ».',
          '{boutons de réponse}',
          '{si date limite}Merci de nous répondre avant le {date limite}. Le rendez-vous vous sera confirmé dès que toutes les parties auront répondu.',
          '{si sans date limite}Merci de nous répondre. Le rendez-vous vous sera confirmé dès que toutes les parties auront répondu.'].join('\n\n') },
      { cle: 'sondageConfrere', nom: 'Proposition de dates (au confrère)', contexte: true, sansObjet: true, construire: (d, c) => ({ sujet: '', corps: corpsEmailSondage(d, c.args.s, true, c.args.relance, c.args.avecPage, c.args.plusieurs) }),
        sujet: '',
        corps: ['{si page de réponse}{si première demande}Afin de fixer le {objet du rendez-vous}, je vous propose les créneaux suivants :',
          '{si page de réponse}{si relance}Je me permets de revenir vers vous au sujet du {objet du rendez-vous}, pour lequel je vous ai proposé les créneaux suivants :',
          '{si page de réponse}{créneaux proposés}',
          '{si page de réponse}Pourriez-vous m’indiquer {ceux qui conviennent} ? Le bouton ci-dessous permet de répondre pour chaque créneau.',
          '{si sans page de réponse}{si première demande}Afin de fixer le {objet du rendez-vous}, je vous propose les créneaux ci-dessous.',
          '{si sans page de réponse}{si relance}Je me permets de revenir vers vous au sujet du {objet du rendez-vous}, pour lequel je vous ai proposé les créneaux ci-dessous.',
          '{si sans page de réponse}Pourriez-vous m’indiquer {ceux qui conviennent} ? Un clic sur un créneau prépare la réponse : il suffit de l’envoyer sans en modifier l’objet (un email par créneau qui convient). « Répondre en une seule fois » prépare un seul email, où cocher d’un X les créneaux retenus.',
          '{boutons de réponse}', 'Je vous remercie de votre réponse avant le {date limite}.'].join('\n\n') }
    ];
  }
  function modeleDefautContexte(cle) { return modelesEmailContexte().find(m => m.cle === cle); }

  // Modèles enregistrés sur le serveur (versions de l'étude des modèles d'origine, modèles créés).
  let modelesEmailsEtat = { modifies: {}, perso: [] };
  async function chargerModelesEmails() {
    try {
      const r = await fetchAvecAuth('/api/modeles-emails');
      if (r.ok) modelesEmailsEtat = await r.json();
    } catch (e) { /* les textes d'origine restent la voie */ }
    return modelesEmailsEtat;
  }

  // Le modèle d'origine tel que l'étude l'a peut-être modifié : { cle, nom, sujet, corps, modifie }.
  function modeleIntegreEffectif(cle, etat) {
    const base = modelesEmailIntegres().find(m => m.cle === cle);
    if (!base) return null;
    const mod = etat && etat.modifies ? etat.modifies[cle] : null;
    return mod ? { ...base, sujet: mod.sujet, corps: mod.corps, modifie: true, modifieLe: mod.modifieLe, par: mod.par } : { ...base, modifie: false };
  }

  // Voie unique des boutons de la fiche : la version du confrère quand un autre office représente l'acquéreur, le
  // texte modifié par l'étude s'il existe, sinon la fonction d'origine (textes mot pour mot).
  var VARIANTES_CONFRERE_MODELES = { ventePrealable: 'ventePrealableConfrere', confirmationRdv: 'confirmationRdvConfrere',
    accuseReception: 'accuseReceptionConfrere', visio: 'visioConfrere', sondage: 'sondageConfrere' };
  function emailDepuisModele(cle, d, etat, contexte) {
    const e = etat || modelesEmailsEtat;
    const confrere = contexte && typeof contexte.confrere === 'boolean' ? contexte.confrere : !!(d && notaireParticipantRepresenteAcquereur(d));
    const variante = VARIANTES_CONFRERE_MODELES[cle] && confrere ? VARIANTES_CONFRERE_MODELES[cle] : cle;
    const m = modeleIntegreEffectif(variante, e);
    if (m && m.modifie) return remplirModeleEmail(m, d, contexte);
    return m ? m.construire(d, contexte) : { sujet: '', corps: '' };
  }

  // ---- Réglages › Modèles d'emails (étude, 03/10) : les modèles de CLAIRE (modifiables, retour au texte d'origine)
  // et ceux de l'étude (créer, modifier, supprimer), avec aperçu sur un dossier. ----
  let modeleEdite = null;

  // Pure : les modèles proposés (ceux de l'étude d'abord, puis ceux de CLAIRE), pour la liste et le menu de la fenêtre d'email.
  function listeModelesEmails(etat, options) {
    const e = etat || { modifies: {}, perso: [] };
    const fenetre = !!(options && options.pourFenetre);
    return (e.perso || []).map(m => ({ type: 'perso', id: m.id, nom: m.nom, sujet: m.sujet, corps: m.corps }))
      .concat(modelesEmailIntegres().filter(m => !(fenetre && m.contexte)).map(m => modeleIntegreEffectif(m.cle, e))
        .map(m => ({ type: 'integre', cle: m.cle, nom: m.nom, sujet: m.sujet, corps: m.corps, modifie: m.modifie, contexte: !!m.contexte, sansObjet: !!m.sansObjet })));
  }

  // Mots qui désignent le sujet d'un modèle de CLAIRE dans l'objet ou le texte d'un email (texte sans accents, en
  // minuscules) : [motif, points]. Clé = modèle sans sa variante confrère.
  var MOTS_MODELES_EMAIL = {
    provision: [[/provision/, 10], [/frais d.acte|acompte sur (les )?frais/, 6]],
    pret: [[/offre de pret|offre de credit/, 12], [/\bpret\b|banque|bancaire|credit|financement|emprunt|courtier/, 6]],
    rib: [[/\brib\b|releve d.identite bancaire|coordonnees bancaires/, 12]],
    ventePrealable: [[/vente prealable/, 12], [/vente de (votre|son|sa|leur) (bien|maison|appartement)/, 6]],
    fonds: [[/reception des fonds|fonds (bien )?recus|virement (a ete )?(effectue|fait|envoye|realise|passe)/, 12], [/virement|versement/, 5]],
    relanceFonds: [[/fonds|virement/, 3]],
    projet: [[/projet d.acte/, 12], [/\bprojet\b/, 6]],
    confirmationRdv: [[/rendez-vous|\brdv\b|date de (la )?signature/, 6], [/confirm/, 3]],
    appelFonds: [[/appel de fonds|decompte/, 12], [/montant a (virer|verser|regler)|somme a (virer|verser|regler)|combien/, 6]],
    questionnaire: [[/questionnaire|satisfaction/, 12]],
    anniversaire: []
  };
  var GESTES_MODELES_EMAIL = { relancePret: 'pret', fondsRecus: 'fonds' };

  function texteSansAccentsModele(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  // Pure (étude 03/10 : « en fonction du type d'email, faire remonter en tête le modèle le plus approprié ») : les
  // modèles de `liste` classés pour l'email de la fenêtre — geste qui l'a ouvert (le modèle du geste), mots de l'objet et,
  // pour une réponse, de l'email reçu (objet, résumé, pièces jointes), puis ce qui sert à l'étape du dossier (`utiles` de
  // echangesSelonStade) ; variante confrère selon le destinataire. Rend au plus `max` modèles notés, le mieux noté d'abord.
  function modelesProposesPourEmail(liste, ctx, max) {
    const c = ctx || {};
    const email = c.email || {};
    const texte = texteSansAccentsModele([c.sujet, email.objet, email.resume, (email.pj || []).map(p => p && p.nom).join(' ')].join(' \n '));
    const geste = String(c.geste || '');
    const cleGeste = GESTES_MODELES_EMAIL[geste] || geste;
    const utiles = (c.utiles || []).map(u => GESTES_MODELES_EMAIL[u] || u);
    const vides = /^(bonjour|madame|monsieur|maitre|cordialement|dossier|demande|relance|envoi|email|courrier|modele|votre|notre|vous|nous|pour|avec|dans|des|les|une|sur)$/;
    const notes = [];
    (liste || []).forEach((m, rang) => {
      let score = 0;
      if (m.type === 'integre') {
        const confrereModele = /Confrere$/.test(m.cle);
        const base = m.cle.replace(/Confrere$/, '');
        const aVariante = confrereModele || (liste || []).some(x => x.type === 'integre' && x.cle === base + 'Confrere');
        if (aVariante && confrereModele !== !!c.confrere) return;
        if (cleGeste && cleGeste === base) score += 100;
        (MOTS_MODELES_EMAIL[base] || []).forEach(([re, pts]) => { if (re.test(texte)) score += pts; });
        if (utiles.indexOf(base) !== -1) score += 3;
      } else {
        const mots = [...new Set(texteSansAccentsModele((m.nom || '') + ' ' + String(m.sujet || '').replace(/\{[^}]*\}/g, ' '))
          .split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !vides.test(w)))];
        score += Math.min(18, mots.filter(w => new RegExp('(^|[^a-z0-9])' + w + '([^a-z0-9]|$)').test(texte)).length * 6);
      }
      if (score >= 3) notes.push({ m, score, rang });
    });
    return notes.sort((a, b) => b.score - a.score || a.rang - b.rang).slice(0, max || 3).map(n => n.m);
  }

  async function ouvrirReglagesModelesEmails() {
    await chargerModelesEmails();
    if (!modeleEdite) choisirModeleReglages('integre', 'provision', true);
    else renderReglagesModelesEmails();
  }

  function choisirModeleReglages(type, ref, force) {
    const changer = () => {
      if (type === 'nouveau') {
        modeleEdite = { type: 'nouveau', nom: '', sujet: '{dossier}', corps: 'Bonjour,\n\n\n\nBien cordialement,', change: false, apercu: modeleEdite ? modeleEdite.apercu : '' };
      } else {
        const m = listeModelesEmails(modelesEmailsEtat).find(x => x.type === type && (type === 'perso' ? x.id === ref : x.cle === ref));
        if (!m) return;
        modeleEdite = { type, cle: m.cle, id: m.id, nom: m.nom, sujet: m.sujet, corps: m.corps, sansObjet: !!m.sansObjet, contexte: !!m.contexte, change: false, apercu: modeleEdite ? modeleEdite.apercu : '' };
      }
      renderReglagesModelesEmails();
    };
    if (!force && modeleEdite && modeleEdite.change) demanderConfirmation('Abandonner les modifications de ce modèle ?', changer, { bouton: 'Abandonner' });
    else changer();
  }

  function renderReglagesModelesEmails() {
    const zone = document.getElementById('reglages-modeles-emails');
    if (!zone || !modeleEdite) return;
    const liste = listeModelesEmails(modelesEmailsEtat);
    const ligne = (m) => {
      const actif = modeleEdite.type === m.type && (m.type === 'perso' ? modeleEdite.id === m.id : modeleEdite.cle === m.cle);
      return `<button type="button" class="modeles-ligne${actif ? ' actif' : ''}" onclick="choisirModeleReglages('${m.type}', '${escapeOnclickArg(m.type === 'perso' ? m.id : m.cle)}')">
          <span class="modeles-ligne-nom">${escapeHtml(m.nom)}</span>${m.modifie ? '<span class="modeles-modifie">Modifié</span>' : ''}</button>`;
    };
    const perso = liste.filter(m => m.type === 'perso');
    const e = modeleEdite;
    const integre = e.type === 'integre' ? modeleIntegreEffectif(e.cle, modelesEmailsEtat) : null;
    const actifs = dossiers.filter(d => !d.archive).sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
    const puce = (nom, aide) => `<button type="button" class="modeles-puce" title="${escapeAttr(aide)}" onclick="insererVariableModele('${escapeOnclickArg(nom)}')">{${escapeHtml(nom)}}</button>`;
    zone.innerHTML = `<div class="modeles-grille">
        <nav class="modeles-liste" aria-label="Modèles d’emails">
          <div class="modeles-groupe">Mes modèles</div>
          ${perso.map(ligne).join('')}
          ${e.type === 'nouveau' ? '<button type="button" class="modeles-ligne actif"><span class="modeles-ligne-nom">Nouveau modèle</span></button>' : ''}
          <button type="button" class="bouton-ajout" onclick="choisirModeleReglages('nouveau')">Nouveau modèle</button>
          <div class="modeles-groupe">Modèles de CLAIRE</div>
          ${liste.filter(m => m.type === 'integre' && !m.contexte).map(ligne).join('')}
          <div class="modeles-groupe">Liés à un geste</div>
          ${liste.filter(m => m.type === 'integre' && m.contexte).map(ligne).join('')}
        </nav>
        <div class="modeles-editeur">
          ${e.type === 'integre'
            ? `<div class="modeles-titre">${escapeHtml(e.nom)} ${infoBulle('Les boutons de la fiche envoient ce texte. « Revenir au texte d’origine » rétablit celui de CLAIRE.')}</div>`
            : `<label class="modeles-champ"><span>Nom du modèle</span><input type="text" id="modele-nom" value="${escapeAttr(e.nom)}" oninput="champModeleEdite('nom', this.value)" placeholder="Ex. Demande de diagnostics"></label>`}
          ${e.sansObjet ? '' : `<label class="modeles-champ"><span>Objet</span><input type="text" id="modele-sujet" value="${escapeAttr(e.sujet)}" oninput="champModeleEdite('sujet', this.value)" onfocus="dernierChampModele = this.id"></label>`}
          <label class="modeles-champ"><span>Texte ${infoBulle('Une variable entre accolades est remplacée par la donnée du dossier. Un paragraphe dont une variable est vide disparaît. Un paragraphe qui commence par {si …} n’apparaît que dans ce cas. La signature de l’office est ajoutée à l’envoi.')}</span>
            <textarea id="modele-corps" rows="14" oninput="champModeleEdite('corps', this.value)" onfocus="dernierChampModele = this.id">${escapeHtml(e.corps)}</textarea></label>
          <div class="modeles-puces"><span class="modeles-puces-titre">Insérer</span>${(VARIABLES_CONTEXTE_MODELES[GROUPE_CONTEXTE_MODELE[e.cle]] || []).map(v => puce(v.nom, v.aide)).join('')}${VARIABLES_MODELE_EMAIL.map(v => puce(v.nom, v.aide)).join('')}${CONDITIONS_MODELE_EMAIL.map(v => puce(v.nom, v.aide)).join('')}</div>
          <div class="modeles-actions">
            <button type="button" class="primary" id="modele-enregistrer" onclick="enregistrerModeleEdite()"${e.change ? '' : ' disabled'}>Enregistrer</button>
            ${integre && integre.modifie ? '<button type="button" class="lien-discret" onclick="revenirModeleOrigine()">Revenir au texte d’origine</button>' : ''}
            ${e.type === 'perso' ? '<button type="button" class="lien-discret" onclick="supprimerModeleEdite()">Supprimer</button>' : ''}
            <span class="hint">${integre && integre.modifie && integre.modifieLe ? `Modifié le ${escapeHtml(dateHeureAppel(Date.parse(integre.modifieLe)))}${integre.par ? ' par ' + escapeHtml(integre.par) : ''}` : ''}</span>
          </div>
          <div class="modeles-apercu-tete">
            <span class="section-eyebrow">Aperçu</span>
            <select id="modele-apercu-dossier" aria-label="Dossier de l’aperçu" onchange="modeleEdite.apercu = this.value; majApercuModele()">
              <option value="">Choisir un dossier…</option>
              ${actifs.map(d => `<option value="${escapeAttr(d.id)}"${d.id === e.apercu ? ' selected' : ''}>${escapeHtml(libelleDossierAffiche(d))}</option>`).join('')}
            </select>
          </div>
          <div class="modeles-apercu" id="modele-apercu"></div>
        </div>
      </div>`;
    majApercuModele();
  }

  let dernierChampModele = 'modele-corps';
  function champModeleEdite(champ, valeur) {
    if (!modeleEdite) return;
    modeleEdite[champ] = valeur;
    modeleEdite.change = true;
    const b = document.getElementById('modele-enregistrer');
    if (b) b.disabled = false;
    majApercuModele();
  }

  function insererVariableModele(nom) {
    const champ = document.getElementById(dernierChampModele) || document.getElementById('modele-corps');
    if (!champ) return;
    const t = '{' + nom + '}';
    const debut = typeof champ.selectionStart === 'number' ? champ.selectionStart : champ.value.length;
    const fin = typeof champ.selectionEnd === 'number' ? champ.selectionEnd : debut;
    champ.value = champ.value.slice(0, debut) + t + champ.value.slice(fin);
    champ.focus();
    try { champ.setSelectionRange(debut + t.length, debut + t.length); } catch (e) { /* champ sans sélection */ }
    champModeleEdite(champ.id === 'modele-sujet' ? 'sujet' : 'corps', champ.value);
  }

  function majApercuModele() {
    const zone = document.getElementById('modele-apercu');
    if (!zone || !modeleEdite) return;
    const d = dossiers.find(x => x.id === modeleEdite.apercu);
    if (!d) { zone.innerHTML = '<p class="hint">Choisissez un dossier pour voir le texte rempli.</p>'; return; }
    const contexte = modeleEdite.contexte ? contexteExempleModele(modeleEdite.cle, d) : null;
    const r = remplirModeleEmail({ sujet: modeleEdite.sujet, corps: modeleEdite.corps }, d, contexte);
    const corps = adapterCorpsEmail(r.corps, contexte ? contexte.confrere : notaireParticipantRepresenteAcquereur(d)).replace(/\{\{BOUTONS\}\}/g, '[Boutons]');
    zone.innerHTML = `${modeleEdite.sansObjet ? '' : `<div class="modeles-apercu-sujet">${escapeHtml(r.sujet || '(sans objet)')}</div>`}${contexte ? '<p class="hint">Exemple : documents, fichiers ou créneaux inventés.</p>' : ''}<div class="modeles-apercu-corps">${marquesEnHtml(escapeHtml(corps))}</div>`;
  }

  async function enregistrerModeleEdite() {
    const e = modeleEdite;
    if (!e) return;
    if (e.type !== 'integre' && !String(e.nom || '').trim()) { afficherToast('Donnez un nom au modèle.', 'OK', null); return; }
    if (!String(e.corps || '').trim()) { afficherToast('Le texte du modèle est vide.', 'OK', null); return; }
    const url = e.type === 'integre' ? '/api/modeles-emails/integres/' + encodeURIComponent(e.cle)
      : e.type === 'perso' ? '/api/modeles-emails/perso/' + encodeURIComponent(e.id) : '/api/modeles-emails/perso';
    try {
      const r = await fetchAvecAuth(url, { method: e.type === 'nouveau' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: e.nom, sujet: e.sujet, corps: e.corps, par: utilisateurPoste || '' }) });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corps.erreur || 'statut ' + r.status);
      modelesEmailsEtat = { modifies: corps.modifies || {}, perso: corps.perso || [] };
      if (e.type === 'nouveau') { e.type = 'perso'; e.id = corps.id; }
      e.change = false;
      renderReglagesModelesEmails();
      afficherToast('Modèle enregistré.', 'OK', null);
    } catch (err) { afficherToast('Modèle non enregistré : ' + err.message, 'OK', null); }
  }

  function revenirModeleOrigine() {
    const e = modeleEdite;
    if (!e || e.type !== 'integre') return;
    demanderConfirmation('Revenir au texte d’origine de CLAIRE pour ce modèle ?', async () => {
      try {
        const r = await fetchAvecAuth('/api/modeles-emails/integres/' + encodeURIComponent(e.cle), { method: 'DELETE' });
        if (!r.ok) throw new Error('statut ' + r.status);
        modelesEmailsEtat = await r.json();
        choisirModeleReglages('integre', e.cle, true);
      } catch (err) { afficherToast('Impossible : ' + err.message, 'OK', null); }
    }, { bouton: 'Revenir au texte d’origine' });
  }

  function supprimerModeleEdite() {
    const e = modeleEdite;
    if (!e || e.type !== 'perso') return;
    demanderConfirmation(`Supprimer le modèle « ${e.nom} » ?`, async () => {
      try {
        const r = await fetchAvecAuth('/api/modeles-emails/perso/' + encodeURIComponent(e.id), { method: 'DELETE' });
        if (!r.ok) throw new Error('statut ' + r.status);
        modelesEmailsEtat = await r.json();
        choisirModeleReglages('integre', 'provision', true);
      } catch (err) { afficherToast('Impossible : ' + err.message, 'OK', null); }
    }, { bouton: 'Supprimer' });
  }

  // Courrier d'appel de fonds joint (texte d'origine, ex-preparerEmailAppelFonds).
  function construireEmailAppelFonds(d) {
    const confrere = notaireParticipantRepresenteAcquereur(d);
    return {
      sujet: `Appel de fonds — rendez-vous de signature — ${libelleDossierAffiche(d)}`,
      corps: confrere
        ? 'Veuillez trouver ci-joint le courrier de convocation et d’appel de fonds destiné à votre client, en vue du rendez-vous de signature.'
        : 'Madame, Monsieur,\n\nVeuillez trouver ci-joint le courrier de convocation et d’appel de fonds relatif à votre acquisition.'
    };
  }

  // discret : appelée depuis « Aujourd'hui », où la ligne se coche d'elle-même — une notification
  // suffit, pas de fenêtre à fermer entre deux actions.
  async function envoyerRelanceCiblee(id, type, discret) {
    const d = dossiers.find(x => x.id === id);
    const modele = MODELES_EMAIL_RELANCE[type];
    if (!d || !modele) return;
    const destinataire = emailDestinataireRelance(d);
    if (!destinataire) {
      const message = notaireParticipantRepresenteAcquereur(d)
        ? "Aucun email renseigné pour le notaire de l'acquéreur — impossible de préparer cette relance."
        : "Aucun email d'acquéreur renseigné pour ce dossier — impossible de préparer cette relance.";
      afficherToast(message, 'OK', null);
      return;
    }
    const { sujet, corps } = modele.construire(d);
    const r = await livrerEmailDossier({ destinataire, sujet, corps, confrere: notaireParticipantRepresenteAcquereur(d), responsableSignature: d.responsable, dossierId: d.id, geste: type });
    // Préparation impossible : ne rien marquer sur le dossier, l'email n'est pas parti.
    if (!r.ok) { if (!r.annule) afficherToast(r.message || "L'email n'a pas pu être préparé.", 'OK', null); return; }
    ajouterHistorique(d, modele.historique);
    notifierTacheFaite(d, (ACTIONS_EMAIL_DOSSIER[type] && ACTIONS_EMAIL_DOSSIER[type].titre) || modele.libelle, `${libelleEmailFait(r).toLowerCase()} ${notaireParticipantRepresenteAcquereur(d) ? 'au confrère' : 'au client'}`);
    const aujourdhui = isoAujourdhuiLocal();
    if (modele.date) d[modele.date] = aujourdhui;
    if (type === 'projet') marquerProjetEnvoyeSelonDate(d, aujourdhui);
    if (type === 'confirmationRdv') d.confirmationRdvPour = d.rendezVousSignature || '';
    // La confirmation de réception des fonds rappelle le rendez-vous : elle vaut confirmation (rdvConfirmeParFonds).
    if (type === 'fonds') d.receptionFondsPourRdv = d.rendezVousSignature || '';
    if (type === 'relanceFonds') d.relanceFondsPour = d.rendezVousSignature || '';
    // Une relance de l'offre faite à la main compte comme la relance du jour : la suivante, manuelle
    // ou automatique, n'est reproposée que 10 jours plus tard (voir relanceOffreDue).
    if (type === 'pret') d.derniereRelanceAuto = isoAujourdhuiLocal();
    sauvegarder(d);
    render();
    annoncerEmailPret(r, discret);
    // Projet envoyé : noté aussi dans le rendez-vous de l'agenda (voir noterEnvoiDansAgenda).
    if (type === 'projet') noterEnvoiDansAgenda(id, true);
  }

  function changerEmailVendeur(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = String(valeur || '').trim();
    if (nouveau === (d.emailVendeur || '')) return;
    d.emailVendeur = nouveau;
    ajouterHistorique(d, `Email du vendeur : ${nouveau || '—'}`);
    sauvegarder(d);
    render();
  }

  function changerEmailAcquereur(id, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const nouveau = String(valeur || '').trim();
    if (nouveau === (d.emailAcquereur || '')) return;
    d.emailAcquereur = nouveau;
    ajouterHistorique(d, `Email de l’acquéreur : ${nouveau || '—'}`);
    sauvegarder(d);
    render();
  }

  // Affichée sur la fiche dossier (voir renderCarteDossier), juste avant les trois actions
  // génériques (.ics/rappel/impression) : un bouton par motif de relance pertinent pour CE dossier.
  // Absente pour un notaire participant (même garde-fou que relancerSiOffreManquante/
  // verifierDossierLocal — relancer le client reste un geste de l'instrumentaire). Sans destinataire
  // connu, un message l'indique plutôt que des boutons qui échoueraient au clic — le destinataire
  // n'est pas toujours l'acquéreur lui-même : voir emailDestinataireRelance().
  // Le motif "pièces à fournir" a été retiré sur demande de l'étude (bouton jugé redondant avec la
  // checklist déjà visible sur la fiche) — restent "Provision + pièce d'identité" (envoi de
  // démarrage, voir construireEmailRelanceProvision), "Prêt manquant" et "RIB".
  // Rôle participant : ouvert à la demande de l'étude (« quand on est seul notaire ou en
  // participation, permettre d'écrire à l'acquéreur »). Seule reste la règle déontologique : si
  // l'acquéreur est représenté par un AUTRE office, on écrit à ce confrère, jamais au client
  // (emailDestinataireRelance).
  // Les emails au client de l'onglet Échanges, en lignes d'action : le même titre et le même verbe
  // que dans « À faire » (une relance de l'offre s'appelle partout « Relancer l'offre de prêt »), la
  // date du dernier envoi en précision, et le brouillon exact en dépliant la ligne.
  var ACTIONS_EMAIL_DOSSIER = {
    provision: { titre: 'Demander la provision et la pièce d’identité', verbe: 'Envoyer', categorie: 'neutre', categorieLabel: 'Ouverture du dossier' },
    ventePrealable: { titre: 'Relancer la vente préalable', verbe: 'Relancer', categorie: 'ventebien', categorieLabel: 'Vente préalable' },
    pret: { titre: 'Relancer l’offre de prêt', verbe: 'Relancer', categorie: 'pret', categorieLabel: 'Obtention du prêt' },
    fonds: { titre: 'Confirmer la réception des fonds', verbe: 'Confirmer', categorie: 'appelFonds', categorieLabel: 'Réception des fonds' },
    projet: { titre: 'Envoyer le projet d’acte', verbe: 'Envoyer', categorie: 'projetEnvoye', categorieLabel: 'Envoi projet' },
    rib: { titre: 'Demander le RIB et la pièce d’identité', verbe: 'Envoyer', categorie: 'rendezVousSignature', categorieLabel: 'Avant la signature' },
    confirmationRdv: { titre: 'Confirmer le rendez-vous', verbe: 'Confirmer', categorie: 'rendezVousSignature', categorieLabel: 'Relation client' },
    relanceFonds: { titre: 'Relancer pour les fonds', verbe: 'Relancer', categorie: 'appelFonds', categorieLabel: 'Réception des fonds' },
    anniversaire: { titre: 'Un mot un an après la signature', verbe: 'Écrire', categorie: 'neutre', categorieLabel: 'Relation client' }
  };

  // Date du dernier envoi d'un email : le champ daté du dossier, à défaut la dernière ligne
  // d'historique écrite à l'envoi (dossiers antérieurs au champ daté).
  function dateDernierEmail(d, motif) {
    if (motif === 'pret' && d.derniereRelanceAuto) return d.derniereRelanceAuto;
    const m = MODELES_EMAIL_RELANCE[motif];
    if (!m) return null;
    // Confirmation et relance des fonds valent pour UNE date de rendez-vous : déplacé, il faut les refaire.
    if (motif === 'confirmationRdv' && d.confirmationRdvPour !== d.rendezVousSignature) return rdvConfirmeParFonds(d) ? d.receptionFondsConfirmeeLe : null;
    if (motif === 'relanceFonds' && d.relanceFondsPour !== d.rendezVousSignature) return null;
    if (m.date && d[m.date]) return d[m.date];
    const entrees = (d.historique || []).filter(e => e && typeof e.texte === 'string' && e.texte.indexOf(m.historique) === 0 && typeof e.date === 'string');
    return entrees.length ? entrees[entrees.length - 1].date.slice(0, 10) : null;
  }

  function renderLigneEmailDossier(d, motif) {
    const a = ACTIONS_EMAIL_DOSSIER[motif];
    if (!a) return '';
    const envoye = dateDernierEmail(d, motif);
    const cle = `email:${d.id}:${motif}`;
    const ouverte = apercusJour.has(cle);
    const brouillon = ouverte ? brouillonAction({ dossier: d, geste: { type: 'email', motif } }) : null;
    let sous = '';
    if (motif === 'fonds' && envoye) sous = `Réception des fonds confirmée le ${formatDateFr(envoye)}`;
    else if (motif === 'confirmationRdv' && envoye && d.confirmationRdvPour !== d.rendezVousSignature) sous = `Comprise dans la confirmation de réception des fonds du ${formatDateFr(envoye)}`;
    else if (envoye) sous = `${motif === 'pret' ? 'Dernière relance' : 'Envoyé'} le ${formatDateFr(envoye)}`;
    else if (motif === 'projet') sous = 'Le projet d’acte se joint dans Outlook';
    else if (LIBELLES_GESTES_RELATION[motif] && d.rendezVousSignature) {
      const j = ecartJours(isoAujourdhuiLocal(), d.rendezVousSignature);
      if (j !== null && (motif === 'anniversaire' ? j < 0 : j > 0)) sous = LIBELLES_GESTES_RELATION[motif]({ d, j });
    }
    // L'offre de prêt se relance tous les 10 jours : « faite » seulement tant que la dernière
    // relance est récente, sinon la ligne redevient une action à faire.
    const faite = !!envoye && (motif !== 'pret' || !relanceOffreDue(envoye, isoAujourdhuiLocal()));
    return renderLigneAction({
      categorie: a.categorie, categorieLabel: a.categorieLabel, titre: a.titre, sous, faite,
      bouton: { libelle: faite ? 'Renvoyer' : a.verbe, icone: icone('mail'), onclick: `envoyerRelanceCiblee('${d.id}', '${motif}')`, titre: MODELES_EMAIL_RELANCE[motif].libelle },
      apercu: cle,
      detail: brouillon ? renderBrouillonEmail(brouillon) : ''
    });
  }

  // ==== Questionnaire de satisfaction + archivage automatique (clôture du dossier) ====
  //
  // Demandé par l'étude : un clic prépare le brouillon d'email ET archive le dossier — la vente
  // est alors terminée, plus rien à suivre. **Jamais adressé au confrère** : contrairement aux
  // relances ciblées (prêt/RIB/provision, voir emailDestinataireRelance), qui transitent par le
  // notaire de l'acquéreur quand il est en participation, ce questionnaire porte sur le RESSENTI
  // du client vis-à-vis de NOTRE étude — demandé explicitement à un office en participation n'a
  // aucun sens. Toujours `d.emailAcquereur` directement, jamais `emailDestinataireRelance(d)`.
  // Page d'avis Google de l'office (lien fourni par l'étude, il ouvre directement les avis).
  var LIEN_AVIS_GOOGLE_OFFICE = 'https://www.google.com/maps/place/Office+Notarial+de+Ma%C3%AEtre+Sophie+Gossart/@47.6135912,1.3271913,15z/data=!4m7!3m6!1s0x0:0x9b95fcc14ccb0c41!8m2!3d47.6134738!4d1.3273035!9m1!1b1';

  // Texte fourni mot pour mot par l'étude, une ligne vide entre chaque paragraphe (il se termine
  // lui-même par « Bien cordialement. », la signature de l'office est ajoutée à l'envoi). La ligne
  // « Cliquez ici … : adresse » devient un lien sur « Cliquez ici » dans la version HTML
  // (ligneHtmlEmail). Le PDF du questionnaire est joint à l'email (.eml), ou téléchargé à côté en
  // mode messagerie par défaut.
  function construireEmailQuestionnaireSatisfaction(d) {
    return {
      sujet: 'Questionnaire de satisfaction',
      corps: [
        'Madame, Monsieur,',
        'La qualité du service rendu à nos clients est une priorité pour notre office. Elle traduit l’engagement de notre équipe pour s’adapter à vos attentes.',
        'Afin de recueillir votre avis, deux solutions s’offrent à vous :\n1. Répondre au questionnaire satisfaction ci-joint, de manière anonyme, et nous le retourner.\n2. Laisser un avis en ligne afin de faire profiter de votre expérience au sein de notre office. Cliquez ici pour laisser votre avis : ' + LIEN_AVIS_GOOGLE_OFFICE,
        'Sachez que toute l’office notarial a eu à cœur de vous accompagner et espère pouvoir collaborer à vos côtés de nouveau.',
        'Dans l’attente et vous en remerciant vivement par avance,',
        'Bien cordialement.'
      ].join('\n\n')
    };
  }

  // Déclenche le téléchargement du PDF du questionnaire (QUESTIONNAIRE_SATISFACTION_PDF_BASE64,
  // chargé par questionnaire-satisfaction-pdf.js). Doit rester dans le même geste utilisateur que
  // le mailto qui suit : les deux actions ont besoin de l'activation du clic d'origine.
  function telechargerPdfQuestionnaire() {
    try {
      if (typeof QUESTIONNAIRE_SATISFACTION_PDF_BASE64 !== 'string') return false;
      const octets = atob(QUESTIONNAIRE_SATISFACTION_PDF_BASE64);
      const tableau = new Uint8Array(octets.length);
      for (let i = 0; i < octets.length; i++) tableau[i] = octets.charCodeAt(i);
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(new Blob([tableau], { type: 'application/pdf' }));
      lien.download = 'Enquete_satisfaction.pdf';
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  // `partie` : 'acquereur' (par défaut — l'envoi clôt et archive le dossier) ou 'vendeur' (étude,
  // 02/10 : « permettre l'envoi au vendeur aussi » — sans archiver ; jamais si un confrère le
  // représente, même règle que pour l'acquéreur).
  async function envoyerQuestionnaireSatisfaction(id, discret, partie) {
    const d = dossiers.find(x => x.id === id);
    const vendeur = partie === 'vendeur';
    if (!d || (vendeur ? confrereRepresenteVendeur(d) : notaireParticipantRepresenteAcquereur(d))) return;
    const destinataire = (vendeur ? d.emailVendeur : d.emailAcquereur) || '';
    if (!destinataire) {
      afficherToast(`Aucun email ${vendeur ? 'du vendeur' : "d'acquéreur"} renseigné pour ce dossier — impossible de préparer le questionnaire.`, 'OK', null);
      return;
    }
    const { sujet, corps } = emailDepuisModele('questionnaire', d);
    const pdfDispo = typeof QUESTIONNAIRE_SATISFACTION_PDF_BASE64 === 'string' && QUESTIONNAIRE_SATISFACTION_PDF_BASE64;
    const pieces = pdfDispo ? [{ nom: 'Enquete_satisfaction.pdf', type: 'application/pdf', contenuBase64: QUESTIONNAIRE_SATISFACTION_PDF_BASE64 }] : [];
    const r = await livrerEmailDossier({ destinataire, sujet, corps, pieces, responsableSignature: d.responsable, dossierId: d.id, geste: 'questionnaire' });
    if (!r.ok) { if (!r.annule) afficherToast(r.message || "L'email n'a pas pu être préparé.", 'OK', null); return; }
    // Le fichier .eml porte le PDF ; en mode mailto (texte seul), il est téléchargé à côté, à joindre.
    const pdfTelecharge = r.mode === 'mailto' ? telechargerPdfQuestionnaire() : false;
    // Les deux envois archivent le dossier (étude, 02/10 : « archiver le dossier quand le
    // questionnaire est envoyé aussi au vendeur ») ; le second reste proposé une fois archivé.
    const dejaArchive = !!d.archive;
    if (vendeur) {
      d.questionnaireVendeurEnvoyeLe = new Date().toISOString().slice(0, 10);
      ajouterHistorique(d, 'Questionnaire de satisfaction envoyé au vendeur');
    } else {
      d.questionnaireEnvoyeLe = new Date().toISOString().slice(0, 10);
      ajouterHistorique(d, 'Questionnaire de satisfaction envoyé');
      notifierTacheFaite(d, 'Envoyer le questionnaire de satisfaction', dejaArchive ? '' : 'dossier archivé');
    }
    if (!dejaArchive) {
      d.archive = true;
      ajouterHistorique(d, `Dossier archivé automatiquement (questionnaire de satisfaction envoyé${vendeur ? ' au vendeur' : ''})`);
    }
    sauvegarder(d);
    render();
    let detail = dejaArchive ? '' : 'Dossier archivé.';
    if (r.mode === 'eml' && !pdfDispo) detail += ' Le PDF du questionnaire n’a pas pu être joint.';
    if (r.mode === 'mailto') detail += pdfTelecharge ? ' Joignez le PDF du questionnaire, qui vient d’être téléchargé.' : ' Le PDF du questionnaire n’a pas pu être téléchargé.';
    annoncerEmailPret(r, discret, detail.trim());
  }

  // Affichée juste après "Écrire par email" : absente pour un dossier déjà archivé (l'action n'a
  // plus de sens) et — demandé
  // explicitement par l'étude — dès que l'acquéreur est représenté par un notaire distinct du
  // nôtre : ce questionnaire ne doit JAMAIS être proposé/adressé au confrère, contrairement aux
  // autres relances ciblées qui, elles, transitent par lui dans ce cas.

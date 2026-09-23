'use strict';

// Effacement, dans le compte Gmail qui sert d'expéditeur, de la copie que Gmail range d'office dans
// « Messages envoyés » pour tout message parti par smtp.gmail.com — demandé par l'étude : chaque
// rappel porte un nom de dossier et une échéance, qui n'ont pas à rester stockés chez Google une
// fois le message remis à la boîte-passerelle. Le SMTP ne permet pas d'empêcher cette copie ; il
// faut revenir la supprimer par IMAP, avec le même compte et le même mot de passe d'application.
//
// Client IMAP minimal écrit ici plutôt qu'une bibliothèque : il ne faut que sept commandes (LOGIN,
// LIST, SELECT, UID SEARCH, UID MOVE, UID STORE, UID EXPUNGE), et les bibliothèques disponibles
// tirent une journalisation à base de worker threads qui supporte mal l'exécutable SEA — même
// raison que `llm.js` sans dépendance pour Ollama.
//
// Trois décisions, à garder en tête avant d'y toucher :
//   • le message est retrouvé par son Message-ID EXACT, jamais par son destinataire ou son objet :
//     le compte Gmail peut aussi servir à autre chose, et un critère large effacerait des messages
//     que CLAIRE n'a pas envoyés ;
//   • il est déplacé dans la corbeille PUIS supprimé de la corbeille (sinon Gmail le garde 30 jours) ;
//   • un échec n'annule JAMAIS l'envoi, qui a déjà eu lieu : il est rapporté comme avertissement.

const tls = require('node:tls');

const HOTE_IMAP_GMAIL = 'imap.gmail.com';
const PORT_IMAP_GMAIL = 993;
const TIMEOUT_MS = 20 * 1000;
// Gmail range la copie envoyée presque aussitôt, mais pas toujours avant que la recherche ne parte :
// quelques relances espacées couvrent ce décalage sans rien coûter quand le message est déjà là.
const TENTATIVES_RECHERCHE = 3;
const PAUSE_RECHERCHE_MS = 2000;

function estCompteGmail(reglages) {
  const hote = String((reglages && reglages.smtpHote) || '').toLowerCase();
  return /(^|\.)(gmail|googlemail)\.com$/.test(hote);
}

function quoterImap(valeur) {
  return '"' + String(valeur).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function deQuoterImap(valeur) {
  const v = String(valeur).trim();
  if (!v.startsWith('"')) return v;
  return v.slice(1, -1).replace(/\\(["\\])/g, '$1');
}

// `* LIST (\HasNoChildren \Sent) "/" "[Gmail]/Sent Mail"` → { attributs: ['\HasNoChildren','\Sent'], nom }
function lireLigneList(ligne) {
  const m = /^\* LIST \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) (.+)$/i.exec(ligne);
  if (!m) return null;
  return { attributs: m[1].split(/\s+/).filter(Boolean), nom: deQuoterImap(m[2]) };
}

// Le nom des dossiers spéciaux dépend de la langue du compte (« Sent Mail », « Messages envoyés »…) :
// on lit l'attribut \Sent / \Trash (RFC 6154) plutôt que de supposer un nom.
function dossiersSpeciaux(lignesList) {
  let envoyes = null;
  let corbeille = null;
  for (const l of lignesList) {
    const d = lireLigneList(l);
    if (!d) continue;
    const attrs = d.attributs.map((a) => a.toLowerCase());
    if (!envoyes && attrs.includes('\\sent')) envoyes = d.nom;
    if (!corbeille && attrs.includes('\\trash')) corbeille = d.nom;
  }
  return {
    envoyes: envoyes || '[Gmail]/Sent Mail',
    corbeille: corbeille || '[Gmail]/Trash'
  };
}

function lireUidsSearch(lignes) {
  const uids = [];
  for (const l of lignes) {
    const m = /^\* SEARCH\b(.*)$/i.exec(l);
    if (m) m[1].trim().split(/\s+/).filter((x) => /^\d+$/.test(x)).forEach((x) => uids.push(Number(x)));
  }
  return uids;
}

// `* OK [COPYUID 1 12,45 100:101] ...` → '100:101' : les UID des messages une fois dans la corbeille.
function lireCopyUid(lignes) {
  for (const l of lignes) {
    const m = /\[COPYUID \d+ \S+ ([\d:,]+)\]/i.exec(l);
    if (m) return m[1];
  }
  return null;
}

class SessionImap {
  constructor(socket, timeoutMs) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.tampon = '';
    this.compteur = 0;
    this.attente = null;
    socket.setEncoding('utf8');
    socket.on('data', (d) => { this.tampon += d; this.verifier(); });
    socket.on('error', (e) => this.echouer(e));
    socket.on('close', () => this.echouer(new Error('connexion IMAP fermée')));
  }

  attendre(marque) {
    return new Promise((resoudre, rejeter) => {
      const minuteur = setTimeout(() => this.echouer(new Error('délai IMAP dépassé')), this.timeoutMs);
      this.attente = { marque, resoudre, rejeter, minuteur };
      this.verifier();
    });
  }

  verifier() {
    if (!this.attente) return;
    const lignes = this.tampon.split('\r\n');
    for (let i = 0; i < lignes.length - 1; i++) {
      const l = lignes[i];
      const fin = this.attente.marque === '*' ? l.startsWith('* ') : l.startsWith(this.attente.marque + ' ');
      if (fin) {
        this.tampon = lignes.slice(i + 1).join('\r\n');
        const a = this.attente;
        this.attente = null;
        clearTimeout(a.minuteur);
        a.resoudre(lignes.slice(0, i + 1));
        return;
      }
    }
  }

  echouer(erreur) {
    if (!this.attente) return;
    const a = this.attente;
    this.attente = null;
    clearTimeout(a.minuteur);
    a.rejeter(erreur);
  }

  async commande(texte) {
    const tag = `C${++this.compteur}`;
    const reponse = this.attendre(tag);
    this.socket.write(`${tag} ${texte}\r\n`);
    const lignes = await reponse;
    const derniere = lignes[lignes.length - 1].slice(tag.length + 1);
    return { statut: derniere.split(' ')[0].toUpperCase(), fin: derniere, lignes };
  }

  // Le texte de la commande n'est jamais repris dans l'erreur : LOGIN porte le mot de passe.
  async exiger(texte, quoi) {
    const r = await this.commande(texte);
    if (r.statut !== 'OK') throw new Error(`${quoi} refusé par le serveur (${r.fin})`);
    return r;
  }

  fermer() {
    try { this.socket.write(`C${++this.compteur} LOGOUT\r\n`); } catch (e) { /* déjà fermée */ }
    try { this.socket.end(); } catch (e) { /* déjà fermée */ }
  }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// `options.creerSocket(hote, port)` et `options.pauseMs` injectables pour les tests (voir
// server/test/imap-gmail.test.js, qui joue le rôle du serveur IMAP en local).
async function effacerCopiesEnvoyees(reglages, messageIds, options) {
  const opts = options || {};
  const r = reglages || {};
  const ids = [...new Set((messageIds || []).filter((x) => typeof x === 'string' && x.trim()))];
  if (!ids.length || !estCompteGmail(r)) return { ok: true, ignore: true, effaces: 0, introuvables: 0, erreur: null };
  if (!r.smtpUtilisateur || !r.smtpMotDePasse) {
    return { ok: false, effaces: 0, introuvables: ids.length, erreur: 'Compte Gmail ou mot de passe d\'application manquant : la copie envoyée n\'a pas pu être effacée.' };
  }

  const pauseMs = Number.isFinite(opts.pauseMs) ? opts.pauseMs : PAUSE_RECHERCHE_MS;
  const creerSocket = opts.creerSocket
    || ((hote, port) => tls.connect({ host: hote, port, servername: hote }));
  let session = null;
  try {
    session = new SessionImap(creerSocket(HOTE_IMAP_GMAIL, PORT_IMAP_GMAIL), opts.timeoutMs || TIMEOUT_MS);
    await session.attendre('*'); // message d'accueil du serveur
    await session.exiger(`LOGIN ${quoterImap(r.smtpUtilisateur)} ${quoterImap(r.smtpMotDePasse)}`, 'Connexion IMAP');
    const liste = await session.exiger('LIST "" "*"', 'Liste des dossiers');
    const dossiers = dossiersSpeciaux(liste.lignes);

    await session.exiger(`SELECT ${quoterImap(dossiers.envoyes)}`, 'Ouverture de « Messages envoyés »');
    const uids = [];
    let introuvables = 0;
    for (const id of ids) {
      let trouves = [];
      for (let essai = 0; essai < TENTATIVES_RECHERCHE && !trouves.length; essai++) {
        if (essai > 0) {
          await pause(pauseMs);
          await session.commande('NOOP'); // laisse le serveur annoncer les messages arrivés entre-temps
        }
        const res = await session.exiger(`UID SEARCH HEADER Message-ID ${quoterImap(id)}`, 'Recherche');
        trouves = lireUidsSearch(res.lignes);
      }
      if (trouves.length) uids.push(...trouves);
      else introuvables++;
    }

    let effaces = 0;
    if (uids.length) {
      const ensemble = [...new Set(uids)].join(',');
      const deplacement = await session.exiger(`UID MOVE ${ensemble} ${quoterImap(dossiers.corbeille)}`, 'Déplacement vers la corbeille');
      let dansCorbeille = lireCopyUid(deplacement.lignes);
      await session.exiger(`SELECT ${quoterImap(dossiers.corbeille)}`, 'Ouverture de la corbeille');
      if (!dansCorbeille) {
        // Serveur sans COPYUID : on retrouve les messages dans la corbeille par le même Message-ID.
        const retrouves = [];
        for (const id of ids) {
          const res = await session.exiger(`UID SEARCH HEADER Message-ID ${quoterImap(id)}`, 'Recherche dans la corbeille');
          retrouves.push(...lireUidsSearch(res.lignes));
        }
        dansCorbeille = retrouves.length ? [...new Set(retrouves)].join(',') : null;
      }
      if (dansCorbeille) {
        await session.exiger(`UID STORE ${dansCorbeille} +FLAGS.SILENT (\\Deleted)`, 'Marquage pour suppression');
        // UID EXPUNGE ne supprime QUE ces messages, jamais un autre message déjà marqué dans la corbeille.
        await session.exiger(`UID EXPUNGE ${dansCorbeille}`, 'Suppression définitive');
      }
      effaces = [...new Set(uids)].length;
    }

    return {
      ok: introuvables === 0,
      effaces,
      introuvables,
      erreur: introuvables
        ? `${introuvables} copie(s) introuvable(s) dans « Messages envoyés » du compte Gmail : à effacer à la main si besoin.`
        : null
    };
  } catch (e) {
    return { ok: false, effaces: 0, introuvables: ids.length, erreur: `Copie Gmail non effacée (${e.message}).` };
  } finally {
    if (session) session.fermer();
  }
}

module.exports = {
  effacerCopiesEnvoyees, estCompteGmail, dossiersSpeciaux, lireLigneList, lireUidsSearch, lireCopyUid, quoterImap
};

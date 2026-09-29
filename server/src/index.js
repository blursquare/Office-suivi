// Point d'entrée : ouvre la base, construit l'app, démarre le serveur HTTP. Les tâches de fond
// (relances email, M4 ; flux calendrier n'a pas besoin de tâche de fond, il se génère à la
// demande, M5) seront démarrées ici aux prochaines étapes — voir le plan.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { exec, spawn } = require('node:child_process');

// Un échec AU DÉMARRAGE (config.json illisible, port déjà pris, base inaccessible) survient avant
// que quoi que ce soit ait pu être journalisé, et la fenêtre de console d'un .exe à double-clic se
// referme dans la seconde : de l'extérieur, « la fenêtre clignote puis rien ». Signalé par l'étude
// après avoir renseigné `nasRacine` dans config.json. Le message est donc écrit dans un FICHIER à
// côté de l'exécutable — seul canal qui survive à la fermeture de la fenêtre — et la console est
// maintenue ouverte quand il y en a une, pour qui a lancé l'exe depuis une invite de commandes.
function estSea() {
  try {
    return require('node:sea').isSea();
  } catch (_) {
    return false;
  }
}

function signalerEchecDemarrage(erreur) {
  const message = erreur && erreur.configIllisible ? erreur.message : (erreur && erreur.stack) || String(erreur);
  const texte =
    `CLAIRE n'a pas pu démarrer.\r\n` +
    `[${new Date().toISOString()}]\r\n\r\n` +
    message.replace(/\n/g, '\r\n') +
    `\r\n`;
  console.error(`\n[CLAIRE] ÉCHEC AU DÉMARRAGE\n\n${message}\n`);
  if (estSea()) {
    try {
      const cible = path.join(path.dirname(process.execPath), 'erreur-demarrage.txt');
      fs.writeFileSync(cible, texte);
      console.error(`[CLAIRE] Ce message est aussi enregistré dans : ${cible}`);
    } catch (_) { /* rien à faire de plus : la console garde la trace */ }
  }
  // Sans ça, la fenêtre se referme avant qu'on ait pu lire quoi que ce soit. `isTTY` distingue une
  // vraie console d'un lancement sans fenêtre (Lancer-CLAIRE-en-arriere-plan.vbs, service NSSM) :
  // y attendre une touche bloquerait le processus indéfiniment sans que personne ne le voie.
  if (process.stdout.isTTY && process.stdin.isTTY) {
    console.error('[CLAIRE] Appuyez sur Entrée pour fermer cette fenêtre.');
    try {
      fs.readSync(0, Buffer.alloc(1), 0, 1, null);
    } catch (_) { /* pas de saisie possible — on sort quand même */ }
  }
  process.exit(1);
}

let config;
try {
  config = require('./config');
} catch (err) {
  signalerEchecDemarrage(err);
}

const { ouvrirDb } = require('./db');
const { creerApp } = require('./app');
const { resoudreCheminNavigateurApp } = require('./navigateurApp');
const { demarrerSurveillanceNas } = require('./nasWatch');
const { demarrerSurveillanceAgenda } = require('./agendaWatch');
const { demarrerTacheRappels } = require('./jobs/rappels');
const { demarrerResumeEmails } = require('./emailsMatin');
const { demarrerSauvegardeAutomatique } = require('./sauvegarde');

// Journal de secours à côté de la base (même dossier `data/`, déjà résolu correctement en mode
// développement comme en mode exécutable autonome — voir config.js) : signalé par l'étude, le
// serveur s'arrête parfois après quelques minutes sans qu'aucun message ne reste visible — la
// fenêtre de console d'un .exe à double-clic se ferme instantanément à la fin du processus, trop
// vite pour lire une éventuelle pile d'erreur. Sans journal persistant, chaque occurrence repart
// de zéro pour le diagnostic. Ce journal ne remplace pas une vraie investigation une fois une
// trace obtenue — juste de quoi ne plus perdre l'information la prochaine fois que ça arrive.
const cheminJournalCrash = path.join(path.dirname(config.cheminDb), 'crash.log');

function journaliserErreurFatale(origine, erreur) {
  const ligne = `[${new Date().toISOString()}] ${origine} : ${erreur && erreur.stack ? erreur.stack : erreur}\n`;
  console.error(ligne);
  try {
    fs.mkdirSync(path.dirname(cheminJournalCrash), { recursive: true });
    fs.appendFileSync(cheminJournalCrash, ligne);
  } catch (e) { /* même l'écriture du journal a échoué — la console garde au moins la trace */ }
}

// Continuer plutôt qu'arrêter le processus : ce serveur n'a quasiment aucun état mutable en
// mémoire en dehors de la connexion SQLite (déjà rouverte) et des sessions d'authentification
// (auth.js) — perdre ces dernières force juste une reconnexion, sans conséquence grave. Pour un
// outil de 3 personnes où chaque minute d'indisponibilité se voit immédiatement, rester debout et
// journaliser l'incident vaut mieux qu'un arrêt silencieux dont plus personne ne voit la trace.
// Si une vraie cause récurrente apparaît dans crash.log, la corriger directement plutôt que de
// compter indéfiniment sur ce filet.
process.on('uncaughtException', (err) => journaliserErreurFatale('Exception non interceptée', err));
process.on('unhandledRejection', (raison) => journaliserErreurFatale('Promesse rejetée non gérée', raison));

const { adressesLan } = require('./reseau');

// Ouvre l'outil au démarrage dans une fenêtre Chrome/Edge dédiée, sans onglets ni barre
// d'adresse — même rendu que `Ouvrir-en-fenetre.bat` pour la version 100% locale (voir CLAUDE.md,
// contrainte n°7), mais ici déclenché automatiquement par le serveur lui-même (pas besoin d'un
// script séparé, cette version n'ouvre jamais un simple fichier `file://`). `--profile-directory`
// (nommé, PAS `--user-data-dir`) est la seule combinaison confirmée ouvrir une fenêtre autonome
// même quand Chrome est déjà lancé par ailleurs — un `--app` seul rouvrirait alors un simple
// onglet dans la fenêtre existante (voir l'historique détaillé de ces essais dans CLAUDE.md).
// Le profil dédié ("ClaireServeur") n'a ici aucune conséquence sur les données : contrairement à
// la version locale (`localStorage`, propre à chaque profil Chrome), cette version stocke tout
// côté serveur — le même registre reste visible quel que soit le profil utilisé pour l'ouvrir.
// Repli sur le navigateur par défaut (`start ""`, ouvert dans un onglet normal) si ni Chrome ni
// Edge n'est trouvé aux emplacements usuels.
function ouvrirNavigateur(url) {
  if (process.platform !== 'win32') return;
  // Un service Windows (installé via NSSM, voir server/scripts/Installer-service-NSSM.bat) tourne
  // dans la Session 0, sans bureau interactif : `start` y lancerait un processus fantôme (ou rien
  // du tout) plutôt qu'un vrai navigateur visible par quelqu'un. `SESSIONNAME` n'est renseignée
  // QUE dans une session interactive (console locale ou bureau à distance) — absente en Session 0,
  // c'est le signal le plus simple pour distinguer les deux sans dépendance supplémentaire.
  if (!process.env.SESSIONNAME) {
    console.log('[CLAIRE] Session non interactive (service Windows) : ouverture automatique du navigateur ignorée.');
    return;
  }
  const cheminNavigateur = resoudreCheminNavigateurApp(process.env, fs.existsSync);
  const ouvrirParDefaut = () => {
    exec(`start "" "${url}"`, (err) => {
      if (err) console.warn('[CLAIRE] Impossible d\'ouvrir le navigateur automatiquement :', err.message);
    });
  };
  if (!cheminNavigateur) {
    ouvrirParDefaut();
    return;
  }
  const lancer = () => exec(`start "" "${cheminNavigateur}" --profile-directory="ClaireServeur" --app="${url}"`, (err) => {
    if (err) {
      console.warn('[CLAIRE] Ouverture en fenêtre applicative impossible, repli sur le navigateur par défaut :', err.message);
      ouvrirParDefaut();
    }
  });
  // Raccourci du menu Démarrer portant l'identifiant de cette fenêtre et l'icône nette de l'exe
  // (voir raccourciWindows.js) : posé AVANT d'ouvrir la fenêtre, 15 s au plus.
  Promise.race([assurerRaccourciMenuDemarrer(url, cheminNavigateur), new Promise((r) => setTimeout(r, 15000))])
    .catch((e) => console.warn('[CLAIRE] Raccourci du menu Démarrer non créé :', e.message))
    .finally(lancer);
}

// Crée ou met à jour %APPDATA%\Microsoft\Windows\Start Menu\Programs\CLAIRE.lnk (voir
// raccourciWindows.js). Refait seulement si l'identifiant, la cible ou l'icône ont changé (repère
// dans %APPDATA%\CLAIRE\raccourci.json) ou si le raccourci a disparu : PowerShell compile un peu
// de C# à chaque appel, inutile de le relancer à chaque démarrage.
async function assurerRaccourciMenuDemarrer(url, cheminNavigateur) {
  const appdata = process.env.APPDATA;
  if (!appdata || !config.estSea()) return;
  const r = require('./raccourciWindows');
  const profil = 'ClaireServeur';
  const aumid = r.appUserModelIdFenetreApp({ baseAppId: r.baseAppIdNavigateur(cheminNavigateur), url, dossierDonnees: 'User Data', profil });
  const voulu = {
    chemin: path.join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'CLAIRE.lnk'),
    cible: cheminNavigateur,
    argumentsLigne: `--profile-directory="${profil}" --app="${url}"`,
    icone: process.execPath,
    aumid,
    description: 'CLAIRE — Registre des échéances notariales'
  };
  const repere = path.join(appdata, 'CLAIRE', 'raccourci.json');
  try {
    const ancien = JSON.parse(await fs.promises.readFile(repere, 'utf8'));
    await fs.promises.access(voulu.chemin);
    if (JSON.stringify(ancien) === JSON.stringify(voulu)) return;
  } catch (e) { /* absent ou différent : on (re)crée */ }
  const script = r.scriptPowerShellRaccourci(voulu);
  await new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
    let erreur = '';
    ps.stderr.on('data', (d) => { erreur += d; });
    ps.on('error', reject);
    ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error((erreur || `code ${code}`).split('\n')[0]))));
  });
  await fs.promises.mkdir(path.dirname(repere), { recursive: true });
  await fs.promises.writeFile(repere, JSON.stringify(voulu));
  console.log(`[CLAIRE] Raccourci du menu Démarrer créé (${aumid}) : icône nette dans la barre des tâches.`);
}

// Scripts assistants (lanceur sans fenêtre, arrêt, démarrage avec la session Windows) : voir
// scriptsAssistants.js, module séparé pour rester testable sans exécutable réel.
const { assurerScriptsAssistants } = require('./scriptsAssistants');

// Redémarrage après une mise à jour en un clic (voir miseAJour.js) : à ce stade, le fichier
// CLAIRE-serveur.exe est DÉJÀ la nouvelle version (l'ancienne a été renommée), et
// `process.execPath` désigne ce chemin. On ferme d'abord le port et la base — sinon la nouvelle
// instance trouverait le port occupé et s'arrêterait (EADDRINUSE) — puis :
//   - session interactive (lancement direct ou Lancer-CLAIRE-en-arriere-plan.vbs) : on relance
//     l'exécutable, détaché et sans fenêtre, avant de s'arrêter ;
//   - service Windows (NSSM, pas de SESSIONNAME — même signal que ouvrirNavigateur) : on s'arrête
//     seulement, NSSM relance lui-même CLAIRE-serveur.exe, donc la nouvelle version. Relancer ici
//     AUSSI ferait démarrer deux instances.
// CLAIRE_APRES_MISE_A_JOUR évite à la nouvelle instance de rouvrir une fenêtre Chrome : la page
// déjà ouverte se recharge d'elle-même une fois le serveur revenu.
function redemarrerApresMiseAJour(serveur, db) {
  let fait = false;
  const terminer = () => {
    if (fait) return;
    fait = true;
    try { db.close(); } catch (_) { /* déjà fermée */ }
    if (process.env.SESSIONNAME) {
      try {
        spawn(process.execPath, [], {
          cwd: path.dirname(process.execPath),
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          env: { ...process.env, CLAIRE_APRES_MISE_A_JOUR: '1' }
        }).unref();
      } catch (e) {
        journaliserErreurFatale('Relance après mise à jour', e);
      }
    }
    process.exit(0);
  };
  serveur.close(terminer);
  if (typeof serveur.closeAllConnections === 'function') serveur.closeAllConnections();
  setTimeout(terminer, 5000).unref();
}

function demarrer() {
  const db = ouvrirDb(config.cheminDb);
  let serveur = null;
  const { app, depot, parametresRepo } = creerApp({
    db,
    config,
    miseAJour: { redemarrer: () => redemarrerApresMiseAJour(serveur, db) }
  });

  // Surveillance périodique du NAS (nouveaux documents, voir nasWatch.js) : silencieuse si
  // `nasRacine` n'est pas configurée (comme le reste des fonctionnalités liées au NAS), et sans
  // effet sur les tests qui montent `creerApp()` directement — ce minuteur ne démarre qu'ici, au
  // vrai point d'entrée du serveur.
  demarrerSurveillanceNas(depot, config);

  // Lecture périodique de l'agenda de l'office par EWS (voir agendaWatch.js) : silencieuse tant que
  // la connexion Exchange n'est pas configurée dans Réglages › Agenda — même principe
  // que la surveillance du NAS ci-dessus, et démarrée au même seul endroit réel (jamais dans
  // app.js, pour ne pas déclencher ce minuteur dans les tests qui montent creerApp() directement).
  demarrerSurveillanceAgenda(depot, parametresRepo);

  // Rappels automatiques par email (voir jobs/rappels.js) : silencieux tant que l'étude n'a pas
  // activé/configuré l'envoi depuis l'écran Réglages (emailActif/smtpHote/emailPasserelle, table
  // `parametres`) — même principe que la surveillance du NAS ci-dessus, et démarré au même seul
  // endroit réel (jamais dans app.js, pour ne pas déclencher ce minuteur dans les tests qui
  // montent creerApp() directement).
  demarrerTacheRappels(depot, db, config, parametresRepo);

  // Sauvegarde quotidienne de la base (voir sauvegarde.js) : vérifiée toutes les heures, faite
  // une fois par jour. Même règle que les deux minuteurs ci-dessus : démarrée ici seulement.
  demarrerSauvegardeAutomatique(db, config, parametresRepo);

  // Résumé des emails du matin (voir emailsMatin.js) : 8 h 50 les jours ouvrés, un seul essai par
  // jour. Silencieux tant que la connexion Exchange n'est pas configurée. Démarré ici seulement.
  demarrerResumeEmails(depot, parametresRepo);

  serveur = app.listen(config.port, () => {
    const url = `http://localhost:${config.port}/`;
    const adresses = adressesLan();
    console.log(`[CLAIRE] Serveur intranet démarré sur le port ${config.port}.`);
    console.log(`[CLAIRE] Base : ${config.cheminDb}`);
    console.log(`[CLAIRE] Journal d'erreurs (en cas d'arrêt inattendu) : ${cheminJournalCrash}`);
    console.log(`[CLAIRE] Ouvrir dans ce poste : ${url}`);
    for (const ip of adresses) {
      console.log(`[CLAIRE] Depuis un autre poste du bureau : http://${ip}:${config.port}/`);
    }

    // Adresse(s) d'abonnement du calendrier connecté (voir routes/calendrier.js) — affichées ici
    // plutôt que dans config.js, qui ne connaît ni les IP LAN ni le port final au moment où le
    // jeton est résolu. Rien à afficher si aucun jeton n'est configuré (mode développement sans
    // CALENDRIER_TOKEN dans .env) : le calendrier connecté reste une fonctionnalité optionnelle,
    // silencieuse quand elle n'est pas activée — voir server/README.md.
    let urlsCalendrier = [];
    if (config.jetonCalendrier) {
      urlsCalendrier = [`http://localhost:${config.port}/calendrier.ics?token=${config.jetonCalendrier}`]
        .concat(adresses.map((ip) => `http://${ip}:${config.port}/calendrier.ics?token=${config.jetonCalendrier}`));
      console.log('[CLAIRE] Calendrier connecté (à coller dans Outlook > Ajouter un calendrier > À partir d\'Internet) :');
      for (const u of urlsCalendrier) console.log(`[CLAIRE]   ${u}`);
    }

    if (config.estSea()) {
      const dossierExe = path.dirname(process.execPath);
      // Copies de secours en trop laissées par une mise à jour dont l'effacement avait été refusé
      // (voir miseAJour.js) : en arrière-plan, sans jamais bloquer le démarrage.
      require('./miseAJour').nettoyerAnciensExecutables(dossierExe)
        .then((effaces) => { if (effaces.length) console.log(`[CLAIRE] Anciennes copies effacées : ${effaces.join(', ')}`); })
        .catch(() => {});
      try {
        const crees = assurerScriptsAssistants(dossierExe);
        if (crees.length) console.log(`[CLAIRE] Scripts assistants créés à côté de l'exécutable : ${crees.join(', ')}`);
        // PID écrit à chaque démarrage (jamais supprimé au préalable) : Arreter-CLAIRE.bat en a
        // besoin pour cibler le bon processus, y compris s'il y a plusieurs node.exe sur le poste.
        fs.writeFileSync(path.join(dossierExe, 'server.pid'), String(process.pid));
        // Persisté en plus de la console : une fenêtre masquée (voir Lancer-CLAIRE-en-arriere-
        // plan.vbs ci-dessus) ne laisse plus jamais rien voir passer autrement.
        const lignesAdresses = [
          `Ouvrir dans ce poste : ${url}`,
          ...adresses.map((ip) => `Depuis un autre poste du bureau : http://${ip}:${config.port}/`)
        ];
        if (urlsCalendrier.length) {
          lignesAdresses.push(
            '',
            "Calendrier connecté (Outlook > Ajouter un calendrier > À partir d'Internet) :",
            ...urlsCalendrier
          );
        }
        fs.writeFileSync(path.join(dossierExe, 'Adresses-du-serveur.txt'), lignesAdresses.join('\r\n') + '\r\n');
      } catch (e) {
        console.warn('[CLAIRE] Fichiers assistants (scripts de lancement/arrêt, PID) non créés :', e.message);
      }
    }

    // Après une mise à jour en un clic, la fenêtre déjà ouverte se recharge d'elle-même.
    if (!process.env.CLAIRE_APRES_MISE_A_JOUR) ouvrirNavigateur(url);
  });

  // Port déjà occupé (un serveur CLAIRE déjà lancé, masqué par Lancer-CLAIRE-en-arriere-plan.vbs,
  // ou un autre logiciel sur le 3000) : `listen` échoue de façon asynchrone, donc HORS du
  // try/catch de `demarrer()`. Sans ce gestionnaire, l'exception remonte en `uncaughtException`,
  // qui journalise puis LAISSE TOURNER un processus qui n'écoute rien — le pire des deux mondes.
  serveur.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      signalerEchecDemarrage(
        new Error(
          `Le port ${config.port} est déjà utilisé.\n\n` +
            `CLAIRE est probablement DÉJÀ en cours d'exécution sur ce poste, sans fenêtre visible\n` +
            `(voir Lancer-CLAIRE-en-arriere-plan.vbs). Ouvrez http://localhost:${config.port}/ pour\n` +
            `le vérifier. Pour le relancer malgré tout, lancez d'abord Arreter-CLAIRE.bat.`
        )
      );
      return;
    }
    signalerEchecDemarrage(err);
  });
}

try {
  demarrer();
} catch (err) {
  // Échec synchrone : base de données inaccessible (dossier `data/` en lecture seule, disque
  // plein, fichier verrouillé par une sauvegarde), module natif manquant… Même traitement que
  // pour config.json — un message lisible qui survit à la fermeture de la fenêtre.
  signalerEchecDemarrage(err);
}

# Vérifications à faire au bureau

Ces points sont construits et testés en simulation, mais n'ont jamais tourné sur les vrais
systèmes de l'étude (Exchange, Outlook, Teams, Windows). Compter environ 30 minutes.

**Avant de commencer** : ouvrir « À propos » et noter la version affichée. Si un point échoue,
noter ce qui s'affiche à l'écran (une capture suffit) et le signaler avec la version.

Utiliser un **dossier de test** (un nom inventé, ex. « TEST / ESSAI ») pour tout ce qui écrit
dans l'agenda, et le supprimer à la fin.

---

## 1. Sauvegarde (le plus important)

- [ ] Réglages › Général › Sauvegarde : l'encart est **vert** et indique une copie de moins de 24 h.
- [ ] Le dossier de destination contient bien des fichiers `claire-AAAA-MM-JJ.db`.
- [ ] **Restauration à blanc** (ne touche pas la base en service) : copier la dernière sauvegarde
      sur un autre poste, dans un dossier vide contenant aussi `CLAIRE-serveur.exe` et un sous-dossier
      `data/`, la renommer `data/claire.db`, lancer l'exe → les dossiers de l'étude apparaissent.
      Fermer ensuite cet exe de test (`Arreter-CLAIRE.bat` dans ce même dossier).

## 2. Agenda Outlook de l'office (Exchange)

Réglages › Rappels et agenda › Agenda Outlook de l'office.

- [ ] « Tester » répond en vert avec le nom du calendrier.
- [ ] Sur le dossier de test, saisir une date de **rendez-vous de signature** → dans l'encadré
      « Prochaine étape », la ligne « Créer le rendez-vous dans l'agenda Outlook » s'ouvre sur le
      formulaire heure/durée. Choisir « À l'office », 14:00, puis « Créer le rendez-vous ».
      Dans Outlook, **calendrier partagé de Sophie** : le rendez-vous « VTE - TEST / ESSAI »
      apparaît au bon jour, à la bonne heure, **en vert**.
- [ ] Refaire avec « En visio » sur un autre dossier de test → **violet** ; « Chez un confrère » →
      **orange**. Si un rendez-vous sort **sans couleur** : le nom de la catégorie dans les Réglages
      ne correspond pas exactement à celui d'Outlook (noter le nom affiché dans Outlook).
- [ ] Changer la date du rendez-vous sur la fiche → le rendez-vous **se déplace** dans Outlook
      (même heure), sans en créer un second.
- [ ] Saisir une date « Envoi appel de fonds » → dans Outlook, le **lieu** du rendez-vous se termine
      par « Appel de fonds envoyé », et la couleur n'a pas changé.
- [ ] Saisir une date d'**obtention du prêt** → un événement « journée entière » apparaît ce jour-là
      dans le calendrier de Sophie. Marquer l'offre reçue (ou retirer la date) → il disparaît.
- [ ] Supprimer le rendez-vous de signature sur la fiche (croix, au survol de la ligne
      « Signature ») → il disparaît d'Outlook
      (il reste récupérable dans « Éléments supprimés »).

- [ ] Emails du matin : un jour ouvré après 8 h 50, la fenêtre « Aujourd'hui » affiche « Emails
      depuis hier 18 h » avec les emails rangés sous leurs dossiers (« Actualiser » relit la boîte).
      Si un message d'erreur apparaît à la place (droit de lecture refusé, code EWS), le noter.

## 3. Emails

- [ ] Sur un dossier avec un email d'acquéreur, onglet Échanges, ligne « Demander la provision et
      la pièce d'identité » → « Envoyer » →
      un fichier `.eml` se télécharge ; l'ouvrir → Outlook affiche un **nouveau message prêt à
      envoyer**, avec la signature en couleurs et les logos. (Ne pas l'envoyer.)
- [ ] Ligne « Questionnaire de satisfaction » → « Envoyer » sur un dossier de test → le PDF est
      **déjà joint** au message.
- [ ] Réglages › Rappels et agenda : « Tester » sur votre adresse → le message arrive dans **Teams**.
- [ ] Quand une notification de pièce trouvée arrive dans Teams, **cliquer sur le nom de la pièce**
      → le PDF s'ouvre. (Si Teams bloque l'adresse `http://192.168…`, le noter.)

- [ ] Fonds de l'acquéreur : sur un dossier dont l'appel de fonds est fait et dont le décompte
      (tableau au confrère ou convocation, en PDF) est à la **racine** du dossier NAS, onglet
      Échanges › « Fonds reçus » → « Vérifier » : le montant attendu est repris du décompte (son nom
      s'affiche sous le champ). Quand tous les fonds sont lus dans les reçus, un message Teams
      « Tous les fonds sont reçus » arrive dans la demi-heure.

## 4. Mise à jour en un clic

À faire au prochain nouvel exécutable publié.

- [ ] Réglages › Général › Mise à jour : « Vérifier » annonce la nouvelle version.
- [ ] « Installer » → la page attend puis se recharge toute seule ; « À propos » affiche la
      nouvelle version.
- [ ] Le dossier de l'exe contient maintenant `CLAIRE-serveur.ancien.exe` (la version précédente,
      pour revenir en arrière si besoin).

## 5. Démarrage et icône

- [ ] Redémarrer le poste serveur → CLAIRE se relance seule, et la fenêtre s'ouvre à l'ouverture
      de session (si le démarrage automatique a été activé).
- [ ] L'icône de CLAIRE est **nette** dans la barre des tâches et sur le bureau (pas pixelisée).
      Si elle l'est encore : redémarrer le poste une fois, Windows garde les icônes en cache.

---

**À la fin** : supprimer les dossiers de test, et vérifier qu'aucun rendez-vous « TEST » ne reste
dans le calendrier de Sophie.

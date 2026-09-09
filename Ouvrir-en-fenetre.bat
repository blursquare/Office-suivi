@echo off
:: Ouvre index.html dans une fenetre Chrome independante (sans onglets ni barre
:: d'adresse), sans dependre du menu "Creer un raccourci" de Chrome (masque ou
:: absent selon la version/la politique du poste - voir CLAUDE.md).
::
:: A garder dans le meme dossier que index.html : %~dp0 designe ce dossier,
:: donc ce lanceur fonctionne que le dossier soit sur ce poste ou sur un
:: lecteur reseau (lettre mappee, ex. Z:\...).
::
:: IMPORTANT : si Chrome est deja ouvert, il recupere la demande et affiche
:: l'outil dans un nouvel onglet de la fenetre existante au lieu d'une fenetre
:: independante (comportement normal de Chrome, pas un bug de ce fichier) -
:: d'ou la verification ci-dessous.
setlocal
set "URL=file:///%~dp0index.html"

tasklist /FI "IMAGENAME eq chrome.exe" 2>NUL | find /I "chrome.exe" >NUL
if %errorlevel%==0 (
  echo Chrome est deja ouvert.
  echo Fermez TOUTES les fenetres Chrome, puis relancez ce fichier -
  echo sinon l'outil s'ouvrira dans un nouvel onglet au lieu d'une fenetre independante.
  pause
  goto :fin
)

where chrome >nul 2>nul
if %errorlevel%==0 (
  start "" chrome --app="%URL%"
  goto :fin
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%URL%"
  goto :fin
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%URL%"
  goto :fin
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app="%URL%"
  goto :fin
)

echo Google Chrome est introuvable sur ce poste.
echo Ouvrez index.html manuellement, directement dans Chrome.
pause

:fin

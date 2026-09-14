@echo off
chcp 65001 >nul
title Desinstallation du service Windows CLAIRE

rem Arrete et retire le service Windows installe par Installer-service-NSSM.bat. CLAIRE-serveur.exe
rem et ses donnees (config.json, data\, les journaux) restent intacts -- seul le service Windows
rem lui-meme est supprime, pas ce qu'il fait tourner.
rem
rem A executer en tant qu'administrateur (clic droit -^> Executer en tant qu'administrateur).

set SERVICE_NAME=CLAIRE-serveur
set SCRIPT_DIR=%~dp0

where nssm >nul 2>nul
if %errorlevel%==0 (
  set NSSM=nssm
) else if exist "%SCRIPT_DIR%nssm.exe" (
  set NSSM=%SCRIPT_DIR%nssm.exe
) else (
  echo nssm.exe est introuvable : impossible de retirer le service avec ce script.
  echo Ouvrir "services.msc", arreter le service "%SERVICE_NAME%", puis le supprimer
  echo avec la commande "sc delete %SERVICE_NAME%" depuis une invite en administrateur.
  pause
  exit /b 1
)

sc query %SERVICE_NAME% >nul 2>nul
if not %errorlevel%==0 (
  echo Aucun service "%SERVICE_NAME%" installe -- rien a faire.
  pause
  exit /b 0
)

echo Arret et suppression du service "%SERVICE_NAME%"...
"%NSSM%" stop %SERVICE_NAME%
"%NSSM%" remove %SERVICE_NAME% confirm

echo.
echo Service supprime. CLAIRE-serveur.exe, config.json et le dossier data\ restent en place --
echo relancer manuellement l'exe, ou Lancer-CLAIRE-en-arriere-plan.vbs, pour reprendre le
echo fonctionnement sans service Windows.
pause

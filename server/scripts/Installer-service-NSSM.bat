@echo off
chcp 65001 >nul
title Installation du service Windows CLAIRE

rem Installe CLAIRE-serveur.exe comme un vrai service Windows via NSSM (Non-Sucking Service
rem Manager, outil gratuit tiers) : demarrage automatique avec Windows, redemarrage automatique en
rem cas de plantage, aucune fenetre de console a garder ouverte -- voir server/README.md pour le
rem contexte et les alternatives (Lancer-CLAIRE-en-arriere-plan.vbs) si NSSM n'est pas souhaite.
rem
rem A executer en tant qu'administrateur (clic droit -^> Executer en tant qu'administrateur) :
rem l'installation d'un service Windows l'exige.
rem
rem Prerequis : nssm.exe telecharge depuis https://nssm.cc/download, puis place SOIT dans ce
rem meme dossier (a cote de ce script et de CLAIRE-serveur.exe), SOIT deja accessible depuis le
rem PATH Windows.

set SERVICE_NAME=CLAIRE-serveur
set SCRIPT_DIR=%~dp0
set EXE_PATH=%SCRIPT_DIR%CLAIRE-serveur.exe

where nssm >nul 2>nul
if %errorlevel%==0 (
  set NSSM=nssm
) else if exist "%SCRIPT_DIR%nssm.exe" (
  set NSSM=%SCRIPT_DIR%nssm.exe
) else (
  echo nssm.exe est introuvable.
  echo Telecharger NSSM depuis https://nssm.cc/download, extraire nssm.exe
  echo dans ce meme dossier, a cote de ce script, puis relancer.
  pause
  exit /b 1
)

if not exist "%EXE_PATH%" (
  echo CLAIRE-serveur.exe est introuvable a cote de ce script.
  echo Placer ce fichier .bat dans le MEME dossier que CLAIRE-serveur.exe puis relancer.
  pause
  exit /b 1
)

sc query %SERVICE_NAME% >nul 2>nul
if %errorlevel%==0 (
  echo Un service "%SERVICE_NAME%" existe deja. L'arreter et le supprimer d'abord avec
  echo Desinstaller-service-NSSM.bat si vous voulez le reinstaller proprement.
  pause
  exit /b 1
)

echo Installation du service "%SERVICE_NAME%"...
"%NSSM%" install %SERVICE_NAME% "%EXE_PATH%"
"%NSSM%" set %SERVICE_NAME% AppDirectory "%SCRIPT_DIR%"
"%NSSM%" set %SERVICE_NAME% DisplayName "CLAIRE - Registre des echeances (serveur intranet)"
"%NSSM%" set %SERVICE_NAME% Description "Registre partage CLAIRE pour l'etude. Demarre avec Windows et redemarre seul en cas d'arret inattendu -- voir server/README.md."
"%NSSM%" set %SERVICE_NAME% Start SERVICE_AUTO_START
rem Fichiers journaux a cote de l'exe : seul moyen de diagnostiquer un probleme sans fenetre de
rem console visible (le service tourne en arriere-plan, invisible par nature).
"%NSSM%" set %SERVICE_NAME% AppStdout "%SCRIPT_DIR%service-stdout.log"
"%NSSM%" set %SERVICE_NAME% AppStderr "%SCRIPT_DIR%service-stderr.log"
"%NSSM%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM%" set %SERVICE_NAME% AppRotateBytes 1048576
rem Redemarrage automatique si le processus s'arrete de lui-meme (plantage) -- pas de limite de
rem tentatives (Default), avec un court delai pour eviter une boucle de redemarrage trop rapide.
"%NSSM%" set %SERVICE_NAME% AppExit Default Restart
"%NSSM%" set %SERVICE_NAME% AppRestartDelay 5000

echo Demarrage du service...
"%NSSM%" start %SERVICE_NAME%

echo.
echo Service "%SERVICE_NAME%" installe et demarre.
echo Il tourne desormais en arriere-plan en permanence, demarre seul avec Windows,
echo et redemarre seul en cas de plantage -- plus besoin de Lancer-CLAIRE-en-arriere-plan.vbs
echo ni de garder une fenetre ouverte.
echo.
echo Pour verifier / arreter / redemarrer le service : ouvrir "services.msc" et chercher
echo "%SERVICE_NAME%", ou utiliser Desinstaller-service-NSSM.bat pour le retirer completement.
echo En cas de probleme, consulter service-stdout.log / service-stderr.log dans ce dossier.
pause

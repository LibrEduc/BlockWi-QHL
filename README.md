# BlockWi-QHL
![Capture d'écran](build/screencapt.jpg)

Application Electron + React pour la programmation visuelle (µcBlockly) et la simulation de cartes avec Wokwi.  
Electron + React app for visual programming (µcBlockly) and board simulation with Wokwi.

## FR - Présentation

BlockWi-QHL permet de générer du code depuis µcBlockly, puis de l’envoyer vers l’éditeur Wokwi intégré.  
L’application inclut aussi des outils d’installation de la chaîne de compilation via `arduino-cli`.

### Fonctionnalités principales

- Interface double panneau : µcBlockly (gauche) + Wokwi (droite)
- Téléversement explicite du code généré vers Wokwi
- Menus Electron multilingues (chargés dynamiquement depuis `electron/locales/*.json`)
- Paramètre de langue propagé à µcBlockly via `?lang=xx`
- Installation locale de `arduino-cli` et des cibles :
  - `arduino:avr`
  - `STMicroelectronics:stm32`
  - `rp2040:rp2040`
- Vérification/mise à jour de µcBlockly depuis le menu Aide

### Prérequis

- Node.js 18+ recommandé
- npm

### Installation

```bash
npm install
```

### Scripts utiles

```bash
npm start
```

Lance l’interface React en développement.

```bash
npm run electron-dev
```

Lance React + Electron en mode dev.

```bash
npm run electron
```

Construit React puis lance Electron en mode local (hors dev-server).

```bash
npm run electron-build
```

Construit l’application distribuable (dossier `release/`).

### Internationalisation

Les langues sont détectées automatiquement depuis `electron/locales/*.json`.  
Chaque fichier doit inclure au minimum :

- `code` (ex: `fr`, `en`)
- `languageLabel` (nom affiché dans le menu langue)

### Dépôt

- https://github.com/LibrEduc/BlockWi-QHL

### Version

- `0.9.9`

---

## EN - Overview

BlockWi-QHL lets you generate code from µcBlockly and send it to the embedded Wokwi editor.  
It also provides compilation toolchain setup helpers powered by `arduino-cli`.

### Main features

- Split interface: µcBlockly (left) + Wokwi (right)
- Explicit upload button to send generated code to Wokwi
- Multilingual Electron menus (auto-loaded from `electron/locales/*.json`)
- Language code forwarded to µcBlockly using `?lang=xx`
- Local `arduino-cli` installation and target setup:
  - `arduino:avr`
  - `STMicroelectronics:stm32`
  - `rp2040:rp2040`
- µcBlockly update check/install from the Help menu

### Requirements

- Node.js 18+ recommended
- npm

### Install

```bash
npm install
```

### Useful scripts

```bash
npm start
```

Runs React development server.

```bash
npm run electron-dev
```

Runs React + Electron in development mode.

```bash
npm run electron
```

Builds React, then runs Electron locally (non dev-server mode).

```bash
npm run electron-build
```

Builds distributable application (output in `release/`).

### Internationalization

Locales are discovered automatically from `electron/locales/*.json`.  
Each locale file should include at least:

- `code` (e.g. `fr`, `en`)
- `languageLabel` (displayed name in Language menu)

### Repository

- https://github.com/LibrEduc/BlockWi-QHL

### Version

- `0.9.9`

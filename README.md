# Suivi de chantier

Application web hors ligne (PWA) pour tablette : visites de chantier, observations avec photos annotées et puces sur plans, CR de visite en PDF, Word et Excel.

- Code de l'application : `app/` (HTML, CSS, JavaScript, sans compilation). Seule bibliothèque : PDF.js 4.10.38 (Apache 2.0) dans `app/lib/pdfjs/`.
- Publication automatique sur GitHub Pages à chaque envoi sur `main` (`.github/workflows/pages.yml`).
- Essai local : `node serve.js` puis http://localhost:8080
- Guide d'utilisation : `doc/Guide_utilisation.md`

Les données saisies restent dans la tablette : rien n'est envoyé sur GitHub.

À chaque mise à jour, changer `VERSION` dans `app/sw.js`.

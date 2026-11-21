# Wordspoon

C'est un projet personnel : un Wordle en mode extrême.

- 8 essais pour trouver un mot de 5 lettres.
- Les cases ne se colorent pas : seuls trois compteurs (bien placées / mal placées / absentes) guident le joueur.
- **Mot du jour** (le même pour tout le monde) ou **partie libre**.
- Statistiques, partage du résultat et sauvegarde automatique de la partie dans le navigateur.

## Fichiers

- `mots.js` : tous les mots acceptés comme essais.
- `solutions.js` : les mots courants qui peuvent être tirés comme mot à deviner. Chaque mot doit aussi être dans `mots.js`.
- `script.js`, `style.css`, `index.html` : le jeu.

> Modifier `solutions.js` change l'ordre des mots du jour.

## Lancer en local

Double-cliquer sur `index.html` suffit.

## Déboguer

La solution est affichée dans la console du navigateur (F12) au début de chaque partie, et disponible dans la variable `motSecret`.

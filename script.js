const LONGUEUR_MOT = 5;
const MAX_ESSAIS = 8;

// Date du mot du jour n°1. Changer solutions.js change aussi l'ordre des mots du jour.
const DATE_LANCEMENT = new Date(2026, 10, 21); // 21 novembre 2026 (les mois commencent à 0)
const GRAINE_MELANGE = 20261121;

const CLES = {
    mode: "wordspoon-mode",
    reglesVues: "wordspoon-regles-vues",
    partie: mode => `wordspoon-partie-${mode}`,
    stats: mode => `wordspoon-stats-${mode}`
};

// --- Données ---
let dictionnaire = new Set();  // tous les mots acceptés comme essais (mots.js)
let solutions = [];            // mots courants pouvant être tirés (solutions.js)
let ordreDuJour = [];          // solutions mélangées une fois pour toutes, pour le mot du jour

// --- État de la partie en cours ---
let mode = "jour";
let partie = null;             // { mode, motSecret, jour, essais: [], annotations: {}, termine, victoire }
let motSecret = "";            // gardé en global pour pouvoir déboguer dans la console
let essaiActuel = 0;
let lettreActuelle = 0;
let grilleJeu = [];
let jeuTermine = false;
let grilleVerrouillee = false;

// Minuteries de la partie : annulées quand on change de partie
let minuteries = [];
let intervalleCompteARebours = null;
let minuterieNotification = null;

document.addEventListener("DOMContentLoaded", demarrer);

/* =========================================================
   DÉMARRAGE
   ========================================================= */

function demarrer() {
    initialiserClavier();
    initialiserInterface();

    // Les listes viennent de mots.js et solutions.js (chargés avant ce script dans index.html).
    // Pas de fetch : le jeu marche aussi en ouvrant index.html par double-clic.
    if (typeof MOTS === "undefined" || !MOTS.length) {
        console.error("Erreur : mots.js est introuvable ou vide");
        afficherNotification("Erreur : liste de mots introuvable !", 8000);
        return;
    }
    dictionnaire = new Set(MOTS.map(normaliserMot));

    // Si solutions.js est absent, on retombe sur le dictionnaire complet
    const listeSolutions = typeof SOLUTIONS !== "undefined" && SOLUTIONS.length ? SOLUTIONS : MOTS;
    solutions = [...new Set(listeSolutions.map(normaliserMot))].sort();
    ordreDuJour = melanger(solutions, GRAINE_MELANGE);

    mode = lireStockage(CLES.mode) === "libre" ? "libre" : "jour";
    chargerPartie(mode);

    if (!lireStockage(CLES.reglesVues)) {
        ouvrirModale("modale-aide");
        ecrireStockage(CLES.reglesVues, true);
    }
}

function initialiserInterface() {
    document.getElementById("logo-site").addEventListener("click", effacerAnnotations);

    document.querySelectorAll("#choix-mode button").forEach(bouton => {
        bouton.addEventListener("click", () => {
            bouton.blur();
            changerMode(bouton.dataset.mode);
        });
    });

    document.getElementById("btn-aide").addEventListener("click", () => ouvrirModale("modale-aide"));
    document.getElementById("btn-stats").addEventListener("click", () => ouvrirModale("modale-stats"));
    document.getElementById("btn-partager").addEventListener("click", partagerResultat);
    document.getElementById("btn-rejouer").addEventListener("click", () => {
        if (mode === "jour") changerMode("libre");
        else nouvellePartieLibre();
    });

    document.querySelectorAll(".modale").forEach(modale => {
        modale.addEventListener("click", e => {
            if (e.target === modale || e.target.closest(".modale-fermer, .modale-ok")) fermerModales();
        });
    });
}

/* =========================================================
   OUTILS
   ========================================================= */

function normaliserMot(mot) {
    return mot.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

// Générateur pseudo-aléatoire déterministe (mulberry32) : même graine = même suite
function generateurAleatoire(graine) {
    return function () {
        graine |= 0; graine = (graine + 0x6D2B79F5) | 0;
        let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function melanger(liste, graine) {
    const aleatoire = generateurAleatoire(graine);
    const copie = [...liste];
    for (let i = copie.length - 1; i > 0; i--) {
        const j = Math.floor(aleatoire() * (i + 1));
        [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
}

// Numéro du jour (1 = jour du lancement), basé sur la date locale du joueur
function numeroDuJour(date = new Date()) {
    const aujourdHui = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const lancement = Date.UTC(DATE_LANCEMENT.getFullYear(), DATE_LANCEMENT.getMonth(), DATE_LANCEMENT.getDate());
    return Math.floor((aujourdHui - lancement) / 86400000) + 1;
}

function motDuJour(numero) {
    const index = ((numero - 1) % ordreDuJour.length + ordreDuJour.length) % ordreDuJour.length;
    return ordreDuJour[index];
}

function lireStockage(cle) {
    try {
        const valeur = localStorage.getItem(cle);
        return valeur === null ? null : JSON.parse(valeur);
    } catch {
        return null;
    }
}

function ecrireStockage(cle, valeur) {
    try {
        localStorage.setItem(cle, JSON.stringify(valeur));
    } catch {
        // stockage indisponible (navigation privée...) : le jeu marche quand même
    }
}

function programmer(fonction, delai) {
    const id = setTimeout(fonction, delai);
    minuteries.push(id);
    return id;
}

function annulerMinuteries() {
    minuteries.forEach(clearTimeout);
    minuteries = [];
    clearInterval(intervalleCompteARebours);
    intervalleCompteARebours = null;
}

/* =========================================================
   GESTION DES PARTIES
   ========================================================= */

function changerMode(nouveauMode) {
    if (!solutions.length) return; // listes de mots non chargées
    if (grilleVerrouillee && !jeuTermine) return; // on attend la fin de l'animation
    if (nouveauMode === mode && partie) return;
    mode = nouveauMode;
    ecrireStockage(CLES.mode, mode);
    chargerPartie(mode);
}

function chargerPartie(modeVoulu) {
    annulerMinuteries();
    mode = modeVoulu;

    document.querySelectorAll("#choix-mode button").forEach(b => {
        b.classList.toggle("actif", b.dataset.mode === mode);
    });

    let sauvegarde = lireStockage(CLES.partie(mode));

    if (mode === "jour") {
        const numero = numeroDuJour();
        if (!sauvegarde || sauvegarde.jour !== numero || sauvegarde.motSecret !== motDuJour(numero)) {
            sauvegarde = creerPartie("jour", motDuJour(numero), numero);
        }
    } else if (!sauvegarde || !solutions.includes(sauvegarde.motSecret)) {
        sauvegarde = creerPartie("libre", tirerMotLibre(), null);
    }

    partie = sauvegarde;
    restaurerPartie();
}

function creerPartie(modePartie, mot, jour) {
    return { mode: modePartie, motSecret: mot, jour, essais: [], annotations: {}, termine: false, victoire: false };
}

function tirerMotLibre() {
    return solutions[Math.floor(Math.random() * solutions.length)];
}

function nouvellePartieLibre() {
    annulerMinuteries();
    partie = creerPartie("libre", tirerMotLibre(), null);
    sauvegarderPartie();
    restaurerPartie();
}

function sauvegarderPartie() {
    if (partie) ecrireStockage(CLES.partie(partie.mode), partie);
}

// Reconstruit tout l'affichage à partir de l'objet `partie`
function restaurerPartie() {
    motSecret = partie.motSecret;
    essaiActuel = 0;
    lettreActuelle = 0;
    jeuTermine = false;
    grilleVerrouillee = false;

    console.log(`[Wordspoon] Mode ${partie.mode === "jour" ? "du jour #" + partie.jour : "libre"} — Solution :`, motSecret);

    initialiserGrille();
    afficherClavier();

    partie.essais.forEach(mot => {
        appliquerEssai(mot, false);
        essaiActuel++;
    });

    for (const [cle, classe] of Object.entries(partie.annotations)) {
        const caseDiv = document.getElementById(`case-${cle}`);
        if (caseDiv && !caseDiv.classList.contains("auto-rouge")) caseDiv.classList.add(classe);
    }
    mettreAJourClavier();

    if (partie.termine) {
        finDeJeu(partie.victoire, false);
    }
}

/* =========================================================
   GRILLE
   ========================================================= */

function initialiserGrille() {
    const conteneurGrille = document.getElementById("grille");
    conteneurGrille.innerHTML = "";
    grilleJeu = [];

    for (let i = 0; i < MAX_ESSAIS; i++) {
        const ligne = document.createElement("div");
        ligne.classList.add("ligne");
        ligne.id = `ligne-${i}`;

        const conteneurLettres = document.createElement("div");
        conteneurLettres.classList.add("lettres");
        grilleJeu.push([]);

        for (let j = 0; j < LONGUEUR_MOT; j++) {
            const caseDiv = document.createElement("div");
            caseDiv.classList.add("case");
            caseDiv.id = `case-${i}-${j}`;
            caseDiv.addEventListener("click", () => annoterCase(i, j, caseDiv));
            conteneurLettres.appendChild(caseDiv);
            grilleJeu[i].push("");
        }

        const conteneurIndicateurs = document.createElement("div");
        conteneurIndicateurs.classList.add("indicateurs");
        conteneurIndicateurs.innerHTML = `
            <div class="indicateur-carre ind-vert" id="ind-vert-${i}">0</div>
            <div class="indicateur-carre ind-jaune" id="ind-jaune-${i}">0</div>
            <div class="indicateur-carre ind-rouge" id="ind-rouge-${i}">0</div>
        `;

        ligne.appendChild(conteneurLettres);
        ligne.appendChild(conteneurIndicateurs);
        conteneurGrille.appendChild(ligne);
    }
}

const CYCLE_ANNOTATIONS = ["pred-rouge", "pred-jaune", "pred-vert"];

function annoterCase(i, j, caseDiv) {
    if (i >= essaiActuel || jeuTermine || caseDiv.classList.contains("auto-rouge")) return;

    const actuelle = CYCLE_ANNOTATIONS.findIndex(c => caseDiv.classList.contains(c));
    caseDiv.classList.remove(...CYCLE_ANNOTATIONS);

    const suivante = CYCLE_ANNOTATIONS[actuelle + 1]; // undefined après le vert = case vidée
    if (suivante) {
        caseDiv.classList.add(suivante);
        partie.annotations[`${i}-${j}`] = suivante;
    } else {
        delete partie.annotations[`${i}-${j}`];
    }

    sauvegarderPartie();
    mettreAJourClavier();
}

function effacerAnnotations() {
    if (jeuTermine || !partie) return;
    document.querySelectorAll(".case").forEach(c => c.classList.remove(...CYCLE_ANNOTATIONS));
    partie.annotations = {};
    sauvegarderPartie();
    mettreAJourClavier();
    afficherNotification("Annotations effacées");
}

/* =========================================================
   CLAVIER
   ========================================================= */

function initialiserClavier() {
    document.querySelectorAll("#clavier button").forEach(touche => {
        touche.addEventListener("click", () => {
            touche.blur(); // sinon la touche garde le focus et Entrée la "reclique"
            gererTouche(touche.dataset.key);
        });
    });

    document.addEventListener("keydown", e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return; // laisse passer Ctrl+R, Cmd+C, etc.
        if (document.querySelector(".modale:not(.invisible)")) {
            if (e.key === "Escape") fermerModales();
            return;
        }
        const touche = e.key;
        if (touche === "Enter" || touche === "Backspace" || /^[a-zA-ZÀ-ÿ]$/.test(touche)) {
            e.preventDefault(); // empêche aussi Entrée d'activer un bouton qui aurait le focus
            gererTouche(touche);
        }
    });
}

function afficherClavier() {
    const clavier = document.getElementById("clavier");
    const ecranFin = document.getElementById("ecran-fin");
    clavier.classList.remove("cache", "invisible");
    ecranFin.classList.add("cache", "invisible");
}

function mettreAJourClavier() {
    const lettresRouges = new Set();
    const lettresVertJaunes = new Set();

    for (let i = 0; i < essaiActuel; i++) {
        for (let j = 0; j < LONGUEUR_MOT; j++) {
            const lettre = grilleJeu[i][j];
            const caseDiv = document.getElementById(`case-${i}-${j}`);
            const cl = caseDiv.classList;

            if (cl.contains("pred-jaune") || cl.contains("pred-vert") || cl.contains("correct") || cl.contains("present")) {
                lettresVertJaunes.add(lettre);
            } else if (cl.contains("pred-rouge") || cl.contains("auto-rouge")) {
                lettresRouges.add(lettre);
            }
        }
    }

    document.querySelectorAll("#clavier button").forEach(touche => {
        const lettre = touche.dataset.key.toUpperCase();
        if (lettre.length === 1) {
            touche.classList.toggle("assombrie", lettresRouges.has(lettre) && !lettresVertJaunes.has(lettre));
        }
    });
}

function gererTouche(touche) {
    if (jeuTermine || grilleVerrouillee || !partie) return;
    touche = normaliserMot(touche);

    if (touche === "ENTER") validerMot();
    else if (touche === "BACKSPACE" || touche === "⌫") effacerLettre();
    else if (touche.length === 1 && lettreActuelle < LONGUEUR_MOT) ajouterLettre(touche);
}

function effacerLettre() {
    if (lettreActuelle > 0) {
        lettreActuelle--;
        grilleJeu[essaiActuel][lettreActuelle] = "";
        const caseDiv = document.getElementById(`case-${essaiActuel}-${lettreActuelle}`);
        caseDiv.textContent = "";
        caseDiv.removeAttribute("data-remplie");
    }
}

function ajouterLettre(lettre) {
    grilleJeu[essaiActuel][lettreActuelle] = lettre;
    const caseDiv = document.getElementById(`case-${essaiActuel}-${lettreActuelle}`);
    caseDiv.textContent = lettre;
    caseDiv.setAttribute("data-remplie", "true");
    caseDiv.classList.remove("pop");
    void caseDiv.offsetWidth;
    caseDiv.classList.add("pop");
    lettreActuelle++;
}

/* =========================================================
   VALIDATION D'UN ESSAI
   ========================================================= */

function validerMot() {
    if (lettreActuelle !== LONGUEUR_MOT) {
        afficherNotification("Le mot est trop court !");
        secouerLigneCourante();
        return;
    }

    const motSaisi = grilleJeu[essaiActuel].join("");
    if (!dictionnaire.has(motSaisi)) {
        afficherNotification("Ce mot n'est pas dans le dictionnaire");
        secouerLigneCourante();
        return;
    }

    grilleVerrouillee = true;
    partie.essais.push(motSaisi);
    const victoire = motSaisi === motSecret;
    const defaite = !victoire && partie.essais.length === MAX_ESSAIS;
    if (victoire || defaite) {
        partie.termine = true;
        partie.victoire = victoire;
        enregistrerStats(victoire, partie.essais.length);
    }
    sauvegarderPartie();

    appliquerEssai(motSaisi, true);

    programmer(() => {
        essaiActuel++;
        lettreActuelle = 0;
        if (partie.termine) finDeJeu(partie.victoire, true);
        else grilleVerrouillee = false;
    }, 500);
}

function secouerLigneCourante() {
    const ligneDiv = document.getElementById(`ligne-${essaiActuel}`);
    ligneDiv.classList.remove("shake");
    void ligneDiv.offsetWidth;
    ligneDiv.classList.add("shake");
}

// Couleur réelle de chaque lettre : "correct", "present" ou "absent"
function calculerResultats(mot) {
    const lettresSecretes = motSecret.split("");
    const lettres = mot.split("");
    const resultats = new Array(LONGUEUR_MOT).fill("absent");

    for (let i = 0; i < LONGUEUR_MOT; i++) {
        if (lettres[i] === lettresSecretes[i]) {
            resultats[i] = "correct";
            lettresSecretes[i] = null;
            lettres[i] = null;
        }
    }
    for (let i = 0; i < LONGUEUR_MOT; i++) {
        if (lettres[i] === null) continue;
        const index = lettresSecretes.indexOf(lettres[i]);
        if (index !== -1) {
            resultats[i] = "present";
            lettresSecretes[index] = null;
        }
    }
    return resultats;
}

function compterResultats(resultats) {
    return {
        verts: resultats.filter(r => r === "correct").length,
        jaunes: resultats.filter(r => r === "present").length,
        rouges: resultats.filter(r => r === "absent").length
    };
}

// Lettres prouvées absentes : celles des essais sans aucun vert ni jaune
function lettresInterdites() {
    const interdites = new Set();
    partie.essais.slice(0, essaiActuel + 1).forEach(mot => {
        const { verts, jaunes } = compterResultats(calculerResultats(mot));
        if (verts === 0 && jaunes === 0) mot.split("").forEach(l => interdites.add(l));
    });
    return interdites;
}

// Affiche un essai sur la ligne `essaiActuel` (avec ou sans animation)
function appliquerEssai(mot, animer) {
    const ligne = essaiActuel;
    const { verts, jaunes, rouges } = compterResultats(calculerResultats(mot));

    for (let j = 0; j < LONGUEUR_MOT; j++) {
        grilleJeu[ligne][j] = mot[j];
        const caseDiv = document.getElementById(`case-${ligne}-${j}`);
        caseDiv.textContent = mot[j];
        caseDiv.setAttribute("data-remplie", "true");
    }

    document.getElementById(`ind-vert-${ligne}`).textContent = verts;
    document.getElementById(`ind-jaune-${ligne}`).textContent = jaunes;
    document.getElementById(`ind-rouge-${ligne}`).textContent = rouges;

    const ligneDiv = document.getElementById(`ligne-${ligne}`);
    ligneDiv.classList.add("validee");

    // Les lettres prouvées absentes passent en rouge sur toutes les lignes validées
    const interdites = lettresInterdites();
    const marquerInterdites = () => {
        for (let row = 0; row <= ligne; row++) {
            for (let col = 0; col < LONGUEUR_MOT; col++) {
                if (interdites.has(grilleJeu[row][col])) {
                    const c = document.getElementById(`case-${row}-${col}`);
                    c.classList.remove(...CYCLE_ANNOTATIONS);
                    c.classList.add("auto-rouge");
                    delete partie.annotations[`${row}-${col}`];
                }
            }
        }
    };

    if (!animer) {
        marquerInterdites();
        return;
    }

    for (let j = 0; j < LONGUEUR_MOT; j++) {
        programmer(() => {
            const caseDiv = document.getElementById(`case-${ligne}-${j}`);
            caseDiv.style.transform = "scale(1.15)";
            programmer(() => caseDiv.style.transform = "scale(1)", 150);
        }, j * 100);
    }
    programmer(() => {
        marquerInterdites();
        sauvegarderPartie();
        mettreAJourClavier();
    }, LONGUEUR_MOT * 100 + 50);

    ligneDiv.querySelectorAll(".indicateur-carre").forEach((ind, index) => {
        programmer(() => {
            ind.style.transform = "scale(1.15)";
            programmer(() => ind.style.transform = "scale(1)", 150);
        }, LONGUEUR_MOT * 100 + index * 100);
    });
}

/* =========================================================
   FIN DE PARTIE
   ========================================================= */

function revelerToutesLesCases(animer) {
    const couleurs = { correct: "var(--couleur-correct)", present: "var(--couleur-present)", absent: "var(--couleur-absent)" };

    partie.essais.forEach((mot, i) => {
        const resultats = calculerResultats(mot);
        for (let j = 0; j < LONGUEUR_MOT; j++) {
            const caseDiv = document.getElementById(`case-${i}-${j}`);
            caseDiv.classList.remove(...CYCLE_ANNOTATIONS, "auto-rouge");

            if (!animer) {
                caseDiv.classList.add(resultats[j]);
                continue;
            }
            const couleurFinale = couleurs[resultats[j]];
            caseDiv.animate([
                { transform: "rotateX(0deg)" },
                { transform: "rotateX(90deg)", offset: 0.5, backgroundColor: "transparent", borderColor: "var(--bordure-remplie)" },
                { transform: "rotateX(0deg)", offset: 1, backgroundColor: couleurFinale, borderColor: couleurFinale, color: "white" }
            ], { duration: 600, fill: "forwards", easing: "ease-in-out" });
            programmer(() => caseDiv.classList.add(resultats[j]), 600);
        }
    });
}

function finDeJeu(victoire, animer) {
    jeuTermine = true;
    grilleVerrouillee = true;
    revelerToutesLesCases(animer);
    mettreAJourClavier();

    const titre = document.getElementById("fin-titre");
    const texte = document.getElementById("fin-texte");
    const conteneurMot = document.getElementById("fin-mot-secret");
    const nbEssais = partie.essais.length;

    if (victoire) {
        titre.textContent = "Félicitations ! 🎉";
        texte.textContent = `Vous avez trouvé en ${nbEssais} essai${nbEssais > 1 ? "s" : ""}.`;
    } else {
        titre.textContent = "Perdu... 😢";
        texte.textContent = "Le mot à trouver était :";
    }

    conteneurMot.innerHTML = "";
    for (let i = 0; i < LONGUEUR_MOT; i++) {
        const caseDiv = document.createElement("div");
        caseDiv.classList.add("case", "correct");
        caseDiv.textContent = motSecret[i];
        conteneurMot.appendChild(caseDiv);
    }

    document.getElementById("btn-rejouer").textContent = mode === "jour" ? "Partie libre" : "Rejouer";
    lancerCompteARebours();

    const afficher = () => {
        const clavier = document.getElementById("clavier");
        const ecranFin = document.getElementById("ecran-fin");
        clavier.classList.add("cache", "invisible");
        ecranFin.classList.remove("invisible");
        if (animer) programmer(() => ecranFin.classList.remove("cache"), 50);
        else ecranFin.classList.remove("cache");
    };

    if (animer) {
        programmer(afficher, 1200);
        programmer(() => ouvrirModale("modale-stats"), 2200);
    } else {
        afficher();
    }
}

function lancerCompteARebours() {
    const zone = document.getElementById("fin-compte-a-rebours");
    clearInterval(intervalleCompteARebours);

    if (mode !== "jour") {
        zone.textContent = "";
        return;
    }

    const maj = () => {
        const maintenant = new Date();
        const minuit = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1);
        const reste = Math.max(0, minuit - maintenant);
        if (reste === 0 || numeroDuJour() !== partie.jour) {
            chargerPartie("jour"); // un nouveau mot du jour est disponible
            return;
        }
        const h = String(Math.floor(reste / 3600000)).padStart(2, "0");
        const m = String(Math.floor(reste / 60000) % 60).padStart(2, "0");
        const s = String(Math.floor(reste / 1000) % 60).padStart(2, "0");
        zone.textContent = `Prochain mot dans ${h}:${m}:${s}`;
    };
    maj();
    intervalleCompteARebours = setInterval(maj, 1000);
}

/* =========================================================
   STATISTIQUES
   ========================================================= */

function statsVides() {
    return { jouees: 0, victoires: 0, serie: 0, meilleureSerie: 0, repartition: new Array(MAX_ESSAIS).fill(0), dernierJourGagne: null, dernierJourJoue: null };
}

function lireStats(modeStats) {
    return { ...statsVides(), ...(lireStockage(CLES.stats(modeStats)) || {}) };
}

function enregistrerStats(victoire, nbEssais) {
    const stats = lireStats(partie.mode);

    if (partie.mode === "jour") {
        if (stats.dernierJourJoue === partie.jour) return; // déjà compté
        stats.dernierJourJoue = partie.jour;
    }

    stats.jouees++;
    if (victoire) {
        stats.victoires++;
        stats.repartition[nbEssais - 1]++;
        if (partie.mode === "jour") {
            stats.serie = stats.dernierJourGagne === partie.jour - 1 ? stats.serie + 1 : 1;
            stats.dernierJourGagne = partie.jour;
        } else {
            stats.serie++;
        }
        stats.meilleureSerie = Math.max(stats.meilleureSerie, stats.serie);
    } else {
        stats.serie = 0;
    }

    ecrireStockage(CLES.stats(partie.mode), stats);
}

function afficherStats() {
    const stats = lireStats(mode);

    // En mode du jour, la série tombe à 0 si on a sauté un jour
    let serie = stats.serie;
    if (mode === "jour" && stats.dernierJourGagne !== null && stats.dernierJourGagne < numeroDuJour() - 1) serie = 0;

    document.getElementById("stats-mode").textContent = mode === "jour" ? "Mot du jour" : "Parties libres";
    document.getElementById("stat-jouees").textContent = stats.jouees;
    document.getElementById("stat-pourcent").textContent = stats.jouees ? Math.round(100 * stats.victoires / stats.jouees) : 0;
    document.getElementById("stat-serie").textContent = serie;
    document.getElementById("stat-meilleure").textContent = stats.meilleureSerie;

    const max = Math.max(1, ...stats.repartition);
    const essaiGagnant = partie && partie.termine && partie.victoire ? partie.essais.length : null;
    const zone = document.getElementById("stats-repartition");
    zone.innerHTML = "";
    stats.repartition.forEach((nb, i) => {
        const ligne = document.createElement("div");
        ligne.className = "barre-ligne";
        const largeur = Math.max(8, Math.round(100 * nb / max));
        ligne.innerHTML = `<span>${i + 1}</span><div class="barre${essaiGagnant === i + 1 ? " actuelle" : ""}" style="width:${largeur}%">${nb}</div>`;
        zone.appendChild(ligne);
    });
}

/* =========================================================
   PARTAGE
   ========================================================= */

function texteDePartage() {
    const score = partie.victoire ? partie.essais.length : "X";
    const entete = partie.mode === "jour"
        ? `Wordspoon #${partie.jour} ${score}/${MAX_ESSAIS}`
        : `Wordspoon (partie libre) ${score}/${MAX_ESSAIS}`;

    const lignes = partie.essais.map(mot => {
        const { verts, jaunes, rouges } = compterResultats(calculerResultats(mot));
        return "🟩".repeat(verts) + "🟨".repeat(jaunes) + "🟥".repeat(rouges);
    });

    let texte = `${entete}\n\n${lignes.join("\n")}`;
    if (location.protocol.startsWith("http")) texte += `\n\n${location.origin}${location.pathname}`;
    return texte;
}

async function partagerResultat() {
    const texte = texteDePartage();
    try {
        await navigator.clipboard.writeText(texte);
        afficherNotification("Résultat copié !");
    } catch {
        // Repli pour les navigateurs sans accès au presse-papiers
        const zone = document.createElement("textarea");
        zone.value = texte;
        zone.style.position = "fixed";
        zone.style.opacity = "0";
        document.body.appendChild(zone);
        zone.select();
        const ok = document.execCommand("copy");
        zone.remove();
        afficherNotification(ok ? "Résultat copié !" : "Impossible de copier le résultat");
    }
}

/* =========================================================
   FENÊTRES ET NOTIFICATIONS
   ========================================================= */

function ouvrirModale(id) {
    fermerModales();
    if (id === "modale-stats") afficherStats();
    document.getElementById(id).classList.remove("invisible");
}

function fermerModales() {
    document.querySelectorAll(".modale").forEach(m => m.classList.add("invisible"));
}

function afficherNotification(message, duree = 2000) {
    const notif = document.getElementById("notification");
    notif.textContent = message;
    notif.classList.remove("cache");
    clearTimeout(minuterieNotification); // une nouvelle notification repart pour sa durée complète
    minuterieNotification = setTimeout(() => notif.classList.add("cache"), duree);
}

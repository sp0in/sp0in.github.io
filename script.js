const LONGUEUR_MOT = 5;
const MAX_ESSAIS = 8;

let dictionnaire = [];
let motSecret = "";
let essaiActuel = 0;
let lettreActuelle = 0;
let jeuTermine = false;
let grilleVerrouillee = false;

async function chargerDonnees() {
    try {
        const reponse = await fetch('./mots.json');
        dictionnaire = await reponse.json();
        
        motSecret = choisirMotSecret();
        console.log("Dictionnaire chargé. Solution :", motSecret);
        
        initialiserGrille();
        initialiserClavier();
    } catch (erreur) {
        console.error("Impossible de charger les mots :", erreur);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    chargerDonnees();
});

function choisirMotSecret() {
    const indexAleatoire = Math.floor(Math.random() * dictionnaire.length);
    return normaliserMot(dictionnaire[indexAleatoire]);
}

function initialiserGrille() {
    const conteneurGrille = document.getElementById("grille");
    conteneurGrille.innerHTML = ""; 
    grilleJeu = []; 

    for (let i = 0; i < MAX_ESSAIS; i++) {
        const ligne = document.createElement("div");
        ligne.classList.add("ligne");
        ligne.setAttribute("id", `ligne-${i}`);
        
        const conteneurLettres = document.createElement("div");
        conteneurLettres.classList.add("lettres");
        grilleJeu.push([]);

        for (let j = 0; j < LONGUEUR_MOT; j++) {
            const caseDiv = document.createElement("div");
            caseDiv.classList.add("case");
            caseDiv.setAttribute("id", `case-${i}-${j}`);
            
            caseDiv.addEventListener("click", () => {
                if (i >= essaiActuel || jeuTermine) return;

                if (caseDiv.classList.contains("pred-rouge")) {
                    caseDiv.classList.remove("pred-rouge");
                    caseDiv.classList.add("pred-jaune");
                } else if (caseDiv.classList.contains("pred-jaune")) {
                    caseDiv.classList.remove("pred-jaune");
                    caseDiv.classList.add("pred-vert");
                } else if (caseDiv.classList.contains("pred-vert")) {
                    caseDiv.classList.remove("pred-vert");
                } else {
                    caseDiv.classList.add("pred-rouge");
                }
            });

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

function initialiserClavier() {
    const touches = document.querySelectorAll("#clavier button");
    for (let touche of touches) {
        touche.addEventListener("click", () => {
            gererTouche(touche.getAttribute("data-key"));
        });
    }

    document.addEventListener("keydown", (e) => {
        let touche = e.key;
        if (touche === "Enter" || touche === "Backspace" || /^[a-zA-ZÀ-ÿ]$/.test(touche)) {
            gererTouche(touche);
        }
    });
}

function gererTouche(touche) {
    if (jeuTermine || grilleVerrouillee) return;

    touche = normaliserMot(touche);

    if (touche === "ENTER") {
        validerMot();
    } else if (touche === "BACKSPACE" || touche === "⌫") {
        effacerLettre();
    } else if (touche.length === 1 && lettreActuelle < LONGUEUR_MOT) {
        ajouterLettre(touche);
    }
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
    
    caseDiv.classList.add("pop");
    setTimeout(() => caseDiv.classList.remove("pop"), 100);

    lettreActuelle++;
}

function validerMot() {
    if (lettreActuelle !== LONGUEUR_MOT) {
        afficherNotification("Le mot est trop court !");
        return;
    }

    grilleVerrouillee = true;

    const motSaisi = grilleJeu[essaiActuel].join("");
    verifierCouleurs(motSaisi);

    setTimeout(() => {
        if (motSaisi === motSecret) {
            finDeJeu(true); 
        } else {
            essaiActuel++;
            lettreActuelle = 0;
            
            if (essaiActuel === MAX_ESSAIS) {
                finDeJeu(false); 
            } else {
                grilleVerrouillee = false;
            }
        }
    }, 500);
}

function afficherNotification(message) {
    const notif = document.getElementById("notification");
    notif.textContent = message;
    notif.classList.remove("cache");
    
    setTimeout(() => {
        notif.classList.add("cache");
    }, 2000);
}

function finDeJeu(victoire) {
    jeuTermine = true;
    
    revelerToutesLesCases();
    
    const clavier = document.getElementById("clavier");
    const ecranFin = document.getElementById("ecran-fin");
    const titre = document.getElementById("fin-titre");
    const texte = document.getElementById("fin-texte");
    const conteneurMot = document.getElementById("fin-mot-secret");
    
    conteneurMot.innerHTML = "";
    const nbEssais = victoire ? essaiActuel + 1 : MAX_ESSAIS;
    
    if (victoire) {
        titre.textContent = "Félicitations ! 🎉";
        texte.textContent = `Vous avez trouvé en ${nbEssais} essai(s).`;
    } else {
        titre.textContent = "Perdu... 😢";
        texte.textContent = "Le mot à trouver était :";
    }

    for (let i = 0; i < LONGUEUR_MOT; i++) {
        const caseDiv = document.createElement("div");
        caseDiv.classList.add("case", "correct");
        caseDiv.textContent = motSecret[i];
        conteneurMot.appendChild(caseDiv);
    }

    setTimeout(() => {
        
        clavier.classList.add("cache");
        
        setTimeout(() => {
            
            clavier.style.display = "none";
            ecranFin.style.display = "flex";
            
            setTimeout(() => {
                ecranFin.classList.remove("cache");
            }, 50);
            
        }, 500); 
        
    }, 1200);
}

function revelerToutesLesCases() {
    const couleurs = {
        "correct": "#538d4e",
        "present": "#b59f3b",
        "absent": "#3a3a3c"
    };

    for (let i = 0; i < MAX_ESSAIS; i++) {
        const motLigne = grilleJeu[i].join("");
        
        if (motLigne.length === LONGUEUR_MOT) {
            const lettresSecretes = motSecret.split("");
            const motSaisiArray = motLigne.split("");
            const resultats = new Array(LONGUEUR_MOT).fill("absent");
            
            for (let j = 0; j < LONGUEUR_MOT; j++) {
                if (motSaisiArray[j] === lettresSecretes[j]) {
                    resultats[j] = "correct";
                    lettresSecretes[j] = null;
                    motSaisiArray[j] = null;
                }
            }
            
            for (let j = 0; j < LONGUEUR_MOT; j++) {
                if (motSaisiArray[j] !== null) {
                    const indexLettre = lettresSecretes.indexOf(motSaisiArray[j]);
                    if (indexLettre !== -1) {
                        resultats[j] = "present";
                        lettresSecretes[indexLettre] = null;
                    }
                }
            }
            
            for (let j = 0; j < LONGUEUR_MOT; j++) {
                const caseDiv = document.getElementById(`case-${i}-${j}`);
                
                caseDiv.classList.remove("pred-rouge", "pred-jaune", "pred-vert");
                
                const couleurFinale = couleurs[resultats[j]];

                caseDiv.animate([
                    { transform: 'rotateX(0deg)' },
                    { transform: 'rotateX(90deg)', offset: 0.5, backgroundColor: 'transparent', borderColor: '#565758' },
                    { transform: 'rotateX(0deg)', offset: 1, backgroundColor: couleurFinale, borderColor: couleurFinale, color: 'white' }
                ], {
                    duration: 600,
                    fill: 'forwards',
                    easing: 'ease-in-out'
                });

                setTimeout(() => {
                    caseDiv.classList.add(resultats[j]); 
                }, 600);
            }
        }
    }
}

function verifierCouleurs(motSaisi) {
    const lettresSecretes = motSecret.split("");
    let motSaisiArray = motSaisi.split("");
    
    let nbVerts = 0;
    let nbJaunes = 0;
    let nbRouges = 0;

    for (let i = 0; i < LONGUEUR_MOT; i++) {
        if (motSaisiArray[i] === lettresSecretes[i]) {
            nbVerts++;
            lettresSecretes[i] = null; 
            motSaisiArray[i] = null;   
        }
    }

    for (let i = 0; i < LONGUEUR_MOT; i++) {
        if (motSaisiArray[i] !== null) { 
            const indexLettre = lettresSecretes.indexOf(motSaisiArray[i]);
            if (indexLettre !== -1) {
                nbJaunes++;
                lettresSecretes[indexLettre] = null; 
            } else {
                nbRouges++;
            }
        }
    }

    document.getElementById(`ind-vert-${essaiActuel}`).textContent = nbVerts;
    document.getElementById(`ind-jaune-${essaiActuel}`).textContent = nbJaunes;
    document.getElementById(`ind-rouge-${essaiActuel}`).textContent = nbRouges;

    const ligneDiv = document.getElementById(`ligne-${essaiActuel}`);
    ligneDiv.classList.add("validee");

    for (let i = 0; i < LONGUEUR_MOT; i++) {
        setTimeout(() => {
            document.getElementById(`case-${essaiActuel}-${i}`).classList.add("pop");
        }, i * 100);
    }

    const indicateurs = ligneDiv.querySelectorAll('.indicateur-carre');
    indicateurs.forEach((ind, index) => {
        setTimeout(() => {
            ind.style.transform = "scale(1.15)";
            setTimeout(() => ind.style.transform = "scale(1)", 150);
        }, (LONGUEUR_MOT * 100) + (index * 100));
    });
}

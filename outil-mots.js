// Outil « Mots de 5 lettres » : filtre les mots selon les lettres connues
const PAR_PAGE = 120;

const normaliser = texte => texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

const courants = new Set(SOLUTIONS.map(normaliser));
// Mots courants d'abord, puis les autres, chacun par ordre alphabétique
const tousLesMots = [...new Set(MOTS.map(normaliser))]
    .filter(m => m.length === 5)
    .sort((a, b) => (courants.has(b) - courants.has(a)) || a.localeCompare(b));

const champsVerts = [...document.querySelectorAll("#saisie-vertes input")];
const champsJaunes = [...document.querySelectorAll("#saisie-jaunes input")];
const champAbsentes = document.getElementById("saisie-absentes");
const liste = document.getElementById("resultats-liste");
const titre = document.getElementById("resultats-titre");
const boutonPlus = document.getElementById("btn-plus");

let resultats = [];
let affiches = 0;

function lireContraintes() {
    const vertes = champsVerts.map(c => normaliser(c.value).slice(0, 1));
    const jaunes = champsJaunes.map(c => [...new Set(normaliser(c.value))]);
    const presentes = new Set([...vertes.filter(Boolean), ...jaunes.flat()]);
    // Une lettre marquée absente mais aussi verte/jaune (lettre en double) n'est pas exclue partout
    const absentes = new Set([...normaliser(champAbsentes.value)].filter(l => !presentes.has(l)));
    return { vertes, jaunes, absentes };
}

function correspond(mot, { vertes, jaunes, absentes }) {
    for (let i = 0; i < 5; i++) {
        if (vertes[i] && mot[i] !== vertes[i]) return false;
        if (absentes.has(mot[i])) return false;
        for (const l of jaunes[i]) {
            if (mot[i] === l || !mot.includes(l)) return false;
        }
    }
    return true;
}

function mettreAJour() {
    const contraintes = lireContraintes();
    resultats = tousLesMots.filter(m => correspond(m, contraintes));
    const nbCourants = resultats.filter(m => courants.has(m)).length;
    titre.textContent = `${resultats.length} mot${resultats.length > 1 ? "s" : ""} possible${resultats.length > 1 ? "s" : ""}`
        + (nbCourants ? ` (dont ${nbCourants} courant${nbCourants > 1 ? "s" : ""})` : "");
    liste.innerHTML = "";
    affiches = 0;
    afficherSuite();
}

function afficherSuite() {
    const fragment = document.createDocumentFragment();
    resultats.slice(affiches, affiches + PAR_PAGE).forEach(mot => {
        const span = document.createElement("span");
        span.className = "mot-resultat" + (courants.has(mot) ? " courant" : "");
        span.textContent = mot;
        fragment.appendChild(span);
    });
    liste.appendChild(fragment);
    affiches = Math.min(affiches + PAR_PAGE, resultats.length);
    boutonPlus.classList.toggle("invisible", affiches >= resultats.length);
    if (!resultats.length) liste.innerHTML = '<p class="aide">Aucun mot ne correspond. Vérifiez les lettres saisies.</p>';
}

// Saisie : majuscules sans accents, passage automatique à la case suivante
champsVerts.forEach((champ, i) => {
    champ.addEventListener("input", () => {
        champ.value = normaliser(champ.value).slice(-1);
        if (champ.value && champsVerts[i + 1]) champsVerts[i + 1].focus();
        mettreAJour();
    });
    champ.addEventListener("keydown", e => {
        if (e.key === "Backspace" && !champ.value && champsVerts[i - 1]) champsVerts[i - 1].focus();
    });
});

[...champsJaunes, champAbsentes].forEach(champ => {
    champ.addEventListener("input", () => {
        champ.value = [...new Set(normaliser(champ.value))].join("");
        mettreAJour();
    });
});

boutonPlus.addEventListener("click", afficherSuite);

document.getElementById("btn-effacer").addEventListener("click", () => {
    [...champsVerts, ...champsJaunes, champAbsentes].forEach(c => c.value = "");
    mettreAJour();
});

mettreAJour();

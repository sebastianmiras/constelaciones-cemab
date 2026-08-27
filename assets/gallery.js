const grid = document.querySelector("#grid");
const empty = document.querySelector("#empty");
const search = document.querySelector("#search");
const template = document.querySelector("#card-template");
let interviews = [];

const normalize = value => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("");

function draw(items) {
  grid.replaceChildren();
  empty.hidden = items.length > 0;
  items.forEach((item, index) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const visual = card.querySelector(".portrait-visual");
    const image = card.querySelector("img");
    const placeholder = card.querySelector(".portrait-placeholder");

    if (item.featured) {
    card.classList.add("is-featured");
    card.querySelector(".card-status").textContent =
      item.badge || "Modelo didáctico";
    }
    
    card.href = item.file;
    card.setAttribute("aria-label", `Explorar la constelación de ${item.name}`);
    card.querySelector(".portrait-number").textContent = String(index + 1).padStart(2, "0");
    card.querySelector("h3").textContent = item.name;
    card.querySelector(".portrait-meta p").textContent = item.role || "Entrevista";
    placeholder.dataset.initials = initials(item.name);
    if (item.thumb) {
      image.src = item.thumb;
      image.alt = `Retrato de ${item.name}`;
      image.addEventListener("load", () => visual.classList.add("has-image"));
      image.addEventListener("error", () => image.remove());
    } else {
      image.remove();
    }
    grid.appendChild(card);
  });
}

fetch("manifest.json", { cache: "no-store" })
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(data => { interviews = data; draw(interviews); })
  .catch(() => {
    empty.hidden = false;
    empty.textContent = "No se pudo cargar el archivo de entrevistas.";
  });

search.addEventListener("input", event => {
  const query = normalize(event.target.value.trim());
  draw(interviews.filter(item => normalize(`${item.name} ${(item.tags || []).join(" ")}`).includes(query)));
});

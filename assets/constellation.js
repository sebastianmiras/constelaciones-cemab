(() => {
  const body = document.body;
  const nodesFile = body.dataset.nodes;
  const edgesFile = body.dataset.edges;
  const youtubeUrl = body.dataset.youtube;
  const viz = document.querySelector("#viz");
  const colors = {
    "Didácticas": "#d9ff43",
    "Culturales": "#ff694e",
    "Propia obra": "#9580ff",
    "Biográficas": "#5cc8ff"
  };
  const normalize = value => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const toSeconds = value => (value || "0").split(":").reduce((total, part) => total * 60 + Number(part), 0);
  const shortTime = value => (value || "").replace(/^00:/, "");
  const timedUrl = time => {
    const separator = youtubeUrl.includes("?") ? "&" : "?";
    return `${youtubeUrl}${separator}t=${toSeconds(time)}`;
  };

  let svg, zoom, graphLayer, nodes, links, nodeEls, labelEls, linkEls;

  const loadCsv = path => d3.text(path).then(text => d3.csvParse(text.replace(/^\uFEFF/, "")));

  Promise.all([loadCsv(nodesFile), loadCsv(edgesFile)])
    .then(([nodeData, edgeData]) => {
      nodes = nodeData;
      links = edgeData;
      render();
      document.querySelector("#loading").classList.add("done");
    })
    .catch(error => {
      console.error(error);
      document.querySelector("#loading").hidden = true;
      document.querySelector("#graph-error").hidden = false;
    });

  function render() {
    const width = viz.clientWidth;
    const height = viz.clientHeight;
    svg = d3.select(viz).insert("svg", ".graph-tools").attr("viewBox", [0, 0, width, height]);
    graphLayer = svg.append("g");
    zoom = d3.zoom().scaleExtent([.35, 3]).on("zoom", event => graphLayer.attr("transform", event.transform));
    svg.call(zoom);

    linkEls = graphLayer.append("g").selectAll("line").data(links).join("line")
      .attr("class", d => `link ${d.relation === "has_category" ? "category-link" : ""}`);

    nodeEls = graphLayer.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("class", "node")
      .attr("r", d => d.type === "interviewee" ? 24 : d.type === "category" ? 16 : 6)
      .attr("fill", d => d.type === "interviewee" ? "#f0eee7" : colors[d.group] || "#a9a9a9")
      .attr("tabindex", d => d.type === "reference" ? 0 : -1)
      .attr("role", d => d.type === "reference" ? "button" : null)
      .attr("aria-label", d => d.type === "reference" ? d.label : null)
      .on("click", (_, d) => selectNode(d))
      .on("keydown", (event, d) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectNode(d); } })
      .call(d3.drag().on("start", dragStart).on("drag", dragged).on("end", dragEnd));

    labelEls = graphLayer.append("g").selectAll("text").data(nodes).join("text")
      .attr("class", d => `node-label ${d.type === "category" ? "category-label" : ""} ${d.type === "interviewee" ? "interviewee-label" : ""}`)
      .attr("text-anchor", d => d.type === "reference" ? "start" : "middle")
      .attr("dx", d => d.type === "reference" ? 10 : 0)
      .attr("dy", d => d.type === "reference" ? 3 : d.type === "category" ? 30 : 39)
      .text(d => d.label.length > 42 && d.type === "reference" ? `${d.label.slice(0, 40)}…` : d.label);

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.relation === "has_category" ? 155 : 80).strength(d => d.relation === "has_category" ? .9 : .65))
      .force("charge", d3.forceManyBody().strength(d => d.type === "interviewee" ? -1000 : d.type === "category" ? -560 : -105))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => d.type === "reference" ? 17 : 35))
      .force("x", d3.forceX(width / 2).strength(.035))
      .force("y", d3.forceY(height / 2).strength(.035))
      .on("tick", () => {
        linkEls.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        nodeEls.attr("cx", d => d.x).attr("cy", d => d.y);
        labelEls.attr("x", d => d.x).attr("y", d => d.y);
      });

    function dragStart(event, d) { if (!event.active) simulation.alphaTarget(.25).restart(); d.fx = d.x; d.fy = d.y; }
    function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
    function dragEnd(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

    document.querySelector("#reset").addEventListener("click", resetView);
    document.querySelector("#search").addEventListener("input", applySearch);
    window.addEventListener("resize", () => svg.attr("viewBox", [0, 0, viz.clientWidth, viz.clientHeight]));
    setTimeout(resetView, 900);
  }

  function selectNode(d) {
    if (d.type !== "reference") return;
    document.querySelector("#panel-empty").hidden = true;
    document.querySelector("#panel-content").hidden = false;
    document.querySelector("#panel-category").textContent = d.group;
    document.querySelector("#panel-title").textContent = d.label;
    document.querySelector("#panel-note").textContent = d.note || "Sin contexto breve disponible.";
    document.querySelector("#panel-time").textContent = `${shortTime(d.start_time)} — ${shortTime(d.end_time)}`;
    document.querySelector("#panel-youtube").href = timedUrl(d.start_time);
    document.querySelector("#panel").style.setProperty("--node-color", colors[d.group]);
    const referenceIndex = nodes.filter(node => node.type === "reference").findIndex(node => node.id === d.id) + 1;
    const referenceTotal = nodes.filter(node => node.type === "reference").length;
    document.querySelector("#panel-count").textContent = `${String(referenceIndex).padStart(2, "0")} / ${String(referenceTotal).padStart(2, "0")}`;
    nodeEls.classed("match", node => node.id === d.id);
  }

  function applySearch(event) {
    const query = normalize(event.target.value.trim());
    const matches = new Set(nodes.filter(node => !query || normalize(`${node.label} ${node.note} ${node.group}`).includes(query)).map(node => node.id));
    nodeEls.classed("dim", node => query && !matches.has(node.id));
    labelEls.classed("dim", node => query && !matches.has(node.id));
    linkEls.classed("dim", link => query && !matches.has(link.source.id) && !matches.has(link.target.id));
    if (query) {
      const first = nodes.find(node => matches.has(node.id) && node.type === "reference");
      if (first) svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(viz.clientWidth / 2 - first.x * 1.35, viz.clientHeight / 2 - first.y * 1.35).scale(1.35));
    }
  }

  function resetView() {
    if (!svg || !nodes?.length) return;
    const xExtent = d3.extent(nodes, d => d.x), yExtent = d3.extent(nodes, d => d.y);
    const graphWidth = Math.max(1, xExtent[1] - xExtent[0]), graphHeight = Math.max(1, yExtent[1] - yExtent[0]);
    const scale = Math.min(1.1, .82 / Math.max(graphWidth / viz.clientWidth, graphHeight / viz.clientHeight));
    const centerX = (xExtent[0] + xExtent[1]) / 2, centerY = (yExtent[0] + yExtent[1]) / 2;
    svg.transition().duration(650).call(zoom.transform, d3.zoomIdentity.translate(viz.clientWidth / 2 - centerX * scale, viz.clientHeight / 2 - centerY * scale).scale(scale));
  }
})();

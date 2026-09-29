(() => {
  const body = document.body;
  const nodesFile = body.dataset.nodes;
  const edgesFile = body.dataset.edges;
  const expansionNodesFile = body.dataset.expansionNodes || "";
  const expansionEdgesFile = body.dataset.expansionEdges || "";
  const youtubeUrl = body.dataset.youtube;
  const secondaryYoutubeUrl = body.dataset.youtubeSecondary || "";
  const secondaryStart = body.dataset.secondaryStart ? toSecondsSafe(body.dataset.secondaryStart) : null;
  const viz = document.querySelector("#viz");
  const panel = document.querySelector("#panel");
  const contributionColor = "#ff4fd8";
  const colors = {
    "Didácticas": "#d9ff43",
    "Culturales": "#ff694e",
    "Propia obra": "#9580ff",
    "Biográficas": "#5cc8ff",
    "Aportaciones": contributionColor
  };
  const normalize = value => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  function toSecondsSafe(value) {
    return (value || "0").split(":").reduce((total, part) => total * 60 + Number(part), 0);
  }

  const toSeconds = toSecondsSafe;
  const shortTime = value => (value || "").replace(/^00:/, "");
  const isInterviewee = node => node.type === "interviewee" || node.type === "author";
  const isContribution = node => node.type === "contribution";
  const loadCsv = path => d3.text(path).then(text => d3.csvParse(text.replace(/^\uFEFF/, "")));

  const timedUrl = node => {
    const globalTime = toSeconds(node.start_time);
    const useSecondary = secondaryYoutubeUrl && secondaryStart !== null && globalTime >= secondaryStart;
    const targetUrl = useSecondary ? secondaryYoutubeUrl : youtubeUrl;
    const targetTime = useSecondary ? Math.max(0, globalTime - secondaryStart) : globalTime;
    const separator = targetUrl.includes("?") ? "&" : "?";
    return `${targetUrl}${separator}t=${targetTime}`;
  };

  let svg, zoom, graphLayer, nodes, links, nodeEls, labelEls, linkEls, simulation, linkForce;
  const activeGroups = new Set();

  const baseLoad = Promise.all([loadCsv(nodesFile), loadCsv(edgesFile)]);
  const expansionLoad = expansionNodesFile && expansionEdgesFile
    ? Promise.all([loadCsv(expansionNodesFile), loadCsv(expansionEdgesFile)])
    : Promise.resolve([[], []]);

  Promise.all([baseLoad, expansionLoad])
    .then(([[baseNodes, baseLinks], [expansionNodes, expansionLinks]]) => {
      baseNodes.forEach(node => { node.isContribution = false; });
      expansionNodes.forEach(node => {
        node.isContribution = true;
        node.type = node.type || "contribution";
        node.group = "Aportaciones";
      });
      baseLinks.forEach(link => { link.isContribution = false; });
      expansionLinks.forEach(link => { link.isContribution = true; });

      nodes = [...baseNodes, ...expansionNodes];
      links = [...baseLinks, ...expansionLinks];
      render();
      setupContributionControls(expansionNodes);
      document.querySelector("#loading").classList.add("done");
    })
    .catch(error => {
      console.error(error);
      document.querySelector("#loading").hidden = true;
      document.querySelector("#graph-error").hidden = false;
    });

  function visibleNodes() {
    return nodes.filter(node => !node.isContribution || activeGroups.has(node.student_group));
  }

  function visibleLinks() {
    return links.filter(link => !link.isContribution || activeGroups.has(link.student_group));
  }

  function contributionVisible(item) {
    return !item.isContribution || activeGroups.has(item.student_group);
  }

  function render() {
    const width = viz.clientWidth;
    const height = viz.clientHeight;
    svg = d3.select(viz).insert("svg", ".graph-tools").attr("viewBox", [0, 0, width, height]);
    graphLayer = svg.append("g");
    zoom = d3.zoom().scaleExtent([.35, 3]).on("zoom", event => graphLayer.attr("transform", event.transform));
    svg.call(zoom);

    linkEls = graphLayer.append("g").selectAll("line").data(links).join("line")
      .attr("class", d => `link ${d.relation === "category" || d.relation === "has_category" ? "category-link" : ""} ${d.isContribution ? "contribution-link" : ""}`)
      .classed("contribution-hidden", d => !contributionVisible(d));

    nodeEls = graphLayer.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("class", d => `node ${d.isContribution ? "contribution-node" : ""}`)
      .attr("r", d => isInterviewee(d) ? 24 : d.type === "category" ? 16 : isContribution(d) ? 8 : 6)
      .attr("fill", d => isInterviewee(d) ? "#f0eee7" : d.isContribution ? contributionColor : colors[d.group] || "#a9a9a9")
      .attr("tabindex", d => (d.type === "reference" || isContribution(d)) && contributionVisible(d) ? 0 : -1)
      .attr("role", d => d.type === "reference" || isContribution(d) ? "button" : null)
      .attr("aria-label", d => d.type === "reference" || isContribution(d) ? d.label : null)
      .classed("contribution-hidden", d => !contributionVisible(d))
      .on("click", (_, d) => selectNode(d))
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectNode(d);
        }
      })
      .call(d3.drag().on("start", dragStart).on("drag", dragged).on("end", dragEnd));

    labelEls = graphLayer.append("g").selectAll("text").data(nodes).join("text")
      .attr("class", d => `node-label ${d.type === "category" ? "category-label" : ""} ${isInterviewee(d) ? "interviewee-label" : ""} ${d.isContribution ? "contribution-label" : ""}`)
      .attr("text-anchor", d => d.type === "reference" || isContribution(d) ? "start" : "middle")
      .attr("dx", d => d.type === "reference" || isContribution(d) ? 10 : 0)
      .attr("dy", d => d.type === "reference" || isContribution(d) ? 3 : d.type === "category" ? 30 : 39)
      .text(d => d.label.length > 42 && (d.type === "reference" || isContribution(d)) ? `${d.label.slice(0, 40)}…` : d.label)
      .classed("contribution-hidden", d => !contributionVisible(d));

    linkForce = d3.forceLink(visibleLinks())
      .id(d => d.id)
      .distance(d => d.isContribution ? 82 : d.relation === "category" || d.relation === "has_category" ? 165 : 110)
      .strength(d => d.isContribution ? .55 : d.relation === "category" || d.relation === "has_category" ? .9 : .65);

    simulation = d3.forceSimulation(visibleNodes())
      .force("link", linkForce)
      .force("charge", d3.forceManyBody().strength(d =>
        isInterviewee(d) ? -1050 :
        d.type === "category" ? -600 :
        d.isContribution ? -125 :
        -150
      ))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => d.type === "reference" ? 25 : d.isContribution ? 30 : 38))
      .force("x", d3.forceX(width / 2).strength(.035))
      .force("y", d3.forceY(height / 2).strength(.035))
      .on("tick", ticked);

    document.querySelector("#reset").addEventListener("click", resetView);
    document.querySelector("#search").addEventListener("input", applySearch);
    window.addEventListener("resize", () => svg.attr("viewBox", [0, 0, viz.clientWidth, viz.clientHeight]));
    setTimeout(resetView, 900);
  }

  function ticked() {
    linkEls
      .attr("x1", d => typeof d.source === "object" ? d.source.x : null)
      .attr("y1", d => typeof d.source === "object" ? d.source.y : null)
      .attr("x2", d => typeof d.target === "object" ? d.target.x : null)
      .attr("y2", d => typeof d.target === "object" ? d.target.y : null);
    nodeEls.attr("cx", d => d.x).attr("cy", d => d.y);
    labelEls.attr("x", d => d.x).attr("y", d => d.y);
  }

  function dragStart(event, d) {
    if (!contributionVisible(d)) return;
    if (!event.active) simulation.alphaTarget(.25).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    if (!contributionVisible(d)) return;
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragEnd(event, d) {
    if (!contributionVisible(d)) return;
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  function setupContributionControls(expansionNodes) {
    const controls = document.querySelector("#contribution-groups");
    const contributionPanel = document.querySelector("#contribution-panel");
    if (!controls || !contributionPanel || !expansionNodes.length) return;

    const groups = [...new Set(expansionNodes.map(node => node.student_group).filter(Boolean))];
    groups.forEach(group => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "contribution-toggle";
      button.dataset.group = group;
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = `<span class="contribution-dot" aria-hidden="true"></span><span>${group}</span><small>${expansionNodes.filter(node => node.student_group === group).length}</small>`;
      button.addEventListener("click", () => toggleContributionGroup(group, button));
      controls.append(button);
    });
    contributionPanel.hidden = false;
  }

  function toggleContributionGroup(group, button) {
    if (activeGroups.has(group)) {
      activeGroups.delete(group);
    } else {
      activeGroups.add(group);
    }

    const active = activeGroups.has(group);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    updateContributionVisibility();
  }

  function updateContributionVisibility() {
    nodeEls
      .classed("contribution-hidden", d => !contributionVisible(d))
      .attr("tabindex", d => (d.type === "reference" || isContribution(d)) && contributionVisible(d) ? 0 : -1);
    labelEls.classed("contribution-hidden", d => !contributionVisible(d));
    linkEls.classed("contribution-hidden", d => !contributionVisible(d));

    simulation.nodes(visibleNodes());
    linkForce.links(visibleLinks());
    simulation.alpha(1).restart();
    document.querySelector("#search").dispatchEvent(new Event("input"));

    window.setTimeout(resetView, 650);
  }

  function selectNode(d) {
    if (d.type !== "reference" && !isContribution(d)) return;
    if (!contributionVisible(d)) return;

    document.querySelector("#panel-empty").hidden = true;
    document.querySelector("#panel-content").hidden = false;
    document.querySelector("#panel-title").textContent = d.label;
    document.querySelector("#panel-note").textContent = d.note || "Sin explicación disponible.";

    const timeRange = document.querySelector("#panel-time-range");
    const link = document.querySelector("#panel-youtube");
    const linkLabel = document.querySelector("#panel-link-label");

    if (isContribution(d)) {
      document.querySelector("#panel-category").textContent = d.mode || "Aportación";
      document.querySelector("#panel-count").textContent = d.student_group || "Aportación";
      timeRange.hidden = true;
      link.href = d.url || "#";
      link.hidden = !d.url;
      linkLabel.textContent = "Abrir recurso";
      panel.style.setProperty("--node-color", contributionColor);
    } else {
      document.querySelector("#panel-category").textContent = d.group;
      document.querySelector("#panel-count").textContent = d.ref_code || "—";
      document.querySelector("#panel-time").textContent = `${shortTime(d.start_time)} — ${shortTime(d.end_time)}`;
      timeRange.hidden = false;
      link.href = timedUrl(d);
      link.hidden = false;
      linkLabel.textContent = "Ver este momento";
      panel.style.setProperty("--node-color", colors[d.group]);
    }

    nodeEls.classed("match", node => node.id === d.id);
  }

  function applySearch(event) {
    const query = normalize(event.target.value.trim());
    const candidates = nodes.filter(contributionVisible);
    const matches = new Set(candidates.filter(node =>
      !query || normalize(`${node.ref_code || ""} ${node.label} ${node.note} ${node.group} ${node.mode || ""} ${node.student_group || ""}`).includes(query)
    ).map(node => node.id));

    nodeEls.classed("dim", node => contributionVisible(node) && query && !matches.has(node.id));
    labelEls.classed("dim", node => contributionVisible(node) && query && !matches.has(node.id));
    linkEls.classed("dim", link => contributionVisible(link) && query &&
      !matches.has(typeof link.source === "object" ? link.source.id : link.source) &&
      !matches.has(typeof link.target === "object" ? link.target.id : link.target));

    if (query) {
      const first = candidates.find(node => matches.has(node.id) && (node.type === "reference" || isContribution(node)));
      if (first?.x !== undefined) {
        svg.transition().duration(500).call(
          zoom.transform,
          d3.zoomIdentity.translate(viz.clientWidth / 2 - first.x * 1.35, viz.clientHeight / 2 - first.y * 1.35).scale(1.35)
        );
      }
    }
  }

  function resetView() {
    if (!svg) return;
    const activeNodes = visibleNodes().filter(node => Number.isFinite(node.x) && Number.isFinite(node.y));
    if (!activeNodes.length) return;
    const xExtent = d3.extent(activeNodes, d => d.x);
    const yExtent = d3.extent(activeNodes, d => d.y);
    const graphWidth = Math.max(1, xExtent[1] - xExtent[0]);
    const graphHeight = Math.max(1, yExtent[1] - yExtent[0]);
    const scale = Math.min(1.1, .82 / Math.max(graphWidth / viz.clientWidth, graphHeight / viz.clientHeight));
    const centerX = (xExtent[0] + xExtent[1]) / 2;
    const centerY = (yExtent[0] + yExtent[1]) / 2;
    svg.transition().duration(650).call(
      zoom.transform,
      d3.zoomIdentity.translate(viz.clientWidth / 2 - centerX * scale, viz.clientHeight / 2 - centerY * scale).scale(scale)
    );
  }
})();


document.addEventListener("DOMContentLoaded", function () {

let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);

let history = [];
let redoStack = [];

// 🔥 NORMALIZE INPUT (KEY FUNCTION)
function normalize(id) {
  return id.trim().toUpperCase();
}

function saveState() {
  history.push({
    nodes: nodes.get(),
    edges: edges.get()
  });
  redoStack = [];
}

function restoreState(state) {
  nodes.clear();
  edges.clear();
  nodes.add(state.nodes);
  edges.add(state.edges);
}

// RESET EDGES
function resetEdges() {
  edges.forEach(e => {
    edges.update({
      id: e.id,
      color: e.label === "REQ" ? "blue" : "green",
      width: 1
    });
  });
}

// 🔴 NEW: HIGHLIGHT ALL CYCLES
function highlightAllCycles(cycles) {
  resetEdges();

  cycles.forEach(cycle => {
    for (let i = 0; i < cycle.length - 1; i++) {
      let from = cycle[i];
      let to = cycle[i + 1];

      edges.forEach(e => {
        if (e.from === from && e.to === to) {
          edges.update({
            id: e.id,
            color: "red",
            width: 4
          });
        }
      });
    }
  });
}

window.undo = function () {
  if (history.length === 0) return;

  let current = {
    nodes: nodes.get(),
    edges: edges.get()
  };

  redoStack.push(current);

  let prev = history.pop();
  restoreState(prev);
};

window.redo = function () {
  if (redoStack.length === 0) return;

  let current = {
    nodes: nodes.get(),
    edges: edges.get()
  };

  history.push(current);

  let next = redoStack.pop();
  restoreState(next);
};

let container = document.getElementById("network");

let network = new vis.Network(container, { nodes, edges }, {
  nodes: { borderWidth: 2 },
  edges: { arrows: "to", smooth: true }
});

let pCount = 0;
let rCount = 0;

// ADD PROCESS
window.addProcess = function () {
  saveState();
  pCount++;
  nodes.add({ id: "P" + pCount, label: "P" + pCount, shape: "circle", color: "lightblue" });
};

// ADD RESOURCE
window.addResource = function () {
  saveState();
  rCount++;
  nodes.add({ id: "R" + rCount, label: "R" + rCount, shape: "box", color: "orange" });
};

// DELETE PROCESS
window.deleteProcess = function () {
  let id = normalize(prompt("Enter Process ID"));

  if (!nodes.get(id) || !id.startsWith("P")) return alert("Invalid");

  saveState();

  let removeEdges = edges.get().filter(e => e.from === id || e.to === id).map(e => e.id);
  edges.remove(removeEdges);
  nodes.remove(id);
};

// DELETE RESOURCE
window.deleteResource = function () {
  let id = normalize(prompt("Enter Resource ID"));

  if (!nodes.get(id) || !id.startsWith("R")) return alert("Invalid");

  saveState();

  let removeEdges = edges.get().filter(e => e.from === id || e.to === id).map(e => e.id);
  edges.remove(removeEdges);
  nodes.remove(id);
};

// DELETE EDGE
window.deleteEdge = function () {
  let from = normalize(prompt("From?"));
  let to = normalize(prompt("To?"));

  let found = edges.get().filter(e => e.from === from && e.to === to);

  if (found.length === 0) return alert("Edge not found");

  saveState();
  edges.remove(found.map(e => e.id));
};

// ADD EDGE
window.addEdgeFromInput = function () {
  let from = normalize(document.getElementById("fromNode").value);
  let to = normalize(document.getElementById("toNode").value);
  let type = document.getElementById("edgeType").value;

  if (!nodes.get(from) || !nodes.get(to)) return alert("Invalid nodes");

  if (type === "request" && (!from.startsWith("P") || !to.startsWith("R")))
    return alert("Request must be P → R");

  if (type === "allocation" && (!from.startsWith("R") || !to.startsWith("P")))
    return alert("Allocation must be R → P");

  saveState();

  edges.add({
    from,
    to,
    arrows: "to",
    color: type === "request" ? "blue" : "green",
    label: type === "request" ? "REQ" : "ALLOC"
  });

  document.getElementById("fromNode").value = "";
  document.getElementById("toNode").value = "";
};

// GRAPH
function buildGraph() {
  let graph = {};
  nodes.forEach(n => graph[n.id] = []);
  edges.forEach(e => graph[e.from].push(e.to));
  return graph;
}

// 🔴 NEW: DETECT ALL CYCLES
function detectAllCycles(graph) {
  let cycles = [];

  function dfs(node, path) {
    if (path.includes(node)) {
      let cycle = path.slice(path.indexOf(node));
      cycles.push([...cycle, node]);
      return;
    }

    path.push(node);

    for (let neighbor of graph[node]) {
      dfs(neighbor, [...path]);
    }
  }

  for (let node in graph) {
    dfs(node, []);
  }

  return cycles;
}

// 🔴 UPDATED DEADLOCK CHECK
window.checkDeadlock = function () {
  let graph = buildGraph();
  let cycles = detectAllCycles(graph);

  let exp = document.getElementById("explanationText");

  resetEdges();

  if (cycles.length === 0) {
    exp.innerText = "No deadlock is present because no circular wait exists.";
    return;
  }

  let validCycles = cycles.filter(cycle => {
    let processes = new Set(cycle.filter(n => n.startsWith("P")));
    return processes.size >= 2;
  });

  if (validCycles.length === 0) {
    exp.innerText =
      "Cycles exist but they do not represent deadlock because only one process is involved.";
    return;
  }

  // 🔴 highlight ALL
  highlightAllCycles(validCycles);
animateCycle(validCycles);

  let text = "Deadlock detected involving the following cycles:\n\n";

  validCycles.forEach((cycle, index) => {
    text += `Cycle ${index + 1}: `;

    for (let i = 0; i < cycle.length - 1; i++) {
      let a = cycle[i];
      let b = cycle[i + 1];

      if (a.startsWith("P"))
        text += `${a} waits for ${b}, `;
      else
        text += `${a} allocated to ${b}, `;
    }

    text += "forming a circular wait.\n\n";
  });

  exp.innerText = text;
};

// 🔥 ANIMATION
function animateCycle(cycles) {
  let toggle = false;

  setInterval(() => {
    cycles.forEach(cycle => {
      for (let i = 0; i < cycle.length - 1; i++) {
        let from = cycle[i];
        let to = cycle[i + 1];

        edges.forEach(e => {
          if (e.from === from && e.to === to) {
            edges.update({
              id: e.id,
              color: toggle ? "#ff0000" : "#ff6666",
              width: toggle ? 5 : 3
            });
          }
        });
      }
    });

    toggle = !toggle;
  }, 500);
}

window.goToLearn = function () {
  window.location.href = "index.html";
};

});
const canvasEl = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvasEl, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.04, 0.04, 0.08, 1);

const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 3, 12, BABYLON.Vector3.Zero(), scene);
camera.attachControl(canvasEl, true);
camera.lowerRadiusLimit = 4;
camera.upperRadiusLimit = 28;

const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
light.intensity = 0.9;
const pt = new BABYLON.PointLight("pt", new BABYLON.Vector3(0, 4, 0), scene);
pt.intensity = 0.6;

const DEFAULT_ITEMS = [
  { name: "Comprar pan", color: "#ff9933", pos: [3, 1.5, 2] },
  { name: "Llamar a mamá", color: "#4dc9ff", pos: [-2.5, 2, -1] },
  { name: "Entregar informe", color: "#e64de6", pos: [1, 3, -3] },
  { name: "Agua plantas", color: "#33ff66", pos: [-3, 0.5, 2.5] },
];

function loadItems() {
  try {
    const raw = localStorage.getItem("memoryItems");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return DEFAULT_ITEMS.map((it) => ({ ...it }));
}

function saveItems() {
  try { localStorage.setItem("memoryItems", JSON.stringify(items)); } catch (e) {}
}

let items = loadItems();
let abstractMeshes = [];
let realMeshes = [];
let itemMeshes = { abstract: [], real: [] };
let currentMode = "abstract";

function hexToColor3(hex) {
  const h = hex.replace("#", "");
  return new BABYLON.Color3(
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255
  );
}

function makeMaterial(color) {
  const c = typeof color === "string" ? hexToColor3(color) : color;
  const m = new BABYLON.StandardMaterial("m", scene);
  m.diffuseColor = c;
  m.emissiveColor = c.scale(0.25);
  m.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
  return m;
}

function nextPosition(index) {
  const angle = (index * 137.5 * Math.PI) / 180;
  const r = 2 + index * 0.35;
  return new BABYLON.Vector3(Math.cos(angle) * r, 1 + (index % 3) * 0.6, Math.sin(angle) * r);
}

function buildRooms() {
  // Abstract shell
  const shell = BABYLON.MeshBuilder.CreateSphere("shell", { diameter: 16, segments: 32 }, scene);
  shell.scaling = new BABYLON.Vector3(1, 0.7, 1.1);
  const sm = new BABYLON.StandardMaterial("shellMat", scene);
  sm.diffuseColor = new BABYLON.Color3(0.15, 0.12, 0.25);
  sm.emissiveColor = new BABYLON.Color3(0.05, 0.04, 0.1);
  sm.backFaceCulling = false;
  shell.material = sm;
  shell.isPickable = false;
  abstractMeshes.push(shell);

  for (let i = 0; i < 6; i++) {
    const pts = [];
    for (let t = 0; t <= 40; t++) {
      const a = (t / 40) * Math.PI * 2;
      const r = 6 + Math.sin(a * 3 + i) * 0.6;
      pts.push(new BABYLON.Vector3(Math.cos(a + i) * r, Math.sin(a * 2) * 1.5, Math.sin(a + i) * r));
    }
    const tube = BABYLON.MeshBuilder.CreateTube("rib" + i, { path: pts, radius: 0.08, tessellation: 12 }, scene);
    const tm = new BABYLON.StandardMaterial("ribMat", scene);
    tm.diffuseColor = new BABYLON.Color3(0.4, 0.3, 0.6);
    tm.emissiveColor = new BABYLON.Color3(0.1, 0.08, 0.2);
    tube.material = tm;
    tube.isPickable = false;
    abstractMeshes.push(tube);
  }

  // Real room
  const floor = BABYLON.MeshBuilder.CreateGround("floor", { width: 12, height: 12 }, scene);
  const fm = new BABYLON.StandardMaterial("floorMat", scene);
  fm.diffuseColor = new BABYLON.Color3(0.3, 0.25, 0.2);
  fm.backFaceCulling = false;
  floor.material = fm;
  realMeshes.push(floor);

  const walls = [
    { pos: new BABYLON.Vector3(0, 2, 6), rot: Math.PI, w: 12 },
    { pos: new BABYLON.Vector3(0, 2, -6), rot: 0, w: 12 },
    { pos: new BABYLON.Vector3(6, 2, 0), rot: -Math.PI / 2, w: 12 },
    { pos: new BABYLON.Vector3(-6, 2, 0), rot: Math.PI / 2, w: 12 },
  ];
  walls.forEach((w, i) => {
    const wall = BABYLON.MeshBuilder.CreatePlane("wall" + i, { width: w.w, height: 4 }, scene);
    wall.position = w.pos;
    wall.rotation.y = w.rot;
    const wm = new BABYLON.StandardMaterial("wallMat" + i, scene);
    wm.diffuseColor = new BABYLON.Color3(0.85, 0.82, 0.78);
    wm.backFaceCulling = false;
    wall.material = wm;
    realMeshes.push(wall);
  });

  const ceiling = BABYLON.MeshBuilder.CreatePlane("ceil", { width: 12, height: 12 }, scene);
  ceiling.position = new BABYLON.Vector3(0, 4, 0);
  ceiling.rotation.x = Math.PI / 2;
  const cm = new BABYLON.StandardMaterial("ceilMat", scene);
  cm.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
  cm.backFaceCulling = false;
  ceiling.material = cm;
  realMeshes.push(ceiling);
}

function buildItemMeshes() {
  // clear old item meshes
  itemMeshes.abstract.forEach((m) => m.dispose());
  itemMeshes.real.forEach((m) => m.dispose());
  itemMeshes.abstract = [];
  itemMeshes.real = [];

  items.forEach((it, idx) => {
    const color = it.color || "#ffffff";
    const pos = Array.isArray(it.pos) ? new BABYLON.Vector3(it.pos[0], it.pos[1], it.pos[2]) : nextPosition(idx);

    const sa = BABYLON.MeshBuilder.CreateSphere("itemA" + idx, { diameter: 0.6, segments: 16 }, scene);
    sa.position = pos;
    sa.material = makeMaterial(color);
    sa.metadata = { name: it.name, index: idx };
    itemMeshes.abstract.push(sa);

    const sr = BABYLON.MeshBuilder.CreateSphere("itemR" + idx, { diameter: 0.6, segments: 16 }, scene);
    sr.position = new BABYLON.Vector3(pos.x * 0.6, pos.y, pos.z * 0.6);
    sr.material = makeMaterial(color);
    sr.metadata = { name: it.name, index: idx };
    itemMeshes.real.push(sr);
  });
}

function setMode(mode) {
  currentMode = mode;
  const hideRoom = mode === "abstract" ? realMeshes : abstractMeshes;
  const showRoom = mode === "abstract" ? abstractMeshes : realMeshes;
  hideRoom.forEach((m) => (m.isVisible = false));
  showRoom.forEach((m) => (m.isVisible = true));
  const hideItems = mode === "abstract" ? itemMeshes.real : itemMeshes.abstract;
  const showItems = mode === "abstract" ? itemMeshes.abstract : itemMeshes.real;
  hideItems.forEach((m) => (m.isVisible = false));
  showItems.forEach((m) => (m.isVisible = true));
  document.getElementById("modeLabel").textContent = mode === "abstract" ? "Abstracto" : "Real";
}

function addItem(name, color) {
  if (!name.trim()) return;
  const idx = items.length;
  const np = nextPosition(idx); items.push({ name: name.trim(), color: color || "#ffffff", pos: [np.x, np.y, np.z] });
  saveItems();
  buildItemMeshes();
  setMode(currentMode);
  renderList();
}

function removeItem(index) {
  items.splice(index, 1);
  saveItems();
  buildItemMeshes();
  setMode(currentMode);
  renderList();
}

function renderList() {
  const list = document.getElementById("memoryList");
  if (!list) return;
  list.innerHTML = "";
  items.forEach((it, idx) => {
    const li = document.createElement("li");
    li.style.cssText = "display:flex;align-items:center;gap:6px;margin:4px 0;";
    const dot = document.createElement("span");
    dot.style.cssText = "width:10px;height:10px;border-radius:50%;background:" + (it.color || "#fff") + ";display:inline-block;";
    const txt = document.createElement("span");
    txt.textContent = it.name;
    txt.style.flex = "1";
    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.style.cssText = "background:#333;border:none;color:#fff;border-radius:4px;cursor:pointer;padding:0 6px;";
    btn.addEventListener("click", () => removeItem(idx));
    li.appendChild(dot);
    li.appendChild(txt);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

// UI wiring
const addBtn = document.getElementById("addBtn");
if (addBtn) {
  addBtn.addEventListener("click", () => {
    const nameInput = document.getElementById("newName");
    const colorInput = document.getElementById("newColor");
    addItem(nameInput.value, colorInput.value);
    nameInput.value = "";
  });
}

buildRooms();
buildItemMeshes();
setMode("abstract");
renderList();

scene.onPointerObservable.add((info) => {
  if (info.pickInfo && info.pickInfo.hit && info.pickInfo.pickedMesh && info.pickInfo.pickedMesh.metadata && info.pickInfo.pickedMesh.metadata.name) {
    const name = info.pickInfo.pickedMesh.metadata.name;
    const el = document.getElementById("hint");
    el.textContent = "Recordatorio: " + name;
    setTimeout(() => (el.textContent = "Click + arrastrar para rotar · Rueda para zoom · Click en esferas para recordar"), 2500);
  }
});

document.getElementById("toggleMode").addEventListener("click", () => {
  setMode(currentMode === "abstract" ? "real" : "abstract");
});


// --- Guided tour ---
let tourActive = false;
let tourIndex = 0;
let tourTimer = 0;
const TOUR_DWELL = 2.5;

function currentTourMeshes() {
  return currentMode === "abstract" ? itemMeshes.abstract : itemMeshes.real;
}

function startTour() {
  if (items.length === 0) return;
  tourActive = true;
  tourIndex = 0;
  tourTimer = 0;
  const btn = document.getElementById("tourBtn");
  if (btn) btn.textContent = "Detener";
}

function stopTour() {
  tourActive = false;
  const btn = document.getElementById("tourBtn");
  if (btn) btn.textContent = "Recorrido";
}

scene.onBeforeRenderObservable.add(() => {
  if (!tourActive) return;
  const meshes = currentTourMeshes();
  if (meshes.length === 0) { stopTour(); return; }
  const target = meshes[tourIndex % meshes.length];
  // lerp camera target toward item
  const t = scene.getEngine().getDeltaTime() / 1000;
  const speed = 3.0;
  const diff = target.position.subtract(camera.target);
  if (diff.length() > 0.05) {
    camera.target.addInPlace(diff.scale(Math.min(1, speed * t)));
  } else {
    tourTimer += t;
    if (tourTimer >= TOUR_DWELL) {
      tourTimer = 0;
      tourIndex++;
      if (tourIndex >= meshes.length) { tourIndex = 0; stopTour(); }
    }
  }
});

const tourBtn = document.getElementById("tourBtn");
if (tourBtn) {
  tourBtn.addEventListener("click", () => {
    if (tourActive) stopTour(); else startTour();
  });
}


engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
window.__scene = scene;
window.__engine = engine;

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { PEG, RAD, type Plan, type PlannedHolder } from "../core/index.ts";

// The drawer in 3D: the holders dunnage works out, what they hold, and the base under them.
// Holders are drawn from their footprints and methods, as blocks; a holder's real printed shape
// is for the geometry and export to make. Drag to turn the view, scroll to zoom, click to select.

interface Props {
  plan: Plan;
  sels: string[];
  select: (ids: string[], add?: boolean) => void;
}

const COLOURS = {
  floor: 0x121212, wall: 0x262626, petg: 0x34343a, selected: 0x40c057, locked: 0x8f78f2, ply: 0xc9a26b,
  peg: 0xe8e8e8, board: 0x1b1b1b, custom: 0xffffff, ceramic: 0xeef0f2, glass: 0xcde6f0, thingSelected: 0x9ae6a8,
};

export function Preview3D({ plan: p, sels, select }: Props) {
  const host = useRef<HTMLDivElement>(null);
  // The camera survives rebuilding the scene, so editing doesn't reset the view.
  const view = useRef({ yaw: -0.45, pitch: 0.8, distance: 0 });
  const selectRef = useRef(select);
  selectRef.current = select;

  useEffect(() => {
    const element = host.current!;
    const { width: W, depth: D, height: H, base } = p;
    if (!view.current.distance) view.current.distance = Math.max(W, D) * 2.3;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 10, 10_000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-W * 0.4, 1200, D * 1.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -W, right: W, top: D, bottom: -D, near: 10, far: 4000 });
    scene.add(sun);

    // Drawer coordinates: x right, y back, z up. three.js: y up, the front of the drawer towards +z.
    const root = new THREE.Group();
    root.position.set(-W / 2, 0, D / 2);
    scene.add(root);
    const materials = new Map<string, THREE.Material>();
    const material = (colour: number, opacity = 1) => {
      const key = `${colour}-${opacity}`;
      if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.75, metalness: 0, transparent: opacity < 1, opacity }));
      return materials.get(key)!;
    };
    const place = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, id?: string) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(x, z, -y);
      mesh.castShadow = mesh.receiveShadow = true;
      if (id) mesh.userData.id = id;
      parent.add(mesh);
      return mesh;
    };
    const block = (x0: number, y0: number, z0: number, w: number, d: number, h: number, mat: THREE.Material, id?: string) =>
      place(root, new THREE.BoxGeometry(w, h, d), mat, x0 + w / 2, y0 + d / 2, z0 + h / 2, id);

    // The drawer: floor and three walls; the front is left open to look in.
    block(0, 0, -12, W, D, 12, material(COLOURS.floor));
    block(-12, -12, -12, 12, D + 24, H + 12, material(COLOURS.wall, 0.55));
    block(W, -12, -12, 12, D + 24, H + 12, material(COLOURS.wall, 0.55));
    block(0, D, -12, W, 12, H + 12, material(COLOURS.wall, 0.55));
    if (base.grid) block(base.grid.ox, base.grid.oy, 0, base.grid.nx * base.grid.pitch, base.grid.ny * base.grid.pitch, base.z, material(COLOURS.board));
    if (base.board) block(base.board.x0, base.board.y0, -8, base.board.width, base.board.depth, 8, material(COLOURS.board));

    const selectedHolders = new Set(sels.map((id) => p.things.find((t) => t.id === id)?.holder?.id).filter(Boolean));
    for (const h of p.holders) if (h.rect) holder(h);

    function holder(h: PlannedHolder) {
      const r = h.rect!;
      const z = base.z;
      const w = r.x1 - r.x0;
      const d = r.y1 - r.y0;
      const id = h.things[0]?.id;
      const mat = selectedHolders.has(h.id) ? material(COLOURS.selected) : h.locked ? material(COLOURS.locked) : h.method === "ply" ? material(COLOURS.ply) : h.method === "custom" ? material(COLOURS.custom, 0.14) : material(COLOURS.petg);
      const wall = 2.4;
      const tray = (height: number) => {
        block(r.x0, r.y0, z, w, d, 2, mat, id);
        block(r.x0, r.y0, z, wall, d, height, mat, id);
        block(r.x1 - wall, r.y0, z, wall, d, height, mat, id);
        block(r.x0, r.y0, z, w, wall, height, mat, id);
        block(r.x0, r.y1 - wall, z, w, wall, height, mat, id);
      };
      switch (h.method) {
        case "pegs":
          for (const peg of h.pegs) place(root, new THREE.BoxGeometry(PEG.size[0], PEG.height, PEG.size[1]), material(COLOURS.peg), peg.x, peg.y, z + PEG.height / 2, peg.of);
          return;
        case "posts":
          if (h.source.floor !== false) block(r.x0, r.y0, z, w, d, 2, mat, id);
          for (const [x, y] of h.posts) place(root, new THREE.CylinderGeometry(4, 4, h.height, 16), mat, x, y, z + h.height / 2, id);
          return;
        case "slot": {
          // Two walls along the long side of what it holds.
          block(r.x0, r.y0, z, w, d, 2, mat, id);
          if (w >= d) {
            block(r.x0, r.y0, z, w, wall * 1.5, h.height, mat, id);
            block(r.x0, r.y1 - wall * 1.5, z, w, wall * 1.5, h.height, mat, id);
          } else {
            block(r.x0, r.y0, z, wall * 1.5, d, h.height, mat, id);
            block(r.x1 - wall * 1.5, r.y0, z, wall * 1.5, d, h.height, mat, id);
          }
          return;
        }
        case "peg":
          block(r.x0, r.y0, z, w, d, h.locked ? h.height : 4, mat, id);
          for (const t of h.things) {
            const radius = h.source.method === "peg" && h.source.peg ? h.source.peg.diameter / 2 : (t.item.outlet ?? 18) / 2 - 1;
            const tall = h.source.method === "peg" && h.source.peg ? h.source.peg.height : 30;
            place(root, new THREE.CylinderGeometry(radius, radius, tall, 24), mat, t.x, t.y, z + tall / 2, id);
          }
          return;
        case "ply":
          block(r.x0, r.y0, z, w, d, h.height, mat, id);
          return;
        case "custom":
          block(r.x0, r.y0, z, w, d, 30, mat, id);
          return;
        default:
          tray(h.height);
      }
    }

    for (const t of p.placed) {
      const s = t.shape;
      const group = new THREE.Group();
      group.position.set(t.x, 0, -t.y);
      group.rotation.y = t.rotate * RAD;
      root.add(group);
      const mat = sels.includes(t.id) ? material(COLOURS.thingSelected, 0.92) : /glass/i.test(t.item.name) ? material(COLOURS.glass, 0.45) : material(COLOURS.ceramic, 0.9);
      if (s.round) {
        const r = s.size[0] / 2;
        place(group, new THREE.CylinderGeometry(r, r * (t.stack > 1 ? 0.8 : 0.94), s.height, 48), mat, 0, 0, t.z0 + s.height / 2, t.id);
        if (s.handle) place(group, new THREE.BoxGeometry(s.handle[0], s.height * 0.6, s.handle[1]), mat, 0, -(r + s.handle[1] / 2) + 4, t.z0 + s.height * 0.55, t.id);
        if (s.spout) place(group, new THREE.BoxGeometry(s.spout[0], s.height * 0.12, s.spout[1]), mat, 0, r + s.spout[1] / 2 - 4, t.z0 + s.height * 0.8, t.id);
      } else if (s.lying && "cylinder" in t.item) {
        const [diameter, length] = t.item.cylinder;
        const mesh = place(group, new THREE.CylinderGeometry(diameter / 2, (diameter / 2) * 0.9, length, 40), mat, 0, 0, t.z0 + s.height / 2, t.id);
        mesh.rotation.x = Math.PI / 2 - s.tilt * RAD;
      } else {
        place(group, new THREE.BoxGeometry(s.size[0], s.height, s.size[1]), mat, 0, 0, t.z0 + s.height / 2, t.id);
      }
    }

    const v = view.current;
    const aim = () => {
      camera.position.set(Math.sin(v.yaw) * Math.cos(v.pitch) * v.distance, Math.sin(v.pitch) * v.distance, Math.cos(v.yaw) * Math.cos(v.pitch) * v.distance);
      camera.lookAt(0, H * 0.15, 0);
    };
    const draw = () => renderer.render(scene, camera);
    const size = () => {
      const w = element.clientWidth || 400;
      const h = element.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw();
    };
    aim();
    size();

    let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
    const canvas = renderer.domElement;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch, moved: false };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      v.yaw = drag.yaw - dx * 0.008;
      v.pitch = Math.max(0.12, Math.min(1.5, drag.pitch + dy * 0.006));
      aim();
      draw();
    };
    const up = (e: PointerEvent) => {
      if (drag && !drag.moved) {
        const rect = canvas.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
        const hit = ray.intersectObjects(root.children, true).find((h) => h.object.userData.id);
        selectRef.current(hit ? [hit.object.userData.id as string] : [], e.shiftKey);
      }
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const most = Math.max(W, D) * 4;
      v.distance = Math.max(Math.max(W, D) * 0.6, Math.min(most, v.distance * (1 + e.deltaY * 0.001)));
      aim();
      draw();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    const observer = new ResizeObserver(size);
    observer.observe(element);

    return () => {
      observer.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const m of materials.values()) m.dispose();
      renderer.dispose();
      element.removeChild(canvas);
    };
  }, [p, sels]);

  return (
    <div className="three" ref={host}>
      <p className="hint">Drag to turn · scroll to zoom · click a thing to select it</p>
    </div>
  );
}

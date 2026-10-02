import { useEffect, useRef } from "react";
import * as THREE from "three";

/** The drawer's inside as a wireframe box, origin at the front-left corner of the floor. */
export function DrawerView({ inside }: { inside: [number, number, number] }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current!;
    const [width, depth, height] = inside;

    const scene = new THREE.Scene();
    // The drawer file's z is up; three.js's y is up, with the front of the drawer towards +z.
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
      new THREE.LineBasicMaterial({ color: 0xe5582a }),
    );
    box.position.set(width / 2, height / 2, -depth / 2);
    scene.add(box);

    const camera = new THREE.PerspectiveCamera(35, 1, 1, 10_000);
    camera.position.set(width * 0.5, Math.max(width, depth) * 1.1, depth * 0.9);
    camera.lookAt(width / 2, 0, -depth / 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    element.appendChild(renderer.domElement);

    const resize = () => {
      const { clientWidth, clientHeight } = element;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    return () => {
      observer.disconnect();
      renderer.dispose();
      element.removeChild(renderer.domElement);
    };
  }, [inside]);

  return <div className="drawer-view" ref={host} />;
}

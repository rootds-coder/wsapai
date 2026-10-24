import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { cn } from '@/lib/utils';

export const ThreeBackground = ({ className }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 24;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 2. 3D Objects: Central Cybernetic Globe Mesh
    const globeGeometry = new THREE.IcosahedronGeometry(9, 2);
    const globeMaterial = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
    });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(globe);

    // Inner Glowing Core
    const coreGeometry = new THREE.IcosahedronGeometry(4, 1);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x25d366,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(core);

    // Floating 3D Node Orbs around Globe
    const nodesGroup = new THREE.Group();
    const nodeGeo = new THREE.OctahedronGeometry(0.8, 0);
    const nodeMat = new THREE.MeshBasicMaterial({
      color: 0xa78bfa,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });

    const nodesCount = 18;
    for (let i = 0; i < nodesCount; i++) {
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      const radius = 14 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      node.position.x = radius * Math.sin(phi) * Math.cos(theta);
      node.position.y = radius * Math.sin(phi) * Math.sin(theta);
      node.position.z = radius * Math.cos(phi);

      node.userData = {
        rotSpeedX: (Math.random() - 0.5) * 0.02,
        rotSpeedY: (Math.random() - 0.5) * 0.02,
      };
      nodesGroup.add(node);
    }
    scene.add(nodesGroup);

    // 3. Mouse Responsiveness
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e) => {
      const windowHalfX = window.innerWidth / 2;
      const windowHalfY = window.innerHeight / 2;
      mouseX = (e.clientX - windowHalfX) * 0.0008;
      mouseY = (e.clientY - windowHalfY) * 0.0008;
    };

    window.addEventListener('mousemove', handleMouseMove);

    const handleResize = () => {
      if (!container) return;
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // 4. Animation Loop
    let reqId;
    const animate = () => {
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;

      globe.rotation.y += 0.002;
      globe.rotation.x += 0.001;

      core.rotation.y -= 0.004;
      core.rotation.z += 0.002;

      nodesGroup.rotation.y += 0.001;
      nodesGroup.rotation.x = targetY * 2;
      nodesGroup.rotation.y += targetX * 2;

      scene.rotation.y = targetX * 1.5;
      scene.rotation.x = targetY * 1.5;

      renderer.render(scene, camera);
      reqId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={cn('fixed inset-0 pointer-events-none overflow-hidden z-0', className)}
      aria-hidden="true"
    />
  );
};

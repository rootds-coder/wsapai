import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export const ParticlesBackground = ({
  className,
  quantity = 60,
  staticity = 40,
  ease = 50,
  color = "#8b5cf6",
}) => {
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const context = useRef(null);
  const circles = useRef([]);
  const mouse = useRef({ x: 0, y: 0 });
  const canvasSize = useRef({ w: 0, h: 0 });
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  useEffect(() => {
    if (canvasRef.current) {
      context.current = canvasRef.current.getContext("2d");
    }
    initCanvas();
    animate();
    window.addEventListener("resize", initCanvas);

    return () => {
      window.removeEventListener("resize", initCanvas);
    };
  }, []);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const { clientX, clientY } = e;
        const x = clientX - rect.left - canvasSize.current.w / 2;
        const y = clientY - rect.top - canvasSize.current.h / 2;
        mouse.current.x = x;
        mouse.current.y = y;
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  const initCanvas = () => {
    resizeCanvas();
    drawParticles();
  };

  const resizeCanvas = () => {
    if (canvasContainerRef.current && canvasRef.current && context.current) {
      circles.current = [];
      canvasSize.current.w = canvasContainerRef.current.offsetWidth;
      canvasSize.current.h = canvasContainerRef.current.offsetHeight;
      canvasRef.current.width = canvasSize.current.w * dpr;
      canvasRef.current.height = canvasSize.current.h * dpr;
      canvasRef.current.style.width = `${canvasSize.current.w}px`;
      canvasRef.current.style.height = `${canvasSize.current.h}px`;
      context.current.scale(dpr, dpr);
    }
  };

  const circleParams = () => {
    const x = Math.floor(Math.random() * canvasSize.current.w);
    const y = Math.floor(Math.random() * canvasSize.current.h);
    const translateX = 0;
    const translateY = 0;
    const size = Math.floor(Math.random() * 2) + 1;
    const alpha = 0;
    const targetAlpha = parseFloat((Math.random() * 0.6 + 0.1).toFixed(1));
    const dx = (Math.random() - 0.5) * 0.4;
    const dy = (Math.random() - 0.5) * 0.4;
    const magnetism = 0.1 + Math.random() * 4;
    return {
      x,
      y,
      translateX,
      translateY,
      size,
      alpha,
      targetAlpha,
      dx,
      dy,
      magnetism,
    };
  };

  const drawParticles = () => {
    circles.current = [];
    for (let i = 0; i < quantity; i++) {
      circles.current.push(circleParams());
    }
  };

  const animate = () => {
    clearContext();
    circles.current.forEach((circle, i) => {
      // Handle edge collision
      const edge = [
        circle.x + circle.translateX - circle.size < 0,
        circle.x + circle.translateX + circle.size > canvasSize.current.w,
        circle.y + circle.translateY - circle.size < 0,
        circle.y + circle.translateY + circle.size > canvasSize.current.h,
      ];
      if (edge[0] || edge[1]) circle.dx = -circle.dx;
      if (edge[2] || edge[3]) circle.dy = -circle.dy;

      // Mouse attraction
      circle.x += circle.dx;
      circle.y += circle.dy;
      circle.translateX +=
        (mouse.current.x / (staticity / circle.magnetism) - circle.translateX) /
        ease;
      circle.translateY +=
        (mouse.current.y / (staticity / circle.magnetism) - circle.translateY) /
        ease;

      // Alpha fade in
      if (circle.alpha < circle.targetAlpha) {
        circle.alpha += 0.01;
      }

      drawCircle(circle);
    });
    requestAnimationFrame(animate);
  };

  const clearContext = () => {
    if (context.current) {
      context.current.clearRect(
        0,
        0,
        canvasSize.current.w,
        canvasSize.current.h
      );
    }
  };

  const drawCircle = (circle) => {
    if (context.current) {
      const { x, y, translateX, translateY, size, alpha } = circle;
      context.current.save();
      context.current.beginPath();
      context.current.arc(
        x + translateX,
        y + translateY,
        size,
        0,
        2 * Math.PI,
        false
      );
      context.current.fillStyle = color;
      context.current.globalAlpha = alpha;
      context.current.shadowBlur = 8;
      context.current.shadowColor = color;
      context.current.fill();
      context.current.restore();
    }
  };

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      ref={canvasContainerRef}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  );
};

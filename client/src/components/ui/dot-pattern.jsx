import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export const DotGridHeroBackground = ({ className }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let width = (canvas.width = canvas.parentElement.offsetWidth);
    let height = (canvas.height = canvas.parentElement.offsetHeight);

    const spacing = 32;
    const dots = [];
    const mouse = { x: -1000, y: -1000, radius: 140 };

    const handleResize = () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.offsetWidth;
      height = canvas.height = canvas.parentElement.offsetHeight;
      initDots();
    };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const initDots = () => {
      dots.length = 0;
      for (let x = spacing / 2; x < width; x += spacing) {
        for (let y = spacing / 2; y < height; y += spacing) {
          dots.push({
            baseX: x,
baseY: y,
            x: x,
            y: y,
            size: 1.5,
            baseSize: 1.5,
            color: 'rgba(139, 92, 246, 0.2)',
          });
        }
      }
    };

    initDots();
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      dots.forEach((dot) => {
        const dx = mouse.x - dot.baseX;
        const dy = mouse.y - dot.baseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < mouse.radius) {
          const force = (1 - dist / mouse.radius);
          dot.size = dot.baseSize + force * 3.5;
          ctx.fillStyle = `rgba(167, 139, 250, ${0.25 + force * 0.65})`;
        } else {
          dot.size = dot.baseSize;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        }

        ctx.beginPath();
        ctx.arc(dot.baseX, dot.baseY, dot.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div className={cn('absolute inset-0 pointer-events-none overflow-hidden', className)}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

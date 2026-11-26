'use client';
import { useEffect, useRef } from 'react';
export function Orb({
  input,
  output,
  active = false,
}: {
  input: number;
  output: number;
  active?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const levels = useRef({ input, output, active });
  useEffect(() => {
    levels.current = { input, output, active };
  }, [input, output, active]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let smooth = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const size = 500;
    el.width = size * 2;
    el.height = size * 2;
    ctx.scale(2, 2);
    const draw = (time: number) => {
      const amplitude = Math.max(levels.current.input, levels.current.output);
      smooth += (amplitude - smooth) * 0.14;
      ctx.clearRect(0, 0, size, size);
      const radius = 143 + smooth * 23;
      const rotation = reduced ? 0 : levels.current.active ? time * 0.00007 : 0;
      const glow = ctx.createRadialGradient(250, 240, 55, 250, 250, 240);
      glow.addColorStop(0, 'rgba(39,189,172,.12)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
      const sphere = ctx.createLinearGradient(150, 100, 335, 395);
      sphere.addColorStop(0, '#f68d79');
      sphere.addColorStop(0.36, '#fbe8e1');
      sphere.addColorStop(0.58, '#e9f5ef');
      sphere.addColorStop(1, '#40b5a6');
      ctx.shadowColor = '#60b9ac55';
      ctx.shadowBlur = 24 + smooth * 20;
      ctx.fillStyle = sphere;
      ctx.beginPath();
      ctx.arc(250, 250, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.beginPath();
      ctx.arc(250, 250, radius, 0, Math.PI * 2);
      ctx.clip();
      for (let i = 0; i < 3; i++) {
        const drift = Math.sin(rotation * 8 + i * 2) * (12 + smooth * 24);
        const wave = ctx.createLinearGradient(170, 200, 300, 400);
        wave.addColorStop(0, ['#ed9b8955', '#44bbae77', '#159e9399'][i]);
        wave.addColorStop(1, '#27b5a7aa');
        ctx.fillStyle = wave;
        ctx.beginPath();
        ctx.moveTo(80, 300 + i * 22);
        ctx.bezierCurveTo(190, 160 + drift + i * 35, 280, 375 - i * 42, 420, 225 + drift + i * 24);
        ctx.lineTo(430, 430);
        ctx.lineTo(70, 430);
        ctx.fill();
      }
      const highlight = ctx.createRadialGradient(195, 165, 0, 230, 215, 180);
      highlight.addColorStop(0, '#ffffff77');
      highlight.addColorStop(0.7, '#ffffff00');
      highlight.addColorStop(1, '#ffffff55');
      ctx.fillStyle = highlight;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="orb-wrap" aria-hidden="true">
      <div className="orb-orbit orbit-one" />
      <div className="orb-orbit orbit-two" />
      <canvas ref={canvas} />
      <div className="orb-spark spark-one" />
      <div className="orb-spark spark-two" />
    </div>
  );
}

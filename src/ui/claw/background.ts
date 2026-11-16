// Starfield + spinning black hole behind the arcade cabinet.

export function createBackground(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  const stars = Array.from({ length: 170 }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: Math.random() * 0.8 + 0.2,
    tw: Math.random() * Math.PI * 2,
  }));
  const motes = Array.from({ length: 110 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.2 + Math.random() * 0.6 }));

  function resize(): void {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  resize();

  function draw(t: number): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const st of stars) {
      const x = (((st.x * W + t * 5 * st.z) % W) + W) % W;
      const a = 0.35 + 0.65 * Math.abs(Math.sin(st.tw + t * 1.4 * st.z));
      ctx.fillStyle = `rgba(230,220,255,${a * st.z})`;
      ctx.fillRect(x, st.y * H, st.z * 2, st.z * 2);
    }
    const cx = W * 0.5;
    const cy = H * 0.3;
    const R = Math.max(W, H) * 0.17;
    ctx.save();
    ctx.translate(cx, cy);
    const glow = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 3);
    glow.addColorStop(0, 'rgba(139,43,255,0.4)');
    glow.addColorStop(0.45, 'rgba(255,43,214,0.12)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-R * 3.2, -R * 3.2, R * 6.4, R * 6.4);
    ctx.save();
    ctx.scale(1, 0.3);
    for (let i = 0; i < 5; i++) {
      ctx.rotate(t * (0.2 + i * 0.04) + i);
      ctx.beginPath();
      ctx.arc(0, 0, R * (1.3 + i * 0.25), 0, Math.PI * 1.55);
      ctx.strokeStyle = i % 2 ? 'rgba(0,240,255,0.4)' : 'rgba(255,43,214,0.5)';
      ctx.lineWidth = 7 - i;
      ctx.shadowColor = i % 2 ? '#00f0ff' : '#ff2bd6';
      ctx.shadowBlur = 20;
      ctx.stroke();
    }
    ctx.restore();
    ctx.shadowBlur = 0;
    for (const m of motes) {
      m.a += 0.008 * m.s * (2 - m.r);
      m.r -= 0.0014 * m.s;
      if (m.r < 0.2) {
        m.r = 1;
        m.a = Math.random() * Math.PI * 2;
      }
      const rr = R * (0.5 + m.r * 2.2);
      ctx.fillStyle = `rgba(255,${150 + m.r * 100},255,${0.2 + (1 - m.r) * 0.6})`;
      ctx.fillRect(Math.cos(m.a) * rr, Math.sin(m.a) * rr * 0.32, 2, 2);
    }
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.6);
    core.addColorStop(0, '#000');
    core.addColorStop(0.82, '#000');
    core.addColorStop(1, 'rgba(255,200,255,0.9)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return { resize, draw };
}

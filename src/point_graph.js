(function () {
  'use strict';

  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const homeCamera = { yaw: .4, pitch: -.24, zoom: 1, x: 0, y: 0 };

  function layoutGraph(points, edges) {
    const modules = [...new Set(points.map(point => point.module))];
    const centers = new Map(modules.map((module, i) => {
      const y = (2 * (i + .5) / modules.length - 1);
      const radius = Math.sqrt(1 - y * y) * 145;
      return [module, { x: radius * Math.cos(i * GOLDEN_ANGLE), y: y * 130, z: radius * Math.sin(i * GOLDEN_ANGLE) }];
    }));
    const nodes = points.map((point, i) => {
      const center = centers.get(point.module);
      const angle = i * GOLDEN_ANGLE;
      return {
        ...point, center, x: center.x + Math.sin(angle) * 31, y: center.y + (i % 5 - 2) * 12,
        z: center.z + Math.cos(angle) * 31, vx: 0, vy: 0, vz: 0,
      };
    });
    const maxWeight = Math.max(1, ...edges.map(edge => edge.weight));
    for (let step = 0; step < 180; step++) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const x = a.x - b.x, y = a.y - b.y, z = a.z - b.z;
          const d2 = x * x + y * y + z * z + 36;
          const repulsion = 1650 / (d2 * Math.sqrt(d2));
          a.vx += x * repulsion; a.vy += y * repulsion; a.vz += z * repulsion;
          b.vx -= x * repulsion; b.vy -= y * repulsion; b.vz -= z * repulsion;
        }
      }
      for (const edge of edges) {
        const a = nodes[edge.a], b = nodes[edge.b];
        const x = b.x - a.x, y = b.y - a.y, z = b.z - a.z;
        const distance = Math.hypot(x, y, z) || 1;
        const spring = (distance - 65) / distance * (.008 + .023 * Math.sqrt(edge.weight / maxWeight));
        a.vx += x * spring; a.vy += y * spring; a.vz += z * spring;
        b.vx -= x * spring; b.vy -= y * spring; b.vz -= z * spring;
      }
      for (const node of nodes) {
        node.vx = (node.vx + (node.center.x - node.x) * .004 - node.x * .0008) * .79;
        node.vy = (node.vy + (node.center.y - node.y) * .004 - node.y * .0008) * .79;
        node.vz = (node.vz + (node.center.z - node.z) * .004 - node.z * .0008) * .79;
        node.x += clamp(node.vx, -13, 13);
        node.y += clamp(node.vy, -13, 13);
        node.z += clamp(node.vz, -13, 13);
      }
    }
    return nodes;
  }

  function mountPointGraph(canvas, status, points, edges, openPoint) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      status.textContent = '当前浏览器无法绘制图谱，可从下方列表打开考点。';
      return null;
    }
    const nodes = layoutGraph(points, edges);
    const initial = nodes.map(({ x, y, z }) => ({ x, y, z }));
    const radius = Math.max(1, ...nodes.map(node => Math.hypot(node.x, node.y, node.z)));
    const distance = radius * 3.5;
    const maxWeight = Math.max(1, ...edges.map(edge => edge.weight));
    const camera = { ...homeCamera };
    const pointers = new Map();
    let width = 1, height = 1, projected = [], hover = -1, frame = 0, gesture = null;

    function project() {
      const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
      const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
      const scale = Math.min(width * .43, height * .40) / radius * camera.zoom;
      const stretch = clamp(1 + (width / height - 1) * .16, 1, 1.27);
      return nodes.map(node => {
        const x = node.x * cy - node.z * sy;
        const z = node.x * sy + node.z * cy;
        const y = node.y * cp - z * sp, depth = node.y * sp + z * cp;
        const perspective = distance / Math.max(distance * .33, distance - depth);
        const factor = scale * perspective;
        return {
          x: width / 2 + camera.x + x * factor * stretch, y: height / 2 + camera.y + y * factor,
          depth, perspective, factor, stretch,
          r: clamp((3.8 + Math.min(5.2, Math.log1p(node.count))) * perspective * Math.sqrt(camera.zoom), 2.8, 19),
        };
      });
    }

    function draw() {
      frame = 0;
      projected = project();
      const order = nodes.map((_, i) => i).sort((a, b) => projected[a].depth - projected[b].depth);
      const active = new Set(hover < 0 ? [] : [hover]);
      ctx.clearRect(0, 0, width, height);
      for (const edge of edges) {
        const a = projected[edge.a], b = projected[edge.b];
        const near = edge.a === hover || edge.b === hover;
        if (near) { active.add(edge.a); active.add(edge.b); }
        const weight = Math.sqrt(edge.weight / maxWeight);
        ctx.strokeStyle = near ? nodes[hover].color : '#a79ab6';
        ctx.globalAlpha = near ? .65 : (hover < 0 ? .1 + weight * .24 : .045);
        ctx.lineWidth = near ? 1.25 + weight : .55 + weight * .85;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (const index of order) {
        const node = nodes[index], dot = projected[index];
        const focused = index === hover, nearby = active.has(index);
        ctx.globalAlpha = hover >= 0 && !nearby ? .28 : clamp(.58 + (dot.perspective - 1) * .75, .42, .95);
        if (focused) {
          ctx.fillStyle = node.color;
          ctx.globalAlpha = .16;
          ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.r + 7, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = node.color;
        ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.globalAlpha *= .29;
        ctx.beginPath(); ctx.arc(dot.x - dot.r * .26, dot.y - dot.r * .28, dot.r * .32, 0, Math.PI * 2); ctx.fill();
        if (node.mastery != null || focused) {
          ctx.globalAlpha = focused || hover < 0 || nearby ? .95 : .23;
          ctx.lineWidth = 1.3;
          ctx.strokeStyle = focused ? '#f8eee9' : node.mastery >= .8 ? '#84d7aa' : node.mastery >= .6 ? '#f1b281' : '#ff9ca9';
          ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.r + 2.3, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.textBaseline = 'middle';
      const placed = [];
      // Prefer the focused node and the foreground when labels would overlap.
      const priority = index => index === hover ? 2 : Number(active.has(index));
      const labels = order.slice().reverse().sort((a, b) => priority(b) - priority(a));
      for (const index of labels) {
        if (hover >= 0 && !active.has(index)) continue;
        const dot = projected[index], node = nodes[index], focused = index === hover;
        const label = focused ? node.name : node.id;
        ctx.font = focused ? '600 13px sans-serif' : '10px monospace';
        const textWidth = ctx.measureText(label).width;
        const right = dot.x + dot.r + 6;
        const x = right + textWidth + 7 < width ? right : dot.x - dot.r - textWidth - 6;
        const y = dot.y;
        if (x < 4 || x + textWidth > width - 4 || y < 8 || y > height - 8) continue;
        if (!focused && placed.some(item => Math.abs(item.y - y) < 13 && x < item.right + 4 && item.x < x + textWidth + 4)) continue;
        placed.push({ x, y, right: x + textWidth });
        ctx.globalAlpha = focused ? 1 : clamp(.66 + (dot.perspective - 1) * .45, .52, .9);
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#121117';
        ctx.strokeText(label, x, y);
        ctx.fillStyle = focused ? '#faf0eb' : '#d0c4d6';
        ctx.fillText(label, x, y);
      }
      ctx.globalAlpha = 1;
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(draw);
    }

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const pixelRatio = clamp(window.devicePixelRatio || 1, 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      schedule();
    }

    function location(event) {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    function hit(point) {
      let best = -1, depth = -Infinity;
      for (let i = 0; i < projected.length; i++) {
        const dot = projected[i];
        if (dot.depth > depth && Math.hypot(point.x - dot.x, point.y - dot.y) <= Math.max(10, dot.r + 4)) {
          best = i; depth = dot.depth;
        }
      }
      return best;
    }

    function setHover(index) {
      if (index === hover) return;
      hover = index;
      const node = nodes[index];
      status.textContent = node ? node.id + ' ' + node.name + ' · ' + node.count + ' 题 · ' +
        (node.mastery == null ? '未练' : '正确率 ' + Math.round(node.mastery * 100) + '%') : '';
      canvas.classList.toggle('over-node', index >= 0);
      schedule();
    }

    function zoom(factor, x = width / 2, y = height / 2) {
      const next = clamp(camera.zoom * factor, .55, 3.1);
      const ratio = next / camera.zoom;
      camera.x = x - width / 2 - (x - width / 2 - camera.x) * ratio;
      camera.y = y - height / 2 - (y - height / 2 - camera.y) * ratio;
      camera.zoom = next;
      schedule();
    }

    function reset() {
      Object.assign(camera, homeCamera);
      nodes.forEach((node, i) => Object.assign(node, initial[i]));
      setHover(-1);
      schedule();
    }

    function moveNode(index, dx, dy) {
      const dot = projected[index], node = nodes[index];
      const x = dx / (dot.factor * dot.stretch), y = dy / dot.factor;
      const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
      const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
      const limit = radius * 1.65;
      node.x = clamp(node.x + x * cy - y * sp * sy, -limit, limit);
      node.y = clamp(node.y + y * cp, -limit, limit);
      node.z = clamp(node.z - x * sy - y * sp * cy, -limit, limit);
    }

    function pinch(points) {
      const [a, b] = points;
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, gap: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
    }

    function pointerDown(event) {
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
      const point = location(event);
      pointers.set(event.pointerId, point);
      canvas.setPointerCapture?.(event.pointerId);
      if (pointers.size > 1) {
        gesture = null;
        setHover(-1);
      } else {
        const node = event.shiftKey || event.button !== 0 ? -1 : hit(point);
        gesture = { point, previous: point, node, moved: false, pan: event.shiftKey || event.button !== 0 };
        setHover(node);
      }
      canvas.classList.add('dragging');
    }

    function pointerMove(event) {
      const point = location(event);
      if (!pointers.has(event.pointerId)) {
        if (!pointers.size && event.pointerType !== 'touch') setHover(hit(point));
        return;
      }
      const old = pointers.size > 1 ? pinch(pointers.values()) : null;
      pointers.set(event.pointerId, point);
      if (old) {
        const next = pinch(pointers.values());
        camera.x += next.x - old.x;
        camera.y += next.y - old.y;
        zoom(next.gap / old.gap, next.x, next.y);
        return;
      }
      if (!gesture || (!gesture.moved && Math.hypot(point.x - gesture.point.x, point.y - gesture.point.y) < 4)) return;
      const dx = point.x - gesture.previous.x, dy = point.y - gesture.previous.y;
      gesture.previous = point;
      gesture.moved = true;
      if (gesture.node >= 0) moveNode(gesture.node, dx, dy);
      else if (gesture.pan) { camera.x += dx; camera.y += dy; }
      else {
        camera.yaw += dx * .009;
        camera.pitch = clamp(camera.pitch - dy * .009, -1.48, 1.48);
      }
      schedule();
    }

    function pointerEnd(event) {
      if (!pointers.delete(event.pointerId)) return;
      const clicked = event.type === 'pointerup' && gesture && !gesture.moved && gesture.node >= 0 ? gesture.node : -1;
      gesture = null;
      if (pointers.size === 1) {
        const [point] = pointers.values();
        gesture = { point, previous: point, node: -1, moved: true, pan: false };
      } else if (!pointers.size) {
        canvas.classList.remove('dragging');
      }
      if (clicked >= 0) openPoint(nodes[clicked].id);
    }

    const handlers = [
      ['pointerdown', pointerDown], ['pointermove', pointerMove], ['pointerup', pointerEnd],
      ['pointercancel', pointerEnd], ['lostpointercapture', pointerEnd],
      ['pointerleave', () => { if (!pointers.size) setHover(-1); }],
      ['contextmenu', event => event.preventDefault()],
      ['wheel', event => {
        event.preventDefault();
        const { x, y } = location(event);
        const step = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * height : event.deltaY;
        zoom(Math.exp(-clamp(step, -120, 120) * .003), x, y);
      }, { passive: false }],
      ['keydown', event => {
        if (event.key === '+' || event.key === '=') zoom(1.2);
        else if (event.key === '-') zoom(1 / 1.2);
        else if (event.key === '0' || event.key === 'Home') reset();
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') camera.yaw += event.key === 'ArrowLeft' ? -.16 : .16;
        else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') camera.pitch = clamp(camera.pitch + (event.key === 'ArrowUp' ? -.16 : .16), -1.48, 1.48);
        else return;
        event.preventDefault();
        schedule();
      }],
    ];
    handlers.forEach(args => canvas.addEventListener(...args));
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas); else window.addEventListener('resize', resize);
    resize();

    return {
      zoom, reset,
      destroy() {
        if (frame) window.cancelAnimationFrame(frame);
        handlers.forEach(args => canvas.removeEventListener(...args));
        if (observer) observer.disconnect(); else window.removeEventListener('resize', resize);
      },
    };
  }

  window.mountPointGraph = mountPointGraph;
})();

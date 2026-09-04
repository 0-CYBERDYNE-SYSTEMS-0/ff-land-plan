import * as THREE from 'three';

export interface PerfHUD {
  visible: boolean;
  update: (renderer: THREE.WebGLRenderer, dt: number) => void;
  dispose: () => void;
}

/** Creates a lightweight FPS counter + draw-call display in the corner of the canvas. */
export function createPerfHUD(canvas: HTMLCanvasElement): PerfHUD {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '4px';
  container.style.right = '4px';
  container.style.padding = '4px 8px';
  container.style.background = 'rgba(0,0,0,0.7)';
  container.style.color = '#0f0';
  container.style.fontFamily = 'monospace';
  container.style.fontSize = '11px';
  container.style.lineHeight = '1.4';
  container.style.borderRadius = '4px';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '100';
  container.style.display = 'none';
  container.textContent = 'FPS: -- | Draws: --';

  const parent = canvas.parentElement;
  if (parent) {
    parent.style.position = 'relative';
    parent.appendChild(container);
  }

  let fps = 0;
  let frameCount = 0;
  let elapsed = 0;

  let visible = false;

  function update(renderer: THREE.WebGLRenderer, dt: number) {
    frameCount++;
    elapsed += dt;
    if (elapsed >= 1) {
      fps = Math.round(frameCount / elapsed);
      frameCount = 0;
      elapsed = 0;
    }

    const info = renderer.info;
    container.textContent = `FPS: ${fps} | Draws: ${info.render.calls} | Tris: ${info.render.triangles}`;
  }

  function dispose() {
    if (container.parentNode) container.parentNode.removeChild(container);
  }

  return {
    get visible() { return visible; },
    set visible(v: boolean) {
      visible = v;
      container.style.display = v ? 'block' : 'none';
    },
    update,
    dispose,
  };
}

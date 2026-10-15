import type { Size } from '../render/camera';

/**
 * The real visible size. iOS standalone apps report wrong `vh` units
 * (WebKit bug 316008), so we measure `visualViewport` and publish it as
 * --app-w / --app-h for CSS.
 */
export function viewportSize(): Size {
  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

export function isPortrait(size: Size): boolean {
  return size.height > size.width;
}

export function watchViewport(onChange: (size: Size) => void): void {
  let frame = 0;
  const update = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const size = viewportSize();
      document.documentElement.style.setProperty('--app-w', `${size.width}px`);
      document.documentElement.style.setProperty('--app-h', `${size.height}px`);
      onChange(size);
    });
  };
  window.visualViewport?.addEventListener('resize', update);
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  update();
}

import { useRef, useEffect } from 'react';

/**
 * Enables "click-and-drag to scroll" on a horizontally overflowing element.
 *
 * Returns a ref to attach to the *container*. The element that actually scrolls
 * can be the container itself, or a descendant matched by `innerSelector` (handy
 * for MUI <Tabs variant="scrollable">, whose real scroller is `.MuiTabs-scroller`).
 *
 * Touch devices already scroll the overflow natively, so this only wires up the
 * mouse (pointer) drag. A drag that actually moves is swallowed on the trailing
 * `click` so it doesn't also select the tab/button it ended on.
 *
 * `deps` lets callers re-bind once the scrollable node appears (e.g. tabs that
 * mount only after some state flips).
 */
export default function useDragScroll(innerSelector = null, deps = []) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const el = innerSelector ? root.querySelector(innerSelector) : root;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    const onDown = (e) => {
      isDown = true;
      moved = false;
      startX = e.pageX;
      startScroll = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    };
    const onMove = (e) => {
      if (!isDown) return;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 4) moved = true;
      el.scrollLeft = startScroll - dx;
    };
    const onUp = () => {
      isDown = false;
      el.style.cursor = 'grab';
      el.style.userSelect = '';
    };
    // Capture phase so we can cancel the click before the tab/button handles it,
    // but only when the pointer genuinely dragged.
    const onClickCapture = (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    };

    el.style.cursor = 'grab';
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('click', onClickCapture, true);
      el.style.cursor = '';
      el.style.userSelect = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [innerSelector, ...deps]);

  return rootRef;
}

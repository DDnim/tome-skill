// What is drawn over the canvas (frames, pins) follows the view: this tells
// those layers to draw again.
import { useEffect, useState } from "react";

export const overlayBus = { listeners: new Set(), emit() { this.listeners.forEach((f) => f()); } };

/** Draws the calling layer again (at most once a frame) when the view moved or the drawing changed. */
export function useRedraw() {
  const [, redraw] = useState(0);
  useEffect(() => {
    let frame = 0;
    const f = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => redraw((n) => n + 1));
    };
    overlayBus.listeners.add(f);
    return () => {
      cancelAnimationFrame(frame);
      overlayBus.listeners.delete(f);
    };
  }, []);
}

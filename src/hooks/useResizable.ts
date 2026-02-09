import { useState, useCallback, useEffect, useRef } from "react";

interface UseResizableOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  side: "left" | "right";
}

export function useResizable({ initialWidth, minWidth, maxWidth, side }: UseResizableOptions) {
  const [width, setWidth] = useState(initialWidth);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width]
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = side === "left"
        ? startWidth.current + delta
        : startWidth.current - delta;
      setWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    }

    function onMouseUp() {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [minWidth, maxWidth, side]);

  return { width, handleMouseDown };
}

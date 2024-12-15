import { createSignal, createEffect, onMount } from "solid-js";

export default function Canvas() {
  let canvasRef;

  const [mousePosition, setMousePosition] = createSignal({ x: 0, y: 0 });

  const [isHoveringOverBlock, setIsHoveringOverBlock] = createSignal(false);

  const [isMouseDown, setIsMouseDown] = createSignal(false);
  const [blockBeingDragged, setBlockBeingDragged] = createSignal<{
    id: string;
    initialX: number;
    initialY: number;
  }>({ id: "", initialX: 0, initialY: 0 });
  const [snappedBlocksBeingDragged, setSnappedBlocksBeingDragged] =
    createSignal<
      {
        id: string;
        initialX: number;
        initialY: number;
      }[]
    >([]);

  const [blockPositions, setBlockPositions] = createSignal<
    {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      snappedToBlock?: {
        id: string;
        side: "top" | "bottom";
      };
    }[]
  >([
    { id: "1", x: 0, y: 0, width: 200, height: 50, color: "red" },
    { id: "2", x: 200, y: 70, width: 200, height: 50, color: "blue" },
    { id: "3", x: 300, y: 170, width: 200, height: 50, color: "green" },
  ]);

  const [mouseOffset, setMouseOffset] = createSignal({ x: 0, y: 0 });
  const [fps, setFps] = createSignal(0);

  let lastFrameTime = performance.now();
  let frameCount = 0;

  function calculateFPS() {
    const now = performance.now();
    frameCount++;
    if (now - lastFrameTime >= 1000) {
      setFps(frameCount);
      frameCount = 0;
      lastFrameTime = now;
    }
  }

  function draw(canvas: HTMLCanvasElement) {
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the blocks
    for (const block of blockPositions()) {
      ctx.fillStyle = block.color;
      ctx.fillRect(block.x, block.y, block.width, block.height);
    }
    // ctx.fillStyle = isMouseDown() ? "blue" : "red";
    // const { x, y } = rectanglePosition();
    // ctx.fillRect(x, y, 100, 100);

    // Draw FPS and mouse coordinates
    ctx.fillStyle = "black";
    ctx.font = "16px Arial";
    ctx.fillText(`FPS: ${fps()}`, 10, canvas.height - 10);
  }

  function animationLoop(canvas: HTMLCanvasElement) {
    if (canvas) {
      draw(canvas);
    }
    calculateFPS();
    requestAnimationFrame(() => animationLoop(canvas));
  }

  function handleMouseDown() {
    for (const block of blockPositions()) {
      const isMouseInsideBlock = isPointInsideRect(
        mousePosition().x,
        mousePosition().y,
        block
      );
      const mouseOffset = {
        x: mousePosition().x - block.x,
        y: mousePosition().y - block.y,
      };

      if (isMouseInsideBlock) {
        setMouseOffset({
          x: mouseOffset.x,
          y: mouseOffset.y,
        });
        setBlockBeingDragged({
          id: block.id,
          initialX: block.x,
          initialY: block.y,
        });
        setSnappedBlocksBeingDragged(
          getBottomSnappedBlocks(block.id).map((id) => {
            const snappedBlock = blockPositions().find(
              (block) => block.id === id
            );
            return {
              id,
              initialX: snappedBlock?.x || 0,
              initialY: snappedBlock?.y || 0,
            };
          })
        );
        setIsMouseDown(true);
        return;
      }
    }

    setBlockBeingDragged({ id: "", initialX: 0, initialY: 0 });
    setSnappedBlocksBeingDragged([]);
    setIsMouseDown(true);
  }

  function detectIfHoveringOverBlock() {
    for (const block of blockPositions()) {
      const isMouseInsideBlock = isPointInsideRect(
        mousePosition().x,
        mousePosition().y,
        block
      );
      if (isMouseInsideBlock) {
        setIsHoveringOverBlock(true);
        return;
      }
    }
    setIsHoveringOverBlock(false);
  }

  function handleMouseMove(e: MouseEvent) {
    const canvasRect = (
      e.currentTarget as HTMLCanvasElement
    ).getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const mouseY = e.clientY - canvasRect.top;

    setMousePosition({ x: mouseX, y: mouseY });

    detectIfHoveringOverBlock();

    if (!isMouseDown()) return;

    // Update block positions
    setBlockPositions((prev) =>
      prev.map((block) => {
        if (blockBeingDragged().id === block.id) {
          return {
            ...block,
            x: mouseX - mouseOffset().x,
            y: mouseY - mouseOffset().y,
          };
        }
        return block;
      })
    );
    // update the position of the snapped blocks
    snappedBlocksBeingDragged().forEach((snappedBlock) => {
      setBlockPositions((prev) =>
        prev.map((block) => {
          if (block.id === snappedBlock.id) {
            const activeBlock = blockPositions().find(
              (block) => block.id === blockBeingDragged().id
            );

            if (!activeBlock) return block;

            const translation = {
              x: activeBlock.x - blockBeingDragged().initialX,
              y: activeBlock.y - blockBeingDragged().initialY,
            };

            // use the initial position of the block being dragged to calculate the offset then apply that offset to the snapped block

            return {
              ...block,
              x: activeBlock.x,
              y: snappedBlock.initialY + translation.y,
            };
          }
          return block;
        })
      );
    });
  }

  function detectSnapCollision() {
    const activeBlock = blockPositions().find(
      (block) => block.id === blockBeingDragged().id
    );

    if (!activeBlock) return;

    const activeBlockRect = {
      x: activeBlock.x,
      y: activeBlock.y,
      width: activeBlock.width,
      height: activeBlock.height,
    };

    for (const stationaryBlock of blockPositions()) {
      if (stationaryBlock.id === activeBlock.id) continue;

      const stationaryBlockRect = {
        x: stationaryBlock.x,
        y: stationaryBlock.y,
        width: stationaryBlock.width,
        height: stationaryBlock.height,
      };

      const collision = detectRectCollision(
        activeBlockRect,
        stationaryBlockRect
      );

      if (collision) {
        return {
          newActiveBlock: {
            ...activeBlock,
            x: stationaryBlock.x,
            y:
              collision.side === "top"
                ? stationaryBlock.y - activeBlock.height
                : stationaryBlock.y + stationaryBlock.height,
            snappedToBlock:
              collision.side === "top"
                ? activeBlock.snappedToBlock || undefined
                : {
                    id: stationaryBlock.id,
                    side: collision.side,
                  },
          },
          newStationaryBlock: {
            ...stationaryBlock,
            snappedToBlock:
              collision.side === "bottom"
                ? stationaryBlock.snappedToBlock || undefined
                : {
                    id: activeBlock.id,
                    side: "bottom",
                  },
          },
        };
      }
    }

    return null;
  }

  function handleMouseUp() {
    const activeBlock = blockPositions().find(
      (block) => block.id === blockBeingDragged().id
    );

    if (activeBlock?.snappedToBlock) {
      // cancel the move since it's snapped, keep the snap
      const unsnap =
        Math.abs(blockBeingDragged().initialX - activeBlock.x) > 10 ||
        Math.abs(blockBeingDragged().initialY - activeBlock.y) > 10;

      if (unsnap) {
        // unsnap the block and keep it's original position
        setBlockPositions((prev) =>
          prev.map((block) => {
            if (block.id === blockBeingDragged().id) {
              return {
                ...block,
                snappedToBlock: undefined,
              };
            }
            return block;
          })
        );
      } else {
        // reset the block to its initial position
        setBlockPositions((prev) =>
          prev.map((block) => {
            if (block.id === blockBeingDragged().id) {
              return {
                ...block,
                x: blockBeingDragged().initialX,
                y: blockBeingDragged().initialY,
              };
            }
            return block;
          })
        );
      }
    } else {
      // detect a collision if the active block is not snapped
      const collision = detectSnapCollision();
      if (collision) {
        setBlockPositions((prev) =>
          prev.map((block) => {
            if (block.id === blockBeingDragged().id) {
              return collision.newActiveBlock;
            }
            if (block.id === collision.newStationaryBlock.id) {
              return collision.newStationaryBlock as any;
            }
            return block;
          })
        );
      }
    }

    setIsMouseDown(false);
    setBlockBeingDragged({ id: "", initialX: 0, initialY: 0 });
  }

  function isPointInsideRect(
    x: number,
    y: number,
    rect: { x: number; y: number; width: number; height: number }
  ) {
    return (
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    );
  }

  function detectRectCollision(
    activeRect: { x: number; y: number; width: number; height: number },
    stationaryRect: { x: number; y: number; width: number; height: number }
  ): { side: "top" | "bottom" } | null {
    const tolerance = 10;

    // Check for horizontal overlap
    const horizontallyAligned =
      activeRect.x + activeRect.width >= stationaryRect.x - tolerance &&
      activeRect.x <= stationaryRect.x + stationaryRect.width + tolerance;

    if (!horizontallyAligned) {
      return null; // No horizontal alignment, so no collision
    }

    // Check for snapping to the top
    const snappingToTop =
      Math.abs(activeRect.y + activeRect.height - stationaryRect.y) <=
      tolerance;
    if (snappingToTop) {
      return { side: "top" };
    }

    // Check for snapping to the bottom
    const snappingToBottom =
      Math.abs(activeRect.y - (stationaryRect.y + stationaryRect.height)) <=
      tolerance;
    if (snappingToBottom) {
      return { side: "bottom" };
    }

    // No collision detected
    return null;
  }

  function getBottomSnappedBlocks(activeBlockId: string) {
    const result: string[] = [];

    function findSnappedBlocks(currentBlockId: string) {
      // Find all blocks snapped to the bottom of the current block
      const snappedBlocks = blockPositions().filter(
        (block) =>
          block.snappedToBlock &&
          block.snappedToBlock.id === currentBlockId &&
          block.snappedToBlock.side === "bottom"
      );

      // Add their IDs to the result and recurse for each
      snappedBlocks.forEach((block) => {
        result.push(block.id);
        findSnappedBlocks(block.id);
      });
    }

    // Start the recursion with the activeBlockId
    findSnappedBlocks(activeBlockId);

    return result;
  }

  onMount(() => {
    if (!canvasRef) return;
    animationLoop(canvasRef);
  });

  return (
    <div>
      <canvas
        style={{
          border: "1px solid black",
          cursor:
            isMouseDown() && blockBeingDragged().id
              ? "move"
              : isHoveringOverBlock()
              ? "pointer"
              : "auto",
        }}
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        width="800"
        height="600"
      ></canvas>
      <pre>
        {JSON.stringify(
          {
            mousePosition: mousePosition(),
            isHoveringOverBlock: isHoveringOverBlock(),
            isMouseDown: isMouseDown(),
            blockBeingDragged: blockBeingDragged(),
            blockPositions: blockPositions(),
            mouseOffset: mouseOffset(),
          },
          null,
          2
        )}
      </pre>
    </div>
  );
}

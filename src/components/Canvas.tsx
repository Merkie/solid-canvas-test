import { createSignal, onMount } from "solid-js";

type Block = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  nextBlockId?: string;
};

type DragState = {
  blockId: string;
  stackIds: string[];
  offset: { x: number; y: number };
};

type BlockCollision = {
  blockId: string;
  collidingWithId: string;
  side: "top" | "bottom";
};

export default function Canvas() {
  let canvasRef: HTMLCanvasElement | undefined;

  // Core state
  const [blocks, setBlocks] = createSignal<Block[]>([
    { id: "1", x: 0, y: 0, width: 200, height: 50, color: "red" },
    { id: "2", x: 200, y: 70, width: 200, height: 50, color: "blue" },
    { id: "3", x: 300, y: 170, width: 200, height: 50, color: "green" },
  ]);

  const [dragState, setDragState] = createSignal<DragState | null>(null);
  const [mousePos, setMousePos] = createSignal({ x: 0, y: 0 });
  const [hoveredBlockId, setHoveredBlockId] = createSignal<string | null>(null);
  const [activeCollisions, setActiveCollisions] = createSignal<
    BlockCollision[]
  >([]);

  // Block relationship utilities
  const getBlockById = (id: string) => blocks().find((b) => b.id === id);
  const getBlockAbove = (blockId: string) =>
    blocks().find((b) => b.nextBlockId === blockId);

  const getConnectedBlocksBelow = (blockId: string): string[] => {
    const result: string[] = [];
    let currentId = getBlockById(blockId)?.nextBlockId;

    while (currentId) {
      result.push(currentId);
      currentId = getBlockById(currentId)?.nextBlockId;
    }

    return result;
  };

  // Find the bottom-most block in a chain
  const findLastConnectedBlock = (startBlockId: string): Block | undefined => {
    let currentBlock = getBlockById(startBlockId);
    while (currentBlock?.nextBlockId) {
      const nextBlock = getBlockById(currentBlock.nextBlockId);
      if (!nextBlock) break;
      currentBlock = nextBlock;
    }
    return currentBlock;
  };

  // Collision detection
  const isPointInBlock = (x: number, y: number, block: Block) =>
    x >= block.x &&
    x <= block.x + block.width &&
    y >= block.y &&
    y <= block.y + block.height;

  const getSnapCollision = (active: Block, target: Block) => {
    const tolerance = 20; // Increased tolerance for easier snapping
    const horizontalOverlap =
      Math.min(
        Math.abs(active.x - target.x),
        Math.abs(active.x + active.width - (target.x + target.width))
      ) <= tolerance;

    if (!horizontalOverlap) return null;

    // Check for top snap
    if (Math.abs(active.y + active.height - target.y) <= tolerance) {
      return "top";
    }
    // Check for bottom snap
    if (Math.abs(active.y - (target.y + target.height)) <= tolerance) {
      return "bottom";
    }
    return null;
  };

  // Detect all block collisions
  const detectAllCollisions = () => {
    const collisions: BlockCollision[] = [];
    const blocksList = blocks();

    for (let i = 0; i < blocksList.length; i++) {
      for (let j = i + 1; j < blocksList.length; j++) {
        const blockA = blocksList[i];
        const blockB = blocksList[j];

        const collision = getSnapCollision(blockA, blockB);
        if (collision) {
          collisions.push({
            blockId: blockA.id,
            collidingWithId: blockB.id,
            side: collision as "top" | "bottom",
          });
        }

        const reverseCollision = getSnapCollision(blockB, blockA);
        if (reverseCollision) {
          collisions.push({
            blockId: blockB.id,
            collidingWithId: blockA.id,
            side: reverseCollision as "top" | "bottom",
          });
        }
      }
    }

    return collisions;
  };

  // Block movement and connections
  const moveBlock = (blockId: string, newX: number, newY: number) => {
    setBlocks((prev) => {
      const updated = [...prev];
      const blockIndex = updated.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return prev;

      // Update the target block
      updated[blockIndex] = {
        ...updated[blockIndex],
        x: newX,
        y: newY,
      };

      // Move all blocks above to align with the x position
      let currentAboveId = getBlockAbove(blockId)?.id;
      let currentY = newY;

      while (currentAboveId) {
        const index = updated.findIndex((b) => b.id === currentAboveId);
        if (index === -1) break;

        currentY -= updated[index].height;
        updated[index] = {
          ...updated[index],
          x: newX,
          y: currentY,
        };

        currentAboveId = getBlockAbove(currentAboveId)?.id;
      }

      // Move all blocks below to align with the x position
      let currentBelowId = updated[blockIndex].nextBlockId;
      currentY = newY + updated[blockIndex].height;

      while (currentBelowId) {
        const index = updated.findIndex((b) => b.id === currentBelowId);
        if (index === -1) break;

        updated[index] = {
          ...updated[index],
          x: newX,
          y: currentY,
        };

        currentY += updated[index].height;
        currentBelowId = updated[index].nextBlockId;
      }

      return updated;
    });
  };

  const connectBlocks = (topBlockId: string, bottomBlockId: string) => {
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.id === topBlockId) {
          return { ...block, nextBlockId: bottomBlockId };
        }
        return block;
      })
    );
  };

  const disconnectBlock = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.nextBlockId === blockId) {
          return { ...block, nextBlockId: undefined };
        }
        return block;
      })
    );
  };

  // Event handlers
  const handleMouseMove = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    // Update hover state
    const hoveredBlock = blocks().find((block) => isPointInBlock(x, y, block));
    setHoveredBlockId(hoveredBlock?.id ?? null);

    // Update drag state and check collisions
    if (dragState()) {
      const { blockId, offset } = dragState()!;
      moveBlock(blockId, x - offset.x, y - offset.y);
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    const clickedBlock = blocks().find((block) =>
      isPointInBlock(mousePos().x, mousePos().y, block)
    );

    if (!clickedBlock) {
      setActiveCollisions([]);
      return;
    }

    // Detect all current collisions
    const collisions = detectAllCollisions();
    setActiveCollisions(collisions);

    // Disconnect from block above if exists
    disconnectBlock(clickedBlock.id);

    // Set up drag state with clicked block and its stack
    const stackIds = [
      clickedBlock.id,
      ...getConnectedBlocksBelow(clickedBlock.id),
    ];
    setDragState({
      blockId: clickedBlock.id,
      stackIds,
      offset: {
        x: mousePos().x - clickedBlock.x,
        y: mousePos().y - clickedBlock.y,
      },
    });
  };

  const handleMouseUp = () => {
    if (!dragState()) return;

    const stackBlocks = dragState()!
      .stackIds.map((id) => blocks().find((b) => b.id === id))
      .filter((b): b is NonNullable<typeof b> => b !== undefined);

    if (stackBlocks.length === 0) {
      setDragState(null);
      setActiveCollisions([]);
      return;
    }

    let didSnap = false;

    // Get first (top) and last (bottom) blocks of our stack
    const firstStackBlock = stackBlocks[0];
    const lastStackBlock = stackBlocks[stackBlocks.length - 1];

    // Check for collisions with non-stack blocks
    for (const targetBlock of blocks()) {
      if (dragState()!.stackIds.includes(targetBlock.id)) continue;

      // Check if we're snapping from above (our last block to target's top)
      const topSnap = getSnapCollision(lastStackBlock, targetBlock);
      if (topSnap === "top") {
        didSnap = true;
        // Align with target
        moveBlock(
          lastStackBlock.id,
          targetBlock.x,
          targetBlock.y - lastStackBlock.height
        );
        // Connect our last block to target
        connectBlocks(lastStackBlock.id, targetBlock.id);
        break;
      }

      // Find last block in target's chain for bottom snapping
      const lastTargetBlock = findLastConnectedBlock(targetBlock.id);
      if (lastTargetBlock) {
        // Check if we're snapping to bottom (our first block to target's bottom)
        const bottomSnap = getSnapCollision(firstStackBlock, lastTargetBlock);
        if (bottomSnap === "bottom") {
          didSnap = true;
          // Calculate position relative to last target block
          const newY = lastTargetBlock.y + lastTargetBlock.height;
          // Move our first block to snap position
          moveBlock(firstStackBlock.id, lastTargetBlock.x, newY);
          // Connect last target block to our first block
          connectBlocks(lastTargetBlock.id, firstStackBlock.id);
          break;
        }
      }
    }

    setDragState(null);
    setActiveCollisions([]);
  };

  // Canvas rendering
  const draw = () => {
    const ctx = canvasRef?.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasRef!.width, canvasRef!.height);

    // Draw blocks
    for (const block of blocks().sort((a, b) => {
      if (dragState() && dragState()!.stackIds.includes(a.id)) return 1;
      if (dragState() && dragState()!.stackIds.includes(b.id)) return -1;
      return 0;
    })) {
      ctx.fillStyle = block.color;
      ctx.fillRect(block.x, block.y, block.width, block.height);

      // Draw collision indicators
      const collisions = activeCollisions().filter(
        (c) => c.blockId === block.id || c.collidingWithId === block.id
      );

      if (collisions.length > 0) {
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 2;
        ctx.strokeRect(block.x, block.y, block.width, block.height);
      }
    }

    // Request next frame
    requestAnimationFrame(draw);
  };

  onMount(() => {
    if (canvasRef) draw();
  });

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{
          border: "1px solid black",
          cursor: dragState()
            ? "move"
            : hoveredBlockId()
            ? "pointer"
            : "default",
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />
      <pre>
        {JSON.stringify(
          {
            mousePos: mousePos(),
            hoveredBlockId: hoveredBlockId(),
            dragState: dragState(),
            blocks: blocks(),
            collisions: activeCollisions(),
          },
          null,
          2
        )}
      </pre>
    </div>
  );
}

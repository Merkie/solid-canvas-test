import { createSignal, onMount, For } from "solid-js";

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
  let containerRef;

  // Core state
  const [blocks, setBlocks] = createSignal<Block[]>([
    { id: "1", x: 0, y: 0, width: 200, height: 50, color: "red" },
    { id: "2", x: 200, y: 70, width: 200, height: 50, color: "blue" },
    { id: "3", x: 300, y: 170, width: 200, height: 50, color: "green" },
    { id: "4", x: 400, y: 270, width: 200, height: 50, color: "purple" },
    { id: "5", x: 500, y: 370, width: 200, height: 50, color: "orange" },
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
    const tolerance = 20;
    const horizontalOverlap =
      Math.min(
        Math.abs(active.x - target.x),
        Math.abs(active.x + active.width - (target.x + target.width))
      ) <= tolerance;

    if (!horizontalOverlap) return null;

    if (Math.abs(active.y + active.height - target.y) <= tolerance) {
      return "top";
    }
    if (Math.abs(active.y - (target.y + target.height)) <= tolerance) {
      return "bottom";
    }
    return null;
  };

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

      updated[blockIndex] = {
        ...updated[blockIndex],
        x: newX,
        y: newY,
      };

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
    const rect = (
      containerRef as unknown as HTMLDivElement
    )?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    const hoveredBlock = blocks().find((block) => isPointInBlock(x, y, block));
    setHoveredBlockId(hoveredBlock?.id ?? null);

    if (dragState()) {
      const { blockId, offset } = dragState()!;
      moveBlock(blockId, x - offset.x, y - offset.y);
    }
  };

  const handleMouseDown = () => {
    const clickedBlock = blocks().find((block) =>
      isPointInBlock(mousePos().x, mousePos().y, block)
    );

    if (!clickedBlock) {
      setActiveCollisions([]);
      return;
    }

    const collisions = detectAllCollisions();
    setActiveCollisions(collisions);

    disconnectBlock(clickedBlock.id);

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

  const updateStackPositions = (startBlockId: string, startY: number) => {
    let currentY = startY;
    let currentId = startBlockId;

    setBlocks((prev) => {
      const updated = [...prev];

      while (currentId) {
        const blockIndex = updated.findIndex((b) => b.id === currentId);
        if (blockIndex === -1) break;

        updated[blockIndex] = {
          ...updated[blockIndex],
          y: currentY,
        };

        currentY += updated[blockIndex].height;
        currentId = updated[blockIndex].nextBlockId as string;
      }

      return updated;
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

    const firstStackBlock = stackBlocks[0];
    const lastStackBlock = stackBlocks[stackBlocks.length - 1];

    const blocksList = blocks();
    for (const topBlock of blocksList) {
      if (dragState()!.stackIds.includes(topBlock.id)) continue;

      if (!topBlock.nextBlockId) continue;

      const bottomBlock = getBlockById(topBlock.nextBlockId);
      if (!bottomBlock || dragState()!.stackIds.includes(bottomBlock.id))
        continue;

      const tolerance = 20;
      const blockY = firstStackBlock.y;
      const topBlockBottom = topBlock.y + topBlock.height;
      const bottomBlockTop = bottomBlock.y;

      if (
        blockY > topBlockBottom - tolerance &&
        blockY < bottomBlockTop + tolerance
      ) {
        const horizontalOverlap =
          firstStackBlock.x + firstStackBlock.width >= topBlock.x &&
          firstStackBlock.x <= topBlock.x + topBlock.width;

        if (horizontalOverlap) {
          didSnap = true;

          const newY = topBlock.y + topBlock.height;

          setBlocks((prev) =>
            prev.map((block) => {
              if (block.id === topBlock.id) {
                return { ...block, nextBlockId: firstStackBlock.id };
              }
              if (block.id === lastStackBlock.id) {
                return { ...block, nextBlockId: bottomBlock.id };
              }
              return block;
            })
          );

          moveBlock(firstStackBlock.id, topBlock.x, newY);
          updateStackPositions(firstStackBlock.id, newY);
          break;
        }
      }
    }

    if (!didSnap) {
      for (const targetBlock of blocks()) {
        if (dragState()!.stackIds.includes(targetBlock.id)) continue;

        const topSnap = getSnapCollision(lastStackBlock, targetBlock);
        if (topSnap === "top") {
          didSnap = true;
          const newY = targetBlock.y - lastStackBlock.height;
          moveBlock(lastStackBlock.id, targetBlock.x, newY);
          connectBlocks(lastStackBlock.id, targetBlock.id);
          updateStackPositions(targetBlock.id, targetBlock.y);
          break;
        }

        const lastTargetBlock = findLastConnectedBlock(targetBlock.id);
        if (lastTargetBlock) {
          const bottomSnap = getSnapCollision(firstStackBlock, lastTargetBlock);
          if (bottomSnap === "bottom") {
            didSnap = true;
            const newY = lastTargetBlock.y + lastTargetBlock.height;
            moveBlock(firstStackBlock.id, lastTargetBlock.x, newY);
            connectBlocks(lastTargetBlock.id, firstStackBlock.id);
            updateStackPositions(firstStackBlock.id, newY);
            break;
          }
        }
      }
    }

    setDragState(null);
    setActiveCollisions([]);
  };

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "800px",
          height: "600px",
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
      >
        <For
          each={blocks().sort((a, b) => {
            if (dragState() && dragState()!.stackIds.includes(a.id)) return 1;
            if (dragState() && dragState()!.stackIds.includes(b.id)) return -1;
            return 0;
          })}
        >
          {(block) => (
            <div
              style={{
                position: "absolute",
                left: `${block.x}px`,
                top: `${block.y}px`,
                width: `${block.width}px`,
                height: `${block.height}px`,
                background: block.color,
                border: activeCollisions().some(
                  (c) =>
                    c.blockId === block.id || c.collidingWithId === block.id
                )
                  ? "2px solid yellow"
                  : "none",
                "user-select": "none",
                transition: dragState()?.stackIds.includes(block.id)
                  ? "none"
                  : "all 0.1s ease",
              }}
            >
              {block.id}
            </div>
          )}
        </For>
      </div>
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

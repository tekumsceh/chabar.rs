import { useCallback, useEffect, useRef, useState } from "react";

const DRAG_THRESHOLD_PX = 10;

function reorderArray(list, fromIndex, toIndex) {
  if (fromIndex === toIndex) return list;
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
  next.splice(insertAt, 0, item);
  return next;
}

function readDropIndex(clientY, kind) {
  const rows = document.querySelectorAll(
    `[data-tech-channel-row][data-tech-channel-kind="${kind}"]`,
  );
  if (!rows.length) return null;

  const visibleRows = [...rows].filter((row) => row.getClientRects().length > 0);
  if (!visibleRows.length) return null;

  for (const row of visibleRows) {
    if (row.classList.contains("is-drag-source")) continue;
    const rect = row.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      return Number(row.dataset.channelIndex);
    }
  }

  const last = visibleRows.filter((row) => !row.classList.contains("is-drag-source")).at(-1);
  if (!last) return null;
  return Number(last.dataset.channelIndex);
}

function positionDragGhost(shell, clientX, clientY, offsetX, offsetY) {
  shell.style.left = `${clientX - offsetX}px`;
  shell.style.top = `${clientY - offsetY}px`;
}

function copyTechRiderTheme(shell, row) {
  const root = row.closest(".tech-rider");
  if (!root) return;
  const styles = getComputedStyle(root);
  for (const name of [
    "--tech-bg",
    "--tech-panel",
    "--tech-line",
    "--tech-ink",
    "--tech-muted",
    "--tech-input",
    "--tech-output",
    "--tech-phantom",
    "--tech-pad",
  ]) {
    shell.style.setProperty(name, styles.getPropertyValue(name));
  }
}

function createDragGhost(row, clientX, clientY) {
  const rect = row.getBoundingClientRect();
  const shell = document.createElement("div");
  shell.className = "tech-rider-drag-ghost";
  shell.classList.add(row.dataset.techChannelKind === "output" ? "is-output" : "is-input");
  shell.setAttribute("aria-hidden", "true");
  copyTechRiderTheme(shell, row);

  if (row.tagName === "TR") {
    const table = document.createElement("table");
    table.className = "tech-rider-table tech-rider-drag-ghost-table";
    const tbody = document.createElement("tbody");
    const cloned = row.cloneNode(true);
    cloned.classList.remove("is-drag-source", "is-drop-target", "is-dragging");
    tbody.appendChild(cloned);
    table.appendChild(tbody);
    shell.appendChild(table);
  } else {
    const cloned = row.cloneNode(true);
    cloned.classList.remove("is-drag-source", "is-drop-target", "is-dragging");
    shell.appendChild(cloned);
  }

  shell.style.width = `${rect.width}px`;
  positionDragGhost(shell, clientX, clientY, clientX - rect.left, clientY - rect.top);
  document.body.appendChild(shell);

  return {
    shell,
    offsetX: clientX - rect.left,
    offsetY: clientY - rect.top,
  };
}

function removeDragGhost(state) {
  state?.ghost?.shell?.remove();
  if (state) state.ghost = null;
}

export { reorderArray };

export function useTechChannelDrag({ kind, readOnly, searchActive, onCommitReorder }) {
  const [draggingId, setDraggingId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const dragRef = useRef(null);
  const dragEnabled = !readOnly && !searchActive;

  const onHandlePointerDown = useCallback(
    (event, channel, index) => {
      if (!dragEnabled) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      const handle = event.currentTarget;
      const row = handle.closest("[data-tech-channel-row]");
      if (!row) return;

      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      dragRef.current = {
        channelId: channel.id,
        fromIndex: index,
        pointerId: event.pointerId,
        active: false,
        startY: event.clientY,
        startX: event.clientX,
        handle,
        row,
        ghost: null,
      };
    },
    [dragEnabled],
  );

  useEffect(() => {
    if (!dragEnabled) return undefined;

    function onPointerMove(event) {
      const state = dragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      if (!state.active) {
        const dy = Math.abs(event.clientY - state.startY);
        const dx = Math.abs(event.clientX - state.startX);
        if (dy < DRAG_THRESHOLD_PX && dx < DRAG_THRESHOLD_PX) return;

        state.active = true;
        state.ghost = createDragGhost(state.row, event.clientX, event.clientY);
        setDraggingId(state.channelId);
        document.body.classList.add("tech-rider-is-dragging");
      }

      if (state.ghost) {
        positionDragGhost(
          state.ghost.shell,
          event.clientX,
          event.clientY,
          state.ghost.offsetX,
          state.ghost.offsetY,
        );
      }

      setDropIndex(readDropIndex(event.clientY, kind));
    }

    function finishDrag(event) {
      const state = dragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      try {
        state.handle?.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      if (state.active) {
        const toIndex = readDropIndex(event.clientY, kind);
        if (toIndex != null && toIndex !== state.fromIndex) {
          onCommitReorder(state.fromIndex, toIndex);
        }
      }

      removeDragGhost(state);
      dragRef.current = null;
      setDraggingId(null);
      setDropIndex(null);
      document.body.classList.remove("tech-rider-is-dragging");
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      removeDragGhost(dragRef.current);
      document.body.classList.remove("tech-rider-is-dragging");
    };
  }, [dragEnabled, kind, onCommitReorder]);

  return {
    dragEnabled,
    draggingId,
    dropIndex,
    onHandlePointerDown,
  };
}

export function getSelectionOffsets(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return { start: 0, end: 0, collapsed: true };
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) {
    return { start: 0, end: 0, collapsed: true };
  }
  return {
    start: offsetWithin(el, range.startContainer, range.startOffset),
    end: offsetWithin(el, range.endContainer, range.endOffset),
    collapsed: sel.isCollapsed,
  };
}

export function getCaretOffset(el) {
  return getSelectionOffsets(el).start;
}

export function setCaret(el, offset) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  let placed = false;

  function walk(node) {
    if (placed) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.collapse(true);
        placed = true;
        return;
      }
      remaining -= len;
      return;
    }
    if (node.nodeName === 'BR') {
      if (remaining === 0) {
        range.setStartBefore(node);
        range.collapse(true);
        placed = true;
        return;
      }
      remaining -= 1;
      return;
    }
    for (const child of node.childNodes) {
      walk(child);
      if (placed) return;
    }
  }

  for (const child of el.childNodes) {
    walk(child);
    if (placed) break;
  }

  if (!placed) {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function offsetWithin(root, container, containerOffset) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(container, containerOffset);
  return contentLength(range.cloneContents());
}

function contentLength(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.length;
  if (node.nodeName === 'BR') return 1;
  let n = 0;
  for (const child of node.childNodes) n += contentLength(child);
  return n;
}

import { getRichText, richTextLength } from './richtext.js';

const HEADING_RE = /^H[1-6]$/;
const STRIP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'TITLE', 'NOSCRIPT']);

export function parseClipboard(clipboardData) {
  if (!clipboardData) return [];

  const html = clipboardData.getData('text/html');
  if (html && html.trim()) {
    const blocks = parseHTML(html);
    if (blocks.length > 0) return blocks;
  }

  const text = clipboardData.getData('text/plain');
  if (text) return parsePlainText(text);

  return [];
}

function parseHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  if (!root) return [];

  for (const el of [...root.querySelectorAll('script, style, meta, link, noscript')]) {
    el.remove();
  }

  return walkBlocks(root);
}

function walkBlocks(root) {
  const blocks = [];
  const inlineBuffer = [];

  function flushInline() {
    if (inlineBuffer.length === 0) return;
    const tmp = document.createElement('div');
    for (const n of inlineBuffer) tmp.appendChild(n.cloneNode(true));
    const text = getRichText(tmp);
    if (richTextLength(text) > 0) {
      blocks.push({ type: 'paragraph', data: { text } });
    }
    inlineBuffer.length = 0;
  }

  function handleNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent && node.textContent.trim()) inlineBuffer.push(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.nodeName;
    if (STRIP_TAGS.has(tag)) return;

    if (tag === 'P') {
      flushInline();
      const text = getRichText(node);
      if (richTextLength(text) > 0) blocks.push({ type: 'paragraph', data: { text } });
      return;
    }

    if (HEADING_RE.test(tag)) {
      flushInline();
      const level = Number(tag[1]);
      const text = getRichText(node);
      if (richTextLength(text) > 0) blocks.push({ type: 'heading', data: { level, text } });
      return;
    }

    if (tag === 'BLOCKQUOTE') {
      flushInline();
      const text = getRichText(node);
      if (richTextLength(text) > 0) blocks.push({ type: 'quote', data: { text } });
      return;
    }

    if (tag === 'UL' || tag === 'OL') {
      flushInline();
      const items = [];
      for (const li of node.children) {
        if (li.nodeName !== 'LI') continue;
        const text = getRichText(li);
        if (richTextLength(text) > 0) items.push(text);
      }
      if (items.length > 0) {
        blocks.push({ type: 'list', data: { ordered: tag === 'OL', items } });
      }
      return;
    }

    if (tag === 'PRE') {
      flushInline();
      const code = node.textContent ?? '';
      blocks.push({ type: 'code', data: { code } });
      return;
    }

    if (tag === 'IMG') {
      flushInline();
      const src = node.getAttribute('src');
      if (isSafeUrl(src)) {
        blocks.push({
          type: 'image',
          data: { src, alt: node.getAttribute('alt') ?? '' },
        });
      }
      return;
    }

    if (tag === 'HR') {
      flushInline();
      blocks.push({ type: 'divider', data: {} });
      return;
    }

    if (tag === 'FIGURE') {
      flushInline();
      const img = node.querySelector('img');
      if (img && isSafeUrl(img.getAttribute('src'))) {
        const cap = node.querySelector('figcaption');
        blocks.push({
          type: 'image',
          data: {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt') ?? '',
            caption: cap ? cap.textContent.trim() : '',
          },
        });
        return;
      }
      for (const child of node.childNodes) handleNode(child);
      return;
    }

    if (tag === 'BR') {
      flushInline();
      return;
    }

    // Generic block container — recurse
    if (isBlockContainer(node)) {
      flushInline();
      for (const child of node.childNodes) handleNode(child);
      return;
    }

    // Otherwise treat as inline content for the current paragraph buffer
    inlineBuffer.push(node);
  }

  for (const child of root.childNodes) handleNode(child);
  flushInline();
  return blocks;
}

const BLOCK_CONTAINERS = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'NAV',
  'HEADER', 'FOOTER', 'BODY',
]);

function isBlockContainer(el) {
  if (BLOCK_CONTAINERS.has(el.nodeName)) return true;
  // Fallback: anything with display:block computed... but we don't have layout in DOMParser.
  return false;
}

function isSafeUrl(url) {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:')) return false;
  return true;
}

function parsePlainText(text) {
  const normalized = text.replace(/\r\n?/g, '\n');
  const paragraphs = normalized.split(/\n{2,}/);
  const blocks = [];
  for (const p of paragraphs) {
    const trimmed = p.replace(/^\n+|\n+$/g, '');
    if (trimmed) blocks.push({ type: 'paragraph', data: { text: trimmed } });
  }
  return blocks;
}

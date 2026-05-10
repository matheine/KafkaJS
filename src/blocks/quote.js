import { getSelectionOffsets } from '../core/caret.js';
import { setRichText, getRichText, sliceRichText } from '../core/richtext.js';

function insertLineBreak(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return;
  range.deleteContents();
  const br = document.createElement('br');
  range.insertNode(br);
  let next = br.nextSibling;
  while (next && next.nodeType === Node.TEXT_NODE && next.textContent === '') {
    const dead = next;
    next = next.nextSibling;
    dead.remove();
  }
  if (!br.nextSibling) el.appendChild(document.createElement('br'));
  range.setStartAfter(br);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export const QuoteBlock = {
  type: 'quote',
  defaultData: () => ({ text: '' }),
  menu: { label: 'Quote', hint: 'Quoted text' },

  render(data, ctx) {
    const el = document.createElement('blockquote');
    el.className = 'kafka-quote';
    el.contentEditable = 'true';
    el.spellcheck = true;
    setRichText(el, data.text);
    el.setAttribute('data-placeholder', 'Quote…');

    el.addEventListener('input', () => ctx.onUpdate({ text: getRichText(el) }));

    el.addEventListener('keydown', (e) => {
      if (e.isComposing) return;

      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        insertLineBreak(el);
        ctx.onUpdate({ text: getRichText(el) });
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const { start, end } = getSelectionOffsets(el);
        const text = getRichText(el);
        ctx.split(
          { text: sliceRichText(text, 0, start) },
          { type: 'paragraph', data: { text: sliceRichText(text, end, Infinity) } },
        );
        return;
      }

      if (e.key === 'Backspace') {
        const { start, collapsed } = getSelectionOffsets(el);
        if (collapsed && start === 0) {
          const result = ctx.mergeWithPrevious(getRichText(el));
          if (result) e.preventDefault();
        }
      }
    });

    return el;
  },
};

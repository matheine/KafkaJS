import { getSelectionOffsets } from '../core/caret.js';
import { setRichText, getRichText, sliceRichText } from '../core/richtext.js';

const LEVELS = [1, 2, 3, 4, 5, 6];

function clampLevel(level) {
  const n = Number(level) || 2;
  return Math.max(1, Math.min(6, Math.round(n)));
}

export const HeadingBlock = {
  type: 'heading',
  defaultData: () => ({ level: 2, text: '' }),
  menu: { label: 'Heading', hint: 'H1–H6' },

  render(data, ctx) {
    const level = clampLevel(data.level);
    const el = document.createElement('h' + level);
    el.className = 'kafka-heading kafka-heading-' + level;
    el.contentEditable = 'true';
    el.spellcheck = true;
    setRichText(el, data.text);
    el.setAttribute('data-placeholder', `Heading ${level}`);

    el.addEventListener('input', () => ctx.onUpdate({ text: getRichText(el) }));

    el.addEventListener('keydown', (e) => {
      if (e.isComposing) return;

      if (e.key === 'Enter' && !e.shiftKey) {
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
        const sel = window.getSelection();
        if (sel.isCollapsed) {
          const { start } = getSelectionOffsets(el);
          if (start === 0) {
            const result = ctx.mergeWithPrevious(getRichText(el));
            if (result) e.preventDefault();
          }
        }
      }
    });

    return el;
  },

  toolbar(data, ctx) {
    const bar = document.createElement('div');
    bar.className = 'kafka-heading-toolbar';
    const current = clampLevel(data.level);
    for (const i of LEVELS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kafka-toolbar-btn';
      btn.tabIndex = -1;
      if (i === current) btn.classList.add('is-active');
      btn.textContent = 'H' + i;
      btn.addEventListener('click', () => {
        ctx.onUpdate({ level: i });
        ctx.refresh();
      });
      bar.appendChild(btn);
    }
    return bar;
  },
};

import { setRichText, getRichText } from '../core/richtext.js';

function readItems(list) {
  return [...list.querySelectorAll(':scope > li')].map((li) => getRichText(li));
}

function findContainingLi(list, node) {
  let n = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (n && n !== list) {
    if (n.tagName === 'LI' && n.parentElement === list) return n;
    n = n.parentElement;
  }
  return null;
}

function isLiEmpty(li) {
  return li.textContent === '';
}

export const ListBlock = {
  type: 'list',
  defaultData: () => ({ ordered: false, items: [''] }),
  menu: { label: 'List', hint: 'Bulleted or numbered' },

  render(data, ctx) {
    const tag = data.ordered ? 'ol' : 'ul';
    const list = document.createElement(tag);
    list.className = 'kafka-list';
    list.contentEditable = 'true';
    list.spellcheck = true;
    list.setAttribute('data-placeholder', 'List item…');

    const items = data.items?.length ? data.items : [''];
    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'kafka-list-item';
      setRichText(li, item);
      list.appendChild(li);
    }

    list.addEventListener('input', () => {
      ctx.onUpdate({ items: readItems(list) });
    });

    list.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const li = findContainingLi(list, sel.focusNode);
      if (!li) return;

      const lis = [...list.querySelectorAll(':scope > li')];
      const idx = lis.indexOf(li);
      const isLast = idx === lis.length - 1;
      const isFirst = idx === 0;

      // Enter on empty last item — exit list, create paragraph below.
      if (e.key === 'Enter' && !e.shiftKey && isLast && isLiEmpty(li)) {
        e.preventDefault();
        li.remove();
        const remaining = readItems(list);
        ctx.split(
          { items: remaining.length ? remaining : [''] },
          { type: 'paragraph', data: { text: '' } },
        );
        return;
      }

      // Backspace at start of first empty item with no other items — drop the list.
      if (e.key === 'Backspace') {
        const range = sel.getRangeAt(0);
        if (sel.isCollapsed && isFirst && isLiEmpty(li) && lis.length === 1) {
          e.preventDefault();
          ctx.transform('paragraph', { text: '' });
          return;
        }
        // Backspace at start of first item with content — merge with previous block.
        if (sel.isCollapsed && isFirst && range.startOffset === 0) {
          // Check caret is truly at the very start of the li
          const tmp = document.createRange();
          tmp.selectNodeContents(li);
          tmp.setEnd(range.startContainer, range.startOffset);
          if (tmp.toString().length === 0) {
            const result = ctx.mergeWithPrevious(getRichText(li));
            if (result) {
              e.preventDefault();
              return;
            }
          }
        }
      }
    });

    return list;
  },

  toolbar(data, ctx) {
    const bar = document.createElement('div');
    bar.className = 'kafka-list-toolbar';
    const ordered = !!data.ordered;
    const options = [
      { label: '•', value: false, title: 'Unordered' },
      { label: '1.', value: true, title: 'Ordered' },
    ];
    for (const { label, value, title } of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kafka-toolbar-btn';
      btn.tabIndex = -1;
      btn.title = title;
      btn.textContent = label;
      if (ordered === value) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        ctx.onUpdate({ ordered: value });
        ctx.refresh();
      });
      bar.appendChild(btn);
    }
    return bar;
  },
};

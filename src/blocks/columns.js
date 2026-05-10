const COLUMN_COUNTS = [2, 3];

const emptyParagraph = () => ({ type: 'paragraph', data: { text: '' } });

export const ColumnsBlock = {
  type: 'columns',
  defaultData: () => ({
    columns: [[emptyParagraph()], [emptyParagraph()]],
  }),
  menu: { label: 'Columns', hint: '2 or 3 side by side' },

  render(data, ctx) {
    const wrap = document.createElement('div');
    wrap.className = 'kafka-columns';
    const cols = data.columns ?? [];
    wrap.style.setProperty('--kafka-col-count', String(cols.length || 2));

    cols.forEach((columnContent, i) => {
      const col = document.createElement('div');
      col.className = 'kafka-column';
      const inner = document.createElement('kafka-editor');
      inner.classList.add('kafka-nested');
      col.appendChild(inner);
      wrap.appendChild(col);

      queueMicrotask(() => {
        if (!inner.isConnected) return;
        // Attach the listener BEFORE setContent so the initial replace event
        // (which assigns IDs to nested blocks) propagates back into outer state.
        inner.addEventListener('change', (e) => {
          const cur = ctx.getData()?.columns ?? cols;
          const next = cur.slice();
          next[i] = e.detail;
          ctx.onUpdate({ columns: next });
        });
        inner.setContent(columnContent ?? []);
      });
    });

    return wrap;
  },

  toolbar(data, ctx) {
    const bar = document.createElement('div');
    bar.className = 'kafka-columns-toolbar';
    const current = data.columns?.length ?? 2;
    for (const n of COLUMN_COUNTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kafka-toolbar-btn';
      btn.tabIndex = -1;
      btn.textContent = String(n);
      btn.title = `${n} columns`;
      if (n === current) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        const cols = data.columns ?? [];
        if (n === cols.length) return;
        let next;
        if (n > cols.length) {
          next = [...cols];
          while (next.length < n) next.push([emptyParagraph()]);
        } else {
          next = cols.slice(0, n);
        }
        ctx.onUpdate({ columns: next });
        ctx.refresh();
      });
      bar.appendChild(btn);
    }
    return bar;
  },
};

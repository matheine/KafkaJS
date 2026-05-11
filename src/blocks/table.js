function makeRow(cols) {
  return Array(cols).fill('');
}

function ensureGrid(data) {
  const raw = Array.isArray(data?.rows) && data.rows.length ? data.rows : [['', ''], ['', '']];
  const cols = Math.max(1, ...raw.map((r) => (Array.isArray(r) ? r.length : 0)));
  return raw.map((r) => {
    const arr = Array.isArray(r) ? r.map((c) => (typeof c === 'string' ? c : String(c ?? ''))) : [];
    while (arr.length < cols) arr.push('');
    return arr;
  });
}

function focusCellElement(cell, atEnd = false) {
  if (!cell) return;
  cell.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(!atEnd);
  sel.removeAllRanges();
  sel.addRange(range);
}

function focusCellAfterRefresh(blockId, r, c) {
  queueMicrotask(() => {
    const wrapper = document.getElementById(blockId);
    if (!wrapper) return;
    const cell = wrapper.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
    focusCellElement(cell);
  });
}

export const TableBlock = {
  type: 'table',
  defaultData: () => ({ rows: [['', ''], ['', '']] }),
  menu: { label: 'Table', hint: 'Rows × columns' },

  render(data, ctx) {
    const rows = ensureGrid(data);
    const wrap = document.createElement('div');
    wrap.className = 'kafka-table-wrap';

    const table = document.createElement('table');
    table.className = 'kafka-table';
    const tbody = document.createElement('tbody');

    rows.forEach((row, r) => {
      const tr = document.createElement('tr');
      row.forEach((cellText, c) => {
        const td = document.createElement('td');
        td.contentEditable = 'true';
        td.spellcheck = true;
        td.dataset.row = String(r);
        td.dataset.col = String(c);
        td.textContent = cellText;

        td.addEventListener('input', () => {
          const current = ensureGrid(ctx.getData());
          current[r][c] = td.textContent;
          ctx.onUpdate({ rows: current });
        });

        td.addEventListener('keydown', (e) => {
          if (e.isComposing) return;

          if (e.key === 'Tab') {
            e.preventDefault();
            const grid = ensureGrid(ctx.getData());
            const cols = grid[0].length;
            const isLast = r === grid.length - 1 && c === cols - 1;

            if (e.shiftKey) {
              if (r === 0 && c === 0) return;
              const tr2 = c === 0 ? r - 1 : r;
              const tc2 = c === 0 ? cols - 1 : c - 1;
              focusCellElement(table.querySelector(`td[data-row="${tr2}"][data-col="${tc2}"]`), true);
              return;
            }

            if (isLast) {
              const next = grid.map((rr) => [...rr]);
              next.push(makeRow(cols));
              ctx.onUpdate({ rows: next });
              ctx.refresh();
              focusCellAfterRefresh(ctx.id, r + 1, 0);
              return;
            }

            const tr2 = c === cols - 1 ? r + 1 : r;
            const tc2 = c === cols - 1 ? 0 : c + 1;
            focusCellElement(table.querySelector(`td[data-row="${tr2}"][data-col="${tc2}"]`));
            return;
          }
        });

        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  },

  toolbar(data, ctx) {
    const bar = document.createElement('div');
    bar.className = 'kafka-table-toolbar';

    function btn(label, title, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kafka-toolbar-btn';
      b.tabIndex = -1;
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', onClick);
      return b;
    }

    bar.appendChild(btn('+ Row', 'Add row', () => {
      const cur = ensureGrid(ctx.getData());
      const next = [...cur.map((r) => [...r]), makeRow(cur[0].length)];
      ctx.onUpdate({ rows: next });
      ctx.refresh();
    }));
    bar.appendChild(btn('− Row', 'Remove last row', () => {
      const cur = ensureGrid(ctx.getData());
      if (cur.length <= 1) return;
      ctx.onUpdate({ rows: cur.slice(0, -1) });
      ctx.refresh();
    }));
    bar.appendChild(btn('+ Col', 'Add column', () => {
      const cur = ensureGrid(ctx.getData());
      const next = cur.map((r) => [...r, '']);
      ctx.onUpdate({ rows: next });
      ctx.refresh();
    }));
    bar.appendChild(btn('− Col', 'Remove last column', () => {
      const cur = ensureGrid(ctx.getData());
      if (cur[0].length <= 1) return;
      ctx.onUpdate({ rows: cur.map((r) => r.slice(0, -1)) });
      ctx.refresh();
    }));

    return bar;
  },
};

function bindBlockKeys(el, ctx) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ctx.split({}, { type: 'paragraph', data: { text: '' } });
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      ctx.removeAndFocusPrevious();
    }
  });
}

export const DividerBlock = {
  type: 'divider',
  defaultData: () => ({}),
  menu: { label: 'Divider', hint: 'Horizontal rule' },

  render(data, ctx) {
    const el = document.createElement('div');
    el.className = 'kafka-divider';
    el.tabIndex = 0;
    el.dataset.kafkaFocusable = 'true';
    el.setAttribute('aria-label', 'Divider');
    el.setAttribute('role', 'separator');

    const line = document.createElement('hr');
    line.className = 'kafka-divider-line';
    el.appendChild(line);

    bindBlockKeys(el, ctx);
    return el;
  },
};

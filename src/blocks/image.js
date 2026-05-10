function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function adoptFile(file, ctx) {
  if (!file || !file.type.startsWith('image/')) return;
  const src = await readFileAsDataURL(file);
  ctx.onUpdate({ src, alt: file.name.replace(/\.[^.]+$/, '') });
  ctx.refresh();
}

export const ImageBlock = {
  type: 'image',
  defaultData: () => ({ src: '', alt: '', caption: '' }),
  menu: { label: 'Image', hint: 'Upload or URL' },

  render(data, ctx) {
    const fig = document.createElement('figure');
    fig.className = 'kafka-image';

    if (data.src) {
      const img = document.createElement('img');
      img.src = data.src;
      img.alt = data.alt ?? '';
      img.className = 'kafka-image-img';
      fig.appendChild(img);

      const cap = document.createElement('figcaption');
      cap.className = 'kafka-image-caption';
      cap.contentEditable = 'true';
      cap.textContent = data.caption ?? '';
      cap.setAttribute('data-placeholder', 'Caption (optional)…');
      cap.addEventListener('input', () => ctx.onUpdate({ caption: cap.textContent }));
      fig.appendChild(cap);
    } else {
      const dropZone = document.createElement('div');
      dropZone.className = 'kafka-image-form';

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.className = 'kafka-image-file';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) adoptFile(file, ctx);
      });

      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'kafka-image-upload';
      uploadBtn.textContent = 'Upload image';
      uploadBtn.addEventListener('click', () => fileInput.click());

      const urlInput = document.createElement('input');
      urlInput.type = 'url';
      urlInput.placeholder = 'or paste a URL and press Enter';
      urlInput.className = 'kafka-image-input';
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && urlInput.value.trim()) {
          e.preventDefault();
          ctx.onUpdate({ src: urlInput.value.trim() });
          ctx.refresh();
        }
      });

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('is-dragover');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('is-dragover');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('is-dragover');
        const file = e.dataTransfer?.files?.[0];
        if (file) adoptFile(file, ctx);
      });

      dropZone.appendChild(uploadBtn);
      dropZone.appendChild(urlInput);
      dropZone.appendChild(fileInput);
      fig.appendChild(dropZone);
    }

    return fig;
  },
};

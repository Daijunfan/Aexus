export const $ = id => document.getElementById(id);
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shapes = {
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  folder: '<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
  'folder-plus': '<path d="M3 7V5h6l2 3h10v12H3Z"/><path d="M12 11v6m-3-3h6"/>',
  file: '<path d="M5 3h9l5 5v13H5Z"/><path d="M14 3v6h5M8 13h8m-8 4h6"/>',
  book: '<path d="M12 5C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
  library: '<path d="M3 4h4v16H3Zm7 0h4v16h-4Zm6 2 4-1 3 15-4 1Z"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>', 'chevron-left': '<path d="m15 5-7 7 7 7"/>', 'chevron-down': '<path d="m5 9 7 7 7-7"/>',
  'arrow-left': '<path d="m10 5-7 7 7 7M3 12h18"/>', 'arrow-up': '<path d="m5 10 7-7 7 7M12 3v18"/>', 'arrow-down': '<path d="m5 14 7 7 7-7M12 3v18"/>',
  upload: '<path d="m7 8 5-5 5 5M12 3v12M4 14v6h16v-6"/>', download: '<path d="m7 11 5 5 5-5M12 3v13M4 16v5h16v-5"/>',
  link: '<path d="m9 15 6-6M8 8 5 11a5 5 0 0 0 7 7l3-3m-7-6 3-3a5 5 0 0 1 7 7l-3 3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h1m-1 7h1m-1 7h1"/>', refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v6h-6"/>',
  trash: '<path d="M3 6h18M5 6l1 15h12l1-15M9 6V3h6v3m-5 4v7m4-7v7"/>', plus: '<path d="M12 4v16M4 12h16"/>',
  edit: '<path d="m15 4 5 5-12 12H3v-5ZM13 6l5 5"/>',
  indent: '<path d="M3 4h18M12 9h9m-9 6h9M3 20h18M3 9l4 3-4 3"/>',
  outdent: '<path d="M3 4h18M12 9h9m-9 6h9M3 20h18M7 9l-4 3 4 3"/>'
};
export const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${shapes[name] || shapes.file}</svg>`;
export function decorate() { document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
let toastTimer;
export function toast(message, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 12000 : 3500);
}
export function describeError(error) {
  const codes = { CONFLICT: '数据已被另一处修改，请刷新后重试。', SOURCE_CHANGED: '源文件已在外部修改，请重新打开或刷新解析。', SCOPE_DENIED: '操作超出工作区边界，或涉及受保护的文件。', ALREADY_EXISTS: '目标位置已有同名文件，请更换名称。', NOT_FOUND: '文件、章节或上传任务不存在。', INVALID_LOCATOR: '跳转位置无效，请检查页码、章节或锚点。', PASSWORD_REQUIRED: '此 PDF 需要正确的密码。', DRM_UNSUPPORTED: '此文档受 DRM 保护，无法读取。', URL_BLOCKED: '此链接指向私有网络或使用了不允许的地址。', ARTICLE_UNAVAILABLE: '未找到可阅读正文；页面可能需要登录或 JavaScript。', UNSUPPORTED_FORMAT: '当前版本不支持此文件格式。' };
  return [codes[error.code], error.message, error.details?.savedPath ? `原始文件已保存：${error.details.savedPath}` : ''].filter(Boolean).join('\n');
}
export const run = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(error => toast(describeError(error), true));
export function activity(text) { $('activity-text').textContent = text; $('activity').hidden = !text; }
export function field(name, label, value = '', options = {}) {
  const attrs = `${options.required ? ' required' : ''}${options.min !== undefined ? ` min="${options.min}"` : ''}${options.max !== undefined ? ` max="${options.max}"` : ''}${options.type==='number'?` step="${options.step??'any'}"`:''}`;
  const input = options.choices ? `<select name="${escape(name)}"${attrs}>${options.choices.map(choice => { const [v, t] = Array.isArray(choice) ? choice : [choice, choice]; return `<option value="${escape(v)}"${String(value) === String(v) ? ' selected' : ''}>${escape(t)}</option>`; }).join('')}</select>` : `<input name="${escape(name)}" type="${options.type || 'text'}" value="${escape(value)}"${attrs} autocomplete="off">`;
  return `<label class="dialog-field"><span>${escape(label)}</span>${input}${options.help ? `<small>${escape(options.help)}</small>` : ''}</label>`;
}
let modal = null;
export const modalDirty = () => Boolean(modal?.dirty);
export function showDialog({ title, html, submit = '保存', onSubmit, afterOpen }) {
  if ($('dialog').open) throw new Error('请先完成或关闭当前对话框。');
  $('dialog-title').textContent = title; $('dialog-fields').innerHTML = html; $('dialog-error').hidden = true;
  $('dialog-submit').textContent = submit; $('dialog-submit').hidden = !onSubmit;
  modal = { dirty: false, onSubmit, busy: false };
  $('dialog').showModal(); afterOpen?.();
  setTimeout(() => $('dialog-fields').querySelector('input,select,textarea')?.focus(), 30);
}
export function closeDialog() {
  if (modal?.busy) return;
  $('dialog').close(); modal = null;
}
$('dialog-form').addEventListener('input', () => { if (modal) modal.dirty = true; });
$('dialog-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!modal?.onSubmit || modal.busy) return;
  modal.busy = true; $('dialog-submit').disabled = true; $('dialog-error').hidden = true;
  try {
    await modal.onSubmit(Object.fromEntries(new FormData($('dialog-form'))));
    modal.busy = false; closeDialog();
  } catch (error) {
    if (modal) modal.busy = false;
    $('dialog-error').textContent = describeError(error); $('dialog-error').hidden = false;
  } finally { $('dialog-submit').disabled = false; }
});
$('dialog-cancel').addEventListener('click', closeDialog); $('dialog-x').addEventListener('click', closeDialog);
$('dialog').addEventListener('cancel', event => { if (modal?.busy) event.preventDefault(); else modal = null; });
export function bytesLabel(bytes) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`; }
export const parentPath = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
export const baseName = path => path.split('/').at(-1);
export const joinPath = (folder, name) => folder === '.' ? name : `${folder}/${name}`;

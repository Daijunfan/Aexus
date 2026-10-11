import { defaultPageColor } from '../core/appearance';
import { useState } from 'react';
import { Bot, Terminal } from 'lucide-react';
import { useWorkspace } from '../store';
import { Modal } from '../ui';
import type { SpaceEngine } from '../types';

export function SpaceCreate() {
  const { setModal, api, notify, navigate } = useWorkspace();
  const [title, setTitle] = useState('');
  const [engine, setEngine] = useState<SpaceEngine>('claude');
  const [busy, setBusy] = useState(false);
  const close = () => setModal(null);
  const create = async () => {
    const name = title.trim() || (window.native?.folderMode?'新页面':'新空间');
    setBusy(true);
    try {
      const created = await api(window.native?.folderMode?'page.create':'space.create', { title: name, engine, color: defaultPageColor });
      notify(`「${name}」已创建`);
      close();
      if (created?.id) navigate(created.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const options: { id: SpaceEngine; name: string; description: string; icon: typeof Bot }[] = [
    {
      id: 'claude',
      name: 'Claude Code',
      description: 'Anthropic 的命令行 Agent，适合写作与结构化整理',
      icon: Bot,
    },
    { id: 'codex', name: 'Codex', description: 'OpenAI 的命令行 Agent，适合代码与批处理', icon: Terminal },
  ];
  return (
    <Modal title={window.native?.folderMode ? "新建页面" : "新建空间"} onClose={close}>
      <div className="modal-body space-create">
        <label className="field">
          <span>{window.native?.folderMode ? "页面名称" : "空间名称"}</span>
          <input
            value={title}
            autoFocus
            placeholder="例如：我的项目"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create();
            }}
          />
        </label>
        {!window.native?.folderMode && <><div className="space-engine-heading">选择 Agent 引擎</div>
        <div className="space-engine-grid">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`space-engine-card ${engine === option.id ? 'selected' : ''}`}
              onClick={() => setEngine(option.id)}
            >
              <option.icon size={20} />
              <strong>{option.name}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
        </>}
        <p className="space-create-note">
          {window.native?.folderMode ? '页面会保存在当前工作文件夹中，Agent 由 Agents Company 提供。' : '一个顶层页面就是一个空间。空间内的文件彼此独立，Agent 也只能改动这个空间里的页面。'}
        </p>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={close}>
          取消
        </button>
        <button className="primary-button" onClick={() => void create()} disabled={busy}>
          {busy ? '创建中…' : window.native?.folderMode ? '创建页面' : '创建空间'}
        </button>
      </div>
    </Modal>
  );
}

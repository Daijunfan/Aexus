import { ThemeSettings } from './ThemeSettings';
import {AppSelect} from './AppSelect';
import { useState } from 'react';
import {
  Monitor,
  FolderOpen,
  Download,
  Upload,
  HardDrive,
  Palette,
  Keyboard,
  LoaderCircle,
} from 'lucide-react';
import { useWorkspace } from '../store';
import { Modal } from '../ui';
import { AppearanceColorField } from './AppearanceControls';

export function Settings() {
  const { workspace, update, setting, dataPath, appVersion, modal, setModal, notify, load } = useWorkspace();
  const [tab, setTab] = useState(modal?.tab || 'general');
  const [busy, setBusy] = useState(false);
  const backup = async (restore = false) => {
    if (!window.native) return;
    setBusy(true);
    try {
      if (restore) {
        const data = await window.native.importBackup();
        if (data) {
          await load();
          notify('工作空间已从备份恢复');
          setModal(null);
        }
      } else if (await window.native.exportBackup()) notify('完整备份已导出');
    } catch (error) {
      notify(`操作失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="设置" onClose={() => setModal(null)} wide className="settings-modal">
      <div className="settings-layout">
        <nav className="settings-tabs">
          <span>工作空间</span>
          <button className={tab === 'general' ? 'selected' : ''} onClick={() => setTab('general')}>
            <Monitor size={16} />
            偏好设置
          </button>
          <button className={tab === 'appearance' ? 'selected' : ''} onClick={() => setTab('appearance')}>
            <Palette size={16} />
            外观与 Agent
          </button>
          <button className={tab === 'data' ? 'selected' : ''} onClick={() => setTab('data')}>
            <HardDrive size={16} />
            数据与备份
          </button>
          <button onClick={() => setModal({ type: 'help' })}>
            <Keyboard size={16} />
            键盘快捷键
          </button>
          <div className="settings-brand">
            <span className="workspace-avatar">M</span>
            <strong>MiniNotion</strong>
            <small>v{appVersion} · 本地工作空间</small>
          </div>
        </nav>
        <div className="settings-content">
          {tab === 'general' ? (
            <>
              <h3>偏好设置</h3>
              <p className="muted">让这个空间更像你。</p>
              <label className="field-label">
                工作空间名称
                <input
                  value={workspace!.name}
                  onChange={(e) => update((s) => ({ ...s, name: e.target.value }))}
                  onBlur={(e) => {
                    if (!e.target.value.trim()) update((s) => ({ ...s, name: '我的工作空间' }));
                  }}
                />
              </label>
              <label className="field-label">
                评论署名
                <input
                  aria-label="评论署名"
                  value={workspace!.settings.authorName || ''}
                  placeholder="我"
                  onChange={(event) => setting({ authorName: event.target.value })}
                />
              </label>
              <label className="schedule-checkbox">
                <input
                  type="checkbox"
                  aria-label="macOS 桌面提醒"
                  checked={!!workspace!.settings.desktopNotifications}
                  onChange={(event) => setting({ desktopNotifications: event.target.checked })}
                />
                macOS 桌面提醒
              </label>
              <p className="muted scheduling-notification-note">
                需在系统中允许通知。应用运行时可显示横幅；彻底退出后，提醒仍由本地后台记录到收件箱。
              </p>
              <div className="setting-row">
                <div>
                  <strong>拼写检查</strong>
                  <small>写作时标记可能的拼写错误</small>
                </div>
                <button
                  role="switch"
                  aria-checked={workspace!.settings.spellcheck}
                  aria-label="拼写检查"
                  className={`switch ${workspace!.settings.spellcheck ? 'on' : ''}`}
                  onClick={() => setting({ spellcheck: !workspace!.settings.spellcheck })}
                >
                  <span />
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <strong>侧边栏宽度</strong>
                  <small>也可以拖动侧边栏边缘调整</small>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => setting({ sidebarWidth: 248, sidebarHidden: false })}
                >
                  恢复默认
                </button>
              </div>
            </>
          ) : tab === 'appearance' ? (
            <AppearanceSettings />
          ) : (
            <>
              <h3>数据与备份</h3>
              <p className="muted">你的笔记保存在本机，随时可以带走。</p>
              <div className="storage-card">
                <HardDrive size={25} />
                <div>
                  <strong>本地工作空间</strong>
                  <span>{workspace!.pages.filter((p) => !p.trashedAt).length} 个页面 · 自动保存</span>
                </div>
                <span className="local-badge">仅本机</span>
              </div>
              <label className="field-label">
                数据位置<code className="data-path">{dataPath}</code>
              </label>
              <button
                className="secondary-button"
                disabled={!window.native}
                onClick={() => void window.native?.revealData()}
              >
                <FolderOpen size={15} />在 Finder 中打开
              </button>
              <div className="settings-divider" />
              <h4>命令行与并发编辑</h4>
              <p className="muted">使用 mininotion 命令或本地 JSON API 操作笔记。两端的修改会实时同步。</p>
              <div className="backup-buttons">
                <button
                  className="secondary-button"
                  disabled={!window.native}
                  onClick={() => setModal({ type: 'conflicts' })}
                >
                  查看并发编辑草稿
                </button>
                <button
                  className="secondary-button"
                  disabled={!window.native}
                  onClick={() => setModal({ type: 'operations' })}
                >
                  查看操作记录
                </button>
              </div>
              <div className="settings-divider" />
              <h4>备份整个工作空间</h4>
              <p className="muted">导出所有页面、图片、附件和页面历史。建议定期将备份保存到另一块硬盘。</p>
              <div className="backup-buttons">
                <button
                  className="primary-button"
                  disabled={busy || !window.native}
                  onClick={() => void backup()}
                >
                  {busy ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}导出完整备份
                </button>
                <button
                  className="secondary-button"
                  disabled={busy || !window.native}
                  onClick={() => void backup(true)}
                >
                  <Upload size={15} />
                  从备份恢复
                </button>
              </div>
              <p className="settings-footnote">
                本地还会保留最近 30 天的工作空间快照，位于数据文件夹的 backups
                目录。附件与笔记一起保存，无需账号或云服务。
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AppearanceSettings() {
  const { workspace, setting } = useWorkspace();
  const appearance = workspace!.settings.appearance || {};
  const style = (changes: Partial<NonNullable<typeof workspace>['settings']['appearance']>) =>
    setting({ appearance: { ...appearance, ...changes } });
  return (
    <>
      <h3>外观与 Agent</h3>
      <p className="muted">为日常工作选择舒服的颜色和节奏。</p>
      <ThemeSettings />
      <section className="settings-appearance-section">
        <h4>自定义细节</h4>
        <AppearanceColorField
          label="应用主题色"
          value={appearance.accentColor}
          onChange={(accentColor) => style({ accentColor })}
        />
        <div className="appearance-selects">
          <label>
            界面底色
            <AppSelect
              aria-label="界面底色"
              value={appearance.surface || 'neutral'}
              onChange={(e) => style({ surface: e.target.value as 'neutral' | 'warm' | 'cool' })}
            >
              <option value="neutral">使用主题底色</option>
              <option value="warm">温润米白</option>
              <option value="cool">清透冷白</option>
            </AppSelect>
          </label>
          <label>
            界面密度
            <AppSelect
              aria-label="界面密度"
              value={appearance.density || 'comfortable'}
              onChange={(e) => style({ density: e.target.value as 'comfortable' | 'compact' })}
            >
              <option value="comfortable">舒适</option>
              <option value="compact">紧凑</option>
            </AppSelect>
          </label>
        </div>
        <h4>Agent 面板</h4>
        <AppearanceColorField
          label="Agent 背景"
          value={appearance.agentColor}
          onChange={(agentColor) => style({ agentColor })}
        />
        <div className="appearance-selects">
          <label>
            消息样式
            <AppSelect
              aria-label="Agent 消息样式"
              value={appearance.agentMessages || 'bubble'}
              onChange={(e) => style({ agentMessages: e.target.value as 'bubble' | 'plain' })}
            >
              <option value="bubble">柔和气泡</option>
              <option value="plain">简洁对话</option>
            </AppSelect>
          </label>
        </div>
        <button className="appearance-reset" onClick={() => setting({ appearance: null })}>
          恢复默认界面外观
        </button>
      </section>
    </>
  );
}

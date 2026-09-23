import { RefreshCw, Play } from 'lucide-react';
import { repeatLabel } from '../scheduling/recurrence';
import { useState } from 'react';
import { ArrowLeft, Copy, FileText, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useWorkspace } from '../store';
import { IconButton, MenuItem, PageIcon, Popover } from '../ui';
import { databaseTemplates, defaultTemplateId } from './templatesModel';
import type { DatabaseView, Page } from '../types';

export function TemplateMenu({
  page,
  view,
  x,
  y,
  onClose,
  onNew,
  onViewDefault,
}: {
  page: Page;
  view: DatabaseView;
  x: number;
  y: number;
  onClose: () => void;
  onNew: (templateId: string | null) => void;
  onViewDefault: (templateId: string | null) => void;
}) {
  const { workspace, command, navigate, notify, setModal } = useWorkspace();
  const [managing, setManaging] = useState<string | null>(null);
  const templates = databaseTemplates(workspace!, page.id);
  const selected = templates.find((template) => template.id === managing);
  const defaultId = defaultTemplateId(page.database!, view);
  const action = (callback: () => void) => {
    try {
      callback();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    }
  };
  const edit = (id: string) => {
    onClose();
    navigate(id);
  };
  return (
    <Popover x={x} y={y} width={330} onClose={onClose}>
      {selected ? (
        <>
          <div className="template-menu-heading">
            <IconButton label="返回模板列表" onClick={() => setManaging(null)}>
              <ArrowLeft size={14} />
            </IconButton>
            <strong>{selected.title || '无标题模板'}</strong>
          </div>
          <MenuItem icon={<Pencil size={15} />} onClick={() => edit(selected.id)}>
            编辑模板
          </MenuItem>
          <MenuItem
            icon={<Copy size={15} />}
            onClick={() =>
              action(() => {
                command('template.duplicate', { templateId: selected.id });
                setManaging(null);
              })
            }
          >
            复制模板
          </MenuItem>
          <MenuItem
            icon={<Star size={15} />}
            checked={view.defaultTemplateId === selected.id}
            onClick={() => {
              onViewDefault(selected.id);
              setManaging(null);
            }}
          >
            设为此视图的默认模板
          </MenuItem>
          <MenuItem
            icon={<Star size={15} />}
            checked={page.database!.defaultTemplateId === selected.id}
            onClick={() =>
              action(() => {
                command('template.default', { databaseId: page.id, templateId: selected.id });
                setManaging(null);
              })
            }
          >
            设为数据库的默认模板
          </MenuItem>
          <MenuItem
            icon={<RefreshCw size={15} />}
            onClick={() => {
              onClose();
              setModal({ type: 'repeat', pageId: selected.id });
            }}
          >
            重复{selected.repeat ? ` · ${repeatLabel(selected.repeat)}` : ' · 关闭'}
          </MenuItem>
          {selected.repeat && (
            <MenuItem
              icon={<Play size={15} />}
              onClick={() =>
                action(() => {
                  command('repeat.run', { templateId: selected.id });
                  notify('已生成一页');
                  onClose();
                })
              }
            >
              立即生成一次
            </MenuItem>
          )}
          <div className="menu-divider" />
          <MenuItem
            icon={<Trash2 size={15} />}
            danger
            onClick={() =>
              action(() => {
                command('template.delete', { templateId: selected.id });
                setManaging(null);
              })
            }
          >
            删除模板
          </MenuItem>
        </>
      ) : (
        <>
          <div className="picker-heading">选择页面模板</div>
          <MenuItem
            icon={<FileText size={15} />}
            onClick={() => {
              onNew(null);
              onClose();
            }}
          >
            空白页面{!defaultId && <span className="template-default-label">默认</span>}
          </MenuItem>
          {templates.map((template) => (
            <div className="database-template-row" key={template.id}>
              <button
                onClick={() => {
                  onNew(template.id);
                  onClose();
                }}
              >
                <PageIcon icon={template.icon} size={16} />
                <span>{template.title || '无标题模板'}</span>
                {defaultId === template.id && <small>默认</small>}
              </button>
              <IconButton
                label={`${template.title || '无标题模板'} 的模板操作`}
                onClick={() => setManaging(template.id)}
              >
                <MoreHorizontal size={16} />
              </IconButton>
            </div>
          ))}
          {!templates.length && (
            <p className="template-menu-empty">把常用正文和属性保存为模板，创建页面时即可使用。</p>
          )}
          <div className="menu-divider" />
          <MenuItem
            icon={<Plus size={15} />}
            onClick={() =>
              action(() => {
                const template = command('template.create', { databaseId: page.id, color: page.color });
                edit(template.id);
              })
            }
          >
            新建模板
          </MenuItem>
          {!!defaultId && <MenuItem onClick={() => onViewDefault(null)}>此视图默认使用空白页面</MenuItem>}
        </>
      )}
    </Popover>
  );
}

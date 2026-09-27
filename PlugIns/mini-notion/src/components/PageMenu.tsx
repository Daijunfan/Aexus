import {
  Bot,
  Copy,
  Star,
  Trash2,
  ArrowRight,
  ArrowUpRight,
  FileOutput,
  History,
  Link,
  LockKeyhole,
  Unlock,
  Pencil,
  Plus,
  Palette,
} from 'lucide-react';
import { useWorkspace } from '../store';
import { MenuItem, Popover, formatDate } from '../ui';
import { plainText } from '../model';

export function PageMenu() {
  const {
    workspace,
    pageMenu,
    setPageMenu,
    patch,
    duplicate,
    trash,
    create,
    setModal,
    navigate,
    notify,
    command,
    setAgentPanel,
    setSpacePanel,
  } = useWorkspace();
  const page = workspace!.pages.find((p) => p.id === pageMenu?.id);
  if (!page || !pageMenu) return null;
  const close = () => setPageMenu(null);
  return (
    <Popover x={pageMenu.x} y={pageMenu.y} onClose={close} width={282}>
      <MenuItem icon={<ArrowUpRight size={16} />} onClick={() => { close(); navigate(page.id, undefined, 'new'); }}>在新标签页打开</MenuItem>
      <div className="menu-divider" />
      <div className="font-options">
        {(
          [
            { id: 'default', text: 'Ag', name: '默认' },
            { id: 'serif', text: 'Ag', name: '衬线' },
            { id: 'mono', text: 'Ag', name: '等宽' },
          ] as const
        ).map((font) => (
          <button
            key={font.id}
            className={`font-${font.id} ${page.font === font.id ? 'chosen' : ''}`}
            onClick={() => patch(page.id, { font: font.id })}
          >
            <strong>{font.text}</strong>
            <span>{font.name}</span>
          </button>
        ))}
      </div>
      <MenuItem checked={page.smallText} onClick={() => patch(page.id, { smallText: !page.smallText })}>
        小号文本
      </MenuItem>
      {!page.templateFor && workspace!.pages.find((parent) => parent.id === page.parentId)?.database && (
        <MenuItem
          icon={<Plus size={16} />}
          disabled={page.locked}
          onClick={() => {
            try {
              const child = command('subitem.create', { pageId: page.id, color: page.color });
              close();
              navigate(child.id);
            } catch (error) {
              notify(String(error));
            }
          }}
        >
          添加子项目
        </MenuItem>
      )}
      {page.subItemOf && (
        <MenuItem
          icon={<ArrowRight size={16} />}
          onClick={() => {
            try {
              command('subitem.set', { pageId: page.id, parentId: null });
              close();
            } catch (error) {
              notify(String(error));
            }
          }}
        >
          移出父项目
        </MenuItem>
      )}
      <MenuItem checked={page.fullWidth} onClick={() => patch(page.id, { fullWidth: !page.fullWidth })}>
        全宽
      </MenuItem>
      <div className="menu-divider" />
      <MenuItem icon={<Palette size={16} />} disabled={page.locked} onClick={() => { close(); setModal({ type: 'appearance', pageId: page.id }); }}>页面颜色</MenuItem>
      <MenuItem
        icon={<Star size={16} />}
        onClick={() => {
          patch(page.id, { favorite: !page.favorite });
          close();
        }}
      >
        {page.favorite ? '取消收藏' : '添加到收藏'}
      </MenuItem>
      <MenuItem
        icon={<LockKeyhole size={16} />}
        checked={page.locked}
        onClick={() => {
          patch(page.id, { locked: !page.locked });
          close();
        }}
      >
        {page.locked ? '解锁页面' : '锁定页面'}
      </MenuItem>
      <MenuItem
        icon={<Pencil size={16} />}
        disabled={page.locked}
        onClick={() => {
          navigate(page.id);
          setTimeout(() => {
            const title = document.querySelector<HTMLTextAreaElement>('.page-title');
            title?.focus();
            title?.select();
          }, 50);
        }}
      >
        重命名
      </MenuItem>
      <MenuItem
        icon={<Plus size={16} />}
        disabled={page.locked}
        onClick={() => {
          create({ parentId: page.id });
          close();
        }}
      >
        添加子页面
      </MenuItem>
      {!window.native?.folderMode && (page.space ? (
        <MenuItem
          icon={<Bot size={16} />}
          onClick={() => {
            setAgentPanel({ pageId: page.id });
            close();
          }}
        >
          打开空间 Agent
        </MenuItem>
      ) : (
        page.parentId === null &&
        !page.database && (
          <MenuItem
            icon={<Bot size={16} />}
            onClick={() => {
              try {
                command('space.convert', { pageId: page.id });
                notify('此页面已转换为空间');
                setSpacePanel({ pageId: page.id });
              } catch (error) {
                notify(String(error));
              }
              close();
            }}
          >
            转换为空间
          </MenuItem>
        )
      ))}
      <MenuItem
        icon={<Copy size={16} />}
        onClick={() => {
          duplicate(page.id);
          close();
        }}
      >
        创建副本
      </MenuItem>
      {!page.templateFor && workspace!.pages.find((parent) => parent.id === page.parentId)?.database && (
        <MenuItem
          icon={<Copy size={16} />}
          onClick={() => {
            try {
              const template = command('template.create', { databaseId: page.parentId, fromPageId: page.id });
              close();
              navigate(template.id);
            } catch (error) {
              notify(String(error));
            }
          }}
        >
          保存为数据库模板
        </MenuItem>
      )}
      <MenuItem
        icon={<ArrowRight size={16} />}
        onClick={() => {
          setModal({ type: 'move', pageId: page.id });
          close();
        }}
      >
        移动到
      </MenuItem>
      <MenuItem
        icon={<Link size={16} />}
        onClick={() => {
          void navigator.clipboard
            .writeText(`mininotion://page/${page.id}`)
            .then(() => notify('已复制页面链接'));
          close();
        }}
      >
        复制链接
      </MenuItem>
      <div className="menu-divider" />
      <MenuItem
        icon={<FileOutput size={16} />}
        onClick={() => {
          setModal({ type: 'export', pageId: page.id });
          close();
        }}
      >
        导出
      </MenuItem>
      <MenuItem
        icon={<History size={16} />}
        onClick={() => {
          setModal({ type: 'history', pageId: page.id });
          close();
        }}
      >
        页面历史
      </MenuItem>
      <MenuItem icon={<Trash2 size={16} />} danger onClick={() => trash(page.id)}>
        移到回收站
      </MenuItem>
      <div className="menu-divider" />
      <div className="menu-caption">
        最后编辑于 {formatDate(page.updatedAt)}
        <br />
        {plainText(page.blocks).replace(/\s/g, '').length} 字
      </div>
    </Popover>
  );
}

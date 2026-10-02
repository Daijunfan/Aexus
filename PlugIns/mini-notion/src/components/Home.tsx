import { coverPresentation } from '../presentation';
import { isInternalPage } from '../model';
import { Clock3, ArrowUpRight, Plus, FolderOpen, FileText } from 'lucide-react';
import { useWorkspace } from '../store';
import { PageIcon, relativeDate, EmptyState } from '../ui';
import { plainText } from '../model';
import { Overview } from './Overview';

export function Home() {
  const { workspace: ws, navigate, create } = useWorkspace();
  const pages = ws!.pages.filter((p) => !p.trashedAt && !isInternalPage(p, ws!.pages));
  const recent = [...pages].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  return (
    <div className="home-scroll">
      <div className="home-content">
        <header className="home-greeting">
          <h1>{new Date().getHours() < 12 ? '早上好' : new Date().getHours() < 18 ? '下午好' : '晚上好'}</h1>
          <p>从这里开始今天的工作。</p>
        </header>
        <div className="home-section-title">
          <Clock3 size={16} />
          <span>最近编辑</span>
        </div>
        {recent.length ? (
          <div className="recent-grid">
            {recent.map((page) => (
              <button className="recent-card" key={page.id} onClick={() => navigate(page.id)}>
                <div
                  className={`card-preview ${coverPresentation(page.cover).className}`}
                  style={coverPresentation(page.cover, page.coverPosition).style}
                >
                  {!page.cover && (
                    <span>{plainText(page.blocks).slice(0, 135) || '一个新想法，从这里开始。'}</span>
                  )}
                </div>
                <div className="card-details">
                  <span className="card-icon"><PageIcon icon={page.icon} size={24} /></span>
                  <strong>{page.title || '无标题'}</strong>
                  <small>{relativeDate(page.updatedAt)}</small>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText size={32} />}
            title="在这里写下第一个想法"
            description="一页笔记，就可以是一个新的开始。"
          >
            <button className="primary-button" onClick={() => create()}>
              创建页面
            </button>
          </EmptyState>
        )}
        <Overview />
        <div className="home-section-title home-section-spaced">
          <FolderOpen size={16} />
          <span>个人页面</span>
          <button onClick={() => create()}>
            <Plus size={14} />
            新建
          </button>
        </div>
        <div className="home-page-list">
          {pages
            .filter((p) => !p.parentId)
            .map((page) => (
              <button key={page.id} onClick={() => navigate(page.id)}>
                <PageIcon icon={page.icon} />
                <strong>{page.title || '无标题'}</strong>
                <small>{relativeDate(page.updatedAt)}</small>
                <ArrowUpRight size={16} />
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

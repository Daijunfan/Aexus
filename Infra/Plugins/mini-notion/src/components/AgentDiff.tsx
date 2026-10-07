import { useState } from 'react';
import { AgentRevert } from './AgentRevert';
import { filterAgentDiff, type AgentFileDiff, type projectAgentDiff } from '../core/agentDiff';

export function AgentDiff({
  result,
  pageId,
}: {
  result: ReturnType<typeof projectAgentDiff>;
  pageId: string;
}) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState(result.summaries.length ? 'summary' : 'operations');
  const files = filterAgentDiff(
    view === 'summary' ? result.summaries.flatMap((turn) => turn.files) : result.operations,
    query,
  );
  return (
    <div className="agent-diff">
      <div className="agent-control-shortcuts">
        {!!result.summaries.length && (
          <button aria-pressed={view === 'summary'} onClick={() => setView('summary')}>
            每轮最终差异
          </button>
        )}
        <button aria-pressed={view === 'operations'} onClick={() => setView('operations')}>
          逐次文件操作
        </button>
      </div>
      <input
        aria-label="搜索文件差异"
        placeholder="搜索文件或修改内容…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p>{files.length} 项 · 修改历史</p>
      {!files.length && <p>没有匹配的文件修改。</p>}
      {files.map((file) => (
        <FileDiff key={file.id} file={file} pageId={pageId} allowRevert={view === 'summary'} />
      ))}
    </div>
  );
}

function FileDiff({
  file,
  pageId,
  allowRevert,
}: {
  file: AgentFileDiff;
  pageId: string;
  allowRevert: boolean;
}) {
  return (
    <details className="agent-diff-file" open>
      <summary>
        <strong>{file.path}</strong> ·{' '}
        {file.status === 'done'
          ? '已完成'
          : file.status === 'error'
            ? '失败'
            : file.status === 'stopped'
              ? '已停止'
              : '执行中'}
      </summary>
      {allowRevert && file.turnId && file.status === 'done' && (
        <AgentRevert pageId={pageId} turnId={file.turnId} file={file.path} />
      )}
      <small>{new Date(file.at).toLocaleString()}</small>
      {file.kind === 'delete' ? (
        <>
          <p>删除前的文件内容</p>
          <pre className="diff-removed">{file.before}</pre>
        </>
      ) : file.kind === 'patch' ? (
        <pre className="agent-unified-diff">
          {file.lines
            ? file.lines.map((line, index) => (
                <span
                  key={index}
                  className={`agent-diff-line ${line.type === 'added' ? 'diff-added' : line.type === 'removed' ? 'diff-removed' : ''}`}
                >
                  <span className="agent-diff-number">{line.before}</span>
                  <span className="agent-diff-number">{line.after}</span>
                  <code>{line.text}</code>
                </span>
              ))
            : file.patch}
        </pre>
      ) : (
        <>
          {file.kind === 'replace' ? (
            <>
              <p>替换前片段</p>
              <pre className="diff-removed">{file.before}</pre>
              <p>替换后片段</p>
            </>
          ) : (
            <p>{file.kind === 'create' ? '新建文件内容' : '本次写入内容（原生事件不含原文件全文）'}</p>
          )}
          <pre className="diff-added">{file.after}</pre>
          {file.status !== 'done' && file.output && <pre>{file.output}</pre>}
        </>
      )}
    </details>
  );
}

import {AppSelect} from '../components/AppSelect';
import { useWorkspace } from '../store';
import { Modal } from '../ui';
import { subItemDisplay } from './structure';
import type { DatabaseView, Page } from '../types';

export function StructureSettings({
  page,
  view,
  onViewChange,
  onClose,
}: {
  page: Page;
  view: DatabaseView;
  onViewChange: (changes: Partial<DatabaseView>) => void;
  onClose: () => void;
}) {
  const { command, workspace, notify } = useWorkspace();
  const database = page.database!,
    config = database.dependencies;
  const dates = database.columns.filter((column) => column.type === 'date');
  const display = subItemDisplay(view);
  const configure = (changes: any) => {
    try {
      command('database.configure', { databaseId: page.id, changes });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Modal title="子项目与依赖" onClose={onClose} wide>
      <div className="modal-body structure-settings">
        <section>
          <div className="setting-row">
            <div>
              <strong>子项目</strong>
              <small>把一项工作拆分为可独立追踪的任务。</small>
            </div>
            <button
              role="switch"
              aria-label="启用子项目"
              aria-checked={!!database.subItems}
              className={`switch ${database.subItems ? 'on' : ''}`}
              disabled={page.locked}
              onClick={() => configure({ subItems: !database.subItems })}
            >
              <span />
            </button>
          </div>
          {database.subItems && (
            <>
              <p className="muted">
                “父项目”和“子项目”是双向关联，可在表格或页面属性中编辑，也可用于公式与汇总。
              </p>
              <label className="field-label">
                此视图的子项目显示
                <AppSelect
                  aria-label="子项目显示方式"
                  value={display}
                  onChange={(event) =>
                    onViewChange({
                      subItemDisplay: event.target.value as DatabaseView['subItemDisplay'],
                      subItemFilter:
                        event.target.value === 'card'
                          ? 'parents'
                          : display === 'card'
                            ? 'all'
                            : view.subItemFilter || 'all',
                    })
                  }
                >
                  {['table', 'list', 'timeline'].includes(view.type) ? (
                    <option value="nested">嵌套在展开项内</option>
                  ) : (
                    <option value="card">作为父卡片的属性</option>
                  )}
                  <option value="flat">平铺列表</option>
                </AppSelect>
              </label>
              {display !== 'card' && (
                <label className="field-label">
                  筛选包含
                  <AppSelect
                    aria-label="子项目筛选范围"
                    value={view.subItemFilter || 'all'}
                    onChange={(event) =>
                      onViewChange({ subItemFilter: event.target.value as DatabaseView['subItemFilter'] })
                    }
                  >
                    <option value="all">父项目和子项目</option>
                    <option value="parents">仅父项目</option>
                    <option value="children">仅子项目</option>
                  </AppSelect>
                </label>
              )}
              {display === 'nested' && (
                <div className="backup-buttons">
                  <button className="secondary-button" onClick={() => onViewChange({ collapsedItems: [] })}>
                    展开全部子项目
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      onViewChange({
                        collapsedItems: [
                          ...new Set(
                            workspace!.pages
                              .filter((row) => row.parentId === page.id && row.subItemOf)
                              .map((row) => row.subItemOf!),
                          ),
                        ],
                      })
                    }
                  >
                    折叠全部子项目
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        <section>
          <div className="setting-row">
            <div>
              <strong>依赖关系</strong>
              <small>连接前置与后续任务，并在时间线上显示连线。</small>
            </div>
            <button
              role="switch"
              aria-label="启用依赖关系"
              aria-checked={!!config?.enabled}
              className={`switch ${config?.enabled ? 'on' : ''}`}
              disabled={page.locked}
              onClick={() => configure({ dependencies: { enabled: !config?.enabled } })}
            >
              <span />
            </button>
          </div>
          {config?.enabled && (
            <>
              <div className="structure-date-fields">
                <label className="field-label">
                  开始日期
                  <AppSelect
                    aria-label="依赖开始日期"
                    value={config.dateProperty}
                    disabled={page.locked}
                    onChange={(event) =>
                      configure({
                        dependencies: {
                          dateProperty: event.target.value,
                          ...(event.target.value === config.endProperty ? { endProperty: '' } : {}),
                        },
                      })
                    }
                  >
                    {dates.map((column) => (
                      <option value={column.id} key={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </AppSelect>
                </label>
                <label className="field-label">
                  结束日期
                  <AppSelect
                    aria-label="依赖结束日期"
                    value={config.endProperty || ''}
                    disabled={page.locked}
                    onChange={(event) => configure({ dependencies: { endProperty: event.target.value } })}
                  >
                    <option value="">开始属性中的结束日期</option>
                    {dates
                      .filter((column) => column.id !== config.dateProperty)
                      .map((column) => (
                        <option value={column.id} key={column.id}>
                          {column.name}
                        </option>
                      ))}
                  </AppSelect>
                </label>
              </div>
              <label className="field-label">
                自动调整日期
                <AppSelect
                  aria-label="自动调整依赖日期"
                  value={config.shift}
                  disabled={page.locked}
                  onChange={(event) => configure({ dependencies: { shift: event.target.value } })}
                >
                  <option value="none">不自动调整</option>
                  <option value="overlap">仅在日期重叠时后移</option>
                  <option value="maintain">移动并保持任务间隔</option>
                </AppSelect>
              </label>
              <label className="setting-checkbox">
                <input
                  type="checkbox"
                  checked={!!config.avoidWeekends}
                  disabled={page.locked}
                  onChange={(event) => configure({ dependencies: { avoidWeekends: event.target.checked } })}
                />
                自动调整时避开周末
              </label>
              <p className="muted">
                修改前置任务后，后续任务按此规则更新日期。“被阻挡”和“正在阻挡”属性也可直接编辑。
              </p>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}

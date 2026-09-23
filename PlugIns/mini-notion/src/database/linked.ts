import type { DatabaseView, JsonBlock, Workspace } from '../types.ts';

export function mapLinkedViews(
  workspace: Workspace,
  databaseId: string,
  transform: (view: DatabaseView) => DatabaseView,
) {
  const blocks = (items: JsonBlock[]): JsonBlock[] => {
    const next = items.map((block) => {
      let result = block;
      if (
        block.type === 'databaseView' &&
        block.props?.linked &&
        block.props.databaseId === databaseId &&
        block.props.viewState
      ) {
        try {
          const state = JSON.parse(String(block.props.viewState));
          const viewState = JSON.stringify({ ...state, views: state.views.map(transform) });
          if (viewState !== block.props.viewState)
            result = { ...block, props: { ...block.props, viewState } };
        } catch {
          /* Invalid linked view state falls back to the source view in the editor. */
        }
      }
      if (result.children) {
        const children = blocks(result.children);
        if (children !== result.children) result = { ...result, children };
      }
      return result;
    });
    return next.some((block, index) => block !== items[index]) ? next : items;
  };
  return {
    ...workspace,
    pages: workspace.pages.map((page) => {
      const next = blocks(page.blocks);
      return next === page.blocks ? page : { ...page, blocks: next, updatedAt: Date.now() };
    }),
  };
}

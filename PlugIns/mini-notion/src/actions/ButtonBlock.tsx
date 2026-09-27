import { useContext } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { defaultProps } from '@blocknote/core';
import { EditorPageContext } from '../content/SyncedBlock';
import { buttonConfig } from './commands';
import { ButtonControl } from './Buttons';
export const ButtonBlock = createReactBlockSpec(
  {
    type: 'button',
    propSchema: { ...defaultProps, label: { default: '按钮' }, actions: { default: '[]' }, confirmation: { default: '' } },
    content: 'none',
  },
  {
    meta: { selectable: false },
    render: ({ block }) => {
      const context = useContext(EditorPageContext);
      return (
        <div className="button-block" contentEditable={false}>
          <ButtonControl
            pageId={context.pageId}
            blockId={block.id}
            config={buttonConfig(block.props)}
            disabled={context.readOnly}
          />
        </div>
      );
    },
    toExternalHTML: ({ block }) => <p>按钮：{block.props.label}</p>,
  },
);

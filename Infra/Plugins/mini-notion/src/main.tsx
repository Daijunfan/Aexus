import { installPluginBridge } from './plugin/bridge';
import './plugin/folder.css';
import ReactDOM from 'react-dom/client';
import '@blocknote/mantine/style.css';
import App, { ErrorBoundary } from './App';
import { WorkspaceProvider } from './store';
import './styles.css';
import './appearance.css';
import './icons.css';
import './notion-local.css';
import './styles/events.css';
import './content/editor-tools.css';
import './styles/themes.css';

if(new URLSearchParams(location.search).get('hosted')==='1')installPluginBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  </ErrorBoundary>,
);

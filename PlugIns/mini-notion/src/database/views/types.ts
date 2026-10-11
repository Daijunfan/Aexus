import type { DatabaseView, Page, Property } from '../../types';

export type ViewProps = {
  page: Page;
  view: DatabaseView;
  rows: Page[];
  columns: Property[];
  updateView: (changes: Partial<DatabaseView>) => void;
  editProperty: (column: Property) => void;
  updateOptions: (column: Property, options: string[]) => void;
  openRow: (id: string) => void;
  addRow: (values?: Page['values']) => void;
  selected: Set<string>;
  selectRow: (id: string, selected: boolean) => void;
};

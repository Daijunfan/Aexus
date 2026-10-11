import { codeLanguageAliases } from './core/codeLanguages';
import { createBundledHighlighter } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import light from '@shikijs/themes/light-plus';
import dark from '@shikijs/themes/dark-plus';
import javascript from '@shikijs/langs/javascript';
import typescript from '@shikijs/langs/typescript';
import python from '@shikijs/langs/python';
import json from '@shikijs/langs/json';
import html from '@shikijs/langs/html';
import css from '@shikijs/langs/css';
import shell from '@shikijs/langs/shellscript';
import sql from '@shikijs/langs/sql';
import swift from '@shikijs/langs/swift';
import rust from '@shikijs/langs/rust';
import go from '@shikijs/langs/go';
import yaml from '@shikijs/langs/yaml';
import markdown from '@shikijs/langs/markdown';

const grammars = {
  javascript,
  typescript,
  python,
  json,
  html,
  css,
  shellscript: shell,
  sql,
  swift,
  rust,
  go,
  yaml,
  markdown,
};
const createHighlighter = createBundledHighlighter({
  langs: Object.fromEntries(
    [...Object.entries(grammars), ...Object.entries(codeLanguageAliases).filter(([, name]) => name in grammars).map(([alias, name]) => [alias, grammars[name as keyof typeof grammars]] as const)].map(([name, grammar]) => [name, () => Promise.resolve(grammar)]),
  ),
  themes: { 'light-plus': () => Promise.resolve(light), 'dark-plus': () => Promise.resolve(dark) },
  engine: () => createJavaScriptRegexEngine(),
});
export const highlighter = createHighlighter({ themes: ['light-plus', 'dark-plus'], langs: [] });

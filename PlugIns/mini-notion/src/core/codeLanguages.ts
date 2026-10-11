/** Language IDs shared by persistence, the editor menu and local highlighting. */
export const codeLanguages = ['text', 'javascript', 'typescript', 'python', 'json', 'html', 'css', 'shellscript', 'sql', 'swift', 'rust', 'go', 'yaml', 'markdown'] as const;
export const codeLanguageAliases: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', shell: 'shellscript',
  yml: 'yaml', md: 'markdown', rs: 'rust', golang: 'go',
  txt: 'text', plaintext: 'text', plain: 'text',
};
export function normalizeCodeLanguage(value: unknown) {
  const supplied = typeof value === 'string' ? value.trim().toLowerCase() : 'text';
  const language = codeLanguageAliases[supplied] || supplied;
  return (codeLanguages as readonly string[]).includes(language) ? language : 'text';
}

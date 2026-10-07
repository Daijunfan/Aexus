/** Reveal a block nested in closed editor toggles before scrolling to it. */
export function revealContent(element: HTMLElement) {
  let parent = element.parentElement;
  while (parent && !parent.classList.contains('bn-editor')) {
    if (parent.classList.contains('bn-block-outer')) {
      parent
        .querySelector<HTMLButtonElement>(
          ':scope > .bn-block > .bn-block-content .bn-toggle-wrapper[data-show-children="false"] > .bn-toggle-button',
        )
        ?.click();
    }
    parent = parent.parentElement;
  }
  element.scrollIntoView({ block: 'center', behavior: 'instant' });
}

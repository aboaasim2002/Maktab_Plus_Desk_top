'use client';

import { useEffect } from 'react';

export default function EnglishDateInputs() {
  useEffect(() => {
    const applyLocale = (root: ParentNode) => {
      root.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="month"]')
        .forEach((input) => {
          input.lang = 'en-GB';
          input.dir = 'ltr';
        });
    };

    applyLocale(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            if (node.matches('input[type="date"], input[type="month"]')) {
              const input = node as HTMLInputElement;
              input.lang = 'en-GB';
              input.dir = 'ltr';
            }
            applyLocale(node);
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

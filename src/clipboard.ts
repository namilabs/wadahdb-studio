declare global {
  interface Window { runtime?: { ClipboardSetText: (text: string) => Promise<boolean> } }
}

export async function copyText(text: string) {
  if (window.runtime?.ClipboardSetText) {
    if (!await window.runtime.ClipboardSetText(text)) throw new Error('Could not copy to clipboard')
  } else {
    await navigator.clipboard.writeText(text)
  }
}

import { useLayoutEffect, useRef, useState } from 'react'

export interface ContextMenuAction {
  label: string
  disabled?: boolean
  run: () => void
}

export default function ContextMenu({ x, y, title, actions, onClose }: {
  x: number
  y: number
  title: string
  actions: ContextMenuAction[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })

  useLayoutEffect(() => {
    const menu = menuRef.current!
    const previous = document.activeElement as HTMLElement | null
    const bounds = menu.getBoundingClientRect()
    setPosition({ x: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)), y: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)) })
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) onClose() }
    const dismiss = () => onClose()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', dismiss)
    document.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', dismiss)
      document.removeEventListener('scroll', dismiss, true)
      if (menu.contains(document.activeElement)) previous?.focus()
    }
  }, [x, y, onClose])

  return <div ref={menuRef} className="context-menu" role="menu" aria-label={`Actions for ${title}`} style={{ left: position.x, top: position.y }} onKeyDown={event => {
    const buttons = Array.from(menuRef.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); onClose() }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    }
  }}>
    <div className="context-menu-title">{title}</div>
    {actions.map(action => <button key={action.label} role="menuitem" disabled={action.disabled} onClick={() => { onClose(); action.run() }}>{action.label}</button>)}
  </div>
}

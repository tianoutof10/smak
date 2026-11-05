import type { ReactNode } from 'react'
import logo from '../../assets/figma/decent-logo.png'
import './sidebarNavigation.css'

export function SidebarBrand({ onClose, closeLabel }: { onClose: () => void; closeLabel: string }) {
  return <div className="settings-brand">
    <img src={logo} alt="Decent" />
    <button className="sidebar-close" type="button" onClick={onClose} aria-label={closeLabel}>×</button>
  </div>
}

export function SidebarNavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button className="sidebar-nav-item" type="button" aria-current={active ? 'page' : undefined} onClick={onClick}>{children}</button>
}

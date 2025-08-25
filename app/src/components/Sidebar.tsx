import React from 'react'

type Props = {
  current: 'orders' | 'statistics' | 'settings'
  onChange: (v: 'orders' | 'statistics' | 'settings') => void
}

export default function Sidebar({ current, onChange }: Props) {
  return (
    <aside className="app-sidebar bg-light border-end" style={{ width: 64 }}>
      <div className="d-flex flex-column align-items-center py-3">
        <button className={`btn mb-2 ${current === 'orders' ? 'btn-primary' : 'btn-outline-secondary'}`} title="Ordini" onClick={() => onChange('orders')}>
          <i className="bi bi-shop" style={{ fontSize: 20 }}></i>
        </button>
        <button className={`btn mb-2 ${current === 'statistics' ? 'btn-primary' : 'btn-outline-secondary'}`} title="Statistiche" onClick={() => onChange('statistics')}>
          <i className="bi bi-bar-chart" style={{ fontSize: 20 }}></i>
        </button>
        <button className={`btn mb-2 ${current === 'settings' ? 'btn-primary' : 'btn-outline-secondary'}`} title="Impostazioni" onClick={() => onChange('settings')}>
          <i className="bi bi-gear" style={{ fontSize: 20 }}></i>
        </button>
      </div>
    </aside>
  )
}

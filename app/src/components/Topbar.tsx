import React from 'react'

type Props = {
  title: string
  page?: 'orders' | 'statistics' | 'settings'
  viewMode?: 'banco' | 'lista'
  setViewMode?: (v: 'banco' | 'lista') => void
}

export default function Topbar({ title, page, viewMode, setViewMode }: Props) {
  return (
    <nav className="navbar app-topbar px-3" style={{ height: 56 }}>
      <div className="container-fluid p-0 d-flex align-items-center justify-content-between">
        <span className="navbar-brand mb-0">{title}</span>

        <div>
          {page === 'orders' && setViewMode && (
            <div className="btn-group" role="group" aria-label="Vista ordini">
              <button type="button" className={`btn btn-md ${viewMode === 'banco' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setViewMode('banco')}>
                <i className="bi bi-shop"></i>
              </button>
              <button type="button" className={`btn btn-md ${viewMode === 'lista' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setViewMode('lista')}>
                <i className="bi bi-list"></i>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

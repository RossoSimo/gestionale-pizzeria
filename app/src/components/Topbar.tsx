import React from 'react'

type Props = { title: string }

export default function Topbar({ title }: Props) {
  return (
    <nav className="navbar navbar-light bg-white border-bottom px-3" style={{ height: 56 }}>
      <div className="container-fluid p-0">
        <span className="navbar-brand mb-0 h4">{title}</span>
        <div />
      </div>
    </nav>
  )
}

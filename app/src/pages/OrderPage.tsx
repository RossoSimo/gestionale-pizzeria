import React, { useMemo, useState } from 'react'

type MenuItem = {
    id: string
    name: string
    price: number
    category: string
}

type CartItem = MenuItem & { qty: number }

type Order = {
    id: string
    createdAt: string
    customerName: string
    customerId?: string
    time: string
    isDelivery: boolean
    phone?: string
    address?: string
    notes?: string
    items: CartItem[]
    subtotal: number
}

const MENU: MenuItem[] = [
    { id: 'p1', name: 'Margherita', price: 6.5, category: 'Pizza' },
    { id: 'p2', name: 'Marinara', price: 6.0, category: 'Pizza' },
    { id: 'p3', name: 'Diavola', price: 8.0, category: 'Pizza' },
    { id: 'p4', name: 'A', price: 8.0, category: 'Pizza' },
    { id: 'p5', name: 'V', price: 8.0, category: 'Pizza' },
    { id: 'p6', name: 'B', price: 8.0, category: 'Pizza' },
    { id: 'e1', name: 'Patatine', price: 3.5, category: 'Extra' },
    { id: 'e2', name: 'Olive', price: 2.5, category: 'Extra' },
    { id: 'd1', name: 'Acqua 0.5L', price: 1.5, category: 'Bevande' },
    { id: 'd2', name: 'Coca-Cola 0.33L', price: 2.5, category: 'Bevande' },
]

export default function OrderPage() {
    // menu categories are available in MENU items when needed
    const [cart, setCart] = useState<CartItem[]>([])
    const [customerName, setCustomerName] = useState<string>('')
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
    type Customer = { id: string; name: string; phone?: string; address?: string }
    const [customers, setCustomers] = useState<Customer[]>(() => [
        { id: 'c1', name: 'Rossi Mario', phone: '3331112222', address: 'Via Roma 1' },
        { id: 'c2', name: 'Bianchi Anna', phone: '3333334444' },
    ])
    const [customerQuery, setCustomerQuery] = useState<string>('')
    const [showSuggestions, setShowSuggestions] = useState<boolean>(false)
    const searchRef = React.useRef<HTMLDivElement | null>(null)
    const [time, setTime] = useState<string>('')
    const [isDelivery, setIsDelivery] = useState<boolean>(false)
    const [phone, setPhone] = useState<string>('')
    const [address, setAddress] = useState<string>('')
    const [notes, setNotes] = useState<string>('')
    const [showAddModal, setShowAddModal] = useState(false)
    const [newCustName, setNewCustName] = useState('')
    const [newCustPhone, setNewCustPhone] = useState('')
    const [newCustAddress, setNewCustAddress] = useState('')
    const [viewMode, setViewMode] = useState<'banco' | 'lista'>('banco')
    const [orders, setOrders] = useState<Order[]>([])

    // click outside to close suggestions
    React.useEffect(() => {
        function onDocClick(e: MouseEvent) {
            const el = searchRef.current
            if (!el) return
            if (e.target instanceof Node && !el.contains(e.target)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('click', onDocClick)
        return () => document.removeEventListener('click', onDocClick)
    }, [])

    // generate time options every stepMin minutes between startHour and endHour (inclusive)
    function generateTimeOptions(startHour = 17, endHour = 22, stepMin = 10) {
        const opts: string[] = []
        const start = startHour * 60
        const end = endHour * 60
        for (let t = start; t <= end; t += stepMin) {
            const h = Math.floor(t / 60)
            const m = t % 60
            const hh = String(h).padStart(2, '0')
            const mm = String(m).padStart(2, '0')
            opts.push(`${hh}:${mm}`)
        }
        return opts
    }
    const timeOptions = useMemo(() => generateTimeOptions(17, 22, 10), [])

    function addToCart(item: MenuItem) {
        setCart((prev) => {
            const found = prev.find((p) => p.id === item.id)
            if (found) {
                return prev.map((p) => (p.id === item.id ? { ...p, qty: p.qty + 1 } : p))
            }
            return [{ ...item, qty: 1 }, ...prev]
        })
    }

    function changeQty(id: string, delta: number) {
        setCart((prev) =>
            prev
                .map((p) => (p.id === id ? { ...p, qty: Math.max(0, p.qty + delta) } : p))
                .filter((p) => p.qty > 0),
        )
    }

    function removeItem(id: string) {
        setCart((prev) => prev.filter((p) => p.id !== id))
    }

    // when no local category filter is used, show all menu items
    const filtered = MENU

    const subtotal = cart.reduce((s, it) => s + it.price * it.qty, 0)

    function submitOrder() {
        if (cart.length === 0) {
            alert('Il carrello è vuoto')
            return
        }
        if (!customerName.trim()) {
            alert('Inserisci il nome del cliente')
            return
        }
        if (!time.trim()) {
            alert('Inserisci l\'orario di ritiro/consegna')
            return
        }
        if (isDelivery) {
            if (!phone.trim()) {
                alert('Inserisci il numero di cellulare per la consegna')
                return
            }
            if (!address.trim()) {
                alert('Inserisci l\'indirizzo di consegna')
                return
            }
        }
        const order = {
            id: `ORD-${Date.now()}`,
            createdAt: new Date().toISOString(),
            customerName,
            customerId: selectedCustomerId ?? undefined,
            time,
            isDelivery,
            phone: isDelivery ? phone : undefined,
            address: isDelivery ? address : undefined,
            notes: notes || undefined,
            items: cart,
            subtotal,
        }
        // For now, just log and show a confirmation. In a real app you'd save/send this.
        console.log('New order:', order)
        // save order in local list
        setOrders((s) => [order, ...s])
        alert(`Ordine inviato: ${order.id} — Totale €${subtotal.toFixed(2)}`)
        setCart([])
    }

    return (
        <div className="container-fluid h-100 d-flex flex-column p-0">
            <header className="bg-dark text-white p-3">
                <div className="d-flex align-items-center justify-content-between">
                    <h1 className="h5 m-0">Gestionale Pizzeria - Asporto</h1>
                    <div>
                        <div className="btn-group" role="group" aria-label="Vista ordini">
                            <button type="button" className={`btn btn-sm ${viewMode === 'banco' ? 'btn-primary' : 'btn-outline-light'}`} onClick={() => setViewMode('banco')}>
                                <i className="bi bi-shop"></i>
                            </button>
                            <button type="button" className={`btn btn-sm ${viewMode === 'lista' ? 'btn-primary' : 'btn-outline-light'}`} onClick={() => setViewMode('lista')}>
                                <i className="bi bi-list"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="row g-2 mt-3">
                    <div className="col-12 col-md-4 position-relative" ref={searchRef}>
                        <label className="form-label text-white small">Cliente</label>
                        <div className="input-group input-group-lg">
                            <input
                                className="form-control"
                                placeholder="Cerca cliente..."
                                value={customerQuery}
                                onChange={(e) => {
                                    setCustomerQuery(e.target.value)
                                    // clear selected id when typing
                                    setSelectedCustomerId(null)
                                    setShowSuggestions(true)
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onKeyDown={(e) => { if (e.key === 'Escape') setShowSuggestions(false) }}
                                aria-label="Cerca cliente"
                            />
                            <button className="btn btn-outline-light" type="button" onClick={() => { setShowAddModal(true); setShowSuggestions(false); }}>Nuovo</button>
                        </div>
                        {/* suggestions */}
                        {showSuggestions && customerQuery.trim().length > 0 && (
                            <div className="list-group position-absolute w-100 mt-1" style={{ zIndex: 1050 }}>
                                {customers
                                    .filter((c) => c.name.toLowerCase().includes(customerQuery.toLowerCase()))
                                    .slice(0, 6)
                                    .map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            className="list-group-item list-group-item-action"
                                            onClick={() => {
                                                setCustomerName(c.name)
                                                setPhone(c.phone ?? '')
                                                setAddress(c.address ?? '')
                                                setSelectedCustomerId(c.id)
                                                setCustomerQuery(c.name)
                                                setShowSuggestions(false)
                                            }}
                                        >
                                            <div className="fw-semibold">{c.name}</div>
                                            <div className="small text-muted">{c.phone ?? ''} {c.address ? '· ' + c.address : ''}</div>
                                        </button>
                                    ))}
                                {customers.filter((c) => c.name.toLowerCase().includes(customerQuery.toLowerCase())).length === 0 && (
                                    <div className="list-group-item">Nessun cliente trovato</div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="col-12 col-md-3">
                        <label className="form-label text-white small">Orario</label>
                        <select className="form-select form-select-lg" value={time} onChange={(e) => setTime(e.target.value)}>
                            <option value="">Orario</option>
                            {timeOptions.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-12 col-md-5 d-flex align-items-center">
                        <div className="btn-group btn-group-lg" role="group" aria-label="Modalità ordine">
                            <button
                                type="button"
                                className={`btn btn-animated ${!isDelivery ? 'btn-primary' : 'btn-outline-light'}`}
                                onClick={() => setIsDelivery(false)}
                                aria-pressed={!isDelivery}
                            >
                                <i className="bi bi-cart3 ico" aria-hidden></i>
                                Ritiro
                            </button>
                            <button
                                type="button"
                                className={`btn btn-animated ${isDelivery ? 'btn-warning text-dark' : 'btn-outline-light'}`}
                                onClick={() => setIsDelivery(true)}
                                aria-pressed={isDelivery}
                            >
                                <i className="bi bi-truck ico" aria-hidden></i>
                                Consegna
                            </button>
                        </div>
                        <div className="ms-3 text-white small">
                            {isDelivery ? 'Inserisci dati di consegna' : 'Orario di ritiro'}
                        </div>
                    </div>
                    {isDelivery && (
                        <div className="col-12 mt-2">
                            <div className="row g-2">
                                <div className="col-12 col-md-6">
                                    <label className="form-label text-white small">Cellulare</label>
                                    <input className="form-control form-control-lg" placeholder="Numero di cellulare" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                </div>
                                <div className="col-12 col-md-6">
                                    <label className="form-label text-white small">Indirizzo</label>
                                    <input className="form-control form-control-lg" placeholder="Indirizzo di consegna" value={address} onChange={(e) => setAddress(e.target.value)} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* Add customer modal (simple in-React modal) */}
            {showAddModal && (
                <>
                    <div className="modal-backdrop show"></div>
                    <div className="modal show d-block" tabIndex={-1} role="dialog">
                        <div className="modal-dialog" role="document">
                            <div className="modal-content">
                                <div className="modal-header">
                                    <h5 className="modal-title">Nuovo cliente</h5>
                                    <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowAddModal(false)}></button>
                                </div>
                                <div className="modal-body">
                                    <div className="mb-2">
                                        <label className="form-label">Nome</label>
                                        <input className="form-control" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} />
                                    </div>
                                    <div className="mb-2">
                                        <label className="form-label">Cellulare</label>
                                        <input className="form-control" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} />
                                    </div>
                                    <div className="mb-2">
                                        <label className="form-label">Indirizzo</label>
                                        <input className="form-control" value={newCustAddress} onChange={(e) => setNewCustAddress(e.target.value)} />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Annulla</button>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => {
                                            const name = newCustName.trim()
                                            if (!name) return alert('Inserisci un nome')
                                            const id = `c${Date.now()}`
                                            const c = { id, name, phone: newCustPhone.trim() || undefined, address: newCustAddress.trim() || undefined }
                                            setCustomers((s) => [c, ...s])
                                            setSelectedCustomerId(id)
                                            setCustomerName(name)
                                            setCustomerQuery(name)
                                            setPhone(c.phone ?? '')
                                            setAddress(c.address ?? '')
                                            setNewCustName('')
                                            setNewCustPhone('')
                                            setNewCustAddress('')
                                            setShowAddModal(false)
                                        }}
                                    >
                                        Aggiungi
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <div className="flex-grow-1 d-flex p-3" style={{ gap: 12 }}>
                {viewMode === 'banco' ? (
                    <>
                        {/* categories sidebar removed - using global sidebar for navigation */}

                        <main className="flex-fill me-3">
                            <div className="row g-3">
                                {filtered.map((m) => (
                                    <div key={m.id} className="col-6 col-md-4 col-lg-3">
                                        <button
                                            onClick={() => addToCart(m)}
                                            className="btn btn-light shadow-sm w-100 p-3 btn-lg d-flex flex-column align-items-center justify-content-center btn-animated"
                                        >
                                            <div className="fw-semibold d-flex align-items-center"><i className="bi bi-basket ico" aria-hidden></i>{m.name}</div>
                                            <div className="text-muted">€{m.price.toFixed(2)}</div>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </main>

                        <aside style={{ width: 360 }}>
                            <div className="card h-100">
                                <div className="card-body d-flex flex-column h-100">
                                    <h5 className="card-title">Carrello</h5>

                                    <ul
                                        className="list-group list-group-flush"
                                        style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 500px)' }}
                                    >
                                        {cart.length === 0 && <li className="list-group-item text-muted">Vuoto</li>}
                                        {cart.length > 0 && (() => {
                                            const grouped: Record<string, CartItem[]> = {}
                                            cart.forEach((it) => {
                                                if (!grouped[it.category]) grouped[it.category] = []
                                                grouped[it.category].push(it)
                                            })

                                            const sections: { key: string; title: string }[] = [
                                                { key: 'Pizza', title: 'Pizze' },
                                                { key: 'Extra', title: 'Extra' },
                                                { key: 'Bevande', title: 'Bibite' },
                                            ]

                                            return (
                                                <>
                                                    {sections.map((sec) => {
                                                        const items = grouped[sec.key]
                                                        if (!items || items.length === 0) return null
                                                        return (
                                                            <React.Fragment key={sec.key}>
                                                                <li className="list-group-item bg-light text-muted small fw-bold">{sec.title}</li>
                                                                {items.map((c) => (
                                                                    <li key={c.id} className="list-group-item d-flex align-items-center justify-content-between">
                                                                        <div>
                                                                            <div className="fw-bold">{c.name}</div>
                                                                            <div className="text-muted">€{(c.price * c.qty).toFixed(2)}</div>
                                                                        </div>
                                                                        <div className="d-flex align-items-center" style={{ gap: 6 }}>
                                                                            <div className="btn-group" role="group" aria-label="Quantità">
                                                                                <button className="btn btn-outline-secondary btn-sm btn-animated" onClick={() => changeQty(c.id, -1)} aria-label="Riduci"><i className="bi bi-dash" aria-hidden></i></button>
                                                                                <button className="btn btn-light btn-sm" disabled aria-label="Quantità">{c.qty}</button>
                                                                                <button className="btn btn-outline-secondary btn-sm btn-animated" onClick={() => changeQty(c.id, 1)} aria-label="Aumenta"><i className="bi bi-plus" aria-hidden></i></button>
                                                                            </div>
                                                                            <button className="btn btn-outline-danger btn-sm ms-2 btn-animated" onClick={() => removeItem(c.id)} aria-label="Rimuovi"><i className="bi bi-trash" aria-hidden></i></button>
                                                                        </div>
                                                                    </li>
                                                                ))}
                                                            </React.Fragment>
                                                        )
                                                    })}
                                                </>
                                            )
                                        })()}
                                    </ul>

                                    <div className="mt-3">
                                        <label className="form-label">Note:</label>
                                        <textarea className="form-control" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="" />
                                    </div>

                                    <div className="mt-3">
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                            <div className="fs-5 fw-bold">Totale</div>
                                            <div className="fs-5">€{subtotal.toFixed(2)}</div>
                                        </div>
                                        <div className="d-flex gap-2">
                                            <button className="btn btn-secondary flex-fill" onClick={() => setCart([])} disabled={cart.length === 0}>Svuota</button>
                                            <button className="btn btn-success flex-fill" onClick={submitOrder}>Invia Ordine</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </aside>
                    </>
                ) : (
                    <main className="flex-fill">
                        <div className="card">
                            <div className="card-body">
                                <h5 className="card-title">Lista ordini</h5>
                                {orders.length === 0 && <div className="text-muted">Nessun ordine</div>}
                                {orders.map((o) => (
                                    <div key={o.id} className="border rounded p-2 mb-2">
                                        <div className="d-flex justify-content-between">
                                            <div><strong>{o.customerName}</strong> <small className="text-muted">{o.time}</small></div>
                                            <div><strong>€{o.subtotal.toFixed(2)}</strong></div>
                                        </div>
                                        <div className="small text-muted">{o.items.length} articoli • {o.isDelivery ? 'Consegna' : 'Ritiro'}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </main>
                )}
            </div>
        </div>
    )
}

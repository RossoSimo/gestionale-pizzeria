import React, { useMemo, useState } from 'react'

type MenuItem = {
  id: string
  name: string
  price: number
  category: string
}

type CartItem = MenuItem & { qty: number }

const MENU: MenuItem[] = [
  { id: 'p1', name: 'Margherita', price: 6.5, category: 'Pizza' },
  { id: 'p2', name: 'Marinara', price: 6.0, category: 'Pizza' },
  { id: 'p3', name: 'Diavola', price: 8.0, category: 'Pizza' },
  { id: 'e1', name: 'Patatine', price: 3.5, category: 'Extra' },
  { id: 'e2', name: 'Olive', price: 2.5, category: 'Extra' },
  { id: 'd1', name: 'Acqua 0.5L', price: 1.5, category: 'Bevande' },
  { id: 'd2', name: 'Coca-Cola 0.33L', price: 2.5, category: 'Bevande' },
]

export default function OrderPage() {
  const categories = useMemo(() => Array.from(new Set(MENU.map((m) => m.category))), [])
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] ?? '')
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerName, setCustomerName] = useState<string>('')
  const [time, setTime] = useState<string>('')
  const [isDelivery, setIsDelivery] = useState<boolean>(false)
  const [phone, setPhone] = useState<string>('')
  const [address, setAddress] = useState<string>('')

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

  const filtered = MENU.filter((m) => m.category === activeCategory)

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
      time,
      isDelivery,
      phone: isDelivery ? phone : undefined,
      address: isDelivery ? address : undefined,
      items: cart,
      subtotal,
    }
    // For now, just log and show a confirmation. In a real app you'd save/send this.
    console.log('New order:', order)
    alert(`Ordine inviato: ${order.id} — Totale €${subtotal.toFixed(2)}`)
    setCart([])
  }

  return (
    <div className="container-fluid h-100 d-flex flex-column p-0">
      <header className="bg-dark text-white p-3">
        <div className="d-flex align-items-center justify-content-between">
          <h1 className="h5 m-0">Gestionale Pizzeria - Asporto</h1>
        </div>

        <div className="row g-2 mt-3">
          <div className="col-12 col-md-4">
            <input
              className="form-control form-control-lg"
              placeholder="Nome cliente"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div className="col-12 col-md-3">
            <select className="form-select form-select-lg" value={time} onChange={(e) => setTime(e.target.value)}>
              <option value="">Orario</option>
              {timeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-5 d-flex align-items-center">
            <div className="form-check form-switch ms-0">
              <input className="form-check-input" type="checkbox" id="deliverySwitch" checked={isDelivery} onChange={(e) => setIsDelivery(e.target.checked)} />
              <label className="form-check-label ms-2" htmlFor="deliverySwitch">Consegna</label>
            </div>
          </div>
          {isDelivery && (
            <div className="col-12 mt-2">
              <div className="row g-2">
                <div className="col-12 col-md-6">
                  <input className="form-control form-control-lg" placeholder="Numero di cellulare" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="col-12 col-md-6">
                  <input className="form-control form-control-lg" placeholder="Indirizzo di consegna" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex-grow-1 d-flex p-3" style={{ gap: 12 }}>
        <div style={{ width: 200 }} className="me-3 d-flex flex-column">
          <div className="btn-group-vertical w-100" role="group" aria-label="Categorie">
            {categories.map((c) => (
              <button
                key={c}
                className={`btn btn-outline-primary btn-lg text-truncate ${c === activeCategory ? 'active' : ''}`}
                onClick={() => setActiveCategory(c)}
                aria-pressed={c === activeCategory}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <main className="flex-fill me-3">
          <div className="row g-3">
            {filtered.map((m) => (
              <div key={m.id} className="col-6 col-md-4 col-lg-3">
                <button
                  onClick={() => addToCart(m)}
                  className="btn btn-light shadow-sm w-100 p-3 btn-lg d-flex flex-column align-items-center justify-content-center"
                >
                  <div className="fw-semibold">{m.name}</div>
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

              <ul className="list-group list-group-flush flex-grow-1 overflow-auto">
                {cart.length === 0 && <li className="list-group-item text-muted">Vuoto</li>}
                {cart.map((c) => (
                  <li key={c.id} className="list-group-item d-flex align-items-center justify-content-between">
                    <div>
                      <div className="fw-bold">{c.name}</div>
                      <div className="text-muted">€{(c.price * c.qty).toFixed(2)}</div>
                    </div>
                    <div className="d-flex align-items-center" style={{ gap: 6 }}>
                      <div className="btn-group" role="group" aria-label="Quantità">
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => changeQty(c.id, -1)}>-</button>
                        <button className="btn btn-light btn-sm" disabled>{c.qty}</button>
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => changeQty(c.id, 1)}>+</button>
                      </div>
                      <button className="btn btn-outline-danger btn-sm ms-2" onClick={() => removeItem(c.id)}>×</button>
                    </div>
                  </li>
                ))}
              </ul>

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
      </div>
    </div>
  )
}

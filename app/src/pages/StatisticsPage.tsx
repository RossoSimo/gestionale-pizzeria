import React, { useMemo, useState } from 'react'
import { CartItem } from '../data/types'
import { OrderRow } from '../types/db'
import { getOrdersCached, clearOrdersCache } from '../utils/ordersCache'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

type Order = { items?: CartItem[]; createdAt?: string }

function filterByRange(orders: Order[], range: 'day' | 'week' | 'month' | 'all') {
  if (range === 'all') return orders
  const now = Date.now()
  const cutoff = range === 'day' ? now - 24 * 3600 * 1000 : range === 'week' ? now - 7 * 24 * 3600 * 1000 : now - 30 * 24 * 3600 * 1000
  return orders.filter(o => {
    const t = o && o.createdAt ? Date.parse(o.createdAt) : NaN
    return !Number.isNaN(t) && t >= cutoff
  })
}

export default function StatisticsPage() {
  const [range, setRange] = useState<'day' | 'week' | 'month' | 'all'>('week')
  const [reloadKey, setReloadKey] = useState(0)
  const [orders, setOrders] = useState<Order[]>([])

  // load orders: try DB first, fallback to cache/localStorage
  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await window.api.getOrders()
        if (res && res.success) {
          const dbOrders = res.result || []
          const normalized = (dbOrders || []).map((o: OrderRow) => ({ ...o, createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '' }))
          if (mounted) setOrders(normalized as Order[])
        } else {
          const cached = getOrdersCached() as unknown as Order[]
          if (mounted) setOrders(cached || [])
        }
      } catch (e) {
        console.error('Failed to load orders via IPC, falling back to cache', e)
        const cached = getOrdersCached() as unknown as Order[]
        if (mounted) setOrders(cached || [])
      }
    })()
    return () => { mounted = false }
  }, [reloadKey])

  const filtered = useMemo(() => filterByRange(orders, range), [orders, range, reloadKey])
  const items = filtered.flatMap(o => (o && o.items) || []) as CartItem[]

  const salesByCategory = useMemo(() => {
    const m = items.reduce<Record<string, number>>((acc, it) => {
      acc[it.category] = (acc[it.category] || 0) + it.qty * it.price
      return acc
    }, {})
    const labels = Object.keys(m)
    const data = labels.map(l => Number((m[l] || 0).toFixed(2)))
    return { labels, data }
  }, [items])

  const topProducts = useMemo(() => {
    const counts = items.reduce<Record<string, number>>((acc, it) => {
      acc[it.name] = (acc[it.name] || 0) + it.qty
      return acc
    }, {})
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    return { labels: entries.map(e => e[0]), data: entries.map(e => e[1]) }
  }, [items])

  // summary metrics
  const totalOrders = filtered.length
  const totalRevenue = items.reduce((s, it) => s + it.qty * it.price, 0)
  const avgPerOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0

  const palette = ['#2563eb', '#1e40af', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

  const barOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    animation: { duration: 800, easing: 'easeOutQuart' },
    scales: { y: { beginAtZero: true } }
  }
  const doughnutOptions = {
    responsive: true,
    plugins: { legend: { position: 'right' as const } },
    animation: { duration: 800, easing: 'easeOutQuart' }
  }

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="m-0">Statistiche</h3>
        <div>
          <div className="btn-group me-2" role="group" aria-label="Seleziona intervallo temporale">
            <button aria-pressed={range === 'day'} className={`btn btn-sm ${range === 'day' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setRange('day')}>Giorno</button>
            <button aria-pressed={range === 'week'} className={`btn btn-sm ${range === 'week' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setRange('week')}>Settimana</button>
            <button aria-pressed={range === 'month'} className={`btn btn-sm ${range === 'month' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setRange('month')}>Mese</button>
            <button aria-pressed={range === 'all'} className={`btn btn-sm ${range === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setRange('all')}>Tutto</button>
          </div>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => { clearOrdersCache(); setReloadKey(k => k + 1) }} aria-label="Aggiorna dati"><i className="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>Aggiorna dati</button>
        </div>
      </div>

      <div role="status" aria-live="polite" className="mb-3">
        <div className="row g-2">
          <div className="col-12 col-md-4">
            <div className="card p-3 text-center">
              <div className="h6">Totale ordini</div>
              <div className="fs-4 fw-bold">{totalOrders}</div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="card p-3 text-center">
              <div className="h6">Ricavo totale</div>
              <div className="fs-4 fw-bold">€{totalRevenue.toFixed(2)}</div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="card p-3 text-center">
              <div className="h6">Media per ordine</div>
              <div className="fs-4 fw-bold">€{avgPerOrder.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-md-7">
          <div className="card p-3">
            <h5>Fatturato per categoria</h5>
            <div aria-hidden={false} aria-label="Grafico a barre del fatturato per categoria">
              <Bar
                options={barOptions}
                data={{
                  labels: salesByCategory.labels,
                  datasets: [{
                    label: '€',
                    data: salesByCategory.data,
                    backgroundColor: salesByCategory.labels.map((_, i) => palette[i % palette.length]),
                    borderRadius: 6
                  }]
                }}
              />
            </div>
            <div className="visually-hidden" id="salesByCategoryDesc">Grafico a barre che mostra il fatturato per categoria nel periodo selezionato.</div>
            {/* Textual alternative for screen readers: sales by category */}
            <div className="visually-hidden" aria-live="polite" aria-label="Dettaglio testuale fatturato per categoria">
              {salesByCategory.labels && salesByCategory.labels.length > 0 ? (
                <>
                  <p>Fatturato per categoria nel periodo selezionato:</p>
                  <ul>
                    {salesByCategory.labels.map((lab, i) => (
                      <li key={lab}>{lab}: €{(salesByCategory.data[i] || 0).toFixed(2)}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Nessun fatturato registrato nel periodo selezionato.</p>
              )}
            </div>
          </div>
        </div>
        <div className="col-12 col-md-5">
          <div className="card p-3">
            <h5>Prodotti più ordinati</h5>
            <div aria-hidden={false} aria-label="Grafico a torta dei prodotti più ordinati">
              <Doughnut
                options={doughnutOptions}
                data={{
                  labels: topProducts.labels,
                  datasets: [{ data: topProducts.data, backgroundColor: topProducts.labels.map((_, i) => palette[i % palette.length]), hoverOffset: 8 }]
                }}
              />
            </div>
            <div className="visually-hidden" id="topProductsDesc">Grafico a torta che mostra i prodotti più ordinati nel periodo selezionato.</div>
            {/* Textual alternative for screen readers: top products list */}
            <div className="visually-hidden" aria-live="polite" aria-label="Dettaglio testuale prodotti più ordinati">
              {topProducts.labels && topProducts.labels.length > 0 ? (
                <>
                  <p>Prodotti più ordinati nel periodo selezionato:</p>
                  <ol>
                    {topProducts.labels.map((lab, i) => (
                      <li key={lab}>{lab}: {topProducts.data[i] || 0} ordini</li>
                    ))}
                  </ol>
                </>
              ) : (
                <p>Nessun prodotto ordinato nel periodo selezionato.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

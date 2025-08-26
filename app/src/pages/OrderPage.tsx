import React, { useMemo, useState, useRef } from 'react'
import { MenuRow, IngredientRow, CustomerRow } from '../types/db'
import { INGREDIENT_ALLERGENS } from '../data/ingredientAllergens'
import { MenuItem, CartItem, Order, Customer } from '../data/types'

export default function OrderPage({ viewMode }: { viewMode: 'banco' | 'lista' }) {

    const [productIngredients, setProductIngredients] = useState<string[]>([])
    const [newIngredientText, setNewIngredientText] = useState<string>('')
    const [productNote, setProductNote] = useState<string>('')

    // core UI state
    const [cart, setCart] = useState<CartItem[]>([])
    const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null)
    const [customers, setCustomers] = useState<Customer[]>([])
    const [menu, setMenu] = useState<MenuItem[]>([])
    const [ingredientsList, setIngredientsList] = useState<string[]>([])
    const [categories, setCategories] = useState<string[]>([])
    const [orders, setOrders] = useState<Order[]>([])
    const [editingCartKey, setEditingCartKey] = useState<string | null>(null)
    const [lastEditedId, setLastEditedId] = useState<string | null>(null)
    const lastEditedTimer = useRef<number | null>(null)

    // customer/search form state
    const [customerQuery, setCustomerQuery] = useState<string>('')
    const [customerName, setCustomerName] = useState<string>('')
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
    const [showSuggestions, setShowSuggestions] = useState<boolean>(false)
    const [showAddModal, setShowAddModal] = useState<boolean>(false)
    const [newCustName, setNewCustName] = useState<string>('')
    const [newCustPhone, setNewCustPhone] = useState<string>('')
    const [newCustAddress, setNewCustAddress] = useState<string>('')

    const [phone, setPhone] = useState<string>('')
    const [address, setAddress] = useState<string>('')
    const [notes, setNotes] = useState<string>('')
    const [isDelivery, setIsDelivery] = useState<boolean>(false)
    const [time, setTime] = useState<string>('')
    // date for the order (pickup/delivery date) - default today
    const todayISODate = new Date().toISOString().slice(0, 10)
    const [date, setDate] = useState<string>(todayISODate)
    const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' | 'error'; visible: boolean }>({ message: '', type: 'info', visible: false })

    // viewMode is received from parent App (Topbar controls it)

    const searchRef = useRef<HTMLDivElement | null>(null)

    // long-press helpers for touch: press to open modal, tap to quick-add
    const longPressTimer = useRef<number | null>(null)
    const lpShowTimer = useRef<number | null>(null) // timer to reveal the progress ring after a short delay
    const longPressFired = useRef(false)
    const pressStartPos = useRef<{ x: number; y: number } | null>(null)
    const [pressingId, setPressingId] = useState<string | null>(null)
    const [showRingId, setShowRingId] = useState<string | null>(null)
    const pressPointRef = useRef<{ x: number; y: number } | null>(null)
    const pressRelRef = useRef<{ left: number; top: number } | null>(null)
    const [ringPos, setRingPos] = useState<{ left: number; top: number } | null>(null)
    const ringHideTimer = useRef<number | null>(null)
    const ringPosClearTimer = useRef<number | null>(null)
    const LONG_PRESS_MS = 540
    const LP_RING_DELAY_MS = 100
    const POST_RING_VISIBLE_MS = 240
    const RING_FADE_MS = 150

    function openProductModal(m: MenuItem) {
        setSelectedProduct(m)
        setProductIngredients(m.ingredients ?? [])
    setProductNote('')
    }

    function startEditCartItem(cartId: string) {
        const ci = cart.find((c) => c.id === cartId)
        if (!ci) return
    const product = menu.find((p) => p.id === ci.productId)
        if (!product) return
        setEditingCartKey(cartId)
        setSelectedProduct(product)
    setProductNote(ci.note ?? '')
        // if undefined -> defaults, if [] -> explicit none
        if (ci.selectedIngredients === undefined) {
            setProductIngredients(product.ingredients ?? [])
        } else {
            setProductIngredients(ci.selectedIngredients.slice())
        }
    }

    function saveEditedCartItem(product: MenuItem | null, selectedIngredients: string[]) {
        if (!product || !editingCartKey) return
        // For drinks, always use defaults and disallow customizations
        const normalizedSelected = (product.category === 'Bevande') ? (product.ingredients ?? []).slice() : (selectedIngredients || []).slice()

        const defaultIngredients = product.ingredients ?? []
        const arraysEqual = (a: string[] = [], b: string[] = []) => {
            if (a.length !== b.length) return false
            const sa = a.slice().sort()
            const sb = b.slice().sort()
            for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false
            return true
        }
        const isSameAsDefault = arraysEqual(normalizedSelected, defaultIngredients)
    // incorporate the note into the key so items with different notes don't merge
    const noteSuffix = productNote.trim() ? `::note:${productNote.trim().replace(/::/g, ' ')}` : ''
    const suffix = normalizedSelected.length ? normalizedSelected.slice().sort().join('|') : '__NONE__'
    const newKey = (isSameAsDefault ? product.id : `${product.id}::${suffix}`) + noteSuffix

        setCart((prev) => {
            const foundIdx = prev.findIndex((p) => p.id === editingCartKey)
            if (foundIdx === -1) return prev
            const original = prev[foundIdx]

            // remove the original item
            const removed = prev.filter((p) => p.id !== editingCartKey)

            // if there's already an item with newKey, merge quantities
            const existingIdx = removed.findIndex((p) => p.id === newKey)
            if (existingIdx !== -1) {
                // merge qty into existing
                const merged = removed.map((p, i) => i === existingIdx ? { ...p, qty: p.qty + original.qty } : p)
                // highlight merged row (600ms)
                if (lastEditedTimer.current) { window.clearTimeout(lastEditedTimer.current); lastEditedTimer.current = null }
                lastEditedTimer.current = window.setTimeout(() => setLastEditedId(null), 600)
                setLastEditedId(newKey)
                return merged
            }

            // otherwise create a new cart item with same qty and insert at top
            const cartItem: CartItem = {
                ...product,
                id: newKey,
                productId: product.id,
                qty: original.qty,
                selectedIngredients: isSameAsDefault ? undefined : (normalizedSelected.length ? normalizedSelected.slice() : []),
                note: productNote.trim() ? productNote.trim() : undefined,
            }
            return [cartItem, ...removed]
        })

    // highlight the newly created/updated cart row briefly (600ms)
    if (lastEditedTimer.current) { window.clearTimeout(lastEditedTimer.current); lastEditedTimer.current = null }
    lastEditedTimer.current = window.setTimeout(() => setLastEditedId(null), 600)
    setLastEditedId(newKey)

    setEditingCartKey(null)
    }

    function cancelLongPress() {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
        }
        if (lpShowTimer.current) {
            clearTimeout(lpShowTimer.current)
            lpShowTimer.current = null
        }
    if (ringHideTimer.current) { clearTimeout(ringHideTimer.current); ringHideTimer.current = null }
    if (ringPosClearTimer.current) { clearTimeout(ringPosClearTimer.current); ringPosClearTimer.current = null }
    setShowRingId(null)
    setRingPos(null)
    pressPointRef.current = null
    pressRelRef.current = null
        longPressFired.current = false
        setPressingId(null)
        pressStartPos.current = null
    }

    function onPointerDownItem(m: MenuItem, e: React.PointerEvent) {
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId) } catch (err) { /* ignore pointer capture failures */ }
        pressStartPos.current = { x: e.clientX, y: e.clientY }
        pressPointRef.current = { x: e.clientX, y: e.clientY }
        try {
            const rect = (e.currentTarget as Element).getBoundingClientRect()
            pressRelRef.current = { left: e.clientX - rect.left, top: e.clientY - rect.top }
        } catch (err) {
            pressRelRef.current = null
        }
    // clear any pending hide/cleanup timers from previous interactions
    if (ringHideTimer.current) { clearTimeout(ringHideTimer.current); ringHideTimer.current = null }
    if (ringPosClearTimer.current) { clearTimeout(ringPosClearTimer.current); ringPosClearTimer.current = null }
        setPressingId(m.id)
        longPressFired.current = false
        // schedule the actual long-press action
        longPressTimer.current = window.setTimeout(() => {
            longPressFired.current = true
            setPressingId(null)
            longPressTimer.current = null
            setShowRingId(null)
            openProductModal(m)
        }, LONG_PRESS_MS)
        // reveal the progress ring only after a short delay so quick taps don't show it
        lpShowTimer.current = window.setTimeout(() => {
            lpShowTimer.current = null
            setShowRingId(m.id)
            // position the ring where the user pressed (relative to the button)
            if (pressRelRef.current) setRingPos(pressRelRef.current)
        }, LP_RING_DELAY_MS)
    }

    function onPointerMoveItem(e: React.PointerEvent) {
        if (!pressStartPos.current) return
        const dx = e.clientX - pressStartPos.current.x
        const dy = e.clientY - pressStartPos.current.y
        if (Math.hypot(dx, dy) > 8) cancelLongPress()
    }

    function onPointerUpItem(m: MenuItem, e: React.PointerEvent) {
    try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId) } catch (err) { /* ignore pointer release failures */ }
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
            if (!longPressFired.current) {
                // treat as tap: quick add to cart
                addToCart(m, m.ingredients ?? [])
            }
        }
        // cleanup any pending visual timers and state
        if (lpShowTimer.current) {
            clearTimeout(lpShowTimer.current)
            lpShowTimer.current = null
        }
        // keep the ring visible for a short moment, then fade it out
        if (showRingId) {
            if (ringHideTimer.current) { clearTimeout(ringHideTimer.current); ringHideTimer.current = null }
            ringHideTimer.current = window.setTimeout(() => {
                ringHideTimer.current = null
                setShowRingId(null)
            }, POST_RING_VISIBLE_MS)
            // clear the ring position after the fade completes
            if (ringPosClearTimer.current) { clearTimeout(ringPosClearTimer.current); ringPosClearTimer.current = null }
            ringPosClearTimer.current = window.setTimeout(() => {
                ringPosClearTimer.current = null
                setRingPos(null)
                pressPointRef.current = null
                pressRelRef.current = null
            }, POST_RING_VISIBLE_MS + RING_FADE_MS)
        } else {
            // if ring wasn't visible yet, just clear immediate state
            setRingPos(null)
            pressPointRef.current = null
            pressRelRef.current = null
        }
        longPressFired.current = false
        setPressingId(null)
        pressStartPos.current = null
    }

    function onPointerCancelItem() {
        cancelLongPress()
    }

    // ingredient->allergen map is imported from data/ingredientAllergens

    // compute allergens dynamically from the currently selected ingredients
    const computedAllergens = React.useMemo(() => {
        if (!selectedProduct) return [] as string[]
        const set = new Set<string>()
        if (selectedProduct.category === 'Pizza') {
            // for pizzas compute allergens dynamically from selected ingredients only
            const selected = productIngredients ?? []
            for (const ing of selected) {
                const als = INGREDIENT_ALLERGENS[ing]
                if (als && als.length) als.forEach((a) => set.add(a))
            }
        } else {
            // for non-pizza items show declared allergens
            (selectedProduct.allergens || []).forEach((a) => set.add(a))
        }
        return Array.from(set)
    }, [selectedProduct, productIngredients])

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

    // load menu, ingredients, categories, additions and customers from DB on mount
    React.useEffect(() => {
        let mounted = true
        ;(async () => {
            try {
                const appPathRes = await window.api.getAppPath()
                const basePath = (appPathRes && appPathRes.success && typeof appPathRes.result === 'string') ? String(appPathRes.result) : ''

                const [menuRes, ingRes, catRes, custRes] = await Promise.all([
                    window.api.getMenu(),
                    window.api.getIngredients(),
                    window.api.getCategories(),
                    window.api.getCustomers(),
                ])

                if (menuRes && menuRes.success) {
                    const normalized = (menuRes.result || []).map((mRaw: unknown) => {
                        const m = mRaw as MenuRow
                        const imgField = m.image ?? ''
                        const resolvedImage = (() => {
                            const img = imgField
                            if (!img) return ''
                            const s = String(img)
                            if (s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://')) return s
                            if (basePath) {
                                const path = basePath.endsWith('/') ? basePath + s : basePath + '/' + s
                                return 'file://' + path.replace(/\\/g, '/')
                            }
                            return s
                        })()
                        return {
                            id: m.id,
                            name: m.name,
                            price: m.price,
                            category: m.category?.name ?? (m.categoryId ? String(m.categoryId) : ''),
                            description: m.description ?? '',
                            image: resolvedImage,
                            allergens: m.allergens ?? [],
                            ingredients: Array.isArray(m.ingredients) ? m.ingredients.map((i) => i.name) : [],
                        }
                    })
                    if (mounted) setMenu(normalized as MenuItem[])
                }

                if (ingRes && ingRes.success) {
                    const names = ((ingRes.result || []) as unknown as { name: string }[]).map((i) => String(i.name))
                    if (mounted) setIngredientsList(names)
                }

                if (catRes && catRes.success) {
                    if (mounted) setCategories(((catRes.result || []) as unknown as { name: string }[]).map((c) => String(c.name)))
                }


                if (custRes && custRes.success) {
                    if (mounted) setCustomers((custRes.result || []) as Customer[])
                }
            } catch (e) {
                console.error('Failed loading DB data for frontend', e)
            }
        })()
        return () => { mounted = false }
    }, [])

    // image resolution is handled inline where needed (uses app.getAppPath via preload)

    // load existing orders from DB on mount
    React.useEffect(() => {
        let mounted = true
        ;(async () => {
            try {
                const res = await window.api.getOrders()
                if (res && res.success) {
                    const dbOrders = res.result || []
                    type Row = { id: string; createdAt?: string | Date; date?: string | Date; items?: unknown[] }
                    const normalized = (dbOrders as Row[]).map((o) => ({ ...o, createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '', date: o.date ? (typeof o.date === 'string' ? new Date(o.date).toISOString().slice(0,10) : new Date(o.date).toISOString().slice(0,10)) : '' }))
                    if (mounted) setOrders(normalized as Order[])
                } else {
                    // leave orders empty or load from localStorage as fallback
                    try {
                        const local = JSON.parse(localStorage.getItem('orders') || '[]')
                        if (mounted) setOrders(local)
                    } catch {
                        // ignore
                    }
                }
            } catch (e) {
                try {
                    const local = JSON.parse(localStorage.getItem('orders') || '[]')
                    if (mounted) setOrders(local)
                } catch {
                    // ignore
                }
            }
        })()
        return () => { mounted = false }
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

    function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', ms = 2500) {
        setToast({ message, type, visible: true })
        window.setTimeout(() => setToast((t) => ({ ...t, visible: false })), ms)
    }

    function restoreFocusToCustomerSearch() {
        setTimeout(() => {
            try {
                const el = searchRef.current?.querySelector('input') as HTMLInputElement | null
                el?.focus()
            } catch (err) {
                // no-op
            }
        }, 50)
    }

    function addToCart(item: MenuItem, selectedIngredients: string[] = [], note?: string) {
        // helper: compare arrays ignoring order
        const arraysEqual = (a: string[] = [], b: string[] = []) => {
            if (a.length !== b.length) return false
            const sa = a.slice().sort()
            const sb = b.slice().sort()
            for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false
            return true
        }

    const defaultIngredients = item.ingredients ?? []
    // For drinks, always use defaults and disallow customizations
    const normalizedSelected = (item.category === 'Bevande') ? (item.ingredients ?? []).slice() : (selectedIngredients || []).slice()
    const isSameAsDefault = arraysEqual(normalizedSelected, defaultIngredients)

    // generate a stable cart-line id: include selected ingredients when they differ from default
    // if identical to defaults, use the plain item id so lines merge; otherwise append a suffix
    const noteSuffix = (note && note.trim()) ? `::note:${note.trim().replace(/::/g, ' ')}` : ''
    const suffix = normalizedSelected.length ? normalizedSelected.slice().sort().join('|') : '__NONE__'
    const key = (isSameAsDefault ? item.id : `${item.id}::${suffix}`) + noteSuffix

    setCart((prev) => {
            const found = prev.find((p) => p.id === key)
            if (found) {
                return prev.map((p) => (p.id === key ? { ...p, qty: p.qty + 1 } : p))
            }
            const cartItem: CartItem = {
                ...item,
                id: key,
                productId: item.id,
                qty: 1,
        // when identical to default, leave undefined; when explicitly empty, store [] to mean "no ingredients";
        // otherwise store the selected ingredients array
        selectedIngredients: isSameAsDefault ? undefined : (normalizedSelected.length ? normalizedSelected.slice() : []),
    note: (note && note.trim()) ? note.trim() : undefined,
            }
            return [cartItem, ...prev]
        })
    // highlight newly added row briefly
    if (lastEditedTimer.current) { window.clearTimeout(lastEditedTimer.current); lastEditedTimer.current = null }
    lastEditedTimer.current = window.setTimeout(() => setLastEditedId(null), 1000)
    setLastEditedId(key)
    }

    // render only modifications (added/removed) compared to the product defaults
    function renderIngredientDiff(ci: CartItem) {
        // If selectedIngredients is undefined it means "use product defaults" -> no diff
        if (ci.selectedIngredients === undefined) return null

    const product = menu.find((p) => p.id === ci.productId)
        const defaults = product?.ingredients ?? []
        const selected = ci.selectedIngredients
        const added = (selected || []).filter((s) => !defaults.includes(s))
        const removed = defaults.filter((d) => !((selected || []).includes(d)))
        if (added.length === 0 && removed.length === 0) return null
        return (
            <div className="small text-muted">
                {added.map((a) => (
                    <div key={`+${a}`} style={{ color: 'green' }}>+ {a}</div>
                ))}
                {removed.map((r) => (
                    <div key={`-${r}`} style={{ color: 'crimson' }}>- {r}</div>
                ))}
            </div>
        )
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

    // item search and category filter (shown above the items)
    const [itemQuery, setItemQuery] = useState<string>('')
    const [activeItemCategory, setActiveItemCategory] = useState<string>('Tutti')
    const itemCategories = useMemo(() => ['Tutti', ...Array.from(new Set(menu.map((m: MenuItem) => m.category)))], [menu])

    const filtered = menu.filter((m: MenuItem) => {
        const matchesCategory = activeItemCategory === 'Tutti' || m.category === activeItemCategory
        const matchesQuery = m.name.toLowerCase().includes(itemQuery.trim().toLowerCase())
        return matchesCategory && matchesQuery
    })

    const subtotal = cart.reduce((s, it) => s + it.price * it.qty, 0)

    // top products for selected customer (most ordered)
    const topProductsForCustomer = React.useMemo(() => {
        if (!selectedCustomerId) return [] as { itemId: string; count: number }[]
        const counts = new Map<string, { count: number; last: number }>()
        for (const o of orders) {
            if (o.customerId !== selectedCustomerId) continue
            const time = o.createdAt ? Date.parse(o.createdAt) : 0
            for (const it of o.items || []) {
                const pid = it.productId || it.id
                const cur = counts.get(pid) ?? { count: 0, last: 0 }
                cur.count += it.qty || 1
                cur.last = Math.max(cur.last, time)
                counts.set(pid, cur)
            }
        }
        const arr = Array.from(counts.entries()).map(([itemId, v]) => ({ itemId, count: v.count, last: v.last }))
        arr.sort((a, b) => b.count - a.count || b.last - a.last)
        return arr.slice(0, 5).map((x) => ({ itemId: x.itemId, count: x.count }))
    }, [selectedCustomerId, orders])

    function submitOrder() {
        if (cart.length === 0) {
                showToast('Il carrello è vuoto', 'error')
            restoreFocusToCustomerSearch()
            return
        }
        if (!customerName.trim()) {
                showToast('Inserisci il nome del cliente', 'error')
            restoreFocusToCustomerSearch()
            return
        }
        if (!time.trim()) {
                showToast('Inserisci l\'orario di ritiro/consegna', 'error')
            setTimeout(() => { (document.querySelector('select.category-search') as HTMLSelectElement | null)?.focus() }, 50)
            return
        }
        if (isDelivery) {
            if (!phone.trim()) {
                    showToast('Inserisci il numero di cellulare per la consegna', 'error')
                setTimeout(() => { (document.querySelector('input[placeholder="Numero di cellulare"]') as HTMLInputElement | null)?.focus() }, 50)
                return
            }
            if (!address.trim()) {
                    showToast('Inserisci l\'indirizzo di consegna', 'error')
                setTimeout(() => { (document.querySelector('input[placeholder="Indirizzo di consegna"]') as HTMLInputElement | null)?.focus() }, 50)
                return
            }
        }
        const order = {
            id: `ORD-${Date.now()}`,
            createdAt: new Date().toISOString(),
            date,
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
        // Persist the order using Prisma (saveOrder). Fall back to localStorage if DB save fails.
    console.log('New order (attempt save):', order);

                (async () => { try {
                                // use the secure preload bridge
                                const res = await window.api.saveOrder(order)
                                if (res && res.success) {
                                    setOrders((s) => [order, ...s])
                                    showToast(`Ordine inviato: ${order.id} — Totale €${subtotal.toFixed(2)}`, 'success')
                                } else {
                                    console.error('DB save failed via IPC', res?.error)
                                    setOrders((s) => {
                                            const next = [order, ...s]
                                            try { localStorage.setItem('orders', JSON.stringify(next)) } catch (ex) { /* ignore storage errors */ }
                                            return next
                                    })
                                    showToast(`Ordine salvato offline: ${order.id} (DB non raggiungibile)`, 'info')
                                }
                        } catch (e) {
                                console.error('Unexpected error saving order', e)
                                const next = [order, ...orders]
                                try { localStorage.setItem('orders', JSON.stringify(next)) } catch (ex) { /* ignore */ }
                                setOrders(next)
                                showToast(`Ordine salvato offline: ${order.id} (errore imprevisto)`, 'info')
                        } finally {
                                setCart([])
                                restoreFocusToCustomerSearch()
                        } })()
    }

    // Ingredient management helpers inside modal
    function removeIngredient(idx: number) {
        setProductIngredients((s) => s.filter((_, i) => i !== idx))
    }

    return (
        <div className="container-fluid h-100 d-flex flex-column p-0">
            <header className="bg-dark text-white p-3">
            <div className="" />

                <div className="row g-2 mt-3">
                    <div className="col-12 col-md-4 position-relative" ref={searchRef}>
                        {/* <label className="form-label text-white small category-label">Cliente</label> */}
                        <div className="input-group">
                            <input
                                className="form-control category-search"
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
                            <button className="btn btn-outline-light btn-sm" type="button" onClick={() => { setShowAddModal(true); setShowSuggestions(false); }}>Nuovo</button>
                        </div>
                        {/* suggestions */}
                        {showSuggestions && customerQuery.trim().length > 0 && (
                            <div className="list-group position-absolute w-100 mt-1 customer-suggestions" style={{ zIndex: 1050 }}>
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
                    <div className="col-12 col-md-2">
                        {/* <label className="form-label text-white small category-label">Orario</label> */}
                        <select className="form-select category-search" value={time} onChange={(e) => setTime(e.target.value)}>
                            <option value="">Orario</option>
                            {timeOptions.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-12 col-md-2">
                        <input type="date" className="form-control category-search" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data ordine" />
                    </div>
                    <div className="col-12 col-md-5 d-flex align-items-center">
                        <div className="btn-group btn-group-lg" role="group" aria-label="Modalità ordine">
                            <button
                                type="button"
                                className={`btn btn-animated btn-sm px-2 py-1 ${!isDelivery ? 'btn-primary' : 'btn-outline-light'}`}
                                onClick={() => setIsDelivery(false)}
                                aria-pressed={!isDelivery}
                            >
                                <i className="bi bi-cart3 ico" aria-hidden></i>
                                Ritiro
                            </button>
                            <button
                                type="button"
                                className={`btn btn-animated btn-sm px-2 py-1 ${isDelivery ? 'btn-warning text-dark' : 'btn-outline-light'}`}
                                onClick={() => setIsDelivery(true)}
                                aria-pressed={isDelivery}
                            >
                                <i className="bi bi-truck ico" aria-hidden></i>
                                Consegna
                            </button>
                        </div>
                    </div>
                    {isDelivery && (
                        <div className="col-12 mt-2">
                            <div className="row g-2">
                                <div className="col-12 col-md-6">
                                    {/* <label className="form-label text-white small category-label">Cellulare</label> */}
                                    <input className="form-control category-search" placeholder="Numero di cellulare" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                </div>
                                <div className="col-12 col-md-6">
                                    {/* <label className="form-label text-white category-label">Indirizzo</label> */}
                                    <input className="form-control category-search" placeholder="Indirizzo di consegna" value={address} onChange={(e) => setAddress(e.target.value)} />
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
                                        <input className="form-control category-search" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} />
                                    </div>
                                    <div className="mb-2">
                                        <label className="form-label">Cellulare</label>
                                        <input className="form-control category-search" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} />
                                    </div>
                                    <div className="mb-2">
                                        <label className="form-label">Indirizzo</label>
                                        <input className="form-control category-search" value={newCustAddress} onChange={(e) => setNewCustAddress(e.target.value)} />
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

            {/* Product details modal */}
            {selectedProduct && (
                <>
                    <div className="modal-backdrop show"></div>
                    <div className="modal show d-block product-modal" tabIndex={-1} role="dialog">
                        <div className="modal-dialog modal-lg" role="document">
                            <div className="modal-content">
                                <div className="modal-header">
                                    <h5 className="modal-title">{selectedProduct.name}</h5>
                                    <button type="button" className="btn-close" aria-label="Close" onClick={() => setSelectedProduct(null)}></button>
                                </div>
                                <div className="modal-body">
                                    <div className="text-center">
                                        {/* placeholder image if none */}
                                        <img className="product-modal-image" src={selectedProduct.image || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="%23f3f4f6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%230f172a" font-size="24">Img</text></svg>'} alt={selectedProduct.name} />
                                        <div className="mb-2 fw-bold">€{selectedProduct.price.toFixed(2)}</div>
                                        <div className="text-muted mb-2">{selectedProduct.description}</div>
                                        <div className="allergens-badges mb-2">
                                            {computedAllergens.length === 0 && <small className="text-muted">Nessun allergene noto</small>}
                                            {computedAllergens.map((a) => (
                                                <span key={a} className="badge bg-danger me-1">{a}</span>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h6>Ingredienti</h6>
                                        {(() => {
                                            const isDrink = selectedProduct.category === 'Bevande'
                                            const defaults = selectedProduct?.ingredients ?? []
                                            if (isDrink) {
                                                return <div className="text-muted small">Ingredienti non modificabili per le bevande</div>
                                            }
                                            // defaults shown as checklist
                                            if (defaults.length === 0) return <div className="text-muted">Nessun ingrediente di default</div>
                                            return (
                                                <>
                                                    <div className="ingredients-list">
                                                                {defaults.map((d) => {
                                                                    const checked = productIngredients.includes(d)
                                                                    const removable = selectedProduct.category === 'Extra' || selectedProduct.id === 'd2'
                                                                    return (
                                                                        <div key={d} className="ingredient-item" style={{ alignItems: 'center' }}>
                                                                            <label style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: removable ? 'default' : 'pointer' }}>
                                                                                <input type="checkbox" checked={checked} onChange={(e) => {
                                                                                    if (e.target.checked) {
                                                                                        setProductIngredients((s) => Array.from(new Set([...s, d])))
                                                                                    } else {
                                                                                        setProductIngredients((s) => s.filter((x) => x !== d))
                                                                                    }
                                                                                }} />
                                                                                <span style={{ marginLeft: 8 }}>{d}</span>
                                                                            </label>
                                                                            {removable && (
                                                                                <button className="btn btn-sm btn-outline-danger ms-2" onClick={() => setProductIngredients((s) => s.filter((x) => x !== d))}>Rimuovi</button>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                })}

                                                        {/* extras: those in productIngredients not in defaults */}
                                                        {(() => {
                                                            const extras = productIngredients.filter((p) => !defaults.includes(p))
                                                            if (extras.length === 0) return null
                                                            return extras.map((ex, idx) => (
                                                                <div key={`extra-${idx}`} className="ingredient-item">
                                                                    <div style={{ flex: 1 }}>{ex}</div>
                                                                    <div className="ingredient-actions">
                                                                        <button className="btn btn-sm btn-outline-danger" onClick={() => removeIngredient(productIngredients.indexOf(ex))}>Rimuovi</button>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        })()}
                                                    </div>

                                                    <div className="ingredient-add-row">
                                                        <input className="form-control form-control-sm" placeholder="Aggiungi ingrediente extra" value={newIngredientText} onChange={(e) => setNewIngredientText(e.target.value)} />
                                                        <button className="btn btn-sm btn-primary" onClick={() => { if (newIngredientText.trim()) { setProductIngredients((s) => [...s, newIngredientText.trim()]); setNewIngredientText('') }}}>Aggiungi</button>
                                                    </div>
                                                </>
                                            )
                                        })()}
                                    </div>

                                    <div className="mt-3">
                                        <label className="form-label">Nota per l'articolo</label>
                                        <textarea className="form-control" rows={2} placeholder="Es. ben cotta, poca mozzarella" value={productNote} onChange={(e) => setProductNote(e.target.value)} />
                                    </div>

                                </div>
                                <div className="modal-footer">
                                        <button className="btn btn-secondary" onClick={() => { setSelectedProduct(null); setEditingCartKey(null); setProductNote('') }}>Chiudi</button>
                                    {editingCartKey ? (
                                        <button className="btn btn-primary" onClick={() => { saveEditedCartItem(selectedProduct, productIngredients); setSelectedProduct(null); setProductNote('') }}>Salva modifiche</button>
                                    ) : (
                                        <button className="btn btn-success" onClick={() => { if (selectedProduct) { addToCart(selectedProduct, productIngredients, productNote); setProductNote('') } setSelectedProduct(null) }}>Aggiungi al carrello</button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <div className="flex-grow-1 d-flex p-3" style={{ gap: 12 }}>
                {viewMode === 'banco' ? (
                    <>
                        {/*lista item*/}
                        <main className="flex-fill me-3">
                            <div className="d-flex align-items-center mb-3 category-toolbar" style={{ gap: 12 }}>
                                <div className="btn-group" role="group" aria-label="Filtri categorie">
                                    {itemCategories.map((cat) => (
                                        <button key={cat} type="button" className={`btn category-filter-btn ${activeItemCategory === cat ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setActiveItemCategory(cat)}>{cat}</button>
                                    ))}
                                </div>
                                <div className="flex-fill">
                                    <input className="form-control form-control-sm category-search" placeholder="Cerca articolo..." value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} />
                                </div>
                            </div>
                            {/* suggestion bar (moved below filters) */}
                            {selectedCustomerId && topProductsForCustomer.length > 0 && (
                                <div className="mb-3">
                                    <div className="small text-muted mb-1">Suggeriti per {customers.find(c => c.id === selectedCustomerId)?.name}</div>
                                    <div className="d-flex" style={{ gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
                                        {topProductsForCustomer.map((t) => {
                                            const item = menu.find((m: MenuItem) => m.id === t.itemId)
                                            if (!item) return null
                                            return (
                                                <button key={t.itemId} className="btn btn-light btn-sm d-flex align-items-center" onClick={() => addToCart(item, item.ingredients ?? [])}>
                                                    <img src={item.image || ''} alt={item.name} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8 }} />
                                                    <div style={{ marginLeft: 8, textAlign: 'left' }}>
                                                        <div style={{ fontSize: 12, fontWeight: 700 }}>{item.name}</div>
                                                        <div style={{ fontSize: 11 }} className="text-muted">{t.count}x</div>
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="row g-3">
                                {filtered.map((m) => (
                                    <div key={m.id} className="col-6 col-md-4 col-lg-3">
                                        <div className={`position-relative`}>
                                            <button
                                                onPointerDown={(e) => onPointerDownItem(m, e)}
                                                onPointerMove={(e) => onPointerMoveItem(e)}
                                                onPointerUp={(e) => onPointerUpItem(m, e)}
                                                onPointerCancel={() => onPointerCancelItem()}
                                                onContextMenu={(e) => { e.preventDefault(); openProductModal(m) }}
                                                className={`btn btn-light shadow-sm w-100 p-0 btn-lg d-flex align-items-center btn-animated menu-item-btn ${pressingId === m.id ? 'pressing' : ''}`}
                                            >
                                                {/* long-press progress ring (SVG) */}
                                                <span
                                                    className={`lp-ring ${showRingId === m.id ? 'visible' : ''}`}
                                                    aria-hidden
                                                    style={ringPos ? { left: ringPos.left + 'px', top: ringPos.top + 'px' } : undefined}
                                                >
                                                    <svg width="48" height="48" viewBox="0 0 48 48">
                                                        <circle className="track" cx="24" cy="24" r="18" />
                                                        <circle className="progress" cx="24" cy="24" r="18" />
                                                    </svg>
                                                </span>

                                                {/* thumbnail left */}
                                                <div style={{ padding: 12, display: 'flex', alignItems: 'center' }}>
                                                    <img
                                                        className="menu-item-thumb"
                                                        src={m.image || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="100%" height="100%" fill="%23f3f4f6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%230f172a" font-size="18">Img</text></svg>'}
                                                        alt={m.name}
                                                    />
                                                </div>

                                                {/* content: name + price on one line, category below */}
                                                <div style={{ flex: 1, padding: '12px 16px', textAlign: 'left' }} className="menu-item-content">
                                                    <div className="d-flex align-items-center justify-content-between">
                                                        <div className="menu-item-name">{m.name}</div>
                                                        <div className="menu-item-price fw-bold">€{m.price.toFixed(2)}</div>
                                                    </div>
                                                    <div className="menu-item-price small text-muted">{m.category}</div>
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </main>

                        <aside style={{ width: 420 }}>
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
                                                                    <li key={c.id} className={`list-group-item d-flex align-items-center justify-content-between ${lastEditedId === c.id ? 'edited' : ''}`}>
                                                                        <div>
                                                                                <div className="fw-bold">{c.name}</div>
                                                                            
                                                                                {renderIngredientDiff(c)}
                                                                                {c.note && <div className="small text-muted">Nota: {c.note}</div>}
                                                                                <div className="text-muted">€{(c.price * c.qty).toFixed(2)}</div>
                                                                            </div>
                                                                        <div className="d-flex align-items-center" style={{ gap: 6 }}>
                                                                            <div className="btn-group" role="group" aria-label="Quantità">
                                                                                <button className="btn btn-outline-secondary btn-sm btn-animated" onClick={() => changeQty(c.id, -1)} aria-label="Riduci"><i className="bi bi-dash" aria-hidden></i></button>
                                                                                <button className="btn btn-light btn-sm" disabled aria-label="Quantità">{c.qty}</button>
                                                                                <button className="btn btn-outline-secondary btn-sm btn-animated" onClick={() => changeQty(c.id, 1)} aria-label="Aumenta"><i className="bi bi-plus" aria-hidden></i></button>
                                                                            </div>
                                                                            <button className="btn btn-sm btn-outline-primary ms-2" title="Modifica" onClick={() => startEditCartItem(c.id)} aria-label="Modifica"><i className="bi bi-pencil" aria-hidden></i></button>
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

            {/* in-page toast */}
            {toast.visible && (
                <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 2000 }}>
                    <div className={`toast show align-items-center text-white bg-${toast.type === 'success' ? 'success' : toast.type === 'error' ? 'danger' : 'info'}`} role="alert" aria-live="assertive" aria-atomic="true">
                        <div className="d-flex">
                            <div className="toast-body">{toast.message}</div>
                            <button type="button" className="btn-close btn-close-white me-2 m-auto" onClick={() => setToast((t) => ({ ...t, visible: false }))}></button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

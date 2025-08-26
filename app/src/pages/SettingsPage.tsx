import React, { useEffect, useState } from 'react'
import { MenuItem, Customer } from '../data/types'
import { IngredientRow, MenuRow, CategoryRow } from '../types/db'

export default function SettingsPage() {
	const [tab, setTab] = useState<'customers' | 'ingredients' | 'menu'>('customers')

	// customers
	const [customers, setCustomers] = useState<Customer[]>([])
	const [newCust, setNewCust] = useState<{ name: string; phone?: string; address?: string }>({ name: '' })
	const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

	// ingredients
	const [ingredients, setIngredients] = useState<IngredientRow[]>([])
	const [newIng, setNewIng] = useState<{ name: string; add_price?: number; production_cost?: number }>({ name: '' })
	const [editingIngredient, setEditingIngredient] = useState<IngredientRow | null>(null)
	const [ingredientModalOpen, setIngredientModalOpen] = useState(false)

	// menu
	const [menu, setMenu] = useState<MenuItem[]>([])
	const [categories, setCategories] = useState<CategoryRow[]>([])

	// menu editor modal state
	const [menuEditorOpen, setMenuEditorOpen] = useState(false)
	const [editingMenuForm, setEditingMenuForm] = useState<{ id?: string; name: string; price: number; categoryId?: string | null; description?: string; image?: string; ingredients: string[] }>({ name: '', price: 0, categoryId: null, description: '', image: '', ingredients: [] })
	const [appBasePath, setAppBasePath] = useState<string>('')
	const [previewSrc, setPreviewSrc] = useState<string>('')
	const [ingredientSearch, setIngredientSearch] = useState<string>('')
		const [debouncedSearch, setDebouncedSearch] = useState<string>('')
	const [initialIngredientIds, setInitialIngredientIds] = useState<string[]>([])

	useEffect(() => {
		let mounted = true
			; (async () => {
				try {
					const cRes = await window.api.getCustomers()
					if (cRes && cRes.success) { if (mounted) setCustomers(cRes.result || []) }

					const iRes = await window.api.getIngredients()
					if (iRes && iRes.success) { if (mounted) setIngredients((iRes.result || [])) }

					const mRes = await window.api.getMenu()
					if (mRes && mRes.success) {
						if (mounted) setMenu((mRes.result || []).map((mRaw: MenuRow) => ({
							id: mRaw.id,
							name: mRaw.name,
							price: mRaw.price || 0,
							category: mRaw.category?.name ?? '',
							description: mRaw.description ?? '',
							image: mRaw.image ?? '',
							allergens: mRaw.allergens ?? [],
							ingredients: Array.isArray(mRaw.ingredients) ? mRaw.ingredients.map(i => i.name) : []
						})))
					}
					// also load categories for menu editor
					const catRes = await window.api.getCategories()
					if (catRes && catRes.success) { if (mounted) setCategories(catRes.result || []) }

					// fetch app base path for resolving local images
					try {
						const appPathRes = await window.api.getAppPath()
						if (appPathRes && appPathRes.success && typeof appPathRes.result === 'string') {
							if (mounted) setAppBasePath(String(appPathRes.result))
						}
					} catch (e) {
						// non-fatal
					}
				} catch (e) {
					console.error('Failed to load settings data', e)
				}
			})()
		return () => { mounted = false }
	}, [])

	// update preview when image or base path changes
	useEffect(() => {
		let mounted = true
			; (async () => {
				if (!editingMenuForm.image) {
					if (mounted) setPreviewSrc('')
					return
				}
				try {
					const s = editingMenuForm.image
					if (s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://')) {
						if (mounted) setPreviewSrc(s)
						return
					}
					const base = appBasePath || ''
					if (base) {
						const path = base.endsWith('/') ? base + s : base + '/' + s
						if (mounted) setPreviewSrc('file://' + path.replace(/\\/g, '/'))
					} else {
						if (mounted) setPreviewSrc(s)
					}
				} catch (e) {
					if (mounted) setPreviewSrc('')
				}
			})()
		return () => { mounted = false }
	}, [editingMenuForm.image, appBasePath])

	// debounce ingredient search
	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(ingredientSearch.trim()), 200)
		return () => clearTimeout(t)
	}, [ingredientSearch])

	async function saveNewCustomer() {
		if (!newCust.name.trim()) return
		const res = await window.api.createCustomer(newCust)
		if (res && res.success) setCustomers(prev => [res.result as Customer, ...prev])
		setNewCust({ name: '' })
	}

	async function saveEditedCustomer() {
		if (!editingCustomer) return
		const res = await window.api.updateCustomer(editingCustomer)
		if (res && res.success) setCustomers(prev => prev.map(c => c.id === editingCustomer.id ? (res.result as Customer) : c))
		setEditingCustomer(null)
	}

	async function deleteCustomer(id: string) {
		const res = await window.api.deleteCustomer(id)
		if (res && res.success) setCustomers(prev => prev.filter(c => c.id !== id))
	}

	async function saveNewIngredient() {
		if (!newIng.name.trim()) return
		const payload = { name: newIng.name, add_price: newIng.add_price ?? 0, production_cost: newIng.production_cost ?? 0 }
		const res = await window.api.createIngredient(payload)
		if (res && res.success) setIngredients(prev => [(res.result as IngredientRow), ...prev])
		setNewIng({ name: '' })
		setIngredientModalOpen(false)
	}

	async function saveEditedIngredient() {
		if (!editingIngredient) return
		const payload = { id: editingIngredient.id, name: editingIngredient.name, add_price: (editingIngredient as IngredientRow & { add_price?: number }).add_price ?? 0, production_cost: (editingIngredient as IngredientRow & { production_cost?: number }).production_cost ?? 0 }
		const res = await window.api.updateIngredient(payload)
		if (res && res.success) setIngredients(prev => prev.map(i => i.id === editingIngredient.id ? (res.result as IngredientRow) : i))
		setEditingIngredient(null)
		setIngredientModalOpen(false)
	}

	async function deleteIngredient(id: string) {
		const res = await window.api.deleteIngredient(id)
		if (res && res.success) setIngredients(prev => prev.filter(i => i.id !== id))
	}

	function openCreateMenu() {
		setEditingMenuForm({ name: '', price: 0, categoryId: null, description: '', image: '', ingredients: [] })
		setInitialIngredientIds([])
		setMenuEditorOpen(true)
	}

	function openEditMenu(m: MenuItem) {
		const matchedCat = categories.find(c => c.name === m.category)
		// map ingredient names back to ids using loaded ingredients list
		const ingIds = (m.ingredients || []).map(name => {
			const found = ingredients.find(i => i.name === name)
			return found ? found.id : name // fallback to name if not found
		})
		setEditingMenuForm({ id: m.id, name: m.name, price: m.price, categoryId: matchedCat ? matchedCat.id : null, description: m.description || '', image: m.image || '', ingredients: ingIds })
		setInitialIngredientIds(ingIds.filter(x => !!x))
		setMenuEditorOpen(true)
	}

	async function saveMenuFromForm() {
		const data = { ...editingMenuForm }
		if (data.id) {
			const res = await window.api.updateMenu({ id: data.id, name: data.name, description: data.description, price: data.price, categoryId: data.categoryId ?? null, image: data.image ?? null, ingredients: data.ingredients })
			if (res && res.success) {
				const updated = res.result as MenuRow
				setMenu(prev => prev.map(p => p.id === updated.id ? { id: updated.id, name: updated.name, price: updated.price || 0, category: updated.category?.name ?? '', description: updated.description ?? '', image: updated.image ?? '', allergens: updated.allergens ?? [], ingredients: Array.isArray(updated.ingredients) ? updated.ingredients.map(i => i.name) : [] } : p))
			}
		} else {
			const res = await window.api.createMenu({ name: data.name, description: data.description, price: data.price, categoryId: data.categoryId ?? null, image: data.image ?? null, ingredients: data.ingredients })
			if (res && res.success) {
				const created = res.result as MenuRow
				setMenu(prev => [{ id: created.id, name: created.name, price: created.price || 0, category: created.category?.name ?? '', description: created.description ?? '', image: created.image ?? '', allergens: created.allergens ?? [], ingredients: Array.isArray(created.ingredients) ? created.ingredients.map(i => i.name) : [] }, ...prev])
			}
		}
		setMenuEditorOpen(false)
	}

	function suggestPrice(ingredientIds: string[]) {
		// base cost + sum of add_price (fallback) then apply margin and round to 0.5
		const base = 1.5 // base pizza cost
		const fallbackPer = 1
		const margin = 0.5 // 40% markup
		const roundStep = 0.5
		const ids = Array.isArray(ingredientIds) ? ingredientIds : []
		let sum = 0
		for (const id of ids) {
			const it = ingredients.find(x => x.id === id)
			if (it) {
				const ap = (it as IngredientRow & { add_price?: number }).add_price
				if (typeof ap === 'number') sum += ap || 0
				else sum += fallbackPer
			} else {
				sum += fallbackPer
			}
		}
		const cost = base + sum
		const withMargin = cost * (1 + margin)
		const rounded = Math.round(withMargin / roundStep) * roundStep
		return Math.max(0.5, Math.round(rounded * 100) / 100)
	}



	return (
		<div className="p-4">
			<h2>Impostazioni</h2>

			<div className="btn-group mb-3" role="group" aria-label="tabs">
				<button className={`btn ${tab === 'customers' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setTab('customers')}>Clienti</button>
				<button className={`btn ${tab === 'ingredients' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setTab('ingredients')}>Ingredienti</button>
				<button className={`btn ${tab === 'menu' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setTab('menu')}>Menu</button>
			</div>

			{tab === 'customers' && (
				<div>
					<div className="card p-3 mb-3">
						<h5>Aggiungi cliente</h5>
						<div className="row g-2">
							<div className="col-12 col-md-4"><input className="form-control" placeholder="Nome" value={newCust.name} onChange={e => setNewCust(s => ({ ...s, name: e.target.value }))} /></div>
							<div className="col-12 col-md-3"><input className="form-control" placeholder="Telefono" value={newCust.phone || ''} onChange={e => setNewCust(s => ({ ...s, phone: e.target.value }))} /></div>
							<div className="col-12 col-md-4"><input className="form-control" placeholder="Indirizzo" value={newCust.address || ''} onChange={e => setNewCust(s => ({ ...s, address: e.target.value }))} /></div>
							<div className="col-12 col-md-1"><button className="btn btn-primary w-100" onClick={saveNewCustomer}>Salva</button></div>
						</div>
					</div>
					<div className="list-group">
						{customers.map(c => (
							<div key={c.id} className="list-group-item d-flex justify-content-between align-items-center">
								<div>
									<div className="fw-bold">{c.name}</div>
									<div className="text-muted small">{c.phone || ''} {c.address ? '· ' + c.address : ''}</div>
								</div>
								<div>
									<button className="btn btn-sm btn-outline-secondary me-2" onClick={() => { /* TODO: edit customer */ }}>Modifica</button>
									<button className="btn btn-sm btn-danger" onClick={() => deleteCustomer(c.id)}>Elimina</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{tab === 'ingredients' && (
				<div>
					<div className="card p-3 mb-3 d-flex justify-content-between align-items-center">
							<h5>Ingredienti</h5>
							<div>
								<button className="btn btn-primary" onClick={() => { setNewIng({ name: '' }); setEditingIngredient(null); setIngredientModalOpen(true) }}>Aggiungi ingrediente</button>
							</div>
						</div>
					<div className="list-group">
							{ingredients.map(i => (
								<div key={i.id} className="list-group-item d-flex justify-content-between align-items-center">
									<div>
										<div className="fw-bold">{i.name} <span className="text-muted small">· {(i.add_price ?? 0).toFixed(2)}€</span></div>
										<div className="text-muted small">Costo produzione: {(i.production_cost ?? 0).toFixed(2)}€</div>
									</div>
									<div>
										<button className="btn btn-sm btn-outline-secondary me-2" onClick={() => { setEditingIngredient(i); setNewIng({ name: i.name, add_price: i.add_price ?? 0, production_cost: i.production_cost ?? 0 }); setIngredientModalOpen(true) }}>Modifica</button>
										<button className="btn btn-sm btn-danger" onClick={() => deleteIngredient(i.id)}>Elimina</button>
									</div>
								</div>
							))}
					</div>
				</div>
			)}

			{tab === 'menu' && (
				<div>
					<div className="card p-3 mb-3">
						<h5>Menu</h5>
						<p className="text-muted">Per creare/modificare voci del menu, usa l'interfaccia rapida sotto o importa da JSON.</p>
						<div className="mt-2">
							<button className="btn btn-sm btn-primary" onClick={openCreateMenu}>Crea voce</button>
						</div>
					</div>
					<div className="list-group">
						{menu.map(m => (
							<div key={m.id} className="list-group-item d-flex justify-content-between align-items-center">
								<div>
									<div className="fw-bold">{m.name} — €{m.price.toFixed(2)}</div>
									<div className="text-muted small">{m.category} · {m.ingredients?.join(', ')}</div>
								</div>
								<div>
									<button className="btn btn-sm btn-sm btn-outline-secondary me-2" onClick={() => openEditMenu(m)}>Modifica</button>
									<button className="btn btn-sm btn-danger" onClick={async () => {
										const res = await window.api.deleteMenu(m.id)
										if (res && res.success) setMenu(prev => prev.filter(x => x.id !== m.id))
									}}>Elimina</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Menu editor modal (clean) */}
			{menuEditorOpen && (
				<div className="modal-backdrop position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1050 }}>
					<div className="card p-3" style={{ width: 1024 }} role="dialog" aria-modal="true">
						<h5 className="mb-2">{editingMenuForm.id ? 'Modifica voce' : 'Crea voce'}</h5>

						<div className="row g-2">
							<div className="col-12 col-md-6">
								<label className="form-label">Nome</label>
								<input className="form-control" placeholder="Nome" value={editingMenuForm.name} onChange={e => setEditingMenuForm(s => ({ ...s, name: e.target.value }))} />
							</div>

							<div className="col-12 col-md-2">
								<label className="form-label">Prezzo</label>
								<input name="prezzo" type="number" className="form-control" placeholder="Prezzo" value={editingMenuForm.price} onChange={e => setEditingMenuForm(s => ({ ...s, price: parseFloat(e.target.value || '0') }))} />
							</div>

							<div className="col-12 col-md-4">
								<label className="form-label">Categoria</label>
								<select className="form-select" value={editingMenuForm.categoryId || ''} onChange={e => setEditingMenuForm(s => ({ ...s, categoryId: e.target.value || null }))}>
									<option value="">-- Nessuna categoria --</option>
									{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
								</select>
							</div>

							<div className="col-12">
								<textarea className="form-control" placeholder="Descrizione" value={editingMenuForm.description} onChange={e => setEditingMenuForm(s => ({ ...s, description: e.target.value }))} />
							</div>

							<div className="col-12 col-md-6">
								<input className="form-control" placeholder="Percorso immagine (file o URL)" value={editingMenuForm.image} onChange={e => setEditingMenuForm(s => ({ ...s, image: e.target.value }))} />
							</div>

							<div className="col-12 col-md-6 d-flex align-items-center">
								{previewSrc ? <img src={previewSrc} alt="Anteprima immagine" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6 }} /> : <div className="text-muted small">Nessuna anteprima</div>}
							</div>

							<div className="col-12">
								<label className="form-label">Ingredienti</label>
								<div className="d-flex gap-3">
									<div style={{ flex: 1 }}>
										<input className="form-control mb-2" placeholder="Cerca ingrediente..." value={ingredientSearch} onChange={e => setIngredientSearch(e.target.value)} />
										<div className="border rounded p-2" style={{ maxHeight: 220, overflow: 'auto' }}>
											{ingredients
												.slice()
												.sort((a,b) => a.name.localeCompare(b.name))
												.filter(i => i.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
												.map(i => {
												const isSelected = editingMenuForm.ingredients.includes(i.id)
												return (
													<div key={i.id} className={'d-flex justify-content-between align-items-center py-1 px-2' + (isSelected ? ' bg-light' : '')}>
														<div>{i.name}</div>
														<div>
															<button className={isSelected ? 'btn btn-sm btn-outline-danger' : 'btn btn-sm btn-outline-primary'} onClick={() => {
																if (isSelected) setEditingMenuForm(s => ({ ...s, ingredients: s.ingredients.filter(x => x !== i.id) }))
																else setEditingMenuForm(s => ({ ...s, ingredients: [...s.ingredients, i.id] }))
															}}>{isSelected ? 'Rimuovi' : 'Aggiungi'}</button>
														</div>
													</div>
												)
											})}
										</div>
									</div>

									<div style={{ width: 380 }}>
										<div className="fw-bold">Selezionati</div>
										<div className="border rounded p-2" style={{ maxHeight: 220, overflow: 'auto' }}>
											{editingMenuForm.ingredients.length === 0 && <div className="text-muted">Nessun ingrediente selezionato</div>}
											{editingMenuForm.ingredients.map(id => {
												const it = ingredients.find(x => x.id === id)
												const name = it ? it.name : id
												const wasInitial = initialIngredientIds.includes(id)
												return (
													<div key={id} className="d-flex justify-content-between align-items-center py-1">
														<div>
															<div>{name}</div>
															<div className="small text-muted">{wasInitial ? <span>Presente</span> : <span className="text-success">Aggiunto</span>}</div>
														</div>
														<div>
															<button className="btn btn-sm btn-outline-danger" onClick={() => setEditingMenuForm(s => ({ ...s, ingredients: s.ingredients.filter(x => x !== id) }))}>Rimuovi</button>
														</div>
													</div>
												)
											})}
										</div>
										<div className="mt-2">
											<div className="small text-muted">Ingredienti: {editingMenuForm.ingredients.length}</div>
										</div>
									</div>

									<div style={{ width: 180 }} className="ps-2">
										<div className="fw-bold">Consigli prezzo</div>
										<div className="small text-muted mb-2">Suggerimento basato su ingredienti selezionati</div>
										<div className="mb-2">
											<div className="fs-5">€{suggestPrice(editingMenuForm.ingredients).toFixed(2)}</div>
										</div>
										<button className="btn btn-sm btn-primary" onClick={() => setEditingMenuForm(s => ({ ...s, price: suggestPrice(s.ingredients) }))}>Applica suggerimento</button>
									</div>

								</div>
							</div>

						</div>

						<div className="d-flex justify-content-end mt-3">
							<button className="btn btn-outline-secondary me-2" onClick={() => setMenuEditorOpen(false)}>Annulla</button>
							<button className="btn btn-primary" onClick={saveMenuFromForm}>Salva</button>
						</div>
					</div>
				</div>
			)}

			{/* Ingredient modal for create/edit */}
			{ingredientModalOpen && (
				<div className="modal-backdrop position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1050 }}>
					<div className="card p-3" style={{ width: 640 }} role="dialog" aria-modal="true">
						<h5 className="mb-2">{editingIngredient ? 'Modifica ingrediente' : 'Aggiungi ingrediente'}</h5>
						<div className="row g-2">
							<div className="col-12 col-md-6">
								<label className="form-label">Nome</label>
								<input className="form-control" placeholder="Nome" value={(editingIngredient ? editingIngredient.name : newIng.name)} onChange={e => {
								if (editingIngredient) setEditingIngredient({ ...editingIngredient, name: e.target.value })
								else setNewIng(s => ({ ...s, name: e.target.value }))
							}} /></div>
							<div className="col-12 col-md-3">
								<label className="form-label">Costo aggiunta</label>
								<input className="form-control" type="number" step="0.01" placeholder="Costo aggiunta" value={(editingIngredient ? String((editingIngredient as IngredientRow & { add_price?: number }).add_price ?? '') : String(newIng.add_price ?? ''))} onChange={e => {
								const v = parseFloat(e.target.value || '0')
								if (editingIngredient) setEditingIngredient({ ...(editingIngredient as IngredientRow & { add_price?: number }), add_price: isNaN(v) ? 0 : v })
								else setNewIng(s => ({ ...s, add_price: isNaN(v) ? 0 : v }))
							}} /></div>
							<div className="col-12 col-md-3">
								<label className="form-label">Costo Produzione</label>
								<input className="form-control" type="number" step="0.01" placeholder="Costo produzione" value={(editingIngredient ? String((editingIngredient as IngredientRow & { production_cost?: number }).production_cost ?? '') : String(newIng.production_cost ?? ''))} onChange={e => {
								const v = parseFloat(e.target.value || '0')
								if (editingIngredient) setEditingIngredient({ ...(editingIngredient as IngredientRow & { production_cost?: number }), production_cost: isNaN(v) ? 0 : v })
								else setNewIng(s => ({ ...s, production_cost: isNaN(v) ? 0 : v }))
							}} /></div>
						</div>
						<div className="d-flex justify-content-end mt-3">
							<button className="btn btn-outline-secondary me-2" onClick={() => { setIngredientModalOpen(false); setEditingIngredient(null) }}>Annulla</button>
							{editingIngredient ? <button className="btn btn-primary" onClick={saveEditedIngredient}>Salva</button> : <button className="btn btn-primary" onClick={saveNewIngredient}>Salva</button>}
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

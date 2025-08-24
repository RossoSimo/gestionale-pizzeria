import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import OrderPage from './pages/OrderPage'
import StatisticsPage from './pages/StatisticsPage'
import SettingsPage from './pages/SettingsPage'

function App() {
    const [page, setPage] = useState<'orders' | 'statistics' | 'settings'>('orders')

    const titles: Record<string, string> = {
        orders: 'Ordini',
        statistics: 'Statistiche',
        settings: 'Impostazioni',
    }

    return (
        <div className="d-flex" style={{ height: '100%' }}>
            <Sidebar current={page} onChange={(p) => setPage(p)} />
            <div className="flex-fill d-flex flex-column">
                <Topbar title={titles[page]} />
                <div className="flex-fill overflow-auto">
                    {page === 'orders' && <OrderPage />}
                    {page === 'statistics' && <StatisticsPage />}
                    {page === 'settings' && <SettingsPage />}
                </div>
            </div>
        </div>
    )
}

export default App
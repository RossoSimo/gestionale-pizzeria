import { MenuItem } from './types'
// import example asset so Vite/Electron bundler resolves URL correctly
import provaImg from '../../assets/img/menu/prova.jpg'

export const MENU: MenuItem[] = [
  { id: 'p1', name: 'Margherita', price: 6.5, category: 'Pizza', description: 'Pomodoro, mozzarella, basilico.', image: provaImg, allergens: ['Latticini'], ingredients: ['Pomodoro', 'Mozzarella', 'Basilico'] },
  { id: 'p2', name: 'Marinara', price: 6.0, category: 'Pizza', description: 'Pomodoro, aglio, origano.', image: provaImg, allergens: [], ingredients: ['Pomodoro', 'Aglio', 'Origano'] },
  { id: 'p3', name: 'Diavola', price: 8.0, category: 'Pizza', description: 'Salame piccante, mozzarella.', image: provaImg, allergens: ['Latticini'], ingredients: ['Salame', 'Mozzarella', 'Pomodoro'] },
  { id: 'e1', name: 'Patatine', price: 3.5, category: 'Extra', description: 'Patatine fritte croccanti.', image: '', allergens: [], ingredients: ['Patate', 'Olio'] },
  { id: 'e2', name: 'Olive', price: 2.5, category: 'Extra', description: 'Olive verdi in salamoia.', image: '', allergens: [], ingredients: ['Olive', 'Sale'] },
  { id: 'd1', name: 'Acqua 0.5L', price: 1.5, category: 'Bevande', description: 'Acqua naturale 0.5L.', image: '', allergens: [], ingredients: [] },
  { id: 'd2', name: 'Coca-Cola 0.33L', price: 2.5, category: 'Bevande', description: 'Coca-Cola in lattina.', image: '', allergens: ['Caffeina'], ingredients: ['Acqua', 'Zucchero', 'Aromi'] },
]

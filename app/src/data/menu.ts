import { MenuItem } from './types'
// import example asset so Vite/Electron bundler resolves URL correctly
import provaImg from '../../assets/img/menu/prova.jpg'

export const MENU: MenuItem[] = [
  { id: 'p1', name: 'Margherita', price: 6.5, category: 'Pizza', description: 'Pomodoro, mozzarella, basilico.', image: provaImg, allergens: ['Latticini'], ingredients: ['Pomodoro', 'Mozzarella', 'Basilico'] },
  { id: 'p2', name: 'Marinara', price: 6.0, category: 'Pizza', description: 'Pomodoro, aglio, origano.', image: provaImg, allergens: [], ingredients: ['Pomodoro', 'Aglio', 'Origano'] },
  { id: 'p3', name: 'Diavola', price: 8.0, category: 'Pizza', description: 'Salame piccante, mozzarella.', image: provaImg, allergens: ['Latticini'], ingredients: ['Salame', 'Mozzarella', 'Pomodoro'] },
  { id: 'p4', name: 'Quattro Formaggi', price: 9.5, category: 'Pizza', description: 'Mozzarella, gorgonzola, parmigiano, taleggio.', image: provaImg, allergens: ['Latticini'], ingredients: ['Mozzarella', 'Gorgonzola', 'Parmigiano', 'Taleggio'] },
  { id: 'p5', name: 'Capricciosa', price: 9.0, category: 'Pizza', description: 'Prosciutto, funghi, carciofi, olive.', image: provaImg, allergens: ['Latticini'], ingredients: ['Prosciutto', 'Funghi', 'Carciofi', 'Olive', 'Mozzarella'] },
  { id: 'p6', name: 'Prosciutto e Funghi', price: 8.5, category: 'Pizza', description: 'Prosciutto cotto e funghi.', image: provaImg, allergens: ['Latticini'], ingredients: ['Prosciutto', 'Funghi', 'Mozzarella'] },
  { id: 'p7', name: 'Crudo', price: 9.0, category: 'Pizza', description: 'Pomodoro, mozzarella, Crudo', image: provaImg, allergens: [], ingredients: ['Pomodoro', 'Mozzarelle', 'Prosciutto Crudo'] },
  { id: 'p8', name: 'Vegetariana', price: 8.0, category: 'Pizza', description: 'Verdure miste e mozzarella.', image: provaImg, allergens: ['Latticini'], ingredients: ['Melanzane', 'Zucchine', 'Peperoni', 'Mozzarella'] },
  { id: 'p9', name: 'Bufalina', price: 10.0, category: 'Pizza', description: 'Mozzarella di bufala DOP, pomodoro.', image: provaImg, allergens: ['Latticini'], ingredients: ['Pomodoro', 'Mozzarella di bufala'] },
  { id: 'p10', name: 'Calzone', price: 9.0, category: 'Pizza', description: 'Ripieno con prosciutto, formaggi e pomodoro.', image: provaImg, allergens: ['Latticini'], ingredients: ['Prosciutto', 'Mozzarella', 'Pomodoro'] },
  { id: 'e1', name: 'Porzione patatine', price: 3.0, category: 'Extra', description: 'Patatine fritte croccanti.', image: '', allergens: [], ingredients: ['Patate', 'Olio'] },
  { id: 'd1', name: 'Acqua 0.5L', price: 1.0, category: 'Bevande', description: 'Acqua naturale 0.5L.', image: '', allergens: [], ingredients: [] },
  { id: 'd2', name: 'Coca-Cola 0.33L', price: 3, category: 'Bevande', description: 'Coca-Cola in lattina.', image: '', allergens: ['Caffeina'], ingredients: ['Acqua', 'Zucchero', 'Aromi'] },
  { id: 'd3', name: 'Fanta 0.33L', price: 3, category: 'Bevande', description: 'Fanta aranciata in lattina.', image: '', allergens: [], ingredients: ['Acqua', 'Zucchero', 'Aromi'] },
  { id: 'd4', name: 'Birra 0.33L', price: 4.5, category: 'Bevande', description: 'Birra chiara alla spina.', image: '', allergens: ['Glutine'], ingredients: ['Acqua', 'Luppolo', 'Malto'] },
]
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import Preview from './preview'

createRoot(document.getElementById('root')!).render(<BrowserRouter><Preview /></BrowserRouter>)

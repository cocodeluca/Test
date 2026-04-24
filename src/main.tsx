import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import './platforms/web/styles/index.css'

const WebApp = lazy(() => import('./platforms/web/App'))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <WebApp />
    </Suspense>
  </React.StrictMode>,
)

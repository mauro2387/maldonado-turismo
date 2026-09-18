import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import './lib/i18n';
import { escucharInstalacion } from './lib/instalar';

// El pedido de instalación de Chrome se dispara una sola vez y apenas
// arranca la app: si nadie lo agarra acá, se pierde. Ver `lib/instalar`.
escucharInstalacion();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

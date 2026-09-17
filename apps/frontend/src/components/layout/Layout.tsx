import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { RecordatorioDeSalida } from '@components/transporte/RecordatorioDeSalida';

/**
 * En el teléfono la única barra fija es la de abajo; el encabezado aparece
 * recién en escritorio. Así el mapa y las listas usan toda la altura de la
 * pantalla, que es lo que más se nota en un dispositivo chico.
 */
export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-sand-50">
      <Header />
      <main className="flex-1 pb-[4.25rem] md:pb-0">
        <Outlet />
      </main>
      {/* El recordatorio de salida vive acá y no en el planificador: tiene
          que seguir sonando cuando la persona se fue a otra pantalla. */}
      <RecordatorioDeSalida />
      <BottomNav />
    </div>
  );
}

import { Routes } from '@angular/router';
import { ProductoListComponent } from './components/producto-list/producto-list.component';
import { CargaExcelComponent } from './components/carga-excel/carga-excel.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';

export const routes: Routes = [
  { path: '', redirectTo: '/productos', pathMatch: 'full' },
  { path: 'productos', component: ProductoListComponent },
  { path: 'cargar-excel', component: CargaExcelComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: '**', redirectTo: '/productos' }
];

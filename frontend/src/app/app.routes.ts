import { Routes } from '@angular/router';
import { ProductoListComponent } from './components/producto-list/producto-list.component';
import { CargaExcelComponent } from './components/carga-excel/carga-excel.component';

export const routes: Routes = [
  { path: '', component: ProductoListComponent },
  { path: 'productos', component: ProductoListComponent },
  { path: 'cargar-excel', component: CargaExcelComponent },
  { path: '**', redirectTo: '' }
];

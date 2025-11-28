// src/app/components/producto-list/producto-list.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService, Producto } from '../../services/producto.service';

@Component({
  selector: 'app-producto-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './producto-list.component.html',
  styleUrls: ['./producto-list.component.scss']  // ← AGREGAR ESTA LÍNEA
})
export class ProductoListComponent implements OnInit {
  productos: Producto[] = [];
  productoForm: Producto = this.nuevoProducto();
  editando = false;
  errores: string[] = [];
  cargando = false;
  paginaActual = 1;              
  productosPorPagina = 5;        
  totalPaginas = 0; 
  Math = Math;

  terminoBusqueda = '';
  productosFiltrados: Producto[] = [];

  constructor(private productoService: ProductoService) {}

  ngOnInit() {
    this.cargarProductos();
  }

  nuevoProducto(): Producto {
    return {
      codigo: '',
      nombre: '',
      descripcion: '',
      cantidad: 0,
      precio: 0,
      categoria: ''
    };
  }

    cargarProductos() {
    this.cargando = true;
    this.productoService.obtenerProductos().subscribe({
      next: (data) => {
        this.productos = data;
        this.aplicarFiltros();  // ← AGREGAR ESTA LÍNEA
        this.cargando = false;
      },
      error: (error) => {
        console.error('Error completo al cargar productos:', error);
        this.cargando = false;
      }
    });
  }

  procesarError(error: any): void {
    console.log('Error recibido:', error);
    console.log('Error.error:', error.error);
    console.log('Error.error.detail:', error.error?.detail);
    
    this.errores = [];
    
    

    // Caso 1: Sin conexión al servidor
    if (error.status === 0) {
      this.errores.push('❌ No se puede conectar con el servidor. Verifica que el backend esté corriendo en http://localhost:8000');
      return;
    }

    // Caso 2: Errores de validación de Pydantic (FastAPI)
    if (error.error?.detail && Array.isArray(error.error.detail)) {
      this.errores = error.error.detail.map((err: any) => {
        // Pydantic devuelve: {loc: ["body", "campo"], msg: "mensaje", type: "tipo"}
        const campo = err.loc && err.loc.length > 1 ? err.loc[err.loc.length - 1] : '';
        const mensaje = err.msg || err.message || 'Error de validación';
        return campo ? `📌 ${campo}: ${mensaje}` : `📌 ${mensaje}`;
      });
      return;
    }

    // Caso 3: Error con mensaje simple de texto
    if (error.error?.detail && typeof error.error.detail === 'string') {
      this.errores.push(`⚠️ ${error.error.detail}`);
      return;
    }

    

    // Caso 4: Error 404
    if (error.status === 404) {
      this.errores.push('❌ Recurso no encontrado');
      return;
    }

    // Caso 5: Error 500
    if (error.status === 500) {
      this.errores.push('❌ Error interno del servidor. Revisa los logs del backend.');
      return;
    }

    // Caso 6: Otros errores HTTP
    if (error.statusText) {
      this.errores.push(`❌ Error ${error.status}: ${error.statusText}`);
      return;
    }

    // Caso por defecto
    this.errores.push('❌ Error desconocido. Revisa la consola del navegador (F12).');
  }

  guardarProducto() {
    this.errores = [];
    
    // Validaciones básicas en el cliente
    if (!this.productoForm.codigo || this.productoForm.codigo.trim() === '') {
      this.errores.push('📌 El código es obligatorio');
      return;
    }
    
    if (!this.productoForm.nombre || this.productoForm.nombre.trim() === '') {
      this.errores.push('📌 El nombre es obligatorio');
      return;
    }
    
    if (!this.productoForm.precio || this.productoForm.precio <= 0) {
      this.errores.push('📌 El precio debe ser mayor a 0');
      return;
    }
    
    if (this.productoForm.cantidad < 0) {
      this.errores.push('📌 La cantidad no puede ser negativa');
      return;
    }

    this.cargando = true;
    
    if (this.editando && this.productoForm.id) {
  // ✅ Asegurarse de que id existe
  const productoId = this.productoForm.id;
  
  this.productoService.actualizarProducto(
    productoId,
    this.productoForm
  ).subscribe({
        next: () => {
          this.cargarProductos();
          this.cancelar();
          alert('✅ Producto actualizado correctamente');
        },
        error: (error) => {
          this.procesarError(error);
          this.cargando = false;
        }
      });
    } else {
      this.productoService.crearProducto(this.productoForm).subscribe({
        next: () => {
          this.cargarProductos();
          this.cancelar();
          alert('✅ Producto creado correctamente');
        },
        error: (error) => {
          this.procesarError(error);
          this.cargando = false;
        }
      });
    }
  }

  editarProducto(producto: Producto) {
    this.productoForm = { ...producto };
    this.editando = true;
    this.errores = [];
    // Scroll suave hacia el formulario
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  eliminarProducto(id: number) {
  if (confirm('¿Estás seguro de eliminar este producto?')) {
    this.productoService.eliminarProducto(id).subscribe({
        next: () => {
          this.cargarProductos();
          alert('✅ Producto eliminado correctamente');
        },
        error: (error) => {
          console.error('Error al eliminar:', error);
          const mensaje = error.error?.detail || error.message || 'Error desconocido';
          alert(`❌ Error al eliminar producto: ${mensaje}`);
        }
      });
    }
  }

  cancelar() {
    this.productoForm = this.nuevoProducto();
    this.editando = false;
    this.errores = [];
  }

  obtenerEstadoStock(cantidad: number): string {
    if (cantidad === 0) return 'badge-danger';
    if (cantidad < 10) return 'badge-warning';
    return 'badge-success';
  }

  // ===== MÉTODOS DE PAGINACIÓN =====
  
  calcularTotalPaginas(): void {
      // Usar productos filtrados en lugar de todos los productos
      this.totalPaginas = Math.ceil(this.productosFiltrados.length / this.productosPorPagina);
      
      if (this.paginaActual > this.totalPaginas && this.totalPaginas > 0) {
        this.paginaActual = this.totalPaginas;
      }
    }

    obtenerProductosPaginados(): Producto[] {
      const inicio = (this.paginaActual - 1) * this.productosPorPagina;
      const fin = inicio + this.productosPorPagina;
      
      return this.productosFiltrados.slice(inicio, fin);
    }

  cambiarPagina(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginas) {
      this.paginaActual = nuevaPagina;
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  obtenerRangoPaginas(): number[] {
  
    return Array.from({ length: this.totalPaginas }, (_, i) => i + 1);
  }


  // ===== MÉTODOS DE BÚSQUEDA =====
  
  aplicarFiltros(): void {
    if (!this.terminoBusqueda || this.terminoBusqueda.trim() === '') {
      this.productosFiltrados = [...this.productos];
    } else {
      const termino = this.terminoBusqueda.toLowerCase().trim();
      
      this.productosFiltrados = this.productos.filter(producto => {
        return (
          producto.codigo.toLowerCase().includes(termino) ||
          producto.nombre.toLowerCase().includes(termino) ||
          (producto.descripcion && producto.descripcion.toLowerCase().includes(termino)) ||
          (producto.categoria && producto.categoria.toLowerCase().includes(termino))
        );
      });
    }
    
    this.paginaActual = 1; 
    this.calcularTotalPaginas();
  }

  buscar(): void {
    this.aplicarFiltros();
  }

  limpiarBusqueda(): void {
    this.terminoBusqueda = '';
    this.aplicarFiltros();
  }
}
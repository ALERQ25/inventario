// src/app/components/dashboard/dashboard.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { ProductoService } from '../../services/producto.service';

Chart.register(...registerables);

// Interfaces locales para el componente
interface Estadisticas {
    total_productos: number;
    valor_total_inventario: number;
    stock_bajo: number;
    sin_stock: number;
    cantidad_total_items: number;
    precio_promedio: number;
    total_categorias: number;
}

interface GraficaCategorias {
    categorias: string[];
    cantidades: number[];
    valores: number[];
}

interface GraficaStockBajo {
    productos: string[];
    cantidades: number[];
    codigos: string[];
}

interface GraficaTopProductos {
    productos: string[];
    valores: number[];
    cantidades: number[];
    precios: number[];
}

interface GraficaDistribucionPrecios {
    rangos: string[];
    cantidades: number[];
}

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
    // Estadísticas
    estadisticas: Estadisticas | null = null;
    cargandoEstadisticas = false;

    // Charts
    chartCategorias: Chart | null = null;
    chartStockBajo: Chart | null = null;
    chartTopProductos: Chart | null = null;
    chartDistribucion: Chart | null = null;

    // Estados
    cargandoGraficas = false;
    mensajeError = '';

    constructor(private productoService: ProductoService) { }

    ngOnInit(): void {
        this.cargarDatos();
    }

    /**
     * Cargar todos los datos
     */
    cargarDatos(): void {
        this.cargarEstadisticas();
        this.cargarGraficas();
    }

    /**
     * Cargar estadísticas generales
     */
    cargarEstadisticas(): void {
        this.cargandoEstadisticas = true;
        this.productoService.obtenerEstadisticas().subscribe({
            next: (datos: any) => {
                this.estadisticas = datos;
                this.cargandoEstadisticas = false;
            },
            error: (error: any) => {
                this.mensajeError = 'Error al cargar estadísticas: ' + error.message;
                this.cargandoEstadisticas = false;
                console.error('Error:', error);
            }
        });
    }

    /**
     * Cargar todas las gráficas
     */
    cargarGraficas(): void {
        this.cargandoGraficas = true;

        // Esperar un momento para que el DOM esté listo
        setTimeout(() => {
            this.cargarGraficaCategorias();
            this.cargarGraficaStockBajo();
            this.cargarGraficaTopProductos();
            this.cargarGraficaDistribucion();
            this.cargandoGraficas = false;
        }, 100);
    }

    /**
     * Gráfica de productos por categoría
     */
    cargarGraficaCategorias(): void {
        this.productoService.obtenerGraficaCategorias().subscribe({
            next: (datos: any) => {
                const ctx = document.getElementById('chartCategorias') as HTMLCanvasElement;

                if (!ctx) {
                    console.error('Canvas chartCategorias no encontrado');
                    return;
                }

                if (this.chartCategorias) {
                    this.chartCategorias.destroy();
                }

                const config: ChartConfiguration = {
                    type: 'pie',
                    data: {
                        labels: datos.categorias,
                        datasets: [{
                            label: 'Productos por Categoría',
                            data: datos.cantidades,
                            backgroundColor: [
                                '#3b82f6',  // Azul
                                '#10b981',  // Verde
                                '#ff053bff',  // Ámbar
                                '#06b6d4',  // Cyan
                                '#8b5cf6',  // Violeta
                                '#aa0c5bff',  // Rosa
                                '#ef4444',  // Rojo
                                '#043375ff'
                            ],
                            borderWidth: 2,
                            borderColor: '#fff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    font: {
                                        size: 12
                                    },
                                    padding: 15
                                }
                            },
                            title: {
                                display: true,
                                text: 'Productos por Categoría',
                                font: {
                                    size: 16,
                                    weight: 'bold'
                                }
                            }
                        }
                    }
                };

                this.chartCategorias = new Chart(ctx, config);
            },
            error: (error: any) => {
                console.error('Error al cargar gráfica de categorías:', error);
            }
        });
    }

    /**
     * Gráfica de productos con stock bajo
     */
    cargarGraficaStockBajo(): void {
        this.productoService.obtenerGraficaStockBajo().subscribe({
            next: (datos: any) => {
                const ctx = document.getElementById('chartStockBajo') as HTMLCanvasElement;

                if (!ctx) {
                    console.error('Canvas chartStockBajo no encontrado');
                    return;
                }

                if (this.chartStockBajo) {
                    this.chartStockBajo.destroy();
                }

                const config: ChartConfiguration = {
                    type: 'bar',
                    data: {
                        labels: datos.productos,
                        datasets: [{
                            label: 'Cantidad en Stock',
                            data: datos.cantidades,
                            backgroundColor: datos.cantidades.map((cantidad: number) =>
                                cantidad === 0 ? '#d61024ff' : cantidad < 5 ? '#b36207ff' : '#089e08ff'
                            ),
                            borderColor: '#fff',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: 'Productos con Stock Bajo (< 10 unidades)',
                                font: {
                                    size: 16,
                                    weight: 'bold'
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    stepSize: 1
                                }
                            },
                            x: {
                                ticks: {
                                    font: {
                                        size: 10
                                    },
                                    maxRotation: 45,
                                    minRotation: 45
                                }
                            }
                        }
                    }
                };

                this.chartStockBajo = new Chart(ctx, config);
            },
            error: (error: any) => {
                console.error('Error al cargar gráfica de stock bajo:', error);
            }
        });
    }

    /**
     * Gráfica de top productos por valor
     */
    cargarGraficaTopProductos(): void {
        this.productoService.obtenerGraficaTopProductos().subscribe({
            next: (datos: any) => {
                const ctx = document.getElementById('chartTopProductos') as HTMLCanvasElement;

                if (!ctx) {
                    console.error('Canvas chartTopProductos no encontrado');
                    return;
                }

                if (this.chartTopProductos) {
                    this.chartTopProductos.destroy();
                }

                const config: ChartConfiguration = {
                    type: 'bar',
                    data: {
                        labels: datos.productos,
                        datasets: [{
                            label: 'Valor Total ($)',
                            data: datos.valores,
                            backgroundColor: '#14bd3cff',
                            borderColor: '#ffffffff',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: 'Top 10 Productos Más Valiosos',
                                font: {
                                    size: 16,
                                    weight: 'bold'
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: (context: any) => {
                                        const valor = context.parsed.x;
                                        const index = context.dataIndex;
                                        const cantidad = datos.cantidades[index];
                                        const precio = datos.precios[index];
                                        return [
                                            `Valor Total: $${valor.toFixed(2)}`,
                                            `Cantidad: ${cantidad}`,
                                            `Precio Unit: $${precio.toFixed(2)}`
                                        ];
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                ticks: {
                                    callback: (value: any) => '$' + value
                                }
                            }
                        }
                    }
                };

                this.chartTopProductos = new Chart(ctx, config);
            },
            error: (error: any) => {
                console.error('Error al cargar gráfica de top productos:', error);
            }
        });
    }

    /**
     * Gráfica de distribución de precios
     */
    cargarGraficaDistribucion(): void {
        this.productoService.obtenerGraficaDistribucionPrecios().subscribe({
            next: (datos: any) => {
                const ctx = document.getElementById('chartDistribucion') as HTMLCanvasElement;

                if (!ctx) {
                    console.error('Canvas chartDistribucion no encontrado');
                    return;
                }

                if (this.chartDistribucion) {
                    this.chartDistribucion.destroy();
                }

                const config: ChartConfiguration = {
                    type: 'doughnut',
                    data: {
                        labels: datos.rangos,
                        datasets: [{
                            label: 'Productos por Rango de Precio',
                            data: datos.cantidades,
                            backgroundColor: [
                                '#17a2b8',
                                '#28a745',
                                '#ffc107',
                                '#fd7e14',
                                '#dc3545'
                            ],
                            borderWidth: 2,
                            borderColor: '#fff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    font: {
                                        size: 12
                                    },
                                    padding: 15
                                }
                            },
                            title: {
                                display: true,
                                text: 'Distribución por Rangos de Precio',
                                font: {
                                    size: 16,
                                    weight: 'bold'
                                }
                            }
                        }
                    }
                };

                this.chartDistribucion = new Chart(ctx, config);
            },
            error: (error: any) => {
                console.error('Error al cargar gráfica de distribución:', error);
            }
        });
    }

    /**
     * Formatear moneda
     */
    formatearMoneda(valor: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP'
        }).format(valor);
    }

    /**
     * Limpiar charts al destruir componente
     */
    ngOnDestroy(): void {
        if (this.chartCategorias) this.chartCategorias.destroy();
        if (this.chartStockBajo) this.chartStockBajo.destroy();
        if (this.chartTopProductos) this.chartTopProductos.destroy();
        if (this.chartDistribucion) this.chartDistribucion.destroy();
    }
}
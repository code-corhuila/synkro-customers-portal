import type { Routes } from '@angular/router';
import { Component } from '@angular/core';
import { CustomersPageComponent } from './pages/customers-page.component';
@Component({selector:'customers-not-found',template:'<h1>Página no encontrada</h1><p>Usa la navegación del Host para volver a clientes.</p>'})
export class CustomersNotFoundComponent {}
export const routes:Routes=[
  {path:'customers',component:CustomersPageComponent,data:{mode:'list'}},
  {path:'customers/new',component:CustomersPageComponent,data:{mode:'new'}},
  {path:'customers/:id/edit',component:CustomersPageComponent,data:{mode:'edit'}},
  {path:'customers/:id',component:CustomersPageComponent,data:{mode:'detail'}},
  {path:'**',component:CustomersNotFoundComponent}
];

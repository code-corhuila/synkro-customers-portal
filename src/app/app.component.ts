import { Component, Input, inject, signal, type OnDestroy } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import type { ShellContract } from './shell-contract';
import { CustomersApiService } from './customers/data/customers-api.service';
@Component({selector:'customers-root',imports:[RouterOutlet],template:`
  @if (ready()) { <router-outlet/> } @else { <p role="status">{{notice()}}</p> }
`})
export class AppComponent implements OnDestroy {
  ready = signal(false);
  notice = signal('Esperando contrato del Host…');
  private api = inject(CustomersApiService);
  private router = inject(Router);
  private destroyed = false;
  @Input() set shellContract(contract: ShellContract) {
    if (!contract || contract.contractVersion !== 1 || contract.basePath !== '/customers' ||
        typeof contract.api?.request !== 'function' || typeof contract.session?.user !== 'function' || typeof contract.navigate !== 'function') {
      this.api.cancel(); this.ready.set(false); this.notice.set('Este módulo no está disponible: contrato del Host incompatible.'); return;
    }
    const role = contract.session.user()?.role;
    if (role !== 'ADMIN' && role !== 'SALESPERSON') {
      this.api.cancel(); this.ready.set(false); this.notice.set('No tienes permiso para acceder a clientes.'); return;
    }
    const path = window.location.pathname;
    if (path !== contract.basePath && !path.startsWith(`${contract.basePath}/`)) return;
    this.api.setContract(contract); this.ready.set(true);
    void this.router.navigateByUrl(path + window.location.search + window.location.hash, {skipLocationChange:true})
      .catch(()=> { if (!this.destroyed) { this.ready.set(false); this.notice.set('Este módulo no está disponible en este momento.'); } });
  }
  ngOnDestroy() { this.destroyed = true; this.api.cancel(); this.router.dispose(); }
}

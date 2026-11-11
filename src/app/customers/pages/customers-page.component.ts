import { Component, inject, signal, ViewChild, ElementRef, type OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, type Subscription } from 'rxjs';
import { CustomersApiService } from '../data/customers-api.service';
import { CustomerFormComponent } from '../components/customer-form.component';
import { blankCustomer, hasMissingContacts, toRequest, SEARCH_MAX, SEARCH_MIN, type Customer, type CustomerRequest, type Page, type SearchMatch, type SearchRequest, type SearchResponse, type SearchStatus } from '../model/customer';
import { displayError, type DisplayError } from '../model/errors';
import { normalizeCustomer } from '../model/validation';

const MATCH_LABELS:Record<SearchMatch,string> = {DOCUMENT_EXACT:'Documento exacto',DOCUMENT_PREFIX:'Documento (inicio)',NAME:'Nombre'};

@Component({selector:'customers-page',imports:[FormsModule,DatePipe,CustomerFormComponent],styleUrls:['./customers.css'],template:`
  <header class="customers-heading"><div><h1 #heading tabindex="-1">{{title()}}</h1><p>Desactivar conserva el registro y el historial de ventas.</p></div>
    <div class="actions">@if (mode === 'list') {<button class="primary" (click)="go('/new')">Nuevo cliente</button>}
      @else {<button (click)="go('')">Volver a clientes</button>}
      <button (click)="api.go('/dashboard')">Ir al inicio</button></div>
  </header>
  <section class="card" [attr.aria-busy]="loading() || pending()">
    @if (mode === 'list') {
      <form class="toolbar" role="search" aria-label="Búsqueda de clientes" (ngSubmit)="runSearch()" novalidate>
        <div class="field grow"><label for="search-query">Buscar por nombre o documento</label>
          <input id="search-query" name="query" autocomplete="off" [(ngModel)]="searchText" aria-describedby="search-help error-query" [attr.aria-invalid]="searchValidation() ? 'true' : null"/>
          <p id="search-help" class="hint">Escribe entre {{searchMin}} y {{searchMax}} caracteres. Se muestran hasta 5 coincidencias.</p>
          <p id="error-query" class="field-error" aria-live="polite">{{searchValidation()}}</p></div>
        @if (api.canReactivate()) {
          <div class="field"><label for="search-status">Estado a buscar</label><select id="search-status" name="searchStatus" [(ngModel)]="searchStatus"><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option></select></div>
        }
        <button type="submit">Buscar cliente</button>
      </form>
      @if (searching() || searchError() || results()) {
        <section class="search-results" aria-label="Resultados de la búsqueda" [attr.aria-busy]="searching()">
          @if (searching()) {<p role="status">Buscando…</p>}
          @else if (searchError(); as e) {
            <div id="search-error" role="alert" class="error"><p>{{e.message}}</p>@if (e.traceId) {<p>Referencia: {{e.traceId}}</p>}<button (click)="retrySearch()">Reintentar búsqueda</button></div>
          } @else if (results(); as r) {
            @if (r.data.length === 0) {<p role="status">No hay coincidencias para esa búsqueda.</p>}
            @else {
              <p role="status">{{r.data.length}} {{r.data.length === 1 ? 'coincidencia' : 'coincidencias'}}.</p>
              <div class="table-scroll"><table><caption>Coincidencias de la búsqueda</caption><thead><tr><th scope="col">Cliente</th><th scope="col">Coincide por</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
                <tbody>@for (s of r.data; track s.customerId) {<tr><td>{{s.name}}<span class="subtext">Documento {{s.identityDocument}}</span></td><td>{{matchLabel(s.match)}}</td><td><span class="badge" [class.inactive]="!s.active">{{s.active ? 'Activo' : 'Inactivo'}}</span></td>
                  <td><div class="actions">@if (s.active) {<button (click)="go('/'+s.customerId)">Ver detalle</button>} @else if (api.canReactivate()) {<button (click)="confirmReactivation(s.customerId,s.name,$event)">Reactivar</button>} @else {<span>Solo un administrador puede reactivar clientes.</span>}</div></td></tr>}</tbody>
              </table></div>
              @if (r.meta.hasMore) {<p class="hint">Hay más de {{r.meta.limit}} coincidencias. Escribe más texto para acotar la búsqueda.</p>}
            }
          }
        </section>
      }
      <form class="toolbar" (ngSubmit)="filter()">
        <div class="field"><label for="filter-document">Documento exacto</label><input id="filter-document" name="identityDocument" maxlength="30" [(ngModel)]="document"/></div>
        <div class="field"><label for="filter-active">Estado</label><select id="filter-active" name="active" [(ngModel)]="active"><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></div>
        <div class="field"><label for="filter-limit">Clientes por página</label><input id="filter-limit" name="limit" type="number" min="1" max="100" [(ngModel)]="limit"/></div>
        <button type="submit">Buscar</button>
      </form>
    }
    @if (error(); as e) {
      <div role="alert" class="error"><p>{{e.message}}</p>@if (e.traceId) {<p>Referencia: {{e.traceId}}</p>}
        @if (mode === 'new' && e.uncertain) {
          <p>El cliente pudo haberse registrado. Reintenta el registro original para conocer el resultado.</p>
          <button [disabled]="pending()" (click)="retryIntent()">Reintentar registro</button>
          @if (intentChanged()) {<p>Cambiaste los datos. El nuevo envío será una intención diferente y el registro anterior pudo haberse registrado.</p><button (click)="newIntent()">Iniciar un registro diferente</button>}
        } @else if (mode === 'edit' && !loading() && customer()) {<button [disabled]="pending()" (click)="save(draft)">Reintentar actualización</button>}
        @else if (mode !== 'new' && e.status !== 403 && e.status !== 401 && !customer()) {<button (click)="load()">Reintentar</button>}
      </div>
    }
    @if (loading()) {<p role="status">Cargando clientes…</p>}
    @else if (mode === 'list' && !error()) {
      @if (rows().data.length === 0) {<p role="status">No hay clientes que coincidan con la búsqueda.</p>}
      @else {<div class="table-scroll"><table><caption>Clientes registrados</caption><thead><tr><th scope="col">Nombre / dirección</th><th scope="col">Documento</th><th scope="col">Correo</th><th scope="col">Teléfono</th><th scope="col">Registro</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
        <tbody>@for (row of rows().data; track row.customerId) {<tr><td>{{row.name}}<span class="subtext">{{row.address || 'Sin dirección'}}</span><span class="subtext">{{row.customerId}}</span></td><td>{{row.identityDocument}}</td><td>{{row.email || 'Sin correo'}}</td><td>{{row.phone || 'Sin teléfono'}}</td><td>{{row.registrationDate | date:'short':'':'es'}}</td><td><span class="badge" [class.inactive]="!row.active">{{row.active ? 'Activo' : 'Inactivo'}}</span></td><td><div class="actions">@if (row.active) {<button (click)="go('/'+row.customerId)">Ver detalle</button><button (click)="go('/'+row.customerId+'/edit')">Editar</button><button (click)="confirm(row,$event)">Desactivar</button>} @else if (api.canReactivate()) {<button (click)="confirmReactivation(row.customerId,row.name,$event)">Reactivar</button>} @else {<span>Solo un administrador puede reactivar clientes.</span>}</div></td></tr>}</tbody>
      </table></div>}
      <nav class="pagination" aria-label="Paginación de clientes"><button [disabled]="page <= 1" (click)="changePage(-1)">Anterior</button><span>Página {{rows().meta.page}} de {{rows().meta.totalPages}} · {{rows().meta.total}} clientes</span><button [disabled]="page >= rows().meta.totalPages" (click)="changePage(1)">Siguiente</button></nav>
    }
    @if (!loading() && (mode === 'new' || (mode === 'edit' && customer()))) {
      <customer-form [model]="draft" [errors]="error()?.fields || {}" [pending]="pending()" [editing]="mode === 'edit'" [legacy]="legacy()" [blocked]="mode === 'new' && intentChanged()" (changed)="changed($event)" (save)="save($event)"/>
    }
    @if (!loading() && mode === 'detail' && customer(); as c) {
      <dl><dt>Nombre</dt><dd>{{c.name}}</dd><dt>Documento</dt><dd>{{c.identityDocument}}</dd><dt>Correo electrónico</dt><dd>{{c.email || 'Sin correo'}}</dd><dt>Teléfono</dt><dd>{{c.phone || 'Sin teléfono'}}</dd><dt>Dirección</dt><dd>{{c.address || 'Sin dirección'}}</dd><dt>ID</dt><dd>{{c.customerId}}</dd><dt>Fecha de registro</dt><dd>{{c.registrationDate | date:'medium':'':'es'}}</dd><dt>Estado</dt><dd>{{c.active ? 'Activo' : 'Inactivo'}}</dd></dl>
      @if (c.active) {<div class="actions"><button (click)="go('/'+c.customerId+'/edit')">Editar</button><button (click)="confirm(c,$event)">Desactivar</button></div>}
    }
    @if (notice()) {<p role="status">{{notice()}}</p>}
  </section>
  <dialog #dialog aria-labelledby="deactivate-title" (cancel)="cancelDialog($event)">
    <h2 id="deactivate-title">Desactivar cliente</h2><p>¿Desactivar a {{selected()?.name}}? Su documento seguirá reservado. El registro no se elimina.</p>
    @if (deleteError(); as e) {<p role="alert" class="error">{{e.message}} @if (e.traceId) {Referencia: {{e.traceId}}}</p>}
    <div class="actions"><button autofocus [disabled]="pending()" (click)="closeDialog()">Cancelar</button><button [disabled]="pending()" (click)="deactivate()">{{pending() ? 'Desactivando…' : 'Confirmar desactivación'}}</button></div>
  </dialog>
  <dialog #reactivateDialog aria-labelledby="reactivate-title" (cancel)="cancelReactivation($event)">
    <h2 id="reactivate-title">Reactivar cliente</h2><p>¿Reactivar a {{reactivating()?.name}}? Volverá a estar disponible para ventas. Su documento, su identificador y su historial no cambian.</p>
    @if (reactivateError(); as e) {<p role="alert" class="error">{{e.message}} @if (e.uncertain) {Puedes reintentar: repetir la reactivación es seguro.} @if (e.traceId) {Referencia: {{e.traceId}}}</p>}
    <div class="actions"><button autofocus [disabled]="pending()" (click)="closeReactivation()">Cancelar reactivación</button><button [disabled]="pending()" (click)="reactivate()">{{pending() ? 'Reactivando…' : 'Confirmar reactivación'}}</button></div>
  </dialog>
`})
export class CustomersPageComponent implements OnDestroy {
  api = inject(CustomersApiService);
  private route = inject(ActivatedRoute);
  private subscription:Subscription;
  private generation = 0;
  private searchGeneration = 0;
  private destroyed = false;
  private returnFocus?:HTMLElement;
  mode = 'list'; id = ''; page = 1; limit = 20; document = ''; active = '';
  searchMin = SEARCH_MIN; searchMax = SEARCH_MAX; searchText = ''; searchStatus:SearchStatus = 'ACTIVE';
  private query:Record<string,string> = {page:'1',limit:'20'};
  private lastSearch?:SearchRequest;
  loading = signal(false); pending = signal(false); error = signal<DisplayError|null>(null); notice = signal('');
  rows = signal<Page<Customer>>({data:[],meta:{page:1,limit:20,total:0,totalPages:0}});
  customer = signal<Customer|null>(null); selected = signal<Customer|null>(null); deleteError = signal<DisplayError|null>(null);
  legacy = signal(false);
  searching = signal(false); searchError = signal<DisplayError|null>(null); searchValidation = signal(''); results = signal<SearchResponse|null>(null);
  reactivating = signal<{id:string;name:string}|null>(null); reactivateError = signal<DisplayError|null>(null);
  draft = blankCustomer();
  private intent?:{key:string;payload:CustomerRequest};
  intentChanged = signal(false);
  @ViewChild('dialog') private dialog?:ElementRef<HTMLDialogElement>;
  @ViewChild('reactivateDialog') private reactivateDialog?:ElementRef<HTMLDialogElement>;
  @ViewChild('heading') private heading?:ElementRef<HTMLHeadingElement>;
  ngAfterViewInit() {this.heading?.nativeElement.focus();}
  constructor() {
    this.subscription=combineLatest([this.route.data,this.route.paramMap]).subscribe(([data,params])=>{
      this.mode=data['mode']; this.id=params.get('id') || ''; this.customer.set(null); this.draft=blankCustomer(); this.legacy.set(false);
      this.pending.set(false); this.intent=undefined; this.intentChanged.set(false); this.load();
    });
  }
  title() { return this.mode === 'new' ? 'Registrar cliente' : this.mode === 'edit' ? 'Actualizar cliente' : this.mode === 'detail' ? 'Detalle del cliente' : 'Clientes'; }
  go(suffix:string) { this.api.go('/customers'+suffix); }
  matchLabel(match:SearchMatch) { return MATCH_LABELS[match] ?? 'Coincidencia'; }
  filter() {
    if (!Number.isInteger(this.limit) || this.limit < 1 || this.limit > 100) {this.error.set(displayError({status:400})); return;}
    this.page=1; this.query={page:'1',limit:String(this.limit),...(this.document?{identityDocument:this.document}:{}),...(this.active?{active:this.active}:{})}; this.load();
  }
  changePage(delta:number) {this.page+=delta; this.query={...this.query,page:String(this.page)}; this.load();}
  load() {
    const generation=++this.generation; this.api.cancelPending(); this.error.set(null); this.notice.set('');
    if (this.mode === 'new') {this.loading.set(false); return;}
    this.loading.set(true);
    const request=this.mode === 'list' ? this.api.list(this.query) : this.api.get(this.id);
    void request.then(result=>{
      if (this.destroyed || generation !== this.generation) return;
      if (this.mode === 'list') this.rows.set(result as Page<Customer>);
      else {const c=result as Customer; this.customer.set(c); this.legacy.set(hasMissingContacts(c)); this.draft=toRequest(c);}
    }).catch(e=>{if (!this.destroyed && generation === this.generation) this.error.set(displayError(e));})
      .finally(()=>{if (!this.destroyed && generation === this.generation) this.loading.set(false);});
  }

  // ---- bounded search (HU-CLI-05): text goes in the request body, results are advisory and capped by the API --------------
  runSearch() {
    const query=this.searchText.trim(), length=[...query].length;
    if (length < SEARCH_MIN) {this.searchValidation.set(`Escribe al menos ${SEARCH_MIN} caracteres para buscar.`); return;}
    if (length > SEARCH_MAX) {this.searchValidation.set(`La búsqueda admite como máximo ${SEARCH_MAX} caracteres.`); return;}
    this.searchValidation.set('');
    this.lastSearch={query,status:this.api.canReactivate() ? this.searchStatus : 'ACTIVE'};
    this.executeSearch();
  }
  retrySearch() {if (this.lastSearch) this.executeSearch();}
  private executeSearch() {
    const generation=++this.searchGeneration; this.searching.set(true); this.searchError.set(null); this.notice.set('');
    void this.api.search(this.lastSearch!).then(result=>{if (!this.destroyed && generation === this.searchGeneration) this.results.set(result);})
      .catch(e=>{if (!this.destroyed && generation === this.searchGeneration) {this.results.set(null); this.searchError.set(displayError(e));}})
      .finally(()=>{if (!this.destroyed && generation === this.searchGeneration) this.searching.set(false);});
  }

  // ---- create / replace -------------------------------------------------------------------------------------------------
  changed(value:CustomerRequest) {
    this.draft=value;
    this.intentChanged.set(!!this.intent && !!this.error()?.uncertain && JSON.stringify(normalizeCustomer(value))!==JSON.stringify(this.intent.payload));
    if (!this.error()?.uncertain) {this.error.set(null); this.intent=undefined;}
  }
  newIntent() {this.intent=undefined; this.intentChanged.set(false); this.error.set(null); this.notice.set('Se iniciará un registro diferente. Comprueba el documento del registro anterior.');}
  retryIntent() {if (this.intent) this.save(this.intent.payload,true);}
  save(payload:CustomerRequest, retry=false) {
    if (this.pending() || (this.intentChanged() && !retry)) return;
    const normalized=normalizeCustomer(payload);
    if (this.mode === 'new' && !this.intent) this.intent={key:crypto.randomUUID(),payload:Object.freeze({...normalized})};
    this.pending.set(true); this.error.set(null); const generation=this.generation;
    const request=this.mode === 'new' ? this.api.create(this.intent!.payload,this.intent!.key) : this.api.update(this.id,normalized);
    void request.then(c=>{if (!this.destroyed && generation === this.generation) {this.notice.set(this.mode === 'new'?'Cliente registrado.':'Cliente actualizado.'); this.api.go('/customers/'+c.customerId);}})
      .catch(e=>{if (!this.destroyed && generation === this.generation) {const error=displayError(e);this.error.set(error);if (error.status === 404 && this.mode === 'edit') this.customer.set(null);}})
      .finally(()=>{if (!this.destroyed && generation === this.generation) this.pending.set(false);});
  }

  // ---- deactivation -------------------------------------------------------------------------------------------------------
  confirm(c:Customer,event:Event) {this.selected.set(c); this.deleteError.set(null); this.returnFocus=event.currentTarget as HTMLElement; this.dialog?.nativeElement.showModal();}
  cancelDialog(event:Event) {if (this.pending()) event.preventDefault(); else this.selected.set(null);}
  closeDialog() {this.dialog?.nativeElement.close(); this.selected.set(null); this.returnFocus?.focus();}
  deactivate() {
    const c=this.selected(); if (!c || this.pending()) return;
    this.pending.set(true); this.deleteError.set(null); const generation=this.generation;
    void this.api.deactivate(c.customerId).then(result=>{
      if (this.destroyed || generation !== this.generation) return;
      this.closeDialog(); this.rows.update(p=>({...p,data:p.data.map(row=>row.customerId===result.customerId?result:row)}));
      if (this.mode === 'detail') this.customer.set(result);
      this.notice.set('Cliente desactivado. El registro se conserva.');
    }).catch(e=>{if (!this.destroyed && generation === this.generation) this.deleteError.set(displayError(e));})
      .finally(()=>{if (!this.destroyed && generation === this.generation) this.pending.set(false);});
  }

  // ---- ADMIN reactivation (HU-CLI-05): explicit transition, never a PUT; the API enforces the role ----------------------------
  confirmReactivation(id:string,name:string,event:Event) {
    if (!this.api.canReactivate()) return;
    this.reactivating.set({id,name}); this.reactivateError.set(null); this.returnFocus=event.currentTarget as HTMLElement; this.reactivateDialog?.nativeElement.showModal();
  }
  cancelReactivation(event:Event) {if (this.pending()) event.preventDefault(); else this.reactivating.set(null);}
  closeReactivation() {this.reactivateDialog?.nativeElement.close(); this.reactivating.set(null); this.returnFocus?.focus();}
  reactivate() {
    const target=this.reactivating(); if (!target || this.pending()) return;
    this.pending.set(true); this.reactivateError.set(null); const generation=this.generation;
    void this.api.activate(target.id).then(result=>{
      if (this.destroyed || generation !== this.generation) return;
      this.closeReactivation();
      this.rows.update(p=>({...p,data:p.data.map(row=>row.customerId===result.customerId?result:row)}));
      this.results.update(r=>r && {...r,data:r.data.filter(s=>s.customerId !== result.customerId)});
      this.notice.set('Cliente reactivado. Ya puede usarse en ventas.');
    }).catch(e=>{
      if (this.destroyed || generation !== this.generation) return;
      const error=displayError(e); if (error.status === 404) error.message='Cliente no encontrado.';
      this.reactivateError.set(error);
    }).finally(()=>{if (!this.destroyed && generation === this.generation) this.pending.set(false);});
  }
  ngOnDestroy() {
    this.destroyed=true; this.generation++; this.searchGeneration++; this.subscription.unsubscribe(); this.api.cancel();
    for (const dialog of [this.dialog,this.reactivateDialog]) if (dialog?.nativeElement.open) dialog.nativeElement.close();
  }
}

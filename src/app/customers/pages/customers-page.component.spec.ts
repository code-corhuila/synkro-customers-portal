import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../../app.config';
import { CustomersPageComponent } from './customers-page.component';
import { CustomersApiService } from '../data/customers-api.service';
import type { ShellContract } from '../../shell-contract';
import type { Customer } from '../model/customer';

const customer:Customer={customerId:'a',name:'Ana',identityDocument:'DOC',email:null,phone:null,address:null,registrationDate:'2026-10-12T15:00:00Z',active:true};
const page=(rows=[customer])=>({data:rows,meta:{page:1,limit:20,total:rows.length,totalPages:rows.length?1:0}});
beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');})});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:vi.fn(function(this:HTMLDialogElement){this.removeAttribute('open');})});
});
async function settle(f:ComponentFixture<CustomersPageComponent>) {
  for(let i=0;i<6;i++) await Promise.resolve();
  await f.whenStable(); f.detectChanges();
}
async function setup(mode='list',request=vi.fn().mockResolvedValue(page())) {
  TestBed.configureTestingModule({imports:[CustomersPageComponent],providers:[CustomersApiService,
    {provide:ActivatedRoute,useValue:{data:new BehaviorSubject({mode}),paramMap:new BehaviorSubject(convertToParamMap({id:'a'}))}}]});
  const shell:ShellContract={contractVersion:1,basePath:'/customers',api:{request},session:{user:()=>({sub:'person',role:'ADMIN'})},navigate:vi.fn()};
  TestBed.inject(CustomersApiService).setContract(shell);
  const fixture=TestBed.createComponent(CustomersPageComponent); fixture.detectChanges(); await settle(fixture);
  return {fixture,shell,request,el:fixture.nativeElement as HTMLElement};
}
async function input(f:ComponentFixture<CustomersPageComponent>,name:string,value:string) {
  const el=f.nativeElement.querySelector(`[name="${name}"]`) as HTMLInputElement;
  expect(el,`input ${name}`).not.toBeNull(); el.value=value;
  el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); f.detectChanges(); await settle(f);
}
async function click(f:ComponentFixture<CustomersPageComponent>,text:string) {
  const button=[...f.nativeElement.querySelectorAll('button')].find((b:unknown)=>(b as HTMLElement).textContent?.trim()===text) as HTMLButtonElement;
  expect(button,`button ${text}`).toBeDefined(); button.click(); f.detectChanges(); await settle(f);
}
describe('CLI-UI-03/04/05 list',()=>{
  it('keeps Host heading styles from changing the explanatory copy',async()=>{
    const hostStyle=document.createElement('style');hostStyle.textContent='.heading {text-transform:uppercase;font-family:"Host heading"}';document.head.append(hostStyle);
    try {const {el}=await setup();expect(getComputedStyle(el.querySelector('header')!).textTransform).not.toBe('uppercase');}
    finally {hostStyle.remove();}
  });
  it('shows contractual data including inactive rows and omits active when all selected',async()=>{
    const {fixture,el,request}=await setup('list',vi.fn().mockResolvedValue(page([customer,{...customer,customerId:'b',name:'Inactivo',active:false}])));
    expect(el.textContent).toContain('Ana'); expect(el.textContent).toContain('Inactivo'); expect(el.textContent).toContain('DOC');
    expect(request.mock.calls[0][2].query).toEqual({page:'1',limit:'20'});
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    await input(fixture,'identityDocument','EXACT'); await input(fixture,'active','false'); await click(fixture,'Buscar');
    expect(request.mock.lastCall![2].query).toEqual({page:'1',limit:'20',identityDocument:'EXACT',active:'false'});
  });
  it('shows loading, error/trace, explicit retry and empty states',async()=>{
    let reject!:(e:unknown)=>void;
    const request=vi.fn().mockImplementationOnce(()=>new Promise((_,r)=>reject=r)).mockResolvedValue(page([]));
    const {fixture,el}=await setup('list',request);
    expect(el.textContent).toContain('Cargando');
    reject({status:500,body:{traceId:'trace-123'}}); await settle(fixture);
    expect(el.textContent).toContain('trace-123'); await click(fixture,'Reintentar'); expect(el.textContent).toContain('No hay clientes');
  });
  it('ignores out-of-order responses even if abort is ignored',async()=>{
    let old!:(v:unknown)=>void;
    const request=vi.fn().mockImplementationOnce(()=>new Promise(r=>old=r)).mockResolvedValue(page([{...customer,name:'Resultado nuevo'}]));
    const {fixture,el}=await setup('list',request);
    await input(fixture,'identityDocument','NEW'); await click(fixture,'Buscar');
    old(page()); await settle(fixture);
    expect(el.textContent).toContain('Resultado nuevo'); expect(el.textContent).not.toContain('Ana');
    expect(request.mock.calls[0][2].signal.aborted).toBe(true);
    fixture.destroy();
  });
});
describe('CLI-UI-06/07 creation',()=>{
  it('blocks invalid forms and shows labeled field errors',async()=>{
    const {fixture,el,request}=await setup('new'); await click(fixture,'Registrar cliente');
    expect(request).not.toHaveBeenCalled(); expect(el.textContent).toContain('obligatorio');
    expect(el.querySelector('label[for="customer-name"]')).not.toBeNull();
  });
  it('locks pending submit and retries the frozen key/payload after uncertain failure',async()=>{
    let reject!:(e:unknown)=>void;
    const request=vi.fn().mockImplementationOnce(()=>new Promise((_,r)=>reject=r)).mockResolvedValue(customer);
    const {fixture,el,shell}=await setup('new',request);
    await input(fixture,'name','Ana'); await input(fixture,'identityDocument','DOC'); await click(fixture,'Registrar cliente');
    expect((el.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    reject({status:0,body:{error:'TIMEOUT',traceId:'uncertain'}}); await settle(fixture);
    await click(fixture,'Reintentar registro');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][2].idempotencyKey).toBe(request.mock.calls[0][2].idempotencyKey);
    expect(request.mock.calls[1][2].body).toEqual(request.mock.calls[0][2].body);
    expect(shell.navigate).toHaveBeenCalledWith('/customers/a');
  });
  it('requires explicit new intent after editing an uncertain payload',async()=>{
    const request=vi.fn().mockRejectedValue({status:500,body:{traceId:'t'}});
    const {fixture,el}=await setup('new',request); await input(fixture,'name','Ana'); await input(fixture,'identityDocument','DOC'); await click(fixture,'Registrar cliente');
    await input(fixture,'name','Otra'); await click(fixture,'Registrar cliente'); expect(request).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('pudo haberse registrado');
    await click(fixture,'Iniciar un registro diferente'); await click(fixture,'Registrar cliente');
    expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls[1][2].idempotencyKey).not.toBe(request.mock.calls[0][2].idempotencyKey);
  });
  it('attaches duplicate document errors to the field without logging out or retrying',async()=>{
    const request=vi.fn().mockRejectedValue({status:422,body:{traceId:'duplicate',details:[{field:'identityDocument',message:'Identity document already exists'}]}});
    const {fixture,el}=await setup('new',request); await input(fixture,'name','Ana'); await input(fixture,'identityDocument','DOC'); await click(fixture,'Registrar cliente');
    const error=el.querySelector('#error-identityDocument'); expect(error?.textContent).toContain('registrado');
    expect(el.querySelector('[name="identityDocument"]')?.getAttribute('aria-describedby')).toContain('error-identityDocument');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
describe('CLI-UI-08/09/10/13 detail and writes',()=>{
  it('shows missing/inactive detail for 404 with navigation back',async()=>{
    const {fixture,el,shell}=await setup('detail',vi.fn().mockRejectedValue({status:404,body:{traceId:'missing'}}));
    expect(el.textContent).toContain('no encontrado o inactivo'); await click(fixture,'Volver a clientes'); expect(shell.navigate).toHaveBeenCalledWith('/customers');
  });
  it('replaces optional fields with null and never sends immutable response fields',async()=>{
    const request=vi.fn().mockResolvedValueOnce({...customer,email:'old@example.com'}).mockResolvedValue(customer);
    const {fixture}=await setup('edit',request); await input(fixture,'email',''); await click(fixture,'Guardar cambios');
    expect(request.mock.calls[1].slice(0,2)).toEqual(['PUT','/api/v1/customers/a']);
    expect(request.mock.calls[1][2].body).toEqual({name:'Ana',identityDocument:'DOC',email:null,phone:null,address:null});
  });
  it('removes the update form if the server reports that the customer became inactive',async()=>{
    const request=vi.fn().mockResolvedValueOnce(customer).mockRejectedValue({status:404,body:{traceId:'became-inactive'}});
    const {fixture,el}=await setup('edit',request);await click(fixture,'Guardar cambios');
    expect(el.textContent).toContain('no encontrado o inactivo');expect(el.querySelector('customer-form')).toBeNull();
  });
  it('requires a keyboard-accessible confirmation before logical deactivation',async()=>{
    vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(this:HTMLDialogElement){this.setAttribute('open','');});
    vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(this:HTMLDialogElement){this.removeAttribute('open');});
    const request=vi.fn().mockResolvedValueOnce(page()).mockResolvedValue({...customer,active:false});
    const {fixture,el}=await setup('list',request); await click(fixture,'Desactivar');
    expect(el.querySelector('dialog')?.hasAttribute('open')).toBe(true); expect(request).toHaveBeenCalledTimes(1);
    await click(fixture,'Cancelar'); expect(request).toHaveBeenCalledTimes(1);
    await click(fixture,'Desactivar'); await click(fixture,'Confirmar desactivación');
    expect(request.mock.calls[1].slice(0,2)).toEqual(['DELETE','/api/v1/customers/a']); expect(el.textContent).toContain('Inactivo');
  });
  it('cancels requests on teardown and ignores late writes',async()=>{
    let resolve!:(v:unknown)=>void;
    const request=vi.fn().mockImplementation(()=>new Promise(r=>resolve=r));
    const {fixture}=await setup('detail',request); const signal=request.mock.calls[0][2].signal; fixture.destroy();
    expect(signal.aborted).toBe(true); resolve(customer); await Promise.resolve();
  });
});

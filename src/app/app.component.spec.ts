import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppComponent } from './app.component';
import { CustomersApiService } from './customers/data/customers-api.service';
import type { ShellContract } from './shell-contract';
describe('CLI-UI-01/12/13 root contract lifecycle', () => {
  let shell: ShellContract;
  beforeEach(() => {
    TestBed.configureTestingModule({imports:[AppComponent],providers:[CustomersApiService,provideRouter([])]});
    shell={contractVersion:1,basePath:'/customers',api:{request:vi.fn()},session:{user:()=>({sub:'person',role:'SALESPERSON'})},navigate:vi.fn()};
  });
  it('waits, accepts late property and explicitly synchronizes a deep link without writing history', async () => {
    const router=TestBed.inject(Router); const navigate=vi.spyOn(router,'navigateByUrl').mockResolvedValue(true);
    history.replaceState(null,'','/customers/new');
    const fixture=TestBed.createComponent(AppComponent); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Esperando');
    fixture.componentRef.setInput('shellContract',shell); fixture.detectChanges();
    expect(fixture.componentInstance.ready()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/customers/new',{skipLocationChange:true});
    const cancel=vi.spyOn(TestBed.inject(CustomersApiService),'cancel'); const dispose=vi.spyOn(router,'dispose');
    fixture.destroy(); expect(cancel).toHaveBeenCalled(); expect(dispose).toHaveBeenCalled();
  });
  it('controls incompatible contract and INVENTORY without requesting data', () => {
    const fixture=TestBed.createComponent(AppComponent);
    fixture.componentRef.setInput('shellContract',{...shell,contractVersion:2}); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('no está disponible');
    fixture.componentRef.setInput('shellContract',{...shell,session:{user:()=>({sub:'x',role:'INVENTORY'})}}); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No tienes permiso');
    expect(shell.api.request).not.toHaveBeenCalled();
  });
  it('resynchronizes Back and ignores paths outside the assigned base', () => {
    const navigate=vi.spyOn(TestBed.inject(Router),'navigateByUrl').mockResolvedValue(true);
    const fixture=TestBed.createComponent(AppComponent);
    history.replaceState(null,'','/customers/one/edit'); fixture.componentRef.setInput('shellContract',shell); fixture.detectChanges();
    history.replaceState(null,'','/customers'); fixture.componentRef.setInput('shellContract',{...shell}); fixture.detectChanges();
    expect(navigate).toHaveBeenLastCalledWith('/customers',{skipLocationChange:true});
    history.replaceState(null,'','/products'); fixture.componentRef.setInput('shellContract',{...shell}); fixture.detectChanges();
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});

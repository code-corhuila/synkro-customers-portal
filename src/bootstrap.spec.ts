import { describe, it, expect, vi } from 'vitest';
import { registerPortal } from './bootstrap';
import type { ShellContract } from './app/shell-contract';
describe('CLI-UI-01/12/13 real custom element',()=>{
  it('registers once, supports late input, tears down and reenters with a fresh router',async()=>{
    await registerPortal(); const definition=customElements.get('synkro-customers-portal'); expect(definition).toBeDefined();
    await registerPortal(); expect(customElements.get('synkro-customers-portal')).toBe(definition);
    history.replaceState(null,'','/customers');
    let element=document.createElement('synkro-customers-portal') as HTMLElement & {shellContract:ShellContract};
    document.body.append(element);
    await vi.waitFor(()=>expect(element.textContent).toContain('Esperando'));
    const request=vi.fn().mockResolvedValue({data:[],meta:{page:1,limit:20,total:0,totalPages:0}});
    const shell:ShellContract={contractVersion:1,basePath:'/customers',api:{request},session:{user:()=>({sub:'person',role:'ADMIN'})},navigate:vi.fn()};
    element.shellContract=shell;
    await vi.waitFor(()=>expect(element.textContent).toContain('No hay clientes'));
    expect(request).toHaveBeenCalledTimes(1); element.remove();
    history.replaceState(null,'','/customers/new');
    element=document.createElement('synkro-customers-portal') as typeof element;
    element.shellContract=shell; document.body.append(element);
    await vi.waitFor(()=>expect(element.querySelector('customer-form')).not.toBeNull());
    expect(request).toHaveBeenCalledTimes(1);
    history.replaceState(null,'','/customers'); element.shellContract={...shell};
    await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(2)); element.remove();
  });
  it('shows an owned unknown route without requests, and focuses the heading on a new screen',async()=>{
    await registerPortal();history.replaceState(null,'','/customers/unknown/inner/path');
    const request=vi.fn();const shell:ShellContract={contractVersion:1,basePath:'/customers',api:{request},session:{user:()=>({sub:'person',role:'ADMIN'})},navigate:vi.fn()};
    const element=document.createElement('synkro-customers-portal') as HTMLElement & {shellContract:ShellContract};element.shellContract=shell;document.body.append(element);
    await vi.waitFor(()=>expect(element.textContent).toContain('Página no encontrada'));expect(request).not.toHaveBeenCalled();
    history.replaceState(null,'','/customers/new');element.shellContract={...shell};
    await vi.waitFor(()=>expect(element.querySelector('customer-form')).not.toBeNull());
    expect(document.activeElement).toBe(element.querySelector('h1'));element.remove();
  });
});

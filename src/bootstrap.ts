import { createComponent, provideZonelessChangeDetection, type ApplicationRef, type ComponentRef } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { createCustomElement, type NgElementStrategy, type NgElementStrategyEvent } from '@angular/elements';
import { Subject } from 'rxjs';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Public Angular Elements strategy API. A full application injector per mount
// keeps Router's root-scoped transition services fresh after teardown/reentry.
// A child injector alone would reuse those services from a disposed Router.
class PortalStrategy implements NgElementStrategy {
  events = new Subject<NgElementStrategyEvent>();
  private inputs = new Map<string,unknown>();
  private application?:ApplicationRef;
  private component?:ComponentRef<AppComponent>;
  private generation=0;
  connect(element:HTMLElement) {
    const generation=++this.generation;
    void createApplication(appConfig).then(app=>{
      if (generation !== this.generation) {app.destroy(); return;}
      this.application=app;
      this.component=createComponent(AppComponent,{environmentInjector:app.injector,hostElement:element});
      app.attachView(this.component.hostView);
      for (const [key,value] of this.inputs) this.component.setInput(key,value);
      this.component.changeDetectorRef.detectChanges();
    }).catch(()=>{if (generation === this.generation) {this.events.next({name:'portal-error',value:'No se pudo iniciar Clientes.'}); this.disconnect();}});
  }
  disconnect() {
    this.generation++;
    this.component?.destroy(); this.component=undefined;
    this.application?.destroy(); this.application=undefined;
  }
  getInputValue(name:string):unknown {return this.inputs.get(name);}
  setInputValue(name:string,value:unknown) {this.inputs.set(name,value); this.component?.setInput(name,value);}
}
let registration:Promise<void>|undefined;
export function registerPortal():Promise<void> {
  if (customElements.get('synkro-customers-portal')) return Promise.resolve();
  return registration ??= createApplication({providers:[provideZonelessChangeDetection()]}).then(app=>{
    customElements.define('synkro-customers-portal',createCustomElement(AppComponent,{
      injector:app.injector, strategyFactory:{create:()=>new PortalStrategy()}
    }));
  });
}

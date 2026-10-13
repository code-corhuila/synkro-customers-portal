import { provideZonelessChangeDetection, type ApplicationConfig } from '@angular/core';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import es from '@angular/common/locales/es';
import { CustomersApiService } from './customers/data/customers-api.service';
import { routes } from './customers/customers.routes';
registerLocaleData(es);
export const appConfig:ApplicationConfig={providers:[provideZonelessChangeDetection(),provideRouter(routes,withDisabledInitialNavigation()),CustomersApiService]};

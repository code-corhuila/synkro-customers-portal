import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../../app.config';
import { CustomersPageComponent } from './customers-page.component';
import { CustomersApiService } from '../data/customers-api.service';
import type { ShellContract } from '../../shell-contract';
import type { Customer } from '../model/customer';

// HU-CLI-05 — complete contacts, bounded search and ADMIN reactivation. Synthetic data only.
const customer: Customer = { customerId: 'a', name: 'Ana', identityDocument: 'DOC', email: 'ana@example.test', phone: '3001234567', address: 'Calle 1 # 2-3', registrationDate: '2026-10-12T15:00:00Z', active: true };
const inactive: Customer = { ...customer, customerId: 'b', name: 'Beatriz', identityDocument: 'DOC-B', active: false };
const page = (rows: Customer[] = [customer]) => ({ data: rows, meta: { page: 1, limit: 20, total: rows.length, totalPages: rows.length ? 1 : 0 } });
const suggestion = (n: number, extra: object = {}) => ({ customerId: `s${n}`, name: `Cliente ${n}`, identityDocument: `DOC-${n}`, active: true, match: 'NAME', ...extra });
const found = (rows: object[], hasMore = false) => ({ data: rows, meta: { limit: 5, hasMore } });

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); }) });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); }) });
});
async function settle(f: ComponentFixture<CustomersPageComponent>) {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await f.whenStable(); f.detectChanges();
}
async function setup(mode: string, request: ReturnType<typeof vi.fn>, role: 'ADMIN' | 'SALESPERSON' = 'ADMIN') {
  TestBed.configureTestingModule({ imports: [CustomersPageComponent], providers: [CustomersApiService,
    { provide: ActivatedRoute, useValue: { data: new BehaviorSubject({ mode }), paramMap: new BehaviorSubject(convertToParamMap({ id: 'a' })) } }] });
  const shell: ShellContract = { contractVersion: 1, basePath: '/customers', api: { request: request as unknown as ShellContract['api']['request'] }, session: { user: () => ({ sub: 'person', role }) }, navigate: vi.fn() };
  TestBed.inject(CustomersApiService).setContract(shell);
  const fixture = TestBed.createComponent(CustomersPageComponent); fixture.detectChanges(); await settle(fixture);
  return { fixture, shell, request, el: fixture.nativeElement as HTMLElement };
}
async function input(f: ComponentFixture<CustomersPageComponent>, name: string, value: string) {
  const el = f.nativeElement.querySelector(`[name="${name}"]`) as HTMLInputElement;
  expect(el, `input ${name}`).not.toBeNull(); el.value = value;
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); f.detectChanges(); await settle(f);
}
async function click(f: ComponentFixture<CustomersPageComponent>, text: string) {
  const button = [...f.nativeElement.querySelectorAll('button')].find((b: unknown) => (b as HTMLElement).textContent?.trim() === text) as HTMLButtonElement;
  expect(button, `button ${text}`).toBeDefined(); button.click(); f.detectChanges(); await settle(f);
}
const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll('button')).map(b => b.textContent?.trim());
async function fillCustomer(f: ComponentFixture<CustomersPageComponent>, overrides: Record<string, string> = {}) {
  const values = { name: 'Ana', identityDocument: 'DOC', email: 'ana@example.test', phone: '3001234567', address: 'Calle 1 # 2-3', ...overrides };
  for (const [name, value] of Object.entries(values)) await input(f, name, value);
}
async function search(f: ComponentFixture<CustomersPageComponent>, text: string) { await input(f, 'query', text); await click(f, 'Buscar cliente'); }

describe('HU-CLI-05 mandatory contacts in the form', () => {
  it('marks email, phone and address as required and helps with the phone format', async () => {
    const { el } = await setup('new', vi.fn());
    for (const key of ['email', 'phone', 'address']) expect(el.querySelector(`label[for="customer-${key}"]`)?.textContent).toContain('*');
    const phone = el.querySelector('[name="phone"]')!;
    expect(phone.getAttribute('inputmode')).toBe('numeric'); expect(phone.getAttribute('maxlength')).toBe('10'); expect(phone.getAttribute('autocomplete')).toBe('tel-national');
    expect(el.querySelector('[name="email"]')!.getAttribute('autocomplete')).toBe('email');
    expect(phone.getAttribute('aria-describedby')).toContain('hint-phone');
    expect(el.querySelector('#hint-phone')?.textContent).toContain('10 dígitos');
  });

  it('blocks missing or blank contacts, names each field, focuses the first one and sends nothing', async () => {
    const request = vi.fn();
    const { fixture, el } = await setup('new', request);
    await fillCustomer(fixture, { email: '', phone: '', address: '   ' });
    await click(fixture, 'Registrar cliente');
    expect(request).not.toHaveBeenCalled();
    for (const key of ['email', 'phone', 'address']) {
      expect(el.querySelector(`#error-${key}`)?.textContent, key).toContain('obligatorio');
      expect(el.querySelector(`[name="${key}"]`)?.getAttribute('aria-invalid'), key).toBe('true');
    }
    expect(document.activeElement?.getAttribute('name')).toBe('email');
  });

  it('rejects an invalid e-mail and phone with specific messages and clears an error once the field is fixed', async () => {
    const request = vi.fn();
    const { fixture, el } = await setup('new', request);
    await fillCustomer(fixture, { email: 'sin-arroba', phone: '300 123' });
    await click(fixture, 'Registrar cliente');
    expect(request).not.toHaveBeenCalled();
    expect(el.querySelector('#error-email')?.textContent).toContain('correo válido');
    expect(el.querySelector('#error-phone')?.textContent).toContain('exactamente 10 dígitos');
    await input(fixture, 'phone', '3009998877');
    expect(el.querySelector('#error-phone')?.textContent?.trim()).toBe('');
    expect(el.querySelector('#error-email')?.textContent).toContain('correo válido');
  });

  it('sends the contacts as typed (leading zero kept, address untouched) with one idempotency key', async () => {
    const request = vi.fn().mockResolvedValue(customer);
    const { fixture, shell } = await setup('new', request);
    await fillCustomer(fixture, { phone: '0123456789', address: '  Carrera 7 # 45-10  ' });
    await click(fixture, 'Registrar cliente');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][2].body).toEqual({ name: 'Ana', identityDocument: 'DOC', email: 'ana@example.test', phone: '0123456789', address: '  Carrera 7 # 45-10  ' });
    expect(typeof request.mock.calls[0][2].idempotencyKey).toBe('string');
    expect(shell.navigate).toHaveBeenCalledWith('/customers/a');
  });

  it('maps the field details of a server 400 to each field without losing the typed values', async () => {
    const request = vi.fn().mockRejectedValue({ status: 400, body: { traceId: 'trace-400', details: [
      { field: 'email', message: 'invalid_format' }, { field: 'phone', message: 'invalid_format' }, { field: 'address', message: 'required' }] } });
    const { fixture, el } = await setup('new', request);
    await fillCustomer(fixture); await click(fixture, 'Registrar cliente');
    expect(request).toHaveBeenCalledTimes(1);
    expect(el.querySelector('#error-email')?.textContent).toContain('correo válido');
    expect(el.querySelector('#error-phone')?.textContent).toContain('10 dígitos');
    expect(el.querySelector('#error-address')?.textContent).toContain('obligatorio');
    expect((el.querySelector('[name="phone"]') as HTMLInputElement).value).toBe('3001234567');
    expect(el.textContent).toContain('trace-400');
  });

  it('shows a historical customer with missing contacts as empty fields and requires completing them before saving', async () => {
    const legacy = { ...customer, email: null, phone: null, address: null };
    const request = vi.fn().mockResolvedValueOnce(legacy).mockResolvedValue(customer);
    const { fixture, el } = await setup('edit', request);
    expect((el.querySelector('[name="email"]') as HTMLInputElement).value).toBe('');
    expect(el.textContent).toContain('antes de que los contactos fueran obligatorios');
    await click(fixture, 'Guardar cambios');
    expect(request).toHaveBeenCalledTimes(1);   // only the initial read
    expect(el.querySelector('#error-phone')?.textContent).toContain('obligatorio');
    await fillCustomer(fixture, { name: 'Ana', identityDocument: 'DOC' });
    await click(fixture, 'Guardar cambios');
    expect(request.mock.calls[1].slice(0, 2)).toEqual(['PUT', '/api/v1/customers/a']);
    expect(request.mock.calls[1][2].body).toMatchObject({ email: 'ana@example.test', phone: '3001234567', address: 'Calle 1 # 2-3' });
  });

  it('does not show the legacy notice for a complete customer', async () => {
    const { el } = await setup('edit', vi.fn().mockResolvedValue(customer));
    expect(el.textContent).not.toContain('antes de que los contactos fueran obligatorios');
  });
});

describe('HU-CLI-05 bounded search', () => {
  const list = () => vi.fn().mockResolvedValueOnce(page());

  it('validates the length client-side (2-100 after trimming) and does not call the API', async () => {
    const request = list(); const { fixture, el } = await setup('list', request);
    await search(fixture, ' a ');
    expect(request).toHaveBeenCalledTimes(1);
    expect(el.querySelector('#error-query')?.textContent).toContain('al menos 2 caracteres');
    await search(fixture, 'x'.repeat(101));
    expect(request).toHaveBeenCalledTimes(1);
    expect(el.querySelector('#error-query')?.textContent).toContain('100 caracteres');
    expect(el.querySelector('[name="query"]')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('sends the trimmed text in the POST body with status ACTIVE, never in the URL', async () => {
    const request = list().mockResolvedValue(found([suggestion(1)]));
    const { fixture } = await setup('list', request);
    await search(fixture, '  ana pérez  ');
    const [method, path, options] = request.mock.lastCall!;
    expect([method, path]).toEqual(['POST', '/api/v1/customers/search']);
    expect(options.body).toEqual({ query: 'ana pérez', status: 'ACTIVE' });
    expect(options.query).toBeUndefined(); expect(path).not.toContain('ana');
  });

  it('lists at most the returned suggestions with the match type, no contacts, and warns when there are more', async () => {
    const rows = [suggestion(1, { match: 'DOCUMENT_EXACT' }), suggestion(2, { match: 'DOCUMENT_PREFIX' }), suggestion(3), suggestion(4), suggestion(5)];
    const { fixture, el } = await setup('list', list().mockResolvedValue(found(rows, true)));
    await search(fixture, 'cliente');
    const section = el.querySelector('[aria-label="Resultados de la búsqueda"]') as HTMLElement;
    expect(section.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(section.querySelector('tbody tr')?.textContent).toContain('Documento exacto');
    expect(section.textContent).toContain('Hay más de 5 coincidencias');
    expect(section.textContent).not.toContain('example.test');
    expect(section.querySelector('[role="status"]')?.textContent).toContain('5');
  });

  it('shows a dedicated empty state', async () => {
    const { fixture, el } = await setup('list', list().mockResolvedValue(found([])));
    await search(fixture, 'nadie');
    expect(el.textContent).toContain('No hay coincidencias para esa búsqueda');
  });

  it('shows loading, a retryable error with its trace, and recovers', async () => {
    let reject!: (e: unknown) => void;
    const request = list().mockImplementationOnce(() => new Promise((_, r) => reject = r)).mockResolvedValue(found([suggestion(1)]));
    const { fixture, el } = await setup('list', request);
    await input(fixture, 'query', 'cliente'); await click(fixture, 'Buscar cliente');
    expect(el.textContent).toContain('Buscando');
    reject({ status: 500, body: { traceId: 'trace-search' } }); await settle(fixture);
    expect(el.querySelector('#search-error')?.textContent).toContain('trace-search');
    await click(fixture, 'Reintentar búsqueda');
    expect(el.textContent).toContain('Cliente 1'); expect(el.querySelector('#search-error')).toBeNull();
  });

  it('ignores a late response of a previous search', async () => {
    let late!: (v: unknown) => void;
    const request = list().mockImplementationOnce(() => new Promise(r => late = r)).mockResolvedValue(found([suggestion(2, { name: 'Resultado nuevo' })]));
    const { fixture, el } = await setup('list', request);
    await search(fixture, 'primero');
    const signal = request.mock.calls[1][2].signal;
    await search(fixture, 'segundo');
    late(found([suggestion(9, { name: 'Resultado viejo' })])); await settle(fixture);
    expect(signal.aborted).toBe(true);
    expect(el.textContent).toContain('Resultado nuevo'); expect(el.textContent).not.toContain('Resultado viejo');
  });

  it('lets a salesperson search only active customers', async () => {
    const request = list().mockResolvedValue(found([suggestion(1)]));
    const { fixture, el } = await setup('list', request, 'SALESPERSON');
    expect(el.querySelector('[name="searchStatus"]')).toBeNull();
    await search(fixture, 'cliente');
    expect(request.mock.lastCall![2].body.status).toBe('ACTIVE');
  });

  it('lets an administrator also search inactive customers', async () => {
    const request = list().mockResolvedValue(found([suggestion(1, { active: false })]));
    const { fixture, el } = await setup('list', request);
    expect(el.querySelector('[name="searchStatus"]')).not.toBeNull();
    await input(fixture, 'searchStatus', 'INACTIVE'); await search(fixture, 'cliente');
    expect(request.mock.lastCall![2].body.status).toBe('INACTIVE');
    expect(el.textContent).toContain('Inactivo');
  });
});

describe('HU-CLI-05 ADMIN reactivation', () => {
  it('offers Reactivar on inactive rows only to an administrator', async () => {
    const admin = await setup('list', vi.fn().mockResolvedValue(page([customer, inactive])));
    expect(buttons(admin.el).filter(b => b === 'Reactivar')).toHaveLength(1);
    TestBed.resetTestingModule();
    const seller = await setup('list', vi.fn().mockResolvedValue(page([customer, inactive])), 'SALESPERSON');
    expect(buttons(seller.el)).not.toContain('Reactivar');
    expect(seller.el.textContent).toContain('Solo un administrador puede reactivar');
  });

  it('asks for confirmation, then posts the transition and shows the customer as active again', async () => {
    const request = vi.fn().mockResolvedValueOnce(page([inactive])).mockResolvedValue({ ...inactive, active: true });
    const { fixture, el } = await setup('list', request);
    await click(fixture, 'Reactivar');
    expect(el.querySelector('dialog[aria-labelledby="reactivate-title"]')?.hasAttribute('open')).toBe(true);
    expect(el.querySelector('#reactivate-title')?.textContent).toContain('Reactivar cliente');
    expect(request).toHaveBeenCalledTimes(1);
    await click(fixture, 'Cancelar reactivación'); expect(request).toHaveBeenCalledTimes(1);
    await click(fixture, 'Reactivar'); await click(fixture, 'Confirmar reactivación');
    const [method, path, options] = request.mock.calls[1];
    expect([method, path]).toEqual(['POST', '/api/v1/customers/b/activate']);
    expect(options.body).toBeUndefined(); expect(options.idempotencyKey).toBeUndefined();
    expect(el.querySelector('tbody')?.textContent).toContain('Activo');
    expect(el.textContent).toContain('Cliente reactivado');
    expect(buttons(el)).not.toContain('Reactivar'); expect(buttons(el)).toContain('Desactivar');
  });

  it('locks the confirmation while the request is pending so it is sent once', async () => {
    let done!: (v: unknown) => void;
    const request = vi.fn().mockResolvedValueOnce(page([inactive])).mockImplementationOnce(() => new Promise(r => done = r));
    const { fixture, el } = await setup('list', request);
    await click(fixture, 'Reactivar'); await click(fixture, 'Confirmar reactivación');
    const confirm = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Reactivando')) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    confirm.click(); await settle(fixture);
    expect(request).toHaveBeenCalledTimes(2);
    done({ ...inactive, active: true }); await settle(fixture);
    expect(el.querySelector('tbody')?.textContent).toContain('Activo');
  });

  it('keeps the customer inactive and explains a denied or missing transition', async () => {
    for (const [status, text] of [[403, 'No tienes permiso'], [404, 'no encontrado']] as const) {
      TestBed.resetTestingModule();
      const request = vi.fn().mockResolvedValueOnce(page([inactive])).mockRejectedValue({ status, body: { traceId: `trace-${status}` } });
      const { fixture, el } = await setup('list', request);
      await click(fixture, 'Reactivar'); await click(fixture, 'Confirmar reactivación');
      const dialog = el.querySelector('dialog[aria-labelledby="reactivate-title"]')!;
      expect(dialog.textContent, String(status)).toContain(text); expect(dialog.textContent).toContain(`trace-${status}`);
      expect(el.querySelector('tbody')?.textContent).toContain('Inactivo');
    }
  });

  it('allows a safe retry after an uncertain failure because the transition is idempotent', async () => {
    const request = vi.fn().mockResolvedValueOnce(page([inactive])).mockRejectedValueOnce({ status: 0, body: { traceId: 'lost' } }).mockResolvedValue({ ...inactive, active: true });
    const { fixture, el } = await setup('list', request);
    await click(fixture, 'Reactivar'); await click(fixture, 'Confirmar reactivación');
    expect(el.querySelector('dialog[aria-labelledby="reactivate-title"]')?.textContent).toContain('Puedes reintentar');
    await click(fixture, 'Confirmar reactivación');
    expect(request.mock.calls[2].slice(0, 2)).toEqual(['POST', '/api/v1/customers/b/activate']);
    expect(el.textContent).toContain('Cliente reactivado');
  });

  it('reactivates from the inactive search results and removes the customer from them', async () => {
    const request = vi.fn().mockResolvedValueOnce(page())
      .mockResolvedValueOnce(found([suggestion(7, { active: false, name: 'Cliente siete' })])).mockResolvedValue({ ...inactive, customerId: 's7', active: true });
    const { fixture, el } = await setup('list', request);
    await input(fixture, 'searchStatus', 'INACTIVE'); await search(fixture, 'siete');
    await click(fixture, 'Reactivar'); await click(fixture, 'Confirmar reactivación');
    expect(request.mock.lastCall!.slice(0, 2)).toEqual(['POST', '/api/v1/customers/s7/activate']);
    expect(el.querySelector('[aria-label="Resultados de la búsqueda"]')?.textContent).not.toContain('Cliente siete');
    expect(el.textContent).toContain('Cliente reactivado');
  });

  it('never offers reactivation to a salesperson in the search results', async () => {
    const request = vi.fn().mockResolvedValueOnce(page()).mockResolvedValue(found([suggestion(1)]));
    const { fixture, el } = await setup('list', request, 'SALESPERSON');
    await search(fixture, 'cliente');
    expect(buttons(el)).not.toContain('Reactivar');
  });
});

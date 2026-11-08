import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomersApiService } from './customers-api.service';
import type { ShellContract } from '../../shell-contract';
import { blankCustomer } from '../model/customer';
describe('CLI-UI-11/13 Host adapter', () => {
  let service: CustomersApiService;
  let shell: ShellContract;
  beforeEach(() => {
    TestBed.configureTestingModule({providers: [CustomersApiService]});
    service = TestBed.inject(CustomersApiService);
    shell = {contractVersion: 1, basePath: '/customers', api: {request: vi.fn().mockResolvedValue({active: true})}, session: {user: () => ({sub:'person',role:'ADMIN'})}, navigate: vi.fn()};
    service.setContract(shell);
  });
  it('forwards relative list query and caller cancellation through the only Host client', async () => {
    const query = {page:'1',limit:'20',active:'false',identityDocument:'DOC'};
    await service.list(query);
    expect(shell.api.request).toHaveBeenCalledWith('GET','/api/v1/customers',expect.objectContaining({query, signal:expect.any(AbortSignal)}));
    const signal = vi.mocked(shell.api.request).mock.calls[0][2]!.signal!;
    expect(signal.aborted).toBe(false);
    vi.mocked(shell.api.request).mockImplementation(()=>new Promise(()=>{}));
    void service.list(query);
    const pendingSignal = vi.mocked(shell.api.request).mock.calls[1][2]!.signal!;
    service.cancel();
    expect(pendingSignal.aborted).toBe(true);
  });
  it('uses exact CRUD methods, complete replacement and explicit idempotency key', async () => {
    const body = {...blankCustomer(),name:'Cliente',identityDocument:'123',email:'c@example.test',phone:'3001234567',address:'Calle 1'};
    await service.get('id'); await service.create(body,'stable-key'); await service.update('id',body); await service.deactivate('id');
    expect(vi.mocked(shell.api.request).mock.calls.map(c=>c.slice(0,2))).toEqual([
      ['GET','/api/v1/customers/id'], ['POST','/api/v1/customers'], ['PUT','/api/v1/customers/id'], ['DELETE','/api/v1/customers/id']
    ]);
    expect(vi.mocked(shell.api.request).mock.calls[1][2]).toMatchObject({body,idempotencyKey:'stable-key'});
    expect(vi.mocked(shell.api.request).mock.calls[2][2]).toMatchObject({body});
  });
  it('HU-CLI-05: sends the search text in the POST body, never in the URL or query string', async () => {
    await service.search({query: 'ana pérez', status: 'ACTIVE'});
    const [method, path, options] = vi.mocked(shell.api.request).mock.calls[0];
    expect([method, path]).toEqual(['POST', '/api/v1/customers/search']);
    expect(options).toMatchObject({body: {query: 'ana pérez', status: 'ACTIVE'}, signal: expect.any(AbortSignal)});
    expect(options!.query).toBeUndefined();
    expect(options!.idempotencyKey).toBeUndefined();   // a read-only operation
    expect(path).not.toContain('ana');
  });
  it('HU-CLI-05: a new search aborts the previous one, and cancel() aborts the pending search', async () => {
    vi.mocked(shell.api.request).mockImplementation(() => new Promise(() => {}));
    void service.search({query: 'an', status: 'ACTIVE'});
    const first = vi.mocked(shell.api.request).mock.calls[0][2]!.signal!;
    void service.search({query: 'ana', status: 'ACTIVE'});
    const second = vi.mocked(shell.api.request).mock.calls[1][2]!.signal!;
    expect(first.aborted).toBe(true); expect(second.aborted).toBe(false);
    service.cancel(); expect(second.aborted).toBe(true);
  });
  it('HU-CLI-05: reactivation is an explicit POST transition without body or idempotency key', async () => {
    await service.activate('a/b id');
    const [method, path, options] = vi.mocked(shell.api.request).mock.calls[0];
    expect([method, path]).toEqual(['POST', '/api/v1/customers/a%2Fb%20id/activate']);
    expect(options!.body).toBeUndefined(); expect(options!.idempotencyKey).toBeUndefined();
  });
  it('HU-CLI-05: only a human ADMIN session can reactivate', () => {
    for (const [role, allowed] of [['ADMIN', true], ['SALESPERSON', false], ['INVENTORY', false]] as const) {
      service.setContract({...shell, session: {user: () => ({sub: 'person', role})}});
      expect(service.canReactivate(), role).toBe(allowed);
    }
    service.setContract({...shell, session: {user: () => null}});
    expect(service.canReactivate()).toBe(false);
  });
  it('retains Host status/body, never retries 403 and permits cancellation of pending writes', async () => {
    const error = {status:403,body:{message:'denied',traceId:'trace'}};
    vi.mocked(shell.api.request).mockRejectedValue(error);
    await expect(service.get('id')).rejects.toBe(error);
    expect(shell.api.request).toHaveBeenCalledTimes(1);
    vi.mocked(shell.api.request).mockImplementation(()=>new Promise(()=>{}));
    void service.create(blankCustomer(),'pending-key');
    const signal = vi.mocked(shell.api.request).mock.calls[1][2]!.signal!;
    service.cancel(); expect(signal.aborted).toBe(true);
  });
});

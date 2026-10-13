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
    const body = {...blankCustomer(),name:'Cliente',identityDocument:'123'};
    await service.get('id'); await service.create(body,'stable-key'); await service.update('id',body); await service.deactivate('id');
    expect(vi.mocked(shell.api.request).mock.calls.map(c=>c.slice(0,2))).toEqual([
      ['GET','/api/v1/customers/id'], ['POST','/api/v1/customers'], ['PUT','/api/v1/customers/id'], ['DELETE','/api/v1/customers/id']
    ]);
    expect(vi.mocked(shell.api.request).mock.calls[1][2]).toMatchObject({body,idempotencyKey:'stable-key'});
    expect(vi.mocked(shell.api.request).mock.calls[2][2]).toMatchObject({body});
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

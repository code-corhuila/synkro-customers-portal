import { Injectable } from '@angular/core';
import type { ShellContract } from '../../shell-contract';
import type { Customer, CustomerRequest, Page } from '../model/customer';
@Injectable()
export class CustomersApiService {
  contract?: ShellContract;
  private pending = new Set<AbortController>();
  setContract(contract: ShellContract) { this.contract = contract; }
  list(query: Record<string, string>) { return this.request<Page<Customer>>('GET', '', {query}); }
  get(id: string) { return this.request<Customer>('GET', `/${encodeURIComponent(id)}`); }
  create(body: CustomerRequest, key: string) { return this.request<Customer>('POST', '', {body, idempotencyKey:key}); }
  update(id: string, body: CustomerRequest) { return this.request<Customer>('PUT', `/${encodeURIComponent(id)}`, {body}); }
  deactivate(id: string) { return this.request<Customer>('DELETE', `/${encodeURIComponent(id)}`); }
  cancel() { for (const controller of this.pending) controller.abort(); this.pending.clear(); }
  go(path: string) { this.contract?.navigate(path); }
  private request<T>(method: Parameters<ShellContract['api']['request']>[0], suffix: string,
    options: Parameters<ShellContract['api']['request']>[2] = {}): Promise<T> {
    if (!this.contract) return Promise.reject(new Error('ShellContract is unavailable'));
    const controller = new AbortController();
    this.pending.add(controller);
    return this.contract.api.request<T>(method, `/api/v1/customers${suffix}`, {...options, signal:controller.signal})
      .finally(()=>this.pending.delete(controller));
  }
}

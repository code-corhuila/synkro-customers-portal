import { Injectable } from '@angular/core';
import type { ShellContract } from '../../shell-contract';
import type { Customer, CustomerRequest, Page, SearchRequest, SearchResponse } from '../model/customer';
@Injectable()
export class CustomersApiService {
  contract?: ShellContract;
  private pending = new Set<AbortController>();
  private latestSearch?: AbortController;
  setContract(contract: ShellContract) { this.contract = contract; }
  list(query: Record<string, string>) { return this.request<Page<Customer>>('GET', '', {query}); }
  get(id: string) { return this.request<Customer>('GET', `/${encodeURIComponent(id)}`); }
  create(body: CustomerRequest, key: string) { return this.request<Customer>('POST', '', {body, idempotencyKey:key}); }
  update(id: string, body: CustomerRequest) { return this.request<Customer>('PUT', `/${encodeURIComponent(id)}`, {body}); }
  deactivate(id: string) { return this.request<Customer>('DELETE', `/${encodeURIComponent(id)}`); }
  /** Name/document text travels in the POST body, never in the URL. A new search aborts the previous one. */
  search(body: SearchRequest) {
    this.latestSearch?.abort();
    const controller = new AbortController();
    this.latestSearch = controller;
    return this.request<SearchResponse>('POST', '/search', {body}, controller, false)
      .finally(() => {if (this.latestSearch === controller) this.latestSearch = undefined;});
  }
  /** State transition (not a PUT): explicit ADMIN-only, idempotent, no body and no Idempotency-Key. */
  activate(id: string) { return this.request<Customer>('POST', `/${encodeURIComponent(id)}/activate`); }
  /** The API enforces this too; the portal only decides whether to offer the control. */
  canReactivate() { return this.contract?.session.user()?.role === 'ADMIN'; }
  /** Aborts the reads and writes of the current view; a search in progress is independent and is left alone. */
  cancelPending() { for (const controller of this.pending) controller.abort(); this.pending.clear(); }
  /** Aborts everything, including the search in progress (view teardown). */
  cancel() { this.cancelPending(); this.latestSearch?.abort(); this.latestSearch = undefined; }
  go(path: string) { this.contract?.navigate(path); }
  private request<T>(method: Parameters<ShellContract['api']['request']>[0], suffix: string,
    options: Parameters<ShellContract['api']['request']>[2] = {}, owned = new AbortController(), track = true): Promise<T> {
    if (!this.contract) return Promise.reject(new Error('ShellContract is unavailable'));
    if (track) this.pending.add(owned);
    return this.contract.api.request<T>(method, `/api/v1/customers${suffix}`, {...options, signal:owned.signal})
      .finally(()=>this.pending.delete(owned));
  }
}

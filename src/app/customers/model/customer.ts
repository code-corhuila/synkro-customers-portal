/** Body of POST (create) and PUT (complete replacement). Since HU-CLI-05 email, phone and address are mandatory. */
export interface CustomerRequest {
  name: string;
  identityDocument: string;
  email: string;
  phone: string;
  address: string;
}
/** Server representation. Historical customers (registered before HU-CLI-05) may still have missing contacts. */
export interface Customer {
  customerId: string;
  name: string;
  identityDocument: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  registrationDate: string;
  active: boolean;
}
export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
export type FieldErrors = Partial<Record<keyof CustomerRequest, string>>;
export const blankCustomer = (): CustomerRequest => ({ name: '', identityDocument: '', email: '', phone: '', address: '' });
/** A form model from a stored customer; a missing historical contact becomes an empty field to be completed. */
export const toRequest = (c: Customer): CustomerRequest => ({
  name: c.name, identityDocument: c.identityDocument, email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? ''
});
export const hasMissingContacts = (c: Customer) => !c.email || !c.phone || !c.address;

/** POST /api/v1/customers/search (HU-CLI-05 contract proposal): bounded, body-carried, name/document search. */
export type SearchStatus = 'ACTIVE' | 'INACTIVE';
export type SearchMatch = 'DOCUMENT_EXACT' | 'DOCUMENT_PREFIX' | 'NAME';
export interface SearchRequest { query: string; status: SearchStatus }
export interface Suggestion { customerId: string; name: string; identityDocument: string; active: boolean; match: SearchMatch }
export interface SearchResponse { data: Suggestion[]; meta: { limit: number; hasMore: boolean } }
export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;

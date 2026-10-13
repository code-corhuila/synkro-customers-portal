export interface CustomerRequest {
  name: string;
  identityDocument: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}
export interface Customer extends CustomerRequest {
  customerId: string;
  registrationDate: string;
  active: boolean;
}
export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
export type FieldErrors = Partial<Record<keyof CustomerRequest, string>>;
export const blankCustomer = (): CustomerRequest => ({ name: '', identityDocument: '', email: null, phone: null, address: null });

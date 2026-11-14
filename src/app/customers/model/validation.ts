import type { CustomerRequest, FieldErrors } from './customer';

// Client-side checks mirror the API rules of HU-CLI-05 so the user sees the problem next to the field before any
// request is sent. The server stays the authority: its field details are mapped in errors.ts.
export const MESSAGES = {
  required: 'Este campo es obligatorio.',
  email: 'Escribe un correo válido, por ejemplo nombre@dominio.com.',
  phone: 'El teléfono debe tener exactamente 10 dígitos, sin espacios ni símbolos.',
  long: 'Supera la longitud permitida.'
} as const;

const LIMITS = { name: 150, identityDocument: 30, email: 255, address: 255 } as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9]{10}$/;
// Blank = only whitespace and invisible separators (zero-width space/joiners, word joiner, BOM).
const BLANK = /^[\s​-‏⁠﻿]*$/;

/** Accidental whitespace around an e-mail or a phone is dropped; name, document and address are sent as typed. */
export function normalizeCustomer(value: CustomerRequest): CustomerRequest {
  return { ...value, email: value.email.trim(), phone: value.phone.trim() };
}

export function validateCustomer(raw: CustomerRequest): FieldErrors {
  const value = normalizeCustomer(raw);
  const errors: FieldErrors = {};
  for (const key of ['name', 'identityDocument', 'email', 'phone', 'address'] as const) {
    const text = value[key];
    if (BLANK.test(text)) errors[key] = MESSAGES.required;
    else if (key === 'phone') { if (!PHONE.test(text)) errors.phone = MESSAGES.phone; }
    else if ([...text].length > LIMITS[key]) errors[key] = MESSAGES.long;
    else if (key === 'email' && !EMAIL.test(text)) errors.email = MESSAGES.email;
  }
  return errors;
}

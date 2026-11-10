import { describe, it, expect } from 'vitest';
import { validateCustomer, normalizeCustomer } from './validation';
import type { CustomerRequest } from './customer';

const valid: CustomerRequest = { name: 'Ana', identityDocument: '1000000001', email: 'ana@example.test', phone: '3001234567', address: 'Calle 1 # 2-3' };

describe('HU-CLI-05 customer validation (mirrors the API rules)', () => {
  it('accepts a complete customer', () => {
    expect(validateCustomer(valid)).toEqual({});
  });

  it('requires email, phone and address; blank and whitespace-only values count as missing', () => {
    for (const key of ['email', 'phone', 'address'] as const) {
      for (const empty of ['', '   ', '  ', '\t\n']) {
        expect(validateCustomer({ ...valid, [key]: empty })[key], `${key}="${JSON.stringify(empty)}"`).toBe('Este campo es obligatorio.');
      }
    }
  });

  it('rejects zero-width-only addresses', () => {
    expect(validateCustomer({ ...valid, address: '​​' }).address).toBe('Este campo es obligatorio.');
  });

  it('accepts only ten ASCII digits as phone and keeps leading zeros', () => {
    expect(validateCustomer({ ...valid, phone: '0123456789' })).toEqual({});
    for (const phone of ['123456789', '12345678901', '300123456a', '+573001234567', '300 123 4567', '300-123-4567', '3001234567.0', '٣٠٠١٢٣٤٥٦٧']) {
      expect(validateCustomer({ ...valid, phone }).phone, phone).toBe('El teléfono debe tener exactamente 10 dígitos, sin espacios ni símbolos.');
    }
  });

  it('validates the email format and length', () => {
    for (const email of ['plain', 'a@b', 'a b@example.test', 'a@@example.test', '@example.test', 'a@.test', 'a@example.']) {
      expect(validateCustomer({ ...valid, email }).email, email).toBe('Escribe un correo válido, por ejemplo nombre@dominio.com.');
    }
    expect(validateCustomer({ ...valid, email: `${'x'.repeat(251)}@e.co` }).email).toBe('Supera la longitud permitida.');
  });

  it('keeps the existing name, document and address limits', () => {
    expect(validateCustomer({ ...valid, name: 'n'.repeat(151) }).name).toBe('Supera la longitud permitida.');
    expect(validateCustomer({ ...valid, identityDocument: 'd'.repeat(31) }).identityDocument).toBe('Supera la longitud permitida.');
    expect(validateCustomer({ ...valid, address: 'a'.repeat(256) }).address).toBe('Supera la longitud permitida.');
    expect(validateCustomer({ ...valid, name: ' ', identityDocument: '' })).toEqual({ name: 'Este campo es obligatorio.', identityDocument: 'Este campo es obligatorio.' });
  });

  it('reports every invalid field together', () => {
    expect(Object.keys(validateCustomer({ name: '', identityDocument: '', email: 'x', phone: '1', address: '' }))).toEqual(['name', 'identityDocument', 'email', 'phone', 'address']);
  });

  it('normalises only accidental whitespace around e-mail and phone, never the address or the name', () => {
    expect(normalizeCustomer({ ...valid, email: ' ana@example.test ', phone: ' 3001234567 ', address: '  Calle 1  ', name: ' Ana ' }))
      .toEqual({ ...valid, email: 'ana@example.test', phone: '3001234567', address: '  Calle 1  ', name: ' Ana ' });
  });
});

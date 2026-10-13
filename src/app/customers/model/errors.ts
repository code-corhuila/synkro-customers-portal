import type { FieldErrors } from './customer';
export interface DisplayError { message:string; traceId:string; fields:FieldErrors; uncertain:boolean; status:number }
export function displayError(error: unknown): DisplayError {
  const e = error as {status?:number; body?:{traceId?:string;details?:{field:string;message:string}[]}} | null;
  const status = e?.status ?? 0;
  const fields:FieldErrors = {};
  for (const detail of e?.body?.details ?? []) {
    if (['name','identityDocument','email','phone','address'].includes(detail.field)) {
      fields[detail.field as keyof FieldErrors] = detail.field === 'identityDocument' && /exist|unique|registered|duplicate/i.test(detail.message)
        ? 'Este documento ya está registrado, incluso si el cliente está inactivo.'
        : detail.field === 'email' ? 'Revisa el formato y la longitud del correo electrónico.' : 'Revisa este campo: el servidor rechazó su valor.';
    }
  }
  return {status,fields,traceId:e?.body?.traceId ?? '',uncertain:status === 0 || status >= 500,
    message: status === 404 ? 'Cliente no encontrado o inactivo.' : status === 403 ? 'No tienes permiso para realizar esta operación.'
      : status === 401 ? 'Tu sesión terminó. Inicia sesión desde el Host.' : status === 400 || status === 422
        ? 'Revisa los campos indicados.' : status === 429 ? 'Hay demasiadas solicitudes. Espera y vuelve a intentarlo.' : 'No se pudo completar la operación. Puedes reintentar.'};
}

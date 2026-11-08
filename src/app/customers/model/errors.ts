import type { FieldErrors } from './customer';
import { MESSAGES } from './validation';
export interface DisplayError { message:string; traceId:string; fields:FieldErrors; uncertain:boolean; status:number }

const FIELDS = ['name','identityDocument','email','phone','address'];
/** Field-level detail of a server rejection: the closed vocabulary of the API (`required`, `invalid_format`, `too_long`). */
function fieldMessage(field:string, detail:string):string {
  if (field === 'identityDocument' && /exist|unique|registered|duplicate/i.test(detail)) return 'Este documento ya está registrado, incluso si el cliente está inactivo.';
  if (/required/i.test(detail)) return MESSAGES.required;
  if (/too_long|length/i.test(detail)) return MESSAGES.long;
  if (field === 'email') return MESSAGES.email;
  if (field === 'phone') return MESSAGES.phone;
  return 'Revisa este campo: el servidor rechazó su valor.';
}
export function displayError(error: unknown): DisplayError {
  const e = error as {status?:number; body?:{traceId?:string;details?:{field:string;message:string}[]}} | null;
  const status = e?.status ?? 0;
  const fields:FieldErrors = {};
  for (const detail of e?.body?.details ?? []) {
    if (FIELDS.includes(detail.field)) fields[detail.field as keyof FieldErrors] = fieldMessage(detail.field, detail.message ?? '');
  }
  return {status,fields,traceId:e?.body?.traceId ?? '',uncertain:status === 0 || status >= 500,
    message: status === 404 ? 'Cliente no encontrado o inactivo.' : status === 403 ? 'No tienes permiso para realizar esta operación.'
      : status === 401 ? 'Tu sesión terminó. Inicia sesión desde el Host.' : status === 400 || status === 422
        ? 'Revisa los campos indicados.' : status === 429 ? 'Hay demasiadas solicitudes. Espera y vuelve a intentarlo.' : 'No se pudo completar la operación. Puedes reintentar.'};
}

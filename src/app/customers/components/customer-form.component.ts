import { Component, ElementRef, inject, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { blankCustomer, type CustomerRequest, type FieldErrors } from '../model/customer';
import { normalizeCustomer, validateCustomer } from '../model/validation';

interface FieldConfig { key: keyof CustomerRequest; label: string; max: number; type: string; inputmode?: string; autocomplete?: string; hint?: string }

@Component({selector:'customer-form',imports:[FormsModule],template:`
  <form (ngSubmit)="submit()" novalidate>
    <fieldset [disabled]="pending">
      @if (legacy) {
        <p class="notice" role="note">Este cliente se registró antes de que los contactos fueran obligatorios. Completa correo, teléfono y dirección para guardar los cambios.</p>
      }
      @for (field of fields; track field.key) {
        <div class="field">
          <label [for]="'customer-'+field.key">{{field.label}} *</label>
          <input [id]="'customer-'+field.key" [name]="field.key" [attr.name]="field.key" [type]="field.type"
            [attr.inputmode]="field.inputmode ?? null" [attr.autocomplete]="field.autocomplete ?? null" aria-required="true" [maxlength]="field.max"
            [ngModel]="draft[field.key]" (ngModelChange)="change(field.key,$event)"
            [attr.aria-invalid]="message(field.key) ? 'true' : null"
            [attr.aria-describedby]="field.hint ? 'hint-'+field.key+' error-'+field.key : 'error-'+field.key"/>
          @if (field.hint) {<p class="hint" [id]="'hint-'+field.key">{{field.hint}}</p>}
          <p [id]="'error-'+field.key" class="field-error" aria-live="polite">{{message(field.key)}}</p>
        </div>
      }
      <p>Los campos con * son obligatorios.</p>
      <button type="submit" [disabled]="pending || blocked">{{pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar cliente'}}</button>
    </fieldset>
  </form>
`,styleUrls:['../pages/customers.css']})
export class CustomerFormComponent {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  draft = blankCustomer();
  /** Errors reported by the server for the last submission (shown before the local ones). */
  @Input() errors:FieldErrors = {};
  @Input() pending = false;
  @Input() blocked = false;
  @Input() editing = false;
  /** The stored customer predates the mandatory contacts: explain why they are empty. */
  @Input() legacy = false;
  @Input() set model(value:CustomerRequest) { this.draft={...value}; }
  @Output() save = new EventEmitter<CustomerRequest>();
  @Output() changed = new EventEmitter<CustomerRequest>();
  fields:FieldConfig[]=[
    {key:'name',label:'Nombre o razón social',max:150,type:'text'},
    {key:'identityDocument',label:'Documento (cédula o NIT)',max:30,type:'text'},
    {key:'email',label:'Correo electrónico',max:255,type:'email',autocomplete:'email'},
    {key:'phone',label:'Teléfono',max:10,type:'text',inputmode:'numeric',autocomplete:'tel-national',hint:'10 dígitos, sin espacios ni símbolos.'},
    {key:'address',label:'Dirección',max:255,type:'text',autocomplete:'street-address'}
  ];
  private submitted = false;
  private local:FieldErrors = {};
  message(key:keyof CustomerRequest) { return this.errors[key] || (this.submitted ? this.local[key] : '') || ''; }
  change(key:keyof CustomerRequest,value:string) {
    this.draft={...this.draft,[key]:value};
    if (this.submitted) this.local=validateCustomer(this.draft);
    this.changed.emit({...this.draft});
  }
  submit() {
    if (this.pending || this.blocked) return;
    this.submitted=true; this.local=validateCustomer(this.draft);
    const first=this.fields.find(field=>this.local[field.key]);
    if (first) {this.host.nativeElement.querySelector<HTMLElement>(`[name="${first.key}"]`)?.focus(); return;}
    this.save.emit(normalizeCustomer(this.draft));
  }
}

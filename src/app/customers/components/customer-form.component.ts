import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule, type NgForm } from '@angular/forms';
import { blankCustomer, type CustomerRequest, type FieldErrors } from '../model/customer';
@Component({selector:'customer-form',imports:[FormsModule],template:`
  <form #form="ngForm" (ngSubmit)="submit(form)" novalidate>
    <fieldset [disabled]="pending">
      @for (field of fields; track field.key) {
        <div class="field">
          <label [for]="'customer-'+field.key">{{field.label}}{{field.required ? ' *' : ''}}</label>
          <input [id]="'customer-'+field.key" [name]="field.key" [attr.name]="field.key" [type]="field.key === 'email' ? 'email' : 'text'"
            [email]="field.key === 'email'" [required]="field.required" [maxlength]="field.max"
            [ngModel]="draft[field.key]" (ngModelChange)="change(field.key,$event)" #control="ngModel"
            [attr.aria-invalid]="!!errors[field.key] || (form.submitted && control.invalid)"
            [attr.aria-describedby]="'error-'+field.key"/>
          <p [id]="'error-'+field.key" class="field-error" aria-live="polite">
            {{errors[field.key] || (form.submitted && control.invalid ? (control.errors?.['required'] ? 'Este campo es obligatorio.' : 'Revisa el formato o la longitud permitida.') : '')}}
          </p>
        </div>
      }
      <p>Los campos con * son obligatorios.</p>
      <button type="submit" [disabled]="pending || blocked">{{pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar cliente'}}</button>
    </fieldset>
  </form>
`,styleUrls:['../pages/customers.css']})
export class CustomerFormComponent {
  draft = blankCustomer();
  @Input() set model(value:CustomerRequest) { this.draft={...value}; }
  @Input() errors:FieldErrors = {};
  @Input() pending = false;
  @Input() blocked = false;
  @Input() editing = false;
  @Output() save = new EventEmitter<CustomerRequest>();
  @Output() changed = new EventEmitter<CustomerRequest>();
  fields:{key:keyof CustomerRequest;label:string;max:number;required:boolean}[]=[
    {key:'name',label:'Nombre o razón social',max:150,required:true},
    {key:'identityDocument',label:'Documento (cédula o NIT)',max:30,required:true},
    {key:'email',label:'Correo electrónico',max:255,required:false},
    {key:'phone',label:'Teléfono',max:20,required:false},
    {key:'address',label:'Dirección',max:255,required:false}
  ];
  change(key:keyof CustomerRequest,value:string) { this.draft={...this.draft,[key]:value}; this.changed.emit({...this.draft}); }
  submit(form:NgForm) {
    if (this.pending || this.blocked) return;
    if (form.invalid) {
      form.form.markAllAsTouched();
      document.querySelector<HTMLElement>('customer-form input.ng-invalid')?.focus(); return;
    }
    this.save.emit({...this.draft,email:this.draft.email || null,phone:this.draft.phone || null,address:this.draft.address || null});
  }
}

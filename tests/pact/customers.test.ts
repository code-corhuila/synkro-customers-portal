import '@angular/compiler';
import { Pact, Matchers } from '@pact-foundation/pact';
import { resolve } from 'node:path';
import { CustomersApiService } from '../../src/app/customers/data/customers-api.service';
import { displayError } from '../../src/app/customers/model/errors';
import type { ShellContract } from '../../src/app/shell-contract';

const ID = '550e8400-e29b-41d4-a716-446655440001';
const body = { name: 'Pact Portal Customer', identityDocument: 'PACT-PORTAL-NEW', email: 'pact@example.test', phone: '3001234567', address: 'Synthetic street' };
const customer = (name: string, document: string) => ({ customerId: Matchers.uuid(ID), name, identityDocument: document,
  email: body.email, phone: body.phone, address: body.address, active: true,
  registrationDate: Matchers.regex('^\\d{4}-\\d{2}-\\d{2}T.*Z$', '2026-11-10T00:00:00Z') });
function service(base: string) {
  const client = new CustomersApiService();
  const contract: ShellContract = { contractVersion: 1, basePath: '/customers', session: { user: () => ({sub:'pact-admin',role:'ADMIN'}) }, navigate: () => {},
    api: { async request<T>(method, path, options = {}): Promise<T> {
      const headers: Record<string,string> = {'Content-Type':'application/json'};
      if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
      const response = await fetch(base + path, { method, headers, signal: options.signal,
        body: options.body === undefined ? undefined : JSON.stringify(options.body) });
      const result = await response.json();
      if (!response.ok) throw {status: response.status, body: result};
      return result;
    } },
  };
  client.setContract(contract); return client;
}
const pact = () => new Pact({consumer:'CustomersPortal',provider:'CustomersAPI',dir:resolve('tests/pact/pacts'),logLevel:'error'});

it('the real portal service creates complete contacts with its stable key', async () => {
  await pact().addInteraction().given('no customer has PACT-PORTAL-NEW').uponReceiving('create with complete contacts')
    .withRequest('POST','/api/v1/customers', b => b.headers({'Idempotency-Key':'pact-create-key-0001'}).jsonBody(body))
    .willRespondWith(201, b => b.headers({'Content-Type':'application/json'}).jsonBody(customer(body.name,body.identityDocument)))
    .executeTest(async mock => {
      const result = await service(mock.url).create(body,'pact-create-key-0001');
      expect(result.identityDocument).toBe(body.identityDocument); expect(result.phone).toBe(body.phone);
    });
});
it('the real duplicate envelope maps to the safe document field message', async () => {
  const duplicate = {...body,identityDocument:'DUP-PACT123'};
  await pact().addInteraction().given('DUP-PACT123 is already registered').uponReceiving('a raw duplicate document')
    .withRequest('POST','/api/v1/customers', b => b.headers({'Idempotency-Key':'pact-duplicate-key-0001'}).jsonBody(duplicate))
    .willRespondWith(422, b => b.headers({'Content-Type':'application/json'}).jsonBody({error:'BUSINESS_RULE_VIOLATION',
      message:'Identity document already belongs to a customer', details:[{field:'identityDocument',message:'Identity document already belongs to a customer'}],traceId:Matchers.like('pact-trace')}))
    .executeTest(async mock => {
      const error = await service(mock.url).create(duplicate,'pact-duplicate-key-0001').then(() => {throw Error('Expected rejection');}, e => e);
      expect(error.status).toBe(422);
      expect(displayError(error).fields.identityDocument).toBe('Este documento ya está registrado, incluso si el cliente está inactivo.');
      expect(displayError(error).message).not.toContain('already belongs');
    });
});
it('the portal reactivates by explicit POST using the provider state identity', async () => {
  await pact().addInteraction().given('one inactive pact customer exists').uponReceiving('explicit ADMIN reactivation')
    .withRequest('POST',Matchers.fromProviderState('/api/v1/customers/${customerId}/activate',`/api/v1/customers/${ID}/activate`))
    .willRespondWith(200,b => b.headers({'Content-Type':'application/json'}).jsonBody(customer('Pact Reactivation','PACT-INACTIVE')))
    .executeTest(async mock => {const result = await service(mock.url).activate(ID); expect(result.active).toBe(true);expect(result.customerId).toBe(ID);});
});
it('the portal requests inactive search explicitly in the body', async () => {
  await pact().addInteraction().given('a distinct inactive search customer exists').uponReceiving('ADMIN searches inactive customers')
    .withRequest('POST','/api/v1/customers/search',b => b.jsonBody({query:'PACT-LOOKUP-INACTIVE',status:'INACTIVE'}))
    .willRespondWith(200,b => b.headers({'Content-Type':'application/json'}).jsonBody({data:[{customerId:Matchers.uuid(ID),name:'Pact Inactive Lookup',identityDocument:'PACT-LOOKUP-INACTIVE',active:false,match:'DOCUMENT_EXACT'}],meta:{limit:5,hasMore:false}}))
    .executeTest(async mock => {const result=await service(mock.url).search({query:'PACT-LOOKUP-INACTIVE',status:'INACTIVE'});expect(result.data[0].active).toBe(false);});
});

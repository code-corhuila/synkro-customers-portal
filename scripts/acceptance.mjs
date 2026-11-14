// Opt-in acceptance: immutable real participants, exclusive tmpfs storage and
// Auth-issued credentials. Network fault injection drops a real committed response.
import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';

const root=resolve(import.meta.dirname,'..'),workspace=resolve(root,'..');
const owner='customers-browser-'+randomUUID().replaceAll('-','');
const temporary=resolve(root,'.acceptance',owner),evidence=resolve(root,'evidence');
mkdirSync(temporary,{recursive:true});mkdirSync(resolve(evidence,'raw'),{recursive:true});
const secrets=[],containers=[],images=[],revisions={},checks={},imageIds={};
const secret=()=>{const value=randomBytes(24).toString('hex');secrets.push(value);return value;};
const passwords={postgres:secret(),auth:secret(),customers:secret(),human:'Disposable-'+secret()+'!'};
const redact=text=>secrets.reduce((s,value)=>s.replaceAll(value,'[REDACTED]'),text);
function command(program,args,{input,allowFailure=false,timeout=900000}={}) {
  const r=spawnSync(program,args,{encoding:'utf8',input,timeout,maxBuffer:64*1024*1024});
  if(!allowFailure && (r.status!==0 || r.error)) {
    writeFileSync(resolve(evidence,'raw','diagnostic.log'),redact((r.stdout || '')+(r.stderr || '')));
    throw new Error(`${program} ${args[0]} failed; sanitized diagnostic retained`);
  } return r;
}
const docker=(args,options)=>command('docker',args,options);
const env=(name,values)=>{const path=resolve(temporary,name+'.env');writeFileSync(path,Object.entries(values).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600});return path;};
const mount=(file,target)=>['--mount',`type=bind,source=${file},target=${target},readonly`];
const sources={};
// HU-CLI-05: ACCEPTANCE_LOCAL_HEAD=synkro-customers-api,synkro-customers-db builds those two from the local branch HEAD (committed work only).
const localHeads=(process.env.ACCEPTANCE_LOCAL_HEAD||'').split(',').filter(Boolean);
for(const name of ['synkro-customers-portal','synkro-front','synkro-customers-api','synkro-auth-api','synkro-auth-db','synkro-customers-db','synkro-auth-portal','synkro-api-gateway','synkro-sales-portal','synkro-products-portal']) {
  const source=resolve(workspace,name),ref=['synkro-customers-portal','synkro-front',...localHeads].includes(name)?'HEAD':'origin/develop'; revisions[name]=command('git',['-C',source,'rev-parse',ref]).stdout.trim();
  const destination=resolve(temporary,name);mkdirSync(destination);
  const archive=resolve(temporary,name+'.tar'); command('git',['-C',source,'archive',revisions[name],'-o',archive]);command('tar',['-xf',archive,'-C',destination]);sources[name]=destination;
}
function build(name,extra=[]) {
  console.log('Build actual snapshot: '+name+' '+revisions[name]);
  const image=owner+':'+name;images.push(image);
  const result=docker(['build','--label','synkro.execution='+owner,'-t',image,...extra,'-f',resolve(sources[name],'deploy/Dockerfile'),sources[name]]);
  writeFileSync(resolve(evidence,'raw',name+'-image.log'),redact(result.stdout+result.stderr));imageIds[name]=docker(['image','inspect','--format','{{.Id}}',image]).stdout.trim();return image;
}
function launch(alias,image,settings={},extra=[],run=[]) {
  const name=owner+'-'+alias;containers.push(name);
  docker(['run','-d','--name',name,'--label','synkro.execution='+owner,'--network',owner,'--network-alias',alias,'--env-file',env(alias,settings),...extra,image,...run]);return name;
}
async function wait(check,seconds=120) {
  const deadline=Date.now()+seconds*1000;
  while(Date.now()<deadline) {try{if(await check())return;}catch{} await new Promise(r=>setTimeout(r,500));}
  throw Error('Participant readiness deadline exceeded');
}
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
// The documented local Host origin is localhost (remote entries are baked with it); 127.0.0.1 is probed separately at the end.
const origin=`http://localhost:${port}`,alternateOrigin=`http://127.0.0.1:${port}`;
const keys=generateKeyPairSync('rsa',{modulusLength:2048}),publicKey=resolve(temporary,'public.pem'),privateKey=resolve(temporary,'private.pem'),humanPassword=resolve(temporary,'human-password');
writeFileSync(publicKey,keys.publicKey.export({type:'spki',format:'pem'}));writeFileSync(privateKey,keys.privateKey.export({type:'pkcs8',format:'pem'}));writeFileSync(humanPassword,passwords.human);
let pg,browser,context,page,failed=false;
const result={scope:'Actual browser, Host, Gateway, Auth, Customers API and disposable PostgreSQL; no API response doubles',revisions,imageIds,checks,owner};
try {
  docker(['network','create','--label','synkro.execution='+owner,owner]);
  pg=launch('db','postgres:16.6-alpine',{POSTGRES_PASSWORD:passwords.postgres,POSTGRES_DB:'synkro'},['--tmpfs','/var/lib/postgresql/data']);
  await wait(()=>docker(['exec',pg,'pg_isready','-U','postgres'],{allowFailure:true}).status===0);
  const sql=query=>docker(['exec','-i',pg,'psql','-X','-U','postgres','-d','synkro','-qAt','-v','ON_ERROR_STOP=1'],{input:query}).stdout.trim();
  sql(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; CREATE ROLE auth_app LOGIN INHERIT PASSWORD '${passwords.auth}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE customers_app LOGIN INHERIT PASSWORD '${passwords.customers}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; ALTER ROLE customers_app SET search_path=customers_schema;`);
  const flyway=env('migrate',{FLYWAY_URL:'jdbc:postgresql://db:5432/synkro',FLYWAY_USER:'postgres',FLYWAY_PASSWORD:passwords.postgres});
  console.log('Migrate isolated Auth and Customers storage');
  docker(['run','--rm','--network',owner,'--env-file',flyway,...mount(sources['synkro-auth-db'],'/flyway/owner'),'flyway/flyway:11.20.3-alpine','-workingDirectory=/flyway/owner','-configFiles=flyway.toml','migrate']);
  docker(['run','--rm','--network',owner,'--env-file',flyway,...mount(sources['synkro-customers-db'],'/workspace'),'--entrypoint','/bin/sh','flyway/flyway:10.20.1','/workspace/scripts/migrate.sh','migrate']);
  const authImage=build('synkro-auth-api');
  const authEnv={SPRING_DATASOURCE_URL:'jdbc:postgresql://db:5432/synkro?currentSchema=auth_schema',SPRING_DATASOURCE_USERNAME:'auth_app',SPRING_DATASOURCE_PASSWORD:passwords.auth,JWT_PRIVATE_KEY_FILE:'/run/private.pem',SYNKRO_INIT_OPERATOR:'customers-browser-disposable'};
  docker(['run','--rm','--network',owner,'--env-file',env('initial-admin',authEnv),...mount(humanPassword,'/run/human-password'),'--entrypoint','java',authImage,'-cp','/app/auth-app.jar','-Dloader.main=co.edu.corhuila.synkro.auth.app.InitialAdminCli','org.springframework.boot.loader.launch.PropertiesLauncher','--name','Administrador de prueba','--email','browser-admin@example.test','--password-file','/run/human-password']);
  launch('synkro-auth-api',authImage,authEnv,[...mount(privateKey,'/run/private.pem')]);
  launch('synkro-customers-api',build('synkro-customers-api'),{SPRING_DATASOURCE_URL:'jdbc:postgresql://db:5432/synkro',SPRING_DATASOURCE_USERNAME:'customers_app',SPRING_DATASOURCE_PASSWORD:passwords.customers,JWT_PUBLIC_KEY_FILE:'/run/public.pem'},mount(publicKey,'/run/public.pem'));
  launch('synkro-api-gateway',build('synkro-api-gateway'),{CORS_ALLOWED_ORIGINS:origin+','+alternateOrigin,RATE_LIMIT_PER_SECOND:'100'});
  const portal=launch('synkro-customers-portal',build('synkro-customers-portal'));
  const shellArgs=['--build-arg',`VITE_SHELL_ENTRY_URL=${origin}/assets/remoteEntry.js`];
  launch('synkro-auth-portal',build('synkro-auth-portal',shellArgs));
  const productsImage=build('synkro-products-portal',shellArgs),salesImage=build('synkro-sales-portal',[...shellArgs,'--build-arg','VITE_BASE_PATH=/remotes/sales/']);
  launch('synkro-products-portal',productsImage,{HOST_ORIGIN:origin});
  const sales=launch('synkro-sales-portal',salesImage,{HOST_ORIGIN:origin});
  const hostImage=build('synkro-front',['--build-arg',`VITE_AUTH_PORTAL_ENTRY=${origin}/remotes/auth/assets/remoteEntry.js`,'--build-arg',`VITE_PRODUCTS_PORTAL_ENTRY=${origin}/remotes/products/assets/remoteEntry.js`,'--build-arg',`VITE_SALES_PORTAL_ENTRY=${origin}/remotes/sales/assets/remoteEntry.js`]);
  launch('host',hostImage,{},['--publish',`127.0.0.1:${port}:80`]);
  await wait(async()=> (await fetch(origin+'/login')).status===200);
  // API readiness is exercised by actual Auth login, not port publication.
  browser=await chromium.launch({channel:process.env.CUSTOMERS_BROWSER_CHANNEL || 'chromium',headless:true});result.browserVersion=browser.version();context=await browser.newContext({viewport:{width:1280,height:900}});page=await context.newPage();
  const apiErrors=[];page.on('pageerror',e=>apiErrors.push(e.message));
  // The Host keeps sign-out inside its account menu (menuitem), not as a loose button.
  async function logout() {
    await page.getByRole('button',{name:/^Menú de cuenta/}).click();
    await page.getByRole('menuitem',{name:'Cerrar sesión'}).click();
  }
  async function login(email) {
    await page.getByLabel('Correo electrónico').fill(email);await page.getByLabel('Contraseña').fill(passwords.human);
    const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login') && r.request().method()==='POST');
    await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
    const r=await response;assert.equal(r.status(),200);const credentials=await r.json();secrets.push(credentials.accessToken,credentials.refreshToken);return credentials;
  }
  console.log('Browser: real login and authorized destination restoration');
  await page.goto(origin+'/customers'); await expect(page).toHaveURL(/\/login/);
  const admin=await login('browser-admin@example.test');await expect(page).toHaveURL(origin+'/customers');
  await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible();await expect(page.getByText('No hay clientes que coincidan')).toBeVisible();checks.loginRestore='PASS';
  const authorization={Authorization:'Bearer '+admin.accessToken};
  for(const [role,email] of [['SALESPERSON','browser-sales@example.test'],['INVENTORY','browser-inventory@example.test']]) {
    const r=await context.request.post(origin+'/api/v1/auth/register',{headers:{...authorization,'Idempotency-Key':randomUUID()},data:{name:'Persona '+role,email,password:passwords.human,role}}); assert.equal(r.status(),201);
  }
  console.log('Browser: commit real creation, drop its response, explicitly replay identical intent');
  const writes=[];let dropped=false;
  await page.route('**/api/v1/customers',async route=>{
    if(route.request().method()==='POST') {
      writes.push({key:route.request().headers()['idempotency-key'],payload:route.request().postDataJSON()});
      if(!dropped) {dropped=true;const r=await route.fetch();assert.equal(r.status(),201);checks.createdCustomer=(await r.json()).customerId;await route.abort('failed');return;}
    } await route.continue();
  });
  await page.getByRole('button',{name:'Nuevo cliente',exact:true}).click();await expect(page).toHaveURL(origin+'/customers/new');
  const doc=randomUUID().slice(0,25);
  await page.getByLabel('Nombre o razón social').fill('Cliente de aceptación');await page.getByLabel('Documento (cédula o NIT)').fill(doc);
  await page.getByRole('button',{name:'Registrar cliente',exact:true}).click();
  await expect(page.locator('#error-email')).toHaveText('Este campo es obligatorio.');await expect(page.locator('#error-phone')).toHaveText('Este campo es obligatorio.');await expect(page.locator('#error-address')).toHaveText('Este campo es obligatorio.');
  await expect(page.getByLabel('Correo electrónico')).toBeFocused();assert.equal(writes.length,0,'empty contacts must not be sent');checks.emptyContactsRejected='PASS';
  await page.getByLabel('Correo electrónico').fill('no-es-un-correo');await page.getByLabel('Teléfono').fill('300123456');await page.getByLabel('Dirección').fill('Calle 1 # 2-3');
  await page.getByRole('button',{name:'Registrar cliente',exact:true}).click();
  await expect(page.locator('#error-email')).toContainText('correo válido');await expect(page.locator('#error-phone')).toContainText('exactamente 10 dígitos');assert.equal(writes.length,0);checks.invalidEmailAndPhoneRejected='PASS';
  await page.getByLabel('Correo electrónico').fill('cliente@example.test');await page.getByLabel('Teléfono').fill('3001234567');
  await page.getByRole('button',{name:'Registrar cliente',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reintentar registro'})).toBeVisible();
  const replay=page.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/api/v1/customers'));
  await page.getByRole('button',{name:'Reintentar registro'}).click();const replayResponse=await replay;assert.equal(replayResponse.status(),200);
  assert.equal((await replayResponse.json()).customerId,checks.createdCustomer);assert.deepEqual(writes[0],writes[1]);
  assert.equal(sql('SELECT count(*) FROM customers_schema.customer'),'1');checks.idempotentUncertainRetry='PASS';
  const rejectedApi=await context.request.post(origin+'/api/v1/customers',{headers:{...authorization,'Idempotency-Key':randomUUID()},data:{...writes[0].payload,identityDocument:randomUUID().slice(0,25),phone:'300-123-4567',email:'',address:' '}});assert.equal(rejectedApi.status(),400);
  assert.deepEqual((await rejectedApi.json()).details.map(d=>d.field).sort(),['address','email','phone']);assert.equal(sql('SELECT count(*) FROM customers_schema.customer'),'1');checks.apiRejectsInvalidContactsWithoutWrites='PASS';
  await expect(page).toHaveURL(origin+'/customers/'+checks.createdCustomer);await expect(page.getByRole('heading',{name:'Detalle del cliente'})).toBeVisible();
  const before=await (await context.request.get(origin+'/api/v1/customers/'+checks.createdCustomer,{headers:authorization})).json();
  await page.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Nombre o razón social').fill('Cliente actualizado');await page.getByLabel('Correo electrónico').fill('');await page.getByRole('button',{name:'Guardar cambios'}).click();
  await expect(page.locator('#error-email')).toHaveText('Este campo es obligatorio.');assert.equal((await (await context.request.get(origin+'/api/v1/customers/'+checks.createdCustomer,{headers:authorization})).json()).name,'Cliente de aceptación');checks.editWithoutEmailRejected='PASS';
  await page.getByLabel('Correo electrónico').fill('cliente@example.test');await page.getByRole('button',{name:'Guardar cambios'}).click();await expect(page.getByText('Cliente actualizado',{exact:true})).toBeVisible();
  const after=await (await context.request.get(origin+'/api/v1/customers/'+checks.createdCustomer,{headers:authorization})).json();
  assert.equal(after.customerId,before.customerId);assert.equal(after.registrationDate,before.registrationDate);assert.equal(after.email,'cliente@example.test');assert.equal(after.phone,'3001234567');assert.equal(after.address,'Calle 1 # 2-3');checks.detailAndReplacement='PASS';
  await page.reload();await expect(page.getByRole('heading',{name:'Detalle del cliente'})).toBeVisible();checks.deepLinkRefresh='PASS';
  await page.getByRole('button',{name:'Volver a clientes'}).click();await page.getByLabel('Documento exacto').fill(doc);await page.getByRole('button',{name:'Buscar',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);checks.exactDocumentSearch='PASS';
  await page.getByRole('button',{name:'Ver detalle'}).click();await page.goBack();await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible();
  await page.goForward();await expect(page.getByRole('heading',{name:'Detalle del cliente'})).toBeVisible();checks.backForward='PASS';
  await page.getByRole('button',{name:'Desactivar',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal((await context.request.get(origin+'/api/v1/customers/'+checks.createdCustomer,{headers:authorization})).status(),200);
  await page.getByRole('button',{name:'Desactivar',exact:true}).click();await page.getByRole('button',{name:'Confirmar desactivación'}).click();await expect(page.getByText('Cliente desactivado. El registro se conserva.')).toBeVisible();
  assert.equal((await context.request.get(origin+'/api/v1/customers/'+checks.createdCustomer,{headers:authorization})).status(),404);
  assert.equal((await context.request.put(origin+'/api/v1/customers/'+checks.createdCustomer,{headers:authorization,data:writes[0].payload})).status(),404);
  assert.equal((await context.request.delete(origin+'/api/v1/customers/'+checks.createdCustomer,{headers:authorization})).status(),200);
  assert.equal((await context.request.post(origin+'/api/v1/customers',{headers:{...authorization,'Idempotency-Key':randomUUID()},data:writes[0].payload})).status(),422);checks.logicalDeleteAndReservedDocument='PASS';
  await page.getByRole('button',{name:'Volver a clientes'}).click();await page.getByLabel('Estado',{exact:true}).selectOption('false');await page.getByRole('button',{name:'Buscar',exact:true}).click();await expect(page.getByText('Inactivo',{exact:true})).toBeVisible();
  await page.screenshot({path:resolve(evidence,'customers-inactive.png'),fullPage:true});
  const entry=await context.request.get(origin+'/remotes/customers/remoteEntry.js');assert.equal(entry.status(),200);assert.match(entry.headers()['cache-control'],/no-store/);
  const asset=(await entry.text()).match(/\.\/(main-[\w-]+\.js)/)[1];const bundle=await context.request.get(origin+'/remotes/customers/'+asset);assert.equal(bundle.status(),200);assert.match(bundle.headers()['cache-control'],/immutable/);checks.stableEntryAndHashedAssets='PASS';
  await logout();await expect(page).toHaveURL(/\/login/);const salesperson=await login('browser-sales@example.test');
  await page.goto(origin+'/customers/new');await page.getByLabel('Nombre o razón social').fill('Cliente vendedor');await page.getByLabel('Documento (cédula o NIT)').fill(randomUUID().slice(0,25));await page.getByLabel('Correo electrónico').fill('vendedor@example.test');await page.getByLabel('Teléfono').fill('3109876543');await page.getByLabel('Dirección').fill('Carrera 7 # 1-1');await page.getByRole('button',{name:'Registrar cliente',exact:true}).click();await expect(page.getByRole('heading',{name:'Detalle del cliente'})).toBeVisible();checks.salespersonCreate='PASS';
  await logout();await expect(page).toHaveURL(/\/login/);const inventory=await login('browser-inventory@example.test');await page.goto(origin+'/customers');await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('synkro-customers-portal')).toHaveCount(0);assert.equal((await context.request.get(origin+'/api/v1/customers',{headers:{Authorization:'Bearer '+inventory.accessToken}})).status(),403);checks.inventoryDenied='PASS';
  // Return using actual public login; all credentials remain ephemeral.
  await logout();await expect(page).toHaveURL(/\/login/);const adminSession=await login('browser-admin@example.test');await page.goto(origin+'/customers');await expect(page.locator('tbody tr').first()).toBeVisible();
  // ---------------------------------------------------------------------------------------------------------------
  // HU-CLI-05 (Customers only): contacts, bounded search, ADMIN reactivation, SALESPERSON denial, keyboard/focus.
  // The Sales integration is NOT part of this run (it needs the concrete Sales revision of HU-VEN-20).
  // ---------------------------------------------------------------------------------------------------------------
  console.log('HU-CLI-05 browser: search, empty/error/loading/stale states, reactivation and role denial');
  // Reuse the session the Host just created: the Auth service rate-limits repeated logins from one client.
  const adminHeaders={Authorization:'Bearer '+adminSession.accessToken};
  const seed=async(name,identityDocument)=>{const r=await context.request.post(origin+'/api/v1/customers',{headers:{...adminHeaders,'Idempotency-Key':randomUUID()},data:{name,identityDocument,email:'seed@example.test',phone:'3001234567',address:'Calle de prueba 1'}});assert.equal(r.status(),201,'seed '+name);return (await r.json()).customerId;};
  await seed('María Núñez Pérez','ACC-M1');await seed('Maria Nunez Gomez','ACC-M2');
  await seed('Zeta Cliente','ACC-C1');await seed('Acc-C1 Club','ACC-C9');
  for(let i=1;i<=7;i++)await seed('Cobertura Cliente '+i,'ACC-COB'+i);
  const termLeak='zqxjv-'+randomBytes(4).toString('hex');                    // a unique, harmless search text used to prove it never leaves the body
  const searchRequests=[],allUrls=[],consoleTexts=[];
  page.on('request',r=>{allUrls.push(r.url());if(r.url().includes('/api/v1/customers/search'))searchRequests.push({method:r.method(),url:r.url(),body:r.postData()});});
  page.on('console',m=>consoleTexts.push(m.text()));
  await page.goto(origin+'/customers');await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible();
  const box=page.getByLabel('Buscar por nombre o documento'),submit=page.getByRole('button',{name:'Buscar cliente',exact:true}),results=page.getByLabel('Resultados de la búsqueda');
  // Validation before any request: too short, then empty.
  const requestsBefore=searchRequests.length;
  await box.fill('a');await submit.click();await expect(page.locator('#error-query')).toContainText(/2/);assert.equal(searchRequests.length,requestsBefore,'a too-short text must not be sent');
  await box.fill('');await submit.click();await expect(page.locator('#error-query')).not.toBeEmpty();assert.equal(searchRequests.length,requestsBefore);checks.searchClientValidation='PASS';
  // Name search: case and accent insensitive, word order free; both spellings found.
  await box.fill('NUNEZ maria');await box.press('Enter');
  await expect(results.getByRole('row')).toHaveCount(3);                       // header + 2 matches
  await expect(results).toContainText('María Núñez Pérez');await expect(results).toContainText('Maria Nunez Gomez');checks.searchNameCaseAccent='PASS';
  // Exact document first, then name matches; the reason is shown.
  await box.fill('acc-c1');await submit.click();await expect(results.getByRole('row').nth(1)).toContainText('Zeta Cliente');await expect(results.getByRole('row').nth(1)).toContainText('Documento exacto');
  await expect(results.getByRole('row').nth(2)).toContainText('Acc-C1 Club');checks.searchExactDocumentFirst='PASS';
  // Never more than five, with the hint that there are more.
  await box.fill('cobertura');await submit.click();await expect(results.getByRole('row')).toHaveCount(6);await expect(results).toContainText('Hay más de 5 coincidencias');checks.searchMaxFiveAndMore='PASS';
  // Empty state.
  await box.fill(termLeak);await submit.click();await expect(results).toContainText('No hay coincidencias para esa búsqueda.');checks.searchEmptyState='PASS';
  // Loading state: hold the response, then release it.
  let release;const gate=new Promise(r=>{release=r;});
  await page.route('**/api/v1/customers/search',async route=>{await gate;await route.continue();},{times:1});
  await box.fill('maria');await submit.click();await expect(results.getByRole('status').filter({hasText:'Buscando'})).toBeVisible();release();await expect(results).toContainText('María Núñez Pérez');checks.searchLoadingState='PASS';
  // Error state with a reference, then retry succeeds.
  await page.route('**/api/v1/customers/search',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'INTERNAL_ERROR',message:'Internal error',traceId:'acc-trace-500'})}),{times:1});
  await box.fill('maria');await submit.click();await expect(page.locator('#search-error')).toContainText('acc-trace-500');
  await page.getByRole('button',{name:'Reintentar búsqueda'}).click();await expect(results).toContainText('María Núñez Pérez');checks.searchErrorAndRetry='PASS';
  // Stale response discarded: the slow first answer must never replace the newer one.
  await page.route('**/api/v1/customers/search',async route=>{if(route.request().postDataJSON().query==='cobertura'){await new Promise(r=>setTimeout(r,2500));}try{await route.continue();}catch{}});
  await box.fill('cobertura');await submit.click();await box.fill('acc-c1');await submit.click();
  await expect(results).toContainText('Zeta Cliente');await page.waitForTimeout(3200);await expect(results).toContainText('Zeta Cliente');await expect(results).not.toContainText('Cobertura Cliente 1');
  await page.unroute('**/api/v1/customers/search');checks.searchStaleResponseDiscarded='PASS';
  // Privacy: the text travels only in the POST body.
  assert.ok(searchRequests.length>=8);for(const r of searchRequests){assert.equal(r.method,'POST');assert.ok(!r.url.includes('?'),'no query string on the search URL');assert.ok(!/maria|nunez|cobertura|acc-c1|zqxjv/i.test(r.url));}
  assert.ok(searchRequests.some(r=>JSON.parse(r.body).query==='NUNEZ maria'));
  assert.ok(!allUrls.some(u=>/zqxjv|nunez|cobertura/i.test(u)),'search text in a URL');assert.ok(!consoleTexts.some(t=>/zqxjv|nunez|cobertura/i.test(t)),'search text in the console');
  assert.ok(!page.url().includes('?'));checks.searchTextOnlyInBody='PASS';
  // Keyboard: Enter submits from the field; Tab reaches the result action; focus is visible on the heading after navigation.
  await box.fill('acc-c1');await box.press('Enter');await expect(results.getByRole('row').nth(1)).toContainText('Zeta Cliente');
  await page.keyboard.press('Tab');await expect(page.getByLabel('Estado a buscar')).toBeFocused();await page.keyboard.press('Tab');await expect(submit).toBeFocused();await page.keyboard.press('Tab');await expect(results.getByRole('button',{name:'Ver detalle'}).first()).toBeFocused();checks.keyboardSearch='PASS';

  // ADMIN reactivation of the customer deactivated earlier in this run (documents and identifiers stay).
  await page.getByLabel('Estado a buscar').selectOption('INACTIVE');await box.fill(doc);await submit.click();
  const row=results.getByRole('row').nth(1);await expect(row).toContainText('Inactivo');await expect(row).toContainText('Documento exacto');
  const trigger=row.getByRole('button',{name:'Reactivar'});await trigger.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Reactivar cliente'});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Cancelar reactivación'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();   // closing returns focus to the trigger
  assert.equal(sql(`SELECT count(*) FROM customers_schema.customer_audit WHERE customer_id='${checks.createdCustomer}'`),'0');
  await page.keyboard.press('Enter');await expect(dialog).toBeVisible();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Confirmar reactivación'})).toBeFocused();
  const activation=page.waitForResponse(r=>r.url().endsWith('/api/v1/customers/'+checks.createdCustomer+'/activate'));await page.keyboard.press('Enter');
  const activated=await activation;assert.equal(activated.status(),200);assert.equal((await activated.json()).customerId,checks.createdCustomer);
  await expect(page.getByText('Cliente reactivado. Ya puede usarse en ventas.')).toBeVisible();
  assert.equal(sql(`SELECT count(*) FROM customers_schema.customer_audit WHERE customer_id='${checks.createdCustomer}' AND action='REACTIVATED'`),'1');
  assert.equal(sql(`SELECT identity_document FROM customers_schema.customer WHERE customer_id='${checks.createdCustomer}'`),doc);
  assert.equal(sql(`SELECT count(*) FROM customers_schema.customer WHERE identity_document='${doc}'`),'1');
  assert.match(sql(`SELECT actor_id FROM customers_schema.customer_audit WHERE customer_id='${checks.createdCustomer}'`),/^[0-9a-f-]{36}$/);
  const repeated=await context.request.post(origin+'/api/v1/customers/'+checks.createdCustomer+'/activate',{headers:adminHeaders});assert.equal(repeated.status(),200);
  assert.equal(sql(`SELECT count(*) FROM customers_schema.customer_audit WHERE customer_id='${checks.createdCustomer}'`),'1');   // idempotent: no second audit row
  assert.equal((await context.request.get(origin+'/api/v1/customers/'+checks.createdCustomer,{headers:adminHeaders})).status(),200);checks.adminReactivation='PASS';
  await page.screenshot({path:resolve(evidence,'customers-reactivated.png'),fullPage:true});

  // SALESPERSON: no reactivation control in the UI, no state selector, and the API refuses direct calls.
  await logout();await expect(page).toHaveURL(/\/login/);const seller=await login('browser-sales@example.test');
  await page.goto(origin+'/customers');await expect(page.getByLabel('Buscar por nombre o documento')).toBeVisible();await expect(page.getByLabel('Estado a buscar')).toHaveCount(0);
  await page.getByLabel('Buscar por nombre o documento').fill('cobertura');await page.getByRole('button',{name:'Buscar cliente',exact:true}).click();
  await expect(page.getByLabel('Resultados de la búsqueda')).toContainText('Cobertura Cliente');await expect(page.getByRole('button',{name:'Reactivar'})).toHaveCount(0);
  const sellerHeaders={Authorization:'Bearer '+seller.accessToken};
  const inactiveTarget=await seed('Cliente inactivo de prueba','ACC-INACT');
  assert.equal((await context.request.delete(origin+'/api/v1/customers/'+inactiveTarget,{headers:adminHeaders})).status(),200);
  assert.equal((await context.request.post(origin+'/api/v1/customers/'+inactiveTarget+'/activate',{headers:sellerHeaders})).status(),403);
  assert.equal((await context.request.post(origin+'/api/v1/customers/'+inactiveTarget+'/activate',{headers:{...sellerHeaders,'X-User-Role':'ADMIN','X-Roles':'ADMIN'},data:{role:'ADMIN'}})).status(),403);
  assert.equal((await context.request.post(origin+'/api/v1/customers/'+inactiveTarget+'/activate',{headers:{Authorization:'Bearer '+inventory.accessToken}})).status(),403);
  assert.equal((await context.request.post(origin+'/api/v1/customers/'+inactiveTarget+'/activate')).status(),401);
  assert.equal((await context.request.put(origin+'/api/v1/customers/'+inactiveTarget,{headers:sellerHeaders,data:{name:'x',identityDocument:'ACC-INACT',email:'a@example.test',phone:'3001234567',address:'Calle 1'}})).status(),404);   // PUT cannot reactivate
  assert.equal((await context.request.post(origin+'/api/v1/customers/search',{headers:sellerHeaders,data:{query:'ACC-INACT',status:'INACTIVE'}})).status(),403);
  assert.equal(sql(`SELECT active::text || ':' || (SELECT count(*) FROM customers_schema.customer_audit WHERE customer_id='${inactiveTarget}') FROM customers_schema.customer WHERE customer_id='${inactiveTarget}'`),'false:0');checks.salespersonDeniedUiAndApi='PASS';
  await logout();await expect(page).toHaveURL(/\/login/);
  // Logs of the participants that handled the search never contain the search text or customer contacts.
  const logs=['synkro-customers-api','synkro-api-gateway','host'].map(alias=>{const r=docker(['logs',owner+'-'+alias],{allowFailure:true});return r.stdout+r.stderr;}).join('\n');
  assert.ok(!/zqxjv|nunez|cobertura|seed@example\.test|3001234567/i.test(logs),'search text or contact data found in participant logs');checks.searchTextNotInParticipantLogs='PASS';
  // The gateway allows 5 quick logins per IP and then one per minute; this is the sixth of the run, so wait for the limiter
  // instead of weakening it (the gateway configuration is not part of this story).
  await page.waitForTimeout(65000);
  await login('browser-admin@example.test');
  await page.goto(origin+'/customers');
  await page.setViewportSize({width:390,height:844});await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible();await page.screenshot({path:resolve(evidence,'customers-mobile.png'),fullPage:true});checks.mobile='PASS';
  console.log('Warm-cache proxy: stopped Sales and stopped Customers, controlled delivery and recovery');
  for(const [name,container,path] of [['sales',sales,'/remotes/sales/assets/remoteEntry.js'],['customers',portal,'/remotes/customers/remoteEntry.js']]) {
    for(let i=0;i<80;i++)assert.equal((await fetch(origin+path)).status,200);
    docker(['stop','--time','10',container]);const started=Date.now();const stopped=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});assert.equal(stopped.status,502);assert.match(stopped.headers.get('cache-control'),/no-store/);
    checks[name+'WarmOutage']={status:502,seconds:(Date.now()-started)/1000};assert.equal((await fetch(origin+'/customers')).status,200);assert.equal((await fetch(origin+'/remotes/products/assets/remoteEntry.js')).status,200);
    if(name==='customers') {
      await page.reload();await expect(page.getByText('Este módulo no está disponible en este momento.',{exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Reintentar módulo'}).waitFor();await page.screenshot({path:resolve(evidence,'customers-unavailable.png'),fullPage:true});
      docker(['start',container]);await page.getByRole('button',{name:'Reintentar módulo'}).click();await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible();checks.browserPortalRecovery='PASS';
    } else docker(['start',container]);
    await wait(async()=> (await fetch(origin+path)).status===200);checks[name+'AssetRecovery']='PASS';
  }
  // 127.0.0.1 is probed against the same stack. This is the seventh login of the run: wait for the gateway limiter (5 quick, then 1/min)
  // and record the login status, so a refused login is never reported as an unsupported origin.
  await page.waitForTimeout(65000);
  const altContext=await browser.newContext({viewport:{width:1280,height:900}}),altPage=await altContext.newPage();
  let altLoginStatus='not attempted';
  try{await altPage.goto(alternateOrigin+'/customers');await expect(altPage).toHaveURL(/\/login/);await altPage.getByLabel('Correo electrónico').fill('browser-admin@example.test');await altPage.getByLabel('Contraseña').fill(passwords.human);
    const altLogin=altPage.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login') && r.request().method()==='POST');
    await altPage.getByRole('button',{name:'Iniciar sesión',exact:true}).click();const altResponse=await altLogin;altLoginStatus=String(altResponse.status());
    if(altResponse.status()===200){const c=await altResponse.json().catch(()=>null);if(c)secrets.push(c.accessToken,c.refreshToken);}   // the body may be gone once the page navigates
    assert.equal(altResponse.status(),200,'login on 127.0.0.1 answered '+altResponse.status());
    await expect(altPage).toHaveURL(alternateOrigin+'/customers',{timeout:20000});await expect(altPage.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible({timeout:20000});await altPage.getByLabel('Buscar por nombre o documento').fill('cobertura');await altPage.getByRole('button',{name:'Buscar cliente',exact:true}).click();await expect(altPage.getByLabel('Resultados de la búsqueda')).toContainText('Cobertura Cliente');checks.origin127001='PASS';}
  catch(e){checks.origin127001=(altLoginStatus==='200'?'NOT SUPPORTED by this Host build (login 200, page failed): ':'INCONCLUSIVE (login '+altLoginStatus+'): ')+redact(e.message).split('\n')[0];await altPage.screenshot({path:resolve(evidence,'origin-127-0-0-1.png')}).catch(()=>{});}
  await altContext.close();
  assert.equal(apiErrors.length,0,redact(apiErrors.join('\n')));checks.noUncaughtBrowserErrors='PASS';
  // API-only additional permission checks do not claim another browser role flow.
  assert.equal((await context.request.get(origin+'/api/v1/customers',{headers:{Authorization:'Bearer '+salesperson.accessToken}})).status(),200);
  result.status='PASS';console.log('Real-service browser acceptance: PASS');
} catch(error) {
  failed=true;result.status='FAIL';result.reason=redact(error.message);console.error('Real acceptance: '+result.reason);
  if(page)await page.screenshot({path:resolve(evidence,'failure.png'),fullPage:true}).catch(()=>{});
} finally {
  await browser?.close();let cleanup=true;
  for(const name of containers.reverse()) {
    const r=docker(['inspect',name],{allowFailure:true});if(r.status!==0)continue;
    const info=JSON.parse(r.stdout)[0];assert.equal(info.Config.Labels['synkro.execution'],owner);
    if(docker(['rm','-fv',name],{allowFailure:true}).status!==0)cleanup=false;
  }
  const net=docker(['network','inspect',owner],{allowFailure:true});if(net.status===0){assert.equal(JSON.parse(net.stdout)[0].Labels['synkro.execution'],owner);if(docker(['network','rm',owner],{allowFailure:true}).status!==0)cleanup=false;}
  for(const image of images) {const r=docker(['image','inspect',image],{allowFailure:true});if(r.status===0 && JSON.parse(r.stdout)[0].Config.Labels['synkro.execution']===owner)if(docker(['image','rm',image],{allowFailure:true}).status!==0)cleanup=false;}
  // Resolve and verify the exact owned temporary directory before recursive removal.
  assert(temporary.startsWith(resolve(root,'.acceptance')+sep) && dirname(temporary)===resolve(root,'.acceptance'));
  if(existsSync(temporary))rmSync(temporary,{recursive:true,force:true});result.cleanup=cleanup?'PASS':'FAIL';if(!cleanup)failed=true;
  writeFileSync(resolve(evidence,'browser-result.json'),JSON.stringify(result,null,2)+'\n');console.log('Owned acceptance cleanup: '+result.cleanup);
}
process.exitCode=failed?1:0;

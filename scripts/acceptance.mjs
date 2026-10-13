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
for(const name of ['synkro-customers-portal','synkro-front','synkro-customers-api','synkro-auth-api','synkro-auth-db','synkro-customers-db','synkro-auth-portal','synkro-api-gateway','synkro-sales-portal','synkro-products-portal']) {
  const source=resolve(workspace,name),ref=['synkro-customers-portal','synkro-front'].includes(name)?'HEAD':'origin/develop'; revisions[name]=command('git',['-C',source,'rev-parse',ref]).stdout.trim();
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
const origin=`http://127.0.0.1:${port}`;
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
  launch('synkro-api-gateway',build('synkro-api-gateway'),{CORS_ALLOWED_ORIGINS:origin,RATE_LIMIT_PER_SECOND:'100'});
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
  await page.getByLabel('Correo electrónico').fill('cliente@example.test');await page.getByRole('button',{name:'Registrar cliente',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reintentar registro'})).toBeVisible();
  const replay=page.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/api/v1/customers'));
  await page.getByRole('button',{name:'Reintentar registro'}).click();const replayResponse=await replay;assert.equal(replayResponse.status(),200);
  assert.equal((await replayResponse.json()).customerId,checks.createdCustomer);assert.deepEqual(writes[0],writes[1]);
  assert.equal(sql('SELECT count(*) FROM customers_schema.customer'),'1');checks.idempotentUncertainRetry='PASS';
  await expect(page).toHaveURL(origin+'/customers/'+checks.createdCustomer);await expect(page.getByRole('heading',{name:'Detalle del cliente'})).toBeVisible();
  const before=await (await context.request.get(origin+'/api/v1/customers/'+checks.createdCustomer,{headers:authorization})).json();
  await page.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Nombre o razón social').fill('Cliente actualizado');await page.getByLabel('Correo electrónico').fill('');
  await page.getByRole('button',{name:'Guardar cambios'}).click();await expect(page.getByText('Cliente actualizado',{exact:true})).toBeVisible();
  const after=await (await context.request.get(origin+'/api/v1/customers/'+checks.createdCustomer,{headers:authorization})).json();
  assert.equal(after.customerId,before.customerId);assert.equal(after.registrationDate,before.registrationDate);assert.equal(after.email,null);checks.detailAndReplacement='PASS';
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
  await page.getByRole('button',{name:'Cerrar sesión'}).click();await expect(page).toHaveURL(/\/login/);const salesperson=await login('browser-sales@example.test');
  await page.goto(origin+'/customers/new');await page.getByLabel('Nombre o razón social').fill('Cliente vendedor');await page.getByLabel('Documento (cédula o NIT)').fill(randomUUID().slice(0,25));await page.getByRole('button',{name:'Registrar cliente',exact:true}).click();await expect(page.getByRole('heading',{name:'Detalle del cliente'})).toBeVisible();checks.salespersonCreate='PASS';
  await page.getByRole('button',{name:'Cerrar sesión'}).click();await expect(page).toHaveURL(/\/login/);const inventory=await login('browser-inventory@example.test');await page.goto(origin+'/customers');await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('synkro-customers-portal')).toHaveCount(0);assert.equal((await context.request.get(origin+'/api/v1/customers',{headers:{Authorization:'Bearer '+inventory.accessToken}})).status(),403);checks.inventoryDenied='PASS';
  // Return using actual public login; all credentials remain ephemeral.
  await page.getByRole('button',{name:'Cerrar sesión'}).click();await expect(page).toHaveURL(/\/login/);await login('browser-admin@example.test');await page.goto(origin+'/customers');await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.setViewportSize({width:390,height:844});await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible();await page.screenshot({path:resolve(evidence,'customers-mobile.png'),fullPage:true});checks.mobile='PASS';
  console.log('Warm-cache proxy: stopped Sales and stopped Customers, controlled delivery and recovery');
  for(const [name,container,path] of [['sales',sales,'/remotes/sales/assets/remoteEntry.js'],['customers',portal,'/remotes/customers/remoteEntry.js']]) {
    for(let i=0;i<80;i++)assert.equal((await fetch(origin+path)).status,200);
    docker(['stop','--time','10',container]);const started=Date.now();const stopped=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});assert.equal(stopped.status,502);
    checks[name+'WarmOutage']={status:502,seconds:(Date.now()-started)/1000};assert.equal((await fetch(origin+'/customers')).status,200);assert.equal((await fetch(origin+'/remotes/products/assets/remoteEntry.js')).status,200);
    if(name==='customers') {
      await page.reload();await expect(page.getByText('Este módulo no está disponible en este momento.',{exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Reintentar módulo'}).waitFor();await page.screenshot({path:resolve(evidence,'customers-unavailable.png'),fullPage:true});
      docker(['start',container]);await page.getByRole('button',{name:'Reintentar módulo'}).click();await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible();checks.browserPortalRecovery='PASS';
    } else docker(['start',container]);
    await wait(async()=> (await fetch(origin+path)).status===200);checks[name+'AssetRecovery']='PASS';
  }
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

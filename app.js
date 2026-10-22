'use strict';
/* Acatianguis v6: mercado compartido con Supabase, cuentas y Storage.
   Proyecto independiente, no oficial de la UNAM. */
const $ = id => document.getElementById(id);
const node = (tag, cls = '', value) => { const el=document.createElement(tag); el.className=cls; if(value!==undefined)el.textContent=value; return el; };
const button = (label, cls, click) => {const el=node('button',cls,label);el.type='button';el.addEventListener('click',click);return el;};
const money = x => '$'+Number(x).toLocaleString('es-MX')+' MXN';
const uid = () => crypto.randomUUID();
const categoryEmoji = c => ({'Libros':'📚','Tecnología':'🧮','Materiales':'📐','Otros':'📦'})[c]||'📦';
const food = [
 {id:'f1',name:'Cocina universitaria A',category:'Comida corrida',emoji:'🍛',price:65,desc:'Menú ficticio: guisado, arroz y agua',location:'Ejemplo de ubicación'},
 {id:'f2',name:'Tacos del campus B',category:'Antojitos',emoji:'🌮',price:35,desc:'Orden ficticia de tacos',location:'Ejemplo de ubicación'},
 {id:'f3',name:'Ensaladas C',category:'Saludable',emoji:'🥗',price:58,desc:'Ensalada del día ficticia',location:'Ejemplo de ubicación'},
 {id:'f4',name:'Café estudiantil D',category:'Bebidas',emoji:'☕',price:28,desc:'Café americano, ejemplo',location:'Ejemplo de ubicación'}
];
const mapPoints={
 biblioteca:{title:'📚 Biblioteca',desc:'Ubicación ilustrativa; verifica en el plano oficial.'},
 teatro:{title:'🎭 Teatro',desc:'Ubicación ilustrativa; verifica en el plano oficial.'},
 cafeteria:{title:'☕ Cafetería',desc:'Referencia ilustrativa a opciones de comida.'},
 deportes:{title:'⚽ Deportes',desc:'Instalaciones deportivas; ubicación ilustrativa.'},
 centro:{title:'📍 Centro',desc:'Punto conceptual, no corresponde a una coordenada real.'}
};
const CONFIG=window.ACATIANGUIS_CONFIG||{};
const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(CONFIG.url||'') &&
  typeof CONFIG.publishableKey==='string' && CONFIG.publishableKey.length>20 && !CONFIG.publishableKey.includes('TU_');
const client=configured && window.supabase ? window.supabase.createClient(CONFIG.url,CONFIG.publishableKey,{auth:{storageKey:'acatianguis-auth-v6'}}) : null;
let currentUser=null, profile=null, contact=null, posts=[], favorites=[], saved=[], currentTab='home',
    foodFilter='Todos', marketFilter='Todos', photoBlob=null, photoPreview=null, editId=null,
    interestPost=null, authMode='login', refreshing=false, toastTimer=null;
try {favorites=JSON.parse(localStorage.getItem('acatianguis_food_favs_v6')||'[]');saved=JSON.parse(localStorage.getItem('acatianguis_saved_v6')||'[]');} catch {}
if(!Array.isArray(favorites))favorites=[];if(!Array.isArray(saved))saved=[];
function persist(key,arr){try{localStorage.setItem(key,JSON.stringify(arr));}catch{}}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3700);}
function displayError(error){console.error(error);toast(error?.message||'No se pudo completar la operación.');}
function cleanPhone(s){const d=String(s||'').replace(/\D/g,'');if(/^\d{10}$/.test(d))return '52'+d;if(/^52\d{10}$/.test(d))return d;return null;}
function owner(p){return !!(currentUser && p.user_id===currentUser.id);}
function sellerName(p){return p.student_profiles?.alias||'Estudiante';}
function whatsappUrl(p,message){return p.contact_whatsapp&&/^52\d{10}$/.test(p.contact_whatsapp)?'https://wa.me/'+p.contact_whatsapp+'?text='+encodeURIComponent(message):null;}
function imageUrl(p){if(!p.image_path||!client)return null;return client.storage.from('acatianguis-products').getPublicUrl(p.image_path).data.publicUrl;}
function modal(id,show){const x=$(id);x.classList.toggle('show',show);x.setAttribute('aria-hidden',String(!show));document.body.style.overflow=document.querySelector('.modal.show')?'hidden':'';if(show){const el=x.querySelector('input:not([type=checkbox]),button.close');if(el)setTimeout(()=>el.focus(),40);}}
function switchTo(id){if(!['home','food','market','map'].includes(id))return;currentTab=id;
  document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));
  document.querySelectorAll('.tab').forEach(x=>{const active=x.dataset.go===id;x.classList.toggle('active',active);if(active)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});
  const titles={home:profile?'¡Hola, '+profile.alias+'!':'¡Pásele, hay de todo!',food:'La comida nos reúne.',market:'Tu tianguis, tus reglas.',map:'Ubícate en Acatlán.'};
  const subtitles={home:'Comida, hallazgos y oportunidades. Todo entre la comunidad de Acatlán.',food:'Opciones ilustrativas para el antojo.',market:'Ofrece lo que tienes, encuentra lo que buscas.',map:'Un mapa conceptual por verificar.'};
  $('welcome-title').textContent=titles[id];$('welcome-subtitle').textContent=subtitles[id];window.scrollTo(0,0);
  if(id==='market'&&client)refreshListings();
}
function setHome(){
  $('total-food').textContent=food.length;
  $('total-posts').textContent=posts.length;
  $('profile-btn').textContent=profile?'👤 '+profile.alias.slice(0,11):currentUser?'👤 Crear perfil':'👤 Entrar';
  if(currentTab==='home')$('welcome-title').textContent=profile?'¡Hola, '+profile.alias+'!':'¡Pásele, hay de todo!';
}
function filters(id,options,active,set){const target=$(id);target.replaceChildren();options.forEach(opt=>{const b=button(opt,'chip'+(active===opt?' active':''),()=>set(opt));b.setAttribute('aria-pressed',String(active===opt));target.append(b);});}
function renderFood(){filters('food-filters',['Todos','Comida corrida','Antojitos','Saludable','Bebidas','Favoritos'],foodFilter,v=>{foodFilter=v;renderFood();});
  const q=$('food-search').value.toLowerCase().trim(),list=$('food-list');list.replaceChildren();
  const rows=food.filter(f=>(foodFilter==='Todos'||(foodFilter==='Favoritos'?favorites.includes(f.id):f.category===foodFilter)) && (f.name+' '+f.desc+' '+f.category).toLowerCase().includes(q));
  if(!rows.length){list.append(node('div','empty','No hay coincidencias.'));return;}
  rows.forEach(f=>{const item=node('article','item'),pic=node('div','item-icon',f.emoji),body=node('div','item-content'),heading=node('div','item-top'),bottom=node('div','item-bottom');
    heading.append(node('h3','',f.name),node('span','pill',f.category));body.append(heading,node('p','',f.desc),node('div','tiny','📍 '+f.location));bottom.append(node('strong','price',money(f.price)));
    bottom.append(button(favorites.includes(f.id)?'★ Guardado':'☆ Guardar','btn small secondary',()=>{favorites=favorites.includes(f.id)?favorites.filter(x=>x!==f.id):[...favorites,f.id];persist('acatianguis_food_favs_v6',favorites);renderFood();}));body.append(bottom);item.append(pic,body);list.append(item);
  });
}
function renderMarket(){filters('market-filters',['Todos','En venta','Se busca','Libros','Tecnología','Materiales','Otros','Guardados','Mis anuncios'],marketFilter,v=>{marketFilter=v;renderMarket();});
  const q=$('market-search').value.trim().toLowerCase(),list=$('market-list');list.replaceChildren();
  $('market-count').textContent=posts.length+' publicaciones';
  if(!client){const e=node('div','empty');e.append(node('strong','','Sin conexión a Supabase'),node('p','','Agrega tu URL y clave publicable en config.js y ejecuta schema.sql.'));list.append(e);return;}
  const items=posts.filter(p=>{
    const match=marketFilter==='Todos'||(marketFilter==='En venta'?p.type==='offer':marketFilter==='Se busca'?p.type==='want':marketFilter==='Guardados'?saved.includes(p.id):marketFilter==='Mis anuncios'?owner(p):p.category===marketFilter);
    return match&&(p.name+' '+p.description+' '+p.category+' '+sellerName(p)).toLowerCase().includes(q);
  });
  if(!items.length){const e=node('div','empty');e.append(node('strong','','Todavía no hay publicaciones'),node('span','','Prueba otro filtro o publica el primer artículo.'));list.append(e);return;}
  for(const p of items){const article=node('article','item product-post'),picture=node('div','item-icon');const src=imageUrl(p);
    if(src){const img=node('img');img.src=src;img.loading='lazy';img.alt='Foto del artículo: '+p.name;picture.append(img);}else picture.textContent=categoryEmoji(p.category);
    const content=node('div','item-content'),top=node('div','item-top');top.append(node('h3','',p.name),node('span','market-kind '+(p.status==='Vendido'?'sold':p.type==='want'?'want':''),p.status==='Vendido'?(p.type==='want'?'Resuelto':'Vendido'):p.type==='want'?'SE BUSCA':'SE VENDE'));
    content.append(top,node('p','',p.description));const details=node('div','market-detail');details.append(node('span','pill',p.category));if(p.type==='offer'&&p.condition)details.append(node('span','pill',p.condition));if(p.zone)details.append(node('span','pill','📍 '+p.zone));content.append(details);
    const line=node('div','seller-line');line.append(node('span','tiny','Anunciante ·'));line.append(button('👤 '+sellerName(p),'seller-link',()=>openSeller(p)));content.append(line);
    const priceLabel=p.type==='want'?'Presupuesto: '+money(p.price):(p.price===0?'Regalo / intercambio':money(p.price));content.append(node('strong','price',priceLabel));
    const actions=node('div','listing-actions');
    if(owner(p)){
      actions.append(button('✎ Editar','btn small secondary',()=>openPost(p.type,p)));
      actions.append(button(p.status==='Vendido'?'↩ Disponible':p.type==='want'?'✓ Resuelto':'✓ Marcar vendido','btn small secondary',()=>toggleStatus(p)));
      if(p.contact_whatsapp)actions.append(button('🟢 Probar WhatsApp','btn small whatsapp-action',()=>openInterest(p)));
      actions.append(button('Eliminar','btn small danger',()=>deleteListing(p)));
    } else {
      actions.append(button(saved.includes(p.id)?'♥ Guardado':'♡ Guardar','btn small secondary',()=>{saved=saved.includes(p.id)?saved.filter(x=>x!==p.id):[...saved,p.id];persist('acatianguis_saved_v6',saved);renderMarket();}));
      if(p.status!=='Vendido')actions.append(button(p.contact_whatsapp?'🟢 Contactar por WhatsApp':'Me interesa','btn small'+(p.contact_whatsapp?' whatsapp-action':''),()=>openInterest(p)));
    }
    content.append(actions);article.append(picture,content);list.append(article);
  }
}
async function refreshListings(){if(!client||refreshing)return;refreshing=true;
  try {const {data,error}=await client.from('market_listings').select('*,student_profiles(alias,career,bio)').order('created_at',{ascending:false}).limit(200);
    if(error)throw error;posts=data||[];renderMarket();setHome();
  }catch(e){console.error('Error leyendo anuncios',e);$('market-notice').textContent='No fue posible consultar las publicaciones. Verifica que hayas ejecutado schema.sql y que Supabase permita el acceso público de lectura.';toast('Error consultando los anuncios de Supabase.');}
  finally{refreshing=false;}
}
async function syncAuth(user){currentUser=user||null;profile=null;contact=null;
  if(currentUser&&client){try{
      const [pr,co]=await Promise.all([
        client.from('student_profiles').select('*').eq('id',currentUser.id).maybeSingle(),
        client.from('student_contacts').select('*').eq('user_id',currentUser.id).maybeSingle()
      ]);
      if(pr.error)throw pr.error;if(co.error)throw co.error;
      profile=pr.data;contact=co.data;
    }catch(e){displayError(e);}
  }
  setHome();renderMarket();
  if($('profile-modal').classList.contains('show'))fillProfileModal();
}
function openProfile(){fillProfileModal();modal('profile-modal',true);}
function fillProfileModal(){const signedIn=!!currentUser;$('auth-section').hidden=signedIn;$('profile-section').hidden=!signedIn;
  if(!signedIn){changeAuthMode(authMode);return;}
  $('profile-summary').replaceChildren(node('div','avatar',profile?.alias?.charAt(0)?.toUpperCase()||'👤'));
  const info=node('div');info.append(node('strong','',profile?.alias||'Configura tu perfil'),node('div','sub',currentUser.email||''),node('div','tiny','Cuenta registrada · Estudiante no verificado'));
  $('profile-summary').append(info);
  $('alias').value=profile?.alias||'';$('career').value=profile?.career||'';$('profile-bio').value=profile?.bio||'';
  $('whatsapp-number').value=contact?.whatsapp_e164?.replace(/^52/,'')||'';
  $('whatsapp-enabled').checked=Boolean(contact?.whatsapp_enabled);$('privacy').checked=false;
}
function changeAuthMode(mode){authMode=mode;$('auth-submit').textContent=mode==='login'?'Entrar a mi cuenta':'Crear cuenta';$('mode-login').classList.toggle('secondary',mode!=='login');$('mode-signup').classList.toggle('secondary',mode!=='signup');
  $('auth-password').autocomplete=mode==='login'?'current-password':'new-password';$('auth-info').textContent=mode==='signup'?'Si la confirmación por correo está activa, tendrás que abrir el enlace de verificación antes de iniciar sesión.':'El correo y la contraseña no serán visibles para otros estudiantes.';
}
async function authSubmit(e){e.preventDefault();if(!client)return toast('Aún no está configurada la conexión.');
  const email=$('auth-email').value.trim(),password=$('auth-password').value;
  if(password.length<8)return toast('Utiliza una contraseña de al menos 8 caracteres.');
  $('auth-submit').disabled=true;
  try{if(authMode==='signup'){
      const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;
      if(data.session){await syncAuth(data.user);fillProfileModal();toast('Cuenta creada. Completa tu perfil.');}
      else {toast('Revisa tu correo para confirmar el registro.');$('auth-info').textContent='Te enviamos instrucciones de confirmación si la dirección puede registrarse. Después vuelve e inicia sesión.';}
    }else{
      const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;
      await syncAuth(data.user);fillProfileModal();toast('Sesión iniciada.');
    }
  }catch(e){displayError(e);}finally{$('auth-submit').disabled=false;}
}
async function submitProfile(e){e.preventDefault();if(!client||!currentUser)return toast('Inicia sesión.');
  const alias=$('alias').value.trim(),career=$('career').value,bio=$('profile-bio').value.trim();
  if(alias.length<2||!career||!$('privacy').checked)return toast('Completa el perfil y acepta el tratamiento de datos.');
  const enabled=$('whatsapp-enabled').checked;
  const phone=cleanPhone($('whatsapp-number').value);
  if(enabled&&!phone)return toast('Escribe un WhatsApp válido de 10 dígitos.');
  $('profile-save').disabled=true;
  try{
    const {error:pErr}=await client.from('student_profiles').upsert({id:currentUser.id,alias,career,bio},{onConflict:'id'});if(pErr)throw pErr;
    const {error:cErr}=await client.from('student_contacts').upsert({user_id:currentUser.id,whatsapp_e164:enabled?phone:null,whatsapp_enabled:enabled},{onConflict:'user_id'});if(cErr)throw cErr;
    await syncAuth(currentUser);await refreshListings();modal('profile-modal',false);toast('¡Tu perfil se guardó en Supabase!');
  }catch(err){displayError(err);}finally{$('profile-save').disabled=false;}
}
async function signOut(){if(!client)return;const {error}=await client.auth.signOut();if(error)return displayError(error);await syncAuth(null);modal('profile-modal',false);toast('Sesión cerrada.');}
function openPost(type='offer',post=null){if(!client)return toast('Primero conecta Supabase en config.js.');
  if(!currentUser){openProfile();toast('Crea una cuenta o inicia sesión para publicar.');return;}
  if(!profile){openProfile();toast('Completa tu perfil para poder publicar.');return;}
  $('post-form').reset();editId=post?.id||null;photoBlob=null;photoPreview=post?imageUrl(post):null;
  $('post-type').value=post?.type||type;$('post-name').value=post?.name||'';$('post-category').value=post?.category||'Libros';$('post-price').value=post?.price??'';
  $('post-condition').value=post?.condition||'Buen estado';$('post-zone').value=post?.zone||'';$('post-description').value=post?.description||'';
  $('post-heading').textContent=post?'Editar mi artículo':type==='want'?'Publicar lo que busco':'Poner mi artículo a la venta';updateType();showPhoto();modal('post-modal',true);
}
function updateType(){const want=$('post-type').value==='want';$('condition-group').hidden=want;$('photo-group').hidden=want;$('price-label').textContent=want?'Presupuesto máximo (MXN)':'Precio (MXN)';$('post-submit').textContent=editId?'Guardar cambios':want?'Publicar solicitud':'Publicar artículo';}
function showPhoto(){const preview=$('photo-preview');preview.replaceChildren();preview.hidden=!photoPreview;if(photoPreview){const img=node('img');img.src=photoPreview;img.alt='Vista previa del artículo';preview.append(img);}}
async function processPhoto(file){if(!file)return;
  if(file.size>5*1024*1024)return toast('Usa una fotografía de máximo 5 MB.');
  try {const url=URL.createObjectURL(file),img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
    const max=850,scale=Math.min(1,max/Math.max(img.naturalHeight,img.naturalWidth)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);
    photoBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.74));
    if(!photoBlob||photoBlob.size>2*1024*1024)throw Error('No se pudo comprimir la fotografía.');
    photoPreview=URL.createObjectURL(photoBlob);showPhoto();toast('Fotografía lista para subir.');
  }catch(e){displayError(e);}
}
async function uploadPhoto(){if(!photoBlob||!client||!currentUser)return null;
  const path=currentUser.id+'/'+uid()+'.jpg';const {error}=await client.storage.from('acatianguis-products').upload(path,photoBlob,{cacheControl:'3600',contentType:'image/jpeg',upsert:false});
  if(error)throw error;return path;
}
async function submitPost(e){e.preventDefault();if(!currentUser||!profile)return toast('Inicia sesión y completa tu perfil.');
  const type=$('post-type').value,name=$('post-name').value.trim(),price=Number($('post-price').value),description=$('post-description').value.trim();
  if(name.length<2||description.length<3||!Number.isInteger(price)||price<0||price>100000)return toast('Revisa título, descripción y precio entero.');
  const previous=editId?posts.find(p=>p.id===editId&&owner(p)):null;
  if(editId&&!previous)return toast('No puedes editar esa publicación.');
  $('post-submit').disabled=true;let newPhoto=null;
  try{
    if(type==='offer'&&photoBlob)newPhoto=await uploadPhoto();
    const payload={user_id:currentUser.id,type,name,category:$('post-category').value,price,description,
      condition:type==='want'?null:$('post-condition').value,zone:$('post-zone').value,
      status:previous?.status||'Disponible',image_path:type==='want'?null:(newPhoto||previous?.image_path||null)};
    const result=previous?await client.from('market_listings').update(payload).eq('id',previous.id):await client.from('market_listings').insert(payload);
    if(result.error)throw result.error;
    // Retira fotografía anterior sólo cuando la nueva escritura ya fue exitosa.
    if(previous?.image_path&&(newPhoto||type==='want'))client.storage.from('acatianguis-products').remove([previous.image_path]).then(()=>{});
    modal('post-modal',false);editId=null;photoBlob=null;marketFilter='Todos';$('market-search').value='';await refreshListings();switchTo('market');
    toast(previous?'¡Anuncio actualizado para todos!':'¡Tu anuncio ya es visible para todos!');
  }catch(err){if(newPhoto)await client.storage.from('acatianguis-products').remove([newPhoto]);displayError(err);}finally{$('post-submit').disabled=false;}
}
async function toggleStatus(p){if(!owner(p))return;
  const next=p.status==='Vendido'?'Disponible':'Vendido';const {error}=await client.from('market_listings').update({status:next}).eq('id',p.id);if(error)return displayError(error);
  await refreshListings();toast('Estado actualizado en todos los dispositivos.');
}
async function deleteListing(p){if(!owner(p)||!confirm('¿Eliminar este anuncio para todos los estudiantes?'))return;
  const {error}=await client.from('market_listings').delete().eq('id',p.id);if(error)return displayError(error);
  if(p.image_path)client.storage.from('acatianguis-products').remove([p.image_path]).then(()=>{});
  saved=saved.filter(id=>id!==p.id);persist('acatianguis_saved_v6',saved);await refreshListings();toast('Anuncio eliminado.');
}
function openSeller(p){const target=$('seller-body');target.replaceChildren();const heading=node('div','profilerow'),av=node('div','avatar',sellerName(p).charAt(0).toUpperCase()),details=node('div');
  details.append(node('strong','',sellerName(p)),node('div','sub',p.student_profiles?.career||'Carrera no especificada'),node('div','tiny','Cuenta de la plataforma · Identidad estudiantil NO verificada'));heading.append(av,details);target.append(heading);
  if(p.student_profiles?.bio)target.append(node('p','profile-notice',p.student_profiles.bio));
  target.append(node('p','hint','Nunca entregues dinero por adelantado a personas desconocidas. Acuerda entregas en lugares públicos.'));
  if(p.contact_whatsapp)target.append(button('🟢 Contactar por WhatsApp','btn full whatsapp-action',()=>{modal('seller-modal',false);openInterest(p);}));
  const list=posts.filter(x=>x.user_id===p.user_id);target.append(node('h3','','Publicaciones ('+list.length+')'));
  list.forEach(x=>target.append(node('p','sub',(x.type==='want'?'🔎 Busco: ':'📦 Vendo: ')+x.name)));
  modal('seller-modal',true);
}
function openInterest(p){interestPost=p;const intro=profile?.alias?'Hola, soy '+profile.alias+'. ':'Hola. ';
  $('interest-message').value=intro+'Vi tu publicación en Acatianguis sobre '+p.name+'. ¿Sigue disponible? Podemos acordar los detalles y la entrega en un lugar público de la facultad.';
  $('interest-recap').replaceChildren(node('strong','',p.name),node('p','sub','Publicado por '+sellerName(p)+' · '+money(p.price)));
  const link=$('interest-whatsapp');link.hidden=!p.contact_whatsapp;link.removeAttribute('href');
  $('interest-info').textContent=p.contact_whatsapp?'Se abrirá WhatsApp. El teléfono del anunciante se verá al abrir la conversación.':'El anunciante no activó WhatsApp. Puedes copiar el mensaje, pero no se enviará desde Acatianguis.';
  modal('interest-modal',true);
}
function launchWhatsApp(e){const message=$('interest-message').value.trim(),url=interestPost&&whatsappUrl(interestPost,message);
  if(!url||!message){e.preventDefault();return toast('No hay un WhatsApp público o falta el mensaje.');}
  // Establece el enlace en la misma interacción del usuario, sin abrir ventanas automáticas.
  $('interest-whatsapp').href=url;
}
async function copyInterest(){const message=$('interest-message').value.trim();if(!message)return toast('Escribe un mensaje primero.');
  try{await navigator.clipboard.writeText(message);toast('Mensaje copiado, sin enviar.');}
  catch{$('interest-message').focus();$('interest-message').select();toast('Selecciona y copia el mensaje manualmente.');}
}
function init(){
  if(!client){$('market-notice').textContent='⚠️ Falta configurar Supabase. Los anuncios compartidos estarán disponibles cuando completes config.js y ejecutes schema.sql.';}
  document.querySelectorAll('[data-go]').forEach(x=>x.addEventListener('click',()=>switchTo(x.dataset.go)));
  $('profile-btn').addEventListener('click',openProfile);$('profile-tile').addEventListener('click',openProfile);
  $('home-cta').addEventListener('click',()=>switchTo('market'));$('home-publish').addEventListener('click',()=>openPost('offer'));
  $('publish').addEventListener('click',()=>openPost('offer'));$('market-sell').addEventListener('click',()=>openPost('offer'));$('market-want').addEventListener('click',()=>openPost('want'));
  document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>modal(x.dataset.close,false)));
  document.querySelectorAll('.modal').forEach(x=>x.addEventListener('click',e=>{if(e.target===x)modal(x.id,false);}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal.show').forEach(x=>modal(x.id,false));});
  $('food-search').addEventListener('input',renderFood);$('market-search').addEventListener('input',renderMarket);
  $('post-image').addEventListener('change',e=>processPhoto(e.target.files?.[0]));$('post-type').addEventListener('change',updateType);
  $('auth-form').addEventListener('submit',authSubmit);$('mode-login').addEventListener('click',()=>changeAuthMode('login'));$('mode-signup').addEventListener('click',()=>changeAuthMode('signup'));
  $('profile-form').addEventListener('submit',submitProfile);$('sign-out').addEventListener('click',signOut);$('post-form').addEventListener('submit',submitPost);
  $('interest-whatsapp').addEventListener('click',launchWhatsApp);$('interest-copy').addEventListener('click',copyInterest);
  document.querySelectorAll('[data-pin]').forEach(x=>x.addEventListener('click',()=>{const pt=mapPoints[x.dataset.pin];document.querySelectorAll('[data-pin]').forEach(el=>el.classList.toggle('selected',el===x));$('map-detail').replaceChildren(node('strong','',pt.title),node('p','sub',pt.desc));}));
  renderFood();renderMarket();setHome();
  if(client){client.auth.getUser().then(({data,error})=>{if(error)console.warn(error);syncAuth(data?.user||null);});
    client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>syncAuth(session?.user||null),0);});
    refreshListings();
    setInterval(()=>{if(document.visibilityState==='visible')refreshListings();},45000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshListings();});
  }
  if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

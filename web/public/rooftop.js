/* Interactive SVG rooftop, laid out from the owner's numbered seat plan. */
"use strict";
globalThis.RooftopScene = (() => {
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const project = (x, y, z = 0) => [575 + (x - y) * 27, 130 + (x + y) * 13.5 - z * 24];
  const points = vertices => vertices.map(v => project(...v).map(n => n.toFixed(1)).join(',')).join(' ');
  const poly = (v, color, extra = '') => `<polygon points="${points(v)}" fill="${color}" ${extra}/>`;
  function box(x,y,z,w,d,h,colors) {
    return poly([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]],colors[1]) +
      poly([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]],colors[2]) +
      poly([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],colors[0]);
  }
  function disk(x,y,z,rx,ry,color,extra='') {
    return poly(Array.from({length:32},(_,i)=>[x+Math.cos(i*Math.PI/16)*rx,y+Math.sin(i*Math.PI/16)*ry,z]),color,extra);
  }
  function line(a,b,color,width=2,extra='') {
    const [x1,y1]=project(...a),[x2,y2]=project(...b);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`;
  }
  function plant(x,y) {
    const [px,py]=project(x,y);
    return `<g transform="translate(${px},${py})" aria-hidden="true"><path d="M-12-17h24l-3 24h-18z" fill="#b4704d"/><ellipse cy="-17" rx="12" ry="5" fill="#d79868"/><path d="M0-14v-49M0-24q-29-5-22-23 20 1 22 23M0-33q28-4 23-24-20 3-23 24M0-46q-19-11-10-27 13 8 10 27" stroke="#4b7953" stroke-width="3" fill="#719a68"/></g>`;
  }
  function railing(a,b) {
    let out=line([a[0],a[1],1.55],[b[0],b[1],1.55],'#374447',4);
    const count=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])*1.7);
    for(let i=0;i<=count;i++) {const t=i/count,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;out+=line([x,y,.05],[x,y,1.55],'#424849',2);}
    return out;
  }
  function lights(a,b,count=12) {
    const p=project(...a),q=project(...b); let out=`<path d="M${p} Q${(p[0]+q[0])/2},${(p[1]+q[1])/2+24} ${q}" stroke="#6e6657" stroke-width="2" fill="none"/>`;
    for(let i=0;i<=count;i++){const t=i/count,x=p[0]+(q[0]-p[0])*t,y=p[1]+(q[1]-p[1])*t+48*t*(1-t);out+=`<circle cx="${x}" cy="${y}" r="10" fill="#ffcf64" opacity=".12"/><circle cx="${x}" cy="${y}" r="3.7" fill="#ffe3a0"/>`;}
    return out;
  }
  function chair(x,y,busy,stool=false) {
    const colors=busy?['#e9a16e','#a86143','#88503a']:['#bb9976','#896748','#705139'];
    return box(x-.23,y-.23,.08,.46,.46,.53,colors)+(stool?'':box(x-.23,y+.15,.6,.46,.1,.55,colors));
  }
  const muted = (order,filter) => filter==='busy'&&!order||filter==='free'&&!!order;
  function nightSky() {
    // Fixed coordinates keep the stars in place when a table or bill refreshes.
    let seed = 82741;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    let stars = '';
    for (let i = 0; i < 200; i++) {
      const x = 65 + random() * 1320, y = -149 + random() * 370;
      const radius = .65 + random() * 1.45, opacity = .3 + random() * .65;
      stars += `<circle class="sky-star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(2)}" fill="${i % 4 ? '#eef4ff' : '#ffe9b8'}" opacity="${opacity.toFixed(2)}" style="--star-opacity:${opacity.toFixed(2)};animation-delay:${-(i % 13)}s;animation-duration:${5 + i % 6}s"/>`;
      if (i % 19 === 0) stars += `<path d="M${x-4},${y}h8M${x},${y-4}v8" stroke="#e8f0ff" stroke-width=".7" opacity=".55"/>`;
    }
    return `<g class="rooftop-sky" aria-hidden="true" pointer-events="none"><rect x="50" y="-160" width="1350" height="1010" fill="url(#rooftop-night)"/><ellipse cx="430" cy="-35" rx="570" ry="210" fill="url(#rooftop-stardust)" transform="rotate(-12 430 -35)"/><ellipse cx="1070" cy="95" rx="440" ry="130" fill="url(#rooftop-horizon)"/>${stars}<g class="sky-moon" transform="translate(1340 -35)"><circle r="94" fill="url(#rooftop-moonlight)"/><circle r="48" fill="#f8edc7" opacity=".045"/><circle r="31" fill="url(#rooftop-moon)"/><path d="M-16-24A29 29 0 0 0-13 27A31 31 0 0 1-16-24" fill="#fff9e6" opacity=".65"/><g fill="#cfbf91" opacity=".25"><circle cx="-10" cy="-8" r="7"/><circle cx="12" cy="7" r="5"/><circle cx="-3" cy="17" r="3.5"/><circle cx="11" cy="-17" r="3"/></g></g></g>`;
  }
  function table(s,order,selected,filter) {
    const {id,x,y,shape,seats}=s,busy=!!order,isBar=shape==='bar';
    const [cx,cy]=project(x,y,isBar?1.05:1.35),rx=shape==='square'?1.25:shape==='oval'?1.4:.78,ry=shape==='square'?1.05:shape==='oval'?.85:.78;
    let furniture='';
    if(isBar) furniture=chair(x,y,busy,true)+disk(x,y,.68,.48,.48,busy?'#e5a47d':'#a4b695');
    else {
      const chairs=seats===4?[[x-.8,y-ry-.55],[x+.8,y-ry-.55],[x-.8,y+ry+.55],[x+.8,y+ry+.55]]:s.chairAxis==='x'?[[x-rx-.5,y],[x+rx+.5,y]]:[[x,y-ry-.5],[x,y+ry+.5]];
      furniture=chairs.map(p=>chair(...p,busy)).join('')+disk(x,y,.02,rx+.5,ry+.45,'#5d4735','opacity=".12"')+box(x-.1,y-.1,.08,.2,.2,1.05,['#986849','#785239','#65452f']);
      furniture+=shape==='square'?box(x-rx,y-ry,1.1,rx*2,ry*2,.18,['#718faf','#4c6b8d','#405d7e']):disk(x,y,1.09,rx,ry,shape==='oval'?'#5d83a0':'#496e9e')+disk(x,y,1.25,rx,ry,shape==='oval'?'#93b9d0':'#688fbe');
      if(busy) {const p=project(x+.4,y-.3,1.29);furniture+=`<ellipse cx="${p[0]}" cy="${p[1]}" rx="7" ry="3" fill="#fff1d5"/>`;}
    }
    const label=SeatPlan.shortLabel(id),name=SeatPlan.label(id),priceY=isBar?cy-50:cy+40;
    return `<g id="scene-table-${id}" data-scene-table="${id}" data-seat-label="${label}" data-seat-shape="${shape}" class="scene-table${selected===id?' is-selected':''}${muted(order,filter)?' is-muted':''}" role="button" tabindex="${muted(order,filter)?-1:0}" aria-label="${e(name)} ${busy?'กำลังขาย '+e(order.cusName||'')+' ยอด '+money(order.total)+' บาท':'ว่าง'}" aria-pressed="${selected===id}"><title>${e(name)} · ${busy?e(order.cusName||'ไม่ระบุชื่อ')+' · '+money(order.total)+' บาท':'ว่าง — คลิกเพื่อเปิดการขาย'}</title><ellipse class="table-selection" cx="${cx}" cy="${cy+26}" rx="${isBar?34:59}" ry="${isBar?20:31}" fill="#fff3bb" fill-opacity=".22" stroke="#ffe3a0" stroke-width="3" stroke-dasharray="5 5"/>${furniture}<rect x="${cx-(isBar?22:21)}" y="${cy-15}" width="${isBar?44:42}" height="30" rx="12" fill="${busy?'#cf7656':'#fff9e9'}" stroke="${busy?'#f7b685':'#d7bb87'}" stroke-width="2"/><text x="${cx}" y="${cy+7}" text-anchor="middle" font-size="${isBar?19:21}" font-weight="800" fill="${busy?'#fff9e8':'#294352'}">${label}</text>${busy?`<rect x="${cx-41}" y="${priceY}" width="82" height="24" rx="12" fill="#fff9e9"/><text x="${cx}" y="${priceY+17}" text-anchor="middle" font-size="13" font-weight="700" fill="#8b523b">฿ ${money(order.total)}</text>`:''}</g>`;
  }
  function scene(orders=[],selected=1,filter='all',animations=[]) {
    const occupied=new Map(orders.map(o=>[Number(o.tableNo),o]));
    let tiles='',city='';
    for(let i=0;i<30;i++){const h=24+(i*29%100);city+=`<rect x="${i*50-15}" y="${148-h}" width="${29+i%4*5}" height="${h}" fill="${i%2?'#253c49':'#29414d'}" rx="2"/>`;for(let n=0;n<4;n++)city+=`<rect x="${i*50-8+n%2*12}" y="${140-h+Math.floor(n/2)*19}" width="4" height="6" fill="#c4aa70" opacity=".4"/>`;}
    for(let x=0;x<=26;x++)tiles+=line([x,0,.01],[x,17,.01],'#b88c61',1,'opacity=".23"');
    for(let y=0;y<=17;y++)tiles+=line([0,y,.01],[26,y,.01],'#b88c61',1,'opacity=".23"');
    const seats=SeatPlan.entries(orders).filter(s=>s.shape!=='extra').sort((a,b)=>(a.x+a.y)-(b.x+b.y));
    const phases=new Map(animations.map(a=>[a.order.id,a]));
    const guests=seats.map(s=>{const order=occupied.get(s.id),phase=phases.get(order?.id);if(muted(order,filter))return '';return GuestAnimation.render(s,order,phase,project);}).join('')+
      animations.filter(a=>a.type==='leaving').map(a=>{const s=seats.find(s=>s.id===Number(a.order.tableNo));return s?GuestAnimation.render(s,a.order,a,project):'';}).join('');
    const roof=[[.4,4.5,4.3],[6,4.5,4.3],[6,9,4.3],[14,9,4.3],[14,14.6,4.3],[.4,14.6,4.3]];
    const sign=project(2.7,9,2.8);
    const background=box(0,0,-1.4,26,17,1.4,['#ddbb8c','#625046','#51453f'])+tiles+
      railing([0,0],[26,0])+railing([0,0],[0,17])+railing([26,0],[26,17]);
    const roofwork=poly(roof,'#d08d56','opacity=".2" stroke="#c19264" stroke-width="3"')+
      [[.4,4.5],[.4,14.6],[6,4.5],[6,14.6],[14,9],[14,14.6]].map(([x,y])=>box(x,y,0,.12,.12,4.2,['#a27b54','#796046','#614e3a'])).join('')+
      [4.5,6,7.5,9,10.5,12,13.5,14.6].map(y=>line([.4,y,4.35],[y<9?6:14,y,4.35],'#aa7d50',3,'opacity=".7"')).join('');
    const frontCounter=box(1,16.1,0,21.6,.65,1.35,['#8a7556','#544b39','#473e30'])+line([1,16.1,1.42],[22.6,16.1,1.42],'#efc45e',5);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="50 -160 1350 1010" class="restaurant-svg rooftop-svg" aria-label="ผังดาดฟ้า The Cottage Sky Bar: โต๊ะ 1 ถึง 11 และบาร์ B1 ถึง B8"><defs><linearGradient id="rooftop-night" x2="0" y2="1"><stop stop-color="#080f29"/><stop offset=".35" stop-color="#192b48"/><stop offset="1" stop-color="#364b51"/></linearGradient><radialGradient id="rooftop-stardust"><stop stop-color="#8e87ca" stop-opacity=".17"/><stop offset=".5" stop-color="#7189bd" stop-opacity=".055"/><stop offset="1" stop-color="#7189bd" stop-opacity="0"/></radialGradient><radialGradient id="rooftop-horizon"><stop stop-color="#d6a576" stop-opacity=".13"/><stop offset="1" stop-color="#d6a576" stop-opacity="0"/></radialGradient><radialGradient id="rooftop-moonlight"><stop stop-color="#fff3c3" stop-opacity=".22"/><stop offset=".4" stop-color="#f7e8b7" stop-opacity=".07"/><stop offset="1" stop-color="#f7e8b7" stop-opacity="0"/></radialGradient><radialGradient id="rooftop-moon" cx=".3" cy=".25"><stop stop-color="#fffbea"/><stop offset="1" stop-color="#e4d2a2"/></radialGradient><radialGradient id="rooftop-warm"><stop stop-color="#f7d69b" stop-opacity=".25"/><stop offset="1" stop-color="#f7d69b" stop-opacity="0"/></radialGradient></defs>${nightSky()}${city}<ellipse cx="720" cy="520" rx="570" ry="300" fill="#0a1924" opacity=".35"/><g aria-hidden="true" pointer-events="none">${background}${box(.8,7,0,1.1,4.8,1.9,['#729668','#4b6750','#3f5843'])}${frontCounter}${roofwork}<g transform="translate(${sign})"><rect x="-63" y="-38" width="126" height="55" rx="8" fill="#234b3c" stroke="#d6b96e" stroke-width="2"/><text text-anchor="middle" y="-15" font-size="14" font-weight="800" fill="#ffe2a0">THE COTTAGE</text><text text-anchor="middle" y="5" font-size="12" letter-spacing="2" fill="#ffe2a0">SKY BAR</text></g>${plant(1,1)}${plant(25,1)}${plant(25.3,15.8)}${plant(.8,15.5)}<ellipse cx="720" cy="485" rx="510" ry="230" fill="url(#rooftop-warm)"/></g>${seats.map(s=>table(s,occupied.get(s.id),selected,filter)).join('')}${guests}<g aria-hidden="true" pointer-events="none">${railing([0,17],[26,17])}${lights([0,0,3.9],[26,0,3.9],24)}${lights([26,0,3.9],[26,17,3.9],17)}${lights([.5,4.5,4.5],[14,9,4.5],15)}${lights([0,17,2.8],[26,17,2.8],24)}${line([0,17,-.2],[26,17,-.2],'#e3b750',5)}<g transform="translate(106 795)"><text font-size="20" font-weight="800" letter-spacing="2" fill="#efd79e">THE COTTAGE SKY BAR</text><text y="29" font-size="14" fill="#b7c7c8">ROOFTOP · 11 TABLES + 8 BAR SEATS</text></g></g></svg>`;
  }
  function extras(orders=[],selected=1,filter='all',capacity=20,animations=[]) {
    const occupied=new Map(orders.map(o=>[Number(o.tableNo),o]));
    return SeatPlan.entries(orders,capacity).filter(s=>s.shape==='extra').map(s=>{
      const order=occupied.get(s.id),phase=animations.find(a=>order?a.order.id===order.id:Number(a.order.tableNo)===s.id&&a.type==='leaving'),hidden=muted(order,filter);
      return `<button id="scene-table-${s.id}" data-scene-table="${s.id}" data-seat-shape="extra" class="room-extra-table scene-table${selected===s.id?' is-selected':''}${hidden?' is-muted':''}" tabindex="${hidden?-1:0}" aria-pressed="${selected===s.id}"><strong>${e(SeatPlan.label(s.id))}</strong><span>${order?'กำลังขาย · ฿ '+money(order.total):'ว่าง · เปิดการขายได้'}</span>${GuestAnimation.extra(order||phase?.order,phase)}</button>`;
    }).join('');
  }
  return { scene, extras };
})();

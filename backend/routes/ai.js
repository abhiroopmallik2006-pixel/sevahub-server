const express=require('express');
const pool=require('../config');
const {auth}=require('../middleware/auth');
const {reply}=require('../services/aiProvider');
const {notify}=require('../utils/notifications');
const router=express.Router();

const bookingSessions=new Map();
const SESSION_TTL_MS=30*60*1000;

const SERVICE_RULES=[
  {name:'Pest Control',rx:/\b(pest|termite|cockroach|mosquito|bedbug|bed bug|ants)\b/i},
  {name:'Carpenter',rx:/\b(carpenter|bed|palang|charpai|furniture|wood|wooden|door|almirah|wardrobe|table|chair|cabinet|sofa)\b/i},
  {name:'Plumbing',rx:/\b(plumb|plumber|sink|tap|nal|pipe|leak|leaking|drain|toilet|flush|paani)\b/i},
  {name:'Electrician',rx:/\b(electric|electrician|fan|switch|socket|wiring|light|bulb|mcb|power)\b/i},
  {name:'AC Repair',rx:/\b(ac|air conditioner|cooling|compressor)\b/i},
  {name:'Appliance Repair',rx:/\b(fridge|refrigerator|washing machine|microwave|oven|geyser|appliance|mixer|ro|dishwasher)\b/i},
  {name:'Cleaning',rx:/\b(clean|cleaning|safai|dust|deep clean|housekeeping)\b/i},
  {name:'Painting',rx:/\b(paint|painting|wall colour|wall color|putty)\b/i},
  {name:'Home Shifting',rx:/\b(shift|shifting|moving|packing|unpacking|movers|packers)\b/i},
  {name:'Computer/Laptop Repair',rx:/\b(laptop|computer|desktop|pc|printer)\b/i},
  {name:'Beauty & Grooming',rx:/\b(beauty|grooming|salon|haircut|hair cut|makeup)\b/i}
];

const SERVICE_ICONS={
  'Cleaning':'🧹','Plumbing':'🔧','Electrician':'⚡','AC Repair':'❄️','Appliance Repair':'🔌',
  'Beauty & Grooming':'💇','Painting':'🎨','Carpenter':'🪚','Home Shifting':'📦',
  'Pest Control':'🐜','Computer/Laptop Repair':'💻','Other':'📌'
};

async function getServices(){
  const [rows]=await pool.query('SELECT id,name,base_price FROM services ORDER BY id');
  return rows;
}

function normalized(s){return String(s||'').trim().toLowerCase()}
function isCancelMessage(message){return /^(cancel|stop|quit|rehne do|rehne de|chhodo|chodo|cancel booking|start over|reset)$/i.test(String(message||'').trim())}
function isBookingIntent(message){
  const q=String(message||'').toLowerCase();
  if(/\b(book|booking)\b/.test(q)&&!(/\b(status|history|details|show|check|my booking|my bookings)\b/.test(q)))return true;
  return /\b(book|booking)\b.{0,25}\b(kar|kr|karwa|karwana|karni|create|chahiye)\b/.test(q)||
    /\b(karwa do|karwa de|krwa do|krwa de|karwani hai|krwani hai|service chahiye|worker chahiye|professional chahiye)\b/.test(q)||
    /\bneed\s+(a\s+)?(worker|service|professional)\b/.test(q);
}
function hasProblemSignal(message){
  return /\b(kharab|toot|toota|tooti|broken|repair|fix|leak|leaking|slow|issue|problem|damage|damaged|loose|awaaz|noise|nahi chal|nhi chal|band hai|chahiye|karwani|karwana|clean|safai|cooling|termite|cockroach|shift|moving)\b/i.test(String(message||''));
}
function detectServiceName(message){
  const q=String(message||'');
  const rule=SERVICE_RULES.find(r=>r.rx.test(q));
  if(rule)return rule.name;
  const lower=normalized(q);
  if(lower.includes('other service')||lower==='other')return 'Other';
  return null;
}

function sessionFor(userId){
  const key=String(userId);
  const s=bookingSessions.get(key);
  if(!s)return null;
  if(Date.now()-Number(s.updatedAt||0)>SESSION_TTL_MS){bookingSessions.delete(key);return null;}
  s.updatedAt=Date.now();
  return s;
}
function saveSession(userId,s){s.updatedAt=Date.now();bookingSessions.set(String(userId),s);return s}
function clearSession(userId){bookingSessions.delete(String(userId))}

function distanceKm(aLat,aLng,bLat,bLng){
  const toRad=n=>n*Math.PI/180,R=6371;
  const dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);
  const v=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(v),Math.sqrt(1-v));
}

async function findService(name){
  const [rows]=await pool.query('SELECT id,name,base_price FROM services WHERE LOWER(name)=LOWER(?) LIMIT 1',[name]);
  return rows[0]||null;
}

async function getWorkersForService(serviceId,userId){
  const [rows]=await pool.query(`
    SELECT w.id worker_id,w.user_id worker_user_id,u.full_name,w.experience_years,w.service_area,
           w.rating,w.total_reviews,w.working_hours,ws.price service_price
    FROM worker_services ws
    JOIN workers w ON w.id=ws.worker_id
    JOIN users u ON u.id=w.user_id
    WHERE ws.service_id=?
    ORDER BY w.rating DESC,w.total_reviews DESC,ws.price ASC
    LIMIT 20`,[serviceId]);

  if(!rows.length)return [];

  try{
    const ids=[Number(userId),...rows.map(r=>Number(r.worker_user_id))];
    const [locs]=await pool.query(`SELECT user_id,latitude,longitude,sharing_enabled,updated_at FROM user_locations WHERE user_id IN (?) AND sharing_enabled=TRUE`,[ids]);
    const map=new Map(locs.map(l=>[Number(l.user_id),l]));
    const mine=map.get(Number(userId));
    const liveEnough=l=>l&&(Date.now()-new Date(l.updated_at).getTime())<=5*60*1000;
    if(liveEnough(mine)){
      rows.forEach(w=>{
        const loc=map.get(Number(w.worker_user_id));
        if(liveEnough(loc))w.distance_km=Number(distanceKm(Number(mine.latitude),Number(mine.longitude),Number(loc.latitude),Number(loc.longitude)).toFixed(2));
      });
      rows.sort((a,b)=>{
        const ad=Number.isFinite(a.distance_km)?a.distance_km:Infinity;
        const bd=Number.isFinite(b.distance_km)?b.distance_km:Infinity;
        if(ad!==bd)return ad-bd;
        return Number(b.rating||0)-Number(a.rating||0);
      });
    }
  }catch(e){/* location table may not exist yet; worker list still works */}

  return rows.slice(0,8);
}

function workerListText(service,workers){
  const icon=SERVICE_ICONS[service.name]||'🛠️';
  const lines=workers.map((w,i)=>{
    const rating=Number(w.rating||0)>0?`⭐ ${Number(w.rating).toFixed(1)}`:'New worker';
    const distance=Number.isFinite(w.distance_km)?` · 📍 ${w.distance_km} km`:' ';
    const exp=Number(w.experience_years||0)>0?` · ${Number(w.experience_years)} yr exp`:'';
    const area=w.service_area?` · ${w.service_area}`:'';
    return `${i+1}. ${w.full_name} — ₹${Number(w.service_price).toLocaleString('en-IN')} · ${rating}${distance}${exp}${area}`;
  }).join('\n');
  return `${icon} Ye **${service.name}** ka kaam lag raha hai. SevaHub starting price ₹${Number(service.base_price||0).toLocaleString('en-IN')} hai.\n\nAvailable workers:\n${lines}\n\nKaunsa worker chahiye? Number (jaise 1/2) ya worker ka naam bol do.`;
}

function chooseWorker(message,workers){
  const q=normalized(message);
  const ordinals={first:1,pehla:1,pehli:1,second:2,dusra:2,dusri:2,third:3,teesra:3,chautha:4,fourth:4,fifth:5,paanchva:5};
  for(const [word,n] of Object.entries(ordinals))if(new RegExp(`\\b${word}\\b`,'i').test(q)&&workers[n-1])return workers[n-1];
  const nMatch=q.match(/(?:^|\b)(\d{1,2})(?:\b|$)/);
  if(nMatch){const n=Number(nMatch[1]);if(n>=1&&n<=workers.length)return workers[n-1];}
  const byName=workers.filter(w=>q.includes(normalized(w.full_name))||normalized(w.full_name).includes(q));
  if(byName.length===1)return byName[0];
  return null;
}

function istToday(){
  const d=new Date(Date.now()+330*60*1000);
  return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate()};
}
function dateString(y,m,d){return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function validCalendarDate(y,m,d){
  const x=new Date(Date.UTC(y,m-1,d));
  return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d;
}
function addDaysToToday(days){
  const t=istToday(),x=new Date(Date.UTC(t.y,t.m-1,t.d+days));
  return dateString(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate());
}
function parseBookingDate(message){
  const q=normalized(message);
  if(/\b(today|aaj)\b/.test(q))return addDaysToToday(0);
  if(/\b(tomorrow|kal)\b/.test(q))return addDaysToToday(1);

  let m=q.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if(m){const y=+m[1],mo=+m[2],d=+m[3];if(validCalendarDate(y,mo,d))return dateString(y,mo,d);}
  m=q.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
  if(m){const d=+m[1],mo=+m[2],y=+m[3];if(validCalendarDate(y,mo,d))return dateString(y,mo,d);}

  const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  m=q.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/);
  if(m){
    const t=istToday(),d=+m[1],mo=months[m[2]],y=m[3]?+m[3]:t.y;
    let out=validCalendarDate(y,mo,d)?dateString(y,mo,d):null;
    if(out&&out<dateString(t.y,t.m,t.d)&&!m[3]&&validCalendarDate(y+1,mo,d))out=dateString(y+1,mo,d);
    if(out)return out;
  }
  return null;
}

function parseBookingTime(message){
  const q=normalized(message);
  let m=q.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if(m){
    let h=+m[1],min=+(m[2]||0);if(h<1||h>12||min>59)return null;
    if(m[3]==='pm'&&h!==12)h+=12;if(m[3]==='am'&&h===12)h=0;
    return {time:`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`,ambiguous:false};
  }
  m=q.match(/\b(\d{1,2}):(\d{2})\b/);
  if(m){const h=+m[1],min=+m[2];if(h<=23&&min<=59)return {time:`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`,ambiguous:false};}
  m=q.match(/\b(\d{1,2})\s*baje\b/);
  if(m){
    let h=+m[1];if(h<1||h>23)return null;
    if(/\b(shaam|evening|raat|night)\b/.test(q)&&h<=12&&h!==12)h+=12;
    else if(/\b(subah|morning)\b/.test(q)&&h===12)h=0;
    else if(/\b(dopahar|afternoon)\b/.test(q)&&h<=12&&h!==12)h+=12;
    else if(h<=12)return {time:null,ambiguous:true,hour:h};
    return {time:`${String(h).padStart(2,'0')}:00`,ambiguous:false};
  }
  return null;
}

async function currentLocationAddress(userId){
  try{
    const [rows]=await pool.query('SELECT latitude,longitude,sharing_enabled,updated_at FROM user_locations WHERE user_id=?',[userId]);
    const l=rows[0];
    if(!l||!l.sharing_enabled)return null;
    if(Date.now()-new Date(l.updated_at).getTime()>10*60*1000)return {stale:true};
    const lat=Number(l.latitude),lng=Number(l.longitude);
    return {address:`Current GPS location: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,latitude:lat,longitude:lng};
  }catch(e){return null;}
}
function wantsCurrentLocation(message){return /\b(current location|live location|my location|meri location|gps|yahi location|yahin|yahi)\b/i.test(String(message||''))}
function parseMoney(message){
  const q=String(message||'').replace(/,/g,'');
  const m=q.match(/(?:₹|rs\.?|inr)?\s*(\d{2,7}(?:\.\d{1,2})?)/i);
  if(!m)return null;
  const n=Number(m[1]);return Number.isFinite(n)&&n>0?n:null;
}
function bargainNo(message){return /\b(no|nahi|nhi|nah|nope|without bargain|listed price|normal price|full price)\b/i.test(String(message||''))}
function bargainYes(message){return /\b(yes|haan|han|ha|bargain|negotiate|offer|kam kar|discount)\b/i.test(String(message||''))}

async function createBookingFromAgent(req,s,bargainAmount=null){
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query(`
      SELECT ws.price,w.user_id worker_user_id,u.full_name worker_name
      FROM worker_services ws JOIN workers w ON w.id=ws.worker_id JOIN users u ON u.id=w.user_id
      WHERE ws.worker_id=? AND ws.service_id=? LIMIT 1`,[s.workerId,s.serviceId]);
    if(!rows.length)throw new Error('Selected worker no longer provides this service. Please start again.');
    const w=rows[0],listedPrice=Number(w.price);
    const status=bargainAmount?'BARGAINING':'PENDING';
    const instructions=String(s.problem||`Booked with SevaHub AI for ${s.serviceName}`).slice(0,500);
    const [r]=await conn.query(`INSERT INTO bookings(user_id,worker_id,service_id,booking_date,booking_time,address,instructions,original_price,payment_method,status)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,[req.user.id,s.workerId,s.serviceId,s.bookingDate,s.bookingTime,s.address,instructions,listedPrice,'Cash',status]);
    const bookingId=r.insertId;

    if(bargainAmount){
      await conn.query(`INSERT INTO bargain_offers(booking_id,sender_id,receiver_id,sender_role,amount,message,status)
        VALUES(?,?,?,?,?,?,'PENDING')`,[bookingId,req.user.id,w.worker_user_id,'USER',Number(bargainAmount),`Price proposed through SevaHub AI for ${s.serviceName}`]);
    }
    await conn.commit();

    if(bargainAmount){
      await notify(req.app,w.worker_user_id,'New AI booking + price proposal',`Booking #${bookingId}: customer offered ₹${Number(bargainAmount).toLocaleString('en-IN')} for ${s.serviceName}.`,'BARGAIN').catch(()=>{});
    }else{
      await notify(req.app,w.worker_user_id,'New booking request',`A customer requested Booking #${bookingId} for ${s.serviceName}.`,'BOOKING').catch(()=>{});
    }
    return {bookingId,listedPrice,workerName:w.worker_name,status};
  }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
}

function agentData(message,s,extra={}){
  return {message,bookingAgent:{active:Boolean(s),step:s?.step||null,serviceId:s?.serviceId||null,serviceName:s?.serviceName||null,...extra}};
}

async function startForService(req,message,serviceName){
  const service=await findService(serviceName);
  if(!service)return null;
  const workers=await getWorkersForService(service.id,req.user.id);
  if(!workers.length){
    clearSession(req.user.id);
    return agentData(`${SERVICE_ICONS[service.name]||'🛠️'} ${service.name} sahi service lag rahi hai, but abhi is category me koi registered worker available nahi dikh raha. Thodi der baad try karo ya Services tab check karo.`,null,{finished:true});
  }
  const s=saveSession(req.user.id,{step:'WORKER',serviceId:Number(service.id),serviceName:service.name,basePrice:Number(service.base_price||0),problem:String(message||'').slice(0,500),workers});
  return agentData(workerListText(service,workers),s,{workers:workers.map((w,i)=>({choice:i+1,workerId:Number(w.worker_id),name:w.full_name,price:Number(w.service_price),rating:Number(w.rating||0),distanceKm:Number.isFinite(w.distance_km)?w.distance_km:null}))});
}

async function handleBookingAgent(req,message){
  if(req.user.role!=='USER')return null;
  let s=sessionFor(req.user.id);

  if(s&&isCancelMessage(message)){
    clearSession(req.user.id);
    return agentData('Theek hai bhai, AI booking flow cancel kar diya. Jab chaho problem bata ke nayi booking start kar dena.',null,{cancelled:true});
  }

  if(!s){
    const serviceName=detectServiceName(message);
    if(serviceName&&(isBookingIntent(message)||hasProblemSignal(message)))return startForService(req,message,serviceName);
    if(isBookingIntent(message)){
      s=saveSession(req.user.id,{step:'SERVICE',problem:String(message||'').slice(0,500)});
      return agentData('Bilkul. Main booking karwa dunga. Pehle problem/service batao — jaise “bed toot gaya”, “sink leak hai”, “AC cooling nahi kar raha”, ya direct service name bolo.',s);
    }
    return null;
  }

  if(s.step==='SERVICE'){
    const serviceName=detectServiceName(message);
    if(!serviceName)return agentData('Problem thoda clearly batao ya service name bolo — Carpenter, Plumbing, Electrician, AC Repair, Cleaning, etc.',s);
    s.problem=String(message||s.problem).slice(0,500);
    return startForService(req,s.problem,serviceName);
  }

  if(s.step==='WORKER'){
    const worker=chooseWorker(message,s.workers||[]);
    if(!worker)return agentData(`Worker select nahi hua. 1 se ${(s.workers||[]).length} ke beech number ya exact worker name bol do.`,s);
    s.workerId=Number(worker.worker_id);s.workerName=worker.full_name;s.listedPrice=Number(worker.service_price);
    const date=parseBookingDate(message),time=parseBookingTime(message);
    if(date)s.bookingDate=date;
    if(time?.time)s.bookingTime=time.time;
    if(s.bookingDate&&s.bookingTime){s.step='LOCATION';saveSession(req.user.id,s);return agentData(`✅ ${s.workerName} selected · ${s.bookingDate} at ${s.bookingTime}.\nAb location/address batao. Agar Location sharing ON hai toh “current location” bol sakte ho.`,s);}
    if(s.bookingDate&&!s.bookingTime){s.step='TIME';saveSession(req.user.id,s);return agentData(`✅ ${s.workerName} selected. Date ${s.bookingDate}. Ab time batao — jaise 4 PM ya 16:00.`,s);}
    s.step='DATE';saveSession(req.user.id,s);
    return agentData(`✅ ${s.workerName} selected · listed price ₹${s.listedPrice.toLocaleString('en-IN')}.\nBooking kis date ki chahiye? “kal”, “5 September”, ya YYYY-MM-DD bol sakte ho.`,s);
  }

  if(s.step==='DATE'){
    const date=parseBookingDate(message);
    if(!date)return agentData('Date samajh nahi aayi. “kal”, “5 September”, “05/09/2026” ya “2026-09-05” format me bolo.',s);
    const today=addDaysToToday(0);
    if(date<today)return agentData('Past date par booking nahi bana sakta. Aaj ya future date batao.',s);
    s.bookingDate=date;
    const time=parseBookingTime(message);
    if(time?.time){s.bookingTime=time.time;s.step='LOCATION';saveSession(req.user.id,s);return agentData(`Date/time set: ${s.bookingDate} · ${s.bookingTime}. Ab address batao, ya Location sharing ON hai toh “current location” bolo.`,s);}
    s.step='TIME';saveSession(req.user.id,s);
    return agentData(`Date set: ${s.bookingDate}. Ab time batao — jaise 10:30 AM, 4 PM, ya 16:00.`,s);
  }

  if(s.step==='TIME'){
    const time=parseBookingTime(message);
    if(time?.ambiguous)return agentData(`${time.hour} baje samajh gaya, bas AM/PM bata do — jaise ${time.hour} AM ya ${time.hour} PM.`,s);
    if(!time?.time)return agentData('Time samajh nahi aaya. 10:30 AM, 4 PM, 16:00, ya “shaam 5 baje” jaisa bolo.',s);
    s.bookingTime=time.time;s.step='LOCATION';saveSession(req.user.id,s);
    return agentData(`Time set: ${s.bookingTime}. Ab service address batao. Current GPS use karna hai toh “current location” bolo.`,s);
  }

  if(s.step==='LOCATION'){
    if(wantsCurrentLocation(message)){
      const loc=await currentLocationAddress(req.user.id);
      if(loc?.stale)return agentData('Tumhari saved GPS location purani hai. Settings → Location sharing me location refresh karo, phir “current location” bolo; ya yahin full address type kar do.',s);
      if(!loc)return agentData('Current location available nahi hai. Settings → Location sharing ON karo, ya yahin service address type kar do.',s);
      s.address=loc.address;s.usedLiveLocation=true;
    }else{
      const address=String(message||'').trim();
      if(address.length<5)return agentData('Address thoda complete batao, ya “current location” bolo.',s);
      s.address=address.slice(0,500);s.usedLiveLocation=false;
    }
    s.step='BARGAIN';saveSession(req.user.id,s);
    return agentData(`📍 Location set. Listed price ₹${Number(s.listedPrice||0).toLocaleString('en-IN')}.\nBargaining karni hai? “No” bolo toh listed price request chali jayegi; “Yes” bolo toh main tumhara offer amount poochhunga.`,s);
  }

  if(s.step==='BARGAIN'){
    const amount=parseMoney(message);
    if(bargainNo(message)){
      const created=await createBookingFromAgent(req,s,null);clearSession(req.user.id);
      return agentData(`✅ Booking #${created.bookingId} automatically create ho gayi!\n${s.serviceName} · ${created.workerName}\n📅 ${s.bookingDate} · ⏰ ${s.bookingTime}\n💰 Listed price ₹${created.listedPrice.toLocaleString('en-IN')} · Payment: Cash\nStatus: PENDING — worker ko request bhej di hai.`,null,{finished:true,bookingId:created.bookingId,status:created.status});
    }
    if(amount){
      const created=await createBookingFromAgent(req,s,amount);clearSession(req.user.id);
      return agentData(`✅ Booking #${created.bookingId} automatically create ho gayi aur ₹${amount.toLocaleString('en-IN')} ka bargain offer bhi worker ko bhej diya!\n${s.serviceName} · ${created.workerName}\n📅 ${s.bookingDate} · ⏰ ${s.bookingTime}\nListed price ₹${created.listedPrice.toLocaleString('en-IN')} · Your offer ₹${amount.toLocaleString('en-IN')}\nStatus: BARGAINING.`,null,{finished:true,bookingId:created.bookingId,status:created.status,bargainAmount:amount});
    }
    if(bargainYes(message)){
      s.step='BARGAIN_AMOUNT';saveSession(req.user.id,s);
      return agentData(`Theek hai. Tumhara fair offer kitna hai? Sirf amount bol do — jaise ₹${Math.max(1,Math.round(Number(s.listedPrice||0)*0.9))}.`,s);
    }
    return agentData('Bargain karni hai ya nahi? “Yes” / “No” bolo. Agar bargain karni hai toh amount bhi direct bol sakte ho, jaise “₹300”.',s);
  }

  if(s.step==='BARGAIN_AMOUNT'){
    if(bargainNo(message)){
      const created=await createBookingFromAgent(req,s,null);clearSession(req.user.id);
      return agentData(`✅ Bargain skip kar diya. Booking #${created.bookingId} create ho gayi at listed price ₹${created.listedPrice.toLocaleString('en-IN')}. Worker ko request bhej di hai.`,null,{finished:true,bookingId:created.bookingId,status:created.status});
    }
    const amount=parseMoney(message);
    if(!amount)return agentData('Valid offer amount batao — jaise ₹300 ya 450.',s);
    const created=await createBookingFromAgent(req,s,amount);clearSession(req.user.id);
    return agentData(`✅ Done bhai! Booking #${created.bookingId} create ho gayi aur ₹${amount.toLocaleString('en-IN')} ka offer worker ko bhej diya. Worker Accept/Reject/Counter kar sakta hai. My Bookings me live status dekh sakte ho.`,null,{finished:true,bookingId:created.bookingId,status:created.status,bargainAmount:amount});
  }

  clearSession(req.user.id);
  return null;
}

router.post('/chat',auth,async(req,res,next)=>{try{
  const message=String(req.body.message||'').trim();
  if(!message||message.length>2000)return res.status(400).json({success:false,message:'Enter a message up to 2,000 characters'});

  const bookingAgent=await handleBookingAgent(req,message);
  if(bookingAgent)return res.json({success:true,data:bookingAgent});

  const isWorker=req.user.role==='WORKER';
  const [bookings]=await pool.query(isWorker?`SELECT b.id,b.status,b.booking_date,b.final_price,s.name service_name FROM bookings b JOIN workers w ON w.id=b.worker_id JOIN services s ON s.id=b.service_id WHERE w.user_id=? ORDER BY b.created_at DESC LIMIT 10`:`SELECT b.id,b.status,b.booking_date,b.final_price,s.name service_name FROM bookings b JOIN services s ON s.id=b.service_id WHERE b.user_id=? ORDER BY b.created_at DESC LIMIT 10`,[req.user.id]);
  const text=await reply({message,context:{
    role:req.user.role,
    bookings,
    services:await getServices(),
    platform:{name:'SevaHub',model:'digital cooperative gig services',service_categories:['household repair','cleaning','appliances','gardening','moving','community maintenance','community events'],currency:'INR'},
    sessionId:String(req.user.id),userId:String(req.user.id)
  }});
  res.json({success:true,data:{message:text,bookingAgent:{active:false,step:null}}});
}catch(e){next(e)}});

module.exports=router;

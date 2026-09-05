const express=require('express');
const pool=require('../config');
const {auth}=require('../middleware/auth');
const {reply}=require('../services/aiProvider');
const {notify}=require('../utils/notifications');
const router=express.Router();

const SESSION_TTL_MS=30*60*1000;
let sessionSchemaPromise=null;

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

function normalized(value){return String(value||'').trim().toLowerCase()}
function isCancelMessage(message){return /^(cancel|stop|quit|rehne do|rehne de|chhodo|chodo|cancel booking|start over|reset)$/i.test(String(message||'').trim())}
function isBookingIntent(message){
  const q=normalized(message);
  if(/\b(book|booking|schedule|scheduled)\b/.test(q)&&!(/\b(status|history|details|show|check|my booking|my bookings)\b/.test(q)))return true;
  return /\b(book|booking|schedule)\b.{0,30}\b(kar|kr|karwa|karwana|karni|create|chahiye|karo|do)\b/.test(q)||
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

async function ensureSessionSchema(){
  if(!sessionSchemaPromise){
    sessionSchemaPromise=pool.query(`CREATE TABLE IF NOT EXISTS ai_booking_sessions (
      user_id INT PRIMARY KEY,
      session_json LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ai_booking_updated(updated_at)
    )`).catch(err=>{sessionSchemaPromise=null;throw err});
  }
  return sessionSchemaPromise;
}

async function loadSession(userId){
  await ensureSessionSchema();
  const [rows]=await pool.query('SELECT session_json,updated_at FROM ai_booking_sessions WHERE user_id=? LIMIT 1',[userId]);
  if(!rows.length)return null;
  const updated=new Date(rows[0].updated_at).getTime();
  if(!Number.isFinite(updated)||Date.now()-updated>SESSION_TTL_MS){
    await clearSession(userId);
    return null;
  }
  try{return JSON.parse(rows[0].session_json)}catch(e){await clearSession(userId);return null}
}

async function saveSession(userId,session){
  await ensureSessionSchema();
  const clean={...session,updatedAt:Date.now()};
  await pool.query(`INSERT INTO ai_booking_sessions(user_id,session_json,updated_at)
    VALUES(?,?,CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE session_json=VALUES(session_json),updated_at=CURRENT_TIMESTAMP`,[userId,JSON.stringify(clean)]);
  return clean;
}

async function clearSession(userId){
  await ensureSessionSchema();
  await pool.query('DELETE FROM ai_booking_sessions WHERE user_id=?',[userId]);
}

function distanceKm(aLat,aLng,bLat,bLng){
  const toRad=n=>n*Math.PI/180,R=6371;
  const dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);
  const v=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(v),Math.sqrt(1-v));
}

async function getServices(){
  const [rows]=await pool.query('SELECT id,name,base_price FROM services ORDER BY id');
  return rows;
}
async function findService(name){
  const [rows]=await pool.query('SELECT id,name,base_price FROM services WHERE LOWER(name)=LOWER(?) LIMIT 1',[name]);
  return rows[0]||null;
}

async function getWorkersForService(serviceId,userId){
  const [rows]=await pool.query(`SELECT w.id worker_id,w.user_id worker_user_id,u.full_name,w.experience_years,w.service_area,
    w.rating,w.total_reviews,w.working_hours,ws.price service_price
    FROM worker_services ws
    JOIN workers w ON w.id=ws.worker_id
    JOIN users u ON u.id=w.user_id
    WHERE ws.service_id=? AND COALESCE(w.is_banned,0)=0 AND w.profile_deleted_at IS NULL
    ORDER BY w.rating DESC,w.total_reviews DESC,ws.price ASC LIMIT 30`,[serviceId]);
  if(!rows.length)return [];
  try{
    const ids=[Number(userId),...rows.map(r=>Number(r.worker_user_id))];
    const [locs]=await pool.query('SELECT user_id,latitude,longitude,sharing_enabled,updated_at FROM user_locations WHERE user_id IN (?) AND sharing_enabled=TRUE',[ids]);
    const map=new Map(locs.map(l=>[Number(l.user_id),l]));
    const mine=map.get(Number(userId));
    const fresh=l=>l&&(Date.now()-new Date(l.updated_at).getTime())<=5*60*1000;
    if(fresh(mine)){
      rows.forEach(w=>{
        const loc=map.get(Number(w.worker_user_id));
        if(fresh(loc))w.distance_km=Number(distanceKm(Number(mine.latitude),Number(mine.longitude),Number(loc.latitude),Number(loc.longitude)).toFixed(2));
      });
      rows.sort((a,b)=>{
        const ad=Number.isFinite(a.distance_km)?a.distance_km:Infinity,bd=Number.isFinite(b.distance_km)?b.distance_km:Infinity;
        return ad!==bd?ad-bd:Number(b.rating||0)-Number(a.rating||0);
      });
    }
  }catch(e){/* location is optional for scheduled booking */}
  return rows.slice(0,8);
}

function workerListText(service,workers){
  const lines=workers.map((w,i)=>{
    const rating=Number(w.rating||0)>0?`⭐ ${Number(w.rating).toFixed(1)}`:'New worker';
    const distance=Number.isFinite(w.distance_km)?` · 📍 ${w.distance_km} km`:'';
    const exp=Number(w.experience_years||0)>0?` · ${Number(w.experience_years)} yr exp`:'';
    return `${i+1}. ${w.full_name} — ₹${Number(w.service_price).toLocaleString('en-IN')} · ${rating}${distance}${exp}`;
  }).join('\n');
  return `${SERVICE_ICONS[service.name]||'🛠️'} **${service.name}** selected.\n\nAvailable workers:\n${lines}\n\nKaunsa worker chahiye? Number (1/2/3...) ya worker ka naam bol do.`;
}

function chooseWorker(message,workers){
  const q=normalized(message);
  const ordinals={first:1,pehla:1,pehli:1,second:2,dusra:2,dusri:2,third:3,teesra:3,chautha:4,fourth:4,fifth:5,paanchva:5};
  for(const [word,n] of Object.entries(ordinals))if(new RegExp(`\\b${word}\\b`,'i').test(q)&&workers[n-1])return workers[n-1];
  const nMatch=q.match(/(?:^|\b)(\d{1,2})(?:\b|$)/);
  if(nMatch){const n=Number(nMatch[1]);if(n>=1&&n<=workers.length)return workers[n-1];}
  const byName=workers.filter(w=>q.includes(normalized(w.full_name))||normalized(w.full_name).includes(q));
  return byName.length===1?byName[0]:null;
}

function istToday(){
  const d=new Date(Date.now()+330*60*1000);
  return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate()};
}
function dateString(y,m,d){return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function validCalendarDate(y,m,d){const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d}
function addDaysToToday(days){const t=istToday(),x=new Date(Date.UTC(t.y,t.m-1,t.d+days));return dateString(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate())}
function parseBookingDate(message){
  const q=normalized(message);
  if(/\b(day after tomorrow|parso)\b/.test(q))return addDaysToToday(2);
  if(/\b(tomorrow|kal)\b/.test(q))return addDaysToToday(1);
  if(/\b(today|aaj)\b/.test(q))return addDaysToToday(0);
  let m=q.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if(m){const y=+m[1],mo=+m[2],d=+m[3];if(validCalendarDate(y,mo,d))return dateString(y,mo,d)}
  m=q.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?\b/);
  if(m){const t=istToday(),d=+m[1],mo=+m[2],y=m[3]?+m[3]:t.y;if(validCalendarDate(y,mo,d)){let out=dateString(y,mo,d);if(!m[3]&&out<dateString(t.y,t.m,t.d)&&validCalendarDate(y+1,mo,d))out=dateString(y+1,mo,d);return out}}
  const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  m=q.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/);
  if(m){const t=istToday(),d=+m[1],mo=months[m[2]],y=m[3]?+m[3]:t.y;if(validCalendarDate(y,mo,d)){let out=dateString(y,mo,d);if(!m[3]&&out<dateString(t.y,t.m,t.d)&&validCalendarDate(y+1,mo,d))out=dateString(y+1,mo,d);return out}}
  return null;
}

function parseBookingTime(message){
  const q=normalized(message);
  let m=q.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if(m){let h=+m[1],min=+(m[2]||0);if(h<1||h>12||min>59)return null;if(m[3]==='pm'&&h!==12)h+=12;if(m[3]==='am'&&h===12)h=0;return {time:`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`,ambiguous:false}}
  m=q.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if(m)return {time:`${String(+m[1]).padStart(2,'0')}:${m[2]}`,ambiguous:false};
  m=q.match(/\b(\d{1,2})\s*baje\b/);
  if(m){let h=+m[1];if(h<1||h>23)return null;if(/\b(shaam|evening|raat|night)\b/.test(q)&&h<=12&&h!==12)h+=12;else if(/\b(subah|morning)\b/.test(q)&&h===12)h=0;else if(/\b(dopahar|afternoon)\b/.test(q)&&h<=12&&h!==12)h+=12;else if(h<=12)return {time:null,ambiguous:true,hour:h};return {time:`${String(h).padStart(2,'0')}:00`,ambiguous:false}}
  return null;
}

function bookingMomentIsPast(date,time){
  if(!date||!time)return false;
  const iso=`${date}T${time}:00+05:30`;
  const t=new Date(iso).getTime();
  return Number.isFinite(t)&&t<Date.now()+60*1000;
}

async function currentLocationAddress(userId){
  try{
    const [rows]=await pool.query('SELECT latitude,longitude,sharing_enabled,updated_at FROM user_locations WHERE user_id=?',[userId]);
    const l=rows[0];if(!l||!l.sharing_enabled)return null;
    if(Date.now()-new Date(l.updated_at).getTime()>10*60*1000)return {stale:true};
    const lat=Number(l.latitude),lng=Number(l.longitude);
    return {address:`Current GPS location: ${lat.toFixed(6)}, ${lng.toFixed(6)}`};
  }catch(e){return null}
}
function wantsCurrentLocation(message){return /\b(current location|live location|my location|meri location|gps|yahi location|yahin|yahi)\b/i.test(String(message||''))}
function parseMoney(message){const q=String(message||'').replace(/,/g,'');const m=q.match(/(?:₹|rs\.?|inr)?\s*(\d{2,7}(?:\.\d{1,2})?)/i);if(!m)return null;const n=Number(m[1]);return Number.isFinite(n)&&n>0?n:null}
function bargainNo(message){return /\b(no|nahi|nhi|nah|nope|without bargain|no bargain|listed price|normal price|full price|bargain nahi|bargaining nahi)\b/i.test(String(message||''))}
function bargainYes(message){return /\b(yes|haan|han|ha|bargain|bargaining|negotiate|offer|kam kar|discount)\b/i.test(String(message||''))}

function agentData(message,s,extra={}){return {message,bookingAgent:{active:Boolean(s),step:s?.step||null,serviceId:s?.serviceId||null,serviceName:s?.serviceName||null,...extra}}}

async function createBookingFromAgent(req,s,bargainAmount=null){
  if(!s.workerId||!s.serviceId||!s.bookingDate||!s.bookingTime||!s.address)throw new Error('Booking details incomplete. Please restart AI booking.');
  if(bookingMomentIsPast(s.bookingDate,s.bookingTime))throw new Error('Selected date/time is already past. Please choose a future time.');
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query(`SELECT ws.price,w.user_id worker_user_id,u.full_name worker_name
      FROM worker_services ws JOIN workers w ON w.id=ws.worker_id JOIN users u ON u.id=w.user_id
      WHERE ws.worker_id=? AND ws.service_id=? AND COALESCE(w.is_banned,0)=0 AND w.profile_deleted_at IS NULL LIMIT 1`,[s.workerId,s.serviceId]);
    if(!rows.length)throw new Error('Selected worker is no longer available for this service. Please start again.');
    const w=rows[0],listedPrice=Number(w.price),status=bargainAmount?'BARGAINING':'PENDING';
    const instructions=String(s.problem||`Booked with SevaHub AI for ${s.serviceName}`).slice(0,500);
    const [r]=await conn.query(`INSERT INTO bookings(user_id,worker_id,service_id,booking_date,booking_time,address,instructions,original_price,payment_method,status)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,[req.user.id,s.workerId,s.serviceId,s.bookingDate,s.bookingTime,s.address,instructions,listedPrice,'Cash',status]);
    const bookingId=Number(r.insertId);
    if(bargainAmount){
      await conn.query(`INSERT INTO bargain_offers(booking_id,sender_id,receiver_id,sender_role,amount,message,status)
        VALUES(?,?,?,?,?,?,'PENDING')`,[bookingId,req.user.id,w.worker_user_id,'USER',Number(bargainAmount),`Price proposed through SevaHub AI for ${s.serviceName}`]);
    }
    await conn.commit();
    const title=bargainAmount?'New AI booking + price proposal':'New scheduled booking request';
    const msg=bargainAmount?`Booking #${bookingId}: customer offered ₹${Number(bargainAmount).toLocaleString('en-IN')} for ${s.serviceName}.`:`Booking #${bookingId}: ${s.serviceName} scheduled for ${s.bookingDate} at ${s.bookingTime}.`;
    await notify(req.app,w.worker_user_id,title,msg,bargainAmount?'BARGAIN':'BOOKING').catch(()=>{});
    return {bookingId,listedPrice,workerName:w.worker_name,status};
  }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
}

async function startForService(req,message,serviceName,seed={}){
  const service=await findService(serviceName);if(!service)return null;
  const workers=await getWorkersForService(service.id,req.user.id);
  if(!workers.length){await clearSession(req.user.id);return agentData(`${SERVICE_ICONS[service.name]||'🛠️'} ${service.name} sahi service hai, but abhi is category me koi available registered worker nahi dikh raha.`,null,{finished:true})}
  const parsedDate=parseBookingDate(message),parsedTime=parseBookingTime(message);
  const s={step:'WORKER',serviceId:Number(service.id),serviceName:service.name,basePrice:Number(service.base_price||0),problem:String(seed.problem||message||'').slice(0,500),workers};
  if(seed.bookingDate||parsedDate)s.bookingDate=seed.bookingDate||parsedDate;
  if(seed.bookingTime||parsedTime?.time)s.bookingTime=seed.bookingTime||parsedTime.time;
  await saveSession(req.user.id,s);
  let intro=workerListText(service,workers);
  if(s.bookingDate||s.bookingTime)intro+=`\n\n📅 Schedule captured: ${s.bookingDate||'date pending'}${s.bookingTime?` · ⏰ ${s.bookingTime}`:''}.`;
  return agentData(intro,s,{workers:workers.map((w,i)=>({choice:i+1,workerId:Number(w.worker_id),name:w.full_name,price:Number(w.service_price),rating:Number(w.rating||0),distanceKm:Number.isFinite(w.distance_km)?w.distance_km:null}))});
}

async function handleBookingAgent(req,message){
  if(req.user.role!=='USER')return null;
  let s=await loadSession(req.user.id);
  if(s&&isCancelMessage(message)){await clearSession(req.user.id);return agentData('Theek hai bhai, AI booking flow cancel kar diya.',null,{cancelled:true})}

  if(!s){
    const serviceName=detectServiceName(message);
    if(serviceName&&(isBookingIntent(message)||hasProblemSignal(message)))return startForService(req,message,serviceName);
    if(isBookingIntent(message)){
      s={step:'SERVICE',problem:String(message||'').slice(0,500),bookingDate:parseBookingDate(message)||undefined,bookingTime:parseBookingTime(message)?.time||undefined};
      await saveSession(req.user.id,s);
      return agentData('Bilkul. Main scheduled booking bana dunga. Problem/service batao — jaise “sink leak hai”, “AC repair”, “cleaning”, etc.',s);
    }
    return null;
  }

  if(s.step==='SERVICE'){
    const serviceName=detectServiceName(message);
    if(!serviceName)return agentData('Service samajh nahi aayi. Carpenter, Plumbing, Electrician, AC Repair, Cleaning, Painting, etc. me se service/problem batao.',s);
    const date=parseBookingDate(message),time=parseBookingTime(message);
    if(date)s.bookingDate=date;if(time?.time)s.bookingTime=time.time;
    s.problem=String(`${s.problem||''} ${message||''}`).trim().slice(0,500);
    return startForService(req,message,serviceName,s);
  }

  if(s.step==='WORKER'){
    const worker=chooseWorker(message,s.workers||[]);
    if(!worker)return agentData(`Worker select nahi hua. 1 se ${(s.workers||[]).length} ke beech number ya worker ka naam bol do.`,s);
    s.workerId=Number(worker.worker_id);s.workerName=worker.full_name;s.listedPrice=Number(worker.service_price);
    const date=parseBookingDate(message),time=parseBookingTime(message);if(date)s.bookingDate=date;if(time?.time)s.bookingTime=time.time;
    if(s.bookingDate&&s.bookingTime){
      if(bookingMomentIsPast(s.bookingDate,s.bookingTime)){s.bookingTime=null;s.step='TIME';await saveSession(req.user.id,s);return agentData(`✅ ${s.workerName} selected. Date ${s.bookingDate} hai, but time past ho chuka hai. Future time batao.`,s)}
      s.step='LOCATION';await saveSession(req.user.id,s);return agentData(`✅ ${s.workerName} selected · ${s.bookingDate} at ${s.bookingTime}.\nAb service address batao, ya Location sharing ON hai toh “current location” bolo.`,s);
    }
    if(s.bookingDate){s.step='TIME';await saveSession(req.user.id,s);return agentData(`✅ ${s.workerName} selected. Date ${s.bookingDate}. Ab time batao — jaise 4 PM ya 16:00.`,s)}
    s.step='DATE';await saveSession(req.user.id,s);return agentData(`✅ ${s.workerName} selected · listed price ₹${s.listedPrice.toLocaleString('en-IN')}.\nBooking kis date ki chahiye? “kal”, “7 September”, ya YYYY-MM-DD bol sakte ho.`,s);
  }

  if(s.step==='DATE'){
    const date=parseBookingDate(message);if(!date)return agentData('Date samajh nahi aayi. “kal”, “7 September”, “07/09/2026” ya “2026-09-07” format me bolo.',s);
    if(date<addDaysToToday(0))return agentData('Past date par booking nahi bana sakta. Aaj ya future date batao.',s);
    s.bookingDate=date;const time=parseBookingTime(message);
    if(time?.time){s.bookingTime=time.time;if(bookingMomentIsPast(s.bookingDate,s.bookingTime))return agentData('Ye time already past hai. Future time batao.',s);s.step='LOCATION';await saveSession(req.user.id,s);return agentData(`Date/time set: ${s.bookingDate} · ${s.bookingTime}. Ab address batao ya “current location” bolo.`,s)}
    s.step='TIME';await saveSession(req.user.id,s);return agentData(`Date set: ${s.bookingDate}. Ab time batao — jaise 10:30 AM, 4 PM, ya 16:00.`,s);
  }

  if(s.step==='TIME'){
    const time=parseBookingTime(message);if(time?.ambiguous)return agentData(`${time.hour} baje samajh gaya, bas AM/PM bata do.`,s);if(!time?.time)return agentData('Time samajh nahi aaya. 10:30 AM, 4 PM, 16:00, ya “shaam 5 baje” jaisa bolo.',s);
    s.bookingTime=time.time;if(bookingMomentIsPast(s.bookingDate,s.bookingTime))return agentData('Selected time already past hai. Future time batao.',s);
    s.step='LOCATION';await saveSession(req.user.id,s);return agentData(`Time set: ${s.bookingTime}. Ab service address batao, ya “current location” bolo.`,s);
  }

  if(s.step==='LOCATION'){
    if(wantsCurrentLocation(message)){
      const loc=await currentLocationAddress(req.user.id);
      if(loc?.stale)return agentData('Saved GPS location purani hai. Location refresh karo ya full address type kar do.',s);
      if(!loc)return agentData('Current location available nahi hai. Location sharing ON karo ya full address type kar do.',s);
      s.address=loc.address;
    }else{
      const address=String(message||'').trim();if(address.length<5)return agentData('Address thoda complete batao, ya “current location” bolo.',s);s.address=address.slice(0,500);
    }
    s.step='BARGAIN';await saveSession(req.user.id,s);return agentData(`📍 Location set. Listed price ₹${Number(s.listedPrice||0).toLocaleString('en-IN')}.\nBargaining karni hai? “No” bolo toh booking listed price par create ho jayegi; “Yes” bolo toh offer amount poochhunga.`,s);
  }

  if(s.step==='BARGAIN'){
    const amount=parseMoney(message);
    if(bargainNo(message)){
      const created=await createBookingFromAgent(req,s,null);await clearSession(req.user.id);
      return agentData(`✅ Scheduled Booking #${created.bookingId} create ho gayi!\n${s.serviceName} · ${created.workerName}\n📅 ${s.bookingDate} · ⏰ ${s.bookingTime}\n💰 ₹${created.listedPrice.toLocaleString('en-IN')} · Payment: Cash\nStatus: PENDING — worker ko request bhej di hai.`,null,{finished:true,bookingId:created.bookingId,status:created.status});
    }
    if(amount){
      const created=await createBookingFromAgent(req,s,amount);await clearSession(req.user.id);
      return agentData(`✅ Scheduled Booking #${created.bookingId} create ho gayi aur ₹${amount.toLocaleString('en-IN')} ka bargain offer worker ko bhej diya.\n📅 ${s.bookingDate} · ⏰ ${s.bookingTime}\nStatus: BARGAINING.`,null,{finished:true,bookingId:created.bookingId,status:created.status,bargainAmount:amount});
    }
    if(bargainYes(message)){s.step='BARGAIN_AMOUNT';await saveSession(req.user.id,s);return agentData(`Theek hai. Offer amount batao — jaise ₹${Math.max(1,Math.round(Number(s.listedPrice||0)*0.9))}.`,s)}
    return agentData('Bargain karni hai ya nahi? “Yes” / “No” bolo. Amount direct bhi bol sakte ho, jaise ₹300.',s);
  }

  if(s.step==='BARGAIN_AMOUNT'){
    if(bargainNo(message)){
      const created=await createBookingFromAgent(req,s,null);await clearSession(req.user.id);
      return agentData(`✅ Bargain skip. Scheduled Booking #${created.bookingId} create ho gayi at ₹${created.listedPrice.toLocaleString('en-IN')}.`,null,{finished:true,bookingId:created.bookingId,status:created.status});
    }
    const amount=parseMoney(message);if(!amount)return agentData('Valid offer amount batao — jaise ₹300 ya 450.',s);
    const created=await createBookingFromAgent(req,s,amount);await clearSession(req.user.id);
    return agentData(`✅ Done! Scheduled Booking #${created.bookingId} create ho gayi aur ₹${amount.toLocaleString('en-IN')} ka offer worker ko bhej diya.`,null,{finished:true,bookingId:created.bookingId,status:created.status,bargainAmount:amount});
  }

  await clearSession(req.user.id);return null;
}

router.post('/chat',auth,async(req,res)=>{
  try{
    const message=String(req.body.message||'').trim();
    if(!message||message.length>2000)return res.status(400).json({success:false,message:'Enter a message up to 2,000 characters'});
    const bookingAgent=await handleBookingAgent(req,message);
    if(bookingAgent)return res.json({success:true,data:bookingAgent});

    const isWorker=req.user.role==='WORKER';
    const [bookings]=await pool.query(isWorker?`SELECT b.id,b.status,b.booking_date,b.final_price,s.name service_name FROM bookings b JOIN workers w ON w.id=b.worker_id JOIN services s ON s.id=b.service_id WHERE w.user_id=? ORDER BY b.created_at DESC LIMIT 5`:`SELECT b.id,b.status,b.booking_date,b.final_price,s.name service_name FROM bookings b JOIN services s ON s.id=b.service_id WHERE b.user_id=? ORDER BY b.created_at DESC LIMIT 5`,[req.user.id]);
    const text=await reply({message,context:{role:req.user.role,bookings,services:await getServices(),platform:{name:'SevaHub',model:'digital cooperative gig services',currency:'INR'},sessionId:String(req.user.id),userId:String(req.user.id)}});
    return res.json({success:true,data:{message:text,bookingAgent:{active:false,step:null}}});
  }catch(e){
    console.error('[AI booking v2]',e);
    const friendly=/past|future time/i.test(e.message)?e.message:'AI scheduled booking could not be completed right now. Please retry the last step.';
    return res.status(500).json({success:false,message:friendly});
  }
});

module.exports=router;

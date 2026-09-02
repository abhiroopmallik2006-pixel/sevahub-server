const express=require('express');
const jwt=require('jsonwebtoken');
const pool=require('../config');
const {reply:aiReply}=require('../services/aiProvider');

const router=express.Router();
const LOOKBACK_DAYS=28;
const FORECAST_DAYS=7;

function adminAuth(req,res,next){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return res.status(401).json({success:false,message:'Admin authentication required'});
  try{
    const payload=jwt.verify(token,process.env.JWT_SECRET);
    if(payload.role!=='ADMIN'||payload.admin!==true)return res.status(403).json({success:false,message:'Admin access only'});
    req.admin=payload;
    next();
  }catch(e){return res.status(401).json({success:false,message:'Invalid or expired admin session'})}
}

async function columnExists(table,column){
  const [rows]=await pool.query('SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',[table,column]);
  return Boolean(rows.length);
}

async function ensureWorkerVerification(){
  if(!(await columnExists('workers','verification_status'))){
    await pool.query("ALTER TABLE workers ADD COLUMN verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'");
  }
}

function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
function rounded(value){return Math.round(Number(value)||0)}

function areaFromAddress(value){
  const raw=String(value||'').trim();
  if(!raw)return 'Unknown';
  const parts=raw.split(',').map(x=>x.trim()).filter(Boolean);
  let candidate=parts.length>=2?parts[parts.length-2]:parts[0];
  candidate=String(candidate||'')
    .replace(/\b\d{5,6}\b/g,'')
    .replace(/\b(india)\b/ig,'')
    .replace(/\s+/g,' ')
    .trim();
  if(!candidate&&parts.length)candidate=parts[0];
  return candidate?candidate.slice(0,45):'Unknown';
}

function trendLabel(recent,previous){
  const change=previous>0?((recent-previous)/previous)*100:(recent>0?100:0);
  return {
    percent:Math.round(change),
    direction:change>15?'RISING':change<-15?'FALLING':'STABLE'
  };
}

function confidenceFor(total){
  if(total>=16)return 'HIGH';
  if(total>=6)return 'MEDIUM';
  return 'LOW';
}

function localRecommendations(data){
  const lines=[];
  const services=[...(data.services||[])].sort((a,b)=>b.forecastNext7-a.forecastNext7);
  const top=services[0];
  if(top&&top.forecastNext7>0){
    lines.push(`${top.serviceName} has the highest 7-day forecast at about ${top.forecastNext7} bookings.`);
  }
  const shortages=services.filter(x=>x.shortage>0).sort((a,b)=>b.shortage-a.shortage);
  if(shortages.length){
    const s=shortages[0];
    lines.push(`${s.serviceName} needs attention: forecast capacity indicates a shortage of ${s.shortage} worker${s.shortage===1?'':'s'}.`);
  }else if(services.some(x=>x.forecastNext7>0)){
    lines.push('Current verified workforce capacity is sufficient for the forecasted service demand.');
  }
  if(data.peak?.dayLabel&&data.peak.dayLabel!=='No data'&&data.peak?.hourLabel&&data.peak.hourLabel!=='No data'){
    lines.push(`Peak demand is ${data.peak.dayLabel} around ${data.peak.hourLabel}; keep verified workers available near that period.`);
  }
  if(data.areas?.[0]?.area&&data.areas[0].area!=='Unknown'){
    lines.push(`${data.areas[0].area} is the strongest observed booking area, led by ${data.areas[0].topService||'mixed services'}.`);
  }
  if(!lines.length)lines.push('Not enough completed booking history is available yet. Keep collecting real bookings to improve forecast confidence.');
  return lines.slice(0,4);
}

async function maybeAiSummary(data){
  const local=localRecommendations(data);
  const hasKey=Boolean(process.env.AI_API_KEY||process.env.OPENAI_API_KEY);
  if(!hasKey||Number(data.summary?.bookingsLast28||0)<1){
    return {mode:'DATA_ENGINE',text:local.join('\n')};
  }
  const compact={
    summary:data.summary,
    peak:data.peak,
    topAreas:(data.areas||[]).slice(0,4),
    services:(data.services||[]).map(x=>({
      service:x.serviceName,
      recent7:x.bookingsLast7,
      previous7:x.bookingsPrevious7,
      forecast7:x.forecastNext7,
      trend:x.trend,
      verifiedWorkers:x.verifiedWorkers,
      availableWorkers:x.availableWorkers,
      recommendedWorkers:x.recommendedWorkers,
      shortage:x.shortage,
      confidence:x.confidence
    }))
  };
  try{
    const answer=await aiReply({
      message:'Act as a cooperative workforce planning analyst. Using ONLY the supplied SevaHub admin intelligence data, write 3 or 4 concise actionable bullets in English. Focus on demand forecast, workforce shortage or surplus, peak timing and strongest area. Do not invent any numbers, workers, areas or causes.',
      context:{role:'ADMIN',sessionId:'admin-demand-workforce-intelligence',platform:{adminIntelligence:compact}}
    });
    if(answer&&!/temporarily busy|basic help|thodi der/i.test(answer))return {mode:'AI_MODEL',text:answer};
  }catch(e){
    console.warn('[Admin Intelligence] AI summary unavailable:',e.message);
  }
  return {mode:'DATA_ENGINE',text:local.join('\n')};
}

router.get('/',adminAuth,async(req,res,next)=>{try{
  await ensureWorkerVerification();

  const [services]=await pool.query('SELECT id,name FROM services ORDER BY id ASC');
  const [bookings]=await pool.query(`
    SELECT b.id,b.service_id,s.name service_name,b.worker_id,b.status,b.address,
      DATEDIFF(CURDATE(),b.booking_date) age_days,
      HOUR(b.booking_time) booking_hour,
      DAYOFWEEK(b.booking_date) day_of_week
    FROM bookings b
    JOIN services s ON s.id=b.service_id
    WHERE b.booking_date BETWEEN DATE_SUB(CURDATE(),INTERVAL ${LOOKBACK_DAYS-1} DAY) AND CURDATE()
    ORDER BY b.booking_date ASC,b.id ASC
  `);
  const [workforce]=await pool.query(`
    SELECT ws.service_id,s.name service_name,w.id worker_id,
      UPPER(COALESCE(w.verification_status,'PENDING')) verification_status,
      CASE WHEN EXISTS(
        SELECT 1 FROM bookings ab
        WHERE ab.worker_id=w.id AND (ab.status='IN_PROGRESS' OR (ab.status='ACCEPTED' AND ab.booking_date=CURDATE()))
      ) THEN 1 ELSE 0 END active_now
    FROM worker_services ws
    JOIN services s ON s.id=ws.service_id
    JOIN workers w ON w.id=ws.worker_id
  `);

  const serviceMap=new Map();
  services.forEach(s=>serviceMap.set(Number(s.id),{
    serviceId:Number(s.id),serviceName:String(s.name),bookingsLast28:0,bookingsLast7:0,bookingsPrevious7:0,
    completedLast28:0,completedWorkerIds:new Set(),verifiedWorkerIds:new Set(),availableWorkerIds:new Set()
  }));

  const hourCounts=new Map();
  const dayCounts=new Map();
  const areaMap=new Map();

  bookings.forEach(row=>{
    const service=serviceMap.get(Number(row.service_id));
    if(!service)return;
    const age=Number(row.age_days);
    if(!Number.isFinite(age)||age<0||age>=LOOKBACK_DAYS)return;
    service.bookingsLast28++;
    if(age<=6)service.bookingsLast7++;
    else if(age<=13)service.bookingsPrevious7++;
    if(String(row.status||'').toUpperCase()==='COMPLETED'){
      service.completedLast28++;
      if(row.worker_id)service.completedWorkerIds.add(Number(row.worker_id));
    }

    const hour=Number(row.booking_hour);
    if(Number.isInteger(hour)&&hour>=0&&hour<=23)hourCounts.set(hour,(hourCounts.get(hour)||0)+1);
    const day=Number(row.day_of_week);
    if(Number.isInteger(day)&&day>=1&&day<=7)dayCounts.set(day,(dayCounts.get(day)||0)+1);

    const area=areaFromAddress(row.address);
    if(!areaMap.has(area))areaMap.set(area,{area,count:0,services:new Map()});
    const entry=areaMap.get(area);
    entry.count++;
    entry.services.set(service.serviceName,(entry.services.get(service.serviceName)||0)+1);
  });

  const verifiedAll=new Set();
  const availableAll=new Set();
  workforce.forEach(row=>{
    if(String(row.verification_status)!=='VERIFIED')return;
    const service=serviceMap.get(Number(row.service_id));
    if(!service)return;
    const id=Number(row.worker_id);
    service.verifiedWorkerIds.add(id);verifiedAll.add(id);
    if(!Number(row.active_now)){service.availableWorkerIds.add(id);availableAll.add(id)}
  });

  const serviceStats=[...serviceMap.values()].map(service=>{
    const baselineWeekly=service.bookingsLast28/4;
    let forecast=rounded(service.bookingsLast7*.55+service.bookingsPrevious7*.25+baselineWeekly*.20);
    if(service.bookingsLast28>0&&forecast<1)forecast=1;
    const completedWorkers=service.completedWorkerIds.size;
    const observedWeeklyCapacity=service.completedLast28>0&&completedWorkers>0
      ? service.completedLast28/completedWorkers/4
      : 4;
    const weeklyCapacity=clamp(rounded(observedWeeklyCapacity)||4,1,8);
    const verifiedWorkers=service.verifiedWorkerIds.size;
    const availableWorkers=service.availableWorkerIds.size;
    const recommendedWorkers=forecast>0?Math.ceil(forecast/weeklyCapacity):0;
    const shortage=Math.max(0,recommendedWorkers-availableWorkers);
    const surplus=Math.max(0,availableWorkers-recommendedWorkers);
    const trend=trendLabel(service.bookingsLast7,service.bookingsPrevious7);
    return {
      serviceId:service.serviceId,
      serviceName:service.serviceName,
      bookingsLast28:service.bookingsLast28,
      bookingsLast7:service.bookingsLast7,
      bookingsPrevious7:service.bookingsPrevious7,
      forecastNext7:forecast,
      trend,
      confidence:confidenceFor(service.bookingsLast28),
      verifiedWorkers,
      availableWorkers,
      recommendedWorkers,
      shortage,
      surplus,
      planningCapacityPerWorker:weeklyCapacity,
      workforceStatus:shortage>0?'SHORTAGE':(forecast>0&&availableWorkers<=recommendedWorkers?'TIGHT':'BALANCED')
    };
  }).sort((a,b)=>b.forecastNext7-a.forecastNext7||b.bookingsLast7-a.bookingsLast7||a.serviceName.localeCompare(b.serviceName));

  const topHour=[...hourCounts.entries()].sort((a,b)=>b[1]-a[1])[0];
  const topDay=[...dayCounts.entries()].sort((a,b)=>b[1]-a[1])[0];
  const dayNames=['','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const hourLabel=topHour?`${String(topHour[0]).padStart(2,'0')}:00 - ${String((topHour[0]+1)%24).padStart(2,'0')}:00`:'No data';
  const peak={
    hour:Number(topHour?.[0]??-1),hourLabel,hourBookings:Number(topHour?.[1]||0),
    day:Number(topDay?.[0]??0),dayLabel:topDay?dayNames[topDay[0]]:'No data',dayBookings:Number(topDay?.[1]||0)
  };

  const areas=[...areaMap.values()].map(entry=>{
    const top=[...entry.services.entries()].sort((a,b)=>b[1]-a[1])[0];
    return {area:entry.area,bookings:entry.count,topService:top?.[0]||'',topServiceBookings:Number(top?.[1]||0)};
  }).sort((a,b)=>b.bookings-a.bookings).slice(0,6);

  const summary={
    bookingsLast28:bookings.length,
    bookingsLast7:serviceStats.reduce((sum,x)=>sum+x.bookingsLast7,0),
    forecastNext7:serviceStats.reduce((sum,x)=>sum+x.forecastNext7,0),
    verifiedWorkers:verifiedAll.size,
    availableWorkers:availableAll.size,
    shortageServices:serviceStats.filter(x=>x.shortage>0).length,
    highestDemandService:serviceStats[0]?.serviceName||'No data'
  };

  const payload={
    generatedAt:new Date().toISOString(),
    lookbackDays:LOOKBACK_DAYS,
    forecastDays:FORECAST_DAYS,
    summary,peak,areas,services:serviceStats,
    methodology:{
      forecast:'Weighted 7-day trend: 55% latest week + 25% previous week + 20% 28-day weekly baseline.',
      workforce:'Recommended workers use observed completed jobs per worker per week; when history is sparse the planning fallback is 4 jobs per worker per week.',
      availability:"A verified worker is counted as available when they have no IN_PROGRESS job and no ACCEPTED booking scheduled for today."
    }
  };

  payload.ai=await maybeAiSummary(payload);
  res.json({success:true,data:payload});
}catch(e){next(e)}});

module.exports=router;

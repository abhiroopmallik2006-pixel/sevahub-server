const express=require('express');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const {notify}=require('../utils/notifications');
const {reply}=require('../services/aiProvider');

const router=express.Router();
const GPS_FRESH_SECONDS=45;
const MAX_GPS_ACCURACY_M=500;
const SEARCH_TTL_SECONDS=90;
const INITIAL_WAVE=3;
const SECOND_WAVE=6;
const FINAL_WAVE=10;

const SERVICE_RULES=[
  {name:'Pest Control',rx:/\b(pest|termite|cockroach|mosquito|bedbug|bed bug|ants?)\b/i},
  {name:'Carpenter',rx:/\b(carpenter|bed|palang|furniture|wood|wooden|door|almirah|wardrobe|table|chair|cabinet|sofa)\b/i},
  {name:'Plumbing',rx:/\b(plumb|plumber|sink|tap|nal|pipe|leak|leaking|drain|toilet|flush|paani)\b/i},
  {name:'Electrician',rx:/\b(electric|electrician|spark|sparking|fan|switch|socket|wiring|light|bulb|mcb|power|short circuit)\b/i},
  {name:'AC Repair',rx:/\b(ac|air conditioner|cooling|compressor)\b/i},
  {name:'Appliance Repair',rx:/\b(fridge|refrigerator|washing machine|microwave|oven|geyser|appliance|mixer|ro|dishwasher)\b/i},
  {name:'Cleaning',rx:/\b(clean|cleaning|safai|dust|deep clean|housekeeping)\b/i},
  {name:'Painting',rx:/\b(paint|painting|wall colour|wall color|putty)\b/i},
  {name:'Home Shifting',rx:/\b(shift|shifting|moving|packing|unpacking|movers|packers)\b/i},
  {name:'Computer/Laptop Repair',rx:/\b(laptop|computer|desktop|pc|printer)\b/i},
  {name:'Beauty & Grooming',rx:/\b(beauty|grooming|salon|haircut|hair cut|makeup)\b/i}
];

async function columnExists(table,column){
  const [rows]=await pool.query('SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',[table,column]);
  return Boolean(rows.length);
}

async function ensureEmergencySchema(){
  if(!(await columnExists('workers','instant_available'))){
    await pool.query('ALTER TABLE workers ADD COLUMN instant_available TINYINT(1) NOT NULL DEFAULT 1');
  }
  if(!(await columnExists('user_locations','captured_at'))){
    await pool.query('ALTER TABLE user_locations ADD COLUMN captured_at DATETIME(3) NULL AFTER accuracy_m');
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS emergency_requests (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    service_id INT NOT NULL,
    problem VARCHAR(1200) NOT NULL,
    address VARCHAR(1000) NOT NULL,
    payment_method VARCHAR(20) NOT NULL DEFAULT 'Cash',
    status VARCHAR(30) NOT NULL DEFAULT 'SEARCHING',
    classification_source VARCHAR(30) NOT NULL DEFAULT 'RULES',
    ai_note VARCHAR(500) NULL,
    user_latitude DECIMAL(10,7) NOT NULL,
    user_longitude DECIMAL(10,7) NOT NULL,
    user_accuracy_m DECIMAL(10,2) NULL,
    matched_worker_id INT NULL,
    matched_booking_id INT NULL,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    matched_at TIMESTAMP NULL DEFAULT NULL,
    expires_at TIMESTAMP NOT NULL,
    INDEX idx_emergency_user_status(user_id,status),
    INDEX idx_emergency_status_expires(status,expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    FOREIGN KEY (matched_worker_id) REFERENCES workers(id) ON DELETE SET NULL,
    FOREIGN KEY (matched_booking_id) REFERENCES bookings(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS emergency_offers (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    request_id BIGINT NOT NULL,
    worker_id INT NOT NULL,
    rank_no INT NOT NULL,
    distance_km DECIMAL(10,3) NOT NULL,
    gps_accuracy_m DECIMAL(10,2) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
    notified_at TIMESTAMP NULL DEFAULT NULL,
    responded_at TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY uq_emergency_offer(request_id,worker_id),
    INDEX idx_emergency_worker_status(worker_id,status),
    INDEX idx_emergency_request_rank(request_id,rank_no),
    FOREIGN KEY (request_id) REFERENCES emergency_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function distanceKm(aLat,aLng,bLat,bLng){
  const rad=n=>n*Math.PI/180,R=6371;
  const dLat=rad(bLat-aLat),dLng=rad(bLng-aLng);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

function detectByRules(problem){
  const rule=SERVICE_RULES.find(r=>r.rx.test(String(problem||'')));
  return rule?.name||'Other';
}

async function classifyService(problem,userId){
  const [services]=await pool.query('SELECT id,name,base_price FROM services ORDER BY id');
  const fallbackName=detectByRules(problem);
  let answer='';
  try{
    const allowed=services.map(s=>s.name).join(', ');
    const prompt=`Emergency household-service classification. Problem: ${String(problem).slice(0,900)}\nAllowed SevaHub services: ${allowed}.\nReturn the single best service name first. Do not invent a service.`;
    answer=await Promise.race([
      reply({message:prompt,context:{sessionId:`emergency-classify-${userId}-${Date.now()}`,role:'USER',platform:{mode:'EMERGENCY_CLASSIFIER',allowedServices:services.map(s=>s.name)}}}),
      new Promise(resolve=>setTimeout(()=>resolve(''),2200))
    ]);
  }catch(e){}
  const aiService=services.find(s=>String(answer||'').toLowerCase().includes(String(s.name).toLowerCase()));
  const fallback=services.find(s=>s.name===fallbackName)||services.find(s=>s.name==='Other')||services[0];
  const service=aiService||fallback;
  return {
    service,
    source:aiService?'AI':'RULES',
    note:aiService?`AI detected ${service.name} from the problem description.`:`Emergency fallback detected ${service.name}.`
  };
}

async function currentFreshLocation(userId){
  const [rows]=await pool.query(`SELECT latitude,longitude,accuracy_m,captured_at,updated_at,sharing_enabled
    FROM user_locations WHERE user_id=? LIMIT 1`,[userId]);
  const l=rows[0];
  if(!l||!l.sharing_enabled)return {ok:false,message:'Turn on SevaHub live location before using Instant Booking.'};
  const captured=l.captured_at||l.updated_at;
  const age=Date.now()-new Date(captured).getTime();
  const accuracy=Number(l.accuracy_m||9999);
  if(!Number.isFinite(age)||age>GPS_FRESH_SECONDS*1000)return {ok:false,message:'Your GPS location is stale. Refresh precise location and try again.'};
  if(!Number.isFinite(accuracy)||accuracy>MAX_GPS_ACCURACY_M)return {ok:false,message:`Your GPS fix is not accurate enough yet (~${Math.round(accuracy)} m). Wait for a better GPS lock.`};
  return {ok:true,latitude:Number(l.latitude),longitude:Number(l.longitude),accuracy,capturedAt:captured};
}

async function eligibleCandidates(serviceId,userLocation){
  const [rows]=await pool.query(`SELECT w.id worker_id,w.user_id worker_user_id,u.full_name,w.experience_years,w.rating,w.total_reviews,
      w.service_radius,ws.price,l.latitude,l.longitude,l.accuracy_m,l.captured_at,l.updated_at
    FROM worker_services ws
    JOIN workers w ON w.id=ws.worker_id
    JOIN users u ON u.id=w.user_id
    JOIN user_locations l ON l.user_id=w.user_id
    WHERE ws.service_id=?
      AND COALESCE(w.verification_status,'PENDING')='VERIFIED'
      AND COALESCE(w.is_banned,0)=0
      AND w.profile_deleted_at IS NULL
      AND COALESCE(w.instant_available,1)=1
      AND l.sharing_enabled=TRUE
      AND COALESCE(l.captured_at,l.updated_at)>=DATE_SUB(NOW(3),INTERVAL ${GPS_FRESH_SECONDS} SECOND)
      AND COALESCE(l.accuracy_m,9999)<=?
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.worker_id=w.id AND b.status IN ('ACCEPTED','IN_PROGRESS'))`,[serviceId,MAX_GPS_ACCURACY_M]);

  return rows.map(r=>{
    const d=distanceKm(userLocation.latitude,userLocation.longitude,Number(r.latitude),Number(r.longitude));
    const radius=Math.max(1,Number(r.service_radius||10));
    return {...r,distanceKm:d,withinRadius:d<=radius};
  }).filter(r=>r.withinRadius).sort((a,b)=>{
    if(Math.abs(a.distanceKm-b.distanceKm)>.15)return a.distanceKm-b.distanceKm;
    const ratingDiff=Number(b.rating||0)-Number(a.rating||0);
    if(Math.abs(ratingDiff)>.01)return ratingDiff;
    return Number(b.experience_years||0)-Number(a.experience_years||0);
  }).slice(0,25);
}

function desiredWave(elapsedSeconds){
  if(elapsedSeconds<25)return INITIAL_WAVE;
  if(elapsedSeconds<55)return SECOND_WAVE;
  return FINAL_WAVE;
}

async function notifyOffer(app,requestId,offer){
  const title='⚡ Instant service request nearby';
  const message=`${offer.service_name} request · ${Number(offer.distance_km).toFixed(1)} km away · Booking request #${requestId}`;
  await notify(app,offer.worker_user_id,title,message,'BOOKING').catch(()=>{});
  try{app.get('io')?.to(`user-${offer.worker_user_id}`).emit('emergency-offer',{requestId,serviceName:offer.service_name,distanceKm:Number(offer.distance_km)})}catch(e){}
}

async function advanceWave(app,requestId){
  await ensureEmergencySchema();
  const conn=await pool.getConnection();
  let activated=[];
  let ended=null;
  try{
    await conn.beginTransaction();
    const [requests]=await conn.query(`SELECT er.*,s.name service_name,TIMESTAMPDIFF(SECOND,er.requested_at,NOW()) elapsed_seconds
      FROM emergency_requests er JOIN services s ON s.id=er.service_id WHERE er.id=? LIMIT 1 FOR UPDATE`,[requestId]);
    const reqRow=requests[0];
    if(!reqRow||reqRow.status!=='SEARCHING'){await conn.commit();return {request:reqRow,activated:[]}}
    const elapsed=Math.max(0,Number(reqRow.elapsed_seconds||0));
    if(new Date(reqRow.expires_at).getTime()<=Date.now()||elapsed>=SEARCH_TTL_SECONDS){
      await conn.query("UPDATE emergency_requests SET status='NO_WORKER_FOUND' WHERE id=? AND status='SEARCHING'",[requestId]);
      await conn.query("UPDATE emergency_offers SET status='EXPIRED',responded_at=COALESCE(responded_at,CURRENT_TIMESTAMP) WHERE request_id=? AND status IN ('QUEUED','OFFERED')",[requestId]);
      ended='NO_WORKER_FOUND';
      await conn.commit();
      return {request:{...reqRow,status:ended},activated:[]};
    }
    const desired=desiredWave(elapsed);
    const [queued]=await conn.query(`SELECT eo.id,eo.worker_id,eo.distance_km,w.user_id worker_user_id,s.name service_name
      FROM emergency_offers eo
      JOIN workers w ON w.id=eo.worker_id
      JOIN emergency_requests er ON er.id=eo.request_id
      JOIN services s ON s.id=er.service_id
      WHERE eo.request_id=? AND eo.status='QUEUED' AND eo.rank_no<=? ORDER BY eo.rank_no FOR UPDATE`,[requestId,desired]);
    if(queued.length){
      const ids=queued.map(x=>Number(x.id));
      await conn.query(`UPDATE emergency_offers SET status='OFFERED',notified_at=CURRENT_TIMESTAMP WHERE id IN (?)`,[ids]);
      activated=queued;
    }
    await conn.commit();
  }catch(e){
    await conn.rollback().catch(()=>{});
    throw e;
  }finally{conn.release()}
  if(activated.length)await Promise.allSettled(activated.map(o=>notifyOffer(app,requestId,o)));
  return {activated,ended};
}

function indiaDateTime(){
  const d=new Date(Date.now()+330*60*1000);
  const date=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const time=`${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:${String(d.getUTCSeconds()).padStart(2,'0')}`;
  return {date,time};
}

router.post('/analyse',auth,authorize('USER'),async(req,res,next)=>{try{
  await ensureEmergencySchema();
  const problem=String(req.body.problem||'').trim();
  if(problem.length<5||problem.length>1200)return res.status(400).json({success:false,message:'Describe the urgent household service problem in 5 to 1200 characters.'});
  const result=await classifyService(problem,req.user.id);
  res.json({success:true,data:{serviceId:Number(result.service.id),serviceName:result.service.name,basePrice:Number(result.service.base_price||0),classificationSource:result.source,note:result.note}});
}catch(e){next(e)}});

router.post('/requests',auth,authorize('USER'),async(req,res,next)=>{try{
  await ensureEmergencySchema();
  const problem=String(req.body.problem||'').trim();
  const address=String(req.body.address||'').trim();
  const paymentMethod=['Cash','UPI','Card'].includes(String(req.body.paymentMethod||''))?String(req.body.paymentMethod):'Cash';
  if(problem.length<5||problem.length>1200)return res.status(400).json({success:false,message:'Describe the urgent household service problem in 5 to 1200 characters.'});
  if(address.length<3||address.length>1000)return res.status(400).json({success:false,message:'Add a landmark/address so the matched worker can reach you.'});

  await pool.query("UPDATE emergency_requests SET status='NO_WORKER_FOUND' WHERE user_id=? AND status='SEARCHING' AND expires_at<=NOW()",[req.user.id]);
  const [active]=await pool.query("SELECT id FROM emergency_requests WHERE user_id=? AND status='SEARCHING' AND expires_at>NOW() ORDER BY id DESC LIMIT 1",[req.user.id]);
  if(active.length)return res.status(409).json({success:false,message:`Instant request #${active[0].id} is already searching. Cancel it before starting another.`});

  const gps=await currentFreshLocation(req.user.id);
  if(!gps.ok)return res.status(422).json({success:false,message:gps.message});

  let classified;
  const requestedServiceId=Number(req.body.serviceId);
  if(Number.isInteger(requestedServiceId)&&requestedServiceId>0){
    const [rows]=await pool.query('SELECT id,name,base_price FROM services WHERE id=? LIMIT 1',[requestedServiceId]);
    if(!rows.length)return res.status(400).json({success:false,message:'Selected service was not found'});
    classified={service:rows[0],source:String(req.body.classificationSource||'AI').slice(0,30),note:'AI/user-confirmed emergency service.'};
  }else classified=await classifyService(problem,req.user.id);

  const candidates=await eligibleCandidates(Number(classified.service.id),gps);
  if(!candidates.length)return res.status(404).json({success:false,message:`No verified ${classified.service.name} worker currently has fresh GPS and availability within their service radius.`});

  const conn=await pool.getConnection();
  let requestId;
  try{
    await conn.beginTransaction();
    const [r]=await conn.query(`INSERT INTO emergency_requests(user_id,service_id,problem,address,payment_method,status,classification_source,ai_note,user_latitude,user_longitude,user_accuracy_m,expires_at)
      VALUES(?,?,?,?,?,'SEARCHING',?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ${SEARCH_TTL_SECONDS} SECOND))`,[
      req.user.id,classified.service.id,problem,address,paymentMethod,classified.source,classified.note,gps.latitude,gps.longitude,gps.accuracy
    ]);
    requestId=Number(r.insertId);
    for(let i=0;i<candidates.length;i++){
      const c=candidates[i];
      await conn.query(`INSERT INTO emergency_offers(request_id,worker_id,rank_no,distance_km,gps_accuracy_m,status)
        VALUES(?,?,?,?,?,'QUEUED')`,[requestId,c.worker_id,i+1,Number(c.distanceKm.toFixed(3)),Number(c.accuracy_m||0)]);
    }
    await conn.commit();
  }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}

  await advanceWave(req.app,requestId);
  res.status(201).json({success:true,data:{requestId,status:'SEARCHING',serviceId:Number(classified.service.id),serviceName:classified.service.name,basePrice:Number(classified.service.base_price||0),classificationSource:classified.source,aiNote:classified.note,gpsAccuracy:Math.round(gps.accuracy),eligibleWorkers:candidates.length,notifiedNow:Math.min(INITIAL_WAVE,candidates.length),expiresInSeconds:SEARCH_TTL_SECONDS}});
}catch(e){next(e)}});

router.get('/requests/:id',auth,authorize('USER'),async(req,res,next)=>{try{
  await ensureEmergencySchema();
  const requestId=Number(req.params.id);
  if(!Number.isInteger(requestId)||requestId<1)return res.status(400).json({success:false,message:'Invalid instant request'});
  await advanceWave(req.app,requestId);
  const [rows]=await pool.query(`SELECT er.id,er.status,er.service_id,er.problem,er.classification_source,er.ai_note,er.user_accuracy_m,
      er.matched_booking_id,er.matched_worker_id,er.requested_at,er.matched_at,er.expires_at,s.name service_name,
      u.full_name worker_name,w.rating worker_rating,w.experience_years,
      (SELECT COUNT(*) FROM emergency_offers eo WHERE eo.request_id=er.id) eligible_workers,
      (SELECT COUNT(*) FROM emergency_offers eo WHERE eo.request_id=er.id AND eo.status IN ('OFFERED','ACCEPTED','DECLINED','CLOSED','EXPIRED')) reached_workers
    FROM emergency_requests er
    JOIN services s ON s.id=er.service_id
    LEFT JOIN workers w ON w.id=er.matched_worker_id
    LEFT JOIN users u ON u.id=w.user_id
    WHERE er.id=? AND er.user_id=? LIMIT 1`,[requestId,req.user.id]);
  if(!rows.length)return res.status(404).json({success:false,message:'Instant request not found'});
  const r=rows[0];
  res.json({success:true,data:{requestId:Number(r.id),status:r.status,serviceId:Number(r.service_id),serviceName:r.service_name,problem:r.problem,classificationSource:r.classification_source,aiNote:r.ai_note,gpsAccuracy:Number(r.user_accuracy_m||0),matchedBookingId:r.matched_booking_id?Number(r.matched_booking_id):null,matchedWorkerId:r.matched_worker_id?Number(r.matched_worker_id):null,workerName:r.worker_name||null,workerRating:Number(r.worker_rating||0),workerExperience:Number(r.experience_years||0),eligibleWorkers:Number(r.eligible_workers||0),reachedWorkers:Number(r.reached_workers||0),requestedAt:r.requested_at,matchedAt:r.matched_at,expiresAt:r.expires_at}});
}catch(e){next(e)}});

router.post('/requests/:id/cancel',auth,authorize('USER'),async(req,res,next)=>{try{
  await ensureEmergencySchema();
  const requestId=Number(req.params.id);
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query('SELECT status FROM emergency_requests WHERE id=? AND user_id=? LIMIT 1 FOR UPDATE',[requestId,req.user.id]);
    if(!rows.length){await conn.rollback();return res.status(404).json({success:false,message:'Instant request not found'})}
    if(rows[0].status!=='SEARCHING'){await conn.rollback();return res.status(409).json({success:false,message:'Only a searching request can be cancelled'})}
    await conn.query("UPDATE emergency_requests SET status='CANCELLED' WHERE id=?",[requestId]);
    await conn.query("UPDATE emergency_offers SET status='CLOSED',responded_at=COALESCE(responded_at,CURRENT_TIMESTAMP) WHERE request_id=? AND status IN ('QUEUED','OFFERED')",[requestId]);
    await conn.commit();
  }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
  res.json({success:true,message:'Instant request cancelled'});
}catch(e){next(e)}});

router.get('/worker/availability',auth,authorize('WORKER'),async(req,res,next)=>{try{
  await ensureEmergencySchema();
  const [rows]=await pool.query('SELECT id,COALESCE(instant_available,1) instant_available FROM workers WHERE user_id=? LIMIT 1',[req.user.id]);
  if(!rows.length)return res.status(404).json({success:false,message:'Worker profile not found'});
  const gps=await currentFreshLocation(req.user.id);
  res.json({success:true,data:{workerId:Number(rows[0].id),instantAvailable:Boolean(rows[0].instant_available),gpsReady:Boolean(gps.ok),gpsAccuracy:gps.ok?Math.round(gps.accuracy):null,gpsMessage:gps.ok?null:gps.message}});
}catch(e){next(e)}});

router.put('/worker/availability',auth,authorize('WORKER'),async(req,res,next)=>{try{
  await ensureEmergencySchema();
  const available=Boolean(req.body.available);
  const [workers]=await pool.query('SELECT id,is_banned,profile_deleted_at FROM workers WHERE user_id=? LIMIT 1',[req.user.id]);
  if(!workers.length)return res.status(404).json({success:false,message:'Worker profile not found'});
  if(available&&(workers[0].is_banned||workers[0].profile_deleted_at))return res.status(403).json({success:false,message:'Restricted/deleted worker profiles cannot receive Instant Jobs'});
  await pool.query('UPDATE workers SET instant_available=? WHERE id=?',[available?1:0,workers[0].id]);
  if(!available)await pool.query("UPDATE emergency_offers eo JOIN emergency_requests er ON er.id=eo.request_id SET eo.status='DECLINED',eo.responded_at=CURRENT_TIMESTAMP WHERE eo.worker_id=? AND er.status='SEARCHING' AND eo.status IN ('QUEUED','OFFERED')",[workers[0].id]);
  res.json({success:true,data:{instantAvailable:available}});
}catch(e){next(e)}});

router.get('/worker/offers',auth,authorize('WORKER'),async(req,res,next)=>{try{
  await ensureEmergencySchema();
  const [workers]=await pool.query('SELECT id FROM workers WHERE user_id=? LIMIT 1',[req.user.id]);
  if(!workers.length)return res.status(404).json({success:false,message:'Worker profile not found'});
  const workerId=Number(workers[0].id);
  const [requestIds]=await pool.query("SELECT DISTINCT request_id FROM emergency_offers WHERE worker_id=? AND status IN ('QUEUED','OFFERED')",[workerId]);
  for(const row of requestIds)await advanceWave(req.app,Number(row.request_id));
  const [rows]=await pool.query(`SELECT er.id request_id,er.problem,er.requested_at,er.expires_at,s.name service_name,
      eo.distance_km,eo.status offer_status,ws.price
    FROM emergency_offers eo
    JOIN emergency_requests er ON er.id=eo.request_id
    JOIN services s ON s.id=er.service_id
    JOIN worker_services ws ON ws.worker_id=eo.worker_id AND ws.service_id=er.service_id
    WHERE eo.worker_id=? AND eo.status='OFFERED' AND er.status='SEARCHING' AND er.expires_at>NOW()
    ORDER BY eo.rank_no,er.requested_at DESC`,[workerId]);
  res.json({success:true,data:rows.map(r=>({requestId:Number(r.request_id),serviceName:r.service_name,problem:r.problem,distanceKm:Number(r.distance_km),price:Number(r.price),requestedAt:r.requested_at,expiresAt:r.expires_at}))});
}catch(e){next(e)}});

router.post('/worker/offers/:id/decline',auth,authorize('WORKER'),async(req,res,next)=>{try{
  await ensureEmergencySchema();
  const requestId=Number(req.params.id);
  const [r]=await pool.query(`UPDATE emergency_offers eo JOIN workers w ON w.id=eo.worker_id
    SET eo.status='DECLINED',eo.responded_at=CURRENT_TIMESTAMP
    WHERE eo.request_id=? AND w.user_id=? AND eo.status='OFFERED'`,[requestId,req.user.id]);
  if(!r.affectedRows)return res.status(409).json({success:false,message:'This instant offer is no longer active'});
  res.json({success:true,message:'Instant offer declined'});
}catch(e){next(e)}});

router.post('/worker/offers/:id/accept',auth,authorize('WORKER'),async(req,res,next)=>{
  await ensureEmergencySchema();
  const requestId=Number(req.params.id);
  const conn=await pool.getConnection();
  let result=null;
  try{
    await conn.beginTransaction();
    const [workers]=await conn.query(`SELECT id,user_id,verification_status,is_banned,profile_deleted_at,instant_available
      FROM workers WHERE user_id=? LIMIT 1 FOR UPDATE`,[req.user.id]);
    const worker=workers[0];
    if(!worker){await conn.rollback();return res.status(404).json({success:false,message:'Worker profile not found'})}
    if(worker.verification_status!=='VERIFIED'||worker.is_banned||worker.profile_deleted_at||!worker.instant_available){await conn.rollback();return res.status(403).json({success:false,message:'Your worker profile is not eligible for Instant Jobs'})}

    const [requests]=await conn.query(`SELECT er.*,s.name service_name FROM emergency_requests er JOIN services s ON s.id=er.service_id WHERE er.id=? LIMIT 1 FOR UPDATE`,[requestId]);
    const er=requests[0];
    if(!er){await conn.rollback();return res.status(404).json({success:false,message:'Instant request not found'})}
    if(er.status!=='SEARCHING'||new Date(er.expires_at).getTime()<=Date.now()){await conn.rollback();return res.status(409).json({success:false,message:'Another worker already matched this request or it expired'})}

    const [offers]=await conn.query("SELECT id,status FROM emergency_offers WHERE request_id=? AND worker_id=? LIMIT 1 FOR UPDATE",[requestId,worker.id]);
    if(!offers.length||offers[0].status!=='OFFERED'){await conn.rollback();return res.status(409).json({success:false,message:'This instant offer is no longer available'})}

    const [services]=await conn.query('SELECT price FROM worker_services WHERE worker_id=? AND service_id=? LIMIT 1',[worker.id,er.service_id]);
    if(!services.length){await conn.rollback();return res.status(409).json({success:false,message:'Your service listing is no longer active'})}
    const [busy]=await conn.query("SELECT id FROM bookings WHERE worker_id=? AND status IN ('ACCEPTED','IN_PROGRESS') LIMIT 1 FOR UPDATE",[worker.id]);
    if(busy.length){await conn.rollback();return res.status(409).json({success:false,message:'You already have an active job'})}
    const [locs]=await conn.query(`SELECT accuracy_m,captured_at,updated_at,sharing_enabled FROM user_locations WHERE user_id=? LIMIT 1`,[req.user.id]);
    const loc=locs[0],captured=loc?(loc.captured_at||loc.updated_at):null;
    const fresh=loc&&loc.sharing_enabled&&captured&&(Date.now()-new Date(captured).getTime()<=GPS_FRESH_SECONDS*1000)&&Number(loc.accuracy_m||9999)<=MAX_GPS_ACCURACY_M;
    if(!fresh){await conn.rollback();return res.status(409).json({success:false,message:'Your GPS is no longer fresh enough. Refresh Location before accepting.'})}

    const when=indiaDateTime();
    const instructions=`[INSTANT / AI-GPS] ${er.problem}`.slice(0,5000);
    const [booking]=await conn.query(`INSERT INTO bookings(user_id,worker_id,service_id,booking_date,booking_time,address,instructions,original_price,payment_method,status)
      VALUES(?,?,?,?,?,?,?,?,?,'ACCEPTED')`,[er.user_id,worker.id,er.service_id,when.date,when.time,er.address,instructions,services[0].price,er.payment_method]);
    const bookingId=Number(booking.insertId);
    await conn.query("UPDATE emergency_requests SET status='MATCHED',matched_worker_id=?,matched_booking_id=?,matched_at=CURRENT_TIMESTAMP WHERE id=?",[worker.id,bookingId,requestId]);
    await conn.query("UPDATE emergency_offers SET status=CASE WHEN worker_id=? THEN 'ACCEPTED' ELSE 'CLOSED' END,responded_at=CURRENT_TIMESTAMP WHERE request_id=? AND status IN ('QUEUED','OFFERED')",[worker.id,requestId]);
    await conn.commit();
    result={bookingId,userId:Number(er.user_id),serviceName:er.service_name,workerId:Number(worker.id),price:Number(services[0].price)};
  }catch(e){await conn.rollback().catch(()=>{});return next(e)}finally{conn.release()}

  await notify(req.app,result.userId,'⚡ Instant worker matched',`${result.serviceName} worker accepted your urgent request. Booking #${result.bookingId} is confirmed.`,'BOOKING').catch(()=>{});
  try{
    const io=req.app.get('io');
    io?.to(`user-${result.userId}`).emit('emergency-matched',{requestId,bookingId:result.bookingId,workerId:result.workerId,serviceName:result.serviceName});
    io?.to(`user-${req.user.id}`).emit('emergency-accepted',{requestId,bookingId:result.bookingId});
  }catch(e){}
  res.json({success:true,data:{requestId,bookingId:result.bookingId,status:'MATCHED',price:result.price}});
});

module.exports=router;

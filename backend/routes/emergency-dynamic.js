const express=require('express');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const {notify}=require('../utils/notifications');
const {ensureWorkerModeration}=require('../utils/workerModeration');

const router=express.Router();
const USER_GPS_FRESH_SECONDS=45;
const DISCOVERY_GPS_FRESH_SECONDS=120;
const MAX_GPS_ACCURACY_M=500;
const SEARCH_TTL_SECONDS=90;
const INITIAL_WAVE=3;
let schemaPromise=null;

async function columnExists(table,column){
  const [rows]=await pool.query('SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',[table,column]);
  return Boolean(rows.length);
}

async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await ensureWorkerModeration(pool);
      await pool.query(`CREATE TABLE IF NOT EXISTS user_locations (
        user_id INT PRIMARY KEY,
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        accuracy_m DECIMAL(10,2) NULL,
        captured_at DATETIME(3) NULL,
        sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_location_sharing_updated (sharing_enabled,updated_at)
      )`);
      if(!(await columnExists('workers','instant_available'))){
        await pool.query('ALTER TABLE workers ADD COLUMN instant_available TINYINT(1) NOT NULL DEFAULT 0');
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
    })();
  }
  return schemaPromise.catch(err=>{schemaPromise=null;throw err});
}

function distanceKm(aLat,aLng,bLat,bLng){
  const rad=n=>n*Math.PI/180,R=6371;
  const dLat=rad(bLat-aLat),dLng=rad(bLng-aLng);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

async function currentFreshUserLocation(userId){
  const [rows]=await pool.query(`SELECT latitude,longitude,accuracy_m,captured_at,updated_at,sharing_enabled
    FROM user_locations WHERE user_id=? LIMIT 1`,[userId]);
  const l=rows[0];
  if(!l||!l.sharing_enabled)return {ok:false,message:'Turn on SevaHub live location before using Instant Booking.'};
  const captured=l.captured_at||l.updated_at;
  const age=Date.now()-new Date(captured).getTime();
  const accuracy=Number(l.accuracy_m||9999);
  if(!Number.isFinite(age)||age>USER_GPS_FRESH_SECONDS*1000)return {ok:false,message:'Your GPS location is stale. Refresh precise location and try again.'};
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
      AND UPPER(COALESCE(w.verification_status,'PENDING'))='VERIFIED'
      AND COALESCE(w.is_banned,0)=0
      AND w.profile_deleted_at IS NULL
      AND COALESCE(w.instant_available,0)=1
      AND l.sharing_enabled=TRUE
      AND COALESCE(l.captured_at,l.updated_at)>=DATE_SUB(NOW(3),INTERVAL ${DISCOVERY_GPS_FRESH_SECONDS} SECOND)
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

async function refreshCandidatePool(requestId){
  await ensureSchema();
  const [requests]=await pool.query(`SELECT id,status,service_id,user_latitude,user_longitude,expires_at
    FROM emergency_requests WHERE id=? LIMIT 1`,[requestId]);
  const request=requests[0];
  if(!request||request.status!=='SEARCHING'||new Date(request.expires_at).getTime()<=Date.now())return {added:0,total:0};

  const candidates=await eligibleCandidates(Number(request.service_id),{
    latitude:Number(request.user_latitude),
    longitude:Number(request.user_longitude)
  });
  const [existing]=await pool.query('SELECT worker_id,rank_no FROM emergency_offers WHERE request_id=? ORDER BY rank_no',[requestId]);
  const existingIds=new Set(existing.map(x=>Number(x.worker_id)));
  let nextRank=existing.reduce((m,x)=>Math.max(m,Number(x.rank_no||0)),0)+1;
  let added=0;
  for(const c of candidates){
    if(existingIds.has(Number(c.worker_id)))continue;
    const [r]=await pool.query(`INSERT IGNORE INTO emergency_offers(request_id,worker_id,rank_no,distance_km,gps_accuracy_m,status)
      VALUES(?,?,?,?,?,'QUEUED')`,[requestId,c.worker_id,nextRank,Number(c.distanceKm.toFixed(3)),Number(c.accuracy_m||0)]);
    if(r.affectedRows){added++;nextRank++}
  }
  const [counts]=await pool.query('SELECT COUNT(*) total FROM emergency_offers WHERE request_id=?',[requestId]);
  return {added,total:Number(counts[0]?.total||0)};
}

async function activateInitialOffers(app,requestId){
  const conn=await pool.getConnection();
  let activated=[];
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query(`SELECT eo.id,eo.worker_id,eo.distance_km,w.user_id worker_user_id,s.name service_name
      FROM emergency_offers eo
      JOIN workers w ON w.id=eo.worker_id
      JOIN emergency_requests er ON er.id=eo.request_id
      JOIN services s ON s.id=er.service_id
      WHERE eo.request_id=? AND eo.status='QUEUED' AND eo.rank_no<=? ORDER BY eo.rank_no FOR UPDATE`,[requestId,INITIAL_WAVE]);
    if(rows.length){
      const ids=rows.map(x=>Number(x.id));
      await conn.query(`UPDATE emergency_offers SET status='OFFERED',notified_at=CURRENT_TIMESTAMP WHERE id IN (?)`,[ids]);
      activated=rows;
    }
    await conn.commit();
  }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}

  await Promise.allSettled(activated.map(async offer=>{
    const title='⚡ Instant service request nearby';
    const message=`${offer.service_name} request · ${Number(offer.distance_km).toFixed(1)} km away · Booking request #${requestId}`;
    await notify(app,offer.worker_user_id,title,message,'BOOKING').catch(()=>{});
    try{app.get('io')?.to(`user-${offer.worker_user_id}`).emit('emergency-offer',{requestId,serviceName:offer.service_name,distanceKm:Number(offer.distance_km)})}catch(e){}
  }));
  return activated.length;
}

router.post('/requests',auth,authorize('USER'),async(req,res,next)=>{try{
  const requestedServiceId=Number(req.body.serviceId);
  if(!Number.isInteger(requestedServiceId)||requestedServiceId<1)return next();
  await ensureSchema();

  const problem=String(req.body.problem||'').trim();
  const address=String(req.body.address||'').trim();
  const paymentMethod=['Cash','UPI','Card'].includes(String(req.body.paymentMethod||''))?String(req.body.paymentMethod):'Cash';
  if(problem.length<5||problem.length>1200)return res.status(400).json({success:false,message:'Describe the urgent household service problem in 5 to 1200 characters.'});
  if(address.length<3||address.length>1000)return res.status(400).json({success:false,message:'Add a landmark/address so the matched worker can reach you.'});

  await pool.query("UPDATE emergency_requests SET status='NO_WORKER_FOUND' WHERE user_id=? AND status='SEARCHING' AND expires_at<=NOW()",[req.user.id]);
  const [active]=await pool.query("SELECT id FROM emergency_requests WHERE user_id=? AND status='SEARCHING' AND expires_at>NOW() ORDER BY id DESC LIMIT 1",[req.user.id]);
  if(active.length)return res.status(409).json({success:false,message:`Instant request #${active[0].id} is already searching. Cancel it before starting another.`});

  const gps=await currentFreshUserLocation(req.user.id);
  if(!gps.ok)return res.status(422).json({success:false,message:gps.message});
  const [services]=await pool.query('SELECT id,name,base_price FROM services WHERE id=? LIMIT 1',[requestedServiceId]);
  if(!services.length)return res.status(400).json({success:false,message:'Selected service was not found'});
  const service=services[0];
  const source=String(req.body.classificationSource||'').toUpperCase()==='AI'?'AI_CONFIRMED':'USER_CONFIRMED';
  const note=source==='AI_CONFIRMED'?`AI detected ${service.name}; customer confirmed the service.`:`Customer confirmed ${service.name}.`;

  const [created]=await pool.query(`INSERT INTO emergency_requests(user_id,service_id,problem,address,payment_method,status,classification_source,ai_note,user_latitude,user_longitude,user_accuracy_m,expires_at)
    VALUES(?,?,?,?,?,'SEARCHING',?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ${SEARCH_TTL_SECONDS} SECOND))`,[
    req.user.id,service.id,problem,address,paymentMethod,source,note,gps.latitude,gps.longitude,gps.accuracy
  ]);
  const requestId=Number(created.insertId);
  const poolState=await refreshCandidatePool(requestId);
  const notifiedNow=await activateInitialOffers(req.app,requestId);

  res.status(201).json({success:true,data:{
    requestId,status:'SEARCHING',serviceId:Number(service.id),serviceName:service.name,basePrice:Number(service.base_price||0),
    classificationSource:source,aiNote:note,gpsAccuracy:Math.round(gps.accuracy),eligibleWorkers:poolState.total,
    notifiedNow,expiresInSeconds:SEARCH_TTL_SECONDS,dynamicDiscovery:true
  }});
}catch(e){next(e)}});

router.get('/requests/:id',auth,authorize('USER'),async(req,res,next)=>{try{
  await ensureSchema();
  const requestId=Number(req.params.id);
  if(!Number.isInteger(requestId)||requestId<1)return next();
  const [owned]=await pool.query('SELECT id FROM emergency_requests WHERE id=? AND user_id=? LIMIT 1',[requestId,req.user.id]);
  if(owned.length)await refreshCandidatePool(requestId);
  next();
}catch(e){next(e)}});

router.get('/worker/offers',auth,authorize('WORKER'),async(req,res,next)=>{try{
  await ensureSchema();
  const [active]=await pool.query("SELECT id FROM emergency_requests WHERE status='SEARCHING' AND expires_at>NOW() ORDER BY requested_at DESC LIMIT 50");
  for(const row of active)await refreshCandidatePool(Number(row.id));
  next();
}catch(e){next(e)}});

module.exports=router;

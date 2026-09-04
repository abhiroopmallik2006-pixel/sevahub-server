const express=require('express');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const router=express.Router();

const LIVE_MS=25*1000;
const NEARBY_FRESH_MS=45*1000;
const MAX_LIVE_ACCURACY_M=500;
const MAX_ACCEPTED_ACCURACY_M=1500;
const MAX_CAPTURE_AGE_MS=60*1000;
const REQUEST_STATUSES=['PENDING','BARGAINING','COUNTER_OFFER_PENDING_USER'];

async function columnExists(table,column){
  const [rows]=await pool.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',
    [table,column]
  );
  return Boolean(rows.length);
}

async function ensureLocationTable(){
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
  if(!(await columnExists('user_locations','captured_at'))){
    await pool.query('ALTER TABLE user_locations ADD COLUMN captured_at DATETIME(3) NULL AFTER accuracy_m');
  }
}

function validLatLng(lat,lng){
  return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180;
}

function distanceKm(aLat,aLng,bLat,bLng){
  const toRad=n=>n*Math.PI/180;
  const R=6371;
  const dLat=toRad(bLat-aLat);
  const dLng=toRad(bLng-aLng);
  const s=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}

function parseCapturedAt(value){
  const ms=Date.parse(String(value||''));
  const now=Date.now();
  if(!Number.isFinite(ms))return now;
  if(ms>now+10000)return now;
  return ms;
}

function locationAgeMs(row){
  const value=row?.captured_at||row?.updated_at;
  const ms=value?new Date(value).getTime():0;
  return ms?Math.max(0,Date.now()-ms):Infinity;
}

async function activeCounterparts(user){
  if(user.role==='WORKER'){
    const [rows]=await pool.query(`SELECT b.id booking_id,b.user_id counterpart_user_id
      FROM bookings b JOIN workers w ON w.id=b.worker_id
      WHERE w.user_id=? AND b.status IN ('ACCEPTED','IN_PROGRESS')`,[user.id]);
    return rows;
  }
  const [rows]=await pool.query(`SELECT b.id booking_id,w.user_id counterpart_user_id
    FROM bookings b JOIN workers w ON w.id=b.worker_id
    WHERE b.user_id=? AND b.status IN ('PENDING','BARGAINING','COUNTER_OFFER_PENDING_USER','ACCEPTED','IN_PROGRESS')`,[user.id]);
  return rows;
}

function emitLocationSignal(req,user,type='location-updated',extra={}){
  const io=req.app.get('io');
  if(!io)return;
  activeCounterparts(user).then(rows=>{
    rows.forEach(r=>io.to(`user-${r.counterpart_user_id}`).emit(type,{
      bookingId:r.booking_id,
      userId:user.id,
      updatedAt:new Date().toISOString(),
      ...extra
    }));
  }).catch(()=>{});
}

router.get('/me',auth,async(req,res,next)=>{try{
  await ensureLocationTable();
  const [rows]=await pool.query(`SELECT latitude,longitude,accuracy_m,captured_at,sharing_enabled,updated_at FROM user_locations WHERE user_id=?`,[req.user.id]);
  const r=rows[0];
  res.json({success:true,data:r?{
    sharingEnabled:Boolean(r.sharing_enabled),
    latitude:Number(r.latitude),longitude:Number(r.longitude),
    accuracy:Number(r.accuracy_m||0),capturedAt:r.captured_at||r.updated_at,updatedAt:r.updated_at,
    isLive:Boolean(r.sharing_enabled)&&locationAgeMs(r)<=LIVE_MS&&Number(r.accuracy_m||0)<=MAX_LIVE_ACCURACY_M
  }:{sharingEnabled:false}});
}catch(e){next(e)}});

router.post('/me',auth,async(req,res,next)=>{try{
  await ensureLocationTable();
  const lat=Number(req.body.latitude);
  const lng=Number(req.body.longitude);
  const accuracy=Number(req.body.accuracy||0);
  const capturedMs=parseCapturedAt(req.body.capturedAt);
  const captureAge=Math.max(0,Date.now()-capturedMs);
  if(!validLatLng(lat,lng))return res.status(400).json({success:false,message:'Invalid location coordinates'});
  if(!Number.isFinite(accuracy)||accuracy<0||accuracy>MAX_ACCEPTED_ACCURACY_M){
    return res.status(422).json({success:false,message:'GPS accuracy is too low. Keep GPS on and move near a window or outdoors for a better fix.'});
  }
  if(captureAge>MAX_CAPTURE_AGE_MS){
    return res.status(422).json({success:false,message:'Stale GPS sample rejected. Waiting for a fresh device location.'});
  }

  const [existingRows]=await pool.query(`SELECT latitude,longitude,accuracy_m,captured_at,updated_at
    FROM user_locations WHERE user_id=? LIMIT 1`,[req.user.id]);
  const previous=existingRows[0];
  if(previous){
    const previousAccuracy=Math.max(1,Number(previous.accuracy_m||9999));
    const previousAge=locationAgeMs(previous);
    const movedM=distanceKm(Number(previous.latitude),Number(previous.longitude),lat,lng)*1000;
    const muchWorse=accuracy>Math.max(80,previousAccuracy*2.5);
    const meaningfulMove=movedM>Math.max(8,Math.min(250,(accuracy+previousAccuracy)*0.55));
    if(muchWorse&&previousAge<20000&&!meaningfulMove){
      return res.json({success:true,data:{sharingEnabled:true,ignored:true,reason:'WORSE_ACCURACY',accuracy:previousAccuracy,capturedAt:previous.captured_at||previous.updated_at}});
    }
  }

  const capturedAt=new Date(capturedMs);
  await pool.query(`INSERT INTO user_locations(user_id,latitude,longitude,accuracy_m,captured_at,sharing_enabled)
    VALUES(?,?,?,?,?,TRUE)
    ON DUPLICATE KEY UPDATE latitude=VALUES(latitude),longitude=VALUES(longitude),accuracy_m=VALUES(accuracy_m),captured_at=VALUES(captured_at),sharing_enabled=TRUE,updated_at=CURRENT_TIMESTAMP`,
    [req.user.id,lat,lng,accuracy,capturedAt]);

  emitLocationSignal(req,req.user,'location-updated',{accuracy,capturedAt:capturedAt.toISOString()});
  res.json({success:true,data:{sharingEnabled:true,accuracy,capturedAt:capturedAt.toISOString(),updatedAt:new Date().toISOString(),isLive:accuracy<=MAX_LIVE_ACCURACY_M}});
}catch(e){next(e)}});

router.delete('/me',auth,async(req,res,next)=>{try{
  await ensureLocationTable();
  await pool.query('UPDATE user_locations SET sharing_enabled=FALSE WHERE user_id=?',[req.user.id]);
  emitLocationSignal(req,req.user,'location-sharing-stopped');
  res.json({success:true,message:'Location sharing stopped'});
}catch(e){next(e)}});

router.get('/nearby-workers',auth,authorize('USER'),async(req,res,next)=>{try{
  await ensureLocationTable();
  const lat=Number(req.query.lat),lng=Number(req.query.lng),serviceId=Number(req.query.serviceId);
  const userAccuracy=Math.max(0,Number(req.query.accuracy||0));
  const userCapturedMs=parseCapturedAt(req.query.capturedAt);
  const radiusKm=Math.max(1,Math.min(50,Number(req.query.radiusKm||25)));
  if(!validLatLng(lat,lng))return res.status(400).json({success:false,message:'Your current location is required'});
  if(!Number.isInteger(serviceId)||serviceId<1)return res.status(400).json({success:false,message:'Invalid service'});
  if(userAccuracy>MAX_LIVE_ACCURACY_M)return res.status(422).json({success:false,message:'Your GPS fix is not accurate enough yet. Wait a moment and try again.'});
  if(Date.now()-userCapturedMs>NEARBY_FRESH_MS)return res.status(422).json({success:false,message:'Your location is stale. Refresh GPS and try again.'});

  const [rows]=await pool.query(`SELECT w.id worker_id,w.service_radius,l.latitude,l.longitude,l.accuracy_m,l.captured_at,l.updated_at
    FROM worker_services ws
    JOIN workers w ON w.id=ws.worker_id
    JOIN user_locations l ON l.user_id=w.user_id
    WHERE ws.service_id=?
      AND l.sharing_enabled=TRUE
      AND COALESCE(l.captured_at,l.updated_at)>=DATE_SUB(NOW(3),INTERVAL 45 SECOND)
      AND COALESCE(l.accuracy_m,9999)<=?`,[serviceId,MAX_LIVE_ACCURACY_M]);

  const data=rows.map(r=>{
    const d=distanceKm(lat,lng,Number(r.latitude),Number(r.longitude));
    const effectiveRadius=Math.min(radiusKm,Math.max(1,Number(r.service_radius||10)));
    const workerAccuracy=Math.max(0,Number(r.accuracy_m||0));
    const uncertaintyM=Math.round(Math.sqrt(userAccuracy**2+workerAccuracy**2));
    return {
      workerId:Number(r.worker_id),
      distanceKm:Number(d.toFixed(3)),
      withinServiceRadius:d<=effectiveRadius,
      capturedAt:r.captured_at||r.updated_at,
      updatedAt:r.updated_at,
      accuracy:workerAccuracy,
      uncertaintyM
    };
  }).filter(r=>r.withinServiceRadius).sort((a,b)=>a.distanceKm-b.distanceKm);

  res.json({success:true,data});
}catch(e){next(e)}});

router.get('/booking/:id',auth,async(req,res,next)=>{try{
  await ensureLocationTable();
  const bookingId=Number(req.params.id);
  if(!Number.isInteger(bookingId)||bookingId<1)return res.status(400).json({success:false,message:'Invalid booking'});

  const [rows]=await pool.query(`SELECT b.id,b.status,b.user_id,b.address,w.user_id worker_user_id,
    cu.full_name customer_name,cu.phone customer_phone,wu.full_name worker_name
    FROM bookings b
    JOIN workers w ON w.id=b.worker_id
    JOIN users cu ON cu.id=b.user_id
    JOIN users wu ON wu.id=w.user_id
    WHERE b.id=?`,[bookingId]);
  if(!rows.length)return res.status(404).json({success:false,message:'Booking not found'});
  const b=rows[0];
  const isCustomer=Number(req.user.id)===Number(b.user_id);
  const isWorker=Number(req.user.id)===Number(b.worker_user_id);
  if(!isCustomer&&!isWorker)return res.status(403).json({success:false,message:'You cannot view this booking location'});

  const active=['ACCEPTED','IN_PROGRESS'].includes(b.status);
  const requestForAssignedWorker=REQUEST_STATUSES.includes(b.status)&&isWorker;
  if(!active&&!requestForAssignedWorker){
    return res.status(400).json({success:false,message:'Customer details are available to the assigned worker while the request is pending, bargaining, or active. Worker live tracking starts after acceptance.'});
  }

  const [locs]=await pool.query(`SELECT user_id,latitude,longitude,accuracy_m,captured_at,sharing_enabled,updated_at
    FROM user_locations WHERE user_id IN (?,?)`,[b.user_id,b.worker_user_id]);
  const byUser=new Map(locs.map(x=>[Number(x.user_id),x]));
  const shape=(id,name)=>{
    const l=byUser.get(Number(id));
    if(!l||!l.sharing_enabled)return {name,sharing:false};
    const age=locationAgeMs(l);
    const accuracy=Number(l.accuracy_m||0);
    return {
      name,sharing:true,latitude:Number(l.latitude),longitude:Number(l.longitude),accuracy,
      capturedAt:l.captured_at||l.updated_at,updatedAt:l.updated_at,
      isLive:age<=LIVE_MS&&accuracy<=MAX_LIVE_ACCURACY_M,
      stale:age>LIVE_MS,
      lowAccuracy:accuracy>MAX_LIVE_ACCURACY_M
    };
  };

  const customer={...shape(b.user_id,b.customer_name),phone:isWorker?(b.customer_phone||null):null};
  const worker=active?shape(b.worker_user_id,b.worker_name):{name:b.worker_name,sharing:false,hiddenUntilAccepted:true};
  let distance=null,uncertaintyM=null;
  if(active&&customer.isLive&&worker.isLive){
    distance=Number(distanceKm(customer.latitude,customer.longitude,worker.latitude,worker.longitude).toFixed(3));
    uncertaintyM=Math.round(Math.sqrt(Number(customer.accuracy||0)**2+Number(worker.accuracy||0)**2));
  }

  res.json({success:true,data:{
    bookingId,
    status:b.status,
    mode:requestForAssignedWorker?'CUSTOMER_REQUEST':'ACTIVE',
    bookingAddress:isWorker?(b.address||null):null,
    customer,
    worker,
    distanceKm:distance,
    uncertaintyM
  }});
}catch(e){next(e)}});

module.exports=router;

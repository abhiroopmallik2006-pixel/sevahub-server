require('dotenv').config();
const express=require('express');
const http=require('http');
const path=require('path');
const cors=require('cors');
const jwt=require('jsonwebtoken');
const {Server}=require('socket.io');

const app=express();
const server=http.createServer(app);
const io=new Server(server);
app.set('io',io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,'../frontend')));

function verifySocketToken(token){
  if(!token)return null;
  try{return jwt.verify(String(token),process.env.JWT_SECRET)}catch(e){return null}
}

io.on('connection',socket=>{
  socket.on('join-user-room',userId=>{
    if(userId) socket.join(`user-${userId}`);
  });

  // Admin support room is protected with the same signed admin token used by
  // the cooperative dashboard. Ordinary User/Worker sockets cannot join it.
  socket.on('join-admin-support',token=>{
    const payload=verifySocketToken(token);
    if(payload?.role==='ADMIN'&&payload?.admin===true) socket.join('support-admin');
  });

  // The database write still happens through the authenticated REST route.
  // This event only tells an open admin dashboard to fetch the newly committed
  // message immediately, so Support chat behaves in realtime without polling.
  socket.on('support-member-sent',data=>{
    const payload=verifySocketToken(data?.token);
    const ticketId=Number(data?.ticketId);
    if(!payload||!['USER','WORKER'].includes(payload.role)||!Number.isInteger(ticketId)||ticketId<1)return;
    io.to('support-admin').emit('support-message',{
      ticketId,
      senderType:'MEMBER',
      userId:Number(payload.id),
      role:payload.role
    });
  });

  // Admin replies are committed by /api/admin first. Once that succeeds the
  // dashboard sends this authenticated bridge event to the member's user room.
  socket.on('support-admin-sent',data=>{
    const payload=verifySocketToken(data?.token);
    const ticketId=Number(data?.ticketId),userId=Number(data?.userId);
    if(payload?.role!=='ADMIN'||payload?.admin!==true||!Number.isInteger(ticketId)||ticketId<1||!Number.isInteger(userId)||userId<1)return;
    io.to(`user-${userId}`).emit('support-message',{ticketId,senderType:'ADMIN'});
  });

  socket.on('support-list-refresh',data=>{
    const payload=verifySocketToken(data?.token);
    if(!payload||!['USER','WORKER'].includes(payload.role))return;
    io.to('support-admin').emit('support-ticket:refresh',{userId:Number(payload.id),role:payload.role});
  });
});

app.use('/api/auth',require('./routes/auth'));
app.use('/api/services',require('./routes/services'));
app.use('/api/workers',require('./routes/workers'));
app.use('/api/bookings',require('./routes/bookings'));
app.use('/api/bargains',require('./routes/bargains'));
app.use('/api/rewards',require('./routes/rewards'));
app.use('/api/reviews',require('./routes/reviews'));
app.use('/api/payments',require('./routes/payments'));
app.use('/api/location',require('./routes/location'));
app.use('/api/notifications',require('./routes/notifications'));
app.use('/api/support',require('./routes/support'));
app.use('/api/welfare',require('./routes/welfare'));
app.use('/api/admin/welfare',require('./routes/admin-welfare'));
app.use('/api/admin/intelligence',require('./routes/admin-intelligence'));
app.use('/api/admin',require('./routes/admin'));
app.use('/api/ai',require('./routes/ai'));
app.use('/api/chat',require('./routes/chat'));

app.get('/api/health',(req,res)=>res.json({success:true,status:'ok'}));

/* Cooperative admin is intentionally separate from the User/Worker app.
   There is no dashboard link to this route, and every admin API call requires
   a dedicated ADMIN_EMAIL + ADMIN_PASSWORD protected admin token. */
app.get('/cooperative-admin',(req,res)=>{
  res.set('X-Robots-Tag','noindex, nofollow, noarchive');
  res.sendFile(path.join(__dirname,'../frontend/cooperative-admin.html'));
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../frontend/index.html')));

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(500).json({success:false,message:'Server error',detail:process.env.NODE_ENV==='development'?err.message:undefined});
});

const PORT=Number(process.env.PORT||3000);
server.listen(PORT,()=>console.log(`SevaHub running at http://localhost:${PORT}`));

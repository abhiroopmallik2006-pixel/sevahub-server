require('dotenv').config();
const express=require('express');
const http=require('http');
const path=require('path');
const cors=require('cors');
const {Server}=require('socket.io');

const app=express();
const server=http.createServer(app);
const io=new Server(server);
app.set('io',io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,'../frontend')));

io.on('connection',socket=>{
  socket.on('join-user-room',userId=>{
    if(userId) socket.join(`user-${userId}`);
  });
});

app.use('/api/auth',require('./routes/auth'));
app.use('/api/services',require('./routes/services'));
app.use('/api/workers',require('./routes/workers'));
app.use('/api/skill-certificates',require('./routes/skill-certificates'));
app.use('/api/bookings',require('./routes/bookings'));
app.use('/api/bargains',require('./routes/bargains'));
app.use('/api/rewards',require('./routes/rewards'));
app.use('/api/reviews',require('./routes/reviews'));
app.use('/api/payments',require('./routes/payments'));
app.use('/api/location',require('./routes/location'));
app.use('/api/emergency/active',require('./routes/emergency-active'));
app.use('/api/emergency',require('./routes/emergency-dynamic'));
app.use('/api/emergency',require('./routes/emergency'));
app.use('/api/notifications',require('./routes/notifications'));
app.use('/api/support',require('./routes/support'));
app.use('/api/welfare',require('./routes/welfare'));
// Reliable DB-backed scheduled-booking agent takes /chat first; legacy AI router remains as fallback for any other AI endpoints.
app.use('/api/ai',require('./routes/ai-booking-v2'));
app.use('/api/ai',require('./routes/ai'));
app.use('/api/chat',require('./routes/chat'));

app.get('/api/health',(req,res)=>res.json({success:true,status:'ok'}));

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../frontend/index.html')));

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(500).json({success:false,message:'Server error',detail:process.env.NODE_ENV==='development'?err.message:undefined});
});

const PORT=Number(process.env.PORT||3000);
server.listen(PORT,()=>console.log(`SevaHub running at http://localhost:${PORT}`));

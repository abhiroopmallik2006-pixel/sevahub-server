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
app.use('/api/bookings',require('./routes/bookings'));
app.use('/api/bargains',require('./routes/bargains'));
app.use('/api/rewards',require('./routes/rewards'));
app.use('/api/reviews',require('./routes/reviews'));
app.use('/api/payments',require('./routes/payments'));
app.use('/api/location',require('./routes/location'));
app.use('/api/notifications',require('./routes/notifications'));
app.use('/api/support',require('./routes/support'));
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

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

/* Keep API responses normal, but force browsers/WebViews to re-check frontend
   files while recovering from an older cached dashboard build. This does not
   clear localStorage, so remembered login is preserved. */
app.use((req,res,next)=>{
  if(!req.path.startsWith('/api/') && !req.path.startsWith('/socket.io/')){
    res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma','no-cache');
    res.set('Expires','0');
  }
  next();
});
app.use(express.static(path.join(__dirname,'../frontend'),{etag:false,lastModified:false,maxAge:0}));

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

const jwt = require('jsonwebtoken');

function auth(req,res,next){
  const token = (req.headers.authorization || '').replace('Bearer ','');
  if(!token) return res.status(401).json({success:false,message:'Authentication required'});
  try{
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  }catch{
    return res.status(401).json({success:false,message:'Invalid or expired token'});
  }
}

function authorize(...roles){
  return (req,res,next)=>{
    if(!roles.includes(req.user.role)) return res.status(403).json({success:false,message:'Access denied'});
    next();
  };
}
module.exports={auth,authorize};

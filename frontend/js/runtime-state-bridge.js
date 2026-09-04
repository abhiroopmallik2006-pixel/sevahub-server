/* Exposes read-only accessors for legacy add-on scripts that expect core classic-script globals on window. */
(function(){
  try{
    if(!Object.getOwnPropertyDescriptor(window,'state')&&typeof state!=='undefined'){
      Object.defineProperty(window,'state',{configurable:true,enumerable:false,get:()=>state});
    }
  }catch(e){}
  try{
    if(!Object.getOwnPropertyDescriptor(window,'isDemo')&&typeof isDemo!=='undefined'){
      Object.defineProperty(window,'isDemo',{configurable:true,enumerable:false,get:()=>isDemo});
    }
  }catch(e){}
})();

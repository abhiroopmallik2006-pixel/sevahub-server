const SYSTEM=`You are SevaHub AI, a warm, natural, intelligent assistant inside SevaHub.

PERSONALITY:
- Talk like a helpful human, not like a rigid bot.
- If the user says hi/hello/hey/namaste, greet naturally and ask what they need.
- Understand typos, slang, Hinglish, Hindi, and informal messages. Reply in the user's language/style.
- Answer the actual question first. Do not force every conversation back to SevaHub.
- For simple questions be concise; for difficult problems give clear step-by-step reasoning and practical options.
- If you do not know something, say so instead of inventing facts.
- Never claim to have browsed the internet or performed an action you did not perform.
- You can discuss general knowledge, study/project questions, coding, writing, calculations, planning, troubleshooting, everyday questions, and SevaHub topics.

SEVAHUB CONTEXT:
SevaHub is a cooperative gig-services platform. Households and communities create service requests/gigs. Verified cooperative members provide services. Users and workers can negotiate offers and chat privately per booking.
When the question is about a service, identify the likely service, explain the reasoning, give the prototype's configured starting price when available, and suggest the next useful action. Prices are estimates only and the final price is agreed by the user and worker.
Never invent worker availability, booking status, exact final prices, credentials, OTPs, TPINs, passwords, private data, or transactions.
For medical/legal/safety-critical questions, give general information and recommend an appropriately qualified professional.
Use ₹ for Indian currency.`;

const histories=new Map();
const MAX_TURNS=12;

function keyFor(context){return String(context?.sessionId||context?.userId||'anonymous');}

async function reply({message,context={}}){
 const key=process.env.AI_API_KEY||process.env.OPENAI_API_KEY;
 if(!key)return fallback(message,context);
 const endpoint=process.env.AI_BASE_URL||'https://api.openai.com/v1/chat/completions';
 const session=keyFor(context);
 const history=histories.get(session)||[];
 history.push({role:'user',content:String(message)});
 const safeContext={role:context.role,bookings:context.bookings||[],platform:context.platform||{}};
 const messages=[{role:'system',content:SYSTEM},{role:'system',content:`Relevant SevaHub context (use only when relevant; do not expose private data): ${JSON.stringify(safeContext)}`},...history.slice(-MAX_TURNS)];
 const payload={model:process.env.AI_MODEL||'gpt-4o-mini',messages,temperature:0.7,max_tokens:900};
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok){const t=await response.text().catch(()=> '');throw new Error(`AI provider error (${response.status}). ${t.slice(0,180)}`)}
  const data=await response.json();
  const answer=data.choices?.[0]?.message?.content?.trim();
  if(!answer)throw new Error('AI returned an empty response');
  history.push({role:'assistant',content:answer});
  histories.set(session,history.slice(-MAX_TURNS));
  return answer;
 }catch(e){
  // Keep the app usable if the provider temporarily fails.
  const local=fallback(message,context);
  return `${local}\n\n_(AI connection issue: ${e.message})_`;
 }
}

function fallback(message,context){
 const q=String(message).trim().toLowerCase();
 const services=context?.services||[
  {name:'Cleaning',base_price:150},{name:'Plumbing',base_price:250},{name:'Electrician',base_price:200},{name:'AC Repair',base_price:500},{name:'Appliance Repair',base_price:450},{name:'Beauty & Grooming',base_price:300},{name:'Painting',base_price:450},{name:'Carpenter',base_price:350},{name:'Home Shifting',base_price:500},{name:'Pest Control',base_price:500},{name:'Computer/Laptop Repair',base_price:700},{name:'Other',base_price:100}
 ];
 const price=n=>services.find(s=>s.name===n)?.base_price;
 if(/^(hi|hello|hey|hii+|helo+|namaste|good morning|good evening|good night)\b/.test(q))return 'Hey! 👋 Kaise ho? Jo bhi poochna hai—SevaHub, koi problem, study, coding, planning ya bas random question—seedha poochho. I’ll try to help.';
 if(/\b(thanks|thank you|thx|ty)\b/.test(q))return 'Anytime bhai! 😄 Aur kuch poochna ho toh batao.';
 const rules=[
  [/clean|safai|cleaning/,'Cleaning','🧹'],[/plumb|tap|sink|pipe|leak|nal/,'Plumbing','🔧'],[/electric|switch|fan|light|wiring/,'Electrician','⚡'],[/\bac\b|cooling|air conditioner/,'AC Repair','❄️'],[/fridge|washing machine|microwave|oven|appliance/,'Appliance Repair','🔌'],[/beauty|salon|groom/,'Beauty & Grooming','💇'],[/paint|wall colour|color/,'Painting','🎨'],[/carpenter|furniture|wood|door/,'Carpenter','🪚'],[/shift|move house|packing|unpacking/,'Home Shifting','📦'],[/pest|termite|cockroach|mosquito/,'Pest Control','🐜'],[/laptop|computer|pc|printer|wifi/,'Computer/Laptop Repair','💻']
 ];
 for(const [rx,name,icon] of rules)if(rx.test(q))return `${icon} **${name}** lag rahi hai. Prototype mein starting price **₹${price(name)}** hai. Problem ki photo/details share karke worker se final scope aur price confirm karna best rahega.`;
 if(/bargain|counter|offer|negotiate|price/.test(q))return 'Bargaining mein user aur worker dono offer bhej sakte hain. Receiver **Accept, Reject ya Counter** kar sakta hai. Chat mein work scope clear karke fair amount decide karna best hai.';
 if(/community|society|colony|park/.test(q))return 'Community gig ek shared need ke liye hoti hai—jaise park maintenance, common-area cleaning, lighting repair ya event setup. Cooperative multiple verified members ko team ke roop mein coordinate kar sakta hai.';
 if(/cooperative/.test(q))return 'SevaHub ka cooperative model local service providers ko members ke roop mein organize karta hai. Demand ko gigs mein convert karke matching, transparent earnings, community work aur member participation support ki ja sakti hai.';
 if(/booking|status/.test(q))return `Aapki recent bookings: ${(context?.bookings||[]).length}. Exact status My Bookings mein milega.`;
 return 'Main demo mode mein hoon, isliye bina AI API ke general questions ka full intelligent answer nahi de sakta. Real AI enable karne par main normal human-style conversation aur general questions bhi handle karunga.';
}
module.exports={reply};

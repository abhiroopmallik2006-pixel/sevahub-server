const SYSTEM = `You are SevaHub AI, a friendly and intelligent assistant inside SevaHub.

LANGUAGE & PERSONALITY:
- By default talk in natural Hinglish (Hindi written in English + simple English), like a helpful Indian friend.
- If the user talks in English only, you may answer in English.
- Understand bhai, bro, yaar, acha, nhi, ky, kaise, krna, ho gya, Hinglish, typos and informal language.
- Never sound robotic.
- Do NOT say "I am in demo mode".
- Answer the user's actual question first.
- Be concise for simple questions and detailed when needed.
- You can answer normal questions about study, coding, planning, troubleshooting and everyday problems.

SEVAHUB:
SevaHub is a cooperative gig-services platform for household and community services.

Configured starting prices:
Cleaning ₹150
Plumbing ₹250
Electrician ₹200
AC Repair ₹500
Appliance Repair ₹450
Beauty & Grooming ₹300
Painting ₹450
Carpenter ₹350
Home Shifting ₹500
Pest Control ₹500
Computer/Laptop Repair ₹700
Other ₹100

For household problems:
- understand the problem naturally
- suggest the most suitable service
- explain briefly why
- mention the configured starting price where relevant
- remind the user that final scope/price can be discussed with the worker

Examples:
"bed toot gaya" -> Carpenter
"bed se awaaz aa rahi hai" -> Carpenter
"door loose hai" -> Carpenter
"fan slow hai" -> Electrician
"nal leak hai" -> Plumbing

Never invent worker availability, booking status, OTPs, passwords, transactions or private data.
Use ₹ for Indian currency.`;

const histories = new Map();
const MAX_TURNS = 12;

function keyFor(context) {
  return String(context?.sessionId || context?.userId || 'anonymous');
}

function uniqueModels() {
  return [
    process.env.AI_MODEL || 'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash'
  ].filter((model, index, arr) => arr.indexOf(model) === index);
}

async function callModel({ endpoint, key, model, messages }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 900
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const err = new Error(`Provider ${response.status}: ${body.slice(0, 200)}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.trim();

  if (!answer) throw new Error('AI returned an empty response');

  return answer;
}

async function reply({ message, context = {} }) {
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

  if (!key) return fallback(message, context);

  const endpoint =
    process.env.AI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

  const session = keyFor(context);
  const history = histories.get(session) || [];

  history.push({
    role: 'user',
    content: String(message)
  });

  const safeContext = {
    role: context.role,
    bookings: context.bookings || [],
    platform: context.platform || {}
  };

  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'system',
      content:
        'Relevant SevaHub context (use only when useful): ' +
        JSON.stringify(safeContext)
    },
    ...history.slice(-MAX_TURNS)
  ];

  let lastError;

  for (const model of uniqueModels()) {
    try {
      console.log(`[AI] Trying model: ${model}`);

      const answer = await callModel({
        endpoint,
        key,
        model,
        messages
      });

      console.log(`[AI] Success with: ${model}`);

      history.push({
        role: 'assistant',
        content: answer
      });

      histories.set(session, history.slice(-MAX_TURNS));

      return answer;
    } catch (err) {
      lastError = err;
      console.warn(`[AI] ${model} failed: ${err.message}`);

      // Capacity/rate/model errors -> automatically try next model.
      if ([404, 429, 500, 502, 503, 504].includes(err.status)) {
        continue;
      }

      // Invalid API key etc. won't be fixed by switching models.
      break;
    }
  }

  console.error('[AI] All providers/models failed:', lastError?.message);

  // Never show ugly provider JSON/errors to the user.
  return fallback(message, context);
}

function fallback(message, context) {
  const q = String(message || '').trim().toLowerCase();

  const services = context?.services || [
    { name: 'Cleaning', base_price: 150 },
    { name: 'Plumbing', base_price: 250 },
    { name: 'Electrician', base_price: 200 },
    { name: 'AC Repair', base_price: 500 },
    { name: 'Appliance Repair', base_price: 450 },
    { name: 'Beauty & Grooming', base_price: 300 },
    { name: 'Painting', base_price: 450 },
    { name: 'Carpenter', base_price: 350 },
    { name: 'Home Shifting', base_price: 500 },
    { name: 'Pest Control', base_price: 500 },
    { name: 'Computer/Laptop Repair', base_price: 700 },
    { name: 'Other', base_price: 100 }
  ];

  const price = name =>
    services.find(s => s.name === name)?.base_price || 0;

  if (/^(hi|hii+|hello|hey|helo+|bhai+|bro+|yaar|namaste)\b/.test(q)) {
    return 'Haan bhai 😄 bata, kya help chahiye? Ghar ki koi problem ho, SevaHub booking, coding, study ya kuch random—poochh le.';
  }

  if (/\b(thanks|thank you|thx|shukriya)\b/.test(q)) {
    return 'Koi scene nahi bhai 😄 aur kuch ho toh bata.';
  }

  if (
    /bed|bedroom furniture|charpai|palang|furniture|wood|wooden|door|almirah|wardrobe|table|chair|carpenter/.test(
      q
    )
  ) {
    return `🪚 Bhai ye **Carpenter** wala kaam lag raha hai. Agar bed toot gaya hai, joint loose hai ya awaaz aa rahi hai toh carpenter frame/joints inspect karke repair kar sakta hai. SevaHub par starting price **₹${price(
      'Carpenter'
    )}** hai; final price damage dekhkar worker se confirm/negotiation kar lena.`;
  }

  if (/clean|safai|cleaning/.test(q)) {
    return `🧹 Cleaning service best rahegi bhai. Starting price **₹${price(
      'Cleaning'
    )}** hai.`;
  }

  if (/plumb|tap|sink|pipe|leak|nal|paani leak/.test(q)) {
    return `🔧 Ye Plumbing problem lag rahi hai. Starting price **₹${price(
      'Plumbing'
    )}** hai.`;
  }

  if (/electric|switch|fan|light|wiring|socket/.test(q)) {
    return `⚡ Electrician service suitable rahegi bhai. Starting price **₹${price(
      'Electrician'
    )}** hai.`;
  }

  if (/\bac\b|air conditioner|cooling/.test(q)) {
    return `❄️ AC Repair service best rahegi. Starting price **₹${price(
      'AC Repair'
    )}** hai.`;
  }

  if (/fridge|washing machine|microwave|oven|appliance/.test(q)) {
    return `🔌 Appliance Repair suitable rahegi. Starting price **₹${price(
      'Appliance Repair'
    )}** hai.`;
  }

  if (/paint|wall colour|wall color|painting/.test(q)) {
    return `🎨 Painting service suitable rahegi. Starting price **₹${price(
      'Painting'
    )}** hai.`;
  }

  if (/shift|moving|packing|unpacking|house shifting/.test(q)) {
    return `📦 Home Shifting service best rahegi. Starting price **₹${price(
      'Home Shifting'
    )}** hai.`;
  }

  if (/pest|termite|cockroach|mosquito/.test(q)) {
    return `🐜 Pest Control service suitable rahegi. Starting price **₹${price(
      'Pest Control'
    )}** hai.`;
  }

  if (/laptop|computer|pc|printer/.test(q)) {
    return `💻 Computer/Laptop Repair service best rahegi. Starting price **₹${price(
      'Computer/Laptop Repair'
    )}** hai.`;
  }

  if (/bargain|counter|offer|negotiate|negotiation/.test(q)) {
    return 'Bhai user aur worker dono offer/counter offer bhej sakte hain. Receiver Accept, Reject ya Counter kar sakta hai. Work scope clear karke final fair price decide kar lena.';
  }

  if (/community|society|colony|park/.test(q)) {
    return 'Community service shared locality need ke liye hai—jaise common-area cleaning, park maintenance, lighting repair ya event setup. Cooperative multiple workers ko coordinate kar sakta hai.';
  }

  if (/booking|status/.test(q)) {
    return `Tumhari recent bookings: ${
      (context?.bookings || []).length
    }. Exact status My Bookings section mein check kar sakte ho.`;
  }

  return 'Bhai AI service abhi temporarily busy hai 😅. Thodi der baad dobara try karna. SevaHub service/booking related problem hai toh details bata, main basic help abhi bhi kar sakta hoon.';
}

module.exports = { reply };
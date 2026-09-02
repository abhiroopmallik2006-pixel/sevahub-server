/* SevaHub platform language toggle + Worker AI Assistant.
   Language preference persists on this browser/app. */
(function(){
  const LANGUAGE_KEY='sevahub_language_v1';
  let language=localStorage.getItem(LANGUAGE_KEY)==='hi'?'hi':'en';
  let scheduled=false;
  const originalText=new WeakMap();
  const originalAttrs=new WeakMap();

  const exact={
    /* Main navigation and dashboard */
    'Services':'सेवाएँ',
    'My Bookings':'मेरी बुकिंग्स',
    '✨ AI Assistant':'✨ एआई सहायक',
    'Spend History':'खर्च इतिहास',
    'Spend history':'खर्च इतिहास',
    'Notifications':'सूचनाएँ',
    'Overview':'अवलोकन',
    'Bargains':'मोलभाव',
    'Bookings':'बुकिंग्स',
    'Earnings':'कमाई',
    'Earnings history':'कमाई का इतिहास',
    'Profile':'प्रोफ़ाइल',
    'Logout':'लॉगआउट',
    'Active bookings':'सक्रिय बुकिंग्स',
    'Pending bargains':'लंबित मोलभाव',
    'Completed':'पूर्ण',
    'Requests':'अनुरोध',
    'Rating':'रेटिंग',
    'Popular services':'लोकप्रिय सेवाएँ',
    'My bookings':'मेरी बुकिंग्स',
    'View professionals':'प्रोफेशनल देखें',
    'Book now':'अभी बुक करें',
    'Bargain':'मोलभाव',
    'Accept':'स्वीकार करें',
    'Reject':'अस्वीकार करें',
    'Counter':'काउंटर',
    'Counter offer':'काउंटर ऑफर',
    'Back':'वापस',
    '← Back':'← वापस',
    'Filter':'फ़िल्टर',
    'From':'से',
    'To':'तक',
    'Service':'सेवा',
    'Status':'स्थिति',
    'Customer':'ग्राहक',
    'Worker':'वर्कर',
    'User':'यूज़र',
    'Price':'कीमत',
    'Date':'तारीख',
    'Time':'समय',
    'Address':'पता',
    'Payment':'पेमेंट',
    'Payment method':'पेमेंट का तरीका',
    'Cash':'नकद',
    'CASH':'नकद',
    'Card':'कार्ड',
    'UPI':'UPI',
    'PAID':'भुगतान हो गया',
    'PENDING':'लंबित',
    'ACCEPTED':'स्वीकृत',
    'REJECTED':'अस्वीकृत',
    'BARGAINING':'मोलभाव जारी',
    'IN PROGRESS':'काम जारी',
    'IN_PROGRESS':'काम जारी',
    'COMPLETED':'पूर्ण',
    'CANCELLED':'रद्द',
    'OPEN':'खुला',
    'RESOLVED':'समाधान हुआ',

    /* Authentication and account */
    'Login':'लॉगिन',
    'Username':'यूज़रनेम',
    'Password':'पासवर्ड',
    'Full name':'पूरा नाम',
    'Email':'ईमेल',
    'Phone':'फ़ोन',
    'Create account':'अकाउंट बनाएँ',
    'Create User account':'यूज़र अकाउंट बनाएँ',
    'Create Worker account':'वर्कर अकाउंट बनाएँ',
    'Verify your email':'अपना ईमेल सत्यापित करें',
    'Verification code':'वेरिफिकेशन कोड',
    'Verify & create account':'वेरिफ़ाई करके अकाउंट बनाएँ',
    'Resend code':'कोड दोबारा भेजें',
    'Service area':'सेवा क्षेत्र',
    'Starting price (₹)':'शुरुआती कीमत (₹)',
    'Experience (years)':'अनुभव (साल)',
    'WELCOME BACK':'वापसी पर स्वागत है',
    'New to SevaHub?':'SevaHub पर नए हैं?',
    'Need help signing in?':'साइन इन में मदद चाहिए?',
    'LOCAL SERVICES, MADE SIMPLE':'लोकल सेवाएँ, अब आसान',
    'SEVAHUB MARKETPLACE':'SEVAHUB मार्केटप्लेस',
    'Everything your home needs,':'आपके घर की हर ज़रूरत,',
    'in one place.':'एक ही जगह।',

    /* Service catalogue */
    'Fair prices':'उचित कीमतें',
    'Trusted professionals':'भरोसेमंद प्रोफेशनल',
    'Nearby services':'आस-पास की सेवाएँ',
    'Cleaning':'सफाई',
    'Home Cleaning':'घर की सफाई',
    'Plumbing':'प्लंबिंग',
    'Plumber':'प्लंबर',
    'Electrician':'इलेक्ट्रीशियन',
    'Electrician Services':'इलेक्ट्रीशियन सेवाएँ',
    'Plumbing Services':'प्लंबिंग सेवाएँ',
    'AC Repair':'एसी रिपेयर',
    'Appliance Repair':'उपकरण मरम्मत',
    'Beauty & Grooming':'ब्यूटी और ग्रूमिंग',
    'Painting':'पेंटिंग',
    'Carpenter':'बढ़ई',
    'Home Shifting':'घर शिफ्टिंग',
    'Pest Control':'कीट नियंत्रण',
    'Computer/Laptop Repair':'कंप्यूटर/लैपटॉप रिपेयर',
    'Other':'अन्य',
    'Home and office cleaning':'घर और ऑफिस की सफाई',
    'Repairs and installations':'मरम्मत और इंस्टॉलेशन',
    'Electrical repair and installation':'इलेक्ट्रिकल मरम्मत और इंस्टॉलेशन',
    'AC repair and maintenance':'एसी रिपेयर और मेंटेनेंस',
    'Home appliance repair':'घरेलू उपकरणों की मरम्मत',
    'Professional beauty services':'प्रोफेशनल ब्यूटी सेवाएँ',
    'Interior and exterior painting':'अंदर और बाहर की पेंटिंग',
    'Furniture and carpentry work':'फर्नीचर और बढ़ई का काम',
    'Home shifting assistance':'घर शिफ्टिंग सहायता',
    'Professional pest control':'प्रोफेशनल कीट नियंत्रण',
    'Computer repair services':'कंप्यूटर रिपेयर सेवाएँ',
    'Other local services':'अन्य लोकल सेवाएँ',
    'Explore service →':'सेवा देखें →',
    'View requests →':'अनुरोध देखें →',
    'Explore →':'देखें →',

    /* Layout-grid and dashboard graphics */
    'SEVAHUB USER EXPERIENCE':'SEVAHUB यूज़र अनुभव',
    'SEVAHUB WORKER EXPERIENCE':'SEVAHUB वर्कर अनुभव',
    'Everything you need, right at your fingertips.':'आपकी ज़रूरत की हर चीज़, एक ही जगह।',
    'Manage your work with confidence.':'अपना काम आत्मविश्वास से संभालें।',
    'Find trusted professionals, manage bookings and negotiate fair prices.':'भरोसेमंद प्रोफेशनल खोजें, बुकिंग संभालें और उचित कीमत तय करें।',
    'Track requests, bargains and earnings from one workspace.':'एक ही जगह से अनुरोध, मोलभाव और कमाई ट्रैक करें।',
    'User Dashboard':'यूज़र डैशबोर्ड',
    'Worker Dashboard':'वर्कर डैशबोर्ड',
    'Your work, organized in one place.':'आपका काम, एक ही जगह व्यवस्थित।',
    'Your services, bookings & bargains - simplified.':'आपकी सेवाएँ, बुकिंग्स और मोलभाव - अब आसान।',
    'ACTIVE BOOKINGS':'सक्रिय बुकिंग्स',
    'REQUESTS':'अनुरोध',
    'RATING':'रेटिंग',
    'EARNINGS':'कमाई',
    'PENDING BARGAINS':'लंबित मोलभाव',
    'BARGAINS':'मोलभाव',
    'COMPLETED':'पूर्ण',
    '🛠️ New service request':'🛠️ नया सेवा अनुरोध',
    '✨ Recommended services':'✨ सुझाई गई सेवाएँ',
    'Scroll to explore':'और देखने के लिए स्क्रॉल करें',
    'POPULAR WORK CATEGORIES':'लोकप्रिय काम की श्रेणियाँ',
    'POPULAR SERVICES':'लोकप्रिय सेवाएँ',
    'Choose the work you want to grow.':'वह काम चुनें जिसे आप आगे बढ़ाना चाहते हैं।',
    'Find the right professional for your home.':'अपने घर के लिए सही प्रोफेशनल खोजें।',
    'Explore service categories and jump into your current requests.':'सेवा श्रेणियाँ देखें और अपने मौजूदा अनुरोध खोलें।',
    'Explore popular household services with a visual, easy-to-browse experience.':'लोकप्रिय घरेलू सेवाएँ आसान और विज़ुअल तरीके से देखें।',
    'Find trusted professionals for cleaning, deep cleaning and everyday household help.':'सफाई, डीप क्लीनिंग और रोज़मर्रा की घरेलू मदद के लिए भरोसेमंद प्रोफेशनल खोजें।',
    'Book verified help for switches, wiring, fans, lights and other electrical work.':'स्विच, वायरिंग, पंखे, लाइट और अन्य इलेक्ट्रिकल काम के लिए सत्यापित मदद बुक करें।',
    'Get help with leaks, taps, pipes, fittings and urgent plumbing needs.':'लीक, नल, पाइप, फिटिंग और जरूरी प्लंबिंग काम के लिए मदद लें।',
    'Connect with professionals for practical appliance repair and maintenance.':'उपकरण मरम्मत और मेंटेनेंस के लिए प्रोफेशनल से जुड़ें।',
    'Take cleaning requests, review customer details and manage each job smoothly.':'सफाई के अनुरोध लें, ग्राहक विवरण देखें और हर काम आसानी से संभालें।',
    'Handle electrical repair and installation requests from nearby customers.':'आस-पास के ग्राहकों के इलेक्ट्रिकल रिपेयर और इंस्टॉलेशन अनुरोध संभालें।',
    'Find plumbing jobs, respond to requests and keep your schedule organized.':'प्लंबिंग काम खोजें, अनुरोधों का जवाब दें और अपना शेड्यूल व्यवस्थित रखें।',
    'Grow your service requests with transparent pricing and customer bargains.':'पारदर्शी कीमत और ग्राहक मोलभाव के साथ अपने सेवा अनुरोध बढ़ाएँ।',

    /* 3D workspace copy */
    'SEVAHUB SERVICE HUB':'SEVAHUB सेवा केंद्र',
    'SEVAHUB BOOKINGS':'SEVAHUB बुकिंग्स',
    'SEVAHUB AI':'SEVAHUB एआई',
    'SEVAHUB ACTIVITY':'SEVAHUB गतिविधि',
    'SEVAHUB REWARDS':'SEVAHUB रिवॉर्ड्स',
    'SEVAHUB UPDATES':'SEVAHUB अपडेट्स',
    'SEVAHUB SUPPORT':'SEVAHUB सहायता',
    'SEVAHUB CHAT':'SEVAHUB चैट',
    'SEVAHUB WORKSPACE':'SEVAHUB कार्यक्षेत्र',
    'SEVAHUB BARGAINS':'SEVAHUB मोलभाव',
    'SEVAHUB EARNINGS':'SEVAHUB कमाई',
    'SEVAHUB PROFILE':'SEVAHUB प्रोफ़ाइल',
    'Your workspace, beautifully organized.':'आपका कार्यक्षेत्र, सुंदर तरीके से व्यवस्थित।',
    'Find services in a smoother workspace.':'सेवाएँ एक आसान कार्यक्षेत्र में खोजें।',
    'Track every booking in one place.':'हर बुकिंग एक ही जगह ट्रैक करें।',
    'Ask, understand and book with AI.':'एआई से पूछें, समझें और बुक करें।',
    'Understand where your service spending goes.':'समझें कि आपकी सेवा पर खर्च कहाँ हो रहा है।',
    'Your GEMS wallet at a glance.':'आपका GEMS वॉलेट एक नज़र में।',
    'Stay on top of every service update.':'हर सेवा अपडेट पर नज़र रखें।',
    'Help is part of the workspace.':'मदद आपके कार्यक्षेत्र का हिस्सा है।',
    'Keep the conversation connected.':'बातचीत को सेवा प्रक्रिया से जुड़ा रखें।',
    'Your professional workspace at a glance.':'आपका प्रोफेशनल कार्यक्षेत्र एक नज़र में।',
    'Handle offers without losing context.':'ऑफर की पूरी जानकारी के साथ मोलभाव संभालें।',
    'Manage customer jobs in one focused view.':'ग्राहक के काम एक ही फोकस्ड स्क्रीन में संभालें।',
    'See the value of completed work.':'पूरे हुए काम की कमाई देखें।',
    'Your professional identity, organized.':'आपकी प्रोफेशनल पहचान, व्यवस्थित रूप में।',
    'Use AI as a work assistant.':'एआई को काम के सहायक की तरह इस्तेमाल करें।',
    'Support stays inside your workspace.':'सहायता आपके कार्यक्षेत्र के अंदर ही उपलब्ध है।',
    'Keep customer communication connected.':'ग्राहक से बातचीत को काम के साथ जुड़ा रखें।',
    'User workspace':'यूज़र कार्यक्षेत्र',
    'Worker workspace':'वर्कर कार्यक्षेत्र',

    /* Worker area */
    'Worker Dashboard 🧰':'वर्कर डैशबोर्ड 🧰',
    'Manage services, requests and customer bargains.':'सेवाएँ, अनुरोध और ग्राहक मोलभाव संभालें।',
    'My professional profile':'मेरी प्रोफेशनल प्रोफ़ाइल',
    'My service':'मेरी सेवा',
    'Working area':'काम का क्षेत्र',
    'How bargaining works':'मोलभाव कैसे काम करता है',
    '💬 Customer bargains':'💬 ग्राहक मोलभाव',
    'Flexible service area available.':'लचीला सेवा क्षेत्र उपलब्ध है।',
    'Customers can send a fair-price offer. Accept, reject or counter it.':'ग्राहक उचित कीमत का ऑफर भेज सकते हैं। उसे स्वीकार, अस्वीकार या काउंटर करें।',
    'Service provider':'सेवा प्रदाता',
    'Service not set':'सेवा सेट नहीं है',

    /* AI */
    '✨ AI Service Assistant':'✨ एआई सेवा सहायक',
    'SEVAHUB INTELLIGENCE':'SEVAHUB इंटेलिजेंस',
    '🔧 Diagnose my problem':'🔧 मेरी समस्या पहचानें',
    '📋 Explain my booking':'📋 मेरी बुकिंग समझाएँ',
    '💰 Fair price':'💰 उचित कीमत',
    '🏘️ Community help':'🏘️ कम्युनिटी मदद',
    'Ask AI ✨':'एआई से पूछें ✨',
    'Hi! 👋':'नमस्ते! 👋',
    'Tell me what you need at home or in your community. For example: “AC cooling nahi kar raha”.':'बताइए आपको घर या कम्युनिटी में किस मदद की ज़रूरत है। उदाहरण: “AC ठंडा नहीं कर रहा।”',
    'Describe a problem in normal language. I can identify the service, suggest a budget range, explain your booking, help with bargaining, and guide you to the right cooperative professional.':'अपनी समस्या सामान्य भाषा में बताइए। मैं सही सेवा पहचान सकता हूँ, बजट का अंदाज़ा बता सकता हूँ, बुकिंग समझा सकता हूँ, मोलभाव में मदद कर सकता हूँ और सही कोऑपरेटिव प्रोफेशनल तक मार्गदर्शन कर सकता हूँ।',
    'AI gives guidance and estimates only. Final service price, worker selection and safety decisions remain with the user/cooperative.':'एआई केवल मार्गदर्शन और अनुमान देता है। अंतिम सेवा कीमत, वर्कर चयन और सुरक्षा निर्णय यूज़र/कोऑपरेटिव के पास रहते हैं।',
    'SevaHub AI is thinking…':'SevaHub एआई सोच रहा है…',

    /* GEMS */
    'YOUR GEMS':'आपके GEMS',
    'Earn GEMS':'GEMS कमाएँ',
    'Redeem GEMS':'GEMS रिडीम करें',
    'Level up':'लेवल बढ़ाएँ',
    'History':'इतिहास',
    'Current balance':'मौजूदा बैलेंस',
    'Redeem':'रिडीम करें',

    /* Booking/chat */
    'No bookings.':'कोई बुकिंग नहीं।',
    'No bookings yet.':'अभी कोई बुकिंग नहीं।',
    'No notifications.':'कोई सूचना नहीं।',
    'No bargains.':'कोई मोलभाव नहीं।',
    'No customer bargains yet. When a user offers a price, it will appear here automatically.':'अभी कोई ग्राहक मोलभाव नहीं है। यूज़र ऑफर भेजेगा तो वह यहाँ दिखाई देगा।',
    'No professionals yet. A newly registered worker will appear here automatically.':'अभी कोई प्रोफेशनल उपलब्ध नहीं है। नया रजिस्टर्ड वर्कर यहाँ अपने-आप दिखाई देगा।',
    'No messages yet. Say hello 👋':'अभी कोई मैसेज नहीं है। नमस्ते कहें 👋',
    'Private conversation':'निजी बातचीत',
    'Live':'लाइव',
    'Send':'भेजें',
    'Generate completion OTP':'कम्प्लीशन OTP बनाएँ',
    'Generate new OTP':'नया OTP बनाएँ',
    'Verify & complete':'वेरिफ़ाई करके पूरा करें',
    'OTP generated in customer app':'ग्राहक ऐप में OTP बन गया',
    'Ask the customer for the 6-digit code after the work is finished.':'काम पूरा होने के बाद ग्राहक से 6 अंकों का कोड लें।',

    /* Reviews */
    'Reviews':'रिव्यू',
    '⭐ Reviews':'⭐ रिव्यू',
    '⭐ See reviews':'⭐ रिव्यू देखें',
    'Write a review':'रिव्यू लिखें',
    'Submit review':'रिव्यू भेजें',
    'Your rating':'आपकी रेटिंग',
    'Comment':'टिप्पणी',

    /* Location */
    'Location':'स्थान',
    'Location On':'स्थान चालू',
    '📍 Location':'📍 स्थान',
    '📍 Location sharing':'📍 लोकेशन शेयरिंग',
    'Enable location':'लोकेशन चालू करें',
    'Stop sharing':'शेयरिंग बंद करें',
    '📍 Use my live location':'📍 मेरी लाइव लोकेशन इस्तेमाल करें',
    '📍 Live location':'📍 लाइव लोकेशन',
    '📍 Live booking location':'📍 बुकिंग की लाइव लोकेशन',
    'Live location sharing is on':'लाइव लोकेशन शेयरिंग चालू है',
    'Manage location sharing':'लोकेशन शेयरिंग संभालें',
    '● Live location is ON':'● लाइव लोकेशन चालू है',
    '○ Location sharing is OFF':'○ लोकेशन शेयरिंग बंद है',
    'You control when GPS is shared.':'GPS कब शेयर हो, यह आपके नियंत्रण में है।',
    'Privacy:':'प्राइवेसी:',
    'Location sharing is off.':'लोकेशन शेयरिंग बंद है।',
    'Last location':'आखिरी लोकेशन',
    '● Live':'● लाइव',
    'Open in Maps ↗':'मैप्स में खोलें ↗',
    'Current straight-line distance':'मौजूदा सीधी दूरी',
    'Updates automatically while this screen is open.':'यह स्क्रीन खुली रहने पर अपने-आप अपडेट होती है।',
    'Waiting for both sides to share GPS':'दोनों पक्षों के GPS शेयर करने का इंतज़ार है',
    'Your own GPS sharing is off.':'आपकी GPS शेयरिंग बंद है।',
    'Share my location':'मेरी लोकेशन शेयर करें',
    'Getting live GPS…':'लाइव GPS लिया जा रहा है…',
    '📍 Turn on Location to see which professionals are closest to you.':'📍 आपके सबसे पास कौन से प्रोफेशनल हैं, यह देखने के लिए लोकेशन चालू करें।',
    '👤 Customer details':'👤 ग्राहक विवरण',
    '📍 Customer details & location':'📍 ग्राहक विवरण और लोकेशन',
    'Call customer':'ग्राहक को कॉल करें',
    '📍 Open customer location in Maps ↗':'📍 ग्राहक की लोकेशन मैप्स में खोलें ↗',
    '🗺 Open address in Maps ↗':'🗺 पता मैप्स में खोलें ↗',

    /* Activity and reports */
    '🧾 Booking report':'🧾 बुकिंग रिपोर्ट',
    'Building full report…':'पूरी रिपोर्ट बनाई जा रही है…',
    '⏱ Booking timeline':'⏱ बुकिंग टाइमलाइन',
    'Booking created':'बुकिंग बनाई गई',
    'Service scheduled':'सेवा तय की गई',
    'Service completed':'सेवा पूरी हुई',
    'Payment recorded':'पेमेंट दर्ज हुआ',
    'Not completed yet':'अभी पूरा नहीं हुआ',
    '💳 Payment report':'💳 पेमेंट रिपोर्ट',
    'Service fee':'सेवा शुल्क',
    'Worker net earning':'वर्कर की शुद्ध कमाई',
    'Customer total service payment':'ग्राहक का कुल सेवा भुगतान',
    'Method:':'तरीका:',
    'Receipt:':'रसीद:',
    'Payment ID:':'पेमेंट ID:',
    'Tap for full report →':'पूरी रिपोर्ट के लिए टैप करें →',
    'Total spent in range':'चुनी अवधि में कुल खर्च',
    'Total earned in range':'चुनी अवधि में कुल कमाई',
    'Net earned after platform fee':'प्लेटफ़ॉर्म शुल्क के बाद शुद्ध कमाई',
    'Booked:':'बुक किया:',
    'Scheduled:':'तय समय:',
    'Completed:':'पूर्ण:',

    /* Payments */
    'Customer paid':'ग्राहक ने भुगतान किया',
    'Worker net amount':'वर्कर की शुद्ध राशि',
    'Your net amount':'आपकी शुद्ध राशि',
    'Service amount':'सेवा राशि',
    '💵 Cash payment':'💵 नकद भुगतान',
    '💳 Online payment':'💳 ऑनलाइन पेमेंट',
    '💳 Online payment receipts':'💳 ऑनलाइन पेमेंट रसीदें',
    'Payment window closed':'पेमेंट विंडो बंद हो गई',
    'Previous attempt was not completed. You can try again.':'पिछला प्रयास पूरा नहीं हुआ। आप फिर से कोशिश कर सकते हैं।',

    /* Support */
    '🛟 Support':'🛟 सहायता',
    '🛟 Support Center':'🛟 सहायता केंद्र',
    '✨ AI Support Assistant':'✨ एआई सहायता सहायक',
    'Quick help':'जल्दी मदद',
    'Booking help':'बुकिंग सहायता',
    'Payment help':'पेमेंट सहायता',
    'Location help':'लोकेशन सहायता',
    'Booking issue':'बुकिंग समस्या',
    'Payment issue':'पेमेंट समस्या',
    'Safety issue':'सुरक्षा समस्या',
    'New support ticket':'नया सहायता टिकट',
    'Category':'श्रेणी',
    'Subject':'विषय',
    'Booking # (optional)':'बुकिंग # (वैकल्पिक)',
    'Issue details':'समस्या का विवरण',
    'Submit ticket':'टिकट भेजें',
    'My tickets':'मेरे टिकट',
    'Mark resolved':'समाधान हुआ मार्क करें',
    '💬 Chat with Admin':'💬 एडमिन से चैट',
    'Support Admin Chat':'सहायता एडमिन चैट',
    'Refresh':'रिफ्रेश',
    'Close':'बंद करें',
    'SevaHub Admin':'SevaHub एडमिन',
    'You':'आप',
    'Booking':'बुकिंग',
    'Payment':'पेमेंट',
    'Bargaining':'मोलभाव',
    'Account':'अकाउंट',
    'Safety':'सुरक्षा',
    'Technical':'तकनीकी',

    /* Generic */
    'Loading…':'लोड हो रहा है…',
    'Loading':'लोड हो रहा है',
    'Save':'सेव करें',
    'Cancel':'रद्द करें',
    'Continue':'आगे बढ़ें',
    'Retry':'फिर कोशिश करें',
    'Done':'पूरा',
    'Close':'बंद करें'
  };

  const placeholders={
    'Enter your username':'अपना यूज़रनेम दर्ज करें',
    'Enter your password':'अपना पासवर्ड दर्ज करें',
    'Describe your service need...':'अपनी सेवा की ज़रूरत बताएँ...',
    'Type a message...':'मैसेज लिखें...',
    'Ask SevaBot...':'SevaBot से पूछें...',
    'Service address':'सेवा का पता',
    'Your name':'आपका नाम',
    'e.g. Payment not updated':'जैसे: पेमेंट अपडेट नहीं हुआ',
    'Describe what happened and what you need help with.':'क्या हुआ और आपको किस मदद की ज़रूरत है, बताइए।',
    'Describe your support issue…':'अपनी सहायता समस्या लिखें…',
    'Message the admin…':'एडमिन को मैसेज लिखें…',
    '6-digit OTP':'6 अंकों का OTP',
    'Enter the 6-digit OTP':'6 अंकों का OTP दर्ज करें',
    'Why this price?':'यह कीमत क्यों?',
    'I think this is fair because...':'मुझे यह कीमत उचित लगती है क्योंकि...'
  };

  const titleText={
    'Switch platform to English':'प्लेटफ़ॉर्म को English में करें',
    'Manage location sharing':'लोकेशन शेयरिंग संभालें',
    'Live location sharing is on':'लाइव लोकेशन शेयरिंग चालू है'
  };

  function translateText(source){
    if(language!=='hi')return source;
    const leading=(source.match(/^\s*/)||[''])[0];
    const trailing=(source.match(/\s*$/)||[''])[0];
    const core=source.trim();
    if(!core)return source;
    if(exact[core])return leading+exact[core]+trailing;

    let out=core;
    const replacements=[
      [/^Good day,\s*(.+)\s*👋$/i,'नमस्ते, $1 👋'],
      [/^Login as User$/,'यूज़र के रूप में लॉगिन'],
      [/^Login as Worker$/,'वर्कर के रूप में लॉगिन'],
      [/^Create User account$/,'यूज़र अकाउंट बनाएँ'],
      [/^Create Worker account$/,'वर्कर अकाउंट बनाएँ'],
      [/^Booking #(\d+)$/,'बुकिंग #$1'],
      [/^Booking #(\d+)\s*[·-]\s*(.+)$/,'बुकिंग #$1 - $2'],
      [/^#(\d+)\s*[·-]\s*(.+)$/,'#$1 - $2'],
      [/^Current straight-line distance$/,'मौजूदा सीधी दूरी'],
      [/^Open in Maps ↗$/,'मैप्स में खोलें ↗'],
      [/^📍 Open customer location in Maps ↗$/,'📍 ग्राहक की लोकेशन मैप्स में खोलें ↗'],
      [/^🗺 Open address in Maps ↗$/,'🗺 पता मैप्स में खोलें ↗'],
      [/^From (₹.+)$/,'शुरुआत $1 से'],
      [/^(.+) years experience\s*[·-]\s*(.+)$/,'$1 साल का अनुभव - $2'],
      [/^Service: (.+)$/,'सेवा: $1'],
      [/^Listed price: (.+)$/,'लिस्टेड कीमत: $1'],
      [/^Original price: (.+)$/,'मूल कीमत: $1'],
      [/^Customer: (.+)$/,'ग्राहक: $1'],
      [/^Worker: (.+)$/,'वर्कर: $1'],
      [/^Payment ID: (.+)$/,'पेमेंट ID: $1'],
      [/^Paid: (.+)$/,'भुगतान: $1'],
      [/^Last update (.+)$/,'आखिरी अपडेट $1'],
      [/^(\d+)s ago$/,'$1 सेकंड पहले'],
      [/^(\d+) min ago$/,'$1 मिनट पहले'],
      [/^just now$/i,'अभी'],
      [/^(.+) away\s*[·-]\s*updated (.+)$/,'$1 दूर - अपडेट $2'],
      [/^(.+) m apart$/,'$1 मीटर की दूरी'],
      [/^(.+) km apart$/,'$1 किमी की दूरी'],
      [/^Pay (₹.+)$/,'$1 भुगतान करें'],
      [/^Booking #(\d+): (.+)$/,'बुकिंग #$1: $2'],
      [/^Receipt (.+)$/,'रसीद $1'],
      [/^(.+) workspace$/,'$1 कार्यक्षेत्र']
    ];
    for(const [rx,repl] of replacements){
      if(rx.test(out)){out=out.replace(rx,repl);break;}
    }
    return leading+out+trailing;
  }

  function shouldSkip(node){
    const p=node.parentElement;
    if(!p)return true;
    if(p.closest('script,style,textarea,.completion-otp-code,[data-no-translate]'))return true;
    /* Never rewrite text typed by users or human chat messages. */
    if(p.closest('.msg.user,.booking-chat .chat-body,.support-human-messages'))return true;
    /* Normal chat bodies stay untouched; AI assistant messages can be localized. */
    if(p.closest('.chat-body')&&!p.closest('.ai-chat .ai-msg'))return true;
    return false;
  }

  function translateTree(root=document.body){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(shouldSkip(node))continue;
      if(!originalText.has(node))originalText.set(node,node.nodeValue);
      const source=originalText.get(node);
      const value=language==='hi'?translateText(source):source;
      if(node.nodeValue!==value)node.nodeValue=value;
    }

    root.querySelectorAll?.('input[placeholder],textarea[placeholder],[title],[aria-label]').forEach(el=>{
      let saved=originalAttrs.get(el);
      if(!saved){saved={};originalAttrs.set(el,saved)}

      if(el.hasAttribute('placeholder')){
        if(saved.placeholder===undefined)saved.placeholder=el.getAttribute('placeholder')||'';
        const source=saved.placeholder;
        const value=language==='hi'?(placeholders[source]||translateText(source)):source;
        if(el.getAttribute('placeholder')!==value)el.setAttribute('placeholder',value);
      }

      if(el.hasAttribute('title')){
        if(saved.title===undefined)saved.title=el.getAttribute('title')||'';
        const source=saved.title;
        const value=language==='hi'?(titleText[source]||translateText(source)):source;
        if(el.getAttribute('title')!==value)el.setAttribute('title',value);
      }

      if(el.hasAttribute('aria-label')){
        if(saved.ariaLabel===undefined)saved.ariaLabel=el.getAttribute('aria-label')||'';
        const source=saved.ariaLabel;
        const value=language==='hi'?translateText(source):source;
        if(el.getAttribute('aria-label')!==value)el.setAttribute('aria-label',value);
      }
    });

    document.documentElement.lang=language==='hi'?'hi':'en';
    document.documentElement.dataset.sevahubLanguage=language;
  }

  function languageButton(){
    let btn=document.getElementById('platformLanguageButton');
    if(!btn){
      btn=document.createElement('button');
      btn.id='platformLanguageButton';
      btn.type='button';
      btn.className='theme platform-language-btn';
      btn.dataset.noTranslate='true';
      btn.addEventListener('click',()=>{
        language=language==='en'?'hi':'en';
        localStorage.setItem(LANGUAGE_KEY,language);
        updateLanguageButton();
        translateTree(document.body);
        /* Notify independent UI modules that read the language preference directly. */
        window.dispatchEvent(new CustomEvent('sevahub-language-changed',{detail:{language}}));
        if(typeof toast==='function')toast(language==='hi'?'प्लेटफ़ॉर्म भाषा: हिन्दी':'Platform language: English');
      });
    }
    return btn;
  }

  window.getSevaHubLanguage=()=>language;
  window.translateSevaHubUI=(root=document.body)=>translateTree(root);

  function updateLanguageButton(){
    const btn=document.getElementById('platformLanguageButton');
    if(!btn)return;
    btn.textContent=language==='hi'?'🌐 English':'🌐 हिन्दी';
    btn.title=language==='hi'?'Switch platform to English':'प्लेटफ़ॉर्म हिन्दी में करें';
  }

  function placeLanguageButton(){
    const btn=languageButton();
    const actions=document.querySelector('.nav .nav-actions');
    if(actions){
      btn.classList.remove('floating-language-btn');
      if(btn.parentElement!==actions)actions.insertBefore(btn,actions.firstChild);
    }else if(document.querySelector('.auth-home-shell')){
      btn.classList.add('floating-language-btn');
      if(btn.parentElement!==document.body)document.body.appendChild(btn);
    }
    updateLanguageButton();
  }

  function workerAI(){
    const box=document.getElementById('workerContent');
    if(!box)return;
    box.innerHTML=`<div class="card panel ai-panel worker-ai-panel">
      <div class="ai-hero"><div class="ai-orb">✦</div><div><span class="ai-kicker">SEVAHUB INTELLIGENCE</span><h2>✨ AI Service Assistant</h2><p class="muted">Describe a problem in normal language. I can identify the service, suggest a budget range, explain your booking, help with bargaining, and guide you to the right cooperative professional.</p></div></div>
      <div class="ai-prompts">
       <button class="ai-chip" onclick="useAIPrompt('Mere kitchen ka sink leak kar raha hai. Kaunsi service chahiye aur approx budget kya hoga?')">🔧 Diagnose my problem</button>
       <button class="ai-chip" onclick="useAIPrompt('Mujhe apni latest booking ka status samjhao.')">📋 Explain my booking</button>
       <button class="ai-chip" onclick="useAIPrompt('Fair bargaining price kaise decide karun?')">💰 Fair price</button>
       <button class="ai-chip" onclick="useAIPrompt('Mere area ke liye community service ka example batao.')">🏘️ Community help</button>
      </div>
      <div id="aiMessages" class="chat-body ai-chat"><div class="msg ai-msg"><b>Hi! 👋</b><br>Tell me what you need at home or in your community. For example: <i>“AC cooling nahi kar raha”</i>.</div></div>
      <form class="chat-input ai-input" onsubmit="aiChat(event)"><input id="aiInput" maxlength="2000" autocomplete="off" placeholder="Describe your service need..." required><button class="btn small" type="submit">Ask AI ✨</button></form>
      <div class="ai-disclaimer">AI gives guidance and estimates only. Final service price, worker selection and safety decisions remain with the user/cooperative.</div>
     </div>`;
    try{localStorage.setItem('sevahub_ui_route_v1',JSON.stringify({view:'worker-ai'}))}catch(e){}
    translateTree(box);
  }
  window.workerAI=workerAI;

  function addWorkerAIButton(){
    if(typeof state==='undefined'||state?.role!=='WORKER'||!state?.user)return;
    const content=document.getElementById('workerContent');
    const dashboard=content?.closest('.dashboard');
    if(!dashboard||document.getElementById('workerAiTabButton'))return;
    const home=[...dashboard.querySelectorAll('button')].find(b=>String(b.getAttribute('onclick')||'').includes('workerHome()'));
    const tabs=home?.parentElement;
    if(!tabs)return;
    const btn=document.createElement('button');
    btn.id='workerAiTabButton';
    btn.type='button';
    btn.className='btn secondary';
    btn.textContent='✨ AI Assistant';
    btn.addEventListener('click',workerAI);
    const earnings=[...tabs.children].find(el=>String(el.getAttribute?.('onclick')||'').includes('workerEarnings()'));
    if(earnings)tabs.insertBefore(btn,earnings);else tabs.appendChild(btn);
  }

  function restoreWorkerAIIfNeeded(){
    if(typeof state==='undefined'||state?.role!=='WORKER'||!state?.user)return;
    try{
      const route=JSON.parse(localStorage.getItem('sevahub_ui_route_v1')||'null');
      if(route?.view==='worker-ai'&&document.getElementById('workerContent')&&!document.querySelector('.worker-ai-panel')){
        workerAI();
      }
    }catch(e){}
  }

  function refreshEnhancements(){
    placeLanguageButton();
    addWorkerAIButton();
    translateTree(document.body);
    restoreWorkerAIIfNeeded();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;refreshEnhancements()});
  }

  const style=document.createElement('style');
  style.textContent=`
    .platform-language-btn{white-space:nowrap;font-weight:700;min-height:38px;padding:8px 12px;border-radius:12px}
    .floating-language-btn{position:fixed;z-index:9999;top:16px;right:16px;background:#fff;border:1px solid rgba(0,0,0,.12);box-shadow:0 8px 26px rgba(0,0,0,.12)}
    body.dark .floating-language-btn,.dark .floating-language-btn{background:#12191d;color:#fff;border-color:#344148}
    @media(max-width:650px){.platform-language-btn{padding:7px 9px;font-size:12px}.floating-language-btn{top:10px;right:10px}}
  `;
  document.head.appendChild(style);

  /* Observe the whole body, not only #app. Location/report modals, toasts and
     several overlays are appended directly to body. */
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(schedule,0);
})();

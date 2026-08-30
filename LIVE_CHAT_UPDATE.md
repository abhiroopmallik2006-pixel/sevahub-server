# Live Chat Update

- Added Socket.IO client to the frontend.
- Users and workers join their private `user-{id}` room after login.
- New booking messages are pushed instantly to the other participant.
- The sender sees their message immediately without refresh.
- Opening a booking chat loads history once, then receives live updates.
- AI logic/provider was intentionally left unchanged from the supplied v2 project.

Run with the Node/Express server (`npm install`, then `npm start`). Do not open `frontend/index.html` directly if you want live chat; Socket.IO requires the server.

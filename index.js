const express = require('express');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const fs = require('fs');
const app = express();
const port = 4000;

console.log('🟢 Starting Calendar API service...');

let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));
  console.log('✅ Service account loaded successfully');
} catch (err) {
  console.error('❌ Failed to load service-account.json:', err);
  process.exit(1);
}

app.get('/slots', async (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const signedJwt = jwt.sign(jwtPayload, serviceAccount.private_key, { algorithm: 'RS256' });
    console.log('🔐 JWT signed');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`
    });

    const tokenJson = await tokenRes.json();
    console.log('🎟️ Token response:', tokenJson);

    const access_token = tokenJson.access_token;
    if (!access_token) throw new Error('No access_token received');

    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=SPRINT-SLOT&singleEvents=true&orderBy=startTime&timeMin=${new Date().toISOString()}`;
    console.log('📡 Fetching events from:', calendarUrl);

    const eventsRes = await fetch(calendarUrl, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const eventsData = await eventsRes.json();
    console.log('📦 Event API result:', JSON.stringify(eventsData, null, 2));

    const choices = (eventsData.items || []).map(event => ({
      text: `${new Date(event.start.dateTime).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} – ${new Date(event.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(event.end.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      value: event.start.dateTime
    }));

    res.json({ choices });
  } catch (err) {
    console.error('❌ ERROR in /slots:', err);
    res.status(500).json({ error: 'Failed to retrieve slots.' });
  }
});

app.listen(port, () => {
  console.log(`✅ Calendar slot API running at http://localhost:${port}`);
});

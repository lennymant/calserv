const express = require('express');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const fs = require('fs');
const app = express();

// 🛠️ Configurable settings
const config = {
  port: 4000,
  calendarId: 'leon.calverley@door4.com', // You can replace with a specific calendar email
  queryTerm: 'SPRINT-SLOT',         // Leave blank to match all events
  daysRange: 30,          // How many days ahead to query
  timezone: 'en-GB',     // Locale for date formatting
  timeFormat: { hour: '2-digit', minute: '2-digit' },
  dateFormat: { weekday: 'long', day: 'numeric', month: 'long' }
};

// 🟢 Startup
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
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + config.daysRange);

    const jwtPayload = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const signedJwt = jwt.sign(jwtPayload, serviceAccount.private_key, { algorithm: 'RS256' });
    console.log('🔐 JWT signed');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`
    });

    const tokenJson = await tokenRes.json();
    const access_token = tokenJson.access_token;
    if (!access_token) throw new Error('No access_token received');
    console.log('🎟️ Access token retrieved');

    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${now.toISOString()}&timeMax=${end.toISOString()}${config.queryTerm ? `&q=${encodeURIComponent(config.queryTerm)}` : ''}`;
    console.log('📡 Fetching events from:', calendarUrl);

    const eventsRes = await fetch(calendarUrl, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const eventsData = await eventsRes.json();
    console.log('📦 Event API result:', JSON.stringify(eventsData, null, 2));

    const choices = (eventsData.items || []).map(event => {
        const start = event.start.dateTime || event.start.date;
        const end = event.end.dateTime || event.end.date;
      
        return {
          text: `${new Date(start).toLocaleDateString(config.timezone, config.dateFormat)} – ${new Date(start).toLocaleTimeString([], config.timeFormat)}–${new Date(end).toLocaleTimeString([], config.timeFormat)}`,
          value: start
        };
      });
      
    res.json({ choices });
  } catch (err) {
    console.error('❌ ERROR in /slots:', err);
    res.status(500).json({ error: 'Failed to retrieve slots.' });
  }
});

app.listen(config.port, () => {
  console.log(`✅ Calendar slot API running at http://localhost:${config.port}`);
});

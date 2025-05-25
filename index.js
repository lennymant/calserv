express = require('express');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const fs = require('fs');
const app = express();
const cors = require('cors');
app.use(cors({ origin: 'https://door4.com' }));
//parse json
app.use(express.json());

// Load dynamic values
let editableConfig = require('./config.json');

// Static values
const staticConfig = {
  port: 4000,
  timezone: 'en-GB',
  timeFormat: { hour: '2-digit', minute: '2-digit' },
  dateFormat: { weekday: 'long', day: 'numeric', month: 'long' }
};

// Merge both configs
const config = {
  ...staticConfig,
  ...editableConfig
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
    const start = new Date();
    start.setDate(now.getDate() + config.minOffsetDays); // start = min days ahead
    
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
    
    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${start.toISOString()}&timeMax=${end.toISOString()}${config.queryTerm ? `&q=${encodeURIComponent(config.queryTerm)}` : ''}`;
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

// publish config.json by GET request
app.get('/config', (req, res) => {
    res.json({
      config: {
        calendarId: config.calendarId,
        queryTerm: config.queryTerm,
        minOffsetDays: config.minOffsetDays,
        daysRange: config.daysRange
      }
    });
  });
  

// code to update config.json by POST request
app.post('/config/update', (req, res) => {
    const newEditable = req.body;
  
    try {
      fs.writeFileSync('./config.json', JSON.stringify(newEditable, null, 2));
      editableConfig = newEditable;
      Object.assign(config, newEditable); // Apply new settings immediately
      console.log('⚙️ Config updated:', config);
      res.status(200).send({ success: true });
    } catch (err) {
      console.error('❌ Failed to write config:', err);
      res.status(500).send({ error: 'Config update failed.' });
    }
  });
  


app.listen(config.port, () => {
  console.log(`✅ Calendar slot API running at http://localhost:${config.port}`);
});

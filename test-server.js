const express = require('express');
const app = express();

app.get('/calserv/', (req, res) => res.send(`✅ Alive — you hit ${req.path}`));

app.listen(4000, () => console.log('Listening on port 4000'));

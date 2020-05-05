var express = require('express');
var app = express();
var fs = require('fs');
var bodyParser = require('body-parser');
var cors = require('cors');
var https = require('https')
require('dotenv').config();

app.set('port', (process.env.PORT || 5000));
app.use(bodyParser.json());
app.use(cors());

if (process.env.NODE_ENV === 'development') {
  https.createServer({
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert')
  }, app)
  .listen(app.get('port'), function () {
    console.log('Local Server is running on port', app.get('port'));
  })
} else {
  app.listen(app.get('port'), function () {
    console.log('Live Server is running on port', app.get('port'));
  })
}

require('./matches.js')(app);
require('./bot.js')(app);

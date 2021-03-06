var pg = require('pg');
var crypto = require('crypto-js');
const url = require('url');
const params = url.parse(process.env.HEROKU_POSTGRESQL_GRAY_URL);
const auth = params.auth.split(':');

const dbConfig = {
    user: auth[0],
    password: auth[1],
    host: params.hostname,
    port: params.port,
    database: params.pathname.split('/')[1]
};
if (process.env.NODE_ENV !== 'development') {
    dbConfig.ssl = true;
}

module.exports = function (app) {
    app.post('/save-match', function (request, response) {
        var contextId = request.body.contextId;
        var signature = request.body.signature;
        var player = request.body.player;

        var isValid = validate(signature);

        if (isValid) {
            var data = getEncodedData(signature);
            saveMatchDataAsync(contextId, data)
                .then(function (result) {
                    response.json({ 'success': true });
                })
                .catch(function (err) {
                    response.json({ 'success': false, 'error': err });
                });
        } else {
            console.log('encoded data', getEncodedData(signature));
            response.json({ 'success': false, 'error': { message: 'invalid signature' } });
        }
    })

    app.post('/get-match', function (request, response) {
        var signature = request.body.signature;
        console.log('Signature: ', signature);

        var isValid = validate(signature);

        if (isValid) {
            console.log('Valid');
            var contextId = getEncodedData(signature);
            //console.log(contextId);

            loadMatchDataAsync(contextId)
                .then(function (result) {
                    if (result) {
                        console.log('Success');
                        response.json({ 'success': true, 'contextId': contextId, 'empty': false, 'data': result });
                    } else {
                        console.log('Success Not');
                        response.json({ 'success': true, 'contextId': contextId, 'empty': true });
                    }
                })
                .catch(function (err) {
                    console.log('Error');
                    response.json({ 'success': false, 'error': err });
                });
        } else {
            console.log('encoded data', getEncodedData(signature));
            response.json({ 'success': false, 'error': 'invalid signature' });
        }

    })

    app.post('/delete-match', function (request, response) {
        var contextId = request.body.contextId;
        var signature = request.body.signature;
        var isValid = validate(signature);

        if (isValid) {
            deleteMatchDataAsync(contextId)
                .then(function (result) {
                    if (result) {
                        console.log('Success');
                        response.json({ 'success': true, 'contextId': contextId, 'empty': false, 'data': result });
                    } else {
                        console.log('Success Not');
                        response.json({ 'success': true, 'contextId': contextId, 'empty': true });
                    }
                })
                .catch(function (err) {
                    console.log('Error');
                    response.json({ 'success': false, 'error': err });
                });
        } else {
            console.log('encoded data', getEncodedData(signature));
            response.json({ 'success': false, 'error': 'invalid signature' });
        }

    })

    saveMatchDataAsync = function (contextId, data) {
        return new Promise(function (resolve, reject) {
            var pool = new pg.Pool(dbConfig)
            pool.connect(function (err, client, done) {
                client.query('SELECT * FROM matches WHERE context = $1::text', [contextId], function (err, result) {
                    if (err) {
                        reject(err)
                    }

                    if (result.rows.length > 0) {
                        // Update current match
                        client.query('UPDATE matches SET data = $1::text WHERE context = $2::text', [data, contextId], function (upd_err, upd_result) {
                            done();
                            if (err) {
                                reject(err);
                            }
                            resolve();
                        });
                    }
                    else {
                        // Insert new match
                        client.query('INSERT INTO matches (context, data) VALUES ($1::text, $2::text)', [contextId, data], function (ist_err, ist_result) {
                            done();
                            if (err) {
                                reject(err);
                            }
                            resolve();
                        });
                    }
                });
            });
            // pool shutdown
            pool.end()
        });
    };

    loadMatchDataAsync = function (contextId) {
        return new Promise((resolve, reject) => {
            var pool = new pg.Pool(dbConfig)
            pool.connect((err, client, done) => {
                if (err) {
                    return console.error('Error acquiring client', err.stack)
                }
                client.query('SELECT * FROM matches WHERE context = $1::text', [contextId], function (err, result) {
                    done();
                    if (err) {
                        reject(err);
                    }

                    if (result && result.rows.length > 0) {
                        resolve(result.rows[0].data);
                    } else {
                        resolve();
                    }
                });
            });
            // pool shutdown
            pool.end()
        });
    };

    deleteMatchDataAsync = function (contextId) {
        console.log(contextId);

        return new Promise((resolve, reject) => {
            var pool = new pg.Pool(dbConfig)
            pool.connect((err, client, done) => {
                if (err) {
                    return console.error('Error acquiring client', err.stack)
                }
                client.query('DELETE FROM matches WHERE context = $1::text', [contextId], function (err, result) {
                    done();
                    if (err) {
                        reject(err);
                    }

                    console.log(result);

                    if (result) {
                        resolve(result);
                    } else {
                        resolve();
                    }
                });
            });
            // pool shutdown
            pool.end()
        });
    };

    validate = function (signedRequest) {
        // You can set USE_SECURE_COMMUNICATION to false
        // when doing local testing and using the FBInstant mock SDK
        if (process.env.USE_SECURE_COMMUNICATION == false) {
            console.log('Not validating signature')
            return true;
        }

        try {

            var firstpart = signedRequest.split('.')[0];
            var replaced = firstpart.replace(/-/g, '+').replace(/_/g, '/');
            var signature = crypto.enc.Base64.parse(replaced).toString();
            const dataHash = crypto.HmacSHA256(signedRequest.split('.')[1], process.env.APP_SECRET).toString();
            var isValid = signature === dataHash;
            if (!isValid) {
                console.log('Invalid signature');
                console.log('firstpart', firstpart);
                console.log('replaced ', replaced);
                console.log('Expected', dataHash);
                console.log('Actual', signature);
            }

            return isValid;
        } catch (e) {
            return false;
        }
    };

    getEncodedData = function (signedRequest) {
        // You can set USE_SECURE_COMMUNICATION to false
        // when doing local testing and using the FBInstant mock SDK
        if (process.env.USE_SECURE_COMMUNICATION === false) {
            return payload;
        }

        try {

            const json = crypto.enc.Base64.parse(signedRequest.split('.')[1]).toString(crypto.enc.Utf8);
            const encodedData = JSON.parse(json);

            /*
            Here's an example of encodedData can look like
            {
                algorithm: 'HMAC-SHA256',
                issued_at: 1520009634,
                player_id: '123456789',
                request_payload: 'backend_save'
            }
            */

            return encodedData.request_payload;
        } catch (e) {
            return null;
        }
    };
}

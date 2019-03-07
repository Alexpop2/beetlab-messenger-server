// MARK: - Require modules

const grpc = require('grpc');
const fs = require('fs');
const admin = require("firebase-admin");
const serviceAccount = require("../keys/beetlab-messages-firebase-adminsdk-msyfm-9f3b615df3.json");

// MARK: - Parsing user db

global.users = JSON.parse(fs.readFileSync('data/users.json', 'utf8'));

// MARK: - Init firebase admin SDK

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://beetlab-messages.firebaseio.com"
});

// MARK: - Authorization realisation

class Authorization {

    // MARK: - Creating instance and adding service

    constructor(server, protoLoader) {
        var PROTO_PATH = __dirname + '/../protos/authorization.proto';

        var packageDefinition = protoLoader.loadSync(
            PROTO_PATH,
            {keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });
        var authorizationProto = grpc.loadPackageDefinition(packageDefinition).authorizationservice;

        server.addService(authorizationProto.AuthorizationService.service, {
            authorize: this.authorize
        });
    }

    // MARK: - Authorizing

    authorize(call, callback) {

        admin.auth().verifyIdToken(call.request.data)
            .then(function(decodedToken) {
                admin.auth().getUser(decodedToken.uid)
                    .then(function(userRecord) {
                        require('crypto').randomBytes(48, function (err, buffer) {
                            var code = buffer.toString('hex');
                            var userData = userRecord.toJSON();
                            var users = JSON.parse(fs.readFileSync('data/users.json', 'utf8'));
                            let user = users.users.find((n) => n.login === userData.phoneNumber);
                            if(user) {
                                user.token = code
                            } else {
                                users.users.push({ login: userData.phoneNumber, token: code });
                            }
                            var jsonUsers = JSON.stringify(users);
                            fs.writeFileSync("data/users.json", jsonUsers, 'utf8');
                            global.users = users;
                            var result = { data: "Successful", token: { data: code } };
                            callback(null, result);
                        });
                    })
                    .catch(function(error) {
                        var result = { data: error };
                        callback(null, result);
                    });
            }).catch(function(error) {
                var result = { data: error };
                callback(null, result);
        });
    }
}

module.exports = Authorization;
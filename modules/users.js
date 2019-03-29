// MARK: - Require modules

const grpc = require('grpc');
const fs = require('fs');

// MARK: - Users realisation

class Users {

    // MARK: - Creating instance and adding service

    constructor(server, protoLoader) {
        var PROTO_PATH = __dirname + '/../protos/users.proto';

        var packageDefinition = protoLoader.loadSync(
            PROTO_PATH,
            {keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });
        var usersProto = grpc.loadPackageDefinition(packageDefinition).userservice;

        server.addService(usersProto.UserService.service, {
            getUserByPhone: this.getUserByPhone,
            getUserByName: this.getUserByName,
            getUserByID: this.getUserByID,
            getKnownRegisteredUsersByPhones: this.getKnownRegisteredUsersByPhones,
            getKnownRegisteredUsersByIds: this.getKnownRegisteredUsersByIds,
            setUserName: this.setUserName
        });
    }

    setUserName(call, callback) {
        let registeredUser = global.users.users.find((n) => n.token === call.request.token);
        if(registeredUser) {
            let userSameName = global.users.users.find((n) => n.name === call.request.data);
            if(userSameName) {
                callback({
                    code: grpc.status.ALREADY_EXISTS,
                    details: "This name is already used"
                })
            } else {
                if(call.request.data !== "") {
                    registeredUser.name = call.request.data;
                    var jsonUsers = JSON.stringify(global.users);
                    fs.writeFileSync("data/users.json", jsonUsers, 'utf8');
                    callback(null, null)
                } else {
                    callback({
                        code: grpc.status.CANCELLED,
                        details: "You cannot use this name"
                    })
                }
            }
        } else {
            callback({
                code: grpc.status.UNAUTHENTICATED,
                details: "Token check failed"
            })
        }
    }

    // MARK: -

    getUserByPhone(call, callback) {
        let connectedUser = global.connectedUsers.find((n) => n.token === call.request.token);
        if(connectedUser) {
            let registeredUser = global.users.users.find((n) => n.login === call.request.data);
            if(registeredUser) {
                let user = { id: registeredUser.id , name: registeredUser.name, phone: registeredUser.login };
                callback(null, user)
            } else {
                callback({
                    code: grpc.status.NOT_FOUND,
                    details: "User with this phone not registered"
                })
            }
        } else {
            callback({
                code: grpc.status.UNAUTHENTICATED,
                details: "Token check failed"
            })
        }
    }

    // MARK: -

    getUserByName(call, callback) {
        let connectedUser = global.connectedUsers.find((n) => n.token === call.request.token);
        if(connectedUser) {
            let registeredUser = global.users.users.find((n) => n.name === call.request.data);
            if(registeredUser) {
                let user = { id: registeredUser.id , name: registeredUser.name, phone: null };
                callback(null, user)
            } else {
                callback({
                    code: grpc.status.NOT_FOUND,
                    details: "User with this name not registered"
                })
            }
        } else {
            callback({
                code: grpc.status.UNAUTHENTICATED,
                details: "Token check failed"
            })
        }
    }

    // MARK: -

    getUserByID(call, callback) {
        let connectedUser = global.connectedUsers.find((n) => n.token === call.request.token);
        if(connectedUser) {
            let registeredUser = global.users.users.find((n) => n.id === call.request.data);
            if(registeredUser) {
                let user = { id: registeredUser.id , name: registeredUser.name, phone: null };
                callback(null, user)
            } else {
                callback({
                    code: grpc.status.NOT_FOUND,
                    details: "User with this id not registered"
                })
            }
        } else {
            callback({
                code: grpc.status.UNAUTHENTICATED,
                details: "Token check failed"
            })
        }
    }

    // MARK: -

    getKnownRegisteredUsersByPhones(call, callback) {
        let connectedUser = global.connectedUsers.find((n) => n.token === call.request.token);
        if(connectedUser) {
            var users = [];
            call.request.phones.forEach(function(phone) {
                let registeredUser = global.users.users.find((n) => n.login === phone);
                if(registeredUser) {
                    let user = { id: registeredUser.id , name: registeredUser.name, phone: phone };
                    users.push(user);
                }
            });
            callback(null, { users: users });
        } else {
            callback({
                code: grpc.status.UNAUTHENTICATED,
                details: "Token check failed"
            })
        }
    }

    // MARK: -

    getKnownRegisteredUsersByIds(call, callback) {
        let connectedUser = global.connectedUsers.find((n) => n.token === call.request.token);
        if(connectedUser) {
            var users = [];
            call.request.ids.forEach(function(id) {
                let registeredUser = global.users.users.find((n) => n.id === id);
                if(registeredUser) {
                    let user = { id: registeredUser.id , name: registeredUser.name, phone: "" };
                    users.push(user);
                }
            });
            callback(null, { users: users });
        } else {
            callback({
                code: grpc.status.UNAUTHENTICATED,
                details: "Token check failed"
            })
        }
    }
}

module.exports = Users;
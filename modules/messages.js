// MARK: - Require modules

const grpc = require('grpc');
const uuidv1 = require('uuid/v1');

// MARK: - Arrays for messages and connected users

let queueMessages = [];
let callbackQueueMessages = [];
let verifieingMessages = [];
let connectedUsers = [];

// MARK: - Realising message from queue after user connected (receiver)

function sendQueuedMessages(call, user) {
    var messages = queueMessages.filter((n) => n.receiver.id === user.id);
    messages = messages.sort((a,b) => a.date - b.date );
    messages.forEach((message) => {
        call.write(message);
        queueMessages = queueMessages.filter((n) => n.id !== message.id);

        let senderUser = connectedUsers.find((n) => n.id === message.sender.id);
        if(senderUser) {
            senderUser.cback.write(message);
            verifieingMessages.push(message);
        } else {
            callbackQueueMessages.push(message);
        }
    })
}

// MARK: - Realising message from queue after user connected (sender)

function sendCallbackQueuedMessages(call, user) {
    var messages = callbackQueueMessages.filter((n) => n.sender.id === user.id);
    messages = messages.sort((a,b) => a.date - b.date );
    messages.forEach((message) => {
        call.write(message);
        callbackQueueMessages = callbackQueueMessages.filter((n) => n.id !== message.id);
    })
}

// MARK: - Messages realisation

class Messages {

    // MARK: - Creating instance and adding service

    constructor(server, protoLoader) {
        var PROTO_PATH = __dirname + '/../protos/messages.proto';

        var packageDefinition = protoLoader.loadSync(
            PROTO_PATH,
            {keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });
        var messagesProto = grpc.loadPackageDefinition(packageDefinition).messageservice;

        server.addService(messagesProto.MessageService.service, {
            send: this.send,
            performMessageStream: this.performMessageStream,
            verifyGet: this.verifyGet
        });
    }

    // MARK: - Sending message

    send(call, callback) {
        let connectedUser = connectedUsers.find((n) => n.id === call.request.sender.id && n.token === call.request.token);
        if(connectedUser) {
            let registeredUser = global.users.users.find((n) => n.id === call.request.receiver.id);
            if(registeredUser) {
                callback(null, {});
                let receiverUser = connectedUsers.find((n) => n.id === call.request.receiver.id);
                if (receiverUser) {
                    var messageSending = {
                        id: uuidv1(),
                        text: call.request.text,
                        receiver: call.request.receiver,
                        token: "",
                        date: Date.now(),
                        state: 1,
                        sender: call.request.sender
                    };
                    if (receiverUser.cback) {
                        receiverUser.cback.write(messageSending);
                        connectedUser.cback.write(messageSending);
                        verifieingMessages.push(messageSending);
                    }
                } else {
                    var messageQueued = {
                        id: uuidv1(),
                        text: call.request.text,
                        receiver: call.request.receiver,
                        token: "",
                        date: Date.now(),
                        state: 0,
                        sender: call.request.sender
                    };
                    connectedUser.cback.write(messageQueued);
                    messageQueued.state = 1;
                    queueMessages.push(messageQueued);
                }
            } else {
                callback({
                    code: grpc.status.NOT_FOUND,
                    details: "Receiver user not registered"
                })
            }
        } else {
            callback({
                code: grpc.status.UNAUTHENTICATED,
                details: "Token check failed"
            })
        }
    }

    // MARK: - Performing bidirectional stream for client-server data exchange

    performMessageStream(call) {
        var login = "";
        var token = "";
        call.on('data', function(streamRequest) {
            var message = {};
            let user = global.users.users.find((n) => n.login === streamRequest.login && n.token === streamRequest.token);
            if (user) {
                let connectedUser = connectedUsers.find((n) => n.login === streamRequest.login);
                if(connectedUser) {
                    connectedUser.cback.end();
                    connectedUsers = connectedUsers.filter((n) => n.login !== streamRequest.login)
                }
                if (user.token === streamRequest.token) {
                    connectedUsers.push({id: user.id, login: user.login, token: user.token, cback: call});
                    console.log(`User Connected: ${user.login} - ${user.id}`);
                    login = user.login;
                    token = user.token;
                    message = {};
                    message.id = "-1";
                    message.text = "Connected";
                    message.token = streamRequest.token;
                    call.write(message);
                    sendQueuedMessages(call, user);
                    sendCallbackQueuedMessages(call, user);
                } else {
                    message = {};
                    message.id = "-1";
                    message.text = "Invalid token";
                    call.write(message);
                    call.end();
                }
            } else {
                message = {};
                message.id = "-1";
                message.text = "User not found";
                call.write(message);
                call.end();
            }
        });
        call.on('end', function() {
            connectedUsers = connectedUsers.filter((n) => n.login !== login || n.token !== token);
            console.log(`User Disconnected - ${login}`);
            call.end();
        });
    }

    // MARK: - Expected callback from client after sending message for changing message state

    verifyGet(call, callback) {
        let verifyMessage = verifieingMessages.find((n) => n.id === call.request.id);
        if(verifyMessage) {
            callback(null, {});
            verifyMessage.state = 2;
            let receiverUser = connectedUsers.find((n) => n.id === call.request.sender.id);
            if(receiverUser) {
                if(receiverUser.cback) {
                    receiverUser.cback.write(verifyMessage);
                }
            } else {
                callbackQueueMessages.push(verifyMessage);
            }
            verifieingMessages = verifieingMessages.filter((n) => n.id !== verifyMessage.id);
        } else {
            callback({
                code: grpc.status.NOT_FOUND,
                details: "Message with this ID not found for verify"
            })
        }
    }

}

module.exports = Messages;
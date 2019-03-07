// MARK: - Require modules

const grpc = require('grpc');
const uuidv1 = require('uuid/v1');

// MARK: - Arrays for messages and connected users

let queueMessages = [];
let callbackQueueMessages = [];
let verifieingMessages = [];
let connectedUsers = [];

// MARK: - Realising message from queue after user connected (receiver)

function sendQueuedMessages(call, streamRequest) {
    var messages = queueMessages.filter((n) => n.receiverId === streamRequest.login);
    messages = messages.sort((a,b) => a.date - b.date );
    messages.forEach((message) => {
        call.write(message);
        queueMessages = queueMessages.filter((n) => n.id !== message.id);

        let senderUser = connectedUsers.find((n) => n.login === message.senderId);
        if(senderUser) {
            senderUser.cback.write(message);
            verifieingMessages.push(message);
        } else {
            callbackQueueMessages.push(message);
        }
    })
}

// MARK: - Realising message from queue after user connected (sender)

function sendCallbackQueuedMessages(call, streamRequest) {
    var messages = callbackQueueMessages.filter((n) => n.senderId === streamRequest.login);
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
        let connectedUser = connectedUsers.find((n) => n.login === call.request.senderId && n.token === call.request.token);
        if(connectedUser) {
            let registeredUser = global.users.users.find((n) => n.login === call.request.receiverId);
            if(registeredUser) {
                callback(null, {});
                let receiverUser = connectedUsers.find((n) => n.login === call.request.receiverId);
                if (receiverUser) {
                    var messageSending = {
                        id: uuidv1(),
                        text: call.request.text,
                        receiverId: call.request.receiverId,
                        token: "",
                        date: Date.now().toString(),
                        state: 1,
                        senderId: call.request.senderId
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
                        receiverId: call.request.receiverId,
                        token: "",
                        date: Date.now().toString(),
                        state: 0,
                        senderId: call.request.senderId
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
                    connectedUsers.push({login: user.login, token: user.token, cback: call});
                    console.log(`User Connected - ${user.login}`);
                    login = user.login;
                    message = {};
                    message.id = "-1";
                    message.text = "Connected";
                    message.token = streamRequest.token;
                    call.write(message);
                    sendQueuedMessages(call, streamRequest);
                    sendCallbackQueuedMessages(call, streamRequest);
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
            connectedUsers = connectedUsers.filter((n) => n.login !== login);
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
            let receiverUser = connectedUsers.find((n) => n.login === call.request.senderId);
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
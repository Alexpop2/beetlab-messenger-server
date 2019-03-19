// MARK: - Require modules

const grpc = require('grpc');
const uuidv1 = require('uuid/v1');

// MARK: - Arrays for messages and connected users

let queueMessages = [];
let callbackQueueMessages = [];
let verifieingMessages = [];
global.connectedUsers = [];

// MARK: - Realising message from queue after user connected (receiver)

// TODO: Сообщения по запросу

function sendQueuedMessages(call, user) {
    var messages = queueMessages.filter((n) => n.receiver.id === user.id);
    messages = messages.sort((a,b) => a.date - b.date );
    messages.forEach((message) => {
        let messageQueued = {
            id: message.id,
            text: message.text,
            receiver: message.receiver,
            token: "",
            date: message.date,
            state: 1,
            sender: message.sender,
            code: 1000,
            phone: user.login
        };
        let messageCallbackQueued = {
            id: message.id,
            text: message.text,
            receiver: message.receiver,
            token: "",
            date: message.date,
            state: 1,
            sender: message.sender,
            code: 1000,
            phone: ""
        };
        call.write(messageQueued);
        queueMessages = queueMessages.filter((n) => n.id !== message.id);
        message.phone = "";
        let senderUser = global.connectedUsers.find((n) => n.id === message.sender.id);
        if(senderUser) {
            senderUser.cback.write(messageCallbackQueued);
            verifieingMessages.push(messageCallbackQueued);
        } else {
            callbackQueueMessages.push(messageCallbackQueued);
        }
    })
}

// MARK: - Realising message from queue after user connected (sender)

function sendCallbackQueuedMessages(call, user) {
    var messages = callbackQueueMessages.filter((n) => n.sender.id === user.id);
    messages = messages.sort((a,b) => a.date - b.date );
    messages.forEach((message) => {
        let verifiedMessage = {
            id: message.id,
            text: message.text,
            receiver: message.receiver,
            token: "",
            date: message.date,
            state: 2,
            sender: message.sender,
            code: 1000,
            phone: ""
        };
        call.write(verifiedMessage);
        //verifieingMessages.push(message);
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
        let connectedUser = global.connectedUsers.find((n) => n.login === call.request.phone && n.token === call.request.token);
        if(connectedUser) {
            let registeredUser = global.users.users.find((n) => n.id === call.request.receiver.id);
            if(registeredUser) {
                callback(null, {});
                let receiverUser = global.connectedUsers.find((n) => n.id === call.request.receiver.id);
                if (receiverUser) {
                    let messageSending = {
                        id: uuidv1(),
                        text: call.request.text,
                        receiver: call.request.receiver,
                        token: "",
                        date: Date.now(),
                        state: 1,
                        sender: { id: connectedUser.id, nickName: connectedUser.name },
                        code: 1000,
                        phone: registeredUser.login
                    };
                    if (receiverUser.cback) {
                        receiverUser.cback.write(messageSending);
                        messageSending.phone = "";
                        connectedUser.cback.write(messageSending);
                        verifieingMessages.push(messageSending);
                    }
                } else {
                    let messageQueued = {
                        id: uuidv1(),
                        text: call.request.text,
                        receiver: call.request.receiver,
                        token: "",
                        date: Date.now(),
                        state: 0,
                        sender: { id: connectedUser.id, nickName: connectedUser.name },
                        code: 1000,
                        phone: ""
                    };
                    connectedUser.cback.write(messageQueued);
                    messageQueued.phone = registeredUser.login;
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
                let connectedUser = global.connectedUsers.find((n) => n.login === streamRequest.login);
                if(connectedUser) {
                    connectedUser.cback.end();
                    global.connectedUsers = global.connectedUsers.filter((n) => n.login !== streamRequest.login)
                }
                if (user.token === streamRequest.token) {
                    global.connectedUsers.push({id: user.id, login: user.login, token: user.token, name: user.name, cback: call});
                    console.log(`User Connected: ${user.login} - ${user.id}`);
                    login = user.login;
                    token = user.token;
                    message = {};
                    message.id = "-1";
                    message.code = 200;
                    message.text = "Connected";
                    message.token = streamRequest.token;
                    call.write(message);
                    sendQueuedMessages(call, user);
                    sendCallbackQueuedMessages(call, user);
                } else {
                    // TODO: Never called. Split it when find user in global users only by login.
                    message = {};
                    message.id = "-1";
                    message.text = "Invalid token";
                    message.code = 403;
                    call.write(message);
                    call.end();
                }
            } else {
                message = {};
                message.id = "-1";
                message.text = "User not found";
                message.code = 404;
                call.write(message);
                call.end();
            }
        });
        call.on('end', function() {
            global.connectedUsers = global.connectedUsers.filter((n) => n.login !== login || n.token !== token);
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
            verifyMessage.code = 1000;
            let receiverUser = global.connectedUsers.find((n) => n.id === call.request.sender.id);
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
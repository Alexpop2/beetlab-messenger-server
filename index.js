// MARK: - Require modules

const Authorization = require("./modules/authorization");
const Messages = require("./modules/messages");
const Users = require("./modules/users");
const fs = require('fs');
const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');

// MARK: - Create grpc server instance

const server = new grpc.Server();

// MARK: - Creating modules instances

const authorization = new Authorization(server, protoLoader);
const messages = new Messages(server, protoLoader);
const users = new Users(server, protoLoader);

// MARK: - Starting server

let credentials = grpc.ServerCredentials.createSsl(fs.readFileSync('keys/ca.crt'), [{
    cert_chain: fs.readFileSync('keys/server.crt'),
    private_key: fs.readFileSync('keys/server.key')
}], true);

server.bind('0.0.0.0:50051', credentials);
console.log('Server running at http://127.0.0.1:50051');
server.start();

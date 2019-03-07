// MARK: - Require modules

const Authorization = require("./modules/authorization");
const Messages = require("./modules/messages");
const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');

// MARK: - Create grpc server instance

const server = new grpc.Server();

// MARK: - Creating modules instances

const authorization = new Authorization(server, protoLoader);
const messages = new Messages(server, protoLoader);

// MARK: - Starting server

server.bind('0.0.0.0:50051', grpc.ServerCredentials.createInsecure());
console.log('Server running at http://127.0.0.1:50051');
server.start();

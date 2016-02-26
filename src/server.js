import Express from 'express';
import HTTP from 'http';
import SocketIO from 'socket.io';
import SocketIOP2P from 'socket.io-p2p-server';

var app = Express();
app.get('/', function (req, res) {
  res.send('Hello World!');
});

var port = process.env.P2PT_PORT ? process.envt.P2PT_PORT : 3000;
var server = HTTP.Server(app);
var io = SocketIO(server);
io.use(SocketIOP2P.Server);

server.listen(port, function () {
  console.log('P2PT listening on port ' + port);
});

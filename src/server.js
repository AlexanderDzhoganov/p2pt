import HTTP from 'http'
import SocketIO from 'socket.io'
import Redis from 'redis'
import Crypto from 'crypto'

var redisClient = Redis.createClient()
redisClient.on('error', err => console.error(`Redis error: ${err}`))

var server = HTTP.createServer()

var port = process.env.P2PT_PORT ? process.envt.P2PT_PORT : 3000
server.listen(port, function () {
  console.log('P2PT listening on port ' + port)
});

var clients = {}

function p2pSocket (socket, next, room) {
  clients[socket.id] = socket

  console.log('Client connected (id=' + socket.id + ', room=' + room + ').')

  if (typeof room === 'object') {
    var connectedClients = socket.adapter.rooms[room.name]
  } else {
    var connectedClients = clients
  }
  socket.emit('numClients', Object.keys(connectedClients).length - 1)

  socket.on('disconnect', function () {
    delete clients[socket.id]
    Object.keys(connectedClients).forEach(function (clientId, i) {
      var client = clients[clientId]
      client.emit('peer-disconnect', {peerId: socket.id})
    })

    console.log('Client gone (id=' + socket.id + ', room=' + room + ').')
  })

  socket.on('offers', function (data) {
    // send offers to everyone in a given room
    Object.keys(connectedClients).forEach(function (clientId, i) {
      var client = clients[clientId]
      if (client !== socket) {
        var offerObj = data.offers[i]
        var emittedOffer = {fromPeerId: socket.id, offerId: offerObj.offerId, offer: offerObj.offer}
        console.log('Emitting offer: %s', JSON.stringify(emittedOffer))
        client.emit('offer', emittedOffer)
      }
    })
  })

  socket.on('peer-signal', function (data) {
    var toPeerId = data.toPeerId
    if(!toPeerId.startsWith('/#')) {
      toPeerId = '/#' + toPeerId
    }

    console.log('Signal peer id %s', toPeerId);
    var client = clients[toPeerId]
    client.emit('peer-signal', data)
  })
  typeof next === 'function' && next()
}


var io = SocketIO(server)
io.on('connection', socket => {
    socket.on('ask-token', () => {
        Crypto.randomBytes(16, (err, buf) => {
            if (err) {
                console.error(err)
                socket.emit('error', 'failed to create token')
                return
            }

            var token = buf.toString('hex')
            socket.join(token)
            p2pSocket(socket, null, token)
            socket.emit('set-token-ok', token)
        })
    })

    socket.on('set-token', token => {
        socket.join(token)
        p2pSocket(socket, null, token)
        socket.emit('set-token-ok', token)
    })
})

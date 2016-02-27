import HTTP from 'http'
import SocketIO from 'socket.io'
import Redis from 'redis'
import Crypto from 'crypto'

import _ from 'lodash'

var redisClient = Redis.createClient()
redisClient.on('error', err => console.error(`Redis error: ${err}`))

var server = HTTP.createServer()

var port = process.env.P2PT_PORT ? process.envt.P2PT_PORT : 3000
server.listen(port, function () {
  console.log('P2PT listening on port ' + port)
});

function p2pSocket (socket, otherSocket) {
  socket.emit('numClients', 1)

  socket.on('disconnect', function () {
    otherSocket.emit('peer-disconnect', {peerId: socket.id})
  })

  socket.on('offers', function (data) {
    var offerObj = data.offers[0];
    var emittedOffer = {
        fromPeerId: socket.id,
        offerId: offerObj.offerId,
        offer: offerObj.offer
    }

    otherSocket.emit('offer', emittedOffer)
  })

  socket.on('peer-signal', function (data) {
    otherSocket.emit('peer-signal', data)
  })
}

var clients = {}
var senders = {}
var receivers = {}

function initp2p(token) {
    var senderId = senders[token]
    var receiverId = receivers[token]

    if(!senderId || !receiverId) {
        return
    }

    var sender = clients[senderId]
    var receiver = clients[receiverId]

    if(!sender || !receiver) {
        return
    }

    p2pSocket(sender, receiver)
    p2pSocket(receiver, sender)
}

function generateToken() {
    return new Promise((resolve, reject) => {
        Crypto.randomBytes(16, (err, buf) => {
            if (err) {
                reject(err)
                return
            }

            resolve(buf.toString('hex'))
        })
    })
}

var io = SocketIO(server)
io.on('connection', socket => {
    clients[socket.id] = socket

    socket.on('disconnect', function () {
        delete clients[socket.id]
    })

    socket.on('ask-token', () => {
        generateToken().then(token => {
            senders[token] = socket.id
            socket.emit('set-token-ok', token)
        }).catch(err => {
            console.error(err)
            socket.disconnect()
        })
    })

    socket.on('set-token', token => {
        if(!token) {
            return
        }

        receivers[token] = socket.id
        initp2p(token)
        socket.emit('set-token-ok', token)
    })
})

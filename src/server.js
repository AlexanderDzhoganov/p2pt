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
    _.each(data.offers, offerObj => {
        var emittedOffer = {
            fromPeerId: socket.id,
            offerId: offerObj.offerId,
            offer: offerObj.offer
        }

        otherSocket.emit('offer', emittedOffer)
    })
  })

  socket.on('peer-signal', function (data) {
    if(!data.toPeerId.startsWith('/#')) {
        data.toPeerId = '/#' + data.toPeerId
    }

    otherSocket.emit('peer-signal', data)
  })
}

function initp2p(token) {
    return new Promise((resolve, reject) => {
        redisClient.get('sender_' + token, (err, senderId) => {
            if(err) {
                reject(err)
                return
            }

            redisClient.get('recp_' + token, (err, recipientId) => {
                if (err) {
                    reject(err)
                    return
                }

                var sender = io.sockets.connected[senderId]
                var receiver = io.sockets.connected[recipientId]

                if(!sender || !receiver) {
                    return
                }

                p2pSocket(sender, receiver)
                p2pSocket(receiver, sender)
                resolve()
            })
        })
    })
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
    socket.on('ask-token', () => {
        generateToken().then(token => {
            redisClient.set('sender_' + token, socket.id, (err) => {
                if (err) {
                    console.error(err)
                    return
                }

                socket.on('disconnect', () => {
                    redisClient.del('sender_' + token)
                    redisClient.del('recp_' + token)
                })

                socket.emit('set-token-ok', token)
            })
        }).catch(err => {
            console.error(err)
            socket.disconnect()
        })
    })

    socket.on('set-token', token => {
        if(!token) {
            return
        }

        redisClient.set('recp_' + token, socket.id, (err) => {
            if(err) {
                console.error(err)
                return
            }

            initp2p(token).then(function() {
                socket.emit('set-token-ok', token)
            }).catch(err => {
                console.error(err)
                socket.disconnect()
            })
        })
    })
})

import HTTP from 'http'
import SocketIO from 'socket.io'
import Redis from 'redis'
import Crypto from 'crypto'

import _ from 'lodash'

var redisClient = Redis.createClient()
redisClient.on('error', err => console.error(`Redis error: ${err}`))
redisClient.setMaxListeners(0)

var server = HTTP.createServer()

var port = process.env.P2PT_PORT ? process.env.P2PT_PORT : 3000
server.listen(port, function () {
  console.log('P2PT listening on port ' + port)
});

function doRateLimit(socket, next) {
    var address = socket.handshake.headers['x-forwarded-for']

    if(!address) {
        next && next()
        return
    }

    redisClient.get('addr_' + address, (err, val) => {
        if(val && val > 48) {
            socket.disconnect()
            return
        }

        redisClient.incr('addr_' + address)
        if(!val) {
            redisClient.expire('addr_' + address, 60)
        }

        next && next()
    })
}

function p2pSocket (socket, otherSocket) {
  socket.on('disconnect', function () {
    try {
        otherSocket.emit('peer-disconnect', { peerId: socket.id })
    } catch(err) {
        console.error(err)
    }
  })

  socket.on('offers', function (data) {
    doRateLimit(socket, () => {
        try {
            _.each(data.offers, offerObj => {
                var emittedOffer = {
                    fromPeerId: socket.id,
                    offerId: offerObj.offerId,
                    offer: offerObj.offer
                }

                otherSocket.emit('offer', emittedOffer)
            })
        } catch(err) {
            console.error(err)
        }
    })
  })

  socket.on('peer-signal', function (data) {
    doRateLimit(socket, () => {
        try {
            if(data.toPeerId && !data.toPeerId.startsWith('/#')) {
                data.toPeerId = '/#' + data.toPeerId
            }

            if(data.fromPeerId && !data.fromPeerId.startsWith('/#')) {
                data.fromPeerId = '/#' + data.fromPeerId
            }

            otherSocket.emit('peer-signal', data)
        } catch(err) {
            console.error(err)        
        }
    })
  })
}

function getSocketIdByKey(key) {
    return new Promise((resolve, reject) => {
        redisClient.get(key, (err, socketId) => {
            if(err) {
                reject(err)
                return
            }

            resolve(socketId)
        })
    })
}

function initp2p(token) {
    return getSocketIdByKey('sender_' + token)
    .then(function(senderId) {
        return getSocketIdByKey('recp_' + token)
        .then(function(recipientId) {
            var sender = io.sockets.connected[senderId]
            var receiver = io.sockets.connected[recipientId]

            if(!sender || !receiver) {
                return Promise.reject()
            }

            sender.emit('numClients', 1)
            p2pSocket(sender, receiver)
            p2pSocket(receiver, sender)
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

io.use((socket, next) => {
    doRateLimit(socket, next)
})

io.on('connection', socket => {
    socket.setMaxListeners(32)

    redisClient.get('transfersTotal', (err, total) => {
        if (err) {
            console.error(err)
            return
        }

        socket.emit('total-transfers', total)
    })

    socket.on('ask-token', () => {
        doRateLimit(socket, () => {
            generateToken().then(token => {
                redisClient.set('sender_' + token, socket.id, (err) => {
                    if (err) {
                        socket.disconnect()
                        console.error(err)
                        return
                    }

                    socket.on('disconnect', () => {
                        redisClient.del('sender_' + token)
                        redisClient.del('recp_' + token)
                    })

                    socket.emit('set-token-ok', token)
                    redisClient.incr('transfersTotal')
                    redisClient.get('transfersTotal', (err, total) => {
                        if (err) {
                            console.error(err)
                            return
                        }

                        io.emit('total-transfers', total)
                    })
                })
            }).catch(err => {
                console.error(err)
                socket.disconnect()
            })
        })
    })

    socket.on('set-token', token => {
        if(!token) {
            socket.disconnect()
            return
        }

        doRateLimit(socket, () => {
            redisClient.set('recp_' + token, socket.id, (err) => {
                if(err) {
                    console.error(err)
                    return
                }

                initp2p(token).then(function() {
                    socket.emit('set-token-ok', token)
                }).catch(err => {
                    socket.emit('set-token-invalid')
                })
            })
        })
    })
})

import HTTP from 'http'
import SocketIO from 'socket.io'
import SocketIOP2P from 'socket.io-p2p-server'
import Redis from 'redis'
import Crypto from 'crypto'

var redisClient = Redis.createClient()
redisClient.on('error', err => console.error(`Redis error: ${err}`))

var server = HTTP.createServer()

var port = process.env.P2PT_PORT ? process.envt.P2PT_PORT : 3000
server.listen(port, function () {
  console.log('P2PT listening on port ' + port)
});

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
            SocketIOP2P.Server(socket, null, token)
            socket.emit('set-token-ok', token)
        })
    })

    socket.on('set-token', token => {
        socket.join(token)
        SocketIOP2P.Server(socket, null, token)
        socket.emit('set-token-ok', token)
    })
})

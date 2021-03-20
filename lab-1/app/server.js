'use strict'
const { createLogger, format, transports } = require('winston')
const express = require('express')

const logger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD'T'HH:mm:ss.SSSZ"
    }),
    format.json()
  ),
  transports: [new transports.Console()]
});

var health = true;
var msg;

const app = express()
const port = process.env.PORT || 3001

app.get('/', (req, res, next) => {
  res.redirect('/checkout')
})

app.get('/healthz', (req, res, next) => {
  if(health) {
   res.json({ status: 'ok'})
   next()
 } else {
   next(new Error('Application unhealthy'))
 }
})

app.get('/bad-health', (req, res, next) => {
  health = false
  res.json({ status: 'App health set to \'false\''})
  next()
})

app.get('/checkout', (req, res, next) => {
  const paymentMethod = Math.round(Math.random() * 100) > 20 ? 'card' : 'paypal'
  const errorState =  Math.round(Math.random() * 100) > 20 ? 0 : 1

  var delay = Math.round(Math.random() * 100);
  if (errorState) {
    msg = 'RSAP0010E: Severe problem detected'
    next(new Error(msg))
   logger.error(msg, {"errCode": "RSAP0010E", "transactionTime": delay})
  } else {
    msg = 'RSAP0001I: Transaction OK'
   setTimeout(() => {
    res.json({ status: msg, transactionTime: delay + 'ms' })
    next()
   }, delay)
  logger.info(msg, {"errCode": "RSAP0001I", "transactionTime": delay})
  }
})


app.use((err, req, res, next) => {
  res.statusCode = 500
  res.json({ error: err.message })
  next()
})

const server = app.listen(port, () => {
  console.log(`btm-node.js app listening on port ${port}!`)
})

process.on('SIGTERM', () => {

  server.close((err) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    process.exit(0)
  })
})
import apm from 'elastic-apm-node'
import dotenv from 'dotenv'
dotenv.config()
apm.start({
  serviceName: 'api1',
  apiKey: process.env.ELASTIC_API_KEY,
  serverUrl: process.env.ELASTIC_SERVER_URL,
  environment: 'dev',
  captureBody: 'all',
  captureHeaders: true,
  captureErrorLogStackTraces: 'always',
  captureSpanStackTraces: true,
  transactionSampleRate: 1.0,
  spanFramesMinDuration: '5ms',
  apiRequestTime: '10s',
  apiRequestSize: '750kb',
  metricsInterval: '30s',
  logLevel: 'info',
  active: true,
  addFilter: (payload) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('APM Payload:', JSON.stringify(payload, null, 2))
    }
    return payload
  }
})
import Fastify from 'fastify'
const logFilePath = '/app/logs/app.log'
const fastify = Fastify({
  logger: {
    level: 'info',
  },
  keepAliveTimeout: 5000,
  bodyLimit: 1048576,
  trustProxy: true
})
fastify.addHook('onRequest', async (request, reply) => {
  const transaction = apm.currentTransaction
  if (transaction) {
    request.traceId = transaction.traceId || apm.currentTraceIds?.['trace.id']
    request.transactionId = transaction.id
  }
})
fastify.post('/submit-data', async function (request, reply) {
  const transaction = apm.startTransaction('submit-data-processing', 'request')
  try {
    if (transaction) {
      transaction.addLabels({
        endpoint: '/submit-data',
        method: 'POST',
        userId: request.body?.userId || 'anonymous',
        dataType: request.body?.type || 'unknown'
      })
      transaction.setCustomContext({
        requestBody: request.body,
        requestHeaders: request.headers,
        userAgent: request.headers['user-agent'],
        clientIp: request.ip
      })
    }
    const span = apm.startSpan('data-validation', 'custom')
    if (span) {
      span.addLabels({
        validationStatus: 'success',
        dataSize: JSON.stringify(request.body).length
      })
    }
    await new Promise(resolve => setTimeout(resolve, 100))
    if (span) span.end()
    const response = {
      status: 'success',
      message: 'Dados submetidos com sucesso',
      data: request.body,
      timestamp: new Date().toISOString(),
      traceId: request.traceId,
      transactionId: request.transactionId,
      processingTime: Date.now() - request.startTime
    }
    if (transaction) {
      transaction.setCustomContext({
        responseData: response,
        processingStatus: 'completed'
      })
      transaction.result = 'success'
    }
    console.log('Sending response:', response)
    reply.send(response)
    if (transaction) {
      transaction.end()
    }
  } catch (error) {
    if (transaction) {
      transaction.result = 'error'
      transaction.end()
    }
    apm.captureError(error, {
      request: request,
      custom: {
        endpoint: '/submit-data',
        requestBody: request.body
      }
    })
    reply.code(500).send({
      status: 'error',
      message: 'Erro interno do servidor',
      timestamp: new Date().toISOString(),
      traceId: request.traceId
    })
  }
})
fastify.addHook('onRequest', async (request, reply) => {
  request.startTime = Date.now()
})
fastify.addHook('onResponse', async (request, reply) => {
  const duration = Date.now() - request.startTime
  apm.setCustomContext({
    responseTime: duration,
    statusCode: reply.statusCode,
    endpoint: request.url,
    method: request.method
  })
  console.log(`${request.method} ${request.url} - ${reply.statusCode} - ${duration}ms`)
})
const start = async () => {
  try {
    await fastify.listen({ 
      port: process.env.PORT || 3000, 
      host: '0.0.0.0' 
    })
    console.log('Servidor rodando na porta', process.env.PORT || 3000)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
process.on('SIGTERM', async () => {
  console.log('Recebido SIGTERM, fechando servidor...')
  await fastify.close()
  process.exit(0)
})
process.on('SIGINT', async () => {
  console.log('Recebido SIGINT, fechando servidor...')
  await fastify.close()
  process.exit(0)
})
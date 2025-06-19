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

const gracefulShutdown = async (signal) => {
  console.log(`Recebido sinal ${signal}, iniciando shutdown graceful...`)
  try {
    await fastify.close()
    console.log('Fastify fechado com sucesso')
    await new Promise(resolve => setTimeout(resolve, 1000))
    console.log('Shutdown concluído')
    process.exit(0)
  } catch (error) {
    console.error('Erro durante shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  apm.captureError(error, { custom: { type: 'uncaughtException' } })
  setTimeout(() => process.exit(1), 1000)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  apm.captureError(new Error(`Unhandled Rejection: ${reason}`), {
    custom: { type: 'unhandledRejection', reason: String(reason) }
  })
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

fastify.setErrorHandler(async (error, request, reply) => {
  apm.captureError(error, {
    request: request,
    custom: {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.method === 'POST' ? request.body : undefined
    }
  })
  
  fastify.log.error({
    type: 'error',
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
    traceId: request.traceId,
  })
  
  reply.code(error.statusCode || 500).send({
    error: 'Internal Server Error',
    message: error.message,
    traceId: request.traceId
  })
})

fastify.get('/', function (request, reply) {
  reply.send({
    hello: 'world',
    timestamp: new Date().toISOString(),
    traceId: request.traceId,
    service: 'api1'
  })
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
        ...transaction.getCustomContext(),
        responseData: response
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

fastify.get('/test-error', function (request, reply) {
  const error = new Error('Erro de teste para demonstração do APM')
  error.statusCode = 500
  throw error
})

fastify.post('/test-error', function (request, reply) {
  const error = new Error('Erro de teste para demonstração do APM')
  error.statusCode = 500
  throw error
})

fastify.get('/health', function (request, reply) {
  reply.send({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    apm: {
      active: apm.isStarted(),
      traceId: apm.currentTransaction?.traceId || null
    }
  })
})

fastify.post('/test-post', async function (request, reply) {
  console.log('Test POST called')
  
  apm.setCustomContext({
    test: {
      endpoint: 'test-post',
      body: request.body,
      timestamp: new Date().toISOString()
    }
  })
  
  reply.send({
    message: 'Test POST successful',
    received: request.body,
    traceId: request.traceId
  })
})

fastify.get('/app2', async (request, reply) => {
  try {
   
    const response = await fetch('http://app2:3001/error')
    if (!response.ok) {
      throw new Error(`Erro ao acessar app2: ${response.statusText}`)
    }
    
    reply.send({
      message: 'Rota app2 acessada com sucesso',
      data: response.json(),
      traceId: request.traceId
    })
  } catch (error) {
    console.error('Erro ao acessar rota app2:', error)
    apm.captureError(error, { custom: { phase: 'app2_access' } })
    reply.code(500).send({ error: 'Erro ao acessar rota app2', traceId: request.traceId })
  }
})

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' })
    console.log('Servidor iniciado na porta 3000 com instrumentação APM completa')
    console.log('APM Status:', {
      active: apm.isStarted(),
      serviceName: apm.getServiceName(),
      serviceVersion: apm.getServiceVersion()
    })
  } catch (err) {
    console.error('Erro ao iniciar servidor:', err)
    apm.captureError(err, { custom: { phase: 'startup', critical: true } })
    setTimeout(() => process.exit(1), 1000)
  }
}

start()
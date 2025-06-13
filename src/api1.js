import apm from 'elastic-apm-node'

apm.start({
 serviceName: 'api1',
  serverUrl: 'http://apm-server:8200',
  secretToken: '',
  verifyServerCert: false,
  centralConfig: false // ← evita erro 503 do APM Server
})

import Fastify from 'fastify'
const logFilePath = '/app/logs/app.log'; 


const fastify = Fastify({
  logger: {
    level: 'info',
    file: logFilePath
  }
})



fastify.get('/', function (request, reply) {
  fastify.log.info({
    msg: 'Endpoint raiz acessado',
    traceId: request.traceId,
    transactionId: request.transactionId
  })
  
  reply.send({ 
    hello: 'world',
    timestamp: new Date().toISOString(),
    traceId: request.traceId
  })
})

fastify.get('/test-logs', function (request, reply) {
  const startTime = Date.now()
  
  fastify.log.info({
    msg: 'log a',
    traceId: request.traceId,
    transactionId: request.transactionId,
    step: 'inicio_processamento',
    timestamp: new Date().toISOString()
  })
  
  const processId = Math.random().toString(36).substring(7)
  const data = { 
    message: 'Dados processados com sucesso',
    processId: processId,
    items: [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' }
    ]
  }

  // LOG B
  fastify.log.info({
    msg: 'log b',
    traceId: request.traceId,
    transactionId: request.transactionId,
    step: 'fim_processamento',
    processId: processId,
    itemsProcessed: data.items.length,
    processingTime: Date.now() - startTime,
    timestamp: new Date().toISOString()
  })
  
  // Métricas customizadas para o APM
  
  reply.send({ 
    status: 'success',
    data: data,
    metadata: {
      processId: processId,
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      traceId: request.traceId
    }
  })
})

// Endpoint para testar erros e logs de erro
fastify.get('/test-error', function (request, reply) {
  fastify.log.error({
    msg: 'Erro simulado detectado',
    traceId: request.traceId,
    transactionId: request.transactionId,
    errorType: 'SimulatedError'
  })
  
  // Capturar erro no APM
  const error = new Error('Erro de teste para demonstração do APM')
  // error.code = 'TEST_ERROR'
  // apmAgent.captureError(error, {
  //   custom: {
  //     endpoint: '/test-error',
  //     simulatedError: true
  //   }
  // })
  
  apm.captureError(error, {
    custom: {
      endpoint: '/test-error',
      simulatedError: true,
      traceId: request.traceId,
      transactionId: request.transactionId
    }
  })
  reply.code(500).send({ 
    error: 'Internal Server Error',
    message: 'Erro simulado para teste',
    timestamp: new Date().toISOString(),
    traceId: request.traceId
  })
})

fastify.get('/performance', function (request, reply) {
  // const span = apmAgent.startSpan('custom-performance-check')
  
  fastify.log.info({
    msg: 'Iniciando verificação de performance',
    traceId: request.traceId,
    transactionId: request.transactionId
  })
  
  const start = Date.now()
  let result = 0
  for (let i = 0; i < 1000000; i++) {
    result += Math.random()
  }
  const duration = Date.now() - start
  
  if (span) {
    span.setLabel('operation', 'heavy-calculation')
    span.setLabel('iterations', 1000000)
    span.end()
  }
  
  fastify.log.info({
    msg: 'Performance check concluído',
    traceId: request.traceId,
    transactionId: request.transactionId,
    duration: duration,
    result: result
  })
  
  reply.send({
    status: 'completed',
    performance: {
      duration: duration,
      iterations: 1000000,
      result: result
    },
    timestamp: new Date().toISOString(),
    traceId: request.traceId
  })
})

fastify.get('/health', function (request, reply) {
  fastify.log.info({
    msg: 'Health check solicitado',
    traceId: request.traceId,
    transactionId: request.transactionId
  })
  
  reply.send({
    status: 'healthy',
    service: 'fastify-api',
    timestamp: new Date().toISOString(),
  })
})

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' })
    fastify.log.info('Servidor iniciado na porta 3000')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
import apm from 'elastic-apm-node'

// Configuração do APM otimizada
apm.start({
  serviceName: 'api1',
  serviceVersion: '1.0.0',
  environment: 'development',
  serverUrl: 'http://apm-server:8200',
  secretToken: '',
  verifyServerCert: false,
  centralConfig: false,
  
  // Configurações de captura mais específicas
  captureBody: 'all',
  captureHeaders: true,
  captureErrorLogStackTraces: 'always',
  captureSpanStackTraces: true,
  
  // Configurações de amostragem
  transactionSampleRate: 1.0,
  spanFramesMinDuration: '5ms',
  
  // Configurações de envio
  apiRequestTime: '10s',
  apiRequestSize: '750kb',
  metricsInterval: '30s',
  
  // Ativar logs de debug do APM (remover em produção)
  logLevel: 'debug',
  
  active: true,
  
  // Filtros personalizados para garantir captura de dados POST
  addFilter: (payload) => {
    // Log para debug - remover em produção
    console.log('APM Payload:', JSON.stringify(payload, null, 2))
    return payload
  }
})

import Fastify from 'fastify'
const logFilePath = '/app/logs/app.log'

const fastify = Fastify({
  logger: {
    level: 'info',
    file: logFilePath,
    sync: false,
    dest: logFilePath
  },
  keepAliveTimeout: 5000,
  bodyLimit: 1048576,
  trustProxy: true
})

// Graceful shutdown handler
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

// Tratar erros não capturados
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

// Hook 'onRequest' melhorado
fastify.addHook('onRequest', async (request, reply) => {
  const transaction = apm.currentTransaction
  if (transaction) {
    transaction.name = `${request.method} ${request.routerPath || request.url}`
    transaction.type = 'request'
    
    // Adicionar mais contexto
    request.apmTransaction = transaction
    request.traceId = transaction.traceId
    request.transactionId = transaction.id
    
    // Labels mais detalhados
    transaction.setLabel('http.method', request.method)
    transaction.setLabel('http.url', request.url)
    transaction.setLabel('user_agent', request.headers['user-agent'] || 'unknown')
    transaction.setLabel('content_type', request.headers['content-type'] || 'unknown')
    
    // Para requisições POST, adicionar informações específicas
    if (request.method === 'POST') {
      transaction.setLabel('has_body', true)
      transaction.setLabel('content_length', request.headers['content-length'] || '0')
    }
  }
})

// Hook preHandler para capturar body antes do processamento
fastify.addHook('preHandler', async (request, reply) => {
  const transaction = apm.currentTransaction
  if (transaction && request.method === 'POST' && request.body) {
    try {
      // Capturar informações do body sem logar dados sensíveis
      const bodyInfo = {
        hasBody: true,
        bodyKeys: typeof request.body === 'object' ? Object.keys(request.body) : [],
        bodySize: JSON.stringify(request.body).length
      }
      
      transaction.setLabel('body_info', JSON.stringify(bodyInfo))
      
      // Adicionar custom context com dados não-sensíveis
      apm.setCustomContext({
        request: {
          method: request.method,
          url: request.url,
          hasBody: true,
          bodyKeys: bodyInfo.bodyKeys,
          bodySize: bodyInfo.bodySize
        }
      })
      
    } catch (error) {
      console.error('Erro ao processar body no APM:', error)
    }
  }
})

// Hook 'onSend' para capturar detalhes da resposta
fastify.addHook('onSend', async (request, reply, payload) => {
  const transaction = apm.currentTransaction
  if (transaction) {
    transaction.setLabel('http.status_code', reply.statusCode)
    transaction.result = `HTTP ${String(reply.statusCode).charAt(0)}xx`
    
    if (reply.statusCode >= 400) {
      transaction.setLabel('error', true)
    } else {
      transaction.setLabel('success', true)
    }
    
    // Adicionar informações da resposta
    transaction.setLabel('response_size', payload ? payload.length || 0 : 0)
  }
  return payload
})

// Hook para capturar erros
fastify.setErrorHandler(async (error, request, reply) => {
  // Capturar erro com mais contexto
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
  console.log('POST /submit-data called with body:', request.body)
  
  // Criar span específico para o processamento
  const span = apm.startSpan('process-submitted-data', 'custom')
  
  try {
    if (span) {
      span.setLabel('operation', 'data_processing')
      span.setLabel('user.id', request.body?.userId || 'unknown')
      span.setLabel('data.keys', request.body ? Object.keys(request.body).join(',') : 'none')
    }
    
    // Adicionar contexto customizado para esta transação
    apm.setCustomContext({
      business: {
        operation: 'submit_data',
        userId: request.body?.userId,
        dataReceived: !!request.body,
        timestamp: new Date().toISOString()
      }
    })
    
    // Simular processamento
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Log para debug
    console.log('Data processed successfully for trace:', request.traceId)
    
  } catch (err) {
    console.error('Error processing data:', err)
    apm.captureError(err, {
      custom: {
        operation: 'submit_data_processing',
        userId: request.body?.userId
      }
    })
    throw err
  } finally {
    if (span) {
      span.end()
    }
  }

  const response = {
    status: 'success',
    message: 'Dados submetidos com sucesso',
    data: request.body,
    timestamp: new Date().toISOString(),
    traceId: request.traceId,
    transactionId: request.transactionId
  }
  
  console.log('Sending response:', response)
  reply.send(response)
})

fastify.get('/test-error', function (request, reply) {
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

// Rota adicional para testar captura de dados
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
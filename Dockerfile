# Use uma imagem base do Node.js
FROM node:20-alpine

# Define o diretório de trabalho na aplicação
WORKDIR /app

# Copia os arquivos package.json e package-lock.json (se existir)
COPY package*.json ./

# Instala as dependências da aplicação
# Cria o diretório de logs e define as permissões corretas
# O usuário 'node' é criado por padrão nas imagens node oficiais
RUN npm install && \
    mkdir -p /app/logs && \
    chown -R node:node /app/logs

# Copia o restante dos arquivos da aplicação (código fonte)
COPY ./src ./src

# Expõe a porta que a aplicação Fastify irá rodar
EXPOSE 3000

# Define o usuário para rodar a aplicação (melhor prática de segurança)
USER node

# Comando para iniciar a aplicação
CMD ["node", "src/api1.js"]